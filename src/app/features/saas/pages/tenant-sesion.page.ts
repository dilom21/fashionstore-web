import { Component, computed, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';

import { TenantApiService } from '../services/tenant-api.service';
import { SaasBrand } from '../components/saas-brand/saas-brand';

/**
 * Pantalla neutral de sesión empresarial autenticada.
 *
 * Ruta: /saas/sesion (protegida por `personalSaasAuthGuard`).
 *
 * Permite que ENCARGADO_SUCURSAL y CAJERO se autentiquen con el mecanismo SaaS
 * aunque sus módulos operativos todavía no estén adaptados: confirma la
 * identidad real devuelta por GET /auth/tenant/me y permite cerrar sesión.
 * No abre pantallas legacy ni inventa permisos.
 */
@Component({
  selector: 'app-saas-tenant-sesion',
  standalone: true,
  imports: [RouterLink, SaasBrand],
  templateUrl: './tenant-sesion.page.html',
  styleUrl: './saas-pages.css',
  styles: [
    `a.saas-primary { display: inline-block; padding: .6rem .9rem; border-radius: 9px; text-decoration: none; }`,
  ],
})
export class TenantSesionPage {
  readonly api = inject(TenantApiService);
  private readonly router = inject(Router);

  readonly esAdministrador = computed(() => this.api.esAdministrador());
  readonly sucursalId = computed(
    () => this.api.identidad()?.sucursal_id ?? null,
  );
  readonly empleadoId = computed(
    () => this.api.identidad()?.empleado_id ?? null,
  );

  /** Mensaje por rol: qué está disponible y qué sigue pendiente. */
  readonly aviso = computed(() => {
    if (this.api.esAdministrador()) {
      return 'Puedes gestionar sucursales, personal y roles de tu empresa en el panel empresarial.';
    }
    if (this.api.esEncargadoSucursal()) {
      return 'Tu acceso como encargado de sucursal está verificado. Los módulos operativos de la tienda todavía no están adaptados al modo empresarial.';
    }
    return 'Tu acceso como cajero está verificado. Los módulos operativos de la tienda todavía no están adaptados al modo empresarial.';
  });

  salir(): void {
    this.api.cerrarSesion();
    void this.router.navigateByUrl('/auth/personal/login');
  }
}
