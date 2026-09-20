import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';

import { environment } from '../../../../environments/environment';
import {
  MetodoPagoPresencial,
  PagoPresencialResponse,
  RegistrarPagoPresencialRequest,
} from '../models/pago-presencial.model';

/**
 * Servicio de pago presencial (CU21).
 *
 * Única responsabilidad: registrar el pago APROBADO de una venta PRESENCIAL
 * PENDIENTE mediante POST /pagos/presencial. No confirma la venta desde el
 * frontend: el backend lo hace de forma atómica con `sp_confirmar_venta`.
 *
 * El payload contiene SOLO `venta_id` + `metodo`. Nunca se envían monto,
 * estado, empleado_id, sucursal_id, canal, pasarela ni referencia_transaccion.
 * No integra Stripe (CU22).
 */
@Injectable({ providedIn: 'root' })
export class PagoPresencialService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = environment.apiUrl.replace(/\/+$/, '');

  /** POST /pagos/presencial (contrato real del backend). */
  registrarPresencial(
    ventaId: number,
    metodo: MetodoPagoPresencial,
  ): Observable<PagoPresencialResponse> {
    const payload: RegistrarPagoPresencialRequest = {
      venta_id: Number(ventaId),
      metodo,
    };
    return this.http
      .post<PagoPresencialResponse>(
        `${this.apiUrl}/pagos/presencial`,
        payload,
      )
      .pipe(map((pago) => this.normalizar(pago)));
  }

  /** Normaliza el Decimal del backend a number solo para presentación. */
  private normalizar(pago: PagoPresencialResponse): PagoPresencialResponse {
    return { ...pago, monto: Number(pago.monto) };
  }
}
