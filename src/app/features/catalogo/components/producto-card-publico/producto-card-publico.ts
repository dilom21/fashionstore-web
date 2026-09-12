import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';

import { Producto } from '../../../administracion/catalogo/models/producto.model';
import { ProductoMedia } from '../producto-media/producto-media';

/**
 * Tarjeta pública de producto (CU09).
 *
 * Muestra la categoría, el nombre y el precio, y navega al detalle público.
 * La imagen principal se delega a `app-producto-media`, que aplica el fallback
 * cuando el producto no expone recursos en el listado.
 */
@Component({
  selector: 'app-producto-card-publico',
  imports: [DecimalPipe, RouterLink, ProductoMedia],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './producto-card-publico.css',
  templateUrl: './producto-card-publico.html',
})
export class ProductoCardPublico {
  readonly producto = input.required<Producto>();
}
