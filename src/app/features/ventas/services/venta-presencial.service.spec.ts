import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { environment } from '../../../../environments/environment';
import { VentaPresencialResponse } from '../models/venta-presencial.model';
import { VentaPresencialService } from './venta-presencial.service';

const API = environment.apiUrl.replace(/\/+$/, '');
const URL = `${API}/ventas/presencial`;

const RESPUESTA_CRUDA = {
  venta_id: 321,
  cliente_id: null,
  empleado_id: 9,
  sucursal_id: 2,
  sucursal_nombre: 'Sucursal Centro',
  reserva_id: null,
  canal: 'PRESENCIAL',
  estado: 'PENDIENTE',
  fecha_hora: '2026-09-19T10:00:00+00:00',
  total: '599.80',
  items: [
    {
      detalle_id: 1,
      inventario_id: 17,
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

describe('VentaPresencialService (CU20)', () => {
  let service: VentaPresencialService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(VentaPresencialService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
  });

  it('registrarVentaDirecta hace POST /ventas/presencial con reserva_id null', () => {
    service
      .registrarVentaDirecta([{ inventario_id: 17, cantidad: 2 }])
      .subscribe();

    const peticion = http.expectOne(URL);
    expect(peticion.request.method).toBe('POST');
    expect(peticion.request.body).toEqual({
      reserva_id: null,
      items: [{ inventario_id: 17, cantidad: 2 }],
    });
    peticion.flush(RESPUESTA_CRUDA);
  });

  it('la venta directa es anónima: no envía cliente_id', () => {
    service
      .registrarVentaDirecta([{ inventario_id: 17, cantidad: 1 }])
      .subscribe();

    const peticion = http.expectOne(URL);
    expect('cliente_id' in peticion.request.body).toBe(false);
    peticion.flush(RESPUESTA_CRUDA);
  });

  it('registrarVentaDirecta envía cliente_id solo si se indica', () => {
    service
      .registrarVentaDirecta([{ inventario_id: 17, cantidad: 1 }], 3)
      .subscribe();

    const peticion = http.expectOne(URL);
    expect(peticion.request.body.cliente_id).toBe(3);
    peticion.flush(RESPUESTA_CRUDA);
  });

  it('registrarVentaDesdeReserva envía reserva_id y no cliente_id', () => {
    service
      .registrarVentaDesdeReserva(44, [{ inventario_id: 17, cantidad: 2 }])
      .subscribe();

    const peticion = http.expectOne(URL);
    expect(peticion.request.body).toEqual({
      reserva_id: 44,
      items: [{ inventario_id: 17, cantidad: 2 }],
    });
    expect('cliente_id' in peticion.request.body).toBe(false);
    peticion.flush({ ...RESPUESTA_CRUDA, reserva_id: 44 });
  });

  it('nunca envía campos server-owned', () => {
    service
      .registrarVentaDirecta([{ inventario_id: 17, cantidad: 2 }], 3)
      .subscribe();

    const peticion = http.expectOne(URL);
    const cuerpo = peticion.request.body;
    for (const campo of [
      'empleado_id',
      'sucursal_id',
      'canal',
      'estado',
      'precio_unitario',
      'total',
    ]) {
      expect(campo in cuerpo).toBe(false);
    }
    peticion.flush(RESPUESTA_CRUDA);
  });

  it('descarta las líneas sin cantidad positiva', () => {
    service
      .registrarVentaDirecta([
        { inventario_id: 17, cantidad: 2 },
        { inventario_id: 18, cantidad: 0 },
      ])
      .subscribe();

    const peticion = http.expectOne(URL);
    expect(peticion.request.body.items).toEqual([
      { inventario_id: 17, cantidad: 2 },
    ]);
    peticion.flush(RESPUESTA_CRUDA);
  });

  it('normaliza total e importes Decimal a number', () => {
    let respuesta: VentaPresencialResponse | undefined;
    service
      .registrarVentaDirecta([{ inventario_id: 17, cantidad: 2 }])
      .subscribe((venta) => (respuesta = venta));

    http.expectOne(URL).flush(RESPUESTA_CRUDA);

    expect(respuesta?.total).toBe(599.8);
    expect(respuesta?.items[0].precio_unitario).toBe(299.9);
    expect(respuesta?.items[0].subtotal_linea).toBe(599.8);
    expect(respuesta?.estado).toBe('PENDIENTE');
    expect(respuesta?.canal).toBe('PRESENCIAL');
    expect(respuesta?.cliente_id).toBeNull();
  });
});
