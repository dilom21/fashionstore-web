import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { environment } from '../../../../environments/environment';
import {
  TenantCategoria,
  TenantColor,
  TenantProducto,
  TenantTalla,
  TenantVariante,
} from '../../models/tenant.models';
import { SaasSessionService } from '../../services/saas-session.service';
import { SaasCatalogoPage } from './saas-catalogo.page';

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

const TALLA: TenantTalla = { id: 4, nombre: 'M' };
const COLOR: TenantColor = { id: 7, nombre: 'Blanco' };

describe('SaasCatalogoPage', () => {
  let fixture: ComponentFixture<SaasCatalogoPage>;
  let componente: SaasCatalogoPage;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: SaasSessionService,
          useValue: { rol: () => 'ADMINISTRADOR' },
        },
      ],
    });

    fixture = TestBed.createComponent(SaasCatalogoPage);
    componente = fixture.componentInstance;
    http = TestBed.inject(HttpTestingController);

    http
      .expectOne((peticion) => peticion.url === `${BASE}/categorias`)
      .flush([CATEGORIA]);
    http
      .expectOne((peticion) => peticion.url === `${BASE}/productos`)
      .flush([PRODUCTO]);
    http
      .expectOne((peticion) => peticion.url === `${BASE}/tallas`)
      .flush([TALLA]);
    http
      .expectOne((peticion) => peticion.url === `${BASE}/colores`)
      .flush([COLOR]);
    fixture.detectChanges();
  });

  afterEach(() => {
    http.verify();
  });

  /** Abre una petición por URL exacta, sin query string. */
  function esperar(url: string) {
    return http.expectOne((peticion) => peticion.url === url);
  }

  it('muestra las pestañas con ARIA y las recorre con flechas', () => {
    const tabs: HTMLButtonElement[] = Array.from(
      fixture.nativeElement.querySelectorAll('[role="tab"]'),
    );

    expect(tabs.map((tab) => tab.textContent?.trim())).toEqual([
      'Categorías',
      'Productos',
    ]);
    expect(tabs[0].getAttribute('aria-selected')).toBe('true');
    expect(tabs[0].getAttribute('tabindex')).toBe('0');
    expect(tabs[1].getAttribute('aria-selected')).toBe('false');
    expect(tabs[1].getAttribute('tabindex')).toBe('-1');

    tabs[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    fixture.detectChanges();

    expect(componente.tabActiva()).toBe('productos');
    expect(tabs[1].getAttribute('aria-selected')).toBe('true');
    const panelProductos = fixture.nativeElement.querySelector(
      '#catalogo-panel-productos',
    ) as HTMLElement;
    expect(panelProductos.hidden).toBe(false);
  });

  it('lista productos con precio formateado en Bs', () => {
    componente.activarTab('productos');
    fixture.detectChanges();

    const texto = fixture.nativeElement.textContent as string;
    expect(texto).toContain('Polera oversize');
    expect(texto).toContain('Bs 120.00');
  });

  it('crea una categoría con el cuerpo mínimo (sin descripción vacía)', () => {
    componente.abrirAltaCategoria();
    componente.formCategoria.setValue({ nombre: 'Poleras', descripcion: '' });
    componente.enviarCategoria();

    const peticion = esperar(`${BASE}/categorias`);
    expect(peticion.request.method).toBe('POST');
    expect(peticion.request.body).toEqual({ nombre: 'Poleras' });
    peticion.flush(CATEGORIA, { status: 201, statusText: 'Created' });

    // Tras el alta, la pantalla refresca el listado de categorías.
    esperar(`${BASE}/categorias`).flush([CATEGORIA]);
    fixture.detectChanges();

    expect(componente.mensajeExito()).toContain('creada correctamente');
  });

  it('crea un producto enviando el precio normalizado como número', () => {
    componente.activarTab('productos');
    componente.abrirAltaProducto();
    componente.formProducto.setValue({
      categoria_id: 3,
      nombre: 'Polera oversize',
      descripcion: '',
      precio: '149,90',
    });
    componente.enviarProducto();

    const peticion = esperar(`${BASE}/productos`);
    expect(peticion.request.method).toBe('POST');
    expect(peticion.request.body).toEqual({
      categoria_id: 3,
      nombre: 'Polera oversize',
      precio: 149.9,
    });
    peticion.flush(PRODUCTO, { status: 201, statusText: 'Created' });

    esperar(`${BASE}/productos`).flush([PRODUCTO]);
    fixture.detectChanges();

    expect(componente.mensajeExito()).toContain('creado correctamente');
  });

  it('filtra por categoría con limit y offset exactos', () => {
    componente.activarTab('productos');
    fixture.detectChanges();

    const select = fixture.nativeElement.querySelector(
      '#catalogo-filtro-categoria',
    ) as HTMLSelectElement;
    select.value = '3';
    select.dispatchEvent(new Event('change'));

    const peticion = http.expectOne((solicitud) =>
      solicitud.url.endsWith('/tenant/catalogo/productos'),
    );
    expect(peticion.request.params.get('categoria_id')).toBe('3');
    expect(peticion.request.params.get('limit')).toBe('50');
    expect(peticion.request.params.get('offset')).toBe('0');
    peticion.flush([PRODUCTO]);

    expect(componente.filtroCategoria()).toBe(3);
  });

  it('muestra el aviso de los diccionarios y edita solo el SKU', () => {
    componente.activarTab('productos');
    componente.verVariantes(PRODUCTO);
    esperar(`${BASE}/productos/9/variantes`).flush([VARIANTE]);
    componente.editarVariante(VARIANTE);
    fixture.detectChanges();

    const texto = fixture.nativeElement.textContent as string;
    expect(texto).toContain(
      'Las tallas y los colores provienen de los diccionarios globales del sistema.',
    );

    componente.formVariante.controls.sku.setValue('POL-M-BLA-2');
    componente.enviarVariante();

    const peticion = esperar(`${BASE}/variantes/21`);
    expect(peticion.request.method).toBe('PATCH');
    expect(peticion.request.body).toEqual({ sku: 'POL-M-BLA-2' });
    peticion.flush({ ...VARIANTE, sku: 'POL-M-BLA-2' });

    esperar(`${BASE}/productos/9/variantes`).flush([
      { ...VARIANTE, sku: 'POL-M-BLA-2' },
    ]);
    expect(componente.mensajeExito()).toContain('actualizada');
  });

  it('precarga talla/color por ID y conserva esos IDs al editar', () => {
    componente.activarTab('productos');
    componente.verVariantes(PRODUCTO);
    esperar(`${BASE}/productos/9/variantes`).flush([VARIANTE]);

    componente.editarVariante(VARIANTE);
    expect(componente.formVariante.controls.talla_id.value).toBe(4);
    expect(componente.formVariante.controls.color_id.value).toBe(7);

    componente.formVariante.controls.sku.setValue('POL-M-BLA-4');
    componente.enviarVariante();
    const peticion = esperar(`${BASE}/variantes/21`);
    expect(peticion.request.body).toEqual({ sku: 'POL-M-BLA-4' });
    peticion.flush({ ...VARIANTE, sku: 'POL-M-BLA-4' });
    esperar(`${BASE}/productos/9/variantes`).flush([
      { ...VARIANTE, sku: 'POL-M-BLA-4' },
    ]);
  });

  it('crea una variante con los ids elegidos en los selectores', () => {
    componente.activarTab('productos');
    componente.verVariantes(PRODUCTO);
    esperar(`${BASE}/productos/9/variantes`).flush([]);

    componente.abrirAltaVariante();
    expect(componente.catalogosVarianteDisponibles()).toBe(true);
    componente.formVariante.setValue({
      sku: 'POL-M-BLA',
      talla_id: TALLA.id,
      color_id: COLOR.id,
    });
    componente.enviarVariante();

    const peticion = esperar(`${BASE}/productos/9/variantes`);
    expect(peticion.request.method).toBe('POST');
    expect(peticion.request.body).toEqual({
      sku: 'POL-M-BLA',
      talla_id: 4,
      color_id: 7,
    });
    peticion.flush(VARIANTE, { status: 201, statusText: 'Created' });

    esperar(`${BASE}/productos/9/variantes`).flush([VARIANTE]);
    fixture.detectChanges();

    expect(componente.mensajeExito()).toContain('Variante POL-M-BLA agregada');
  });

  it('bloquea el alta de variantes cuando falta un diccionario', () => {
    componente.tallas.set([]);
    fixture.detectChanges();

    expect(componente.catalogosVarianteDisponibles()).toBe(false);
    expect(componente.avisoCatalogosVariante()).toContain(
      'El diccionario de tallas o el de colores llegó vacío',
    );
  });

  it('permite editar el SKU aunque falten los diccionarios', () => {
    componente.activarTab('productos');
    componente.verVariantes(PRODUCTO);
    esperar(`${BASE}/productos/9/variantes`).flush([VARIANTE]);

    componente.tallas.set([]);
    componente.editarVariante(VARIANTE);
    componente.formVariante.controls.sku.setValue('POL-M-BLA-3');
    componente.enviarVariante();

    const peticion = esperar(`${BASE}/variantes/21`);
    expect(peticion.request.method).toBe('PATCH');
    expect(peticion.request.body).toEqual({ sku: 'POL-M-BLA-3' });
    peticion.flush({ ...VARIANTE, sku: 'POL-M-BLA-3' });
    esperar(`${BASE}/productos/9/variantes`).flush([
      { ...VARIANTE, sku: 'POL-M-BLA-3' },
    ]);
  });
});
