import 'fake-indexeddb/auto';

import { TestBed } from '@angular/core/testing';

import {
  NOMBRE_BD_OFFLINE,
  SaasOfflineDbService,
  VERSION_ESQUEMA_OFFLINE,
} from './offline-db.service';
import {
  OPERACION_A,
  OPERACION_B,
  SCOPE_A,
  SCOPE_B,
  resetearIndexedDb,
} from './offline-test.utils';

describe('SaasOfflineDbService (IndexedDB)', () => {
  let db: SaasOfflineDbService;

  beforeEach(() => {
    resetearIndexedDb();
    TestBed.configureTestingModule({});
    db = TestBed.inject(SaasOfflineDbService);
  });

  it('crea el esquema versionado en la primera apertura', async () => {
    expect(VERSION_ESQUEMA_OFFLINE).toBe(1);
    const conexion = await db.abrir();
    expect(conexion).not.toBeNull();
    expect(conexion?.name).toBe(NOMBRE_BD_OFFLINE);
    expect(conexion?.version).toBe(VERSION_ESQUEMA_OFFLINE);
    expect(Array.from(conexion?.objectStoreNames ?? []).sort()).toEqual([
      'cache',
      'meta',
      'operaciones',
    ]);
  });

  it('conserva las operaciones tras cerrar y reabrir la base', async () => {
    await db.guardarOperacion(OPERACION_A);

    const primera = await db.abrir();
    primera?.close();

    // Un servicio nuevo simula la reapertura de la aplicación.
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    const reabierta = TestBed.inject(SaasOfflineDbService);
    const operaciones = await reabierta.listarOperaciones(SCOPE_A);

    expect(operaciones).toHaveLength(1);
    expect(operaciones[0].operacion_id).toBe(OPERACION_A.operacion_id);
  });

  it('separa las operaciones por empresa y usuario', async () => {
    await db.guardarOperacion(OPERACION_A);
    await db.guardarOperacion(OPERACION_B);

    const a = await db.listarOperaciones(SCOPE_A);
    const b = await db.listarOperaciones(SCOPE_B);

    expect(a.map((operacion) => operacion.operacion_id)).toEqual([
      OPERACION_A.operacion_id,
    ]);
    expect(b.map((operacion) => operacion.operacion_id)).toEqual([
      OPERACION_B.operacion_id,
    ]);
  });

  it('deduplica por operacion_id: el mismo UUID reemplaza, no duplica', async () => {
    await db.guardarOperacion(OPERACION_A);
    await db.guardarOperacion({
      ...OPERACION_A,
      estado: 'CONFIRMADO',
    });

    const operaciones = await db.listarOperaciones(SCOPE_A);
    expect(operaciones).toHaveLength(1);
    expect(operaciones[0].estado).toBe('CONFIRMADO');
  });

  it('limpiarScope borra solo la empresa indicada', async () => {
    await db.guardarOperacion(OPERACION_A);
    await db.guardarOperacion(OPERACION_B);

    await db.limpiarScope(SCOPE_A);

    expect(await db.listarOperaciones(SCOPE_A)).toEqual([]);
    expect(await db.listarOperaciones(SCOPE_B)).toHaveLength(1);
  });

  it('limpiarTodo borra operaciones, caché y metadatos', async () => {
    await db.guardarOperacion(OPERACION_A);
    await db.guardarCache({
      clave: '1:10:inventario:4',
      tipo: 'inventario',
      detalle: '4',
      empresa_id: 1,
      usuario_id: 10,
      actualizado_en: '2026-10-31T10:00:00.000Z',
      datos: [],
    });
    await db.escribirMeta('scope_activo', SCOPE_A);

    await db.limpiarTodo();

    expect(await db.listarOperaciones(SCOPE_A)).toEqual([]);
    expect(await db.leerCache('1:10:inventario:4')).toBeNull();
    expect(await db.leerMeta('scope_activo')).toBeNull();
  });

  it('la caché de inventario se aísla por scope', async () => {
    await db.guardarCache({
      clave: '1:10:inventario:4',
      tipo: 'inventario',
      detalle: '4',
      empresa_id: 1,
      usuario_id: 10,
      actualizado_en: '2026-10-31T10:00:00.000Z',
      datos: [{ id: 101 }],
    });

    expect(await db.leerCache('1:10:inventario:4')).toEqual({
      clave: '1:10:inventario:4',
      tipo: 'inventario',
      detalle: '4',
      empresa_id: 1,
      usuario_id: 10,
      actualizado_en: '2026-10-31T10:00:00.000Z',
      datos: [{ id: 101 }],
    });
    expect(await db.leerCache('2:20:inventario:4')).toBeNull();
  });

  it('no guarda tokens ni secretos en la operación', async () => {
    await db.guardarOperacion(OPERACION_A);
    const [operacion] = await db.listarOperaciones(SCOPE_A);

    const serializada = JSON.stringify(operacion);
    expect(serializada).not.toMatch(/access_token|Authorization|password/i);
    expect(Object.keys(operacion).sort()).toEqual(
      [
        'actualizada_en',
        'conflicto',
        'creada_en',
        'empresa_id',
        'empresa_slug',
        'estado',
        'intentos',
        'operacion_id',
        'payload',
        'proximo_intento_en',
        'resultado',
        'tipo',
        'ultimo_error',
        'usuario_id',
      ].sort(),
    );
  });
});
