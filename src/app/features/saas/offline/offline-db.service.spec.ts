import 'fake-indexeddb/auto';

import { beforeAll, describe, expect, it } from 'vitest';

import { OfflineDbService, OFFLINE_DB_NAME } from './offline-db.service';
import { OfflineOperacion, OfflineSnapshot } from './offline.models';

const scope = '3:personal:12:2';
const snapshot = (version: string): OfflineSnapshot => ({
  key: scope,
  schema_version: 2,
  empresa_id: 3,
  empresa_slug: 'moda-sur',
  usuario_id: 12,
  contexto: 'personal',
  sucursal_id: 2,
  generado_en: version,
  version_datos: version,
  download_started_at: version,
  download_completed_at: version,
  last_successful_sync_at: version,
  expires_at: null,
  estado: 'DISPONIBLE_LOCAL',
  source: 'test',
  counts: { productos: 1, variantes: 0, disponibilidad: 0, sucursales: 0 },
});

function abrirV1(): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(OFFLINE_DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      db.createObjectStore('snapshots', { keyPath: 'key' });
      for (const name of ['productos', 'variantes', 'disponibilidad', 'sucursales']) {
        const store = db.createObjectStore(name, { keyPath: 'id' });
        store.createIndex('snapshot_key', 'snapshot_key');
      }
      db.createObjectStore('metadatos', { keyPath: 'key' });
      request.transaction!.objectStore('snapshots').put({ ...snapshot('v1'), schema_version: 1 });
      request.transaction!.objectStore('productos').put({ id: 7, empresa_id: 3, nombre: 'Abrigo', precio: 20, categoria_id: 1, snapshot_key: scope });
    };
    request.onsuccess = () => { request.result.close(); resolve(); };
    request.onerror = () => reject(request.error);
  });
}

describe('OfflineDbService migración V1 -> V2', () => {
  let db: OfflineDbService;

  beforeAll(async () => {
    await new Promise<void>((resolve) => {
      const request = indexedDB.deleteDatabase(OFFLINE_DB_NAME);
      request.onsuccess = () => resolve();
      request.onerror = () => resolve();
    });
    await abrirV1();
    db = new OfflineDbService();
  });

  it('preserva y convierte las filas del catálogo publicado', async () => {
    const rows = await db.readSnapshotRows(scope);
    expect(rows.snapshot?.empresa_id).toBe(3);
    expect(rows.productos).toHaveLength(1);
    expect(rows.productos[0].producto_id).toBe(7);
    expect(rows.productos[0].id).toBe(`${scope}:7`);
  });

  it('confirma el snapshot completo atómicamente', async () => {
    await db.replaceSnapshot(
      snapshot('v2'),
      [{ id: `${scope}:8`, producto_id: 8, empresa_id: 3, nombre: 'Vestido', descripcion: null, precio: 35, categoria_id: 1, categoria_nombre: 'Moda', snapshot_key: scope }],
      [], [], [],
    );
    const rows = await db.readSnapshotRows(scope);
    expect(rows.snapshot?.version_datos).toBe('v2');
    expect(rows.productos.map((row) => row.producto_id)).toEqual([8]);
  });

  it('conserva el snapshot anterior si la nueva escritura aborta', async () => {
    await expect(
      db.replaceSnapshot(snapshot('fallido'), [{ producto_id: 9 } as never], [], [], []),
    ).rejects.toBeTruthy();
    const rows = await db.readSnapshotRows(scope);
    expect(rows.snapshot?.version_datos).toBe('v2');
    expect(rows.productos[0].producto_id).toBe(8);
  });

  it('persiste UUID, rechaza duplicados y aísla operaciones por scope', async () => {
    const operation: OfflineOperacion = {
      operacion_uuid: '9f4c1e8e-7a2b-4f6c-9d2e-3a1b5c7d9e01', uuid: '9f4c1e8e-7a2b-4f6c-9d2e-3a1b5c7d9e01', scope_key: scope,
      tipo: 'VENTA_CONTADO', empresa_id: 3, empresa_slug: 'moda-sur', usuario_id: 12, contexto: 'personal', rol: 'CAJERO', sucursal_id: 2, sucursal_nombre: 'Centro', fecha: '2026-11-10T10:00:00Z', snapshot_key: scope,
      lineas: [{ inventario_id: 5, producto_id: 1, producto_nombre: 'Abrigo', variante_id: 2, sku: 'A-1', talla: 'M', color: 'Negro', cantidad: 1, precio_unitario_provisional: 20 }], importe_provisional: 20, metodo_pago: 'EFECTIVO', efectivo_recibido: '20.00', fecha_atencion: null, observacion: null, cliente_id: null, estado: 'PENDIENTE', intentos: 0, ultimo_error: null, error_codigo: null, id_definitivo: null, resultado: null, created_at: '2026-11-10T10:00:00Z', updated_at: '2026-11-10T10:00:00Z',
    };
    await db.addOperacion(operation);
    await expect(db.addOperacion(operation)).rejects.toBeTruthy();
    expect(await new OfflineDbService().listOperaciones(scope)).toHaveLength(1);
    expect(await db.listOperaciones('otra:empresa:usuario')).toEqual([]);
  });
});
