import {
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  NavigationEnd,
  Router,
  RouterLink,
  RouterLinkActive,
} from '@angular/router';
import { filter } from 'rxjs';

import { AdminIcon } from '../admin-icon/admin-icon';
import { AdminNavItem } from '../../models/admin-nav-item';

/**
 * Barra lateral (sidebar) del panel administrativo.
 *
 * Componente presentacional y reutilizable:
 * - Recibe la navegación (AdminNavItem[]) y la sesión por inputs.
 * - Emite eventos de UI (colapsar, cerrar en móvil, cerrar sesión) hacia el
 *   shell, que es quien posee el estado de layout.
 * - Prepara el filtrado por permisos (CU04): basta con entregar a `items`
 *   el resultado de `filtrarItemsNav(...)`.
 */
@Component({
  selector: 'app-admin-sidebar',
  imports: [RouterLink, RouterLinkActive, AdminIcon],
  styleUrl: './admin-sidebar.css',
  templateUrl: './admin-sidebar.html',
})
export class AdminSidebar {
  readonly items = input<AdminNavItem[]>([]);
  readonly colapsada = input(false);
  readonly abiertaMovil = input(false);

  readonly nombre = input<string | null>(null);
  readonly rol = input<string | null>(null);
  readonly correo = input<string | null>(null);

  readonly toggleColapso = output<void>();
  readonly cerrarMovil = output<void>();
  readonly solicitarLogout = output<void>();

  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  /** Grupos (módulos expandibles) abiertos, por id. */
  readonly expandidos = signal<ReadonlySet<string>>(new Set());

  /** Iniciales para el avatar de sesión. */
  readonly iniciales = computed(() => {
    const fuente = (this.nombre() ?? this.correo() ?? 'A').trim();
    const partes = fuente.split(/\s+/).filter(Boolean);
    if (partes.length === 0) {
      return 'A';
    }
    const primera = partes[0]?.charAt(0) ?? 'A';
    const segunda = partes.length > 1 ? (partes[1]?.charAt(0) ?? '') : '';
    return `${primera}${segunda}`.toUpperCase();
  });

  constructor() {
    // Mantiene abierto el grupo cuyo hijo coincide con la ruta activa.
    this.router.events
      .pipe(
        filter((evento): evento is NavigationEnd => evento instanceof NavigationEnd),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(() => this.sincronizarGrupos());

    // Re-sincroniza al recibir items (p. ej. navegación filtrada por rol).
    effect(() => {
      this.items();
      this.sincronizarGrupos();
    });
  }

  /** Opciones raíz visibles (no deshabilitadas). */
  itemsVisibles(): AdminNavItem[] {
    return this.items().filter((item) => item.enabled !== false);
  }

  /** Hijos visibles de un grupo. */
  hijosVisibles(item: AdminNavItem): AdminNavItem[] {
    return (item.children ?? []).filter((hijo) => hijo.enabled !== false);
  }

  grupoExpandido(item: AdminNavItem): boolean {
    return this.expandidos().has(item.id);
  }

  grupoActivo(item: AdminNavItem): boolean {
    return (item.children ?? []).some(
      (hijo) => hijo.route !== undefined && this.perteneceRuta(hijo.route),
    );
  }

  /**
   * Expande/colapsa un grupo. Si la sidebar está colapsada (solo iconos),
   * primero la expande para que los hijos sean visibles.
   */
  alternarGrupo(item: AdminNavItem): void {
    if (this.colapsada()) {
      this.toggleColapso.emit();
    }
    this.expandidos.update((actual) => {
      const siguiente = new Set(actual);
      if (siguiente.has(item.id)) {
        siguiente.delete(item.id);
      } else {
        siguiente.add(item.id);
      }
      return siguiente;
    });
  }

  /** Al navegar se cierra el drawer en móvil. */
  alSeleccionar(): void {
    this.cerrarMovil.emit();
  }

  /** true si la URL actual está dentro del árbol de `ruta`. */
  private perteneceRuta(ruta: string): boolean {
    const url = this.router.url.split('?')[0];
    const segmentosUrl = url.split('/').filter(Boolean);
    const segmentosRuta = ruta.split('/').filter(Boolean);

    if (segmentosRuta.length === 0 || segmentosUrl.length < segmentosRuta.length) {
      return false;
    }
    return segmentosRuta.every(
      (segmento, indice) => segmento === segmentosUrl[indice],
    );
  }

  private sincronizarGrupos(): void {
    untracked(() => {
      const abiertos = new Set(this.expandidos());
      for (const item of this.itemsVisibles()) {
        if ((item.children?.length ?? 0) > 0 && this.grupoActivo(item)) {
          abiertos.add(item.id);
        }
      }
      this.expandidos.set(abiertos);
    });
  }
}
