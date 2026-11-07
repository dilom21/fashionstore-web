import { esSesionEmpresarial, marcarSesionEmpresarial } from './sesion-panel';

/**
 * Indicador de sesión EMPRESARIAL compartido con las pantallas del panel del
 * primer parcial. Solo describe qué sesión está activa (para interpretar un
 * 401); no guarda tokens ni autoriza accesos.
 */
describe('sesion-panel (estado de la sesión empresarial)', () => {
  afterEach(() => {
    marcarSesionEmpresarial(false);
  });

  it('arranca sin sesión empresarial marcada', () => {
    expect(esSesionEmpresarial()).toBe(false);
  });

  it('se activa cuando TenantApiService confirma la identidad', () => {
    marcarSesionEmpresarial(true);

    expect(esSesionEmpresarial()).toBe(true);
  });

  it('se desactiva al cerrar la sesión empresarial', () => {
    marcarSesionEmpresarial(true);
    marcarSesionEmpresarial(false);

    expect(esSesionEmpresarial()).toBe(false);
  });
});
