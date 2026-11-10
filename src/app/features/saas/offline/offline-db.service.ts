import { Injectable } from '@angular/core';
import { OfflineDisponibilidad, OfflineProducto, OfflineSnapshot, OfflineSucursal, OfflineVariante } from './offline.models';

const DB_NAME = 'fashionstore-cu17';
const DB_VERSION = 1;

@Injectable({ providedIn: 'root' })
export class OfflineDbService {
  private dbPromise?: Promise<IDBDatabase>;

  private db(): Promise<IDBDatabase> {
    if (typeof indexedDB === 'undefined') return Promise.reject(new Error('IndexedDB no está disponible en este navegador'));
    return this.dbPromise ??= new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onerror = () => reject(request.error ?? new Error('No se pudo abrir IndexedDB'));
      request.onupgradeneeded = () => {
        const db = request.result;
        const stores: [string, IDBObjectStoreParameters][] = [
          ['snapshots', { keyPath: 'key' }], ['productos', { keyPath: 'id' }],
          ['variantes', { keyPath: 'id' }], ['disponibilidad', { keyPath: 'id' }],
          ['sucursales', { keyPath: 'id' }], ['metadatos', { keyPath: 'key' }],
        ];
        for (const [name, options] of stores) {
          const store = db.objectStoreNames.contains(name) ? request.transaction!.objectStore(name) : db.createObjectStore(name, options);
          if (name !== 'snapshots' && name !== 'metadatos' && !store.indexNames.contains('snapshot_key')) store.createIndex('snapshot_key', 'snapshot_key');
        }
      };
      request.onsuccess = () => resolve(request.result);
    });
  }

  async getSnapshot(key: string): Promise<OfflineSnapshot | undefined> {
    const db = await this.db();
    return new Promise((resolve, reject) => { const r = db.transaction('snapshots').objectStore('snapshots').get(key); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
  }

  async getRows<T extends { snapshot_key: string }>(storeName: string, snapshotKey: string): Promise<T[]> {
    const db = await this.db();
    return new Promise((resolve, reject) => {
      const request = db.transaction(storeName).objectStore(storeName).index('snapshot_key').getAll(IDBKeyRange.only(snapshotKey));
      request.onsuccess = () => resolve((request.result ?? []) as T[]);
      request.onerror = () => reject(request.error ?? new Error('No se pudo leer la copia local'));
    });
  }

  async readSnapshotRows(snapshotKey: string): Promise<{
    snapshot?: OfflineSnapshot;
    productos: OfflineProducto[];
    variantes: OfflineVariante[];
    disponibilidad: OfflineDisponibilidad[];
    sucursales: OfflineSucursal[];
  }> {
    const [snapshot, productos, variantes, disponibilidad, sucursales] = await Promise.all([
      this.getSnapshot(snapshotKey),
      this.getRows<OfflineProducto>('productos', snapshotKey),
      this.getRows<OfflineVariante>('variantes', snapshotKey),
      this.getRows<OfflineDisponibilidad>('disponibilidad', snapshotKey),
      this.getRows<OfflineSucursal>('sucursales', snapshotKey),
    ]);
    return { snapshot, productos, variantes, disponibilidad, sucursales };
  }

  async replaceSnapshot(snapshot: OfflineSnapshot, productos: OfflineProducto[], variantes: OfflineVariante[], disponibilidad: OfflineDisponibilidad[], sucursales: OfflineSucursal[]): Promise<void> {
    const db = await this.db();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['snapshots', 'productos', 'variantes', 'disponibilidad', 'sucursales'], 'readwrite');
      const stores = ['productos', 'variantes', 'disponibilidad', 'sucursales'] as const;
      let pendientes = stores.length;
      for (const storeName of stores) {
        const store = tx.objectStore(storeName);
        const request = store.index('snapshot_key').getAllKeys(IDBKeyRange.only(snapshot.key));
        request.onsuccess = () => {
          for (const key of request.result) store.delete(key);
          pendientes--;
          if (pendientes !== 0) return;
          for (const [name, rows] of [['productos', productos], ['variantes', variantes], ['disponibilidad', disponibilidad], ['sucursales', sucursales]] as const) for (const row of rows) tx.objectStore(name).put(row);
          tx.objectStore('snapshots').put(snapshot);
        };
      }
      tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error ?? new Error('No se pudo confirmar la descarga'));
      tx.onabort = () => reject(tx.error ?? new Error('Descarga abortada'));
    });
  }

  async clearScope(empresaId: number, usuarioId: number): Promise<void> {
    const db = await this.db();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['snapshots', 'productos', 'variantes', 'disponibilidad', 'sucursales'], 'readwrite');
      const snapshotStore = tx.objectStore('snapshots');
      snapshotStore.openCursor().onsuccess = (event) => { const cursor = (event.target as IDBRequest).result as IDBCursorWithValue | null; if (!cursor) return; if (cursor.value.empresa_id === empresaId && cursor.value.usuario_id === usuarioId) { const key = cursor.key; for (const n of ['productos','variantes','disponibilidad','sucursales']) { const s = tx.objectStore(n); s.index('snapshot_key').openCursor(IDBKeyRange.only(key)).onsuccess = (e) => { const c = (e.target as IDBRequest).result as IDBCursorWithValue | null; if (c) { c.delete(); c.continue(); } }; } cursor.delete(); } cursor.continue(); };
      tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error);
    });
  }
}
