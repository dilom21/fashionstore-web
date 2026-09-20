import { HttpErrorResponse } from '@angular/common/http';

import { traducirErrorVentaDigital } from './venta-digital-error.util';

function errorHttp(status: number, detail?: string): HttpErrorResponse {
  return new HttpErrorResponse({
    status,
    statusText: 'error',
    error: detail !== undefined ? { detail } : null,
  });
}

describe('traducirErrorVentaDigital (CU19)', () => {
  it('401 marca la sesión como expirada', () => {
    const resultado = traducirErrorVentaDigital(errorHttp(401));
    expect(resultado.sesionExpirada).toBe(true);
    expect(resultado.mensaje.toLowerCase()).toContain('sesión');
  });

  it('403 informa que no puede comprar el carrito, sin cerrar sesión', () => {
    const resultado = traducirErrorVentaDigital(errorHttp(403));
    expect(resultado.sesionExpirada).toBe(false);
    expect(resultado.mensaje.toLowerCase()).toContain('carrito');
    expect(resultado.mensaje).not.toMatch(/select|sql|traceback|postgres/i);
  });

  it('404 sugiere volver al carrito', () => {
    const resultado = traducirErrorVentaDigital(errorHttp(404));
    expect(resultado.volverAlCarrito).toBe(true);
    expect(resultado.yaPreparada).toBe(false);
  });

  it('409 con stock insuficiente pide revisar el carrito', () => {
    const resultado = traducirErrorVentaDigital(
      errorHttp(409, 'Stock insuficiente para completar la compra'),
    );
    expect(resultado.volverAlCarrito).toBe(true);
    expect(resultado.mensaje.toLowerCase()).toContain('stock');
  });

  it('409 con carrito ya convertido indica que la compra ya fue preparada', () => {
    const resultado = traducirErrorVentaDigital(
      errorHttp(409, 'El carrito ya fue convertido en una venta'),
    );
    expect(resultado.yaPreparada).toBe(true);
    expect(resultado.mensaje.toLowerCase()).toContain('preparada');
  });

  it('409 con carrito no activo lo informa y permite volver', () => {
    const resultado = traducirErrorVentaDigital(
      errorHttp(409, 'El carrito no esta activo para comprar'),
    );
    expect(resultado.volverAlCarrito).toBe(true);
    expect(resultado.mensaje.toLowerCase()).toContain('activo');
  });

  it('422 apunta a datos de compra inválidos', () => {
    const resultado = traducirErrorVentaDigital(errorHttp(422));
    expect(resultado.sesionExpirada).toBe(false);
    expect(resultado.mensaje.toLowerCase()).toContain('válidos');
  });

  it('errores de red, 5xx y desconocidos devuelven un mensaje amigable', () => {
    expect(
      traducirErrorVentaDigital(errorHttp(0)).mensaje.length,
    ).toBeGreaterThan(10);
    expect(
      traducirErrorVentaDigital(errorHttp(500)).mensaje.length,
    ).toBeGreaterThan(10);
    expect(
      traducirErrorVentaDigital(new Error('boom')).mensaje.length,
    ).toBeGreaterThan(10);
  });

  it('nunca filtra texto técnico del backend', () => {
    const resultado = traducirErrorVentaDigital(
      errorHttp(409, 'violates check constraint venta_estado_check'),
    );
    expect(resultado.mensaje).not.toMatch(
      /constraint|venta_estado_check|select|sql/i,
    );
  });
});
