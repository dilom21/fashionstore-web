import { isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  InjectionToken,
  PLATFORM_ID,
  computed,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';

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
} from '../../models/comprobante-venta.model';
import { etiquetaMetodoPago } from '../../models/pago-presencial.model';
import {
  descargarPdfGenerado,
  generarPdfComprobante,
  nombreArchivoPdf,
} from '../../utils/comprobante-venta-pdf.util';

export interface ComprobantePdfAdapter {
  generar(comprobante: ComprobanteVenta): Promise<Blob>;
  descargar(blob: Blob, nombreArchivo: string): void;
  nombreArchivo(ventaId: number): string;
}

export const COMPROBANTE_PDF = new InjectionToken<ComprobantePdfAdapter>('COMPROBANTE_PDF', {
  providedIn: 'root',
  factory: () => ({
    generar: generarPdfComprobante,
    descargar: descargarPdfGenerado,
    nombreArchivo: nombreArchivoPdf,
  }),
});
/**
 * CU23 - Vista reutilizable del comprobante de venta.
 *
 * Una sola implementación del CUERPO del comprobante para el sitio del CLIENTE
 * (navbar del sitio) y para el panel del PERSONAL (AdministracionShell). Los
 * wrappers solo aportan el layout y la acción de regreso.
 *
 * Es solo lectura: no registra pagos, no modifica la venta ni la reserva y no
 * vuelve a consultar Stripe. Los datos mostrados son exclusivamente los del
 * backend: si `cliente` es `null` se muestra "Cliente general" y si `empleado`
 * es `null` no se inventa cajero.
 *
 * PDF e impresión usan SIEMPRE la hoja blanca (`#hoja`): nunca el sidebar, el
 * navbar, los botones ni el fondo administrativo. Toda API de navegador queda
 * detrás de `isPlatformBrowser` para no romper SSR ni el prerender.
 */
@Component({
  selector: 'app-comprobante-venta-view',
  imports: [],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './comprobante-venta-view.css',
  templateUrl: './comprobante-venta-view.html',
})
export class ComprobanteVentaView {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly pdf = inject(COMPROBANTE_PDF);

  /** Comprobante real de GET /ventas/{venta_id}/comprobante. */
  readonly comprobante = input.required<ComprobanteVenta>();

  /** Acción de regreso según contexto: la decide el wrapper. */
  readonly volver = output<void>();

  /** Hoja blanca: único nodo que se descarga/imprime. */
  private readonly hojaRef = viewChild<ElementRef<HTMLElement>>('hoja');

  readonly codigo = computed(() => codigoVenta(this.comprobante().venta_id));
  readonly fechaHora = computed(() => formatearFechaHora(this.comprobante().fecha_hora));
  readonly canal = computed(() => etiquetaCanal(this.comprobante().canal));
  readonly telefonoSucursal = computed(() => this.comprobante().sucursal.telefono?.trim() || null);
  readonly cliente = computed(() => this.clienteVisual(this.comprobante()));
  readonly documentoCliente = computed(() => this.comprobante().cliente?.ci?.trim() || null);
  readonly cajero = computed(() => this.cajeroVisual(this.comprobante()));
  readonly enLinea = computed(() => esVentaEnLinea(this.comprobante()));
  readonly unidades = computed(() => this.comprobante().cantidad_total_unidades);
  readonly total = computed(() => formatearMonto(this.comprobante().total));
  readonly metodoPago = computed(() => etiquetaMetodoPago(this.comprobante().pago.metodo));
  readonly montoPago = computed(() => formatearMonto(this.comprobante().pago.monto));
  readonly pagoAprobado = computed(
    () => (this.comprobante().pago.estado ?? '').trim().toUpperCase() === 'APROBADO',
  );

  readonly descargando = signal(false);
  readonly imprimiendo = signal(false);
  readonly error = signal<string | null>(null);

  /** Evita dobles clics y descargas simultáneas de PDF. */
  readonly puedeDescargar = computed(() => !this.descargando());
  /** Evita abrir varios diálogos de impresión a la vez. */
  readonly puedeImprimir = computed(() => !this.imprimiendo());

  readonly ventaEnLinea = VENTA_EN_LINEA;
  readonly formatearMonto = formatearMonto;

  /**
   * Descarga el PDF del comprobante (`comprobante-VTA-00535.pdf`).
   *
   * No se descarga nada automáticamente: el usuario decide. Mientras se genera,
   * el botón queda deshabilitado (`DESCARGANDO…`) para evitar PDFs simultáneos.
   */
  descargarPdf(): void {
    if (this.descargando() || !isPlatformBrowser(this.platformId)) {
      return;
    }
    const comprobante = this.comprobante();
    this.descargando.set(true);
    this.error.set(null);

    this.pdf
      .generar(comprobante)
      .then((blob) => {
        this.pdf.descargar(blob, this.pdf.nombreArchivo(comprobante.venta_id));
      })
      .catch(() => {
        this.error.set('No pudimos generar el PDF. Intenta nuevamente.');
      })
      .finally(() => {
        this.descargando.set(false);
      });
  }

  /**
   * Imprime SOLO la hoja del comprobante.
   *
   * Se imprime en un iframe oculto que contiene la hoja más los estilos de la
   * aplicación, de modo que nunca salen el sidebar, el navbar, los botones ni
   * el fondo oscuro. No se abre ninguna ventana emergente.
   */
  imprimirComprobante(): void {
    if (this.imprimiendo() || !isPlatformBrowser(this.platformId)) {
      return;
    }
    const hoja = this.hojaRef()?.nativeElement;
    if (hoja === undefined) {
      return;
    }

    this.imprimiendo.set(true);

    const marco = document.createElement('iframe');
    marco.setAttribute('aria-hidden', 'true');
    marco.setAttribute('title', `Comprobante ${this.codigo()}`);
    marco.style.position = 'fixed';
    marco.style.width = '0';
    marco.style.height = '0';
    marco.style.border = '0';
    marco.style.visibility = 'hidden';
    document.body.appendChild(marco);

    let liberado = false;
    const liberar = (): void => {
      if (liberado) {
        return;
      }
      liberado = true;
      marco.remove();
      this.imprimiendo.set(false);
    };

    const documento = marco.contentDocument;
    const ventana = marco.contentWindow;
    if (documento === null || ventana === null) {
      liberar();
      return;
    }

    documento.open();
    documento.write(this.documentoImpresion(hoja.outerHTML));
    documento.close();

    ventana.addEventListener('afterprint', liberar, { once: true });
    this.imprimirDocumento(ventana);
    // Respaldo por si el navegador no emite `afterprint`.
    setTimeout(liberar, 30000);
  }

  /**
   * Envía el documento a la impresora. Es el único punto de contacto con APIs
   * exclusivas del navegador y se aísla para poder sustituirlo en pruebas.
   */
  imprimirDocumento(ventana: Window): void {
    try {
      ventana.focus();
      ventana.print();
    } catch {
      this.error.set('No pudimos abrir el diálogo de impresión.');
    }
  }

  /** Emite la acción de regreso del contexto (cliente o personal). */
  onVolver(): void {
    this.volver.emit();
  }

  /** Documento de impresión: la hoja con los estilos reales de la app. */
  private documentoImpresion(hojaHtml: string): string {
    const estilos = Array.from(document.querySelectorAll('style'))
      .map((nodo) => nodo.outerHTML)
      .join('');
    const enlaces = Array.from(document.querySelectorAll('link[rel="stylesheet"]'))
      .map((nodo) => nodo.outerHTML)
      .join('');
    const titulo = this.pdf.nombreArchivo(this.comprobante().venta_id).replace(/\.pdf$/, '');
    return [
      '<!doctype html><html lang="es"><head><meta charset="utf-8" />',
      `<title>${titulo}</title>`,
      estilos,
      enlaces,
      '<style>html,body{margin:0;padding:0;background:#ffffff;}',
      'body{padding:12px;}.cvw__acciones,.cvw__aviso,.cvw__resumen{display:none !important;}',
      '</style></head><body>',
      hojaHtml,
      '</body></html>',
    ].join('');
  }

  private clienteVisual(comprobante: ComprobanteVenta): string {
    const nombre = nombreCompletoCliente(comprobante.cliente);
    return nombre ?? CLIENTE_GENERAL;
  }

  private cajeroVisual(comprobante: ComprobanteVenta): string | null {
    return nombreCompletoEmpleado(comprobante.empleado);
  }
}
