import { DecimalPipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import {
  Component,
  DestroyRef,
  OnInit,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  FormControl,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';

import { ToastService } from '../../../../core/services/toast.service';
import { ConfirmDialog } from '../../../../shared/components/confirm-dialog/confirm-dialog';
import { AdminIcon } from '../../../administracion/components/admin-icon/admin-icon';
import {
  formatearFecha,
  formatearFechaHora,
} from '../../../reservas/utils/reserva-fecha.util';
import { AuthService } from '../../../autenticacion-seguridad/auth/services/auth.service';
import { PagoPresencialDialog } from '../../../ventas/components/pago-presencial-dialog/pago-presencial-dialog';
import {
  PagoPresencialResponse,
  etiquetaMetodoPago,
} from '../../../ventas/models/pago-presencial.model';
import { VentaPresencialService } from '../../../ventas/services/venta-presencial.service';
import { traducirErrorVentaPresencial } from '../../../ventas/utils/venta-presencial-error.util';
import { PrendaAtencionCard } from '../../components/prenda-atencion-card/prenda-atencion-card';
import {
  AtencionReservaDetalle,
  AtencionReservaItem,
  EstadoReservaAtencion,
  OBSERVACION_MAX_LENGTH,
  PrepararVentaItemRequest,
  PrepararVentaResponse,
  VentaAtencionResumen,
} from '../../models/atencion-reserva.model';
import { AtencionReservasService } from '../../services/atencion-reservas.service';
import { traducirErrorAtencionReserva } from '../../utils/atencion-reserva-error.util';

/** Estado local de una línea (nunca se persiste automáticamente). */
interface EstadoLinea {
  seleccionada: boolean;
  cantidad: number;
  /** Última cantidad positiva: permite restaurarla al volver a marcar. */
  ultimaCantidad: number;
}

/** Acción en curso. */
type AccionAtencion = 'venta' | 'finalizar' | 'registrar-venta';

/**
 * CU18 - Atender reserva de prendas (/personal/reservas/atencion/:reserva_id).
 *
 * Pantalla operativa de la sucursal del empleado (nunca se elige sucursal).
 * - Preparar venta SOLO valida la selección: no crea venta, no cambia la
 *   reserva (sigue CONFIRMADA) y no toca inventario.
 * - Finalizar sin compra es la única acción que pasa la reserva a ATENDIDA
 *   (la liberación de stock_reservado la hace el backend).
 */
@Component({
  selector: 'app-atender-reserva-page',
  imports: [
    ReactiveFormsModule,
    AdminIcon,
    PrendaAtencionCard,
    ConfirmDialog,
    PagoPresencialDialog,
    DecimalPipe,
  ],
  styleUrl: './atender-reserva-page.css',
  templateUrl: './atender-reserva-page.html',
})
export class AtenderReservaPage implements OnInit {
  private readonly atencionService = inject(AtencionReservasService);
  private readonly ventaPresencialService = inject(VentaPresencialService);
  private readonly authService = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);

  readonly reservaId = signal(0);
  readonly detalle = signal<AtencionReservaDetalle | null>(null);
  readonly cargando = signal(false);
  readonly error = signal<string | null>(null);

  /** Selección local de la atención (checkbox + cantidad por inventario_id). */
  readonly seleccion = signal<Record<number, EstadoLinea>>({});

  /** Observación de atención: SOLO se envía al finalizar sin compra. */
  readonly observacion = new FormControl('', {
    nonNullable: true,
    validators: [Validators.maxLength(OBSERVACION_MAX_LENGTH)],
  });

  readonly procesando = signal<AccionAtencion | null>(null);
  readonly confirmarFinalizar = signal(false);
  readonly resultado = signal<PrepararVentaResponse | null>(null);

  /**
   * Venta presencial (CU20) asociada a la reserva.
   *
   * Se registra en la sesión actual o se RECUPERA del backend al cargar el
   * detalle (`venta_asociada`): así, tras recargar o reabrir la atención, la
   * pantalla sigue sabiendo que existe una venta PENDIENTE. Mientras exista,
   * la reserva sigue CONFIRMADA y la única acción válida es registrar el pago
   * (CU21); se bloquean venta nueva y finalizar sin compra.
   */
  readonly ventaRegistrada = signal<VentaAtencionResumen | null>(null);

  /** CU21: diálogo de pago presencial y su resultado aprobado. */
  readonly mostrarPago = signal(false);
  readonly pagoRegistrado = signal<PagoPresencialResponse | null>(null);

  readonly maxObservacion = OBSERVACION_MAX_LENGTH;

  /** true solo si el backend admite atender la reserva (CONFIRMADA). */
  readonly atendible = computed(() =>
    this.atencionService.esAtendible(this.detalle()?.estado ?? ''),
  );

  /** ATENDIDA (o cualquier otro estado): vista de solo lectura. */
  readonly soloLectura = computed(
    () => this.detalle() !== null && !this.atendible(),
  );

  readonly totalLineas = computed(() => this.detalle()?.items.length ?? 0);

  readonly totalReservado = computed(() =>
    (this.detalle()?.items ?? []).reduce(
      (total, item) => total + item.cantidad_reservada,
      0,
    ),
  );

  readonly totalCompra = computed(() =>
    (this.detalle()?.items ?? []).reduce(
      (total, item) => total + (this.seleccion()[item.inventario_id]?.cantidad ?? 0),
      0,
    ),
  );

  readonly totalNoCompra = computed(() =>
    Math.max(0, this.totalReservado() - this.totalCompra()),
  );

  readonly lineasAComprar = computed(
    () =>
      (this.detalle()?.items ?? []).filter(
        (item) => (this.seleccion()[item.inventario_id]?.cantidad ?? 0) > 0,
      ).length,
  );

  /** Con al menos una unidad seleccionada la acción principal es la venta. */
  readonly haySeleccion = computed(() => this.totalCompra() > 0);

  /** Líneas normalizadas que sí se llevarán a la venta (cantidad_compra > 0). */
  readonly lineasVenta = computed(() =>
    (this.resultado()?.items ?? []).filter(
      (linea) => linea.cantidad_compra > 0,
    ),
  );

  /** CTA REGISTRAR VENTA: solo con selección validada, una sola vez. */
  readonly puedeRegistrarVenta = computed(
    () =>
      this.resultado() !== null &&
      this.ventaRegistrada() === null &&
      this.procesando() === null &&
      this.lineasVenta().length > 0,
  );

  /** Ya existe una venta para esta selección: no se permite re-registrar. */
  readonly ventaBloqueada = computed(() => this.ventaRegistrada() !== null);

  /**
   * CU21: se puede pagar mientras exista una venta PENDIENTE sin pago aprobado
   * y la reserva siga atendible (CONFIRMADA).
   */
  readonly puedePagarReserva = computed(
    () =>
      this.ventaRegistrada() !== null &&
      this.pagoRegistrado() === null &&
      !this.soloLectura(),
  );

  /** Estado de la reserva tras el pago (el backend lo devuelve). */
  readonly estadoReservaFinal = computed(
    () => this.pagoRegistrado()?.estado_reserva ?? this.detalle()?.estado ?? '',
  );

  /** Estado visual de la venta. `PENDIENTE` es un resultado correcto. */
  readonly estadoVentaRegistrada = computed(() => {
    const estado = (this.ventaRegistrada()?.estado ?? '').trim().toUpperCase();
    return estado === 'PENDIENTE' ? 'PENDIENTE DE PAGO' : estado;
  });

  constructor() {
    // La observación es texto libre: solo se envía al confirmar
    // "finalizar sin compra" (nunca se persiste automáticamente).
    //
    // El estado deshabilitado se gestiona en el propio FormControl (no con
    // [disabled] en el template, que Angular desaconseja junto a [formControl]).
    effect(() => {
      if (this.soloLectura() || this.ventaBloqueada()) {
        this.observacion.disable({ emitEvent: false });
      } else {
        this.observacion.enable({ emitEvent: false });
      }
    });
  }

  ngOnInit(): void {
    const id = Number(this.route.snapshot.paramMap.get('reserva_id'));
    if (!Number.isInteger(id) || id <= 0) {
      this.error.set('La reserva solicitada no es válida.');
      return;
    }
    this.reservaId.set(id);
    this.cargar(id);
  }

  // ===== Carga =====

  cargar(reservaId: number): void {
    this.cargando.set(true);
    this.error.set(null);
    this.atencionService
      .obtenerReserva(reservaId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (detalle) => {
          this.cargando.set(false);
          this.detalle.set(detalle);
          this.inicializarSeleccion(detalle);
          this.sincronizarVentaAsociada(detalle);
        },
        error: (error: unknown) => {
          this.cargando.set(false);
          this.detalle.set(null);
          const traducido = traducirErrorAtencionReserva(error);
          if (traducido.sesionExpirada) {
            this.cerrarSesion();
            return;
          }
          this.error.set(traducido.mensaje);
        },
      });
  }

  recargar(): void {
    if (this.reservaId() > 0) {
      this.cargar(this.reservaId());
    }
  }

  /**
   * Estado inicial: todas las prendas marcadas con la cantidad reservada
   * (el empleado ajusta según la decisión real del cliente).
   */
  private inicializarSeleccion(detalle: AtencionReservaDetalle): void {
    const mapa: Record<number, EstadoLinea> = {};
    for (const item of detalle.items) {
      mapa[item.inventario_id] = {
        seleccionada: true,
        cantidad: item.cantidad_reservada,
        ultimaCantidad: item.cantidad_reservada,
      };
    }
    this.seleccion.set(mapa);
  }

  /**
   * Recupera la venta asociada que expone el backend en el detalle CU18.
   *
   * Es la pieza clave del bug: sin esto, tras recargar o reabrir la atención el
   * frontend olvidaba que CU20 ya creó una venta y volvía a ofrecer FINALIZAR
   * SIN COMPRA. Si el backend no reporta venta, se limpia el estado local.
   */
  private sincronizarVentaAsociada(detalle: AtencionReservaDetalle): void {
    const asociada = detalle.venta_asociada;
    if (asociada === null || asociada === undefined) {
      this.ventaRegistrada.set(null);
      return;
    }
    this.ventaRegistrada.set({
      venta_id: asociada.venta_id,
      estado: asociada.estado,
      total: Number(asociada.total),
      canal: asociada.canal,
      reserva_id: detalle.reserva_id,
    });
  }

  // ===== Selección (estado SOLO local) =====

  seleccionadaDe(item: AtencionReservaItem): boolean {
    return this.seleccion()[item.inventario_id]?.seleccionada ?? true;
  }

  cantidadDe(item: AtencionReservaItem): number {
    return (
      this.seleccion()[item.inventario_id]?.cantidad ?? item.cantidad_reservada
    );
  }

  /**
   * Desmarcar deja la cantidad en 0; volver a marcar restaura la última
   * cantidad positiva (o 1 si no existe), nunca por encima de lo reservado.
   */
  cambiarSeleccion(item: AtencionReservaItem, seleccionada: boolean): void {
    if (this.soloLectura() || this.ventaBloqueada()) {
      return;
    }
    const maximo = item.cantidad_reservada;
    this.seleccion.update((actual) => {
      const previo = actual[item.inventario_id] ?? {
        seleccionada: true,
        cantidad: maximo,
        ultimaCantidad: maximo,
      };

      if (!seleccionada) {
        return {
          ...actual,
          [item.inventario_id]: {
            seleccionada: false,
            cantidad: 0,
            ultimaCantidad:
              previo.cantidad > 0 ? previo.cantidad : previo.ultimaCantidad,
          },
        };
      }

      const restaurada = Math.min(
        Math.max(1, previo.ultimaCantidad || 1),
        maximo,
      );
      return {
        ...actual,
        [item.inventario_id]: {
          seleccionada: true,
          cantidad: restaurada,
          ultimaCantidad: restaurada,
        },
      };
    });
  }

  /** La tarjeta ya limita 1..cantidad_reservada; se acota por seguridad. */
  cambiarCantidad(item: AtencionReservaItem, cantidad: number): void {
    if (this.soloLectura() || this.ventaBloqueada()) {
      return;
    }
    const valor = Math.min(Math.max(1, cantidad), item.cantidad_reservada);
    this.seleccion.update((actual) => ({
      ...actual,
      [item.inventario_id]: {
        seleccionada: true,
        cantidad: valor,
        ultimaCantidad: valor,
      },
    }));
  }

  // ===== Acción principal dinámica =====

  /**
   * Un solo botón: si hay unidades seleccionadas valida la venta; si no,
   * finaliza la atención sin compra (con confirmación).
   */
  accionPrincipal(): void {
    if (this.soloLectura() || this.procesando() !== null || this.ventaBloqueada()) {
      return;
    }
    if (this.haySeleccion()) {
      this.prepararVenta();
    } else {
      this.solicitarFinalizarSinCompra();
    }
  }

  /** Solo se envían prendas con cantidad_compra >= 1 (exigido por backend). */
  private itemsSeleccionados(): PrepararVentaItemRequest[] {
    const detalle = this.detalle();
    if (detalle === null) {
      return [];
    }
    const seleccion = this.seleccion();
    return detalle.items
      .map((item) => ({
        inventario_id: item.inventario_id,
        cantidad_compra: seleccion[item.inventario_id]?.cantidad ?? 0,
      }))
      .filter((item) => item.cantidad_compra > 0);
  }

  private prepararVenta(): void {
    const detalle = this.detalle();
    const items = this.itemsSeleccionados();
    if (detalle === null || items.length === 0) {
      return;
    }

    this.procesando.set('venta');
    this.atencionService
      .prepararVenta(detalle.reserva_id, { items })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (respuesta) => {
          this.procesando.set(null);
          this.resultado.set(respuesta);
          // La reserva SIGUE CONFIRMADA: preparar venta solo valida.
          this.toast.mostrar(
            'Selección validada. La reserva sigue confirmada.',
            'ok',
          );
        },
        error: (error: unknown) => {
          this.procesando.set(null);
          this.manejarErrorAccion(error);
        },
      });
  }

  cerrarResultado(): void {
    this.resultado.set(null);
  }

  // ===== CU20 - Registrar la venta de la selección validada =====

  /**
   * Registra la venta presencial a partir de la selección validada.
   *
   * Envía `reserva_id` + las líneas con `cantidad_compra > 0` mapeadas a
   * `cantidad`. NO envía `cliente_id` (lo deriva el backend de la reserva).
   * Tras el éxito la reserva SIGUE CONFIRMADA y no se libera ni descuenta nada.
   */
  registrarVentaDesdeReserva(): void {
    const resultado = this.resultado();
    if (resultado === null || !this.puedeRegistrarVenta()) {
      return;
    }

    const items = this.lineasVenta().map((linea) => ({
      inventario_id: linea.inventario_id,
      cantidad: linea.cantidad_compra,
    }));
    if (items.length === 0) {
      return;
    }

    this.procesando.set('registrar-venta');
    this.ventaPresencialService
      .registrarVentaDesdeReserva(resultado.reserva_id, items)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (venta) => {
          this.procesando.set(null);
          this.ventaRegistrada.set(venta);
          // La reserva sigue CONFIRMADA: CU20 solo crea la venta PENDIENTE.
          this.toast.mostrar(
            `Venta #${venta.venta_id} registrada: PENDIENTE DE PAGO.`,
            'ok',
          );
        },
        error: (error: unknown) => {
          this.procesando.set(null);
          const traducido = traducirErrorVentaPresencial(error);
          if (traducido.sesionExpirada) {
            this.cerrarSesion();
            return;
          }
          this.toast.mostrar(traducido.mensaje, 'error');
        },
      });
  }

  // ===== CU21 - Registrar pago presencial =====

  /** Abre el diálogo de pago de la venta PENDIENTE recién registrada. */
  abrirPago(): void {
    if (!this.puedePagarReserva()) {
      return;
    }
    this.mostrarPago.set(true);
  }

  cerrarPago(): void {
    this.mostrarPago.set(false);
  }

  /**
   * El pago fue APROBADO y el backend confirmó la venta (`sp_confirmar_venta`).
   *
   * Refleja el estado final de la reserva: si el response trae
   * `estado_reserva` se usa directamente; si no, se recarga la reserva una
   * sola vez tras el pago exitoso. NUNCA se llama a `finalizar-sin-compra` ni
   * se toca stock desde el frontend.
   */
  onPagado(pago: PagoPresencialResponse): void {
    this.pagoRegistrado.set(pago);
    // La venta ya está confirmada: el modal de CU20 deja de tener sentido.
    this.resultado.set(null);

    const detalle = this.detalle();
    if (pago.estado_reserva && detalle !== null) {
      this.detalle.set({
        ...detalle,
        estado: pago.estado_reserva as EstadoReservaAtencion,
      });
    } else {
      this.recargar();
    }

    this.toast.mostrar(
      `Pago #${pago.pago_id} registrado. Reserva ${this.estadoReservaFinal()}.`,
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

  // ===== Finalizar sin compra =====

  solicitarFinalizarSinCompra(): void {
    if (this.procesando() !== null || this.ventaBloqueada()) {
      return;
    }
    this.confirmarFinalizar.set(true);
  }

  cancelarFinalizar(): void {
    this.confirmarFinalizar.set(false);
  }

  /**
   * CONFIRMADA -> ATENDIDA. El backend libera stock_reservado; aquí solo se
   * refleja el response devuelto.
   */
  finalizarSinCompra(): void {
    this.confirmarFinalizar.set(false);
    const detalle = this.detalle();
    if (
      detalle === null ||
      this.procesando() !== null ||
      this.soloLectura() ||
      this.ventaBloqueada()
    ) {
      return;
    }

    const texto = this.observacion.value.trim();
    this.procesando.set('finalizar');
    this.atencionService
      .finalizarSinCompra(detalle.reserva_id, texto.length > 0 ? texto : null)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (respuesta) => {
          this.procesando.set(null);
          this.resultado.set(null);
          this.detalle.set(respuesta);
          this.toast.mostrar('Atención finalizada sin compra.', 'ok');
        },
        error: (error: unknown) => {
          this.procesando.set(null);
          this.manejarErrorAccion(error);
        },
      });
  }

  // ===== Navegación =====

  volverAlListado(): void {
    void this.router.navigateByUrl('/personal/reservas/atencion');
  }

  // ===== Presentación =====

  /** Código solo de presentación: la identidad real es `reserva_id`. */
  codigoReserva(reservaId: number): string {
    return `RES-${String(reservaId).padStart(5, '0')}`;
  }

  nombreCliente(reserva: {
    cliente_nombre: string;
    cliente_apellido: string;
  }): string {
    return `${reserva.cliente_nombre ?? ''} ${
      reserva.cliente_apellido ?? ''
    }`.trim();
  }

  fechaReserva(iso: string): string {
    return formatearFecha(iso);
  }

  fechaAtencion(iso: string): string {
    return formatearFechaHora(iso);
  }

  claseEstado(estado: string): string {
    return (estado ?? '').trim().toLowerCase() || 'desconocido';
  }

  /** Nombre del producto de una línea normalizada (modal de resultados). */
  nombreItemDeInventario(inventarioId: number): string {
    const item = (this.detalle()?.items ?? []).find(
      (linea) => linea.inventario_id === inventarioId,
    );
    return item?.producto_nombre ?? `Inventario #${inventarioId}`;
  }

  /** Líneas normalizadas que sí se llevarán a la venta. */
  lineasConCompra(): number {
    return (this.resultado()?.items ?? []).filter(
      (linea) => linea.cantidad_compra > 0,
    ).length;
  }

  // ===== Errores =====

  private manejarErrorAccion(error: unknown): void {
    const traducido = traducirErrorAtencionReserva(error);
    if (traducido.sesionExpirada) {
      this.cerrarSesion();
      return;
    }
    this.toast.mostrar(traducido.mensaje, 'error');

    // Reserva inexistente: no tiene sentido seguir en esta pantalla.
    if (error instanceof HttpErrorResponse && error.status === 404) {
      this.volverAlListado();
    }
    // 409/422: el estado local NO se altera (la reserva no cambió realmente).
  }

  private cerrarSesion(): void {
    this.authService.cerrarSesion();
    void this.router.navigateByUrl('/auth/personal/login');
  }
}
