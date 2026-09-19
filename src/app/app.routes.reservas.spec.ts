import { routes } from './app.routes';
import { clienteAuthGuard } from './core/guards/cliente-auth.guard';

/**
 * CU16: las rutas de reservas son privadas del CLIENTE y `reservas/nueva/:id`
 * debe declararse antes de `reservas/:id` para no interpretarse como un id.
 */
describe('Rutas de reservas (CU16)', () => {
  const rutasReservas = routes.filter((ruta) =>
    (ruta.path ?? '').startsWith('reservas'),
  );

  it('expone las tres rutas de reservas', () => {
    const paths = rutasReservas.map((ruta) => ruta.path);
    expect(paths).toContain('reservas');
    expect(paths).toContain('reservas/nueva/:carrito_id');
    expect(paths).toContain('reservas/:reserva_id');
  });

  it('todas están protegidas por clienteAuthGuard', () => {
    expect(rutasReservas.length).toBe(3);
    for (const ruta of rutasReservas) {
      expect(ruta.canActivate).toContain(clienteAuthGuard);
    }
  });

  it('reservas/nueva/:carrito_id se declara antes de reservas/:reserva_id', () => {
    const paths = rutasReservas.map((ruta) => ruta.path);
    expect(paths.indexOf('reservas/nueva/:carrito_id')).toBeLessThan(
      paths.indexOf('reservas/:reserva_id'),
    );
  });
});
