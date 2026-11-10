import { InjectionToken } from '@angular/core';

import { environment } from '../../../environments/environment';

/**
 * Modo de compilación de la aplicación (SaaS multitenant vs. legacy).
 *
 * Se expone como token inyectable para que los servicios y guards reciban el
 * valor desde `environment.saasMode` en producción, pero las pruebas puedan
 * sustituirlo con `{ provide: SAAS_MODE, useValue: true }` sin recurrir a
 * reemplazos de módulos.
 */
export const SAAS_MODE = new InjectionToken<boolean>('SAAS_MODE', {
  providedIn: 'root',
  factory: () => environment.saasMode,
});
