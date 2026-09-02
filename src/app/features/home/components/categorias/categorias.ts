import { Component } from '@angular/core';
import { CATEGORIES } from '../../data/categories';

/**
 * "Compra por categoría": composición editorial tipo masonry.
 * Categorías provisionales (moda exclusivamente masculina, sin calzado).
 */
@Component({
  selector: 'app-categorias',
  imports: [],
  styleUrl: './categorias.css',
  templateUrl: './categorias.html',
})
export class Categorias {
  readonly categories = CATEGORIES;
}
