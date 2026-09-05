import { afterNextRender, Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { AuthService } from './features/autenticacion-seguridad/auth/services/auth.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  styleUrl: './app.css',
  templateUrl: './app.html',
})
export class App {
  private readonly authService = inject(AuthService);

  constructor() {
    // Restaura la sesión (JWT + /auth/me) una sola vez, solo en el navegador y
    // sin bloquear el primer render. Los errores (backend caído, 5xx) se
    // ignoran para no impedir la navegación: si el backend vuelve, la sesión
    // podrá restaurarse desde el navbar/login cuando corresponda.
    afterNextRender(() => {
      this.authService.restaurarSesion().subscribe({
        error: () => {
          /* La restauración falló; se mantiene el estado de visitante. */
        },
      });
    });
  }
}
