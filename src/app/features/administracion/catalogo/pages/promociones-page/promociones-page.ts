import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { Router } from '@angular/router';
import { catchError, forkJoin, map, of } from 'rxjs';

import { AuthService } from '../../../../autenticacion-seguridad/auth/services/auth.service';
import { ConfirmDialog } from '../../../../../shared/components/confirm-dialog/confirm-dialog';
import { PromocionDetalleDialog } from '../../components/promocion-detalle-dialog/promocion-detalle-dialog';
import { PromocionFormDialog } from '../../components/promocion-form-dialog/promocion-form-dialog';
import { PromocionProductosDialog } from '../../components/promocion-productos-dialog/promocion-productos-dialog';
import { Promocion, TipoDescuento } from '../../models/promocion.model';
import { PromocionesService } from '../../services/promociones.service';
import { traducirErrorPromociones } from '../../utils/promociones-error.util';
import {
  VigenciaPromocion,
  calcularVigencia,
  claseVigencia,
  formatearFechaHora,
  formatearValorDescuento,
} from '../../utils/promociones.util';

/** Valores posibles del filtro de estado. */
type FiltroEstado = 'todos' | 'activos' | 'inactivos';

/** Valores posibles del filtro de tipo de descuento. */
type FiltroTipo = 'todos' | TipoDescuento;

/** Confirmación de habilitar/deshabilitar una promoción. */
interface ConfirmacionPromocion {
  promocion: Promocion;
  habilitar: boolean;
}

/**
 * Gestionar promociones (CU10) - /admin/catalogo/promociones.
 *
 * CRUD lógico de promociones con búsqueda y filtros de estado y tipo de
 * descuento. La vigencia (Próxima/Vigente/Vencida/Deshabilitada) es un cálculo
 * exclusivamente visual: nunca modifica el estado en el backend.
 *
 * La asociación de productos se realiza en un diálogo con un único
 * PUT /promociones/{id}/productos.
 *
 * No existe DELETE físico: el estado se cambia con PATCH /promociones/{id}/estado.
 * Los errores 400/404/409/422 muestran el `detail` real del backend.
 */
@Component({
  selector: 'app-promociones-page',
  imports: [
    ReactiveFormsModule,
    ConfirmDialog,
    PromocionFormDialog,
    PromocionDetalleDialog,
    PromocionProductosDialog,
  ],
  styleUrls: ['./promociones-page.css', './promociones-page-tabla.css'],
  templateUrl: './promociones-page.html',
})
export class PromocionesPage {
  private readonly promocionesService = inject(PromocionesService);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly promociones = signal<Promocion[]>([]);
  readonly cargando = signal(false);
  readonly error = signal<string | null>(null);
  readonly exito = signal<string | null>(null);
  readonly procesandoEstado = signal(false);
  readonly cargandoDetalle = signal(false);

  /** Total de productos asociados por promoción (desde el endpoint /productos). */
  readonly totalesProductos = signal<ReadonlyMap<number, number>>(new Map());

  readonly filtros = new FormGroup({
    buscar: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(150)],
    }),
    estado: new FormControl<FiltroEstado>('todos', { nonNullable: true }),
    tipoDescuento: new FormControl<FiltroTipo>('todos', { nonNullable: true }),
  });

  // ===== Diálogos =====
  readonly dialogoFormAbierto = signal(false);
  readonly promocionEnForm = signal<Promocion | null>(null);
  readonly detallePromocion = signal<Promocion | null>(null);
  readonly confirmacion = signal<ConfirmacionPromocion | null>(null);
  readonly promocionProductos = signal<Promocion | null>(null);

  constructor() {
    this.filtros.controls.estado.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.cargarPromociones());
    this.filtros.controls.tipoDescuento.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.cargarPromociones());
  }

  ngOnInit(): void {
    this.cargarPromociones();
  }

  // ===== Listado y filtros =====

  buscar(): void {
    this.cargarPromociones();
  }

  limpiarFiltros(): void {
    this.filtros.reset(
      { buscar: '', estado: 'todos', tipoDescuento: 'todos' },
      { emitEvent: false },
    );
    this.cargarPromociones();
  }

  tieneFiltros(): boolean {
    const valores = this.filtros.getRawValue();
    return Boolean(
      valores.buscar.trim() ||
        valores.estado !== 'todos' ||
        valores.tipoDescuento !== 'todos',
    );
  }

  private cargarPromociones(): void {
    this.cargando.set(true);
    this.error.set(null);
    const valores = this.filtros.getRawValue();
    this.promocionesService
      .listarPromociones({
        buscar: valores.buscar.trim() || undefined,
        estado: this.estadoAFiltro(valores.estado),
        tipo_descuento:
          valores.tipoDescuento === 'todos' ? undefined : valores.tipoDescuento,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (promociones) => {
          this.cargando.set(false);
          this.promociones.set(promociones);
          this.cargarTotalesProductos(promociones);
        },
        error: (error: unknown) => {
          this.cargando.set(false);
          this.promociones.set([]);
          this.manejarError(error);
        },
      });
  }

  /**
   * El listado GET /promociones no incluye el total de productos; se obtiene de
   * GET /promociones/{id}/productos en paralelo. Si un detalle falla, la
   * promoción queda sin total (se muestra "—").
   */
  private cargarTotalesProductos(promociones: Promocion[]): void {
    if (promociones.length === 0) {
      this.totalesProductos.set(new Map());
      return;
    }

    const peticiones = promociones.map((promocion) =>
      this.promocionesService.listarProductos(promocion.id).pipe(
        map((respuesta) => [promocion.id, respuesta.total] as const),
        catchError(() => of(null)),
      ),
    );

    forkJoin(peticiones)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((resultados) => {
        const mapa = new Map<number, number>();
        for (const resultado of resultados) {
          if (resultado !== null) {
            mapa.set(resultado[0], resultado[1]);
          }
        }
        this.totalesProductos.set(mapa);
      });
  }

  contarProductos(promocionId: number): number | null {
    return this.totalesProductos().get(promocionId) ?? null;
  }

  mensajeVacio(): string {
    if (this.tieneFiltros()) {
      return 'No hay promociones que coincidan con los filtros aplicados.';
    }
    return 'Todavía no hay promociones registradas.';
  }

  // ===== Presentación =====

  vigenciaDe(promocion: Promocion): VigenciaPromocion {
    return calcularVigencia(promocion);
  }

  claseVigenciaDe(promocion: Promocion): string {
    return claseVigencia(this.vigenciaDe(promocion));
  }

  valorDe(promocion: Promocion): string {
    return formatearValorDescuento(
      promocion.tipo_descuento,
      promocion.valor_descuento,
    );
  }

  tipoDe(promocion: Promocion): string {
    return promocion.tipo_descuento === 'PORCENTAJE' ? 'Porcentaje' : 'Monto';
  }

  fechaDe(valor: string): string {
    return formatearFechaHora(valor);
  }

  // ===== Alta y edición =====

  abrirNueva(): void {
    this.promocionEnForm.set(null);
    this.dialogoFormAbierto.set(true);
  }

  abrirEditar(promocion: Promocion): void {
    this.promocionEnForm.set(promocion);
    this.dialogoFormAbierto.set(true);
  }

  cerrarForm(): void {
    this.dialogoFormAbierto.set(false);
    this.promocionEnForm.set(null);
  }

  onPromocionGuardada(promocion: Promocion): void {
    const editando = this.promocionEnForm();
    this.cerrarForm();
    this.exito.set(
      editando === null
        ? `Promoción "${promocion.nombre}" creada correctamente.`
        : `Promoción "${promocion.nombre}" actualizada correctamente.`,
    );
    this.cargarPromociones();
  }

  // ===== Detalle =====

  verPromocion(promocion: Promocion): void {
    this.cargandoDetalle.set(true);
    this.error.set(null);
    this.promocionesService
      .obtenerPromocion(promocion.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (detalle) => {
          this.cargandoDetalle.set(false);
          this.detallePromocion.set(detalle);
        },
        error: (error: unknown) => {
          this.cargandoDetalle.set(false);
          this.manejarError(error);
        },
      });
  }

  cerrarDetalle(): void {
    this.detallePromocion.set(null);
  }

  // ===== Productos asociados =====

  gestionarProductos(promocion: Promocion): void {
    this.promocionProductos.set(promocion);
  }

  cerrarProductos(): void {
    this.promocionProductos.set(null);
  }

  onProductosGuardados(total: number): void {
    const promocion = this.promocionProductos();
    if (promocion === null) {
      return;
    }
    this.totalesProductos.update((mapa) => {
      const siguiente = new Map(mapa);
      siguiente.set(promocion.id, total);
      return siguiente;
    });
    this.exito.set(
      `Promoción "${promocion.nombre}": ${total} producto(s) asociado(s).`,
    );
  }

  // ===== Habilitar / deshabilitar =====

  solicitarCambioEstado(promocion: Promocion): void {
    if (this.procesandoEstado()) {
      return;
    }
    this.confirmacion.set({ promocion, habilitar: !promocion.estado });
  }

  cancelarCambioEstado(): void {
    this.confirmacion.set(null);
  }

  confirmarCambioEstado(): void {
    const pendiente = this.confirmacion();
    this.confirmacion.set(null);
    if (pendiente === null) {
      return;
    }

    const { promocion, habilitar } = pendiente;
    this.procesandoEstado.set(true);
    this.error.set(null);
    this.exito.set(null);

    this.promocionesService
      .cambiarEstadoPromocion(promocion.id, habilitar)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (actualizada) => {
          this.procesandoEstado.set(false);
          this.exito.set(
            `Se ${habilitar ? 'habilitó' : 'deshabilitó'} la promoción "${actualizada.nombre}".`,
          );
          this.cargarPromociones();
        },
        error: (error: unknown) => {
          this.procesandoEstado.set(false);
          this.manejarError(error);
        },
      });
  }

  // ===== Utilidades =====

  private estadoAFiltro(estado: FiltroEstado): boolean | undefined {
    if (estado === 'activos') {
      return true;
    }
    if (estado === 'inactivos') {
      return false;
    }
    return undefined;
  }

  private manejarError(error: unknown): void {
    const traducido = traducirErrorPromociones(error);
    if (traducido.sesionExpirada) {
      this.cerrarSesion();
      return;
    }
    this.error.set(traducido.mensaje);
  }

  private cerrarSesion(): void {
    this.authService.cerrarSesion();
    void this.router.navigateByUrl('/auth/personal/login');
  }
}
