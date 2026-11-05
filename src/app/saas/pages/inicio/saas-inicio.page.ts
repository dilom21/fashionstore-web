import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';

import { TenantEmpresa, TenantSuscripcion } from '../../models/tenant.models';
import { SaasEmpresaService } from '../../services/saas-empresa.service';
import { SaasErrorService } from '../../services/saas-error.service';
import { SaasPermissionsService } from '../../services/saas-permissions.service';
import { SaasSessionService } from '../../services/saas-session.service';
import { SAAS_NAV_GRUPOS, SaasNavItem } from '../../layout/saas-nav.config';

/** Indicador de una capacidad del plan. */
interface CapacidadPlan {
  etiqueta: string;
  incluida: boolean;
}

/**
 * Inicio del modo SaaS.
 *
 * Solo consume `GET /tenant/empresa/me` (empresa + suscripción). No inventa
 * métricas ni llama a endpoints que todavía no existen en el backend tenant.
 */
@Component({
  selector: 'app-saas-inicio-page',
  imports: [RouterLink],
  styleUrl: './saas-inicio.page.css',
  templateUrl: './saas-inicio.page.html',
})
export class SaasInicioPage {
  private readonly empresaService = inject(SaasEmpresaService);
  private readonly permisos = inject(SaasPermissionsService);
  private readonly errores = inject(SaasErrorService);
  private readonly destroyRef = inject(DestroyRef);

  private readonly sesion = inject(SaasSessionService);

  readonly empresa = signal<TenantEmpresa | null>(null);
  readonly cargando = signal(true);
  readonly mensajeError = signal<string | null>(null);

  readonly suscripcion = computed<TenantSuscripcion | null>(
    () => this.empresa()?.suscripcion ?? null,
  );

  /** Nombre de la empresa: la sesión ya lo trae; el endpoint lo confirma. */
  readonly nombreEmpresa = computed(
    () =>
      this.empresa()?.nombre_comercial ??
      this.sesion.sesion()?.empresa_nombre ??
      'Empresa',
  );

  readonly slugEmpresa = computed(
    () =>
      this.empresa()?.slug ??
      this.sesion.sesion()?.empresa_slug ??
      this.sesion.empresaSlug() ??
      '—',
  );

  readonly rol = computed(() => this.sesion.rol() ?? '—');

  /** Sucursales activas frente al límite contratado. */
  readonly sucursalesTexto = computed(() => {
    const suscripcion = this.suscripcion();
    if (suscripcion === null) {
      return null;
    }
    return `${suscripcion.sucursales_activas} de ${suscripcion.max_sucursales_activas}`;
  });

  readonly capacidades = computed<CapacidadPlan[]>(() => {
    const suscripcion = this.suscripcion();
    if (suscripcion === null) {
      return [];
    }
    return [
      { etiqueta: 'Productos', incluida: suscripcion.permite_productos },
      { etiqueta: 'Ventas', incluida: suscripcion.permite_ventas },
      { etiqueta: 'Reservas', incluida: suscripcion.permite_reservas },
      { etiqueta: 'Modo offline', incluida: suscripcion.permite_offline },
      {
        etiqueta: 'Reportes convencionales',
        incluida: suscripcion.permite_reportes_convencionales,
      },
      { etiqueta: 'Reportes con IA', incluida: suscripcion.permite_reportes_ia },
    ];
  });

  /** Accesos directos a las secciones ya disponibles para el rol. */
  readonly accesos = computed<SaasNavItem[]>(() =>
    SAAS_NAV_GRUPOS.flatMap((grupo) => grupo.items).filter(
      (item) =>
        item.disponible &&
        item.route !== undefined &&
        item.id !== 'inicio' &&
        (item.permiso === undefined ||
          this.permisos.puede(item.permiso.funcion, item.permiso.accion)),
    ),
  );

  constructor() {
    this.permisos.cargar().subscribe({
      error: () => {
        /* El filtrado por permisos se queda con lo que ya conoce. */
      },
    });

    this.empresaService
      .obtenerEmpresa()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (empresa) => {
          this.empresa.set(empresa);
          this.cargando.set(false);
        },
        error: (error: unknown) => {
          this.cargando.set(false);
          this.mensajeError.set(
            this.errores.mensajeDeError(error, 'empresa/me'),
          );
        },
      });
  }

  /** Formatea una fecha ISO del contrato; devuelve el texto original si falla. */
  formatearFecha(iso: string | null | undefined): string {
    if (!iso) {
      return '—';
    }
    const fecha = new Date(iso);
    if (Number.isNaN(fecha.getTime())) {
      return iso;
    }
    return new Intl.DateTimeFormat('es', { dateStyle: 'medium' }).format(fecha);
  }
}
