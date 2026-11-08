import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';

import { environment } from '../../../../../../environments/environment';
import { PanelSesionService } from '../../../services/panel-sesion.service';
import { InventarioItem } from '../../models/inventario.model';
import { InventarioPage } from './inventario-page';

const API = environment.apiUrl.replace(/\/+$/, '');

const CATEGORIAS = [
  { id: 1, nombre: 'Camisas' },
  { id: 2, nombre: 'Pantalones' },
];

const OPCIONES = {
  tallas: [{ id: 1, nombre: 'M' }],
  colores: [{ id: 1, nombre: 'Blanco' }],
  temporadas: [{ id: 1, nombre: 'Verano 2026' }],
};

const SUCURSALES = [
  {
    id: 2,
    ciudad_id: 1,
    nombre: 'Sucursal Centro',
    direccion: 'Calle 1',
    telefono: null,
    estado: true,
  },
  {
    id: 3,
    ciudad_id: 1,
    nombre: 'Sucursal Cerrada',
    direccion: 'Calle 2',
    telefono: null,
    estado: false,
  },
];

function item(overrides: Partial<InventarioItem> = {}): InventarioItem {
  return {
    inventario_id: 10,
    sucursal_id: 2,
    sucursal_nombre: 'Sucursal Centro',
    producto_id: 5,
    producto_nombre: 'Camisa Oxford',
    precio: '149.90',
    categoria_id: 1,
    categoria_nombre: 'Camisas',
    variante_producto_id: 8,
    sku: 'CAM-OXF-M-BLA',
    talla_id: 1,
    talla_nombre: 'M',
    color_id: 1,
    color_nombre: 'Blanco',
    temporada_id: 1,
    temporada_nombre: 'Verano 2026',
    stock_actual: 12,
    stock_reservado: 2,
    stock_disponible: 10,
    fecha_actualizacion: '2026-03-01T10:00:00',
    ...overrides,
  };
}

function sesionMock(overrides: Record<string, unknown> = {}): any {
  return {
    esAdministrador: () => true,
    esEncargadoSucursal: () => false,
    sucursalId: () => null,
    cerrarSesion: vi.fn(),
    ...overrides,
  };
}

/**
 * CU08 - CU13: la pantalla existente de inventario debe funcionar con el backend
 * empresarial, conservando tabla, filtros, paginación y estados.
 */
describe('InventarioPage con backend empresarial (CU08)', () => {
  let fixture: ComponentFixture<InventarioPage>;
  let http: HttpTestingController;
  let router: Router;
  let sesion: any;

  async function setup(sesionUsuario: any = sesionMock()): Promise<void> {
    sesion = sesionUsuario;
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [InventarioPage],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: PanelSesionService, useValue: sesion },
      ],
    }).compileComponents();

    http = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);

    fixture = TestBed.createComponent(InventarioPage);
    fixture.detectChanges();
  }

  function texto(): string {
    return ((fixture.nativeElement as HTMLElement).textContent ?? '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /** Resuelve las consultas de catálogos de CU08 (sucursales solo ADMIN). */
  function resolverCatalogos(incluirSucursales = true): void {
    http
      .expectOne((req) => req.url === `${API}/tenant/catalogo/categorias`)
      .flush(CATEGORIAS);
    http
      .expectOne((req) => req.url === `${API}/tenant/inventario/filtros`)
      .flush(OPCIONES);
    if (incluirSucursales) {
      http
        .expectOne((req) => req.url === `${API}/tenant/empresa/sucursales`)
        .flush(SUCURSALES);
    }
  }

  function inventarioPendiente() {
    return http.expectOne((req) => req.url === `${API}/tenant/inventario`);
  }

  afterEach(() => {
    http.verify();
  });

  it('el ADMINISTRADOR consulta GET /tenant/inventario y ve los datos reales', async () => {
    await setup();
    resolverCatalogos();

    const peticion = inventarioPendiente();
    expect(peticion.request.params.get('limit')).toBe('20');
    expect(peticion.request.params.get('offset')).toBe('0');
    peticion.flush({
      items: [
        item({ stock_disponible: 10 }),
        item({
          inventario_id: 11,
          producto_nombre: 'Pantalón Slim',
          sku: 'PAN-SLI-M-NEG',
          stock_actual: 1,
          stock_reservado: 0,
          stock_disponible: 1,
        }),
        item({
          inventario_id: 12,
          producto_nombre: 'Blusa Lino',
          sku: 'BLU-LIN-S-BLA',
          stock_actual: 0,
          stock_reservado: 0,
          stock_disponible: 0,
        }),
      ],
      total: 3,
      limit: 20,
      offset: 0,
    });
    fixture.detectChanges();

    expect(texto()).toContain('Camisa Oxford');
    expect(texto()).toContain('CAM-OXF-M-BLA');
    expect(texto()).toContain('Con stock');
    expect(texto()).toContain('Stock bajo');
    expect(texto()).toContain('Sin stock');
    expect(texto()).toContain('Mostrando 1–3 de 3');
  });

  it('los filtros de sucursal solo ofrecen las sucursales activas', async () => {
    await setup();
    resolverCatalogos();
    inventarioPendiente().flush({ items: [], total: 0, limit: 20, offset: 0 });
    fixture.detectChanges();

    const opciones = fixture.componentInstance
      .sucursales()
      .map((sucursal) => sucursal.nombre);

    expect(opciones).toEqual(['Sucursal Centro']);
    expect(opciones).not.toContain('Sucursal Cerrada');
  });

  it('una respuesta 200 vacía se muestra como lista vacía, no como error', async () => {
    await setup();
    resolverCatalogos();
    inventarioPendiente().flush({ items: [], total: 0, limit: 20, offset: 0 });
    fixture.detectChanges();

    expect(texto()).toContain('No se encontraron registros de inventario');
    expect(fixture.componentInstance.error()).toBeNull();
  });

  it('un 503 muestra error de servicio y NO cierra la sesión', async () => {
    await setup();
    resolverCatalogos();
    inventarioPendiente().flush(
      { detail: 'Servicio no disponible' },
      { status: 503, statusText: 'Service Unavailable' },
    );
    fixture.detectChanges();

    expect(texto()).toContain('no está disponible');
    expect(texto()).not.toContain('No se encontraron registros');
    expect(sesion.cerrarSesion).not.toHaveBeenCalled();
    expect(router.navigateByUrl).not.toHaveBeenCalled();
  });

  it('un 403 informa falta de autorización sin cerrar sesión', async () => {
    await setup();
    resolverCatalogos();
    inventarioPendiente().flush(
      { detail: 'Sin permiso' },
      { status: 403, statusText: 'Forbidden' },
    );
    fixture.detectChanges();

    expect(texto()).toContain('no tiene autorización');
    expect(sesion.cerrarSesion).not.toHaveBeenCalled();
  });

  it('un 401 de la sesión empresarial limpia ambas sesiones y vuelve al portero', async () => {
    await setup();
    resolverCatalogos();
    inventarioPendiente().flush(
      { detail: 'No autenticado' },
      { status: 401, statusText: 'Unauthorized' },
    );
    fixture.detectChanges();

    expect(sesion.cerrarSesion).toHaveBeenCalledTimes(1);
    expect(router.navigateByUrl).toHaveBeenCalledWith('/auth/personal/login');
  });

  it('la paginación usa limit/offset del backend', async () => {
    await setup();
    resolverCatalogos();
    inventarioPendiente().flush({
      items: [item()],
      total: 45,
      limit: 20,
      offset: 0,
    });

    fixture.componentInstance.irSiguiente();

    const siguiente = inventarioPendiente();
    expect(siguiente.request.params.get('offset')).toBe('20');
    siguiente.flush({
      items: [item({ inventario_id: 21 })],
      total: 45,
      limit: 20,
      offset: 20,
    });
    fixture.detectChanges();

    expect(fixture.componentInstance.paginaActual()).toBe(2);
    expect(texto()).toContain('de 3');
  });

  it('el ENCARGADO_SUCURSAL no envía sucursal_id ni consulta sucursales', async () => {
    await setup(
      sesionMock({
        esAdministrador: () => false,
        esEncargadoSucursal: () => true,
        sucursalId: () => 2,
      }),
    );
    resolverCatalogos(false);

    expect(
      http.match((req) => req.url === `${API}/tenant/empresa/sucursales`).length,
    ).toBe(0);

    const peticion = inventarioPendiente();
    expect(peticion.request.params.has('sucursal_id')).toBe(false);
    peticion.flush({
      items: [item({ sucursal_nombre: 'Sucursal Sur' })],
      total: 1,
      limit: 20,
      offset: 0,
    });
    fixture.detectChanges();

    expect(texto()).toContain('Sucursal asignada');
    expect(texto()).toContain('Sucursal Sur');
    expect(texto()).not.toContain('Todas las sucursales');
  });

  it('el ADMINISTRADOR envía la sucursal elegida al backend empresarial', async () => {
    await setup();
    resolverCatalogos();
    inventarioPendiente().flush({ items: [], total: 0, limit: 20, offset: 0 });

    fixture.componentInstance.filtros.controls.sucursalId.setValue(2);

    const peticion = inventarioPendiente();
    expect(peticion.request.params.get('sucursal_id')).toBe('2');
    peticion.flush({ items: [], total: 0, limit: 20, offset: 0 });
  });
});
