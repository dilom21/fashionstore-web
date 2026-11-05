import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { environment } from '../../../environments/environment';
import { SaasT05T06Service } from './saas-t05-t06.service';

describe('SaasT05T06Service', () => {
  let service: SaasT05T06Service;
  let http: HttpTestingController;
  const api = environment.apiUrl.replace(/\/+$/, '');

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(SaasT05T06Service);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('resolves the public catalog by encoded slug and never sends empresa_id', () => {
    service.publicCatalog('alpha-shop', 'shirt').subscribe();
    const request = http.expectOne((item) => item.url === `${api}/tenant/public/alpha-shop/catalogo`);
    expect(request.request.params.get('texto')).toBe('shirt');
    expect(request.request.params.has('empresa_id')).toBe(false);
    request.flush({ empresa: { id: 1, slug: 'alpha-shop', nombre_comercial: 'Alpha' }, items: [] });
  });

  it('uses tenant report endpoints without company identifiers', () => {
    service.reportSummary({ fecha_desde: '2026-01-01' }).subscribe();
    const summary = http.expectOne(`${api}/tenant/reportes/resumen?fecha_desde=2026-01-01`);
    expect(summary.request.params.has('empresa_id')).toBe(false);
    summary.flush({});

    service.generatedReport({ fecha_hasta: '2026-10-31' }).subscribe();
    const generated = http.expectOne(`${api}/tenant/reportes/generativo`);
    expect(generated.request.body).toEqual({ fecha_hasta: '2026-10-31' });
    generated.flush({});
  });

  it('sends dynamic report type and filters without PII or company identifiers', () => {
    service.dynamicReport({ tipo: 'ventas', fecha_desde: '2026-01-01' }).subscribe();
    const report = http.expectOne(`${api}/tenant/reportes/consulta`);
    expect(report.request.method).toBe('POST');
    expect(report.request.body).toEqual({ tipo: 'ventas', fecha_desde: '2026-01-01' });
    expect(JSON.stringify(report.request.body)).not.toContain('email');
    expect(JSON.stringify(report.request.body)).not.toContain('empresa_id');
    report.flush({ tipo: 'ventas', filas: [], serie: [] });

    service.exportReport('inventario', 'xlsx', { fecha_hasta: '2026-01-31' }).subscribe();
    const exportRequest = http.expectOne((item) => item.url === `${api}/tenant/reportes/exportar/inventario`);
    expect(exportRequest.request.params.get('formato')).toBe('xlsx');
    expect(exportRequest.request.params.get('fecha_hasta')).toBe('2026-01-31');
    expect(exportRequest.request.params.has('empresa_id')).toBe(false);
    exportRequest.flush(new Blob(['xlsx']));
  });

  it('targets the tenant fitting-room metadata endpoint only', () => {
    service.fittingConfigurations(7, 3).subscribe();
    const request = http.expectOne(`${api}/tenant/vestidor-virtual/productos/7/configuraciones?variante_id=3`);
    expect(request.request.method).toBe('GET');
    request.flush({ producto_id: 7, compatible: false, configuraciones: [] });
  });
});
