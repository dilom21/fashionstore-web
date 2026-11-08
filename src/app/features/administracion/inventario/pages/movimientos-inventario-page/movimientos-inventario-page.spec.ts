import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';

import { environment } from '../../../../../../environments/environment';
import { PanelSesionService } from '../../../services/panel-sesion.service';
import { MovimientoInventarioItem } from '../../models/movimiento-inventario.model';
import { MovimientosInventarioPage } from './movimientos-inventario-page';

const API = environment.apiUrl.replace(/\/+$/, '');

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

function movimiento(
  overrides: Partial<MovimientoInventarioItem> = {},
): MovimientoInventarioItem {
  return {
    movimiento_id: 91,
    inventario_id: 10,
    usuario_id: 7,
    usuario_correo: 'encargado@vanter.test',
    tipo: 'ENTRADA_COMPRA',
    cantidad: 6,
    fecha_hora: '2026-03-01T10:15:00',
    observaciones: null,
    referencia_tipo: 'ORDEN_COMPRA',
    referencia_id: 15,
    sucursal_id: 2,
    sucursal_nombre: 'Sucursal Centro',
    producto_id: 5,
    producto_nombre: 'Camisa Oxford',
    variante_producto_id: 8,
    sku: 'CAM-OXF-M-BLA',
    talla_id: 1,
    talla_nombre: 'M',
    color_id: 1,
    color_nombre: 'Blanco',
    temporada_id: 1,
    temporada_nombre: 'Verano 2026',
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
 * CU08 - CU14: el kardex conserva tabla, filtros y paginación, pero consulta
 * `GET /tenant/inventario/movimientos` con el JWT empresarial.
 */
describe('MovimientosInventarioPage con backend empresarial (CU08)', () => {
  let fixture: ComponentFixture<MovimientosInventarioPage>;
  let http: HttpTestingController;
  let router: Router;
  let sesion: any;

  async function setup(sesionUsuario: any = sesionMock()): Promise<void> {
    sesion = sesionUsuario;
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [MovimientosInventarioPage],
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

    fixture = TestBed.createComponent(MovimientosInventarioPage);
    fixture.detectChanges();
  }

  function texto(): string {
    return ((fixture.nativeElement as HTMLElement).textContent ?? '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function resolverCatalogos(incluirSucursales = true): void {
    http
      .expectOne((req) => req.url === `${API}/tenant/inventario/filtros`)
      .flush(OPCIONES);
    if (incluirSucursales) {
      http
        .expectOne((req) => req.url === `${API}/tenant/empresa/sucursales`)
        .flush(SUCURSALES);
    }
  }

  function movimientosPendiente() {
    return http.expectOne(
      (req) => req.url === `${API}/tenant/inventario/movimientos`,
    );
  }

  afterEach(() => {
    http.verify();
  });

  it('consulta GET /tenant/inventario/movimientos y muestra los datos reales', async () => {
    await setup();
    resolverCatalogos();

    const peticion = movimientosPendiente();
    expect(peticion.request.params.get('limit')).toBe('10');
    expect(peticion.request.params.get('offset')).toBe('0');
    peticion.flush({
      items: [
        movimiento(),
        movimiento({
          movimiento_id: 92,
          tipo: 'RESERVA',
          usuario_id: null,
          usuario_correo: null,
          producto_nombre: 'Pantalón Slim',
          sku: 'PAN-SLI-M-NEG',
          referencia_tipo: null,
          referencia_id: null,
        }),
      ],
      total: 2,
      limit: 10,
      offset: 0,
    });
    fixture.detectChanges();

    expect(texto()).toContain('Camisa Oxford');
    expect(texto()).toContain('Pantalón Slim');
    expect(texto()).toContain('encargado@vanter.test');
    expect(texto()).toContain('Orden compra #15');
  });

  it('un movimiento con usuario_correo = null se conserva y se muestra con guion', async () => {
    await setup();
    resolverCatalogos();
    movimientosPendiente().flush({
      items: [movimiento({ usuario_id: null, usuario_correo: null })],
      total: 1,
      limit: 10,
      offset: 0,
    });
    fixture.detectChanges();

    const celda = (fixture.nativeElement as HTMLElement).querySelector(
      '.mov__usuario',
    );
    expect(celda?.textContent?.trim()).toBe('—');
    expect(fixture.componentInstance.items()).toHaveLength(1);
  });

  it('una respuesta 200 sin movimientos no es un error', async () => {
    await setup();
    resolverCatalogos();
    movimientosPendiente().flush({
      items: [],
      total: 0,
      limit: 10,
      offset: 0,
    });
    fixture.detectChanges();

    expect(texto()).toContain('Aún no existen movimientos de inventario');
    expect(fixture.componentInstance.error()).toBeNull();
  });

  it('un 503 muestra error de servicio y NO cierra la sesión', async () => {
    await setup();
    resolverCatalogos();
    movimientosPendiente().flush(
      { detail: 'Servicio no disponible' },
      { status: 503, statusText: 'Service Unavailable' },
    );
    fixture.detectChanges();

    expect(texto()).toContain('no está disponible');
    expect(texto()).not.toContain('Aún no existen movimientos');
    expect(sesion.cerrarSesion).not.toHaveBeenCalled();
    expect(router.navigateByUrl).not.toHaveBeenCalled();
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

    const peticion = movimientosPendiente();
    expect(peticion.request.params.has('sucursal_id')).toBe(false);
    peticion.flush({
      items: [movimiento({ sucursal_nombre: 'Sucursal Sur' })],
      total: 1,
      limit: 10,
      offset: 0,
    });
    fixture.detectChanges();

    expect(texto()).toContain('Sucursal asignada');
    expect(texto()).toContain('Sucursal Sur');
    expect(texto()).not.toContain('Todas las sucursales');
  });

  it('conserva los filtros existentes (tipo, temporada y origen)', async () => {
    await setup();
    resolverCatalogos();
    movimientosPendiente().flush({ items: [], total: 0, limit: 10, offset: 0 });

    fixture.componentInstance.filtros.controls.tipo.setValue('DEVOLUCION');
    const porTipo = movimientosPendiente();
    expect(porTipo.request.params.get('tipo')).toBe('DEVOLUCION');
    porTipo.flush({ items: [], total: 0, limit: 10, offset: 0 });

    fixture.componentInstance.filtros.controls.temporadaId.setValue(1);
    const porTemporada = movimientosPendiente();
    expect(porTemporada.request.params.get('temporada_id')).toBe('1');
    porTemporada.flush({ items: [], total: 0, limit: 10, offset: 0 });
  });
});
