import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { SaasSessionService } from '../services/saas-session.service';

/** Keeps customer routes separate from the staff navigation context. */
export const saasClienteGuard: CanActivateFn = () => {
  const session = inject(SaasSessionService);
  return session.contexto() === 'cliente'
    ? true
    : inject(Router).parseUrl('/saas/inicio');
};
