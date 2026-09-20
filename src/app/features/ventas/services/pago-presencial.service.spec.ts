import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { environment } from '../../../../environments/environment';
import {
  METODOS_PAGO_PRESENCIAL,
  MetodoPagoPresencial,
  PagoPresencialResponse,
} from '../models/pago-presencial.model';
import { PagoPresencialService } from './pago-presencial.service';

const API = environment.apiUrl.replace(/\/+$/, '');
const URL = `${API}/pagos/presencial`;

const RESPUESTA_CRUDA = {
  pago_id: 7,
  venta_id: 321,
  metodo: 'EFECTIVO',
  estado_pago: 'APROBADO',
  monto: '599.80',
  fecha: '2026-09-19T10:00:00+00:00',
  estado_venta: 'COMPLETADA',
  reserva_id: null,
  estado_reserva: null,
};

describe('PagoPresencialService (CU21)', () => {
  let service: PagoPresencialService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(PagoPresencialService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
  });

  it('registrarPresencial hace POST /pagos/presencial con venta_id + metodo', () => {
    service.registrarPresencial(321, 'EFECTIVO').subscribe();

    const peticion = http.expectOne(URL);
    expect(peticion.request.method).toBe('POST');
    expect(peticion.request.body).toEqual({
      venta_id: 321,
      metodo: 'EFECTIVO',
    });
    peticion.flush(RESPUESTA_CRUDA);
  });

  it('el enum real tiene exactamente los 5 métodos permitidos', () => {
    expect(METODOS_PAGO_PRESENCIAL.map((m) => m.valor)).toEqual([
      'EFECTIVO',
      'TARJETA',
      'TRANSFERENCIA',
      'QR',
      'OTRO',
    ]);
  });

  it('envía cada método real sin transformarlo', () => {
    const metodos: MetodoPagoPresencial[] = [
      'EFECTIVO',
      'TARJETA',
      'TRANSFERENCIA',
      'QR',
      'OTRO',
    ];

    for (const metodo of metodos) {
      service.registrarPresencial(321, metodo).subscribe();
      const peticion = http.expectOne(URL);
      expect(peticion.request.body.metodo).toBe(metodo);
      peticion.flush(RESPUESTA_CRUDA);
    }
  });

  it('nunca envía campos server-owned', () => {
    service.registrarPresencial(321, 'QR').subscribe();

    const peticion = http.expectOne(URL);
    const cuerpo = peticion.request.body;
    for (const campo of [
      'monto',
      'estado',
      'empleado_id',
      'sucursal_id',
      'canal',
      'pasarela',
      'referencia_transaccion',
      'total',
    ]) {
      expect(campo in cuerpo).toBe(false);
    }
    peticion.flush(RESPUESTA_CRUDA);
  });

  it('normaliza el monto Decimal a number y conserva los estados reales', () => {
    let respuesta: PagoPresencialResponse | undefined;
    service
      .registrarPresencial(321, 'EFECTIVO')
      .subscribe((pago) => (respuesta = pago));

    http.expectOne(URL).flush(RESPUESTA_CRUDA);

    expect(respuesta?.monto).toBe(599.8);
    expect(respuesta?.pago_id).toBe(7);
    expect(respuesta?.estado_pago).toBe('APROBADO');
    expect(respuesta?.estado_venta).toBe('COMPLETADA');
    expect(respuesta?.reserva_id).toBeNull();
    expect(respuesta?.estado_reserva).toBeNull();
  });

  it('conserva reserva_id y estado_reserva cuando el backend los devuelve', () => {
    let respuesta: PagoPresencialResponse | undefined;
    service
      .registrarPresencial(321, 'TARJETA')
      .subscribe((pago) => (respuesta = pago));

    http.expectOne(URL).flush({
      ...RESPUESTA_CRUDA,
      reserva_id: 44,
      estado_reserva: 'ATENDIDA',
    });

    expect(respuesta?.reserva_id).toBe(44);
    expect(respuesta?.estado_reserva).toBe('ATENDIDA');
  });
});
