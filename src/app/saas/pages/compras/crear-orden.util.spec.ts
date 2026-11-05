import {
  MAX_CANTIDAD_ORDEN_COMPRA,
  MAX_LINEAS_ORDEN_COMPRA,
  LineaOrdenCompraEntrada,
  construirOrdenCompra,
  fechaLocalAIso,
  normalizarCostoUnitario,
  validarLineasOrdenCompra,
} from './crear-orden.util';

const LINEA: LineaOrdenCompraEntrada = {
  variante_producto_id: 9,
  temporada_id: 2,
  cantidad: 10,
  costo_unitario: '45.50',
};

describe('normalizarCostoUnitario', () => {
  it('acepta enteros y decimales con punto o coma', () => {
    expect(normalizarCostoUnitario('45.5')).toBe(45.5);
    expect(normalizarCostoUnitario('45,50')).toBe(45.5);
    expect(normalizarCostoUnitario('0')).toBe(0);
    expect(normalizarCostoUnitario('0.00')).toBe(0);
  });

  it('rechaza textos, negativos y más de 2 decimales', () => {
    expect(normalizarCostoUnitario('')).toBeNull();
    expect(normalizarCostoUnitario('abc')).toBeNull();
    expect(normalizarCostoUnitario('-1')).toBeNull();
    expect(normalizarCostoUnitario('45.555')).toBeNull();
  });
});

describe('fechaLocalAIso', () => {
  it('devuelve null cuando el campo está vacío', () => {
    expect(fechaLocalAIso('')).toBeNull();
    expect(fechaLocalAIso('   ')).toBeNull();
  });

  it('devuelve null cuando el texto no es una fecha', () => {
    expect(fechaLocalAIso('mañana')).toBeNull();
  });

  it('convierte un datetime-local a ISO con zona', () => {
    const iso = fechaLocalAIso('2026-11-01T10:30');

    expect(iso).not.toBeNull();
    expect(iso?.endsWith('Z')).toBe(true);
    expect(Number.isNaN(new Date(iso as string).getTime())).toBe(false);
  });
});

describe('validarLineasOrdenCompra', () => {
  it('rechaza una orden sin líneas', () => {
    const resultado = validarLineasOrdenCompra([]);

    expect(resultado.ok).toBe(false);
    expect(resultado.mensajeGeneral).toBe(
      'Agrega al menos una línea a la orden de compra.',
    );
  });

  it('rechaza más de 50 líneas sin validar filas', () => {
    const entradas = Array.from(
      { length: MAX_LINEAS_ORDEN_COMPRA + 1 },
      () => LINEA,
    );

    const resultado = validarLineasOrdenCompra(entradas);

    expect(resultado.ok).toBe(false);
    expect(resultado.lineas).toEqual([]);
    expect(resultado.mensajeGeneral).toBe(
      `Una orden de compra admite como máximo ${MAX_LINEAS_ORDEN_COMPRA} líneas.`,
    );
  });

  it('normaliza una línea válida con costo numérico', () => {
    const resultado = validarLineasOrdenCompra([LINEA]);

    expect(resultado).toEqual({
      ok: true,
      lineas: [
        {
          variante_producto_id: 9,
          temporada_id: 2,
          cantidad: 10,
          costo_unitario: 45.5,
        },
      ],
      errores: [],
      mensajeGeneral: null,
    });
  });

  it('marca variante, temporada, cantidad y costo con su índice', () => {
    const resultado = validarLineasOrdenCompra([
      {
        variante_producto_id: null,
        temporada_id: 0,
        cantidad: 0,
        costo_unitario: '',
      },
    ]);

    expect(resultado.ok).toBe(false);
    expect(resultado.lineas).toEqual([]);
    expect(resultado.errores.map((error) => error.campo)).toEqual([
      'variante_producto_id',
      'temporada_id',
      'cantidad',
      'costo_unitario',
    ]);
    expect(resultado.errores.every((error) => error.indice === 0)).toBe(true);
  });

  it('respeta el máximo de unidades por línea', () => {
    const excedida = validarLineasOrdenCompra([
      { ...LINEA, cantidad: MAX_CANTIDAD_ORDEN_COMPRA + 1 },
    ]);

    expect(excedida.ok).toBe(false);
    expect(excedida.errores[0]?.campo).toBe('cantidad');
    expect(excedida.errores[0]?.mensaje).toContain(
      String(MAX_CANTIDAD_ORDEN_COMPRA),
    );
  });
});

describe('construirOrdenCompra', () => {
  const LINEA_CREADA = {
    variante_producto_id: 9,
    temporada_id: 2,
    cantidad: 10,
    costo_unitario: 45.5,
  };

  it('incluye fecha y observación cuando se informan', () => {
    const dto = construirOrdenCompra({
      proveedorId: 3,
      sucursalId: 4,
      fechaEstimada: '2026-11-01T10:30:00.000Z',
      observacion: '  Reposición  ',
      lineas: [LINEA_CREADA],
    });

    expect(dto).toEqual({
      proveedor_id: 3,
      sucursal_id: 4,
      fecha_estimada: '2026-11-01T10:30:00.000Z',
      observacion: 'Reposición',
      lineas: [LINEA_CREADA],
    });
  });

  it('omite los opcionales vacíos (extra=forbid)', () => {
    const dto = construirOrdenCompra({
      proveedorId: 3,
      sucursalId: 4,
      fechaEstimada: null,
      observacion: '   ',
      lineas: [LINEA_CREADA],
    });

    expect(Object.keys(dto)).toEqual([
      'proveedor_id',
      'sucursal_id',
      'lineas',
    ]);
    expect('fecha_estimada' in dto).toBe(false);
    expect('observacion' in dto).toBe(false);
  });
});
