import { DecimalPipe, Location } from '@angular/common';
import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import {
  InventarioDetalle,
  ProductoDetalle,
  RecursoProductoDetalle,
  VarianteProductoDetalle,
} from '../../../administracion/catalogo/models/producto.model';
import { ProductosService } from '../../../administracion/catalogo/services/productos.service';
import { AuthService } from '../../../autenticacion-seguridad/auth/services/auth.service';
import { CarritoService } from '../../../carrito/services/carrito.service';
import { SucursalCompraService } from '../../../carrito/services/sucursal-compra.service';
import { traducirErrorCarrito } from '../../../carrito/utils/carrito-error.util';
import { ToastService } from '../../../../core/services/toast.service';
import { ConfirmDialog } from '../../../../shared/components/confirm-dialog/confirm-dialog';
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
    ConfirmDialog,
  ],
  styleUrl: './producto-detalle-page.css',
  templateUrl: './producto-detalle-page.html',
})
export class ProductoDetallePage {
  private readonly productosService = inject(ProductosService);
  private readonly catalogoService = inject(CatalogoService);
  private readonly carritoService = inject(CarritoService);
  readonly sucursalCompra = inject(SucursalCompraService);
  private readonly authService = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
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

  // ===== Carrito (CU15) =====

  readonly tallaElegida = signal<number | null>(null);
  readonly colorElegido = signal<number | null>(null);
  readonly cantidad = signal(1);
  readonly agregando = signal(false);
  readonly mostrarAvisoIdentificacion = signal(false);

  /** Variante que coincide con la talla y el color elegidos. */
  readonly varianteElegida = computed<VarianteProductoDetalle | null>(() => {
    const tallaId = this.tallaElegida();
    const colorId = this.colorElegido();
    if (tallaId === null || colorId === null) {
      return null;
    }
    return (
      this.variantesActivas().find(
        (variante) =>
          variante.talla.id === tallaId && variante.color.id === colorId,
      ) ?? null
    );
  });

  /**
   * Inventario exacto (sucursal + temporada) de la variante elegida en la
   * sucursal de compra. El backend exige `inventario_id`, no `producto_id`:
   * se resuelve con los datos reales de las variantes del producto.
   */
  readonly inventarioElegido = computed<InventarioDetalle | null>(() => {
    const variante = this.varianteElegida();
    const sucursalId = this.sucursalCompra.sucursalId();
    if (variante === null || sucursalId === null) {
      return null;
    }
    const deLaSucursal = variante.inventarios.filter(
      (inventario) => inventario.sucursal.id === sucursalId,
    );
    if (deLaSucursal.length === 0) {
      return null;
    }
    return deLaSucursal.find((i) => i.stock_disponible > 0) ?? deLaSucursal[0];
  });

  readonly stockElegido = computed(() =>
    Math.max(0, this.inventarioElegido()?.stock_disponible ?? 0),
  );

  readonly puedeAgregar = computed(
    () =>
      this.inventarioElegido() !== null &&
      this.stockElegido() > 0 &&
      !this.agregando(),
  );

  /** Monto informativo (precio × cantidad): el definitivo lo da el backend. */
  readonly totalInformado = computed(
    () => (this.producto()?.precio ?? 0) * this.cantidad(),
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

  // ===== Selección de variante y carrito (CU15) =====

  seleccionarTalla(tallaId: number): void {
    this.tallaElegida.set(
      this.tallaElegida() === tallaId ? null : tallaId,
    );
    this.cantidad.set(1);
  }

  seleccionarColor(colorId: number): void {
    this.colorElegido.set(
      this.colorElegido() === colorId ? null : colorId,
    );
    this.cantidad.set(1);
  }

  cambiarCantidad(delta: number): void {
    const siguiente = Math.max(1, this.cantidad() + delta);
    const maximo = this.stockElegido();
    this.cantidad.set(maximo > 0 ? Math.min(siguiente, maximo) : siguiente);
  }

  /** Cambia la sucursal de compra desde el detalle (contexto, no filtra). */
  cambiarSucursalCompra(evento: Event): void {
    const valor = (evento.target as HTMLSelectElement).value;
    if (valor === '') {
      this.sucursalCompra.limpiar();
      this.cantidad.set(1);
      return;
    }
    const sucursalId = Number(valor);
    const sucursal = (this.filtros()?.sucursales ?? []).find(
      (opcion) => opcion.id === sucursalId,
    );
    if (sucursal) {
      this.sucursalCompra.seleccionar(sucursal.id, sucursal.nombre);
      this.cantidad.set(1);
    }
  }

  agregarAlCarrito(): void {
    const inventario = this.inventarioElegido();
    const sucursalId = this.sucursalCompra.sucursalId();
    if (inventario === null || sucursalId === null || !this.puedeAgregar()) {
      return;
    }

    // Usuario no identificado: no se envía ninguna petición de carrito.
    if (!this.authService.esCliente()) {
      this.mostrarAvisoIdentificacion.set(true);
      return;
    }

    this.agregando.set(true);
    this.carritoService
      .agregarItem({
        sucursal_id: sucursalId,
        inventario_id: inventario.id,
        cantidad: this.cantidad(),
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.agregando.set(false);
          this.cantidad.set(1);
          this.toast.mostrar('Producto agregado al carrito', 'ok');
          this.carritoService.refrescarContador();
        },
        error: (error: unknown) => {
          this.agregando.set(false);
          const traducido = traducirErrorCarrito(error);
          if (traducido.sesionExpirada) {
            this.authService.cerrarSesion();
            this.mostrarAvisoIdentificacion.set(true);
            return;
          }
          this.toast.mostrar(traducido.mensaje, 'error');
        },
      });
  }

  /** Va al login conservando la URL actual para volver al producto después. */
  irAlLogin(): void {
    this.mostrarAvisoIdentificacion.set(false);
    void this.router.navigate(['/login'], {
      queryParams: { returnUrl: this.router.url },
    });
  }

  cerrarAvisoIdentificacion(): void {
    this.mostrarAvisoIdentificacion.set(false);
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
