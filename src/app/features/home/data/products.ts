import { Product } from '../../../shared/models/product';
import { IMAGES } from './images';

/**
 * Datos mock de productos (precios ficticios en Bs, solo demostración).
 * Más adelante estos datos llegarán desde el backend FastAPI.
 */

export const FEATURED_PRODUCTS: Product[] = [
  {
    id: 'chaqueta-clasica',
    name: 'Chaqueta Clásica',
    category: 'Chaquetas y abrigos',
    price: 429,
    badge: 'Destacado',
    colors: ['#101418', '#3d4450', '#8a6d4b'],
    image: IMAGES.products.chaquetaClasica,
  },
  {
    id: 'camisa-oxford',
    name: 'Camisa Oxford',
    category: 'Camisas',
    price: 189,
    badge: 'Nuevo',
    colors: ['#e8e6e0', '#7fa7c9'],
    image: IMAGES.products.camisaOxford,
  },
  {
    id: 'polera-essential',
    name: 'Polera Essential',
    category: 'Poleras y camisetas',
    price: 89,
    colors: ['#e8e6e0', '#23272e', '#8c9096'],
    image: IMAGES.products.poleraEssential,
  },
  {
    id: 'jean-slim',
    name: 'Jean Slim',
    category: 'Pantalones y jeans',
    price: 249,
    colors: ['#2b3a55', '#1b2230'],
    image: IMAGES.products.jeanSlim,
  },
  {
    id: 'sueter-premium',
    name: 'Suéter Premium',
    category: 'Suéteres y buzos',
    price: 259,
    colors: ['#9a7b4f', '#31363f'],
    image: IMAGES.products.sueterPremium,
  },
  {
    id: 'pantalon-casual',
    name: 'Pantalón Casual',
    category: 'Pantalones y jeans',
    price: 199,
    colors: ['#3c3f45', '#5b5346'],
    image: IMAGES.products.pantalonCasual,
  },
];

export const NEW_ARRIVALS: Product[] = [
  {
    id: 'camisa-lino',
    name: 'Camisa de Lino',
    category: 'Camisas',
    price: 219,
    badge: 'Nuevo',
    colors: ['#f1efe9', '#b9c7d2'],
    image: IMAGES.products.camisaLino,
  },
  {
    id: 'polo-premium',
    name: 'Polo Premium',
    category: 'Poleras y camisetas',
    price: 139,
    colors: ['#1e2c44', '#f1efe9', '#5e1f24'],
    image: IMAGES.products.poloPremium,
  },
  {
    id: 'buzo-oversize',
    name: 'Buzo Oversize',
    category: 'Suéteres y buzos',
    price: 279,
    badge: 'Nuevo',
    colors: ['#1c1e22', '#9aa0a6'],
    image: IMAGES.products.buzoOversize,
  },
  {
    id: 'chaqueta-bomber',
    name: 'Chaqueta Bomber',
    category: 'Chaquetas y abrigos',
    price: 379,
    colors: ['#101418', '#3f4738'],
    image: IMAGES.products.chaquetaBomber,
  },
  {
    id: 'pantalon-chino',
    name: 'Pantalón Chino',
    category: 'Pantalones y jeans',
    price: 179,
    colors: ['#c2b29a', '#8c8f6a', '#1e2c44'],
    image: IMAGES.products.pantalonChino,
  },
  {
    id: 'polera-termica',
    name: 'Polera Térmica',
    category: 'Poleras y camisetas',
    price: 129,
    colors: ['#23272e', '#8c9096', '#e8e6e0'],
    image: IMAGES.products.poleraTermica,
  },
];

export const SEASON_OFFERS: Product[] = [
  {
    id: 'camisa-slimfit',
    name: 'Camisa Slim Fit',
    category: 'Camisas',
    price: 176,
    oldPrice: 220,
    badge: '-20%',
    colors: ['#e8e6e0', '#2b3a55'],
    image: IMAGES.products.camisaSlimFit,
  },
  {
    id: 'jean-recto',
    name: 'Jean Recto',
    category: 'Pantalones y jeans',
    price: 209,
    oldPrice: 279,
    badge: '-25%',
    colors: ['#2b3a55', '#1b2230'],
    image: IMAGES.products.jeanRecto,
  },
  {
    id: 'abrigo-largo',
    name: 'Abrigo Largo',
    category: 'Chaquetas y abrigos',
    price: 429,
    oldPrice: 549,
    badge: '-20%',
    colors: ['#101418', '#3d4450'],
    image: IMAGES.products.abrigoLargo,
  },
  {
    id: 'pack-poleras',
    name: 'Pack 2 Poleras Básicas',
    category: 'Poleras y camisetas',
    price: 119,
    oldPrice: 159,
    badge: '-25%',
    colors: ['#23272e', '#8c9096', '#e8e6e0'],
    image: IMAGES.products.packPoleras,
  },
];
