import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { environment } from '../../../environments/environment';
import { SaasClienteService } from './saas-cliente.service';

const API = `${environment.apiUrl.replace(/\/+$/, '')}/tenant`;
const OPERACION = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

describe('SaasClienteService', () => {
  let service: SaasClienteService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(SaasClienteService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('consulta carritos, reservas e historial sin enviar empresa_id', () => {
    service.listarCarritos().subscribe();
    service.listarReservas().subscribe();
    service.listarHistorial().subscribe();

    expect(http.expectOne(`${API}/carritos`).request.method).toBe('GET');
    expect(http.expectOne(`${API}/cliente/reservas`).request.method).toBe('GET');
    expect(http.expectOne(`${API}/ventas/historial`).request.method).toBe('GET');
  });

  it('crea la venta con carga mínima y clave idempotente', () => {
    service.comprar(41, OPERACION).subscribe();
    const request = http.expectOne(`${API}/ventas/digital`).request;
    expect(request.method).toBe('POST');
    expect(request.body).toEqual({ carrito_id: 41, canal: 'WEB' });
    expect(request.headers.get('Idempotency-Key')).toBe(OPERACION);
    expect('empresa_id' in (request.body as Record<string, unknown>)).toBe(false);
  });

  it('crea la intención sin monto ni empresa enviados por el navegador', () => {
    service.crearIntencion(52, OPERACION).subscribe();
    const request = http.expectOne(`${API}/pagos/stripe/intencion`).request;
    expect(request.method).toBe('POST');
    expect(request.body).toEqual({ venta_id: 52 });
    expect(request.headers.get('Idempotency-Key')).toBe(OPERACION);
  });

  it('consulta estado y comprobante por rutas tenant exactas', () => {
    service.consultarPago(52).subscribe();
    service.obtenerComprobante(52).subscribe();
    expect(
      http.expectOne(`${API}/pagos/stripe/ventas/52/estado`).request.method,
    ).toBe('GET');
    expect(
      http.expectOne(`${API}/ventas/52/comprobante`).request.method,
    ).toBe('GET');
  });
});
