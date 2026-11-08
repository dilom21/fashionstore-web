import { Route } from '@angular/router';

import { routes } from '../../app.routes';
import { adminAuthGuard } from '../../core/guards/admin-auth.guard';
import { clienteAuthGuard } from '../../core/guards/cliente-auth.guard';
import { tenantAdminAuthGuard } from '../../core/guards/tenant-admin-auth.guard';
import { administracionRoutes } from '../administracion/administracion.routes';
import { autenticacionSeguridadRoutes } from '../autenticacion-seguridad/autenticacion-seguridad.routes';
import { saasRoutes } from '../../saas/saas.routes';

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

  it('/saas mantiene disponible el login SaaS', async () => {
    const login = saasRoutes.find((item) => item.path === 'login');
    expect(login).toBeTruthy();
    expect(await nombreComponente(login?.loadComponent)).toContain('SaasLoginPage');
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

  it('/saas conserva el panel SaaS autenticado', async () => {
    const panel = saasRoutes.find((item) => item.path === '');
    expect(panel?.canActivate).toBeTruthy();
    expect(await nombreComponente(panel?.loadComponent)).toContain('SaasShell');
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
