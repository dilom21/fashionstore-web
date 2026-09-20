import {
  ESTADO_PAGO_APROBADO,
  ESTADO_PAGO_RECHAZADO,
  ESTADO_PAGO_REEMBOLSADO,
  ESTADO_VENTA_CANCELADA,
  compensacionReembolsada,
  mapearEstadoVisualPago,
  permiteReintentarPago,
} from './pago-electronico.model';

describe('mapearEstadoVisualPago (CU22)', () => {
  it('CANCELADA + REEMBOLSADO -> REEMBOLSADO (terminal)', () => {
    expect(
      mapearEstadoVisualPago({
        estado_venta: ESTADO_VENTA_CANCELADA,
        estado_pago: ESTADO_PAGO_REEMBOLSADO,
      }),
    ).toBe('REEMBOLSADO');
  });

  it('CANCELADA + APROBADO -> REEMBOLSO_EN_PROCESO (nunca éxito)', () => {
    expect(
      mapearEstadoVisualPago({
        estado_venta: ESTADO_VENTA_CANCELADA,
        estado_pago: ESTADO_PAGO_APROBADO,
      }),
    ).toBe('REEMBOLSO_EN_PROCESO');
  });

  it('CANCELADA con cualquier otro pago -> REEMBOLSO_EN_PROCESO (seguro)', () => {
    for (const pago of [
      'PENDIENTE',
      ESTADO_PAGO_RECHAZADO,
      'ANULADO',
      null,
      undefined,
    ]) {
      expect(
        mapearEstadoVisualPago({
          estado_venta: 'cancelada',
          estado_pago: pago as string | null | undefined,
        }),
      ).toBe('REEMBOLSO_EN_PROCESO');
    }
  });

  it('compensacion_estado=REEMBOLSADO promueve a REEMBOLSADO', () => {
    expect(
      mapearEstadoVisualPago({
        estado_venta: ESTADO_VENTA_CANCELADA,
        estado_pago: ESTADO_PAGO_APROBADO,
        compensacion_estado: 'REEMBOLSADO',
      }),
    ).toBe('REEMBOLSADO');
  });

  it('COMPLETADA + APROBADO -> EXITO', () => {
    expect(
      mapearEstadoVisualPago({
        estado_venta: 'COMPLETADA',
        estado_pago: ESTADO_PAGO_APROBADO,
      }),
    ).toBe('EXITO');
  });

  it('PAGADA -> EXITO aunque el pago venga nulo', () => {
    expect(
      mapearEstadoVisualPago({
        estado_venta: 'PAGADA',
        estado_pago: null,
      }),
    ).toBe('EXITO');
  });

  it('RECHAZADO -> RECHAZADO', () => {
    expect(
      mapearEstadoVisualPago({
        estado_venta: 'PENDIENTE',
        estado_pago: ESTADO_PAGO_RECHAZADO,
      }),
    ).toBe('RECHAZADO');
  });

  it('ANULADO -> ANULADO', () => {
    expect(
      mapearEstadoVisualPago({
        estado_venta: 'PENDIENTE',
        estado_pago: 'ANULADO',
      }),
    ).toBe('ANULADO');
  });

  it('PENDIENTE + PENDIENTE -> EN_CONFIRMACION', () => {
    expect(
      mapearEstadoVisualPago({
        estado_venta: 'PENDIENTE',
        estado_pago: 'PENDIENTE',
      }),
    ).toBe('EN_CONFIRMACION');
  });

  it('combinación desconocida -> DESCONOCIDO (sin cobro)', () => {
    expect(
      mapearEstadoVisualPago({
        estado_venta: 'RARO',
        estado_pago: 'RARO',
      }),
    ).toBe('DESCONOCIDO');
  });

  it('normaliza minúsculas y espacios', () => {
    expect(
      mapearEstadoVisualPago({
        estado_venta: ' cancelada ',
        estado_pago: ' reembolsado ',
      }),
    ).toBe('REEMBOLSADO');
  });
});

describe('helpers de estado (CU22)', () => {
  it('permiteReintentarPago solo en RECHAZADO/ANULADO', () => {
    expect(permiteReintentarPago('RECHAZADO')).toBe(true);
    expect(permiteReintentarPago('ANULADO')).toBe(true);
    expect(permiteReintentarPago('REEMBOLSO_EN_PROCESO')).toBe(false);
    expect(permiteReintentarPago('REEMBOLSADO')).toBe(false);
    expect(permiteReintentarPago('EXITO')).toBe(false);
    expect(permiteReintentarPago('DESCONOCIDO')).toBe(false);
  });

  it('compensacionReembolsada reconoce los códigos de reembolso', () => {
    expect(compensacionReembolsada('REEMBOLSADO')).toBe(true);
    expect(compensacionReembolsada('reembolso_completado')).toBe(true);
    expect(compensacionReembolsada('EN_PROCESO')).toBe(false);
    expect(compensacionReembolsada(null)).toBe(false);
  });
});
