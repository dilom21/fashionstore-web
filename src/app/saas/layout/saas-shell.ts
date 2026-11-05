import {
  Component,
  computed,
  afterNextRender,
  inject,
  signal,
} from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

import { environment } from '../../../environments/environment';
import { AdminIcon } from '../../features/administracion/components/admin-icon/admin-icon';
import { SaasOfflinePanel } from '../offline/saas-offline-panel';
import { SaasOfflineQueueService } from '../offline/offline-queue.service';
import { SAAS_RUTA_LOGIN } from '../saas.config';
import { SaasPermissionsService } from '../services/saas-permissions.service';
import { SaasSessionService } from '../services/saas-session.service';
import {
  SAAS_NAV_GRUPOS,
  SaasNavItem,
  filtrarNavSaas,
} from './saas-nav.config';

/**
 * Shell del modo SaaS (multiempresa).
 *
 * Layout de escritorio: barra lateral fija (colapsable) + cabecera con la
 * empresa, el plan y el rol, y `<router-outlet>` para las páginas.
 * En móvil la barra lateral se convierte en panel deslizante con scrim.
 *
 * La navegación se filtra por la matriz de permisos de la empresa. Ocultar un
 * item es solo UX: cada ruta tiene su guard y el backend es la autoridad final.
 */
@Component({
  selector: 'app-saas-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, AdminIcon, SaasOfflinePanel],
  styleUrl: './saas-shell.css',
  templateUrl: './saas-shell.html',
})
export class SaasShell {
  private readonly sesion = inject(SaasSessionService);
  private readonly permisos = inject(SaasPermissionsService);
  private readonly offline = inject(SaasOfflineQueueService);
  private readonly router = inject(Router);

  /** Nombre del entorno compilado (diagnóstico visible: saas-local / legacy). */
  readonly entorno = environment.saasNombreEntorno;

  readonly empresaNombre = computed(
    () => this.sesion.sesion()?.empresa_nombre ?? 'Empresa',
  );
  readonly empresaSlug = computed(
    () =>
      this.sesion.sesion()?.empresa_slug ?? this.sesion.empresaSlug() ?? '—',
  );
  readonly planCodigo = computed(() => this.sesion.planCodigo() ?? '—');
  readonly rol = computed(() => this.sesion.rol() ?? '—');
  readonly contexto = computed(() => this.sesion.contexto() ?? '—');

  /** `true` cuando la última petición autenticada recibió 401. */
  readonly expirada = this.sesion.expirada;

  /** `true` cuando la matriz de permisos ya está disponible. */
  readonly matrizCargada = this.permisos.cargado;

  /** Navegación visible para el rol actual. */
  readonly grupos = computed(() =>
    filtrarNavSaas(
      SAAS_NAV_GRUPOS,
      (item) =>
        item.permiso === undefined
          ? true
          : this.permisos.puede(item.permiso.funcion, item.permiso.accion),
      this.sesion.contexto(),
    ),
  );

  /** Sidebar colapsada (solo iconos) en escritorio. */
  readonly colapsada = signal(false);
  /** Drawer abierto en móvil. */
  readonly movilAbierta = signal(false);

  constructor() {
    afterNextRender(() => {
      // Tablet: arranca colapsada para no robar ancho al contenido.
      if (window.matchMedia('(max-width: 1199px)').matches) {
        this.colapsada.set(true);
      }
      // La cabecera necesita la matriz para saber qué mostrar en el menú.
      this.permisos.cargar().subscribe({
        error: () => {
          /* Sin matriz: el menú se reduce a los items sin permiso declarado. */
        },
      });
    });
  }

  alternarColapso(): void {
    this.colapsada.update((valor) => !valor);
  }

  abrirMovil(): void {
    this.movilAbierta.set(true);
    this.colapsada.set(false);
  }

  cerrarMovil(): void {
    this.movilAbierta.set(false);
  }

  /** Cierra la sesión de empresa y vuelve al login SaaS. */
  cerrarSesion(): void {
    const pendientes = this.offline.totalPendientes();
    if (
      pendientes > 0 &&
      typeof window !== 'undefined' &&
      !window.confirm(
        `Hay ${pendientes} operación(es) sin sincronizar. Cerrar sesión borra la cola local de este dispositivo. ¿Continuar?`,
      )
    ) {
      return;
    }
    this.sesion.cerrarSesion();
    this.permisos.limpiar();
    void this.router.navigateByUrl(SAAS_RUTA_LOGIN);
  }

  /** Descripción accesible de un item deshabilitado. */
  descripcionItem(item: SaasNavItem): string {
    if (item.disponible) {
      return item.descripcion ?? item.label;
    }
    return `${item.label}: no disponible en esta versión.`;
  }

  /**
   * `true` cuando la sección tiene escritura pero el rol solo puede consultar.
   *
   * Solo se avisa con la matriz ya cargada: antes de tener datos no se afirma
   * nada sobre permisos.
   */
  esSoloLectura(item: SaasNavItem): boolean {
    if (item.permisoEdicion === undefined || !this.matrizCargada()) {
      return false;
    }
    return !this.permisos.puede(
      item.permisoEdicion.funcion,
      item.permisoEdicion.accion,
    );
  }
}
