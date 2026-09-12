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
import { ProductosService } from '../../../catalogo/services/productos.service';
import {
  Proveedor,
  ProveedorProducto,
  ProveedorProductoInput,
} from '../../models/proveedor.model';
import { ProveedoresService } from '../../services/proveedores.service';
import { traducirErrorProveedores } from '../../utils/proveedores-error.util';

/** Producto mostrado en el selector de productos del proveedor. */
interface ProductoMostrable {
  producto_id: number;
  nombre: string;
  categoria: string | null;
  /** true si el producto está activo en el catálogo administrativo. */
  productoActivo: boolean;
}

/** Estado editable de una relación proveedor_producto seleccionada. */
interface SeleccionProducto {
  costo_referencia: number | null;
  estado: boolean;
}

/**
 * Diálogo para gestionar los productos asociados a un proveedor (CU11).
 *
 * - Carga las relaciones con GET /proveedores/{id}/productos.
 * - Carga el catálogo de productos activos con ProductosService (CU07).
 * - Guarda el conjunto COMPLETO con un único PUT /proveedores/{id}/productos
 *   (nunca un request por checkbox ni por cambio de costo). El PUT es
 *   idempotente y una selección vacía elimina todas las relaciones.
 *
 * Los productos asociados que ya no están activos se conservan visibles y se
 * pueden mantener en el payload; el backend permite conservar relaciones
 * existentes con productos inactivos. Un producto inactivo no puede agregarse
 * como relación NUEVA (el catálogo administrativo solo expone activos).
 */
@Component({
  selector: 'app-proveedor-productos-dialog',
  imports: [],
  styleUrl: './proveedor-productos-dialog.css',
  templateUrl: './proveedor-productos-dialog.html',
})
export class ProveedorProductosDialog {
  readonly proveedor = input.required<Proveedor>();

  readonly guardado = output<number>();
  readonly cerrado = output<void>();

  private readonly proveedoresService = inject(ProveedoresService);
  private readonly productosService = inject(ProductosService);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  private readonly asignados = signal<ProveedorProducto[]>([]);
  private readonly productosActivos = signal<ProductoMostrable[]>([]);

  /** Selección actual: producto_id -> { costo_referencia, estado }. */
  readonly seleccion = signal<ReadonlyMap<number, SeleccionProducto>>(new Map());
  readonly cargando = signal(true);
  readonly guardando = signal(false);
  readonly error = signal<string | null>(null);
  readonly exito = signal<string | null>(null);
  readonly filtro = signal('');
  readonly soloAsociados = signal(false);

  /** Mapa de relaciones guardadas en el backend (estado "sin cambios"). */
  private readonly asignadosMap = computed<ReadonlyMap<number, SeleccionProducto>>(
    () =>
      new Map(
        this.asignados().map((producto) => [
          producto.producto_id,
          { costo_referencia: producto.costo_referencia, estado: producto.estado },
        ]),
      ),
  );

  /** Unión de productos activos + asociados que ya no están activos. */
  readonly productos = computed<ProductoMostrable[]>(() => {
    const activos = this.productosActivos();
    const idsActivos = new Set(activos.map((producto) => producto.producto_id));
    const inactivosAsignados = this.asignados()
      .filter((producto) => !idsActivos.has(producto.producto_id))
      .map(
        (producto): ProductoMostrable => ({
          producto_id: producto.producto_id,
          nombre: producto.nombre,
          categoria: producto.categoria,
          productoActivo: false,
        }),
      );
    return [...activos, ...inactivosAsignados];
  });

  readonly productosFiltrados = computed<ProductoMostrable[]>(() => {
    const texto = this.filtro().trim().toLowerCase();
    const soloAsociados = this.soloAsociados();
    const seleccionados = this.seleccion();
    return this.productos().filter((producto) => {
      if (soloAsociados && !seleccionados.has(producto.producto_id)) {
        return false;
      }
      if (!texto) {
        return true;
      }
      const nombre = producto.nombre.toLowerCase();
      const categoria = (producto.categoria ?? '').toLowerCase();
      return nombre.includes(texto) || categoria.includes(texto);
    });
  });

  readonly totalSeleccionados = computed(() => this.seleccion().size);
  readonly totalAsignados = computed(() => this.asignados().length);

  /** Hay algún costo seleccionado inválido (vacío o negativo). */
  readonly hayCostoInvalido = computed(() => {
    for (const valor of this.seleccion().values()) {
      if (
        valor.costo_referencia === null ||
        !Number.isFinite(valor.costo_referencia) ||
        valor.costo_referencia < 0
      ) {
        return true;
      }
    }
    return false;
  });

  /** Hay cambios sin guardar respecto al conjunto asociado en el backend. */
  readonly hayCambios = computed(
    () => !this.mismosValores(this.seleccion(), this.asignadosMap()),
  );

  ngOnInit(): void {
    this.cargar();
  }

  private cargar(): void {
    this.cargando.set(true);
    this.error.set(null);

    forkJoin({
      asignados: this.proveedoresService.listarProductos(this.proveedor().id),
      activos: this.productosService.listarProductosAdmin({ estado: true }),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ asignados, activos }) => {
          this.cargando.set(false);
          this.asignados.set(asignados.productos);
          this.productosActivos.set(
            activos.map(
              (producto): ProductoMostrable => ({
                producto_id: producto.id,
                nombre: producto.nombre,
                categoria: producto.categoria?.nombre ?? null,
                productoActivo: true,
              }),
            ),
          );
          this.seleccion.set(this.mapaDesdeAsignados(asignados.productos));
        },
        error: (error: unknown) => {
          this.cargando.set(false);
          this.manejarError(error);
        },
      });
  }

  esAsignado(productoId: number): boolean {
    return this.asignadosMap().has(productoId);
  }

  estaSeleccionado(productoId: number): boolean {
    return this.seleccion().has(productoId);
  }

  seleccionDe(productoId: number): SeleccionProducto | null {
    return this.seleccion().get(productoId) ?? null;
  }

  alternar(productoId: number): void {
    if (this.guardando()) {
      return;
    }
    this.exito.set(null);
    this.seleccion.update((actual) => {
      const siguiente = new Map(actual);
      if (siguiente.has(productoId)) {
        siguiente.delete(productoId);
      } else {
        const previo = this.asignadosMap().get(productoId);
        siguiente.set(productoId, {
          costo_referencia: previo?.costo_referencia ?? 0,
          estado: previo?.estado ?? true,
        });
      }
      return siguiente;
    });
  }

  onCosto(productoId: number, event: Event): void {
    if (this.guardando()) {
      return;
    }
    const valor = (event.target as HTMLInputElement).value.trim();
    const numero = valor === '' ? null : Number(valor);
    this.exito.set(null);
    this.actualizarSeleccion(productoId, {
      costo_referencia:
        numero !== null && Number.isFinite(numero) ? numero : null,
    });
  }

  onEstadoRelacion(productoId: number, event: Event): void {
    if (this.guardando()) {
      return;
    }
    const estado = (event.target as HTMLInputElement).checked;
    this.exito.set(null);
    this.actualizarSeleccion(productoId, { estado });
  }

  seleccionarVisibles(): void {
    if (this.guardando()) {
      return;
    }
    this.exito.set(null);
    this.seleccion.update((actual) => {
      const siguiente = new Map(actual);
      for (const producto of this.productosFiltrados()) {
        if (siguiente.has(producto.producto_id)) {
          continue;
        }
        const previo = this.asignadosMap().get(producto.producto_id);
        siguiente.set(producto.producto_id, {
          costo_referencia: previo?.costo_referencia ?? 0,
          estado: previo?.estado ?? true,
        });
      }
      return siguiente;
    });
  }

  limpiarSeleccion(): void {
    if (this.guardando()) {
      return;
    }
    this.exito.set(null);
    this.seleccion.set(new Map());
  }

  /** Descartar: vuelve al conjunto asociado en el backend. */
  descartar(): void {
    if (this.guardando()) {
      return;
    }
    this.exito.set(null);
    this.seleccion.set(this.mapaDesdeAsignados(this.asignados()));
  }

  onFiltro(event: Event): void {
    this.filtro.set((event.target as HTMLInputElement).value);
  }

  onSoloAsociados(event: Event): void {
    this.soloAsociados.set((event.target as HTMLInputElement).checked);
  }

  formatearCosto(valor: number | null): string {
    return valor === null ? '' : valor.toFixed(2);
  }

  guardar(): void {
    if (this.guardando() || !this.hayCambios() || this.hayCostoInvalido()) {
      return;
    }
    this.guardando.set(true);
    this.error.set(null);
    this.exito.set(null);

    const productos: ProveedorProductoInput[] = [...this.seleccion().entries()]
      .map(([productoId, valor]) => ({
        producto_id: productoId,
        costo_referencia: valor.costo_referencia ?? 0,
        estado: valor.estado,
      }))
      .sort((a, b) => a.producto_id - b.producto_id);

    this.proveedoresService
      .reemplazarProductos(this.proveedor().id, productos)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (respuesta) => {
          this.guardando.set(false);
          this.asignados.set(respuesta.productos);
          this.seleccion.set(this.mapaDesdeAsignados(respuesta.productos));
          this.exito.set(
            respuesta.total === 0
              ? 'Se quitaron todos los productos del proveedor.'
              : `Se guardaron ${respuesta.total} producto(s) en el proveedor.`,
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

  private actualizarSeleccion(
    productoId: number,
    cambio: Partial<SeleccionProducto>,
  ): void {
    this.seleccion.update((actual) => {
      const previo = actual.get(productoId);
      if (previo === undefined) {
        return actual;
      }
      const siguiente = new Map(actual);
      siguiente.set(productoId, { ...previo, ...cambio });
      return siguiente;
    });
  }

  private mapaDesdeAsignados(
    productos: ProveedorProducto[],
  ): ReadonlyMap<number, SeleccionProducto> {
    return new Map(
      productos.map((producto) => [
        producto.producto_id,
        {
          costo_referencia: producto.costo_referencia,
          estado: producto.estado,
        },
      ]),
    );
  }

  private mismosValores(
    a: ReadonlyMap<number, SeleccionProducto>,
    b: ReadonlyMap<number, SeleccionProducto>,
  ): boolean {
    if (a.size !== b.size) {
      return false;
    }
    for (const [clave, valor] of a) {
      const otro = b.get(clave);
      if (otro === undefined) {
        return false;
      }
      if (
        valor.costo_referencia !== otro.costo_referencia ||
        valor.estado !== otro.estado
      ) {
        return false;
      }
    }
    return true;
  }

  private manejarError(error: unknown): void {
    const traducido = traducirErrorProveedores(error);
    if (traducido.sesionExpirada) {
      this.authService.cerrarSesion();
      void this.router.navigateByUrl('/auth/personal/login');
      return;
    }
    this.error.set(traducido.mensaje);
  }
}
