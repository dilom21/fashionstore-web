import { DecimalPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';

import { Producto } from '../../../features/administracion/catalogo/models/producto.model';
import { ProductoMedia } from '../../../features/catalogo/components/producto-media/producto-media';

/**
 * Tarjeta de producto de la landing.
 *
 * Consume el producto real del catálogo público (nombre, categoría, precio e
 * imagen principal), usa `app-producto-media` para el fallback de imagen y
 * navega al detalle público mediante RouterLink.
 */
@Component({
  selector: 'app-product-card',
  imports: [DecimalPipe, RouterLink, ProductoMedia],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './product-card.css',
  templateUrl: './product-card.html',
})
export class ProductCard {
  readonly producto = input.required<Producto>();

  /**
   * Punto de integración CU15.
   *
   * La tarjeta solo anuncia la intención de agregar el producto; el
   * `CartService` de CU15 (carrito, cantidades, persistencia, autenticación y
   * compra) se conectará aquí más adelante. No se guarda nada en localStorage,
   * no se llama a ningún endpoint de carrito y no se incrementa ningún
   * contador.
   */
  readonly agregar = output<Producto>();

  /** Estado puramente visual local; no persiste ni afecta al carrito. */
  readonly favorito = signal(false);

  toggleFavorito(): void {
    this.favorito.update((value) => !value);
  }

  solicitarAgregar(): void {
    this.agregar.emit(this.producto());
  }
}
