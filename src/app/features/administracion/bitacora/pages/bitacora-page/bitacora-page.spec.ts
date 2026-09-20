import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';

import { AuthService } from '../../../../autenticacion-seguridad/auth/services/auth.service';
import { BitacoraEvento } from '../../models/bitacora.model';
import { BitacoraService } from '../../services/bitacora.service';
import { BitacoraPage } from './bitacora-page';

function evento(id: number): BitacoraEvento {
  return {
    id,
    fecha_hora: '2026-09-20T10:00:00+00:00',
    ip: '203.0.113.9',
    accion: 'CREAR',
    entidad_afectada: 'producto',
    descripcion: 'Evento de prueba',
    usuario: { id: 1, correo: 'admin@test.com', rol: 'ADMINISTRADOR' },
  };
}

describe('BitacoraPage (CU05) - scroll de paginación', () => {
  let fixture: ComponentFixture<BitacoraPage>;
  let componente: BitacoraPage;
  let bitacoraService: any;
  let scrollTo: any;

  async function setup(total: number, limiteInicial = 25): Promise<void> {
    bitacoraService = {
      listarBitacora: vi.fn((filtros: any) => {
        const restantes = Math.max(0, total - filtros.offset);
        const cantidad = Math.min(filtros.limit, restantes);
        return of({
          items: Array.from({ length: cantidad }, (_, indice) =>
            evento(filtros.offset + indice + 1),
          ),
          total,
          limit: filtros.limit,
          offset: filtros.offset,
        });
      }),
      obtenerCatalogos: vi.fn(() =>
        of({ acciones: [], entidades: [], usuarios: [] }),
      ),
      obtenerBitacora: vi.fn(),
    };
    const auth = { cerrarSesion: vi.fn() };

    await TestBed.configureTestingModule({
      imports: [BitacoraPage],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: BitacoraService, useValue: bitacoraService },
        { provide: AuthService, useValue: auth },
      ],
    }).compileComponents();

    scrollTo = vi
      .spyOn(window, 'scrollTo')
      .mockImplementation(() => undefined);

    fixture = TestBed.createComponent(BitacoraPage);
    componente = fixture.componentInstance;
    componente.limit.set(limiteInicial);
    fixture.detectChanges();
  }

  function ultimaLlamada(): any {
    const llamadas = bitacoraService.listarBitacora.mock.calls;
    return llamadas[llamadas.length - 1][0];
  }

  it('la carga inicial no dispara scroll', async () => {
    await setup(60);

    expect(scrollTo).not.toHaveBeenCalled();
    expect(componente.offset()).toBe(0);
    expect(componente.limit()).toBe(25);
    expect(componente.total()).toBe(60);
  });

  it('Siguiente avanza el offset y vuelve arriba', async () => {
    await setup(60);
    scrollTo.mockClear();

    componente.irSiguiente();

    expect(ultimaLlamada().offset).toBe(25);
    expect(ultimaLlamada().limit).toBe(25);
    expect(componente.offset()).toBe(25);
    expect(scrollTo).toHaveBeenCalledWith({
      top: 0,
      left: 0,
      behavior: 'smooth',
    });
  });

  it('Anterior retrocede el offset y vuelve arriba', async () => {
    await setup(60);
    componente.irSiguiente();
    scrollTo.mockClear();

    componente.irAnterior();

    expect(ultimaLlamada().offset).toBe(0);
    expect(componente.offset()).toBe(0);
    expect(scrollTo).toHaveBeenCalledWith({
      top: 0,
      left: 0,
      behavior: 'smooth',
    });
  });

  it('cambiar el tamaño de página vuelve a offset 0 y hace scroll', async () => {
    await setup(60);
    componente.irSiguiente();
    scrollTo.mockClear();

    const select = fixture.nativeElement.querySelector(
      '.bit__pie-tamano select',
    ) as HTMLSelectElement;
    select.value = '100';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    expect(ultimaLlamada().limit).toBe(100);
    expect(ultimaLlamada().offset).toBe(0);
    expect(componente.offset()).toBe(0);
    expect(componente.limit()).toBe(100);
    expect(scrollTo).toHaveBeenCalledWith({
      top: 0,
      left: 0,
      behavior: 'smooth',
    });
  });

  it('la paginación sigue usando limit/offset/total del backend', async () => {
    await setup(60);

    expect(componente.paginaActual()).toBe(1);
    expect(componente.totalPaginas()).toBe(3);

    componente.irSiguiente();
    expect(componente.paginaActual()).toBe(2);
    expect(componente.inicioVisible()).toBe(26);
    expect(componente.finVisible()).toBe(50);

    componente.irSiguiente();
    expect(componente.paginaActual()).toBe(3);
    expect(componente.haySiguiente()).toBe(false);

    componente.irAnterior();
    expect(componente.paginaActual()).toBe(2);
  });
});
