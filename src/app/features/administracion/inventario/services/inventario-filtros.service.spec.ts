import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { environment } from '../../../../../environments/environment';
import { TENANT_TOKEN_STORAGE_KEY } from '../../../saas/services/tenant-api.service';
import { InventarioFiltrosService } from './inventario-filtros.service';

const API = environment.apiUrl.replace(/\/+$/, '');

/**
 * CU08: los filtros de CU13/CU14 usan los endpoints EMPRESARIALES
 * (categorías, sucursales y `/tenant/inventario/filtros`) con el JWT SaaS.
 */
describe('InventarioFiltrosService (CU08 SaaS)', () => {
  let service: InventarioFiltrosService;
  let http: HttpTestingController;

  beforeEach(() => {
    sessionStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(InventarioFiltrosService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    sessionStorage.clear();
  });

  it('categorías: GET /tenant/catalogo/categorias (descarta inactivas)', () => {
    let opciones: unknown;
    service.obtenerCategorias().subscribe((valor) => {
      opciones = valor;
    });

    const peticion = http.expectOne(`${API}/tenant/catalogo/categorias`);
    peticion.flush([
      { id: 1, nombre: 'Camisas', estado: true },
      { id: 2, nombre: 'Pantalones' },
      { id: 3, nombre: 'Descontinuada', estado: false },
    ]);

    expect(opciones).toEqual([
      { id: 1, nombre: 'Camisas' },
      { id: 2, nombre: 'Pantalones' },
    ]);
  });

  it('tallas, colores y temporadas: GET /tenant/inventario/filtros', () => {
    let opciones: unknown;
    service.obtenerOpciones().subscribe((valor) => {
      opciones = valor;
    });

    const peticion = http.expectOne(`${API}/tenant/inventario/filtros`);
    peticion.flush({
      tallas: [{ id: 1, nombre: 'S' }, { id: 2, nombre: 'M' }],
      colores: [{ id: 1, nombre: 'Rojo' }],
      temporadas: [{ id: 1, nombre: 'Verano 2026', estado: false }],
    });

    expect(opciones).toEqual({
      tallas: [
        { id: 1, nombre: 'S' },
        { id: 2, nombre: 'M' },
      ],
      colores: [{ id: 1, nombre: 'Rojo' }],
      temporadas: [],
    });
  });

  it('sucursales: GET /tenant/empresa/sucursales, solo las activas autorizadas', () => {
    sessionStorage.setItem(TENANT_TOKEN_STORAGE_KEY, 'tenant-jwt');

    let opciones: unknown;
    service.obtenerSucursales().subscribe((valor) => {
      opciones = valor;
    });

    const peticion = http.expectOne(`${API}/tenant/empresa/sucursales`);
    expect(peticion.request.headers.get('Authorization')).toBe(
      'Bearer tenant-jwt',
    );
    peticion.flush([
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
    ]);

    expect(opciones).toEqual([{ id: 2, nombre: 'Sucursal Centro' }]);
  });

  it('un 403 de los filtros se propaga como error (no como catálogo vacío válido)', () => {
    let estado: number | null = null;
    service.obtenerOpciones().subscribe({
      error: (error) => {
        estado = error.status;
      },
    });

    http
      .expectOne(`${API}/tenant/inventario/filtros`)
      .flush({ detail: 'Sin permiso' }, { status: 403, statusText: 'Forbidden' });

    expect(estado).toBe(403);
  });
});
