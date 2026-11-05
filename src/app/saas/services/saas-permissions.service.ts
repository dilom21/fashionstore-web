import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, finalize, of, shareReplay, tap } from 'rxjs';

import { environment } from '../../../environments/environment';
import {
  TENANT_ROL_ADMINISTRADOR,
  MatrizPermisos,
  PermisoAsignado,
} from '../models/tenant.models';
import { SaasSessionService } from './saas-session.service';

/**
 * Matriz de permisos de la empresa (`GET /tenant/empresa/permisos`).
 *
 * La UI solo OCULTA lo que el backend niega: la autorización real siempre la
 * aplica el backend (403). Por eso `puede()` es permisivo cuando no tiene
 * información:
 *
 * - Rol ADMINISTRADOR → `true`, salvo que la matriz diga explícitamente `false`.
 * - Sin matriz cargada → `true` solo para ADMINISTRADOR (aún no hay datos).
 * - Función/acción ausente en la matriz → `true` (no hay base para ocultar).
 */
@Injectable({ providedIn: 'root' })
export class SaasPermissionsService {
  private readonly http = inject(HttpClient);
  private readonly sesion = inject(SaasSessionService);

  /** URL base de la API normalizada (sin barra final). */
  private readonly apiUrl = environment.apiUrl.replace(/\/+$/, '');

  private readonly _matriz = signal<MatrizPermisos | null>(null);
  private cargaEnCurso: Observable<MatrizPermisos> | null = null;

  /** Matriz vigente (o `null` mientras no se carga). */
  readonly matriz = this._matriz.asReadonly();

  /** `true` cuando la matriz ya está disponible. */
  readonly cargado = computed(() => this._matriz() !== null);

  /** Roles con permisos declarados en la matriz. */
  readonly roles = computed(() => this._matriz()?.roles ?? []);

  /**
   * Carga la matriz una sola vez (peticiones concurrentes comparten resultado).
   */
  cargar(): Observable<MatrizPermisos> {
    const matrizActual = this._matriz();
    if (matrizActual !== null) {
      return of(matrizActual);
    }
    if (this.cargaEnCurso !== null) {
      return this.cargaEnCurso;
    }
    this.cargaEnCurso = this.http
      .get<MatrizPermisos>(`${this.apiUrl}/tenant/empresa/permisos`)
      .pipe(
        tap((matriz) => this._matriz.set(matriz)),
        finalize(() => {
          this.cargaEnCurso = null;
        }),
        shareReplay({ bufferSize: 1, refCount: false }),
      );
    return this.cargaEnCurso;
  }

  /**
   * `true` si el rol actual puede ejecutar `accion` sobre `funcion`.
   *
   * Es una ayuda de UX (menú, badges, guard), no una autorización.
   */
  puede(funcion: string, accion: string): boolean {
    const matriz = this._matriz();
    const rol = this.sesion.rol();
    const esAdministrador = normalizarRol(rol) === TENANT_ROL_ADMINISTRADOR;

    // Sin datos: no se oculta nada al administrador.
    if (matriz === null) {
      return esAdministrador;
    }

    const fila = this.buscarRol(matriz, rol);
    if (fila === null) {
      // El backend no declara permisos para este rol: no hay base para ocultar.
      return true;
    }

    const permiso = fila.permisos?.find(
      (item) => item.funcion === funcion && item.accion === accion,
    );

    // Permiso no declarado: se deja visible (el backend seguirá autorizando).
    if (permiso === undefined) {
      return true;
    }

    return permiso.permitido;
  }

  /** Permisos de un rol concreto (para pantallas de administración de roles). */
  permisosDeRol(rol: string | null): PermisoAsignado[] {
    const matriz = this._matriz();
    if (matriz === null) {
      return [];
    }
    return this.buscarRol(matriz, rol)?.permisos ?? [];
  }

  /** Descarta la matriz en memoria (cambio de empresa o cierre de sesión). */
  limpiar(): void {
    this._matriz.set(null);
    this.cargaEnCurso = null;
  }

  private buscarRol(
    matriz: MatrizPermisos,
    rol: string | null,
  ): { rol_id: number; rol: string; permisos: PermisoAsignado[] } | null {
    const objetivo = normalizarRol(rol);
    if (objetivo.length === 0) {
      return null;
    }
    return (
      matriz.roles?.find((fila) => normalizarRol(fila.rol) === objetivo) ?? null
    );
  }
}

/** Normaliza un nombre de rol para compararlo (mayúsculas, sin espacios). */
function normalizarRol(rol: string | null | undefined): string {
  return (rol ?? '').trim().toUpperCase();
}
