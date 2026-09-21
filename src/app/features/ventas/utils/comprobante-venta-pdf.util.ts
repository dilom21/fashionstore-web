import {
  CLIENTE_GENERAL,
  ComprobanteVenta,
  VENTA_EN_LINEA,
  codigoVenta,
  esVentaEnLinea,
  etiquetaCanal,
  formatearFechaHora,
  formatearMonto,
  nombreCompletoCliente,
  nombreCompletoEmpleado,
} from '../models/comprobante-venta.model';

/**
 * Generación y descarga del PDF del comprobante (CU23).
 *
 * El backend devuelve JSON: el PDF se arma en el frontend. `jspdf` se importa
 * de forma DINÁMICA dentro de `generarPdfComprobante`, por lo que la librería
 * nunca se carga durante SSR ni en el build del servidor.
 *
 * El documento contiene ÚNICAMENTE la hoja del comprobante: sin sidebar, sin
 * navbar, sin botones, sin mensajes y sin fondo administrativo.
 */

/** Nombre del archivo descargado: `comprobante-VTA-00535.pdf`. */
export function nombreArchivoPdf(ventaId: number): string {
  return `comprobante-${codigoVenta(ventaId)}.pdf`;
}

/** Genera el PDF (A4, texto vectorial) con los datos reales del backend. */
export async function generarPdfComprobante(
  comprobante: ComprobanteVenta,
): Promise<Blob> {
  // Import DINÁMICO: `jspdf` se carga únicamente en el navegador, nunca en SSR.
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const anchoPagina = doc.internal.pageSize.getWidth();
  const altoPagina = doc.internal.pageSize.getHeight();
  const margen = 48;
  const derecha = anchoPagina - margen;
  let y = margen;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text('VANTER MEN', anchoPagina / 2, y, { align: 'center' });
  y += 20;

  doc.setFontSize(12);
  doc.text('COMPROBANTE DE VENTA', anchoPagina / 2, y, { align: 'center' });
  y += 12;

  doc.setDrawColor(180);
  doc.line(margen, y, derecha, y);
  y += 22;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  for (const [etiqueta, valor] of datosEncabezado(comprobante)) {
    doc.text(`${etiqueta}: ${valor}`, margen, y);
    y += 14;
  }

  y += 8;
  doc.line(margen, y, derecha, y);
  y += 16;

  doc.setFont('helvetica', 'bold');
  doc.text('CANT.', margen, y);
  doc.text('DESCRIPCIÓN', margen + 52, y);
  doc.text('PRECIO UNIT.', margen + 400, y, { align: 'right' });
  doc.text('SUBTOTAL', derecha, y, { align: 'right' });
  y += 6;
  doc.line(margen, y, derecha, y);
  y += 14;

  doc.setFont('helvetica', 'normal');
  for (const item of comprobante.items) {
    const descripcion = doc.splitTextToSize(
      `${item.producto_nombre} - ${item.talla_nombre} · ${item.color_nombre}`,
      300,
    ) as string[];
    const altoFila = Math.max(descripcion.length * 13, 16);

    if (y + altoFila > altoPagina - margen - 90) {
      doc.addPage();
      y = margen + 14;
    }

    doc.text(String(item.cantidad), margen, y);
    doc.text(descripcion, margen + 52, y);
    doc.text(`Bs ${formatearMonto(item.precio_unitario)}`, margen + 400, y, {
      align: 'right',
    });
    doc.text(`Bs ${formatearMonto(item.subtotal_linea)}`, derecha, y, {
      align: 'right',
    });
    y += altoFila;
  }

  y += 8;
  doc.line(margen, y, derecha, y);
  y += 22;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text(`Total: Bs ${formatearMonto(comprobante.total)}`, derecha, y, {
    align: 'right',
  });
  y += 18;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`Unidades: ${comprobante.cantidad_total_unidades}`, derecha, y, {
    align: 'right',
  });
  y += 22;

  for (const [etiqueta, valor] of datosPago(comprobante)) {
    doc.text(`${etiqueta}: ${valor}`, margen, y);
    y += 14;
  }

  y += 18;
  doc.setFont('helvetica', 'bold');
  doc.text('Gracias por tu compra.', anchoPagina / 2, y, { align: 'center' });
  y += 14;
  doc.setFont('helvetica', 'normal');
  doc.text('VANTER MEN - Moda que te define', anchoPagina / 2, y, {
    align: 'center',
  });

  return doc.output('blob');
}

/** Descarga un PDF ya generado con el nombre `comprobante-VTA-*.pdf`. */
export function descargarPdfGenerado(blob: Blob, nombreArchivo: string): void {
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = nombreArchivo;
  enlace.rel = 'noopener';
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
  URL.revokeObjectURL(url);
}

/** Datos reales del encabezado (sin inventar cliente ni cajero). */
function datosEncabezado(
  comprobante: ComprobanteVenta,
): Array<[string, string]> {
  const filas: Array<[string, string] | null> = [
    ['N° de venta', codigoVenta(comprobante.venta_id)],
    ['Fecha y hora', formatearFechaHora(comprobante.fecha_hora)],
    ['Canal', etiquetaCanal(comprobante.canal)],
    ['Sucursal', comprobante.sucursal.nombre],
    ['Dirección', comprobante.sucursal.direccion],
    comprobante.sucursal.telefono === null
      ? null
      : ['Teléfono', comprobante.sucursal.telefono],
    ['Cliente', nombreCompletoCliente(comprobante.cliente) ?? CLIENTE_GENERAL],
    comprobante.cliente?.ci ? ['Documento', comprobante.cliente.ci] : null,
    filaRegistro(comprobante),
  ];
  return filas.filter((fila): fila is [string, string] => fila !== null);
}

/** Fila del cajero, o etiqueta de venta en línea cuando no hay empleado. */
function filaRegistro(comprobante: ComprobanteVenta): [string, string] | null {
  const empleado = nombreCompletoEmpleado(comprobante.empleado);
  if (empleado !== null) {
    return ['Cajero', empleado];
  }
  return esVentaEnLinea(comprobante) ? ['Registro', VENTA_EN_LINEA] : null;
}

/** Datos reales del pago APROBADO (nunca datos de tarjeta). */
function datosPago(comprobante: ComprobanteVenta): Array<[string, string]> {
  const pago = comprobante.pago;
  const filas: Array<[string, string] | null> = [
    ['N° de pago', `#${pago.pago_id}`],
    ['Método de pago', pago.metodo],
    ['Estado', pago.estado],
    pago.pasarela === null ? null : ['Pasarela', pago.pasarela],
    pago.referencia_transaccion === null
      ? null
      : ['Referencia', pago.referencia_transaccion],
  ];
  return filas.filter((fila): fila is [string, string] => fila !== null);
}
