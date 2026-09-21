import {
  MetadatosReporte,
  PaginacionReporte,
  SerieTemporal,
} from './reportes-common.model';

/** Conteo por etiqueta (`AuditoriaConteoResponse`). */
export interface AuditoriaConteo {
  etiqueta: string;
  cantidad: number;
}

/** Fila de bitácora (`AuditoriaFilaResponse`). */
export interface AuditoriaFila {
  bitacora_id: number;
  fecha_hora: string;
  usuario: string | null;
  accion: string;
  entidad_afectada: string | null;
  descripcion: string | null;
}

/**
 * `GET /reportes/auditoria`.
 *
 * Exclusivo de ADMINISTRADOR: la UI oculta la sección y el backend responde
 * 403 al ENCARGADO_SUCURSAL.
 */
export interface ReporteAuditoriaResponse {
  metadatos: MetadatosReporte;
  total_eventos: number;
  eventos_por_accion: AuditoriaConteo[];
  eventos_por_entidad: AuditoriaConteo[];
  eventos_por_usuario: AuditoriaConteo[];
  evolucion: SerieTemporal[];
  paginacion: PaginacionReporte;
  items: AuditoriaFila[];
}
