import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
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
import { ColeccionDetalleDialog } from '../../components/coleccion-detalle-dialog/coleccion-detalle-dialog';
import { ColeccionFormDialog } from '../../components/coleccion-form-dialog/coleccion-form-dialog';
import { ColeccionProductosDialog } from '../../components/coleccion-productos-dialog/coleccion-productos-dialog';
import { TemporadaDetalleDialog } from '../../components/temporada-detalle-dialog/temporada-detalle-dialog';
import { TemporadaFormDialog } from '../../components/temporada-form-dialog/temporada-form-dialog';
import { Coleccion, ColeccionDetalle } from '../../models/coleccion.model';
import { Temporada } from '../../models/temporada.model';
import { ColeccionesService } from '../../services/colecciones.service';
import { TemporadasService } from '../../services/temporadas.service';
import { traducirErrorTemporadasColecciones } from '../../utils/temporadas-colecciones-error.util';

/** Pestañas disponibles de la pantalla. */
type TabTemporadasColecciones = 'temporadas' | 'colecciones';

/** Valores posibles del filtro de estado. */
type FiltroEstado = 'todos' | 'activos' | 'inactivos';

/** Confirmación de habilitar/deshabilitar una temporada. */
interface ConfirmacionTemporada {
  temporada: Temporada;
  habilitar: boolean;
}

/** Confirmación de habilitar/deshabilitar una colección. */
interface ConfirmacionColeccion {
  coleccion: Coleccion;
  habilitar: boolean;
}

/** Destino del mensaje de error. */
type DestinoError =
  | 'temporadas'
  | 'temporadas-catalogo'
  | 'colecciones'
  | 'detalle-coleccion';

/**
 * Gestionar temporadas y colecciones (CU08) -
 * /admin/catalogo/temporadas-colecciones.
 *
 * Pantalla con dos pestañas:
 * - Temporadas: GET/POST/PATCH /temporadas y PATCH /temporadas/{id}/estado,
 *   con búsqueda y filtro de estado.
 * - Colecciones: GET/POST/PATCH /colecciones y PATCH /colecciones/{id}/estado,
 *   con búsqueda y filtros de temporada y estado. La asignación de productos se
 *   realiza en un diálogo con un único PUT /colecciones/{id}/productos.
 *
 * No existe DELETE físico: el estado se cambia con los endpoints /estado. Los
 * errores 400/404/409/422 se muestran con el `detail` real del backend.
 */
@Component({
  selector: 'app-temporadas-colecciones-page',
  imports: [
    ReactiveFormsModule,
    ConfirmDialog,
    TemporadaFormDialog,
    TemporadaDetalleDialog,
    ColeccionFormDialog,
    ColeccionDetalleDialog,
    ColeccionProductosDialog,
  ],
  styleUrls: [
    './temporadas-colecciones-page.css',
    './temporadas-colecciones-page-tabla.css',
  ],
  templateUrl: './temporadas-colecciones-page.html',
})
export class TemporadasColeccionesPage {
  private readonly temporadasService = inject(TemporadasService);
  private readonly coleccionesService = inject(ColeccionesService);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly tabActiva = signal<TabTemporadasColecciones>('temporadas');

  // ===== Temporadas (listado de la pestaña) =====
  readonly temporadas = signal<Temporada[]>([]);
  readonly cargandoTemporadas = signal(false);
  readonly errorTemporadas = signal<string | null>(null);
  readonly exitoTemporadas = signal<string | null>(null);
  readonly procesandoEstadoTemporada = signal(false);

  readonly filtrosTemporadas = new FormGroup({
    buscar: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(100)],
    }),
    estado: new FormControl<FiltroEstado>('todos', { nonNullable: true }),
  });

  // ===== Temporadas de catálogo (filtro y formulario de colección) =====
  readonly temporadasCatalogo = signal<Temporada[]>([]);
  readonly cargandoTemporadasCatalogo = signal(false);
  readonly errorTemporadasCatalogo = signal<string | null>(null);

  readonly temporadasActivas = computed(() =>
    this.temporadasCatalogo().filter((temporada) => temporada.estado),
  );

  readonly mapaTemporadas = computed(
    () =>
      new Map(
        this.temporadasCatalogo().map(
          (temporada) => [temporada.id, temporada.nombre] as const,
        ),
      ),
  );

  // ===== Colecciones =====
  readonly colecciones = signal<Coleccion[]>([]);
  readonly cargandoColecciones = signal(false);
  readonly errorColecciones = signal<string | null>(null);
  readonly exitoColecciones = signal<string | null>(null);
  readonly procesandoEstadoColeccion = signal(false);
  readonly coleccionesCargadas = signal(false);

  /** Total de productos asignados por colección (desde el detalle). */
  readonly totalesProductos = signal<ReadonlyMap<number, number>>(new Map());

  readonly filtrosColecciones = new FormGroup({
    buscar: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(150)],
    }),
    temporadaId: new FormControl<number | null>(null),
    estado: new FormControl<FiltroEstado>('todos', { nonNullable: true }),
  });

  // ===== Diálogos =====
  readonly dialogoTemporadaAbierto = signal(false);
  readonly temporadaEnForm = signal<Temporada | null>(null);
  readonly detalleTemporada = signal<Temporada | null>(null);
  readonly confirmacionTemporada = signal<ConfirmacionTemporada | null>(null);

  readonly dialogoColeccionAbierto = signal(false);
  readonly coleccionEnForm = signal<Coleccion | null>(null);
  readonly detalleColeccion = signal<ColeccionDetalle | null>(null);
  readonly cargandoDetalleColeccion = signal(false);
  readonly confirmacionColeccion = signal<ConfirmacionColeccion | null>(null);
  readonly coleccionProductos = signal<Coleccion | null>(null);

  constructor() {
    this.filtrosTemporadas.controls.estado.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.cargarTemporadas());
    this.filtrosColecciones.controls.estado.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.cargarColecciones());
    this.filtrosColecciones.controls.temporadaId.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.cargarColecciones());
  }

  ngOnInit(): void {
    this.cargarTemporadas();
    this.cargarTemporadasCatalogo();
  }

  // ===== Pestañas =====

  activarTab(tab: TabTemporadasColecciones): void {
    if (this.tabActiva() === tab) {
      return;
    }
    this.tabActiva.set(tab);
    if (tab === 'colecciones' && !this.coleccionesCargadas()) {
      this.cargarColecciones();
    }
  }

  esTabActiva(tab: TabTemporadasColecciones): boolean {
    return this.tabActiva() === tab;
  }

  // ===== Temporadas =====

  buscarTemporadas(): void {
    this.cargarTemporadas();
  }

  limpiarFiltrosTemporadas(): void {
    this.filtrosTemporadas.reset(
      { buscar: '', estado: 'todos' },
      { emitEvent: false },
    );
    this.cargarTemporadas();
  }

  tieneFiltrosTemporadas(): boolean {
    return this.filtrosTemporadas.controls.buscar.value.trim().length > 0;
  }

  private cargarTemporadas(): void {
    this.cargandoTemporadas.set(true);
    this.errorTemporadas.set(null);
    const valores = this.filtrosTemporadas.getRawValue();
    this.temporadasService
      .listarTemporadas({
        buscar: valores.buscar.trim() || undefined,
        estado: this.estadoAFiltro(valores.estado),
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (temporadas) => {
          this.cargandoTemporadas.set(false);
          this.temporadas.set(temporadas);
        },
        error: (error: unknown) => {
          this.cargandoTemporadas.set(false);
          this.temporadas.set([]);
          this.manejarError(error, 'temporadas');
        },
      });
  }

  private cargarTemporadasCatalogo(): void {
    this.cargandoTemporadasCatalogo.set(true);
    this.errorTemporadasCatalogo.set(null);
    this.temporadasService
      .listarTemporadas()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (temporadas) => {
          this.cargandoTemporadasCatalogo.set(false);
          this.temporadasCatalogo.set(temporadas);
          this.ajustarFiltroTemporada();
        },
        error: (error: unknown) => {
          this.cargandoTemporadasCatalogo.set(false);
          this.temporadasCatalogo.set([]);
          this.manejarError(error, 'temporadas-catalogo');
        },
      });
  }

  /** Si la temporada del filtro dejó de existir, se limpia. */
  private ajustarFiltroTemporada(): void {
    const seleccionada = this.filtrosColecciones.controls.temporadaId.value;
    if (seleccionada === null) {
      return;
    }
    const existe = this.temporadasCatalogo().some(
      (temporada) => temporada.id === seleccionada,
    );
    if (!existe) {
      this.filtrosColecciones.controls.temporadaId.setValue(null, {
        emitEvent: false,
      });
      this.cargarColecciones();
    }
  }

  abrirNuevaTemporada(): void {
    this.temporadaEnForm.set(null);
    this.dialogoTemporadaAbierto.set(true);
  }

  abrirEditarTemporada(temporada: Temporada): void {
    this.temporadaEnForm.set(temporada);
    this.dialogoTemporadaAbierto.set(true);
  }

  cerrarDialogoTemporada(): void {
    this.dialogoTemporadaAbierto.set(false);
    this.temporadaEnForm.set(null);
  }

  onTemporadaGuardada(temporada: Temporada): void {
    const editando = this.temporadaEnForm();
    this.cerrarDialogoTemporada();
    this.exitoTemporadas.set(
      editando === null
        ? `Temporada "${temporada.nombre}" creada correctamente.`
        : `Temporada "${temporada.nombre}" actualizada correctamente.`,
    );
    this.cargarTemporadas();
    this.cargarTemporadasCatalogo();
  }

  verTemporada(temporada: Temporada): void {
    this.detalleTemporada.set(temporada);
  }

  cerrarDetalleTemporada(): void {
    this.detalleTemporada.set(null);
  }

  solicitarCambioEstadoTemporada(temporada: Temporada): void {
    if (this.procesandoEstadoTemporada()) {
      return;
    }
    this.confirmacionTemporada.set({ temporada, habilitar: !temporada.estado });
  }

  cancelarCambioEstadoTemporada(): void {
    this.confirmacionTemporada.set(null);
  }

  confirmarCambioEstadoTemporada(): void {
    const pendiente = this.confirmacionTemporada();
    this.confirmacionTemporada.set(null);
    if (pendiente === null) {
      return;
    }

    const { temporada, habilitar } = pendiente;
    this.procesandoEstadoTemporada.set(true);
    this.errorTemporadas.set(null);
    this.exitoTemporadas.set(null);

    this.temporadasService
      .cambiarEstadoTemporada(temporada.id, habilitar)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (actualizada) => {
          this.procesandoEstadoTemporada.set(false);
          this.exitoTemporadas.set(
            `Se ${habilitar ? 'habilitó' : 'deshabilitó'} la temporada "${actualizada.nombre}".`,
          );
          this.cargarTemporadas();
          this.cargarTemporadasCatalogo();
        },
        error: (error: unknown) => {
          this.procesandoEstadoTemporada.set(false);
          this.manejarError(error, 'temporadas');
        },
      });
  }

  // ===== Colecciones =====

  buscarColecciones(): void {
    this.cargarColecciones();
  }

  limpiarFiltrosColecciones(): void {
    this.filtrosColecciones.reset(
      { buscar: '', temporadaId: null, estado: 'todos' },
      { emitEvent: false },
    );
    this.cargarColecciones();
  }

  tieneFiltrosColecciones(): boolean {
    const valores = this.filtrosColecciones.getRawValue();
    return Boolean(
      valores.buscar.trim() ||
        valores.temporadaId !== null ||
        valores.estado !== 'todos',
    );
  }

  private cargarColecciones(): void {
    this.cargandoColecciones.set(true);
    this.errorColecciones.set(null);
    const valores = this.filtrosColecciones.getRawValue();
    this.coleccionesService
      .listarColecciones({
        buscar: valores.buscar.trim() || undefined,
        temporada_id: valores.temporadaId ?? undefined,
        estado: this.estadoAFiltro(valores.estado),
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (colecciones) => {
          this.cargandoColecciones.set(false);
          this.colecciones.set(colecciones);
          this.coleccionesCargadas.set(true);
          this.cargarTotalesProductos(colecciones);
        },
        error: (error: unknown) => {
          this.cargandoColecciones.set(false);
          this.colecciones.set([]);
          this.manejarError(error, 'colecciones');
        },
      });
  }

  /**
   * El listado GET /colecciones no incluye `total_productos`; se obtiene del
   * detalle de cada colección en paralelo. Si un detalle falla, la colección
   * queda sin total (se muestra "—").
   */
  private cargarTotalesProductos(colecciones: Coleccion[]): void {
    if (colecciones.length === 0) {
      this.totalesProductos.set(new Map());
      return;
    }

    const peticiones = colecciones.map((coleccion) =>
      this.coleccionesService.obtenerColeccion(coleccion.id).pipe(
        map((detalle) => [coleccion.id, detalle.total_productos] as const),
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

  nombreTemporada(temporadaId: number): string {
    return this.mapaTemporadas().get(temporadaId) ?? `Temporada #${temporadaId}`;
  }

  contarProductos(coleccionId: number): number | null {
    return this.totalesProductos().get(coleccionId) ?? null;
  }

  abrirNuevaColeccion(): void {
    if (this.temporadasActivas().length === 0) {
      return;
    }
    this.coleccionEnForm.set(null);
    this.dialogoColeccionAbierto.set(true);
  }

  abrirEditarColeccion(coleccion: Coleccion): void {
    this.coleccionEnForm.set(coleccion);
    this.dialogoColeccionAbierto.set(true);
  }

  cerrarDialogoColeccion(): void {
    this.dialogoColeccionAbierto.set(false);
    this.coleccionEnForm.set(null);
  }

  onColeccionGuardada(coleccion: Coleccion): void {
    const editando = this.coleccionEnForm();
    this.cerrarDialogoColeccion();
    this.exitoColecciones.set(
      editando === null
        ? `Colección "${coleccion.nombre}" creada correctamente.`
        : `Colección "${coleccion.nombre}" actualizada correctamente.`,
    );
    this.cargarColecciones();
  }

  verColeccion(coleccion: Coleccion): void {
    this.cargandoDetalleColeccion.set(true);
    this.errorColecciones.set(null);
    this.coleccionesService
      .obtenerColeccion(coleccion.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (detalle) => {
          this.cargandoDetalleColeccion.set(false);
          this.detalleColeccion.set(detalle);
        },
        error: (error: unknown) => {
          this.cargandoDetalleColeccion.set(false);
          this.manejarError(error, 'detalle-coleccion');
        },
      });
  }

  cerrarDetalleColeccion(): void {
    this.detalleColeccion.set(null);
  }

  gestionarProductos(coleccion: Coleccion): void {
    this.coleccionProductos.set(coleccion);
  }

  cerrarProductos(): void {
    this.coleccionProductos.set(null);
    this.cargarColecciones();
  }

  onProductosGuardados(total: number): void {
    const coleccion = this.coleccionProductos();
    if (coleccion === null) {
      return;
    }
    this.totalesProductos.update((mapa) => {
      const siguiente = new Map(mapa);
      siguiente.set(coleccion.id, total);
      return siguiente;
    });
    this.exitoColecciones.set(
      `Colección "${coleccion.nombre}": ${total} producto(s) asignado(s).`,
    );
  }

  solicitarCambioEstadoColeccion(coleccion: Coleccion): void {
    if (this.procesandoEstadoColeccion()) {
      return;
    }
    this.confirmacionColeccion.set({
      coleccion,
      habilitar: !coleccion.estado,
    });
  }

  cancelarCambioEstadoColeccion(): void {
    this.confirmacionColeccion.set(null);
  }

  confirmarCambioEstadoColeccion(): void {
    const pendiente = this.confirmacionColeccion();
    this.confirmacionColeccion.set(null);
    if (pendiente === null) {
      return;
    }

    const { coleccion, habilitar } = pendiente;
    this.procesandoEstadoColeccion.set(true);
    this.errorColecciones.set(null);
    this.exitoColecciones.set(null);

    this.coleccionesService
      .cambiarEstadoColeccion(coleccion.id, habilitar)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (actualizada) => {
          this.procesandoEstadoColeccion.set(false);
          this.exitoColecciones.set(
            `Se ${habilitar ? 'habilitó' : 'deshabilitó'} la colección "${actualizada.nombre}".`,
          );
          this.cargarColecciones();
        },
        error: (error: unknown) => {
          this.procesandoEstadoColeccion.set(false);
          this.manejarError(error, 'colecciones');
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

  mensajeVacioTemporadas(): string {
    if (this.tieneFiltrosTemporadas()) {
      return 'No hay temporadas que coincidan con los filtros aplicados.';
    }
    return 'Todavía no hay temporadas registradas.';
  }

  mensajeVacioColecciones(): string {
    if (this.tieneFiltrosColecciones()) {
      return 'No hay colecciones que coincidan con los filtros aplicados.';
    }
    return 'Todavía no hay colecciones registradas.';
  }

  // ===== Errores =====

  private manejarError(error: unknown, destino: DestinoError): void {
    const traducido = traducirErrorTemporadasColecciones(error);
    if (traducido.sesionExpirada) {
      this.cerrarSesion();
      return;
    }
    switch (destino) {
      case 'temporadas':
        this.errorTemporadas.set(traducido.mensaje);
        return;
      case 'temporadas-catalogo':
        this.errorTemporadasCatalogo.set(traducido.mensaje);
        return;
      case 'colecciones':
        this.errorColecciones.set(traducido.mensaje);
        return;
      case 'detalle-coleccion':
        this.errorColecciones.set(traducido.mensaje);
        return;
    }
  }

  private cerrarSesion(): void {
    this.authService.cerrarSesion();
    void this.router.navigateByUrl('/auth/personal/login');
  }
}
