import {
  generarOperacionId,
  siguienteOperacionId,
} from './operacion-id.util';

/** UUID v4 en minúsculas: versión 4 y variante 8/9/a/b. */
const PATRON_UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('operacion-id.util', () => {
  it('genera un UUID v4 válido', () => {
    const uuid = generarOperacionId();
    expect(uuid).toMatch(PATRON_UUID_V4);
  });

  it('no reutiliza el identificador entre operaciones', () => {
    const generados = new Set<string>();
    for (let i = 0; i < 25; i += 1) {
      generados.add(generarOperacionId());
    }
    expect(generados.size).toBe(25);
  });

  it('rota el identificador después de un éxito', () => {
    const nuevo = '11111111-2222-4333-8444-555555555555';
    expect(
      siguienteOperacionId(true, 'aaaaaaaa-2222-4333-8444-555555555555', () => nuevo),
    ).toBe(nuevo);
  });

  it('conserva el identificador después de un error', () => {
    const actual = 'aaaaaaaa-2222-4333-8444-555555555555';
    let generado = false;
    const resultado = siguienteOperacionId(false, actual, () => {
      generado = true;
      return 'otro';
    });

    expect(resultado).toBe(actual);
    expect(generado).toBe(false);
  });

  it('por defecto genera un UUID v4 distinto al actual', () => {
    const actual = 'aaaaaaaa-2222-4333-8444-555555555555';
    const resultado = siguienteOperacionId(true, actual);

    expect(resultado).not.toBe(actual);
    expect(resultado).toMatch(PATRON_UUID_V4);
  });
});
