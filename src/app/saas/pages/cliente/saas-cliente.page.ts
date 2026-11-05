import { DatePipe, DecimalPipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { forkJoin } from 'rxjs';

import { AdminIcon } from '../../../features/administracion/components/admin-icon/admin-icon';
import {
  CarritoClienteTenant,
  ComprobanteClienteTenant,
  ReservaClienteTenant,
  VentaClienteTenant,
} from '../../models/cliente-tenant.models';
import { SaasOfflinePanel } from '../../offline/saas-offline-panel';
import { SaasOfflineQueueService } from '../../offline/offline-queue.service';
import { SaasConnectivityService } from '../../offline/saas-connectivity.service';
import { SaasClienteService } from '../../services/saas-cliente.service';
import { SaasErrorService } from '../../services/saas-error.service';
import { SaasReservasService } from '../../services/saas-reservas.service';
import { generarOperacionId } from '../../utils/operacion-id.util';

@Component({
  selector: 'app-saas-cliente-page',
  imports: [AdminIcon, DatePipe, DecimalPipe, SaasOfflinePanel],
  templateUrl: './saas-cliente.page.html',
  styleUrl: './saas-cliente.page.css',
})
export class SaasClientePage {
  private readonly api = inject(SaasClienteService);
  private readonly reservasService = inject(SaasReservasService);
  private readonly offline = inject(SaasOfflineQueueService);
  private readonly connectivity = inject(SaasConnectivityService);
  private readonly errores = inject(SaasErrorService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly carritos = signal<CarritoClienteTenant[]>([]);
  readonly reservas = signal<ReservaClienteTenant[]>([]);
  readonly historial = signal<VentaClienteTenant[]>([]);
  readonly comprobante = signal<ComprobanteClienteTenant | null>(null);
  readonly cargando = signal(true);
  readonly procesando = signal<number | null>(null);
  readonly error = signal<string | null>(null);
  readonly mensaje = signal<string | null>(null);

  /** Aviso ámbar cuando una reserva quedó en la cola local. */
  readonly avisoOffline = signal<string | null>(null);

  /** Fecha de atención por carrito (`datetime-local`). */
  readonly fechasReserva = signal<Record<number, string>>({});
  /** Observación opcional por carrito (máx. 500). */
  readonly observacionesReserva = signal<Record<number, string>>({});
  readonly reservando = signal<number | null>(null);
  readonly errorReserva = signal<string | null>(null);

  readonly totalPendiente = computed(() =>
    this.carritos().reduce((total, carrito) => total + Number(carrito.subtotal), 0),
  );

  private operaciones = new Map<number, string>();

  constructor() {
    this.cargar();
  }

  cargar(): void {
    this.cargando.set(true);
    this.error.set(null);
    forkJoin({
      carritos: this.api.listarCarritos(),
      reservas: this.api.listarReservas(),
      historial: this.api.listarHistorial(),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ carritos, reservas, historial }) => {
          this.carritos.set(carritos.items);
          this.reservas.set(reservas);
          this.historial.set(historial.items);
          this.cargando.set(false);
        },
        error: (error: unknown) => {
          this.cargando.set(false);
          this.error.set(
            this.errores.normalizar(error, 'cliente/cargar').mensaje,
          );
        },
      });
  }

  comprar(carrito: CarritoClienteTenant): void {
    if (this.procesando() !== null) return;
    const operacion = this.operaciones.get(carrito.carrito_id) ?? generarOperacionId();
    this.operaciones.set(carrito.carrito_id, operacion);
    this.procesando.set(carrito.carrito_id);
    this.error.set(null);
    this.api
      .comprar(carrito.carrito_id, operacion)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (venta) => {
          this.operaciones.delete(carrito.carrito_id);
          this.procesando.set(null);
          this.mensaje.set(`Venta #${venta.venta_id} preparada para pago.`);
          void this.router.navigate(['/saas/cliente/pagos', venta.venta_id]);
        },
        error: (error: unknown) => {
          this.procesando.set(null);
          this.error.set(
            this.errores.normalizar(error, 'cliente/comprar').mensaje,
          );
        },
      });
  }

  pagar(ventaId: number): void {
    void this.router.navigate(['/saas/cliente/pagos', ventaId]);
  }

  // ============================== Reservas ==============================

  /** Registra una reserva del carrito (en línea o en la cola offline). */
  reservar(carrito: CarritoClienteTenant): void {
    if (this.reservando() !== null) {
      return;
    }
    this.errorReserva.set(null);
    this.avisoOffline.set(null);
    this.mensaje.set(null);

    const fechaLocal = this.fechaReserva(carrito.carrito_id);
    if (fechaLocal.trim().length === 0) {
      this.errorReserva.set('Indica la fecha y hora de atención.');
      return;
    }
    const fecha = new Date(fechaLocal);
    if (!Number.isFinite(fecha.getTime()) || fecha.getTime() <= Date.now()) {
      this.errorReserva.set(
        'La fecha de atención debe ser futura e incluir hora.',
      );
      return;
    }

    const observacion = (
      this.observacionesReserva()[carrito.carrito_id] ?? ''
    ).trim();

    const payload = {
      carrito_id: carrito.carrito_id,
      fecha_atencion: fecha.toISOString(),
      ...(observacion.length > 0 ? { observacion } : {}),
    };

    if (!this.connectivity.enLinea()) {
      void this.guardarReservaEnCola(carrito, payload);
      return;
    }

    this.reservando.set(carrito.carrito_id);
    this.reservasService
      .crear(payload)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (reserva) => {
          this.reservando.set(null);
          this.mensaje.set(
            `Reserva #${reserva.reserva_id} registrada (estado ${reserva.estado}).`,
          );
          this.limpiarFormularioReserva(carrito.carrito_id);
          this.cargar();
        },
        error: (error: unknown) => {
          this.reservando.set(null);
          if (error instanceof HttpErrorResponse && error.status === 0) {
            void this.guardarReservaEnCola(carrito, payload);
            return;
          }
          this.errorReserva.set(
            this.errores.normalizar(error, 'cliente/reserva').mensaje,
          );
        },
      });
  }

  /** Persiste la reserva en IndexedDB con un UUID local de deduplicación. */
  private async guardarReservaEnCola(
    carrito: CarritoClienteTenant,
    payload: { carrito_id: number; fecha_atencion: string; observacion?: string },
  ): Promise<void> {
    this.reservando.set(carrito.carrito_id);
    try {
      await this.offline.encolar(
        'RESERVA_CREAR',
        payload,
        generarOperacionId(),
      );
      this.reservando.set(null);
      this.limpiarFormularioReserva(carrito.carrito_id);
      this.avisoOffline.set(
        `La reserva del carrito #${carrito.carrito_id} quedó guardada en este dispositivo. Se enviará al recuperar la conexión y el servidor confirmará stock y disponibilidad.`,
      );
    } catch (error: unknown) {
      this.reservando.set(null);
      this.errorReserva.set(
        this.errores.normalizar(error, 'cliente/reserva-offline').mensaje,
      );
    }
  }

  /** Fecha propuesta para el carrito (mañana 10:00 si aún no se editó). */
  fechaReserva(carritoId: number): string {
    return this.fechasReserva()[carritoId] ?? fechaSugeridaLocal();
  }

  cambiarFechaReserva(carritoId: number, valor: string): void {
    this.fechasReserva.update((fechas) => ({
      ...fechas,
      [carritoId]: valor,
    }));
    this.errorReserva.set(null);
  }

  observacionReserva(carritoId: number): string {
    return this.observacionesReserva()[carritoId] ?? '';
  }

  cambiarObservacionReserva(carritoId: number, valor: string): void {
    this.observacionesReserva.update((observaciones) => ({
      ...observaciones,
      [carritoId]: valor,
    }));
  }

  /** Refresca la pantalla tras drenar operaciones pendientes. */
  recargarTrasSincronizacion(): void {
    this.avisoOffline.set(null);
    this.cargar();
  }

  private limpiarFormularioReserva(carritoId: number): void {
    this.fechasReserva.update((fechas) => {
      const copia = { ...fechas };
      delete copia[carritoId];
      return copia;
    });
    this.observacionesReserva.update((observaciones) => {
      const copia = { ...observaciones };
      delete copia[carritoId];
      return copia;
    });
  }

  verComprobante(ventaId: number): void {
    this.error.set(null);
    this.api
      .obtenerComprobante(ventaId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (comprobante) => this.comprobante.set(comprobante),
        error: (error: unknown) =>
          this.error.set(
            this.errores.normalizar(error, 'cliente/comprobante').mensaje,
          ),
      });
  }
}

/** `AAAA-MM-DDTHH:mm` local de mañana a las 10:00 (valor de datetime-local). */
function fechaSugeridaLocal(): string {
  const fecha = new Date();
  fecha.setDate(fecha.getDate() + 1);
  fecha.setHours(10, 0, 0, 0);
  const pad = (valor: number): string => String(valor).padStart(2, '0');
  return [
    `${fecha.getFullYear()}-${pad(fecha.getMonth() + 1)}-${pad(fecha.getDate())}`,
    `${pad(fecha.getHours())}:${pad(fecha.getMinutes())}`,
  ].join('T');
}
