import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
  ActivatedRoute,
  Router,
  convertToParamMap,
  provideRouter,
} from '@angular/router';
import { of, throwError } from 'rxjs';

import { environment } from '../../../../../../environments/environment';
import {
  TENANT_TOKEN_STORAGE_KEY,
  TenantApiService,
  TenantIdentidad,
} from '../../../../saas/services/tenant-api.service';
import { AuthService } from '../../services/auth.service';
import { Login, destinoInternoSeguro } from './login';

const API = environment.apiUrl.replace(/\/+$/, '');

/** Clave del JWT legacy del primer parcial: el SaaS nunca debe escribirla. */
const CLAVE_LEGACY = 'vanter_access_token';

const EMPRESA_SLUG = (environment.empresaSlug ?? '').trim().toLowerCase();

/** Empresas reales que devuelve GET /auth/tenant/empresas en las pruebas. */
const EMPRESAS = [
  { slug: EMPRESA_SLUG, nombre_comercial: 'Vanter Men' },
  { slug: 'otra-empresa', nombre_comercial: 'Otra Empresa' },
];

const RESPUESTA_LOGIN_CLIENTE = {
  access_token: 'tenant-jwt-cliente',
  token_type: 'bearer',
  empresa_id: 3,
  empresa_slug: EMPRESA_SLUG,
  empresa_nombre: 'Vanter Men',
  rol: 'CLIENTE',
  contexto: 'cliente' as const,
};

/**
 * Identidad de CLIENTE tal como la devuelve GET /auth/tenant/me: el backend no
 * envía perfil de personal (empleado_id/sucursal_id/nombre quedan en null).
 */
function identidadCliente(
  overrides: Partial<TenantIdentidad> = {},
): TenantIdentidad {
  return {
    usuario_id: 21,
    empresa_id: 3,
    empresa_slug: EMPRESA_SLUG,
    empresa_nombre: 'Vanter Men',
    rol: 'CLIENTE',
    contexto: 'cliente',
    plan_codigo: 'PRO',
    permite_reportes_ia: false,
    correo: null,
    empleado_id: null,
    nombre: null,
    apellido: null,
    sucursal_id: null,
    ...overrides,
  };
}

function apiMock(overrides: Record<string, unknown> = {}): any {
  return {
    empresasPublicas: vi.fn(() => of(EMPRESAS)),
    login: vi.fn(() => of(RESPUESTA_LOGIN_CLIENTE)),
    me: vi.fn(() => of(identidadCliente())),
    cerrarSesion: vi.fn(),
    restaurarSesion: vi.fn(() => of(null)),
    tieneToken: vi.fn(() => false),
    identidad: () => null,
    contexto: () => null,
    autenticado: () => false,
    ...overrides,
  };
}

function authMock(overrides: Record<string, unknown> = {}): any {
  return {
    autenticado: () => false,
    contexto: () => null,
    usuarioActual: () => null,
    esCliente: () => false,
    loginCliente: vi.fn(),
    cerrarSesion: vi.fn(),
    ...overrides,
  };
}


/**
 * Segundo parcial — LOGIN DEL CLIENTE con el mecanismo SaaS.
 *
 * El login público conserva su diseño y ahora usa
 * POST /auth/tenant/login (contexto "cliente") + GET /auth/tenant/me. Nunca se
 * guarda el JWT empresarial en la clave legacy y la sesión no se considera
 * autenticada antes de que /me confirme la identidad.
 */
describe('Login (cliente SaaS)', () => {
  let fixture: ComponentFixture<Login>;
  let componente: Login;
  let router: Router;
  let api: any;
  let auth: any;

  async function setup(
    opciones: {
      api?: any;
      auth?: any;
      returnUrl?: string | null;
      empresaParam?: string | null;
      httpReal?: boolean;
    } = {},
  ): Promise<void> {
    api = opciones.api ?? apiMock();
    auth = opciones.auth ?? authMock();
    const returnUrl = opciones.returnUrl ?? null;
    const empresaParam = opciones.empresaParam ?? null;
    const parametros: Record<string, string> = {};
    if (returnUrl !== null) {
      parametros['returnUrl'] = returnUrl;
    }
    if (empresaParam !== null) {
      parametros['empresa'] = empresaParam;
    }

    const httpProviders = opciones.httpReal
      ? [provideHttpClient(), provideHttpClientTesting()]
      : [];

    await TestBed.configureTestingModule({
      imports: [Login],
      providers: [
        provideRouter([]),
        ...httpProviders,
        { provide: AuthService, useValue: auth },
        // Con `httpReal` se usa el TenantApiService real para comprobar la
        // clave de almacenamiento y las peticiones efectivamente enviadas.
        ...(opciones.httpReal
          ? []
          : [{ provide: TenantApiService, useValue: api }]),
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              queryParamMap: convertToParamMap(parametros),
            },
          },
        },
      ],
    }).compileComponents();

    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);

    fixture = TestBed.createComponent(Login);
    componente = fixture.componentInstance;
    fixture.detectChanges();
  }

  function completarFormulario(): void {
    componente.form.setValue({
      empresa_slug: EMPRESA_SLUG,
      correo: 'cliente@vanter.test',
      password: 'Segura123!',
    });
  }

  function resolverEmpresas(http: HttpTestingController): void {
    http
      .expectOne((req) => req.url === `${API}/auth/tenant/empresas`)
      .flush(EMPRESAS);
  }

  beforeEach(() => {
    sessionStorage.clear();
  });

  afterEach(() => {
    sessionStorage.clear();
  });

  it('envía el contexto "cliente" y la empresa elegida en el selector', async () => {
    await setup();

    expect(componente.empresas().map((empresa) => empresa.slug)).toContain(
      EMPRESA_SLUG,
    );

    completarFormulario();
    componente.onSubmit();

    expect(api.login).toHaveBeenCalledWith({
      correo: 'cliente@vanter.test',
      password: 'Segura123!',
      empresa_slug: EMPRESA_SLUG,
      contexto: 'cliente',
    });
    // El formulario no puede elegir el contexto; la empresa sí, entre las
    // empresas REALES que devolvió el backend.
    expect(componente.form.getRawValue()).not.toHaveProperty('contexto');
    expect(componente.form.getRawValue().empresa_slug).toBe(EMPRESA_SLUG);
  });

  it('confirma la identidad con /auth/tenant/me y recién entonces navega a la tienda', async () => {
    const orden: string[] = [];
    api = apiMock({
      login: vi.fn(() => {
        orden.push('login');
        return of(RESPUESTA_LOGIN_CLIENTE);
      }),
      me: vi.fn(() => {
        orden.push('me');
        return of(identidadCliente());
      }),
      contexto: () => 'cliente',
      autenticado: () => true,
    });
    await setup({ api });

    completarFormulario();
    componente.onSubmit();

    expect(orden).toEqual(['login', 'me']);
    expect(router.navigateByUrl).toHaveBeenCalledWith('/', {
      replaceUrl: true,
    });
    expect(api.cerrarSesion).not.toHaveBeenCalled();
    expect(componente.enviando()).toBe(false);
  });

  it('un 401 (credenciales inválidas o cuenta de otra empresa) no navega ni toca sesiones previas', async () => {
    api = apiMock({
      login: vi.fn(() =>
        throwError(() => new HttpErrorResponse({ status: 401 })),
      ),
    });
    await setup({ api });

    completarFormulario();
    componente.onSubmit();

    expect(router.navigateByUrl).not.toHaveBeenCalled();
    expect(componente.mensajeError()).toContain('No pudimos iniciar sesión');
    expect(componente.enviando()).toBe(false);
    expect(api.cerrarSesion).not.toHaveBeenCalled();
  });

  it('un 503 del login informa que el acceso SaaS no está disponible', async () => {
    api = apiMock({
      login: vi.fn(() =>
        throwError(() => new HttpErrorResponse({ status: 503 })),
      ),
    });
    await setup({ api });

    completarFormulario();
    componente.onSubmit();

    expect(componente.mensajeError()).toContain('todavía no está habilitado');
    expect(router.navigateByUrl).not.toHaveBeenCalled();
  });

  it('un 403 en /auth/tenant/me limpia la sesión y no autentica al cliente', async () => {
    api = apiMock({
      me: vi.fn(() => throwError(() => new HttpErrorResponse({ status: 403 }))),
    });
    await setup({ api });

    completarFormulario();
    componente.onSubmit();

    expect(api.cerrarSesion).toHaveBeenCalledTimes(1);
    expect(router.navigateByUrl).not.toHaveBeenCalled();
    expect(componente.mensajeError()).toContain(
      'no tiene un perfil de cliente activo',
    );
  });

  it('un 5xx en /me no declara sesión autenticada y limpia el token recién emitido', async () => {
    api = apiMock({
      me: vi.fn(() => throwError(() => new HttpErrorResponse({ status: 500 }))),
    });
    await setup({ api });

    completarFormulario();
    componente.onSubmit();

    expect(componente.mensajeError()).toContain('No pudimos conectarnos');
    expect(router.navigateByUrl).not.toHaveBeenCalled();
    expect(api.cerrarSesion).toHaveBeenCalledTimes(1);
  });

  it('un error de conexión (status 0) informa el problema de red', async () => {
    api = apiMock({
      me: vi.fn(() => throwError(() => new HttpErrorResponse({ status: 0 }))),
    });
    await setup({ api });

    completarFormulario();
    componente.onSubmit();

    expect(componente.mensajeError()).toContain('No pudimos conectarnos');
    expect(router.navigateByUrl).not.toHaveBeenCalled();
  });

  it('rechaza una identidad confirmada con contexto "personal"', async () => {
    api = apiMock({
      me: vi.fn(() =>
        of(
          identidadCliente({
            contexto: 'personal',
            rol: 'CAJERO',
            empleado_id: 7,
            sucursal_id: 2,
            nombre: 'Harold',
          }),
        ),
      ),
    });
    await setup({ api });

    completarFormulario();
    componente.onSubmit();

    expect(api.cerrarSesion).toHaveBeenCalledTimes(1);
    expect(router.navigateByUrl).not.toHaveBeenCalled();
    expect(componente.mensajeError()).toContain(
      'no tiene un perfil de cliente activo',
    );
  });

  it('rechaza una identidad de otra empresa aunque el login haya respondido', async () => {
    api = apiMock({
      me: vi.fn(() => of(identidadCliente({ empresa_slug: 'otra-empresa' }))),
    });
    await setup({ api });

    completarFormulario();
    componente.onSubmit();

    expect(api.cerrarSesion).toHaveBeenCalledTimes(1);
    expect(router.navigateByUrl).not.toHaveBeenCalled();
    expect(componente.mensajeError()).toContain('no pertenece a la empresa');
  });

  it('rechaza una identidad con empresa_id distinto al de la respuesta de login', async () => {
    api = apiMock({
      me: vi.fn(() => of(identidadCliente({ empresa_id: 99 }))),
    });
    await setup({ api });

    completarFormulario();
    componente.onSubmit();

    expect(api.cerrarSesion).toHaveBeenCalledTimes(1);
    expect(router.navigateByUrl).not.toHaveBeenCalled();
    expect(componente.mensajeError()).toContain('no pertenece a la empresa');
  });

  it('restaura la sesión de cliente confirmada al recargar (sin volver a autenticar)', async () => {
    api = apiMock({
      contexto: () => 'cliente',
      autenticado: () => true,
      identidad: () => identidadCliente(),
    });
    await setup({ api });

    expect(api.login).not.toHaveBeenCalled();
    expect(router.navigateByUrl).toHaveBeenCalledWith('/', {
      replaceUrl: true,
    });
  });

  it('no redirige si la sesión empresarial restaurada es de PERSONAL', async () => {
    api = apiMock({
      contexto: () => 'personal',
      autenticado: () => true,
      identidad: () =>
        identidadCliente({ contexto: 'personal', rol: 'CAJERO' }),
    });
    await setup({ api });

    expect(router.navigateByUrl).not.toHaveBeenCalled();
  });

  it('respeta un returnUrl interno y compatible con la tienda pública', async () => {
    api = apiMock({
      contexto: () => 'cliente',
      autenticado: () => true,
      identidad: () => identidadCliente(),
    });
    await setup({ api, returnUrl: '/catalogo?buscar=polo' });

    expect(router.navigateByUrl).toHaveBeenCalledWith('/catalogo?buscar=polo', {
      replaceUrl: true,
    });
  });

  it('no redirige a áreas legacy protegidas ni a dominios externos', async () => {
    const candidatos = [
      '/reservas',
      '/checkout',
      '/pagos',
      '//evil.example.com',
      'https://evil.example.com',
      '/\\evil.example.com',
      '/login',
    ];

    for (const candidato of candidatos) {
      TestBed.resetTestingModule();
      api = apiMock({
        contexto: () => 'cliente',
        autenticado: () => true,
        identidad: () => identidadCliente(),
      });
      await setup({ api, returnUrl: candidato });

      expect(router.navigateByUrl).toHaveBeenCalledWith('/', {
        replaceUrl: true,
      });
    }
  });

  it('destinoInternoSeguro acepta solo rutas internas de la tienda', () => {
    expect(destinoInternoSeguro('/')).toBe('/');
    expect(destinoInternoSeguro('/catalogo')).toBe('/catalogo');
    expect(destinoInternoSeguro(' /catalogo/productos/12 ')).toBe(
      '/catalogo/productos/12',
    );
    expect(destinoInternoSeguro(null)).toBeNull();
    expect(destinoInternoSeguro('')).toBeNull();
    expect(destinoInternoSeguro('   ')).toBeNull();
    expect(destinoInternoSeguro('catalogo')).toBeNull();
    expect(destinoInternoSeguro('//evil.example.com')).toBeNull();
    expect(destinoInternoSeguro('https://evil.example.com')).toBeNull();
    expect(destinoInternoSeguro('/\\evil.example.com')).toBeNull();
    // CU15 (carrito) ya está adaptado al modo empresarial: es un destino válido.
    expect(destinoInternoSeguro('/carritos')).toBe('/carritos');
    expect(destinoInternoSeguro('/carritos/15')).toBe('/carritos/15');
    expect(destinoInternoSeguro('/reservas/8')).toBeNull();
    expect(destinoInternoSeguro('/admin/usuarios')).toBeNull();
    expect(destinoInternoSeguro('/saas/empresa')).toBeNull();
    expect(destinoInternoSeguro(`/${'a'.repeat(600)}`)).toBeNull();
  });

  it('guarda el JWT SaaS solo en su clave y no consulta carrito ni reservas', async () => {
    // TenantApiService real + backend simulado: se comprueba la petición real.
    await setup({ httpReal: true });
    const http = TestBed.inject(HttpTestingController);
    resolverEmpresas(http);


    completarFormulario();
    componente.onSubmit();

    const peticionLogin = http.expectOne(`${API}/auth/tenant/login`);
    expect(peticionLogin.request.method).toBe('POST');
    expect(peticionLogin.request.body).toEqual({
      correo: 'cliente@vanter.test',
      password: 'Segura123!',
      empresa_slug: EMPRESA_SLUG,
      contexto: 'cliente',
    });
    peticionLogin.flush(RESPUESTA_LOGIN_CLIENTE);

    const peticionMe = http.expectOne(`${API}/auth/tenant/me`);
    expect(peticionMe.request.method).toBe('GET');
    expect(peticionMe.request.headers.get('Authorization')).toBe(
      'Bearer tenant-jwt-cliente',
    );
    peticionMe.flush(identidadCliente());

    expect(sessionStorage.getItem(TENANT_TOKEN_STORAGE_KEY)).toBe(
      'tenant-jwt-cliente',
    );
    expect(sessionStorage.getItem(CLAVE_LEGACY)).toBeNull();

    // http.verify() falla si el login SaaS disparó carrito (CU15) o reservas.
    http.verify();
    // El effect que redirige corre tras confirmar la identidad (microtarea).
    await vi.waitFor(() => {
      expect(router.navigateByUrl).toHaveBeenCalledWith('/', {
        replaceUrl: true,
      });
    });
  });

  it('con datos reales tampoco autentica si /me devuelve otra empresa', async () => {
    await setup({ httpReal: true });
    const http = TestBed.inject(HttpTestingController);
    resolverEmpresas(http);


    completarFormulario();
    componente.onSubmit();

    http.expectOne(`${API}/auth/tenant/login`).flush(RESPUESTA_LOGIN_CLIENTE);
    http
      .expectOne(`${API}/auth/tenant/me`)
      .flush(identidadCliente({ empresa_slug: 'otra-empresa' }));

    expect(router.navigateByUrl).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(TENANT_TOKEN_STORAGE_KEY)).toBeNull();
    expect(componente.mensajeError()).toContain('no pertenece a la empresa');
  });

  it('carga el selector con las empresas reales y no preselecciona ninguna', async () => {
    await setup();

    expect(api.empresasPublicas).toHaveBeenCalledTimes(1);
    expect(componente.empresas().map((empresa) => empresa.slug)).toEqual([
      EMPRESA_SLUG,
      'otra-empresa',
    ]);
    expect(componente.form.controls.empresa_slug.value).toBe('');
    expect(componente.empresaSeleccionada()).toBeNull();
  });

  it('no autentica sin empresa seleccionada', async () => {
    await setup();

    componente.form.patchValue({
      correo: 'cliente@vanter.test',
      password: 'Segura123!',
    });
    componente.onSubmit();

    expect(api.login).not.toHaveBeenCalled();
    expect(router.navigateByUrl).not.toHaveBeenCalled();
    expect(componente.mensajeError()).toContain('Selecciona la empresa');
  });

  it('rechaza una empresa que ya no aparece en la lista', async () => {
    await setup();

    completarFormulario();
    componente.form.controls.empresa_slug.setValue('empresa-retirada');
    componente.onSubmit();

    expect(api.login).not.toHaveBeenCalled();
    expect(componente.mensajeError()).toContain('ya no está disponible');
  });

  it('si el selector falla lo informa y no permite autenticar', async () => {
    api = apiMock({
      empresasPublicas: vi.fn(() =>
        throwError(() => new HttpErrorResponse({ status: 0 })),
      ),
    });
    await setup({ api });

    expect(componente.empresas()).toEqual([]);
    expect(componente.errorEmpresas()).toContain(
      'No pudimos cargar las empresas',
    );

    componente.form.patchValue({
      correo: 'cliente@vanter.test',
      password: 'Segura123!',
    });
    componente.onSubmit();
    expect(api.login).not.toHaveBeenCalled();
  });

  it('preselecciona la empresa recibida desde el registro (?empresa=)', async () => {
    await setup({ empresaParam: 'otra-empresa' });

    expect(componente.form.controls.empresa_slug.value).toBe('otra-empresa');
  });

  it('ignora en la URL una empresa que no existe en el backend', async () => {
    await setup({ empresaParam: 'empresa-fantasma' });

    expect(componente.form.controls.empresa_slug.value).toBe('');
  });

  it('"Crear cuenta" exige empresa y permanece en el login sin ella', async () => {
    await setup();
    vi.spyOn(router, 'navigate').mockResolvedValue(true);

    componente.irARegistro();

    expect(router.navigate).not.toHaveBeenCalled();
    expect(componente.mensajeError()).toContain('Selecciona la empresa');
  });

  it('"Crear cuenta" lleva la empresa elegida al registro', async () => {
    await setup();
    vi.spyOn(router, 'navigate').mockResolvedValue(true);

    componente.form.controls.empresa_slug.setValue(EMPRESA_SLUG);
    componente.irARegistro();

    expect(router.navigate).toHaveBeenCalledWith(['/registro'], {
      queryParams: { empresa: EMPRESA_SLUG },
    });
  });

});
