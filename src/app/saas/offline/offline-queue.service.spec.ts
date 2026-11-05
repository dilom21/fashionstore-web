import 'fake-indexeddb/auto';

import { WritableSignal, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';

import { TenantMe } from '../models/tenant.models';
import { SaasSessionService } from '../services/saas-session.service';
import { SaasOfflineDbService } from './offline-db.service';
import { SaasOfflineQueueService } from './offline-queue.service';
import {
  OPERACION_VENTA,
  SCOPE_A,
  SCOPE_B,
  resetearIndexedDb,
} from './offline-test.utils';

function identidad(scope: typeof SCOPE_A): TenantMe {
  return {
    usuario_id: scope.usuario_id,
    empresa_id: scope.empresa_id,
    empresa_slug: scope.empresa_slug,
    empresa_nombre: 'Empresa de prueba',
    rol: 'ADMINISTRADOR',
    contexto: 'personal',
    plan_codigo: 'PRO',
    permite_reportes_ia: true,
  };
}

const OPERACION_ID = OPERACION_VENTA;

describe('SaasOfflineQueueService', () => {
  let queue: SaasOfflineQueueService;
  let db: SaasOfflineDbService;
  let sesion: WritableSignal<TenantMe | null>;

  beforeEach(() => {
    resetearIndexedDb();
    sesion = signal<TenantMe | null>(null);
    const sesionFalsa = { sesion: sesion.asReadonly() };
    TestBed.configureTestingModule({
      providers: [
        { provide: SaasSessionService, useValue: sesionFalsa },
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });
    queue = TestBed.inject(SaasOfflineQueueService);
    db = TestBed.inject(SaasOfflineDbService);
  });

  const payloadVenta = {
    sucursal_id: 4,
    metodo_pago: 'EFECTIVO' as const,
    lineas: [{ inventario_id: 101, cantidad: 2 }],
  };

  it('deduplica por UUID: encolar dos veces no crea otra operación', async () => {
    sesion.set(identidad(SCOPE_A));

    const primera = await queue.encolar(
      'VENTA_CONTADO',
      payloadVenta,
      OPERACION_ID,
    );
    const segunda = await queue.encolar(
      'VENTA_CONTADO',
      payloadVenta,
      OPERACION_ID,
    );

    expect(segunda.operacion_id).toBe(primera.operacion_id);
    expect(queue.operaciones()).toHaveLength(1);
    expect(await db.listarOperaciones(SCOPE_A)).toHaveLength(1);
  });

  it('sin sesión no inventa scope y rechaza la operación', async () => {
    await expect(
      queue.encolar('VENTA_CONTADO', payloadVenta, OPERACION_ID),
    ).rejects.toThrow(/sesión de empresa activa/i);
  });

  it('separa por empresa: la empresa B no ve ni conserva la cola de A', async () => {
    sesion.set(identidad(SCOPE_A));
    await queue.encolar('VENTA_CONTADO', payloadVenta, OPERACION_ID);
    expect(queue.operaciones()).toHaveLength(1);

    // La sesión cambia de empresa: el scope anterior se limpia.
    sesion.set({
      ...identidad(SCOPE_B),
      contexto: 'personal',
    });
    await queue.cargar();

    expect(queue.operaciones()).toEqual([]);
    expect(await db.listarOperaciones(SCOPE_A)).toEqual([]);

    await queue.encolar(
      'RESERVA_CREAR',
      {
        carrito_id: 77,
        fecha_atencion: '2026-11-01T15:00:00.000Z',
      },
      '7c9e6679-7425-40de-944b-e07fc1f90ae7',
    );

    expect(queue.operaciones()).toHaveLength(1);
    expect(queue.operaciones()[0].empresa_id).toBe(SCOPE_B.empresa_id);
    expect(await db.listarOperaciones(SCOPE_A)).toEqual([]);
  });

  it('aplica backoff acotado y marca ERROR tras el máximo de intentos', async () => {
    sesion.set(identidad(SCOPE_A));
    await queue.encolar('VENTA_CONTADO', payloadVenta, OPERACION_ID);

    const antes = Date.now();
    for (let intento = 1; intento <= 5; intento += 1) {
      await queue.reprogramar(OPERACION_ID, `fallo ${intento}`);
    }

    const operacion = queue.operaciones()[0];
    expect(operacion.estado).toBe('ERROR');
    expect(operacion.intentos).toBe(5);
    expect(operacion.proximo_intento_en).toBeNull();
    expect(Date.parse(operacion.actualizada_en)).toBeGreaterThanOrEqual(antes);
  });

  it('programa el siguiente intento con una espera positiva y creciente', async () => {
    sesion.set(identidad(SCOPE_A));
    await queue.encolar('VENTA_CONTADO', payloadVenta, OPERACION_ID);

    await queue.reprogramar(OPERACION_ID, 'primer fallo');
    const primerBackoff = Date.parse(
      queue.operaciones()[0].proximo_intento_en ?? '',
    );
    expect(primerBackoff).toBeGreaterThan(Date.now() - 1000);

    await queue.reprogramar(OPERACION_ID, 'segundo fallo');
    const segundoBackoff = Date.parse(
      queue.operaciones()[0].proximo_intento_en ?? '',
    );

    expect(segundoBackoff).toBeGreaterThanOrEqual(primerBackoff);
    expect(queue.operaciones()[0].intentos).toBe(2);
  });

  it('el reintento manual reinicia intentos y limpia el backoff', async () => {
    sesion.set(identidad(SCOPE_A));
    await queue.encolar('VENTA_CONTADO', payloadVenta, OPERACION_ID);
    await queue.reprogramar(OPERACION_ID, 'fallo');
    await queue.reprogramar(OPERACION_ID, 'fallo');

    await queue.reintentar(OPERACION_ID);

    const operacion = queue.operaciones()[0];
    expect(operacion.estado).toBe('PENDIENTE');
    expect(operacion.intentos).toBe(0);
    expect(operacion.proximo_intento_en).toBeNull();
  });

  it('conserva el conflicto con su detalle y no lo borra al marcarlo', async () => {
    sesion.set(identidad(SCOPE_A));
    await queue.encolar('VENTA_CONTADO', payloadVenta, OPERACION_ID);

    await queue.marcarConflicto(
      OPERACION_ID,
      409,
      'Conflicto de stock en el servidor',
    );

    const operacion = queue.operaciones()[0];
    expect(operacion.estado).toBe('CONFLICTO');
    expect(operacion.conflicto).toEqual({
      codigo: 409,
      detalle: 'Conflicto de stock en el servidor',
    });
    expect(queue.conflictos()).toHaveLength(1);
    expect(queue.pendientes()).toHaveLength(0);

    // Persistió en IndexedDB, no solo en memoria.
    const persistida = await db.obtenerOperacion(OPERACION_ID);
    expect(persistida?.estado).toBe('CONFLICTO');
  });

  it('descartar elimina una operación revisada', async () => {
    sesion.set(identidad(SCOPE_A));
    await queue.encolar('VENTA_CONTADO', payloadVenta, OPERACION_ID);

    await queue.descartar(OPERACION_ID);

    expect(queue.operaciones()).toEqual([]);
    expect(await db.obtenerOperacion(OPERACION_ID)).toBeNull();
  });
});

describe('SaasOfflineQueueService — limpieza al cerrar sesión', () => {
  let db: SaasOfflineDbService;
  let sesion: SaasSessionService;

  beforeEach(() => {
    resetearIndexedDb();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    db = TestBed.inject(SaasOfflineDbService);
    sesion = TestBed.inject(SaasSessionService);
  });

  it('cerrarSesion borra toda la cola y la caché local', async () => {
    await db.guardarOperacion({
      operacion_id: OPERACION_ID,
      tipo: 'VENTA_CONTADO',
      estado: 'PENDIENTE',
      empresa_id: SCOPE_A.empresa_id,
      usuario_id: SCOPE_A.usuario_id,
      empresa_slug: SCOPE_A.empresa_slug,
      creada_en: '2026-10-31T10:00:00.000Z',
      actualizada_en: '2026-10-31T10:00:00.000Z',
      intentos: 0,
      proximo_intento_en: null,
      payload: {
        sucursal_id: 4,
        metodo_pago: 'EFECTIVO',
        lineas: [{ inventario_id: 101, cantidad: 1 }],
      },
      resultado: null,
      conflicto: null,
      ultimo_error: null,
    });
    await db.escribirMeta('scope_activo', SCOPE_A);

    sesion.cerrarSesion();
    await db.esperarUltimaLimpieza();

    expect(await db.listarOperaciones(SCOPE_A)).toEqual([]);
    expect(await db.leerMeta('scope_activo')).toBeNull();
  });
});
