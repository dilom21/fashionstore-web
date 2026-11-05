import { TenantInventario } from '../../models/tenant.models';
import {
  ErrorLineaVenta,
  LineaVentaEntrada,
  MAX_CANTIDAD_LINEA,
} from './ventas-contado.util';

/**
 * Utilidades puras del selector de inventario de la venta de contado.
 *
 * El backend es la autoridad del stock y del precio: aquí solo se construye la
 * etiqueta de cada opción y se valida que la cantidad no supere
 * `stock_disponible` ANTES de enviar la venta.
 */

/**
 * Etiqueta de una opción del selector de inventario.
 *
 * Formato exigido por la pantalla:
 * `SKU — Producto — Talla/Color — disp. N`.
 */
export function etiquetaOpcionInventario(item: TenantInventario): string {
  const tallaColor = [item.talla, item.color]
    .map((parte) => (parte ?? '').trim())
    .filter((parte) => parte.length > 0)
    .join('/');
  const partes = [item.sku, item.producto_nombre];
  if (tallaColor.length > 0) {
    partes.push(tallaColor);
  }
  partes.push(`disp. ${item.stock_disponible}`);
  return partes.join(' — ');
}

/**
 * Cantidad máxima de una línea según el stock disponible.
 *
 * Es `min(MAX_CANTIDAD_LINEA, stock_disponible)`, nunca negativa. Cuando no hay
 * una fila de inventario seleccionada se devuelve el máximo del contrato para
 * que la validación informe primero de la fila incompleta.
 */
export function maximoCantidadPorStock(
  stockDisponible: number | null | undefined,
  maximo: number = MAX_CANTIDAD_LINEA,
): number {
  if (
    stockDisponible === null ||
    stockDisponible === undefined ||
    !Number.isFinite(stockDisponible)
  ) {
    return maximo;
  }
  return Math.max(0, Math.min(maximo, Math.floor(stockDisponible)));
}

/** Índice de inventario por `id` para resolver la fila elegida sin recargar. */
export function indexarInventario(
  inventario: readonly TenantInventario[],
): ReadonlyMap<number, TenantInventario> {
  return new Map(inventario.map((item) => [item.id, item]));
}

/** Resultado de validar las cantidades contra el stock disponible. */
export interface StockLineasVentaValidado {
  ok: boolean;
  errores: ErrorLineaVenta[];
  mensajeGeneral: string | null;
}

/**
 * Valida que cada línea no supere el `stock_disponible` de su inventario.
 *
 * Solo revisa filas con `inventario_id` y `cantidad` ya válidos (el resto lo
 * informa `validarLineasVenta`). Devuelve el índice de fila de cada problema.
 */
export function validarStockLineasVenta(
  entradas: readonly LineaVentaEntrada[],
  inventario: readonly TenantInventario[],
  maximo: number = MAX_CANTIDAD_LINEA,
): StockLineasVentaValidado {
  if (entradas.length === 0) {
    return {
      ok: false,
      errores: [],
      mensajeGeneral: 'Agrega al menos una línea de venta.',
    };
  }

  if (inventario.length === 0) {
    return {
      ok: false,
      errores: [],
      mensajeGeneral:
        'La sucursal seleccionada no tiene inventario disponible para vender.',
    };
  }

  const porId = indexarInventario(inventario);
  const errores: ErrorLineaVenta[] = [];

  entradas.forEach((entrada, indice) => {
    const cantidad = entrada.cantidad;
    const inventarioId = entrada.inventario_id;
    if (
      inventarioId === null ||
      cantidad === null ||
      !Number.isInteger(inventarioId) ||
      !Number.isInteger(cantidad) ||
      cantidad < 1
    ) {
      return;
    }

    const fila = porId.get(inventarioId);
    if (fila === undefined) {
      errores.push({
        indice,
        campo: 'inventario_id',
        mensaje: 'El inventario elegido no pertenece a la sucursal de la venta.',
      });
      return;
    }

    const disponible = Math.max(0, fila.stock_disponible);
    const tope = maximoCantidadPorStock(disponible, maximo);
    if (disponible <= 0) {
      errores.push({
        indice,
        campo: 'cantidad',
        mensaje: 'La variante no tiene stock disponible.',
      });
      return;
    }
    if (cantidad > tope) {
      errores.push({
        indice,
        campo: 'cantidad',
        mensaje: `La cantidad supera el stock disponible (${disponible}).`,
      });
    }
  });

  return { ok: errores.length === 0, errores, mensajeGeneral: null };
}
