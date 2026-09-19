import { isPlatformBrowser } from '@angular/common';
import { inject, Injectable, PLATFORM_ID, signal } from '@angular/core';

/** Tono visual de un aviso. */
export type ToastTipo = 'ok' | 'error' | 'info';

/** Aviso efímero mostrado por `<app-toast-host />`. */
export interface Toast {
  id: number;
  mensaje: string;
  tipo: ToastTipo;
}

/** Duración por defecto antes de ocultar un aviso. */
const DURACION_MS = 3600;

/**
 * Avisos efímeros (toast) reutilizables en las pantallas públicas.
 *
 * El estado vive aquí (signal) y el componente presentacional
 * `<app-toast-host />` (montado en el navbar) los pinta. Así varias pantallas
 * comparten el mismo mecanismo sin duplicar markup.
 */
@Injectable({ providedIn: 'root' })
export class ToastService {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly _toasts = signal<Toast[]>([]);
  private contador = 0;

  readonly toasts = this._toasts.asReadonly();

  mostrar(mensaje: string, tipo: ToastTipo = 'ok'): void {
    const id = ++this.contador;
    this._toasts.update((actuales) => [...actuales, { id, mensaje, tipo }]);

    if (!isPlatformBrowser(this.platformId)) {
      return;
    }
    window.setTimeout(() => this.cerrar(id), DURACION_MS);
  }

  cerrar(id: number): void {
    this._toasts.update((actuales) => actuales.filter((toast) => toast.id !== id));
  }
}
