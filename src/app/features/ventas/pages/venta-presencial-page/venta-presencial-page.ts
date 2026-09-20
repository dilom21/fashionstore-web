import { DecimalPipe } from '@angular/common';
import {
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { ToastService } from '../../../../core/services/toast.service';
import { AdminIcon } from '../../../administracion/components/admin-icon/admin-icon';
import { Producto } from '../../../administracion/catalogo/models/producto.model';
import { ProductosService } from '../../../administracion/catalogo/services/productos.service';
import { AuthService } from '../../../autenticacion-seguridad/auth/services/auth.service';
import { PagoPresencialDialog } from '../../components/pago-presencial-dialog/pago-presencial-dialog';
import {
  PagoPresencialResponse,
  etiquetaMetodoPago,
} from '../../models/pago-presencial.model';
import { VentaPresencialResponse } from '../../models/venta-presencial.model';
import { VentaPresencialService } from '../../services/venta-presencial.service';
import {
  PosVarianteDisponible,
  filtrarCandidatos,
  mapearDisponibilidadPos,
} from '../../utils/pos-inventario.util';
import { traducirErrorVentaPresencial } from '../../utils/venta-presencial-error.util';

/** Línea seleccionada del POS (estado SOLO local). */
interface LineaVenta {
  candidato: PosVarianteDisponible;
  cantidad: number;
}

/**
 * CU20 - Registrar venta presencial directa (/personal/ventas/presencial).
 *
 * POS de tienda: busca productos en el catálogo público, muestra sus variantes
 * con stock por sucursal y arma una venta que termina en estado PENDIENTE.
 *
 * Fuente de inventario: el CAJERO no puede consultar GET /inventario (403), por
 * lo que se reutiliza `GET /productos/{id}` (público), que sí expone
 * `inventario_id`, sucursal y stock. No se modifica backend ni permisos.
 *
 * La venta es anónima (cliente_id = null): no existe un buscador de clientes
 * reutilizable y el esquema admite venta sin cliente. No se inventan datos.
 * El backend decide empleado, sucursal, precios y total.
 */
@Component({
  selector: 'app-venta-presencial-page',
  imports: [AdminIcon, DecimalPipe, PagoPresencialDialog],
  styleUrl: './venta-presencial-page.css',
  templateUrl: './venta-presencial-page.html',
})
export class VentaPresencialPage {
  private readonly productosService = inject(ProductosService);
  private readonly ventaPresencialService = inject(VentaPresencialService);
  private readonly authService = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  readonly termino = signal('');
  readonly buscando = signal(false);
  readonly productos = signal<Producto[]>([]);
  readonly busquedaRealizada = signal(false);

  readonly productoSeleccionado = signal<Producto | null>(null);
  readonly cargandoVariantes = signal(false);
  readonly filtroVariantes = signal('');
  readonly candidatos = signal<PosVarianteDisponible[]>([]);

  readonly seleccion = signal<ReadonlyMap<number, LineaVenta>>(new Map());
  readonly procesando = signal(false);
  readonly error = signal<string | null>(null);
  readonly venta = signal<VentaPresencialResponse | null>(null);

  /** CU21: diálogo de pago presencial y su resultado aprobado. */
  readonly mostrarPago = signal(false);
  readonly pago = signal<PagoPresencialResponse | null>(null);

  readonly lineas = computed<LineaVenta[]>(() => [...this.seleccion().values()]);

  readonly candidatosFiltrados = computed(() =>
    filtrarCandidatos(this.candidatos(), this.filtroVariantes()),
  );

  readonly unidades = computed(() =>
    this.lineas().reduce((total, linea) => total + linea.cantidad, 0),
  );

  /** Total solo de presentación: la autoridad es el backend. */
  readonly totalEstimado = computed(() =>
    this.lineas().reduce(
      (total, linea) => total + linea.cantidad * linea.candidato.precio,
      0,
    ),
  );

  /** Sucursal fijada por la selección actual (una sola por venta). */
  readonly sucursalVenta = computed<number | null>(() => {
    const primera = this.lineas()[0];
    return primera ? primera.candidato.sucursal_id : null;
  });

  readonly nombreSucursal = computed(
    () => this.lineas()[0]?.candidato.sucursal_nombre ?? null,
  );

  readonly puedeRegistrar = computed(
    () =>
      this.venta() === null &&
      !this.procesando() &&
      this.lineas().length > 0,
  );

  /** Estado visual de la venta. `PENDIENTE` es un resultado correcto. */
  readonly estadoVenta = computed(() => {
    const estado = (this.venta()?.estado ?? '').trim().toUpperCase();
    return estado === 'PENDIENTE' ? 'PENDIENTE DE PAGO' : estado;
  });

  /** true mientras exista una venta PENDIENTE sin pago aprobado (CU21). */
  readonly puedePagar = computed(
    () => this.venta() !== null && this.pago() === null,
  );

  /**
   * Estado final de la venta: el que devolvió el backend tras el pago. Antes
   * del pago cae al estado de la venta recién registrada.
   */
  readonly estadoFinalVenta = computed(
    () => this.pago()?.estado_venta ?? this.estadoVenta(),
  );

  // ===== Búsqueda de catálogo =====

  actualizarTermino(valor: string): void {
    this.termino.set(valor);
  }

  buscar(): void {
    const texto = this.termino().trim();
    if (!texto) {
      this.productos.set([]);
      this.busquedaRealizada.set(false);
      return;
    }

    this.buscando.set(true);
    this.busquedaRealizada.set(false);
    this.productoSeleccionado.set(null);
    this.candidatos.set([]);

    this.productosService
      .listarProductosPublicos({ buscar: texto })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (productos) => {
          this.buscando.set(false);
          this.busquedaRealizada.set(true);
          this.productos.set(productos);
        },
        error: () => {
          this.buscando.set(false);
          this.busquedaRealizada.set(true);
          this.productos.set([]);
          this.toast.mostrar(
            'No pudimos consultar el catálogo. Intenta nuevamente.',
            'error',
          );
        },
      });
  }

  seleccionarProducto(producto: Producto): void {
    this.productoSeleccionado.set(producto);
    this.cargandoVariantes.set(true);
    this.filtroVariantes.set('');
    this.candidatos.set([]);

    this.productosService
      .obtenerProductoPublico(producto.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (detalle) => {
          this.cargandoVariantes.set(false);
          this.candidatos.set(
            mapearDisponibilidadPos(detalle, this.sucursalPermitida()),
          );
        },
        error: () => {
          this.cargandoVariantes.set(false);
          this.candidatos.set([]);
          this.toast.mostrar(
            'No pudimos cargar la disponibilidad del producto.',
            'error',
          );
        },
      });
  }

  actualizarFiltroVariantes(valor: string): void {
    this.filtroVariantes.set(valor);
  }

  /**
   * Sucursal permitida al cargar disponibilidad: la fijada por la selección o,
   * para CAJERO/ENCARGADO, la de su empleado. El ADMINISTRADOR puede ver todas
   * hasta que el primer ítem fije el contexto.
   */
  private sucursalPermitida(): number | null {
    const bloqueada = this.sucursalVenta();
    if (bloqueada !== null) {
      return bloqueada;
    }
    if (this.authService.esAdministrador()) {
      return null;
    }
    return this.authService.sucursalId();
  }

  // ===== Selección (estado SOLO local) =====

  agregar(candidato: PosVarianteDisponible): void {
    if (this.venta() !== null) {
      return;
    }

    const bloqueada = this.sucursalVenta();
    if (bloqueada !== null && bloqueada !== candidato.sucursal_id) {
      this.toast.mostrar(
        'Los productos deben pertenecer a una sola sucursal.',
        'error',
      );
      return;
    }

    this.seleccion.update((actual) => {
      const siguiente = new Map(actual);
      const existente = siguiente.get(candidato.inventario_id);
      const cantidad = existente
        ? Math.min(existente.cantidad + 1, candidato.stock_disponible)
        : 1;
      siguiente.set(candidato.inventario_id, { candidato, cantidad });
      return siguiente;
    });
  }

  cambiarCantidad(inventarioId: number, delta: number): void {
    this.seleccion.update((actual) => {
      const linea = actual.get(inventarioId);
      if (!linea) {
        return actual;
      }
      const cantidad = Math.min(
        Math.max(1, linea.cantidad + delta),
        linea.candidato.stock_disponible,
      );
      const siguiente = new Map(actual);
      siguiente.set(inventarioId, { ...linea, cantidad });
      return siguiente;
    });
  }

  quitar(inventarioId: number): void {
    this.seleccion.update((actual) => {
      const siguiente = new Map(actual);
      siguiente.delete(inventarioId);
      return siguiente;
    });
  }

  // ===== Registro de la venta =====

  registrarVenta(): void {
    if (!this.puedeRegistrar()) {
      return;
    }

    this.error.set(null);
    this.procesando.set(true);

    const items = this.lineas().map((linea) => ({
      inventario_id: linea.candidato.inventario_id,
      cantidad: linea.cantidad,
    }));

    // Venta directa y anónima: sin cliente_id ni campos server-owned.
    this.ventaPresencialService
      .registrarVentaDirecta(items)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (venta) => {
          this.procesando.set(false);
          this.venta.set(venta);
          this.toast.mostrar('Venta registrada: PENDIENTE DE PAGO.', 'ok');
        },
        error: (error: unknown) => {
          this.procesando.set(false);
          const traducido = traducirErrorVentaPresencial(error);
          if (traducido.sesionExpirada) {
            this.cerrarSesion();
            return;
          }
          this.error.set(traducido.mensaje);
          this.toast.mostrar(traducido.mensaje, 'error');
        },
      });
  }

  nuevaVenta(): void {
    this.venta.set(null);
    this.error.set(null);
    this.seleccion.set(new Map());
    this.productoSeleccionado.set(null);
    this.candidatos.set([]);
    this.productos.set([]);
    this.termino.set('');
    this.filtroVariantes.set('');
    this.busquedaRealizada.set(false);
    // La nueva venta no hereda el pago anterior (CU21).
    this.pago.set(null);
    this.mostrarPago.set(false);
  }

  // ===== CU21 - Pago presencial =====

  /** Abre el diálogo de pago para la venta PENDIENTE registrada. */
  abrirPago(): void {
    if (!this.puedePagar()) {
      return;
    }
    this.mostrarPago.set(true);
  }

  cerrarPago(): void {
    this.mostrarPago.set(false);
  }

  /**
   * El backend aprobó el pago y confirmó la venta: se refleja el estado final
   * real. El diálogo permanece abierto mostrando el resultado hasta cerrarlo.
   */
  onPagado(pago: PagoPresencialResponse): void {
    this.pago.set(pago);
    this.toast.mostrar(
      `Pago #${pago.pago_id} registrado: ${pago.estado_pago}.`,
      'ok',
    );
  }

  onSesionExpiradaPago(): void {
    this.cerrarSesion();
  }

  /** Etiqueta legible del método devuelto por el backend. */
  etiquetaMetodo(metodo: string): string {
    return etiquetaMetodoPago(metodo);
  }

  private cerrarSesion(): void {
    this.authService.cerrarSesion();
  }
}
