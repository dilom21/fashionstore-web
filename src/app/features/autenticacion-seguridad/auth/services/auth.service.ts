import { isPlatformBrowser } from '@angular/common';
import {
  HttpClient,
  HttpErrorResponse,
  HttpStatusCode,
} from '@angular/common/http';
import {
  PLATFORM_ID,
  computed,
  inject,
  Injectable,
  signal,
} from '@angular/core';
import { catchError, map, Observable, of, tap, throwError } from 'rxjs';

import { environment } from '../../../../../environments/environment';
import {
  AuthContext,
  ClienteAuth,
  ClienteLoginResponse,
  LoginRequest,
  PersonalAuth,
  PersonalLoginResponse,
  UsuarioAuth,
} from '../models/auth.models';

/** Clave usada en sessionStorage para guardar únicamente el JWT. */
export const AUTH_TOKEN_STORAGE_KEY = 'vanter_access_token';

/** Nombre exacto del rol administrativo (backend: app.core.dependencies). */
export const ROL_ADMINISTRADOR = 'ADMINISTRADOR';

/** Nombre exacto del rol de encargado de sucursal (backend: app.core.dependencies). */
export const ROL_ENCARGADO_SUCURSAL = 'ENCARGADO_SUCURSAL';

/** Usuario que puede estar autenticado en memoria. */
type UsuarioSesion = UsuarioAuth | ClienteAuth | PersonalAuth;

/**
 * Servicio de autenticación contra el backend FastAPI.
 *
 * - Solo almacena el JWT (sessionStorage), nunca credenciales ni datos sensibles.
 * - Toda llamada a sessionStorage está protegida con isPlatformBrowser para
 *   no romper el SSR.
 * - AuthService no conoce Router: la navegación la deciden las páginas.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly platformId = inject(PLATFORM_ID);

  /** URL base de la API normalizada (sin barra final). */
  private readonly apiUrl = environment.apiUrl.replace(/\/+$/, '');

  /** Estado mínimo del usuario autenticado en memoria. */
  private readonly _usuarioActual = signal<UsuarioSesion | null>(null);

  readonly usuarioActual = this._usuarioActual.asReadonly();

  readonly autenticado = computed(() => this._usuarioActual() !== null);

  readonly contexto = computed<AuthContext | null>(
    () => this._usuarioActual()?.contexto ?? null,
  );

  /** true si el usuario autenticado tiene rol ADMINISTRADOR. */
  readonly esAdministrador = computed(
    () =>
      this._usuarioActual()?.rol?.trim().toUpperCase() === ROL_ADMINISTRADOR,
  );

  /** true si el usuario autenticado tiene rol ENCARGADO_SUCURSAL. */
  readonly esEncargadoSucursal = computed(
    () =>
      this._usuarioActual()?.rol?.trim().toUpperCase() ===
      ROL_ENCARGADO_SUCURSAL,
  );

  /**
   * true si el usuario puede consultar inventario por sucursal (CU13):
   * ADMINISTRADOR o ENCARGADO_SUCURSAL. La autorización real la aplica el
   * backend (401/403) y, para el encargado, limita el alcance a su sucursal.
   */
  readonly puedeConsultarInventario = computed(
    () => this.esAdministrador() || this.esEncargadoSucursal(),
  );

  /**
   * sucursal_id del personal si está disponible en la sesión.
   *
   * Solo llega en la respuesta del login (PersonalAuth): GET /auth/me no lo
   * incluye, por lo que tras un refresco puede ser null. El backend limita por
   * sí mismo el alcance del encargado, así que este dato es solo informativo.
   */
  readonly sucursalId = computed<number | null>(() => {
    const usuario = this._usuarioActual();
    return usuario !== null && 'sucursal_id' in usuario
      ? usuario.sucursal_id
      : null;
  });

  /**
   * Inicia sesión como cliente.
   *
   * En éxito guarda el JWT y actualiza el usuario actual. En error deja pasar
   * el HttpErrorResponse para que la interfaz decida qué mostrar.
   */
  loginCliente(datos: LoginRequest): Observable<ClienteLoginResponse> {
    return this.http
      .post<ClienteLoginResponse>(`${this.apiUrl}/auth/clientes/login`, datos)
      .pipe(
        tap((respuesta) => {
          this.guardarToken(respuesta.access_token);
          this._usuarioActual.set(respuesta.usuario);
        }),
      );
  }

  /**
   * Inicia sesión como personal.
   *
   * En éxito guarda el JWT y actualiza el usuario actual. En error deja pasar
   * el HttpErrorResponse para que la interfaz decida qué mostrar.
   */
  loginPersonal(datos: LoginRequest): Observable<PersonalLoginResponse> {
    return this.http
      .post<PersonalLoginResponse>(`${this.apiUrl}/auth/personal/login`, datos)
      .pipe(
        tap((respuesta) => {
          this.guardarToken(respuesta.access_token);
          this._usuarioActual.set(respuesta.usuario);
        }),
      );
  }

  /**
   * Obtiene la identidad/sesión básica del backend (GET /auth/me).
   *
   * No actualiza el estado interno: quien la consuma (p. ej. restaurarSesion)
   * decide cómo reflejarla.
   */
  obtenerUsuarioActual(): Observable<UsuarioAuth> {
    return this.http.get<UsuarioAuth>(`${this.apiUrl}/auth/me`);
  }

  /**
   * Restaura la sesión al recargar la aplicación.
   *
   * 1. Si no hay JWT en sessionStorage: usuarioActual = null, sin petición.
   * 2. Si hay JWT: consulta GET /auth/me.
   * 3. Con respuesta correcta actualiza usuarioActual.
   * 4. Con 401 elimina el token y limpia el estado.
   */
  restaurarSesion(): Observable<boolean> {
    const token = this.obtenerToken();
    if (token === null) {
      this._usuarioActual.set(null);
      return of(false);
    }

    return this.obtenerUsuarioActual().pipe(
      map((usuario) => {
        this._usuarioActual.set(usuario);
        return true;
      }),
      catchError((error: HttpErrorResponse) => {
        if (error.status === HttpStatusCode.Unauthorized) {
          this.cerrarSesion();
          return of(false);
        }
        // Errores de red o del servidor no se esconden: se propagan.
        return throwError(() => error);
      }),
    );
  }

  /** Cierra la sesión local: elimina el JWT y limpia el estado de usuario. */
  cerrarSesion(): void {
    this.eliminarToken();
    this._usuarioActual.set(null);
  }

  /** Guarda el JWT en sessionStorage (solo en navegador). */
  guardarToken(token: string): void {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }
    try {
      sessionStorage.setItem(AUTH_TOKEN_STORAGE_KEY, token);
    } catch {
      // Almacenamiento no disponible: la sesión queda solo en memoria.
    }
  }

  /** Devuelve el JWT guardado, o null si no existe / no hay navegador. */
  obtenerToken(): string | null {
    if (!isPlatformBrowser(this.platformId)) {
      return null;
    }
    try {
      return sessionStorage.getItem(AUTH_TOKEN_STORAGE_KEY);
    } catch {
      return null;
    }
  }

  /** Elimina el JWT de sessionStorage (solo en navegador). */
  eliminarToken(): void {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }
    try {
      sessionStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
    } catch {
      // Almacenamiento no disponible: nada que limpiar.
    }
  }
}
