import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { environment } from '../../../environments/environment';
import { TenantLoginResponse, TenantMe } from '../models/tenant.models';
import { SAAS_STORAGE_KEYS } from '../saas.config';
import { SaasSessionService } from './saas-session.service';

const API = environment.apiUrl.replace(/\/+$/, '');
const URL_ME = `${API}/auth/tenant/me`;

/** Clave del modo legacy: no debe compartirse ni borrarse nunca. */
const CLAVE_LEGACY = 'vanter_access_token';

const LOGIN: TenantLoginResponse = {
  access_token: 'jwt-tenant-123',
  token_type: 'bearer',
  empresa_id: 7,
  empresa_slug: 'demo-empresa',
  empresa_nombre: 'Demo Empresa',
  rol: 'ADMINISTRADOR',
  contexto: 'personal',
};

const ME: TenantMe = {
  usuario_id: 42,
  empresa_id: 7,
  empresa_slug: 'demo-empresa',
  empresa_nombre: 'Demo Empresa',
  rol: 'ADMINISTRADOR',
  contexto: 'personal',
  plan_codigo: 'PRO',
  permite_reportes_ia: true,
};

describe('SaasSessionService', () => {
  let sesion: SaasSessionService;
  let http: HttpTestingController;

  beforeEach(() => {
    sessionStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    sesion = TestBed.inject(SaasSessionService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    sessionStorage.clear();
  });

  it('sin token no está autenticado y no llama al backend', () => {
    let resultado: boolean | undefined;
    sesion.hidratar().subscribe((valor) => (resultado = valor));

    expect(resultado).toBe(false);
    expect(sesion.autenticado()).toBe(false);
    expect(sesion.hayToken()).toBe(false);
  });

  it('guarda token, slug y correo en claves exclusivas del modo SaaS', () => {
    sesion.guardarSesion(LOGIN, 'admin@demo.com');

    expect(sessionStorage.getItem(SAAS_STORAGE_KEYS.token)).toBe(
      'jwt-tenant-123',
    );
    expect(sessionStorage.getItem(SAAS_STORAGE_KEYS.empresaSlug)).toBe(
      'demo-empresa',
    );
    expect(sessionStorage.getItem(SAAS_STORAGE_KEYS.correo)).toBe(
      'admin@demo.com',
    );
    expect(sesion.token()).toBe('jwt-tenant-123');
    expect(sesion.hayToken()).toBe(true);
    expect(sesion.empresaSlug()).toBe('demo-empresa');
  });

  it('no toca las claves del modo legacy', () => {
    sessionStorage.setItem(CLAVE_LEGACY, 'jwt-legacy');

    sesion.guardarSesion(LOGIN, 'admin@demo.com');
    sesion.cerrarSesion();

    expect(sessionStorage.getItem(CLAVE_LEGACY)).toBe('jwt-legacy');
    expect(sessionStorage.getItem(SAAS_STORAGE_KEYS.token)).toBeNull();
  });

  it('hidrata la identidad con GET /auth/tenant/me', () => {
    sesion.guardarSesion(LOGIN, 'admin@demo.com');

    let resultado: boolean | undefined;
    sesion.hidratar().subscribe((valor) => (resultado = valor));

    const peticion = http.expectOne(URL_ME);
    expect(peticion.request.method).toBe('GET');
    peticion.flush(ME);

    expect(resultado).toBe(true);
    expect(sesion.autenticado()).toBe(true);
    expect(sesion.sesion()).toEqual(ME);
    expect(sesion.rol()).toBe('ADMINISTRADOR');
    expect(sesion.contexto()).toBe('personal');
    expect(sesion.planCodigo()).toBe('PRO');
  });

  it('reutiliza la sesión ya cargada sin repetir la petición', () => {
    sesion.guardarSesion(LOGIN, 'admin@demo.com');
    sesion.hidratar().subscribe();
    http.expectOne(URL_ME).flush(ME);

    let resultado: boolean | undefined;
    sesion.hidratar().subscribe((valor) => (resultado = valor));

    expect(resultado).toBe(true);
    http.expectNone(URL_ME);
  });

  it('un 401 limpia la sesión y marca expirada', () => {
    sesion.guardarSesion(LOGIN, 'admin@demo.com');

    let resultado: boolean | undefined;
    sesion.hidratar().subscribe((valor) => (resultado = valor));

    http
      .expectOne(URL_ME)
      .flush(
        { detail: 'Credenciales invalidas' },
        { status: 401, statusText: 'Unauthorized' },
      );

    expect(resultado).toBe(false);
    expect(sesion.autenticado()).toBe(false);
    expect(sesion.token()).toBeNull();
    expect(sesion.expirada()).toBe(true);
  });

  it('cerrarSesion elimina las claves SaaS y limpia los signals', () => {
    sesion.guardarSesion(LOGIN, 'admin@demo.com');
    sesion.hidratar().subscribe();
    http.expectOne(URL_ME).flush(ME);

    sesion.cerrarSesion();

    expect(sesion.token()).toBeNull();
    expect(sesion.empresaSlug()).toBeNull();
    expect(sesion.sesion()).toBeNull();
    expect(sesion.autenticado()).toBe(false);
    expect(sessionStorage.getItem(SAAS_STORAGE_KEYS.correo)).toBeNull();
  });

  it('recuerda slug y correo para precargar el login', () => {
    sesion.guardarSesion(LOGIN, 'admin@demo.com');

    expect(sesion.empresaSlugRecordado()).toBe('demo-empresa');
    expect(sesion.correoRecordado()).toBe('admin@demo.com');
  });

  it('marcar y limpiar la expiración no afecta al token', () => {
    sesion.guardarSesion(LOGIN, 'admin@demo.com');

    sesion.marcarExpirada();
    expect(sesion.expirada()).toBe(true);

    sesion.limpiarExpirada();
    expect(sesion.expirada()).toBe(false);
    expect(sesion.token()).toBe('jwt-tenant-123');
  });
});
