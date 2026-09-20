import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { environment } from '../../../../environments/environment';
import { VentaDigitalResponse } from '../models/venta-digital.model';
import { VentaDigitalService } from './venta-digital.service';

const API = environment.apiUrl.replace(/\/+$/, '');

const RESPUESTA_CRUDA = {
  venta_id: 123,
  carrito_id: 45,
  cliente_id: 3,
  sucursal_id: 2,
  sucursal_nombre: 'Sucursal Centro',
  canal: 'WEB',
  estado: 'PENDIENTE',
  fecha_hora: '2026-09-19T10:00:00+00:00',
  total: '599.80',
  items: [
    {
      detalle_id: 1,
      inventario_id: 9,
      producto_id: 8,
      producto_nombre: 'Camisa Oxford',
      imagen_principal: null,
      variante_producto_id: 3,
      sku: 'OXF-M-NEG',
      talla_id: 2,
      talla_nombre: 'M',
      color_id: 1,
      color_nombre: 'Negro',
      temporada_id: 1,
      temporada_nombre: 'Primavera-Verano 2026',
      cantidad: 2,
      precio_unitario: '299.90',
      subtotal_linea: '599.80',
    },
  ],
  cantidad_total_unidades: 2,
};

describe('VentaDigitalService (CU19)', () => {
  let service: VentaDigitalService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(VentaDigitalService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
  });

  it('realizarCompra hace POST /ventas/digital con canal WEB', () => {
    service.realizarCompra(45).subscribe();

    const peticion = http.expectOne(`${API}/ventas/digital`);
    expect(peticion.request.method).toBe('POST');
    expect(peticion.request.body).toEqual({ carrito_id: 45, canal: 'WEB' });
    // El cliente y la sucursal salen del JWT y del carrito: nunca se envían.
    expect('cliente_id' in peticion.request.body).toBe(false);
    expect('sucursal_id' in peticion.request.body).toBe(false);
    expect('total' in peticion.request.body).toBe(false);
    peticion.flush(RESPUESTA_CRUDA);
  });

  it('normaliza total e importes Decimal a number', () => {
    let respuesta: VentaDigitalResponse | undefined;
    service.realizarCompra(45).subscribe((venta) => (respuesta = venta));

    http.expectOne(`${API}/ventas/digital`).flush(RESPUESTA_CRUDA);

    expect(respuesta?.total).toBe(599.8);
    expect(respuesta?.items[0].precio_unitario).toBe(299.9);
    expect(respuesta?.items[0].subtotal_linea).toBe(599.8);
    expect(respuesta?.estado).toBe('PENDIENTE');
  });

  it('conserva carrito_id null y los campos del contrato real', () => {
    let respuesta: VentaDigitalResponse | undefined;
    service.realizarCompra(45).subscribe((venta) => (respuesta = venta));

    http
      .expectOne(`${API}/ventas/digital`)
      .flush({ ...RESPUESTA_CRUDA, carrito_id: null, items: [] });

    expect(respuesta?.carrito_id).toBeNull();
    expect(respuesta?.items).toEqual([]);
    expect(respuesta?.sucursal_nombre).toBe('Sucursal Centro');
    expect(respuesta?.cantidad_total_unidades).toBe(2);
  });
});
