import { Injectable } from '@angular/core';

import {
  OfflineDisponibilidad,
  OfflineOperacion,
  OfflineProducto,
  OfflineSnapshot,
  OfflineSucursal,
  OfflineVariante,
} from './offline.models';

export const OFFLINE_DB_NAME = 'fashionstore-cu17';
export const OFFLINE_DB_VERSION = 2;

const CATALOG_STORES = [
  'productos',
  'variantes',
  'disponibilidad',
  'sucursales',
] as const;

type CatalogStore = (typeof CATALOG_STORES)[number];

@Injectable({ providedIn: 'root' })
export class OfflineDbService {
  private dbPromise?: Promise<IDBDatabase>;

  private db(): Promise<IDBDatabase> {
    if (typeof indexedDB === 'undefined') {
      return Promise.reject(
        new Error('IndexedDB no está disponible en este navegador.'),
      );
    }
    return (this.dbPromise ??= new Promise((resolve, reject) => {
      const request = indexedDB.open(OFFLINE_DB_NAME, OFFLINE_DB_VERSION);
      request.onerror = () =>
        reject(request.error ?? new Error('No se pudo abrir IndexedDB.'));
      request.onblocked = () =>
        reject(
          new Error(
            'Cierra otras pestañas de FashionStore para actualizar los datos offline.',
          ),
        );
      request.onupgradeneeded = (event) => {
        const db = request.result;
        const tx = request.transaction!;
        const stores: [string, IDBObjectStoreParameters][] = [
          ['snapshots', { keyPath: 'key' }],
          ['productos', { keyPath: 'id' }],
          ['variantes', { keyPath: 'id' }],
          ['disponibilidad', { keyPath: 'id' }],
          ['sucursales', { keyPath: 'id' }],
          ['metadatos', { keyPath: 'key' }],
        ];
        for (const [name, options] of stores) {
          const store = db.objectStoreNames.contains(name)
            ? tx.objectStore(name)
            : db.createObjectStore(name, options);
          if (
            name !== 'snapshots' &&
            name !== 'metadatos' &&
            !store.indexNames.contains('snapshot_key')
          ) {
            store.createIndex('snapshot_key', 'snapshot_key');
          }
        }

        if (!db.objectStoreNames.contains('operaciones')) {
          const operaciones = db.createObjectStore('operaciones', {
            keyPath: 'operacion_uuid',
          });
          operaciones.createIndex('scope_key', 'scope_key');
          operaciones.createIndex('estado', 'estado');
          operaciones.createIndex('tipo', 'tipo');
          operaciones.createIndex('created_at', 'created_at');
        }

        // V1 usaba IDs remotos como keyPath. Se convierten en claves compuestas
        // sin borrar filas ni recrear la base, evitando cruces entre ámbitos.
        if ((event.oldVersion ?? 0) < 2) {
          this.migrateV1Catalog(tx);
        }
      };
      request.onsuccess = () => {
        request.result.onversionchange = () => request.result.close();
        resolve(request.result);
      };
    }));
  }

  private migrateV1Catalog(tx: IDBTransaction): void {
    const migrate = (
      storeName: CatalogStore,
      remoteField: 'producto_id' | 'variante_id' | 'sucursal_id',
    ): void => {
      const store = tx.objectStore(storeName);
      store.openCursor().onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue | null>)
          .result;
        if (!cursor) return;
        const value = cursor.value as Record<string, unknown>;
        if (typeof value['id'] === 'number' && value['snapshot_key']) {
          const remoteId = value['id'];
          const migrated = {
            ...value,
            [remoteField]: remoteId,
            id: `${String(value['snapshot_key'])}:${remoteId}`,
          };
          cursor.delete();
          store.put(migrated);
        }
        cursor.continue();
      };
    };
    migrate('productos', 'producto_id');
    migrate('variantes', 'variante_id');
    migrate('sucursales', 'sucursal_id');
  }

  async getSnapshot(key: string): Promise<OfflineSnapshot | undefined> {
    const db = await this.db();
    return this.request<OfflineSnapshot | undefined>(
      db.transaction('snapshots').objectStore('snapshots').get(key),
    );
  }

  async getRows<T extends { snapshot_key: string }>(
    storeName: CatalogStore,
    snapshotKey: string,
  ): Promise<T[]> {
    const db = await this.db();
    const request = db
      .transaction(storeName)
      .objectStore(storeName)
      .index('snapshot_key')
      .getAll(IDBKeyRange.only(snapshotKey));
    return (await this.request<unknown[]>(request)) as T[];
  }

  async readSnapshotRows(snapshotKey: string): Promise<{
    snapshot?: OfflineSnapshot;
    productos: OfflineProducto[];
    variantes: OfflineVariante[];
    disponibilidad: OfflineDisponibilidad[];
    sucursales: OfflineSucursal[];
  }> {
    const [snapshot, productos, variantes, disponibilidad, sucursales] =
      await Promise.all([
        this.getSnapshot(snapshotKey),
        this.getRows<OfflineProducto>('productos', snapshotKey),
        this.getRows<OfflineVariante>('variantes', snapshotKey),
        this.getRows<OfflineDisponibilidad>('disponibilidad', snapshotKey),
        this.getRows<OfflineSucursal>('sucursales', snapshotKey),
      ]);
    return { snapshot, productos, variantes, disponibilidad, sucursales };
  }

  /** Sustituye una instantánea en una sola transacción; un aborto conserva V1. */
  async replaceSnapshot(
    snapshot: OfflineSnapshot,
    productos: OfflineProducto[],
    variantes: OfflineVariante[],
    disponibilidad: OfflineDisponibilidad[],
    sucursales: OfflineSucursal[],
  ): Promise<void> {
    const db = await this.db();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(
        ['snapshots', ...CATALOG_STORES],
        'readwrite',
      );
      let pendientes = CATALOG_STORES.length;
      const rows = { productos, variantes, disponibilidad, sucursales };
      for (const name of CATALOG_STORES) {
        const store = tx.objectStore(name);
        const keys = store
          .index('snapshot_key')
          .getAllKeys(IDBKeyRange.only(snapshot.key));
        keys.onsuccess = () => {
          for (const key of keys.result) store.delete(key);
          pendientes -= 1;
          if (pendientes !== 0) return;
          for (const storeName of CATALOG_STORES) {
            for (const row of rows[storeName]) {
              tx.objectStore(storeName).put(row);
            }
          }
          tx.objectStore('snapshots').put(snapshot);
        };
        keys.onerror = () => tx.abort();
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () =>
        reject(tx.error ?? new Error('No se pudo confirmar la descarga.'));
      tx.onabort = () =>
        reject(tx.error ?? new Error('La descarga local fue revertida.'));
    });
  }

  /** `add` hace que un UUID repetido falle en vez de sobrescribir evidencia. */
  async addOperacion(operacion: OfflineOperacion): Promise<void> {
    const db = await this.db();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('operaciones', 'readwrite');
      tx.objectStore('operaciones').add(operacion);
      tx.oncomplete = () => resolve();
      tx.onerror = () =>
        reject(tx.error ?? new Error('No se pudo guardar la operación.'));
      tx.onabort = () =>
        reject(tx.error ?? new Error('La operación local fue revertida.'));
    });
  }

  async listOperaciones(scopeKey: string): Promise<OfflineOperacion[]> {
    const db = await this.db();
    const rows = await this.request<OfflineOperacion[]>(
      db
        .transaction('operaciones')
        .objectStore('operaciones')
        .index('scope_key')
        .getAll(IDBKeyRange.only(scopeKey)),
    );
    return rows.sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  private request<T>(request: IDBRequest): Promise<T> {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result as T);
      request.onerror = () =>
        reject(request.error ?? new Error('Falló una operación de IndexedDB.'));
    });
  }
}
