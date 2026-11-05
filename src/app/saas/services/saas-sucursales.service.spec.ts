import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { environment } from '../../../environments/environment';
import { TenantSucursal, TenantSucursalCrear } from '../models/tenant.models';
import { SaasSucursalesService } from './saas-sucursales.service';

const API = environment.apiUrl.replace(/\/+$/, '');
const URL_SUCURSALES = `${API}/tenant/empresa/sucursales`;

const SUCURSAL: TenantSucursal = {
  id: 5,
  ciudad_id: 3,
  nombre: 'Sucursal Centro',
  direccion: 'Av. Arce 123',
  telefono: '70000000',
  estado: true,
};

describe('SaasSucursalesService', () => {
  let service: SaasSucursalesService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(SaasSucursalesService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
  });

  it('usa la URL exacta del recurso, sin barra final', () => {
    service.listar().subscribe();
    const peticion = http.expectOne(URL_SUCURSALES);

    expect(peticion.request.method).toBe('GET');
    expect(peticion.request.url).toBe(`${API}/tenant/empresa/sucursales`);
    expect(peticion.request.url.endsWith('/')).toBe(false);
    peticion.flush([SUCURSAL]);
  });

  it('listar devuelve las sucursales del backend', () => {
    let resultado: TenantSucursal[] | undefined;
    service.listar().subscribe((valor) => (resultado = valor));

    http.expectOne(URL_SUCURSALES).flush([SUCURSAL]);

    expect(resultado).toEqual([SUCURSAL]);
  });

  it('crear hace POST con el cuerpo exacto del contrato', () => {
    const dto: TenantSucursalCrear = {
      ciudad_id: 3,
      nombre: 'Sucursal Centro',
      direccion: 'Av. Arce 123',
      telefono: '70000000',
    };
    let creada: TenantSucursal | undefined;
    service.crear(dto).subscribe((valor) => (creada = valor));

    const peticion = http.expectOne(URL_SUCURSALES);
    expect(peticion.request.method).toBe('POST');
    expect(peticion.request.body).toEqual({
      ciudad_id: 3,
      nombre: 'Sucursal Centro',
      direccion: 'Av. Arce 123',
      telefono: '70000000',
    });
    peticion.flush(SUCURSAL);

    expect(creada).toEqual(SUCURSAL);
  });

  it('crear omite el teléfono cuando no se envía', () => {
    service
      .crear({
        ciudad_id: 3,
        nombre: 'Sin teléfono',
        direccion: 'Calle 9',
      })
      .subscribe();

    const peticion = http.expectOne(URL_SUCURSALES);
    const cuerpo = peticion.request.body as unknown as Record<string, unknown>;
    expect(Object.keys(cuerpo).sort()).toEqual([
      'ciudad_id',
      'direccion',
      'nombre',
    ]);
    expect('telefono' in cuerpo).toBe(false);
    peticion.flush({ ...SUCURSAL, telefono: null });
  });

  it('crear no envía campos ajenos al contrato (extra=forbid)', () => {
    service
      .crear({ ciudad_id: 3, nombre: 'X', direccion: 'Y' })
      .subscribe();

    const peticion = http.expectOne(URL_SUCURSALES);
    const cuerpo = peticion.request.body as unknown as Record<string, unknown>;
    expect(cuerpo['empresa_id']).toBeUndefined();
    expect(cuerpo['estado']).toBeUndefined();
    peticion.flush(SUCURSAL);
  });

  it('propaga el 409 de límite de sucursales sin transformarlo', () => {
    let estado = 0;
    let detalle = '';

    service
      .crear({ ciudad_id: 3, nombre: 'X', direccion: 'Y' })
      .subscribe({
        error: (error: HttpErrorResponse) => {
          estado = error.status;
          detalle = (error.error as { detail?: string }).detail ?? '';
        },
      });

    http.expectOne(URL_SUCURSALES).flush(
      { detail: 'Limite de sucursales activas alcanzado para el plan' },
      { status: 409, statusText: 'Conflict' },
    );

    expect(estado).toBe(409);
    expect(detalle).toBe('Limite de sucursales activas alcanzado para el plan');
  });

  it('propaga el 403 de un rol que no es ADMINISTRADOR', () => {
    let estado = 0;

    service.crear({ ciudad_id: 3, nombre: 'X', direccion: 'Y' }).subscribe({
      error: (error: HttpErrorResponse) => (estado = error.status),
    });

    http.expectOne(URL_SUCURSALES).flush(
      { detail: 'Operacion no autorizada' },
      { status: 403, statusText: 'Forbidden' },
    );

    expect(estado).toBe(403);
  });

  it('listar propaga el 403 de SUCURSALES/CONSULTAR', () => {
    let estado = 0;

    service.listar().subscribe({
      error: (error: HttpErrorResponse) => (estado = error.status),
    });

    http.expectOne(URL_SUCURSALES).flush(
      { detail: 'Operacion no autorizada' },
      { status: 403, statusText: 'Forbidden' },
    );

    expect(estado).toBe(403);
  });

  it('cambiarEstado hace PATCH /{id}/estado con {estado}', () => {
    let actualizada: TenantSucursal | undefined;
    service
      .cambiarEstado(5, false)
      .subscribe((valor) => (actualizada = valor));

    const peticion = http.expectOne(`${URL_SUCURSALES}/5/estado`);
    expect(peticion.request.method).toBe('PATCH');
    expect(peticion.request.body).toEqual({ estado: false });
    peticion.flush({ ...SUCURSAL, estado: false });

    expect(actualizada?.estado).toBe(false);
  });

  it('cambiarEstado propaga el 409 de sucursal con empleados activos', () => {
    let estado = 0;
    let detalle = '';

    service.cambiarEstado(5, false).subscribe({
      error: (error: HttpErrorResponse) => {
        estado = error.status;
        detalle = (error.error as { detail?: string }).detail ?? '';
      },
    });

    http
      .expectOne(`${URL_SUCURSALES}/5/estado`)
      .flush(
        { detail: 'Sucursal con empleados o reservas activas' },
        { status: 409, statusText: 'Conflict' },
      );

    expect(estado).toBe(409);
    expect(detalle).toBe('Sucursal con empleados o reservas activas');
  });
});
