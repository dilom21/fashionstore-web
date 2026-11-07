import { HttpErrorResponse } from '@angular/common/http';

import { marcarSesionEmpresarial } from '../../../../core/sesion/sesion-panel';
import { traducirErrorHttp } from './http-error.util';

/**
 * Los endpoints del primer parcial siguen bloqueados para la sesión empresarial
 * (no existe JWT legacy). Ese 401 NO puede tratarse como "sesión expirada":
 * expulsaría al administrador del panel y dejaría las tablas vacías como si no
 * hubiera datos. Debe informarse la limitación real y conservar la pantalla.
 */
describe('traducirErrorHttp con sesión empresarial (endpoints legacy bloqueados)', () => {
  afterEach(() => {
    marcarSesionEmpresarial(false);
  });

  it('sin sesión empresarial un 401 sigue significando sesión expirada', () => {
    const traducido = traducirErrorHttp(
      new HttpErrorResponse({ status: 401 }),
    );

    expect(traducido.sesionExpirada).toBe(true);
    expect(traducido.mensaje).toContain('sesión expiró');
  });

  it('con sesión empresarial un 401 informa la limitación y no expulsa', () => {
    marcarSesionEmpresarial(true);

    const traducido = traducirErrorHttp(
      new HttpErrorResponse({ status: 401 }),
    );

    expect(traducido.sesionExpirada).toBe(false);
    expect(traducido.mensaje).toContain('no están adaptados al modo empresarial');
    expect(traducido.mensaje).toContain('401');
  });

  it('un 403 se informa como falta de permisos en ambas sesiones', () => {
    marcarSesionEmpresarial(true);

    const traducido = traducirErrorHttp(
      new HttpErrorResponse({ status: 403 }),
    );

    expect(traducido.sesionExpirada).toBe(false);
    expect(traducido.mensaje).toContain('permisos');
  });

  it('un 503 se informa como servicio no disponible (no como lista vacía)', () => {
    marcarSesionEmpresarial(true);

    const traducido = traducirErrorHttp(
      new HttpErrorResponse({ status: 503 }),
    );

    expect(traducido.sesionExpirada).toBe(false);
    expect(traducido.mensaje).toContain('No pudimos conectarnos');
  });
});
