import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';

import { AuthService } from '../../../autenticacion-seguridad/auth/services/auth.service';
import { Navbar } from '../../../home/components/navbar/navbar';
import {
  CanalHistorial,
  CANALES_HISTORIAL,
  ESTADOS_HISTORIAL,
  EstadoHistorial,
  HistorialCompraDetalle,
  HistorialCompraResumen,
  TAMANO_PAGINA_HISTORIAL,
  formatearFecha,
  puedeVerComprobante,
} from '../../models/historial-compras.model';
import {
  codigoVenta,
  etiquetaCanal,
  formatearFechaHora,
  formatearMonto,
} from '../../models/comprobante-venta.model';
import { etiquetaMetodoPago } from '../../models/pago-presencial.model';
import { HistorialComprasService } from '../../services/historial-compras.service';
import {
  ErrorHistorialCompras,
  traducirErrorDetalleCompra,
  traducirErrorHistorial,
} from '../../utils/historial-compras-error.util';

/**
 * CU24 - Historial de compras del CLIENTE (/ventas/historial).
 *
 * Flujo:
 *
 *   HistorialComprasPage
 *     -> HistorialComprasService.obtenerHistorial()  (GET /ventas/historial)
 *     -> lista paginada + filtros reales
 *     -> HistorialComprasService.obtenerDetalle()    (GET /ventas/historial/{id})
 *     -> panel de detalle
 *     -> VER COMPROBANTE -> CU23 existente (/ventas/{venta_id}/comprobante)
 *
 * Solo consulta: no modifica ventas, no registra pagos, no genera PDF ni
 * comprobantes (CU23 hace eso) y no envía `cliente_id` (el backend lo obtiene
 * del JWT). El listado se ordena y pagina en el backend: el frontend no
 * reordena ni recalcula totales.
 */
@Component({
  selector: 'app-historial-compras-page',
  imports: [Navbar, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './historial-compras-page.css',
  templateUrl: './historial-compras-page.html',
})
export class HistorialComprasPage implements OnInit {
  private readonly historialService = inject(HistorialComprasService);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly estados = ESTADOS_HISTORIAL;
  readonly canales = CANALES_HISTORIAL;

  // ===== Filtros (solo los soportados por el backend) =====
  readonly estado = signal<EstadoHistorial | null>(null);
  readonly canal = signal<CanalHistorial | null>(null);
  readonly fechaDesde = signal<string | null>(null);
  readonly fechaHasta = signal<string | null>(null);

  // ===== Listado y metadatos reales =====
  readonly compras = signal<HistorialCompraResumen[]>([]);
  readonly pagina = signal(1);
  readonly tamanoPagina = signal(TAMANO_PAGINA_HISTORIAL);
  readonly totalRegistros = signal(0);
  readonly totalPaginas = signal(0);
  readonly cargando = signal(true);
  readonly error = signal<ErrorHistorialCompras | null>(null);
  readonly errorFiltros = signal<string | null>(null);

  // ===== Detalle (panel lateral en desktop) =====
  readonly seleccionadaId = signal<number | null>(null);
  readonly detalle = signal<HistorialCompraDetalle | null>(null);
  readonly cargandoDetalle = signal(false);
  readonly errorDetalle = signal<ErrorHistorialCompras | null>(null);

  readonly hayFiltros = computed(
    () =>
      this.estado() !== null ||
      this.canal() !== null ||
      this.fechaDesde() !== null ||
      this.fechaHasta() !== null,
  );
  readonly sinResultados = computed(
    () => !this.cargando() && this.error() === null && this.compras().length === 0,
  );
  /** Cliente sin compras registradas (no es lo mismo que filtros sin match). */
  readonly historialVacio = computed(
    () => this.sinResultados() && !this.hayFiltros(),
  );
  readonly puedeAnterior = computed(() => this.pagina() > 1 && !this.cargando());
  readonly puedeSiguiente = computed(
    () => this.totalPaginas() > 0 && this.pagina() < this.totalPaginas() && !this.cargando(),
  );

  // Helpers de presentación usados por la plantilla (sin duplicar CU23).
  readonly codigoVenta = codigoVenta;
  readonly etiquetaCanal = etiquetaCanal;
  readonly formatearFecha = formatearFecha;
  readonly formatearFechaHora = formatearFechaHora;
  readonly formatearMonto = formatearMonto;
  readonly etiquetaMetodoPago = etiquetaMetodoPago;
  readonly puedeVerComprobante = puedeVerComprobante;

  ngOnInit(): void {
    this.cargarHistorial();
  }

  /** Consulta el historial con los filtros, la página y el tamaño actuales. */
  cargarHistorial(): void {
    const desde = this.fechaDesde();
    const hasta = this.fechaHasta();

    if (desde !== null && hasta !== null && desde > hasta) {
      this.errorFiltros.set(
        'La fecha desde no puede ser posterior a la fecha hasta.',
      );
      return;
    }

    this.errorFiltros.set(null);
    this.cargando.set(true);
    this.error.set(null);

    this.historialService
      .obtenerHistorial({
        estado: this.estado(),
        canal: this.canal(),
        fecha_desde: desde,
        fecha_hasta: hasta,
        pagina: this.pagina(),
        tamano_pagina: this.tamanoPagina(),
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (respuesta) => {
          this.compras.set(respuesta.items);
          this.pagina.set(respuesta.pagina);
          this.tamanoPagina.set(respuesta.tamano_pagina);
          this.totalRegistros.set(respuesta.total_registros);
          this.totalPaginas.set(respuesta.total_paginas);
          this.cargando.set(false);

          // La selección del detalle se limpia si ya no está en el resultado.
          const seleccion = this.seleccionadaId();
          if (
            seleccion !== null &&
            !respuesta.items.some((compra) => compra.venta_id === seleccion)
          ) {
            this.cerrarDetalle();
          }
        },
        error: (error: unknown) => {
          this.cargando.set(false);
          const traducido = traducirErrorHistorial(error);
          if (traducido.sesionExpirada) {
            this.cerrarSesion();
            return;
          }
          this.compras.set([]);
          this.error.set(traducido);
        },
      });
  }

  // ===== Filtros =====

  /** Los valores vacíos del formulario se normalizan a `null` (no se envían). */
  cambiarEstado(valor: string): void {
    this.estado.set((valor || null) as EstadoHistorial | null);
  }

  cambiarCanal(valor: string): void {
    this.canal.set((valor || null) as CanalHistorial | null);
  }

  cambiarFechaDesde(valor: string): void {
    this.fechaDesde.set(valor || null);
  }

  cambiarFechaHasta(valor: string): void {
    this.fechaHasta.set(valor || null);
  }

  /** FILTRAR: vuelve a la página 1 y consulta al backend. */
  aplicarFiltros(): void {
    if (this.cargando()) {
      return;
    }
    this.pagina.set(1);
    this.cargarHistorial();
  }

  /** LIMPIAR FILTROS: deja todo en null y recarga desde la página 1. */
  limpiarFiltros(): void {
    this.estado.set(null);
    this.canal.set(null);
    this.fechaDesde.set(null);
    this.fechaHasta.set(null);
    this.errorFiltros.set(null);
    this.pagina.set(1);
    this.cargarHistorial();
  }

  // ===== Paginación (metadatos reales del backend) =====

  irAPagina(pagina: number): void {
    if (this.cargando() || pagina < 1 || pagina === this.pagina()) {
      return;
    }
    if (this.totalPaginas() > 0 && pagina > this.totalPaginas()) {
      return;
    }
    this.pagina.set(pagina);
    this.cargarHistorial();
  }

  paginaAnterior(): void {
    this.irAPagina(this.pagina() - 1);
  }

  paginaSiguiente(): void {
    this.irAPagina(this.pagina() + 1);
  }

  reintentarHistorial(): void {
    this.cargarHistorial();
  }

  // ===== Detalle =====

  /**
   * VER DETALLE: consulta solo el detalle de esa compra. El listado ya cargado
   * no se recarga ni se destruye.
   */
  verDetalle(compra: HistorialCompraResumen): void {
    if (this.cargandoDetalle()) {
      return;
    }

    this.seleccionadaId.set(compra.venta_id);
    this.cargandoDetalle.set(true);
    this.errorDetalle.set(null);
    this.detalle.set(null);

    this.historialService
      .obtenerDetalle(compra.venta_id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (detalle) => {
          this.detalle.set(detalle);
          this.cargandoDetalle.set(false);
        },
        error: (error: unknown) => {
          this.cargandoDetalle.set(false);
          const traducido = traducirErrorDetalleCompra(error);
          if (traducido.sesionExpirada) {
            this.cerrarSesion();
            return;
          }
          this.errorDetalle.set(traducido);
        },
      });
  }

  reintentarDetalle(): void {
    const seleccion = this.seleccionadaId();
    const compra = this.compras().find((item) => item.venta_id === seleccion);
    if (compra !== undefined) {
      this.verDetalle(compra);
    }
  }

  cerrarDetalle(): void {
    this.seleccionadaId.set(null);
    this.detalle.set(null);
    this.errorDetalle.set(null);
    this.cargandoDetalle.set(false);
  }

  // ===== Navegación =====

  /**
   * CU24 -> CU23: se navega con el `venta_id` y CU23 se encarga de la vista,
   * el PDF y la impresión. CU24 no duplica nada del comprobante.
   */
  verComprobante(ventaId: number): void {
    void this.router.navigate(['/ventas', ventaId, 'comprobante']);
  }

  irAlCatalogo(): void {
    void this.router.navigate(['/catalogo']);
  }

  /** Sesión expirada: se reutiliza el mecanismo existente del sitio. */
  private cerrarSesion(): void {
    this.authService.cerrarSesion();
    void this.router.navigate(['/login'], {
      queryParams: { returnUrl: this.router.url },
    });
  }
}
