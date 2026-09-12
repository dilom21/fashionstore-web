import {
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { Subject, debounceTime } from 'rxjs';

import {
  DisponibilidadListarFiltros,
  DisponibilidadProducto as DisponibilidadProductoModelo,
} from '../../../administracion/catalogo/models/producto.model';
import { ProductosService } from '../../../administracion/catalogo/services/productos.service';
import { CatalogoFiltros } from '../../models/catalogo-filtros.model';
import { traducirErrorPublico } from '../../utils/catalogo-error.util';

/**
 * Sección de disponibilidad por sucursal (CU09).
 *
 * Consume GET /productos/{id}/disponibilidad con filtros reales de sucursal,
 * talla, color y temporada. El backend ya calcula `stock_disponible`; aquí no
 * se recalcula stock.
 */
@Component({
  selector: 'app-disponibilidad-producto',
  imports: [ReactiveFormsModule],
  styleUrl: './disponibilidad-producto.css',
  templateUrl: './disponibilidad-producto.html',
})
export class DisponibilidadProducto {
  readonly productoId = input.required<number>();
  readonly productoNombre = input<string>('');
  readonly filtros = input<CatalogoFiltros | null>(null);

  private readonly productosService = inject(ProductosService);
  private readonly destroyRef = inject(DestroyRef);

  readonly disponibilidad = signal<DisponibilidadProductoModelo | null>(null);
  readonly cargando = signal(false);
  readonly error = signal<string | null>(null);

  readonly filtrosForm = new FormGroup({
    sucursal_id: new FormControl<number | null>(null),
    talla_id: new FormControl<number | null>(null),
    color_id: new FormControl<number | null>(null),
    temporada_id: new FormControl<number | null>(null),
  });

  readonly seleccion = signal<DisponibilidadListarFiltros>({});

  readonly tieneFiltros = computed(() => {
    const s = this.seleccion();
    return (
      s.sucursal_id !== undefined ||
      s.talla_id !== undefined ||
      s.color_id !== undefined ||
      s.temporada_id !== undefined
    );
  });

  readonly totalVariantes = computed(() =>
    (this.disponibilidad()?.sucursales ?? []).reduce(
      (total, sucursal) => total + sucursal.variantes.length,
      0,
    ),
  );

  readonly totalUnidades = computed(() =>
    (this.disponibilidad()?.sucursales ?? []).reduce(
      (total, sucursal) =>
        total +
        sucursal.variantes.reduce(
          (suma, variante) => suma + Math.max(0, variante.stock_disponible),
          0,
        ),
      0,
    ),
  );

  private readonly cambios$ = new Subject<void>();

  constructor() {
    this.filtrosForm.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        const valores = this.filtrosForm.getRawValue();
        this.seleccion.set({
          sucursal_id: valores.sucursal_id ?? undefined,
          talla_id: valores.talla_id ?? undefined,
          color_id: valores.color_id ?? undefined,
          temporada_id: valores.temporada_id ?? undefined,
        });
        this.cambios$.next();
      });

    this.cambios$
      .pipe(debounceTime(300), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.cargar());

    effect(() => {
      const id = this.productoId();
      untracked(() => this.cargar(id));
    });
  }

  limpiarFiltros(): void {
    this.filtrosForm.reset(
      {
        sucursal_id: null,
        talla_id: null,
        color_id: null,
        temporada_id: null,
      },
      { emitEvent: false },
    );
    this.seleccion.set({});
    this.cambios$.next();
  }

  reintentar(): void {
    this.cargar();
  }

  private cargar(idProducto: number = this.productoId()): void {
    this.cargando.set(true);
    this.error.set(null);
    this.productosService
      .obtenerDisponibilidad(idProducto, this.seleccion())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (disponibilidad) => {
          this.cargando.set(false);
          this.disponibilidad.set(disponibilidad);
        },
        error: (error: unknown) => {
          this.cargando.set(false);
          this.disponibilidad.set(null);
          this.error.set(
            traducirErrorPublico(error, 'consultar la disponibilidad').mensaje,
          );
        },
      });
  }
}
