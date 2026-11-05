import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../environments/environment';
import {
  TenantCategoria,
  TenantCategoriaCrear,
  TenantCategoriaEditar,
  TenantCiudad,
  TenantColor,
  TenantProducto,
  TenantProductoCrear,
  TenantProductoEditar,
  TenantProveedor,
  TenantTalla,
  TenantTemporada,
  TenantVariante,
  TenantVarianteCrear,
  TenantVarianteEditar,
  TenantVarianteEmpresa,
} from '../models/tenant.models';

/**
 * Filtros de `GET /tenant/catalogo/productos`.
 *
 * Los nombres coinciden con los query params del backend. Un valor
 * `null`/`undefined` se omite del query string (el backend aplica su default:
 * `limit=50`, `offset=0`).
 */
export interface FiltroProductosTenant {
  categoria_id?: number | null;
  limit?: number;
  offset?: number;
}

/**
 * Filtros de `GET /tenant/catalogo/variantes`.
 *
 * `texto` busca por SKU/producto y admite 1..60 caracteres; `limit` 1..200 y
 * `offset` >= 0. Los valores fuera de rango o vacíos se omiten.
 */
export interface FiltroVariantesEmpresaTenant {
  producto_id?: number | null;
  texto?: string | null;
  limit?: number;
  offset?: number;
}

/**
 * Catálogo de la empresa autenticada (`/tenant/catalogo/*`).
 *
 * Contrato:
 * - Lectura: autorizada por matriz (`CATALOGO/CONSULTAR`; los diccionarios de
 *   ciudades y de compras exigen `SUCURSALES/CONSULTAR` y `COMPRAS/CONSULTAR`).
 * - Escritura: solo ADMINISTRADOR (403 en otro caso).
 *
 * Reglas de construcción:
 * - El `empresa_id` NUNCA viaja en la URL ni en el cuerpo: lo resuelve el
 *   backend desde el JWT de la membresía.
 * - No existen `DELETE` ni campo `estado` en categorías/productos: este
 *   servicio no los inventa.
 * - Los cuerpos de `PATCH` llevan SOLO los campos modificados (`{}` → 422).
 * - Todas las URL se construyen sin barra final.
 */
@Injectable({ providedIn: 'root' })
export class SaasCatalogoService {
  private readonly http = inject(HttpClient);

  /** URL base de la API normalizada (sin barra final). */
  private readonly apiUrl = environment.apiUrl.replace(/\/+$/, '');

  /** Prefijo exacto del recurso (sin `/` final). */
  private readonly base = `${this.apiUrl}/tenant/catalogo`;

  // ============================== Categorías ==============================

  /** `GET /tenant/catalogo/categorias` — todas las categorías de la empresa. */
  listarCategorias(): Observable<TenantCategoria[]> {
    return this.http.get<TenantCategoria[]>(`${this.base}/categorias`);
  }

  /** `GET /tenant/catalogo/categorias/{id}` — 404 si no existe o es de otra empresa. */
  obtenerCategoria(id: number): Observable<TenantCategoria> {
    return this.http.get<TenantCategoria>(`${this.base}/categorias/${id}`);
  }

  /**
   * `POST /tenant/catalogo/categorias` — crea una categoría (201).
   *
   * Errores esperables: 403 si el rol no es ADMINISTRADOR, 422 por validación.
   */
  crearCategoria(dto: TenantCategoriaCrear): Observable<TenantCategoria> {
    return this.http.post<TenantCategoria>(`${this.base}/categorias`, dto);
  }

  /**
   * `PATCH /tenant/catalogo/categorias/{id}` — edita campos puntuales (200).
   *
   * Errores esperables: 422 con cuerpo vacío o `nombre: null`, 409 por
   * conflicto de datos, 404 si la categoría es de otra empresa.
   */
  editarCategoria(
    id: number,
    dto: TenantCategoriaEditar,
  ): Observable<TenantCategoria> {
    return this.http.patch<TenantCategoria>(
      `${this.base}/categorias/${id}`,
      dto,
    );
  }

  // =============================== Productos ===============================

  /**
   * `GET /tenant/catalogo/productos` — listado paginado y filtrable.
   *
   * El backend NO devuelve un total de resultados: la paginación se resuelve
   * con `offset` y el tamaño de la página.
   */
  listarProductos(
    filtro: FiltroProductosTenant = {},
  ): Observable<TenantProducto[]> {
    let params = new HttpParams();

    if (
      filtro.categoria_id !== undefined &&
      filtro.categoria_id !== null &&
      Number.isInteger(filtro.categoria_id) &&
      filtro.categoria_id > 0
    ) {
      params = params.set('categoria_id', filtro.categoria_id);
    }
    if (filtro.limit !== undefined) {
      params = params.set('limit', filtro.limit);
    }
    if (filtro.offset !== undefined) {
      params = params.set('offset', filtro.offset);
    }

    return this.http.get<TenantProducto[]>(`${this.base}/productos`, {
      params,
    });
  }

  /** `GET /tenant/catalogo/productos/{id}` — 404 si es de otra empresa. */
  obtenerProducto(id: number): Observable<TenantProducto> {
    return this.http.get<TenantProducto>(`${this.base}/productos/${id}`);
  }

  /**
   * `POST /tenant/catalogo/productos` — crea un producto (201).
   *
   * Errores esperables: 403 sin ADMINISTRADOR, 422 si la categoría no es de la
   * empresa o el precio no es válido.
   */
  crearProducto(dto: TenantProductoCrear): Observable<TenantProducto> {
    return this.http.post<TenantProducto>(`${this.base}/productos`, dto);
  }

  /**
   * `PATCH /tenant/catalogo/productos/{id}` — edita campos puntuales (200).
   *
   * Errores esperables: 422 con cuerpo vacío o campos obligatorios en `null`,
   * 409 por conflicto de datos.
   */
  editarProducto(
    id: number,
    dto: TenantProductoEditar,
  ): Observable<TenantProducto> {
    return this.http.patch<TenantProducto>(
      `${this.base}/productos/${id}`,
      dto,
    );
  }

  // =============================== Variantes ===============================

  /**
   * `GET /tenant/catalogo/productos/{id}/variantes` — variantes del producto.
   *
   * Un producto de otra empresa responde 404 (ni siquiera una lista vacía).
   */
  listarVariantes(productoId: number): Observable<TenantVariante[]> {
    return this.http.get<TenantVariante[]>(
      `${this.base}/productos/${productoId}/variantes`,
    );
  }

  /**
   * `POST /tenant/catalogo/productos/{id}/variantes` — crea una variante (201).
   *
   * `talla_id` y `color_id` son identificadores globales: el backend rechaza
   * tallas/colores inexistentes o inactivos con 409/422.
   */
  crearVariante(
    productoId: number,
    dto: TenantVarianteCrear,
  ): Observable<TenantVariante> {
    return this.http.post<TenantVariante>(
      `${this.base}/productos/${productoId}/variantes`,
      dto,
    );
  }

  /** `GET /tenant/catalogo/variantes/{id}` — detalle de una variante. */
  obtenerVariante(id: number): Observable<TenantVariante> {
    return this.http.get<TenantVariante>(`${this.base}/variantes/${id}`);
  }

  /**
   * `PATCH /tenant/catalogo/variantes/{id}` — edita campos puntuales (200).
   *
   * Errores esperables: 422 con cuerpo vacío, 409 si la talla/color de
   * referencia ya no está disponible.
   */
  editarVariante(
    id: number,
    dto: TenantVarianteEditar,
  ): Observable<TenantVariante> {
    return this.http.patch<TenantVariante>(
      `${this.base}/variantes/${id}`,
      dto,
    );
  }

  // ========================= Diccionarios de apoyo ========================

  /**
   * `GET /tenant/catalogo/tallas` — tallas activas del diccionario GLOBAL.
   *
   * Errores esperables: 403 sin `CATALOGO/CONSULTAR`. La UI debe tratarlo como
   * aviso y no romper la pantalla.
   */
  listarTallas(): Observable<TenantTalla[]> {
    return this.http.get<TenantTalla[]>(`${this.base}/tallas`);
  }

  /**
   * `GET /tenant/catalogo/colores` — colores activos del diccionario GLOBAL.
   *
   * Errores esperables: 403 sin `CATALOGO/CONSULTAR`.
   */
  listarColores(): Observable<TenantColor[]> {
    return this.http.get<TenantColor[]>(`${this.base}/colores`);
  }

  /**
   * `GET /tenant/catalogo/ciudades` — ciudades del diccionario GLOBAL.
   *
   * Alimenta el alta de sucursales. Errores esperables: 403 sin
   * `SUCURSALES/CONSULTAR`.
   */
  listarCiudades(): Observable<TenantCiudad[]> {
    return this.http.get<TenantCiudad[]>(`${this.base}/ciudades`);
  }

  /**
   * `GET /tenant/catalogo/proveedores` — proveedores de la empresa.
   *
   * Puede devolver una lista vacía (no es un error). Errores esperables: 403
   * sin `COMPRAS/CONSULTAR`.
   */
  listarProveedores(): Observable<TenantProveedor[]> {
    return this.http.get<TenantProveedor[]>(`${this.base}/proveedores`);
  }

  /**
   * `GET /tenant/catalogo/temporadas` — temporadas de la empresa.
   *
   * Errores esperables: 403 sin `COMPRAS/CONSULTAR`.
   */
  listarTemporadas(): Observable<TenantTemporada[]> {
    return this.http.get<TenantTemporada[]>(`${this.base}/temporadas`);
  }

  /**
   * `GET /tenant/catalogo/variantes` — variantes de toda la empresa.
   *
   * Acepta `producto_id`, `texto` (1..60), `limit` (1..200) y `offset` >= 0;
   * los valores inválidos se omiten para no provocar un 422. Errores
   * esperables: 403 sin `CATALOGO/CONSULTAR`.
   */
  listarVariantesEmpresa(
    filtro: FiltroVariantesEmpresaTenant = {},
  ): Observable<TenantVarianteEmpresa[]> {
    let params = new HttpParams();

    if (
      filtro.producto_id !== undefined &&
      filtro.producto_id !== null &&
      Number.isInteger(filtro.producto_id) &&
      filtro.producto_id > 0
    ) {
      params = params.set('producto_id', filtro.producto_id);
    }
    const texto = (filtro.texto ?? '').trim();
    if (texto.length > 0 && texto.length <= 60) {
      params = params.set('texto', texto);
    }
    if (
      filtro.limit !== undefined &&
      Number.isInteger(filtro.limit) &&
      filtro.limit >= 1 &&
      filtro.limit <= 200
    ) {
      params = params.set('limit', filtro.limit);
    }
    if (
      filtro.offset !== undefined &&
      Number.isInteger(filtro.offset) &&
      filtro.offset >= 0
    ) {
      params = params.set('offset', filtro.offset);
    }

    return this.http.get<TenantVarianteEmpresa[]>(`${this.base}/variantes`, {
      params,
    });
  }
}
