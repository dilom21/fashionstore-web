import { Promocion, TipoDescuento } from '../models/promocion.model';

/**
 * Utilidades de presentación de promociones (CU10).
 *
 * La vigencia es un cálculo EXCLUSIVAMENTE visual: nunca modifica el estado en
 * el backend. El backend conserva las promociones futuras, vencidas y
 * solapadas sin alterarlas automáticamente.
 */

/** Etiqueta de vigencia derivada en frontend. */
export type VigenciaPromocion = 'Deshabilitada' | 'Próxima' | 'Vigente' | 'Vencida';

/**
 * Calcula la vigencia visual de una promoción.
 *
 * 1. `estado === false`            -> Deshabilitada
 * 2. ahora < fecha_inicio          -> Próxima
 * 3. fecha_inicio <= ahora <= fin  -> Vigente
 * 4. ahora > fecha_fin             -> Vencida
 */
export function calcularVigencia(
  promocion: Pick<Promocion, 'estado' | 'fecha_inicio' | 'fecha_fin'>,
  ahora: Date = new Date(),
): VigenciaPromocion {
  if (!promocion.estado) {
    return 'Deshabilitada';
  }

  const inicio = new Date(promocion.fecha_inicio).getTime();
  const fin = new Date(promocion.fecha_fin).getTime();
  const referencia = ahora.getTime();

  if (Number.isNaN(inicio) || Number.isNaN(fin)) {
    return 'Próxima';
  }
  if (referencia < inicio) {
    return 'Próxima';
  }
  if (referencia > fin) {
    return 'Vencida';
  }
  return 'Vigente';
}

/** Sufijo de clase CSS para la etiqueta de vigencia. */
const CLASES_VIGENCIA: Record<VigenciaPromocion, string> = {
  Deshabilitada: 'vig-off',
  'Próxima': 'vig-next',
  Vigente: 'vig-on',
  Vencida: 'vig-exp',
};

export function claseVigencia(vigencia: VigenciaPromocion): string {
  return CLASES_VIGENCIA[vigencia];
}

/**
 * Formatea el valor del descuento para mostrarlo sin alterar el valor enviado
 * al backend.
 *
 * - PORCENTAJE: `10 %` (sin decimales innecesarios).
 * - MONTO: `Bs 50.00`.
 */
export function formatearValorDescuento(
  tipo: TipoDescuento,
  valorDescuento: number,
): string {
  const valor = Number(valorDescuento);
  if (!Number.isFinite(valor)) {
    return '—';
  }
  if (tipo === 'PORCENTAJE') {
    const texto = Number.isInteger(valor)
      ? valor.toString()
      : valor.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
    return `${texto} %`;
  }
  return `Bs ${valor.toFixed(2)}`;
}

/** Formatea una fecha TIMESTAMPTZ como `dd/mm/yyyy hh:mm` local. */
export function formatearFechaHora(valor: string): string {
  if (!valor) {
    return '—';
  }
  const fecha = new Date(valor);
  if (Number.isNaN(fecha.getTime())) {
    return valor;
  }
  const pad = (numero: number): string => String(numero).padStart(2, '0');
  const dia = pad(fecha.getDate());
  const mes = pad(fecha.getMonth() + 1);
  const anio = fecha.getFullYear();
  const horas = pad(fecha.getHours());
  const minutos = pad(fecha.getMinutes());
  return `${dia}/${mes}/${anio} ${horas}:${minutos}`;
}

/** Convierte una fecha ISO del backend a valor de `<input type="datetime-local">`. */
export function isoADatetimeLocal(iso: string): string {
  if (!iso) {
    return '';
  }
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) {
    return '';
  }
  const pad = (numero: number): string => String(numero).padStart(2, '0');
  const anio = fecha.getFullYear();
  const mes = pad(fecha.getMonth() + 1);
  const dia = pad(fecha.getDate());
  const horas = pad(fecha.getHours());
  const minutos = pad(fecha.getMinutes());
  return `${anio}-${mes}-${dia}T${horas}:${minutos}`;
}

/** Convierte el valor local del formulario a ISO 8601 (UTC) para el backend. */
export function datetimeLocalAIso(valor: string): string {
  if (!valor) {
    return '';
  }
  const fecha = new Date(valor);
  if (Number.isNaN(fecha.getTime())) {
    return valor;
  }
  return fecha.toISOString();
}
