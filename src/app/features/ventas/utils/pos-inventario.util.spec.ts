import { ProductoDetalle } from '../../administracion/catalogo/models/producto.model';
import {
  filtrarCandidatos,
  mapearDisponibilidadPos,
} from './pos-inventario.util';

function producto(): ProductoDetalle {
  return {
    id: 8,
    nombre: 'Camisa Oxford',
    descripcion: null,
    precio: 299.9,
    estado: true,
    categoria_id: 1,
    categoria: { id: 1, nombre: 'Camisas' },
    imagen_principal_url: null,
    recursos: [
      {
        id: 1,
        tipo: 'IMAGEN',
        url: 'https://img.test/oxford.jpg',
        es_principal: true,
        color: null,
      },
    ],
    variantes: [
      {
        id: 3,
        sku: 'OXF-M-NEG',
        estado: true,
        talla: { id: 2, nombre: 'M' },
        color: { id: 1, nombre: 'Negro' },
        inventarios: [
          {
            id: 17,
            stock_actual: 5,
            stock_reservado: 1,
            stock_disponible: 4,
            fecha_actualizacion: '2026-09-19T10:00:00',
            sucursal: { id: 2, nombre: 'Sucursal Centro', direccion: 'Calle 1' },
            temporada: {
              id: 1,
              nombre: 'Primavera-Verano 2026',
              fecha_inicio: '2026-01-01',
              fecha_fin: '2026-06-30',
            },
          },
          {
            id: 18,
            stock_actual: 0,
            stock_reservado: 0,
            stock_disponible: 0,
            fecha_actualizacion: '2026-09-19T10:00:00',
            sucursal: { id: 2, nombre: 'Sucursal Centro', direccion: 'Calle 1' },
            temporada: {
              id: 1,
              nombre: 'Primavera-Verano 2026',
              fecha_inicio: '2026-01-01',
              fecha_fin: '2026-06-30',
            },
          },
          {
            id: 19,
            stock_actual: 3,
            stock_reservado: 0,
            stock_disponible: 3,
            fecha_actualizacion: '2026-09-19T10:00:00',
            sucursal: { id: 5, nombre: 'Sucursal Sur', direccion: 'Calle 2' },
            temporada: {
              id: 1,
              nombre: 'Primavera-Verano 2026',
              fecha_inicio: '2026-01-01',
              fecha_fin: '2026-06-30',
            },
          },
        ],
      },
    ],
  };
}

describe('pos-inventario.util (CU20)', () => {
  it('mapea inventarios con stock y expone inventario_id, sucursal y stock', () => {
    const candidatos = mapearDisponibilidadPos(producto());

    expect(candidatos.map((c) => c.inventario_id)).toEqual([17, 19]);
    expect(candidatos[0]).toMatchObject({
      producto_id: 8,
      producto_nombre: 'Camisa Oxford',
      sku: 'OXF-M-NEG',
      talla_nombre: 'M',
      color_nombre: 'Negro',
      precio: 299.9,
      sucursal_id: 2,
      sucursal_nombre: 'Sucursal Centro',
      stock_disponible: 4,
    });
    // Imagen principal tomada del recurso marcado.
    expect(candidatos[0].imagen_principal).toBe('https://img.test/oxford.jpg');
  });

  it('descarta inventarios sin stock disponible', () => {
    const candidatos = mapearDisponibilidadPos(producto());
    expect(candidatos.some((c) => c.inventario_id === 18)).toBe(false);
  });

  it('restringe a la sucursal del empleado cuando se conoce', () => {
    const candidatos = mapearDisponibilidadPos(producto(), 2);
    expect(candidatos.map((c) => c.inventario_id)).toEqual([17]);
    expect(candidatos.every((c) => c.sucursal_id === 2)).toBe(true);
  });

  it('filtra candidatos por SKU o color', () => {
    const candidatos = mapearDisponibilidadPos(producto());
    expect(filtrarCandidatos(candidatos, 'oxf').length).toBe(2);
    expect(filtrarCandidatos(candidatos, 'negro').length).toBe(2);
    expect(filtrarCandidatos(candidatos, 'azul').length).toBe(0);
  });
});
