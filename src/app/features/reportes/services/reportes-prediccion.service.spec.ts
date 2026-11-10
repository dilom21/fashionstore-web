import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../../environments/environment';
import { ReportesService } from './reportes.service';

const URL = `${environment.apiUrl.replace(/\/+$/, '')}/tenant/reportes/predicciones`;

describe('ReportesService CU24', () => {
  let service: ReportesService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(ReportesService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('envía únicamente filtros permitidos, nunca empresa_id', () => {
    service.predecirDemanda({ producto_id: 8, sucursal_id: 3, horizonte_dias: 7 }).subscribe();
    const request = http.expectOne(URL);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ producto_id: 8, sucursal_id: 3, horizonte_dias: 7 });
    expect('empresa_id' in request.request.body).toBe(false);
    request.flush({});
  });

  it('conserva la procedencia sintética y la respuesta real del backend', () => {
    let respuesta: { valor_predicho: number; procedencia_entrenamiento: string } | undefined;
    service.predecirDemanda({ producto_id: 8, sucursal_id: null, horizonte_dias: 30 }).subscribe((value) => (respuesta = value));
    http.expectOne(URL).flush({ valor_predicho: 12.5, procedencia_entrenamiento: 'SINTETICO' });
    expect(respuesta).toEqual({ valor_predicho: 12.5, procedencia_entrenamiento: 'SINTETICO' });
  });

  it('propaga 422 sin fabricar un resultado', () => {
    let status = 0;
    service.predecirDemanda({ producto_id: 8, sucursal_id: null, horizonte_dias: 7 }).subscribe({ error: (error) => (status = error.status) });
    http.expectOne(URL).flush({ detail: { estado: 'SIN_DATOS' } }, { status: 422, statusText: 'Unprocessable Entity' });
    expect(status).toBe(422);
  });
});
