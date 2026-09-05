import {
  afterNextRender,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';

import { AuthService } from '../../autenticacion-seguridad/auth/services/auth.service';
import { AdminSidebar } from '../components/admin-sidebar/admin-sidebar';
import { ADMIN_NAV_ITEMS } from '../navigation/admin-nav.config';

/**
 * Contenedor (shell) del área administrativa (/admin).
 *
 * Layout de escritorio: sidebar lateral fija + contenido (router-outlet).
 * La sidebar es reutilizable (app-admin-sidebar) y se alimenta de la
 * configuración ADMIN_NAV_ITEMS. Solo es accesible con rol ADMINISTRADOR
 * (adminAuthGuard en la ruta).
 */
@Component({
  selector: 'app-administracion-shell',
  imports: [RouterOutlet, AdminSidebar],
  styleUrl: './administracion-shell.css',
  templateUrl: './administracion-shell.html',
})
export class AdministracionShell {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  /** Navegación real del panel (lista única de módulos). */
  readonly navItems = ADMIN_NAV_ITEMS;

  readonly correo = computed(
    () => this.authService.usuarioActual()?.correo ?? null,
  );
  readonly rol = computed(
    () => this.authService.usuarioActual()?.rol ?? null,
  );
  readonly nombre = computed(() => {
    const usuario = this.authService.usuarioActual();
    if (usuario === null || !('nombre' in usuario) || !usuario.nombre) {
      return null;
    }
    const apellido =
      'apellido' in usuario && usuario.apellido ? ` ${usuario.apellido}` : '';
    return `${usuario.nombre}${apellido}`;
  });

  /** Etiqueta mostrada en la sesión (nombre o fallback por rol/correo). */
  readonly etiquetaUsuario = computed(
    () =>
      this.nombre() ??
      (this.authService.esAdministrador() ? 'Administrador' : null) ??
      this.correo() ??
      'Personal',
  );

  /** Sidebar expandida (desktop) o solo iconos. */
  readonly colapsada = signal(false);
  /** Drawer abierto en móvil (off-canvas). */
  readonly movilAbierta = signal(false);

  constructor() {
    // En pantallas menores a 1280px (tablet) arranca colapsada.
    afterNextRender(() => {
      if (window.matchMedia('(max-width: 1279px)').matches) {
        this.colapsada.set(true);
      }
    });
  }

  alternarColapso(): void {
    this.colapsada.update((colapsada) => !colapsada);
  }

  abrirMovil(): void {
    this.movilAbierta.set(true);
    this.colapsada.set(false);
  }

  cerrarMovil(): void {
    this.movilAbierta.set(false);
  }

  cerrarSesion(): void {
    this.authService.cerrarSesion();
    void this.router.navigateByUrl('/auth/personal/login');
  }
}
