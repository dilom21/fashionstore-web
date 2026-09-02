import { isPlatformBrowser } from '@angular/common';
import {
  PLATFORM_ID,
  afterNextRender,
  inject,
  Injectable,
  signal,
} from '@angular/core';

export type ThemeMode = 'dark' | 'light';

const THEME_STORAGE_KEY = 'vanter-theme';
const THEME_ANIM_CLASS = 'vm-theme-anim';

/**
 * Gestiona el tema claro/oscuro de la aplicación.
 *
 * Seguro para SSR: cualquier acceso a APIs del navegador
 * (localStorage, document, window) ocurre dentro de `afterNextRender`,
 * que únicamente se ejecuta en el cliente.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly platformId = inject(PLATFORM_ID);

  /** Tema activo. Oscuro por defecto. */
  readonly theme = signal<ThemeMode>('dark');

  constructor() {
    if (isPlatformBrowser(this.platformId)) {
      afterNextRender(() => {
        this.theme.set(this.readStoredTheme());
        this.applyToDocument(this.theme(), false);
      });
    }
  }

  toggle(): void {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }
    const next: ThemeMode = this.theme() === 'dark' ? 'light' : 'dark';
    this.theme.set(next);
    this.applyToDocument(next, true);
    this.writeStoredTheme(next);
  }

  private readStoredTheme(): ThemeMode {
    try {
      return localStorage.getItem(THEME_STORAGE_KEY) === 'light'
        ? 'light'
        : 'dark';
    } catch {
      return 'dark';
    }
  }

  private writeStoredTheme(theme: ThemeMode): void {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      /* Almacenamiento no disponible: se ignora. */
    }
  }

  private applyToDocument(theme: ThemeMode, animate: boolean): void {
    const root = document.documentElement;
    root.setAttribute('data-theme', theme);
    if (animate) {
      root.classList.add(THEME_ANIM_CLASS);
      window.setTimeout(() => root.classList.remove(THEME_ANIM_CLASS), 540);
    }
  }
}
