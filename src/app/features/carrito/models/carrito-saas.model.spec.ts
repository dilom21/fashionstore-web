import {
  normalizarDetalleSaas,
  normalizarListaSaas,
  normalizarResumenSaas,
  normalizarItemSaas,
} from './carrito-saas.model';

describe('normalizadores del carrito SaaS', () => {
  it('normaliza un resumen con subtotal Decimal (string)', () => {
    const resumen = normalizarResumenSaas({
      carrito_id: 10,
      sucursal_id: 1,
      sucursal_nombre: 'Sucursal Centro',
      cantidad_lineas: 2,
      cantidad_unidades: 3,
      subtotal: '299.80',
      fecha_actualizacion: '2026-11-09T10:00:00Z',
    });

    expect(resumen.subtotal).toBe(299.8);
    expect(resumen.cantidad_unidades).toBe(3);
  });

  it('normaliza la lista asegurando items y total', () => {
    const lista = normalizarListaSaas({
      items: [
        {
          carrito_id: 10,
          sucursal_id: 1,
          sucursal_nombre: 'Centro',
          cantidad_lineas: 1,
          cantidad_unidades: 2,
          subtotal: '100.00',
          fecha_actualizacion: 'x',
        },
      ],
      total_carritos_activos: 1,
    });
    expect(lista.items).toHaveLength(1);
    expect(lista.items[0].subtotal).toBe(100);
    expect(lista.total_carritos_activos).toBe(1);
  });

  it('normaliza una línea SaaS con imagen_principal_url y precios string', () => {
    const item = normalizarItemSaas({
      detalle_id: 38,
      inventario_id: 150,
      producto_id: 1,
      producto_nombre: 'Polo',
      precio_unitario: '149.90',
      imagen_principal_url: 'https://cdn.example.com/polo.webp',
      variante_producto_id: 25,
      sku: 'POL-M',
      talla_id: 3,
      talla_nombre: 'M',
      color_id: 1,
      color_nombre: 'Negro',
      temporada_id: 4,
      temporada_nombre: 'PV26',
      cantidad: 2,
      stock_disponible: 10,
      subtotal_linea: '299.80',
    });

    expect(item.precio_unitario).toBe(149.9);
    expect(item.subtotal_linea).toBe(299.8);
    expect(item.variante_producto_id).toBe(25);
    expect(item.temporada_id).toBe(4);
    // La API SaaS entrega `imagen_principal_url`; se conserva sin inventar URLs.
    expect(item.imagen_principal).toBe('https://cdn.example.com/polo.webp');
  });

  it('mantiene null cuando la imagen principal no existe', () => {
    const item = normalizarItemSaas({
      detalle_id: 38,
      producto_nombre: 'Polo',
      imagen_principal_url: null,
    });
    expect(item.imagen_principal).toBeNull();
  });

  it('normaliza el detalle SaaS completo', () => {
    const detalle = normalizarDetalleSaas({
      carrito_id: 10,
      sucursal_id: 1,
      sucursal_nombre: 'Centro',
      estado: 'ACTIVO',
      fecha_creacion: '2026-11-09T09:00:00Z',
      fecha_actualizacion: '2026-11-09T10:00:00Z',
      items: [],
      cantidad_total_unidades: 0,
      subtotal_carrito: '0.00',
    });

    expect(detalle.estado).toBe('ACTIVO');
    expect(detalle.subtotal_carrito).toBe(0);
    expect(detalle.items).toEqual([]);
  });
});
