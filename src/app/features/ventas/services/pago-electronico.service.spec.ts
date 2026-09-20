import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { environment } from '../../../../environments/environment';
import { PagoElectronicoService } from './pago-electronico.service';

const API = environment.apiUrl.replace(/\/+$/, '');

const INTENCION_CRUDA = {
  venta_id: 123,
  pago_id: 55,
  payment_intent_id: 'pi_3TestABC',
  client_secret: 'pi_3TestABC_secret_xyz',
  monto: '299.80',
  moneda: 'bob',
  estado_pago: 'PENDIENTE',
};

describe('PagoElectronicoService (CU22)', () => {
  let service: PagoElectronicoService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(PagoElectronicoService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
  });

  it('crearIntencion hace POST /pagos/stripe/intencion con SOLO venta_id', () => {
    service.crearIntencion(123).subscribe();

    const peticion = http.expectOne(`${API}/pagos/stripe/intencion`);
    expect(peticion.request.method).toBe('POST');
    expect(peticion.request.body).toEqual({ venta_id: 123 });
    // El frontend nunca envía monto, moneda, cliente ni estado.
    expect('amount' in peticion.request.body).toBe(false);
    expect('currency' in peticion.request.body).toBe(false);
    expect('cliente_id' in peticion.request.body).toBe(false);
    expect('estado' in peticion.request.body).toBe(false);
    peticion.flush(INTENCION_CRUDA);
  });

  it('normaliza monto Decimal (string) a number y conserva el contrato', () => {
    let respuesta: any;
    service.crearIntencion(123).subscribe((r) => (respuesta = r));

    http.expectOne(`${API}/pagos/stripe/intencion`).flush(INTENCION_CRUDA);

    expect(respuesta.monto).toBe(299.8);
    expect(respuesta.venta_id).toBe(123);
    expect(respuesta.pago_id).toBe(55);
    expect(respuesta.payment_intent_id).toBe('pi_3TestABC');
    expect(respuesta.client_secret).toBe('pi_3TestABC_secret_xyz');
    expect(respuesta.moneda).toBe('bob');
    expect(respuesta.estado_pago).toBe('PENDIENTE');
  });

  it('crearIntencion conserva client_secret null', () => {
    let respuesta: any;
    service.crearIntencion(123).subscribe((r) => (respuesta = r));

    http
      .expectOne(`${API}/pagos/stripe/intencion`)
      .flush({ ...INTENCION_CRUDA, client_secret: null });

    expect(respuesta.client_secret).toBeNull();
  });

  it('consultarEstado hace GET /pagos/stripe/ventas/{id}/estado', () => {
    let respuesta: any;
    service.consultarEstado(123).subscribe((r) => (respuesta = r));

    const peticion = http.expectOne(
      `${API}/pagos/stripe/ventas/123/estado`,
    );
    expect(peticion.request.method).toBe('GET');
    peticion.flush({
      venta_id: 123,
      estado_venta: 'PENDIENTE',
      pago_id: 55,
      estado_pago: 'PENDIENTE',
      payment_intent_id: 'pi_3TestABC',
    });

    expect(respuesta.estado_venta).toBe('PENDIENTE');
    expect(respuesta.estado_pago).toBe('PENDIENTE');
    expect(respuesta.pago_id).toBe(55);
  });

  it('consultarEstado conserva nulos cuando no hay pago', () => {
    let respuesta: any;
    service.consultarEstado(9).subscribe((r) => (respuesta = r));

    http.expectOne(`${API}/pagos/stripe/ventas/9/estado`).flush({
      venta_id: 9,
      estado_venta: 'PENDIENTE',
      pago_id: null,
      estado_pago: null,
      payment_intent_id: null,
    });

    expect(respuesta.pago_id).toBeNull();
    expect(respuesta.estado_pago).toBeNull();
  });
});
