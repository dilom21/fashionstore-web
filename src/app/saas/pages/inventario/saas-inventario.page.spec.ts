import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { environment } from '../../../../environments/environment';
import {
  TenantInventario,
  TenantSucursal,
} from '../../models/tenant.models';
import { SaasInventarioPage } from './saas-inventario.page';

const API = environment.apiUrl.replace(/\/+$/, '');
const URL_INVENTARIO = `${API}/tenant/inventario`;
const URL_SUCURSALES = `${API}/tenant/empresa/sucursales`;

const SUCURSAL: TenantSucursal = {
  id: 3,
  ciudad_id: 1,
  nombre: 'Sucursal Centro',
  direccion: 'Av. Arce 123',
  telefono: null,
  estado: true,
};

const ITEM: TenantInventario = {
  id: 11,
  sucursal_id: 3,
  sucursal_nombre: 'Sucursal Centro',
  variante_producto_id: 4,
  producto_id: 2,
  producto_nombre: 'Polera oversize',
  sku: 'POL-M-BLA',
  talla_id: 1,
  talla: 'M',
  color_id: 2,
  color: 'Blanco',
  temporada_id: 5,
  temporada_nombre: 'Verano 2026',
  stock_actual: 8,
  stock_reservado: 3,
  stock_disponible: 5,
};

/** Fila sin unidades disponibles (disponible = actual - reservado). */
const ITEM_SIN_STOCK: TenantInventario = {
  ...ITEM,
  id: 12,
  variante_producto_id: 6,
  sku: 'POL-L-NEG',
  talla: 'L',
  color: 'Negro',
  stock_actual: 2,
  stock_reservado: 2,
  stock_disponible: 0,
};

/** Select sintético con un valor, para probar los manejadores de filtro. */
function eventoSelect(valor: string): Event {
  const select = document.createElement('select');
  const opcion = document.createElement('option');
  opcion.value = valor;
  select.appendChild(opcion);
  select.value = valor;
  return { target: select } as unknown as Event;
}

describe('SaasInventarioPage', () => {
  let fixture: ComponentFixture<SaasInventarioPage>;
  let componente: SaasInventarioPage;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });

    fixture = TestBed.createComponent(SaasInventarioPage);
    componente = fixture.componentInstance;
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  /** Responde la carga inicial: inventario y catálogo de sucursales. */
  function cargarInicial(
    items: TenantInventario[] = [ITEM, ITEM_SIN_STOCK],
    sucursales: TenantSucursal[] = [SUCURSAL],
  ): void {
    http
      .expectOne((peticion) => peticion.url === URL_INVENTARIO)
      .flush(items);
    http
      .expectOne((peticion) => peticion.url === URL_SUCURSALES)
      .flush(sucursales);
    fixture.detectChanges();
  }

  it('muestra las columnas del contrato y resalta el stock disponible en cero', () => {
    cargarInicial();

    const texto = fixture.nativeElement.textContent as string;
    expect(texto).toContain('Sucursal Centro');
    expect(texto).toContain('Polera oversize');
    expect(texto).toContain('POL-M-BLA');
    expect(texto).toContain('Verano 2026');
    expect(texto).toContain('Stock actual');
    expect(texto).toContain('Stock reservado');
    expect(texto).toContain('Stock disponible');
    expect(texto).toContain('Sin disponible');
    expect(componente.sinDisponible(ITEM)).toBe(false);
    expect(componente.sinDisponible(ITEM_SIN_STOCK)).toBe(true);
    expect(
      fixture.nativeElement.querySelectorAll('.stock--cero').length,
    ).toBe(1);
  });

  it('es de solo lectura: no ofrece acciones de escritura', () => {
    cargarInicial();

    const texto = fixture.nativeElement.textContent as string;
    expect(texto).toContain('Consulta de solo lectura');
    expect(texto).not.toContain('Guardar');
    expect(texto).not.toContain('Registrar movimiento');
    expect(texto).not.toContain('Nuevo');
  });

  it('muestra el estado vacío honesto cuando no hay existencias', () => {
    cargarInicial([]);

    const texto = fixture.nativeElement.textContent as string;
    expect(texto).toContain(
      'No hay existencias registradas en esta empresa para esta página.',
    );
    expect(componente.hayPaginaSiguiente()).toBe(false);
  });

  it('envía sucursal, texto, límite y offset con los nombres exactos del contrato', () => {
    cargarInicial();

    componente.cambiarSucursal(eventoSelect('3'));
    let peticion = http.expectOne(
      (solicitud) => solicitud.url === URL_INVENTARIO,
    );
    expect(peticion.request.method).toBe('GET');
    expect(peticion.request.params.get('sucursal_id')).toBe('3');
    expect(peticion.request.params.get('limit')).toBe('50');
    expect(peticion.request.params.get('offset')).toBe('0');
    expect(peticion.request.params.has('texto')).toBe(false);
    peticion.flush([ITEM_SIN_STOCK]);
    fixture.detectChanges();

    componente.aplicarBusqueda('  polera  ');
    peticion = http.expectOne((solicitud) => solicitud.url === URL_INVENTARIO);
    expect(peticion.request.params.get('texto')).toBe('polera');
    expect(peticion.request.params.get('sucursal_id')).toBe('3');
    peticion.flush([ITEM_SIN_STOCK]);
    fixture.detectChanges();

    expect(componente.pagina()).toBe(0);
    expect(componente.filtroTexto()).toBe('polera');
  });

  it('recorta el texto a 60 caracteres antes de consultar', () => {
    cargarInicial();

    componente.aplicarBusqueda('x'.repeat(70));
    const peticion = http.expectOne(
      (solicitud) => solicitud.url === URL_INVENTARIO,
    );
    expect(peticion.request.params.get('texto')?.length).toBe(60);
    peticion.flush([]);
    fixture.detectChanges();
  });

  it('pagina por offset y solo habilita Siguiente con una página completa', () => {
    cargarInicial();
    expect(componente.hayPaginaSiguiente()).toBe(false);

    componente.cambiarLimite(eventoSelect('25'));
    let peticion = http.expectOne(
      (solicitud) => solicitud.url === URL_INVENTARIO,
    );
    expect(peticion.request.params.get('limit')).toBe('25');
    peticion.flush(
      Array.from({ length: 25 }, (_, indice) => ({
        ...ITEM,
        id: 100 + indice,
      })),
    );
    fixture.detectChanges();
    expect(componente.hayPaginaSiguiente()).toBe(true);

    componente.paginaSiguiente();
    peticion = http.expectOne((solicitud) => solicitud.url === URL_INVENTARIO);
    expect(peticion.request.params.get('offset')).toBe('25');
    peticion.flush([]);
    fixture.detectChanges();
    expect(componente.pagina()).toBe(1);

    componente.paginaAnterior();
    peticion = http.expectOne((solicitud) => solicitud.url === URL_INVENTARIO);
    expect(peticion.request.params.get('offset')).toBe('0');
    peticion.flush([ITEM]);
    fixture.detectChanges();
  });

  it('un 403 se muestra como falta de permiso, sin error HTTP crudo', () => {
    cargarInicial();

    componente.recargar();
    http
      .expectOne((solicitud) => solicitud.url === URL_INVENTARIO)
      .flush(
        { detail: 'Permiso insuficiente' },
        { status: 403, statusText: 'Forbidden' },
      );
    fixture.detectChanges();

    expect(componente.sinPermiso()).toBe(true);
    expect(componente.error()).toBeNull();
    const texto = fixture.nativeElement.textContent as string;
    expect(texto).toContain('VENTAS/CONSULTAR');
    expect(texto).not.toContain('Permiso insuficiente');
  });

  it('un 503 se traduce al mensaje del servicio de errores', () => {
    cargarInicial();

    componente.recargar();
    http
      .expectOne((solicitud) => solicitud.url === URL_INVENTARIO)
      .flush(
        { detail: 'Compras SaaS apagado' },
        { status: 503, statusText: 'Service Unavailable' },
      );
    fixture.detectChanges();

    expect(componente.error()?.estado).toBe(503);
    const texto = fixture.nativeElement.textContent as string;
    expect(texto).toContain('El módulo de inventario no está habilitado.');
    expect(texto).toContain(
      'Módulo no habilitado en esta versión o ruta no migrada.',
    );
    expect(texto).not.toContain('Compras SaaS apagado');
  });

  it('si el catálogo de sucursales falla, el inventario sigue consultable', () => {
    http
      .expectOne((peticion) => peticion.url === URL_INVENTARIO)
      .flush([ITEM]);
    http
      .expectOne((peticion) => peticion.url === URL_SUCURSALES)
      .flush(
        { detail: 'Permiso insuficiente' },
        { status: 403, statusText: 'Forbidden' },
      );
    fixture.detectChanges();

    expect(componente.sucursalesSinPermiso()).toBe(true);
    expect(componente.inventario().length).toBe(1);
    const select = fixture.nativeElement.querySelector(
      '#inventario-sucursal',
    ) as HTMLSelectElement;
    expect(select.disabled).toBe(true);
  });
});
