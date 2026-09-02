import { Component } from '@angular/core';
import { SEASON_OFFERS } from '../../data/products';
import { ProductCard } from '../../../../shared/components/product-card/product-card';

/**
 * "Ofertas de temporada": productos mock con descuento.
 * Fondo oscuro elegante con acentos púrpura (sin contador falso).
 */
@Component({
  selector: 'app-ofertas',
  imports: [ProductCard],
  styleUrl: './ofertas.css',
  templateUrl: './ofertas.html',
})
export class Ofertas {
  readonly products = SEASON_OFFERS;
}
