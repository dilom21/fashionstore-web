import {
  MAX_CANTIDAD_LINEA,
  construirSolicitudContado,
  generarOperacionId,
  validarLineasVenta,
} from './ventas-contado.util';

const OPERACION = '6f1c2b7e-3a4d-4f5e-9a0b-1c2d3e4f5a6b';

const PATRON_UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe('validarLineasVenta', () => {
  it('rechaza una venta sin líneas', () => {
    const resultado = validarLineasVenta([]);

    expect(resultado.ok).toBe(false);
    expect(resultado.lineas).toEqual([]);
    expect(resultado.errores).toEqual([]);
    expect(resultado.mensajeGeneral).toBe('Agrega al menos una línea de venta.');
  });

  it('rechaza más de 50 líneas sin validar filas', () => {
    const entradas = Array.from({ length: 51 }, () => ({
      inventario_id: 1,
      cantidad: 1,
    }));

    const resultado = validarLineasVenta(entradas);

    expect(resultado.ok).toBe(false);
    expect(resultado.lineas).toEqual([]);
    expect(resultado.mensajeGeneral).toBe(
      'Una venta admite como máximo 50 líneas.',
    );
  });

  it('normaliza líneas válidas y conserva el orden', () => {
    const resultado = validarLineasVenta([
      { inventario_id: 101, cantidad: 2 },
      { inventario_id: 102, cantidad: 1 },
    ]);

    expect(resultado.ok).toBe(true);
    expect(resultado.errores).toEqual([]);
    expect(resultado.mensajeGeneral).toBeNull();
    expect(resultado.lineas).toEqual([
      { inventario_id: 101, cantidad: 2 },
      { inventario_id: 102, cantidad: 1 },
    ]);
  });

  it('marca el inventario vacío, cero o no entero con su índice', () => {
    for (const inventario_id of [null, 0, -3, 1.5]) {
      const resultado = validarLineasVenta([{ inventario_id, cantidad: 1 }]);

      expect(resultado.ok).toBe(false);
      expect(resultado.lineas).toEqual([]);
      expect(resultado.errores).toEqual([
        {
          indice: 0,
          campo: 'inventario_id',
          mensaje:
            'Ingresa el identificador de inventario (entero mayor que 0).',
        },
      ]);
    }
  });

  it('marca la cantidad fuera de 1..1000 o no entera', () => {
    for (const cantidad of [null, 0, MAX_CANTIDAD_LINEA + 1, 1.5]) {
      const resultado = validarLineasVenta([
        { inventario_id: 101, cantidad },
      ]);

      expect(resultado.ok).toBe(false);
      expect(resultado.lineas).toEqual([]);
      expect(resultado.errores).toEqual([
        {
          indice: 0,
          campo: 'cantidad',
          mensaje: 'La cantidad debe ser un entero entre 1 y 1000.',
        },
      ]);
    }
  });

  it('devuelve los errores de la fila 2 sin perder la fila 1 válida', () => {
    const resultado = validarLineasVenta([
      { inventario_id: 101, cantidad: 3 },
      { inventario_id: null, cantidad: 0 },
    ]);

    expect(resultado.ok).toBe(false);
    expect(resultado.lineas).toEqual([{ inventario_id: 101, cantidad: 3 }]);
    expect(resultado.errores.map((error) => error.campo).sort()).toEqual([
      'cantidad',
      'inventario_id',
    ]);
    expect(
      resultado.errores.every((error) => error.indice === 1),
    ).toBe(true);
  });

  it('acepta exactamente 50 líneas y el máximo de cantidad', () => {
    const entradas = Array.from({ length: 50 }, (_, indice) => ({
      inventario_id: indice + 1,
      cantidad: MAX_CANTIDAD_LINEA,
    }));

    const resultado = validarLineasVenta(entradas);

    expect(resultado.ok).toBe(true);
    expect(resultado.lineas).toHaveLength(50);
  });
});

describe('construirSolicitudContado', () => {
  it('devuelve exactamente los cuatro campos del contrato', () => {
    const dto = construirSolicitudContado({
      sucursalId: 4,
      operacionId: OPERACION,
      metodoPago: 'QR',
      lineas: [
        { inventario_id: 101, cantidad: 2 },
        { inventario_id: 102, cantidad: 1 },
      ],
    });

    expect(Object.keys(dto).sort()).toEqual([
      'lineas',
      'metodo_pago',
      'operacion_id',
      'sucursal_id',
    ]);
    expect(dto).toEqual({
      sucursal_id: 4,
      operacion_id: OPERACION,
      metodo_pago: 'QR',
      lineas: [
        { inventario_id: 101, cantidad: 2 },
        { inventario_id: 102, cantidad: 1 },
      ],
    });
  });

  it('no arrastra propiedades ajenas de las líneas normalizadas', () => {
    const dto = construirSolicitudContado({
      sucursalId: 4,
      operacionId: OPERACION,
      metodoPago: 'EFECTIVO',
      lineas: [{ inventario_id: 101, cantidad: 1 }],
    });

    expect(Object.keys(dto.lineas[0]).sort()).toEqual([
      'cantidad',
      'inventario_id',
    ]);
  });
});

describe('generarOperacionId', () => {
  it('genera un UUID v4 válido', () => {
    expect(generarOperacionId()).toMatch(PATRON_UUID_V4);
  });

  it('no repite el identificador entre llamadas', () => {
    const primero = generarOperacionId();
    const segundo = generarOperacionId();

    expect(primero).not.toBe(segundo);
  });
});
