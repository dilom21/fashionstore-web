import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { SAAS_MODE } from '../../../core/config/app-mode';
import { environment } from '../../../../environments/environment';
import { VentaPresencialService } from './venta-presencial.service';

const API = environment.apiUrl.replace(/\/+$/, '');
const BASE = `${API}/tenant/ventas`;

const VENTA = {
  venta_id: 25,
  cliente_id: null,
  empleado_id: 9,
  sucursal_id: 2,
  sucursal_nombre: 'Centro',
  reserva_id: null,
  canal: 'PRESENCIAL',
  estado: 'PENDIENTE',
  fecha_hora: '2026-11-10T10:00:00Z',
  total: '100.00',
  items: [],
  cantidad_total_unidades: 2,
};

describe('VentaPresencialService (SaaS, saasMode=true)', () => {
  let service: VentaPresencialService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: SAAS_MODE, useValue: true },
        VentaPresencialService,
      ],
    });
    service = TestBed.inject(VentaPresencialService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('venta directa usa POST /tenant/ventas/presencial', () => {
    let resultado: any;
    service
      .registrarVentaDirecta([{ inventario_id: 1, cantidad: 2 }])
      .subscribe((venta) => (resultado = venta));

    const peticion = http.expectOne(`${BASE}/presencial`);
    expect(peticion.request.method).toBe('POST');
    expect(peticion.request.body).toEqual({
      reserva_id: null,
      items: [{ inventario_id: 1, cantidad: 2 }],
    });
    expect('cliente_id' in peticion.request.body).toBe(false);
    peticion.flush(VENTA);

    expect(resultado.total).toBe(100);
    expect(resultado.venta_id).toBe(25);
  });

  it('venta desde reserva usa el mismo endpoint con reserva_id', () => {
    service
      .registrarVentaDesdeReserva(10, [{ inventario_id: 1, cantidad: 2 }])
      .subscribe();

    const peticion = http.expectOne(`${BASE}/presencial`);
    expect(peticion.request.body).toEqual({
      reserva_id: 10,
      items: [{ inventario_id: 1, cantidad: 2 }],
    });
    expect('cliente_id' in peticion.request.body).toBe(false);
    peticion.flush({ ...VENTA, reserva_id: 10 });
  });

  it('obtenerVenta usa GET /tenant/ventas/{id}', () => {
    service.obtenerVenta(25).subscribe();
    const peticion = http.expectOne(`${BASE}/25`);
    expect(peticion.request.method).toBe('GET');
    peticion.flush(VENTA);
  });
});
