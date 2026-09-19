import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { environment } from '../../../../../environments/environment';
import { ReservaSucursalDetalle } from '../models/reserva-sucursal.model';
import { ReservasSucursalService } from './reservas-sucursal.service';

const API = environment.apiUrl.replace(/\/+$/, '');
const BASE = `${API}/reservas-sucursal`;

function detalle(
  reservaId: number,
  estado: ReservaSucursalDetalle['estado'],
): ReservaSucursalDetalle {
  return {
    reserva_id: reservaId,
    carrito_id: 7,
    cliente_id: 3,
    cliente_nombre: 'Ana',
    cliente_apellido: 'Quispe',
    cliente_telefono: '70000000',
    sucursal_id: 2,
    sucursal_nombre: 'Sucursal Centro',
    fecha_reserva: '2026-09-18T11:00:00+00:00',
    fecha_atencion: '2026-09-20T10:00:00',
    estado,
    observacion: null,
    items: [],
    cantidad_total_unidades: 0,
  };
}

describe('ReservasSucursalService (CU17)', () => {
  let service: ReservasSucursalService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(ReservasSucursalService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
  });

  it('usa el prefijo /reservas-sucursal (distinto del listado del cliente)', () => {
    expect(BASE.endsWith('/reservas-sucursal')).toBe(true);
    expect(BASE.endsWith('/reservas')).toBe(false);
  });

  it('listarReservas sin filtros no agrega parámetros', () => {
    service.listarReservas().subscribe();
    const peticion = http.expectOne(BASE);
    expect(peticion.request.method).toBe('GET');
    expect(peticion.request.params.keys().length).toBe(0);
    peticion.flush({ items: [], total: 0, limit: 20, offset: 0 });
  });

  it('listarReservas envía los filtros reales del backend', () => {
    service
      .listarReservas({
        sucursal_id: 2,
        estado: 'CONFIRMADA',
        buscar: '  ana  ',
        fecha_desde: '2026-09-01',
        fecha_hasta: '2026-09-30',
        limit: 20,
        offset: 40,
      })
      .subscribe();

    const peticion = http.expectOne((req) => req.url === BASE);
    const params = peticion.request.params;
    expect(params.get('sucursal_id')).toBe('2');
    expect(params.get('estado')).toBe('CONFIRMADA');
    expect(params.get('buscar')).toBe('ana');
    expect(params.get('fecha_desde')).toBe('2026-09-01');
    expect(params.get('fecha_hasta')).toBe('2026-09-30');
    expect(params.get('limit')).toBe('20');
    expect(params.get('offset')).toBe('40');
    peticion.flush({ items: [], total: 0, limit: 20, offset: 40 });
  });

  it('no envía filtros vacíos (el encargado nunca manda sucursal_id)', () => {
    service
      .listarReservas({ buscar: '   ', fecha_desde: undefined })
      .subscribe();
    const peticion = http.expectOne(BASE);
    expect(peticion.request.params.keys().length).toBe(0);
    peticion.flush({ items: [], total: 0, limit: 20, offset: 0 });
  });

  it('contarReservas consulta con limit=1 y devuelve el total real', () => {
    let total = -1;
    service
      .contarReservas({ estado: 'PENDIENTE' })
      .subscribe((valor) => (total = valor));

    const peticion = http.expectOne((req) => req.url === BASE);
    expect(peticion.request.params.get('limit')).toBe('1');
    expect(peticion.request.params.get('offset')).toBe('0');
    expect(peticion.request.params.get('estado')).toBe('PENDIENTE');
    peticion.flush({ items: [], total: 7, limit: 1, offset: 0 });

    expect(total).toBe(7);
  });

  it('obtenerReserva consulta el detalle real', () => {
    service.obtenerReserva(15).subscribe();
    const peticion = http.expectOne(`${BASE}/15`);
    expect(peticion.request.method).toBe('GET');
    peticion.flush(detalle(15, 'PENDIENTE'));
  });

  it('confirmarReserva hace PATCH /{id}/confirmar', () => {
    let estado = '';
    service
      .confirmarReserva(15)
      .subscribe((respuesta) => (estado = respuesta.estado));

    const peticion = http.expectOne(`${BASE}/15/confirmar`);
    expect(peticion.request.method).toBe('PATCH');
    peticion.flush(detalle(15, 'CONFIRMADA'));
    expect(estado).toBe('CONFIRMADA');
  });

  it('cancelarReserva hace PATCH /{id}/cancelar con observacion', () => {
    service.cancelarReserva(15, null).subscribe();
    const peticion = http.expectOne(`${BASE}/15/cancelar`);
    expect(peticion.request.method).toBe('PATCH');
    expect(peticion.request.body).toEqual({ observacion: null });
    peticion.flush(detalle(15, 'CANCELADA'));
  });

  it('esConfirmable solo admite PENDIENTE', () => {
    expect(service.esConfirmable('PENDIENTE')).toBe(true);
    expect(service.esConfirmable('confirmada')).toBe(false);
    expect(service.esConfirmable('ATENDIDA')).toBe(false);
    expect(service.esConfirmable('CANCELADA')).toBe(false);
    expect(service.esConfirmable('VENCIDA')).toBe(false);
  });

  it('esCancelable admite PENDIENTE y CONFIRMADA (no ATENDIDA/CANCELADA)', () => {
    expect(service.esCancelable('PENDIENTE')).toBe(true);
    expect(service.esCancelable('CONFIRMADA')).toBe(true);
    expect(service.esCancelable('ATENDIDA')).toBe(false);
    expect(service.esCancelable('CANCELADA')).toBe(false);
    expect(service.esCancelable('VENCIDA')).toBe(false);
  });
});
