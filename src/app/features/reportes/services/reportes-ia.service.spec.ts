import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { environment } from '../../../../environments/environment';
import { ReportesService } from './reportes.service';

describe('ReportesService CU23-CU25', () => {
  let service: ReportesService;
  let http: HttpTestingController;
  const base = `${environment.apiUrl.replace(/\/+$/, '')}/tenant/reportes`;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(ReportesService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('envía solo la consulta generativa, sin SQL ni empresa', () => {
    service.generarReporteGenerativo('top 10 del mes').subscribe();
    const request = http.expectOne(`${base}/generativo`);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ consulta: 'top 10 del mes' });
    request.flush({});
  });

  it('respeta horizonte 7/30 del contrato de predicción', () => {
    service.predecirDemanda({ producto_id: 7, sucursal_id: null, horizonte_dias: 30 }).subscribe();
    const request = http.expectOne(`${base}/predicciones`);
    expect(request.request.body).toEqual({ producto_id: 7, sucursal_id: null, horizonte_dias: 30 });
    request.flush({});
  });

  it('envía filtros de clustering sin empresa_id', () => {
    service.analizarPatrones({ periodo_dias: 90, sucursal_id: 2, max_productos: 100 }).subscribe();
    const request = http.expectOne(`${base}/patrones`);
    expect(request.request.body).toEqual({ periodo_dias: 90, sucursal_id: 2, max_productos: 100 });
    expect(request.request.body.empresa_id).toBeUndefined();
    request.flush({});
  });
});
