import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import {
  ActivatedRoute,
  Router,
  convertToParamMap,
  provideRouter,
} from '@angular/router';
import { of, throwError } from 'rxjs';

import { TenantApiService } from '../../../../saas/services/tenant-api.service';
import { RegistroCliente } from './registro-cliente';

const EMPRESAS = [
  { slug: 'vanter-men', nombre_comercial: 'Vanter Men' },
  { slug: 'otra-empresa', nombre_comercial: 'Otra Empresa' },
];

const RESPUESTA_REGISTRO = {
  mensaje: 'Cuenta creada correctamente. Inicie sesion para continuar.',
  usuario_id: 41,
  cliente_id: 22,
  empresa_slug: 'vanter-men',
  correo: 'nuevo@vanter.test',
  nombre: 'Ana',
  apellido: 'Pérez',
};

/** Clave del JWT SaaS: el registro NUNCA debe escribirla (no hay auto-login). */
const CLAVE_TENANT = 'fashionstore_saas_tenant_access_token';

function apiMock(overrides: Record<string, unknown> = {}): any {
  return {
    empresasPublicas: vi.fn(() => of(EMPRESAS)),
    registrarClienteTenant: vi.fn(() => of(RESPUESTA_REGISTRO)),
    ...overrides,
  };
}

describe('RegistroCliente', () => {
  it('habilita el botón cuando un campo común completa el formulario al final', async () => {
    await TestBed.configureTestingModule({
      imports: [RegistroCliente],
      providers: [
        provideRouter([]),
        {
          provide: TenantApiService,
          useValue: apiMock(),
        },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              queryParamMap: convertToParamMap({ empresa: 'vanter-men' }),
            },
          },
        },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(RegistroCliente);
    const componente = fixture.componentInstance;

    componente.form.patchValue({
      nombre: 'Harold',
      apellido: '',
      correo: 'harold@gmail.com',
      ci: '12458975',
      telefono: '56894256',
      sexo: 'MASCULINO',
      fecha_nacimiento: '2003-03-25',
      password: 'Segura123!',
      password_confirmacion: 'Segura123!',
    });

    expect(componente.puedeEnviar()).toBe(false);

    // Antes de la corrección, `form.valid` cambiaba pero el computed conservaba
    // el valor anterior porque el apellido no participaba como señal.
    componente.form.controls.apellido.setValue('Amador');
    fixture.detectChanges();

    const boton = fixture.nativeElement.querySelector(
      'button[type="submit"]',
    ) as HTMLButtonElement;
    expect(componente.form.valid).toBe(true);
    expect(componente.puedeEnviar()).toBe(true);
    expect(boton.disabled).toBe(false);
  });
});

/**
 * Segundo parcial: el registro consume `POST /auth/tenant/clientes/registro`
 * con la empresa FIJADA desde el login y no permite cambiarla.
 */
describe('RegistroCliente (empresa fijada desde el login)', () => {
  let fixture: ComponentFixture<RegistroCliente>;
  let componente: RegistroCliente;
  let router: Router;
  let api: any;

  async function setup(
    opciones: { api?: any; empresa?: string | null } = {},
  ): Promise<void> {
    api = opciones.api ?? apiMock();
    const parametros: Record<string, string> = {};
    if (opciones.empresa !== undefined && opciones.empresa !== null) {
      parametros['empresa'] = opciones.empresa;
    }

    await TestBed.configureTestingModule({
      imports: [RegistroCliente],
      providers: [
        provideRouter([]),
        { provide: TenantApiService, useValue: api },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: { queryParamMap: convertToParamMap(parametros) },
          },
        },
      ],
    }).compileComponents();

    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);
    vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);

    fixture = TestBed.createComponent(RegistroCliente);
    componente = fixture.componentInstance;
    fixture.detectChanges();
  }

  /** Formulario completo y válido (contraseña que cumple la política). */
  function completarFormulario(): void {
    componente.form.setValue({
      nombre: 'Ana',
      apellido: 'Pérez',
      correo: 'Nuevo@Vanter.test',
      ci: '12345678',
      telefono: '70000000',
      sexo: 'MASCULINO',
      fecha_nacimiento: '2000-01-01',
      password: 'Segura123!',
      password_confirmacion: 'Segura123!',
    });
  }

  beforeEach(() => {
    sessionStorage.clear();
  });

  afterEach(() => {
    sessionStorage.clear();
  });

  it('fija la empresa recibida y la muestra como solo lectura', async () => {
    await setup({ empresa: 'vanter-men' });

    expect(api.empresasPublicas).toHaveBeenCalledTimes(1);
    expect(componente.empresa()?.nombre_comercial).toBe('Vanter Men');
    expect(componente.empresaValida()).toBe(true);

    const contenido = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(contenido).toContain('Vanter Men');
    // La empresa no se puede cambiar dentro del registro.
    expect(
      (fixture.nativeElement as HTMLElement).querySelector(
        '.reg__empresa select',
      ),
    ).toBeNull();
  });

  it('sin empresa en la URL no permite enviar y pide elegirla en el login', async () => {
    await setup();

    expect(componente.empresa()).toBeNull();
    completarFormulario();
    expect(componente.puedeEnviar()).toBe(false);

    componente.onSubmit();

    expect(api.registrarClienteTenant).not.toHaveBeenCalled();
    expect(componente.mensajeError()).toContain('Selecciona una empresa');
  });

  it('rechaza una empresa que no aparece en la lista del backend', async () => {
    await setup({ empresa: 'empresa-fantasma' });

    expect(componente.empresa()).toBeNull();
    completarFormulario();
    componente.onSubmit();

    expect(api.registrarClienteTenant).not.toHaveBeenCalled();
    expect(componente.mensajeError()).toContain('ya no está disponible');
  });

  it('envía la empresa junto a los datos requeridos, sin rol ni contexto', async () => {
    await setup({ empresa: 'vanter-men' });
    completarFormulario();

    componente.onSubmit();

    expect(api.registrarClienteTenant).toHaveBeenCalledTimes(1);
    const enviado = api.registrarClienteTenant.mock.calls[0][0];
    expect(enviado.empresa_slug).toBe('vanter-men');
    expect(enviado.correo).toBe('nuevo@vanter.test');
    expect(enviado.nombre).toBe('Ana');
    expect(enviado.sexo).toBe('MASCULINO');
    expect(enviado.password_confirmacion).toBe('Segura123!');
    expect(enviado).not.toHaveProperty('rol');
    expect(enviado).not.toHaveProperty('contexto');
  });

  it('201: muestra la confirmación sin auto-login ni JWT', async () => {
    await setup({ empresa: 'vanter-men' });
    completarFormulario();

    componente.onSubmit();

    expect(componente.cuentaCreada()?.correo).toBe('nuevo@vanter.test');
    expect(sessionStorage.getItem(CLAVE_TENANT)).toBeNull();
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('volver al login conserva la empresa y el correo, nunca la contraseña', async () => {
    await setup({ empresa: 'vanter-men' });
    completarFormulario();
    componente.onSubmit();

    componente.irALogin();

    expect(router.navigate).toHaveBeenCalledWith(['/login'], {
      queryParams: {
        correo: 'nuevo@vanter.test',
        empresa: 'vanter-men',
      },
    });
    const llamada = (router.navigate as any).mock.calls[0];
    expect(llamada[1].queryParams).not.toHaveProperty('password');
  });


  it('409 con documento duplicado muestra el mensaje del documento', async () => {
    await setup({
      api: apiMock({
        registrarClienteTenant: vi.fn(() =>
          throwError(
            () =>
              new HttpErrorResponse({
                status: 409,
                error: { detail: 'Ya existe un cliente con este documento' },
              }),
          ),
        ),
      }),
      empresa: 'vanter-men',
    });
    completarFormulario();

    componente.onSubmit();

    expect(componente.mensajeError()).toContain('documento');
    expect(componente.cuentaCreada()).toBeNull();
  });

  it('409 sin detalle mantiene el mensaje de conflicto', async () => {
    await setup({
      api: apiMock({
        registrarClienteTenant: vi.fn(() =>
          throwError(() => new HttpErrorResponse({ status: 409 })),
        ),
      }),
      empresa: 'vanter-men',
    });
    completarFormulario();

    componente.onSubmit();

    expect(componente.mensajeError()).toContain('Ya existe una cuenta');
  });

  it('400 de política de contraseña se explica al usuario', async () => {
    await setup({
      api: apiMock({
        registrarClienteTenant: vi.fn(() =>
          throwError(
            () =>
              new HttpErrorResponse({
                status: 400,
                error: { detail: 'La contrasena debe cumplir la politica' },
              }),
          ),
        ),
      }),
      empresa: 'vanter-men',
    });
    completarFormulario();

    componente.onSubmit();

    expect(componente.mensajeError()).toContain('política');
  });

  it('422 informa que hay datos inválidos', async () => {
    await setup({
      api: apiMock({
        registrarClienteTenant: vi.fn(() =>
          throwError(() => new HttpErrorResponse({ status: 422 })),
        ),
      }),
      empresa: 'vanter-men',
    });
    completarFormulario();

    componente.onSubmit();

    expect(componente.mensajeError()).toContain('Revisa los datos ingresados');
  });

  it('404 indica que la empresa dejó de estar disponible', async () => {
    await setup({
      api: apiMock({
        registrarClienteTenant: vi.fn(() =>
          throwError(() => new HttpErrorResponse({ status: 404 })),
        ),
      }),
      empresa: 'vanter-men',
    });
    completarFormulario();

    componente.onSubmit();

    expect(componente.mensajeError()).toContain('ya no está disponible');
  });

  it('si falla la carga de empresas no se puede crear la cuenta', async () => {
    await setup({
      api: apiMock({
        empresasPublicas: vi.fn(() =>
          throwError(() => new HttpErrorResponse({ status: 503 })),
        ),
      }),
      empresa: 'vanter-men',
    });

    expect(componente.empresa()).toBeNull();
    expect(componente.errorEmpresas()).toContain(
      'No pudimos cargar las empresas',
    );

    completarFormulario();
    componente.onSubmit();

    expect(api.registrarClienteTenant).not.toHaveBeenCalled();
    expect(componente.mensajeError()).toContain('No pudimos cargar');
  });
});


