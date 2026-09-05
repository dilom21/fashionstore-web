import { Component, computed, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';

import { AuthService } from '../../services/auth.service';

/**
 * Dashboard temporal del personal.
 *
 * Es una pantalla provisional que confirma que el acceso y la navegación
 * funcionan. El panel administrativo real se desarrollará más adelante.
 */
@Component({
  selector: 'app-dashboard',
  imports: [RouterLink],
  styleUrl: './dashboard.css',
  templateUrl: './dashboard.html',
})
export class Dashboard {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  readonly rol = computed(() => this.authService.usuarioActual()?.rol ?? null);
  readonly correo = computed(
    () => this.authService.usuarioActual()?.correo ?? null,
  );
  readonly esAdministrador = computed(() => this.authService.esAdministrador());
  readonly nombreCompleto = computed(() => {
    const usuario = this.authService.usuarioActual();
    if (usuario === null || !('nombre' in usuario) || !usuario.nombre) {
      return null;
    }
    const apellido =
      'apellido' in usuario && usuario.apellido ? ` ${usuario.apellido}` : '';
    return `${usuario.nombre}${apellido}`;
  });

  cerrarSesion(): void {
    this.authService.cerrarSesion();
    void this.router.navigateByUrl('/auth/personal/login');
  }
}