import { Component, ElementRef, viewChild } from '@angular/core';
import { FEATURED_PRODUCTS } from '../../data/products';
import { ProductCard } from '../../../../shared/components/product-card/product-card';

/**
 * Carrusel horizontal de productos destacados (scroll-snap + botones).
 */
@Component({
  selector: 'app-productos-destacados',
  imports: [ProductCard],
  styleUrl: './productos-destacados.css',
  templateUrl: './productos-destacados.html',
})
export class ProductosDestacados {
  readonly products = FEATURED_PRODUCTS;
  readonly track = viewChild<ElementRef<HTMLElement>>('track');

  scroll(direction: number): void {
    const element = this.track()?.nativeElement;
    if (!element) {
      return;
    }
    element.scrollBy({
      left: direction * element.clientWidth * 0.8,
      behavior: 'smooth',
    });
  }
}
