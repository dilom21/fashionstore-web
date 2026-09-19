import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { environment } from '../../../../environments/environment';
import { ReservasService } from './reservas.service';

const API = environment.apiUrl.replace(/\/+$/, '');

describe('ReservasService (CU16)', () => {
  let service: ReservasService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(ReservasService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
  });

  it('crearReserva envía solo carrito_id, fecha_atencion y observacion', () => {
    service
      .crearReserva({
        carrito_id: 12,
        fecha_atencion: '2026-09-20T10:00:00',
        observacion: null,
      })
      .subscribe();

    const peticion = http.expectOne(`${API}/reservas`);
    expect(peticion.request.method).toBe('POST');
    expect(peticion.request.body).toEqual({
      carrito_id: 12,
      fecha_atencion: '2026-09-20T10:00:00',
      observacion: null,
    });
    // El cliente sale del JWT: nunca se envía desde el frontend.
    expect('cliente_id' in peticion.request.body).toBe(false);
    peticion.flush({});
  });

  it('listarReservas sin estado no agrega parámetros', () => {
    service.listarReservas().subscribe();
    const peticion = http.expectOne(`${API}/reservas`);
    expect(peticion.request.method).toBe('GET');
    expect(peticion.request.params.keys().length).toBe(0);
    peticion.flush({ items: [], total_reservas: 0 });
  });

  it('listarReservas envía el filtro de estado cuando se indica', () => {
    service.listarReservas('PENDIENTE').subscribe();
    const peticion = http.expectOne(`${API}/reservas?estado=PENDIENTE`);
    expect(peticion.request.params.get('estado')).toBe('PENDIENTE');
    peticion.flush({ items: [], total_reservas: 0 });
  });

  it('obtenerReserva y cancelarReserva usan las rutas reales del backend', () => {
    service.obtenerReserva(5).subscribe();
    const detalle = http.expectOne(`${API}/reservas/5`);
    expect(detalle.request.method).toBe('GET');
    detalle.flush({});

    service.cancelarReserva(5, null).subscribe();
    const cancelar = http.expectOne(`${API}/reservas/5/cancelar`);
    expect(cancelar.request.method).toBe('PATCH');
    expect(cancelar.request.body).toEqual({ observacion: null });
    cancelar.flush({});
  });

  it('esCancelable admite solo PENDIENTE y CONFIRMADA', () => {
    expect(service.esCancelable('PENDIENTE')).toBe(true);
    expect(service.esCancelable('confirmada')).toBe(true);
    expect(service.esCancelable('ATENDIDA')).toBe(false);
    expect(service.esCancelable('CANCELADA')).toBe(false);
    expect(service.esCancelable('VENCIDA')).toBe(false);
  });
});
