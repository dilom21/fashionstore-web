/**
 * Modelos de datos del dominio Consultar Bitácora (CU05).
 *
 * Los nombres de propiedad coinciden exactamente con el JSON real que expone
 * el backend FastAPI (GET /bitacora y GET /bitacora/catalogos). No se
 * convierten a camelCase para mantener compatibilidad directa con la API.
 */

/** Usuario resumido responsable de un evento (nunca expone datos sensibles). */
export interface BitacoraUsuarioResumen {
  id: number;
  correo: string;
  rol: string;
}

/** Evento de bitácora tal como lo devuelve el listado y el detalle. */
export interface BitacoraEvento {
  id: number;
  fecha_hora: string;
  ip: string | null;
  accion: string;
  entidad_afectada: string | null;
  descripcion: string | null;
  usuario: BitacoraUsuarioResumen | null;
}

/** Respuesta de GET /bitacora (listado paginado). */
export interface BitacoraListResponse {
  items: BitacoraEvento[];
  total: number;
  limit: number;
  offset: number;
}

/** Usuario seguro para poblar el filtro de usuario (solo id y correo). */
export interface BitacoraUsuarioFiltro {
  id: number;
  correo: string;
}

/** Respuesta de GET /bitacora/catalogos (valores reales desde BD). */
export interface BitacoraCatalogos {
  acciones: string[];
  entidades: string[];
  usuarios: BitacoraUsuarioFiltro[];
}

/** Filtros opcionales admitidos por GET /bitacora. */
export interface BitacoraListarFiltros {
  buscar?: string;
  usuario_id?: number;
  accion?: string;
  entidad_afectada?: string;
  fecha_desde?: string;
  fecha_hasta?: string;
  limit?: number;
  offset?: number;
}
