import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { environment } from '../../../environments/environment';
import {
  VentaComercialResumen,
  VentaContadoRespuesta,
  VentaContadoSolicitud,
} from '../models/tenant.models';
import { SaasVentasService } from './saas-ventas.service';

const API = environment.apiUrl.replace(/\/+$/, '');
const URL_CONTADO = `${API}/tenant/ventas/contado`;
const URL_COMERCIAL = `${API}/tenant/comercial/ventas`;

const OPERACION = '6f1c2b7e-3a4d-4f5e-9a0b-1c2d3e4f5a6b';

const SOLICITUD: VentaContadoSolicitud = {
  sucursal_id: 4,
  operacion_id: OPERACION,
  metodo_pago: 'EFECTIVO',
  lineas: [
    { inventario_id: 101, cantidad: 2 },
    { inventario_id: 102, cantidad: 1 },
  ],
};

const RESPUESTA: VentaContadoRespuesta = {
  venta_id: 55,
  pago_id: 66,
  estado: 'COMPLETADA',
  canal: 'PRESENCIAL',
  metodo_pago: 'EFECTIVO',
  total: 300.5,
  moneda: 'BOB',
  operacion_id: OPERACION,
  idempotente: false,
  lineas: [
    {
      inventario_id: 101,
      cantidad: 2,
      precio_unitario: 120,
      subtotal: 240,
    },
    {
      inventario_id: 102,
      cantidad: 1,
      precio_unitario: 60.5,
      subtotal: 60.5,
    },
  ],
  stock: [
    { inventario_id: 101, stock_actual: 8, stock_reservado: 0 },
    { inventario_id: 102, stock_actual: 4, stock_reservado: 0 },
  ],
};

describe('SaasVentasService', () => {
  let service: SaasVentasService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(SaasVentasService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
  });

  /** Abre una petición por URL exacta (sin query string). */
  function esperar(url: string) {
    return http.expectOne((peticion) => peticion.url === url);
  }

  // ============================ Venta de contado ============================

  it('registrarContado hace POST con la URL y el cuerpo exactos', () => {
    let respuesta: VentaContadoRespuesta | undefined;
    service
      .registrarContado(SOLICITUD)
      .subscribe((valor) => (respuesta = valor));

    const peticion = esperar(URL_CONTADO);
    expect(peticion.request.method).toBe('POST');
    expect(peticion.request.url.endsWith('/')).toBe(false);
    expect(peticion.request.body).toEqual({
      sucursal_id: 4,
      operacion_id: OPERACION,
      metodo_pago: 'EFECTIVO',
      lineas: [
        { inventario_id: 101, cantidad: 2 },
        { inventario_id: 102, cantidad: 1 },
      ],
    });
    peticion.flush(RESPUESTA, { status: 201, statusText: 'Created' });

    expect(respuesta).toEqual(RESPUESTA);
  });

  it('registrarContado no agrega precios, totales ni empresa al cuerpo', () => {
    service.registrarContado(SOLICITUD).subscribe();

    const peticion = esperar(URL_CONTADO);
    const cuerpo = peticion.request.body as unknown as Record<string, unknown>;
    expect(Object.keys(cuerpo).sort()).toEqual([
      'lineas',
      'metodo_pago',
      'operacion_id',
      'sucursal_id',
    ]);
    expect('empresa_id' in cuerpo).toBe(false);
    expect('total' in cuerpo).toBe(false);
    expect('precio_unitario' in cuerpo).toBe(false);

    const lineas = cuerpo['lineas'] as Array<Record<string, unknown>>;
    expect(Object.keys(lineas[0]).sort()).toEqual(['cantidad', 'inventario_id']);
    peticion.flush(RESPUESTA);
  });

  it('registrarContado omite metodo_pago cuando no se envía', () => {
    service
      .registrarContado({
        sucursal_id: 4,
        operacion_id: OPERACION,
        lineas: [{ inventario_id: 101, cantidad: 1 }],
      })
      .subscribe();

    const peticion = esperar(URL_CONTADO);
    const cuerpo = peticion.request.body as unknown as Record<string, unknown>;
    expect('metodo_pago' in cuerpo).toBe(false);
    expect(Object.keys(cuerpo).sort()).toEqual([
      'lineas',
      'operacion_id',
      'sucursal_id',
    ]);
    peticion.flush(RESPUESTA);
  });

  it('registrarContado entrega el replay idempotente (HTTP 200) como éxito', () => {
    let respuesta: VentaContadoRespuesta | undefined;
    let huboError = false;

    service.registrarContado(SOLICITUD).subscribe({
      next: (valor) => (respuesta = valor),
      error: () => (huboError = true),
    });

    esperar(URL_CONTADO).flush(
      { ...RESPUESTA, idempotente: true },
      { status: 200, statusText: 'OK' },
    );

    expect(huboError).toBe(false);
    expect(respuesta?.idempotente).toBe(true);
    expect(respuesta?.venta_id).toBe(55);
  });

  it('propaga el 409 de operacion_id reutilizado con su detalle', () => {
    let estado = 0;
    let detalle = '';

    service.registrarContado(SOLICITUD).subscribe({
      error: (error: HttpErrorResponse) => {
        estado = error.status;
        detalle = (error.error as { detail?: string }).detail ?? '';
      },
    });

    esperar(URL_CONTADO).flush(
      { detail: 'operacion_id reutilizado con una carga distinta' },
      { status: 409, statusText: 'Conflict' },
    );

    expect(estado).toBe(409);
    expect(detalle).toBe('operacion_id reutilizado con una carga distinta');
  });

  it('propaga el 403 de inventario de otra empresa', () => {
    let estado = 0;
    let detalle = '';

    service.registrarContado(SOLICITUD).subscribe({
      error: (error: HttpErrorResponse) => {
        estado = error.status;
        detalle = (error.error as { detail?: string }).detail ?? '';
      },
    });

    esperar(URL_CONTADO).flush(
      { detail: 'Operacion no autorizada' },
      { status: 403, statusText: 'Forbidden' },
    );

    expect(estado).toBe(403);
    expect(detalle).toBe('Operacion no autorizada');
  });

  it('propaga el 503 de ventas SaaS deshabilitadas', () => {
    let estado = 0;
    let detalle = '';

    service.registrarContado(SOLICITUD).subscribe({
      error: (error: HttpErrorResponse) => {
        estado = error.status;
        detalle = (error.error as { detail?: string }).detail ?? '';
      },
    });

    esperar(URL_CONTADO).flush(
      { detail: 'Ventas SaaS aun no habilitadas' },
      { status: 503, statusText: 'Service Unavailable' },
    );

    expect(estado).toBe(503);
    expect(detalle).toBe('Ventas SaaS aun no habilitadas');
  });

  it('propaga el 409 de conflicto de stock', () => {
    let estado = 0;

    service.registrarContado(SOLICITUD).subscribe({
      error: (error: HttpErrorResponse) => (estado = error.status),
    });

    esperar(URL_CONTADO).flush(
      { detail: 'Conflicto en la venta' },
      { status: 409, statusText: 'Conflict' },
    );

    expect(estado).toBe(409);
  });

  it('propaga el 422 de validación con la ubicación del campo', () => {
    let estado = 0;
    let ubicacion: Array<string | number> = [];

    service.registrarContado(SOLICITUD).subscribe({
      error: (error: HttpErrorResponse) => {
        estado = error.status;
        const cuerpo = error.error as {
          detail?: Array<{ loc: Array<string | number> }>;
        };
        ubicacion = cuerpo.detail?.[0]?.loc ?? [];
      },
    });

    esperar(URL_CONTADO).flush(
      {
        detail: [
          {
            type: 'greater_than',
            loc: ['body', 'lineas', 0, 'cantidad'],
            msg: 'Input should be greater than 0',
          },
        ],
      },
      { status: 422, statusText: 'Unprocessable Entity' },
    );

    expect(estado).toBe(422);
    expect(ubicacion).toEqual(['body', 'lineas', 0, 'cantidad']);
  });

  // ============================ Ventas recientes ==========================

  it('listarVentas hace GET con limit y offset exactos', () => {
    let resultado: VentaComercialResumen[] | undefined;
    service
      .listarVentas(20, 0)
      .subscribe((valor) => (resultado = valor));

    const peticion = esperar(URL_COMERCIAL);
    expect(peticion.request.method).toBe('GET');
    expect(peticion.request.params.get('limit')).toBe('20');
    expect(peticion.request.params.get('offset')).toBe('0');
    expect(peticion.request.params.keys().sort()).toEqual([
      'limit',
      'offset',
    ]);
    peticion.flush([{ id: 55, estado: 'COMPLETADA' }]);

    expect(resultado).toEqual([{ id: 55, estado: 'COMPLETADA' }]);
  });

  it('listarVentas sin argumentos no agrega query params', () => {
    service.listarVentas().subscribe();

    const peticion = esperar(URL_COMERCIAL);
    expect(peticion.request.urlWithParams).toBe(URL_COMERCIAL);
    peticion.flush([]);
  });

  it('listarVentas propaga el 403 de un rol que no es ADMINISTRADOR', () => {
    let estado = 0;

    service.listarVentas(20, 0).subscribe({
      error: (error: HttpErrorResponse) => (estado = error.status),
    });

    esperar(URL_COMERCIAL).flush(
      { detail: 'Operacion no autorizada' },
      { status: 403, statusText: 'Forbidden' },
    );

    expect(estado).toBe(403);
  });
});
