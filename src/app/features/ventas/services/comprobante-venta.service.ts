import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, Observable, throwError } from 'rxjs';

import { SAAS_MODE } from '../../../core/config/app-mode';
import { environment } from '../../../../environments/environment';
import {
  ComprobanteVenta,
  ComprobanteVentaItem,
} from '../models/comprobante-venta.model';

/**
 * Ruta real del comprobante según el contrato activo:
 * - SaaS:   GET /tenant/ventas/{venta_id}/comprobante
 * - Legacy: GET /ventas/{venta_id}/comprobante
 */
export function construirRutaComprobante(
  apiUrl: string,
  saasMode: boolean,
  ventaId: number,
): string {
  const base = apiUrl.replace(/\/+$/, '');
  return saasMode
    ? `${base}/tenant/ventas/${ventaId}/comprobante`
    : `${base}/ventas/${ventaId}/comprobante`;
}

/**
 * Ruta del comprobante del CLIENTE (CU23).
 *
 * En SaaS el comprobante del cliente cuelga del historial del propio cliente:
 * `GET /tenant/ventas/historial/{venta_id}/comprobante`. En legacy se conserva
 * la ruta única `/ventas/{venta_id}/comprobante`.
 */
export function construirRutaComprobanteCliente(
  apiUrl: string,
  saasMode: boolean,
  ventaId: number,
): string {
  const base = apiUrl.replace(/\/+$/, '');
  return saasMode
    ? `${base}/tenant/ventas/historial/${ventaId}/comprobante`
    : `${base}/ventas/${ventaId}/comprobante`;
}

/**
 * Servicio de comprobante de venta (CU23).
 *
 * Única responsabilidad: consultar el comprobante de una venta YA finalizada.
 * El contrato de respuesta (`ComprobanteVentaResponse`) es el MISMO en ambos
 * modos; solo cambia la ruta (tenant vs legacy).
 *
 * CU23 es una CONSULTA: no almacena copias persistentes, no modifica la venta
 * ni el pago, no crea filas, no hace polling, no llama a Stripe y no reintenta
 * automáticamente.
 *
 * El backend exige que la venta esté COMPLETADA y que exista un pago APROBADO
 * (409 si no). La autorización real la resuelve el backend con el JWT actual
 * (cliente: solo su venta; personal: sucursal/rol) y responde 403/404.
 */
@Injectable({ providedIn: 'root' })
export class ComprobanteVentaService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = environment.apiUrl.replace(/\/+$/, '');
  private readonly saasMode = inject(SAAS_MODE);

  /** GET del comprobante (ruta tenant en SaaS; legacy en el primer parcial). */
  obtenerComprobante(ventaId: number): Observable<ComprobanteVenta> {
    const id = Number(ventaId);
    if (!Number.isInteger(id) || id <= 0) {
      return throwError(
        () => new Error('El identificador de la venta no es válido.'),
      );
    }
    return this.http
      .get<ComprobanteVenta>(
        construirRutaComprobante(this.apiUrl, this.saasMode, id),
      )
      .pipe(map((comprobante) => this.normalizar(comprobante)));
  }

  /**
   * GET del comprobante del CLIENTE autenticado (CU23).
   *
   * SaaS: `/tenant/ventas/historial/{venta_id}/comprobante` (el backend valida
   * que la venta pertenezca al cliente del JWT). Legacy: misma ruta histórica
   * `/ventas/{venta_id}/comprobante`. Devuelve el MISMO `ComprobanteVenta`.
   */
  obtenerComprobanteCliente(ventaId: number): Observable<ComprobanteVenta> {
    const id = Number(ventaId);
    if (!Number.isInteger(id) || id <= 0) {
      return throwError(
        () => new Error('El identificador de la venta no es válido.'),
      );
    }
    return this.http
      .get<ComprobanteVenta>(
        construirRutaComprobanteCliente(this.apiUrl, this.saasMode, id),
      )
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
