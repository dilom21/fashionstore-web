import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';

import { ToastService } from '../../../../core/services/toast.service';
import { Producto } from '../../../administracion/catalogo/models/producto.model';
import { ProductoDetalle } from '../../../administracion/catalogo/models/producto.model';
import { ProductosService } from '../../../administracion/catalogo/services/productos.service';
import { AuthService } from '../../../autenticacion-seguridad/auth/services/auth.service';
import { PagoPresencialResponse } from '../../models/pago-presencial.model';
import { VentaPresencialResponse } from '../../models/venta-presencial.model';
import { PagoPresencialService } from '../../services/pago-presencial.service';
import { VentaPresencialService } from '../../services/venta-presencial.service';
import { VentaPresencialPage } from './venta-presencial-page';

const PRODUCTO: Producto = {
  id: 8,
  nombre: 'Camisa Oxford',
  descripcion: null,
  precio: 299.9,
  estado: true,
  categoria_id: 1,
  categoria: { id: 1, nombre: 'Camisas' },
  imagen_principal_url: null,
};

function inventario(id: number, sucursalId: number, stock: number) {
  return {
    id,
    stock_actual: stock,
    stock_reservado: 0,
    stock_disponible: stock,
    fecha_actualizacion: '2026-09-19T10:00:00',
    sucursal: {
      id: sucursalId,
      nombre: sucursalId === 2 ? 'Sucursal Centro' : 'Sucursal Sur',
      direccion: 'Calle 1',
    },
    temporada: {
      id: 1,
      nombre: 'Primavera-Verano 2026',
      fecha_inicio: '2026-01-01',
      fecha_fin: '2026-06-30',
    },
  };
}

const DETALLE: ProductoDetalle = {
  ...PRODUCTO,
  imagen_principal_url: 'https://img.test/oxford.jpg',
  recursos: [],
  variantes: [
    {
      id: 3,
      sku: 'OXF-M-NEG',
      estado: true,
      talla: { id: 2, nombre: 'M' },
      color: { id: 1, nombre: 'Negro' },
      inventarios: [inventario(17, 2, 4), inventario(19, 5, 3)],
    },
  ],
};

function venta(): VentaPresencialResponse {
  return {
    venta_id: 321,
    cliente_id: null,
    empleado_id: 9,
    sucursal_id: 2,
    sucursal_nombre: 'Sucursal Centro',
    reserva_id: null,
    canal: 'PRESENCIAL',
    estado: 'PENDIENTE',
    fecha_hora: '2026-09-19T10:00:00+00:00',
    total: 599.8,
    items: [],
    cantidad_total_unidades: 2,
  };
}

function pagoAprobado(): PagoPresencialResponse {
  return {
    pago_id: 7,
    venta_id: 321,
    metodo: 'EFECTIVO',
    estado_pago: 'APROBADO',
    monto: 599.8,
    fecha: '2026-09-19T10:05:00+00:00',
    estado_venta: 'COMPLETADA',
    reserva_id: null,
    estado_reserva: null,
  };
}

describe('VentaPresencialPage (CU20)', () => {
  let fixture: ComponentFixture<VentaPresencialPage>;
  let componente: VentaPresencialPage;
  let productosService: any;
  let ventaService: any;
  let pagoService: any;
  let auth: any;
  let toast: any;

  async function setup(authOverrides: Record<string, unknown> = {}) {
    productosService = {
      listarProductosPublicos: vi.fn(() => of([PRODUCTO])),
      obtenerProductoPublico: vi.fn(() => of(DETALLE)),
    };
    ventaService = {
      registrarVentaDirecta: vi.fn(() => of(venta())),
    };
    pagoService = {
      registrarPresencial: vi.fn(() => of(pagoAprobado())),
    };
    auth = {
      esAdministrador: () => true,
      sucursalId: () => null,
      cerrarSesion: vi.fn(),
      ...authOverrides,
    };
    toast = { mostrar: vi.fn(), toasts: signal([]), cerrar: vi.fn() };

    await TestBed.configureTestingModule({
      imports: [VentaPresencialPage],
      providers: [
        { provide: ProductosService, useValue: productosService },
        { provide: VentaPresencialService, useValue: ventaService },
        { provide: PagoPresencialService, useValue: pagoService },
        { provide: AuthService, useValue: auth },
        { provide: ToastService, useValue: toast },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(VentaPresencialPage);
    componente = fixture.componentInstance;
    fixture.detectChanges();
  }

  function texto(): string {
    return ((fixture.nativeElement as HTMLElement).textContent ?? '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  async function conCandidatos() {
    componente.actualizarTermino('camisa');
    componente.buscar();
    componente.seleccionarProducto(PRODUCTO);
    fixture.detectChanges();
  }

  it('consulta la fuente pública de catálogo al buscar', async () => {
    await setup();

    componente.actualizarTermino('  camisa  ');
    componente.buscar();
    fixture.detectChanges();

    expect(productosService.listarProductosPublicos).toHaveBeenCalledWith({
      buscar: 'camisa',
    });
    expect(componente.productos().length).toBe(1);
    expect(texto()).toContain('Camisa Oxford');
  });

  it('carga la disponibilidad real (inventario_id, sucursal y stock)', async () => {
    await setup();
    await conCandidatos();

    expect(productosService.obtenerProductoPublico).toHaveBeenCalledWith(8);
    expect(componente.candidatos().map((c) => c.inventario_id)).toEqual([
      17, 19,
    ]);
    expect(texto()).toContain('Sucursal Centro');
    expect(texto()).toContain('Stock: 4');
  });

  it('agrega, cambia cantidades y quita líneas', async () => {
    await setup();
    await conCandidatos();
    const candidato = componente.candidatos()[0];

    componente.agregar(candidato);
    fixture.detectChanges();
    expect(componente.lineas().length).toBe(1);
    expect(componente.unidades()).toBe(1);

    componente.cambiarCantidad(candidato.inventario_id, 1);
    componente.cambiarCantidad(candidato.inventario_id, 1);
    componente.cambiarCantidad(candidato.inventario_id, 1);
    expect(componente.lineas()[0].cantidad).toBe(4); // tope = stock disponible

    componente.cambiarCantidad(candidato.inventario_id, -1);
    expect(componente.lineas()[0].cantidad).toBe(3);

    componente.quitar(candidato.inventario_id);
    fixture.detectChanges();
    expect(componente.lineas().length).toBe(0);
  });

  it('no mezcla productos de sucursales distintas', async () => {
    await setup();
    await conCandidatos();

    componente.agregar(componente.candidatos()[0]); // sucursal 2
    componente.agregar(componente.candidatos()[1]); // sucursal 5
    fixture.detectChanges();

    expect(componente.lineas().length).toBe(1);
    expect(componente.sucursalVenta()).toBe(2);
    expect(toast.mostrar).toHaveBeenCalledWith(
      'Los productos deben pertenecer a una sola sucursal.',
      'error',
    );
  });

  it('resta la disponibilidad a la sucursal del CAJERO', async () => {
    await setup({ esAdministrador: () => false, sucursalId: () => 2 });
    await conCandidatos();

    expect(componente.candidatos().map((c) => c.inventario_id)).toEqual([17]);
    expect(componente.candidatos().every((c) => c.sucursal_id === 2)).toBe(true);
  });

  it('registra la venta anónima y muestra PENDIENTE DE PAGO', async () => {
    await setup();
    await conCandidatos();
    componente.agregar(componente.candidatos()[0]);
    componente.cambiarCantidad(17, 1);
    fixture.detectChanges();

    componente.registrarVenta();
    fixture.detectChanges();

    // Venta anónima: solo items, sin cliente_id.
    expect(ventaService.registrarVentaDirecta).toHaveBeenCalledWith([
      { inventario_id: 17, cantidad: 2 },
    ]);
    expect(componente.venta()?.venta_id).toBe(321);
    expect(componente.estadoVenta()).toBe('PENDIENTE DE PAGO');
    expect(texto()).toContain('Venta #321');
    expect(texto()).toContain('PENDIENTE DE PAGO');
    // CU21: el CTA ya es funcional.
    expect(componente.puedePagar()).toBe(true);
    expect(texto()).toContain('REGISTRAR PAGO');
  });

  it('el doble submit no registra dos veces', async () => {
    await setup();
    await conCandidatos();
    componente.agregar(componente.candidatos()[0]);
    fixture.detectChanges();

    componente.registrarVenta();
    componente.registrarVenta();
    fixture.detectChanges();

    expect(ventaService.registrarVentaDirecta).toHaveBeenCalledTimes(1);
  });

  it('401 cierra la sesión', async () => {
    await setup();
    await conCandidatos();
    componente.agregar(componente.candidatos()[0]);
    ventaService.registrarVentaDirecta.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 401 })),
    );

    componente.registrarVenta();
    fixture.detectChanges();

    expect(auth.cerrarSesion).toHaveBeenCalled();
    expect(componente.venta()).toBeNull();
  });

  it('403 informa la falta de permiso', async () => {
    await setup();
    await conCandidatos();
    componente.agregar(componente.candidatos()[0]);
    ventaService.registrarVentaDirecta.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 403 })),
    );

    componente.registrarVenta();
    fixture.detectChanges();

    expect(componente.error()).toBe(
      'No tienes permiso para registrar esta venta.',
    );
    expect(componente.venta()).toBeNull();
  });

  it('409 informa el conflicto de stock sin perder la selección', async () => {
    await setup();
    await conCandidatos();
    componente.agregar(componente.candidatos()[0]);
    ventaService.registrarVentaDirecta.mockReturnValue(
      throwError(
        () =>
          new HttpErrorResponse({
            status: 409,
            error: { detail: 'Stock insuficiente para la venta' },
          }),
      ),
    );

    componente.registrarVenta();
    fixture.detectChanges();

    expect(componente.error()).toBe('El stock cambió. Revisa las cantidades.');
    expect(componente.lineas().length).toBe(1);
    expect(componente.venta()).toBeNull();
  });

  it('nueva venta reinicia el estado', async () => {
    await setup();
    await conCandidatos();
    componente.agregar(componente.candidatos()[0]);
    componente.registrarVenta();
    fixture.detectChanges();

    componente.nuevaVenta();
    fixture.detectChanges();

    expect(componente.venta()).toBeNull();
    expect(componente.lineas().length).toBe(0);
    expect(componente.productos().length).toBe(0);
  });

  // ===== CU21 - Pago presencial desde la venta directa =====

  async function conVentaRegistrada() {
    await setup();
    await conCandidatos();
    componente.agregar(componente.candidatos()[0]);
    componente.registrarVenta();
    fixture.detectChanges();
  }

  it('el CTA de CU20 abre el diálogo de pago con el venta_id correcto', async () => {
    await conVentaRegistrada();

    componente.abrirPago();
    fixture.detectChanges();

    expect(componente.mostrarPago()).toBe(true);
    const dialogo = fixture.nativeElement.querySelector(
      'app-pago-presencial-dialog',
    );
    expect(dialogo).not.toBeNull();
    expect(texto()).toContain('Registrar pago presencial');
    expect(texto()).toContain('Venta #321');
  });

  it('tras el pago refleja el estado final real y oculta el CTA', async () => {
    await conVentaRegistrada();
    componente.abrirPago();
    fixture.detectChanges();

    componente.onPagado(pagoAprobado());
    fixture.detectChanges();

    expect(componente.pago()?.pago_id).toBe(7);
    expect(componente.estadoFinalVenta()).toBe('COMPLETADA');
    expect(componente.puedePagar()).toBe(false);
    expect(texto()).toContain('#7');
    expect(texto()).toContain('APROBADO');
    expect(texto()).toContain('COMPLETADA');
    expect(texto()).toContain('no admite otro pago');
  });

  it('no permite repetir el pago de la misma venta', async () => {
    await conVentaRegistrada();
    componente.onPagado(pagoAprobado());
    fixture.detectChanges();

    componente.abrirPago();
    fixture.detectChanges();

    expect(componente.mostrarPago()).toBe(false);
  });

  it('una nueva venta no hereda el pago anterior', async () => {
    await conVentaRegistrada();
    componente.onPagado(pagoAprobado());
    componente.cerrarPago();
    fixture.detectChanges();

    componente.nuevaVenta();
    fixture.detectChanges();

    expect(componente.pago()).toBeNull();
    expect(componente.mostrarPago()).toBe(false);
    expect(componente.venta()).toBeNull();
  });
});
