/**
 * Utilidades de fecha/hora para reservas (CU16).
 *
 * `fecha_atencion` se muestra leyendo literalmente la fecha y la hora del ISO
 * que devuelve el backend (sin convertir zona horaria). Así la hora que ve el
 * cliente es exactamente la que eligió, sin desplazamientos por UTC.
 */

const PATRON_ISO = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/;

/** "2026-09-20T10:00:00+00:00" -> "20/09/2026 10:00". */
export function formatearFechaHora(iso: string | null): string {
  if (iso === null || iso.trim().length === 0) {
    return '—';
  }
  const partes = PATRON_ISO.exec(iso.trim());
  if (partes === null) {
    return iso;
  }
  const [, anio, mes, dia, hora, minuto] = partes;
  return `${dia}/${mes}/${anio} ${hora}:${minuto}`;
}

/** "2026-09-20T10:00:00+00:00" -> "20/09/2026". */
export function formatearFecha(iso: string | null): string {
  if (iso === null || iso.trim().length === 0) {
    return '—';
  }
  const partes = PATRON_ISO.exec(iso.trim());
  if (partes === null) {
    return iso;
  }
  const [, anio, mes, dia] = partes;
  return `${dia}/${mes}/${anio}`;
}

/** "2026-09-20T10:00" -> "20/09/2026". */
export function formatearFechaSeleccion(fecha: string): string {
  const partes = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fecha.trim());
  if (partes === null) {
    return fecha;
  }
  const [, anio, mes, dia] = partes;
  return `${dia}/${mes}/${anio}`;
}

/**
 * Combina los campos del formulario en el datetime que espera el backend.
 * Se envía sin zona horaria (misma convención que el resto del proyecto):
 * "2026-09-20" + "10:00" -> "2026-09-20T10:00:00".
 */
export function combinarFechaHoraAtencion(
  fecha: string,
  hora: string,
): string | null {
  const fechaValida = /^\d{4}-\d{2}-\d{2}$/.test(fecha.trim());
  const horaValida = /^\d{2}:\d{2}$/.test(hora.trim());
  if (!fechaValida || !horaValida) {
    return null;
  }
  return `${fecha.trim()}T${hora.trim()}:00`;
}

/**
 * true si la fecha/hora elegida es posterior a "ahora".
 *
 * Es solo validación de UX: el backend sigue siendo la autoridad.
 */
export function esFechaHoraFutura(fecha: string, hora: string): boolean {
  const combinada = combinarFechaHoraAtencion(fecha, hora);
  if (combinada === null) {
    return false;
  }
  const elegida = new Date(combinada);
  if (Number.isNaN(elegida.getTime())) {
    return false;
  }
  return elegida.getTime() > Date.now();
}
