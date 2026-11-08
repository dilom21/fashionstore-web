import { Routes } from '@angular/router';

/**
 * Rutas internas del feature de autenticación y seguridad.
 *
 * Se montan bajo el prefijo 'auth' en app.routes.ts:
 *  - personal/login -> Portal empresarial (FashionStore): acceso del PERSONAL.
 *
 * La ruta pública de clientes ('/login') se mantiene en app.routes.ts.
 */
export const autenticacionSeguridadRoutes: Routes = [
  {
    path: 'personal/login',
    title: 'Portal empresarial · FashionStore',
    loadComponent: () =>
      import('./auth/pages/personal-login/personal-login').then(
        (m) => m.PersonalLogin,
      ),
  },
];
