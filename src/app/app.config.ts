import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import {
  ApplicationConfig,
  isDevMode,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideClientHydration } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { provideServiceWorker } from '@angular/service-worker';

import { routes } from './app.routes';
import { authInterceptor } from './core/interceptors/auth.interceptor';
import { saasInterceptor } from './saas/interceptors/saas.interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideClientHydration(),
    // El interceptor legacy va primero y se convierte en no-op en modo SaaS
    // puro; en la superficie unificada (`saas-unified`) sigo adjuntando el JWT
    // legacy solo a las rutas legacy. El de SaaS actúa en `saas-local` y
    // `saas-unified`.
    provideHttpClient(withFetch(), withInterceptors([authInterceptor, saasInterceptor])),
    // PWA: el service worker solo se registra en builds de producción y nunca
    // guarda mutaciones ni respuestas autenticadas (ver `ngsw-config.json`).
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000',
    })
  ]
};
