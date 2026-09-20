import { RenderMode } from '@angular/ssr';

import { routes as appRoutes } from '../../app.routes';
import { serverRoutes } from '../../app.routes.server';
import { clienteAuthGuard } from '../../core/guards/cliente-auth.guard';

/**
 * CU22: la ruta de pago electrónico es privada del CLIENTE, lazy y debe
 * declararse antes del wildcard. En SSR se renderiza por petición.
 */
describe('Ruta de pago electrónico (CU22)', () => {
  const ruta = appRoutes.find((item) => item.path === 'pagos/stripe/:venta_id');

  it('expone /pagos/stripe/:venta_id', () => {
    expect(ruta).toBeTruthy();
  });

  it('está protegida por clienteAuthGuard', () => {
    expect(ruta?.canActivate).toContain(clienteAuthGuard);
  });

  it('se carga de forma diferida (lazy)', () => {
    expect(typeof ruta?.loadComponent).toBe('function');
  });

  it('se declara antes del wildcard', () => {
    const paths = appRoutes.map((item) => item.path);
    expect(paths.indexOf('pagos/stripe/:venta_id')).toBeLessThan(
      paths.indexOf('**'),
    );
  });

  it('carga la página real de pago', async () => {
    const cargador = ruta?.loadComponent as unknown as () => Promise<{
      name?: string;
    }>;
    const pagina = await cargador();
    expect(pagina?.name).toContain('PagoElectronicoPage');
  });

  it('no rompe las rutas de checkout, carrito ni reservas', () => {
    const paths = appRoutes.map((item) => item.path);
    expect(paths).toContain('checkout/:carrito_id');
    expect(paths).toContain('carritos');
    expect(paths).toContain('reservas');
  });

  it('SSR renderiza /pagos/** por petición (Server), nunca prerender', () => {
    const regla = serverRoutes.find((item) => item.path === 'pagos/**');
    expect(regla).toBeTruthy();
    expect(regla?.renderMode).toBe(RenderMode.Server);
  });
});
