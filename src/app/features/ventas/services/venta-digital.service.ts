import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';

import { environment } from '../../../../environments/environment';
import {
  CrearVentaDigitalPayload,
  VentaDigitalItem,
  VentaDigitalResponse,
} from '../models/venta-digital.model';

/**
 * Servicio de ventas digitales (CU19).
 *
 * Única responsabilidad: convertir el carrito ACTIVO del cliente en una venta
 * PENDIENTE mediante POST /ventas/digital. No procesa pagos (eso es CU22).
 *
 * El cliente se resuelve desde el JWT (lo añade el interceptor): aquí nunca se
 * envía `cliente_id`, `sucursal_id`, precios, total ni estado.
 */
@Injectable({ providedIn: 'root' })
export class VentaDigitalService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = environment.apiUrl.replace(/\/+$/, '');

  /**
   * POST /ventas/digital con `{ carrito_id, canal: 'WEB' }`.
   *
   * El componente no decide el canal: en Web siempre es 'WEB'.
   */
  realizarCompra(carritoId: number): Observable<VentaDigitalResponse> {
    const payload: CrearVentaDigitalPayload = {
      carrito_id: carritoId,
      canal: 'WEB',
    };
    return this.http
      .post<VentaDigitalResponse>(`${this.apiUrl}/ventas/digital`, payload)
      .pipe(map((venta) => this.normalizar(venta)));
  }

  /** Normaliza los Decimal del backend a number solo para presentación. */
  private normalizar(venta: VentaDigitalResponse): VentaDigitalResponse {
    return {
      ...venta,
      total: Number(venta.total),
      items: (venta.items ?? []).map((item) => this.normalizarItem(item)),
    };
  }

  private normalizarItem(item: VentaDigitalItem): VentaDigitalItem {
    return {
      ...item,
      precio_unitario: Number(item.precio_unitario),
      subtotal_linea: Number(item.subtotal_linea),
    };
  }
}
