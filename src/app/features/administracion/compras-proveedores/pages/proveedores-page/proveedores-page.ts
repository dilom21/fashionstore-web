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
import { ProveedorDetalleDialog } from '../../components/proveedor-detalle-dialog/proveedor-detalle-dialog';
import { ProveedorFormDialog } from '../../components/proveedor-form-dialog/proveedor-form-dialog';
import { ProveedorProductosDialog } from '../../components/proveedor-productos-dialog/proveedor-productos-dialog';
import { Proveedor, ProveedorDetalle } from '../../models/proveedor.model';
import { ProveedoresService } from '../../services/proveedores.service';
import { traducirErrorProveedores } from '../../utils/proveedores-error.util';

/** Valores posibles del filtro de estado. */
type FiltroEstado = 'todos' | 'activos' | 'inactivos';

/** Confirmación de habilitar/deshabilitar un proveedor. */
interface ConfirmacionProveedor {
  proveedor: Proveedor;
  habilitar: boolean;
}

/**
 * Gestionar proveedores (CU11) - /admin/compras-proveedores/proveedores.
 *
 * CRUD lógico de proveedores con búsqueda (razón social, NIT o correo) y
 * filtro de estado. Acciones: Ver, Editar, Gestionar productos y
 * Habilitar/Deshabilitar.
 *
 * La gestión de productos se realiza en un diálogo con un único
 * PUT /proveedores/{id}/productos.
 *
 * No existe DELETE físico: el estado se cambia con PATCH /proveedores/{id}/estado.
 * El backend bloquea la deshabilitación (409) cuando existen órdenes de compra
 * en BORRADOR, ENVIADA o PARCIAL; el frontend muestra el `detail` real y no
 * replica esa regla. Los errores 403 (sin ELIMINAR) y 409 también se muestran
 * con el detalle real del backend.
 */
@Component({
  selector: 'app-proveedores-page',
  imports: [
    ReactiveFormsModule,
    ConfirmDialog,
    ProveedorFormDialog,
    ProveedorDetalleDialog,
    ProveedorProductosDialog,
  ],
  styleUrls: ['./proveedores-page.css', './proveedores-page-tabla.css'],
  templateUrl: './proveedores-page.html',
})
export class ProveedoresPage {
  private readonly proveedoresService = inject(ProveedoresService);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly proveedores = signal<Proveedor[]>([]);
  readonly cargando = signal(false);
  readonly error = signal<string | null>(null);
  readonly exito = signal<string | null>(null);
  readonly procesandoEstado = signal(false);
  readonly cargandoDetalle = signal(false);

  /** Total de productos asociados por proveedor (endpoint /productos). */
  readonly totalesProductos = signal<ReadonlyMap<number, number>>(new Map());

  readonly filtros = new FormGroup({
    buscar: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(150)],
    }),
    estado: new FormControl<FiltroEstado>('todos', { nonNullable: true }),
  });

  // ===== Diálogos =====
  readonly dialogoFormAbierto = signal(false);
  readonly proveedorEnForm = signal<Proveedor | null>(null);
  readonly detalleProveedor = signal<ProveedorDetalle | null>(null);
  readonly confirmacion = signal<ConfirmacionProveedor | null>(null);
  readonly proveedorProductos = signal<Proveedor | null>(null);

  constructor() {
    this.filtros.controls.estado.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.cargarProveedores());
  }

  ngOnInit(): void {
    this.cargarProveedores();
  }

  // ===== Listado y filtros =====

  buscar(): void {
    this.cargarProveedores();
  }

  limpiarFiltros(): void {
    this.filtros.reset({ buscar: '', estado: 'todos' }, { emitEvent: false });
    this.cargarProveedores();
  }

  tieneFiltros(): boolean {
    const valores = this.filtros.getRawValue();
    return Boolean(valores.buscar.trim() || valores.estado !== 'todos');
  }

  private cargarProveedores(): void {
    this.cargando.set(true);
    this.error.set(null);
    const valores = this.filtros.getRawValue();
    this.proveedoresService
      .listarProveedores({
        buscar: valores.buscar.trim() || undefined,
        estado: this.estadoAFiltro(valores.estado),
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (proveedores) => {
          this.cargando.set(false);
          this.proveedores.set(proveedores);
          this.cargarTotalesProductos(proveedores);
        },
        error: (error: unknown) => {
          this.cargando.set(false);
          this.proveedores.set([]);
          this.manejarError(error);
        },
      });
  }

  /**
   * El listado GET /proveedores no incluye el total de productos; se obtiene de
   * GET /proveedores/{id}/productos en paralelo. Si un detalle falla, el
   * proveedor queda sin total (se muestra "—").
   */
  private cargarTotalesProductos(proveedores: Proveedor[]): void {
    if (proveedores.length === 0) {
      this.totalesProductos.set(new Map());
      return;
    }

    const peticiones = proveedores.map((proveedor) =>
      this.proveedoresService.listarProductos(proveedor.id).pipe(
        map((respuesta) => [proveedor.id, respuesta.total] as const),
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

  contarProductos(proveedorId: number): number | null {
    return this.totalesProductos().get(proveedorId) ?? null;
  }

  mensajeVacio(): string {
    if (this.tieneFiltros()) {
      return 'No hay proveedores que coincidan con los filtros aplicados.';
    }
    return 'Todavía no hay proveedores registrados.';
  }

  // ===== Alta y edición =====

  abrirNueva(): void {
    this.proveedorEnForm.set(null);
    this.dialogoFormAbierto.set(true);
  }

  abrirEditar(proveedor: Proveedor): void {
    this.proveedorEnForm.set(proveedor);
    this.dialogoFormAbierto.set(true);
  }

  cerrarForm(): void {
    this.dialogoFormAbierto.set(false);
    this.proveedorEnForm.set(null);
  }

  onProveedorGuardado(proveedor: Proveedor): void {
    const editando = this.proveedorEnForm();
    this.cerrarForm();
    this.exito.set(
      editando === null
        ? `Proveedor "${proveedor.razon_social}" creado correctamente.`
        : `Proveedor "${proveedor.razon_social}" actualizado correctamente.`,
    );
    this.cargarProveedores();
  }

  // ===== Detalle =====

  verProveedor(proveedor: Proveedor): void {
    this.cargandoDetalle.set(true);
    this.error.set(null);
    this.proveedoresService
      .obtenerProveedor(proveedor.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (detalle) => {
          this.cargandoDetalle.set(false);
          this.detalleProveedor.set(detalle);
        },
        error: (error: unknown) => {
          this.cargandoDetalle.set(false);
          this.manejarError(error);
        },
      });
  }

  cerrarDetalle(): void {
    this.detalleProveedor.set(null);
  }

  // ===== Productos asociados =====

  gestionarProductos(proveedor: Proveedor): void {
    this.proveedorProductos.set(proveedor);
  }

  cerrarProductos(): void {
    this.proveedorProductos.set(null);
  }

  onProductosGuardados(total: number): void {
    const proveedor = this.proveedorProductos();
    if (proveedor === null) {
      return;
    }
    this.totalesProductos.update((mapa) => {
      const siguiente = new Map(mapa);
      siguiente.set(proveedor.id, total);
      return siguiente;
    });
    this.exito.set(
      `Proveedor "${proveedor.razon_social}": ${total} producto(s) asociado(s).`,
    );
  }

  // ===== Habilitar / deshabilitar =====

  solicitarCambioEstado(proveedor: Proveedor): void {
    if (this.procesandoEstado()) {
      return;
    }
    this.confirmacion.set({ proveedor, habilitar: !proveedor.estado });
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

    const { proveedor, habilitar } = pendiente;
    this.procesandoEstado.set(true);
    this.error.set(null);
    this.exito.set(null);

    this.proveedoresService
      .cambiarEstadoProveedor(proveedor.id, habilitar)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (actualizado) => {
          this.procesandoEstado.set(false);
          this.exito.set(
            `Se ${habilitar ? 'habilitó' : 'deshabilitó'} el proveedor "${actualizado.razon_social}".`,
          );
          this.cargarProveedores();
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
    const traducido = traducirErrorProveedores(error);
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
