/**
 * Generación del identificador de idempotencia (`operacion_id`).
 *
 * El backend exige un UUID v4 en las operaciones que aceptan replay
 * (`recepciones` de compras y `procesar` de devoluciones). El mismo UUID se
 * conserva mientras el formulario no cambie: un reintento idéntico responde
 * 200 (idempotente) en lugar de duplicar la operación.
 */

/**
 * Genera un UUID v4.
 *
 * Usa `crypto.randomUUID()` cuando existe; si el entorno no lo expone, arma el
 * UUID con `crypto.getRandomValues()`. Nunca se reutiliza entre operaciones:
 * solo se conserva para reintentos idénticos y se rota tras un éxito.
 */
export function generarOperacionId(): string {
  const cripto = globalThis.crypto;
  if (cripto !== undefined && typeof cripto.randomUUID === 'function') {
    return cripto.randomUUID();
  }
  return uuidV4DeRespaldo(cripto);
}

/**
 * Regla de conservación del identificador de idempotencia.
 *
 * - Éxito: se ROTA (la siguiente operación no debe reutilizar el UUID, porque
 *   el backend respondería 200 como replay de la anterior).
 * - Error: se CONSERVA, para que el reintento idéntico siga siendo idempotente.
 */
export function siguienteOperacionId(
  exitoso: boolean,
  actual: string,
  generar: () => string = generarOperacionId,
): string {
  return exitoso ? generar() : actual;
}

/** UUID v4 sin `randomUUID()`: 16 bytes aleatorios con versión y variante. */
function uuidV4DeRespaldo(cripto: Crypto | undefined): string {
  const bytes = new Uint8Array(16);

  if (cripto !== undefined && typeof cripto.getRandomValues === 'function') {
    cripto.getRandomValues(bytes);
  } else {
    // Último recurso (entornos sin Web Crypto). No se usa para seguridad.
    for (let i = 0; i < bytes.length; i += 1) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }

  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = Array.from(bytes, (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');

  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join('-');
}
