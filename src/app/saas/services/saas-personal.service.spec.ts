import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { environment } from '../../../environments/environment';
import {
  AltaPersonalRespuesta,
  AltaPersonalSolicitud,
  TenantUsuarioMembresia,
} from '../models/tenant.models';
import { SaasPersonalService } from './saas-personal.service';

const API = environment.apiUrl.replace(/\/+$/, '');
const URL_USUARIOS = `${API}/tenant/empresa/usuarios`;

const FILA: TenantUsuarioMembresia = {
  usuario_id: 42,
  correo: 'cajera@demo.com',
  usuario_activo: true,
  membresia_activa: true,
  rol_id: 3,
  rol: 'CAJERO',
  empleado_id: 9,
  sucursal_id: 2,
  nombres: 'Ana',
  apellidos: 'Quispe',
  empleado_activo: true,
};

const ALTA: AltaPersonalRespuesta = {
  empresa_id: 7,
  usuario_id: 43,
  empleado_id: 10,
  membresia_id: 21,
  sucursal_id: 2,
  correo: 'nueva@demo.com',
  rol: 'CAJERO',
  estado_membresia: true,
  expira_en: '2026-11-03T10:00:00Z',
  invitacion: {
    token: 'token-unico-abc',
    expira_en: '2026-11-03T10:00:00Z',
    uso: 'unico',
    aceptacion: 'POST /auth/tenant/invitaciones/aceptar',
  },
};

describe('SaasPersonalService', () => {
  let service: SaasPersonalService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(SaasPersonalService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
  });

  it('usa la URL exacta del recurso, sin barra final', () => {
    service.listar().subscribe();
    const peticion = http.expectOne(URL_USUARIOS);

    expect(peticion.request.method).toBe('GET');
    expect(peticion.request.url).toBe(`${API}/tenant/empresa/usuarios`);
    expect(peticion.request.url.endsWith('/')).toBe(false);
    peticion.flush([FILA]);
  });

  it('listar devuelve las membresías del backend', () => {
    let resultado: TenantUsuarioMembresia[] | undefined;
    service.listar().subscribe((valor) => (resultado = valor));

    http.expectOne(URL_USUARIOS).flush([FILA]);

    expect(resultado).toEqual([FILA]);
  });

  it('alta hace POST con el cuerpo exacto y sin password', () => {
    const dto: AltaPersonalSolicitud = {
      correo: 'nueva@demo.com',
      nombres: 'Ana',
      apellidos: 'Quispe',
      ci: '12345678',
      telefono: '70000000',
      sucursal_id: 2,
      rol_id: 3,
      expira_horas: 72,
    };

    let respuesta: AltaPersonalRespuesta | undefined;
    service.alta(dto).subscribe((valor) => (respuesta = valor));

    const peticion = http.expectOne(URL_USUARIOS);
    expect(peticion.request.method).toBe('POST');
    expect(peticion.request.body).toEqual({
      correo: 'nueva@demo.com',
      nombres: 'Ana',
      apellidos: 'Quispe',
      ci: '12345678',
      telefono: '70000000',
      sucursal_id: 2,
      rol_id: 3,
      expira_horas: 72,
    });

    const cuerpo = peticion.request.body as unknown as Record<string, unknown>;
    expect('password' in cuerpo).toBe(false);
    expect('password_confirmacion' in cuerpo).toBe(false);
    expect('empresa_id' in cuerpo).toBe(false);
    expect('usuario_id' in cuerpo).toBe(false);

    peticion.flush(ALTA);
    expect(respuesta?.invitacion.token).toBe('token-unico-abc');
  });

  it('alta omite el teléfono cuando no se envía', () => {
    service
      .alta({
        correo: 'nueva@demo.com',
        nombres: 'Ana',
        apellidos: 'Quispe',
        ci: '12345678',
        sucursal_id: 2,
        rol_id: 3,
      })
      .subscribe();

    const peticion = http.expectOne(URL_USUARIOS);
    const cuerpo = peticion.request.body as unknown as Record<string, unknown>;
    expect('telefono' in cuerpo).toBe(false);
    // `expira_horas` es opcional: el servicio no inventa un valor.
    expect('expira_horas' in cuerpo).toBe(false);
    peticion.flush(ALTA);
  });

  it('alta propaga el 409 de correo ya registrado', () => {
    let estado = 0;
    let detalle = '';

    service
      .alta({
        correo: 'nueva@demo.com',
        nombres: 'Ana',
        apellidos: 'Quispe',
        ci: '12345678',
        sucursal_id: 2,
        rol_id: 3,
      })
      .subscribe({
        error: (error: HttpErrorResponse) => {
          estado = error.status;
          detalle = (error.error as { detail?: string }).detail ?? '';
        },
      });

    http.expectOne(URL_USUARIOS).flush(
      { detail: 'No fue posible registrar el personal con los datos indicados' },
      { status: 409, statusText: 'Conflict' },
    );

    expect(estado).toBe(409);
    expect(detalle).toBe(
      'No fue posible registrar el personal con los datos indicados',
    );
  });

  it('alta propaga el 403 de PERSONAL/ADMINISTRAR', () => {
    let estado = 0;

    service
      .alta({
        correo: 'nueva@demo.com',
        nombres: 'Ana',
        apellidos: 'Quispe',
        ci: '12345678',
        sucursal_id: 2,
        rol_id: 3,
      })
      .subscribe({
        error: (error: HttpErrorResponse) => (estado = error.status),
      });

    http.expectOne(URL_USUARIOS).flush(
      { detail: 'Operacion no autorizada' },
      { status: 403, statusText: 'Forbidden' },
    );

    expect(estado).toBe(403);
  });

  it('cambiarEstado hace PATCH /{id}/estado con {estado}', () => {
    service.cambiarEstado(42, false).subscribe();

    const peticion = http.expectOne(`${URL_USUARIOS}/42/estado`);
    expect(peticion.request.method).toBe('PATCH');
    expect(peticion.request.body).toEqual({ estado: false });
    peticion.flush({ ...FILA, membresia_activa: false });
  });

  it('cambiarEstado propaga el 403 de la propia membresía', () => {
    let estado = 0;
    let detalle = '';

    service.cambiarEstado(42, false).subscribe({
      error: (error: HttpErrorResponse) => {
        estado = error.status;
        detalle = (error.error as { detail?: string }).detail ?? '';
      },
    });

    http
      .expectOne(`${URL_USUARIOS}/42/estado`)
      .flush(
        { detail: 'No puede desactivar su propia membresía' },
        { status: 403, statusText: 'Forbidden' },
      );

    expect(estado).toBe(403);
    expect(detalle).toBe('No puede desactivar su propia membresía');
  });

  it('cambiarRol hace PATCH /{id}/rol con {rol_id}', () => {
    service.cambiarRol(42, 4).subscribe();

    const peticion = http.expectOne(`${URL_USUARIOS}/42/rol`);
    expect(peticion.request.method).toBe('PATCH');
    expect(peticion.request.body).toEqual({ rol_id: 4 });
    peticion.flush({ ...FILA, rol_id: 4, rol: 'ENCARGADO_SUCURSAL' });
  });

  it('cambiarRol propaga el 422 de rol no asignable', () => {
    let estado = 0;

    service.cambiarRol(42, 4).subscribe({
      error: (error: HttpErrorResponse) => (estado = error.status),
    });

    http
      .expectOne(`${URL_USUARIOS}/42/rol`)
      .flush(
        { detail: 'Rol no asignable al personal de esta empresa' },
        { status: 422, statusText: 'Unprocessable Entity' },
      );

    expect(estado).toBe(422);
  });

  it('cambiarSucursal hace PATCH /{id}/sucursal con {sucursal_id}', () => {
    let sucursal = 0;

    service.cambiarSucursal(42, 5).subscribe((respuesta) => {
      sucursal = respuesta.sucursal_id;
    });

    const peticion = http.expectOne(`${URL_USUARIOS}/42/sucursal`);
    expect(peticion.request.method).toBe('PATCH');
    expect(peticion.request.body).toEqual({ sucursal_id: 5 });
    peticion.flush({
      usuario_id: 42,
      empleado_id: 9,
      sucursal_id: 5,
      membresia_activa: true,
    });

    expect(sucursal).toBe(5);
  });

  it('cambiarSucursal propaga el 409 de usuario sin empleado activo', () => {
    let estado = 0;

    service.cambiarSucursal(42, 5).subscribe({
      error: (error: HttpErrorResponse) => (estado = error.status),
    });

    http
      .expectOne(`${URL_USUARIOS}/42/sucursal`)
      .flush(
        { detail: 'Usuario sin empleado activo en esta empresa' },
        { status: 409, statusText: 'Conflict' },
      );

    expect(estado).toBe(409);
  });
});
