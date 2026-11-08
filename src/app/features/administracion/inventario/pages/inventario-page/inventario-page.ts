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
import { debounceTime, distinctUntilChanged, forkJoin, of } from 'rxjs';

import { FiltroOpcion } from '../../../../catalogo/models/catalogo-filtros.model';
import { PanelSesionService } from '../../../services/panel-sesion.service';
import {
  DisponibilidadInventario,
  InventarioItem,
} from '../../models/inventario.model';
import { InventarioFiltrosService } from '../../services/inventario-filtros.service';
import { InventarioService } from '../../services/inventario.service';
import { traducirErrorInventarioSaas } from '../../utils/inventario-saas-error.util';

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
 * color y temporada, con filtros y paginación reales.
 *
 * CU08: la consulta se hace contra el backend EMPRESARIAL
 * (`GET /tenant/inventario`) con el JWT de `TenantApiService`; el diseño,
 * las columnas, los filtros, la paginación y la presentación del stock se
 * conservan del primer parcial.
 *
 * Rol:
 * - ADMINISTRADOR: ve y elige cualquier sucursal de su empresa (o "Todas las
 *   sucursales").
 * - ENCARGADO_SUCURSAL: su sucursal es informativa, no editable; NO se envía
 *   `sucursal_id` y el backend limita los resultados a su sucursal.
 *
 * Los catálogos de los filtros provienen de los endpoints empresariales
 * (categorías, sucursales y `/tenant/inventario/filtros`): nunca se hardcodean.
 */
@Component({
  selector: 'app-inventario-page',
  imports: [ReactiveFormsModule, DatePipe],
  styleUrls: ['./inventario-page.css', './inventario-page-tabla.css'],
  templateUrl: './inventario-page.html',
})
export class InventarioPage implements OnInit {
  private readonly inventarioService = inject(InventarioService);
  private readonly filtrosService = inject(InventarioFiltrosService);
  private readonly sesion = inject(PanelSesionService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  // ===== Sesión / rol =====
  readonly esAdministrador = computed(() => this.sesion.esAdministrador());

  // ===== Catálogos de filtros (endpoints empresariales de CU08) =====
  readonly sucursales = signal<FiltroOpcion[]>([]);
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

  /**
   * Carga las opciones de los filtros con los endpoints EMPRESARIALES de CU08:
   * categorías, tallas/colores/temporadas y (solo para el ADMINISTRADOR) las
   * sucursales activas autorizadas de la empresa.
   *
   * El ENCARGADO_SUCURSAL no consulta `/tenant/empresa/sucursales`: no puede
   * elegir sucursal, y su sucursal (informativa) se completa con la propia
   * respuesta del inventario.
   */
  cargarCatalogos(): void {
    this.cargandoCatalogos.set(true);
    this.errorCatalogos.set(null);

    forkJoin({
      sucursales: this.esAdministrador()
        ? this.filtrosService.obtenerSucursales()
        : of<FiltroOpcion[]>([]),
      categorias: this.filtrosService.obtenerCategorias(),
      opciones: this.filtrosService.obtenerOpciones(),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ sucursales, categorias, opciones }) => {
          this.cargandoCatalogos.set(false);
          this.sucursales.set(sucursales);
          this.categorias.set(categorias);
          this.tallas.set(opciones.tallas);
          this.colores.set(opciones.colores);
          this.temporadas.set(opciones.temporadas);
        },
        error: (error: unknown) => {
          this.cargandoCatalogos.set(false);
          const traducido = traducirErrorInventarioSaas(error, 'filtros');
          if (traducido.sesionExpirada) {
            this.cerrarSesion();
            return;
          }
          this.errorCatalogos.set(
            `${traducido.mensaje} Puedes seguir consultando el inventario sin filtros.`,
          );
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
   * Completa la sucursal informativa del encargado con el primer resultado.
   *
   * No se consulta ningún endpoint adicional: el nombre llega en la propia
   * respuesta de `/tenant/inventario` (el backend ya limitó el alcance a su
   * sucursal). Si aún no hay filas, la etiqueta queda como "Tu sucursal".
   */
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
    const traducido = traducirErrorInventarioSaas(error, 'inventario');
    if (traducido.sesionExpirada) {
      this.cerrarSesion();
      return;
    }
    // 403/404/422/503/red se muestran tal cual: nunca como una lista válida.
    this.error.set(traducido.mensaje);
  }

  private cerrarSesion(): void {
    // Limpia la sesión empresarial y la legacy antes de volver al portero.
    this.sesion.cerrarSesion();
    void this.router.navigateByUrl('/auth/personal/login');
  }
}
