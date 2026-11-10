import {
  normalizarDetalleReservaSaas,
  normalizarListaReservaSaas,
  normalizarPrevalidacionSaas,
  normalizarReservaCreadaSaas,
  normalizarReservaEstadoSaas,
  normalizarResumenReservaSaas,
} from './reserva-saas.model';

describe('normalizadores de reservas SaaS', () => {
  it('normaliza la prevalidación SIN marcarla como reserva creada', () => {
    const pre = normalizarPrevalidacionSaas({
      carrito_id: 10,
      sucursal_id: 1,
      fecha_atencion: '2026-11-10T15:00:00Z',
      cantidad_lineas: 2,
      cantidad_unidades: 3,
      stock_verificado_preliminarmente: true,
      reserva_creada: false,
      requiere_verificacion_transaccional: true,
    });

    expect(pre.reserva_creada).toBe(false);
    expect(pre.stock_verificado_preliminarmente).toBe(true);
    expect(pre.requiere_verificacion_transaccional).toBe(true);
  });

  it('normaliza el listado paginado {items,total,limit,offset}', () => {
    const lista = normalizarListaReservaSaas({
      items: [
        {
          reserva_id: 5,
          carrito_id: null,
          sucursal_id: 2,
          sucursal_nombre: 'Centro',
          fecha_reserva: 'x',
          fecha_atencion: 'y',
          estado: 'PENDIENTE',
          observacion: null,
          cantidad_lineas: 1,
          cantidad_unidades: 2,
        },
      ],
      total: 21,
      limit: 20,
      offset: 20,
    });

    expect(lista.total).toBe(21);
    expect(lista.limit).toBe(20);
    expect(lista.offset).toBe(20);
    expect(lista.items[0].carrito_id).toBeNull();
    // El contrato SaaS no expone cliente_id en la respuesta.
    expect('cliente_id' in lista.items[0]).toBe(false);
  });

  it('normaliza el detalle con imagen_principal_url y cantidad_unidades', () => {
    const detalle = normalizarDetalleReservaSaas({
      reserva_id: 5,
      carrito_id: 10,
      sucursal_id: 2,
      sucursal_nombre: 'Centro',
      fecha_reserva: 'x',
      fecha_atencion: 'y',
      estado: 'PENDIENTE',
      observacion: 'nota',
      cantidad_lineas: 1,
      cantidad_unidades: 4,
      items: [
        {
          detalle_id: 1,
          inventario_id: 9,
          producto_id: 8,
          producto_nombre: 'Camisa',
          imagen_principal_url: 'https://cdn/x.jpg',
          variante_producto_id: 3,
          sku: 'OXF-M',
          talla_id: 2,
          talla_nombre: 'M',
          color_id: 1,
          color_nombre: 'Negro',
          temporada_id: 1,
          temporada_nombre: 'PV26',
          cantidad: 4,
        },
      ],
    });

    expect(detalle.cantidad_unidades).toBe(4);
    expect(detalle.items[0].imagen_principal_url).toBe('https://cdn/x.jpg');
    expect(detalle.observacion).toBe('nota');
  });

  it('normaliza creación y cancelación (respuestas mínimas)', () => {
    expect(
      normalizarReservaCreadaSaas({
        reserva_id: 77,
        carrito_id: 10,
        estado: 'PENDIENTE',
      }),
    ).toEqual({ reserva_id: 77, carrito_id: 10, estado: 'PENDIENTE' });

    expect(
      normalizarReservaEstadoSaas({ reserva_id: 77, estado: 'CANCELADA' }),
    ).toEqual({ reserva_id: 77, estado: 'CANCELADA' });
  });

  it('normaliza `imagen_principal_url` null sin inventar URLs', () => {
    const resumen = normalizarResumenReservaSaas({
      reserva_id: 1,
      carrito_id: 2,
      sucursal_id: 3,
      sucursal_nombre: 'X',
      fecha_reserva: '',
      fecha_atencion: '',
      estado: 'VENCIDA',
      observacion: null,
      cantidad_lineas: 0,
      cantidad_unidades: 0,
    });
    expect(resumen.estado).toBe('VENCIDA');
  });
});
