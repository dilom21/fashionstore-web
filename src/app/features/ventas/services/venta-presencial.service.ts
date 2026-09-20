import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';

import { environment } from '../../../../environments/environment';
import {
  RegistrarVentaPresencialRequest,
  VentaPresencialItemRequest,
  VentaPresencialItemResponse,
  VentaPresencialResponse,
} from '../models/venta-presencial.model';

/**
 * Servicio de ventas presenciales (CU20).
 *
 * Única responsabilidad: registrar en tienda una venta PENDIENTE mediante
 * POST /ventas/presencial, tanto directa como proveniente de CU18. No registra
 * pagos (CU21) ni toca inventario/reserva.
 *
 * El empleado, la sucursal, el canal, el estado, los precios y el total los
 * determina el backend. Aquí solo se envían `inventario_id` + `cantidad` (y el
 * `reserva_id`/`cliente_id` cuando corresponde).
 */
@Injectable({ providedIn: 'root' })
export class VentaPresencialService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = environment.apiUrl.replace(/\/+$/, '');

  /**
   * Venta presencial directa (sin reserva).
   *
   * `clienteId` es opcional: sin él la venta queda anónima (cliente_id = null),
   * que es lo que admite el esquema real.
   */
  registrarVentaDirecta(
    items: VentaPresencialItemRequest[],
    clienteId: number | null = null,
  ): Observable<VentaPresencialResponse> {
    const payload: RegistrarVentaPresencialRequest = {
      reserva_id: null,
      items: this.soloVendibles(items),
    };
    if (clienteId !== null && clienteId > 0) {
      payload.cliente_id = clienteId;
    }
    return this.registrar(payload);
  }

  /**
   * Venta presencial proveniente de CU18.
   *
   * Solo se envían las líneas con cantidad > 0 mapeadas a `cantidad`. No se
   * envía `cliente_id`: el backend lo deriva de la reserva.
   */
  registrarVentaDesdeReserva(
    reservaId: number,
    items: VentaPresencialItemRequest[],
  ): Observable<VentaPresencialResponse> {
    return this.registrar({
      reserva_id: reservaId,
      items: this.soloVendibles(items),
    });
  }

  /** POST /ventas/presencial (contrato real del backend). */
  private registrar(
    payload: RegistrarVentaPresencialRequest,
  ): Observable<VentaPresencialResponse> {
    return this.http
      .post<VentaPresencialResponse>(
        `${this.apiUrl}/ventas/presencial`,
        payload,
      )
      .pipe(map((venta) => this.normalizar(venta)));
  }

  /**
   * Normaliza las líneas a `{ inventario_id, cantidad }`.
   *
   * Descarta cantidades no positivas y evita arrastrar cualquier campo que no
   * pertenezca al contrato (precio, subtotal, etc.).
   */
  private soloVendibles(
    items: VentaPresencialItemRequest[],
  ): VentaPresencialItemRequest[] {
    return (items ?? [])
      .map((item) => ({
        inventario_id: Number(item.inventario_id),
        cantidad: Number(item.cantidad),
      }))
      .filter((item) => item.cantidad > 0 && item.inventario_id > 0);
  }

  /** Normaliza los Decimal del backend a number solo para presentación. */
  private normalizar(venta: VentaPresencialResponse): VentaPresencialResponse {
    return {
      ...venta,
      total: Number(venta.total),
      items: (venta.items ?? []).map((item) => this.normalizarItem(item)),
    };
  }

  private normalizarItem(
    item: VentaPresencialItemResponse,
  ): VentaPresencialItemResponse {
    return {
      ...item,
      precio_unitario: Number(item.precio_unitario),
      subtotal_linea: Number(item.subtotal_linea),
    };
  }
}
