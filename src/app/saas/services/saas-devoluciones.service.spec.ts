import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { environment } from '../../../environments/environment';
import {
  AccionDevolucionRespuesta,
  DevolucionCreada,
  DevolucionCrear,
  DevolucionDetalle,
  DevolucionProcesada,
  DevolucionResumen,
  VentaLineasTenant,
} from '../models/tenant.models';
import { SaasDevolucionesService } from './saas-devoluciones.service';

const API = environment.apiUrl.replace(/\/+$/, '');
const BASE = `${API}/tenant/devoluciones`;

const OPERACION = '7c9e6679-7425-40de-944b-e07fc1f90ae7';

const LINEAS_VENTA: VentaLineasTenant = {
  venta_id: 55,
  sucursal_id: 4,
  estado: 'COMPLETADA',
  total: 240,
  lineas: [
    {
      detalle_venta_id: 71,
      inventario_id: 101,
      variante_producto_id: 9,
      sku: 'POL-M-BLA',
      producto_nombre: 'Polera oversize',
      talla: 'M',
      color: 'Blanco',
      cantidad: 2,
      precio_unitario: 120,
      cantidad_devuelta: 0,
      cantidad_disponible_devolver: 2,
    },
  ],
};

const DEVOLUCION_CREADA: DevolucionCreada = {
  idempotente: false,
  devolucion_id: 15,
  venta_id: 55,
  estado: 'SOLICITADA',
  motivo: 'Talla incorrecta',
  unidades: 2,
  monto_estimado: 240,
  moneda: 'BOB',
  items: [
    {
      detalle_venta_id: 71,
      inventario_id: 101,
      cantidad: 2,
      reponer: true,
      precio_unitario: 120,
    },
  ],
  reembolso: {
    estado: 'PENDIENTE',
    ejecutado: false,
    medio: 'NO_DISPONIBLE',
    monto: 240,
  },
  stock_modificado: false,
  operacion_id: OPERACION,
};

const RESUMEN: DevolucionResumen = {
  id: 15,
  venta_id: 55,
  fecha_hora: '2026-10-30T16:40:00Z',
  estado: 'SOLICITADA',
  motivo: 'Talla incorrecta',
  observacion: null,
  sucursal_id: 4,
  sucursal_nombre: 'Sucursal Centro',
  venta_total: 240,
  unidades: 2,
  monto_estimado: 240,
};

const DETALLE: DevolucionDetalle = {
  ...RESUMEN,
  items: [
    {
      detalle_devolucion_id: 41,
      detalle_venta_id: 71,
      cantidad: 2,
      motivo: 'Talla incorrecta',
      reponer: true,
      inventario_id: 101,
      precio_unitario: 120,
      sku: 'POL-M-BLA',
      subtotal: 240,
    },
  ],
  reembolso: null,
};

const PROCESADA: DevolucionProcesada = {
  idempotente: false,
  devolucion_id: 15,
  venta_id: 55,
  estado: 'COMPLETADA',
  unidades: 2,
  unidades_repuestas: 2,
  stock: [{ inventario_id: 101, stock_actual: 10, stock_reservado: 0 }],
  reembolso: {
    reembolso_id: 8,
    estado: 'NO_DISPONIBLE',
    ejecutado: false,
    medio: 'NO_DISPONIBLE',
    monto: 240,
    moneda: 'BOB',
  },
  operacion_id: OPERACION,
};

describe('SaasDevolucionesService', () => {
  let service: SaasDevolucionesService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(SaasDevolucionesService);
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
    let resultado: DevolucionResumen[] | undefined;
    service
      .listar({ estado: 'APROBADA', limit: 50, offset: 50 })
      .subscribe((valor) => (resultado = valor));

    const peticion = esperar(BASE);
    expect(peticion.request.method).toBe('GET');
    expect(peticion.request.params.get('estado')).toBe('APROBADA');
    expect(peticion.request.params.get('limit')).toBe('50');
    expect(peticion.request.params.get('offset')).toBe('50');
    expect(peticion.request.params.keys().sort()).toEqual([
      'estado',
      'limit',
      'offset',
    ]);
    peticion.flush([RESUMEN]);

    expect(resultado).toEqual([RESUMEN]);
  });

  it('listar omite el estado nulo y no agrega filtros inventados', () => {
    service.listar({ estado: null, limit: 50, offset: 0 }).subscribe();

    const peticion = esperar(BASE);
    expect(peticion.request.params.keys().sort()).toEqual([
      'limit',
      'offset',
    ]);
    peticion.flush([]);
  });

  it('listar sin argumentos no agrega query params', () => {
    service.listar().subscribe();
    const peticion = esperar(BASE);

    expect(peticion.request.urlWithParams).toBe(BASE);
    peticion.flush([]);
  });

  it('obtener usa GET y devuelve ítems y reembolso nulo', () => {
    let resultado: DevolucionDetalle | undefined;
    service.obtener(15).subscribe((valor) => (resultado = valor));

    const peticion = esperar(`${BASE}/15`);
    expect(peticion.request.method).toBe('GET');
    peticion.flush(DETALLE);

    expect(resultado?.items.length).toBe(1);
    expect(resultado?.reembolso).toBeNull();
  });

  // =============================== Acciones ===============================

  it('aprobar hace POST SIN cuerpo', () => {
    const respuesta: AccionDevolucionRespuesta = {
      idempotente: false,
      devolucion_id: 15,
      estado: 'APROBADA',
    };

    let resultado: AccionDevolucionRespuesta | undefined;
    service.aprobar(15).subscribe((valor) => (resultado = valor));

    const peticion = esperar(`${BASE}/15/aprobar`);
    expect(peticion.request.method).toBe('POST');
    expect(peticion.request.body).toBeNull();
    peticion.flush(respuesta);

    expect(resultado).toEqual(respuesta);
  });

  it('rechazar hace POST SIN cuerpo', () => {
    service.rechazar(15).subscribe();

    const peticion = esperar(`${BASE}/15/rechazar`);
    expect(peticion.request.method).toBe('POST');
    expect(peticion.request.body).toBeNull();
    peticion.flush({ idempotente: true, devolucion_id: 15, estado: 'RECHAZADA' });
  });

  it('procesar envía SOLO el operacion_id', () => {
    let resultado: DevolucionProcesada | undefined;
    service
      .procesar(15, OPERACION)
      .subscribe((valor) => (resultado = valor));

    const peticion = esperar(`${BASE}/15/procesar`);
    expect(peticion.request.method).toBe('POST');
    expect(peticion.request.body).toEqual({ operacion_id: OPERACION });
    expect(Object.keys(peticion.request.body as object)).toEqual([
      'operacion_id',
    ]);
    peticion.flush(PROCESADA, { status: 200, statusText: 'OK' });

    expect(resultado?.unidades_repuestas).toBe(2);
    expect(resultado?.reembolso.medio).toBe('NO_DISPONIBLE');
  });

  // ================================ Errores ===============================

  it('propaga el 409 de conflicto de la devolución', () => {
    let estado = 0;
    let detalle = '';

    service.procesar(15, OPERACION).subscribe({
      error: (error: HttpErrorResponse) => {
        estado = error.status;
        detalle = (error.error as { detail?: string }).detail ?? '';
      },
    });

    esperar(`${BASE}/15/procesar`).flush(
      { detail: 'Conflicto en la devolucion' },
      { status: 409, statusText: 'Conflict' },
    );

    expect(estado).toBe(409);
    expect(detalle).toBe('Conflicto en la devolucion');
  });

  it('propaga el 403 de un rol no autorizado', () => {
    let estado = 0;

    service.aprobar(15).subscribe({
      error: (error: HttpErrorResponse) => (estado = error.status),
    });

    esperar(`${BASE}/15/aprobar`).flush(
      { detail: 'Se requiere personal autorizado' },
      { status: 403, statusText: 'Forbidden' },
    );

    expect(estado).toBe(403);
  });

  it('propaga el 503 con devoluciones SaaS deshabilitadas', () => {
    let estado = 0;
    let detalle = '';

    service.listar({ limit: 50, offset: 0 }).subscribe({
      error: (error: HttpErrorResponse) => {
        estado = error.status;
        detalle = (error.error as { detail?: string }).detail ?? '';
      },
    });

    esperar(BASE).flush(
      { detail: 'Devoluciones SaaS aun no habilitadas' },
      { status: 503, statusText: 'Service Unavailable' },
    );

    expect(estado).toBe(503);
    expect(detalle).toBe('Devoluciones SaaS aun no habilitadas');
  });

  // ===================== 5BZ: líneas por venta y alta =====================

  it('lineasVenta hace GET /ventas/{venta_id}/lineas', () => {
    let resultado: VentaLineasTenant | undefined;
    service.lineasVenta(55).subscribe((valor) => (resultado = valor));

    const peticion = esperar(`${BASE}/ventas/55/lineas`);
    expect(peticion.request.method).toBe('GET');
    expect(peticion.request.urlWithParams).toBe(`${BASE}/ventas/55/lineas`);
    peticion.flush(LINEAS_VENTA);

    expect(resultado).toEqual(LINEAS_VENTA);
  });

  it('lineasVenta propaga el 404 de una venta ajena', () => {
    let estado = 0;
    service.lineasVenta(99).subscribe({
      error: (error: HttpErrorResponse) => (estado = error.status),
    });

    esperar(`${BASE}/ventas/99/lineas`).flush(
      { detail: 'Recurso no encontrado' },
      { status: 404, statusText: 'Not Found' },
    );

    expect(estado).toBe(404);
  });

  it('crear hace POST con el cuerpo exacto del contrato', () => {
    const dto: DevolucionCrear = {
      venta_id: 55,
      motivo: 'Talla incorrecta',
      operacion_id: OPERACION,
      items: [
        {
          detalle_venta_id: 71,
          cantidad: 2,
          reponer: true,
          motivo: 'Queda grande',
        },
      ],
    };
    let resultado: DevolucionCreada | undefined;
    service.crear(dto).subscribe((valor) => (resultado = valor));

    const peticion = esperar(BASE);
    expect(peticion.request.method).toBe('POST');
    expect(peticion.request.body).toEqual(dto);
    peticion.flush(DEVOLUCION_CREADA, {
      status: 201,
      statusText: 'Created',
    });

    expect(resultado?.devolucion_id).toBe(15);
  });

  it('crear omite los campos opcionales ausentes (extra=forbid)', () => {
    service
      .crear({
        venta_id: 55,
        motivo: 'Talla incorrecta',
        operacion_id: OPERACION,
        items: [{ detalle_venta_id: 71, cantidad: 1, reponer: false }],
      })
      .subscribe();

    const peticion = esperar(BASE);
    const cuerpo = peticion.request.body as unknown as Record<string, unknown>;
    expect(Object.keys(cuerpo)).toEqual([
      'venta_id',
      'motivo',
      'operacion_id',
      'items',
    ]);
    const items = cuerpo['items'] as Array<Record<string, unknown>>;
    expect(Object.keys(items[0])).toEqual([
      'detalle_venta_id',
      'cantidad',
      'reponer',
    ]);
    peticion.flush(DEVOLUCION_CREADA);
  });
});
