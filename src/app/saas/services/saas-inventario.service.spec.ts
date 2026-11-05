import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { environment } from '../../../environments/environment';
import { TenantInventario } from '../models/tenant.models';
import { SaasInventarioService } from './saas-inventario.service';

const API = environment.apiUrl.replace(/\/+$/, '');
const BASE = `${API}/tenant/inventario`;

const FILA: TenantInventario = {
  id: 101,
  sucursal_id: 4,
  sucursal_nombre: 'Sucursal Centro',
  variante_producto_id: 9,
  producto_id: 3,
  producto_nombre: 'Polera oversize',
  sku: 'POL-M-BLA',
  talla_id: 4,
  talla: 'M',
  color_id: 7,
  color: 'Blanco',
  temporada_id: 2,
  temporada_nombre: 'Verano 2026',
  stock_actual: 7,
  stock_reservado: 2,
  stock_disponible: 5,
};

describe('SaasInventarioService', () => {
  let service: SaasInventarioService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(SaasInventarioService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
  });

  /** Abre la petición del inventario (URL exacta, sin query string). */
  function esperar() {
    return http.expectOne((peticion) => peticion.url === BASE);
  }

  it('sin filtros hace GET a la URL exacta sin barra final', () => {
    let resultado: TenantInventario[] | undefined;
    service.listar().subscribe((valor) => (resultado = valor));

    const peticion = esperar();
    expect(peticion.request.method).toBe('GET');
    expect(peticion.request.url.endsWith('/')).toBe(false);
    expect(peticion.request.urlWithParams).toBe(BASE);
    peticion.flush([FILA]);

    expect(resultado).toEqual([FILA]);
  });

  it('envía sucursal_id, texto, limit y offset exactos', () => {
    service
      .listar({
        sucursal_id: 4,
        texto: '  POL  ',
        limit: 200,
        offset: 20,
      })
      .subscribe();

    const peticion = esperar();
    expect(peticion.request.params.get('sucursal_id')).toBe('4');
    expect(peticion.request.params.get('texto')).toBe('POL');
    expect(peticion.request.params.get('limit')).toBe('200');
    expect(peticion.request.params.get('offset')).toBe('20');
    expect(peticion.request.params.keys().sort()).toEqual([
      'limit',
      'offset',
      'sucursal_id',
      'texto',
    ]);
    peticion.flush([FILA]);
  });

  it('omite los filtros nulos o fuera de rango', () => {
    service
      .listar({
        sucursal_id: 0,
        texto: '   ',
        limit: 500,
        offset: -1,
      })
      .subscribe();

    const peticion = esperar();
    expect(peticion.request.params.keys()).toEqual([]);
    peticion.flush([]);
  });

  it('propaga el 403 sin transformarlo (la pantalla lo trata como aviso)', () => {
    let estado = 0;
    service.listar({ sucursal_id: 4 }).subscribe({
      error: (error: { status: number }) => (estado = error.status),
    });

    esperar().flush(
      { detail: 'Operacion no autorizada' },
      { status: 403, statusText: 'Forbidden' },
    );

    expect(estado).toBe(403);
  });
});
