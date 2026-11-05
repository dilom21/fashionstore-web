/**
 * Formato de montos del modo SaaS.
 *
 * El backend entrega `precio` del catálogo como TEXTO decimal (`"120.00"`) y
 * los montos de venta como número. Estas funciones solo presentan el valor
 * recibido: NUNCA suman, multiplican ni recalculan totales de negocio.
 */

/**
 * Monto con dos decimales (`149.9` → `149.90`, `"120.00"` → `120.00`).
 *
 * @returns `'—'` cuando no hay valor o no es numérico.
 */
export function formatearMonto(
  valor: number | string | null | undefined,
): string {
  if (valor === null || valor === undefined || valor === '') {
    return '—';
  }
  const numero = typeof valor === 'number' ? valor : Number(valor);
  return Number.isFinite(numero) ? numero.toFixed(2) : '—';
}

/** Monto en bolivianos con el formato usado en la app (`Bs 149.90`). */
export function formatearBolivianos(
  valor: number | string | null | undefined,
): string {
  const monto = formatearMonto(valor);
  return monto === '—' ? monto : `Bs ${monto}`;
}
