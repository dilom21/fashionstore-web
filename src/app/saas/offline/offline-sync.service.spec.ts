import 'fake-indexeddb/auto';

import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  TestRequest,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { WritableSignal, computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { environment } from '../../../environments/environment';
import { TenantMe } from '../models/tenant.models';
import { SaasSessionService } from '../services/saas-session.service';
import { SaasOfflineQueueService } from './offline-queue.service';
import { SaasOfflineSyncService } from './offline-sync.service';
import {
  OPERACION_RESERVA,
  OPERACION_VENTA,
  SCOPE_A,
  resetearIndexedDb,
} from './offline-test.utils';

const API = environment.apiUrl.replace(/\/+$/, '');
const URL_CONTADO = `${API}/tenant/ventas/contado`;
const URL_RESERVAS = `${API}/tenant/reservas`;
const URL_RESERVAS_CLIENTE = `${API}/tenant/cliente/reservas`;
const URL_RESERVA_COMERCIAL = `${API}/tenant/comercial/reservas`;

const OPERACION = OPERACION_VENTA;
const RESERVA_OPERACION = OPERACION_RESERVA;

function identidad(
  contexto: TenantMe['contexto'] = 'personal',
): TenantMe {
  return {
    usuario_id: SCOPE_A.usuario_id,
    empresa_id: SCOPE_A.empresa_id,
    empresa_slug: SCOPE_A.empresa_slug,
    empresa_nombre: 'Empresa de prueba',
    rol: contexto === 'cliente' ? 'CLIENTE' : 'ADMINISTRADOR',
    contexto,
    plan_codigo: 'PRO',
    permite_reportes_ia: true,
  };
}

const PAYLOAD_VENTA = {
  sucursal_id: 4,
  metodo_pago: 'EFECTIVO' as const,
  lineas: [{ inventario_id: 101, cantidad: 2 }],
};

const RESPUESTA_VENTA = {
  venta_id: 55,
  pago_id: 66,
  estado: 'COMPLETADA',
  canal: 'PRESENCIAL',
  metodo_pago: 'EFECTIVO',
  total: 240,
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
  ],
  stock: [{ inventario_id: 101, stock_actual: 8, stock_reservado: 0 }],
};

describe('SaasOfflineSyncService', () => {
  let sync: SaasOfflineSyncService;
  let queue: SaasOfflineQueueService;
  let http: HttpTestingController;
  let sesion: WritableSignal<TenantMe | null>;

  beforeEach(() => {
    resetearIndexedDb();
    sesion = signal<TenantMe | null>(identidad('personal'));
    TestBed.configureTestingModule({
      providers: [
        {
          provide: SaasSessionService,
          useValue: {
            sesion: sesion.asReadonly(),
            contexto: computed(() => sesion()?.contexto ?? null),
          },
        },
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });
    sync = TestBed.inject(SaasOfflineSyncService);
    queue = TestBed.inject(SaasOfflineQueueService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
  });

  /** Espera a que la cola (IndexedDB) emita la petición esperada. */
  async function esperarPeticion(
    metodo: string,
    url: string,
  ): Promise<TestRequest> {
    for (let intento = 0; intento < 100; intento += 1) {
      const coincidencias = http.match(
        (peticion) => peticion.method === metodo && peticion.url === url,
      );
      if (coincidencias.length > 0) {
        return coincidencias[0];
      }
      await new Promise((resolver) => setTimeout(resolver, 5));
    }
    throw new Error(`No se emitió ${metodo} ${url}`);
  }

  it('drena una venta con POST /tenant/ventas/contado y la confirma', async () => {
    await queue.encolar('VENTA_CONTADO', PAYLOAD_VENTA, OPERACION);

    const sincronizacion = sync.sincronizar({
      forzar: true,
      autoReintento: false,
    });
    const peticion = await esperarPeticion('POST', URL_CONTADO);
    expect(peticion.request.body).toEqual({
      sucursal_id: 4,
      operacion_id: OPERACION,
      metodo_pago: 'EFECTIVO',
      lineas: [{ inventario_id: 101, cantidad: 2 }],
    });
    peticion.flush(RESPUESTA_VENTA, { status: 201, statusText: 'Created' });

    const resumen = await sincronizacion;
    expect(resumen.confirmadas).toBe(1);
    const operacion = queue.operaciones()[0];
    expect(operacion.estado).toBe('CONFIRMADO');
    expect(operacion.resultado).toEqual({
      referencia_id: 55,
      estado: 'COMPLETADA',
      idempotente: false,
    });
  });

  it('acepta el replay idempotente (HTTP 200) como confirmado', async () => {
    await queue.encolar('VENTA_CONTADO', PAYLOAD_VENTA, OPERACION);

    const sincronizacion = sync.sincronizar({
      forzar: true,
      autoReintento: false,
    });
    const peticion = await esperarPeticion('POST', URL_CONTADO);
    peticion.flush(
      { ...RESPUESTA_VENTA, idempotente: true },
      { status: 200, statusText: 'OK' },
    );

    await sincronizacion;
    const operacion = queue.operaciones()[0];
    expect(operacion.estado).toBe('CONFIRMADO');
    expect(operacion.resultado?.idempotente).toBe(true);
  });

  it('marca CONFLICTO ante un 409 real de stock y conserva el detalle', async () => {
    await queue.encolar('VENTA_CONTADO', PAYLOAD_VENTA, OPERACION);

    const sincronizacion = sync.sincronizar({
      forzar: true,
      autoReintento: false,
    });
    const peticion = await esperarPeticion('POST', URL_CONTADO);
    peticion.flush(
      { detail: 'Conflicto en la venta' },
      { status: 409, statusText: 'Conflict' },
    );

    const resumen = await sincronizacion;
    expect(resumen.conflictos).toBe(1);
    const operacion = queue.operaciones()[0];
    expect(operacion.estado).toBe('CONFLICTO');
    expect(operacion.conflicto).toEqual({
      codigo: 409,
      detalle: 'Conflicto en la venta',
    });
  });

  it('marca CONFIRMADO si el 409 indica que la venta ya estaba registrada', async () => {
    await queue.encolar('VENTA_CONTADO', PAYLOAD_VENTA, OPERACION);

    const sincronizacion = sync.sincronizar({
      forzar: true,
      autoReintento: false,
    });
    const peticion = await esperarPeticion('POST', URL_CONTADO);
    peticion.flush(
      { detail: 'La venta ya estaba registrada (duplicado idempotente)' },
      { status: 409, statusText: 'Conflict' },
    );

    await sincronizacion;
    expect(queue.operaciones()[0].estado).toBe('CONFIRMADO');
  });

  it('reintenta con backoff sin perder el UUID y confirma al recuperar red', async () => {
    await queue.encolar('VENTA_CONTADO', PAYLOAD_VENTA, OPERACION);

    const primerIntento = sync.sincronizar({
      forzar: true,
      autoReintento: false,
    });
    const primeraPeticion = await esperarPeticion('POST', URL_CONTADO);
    primeraPeticion.error(new ProgressEvent('error'));

    const primerResumen = await primerIntento;
    expect(primerResumen.reintentables).toBe(1);

    const trasFallo = queue.operaciones()[0];
    expect(trasFallo.estado).toBe('PENDIENTE');
    expect(trasFallo.intentos).toBe(1);
    expect(trasFallo.proximo_intento_en).not.toBeNull();

    // El reintento reenvía el MISMO operacion_id (replay idempotente).
    const segundoIntento = sync.sincronizar({
      forzar: true,
      autoReintento: false,
    });
    const segundaPeticion = await esperarPeticion('POST', URL_CONTADO);
    expect(
      (segundaPeticion.request.body as { operacion_id: string }).operacion_id,
    ).toBe(OPERACION);
    segundaPeticion.flush(RESPUESTA_VENTA, { status: 201, statusText: 'Created' });

    await segundoIntento;
    expect(queue.operaciones()[0].estado).toBe('CONFIRMADO');
  });

  it('no envía nada sin conexión (motivo sin-conexion)', async () => {
    await queue.encolar('VENTA_CONTADO', PAYLOAD_VENTA, OPERACION);
    window.dispatchEvent(new Event('offline'));

    const resumen = await sync.sincronizar({ forzar: true });
    expect(resumen.motivo).toBe('sin-conexion');
    expect(resumen.ejecutada).toBe(false);
    http.expectNone(URL_CONTADO);
  });

  it('confirma una reserva ya registrada sin duplicarla (mismo carrito y hora)', async () => {
    sesion.set(identidad('cliente'));
    await queue.encolar(
      'RESERVA_CREAR',
      {
        carrito_id: 77,
        fecha_atencion: '2026-11-01T15:00:00.000Z',
      },
      RESERVA_OPERACION,
    );
    // Simula un intento previo cuya respuesta se perdió.
    await queue.marcarEnviado(RESERVA_OPERACION);
    await queue.reprogramar(RESERVA_OPERACION, 'timeout');

    const sincronizacion = sync.sincronizar({
      forzar: true,
      autoReintento: false,
    });
    const consulta = await esperarPeticion('GET', URL_RESERVAS_CLIENTE);
    consulta.flush([
      {
        reserva_id: 90,
        carrito_id: 77,
        sucursal_id: 4,
        sucursal_nombre: 'Centro',
        fecha_reserva: '2026-10-31T10:00:00.000Z',
        fecha_atencion: '2026-11-01T15:00:00.000Z',
        estado: 'PENDIENTE',
        observacion: null,
        cantidad_lineas: 1,
        cantidad_unidades: 1,
      },
    ]);

    await sincronizacion;
    http.expectNone(URL_RESERVAS);

    const operacion = queue.operaciones()[0];
    expect(operacion.estado).toBe('CONFIRMADO');
    expect(operacion.resultado).toEqual({
      referencia_id: 90,
      estado: 'PENDIENTE',
      idempotente: true,
    });
  });

  it('marca CONFLICTO una reserva rechazada sin duplicado en el servidor', async () => {
    sesion.set(identidad('cliente'));
    await queue.encolar(
      'RESERVA_CREAR',
      {
        carrito_id: 77,
        fecha_atencion: '2026-11-01T15:00:00.000Z',
      },
      RESERVA_OPERACION,
    );

    const sincronizacion = sync.sincronizar({
      forzar: true,
      autoReintento: false,
    });
    const alta = await esperarPeticion('POST', URL_RESERVAS);
    alta.flush(
      { detail: 'Reserva en conflicto' },
      { status: 409, statusText: 'Conflict' },
    );

    const consulta = await esperarPeticion('GET', URL_RESERVAS_CLIENTE);
    consulta.flush([]);

    const resumen = await sincronizacion;
    expect(resumen.conflictos).toBe(1);
    expect(queue.operaciones()[0].estado).toBe('CONFLICTO');
    http.expectNone(URL_RESERVAS);
  });

  it('confirma una cancelación ya aplicada aunque el PATCH responda 409', async () => {
    await queue.encolar(
      'RESERVA_CANCELAR',
      { reserva_id: 12 },
      '1b4e28ba-2fa1-11d2-883f-0016d3cca427',
    );

    const sincronizacion = sync.sincronizar({
      forzar: true,
      autoReintento: false,
    });
    const patch = await esperarPeticion(
      'PATCH',
      `${URL_RESERVAS}/12/cancelar`,
    );
    expect(patch.request.body).toEqual({});
    patch.flush(
      { detail: 'Estado de reserva inconsistente' },
      { status: 409, statusText: 'Conflict' },
    );

    const consulta = await esperarPeticion(
      'GET',
      `${URL_RESERVA_COMERCIAL}/12`,
    );
    consulta.flush({ id: 12, estado: 'CANCELADA' });

    const resumen = await sincronizacion;
    expect(resumen.confirmadas).toBe(1);
    expect(queue.operaciones()[0].estado).toBe('CONFIRMADO');
    expect(queue.operaciones()[0].resultado?.referencia_id).toBe(12);
  });

  it('marca ERROR definitivo ante un 503 del módulo deshabilitado', async () => {
    await queue.encolar('VENTA_CONTADO', PAYLOAD_VENTA, OPERACION);

    const sincronizacion = sync.sincronizar({
      forzar: true,
      autoReintento: false,
    });
    const peticion = await esperarPeticion('POST', URL_CONTADO);
    peticion.flush(
      { detail: 'Ventas SaaS aun no habilitadas' },
      { status: 503, statusText: 'Service Unavailable' },
    );

    const resumen = await sincronizacion;
    expect(resumen.errores).toBe(1);
    expect(queue.operaciones()[0].estado).toBe('ERROR');
    expect(queue.operaciones()[0].intentos).toBe(0);
  });

  it('no usa rutas legacy: todas las peticiones son /tenant/**', async () => {
    await queue.encolar('VENTA_CONTADO', PAYLOAD_VENTA, OPERACION);

    const sincronizacion = sync.sincronizar({
      forzar: true,
      autoReintento: false,
    });
    const peticion = await esperarPeticion('POST', URL_CONTADO);
    expect(peticion.request.url.startsWith(`${API}/tenant/`)).toBe(true);
    expect(peticion.request.url).not.toMatch(/\/ventas\/presencial|\/pagos/);
    peticion.flush(RESPUESTA_VENTA, { status: 201, statusText: 'Created' });

    await sincronizacion;
  });
});
