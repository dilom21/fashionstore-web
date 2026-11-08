import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { environment } from '../../../../../environments/environment';
import { TENANT_TOKEN_STORAGE_KEY } from '../../../saas/services/tenant-api.service';
import { InventarioItem } from '../models/inventario.model';
import { InventarioService } from './inventario.service';

const API = environment.apiUrl.replace(/\/+$/, '');

/** Clave legacy de AuthService: CU08 nunca debe usarla. */
const CLAVE_LEGACY = 'vanter_access_token';

function item(overrides: Partial<InventarioItem> = {}): InventarioItem {
  return {
    inventario_id: 10,
    sucursal_id: 2,
    sucursal_nombre: 'Sucursal Centro',
    producto_id: 5,
    producto_nombre: 'Camisa Oxford',
    precio: '149.90',
    categoria_id: 3,
    categoria_nombre: 'Camisas',
    variante_producto_id: 8,
    sku: 'CAM-OXF-M-BLA',
    talla_id: 4,
    talla_nombre: 'M',
    color_id: 6,
    color_nombre: 'Blanco',
    temporada_id: 7,
    temporada_nombre: 'Verano 2026',
    stock_actual: 12,
    stock_reservado: 2,
    stock_disponible: 10,
    fecha_actualizacion: '2026-03-01T10:00:00',
    ...overrides,
  };
}

/**
 * CU08: la consulta de inventario (CU13) debe usar el backend EMPRESARIAL
 * (`GET /tenant/inventario`) con el JWT SaaS y el contrato { items, total,
 * limit, offset }.
 */
describe('InventarioService (CU08 SaaS)', () => {
  let service: InventarioService;
  let http: HttpTestingController;

  beforeEach(() => {
    sessionStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(InventarioService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    sessionStorage.clear();
  });

  it('consulta GET /tenant/inventario con los filtros del contrato', () => {
    service
      .obtenerInventario({
        sucursal_id: 2,
        producto: '  camisa  ',
        producto_id: 5,
        categoria_id: 3,
        talla_id: 4,
        color_id: 6,
        temporada_id: 7,
        disponibilidad: 'STOCK_BAJO',
        limit: 50,
        offset: 100,
      })
      .subscribe();

    const peticion = http.expectOne((req) => req.url === `${API}/tenant/inventario`);
    expect(peticion.request.method).toBe('GET');
    expect(peticion.request.params.get('sucursal_id')).toBe('2');
    expect(peticion.request.params.get('producto')).toBe('camisa');
    expect(peticion.request.params.get('producto_id')).toBe('5');
    expect(peticion.request.params.get('categoria_id')).toBe('3');
    expect(peticion.request.params.get('talla_id')).toBe('4');
    expect(peticion.request.params.get('color_id')).toBe('6');
    expect(peticion.request.params.get('temporada_id')).toBe('7');
    expect(peticion.request.params.get('disponibilidad')).toBe('STOCK_BAJO');
    expect(peticion.request.params.get('limit')).toBe('50');
    expect(peticion.request.params.get('offset')).toBe('100');
    peticion.flush({ items: [], total: 0, limit: 50, offset: 100 });
  });

  it('no envía filtros vacíos ni empresa_id (la empresa sale del JWT)', () => {
    service.obtenerInventario({ producto: '   ' }).subscribe();

    const peticion = http.expectOne((req) => req.url === `${API}/tenant/inventario`);
    expect(peticion.request.params.keys()).toEqual([]);
    expect(peticion.request.url).not.toContain('empresa_id');
    peticion.flush({ items: [], total: 0, limit: 20, offset: 0 });
  });

  it('adjunta el JWT empresarial y nunca el token legacy', () => {
    sessionStorage.setItem(CLAVE_LEGACY, 'jwt-legacy');
    sessionStorage.setItem(TENANT_TOKEN_STORAGE_KEY, 'tenant-jwt');

    service.obtenerInventario().subscribe();

    const peticion = http.expectOne((req) => req.url === `${API}/tenant/inventario`);
    expect(peticion.request.headers.get('Authorization')).toBe(
      'Bearer tenant-jwt',
    );
    peticion.flush({ items: [], total: 0, limit: 20, offset: 0 });
  });

  it('sin JWT empresarial no adjunta ninguna credencial', () => {
    sessionStorage.setItem(CLAVE_LEGACY, 'jwt-legacy');

    service.obtenerInventario().subscribe();

    const peticion = http.expectOne((req) => req.url === `${API}/tenant/inventario`);
    expect(peticion.request.headers.has('Authorization')).toBe(false);
    peticion.flush({ items: [], total: 0, limit: 20, offset: 0 });
  });

  it('representa el contrato { items, total, limit, offset } del backend', () => {
    let respuesta: unknown;
    service.obtenerInventario({ limit: 20, offset: 0 }).subscribe((valor) => {
      respuesta = valor;
    });

    const contrato = { items: [item()], total: 1, limit: 20, offset: 0 };
    http.expectOne((req) => req.url === `${API}/tenant/inventario`).flush(contrato);

    expect(respuesta).toEqual(contrato);
  });

  it('conserva el stock calculado por el backend (no lo recalcula)', () => {
    let respuesta: { items: InventarioItem[] } | undefined;
    service.obtenerInventario().subscribe((valor) => {
      respuesta = valor;
    });

    http
      .expectOne((req) => req.url === `${API}/tenant/inventario`)
      .flush({
        items: [item({ stock_actual: 3, stock_reservado: 2, stock_disponible: 1 })],
        total: 1,
        limit: 20,
        offset: 0,
      });

    expect(respuesta?.items[0].stock_disponible).toBe(1);
  });

  it('un 401 del endpoint empresarial se propaga como error (no como lista vacía)', () => {
    let estado: number | null = null;
    service.obtenerInventario().subscribe({
      error: (error) => {
        estado = error.status;
      },
    });

    http
      .expectOne((req) => req.url === `${API}/tenant/inventario`)
      .flush({ detail: 'No autenticado' }, { status: 401, statusText: 'Unauthorized' });

    expect(estado).toBe(401);
  });
});
