import {
  MAX_LINEAS_DEVOLUCION,
  MAX_MOTIVO_DEVOLUCION,
  LineaDevolucionEntrada,
  construirDevolucion,
  validarItemsDevolucion,
} from './crear-devolucion.util';

const OPERACION = '7c9e6679-7425-40de-944b-e07fc1f90ae7';

const LINEA: LineaDevolucionEntrada = {
  detalle_venta_id: 71,
  disponible: 2,
  cantidad: 2,
  reponer: true,
  motivo: 'Queda grande',
};

describe('validarItemsDevolucion', () => {
  it('rechaza una devolución sin líneas cargadas', () => {
    const resultado = validarItemsDevolucion([]);

    expect(resultado.ok).toBe(false);
    expect(resultado.mensajeGeneral).toBe(
      'Carga las líneas de una venta antes de crear la devolución.',
    );
  });

  it('rechaza más de 50 ítems sin validar filas', () => {
    const entradas = Array.from(
      { length: MAX_LINEAS_DEVOLUCION + 1 },
      () => LINEA,
    );

    const resultado = validarItemsDevolucion(entradas);

    expect(resultado.ok).toBe(false);
    expect(resultado.mensajeGeneral).toBe(
      `Una devolución admite como máximo ${MAX_LINEAS_DEVOLUCION} ítems.`,
    );
  });

  it('normaliza un ítem válido e incluye el motivo del ítem', () => {
    const resultado = validarItemsDevolucion([LINEA]);

    expect(resultado).toEqual({
      ok: true,
      items: [
        {
          detalle_venta_id: 71,
          cantidad: 2,
          reponer: true,
          motivo: 'Queda grande',
        },
      ],
      errores: [],
      mensajeGeneral: null,
    });
  });

  it('omite el motivo del ítem cuando está vacío', () => {
    const resultado = validarItemsDevolucion([{ ...LINEA, motivo: '   ' }]);

    expect(resultado.ok).toBe(true);
    expect(Object.keys(resultado.items[0])).toEqual([
      'detalle_venta_id',
      'cantidad',
      'reponer',
    ]);
  });

  it('no envía las filas con cantidad vacía o 0', () => {
    const resultado = validarItemsDevolucion([
      { ...LINEA, cantidad: null },
      { ...LINEA, detalle_venta_id: 72, cantidad: 0 },
      { ...LINEA, detalle_venta_id: 73, cantidad: 1 },
    ]);

    expect(resultado.ok).toBe(true);
    expect(resultado.items.map((item) => item.detalle_venta_id)).toEqual([73]);
  });

  it('marca la fila que no tiene unidades disponibles', () => {
    const resultado = validarItemsDevolucion([
      { ...LINEA, disponible: 0, cantidad: 1 },
    ]);

    expect(resultado.ok).toBe(false);
    expect(resultado.errores).toEqual([
      {
        indice: 0,
        campo: 'cantidad',
        mensaje: 'La línea no tiene unidades disponibles para devolver.',
      },
    ]);
  });

  it('marca la cantidad que supera lo disponible', () => {
    const resultado = validarItemsDevolucion([
      { ...LINEA, disponible: 1, cantidad: 2 },
    ]);

    expect(resultado.ok).toBe(false);
    expect(resultado.errores).toEqual([
      {
        indice: 0,
        campo: 'cantidad',
        mensaje: 'La cantidad debe ser un entero entre 1 y 1.',
      },
    ]);
  });

  it('marca una cantidad no entera', () => {
    const resultado = validarItemsDevolucion([{ ...LINEA, cantidad: 1.5 }]);

    expect(resultado.ok).toBe(false);
    expect(resultado.errores[0]?.campo).toBe('cantidad');
  });

  it('marca el motivo del ítem demasiado largo', () => {
    const resultado = validarItemsDevolucion([
      { ...LINEA, motivo: 'x'.repeat(MAX_MOTIVO_DEVOLUCION + 1) },
    ]);

    expect(resultado.ok).toBe(false);
    expect(resultado.errores[0]?.campo).toBe('motivo');
  });

  it('exige al menos una cantidad mayor que 0', () => {
    const resultado = validarItemsDevolucion([{ ...LINEA, cantidad: null }]);

    expect(resultado.ok).toBe(false);
    expect(resultado.items).toEqual([]);
    expect(resultado.mensajeGeneral).toBe(
      'Indica al menos una cantidad mayor que 0 para registrar la devolución.',
    );
  });
});

describe('construirDevolucion', () => {
  const ITEM = { detalle_venta_id: 71, cantidad: 2, reponer: true };

  it('incluye la observación cuando se informa', () => {
    const dto = construirDevolucion({
      ventaId: 55,
      motivo: '  Talla incorrecta  ',
      observacion: '  Cliente frecuente  ',
      operacionId: OPERACION,
      items: [ITEM],
    });

    expect(dto).toEqual({
      venta_id: 55,
      motivo: 'Talla incorrecta',
      observacion: 'Cliente frecuente',
      operacion_id: OPERACION,
      items: [ITEM],
    });
  });

  it('omite la observación vacía (extra=forbid)', () => {
    const dto = construirDevolucion({
      ventaId: 55,
      motivo: 'Talla incorrecta',
      observacion: '   ',
      operacionId: OPERACION,
      items: [ITEM],
    });

    expect(Object.keys(dto)).toEqual([
      'venta_id',
      'motivo',
      'operacion_id',
      'items',
    ]);
    expect('observacion' in dto).toBe(false);
  });
});
