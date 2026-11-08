import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute } from '@angular/router';
import { of, throwError } from 'rxjs';

import { TenantSucursal } from '../../models/tenant.models';
import { SaasCatalogoService } from '../../services/saas-catalogo.service';
import { SaasEmpresaService } from '../../services/saas-empresa.service';
import { SaasSessionService } from '../../services/saas-session.service';
import { SaasSucursalesService } from '../../services/saas-sucursales.service';
import { SaasSucursalesPage } from './saas-sucursales.page';

const SUCURSAL: TenantSucursal = {
  id: 5,
  ciudad_id: 3,
  nombre: 'Centro',
  direccion: 'Av. Arce 123',
  telefono: '70000000',
  estado: true,
};

describe('SaasSucursalesPage', () => {
  let fixture: ComponentFixture<SaasSucursalesPage>;
  let componente: SaasSucursalesPage;
  let servicio: {
    listar: ReturnType<typeof vi.fn>;
    obtener: ReturnType<typeof vi.fn>;
    crear: ReturnType<typeof vi.fn>;
    actualizar: ReturnType<typeof vi.fn>;
    cambiarEstado: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    servicio = {
      listar: vi.fn(() => of([SUCURSAL])),
      obtener: vi.fn(() => of(SUCURSAL)),
      crear: vi.fn(() => of(SUCURSAL)),
      actualizar: vi.fn(() => of({ ...SUCURSAL, nombre: 'Centro editada' })),
      cambiarEstado: vi.fn(() => of(SUCURSAL)),
    };

    TestBed.configureTestingModule({
      imports: [SaasSucursalesPage],
      providers: [
        { provide: SaasSucursalesService, useValue: servicio },
        { provide: SaasCatalogoService, useValue: { listarCiudades: () => of([{ id: 3, nombre: 'La Paz' }]) } },
        { provide: SaasEmpresaService, useValue: { obtenerPlan: () => of({ max_sucursales_activas: 3 }) } },
        { provide: SaasSessionService, useValue: { rol: () => 'ADMINISTRADOR' } },
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: { get: () => '5' } } } },
      ],
    });
    fixture = TestBed.createComponent(SaasSucursalesPage);
    componente = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('carga el detalle navegable de la sucursal propia', () => {
    expect(servicio.obtener).toHaveBeenCalledWith(5);
    expect(componente.detalle()).toEqual(SUCURSAL);
    expect(fixture.nativeElement.textContent).toContain('Av. Arce 123');
  });

  it('habilita edición solo para ADMINISTRADOR y usa el formulario existente', () => {
    componente.abrirEdicion(SUCURSAL);
    expect(componente.formularioAbierto()).toBe(true);
    componente.form.controls.nombre.setValue('Centro editada');
    componente.enviar();
    expect(servicio.actualizar).toHaveBeenCalledWith(5, expect.objectContaining({
      ciudad_id: 3,
      nombre: 'Centro editada',
      direccion: 'Av. Arce 123',
    }));
    expect(servicio.actualizar.mock.calls[0][1].empresa_id).toBeUndefined();
  });

  it('conserva un conflicto 409 en el estado normalizado del formulario', () => {
    servicio.actualizar.mockReturnValueOnce(throwError(() => new HttpErrorResponse({
      status: 409,
      error: { detail: 'Conflicto de edición' },
    })));
    componente.abrirEdicion(SUCURSAL);
    componente.enviar();
    expect(componente.errorFormulario()?.estado).toBe(409);
  });

  it('calcula capacidad desde el plan y mantiene activas e inactivas visibles', () => {
    expect(componente.maximoPlan()).toBe(3);
    expect(componente.activas()).toBe(1);
    expect(componente.total()).toBe(1);
  });
});
