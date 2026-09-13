import { DecimalPipe, Location } from '@angular/common';
import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';

import {
  ProductoDetalle,
  RecursoProductoDetalle,
  VarianteProductoDetalle,
} from '../../../administracion/catalogo/models/producto.model';
import { ProductosService } from '../../../administracion/catalogo/services/productos.service';
import { Navbar } from '../../../home/components/navbar/navbar';
import { DisponibilidadProducto } from '../../components/disponibilidad-producto/disponibilidad-producto';
import { ProductoMedia } from '../../components/producto-media/producto-media';
import { CatalogoFiltros } from '../../models/catalogo-filtros.model';
import { CatalogoService } from '../../services/catalogo.service';
import { traducirErrorPublico } from '../../utils/catalogo-error.util';

/** Opción resumida de talla/color derivada de las variantes del producto. */
interface OpcionVariante {
  id: number;
  nombre: string;
}

/**
 * Detalle público de producto (CU09) - /catalogo/productos/:producto_id.
 *
 * Muestra datos, galería de recursos, variantes (tallas y colores) y la
 * sección de disponibilidad por sucursal. No incluye carrito, reserva, compra
 * ni pagos.
 */
@Component({
  selector: 'app-producto-detalle-page',
  imports: [
    DecimalPipe,
    RouterLink,
    Navbar,
    ProductoMedia,
    DisponibilidadProducto,
  ],
  styleUrl: './producto-detalle-page.css',
  templateUrl: './producto-detalle-page.html',
})
export class ProductoDetallePage {
  private readonly productosService = inject(ProductosService);
  private readonly catalogoService = inject(CatalogoService);
  private readonly route = inject(ActivatedRoute);
  private readonly location = inject(Location);
  private readonly destroyRef = inject(DestroyRef);

  readonly producto = signal<ProductoDetalle | null>(null);
  readonly cargando = signal(false);
  readonly error = signal<string | null>(null);

  readonly filtros = signal<CatalogoFiltros | null>(null);

  readonly indiceImagen = signal(0);

  readonly productoId = signal<number | null>(null);

  /**
   * Recursos de imagen del detalle, con la imagen principal primero y el resto
   * en el orden entregado por el backend. No se ordena por nombre de archivo
   * ni se asume la cantidad de recursos.
   */
  readonly recursosImagenes = computed<RecursoProductoDetalle[]>(() => {
    const imagenes = (this.producto()?.recursos ?? []).filter((recurso) =>
      this.esImagen(recurso.tipo, recurso.url),
    );
    return imagenes
      .map((recurso, indice) => ({ recurso, indice }))
      .sort((a, b) => {
        const principalA = a.recurso.es_principal ? 0 : 1;
        const principalB = b.recurso.es_principal ? 0 : 1;
        if (principalA !== principalB) {
          return principalA - principalB;
        }
        return a.indice - b.indice;
      })
      .map((entrada) => entrada.recurso);
  });

  readonly totalImagenes = computed(() => this.recursosImagenes().length);

  /** Índice vigente acotado al total de imágenes disponibles. */
  readonly indiceActivo = computed(() => {
    const total = this.totalImagenes();
    if (total === 0) {
      return 0;
    }
    return Math.min(this.indiceImagen(), total - 1);
  });

  readonly imagenActiva = computed<RecursoProductoDetalle | null>(() => {
    const imagenes = this.recursosImagenes();
    if (imagenes.length === 0) {
      return null;
    }
    return imagenes[this.indiceActivo()] ?? imagenes[0];
  });

  readonly variantesActivas = computed<VarianteProductoDetalle[]>(() =>
    (this.producto()?.variantes ?? []).filter((variante) => variante.estado),
  );

  readonly tallas = computed<OpcionVariante[]>(() =>
    this.derivarOpciones(
      this.variantesActivas().map((variante) => variante.talla),
    ),
  );

  readonly colores = computed<OpcionVariante[]>(() =>
    this.derivarOpciones(
      this.variantesActivas().map((variante) => variante.color),
    ),
  );

  readonly inventarioTotal = computed(() =>
    this.variantesActivas().reduce(
      (total, variante) =>
        total +
        variante.inventarios.reduce(
          (suma, inventario) => suma + Math.max(0, inventario.stock_disponible),
          0,
        ),
      0,
    ),
  );

  ngOnInit(): void {
    const id = Number(this.route.snapshot.paramMap.get('producto_id'));
    if (!Number.isInteger(id) || id <= 0) {
      this.error.set('El producto solicitado no es válido.');
      return;
    }
    this.productoId.set(id);
    this.cargarProducto(id);
    this.cargarFiltros();
  }

  volver(): void {
    this.location.back();
  }

  seleccionarImagen(indice: number): void {
    if (indice < 0 || indice >= this.totalImagenes()) {
      return;
    }
    this.indiceImagen.set(indice);
  }

  imagenAnterior(): void {
    const total = this.totalImagenes();
    if (total < 2) {
      return;
    }
    this.indiceImagen.set((this.indiceActivo() - 1 + total) % total);
  }

  imagenSiguiente(): void {
    const total = this.totalImagenes();
    if (total < 2) {
      return;
    }
    this.indiceImagen.set((this.indiceActivo() + 1) % total);
  }

  /** Navegación por teclado (flechas) sobre la galería. */
  onGaleriaKeydown(event: KeyboardEvent): void {
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      this.imagenAnterior();
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      this.imagenSiguiente();
    }
  }

  reintentar(): void {
    const id = this.productoId();
    if (id !== null) {
      this.cargarProducto(id);
    }
  }

  esImagen(tipo: string, url: string): boolean {
    const tipoNormalizado = tipo.trim().toLowerCase();
    if (
      tipoNormalizado === 'imagen' ||
      tipoNormalizado === 'image' ||
      tipoNormalizado === 'foto' ||
      tipoNormalizado === 'photo'
    ) {
      return true;
    }
    return /\.(png|jpe?g|gif|webp|avif|svg|bmp)(\?.*)?$/i.test(url.trim());
  }

  private cargarProducto(id: number): void {
    this.cargando.set(true);
    this.error.set(null);
    this.productosService
      .obtenerProductoPublico(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (producto) => {
          this.cargando.set(false);
          this.producto.set(producto);
          this.indiceImagen.set(0);
        },
        error: (error: unknown) => {
          this.cargando.set(false);
          this.producto.set(null);
          this.error.set(
            traducirErrorPublico(error, 'cargar el producto').mensaje,
          );
        },
      });
  }

  private cargarFiltros(): void {
    this.catalogoService
      .obtenerFiltros()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (filtros) => this.filtros.set(filtros),
        error: () => this.filtros.set(null),
      });
  }

  private derivarOpciones(
    opciones: ReadonlyArray<OpcionVariante>,
  ): OpcionVariante[] {
    const mapa = new Map<number, string>();
    for (const opcion of opciones) {
      if (!mapa.has(opcion.id)) {
        mapa.set(opcion.id, opcion.nombre);
      }
    }
    return [...mapa.entries()].map(([id, nombre]) => ({ id, nombre }));
  }
}
