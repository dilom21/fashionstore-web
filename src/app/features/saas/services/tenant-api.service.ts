import { isPlatformBrowser } from '@angular/common';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { inject, Injectable, PLATFORM_ID, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';

import { environment } from '../../../../environments/environment';

export type ContextoTenant = 'personal' | 'cliente';

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
  private readonly storageKey = 'fashionstore_saas_tenant_access_token';
  private readonly _identidad = signal<TenantIdentidad | null>(null);

  readonly identidad = this._identidad.asReadonly();

  private get storage(): Storage | null {
    if (!isPlatformBrowser(this.platform)) return null;
    return sessionStorage;
  }

  private token(): string | null {
    return this.storage?.getItem(this.storageKey) ?? null;
  }

  private headers(): HttpHeaders {
    const token = this.token();
    return token
      ? new HttpHeaders({ Authorization: \`Bearer \${token}\` })
      : new HttpHeaders();
  }

  login(datos: TenantLogin): Observable<TenantLoginRespuesta> {
    return this.http
      .post<TenantLoginRespuesta>(\`\${this.base}/auth/tenant/login\`, datos)
      .pipe(
        tap((response) => {
          this.storage?.setItem(this.storageKey, response.access_token);
          this._identidad.set(null);
        }),
      );
  }

  me(): Observable<TenantIdentidad> {
    return this.http
      .get<TenantIdentidad>(\`\${this.base}/auth/tenant/me\`, {
        headers: this.headers(),
      })
      .pipe(tap((identidad) => this._identidad.set(identidad)));
  }

  sucursales(): Observable<TenantSucursal[]> {
    return this.http.get<TenantSucursal[]>(
      \`\${this.base}/tenant/empresa/sucursales\`,
      { headers: this.headers() },
    );
  }

  miembros(): Observable<TenantMiembro[]> {
    return this.http.get<TenantMiembro[]>(
      \`\${this.base}/tenant/empresa/usuarios\`,
      { headers: this.headers() },
    );
  }

  roles(): Observable<TenantRol[]> {
    return this.http.get<TenantRol[]>(
      \`\${this.base}/tenant/empresa/roles\`,
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
      \`\${this.base}/tenant/empresa/sucursales\`,
      datos,
      { headers: this.headers() },
    );
  }

  cambiarEstadoSucursal(id: number, estado: boolean): Observable<TenantSucursal> {
    return this.http.patch<TenantSucursal>(
      \`\${this.base}/tenant/empresa/sucursales/\${id}/estado\`,
      { estado },
      { headers: this.headers() },
    );
  }

  cambiarRol(id: number, rol_id: number): Observable<TenantMiembro> {
    return this.http.patch<TenantMiembro>(
      \`\${this.base}/tenant/empresa/usuarios/\${id}/rol\`,
      { rol_id },
      { headers: this.headers() },
    );
  }

  cambiarEstadoMiembro(id: number, estado: boolean): Observable<TenantMiembro> {
    return this.http.patch<TenantMiembro>(
      \`\${this.base}/tenant/empresa/usuarios/\${id}/estado\`,
      { estado },
      { headers: this.headers() },
    );
  }

  cerrarSesion(): void {
    this.storage?.removeItem(this.storageKey);
    this._identidad.set(null);
  }
}
