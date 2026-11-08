import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { environment } from '../../../../../environments/environment';
import { TenantMerchandisingService } from './tenant-merchandising.service';

describe('TenantMerchandisingService CU09', () => {
  let service: TenantMerchandisingService;
  let http: HttpTestingController;
  const base = `${environment.apiUrl.replace(/\/+$/, '')}/tenant/merchandising`;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(TenantMerchandisingService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('usa GET tenant, filtros soportados y nunca empresa_id', () => {
    service.listarPromociones({ buscar: 'verano', estado: true, tipo_descuento: 'PORCENTAJE', vigentes: true, limit: 20, offset: 40 }).subscribe();
    const request = http.expectOne(`${base}/promociones?buscar=verano&estado=true&tipo_descuento=PORCENTAJE&vigentes=true&limit=20&offset=40`);
    expect(request.request.method).toBe('GET');
    expect(request.request.urlWithParams).not.toContain('empresa_id');
    request.flush([]);
  });

  it('consulta el precio promocional por producto y conserva solapamiento no definitivo', () => {
    service.precioPromocional(7).subscribe((result) => expect(result.precio_definitivo).toBe(false));
    const request = http.expectOne(`${base}/productos/7/precio-promocional`);
    expect(request.request.method).toBe('GET');
    request.flush({ producto_id: 7, precio_base: '100', promociones_vigentes: [], precio_promocional: null, precio_definitivo: false });
  });
});
