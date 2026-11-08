import { isPlatformBrowser } from '@angular/common';
import {
  HttpClient,
  HttpErrorResponse,
  HttpHeaders,
  HttpStatusCode,
} from '@angular/common/http';
import {
  computed,
  inject,
  Injectable,
  PLATFORM_ID,
  signal,
} from '@angular/core';
import { Observable, catchError, of, tap, throwError } from 'rxjs';

import { environment } from '../../../../environments/environment';
import { marcarSesionEmpresarial } from '../../../core/sesion/sesion-panel';
import {
  ROL_ADMINISTRADOR,
  ROL_CAJERO,
  ROL_ENCARGADO_SUCURSAL,
} from '../../autenticacion-seguridad/auth/services/auth.service';

export type ContextoTenant = 'personal' | 'cliente';

/**
 * Clave de sessionStorage del JWT EMPRESARIAL (SaaS).
 *
 * Es deliberadamente distinta de la clave legacy (`vanter_access_token`):
 * un token de cliente/personal legacy nunca puede leerse como sesión tenant
 * ni al revés.
 */
export const TENANT_TOKEN_STORAGE_KEY =
  'fashionstore_saas_tenant_access_token';

export interface TenantLogin {
  correo: string;
  password: string;
  empresa_slug: string;
  contexto: ContextoTenant;
}

export interface TenantLoginRespuesta {
  access_token: string;
  token_type: string;
  empresa_id: number;
  empresa_slug: string;
  empresa_nombre: string;
  rol: string;
  contexto: ContextoTenant;
}

export interface TenantIdentidad {
  usuario_id: number;
  empresa_id: number;
  empresa_slug: string;
  empresa_nombre: string;
  rol: string;
  contexto: ContextoTenant;
  plan_codigo: string;
  permite_reportes_ia: boolean;
  /**
   * Perfil del empleado. El backend (`GET /auth/tenant/me`) solo lo envía
   * cuando `contexto === 'personal'`; por eso los campos son opcionales: el
   * frontend no asume datos que el servidor podría omitir.
   */
  correo?: string | null;
  empleado_id?: number | null;
  nombre?: string | null;
  apellido?: string | null;
  sucursal_id?: number | null;
}

export interface TenantSucursal {
  id: number;
  ciudad_id: number;
  nombre: string;
  direccion: string;
  telefono: string | null;
  estado: boolean;
}

export interface TenantMiembro {
  usuario_id: number;
  correo: string;
  usuario_activo: boolean;
  membresia_activa: boolean;
  rol_id: number;
  rol: string;
  empleado_id: number | null;
  sucursal_id: number | null;
  nombres: string | null;
  apellidos: string | null;
  empleado_activo: boolean | null;
}

export interface TenantRol {
  id: number;
  nombre: string;
  estado: boolean;
}

/**
 * Autenticación CU03 y consultas CU04/CU05 contra FastAPI REAL.
 *
 * La sesión tenant es independiente de la sesión legacy de clientes/personal.
 * Ningún tenant ID se envía como autorización. El backend obtiene empresa
 * y usuario del JWT y comprueba membresía/plan antes de cada operación.
 * No almacena la clave global del superadministrador.
 */
@Injectable({ providedIn: 'root' })
export class TenantApiService {
  private readonly http = inject(HttpClient);
  private readonly platform = inject(PLATFORM_ID);
  private readonly base = environment.apiUrl.replace(/\/+$/, '');
  private readonly storageKey = TENANT_TOKEN_STORAGE_KEY;
  private readonly _identidad = signal<TenantIdentidad | null>(null);

  readonly identidad = this._identidad.asReadonly();

  /** true si ya se consultó la identidad empresarial en esta pestaña. */
  readonly autenticado = computed(() => this._identidad() !== null);

  /** Contexto empresarial autenticado (`personal` | `cliente`), o null. */
  readonly contexto = computed<ContextoTenant | null>(
    () => this._identidad()?.contexto ?? null,
  );

  /** Rol empresarial normalizado que devolvió el backend, o null. */
  readonly rol = computed(
    () => this._identidad()?.rol?.trim().toUpperCase() ?? null,
  );

  readonly esAdministrador = computed(() => this.rol() === ROL_ADMINISTRADOR);

  readonly esEncargadoSucursal = computed(
    () => this.rol() === ROL_ENCARGADO_SUCURSAL,
  );

  readonly esCajero = computed(() => this.rol() === ROL_CAJERO);

  /** Nombre del empleado (`nombre apellido`) según el perfil empresarial. */
  readonly nombreCompleto = computed(() => {
    const identidad = this._identidad();
    const nombre = identidad?.nombre?.trim() ?? '';
    const apellido = identidad?.apellido?.trim() ?? '';
    const completo = `${nombre} ${apellido}`.trim();
    return completo.length > 0 ? completo : null;
  });

  private get storage(): Storage | null {
    if (!isPlatformBrowser(this.platform)) return null;
    return sessionStorage;
  }

  private token(): string | null {
    return this.storage?.getItem(this.storageKey) ?? null;
  }

  /** true si existe un JWT empresarial persistido en la pestaña. */
  tieneToken(): boolean {
    return this.token() !== null;
  }

  private headers(): HttpHeaders {
    const token = this.token();
    return token
      ? new HttpHeaders({ Authorization: `Bearer ${token}` })
      : new HttpHeaders();
  }

  login(datos: TenantLogin): Observable<TenantLoginRespuesta> {
    return this.http
      .post<TenantLoginRespuesta>(`${this.base}/auth/tenant/login`, datos)
      .pipe(
        tap((response) => {
          this.storage?.setItem(this.storageKey, response.access_token);
          // El JWT por sí solo no autentica: la identidad se confirma con /me.
          this.actualizarIdentidad(null);
        }),
      );
  }

  me(): Observable<TenantIdentidad> {
    return this.http
      .get<TenantIdentidad>(`${this.base}/auth/tenant/me`, {
        headers: this.headers(),
      })
      .pipe(tap((identidad) => this.actualizarIdentidad(identidad)));
  }

  /**
   * Restaura la sesión empresarial tras recargar la aplicación.
   *
   * - Sin JWT empresarial: identidad = null y ninguna petición.
   * - Con JWT: consulta GET /auth/tenant/me.
   * - 401/403 (token expirado o membresía revocada): limpia token e identidad.
   * - Otros errores (red/5xx) se propagan: el token se conserva para poder
   *   reintentar, pero NO se declara una sesión autenticada.
   */
  restaurarSesion(): Observable<TenantIdentidad | null> {
    const identidad = this._identidad();
    if (identidad !== null) {
      return of(identidad);
    }
    if (this.token() === null) {
      this.actualizarIdentidad(null);
      return of(null);
    }
    return this.me().pipe(
      catchError((error: HttpErrorResponse) => {
        if (
          error.status === HttpStatusCode.Unauthorized ||
          error.status === HttpStatusCode.Forbidden
        ) {
          this.cerrarSesion();
          return of(null);
        }
        this.actualizarIdentidad(null);
        return throwError(() => error);
      }),
    );
  }

  sucursales(): Observable<TenantSucursal[]> {
    return this.http.get<TenantSucursal[]>(
      `${this.base}/tenant/empresa/sucursales`,
      { headers: this.headers() },
    );
  }

  miembros(): Observable<TenantMiembro[]> {
    return this.http.get<TenantMiembro[]>(
      `${this.base}/tenant/empresa/usuarios`,
      { headers: this.headers() },
    );
  }

  roles(): Observable<TenantRol[]> {
    return this.http.get<TenantRol[]>(
      `${this.base}/tenant/empresa/roles`,
      { headers: this.headers() },
    );
  }

  crearSucursal(datos: {
    ciudad_id: number;
    nombre: string;
    direccion: string;
    telefono: string | null;
  }): Observable<TenantSucursal> {
    return this.http.post<TenantSucursal>(
      `${this.base}/tenant/empresa/sucursales`,
      datos,
      { headers: this.headers() },
    );
  }

  cambiarEstadoSucursal(id: number, estado: boolean): Observable<TenantSucursal> {
    return this.http.patch<TenantSucursal>(
      `${this.base}/tenant/empresa/sucursales/${id}/estado`,
      { estado },
      { headers: this.headers() },
    );
  }

  cambiarRol(id: number, rol_id: number): Observable<TenantMiembro> {
    return this.http.patch<TenantMiembro>(
      `${this.base}/tenant/empresa/usuarios/${id}/rol`,
      { rol_id },
      { headers: this.headers() },
    );
  }

  cambiarEstadoMiembro(id: number, estado: boolean): Observable<TenantMiembro> {
    return this.http.patch<TenantMiembro>(
      `${this.base}/tenant/empresa/usuarios/${id}/estado`,
      { estado },
      { headers: this.headers() },
    );
  }

  cerrarSesion(): void {
    this.storage?.removeItem(this.storageKey);
    this.actualizarIdentidad(null);
  }

  /**
   * Único punto donde cambia la identidad empresarial en memoria.
   *
   * Además del signal (consumido por guards y pantallas SaaS) mantiene el
   * indicador del módulo `core/sesion/sesion-panel`, que permite a las
   * pantallas del panel del primer parcial interpretar correctamente un 401
   * (endpoint legacy todavía no adaptado) sin tratarlo como sesión expirada.
   */
  private actualizarIdentidad(identidad: TenantIdentidad | null): void {
    this._identidad.set(identidad);
    marcarSesionEmpresarial(identidad !== null && identidad.contexto === 'personal');
  }
}
