import { isPlatformBrowser } from '@angular/common';
import { Injectable, OnDestroy, PLATFORM_ID, inject, signal } from '@angular/core';

/**
 * Estado de conectividad del navegador.
 *
 * Es una señal derivada de `navigator.onLine` y de los eventos `online` /
 * `offline`. No hace peticiones de red: solo refleja lo que el navegador
 * informa, y por eso la sincronización siempre confirma contra el servidor.
 */
@Injectable({ providedIn: 'root' })
export class SaasConnectivityService implements OnDestroy {
  private readonly platformId = inject(PLATFORM_ID);

  private readonly _enLinea = signal(leerEstadoInicial(this.platformId));
  private iniciado = false;

  /** `true` cuando el navegador declara conectividad. */
  readonly enLinea = this._enLinea.asReadonly();

  constructor() {
    this.iniciar();
  }

  /** Registra los listeners una sola vez (idempotente). */
  iniciar(): void {
    if (this.iniciado || !isPlatformBrowser(this.platformId)) {
      return;
    }
    this.iniciado = true;
    window.addEventListener('online', this.alRecuperar);
    window.addEventListener('offline', this.alPerder);
  }

  private readonly alRecuperar = (): void => {
    this._enLinea.set(true);
  };

  private readonly alPerder = (): void => {
    this._enLinea.set(false);
  };

  ngOnDestroy(): void {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }
    window.removeEventListener('online', this.alRecuperar);
    window.removeEventListener('offline', this.alPerder);
  }
}

function leerEstadoInicial(platformId: object): boolean {
  if (!isPlatformBrowser(platformId)) {
    return false;
  }
  return navigator.onLine !== false;
}
