import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, Observable, throwError } from 'rxjs';

import { environment } from '../../../../environments/environment';
import { SAAS_MODE } from '../../../core/config/app-mode';
import { normalizarEstadoReservaLegacy, normalizarDetalleReservaLegacy, normalizarListaReservaLegacy } from '../models/reserva-legacy.model';
import {
  normalizarDetalleReservaSaas,
  normalizarListaReservaSaas,
  normalizarPrevalidacionSaas,
  normalizarReservaCreadaSaas,
  normalizarReservaEstadoSaas,
} from '../models/reserva-saas.model';
import {
  EstadoReserva,
  PrevalidacionReserva,
  ReservaAtencionSeleccion,
  ReservaCreada,
  ReservaDetalle,
  ReservaEstado,
  ReservaListaResponse,
} from '../models/reserva.model';
import {
  combinarFechaHoraAtencion,
  combinarFechaHoraAtencionSaas,
} from '../utils/reserva-fecha.util';

/** Estados que el backend permite cancelar (autoridad real del backend). */
const ESTADOS_CANCELABLES = new Set<string>(['PENDIENTE', 'CONFIRMADA']);

/** Ruta base de reservas según el contrato activo. */
export function construirRutaReservas(
  apiUrl: string,
  saasMode: boolean,
): string {
  const base = apiUrl.replace(/\/+$/, '');
  return saasMode ? `${base}/tenant/reservas` : `${base}/reservas`;
}

/**
 * Construye `fecha_atencion` con el formato de cada contrato:
 * - SaaS: datetime AWARE (requerido por FastAPI; si no, 422).
 * - Legacy: datetime sin zona (convención del primer parcial).
 */
export function construirFechaAtencion(
  saasMode: boolean,
  fecha: string,
  hora: string,
): string | null {
  return saasMode
    ? combinarFechaHoraAtencionSaas(fecha, hora)
    : combinarFechaHoraAtencion(fecha, hora);
}

/** Parámetros del listado: `limit`/`offset` solo se envían en SaaS. */
export function construirParamsListaReservas(
  saasMode: boolean,
  estado: EstadoReserva | null,
  limit: number,
  offset: number,
): HttpParams {
  let params = new HttpParams();
  if (estado) {
    params = params.set('estado', estado);
  }
  if (saasMode) {
    params = params.set('limit', limit.toString());
    params = params.set('offset', offset.toString());
  }
  return params;
}

/**
 * Servicio de reservas de prendas del CLIENTE (CU11/CU16).
 *
 * Fachada mode-aware:
 * - `saasMode=false`: conserva `/reservas...` del primer parcial.
 * - `saasMode=true`: usa `/tenant/reservas...` (JWT tenant) y los contratos
 *   reales de prevalidación, creación, listado, detalle y cancelación.
 *
 * El cliente lo resuelve el backend desde el JWT: aquí NUNCA se envía
 * `cliente_id` ni `empresa_id`. La sucursal y las prendas salen del carrito.
 */
@Injectable({ providedIn: 'root' })
export class ReservasService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = environment.apiUrl.replace(/\/+$/, '');
  private readonly saasMode = inject(SAAS_MODE);

  private ruta(): string {
    return construirRutaReservas(this.apiUrl, this.saasMode);
  }

  /**
   * POST /tenant/reservas/prevalidar (SaaS). Informativa: NO crea la reserva.
   * En legacy no existe: el flujo legacy crea directamente.
   */
  prevalidarReserva(
    seleccion: ReservaAtencionSeleccion,
  ): Observable<PrevalidacionReserva> {
    if (!this.saasMode) {
      return throwError(
        () => new Error('La prevalidación solo está disponible en modo SaaS.'),
      );
    }
    const fecha = construirFechaAtencion(true, seleccion.fecha, seleccion.hora);
    if (fecha === null) {
      return throwError(() => new Error('Fecha u hora de atención inválida.'));
    }
    return this.http
      .post<unknown>(`${this.ruta()}/prevalidar`, {
        carrito_id: seleccion.carrito_id,
        fecha_atencion: fecha,
        observacion: seleccion.observacion,
      })
      .pipe(map(normalizarPrevalidacionSaas));
  }

  /** POST de creación real de la reserva (SaaS: 201 con `{reserva_id, ...}`). */
  crearReserva(seleccion: ReservaAtencionSeleccion): Observable<ReservaCreada> {
    const fecha = construirFechaAtencion(
      this.saasMode,
      seleccion.fecha,
      seleccion.hora,
    );
    if (fecha === null) {
      return throwError(() => new Error('Fecha u hora de atención inválida.'));
    }
    const payload = {
      carrito_id: seleccion.carrito_id,
      fecha_atencion: fecha,
      observacion: seleccion.observacion,
    };

    if (this.saasMode) {
      return this.http
        .post<unknown>(this.ruta(), payload)
        .pipe(map(normalizarReservaCreadaSaas));
    }

    return this.http.post<unknown>(this.ruta(), payload).pipe(
      map((crudo) => {
        const detalle = normalizarDetalleReservaLegacy(crudo);
        return {
          reserva_id: detalle.reserva_id,
          carrito_id: detalle.carrito_id,
          estado: detalle.estado,
        } satisfies ReservaCreada;
      }),
    );
  }

  /** GET del listado (reservas del cliente autenticado). */
  listarReservas(
    estado: EstadoReserva | null = null,
    limit = 20,
    offset = 0,
  ): Observable<ReservaListaResponse> {
    const params = construirParamsListaReservas(
      this.saasMode,
      estado,
      limit,
      offset,
    );
    if (this.saasMode) {
      return this.http
        .get<unknown>(this.ruta(), { params })
        .pipe(map(normalizarListaReservaSaas));
    }
    return this.http
      .get<unknown>(this.ruta(), { params })
      .pipe(map(normalizarListaReservaLegacy));
  }

  /** GET del detalle de una reserva. */
  obtenerReserva(reservaId: number): Observable<ReservaDetalle> {
    return this.http.get<unknown>(`${this.ruta()}/${reservaId}`).pipe(
      map(
        this.saasMode
          ? normalizarDetalleReservaSaas
          : normalizarDetalleReservaLegacy,
      ),
    );
  }

  /** PATCH de cancelación. Devuelve el estado real tras confirmar el backend. */
  cancelarReserva(
    reservaId: number,
    observacion: string | null = null,
  ): Observable<ReservaEstado> {
    const payload = { observacion };
    if (this.saasMode) {
      return this.http
        .patch<unknown>(`${this.ruta()}/${reservaId}/cancelar`, payload)
        .pipe(map(normalizarReservaEstadoSaas));
    }
    return this.http
      .patch<unknown>(`${this.ruta()}/${reservaId}/cancelar`, payload)
      .pipe(
        map((crudo) => {
          const estado = normalizarEstadoReservaLegacy(crudo);
          return estado;
        }),
      );
  }

  /**
   * true si la reserva admite cancelación. El backend sigue siendo la
   * autoridad: aquí solo se evita ofrecer una acción que siempre fallaría.
   */
  esCancelable(estado: string): boolean {
    return ESTADOS_CANCELABLES.has((estado ?? '').trim().toUpperCase());
  }
}
