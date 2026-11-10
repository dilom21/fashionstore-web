import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { SAAS_MODE } from '../../../core/config/app-mode';
import { environment } from '../../../../environments/environment';
import { PagoPresencialService } from './pago-presencial.service';

const API = environment.apiUrl.replace(/\/+$/, '');
const URL = `${API}/tenant/pagos/presencial`;

const PAGO = {
  pago_id: 7,
  venta_id: 25,
  metodo: 'EFECTIVO',
  estado_pago: 'APROBADO',
  monto: '100.00',
  fecha: '2026-11-10T10:05:00Z',
  estado_venta: 'COMPLETADA',
  reserva_id: null,
  estado_reserva: null,
};

describe('PagoPresencialService (SaaS, saasMode=true)', () => {
  let service: PagoPresencialService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: SAAS_MODE, useValue: true },
        PagoPresencialService,
      ],
    });
    service = TestBed.inject(PagoPresencialService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('registra el pago en POST /tenant/pagos/presencial con venta_id + metodo', () => {
    let resultado: any;
    service
      .registrarPresencial(25, 'EFECTIVO')
      .subscribe((pago) => (resultado = pago));

    const peticion = http.expectOne(URL);
    expect(peticion.request.method).toBe('POST');
    expect(peticion.request.body).toEqual({
      venta_id: 25,
      metodo: 'EFECTIVO',
    });
    // El monto/estado los decide el backend.
    expect('monto' in peticion.request.body).toBe(false);
    expect('estado_pago' in peticion.request.body).toBe(false);
    peticion.flush(PAGO);

    expect(resultado.estado_pago).toBe('APROBADO');
    expect(resultado.monto).toBe(100);
    expect(resultado.estado_venta).toBe('COMPLETADA');
  });
});
