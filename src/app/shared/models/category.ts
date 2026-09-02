/** Categoría de producto de VANTER MEN (moda exclusivamente masculina). */
export interface Category {
  id: string;
  name: string;
  /** Texto corto de apoyo. */
  tagline: string;
  /** Ruta pública de la imagen o cadena vacía si aún no hay imagen. */
  image: string;
  /** Inicial usada por el placeholder tipográfico mientras no hay foto. */
  initial: string;
  /** Relación de aspecto sugerida para la composición editorial. */
  aspect: string;
}
