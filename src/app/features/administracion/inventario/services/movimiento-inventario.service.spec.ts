import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { environment } from '../../../../../environments/environment';
import { TENANT_TOKEN_STORAGE_KEY } from '../../../saas/services/tenant-api.service';
import { MovimientoInventarioItem } from '../models/movimiento-inventario.model';
import { MovimientoInventarioService } from './movimiento-inventario.service';

const API = environment.apiUrl.replace(/\/+$/, '');

/** Clave legacy de AuthService: CU08 nunca debe usarla. */
const CLAVE_LEGACY = 'vanter_access_token';

function movimiento(
  overrides: Partial<MovimientoInventarioItem> = {},
): MovimientoInventarioItem {
  return {
    movimiento_id: 91,
    inventario_id: 10,
    usuario_id: 7,
    usuario_correo: 'encargado@vanter.test',
    tipo: 'ENTRADA_COMPRA',
    cantidad: 6,
    fecha_hora: '2026-03-01T10:15:00',
    observaciones: 'Recepción de orden de compra',
    referencia_tipo: 'ORDEN_COMPRA',
    referencia_id: 15,
    sucursal_id: 2,
    sucursal_nombre: 'Sucursal Centro',
    producto_id: 5,
    producto_nombre: 'Camisa Oxford',
    variante_producto_id: 8,
    sku: 'CAM-OXF-M-BLA',
    talla_id: 4,
    talla_nombre: 'M',
    color_id: 6,
    color_nombre: 'Blanco',
    temporada_id: 7,
    temporada_nombre: 'Verano 2026',
    ...overrides,
  };
}

/**
 * CU08: el kardex (CU14) debe usar `GET /tenant/inventario/movimientos` con el
 * JWT SaaS, conservando filtros y admitiendo `usuario_correo = null`.
 */
describe('MovimientoInventarioService (CU08 SaaS)', () => {
  let service: MovimientoInventarioService;
  let http: HttpTestingController;

  beforeEach(() => {
    sessionStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(MovimientoInventarioService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    sessionStorage.clear();
  });

  it('consulta GET /tenant/inventario/movimientos con los filtros existentes', () => {
    service
      .obtenerMovimientos({
        sucursal_id: 2,
        producto: '  camisa ',
        tipo: 'SALIDA_VENTA',
        temporada_id: 7,
        referencia_tipo: ' VENTA ',
        fecha_desde: '2026-03-01',
        fecha_hasta: '2026-03-31',
        limit: 10,
        offset: 20,
      })
      .subscribe();

    const peticion = http.expectOne((req) => req.url === `${API}/tenant/inventario/movimientos`);
    expect(peticion.request.method).toBe('GET');
    expect(peticion.request.params.get('sucursal_id')).toBe('2');
    expect(peticion.request.params.get('producto')).toBe('camisa');
    expect(peticion.request.params.get('tipo')).toBe('SALIDA_VENTA');
    expect(peticion.request.params.get('temporada_id')).toBe('7');
    expect(peticion.request.params.get('referencia_tipo')).toBe('VENTA');
    expect(peticion.request.params.get('fecha_desde')).toBe('2026-03-01');
    expect(peticion.request.params.get('fecha_hasta')).toBe('2026-03-31');
    expect(peticion.request.params.get('limit')).toBe('10');
    expect(peticion.request.params.get('offset')).toBe('20');
    peticion.flush({ items: [], total: 0, limit: 10, offset: 20 });
  });

  it('adjunta el JWT empresarial y nunca el token legacy', () => {
    sessionStorage.setItem(CLAVE_LEGACY, 'jwt-legacy');
    sessionStorage.setItem(TENANT_TOKEN_STORAGE_KEY, 'tenant-jwt');

    service.obtenerMovimientos().subscribe();

    const peticion = http.expectOne((req) => req.url === `${API}/tenant/inventario/movimientos`);
    expect(peticion.request.headers.get('Authorization')).toBe(
      'Bearer tenant-jwt',
    );
    peticion.flush({ items: [], total: 0, limit: 10, offset: 0 });
  });

  it('admite usuario_correo = null sin descartar el movimiento', () => {
    let respuesta: { items: MovimientoInventarioItem[] } | undefined;
    service.obtenerMovimientos().subscribe((valor) => {
      respuesta = valor;
    });

    http
      .expectOne((req) => req.url === `${API}/tenant/inventario/movimientos`)
      .flush({
        items: [
          movimiento({
            movimiento_id: 92,
            usuario_id: null,
            usuario_correo: null,
            tipo: 'RESERVA',
          }),
        ],
        total: 1,
        limit: 10,
        offset: 0,
      });

    expect(respuesta?.items).toHaveLength(1);
    expect(respuesta?.items[0].usuario_correo).toBeNull();
    expect(respuesta?.items[0].tipo).toBe('RESERVA');
  });

  it('no envía filtros vacíos ni empresa_id (la empresa sale del JWT)', () => {
    service.obtenerMovimientos({ producto: '   ', referencia_tipo: '  ' }).subscribe();

    const peticion = http.expectOne((req) => req.url === `${API}/tenant/inventario/movimientos`);
    expect(peticion.request.params.keys()).toEqual([]);
    expect(peticion.request.url).not.toContain('empresa_id');
    peticion.flush({ items: [], total: 0, limit: 10, offset: 0 });
  });
});
