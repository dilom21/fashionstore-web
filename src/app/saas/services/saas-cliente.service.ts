import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../environments/environment';
import {
  ComprobanteClienteTenant,
  EstadoPagoClienteTenant,
  HistorialClienteTenant,
  IntencionPagoClienteTenant,
  ListaCarritosClienteTenant,
  ReservaClienteTenant,
  VentaClienteTenant,
} from '../models/cliente-tenant.models';

@Injectable({ providedIn: 'root' })
export class SaasClienteService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl.replace(/\/+$/, '')}/tenant`;

  listarCarritos(): Observable<ListaCarritosClienteTenant> {
    return this.http.get<ListaCarritosClienteTenant>(`${this.base}/carritos`);
  }

  listarReservas(): Observable<ReservaClienteTenant[]> {
    return this.http.get<ReservaClienteTenant[]>(`${this.base}/cliente/reservas`);
  }

  listarHistorial(): Observable<HistorialClienteTenant> {
    return this.http.get<HistorialClienteTenant>(`${this.base}/ventas/historial`);
  }

  comprar(carritoId: number, operacionId: string): Observable<VentaClienteTenant> {
    return this.http.post<VentaClienteTenant>(
      `${this.base}/ventas/digital`,
      { carrito_id: carritoId, canal: 'WEB' },
      { headers: this.idempotencia(operacionId) },
    );
  }

  crearIntencion(
    ventaId: number,
    operacionId: string,
  ): Observable<IntencionPagoClienteTenant> {
    return this.http.post<IntencionPagoClienteTenant>(
      `${this.base}/pagos/stripe/intencion`,
      { venta_id: ventaId },
      { headers: this.idempotencia(operacionId) },
    );
  }

  consultarPago(ventaId: number): Observable<EstadoPagoClienteTenant> {
    return this.http.get<EstadoPagoClienteTenant>(
      `${this.base}/pagos/stripe/ventas/${ventaId}/estado`,
    );
  }

  obtenerComprobante(ventaId: number): Observable<ComprobanteClienteTenant> {
    return this.http.get<ComprobanteClienteTenant>(
      `${this.base}/ventas/${ventaId}/comprobante`,
    );
  }

  private idempotencia(operacionId: string): HttpHeaders {
    return new HttpHeaders({ 'Idempotency-Key': operacionId });
  }
}
