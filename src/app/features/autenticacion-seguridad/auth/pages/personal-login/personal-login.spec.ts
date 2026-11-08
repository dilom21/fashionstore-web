import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';

import {
  TenantApiService,
  TenantIdentidad,
} from '../../../../saas/services/tenant-api.service';
import { PersonalLogin } from './personal-login';

const RESPUESTA_LOGIN = {
  access_token: 'tenant-jwt',
  token_type: 'bearer',
  empresa_id: 3,
  empresa_slug: 'vanter-men',
  empresa_nombre: 'Vanter Men',
  rol: 'CAJERO',
  contexto: 'personal' as const,
};

/** Empresas reales que devuelve GET /auth/tenant/empresas en las pruebas. */
const EMPRESAS = [
  { slug: 'vanter-men', nombre_comercial: 'Vanter Men' },
  { slug: 'otra-empresa', nombre_comercial: 'Otra Empresa' },
];


function identidad(
  rol = 'CAJERO',
  contexto: 'personal' | 'cliente' = 'personal',
): TenantIdentidad {
  return {
    usuario_id: 12,
    empresa_id: 3,
    empresa_slug: 'vanter-men',
    empresa_nombre: 'Vanter Men',
    rol,
    contexto,
    plan_codigo: 'PRO',
    permite_reportes_ia: false,
    correo: 'cajero@vanter.test',
    empleado_id: 7,
    nombre: 'Harold',
    apellido: 'Amador',
    sucursal_id: 2,
  };
}

function apiMock(overrides: Record<string, unknown> = {}): any {
  return {
    empresasPublicas: vi.fn(() => of(EMPRESAS)),
    login: vi.fn(() => of(RESPUESTA_LOGIN)),
    me: vi.fn(() => of(identidad())),
    cerrarSesion: vi.fn(),
    restaurarSesion: vi.fn(() => of(null)),
    tieneToken: vi.fn(() => false),
    identidad: () => null,
    esAdministrador: () => false,
    esEncargadoSucursal: () => false,
    esCajero: () => true,
    ...overrides,
  };
}

/**
 * CU03 SaaS: el acceso del personal usa POST /auth/tenant/login con contexto
 * "personal" y confirma la identidad con GET /auth/tenant/me. El JWT por sí
 * solo no autentica: si /me falla, la sesión se limpia.
 */
describe('PersonalLogin (CU03 SaaS del personal)', () => {
  let fixture: ComponentFixture<PersonalLogin>;
  let componente: PersonalLogin;
  let router: Router;

  async function setup(api: any): Promise<void> {
    await TestBed.configureTestingModule({
      imports: [PersonalLogin],
      providers: [
        provideRouter([]),
        { provide: TenantApiService, useValue: api },
      ],
    }).compileComponents();

    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);

    fixture = TestBed.createComponent(PersonalLogin);
    componente = fixture.componentInstance;
    fixture.detectChanges();
  }

  function completarFormulario(): void {
    componente.form.setValue({
      empresa_slug: 'vanter-men',
      correo: 'cajero@vanter.test',
      password: 'Segura123!',
    });
  }

  it('muestra la marca FashionStore y no la de una empresa concreta', async () => {
    await setup(apiMock());

    const texto = ((fixture.nativeElement as HTMLElement).textContent ?? '')
      .replace(/\s+/g, ' ')
      .trim();

    expect(texto).toContain('FashionStore');
    expect(texto).toContain('Portal empresarial');
    expect(texto).toContain('Accede al sistema de gestión de tu empresa.');
    expect(texto).not.toContain('VANTER');
  });

  it('conserva la fotografía original del panel visual', async () => {
    await setup(apiMock());

    const foto = (fixture.nativeElement as HTMLElement).querySelector(
      'img.p-login__visual-img',
    );

    expect(foto).toBeTruthy();
    expect(foto!.getAttribute('src')).toBe('/images/login/login-vista.jpg');
  });

  it('exige empresa, correo y contraseña', async () => {
    await setup(apiMock());

    expect(componente.form.valid).toBe(false);

    componente.form.controls.empresa_slug.markAsTouched();
    expect(componente.mensajeEmpresa()).toBe(
      'Selecciona la empresa a la que perteneces.',
    );

    componente.form.controls.empresa_slug.setValue('Vanter Men');
    expect(componente.form.controls.empresa_slug.hasError('pattern')).toBe(true);
    expect(componente.mensajeEmpresa()).toContain('lista');

    componente.form.patchValue({ correo: 'cajero@vanter.test' });
    expect(componente.form.controls.correo.valid).toBe(true);
    expect(componente.form.controls.password.hasError('required')).toBe(true);

    componente.form.patchValue({
      empresa_slug: 'vanter-men',
      password: 'Segura123!',
    });
    expect(componente.form.valid).toBe(true);
  });

  it('no envía nada si el formulario es inválido', async () => {
    const api = apiMock();
    await setup(api);

    componente.onSubmit();

    expect(api.login).not.toHaveBeenCalled();
    expect(api.me).not.toHaveBeenCalled();
  });

  it('envía empresa, correo, contraseña y el contexto personal', async () => {
    const api = apiMock();
    await setup(api);

    completarFormulario();
    componente.onSubmit();

    expect(api.login).toHaveBeenCalledTimes(1);
    expect(api.login).toHaveBeenCalledWith({
      empresa_slug: 'vanter-men',
      correo: 'cajero@vanter.test',
      password: 'Segura123!',
      contexto: 'personal',
    });
  });

  it('consulta GET /auth/tenant/me después de obtener el JWT', async () => {
    const orden: string[] = [];
    const api = apiMock({
      login: vi.fn(() => {
        orden.push('login');
        return of(RESPUESTA_LOGIN);
      }),
      me: vi.fn(() => {
        orden.push('me');
        return of(identidad());
      }),
    });
    await setup(api);

    completarFormulario();
    componente.onSubmit();

    expect(orden).toEqual(['login', 'me']);
  });

  it('recupera el perfil del empleado (nombre, apellido, rol y sucursal) de /me', async () => {
    let perfil: TenantIdentidad | undefined;
    const api = apiMock({
      me: vi.fn(() => {
        perfil = identidad('ENCARGADO_SUCURSAL');
        return of(perfil);
      }),
    });
    await setup(api);

    completarFormulario();
    componente.onSubmit();

    expect(api.me).toHaveBeenCalledTimes(1);
    expect(perfil?.nombre).toBe('Harold');
    expect(perfil?.apellido).toBe('Amador');
    expect(perfil?.rol).toBe('ENCARGADO_SUCURSAL');
    expect(perfil?.sucursal_id).toBe(2);
  });

  it('el ADMINISTRADOR empresarial llega al panel administrativo original', async () => {
    const api = apiMock({
      me: vi.fn(() => of(identidad('ADMINISTRADOR'))),
      esAdministrador: () => true,
    });
    await setup(api);

    completarFormulario();
    componente.onSubmit();

    expect(router.navigateByUrl).toHaveBeenCalledWith('/admin/inicio');
    // La pantalla CU4-CU5 es provisional y NO es el destino del login.
    expect(router.navigateByUrl).not.toHaveBeenCalledWith('/saas/empresa');
  });

  it('ENCARGADO_SUCURSAL y CAJERO van a la pantalla neutral, no a módulos legacy', async () => {
    for (const rol of ['ENCARGADO_SUCURSAL', 'CAJERO']) {
      TestBed.resetTestingModule();
      const api = apiMock({ me: vi.fn(() => of(identidad(rol))) });
      await setup(api);

      completarFormulario();
      componente.onSubmit();

      expect(router.navigateByUrl).toHaveBeenCalledWith('/saas/sesion');
      expect(router.navigateByUrl).not.toHaveBeenCalledWith('/dashboard');
      expect(router.navigateByUrl).not.toHaveBeenCalledWith('/admin/usuarios');
    }
  });

  it('un 401 del login no navega y muestra el mensaje de credenciales', async () => {
    const api = apiMock({
      login: vi.fn(() =>
        throwError(() => new HttpErrorResponse({ status: 401 })),
      ),
    });
    await setup(api);

    completarFormulario();
    componente.onSubmit();

    expect(router.navigateByUrl).not.toHaveBeenCalled();
    expect(componente.enviando()).toBe(false);
    expect(componente.mensajeError()).toContain('No pudimos iniciar sesión');
    expect(api.cerrarSesion).toHaveBeenCalled();
  });

  it('un 403 en /auth/tenant/me limpia la sesión y no abre el panel', async () => {
    const api = apiMock({
      me: vi.fn(() =>
        throwError(() => new HttpErrorResponse({ status: 403 })),
      ),
    });
    await setup(api);

    completarFormulario();
    componente.onSubmit();

    expect(api.cerrarSesion).toHaveBeenCalled();
    expect(router.navigateByUrl).not.toHaveBeenCalled();
    expect(componente.mensajeError()).not.toBeNull();
    expect(componente.enviando()).toBe(false);
  });

  it('un 500 en /auth/tenant/me no deja la sesión como autenticada', async () => {
    const api = apiMock({
      me: vi.fn(() =>
        throwError(() => new HttpErrorResponse({ status: 500 })),
      ),
    });
    await setup(api);

    completarFormulario();
    componente.onSubmit();

    expect(api.cerrarSesion).toHaveBeenCalled();
    expect(router.navigateByUrl).not.toHaveBeenCalled();
    expect(componente.mensajeError()).toContain('No pudimos conectarnos');
  });

  it('no acepta una identidad empresarial de contexto cliente', async () => {
    const api = apiMock({
      me: vi.fn(() => of(identidad('CLIENTE', 'cliente'))),
    });
    await setup(api);

    completarFormulario();
    componente.onSubmit();

    expect(api.cerrarSesion).toHaveBeenCalled();
    expect(router.navigateByUrl).not.toHaveBeenCalled();
    expect(componente.mensajeError()).toContain(
      'no tiene un perfil de personal',
    );
  });

  it('restaura la sesión tras recargar cuando hay JWT empresarial', async () => {
    let actual: TenantIdentidad | null = null;
    const api = apiMock({
      identidad: () => actual,
      tieneToken: () => true,
      restaurarSesion: vi.fn(() => {
        actual = identidad('CAJERO');
        return of(actual);
      }),
    });
    await setup(api);

    expect(api.restaurarSesion).toHaveBeenCalledTimes(1);
    expect(router.navigateByUrl).toHaveBeenCalledWith('/saas/sesion');
  });

  it('sin JWT empresarial no intenta restaurar ni navega', async () => {
    const api = apiMock();
    await setup(api);

    expect(api.restaurarSesion).not.toHaveBeenCalled();
    expect(router.navigateByUrl).not.toHaveBeenCalled();
  });

  it('carga el selector con las empresas reales y no preselecciona ninguna', async () => {
    const api = apiMock();
    await setup(api);

    expect(api.empresasPublicas).toHaveBeenCalledTimes(1);
    expect(componente.empresas().map((empresa) => empresa.slug)).toEqual([
      'vanter-men',
      'otra-empresa',
    ]);
    expect(componente.form.controls.empresa_slug.value).toBe('');
    expect(componente.empresaSeleccionada()).toBeNull();
  });

  it('no autentica si no se eligió empresa', async () => {
    const api = apiMock();
    await setup(api);

    componente.form.patchValue({
      correo: 'cajero@vanter.test',
      password: 'Segura123!',
    });
    componente.onSubmit();

    expect(api.login).not.toHaveBeenCalled();
    expect(api.me).not.toHaveBeenCalled();
    expect(componente.mensajeError()).toContain('Selecciona la empresa');
  });

  it('no autentica con una empresa que ya no aparece en la lista', async () => {
    const api = apiMock();
    await setup(api);

    completarFormulario();
    componente.form.controls.empresa_slug.setValue('empresa-eliminada');
    componente.onSubmit();

    expect(api.login).not.toHaveBeenCalled();
    expect(componente.mensajeError()).toContain('ya no está disponible');
  });

  it('un fallo del selector se informa y permite reintentar', async () => {
    const api = apiMock({
      empresasPublicas: vi.fn(() =>
        throwError(() => new HttpErrorResponse({ status: 503 })),
      ),
    });
    await setup(api);

    expect(componente.empresas()).toEqual([]);
    expect(componente.errorEmpresas()).toContain('No pudimos cargar las empresas');

    completarFormulario();
    componente.onSubmit();
    expect(api.login).not.toHaveBeenCalled();

    componente.cargarEmpresas();
    expect(api.empresasPublicas).toHaveBeenCalledTimes(2);
  });

});
