import { PLATFORM_ID } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ComprobanteVenta } from '../../models/comprobante-venta.model';
import {
  descargarPdfGenerado,
  generarPdfComprobante,
} from '../../utils/comprobante-venta-pdf.util';
import { ComprobanteVentaView } from './comprobante-venta-view';

/**
 * El PDF se aísla en un util: se sustituye para no generar archivos reales ni
 * cargar `jspdf` durante las pruebas.
 */
vi.mock('../../utils/comprobante-venta-pdf.util', () => ({
  generarPdfComprobante: vi.fn(),
  descargarPdfGenerado: vi.fn(),
  nombreArchivoPdf: vi.fn(
    (ventaId: number) =>
      `comprobante-VTA-${String(ventaId).padStart(5, '0')}.pdf`,
  ),
}));

const generarPdfMock = generarPdfComprobante as unknown as ReturnType<
  typeof vi.fn
>;
const descargarPdfMock = descargarPdfGenerado as unknown as ReturnType<
  typeof vi.fn
>;

function comprobante(extra: Partial<ComprobanteVenta> = {}): ComprobanteVenta {
  return {
    venta_id: 535,
    fecha_hora: '2026-09-19T10:00:00',
    canal: 'PRESENCIAL',
    estado_venta: 'COMPLETADA',
    total: 149.9,
    carrito_id: null,
    reserva_id: null,
    cliente: {
      id: 3,
      nombre: 'Juan',
      apellido: 'Perez',
      ci: '12345678',
      telefono: null,
    },
    empleado: { id: 9, nombres: 'Ana', apellidos: 'Quispe' },
    sucursal: {
      id: 1,
      nombre: 'Sucursal Centro',
      direccion: 'Av. Siempre Viva 123',
      telefono: '77712345',
    },
    pago: {
      pago_id: 7,
      fecha_hora: '2026-09-19T10:00:00',
      monto: 149.9,
      metodo: 'TARJETA',
      estado: 'APROBADO',
      referencia_transaccion: 'pi_3TestABC',
      pasarela: 'STRIPE',
    },
    items: [
      {
        detalle_venta_id: 1,
        inventario_id: 2,
        producto_id: 3,
        producto_nombre: 'Polo Premium Piqué',
        variante_producto_id: 4,
        sku: 'POL-PIQ-NEG-M',
        talla_nombre: 'M',
        color_nombre: 'Negro',
        cantidad: 1,
        precio_unitario: 149.9,
        subtotal_linea: 149.9,
      },
    ],
    cantidad_total_unidades: 1,
    ...extra,
  };
}

describe('ComprobanteVentaView (CU23)', () => {
  let fixture: ComponentFixture<ComprobanteVentaView>;
  let componente: ComprobanteVentaView;

  async function setup(
    valor: ComprobanteVenta,
    plataforma: 'browser' | 'server' = 'browser',
  ): Promise<void> {
    await TestBed.configureTestingModule({
      imports: [ComprobanteVentaView],
      providers: [{ provide: PLATFORM_ID, useValue: plataforma }],
    }).compileComponents();

    fixture = TestBed.createComponent(ComprobanteVentaView);
    componente = fixture.componentInstance;
    fixture.componentRef.setInput('comprobante', valor);
    fixture.detectChanges();
  }

  function texto(): string {
    return ((fixture.nativeElement as HTMLElement).textContent ?? '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function boton(etiqueta: string): HTMLButtonElement | undefined {
    return (
      Array.from(
        (fixture.nativeElement as HTMLElement).querySelectorAll('button'),
      ) as HTMLButtonElement[]
    ).find((elemento) =>
      (elemento.textContent ?? '').replace(/\s+/g, ' ').includes(etiqueta),
    );
  }

  beforeEach(() => {
    generarPdfMock.mockReset();
    descargarPdfMock.mockReset();
  });

  it('renderiza el comprobante y el código visual VTA-00535', async () => {
    await setup(comprobante());

    expect(texto()).toContain('COMPROBANTE DE VENTA');
    expect(texto()).toContain('VTA-00535');
    expect(texto()).toContain('Sucursal Centro');
    expect(texto()).toContain('Av. Siempre Viva 123');
    expect(texto()).toContain('Juan Perez');
    expect(texto()).toContain('Ana Quispe');
    expect(texto()).toContain('Gracias por tu compra.');
  });

  it('muestra "Cliente general" cuando la venta no tiene cliente', async () => {
    await setup(comprobante({ cliente: null }));

    expect(texto()).toContain('Cliente general');
    expect(texto()).not.toContain('undefined');
    expect(texto()).not.toContain('null');
    // No se inventa documento si el backend no lo devuelve.
    expect(texto()).not.toContain('Documento');
  });

  it('sin empleado (WEB) no muestra cajero ficticio ni undefined', async () => {
    await setup(
      comprobante({ canal: 'WEB', empleado: null, reserva_id: null }),
    );

    expect(texto()).not.toContain('Cajero');
    expect(texto()).toContain('Venta en línea');
    expect(texto()).not.toContain('undefined');
    expect(texto()).not.toContain('null');
    expect(texto()).not.toContain('N/A');
  });

  it('renderiza los items con talla, color, precio unitario y subtotal', async () => {
    await setup(
      comprobante({
        items: [
          {
            detalle_venta_id: 1,
            inventario_id: 2,
            producto_id: 3,
            producto_nombre: 'Polo Premium Piqué',
            variante_producto_id: 4,
            sku: 'POL-PIQ-NEG-M',
            talla_nombre: 'M',
            color_nombre: 'Negro',
            cantidad: 2,
            precio_unitario: 74.95,
            subtotal_linea: 149.9,
          },
        ],
        cantidad_total_unidades: 2,
        total: 149.9,
      }),
    );

    expect(texto()).toContain('Polo Premium Piqué');
    expect(texto()).toContain('M · Negro');
    expect(texto()).toContain('SKU POL-PIQ-NEG-M');
    expect(texto()).toContain('Bs 74.95');
    expect(texto()).toContain('Bs 149.90');
    expect(texto()).toContain('2 unidades');
  });

  it('muestra el total del backend en Bs (no recalcula)', async () => {
    await setup(
      comprobante({
        total: 300.5,
        items: [
          {
            detalle_venta_id: 1,
            inventario_id: 2,
            producto_id: 3,
            producto_nombre: 'Camisa Oxford',
            variante_producto_id: 4,
            sku: 'OXF-M-NEG',
            talla_nombre: 'M',
            color_nombre: 'Negro',
            cantidad: 1,
            precio_unitario: 100,
            subtotal_linea: 100,
          },
        ],
      }),
    );

    expect(texto()).toContain('Total');
    expect(texto()).toContain('Bs 300.50');
  });

  it('muestra el pago APROBADO, su método y la pasarela real', async () => {
    await setup(comprobante());

    expect(texto()).toContain('APROBADO');
    expect(texto()).toContain('Tarjeta');
    expect(texto()).toContain('STRIPE');
    expect(texto()).toContain('#7');
  });

  it('nunca muestra datos sensibles de tarjeta', async () => {
    await setup(comprobante());

    expect(texto().toLowerCase()).not.toContain('cvv');
    expect(texto().toLowerCase()).not.toContain('pan ');
  });

  it('descarga el PDF con nombre comprobante-VTA-00535.pdf', async () => {
    await setup(comprobante());
    const blob = new Blob(['%PDF'], { type: 'application/pdf' });
    generarPdfMock.mockResolvedValue(blob);

    componente.descargarPdf();
    await Promise.resolve();
    await Promise.resolve();

    expect(generarPdfMock).toHaveBeenCalledTimes(1);
    expect(descargarPdfMock).toHaveBeenCalledWith(
      blob,
      'comprobante-VTA-00535.pdf',
    );
    expect(componente.descargando()).toBe(false);
  });

  it('no genera dos PDF simultáneos (una descarga a la vez)', async () => {
    await setup(comprobante());
    let resolver!: (valor: Blob) => void;
    const pendiente = new Promise<Blob>(
      (resolve) => (resolver = resolve),
    );
    generarPdfMock.mockReturnValue(pendiente);

    componente.descargarPdf();
    componente.descargarPdf();
    fixture.detectChanges();

    expect(generarPdfMock).toHaveBeenCalledTimes(1);
    expect(componente.descargando()).toBe(true);
    expect(componente.puedeDescargar()).toBe(false);
    expect(boton('DESCARGANDO')?.disabled).toBe(true);

    resolver(new Blob(['%PDF'], { type: 'application/pdf' }));
    await Promise.resolve();
    await Promise.resolve();
    fixture.detectChanges();

    expect(descargarPdfMock).toHaveBeenCalledTimes(1);
    expect(componente.descargando()).toBe(false);
    expect(componente.puedeDescargar()).toBe(true);
  });

  it('si el PDF falla muestra un mensaje controlado', async () => {
    await setup(comprobante());
    generarPdfMock.mockRejectedValue(new Error('boom'));

    componente.descargarPdf();
    await Promise.resolve();
    await Promise.resolve();
    fixture.detectChanges();

    expect(componente.error()).toBe(
      'No pudimos generar el PDF. Intenta nuevamente.',
    );
    expect(texto()).toContain('No pudimos generar el PDF');
    expect(texto()).not.toContain('boom');
  });

  it('imprime solo la hoja del comprobante (sin acciones ni fondo)', async () => {
    await setup(comprobante());
    let htmlImpreso = '';
    const spy = vi
      .spyOn(componente, 'imprimirDocumento')
      .mockImplementation((ventana: Window) => {
        htmlImpreso = ventana.document.documentElement.outerHTML;
        ventana.dispatchEvent(new Event('afterprint'));
      });

    componente.imprimirComprobante();

    expect(spy).toHaveBeenCalledTimes(1);
    expect(htmlImpreso).toContain('COMPROBANTE DE VENTA');
    expect(htmlImpreso).toContain('VTA-00535');
    expect(htmlImpreso).not.toContain('DESCARGAR PDF');
    expect(htmlImpreso).not.toContain('IMPRIMIR');
    expect(htmlImpreso).not.toContain('VOLVER');
    expect(componente.imprimiendo()).toBe(false);
    expect(document.querySelectorAll('iframe').length).toBe(0);
  });

  it('no abre dos diálogos de impresión a la vez', async () => {
    await setup(comprobante());
    const spy = vi
      .spyOn(componente, 'imprimirDocumento')
      .mockImplementation(() => undefined);

    componente.imprimirComprobante();
    componente.imprimirComprobante();

    expect(spy).toHaveBeenCalledTimes(1);
    expect(componente.imprimiendo()).toBe(true);
    expect(componente.puedeImprimir()).toBe(false);

    // El ciclo se libera con `afterprint` (o con el respaldo temporizado).
    document
      .querySelector('iframe')
      ?.contentWindow?.dispatchEvent(new Event('afterprint'));
    expect(componente.imprimiendo()).toBe(false);
    expect(document.querySelectorAll('iframe').length).toBe(0);
  });

  it('en SSR (servidor) no usa APIs de navegador', async () => {
    await setup(comprobante(), 'server');

    expect(() => componente.imprimirComprobante()).not.toThrow();
    expect(() => componente.descargarPdf()).not.toThrow();

    expect(document.querySelectorAll('iframe').length).toBe(0);
    expect(generarPdfMock).not.toHaveBeenCalled();
    expect(texto()).toContain('COMPROBANTE DE VENTA');
  });
});
