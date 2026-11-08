import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';

import { AdminIcon } from '../../../components/admin-icon/admin-icon';
import { AdminNavItem } from '../../../models/admin-nav-item';
import { ADMIN_NAV_ITEMS, aplanarDestinos } from '../../../navigation/admin-nav.config';
import { PanelSesionService } from '../../../services/panel-sesion.service';

/**
 * Inicio del panel administrativo - /admin/inicio.
 *
 * Es la página inicial del ADMINISTRADOR de la empresa: se conserva el diseño,
 * la bienvenida y los accesos del primer parcial. La identidad (nombre y
 * empresa) proviene de `PanelSesionService`, que prioriza la sesión empresarial
 * confirmada con GET /auth/tenant/me.
 *
 * No inventa estadísticas: muestra una bienvenida y accesos directos a la
 * navegación existente (atajos). La tarjeta principal es CU03 (funcional en el
 * sistema del primer parcial); el resto queda señalado según su estado real.
 */
@Component({
  selector: 'app-admin-inicio-page',
  imports: [RouterLink, AdminIcon],
  styleUrl: './admin-inicio-page.css',
  templateUrl: './admin-inicio-page.html',
})
export class AdminInicioPage {
  private readonly sesion = inject(PanelSesionService);

  /** Todos los destinos con ruta declarados en la navegación. */
  readonly destinos = aplanarDestinos(ADMIN_NAV_ITEMS);

  /** Destino principal ya funcional: CU03 - Gestionar Usuarios. */
  readonly principal = this.destinos.find(
    (destino) => destino.id === 'usuarios',
  );

  /** Resto de destinos (en preparación). */
  readonly secundarios = computed(() =>
    this.destinos.filter(
      (destino) => destino.id !== 'usuarios' && destino.id !== 'inicio',
    ),
  );

  /** Nombre del personal autenticado (sesión empresarial o legacy). */
  readonly nombre = computed(() => this.sesion.nombre());

  /** `empresa_nombre` del contexto SaaS, o null en sesión legacy. */
  readonly empresa = computed(() => this.sesion.empresaNombre());

  /** true si el panel se abrió con la sesión empresarial (SaaS). */
  readonly esSesionEmpresarial = computed(() => this.sesion.esSesionEmpresarial());

  /**
   * Etiqueta de disponibilidad honesta.
   *
   * Con sesión empresarial solo CU4-CU5 está conectado a la API SaaS; los demás
   * módulos conservan su interfaz pero siguen dependiendo de endpoints del
   * sistema anterior, así que NO se presentan como disponibles.
   */
  estadoDestino(destino: AdminNavItem): string {
    if (destino.estado !== 'funcional') {
      return 'Próximamente';
    }
    return this.pendienteAdaptacion(destino) ? 'Pendiente de adaptación' : 'Disponible';
  }

  /** true si el destino todavía no está adaptado al modo empresarial. */
  private pendienteAdaptacion(destino: AdminNavItem): boolean {
    return this.esSesionEmpresarial() && destino.route !== '/saas/empresa';
  }
}
