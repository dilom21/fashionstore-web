import { isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, inject } from '@angular/core';

import {
  CacheLocal,
  OperacionOffline,
  ScopeOffline,
} from './offline.models';

/**
 * Acceso a IndexedDB del canal web (PWA).
 *
 * - La base tiene nombre y versión propios (`fashionstore_saas_offline`, v1).
 * - El esquema se crea en `onupgradeneeded`; una versión futura debe añadir su
 *   rama de migración sin borrar datos existentes.
 * - Los almacenes `operaciones` y `cache` llevan un índice compuesto
 *   `por_scope = [empresa_id, usuario_id]` para listar y limpiar sin mezclar
 *   empresas ni usuarios.
 * - `meta` guarda únicamente el scope activo, sin secretos.
 * - En SSR o sin IndexedDB, todas las operaciones son no-op seguras.
 */

/** Nombre físico de la base local. */
export const NOMBRE_BD_OFFLINE = 'fashionstore_saas_offline';

/** Versión del esquema local. Se incrementa solo con una migración real. */
export const VERSION_ESQUEMA_OFFLINE = 1;

const ALMACEN_OPERACIONES = 'operaciones';
const ALMACEN_CACHE = 'cache';
const ALMACEN_META = 'meta';

const INDICE_SCOPE = 'por_scope';

/** Registro de metadatos (solo valores no sensibles). */
interface RegistroMeta<T> {
  clave: string;
  valor: T;
}

@Injectable({ providedIn: 'root' })
export class SaasOfflineDbService {
  private readonly platformId = inject(PLATFORM_ID);

  private apertura: Promise<IDBDatabase | null> | null = null;
  private ultimaLimpieza: Promise<void> | null = null;

  /** `true` si el entorno puede usar IndexedDB (navegador real o prueba). */
  get disponible(): boolean {
    return (
      isPlatformBrowser(this.platformId) &&
      typeof indexedDB !== 'undefined'
    );
  }

  /** Abre (o reutiliza) la conexión; `null` si no está disponible. */
  abrir(): Promise<IDBDatabase | null> {
    if (!this.disponible) {
      return Promise.resolve(null);
    }
    if (this.apertura === null) {
      this.apertura = new Promise<IDBDatabase | null>((resolve) => {
        let solicitud: IDBOpenDBRequest;
        try {
          solicitud = indexedDB.open(NOMBRE_BD_OFFLINE, VERSION_ESQUEMA_OFFLINE);
        } catch {
          resolve(null);
          return;
        }
        solicitud.onupgradeneeded = () =>
          aplicarEsquema(solicitud.result);
        solicitud.onsuccess = () => {
          const bd = solicitud.result;
          bd.onversionchange = () => {
            bd.close();
            this.apertura = null;
          };
          resolve(bd);
        };
        solicitud.onerror = () => resolve(null);
        solicitud.onblocked = () => resolve(null);
      });
    }
    return this.apertura;
  }

  // ============================= Operaciones =============================

  /** Inserta o reemplaza por `operacion_id` (la clave primaria deduplica). */
  async guardarOperacion(operacion: OperacionOffline): Promise<void> {
    const bd = await this.abrir();
    if (bd === null) {
      return;
    }
    await this.escribir(bd, ALMACEN_OPERACIONES, (almacen) => {
      almacen.put(operacion);
    });
  }

  async obtenerOperacion(
    operacionId: string,
  ): Promise<OperacionOffline | null> {
    const bd = await this.abrir();
    if (bd === null) {
      return null;
    }
    return this.leer<OperacionOffline>(bd, ALMACEN_OPERACIONES, (almacen) =>
      almacen.get(operacionId),
    );
  }

  /** Operaciones del scope, ordenadas por creación ascendente. */
  async listarOperaciones(scope: ScopeOffline): Promise<OperacionOffline[]> {
    const bd = await this.abrir();
    if (bd === null) {
      return [];
    }
    const registros = await this.leerTodos<OperacionOffline>(
      bd,
      ALMACEN_OPERACIONES,
      (almacen) =>
        almacen
          .index(INDICE_SCOPE)
          .getAll(IDBKeyRange.only([scope.empresa_id, scope.usuario_id])),
    );
    return [...registros].sort((a, b) =>
      a.creada_en.localeCompare(b.creada_en),
    );
  }

  async eliminarOperacion(operacionId: string): Promise<void> {
    const bd = await this.abrir();
    if (bd === null) {
      return;
    }
    await this.escribir(bd, ALMACEN_OPERACIONES, (almacen) => {
      almacen.delete(operacionId);
    });
  }

  // =============================== Caché ================================

  async guardarCache<T>(registro: CacheLocal<T>): Promise<void> {
    const bd = await this.abrir();
    if (bd === null) {
      return;
    }
    await this.escribir(bd, ALMACEN_CACHE, (almacen) => {
      almacen.put(registro);
    });
  }

  async leerCache<T>(clave: string): Promise<CacheLocal<T> | null> {
    const bd = await this.abrir();
    if (bd === null) {
      return null;
    }
    return this.leer<CacheLocal<T>>(bd, ALMACEN_CACHE, (almacen) =>
      almacen.get(clave),
    );
  }

  // ================================ Meta ================================

  async leerMeta<T>(clave: string): Promise<T | null> {
    const bd = await this.abrir();
    if (bd === null) {
      return null;
    }
    const registro = await this.leer<RegistroMeta<T>>(
      bd,
      ALMACEN_META,
      (almacen) => almacen.get(clave),
    );
    return registro?.valor ?? null;
  }

  async escribirMeta<T>(clave: string, valor: T): Promise<void> {
    const bd = await this.abrir();
    if (bd === null) {
      return;
    }
    await this.escribir(bd, ALMACEN_META, (almacen) => {
      almacen.put({ clave, valor } satisfies RegistroMeta<T>);
    });
  }

  // ============================== Limpieza ==============================

  /** Borra operaciones y caché del scope indicado (cambio de empresa). */
  async limpiarScope(scope: ScopeOffline): Promise<void> {
    const bd = await this.abrir();
    if (bd === null) {
      return;
    }
    await this.borrarPorScope(bd, ALMACEN_OPERACIONES, scope);
    await this.borrarPorScope(bd, ALMACEN_CACHE, scope);
  }

  /**
   * Borra TODOS los datos locales (cierre de sesión).
   *
   * Se expone la promesa de la última limpieza para que las pruebas y la UI
   * puedan esperar su finalización sin sondeos.
   */
  limpiarTodo(): Promise<void> {
    const limpieza = this.ejecutarLimpiezaTotal();
    this.ultimaLimpieza = limpieza;
    return limpieza;
  }

  /** Espera la última limpieza solicitada (no lanza si no hubo ninguna). */
  async esperarUltimaLimpieza(): Promise<void> {
    try {
      await this.ultimaLimpieza;
    } catch {
      // La limpieza es best-effort: un fallo de cuota no debe romper el cierre.
    }
  }

  // =============================== Interno ==============================

  private async ejecutarLimpiezaTotal(): Promise<void> {
    const bd = await this.abrir();
    if (bd === null) {
      return;
    }
    await new Promise<void>((resolve) => {
      const tx = bd.transaction(
        [ALMACEN_OPERACIONES, ALMACEN_CACHE, ALMACEN_META],
        'readwrite',
      );
      tx.objectStore(ALMACEN_OPERACIONES).clear();
      tx.objectStore(ALMACEN_CACHE).clear();
      tx.objectStore(ALMACEN_META).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    });
  }

  private escribir(
    bd: IDBDatabase,
    almacen: string,
    accion: (store: IDBObjectStore) => void,
  ): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const tx = bd.transaction(almacen, 'readwrite');
      accion(tx.objectStore(almacen));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }

  private leer<T>(
    bd: IDBDatabase,
    almacen: string,
    accion: (store: IDBObjectStore) => IDBRequest,
  ): Promise<T | null> {
    return new Promise<T | null>((resolve) => {
      const tx = bd.transaction(almacen, 'readonly');
      const solicitud = accion(tx.objectStore(almacen));
      solicitud.onsuccess = () => resolve((solicitud.result as T) ?? null);
      solicitud.onerror = () => resolve(null);
    });
  }

  private leerTodos<T>(
    bd: IDBDatabase,
    almacen: string,
    accion: (store: IDBObjectStore) => IDBRequest,
  ): Promise<T[]> {
    return new Promise<T[]>((resolve) => {
      const tx = bd.transaction(almacen, 'readonly');
      const solicitud = accion(tx.objectStore(almacen));
      solicitud.onsuccess = () =>
        resolve((solicitud.result as T[] | undefined) ?? []);
      solicitud.onerror = () => resolve([]);
    });
  }

  private borrarPorScope(
    bd: IDBDatabase,
    almacen: string,
    scope: ScopeOffline,
  ): Promise<void> {
    return new Promise<void>((resolve) => {
      const tx = bd.transaction(almacen, 'readwrite');
      const solicitud = tx
        .objectStore(almacen)
        .index(INDICE_SCOPE)
        .openCursor(
          IDBKeyRange.only([scope.empresa_id, scope.usuario_id]),
        );
      solicitud.onsuccess = () => {
        const cursor = solicitud.result;
        if (cursor !== null) {
          cursor.delete();
          cursor.continue();
        }
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    });
  }
}

/**
 * Crea el esquema versionado.
 *
 * `onupgradeneeded` se ejecuta también al abrir por primera vez (versión 0 → 1).
 * Cualquier versión futura debe añadir un bloque `if (version < N)` antes de
 * tocar los almacenes existentes, nunca recrearlos.
 */
function aplicarEsquema(bd: IDBDatabase): void {
  if (!bd.objectStoreNames.contains(ALMACEN_OPERACIONES)) {
    const operaciones = bd.createObjectStore(ALMACEN_OPERACIONES, {
      keyPath: 'operacion_id',
    });
    operaciones.createIndex(INDICE_SCOPE, ['empresa_id', 'usuario_id']);
    operaciones.createIndex('por_estado', 'estado');
    operaciones.createIndex('por_tipo', 'tipo');
  }

  if (!bd.objectStoreNames.contains(ALMACEN_CACHE)) {
    const cache = bd.createObjectStore(ALMACEN_CACHE, { keyPath: 'clave' });
    cache.createIndex(INDICE_SCOPE, ['empresa_id', 'usuario_id']);
    cache.createIndex('por_tipo', 'tipo');
  }

  if (!bd.objectStoreNames.contains(ALMACEN_META)) {
    bd.createObjectStore(ALMACEN_META, { keyPath: 'clave' });
  }
}
