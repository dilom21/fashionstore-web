import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { environment } from '../../../../environments/environment';
import { SAAS_MODE } from '../../../core/config/app-mode';
import {
  construirFechaAtencion,
  construirParamsListaReservas,
  construirRutaReservas,
  ReservasService,
} from './reservas.service';

const API = environment.apiUrl.replace(/\/+$/, '');

describe('constructores de reservas (mode-aware)', () => {
  it('SaaS usa /tenant/reservas y legacy /reservas', () => {
    expect(construirRutaReservas(API, true)).toBe(`${API}/tenant/reservas`);
    expect(construirRutaReservas(API, false)).toBe(`${API}/reservas`);
  });

  it('SaaS exige fecha AWARE; legacy conserva la fecha sin zona', () => {
    const aware = construirFechaAtencion(true, '2026-11-10', '10:00');
    expect(aware).not.toBeNull();
    expect(aware).toMatch(/Z$|[+-]\d{2}:\d{2}$/);
    expect(
      new Date(aware as string).getTime(),
    ).toBe(new Date(2026, 10, 10, 10, 0, 0, 0).getTime());

    const naive = construirFechaAtencion(false, '2026-11-10', '10:00');
    expect(naive).toBe('2026-11-10T10:00:00');
  });

  it('los parámetros de paginación solo se envían en SaaS', () => {
    const saas = construirParamsListaReservas(true, 'PENDIENTE', 20, 40);
    expect(saas.get('estado')).toBe('PENDIENTE');
    expect(saas.get('limit')).toBe('20');
    expect(saas.get('offset')).toBe('40');

    const legacy = construirParamsListaReservas(false, 'PENDIENTE', 20, 40);
    expect(legacy.get('estado')).toBe('PENDIENTE');
    expect(legacy.get('limit')).toBeNull();
    expect(legacy.get('offset')).toBeNull();
  });
});

describe('ReservasService (legacy, saasMode=false)', () => {
  let service: ReservasService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: SAAS_MODE, useValue: false },
        ReservasService,
      ],
    });
    service = TestBed.inject(ReservasService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('crearReserva usa POST /reservas con fecha sin zona', () => {
    service
      .crearReserva({
        carrito_id: 12,
        fecha: '2026-11-10',
        hora: '10:00',
        observacion: null,
      })
      .subscribe();

    const peticion = http.expectOne(`${API}/reservas`);
    expect(peticion.request.method).toBe('POST');
    expect(peticion.request.body).toEqual({
      carrito_id: 12,
      fecha_atencion: '2026-11-10T10:00:00',
      observacion: null,
    });
    expect('cliente_id' in peticion.request.body).toBe(false);
    peticion.flush({
      reserva_id: 5,
      carrito_id: 12,
      sucursal_id: 2,
      sucursal_nombre: 'Centro',
      fecha_reserva: '2026-11-10T09:00:00',
      fecha_atencion: '2026-11-10T10:00:00',
      estado: 'PENDIENTE',
      observacion: null,
      items: [],
      cantidad_total_unidades: 2,
    });
  });

  it('listarReservas usa GET /reservas y normaliza total_reservas', () => {
    let total = 0;
    service
      .listarReservas('PENDIENTE')
      .subscribe((r) => (total = r.total));

    const peticion = http.expectOne(
      (req) => req.url === `${API}/reservas` && req.params.get('estado') === 'PENDIENTE',
    );
    expect(peticion.request.method).toBe('GET');
    peticion.flush({
      items: [
        {
          reserva_id: 5,
          carrito_id: 12,
          cliente_id: 3,
          sucursal_id: 2,
          sucursal_nombre: 'Centro',
          fecha_reserva: 'x',
          fecha_atencion: 'y',
          estado: 'PENDIENTE',
          observacion: null,
          cantidad_lineas: 1,
          cantidad_unidades: 2,
        },
      ],
      total_reservas: 1,
    });

    expect(total).toBe(1);
  });

  it('obtenerReserva normaliza imagen_principal y cantidad_total_unidades', () => {
    let detalle: any;
    service.obtenerReserva(5).subscribe((d) => (detalle = d));

    const peticion = http.expectOne(`${API}/reservas/5`);
    peticion.flush({
      reserva_id: 5,
      carrito_id: 12,
      cliente_id: 3,
      sucursal_id: 2,
      sucursal_nombre: 'Centro',
      fecha_reserva: 'x',
      fecha_atencion: 'y',
      estado: 'PENDIENTE',
      observacion: null,
      items: [
        {
          detalle_id: 1,
          inventario_id: 9,
          producto_id: 8,
          producto_nombre: 'Camisa',
          imagen_principal: 'https://cdn/x.jpg',
          variante_producto_id: 3,
          sku: 'OXF-M',
          talla_id: 2,
          talla_nombre: 'M',
          color_id: 1,
          color_nombre: 'Negro',
          temporada_id: 1,
          temporada_nombre: 'PV26',
          cantidad: 2,
        },
      ],
      cantidad_total_unidades: 2,
    });

    expect(detalle.cantidad_unidades).toBe(2);
    expect(detalle.items[0].imagen_principal_url).toBe('https://cdn/x.jpg');
  });

  it('cancelarReserva usa PATCH /reservas/{id}/cancelar y devuelve el estado', () => {
    let resultado: any;
    service.cancelarReserva(5, null).subscribe((r) => (resultado = r));

    const peticion = http.expectOne(`${API}/reservas/5/cancelar`);
    expect(peticion.request.method).toBe('PATCH');
    expect(peticion.request.body).toEqual({ observacion: null });
    peticion.flush({
      reserva_id: 5,
      estado: 'CANCELADA',
      items: [],
      cantidad_total_unidades: 0,
    });

    expect(resultado).toEqual({ reserva_id: 5, estado: 'CANCELADA' });
  });

  it('la prevalidación no existe en legacy', () => {
    let error: unknown;
    service
      .prevalidarReserva({
        carrito_id: 1,
        fecha: '2026-11-10',
        hora: '10:00',
        observacion: null,
      })
      .subscribe({ error: (e: unknown) => (error = e) });
    expect(error).toBeInstanceOf(Error);
    http.expectNone(`${API}/reservas/prevalidar`);
  });

  it('esCancelable admite solo PENDIENTE y CONFIRMADA', () => {
    expect(service.esCancelable('PENDIENTE')).toBe(true);
    expect(service.esCancelable('confirmada')).toBe(true);
    expect(service.esCancelable('ATENDIDA')).toBe(false);
    expect(service.esCancelable('CANCELADA')).toBe(false);
    expect(service.esCancelable('VENCIDA')).toBe(false);
  });
});
