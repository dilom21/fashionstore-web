import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { SAAS_MODE } from '../../../../core/config/app-mode';
import { environment } from '../../../../../environments/environment';
import { ReservasSucursalService } from './reservas-sucursal.service';

const API = environment.apiUrl.replace(/\/+$/, '');
const BASE = `${API}/tenant/reservas-sucursal`;

describe('ReservasSucursalService (SaaS, saasMode=true)', () => {
  let service: ReservasSucursalService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: SAAS_MODE, useValue: true },
        ReservasSucursalService,
      ],
    });
    service = TestBed.inject(ReservasSucursalService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('listarReservas usa GET /tenant/reservas-sucursal con filtros', () => {
    service
      .listarReservas({ estado: 'PENDIENTE', buscar: 'ana', limit: 20, offset: 0 })
      .subscribe();

    const peticion = http.expectOne(
      (req) =>
        req.url === BASE &&
        req.params.get('estado') === 'PENDIENTE' &&
        req.params.get('buscar') === 'ana' &&
        req.params.get('limit') === '20',
    );
    expect(peticion.request.method).toBe('GET');
    peticion.flush({ items: [], total: 0, limit: 20, offset: 0 });
  });

  it('obtenerEstadisticas usa GET /tenant/reservas-sucursal/estadisticas', () => {
    let estadisticas: any;
    service
      .obtenerEstadisticas({ sucursal_id: 2, fecha_desde: '2026-11-01' })
      .subscribe((r) => (estadisticas = r));

    const peticion = http.expectOne(
      (req) =>
        req.url === `${BASE}/estadisticas` &&
        req.params.get('sucursal_id') === '2' &&
        req.params.get('fecha_desde') === '2026-11-01',
    );
    expect(peticion.request.method).toBe('GET');
    peticion.flush({
      por_estado: { PENDIENTE: 2, CONFIRMADA: 1, CANCELADA: 0 },
      total_reservas: 3,
      total_unidades: 7,
    });

    expect(estadisticas.total_reservas).toBe(3);
    expect(estadisticas.por_estado['PENDIENTE']).toBe(2);
  });

  it('confirmar y cancelar usan las rutas tenant reales', () => {
    service.confirmarReserva(15).subscribe();
    const confirmar = http.expectOne(`${BASE}/15/confirmar`);
    expect(confirmar.request.method).toBe('PATCH');
    confirmar.flush({ reserva_id: 15, estado: 'CONFIRMADA', items: [] });

    service.cancelarReserva(15, 'motivo').subscribe();
    const cancelar = http.expectOne(`${BASE}/15/cancelar`);
    expect(cancelar.request.method).toBe('PATCH');
    expect(cancelar.request.body).toEqual({ observacion: 'motivo' });
    cancelar.flush({ reserva_id: 15, estado: 'CANCELADA', items: [] });
  });
});
