import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { environment } from '../../../../../environments/environment';
import { CategoriasService } from './categorias.service';
import { ProductosService } from './productos.service';
import { RecursosProductoService } from './recursos-producto.service';
import { VariantesService } from './variantes.service';

const BASE = `${environment.apiUrl.replace(/\/+$/, '')}/tenant/catalogo`;

describe('CU06 servicios del catálogo original', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('usa lectura tenant para categorías y no envía empresa_id', () => {
    TestBed.inject(CategoriasService).listarCategoriasAdmin().subscribe();
    const request = http.expectOne(`${BASE}/categorias`);
    expect(request.request.method).toBe('GET');
    expect(request.request.urlWithParams).not.toContain('empresa_id');
    request.flush([{ id: 1, nombre: 'Poleras', descripcion: null, estado: true }]);
  });

  it('usa escritura tenant para productos y normaliza el contrato CU06', () => {
    TestBed.inject(ProductosService).crearProducto({
      categoria_id: 1,
      nombre: 'Polera',
      descripcion: null,
      precio: 99,
    }).subscribe((producto) => {
      expect(producto.categoria.nombre).toBe('Poleras');
      expect(producto.precio).toBe(99);
    });
    const request = http.expectOne(`${BASE}/productos`);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).not.toHaveProperty('empresa_id');
    request.flush({ id: 2, nombre: 'Polera', descripcion: null, precio: '99.00', categoria_id: 1, categoria_nombre: 'Poleras', estado: true });
  });

  it('usa variantes y recursos tenant, incluyendo estado y principal', () => {
    const variantes = TestBed.inject(VariantesService);
    variantes.cambiarEstadoVariante(8, false).subscribe();
    const estado = http.expectOne(`${BASE}/variantes/8/estado`);
    expect(estado.request.body).toEqual({ estado: false });
    estado.flush({ id: 8, producto_id: 2, sku: 'SKU-8', talla_id: 4, talla: 'M', color_id: 8, color: 'Negro', estado: false });

    const recursos = TestBed.inject(RecursosProductoService);
    recursos.marcarPrincipal(12).subscribe();
    const principal = http.expectOne(`${BASE}/recursos-producto/12/principal`);
    expect(principal.request.method).toBe('PATCH');
    expect(principal.request.body).toEqual({});
    principal.flush({ id: 12, producto_id: 2, color_id: null, tipo: 'IMAGEN', url: 'https://example.com/a.jpg', es_principal: true, estado: true, color: null });
  });
});
