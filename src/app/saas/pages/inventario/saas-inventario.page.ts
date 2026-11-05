import {
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { AdminIcon } from '../../../features/administracion/components/admin-icon/admin-icon';
import {
  TenantErrorNormalizado,
  TenantInventario,
  TenantSucursal,
} from '../../models/tenant.models';
import { SaasErrorService } from '../../services/saas-error.service';
import { SaasInventarioService } from '../../services/saas-inventario.service';
import { SaasSucursalesService } from '../../services/saas-sucursales.service';

/** Tamaños de página admitidos por el contrato (backend: 1..200). */
export const LIMITES_INVENTARIO = [25, 50, 100] as const;

/** Tamaño de página por defecto (mismo default que el backend). */
export const LIMITE_INVENTARIO_POR_DEFECTO = 50;

/** Máximo del filtro de texto (backend: 1..60). */
export const MAX_TEXTO_INVENTARIO = 60;

/**
 * Inventario de la empresa (`GET /tenant/inventario`).
 *
 * Contrato real:
 * - Solo lectura: el backend no expone alta, edición ni eliminación de
 *   inventario. La pantalla no ofrece acciones de escritura.
 * - Filtros `sucursal_id` (> 0) y `texto` (1..60), con `limit` 1..200 y
 *   `offset` >= 0.
 * - El backend NO devuelve un total de resultados: la paginación avanza por
 *   `offset` y habilita "Siguiente" solo cuando la página llega completa.
 * - `stock_disponible` lo calcula el backend (`stock_actual - stock_reservado`);
 *   aquí solo se resalta cuando es cero o negativo.
 *
 * Los errores se traducen con `SaasErrorService`: nunca se muestra el error
 * HTTP crudo.
 */
@Component({
  selector: 'app-saas-inventario-page',
  imports: [AdminIcon],
  styleUrl: './saas-inventario.page.css',
  templateUrl: './saas-inventario.page.html',
})
export class SaasInventarioPage {
  private readonly inventarioService = inject(SaasInventarioService);
  private readonly sucursalesService = inject(SaasSucursalesService);
  private readonly errores = inject(SaasErrorService);
  private readonly destroyRef = inject(DestroyRef);

  readonly limites = LIMITES_INVENTARIO;
  readonly maxTexto = MAX_TEXTO_INVENTARIO;

  // ============================== Inventario ==============================

  readonly inventario = signal<TenantInventario[]>([]);
  readonly cargando = signal(true);
  readonly error = signal<TenantErrorNormalizado | null>(null);
  readonly sinPermiso = signal(false);

  // ============================== Sucursales ==============================

  readonly sucursales = signal<TenantSucursal[]>([]);
  readonly cargandoSucursales = signal(true);
  readonly errorSucursales = signal<string | null>(null);
  readonly sucursalesSinPermiso = signal(false);

  // ================================ Filtros ===============================

  readonly filtroSucursal = signal<number | null>(null);
  readonly filtroTexto = signal('');
  readonly limite = signal<number>(LIMITE_INVENTARIO_POR_DEFECTO);

  /** Número de página (0-based); `offset = pagina * limite`. */
  readonly pagina = signal(0);
  readonly offset = computed(() => this.pagina() * this.limite());

  readonly hayPaginaSiguiente = computed(
    () => this.inventario().length === this.limite(),
  );

  readonly textoRango = computed(() => {
    const total = this.inventario().length;
    if (total === 0) {
      return 'Sin resultados en esta página';
    }
    const desde = this.offset() + 1;
    return `Mostrando ${desde}–${this.offset() + total} · página ${this.pagina() + 1}`;
  });

  /** `true` cuando hay algún filtro aplicado además de la paginación. */
  readonly tieneFiltros = computed(
    () => this.filtroSucursal() !== null || this.filtroTexto().length > 0,
  );

  constructor() {
    this.cargar();
    this.cargarSucursales();
  }

  // ================================ Carga ================================

  recargar(): void {
    if (this.cargando()) {
      return;
    }
    this.cargar();
  }

  recargarSucursales(): void {
    if (this.cargandoSucursales()) {
      return;
    }
    this.cargarSucursales();
  }

  // ============================== Paginación =============================

  paginaSiguiente(): void {
    if (!this.hayPaginaSiguiente() || this.cargando()) {
      return;
    }
    this.pagina.update((valor) => valor + 1);
    this.cargar();
  }

  paginaAnterior(): void {
    if (this.pagina() === 0 || this.cargando()) {
      return;
    }
    this.pagina.update((valor) => valor - 1);
    this.cargar();
  }

  // ================================ Filtros ==============================

  /** Cambia la sucursal del filtro y vuelve a la primera página. */
  cambiarSucursal(evento: Event): void {
    const objetivo = evento.target;
    if (!(objetivo instanceof HTMLSelectElement)) {
      return;
    }
    const numero = Number.parseInt(objetivo.value, 10);
    this.filtroSucursal.set(
      Number.isInteger(numero) && numero > 0 ? numero : null,
    );
    this.pagina.set(0);
    this.cargar();
  }

  /** Aplica el texto de búsqueda (máximo 60 caracteres) desde el formulario. */
  aplicarBusqueda(texto: string): void {
    const normalizado = texto.trim().slice(0, MAX_TEXTO_INVENTARIO);
    this.filtroTexto.set(normalizado);
    this.pagina.set(0);
    this.cargar();
  }

  /** Quita el texto de búsqueda y conserva la sucursal elegida. */
  limpiarBusqueda(): void {
    if (this.filtroTexto().length === 0) {
      return;
    }
    this.filtroTexto.set('');
    this.pagina.set(0);
    this.cargar();
  }

  /** Quita todos los filtros y vuelve a la primera página. */
  limpiarFiltros(): void {
    if (!this.tieneFiltros()) {
      return;
    }
    this.filtroSucursal.set(null);
    this.filtroTexto.set('');
    this.pagina.set(0);
    this.cargar();
  }

  /** Cambia el tamaño de página y vuelve a la primera página. */
  cambiarLimite(evento: Event): void {
    const objetivo = evento.target;
    if (!(objetivo instanceof HTMLSelectElement)) {
      return;
    }
    const numero = Number.parseInt(objetivo.value, 10);
    const valido = LIMITES_INVENTARIO.some((opcion) => opcion === numero);
    this.limite.set(
      valido ? numero : LIMITE_INVENTARIO_POR_DEFECTO,
    );
    this.pagina.set(0);
    this.cargar();
  }

  // ============================ Presentación =============================

  /** `true` si la fila no tiene unidades disponibles (regla del backend). */
  sinDisponible(item: TenantInventario): boolean {
    return item.stock_disponible <= 0;
  }

  /** Nombre de la sucursal con su estado, para el selector de filtro. */
  etiquetaSucursal(sucursal: TenantSucursal): string {
    return sucursal.estado
      ? sucursal.nombre
      : `${sucursal.nombre} (inactiva)`;
  }

  /** Nombre legible de la sucursal filtrada (o "Todas"). */
  readonly nombreSucursalFiltrada = computed(() => {
    const id = this.filtroSucursal();
    if (id === null) {
      return 'Todas las sucursales';
    }
    return (
      this.sucursales().find((sucursal) => sucursal.id === id)?.nombre ??
      `Sucursal #${id}`
    );
  });

  // =============================== Interno ===============================

  private cargar(): void {
    this.cargando.set(true);
    this.error.set(null);
    this.sinPermiso.set(false);

    this.inventarioService
      .listar({
        sucursal_id: this.filtroSucursal(),
        texto: this.filtroTexto().length > 0 ? this.filtroTexto() : null,
        limit: this.limite(),
        offset: this.offset(),
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (items) => {
          this.inventario.set(items);
          this.cargando.set(false);
        },
        error: (error: unknown) => {
          this.inventario.set([]);
          this.cargando.set(false);
          const normalizado = this.errores.normalizar(
            error,
            'inventario/listar',
          );
          if (normalizado.estado === 403) {
            this.sinPermiso.set(true);
            return;
          }
          this.error.set(normalizado);
        },
      });
  }

  private cargarSucursales(): void {
    this.cargandoSucursales.set(true);
    this.errorSucursales.set(null);
    this.sucursalesSinPermiso.set(false);

    this.sucursalesService
      .listar()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (sucursales) => {
          this.sucursales.set(
            [...sucursales].sort((a, b) => a.nombre.localeCompare(b.nombre)),
          );
          this.cargandoSucursales.set(false);
        },
        error: (error: unknown) => {
          this.sucursales.set([]);
          this.cargandoSucursales.set(false);
          const normalizado = this.errores.normalizar(
            error,
            'inventario/sucursales',
          );
          if (normalizado.estado === 403) {
            this.sucursalesSinPermiso.set(true);
          }
          this.errorSucursales.set(normalizado.mensaje);
        },
      });
  }
}
