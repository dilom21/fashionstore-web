import { HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';

import { SaasRutaLegacyBloqueadaError } from '../interceptors/saas.interceptor';
import { normalizarError, SaasErrorService } from './saas-error.service';

/** Construye un error HTTP con cuerpo y cabeceras arbitrarias. */
function errorHttp(
  status: number,
  error: unknown,
  headers?: Record<string, string>,
): HttpErrorResponse {
  return new HttpErrorResponse({
    status,
    error,
    headers: headers ? new HttpHeaders(headers) : undefined,
  });
}

describe('SaasErrorService', () => {
  let servicio: SaasErrorService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    servicio = TestBed.inject(SaasErrorService);
  });

  it('sin red (status 0) informa que no hubo conexión', () => {
    expect(servicio.mensajeDeError(errorHttp(0, null))).toBe(
      'No pudimos conectarnos con el servicio.',
    );
  });

  it('401 pide volver a iniciar sesión', () => {
    expect(servicio.mensajeDeError(errorHttp(401, { detail: 'x' }))).toBe(
      'Tu sesión expiró o no es válida. Vuelve a iniciar sesión.',
    );
  });

  it('403 usa el detail del backend', () => {
    expect(
      servicio.mensajeDeError(
        errorHttp(403, { detail: 'Tu membresía no está vigente' }),
      ),
    ).toBe('Tu membresía no está vigente');
  });

  it('403 sin detail usa el mensaje por defecto', () => {
    expect(servicio.mensajeDeError(errorHttp(403, {}))).toBe(
      'No tienes permiso para esta acción.',
    );
  });

  it('404 usa el detail o el mensaje de recurso inexistente', () => {
    expect(servicio.mensajeDeError(errorHttp(404, {}))).toBe(
      'El recurso no existe en esta empresa.',
    );
    expect(
      servicio.mensajeDeError(errorHttp(404, { detail: 'Sucursal no encontrada' })),
    ).toBe('Sucursal no encontrada');
  });

  it('409 conserva el detail de conflicto', () => {
    expect(
      servicio.mensajeDeError(
        errorHttp(409, { detail: 'El plan no permite más sucursales' }),
      ),
    ).toBe('El plan no permite más sucursales');
  });

  it('422 concatena los mensajes de la lista y traduce los campos', () => {
    const error = errorHttp(422, {
      detail: [
        {
          type: 'extra_forbidden',
          loc: ['body', 'rol'],
          msg: 'Extra inputs are not permitted',
          input: 'ADMIN',
        },
        {
          type: 'missing',
          loc: ['body', 'correo'],
          msg: 'Field required',
        },
        {
          type: 'string_too_short',
          loc: ['body', 'password'],
          msg: 'String should have at least 8 characters',
          input: 'secreto',
        },
      ],
    });

    const resultado = normalizarError(error);

    expect(resultado.estado).toBe(422);
    expect(resultado.esValidacion).toBe(true);
    expect(resultado.mensaje).toContain(
      'El campo «rol» no está permitido en esta solicitud.',
    );
    expect(resultado.mensaje).toContain(
      'El campo «correo electrónico» es obligatorio.',
    );
    expect(resultado.mensaje).toContain(
      '«contraseña»: String should have at least 8 characters.',
    );
    expect(resultado.campos).toEqual(['rol', 'correo', 'password']);
    // Nunca se filtra el valor enviado (puede ser una contraseña).
    expect(resultado.mensaje).not.toContain('secreto');
    expect(resultado.mensaje).not.toContain('ADMIN');
  });

  it('429 usa Retry-After para indicar los segundos', () => {
    expect(
      servicio.mensajeDeError(
        errorHttp(429, { detail: 'Too many requests' }, { 'Retry-After': '12' }),
      ),
    ).toBe('Demasiadas solicitudes. Intenta en 12 segundos.');
  });

  it('429 sin Retry-After ofrece un mensaje genérico', () => {
    expect(servicio.mensajeDeError(errorHttp(429, {}))).toBe(
      'Demasiadas solicitudes. Intenta de nuevo en unos segundos.',
    );
  });

  it('429 con Retry-After HTTP-date no inventa segundos', () => {
    expect(
      servicio.mensajeDeError(
        errorHttp(429, {}, { 'Retry-After': 'Wed, 21 Oct 2026 07:28:00 GMT' }),
      ),
    ).toBe('Demasiadas solicitudes. Intenta de nuevo en unos segundos.');
  });

  it('503 indica módulo no habilitado o ruta no migrada', () => {
    expect(servicio.mensajeDeError(errorHttp(503, {}))).toBe(
      'Módulo no habilitado en esta versión o ruta no migrada.',
    );
  });

  it('traduce la ruta legacy bloqueada por el interceptor', () => {
    expect(
      servicio.mensajeDeError(new SaasRutaLegacyBloqueadaError('/ventas')),
    ).toBe('Ruta no disponible en modo SaaS.');
  });

  it('un error desconocido no rompe la UI', () => {
    expect(servicio.mensajeDeError(new Error('boom'))).toBe(
      'Ocurrió un error inesperado. Inténtalo nuevamente en unos momentos.',
    );
    expect(servicio.mensajeDeError(undefined)).toBe(
      'Ocurrió un error inesperado. Inténtalo nuevamente en unos momentos.',
    );
  });

  it('el contexto se añade solo al detalle de diagnóstico', () => {
    const resultado = normalizarError(
      errorHttp(409, { detail: 'Límite de plan' }),
      'sucursales',
    );

    expect(resultado.mensaje).toBe('Límite de plan');
    expect(resultado.detalle).toBe('[sucursales] Límite de plan');
  });
});
