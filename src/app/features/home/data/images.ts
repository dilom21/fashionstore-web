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
 *   lookbook/look-*.jpg           → editorial de campaña (añadir cuando haya)
 *
 * Las imágenes de producto ya NO viven aquí: las tarjetas de producto usan
 * `producto.imagen_principal_url` del catálogo público (CU09).
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
  lookbook: {
    look1: '/images/hero/hero-main.jpg',
    look2: '/images/categories/cat-chaquetas.jpg',
    look3: '/images/categories/cat-camisas.jpg',
    look4: '/images/categories/cat-sueters.jpg',
    look5: '/images/categories/cat-pantalones.jpg',
  },
  reservaSucursal: '',
} as const;
