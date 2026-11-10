import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';

import { SAAS_MODE } from '../../../core/config/app-mode';
import { environment } from '../../../../environments/environment';
import {
  CrearIntencionPagoRequest,
  EstadoPagoVentaResponse,
  IntencionPagoResponse,
} from '../models/pago-electronico.model';

/** Ruta base de Stripe: tenant en SaaS, legacy en el primer parcial. */
export function construirBasePagoStripe(
  apiUrl: string,
  saasMode: boolean,
): string {
  const base = apiUrl.replace(/\/+$/, '');
  return saasMode
    ? `${base}/tenant/pagos/stripe`
    : `${base}/pagos/stripe`;
}

/**
 * Servicio HTTP de pago electrónico (CU22).
 *
 * Única responsabilidad: hablar con los dos endpoints que Angular puede
 * consumir. NUNCA llama al webhook: ese es Stripe -> backend.
 *
 *   SaaS:   POST /tenant/pagos/stripe/intencion
 *           GET  /tenant/pagos/stripe/ventas/{venta_id}/estado
 *   Legacy: POST /pagos/stripe/intencion
 *           GET  /pagos/stripe/ventas/{venta_id}/estado
 *
 * El cuerpo de la intención contiene SOLO `venta_id`. El monto, la moneda, el
 * cliente y el estado los deriva el backend de la venta y del JWT.
 */
@Injectable({ providedIn: 'root' })
export class PagoElectronicoService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = environment.apiUrl.replace(/\/+$/, '');
  private readonly saasMode = inject(SAAS_MODE);

  private get baseUrl(): string {
    return construirBasePagoStripe(this.apiUrl, this.saasMode);
  }

  /** Crea o reutiliza el PaymentIntent de la venta PENDIENTE. */
  crearIntencion(ventaId: number): Observable<IntencionPagoResponse> {
    const payload: CrearIntencionPagoRequest = {
      venta_id: Number(ventaId),
    };
    return this.http
      .post<IntencionPagoResponse>(
        `${this.baseUrl}/intencion`,
        payload,
      )
      .pipe(map((intencion) => this.normalizar(intencion)));
  }

  /** Consulta el estado real de la venta y de su pago electrónico. */
  consultarEstado(ventaId: number): Observable<EstadoPagoVentaResponse> {
    return this.http.get<EstadoPagoVentaResponse>(
      `${this.baseUrl}/ventas/${Number(ventaId)}/estado`,
    );
  }

  /** Normaliza el Decimal del backend a number solo para presentación. */
  private normalizar(
    intencion: IntencionPagoResponse,
  ): IntencionPagoResponse {
    return { ...intencion, monto: Number(intencion.monto) };
  }
}
