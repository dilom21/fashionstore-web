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
import { AdminNavItem } from '../models/admin-nav-item';
import { ADMIN_NAV_ITEMS, filtrarItemsNav } from '../navigation/admin-nav.config';

/**
 * Rutas del panel reservadas para ENCARGADO_SUCURSAL (CU13 - Consultar
 * inventario, CU14 - Movimientos de inventario, CU17 - Gestionar reservas de
 * sucursal y CU18 - Atender reservas). El resto de módulos quedan ocultos para
 * su rol.
 */
const RUTAS_ENCARGADO_SUCURSAL = new Set([
  '/admin/inventario/consultar',
  '/admin/inventario/movimientos',
  '/admin/reservas',
  // CU18 se ofrece en el submenú Reservas; su pantalla vive en /personal pero
  // se renderiza dentro de este mismo layout.
  '/personal/reservas/atencion',
  // CU20 (venta presencial) vive en /personal/ventas/presencial.
  '/personal/ventas/presencial',
  // CU25 (devoluciones) vive en /personal/devoluciones: ADMINISTRADOR y
  // ENCARGADO_SUCURSAL.
  '/personal/devoluciones',
]);

/**
 * Rutas visibles para CAJERO: CU18 (Atender reservas) y CU20 (Registrar venta
 * presencial). No accede al panel administrativo (adminAuthGuard lo devuelve a
 * /dashboard si lo intenta), por lo que solo ve los grupos Reservas y
 * Ventas y Pagos con sus opciones operativas.
 */
const RUTAS_CAJERO = new Set([
  '/personal/reservas/atencion',
  '/personal/ventas/presencial',
]);

/**
 * Contenedor (shell) del área administrativa (/admin).
 *
 * Layout de escritorio: sidebar lateral fija + contenido (router-outlet).
 * La sidebar es reutilizable (app-admin-sidebar) y se alimenta de la
 * configuración ADMIN_NAV_ITEMS filtrada por rol.
 *
 * Es el layout principal del sistema y lo comparten:
 * - /admin/** (CU03-CU17), protegido por adminAuthGuard;
 * - /personal/reservas/atencion(/:id) (CU18), protegido por
 *   atencionReservasGuard y visible también para CAJERO (con el menú filtrado);
 * - /personal/ventas/presencial (CU20), protegido por ventasPresencialesGuard
 *   y visible también para ENCARGADO_SUCURSAL y CAJERO.
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
   * Se filtra por rol reutilizando `filtrarItemsNav` (los grupos sin hijos
   * visibles se descartan solos):
   * - ADMINISTRADOR: todo el panel.
   * - ENCARGADO_SUCURSAL: CU13, CU14, CU17, CU18 y CU20.
   * - CAJERO: CU18 y CU20 (Reservas y Ventas y Pagos).
   *
   * Esto es visibilidad, no autorización: cada ruta sigue protegida por su
   * guard y el backend es la autoridad final (403).
   */
  readonly navItems = computed(() => {
    if (this.authService.esAdministrador()) {
      return ADMIN_NAV_ITEMS;
    }
    if (this.authService.esCajero()) {
      return this.filtrarPorRutas(RUTAS_CAJERO);
    }
    if (this.authService.esEncargadoSucursal()) {
      return this.filtrarPorRutas(RUTAS_ENCARGADO_SUCURSAL);
    }
    return [];
  });

  /** Opciones (y grupos) cuyas rutas pertenecen al conjunto permitido. */
  private filtrarPorRutas(rutas: ReadonlySet<string>): AdminNavItem[] {
    return filtrarItemsNav(
      ADMIN_NAV_ITEMS,
      (item) => item.route !== undefined && rutas.has(item.route),
    );
  }

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
