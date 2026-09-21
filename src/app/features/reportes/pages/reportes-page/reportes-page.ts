import { DecimalPipe, isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  PLATFORM_ID,
  WritableSignal,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Observable } from 'rxjs';

import { SucursalesService } from '../../../administracion/inventario/services/sucursales.service';
import { AuthService } from '../../../autenticacion-seguridad/auth/services/auth.service';
import { formatearMonto } from '../../../ventas/models/comprobante-venta.model';
import { ReporteChart } from '../../components/reporte-chart/reporte-chart';
import { ReporteKpi } from '../../components/reporte-kpi/reporte-kpi';
import { ReporteRanking } from '../../components/reporte-ranking/reporte-ranking';
import { ReporteAuditoriaResponse } from '../../models/auditoria-reporte.model';
import { ReporteClientesCarritosResponse } from '../../models/clientes-reporte.model';
import { ReporteComprasResponse } from '../../models/compras-reporte.model';
import { DashboardResponse } from '../../models/dashboard.model';
import { ReporteInventarioResponse } from '../../models/inventario-reporte.model';
import {
  ReporteDevolucionesResponse,
  ReportePagosResponse,
  ReporteReservasResponse,
} from '../../models/operaciones-reporte.model';
import { ReporteProductosResponse } from '../../models/productos-reporte.model';
import {
  AGRUPACIONES,
  AgrupacionReporte,
  FormatoExportacion,
  MetadatosReporte,
  RANGOS_RAPIDOS,
  RangoRapido,
  ReportesFiltros,
  TAMANO_PAGINA_REPORTES,
  TOP_OPCIONES,
  TipoReporte,
  UMBRAL_STOCK_BAJO_POR_DEFECTO,
} from '../../models/reportes-common.model';
import { ReporteVentasResponse } from '../../models/ventas-reporte.model';
import { ReportesService } from '../../services/reportes.service';
import type { ReporteExportado } from '../../services/reportes.service';
import {
  barras,
  comparativoSucursales,
  donut,
  donutConteo,
  evolucion,
  rankingFilas,
  rankingMontoFila,
} from '../../utils/reportes-datasets.util';
import {
  ErrorReporte,
  etiquetaCanalReporte,
  etiquetaMovimiento,
  etiquetaSimple,
  fechaCorta,
  fechaHoraReporte,
  rangoRapido,
  traducirErrorReporte,
} from '../../utils/reportes.util';

/** Estado de carga de cada reporte (independiente entre secciones). */
interface EstadoReporte<T> {
  cargando: boolean;
  error: ErrorReporte | null;
  datos: T | null;
}

const vacio = <T>(): EstadoReporte<T> => ({
  cargando: false,
  error: null,
  datos: null,
});

/** Pestañas de CU28 (AUDITORÍA solo existe para ADMINISTRADOR). */
export const TABS_REPORTES: readonly { id: TipoReporte; label: string }[] = [
  { id: 'RESUMEN', label: 'Resumen' },
  { id: 'VENTAS', label: 'Ventas' },
  { id: 'PRODUCTOS', label: 'Productos' },
  { id: 'INVENTARIO', label: 'Inventario' },
  { id: 'RESERVAS', label: 'Reservas' },
  { id: 'DEVOLUCIONES', label: 'Devoluciones' },
  { id: 'PAGOS', label: 'Pagos' },
  { id: 'COMPRAS_PROVEEDORES', label: 'Compras' },
  { id: 'CLIENTES_CARRITOS', label: 'Clientes' },
  { id: 'AUDITORIA', label: 'Auditoría' },
];

/**
 * CU28 - Dashboard y reportes (`/admin/reportes`).
 *
 * Consume los endpoints REALES de `app/modules/reportes` (UNA petición por
 * sección activa, sin polling ni recargas) y exporta el reporte activo a
 * PDF/XLSX/CSV con los mismos filtros. El backend es la autoridad de los
 * cálculos: aquí solo se formatea y se arman datasets de gráficas.
 */
@Component({
  selector: 'app-reportes-page',
  imports: [DecimalPipe, ReporteChart, ReporteKpi, ReporteRanking],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrls: ['./reportes-page.css', '../../styles/reportes-shared.css'],
  templateUrl: './reportes-page.html',
})
export class ReportesPage implements OnInit {
  private readonly reportes = inject(ReportesService);
  private readonly sucursalesService = inject(SucursalesService);
  private readonly auth = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly platformId = inject(PLATFORM_ID);

  readonly agrupaciones = AGRUPACIONES;
  readonly tops = TOP_OPCIONES;
  readonly rangos = RANGOS_RAPIDOS;
  readonly tamanoPagina = TAMANO_PAGINA_REPORTES;
  readonly formatearMonto = formatearMonto;
  readonly etiquetaCanal = etiquetaCanalReporte;
  readonly etiquetaMovimiento = etiquetaMovimiento;
  readonly etiquetaSimple = etiquetaSimple;
  readonly fechaHora = fechaHoraReporte;
  readonly fechaCorta = fechaCorta;

  // ===== Filtros: editados vs aplicados (solo APLICAR consulta) =====
  readonly desde = signal<string | null>(null);
  readonly hasta = signal<string | null>(null);
  readonly sucursalId = signal<number | null>(null);
  readonly agrupacion = signal<AgrupacionReporte>('DIA');
  readonly top = signal<number>(10);
  readonly umbral = signal<number>(UMBRAL_STOCK_BAJO_POR_DEFECTO);
  readonly aplicados = signal<ReportesFiltros>({});
  /** Aviso local de validación (evita un 422 evitable del backend). */
  readonly aviso = signal<string | null>(null);

  // ===== Sección activa + datos por sección =====
  readonly tab = signal<TipoReporte>('RESUMEN');
  readonly dashboard = signal<EstadoReporte<DashboardResponse>>(vacio());
  readonly ventas = signal<EstadoReporte<ReporteVentasResponse>>(vacio());
  readonly productos = signal<EstadoReporte<ReporteProductosResponse>>(vacio());
  readonly inventario = signal<EstadoReporte<ReporteInventarioResponse>>(
    vacio(),
  );
  readonly reservas = signal<EstadoReporte<ReporteReservasResponse>>(vacio());
  readonly devoluciones = signal<EstadoReporte<ReporteDevolucionesResponse>>(
    vacio(),
  );
  readonly pagos = signal<EstadoReporte<ReportePagosResponse>>(vacio());
  readonly compras = signal<EstadoReporte<ReporteComprasResponse>>(vacio());
  readonly clientes = signal<EstadoReporte<ReporteClientesCarritosResponse>>(
    vacio(),
  );
  readonly auditoria = signal<EstadoReporte<ReporteAuditoriaResponse>>(vacio());

  // ===== Paginación por tabla de detalle =====
  readonly paginaVentas = signal(1);
  readonly paginaInventario = signal(1);
  readonly paginaAuditoria = signal(1);

  // ===== Métricas seleccionables en las gráficas =====
  readonly metricaEvolucion = signal<'MONTO' | 'CANTIDAD' | 'UNIDADES'>('MONTO');
  readonly metricaSucursal = signal<'MONTO' | 'UNIDADES'>('MONTO');

  // ===== Exportación =====
  readonly exportando = signal<FormatoExportacion | null>(null);
  readonly menuExportar = signal(false);
  readonly errorExportar = signal<string | null>(null);

  readonly sucursales = signal<{ id: number; nombre: string }[]>([]);

  // ===== Derivados de la sección activa =====
  readonly esAdministrador = computed(() => this.auth.esAdministrador());
  readonly tabs = computed(() =>
    TABS_REPORTES.filter((t) => t.id !== 'AUDITORIA' || this.esAdministrador()),
  );
  readonly etiquetaActiva = computed(
    () => TABS_REPORTES.find((t) => t.id === this.tab())?.label ?? 'Reporte',
  );
  readonly estadoActivo = computed(() => this.estadoDe(this.tab()));
  readonly cargandoActivo = computed(() => this.estadoActivo().cargando);
  readonly errorActivo = computed(() => this.estadoActivo().error);

  readonly alcanceTexto = computed(() => {
    const alcance = this.metadatosActivos()?.alcance ?? null;
    if (alcance === null) {
      return 'Todas las sucursales';
    }
    return alcance.es_global
      ? 'Todas las sucursales'
      : (alcance.sucursal_nombre ?? 'Sucursal asignada');
  });

  readonly generadoEn = computed(() =>
    this.fechaHora(this.metadatosActivos()?.generado_en ?? ''),
  );

  readonly periodoTexto = computed(() => {
    const filtros = this.aplicados();
    if (!filtros.fecha_desde && !filtros.fecha_hasta) {
      return 'Sin filtro de fechas';
    }
    return `${this.fechaCorta(filtros.fecha_desde ?? null)} — ${this.fechaCorta(
      filtros.fecha_hasta ?? null,
    )}`;
  });

  readonly agrupacionTexto = computed(() =>
    this.aplicados().agrupacion === 'MES' ? 'Agrupado por mes' : 'Agrupado por día',
  );

  // ===== Gráficas del RESUMEN =====
  readonly evolucionResumen = computed(() =>
    evolucion(
      this.dashboard().datos?.ventas_evolucion ?? [],
      this.metricaEvolucion(),
      'Ventas',
    ),
  );
  readonly canalesResumen = computed(() =>
    donut(
      this.dashboard().datos?.ventas_por_canal ?? [],
      (canal) => this.etiquetaCanal(canal.canal),
      (canal) => canal.cantidad_ventas,
      'Ventas',
    ),
  );
  readonly sucursalesGrafica = computed(() =>
    comparativoSucursales(
      this.dashboard().datos?.comparativo_sucursales ?? [],
      this.metricaSucursal(),
    ),
  );
  readonly topProductosResumen = computed(() =>
    rankingFilas(
      this.dashboard().datos?.top_productos ?? [],
      (producto) => producto.producto_nombre,
      (producto) => producto.unidades,
      (producto) => producto.monto,
    ),
  );
  readonly reservasResumen = computed(() =>
    donutConteo(this.dashboard().datos?.resumen_reservas.por_estado ?? []),
  );
  readonly devolucionesResumen = computed(() =>
    donutConteo(this.dashboard().datos?.resumen_devoluciones.por_estado ?? []),
  );

  // ===== Gráficas del reporte de VENTAS =====
  readonly evolucionVentas = computed(() =>
    evolucion(
      this.ventas().datos?.evolucion ?? [],
      this.metricaEvolucion(),
      'Ventas completadas',
    ),
  );
  readonly canalVentas = computed(() =>
    donut(
      this.ventas().datos?.ventas_por_canal ?? [],
      (canal) => this.etiquetaCanal(canal.canal),
      (canal) => canal.cantidad,
      'Ventas',
    ),
  );
  readonly estadoVentas = computed(() =>
    donut(
      this.ventas().datos?.ventas_por_estado ?? [],
      (fila) => this.etiquetaSimple(fila.estado),
      (fila) => fila.cantidad,
      'Ventas',
    ),
  );
  readonly sucursalVentas = computed(() =>
    comparativoSucursales(
      (this.ventas().datos?.ventas_por_sucursal ?? []).map((sucursal) => ({
        sucursal_id: sucursal.sucursal_id,
        sucursal_nombre: sucursal.sucursal_nombre,
        ventas: sucursal.cantidad,
        monto_vendido: sucursal.monto,
        unidades: sucursal.unidades,
        ticket_promedio: sucursal.ticket_promedio,
        reservas: 0,
        devoluciones: 0,
      })),
      this.metricaSucursal(),
    ),
  );
  readonly empleadoVentas = computed(() =>
    rankingFilas(
      this.ventas().datos?.ventas_por_empleado ?? [],
      (empleado) => empleado.empleado_nombre,
      (empleado) => empleado.cantidad,
      (empleado) => empleado.monto,
    ),
  );

  // ===== Gráficas del reporte de PRODUCTOS =====
  readonly topProductosUnidades = computed(() =>
    rankingFilas(
      this.productos().datos?.top_productos_por_unidades ?? [],
      (producto) => producto.producto_nombre,
      (producto) => producto.unidades,
      (producto) => producto.monto,
    ),
  );
  readonly topProductosMonto = computed(() =>
    rankingFilas(
      this.productos().datos?.top_productos_por_monto ?? [],
      (producto) => producto.producto_nombre,
      (producto) => producto.unidades,
      (producto) => producto.monto,
    ),
  );
  readonly categoriaProductos = computed(() =>
    rankingMontoFila(this.productos().datos?.ventas_por_categoria ?? []),
  );
  readonly tallaProductos = computed(() =>
    rankingMontoFila(this.productos().datos?.tallas_mas_vendidas ?? []),
  );
  readonly colorProductos = computed(() =>
    rankingMontoFila(this.productos().datos?.colores_mas_vendidos ?? []),
  );
  readonly temporadaProductos = computed(() =>
    rankingMontoFila(this.productos().datos?.ventas_por_temporada ?? []),
  );
  readonly coleccionProductos = computed(() =>
    rankingMontoFila(this.productos().datos?.ventas_por_coleccion ?? []),
  );
  readonly categoriaGrafica = computed(() =>
    barras(
      this.productos().datos?.ventas_por_categoria ?? [],
      'UNIDADES',
      { cantidad: 'unidades', monto: 'monto' },
      'Unidades vendidas',
    ),
  );
  readonly varianteProductos = computed(() =>
    rankingFilas(
      this.productos().datos?.variantes_mas_vendidas ?? [],
      (variante) => `${variante.sku} · ${variante.talla}/${variante.color}`,
      (variante) => variante.unidades,
      (variante) => variante.monto,
    ),
  );

  // ===== Gráficas del reporte de INVENTARIO =====
  readonly movimientosInventario = computed(() =>
    barras(
      (this.inventario().datos?.movimientos_por_tipo ?? []).map((fila) => ({
        etiqueta: this.etiquetaMovimiento(fila.tipo),
        cantidad: fila.cantidad_movimientos,
        unidades: fila.unidades,
      })),
      'UNIDADES',
      { cantidad: 'cantidad', unidades: 'unidades' },
      'Unidades',
    ),
  );
  /** Variantes del detalle con stock disponible <= umbral (criterio real). */
  readonly alertasStock = computed(() => {
    const datos = this.inventario().datos;
    const umbral = datos?.resumen.umbral_stock_bajo ?? this.umbral();
    return rankingFilas(
      (datos?.items ?? []).filter(
        (item) => item.stock_disponible <= umbral,
      ),
      (item) => `${item.producto} · ${item.sku} (${item.talla}/${item.color})`,
      (item) => item.stock_disponible,
    );
  });

  // ===== Gráficas del reporte de RESERVAS =====
  readonly reservasGrafica = computed(() =>
    donut(
      this.reservas().datos?.reservas_por_estado ?? [],
      (fila) => this.etiquetaSimple(fila.estado),
      (fila) => fila.cantidad,
      'Reservas',
    ),
  );
  readonly evolucionReservas = computed(() =>
    evolucion(
      this.reservas().datos?.evolucion ?? [],
      this.metricaEvolucion(),
      'Reservas',
    ),
  );
  readonly sucursalReservas = computed(() =>
    barras(
      (this.reservas().datos?.reservas_por_sucursal ?? []).map((fila) => ({
        etiqueta: fila.sucursal_nombre,
        cantidad: fila.cantidad,
        unidades: fila.unidades,
      })),
      'CANTIDAD',
      { cantidad: 'cantidad', unidades: 'unidades' },
      'Reservas',
    ),
  );

  // ===== Gráficas del reporte de DEVOLUCIONES =====
  readonly devolucionesGrafica = computed(() =>
    donut(
      this.devoluciones().datos?.devoluciones_por_estado ?? [],
      (fila) => this.etiquetaSimple(fila.estado),
      (fila) => fila.cantidad,
      'Devoluciones',
    ),
  );
  readonly evolucionDevoluciones = computed(() =>
    evolucion(
      this.devoluciones().datos?.evolucion ?? [],
      this.metricaEvolucion(),
      'Devoluciones',
    ),
  );
  readonly productosDevueltos = computed(() =>
    rankingFilas(
      this.devoluciones().datos?.productos_mas_devueltos ?? [],
      (fila) => fila.producto_nombre,
      (fila) => fila.unidades,
      (fila) => fila.valor_referencial,
    ),
  );
  readonly motivosDevolucion = computed(() =>
    rankingFilas(
      this.devoluciones().datos?.motivos_mas_frecuentes ?? [],
      (fila) => this.etiquetaSimple(fila.motivo),
      (fila) => fila.cantidad_devoluciones,
      () => 0,
    ),
  );

  // ===== Gráficas del reporte de PAGOS =====
  readonly metodoPagos = computed(() =>
    donut(
      this.pagos().datos?.pagos_por_metodo ?? [],
      (fila) => this.etiquetaSimple(fila.metodo),
      (fila) => fila.cantidad,
      'Transacciones',
    ),
  );
  readonly estadoPagos = computed(() =>
    donut(
      this.pagos().datos?.pagos_por_estado ?? [],
      (fila) => this.etiquetaSimple(fila.estado),
      (fila) => fila.cantidad,
      'Transacciones',
    ),
  );
  readonly pasarelaPagos = computed(() =>
    donut(
      this.pagos().datos?.pagos_por_pasarela ?? [],
      (fila) => this.etiquetaSimple(fila.pasarela),
      (fila) => fila.cantidad,
      'Transacciones',
    ),
  );
  readonly evolucionPagos = computed(() =>
    evolucion(
      this.pagos().datos?.evolucion ?? [],
      this.metricaEvolucion(),
      'Transacciones',
    ),
  );

  // ===== Gráficas del reporte de COMPRAS =====
  readonly estadoCompras = computed(() =>
    barras(
      (this.compras().datos?.ordenes_por_estado ?? []).map((fila) => ({
        etiqueta: this.etiquetaSimple(fila.estado),
        cantidad: fila.cantidad,
        valor: fila.valor,
      })),
      'MONTO',
      { cantidad: 'cantidad', monto: 'valor' },
      'Valor de órdenes',
    ),
  );
  readonly proveedorCompras = computed(() =>
    rankingFilas(
      this.compras().datos?.ordenes_por_proveedor ?? [],
      (fila) => fila.razon_social,
      (fila) => fila.unidades_ordenadas,
      (fila) => fila.valor_ordenes,
    ),
  );
  readonly sucursalCompras = computed(() =>
    barras(
      (this.compras().datos?.ordenes_por_sucursal ?? []).map((fila) => ({
        etiqueta: fila.sucursal_nombre,
        cantidad: fila.cantidad,
        valor: fila.valor,
      })),
      'MONTO',
      { cantidad: 'cantidad', monto: 'valor' },
      'Valor de órdenes',
    ),
  );
  readonly productosCompras = computed(() =>
    rankingFilas(
      this.compras().datos?.productos_abastecidos ?? [],
      (fila) => `${fila.producto_nombre} · ${fila.sku}`,
      (fila) => fila.unidades,
      (fila) => fila.valor,
    ),
  );

  // ===== Gráficas del reporte de CLIENTES / CARRITOS =====
  readonly carritosGrafica = computed(() =>
    donutConteo(this.clientes().datos?.resumen_carritos.por_estado ?? []),
  );
  readonly topCompradores = computed(() =>
    rankingFilas(
      this.clientes().datos?.compras_por_cliente ?? [],
      (fila) => `${fila.nombre} ${fila.apellido}`.trim(),
      (fila) => fila.unidades,
      (fila) => fila.monto,
    ),
  );

  // ===== Gráficas del reporte de AUDITORÍA (solo ADMINISTRADOR) =====
  readonly auditoriaAccion = computed(() =>
    barras(
      this.auditoria().datos?.eventos_por_accion ?? [],
      'CANTIDAD',
      { cantidad: 'cantidad' },
      'Eventos',
    ),
  );
  readonly auditoriaEntidad = computed(() =>
    barras(
      this.auditoria().datos?.eventos_por_entidad ?? [],
      'CANTIDAD',
      { cantidad: 'cantidad' },
      'Eventos',
    ),
  );
  readonly auditoriaUsuario = computed(() =>
    rankingFilas(
      this.auditoria().datos?.eventos_por_usuario ?? [],
      (fila) => fila.etiqueta,
      (fila) => fila.cantidad,
    ),
  );
  readonly auditoriaEvolucion = computed(() =>
    evolucion(
      this.auditoria().datos?.evolucion ?? [],
      'CANTIDAD',
      'Eventos',
    ),
  );

  private metadatosActivos(): MetadatosReporte | null {
    const estado = this.estadoDe(this.tab()).datos as {
      metadatos?: MetadatosReporte;
    } | null;
    return estado?.metadatos ?? null;
  }

  /** Estado de carga de la sección indicada (sin disparar peticiones). */
  private estadoDe(tipo: TipoReporte): { cargando: boolean; error: ErrorReporte | null; datos: unknown } {
    switch (tipo) {
      case 'VENTAS':
        return this.ventas();
      case 'PRODUCTOS':
        return this.productos();
      case 'INVENTARIO':
        return this.inventario();
      case 'RESERVAS':
        return this.reservas();
      case 'DEVOLUCIONES':
        return this.devoluciones();
      case 'PAGOS':
        return this.pagos();
      case 'COMPRAS_PROVEEDORES':
        return this.compras();
      case 'CLIENTES_CARRITOS':
        return this.clientes();
      case 'AUDITORIA':
        return this.auditoria();
      default:
        return this.dashboard();
    }
  }

  // ===== Filtros =====
  /** Solo APLICAR (o un rango rápido) dispara consultas al backend. */
  aplicarFiltros(): void {
    const desde = this.desde();
    const hasta = this.hasta();
    if (desde !== null && hasta !== null && desde > hasta) {
      this.aviso.set(
        'La fecha "desde" no puede ser posterior a la fecha "hasta".',
      );
      return;
    }
    this.aviso.set(null);
    this.aplicados.set({
      fecha_desde: desde,
      fecha_hasta: hasta,
      sucursal_id: this.esAdministrador() ? this.sucursalId() : null,
      agrupacion: this.agrupacion(),
      top: this.top(),
      umbral_stock_bajo: this.umbral(),
    });
    this.paginaVentas.set(1);
    this.paginaInventario.set(1);
    this.paginaAuditoria.set(1);
    this.cargar(this.tab());
  }

  /** Acceso rápido: rellena fechas y consulta el reporte activo. */
  aplicarRango(id: RangoRapido): void {
    const rango = rangoRapido(id);
    this.desde.set(rango.desde);
    this.hasta.set(rango.hasta);
    this.aplicarFiltros();
  }

  /** Cambiar de sección consulta SOLO su endpoint (sin recargar la página). */
  cambiarReporte(tipo: TipoReporte): void {
    this.tab.set(tipo);
    const estado = this.estadoDe(tipo);
    if (estado.datos === null && !estado.cargando) {
      this.cargar(tipo);
    }
  }

  reintentar(): void {
    this.cargar(this.tab());
  }

  cerrarAviso(): void {
    this.aviso.set(null);
  }

  // ===== Carga por sección =====
  private cargar(tipo: TipoReporte): void {
    const filtros = this.aplicados();
    const base: ReportesFiltros = {
      ...filtros,
      tamano_pagina: TAMANO_PAGINA_REPORTES,
    };

    switch (tipo) {
      case 'VENTAS':
        this.ejecutar(
          this.ventas,
          this.reportes.consultarVentas({
            ...base,
            pagina: this.paginaVentas(),
          }),
        );
        return;
      case 'PRODUCTOS':
        this.ejecutar(this.productos, this.reportes.consultarProductos(base));
        return;
      case 'INVENTARIO':
        this.ejecutar(
          this.inventario,
          this.reportes.consultarInventario({
            ...base,
            pagina: this.paginaInventario(),
          }),
        );
        return;
      case 'RESERVAS':
        this.ejecutar(this.reservas, this.reportes.consultarReservas(base));
        return;
      case 'DEVOLUCIONES':
        this.ejecutar(
          this.devoluciones,
          this.reportes.consultarDevoluciones(base),
        );
        return;
      case 'PAGOS':
        this.ejecutar(this.pagos, this.reportes.consultarPagos(base));
        return;
      case 'COMPRAS_PROVEEDORES':
        this.ejecutar(
          this.compras,
          this.reportes.consultarComprasProveedores(base),
        );
        return;
      case 'CLIENTES_CARRITOS':
        this.ejecutar(
          this.clientes,
          this.reportes.consultarClientesCarritos(base),
        );
        return;
      case 'AUDITORIA':
        this.ejecutar(
          this.auditoria,
          this.reportes.consultarAuditoria({
            ...base,
            pagina: this.paginaAuditoria(),
          }),
        );
        return;
      default:
        this.ejecutar(this.dashboard, this.reportes.consultarDashboard(base));
    }
  }

  /** Ejecuta una consulta y refleja cargando/error/datos en su sección. */
  private ejecutar<T>(
    destino: WritableSignal<{
      cargando: boolean;
      error: ErrorReporte | null;
      datos: T | null;
    }>,
    peticion: Observable<T>,
  ): void {
    destino.set({ cargando: true, error: null, datos: null });
    peticion.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (datos) => destino.set({ cargando: false, error: null, datos }),
      error: (error: unknown) =>
        destino.set({
          cargando: false,
          error: traducirErrorReporte(error, this.mensajeErrorDe(this.tab())),
          datos: null,
        }),
    });
  }

  private mensajeErrorDe(tipo: TipoReporte): string {
    return tipo === 'AUDITORIA'
      ? 'No pudimos cargar la auditoría.'
      : 'No pudimos cargar los indicadores.';
  }

  // ===== Paginación de las tablas de detalle =====
  irPagina(
    reporte: 'VENTAS' | 'INVENTARIO' | 'AUDITORIA',
    pagina: number,
  ): void {
    if (reporte === 'VENTAS') {
      this.paginaVentas.set(pagina);
    } else if (reporte === 'INVENTARIO') {
      this.paginaInventario.set(pagina);
    } else {
      this.paginaAuditoria.set(pagina);
    }
    this.cargar(reporte);
  }

  /** Ventana de páginas visibles (máximo 5) para no llenar la cabecera. */
  paginasVisibles(actual: number, total: number): number[] {
    if (total <= 5) {
      return Array.from({ length: total }, (_, indice) => indice + 1);
    }
    const inicio = Math.min(Math.max(actual - 2, 1), total - 4);
    return Array.from({ length: 5 }, (_, indice) => inicio + indice);
  }

  // ===== Exportación (PDF / XLSX / CSV) =====
  alternarMenuExportar(): void {
    this.menuExportar.update((abierto) => !abierto);
  }

  cerrarMenuExportar(): void {
    this.menuExportar.set(false);
  }

  /** Exporta el REPORTE ACTIVO con los filtros aplicados al dashboard. */
  exportar(formato: FormatoExportacion): void {
    this.menuExportar.set(false);
    if (this.exportando() !== null) {
      return; // evita el doble click
    }
    this.errorExportar.set(null);
    this.exportando.set(formato);

    this.reportes
      .exportarReporte(this.tab(), formato, this.aplicados())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (archivo) => {
          this.descargar(archivo);
          this.exportando.set(null);
        },
        error: (error: unknown) => {
          this.errorExportar.set(
            traducirErrorReporte(error, '', true).mensaje,
          );
          this.exportando.set(null);
        },
      });
  }

  /**
   * Descarga el archivo del backend usando un object URL.
   *
   * SSR-safe: las APIs de navegador solo se usan en el navegador y el URL se
   * revoca al terminar la descarga.
   */
  private descargar(archivo: ReporteExportado): void {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }
    const url = URL.createObjectURL(archivo.blob);
    const enlace = document.createElement('a');
    enlace.href = url;
    enlace.download = archivo.nombre;
    enlace.rel = 'noopener';
    enlace.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  ngOnInit(): void {
    // Un único request inicial: GET /reportes/dashboard (mes actual).
    const rango = rangoRapido('MES_ACTUAL');
    this.desde.set(rango.desde);
    this.hasta.set(rango.hasta);
    this.aplicarFiltros();

    if (this.esAdministrador()) {
      this.sucursalesService
        .listarSucursalesActivas()
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (lista) =>
            this.sucursales.set(
              lista.map((sucursal) => ({
                id: sucursal.id,
                nombre: sucursal.nombre,
              })),
            ),
          error: () => this.sucursales.set([]),
        });
    }
  }

  // ===== Handlers de filtros (controles nativos del template) =====
  onDesde(valor: string): void {
    this.desde.set(valor === '' ? null : valor);
  }

  onHasta(valor: string): void {
    this.hasta.set(valor === '' ? null : valor);
  }

  onSucursal(valor: string): void {
    this.sucursalId.set(valor === '' ? null : Number(valor));
  }

  onAgrupacion(valor: string): void {
    this.agrupacion.set(valor === 'MES' ? 'MES' : 'DIA');
  }

  onTop(valor: string): void {
    this.top.set(Number(valor) || TOP_OPCIONES[1]);
  }

  onUmbral(valor: string): void {
    this.umbral.set(
      valor === '' ? UMBRAL_STOCK_BAJO_POR_DEFECTO : Number(valor),
    );
  }
}
