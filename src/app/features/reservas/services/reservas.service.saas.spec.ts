import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { environment } from '../../../../environments/environment';
import { SAAS_MODE } from '../../../core/config/app-mode';
import { ReservasService } from './reservas.service';

const API = environment.apiUrl.replace(/\/+$/, '');
const BASE = `${API}/tenant/reservas`;

function esperadoAware(fecha: string, hora: string): string {
  const [anio, mes, dia] = fecha.split('-').map(Number);
  const [hh, mm] = hora.split(':').map(Number);
  return new Date(anio, mes - 1, dia, hh, mm, 0, 0).toISOString();
}

describe('ReservasService (SaaS, saasMode=true)', () => {
  let service: ReservasService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: SAAS_MODE, useValue: true },
        ReservasService,
      ],
    });
    service = TestBed.inject(ReservasService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('prevalidar usa /tenant/reservas/prevalidar con fecha AWARE (no crea)', () => {
    let prevalidacion: any;
    service
      .prevalidarReserva({
        carrito_id: 10,
        fecha: '2026-11-10',
        hora: '10:00',
        observacion: null,
      })
      .subscribe((r) => (prevalidacion = r));

    const peticion = http.expectOne(`${BASE}/prevalidar`);
    expect(peticion.request.method).toBe('POST');
    expect(peticion.request.body).toEqual({
      carrito_id: 10,
      fecha_atencion: esperadoAware('2026-11-10', '10:00'),
      observacion: null,
    });
    expect('cliente_id' in peticion.request.body).toBe(false);
    expect('empresa_id' in peticion.request.body).toBe(false);

    peticion.flush({
      carrito_id: 10,
      sucursal_id: 1,
      fecha_atencion: esperadoAware('2026-11-10', '10:00'),
      cantidad_lineas: 2,
      cantidad_unidades: 3,
      stock_verificado_preliminarmente: true,
      reserva_creada: false,
      requiere_verificacion_transaccional: true,
    });

    expect(prevalidacion.reserva_creada).toBe(false);
    expect(prevalidacion.stock_verificado_preliminarmente).toBe(true);
    expect(prevalidacion.requiere_verificacion_transaccional).toBe(true);
  });

  it('crearReserva usa POST /tenant/reservas y devuelve el id real', () => {
    let creada: any;
    service
      .crearReserva({
        carrito_id: 10,
        fecha: '2026-11-10',
        hora: '10:00',
        observacion: 'nota',
      })
      .subscribe((r) => (creada = r));

    const peticion = http.expectOne(BASE);
    expect(peticion.request.method).toBe('POST');
    expect(peticion.request.body).toEqual({
      carrito_id: 10,
      fecha_atencion: esperadoAware('2026-11-10', '10:00'),
      observacion: 'nota',
    });
    peticion.flush({ reserva_id: 77, carrito_id: 10, estado: 'PENDIENTE' });

    expect(creada).toEqual({
      reserva_id: 77,
      carrito_id: 10,
      estado: 'PENDIENTE',
    });
  });

  it('listarReservas usa paginación SaaS y normaliza {items,total,limit,offset}', () => {
    let lista: any;
    service
      .listarReservas('PENDIENTE', 20, 40)
      .subscribe((r) => (lista = r));

    const peticion = http.expectOne(
      (req) =>
        req.url === BASE &&
        req.params.get('estado') === 'PENDIENTE' &&
        req.params.get('limit') === '20' &&
        req.params.get('offset') === '40',
    );
    expect(peticion.request.method).toBe('GET');
    peticion.flush({
      items: [
        {
          reserva_id: 77,
          carrito_id: 10,
          sucursal_id: 1,
          sucursal_nombre: 'Centro',
          fecha_reserva: 'x',
          fecha_atencion: 'y',
          estado: 'PENDIENTE',
          observacion: null,
          cantidad_lineas: 2,
          cantidad_unidades: 3,
        },
      ],
      total: 41,
      limit: 20,
      offset: 40,
    });

    expect(lista.total).toBe(41);
    expect(lista.items[0].reserva_id).toBe(77);
    expect('cliente_id' in lista.items[0]).toBe(false);
  });

  it('obtenerReserva normaliza imagen_principal_url y cantidad_unidades', () => {
    let detalle: any;
    service.obtenerReserva(77).subscribe((d) => (detalle = d));

    const peticion = http.expectOne(`${BASE}/77`);
    expect(peticion.request.method).toBe('GET');
    peticion.flush({
      reserva_id: 77,
      carrito_id: 10,
      sucursal_id: 1,
      sucursal_nombre: 'Centro',
      fecha_reserva: 'x',
      fecha_atencion: 'y',
      estado: 'PENDIENTE',
      observacion: null,
      cantidad_lineas: 1,
      cantidad_unidades: 3,
      items: [
        {
          detalle_id: 1,
          inventario_id: 9,
          producto_id: 8,
          producto_nombre: 'Camisa',
          imagen_principal_url: 'https://cdn/x.jpg',
          variante_producto_id: 3,
          sku: 'OXF-M',
          talla_id: 2,
          talla_nombre: 'M',
          color_id: 1,
          color_nombre: 'Negro',
          temporada_id: 1,
          temporada_nombre: 'PV26',
          cantidad: 3,
        },
      ],
    });

    expect(detalle.cantidad_unidades).toBe(3);
    expect(detalle.items[0].imagen_principal_url).toBe('https://cdn/x.jpg');
  });

  it('cancelarReserva usa PATCH /tenant/reservas/{id}/cancelar', () => {
    let resultado: any;
    service.cancelarReserva(77, null).subscribe((r) => (resultado = r));

    const peticion = http.expectOne(`${BASE}/77/cancelar`);
    expect(peticion.request.method).toBe('PATCH');
    expect(peticion.request.body).toEqual({ observacion: null });
    peticion.flush({ reserva_id: 77, estado: 'CANCELADA' });

    expect(resultado).toEqual({ reserva_id: 77, estado: 'CANCELADA' });
  });
});
