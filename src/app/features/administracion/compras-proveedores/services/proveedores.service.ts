import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';

import { environment } from '../../../../../environments/environment';
import {
  Proveedor,
  ProveedorCreatePayload,
  ProveedorDetalle,
  ProveedorEstadoPayload,
  ProveedorListarFiltros,
  ProveedorProducto,
  ProveedorProductoInput,
  ProveedorProductos,
  ProveedorProductosUpdatePayload,
  ProveedorUpdatePayload,
} from '../models/proveedor.model';

/** Forma cruda que puede devolver el backend para un producto asociado. */
interface ProveedorProductoRaw {
  producto_id: number;
  nombre: string;
  categoria?: unknown;
  costo_referencia: unknown;
  estado: boolean;
}

/** Forma cruda de la respuesta GET/PUT /proveedores/{id}/productos. */
interface ProveedorProductosRaw {
  proveedor_id: number;
  total: number;
  productos: ProveedorProductoRaw[];
}

/**
 * Servicio de Proveedores y de sus productos asociados (CU11).
 *
 * Consume el contrato real del backend:
 * GET/POST /proveedores, GET/PATCH /proveedores/{id},
 * PATCH /proveedores/{id}/estado,
 * GET/PUT /proveedores/{id}/productos.
 *
 * El PUT reemplaza el conjunto COMPLETO de productos (no hay request por
 * checkbox ni por cambio de costo), es atómico e idempotente, deduplica por
 * `producto_id` (el backend conserva la última ocurrencia) y acepta `[]` para
 * eliminar todas las relaciones.
 *
 * El JWT se adjunta automáticamente mediante el interceptor global.
 */
@Injectable({ providedIn: 'root' })
export class ProveedoresService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = environment.apiUrl.replace(/\/+$/, '');

  /** GET /proveedores (filtros: buscar, estado). */
  listarProveedores(
    filtros: ProveedorListarFiltros = {},
  ): Observable<Proveedor[]> {
    let params = new HttpParams();

    const buscar = filtros.buscar?.trim();
    if (buscar) {
      params = params.set('buscar', buscar);
    }
    if (filtros.estado !== undefined && filtros.estado !== null) {
      params = params.set('estado', String(filtros.estado));
    }

    return this.http.get<Proveedor[]>(`${this.apiUrl}/proveedores`, { params });
  }

  /** GET /proveedores/{proveedor_id} (incluye total_productos). */
  obtenerProveedor(proveedorId: number): Observable<ProveedorDetalle> {
    return this.http.get<ProveedorDetalle>(
      `${this.apiUrl}/proveedores/${proveedorId}`,
    );
  }

  /** POST /proveedores. */
  crearProveedor(payload: ProveedorCreatePayload): Observable<Proveedor> {
    return this.http.post<Proveedor>(`${this.apiUrl}/proveedores`, payload);
  }

  /** PATCH /proveedores/{proveedor_id} (solo campos modificados). */
  actualizarProveedor(
    proveedorId: number,
    payload: ProveedorUpdatePayload,
  ): Observable<Proveedor> {
    return this.http.patch<Proveedor>(
      `${this.apiUrl}/proveedores/${proveedorId}`,
      payload,
    );
  }

  /** PATCH /proveedores/{proveedor_id}/estado (habilitar/deshabilitar). */
  cambiarEstadoProveedor(
    proveedorId: number,
    estado: boolean,
  ): Observable<Proveedor> {
    const payload: ProveedorEstadoPayload = { estado };
    return this.http.patch<Proveedor>(
      `${this.apiUrl}/proveedores/${proveedorId}/estado`,
      payload,
    );
  }

  /** GET /proveedores/{proveedor_id}/productos. */
  listarProductos(proveedorId: number): Observable<ProveedorProductos> {
    return this.http
      .get<ProveedorProductosRaw>(
        `${this.apiUrl}/proveedores/${proveedorId}/productos`,
      )
      .pipe(map((respuesta) => this.normalizarProductos(respuesta)));
  }

  /**
   * PUT /proveedores/{proveedor_id}/productos.
   *
   * Reemplaza el conjunto completo e idempotente de productos asociados.
   * Una lista vacía elimina todas las relaciones.
   */
  reemplazarProductos(
    proveedorId: number,
    productos: ProveedorProductoInput[],
  ): Observable<ProveedorProductos> {
    const payload: ProveedorProductosUpdatePayload = { productos };
    return this.http
      .put<ProveedorProductosRaw>(
        `${this.apiUrl}/proveedores/${proveedorId}/productos`,
        payload,
      )
      .pipe(map((respuesta) => this.normalizarProductos(respuesta)));
  }

  // ===== Utilidades =====

  /** El backend serializa `costo_referencia` (Decimal) como número o string. */
  private normalizarProductos(
    respuesta: ProveedorProductosRaw,
  ): ProveedorProductos {
    return {
      proveedor_id: respuesta.proveedor_id,
      total: respuesta.total,
      productos: respuesta.productos.map(
        (producto): ProveedorProducto => ({
          producto_id: producto.producto_id,
          nombre: producto.nombre,
          categoria: this.normalizarCategoria(producto.categoria),
          costo_referencia: this.normalizarCosto(producto.costo_referencia),
          estado: producto.estado,
        }),
      ),
    };
  }

  /** Acepta categoría como string o como objeto {nombre}. */
  private normalizarCategoria(valor: unknown): string | null {
    if (typeof valor === 'string') {
      const limpio = valor.trim();
      return limpio.length > 0 ? limpio : null;
    }
    if (typeof valor === 'object' && valor !== null && 'nombre' in valor) {
      const nombre = (valor as { nombre: unknown }).nombre;
      if (typeof nombre === 'string' && nombre.trim().length > 0) {
        return nombre.trim();
      }
    }
    return null;
  }

  private normalizarCosto(valor: unknown): number {
    const numero = Number(valor);
    return Number.isFinite(numero) ? numero : 0;
  }
}
