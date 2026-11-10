import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import {
  construirParamsListadoLegacy,
  construirParamsListadoSaas,
  construirRutaDetalle,
  construirRutaFiltros,
  construirRutaListado,
  CatalogoService,
} from './catalogo.service';

const API = 'http://127.0.0.1:8000';

describe('constructores de rutas (mode-aware)', () => {
  it('SaaS usa /catalogo/public/{slug}/productos (no la ruta legacy)', () => {
    const ruta = construirRutaListado(API, true, 'vanter-men');
    expect(ruta).toBe(`${API}/catalogo/public/vanter-men/productos`);
    expect(ruta).not.toBe(`${API}/productos`);
    expect(ruta).toContain('/catalogo/public/vanter-men');
  });

  it('legacy conserva GET /productos', () => {
    expect(construirRutaListado(API, false, 'vanter-men')).toBe(
      `${API}/productos`,
    );
  });

  it('detalle SaaS y legacy', () => {
    expect(construirRutaDetalle(API, true, 'vanter-men', 9)).toBe(
      `${API}/catalogo/public/vanter-men/productos/9`,
    );
    expect(construirRutaDetalle(API, false, 'vanter-men', 9)).toBe(
      `${API}/productos/9`,
    );
  });

  it('filtros SaaS y legacy', () => {
    expect(construirRutaFiltros(API, true, 'vanter-men')).toBe(
      `${API}/catalogo/public/vanter-men/filtros`,
    );
    expect(construirRutaFiltros(API, false, 'vanter-men')).toBe(
      `${API}/catalogo/filtros`,
    );
  });
});

describe('constructores de parámetros', () => {
  it('SaaS traduce con_stock a disponibilidad=CON_STOCK (y TODOS por defecto)', () => {
    const conStock = construirParamsListadoSaas({ con_stock: true });
    expect(conStock.get('disponibilidad')).toBe('CON_STOCK');

    const sinStock = construirParamsListadoSaas({});
    expect(sinStock.get('disponibilidad')).toBe('TODOS');
  });

  it('SaaS envía limit/offset explícitos y nunca con_stock', () => {
    const params = construirParamsListadoSaas({
      buscar: 'Polo',
      categoria_id: 3,
      con_stock: false,
    });
    expect(params.get('buscar')).toBe('Polo');
    expect(params.get('categoria_id')).toBe('3');
    expect(params.get('limit')).toBe('100');
    expect(params.get('offset')).toBe('0');
    expect(params.get('con_stock')).toBeNull();
  });

  it('legacy conserva con_stock y no envía disponibilidad ni limit', () => {
    const params = construirParamsListadoLegacy({ con_stock: true });
    expect(params.get('con_stock')).toBe('true');
    expect(params.get('disponibilidad')).toBeNull();
    expect(params.get('limit')).toBeNull();
  });

  it('omite parámetros no definidos (no envía valores vacíos)', () => {
    const params = construirParamsListadoSaas({});
    expect(params.get('buscar')).toBeNull();
    expect(params.get('categoria_id')).toBeNull();
    expect(params.get('talla_id')).toBeNull();
    expect(params.get('color_id')).toBeNull();
  });
});

describe('CatalogoService (legacy mode, saasMode=false)', () => {
  let service: CatalogoService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), CatalogoService],
    });
    service = TestBed.inject(CatalogoService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('listarProductos llama GET /productos y normaliza el arreglo', () => {
    let recibido: unknown;
    service.listarProductos().subscribe((productos) => (recibido = productos));

    const req = http.expectOne(`${API}/productos`);
    expect(req.request.method).toBe('GET');
    req.flush([
      {
        id: 1,
        nombre: 'Polo',
        descripcion: null,
        precio: '149.9',
        estado: true,
        categoria_id: 3,
        categoria: { id: 3, nombre: 'Polos' },
        imagen_principal_url: null,
      },
    ]);

    expect(recibido).toEqual([
      expect.objectContaining({
        id: 1,
        precio: 149.9,
        precio_definitivo: 149.9,
      }),
    ]);
  });

  it('obtenerFiltros llama GET /catalogo/filtros y normaliza', () => {
    service.obtenerFiltros().subscribe();

    const req = http.expectOne(`${API}/catalogo/filtros`);
    expect(req.request.method).toBe('GET');
    req.flush({
      categorias: [{ id: 3, nombre: 'Polos' }],
      tallas: [],
      colores: [],
      temporadas: [],
      colecciones: [],
      sucursales: [],
    });
  });

  it('obtenerProductoDetalle llama GET /productos/{id}', () => {
    service.obtenerProductoDetalle(9).subscribe();

    const req = http.expectOne(`${API}/productos/9`);
    expect(req.request.method).toBe('GET');
    req.flush({
      id: 9,
      nombre: 'Polo',
      descripcion: null,
      precio: 149.9,
      estado: true,
      categoria_id: 3,
      categoria: { id: 3, nombre: 'Polos' },
      imagen_principal_url: null,
      variantes: [],
      recursos: [],
    });
  });

  it('obtenerDisponibilidad llama GET /productos/{id}/disponibilidad y aplana', () => {
    let recibido: unknown;
    service.obtenerDisponibilidad(9).subscribe((filas) => (recibido = filas));

    const req = http.expectOne(`${API}/productos/9/disponibilidad`);
    expect(req.request.method).toBe('GET');
    req.flush({
      sucursales: [
        {
          sucursal_id: 1,
          sucursal: 'Centro',
          variantes: [
            {
              variante_id: 11,
              sku: 'POL-M',
              talla: 'M',
              color: 'Negro',
              temporada: 'PV26',
              stock_disponible: 2,
            },
          ],
        },
      ],
    });

    expect(recibido).toEqual([
      expect.objectContaining({ variante_id: 11, sucursal_id: 1, stock_disponible: 2 }),
    ]);
  });
});
