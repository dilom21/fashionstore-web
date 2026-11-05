import { formatearBolivianos, formatearMonto } from './monto.util';

describe('formatearMonto', () => {
  it('presenta dos decimales sin recalcular', () => {
    expect(formatearMonto('120.00')).toBe('120.00');
    expect(formatearMonto(149.9)).toBe('149.90');
    expect(formatearMonto(0)).toBe('0.00');
  });

  it('devuelve un guion cuando no hay valor utilizable', () => {
    expect(formatearMonto(null)).toBe('—');
    expect(formatearMonto(undefined)).toBe('—');
    expect(formatearMonto('')).toBe('—');
    expect(formatearMonto('no-es-numero')).toBe('—');
  });
});

describe('formatearBolivianos', () => {
  it('antepone Bs al monto formateado', () => {
    expect(formatearBolivianos('120.00')).toBe('Bs 120.00');
    expect(formatearBolivianos(300.5)).toBe('Bs 300.50');
  });

  it('no inventa un monto cuando no hay valor', () => {
    expect(formatearBolivianos(null)).toBe('—');
  });
});
