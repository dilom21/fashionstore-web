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
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';

import { CatalogoFiltros } from '../../models/catalogo-filtros.model';
import { DisponibilidadFila } from '../../models/catalogo-publico.model';

/** Grupo de filas de disponibilidad por sucursal. */
interface GrupoDisponibilidad {
  sucursal_id: number;
  sucursal: string;
  filas: DisponibilidadFila[];
}

interface SeleccionDisponibilidad {
  sucursal_id: number | null;
  talla_id: number | null;
  color_id: number | null;
  temporada_id: number | null;
}

const SELECCION_INICIAL: SeleccionDisponibilidad = {
  sucursal_id: null,
  talla_id: null,
  color_id: null,
  temporada_id: null,
};

/**
 * Sección de disponibilidad por sucursal (CU09).
 *
 * Componente PRESENTACIONAL: recibe las filas de disponibilidad ya
 * normalizadas (en SaaS provienen de `disponibilidad[]` del detalle; en legacy
 * del endpoint `/productos/{id}/disponibilidad`) y aplica filtros del lado del
 * cliente. No llama a la API y no recalcula stock.
 */
@Component({
  selector: 'app-disponibilidad-producto',
  imports: [ReactiveFormsModule],
  styleUrl: './disponibilidad-producto.css',
  templateUrl: './disponibilidad-producto.html',
})
export class DisponibilidadProducto {
  readonly disponibilidad = input<DisponibilidadFila[]>([]);
  readonly productoNombre = input<string>('');
  readonly filtros = input<CatalogoFiltros | null>(null);
  readonly cargando = input(false);
  readonly error = input<string | null>(null);

  readonly reintentar = output<void>();

  private readonly destroyRef = inject(DestroyRef);

  readonly filtrosForm = new FormGroup({
    sucursal_id: new FormControl<number | null>(null),
    talla_id: new FormControl<number | null>(null),
    color_id: new FormControl<number | null>(null),
    temporada_id: new FormControl<number | null>(null),
  });

  readonly seleccion = signal<SeleccionDisponibilidad>(SELECCION_INICIAL);

  constructor() {
    this.filtrosForm.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        const valores = this.filtrosForm.getRawValue();
        this.seleccion.set({
          sucursal_id: valores.sucursal_id ?? null,
          talla_id: valores.talla_id ?? null,
          color_id: valores.color_id ?? null,
          temporada_id: valores.temporada_id ?? null,
        });
      });
  }

  readonly tieneFiltros = computed(() => {
    const s = this.seleccion();
    return (
      s.sucursal_id !== null ||
      s.talla_id !== null ||
      s.color_id !== null ||
      s.temporada_id !== null
    );
  });

  readonly filasFiltradas = computed<DisponibilidadFila[]>(() => {
    const s = this.seleccion();
    const filtros = this.filtros();

    const nombreDe = (
      lista: ReadonlyArray<{ id: number; nombre: string }> | undefined,
      id: number,
    ): string | null => lista?.find((opcion) => opcion.id === id)?.nombre ?? null;

    return this.disponibilidad().filter((fila) => {
      if (s.sucursal_id !== null && fila.sucursal_id !== s.sucursal_id) {
        return false;
      }
      const talla = nombreDe(filtros?.tallas, s.talla_id ?? 0);
      if (s.talla_id !== null && talla !== null && fila.talla !== talla) {
        return false;
      }
      const color = nombreDe(filtros?.colores, s.color_id ?? 0);
      if (s.color_id !== null && color !== null && fila.color !== color) {
        return false;
      }
      const temporada = nombreDe(filtros?.temporadas, s.temporada_id ?? 0);
      if (
        s.temporada_id !== null &&
        temporada !== null &&
        fila.temporada !== temporada
      ) {
        return false;
      }
      return true;
    });
  });

  /** Filas agrupadas por sucursal conservando el orden de aparición. */
  readonly grupos = computed<GrupoDisponibilidad[]>(() => {
    const mapa = new Map<number, GrupoDisponibilidad>();
    for (const fila of this.filasFiltradas()) {
      const existente = mapa.get(fila.sucursal_id);
      if (existente) {
        existente.filas.push(fila);
      } else {
        mapa.set(fila.sucursal_id, {
          sucursal_id: fila.sucursal_id,
          sucursal: fila.sucursal,
          filas: [fila],
        });
      }
    }
    return [...mapa.values()];
  });

  readonly totalVariantes = computed(() => this.filasFiltradas().length);

  readonly totalUnidades = computed(() =>
    this.filasFiltradas().reduce(
      (total, fila) => total + Math.max(0, fila.stock_disponible),
      0,
    ),
  );

  limpiarFiltros(): void {
    this.filtrosForm.reset(SELECCION_INICIAL, { emitEvent: false });
    this.seleccion.set(SELECCION_INICIAL);
  }

  onReintentar(): void {
    this.reintentar.emit();
  }
}
