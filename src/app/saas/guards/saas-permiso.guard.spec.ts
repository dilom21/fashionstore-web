import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import {
  ActivatedRouteSnapshot,
  Router,
  RouterStateSnapshot,
  UrlTree,
  provideRouter,
} from '@angular/router';
import { isObservable } from 'rxjs';

import { environment } from '../../../environments/environment';
import {
  MatrizPermisos,
  TenantLoginResponse,
  TenantMe,
} from '../models/tenant.models';
import { SaasPermissionsService } from '../services/saas-permissions.service';
import { SaasSessionService } from '../services/saas-session.service';
import { SAAS_RUTA_SIN_PERMISO, requierePermiso } from './saas-permiso.guard';

const API = environment.apiUrl.replace(/\/+$/, '');
const URL_ME = `${API}/auth/tenant/me`;
const URL_PERMISOS = `${API}/tenant/empresa/permisos`;

const LOGIN: TenantLoginResponse = {
  access_token: 'jwt-tenant-123',
  token_type: 'bearer',
  empresa_id: 7,
  empresa_slug: 'demo-empresa',
  empresa_nombre: 'Demo Empresa',
  rol: 'CAJERO',
  contexto: 'personal',
};

const ME: TenantMe = {
  usuario_id: 42,
  empresa_id: 7,
  empresa_slug: 'demo-empresa',
  empresa_nombre: 'Demo Empresa',
  rol: 'CAJERO',
  contexto: 'personal',
  plan_codigo: 'BASICO',
  permite_reportes_ia: false,
};

/** Matriz con un único permiso explícito: VENTAS/REGISTRAR. */
function matriz(permitido: boolean, rol = 'CAJERO'): MatrizPermisos {
  return {
    empresa_id: 7,
    catalogo: [{ funcion: 'VENTAS', accion: 'REGISTRAR' }],
    roles: [
      {
        rol_id: 3,
        rol,
        permisos: [
          {
            funcion: 'VENTAS',
            accion: 'REGISTRAR',
            permitido,
            origen: 'DEFAULT',
          },
        ],
      },
    ],
  };
}

describe('requierePermiso', () => {
  let http: HttpTestingController;
  let router: Router;

  /** Configura la sesión (CAJERO por defecto) ya hidratada. */
  function prepararSesion(me: TenantMe = ME): void {
    const sesion = TestBed.inject(SaasSessionService);
    sesion.guardarSesion({ ...LOGIN, rol: me.rol }, 'usuario@demo.com');
    sesion.hidratar().subscribe({ error: () => undefined });
    http.expectOne(URL_ME).flush(me);
  }

  /** Ejecuta el guard y resuelve el observable si hace falta. */
  function ejecutar(
    funcion: string,
    accion: string,
  ): unknown {
    let resultado: unknown;

    TestBed.runInInjectionContext(() => {
      const guard = requierePermiso(funcion, accion);
      const respuesta = guard(
        {} as ActivatedRouteSnapshot,
        {} as RouterStateSnapshot,
      );
      if (isObservable(respuesta)) {
        respuesta.subscribe((valor) => (resultado = valor));
      } else {
        resultado = respuesta;
      }
    });

    return resultado;
  }

  beforeEach(() => {
    sessionStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
  });

  afterEach(() => {
    http.verify();
    sessionStorage.clear();
  });

  it('carga la matriz y niega cuando el permiso está en false', () => {
    prepararSesion();

    const pendiente = ejecutar('VENTAS', 'REGISTRAR');
    expect(pendiente).toBeUndefined();

    http.expectOne(URL_PERMISOS).flush(matriz(false));

    // Reejecutar ya con la matriz cargada devuelve la decisión síncrona.
    const resultado = ejecutar('VENTAS', 'REGISTRAR');
    expect(resultado).toBeInstanceOf(UrlTree);
    expect(router.serializeUrl(resultado as UrlTree)).toBe(
      SAAS_RUTA_SIN_PERMISO,
    );
  });

  it('permite cuando el permiso está en true', () => {
    prepararSesion();
    const permisos = TestBed.inject(SaasPermissionsService);

    permisos.cargar().subscribe();
    http.expectOne(URL_PERMISOS).flush(matriz(true));

    expect(ejecutar('VENTAS', 'REGISTRAR')).toBe(true);
    http.expectNone(URL_PERMISOS);
  });

  it('el administrador pasa aunque la matriz no declare el permiso', () => {
    prepararSesion({ ...ME, rol: 'ADMINISTRADOR' });
    const permisos = TestBed.inject(SaasPermissionsService);

    permisos.cargar().subscribe();
    http.expectOne(URL_PERMISOS).flush({
      empresa_id: 7,
      catalogo: [],
      roles: [
        {
          rol_id: 1,
          rol: 'ADMINISTRADOR',
          permisos: [
            {
              funcion: 'CATALOGO',
              accion: 'CONSULTAR',
              permitido: true,
              origen: 'DEFAULT',
            },
          ],
        },
      ],
    });

    expect(ejecutar('VENTAS', 'REGISTRAR')).toBe(true);
  });

  it('el administrador también se oculta si la matriz lo niega', () => {
    prepararSesion({ ...ME, rol: 'ADMINISTRADOR' });
    const permisos = TestBed.inject(SaasPermissionsService);

    permisos.cargar().subscribe();
    http.expectOne(URL_PERMISOS).flush(matriz(false, 'ADMINISTRADOR'));

    const resultado = ejecutar('VENTAS', 'REGISTRAR');
    expect(resultado).toBeInstanceOf(UrlTree);
  });

  it('sin token no pide la matriz y manda al login', () => {
    const resultado = ejecutar('VENTAS', 'REGISTRAR');

    expect(resultado).toBeInstanceOf(UrlTree);
    expect(router.serializeUrl(resultado as UrlTree)).toBe('/saas/login');
    http.expectNone(URL_PERMISOS);
  });
});
