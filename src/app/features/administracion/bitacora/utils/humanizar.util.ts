/**
 * Utilidades de presentación para el dominio de Bitácora (CU05).
 *
 * La humanización de códigos (MODIFICAR -> Modificar, CONSULTAR_BITACORA ->
 * Consultar bitácora, etc.) se delega en la utilidad compartida de CU04 para
 * mantener una única fuente de etiquetas. Estas funciones solo cambian lo que
 * se MUESTRA; jamás alteran los valores enviados al backend.
 */
import { BitacoraEvento } from '../models/bitacora.model';

import { humanizarCodigo } from '../../roles-permisos/utils/humanizar.util';

export { humanizarCodigo };

/** Etiqueta cuando un evento no tiene usuario asociado. */
export const ETIQUETA_SISTEMA = 'Sistema';

/** Símbolo usado cuando un dato opcional no está presente. */
export const SIN_DATO = '—';

/** Humaniza un código/valor libre para mostrarlo en pantalla. */
export function humanizarBitacora(valor: string | null | undefined): string {
  if (valor === null || valor === undefined) {
    return SIN_DATO;
  }
  const texto = valor.trim();
  return texto.length === 0 ? SIN_DATO : humanizarCodigo(texto);
}

/** Correo del responsable o "Sistema" cuando el evento no tiene usuario. */
export function textoUsuarioEvento(evento: BitacoraEvento): string {
  return evento.usuario === null ? ETIQUETA_SISTEMA : evento.usuario.correo;
}

/** true cuando el evento fue generado por el sistema (usuario null). */
export function esEventoDeSistema(evento: BitacoraEvento): boolean {
  return evento.usuario === null;
}

/** Rol del responsable humanizado, o "—" cuando no hay usuario. */
export function textoRolEvento(evento: BitacoraEvento): string {
  if (evento.usuario === null) {
    return SIN_DATO;
  }
  const rol = evento.usuario.rol.trim();
  return rol.length === 0 ? SIN_DATO : humanizarCodigo(rol);
}

/** Dirección IP o "—" cuando el evento no la registró. */
export function textoIpEvento(evento: BitacoraEvento): string {
  const ip = evento.ip?.trim();
  return ip ? ip : SIN_DATO;
}

/** Descripción completa o "—" cuando el evento no la tiene. */
export function textoDescripcionEvento(evento: BitacoraEvento): string {
  const descripcion = evento.descripcion?.trim();
  return descripcion ? descripcion : SIN_DATO;
}
