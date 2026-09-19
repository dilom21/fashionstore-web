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
  // Atención de reservas en sucursal (CU18): área operativa del personal
  // (ENCARGADO_SUCURSAL / CAJERO); requiere sesión, nunca se prerenderiza.
  {
    path: 'personal/**',
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
  // Reservas del cliente (CU16): requieren sesión; nunca se prerenderizan.
  {
    path: 'reservas',
    renderMode: RenderMode.Server,
  },
  {
    path: 'reservas/**',
    renderMode: RenderMode.Server,
  },
  {
    path: '**',
    renderMode: RenderMode.Prerender,
  },
];
