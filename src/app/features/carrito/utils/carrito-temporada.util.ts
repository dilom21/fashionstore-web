import { FiltroOpcion } from '../../catalogo/models/catalogo-filtros.model';

/**
 * Motivo por el que no se pudo resolver una temporada.
 *
 * - `vacia`: no se seleccionó ninguna temporada.
 * - `no-encontrada`: el nombre no aparece en las opciones públicas.
 * - `ambigua`: hay más de una opción con el mismo nombre (no se elige a ciegas).
 */
export type MotivoTemporadaNoResuelta = 'vacia' | 'no-encontrada' | 'ambigua';

export interface ResolucionTemporada {
  /** `id` solo si la coincidencia es ÚNICA. */
  id: number | null;
  motivo?: MotivoTemporadaNoResuelta;
}

/**
 * Resuelve el `temporada_id` a partir del NOMBRE que devuelve la disponibilidad
 * pública (`disponibilidad[].temporada`).
 *
 * El catálogo público SaaS entrega la temporada por nombre; el carrito exige
 * `temporada_id`. La resolución usa las opciones de `GET .../filtros` de la
 * MISMA empresa y solo acepta una coincidencia única (sin distinguir
 * mayúsculas/espacios). Si no hay coincidencia o hay ambigüedad, se rechaza:
 * nunca se asigna un id por posición ni se elige una temporada distinta.
 *
 * Limitación conocida: si el contrato público no entrega el id (o los nombres
 * no coinciden de forma inequívoca), no es posible agregar al carrito; en ese
 * caso el backend debe ampliar el contrato público con `temporada_id`.
 */
export function resolverTemporadaId(
  temporadas: ReadonlyArray<Pick<FiltroOpcion, 'id' | 'nombre'>>,
  nombre: string | null | undefined,
): ResolucionTemporada {
  const buscado = (nombre ?? '').trim().toLowerCase();
  if (buscado.length === 0) {
    return { id: null, motivo: 'vacia' };
  }

  const coincidencias = temporadas.filter(
    (temporada) => (temporada.nombre ?? '').trim().toLowerCase() === buscado,
  );

  if (coincidencias.length === 1) {
    return { id: coincidencias[0].id };
  }
  if (coincidencias.length === 0) {
    return { id: null, motivo: 'no-encontrada' };
  }
  return { id: null, motivo: 'ambigua' };
}

/** Mensaje de UI para una temporada que no puede identificarse sin ambigüedad. */
export function mensajeTemporadaNoResuelta(
  resolucion: ResolucionTemporada,
): string | null {
  switch (resolucion.motivo) {
    case 'vacia':
      return null;
    case 'no-encontrada':
      return 'No se pudo identificar la temporada seleccionada en el catálogo actual. Vuelve a elegirla o inténtalo más tarde.';
    case 'ambigua':
      return 'La temporada seleccionada es ambigua en el catálogo actual. No se puede agregar al carrito de forma segura.';
    default:
      return null;
  }
}
