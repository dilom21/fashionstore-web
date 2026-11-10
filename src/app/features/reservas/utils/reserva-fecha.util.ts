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
 * Construye el datetime AWARE que exige el backend SaaS.
 *
 * `POST /tenant/reservas` rechaza (422) una fecha sin zona horaria. Se toma la
 * fecha/hora LOCAL del formulario y se convierte al instante UTC equivalente
 * (`toISOString()`), conservando la intención del usuario.
 */
export function combinarFechaHoraAtencionSaas(
  fecha: string,
  hora: string,
): string | null {
  const fechaPartes = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fecha.trim());
  const horaPartes = /^(\d{2}):(\d{2})$/.exec(hora.trim());
  if (fechaPartes === null || horaPartes === null) {
    return null;
  }
  const anio = Number(fechaPartes[1]);
  const mes = Number(fechaPartes[2]);
  const dia = Number(fechaPartes[3]);
  const horas = Number(horaPartes[1]);
  const minutos = Number(horaPartes[2]);
  if (horas > 23 || minutos > 59) {
    return null;
  }
  const fechaLocal = new Date(anio, mes - 1, dia, horas, minutos, 0, 0);
  if (
    Number.isNaN(fechaLocal.getTime()) ||
    fechaLocal.getFullYear() !== anio ||
    fechaLocal.getMonth() !== mes - 1 ||
    fechaLocal.getDate() !== dia
  ) {
    // Rechaza fechas imposibles (p. ej. 2026-02-31) que Date normalizaría.
    return null;
  }
  return fechaLocal.toISOString();
}

/** Formatea un ISO en la zona horaria LOCAL del navegador: "dd/MM/yyyy HH:mm". */
export function formatearFechaHoraLocal(iso: string | null): string {
  if (iso === null || iso.trim().length === 0) {
    return '—';
  }
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) {
    return formatearFechaHora(iso);
  }
  const dia = String(fecha.getDate()).padStart(2, '0');
  const mes = String(fecha.getMonth() + 1).padStart(2, '0');
  const anio = fecha.getFullYear();
  const hora = String(fecha.getHours()).padStart(2, '0');
  const minuto = String(fecha.getMinutes()).padStart(2, '0');
  return `${dia}/${mes}/${anio} ${hora}:${minuto}`;
}

/** Formatea un ISO en la zona horaria LOCAL del navegador: "dd/MM/yyyy". */
export function formatearFechaLocal(iso: string | null): string {
  if (iso === null || iso.trim().length === 0) {
    return '—';
  }
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) {
    return formatearFecha(iso);
  }
  const dia = String(fecha.getDate()).padStart(2, '0');
  const mes = String(fecha.getMonth() + 1).padStart(2, '0');
  return `${dia}/${mes}/${fecha.getFullYear()}`;
}

/**
 * Formatea la fecha/hora de una reserva según el contrato:
 * - SaaS: datetime aware → se muestra en la zona local del navegador.
 * - Legacy: se mantiene la lectura literal del primer parcial.
 */
export function formatearFechaHoraReserva(
  iso: string | null,
  saasMode: boolean,
): string {
  return saasMode ? formatearFechaHoraLocal(iso) : formatearFechaHora(iso);
}

/** Formatea la fecha de una reserva según el contrato (ver arriba). */
export function formatearFechaReserva(
  iso: string | null,
  saasMode: boolean,
): string {
  return saasMode ? formatearFechaLocal(iso) : formatearFecha(iso);
}

/**
 * true si la fecha/hora elegida es posterior a "ahora".
 *
 * Se interpreta la fecha/hora del formulario en la zona LOCAL del navegador.
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


