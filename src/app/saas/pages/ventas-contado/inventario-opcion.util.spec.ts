import { TenantInventario } from '../../models/tenant.models';
import {
  etiquetaOpcionInventario,
  maximoCantidadPorStock,
  validarStockLineasVenta,
} from './inventario-opcion.util';
import { MAX_CANTIDAD_LINEA } from './ventas-contado.util';

const FILA: TenantInventario = {
  id: 101,
  sucursal_id: 4,
  sucursal_nombre: 'Sucursal Centro',
  variante_producto_id: 9,
  producto_id: 3,
  producto_nombre: 'Polera oversize',
  sku: 'POL-M-BLA',
  talla_id: 4,
  talla: 'M',
  color_id: 7,
  color: 'Blanco',
  temporada_id: 2,
  temporada_nombre: 'Verano 2026',
  stock_actual: 7,
  stock_reservado: 2,
  stock_disponible: 5,
};

describe('etiquetaOpcionInventario', () => {
  it('arma «SKU — Producto — Talla/Color — disp. N»', () => {
    expect(etiquetaOpcionInventario(FILA)).toBe(
      'POL-M-BLA — Polera oversize — M/Blanco — disp. 5',
    );
  });

  it('omite talla/color cuando el backend los entrega vacíos', () => {
    expect(
      etiquetaOpcionInventario({ ...FILA, talla: '', color: '', talla_id: 0, color_id: 0 }),
    ).toBe('POL-M-BLA — Polera oversize — disp. 5');
  });
});

describe('maximoCantidadPorStock', () => {
  it('usa min(MAX_CANTIDAD_LINEA, stock_disponible)', () => {
    expect(maximoCantidadPorStock(5)).toBe(5);
    expect(maximoCantidadPorStock(1000)).toBe(1000);
    expect(maximoCantidadPorStock(2000)).toBe(MAX_CANTIDAD_LINEA);
    expect(maximoCantidadPorStock(5, 3)).toBe(3);
  });

  it('nunca devuelve un máximo negativo', () => {
    expect(maximoCantidadPorStock(0)).toBe(0);
    expect(maximoCantidadPorStock(-4)).toBe(0);
  });

  it('sin fila seleccionada devuelve el tope del contrato', () => {
    expect(maximoCantidadPorStock(null)).toBe(MAX_CANTIDAD_LINEA);
    expect(maximoCantidadPorStock(undefined)).toBe(MAX_CANTIDAD_LINEA);
    expect(maximoCantidadPorStock(Number.NaN)).toBe(MAX_CANTIDAD_LINEA);
  });
});

describe('validarStockLineasVenta', () => {
  it('rechaza una venta sin líneas', () => {
    const resultado = validarStockLineasVenta([], [FILA]);

    expect(resultado.ok).toBe(false);
    expect(resultado.mensajeGeneral).toBe('Agrega al menos una línea de venta.');
  });

  it('avisa cuando la sucursal no tiene inventario y no valida filas', () => {
    const resultado = validarStockLineasVenta(
      [{ inventario_id: 101, cantidad: 1 }],
      [],
    );

    expect(resultado.ok).toBe(false);
    expect(resultado.errores).toEqual([]);
    expect(resultado.mensajeGeneral).toContain('no tiene inventario disponible');
  });

  it('marca el inventario que no pertenece a la sucursal', () => {
    const resultado = validarStockLineasVenta(
      [{ inventario_id: 999, cantidad: 1 }],
      [FILA],
    );

    expect(resultado.ok).toBe(false);
    expect(resultado.errores).toEqual([
      {
        indice: 0,
        campo: 'inventario_id',
        mensaje: 'El inventario elegido no pertenece a la sucursal de la venta.',
      },
    ]);
  });

  it('marca la fila sin stock disponible', () => {
    const resultado = validarStockLineasVenta(
      [{ inventario_id: 101, cantidad: 1 }],
      [{ ...FILA, stock_disponible: 0 }],
    );

    expect(resultado.ok).toBe(false);
    expect(resultado.errores[0]).toEqual({
      indice: 0,
      campo: 'cantidad',
      mensaje: 'La variante no tiene stock disponible.',
    });
  });

  it('marca la cantidad que supera el stock disponible', () => {
    const resultado = validarStockLineasVenta(
      [
        { inventario_id: 101, cantidad: 4 },
        { inventario_id: 101, cantidad: 6 },
      ],
      [FILA],
    );

    expect(resultado.ok).toBe(false);
    expect(resultado.errores).toEqual([
      {
        indice: 1,
        campo: 'cantidad',
        mensaje: 'La cantidad supera el stock disponible (5).',
      },
    ]);
  });

  it('acepta cantidades dentro del stock y del tope del contrato', () => {
    const resultado = validarStockLineasVenta(
      [{ inventario_id: 101, cantidad: 5 }],
      [FILA],
    );

    expect(resultado).toEqual({
      ok: true,
      errores: [],
      mensajeGeneral: null,
    });
  });

  it('ignora filas incompletas: las informa validarLineasVenta', () => {
    const resultado = validarStockLineasVenta(
      [{ inventario_id: null, cantidad: null }],
      [FILA],
    );

    expect(resultado.ok).toBe(true);
    expect(resultado.errores).toEqual([]);
  });
});
