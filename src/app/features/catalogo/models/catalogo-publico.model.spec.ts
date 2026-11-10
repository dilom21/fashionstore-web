import {
  normalizarDetallePublicoLegacy,
  normalizarDetallePublicoSaas,
  normalizarDisponibilidadFila,
  normalizarDisponibilidadLegacy,
  normalizarPrecioDecimal,
  normalizarProductoPublicoLegacy,
  normalizarProductoPublicoSaas,
  normalizarVarianteLegacy,
  normalizarVarianteSaas,
} from './catalogo-publico.model';

describe('normalizarPrecioDecimal', () => {
  it('acepta número y string decimal', () => {
    expect(normalizarPrecioDecimal(149.9)).toBe(149.9);
    expect(normalizarPrecioDecimal('149.9')).toBe(149.9);
    expect(normalizarPrecioDecimal('899.9')).toBe(899.9);
  });

  it('devuelve 0 ante valores inválidos o ausentes', () => {
    expect(normalizarPrecioDecimal(undefined)).toBe(0);
    expect(normalizarPrecioDecimal(null)).toBe(0);
    expect(normalizarPrecioDecimal('no es precio')).toBe(0);
  });
});

describe('normalizarProductoPublicoSaas', () => {
  it('mapea el contrato real del listado SaaS (precios como string)', () => {
    const resultado = normalizarProductoPublicoSaas({
      id: 1,
      nombre: 'Polo Premium Piqué',
      descripcion: null,
      precio: '149.9',
      categoria: { id: 3, nombre: 'Polos' },
      imagen_principal_url: null,
      promociones_vigentes: [],
      precio_definitivo: '149.9',
      precio_calculo_pendiente: false,
    });

    expect(resultado).toEqual({
      id: 1,
      nombre: 'Polo Premium Piqué',
      descripcion: null,
      categoria: { id: 3, nombre: 'Polos' },
      imagen_principal_url: null,
      precio: 149.9,
      precio_definitivo: 149.9,
      precio_calculo_pendiente: false,
    });
  });

  it('no inventa estado ni categoria_id (usa categoria.id)', () => {
    const resultado = normalizarProductoPublicoSaas({
      id: 2,
      nombre: 'X',
      descripcion: null,
      precio: '10',
      categoria: { id: 9, nombre: 'Trajes' },
      imagen_principal_url: null,
      precio_definitivo: '10',
      precio_calculo_pendiente: false,
    });
    expect(resultado.categoria.id).toBe(9);
    expect('estado' in resultado).toBe(false);
    expect('categoria_id' in resultado).toBe(false);
  });

  it('respeta precio_calculo_pendiente: no presenta el promocional como definitivo', () => {
    const resultado = normalizarProductoPublicoSaas({
      id: 3,
      nombre: 'X',
      precio: '100',
      categoria: { id: 1, nombre: 'Camisas' },
      precio_definitivo: '80',
      precio_calculo_pendiente: true,
    });
    expect(resultado.precio).toBe(100);
    expect(resultado.precio_definitivo).toBe(100);
    expect(resultado.precio_calculo_pendiente).toBe(true);
  });

  it('aplica el precio definitivo cuando no está pendiente', () => {
    const resultado = normalizarProductoPublicoSaas({
      id: 4,
      nombre: 'X',
      precio: '100',
      categoria: { id: 1, nombre: 'Camisas' },
      precio_definitivo: '80',
      precio_calculo_pendiente: false,
    });
    expect(resultado.precio_definitivo).toBe(80);
  });
});

describe('normalizarProductoPublicoLegacy', () => {
  it('mapea el contrato legacy (precio número, estado/categoria_id presentes)', () => {
    const resultado = normalizarProductoPublicoLegacy({
      id: 7,
      nombre: 'Polo',
      descripcion: 'd',
      precio: 149.9,
      estado: true,
      categoria_id: 3,
      categoria: { id: 3, nombre: 'Polos' },
      imagen_principal_url: 'https://cdn/x.jpg',
    });
    expect(resultado.precio).toBe(149.9);
    expect(resultado.precio_definitivo).toBe(149.9);
    expect(resultado.precio_calculo_pendiente).toBe(false);
    expect(resultado.categoria.id).toBe(3);
  });
});

describe('normalizarDetallePublicoSaas', () => {
  it('mapea variantes, disponibilidad y recursos del detalle SaaS', () => {
    const resultado = normalizarDetallePublicoSaas({
      id: 1,
      nombre: 'Polo',
      descripcion: null,
      precio: '149.9',
      categoria: { id: 3, nombre: 'Polos' },
      imagen_principal_url: null,
      precio_definitivo: '149.9',
      precio_calculo_pendiente: false,
      variantes: [
        {
          id: 11,
          sku: 'POL-M',
          estado: true,
          talla: { id: 3, nombre: 'M' },
          color: { id: 1, nombre: 'Negro' },
        },
      ],
      disponibilidad: [
        {
          variante_id: 11,
          sucursal_id: 1,
          sucursal: 'Sucursal Centro',
          sku: 'POL-M',
          talla: 'M',
          color: 'Negro',
          temporada: 'Primavera-Verano 2026',
          stock_disponible: 12,
        },
      ],
      recursos: [
        { id: 73, tipo: 'IMAGEN', url: 'https://cdn/x.webp', es_principal: true },
      ],
    });

    expect(resultado.variantes.length).toBe(1);
    expect(resultado.variantes[0].talla).toEqual({ id: 3, nombre: 'M' });
    expect(resultado.variantes[0].estado).toBe(true);
    expect(resultado.variantes[0].inventarios).toBeUndefined();
    expect(resultado.disponibilidad.length).toBe(1);
    expect(resultado.disponibilidad[0].stock_disponible).toBe(12);
    expect(resultado.recursos[0].es_principal).toBe(true);
  });
});

describe('normalizarDetallePublicoLegacy', () => {
  it('conserva inventarios de variantes y deja disponibilidad vacía', () => {
    const variante = normalizarVarianteLegacy({
      id: 11,
      sku: 'POL-M',
      estado: true,
      talla: { id: 3, nombre: 'M' },
      color: { id: 1, nombre: 'Negro' },
      inventarios: [
        {
          id: 55,
          stock_disponible: 4,
          sucursal: { id: 1, nombre: 'Centro' },
        },
      ],
    });

    expect(variante.inventarios?.[0]).toEqual({
      id: 55,
      stock_disponible: 4,
      sucursal: { id: 1, nombre: 'Centro' },
    });

    const detalle = normalizarDetallePublicoLegacy({
      id: 1,
      nombre: 'Polo',
      precio: 149.9,
      estado: true,
      categoria_id: 3,
      categoria: { id: 3, nombre: 'Polos' },
      imagen_principal_url: null,
      variantes: [
        {
          id: 11,
          sku: 'POL-M',
          estado: true,
          talla: { id: 3, nombre: 'M' },
          color: { id: 1, nombre: 'Negro' },
          inventarios: [],
        },
      ],
      recursos: [],
    });

    expect(detalle.variantes[0].inventarios).toEqual([]);
    expect(detalle.disponibilidad).toEqual([]);
  });
});

describe('normalizarDisponibilidadFila / normalizarDisponibilidadLegacy', () => {
  it('normaliza una fila SaaS plana', () => {
    const fila = normalizarDisponibilidadFila({
      variante_id: 11,
      sucursal_id: 1,
      sucursal: 'Centro',
      sku: 'POL-M',
      talla: 'M',
      color: 'Negro',
      temporada: 'PV26',
      stock_disponible: 12,
    });
    expect(fila.stock_disponible).toBe(12);
    expect(fila.sucursal).toBe('Centro');
  });

  it('aplana la disponibilidad legacy (sucursales[].variantes[]) a filas', () => {
    const filas = normalizarDisponibilidadLegacy({
      sucursales: [
        {
          sucursal_id: 1,
          sucursal: 'Centro',
          variantes: [
            {
              variante_id: 11,
              sku: 'POL-M',
              talla: 'M',
              color: 'Negro',
              temporada: 'PV26',
              stock_disponible: 3,
            },
          ],
        },
      ],
    });
    expect(filas).toEqual([
      {
        variante_id: 11,
        sucursal_id: 1,
        sucursal: 'Centro',
        sku: 'POL-M',
        talla: 'M',
        color: 'Negro',
        temporada: 'PV26',
        stock_disponible: 3,
      },
    ]);
  });
});

describe('normalizarVarianteSaas', () => {
  it('no inventa inventarios en la variante SaaS', () => {
    const variante = normalizarVarianteSaas({
      id: 11,
      sku: 'POL-M',
      estado: true,
      talla: { id: 3, nombre: 'M' },
      color: { id: 1, nombre: 'Negro' },
    });
    expect(variante.inventarios).toBeUndefined();
    expect(variante.estado).toBe(true);
  });
});
