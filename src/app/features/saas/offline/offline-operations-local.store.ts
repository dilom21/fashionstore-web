import { Injectable, inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { TenantApiService, TenantIdentidad } from '../services/tenant-api.service';
import { OfflineOperationRecord, OfflineOperationStatus } from './offline-operation.models';

@Injectable({ providedIn: 'root' })
export class OfflineOperationsLocalStore {
  private readonly platform = inject(PLATFORM_ID);
  private readonly tenant = inject(TenantApiService);
  private readonly dbName = 'fashionstore-cu21-cu22-local';
  private readonly storeName = 'offline_operations';

  async read(status?: OfflineOperationStatus): Promise<OfflineOperationRecord[]> {
    if (!isPlatformBrowser(this.platform)) return [];
    const identity = this.tenant.identidad();
    if (!identity) return [];
    const db = await this.open();
    try {
      const rows = await new Promise<OfflineOperationRecord[]>((resolve, reject) => {
        const request = db.transaction(this.storeName, 'readonly').objectStore(this.storeName).getAll();
        request.onsuccess = () => resolve((request.result as OfflineOperationRecord[]).filter(row => row.scope_key === this.scope(identity) && (!status || row.status === status)));
        request.onerror = () => reject(request.error ?? new Error('No se pudo leer la cola local'));
      });
      return rows.sort((a, b) => b.created_at.localeCompare(a.created_at));
    } finally { db.close(); }
  }

  private scope(identity: TenantIdentidad): string {
    return `${identity.empresa_id}:${identity.usuario_id}:${identity.sucursal_id ?? 'todas'}`;
  }

  private open(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(this.storeName)) db.createObjectStore(this.storeName, { keyPath: 'operation_id' });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('No se pudo abrir la cola local'));
    });
  }
}
