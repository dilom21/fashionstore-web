import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { environment } from '../../../../environments/environment';
import { AtencionReservasService } from './atencion-reservas.service';

const API = environment.apiUrl.replace(/\/+$/, '');
const BASE = `${API}/atencion-reservas`;

describe('AtencionReservasService (CU18)', () => {
  let service: AtencionReservasService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(AtencionReservasService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
  });

  it('listarReservas sin filtros consulta /atencion-reservas sin parámetros', () => {
    service.listarReservas().subscribe();
    const peticion = http.expectOne(BASE);
    expect(peticion.request.method).toBe('GET');
    expect(peticion.request.params.keys().length).toBe(0);
    peticion.flush({ items: [], total: 0, limit: 20, offset: 0 });
  });

  it('listarReservas no envía sucursal_id si no se indica (encargado/cajero)', () => {
    service
      .listarReservas({
        buscar: '  ana  ',
        fecha_desde: '2026-09-01',
        fecha_hasta: '2026-09-30',
        limit: 20,
        offset: 40,
      })
      .subscribe();

    const peticion = http.expectOne((req) => req.url === BASE);
    const params = peticion.request.params;
    expect(params.get('buscar')).toBe('ana');
    expect(params.get('fecha_desde')).toBe('2026-09-01');
    expect(params.get('fecha_hasta')).toBe('2026-09-30');
    expect(params.get('limit')).toBe('20');
    expect(params.get('offset')).toBe('40');
    // La sucursal la deduce el backend del empleado autenticado.
    expect(params.has('sucursal_id')).toBe(false);
    peticion.flush({ items: [], total: 0, limit: 20, offset: 40 });
  });

  it('listarReservas envía sucursal_id cuando el ADMINISTRADOR la elige', () => {
    service.listarReservas({ sucursal_id: 3 }).subscribe();
    const peticion = http.expectOne((req) => req.url === BASE);
    expect(peticion.request.params.get('sucursal_id')).toBe('3');
    peticion.flush({ items: [], total: 0, limit: 20, offset: 0 });
  });

  it('listarReservas no envía filtros vacíos', () => {
    service.listarReservas({ buscar: '   ' }).subscribe();
    const peticion = http.expectOne(BASE);
    expect(peticion.request.params.keys().length).toBe(0);
    peticion.flush({ items: [], total: 0, limit: 20, offset: 0 });
  });

  it('obtenerReserva consulta GET /atencion-reservas/{id}', () => {
    service.obtenerReserva(15).subscribe();
    const peticion = http.expectOne(`${BASE}/15`);
    expect(peticion.request.method).toBe('GET');
    peticion.flush({});
  });

  it('prepararVenta hace POST con inventario_id y cantidad_compra', () => {
    service
      .prepararVenta(15, {
        items: [
          { inventario_id: 17, cantidad_compra: 2 },
          { inventario_id: 318, cantidad_compra: 1 },
        ],
      })
      .subscribe();

    const peticion = http.expectOne(`${BASE}/15/preparar-venta`);
    expect(peticion.request.method).toBe('POST');
    expect(peticion.request.body).toEqual({
      items: [
        { inventario_id: 17, cantidad_compra: 2 },
        { inventario_id: 318, cantidad_compra: 1 },
      ],
    });
    peticion.flush({
      reserva_id: 15,
      sucursal_id: 2,
      estado: 'CONFIRMADA',
      items: [],
      total_unidades_reservadas: 3,
      total_unidades_compra: 3,
      total_unidades_no_compra: 0,
      venta_registrada: false,
      reserva_modificada: false,
    });
  });

  it('finalizarSinCompra hace POST con la observación (o null)', () => {
    service.finalizarSinCompra(15, 'Cliente no encontró talla').subscribe();
    const peticion = http.expectOne(`${BASE}/15/finalizar-sin-compra`);
    expect(peticion.request.method).toBe('POST');
    expect(peticion.request.body).toEqual({
      observacion: 'Cliente no encontró talla',
    });
    peticion.flush({});

    service.finalizarSinCompra(16).subscribe();
    const sinTexto = http.expectOne(`${BASE}/16/finalizar-sin-compra`);
    expect(sinTexto.request.body).toEqual({ observacion: null });
    sinTexto.flush({});
  });

  it('esAtendible solo admite CONFIRMADA', () => {
    expect(service.esAtendible('CONFIRMADA')).toBe(true);
    expect(service.esAtendible('confirmada')).toBe(true);
    expect(service.esAtendible('PENDIENTE')).toBe(false);
    expect(service.esAtendible('ATENDIDA')).toBe(false);
    expect(service.esAtendible('CANCELADA')).toBe(false);
    expect(service.esAtendible('VENCIDA')).toBe(false);
  });
});
