import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { Subject, of, throwError } from 'rxjs';

import { ToastService } from '../../../../../core/services/toast.service';
import { AuthService } from '../../../../autenticacion-seguridad/auth/services/auth.service';
import { SucursalesService } from '../../../inventario/services/sucursales.service';
import {
  ReservaSucursalDetalle,
  ReservaSucursalItem,
  ReservaSucursalResumen,
} from '../../models/reserva-sucursal.model';
import { ReservasSucursalService } from '../../services/reservas-sucursal.service';
import { ReservasSucursalPage } from './reservas-sucursal-page';

function resumen(
  reservaId: number,
  estado: ReservaSucursalResumen['estado'] = 'PENDIENTE',
): ReservaSucursalResumen {
  return {
    reserva_id: reservaId,
    carrito_id: 7,
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
    cantidad_lineas: 1,
    cantidad_unidades: 2,
  };
}

const PRENDA: ReservaSucursalItem = {
  detalle_id: 55,
  inventario_id: 9,
  producto_id: 4,
  producto_nombre: 'Blazer VANTER',
  imagen_principal: null,
  variante_producto_id: 12,
  sku: 'VAN-BLZ-M-NEG',
  talla_id: 1,
  talla_nombre: 'M',
  color_id: 3,
  color_nombre: 'Negro',
  temporada_id: 2,
  temporada_nombre: 'Otoño 2026',
  cantidad: 2,
};

function detalle(
  reservaId: number,
  estado: ReservaSucursalDetalle['estado'],
  items: ReservaSucursalItem[] = [PRENDA],
): ReservaSucursalDetalle {
  const unidades = items.reduce((acumulado, item) => acumulado + item.cantidad, 0);
  return {
    ...resumen(reservaId, estado),
    items,
    cantidad_total_unidades: unidades,
  };
}

describe('ReservasSucursalPage (CU17) - ADMINISTRADOR', () => {
  let fixture: ComponentFixture<ReservasSucursalPage>;
  let componente: ReservasSucursalPage;
  let reservasService: any;
  let sucursalesService: any;
  let auth: any;
  let toast: any;
  let router: Router;
  /** Listado mutable: simula que el backend cambia al confirmar/cancelar. */
  let itemsLista: ReservaSucursalResumen[] = [];
  let totalLista = 0;

  async function setup(
    lista: ReservaSucursalResumen[] = [resumen(1, 'PENDIENTE')],
    total = lista.length,
  ): Promise<void> {
    itemsLista = [...lista];
    totalLista = total;
    reservasService = {
      listarReservas: vi.fn((filtros: any) =>
        of({
          items: [...itemsLista],
          total: totalLista,
          limit: filtros?.limit ?? 20,
          offset: filtros?.offset ?? 0,
        }),
      ),
      contarReservas: vi.fn(() => of(totalLista)),
      obtenerReserva: vi.fn(() => of(detalle(1, 'PENDIENTE'))),
      confirmarReserva: vi.fn(() => of(detalle(1, 'CONFIRMADA'))),
      cancelarReserva: vi.fn(() => of(detalle(1, 'CANCELADA'))),
      esConfirmable: (estado: string) => estado === 'PENDIENTE',
      esCancelable: (estado: string) =>
        ['PENDIENTE', 'CONFIRMADA'].includes(estado),
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
      esAdministrador: () => true,
      esEncargadoSucursal: () => false,
      puedeAtenderReservas: () => true,
      sucursalId: () => null,
      cerrarSesion: vi.fn(),
    };
    toast = { mostrar: vi.fn(), toasts: signal([]), cerrar: vi.fn() };

    await TestBed.configureTestingModule({
      imports: [ReservasSucursalPage],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ReservasSucursalService, useValue: reservasService },
        { provide: SucursalesService, useValue: sucursalesService },
        { provide: AuthService, useValue: auth },
        { provide: ToastService, useValue: toast },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ReservasSucursalPage);
    componente = fixture.componentInstance;
    fixture.detectChanges();
    router = TestBed.inject(Router);
  }

  function html(): string {
    return (fixture.nativeElement as HTMLElement).textContent ?? '';
  }

  /** Texto con espacios colapsados (los saltos de línea del template se conservan). */
  function texto(): string {
    return html().replace(/\s+/g, ' ').trim();
  }

  function botones(texto: string): HTMLButtonElement[] {
    const todos = Array.from(
      fixture.nativeElement.querySelectorAll('button'),
    ) as HTMLButtonElement[];
    return todos.filter((boton) => (boton.textContent ?? '').trim() === texto);
  }

  function seleccionarFila(indice = 0): void {
    const filas = fixture.nativeElement.querySelectorAll('tbody tr');
    (filas[indice] as HTMLElement).click();
    fixture.detectChanges();
  }

  function ultimaLlamadaListar(): any {
    const llamadas = reservasService.listarReservas.mock.calls;
    return llamadas[llamadas.length - 1][0];
  }

  it('el administrador ve el selector de sucursales reales (sin hardcodear)', async () => {
    await setup();
    expect(sucursalesService.listarSucursalesActivas).toHaveBeenCalled();

    const selector = fixture.nativeElement.querySelector(
      'select[formcontrolname="sucursalId"]',
    );
    expect(selector).not.toBeNull();
    expect(html()).toContain('Todas las sucursales');
    expect(html()).toContain('Sucursal Norte');
  });

  it('los filtros de estado y sucursal se envían al backend', async () => {
    await setup();

    componente.filtrosForm.controls.estado.setValue('PENDIENTE');
    expect(ultimaLlamadaListar().estado).toBe('PENDIENTE');
    expect(ultimaLlamadaListar().offset).toBe(0);

    componente.filtrosForm.controls.sucursalId.setValue(3);
    expect(ultimaLlamadaListar().sucursal_id).toBe(3);
  });

  it('el rango de fechas se envía y un rango invertido no consulta', async () => {
    await setup();

    componente.filtrosForm.controls.fechaDesde.setValue('2026-09-01');
    expect(ultimaLlamadaListar().fecha_desde).toBe('2026-09-01');
    componente.filtrosForm.controls.fechaHasta.setValue('2026-09-30');
    expect(ultimaLlamadaListar().fecha_hasta).toBe('2026-09-30');

    reservasService.listarReservas.mockClear();
    componente.filtrosForm.controls.fechaDesde.setValue('2026-10-15');
    expect(componente.rangoInvalido()).toBe(true);
    expect(reservasService.listarReservas).not.toHaveBeenCalled();

    fixture.detectChanges();
    expect(html()).toContain(
      'La fecha inicial no puede ser posterior a la fecha final.',
    );
  });

  it('la búsqueda por cliente se aplica con debounce', async () => {
    await setup();
    reservasService.listarReservas.mockClear();

    componente.filtrosForm.controls.buscar.setValue('ana');
    expect(reservasService.listarReservas).not.toHaveBeenCalled();

    await new Promise((resolver) => setTimeout(resolver, 450));
    expect(ultimaLlamadaListar().buscar).toBe('ana');
  });

  it('pide la página siguiente con limit y offset del backend', async () => {
    const veinte = Array.from({ length: 20 }, (_, indice) =>
      resumen(indice + 1, 'PENDIENTE'),
    );
    await setup(veinte, 45);

    expect(texto()).toContain('Mostrando 1–20 de 45');

    const siguiente = botones('Siguiente')[0];
    expect(siguiente.disabled).toBe(false);
    siguiente.click();
    fixture.detectChanges();

    expect(ultimaLlamadaListar().limit).toBe(20);
    expect(ultimaLlamadaListar().offset).toBe(20);
    expect(texto()).toContain('Página 2 de 3');
  });

  it('"Ver detalle" carga el panel derecho y NO navega a otra ruta', async () => {
    await setup([resumen(1, 'PENDIENTE')]);
    const navegar = vi.spyOn(router, 'navigateByUrl');

    botones('Ver detalle')[0].click();
    fixture.detectChanges();

    expect(reservasService.obtenerReserva).toHaveBeenCalledWith(1);
    expect(html()).toContain('Detalle de reserva');
    expect(html()).toContain('RES-00001');
    expect(html()).toContain('Blazer VANTER');
    expect(html()).toContain('SKU: VAN-BLZ-M-NEG');
    expect(html()).toContain('M · Negro');
    expect(html()).toContain('Otoño 2026');
    expect(navegar).not.toHaveBeenCalled();
  });

  it('la fila seleccionada se resalta y el layout se abre con detalle', async () => {
    await setup([resumen(1, 'PENDIENTE'), resumen(2, 'CONFIRMADA')]);
    seleccionarFila(1);

    const filas = fixture.nativeElement.querySelectorAll('tbody tr');
    expect(filas[0].classList.contains('rsg__fila--activa')).toBe(false);
    expect(filas[1].classList.contains('rsg__fila--activa')).toBe(true);

    const layout = fixture.nativeElement.querySelector('.rsg__layout');
    expect(layout.classList.contains('rsg__layout--con-detalle')).toBe(true);
  });

  it('sin selección el panel derecho invita a elegir una reserva', async () => {
    await setup();
    expect(html()).toContain('Selecciona una reserva');
    expect(html()).toContain(
      'Consulta aquí la información completa de la reserva.',
    );

    const layout = fixture.nativeElement.querySelector('.rsg__layout');
    expect(layout.classList.contains('rsg__layout--con-detalle')).toBe(false);
  });

  it('PENDIENTE ofrece confirmar y cancelar', async () => {
    await setup();
    seleccionarFila(0);

    expect(botones('Confirmar reserva').length).toBe(1);
    expect(botones('Cancelar reserva').length).toBe(1);
  });

  it('CONFIRMADA ya no permite confirmar y sí cancelar', async () => {
    await setup();
    reservasService.obtenerReserva.mockReturnValue(
      of(detalle(1, 'CONFIRMADA')),
    );
    seleccionarFila(0);

    expect(botones('Confirmar reserva').length).toBe(0);
    expect(botones('Cancelar reserva').length).toBe(1);
    expect(html()).toContain(
      'Reserva confirmada para la fecha de atención programada.',
    );
  });

  it('CANCELADA, ATENDIDA y VENCIDA quedan en solo lectura', async () => {
    await setup();

    for (const estado of ['CANCELADA', 'ATENDIDA', 'VENCIDA'] as const) {
      reservasService.obtenerReserva.mockReturnValue(of(detalle(1, estado)));
      componente.cerrarDetalle();
      seleccionarFila(0);

      expect(botones('Confirmar reserva').length).toBe(0);
      expect(botones('Cancelar reserva').length).toBe(0);
      expect(html()).toContain('Esta reserva es de solo lectura.');
    }
  });

  function dialogoBoton(etiqueta: string): HTMLButtonElement | undefined {
    const dialogo = fixture.nativeElement.querySelector('app-confirm-dialog');
    if (dialogo === null) {
      return undefined;
    }
    const botonesDialogo = Array.from(
      dialogo.querySelectorAll('button'),
    ) as HTMLButtonElement[];
    return botonesDialogo.find(
      (boton) => (boton.textContent ?? '').trim() === etiqueta,
    );
  }

  it('confirmar pide confirmación y usa el endpoint real', async () => {
    await setup();
    // El backend devuelve la reserva confirmada y el listado se refresca.
    reservasService.confirmarReserva.mockImplementation(() => {
      itemsLista = [resumen(1, 'CONFIRMADA')];
      return of(detalle(1, 'CONFIRMADA'));
    });
    seleccionarFila(0);

    botones('Confirmar reserva')[0].click();
    fixture.detectChanges();

    // El diálogo aparece y todavía no se llamó al backend.
    expect(html()).toContain('¿Confirmar esta reserva?');
    expect(reservasService.confirmarReserva).not.toHaveBeenCalled();

    dialogoBoton('Confirmar reserva')?.click();
    fixture.detectChanges();

    expect(reservasService.confirmarReserva).toHaveBeenCalledWith(1);
    expect(toast.mostrar).toHaveBeenCalledWith('Reserva confirmada.', 'ok');
    expect(componente.detalle()?.estado).toBe('CONFIRMADA');
    expect(html()).toContain(
      'Reserva confirmada para la fecha de atención programada.',
    );
    // La fila del listado también refleja el nuevo estado.
    expect(
      fixture.nativeElement
        .querySelectorAll('tbody tr')[0]
        .textContent.includes('CONFIRMADA'),
    ).toBe(true);
  });

  it('cancelar pide confirmación y usa el endpoint real', async () => {
    await setup();
    seleccionarFila(0);

    botones('Cancelar reserva')[0].click();
    fixture.detectChanges();

    expect(html()).toContain('¿Cancelar esta reserva?');
    expect(reservasService.cancelarReserva).not.toHaveBeenCalled();

    dialogoBoton('Cancelar reserva')?.click();
    fixture.detectChanges();

    expect(reservasService.cancelarReserva).toHaveBeenCalledWith(1, null);
    expect(toast.mostrar).toHaveBeenCalledWith('Reserva cancelada.', 'ok');
    expect(componente.detalle()?.estado).toBe('CANCELADA');
    // Al quedar CANCELADA desaparecen las acciones.
    expect(botones('Confirmar reserva').length).toBe(0);
    expect(botones('Cancelar reserva').length).toBe(0);
  });

  it('descarta la confirmación sin llamar al backend', async () => {
    await setup();
    seleccionarFila(0);

    botones('Cancelar reserva')[0].click();
    fixture.detectChanges();
    dialogoBoton('Volver')?.click();
    fixture.detectChanges();

    expect(reservasService.cancelarReserva).not.toHaveBeenCalled();
    expect(componente.confirmacion()).toBeNull();
  });

  it('bloquea el botón mientras la acción está en curso', async () => {
    await setup();
    const pendiente = new Subject<ReservaSucursalDetalle>();
    reservasService.confirmarReserva.mockReturnValue(
      pendiente.asObservable(),
    );

    seleccionarFila(0);
    botones('Confirmar reserva')[0].click();
    fixture.detectChanges();
    dialogoBoton('Confirmar reserva')?.click();
    fixture.detectChanges();

    expect(componente.procesando()).toBe('confirmar');
    expect(botones('Confirmando…')[0]?.disabled).toBe(true);

    pendiente.next(detalle(1, 'CONFIRMADA'));
    pendiente.complete();
    fixture.detectChanges();

    expect(componente.procesando()).toBeNull();
    expect(componente.detalle()?.estado).toBe('CONFIRMADA');
  });

  it('un 409 al confirmar avisa del estado y mantiene el detalle real', async () => {
    await setup();
    reservasService.confirmarReserva.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 409 })),
    );

    seleccionarFila(0);
    botones('Confirmar reserva')[0].click();
    fixture.detectChanges();
    dialogoBoton('Confirmar reserva')?.click();
    fixture.detectChanges();

    expect(toast.mostrar).toHaveBeenCalledWith(
      expect.stringContaining('estado actual'),
      'error',
    );
    expect(componente.detalle()?.estado).toBe('PENDIENTE');
    expect(botones('Confirmar reserva').length).toBe(1);
  });

  it('un 404 y un 403 al abrir el detalle se informan en el panel', async () => {
    await setup();
    reservasService.obtenerReserva.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 404 })),
    );
    seleccionarFila(0);
    expect(html()).toContain('No pudimos cargar el detalle');
    expect(html()).toContain('ya no existe');

    componente.cerrarDetalle();
    reservasService.obtenerReserva.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 403 })),
    );
    seleccionarFila(0);
    expect(html()).toContain('permisos');
    // El listado sigue visible aunque falle el detalle.
    expect(fixture.nativeElement.querySelector('tbody tr')).not.toBeNull();
  });

  it('un 401 cierra la sesión y redirige al login', async () => {
    await setup();
    reservasService.listarReservas.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 401 })),
    );
    const navegar = vi.spyOn(router, 'navigateByUrl');

    componente.refrescar();
    fixture.detectChanges();

    expect(auth.cerrarSesion).toHaveBeenCalled();
    expect(navegar).toHaveBeenCalledWith('/auth/personal/login');
  });

  it('distingue "sin reservas" de "sin resultados con filtros"', async () => {
    await setup([], 0);
    expect(html()).toContain('No hay reservas registradas.');

    componente.filtrosForm.controls.estado.setValue('CANCELADA');
    fixture.detectChanges();
    expect(html()).toContain(
      'No se encontraron reservas con los filtros seleccionados.',
    );
    expect(html()).not.toContain('No pudimos cargar las reservas');
  });

  it('las prendas y la fecha/hora son de solo lectura (sin acciones de CU18)', async () => {
    await setup();
    seleccionarFila(0);

    const panel = fixture.nativeElement.querySelector('aside.rsg__detalle');
    expect(panel.querySelectorAll('input').length).toBe(0);
    expect(panel.querySelectorAll('select').length).toBe(0);
    // La fecha de atención se muestra tal cual la devuelve el backend.
    expect(html()).toContain('20/09/2026 10:00');

    const etiquetasPanel = (
      Array.from(panel.querySelectorAll('button')) as HTMLButtonElement[]
    ).map((boton) => (boton.textContent ?? '').trim());
    for (const prohibido of [
      '+',
      '-',
      'Editar',
      'Eliminar',
      'Cambiar talla',
      'Cambiar color',
      'Atender reserva',
      'Marcar lista',
      'Marcar LISTA',
    ]) {
      expect(etiquetasPanel).not.toContain(prohibido);
    }

    expect(html()).not.toContain('Atender reserva');
    expect(html()).not.toContain('Marcar lista');
    expect(html()).not.toContain('PREPARANDO');
    expect(html()).not.toContain('LISTA');
  });

  it('el administrador ve "Atender reserva" solo para reservas CONFIRMADA', async () => {
    await setup();

    // PENDIENTE: CU18 todavía no aplica (la reserva está por confirmar).
    seleccionarFila(0);
    expect(texto()).not.toContain('Atender reserva');

    reservasService.obtenerReserva.mockReturnValue(
      of(detalle(1, 'CONFIRMADA')),
    );
    componente.cerrarDetalle();
    const navegar = vi.spyOn(router, 'navigate');
    seleccionarFila(0);

    expect(texto()).toContain('Atender reserva');
    expect(texto()).toContain('Cancelar reserva');

    botones('Atender reserva')[0].click();
    fixture.detectChanges();

    expect(navegar).toHaveBeenCalledWith(['/personal/reservas/atencion', 1]);

    // Estados terminales: nunca se ofrece atender.
    for (const estado of ['CANCELADA', 'ATENDIDA', 'VENCIDA'] as const) {
      reservasService.obtenerReserva.mockReturnValue(of(detalle(1, estado)));
      componente.cerrarDetalle();
      seleccionarFila(0);
      expect(texto()).not.toContain('Atender reserva');
    }
  });

  it('renderiza la iconografía decorativa de tarjetas, detalle y acciones', async () => {
    await setup();

    // Una cápsula de icono por tarjeta de resumen.
    expect(
      fixture.nativeElement.querySelectorAll('.rsg__kpi-icono app-admin-icon')
        .length,
    ).toBe(4);
    expect(
      fixture.nativeElement.querySelectorAll('.rsg__kpi app-admin-icon svg')
        .length,
    ).toBe(4);

    seleccionarFila(0);
    // Cliente, Teléfono, Sucursal, Fecha de reserva, Fecha y hora, Unidades.
    expect(
      fixture.nativeElement.querySelectorAll(
        '.rsg__detalle-datos app-admin-icon',
      ).length,
    ).toBeGreaterThanOrEqual(6);
    expect(
      fixture.nativeElement.querySelector('.rsg__detalle-eyebrow app-admin-icon'),
    ).not.toBeNull();
  });
});
