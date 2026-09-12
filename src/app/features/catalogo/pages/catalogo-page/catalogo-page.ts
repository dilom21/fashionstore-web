import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject, debounceTime, distinctUntilChanged, map } from 'rxjs';

import { Producto, ProductoListarFiltros } from '../../../administracion/catalogo/models/producto.model';
import { ProductosService } from '../../../administracion/catalogo/services/productos.service';
import { Navbar } from '../../../home/components/navbar/navbar';
import { FiltrosCatalogo } from '../../components/filtros-catalogo/filtros-catalogo';
import { ProductoCardPublico } from '../../components/producto-card-publico/producto-card-publico';
import {
  CatalogoFiltros,
  CatalogoFiltrosSeleccion,
} from '../../models/catalogo-filtros.model';
import { CatalogoService } from '../../services/catalogo.service';
import { traducirErrorPublico } from '../../utils/catalogo-error.util';

const SELECCION_INICIAL: CatalogoFiltrosSeleccion = {
  buscar: '',
  categoria_id: null,
  talla_id: null,
  color_id: null,
  temporada_id: null,
  coleccion_id: null,
  sucursal_id: null,
  con_stock: false,
};

/**
 * Catálogo público de productos (CU09) - /catalogo.
 *
 * Experiencia de cliente: grid de productos con búsqueda y filtros reales
 * (GET /catalogo/filtros) y navegación al detalle. Los filtros se reflejan en
 * la URL para conservarlos al volver desde el detalle. No es una pantalla
 * administrativa.
 */
@Component({
  selector: 'app-catalogo-page',
  imports: [Navbar, FiltrosCatalogo, ProductoCardPublico],
  styleUrl: './catalogo-page.css',
  templateUrl: './catalogo-page.html',
})
export class CatalogoPage {
  private readonly productosService = inject(ProductosService);
  private readonly catalogoService = inject(CatalogoService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly productos = signal<Producto[]>([]);
  readonly cargando = signal(false);
  readonly error = signal<string | null>(null);

  readonly filtros = signal<CatalogoFiltros | null>(null);
  readonly cargandoFiltros = signal(false);
  readonly errorFiltros = signal<string | null>(null);

  readonly drawerAbierto = signal(false);

  readonly seleccion = signal<CatalogoFiltrosSeleccion>(SELECCION_INICIAL);

  readonly filtrosForm = new FormGroup({
    buscar: new FormControl('', { nonNullable: true }),
    categoria_id: new FormControl<number | null>(null),
    talla_id: new FormControl<number | null>(null),
    color_id: new FormControl<number | null>(null),
    temporada_id: new FormControl<number | null>(null),
    coleccion_id: new FormControl<number | null>(null),
    sucursal_id: new FormControl<number | null>(null),
    con_stock: new FormControl(false, { nonNullable: true }),
  });

  readonly tieneFiltros = computed(() => {
    const s = this.seleccion();
    return (
      s.buscar.trim().length > 0 ||
      s.categoria_id !== null ||
      s.talla_id !== null ||
      s.color_id !== null ||
      s.temporada_id !== null ||
      s.coleccion_id !== null ||
      s.sucursal_id !== null ||
      s.con_stock
    );
  });

  readonly cantidadFiltrosActivos = computed(() => {
    const s = this.seleccion();
    let total = 0;
    if (s.buscar.trim().length > 0) {
      total += 1;
    }
    total += [
      s.categoria_id,
      s.talla_id,
      s.color_id,
      s.temporada_id,
      s.coleccion_id,
      s.sucursal_id,
    ].filter((valor) => valor !== null).length;
    if (s.con_stock) {
      total += 1;
    }
    return total;
  });

  private readonly cambiosFiltros$ = new Subject<void>();

  constructor() {
    this.filtrosForm.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.seleccion.set(this.filtrosForm.getRawValue());
        this.cambiosFiltros$.next();
      });

    this.cambiosFiltros$
      .pipe(
        debounceTime(350),
        map(() => this.construirFiltros()),
        distinctUntilChanged(
          (anterior, actual) =>
            JSON.stringify(anterior) === JSON.stringify(actual),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(() => this.cargarProductos());
  }

  ngOnInit(): void {
    const inicial = this.leerSeleccionDeUrl();
    this.filtrosForm.setValue(inicial, { emitEvent: false });
    this.seleccion.set(inicial);

    this.cargarFiltros();
    this.cargarProductos();
  }

  // ===== Filtros =====

  aplicarFiltros(): void {
    this.cambiosFiltros$.next();
    this.cerrarFiltros();
  }

  limpiarFiltros(): void {
    this.filtrosForm.setValue(SELECCION_INICIAL, { emitEvent: false });
    this.seleccion.set(SELECCION_INICIAL);
    this.cambiosFiltros$.next();
  }

  abrirFiltros(): void {
    this.drawerAbierto.set(true);
  }

  cerrarFiltros(): void {
    this.drawerAbierto.set(false);
  }

  reintentar(): void {
    this.cargarProductos();
  }

  reintentarFiltros(): void {
    this.cargarFiltros();
  }

  mensajeVacio(): string {
    if (this.tieneFiltros()) {
      return 'No encontramos productos que coincidan con los filtros seleccionados.';
    }
    return 'Todavía no hay productos publicados en el catálogo.';
  }

  // ===== Carga de datos =====

  private cargarFiltros(): void {
    this.cargandoFiltros.set(true);
    this.errorFiltros.set(null);
    this.catalogoService
      .obtenerFiltros()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (filtros) => {
          this.cargandoFiltros.set(false);
          this.filtros.set(filtros);
          this.ajustarSeleccion(filtros);
        },
        error: (error: unknown) => {
          this.cargandoFiltros.set(false);
          this.filtros.set(null);
          this.errorFiltros.set(
            traducirErrorPublico(error, 'cargar los filtros').mensaje,
          );
        },
      });
  }

  private cargarProductos(): void {
    this.cargando.set(true);
    this.error.set(null);
    this.sincronizarUrl();

    this.productosService
      .listarProductosPublicos(this.construirFiltros())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (productos) => {
          this.cargando.set(false);
          this.productos.set(productos);
        },
        error: (error: unknown) => {
          this.cargando.set(false);
          this.productos.set([]);
          this.error.set(
            traducirErrorPublico(error, 'cargar el catálogo').mensaje,
          );
        },
      });
  }

  private construirFiltros(): ProductoListarFiltros {
    const valores = this.filtrosForm.getRawValue();
    return {
      buscar: valores.buscar.trim() || undefined,
      categoria_id: valores.categoria_id ?? undefined,
      talla_id: valores.talla_id ?? undefined,
      color_id: valores.color_id ?? undefined,
      temporada_id: valores.temporada_id ?? undefined,
      coleccion_id: valores.coleccion_id ?? undefined,
      sucursal_id: valores.sucursal_id ?? undefined,
      con_stock: valores.con_stock ? true : undefined,
    };
  }

  /**
   * Si una opción seleccionada dejó de estar activa, se limpia para no
   * mantener una selección invisible.
   */
  private ajustarSeleccion(filtros: CatalogoFiltros): void {
    const actual = this.filtrosForm.getRawValue();
    let cambio = false;

    const valida = (
      valor: number | null,
      opciones: ReadonlyArray<{ id: number }>,
    ): number | null => {
      if (valor === null) {
        return null;
      }
      return opciones.some((opcion) => opcion.id === valor) ? valor : null;
    };

    const categoria = valida(actual.categoria_id, filtros.categorias);
    const talla = valida(actual.talla_id, filtros.tallas);
    const color = valida(actual.color_id, filtros.colores);
    const temporada = valida(actual.temporada_id, filtros.temporadas);
    const coleccion = valida(actual.coleccion_id, filtros.colecciones);
    const sucursal = valida(actual.sucursal_id, filtros.sucursales);

    if (
      categoria !== actual.categoria_id ||
      talla !== actual.talla_id ||
      color !== actual.color_id ||
      temporada !== actual.temporada_id ||
      coleccion !== actual.coleccion_id ||
      sucursal !== actual.sucursal_id
    ) {
      cambio = true;
    }

    if (!cambio) {
      return;
    }

    this.filtrosForm.patchValue(
      {
        categoria_id: categoria,
        talla_id: talla,
        color_id: color,
        temporada_id: temporada,
        coleccion_id: coleccion,
        sucursal_id: sucursal,
      },
      { emitEvent: false },
    );
    this.seleccion.set(this.filtrosForm.getRawValue());
    this.cambiosFiltros$.next();
  }

  // ===== URL =====

  private leerSeleccionDeUrl(): CatalogoFiltrosSeleccion {
    const params = this.route.snapshot.queryParamMap;
    const numero = (clave: string): number | null => {
      const valor = params.get(clave);
      if (valor === null) {
        return null;
      }
      const numero = Number(valor);
      return Number.isInteger(numero) && numero > 0 ? numero : null;
    };

    return {
      buscar: params.get('buscar') ?? '',
      categoria_id: numero('categoria_id'),
      talla_id: numero('talla_id'),
      color_id: numero('color_id'),
      temporada_id: numero('temporada_id'),
      coleccion_id: numero('coleccion_id'),
      sucursal_id: numero('sucursal_id'),
      con_stock: params.get('con_stock') === 'true',
    };
  }

  private sincronizarUrl(): void {
    const filtros = this.construirFiltros();
    void this.router.navigate([], {
      relativeTo: this.route,
      replaceUrl: true,
      queryParams: {
        buscar: filtros.buscar ?? null,
        categoria_id: filtros.categoria_id ?? null,
        talla_id: filtros.talla_id ?? null,
        color_id: filtros.color_id ?? null,
        temporada_id: filtros.temporada_id ?? null,
        coleccion_id: filtros.coleccion_id ?? null,
        sucursal_id: filtros.sucursal_id ?? null,
        con_stock: filtros.con_stock ? 'true' : null,
      },
    });
  }
}
