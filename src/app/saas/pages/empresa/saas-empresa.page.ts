import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { AdminIcon } from '../../../features/administracion/components/admin-icon/admin-icon';
import { TenantEmpresa, TenantSuscripcion } from '../../models/tenant.models';
import { SaasEmpresaService } from '../../services/saas-empresa.service';
import { SaasErrorService } from '../../services/saas-error.service';

/** Capacidad del plan presentada como sí/no legible. */
interface CapacidadPlan {
  etiqueta: string;
  incluida: boolean;
}

/**
 * Mi empresa (`GET /tenant/empresa/me`).
 *
 * Muestra solo lo que el contrato devuelve: identidad de la empresa,
 * suscripción vigente y capacidades del plan. No hay acciones de escritura:
 * el cambio de plan lo ejecuta el superadministrador fuera de esta pantalla.
 *
 * `estado_suscripcion` se muestra tal cual lo entrega el backend porque no
 * existe un enum cerrado publicado para ese campo.
 */
@Component({
  selector: 'app-saas-empresa-page',
  imports: [AdminIcon],
  styleUrl: './saas-empresa.page.css',
  templateUrl: './saas-empresa.page.html',
})
export class SaasEmpresaPage {
  private readonly empresaService = inject(SaasEmpresaService);
  private readonly errores = inject(SaasErrorService);
  private readonly destroyRef = inject(DestroyRef);

  readonly empresa = signal<TenantEmpresa | null>(null);
  readonly cargando = signal(true);
  readonly mensajeError = signal<string | null>(null);

  readonly suscripcion = computed<TenantSuscripcion | null>(
    () => this.empresa()?.suscripcion ?? null,
  );

  /** Sucursales activas frente al máximo del plan. */
  readonly sucursalesActivas = computed(
    () => this.suscripcion()?.sucursales_activas ?? 0,
  );

  readonly sucursalesMaximo = computed(
    () => this.suscripcion()?.max_sucursales_activas ?? 0,
  );

  /** Porcentaje de uso acotado a 0..100 (el backend ya garantiza el límite). */
  readonly porcentajeSucursales = computed(() => {
    const maximo = this.sucursalesMaximoSeguro();
    if (maximo <= 0) {
      return 0;
    }
    const usado = (this.sucursalesActivas() / maximo) * 100;
    return Math.max(0, Math.min(100, Math.round(usado)));
  });

  /** Texto accesible de la barra: "2 de 3 sucursales activas". */
  readonly textoSucursales = computed(
    () =>
      `${this.sucursalesActivas()} de ${this.sucursalesMaximo()} sucursales activas permitidas por el plan`,
  );

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
      {
        etiqueta: 'Reportes con IA',
        incluida: suscripcion.permite_reportes_ia,
      },
    ];
  });

  constructor() {
    this.cargar();
  }

  /** Vuelve a consultar la empresa (reintento tras un error). */
  recargar(): void {
    if (this.cargando()) {
      return;
    }
    this.cargar();
  }

  /**
   * Formatea una fecha ISO del contrato; devuelve el texto original si el
   * valor no es una fecha válida (nunca inventa una fecha).
   */
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

  /** `true` cuando el estado de suscripción es exactamente ACTIVA. */
  esEstadoActivo(estado: string | null | undefined): boolean {
    return (estado ?? '').trim().toUpperCase() === 'ACTIVA';
  }

  private cargar(): void {
    this.cargando.set(true);
    this.mensajeError.set(null);

    this.empresaService
      .obtenerEmpresa()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (empresa) => {
          this.empresa.set(empresa);
          this.cargando.set(false);
        },
        error: (error: unknown) => {
          this.empresa.set(null);
          this.cargando.set(false);
          this.mensajeError.set(
            this.errores.mensajeDeError(error, 'empresa/me'),
          );
        },
      });
  }

  private sucursalesMaximoSeguro(): number {
    const maximo = this.sucursalesMaximo();
    return Number.isFinite(maximo) && maximo > 0 ? maximo : 0;
  }
}
