import { Route } from '@angular/router';

import { routes } from '../../app.routes';
import { adminAuthGuard } from '../../core/guards/admin-auth.guard';
import { clienteAuthGuard } from '../../core/guards/cliente-auth.guard';
import { personalSaasAuthGuard } from '../../core/guards/personal-saas-auth.guard';
import { tenantAdminAuthGuard } from '../../core/guards/tenant-admin-auth.guard';
import { administracionRoutes } from '../administracion/administracion.routes';
import { autenticacionSeguridadRoutes } from '../autenticacion-seguridad/autenticacion-seguridad.routes';

const ruta = (path: string) => routes.find((item) => item.path === path);

async function nombreComponente(
  cargador: Route['loadComponent'] | undefined,
): Promise<string | undefined> {
  const pagina = await (cargador as unknown as () => Promise<{
    name?: string;
  }>)();
  // El bundler de pruebas puede prefijar el nombre de la clase (_PersonalLogin).
  return pagina?.name;
}

/**
 * El PERSONAL conserva su dirección del primer parcial (/auth/personal/login)
 * pero ahora entra por el mecanismo SaaS. El login de clientes sigue intacto.
 */
describe('Navegación SaaS del personal', () => {
  it('conserva /auth/personal/login y sirve el formulario del personal', async () => {
    const auth = ruta('auth');
    expect(auth?.loadChildren).toBeTypeOf('function');

    const login = autenticacionSeguridadRoutes.find(
      (item) => item.path === 'personal/login',
    );
    expect(login).toBeTruthy();
    expect(await nombreComponente(login?.loadComponent)).toContain(
      'PersonalLogin',
    );
  });

  it('/saas/ingresar se mantiene disponible (no se elimina ni se redirige)', () => {
    expect(ruta('saas/ingresar')).toBeTruthy();
    expect(ruta('saas/ingresar')?.redirectTo).toBeUndefined();
  });

  it('/saas/empresa exige identidad empresarial ADMINISTRADOR', () => {
    expect(ruta('saas/empresa')?.canActivate).toContain(tenantAdminAuthGuard);
    // La pantalla CU4-CU5 no se elimina: sigue siendo el destino de la opción
    // temporal del panel.
    expect(ruta('saas/empresa')?.redirectTo).toBeUndefined();
  });

  it('/admin/inicio es la página inicial del administrador con el panel original', async () => {
    const shell = administracionRoutes[0];

    expect(shell.path).toBe('');
    expect(shell.canActivate).toContain(adminAuthGuard);

    const inicio = shell.children?.find((item) => item.path === 'inicio');
    expect(inicio).toBeTruthy();
    expect(await nombreComponente(inicio?.loadComponent)).toContain(
      'AdminInicioPage',
    );
  });

  it('/saas/sesion es la pantalla neutral del personal autenticado', async () => {
    const sesion = ruta('saas/sesion');
    expect(sesion?.canActivate).toContain(personalSaasAuthGuard);
    expect(await nombreComponente(sesion?.loadComponent)).toContain(
      'TenantSesionPage',
    );
  });

  it('el login y el registro de clientes siguen siendo públicos', () => {
    expect(ruta('login')?.canActivate).toBeUndefined();
    expect(ruta('registro')?.canActivate).toBeUndefined();
    expect(ruta('catalogo')?.canActivate).toBeUndefined();
  });

  it('las rutas privadas del cliente conservan su guard de cliente', () => {
    expect(ruta('carritos')?.canActivate).toContain(clienteAuthGuard);
    expect(ruta('reservas')?.canActivate).toContain(clienteAuthGuard);
    expect(ruta('checkout/:carrito_id')?.canActivate).toContain(clienteAuthGuard);
  });
});
