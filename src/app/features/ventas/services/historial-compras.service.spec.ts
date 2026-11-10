import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { environment } from '../../../../environments/environment';
import { SAAS_MODE } from '../../../core/config/app-mode';
import {
  HistorialComprasService,
  construirBaseHistorial,
} from './historial-compras.service';

const API = environment.apiUrl.replace(/\/+$/, '');

const RESUMEN_CRUDO = {
  venta_id: 692,
  fecha_hora: '2026-11-10T10:00:00Z',
  canal: 'WEB',
  estado: 'COMPLETADA',
  total: '89.90',
  sucursal_id: 1,
  sucursal_nombre: 'Centro',
  cantidad_total_unidades: 1,
  cantidad_lineas: 1,
};

const DETALLE_CRUDO = {
  venta_id: 692,
  fecha_hora: '2026-11-10T10:00:00Z',
  canal: 'WEB',
  estado: 'COMPLETADA',
  total: '89.90',
  carrito_id: 1333,
  reserva_id: null,
  sucursal: {
    id: 1,
    nombre: 'Centro',
    direccion: 'Calle 1',
    telefono: null,
  },
  pago: {
    pago_id: 339,
    fecha_hora: '2026-11-10T10:01:00Z',
    monto: '89.90',
    metodo: 'TARJETA',
    estado: 'APROBADO',
    referencia_transaccion: 'pi_3Test',
    pasarela: 'STRIPE',
  },
  items: [
    {
      detalle_venta_id: 1,
      inventario_id: 2,
      producto_id: 3,
      producto_nombre: 'Polo',
      variante_producto_id: 4,
      sku: 'POL-M',
      talla_nombre: 'M',
      color_nombre: 'Negro',
      cantidad: 1,
      precio_unitario: '89.90',
      subtotal_linea: '89.90',
    },
  ],
  cantidad_total_unidades: 1,
};

function configurar(saasMode: boolean): {
  service: HistorialComprasService;
  http: HttpTestingController;
} {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: SAAS_MODE, useValue: saasMode },
    ],
  });
  return {
    service: TestBed.inject(HistorialComprasService),
    http: TestBed.inject(HttpTestingController),
  };
}

describe('HistorialComprasService (CU24, legacy)', () => {
  let service: HistorialComprasService;
  let http: HttpTestingController;

  beforeEach(() => {
    ({ service, http } = configurar(false));
  });

  afterEach(() => http.verify());

  it('obtenerHistorial usa GET /ventas/historial con filtros', () => {
    service
      .obtenerHistorial({ estado: 'COMPLETADA', pagina: 2, tamano_pagina: 20 })
      .subscribe();

    const peticion = http.expectOne(
      (req) =>
        req.url === `${API}/ventas/historial` &&
        req.params.get('estado') === 'COMPLETADA' &&
        req.params.get('pagina') === '2',
    );
    expect(peticion.request.method).toBe('GET');
    peticion.flush({
      items: [RESUMEN_CRUDO],
      pagina: 2,
      tamano_pagina: 20,
      total_registros: 21,
      total_paginas: 2,
    });
  });

  it('obtenerDetalle usa GET /ventas/historial/{id} y normaliza decimales', () => {
    let detalle: any;
    service.obtenerDetalle(692).subscribe((d) => (detalle = d));

    const peticion = http.expectOne(`${API}/ventas/historial/692`);
    expect(peticion.request.method).toBe('GET');
    peticion.flush(DETALLE_CRUDO);

    expect(detalle.total).toBe(89.9);
    expect(detalle.pago.monto).toBe(89.9);
    expect(detalle.items[0].subtotal_linea).toBe(89.9);
  });
});

describe('HistorialComprasService (CU24, SaaS)', () => {
  let service: HistorialComprasService;
  let http: HttpTestingController;

  beforeEach(() => {
    ({ service, http } = configurar(true));
  });

  afterEach(() => http.verify());

  it('obtenerHistorial usa GET /tenant/ventas/historial', () => {
    service.obtenerHistorial({ pagina: 1, tamano_pagina: 20 }).subscribe();

    const peticion = http.expectOne(
      (req) =>
        req.url === `${API}/tenant/ventas/historial` &&
        req.params.get('pagina') === '1' &&
        req.params.get('tamano_pagina') === '20',
    );
    expect(peticion.request.method).toBe('GET');
    peticion.flush({
      items: [RESUMEN_CRUDO],
      pagina: 1,
      tamano_pagina: 20,
      total_registros: 1,
      total_paginas: 1,
    });
  });

  it('obtenerDetalle usa GET /tenant/ventas/historial/{id}', () => {
    let detalle: any;
    service.obtenerDetalle(692).subscribe((d) => (detalle = d));

    const peticion = http.expectOne(`${API}/tenant/ventas/historial/692`);
    expect(peticion.request.method).toBe('GET');
    peticion.flush(DETALLE_CRUDO);

    expect(detalle.venta_id).toBe(692);
    expect(detalle.pago.pasarela).toBe('STRIPE');
  });

  it('construirBaseHistorial respeta el modo', () => {
    expect(construirBaseHistorial(API, true)).toBe(
      `${API}/tenant/ventas/historial`,
    );
    expect(construirBaseHistorial(API, false)).toBe(
      `${API}/ventas/historial`,
    );
  });
});
