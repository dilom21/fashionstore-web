import { HttpErrorResponse } from '@angular/common/http';

/** Error traducido de cualquier consulta/exportación de CU28. */
export interface ErrorReporte {
  mensaje: string;
  /** 401: sesión expirada. */
  sesionExpirada: boolean;
  /** 403: rol o alcance insuficiente (p. ej. auditoría sin ADMIN). */
  sinPermiso: boolean;
  /** 404: sucursal inexistente. */
  noEncontrada: boolean;
  /** 422: filtros/exportación inválidos. */
  datosInvalidos: boolean;
  /** 422 específico: el detalle supera las 10.000 filas. */
  demasiadosRegistros: boolean;
  /** 5xx o red. */
  esRed: boolean;
  puedeReintentar: boolean;
}

const MSG_RED = 'No pudimos completar la operación. Intenta nuevamente.';
const MSG_EXPORTAR =
  'No pudimos generar el reporte. Reduce el rango o intenta nuevamente.';
const MSG_DEMASIADOS =
  'El reporte contiene demasiados registros. Reduce el rango de fechas o aplica filtros.';

function base(
  mensaje: string,
  extra: Partial<Omit<ErrorReporte, 'mensaje'>> = {},
): ErrorReporte {
  return {
    mensaje,
    sesionExpirada: false,
    sinPermiso: false,
    noEncontrada: false,
    datosInvalidos: false,
    demasiadosRegistros: false,
    esRed: false,
    puedeReintentar: false,
    ...extra,
  };
}

/** `error.error.detail` en minúsculas, solo para clasificar el 422. */
function detalle(error: HttpErrorResponse): string {
  const cuerpo: unknown = error.error;
  if (cuerpo !== null && typeof cuerpo === 'object') {
    const valor = (cuerpo as { detail?: unknown }).detail;
    if (typeof valor === 'string') {
      return valor.toLowerCase();
    }
  }
  return '';
}

/**
 * Traduce los errores de CU28 a mensajes de negocio.
 *
 * Nunca se exponen `HttpErrorResponse` crudos, SQL ni stack traces. El 422 se
 * clasifica con el `detail` real para distinguir "demasiados registros".
 */
export function traducirErrorReporte(
  error: unknown,
  porDefecto = 'No pudimos cargar los indicadores.',
  exportando = false,
): ErrorReporte {
  const mensajeRed = exportando ? MSG_EXPORTAR : porDefecto || MSG_RED;

  if (!(error instanceof HttpErrorResponse)) {
    return base(mensajeRed);
  }

  switch (error.status) {
    case 401:
      return base('Tu sesión expiró. Inicia sesión nuevamente.', {
        sesionExpirada: true,
      });
    case 403:
      return base('No tienes autorización para consultar este reporte.', {
        sinPermiso: true,
      });
    case 404:
      return base('Sucursal no encontrada.', { noEncontrada: true });
    case 422: {
      const texto = detalle(error);
      if (
        texto.includes('demasiado') ||
        texto.includes('10000') ||
        texto.includes('10.000')
      ) {
        return base(MSG_DEMASIADOS, {
          datosInvalidos: true,
          demasiadosRegistros: true,
        });
      }
      return base('Revisa los filtros del reporte e intenta nuevamente.', {
        datosInvalidos: true,
      });
    }
  }

  return base(mensajeRed, { esRed: true, puedeReintentar: true });
}

// ===== Presentación =====

/** Etiquetas legibles de canales reales (`venta.canal`). */
const CANALES: Record<string, string> = {
  WEB: 'Web',
  MOVIL: 'Móvil',
  PRESENCIAL: 'Presencial',
};

/** Etiquetas legibles de movimientos reales de inventario. */
const MOVIMIENTOS: Record<string, string> = {
  ENTRADA_COMPRA: 'Entrada por compra',
  SALIDA_VENTA: 'Salida por venta',
  RESERVA: 'Reserva',
  LIBERACION_RESERVA: 'Liberación de reserva',
  DEVOLUCION: 'Devolución',
  AJUSTE: 'Ajuste',
  TRANSFERENCIA: 'Transferencia',
};

export function etiquetaCanalReporte(canal: string): string {
  const clave = (canal ?? '').trim().toUpperCase();
  return CANALES[clave] ?? clave;
}

export function etiquetaMovimiento(tipo: string): string {
  const clave = (tipo ?? '').trim().toUpperCase();
  return MOVIMIENTOS[clave] ?? clave;
}

/** Convierte valores técnicos (`SALIDA_VENTA`) en texto presentable. */
export function etiquetaSimple(valor: string | null): string {
  return (valor ?? '').trim().replace(/_/g, ' ');
}

/** `DD/MM/YYYY` a partir de `YYYY-MM-DD`. */
export function fechaCorta(valor: string | null): string {
  if (!valor) {
    return '—';
  }
  const [anio, mes, dia] = valor.split('-');
  return dia && mes && anio ? `${dia}/${mes}/${anio}` : valor;
}

/** Fecha ISO a `dd/MM/yyyy HH:mm` (misma regla que el resto del panel). */
export function fechaHoraReporte(valor: string): string {
  const fecha = new Date(valor);
  if (Number.isNaN(fecha.getTime())) {
    return valor ?? '';
  }
  const dia = String(fecha.getDate()).padStart(2, '0');
  const mes = String(fecha.getMonth() + 1).padStart(2, '0');
  const horas = String(fecha.getHours()).padStart(2, '0');
  const minutos = String(fecha.getMinutes()).padStart(2, '0');
  return `${dia}/${mes}/${fecha.getFullYear()} ${horas}:${minutos}`;
}

/** Rango rápido en formato `YYYY-MM-DD`. */
export function rangoRapido(
  id: 'HOY' | 'SIETE_DIAS' | 'MES_ACTUAL' | 'ANIO_ACTUAL',
): { desde: string; hasta: string } {
  const hoy = new Date();
  const iso = (fecha: Date): string =>
    `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}-${String(
      fecha.getDate(),
    ).padStart(2, '0')}`;

  if (id === 'SIETE_DIAS') {
    const inicio = new Date(hoy);
    inicio.setDate(hoy.getDate() - 6);
    return { desde: iso(inicio), hasta: iso(hoy) };
  }
  if (id === 'MES_ACTUAL') {
    return {
      desde: iso(new Date(hoy.getFullYear(), hoy.getMonth(), 1)),
      hasta: iso(hoy),
    };
  }
  if (id === 'ANIO_ACTUAL') {
    return { desde: iso(new Date(hoy.getFullYear(), 0, 1)), hasta: iso(hoy) };
  }
  return { desde: iso(hoy), hasta: iso(hoy) };
}

// ===== Paleta de gráficas (identidad VANTER MEN) =====

export const COLOR_ACENTO = '#d946ef';
export const COLOR_ACENTO_2 = '#a855f7';
export const COLOR_EXITO = '#34d399';
export const COLOR_INFO = '#38bdf8';
export const COLOR_ALERTA = '#fbbf24';
export const COLOR_PELIGRO = '#fb7185';
export const COLOR_TEXTO = '#9aa3c0';
export const COLOR_GRID = 'rgba(148, 163, 184, 0.12)';

/** Paleta corta y coherente (sin arcoíris de colores). */
export const PALETA_GRAFICAS: readonly string[] = [
  COLOR_ACENTO,
  COLOR_ACENTO_2,
  COLOR_INFO,
  COLOR_EXITO,
  COLOR_ALERTA,
  COLOR_PELIGRO,
];

export function colorPorIndice(indice: number): string {
  return PALETA_GRAFICAS[indice % PALETA_GRAFICAS.length];
}
