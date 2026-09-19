import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
  ActivatedRoute,
  convertToParamMap,
  provideRouter,
} from '@angular/router';
import { of } from 'rxjs';

import { ToastService } from '../../../../core/services/toast.service';
import { CarritoDetalle } from '../../models/carrito.model';
import { CarritoService } from '../../services/carrito.service';
import { CarritoDetallePage } from './carrito-detalle-page';

const CARRITO: CarritoDetalle = {
  carrito_id: 7,
  sucursal_id: 2,
  sucursal_nombre: 'Sucursal Centro',
  estado: 'ACTIVO',
  fecha_creacion: '2026-09-18T10:00:00+00:00',
  fecha_actualizacion: '2026-09-18T10:05:00+00:00',
  items: [
    {
      detalle_id: 1,
      inventario_id: 9,
      producto_id: 8,
      producto_nombre: 'Camisa Oxford',
      precio_unitario: 149.9,
      imagen_principal: null,
      variante_producto_id: 3,
      sku: 'OXF-M-NEG',
      talla_id: 2,
      talla_nombre: 'M',
      color_id: 1,
      color_nombre: 'Negro',
      temporada_id: 1,
      temporada_nombre: 'Primavera-Verano 2026',
      cantidad: 2,
      stock_disponible: 10,
      subtotal_linea: 299.8,
    },
  ],
  cantidad_total_unidades: 2,
  subtotal_carrito: 299.8,
};

/**
 * Regresión de CU15 tras integrar CU16: el carrito sigue funcionando y ahora
 * ofrece "RESERVAR PRENDAS" sin cambiar el comportamiento de "IR A PAGAR".
 */
describe('CarritoDetallePage (regresión CU15 + CU16)', () => {
  let fixture: ComponentFixture<CarritoDetallePage>;
  let toast: any;

  async function setup() {
    toast = { mostrar: vi.fn(), toasts: signal([]), cerrar: vi.fn() };
    const carritoService = {
      totalCarritosActivos: signal(0),
      carritos: signal([]),
      cargandoLista: signal(false),
      obtenerCarrito: vi.fn(() => of(CARRITO)),
      listarCarritos: vi.fn(() => of({ items: [], total_carritos_activos: 0 })),
      estaActivo: (detalle: { estado?: string }) =>
        (detalle?.estado ?? '').trim().toUpperCase() === 'ACTIVO',
      refrescarContador: vi.fn(),
      limpiar: vi.fn(),
      agregarItem: vi.fn(),
      actualizarCantidad: vi.fn(),
      eliminarDetalle: vi.fn(),
      eliminarCarrito: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [CarritoDetallePage],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: CarritoService, useValue: carritoService },
        { provide: ToastService, useValue: toast },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: { paramMap: convertToParamMap({ carrito_id: '7' }) },
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(CarritoDetallePage);
    fixture.detectChanges();
  }

  it('sigue mostrando el carrito con sus líneas', async () => {
    await setup();
    const html: string = fixture.nativeElement.textContent;
    expect(html).toContain('Camisa Oxford');
    expect(html).toContain('Sucursal Centro');
    expect(html).toContain('299.80');
  });

  it('ofrece RESERVAR PRENDAS apuntando a /reservas/nueva/:carrito_id', async () => {
    await setup();
    const enlace = fixture.nativeElement.querySelector(
      'a.cdet__reservar',
    ) as HTMLAnchorElement;

    expect(enlace).toBeTruthy();
    expect(enlace.getAttribute('href')).toBe('/reservas/nueva/7');
    expect((enlace.textContent ?? '').trim()).toContain('RESERVAR PRENDAS');
  });

  it('conserva el botón IR A PAGAR con su aviso de próximamente', async () => {
    await setup();
    const botones = Array.from(
      fixture.nativeElement.querySelectorAll('button'),
    ) as HTMLButtonElement[];
    const pagar = botones.find((boton) =>
      (boton.textContent ?? '').includes('IR A PAGAR'),
    );

    expect(pagar).toBeTruthy();
    pagar?.click();
    expect(toast.mostrar).toHaveBeenCalledWith('Disponible próximamente', 'info');
  });
});
