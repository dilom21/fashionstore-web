import { routes } from './app.routes';
import { clienteAuthGuard } from './core/guards/cliente-auth.guard';

/**
 * CU19: el checkout digital es privado del CLIENTE y debe declararse antes del
 * wildcard para no caer en la redirección a la landing.
 */
describe('Ruta de checkout digital (CU19)', () => {
  const ruta = routes.find((item) => item.path === 'checkout/:carrito_id');

  it('expone /checkout/:carrito_id', () => {
    expect(ruta).toBeTruthy();
  });

  it('está protegida por clienteAuthGuard', () => {
    expect(ruta?.canActivate).toContain(clienteAuthGuard);
  });

  it('se carga de forma diferida (lazy)', () => {
    expect(typeof ruta?.loadComponent).toBe('function');
  });

  it('se declara antes del wildcard', () => {
    const paths = routes.map((item) => item.path);
    expect(paths.indexOf('checkout/:carrito_id')).toBeLessThan(
      paths.indexOf('**'),
    );
  });

  it('no rompe las rutas de carrito ni de reservas', () => {
    const paths = routes.map((item) => item.path);
    expect(paths).toContain('carritos');
    expect(paths).toContain('carritos/:carrito_id');
    expect(paths).toContain('reservas');
    expect(paths).toContain('reservas/nueva/:carrito_id');
    expect(paths).toContain('reservas/:reserva_id');
  });
});
