import { RenderMode, ServerRoute } from '@angular/ssr';

export const serverRoutes: ServerRoute[] = [
  // Rutas privadas del personal: se renderizan por petición (no se prerenderizan).
  {
    path: 'dashboard',
    renderMode: RenderMode.Server,
  },
  {
    path: 'admin/**',
    renderMode: RenderMode.Server,
  },
  {
    path: 'auth/personal/login',
    renderMode: RenderMode.Server,
  },
  // Catálogo público (CU09): datos dinámicos, se renderiza por petición.
  {
    path: 'catalogo/**',
    renderMode: RenderMode.Server,
  },
  // Carrito del cliente (CU15): requiere sesión; nunca se prerenderiza.
  {
    path: 'carritos',
    renderMode: RenderMode.Server,
  },
  {
    path: 'carritos/**',
    renderMode: RenderMode.Server,
  },
  {
    path: '**',
    renderMode: RenderMode.Prerender,
  },
];
