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
import { AuthService } from '../../../../features/autenticacion-seguridad/auth/services/auth.service';

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
  imports: [RouterLink],
  styleUrl: './navbar.css',
  templateUrl: './navbar.html',
})
export class Navbar implements OnDestroy {
  readonly themeService = inject(ThemeService);
  readonly authService = inject(AuthService);
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
   * Texto de la zona de cuenta cuando hay sesión iniciada.
   * Tras un login reciente se dispone del nombre (ClienteAuth) -> "Hola, Juan".
   * Tras restaurar con /auth/me solo hay UsuarioAuth -> "Mi cuenta".
   */
  readonly cuentaTexto = computed(() => {
    const usuario = this.authService.usuarioActual();
    if (usuario === null) {
      return 'Mi cuenta';
    }
    if (
      usuario.contexto === 'cliente' &&
      'nombre' in usuario &&
      usuario.nombre
    ) {
      return `Hola, ${usuario.nombre}`;
    }
    return 'Mi cuenta';
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

  /** Cierra la sesión local y vuelve al inicio. */
  cerrarSesion(): void {
    this.accountOpen.set(false);
    this.authService.cerrarSesion();
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
