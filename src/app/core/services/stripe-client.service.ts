import { isPlatformBrowser } from '@angular/common';
import {
  InjectionToken,
  Injectable,
  PLATFORM_ID,
  inject,
} from '@angular/core';
import { Stripe, loadStripe } from '@stripe/stripe-js';

import { environment } from '../../../environments/environment';

/**
 * Publishable key de Stripe como token inyectable.
 *
 * Por defecto lee `environment.stripePublishableKey`. Exponerlo como token
 * permite sustituirlo en tests (sin depender de la configuración real) y
 * mantiene el servicio desacoplado del entorno.
 */
export const STRIPE_PUBLISHABLE_KEY = new InjectionToken<string>(
  'STRIPE_PUBLISHABLE_KEY',
  {
    providedIn: 'root',
    factory: () => environment.stripePublishableKey,
  },
);

/**
 * Abstracción de Stripe.js (CU22).
 *
 * Responsabilidades:
 * - cargar Stripe.js de forma perezosa (lazy);
 * - hacerlo SOLO en navegador (nunca durante SSR);
 * - reutilizar una única instancia/promesa (singleton);
 * - validar la publishable key antes de cargar;
 * - facilitar mocks en tests.
 *
 * Nunca se llama `loadStripe()` desde los componentes: todos pasan por aquí.
 */
@Injectable({ providedIn: 'root' })
export class StripeClientService {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly publishableKey = inject(STRIPE_PUBLISHABLE_KEY);

  /** Promesa única de Stripe.js (null hasta el primer uso). */
  private stripePromise: Promise<Stripe> | null = null;

  /** true si hay una publishable key configurada (no vacía). */
  get claveConfigurada(): boolean {
    return this.publishableKey.trim().length > 0;
  }

  /**
   * Devuelve la instancia de Stripe.js.
   *
   * - Fuera del navegador (SSR): rechaza sin tocar el DOM.
   * - Sin publishable key: rechaza con un error de configuración.
   * - En navegador con key: carga una sola vez y reutiliza la promesa.
   */
  cargarStripe(): Promise<Stripe> {
    if (!isPlatformBrowser(this.platformId)) {
      return Promise.reject(
        new Error('Stripe.js solo está disponible en el navegador.'),
      );
    }

    const clave = this.publishableKey.trim();
    if (clave.length === 0) {
      return Promise.reject(
        new Error('Stripe no está configurado: falta la publishable key.'),
      );
    }

    if (this.stripePromise === null) {
      this.stripePromise = loadStripe(clave)
        .then((stripe) => {
          if (stripe === null) {
            throw new Error('No se pudo inicializar Stripe.js.');
          }
          return stripe;
        })
        .catch((error: unknown) => {
          // Permite reintentar si la carga falló (p. ej. red).
          this.stripePromise = null;
          throw error;
        });
    }

    return this.stripePromise;
  }
}
