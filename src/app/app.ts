import { afterNextRender, Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { AuthService } from './features/autenticacion-seguridad/auth/services/auth.service';
import { esModoSaas } from './saas/saas.config';
import { SaasSessionService } from './saas/services/saas-session.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  styleUrl: './app.css',
  templateUrl: './app.html',
})
export class App {
  private readonly authService = inject(AuthService);
  private readonly saasSesion = inject(SaasSessionService);

  constructor() {
    // Restaura la sesión una sola vez, solo en el navegador y sin bloquear el
    // primer render. Los errores (backend caído, 5xx) se ignoran para no
    // impedir la navegación.
    afterNextRender(() => {
      if (esModoSaas()) {
        // Modo SaaS: nunca se restaura el JWT legacy. Si hay token de empresa,
        // se hidrata la identidad con GET /auth/tenant/me; los guards hacen lo
        // mismo cuando el usuario navega (la llamada se comparte).
        if (this.saasSesion.hayToken()) {
          this.saasSesion.hidratar().subscribe({
            error: () => {
              /* El guard de tenant decidirá si redirige al login. */
            },
          });
        }
        return;
      }

      this.authService.restaurarSesion().subscribe({
        error: () => {
          /* La restauración falló; se mantiene el estado de visitante. */
        },
      });
    });
  }
}
