import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { environment } from '../../../../environments/environment';
import { CarritoSaasService } from './carrito-saas.service';

const BASE = `${environment.apiUrl.replace(/\/+$/, '')}/tenant/carritos`;

describe('CarritoSaasService (contrato /tenant/carritos)', () => {
  let service: CarritoSaasService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        CarritoSaasService,
      ],
    });
    service = TestBed.inject(CarritoSaasService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('POST /tenant/carritos/items envía variante + temporada (sin inventario_id)', () => {
    service
      .agregarItem({
        sucursal_id: 1,
        variante_producto_id: 25,
        temporada_id: 4,
        cantidad: 2,
      })
      .subscribe();

    const req = http.expectOne(`${BASE}/items`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({
      sucursal_id: 1,
      variante_producto_id: 25,
      temporada_id: 4,
      cantidad: 2,
    });
    expect('inventario_id' in req.request.body).toBe(false);
    expect('empresa_id' in req.request.body).toBe(false);
    expect('cliente_id' in req.request.body).toBe(false);

    req.flush({
      carrito_id: 10,
      detalle_id: 38,
      inventario_id: 150,
      cantidad: 2,
      estado: 'ACTIVO',
    });
  });

  it('GET /tenant/carritos envía limit y offset', () => {
    service.listar(50, 0).subscribe();

    const req = http.expectOne(
      (peticion) =>
        peticion.url === BASE &&
        peticion.params.get('limit') === '50' &&
        peticion.params.get('offset') === '0',
    );
    expect(req.request.method).toBe('GET');
    req.flush({ items: [], total_carritos_activos: 0 });
  });

  it('GET /tenant/carritos/{id} normaliza importes string', () => {
    let recibido: unknown;
    service.obtener(10).subscribe((detalle) => (recibido = detalle));

    const req = http.expectOne(`${BASE}/10`);
    expect(req.request.method).toBe('GET');
    req.flush({
      carrito_id: 10,
      sucursal_id: 1,
      sucursal_nombre: 'Centro',
      estado: 'ACTIVO',
      fecha_creacion: '2026-11-09T09:00:00Z',
      fecha_actualizacion: '2026-11-09T10:00:00Z',
      items: [
        {
          detalle_id: 38,
          inventario_id: 150,
          producto_id: 1,
          producto_nombre: 'Polo',
          precio_unitario: '149.90',
          variante_producto_id: 25,
          sku: 'POL-M',
          talla_id: 3,
          talla_nombre: 'M',
          color_id: 1,
          color_nombre: 'Negro',
          temporada_id: 4,
          temporada_nombre: 'PV26',
          cantidad: 2,
          stock_disponible: 10,
          subtotal_linea: '299.80',
        },
      ],
      cantidad_total_unidades: 2,
      subtotal_carrito: '299.80',
    });

    expect(recibido).toEqual(
      expect.objectContaining({
        subtotal_carrito: 299.8,
        items: [
          expect.objectContaining({
            precio_unitario: 149.9,
            subtotal_linea: 299.8,
            imagen_principal: null,
          }),
        ],
      }),
    );
  });

  it('PATCH /tenant/carritos/{id}/items/{detalle} envía la cantidad', () => {
    service.actualizarCantidad(10, 38, 3).subscribe();

    const req = http.expectOne(`${BASE}/10/items/38`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ cantidad: 3 });
    req.flush({
      carrito_id: 10,
      detalle_id: 38,
      inventario_id: 150,
      cantidad: 3,
      estado: 'ACTIVO',
    });
  });

  it('DELETE de línea y de carrito usan las rutas correctas', () => {
    service.eliminarDetalle(10, 38).subscribe();
    const delLinea = http.expectOne(`${BASE}/10/items/38`);
    expect(delLinea.request.method).toBe('DELETE');
    delLinea.flush({ carrito_id: 10, estado: 'ACTIVO', cantidad_lineas: 1 });

    service.eliminarCarrito(10).subscribe();
    const delCarrito = http.expectOne(`${BASE}/10`);
    expect(delCarrito.request.method).toBe('DELETE');
    delCarrito.flush({ carrito_id: 10, estado: 'ELIMINADO', cantidad_lineas: 0 });
  });
});
