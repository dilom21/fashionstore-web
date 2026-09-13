import { routes } from './app.routes';

const ruta = (path: string) => routes.find((item) => item.path === path);

describe('Rutas públicas de compra (CU09)', () => {
  it('la landing es pública (sin guards)', () => {
    expect(ruta('')?.canActivate).toBeUndefined();
  });

  it('el catálogo público es accesible sin autenticación', () => {
    const catalogo = ruta('catalogo');
    expect(catalogo).toBeTruthy();
    expect(catalogo?.canActivate).toBeUndefined();
  });

  it('el detalle de producto es público (sin guards)', () => {
    const detalle = ruta('catalogo/productos/:producto_id');
    expect(detalle).toBeTruthy();
    expect(detalle?.canActivate).toBeUndefined();
  });

  it('el login de cliente vive en /login', () => {
    expect(ruta('login')).toBeTruthy();
  });

  it('no expone el login de personal en la experiencia de compra', () => {
    expect(ruta('auth/personal/login')).toBeUndefined();
    expect(ruta('login')?.path).toBe('login');
  });
});
