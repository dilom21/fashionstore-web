import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { environment } from '../../../environments/environment';
import {
  AccionReservaRespuesta,
  ReservaComercial,
  ReservaCreadaTenant,
} from '../models/tenant.models';
import { SaasReservasService } from './saas-reservas.service';

const API = environment.apiUrl.replace(/\/+$/, '');
const URL_LISTADO = `${API}/tenant/comercial/reservas`;
const URL_ACCIONES = `${API}/tenant/reservas`;

const RESERVA: ReservaComercial = { id: 12, estado: 'PENDIENTE' };

const RESPUESTA_CANCELADA: AccionReservaRespuesta = {
  reserva_id: 12,
  estado: 'CANCELADA',
};

const RESPUESTA_ATENDIDA: AccionReservaRespuesta = {
  reserva_id: 12,
  estado: 'ATENDIDA',
};

describe('SaasReservasService', () => {
  let service: SaasReservasService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(SaasReservasService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
  });

  function esperar(url: string) {
    return http.expectOne((peticion) => peticion.url === url);
  }

  // ================================ Listado ===============================

  it('listar hace GET con limit y offset exactos', () => {
    let resultado: ReservaComercial[] | undefined;
    service.listar(50, 100).subscribe((valor) => (resultado = valor));

    const peticion = esperar(URL_LISTADO);
    expect(peticion.request.method).toBe('GET');
    expect(peticion.request.params.get('limit')).toBe('50');
    expect(peticion.request.params.get('offset')).toBe('100');
    expect(peticion.request.params.keys().sort()).toEqual([
      'limit',
      'offset',
    ]);
    peticion.flush([RESERVA]);

    expect(resultado).toEqual([RESERVA]);
  });

  it('listar sin argumentos no agrega query params', () => {
    service.listar().subscribe();
    const peticion = esperar(URL_LISTADO);

    expect(peticion.request.urlWithParams).toBe(URL_LISTADO);
    peticion.flush([]);
  });

  it('obtener usa GET y la URL exacta del detalle comercial', () => {
    let resultado: ReservaComercial | undefined;
    service.obtener(12).subscribe((valor) => (resultado = valor));

    const peticion = esperar(`${URL_LISTADO}/12`);
    expect(peticion.request.method).toBe('GET');
    peticion.flush(RESERVA);

    expect(resultado).toEqual(RESERVA);
  });

  // =============================== Acciones ===============================

  it('crear hace POST /tenant/reservas con el cuerpo exacto del contrato', () => {
    let resultado: ReservaCreadaTenant | undefined;
    service
      .crear({
        carrito_id: 77,
        fecha_atencion: '2026-11-01T15:00:00.000Z',
        observacion: 'Pasar por la tarde',
      })
      .subscribe((valor) => (resultado = valor));

    const peticion = esperar(URL_ACCIONES);
    expect(peticion.request.method).toBe('POST');
    expect(peticion.request.url.endsWith('/')).toBe(false);
    expect(peticion.request.body).toEqual({
      carrito_id: 77,
      fecha_atencion: '2026-11-01T15:00:00.000Z',
      observacion: 'Pasar por la tarde',
    });
    expect(
      Object.keys(peticion.request.body as Record<string, unknown>).sort(),
    ).toEqual(['carrito_id', 'fecha_atencion', 'observacion']);

    peticion.flush(
      { reserva_id: 91, carrito_id: 77, estado: 'PENDIENTE' },
      { status: 201, statusText: 'Created' },
    );

    expect(resultado).toEqual({
      reserva_id: 91,
      carrito_id: 77,
      estado: 'PENDIENTE',
    });
  });

  it('crear omite la observación cuando no se indica', () => {
    service
      .crear({
        carrito_id: 77,
        fecha_atencion: '2026-11-01T15:00:00.000Z',
      })
      .subscribe();

    const peticion = esperar(URL_ACCIONES);
    expect(Object.keys(peticion.request.body as object).sort()).toEqual([
      'carrito_id',
      'fecha_atencion',
    ]);
    peticion.flush(
      { reserva_id: 91, carrito_id: 77, estado: 'PENDIENTE' },
      { status: 201, statusText: 'Created' },
    );
  });

  it('cancelar hace PATCH con la observación exacta', () => {
    let resultado: AccionReservaRespuesta | undefined;
    service
      .cancelar(12, 'Cliente no se presentó')
      .subscribe((valor) => (resultado = valor));

    const peticion = esperar(`${URL_ACCIONES}/12/cancelar`);
    expect(peticion.request.method).toBe('PATCH');
    expect(peticion.request.url.endsWith('/')).toBe(false);
    expect(peticion.request.body).toEqual({
      observacion: 'Cliente no se presentó',
    });
    peticion.flush(RESPUESTA_CANCELADA);

    expect(resultado).toEqual(RESPUESTA_CANCELADA);
  });

  it('cancelar sin observación envía un cuerpo JSON vacío (nunca sin body)', () => {
    service.cancelar(12).subscribe();

    const peticion = esperar(`${URL_ACCIONES}/12/cancelar`);
    expect(peticion.request.method).toBe('PATCH');
    expect(peticion.request.body).toEqual({});
    expect(peticion.request.body).not.toBeNull();
    expect(Object.keys(peticion.request.body as object)).toEqual([]);
    peticion.flush(RESPUESTA_CANCELADA);
  });

  it('cancelar omite una observación compuesta solo por espacios', () => {
    service.cancelar(12, '   ').subscribe();

    const peticion = esperar(`${URL_ACCIONES}/12/cancelar`);
    expect(peticion.request.body).toEqual({});
    peticion.flush(RESPUESTA_CANCELADA);
  });

  it('finalizarSinCompra hace PATCH con el cuerpo exacto', () => {
    let resultado: AccionReservaRespuesta | undefined;
    service
      .finalizarSinCompra(12, 'No compró')
      .subscribe((valor) => (resultado = valor));

    const peticion = esperar(`${URL_ACCIONES}/12/finalizar-sin-compra`);
    expect(peticion.request.method).toBe('PATCH');
    expect(peticion.request.body).toEqual({ observacion: 'No compró' });
    peticion.flush(RESPUESTA_ATENDIDA);

    expect(resultado).toEqual(RESPUESTA_ATENDIDA);
  });

  it('finalizarSinCompra sin observación envía {}', () => {
    service.finalizarSinCompra(12).subscribe();

    const peticion = esperar(`${URL_ACCIONES}/12/finalizar-sin-compra`);
    expect(peticion.request.body).toEqual({});
    peticion.flush(RESPUESTA_ATENDIDA);
  });

  // ================================ Errores ===============================

  it('propaga el 403 del listado cuando el rol no es ADMINISTRADOR', () => {
    let estado = 0;

    service.listar(50, 0).subscribe({
      error: (error: HttpErrorResponse) => (estado = error.status),
    });

    esperar(URL_LISTADO).flush(
      { detail: 'Operacion no autorizada' },
      { status: 403, statusText: 'Forbidden' },
    );

    expect(estado).toBe(403);
  });

  it('propaga el 404 de una reserva ajena', () => {
    let estado = 0;

    service.obtener(99).subscribe({
      error: (error: HttpErrorResponse) => (estado = error.status),
    });

    esperar(`${URL_LISTADO}/99`).flush(
      { detail: 'Recurso no encontrado' },
      { status: 404, statusText: 'Not Found' },
    );

    expect(estado).toBe(404);
  });

  it('propaga el 409 de una transición inválida', () => {
    let estado = 0;

    service.cancelar(12).subscribe({
      error: (error: HttpErrorResponse) => (estado = error.status),
    });

    esperar(`${URL_ACCIONES}/12/cancelar`).flush(
      { detail: 'Estado de reserva inconsistente' },
      { status: 409, statusText: 'Conflict' },
    );

    expect(estado).toBe(409);
  });

  it('propaga el 503 con el módulo de reservas apagado', () => {
    let estado = 0;
    let detalle = '';

    service.finalizarSinCompra(12).subscribe({
      error: (error: HttpErrorResponse) => {
        estado = error.status;
        detalle = (error.error as { detail?: string }).detail ?? '';
      },
    });

    esperar(`${URL_ACCIONES}/12/finalizar-sin-compra`).flush(
      { detail: 'Reservas SaaS aun no habilitadas' },
      { status: 503, statusText: 'Service Unavailable' },
    );

    expect(estado).toBe(503);
    expect(detalle).toBe('Reservas SaaS aun no habilitadas');
  });
});
