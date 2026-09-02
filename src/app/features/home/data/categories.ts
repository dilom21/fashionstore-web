import { Category } from '../../../shared/models/category';
import { IMAGES } from './images';

/**
 * Categorías provisionales de la tienda.
 * Sin calzado y sin categorías femeninas.
 */
export const CATEGORIES: Category[] = [
  {
    id: 'camisas',
    name: 'Camisas',
    tagline: 'Clásicas y modernas para cada ocasión.',
    image: IMAGES.categories.camisas,
    initial: 'C',
    aspect: '4 / 5',
  },
  {
    id: 'poleras',
    name: 'Poleras y camisetas',
    tagline: 'Essentials pensados para el día a día.',
    image: IMAGES.categories.poleras,
    initial: 'P',
    aspect: '3 / 4',
  },
  {
    id: 'pantalones',
    name: 'Pantalones y jeans',
    tagline: 'Cortes que se adaptan a tu rutina.',
    image: IMAGES.categories.pantalones,
    initial: 'J',
    aspect: '3 / 4',
  },
  {
    id: 'chaquetas',
    name: 'Chaquetas y abrigos',
    tagline: 'La capa que define tu silueta.',
    image: IMAGES.categories.chaquetas,
    initial: 'C',
    aspect: '4 / 5',
  },
  {
    id: 'sueters',
    name: 'Suéteres y buzos',
    tagline: 'Abrigo con actitud urbana.',
    image: IMAGES.categories.sueters,
    initial: 'S',
    aspect: '3 / 4',
  },
  {
    id: 'accesorios',
    name: 'Accesorios',
    tagline: 'El detalle final del look.',
    image: IMAGES.categories.accesorios,
    initial: 'A',
    aspect: '3 / 4',
  },
];
