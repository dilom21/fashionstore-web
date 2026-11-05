import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { environment } from '../../../environments/environment';
import {
  MatrizPermisos,
  PermisoCambio,
  TenantRol,
} from '../models/tenant.models';
import { SaasRolesService } from './saas-roles.service';

const API = environment.apiUrl.replace(/\/+$/, '');
const URL_ROLES = `${API}/tenant/empresa/roles`;
const URL_PERMISOS = `${API}/tenant/empresa/permisos`;

const ROL: TenantRol = { id: 3, nombre: 'CAJERO', estado: true };

const MATRIZ: MatrizPermisos = {
  empresa_id: 7,
  catalogo: [
    { funcion: 'PERSONAL', accion: 'CONSULTAR' },
    { funcion: 'VENTAS', accion: 'REGISTRAR' },
  ],
  roles: [
    {
      rol_id: 3,
      rol: 'CAJERO',
      permisos: [
        {
          funcion: 'VENTAS',
          accion: 'REGISTRAR',
          permitido: true,
          origen: 'DEFAULT',
        },
      ],
    },
  ],
};

describe('SaasRolesService', () => {
  let service: SaasRolesService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(SaasRolesService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
  });

  it('listarRoles hace GET /tenant/empresa/roles sin barra final', () => {
    let roles: TenantRol[] | undefined;
    service.listarRoles().subscribe((valor) => (roles = valor));

    const peticion = http.expectOne(URL_ROLES);
    expect(peticion.request.method).toBe('GET');
    expect(peticion.request.url).toBe(`${API}/tenant/empresa/roles`);
    expect(peticion.request.url.endsWith('/')).toBe(false);
    peticion.flush([ROL]);

    expect(roles).toEqual([ROL]);
  });

  it('obtenerMatriz hace GET /tenant/empresa/permisos', () => {
    let matriz: MatrizPermisos | undefined;
    service.obtenerMatriz().subscribe((valor) => (matriz = valor));

    const peticion = http.expectOne(URL_PERMISOS);
    expect(peticion.request.method).toBe('GET');
    peticion.flush(MATRIZ);

    expect(matriz).toEqual(MATRIZ);
  });

  it('guardarPermisos hace PATCH con solo las filas enviadas', () => {
    const permisos: PermisoCambio[] = [
      { funcion: 'VENTAS', accion: 'REGISTRAR', permitido: false },
      { funcion: 'PERSONAL', accion: 'CONSULTAR', permitido: true },
    ];

    let actualizados = -1;
    service.guardarPermisos(3, permisos).subscribe((respuesta) => {
      actualizados = respuesta.actualizados;
    });

    const peticion = http.expectOne(`${URL_ROLES}/3/permisos`);
    expect(peticion.request.method).toBe('PATCH');
    expect(peticion.request.body).toEqual({
      permisos: [
        { funcion: 'VENTAS', accion: 'REGISTRAR', permitido: false },
        { funcion: 'PERSONAL', accion: 'CONSULTAR', permitido: true },
      ],
    });

    const cuerpo = peticion.request.body as unknown as Record<string, unknown>;
    expect('rol_id' in cuerpo).toBe(false);
    expect('empresa_id' in cuerpo).toBe(false);

    peticion.flush({ rol_id: 3, rol: 'CAJERO', actualizados: 2 });
    expect(actualizados).toBe(2);
  });

  it('guardarPermisos propaga el 409 de la matriz del administrador', () => {
    let estado = 0;
    let detalle = '';

    service
      .guardarPermisos(1, [
        { funcion: 'VENTAS', accion: 'REGISTRAR', permitido: true },
      ])
      .subscribe({
        error: (error: HttpErrorResponse) => {
          estado = error.status;
          detalle = (error.error as { detail?: string }).detail ?? '';
        },
      });

    http
      .expectOne(`${URL_ROLES}/1/permisos`)
      .flush(
        { detail: 'La matriz del administrador es de solo lectura' },
        { status: 409, statusText: 'Conflict' },
      );

    expect(estado).toBe(409);
    expect(detalle).toBe('La matriz del administrador es de solo lectura');
  });

  it('guardarPermisos propaga el 422 de permiso no reconocido', () => {
    let estado = 0;

    service
      .guardarPermisos(3, [
        { funcion: 'INVENTADA', accion: 'HACER', permitido: true },
      ])
      .subscribe({
        error: (error: HttpErrorResponse) => (estado = error.status),
      });

    http
      .expectOne(`${URL_ROLES}/3/permisos`)
      .flush(
        { detail: 'Permiso no reconocido' },
        { status: 422, statusText: 'Unprocessable Entity' },
      );

    expect(estado).toBe(422);
  });

  it('listarRoles propaga el 403 cuando el rol no es ADMINISTRADOR', () => {
    let estado = 0;

    service.listarRoles().subscribe({
      error: (error: HttpErrorResponse) => (estado = error.status),
    });

    http.expectOne(URL_ROLES).flush(
      { detail: 'Operacion no autorizada' },
      { status: 403, statusText: 'Forbidden' },
    );

    expect(estado).toBe(403);
  });
});
