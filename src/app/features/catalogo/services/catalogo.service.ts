import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, Observable, throwError } from 'rxjs';

import { environment } from '../../../../environments/environment';
import { SAAS_MODE } from '../../../core/config/app-mode';
import { obtenerEmpresaSlugPublica } from '../../../core/config/empresa-publica';
import {
  CatalogoFiltros,
  normalizarCatalogoFiltros,
} from '../models/catalogo-filtros.model';
import {
  DisponibilidadFila,
  normalizarDetallePublicoLegacy,
  normalizarDetallePublicoSaas,
  normalizarDisponibilidadLegacy,
  normalizarProductoPublicoLegacy,
  normalizarProductoPublicoSaas,
  ProductoPublico,
  ProductoPublicoDetalle,
  PublicoListarFiltros,
} from '../models/catalogo-publico.model';

/**
 * Construye la ruta del listado de productos del catálogo público.
 *
 * Legacy: GET /productos
 * SaaS:   GET /catalogo/public/{empresa_slug}/productos
 */
export function construirRutaListado(
  apiUrl: string,
  saasMode: boolean,
  slug: string | null,
): string {
  const base = apiUrl.replace(/\/+$/, '');
  return saasMode
    ? `${base}/catalogo/public/${slug ?? ''}/productos`
    : `${base}/productos`;
}

/** Construye la ruta del detalle de un producto público. */
export function construirRutaDetalle(
  apiUrl: string,
  saasMode: boolean,
  slug: string | null,
  productoId: number,
): string {
  const base = apiUrl.replace(/\/+$/, '');
  return saasMode
    ? `${base}/catalogo/public/${slug ?? ''}/productos/${productoId}`
    : `${base}/productos/${productoId}`;
}

/** Construye la ruta de los filtros del catálogo público. */
export function construirRutaFiltros(
  apiUrl: string,
  saasMode: boolean,
  slug: string | null,
): string {
  const base = apiUrl.replace(/\/+$/, '');
  return saasMode
    ? `${base}/catalogo/public/${slug ?? ''}/filtros`
    : `${base}/catalogo/filtros`;
}

function agregarNumero(
  params: HttpParams,
  clave: string,
  valor: number | undefined,
): HttpParams {
  if (valor === undefined || valor === null) {
    return params;
  }
  return params.set(clave, valor.toString());
}

/**
 * Parámetros del listado SaaS.
 *
 * `con_stock` (UI) se traduce a `disponibilidad=CON_STOCK`; sin ese filtro se
 * usa el comportamiento `TODOS`. La respuesta es un arreglo plano (sin
 * `items`/`total`): se pide `limit`/`offset` explícitos, nunca un total global.
 */
export function construirParamsListadoSaas(
  filtros: PublicoListarFiltros,
): HttpParams {
  let params = new HttpParams();

  const buscar = filtros.buscar?.trim();
  if (buscar) {
    params = params.set('buscar', buscar);
  }
  params = agregarNumero(params, 'categoria_id', filtros.categoria_id);
  params = agregarNumero(params, 'talla_id', filtros.talla_id);
  params = agregarNumero(params, 'color_id', filtros.color_id);
  params = agregarNumero(params, 'temporada_id', filtros.temporada_id);
  params = agregarNumero(params, 'coleccion_id', filtros.coleccion_id);
  params = agregarNumero(params, 'sucursal_id', filtros.sucursal_id);
  params = params.set(
    'disponibilidad',
    filtros.con_stock ? 'CON_STOCK' : 'TODOS',
  );
  params = params.set('limit', String(filtros.limit ?? 100));
  params = params.set('offset', String(filtros.offset ?? 0));
  return params;
}

/** Parámetros del listado legacy (GET /productos). */
export function construirParamsListadoLegacy(
  filtros: PublicoListarFiltros,
): HttpParams {
  let params = new HttpParams();

  const buscar = filtros.buscar?.trim();
  if (buscar) {
    params = params.set('buscar', buscar);
  }
  params = agregarNumero(params, 'categoria_id', filtros.categoria_id);
  params = agregarNumero(params, 'talla_id', filtros.talla_id);
  params = agregarNumero(params, 'color_id', filtros.color_id);
  params = agregarNumero(params, 'temporada_id', filtros.temporada_id);
  params = agregarNumero(params, 'coleccion_id', filtros.coleccion_id);
  params = agregarNumero(params, 'sucursal_id', filtros.sucursal_id);
  if (filtros.con_stock === true) {
    params = params.set('con_stock', 'true');
  }
  return params;
}

/**
 * Servicio del catálogo público (CU09).
 *
 * Única fuente de datos del catálogo que ve el CLIENTE (landing, /catalogo y
 * detalle de producto). Es mode-aware:
 *  - `saasMode=false` conserva el contrato legacy (GET /productos...).
 *  - `saasMode=true`  usa exclusivamente las rutas públicas SaaS
 *    (`/catalogo/public/{empresa_slug}/...`), sin JWT y sin endpoints legacy.
 *
 * NO reutiliza `ProductosService` (CU07/administración): sus métodos públicos
 * legacy son consumidos por el POS del personal y devoluciones, con un contrato
 * distinto.
 */
@Injectable({ providedIn: 'root' })
export class CatalogoService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = environment.apiUrl.replace(/\/+$/, '');
  private readonly saasMode = inject(SAAS_MODE);

  private slug(): string | null {
    return obtenerEmpresaSlugPublica();
  }

  /** Opciones activas de filtros (categorías, tallas, colores, ...). */
  obtenerFiltros(): Observable<CatalogoFiltros> {
    const ruta = construirRutaFiltros(
      this.apiUrl,
      this.saasMode,
      this.slug(),
    );
    return this.http.get<unknown>(ruta).pipe(map(normalizarCatalogoFiltros));
  }

  /** Listado de productos del catálogo público (arreglo plano). */
  listarProductos(
    filtros: PublicoListarFiltros = {},
  ): Observable<ProductoPublico[]> {
    if (this.saasMode) {
      const ruta = construirRutaListado(
        this.apiUrl,
        this.saasMode,
        this.slug(),
      );
      return this.http
        .get<unknown[]>(ruta, { params: construirParamsListadoSaas(filtros) })
        .pipe(map((items) => items.map(normalizarProductoPublicoSaas)));
    }

    const ruta = construirRutaListado(this.apiUrl, this.saasMode, this.slug());
    return this.http
      .get<unknown[]>(ruta, { params: construirParamsListadoLegacy(filtros) })
      .pipe(map((items) => items.map(normalizarProductoPublicoLegacy)));
  }

  /** Detalle de producto (variantes, recursos y, en SaaS, disponibilidad). */
  obtenerProductoDetalle(id: number): Observable<ProductoPublicoDetalle> {
    const ruta = construirRutaDetalle(this.apiUrl, this.saasMode, this.slug(), id);
    if (this.saasMode) {
      return this.http.get<unknown>(ruta).pipe(map(normalizarDetallePublicoSaas));
    }
    return this.http.get<unknown>(ruta).pipe(map(normalizarDetallePublicoLegacy));
  }

  /**
   * Disponibilidad legacy (GET /productos/{id}/disponibilidad).
   *
   * Solo se usa en `saasMode=false`: en SaaS la disponibilidad ya viene dentro
   * del detalle (`ProductoPublicoDetalle.disponibilidad`).
   */
  obtenerDisponibilidad(id: number): Observable<DisponibilidadFila[]> {
    if (this.saasMode) {
      // El contrato SaaS incluye disponibilidad en el detalle público;
      // jamás invocar el endpoint legacy bloqueado en producción.
      return throwError(() => new Error('La disponibilidad SaaS se obtiene del detalle de producto.'));
    }
    return this.http
      .get<unknown>(`${this.apiUrl}/productos/${id}/disponibilidad`)
      .pipe(map(normalizarDisponibilidadLegacy));
  }
}
