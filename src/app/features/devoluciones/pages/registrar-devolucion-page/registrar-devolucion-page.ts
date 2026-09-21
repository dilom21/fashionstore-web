import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';

import { AdminIcon } from '../../../administracion/components/admin-icon/admin-icon';
import { AuthService } from '../../../autenticacion-seguridad/auth/services/auth.service';
import {
  codigoVenta,
  etiquetaCanal,
  formatearFechaHora,
  formatearMonto,
} from '../../../ventas/models/comprobante-venta.model';
import { ConfirmDialog } from '../../../../shared/components/confirm-dialog/confirm-dialog';
import { DevolucionEstadoBadge } from '../../components/devolucion-estado-badge/devolucion-estado-badge';
import {
  DevolucionDetalle,
  DisponibilidadItem,
  DisponibilidadVenta,
  MOTIVOS_DEVOLUCION,
  MOTIVO_OTRO,
  RegistrarDevolucionRequest,
  codigoDevolucion,
} from '../../models/devolucion.model';
import { DevolucionService } from '../../services/devolucion.service';
import { ProductoImagenService } from '../../services/producto-imagen.service';
import {
  ErrorDevolucion,
  traducirErrorDisponibilidadVenta,
  traducirErrorRegistroDevolucion,
} from '../../utils/devolucion-error.util';

/** Línea seleccionada para devolver (cantidad + motivo opcional). */
interface SeleccionLinea {
  detalle_venta_id: number;
  cantidad: number;
  motivo: string;
}

/**
 * CU25 - Registrar devolución de productos (/personal/devoluciones/nueva).
 *
 * Flujo:
 *   1. validar la venta (`GET /devoluciones/ventas/{venta_id}/disponibilidad`);
 *   2. elegir prendas y cantidades (máximo `cantidad_disponible` del backend);
 *   3. motivo general obligatorio + motivo por línea opcional + observación;
 *   4. confirmar y `POST /devoluciones` -> SOLICITADA.
 *
 * El registro NO toca el inventario: solo crea la solicitud. El stock se repone
 * al PROCESAR la devolución aprobada. No hay reembolso ni Stripe.
 *
 * Las imágenes provienen del catálogo real (`ProductoImagenService`): una sola
 * consulta por `producto_id`, con cache.
 */
@Component({
  selector: 'app-registrar-devolucion-page',
  imports: [AdminIcon, ConfirmDialog, DevolucionEstadoBadge],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrls: [
    './registrar-devolucion-page.css',
    '../../styles/devoluciones-shared.css',
  ],
  templateUrl: './registrar-devolucion-page.html',
})
export class RegistrarDevolucionPage {
  private readonly devolucionService = inject(DevolucionService);
  private readonly imagenesService = inject(ProductoImagenService);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly motivos = MOTIVOS_DEVOLUCION;
  readonly motivoOtroValor = MOTIVO_OTRO;

  // ===== Venta =====
  readonly codigo = signal('');
  readonly validando = signal(false);
  readonly venta = signal<DisponibilidadVenta | null>(null);
  readonly errorVenta = signal<ErrorDevolucion | null>(null);

  // ===== Selección =====
  readonly seleccion = signal<SeleccionLinea[]>([]);
  readonly imagenes = signal<Record<number, string | null>>({});

  // ===== Motivos y observación =====
  readonly motivoGeneral = signal('');
  readonly motivoLibre = signal('');
  readonly observacion = signal('');

  // ===== Registro =====
  readonly confirmando = signal(false);
  readonly registrando = signal(false);
  readonly errorRegistro = signal<ErrorDevolucion | null>(null);
  readonly registrada = signal<DevolucionDetalle | null>(null);

  readonly ventaValidada = computed(() => this.venta() !== null);
  readonly items = computed<DisponibilidadItem[]>(
    () => this.venta()?.items ?? [],
  );
  readonly productosSeleccionados = computed(() => this.seleccion().length);
  readonly unidadesSeleccionadas = computed(() =>
    this.seleccion().reduce((total, linea) => total + linea.cantidad, 0),
  );

  /** Valor REFERENCIAL (precio × cantidad). No es un reembolso. */
  readonly valorReferencial = computed(() => {
    const items = this.items();
    return this.seleccion().reduce((total, linea) => {
      const item = items.find(
        (candidato) => candidato.detalle_venta_id === linea.detalle_venta_id,
      );
      return item === undefined
        ? total
        : total + item.precio_unitario * linea.cantidad;
    }, 0);
  });

  /** "Otro" exige descripción: nunca se envía la palabra suelta. */
  readonly motivoFinal = computed(() =>
    this.motivoGeneral() === MOTIVO_OTRO
      ? this.motivoLibre().trim()
      : this.motivoGeneral().trim(),
  );
  readonly motivoValido = computed(() => this.motivoFinal().length > 0);
  readonly requiereDescripcion = computed(
    () => this.motivoGeneral() === MOTIVO_OTRO,
  );
  readonly puedeRegistrar = computed(
    () =>
      this.ventaValidada() &&
      this.productosSeleccionados() > 0 &&
      this.motivoValido() &&
      !this.registrando(),
  );

  readonly codigoDevolucion = codigoDevolucion;
  readonly codigoVenta = codigoVenta;
  readonly formatearMonto = formatearMonto;
  readonly etiquetaCanal = etiquetaCanal;
  readonly formatearFechaHora = formatearFechaHora;

  // ===== Validación de la venta =====

  actualizarCodigo(valor: string): void {
    this.codigo.set(valor);
  }

  /** Acepta `557` o el código visual `VTA-00557`; el backend recibe el entero. */
  normalizarVentaId(valor: string): number | null {
    const limpio = (valor ?? '').trim().toUpperCase().replace(/^VTA-?/, '');
    if (!/^\d+$/.test(limpio)) {
      return null;
    }
    const id = Number(limpio);
    return Number.isInteger(id) && id > 0 ? id : null;
  }

  /** VALIDAR VENTA: consulta la disponibilidad real de la venta. */
  validarVenta(): void {
    if (this.validando() || this.registrando()) {
      return;
    }
    const id = this.normalizarVentaId(this.codigo());

    this.venta.set(null);
    this.seleccion.set([]);
    this.imagenes.set({});

    if (id === null) {
      this.errorVenta.set(
        traducirErrorDisponibilidadVenta(
          new HttpErrorResponse({ status: 404 }),
        ),
      );
      return;
    }

    this.validando.set(true);
    this.errorVenta.set(null);

    this.devolucionService
      .consultarDisponibilidadVenta(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (venta) => {
          this.validando.set(false);
          this.venta.set(venta);
          this.cargarImagenes(venta.items);
        },
        error: (error: unknown) => {
          this.validando.set(false);
          const traducido = traducirErrorDisponibilidadVenta(error);
          if (traducido.sesionExpirada) {
            this.cerrarSesion();
            return;
          }
          this.errorVenta.set(traducido);
        },
      });
  }

  /**
   * Revalida la venta tras un 409 de disponibilidad (otra devolución consumió
   * unidades). No se fuerza el request original.
   */
  actualizarDisponibilidad(): void {
    this.errorRegistro.set(null);
    this.registrada.set(null);
    this.validarVenta();
  }

  // ===== Selección de prendas =====

  esLineaSeleccionada(detalleVentaId: number): boolean {
    return this.seleccion().some(
      (linea) => linea.detalle_venta_id === detalleVentaId,
    );
  }

  cantidadDe(detalleVentaId: number): number | null {
    return (
      this.seleccion().find(
        (linea) => linea.detalle_venta_id === detalleVentaId,
      )?.cantidad ?? null
    );
  }

  motivoDe(detalleVentaId: number): string {
    return (
      this.seleccion().find(
        (linea) => linea.detalle_venta_id === detalleVentaId,
      )?.motivo ?? ''
    );
  }

  /** Marca/desmarca una prenda; al marcar arranca en 1 unidad. */
  alternarLinea(item: DisponibilidadItem, marcado: boolean): void {
    if (item.cantidad_disponible <= 0 || this.registrando()) {
      return;
    }
    if (!marcado) {
      this.seleccion.update((actuales) =>
        actuales.filter(
          (linea) => linea.detalle_venta_id !== item.detalle_venta_id,
        ),
      );
      return;
    }
    if (this.esLineaSeleccionada(item.detalle_venta_id)) {
      return;
    }
    this.seleccion.update((actuales) => [
      ...actuales,
      { detalle_venta_id: item.detalle_venta_id, cantidad: 1, motivo: '' },
    ]);
  }

  /** Cantidad entre 1 y `cantidad_disponible` (el backend sigue validando). */
  cambiarCantidad(item: DisponibilidadItem, valor: string | number): void {
    const numero = Number(valor);
    const maximo = Math.max(1, item.cantidad_disponible);
    const cantidad = Number.isFinite(numero)
      ? Math.min(Math.max(Math.trunc(numero), 1), maximo)
      : 1;
    this.seleccion.update((actuales) =>
      actuales.map((linea) =>
        linea.detalle_venta_id === item.detalle_venta_id
          ? { ...linea, cantidad }
          : linea,
      ),
    );
  }

  cambiarMotivoLinea(detalleVentaId: number, valor: string): void {
    this.seleccion.update((actuales) =>
      actuales.map((linea) =>
        linea.detalle_venta_id === detalleVentaId
          ? { ...linea, motivo: valor }
          : linea,
      ),
    );
  }

  /** Si la imagen real no carga, se sustituye por el placeholder (sin bucle). */
  marcarImagenRota(detalleVentaId: number): void {
    this.imagenes.update((actuales) => ({
      ...actuales,
      [detalleVentaId]: null,
    }));
  }

  // ===== Motivos y observación =====

  cambiarMotivoGeneral(valor: string): void {
    this.motivoGeneral.set(valor);
    if (valor !== MOTIVO_OTRO) {
      this.motivoLibre.set('');
    }
  }

  cambiarMotivoLibre(valor: string): void {
    this.motivoLibre.set(valor);
  }

  cambiarObservacion(valor: string): void {
    this.observacion.set(valor);
  }

  // ===== Registro =====

  solicitarRegistro(): void {
    if (!this.puedeRegistrar()) {
      return;
    }
    this.confirmando.set(true);
  }

  cancelarConfirmacion(): void {
    this.confirmando.set(false);
  }

  /** POST /devoluciones -> SOLICITADA (el inventario todavía no cambia). */
  confirmarRegistro(): void {
    if (!this.puedeRegistrar()) {
      return;
    }
    this.confirmando.set(false);
    this.registrando.set(true);
    this.errorRegistro.set(null);

    this.devolucionService
      .registrarDevolucion(this.construirPayload())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (detalle) => {
          this.registrando.set(false);
          this.registrada.set(detalle);
        },
        error: (error: unknown) => {
          this.registrando.set(false);
          const traducido = traducirErrorRegistroDevolucion(error);
          if (traducido.sesionExpirada) {
            this.cerrarSesion();
            return;
          }
          this.errorRegistro.set(traducido);
        },
      });
  }

  /** Solo `venta_id`, `motivo`, `observacion` y las líneas (precios no). */
  private construirPayload(): RegistrarDevolucionRequest {
    const venta = this.venta();
    return {
      venta_id: venta === null ? 0 : venta.venta_id,
      motivo: this.motivoFinal(),
      observacion: this.observacion().trim() || null,
      items: this.seleccion().map((linea) => ({
        detalle_venta_id: linea.detalle_venta_id,
        cantidad: linea.cantidad,
        motivo: linea.motivo.trim() || null,
      })),
    };
  }

  /** Una sola petición por producto; el mapa se actualiza al resolver. */
  private cargarImagenes(items: ReadonlyArray<DisponibilidadItem>): void {
    if (items.length === 0) {
      return;
    }
    this.imagenesService
      .imagenesDeLineas(
        items.map((item) => ({
          clave: item.detalle_venta_id,
          producto_id: item.producto_id,
          color_nombre: item.color_nombre,
        })),
      )
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((mapa) => this.imagenes.set(mapa));
  }

  // ===== Navegación =====

  verDevolucion(): void {
    const detalle = this.registrada();
    if (detalle === null) {
      return;
    }
    void this.router.navigate([
      '/personal',
      'devoluciones',
      detalle.devolucion_id,
    ]);
  }

  volverAlListado(): void {
    void this.router.navigate(['/personal', 'devoluciones']);
  }

  /** Sesión expirada: mecanismo existente del área de personal. */
  private cerrarSesion(): void {
    this.authService.cerrarSesion();
    void this.router.navigate(['/auth/personal/login'], {
      queryParams: { returnUrl: this.router.url },
    });
  }
}
