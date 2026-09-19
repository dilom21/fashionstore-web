import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
  ActivatedRoute,
  Router,
  convertToParamMap,
  provideRouter,
} from '@angular/router';
import { of, throwError } from 'rxjs';

import { ToastService } from '../../../../core/services/toast.service';
import { AuthService } from '../../../autenticacion-seguridad/auth/services/auth.service';
import {
  AtencionReservaDetalle,
  AtencionReservaItem,
} from '../../models/atencion-reserva.model';
import { AtencionReservasService } from '../../services/atencion-reservas.service';
import { AtenderReservaPage } from './atender-reserva-page';

const ITEM_A: AtencionReservaItem = {
  detalle_id: 1,
  inventario_id: 17,
  producto_id: 4,
  producto_nombre: 'Polo Premium Piqué',
  imagen_principal: null,
  variante_producto_id: 12,
  sku: 'POL-PIQ-NEG-M',
  talla_id: 1,
  talla_nombre: 'M',
  color_id: 3,
  color_nombre: 'Negro',
  temporada_id: 2,
  temporada_nombre: 'Otoño 2026',
  cantidad_reservada: 3,
};

const ITEM_B: AtencionReservaItem = {
  ...ITEM_A,
  detalle_id: 2,
  inventario_id: 318,
  producto_nombre: 'Camisa Oxford',
  sku: 'CAM-OXF-BLA-L',
  talla_nombre: 'L',
  color_nombre: 'Blanco',
};

function detalle(
  estado: AtencionReservaDetalle['estado'] = 'CONFIRMADA',
  items: AtencionReservaItem[] = [ITEM_A, ITEM_B],
): AtencionReservaDetalle {
  return {
    reserva_id: 15,
    cliente_id: 3,
    cliente_nombre: 'Ana',
    cliente_apellido: 'Quispe',
    cliente_telefono: '70000000',
    sucursal_id: 2,
    sucursal_nombre: 'Sucursal Centro',
    fecha_reserva: '2026-09-18T11:00:00+00:00',
    fecha_atencion: '2026-09-20T10:00:00',
    estado,
    observacion: null,
    items,
    cantidad_total_unidades: items.reduce(
      (total, item) => total + item.cantidad_reservada,
      0,
    ),
  };
}

describe('AtenderReservaPage (CU18)', () => {
  let fixture: ComponentFixture<AtenderReservaPage>;
  let componente: AtenderReservaPage;
  let atencionService: any;
  let toast: any;
  let router: Router;

  async function setup(estado: AtencionReservaDetalle['estado'] = 'CONFIRMADA') {
    atencionService = {
      obtenerReserva: vi.fn(() => of(detalle(estado))),
      listarReservas: vi.fn(),
      esAtendible: (valor: string) => valor === 'CONFIRMADA',
      prepararVenta: vi.fn(() =>
        of({
          reserva_id: 15,
          sucursal_id: 2,
          estado: 'CONFIRMADA',
          items: [
            { inventario_id: 17, cantidad_reservada: 3, cantidad_compra: 3, cantidad_no_compra: 0 },
            { inventario_id: 318, cantidad_reservada: 3, cantidad_compra: 3, cantidad_no_compra: 0 },
          ],
          total_unidades_reservadas: 6,
          total_unidades_compra: 6,
          total_unidades_no_compra: 0,
          venta_registrada: false,
          reserva_modificada: false,
        }),
      ),
      finalizarSinCompra: vi.fn(() => of(detalle('ATENDIDA'))),
    };
    toast = { mostrar: vi.fn(), toasts: signal([]), cerrar: vi.fn() };

    await TestBed.configureTestingModule({
      imports: [AtenderReservaPage],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: { paramMap: convertToParamMap({ reserva_id: '15' }) },
          },
        },
        { provide: AtencionReservasService, useValue: atencionService },
        {
          provide: AuthService,
          useValue: { cerrarSesion: vi.fn(), esEncargadoSucursal: () => true },
        },
        { provide: ToastService, useValue: toast },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AtenderReservaPage);
    componente = fixture.componentInstance;
    fixture.detectChanges();
    router = TestBed.inject(Router);
  }

  function texto(): string {
    return ((fixture.nativeElement as HTMLElement).textContent ?? '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function tarjetas(): HTMLElement[] {
    return Array.from(fixture.nativeElement.querySelectorAll('.par'));
  }

  function botonDe(tarjeta: HTMLElement, clase: string): HTMLButtonElement {
    return tarjeta.querySelector(`.${clase}`) as HTMLButtonElement;
  }

  function cantidadDe(indice: number): string {
    return (
      tarjetas()[indice].querySelector('.par__cantidad')?.textContent ?? ''
    ).trim();
  }

  function checkboxDe(indice: number): HTMLInputElement {
    return tarjetas()[indice].querySelector(
      '.par__check-input',
    ) as HTMLInputElement;
  }

  function botonPrincipal(): HTMLButtonElement | undefined {
    return Array.from(
      fixture.nativeElement.querySelectorAll('.atd__card button'),
    ).find(
      (boton) =>
        ((boton as HTMLButtonElement).textContent ?? '')
          .replace(/\s+/g, ' ')
          .trim()
          .includes('VENTA') ||
        ((boton as HTMLButtonElement).textContent ?? '')
          .replace(/\s+/g, ' ')
          .trim()
          .includes('FINALIZAR'),
    ) as HTMLButtonElement | undefined;
  }

  function botonDialogo(etiqueta: string): HTMLButtonElement | undefined {
    const dialogo = fixture.nativeElement.querySelector('app-confirm-dialog');
    if (dialogo === null) {
      return undefined;
    }
    return (
      Array.from(dialogo.querySelectorAll('button')) as HTMLButtonElement[]
    ).find((boton) => (boton.textContent ?? '').trim() === etiqueta);
  }

  it('consume el detalle real y muestra la información de la reserva', async () => {
    await setup();

    expect(atencionService.obtenerReserva).toHaveBeenCalledWith(15);
    expect(texto()).toContain('RES-00015');
    expect(texto()).toContain('Información de la reserva');
    expect(texto()).toContain('Ana Quispe');
    expect(texto()).toContain('70000000');
    expect(texto()).toContain('Sucursal Centro');
    expect(texto()).toContain('CONFIRMADA');
    expect(texto()).toContain('18/09/2026');
    expect(texto()).toContain('20/09/2026 10:00');
    // Prendas con su metadata.
    expect(texto()).toContain('Polo Premium Piqué');
    expect(texto()).toContain('SKU: POL-PIQ-NEG-M');
    expect(texto()).toContain('M · Negro');
    expect(texto()).toContain('Camisa Oxford');
  });

  it('los ítems aparecen inicialmente seleccionados con la cantidad reservada', async () => {
    await setup();

    expect(tarjetas().length).toBe(2);
    expect(checkboxDe(0).checked).toBe(true);
    expect(checkboxDe(1).checked).toBe(true);
    expect(cantidadDe(0)).toBe('3');
    expect(cantidadDe(1)).toBe('3');
    expect(texto()).toContain('Reservadas: 3');
  });

  it('el resumen lateral refleja reservadas, a comprar y no adquiridas', async () => {
    await setup();
    expect(texto()).toContain('Unidades reservadas 6');
    expect(texto()).toContain('A comprar 6');
    expect(texto()).toContain('No adquiridas 0');

    // Ajuste local: 2 unidades de la primera prenda.
    botonDe(tarjetas()[0], 'par__restar').click();
    fixture.detectChanges();

    expect(texto()).toContain('A comprar 5');
    expect(texto()).toContain('No adquiridas 1');
    // Sin peticiones por cambios locales.
    expect(atencionService.prepararVenta).not.toHaveBeenCalled();
  });

  it('el botón "-" respeta el mínimo de 1 unidad', async () => {
    await setup();
    const restar = () => botonDe(tarjetas()[0], 'par__restar');

    restar().click();
    fixture.detectChanges();
    expect(cantidadDe(0)).toBe('2');

    restar().click();
    fixture.detectChanges();
    expect(cantidadDe(0)).toBe('1');
    // Ya no se puede bajar de 1: para 0 hay que desmarcar.
    expect(restar().disabled).toBe(true);
    restar().click();
    fixture.detectChanges();
    expect(cantidadDe(0)).toBe('1');
  });

  it('el botón "+" respeta la cantidad reservada', async () => {
    await setup();
    // Empieza en el máximo (3): "+" deshabilitado.
    expect(botonDe(tarjetas()[0], 'par__sumar').disabled).toBe(true);

    botonDe(tarjetas()[0], 'par__restar').click();
    fixture.detectChanges();
    expect(cantidadDe(0)).toBe('2');
    expect(botonDe(tarjetas()[0], 'par__sumar').disabled).toBe(false);

    botonDe(tarjetas()[0], 'par__sumar').click();
    fixture.detectChanges();
    expect(cantidadDe(0)).toBe('3');
    expect(botonDe(tarjetas()[0], 'par__sumar').disabled).toBe(true);
  });

  it('desmarcar deja la cantidad en 0 y deshabilita los controles', async () => {
    await setup();

    checkboxDe(0).click();
    fixture.detectChanges();

    expect(checkboxDe(0).checked).toBe(false);
    expect(cantidadDe(0)).toBe('0');
    expect(tarjetas()[0].classList.contains('par--inactiva')).toBe(true);
    expect(botonDe(tarjetas()[0], 'par__restar').disabled).toBe(true);
    expect(botonDe(tarjetas()[0], 'par__sumar').disabled).toBe(true);
    expect(texto()).toContain('A comprar 3');
    expect(texto()).toContain('No adquiridas 3');
  });

  it('volver a marcar restaura la última cantidad positiva', async () => {
    await setup();

    // Caso 1: estaba en el máximo (3).
    checkboxDe(0).click();
    fixture.detectChanges();
    checkboxDe(0).click();
    fixture.detectChanges();
    expect(cantidadDe(0)).toBe('3');

    // Caso 2: el empleado había ajustado a 2 antes de desmarcar.
    botonDe(tarjetas()[0], 'par__restar').click();
    fixture.detectChanges();
    expect(cantidadDe(0)).toBe('2');
    checkboxDe(0).click();
    fixture.detectChanges();
    checkboxDe(0).click();
    fixture.detectChanges();
    expect(cantidadDe(0)).toBe('2');
  });

  it('el botón principal cambia según la selección', async () => {
    await setup();

    expect(botonPrincipal()?.textContent).toContain('CONTINUAR A VENTA');
    expect(texto()).not.toContain('FINALIZAR SIN COMPRA');

    checkboxDe(0).click();
    checkboxDe(1).click();
    fixture.detectChanges();

    expect(botonPrincipal()?.textContent).toContain('FINALIZAR SIN COMPRA');
    expect(texto()).not.toContain('CONTINUAR A VENTA');
  });

  it('preparar venta envía solo las líneas con cantidad mayor a 0', async () => {
    await setup();

    botonDe(tarjetas()[0], 'par__restar').click();
    checkboxDe(1).click();
    fixture.detectChanges();

    botonPrincipal()?.click();
    fixture.detectChanges();

    expect(atencionService.prepararVenta).toHaveBeenCalledWith(15, {
      items: [{ inventario_id: 17, cantidad_compra: 2 }],
    });
  });

  it('preparar venta no marca ATENDIDA ni simula una venta', async () => {
    await setup();

    botonPrincipal()?.click();
    fixture.detectChanges();

    expect(atencionService.prepararVenta).toHaveBeenCalledWith(15, {
      items: [
        { inventario_id: 17, cantidad_compra: 3 },
        { inventario_id: 318, cantidad_compra: 3 },
      ],
    });
    // La reserva sigue CONFIRMADA: no se libera ni se atiende nada.
    expect(componente.detalle()?.estado).toBe('CONFIRMADA');
    expect(toast.mostrar).toHaveBeenCalledWith(
      'Selección validada. La reserva sigue confirmada.',
      'ok',
    );

    expect(texto()).toContain('Selección validada');
    expect(texto()).toContain(
      'Las prendas seleccionadas están listas para continuar al proceso de venta.',
    );
    expect(texto()).toContain('Módulo de Venta/Pago pendiente de integración.');

    const cta = Array.from(
      fixture.nativeElement.querySelectorAll('.atd__modal-acciones button'),
    ).find((boton) =>
      ((boton as HTMLButtonElement).textContent ?? '').includes(
        'Continuar a venta',
      ),
    ) as HTMLButtonElement;
    expect(cta.disabled).toBe(true);

    expect(texto()).not.toContain('ATENDIDA');
    expect(texto()).not.toContain('Venta realizada');
  });

  it('finalizar sin compra pide confirmación obligatoria', async () => {
    await setup();

    checkboxDe(0).click();
    checkboxDe(1).click();
    fixture.detectChanges();

    botonPrincipal()?.click();
    fixture.detectChanges();

    expect(texto()).toContain('¿Finalizar la atención sin compra?');
    expect(texto()).toContain(
      'Todas las unidades reservadas serán liberadas.',
    );
    expect(atencionService.finalizarSinCompra).not.toHaveBeenCalled();
  });

  it('cancelar la confirmación no llama al backend', async () => {
    await setup();

    checkboxDe(0).click();
    checkboxDe(1).click();
    fixture.detectChanges();
    botonPrincipal()?.click();
    fixture.detectChanges();

    botonDialogo('Volver')?.click();
    fixture.detectChanges();

    expect(atencionService.finalizarSinCompra).not.toHaveBeenCalled();
    expect(componente.confirmarFinalizar()).toBe(false);
  });

  it('confirmar finaliza la atención y deja la pantalla en solo lectura', async () => {
    await setup();

    checkboxDe(0).click();
    checkboxDe(1).click();
    fixture.detectChanges();
    componente.observacion.setValue('Cliente no encontró su talla');
    botonPrincipal()?.click();
    fixture.detectChanges();

    botonDialogo('Finalizar sin compra')?.click();
    fixture.detectChanges();

    expect(atencionService.finalizarSinCompra).toHaveBeenCalledWith(
      15,
      'Cliente no encontró su talla',
    );
    expect(componente.detalle()?.estado).toBe('ATENDIDA');
    expect(toast.mostrar).toHaveBeenCalledWith(
      'Atención finalizada sin compra.',
      'ok',
    );

    // Vista de solo lectura: sin checkbox ni +/- editables y sin acción.
    expect(texto()).toContain('ATENCIÓN FINALIZADA');
    expect(checkboxDe(0).disabled).toBe(true);
    expect(botonDe(tarjetas()[0], 'par__restar').disabled).toBe(true);
    expect(botonDe(tarjetas()[0], 'par__sumar').disabled).toBe(true);
    expect(botonPrincipal()).toBeUndefined();
    expect(
      (fixture.nativeElement.querySelector('.atd__textarea') as HTMLTextAreaElement)
        .disabled,
    ).toBe(true);
    expect(texto()).toContain('Volver a reservas por atender');
  });

  it('un 409 al validar no altera la reserva local', async () => {
    await setup();
    atencionService.prepararVenta.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 409 })),
    );

    botonPrincipal()?.click();
    fixture.detectChanges();

    expect(toast.mostrar).toHaveBeenCalledWith(
      'La reserva ya no se encuentra disponible para esta operación.',
      'error',
    );
    expect(componente.detalle()?.estado).toBe('CONFIRMADA');
    expect(componente.resultado()).toBeNull();
    expect(texto()).not.toContain('ATENDIDA');
  });

  it('un 404 al finalizar vuelve al listado', async () => {
    await setup();
    const navegar = vi.spyOn(router, 'navigateByUrl');
    atencionService.finalizarSinCompra.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 404 })),
    );

    checkboxDe(0).click();
    checkboxDe(1).click();
    fixture.detectChanges();
    botonPrincipal()?.click();
    fixture.detectChanges();
    botonDialogo('Finalizar sin compra')?.click();
    fixture.detectChanges();

    expect(toast.mostrar).toHaveBeenCalled();
    expect(navegar).toHaveBeenCalledWith('/personal/reservas/atencion');
    expect(componente.detalle()?.estado).toBe('CONFIRMADA');
  });

  it('un 403 al cargar el detalle se informa sin romper', async () => {
    await setup();
    atencionService.obtenerReserva.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 403 })),
    );

    componente.cargar(15);
    fixture.detectChanges();

    expect(texto()).toContain('No pudimos cargar la reserva');
    expect(texto()).toContain('otra sucursal');
  });

  it('una reserva no CONFIRMADA se muestra en solo lectura', async () => {
    await setup('ATENDIDA');

    expect(texto()).toContain('ATENCIÓN FINALIZADA');
    expect(checkboxDe(0).disabled).toBe(true);
    expect(botonPrincipal()).toBeUndefined();
    expect(
      (fixture.nativeElement.querySelector('.atd__textarea') as HTMLTextAreaElement)
        .disabled,
    ).toBe(true);
  });

  it('CU18 no ofrece confirmar ni cancelar (eso es CU16/CU17)', async () => {
    await setup();
    expect(texto()).not.toContain('Confirmar reserva');
    expect(texto()).not.toContain('Cancelar reserva');
    expect(texto()).not.toContain('Marcar entregada');
    expect(texto()).not.toContain('Marcar lista');
  });
});

