import { HttpClient } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { map, Observable, tap } from 'rxjs';

import { environment } from '../../../../environments/environment';
import {
  ActualizarCantidadPayload,
  AgregarItemCarritoPayload,
  CarritoDetalle,
  CarritoItem,
  CarritoListaResponse,
  CarritoResumen,
} from '../models/carrito.model';

/** Estado con el que el backend marca un carrito vigente. */
const ESTADO_ACTIVO = 'ACTIVO';

/**
 * Servicio del carrito de compras del CLIENTE (CU15).
 *
 * Centraliza el contrato real del backend:
 * - POST   /carritos/items
 * - GET    /carritos
 * - GET    /carritos/{carrito_id}
 * - PATCH  /carritos/{carrito_id}/items/{detalle_id}
 * - DELETE /carritos/{carrito_id}/items/{detalle_id}
 * - DELETE /carritos/{carrito_id}
 *
 * El cliente lo resuelve el backend desde el JWT: aquí NUNCA se envía
 * `cliente_id`. Tampoco se recalcula stock ni se deciden expiraciones.
 *
 * El nº mostrado en el navbar es `totalCarritosActivos` (carritos, NO unidades).
 */
@Injectable({ providedIn: 'root' })
export class CarritoService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = environment.apiUrl.replace(/\/+$/, '');

  /** Carritos activos del cliente (una tarjeta por sucursal). */
  readonly carritos = signal<CarritoResumen[]>([]);
  /** Cantidad de carritos activos mostrada en el badge del navbar. */
  readonly totalCarritosActivos = signal(0);
  readonly cargandoLista = signal(false);

  /** POST /carritos/items (crea el carrito de la sucursal si no existe). */
  agregarItem(payload: AgregarItemCarritoPayload): Observable<CarritoDetalle> {
    return this.http
      .post<CarritoDetalle>(`${this.apiUrl}/carritos/items`, payload)
      .pipe(map((detalle) => this.normalizarDetalle(detalle)));
  }

  /** GET /carritos (resumen por sucursal + contador de carritos activos). */
  listarCarritos(): Observable<CarritoListaResponse> {
    this.cargandoLista.set(true);
    return this.http.get<CarritoListaResponse>(`${this.apiUrl}/carritos`).pipe(
      map((respuesta) => ({
        items: (respuesta.items ?? []).map((carrito) =>
          this.normalizarResumen(carrito),
        ),
        total_carritos_activos: respuesta.total_carritos_activos ?? 0,
      })),
      tap({
        next: (respuesta) => {
          this.cargandoLista.set(false);
          this.carritos.set(respuesta.items);
          this.totalCarritosActivos.set(respuesta.total_carritos_activos);
        },
        error: () => this.cargandoLista.set(false),
      }),
    );
  }

  /** GET /carritos/{carrito_id}. */
  obtenerCarrito(carritoId: number): Observable<CarritoDetalle> {
    return this.http
      .get<CarritoDetalle>(`${this.apiUrl}/carritos/${carritoId}`)
      .pipe(map((detalle) => this.normalizarDetalle(detalle)));
  }

  /** PATCH /carritos/{carrito_id}/items/{detalle_id}. */
  actualizarCantidad(
    carritoId: number,
    detalleId: number,
    cantidad: number,
  ): Observable<CarritoDetalle> {
    const payload: ActualizarCantidadPayload = { cantidad };
    return this.http
      .patch<CarritoDetalle>(
        `${this.apiUrl}/carritos/${carritoId}/items/${detalleId}`,
        payload,
      )
      .pipe(map((detalle) => this.normalizarDetalle(detalle)));
  }

  /** DELETE /carritos/{carrito_id}/items/{detalle_id}. */
  eliminarDetalle(
    carritoId: number,
    detalleId: number,
  ): Observable<CarritoDetalle> {
    return this.http
      .delete<CarritoDetalle>(
        `${this.apiUrl}/carritos/${carritoId}/items/${detalleId}`,
      )
      .pipe(map((detalle) => this.normalizarDetalle(detalle)));
  }

  /** DELETE /carritos/{carrito_id}. */
  eliminarCarrito(carritoId: number): Observable<CarritoDetalle> {
    return this.http
      .delete<CarritoDetalle>(`${this.apiUrl}/carritos/${carritoId}`)
      .pipe(map((detalle) => this.normalizarDetalle(detalle)));
  }

  /** Refresca listado y badge sin recargar la página. */
  refrescarContador(): void {
    this.listarCarritos().subscribe({
      error: () => this.cargandoLista.set(false),
    });
  }

  /** Limpia el estado local (p. ej. al cerrar sesión). */
  limpiar(): void {
    this.carritos.set([]);
    this.totalCarritosActivos.set(0);
  }

  /**
   * true si el carrito sigue ACTIVO. El backend marca ELIMINADO cuando se quita
   * la última línea o se elimina el carrito: el frontend no lo decide.
   */
  estaActivo(detalle: CarritoDetalle): boolean {
    return (detalle.estado ?? '').trim().toUpperCase() === ESTADO_ACTIVO;
  }

  private normalizarResumen(carrito: CarritoResumen): CarritoResumen {
    return { ...carrito, subtotal: Number(carrito.subtotal) };
  }

  private normalizarDetalle(detalle: CarritoDetalle): CarritoDetalle {
    return {
      ...detalle,
      subtotal_carrito: Number(detalle.subtotal_carrito),
      items: (detalle.items ?? []).map((item) => this.normalizarItem(item)),
    };
  }

  private normalizarItem(item: CarritoItem): CarritoItem {
    return {
      ...item,
      precio_unitario: Number(item.precio_unitario),
      subtotal_linea: Number(item.subtotal_linea),
    };
  }
}
