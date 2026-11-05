import { IDBFactory } from 'fake-indexeddb';

import { OperacionOffline, ScopeOffline } from './offline.models';

/** Scope de la empresa A / usuario 10 usada en las pruebas. */
export const SCOPE_A: ScopeOffline = {
  empresa_id: 1,
  usuario_id: 10,
  empresa_slug: 'empresa-a',
};

/** Scope de la empresa B / usuario 20 usada en las pruebas. */
export const SCOPE_B: ScopeOffline = {
  empresa_id: 2,
  usuario_id: 20,
  empresa_slug: 'empresa-b',
};

/** UUID estable de la venta de prueba. */
export const OPERACION_VENTA =
  '6f1c2b7e-3a4d-4f5e-9a0b-1c2d3e4f5a6b';

/** UUID estable de la reserva de prueba. */
export const OPERACION_RESERVA =
  '7c9e6679-7425-40de-944b-e07fc1f90ae7';

/** Operación de venta de contado lista para persistir. */
export const OPERACION_A: OperacionOffline = {
  operacion_id: OPERACION_VENTA,
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
    lineas: [{ inventario_id: 101, cantidad: 2 }],
  },
  resultado: null,
  conflicto: null,
  ultimo_error: null,
};

/** Operación de reserva del scope B. */
export const OPERACION_B: OperacionOffline = {
  ...OPERACION_A,
  operacion_id: OPERACION_RESERVA,
  empresa_id: SCOPE_B.empresa_id,
  usuario_id: SCOPE_B.usuario_id,
  empresa_slug: SCOPE_B.empresa_slug,
  payload: {
    carrito_id: 77,
    fecha_atencion: '2026-11-01T15:00:00.000Z',
  },
  tipo: 'RESERVA_CREAR',
};

/**
 * Reemplaza la fábrica de IndexedDB para que cada prueba arranque con una base
 * vacía, sin compartir datos con las demás.
 */
export function resetearIndexedDb(): void {
  Object.defineProperty(globalThis, 'indexedDB', {
    value: new IDBFactory(),
    configurable: true,
    writable: true,
  });
}
