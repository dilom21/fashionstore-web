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
import { RouterLink } from '@angular/router';
import { Product } from '../../../../shared/models/product';
import { ThemeService } from '../../../../core/services/theme.service';
import {
  FEATURED_PRODUCTS,
  NEW_ARRIVALS,
  SEASON_OFFERS,
} from '../../data/products';

interface NavLink {
  label: string;
  href: string;
}

const NAV_LINKS: NavLink[] = [
  { label: 'Inicio', href: '#inicio' },
  { label: 'Categorías', href: '#categorias' },
  { label: 'Novedades', href: '#novedades' },
  { label: 'Ofertas', href: '#ofertas' },
  { label: 'Nosotros', href: '#inspiracion' },
];

/**
 * Barra de navegación principal: logo, enlaces, buscador modal,
 * cambio de tema claro/oscuro y accesos (usuario / carrito).
 */
@Component({
  selector: 'app-navbar',
  imports: [RouterLink],
  styleUrl: './navbar.css',
  templateUrl: './navbar.html',
})
export class Navbar implements OnDestroy {
  readonly themeService = inject(ThemeService);
  private readonly platformId = inject(PLATFORM_ID);

  readonly navLinks = NAV_LINKS;
  readonly menuOpen = signal(false);
  readonly searchOpen = signal(false);
  readonly query = signal('');
  readonly cartCount = signal(0);

  readonly searchInput = viewChild<ElementRef<HTMLInputElement>>('searchInput');

  private readonly allProducts: Product[] = [
    ...FEATURED_PRODUCTS,
    ...NEW_ARRIVALS,
    ...SEASON_OFFERS,
  ];

  readonly results = computed(() => {
    const term = this.query().trim().toLowerCase();
    if (!term) {
      return [];
    }
    return this.allProducts
      .filter(
        (p) =>
          p.name.toLowerCase().includes(term) ||
          p.category.toLowerCase().includes(term),
      )
      .slice(0, 8);
  });

  private keyHandler: ((event: KeyboardEvent) => void) | null = null;
  private lastFocused: HTMLElement | null = null;

  constructor() {
    // Listener global para cerrar el buscador con Escape (solo navegador).
    afterNextRender(() => {
      this.keyHandler = (event: KeyboardEvent) => {
        if (event.key === 'Escape' && this.searchOpen()) {
          this.closeSearch();
        }
      };
      document.addEventListener('keydown', this.keyHandler);
    });
  }

  ngOnDestroy(): void {
    if (this.keyHandler) {
      document.removeEventListener('keydown', this.keyHandler);
      this.keyHandler = null;
    }
    this.setBodyScrollLock(false);
  }

  toggleMenu(): void {
    this.menuOpen.update((open) => !open);
  }

  closeMenu(): void {
    this.menuOpen.set(false);
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

  selectProduct(): void {
    // Sin detalle de producto todavía: la búsqueda es demostrativa.
    this.closeSearch();
  }

  private setBodyScrollLock(lock: boolean): void {
    // Seguro para SSR: document solo existe en el navegador.
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }
    document.body.style.overflow = lock ? 'hidden' : '';
  }
}
