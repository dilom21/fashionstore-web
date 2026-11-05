import {
  TENANT_ROL_ADMINISTRADOR,
  PermisoAsignado,
} from '../../models/tenant.models';

/** Permisos de una función, listos para pintar un grupo de checkboxes. */
export interface GrupoPermisos {
  funcion: string;
  permisos: PermisoAsignado[];
}

/**
 * Agrupa los permisos de un rol por `funcion`.
 *
 * Es una función pura para poder probarla sin Angular:
 * - normaliza `funcion`/`accion` (mayúsculas y sin espacios) porque la matriz
 *   del backend ya las entrega así, pero la UI no debe depender de ello;
 * - descarta filas sin función;
 * - ordena funciones y acciones alfabéticamente para que la pantalla sea
 *   estable entre recargas.
 */
export function agruparPorFuncion(
  permisos: readonly PermisoAsignado[],
): GrupoPermisos[] {
  const mapa = new Map<string, PermisoAsignado[]>();

  for (const permiso of permisos) {
    const funcion = (permiso.funcion ?? '').trim().toUpperCase();
    if (funcion.length === 0) {
      continue;
    }
    const accion = (permiso.accion ?? '').trim().toUpperCase();
    const lista = mapa.get(funcion) ?? [];
    lista.push({ ...permiso, funcion, accion });
    mapa.set(funcion, lista);
  }

  return [...mapa.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([funcion, lista]) => ({
      funcion,
      permisos: [...lista].sort((a, b) => a.accion.localeCompare(b.accion)),
    }));
}

/** Clave estable de un permiso dentro de la matriz editable. */
export function clavePermiso(funcion: string, accion: string): string {
  return `${funcion.trim().toUpperCase()}|${accion.trim().toUpperCase()}`;
}

/** `true` cuando el rol es ADMINISTRADOR (matriz de solo lectura). */
export function esRolAdministrador(rol: string | null | undefined): boolean {
  return (rol ?? '').trim().toUpperCase() === TENANT_ROL_ADMINISTRADOR;
}
