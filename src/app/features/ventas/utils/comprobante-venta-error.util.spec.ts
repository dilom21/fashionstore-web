import { HttpErrorResponse } from '@angular/common/http';

import { traducirErrorComprobante } from './comprobante-venta-error.util';

describe('traducirErrorComprobante (CU23)', () => {
  it('401 pide iniciar sesión y no ofrece reintentar', () => {
    const error = traducirErrorComprobante(
      new HttpErrorResponse({ status: 401 }),
    );

    expect(error.sesionExpirada).toBe(true);
    expect(error.mensaje).toContain('sesión expiró');
    expect(error.puedeReintentar).toBe(false);
  });

  it('403 muestra autorización controlada (nunca el error HTTP crudo)', () => {
    const error = traducirErrorComprobante(
      new HttpErrorResponse({ status: 403 }),
    );

    expect(error.sinPermiso).toBe(true);
    expect(error.mensaje).toBe(
      'No tienes autorización para consultar este comprobante.',
    );
    expect(error.mensaje).not.toContain('403');
  });

  it('404 informa que la venta no existe', () => {
    const error = traducirErrorComprobante(
      new HttpErrorResponse({ status: 404 }),
    );

    expect(error.noEncontrada).toBe(true);
    expect(error.mensaje).toBe('Venta no encontrada.');
  });

  it('409 informa que el comprobante aún no está disponible', () => {
    const error = traducirErrorComprobante(
      new HttpErrorResponse({
        status: 409,
        error: { detail: 'La venta aun no esta COMPLETADA' },
      }),
    );

    expect(error.noDisponible).toBe(true);
    expect(error.mensaje).toBe(
      'El comprobante aún no está disponible para esta venta.',
    );
    expect(error.mensaje).not.toContain('COMPLETADA');
  });

  it('error de red (status 0) ofrece reintentar', () => {
    const error = traducirErrorComprobante(
      new HttpErrorResponse({ status: 0 }),
    );

    expect(error.esRed).toBe(true);
    expect(error.puedeReintentar).toBe(true);
    expect(error.mensaje).toBe(
      'No pudimos cargar el comprobante. Intenta nuevamente.',
    );
  });

  it('5xx muestra un mensaje controlado con reintento', () => {
    for (const status of [500, 503]) {
      const error = traducirErrorComprobante(new HttpErrorResponse({ status }));
      expect(error.esRed).toBe(true);
      expect(error.puedeReintentar).toBe(true);
      expect(error.mensaje).toBe(
        'No pudimos cargar el comprobante. Intenta nuevamente.',
      );
    }
  });

  it('un error no HTTP (venta_id inválido) no rompe la vista', () => {
    const error = traducirErrorComprobante(new Error('boom'));

    expect(error.esRed).toBe(true);
    expect(error.puedeReintentar).toBe(true);
    expect(error.mensaje).not.toContain('boom');
  });
});
