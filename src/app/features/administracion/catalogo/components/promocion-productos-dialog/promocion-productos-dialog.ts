import {
  Component,
  DestroyRef,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { forkJoin } from 'rxjs';

import { AuthService } from '../../../../autenticacion-seguridad/auth/services/auth.service';
import { Promocion } from '../../models/promocion.model';
import { ProductosService } from '../../services/productos.service';
import { PromocionesService } from '../../services/promociones.service';
import { traducirErrorPromociones } from '../../utils/promociones-error.util';

/** Producto a mostrar en el selector de asignación. */
interface ProductoSeleccionable {
  id: number;
  nombre: string;
  descripcion: string | null;
  precio: number;
  estado: boolean;
  categoria: string | null;
}

/**
 * Diálogo para gestionar los productos asociados a una promoción (CU10).
 *
 * - Carga los productos asignados con GET /promociones/{id}/productos.
 * - Carga los productos activos con ProductosService (CU07).
 * - Guarda el conjunto COMPLETO con un único PUT /promociones/{id}/productos
 *   (nunca un request por checkbox). El PUT es idempotente y una selección
 *   vacía elimina todas las asociaciones.
 *
 * Los productos asignados que quedaron inactivos se muestran marcados para no
 * perder la referencia; si se mantienen seleccionados el backend responde 409
 * ("Solo se pueden asociar productos activos") y se muestra el detalle real.
 */
@Component({
  selector: 'app-promocion-productos-dialog',
  imports: [],
  styleUrl: './promocion-productos-dialog.css',
  templateUrl: './promocion-productos-dialog.html',
})
export class PromocionProductosDialog {
  readonly promocion = input.required<Promocion>();

  readonly guardado = output<number>();
  readonly cerrado = output<void>();

  private readonly promocionesService = inject(PromocionesService);
  private readonly productosService = inject(ProductosService);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  private readonly productosActivos = signal<ProductoSeleccionable[]>([]);
  private readonly asignados = signal<ProductoSeleccionable[]>([]);

  readonly seleccionados = signal<ReadonlySet<number>>(new Set());
  readonly cargando = signal(true);
  readonly guardando = signal(false);
  readonly error = signal<string | null>(null);
  readonly exito = signal<string | null>(null);
  readonly filtro = signal('');
  readonly soloAsignados = signal(false);

  /** Ids asociados actualmente en el backend (estado "guardado"). */
  readonly asignadosIds = computed<ReadonlySet<number>>(
    () => new Set(this.asignados().map((producto) => producto.id)),
  );

  /** Unión de productos activos + asignados inactivos (sin duplicados). */
  readonly productos = computed<ProductoSeleccionable[]>(() => {
    const activos = this.productosActivos();
    const idsActivos = new Set(activos.map((producto) => producto.id));
    const inactivosAsignados = this.asignados().filter(
      (producto) => !idsActivos.has(producto.id),
    );
    return [...activos, ...inactivosAsignados];
  });

  readonly productosFiltrados = computed<ProductoSeleccionable[]>(() => {
    const texto = this.filtro().trim().toLowerCase();
    const soloAsignados = this.soloAsignados();
    const idsAsignados = this.asignadosIds();
    return this.productos().filter((producto) => {
      if (soloAsignados && !idsAsignados.has(producto.id)) {
        return false;
      }
      if (!texto) {
        return true;
      }
      return producto.nombre.toLowerCase().includes(texto);
    });
  });

  readonly totalSeleccionados = computed(() => this.seleccionados().size);
  readonly totalAsignados = computed(() => this.asignados().length);

  /** Hay cambios sin guardar respecto al conjunto asociado en el backend. */
  readonly hayCambios = computed(
    () => !this.mismosIds(this.seleccionados(), this.asignadosIds()),
  );

  ngOnInit(): void {
    this.cargar();
  }

  private cargar(): void {
    this.cargando.set(true);
    this.error.set(null);

    forkJoin({
      asignados: this.promocionesService.listarProductos(this.promocion().id),
      activos: this.productosService.listarProductosAdmin({ estado: true }),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ asignados, activos }) => {
          this.cargando.set(false);
          this.asignados.set(
            asignados.productos.map((producto) => ({
              id: producto.id,
              nombre: producto.nombre,
              descripcion: producto.descripcion,
              precio: producto.precio,
              estado: producto.estado,
              categoria: null,
            })),
          );
          this.productosActivos.set(
            activos.map((producto) => ({
              id: producto.id,
              nombre: producto.nombre,
              descripcion: producto.descripcion,
              precio: producto.precio,
              estado: producto.estado,
              categoria: producto.categoria.nombre,
            })),
          );
          this.seleccionados.set(
            new Set(asignados.productos.map((producto) => producto.id)),
          );
        },
        error: (error: unknown) => {
          this.cargando.set(false);
          this.manejarError(error);
        },
      });
  }

  estaSeleccionado(productoId: number): boolean {
    return this.seleccionados().has(productoId);
  }

  alternar(productoId: number): void {
    if (this.guardando()) {
      return;
    }
    this.exito.set(null);
    this.seleccionados.update((actual) => {
      const siguiente = new Set(actual);
      if (siguiente.has(productoId)) {
        siguiente.delete(productoId);
      } else {
        siguiente.add(productoId);
      }
      return siguiente;
    });
  }

  seleccionarVisibles(): void {
    if (this.guardando()) {
      return;
    }
    this.exito.set(null);
    this.seleccionados.update((actual) => {
      const siguiente = new Set(actual);
      for (const producto of this.productosFiltrados()) {
        siguiente.add(producto.id);
      }
      return siguiente;
    });
  }

  limpiarSeleccion(): void {
    if (this.guardando()) {
      return;
    }
    this.exito.set(null);
    this.seleccionados.set(new Set());
  }

  /** Descartar: vuelve al conjunto asociado en el backend. */
  descartar(): void {
    if (this.guardando()) {
      return;
    }
    this.exito.set(null);
    this.seleccionados.set(new Set(this.asignadosIds()));
  }

  onFiltro(event: Event): void {
    const valor = (event.target as HTMLInputElement).value;
    this.filtro.set(valor);
  }

  onSoloAsignados(event: Event): void {
    this.soloAsignados.set((event.target as HTMLInputElement).checked);
  }

  formatearPrecio(precio: number): string {
    return precio.toFixed(2);
  }

  guardar(): void {
    if (this.guardando() || !this.hayCambios()) {
      return;
    }
    this.guardando.set(true);
    this.error.set(null);
    this.exito.set(null);

    const ids = [...this.seleccionados()].sort((a, b) => a - b);

    this.promocionesService
      .reemplazarProductos(this.promocion().id, ids)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (respuesta) => {
          this.guardando.set(false);
          this.asignados.set(
            respuesta.productos.map((producto) => ({
              id: producto.id,
              nombre: producto.nombre,
              descripcion: producto.descripcion,
              precio: producto.precio,
              estado: producto.estado,
              categoria: null,
            })),
          );
          this.seleccionados.set(
            new Set(respuesta.productos.map((producto) => producto.id)),
          );
          this.exito.set(
            respuesta.total === 0
              ? 'Se quitaron todos los productos de la promoción.'
              : `Se guardaron ${respuesta.total} producto(s) en la promoción.`,
          );
          this.guardado.emit(respuesta.total);
        },
        error: (error: unknown) => {
          this.guardando.set(false);
          this.manejarError(error);
        },
      });
  }

  cerrar(): void {
    if (this.guardando()) {
      return;
    }
    this.cerrado.emit();
  }

  private mismosIds(a: ReadonlySet<number>, b: ReadonlySet<number>): boolean {
    if (a.size !== b.size) {
      return false;
    }
    for (const valor of a) {
      if (!b.has(valor)) {
        return false;
      }
    }
    return true;
  }

  private manejarError(error: unknown): void {
    const traducido = traducirErrorPromociones(error);
    if (traducido.sesionExpirada) {
      this.authService.cerrarSesion();
      void this.router.navigateByUrl('/auth/personal/login');
      return;
    }
    this.error.set(traducido.mensaje);
  }
}
