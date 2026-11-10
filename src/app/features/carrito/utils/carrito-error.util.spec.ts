import { HttpErrorResponse } from '@angular/common/http';

import { traducirErrorCarrito } from './carrito-error.util';

function error(status: number, detail?: string): HttpErrorResponse {
  return new HttpErrorResponse({
    status,
    error: detail === undefined ? null : { detail },
    statusText: 'Error',
  });
}

describe('traducirErrorCarrito', () => {
  it('401 marca la sesión como expirada', () => {
    const traducido = traducirErrorCarrito(error(401));
    expect(traducido.sesionExpirada).toBe(true);
    expect(traducido.mensaje).toContain('sesión');
  });

  it('403 indica falta de permisos', () => {
    const traducido = traducirErrorCarrito(error(403));
    expect(traducido.sesionExpirada).toBe(false);
    expect(traducido.mensaje.toLowerCase()).toContain('permisos');
  });

  it('404 conserva el detalle del backend (p. ej. inventario no disponible)', () => {
    const traducido = traducirErrorCarrito(
      error(404, 'Inventario no disponible'),
    );
    expect(traducido.mensaje).toBe('Inventario no disponible');
    expect(traducido.detalleOriginal).toBe('Inventario no disponible');
  });

  it('409 conserva el motivo real (stock insuficiente / ambigüedad)', () => {
    expect(traducirErrorCarrito(error(409, 'Stock insuficiente')).mensaje).toBe(
      'Stock insuficiente',
    );
    expect(
      traducirErrorCarrito(error(409, 'Seleccion de inventario ambigua'))
        .mensaje,
    ).toBe('Seleccion de inventario ambigua');
  });

  it('409 sin detalle usa el mensaje de stock por defecto', () => {
    expect(traducirErrorCarrito(error(409)).mensaje).toContain('stock');
  });

  it('422 usa el detalle de validación de FastAPI', () => {
    const traducido = traducirErrorCarrito(error(422, 'Cantidad invalida'));
    expect(traducido.mensaje).toBe('Cantidad invalida');
  });

  it('503 informa que el servicio no está disponible', () => {
    const traducido = traducirErrorCarrito(error(503));
    expect(traducido.mensaje).toContain('no está disponible');
    expect(traducido.sesionExpirada).toBe(false);
  });

  it('errores >= 500 usan un mensaje de servicio no disponible', () => {
    expect(traducirErrorCarrito(error(500)).mensaje).toContain(
      'no está disponible',
    );
  });

  it('status 0 indica problema de conexión', () => {
    expect(traducirErrorCarrito(error(0)).mensaje).toContain('conectar');
  });
});
