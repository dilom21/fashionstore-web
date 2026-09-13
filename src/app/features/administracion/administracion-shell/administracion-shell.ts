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
import { ADMIN_NAV_ITEMS, filtrarItemsNav } from '../navigation/admin-nav.config';

/**
 * Rutas del panel reservadas para ENCARGADO_SUCURSAL (CU13 - Consultar
 * inventario y CU14 - Movimientos de inventario). El resto de módulos quedan
 * ocultos para su rol.
 */
const RUTAS_ENCARGADO_SUCURSAL = new Set([
  '/admin/inventario/consultar',
  '/admin/inventario/movimientos',
]);

/**
 * Contenedor (shell) del área administrativa (/admin).
 *
 * Layout de escritorio: sidebar lateral fija + contenido (router-outlet).
 * La sidebar es reutilizable (app-admin-sidebar) y se alimenta de la
 * configuración ADMIN_NAV_ITEMS filtrada por rol. El acceso lo controla
 * adminAuthGuard en la ruta: ADMINISTRADOR (todo el panel) y
 * ENCARGADO_SUCURSAL (solo CU13).
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

  /**
   * Navegación real del panel (lista única de módulos).
   *
   * Se filtra por rol reutilizando `filtrarItemsNav`: el ADMINISTRADOR ve todo
   * y el ENCARGADO_SUCURSAL solo las opciones de su alcance (CU13).
   */
  readonly navItems = computed(() => {
    if (this.authService.esAdministrador()) {
      return ADMIN_NAV_ITEMS;
    }
    return filtrarItemsNav(
      ADMIN_NAV_ITEMS,
      (item) =>
        item.route !== undefined && RUTAS_ENCARGADO_SUCURSAL.has(item.route),
    );
  });

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
