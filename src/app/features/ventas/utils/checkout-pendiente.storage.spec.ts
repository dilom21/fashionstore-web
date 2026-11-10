import {
  guardarVentaPendiente,
  limpiarVentaPendiente,
  obtenerVentaPendiente,
} from './checkout-pendiente.storage';

const CLAVE = 'fashionstore_checkout_ventas_pendientes';

describe('checkout-pendiente.storage', () => {
  beforeEach(() => sessionStorage.clear());

  it('guarda y recupera la venta asociada a un carrito', () => {
    guardarVentaPendiente(1333, 694);

    expect(obtenerVentaPendiente(1333)).toBe(694);
    expect(obtenerVentaPendiente(9999)).toBeNull();
  });

  it('permite varias ventas y limpia solo la indicada', () => {
    guardarVentaPendiente(1333, 694);
    guardarVentaPendiente(1334, 695);

    limpiarVentaPendiente(1333);

    expect(obtenerVentaPendiente(1333)).toBeNull();
    expect(obtenerVentaPendiente(1334)).toBe(695);
  });

  it('ignora identificadores inválidos sin escribir nada', () => {
    guardarVentaPendiente(0, 694);
    guardarVentaPendiente(-1, 694);
    guardarVentaPendiente(1.5, 694);
    guardarVentaPendiente(1333, 0);
    guardarVentaPendiente(1333, Number.NaN);

    expect(obtenerVentaPendiente(0)).toBeNull();
    expect(obtenerVentaPendiente(1333)).toBeNull();
    expect(sessionStorage.getItem(CLAVE)).toBeNull();
  });

  it('descarta entradas corruptas o con valores no válidos', () => {
    sessionStorage.setItem(
      CLAVE,
      JSON.stringify({ '1333': 694, abc: 1, '4': 'x', '5': -2 }),
    );

    expect(obtenerVentaPendiente(1333)).toBe(694);
    expect(obtenerVentaPendiente(5)).toBeNull();
  });

  it('no falla con JSON corrupto y permite volver a guardar', () => {
    sessionStorage.setItem(CLAVE, '{no-json');

    expect(obtenerVentaPendiente(1333)).toBeNull();

    guardarVentaPendiente(1333, 694);
    expect(obtenerVentaPendiente(1333)).toBe(694);
  });

  it('es seguro cuando sessionStorage no está disponible (SSR)', () => {
    vi.stubGlobal('sessionStorage', undefined);

    try {
      expect(() => guardarVentaPendiente(1333, 694)).not.toThrow();
      expect(obtenerVentaPendiente(1333)).toBeNull();
      expect(() => limpiarVentaPendiente(1333)).not.toThrow();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
