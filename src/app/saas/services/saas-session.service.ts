import { isPlatformBrowser } from '@angular/common';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import {
  PLATFORM_ID,
  Injectable,
  computed,
  inject,
  signal,
} from '@angular/core';
import {
  Observable,
  catchError,
  finalize,
  map,
  of,
  tap,
  throwError,
} from 'rxjs';

import { environment } from '../../../environments/environment';
import { SAAS_STORAGE_KEYS } from '../saas.config';
import { TenantLoginResponse, TenantMe } from '../models/tenant.models';
import { SaasOfflineDbService } from '../offline/offline-db.service';

/**
 * Sesión del modo SaaS (multiempresa).
 *
 * Responsabilidades:
 * - Única dueña del `sessionStorage` de la empresa (token, slug y correo).
 * - Mantiene en signals la identidad vigente (`TenantMe`) y sus derivados.
 * - Expone `expirada` para que el interceptor marque un 401 y el shell reaccione.
 *
 * Nunca comparte claves con el modo legacy y toda lectura/escritura de
 * `sessionStorage` está protegida con `isPlatformBrowser` para no romper SSR.
 */
@Injectable({ providedIn: 'root' })
export class SaasSessionService {
  private readonly http = inject(HttpClient);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly offlineDb = inject(SaasOfflineDbService);

  /** URL base de la API normalizada (sin barra final). */
  private readonly apiUrl = environment.apiUrl.replace(/\/+$/, '');

  private readonly _sesion = signal<TenantMe | null>(null);
  private readonly _empresaSlug = signal<string | null>(
    this.leerStorage(SAAS_STORAGE_KEYS.empresaSlug),
  );
  private readonly _expirada = signal(false);

  /** Identidad de la membresía vigente; `null` mientras no se hidrata. */
  readonly sesion = this._sesion.asReadonly();

  /** Slug de la empresa de la sesión actual. */
  readonly empresaSlug = this._empresaSlug.asReadonly();

  /** `true` cuando existe una identidad de empresa cargada en memoria. */
  readonly autenticado = computed(() => this._sesion() !== null);

  /** Rol de la membresía (nombre tal como lo devuelve el backend). */
  readonly rol = computed(() => this._sesion()?.rol ?? null);

  /** Contexto de la sesión (`personal` | `cliente`). */
  readonly contexto = computed(() => this._sesion()?.contexto ?? null);

  /** Código del plan vigente de la empresa. */
  readonly planCodigo = computed(() => this._sesion()?.plan_codigo ?? null);

  /**
   * `true` cuando el interceptor detectó un 401: la UI debe avisar y ofrecer
   * volver al login en lugar de seguir mostrando datos de la empresa.
   */
  readonly expirada = this._expirada.asReadonly();

  /** Evita disparar varias peticiones de hidratación en paralelo. */
  private hidratacionEnCurso: Observable<boolean> | null = null;

  /**
   * Guarda la sesión recién emitida por `POST /auth/tenant/login`.
   *
   * Solo persiste el JWT, el slug y el correo (nunca la contraseña). La
   * identidad completa (`TenantMe`) se obtiene después con `hidratar()`.
   */
  guardarSesion(respuesta: TenantLoginResponse, correo: string): void {
    this.escribirStorage(SAAS_STORAGE_KEYS.token, respuesta.access_token);
    this.escribirStorage(SAAS_STORAGE_KEYS.empresaSlug, respuesta.empresa_slug);
    this.escribirStorage(SAAS_STORAGE_KEYS.correo, correo);

    this._empresaSlug.set(respuesta.empresa_slug ?? null);
    this._expirada.set(false);
    // La sesión previa (si había otra empresa) deja de ser válida.
    this._sesion.set(null);
  }

  /**
   * Completa la sesión consultando `GET /auth/tenant/me`.
   *
   * - Sin token: limpia y devuelve `false` sin llamar al backend.
   * - Con identidad ya cargada: devuelve `true` sin petición.
   * - 401/403: cierra la sesión local y (en 401) marca `expirada`.
   * - Otros errores (red, 5xx) se propagan para que el guard decida.
   */
  hidratar(): Observable<boolean> {
    const token = this.token();
    if (token === null) {
      this.limpiarEstado();
      return of(false);
    }

    if (this._sesion() !== null) {
      return of(true);
    }

    if (this.hidratacionEnCurso !== null) {
      return this.hidratacionEnCurso;
    }

    this.hidratacionEnCurso = this.http
      .get<TenantMe>(`${this.apiUrl}/auth/tenant/me`)
      .pipe(
        tap((identidad) => {
          this._sesion.set(identidad);
          this._empresaSlug.set(identidad.empresa_slug ?? null);
          this.escribirStorage(
            SAAS_STORAGE_KEYS.empresaSlug,
            identidad.empresa_slug,
          );
          this._expirada.set(false);
        }),
        map(() => true),
        catchError((error: unknown) => {
          if (
            error instanceof HttpErrorResponse &&
            (error.status === 401 || error.status === 403)
          ) {
            if (error.status === 401) {
              this.marcarExpirada();
            }
            this.cerrarSesion();
            return of(false);
          }
          return throwError(() => error);
        }),
        finalize(() => {
          this.hidratacionEnCurso = null;
        }),
      );

    return this.hidratacionEnCurso;
  }

  /**
   * Cierra la sesión local: elimina las claves SaaS, limpia los signals y
   * borra los datos offline (cola y caché) para no dejar información de la
   * empresa anterior en el navegador.
   */
  cerrarSesion(): void {
    this.eliminarStorage(SAAS_STORAGE_KEYS.token);
    this.eliminarStorage(SAAS_STORAGE_KEYS.empresaSlug);
    this.eliminarStorage(SAAS_STORAGE_KEYS.correo);
    this._empresaSlug.set(null);
    this._sesion.set(null);
    void this.offlineDb.limpiarTodo();
  }

  /** Marca que el backend rechazó el token (401) para que el shell reaccione. */
  marcarExpirada(): void {
    this._expirada.set(true);
  }

  /** Limpia el aviso de sesión expirada (p. ej. al volver al login). */
  limpiarExpirada(): void {
    this._expirada.set(false);
  }

  /** JWT tenant guardado, o `null` si no existe o no hay navegador. */
  token(): string | null {
    return this.leerStorage(SAAS_STORAGE_KEYS.token);
  }

  /** `true` si hay un JWT tenant utilizable. */
  hayToken(): boolean {
    const token = this.token();
    return token !== null && token.trim().length > 0;
  }

  /** Correo recordado del último login SaaS (para precargar el formulario). */
  correoRecordado(): string | null {
    return this.leerStorage(SAAS_STORAGE_KEYS.correo);
  }

  /** Slug recordado del último login SaaS (para precargar el formulario). */
  empresaSlugRecordado(): string | null {
    return this.leerStorage(SAAS_STORAGE_KEYS.empresaSlug);
  }

  /** Limpia solo el estado en memoria (sin tocar el almacenamiento). */
  private limpiarEstado(): void {
    this._sesion.set(null);
    this._empresaSlug.set(null);
  }

  private leerStorage(clave: string): string | null {
    if (!isPlatformBrowser(this.platformId)) {
      return null;
    }
    try {
      return sessionStorage.getItem(clave);
    } catch {
      return null;
    }
  }

  private escribirStorage(clave: string, valor: string): void {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }
    try {
      sessionStorage.setItem(clave, valor);
    } catch {
      // Almacenamiento no disponible: la sesión queda solo en memoria.
    }
  }

  private eliminarStorage(clave: string): void {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }
    try {
      sessionStorage.removeItem(clave);
    } catch {
      // Almacenamiento no disponible: nada que limpiar.
    }
  }
}
