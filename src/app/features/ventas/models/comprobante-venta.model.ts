/**
 * Modelos del dominio Comprobante de venta (CU23 - Emitir comprobante de venta).
 *
 * Los nombres coinciden EXACTAMENTE con el JSON real del backend FastAPI:
 *
 *   GET /ventas/{venta_id}/comprobante
 *   -> app/modules/ventas/schemas/comprobante.py
 *      (ComprobanteVentaResponse, ComprobanteVentaItemResponse,
 *       ComprobantePagoResponse, ComprobanteClienteResponse,
 *       ComprobanteEmpleadoResponse, ComprobanteSucursalResponse)
 *
 * El comprobante NO es una entidad persistida: no existe tabla `comprobante`
 * ni `factura`. CU23 es solo lectura: no modifica venta, pago, reserva ni
 * inventario, no vuelve a cobrar y no crea otra venta.
 *
 * Sirve a los tres orígenes con el mismo `venta_id`:
 *  - WEB/MOVIL (CU19 -> CU22)
 *  - PRESENCIAL directa (CU20 -> CU21)
 *  - PRESENCIAL desde reserva (CU18 -> CU20 -> CU21)
 *
 * No se inventan datos fiscales: el modelo real no tiene NIT, razón social,
 * IVA ni numeración de factura. La moneda es el boliviano (`Bs`).
 */

/** Cliente de la venta (`null` en ventas presenciales anónimas). */
export interface ComprobanteCliente {
  id: number;
  nombre: string;
  apellido: string;
  ci: string | null;
  telefono: string | null;
}

/** Empleado que registró la venta (`null` en ventas WEB/MOVIL). */
export interface ComprobanteEmpleado {
  id: number;
  nombres: string;
  apellidos: string;
}

/** Sucursal de la venta (siempre presente en el contrato real). */
export interface ComprobanteSucursal {
  id: number;
  nombre: string;
  direccion: string;
  telefono: string | null;
}

/** Pago APROBADO que respalda el comprobante (nunca datos de tarjeta). */
export interface ComprobantePago {
  pago_id: number;
  fecha_hora: string;
  /** Decimal del backend normalizado a number solo para presentación. */
  monto: number;
  metodo: string;
  estado: string;
  referencia_transaccion: string | null;
  pasarela: string | null;
}

/** Línea del comprobante construida desde `detalle_venta`. */
export interface ComprobanteVentaItem {
  detalle_venta_id: number;
  inventario_id: number;
  producto_id: number;
  producto_nombre: string;
  variante_producto_id: number;
  sku: string;
  talla_nombre: string;
  color_nombre: string;
  cantidad: number;
  /** Decimal normalizado a number solo para presentación. */
  precio_unitario: number;
  /** Decimal normalizado a number solo para presentación. */
  subtotal_linea: number;
}

/** DTO completo del comprobante (`ComprobanteVentaResponse`). */
export interface ComprobanteVenta {
  venta_id: number;
  fecha_hora: string;
  canal: string;
  estado_venta: string;
  /** Decimal normalizado a number: es la autoridad del backend, no se recalcula. */
  total: number;
  carrito_id: number | null;
  reserva_id: number | null;
  cliente: ComprobanteCliente | null;
  empleado: ComprobanteEmpleado | null;
  sucursal: ComprobanteSucursal;
  pago: ComprobantePago;
  items: ComprobanteVentaItem[];
  cantidad_total_unidades: number;
}

/** Etiqueta de presentación cuando la venta presencial no tiene cliente. */
export const CLIENTE_GENERAL = 'Cliente general';

/** Etiqueta de presentación cuando la venta WEB/MOVIL no tiene empleado. */
export const VENTA_EN_LINEA = 'Venta en línea';

const ETIQUETAS_CANAL: Readonly<Record<string, string>> = {
  PRESENCIAL: 'Presencial',
  WEB: 'Web',
  MOVIL: 'Móvil',
};

/**
 * Código visual de venta (`VTA-00535`).
 *
 * Es SOLO presentación: no altera el `venta_id` real ni crea otro
 * identificador. El backend devuelve únicamente el entero.
 */
export function codigoVenta(ventaId: number): string {
  const numero = Number(ventaId);
  const id = Number.isFinite(numero) ? Math.trunc(numero) : 0;
  return `VTA-${String(id).padStart(5, '0')}`;
}

/** Monto con dos decimales (`149.90`); nunca `NaN`. Moneda: bolivianos. */
export function formatearMonto(valor: number): string {
  const numero = Number(valor);
  return (Number.isFinite(numero) ? numero : 0).toFixed(2);
}

/** Fecha y hora del backend en `dd/MM/yyyy HH:mm` (misma regla en vista y PDF). */
export function formatearFechaHora(valor: string): string {
  const fecha = new Date(valor);
  if (Number.isNaN(fecha.getTime())) {
    return valor ?? '';
  }
  const dia = String(fecha.getDate()).padStart(2, '0');
  const mes = String(fecha.getMonth() + 1).padStart(2, '0');
  const anio = fecha.getFullYear();
  const horas = String(fecha.getHours()).padStart(2, '0');
  const minutos = String(fecha.getMinutes()).padStart(2, '0');
  return `${dia}/${mes}/${anio} ${horas}:${minutos}`;
}

/** Etiqueta legible del canal real, o el propio valor si no se reconoce. */
export function etiquetaCanal(canal: string): string {
  const valor = (canal ?? '').trim().toUpperCase();
  return ETIQUETAS_CANAL[valor] ?? valor;
}

/**
 * Nombre completo del cliente, o `null` si la venta es anónima.
 *
 * La vista muestra `CLIENTE_GENERAL` en ese caso: nunca `undefined`, `null`
 * ni un cliente inventado.
 */
export function nombreCompletoCliente(
  cliente: ComprobanteCliente | null,
): string | null {
  if (cliente === null) {
    return null;
  }
  return unirNombre(cliente.nombre, cliente.apellido);
}

/** Nombre completo del empleado, o `null` en ventas WEB/MOVIL. */
export function nombreCompletoEmpleado(
  empleado: ComprobanteEmpleado | null,
): string | null {
  if (empleado === null) {
    return null;
  }
  return unirNombre(empleado.nombres, empleado.apellidos);
}

/**
 * `true` cuando la venta es WEB/MOVIL y no tiene empleado asociado: se omite la
 * fila "Cajero" y se etiqueta como venta en línea (sin inventar cajeros).
 */
export function esVentaEnLinea(comprobante: ComprobanteVenta): boolean {
  if (comprobante.empleado !== null) {
    return false;
  }
  const canal = (comprobante.canal ?? '').trim().toUpperCase();
  return canal === 'WEB' || canal === 'MOVIL';
}

function unirNombre(primero: string, segundo: string): string | null {
  const partes = [primero, segundo]
    .map((parte) => (parte ?? '').trim())
    .filter((parte) => parte.length > 0);
  return partes.length > 0 ? partes.join(' ') : null;
}
