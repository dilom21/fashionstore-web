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
import {
  DisponibilidadInventario,
  InventarioItem,
} from '../../models/inventario.model';
import { InventarioService } from '../../services/inventario.service';
import { SucursalesService } from '../../services/sucursales.service';
import { traducirErrorInventario } from '../../utils/http-error.util';

/** Tamaños de página admitidos por GET /inventario (máximo 100). */
const OPCIONES_LIMITE = [20, 50, 100] as const;

/** Milisegundos de espera de la búsqueda por producto (evita una petición por tecla). */
const DEBOUNCE_PRODUCTO_MS = 350;

/** Estado visual del stock derivado de `stock_disponible` (no recalcula nada). */
type EstadoStock = 'con-stock' | 'stock-bajo' | 'sin-stock';

/** Opción del select de disponibilidad. */
interface OpcionDisponibilidad {
  valor: DisponibilidadInventario;
  label: string;
}

/**
 * Consultar inventario por sucursal (CU13) - /admin/inventario/consultar.
 *
 * Pantalla SOLO LECTURA: muestra las existencias por producto, variante, talla,
 * color y temporada, con filtros y paginación reales (GET /inventario).
 *
 * Rol:
 * - ADMINISTRADOR: ve y elige cualquier sucursal (o "Todas las sucursales").
 * - ENCARGADO_SUCURSAL: la sucursal es informativa, no editable; NO se envía
 *   `sucursal_id` y el backend limita los resultados a su sucursal.
 *
 * Los catálogos de los filtros provienen de GET /catalogo/filtros (público):
 * nunca se hardcodean categorías, tallas, colores, temporadas ni sucursales.
 */
@Component({
  selector: 'app-inventario-page',
  imports: [ReactiveFormsModule, DatePipe],
  styleUrls: ['./inventario-page.css', './inventario-page-tabla.css'],
  templateUrl: './inventario-page.html',
})
export class InventarioPage implements OnInit {
  private readonly inventarioService = inject(InventarioService);
  private readonly catalogoService = inject(CatalogoService);
  private readonly sucursalesService = inject(SucursalesService);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  // ===== Sesión / rol =====
  readonly esAdministrador = computed(() => this.authService.esAdministrador());

  // ===== Catálogos de filtros (GET /catalogo/filtros) =====
  readonly sucursales = signal<SucursalFiltro[]>([]);
  readonly categorias = signal<FiltroOpcion[]>([]);
  readonly tallas = signal<FiltroOpcion[]>([]);
  readonly colores = signal<FiltroOpcion[]>([]);
  readonly temporadas = signal<FiltroOpcion[]>([]);
  readonly cargandoCatalogos = signal(false);
  readonly errorCatalogos = signal<string | null>(null);

  /** Nombre de la sucursal asignada del ENCARGADO_SUCURSAL (informativo). */
  readonly sucursalAsignada = signal<string | null>(null);

  readonly opcionesLimite = OPCIONES_LIMITE;
  readonly opcionesDisponibilidad: readonly OpcionDisponibilidad[] = [
    { valor: 'TODOS', label: 'Todas' },
    { valor: 'CON_STOCK', label: 'Con stock' },
    { valor: 'STOCK_BAJO', label: 'Stock bajo' },
    { valor: 'SIN_STOCK', label: 'Sin stock' },
  ];

  readonly filtros = new FormGroup({
    sucursalId: new FormControl<number | null>(null),
    producto: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(150)],
    }),
    categoriaId: new FormControl<number | null>(null),
    tallaId: new FormControl<number | null>(null),
    colorId: new FormControl<number | null>(null),
    temporadaId: new FormControl<number | null>(null),
    disponibilidad: new FormControl<DisponibilidadInventario>('TODOS', {
      nonNullable: true,
    }),
  });

  // ===== Resultados =====
  readonly items = signal<InventarioItem[]>([]);
  readonly total = signal(0);
  readonly limit = signal(20);
  readonly offset = signal(0);
  readonly cargando = signal(false);
  readonly error = signal<string | null>(null);

  constructor() {
    // Los selects recargan directamente (offset = 0). La búsqueda por producto
    // espera DEBOUNCE_PRODUCTO_MS para no lanzar una petición por cada tecla.
    const controlesSelect: AbstractControl[] = [
      this.filtros.controls.sucursalId,
      this.filtros.controls.categoriaId,
      this.filtros.controls.tallaId,
      this.filtros.controls.colorId,
      this.filtros.controls.temporadaId,
      this.filtros.controls.disponibilidad,
    ];
    for (const control of controlesSelect) {
      control.valueChanges
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe(() => this.cargarInventario(0));
    }

    this.filtros.controls.producto.valueChanges
      .pipe(
        debounceTime(DEBOUNCE_PRODUCTO_MS),
        distinctUntilChanged(),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(() => this.cargarInventario(0));
  }

  ngOnInit(): void {
    this.cargarCatalogos();
    this.resolverSucursalAsignada();
    this.cargarInventario(0);
  }

  // ===== Filtros =====

  /** Aplica los filtros actuales desde el primer registro. */
  buscar(): void {
    this.cargarInventario(0);
  }

  limpiarFiltros(): void {
    this.filtros.reset(
      {
        sucursalId: null,
        producto: '',
        categoriaId: null,
        tallaId: null,
        colorId: null,
        temporadaId: null,
        disponibilidad: 'TODOS',
      },
      { emitEvent: false },
    );
    this.cargarInventario(0);
  }

  /** true si hay algún filtro aplicado (la sucursal cuenta solo para el admin). */
  tieneFiltros(): boolean {
    const valores = this.filtros.getRawValue();
    return (
      (this.esAdministrador() && valores.sucursalId !== null) ||
      valores.producto.trim().length > 0 ||
      valores.categoriaId !== null ||
      valores.tallaId !== null ||
      valores.colorId !== null ||
      valores.temporadaId !== null ||
      valores.disponibilidad !== 'TODOS'
    );
  }

  // ===== Paginación =====

  irAnterior(): void {
    if (!this.hayAnterior()) {
      return;
    }
    this.cargarInventario(Math.max(0, this.offset() - this.limit()));
  }

  irSiguiente(): void {
    if (!this.haySiguiente()) {
      return;
    }
    this.cargarInventario(this.offset() + this.limit());
  }

  cambiarLimite(evento: Event): void {
    const valor = Number((evento.target as HTMLSelectElement).value);
    if (!OPCIONES_LIMITE.includes(valor as (typeof OPCIONES_LIMITE)[number])) {
      return;
    }
    this.limit.set(valor);
    this.cargarInventario(0);
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

  /** Estado visual del stock usando `stock_disponible` del backend. */
  estadoStock(item: InventarioItem): EstadoStock {
    if (item.stock_disponible > 5) {
      return 'con-stock';
    }
    if (item.stock_disponible >= 1) {
      return 'stock-bajo';
    }
    return 'sin-stock';
  }

  etiquetaStock(item: InventarioItem): string {
    switch (this.estadoStock(item)) {
      case 'con-stock':
        return 'Con stock';
      case 'stock-bajo':
        return 'Stock bajo';
      default:
        return 'Sin stock';
    }
  }

  // ===== Reintentos =====

  reintentar(): void {
    this.cargarInventario(this.offset());
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
          this.categorias.set(catalogos.categorias);
          this.tallas.set(catalogos.tallas);
          this.colores.set(catalogos.colores);
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

  private cargarInventario(offset: number): void {
    this.cargando.set(true);
    this.error.set(null);
    this.offset.set(offset);

    const valores = this.filtros.getRawValue();
    this.inventarioService
      .obtenerInventario({
        // El encargado no envía sucursal: el backend aplica su alcance.
        sucursal_id: this.esAdministrador()
          ? (valores.sucursalId ?? undefined)
          : undefined,
        producto: valores.producto.trim() || undefined,
        categoria_id: valores.categoriaId ?? undefined,
        talla_id: valores.tallaId ?? undefined,
        color_id: valores.colorId ?? undefined,
        temporada_id: valores.temporadaId ?? undefined,
        disponibilidad: valores.disponibilidad,
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

  /**
   * Resuelve el nombre de la sucursal del encargado reutilizando la sesión
   * (sucursal_id) y el endpoint existente GET /sucursales/{id}. Si no hay
   * sesión disponible (p. ej. tras refrescar), se completará con la respuesta
   * de GET /inventario.
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
          // Sin dato: se completará con la respuesta de GET /inventario.
        },
      });
  }

  /** Completa la sucursal informativa del encargado con el primer resultado. */
  private completarSucursalAsignada(items: readonly InventarioItem[]): void {
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
      this.error.set('No tienes permisos para consultar este inventario.');
      return;
    }
    // Nunca se muestran detalles técnicos de FastAPI.
    this.error.set('No se pudo cargar el inventario. Intenta nuevamente.');
  }

  private cerrarSesion(): void {
    this.authService.cerrarSesion();
    void this.router.navigateByUrl('/auth/personal/login');
  }
}
