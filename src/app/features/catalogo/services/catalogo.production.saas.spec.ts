import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { SAAS_MODE } from '../../../core/config/app-mode';
import { environment as prod } from '../../../../environments/environment.production';
import { environment as legacy } from '../../../../environments/environment';
import { ProductosDestacados } from '../../home/components/productos-destacados/productos-destacados';
import { CatalogoService } from './catalogo.service';

const BASE = 'https://fashionstore-api.duckdns.org';
// La suite usa environment.ts (localhost); el build PRODUCCION reemplaza
// ese archivo por environment.production.ts y utiliza AWS HTTPS.
const PUBLICO = `${legacy.apiUrl}/catalogo/public/vanter-men`;
const productoApi = (id: number) => ({
  id, nombre: `Producto ${id}`, descripcion: null,
  categoria: { id: 1, nombre: 'Polos' }, precio: '149.90',
  precio_definitivo: '139.90', precio_calculo_pendiente: false,
  imagen_principal_url: `https://cdn.example.test/${id}.jpg`,
});

describe('Contrato SaaS de producción (Vanter Men)', () => {
  it('usa exclusivamente AWS HTTPS, modo SaaS y slug real; legacy local intacto', () => {
    expect(prod.apiUrl).toBe(BASE);
    expect(prod.saasMode).toBe(true);
    expect(prod.empresaSlug).toBe('vanter-men');
    expect(prod.saasNombreEntorno).not.toBe('legacy');
    expect(legacy.apiUrl).toBe('http://127.0.0.1:8000');
    expect(legacy.saasMode).toBe(false);
  });
});

describe('Catálogo público SaaS — HTTP real de la fachada, sin endpoints legacy', () => {
  let service: CatalogoService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: SAAS_MODE, useValue: true },
      ],
    });
    service = TestBed.inject(CatalogoService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    try { http.verify(); } finally { TestBed.resetTestingModule(); }
  });

  it('consulta listado SaaS con limit/offset y normaliza precios sin /productos legacy', () => {
    let resultado: ReturnType<CatalogoService['listarProductos']> | undefined;
    let productos: Array<{ id: number; precio: number; precio_definitivo: number }> = [];
    resultado = service.listarProductos({ limit: 10, offset: 0 });
    resultado.subscribe(x => productos = x);
    const request = http.expectOne(r => r.url === `${PUBLICO}/productos`);
    expect(request.request.method).toBe('GET');
    expect(request.request.params.get('limit')).toBe('10');
    expect(request.request.params.get('offset')).toBe('0');
    expect(request.request.params.get('disponibilidad')).toBe('TODOS');
    expect(request.request.url).not.toBe(`${legacy.apiUrl}/productos`);
    request.flush(Array.from({ length: 10 }, (_, i) => productoApi(i + 1)));
    expect(productos).toHaveLength(10);
    expect(productos[0]).toMatchObject({ id: 1, precio: 149.9, precio_definitivo: 139.9 });
  });

  it('consulta filtros en /catalogo/public/vanter-men/filtros', () => {
    let categorias: Array<{ nombre: string }> = [];
    service.obtenerFiltros().subscribe(f => categorias = f.categorias);
    const request = http.expectOne(`${PUBLICO}/filtros`);
    expect(request.request.method).toBe('GET');
    request.flush({
      categorias: [{ id: 1, nombre: 'Polos' }],
      tallas: [], colores: [], temporadas: [], colecciones: [], sucursales: [],
    });
    expect(categorias.map(c => c.nombre)).toEqual(['Polos']);
  });

  it('consulta detalle SaaS con variantes, imágenes y disponibilidad sin llamada legacy extra', () => {
    let recibido: any;
    service.obtenerProductoDetalle(7).subscribe(x => recibido = x);
    const request = http.expectOne(`${PUBLICO}/productos/7`);
    expect(request.request.method).toBe('GET');
    request.flush({
      ...productoApi(7),
      variantes: [{
        id: 91, sku: 'P7-M', estado: true,
        talla: { id: 2, nombre: 'M' }, color: { id: 1, nombre: 'Azul' },
      }],
      recursos: [{ id: 11, tipo: 'IMAGEN', url: 'https://cdn.example.test/7.jpg', es_principal: true }],
      disponibilidad: [{
        variante_id: 91, sucursal_id: 5, sucursal: 'Centro',
        sku: 'P7-M', talla: 'M', color: 'Azul', temporada: 'PV26', stock_disponible: 4,
      }],
    });
    expect(recibido.id).toBe(7);
    expect(recibido.imagen_principal_url).toContain('/7.jpg');
    expect(recibido.variantes[0].id).toBe(91);
    expect(recibido.disponibilidad[0].stock_disponible).toBe(4);
    expect(http.match(`${legacy.apiUrl}/productos/7/disponibilidad`)).toHaveLength(0);
  });

  it('bloquea cualquier consulta accidental a disponibilidad legacy en SaaS', () => {
    let error: unknown;
    service.obtenerDisponibilidad(7).subscribe({ error: e => error = e });
    expect(error).toBeInstanceOf(Error);
    expect(http.match(() => true)).toHaveLength(0);
  });
});

describe('Productos destacados — integración de catálogo público SaaS', () => {
  it('muestra los primeros seis de diez productos devueltos por la ruta SaaS', async () => {
    TestBed.configureTestingModule({
      imports: [ProductosDestacados],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: SAAS_MODE, useValue: true },
      ],
    });
    const fixture = TestBed.createComponent(ProductosDestacados);
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    const req = http.expectOne(r => r.url === `${PUBLICO}/productos`);
    expect(req.request.params.get('limit')).toBe('100');
    req.flush(Array.from({ length: 10 }, (_, i) => productoApi(i + 1)));
    await fixture.whenStable();
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Producto 1');
    expect(text).toContain('Producto 6');
    expect(text).not.toContain('Producto 10');
    expect(fixture.nativeElement.querySelectorAll('app-product-card').length).toBe(6);
    http.verify();
    fixture.destroy();
    TestBed.resetTestingModule();
  });
});
