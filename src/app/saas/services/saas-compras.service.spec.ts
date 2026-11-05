import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { environment } from '../../../environments/environment';
import {
  OrdenCompraCreada,
  OrdenCompraCrear,
  OrdenCompraDetalle,
  OrdenCompraResumen,
  RecepcionResultado,
  RecepcionSolicitud,
  TransicionOrdenCompra,
} from '../models/tenant.models';
import { SaasComprasService } from './saas-compras.service';

const API = environment.apiUrl.replace(/\/+$/, '');
const BASE = `${API}/tenant/ordenes-compra`;

const OPERACION = '2b8f4c1a-9d3e-4a7b-8c6d-5e4f3a2b1c0d';

const ORDEN_CREADA: OrdenCompraCreada = {
  orden_compra_id: 7,
  estado: 'BORRADOR',
  proveedor_id: 3,
  sucursal_id: 4,
  total_lineas: 1,
  lineas: [
    {
      variante_producto_id: 9,
      temporada_id: 2,
      cantidad: 10,
      costo_unitario: 45.5,
    },
  ],
  stock_modificado: false,
};

const ORDEN: OrdenCompraResumen = {
  id: 7,
  proveedor_id: 3,
  proveedor_razon_social: 'Textiles Andinos S.R.L.',
  sucursal_id: 4,
  sucursal_nombre: 'Sucursal Centro',
  estado: 'BORRADOR',
  fecha_orden: '2026-10-30T10:15:00Z',
  fecha_estimada: null,
  fecha_recepcion: null,
  total_lineas: 2,
};

const DETALLE: OrdenCompraDetalle = {
  ...ORDEN,
  lineas: [
    {
      id: 21,
      variante_producto_id: 9,
      sku: 'POL-M-BLA',
      temporada_id: 2,
      temporada_nombre: 'Verano 2026',
      cantidad: 10,
      costo_unitario: 45.5,
      cantidad_recibida: 4,
      cantidad_pendiente: 6,
    },
    {
      id: 22,
      variante_producto_id: 10,
      sku: 'POL-L-NEG',
      temporada_id: 2,
      temporada_nombre: 'Verano 2026',
      cantidad: 5,
      costo_unitario: 48,
      cantidad_recibida: 0,
      cantidad_pendiente: 5,
    },
  ],
};

const SOLICITUD: RecepcionSolicitud = {
  operacion_id: OPERACION,
  observacion: 'Llegó completo',
  lineas: [
    { detalle_orden_compra_id: 21, cantidad: 3 },
    { detalle_orden_compra_id: 22, cantidad: 5 },
  ],
};

const RESULTADO: RecepcionResultado = {
  idempotente: false,
  recepcion_id: 31,
  orden_compra_id: 7,
  estado_orden: 'RECIBIDA',
  unidades_recibidas: 8,
  stock: [
    { inventario_id: 101, stock_actual: 14, stock_reservado: 0 },
    { inventario_id: 102, stock_actual: 5, stock_reservado: 0 },
  ],
  operacion_id: OPERACION,
};

const TRANSICION: TransicionOrdenCompra = {
  idempotente: false,
  orden_compra_id: 7,
  estado: 'ENVIADA',
};

describe('SaasComprasService', () => {
  let service: SaasComprasService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(SaasComprasService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
  });

  function esperar(url: string) {
    return http.expectOne((peticion) => peticion.url === url);
  }

  // ================================ Listado ===============================

  it('listar envía estado y paginación exactos', () => {
    let resultado: OrdenCompraResumen[] | undefined;
    service
      .listar({ estado: 'PARCIAL', limit: 50, offset: 100 })
      .subscribe((valor) => (resultado = valor));

    const peticion = esperar(BASE);
    expect(peticion.request.method).toBe('GET');
    expect(peticion.request.params.get('estado')).toBe('PARCIAL');
    expect(peticion.request.params.get('limit')).toBe('50');
    expect(peticion.request.params.get('offset')).toBe('100');
    expect(peticion.request.params.keys().sort()).toEqual([
      'estado',
      'limit',
      'offset',
    ]);
    peticion.flush([ORDEN]);

    expect(resultado).toEqual([ORDEN]);
  });

  it('listar envía proveedor_id y sucursal_id válidos', () => {
    service
      .listar({ proveedor_id: 3, sucursal_id: 4, limit: 50, offset: 0 })
      .subscribe();

    const peticion = esperar(BASE);
    expect(peticion.request.params.get('proveedor_id')).toBe('3');
    expect(peticion.request.params.get('sucursal_id')).toBe('4');
    expect(peticion.request.params.keys().sort()).toEqual([
      'limit',
      'offset',
      'proveedor_id',
      'sucursal_id',
    ]);
    peticion.flush([]);
  });

  it('listar omite filtros nulos o inválidos', () => {
    service
      .listar({
        estado: null,
        proveedor_id: null,
        sucursal_id: 0,
        limit: 50,
        offset: 0,
      })
      .subscribe();

    const peticion = esperar(BASE);
    expect(peticion.request.params.keys().sort()).toEqual([
      'limit',
      'offset',
    ]);
    peticion.flush([]);
  });

  it('listar sin filtros no agrega query params', () => {
    service.listar().subscribe();
    const peticion = esperar(BASE);

    expect(peticion.request.urlWithParams).toBe(BASE);
    peticion.flush([]);
  });

  it('obtener usa GET y la URL exacta del detalle', () => {
    let resultado: OrdenCompraDetalle | undefined;
    service.obtener(7).subscribe((valor) => (resultado = valor));

    const peticion = esperar(`${BASE}/7`);
    expect(peticion.request.method).toBe('GET');
    peticion.flush(DETALLE);

    expect(resultado?.lineas.length).toBe(2);
    expect(resultado?.estado).toBe('BORRADOR');
  });

  // =============================== Transiciones ===========================

  it('enviar hace POST SIN cuerpo', () => {
    let resultado: TransicionOrdenCompra | undefined;
    service.enviar(7).subscribe((valor) => (resultado = valor));

    const peticion = esperar(`${BASE}/7/enviar`);
    expect(peticion.request.method).toBe('POST');
    expect(peticion.request.body).toBeNull();
    peticion.flush(TRANSICION);

    expect(resultado).toEqual(TRANSICION);
  });

  it('cancelar envía la observación exacta', () => {
    service.cancelar(7, 'Proveedor sin stock').subscribe();

    const peticion = esperar(`${BASE}/7/cancelar`);
    expect(peticion.request.method).toBe('POST');
    expect(peticion.request.body).toEqual({
      observacion: 'Proveedor sin stock',
    });
    peticion.flush({ ...TRANSICION, estado: 'CANCELADA' });
  });

  it('cancelar sin observación envía {} y nunca un cuerpo nulo', () => {
    service.cancelar(7).subscribe();

    const peticion = esperar(`${BASE}/7/cancelar`);
    expect(peticion.request.body).toEqual({});
    expect(peticion.request.body).not.toBeNull();
    peticion.flush({ ...TRANSICION, estado: 'CANCELADA' });
  });

  // =============================== Recepción ==============================

  it('recepcionar envía el UUID y las líneas exactas', () => {
    let resultado: RecepcionResultado | undefined;
    service
      .recepcionar(7, SOLICITUD)
      .subscribe((valor) => (resultado = valor));

    const peticion = esperar(`${BASE}/7/recepciones`);
    expect(peticion.request.method).toBe('POST');
    expect(peticion.request.body).toEqual({
      operacion_id: OPERACION,
      observacion: 'Llegó completo',
      lineas: [
        { detalle_orden_compra_id: 21, cantidad: 3 },
        { detalle_orden_compra_id: 22, cantidad: 5 },
      ],
    });
    peticion.flush(RESULTADO, { status: 201, statusText: 'Created' });

    expect(resultado).toEqual(RESULTADO);
  });

  it('recepcionar omite observacion cuando no se envía', () => {
    service
      .recepcionar(7, {
        operacion_id: OPERACION,
        lineas: [{ detalle_orden_compra_id: 21, cantidad: 1 }],
      })
      .subscribe();

    const peticion = esperar(`${BASE}/7/recepciones`);
    const cuerpo = peticion.request.body as unknown as Record<string, unknown>;
    expect('observacion' in cuerpo).toBe(false);
    expect(Object.keys(cuerpo).sort()).toEqual(['lineas', 'operacion_id']);
    peticion.flush(RESULTADO);
  });

  it('recepcionar entrega el replay idempotente (HTTP 200)', () => {
    let resultado: RecepcionResultado | undefined;
    let huboError = false;

    service.recepcionar(7, SOLICITUD).subscribe({
      next: (valor) => (resultado = valor),
      error: () => (huboError = true),
    });

    esperar(`${BASE}/7/recepciones`).flush(
      { ...RESULTADO, idempotente: true },
      { status: 200, statusText: 'OK' },
    );

    expect(huboError).toBe(false);
    expect(resultado?.idempotente).toBe(true);
    expect(resultado?.recepcion_id).toBe(31);
  });

  // ================================ Errores ===============================

  it('propaga el 409 de operación reutilizada', () => {
    let estado = 0;
    let detalle = '';

    service.recepcionar(7, SOLICITUD).subscribe({
      error: (error: HttpErrorResponse) => {
        estado = error.status;
        detalle = (error.error as { detail?: string }).detail ?? '';
      },
    });

    esperar(`${BASE}/7/recepciones`).flush(
      { detail: 'Conflicto en la orden de compra' },
      { status: 409, statusText: 'Conflict' },
    );

    expect(estado).toBe(409);
    expect(detalle).toBe('Conflicto en la orden de compra');
  });

  it('propaga el 403 de un rol no autorizado', () => {
    let estado = 0;

    service.enviar(7).subscribe({
      error: (error: HttpErrorResponse) => (estado = error.status),
    });

    esperar(`${BASE}/7/enviar`).flush(
      { detail: 'Se requiere personal autorizado' },
      { status: 403, statusText: 'Forbidden' },
    );

    expect(estado).toBe(403);
  });

  it('propaga el 503 con compras SaaS deshabilitadas', () => {
    let estado = 0;
    let detalle = '';

    service.listar({ limit: 50, offset: 0 }).subscribe({
      error: (error: HttpErrorResponse) => {
        estado = error.status;
        detalle = (error.error as { detail?: string }).detail ?? '';
      },
    });

    esperar(BASE).flush(
      { detail: 'Compras SaaS aun no habilitadas' },
      { status: 503, statusText: 'Service Unavailable' },
    );

    expect(estado).toBe(503);
    expect(detalle).toBe('Compras SaaS aun no habilitadas');
  });

  // ======================= 5BZ: alta de orden ============================

  it('crearOrden hace POST con el cuerpo exacto del contrato', () => {
    const dto: OrdenCompraCrear = {
      proveedor_id: 3,
      sucursal_id: 4,
      fecha_estimada: '2026-11-01T10:30:00.000Z',
      observacion: 'Reposición de temporada',
      lineas: [
        {
          variante_producto_id: 9,
          temporada_id: 2,
          cantidad: 10,
          costo_unitario: 45.5,
        },
      ],
    };
    let resultado: OrdenCompraCreada | undefined;
    service.crearOrden(dto).subscribe((valor) => (resultado = valor));

    const peticion = esperar(BASE);
    expect(peticion.request.method).toBe('POST');
    expect(peticion.request.body).toEqual(dto);
    peticion.flush(ORDEN_CREADA, { status: 201, statusText: 'Created' });

    expect(resultado?.orden_compra_id).toBe(7);
  });

  it('crearOrden omite fecha y observación cuando no se envían', () => {
    service
      .crearOrden({
        proveedor_id: 3,
        sucursal_id: 4,
        lineas: [
          {
            variante_producto_id: 9,
            temporada_id: 2,
            cantidad: 1,
            costo_unitario: 0,
          },
        ],
      })
      .subscribe();

    const peticion = esperar(BASE);
    const cuerpo = peticion.request.body as unknown as Record<string, unknown>;
    expect(Object.keys(cuerpo)).toEqual([
      'proveedor_id',
      'sucursal_id',
      'lineas',
    ]);
    peticion.flush(ORDEN_CREADA);
  });

  it('crearOrden propaga el 422 de validación', () => {
    let estado = 0;
    service
      .crearOrden({ proveedor_id: 0, sucursal_id: 4, lineas: [] })
      .subscribe({
        error: (error: HttpErrorResponse) => (estado = error.status),
      });

    esperar(BASE).flush(
      {
        detail: [
          {
            type: 'greater_than',
            loc: ['body', 'proveedor_id'],
            msg: 'Input should be greater than 0',
          },
        ],
      },
      { status: 422, statusText: 'Unprocessable Entity' },
    );

    expect(estado).toBe(422);
  });
});
