import { ChangeDetectionStrategy, Component, input, signal } from '@angular/core';
import { Product } from '../../models/product';

/**
 * Tarjeta de producto reutilizable (destacados, nuevos ingresos, ofertas…).
 * Las acciones de favorito y "agregar" son solo visuales (mock).
 */
@Component({
  selector: 'app-product-card',
  imports: [],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './product-card.css',
  templateUrl: './product-card.html',
})
export class ProductCard {
  readonly product = input.required<Product>();

  readonly favorito = signal(false);
  readonly agregado = signal(false);

  /** Devuelve true si el badge indica un descuento (ej. "-20%"). */
  esOferta(): boolean {
    return this.product().badge?.startsWith('-') ?? false;
  }

  toggleFavorito(): void {
    this.favorito.update((value) => !value);
  }

  /** Mock: no agrega nada real, solo cambia el estado visual del botón. */
  agregarAlCarrito(): void {
    if (this.agregado()) {
      return;
    }
    this.agregado.set(true);
    window.setTimeout(() => this.agregado.set(false), 2200);
  }
}
