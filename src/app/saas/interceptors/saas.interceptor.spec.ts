import {
  HttpClient,
  provideHttpClient,
  withInterceptors,
} from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { environment } from '../../../environments/environment';
import { TenantLoginResponse } from '../models/tenant.models';
import { SAAS_STORAGE_KEYS } from '../saas.config';
import { SaasSessionService } from '../services/saas-session.service';
import {
  SaasRutaLegacyBloqueadaError,
  crearInterceptorSaas,
  esRutaPermitidaSaas,
  saasInterceptor,
} from './saas.interceptor';

const API = environment.apiUrl.replace(/\/+$/, '');

const LOGIN: TenantLoginResponse = {
  access_token: 'jwt-tenant-123',
  token_type: 'bearer',
  empresa_id: 7,
  empresa_slug: 'demo-empresa',
  empresa_nombre: 'Demo Empresa',
  rol: 'ADMINISTRADOR',
  contexto: 'personal',
};

describe('saasInterceptor', () => {
  let http: HttpTestingController;
  let cliente: HttpClient;
  let sesion: SaasSessionService;

  /** Configura el interceptor con el flag de modo que pida cada prueba. */
  function configurar(modoSaas: boolean): void {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(
          withInterceptors([crearInterceptorSaas({ modoSaas: () => modoSaas })]),
        ),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpTestingController);
    cliente = TestBed.inject(HttpClient);
    sesion = TestBed.inject(SaasSessionService);
  }

  beforeEach(() => {
    sessionStorage.clear();
  });

  afterEach(() => {
    http.verify();
    sessionStorage.clear();
  });

  it('el interceptor registrado por defecto es inerte con la build legacy', () => {
    // La suite compila con `environment.ts` (saasMode: false), que es también
    // el valor por defecto de `ng build` / `ng serve`.
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(withInterceptors([saasInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpTestingController);
    cliente = TestBed.inject(HttpClient);
    sesion = TestBed.inject(SaasSessionService);
    sesion.guardarSesion(LOGIN, 'admin@demo.com');

    cliente.get(`${API}/ventas/presencial`).subscribe();

    const peticion = http.expectOne(`${API}/ventas/presencial`);
    expect(peticion.request.headers.has('Authorization')).toBe(false);
  });

  it('en modo legacy es un no-op: no añade token y no bloquea rutas', () => {
    configurar(false);
    sesion.guardarSesion(LOGIN, 'admin@demo.com');

    cliente.get(`${API}/ventas/presencial`).subscribe();

    const peticion = http.expectOne(`${API}/ventas/presencial`);
    expect(peticion.request.headers.has('Authorization')).toBe(false);
  });

  it('añade Authorization: Bearer con la ruta tenant', () => {
    configurar(true);
    sesion.guardarSesion(LOGIN, 'admin@demo.com');

    cliente.get(`${API}/tenant/empresa/me`).subscribe();

    const peticion = http.expectOne(`${API}/tenant/empresa/me`);
    expect(peticion.request.headers.get('Authorization')).toBe(
      'Bearer jwt-tenant-123',
    );
  });

  it('no envía el token al endpoint de login', () => {
    configurar(true);
    sesion.guardarSesion(LOGIN, 'admin@demo.com');

    cliente
      .post(`${API}/auth/tenant/login`, {
        correo: 'admin@demo.com',
        password: 'x',
        empresa_slug: 'demo-empresa',
        contexto: 'personal',
      })
      .subscribe();

    const peticion = http.expectOne(`${API}/auth/tenant/login`);
    expect(peticion.request.headers.has('Authorization')).toBe(false);
  });

  it('no envía el token al aceptar una invitación', () => {
    configurar(true);
    sesion.guardarSesion(LOGIN, 'admin@demo.com');

    cliente
      .post(`${API}/auth/tenant/invitaciones/aceptar`, {
        token: 'tok',
        password: 'a',
        password_confirmacion: 'a',
      })
      .subscribe();

    const peticion = http.expectOne(`${API}/auth/tenant/invitaciones/aceptar`);
    expect(peticion.request.headers.has('Authorization')).toBe(false);
  });

  it('bloquea una ruta legacy sin emitir la petición HTTP', () => {
    configurar(true);
    sesion.guardarSesion(LOGIN, 'admin@demo.com');

    let capturado: unknown;
    let emitio = false;
    cliente.get(`${API}/ventas/presencial`).subscribe({
      next: () => (emitio = true),
      error: (error: unknown) => (capturado = error),
    });

    expect(emitio).toBe(false);
    expect(capturado).toBeInstanceOf(SaasRutaLegacyBloqueadaError);
    expect((capturado as SaasRutaLegacyBloqueadaError).ruta).toBe(
      '/ventas/presencial',
    );
    http.expectNone(`${API}/ventas/presencial`);
  });

  it('bloquea también el /auth/me legacy', () => {
    configurar(true);

    let capturado: unknown;
    cliente.get(`${API}/auth/me`).subscribe({
      error: (error: unknown) => (capturado = error),
    });

    expect(capturado).toBeInstanceOf(SaasRutaLegacyBloqueadaError);
    expect((capturado as SaasRutaLegacyBloqueadaError).ruta).toBe('/auth/me');
    http.expectNone(`${API}/auth/me`);
  });

  it('deja pasar intactas las URLs externas', () => {
    configurar(true);
    sesion.guardarSesion(LOGIN, 'admin@demo.com');

    cliente.get('https://cdn.example.com/imagen.png').subscribe();

    const peticion = http.expectOne('https://cdn.example.com/imagen.png');
    expect(peticion.request.headers.has('Authorization')).toBe(false);
  });

  it('permite /health sin token', () => {
    configurar(true);

    cliente.get(`${API}/health`).subscribe();

    const peticion = http.expectOne(`${API}/health`);
    expect(peticion.request.headers.has('Authorization')).toBe(false);
  });

  it('ante un 401 marca expirada, limpia la sesión y navega al login', () => {
    configurar(true);
    sesion.guardarSesion(LOGIN, 'admin@demo.com');

    let capturado: unknown;
    cliente.get(`${API}/tenant/empresa/me`).subscribe({
      error: (error: unknown) => (capturado = error),
    });

    http
      .expectOne(`${API}/tenant/empresa/me`)
      .flush(
        { detail: 'Token inválido' },
        { status: 401, statusText: 'Unauthorized' },
      );

    expect(capturado).toBeTruthy();
    expect(sesion.expirada()).toBe(true);
    expect(sesion.token()).toBeNull();
    expect(sessionStorage.getItem(SAAS_STORAGE_KEYS.token)).toBeNull();
  });

  it('un 401 en el login no se trata como sesión expirada', () => {
    configurar(true);
    sesion.guardarSesion(LOGIN, 'admin@demo.com');

    cliente.post(`${API}/auth/tenant/login`, {}).subscribe({
      error: () => {
        /* credenciales inválidas */
      },
    });

    http
      .expectOne(`${API}/auth/tenant/login`)
      .flush(
        { detail: 'Credenciales invalidas' },
        { status: 401, statusText: 'Unauthorized' },
      );

    expect(sesion.expirada()).toBe(false);
    expect(sesion.token()).toBe('jwt-tenant-123');
  });
});

describe('esRutaPermitidaSaas', () => {
  const casos: Array<[string, boolean]> = [
    ['/', true],
    ['/health', true],
    ['/tenant/empresa/me', true],
    ['/auth/tenant/login', true],
    ['/auth/tenant/me', true],
    ['/auth/me', false],
    ['/ventas/presencial', false],
    ['/auth/personal/login', false],
  ];

  it.each(casos)('%s → %s', (ruta, esperado) => {
    expect(esRutaPermitidaSaas(ruta)).toBe(esperado);
  });
});
