import {
  InventarioDetalle,
  ProductoDetalle,
  VarianteProductoDetalle,
} from '../../administracion/catalogo/models/producto.model';

/**
 * Candidato vendible del POS (CU20) construido desde el catálogo público.
 *
 * El CAJERO no puede consultar GET /inventario (403, confirmado en
 * `tests/test_cu13_inventario.py`). La fuente reutilizable que SÍ expone
 * `inventario_id`, sucursal y stock es el detalle público de producto
 * `GET /productos/{producto_id}` (sin JWT), ya modelado por CU07/CU09.
 */
export interface PosVarianteDisponible {
  inventario_id: number;
  producto_id: number;
  producto_nombre: string;
  imagen_principal: string | null;
  variante_producto_id: number;
  sku: string;
  talla_nombre: string;
  color_nombre: string;
  temporada_nombre: string;
  precio: number;
  sucursal_id: number;
  sucursal_nombre: string;
  stock_disponible: number;
}

/** Stock disponible real de una fila de inventario (nunca negativo). */
function stockDe(inventario: InventarioDetalle): number {
  const calculado =
    inventario.stock_disponible ??
    inventario.stock_actual - inventario.stock_reservado;
  return Math.max(0, Number(calculado) || 0);
}

/** Imagen principal del producto (campo aditivo o recurso marcado). */
function imagenPrincipal(producto: ProductoDetalle): string | null {
  if (producto.imagen_principal_url) {
    return producto.imagen_principal_url;
  }
  const principal = (producto.recursos ?? []).find(
    (recurso) => recurso.es_principal,
  );
  return principal?.url ?? null;
}

/**
 * Aplana las variantes/inventarios del detalle público a candidatos del POS.
 *
 * - Solo incluye inventarios con `stock_disponible > 0`.
 * - Si se conoce la sucursal del empleado (`sucursalId`), se restringe a ella:
 *   el CAJERO/ENCARGADO no elige arbitrariamente otra sucursal.
 * - El precio es el del producto (autoridad final: backend).
 */
export function mapearDisponibilidadPos(
  producto: ProductoDetalle,
  sucursalId: number | null = null,
): PosVarianteDisponible[] {
  const imagen = imagenPrincipal(producto);
  const precio = Number(producto.precio);
  const candidatos: PosVarianteDisponible[] = [];

  for (const variante of producto.variantes ?? []) {
    for (const inventario of variante.inventarios ?? []) {
      const stock = stockDe(inventario);
      if (stock <= 0) {
        continue;
      }
      if (sucursalId !== null && inventario.sucursal.id !== sucursalId) {
        continue;
      }
      candidatos.push(mapearCandidato(producto, variante, inventario, imagen, precio, stock));
    }
  }

  return candidatos;
}

function mapearCandidato(
  producto: ProductoDetalle,
  variante: VarianteProductoDetalle,
  inventario: InventarioDetalle,
  imagen: string | null,
  precio: number,
  stock: number,
): PosVarianteDisponible {
  return {
    inventario_id: inventario.id,
    producto_id: producto.id,
    producto_nombre: producto.nombre,
    imagen_principal: imagen,
    variante_producto_id: variante.id,
    sku: variante.sku,
    talla_nombre: variante.talla?.nombre ?? '',
    color_nombre: variante.color?.nombre ?? '',
    temporada_nombre: inventario.temporada?.nombre ?? '',
    precio,
    sucursal_id: inventario.sucursal.id,
    sucursal_nombre: inventario.sucursal.nombre,
    stock_disponible: stock,
  };
}

/** Filtra candidatos por SKU, producto o variante (búsqueda del POS). */
export function filtrarCandidatos(
  candidatos: PosVarianteDisponible[],
  termino: string,
): PosVarianteDisponible[] {
  const texto = termino.trim().toLowerCase();
  if (!texto) {
    return candidatos;
  }
  return candidatos.filter((candidato) =>
    [candidato.sku, candidato.producto_nombre, candidato.color_nombre, candidato.talla_nombre]
      .join(' ')
      .toLowerCase()
      .includes(texto),
  );
}
