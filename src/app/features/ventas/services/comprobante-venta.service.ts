import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, Observable, throwError } from 'rxjs';

import { environment } from '../../../../environments/environment';
import {
  ComprobanteVenta,
  ComprobanteVentaItem,
} from '../models/comprobante-venta.model';

/**
 * Servicio de comprobante de venta (CU23).
 *
 * Única responsabilidad: consultar el comprobante de una venta YA finalizada
 * mediante GET /ventas/{venta_id}/comprobante.
 *
 * CU23 es una CONSULTA: no almacena copias persistentes, no modifica la venta
 * ni el pago, no crea filas, no hace polling, no llama a Stripe y no reintenta
 * automáticamente. El único parámetro es `venta_id`, por lo que sirve igual
 * para ventas WEB/MOVIL, presenciales directas y presenciales desde reserva.
 *
 * El backend exige que la venta esté COMPLETADA y que exista un pago APROBADO
 * (409 si no). La autorización real la resuelve el backend con el JWT actual
 * (cliente: solo su venta; personal: sucursal/rol) y responde 403/404.
 */
@Injectable({ providedIn: 'root' })
export class ComprobanteVentaService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = environment.apiUrl.replace(/\/+$/, '');

  /** GET /ventas/{venta_id}/comprobante (contrato real del backend). */
  obtenerComprobante(ventaId: number): Observable<ComprobanteVenta> {
    const id = Number(ventaId);
    if (!Number.isInteger(id) || id <= 0) {
      return throwError(
        () => new Error('El identificador de la venta no es válido.'),
      );
    }
    return this.http
      .get<ComprobanteVenta>(`${this.apiUrl}/ventas/${id}/comprobante`)
      .pipe(map((comprobante) => this.normalizar(comprobante)));
  }

  /**
   * Normaliza los `Decimal` que el backend serializa: se convierten a number
   * SOLO para presentación. El total no se recalcula ni se completa con
   * subtotales: es el valor informado por el backend.
   */
  private normalizar(comprobante: ComprobanteVenta): ComprobanteVenta {
    return {
      ...comprobante,
      total: Number(comprobante.total),
      cantidad_total_unidades: Number(comprobante.cantidad_total_unidades),
      pago: {
        ...comprobante.pago,
        monto: Number(comprobante.pago.monto),
      },
      items: (comprobante.items ?? []).map((item) =>
        this.normalizarItem(item),
      ),
    };
  }

  private normalizarItem(item: ComprobanteVentaItem): ComprobanteVentaItem {
    return {
      ...item,
      cantidad: Number(item.cantidad),
      precio_unitario: Number(item.precio_unitario),
      subtotal_linea: Number(item.subtotal_linea),
    };
  }
}
