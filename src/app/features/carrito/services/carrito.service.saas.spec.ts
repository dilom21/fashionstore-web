import { of } from 'rxjs';

import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';

import { SAAS_MODE } from '../../../core/config/app-mode';
import { AuthService } from '../../autenticacion-seguridad/auth/services/auth.service';
import { TenantApiService } from '../../saas/services/tenant-api.service';
import { CarritoDetalle } from '../models/carrito.model';
import { CarritoSaasService } from './carrito-saas.service';
import { CarritoService } from './carrito.service';

const DETALLE: CarritoDetalle = {
  carrito_id: 10,
  sucursal_id: 1,
  sucursal_nombre: 'Centro',
  estado: 'ACTIVO',
  fecha_creacion: 'x',
  fecha_actualizacion: 'y',
  items: [],
  cantidad_total_unidades: 0,
  subtotal_carrito: 0,
};

describe('CarritoService (saasMode=true) — dispatch a /tenant/carritos', () => {
  let service: CarritoService;
  let saas: {
    agregarItem: ReturnType<typeof vi.fn>;
    listar: ReturnType<typeof vi.fn>;
    obtener: ReturnType<typeof vi.fn>;
    actualizarCantidad: ReturnType<typeof vi.fn>;
    eliminarDetalle: ReturnType<typeof vi.fn>;
    eliminarCarrito: ReturnType<typeof vi.fn>;
  };
  let auth: { cerrarSesion: ReturnType<typeof vi.fn> };
  let tenant: { cerrarSesion: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    saas = {
      agregarItem: vi.fn(() =>
        of({
          carrito_id: 10,
          detalle_id: 38,
          inventario_id: 150,
          cantidad: 2,
          estado: 'ACTIVO',
        }),
      ),
      listar: vi.fn(() => of({ items: [], total_carritos_activos: 0 })),
      obtener: vi.fn(() => of(DETALLE)),
      actualizarCantidad: vi.fn(() =>
        of({
          carrito_id: 10,
          detalle_id: 38,
          inventario_id: 150,
          cantidad: 3,
          estado: 'ACTIVO',
        }),
      ),
      eliminarDetalle: vi.fn(() =>
        of({ carrito_id: 10, estado: 'ACTIVO', cantidad_lineas: 1 }),
      ),
      eliminarCarrito: vi.fn(() =>
        of({ carrito_id: 10, estado: 'ELIMINADO', cantidad_lineas: 0 }),
      ),
    };
    auth = { cerrarSesion: vi.fn() };
    tenant = { cerrarSesion: vi.fn() };

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: SAAS_MODE, useValue: true },
        CarritoService,
        { provide: CarritoSaasService, useValue: saas },
        { provide: AuthService, useValue: auth },
        { provide: TenantApiService, useValue: tenant },
      ],
    });
    service = TestBed.inject(CarritoService);
  });

  afterEach(() => TestBed.resetTestingModule());

  it('agregarItem(variante) delega con el payload exacto (sin inventario_id)', () => {
    service
      .agregarItem({
        modo: 'variante',
        sucursal_id: 1,
        variante_producto_id: 25,
        temporada_id: 4,
        cantidad: 2,
      })
      .subscribe();

    expect(saas.agregarItem).toHaveBeenCalledWith({
      sucursal_id: 1,
      variante_producto_id: 25,
      temporada_id: 4,
      cantidad: 2,
    });
  });

  it('agregarItem(inventario) falla en SaaS (no usa el contrato legacy)', () => {
    let error: unknown;
    service
      .agregarItem({
        modo: 'inventario',
        sucursal_id: 1,
        inventario_id: 9,
        cantidad: 1,
      })
      .subscribe({ error: (e: unknown) => (error = e) });

    expect(error).toBeInstanceOf(Error);
    expect(saas.agregarItem).not.toHaveBeenCalled();
  });

  it('listarCarritos delega en CarritoSaasService.listar', () => {
    service.listarCarritos().subscribe();
    expect(saas.listar).toHaveBeenCalledTimes(1);
  });

  it('obtenerCarrito delega en CarritoSaasService.obtener', () => {
    service.obtenerCarrito(10).subscribe();
    expect(saas.obtener).toHaveBeenCalledWith(10);
  });

  it('actualizarCantidad hace PATCH y recarga el detalle', () => {
    service.actualizarCantidad(10, 38, 3).subscribe();
    expect(saas.actualizarCantidad).toHaveBeenCalledWith(10, 38, 3);
    expect(saas.obtener).toHaveBeenCalledWith(10);
  });

  it('eliminarDetalle con líneas restantes relee el detalle', () => {
    let resultado: any;
    service.eliminarDetalle(10, 38).subscribe((r) => (resultado = r));

    expect(resultado.tipo).toBe('detalle');
    expect(resultado.detalle.carrito_id).toBe(10);
    expect(saas.obtener).toHaveBeenCalledWith(10);
  });

  it('eliminarDetalle sin líneas informa carrito-eliminado (no inventa detalle)', () => {
    saas.eliminarDetalle.mockReturnValueOnce(
      of({ carrito_id: 10, estado: 'ELIMINADO', cantidad_lineas: 0 }),
    );
    let resultado: any;
    service.eliminarDetalle(10, 38).subscribe((r) => (resultado = r));

    expect(resultado).toEqual({ tipo: 'carrito-eliminado', carrito_id: 10 });
    expect(saas.obtener).not.toHaveBeenCalled();
  });

  it('eliminarCarrito delega en el contrato SaaS', () => {
    service.eliminarCarrito(10).subscribe();
    expect(saas.eliminarCarrito).toHaveBeenCalledWith(10);
  });

  it('cerrarSesionCliente cierra la sesión EMPRESARIAL en modo SaaS', () => {
    service.cerrarSesionCliente();
    expect(tenant.cerrarSesion).toHaveBeenCalledTimes(1);
    expect(auth.cerrarSesion).not.toHaveBeenCalled();
  });
});
