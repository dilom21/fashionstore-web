import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { PlataformaSaasService } from './plataforma-saas.service';

describe('PlataformaSaasService', () => {
  let service: PlataformaSaasService;
  let http: HttpTestingController;
  const api = '/api/plataforma';

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(PlataformaSaasService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('envía login al BFF same-origin sin API key', () => {
    service.login('admin@example.test', 'fixture-password').subscribe();
    const request = http.expectOne(`${api}/auth/login`);
    expect(request.request.withCredentials).toBe(true);
    expect(request.request.headers.has('X-SaaS-Admin-Key')).toBe(false);
    request.flush({ autenticado: true, usuario: 'admin@example.test', rol: 'SUPERADMIN' });
  });

  it('usa el contrato real para crear el administrador inicial', () => {
    document.cookie = 'fashionstore_platform_csrf=csrf-fixture';
    const payload = { correo: 'a@example.com', password: 'fixture-password', nombres: 'A', apellidos: 'B', ci: '1', ciudad_id: 2, nombre_sucursal: 'Centro', direccion_sucursal: 'Calle 1', telefono: null };
    service.crearAdministrador(9, payload).subscribe();
    const request = http.expectOne(`${api}/empresas/9/administrador-inicial`);
    expect(request.request.method).toBe('POST');
    expect(request.request.withCredentials).toBe(true);
    expect(request.request.headers.get('X-CSRF-Token')).toBe('csrf-fixture');
    expect(request.request.headers.has('X-SaaS-Admin-Key')).toBe(false);
    request.flush({ id: 20 });
    document.cookie = 'fashionstore_platform_csrf=; Max-Age=0';
  });

  it('solicita revocación al servidor', () => {
    service.logout().subscribe();
    const request = http.expectOne(`${api}/auth/logout`);
    expect(request.request.method).toBe('POST');
    request.flush({ ok: true });
  });
});
