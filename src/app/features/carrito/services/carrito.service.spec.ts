import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { environment } from '../../../../environments/environment';
import { AuthService } from '../../autenticacion-seguridad/auth/services/auth.service';
import { TenantApiService } from '../../saas/services/tenant-api.service';
import { CarritoSaasService } from './carrito-saas.service';
import { CarritoService } from './carrito.service';

const API = environment.apiUrl.replace(/\/+$/, '');

/**
 * Modo LEGACY (environment.saasMode = false en la compilación de pruebas):
 * el facade debe conservar exactamente las rutas del primer parcial.
 */
describe('CarritoService (legacy, saasMode=false)', () => {
  let service: CarritoService;
  let http: HttpTestingController;
  let saas: Record<string, ReturnType<typeof vi.fn>>;
  let auth: { cerrarSesion: ReturnType<typeof vi.fn> };
  let tenant: { cerrarSesion: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    saas = {
      agregarItem: vi.fn(),
      listar: vi.fn(),
      obtener: vi.fn(),
      actualizarCantidad: vi.fn(),
      eliminarDetalle: vi.fn(),
      eliminarCarrito: vi.fn(),
    };
    auth = { cerrarSesion: vi.fn() };
    tenant = { cerrarSesion: vi.fn() };

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        CarritoService,
        { provide: CarritoSaasService, useValue: saas },
        { provide: AuthService, useValue: auth },
        { provide: TenantApiService, useValue: tenant },
      ],
    });
    service = TestBed.inject(CarritoService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('agregarItem (inventario) usa POST /carritos/items del primer parcial', () => {
    service
      .agregarItem({
        modo: 'inventario',
        sucursal_id: 2,
        inventario_id: 9,
        cantidad: 3,
      })
      .subscribe();

    const req = http.expectOne(`${API}/carritos/items`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({
      sucursal_id: 2,
      inventario_id: 9,
      cantidad: 3,
    });
    req.flush({});
    expect(saas['agregarItem']).not.toHaveBeenCalled();
  });

  it('agregarItem con selección de variante falla en modo legacy (no llama a la API)', () => {
    let error: unknown;
    service
      .agregarItem({
        modo: 'variante',
        sucursal_id: 1,
        variante_producto_id: 25,
        temporada_id: 4,
        cantidad: 1,
      })
      .subscribe({ error: (e: unknown) => (error = e) });

    expect(error).toBeInstanceOf(Error);
    http.expectNone(`${API}/carritos/items`);
  });

  it('listarCarritos usa GET /carritos y normaliza subtotales', () => {
    let total = 0;
    service.listarCarritos().subscribe((r) => (total = r.total_carritos_activos));

    const req = http.expectOne(`${API}/carritos`);
    req.flush({
      items: [
        {
          carrito_id: 7,
          sucursal_id: 2,
          sucursal_nombre: 'Centro',
          cantidad_lineas: 1,
          cantidad_unidades: 2,
          subtotal: '299.8',
          fecha_actualizacion: 'x',
        },
      ],
      total_carritos_activos: 1,
    });

    expect(total).toBe(1);
    expect(service.carritos()[0].subtotal).toBe(299.8);
  });

  it('obtenerCarrito usa GET /carritos/{id}', () => {
    service.obtenerCarrito(7).subscribe();
    const req = http.expectOne(`${API}/carritos/7`);
    expect(req.request.method).toBe('GET');
    req.flush({
      carrito_id: 7,
      sucursal_id: 2,
      sucursal_nombre: 'Centro',
      estado: 'ACTIVO',
      fecha_creacion: 'x',
      fecha_actualizacion: 'y',
      items: [],
      cantidad_total_unidades: 0,
      subtotal_carrito: '0',
    });
    expect(saas['obtener']).not.toHaveBeenCalled();
  });

  it('actualizarCantidad usa PATCH legacy', () => {
    service.actualizarCantidad(7, 1, 3).subscribe();
    const req = http.expectOne(`${API}/carritos/7/items/1`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ cantidad: 3 });
    req.flush({
      carrito_id: 7,
      sucursal_id: 2,
      sucursal_nombre: 'Centro',
      estado: 'ACTIVO',
      fecha_creacion: 'x',
      fecha_actualizacion: 'y',
      items: [],
      cantidad_total_unidades: 0,
      subtotal_carrito: '0',
    });
  });

  it('eliminarDetalle envuelve el detalle legacy en {tipo: detalle}', () => {
    let resultado: unknown;
    service.eliminarDetalle(7, 1).subscribe((r) => (resultado = r));

    const req = http.expectOne(`${API}/carritos/7/items/1`);
    expect(req.request.method).toBe('DELETE');
    req.flush({
      carrito_id: 7,
      sucursal_id: 2,
      sucursal_nombre: 'Centro',
      estado: 'ACTIVO',
      fecha_creacion: 'x',
      fecha_actualizacion: 'y',
      items: [],
      cantidad_total_unidades: 0,
      subtotal_carrito: '0',
    });

    expect(resultado).toEqual(
      expect.objectContaining({ tipo: 'detalle' }),
    );
  });

  it('eliminarCarrito usa DELETE legacy', () => {
    service.eliminarCarrito(7).subscribe();
    const req = http.expectOne(`${API}/carritos/7`);
    expect(req.request.method).toBe('DELETE');
    req.flush({});
  });

  it('cerrarSesionCliente cierra la sesión LEGACY en este modo', () => {
    service.cerrarSesionCliente();
    expect(auth.cerrarSesion).toHaveBeenCalledTimes(1);
    expect(tenant.cerrarSesion).not.toHaveBeenCalled();
  });
});
