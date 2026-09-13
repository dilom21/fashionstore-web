import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  inject,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { Producto } from '../../../administracion/catalogo/models/producto.model';
import { CatalogoPublicoStore } from '../../../catalogo/services/catalogo-publico.store';
import { ProductCard } from '../../../../shared/components/product-card/product-card';

/** Cantidad máxima de productos que muestra el carrusel de la landing. */
const MAX_DESTACADOS = 6;

/**
 * Carrusel horizontal de productos de la landing (scroll-snap + botones).
 *
 * Consume productos reales del catálogo público (CU09) a través de
 * `CatalogoPublicoStore`, que comparte una única llamada GET /productos con
 * el resto de secciones. "Destacados" es solo una selección visual de
 * presentación: la base de datos no tiene un flag `destacado`.
 */
@Component({
  selector: 'app-productos-destacados',
  imports: [ProductCard],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './productos-destacados.css',
  templateUrl: './productos-destacados.html',
})
export class ProductosDestacados {
  private readonly catalogo = inject(CatalogoPublicoStore);
  private readonly destroyRef = inject(DestroyRef);

  readonly productos = signal<Producto[]>([]);
  readonly cargando = signal(true);
  readonly error = signal<string | null>(null);

  /**
   * Punto de integración CU15: reemite el producto elegido en una tarjeta.
   * La landing no crea carrito ni persiste nada.
   */
  readonly agregar = output<Producto>();

  readonly track = viewChild<ElementRef<HTMLElement>>('track');

  constructor() {
    this.cargar();
  }

  reintentar(): void {
    this.cargar();
  }

  onAgregar(producto: Producto): void {
    this.agregar.emit(producto);
  }

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

  private cargar(): void {
    this.cargando.set(true);
    this.error.set(null);
    this.catalogo
      .listarProductos()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (productos) => {
          // Selección de presentación: se toman los primeros productos del
          // catálogo público (sin inventar un flag "destacado").
          this.productos.set(productos.slice(0, MAX_DESTACADOS));
          this.cargando.set(false);
        },
        error: () => {
          this.productos.set([]);
          this.cargando.set(false);
          this.error.set('No pudimos cargar los productos destacados.');
        },
      });
  }
}
