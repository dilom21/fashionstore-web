import { resolverTemporadaId, mensajeTemporadaNoResuelta } from './carrito-temporada.util';

const TEMPORADAS = [
  { id: 1, nombre: 'Primavera-Verano 2026' },
  { id: 2, nombre: 'Otoño-Invierno 2026' },
];

describe('resolverTemporadaId', () => {
  it('resuelve el id con una coincidencia única (sin distinguir mayúsculas/espacios)', () => {
    expect(resolverTemporadaId(TEMPORADAS, 'Primavera-Verano 2026').id).toBe(1);
    expect(
      resolverTemporadaId(TEMPORADAS, '  primavera-verano 2026 ').id,
    ).toBe(1);
    expect(resolverTemporadaId(TEMPORADAS, 'Otoño-Invierno 2026').id).toBe(2);
  });

  it('no resuelve si no se seleccionó temporada', () => {
    expect(resolverTemporadaId(TEMPORADAS, null)).toEqual({
      id: null,
      motivo: 'vacia',
    });
    expect(resolverTemporadaId(TEMPORADAS, '')).toEqual({
      id: null,
      motivo: 'vacia',
    });
  });

  it('no resuelve si el nombre no existe en las opciones', () => {
    expect(resolverTemporadaId(TEMPORADAS, 'Verano 2030')).toEqual({
      id: null,
      motivo: 'no-encontrada',
    });
  });

  it('no elige a ciegas ante nombres ambiguos (misma nombre, distinto id)', () => {
    const ambiguas = [
      { id: 10, nombre: 'Temporada X' },
      { id: 11, nombre: 'temporada x' },
    ];
    expect(resolverTemporadaId(ambiguas, 'Temporada X')).toEqual({
      id: null,
      motivo: 'ambigua',
    });
  });
});

describe('mensajeTemporadaNoResuelta', () => {
  it('no muestra mensaje cuando la selección está vacía', () => {
    expect(mensajeTemporadaNoResuelta({ id: null, motivo: 'vacia' })).toBeNull();
  });

  it('explica la falta de coincidencia y la ambigüedad', () => {
    expect(
      mensajeTemporadaNoResuelta({ id: null, motivo: 'no-encontrada' }),
    ).toBeTruthy();
    expect(
      mensajeTemporadaNoResuelta({ id: null, motivo: 'ambigua' }),
    ).toContain('ambigua');
  });

  it('no muestra mensaje si la resolución fue correcta', () => {
    expect(mensajeTemporadaNoResuelta({ id: 1 })).toBeNull();
  });
});
