import {
  MAX_LINEAS_RECEPCION,
  LineaRecepcionEntrada,
  construirLineasRecepcion,
} from './compras.util';

describe('construirLineasRecepcion', () => {
  it('envía solo las líneas con cantidad mayor que 0', () => {
    const entradas: LineaRecepcionEntrada[] = [
      { detalle_orden_compra_id: 21, pendiente: 6, cantidad: 4 },
      { detalle_orden_compra_id: 22, pendiente: 5, cantidad: 0 },
      { detalle_orden_compra_id: 23, pendiente: 3, cantidad: null },
      { detalle_orden_compra_id: 24, pendiente: 2, cantidad: 2 },
    ];

    const resultado = construirLineasRecepcion(entradas);

    expect(resultado.ok).toBe(true);
    expect(resultado.lineas).toEqual([
      { detalle_orden_compra_id: 21, cantidad: 4 },
      { detalle_orden_compra_id: 24, cantidad: 2 },
    ]);
    expect(resultado.errores).toEqual({});
    expect(resultado.mensajeGeneral).toBeNull();
  });

  it('rechaza una cantidad mayor que lo pendiente y marca la fila', () => {
    const resultado = construirLineasRecepcion([
      { detalle_orden_compra_id: 21, pendiente: 2, cantidad: 3 },
    ]);

    expect(resultado.ok).toBe(false);
    expect(resultado.lineas).toEqual([]);
    expect(resultado.errores['0']).toBe(
      'La cantidad debe ser un entero entre 1 y 2.',
    );
  });

  it('rechaza cantidades negativas, decimales o no numéricas', () => {
    const resultado = construirLineasRecepcion([
      { detalle_orden_compra_id: 21, pendiente: 5, cantidad: -1 },
      { detalle_orden_compra_id: 22, pendiente: 5, cantidad: 1.5 },
      { detalle_orden_compra_id: 23, pendiente: 5, cantidad: Number.NaN },
    ]);

    expect(resultado.ok).toBe(false);
    expect(Object.keys(resultado.errores).sort()).toEqual(['0', '1', '2']);
    expect(resultado.lineas).toEqual([]);
  });

  it('rechaza una cantidad positiva en una línea sin pendiente', () => {
    const resultado = construirLineasRecepcion([
      { detalle_orden_compra_id: 21, pendiente: 0, cantidad: 1 },
    ]);

    expect(resultado.ok).toBe(false);
    expect(resultado.errores['0']).toBe(
      'La línea no tiene unidades pendientes.',
    );
  });

  it('exige al menos una cantidad mayor que 0', () => {
    const resultado = construirLineasRecepcion([
      { detalle_orden_compra_id: 21, pendiente: 6, cantidad: 0 },
      { detalle_orden_compra_id: 22, pendiente: 5, cantidad: null },
    ]);

    expect(resultado.ok).toBe(false);
    expect(resultado.lineas).toEqual([]);
    expect(resultado.mensajeGeneral).toBe(
      'Indica al menos una cantidad mayor que 0 para recibir mercadería.',
    );
  });

  it('rechaza una orden sin líneas', () => {
    const resultado = construirLineasRecepcion([]);

    expect(resultado.ok).toBe(false);
    expect(resultado.mensajeGeneral).toBe(
      'La orden no tiene líneas pendientes de recepción.',
    );
  });

  it('respeta el máximo de líneas del contrato', () => {
    const entradas: LineaRecepcionEntrada[] = Array.from(
      { length: MAX_LINEAS_RECEPCION + 1 },
      (_, indice) => ({
        detalle_orden_compra_id: indice + 1,
        pendiente: 1,
        cantidad: 1,
      }),
    );

    const resultado = construirLineasRecepcion(entradas);

    expect(resultado.ok).toBe(false);
    expect(resultado.lineas).toEqual([]);
    expect(resultado.mensajeGeneral).toContain('50 líneas');
  });

  it('acepta exactamente lo pendiente como cantidad máxima', () => {
    const resultado = construirLineasRecepcion([
      { detalle_orden_compra_id: 21, pendiente: 6, cantidad: 6 },
    ]);

    expect(resultado.ok).toBe(true);
    expect(resultado.lineas).toEqual([
      { detalle_orden_compra_id: 21, cantidad: 6 },
    ]);
  });
});
