import {
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  inject,
  signal,
  viewChild,
  viewChildren,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';

import { AdminIcon } from '../../../features/administracion/components/admin-icon/admin-icon';
import {
  TENANT_ROL_ADMINISTRADOR,
  TenantCategoria,
  TenantCategoriaCrear,
  TenantCategoriaEditar,
  TenantColor,
  TenantErrorNormalizado,
  TenantProducto,
  TenantProductoCrear,
  TenantProductoEditar,
  TenantTalla,
  TenantVariante,
  TenantVarianteCrear,
  TenantVarianteEditar,
} from '../../models/tenant.models';
import { SaasCatalogoService } from '../../services/saas-catalogo.service';
import { SaasErrorService } from '../../services/saas-error.service';
import { SaasSessionService } from '../../services/saas-session.service';
import { formatearBolivianos } from '../../utils/monto.util';

/** Pestañas del catálogo (orden de la navegación interna). */
type TabCatalogo = 'categorias' | 'productos';

/** Orden estable de las pestañas: también define el recorrido con flechas. */
const TABS_CATALOGO: readonly TabCatalogo[] = ['categorias', 'productos'];

/** Tamaño de página que exige la pantalla de productos (backend: máx. 100). */
const LIMITE_PRODUCTOS = 50;

/**
 * Precio aceptado por el formulario: hasta 10 dígitos enteros y 2 decimales.
 * Se admite coma o punto como separador decimal; se normaliza antes de enviar.
 */
const PATRON_PRECIO = /^\d{1,10}(?:[.,]\d{1,2})?$/;

/**
 * Catálogo de la empresa (`/tenant/catalogo/*`).
 *
 * Pestañas accesibles (Categorías y Productos) sobre el contrato real:
 * - Lectura: cualquier miembro de la empresa.
 * - Escritura: solo ADMINISTRADOR; la UI oculta los controles, pero la
 *   autorización real la aplica el backend (403).
 *
 * LIMITACIONES DEL CONTRATO (se advierten en pantalla):
 * - No existe `estado` ni `DELETE`: no hay activar, desactivar ni borrar.
 * - Las tallas y colores se eligen de los diccionarios globales
 *   (`GET /tenant/catalogo/tallas` y `/colores`); el contrato de variantes
 *   devuelve sus nombres, no sus identificadores.
 * - El listado de productos no devuelve un total: la paginación avanza con el
 *   tamaño de página.
 * - `precio` viaja como texto decimal (`"120.00"`); solo se formatea.
 */
@Component({
  selector: 'app-saas-catalogo-page',
  imports: [ReactiveFormsModule, AdminIcon],
  styleUrl: './saas-catalogo.page.css',
  templateUrl: './saas-catalogo.page.html',
})
export class SaasCatalogoPage {
  private readonly catalogoService = inject(SaasCatalogoService);
  private readonly sesion = inject(SaasSessionService);
  private readonly errores = inject(SaasErrorService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);

  readonly tabs = TABS_CATALOGO;
  readonly limiteProductos = LIMITE_PRODUCTOS;

  /** Pestaña activa. */
  readonly tabActiva = signal<TabCatalogo>('categorias');

  /** Botones de pestaña (recorrido con flechas). */
  private readonly botonesTab =
    viewChildren<ElementRef<HTMLButtonElement>>('tabBoton');

  // =============================== Permisos ===============================

  /** `true` cuando la membresía tiene rol ADMINISTRADOR (escrituras). */
  readonly esAdministrador = computed(
    () => normalizarRol(this.sesion.rol()) === TENANT_ROL_ADMINISTRADOR,
  );

  // ============================== Categorías ==============================

  readonly categorias = signal<TenantCategoria[]>([]);
  readonly cargandoCategorias = signal(true);
  readonly errorCategorias = signal<string | null>(null);

  readonly formCategoria = new FormGroup({
    nombre: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(100)],
    }),
    descripcion: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(255)],
    }),
  });

  /** Categoría en edición; `null` = el panel está en modo alta. */
  readonly categoriaEnEdicion = signal<TenantCategoria | null>(null);
  /** `true` mientras el panel de categoría está visible (alta o edición). */
  readonly categoriaFormVisible = signal(false);
  readonly guardandoCategoria = signal(false);
  readonly errorCategoria = signal<TenantErrorNormalizado | null>(null);

  private readonly categoriaNombreInput =
    viewChild<ElementRef<HTMLInputElement>>('categoriaNombreInput');

  // =============================== Productos ==============================

  readonly productos = signal<TenantProducto[]>([]);
  readonly cargandoProductos = signal(true);
  readonly errorProductos = signal<string | null>(null);

  /** Número de página (0-based); `offset = pagina * limite`. */
  readonly pagina = signal(0);
  readonly filtroCategoria = signal<number | null>(null);

  readonly offset = computed(() => this.pagina() * LIMITE_PRODUCTOS);

  /** El backend no envía total: solo se puede avanzar con una página llena. */
  readonly hayPaginaSiguiente = computed(
    () => this.productos().length === LIMITE_PRODUCTOS,
  );

  readonly textoRangoProductos = computed(() => {
    const total = this.productos().length;
    if (total === 0) {
      return 'Sin resultados en esta página';
    }
    const desde = this.offset() + 1;
    return `Mostrando ${desde}–${this.offset() + total} · página ${this.pagina() + 1}`;
  });

  readonly formProducto = new FormGroup({
    categoria_id: new FormControl<number | null>(null, {
      validators: [Validators.required, Validators.min(1)],
    }),
    nombre: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(150)],
    }),
    descripcion: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(1000)],
    }),
    precio: new FormControl('', {
      nonNullable: true,
      validators: [
        Validators.required,
        Validators.pattern(PATRON_PRECIO),
        precioPositivo,
      ],
    }),
  });

  /** Producto en edición; `null` = el panel está en modo alta. */
  readonly productoEnEdicion = signal<TenantProducto | null>(null);
  /** `true` mientras el panel de producto está visible (alta o edición). */
  readonly productoFormVisible = signal(false);
  readonly guardandoProducto = signal(false);
  readonly errorProducto = signal<TenantErrorNormalizado | null>(null);

  private readonly productoCategoriaInput =
    viewChild<ElementRef<HTMLSelectElement>>('productoCategoriaInput');
  private readonly productoNombreInput =
    viewChild<ElementRef<HTMLInputElement>>('productoNombreInput');
  private readonly productoPrecioInput =
    viewChild<ElementRef<HTMLInputElement>>('productoPrecioInput');

  // =============================== Variantes ==============================

  readonly productoSeleccionado = signal<TenantProducto | null>(null);
  readonly variantes = signal<TenantVariante[]>([]);
  readonly cargandoVariantes = signal(false);
  readonly errorVariantes = signal<string | null>(null);

  readonly formVariante = new FormGroup({
    sku: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(80)],
    }),
    // El alta exige talla y color; la edición solo envía los que se rellenen.
    talla_id: new FormControl<number | null>(null, {
      validators: [
        Validators.required,
        Validators.min(1),
        enteroPositivo,
      ],
    }),
    color_id: new FormControl<number | null>(null, {
      validators: [
        Validators.required,
        Validators.min(1),
        enteroPositivo,
      ],
    }),
  });

  /** Variante en edición; `null` = el panel está en modo alta. */
  readonly varianteEnEdicion = signal<TenantVariante | null>(null);
  /** `true` mientras el formulario de variante está visible. */
  readonly varianteFormVisible = signal(false);
  readonly guardandoVariante = signal(false);
  readonly errorVariante = signal<TenantErrorNormalizado | null>(null);

  private readonly varianteSkuInput =
    viewChild<ElementRef<HTMLInputElement>>('varianteSkuInput');
  private readonly varianteTallaInput =
    viewChild<ElementRef<HTMLSelectElement>>('varianteTallaInput');
  private readonly varianteColorInput =
    viewChild<ElementRef<HTMLSelectElement>>('varianteColorInput');

  // ===================== Diccionarios de talla y color ====================

  readonly tallas = signal<TenantTalla[]>([]);
  readonly colores = signal<TenantColor[]>([]);
  readonly cargandoTallas = signal(true);
  readonly cargandoColores = signal(true);
  readonly errorTallas = signal<string | null>(null);
  readonly errorColores = signal<string | null>(null);
  readonly tallasSinPermiso = signal(false);
  readonly coloresSinPermiso = signal(false);

  /** `true` si ambos diccionarios están disponibles para el alta. */
  readonly catalogosVarianteDisponibles = computed(
    () =>
      !this.cargandoTallas() &&
      !this.cargandoColores() &&
      this.tallas().length > 0 &&
      this.colores().length > 0 &&
      !this.tallasSinPermiso() &&
      !this.coloresSinPermiso(),
  );

  readonly avisoCatalogosVariante = computed(() => {
    if (this.tallasSinPermiso() || this.coloresSinPermiso()) {
      return 'Tu sesión no tiene el permiso CATALOGO/CONSULTAR: no se pueden consultar las tallas ni los colores, y el alta de variantes queda deshabilitada.';
    }
    if (this.errorTallas() !== null || this.errorColores() !== null) {
      return 'No se pudieron cargar los diccionarios de tallas o colores. El alta de variantes queda deshabilitada hasta reintentar.';
    }
    if (this.cargandoTallas() || this.cargandoColores()) {
      return 'Cargando los diccionarios de tallas y colores…';
    }
    if (this.tallas().length === 0 || this.colores().length === 0) {
      return 'El diccionario de tallas o el de colores llegó vacío. No es posible crear variantes hasta que el sistema tenga ambos catálogos.';
    }
    return null;
  });

  readonly mensajeExito = signal<string | null>(null);

  constructor() {
    this.cargarCategorias();
    this.cargarProductos();
    this.cargarTallas();
    this.cargarColores();
  }

  // =============================== Pestañas ===============================

  esTabActiva(tab: TabCatalogo): boolean {
    return this.tabActiva() === tab;
  }

  activarTab(tab: TabCatalogo): void {
    if (tab === this.tabActiva()) {
      return;
    }
    this.tabActiva.set(tab);
    this.mensajeExito.set(null);
    // Al cambiar de pestaña, ningún formulario debe quedar abierto a medias.
    this.cerrarFormularioCategoria();
    this.cerrarFormularioProducto();
  }

  /**
   * Recorrido de pestañas con teclado (patrón WAI-ARIA de tablist).
   *
   * Flechas izquierda/derecha mueven la selección; Inicio/Fin van a los
   * extremos. El foco sigue a la pestaña activa.
   */
  navegarTab(evento: KeyboardEvent, actual: TabCatalogo): void {
    const indice = TABS_CATALOGO.indexOf(actual);
    let destino: TabCatalogo | null = null;

    switch (evento.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        destino = TABS_CATALOGO[(indice + 1) % TABS_CATALOGO.length];
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        destino =
          TABS_CATALOGO[
            (indice - 1 + TABS_CATALOGO.length) % TABS_CATALOGO.length
          ];
        break;
      case 'Home':
        destino = TABS_CATALOGO[0];
        break;
      case 'End':
        destino = TABS_CATALOGO[TABS_CATALOGO.length - 1];
        break;
      default:
        return;
    }

    evento.preventDefault();
    this.activarTab(destino);
    this.enfocarTab(destino);
  }

  private enfocarTab(tab: TabCatalogo): void {
    const indice = TABS_CATALOGO.indexOf(tab);
    this.botonesTab()[indice]?.nativeElement.focus();
  }

  /**
   * Lleva el foco al campo indicado cuando el panel ya está renderizado.
   *
   * Al abrir un panel, el elemento todavía no existe en el DOM; por eso se
   * espera al siguiente render en lugar de intentar enfocar en el acto.
   */
  private enfocarAlRenderizar(
    obtener: () => ElementRef<HTMLElement> | undefined,
  ): void {
    afterNextRender(() => obtener()?.nativeElement.focus(), {
      injector: this.injector,
    });
  }

  // ============================== Categorías ==============================

  recargarCategorias(): void {
    if (this.cargandoCategorias()) {
      return;
    }
    this.cargarCategorias();
  }

  /** Abre el panel de alta de categoría. */
  abrirAltaCategoria(): void {
    if (!this.esAdministrador() || this.guardandoCategoria()) {
      return;
    }
    this.categoriaEnEdicion.set(null);
    this.categoriaFormVisible.set(true);
    this.formCategoria.reset({ nombre: '', descripcion: '' });
    this.errorCategoria.set(null);
    this.mensajeExito.set(null);
    this.enfocarAlRenderizar(() => this.categoriaNombreInput());
  }

  /** Carga la categoría en el panel para editarla. */
  editarCategoria(categoria: TenantCategoria): void {
    if (!this.esAdministrador() || this.guardandoCategoria()) {
      return;
    }
    this.categoriaEnEdicion.set(categoria);
    this.categoriaFormVisible.set(true);
    this.formCategoria.reset({
      nombre: categoria.nombre,
      descripcion: categoria.descripcion ?? '',
    });
    this.errorCategoria.set(null);
    this.mensajeExito.set(null);
    this.enfocarAlRenderizar(() => this.categoriaNombreInput());
  }

  /** Cierra el panel y descarta los cambios sin enviar. */
  cerrarFormularioCategoria(): void {
    if (this.guardandoCategoria()) {
      return;
    }
    this.categoriaEnEdicion.set(null);
    this.categoriaFormVisible.set(false);
    this.formCategoria.reset({ nombre: '', descripcion: '' });
    this.errorCategoria.set(null);
  }

  enviarCategoria(): void {
    if (this.guardandoCategoria()) {
      return;
    }

    this.formCategoria.markAllAsTouched();
    this.errorCategoria.set(null);
    this.mensajeExito.set(null);

    if (this.formCategoria.invalid) {
      this.enfocarPrimerErrorCategoria();
      return;
    }

    const valores = this.formCategoria.getRawValue();
    const nombre = valores.nombre.trim();
    const descripcion = valores.descripcion.trim();
    const original = this.categoriaEnEdicion();

    // `required` no detecta un nombre compuesto solo por espacios.
    if (nombre.length === 0) {
      this.formCategoria.controls.nombre.setErrors({ required: true });
      this.formCategoria.controls.nombre.markAsTouched();
      this.enfocarPrimerErrorCategoria();
      return;
    }

    this.guardandoCategoria.set(true);

    if (original === null) {
      const dto: TenantCategoriaCrear = { nombre };
      if (descripcion.length > 0) {
        dto.descripcion = descripcion;
      }
      this.catalogoService
        .crearCategoria(dto)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (categoria) => {
            this.guardandoCategoria.set(false);
            this.cerrarFormularioCategoria();
            this.mensajeExito.set(
              `Categoría «${categoria.nombre}» creada correctamente.`,
            );
            this.cargarCategorias();
          },
          error: (error: unknown) => {
            this.guardandoCategoria.set(false);
            this.errorCategoria.set(
              this.errores.normalizar(error, 'catalogo/categoria/crear'),
            );
            this.enfocarPrimerErrorCategoria();
          },
        });
      return;
    }

    const dto: TenantCategoriaEditar = {};
    if (nombre !== original.nombre) {
      dto.nombre = nombre;
    }
    if (descripcion !== (original.descripcion ?? '')) {
      dto.descripcion = descripcion;
    }

    if (Object.keys(dto).length === 0) {
      this.guardandoCategoria.set(false);
      this.mensajeExito.set('No cambiaste ningún dato de la categoría.');
      return;
    }

    this.catalogoService
      .editarCategoria(original.id, dto)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (categoria) => {
          this.guardandoCategoria.set(false);
          this.cerrarFormularioCategoria();
          this.mensajeExito.set(
            `Categoría «${categoria.nombre}» actualizada.`,
          );
          this.cargarCategorias();
          // El nombre de la categoría también aparece en la tabla de productos.
          this.cargarProductos();
        },
        error: (error: unknown) => {
          this.guardandoCategoria.set(false);
          this.errorCategoria.set(
            this.errores.normalizar(error, 'catalogo/categoria/editar'),
          );
          this.enfocarPrimerErrorCategoria();
        },
      });
  }

  // =============================== Productos ==============================

  recargarProductos(): void {
    if (this.cargandoProductos()) {
      return;
    }
    this.cargarProductos();
  }

  /** Cambia el filtro por categoría y vuelve a la primera página. */
  cambiarFiltroCategoria(evento: Event): void {
    const objetivo = evento.target;
    if (!(objetivo instanceof HTMLSelectElement)) {
      return;
    }
    const valor = Number.parseInt(objetivo.value, 10);
    this.filtroCategoria.set(Number.isFinite(valor) && valor > 0 ? valor : null);
    this.pagina.set(0);
    this.cargarProductos();
  }

  paginaSiguiente(): void {
    if (!this.hayPaginaSiguiente() || this.cargandoProductos()) {
      return;
    }
    this.pagina.update((valor) => valor + 1);
    this.cargarProductos();
  }

  paginaAnterior(): void {
    if (this.pagina() === 0 || this.cargandoProductos()) {
      return;
    }
    this.pagina.update((valor) => valor - 1);
    this.cargarProductos();
  }

  /** Abre el panel de alta de producto. */
  abrirAltaProducto(): void {
    if (!this.esAdministrador() || this.guardandoProducto()) {
      return;
    }
    this.productoEnEdicion.set(null);
    this.productoFormVisible.set(true);
    this.formProducto.reset({
      categoria_id: this.filtroCategoria(),
      nombre: '',
      descripcion: '',
      precio: '',
    });
    this.errorProducto.set(null);
    this.mensajeExito.set(null);
    this.enfocarAlRenderizar(() => this.productoNombreInput());
  }

  /** Carga el producto en el panel para editarlo. */
  editarProducto(producto: TenantProducto): void {
    if (!this.esAdministrador() || this.guardandoProducto()) {
      return;
    }
    this.productoEnEdicion.set(producto);
    this.productoFormVisible.set(true);
    this.formProducto.reset({
      categoria_id: producto.categoria_id,
      nombre: producto.nombre,
      descripcion: producto.descripcion ?? '',
      precio: formatearNumeroEditable(producto.precio),
    });
    this.errorProducto.set(null);
    this.mensajeExito.set(null);
    this.enfocarAlRenderizar(() => this.productoNombreInput());
  }

  cerrarFormularioProducto(): void {
    if (this.guardandoProducto()) {
      return;
    }
    this.productoEnEdicion.set(null);
    this.productoFormVisible.set(false);
    this.formProducto.reset({
      categoria_id: null,
      nombre: '',
      descripcion: '',
      precio: '',
    });
    this.errorProducto.set(null);
  }

  enviarProducto(): void {
    if (this.guardandoProducto()) {
      return;
    }

    this.formProducto.markAllAsTouched();
    this.errorProducto.set(null);
    this.mensajeExito.set(null);

    if (this.formProducto.invalid) {
      this.enfocarPrimerErrorProducto();
      return;
    }

    const valores = this.formProducto.getRawValue();
    const categoriaId = valores.categoria_id;
    if (categoriaId === null || !esEnteroPositivo(categoriaId)) {
      this.enfocarPrimerErrorProducto();
      return;
    }

    const nombre = valores.nombre.trim();
    const descripcion = valores.descripcion.trim();
    const precio = normalizarPrecio(valores.precio);
    if (precio === null) {
      this.enfocarPrimerErrorProducto();
      return;
    }

    // `required` no detecta un nombre compuesto solo por espacios.
    if (nombre.length === 0) {
      this.formProducto.controls.nombre.setErrors({ required: true });
      this.formProducto.controls.nombre.markAsTouched();
      this.enfocarPrimerErrorProducto();
      return;
    }

    const original = this.productoEnEdicion();
    this.guardandoProducto.set(true);

    if (original === null) {
      const dto: TenantProductoCrear = {
        categoria_id: categoriaId,
        nombre,
        precio,
      };
      if (descripcion.length > 0) {
        dto.descripcion = descripcion;
      }
      this.catalogoService
        .crearProducto(dto)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (producto) => {
            this.guardandoProducto.set(false);
            this.cerrarFormularioProducto();
            this.mensajeExito.set(
              `Producto «${producto.nombre}» creado correctamente.`,
            );
            this.pagina.set(0);
            this.cargarProductos();
          },
          error: (error: unknown) => {
            this.guardandoProducto.set(false);
            this.errorProducto.set(
              this.errores.normalizar(error, 'catalogo/producto/crear'),
            );
            this.enfocarPrimerErrorProducto();
          },
        });
      return;
    }

    const dto: TenantProductoEditar = {};
    if (categoriaId !== original.categoria_id) {
      dto.categoria_id = categoriaId;
    }
    if (nombre !== original.nombre) {
      dto.nombre = nombre;
    }
    if (descripcion !== (original.descripcion ?? '')) {
      dto.descripcion = descripcion;
    }
    if (Math.abs(precio - Number(original.precio)) > 0.000001) {
      dto.precio = precio;
    }

    if (Object.keys(dto).length === 0) {
      this.guardandoProducto.set(false);
      this.mensajeExito.set('No cambiaste ningún dato del producto.');
      return;
    }

    this.catalogoService
      .editarProducto(original.id, dto)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (producto) => {
          this.guardandoProducto.set(false);
          this.cerrarFormularioProducto();
          this.mensajeExito.set(`Producto «${producto.nombre}» actualizado.`);
          if (this.productoSeleccionado()?.id === producto.id) {
            this.productoSeleccionado.set(producto);
          }
          this.cargarProductos();
        },
        error: (error: unknown) => {
          this.guardandoProducto.set(false);
          this.errorProducto.set(
            this.errores.normalizar(error, 'catalogo/producto/editar'),
          );
          this.enfocarPrimerErrorProducto();
        },
      });
  }

  // =============================== Variantes ==============================

  /** Selecciona un producto y carga sus variantes. */
  verVariantes(producto: TenantProducto): void {
    this.productoSeleccionado.set(producto);
    this.varianteEnEdicion.set(null);
    this.varianteFormVisible.set(false);
    this.aplicarValidadoresVariante(false);
    this.formVariante.reset({ sku: '', talla_id: null, color_id: null });
    this.errorVariante.set(null);
    this.cargarVariantes(producto.id);
  }

  cerrarDetalle(): void {
    if (this.guardandoVariante()) {
      return;
    }
    this.productoSeleccionado.set(null);
    this.variantes.set([]);
    this.errorVariantes.set(null);
    this.varianteEnEdicion.set(null);
    this.varianteFormVisible.set(false);
    this.aplicarValidadoresVariante(false);
    this.formVariante.reset({ sku: '', talla_id: null, color_id: null });
    this.errorVariante.set(null);
  }

  recargarVariantes(): void {
    const producto = this.productoSeleccionado();
    if (producto === null || this.cargandoVariantes()) {
      return;
    }
    this.cargarVariantes(producto.id);
  }

  /** Abre el alta de variante para el producto seleccionado. */
  abrirAltaVariante(): void {
    if (
      !this.esAdministrador() ||
      this.guardandoVariante() ||
      !this.catalogosVarianteDisponibles()
    ) {
      return;
    }
    this.varianteEnEdicion.set(null);
    this.varianteFormVisible.set(true);
    this.aplicarValidadoresVariante(false);
    this.formVariante.reset({ sku: '', talla_id: null, color_id: null });
    this.errorVariante.set(null);
    this.mensajeExito.set(null);
    this.enfocarAlRenderizar(() => this.varianteSkuInput());
  }

  /**
   * Prepara la edición de una variante.
   *
   * El contrato solo devuelve los NOMBRES de talla y color: los identificadores
   * numéricos actuales no están expuestos. Por eso se precarga el SKU y los
   * campos numéricos quedan vacíos y opcionales (solo viajan si se rellenan).
   */
  editarVariante(variante: TenantVariante): void {
    if (!this.esAdministrador() || this.guardandoVariante()) {
      return;
    }
    this.varianteEnEdicion.set(variante);
    this.varianteFormVisible.set(true);
    this.aplicarValidadoresVariante(true);
    this.formVariante.reset({
      sku: variante.sku,
      talla_id: null,
      color_id: null,
    });
    this.errorVariante.set(null);
    this.mensajeExito.set(null);
    this.enfocarAlRenderizar(() => this.varianteSkuInput());
  }

  cerrarFormularioVariante(): void {
    if (this.guardandoVariante()) {
      return;
    }
    this.varianteEnEdicion.set(null);
    this.varianteFormVisible.set(false);
    this.aplicarValidadoresVariante(false);
    this.formVariante.reset({ sku: '', talla_id: null, color_id: null });
    this.errorVariante.set(null);
  }

  enviarVariante(): void {
    if (this.guardandoVariante()) {
      return;
    }

    const producto = this.productoSeleccionado();
    if (producto === null) {
      return;
    }

    this.formVariante.markAllAsTouched();
    this.errorVariante.set(null);
    this.mensajeExito.set(null);

    if (this.formVariante.invalid) {
      this.enfocarPrimerErrorVariante();
      return;
    }

    const valores = this.formVariante.getRawValue();
    const sku = valores.sku.trim();
    const tallaId = valores.talla_id;
    const colorId = valores.color_id;
    const original = this.varianteEnEdicion();
    const esEdicion = original !== null;

    if (sku.length === 0) {
      this.formVariante.controls.sku.setErrors({ required: true });
      this.formVariante.controls.sku.markAsTouched();
      this.enfocarPrimerErrorVariante();
      return;
    }
    if (!esEdicion && (tallaId === null || colorId === null)) {
      this.enfocarPrimerErrorVariante();
      return;
    }
    if (tallaId !== null && !esEnteroPositivo(tallaId)) {
      this.enfocarPrimerErrorVariante();
      return;
    }
    if (colorId !== null && !esEnteroPositivo(colorId)) {
      this.enfocarPrimerErrorVariante();
      return;
    }

    this.guardandoVariante.set(true);

    if (!esEdicion) {
      const dto: TenantVarianteCrear = {
        sku,
        talla_id: tallaId as number,
        color_id: colorId as number,
      };
      this.catalogoService
        .crearVariante(producto.id, dto)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (variante) => {
            this.guardandoVariante.set(false);
            this.cerrarFormularioVariante();
            this.mensajeExito.set(
              `Variante ${variante.sku} agregada al producto.`,
            );
            this.cargarVariantes(producto.id);
          },
          error: (error: unknown) => {
            this.guardandoVariante.set(false);
            this.errorVariante.set(
              this.errores.normalizar(error, 'catalogo/variante/crear'),
            );
            this.enfocarPrimerErrorVariante();
          },
        });
      return;
    }

    const dto: TenantVarianteEditar = { sku };
    if (tallaId !== null) {
      dto.talla_id = tallaId;
    }
    if (colorId !== null) {
      dto.color_id = colorId;
    }

    this.catalogoService
      .editarVariante(original.id, dto)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (variante) => {
          this.guardandoVariante.set(false);
          this.cerrarFormularioVariante();
          this.mensajeExito.set(`Variante ${variante.sku} actualizada.`);
          this.cargarVariantes(producto.id);
        },
        error: (error: unknown) => {
          this.guardandoVariante.set(false);
          this.errorVariante.set(
            this.errores.normalizar(error, 'catalogo/variante/editar'),
          );
          this.enfocarPrimerErrorVariante();
        },
      });
  }

  // ============================== Presentación ===========================

  /** Precio del backend como `Bs 120.00` (nunca se recalcula). */
  precio(valor: string | null | undefined): string {
    return formatearBolivianos(valor);
  }

  /** Texto corto de la descripción, con marca de recorte. */
  descripcionCorta(descripcion: string | null | undefined): string {
    const texto = (descripcion ?? '').trim();
    if (texto.length === 0) {
      return '—';
    }
    return texto.length > 90 ? `${texto.slice(0, 90)}…` : texto;
  }

  /** Nombre de la categoría para el filtro por identificador. */
  nombreCategoria(categoriaId: number): string {
    return (
      this.categorias().find((categoria) => categoria.id === categoriaId)
        ?.nombre ?? `Categoría #${categoriaId}`
    );
  }

  // ============================== Validación =============================

  mensajeCategoriaNombre(): string | null {
    return mensajeDeControl(this.formCategoria.controls.nombre, {
      required: 'Ingresa el nombre de la categoría.',
      maxlength: 'El nombre admite como máximo 100 caracteres.',
    });
  }

  mensajeCategoriaDescripcion(): string | null {
    return mensajeDeControl(this.formCategoria.controls.descripcion, {
      maxlength: 'La descripción admite como máximo 255 caracteres.',
    });
  }

  mensajeProductoCategoria(): string | null {
    return mensajeDeControl(this.formProducto.controls.categoria_id, {
      required: 'Selecciona la categoría del producto.',
      min: 'Selecciona una categoría válida.',
    });
  }

  mensajeProductoNombre(): string | null {
    return mensajeDeControl(this.formProducto.controls.nombre, {
      required: 'Ingresa el nombre del producto.',
      maxlength: 'El nombre admite como máximo 150 caracteres.',
    });
  }

  mensajeProductoDescripcion(): string | null {
    return mensajeDeControl(this.formProducto.controls.descripcion, {
      maxlength: 'La descripción admite como máximo 1000 caracteres.',
    });
  }

  mensajeProductoPrecio(): string | null {
    const control = this.formProducto.controls.precio;
    if (control.untouched || !control.invalid) {
      return null;
    }
    if (control.hasError('required')) {
      return 'Ingresa el precio del producto.';
    }
    if (control.hasError('pattern')) {
      return 'El precio admite hasta 2 decimales (por ejemplo, 149.90).';
    }
    if (control.hasError('precioPositivo')) {
      return 'El precio debe ser mayor que 0.';
    }
    return 'Revisa el precio.';
  }

  mensajeVarianteSku(): string | null {
    return mensajeDeControl(this.formVariante.controls.sku, {
      required: 'Ingresa el SKU de la variante.',
      maxlength: 'El SKU admite como máximo 80 caracteres.',
    });
  }

  mensajeVarianteTalla(): string | null {
    return mensajeIdentificadorVariante(
      this.formVariante.controls.talla_id,
      'la talla',
    );
  }

  mensajeVarianteColor(): string | null {
    return mensajeIdentificadorVariante(
      this.formVariante.controls.color_id,
      'el color',
    );
  }  /** Etiqueta del botón de envío de la variante. */
  readonly textoBotonVariante = computed(() =>
    this.varianteEnEdicion() === null
      ? 'Agregar variante'
      : 'Guardar cambios',
  );

  // ================================ Interno ==============================

  /** Reintenta el diccionario de tallas (no bloquea el resto de la pantalla). */
  recargarTallas(): void {
    if (this.cargandoTallas()) {
      return;
    }
    this.cargarTallas();
  }

  /** Reintenta el diccionario de colores (no bloquea el resto de la pantalla). */
  recargarColores(): void {
    if (this.cargandoColores()) {
      return;
    }
    this.cargarColores();
  }

  private cargarTallas(): void {
    this.cargandoTallas.set(true);
    this.errorTallas.set(null);
    this.tallasSinPermiso.set(false);

    this.catalogoService
      .listarTallas()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (tallas) => {
          this.tallas.set(
            [...tallas].sort((a, b) => a.nombre.localeCompare(b.nombre)),
          );
          this.cargandoTallas.set(false);
        },
        error: (error: unknown) => {
          this.tallas.set([]);
          this.cargandoTallas.set(false);
          const normalizado = this.errores.normalizar(
            error,
            'catalogo/tallas',
          );
          if (normalizado.estado === 403) {
            this.tallasSinPermiso.set(true);
          }
          this.errorTallas.set(normalizado.mensaje);
        },
      });
  }

  private cargarColores(): void {
    this.cargandoColores.set(true);
    this.errorColores.set(null);
    this.coloresSinPermiso.set(false);

    this.catalogoService
      .listarColores()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (colores) => {
          this.colores.set(
            [...colores].sort((a, b) => a.nombre.localeCompare(b.nombre)),
          );
          this.cargandoColores.set(false);
        },
        error: (error: unknown) => {
          this.colores.set([]);
          this.cargandoColores.set(false);
          const normalizado = this.errores.normalizar(
            error,
            'catalogo/colores',
          );
          if (normalizado.estado === 403) {
            this.coloresSinPermiso.set(true);
          }
          this.errorColores.set(normalizado.mensaje);
        },
      });
  }

  private cargarCategorias(): void {
    this.cargandoCategorias.set(true);
    this.errorCategorias.set(null);

    this.catalogoService
      .listarCategorias()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (categorias) => {
          this.categorias.set(
            [...categorias].sort((a, b) => a.nombre.localeCompare(b.nombre)),
          );
          this.cargandoCategorias.set(false);
        },
        error: (error: unknown) => {
          this.categorias.set([]);
          this.cargandoCategorias.set(false);
          this.errorCategorias.set(
            this.errores.mensajeDeError(error, 'catalogo/categorias'),
          );
        },
      });
  }

  private cargarProductos(): void {
    this.cargandoProductos.set(true);
    this.errorProductos.set(null);

    // Identifican la petición vigente: si el filtro o la página cambian antes
    // de que llegue la respuesta, esa respuesta se descarta.
    const paginaSolicitada = this.pagina();
    const filtroSolicitado = this.filtroCategoria();

    this.catalogoService
      .listarProductos({
        categoria_id: filtroSolicitado,
        limit: LIMITE_PRODUCTOS,
        offset: paginaSolicitada * LIMITE_PRODUCTOS,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (productos) => {
          if (!this.esRespuestaVigente(paginaSolicitada, filtroSolicitado)) {
            return;
          }
          this.productos.set(
            [...productos].sort((a, b) => a.nombre.localeCompare(b.nombre)),
          );
          this.cargandoProductos.set(false);
        },
        error: (error: unknown) => {
          if (!this.esRespuestaVigente(paginaSolicitada, filtroSolicitado)) {
            return;
          }
          this.productos.set([]);
          this.cargandoProductos.set(false);
          this.errorProductos.set(
            this.errores.mensajeDeError(error, 'catalogo/productos'),
          );
        },
      });
  }

  /** `true` si la página y el filtro siguen siendo los de la petición. */
  private esRespuestaVigente(
    paginaSolicitada: number,
    filtroSolicitado: number | null,
  ): boolean {
    return (
      this.pagina() === paginaSolicitada &&
      this.filtroCategoria() === filtroSolicitado
    );
  }

  private cargarVariantes(productoId: number): void {
    this.cargandoVariantes.set(true);
    this.errorVariantes.set(null);

    this.catalogoService
      .listarVariantes(productoId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (variantes) => {
          // Si ya se seleccionó otro producto, la respuesta es obsoleta.
          if (this.productoSeleccionado()?.id !== productoId) {
            return;
          }
          this.variantes.set(
            [...variantes].sort((a, b) => a.sku.localeCompare(b.sku)),
          );
          this.cargandoVariantes.set(false);
        },
        error: (error: unknown) => {
          if (this.productoSeleccionado()?.id !== productoId) {
            return;
          }
          this.variantes.set([]);
          this.cargandoVariantes.set(false);
          this.errorVariantes.set(
            this.errores.mensajeDeError(error, 'catalogo/variantes'),
          );
        },
      });
  }

  /**
   * Ajusta los validadores de talla/color según el modo del formulario.
   *
   * En el alta son obligatorios; en la edición son opcionales porque el
   * contrato no publica sus identificadores actuales.
   */
  private aplicarValidadoresVariante(esEdicion: boolean): void {
    const talla = this.formVariante.controls.talla_id;
    const color = this.formVariante.controls.color_id;
    const validadores = esEdicion
      ? [Validators.min(1), enteroPositivo]
      : [Validators.required, Validators.min(1), enteroPositivo];

    talla.setValidators(validadores);
    color.setValidators(validadores);
    talla.updateValueAndValidity({ emitEvent: false });
    color.updateValueAndValidity({ emitEvent: false });
  }

  private enfocarPrimerErrorCategoria(): void {
    if (this.formCategoria.controls.nombre.invalid) {
      this.enfocarAlRenderizar(() => this.categoriaNombreInput());
    }
  }

  private enfocarPrimerErrorProducto(): void {
    const candidatos: Array<[boolean, ElementRef<HTMLElement> | undefined]> = [
      [this.formProducto.controls.categoria_id.invalid, this.productoCategoriaInput()],
      [this.formProducto.controls.nombre.invalid, this.productoNombreInput()],
      [this.formProducto.controls.precio.invalid, this.productoPrecioInput()],
    ];
    for (const [invalido, referencia] of candidatos) {
      if (invalido && referencia !== undefined) {
        referencia.nativeElement.focus();
        return;
      }
    }
  }

  private enfocarPrimerErrorVariante(): void {
    const candidatos: Array<[boolean, ElementRef<HTMLElement> | undefined]> = [
      [this.formVariante.controls.sku.invalid, this.varianteSkuInput()],
      [this.formVariante.controls.talla_id.invalid, this.varianteTallaInput()],
      [this.formVariante.controls.color_id.invalid, this.varianteColorInput()],
    ];
    for (const [invalido, referencia] of candidatos) {
      if (invalido && referencia !== undefined) {
        referencia.nativeElement.focus();
        return;
      }
    }
  }
}

/** Normaliza un nombre de rol para compararlo (mayúsculas, sin espacios). */
function normalizarRol(rol: string | null | undefined): string {
  return (rol ?? '').trim().toUpperCase();
}

/** `true` si el valor es un entero >= 1. */
function esEnteroPositivo(valor: unknown): valor is number {
  return typeof valor === 'number' && Number.isInteger(valor) && valor >= 1;
}

/** Validación de precio mayor que cero (complementa al patrón de decimales). */
function precioPositivo(control: AbstractControl): ValidationErrors | null {
  const texto = String(control.value ?? '').trim();
  if (texto.length === 0) {
    return null;
  }
  const numero = Number(texto.replace(',', '.'));
  return Number.isFinite(numero) && numero > 0 ? null : { precioPositivo: true };
}

/** Exige un entero >= 1 cuando el campo tiene valor (null lo resuelve `required`). */
function enteroPositivo(control: AbstractControl): ValidationErrors | null {
  const valor = control.value;
  if (valor === null || valor === undefined || valor === '') {
    return null;
  }
  const numero = Number(valor);
  return Number.isInteger(numero) && numero >= 1
    ? null
    : { enteroPositivo: true };
}

/** Convierte el texto del formulario en número con 2 decimales. */
function normalizarPrecio(texto: string): number | null {
  const limpio = texto.trim().replace(',', '.');
  const numero = Number(limpio);
  if (!Number.isFinite(numero) || numero <= 0) {
    return null;
  }
  return Math.round(numero * 100) / 100;
}

/** Precio del backend (`"120.00"`) listo para editarse en el formulario. */
function formatearNumeroEditable(precio: string): string {
  const numero = Number(precio);
  return Number.isFinite(numero) ? numero.toFixed(2) : '';
}

/** Mensaje de error visible de un control (solo si ya fue tocado). */
function mensajeDeControl(
  control: AbstractControl,
  mensajes: Record<string, string>,
): string | null {
  if (control.untouched || !control.invalid) {
    return null;
  }
  for (const [clave, mensaje] of Object.entries(mensajes)) {
    if (control.hasError(clave)) {
      return mensaje;
    }
  }
  return 'Revisa este campo.';
}

/**
 * Mensaje de los selectores de talla/color.
 *
 * En el alta el campo es obligatorio; en la edición es opcional y solo se
 * valida cuando el usuario elige un valor.
 */
function mensajeIdentificadorVariante(
  control: AbstractControl,
  campo: string,
): string | null {
  if (control.untouched || !control.invalid) {
    return null;
  }
  if (control.hasError('required')) {
    return `Selecciona ${campo} de la variante.`;
  }
  return `Selecciona un valor válido para ${campo}.`;
}
