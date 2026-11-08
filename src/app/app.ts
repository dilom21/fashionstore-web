import { afterNextRender, Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { AuthService } from './features/autenticacion-seguridad/auth/services/auth.service';
import { TenantApiService } from './features/saas/services/tenant-api.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  styleUrl: './app.css',
  templateUrl: './app.html',
})
export class App {
  private readonly authService = inject(AuthService);
  private readonly tenantApi = inject(TenantApiService);

  constructor() {
    // Restaura las sesiones una sola vez, solo en el navegador (SSR-safe) y sin
    // bloquear el primer render. Los errores (backend caído, 5xx) se ignoran
    // para no impedir la navegación.
    afterNextRender(() => {
      // Sesión legacy del primer parcial (JWT + /auth/me).
      this.authService.restaurarSesion().subscribe({
        error: () => {
          /* La restauración falló; se mantiene el estado de visitante. */
        },
      });

      // Sesión EMPRESARIAL (SaaS). Sin JWT empresarial no hay petición; con
      // JWT se confirma la identidad con GET /auth/tenant/me: un 401/403 ya
      // limpia el token dentro del servicio y un error de red o 5xx NO declara
      // la sesión como autenticada (solo se conserva el token para reintentar).
      this.tenantApi.restaurarSesion().subscribe({
        error: () => {
          /* Sin sesión empresarial confirmada; el estado queda en visitante. */
        },
      });
    });
  }
}
