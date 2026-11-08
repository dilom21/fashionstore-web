import { computed, inject, Injectable } from '@angular/core';

import { AuthService } from '../../autenticacion-seguridad/auth/services/auth.service';
import { TenantApiService } from '../../saas/services/tenant-api.service';

/**
 * Sesión activa del PANEL administrativo, con independencia de su origen.
 *
 * El panel del primer parcial se diseñó sobre `AuthService` (sesión legacy).
 * Ahora el administrador de una empresa entra con la sesión EMPRESARIAL
 * (`TenantApiService` + GET /auth/tenant/me), por lo que el shell, la bienvenida
 * y el cierre de sesión necesitan una única vista de la identidad:
 *
 * - Si hay identidad empresarial confirmada, MANDA la identidad empresarial
 *   (nombre, correo, rol y empresa vienen de `GET /auth/tenant/me`).
 * - Si no la hay, se conserva exactamente el comportamiento legacy del primer
 *   parcial (CAJERO/ENCARGADO_SUCURSAL con su sesión de personal).
 *
 * No copia tokens entre sesiones ni concede permisos: solo expone lo que cada
 * servicio ya verificó con el backend.
 */
@Injectable({ providedIn: 'root' })
export class PanelSesionService {
  private readonly authService = inject(AuthService);
  private readonly tenantApi = inject(TenantApiService);

  /** true si el panel está abierto con la sesión empresarial (SaaS). */
  readonly esSesionEmpresarial = computed(() => this.tenantApi.identidad() !== null);

  /** Nombre de la empresa del contexto SaaS (`empresa_nombre`), o null. */
  readonly empresaNombre = computed(
    () => this.tenantApi.identidad()?.empresa_nombre ?? null,
  );

  /** Etiqueta de marca/empresa a mostrar en el panel. */
  readonly empresaEtiqueta = computed(
    () => this.empresaNombre() ?? 'FashionStore',
  );

  /** Nombre del personal autenticado (`nombre apellido`). */
  readonly nombre = computed(() => {
    if (this.esSesionEmpresarial()) {
      return (
        this.tenantApi.nombreCompleto() ??
        this.tenantApi.identidad()?.correo ??
        null
      );
    }

    const usuario = this.authService.usuarioActual();
    if (usuario === null) {
      return null;
    }
    if ('nombre' in usuario && usuario.nombre) {
      const apellido =
        'apellido' in usuario && usuario.apellido ? ` ${usuario.apellido}` : '';
      return `${usuario.nombre}${apellido}`;
    }
    return usuario.correo;
  });

  readonly correo = computed(() =>
    this.esSesionEmpresarial()
      ? (this.tenantApi.identidad()?.correo ?? null)
      : (this.authService.usuarioActual()?.correo ?? null),
  );

  readonly rol = computed(() =>
    this.esSesionEmpresarial()
      ? this.tenantApi.rol()
      : (this.authService.usuarioActual()?.rol?.trim().toUpperCase() ?? null),
  );

  readonly esAdministrador = computed(() =>
    this.esSesionEmpresarial()
      ? this.tenantApi.esAdministrador()
      : this.authService.esAdministrador(),
  );

  readonly esEncargadoSucursal = computed(() =>
    this.esSesionEmpresarial()
      ? this.tenantApi.esEncargadoSucursal()
      : this.authService.esEncargadoSucursal(),
  );

  readonly esCajero = computed(() =>
    this.esSesionEmpresarial()
      ? this.tenantApi.esCajero()
      : this.authService.esCajero(),
  );

  /**
   * Sucursal asignada al personal, cuando el backend la informa.
   *
   * Con sesión empresarial proviene del perfil de `GET /auth/tenant/me`
   * (`sucursal_id`); con sesión legacy, de la sesión del primer parcial. Es un
   * dato INFORMATIVO: el alcance real lo impone el backend (RLS/403), por lo que
   * las pantallas no lo usan para decidir a qué sucursales se puede consultar.
   */
  readonly sucursalId = computed(() =>
    this.esSesionEmpresarial()
      ? (this.tenantApi.identidad()?.sucursal_id ?? null)
      : this.authService.sucursalId(),
  );

  /** Etiqueta de la sesión mostrada en la barra lateral. */
  readonly etiquetaUsuario = computed(
    () =>
      this.nombre() ??
      (this.esAdministrador() ? 'Administrador' : null) ??
      this.correo() ??
      'Personal',
  );

  /**
   * Cierra la sesión del panel limpiando AMBAS sesiones (empresarial y legacy)
   * para que ningún token sobreviva al salir del área administrativa.
   */
  cerrarSesion(): void {
    this.tenantApi.cerrarSesion();
    this.authService.cerrarSesion();
  }
}
