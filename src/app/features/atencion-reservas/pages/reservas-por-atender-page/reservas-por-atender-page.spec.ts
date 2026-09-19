import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';

import { ToastService } from '../../../../core/services/toast.service';
import { SucursalesService } from '../../../administracion/inventario/services/sucursales.service';
import { AuthService } from '../../../autenticacion-seguridad/auth/services/auth.service';
import { AtencionReservaResumen } from '../../models/atencion-reserva.model';
import { AtencionReservasService } from '../../services/atencion-reservas.service';
import { ReservasPorAtenderPage } from './reservas-por-atender-page';

function resumen(reservaId = 1): AtencionReservaResumen {
  return {
    reserva_id: reservaId,
    cliente_id: 3,
    cliente_nombre: 'Ana',
    cliente_apellido: 'Quispe',
    cliente_telefono: '70000000',
    sucursal_id: 2,
    sucursal_nombre: 'Sucursal Centro',
    fecha_reserva: '2026-09-18T11:00:00+00:00',
    fecha_atencion: '2026-09-20T10:00:00',
    estado: 'CONFIRMADA',
    observacion: null,
    cantidad_lineas: 2,
    cantidad_unidades: 3,
  };
}

describe('ReservasPorAtenderPage (CU18)', () => {
  let fixture: ComponentFixture<ReservasPorAtenderPage>;
  let componente: ReservasPorAtenderPage;
  let atencionService: any;
  let sucursalesService: any;
  let auth: any;
  let toast: any;
  let router: Router;
  let items: AtencionReservaResumen[] = [];
  let total = 0;

  async function setup(
    lista: AtencionReservaResumen[] = [resumen()],
    totalLista = lista.length,
    esAdmin = false,
  ): Promise<void> {
    items = [...lista];
    total = totalLista;
    atencionService = {
      listarReservas: vi.fn((filtros: any) =>
        of({
          items: [...items],
          total,
          limit: filtros?.limit ?? 20,
          offset: filtros?.offset ?? 0,
        }),
      ),
      obtenerReserva: vi.fn(),
      prepararVenta: vi.fn(),
      finalizarSinCompra: vi.fn(),
      esAtendible: (estado: string) => estado === 'CONFIRMADA',
    };
    sucursalesService = {
      listarSucursalesActivas: vi.fn(() =>
        of([
          { id: 2, nombre: 'Sucursal Centro' },
          { id: 3, nombre: 'Sucursal Norte' },
        ]),
      ),
      obtenerSucursal: vi.fn(() => of({ id: 2, nombre: 'Sucursal Centro' })),
    };
    auth = {
      esAdministrador: () => esAdmin,
      esEncargadoSucursal: () => !esAdmin,
      esCajero: () => false,
      sucursalId: () => (esAdmin ? null : 2),
      cerrarSesion: vi.fn(),
    };
    toast = { mostrar: vi.fn(), toasts: signal([]), cerrar: vi.fn() };

    await TestBed.configureTestingModule({
      imports: [ReservasPorAtenderPage],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AtencionReservasService, useValue: atencionService },
        { provide: SucursalesService, useValue: sucursalesService },
        { provide: AuthService, useValue: auth },
        { provide: ToastService, useValue: toast },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ReservasPorAtenderPage);
    componente = fixture.componentInstance;
    fixture.detectChanges();
    router = TestBed.inject(Router);
  }

  function texto(): string {
    return ((fixture.nativeElement as HTMLElement).textContent ?? '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function ultimaLlamada(): any {
    const llamadas = atencionService.listarReservas.mock.calls;
    return llamadas[llamadas.length - 1][0];
  }

  it('consume /atencion-reservas y muestra las reservas confirmadas', async () => {
    await setup();
    expect(atencionService.listarReservas).toHaveBeenCalled();
    expect(texto()).toContain('Atención de reservas');
    expect(texto()).toContain('Reservas confirmadas disponibles para atención.');
    expect(texto()).toContain('RES-00001');
    expect(texto()).toContain('Ana Quispe');
    expect(texto()).toContain('CONFIRMADA');
    expect(texto()).toContain('Atender');
  });

  it('no ofrece selector de sucursal (solo el tamaño de página)', async () => {
    await setup();
    expect(
      fixture.nativeElement.querySelector(
        'select[formcontrolname="sucursalId"]',
      ),
    ).toBeNull();
    // El único select de la pantalla es "Por página".
    expect(fixture.nativeElement.querySelectorAll('select').length).toBe(1);
    expect(texto()).not.toContain('Todas las sucursales');
  });

  it('envía los filtros reales sin sucursal_id', async () => {
    await setup();
    expect(ultimaLlamada().buscar).toBeUndefined();

    componente.filtrosForm.controls.fechaDesde.setValue('2026-09-01');
    expect(ultimaLlamada().fecha_desde).toBe('2026-09-01');
    componente.filtrosForm.controls.fechaHasta.setValue('2026-09-30');
    expect(ultimaLlamada().fecha_hasta).toBe('2026-09-30');
    expect(ultimaLlamada().sucursal_id).toBeUndefined();

    componente.filtrosForm.controls.buscar.setValue('ana');
    await new Promise((resolver) => setTimeout(resolver, 450));
    expect(ultimaLlamada().buscar).toBe('ana');
    expect(ultimaLlamada().sucursal_id).toBeUndefined();
  });

  it('un rango de fechas invertido no consulta al backend', async () => {
    await setup();
    componente.filtrosForm.controls.fechaHasta.setValue('2026-09-30');
    atencionService.listarReservas.mockClear();

    componente.filtrosForm.controls.fechaDesde.setValue('2026-10-15');
    expect(componente.rangoInvalido()).toBe(true);
    expect(atencionService.listarReservas).not.toHaveBeenCalled();

    fixture.detectChanges();
    expect(texto()).toContain(
      'La fecha inicial no puede ser posterior a la fecha final.',
    );
  });

  it('"Atender" navega al detalle de CU18 con el reserva_id', async () => {
    await setup([resumen(7)]);
    const navegar = vi.spyOn(router, 'navigate');

    const boton = Array.from(
      fixture.nativeElement.querySelectorAll('button'),
    ).find(
      (candidato) =>
        ((candidato as HTMLButtonElement).textContent ?? '')
          .replace(/\s+/g, ' ')
          .trim() === 'Atender',
    ) as HTMLButtonElement;

    boton.click();
    fixture.detectChanges();

    expect(navegar).toHaveBeenCalledWith(['/personal/reservas/atencion', 7]);
  });

  it('pagina con limit y offset del backend', async () => {
    const veinte = Array.from({ length: 20 }, (_, indice) =>
      resumen(indice + 1),
    );
    await setup(veinte, 45);
    expect(texto()).toContain('Mostrando 1–20 de 45');

    componente.irSiguiente();
    fixture.detectChanges();

    expect(ultimaLlamada().limit).toBe(20);
    expect(ultimaLlamada().offset).toBe(20);
    expect(texto()).toContain('Página 2 de 3');
  });

  it('muestra los estados vacíos sin tratarlos como error', async () => {
    await setup([], 0);
    expect(texto()).toContain('No hay reservas confirmadas por atender.');

    componente.filtrosForm.controls.buscar.setValue('zzz');
    await new Promise((resolver) => setTimeout(resolver, 450));
    fixture.detectChanges();
    expect(texto()).toContain(
      'No se encontraron reservas confirmadas con los filtros seleccionados.',
    );
    expect(texto()).not.toContain('No pudimos cargar las reservas');
  });

  it('un 403 se informa en la pantalla', async () => {
    await setup();
    atencionService.listarReservas.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 403 })),
    );
    componente.cargar(0);
    fixture.detectChanges();

    expect(texto()).toContain('No pudimos cargar las reservas');
    expect(texto()).toContain('otra sucursal');
  });

  it('el administrador tiene selector de sucursales reales (no hardcodeadas)', async () => {
    await setup([resumen()], 1, true);

    expect(sucursalesService.listarSucursalesActivas).toHaveBeenCalled();
    expect(
      fixture.nativeElement.querySelector(
        'select[formcontrolname="sucursalId"]',
      ),
    ).not.toBeNull();
    expect(texto()).toContain('Todas las sucursales');
    expect(texto()).toContain('Sucursal Centro');
    expect(texto()).toContain('Sucursal Norte');
    // Con "Todas las sucursales" (sin elección) no se envía sucursal_id.
    expect(ultimaLlamada().sucursal_id).toBeUndefined();
  });

  it('el administrador envía sucursal_id al elegir una sucursal', async () => {
    await setup([resumen()], 1, true);

    componente.filtrosForm.controls.sucursalId.setValue(3);
    expect(ultimaLlamada().sucursal_id).toBe(3);

    componente.filtrosForm.controls.sucursalId.setValue(null);
    expect(ultimaLlamada().sucursal_id).toBeUndefined();
  });

  it('el encargado/cajero ve su sucursal en solo lectura y no puede cambiarla', async () => {
    await setup();

    expect(
      fixture.nativeElement.querySelector(
        'select[formcontrolname="sucursalId"]',
      ),
    ).toBeNull();
    expect(texto()).toContain('Sucursal Centro');
    expect(sucursalesService.obtenerSucursal).toHaveBeenCalledWith(2);

    componente.filtrosForm.controls.fechaDesde.setValue('2026-09-01');
    expect(ultimaLlamada().sucursal_id).toBeUndefined();
  });
});
