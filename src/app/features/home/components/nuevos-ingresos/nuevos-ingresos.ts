import { Component, ElementRef, viewChild } from '@angular/core';
import { NEW_ARRIVALS } from '../../data/products';
import { ProductCard } from '../../../../shared/components/product-card/product-card';

/**
 * "Nuevos ingresos": carrusel horizontal con estética propia
 * (encabezado distinto y tarjetas de menor ancho).
 */
@Component({
  selector: 'app-nuevos-ingresos',
  imports: [ProductCard],
  styleUrl: './nuevos-ingresos.css',
  templateUrl: './nuevos-ingresos.html',
})
export class NuevosIngresos {
  readonly products = NEW_ARRIVALS;
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
