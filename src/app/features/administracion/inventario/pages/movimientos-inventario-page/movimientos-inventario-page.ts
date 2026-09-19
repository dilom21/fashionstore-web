import { HttpErrorResponse } from '@angular/common/http';
import { DatePipe } from '@angular/common';
import {
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { Router } from '@angular/router';
import { debounceTime, distinctUntilChanged } from 'rxjs';

import { AuthService } from '../../../../autenticacion-seguridad/auth/services/auth.service';
import {
  FiltroOpcion,
  SucursalFiltro,
} from '../../../../catalogo/models/catalogo-filtros.model';
import { CatalogoService } from '../../../../catalogo/services/catalogo.service';
import { MovimientoDetalleDialog } from '../../components/movimiento-detalle-dialog/movimiento-detalle-dialog';
import { MovimientoBadge } from '../../components/movimiento-badge/movimiento-badge';
import {
  MovimientoInventarioItem,
  TipoMovimientoInventario,
} from '../../models/movimiento-inventario.model';
import { MovimientoInventarioService } from '../../services/movimiento-inventario.service';
import { SucursalesService } from '../../services/sucursales.service';
import { traducirErrorInventario } from '../../utils/http-error.util';

/** Registros por página del kardex (CU14: 10 registros). */
const LIMITE_MOVIMIENTOS = 10;

/** Milisegundos de espera de la búsqueda por producto (evita una petición por tecla). */
const DEBOUNCE_PRODUCTO_MS = 350;

/** Tipos de movimiento del backend (enum TipoMovimiento) con su etiqueta. */
const TIPOS_MOVIMIENTO: ReadonlyArray<{
  valor: TipoMovimientoInventario;
  label: string;
}> = [
  { valor: 'ENTRADA_COMPRA', label: 'Entrada por compra' },
  { valor: 'SALIDA_VENTA', label: 'Salida por venta' },
  { valor: 'RESERVA', label: 'Reserva' },
  { valor: 'LIBERACION_RESERVA', label: 'Liberación de reserva' },
  { valor: 'DEVOLUCION', label: 'Devolución' },
];

/**
 * Consultar movimientos de inventario (CU14) - /admin/inventario/movimientos.
 *
 * KARDEX de SOLO LECTURA (nunca registra/edita/elimina movimientos).
 * - ADMINISTRADOR: elige cualquier sucursal (o "Todas las sucursales").
 * - ENCARGADO_SUCURSAL: sucursal informativa; NO se envía `sucursal_id` y el
 *   backend limita los resultados a su sucursal.
 *
 * Catálogos desde GET /catalogo/filtros (público, sin hardcodear). El filtro
 * "Origen" usa `referencia_tipo` (texto libre en la API): sus opciones salen
 * de los valores reales observados en las respuestas.
 */
@Component({
  selector: 'app-movimientos-inventario-page',
  imports: [
    ReactiveFormsModule,
    DatePipe,
    MovimientoBadge,
    MovimientoDetalleDialog,
  ],
  styleUrls: [
    './movimientos-inventario-page.css',
    './movimientos-inventario-page-tabla.css',
  ],
  templateUrl: './movimientos-inventario-page.html',
})
export class MovimientosInventarioPage implements OnInit {
  private readonly movimientosService = inject(MovimientoInventarioService);
  private readonly catalogoService = inject(CatalogoService);
  private readonly sucursalesService = inject(SucursalesService);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  // ===== Sesión / rol =====
  readonly esAdministrador = computed(() => this.authService.esAdministrador());

  // ===== Catálogos de filtros (GET /catalogo/filtros) =====
  readonly sucursales = signal<SucursalFiltro[]>([]);
  readonly temporadas = signal<FiltroOpcion[]>([]);
  readonly cargandoCatalogos = signal(false);
  readonly errorCatalogos = signal<string | null>(null);

  /** Valores reales de `referencia_tipo` observados en las respuestas. */
  readonly origenes = signal<string[]>([]);

  /** Sucursal asignada del ENCARGADO_SUCURSAL (informativa). */
  readonly sucursalAsignada = signal<string | null>(null);

  readonly tiposMovimiento = TIPOS_MOVIMIENTO;

  readonly filtros = new FormGroup({
    sucursalId: new FormControl<number | null>(null),
    tipo: new FormControl<TipoMovimientoInventario | null>(null),
    producto: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(150)],
    }),
    temporadaId: new FormControl<number | null>(null),
    fechaDesde: new FormControl('', { nonNullable: true }),
    fechaHasta: new FormControl('', { nonNullable: true }),
    referenciaTipo: new FormControl<string | null>(null),
  });

  // ===== Resultados =====
  readonly items = signal<MovimientoInventarioItem[]>([]);
  readonly total = signal(0);
  readonly limit = signal(LIMITE_MOVIMIENTOS);
  readonly offset = signal(0);
  readonly cargando = signal(false);
  readonly error = signal<string | null>(null);
  readonly rangoInvalido = signal(false);

  /** Movimiento cuyo detalle (observación) se está mostrando. */
  readonly detalle = signal<MovimientoInventarioItem | null>(null);

  /** Filas y columnas del skeleton de carga. */
  readonly filasSkeleton = [0, 1, 2, 3, 4, 5];
  readonly columnasSkeleton = computed(() =>
    Array.from({ length: this.esAdministrador() ? 8 : 7 }, (_, i) => i),
  );

  constructor() {
    // Los selects recargan directamente (offset = 0).
    const controlesSelect: AbstractControl[] = [
      this.filtros.controls.sucursalId,
      this.filtros.controls.tipo,
      this.filtros.controls.temporadaId,
      this.filtros.controls.referenciaTipo,
    ];
    for (const control of controlesSelect) {
      control.valueChanges
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe(() => this.cargarMovimientos(0));
    }

    // Rango de fechas: si Desde > Hasta se avisa y NO se consulta al backend.
    const controlesFecha: AbstractControl[] = [
      this.filtros.controls.fechaDesde,
      this.filtros.controls.fechaHasta,
    ];
    for (const control of controlesFecha) {
      control.valueChanges
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe(() => {
          const invalido = this.calcularRangoInvalido();
          this.rangoInvalido.set(invalido);
          if (!invalido) {
            this.cargarMovimientos(0);
          }
        });
    }

    // Búsqueda por producto con debounce.
    this.filtros.controls.producto.valueChanges
      .pipe(
        debounceTime(DEBOUNCE_PRODUCTO_MS),
        distinctUntilChanged(),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(() => this.cargarMovimientos(0));
  }

  ngOnInit(): void {
    this.cargarCatalogos();
    this.resolverSucursalAsignada();
    this.cargarMovimientos(0);
  }

  // ===== Filtros =====

  /** Aplica los filtros actuales desde el primer registro. */
  buscar(): void {
    this.cargarMovimientos(0);
  }

  limpiarFiltros(): void {
    this.filtros.reset(
      {
        sucursalId: null,
        tipo: null,
        producto: '',
        temporadaId: null,
        fechaDesde: '',
        fechaHasta: '',
        referenciaTipo: null,
      },
      { emitEvent: false },
    );
    this.rangoInvalido.set(false);
    this.cargarMovimientos(0);
  }

  /** true si hay algún filtro aplicado (la sucursal cuenta solo para el admin). */
  tieneFiltros(): boolean {
    const valores = this.filtros.getRawValue();
    return (
      (this.esAdministrador() && valores.sucursalId !== null) ||
      valores.tipo !== null ||
      valores.producto.trim().length > 0 ||
      valores.temporadaId !== null ||
      valores.fechaDesde.length > 0 ||
      valores.fechaHasta.length > 0 ||
      valores.referenciaTipo !== null
    );
  }

  // ===== Paginación (10 registros por página) =====

  irAnterior(): void {
    if (!this.hayAnterior()) {
      return;
    }
    this.cargarMovimientos(Math.max(0, this.offset() - this.limit()));
  }

  irSiguiente(): void {
    if (!this.haySiguiente()) {
      return;
    }
    this.cargarMovimientos(this.offset() + this.limit());
  }

  hayAnterior(): boolean {
    return !this.cargando() && this.offset() > 0;
  }

  haySiguiente(): boolean {
    return (
      !this.cargando() && this.total() > this.offset() + this.items().length
    );
  }

  inicioVisible(): number {
    return this.total() === 0 ? 0 : this.offset() + 1;
  }

  finVisible(): number {
    if (this.total() === 0) {
      return 0;
    }
    return Math.min(this.total(), this.offset() + this.items().length);
  }

  paginaActual(): number {
    return this.limit() > 0 ? Math.floor(this.offset() / this.limit()) + 1 : 1;
  }

  totalPaginas(): number {
    return this.limit() > 0 ? Math.ceil(this.total() / this.limit()) : 0;
  }

  // ===== Presentación =====

  /**
   * Humaniza un `referencia_tipo` real del backend (p. ej. "ORDEN_COMPRA" ->
   * "Orden compra") sin inventar nombres ni asumir valores.
   */
  humanizarReferencia(valor: string | null): string {
    if (valor === null || valor.trim().length === 0) {
      return '—';
    }
    const texto = valor.trim().replace(/_/g, ' ').toLowerCase();
    return texto.charAt(0).toUpperCase() + texto.slice(1);
  }

  /** Texto del origen: "Orden compra #15", "Venta #80" o "—". */
  textoOrigen(item: MovimientoInventarioItem): string {
    const tipo =
      item.referencia_tipo !== null
        ? this.humanizarReferencia(item.referencia_tipo)
        : '—';
    const id = item.referencia_id;
    if (tipo !== '—' && id !== null) {
      return `${tipo} #${id}`;
    }
    if (tipo !== '—') {
      return tipo;
    }
    if (id !== null) {
      return `#${id}`;
    }
    return '—';
  }

  // ===== Detalle (observación) =====

  verDetalle(item: MovimientoInventarioItem): void {
    this.detalle.set(item);
  }

  cerrarDetalle(): void {
    this.detalle.set(null);
  }

  // ===== Reintentos =====

  reintentar(): void {
    if (this.rangoInvalido()) {
      return;
    }
    this.cargarMovimientos(this.offset());
  }

  /** true si hay fechas completas y Desde > Hasta (no se consulta al backend). */
  private calcularRangoInvalido(): boolean {
    const { fechaDesde, fechaHasta } = this.filtros.getRawValue();
    if (fechaDesde.length === 0 || fechaHasta.length === 0) {
      return false;
    }
    return fechaDesde > fechaHasta;
  }

  // ===== Carga de datos =====

  cargarCatalogos(): void {
    this.cargandoCatalogos.set(true);
    this.errorCatalogos.set(null);

    this.catalogoService
      .obtenerFiltros()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (catalogos) => {
          this.cargandoCatalogos.set(false);
          this.sucursales.set(catalogos.sucursales);
          this.temporadas.set(catalogos.temporadas);
        },
        error: (error: unknown) => {
          this.cargandoCatalogos.set(false);
          this.errorCatalogos.set(
            'No se pudieron cargar las opciones de los filtros. Intenta nuevamente.',
          );
          const traducido = traducirErrorInventario(error);
          if (traducido.sesionExpirada) {
            this.cerrarSesion();
          }
        },
      });
  }

  private cargarMovimientos(offset: number): void {
    if (this.rangoInvalido()) {
      return;
    }
    this.cargando.set(true);
    this.error.set(null);
    this.offset.set(offset);

    const valores = this.filtros.getRawValue();
    this.movimientosService
      .obtenerMovimientos({
        // El encargado no envía sucursal: el backend aplica su alcance.
        sucursal_id: this.esAdministrador()
          ? (valores.sucursalId ?? undefined)
          : undefined,
        tipo: valores.tipo ?? undefined,
        producto: valores.producto.trim() || undefined,
        temporada_id: valores.temporadaId ?? undefined,
        fecha_desde: valores.fechaDesde || undefined,
        fecha_hasta: valores.fechaHasta || undefined,
        referencia_tipo: valores.referenciaTipo ?? undefined,
        limit: this.limit(),
        offset,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (respuesta) => {
          this.cargando.set(false);
          this.items.set(respuesta.items);
          this.total.set(respuesta.total);
          this.limit.set(respuesta.limit);
          this.offset.set(respuesta.offset);
          this.registrarOrigenes(respuesta.items);
          this.completarSucursalAsignada(respuesta.items);
        },
        error: (error: unknown) => {
          this.cargando.set(false);
          this.items.set([]);
          this.total.set(0);
          this.manejarError(error);
        },
      });
  }

  /** Acumula los `referencia_tipo` reales vistos para poblar el filtro Origen. */
  private registrarOrigenes(items: readonly MovimientoInventarioItem[]): void {
    const conocidos = new Set(this.origenes());
    let nuevo = false;
    for (const item of items) {
      const tipo = item.referencia_tipo?.trim();
      if (tipo && !conocidos.has(tipo)) {
        conocidos.add(tipo);
        nuevo = true;
      }
    }
    if (nuevo) {
      this.origenes.set([...conocidos].sort());
    }
  }

  /**
   * Resuelve el nombre de la sucursal del encargado reutilizando la sesión
   * (sucursal_id) y el endpoint existente GET /sucursales/{id}. Si no hay
   * sesión disponible (p. ej. tras refrescar), se completará con la respuesta
   * de GET /movimientos-inventario.
   */
  private resolverSucursalAsignada(): void {
    if (this.esAdministrador() || this.sucursalAsignada() !== null) {
      return;
    }
    const sucursalId = this.authService.sucursalId();
    if (sucursalId === null) {
      return;
    }
    this.sucursalesService
      .obtenerSucursal(sucursalId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (sucursal) => this.sucursalAsignada.set(sucursal.nombre),
        error: () => {
          // Sin dato: se completará con la respuesta de movimientos.
        },
      });
  }

  private completarSucursalAsignada(
    items: readonly MovimientoInventarioItem[],
  ): void {
    if (this.esAdministrador() || this.sucursalAsignada() !== null) {
      return;
    }
    const nombre = items[0]?.sucursal_nombre;
    if (nombre) {
      this.sucursalAsignada.set(nombre);
    }
  }

  // ===== Errores =====

  private manejarError(error: unknown): void {
    const traducido = traducirErrorInventario(error);
    if (traducido.sesionExpirada) {
      this.cerrarSesion();
      return;
    }
    if (error instanceof HttpErrorResponse && error.status === 403) {
      this.error.set(
        'No tienes permisos para consultar los movimientos de inventario.',
      );
      return;
    }
    // Nunca se muestran detalles técnicos de FastAPI (422 incluido).
    this.error.set(
      'No se pudieron cargar los movimientos de inventario. Intenta nuevamente.',
    );
  }

  private cerrarSesion(): void {
    this.authService.cerrarSesion();
    void this.router.navigateByUrl('/auth/personal/login');
  }
}
