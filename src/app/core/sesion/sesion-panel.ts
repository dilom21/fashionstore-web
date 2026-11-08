/**
 * Estado compartido de la sesión EMPRESARIAL (SaaS) dentro del panel
 * administrativo del primer parcial.
 *
 * Los traductores de errores HTTP (`features/**\/utils/*-error.util.ts`) son
 * funciones puras que se ejecutan dentro de callbacks de RxJS, es decir, FUERA
 * de un contexto de inyección de Angular: no pueden usar
 * `inject(TenantApiService)`. Para que la interpretación del 401 sea correcta,
 * `TenantApiService` mantiene sincronizado este indicador cada vez que
 * confirma o descarta la identidad de `GET /auth/tenant/me`.
 *
 * Este módulo NO guarda tokens, NO copia el JWT empresarial a la clave legacy y
 * NO autoriza nada por sí mismo: solo permite que la interfaz distinga una
 * sesión empresarial confirmada de una sesión legacy del primer parcial.
 */

let sesionEmpresarialActiva = false;

/**
 * Marca si hay una identidad empresarial del PERSONAL confirmada por el
 * backend. Lo invoca `TenantApiService` (login, /me, restauración y cierre).
 */
export function marcarSesionEmpresarial(activa: boolean): void {
  sesionEmpresarialActiva = activa;
}

/** true si la sesión en curso es la empresarial (SaaS) del personal. */
export function esSesionEmpresarial(): boolean {
  return sesionEmpresarialActiva;
}

/**
 * Mensaje para una consulta rechazada con 401 cuando la sesión es empresarial.
 *
 * En ese caso el token es válido para FastAPI, pero el endpoint consultado
 * todavía es el del sistema anterior (espera el JWT legacy). La pantalla debe
 * conservarse y avisar de la limitación en lugar de tratarlo como "sesión
 * expirada", vaciar las tablas silenciosamente o expulsar al administrador.
 *
 * Este texto corresponde al código HTTP real: no se inventan datos ni se
 * presenta el resultado como válido.
 */
export const MENSAJE_ENDPOINT_LEGACY_BLOQUEADO =
  'Esta pantalla todavía consulta los servicios del sistema anterior, que aún no están adaptados al modo empresarial. El servidor rechazó la consulta (401): no se muestran datos ni se realizó ningún cambio.';

/**
 * true si un 401 debe interpretarse como "endpoint legacy todavía no adaptado"
 * en lugar de "sesión expirada".
 */
export function esLegacyBloqueadoPorSesionEmpresarial(): boolean {
  return sesionEmpresarialActiva;
}
