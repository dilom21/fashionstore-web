/** Modelo de producto usado por las tarjetas y datos mock del catálogo. */
export interface Product {
  id: string;
  name: string;
  category: string;
  /** Precio en Bs (ficticio, solo demostración). */
  price: number;
  /** Precio anterior, si el producto está en oferta. */
  oldPrice?: number;
  /** Etiqueta opcional: "Nuevo", "Destacado", "-20%", etc. */
  badge?: string;
  /** Colores disponibles (códigos hex para los círculos). */
  colors: string[];
  /**
   * Ruta pública de la imagen o cadena vacía si la imagen todavía
   * no ha sido añadida (entonces se muestra un placeholder elegante).
   */
  image: string;
}
