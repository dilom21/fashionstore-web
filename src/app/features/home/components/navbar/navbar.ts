import { isPlatformBrowser } from '@angular/common';
import {
  afterNextRender,
  Component,
  computed,
  ElementRef,
  inject,
  OnDestroy,
  PLATFORM_ID,
  signal,
  viewChild,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ThemeService } from '../../../../core/services/theme.service';
import { ToastHost } from '../../../../shared/components/toast-host/toast-host';
import { CarritoService } from '../../../carrito/services/carrito.service';
import { AuthService } from '../../../../features/autenticacion-seguridad/auth/services/auth.service';
import { TenantApiService } from '../../../saas/services/tenant-api.service';

interface NavLink {
  label: string;
  /** Ancla interna de la landing (secciones con id). */
  href?: string;
  /** Ruta de la aplicación (p. ej. el catálogo público CU09). */
  routerLink?: string;
}

const NAV_LINKS: NavLink[] = [
  { label: 'Inicio', href: '#inicio' },
  { label: 'Catálogo', routerLink: '/catalogo' },
  { label: 'Categorías', href: '#categorias' },
  { label: 'Novedades', href: '#novedades' },
  { label: 'Ofertas', href: '#ofertas' },
  { label: 'Nosotros', href: '#inspiracion' },
];

/**
 * Barra de navegación principal: logo, enlaces, buscador modal,
 * cambio de tema claro/oscuro y accesos (usuario / catálogo).
 *
 * El buscador no tiene un motor propio: redirige a la búsqueda pública real
 * del catálogo (CU09) mediante `/catalogo?buscar=<termino>`.
 */
@Component({
  selector: 'app-navbar',
  imports: [RouterLink, ToastHost],
  styleUrl: './navbar.css',
  templateUrl: './navbar.html',
})
export class Navbar implements OnDestroy {
  readonly themeService = inject(ThemeService);
  readonly authService = inject(AuthService);
  readonly tenantApi = inject(TenantApiService);
  readonly carritoService = inject(CarritoService);
  private readonly router = inject(Router);
  private readonly platformId = inject(PLATFORM_ID);

  readonly navLinks = NAV_LINKS;
  readonly menuOpen = signal(false);
  readonly searchOpen = signal(false);
  readonly query = signal('');
  readonly accountOpen = signal(false);

  readonly searchInput = viewChild<ElementRef<HTMLInputElement>>('searchInput');
  readonly accountWrap = viewChild<ElementRef<HTMLElement>>('accountWrap');

  /**
   * Sesión de CLIENTE confirmada por el mecanismo SaaS
   * (`GET /auth/tenant/me` con contexto "cliente").
   *
   * La sesión empresarial del PERSONAL no se muestra aquí: su lugar es el panel
   * administrativo/empresarial, no la tienda pública.
   */
  readonly clienteSaas = computed(() => this.tenantApi.contexto() === 'cliente');

  /**
   * Nombre comercial de la empresa cuya sesión de CLIENTE está activa
   * (`GET /auth/tenant/me` → `empresa_nombre`), o `null`.
   *
   * Se muestra solo el de una empresa REALMENTE autenticada: nunca se inventa
   * ni se reutiliza el nombre de otra empresa.
   */
  readonly empresaSaas = computed(() => {
    if (!this.clienteSaas()) {
      return null;
    }
    const nombre = this.tenantApi.identidad()?.empresa_nombre?.trim() ?? '';
    return nombre.length > 0 ? nombre : null;
  });

  /**
   * true si el navbar debe mostrar la zona de cuenta como "sesión iniciada".
   * Cubre la sesión legacy (clientes/personal del primer parcial) y la sesión
   * empresarial del cliente.
   */
  readonly sesionVisible = computed(
    () => this.authService.autenticado() || this.clienteSaas(),
  );

  /**
   * Texto de la zona de cuenta cuando hay sesión iniciada.
   * Tras un login legacy reciente se dispone del nombre (ClienteAuth) -> "Hola, Juan".
   * Tras restaurar con /auth/me solo hay UsuarioAuth -> "Mi cuenta".
   * Con una sesión empresarial de CLIENTE, `GET /auth/tenant/me` NO devuelve
   * nombre ni apellido (el backend solo envía perfil para "personal"), así que
   * se muestra "Mi cuenta": nunca se inventa un nombre de cliente.
   */
  readonly cuentaTexto = computed(() => {
    const usuario = this.authService.usuarioActual();
    if (usuario !== null) {
      if (
        usuario.contexto === 'cliente' &&
        'nombre' in usuario &&
        usuario.nombre
      ) {
        return `Hola, ${usuario.nombre}`;
      }
      return 'Mi cuenta';
    }
    const nombreEmpresarial = this.tenantApi.identidad()?.nombre?.trim() ?? '';
    return nombreEmpresarial.length > 0
      ? `Hola, ${nombreEmpresarial}`
      : 'Mi cuenta';
  });

  private keyHandler: ((event: KeyboardEvent) => void) | null = null;
  private outsideHandler: ((event: PointerEvent) => void) | null = null;
  private lastFocused: HTMLElement | null = null;

  constructor() {
    // Listener global para cerrar buscador / menú de cuenta / menú móvil con
    // Escape, y para cerrar el menú de cuenta al hacer clic fuera. Solo browser.
    afterNextRender(() => {
      this.keyHandler = (event: KeyboardEvent) => {
        if (event.key === 'Escape') {
          if (this.searchOpen()) {
            this.closeSearch();
          } else if (this.accountOpen()) {
            this.closeAccount();
          } else if (this.menuOpen()) {
            this.closeMenu();
          }
        }
      };
      this.outsideHandler = (event: PointerEvent) => {
        const wrap = this.accountWrap()?.nativeElement;
        if (
          this.accountOpen() &&
          wrap &&
          !wrap.contains(event.target as Node)
        ) {
          this.accountOpen.set(false);
        }
      };
      document.addEventListener('keydown', this.keyHandler);
      document.addEventListener('pointerdown', this.outsideHandler);

      // El badge de la bolsa refleja el nº de carritos activos del cliente.
      // Solo se consulta con la sesión legacy de cliente: el login SaaS no
      // dispara consultas de carrito ni actualiza el contador (CU15 sigue sin
      // adaptarse al modo empresarial).
      if (this.authService.esCliente()) {
        this.carritoService.refrescarContador();
      }
    });
  }

  ngOnDestroy(): void {
    if (this.keyHandler) {
      document.removeEventListener('keydown', this.keyHandler);
      this.keyHandler = null;
    }
    if (this.outsideHandler) {
      document.removeEventListener('pointerdown', this.outsideHandler);
      this.outsideHandler = null;
    }
    this.setBodyScrollLock(false);
  }

  toggleMenu(): void {
    this.menuOpen.update((open) => !open);
  }

  closeMenu(): void {
    this.menuOpen.set(false);
  }

  /** Va al login de clientes conservando la URL actual como returnUrl. */
  irAlLogin(): void {
    this.closeMenu();
    this.accountOpen.set(false);
    const urlActual = this.router.url || '/';
    void this.router.navigate(['/login'], {
      queryParams: { returnUrl: urlActual },
    });
  }

  toggleAccount(): void {
    this.accountOpen.update((open) => !open);
  }

  closeAccount(): void {
    this.accountOpen.set(false);
  }

  /** "Mi cuenta" queda preparado sin navegar a un perfil inexistente. */
  elegirMiCuenta(): void {
    this.accountOpen.set(false);
  }

  /**
   * Cierra la sesión que el navbar representa.
   *
   * - Sesión empresarial del CLIENTE: se cierra únicamente esa sesión
   *   (`TenantApiService.cerrarSesion()`), sin tocar el JWT legacy.
   * - Sesión legacy: se conserva el comportamiento del primer parcial (limpiar
   *   el JWT legacy y el carrito en memoria).
   * - Nunca se cierra una sesión de PERSONAL (legacy) como efecto de cerrar la
   *   sesión empresarial de un cliente: serían sesiones de ámbitos distintos.
   */
  cerrarSesion(): void {
    this.accountOpen.set(false);
    const clienteSaas = this.clienteSaas();
    if (clienteSaas) {
      this.tenantApi.cerrarSesion();
    }
    if (!clienteSaas || this.authService.esCliente()) {
      this.authService.cerrarSesion();
      this.carritoService.limpiar();
    }
    void this.router.navigateByUrl('/');
  }

  toggleTheme(): void {
    this.themeService.toggle();
  }

  openSearch(): void {
    this.lastFocused = document.activeElement as HTMLElement | null;
    this.searchOpen.set(true);
    this.setBodyScrollLock(true);
    window.setTimeout(() => this.searchInput()?.nativeElement.focus(), 60);
  }

  closeSearch(): void {
    this.searchOpen.set(false);
    this.query.set('');
    this.setBodyScrollLock(false);
    if (this.lastFocused) {
      this.lastFocused.focus();
      this.lastFocused = null;
    }
  }

  closeOnBackdrop(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    if (target.classList.contains('search')) {
      this.closeSearch();
    }
  }

  onSearchInput(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
  }

  /**
   * Envía la búsqueda a la experiencia pública real del catálogo (CU09).
   * No hay motor de búsqueda paralelo ni resultados sobre datos mock.
   */
  buscar(event?: Event): void {
    event?.preventDefault();
    const termino = this.query().trim();
    if (!termino) {
      return;
    }
    this.closeSearch();
    void this.router.navigate(['/catalogo'], {
      queryParams: { buscar: termino },
    });
  }

  private setBodyScrollLock(lock: boolean): void {
    // Seguro para SSR: document solo existe en el navegador.
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }
    document.body.style.overflow = lock ? 'hidden' : '';
  }
}
