import {
  combinarFechaHoraAtencionSaas,
  esFechaHoraFutura,
  formatearFechaHoraLocal,
  formatearFechaHoraReserva,
} from './reserva-fecha.util';

describe('reserva-fecha.util (SaaS)', () => {
  it('construye un datetime AWARE a partir de la fecha/hora local', () => {
    const iso = combinarFechaHoraAtencionSaas('2026-11-10', '10:00');
    expect(iso).not.toBeNull();
    // El instante coincide con la fecha/hora local elegida.
    expect(new Date(iso as string).getTime()).toBe(
      new Date(2026, 10, 10, 10, 0, 0, 0).getTime(),
    );
    // Es AWARE (termina en Z o lleva offset).
    expect(iso).toMatch(/Z$|[+-]\d{2}:\d{2}$/);
  });

  it('devuelve null ante entradas inválidas', () => {
    expect(combinarFechaHoraAtencionSaas('', '10:00')).toBeNull();
    expect(combinarFechaHoraAtencionSaas('2026-11-10', '')).toBeNull();
    expect(combinarFechaHoraAtencionSaas('2026-11-10', '99:99')).toBeNull();
  });

  it('formatea en la zona local del navegador', () => {
    const fecha = new Date(2026, 10, 10, 10, 0, 0, 0);
    const resultado = formatearFechaHoraLocal(fecha.toISOString());
    expect(resultado).toBe('10/11/2026 10:00');
  });

  it('formatearFechaHoraReserva usa lectura literal en legacy y local en SaaS', () => {
    const iso = '2026-09-20T10:00:00+00:00';
    expect(formatearFechaHoraReserva(iso, false)).toBe('20/09/2026 10:00');
    // En SaaS se interpreta como instante y se muestra en local (no se asume 10:00).
    expect(formatearFechaHoraReserva(iso, true)).toBe(
      formatearFechaHoraLocal(iso),
    );
  });

  it('esFechaHoraFutura compara la fecha local con el ahora', () => {
    expect(esFechaHoraFutura('2020-01-01', '10:00')).toBe(false);

    const manana = new Date(Date.now() + 86_400_000);
    const mes = String(manana.getMonth() + 1).padStart(2, '0');
    const dia = String(manana.getDate()).padStart(2, '0');
    expect(esFechaHoraFutura(`${manana.getFullYear()}-${mes}-${dia}`, '10:00')).toBe(
      true,
    );
  });
});
