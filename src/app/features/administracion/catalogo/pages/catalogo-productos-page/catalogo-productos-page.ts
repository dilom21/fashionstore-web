import { DecimalPipe } from '@angular/common';
import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { Router } from '@angular/router';

import { AuthService } from '../../../../autenticacion-seguridad/auth/services/auth.service';
import { ConfirmDialog } from '../../../../../shared/components/confirm-dialog/confirm-dialog';
import { CategoriaFormDialog } from '../../components/categoria-form-dialog/categoria-form-dialog';
import { ColorFormDialog } from '../../components/color-form-dialog/color-form-dialog';
import { ProductoDetalleDialog } from '../../components/producto-detalle-dialog/producto-detalle-dialog';
import { ProductoFormDialog } from '../../components/producto-form-dialog/producto-form-dialog';
import { ProductoRecursosDialog } from '../../components/producto-recursos-dialog/producto-recursos-dialog';
import { ProductoVariantesDialog } from '../../components/producto-variantes-dialog/producto-variantes-dialog';
import { TallaFormDialog } from '../../components/talla-form-dialog/talla-form-dialog';
import { Categoria } from '../../models/categoria.model';
import { Color } from '../../models/color.model';
import { Producto } from '../../models/producto.model';
import { Talla } from '../../models/talla.model';
import { CategoriasService } from '../../services/categorias.service';
import { ColoresService } from '../../services/colores.service';
import { ProductosService } from '../../services/productos.service';
import { TallasService } from '../../services/tallas.service';
import { traducirErrorCatalogo } from '../../utils/http-error.util';

/** Pestañas disponibles de la pantalla. */
type TabCatalogo = 'productos' | 'categorias' | 'tallas' | 'colores';

/** Valores posibles del filtro de estado. */
type FiltroEstado = 'todos' | 'activos' | 'inactivos';

/** Confirmación de habilitar/deshabilitar un producto. */
interface ConfirmacionProducto {
  producto: Producto;
  habilitar: boolean;
}

/** Confirmación de habilitar/deshabilitar una categoría. */
interface ConfirmacionCategoria {
  categoria: Categoria;
  habilitar: boolean;
}

/** Confirmación de habilitar/deshabilitar una talla. */
interface ConfirmacionTalla {
  talla: Talla;
  habilitar: boolean;
}

/** Confirmación de habilitar/deshabilitar un color. */
interface ConfirmacionColor {
  color: Color;
  habilitar: boolean;
}

/** Destino del mensaje de error. */
type DestinoError =
  | 'productos'
  | 'categorias'
  | 'tallas'
  | 'colores'
  | 'categorias-catalogo';

/**
 * Gestionar catálogo de productos (CU07) - /admin/catalogo/productos.
 *
 * Pantalla con cuatro pestañas: Productos, Categorías, Tallas y Colores.
 * Las variantes y los recursos se administran dentro del producto seleccionado
 * (acciones "Variantes" y "Recursos").
 *
 * - Productos: GET /productos/admin con búsqueda, filtro de categoría y de
 *   estado; POST/PATCH /productos y PATCH /productos/{id}/estado.
 * - Categorías: GET /categorias/admin y CRUD lógico.
 * - Tallas: GET /tallas y CRUD lógico.
 * - Colores: GET /colores y CRUD lógico.
 *
 * No existe DELETE físico: el estado se cambia con los endpoints /estado. Los
 * errores 409/422 se muestran con el `detail` real del backend.
 */
@Component({
  selector: 'app-catalogo-productos-page',
  imports: [
    DecimalPipe,
    ReactiveFormsModule,
    ConfirmDialog,
    ProductoFormDialog,
    ProductoDetalleDialog,
    ProductoVariantesDialog,
    ProductoRecursosDialog,
    CategoriaFormDialog,
    TallaFormDialog,
    ColorFormDialog,
  ],
  styleUrls: ['./catalogo-productos-page.css', './catalogo-productos-page-tabla.css'],
  templateUrl: './catalogo-productos-page.html',
})
export class CatalogoProductosPage {
  private readonly productosService = inject(ProductosService);
  private readonly categoriasService = inject(CategoriasService);
  private readonly tallasService = inject(TallasService);
  private readonly coloresService = inject(ColoresService);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly tabActiva = signal<TabCatalogo>('productos');

  // ===== Productos =====
  readonly productos = signal<Producto[]>([]);
  readonly cargandoProductos = signal(false);
  readonly errorProductos = signal<string | null>(null);
  readonly exitoProductos = signal<string | null>(null);
  readonly procesandoEstadoProducto = signal(false);

  /** Categorías completas (activas e inactivas) para filtro y formulario. */
  readonly categoriasCatalogo = signal<Categoria[]>([]);
  readonly cargandoCategoriasCatalogo = signal(false);
  readonly errorCategoriasCatalogo = signal<string | null>(null);

  readonly categoriasActivas = computed(() =>
    this.categoriasCatalogo().filter((categoria) => categoria.estado),
  );

  readonly filtrosProductos = new FormGroup({
    buscar: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(150)],
    }),
    categoriaId: new FormControl<number | null>(null),
    estado: new FormControl<FiltroEstado>('todos', { nonNullable: true }),
  });

  // ===== Categorías =====
  readonly categorias = signal<Categoria[]>([]);
  readonly cargandoCategorias = signal(false);
  readonly errorCategorias = signal<string | null>(null);
  readonly exitoCategorias = signal<string | null>(null);
  readonly procesandoEstadoCategoria = signal(false);
  readonly categoriasCargadas = signal(false);

  readonly filtrosCategorias = new FormGroup({
    buscar: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(150)],
    }),
    estado: new FormControl<FiltroEstado>('todos', { nonNullable: true }),
  });

  // ===== Tallas =====
  readonly tallas = signal<Talla[]>([]);
  readonly cargandoTallas = signal(false);
  readonly errorTallas = signal<string | null>(null);
  readonly exitoTallas = signal<string | null>(null);
  readonly procesandoEstadoTalla = signal(false);
  readonly tallasCargadas = signal(false);

  readonly filtrosTallas = new FormGroup({
    buscar: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(150)],
    }),
    estado: new FormControl<FiltroEstado>('todos', { nonNullable: true }),
  });

  // ===== Colores =====
  readonly colores = signal<Color[]>([]);
  readonly cargandoColores = signal(false);
  readonly errorColores = signal<string | null>(null);
  readonly exitoColores = signal<string | null>(null);
  readonly procesandoEstadoColor = signal(false);
  readonly coloresCargadas = signal(false);

  readonly filtrosColores = new FormGroup({
    buscar: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(150)],
    }),
    estado: new FormControl<FiltroEstado>('todos', { nonNullable: true }),
  });

  // ===== Diálogos =====
  readonly dialogoProductoAbierto = signal(false);
  readonly productoEnForm = signal<Producto | null>(null);
  readonly detalleProducto = signal<Producto | null>(null);
  readonly productoVariantes = signal<Producto | null>(null);
  readonly productoRecursos = signal<Producto | null>(null);
  readonly confirmacionProducto = signal<ConfirmacionProducto | null>(null);

  readonly dialogoCategoriaAbierto = signal(false);
  readonly categoriaEnForm = signal<Categoria | null>(null);
  readonly confirmacionCategoria = signal<ConfirmacionCategoria | null>(null);

  readonly dialogoTallaAbierto = signal(false);
  readonly tallaEnForm = signal<Talla | null>(null);
  readonly confirmacionTalla = signal<ConfirmacionTalla | null>(null);

  readonly dialogoColorAbierto = signal(false);
  readonly colorEnForm = signal<Color | null>(null);
  readonly confirmacionColor = signal<ConfirmacionColor | null>(null);

  constructor() {
    this.filtrosProductos.controls.estado.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.cargarProductos());
    this.filtrosProductos.controls.categoriaId.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.cargarProductos());
    this.filtrosCategorias.controls.estado.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.cargarCategorias());
    this.filtrosTallas.controls.estado.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.cargarTallas());
    this.filtrosColores.controls.estado.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.cargarColores());
  }

  ngOnInit(): void {
    this.cargarProductos();
    this.cargarCategoriasCatalogo();
  }

  // ===== Pestañas =====

  activarTab(tab: TabCatalogo): void {
    if (this.tabActiva() === tab) {
      return;
    }
    this.tabActiva.set(tab);
    if (tab === 'categorias' && !this.categoriasCargadas()) {
      this.cargarCategorias();
    }
    if (tab === 'tallas' && !this.tallasCargadas()) {
      this.cargarTallas();
    }
    if (tab === 'colores' && !this.coloresCargadas()) {
      this.cargarColores();
    }
  }

  esTabActiva(tab: TabCatalogo): boolean {
    return this.tabActiva() === tab;
  }

  // ===== Productos =====

  buscarProductos(): void {
    this.cargarProductos();
  }

  limpiarFiltrosProductos(): void {
    this.filtrosProductos.reset(
      { buscar: '', categoriaId: null, estado: 'todos' },
      { emitEvent: false },
    );
    this.cargarProductos();
  }

  tieneFiltrosProductos(): boolean {
    const valores = this.filtrosProductos.getRawValue();
    return Boolean(valores.buscar.trim() || valores.categoriaId !== null);
  }

  private cargarProductos(): void {
    this.cargandoProductos.set(true);
    this.errorProductos.set(null);

    const valores = this.filtrosProductos.getRawValue();
    this.productosService
      .listarProductosAdmin({
        buscar: valores.buscar.trim() || undefined,
        categoria_id: valores.categoriaId ?? undefined,
        estado: this.estadoAFiltro(valores.estado),
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (productos) => {
          this.cargandoProductos.set(false);
          this.productos.set(productos);
        },
        error: (error: unknown) => {
          this.cargandoProductos.set(false);
          this.productos.set([]);
          this.manejarError(error, 'productos');
        },
      });
  }

  private cargarCategoriasCatalogo(): void {
    this.cargandoCategoriasCatalogo.set(true);
    this.errorCategoriasCatalogo.set(null);
    this.categoriasService
      .listarCategoriasAdmin()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (categorias) => {
          this.cargandoCategoriasCatalogo.set(false);
          this.categoriasCatalogo.set(categorias);
          this.ajustarFiltroCategoria();
        },
        error: (error: unknown) => {
          this.cargandoCategoriasCatalogo.set(false);
          this.categoriasCatalogo.set([]);
          this.manejarError(error, 'categorias-catalogo');
        },
      });
  }

  /**
   * Si la categoría seleccionada en el filtro dejó de existir, se limpia para
   * no mantener una opción invisible.
   */
  private ajustarFiltroCategoria(): void {
    const seleccionada = this.filtrosProductos.controls.categoriaId.value;
    if (seleccionada === null) {
      return;
    }
    const existe = this.categoriasCatalogo().some(
      (categoria) => categoria.id === seleccionada,
    );
    if (!existe) {
      this.filtrosProductos.controls.categoriaId.setValue(null, {
        emitEvent: false,
      });
      this.cargarProductos();
    }
  }

  abrirNuevoProducto(): void {
    if (this.categoriasActivas().length === 0) {
      return;
    }
    this.productoEnForm.set(null);
    this.dialogoProductoAbierto.set(true);
  }

  abrirEditarProducto(producto: Producto): void {
    this.productoEnForm.set(producto);
    this.dialogoProductoAbierto.set(true);
  }

  cerrarDialogoProducto(): void {
    this.dialogoProductoAbierto.set(false);
    this.productoEnForm.set(null);
  }

  onProductoGuardado(producto: Producto): void {
    const editando = this.productoEnForm();
    this.cerrarDialogoProducto();
    this.exitoProductos.set(
      editando === null
        ? `Producto "${producto.nombre}" creado correctamente.`
        : `Producto "${producto.nombre}" actualizado correctamente.`,
    );
    this.cargarProductos();
  }

  verProducto(producto: Producto): void {
    this.detalleProducto.set(producto);
  }

  cerrarDetalleProducto(): void {
    this.detalleProducto.set(null);
  }

  gestionarVariantes(producto: Producto): void {
    this.productoVariantes.set(producto);
  }

  cerrarVariantes(): void {
    this.productoVariantes.set(null);
  }

  gestionarRecursos(producto: Producto): void {
    this.productoRecursos.set(producto);
  }

  cerrarRecursos(): void {
    this.productoRecursos.set(null);
  }

  solicitarCambioEstadoProducto(producto: Producto): void {
    if (this.procesandoEstadoProducto()) {
      return;
    }
    this.confirmacionProducto.set({ producto, habilitar: !producto.estado });
  }

  cancelarCambioEstadoProducto(): void {
    this.confirmacionProducto.set(null);
  }

  confirmarCambioEstadoProducto(): void {
    const pendiente = this.confirmacionProducto();
    this.confirmacionProducto.set(null);
    if (pendiente === null) {
      return;
    }

    const { producto, habilitar } = pendiente;
    this.procesandoEstadoProducto.set(true);
    this.errorProductos.set(null);
    this.exitoProductos.set(null);

    this.productosService
      .cambiarEstadoProducto(producto.id, habilitar)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (actualizado) => {
          this.procesandoEstadoProducto.set(false);
          this.exitoProductos.set(
            `Se ${habilitar ? 'habilitó' : 'deshabilitó'} el producto "${actualizado.nombre}".`,
          );
          this.cargarProductos();
        },
        error: (error: unknown) => {
          this.procesandoEstadoProducto.set(false);
          this.manejarError(error, 'productos');
        },
      });
  }

  // ===== Categorías =====

  buscarCategorias(): void {
    this.cargarCategorias();
  }

  limpiarFiltrosCategorias(): void {
    this.filtrosCategorias.reset(
      { buscar: '', estado: 'todos' },
      { emitEvent: false },
    );
    this.cargarCategorias();
  }

  tieneFiltrosCategorias(): boolean {
    return this.filtrosCategorias.controls.buscar.value.trim().length > 0;
  }

  private cargarCategorias(): void {
    this.cargandoCategorias.set(true);
    this.errorCategorias.set(null);
    const valores = this.filtrosCategorias.getRawValue();
    this.categoriasService
      .listarCategoriasAdmin({
        buscar: valores.buscar.trim() || undefined,
        estado: this.estadoAFiltro(valores.estado),
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (categorias) => {
          this.cargandoCategorias.set(false);
          this.categorias.set(categorias);
          this.categoriasCargadas.set(true);
        },
        error: (error: unknown) => {
          this.cargandoCategorias.set(false);
          this.categorias.set([]);
          this.manejarError(error, 'categorias');
        },
      });
  }

  abrirNuevaCategoria(): void {
    this.categoriaEnForm.set(null);
    this.dialogoCategoriaAbierto.set(true);
  }

  abrirEditarCategoria(categoria: Categoria): void {
    this.categoriaEnForm.set(categoria);
    this.dialogoCategoriaAbierto.set(true);
  }

  cerrarDialogoCategoria(): void {
    this.dialogoCategoriaAbierto.set(false);
    this.categoriaEnForm.set(null);
  }

  onCategoriaGuardada(categoria: Categoria): void {
    const editando = this.categoriaEnForm();
    this.cerrarDialogoCategoria();
    this.exitoCategorias.set(
      editando === null
        ? `Categoría "${categoria.nombre}" creada correctamente.`
        : `Categoría "${categoria.nombre}" actualizada correctamente.`,
    );
    this.cargarCategorias();
    this.cargarCategoriasCatalogo();
  }

  solicitarCambioEstadoCategoria(categoria: Categoria): void {
    if (this.procesandoEstadoCategoria()) {
      return;
    }
    this.confirmacionCategoria.set({ categoria, habilitar: !categoria.estado });
  }

  cancelarCambioEstadoCategoria(): void {
    this.confirmacionCategoria.set(null);
  }

  confirmarCambioEstadoCategoria(): void {
    const pendiente = this.confirmacionCategoria();
    this.confirmacionCategoria.set(null);
    if (pendiente === null) {
      return;
    }

    const { categoria, habilitar } = pendiente;
    this.procesandoEstadoCategoria.set(true);
    this.errorCategorias.set(null);
    this.exitoCategorias.set(null);

    this.categoriasService
      .cambiarEstadoCategoria(categoria.id, habilitar)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (actualizada) => {
          this.procesandoEstadoCategoria.set(false);
          this.exitoCategorias.set(
            `Se ${habilitar ? 'habilitó' : 'deshabilitó'} la categoría "${actualizada.nombre}".`,
          );
          this.cargarCategorias();
          this.cargarCategoriasCatalogo();
        },
        error: (error: unknown) => {
          this.procesandoEstadoCategoria.set(false);
          this.manejarError(error, 'categorias');
        },
      });
  }

  // ===== Tallas =====

  buscarTallas(): void {
    this.cargarTallas();
  }

  limpiarFiltrosTallas(): void {
    this.filtrosTallas.reset(
      { buscar: '', estado: 'todos' },
      { emitEvent: false },
    );
    this.cargarTallas();
  }

  tieneFiltrosTallas(): boolean {
    return this.filtrosTallas.controls.buscar.value.trim().length > 0;
  }

  private cargarTallas(): void {
    this.cargandoTallas.set(true);
    this.errorTallas.set(null);
    const valores = this.filtrosTallas.getRawValue();
    this.tallasService
      .listarTallas({
        buscar: valores.buscar.trim() || undefined,
        estado: this.estadoAFiltro(valores.estado),
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (tallas) => {
          this.cargandoTallas.set(false);
          this.tallas.set(tallas);
          this.tallasCargadas.set(true);
        },
        error: (error: unknown) => {
          this.cargandoTallas.set(false);
          this.tallas.set([]);
          this.manejarError(error, 'tallas');
        },
      });
  }

  abrirNuevaTalla(): void {
    this.tallaEnForm.set(null);
    this.dialogoTallaAbierto.set(true);
  }

  abrirEditarTalla(talla: Talla): void {
    this.tallaEnForm.set(talla);
    this.dialogoTallaAbierto.set(true);
  }

  cerrarDialogoTalla(): void {
    this.dialogoTallaAbierto.set(false);
    this.tallaEnForm.set(null);
  }

  onTallaGuardada(talla: Talla): void {
    const editando = this.tallaEnForm();
    this.cerrarDialogoTalla();
    this.exitoTallas.set(
      editando === null
        ? `Talla "${talla.nombre}" creada correctamente.`
        : `Talla "${talla.nombre}" actualizada correctamente.`,
    );
    this.cargarTallas();
  }

  solicitarCambioEstadoTalla(talla: Talla): void {
    if (this.procesandoEstadoTalla()) {
      return;
    }
    this.confirmacionTalla.set({ talla, habilitar: !talla.estado });
  }

  cancelarCambioEstadoTalla(): void {
    this.confirmacionTalla.set(null);
  }

  confirmarCambioEstadoTalla(): void {
    const pendiente = this.confirmacionTalla();
    this.confirmacionTalla.set(null);
    if (pendiente === null) {
      return;
    }

    const { talla, habilitar } = pendiente;
    this.procesandoEstadoTalla.set(true);
    this.errorTallas.set(null);
    this.exitoTallas.set(null);

    this.tallasService
      .cambiarEstadoTalla(talla.id, habilitar)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (actualizada) => {
          this.procesandoEstadoTalla.set(false);
          this.exitoTallas.set(
            `Se ${habilitar ? 'habilitó' : 'deshabilitó'} la talla "${actualizada.nombre}".`,
          );
          this.cargarTallas();
        },
        error: (error: unknown) => {
          this.procesandoEstadoTalla.set(false);
          this.manejarError(error, 'tallas');
        },
      });
  }

  // ===== Colores =====

  buscarColores(): void {
    this.cargarColores();
  }

  limpiarFiltrosColores(): void {
    this.filtrosColores.reset(
      { buscar: '', estado: 'todos' },
      { emitEvent: false },
    );
    this.cargarColores();
  }

  tieneFiltrosColores(): boolean {
    return this.filtrosColores.controls.buscar.value.trim().length > 0;
  }

  private cargarColores(): void {
    this.cargandoColores.set(true);
    this.errorColores.set(null);
    const valores = this.filtrosColores.getRawValue();
    this.coloresService
      .listarColores({
        buscar: valores.buscar.trim() || undefined,
        estado: this.estadoAFiltro(valores.estado),
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (colores) => {
          this.cargandoColores.set(false);
          this.colores.set(colores);
          this.coloresCargadas.set(true);
        },
        error: (error: unknown) => {
          this.cargandoColores.set(false);
          this.colores.set([]);
          this.manejarError(error, 'colores');
        },
      });
  }

  abrirNuevoColor(): void {
    this.colorEnForm.set(null);
    this.dialogoColorAbierto.set(true);
  }

  abrirEditarColor(color: Color): void {
    this.colorEnForm.set(color);
    this.dialogoColorAbierto.set(true);
  }

  cerrarDialogoColor(): void {
    this.dialogoColorAbierto.set(false);
    this.colorEnForm.set(null);
  }

  onColorGuardado(color: Color): void {
    const editando = this.colorEnForm();
    this.cerrarDialogoColor();
    this.exitoColores.set(
      editando === null
        ? `Color "${color.nombre}" creado correctamente.`
        : `Color "${color.nombre}" actualizado correctamente.`,
    );
    this.cargarColores();
  }

  solicitarCambioEstadoColor(color: Color): void {
    if (this.procesandoEstadoColor()) {
      return;
    }
    this.confirmacionColor.set({ color, habilitar: !color.estado });
  }

  cancelarCambioEstadoColor(): void {
    this.confirmacionColor.set(null);
  }

  confirmarCambioEstadoColor(): void {
    const pendiente = this.confirmacionColor();
    this.confirmacionColor.set(null);
    if (pendiente === null) {
      return;
    }

    const { color, habilitar } = pendiente;
    this.procesandoEstadoColor.set(true);
    this.errorColores.set(null);
    this.exitoColores.set(null);

    this.coloresService
      .cambiarEstadoColor(color.id, habilitar)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (actualizado) => {
          this.procesandoEstadoColor.set(false);
          this.exitoColores.set(
            `Se ${habilitar ? 'habilitó' : 'deshabilitó'} el color "${actualizado.nombre}".`,
          );
          this.cargarColores();
        },
        error: (error: unknown) => {
          this.procesandoEstadoColor.set(false);
          this.manejarError(error, 'colores');
        },
      });
  }

  // ===== Utilidades =====

  private estadoAFiltro(estado: FiltroEstado): boolean | undefined {
    if (estado === 'activos') {
      return true;
    }
    if (estado === 'inactivos') {
      return false;
    }
    return undefined;
  }

  mensajeVacioProductos(): string {
    if (this.tieneFiltrosProductos()) {
      return 'No hay productos que coincidan con los filtros aplicados.';
    }
    return 'Todavía no hay productos registrados en el catálogo.';
  }

  mensajeVacioCategorias(): string {
    if (this.tieneFiltrosCategorias()) {
      return 'No hay categorías que coincidan con la búsqueda.';
    }
    return 'Todavía no hay categorías registradas.';
  }

  mensajeVacioTallas(): string {
    if (this.tieneFiltrosTallas()) {
      return 'No hay tallas que coincidan con la búsqueda.';
    }
    return 'Todavía no hay tallas registradas.';
  }

  mensajeVacioColores(): string {
    if (this.tieneFiltrosColores()) {
      return 'No hay colores que coincidan con la búsqueda.';
    }
    return 'Todavía no hay colores registrados.';
  }

  // ===== Errores =====

  private manejarError(error: unknown, destino: DestinoError): void {
    const traducido = traducirErrorCatalogo(error);
    if (traducido.sesionExpirada) {
      this.cerrarSesion();
      return;
    }
    switch (destino) {
      case 'productos':
        this.errorProductos.set(traducido.mensaje);
        return;
      case 'categorias':
        this.errorCategorias.set(traducido.mensaje);
        return;
      case 'tallas':
        this.errorTallas.set(traducido.mensaje);
        return;
      case 'colores':
        this.errorColores.set(traducido.mensaje);
        return;
      case 'categorias-catalogo':
        this.errorCategoriasCatalogo.set(traducido.mensaje);
        return;
    }
  }

  private cerrarSesion(): void {
    this.authService.cerrarSesion();
    void this.router.navigateByUrl('/auth/personal/login');
  }
}
