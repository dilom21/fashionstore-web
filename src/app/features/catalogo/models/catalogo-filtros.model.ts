/**
 * Modelos de los filtros públicos del catálogo (CU09).
 *
 * Contratos reales del backend FastAPI:
 *   Legacy: GET /catalogo/filtros -> CatalogoFiltros
 *   SaaS:   GET /catalogo/public/{empresa_slug}/filtros -> CatalogoFiltros
 *
 * Solo contiene opciones activas. No se hardcodean filtros en el frontend.
 *
 * Diferencias de contrato:
 *  - En SaaS `colecciones[]` trae únicamente `{ id, nombre }` (sin
 *    `temporada_id`).
 *  - En SaaS `sucursales[]` trae únicamente `{ id, nombre }` (sin `ciudad`).
 * Por eso ambos campos son opcionales: se muestran cuando el contrato los
 * entrega y se omiten cuando no existen (sin inventar valores).
 */

/** Opción genérica de filtro (categoría, talla, color o temporada). */
export interface FiltroOpcion {
  id: number;
  nombre: string;
}

/** Colección activa con su temporada asociada (opcional en el contrato SaaS). */
export interface ColeccionFiltro {
  id: number;
  nombre: string;
  temporada_id?: number;
}

/** Sucursal activa con su ciudad (opcional en el contrato SaaS). */
export interface SucursalFiltro {
  id: number;
  nombre: string;
  ciudad?: string | null;
}

/** Respuesta completa de GET /catalogo/filtros. */
export interface CatalogoFiltros {
  categorias: FiltroOpcion[];
  tallas: FiltroOpcion[];
  colores: FiltroOpcion[];
  temporadas: FiltroOpcion[];
  colecciones: ColeccionFiltro[];
  sucursales: SucursalFiltro[];
}

/** Normaliza la respuesta de filtros asegurando los seis arreglos. */
export function normalizarCatalogoFiltros(crudo: unknown): CatalogoFiltros {
  const objeto = (crudo ?? {}) as Record<string, unknown>;

  const listaSimple = (clave: string): FiltroOpcion[] =>
    Array.isArray(objeto[clave])
      ? (objeto[clave] as unknown[]).map((opcion) => {
          const valor = (opcion ?? {}) as { id?: unknown; nombre?: unknown };
          return {
            id: typeof valor.id === 'number' ? valor.id : 0,
            nombre: typeof valor.nombre === 'string' ? valor.nombre : '',
          };
        })
      : [];

  const listaColecciones = (): ColeccionFiltro[] =>
    Array.isArray(objeto['colecciones'])
      ? (objeto['colecciones'] as unknown[]).map((opcion) => {
          const valor = (opcion ?? {}) as {
            id?: unknown;
            nombre?: unknown;
            temporada_id?: unknown;
          };
          return {
            id: typeof valor.id === 'number' ? valor.id : 0,
            nombre: typeof valor.nombre === 'string' ? valor.nombre : '',
            temporada_id:
              typeof valor.temporada_id === 'number'
                ? valor.temporada_id
                : undefined,
          };
        })
      : [];

  const listaSucursales = (): SucursalFiltro[] =>
    Array.isArray(objeto['sucursales'])
      ? (objeto['sucursales'] as unknown[]).map((opcion) => {
          const valor = (opcion ?? {}) as {
            id?: unknown;
            nombre?: unknown;
            ciudad?: unknown;
          };
          return {
            id: typeof valor.id === 'number' ? valor.id : 0,
            nombre: typeof valor.nombre === 'string' ? valor.nombre : '',
            ciudad:
              typeof valor.ciudad === 'string' ? valor.ciudad : undefined,
          };
        })
      : [];

  return {
    categorias: listaSimple('categorias'),
    tallas: listaSimple('tallas'),
    colores: listaSimple('colores'),
    temporadas: listaSimple('temporadas'),
    colecciones: listaColecciones(),
    sucursales: listaSucursales(),
  };
}

/** Valores seleccionables del formulario de filtros del catálogo. */
export interface CatalogoFiltrosSeleccion {
  buscar: string;
  categoria_id: number | null;
  talla_id: number | null;
  color_id: number | null;
  temporada_id: number | null;
  coleccion_id: number | null;
  sucursal_id: number | null;
  con_stock: boolean;
}

/** Valores seleccionables del formulario de disponibilidad. */
export interface DisponibilidadFiltrosSeleccion {
  sucursal_id: number | null;
  talla_id: number | null;
  color_id: number | null;
  temporada_id: number | null;
}
