import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { environment } from '../../../../environments/environment';
import { ComprobanteVenta } from '../models/comprobante-venta.model';
import { ComprobanteVentaService } from './comprobante-venta.service';

const API = environment.apiUrl.replace(/\/+$/, '');
const URL = `${API}/ventas/535/comprobante`;

/**
 * Respuesta CRUDA del backend: los `Decimal` llegan serializados como string
 * (por eso el servicio los normaliza) y `cliente` puede ser `null` en ventas
 * presenciales anónimas.
 */
const RESPUESTA_CRUDA = {
  venta_id: 535,
  fecha_hora: '2026-09-19T10:00:00',
  canal: 'PRESENCIAL',
  estado_venta: 'COMPLETADA',
  total: '149.90',
  carrito_id: null,
  reserva_id: 44,
  cliente: {
    id: 3,
    nombre: 'Juan',
    apellido: 'Perez',
    ci: '12345678',
    telefono: null,
  },
  empleado: { id: 9, nombres: 'Ana', apellidos: 'Quispe' },
  sucursal: {
    id: 1,
    nombre: 'Sucursal Centro',
    direccion: 'Av. Siempre Viva 123',
    telefono: '77712345',
  },
  pago: {
    pago_id: 7,
    fecha_hora: '2026-09-19T10:00:00',
    monto: '149.90',
    metodo: 'TARJETA',
    estado: 'APROBADO',
    referencia_transaccion: 'pi_3TestABC',
    pasarela: 'STRIPE',
  },
  items: [
    {
      detalle_venta_id: 1,
      inventario_id: 2,
      producto_id: 3,
      producto_nombre: 'Polo Premium Piqué',
      variante_producto_id: 4,
      sku: 'POL-PIQ-NEG-M',
      talla_nombre: 'M',
      color_nombre: 'Negro',
      cantidad: 1,
      precio_unitario: '149.90',
      subtotal_linea: '149.90',
    },
  ],
  cantidad_total_unidades: 1,
};

describe('ComprobanteVentaService (CU23)', () => {
  let service: ComprobanteVentaService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(ComprobanteVentaService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
  });

  it('obtenerComprobante llama GET /ventas/{id}/comprobante', () => {
    let respuesta: ComprobanteVenta | undefined;
    service.obtenerComprobante(535).subscribe((valor) => (respuesta = valor));

    const peticion = http.expectOne(URL);
    expect(peticion.request.method).toBe('GET');
    expect(peticion.request.urlWithParams).toBe(URL);
    peticion.flush(RESPUESTA_CRUDA);

    expect(respuesta?.venta_id).toBe(535);
    expect(respuesta?.estado_venta).toBe('COMPLETADA');
  });

  it('CU23 es una consulta: nunca usa POST/PUT/PATCH/DELETE', () => {
    service.obtenerComprobante(535).subscribe();
    http.expectOne(URL).flush(RESPUESTA_CRUDA);

    for (const metodo of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      expect(() => http.expectNone({ method: metodo })).not.toThrow();
    }
  });

  it('envía el endpoint correcto para cada venta_id', () => {
    service.obtenerComprobante(1).subscribe();
    const primera = http.expectOne(`${API}/ventas/1/comprobante`);
    expect(primera.request.method).toBe('GET');
    primera.flush(RESPUESTA_CRUDA);

    service.obtenerComprobante(535).subscribe();
    const segunda = http.expectOne(URL);
    expect(segunda.request.method).toBe('GET');
    segunda.flush(RESPUESTA_CRUDA);
  });

  it('normaliza los Decimal a number sin recalcular el total', () => {
    let respuesta: ComprobanteVenta | undefined;
    service.obtenerComprobante(535).subscribe((valor) => (respuesta = valor));

    http.expectOne(URL).flush(RESPUESTA_CRUDA);

    expect(respuesta?.total).toBe(149.9);
    expect(respuesta?.pago.monto).toBe(149.9);
    expect(respuesta?.items[0].precio_unitario).toBe(149.9);
    expect(respuesta?.items[0].subtotal_linea).toBe(149.9);
    expect(respuesta?.cantidad_total_unidades).toBe(1);
  });

  it('conserva null reales: cliente, carrito_id, reserva_id, pasarela', () => {
    let respuesta: ComprobanteVenta | undefined;
    service.obtenerComprobante(535).subscribe((valor) => (respuesta = valor));

    http.expectOne(URL).flush({
      ...RESPUESTA_CRUDA,
      cliente: null,
      empleado: null,
      carrito_id: null,
      reserva_id: null,
      pago: {
        ...RESPUESTA_CRUDA.pago,
        pasarela: null,
        referencia_transaccion: null,
      },
    });

    expect(respuesta?.cliente).toBeNull();
    expect(respuesta?.empleado).toBeNull();
    expect(respuesta?.reserva_id).toBeNull();
    expect(respuesta?.pago.pasarela).toBeNull();
    expect(respuesta?.pago.referencia_transaccion).toBeNull();
  });

  it('rechaza venta_id inválido antes de llamar al backend', () => {
    for (const invalido of [0, -3, 1.5]) {
      let mensaje = '';
      service.obtenerComprobante(invalido).subscribe({
        error: (error: Error) => (mensaje = error.message),
      });
      expect(mensaje).toContain('no es válido');
    }
    http.expectNone(URL);
  });
});
