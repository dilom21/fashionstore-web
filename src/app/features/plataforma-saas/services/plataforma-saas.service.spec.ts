import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../../environments/environment';
import { PlataformaSaasService } from './plataforma-saas.service';

describe('PlataformaSaasService', () => {
  let service: PlataformaSaasService;
  let http: HttpTestingController;
  const api = `${environment.apiUrl.replace(/\/+$/, '')}/saas/superadmin`;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(PlataformaSaasService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('bloquea login web sin emitir credenciales ni solicitud', () => {
    let message = '';
    service.login('admin@example.test', 'fixture-password').subscribe({ error: error => message = error.message });
    expect(message).toContain('no está habilitada');
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

  it('logout local no toca almacenamiento', () => {
    service.logout().subscribe(value => expect(value).toBeNull());
  });
});
