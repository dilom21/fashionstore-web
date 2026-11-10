/**
 * Persistencia mínima (sessionStorage) del `venta_id` creado por el checkout.
 *
 * SOLO es una PISTA para retomar un checkout tras recargar la página. Nunca se
 * usa como autorización: la venta se verifica siempre contra el backend con un
 * endpoint autorizado del cliente (`GET /pagos/stripe/ventas/{id}/estado`, que
 * comprueba la propiedad desde el JWT). Si la verificación falla, el registro
 * se descarta.
 *
 * SSR-safe: las funciones no rompen cuando `sessionStorage` no existe.
 */

const CLAVE = 'fashionstore_checkout_ventas_pendientes';

type MapaVentas = Record<string, number>;

function leerMapa(): MapaVentas {
  if (typeof sessionStorage === 'undefined') {
    return {};
  }
  try {
    const crudo = sessionStorage.getItem(CLAVE);
    if (crudo === null) {
      return {};
    }
    const dato: unknown = JSON.parse(crudo);
    if (dato === null || typeof dato !== 'object') {
      return {};
    }
    const mapa: MapaVentas = {};
    for (const [clave, valor] of Object.entries(
      dato as Record<string, unknown>,
    )) {
      const carrito = Number(clave);
      const venta = Number(valor);
      if (
        Number.isInteger(carrito) &&
        carrito > 0 &&
        Number.isInteger(venta) &&
        venta > 0
      ) {
        mapa[String(carrito)] = venta;
      }
    }
    return mapa;
  } catch {
    return {};
  }
}

function escribirMapa(mapa: MapaVentas): void {
  if (typeof sessionStorage === 'undefined') {
    return;
  }
  try {
    sessionStorage.setItem(CLAVE, JSON.stringify(mapa));
  } catch {
    // Almacenamiento no disponible: la recuperación simplemente no persiste.
  }
}

/** Guarda la venta creada para un carrito (pista, no autorización). */
export function guardarVentaPendiente(
  carritoId: number,
  ventaId: number,
): void {
  if (
    !Number.isInteger(carritoId) ||
    carritoId <= 0 ||
    !Number.isInteger(ventaId) ||
    ventaId <= 0
  ) {
    return;
  }
  const mapa = leerMapa();
  mapa[String(carritoId)] = ventaId;
  escribirMapa(mapa);
}

/** `venta_id` recordado para un carrito, o null si no existe. */
export function obtenerVentaPendiente(carritoId: number): number | null {
  if (!Number.isInteger(carritoId) || carritoId <= 0) {
    return null;
  }
  const venta = leerMapa()[String(carritoId)];
  return venta !== undefined && Number.isInteger(venta) ? venta : null;
}

/** Descarta la pista de un carrito (venta inexistente, ajena o ya cerrada). */
export function limpiarVentaPendiente(carritoId: number): void {
  const mapa = leerMapa();
  const clave = String(carritoId);
  if (mapa[clave] === undefined) {
    return;
  }
  delete mapa[clave];
  escribirMapa(mapa);
}
