import { DecimalPipe, Location } from '@angular/common';
import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { obtenerEmpresaSlugPublica } from '../../../../core/config/empresa-publica';
import { SAAS_MODE } from '../../../../core/config/app-mode';
import { AuthService } from '../../../autenticacion-seguridad/auth/services/auth.service';
import { SeleccionCarrito } from '../../../carrito/models/carrito.model';
import { CarritoService } from '../../../carrito/services/carrito.service';
import { SucursalCompraService } from '../../../carrito/services/sucursal-compra.service';
import { traducirErrorCarrito } from '../../../carrito/utils/carrito-error.util';
import {
  mensajeTemporadaNoResuelta,
  resolverTemporadaId,
} from '../../../carrito/utils/carrito-temporada.util';
import { TenantApiService } from '../../../saas/services/tenant-api.service';
import { ToastService } from '../../../../core/services/toast.service';
import { ConfirmDialog } from '../../../../shared/components/confirm-dialog/confirm-dialog';
import { Navbar } from '../../../home/components/navbar/navbar';
import { DisponibilidadProducto } from '../../components/disponibilidad-producto/disponibilidad-producto';
import { ProductoMedia } from '../../components/producto-media/producto-media';
import { CatalogoFiltros } from '../../models/catalogo-filtros.model';
import {
  DisponibilidadFila,
  InventarioPublico,
  ProductoPublicoDetalle,
  PublicoCategoria,
  RecursoPublico,
  VariantePublica,
} from '../../models/catalogo-publico.model';
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
 * ni pagos (CU15 se conecta aparte).
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
  private readonly catalogoService = inject(CatalogoService);
  private readonly carritoService = inject(CarritoService);
  readonly sucursalCompra = inject(SucursalCompraService);
  private readonly authService = inject(AuthService);
  private readonly tenantApi = inject(TenantApiService);
  private readonly toast = inject(ToastService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  private readonly destroyRef = inject(DestroyRef);

  /** Modo de compilación: SaaS (tenant) o legacy (primer parcial). */
  readonly saasMode = inject(SAAS_MODE);

  readonly producto = signal<ProductoPublicoDetalle | null>(null);
  readonly cargando = signal(false);
  readonly error = signal<string | null>(null);

  readonly filtros = signal<CatalogoFiltros | null>(null);

  readonly indiceImagen = signal(0);

  readonly productoId = signal<number | null>(null);

  // ===== Disponibilidad (SaaS desde el detalle; legacy desde su endpoint) =====

  readonly disponibilidad = signal<DisponibilidadFila[]>([]);
  readonly cargandoDisponibilidad = signal(false);
  readonly errorDisponibilidad = signal<string | null>(null);

  /**
   * Recursos de imagen del detalle, con la imagen principal primero y el resto
   * en el orden entregado por el backend. No se ordena por nombre de archivo
   * ni se asume la cantidad de recursos.
   */
  readonly recursosImagenes = computed<RecursoPublico[]>(() => {
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

  readonly imagenActiva = computed<RecursoPublico | null>(() => {
    const imagenes = this.recursosImagenes();
    if (imagenes.length === 0) {
      return null;
    }
    return imagenes[this.indiceActivo()] ?? imagenes[0];
  });

  readonly variantesActivas = computed<VariantePublica[]>(() =>
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

  /**
   * Unidades disponibles en total.
   *
   * En SaaS proviene de `disponibilidad[]` (del detalle); en legacy proviene de
   * los inventarios anidados de las variantes. Solo uno de los dos está
   * presente según el modo, por lo que se suman ambos de forma segura.
   */
  readonly inventarioTotal = computed(() => {
    const producto = this.producto();
    if (producto === null) {
      return 0;
    }
    const desdeDisponibilidad = producto.disponibilidad.reduce(
      (total, fila) => total + Math.max(0, fila.stock_disponible),
      0,
    );
    const desdeInventarios = producto.variantes.reduce(
      (total, variante) =>
        total +
        (variante.inventarios ?? []).reduce(
          (suma, inventario) => suma + Math.max(0, inventario.stock_disponible),
          0,
        ),
      0,
    );
    return desdeDisponibilidad + desdeInventarios;
  });

  // ===== Carrito (CU15) =====

  readonly tallaElegida = signal<number | null>(null);
  readonly colorElegido = signal<number | null>(null);
  /** Nombre de la temporada elegida (SaaS); el id se resuelve sin ambigüedad. */
  readonly temporadaElegida = signal<string | null>(null);
  readonly cantidad = signal(1);
  readonly agregando = signal(false);
  readonly mostrarAvisoIdentificacion = signal(false);

  /** Variante que coincide con la talla y el color elegidos. */
  readonly varianteElegida = computed<VariantePublica | null>(() => {
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

  // ===== Selección SaaS: variante + sucursal + temporada =====

  /** Filas de disponibilidad de la variante elegida (SaaS). */
  readonly disponibilidadVariante = computed<DisponibilidadFila[]>(() => {
    const variante = this.varianteElegida();
    if (variante === null) {
      return [];
    }
    return this.disponibilidad().filter(
      (fila) => fila.variante_id === variante.id,
    );
  });

  /** Sucursales con stock real para la variante elegida (SaaS). */
  readonly sucursalesDisponibles = computed<PublicoCategoria[]>(() => {
    const mapa = new Map<number, string>();
    for (const fila of this.disponibilidadVariante()) {
      if (fila.stock_disponible > 0) {
        mapa.set(fila.sucursal_id, fila.sucursal);
      }
    }
    return [...mapa.entries()].map(([id, nombre]) => ({ id, nombre }));
  });

  /**
   * Sucursales ofrecidas en el selector.
   * - Legacy: todas las sucursales de los filtros.
   * - SaaS con variante elegida: solo las que tienen stock para esa variante.
   */
  readonly sucursalesSeleccionables = computed<PublicoCategoria[]>(() => {
    const todas = this.filtros()?.sucursales ?? [];
    if (!this.saasMode || this.varianteElegida() === null) {
      return todas;
    }
    return this.sucursalesDisponibles();
  });

  /** Temporadas (por nombre) con stock para variante + sucursal elegidas. */
  readonly temporadasDisponibles = computed<string[]>(() => {
    const sucursalId = this.sucursalCompra.sucursalId();
    if (sucursalId === null) {
      return [];
    }
    const nombres = new Set<string>();
    for (const fila of this.disponibilidadVariante()) {
      if (fila.sucursal_id === sucursalId && fila.stock_disponible > 0) {
        nombres.add(fila.temporada);
      }
    }
    return [...nombres];
  });

  /** Fila exacta variante + sucursal + temporada seleccionada (SaaS). */
  readonly filaSeleccionada = computed<DisponibilidadFila | null>(() => {
    const sucursalId = this.sucursalCompra.sucursalId();
    const temporada = this.temporadaElegida();
    if (sucursalId === null || temporada === null) {
      return null;
    }
    return (
      this.disponibilidadVariante().find(
        (fila) =>
          fila.sucursal_id === sucursalId && fila.temporada === temporada,
      ) ?? null
    );
  });

  /** Resolución inequívoca del `temporada_id` (SaaS). */
  readonly resolucionTemporada = computed(() =>
    resolverTemporadaId(
      this.filtros()?.temporadas ?? [],
      this.temporadaElegida(),
    ),
  );

  /** Aviso cuando la temporada elegida no puede identificarse sin ambigüedad. */
  readonly avisoTemporada = computed<string | null>(() =>
    mensajeTemporadaNoResuelta(this.resolucionTemporada()),
  );

  /** true si la sesión empresarial pertenece a la empresa del catálogo. */
  readonly empresaCoincide = computed<boolean>(() => {
    if (!this.saasMode) {
      return true;
    }
    const catalogo = obtenerEmpresaSlugPublica();
    const sesion =
      this.tenantApi.identidad()?.empresa_slug?.trim().toLowerCase() ?? null;
    return catalogo !== null && sesion !== null && sesion === catalogo;
  });

  /**
   * Aviso cuando hay una sesión de cliente SaaS de OTRA empresa que la tienda.
   * No se agrega nada silenciosamente: se pide iniciar sesión en la tienda.
   */
  readonly mensajeEmpresa = computed<string | null>(() => {
    if (!this.saasMode || this.tenantApi.contexto() !== 'cliente') {
      return null;
    }
    if (this.empresaCoincide()) {
      return null;
    }
    return 'Tu sesión pertenece a otra empresa. Inicia sesión en esta tienda para comprar.';
  });

  /**
   * Inventario exacto (sucursal) de la variante elegida (solo legacy: el
   * contrato SaaS resuelve el inventario en el backend).
   */
  readonly inventarioElegido = computed<InventarioPublico | null>(() => {
    const variante = this.varianteElegida();
    const sucursalId = this.sucursalCompra.sucursalId();
    if (variante === null || sucursalId === null) {
      return null;
    }
    const deLaSucursal = (variante.inventarios ?? []).filter(
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

  /** Stock de la selección actual (SaaS: fila exacta; legacy: inventario). */
  readonly stockSeleccionado = computed(() => {
    if (this.saasMode) {
      return Math.max(0, this.filaSeleccionada()?.stock_disponible ?? 0);
    }
    return this.stockElegido();
  });

  readonly puedeAgregar = computed(() => {
    if (this.agregando()) {
      return false;
    }
    if (this.saasMode) {
      return (
        this.varianteElegida() !== null &&
        this.filaSeleccionada() !== null &&
        this.stockSeleccionado() > 0 &&
        this.resolucionTemporada().id !== null
      );
    }
    return this.inventarioElegido() !== null && this.stockElegido() > 0;
  });

  /** Mensaje contextual de la sección de compra para ambos modos. */
  readonly mensajeSeleccion = computed<{
    texto: string;
    tipo: 'info' | 'error' | 'ok';
  } | null>(() => {
    if (this.saasMode) {
      if (this.varianteElegida() === null) {
        return {
          texto: 'Elige talla y color para ver la disponibilidad.',
          tipo: 'info',
        };
      }
      if (this.sucursalCompra.sucursalId() === null) {
        return { texto: 'Elige una sucursal para comprar.', tipo: 'info' };
      }
      if (this.temporadasDisponibles().length === 0) {
        return {
          texto:
            'Esta variante no tiene disponibilidad en la sucursal seleccionada.',
          tipo: 'error',
        };
      }
      if (this.temporadaElegida() === null) {
        return { texto: 'Elige una temporada.', tipo: 'info' };
      }
      if (this.resolucionTemporada().id === null) {
        return {
          texto:
            this.avisoTemporada() ??
            'No se pudo identificar la temporada seleccionada.',
          tipo: 'error',
        };
      }
      if (this.stockSeleccionado() <= 0) {
        return { texto: 'Sin stock disponible', tipo: 'error' };
      }
      return {
        texto: `${this.stockSeleccionado()} unidad(es) disponibles en esta sucursal.`,
        tipo: 'ok',
      };
    }

    if (this.sucursalCompra.sucursalId() === null) {
      return { texto: 'Elige una sucursal para comprar.', tipo: 'info' };
    }
    if (this.varianteElegida() === null) {
      return {
        texto: 'Elige talla y color para ver la disponibilidad.',
        tipo: 'info',
      };
    }
    if (this.stockElegido() <= 0) {
      return { texto: 'Sin stock disponible', tipo: 'error' };
    }
    return {
      texto: `${this.stockElegido()} unidad(es) disponibles en esta sucursal.`,
      tipo: 'ok',
    };
  });

  /** Monto informativo (precio efectivo × cantidad): el definitivo lo da el backend. */
  readonly totalInformado = computed(
    () => (this.producto()?.precio_definitivo ?? 0) * this.cantidad(),
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
    this.catalogoService
      .obtenerProductoDetalle(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (producto) => {
          this.cargando.set(false);
          this.producto.set(producto);
          this.indiceImagen.set(0);

          if (this.saasMode) {
            // SaaS: la disponibilidad ya viene dentro del detalle.
            this.cargandoDisponibilidad.set(false);
            this.errorDisponibilidad.set(null);
            this.disponibilidad.set(producto.disponibilidad);
          } else {
            // Legacy: la disponibilidad se consulta en su endpoint propio.
            this.cargarDisponibilidad(id);
          }
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

  private cargarDisponibilidad(id: number): void {
    this.cargandoDisponibilidad.set(true);
    this.errorDisponibilidad.set(null);
    this.catalogoService
      .obtenerDisponibilidad(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (filas) => {
          this.cargandoDisponibilidad.set(false);
          this.disponibilidad.set(filas);
        },
        error: (error: unknown) => {
          this.cargandoDisponibilidad.set(false);
          this.disponibilidad.set([]);
          this.errorDisponibilidad.set(
            traducirErrorPublico(error, 'consultar la disponibilidad').mensaje,
          );
        },
      });
  }

  reintentarDisponibilidad(): void {
    const id = this.productoId();
    if (id !== null && !this.saasMode) {
      this.cargarDisponibilidad(id);
    }
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
    this.temporadaElegida.set(null);
    this.ajustarSucursalSaas();
    this.cantidad.set(1);
  }

  seleccionarColor(colorId: number): void {
    this.colorElegido.set(
      this.colorElegido() === colorId ? null : colorId,
    );
    this.temporadaElegida.set(null);
    this.ajustarSucursalSaas();
    this.cantidad.set(1);
  }

  /**
   * Si la sucursal de compra ya no tiene stock para la variante elegida, se
   * limpia para no dejar seleccionada una combinación que no aparece en la
   * disponibilidad real.
   */
  private ajustarSucursalSaas(): void {
    if (!this.saasMode) {
      return;
    }
    const actual = this.sucursalCompra.sucursalId();
    if (actual === null || this.varianteElegida() === null) {
      return;
    }
    const disponible = this.sucursalesDisponibles().some(
      (sucursal) => sucursal.id === actual,
    );
    if (!disponible) {
      this.sucursalCompra.limpiar();
    }
  }

  cambiarCantidad(delta: number): void {
    const siguiente = Math.max(1, this.cantidad() + delta);
    const maximo = this.stockSeleccionado();
    this.cantidad.set(maximo > 0 ? Math.min(siguiente, maximo) : siguiente);
  }

  /** Cambia la temporada seleccionada (SaaS). */
  cambiarTemporada(evento: Event): void {
    const valor = (evento.target as HTMLSelectElement).value;
    this.temporadaElegida.set(valor === '' ? null : valor);
    this.cantidad.set(1);
  }

  /** Cambia la sucursal de compra desde el detalle (contexto, no filtra). */
  cambiarSucursalCompra(evento: Event): void {
    const valor = (evento.target as HTMLSelectElement).value;
    this.temporadaElegida.set(null);
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
    if (!this.puedeAgregar()) {
      return;
    }

    if (this.saasMode) {
      this.agregarAlCarritoSaas();
      return;
    }
    this.agregarAlCarritoLegacy();
  }

  private agregarAlCarritoLegacy(): void {
    const inventario = this.inventarioElegido();
    const sucursalId = this.sucursalCompra.sucursalId();
    if (inventario === null || sucursalId === null) {
      return;
    }

    // Usuario no identificado: no se envía ninguna petición de carrito.
    if (!this.authService.esCliente()) {
      this.mostrarAvisoIdentificacion.set(true);
      return;
    }

    this.enviarAlCarrito({
      modo: 'inventario',
      sucursal_id: sucursalId,
      inventario_id: inventario.id,
      cantidad: this.cantidad(),
    });
  }

  private agregarAlCarritoSaas(): void {
    const variante = this.varianteElegida();
    const fila = this.filaSeleccionada();
    const temporada = this.resolucionTemporada();
    const sucursalId = this.sucursalCompra.sucursalId();

    // Sesión de CLIENTE empresarial confirmada por el backend.
    if (
      this.tenantApi.contexto() !== 'cliente' ||
      !this.tenantApi.autenticado()
    ) {
      this.mostrarAvisoIdentificacion.set(true);
      return;
    }

    // Nunca agregar silenciosamente con la sesión de otra empresa.
    if (!this.empresaCoincide()) {
      this.toast.mostrar(
        'Tu sesión pertenece a otra empresa. Inicia sesión en esta tienda para comprar.',
        'error',
      );
      return;
    }

    if (
      variante === null ||
      fila === null ||
      temporada.id === null ||
      sucursalId === null
    ) {
      this.toast.mostrar(
        this.avisoTemporada() ??
          'Faltan datos para agregar este producto al carrito.',
        'error',
      );
      return;
    }

    this.enviarAlCarrito({
      modo: 'variante',
      sucursal_id: sucursalId,
      variante_producto_id: variante.id,
      temporada_id: temporada.id,
      cantidad: this.cantidad(),
    });
  }

  private enviarAlCarrito(seleccion: SeleccionCarrito): void {
    this.agregando.set(true);
    this.carritoService
      .agregarItem(seleccion)
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
            this.carritoService.cerrarSesionCliente();
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
