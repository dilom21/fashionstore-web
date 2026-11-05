import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';

import { SaasSessionService } from '../../services/saas-session.service';

/**
 * Pantalla mostrada cuando el rol no puede usar una sección.
 *
 * La decide el guard de permisos; el backend seguiría devolviendo 403 si se
 * intentara la operación por otra vía.
 */
@Component({
  selector: 'app-saas-sin-permiso-page',
  imports: [RouterLink],
  styleUrl: './saas-sin-permiso.page.css',
  templateUrl: './saas-sin-permiso.page.html',
})
export class SaasSinPermisoPage {
  private readonly sesion = inject(SaasSessionService);

  readonly rol = computed(() => this.sesion.rol() ?? 'sin rol asignado');
  readonly empresa = computed(
    () => this.sesion.sesion()?.empresa_nombre ?? 'tu empresa',
  );
}
