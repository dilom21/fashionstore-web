import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';

import { AuthService } from '../../../../autenticacion-seguridad/auth/services/auth.service';
import { AdminIcon } from '../../../components/admin-icon/admin-icon';
import { ADMIN_NAV_ITEMS, aplanarDestinos } from '../../../navigation/admin-nav.config';

/**
 * Inicio del panel administrativo - /admin/inicio.
 *
 * No inventa estadísticas: muestra una bienvenida y accesos directos a la
 * navegación existente (atajos). La tarjeta principal es CU03 (funcional);
 * el resto queda señalado como módulo en preparación.
 */
@Component({
  selector: 'app-admin-inicio-page',
  imports: [RouterLink, AdminIcon],
  styleUrl: './admin-inicio-page.css',
  templateUrl: './admin-inicio-page.html',
})
export class AdminInicioPage {
  private readonly authService = inject(AuthService);

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

  readonly nombre = computed(() => {
    const usuario = this.authService.usuarioActual();
    if (usuario === null) {
      return null;
    }
    if ('nombre' in usuario && usuario.nombre) {
      const apellido =
        'apellido' in usuario && usuario.apellido ? ` ${usuario.apellido}` : '';
      return `${usuario.nombre}${apellido}`;
    }
    if (this.authService.esAdministrador()) {
      return 'Administrador';
    }
    return usuario.correo;
  });
}
