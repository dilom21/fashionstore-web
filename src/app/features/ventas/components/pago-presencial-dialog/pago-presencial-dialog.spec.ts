import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';

import { PagoPresencialResponse } from '../../models/pago-presencial.model';
import { PagoPresencialService } from '../../services/pago-presencial.service';
import { PagoPresencialDialog } from './pago-presencial-dialog';

function pagoAprobado(
  extra: Partial<PagoPresencialResponse> = {},
): PagoPresencialResponse {
  return {
    pago_id: 7,
    venta_id: 321,
    metodo: 'EFECTIVO',
    estado_pago: 'APROBADO',
    monto: 599.8,
    fecha: '2026-09-19T10:00:00+00:00',
    estado_venta: 'COMPLETADA',
    reserva_id: null,
    estado_reserva: null,
    ...extra,
  };
}

describe('PagoPresencialDialog (CU21)', () => {
  let fixture: ComponentFixture<PagoPresencialDialog>;
  let componente: PagoPresencialDialog;
  let pagoService: any;

  async function setup(overrides: Record<string, unknown> = {}) {
    pagoService = {
      registrarPresencial: vi.fn(() => of(pagoAprobado())),
      ...overrides,
    };

    await TestBed.configureTestingModule({
      imports: [PagoPresencialDialog],
      providers: [{ provide: PagoPresencialService, useValue: pagoService }],
    }).compileComponents();

    fixture = TestBed.createComponent(PagoPresencialDialog);
    componente = fixture.componentInstance;
    fixture.componentRef.setInput('ventaId', 321);
    fixture.componentRef.setInput('total', 599.8);
    fixture.componentRef.setInput('estadoVenta', 'PENDIENTE');
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
        fixture.nativeElement.querySelectorAll('button'),
      ) as HTMLButtonElement[]
    ).find((b) => (b.textContent ?? '').replace(/\s+/g, ' ').includes(etiqueta));
  }

  function seleccionar(valor: string): void {
    const radio = fixture.nativeElement.querySelector(
      `input[value="${valor}"]`,
    ) as HTMLInputElement;
    radio.click();
    fixture.detectChanges();
  }

  it('renderiza la venta, el total y el estado actual', async () => {
    await setup();

    expect(texto()).toContain('Registrar pago presencial');
    expect(texto()).toContain('Venta #321');
    expect(texto()).toContain('Bs 599.80');
    expect(texto()).toContain('PENDIENTE');
  });

  it('muestra exactamente los 5 métodos reales', async () => {
    await setup();

    const etiquetas = Array.from(
      fixture.nativeElement.querySelectorAll(
        '.ppd__metodo span',
      ) as NodeListOf<HTMLElement>,
    ).map((n) => (n.textContent ?? '').trim());

    expect(etiquetas).toEqual([
      'Efectivo',
      'Tarjeta',
      'Transferencia',
      'QR',
      'Otro',
    ]);
  });

  it('exige un método antes de continuar', async () => {
    await setup();

    boton('REGISTRAR PAGO')?.click();
    fixture.detectChanges();

    expect(componente.error()).toBe('Selecciona un método de pago.');
    expect(pagoService.registrarPresencial).not.toHaveBeenCalled();
  });

  it('pide confirmación explícita antes de llamar al backend', async () => {
    await setup();
    seleccionar('EFECTIVO');

    boton('REGISTRAR PAGO')?.click();
    fixture.detectChanges();

    expect(componente.confirmando()).toBe(true);
    expect(texto()).toContain('¿Registrar el pago de');
    expect(texto()).toContain('Efectivo');
    expect(pagoService.registrarPresencial).not.toHaveBeenCalled();
  });

  it('al confirmar envía solo venta_id + metodo y muestra APROBADO', async () => {
    await setup();
    seleccionar('EFECTIVO');
    boton('REGISTRAR PAGO')?.click();
    fixture.detectChanges();

    boton('CONFIRMAR PAGO')?.click();
    fixture.detectChanges();

    expect(pagoService.registrarPresencial).toHaveBeenCalledWith(
      321,
      'EFECTIVO',
    );
    expect(texto()).toContain('Pago registrado');
    expect(texto()).toContain('#7');
    expect(texto()).toContain('#321');
    expect(texto()).toContain('APROBADO');
    expect(texto()).toContain('COMPLETADA');
  });

  it('emite pagado con la respuesta real', async () => {
    await setup();
    let emitido: PagoPresencialResponse | undefined;
    componente.pagado.subscribe((p) => (emitido = p));

    seleccionar('TARJETA');
    boton('REGISTRAR PAGO')?.click();
    fixture.detectChanges();
    boton('CONFIRMAR PAGO')?.click();
    fixture.detectChanges();

    expect(emitido?.pago_id).toBe(7);
    expect(emitido?.estado_pago).toBe('APROBADO');
  });

  it('refleja el estado de la reserva si el response lo incluye', async () => {
    await setup({
      registrarPresencial: vi.fn(() =>
        of(
          pagoAprobado({
            reserva_id: 15,
            estado_reserva: 'ATENDIDA',
          }),
        ),
      ),
    });
    seleccionar('QR');
    boton('REGISTRAR PAGO')?.click();
    fixture.detectChanges();
    boton('CONFIRMAR PAGO')?.click();
    fixture.detectChanges();

    expect(texto()).toContain('ATENDIDA');
  });

  it('el doble click no registra dos veces', async () => {
    await setup();
    seleccionar('EFECTIVO');
    boton('REGISTRAR PAGO')?.click();
    fixture.detectChanges();

    boton('CONFIRMAR PAGO')?.click();
    boton('CONFIRMAR PAGO')?.click();
    fixture.detectChanges();

    expect(pagoService.registrarPresencial).toHaveBeenCalledTimes(1);
  });

  it('tras el éxito bloquea cualquier nuevo pago', async () => {
    await setup();
    seleccionar('EFECTIVO');
    boton('REGISTRAR PAGO')?.click();
    fixture.detectChanges();
    boton('CONFIRMAR PAGO')?.click();
    fixture.detectChanges();

    expect(componente.pagoRegistrado()).toBe(true);
    expect(texto()).not.toContain('Método de pago');
    expect(boton('REGISTRAR PAGO')).toBeUndefined();
    expect(boton('CONFIRMAR PAGO')).toBeUndefined();
    expect(boton('Entendido')).toBeDefined();
  });

  it('401 emite sesionExpirada', async () => {
    await setup({
      registrarPresencial: vi.fn(() =>
        throwError(() => new HttpErrorResponse({ status: 401 })),
      ),
    });
    let expirada = false;
    componente.sesionExpirada.subscribe(() => (expirada = true));

    seleccionar('EFECTIVO');
    boton('REGISTRAR PAGO')?.click();
    fixture.detectChanges();
    boton('CONFIRMAR PAGO')?.click();
    fixture.detectChanges();

    expect(expirada).toBe(true);
    expect(componente.pagoRegistrado()).toBe(false);
  });

  it('403 muestra la falta de permiso sin aprobar', async () => {
    await setup({
      registrarPresencial: vi.fn(() =>
        throwError(() => new HttpErrorResponse({ status: 403 })),
      ),
    });
    seleccionar('EFECTIVO');
    boton('REGISTRAR PAGO')?.click();
    fixture.detectChanges();
    boton('CONFIRMAR PAGO')?.click();
    fixture.detectChanges();

    expect(componente.error()).toBe(
      'No tienes permiso para registrar este pago.',
    );
    expect(componente.pagoRegistrado()).toBe(false);
  });

  it('404 informa que la venta ya no está disponible', async () => {
    await setup({
      registrarPresencial: vi.fn(() =>
        throwError(() => new HttpErrorResponse({ status: 404 })),
      ),
    });
    seleccionar('EFECTIVO');
    boton('REGISTRAR PAGO')?.click();
    fixture.detectChanges();
    boton('CONFIRMAR PAGO')?.click();
    fixture.detectChanges();

    expect(componente.error()).toBe('La venta ya no está disponible.');
    expect(componente.pagoRegistrado()).toBe(false);
  });

  it('409 de stock no muestra pago aprobado', async () => {
    await setup({
      registrarPresencial: vi.fn(() =>
        throwError(
          () =>
            new HttpErrorResponse({
              status: 409,
              error: { detail: 'No hay stock suficiente para confirmar la venta' },
            }),
        ),
      ),
    });
    seleccionar('EFECTIVO');
    boton('REGISTRAR PAGO')?.click();
    fixture.detectChanges();
    boton('CONFIRMAR PAGO')?.click();
    fixture.detectChanges();

    expect(componente.error()).toBe(
      'El stock cambió antes del pago. Revisa la venta.',
    );
    expect(componente.pagoRegistrado()).toBe(false);
    expect(texto()).not.toContain('Pago registrado');
  });

  it('422 informa el método inválido', async () => {
    await setup({
      registrarPresencial: vi.fn(() =>
        throwError(() => new HttpErrorResponse({ status: 422 })),
      ),
    });
    seleccionar('EFECTIVO');
    boton('REGISTRAR PAGO')?.click();
    fixture.detectChanges();
    boton('CONFIRMAR PAGO')?.click();
    fixture.detectChanges();

    expect(componente.error()).toBe('El método de pago no es válido.');
  });

  it('error de red informa la desconexión', async () => {
    await setup({
      registrarPresencial: vi.fn(() =>
        throwError(() => new HttpErrorResponse({ status: 0 })),
      ),
    });
    seleccionar('EFECTIVO');
    boton('REGISTRAR PAGO')?.click();
    fixture.detectChanges();
    boton('CONFIRMAR PAGO')?.click();
    fixture.detectChanges();

    expect(componente.error()).toContain('No se pudo conectar con el servidor');
  });

  it('cerrar emite cerrado', async () => {
    await setup();
    let cerrado = false;
    componente.cerrado.subscribe(() => (cerrado = true));

    boton('Cancelar')?.click();
    fixture.detectChanges();

    expect(cerrado).toBe(true);
  });

  it('no captura datos sensibles de tarjeta', async () => {
    await setup();

    expect(fixture.nativeElement.querySelector('input[type="password"]')).toBeNull();
    expect(texto().toLowerCase()).not.toContain('cvv');
    expect(texto().toLowerCase()).not.toContain('pan');
  });
});
