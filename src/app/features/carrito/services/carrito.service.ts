import { HttpClient } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { map, Observable, of, switchMap, tap, throwError } from 'rxjs';

import { environment } from '../../../../environments/environment';
import { SAAS_MODE } from '../../../core/config/app-mode';
import { AuthService } from '../../autenticacion-seguridad/auth/services/auth.service';
import { TenantApiService } from '../../saas/services/tenant-api.service';
import {
  CarritoDetalle,
  CarritoItem,
  CarritoListaResponse,
  CarritoResumen,
  ResultadoEliminarLinea,
  SeleccionCarrito,
} from '../models/carrito.model';
import { CarritoSaasService } from './carrito-saas.service';

/** Estado con el que el backend marca un carrito vigente. */
const ESTADO_ACTIVO = 'ACTIVO';

/**
 * Servicio del carrito de compras del CLIENTE (CU15).
 *
 * Fachada que elige el contrato según `environment.saasMode`:
 *
 * - `saasMode=false` (primer parcial): conserva EXACTAMENTE las rutas legacy
 *   (`/carritos`, `/carritos/{id}`, ...).
 * - `saasMode=true`: usa EXCLUSIVAMENTE `/tenant/carritos` a través de
 *   `CarritoSaasService` (contrato por variante + temporada).
 *
 * En ambos casos el cliente lo resuelve el backend desde el JWT: aquí NUNCA se
 * envía `cliente_id` ni `empresa_id`, ni se recalcula stock.
 *
 * El nº mostrado en el navbar es `totalCarritosActivos` (carritos, NO unidades).
 */
@Injectable({ providedIn: 'root' })
export class CarritoService {
  private readonly http = inject(HttpClient);
  private readonly carritoSaas = inject(CarritoSaasService);
  private readonly authService = inject(AuthService);
  private readonly tenantApi = inject(TenantApiService);
  private readonly apiUrl = environment.apiUrl.replace(/\/+$/, '');
  private readonly saasMode = inject(SAAS_MODE);

  /** Carritos activos del cliente (una tarjeta por sucursal). */
  readonly carritos = signal<CarritoResumen[]>([]);
  /** Cantidad de carritos activos mostrada en el badge del navbar. */
  readonly totalCarritosActivos = signal(0);
  readonly cargandoLista = signal(false);

  /**
   * POST del carrito.
   *
   * - `modo: 'inventario'` (legacy) → `/carritos/items`.
   * - `modo: 'variante'` (SaaS) → `/tenant/carritos/items` con
   *   `variante_producto_id` + `temporada_id`; el backend resuelve el
   *   inventario y rechaza selecciones inexistentes/ambiguas/sin stock.
   */
  agregarItem(seleccion: SeleccionCarrito): Observable<void> {
    if (this.saasMode) {
      if (seleccion.modo !== 'variante') {
        return throwError(
          () =>
            new Error(
              'En modo SaaS el carrito requiere variante_producto_id y temporada_id.',
            ),
        );
      }
      return this.carritoSaas
        .agregarItem({
          sucursal_id: seleccion.sucursal_id,
          variante_producto_id: seleccion.variante_producto_id,
          temporada_id: seleccion.temporada_id,
          cantidad: seleccion.cantidad,
        })
        .pipe(map(() => undefined));
    }

    if (seleccion.modo !== 'inventario') {
      return throwError(
        () => new Error('El contrato legacy requiere inventario_id.'),
      );
    }
    return this.http
      .post<CarritoDetalle>(`${this.apiUrl}/carritos/items`, {
        sucursal_id: seleccion.sucursal_id,
        inventario_id: seleccion.inventario_id,
        cantidad: seleccion.cantidad,
      })
      .pipe(map(() => undefined));
  }

  /** GET de carritos (resumen por sucursal + contador de carritos activos). */
  listarCarritos(): Observable<CarritoListaResponse> {
    this.cargandoLista.set(true);

    const peticion$ = this.saasMode
      ? this.carritoSaas.listar()
      : this.http
          .get<CarritoListaResponse>(`${this.apiUrl}/carritos`)
          .pipe(
            map((respuesta) => ({
              items: (respuesta.items ?? []).map((carrito) =>
                this.normalizarResumen(carrito),
              ),
              total_carritos_activos: respuesta.total_carritos_activos ?? 0,
            })),
          );

    return peticion$.pipe(
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

  /** GET del detalle de un carrito. */
  obtenerCarrito(carritoId: number): Observable<CarritoDetalle> {
    if (this.saasMode) {
      return this.carritoSaas.obtener(carritoId);
    }
    return this.http
      .get<CarritoDetalle>(`${this.apiUrl}/carritos/${carritoId}`)
      .pipe(map((detalle) => this.normalizarDetalle(detalle)));
  }

  /**
   * PATCH de cantidad.
   *
   * El PATCH SaaS devuelve solo la línea; para refrescar totales se vuelve a
   * consultar el detalle completo (una lectura, nunca una segunda mutación).
   */
  actualizarCantidad(
    carritoId: number,
    detalleId: number,
    cantidad: number,
  ): Observable<CarritoDetalle> {
    if (this.saasMode) {
      return this.carritoSaas
        .actualizarCantidad(carritoId, detalleId, cantidad)
        .pipe(switchMap(() => this.carritoSaas.obtener(carritoId)));
    }
    return this.http
      .patch<CarritoDetalle>(
        `${this.apiUrl}/carritos/${carritoId}/items/${detalleId}`,
        { cantidad },
      )
      .pipe(map((detalle) => this.normalizarDetalle(detalle)));
  }

  /**
   * DELETE de una línea.
   *
   * - Legacy: el backend devuelve el detalle completo.
   * - SaaS: devuelve `{estado, cantidad_lineas}`. Si quedan líneas se relee el
   *   detalle; si el carrito quedó vacío se informa `carrito-eliminado` sin
   *   inventar un detalle vacío.
   */
  eliminarDetalle(
    carritoId: number,
    detalleId: number,
  ): Observable<ResultadoEliminarLinea> {
    if (this.saasMode) {
      return this.carritoSaas.eliminarDetalle(carritoId, detalleId).pipe(
        switchMap((estado) => {
          if (estado.cantidad_lineas > 0) {
            return this.carritoSaas
              .obtener(carritoId)
              .pipe(
                map(
                  (detalle): ResultadoEliminarLinea => ({
                    tipo: 'detalle',
                    detalle,
                  }),
                ),
              );
          }
          return of<ResultadoEliminarLinea>({
            tipo: 'carrito-eliminado',
            carrito_id: carritoId,
          });
        }),
      );
    }

    return this.http
      .delete<CarritoDetalle>(
        `${this.apiUrl}/carritos/${carritoId}/items/${detalleId}`,
      )
      .pipe(
        map(
          (detalle): ResultadoEliminarLinea => ({
            tipo: 'detalle',
            detalle: this.normalizarDetalle(detalle),
          }),
        ),
      );
  }

  /** DELETE de un carrito completo. */
  eliminarCarrito(carritoId: number): Observable<void> {
    if (this.saasMode) {
      return this.carritoSaas.eliminarCarrito(carritoId).pipe(map(() => undefined));
    }
    return this.http
      .delete<CarritoDetalle>(`${this.apiUrl}/carritos/${carritoId}`)
      .pipe(map(() => undefined));
  }

  /** Refresca listado y badge sin recargar la página. */
  refrescarContador(): void {
    this.listarCarritos().subscribe({
      error: () => this.cargandoLista.set(false),
    });
  }

  /**
   * Limpia la sesión de CLIENTE correspondiente al modo activo y el estado del
   * carrito. No cierra sesiones de personal ni mezcla JWT legacy con SaaS.
   */
  cerrarSesionCliente(): void {
    if (this.saasMode) {
      this.tenantApi.cerrarSesion();
    } else {
      this.authService.cerrarSesion();
    }
    this.limpiar();
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
