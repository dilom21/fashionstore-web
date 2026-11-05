import { computed, inject, Injectable, signal } from '@angular/core';

import { TenantMe } from '../models/tenant.models';
import { SaasSessionService } from '../services/saas-session.service';
import { generarOperacionId } from '../utils/operacion-id.util';
import { SaasOfflineDbService } from './offline-db.service';
import {
  CacheInventario,
  CacheSucursales,
  EstadoOperacionOffline,
  esOperacionPendiente,
  esReintentable,
  MAX_INTENTOS_OFFLINE,
  OperacionOffline,
  PayloadOperacionOffline,
  ResultadoOperacionOffline,
  retrasoReintentoMs,
  ScopeOffline,
  TipoOperacionOffline,
} from './offline.models';

/** Clave de metadatos donde se recuerda el último scope usado. */
const META_SCOPE_ACTIVO = 'scope_activo';

/** Error de uso cuando no hay una sesión tenant hidratada. */
export class SinScopeOfflineError extends Error {
  constructor() {
    super('La operación offline requiere una sesión de empresa activa.');
    this.name = 'SinScopeOfflineError';
  }
}

/**
 * Cola local de operaciones comerciales (ventas y reservas).
 *
 * - Deduplica por `operacion_id`: encolar dos veces el mismo UUID devuelve el
 *   registro existente en lugar de crear un duplicado.
 * - Separa por `empresa_id` + `usuario_id` y limpia el scope anterior cuando
 *   la sesión cambia de empresa o de usuario.
 * - Conserva estados y reintentos con backoff; nunca borra una operación por
 *   el hecho de haberla enviado.
 */
@Injectable({ providedIn: 'root' })
export class SaasOfflineQueueService {
  private readonly bd = inject(SaasOfflineDbService);
  private readonly sesion = inject(SaasSessionService);

  private readonly _scope = signal<ScopeOffline | null>(null);
  private readonly _operaciones = signal<OperacionOffline[]>([]);
  private readonly _cargando = signal(false);

  /** Scope vigente (empresa + usuario) de la cola visible. */
  readonly scope = this._scope.asReadonly();

  /** Operaciones del scope, ordenadas por creación. */
  readonly operaciones = this._operaciones.asReadonly();

  /** `true` mientras se lee IndexedDB. */
  readonly cargando = this._cargando.asReadonly();

  /** Operaciones que aún no están confirmadas ni en conflicto. */
  readonly pendientes = computed(() =>
    this._operaciones().filter(esOperacionPendiente),
  );

  /** Operaciones que requieren revisión humana. */
  readonly conflictos = computed(() =>
    this._operaciones().filter((operacion) => operacion.estado === 'CONFLICTO'),
  );

  /** Operaciones con fallo definitivo pendientes de reintento manual. */
  readonly errores = computed(() =>
    this._operaciones().filter((operacion) => operacion.estado === 'ERROR'),
  );

  /** Número de operaciones sin confirmar (contador de la cabecera). */
  readonly totalPendientes = computed(() => this.pendientes().length);

  /** Identidad tenant actual, o `null` si no hay sesión hidratada. */
  scopeActual(): ScopeOffline | null {
    const identidad: TenantMe | null = this.sesion.sesion();
    if (identidad === null) {
      return null;
    }
    return {
      empresa_id: identidad.empresa_id,
      usuario_id: identidad.usuario_id,
      empresa_slug: identidad.empresa_slug,
    };
  }

  /** Lee una operación directamente de IndexedDB (estado fresco). */
  async obtener(operacionId: string): Promise<OperacionOffline | null> {
    return this.bd.obtenerOperacion(operacionId);
  }

  /** Recarga la cola del scope vigente (y limpia el scope anterior). */
  async cargar(): Promise<void> {    const scope = this.scopeActual();
    if (scope === null) {
      this._scope.set(null);
      this._operaciones.set([]);
      return;
    }
    this._cargando.set(true);
    try {
      await this.prepararScope(scope);
      const operaciones = await this.bd.listarOperaciones(scope);
      this._scope.set(scope);
      this._operaciones.set(operaciones);
    } catch (error) {
      // IndexedDB no disponible (modo privado, cuota, SSR): la pantalla sigue
      // funcionando en línea y la cola se muestra vacía.
      console.error('[offline] No se pudo leer la cola local.', error);
      this._scope.set(scope);
      this._operaciones.set([]);
    } finally {
      this._cargando.set(false);
    }
  }

  /**
   * Encola una operación nueva.
   *
   * - Sin sesión lanza `SinScopeOfflineError` (la UI debe pedir login).
   * - Si el `operacion_id` ya existe, devuelve el registro existente.
   */
  async encolar(
    tipo: TipoOperacionOffline,
    payload: PayloadOperacionOffline,
    operacionId?: string,
  ): Promise<OperacionOffline> {
    const scope = this.scopeActual();
    if (scope === null) {
      throw new SinScopeOfflineError();
    }
    await this.prepararScope(scope);

    const id = operacionId ?? generarOperacionId();
    const existente = await this.bd.obtenerOperacion(id);
    if (existente !== null) {
      if (
        existente.empresa_id !== scope.empresa_id ||
        existente.usuario_id !== scope.usuario_id
      ) {
        throw new Error(
          'El identificador de operación pertenece a otra empresa o usuario.',
        );
      }
      this._scope.set(scope);
      await this.cargar();
      return existente;
    }

    const ahora = new Date().toISOString();
    const operacion: OperacionOffline = {
      operacion_id: id,
      tipo,
      estado: 'PENDIENTE',
      empresa_id: scope.empresa_id,
      usuario_id: scope.usuario_id,
      empresa_slug: scope.empresa_slug,
      creada_en: ahora,
      actualizada_en: ahora,
      intentos: 0,
      proximo_intento_en: null,
      payload,
      resultado: null,
      conflicto: null,
      ultimo_error: null,
    };
    await this.bd.guardarOperacion(operacion);
    await this.cargar();
    return operacion;
  }

  /**
   * Operaciones que deben enviarse en este ciclo.
   *
   * `forzar = true` (botón manual) ignora el backoff y reintenta también los
   * errores definitivos. Un `ENVIADO` se reclama tras un cierre de pestaña.
   */
  async listarParaSincronizar(
    forzar: boolean,
  ): Promise<OperacionOffline[]> {
    await this.cargar();
    const ahora = Date.now();
    return this._operaciones().filter((operacion) => {
      if (operacion.estado === 'CONFIRMADO' || operacion.estado === 'CONFLICTO') {
        return false;
      }
      if (forzar) {
        return true;
      }
      if (!esReintentable(operacion)) {
        return false;
      }
      if (operacion.estado === 'ENVIADO') {
        return true;
      }
      if (operacion.proximo_intento_en === null) {
        return true;
      }
      const proximo = Date.parse(operacion.proximo_intento_en);
      return !Number.isFinite(proximo) || proximo <= ahora;
    });
  }

  // ============================ Transiciones ============================

  async marcarEnviado(operacionId: string): Promise<void> {
    await this.actualizar(operacionId, (operacion) => ({
      ...operacion,
      estado: 'ENVIADO',
      ultimo_error: null,
    }));
  }

  async marcarConfirmado(
    operacionId: string,
    resultado: ResultadoOperacionOffline,
  ): Promise<void> {
    await this.actualizar(operacionId, (operacion) => ({
      ...operacion,
      estado: 'CONFIRMADO',
      resultado,
      conflicto: null,
      ultimo_error: null,
      proximo_intento_en: null,
    }));
  }

  async marcarConflicto(
    operacionId: string,
    codigo: number,
    detalle: string,
  ): Promise<void> {
    await this.actualizar(operacionId, (operacion) => ({
      ...operacion,
      estado: 'CONFLICTO',
      conflicto: { codigo, detalle },
      ultimo_error: detalle,
      proximo_intento_en: null,
    }));
  }

  /** Fallo definitivo (4xx/503): no se reintenta solo. */
  async marcarError(operacionId: string, detalle: string): Promise<void> {
    await this.actualizar(operacionId, (operacion) => ({
      ...operacion,
      estado: 'ERROR',
      ultimo_error: detalle,
      proximo_intento_en: null,
    }));
  }

  /** Fallo transitorio: incrementa intentos y agenda el backoff. */
  async reprogramar(operacionId: string, detalle: string): Promise<void> {
    await this.actualizar(operacionId, (operacion) => {
      const intentos = operacion.intentos + 1;
      if (intentos >= MAX_INTENTOS_OFFLINE) {
        return {
          ...operacion,
          estado: 'ERROR' as EstadoOperacionOffline,
          intentos,
          ultimo_error: detalle,
          proximo_intento_en: null,
        };
      }
      return {
        ...operacion,
        estado: 'PENDIENTE' as EstadoOperacionOffline,
        intentos,
        ultimo_error: detalle,
        proximo_intento_en: new Date(
          Date.now() + retrasoReintentoMs(intentos),
        ).toISOString(),
      };
    });
  }

  /** Reintento manual: reinicia el contador y limpia el backoff. */
  async reintentar(operacionId: string): Promise<void> {
    await this.actualizar(operacionId, (operacion) => ({
      ...operacion,
      estado: 'PENDIENTE',
      intentos: 0,
      proximo_intento_en: null,
      ultimo_error: null,
    }));
  }

  /** Descarta una operación en conflicto tras revisión humana. */
  async descartar(operacionId: string): Promise<void> {
    await this.bd.eliminarOperacion(operacionId);
    await this.cargar();
  }

  // ============================== Caché ================================

  /** Guarda el inventario de una sucursal para consultarlo sin conexión. */
  async guardarInventario(
    scope: ScopeOffline,
    sucursalId: number,
    datos: CacheInventario['datos'],
  ): Promise<void> {
    await this.bd.guardarCache<CacheInventario['datos']>({
      clave: claveCache(scope, 'inventario', String(sucursalId)),
      tipo: 'inventario',
      detalle: String(sucursalId),
      empresa_id: scope.empresa_id,
      usuario_id: scope.usuario_id,
      actualizado_en: new Date().toISOString(),
      datos,
    });
  }

  /** Lee el inventario cacheado de una sucursal, si existe. */
  async leerInventario(
    scope: ScopeOffline,
    sucursalId: number,
  ): Promise<CacheInventario | null> {
    return this.bd.leerCache<CacheInventario['datos']>(
      claveCache(scope, 'inventario', String(sucursalId)),
    );
  }

  /** Guarda las sucursales de la empresa para operar sin conexión. */
  async guardarSucursales(
    scope: ScopeOffline,
    datos: CacheSucursales['datos'],
  ): Promise<void> {
    await this.bd.guardarCache<CacheSucursales['datos']>({
      clave: claveCache(scope, 'sucursales', 'todas'),
      tipo: 'sucursales',
      detalle: 'todas',
      empresa_id: scope.empresa_id,
      usuario_id: scope.usuario_id,
      actualizado_en: new Date().toISOString(),
      datos,
    });
  }

  /** Lee las sucursales cacheadas de la empresa. */
  async leerSucursales(scope: ScopeOffline): Promise<CacheSucursales | null> {
    return this.bd.leerCache<CacheSucursales['datos']>(
      claveCache(scope, 'sucursales', 'todas'),
    );
  }

  // ============================== Interno ==============================

  /**
   * Limpia el scope anterior cuando la sesión cambia de empresa o usuario.
   *
   * Evita que datos de la empresa A queden visibles o se mezclen con la B en
   * el mismo navegador.
   */
  private async prepararScope(scope: ScopeOffline): Promise<void> {
    const anterior = await this.bd.leerMeta<ScopeOffline>(META_SCOPE_ACTIVO);
    if (anterior !== null && !mismoScope(anterior, scope)) {
      await this.bd.limpiarScope(anterior);
    }
    if (anterior === null || !mismoScope(anterior, scope)) {
      await this.bd.escribirMeta(META_SCOPE_ACTIVO, scope);
    }
  }

  private async actualizar(
    operacionId: string,
    cambio: (operacion: OperacionOffline) => OperacionOffline,
  ): Promise<void> {
    const actual = await this.bd.obtenerOperacion(operacionId);
    if (actual === null) {
      return;
    }
    const siguiente = {
      ...cambio(actual),
      actualizada_en: new Date().toISOString(),
    };
    await this.bd.guardarOperacion(siguiente);
    await this.cargar();
  }
}

/** Clave estable de caché por scope, tipo y detalle. */
function claveCache(
  scope: ScopeOffline,
  tipo: string,
  detalle: string,
): string {
  return `${scope.empresa_id}:${scope.usuario_id}:${tipo}:${detalle}`;
}

/** `true` si ambos scopes representan la misma empresa y usuario. */
function mismoScope(a: ScopeOffline, b: ScopeOffline): boolean {
  return a.empresa_id === b.empresa_id && a.usuario_id === b.usuario_id;
}
