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

import { environment } from '../../../environments/environment';
import { AuthService } from '../../features/autenticacion-seguridad/auth/services/auth.service';
import { authInterceptor } from './auth.interceptor';

const API = environment.apiUrl.replace(/\/+$/, '');
const LEGACY = 'legacy-jwt';
const TENANT = 'tenant-jwt';

/**
 * El JWT legacy (AuthService) y el JWT empresarial (TenantApiService) conviven
 * en la misma aplicación pero NUNCA se mezclan: las rutas SaaS solo llevan el
 * token tenant, que añade el propio servicio.
 */
describe('authInterceptor (JWT legacy vs JWT empresarial)', () => {
  let httpClient: HttpClient;
  let http: HttpTestingController;

  function configurar(tokenLegacy: string | null): void {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: { obtenerToken: () => tokenLegacy } },
      ],
    });
    httpClient = TestBed.inject(HttpClient);
    http = TestBed.inject(HttpTestingController);
  }

  afterEach(() => {
    http.verify();
  });

  it('mantiene el JWT legacy en los endpoints del cliente autenticado', () => {
    configurar(LEGACY);

    httpClient.get(`${API}/carritos`).subscribe();
    const peticion = http.expectOne(`${API}/carritos`);
    expect(peticion.request.headers.get('Authorization')).toBe(
      `Bearer ${LEGACY}`,
    );
    peticion.flush({});
  });

  it('NUNCA envía el JWT legacy a GET /auth/tenant/me', () => {
    configurar(LEGACY);

    httpClient.get(`${API}/auth/tenant/me`).subscribe();
    const peticion = http.expectOne(`${API}/auth/tenant/me`);
    expect(peticion.request.headers.has('Authorization')).toBe(false);
    peticion.flush({});
  });

  it('NUNCA envía el JWT legacy a los endpoints /tenant/** de la empresa', () => {
    configurar(LEGACY);

    httpClient.get(`${API}/tenant/empresa/usuarios`).subscribe();
    const peticion = http.expectOne(`${API}/tenant/empresa/usuarios`);
    expect(peticion.request.headers.has('Authorization')).toBe(false);
    peticion.flush([]);
  });

  it('el login empresarial viaja sin ningún token previo', () => {
    configurar(LEGACY);

    httpClient.post(`${API}/auth/tenant/login`, {}).subscribe();
    const peticion = http.expectOne(`${API}/auth/tenant/login`);
    expect(peticion.request.headers.has('Authorization')).toBe(false);
    peticion.flush({});
  });

  it('deja intacto el JWT empresarial que ya añadió TenantApiService', () => {
    configurar(LEGACY);

    httpClient
      .get(`${API}/auth/tenant/me`, {
        headers: { Authorization: `Bearer ${TENANT}` },
      })
      .subscribe();

    const peticion = http.expectOne(`${API}/auth/tenant/me`);
    expect(peticion.request.headers.get('Authorization')).toBe(
      `Bearer ${TENANT}`,
    );
    peticion.flush({});
  });

  it('no añade tokens a dominios externos', () => {
    configurar(LEGACY);

    httpClient.get('https://api.stripe.com/v1/payment_intents').subscribe();
    const peticion = http.expectOne('https://api.stripe.com/v1/payment_intents');
    expect(peticion.request.headers.has('Authorization')).toBe(false);
    peticion.flush({});
  });
});
