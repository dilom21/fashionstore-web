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
import { Observable, catchError, forkJoin, map, of, tap } from 'rxjs';

import { AuthService } from '../../../../autenticacion-seguridad/auth/services/auth.service';
import { Temporada } from '../../../catalogo/models/temporada.model';
import { TemporadasService } from '../../../catalogo/services/temporadas.service';
import { VariantesService } from '../../../catalogo/services/variantes.service';
import { ProveedorProducto } from '../../models/proveedor.model';
import { ProveedoresService } from '../../services/proveedores.service';
import {
  DetalleOrdenCompra,
  DetalleOrdenCompraInput,
  OrdenCompra,
} from '../../models/orden-compra.model';
import { OrdenesCompraService } from '../../services/ordenes-compra.service';
import { traducirErrorOrdenesCompra } from '../../utils/ordenes-compra-error.util';
import {
  calcularSubtotal,
  calcularTotal,
  etiquetaEstado as etiquetaEstadoOrden,
  formatearMoneda as formatearMonedaTexto,
} from '../../utils/ordenes-compra.util';

/** Producto ofrecido en el selector (solo relaciones activas del proveedor). */
interface OpcionProducto {
  id: number;
  nombre: string;
  activo: boolean;
}

/** Variante ofrecida en el selector, ya formateada para mostrar. */
interface OpcionVariante {
  id: number;
  sku: string;
  etiqueta: string;
}

/** Temporada ofrecida en el selector (activas + fallback de detalle existente). */
interface OpcionTemporada {
  id: number;
  nombre: string;
  activa: boolean;
}

/** Línea editable del conjunto de detalles. */
interface FilaDetalle {
  key: number;
  productoId: number | null;
  varianteId: number | null;
  temporadaId: number | null;
  cantidad: number;
  costoUnitario: number;
  variantes: OpcionVariante[];
  cargandoVariantes: boolean;
  /** SKU de respaldo cuando la variante guardada ya no está activa. */
  skuFallback: string | null;
}

/**
 * Diálogo de gestión de detalles de una orden de compra (CU12).
 *
 * - Carga los productos ASOCIADOS ACTIVAMENTE al proveedor
 *   (GET /proveedores/{id}/productos), las temporadas activas (CU08) y los
 *   detalles actuales (GET /ordenes-compra/{id}/detalles).
 * - Al seleccionar un producto carga sus variantes (CU07).
 * - Guarda TODO el conjunto con un único PUT /ordenes-compra/{id}/detalles
 *   (nunca un request por fila). El backend reemplaza, es atómico e
 *   idempotente, deduplica por variante + temporada y acepta lista vacía.
 * - La UI impide duplicados (variante + temporada) antes de enviar.
 *
 * `soloLectura` muestra las líneas sin edición (órdenes no BORRADOR).
 * El subtotal y el total son visuales: no se persiste ningún campo total ni se
 * toca inventario.
 */
@Component({
  selector: 'app-orden-compra-detalles-dialog',
  imports: [],
  styleUrl: './orden-compra-detalles-dialog.css',
  templateUrl: './orden-compra-detalles-dialog.html',
})
export class OrdenCompraDetallesDialog {
  readonly orden = input.required<OrdenCompra>();
  readonly soloLectura = input(false);

  readonly guardado = output<number>();
  readonly cerrado = output<void>();

  private readonly ordenesService = inject(OrdenesCompraService);
  private readonly proveedoresService = inject(ProveedoresService);
  private readonly variantesService = inject(VariantesService);
  private readonly temporadasService = inject(TemporadasService);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly cargando = signal(true);
  readonly guardando = signal(false);
  readonly error = signal<string | null>(null);
  readonly exito = signal<string | null>(null);

  readonly productos = signal<OpcionProducto[]>([]);
  readonly temporadas = signal<OpcionTemporada[]>([]);
  readonly filas = signal<FilaDetalle[]>([]);
  readonly detallesServidor = signal<DetalleOrdenCompra[]>([]);

  private readonly variantesCache = new Map<number, OpcionVariante[]>();
  private readonly firmaInicial = signal('');
  private siguienteKey = 1;

  readonly clavesDuplicadas = computed<ReadonlySet<number>>(() => {
    const conteo = new Map<string, number>();
    for (const fila of this.filas()) {
      if (fila.varianteId === null || fila.temporadaId === null) {
        continue;
      }
      const clave = `${fila.varianteId}::${fila.temporadaId}`;
      conteo.set(clave, (conteo.get(clave) ?? 0) + 1);
    }
    const duplicadas = new Set<number>();
    for (const fila of this.filas()) {
      if (fila.varianteId === null || fila.temporadaId === null) {
        continue;
      }
      const clave = `${fila.varianteId}::${fila.temporadaId}`;
      if ((conteo.get(clave) ?? 0) > 1) {
        duplicadas.add(fila.key);
      }
    }
    return duplicadas;
  });

  readonly totalVisual = computed(() =>
    this.filas().reduce(
      (acumulado, fila) =>
        acumulado + calcularSubtotal(fila.cantidad, fila.costoUnitario),
      0,
    ),
  );

  readonly totalServidor = computed(() => calcularTotal(this.detallesServidor()));

  readonly totalVisible = computed(() =>
    this.soloLectura() ? this.totalServidor() : this.totalVisual(),
  );

  readonly puedeGuardar = computed(() => {
    if (this.soloLectura() || this.guardando() || this.cargando()) {
      return false;
    }
    if (this.clavesDuplicadas().size > 0) {
      return false;
    }
    if (this.filas().some((fila) => fila.cargandoVariantes)) {
      return false;
    }
    if (this.filas().some((fila) => !this.filaValida(fila))) {
      return false;
    }
    return this.firmaFilas(this.filas()) !== this.firmaInicial();
  });

  ngOnInit(): void {
    this.cargar();
  }

  etiquetaEstado(estado: OrdenCompra['estado']): string {
    return etiquetaEstadoOrden(estado);
  }

  formatearMoneda(valor: number): string {
    return formatearMonedaTexto(valor);
  }

  subtotal(fila: FilaDetalle): number {
    return calcularSubtotal(fila.cantidad, fila.costoUnitario);
  }

  subtotalDetalle(detalle: DetalleOrdenCompra): number {
    return calcularSubtotal(detalle.cantidad, detalle.costo_unitario);
  }

  esDuplicada(key: number): boolean {
    return this.clavesDuplicadas().has(key);
  }

  filaValida(fila: FilaDetalle): boolean {
    return (
      fila.productoId !== null &&
      fila.varianteId !== null &&
      fila.temporadaId !== null &&
      Number.isFinite(fila.cantidad) &&
      Number.isInteger(fila.cantidad) &&
      fila.cantidad > 0 &&
      Number.isFinite(fila.costoUnitario) &&
      fila.costoUnitario >= 0
    );
  }

  // ===== Edición =====

  agregarFila(): void {
    if (this.guardando() || this.soloLectura()) {
      return;
    }
    this.exito.set(null);
    const fila: FilaDetalle = {
      key: this.siguienteKey++,
      productoId: null,
      varianteId: null,
      temporadaId: null,
      cantidad: 1,
      costoUnitario: 0,
      variantes: [],
      cargandoVariantes: false,
      skuFallback: null,
    };
    this.filas.update((actual) => [...actual, fila]);
  }

  quitarFila(key: number): void {
    if (this.guardando() || this.soloLectura()) {
      return;
    }
    this.exito.set(null);
    this.filas.update((actual) => actual.filter((fila) => fila.key !== key));
  }

  vaciarFilas(): void {
    if (this.guardando() || this.soloLectura() || this.filas().length === 0) {
      return;
    }
    this.exito.set(null);
    this.filas.set([]);
  }

  onProducto(key: number, event: Event): void {
    if (this.guardando() || this.soloLectura()) {
      return;
    }
    const valor = (event.target as HTMLSelectElement).value;
    const productoId = valor === '' ? null : Number(valor);
    this.exito.set(null);
    this.actualizarFila(key, {
      productoId,
      varianteId: null,
      variantes: [],
      skuFallback: null,
      cargandoVariantes: productoId !== null,
    });
    if (productoId !== null) {
      this.cargarVariantesFila(key, productoId, null, null);
    }
  }

  onVariante(key: number, event: Event): void {
    if (this.guardando() || this.soloLectura()) {
      return;
    }
    const valor = (event.target as HTMLSelectElement).value;
    this.exito.set(null);
    this.actualizarFila(key, {
      varianteId: valor === '' ? null : Number(valor),
    });
  }

  onTemporada(key: number, event: Event): void {
    if (this.guardando() || this.soloLectura()) {
      return;
    }
    const valor = (event.target as HTMLSelectElement).value;
    this.exito.set(null);
    this.actualizarFila(key, {
      temporadaId: valor === '' ? null : Number(valor),
    });
  }

  onCantidad(key: number, event: Event): void {
    if (this.guardando() || this.soloLectura()) {
      return;
    }
    const valor = (event.target as HTMLInputElement).value;
    const cantidad = valor === '' ? 0 : Math.trunc(Number(valor));
    this.exito.set(null);
    this.actualizarFila(key, {
      cantidad: Number.isFinite(cantidad) ? cantidad : 0,
    });
  }

  onCosto(key: number, event: Event): void {
    if (this.guardando() || this.soloLectura()) {
      return;
    }
    const valor = (event.target as HTMLInputElement).value;
    const costo = valor === '' ? 0 : Number(valor);
    this.exito.set(null);
    this.actualizarFila(key, {
      costoUnitario: Number.isFinite(costo) ? costo : 0,
    });
  }

  // ===== Persistencia =====

  guardar(): void {
    if (!this.puedeGuardar()) {
      return;
    }
    const detalles: DetalleOrdenCompraInput[] = this.filas().map((fila) => ({
      variante_producto_id: fila.varianteId as number,
      temporada_id: fila.temporadaId as number,
      cantidad: fila.cantidad,
      costo_unitario: fila.costoUnitario,
    }));

    this.guardando.set(true);
    this.error.set(null);
    this.exito.set(null);

    this.ordenesService
      .reemplazarDetalles(this.orden().id, detalles)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (respuesta) => {
          this.guardando.set(false);
          this.detallesServidor.set(respuesta.detalles);
          this.reconstruirFilas(respuesta.detalles);
          this.exito.set(
            respuesta.total === 0
              ? 'Se quitaron todos los detalles de la orden.'
              : `Se guardaron ${respuesta.total} detalle(s) en la orden.`,
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

  // ===== Carga =====

  private cargar(): void {
    this.cargando.set(true);
    this.error.set(null);

    const productos$ = this.proveedoresService
      .listarProductos(this.orden().proveedor_id)
      .pipe(
        map((respuesta) => respuesta.productos),
        catchError(() => of([] as ProveedorProducto[])),
      );
    const temporadas$ = this.temporadasService
      .listarTemporadas({ estado: true })
      .pipe(catchError(() => of([] as Temporada[])));

    forkJoin({
      productos: productos$,
      temporadas: temporadas$,
      detalles: this.ordenesService.listarDetalles(this.orden().id),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ productos, temporadas, detalles }) => {
          this.cargando.set(false);
          this.detallesServidor.set(detalles.detalles);
          this.productos.set(
            this.construirProductos(productos, detalles.detalles),
          );
          this.temporadas.set(
            this.construirTemporadas(temporadas, detalles.detalles),
          );
          this.reconstruirFilas(detalles.detalles);
        },
        error: (error: unknown) => {
          this.cargando.set(false);
          this.manejarError(error);
        },
      });
  }

  private reconstruirFilas(detalles: DetalleOrdenCompra[]): void {
    const filas = detalles.map((detalle) => this.filaDesdeDetalle(detalle));
    this.filas.set(filas);
    this.firmaInicial.set(this.firmaFilas(filas));
    for (const fila of filas) {
      if (fila.productoId !== null && fila.varianteId !== null) {
        this.cargarVariantesFila(
          fila.key,
          fila.productoId,
          fila.varianteId,
          fila.skuFallback,
        );
      }
    }
  }

  private filaDesdeDetalle(detalle: DetalleOrdenCompra): FilaDetalle {
    return {
      key: this.siguienteKey++,
      productoId: detalle.producto_id,
      varianteId: detalle.variante_producto_id,
      temporadaId: detalle.temporada_id,
      cantidad: detalle.cantidad,
      costoUnitario: detalle.costo_unitario,
      variantes: [],
      cargandoVariantes: true,
      skuFallback: detalle.sku,
    };
  }

  private cargarVariantesFila(
    key: number,
    productoId: number,
    fallbackId: number | null,
    fallbackSku: string | null,
  ): void {
    this.cargarVariantes(productoId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (variantes) => {
          let lista = variantes;
          if (fallbackId !== null && !variantes.some((v) => v.id === fallbackId)) {
            const sku = fallbackSku ?? `#${fallbackId}`;
            lista = [
              ...variantes,
              { id: fallbackId, sku, etiqueta: `${sku} (no activa)` },
            ];
          }
          this.actualizarFila(key, {
            variantes: lista,
            cargandoVariantes: false,
          });
        },
        error: (error: unknown) => {
          this.actualizarFila(key, { cargandoVariantes: false });
          this.manejarError(error);
        },
      });
  }

  private cargarVariantes(productoId: number): Observable<OpcionVariante[]> {
    const enCache = this.variantesCache.get(productoId);
    if (enCache !== undefined) {
      return of(enCache);
    }
    return this.variantesService
      .listarVariantes(productoId, { estado: true })
      .pipe(
        map((variantes) =>
          variantes.map(
            (variante): OpcionVariante => ({
              id: variante.id,
              sku: variante.sku,
              etiqueta: `${variante.sku} · ${variante.talla.nombre} / ${variante.color.nombre}`,
            }),
          ),
        ),
        tap((lista) => this.variantesCache.set(productoId, lista)),
      );
  }

  private construirProductos(
    productos: ProveedorProducto[],
    detalles: DetalleOrdenCompra[],
  ): OpcionProducto[] {
    const activos = productos
      .filter((producto) => producto.estado)
      .map(
        (producto): OpcionProducto => ({
          id: producto.producto_id,
          nombre: producto.nombre,
          activo: true,
        }),
      );
    const ids = new Set(activos.map((producto) => producto.id));
    for (const detalle of detalles) {
      if (!ids.has(detalle.producto_id)) {
        activos.push({
          id: detalle.producto_id,
          nombre: detalle.producto_nombre,
          activo: false,
        });
        ids.add(detalle.producto_id);
      }
    }
    return activos.sort((a, b) => a.nombre.localeCompare(b.nombre));
  }

  private construirTemporadas(
    temporadas: Temporada[],
    detalles: DetalleOrdenCompra[],
  ): OpcionTemporada[] {
    const activas = temporadas.map(
      (temporada): OpcionTemporada => ({
        id: temporada.id,
        nombre: temporada.nombre,
        activa: true,
      }),
    );
    const ids = new Set(activas.map((temporada) => temporada.id));
    for (const detalle of detalles) {
      if (!ids.has(detalle.temporada_id)) {
        activas.push({
          id: detalle.temporada_id,
          nombre: detalle.temporada_nombre,
          activa: false,
        });
        ids.add(detalle.temporada_id);
      }
    }
    return activas.sort((a, b) => a.nombre.localeCompare(b.nombre));
  }

  // ===== Utilidades =====

  private actualizarFila(key: number, cambio: Partial<FilaDetalle>): void {
    this.filas.update((actual) =>
      actual.map((fila) => (fila.key === key ? { ...fila, ...cambio } : fila)),
    );
  }

  private firmaFilas(filas: readonly FilaDetalle[]): string {
    return filas
      .map(
        (fila) =>
          `${fila.varianteId ?? ''}|${fila.temporadaId ?? ''}|${fila.cantidad}|${fila.costoUnitario}`,
      )
      .sort()
      .join(';');
  }

  private manejarError(error: unknown): void {
    const traducido = traducirErrorOrdenesCompra(error);
    if (traducido.sesionExpirada) {
      this.authService.cerrarSesion();
      void this.router.navigateByUrl('/auth/personal/login');
      return;
    }
    this.error.set(traducido.mensaje);
  }
}
