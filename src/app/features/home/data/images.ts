/**
 * Registro centralizado de imágenes públicas de la landing.
 *
 * Las fotografías actuales son temporales (Unsplash, moda masculina /
 * prendas) para maquetación. Para reemplazarlas: coloca el archivo en la
 * carpeta indicada dentro de public/images/ y cambia aquí la ruta.
 *
 * Carpetas:
 *   hero/hero-main.jpg            → portada principal de la landing
 *   categories/cat-*.jpg          → tarjetas de categoría
 *   products/prod-*.jpg           → fotografías de producto
 *   lookbook/look-*.jpg           → editorial de campaña (añadir cuando haya)
 */
export const IMAGES = {
  hero: {
    main: '/images/hero/venter-hero1.png',
  },
  categories: {
    camisas: '/images/categories/cat-camisas.jpg',
    poleras: '/images/categories/cat-poleras.jpg',
    pantalones: '/images/categories/cat-pantalones.jpg',
    chaquetas: '/images/categories/cat-chaquetas.jpg',
    sueters: '/images/categories/cat-sueters.jpg',
    accesorios: '/images/categories/cat-accesorios.jpg',
  },
  products: {
    chaquetaClasica: '/images/categories/cat-chaquetas.jpg',
    camisaOxford: '/images/products/prod-camisa.jpg',
    poleraEssential: '/images/products/prod-polera.jpg',
    jeanSlim: '/images/products/prod-jean.jpg',
    sueterPremium: '/images/categories/cat-sueters.jpg',
    pantalonCasual: '',
    camisaLino: '/images/products/prod-camisa.jpg',
    poloPremium: '/images/products/prod-polera.jpg',
    buzoOversize: '/images/categories/cat-sueters.jpg',
    chaquetaBomber: '/images/categories/cat-chaquetas.jpg',
    pantalonChino: '/images/products/prod-jean.jpg',
    poleraTermica: '/images/products/prod-polera.jpg',
    camisaSlimFit: '/images/products/prod-camisa.jpg',
    jeanRecto: '/images/products/prod-jean.jpg',
    abrigoLargo: '/images/categories/cat-chaquetas.jpg',
    packPoleras: '/images/products/prod-polera.jpg',
  },
  lookbook: {
    look1: '/images/hero/hero-main.jpg',
    look2: '/images/categories/cat-chaquetas.jpg',
    look3: '/images/categories/cat-camisas.jpg',
    look4: '/images/categories/cat-sueters.jpg',
    look5: '/images/categories/cat-pantalones.jpg',
  },
  reservaSucursal: '',
} as const;
