import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';

import { environment } from '../../../../environments/environment';
import { TenantLoginResponse } from '../../models/tenant.models';
import { SaasPermissionsService } from '../../services/saas-permissions.service';
import { SaasSessionService } from '../../services/saas-session.service';
import {
  MENSAJE_CREDENCIALES_INVALIDAS,
  SaasLoginPage,
} from './saas-login.page';

const URL_LOGIN = `${environment.apiUrl.replace(/\/+$/, '')}/auth/tenant/login`;

const LOGIN_OK: TenantLoginResponse = {
  access_token: 'jwt-de-prueba',
  token_type: 'bearer',
  empresa_id: 1,
  empresa_slug: 'empresa-a',
  empresa_nombre: 'Empresa Ficticia',
  rol: 'ADMINISTRADOR',
  contexto: 'personal',
};

describe('SaasLoginPage', () => {
  let fixture: ComponentFixture<SaasLoginPage>;
  let componente: SaasLoginPage;
  let http: HttpTestingController;
  let navegar: ReturnType<typeof vi.fn>;
  let guardarSesion: ReturnType<typeof vi.fn>;
  let limpiarPermisos: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    guardarSesion = vi.fn();
    limpiarPermisos = vi.fn();

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        // Router real (RouterLink lo necesita) con `navigateByUrl` espiado.
        provideRouter([]),
        {
          provide: SaasSessionService,
          useValue: {
            limpiarExpirada: vi.fn(),
            empresaSlugRecordado: () => null,
            correoRecordado: () => null,
            guardarSesion,
          },
        },
        { provide: SaasPermissionsService, useValue: { limpiar: limpiarPermisos } },
      ],
    });

    navegar = vi
      .spyOn(TestBed.inject(Router), 'navigateByUrl')
      .mockResolvedValue(true);

    fixture = TestBed.createComponent(SaasLoginPage);
    componente = fixture.componentInstance;
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
  });

  /** Rellena el formulario con datos válidos del contrato. */
  function rellenar(password = 'clave-ficticia'): void {
    componente.form.setValue({
      empresa_slug: 'empresa-a',
      correo: 'admin@staging.invalid',
      password,
      contexto: 'personal',
    });
  }

  it('envía exactamente los cuatro campos del contrato', () => {
    rellenar();
    componente.onSubmit();

    const peticion = http.expectOne(URL_LOGIN);
    expect(peticion.request.method).toBe('POST');
    expect(peticion.request.body).toEqual({
      correo: 'admin@staging.invalid',
      password: 'clave-ficticia',
      empresa_slug: 'empresa-a',
      contexto: 'personal',
    });
    peticion.flush(LOGIN_OK);
  });

  it('un 401 muestra credenciales/empresa incorrectas, no sesión expirada', () => {
    rellenar('clave-equivocada');
    componente.onSubmit();

    http.expectOne(URL_LOGIN).flush(
      { detail: 'Credenciales invalidas o empresa no autorizada' },
      { status: 401, statusText: 'Unauthorized' },
    );
    fixture.detectChanges();

    expect(componente.mensajeError()).toBe(MENSAJE_CREDENCIALES_INVALIDAS);
    expect(componente.mensajeError()).not.toContain('sesión expiró');
    expect(navegar).not.toHaveBeenCalled();
    expect(guardarSesion).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain(
      'Correo, contraseña o empresa incorrectos.',
    );
    expect(fixture.nativeElement.querySelector('.login__error')?.getAttribute('role')).toBe(
      'alert',
    );
  });

  it('un 503 conserva el mensaje del traductor de errores', () => {
    rellenar();
    componente.onSubmit();

    http
      .expectOne(URL_LOGIN)
      .flush(
        { detail: 'El esquema de autenticacion SaaS no esta disponible' },
        { status: 503, statusText: 'Service Unavailable' },
      );
    fixture.detectChanges();

    expect(componente.mensajeError()).toBe(
      'Módulo no habilitado en esta versión o ruta no migrada.',
    );
    expect(navegar).not.toHaveBeenCalled();
  });

  it('con login correcto guarda la sesión y navega a /saas/inicio', () => {
    rellenar();
    componente.onSubmit();

    http.expectOne(URL_LOGIN).flush(LOGIN_OK);
    fixture.detectChanges();

    expect(guardarSesion).toHaveBeenCalledWith(LOGIN_OK, 'admin@staging.invalid');
    expect(limpiarPermisos).toHaveBeenCalled();
    expect(navegar).toHaveBeenCalledWith('/saas/inicio', { replaceUrl: true });
    expect(componente.mensajeError()).toBeNull();
  });

  it('el formulario inválido no envía ninguna petición', () => {
    componente.form.setValue({
      empresa_slug: 'Empresa A',
      correo: 'no-es-correo',
      password: '',
      contexto: 'personal',
    });
    componente.onSubmit();
    fixture.detectChanges();

    http.expectNone(URL_LOGIN);
    expect(componente.mensajeError()).toBeNull();
    expect(fixture.nativeElement.textContent).toContain(
      'El slug solo admite minúsculas, números y guiones',
    );
  });
});
