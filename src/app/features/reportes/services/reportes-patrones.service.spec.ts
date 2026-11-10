import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { ReportesService } from './reportes.service';
import { environment } from '../../../../environments/environment';

describe('ReportesService CU25', () => {
  let service: ReportesService;
  let http: HttpTestingController;
  const url = `${environment.apiUrl.replace(/\/+$/, '')}/tenant/reportes/patrones`;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [ReportesService, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(ReportesService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('envía únicamente filtros permitidos al endpoint tenant', () => {
    service.analizarPatrones({ periodo_dias: 90, sucursal_id: 4, max_productos: 100 }).subscribe();
    const request = http.expectOne(url);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ periodo_dias: 90, sucursal_id: 4, max_productos: 100 });
    request.flush({});
  });
});
