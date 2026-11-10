import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { SAAS_MODE } from '../../../core/config/app-mode';
import { environment } from '../../../../environments/environment';
import { AtencionReservasService } from './atencion-reservas.service';

const API = environment.apiUrl.replace(/\/+$/, '');
const BASE = `${API}/tenant/atencion-reservas`;

describe('AtencionReservasService (SaaS, saasMode=true)', () => {
  let service: AtencionReservasService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: SAAS_MODE, useValue: true },
        AtencionReservasService,
      ],
    });
    service = TestBed.inject(AtencionReservasService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('listarReservas usa GET /tenant/atencion-reservas', () => {
    service.listarReservas({ buscar: 'ana', limit: 20, offset: 0 }).subscribe();

    const peticion = http.expectOne(
      (req) => req.url === BASE && req.params.get('buscar') === 'ana',
    );
    expect(peticion.request.method).toBe('GET');
    peticion.flush({ items: [], total: 0, limit: 20, offset: 0 });
  });

  it('prepararVenta usa POST /tenant/atencion-reservas/{id}/preparar-venta', () => {
    service
      .prepararVenta(10, {
        items: [{ inventario_id: 1, cantidad_compra: 2 }],
      })
      .subscribe();

    const peticion = http.expectOne(`${BASE}/10/preparar-venta`);
    expect(peticion.request.method).toBe('POST');
    expect(peticion.request.body).toEqual({
      items: [{ inventario_id: 1, cantidad_compra: 2 }],
    });
    peticion.flush({
      reserva_id: 10,
      sucursal_id: 2,
      estado: 'CONFIRMADA',
      items: [],
      total_unidades_reservadas: 2,
      total_unidades_compra: 2,
      total_unidades_no_compra: 0,
      venta_registrada: false,
      reserva_modificada: false,
    });
  });

  it('finalizarSinCompra y obtenerReserva usan las rutas tenant', () => {
    service.finalizarSinCompra(10, 'no vino').subscribe();
    const finalizar = http.expectOne(`${BASE}/10/finalizar-sin-compra`);
    expect(finalizar.request.method).toBe('POST');
    expect(finalizar.request.body).toEqual({ observacion: 'no vino' });
    finalizar.flush({ reserva_id: 10, estado: 'ATENDIDA', items: [] });

    service.obtenerReserva(10).subscribe();
    const detalle = http.expectOne(`${BASE}/10`);
    expect(detalle.request.method).toBe('GET');
    detalle.flush({ reserva_id: 10, estado: 'ATENDIDA', items: [] });
  });
});
