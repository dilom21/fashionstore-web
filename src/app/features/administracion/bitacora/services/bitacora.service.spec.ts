import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { environment } from '../../../../../environments/environment';
import { TENANT_TOKEN_STORAGE_KEY } from '../../../saas/services/tenant-api.service';
import { BitacoraService } from './bitacora.service';

const API = environment.apiUrl.replace(/\/+$/, '');

/**
 * CU05 SaaS: la bitácora se consulta SOLO contra los endpoints empresariales,
 * con el JWT de `TenantApiService`. Nunca se envían los endpoints legacy ni
 * `empresa_id` (el backend lo obtiene del token).
 */
describe('BitacoraService (CU05 SaaS)', () => {
  let service: BitacoraService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(BitacoraService);
    http = TestBed.inject(HttpTestingController);
    sessionStorage.setItem(TENANT_TOKEN_STORAGE_KEY, 'tenant-jwt');
  });

  afterEach(() => {
    sessionStorage.clear();
    http.verify();
  });

  it('lista contra GET /tenant/bitacora con el JWT empresarial y sin empresa_id', () => {
    service
      .listarBitacora({ buscar: ' venta ', limit: 25, offset: 25 })
      .subscribe();

    const peticion = http.expectOne(
      (req) => req.url === `${API}/tenant/bitacora`,
    );
    expect(peticion.request.method).toBe('GET');
    expect(peticion.request.headers.get('Authorization')).toBe(
      'Bearer tenant-jwt',
    );
    expect(peticion.request.params.get('buscar')).toBe('venta');
    expect(peticion.request.params.get('limit')).toBe('25');
    expect(peticion.request.params.get('offset')).toBe('25');
    expect(peticion.request.params.has('empresa_id')).toBe(false);
    peticion.flush({ items: [], total: 0, limit: 25, offset: 25 });
  });

  it('consulta los catálogos en GET /tenant/bitacora/catalogos', () => {
    service.obtenerCatalogos().subscribe();

    const peticion = http.expectOne(
      (req) => req.url === `${API}/tenant/bitacora/catalogos`,
    );
    expect(peticion.request.headers.get('Authorization')).toBe(
      'Bearer tenant-jwt',
    );
    peticion.flush({ acciones: [], entidades: [], usuarios: [] });
  });

  it('consulta el detalle en GET /tenant/bitacora/{bitacora_id}', () => {
    service.obtenerBitacora(12).subscribe();

    const peticion = http.expectOne(
      (req) => req.url === `${API}/tenant/bitacora/12`,
    );
    expect(peticion.request.method).toBe('GET');
    peticion.flush({
      id: 12,
      fecha_hora: '2026-09-20T10:00:00+00:00',
      ip: null,
      accion: 'CREAR',
      entidad_afectada: 'producto',
      descripcion: null,
      usuario: null,
    });
  });
});
