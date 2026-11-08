import { inject, Injectable } from '@angular/core';
import { Observable, map } from 'rxjs';

import { FiltroOpcion } from '../../../catalogo/models/catalogo-filtros.model';
import { TenantApiService } from '../../../saas/services/tenant-api.service';

/** Opciones de talla, color y temporada de `GET /tenant/inventario/filtros`. */
export interface OpcionesInventarioFiltros {
  tallas: FiltroOpcion[];
  colores: FiltroOpcion[];
  temporadas: FiltroOpcion[];
}

/**
 * Opción tal como la devuelve la API empresarial. `estado` es opcional: cuando
 * el endpoint lo informa se descartan las opciones inactivas (el primer parcial
 * solo mostraba activas).
 */
interface OpcionApi {
  id: number;
  nombre: string;
  estado?: boolean | null;
}

/** Respuesta admitida de `GET /tenant/catalogo/categorias`. */
type CategoriasApi =
  | OpcionApi[]
  | { categorias?: OpcionApi[]; items?: OpcionApi[] };

/**
 * Catálogos de filtros de CU08 (CU13/CU14) en modo EMPRESARIAL.
 *
 * Sustituye, SOLO para estas dos pantallas, al `GET /catalogo/filtros` del
 * primer parcial (bloqueado en modo SaaS):
 *
 * - Categorías  -> `GET /tenant/catalogo/categorias`.
 * - Sucursales  -> `GET /tenant/empresa/sucursales` (solo `estado === true`).
 * - Tallas, colores y temporadas -> `GET /tenant/inventario/filtros`.
 *
 * `CatalogoService.obtenerFiltros()` NO se modifica: otras funcionalidades del
 * primer parcial siguen usándolo igual.
 *
 * IMPORTANTE: `/tenant/inventario/filtros` es una solución PROVISIONAL del
 * backend para CU08. No debe convertirse en dependencia permanente de otros
 * módulos sin justificación.
 *
 * Todas las consultas usan el JWT EMPRESARIAL a través de
 * `TenantApiService.consultar()`; nunca el JWT legacy ni `empresa_id`.
 */
@Injectable({ providedIn: 'root' })
export class InventarioFiltrosService {
  private readonly tenantApi = inject(TenantApiService);

  /**
   * Sucursales ACTIVAS de la empresa autenticada.
   * `GET /tenant/empresa/sucursales` devuelve `estado`; el backend ya limita el
   * conjunto a las sucursales autorizadas para el usuario.
   */
  obtenerSucursales(): Observable<FiltroOpcion[]> {
    return this.tenantApi.sucursales().pipe(
      map((sucursales) =>
        sucursales
          .filter((sucursal) => sucursal.estado === true)
          .map((sucursal) => ({ id: sucursal.id, nombre: sucursal.nombre })),
      ),
    );
  }

  /** `GET /tenant/catalogo/categorias` (solo opciones activas si informan `estado`). */
  obtenerCategorias(): Observable<FiltroOpcion[]> {
    return this.tenantApi
      .consultar<CategoriasApi>('/tenant/catalogo/categorias')
      .pipe(
        map((respuesta) =>
          aOpciones(
            Array.isArray(respuesta)
              ? respuesta
              : (respuesta?.categorias ?? respuesta?.items),
          ),
        ),
      );
  }

  /** `GET /tenant/inventario/filtros`: tallas, colores y temporadas. */
  obtenerOpciones(): Observable<OpcionesInventarioFiltros> {
    return this.tenantApi
      .consultar<{
        tallas?: OpcionApi[] | null;
        colores?: OpcionApi[] | null;
        temporadas?: OpcionApi[] | null;
      }>('/tenant/inventario/filtros')
      .pipe(
        map((respuesta) => ({
          tallas: aOpciones(respuesta?.tallas),
          colores: aOpciones(respuesta?.colores),
          temporadas: aOpciones(respuesta?.temporadas),
        })),
      );
  }
}

/**
 * Normaliza las opciones recibidas a `{ id, nombre }` descartando entradas sin
 * identificador o sin nombre y las marcadas como inactivas. No inventa valores.
 */
function aOpciones(lista: readonly OpcionApi[] | null | undefined): FiltroOpcion[] {
  if (!Array.isArray(lista)) {
    return [];
  }
  return lista
    .filter((opcion) => opcion !== null && opcion.estado !== false)
    .filter(
      (opcion) =>
        Number.isInteger(opcion.id) &&
        typeof opcion.nombre === 'string' &&
        opcion.nombre.trim().length > 0,
    )
    .map((opcion) => ({ id: opcion.id, nombre: opcion.nombre }));
}
