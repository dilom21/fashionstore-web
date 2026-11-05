import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

/**
 * Estado compartido entre specs del proyecto `saas`.
 *
 * `08-venta-contado.spec.ts` guarda el `venta_id` real que devolvió el backend y
 * `09-devoluciones.spec.ts` lo consume para encadenar la devolución. El archivo
 * vive bajo `test-results/` (ignorado por git) y NUNCA contiene credenciales.
 */
const RUTA = process.env.E2E_STATE ?? 'test-results/estado-e2e-5bz.json';

export interface EstadoE2E {
  /** Venta de contado creada por la UI en el escenario 8. */
  ventaId?: number;
}

export function guardarEstado(parcial: EstadoE2E): void {
  let previo: EstadoE2E = {};
  try {
    previo = leerEstado();
  } catch {
    previo = {};
  }
  const unido: EstadoE2E = { ...previo, ...parcial };
  mkdirSync(dirname(RUTA), { recursive: true });
  writeFileSync(RUTA, `${JSON.stringify(unido, null, 2)}\n`, 'utf8');
}

export function leerEstado(): EstadoE2E {
  return JSON.parse(readFileSync(RUTA, 'utf8')) as EstadoE2E;
}

/** `true` si el estado existe y tiene el `venta_id` del escenario 8. */
export function estadoDisponible(): boolean {
  try {
    return typeof leerEstado().ventaId === 'number';
  } catch {
    return false;
  }
}
