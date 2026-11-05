/**
 * Fechas legibles del modo SaaS.
 *
 * El backend entrega datetimes ISO; estas funciones solo los PRESENTAN. Si el
 * valor no se puede interpretar se devuelve el texto original para no ocultar
 * información del servidor.
 */

/** "2026-10-31T14:05:00Z" → "31 oct 2026, 14:05" (hora local del navegador). */
export function formatearFechaHora(iso: string | null | undefined): string {
  if (iso === null || iso === undefined || iso.trim().length === 0) {
    return '—';
  }
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) {
    return iso;
  }
  return new Intl.DateTimeFormat('es', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(fecha);
}

/** "2026-10-31T14:05:00Z" → "31 oct 2026" (hora local del navegador). */
export function formatearFecha(iso: string | null | undefined): string {
  if (iso === null || iso === undefined || iso.trim().length === 0) {
    return '—';
  }
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) {
    return iso;
  }
  return new Intl.DateTimeFormat('es', { dateStyle: 'medium' }).format(fecha);
}
