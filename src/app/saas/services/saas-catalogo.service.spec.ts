import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { environment } from '../../../environments/environment';
import {
  TenantCategoria,
  TenantProducto,
  TenantProveedor,
  TenantTalla,
  TenantVariante,
  TenantVarianteEmpresa,
} from '../models/tenant.models';
import { SaasCatalogoService } from './saas-catalogo.service';

const API = environment.apiUrl.replace(/\/+$/, '');
const BASE = `${API}/tenant/catalogo`;

const CATEGORIA: TenantCategoria = {
  id: 3,
  nombre: 'Poleras',
  descripcion: null,
};

const PRODUCTO: TenantProducto = {
  id: 9,
  nombre: 'Polera oversize',
  descripcion: 'Algodón peinado',
  // Pydantic serializa Decimal como texto.
  precio: '120.00',
  categoria_id: 3,
  categoria_nombre: 'Poleras',
};

const VARIANTE: TenantVariante = {
  id: 21,
  producto_id: 9,
  sku: 'POL-M-BLA',
  talla_id: 4,
  talla: 'M',
  color_id: 7,
  color: 'Blanco',
};

describe('SaasCatalogoService', () => {
  let service: SaasCatalogoService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(SaasCatalogoService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
  });

  /** Abre una petición por URL exacta (sin query string). */
  function esperar(url: string) {
    return http.expectOne((peticion) => peticion.url === url);
  }

  // ============================== Categorías ==============================

  it('listarCategorias usa GET y la URL exacta, sin barra final', () => {
    service.listarCategorias().subscribe();
    const peticion = esperar(`${BASE}/categorias`);

    expect(peticion.request.method).toBe('GET');
    expect(peticion.request.url.endsWith('/')).toBe(false);
    expect(peticion.request.urlWithParams).toBe(`${BASE}/categorias`);
    peticion.flush([CATEGORIA]);
  });

  it('listarCategorias devuelve las categorías del backend', () => {
    let resultado: TenantCategoria[] | undefined;
    service.listarCategorias().subscribe((valor) => (resultado = valor));
    esperar(`${BASE}/categorias`).flush([CATEGORIA]);

    expect(resultado).toEqual([CATEGORIA]);
  });

  it('obtenerCategoria hace GET /categorias/{id}', () => {
    let resultado: TenantCategoria | undefined;
    service.obtenerCategoria(3).subscribe((valor) => (resultado = valor));

    const peticion = esperar(`${BASE}/categorias/3`);
    expect(peticion.request.method).toBe('GET');
    peticion.flush(CATEGORIA);

    expect(resultado).toEqual(CATEGORIA);
  });

  it('crearCategoria hace POST con el cuerpo exacto del contrato', () => {
    let creada: TenantCategoria | undefined;
    service
      .crearCategoria({ nombre: 'Poleras', descripcion: 'Parte superior' })
      .subscribe((valor) => (creada = valor));

    const peticion = esperar(`${BASE}/categorias`);
    expect(peticion.request.method).toBe('POST');
    expect(peticion.request.body).toEqual({
      nombre: 'Poleras',
      descripcion: 'Parte superior',
    });
    peticion.flush(CATEGORIA, { status: 201, statusText: 'Created' });

    expect(creada).toEqual(CATEGORIA);
  });

  it('crearCategoria omite la descripción cuando no se envía', () => {
    service.crearCategoria({ nombre: 'Poleras' }).subscribe();

    const peticion = esperar(`${BASE}/categorias`);
    const cuerpo = peticion.request.body as unknown as Record<string, unknown>;
    expect(Object.keys(cuerpo)).toEqual(['nombre']);
    peticion.flush(CATEGORIA);
  });

  it('editarCategoria hace PATCH con SOLO los campos modificados', () => {
    service.editarCategoria(3, { nombre: 'Poleras manga corta' }).subscribe();

    const peticion = esperar(`${BASE}/categorias/3`);
    expect(peticion.request.method).toBe('PATCH');
    expect(peticion.request.body).toEqual({ nombre: 'Poleras manga corta' });
    peticion.flush({ ...CATEGORIA, nombre: 'Poleras manga corta' });
  });

  it('editarCategoria envía cadena vacía para limpiar la descripción', () => {
    service.editarCategoria(3, { descripcion: '' }).subscribe();

    const peticion = esperar(`${BASE}/categorias/3`);
    expect(peticion.request.body).toEqual({ descripcion: '' });
    peticion.flush({ ...CATEGORIA, descripcion: '' });
  });

  // =============================== Productos ===============================

  it('listarProductos sin filtros no agrega query params', () => {
    service.listarProductos().subscribe();

    const peticion = esperar(`${BASE}/productos`);
    expect(peticion.request.method).toBe('GET');
    expect(peticion.request.urlWithParams).toBe(`${BASE}/productos`);
    peticion.flush([PRODUCTO]);
  });

  it('listarProductos envía categoria_id, limit y offset exactos', () => {
    let resultado: TenantProducto[] | undefined;
    service
      .listarProductos({ categoria_id: 3, limit: 50, offset: 100 })
      .subscribe((valor) => (resultado = valor));

    const peticion = esperar(`${BASE}/productos`);
    expect(peticion.request.params.get('categoria_id')).toBe('3');
    expect(peticion.request.params.get('limit')).toBe('50');
    expect(peticion.request.params.get('offset')).toBe('100');
    expect(peticion.request.params.keys().sort()).toEqual([
      'categoria_id',
      'limit',
      'offset',
    ]);
    peticion.flush([PRODUCTO]);

    expect(resultado).toEqual([PRODUCTO]);
  });

  it('listarProductos ignora una categoría nula o no positiva', () => {
    service.listarProductos({ categoria_id: null }).subscribe();
    const sinCategoria = esperar(`${BASE}/productos`);
    expect(sinCategoria.request.params.keys()).toEqual([]);
    sinCategoria.flush([]);

    service.listarProductos({ categoria_id: 0 }).subscribe();
    const cero = esperar(`${BASE}/productos`);
    expect(cero.request.params.keys()).toEqual([]);
    cero.flush([]);
  });

  it('obtenerProducto hace GET /productos/{id}', () => {
    service.obtenerProducto(9).subscribe();

    const peticion = esperar(`${BASE}/productos/9`);
    expect(peticion.request.method).toBe('GET');
    peticion.flush(PRODUCTO);
  });

  it('crearProducto hace POST con el cuerpo exacto y precio numérico', () => {
    let creado: TenantProducto | undefined;
    service
      .crearProducto({
        categoria_id: 3,
        nombre: 'Polera oversize',
        descripcion: 'Algodón peinado',
        precio: 120,
      })
      .subscribe((valor) => (creado = valor));

    const peticion = esperar(`${BASE}/productos`);
    expect(peticion.request.method).toBe('POST');
    expect(peticion.request.body).toEqual({
      categoria_id: 3,
      nombre: 'Polera oversize',
      descripcion: 'Algodón peinado',
      precio: 120,
    });
    peticion.flush(PRODUCTO, { status: 201, statusText: 'Created' });

    expect(creado).toEqual(PRODUCTO);
  });

  it('crearProducto no envía campos ajenos al contrato (extra=forbid)', () => {
    service
      .crearProducto({ categoria_id: 3, nombre: 'X', precio: 1.5 })
      .subscribe();

    const peticion = esperar(`${BASE}/productos`);
    const cuerpo = peticion.request.body as unknown as Record<string, unknown>;
    expect(Object.keys(cuerpo)).toEqual(['categoria_id', 'nombre', 'precio']);
    expect('empresa_id' in cuerpo).toBe(false);
    expect('estado' in cuerpo).toBe(false);
    peticion.flush(PRODUCTO);
  });

  it('editarProducto hace PATCH con SOLO los campos modificados', () => {
    service.editarProducto(9, { precio: 150.5 }).subscribe();

    const peticion = esperar(`${BASE}/productos/9`);
    expect(peticion.request.method).toBe('PATCH');
    expect(peticion.request.body).toEqual({ precio: 150.5 });
    peticion.flush({ ...PRODUCTO, precio: '150.50' });
  });

  // =============================== Variantes ===============================

  it('listarVariantes hace GET /productos/{id}/variantes', () => {
    let resultado: TenantVariante[] | undefined;
    service.listarVariantes(9).subscribe((valor) => (resultado = valor));

    const peticion = esperar(`${BASE}/productos/9/variantes`);
    expect(peticion.request.method).toBe('GET');
    peticion.flush([VARIANTE]);

    expect(resultado).toEqual([VARIANTE]);
  });

  it('crearVariante hace POST con talla_id, color_id y sku exactos', () => {
    let creada: TenantVariante | undefined;
    service
      .crearVariante(9, { talla_id: 4, color_id: 7, sku: 'POL-M-BLA' })
      .subscribe((valor) => (creada = valor));

    const peticion = esperar(`${BASE}/productos/9/variantes`);
    expect(peticion.request.method).toBe('POST');
    expect(peticion.request.body).toEqual({
      talla_id: 4,
      color_id: 7,
      sku: 'POL-M-BLA',
    });
    peticion.flush(VARIANTE, { status: 201, statusText: 'Created' });

    expect(creada).toEqual(VARIANTE);
  });

  it('obtenerVariante hace GET /variantes/{id}', () => {
    service.obtenerVariante(21).subscribe();

    const peticion = esperar(`${BASE}/variantes/21`);
    expect(peticion.request.method).toBe('GET');
    peticion.flush(VARIANTE);
  });

  it('editarVariante hace PATCH con el SKU como único campo', () => {
    service.editarVariante(21, { sku: 'POL-M-BLA-2' }).subscribe();

    const peticion = esperar(`${BASE}/variantes/21`);
    expect(peticion.request.method).toBe('PATCH');
    expect(peticion.request.body).toEqual({ sku: 'POL-M-BLA-2' });
    peticion.flush({ ...VARIANTE, sku: 'POL-M-BLA-2' });
  });

  // ================================ Errores ================================

  it('propaga el 409 de conflicto de datos sin transformarlo', () => {
    let estado = 0;
    let detalle = '';

    service
      .crearProducto({ categoria_id: 3, nombre: 'X', precio: 10 })
      .subscribe({
        error: (error: HttpErrorResponse) => {
          estado = error.status;
          detalle = (error.error as { detail?: string }).detail ?? '';
        },
      });

    esperar(`${BASE}/productos`).flush(
      { detail: 'Conflicto con los datos del catalogo de la empresa' },
      { status: 409, statusText: 'Conflict' },
    );

    expect(estado).toBe(409);
    expect(detalle).toBe('Conflicto con los datos del catalogo de la empresa');
  });

  it('propaga el 403 de un rol que no es ADMINISTRADOR', () => {
    let estado = 0;

    service
      .editarCategoria(3, { nombre: 'X' })
      .subscribe({
        error: (error: HttpErrorResponse) => (estado = error.status),
      });

    esperar(`${BASE}/categorias/3`).flush(
      { detail: 'Operacion no autorizada' },
      { status: 403, statusText: 'Forbidden' },
    );

    expect(estado).toBe(403);
  });

  it('propaga el 422 de validación con la lista de campos', () => {
    let estado = 0;
    let campos: Array<string | number> = [];

    service
      .crearCategoria({ nombre: '' })
      .subscribe({
        error: (error: HttpErrorResponse) => {
          estado = error.status;
          const cuerpo = error.error as {
            detail?: Array<{ loc: Array<string | number> }>;
          };
          campos = cuerpo.detail?.[0]?.loc ?? [];
        },
      });

    esperar(`${BASE}/categorias`).flush(
      {
        detail: [
          {
            type: 'string_too_short',
            loc: ['body', 'nombre'],
            msg: 'String should have at least 1 character',
          },
        ],
      },
      { status: 422, statusText: 'Unprocessable Entity' },
    );

    expect(estado).toBe(422);
    expect(campos).toEqual(['body', 'nombre']);
  });

  // ========================= Diccionarios de apoyo =========================

  it('listarTallas hace GET /tallas sin barra final', () => {
    let resultado: TenantTalla[] | undefined;
    service.listarTallas().subscribe((valor) => (resultado = valor));

    const peticion = esperar(`${BASE}/tallas`);
    expect(peticion.request.method).toBe('GET');
    expect(peticion.request.urlWithParams).toBe(`${BASE}/tallas`);
    peticion.flush([{ id: 4, nombre: 'M' }]);

    expect(resultado).toEqual([{ id: 4, nombre: 'M' }]);
  });

  it('listarColores hace GET /colores', () => {
    service.listarColores().subscribe();
    const peticion = esperar(`${BASE}/colores`);
    expect(peticion.request.method).toBe('GET');
    peticion.flush([{ id: 7, nombre: 'Blanco' }]);
  });

  it('listarCiudades hace GET /ciudades', () => {
    service.listarCiudades().subscribe();
    const peticion = esperar(`${BASE}/ciudades`);
    expect(peticion.request.method).toBe('GET');
    peticion.flush([{ id: 1, nombre: 'La Paz' }]);
  });

  it('listarProveedores hace GET /proveedores y admite lista vacía', () => {
    let resultado: TenantProveedor[] | undefined;
    service.listarProveedores().subscribe((valor) => (resultado = valor));

    const peticion = esperar(`${BASE}/proveedores`);
    expect(peticion.request.method).toBe('GET');
    peticion.flush([]);

    expect(resultado).toEqual([]);
  });

  it('listarTemporadas hace GET /temporadas', () => {
    service.listarTemporadas().subscribe();
    const peticion = esperar(`${BASE}/temporadas`);
    expect(peticion.request.method).toBe('GET');
    peticion.flush([
      {
        id: 2,
        nombre: 'Verano 2026',
        fecha_inicio: '2026-01-01',
        fecha_fin: '2026-03-31',
        estado: true,
      },
    ]);
  });

  it('listarVariantesEmpresa sin filtros no agrega query params', () => {
    service.listarVariantesEmpresa().subscribe();

    const peticion = esperar(`${BASE}/variantes`);
    expect(peticion.request.method).toBe('GET');
    expect(peticion.request.urlWithParams).toBe(`${BASE}/variantes`);
    peticion.flush([]);
  });

  it('listarVariantesEmpresa envía producto_id, texto, limit y offset', () => {
    let resultado: TenantVarianteEmpresa[] | undefined;
    service
      .listarVariantesEmpresa({
        producto_id: 9,
        texto: '  POL  ',
        limit: 200,
        offset: 40,
      })
      .subscribe((valor) => (resultado = valor));

    const peticion = esperar(`${BASE}/variantes`);
    expect(peticion.request.params.get('producto_id')).toBe('9');
    expect(peticion.request.params.get('texto')).toBe('POL');
    expect(peticion.request.params.get('limit')).toBe('200');
    expect(peticion.request.params.get('offset')).toBe('40');
    expect(peticion.request.params.keys().sort()).toEqual([
      'limit',
      'offset',
      'producto_id',
      'texto',
    ]);
    peticion.flush([
      {
        id: 21,
        producto_id: 9,
        producto_nombre: 'Polera oversize',
         sku: 'POL-M-BLA',
         talla_id: 4,
         talla: 'M',
         color_id: 7,
         color: 'Blanco',
      },
    ]);

    expect(resultado?.[0]?.sku).toBe('POL-M-BLA');
  });

  it('listarVariantesEmpresa omite filtros fuera de rango', () => {
    service
      .listarVariantesEmpresa({
        producto_id: 0,
        texto: '   ',
        limit: 500,
        offset: -1,
      })
      .subscribe();

    const peticion = esperar(`${BASE}/variantes`);
    expect(peticion.request.params.keys()).toEqual([]);
    peticion.flush([]);
  });
});
