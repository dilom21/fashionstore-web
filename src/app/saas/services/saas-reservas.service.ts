import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../environments/environment';
import {
  AccionReservaRespuesta,
  ReservaAccionSolicitud,
  ReservaComercial,
  ReservaCreadaTenant,
  ReservaCrearSolicitud,
} from '../models/tenant.models';

/**
 * Reservas comerciales de la empresa.
 *
 * Contrato:
 * - `GET /tenant/comercial/reservas` y `GET .../{id}`: solo ADMINISTRADOR;
 *   vista mínima `{id, estado}` (sin prendas, cliente ni sucursal).
 * - `PATCH /tenant/reservas/{id}/cancelar`: cliente `CLIENTE` o personal
 *   `ADMINISTRADOR|ENCARGADO_SUCURSAL`.
 * - `PATCH /tenant/reservas/{id}/finalizar-sin-compra`: personal
 *   `ADMINISTRADOR|ENCARGADO_SUCURSAL|CAJERO`.
 *
 * Reglas de construcción:
 * - El `empresa_id` NUNCA viaja en la URL ni en el cuerpo: lo deriva el JWT.
 * - Los dos `PATCH` ENVÍAN SIEMPRE cuerpo JSON: sin body el backend responde
 *   422. Si no hay observación se envía `{}` (no `null`).
 * - Las URL se construyen sin barra final.
 */
@Injectable({ providedIn: 'root' })
export class SaasReservasService {
  private readonly http = inject(HttpClient);

  /** URL base de la API normalizada (sin barra final). */
  private readonly apiUrl = environment.apiUrl.replace(/\/+$/, '');

  /** Consulta comercial mínima (solo ADMINISTRADOR). */
  private readonly baseComercial = `${this.apiUrl}/tenant/comercial/reservas`;

  /** Acciones transaccionales sobre una reserva. */
  private readonly baseAcciones = `${this.apiUrl}/tenant/reservas`;

  /**
   * `POST /tenant/reservas` — registra una reserva del cliente autenticado.
   *
   * Solo admite contexto `cliente`; el backend deriva empresa y dueño del
   * carrito desde el JWT. Un error de red no confirma la reserva: la cola
   * offline la reintenta y verifica duplicados con `GET /tenant/cliente/reservas`.
   * Respuestas: 201 alta, 403 carrito ajeno/rol, 409 stock o estado, 503 flag
   * de reservas apagado.
   */
  crear(solicitud: ReservaCrearSolicitud): Observable<ReservaCreadaTenant> {
    return this.http.post<ReservaCreadaTenant>(
      this.baseAcciones,
      solicitud,
    );
  }

  /**
   * `GET /tenant/comercial/reservas` — reservas recientes (vista mínima).
   *
   * El backend limita `limit` a 1..100 y usa 50 por defecto; aquí solo se
   * envían los parámetros indicados, sin valores inventados.
   */
  listar(limit?: number, offset?: number): Observable<ReservaComercial[]> {
    let params = new HttpParams();
    if (limit !== undefined) {
      params = params.set('limit', limit);
    }
    if (offset !== undefined) {
      params = params.set('offset', offset);
    }
    return this.http.get<ReservaComercial[]>(this.baseComercial, { params });
  }

  /**
   * `GET /tenant/comercial/reservas/{id}` — estado vigente de una reserva.
   *
   * 404 si la reserva no existe o es de otra empresa (no se distingue).
   */
  obtener(id: number): Observable<ReservaComercial> {
    return this.http.get<ReservaComercial>(`${this.baseComercial}/${id}`);
  }

  /**
   * `PATCH /tenant/reservas/{id}/cancelar` — cancela la reserva.
   *
   * El cuerpo se envía siempre: `{}` cuando no hay observación.
   * Errores esperables: 403 por rol, 404 si no es de la empresa, 409 por
   * estado inconsistente, 503 con el módulo apagado.
   */
  cancelar(
    id: number,
    observacion?: string | null,
  ): Observable<AccionReservaRespuesta> {
    return this.http.patch<AccionReservaRespuesta>(
      `${this.baseAcciones}/${id}/cancelar`,
      construirCuerpoAccion(observacion),
    );
  }

  /**
   * `PATCH /tenant/reservas/{id}/finalizar-sin-compra` — cierra la reserva
   * como atendida sin venta.
   *
   * El cuerpo se envía siempre: `{}` cuando no hay observación.
   */
  finalizarSinCompra(
    id: number,
    observacion?: string | null,
  ): Observable<AccionReservaRespuesta> {
    return this.http.patch<AccionReservaRespuesta>(
      `${this.baseAcciones}/${id}/finalizar-sin-compra`,
      construirCuerpoAccion(observacion),
    );
  }
}

/**
 * Cuerpo EXACTO de las acciones de reserva.
 *
 * La observación vacía o compuesta solo por espacios se omite: el contrato
 * admite `{}` y no conviene enviar texto sin contenido.
 */
export function construirCuerpoAccion(
  observacion?: string | null,
): ReservaAccionSolicitud {
  const texto = (observacion ?? '').trim();
  return texto.length > 0 ? { observacion: texto } : {};
}
