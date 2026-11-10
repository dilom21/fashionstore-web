/**
 * Modelos y normalizadores del catálogo PÚBLICO (CU09).
 *
 * El catálogo público puede venir de dos contratos distintos del backend:
 *  - Legacy (`saasMode=false`): GET /productos, GET /productos/{id},
 *    GET /productos/{id}/disponibilidad.
 *  - SaaS (`saasMode=true`): GET /catalogo/public/{empresa_slug}/productos[/{id}],
 *    GET /catalogo/public/{empresa_slug}/filtros.
 *
 * Estos tipos son la representación INTERNA del frontend (no el wire contract),
 * normalizada desde cualquiera de los dos contratos. NO se reutilizan aquí los
 * modelos administrativos (CU07) ni se inventan propiedades ausentes:
 *  - El listado SaaS no devuelve `estado` ni `categoria_id` (usa `categoria.id`).
 *  - El detalle SaaS trae `disponibilidad[]` plano; NO trae `variantes[].inventarios[]`.
 *  - Los precios pueden llegar como cadenas decimales y se normalizan a número.
 *  - `precio_calculo_pendiente` indica que el precio promocional aún no es
 *    definitivo; en ese caso no debe presentarse como precio final.
 */

/** Categoría/talla/color/sucursal resumida ({ id, nombre }). */
export interface PublicoCategoria {
  id: number;
  nombre: string;
}

/** Producto del catálogo público, ya normalizado. */
export interface ProductoPublico {
  id: number;
  nombre: string;
  descripcion: string | null;
  categoria: PublicoCategoria;
  imagen_principal_url: string | null;
  /** Precio base del producto (decimal). */
  precio: number;
  /** Precio efectivo a mostrar (aplica promociones vigentes). */
  precio_definitivo: number;
  /** true cuando el backend todavía calcula el precio definitivo. */
  precio_calculo_pendiente: boolean;
}

/** Inventario legacy (solo CU15 carrito) de una variante en una sucursal. */
export interface InventarioPublico {
  id: number;
  stock_disponible: number;
  sucursal: PublicoCategoria;
}

/** Variante de producto del catálogo público. */
export interface VariantePublica {
  id: number;
  sku: string;
  estado: boolean;
  talla: PublicoCategoria;
  color: PublicoCategoria;
  /**
   * Legacy-only (CU15 carrito): inventarios por sucursal del detalle
   * `GET /productos/{id}`. Ausente en el detalle SaaS, que expone la
   * disponibilidad en `ProductoPublicoDetalle.disponibilidad[]`.
   */
  inventarios?: InventarioPublico[];
}

/** Recurso de producto del catálogo público. */
export interface RecursoPublico {
  id: number;
  tipo: string;
  url: string;
  es_principal: boolean;
}

/** Fila de disponibilidad (variante × sucursal) del catálogo público. */
export interface DisponibilidadFila {
  variante_id: number;
  sucursal_id: number;
  sucursal: string;
  sku: string;
  talla: string;
  color: string;
  temporada: string;
  stock_disponible: number;
}

/** Detalle de producto del catálogo público, ya normalizado. */
export interface ProductoPublicoDetalle extends ProductoPublico {
  variantes: VariantePublica[];
  recursos: RecursoPublico[];
  /** En SaaS proviene del detalle; en legacy queda vacío (usa otro endpoint). */
  disponibilidad: DisponibilidadFila[];
}

/** Filtro de disponibilidad admitido por el listado SaaS. */
export type DisponibilidadFiltro =
  | 'TODOS'
  | 'CON_STOCK'
  | 'SIN_STOCK'
  | 'STOCK_BAJO';

/** Filtros del listado público (representación de la UI). */
export interface PublicoListarFiltros {
  buscar?: string;
  categoria_id?: number;
  talla_id?: number;
  color_id?: number;
  temporada_id?: number;
  coleccion_id?: number;
  sucursal_id?: number;
  /** Selección de UI "solo con stock"; el servicio la traduce por contrato. */
  con_stock?: boolean;
  limit?: number;
  offset?: number;
}

// ===========================================================================
// Normalizadores (funciones puras, sin dependencias de Angular)
// ===========================================================================

function esNumero(valor: unknown): valor is number {
  return typeof valor === 'number' && Number.isFinite(valor);
}

function cadena(valor: unknown): string {
  return typeof valor === 'string' ? valor : '';
}

function entero(valor: unknown): number {
  return esNumero(valor) ? valor : 0;
}

function categoriaDe(valor: unknown): PublicoCategoria {
  const objeto = (valor ?? {}) as { id?: unknown; nombre?: unknown };
  return { id: entero(objeto.id), nombre: cadena(objeto.nombre) };
}

/** Convierte un precio decimal (número o string) a número. */
export function normalizarPrecioDecimal(valor: unknown): number {
  if (esNumero(valor)) {
    return valor;
  }
  if (typeof valor === 'string') {
    const numero = Number(valor);
    if (Number.isFinite(numero)) {
      return numero;
    }
  }
  return 0;
}

/**
 * Precio efectivo a mostrar.
 *
 * Si `precio_calculo_pendiente` es true NO se presenta el precio promocional
 * como definitivo: se muestra el precio base. Si no hay promoción, el precio
 * definitivo coincide con el base.
 */
export function precioEfectivo(
  precio: number,
  precioDefinitivo: number,
  pendiente: boolean,
): number {
  return pendiente ? precio : precioDefinitivo;
}

/** Normaliza un producto del listado SaaS (GET /catalogo/public/{slug}/productos). */
export function normalizarProductoPublicoSaas(crudo: unknown): ProductoPublico {
  const objeto = (crudo ?? {}) as Record<string, unknown>;
  const precio = normalizarPrecioDecimal(objeto['precio']);
  const pendiente = objeto['precio_calculo_pendiente'] === true;
  const precioDefinitivoCrudo = normalizarPrecioDecimal(
    objeto['precio_definitivo'] ?? objeto['precio'],
  );
  return {
    id: entero(objeto['id']),
    nombre: cadena(objeto['nombre']),
    descripcion:
      objeto['descripcion'] == null ? null : cadena(objeto['descripcion']),
    categoria: objeto['categoria']
      ? categoriaDe(objeto['categoria'])
      : { id: 0, nombre: 'Sin categoría' },
    imagen_principal_url:
      objeto['imagen_principal_url'] == null
        ? null
        : cadena(objeto['imagen_principal_url']),
    precio,
    precio_definitivo: precioEfectivo(precio, precioDefinitivoCrudo, pendiente),
    precio_calculo_pendiente: pendiente,
  };
}

/** Normaliza un producto del listado legacy (GET /productos). */
export function normalizarProductoPublicoLegacy(
  crudo: unknown,
): ProductoPublico {
  const objeto = (crudo ?? {}) as Record<string, unknown>;
  const precio = normalizarPrecioDecimal(objeto['precio']);
  return {
    id: entero(objeto['id']),
    nombre: cadena(objeto['nombre']),
    descripcion:
      objeto['descripcion'] == null ? null : cadena(objeto['descripcion']),
    categoria: objeto['categoria']
      ? categoriaDe(objeto['categoria'])
      : { id: entero(objeto['categoria_id']), nombre: 'Sin categoría' },
    imagen_principal_url:
      objeto['imagen_principal_url'] == null
        ? null
        : cadena(objeto['imagen_principal_url']),
    precio,
    precio_definitivo: precio,
    precio_calculo_pendiente: false,
  };
}

/** Normaliza una variante del detalle SaaS (talla/color como objetos). */
export function normalizarVarianteSaas(crudo: unknown): VariantePublica {
  const objeto = (crudo ?? {}) as Record<string, unknown>;
  return {
    id: entero(objeto['id']),
    sku: cadena(objeto['sku']),
    estado: objeto['estado'] === true,
    talla: objeto['talla']
      ? categoriaDe(objeto['talla'])
      : { id: 0, nombre: '' },
    color: objeto['color']
      ? categoriaDe(objeto['color'])
      : { id: 0, nombre: '' },
  };
}

/** Normaliza una variante del detalle legacy (con inventarios anidados). */
export function normalizarVarianteLegacy(crudo: unknown): VariantePublica {
  const objeto = (crudo ?? {}) as Record<string, unknown>;
  const inventarios = Array.isArray(objeto['inventarios'])
    ? objeto['inventarios'].map(normalizarInventarioLegacy)
    : [];
  return {
    id: entero(objeto['id']),
    sku: cadena(objeto['sku']),
    estado: objeto['estado'] !== false,
    talla: objeto['talla']
      ? categoriaDe(objeto['talla'])
      : { id: 0, nombre: '' },
    color: objeto['color']
      ? categoriaDe(objeto['color'])
      : { id: 0, nombre: '' },
    inventarios,
  };
}

/** Normaliza un inventario legacy (solo los campos que usa CU15 carrito). */
export function normalizarInventarioLegacy(crudo: unknown): InventarioPublico {
  const objeto = (crudo ?? {}) as Record<string, unknown>;
  const sucursal = objeto['sucursal']
    ? categoriaDe(objeto['sucursal'])
    : { id: 0, nombre: '' };
  return {
    id: entero(objeto['id']),
    stock_disponible: entero(objeto['stock_disponible']),
    sucursal,
  };
}

/** Normaliza un recurso del catálogo público. */
export function normalizarRecursoPublico(crudo: unknown): RecursoPublico {
  const objeto = (crudo ?? {}) as Record<string, unknown>;
  return {
    id: entero(objeto['id']),
    tipo: cadena(objeto['tipo']),
    url: cadena(objeto['url']),
    es_principal: objeto['es_principal'] === true,
  };
}

/** Normaliza una fila de disponibilidad del catálogo público SaaS. */
export function normalizarDisponibilidadFila(crudo: unknown): DisponibilidadFila {
  const objeto = (crudo ?? {}) as Record<string, unknown>;
  return {
    variante_id: entero(objeto['variante_id']),
    sucursal_id: entero(objeto['sucursal_id']),
    sucursal: cadena(objeto['sucursal']),
    sku: cadena(objeto['sku']),
    talla: cadena(objeto['talla']),
    color: cadena(objeto['color']),
    temporada: cadena(objeto['temporada']),
    stock_disponible: entero(objeto['stock_disponible']),
  };
}

/** Normaliza el detalle SaaS (GET /catalogo/public/{slug}/productos/{id}). */
export function normalizarDetallePublicoSaas(
  crudo: unknown,
): ProductoPublicoDetalle {
  const base = normalizarProductoPublicoSaas(crudo);
  const objeto = (crudo ?? {}) as Record<string, unknown>;
  const variantes = Array.isArray(objeto['variantes'])
    ? objeto['variantes'].map(normalizarVarianteSaas)
    : [];
  const recursos = Array.isArray(objeto['recursos'])
    ? objeto['recursos'].map(normalizarRecursoPublico)
    : [];
  const disponibilidad = Array.isArray(objeto['disponibilidad'])
    ? objeto['disponibilidad'].map(normalizarDisponibilidadFila)
    : [];
  return { ...base, variantes, recursos, disponibilidad };
}

/** Normaliza el detalle legacy (GET /productos/{id}). */
export function normalizarDetallePublicoLegacy(
  crudo: unknown,
): ProductoPublicoDetalle {
  const base = normalizarProductoPublicoLegacy(crudo);
  const objeto = (crudo ?? {}) as Record<string, unknown>;
  const variantes = Array.isArray(objeto['variantes'])
    ? objeto['variantes'].map(normalizarVarianteLegacy)
    : [];
  const recursos = Array.isArray(objeto['recursos'])
    ? objeto['recursos'].map(normalizarRecursoPublico)
    : [];
  // En legacy la disponibilidad se obtiene de un endpoint separado; aquí no se
  // inventa una equivalencia con los inventarios.
  return { ...base, variantes, recursos, disponibilidad: [] };
}

/**
 * Normaliza la respuesta legacy de GET /productos/{id}/disponibilidad a una
 * lista plana de filas (misma forma que `disponibilidad[]` SaaS).
 */
export function normalizarDisponibilidadLegacy(
  crudo: unknown,
): DisponibilidadFila[] {
  const objeto = (crudo ?? {}) as { sucursales?: unknown };
  if (!Array.isArray(objeto.sucursales)) {
    return [];
  }
  return objeto.sucursales.flatMap((sucursalCruda) => {
    const sucursal = (sucursalCruda ?? {}) as {
      sucursal_id?: unknown;
      sucursal?: unknown;
      variantes?: unknown;
    };
    const sucursalId = entero(sucursal.sucursal_id);
    const sucursalNombre = cadena(sucursal.sucursal);
    if (!Array.isArray(sucursal.variantes)) {
      return [];
    }
    return sucursal.variantes.map((varianteCruda) => {
      const variante = (varianteCruda ?? {}) as Record<string, unknown>;
      return {
        variante_id: entero(variante['variante_id']),
        sucursal_id: sucursalId,
        sucursal: sucursalNombre,
        sku: cadena(variante['sku']),
        talla: cadena(variante['talla']),
        color: cadena(variante['color']),
        temporada: cadena(variante['temporada']),
        stock_disponible: entero(variante['stock_disponible']),
      };
    });
  });
}
