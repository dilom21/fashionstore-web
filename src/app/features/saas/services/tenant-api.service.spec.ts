import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { environment } from '../../../../environments/environment';
import {
  TENANT_TOKEN_STORAGE_KEY,
  TenantApiService,
  TenantIdentidad,
} from './tenant-api.service';

const API = environment.apiUrl.replace(/\/+$/, '');

/** Clave legacy de AuthService: el SaaS nunca debe escribirla. */
const CLAVE_LEGACY = 'vanter_access_token';

function identidad(
  overrides: Partial<TenantIdentidad> = {},
): TenantIdentidad {
  return {
    usuario_id: 12,
    empresa_id: 3,
    empresa_slug: 'vanter-men',
    empresa_nombre: 'Vanter Men',
    rol: 'CAJERO',
    contexto: 'personal',
    plan_codigo: 'PRO',
    permite_reportes_ia: false,
    correo: 'cajero@vanter.test',
    empleado_id: 7,
    nombre: 'Harold',
    apellido: 'Amador',
    sucursal_id: 2,
    ...overrides,
  };
}

const RESPUESTA_LOGIN = {
  access_token: 'tenant-jwt',
  token_type: 'bearer',
  empresa_id: 3,
  empresa_slug: 'vanter-men',
  empresa_nombre: 'Vanter Men',
  rol: 'CAJERO',
  contexto: 'personal' as const,
};

describe('TenantApiService (CU03 SaaS del personal)', () => {
  let service: TenantApiService;
  let http: HttpTestingController;

  beforeEach(() => {
    sessionStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(TenantApiService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    sessionStorage.clear();
  });

  function login(): void {
    service
      .login({
        empresa_slug: 'vanter-men',
        correo: 'cajero@vanter.test',
        password: 'Segura123!',
        contexto: 'personal',
      })
      .subscribe();
  }

  it('login usa POST /auth/tenant/login con el contrato del backend', () => {
    login();

    const peticion = http.expectOne(`${API}/auth/tenant/login`);
    expect(peticion.request.method).toBe('POST');
    expect(peticion.request.body).toEqual({
      empresa_slug: 'vanter-men',
      correo: 'cajero@vanter.test',
      password: 'Segura123!',
      contexto: 'personal',
    });

    peticion.flush(RESPUESTA_LOGIN);
  });

  it('guarda el JWT empresarial en su clave propia y nunca en la legacy', () => {
    login();
    http.expectOne(`${API}/auth/tenant/login`).flush(RESPUESTA_LOGIN);

    expect(sessionStorage.getItem(TENANT_TOKEN_STORAGE_KEY)).toBe('tenant-jwt');
    expect(sessionStorage.getItem(CLAVE_LEGACY)).toBeNull();
    expect(service.tieneToken()).toBe(true);
  });

  it('me() consulta GET /auth/tenant/me con el JWT empresarial y expone el perfil del empleado', () => {
    sessionStorage.setItem(TENANT_TOKEN_STORAGE_KEY, 'tenant-jwt');

    let resultado: TenantIdentidad | undefined;
    service.me().subscribe((valor) => (resultado = valor));

    const peticion = http.expectOne(`${API}/auth/tenant/me`);
    expect(peticion.request.method).toBe('GET');
    expect(peticion.request.headers.get('Authorization')).toBe(
      'Bearer tenant-jwt',
    );
    peticion.flush(identidad());

    expect(resultado?.nombre).toBe('Harold');
    expect(resultado?.apellido).toBe('Amador');
    expect(resultado?.rol).toBe('CAJERO');
    expect(resultado?.sucursal_id).toBe(2);
    expect(service.identidad()?.empleado_id).toBe(7);
    expect(service.esCajero()).toBe(true);
    expect(service.esAdministrador()).toBe(false);
    expect(service.contexto()).toBe('personal');
    expect(service.nombreCompleto()).toBe('Harold Amador');
  });

  it('restaurarSesion sin JWT empresarial no hace peticiones ni declara sesión', () => {
    let resultado: TenantIdentidad | null | undefined;
    service.restaurarSesion().subscribe((valor) => (resultado = valor));

    http.expectNone(`${API}/auth/tenant/me`);
    expect(resultado).toBeNull();
    expect(service.autenticado()).toBe(false);
  });

  it('restaurarSesion con 401 limpia el JWT: un token inválido no mantiene sesión', () => {
    sessionStorage.setItem(TENANT_TOKEN_STORAGE_KEY, 'jwt-invalido');

    let resultado: TenantIdentidad | null | undefined;
    service.restaurarSesion().subscribe((valor) => (resultado = valor));

    http
      .expectOne(`${API}/auth/tenant/me`)
      .flush({ detail: 'Token expirado' }, { status: 401, statusText: 'Unauthorized' });

    expect(resultado).toBeNull();
    expect(sessionStorage.getItem(TENANT_TOKEN_STORAGE_KEY)).toBeNull();
    expect(service.identidad()).toBeNull();
    expect(service.autenticado()).toBe(false);
  });

  it('restaurarSesion con 403 (membresía revocada) limpia el JWT', () => {
    sessionStorage.setItem(TENANT_TOKEN_STORAGE_KEY, 'tenant-jwt');

    let resultado: TenantIdentidad | null | undefined;
    service.restaurarSesion().subscribe((valor) => (resultado = valor));

    http
      .expectOne(`${API}/auth/tenant/me`)
      .flush({ detail: 'Membresía revocada' }, { status: 403, statusText: 'Forbidden' });

    expect(resultado).toBeNull();
    expect(sessionStorage.getItem(TENANT_TOKEN_STORAGE_KEY)).toBeNull();
    expect(service.tieneToken()).toBe(false);
  });

  it('restaurarSesion con 500 conserva el JWT pero no declara sesión', () => {
    sessionStorage.setItem(TENANT_TOKEN_STORAGE_KEY, 'tenant-jwt');

    let fallo = false;
    service.restaurarSesion().subscribe({ error: () => (fallo = true) });

    http
      .expectOne(`${API}/auth/tenant/me`)
      .flush({ detail: 'Servicio no disponible' }, { status: 500, statusText: 'Server Error' });

    expect(fallo).toBe(true);
    expect(sessionStorage.getItem(TENANT_TOKEN_STORAGE_KEY)).toBe('tenant-jwt');
    expect(service.identidad()).toBeNull();
    expect(service.autenticado()).toBe(false);
  });

  it('restaurarSesion reutiliza la identidad ya cargada sin repetir la petición', () => {
    sessionStorage.setItem(TENANT_TOKEN_STORAGE_KEY, 'tenant-jwt');
    service.me().subscribe();
    http.expectOne(`${API}/auth/tenant/me`).flush(identidad());

    service.restaurarSesion().subscribe();
    http.expectNone(`${API}/auth/tenant/me`);
    expect(service.identidad()?.nombre).toBe('Harold');
  });

  it('cerrarSesion elimina el JWT y la identidad empresarial', () => {
    sessionStorage.setItem(TENANT_TOKEN_STORAGE_KEY, 'tenant-jwt');
    service.me().subscribe();
    http.expectOne(`${API}/auth/tenant/me`).flush(identidad());
    expect(service.identidad()).not.toBeNull();

    service.cerrarSesion();

    expect(sessionStorage.getItem(TENANT_TOKEN_STORAGE_KEY)).toBeNull();
    expect(service.identidad()).toBeNull();
    expect(service.tieneToken()).toBe(false);
    expect(service.autenticado()).toBe(false);
  });
});
