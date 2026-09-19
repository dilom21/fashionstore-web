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
import { PrendaAtencionCard } from '../../components/prenda-atencion-card/prenda-atencion-card';
import {
  AtencionReservaDetalle,
  AtencionReservaItem,
  OBSERVACION_MAX_LENGTH,
  PrepararVentaItemRequest,
  PrepararVentaResponse,
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
type AccionAtencion = 'venta' | 'finalizar';

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
  ],
  styleUrl: './atender-reserva-page.css',
  templateUrl: './atender-reserva-page.html',
})
export class AtenderReservaPage implements OnInit {
  private readonly atencionService = inject(AtencionReservasService);
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

  /** Venta/Pago aún no está implementado: el CTA queda deshabilitado. */
  readonly ventaPendiente = true;

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

  constructor() {
    // La observación es texto libre: solo se envía al confirmar
    // "finalizar sin compra" (nunca se persiste automáticamente).
    //
    // El estado deshabilitado se gestiona en el propio FormControl (no con
    // [disabled] en el template, que Angular desaconseja junto a [formControl]).
    effect(() => {
      if (this.soloLectura()) {
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
    if (this.soloLectura()) {
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
    if (this.soloLectura()) {
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
    if (this.soloLectura() || this.procesando() !== null) {
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

  // ===== Finalizar sin compra =====

  solicitarFinalizarSinCompra(): void {
    if (this.procesando() !== null) {
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
    if (detalle === null || this.procesando() !== null) {
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
