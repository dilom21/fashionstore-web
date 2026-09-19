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

/** Cantidad máxima de productos que muestra el carrusel de novedades. */
const MAX_NUEVOS = 6;

/**
 * "Nuevos ingresos": carrusel horizontal con estética propia.
 *
 * Reutiliza la misma carga de catálogo público que `ProductosDestacados`
 * (una sola llamada GET /productos gracias a `CatalogoPublicoStore`). Es una
 * selección visual de presentación: la base de datos no tiene un flag `nuevo`,
 * por lo que se muestran los últimos productos del listado.
 */
@Component({
  selector: 'app-nuevos-ingresos',
  imports: [ProductCard],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './nuevos-ingresos.css',
  templateUrl: './nuevos-ingresos.html',
})
export class NuevosIngresos {
  private readonly catalogo = inject(CatalogoPublicoStore);
  private readonly destroyRef = inject(DestroyRef);

  readonly productos = signal<Producto[]>([]);
  readonly cargando = signal(true);
  readonly error = signal<string | null>(null);

  /** Punto de integración CU15: reemite el producto elegido. */
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
          // Selección de presentación (sin flag "nuevo" en la BD): se toman
          // los últimos productos del listado público.
          this.productos.set(productos.slice(-MAX_NUEVOS).reverse());
          this.cargando.set(false);
        },
        error: () => {
          this.productos.set([]);
          this.cargando.set(false);
          this.error.set('No pudimos cargar los nuevos ingresos.');
        },
      });
  }
}
