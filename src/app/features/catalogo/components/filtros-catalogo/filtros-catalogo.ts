import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { FormGroup, ReactiveFormsModule } from '@angular/forms';

import { CatalogoFiltros } from '../../models/catalogo-filtros.model';

/**
 * Panel de filtros del catálogo público (CU09).
 *
 * Es presentacional: recibe el `FormGroup` tipado del componente de página y
 * las opciones reales de GET /catalogo/filtros. No hardcodea opciones.
 */
@Component({
  selector: 'app-filtros-catalogo',
  imports: [ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './filtros-catalogo.css',
  templateUrl: './filtros-catalogo.html',
})
export class FiltrosCatalogo {
  readonly form = input.required<FormGroup>();
  readonly filtros = input<CatalogoFiltros | null>(null);
  readonly cargandoFiltros = input(false);
  readonly tieneFiltros = input(false);

  readonly aplicar = output<void>();
  readonly limpiar = output<void>();

  onAplicar(): void {
    this.aplicar.emit();
  }

  onLimpiar(): void {
    this.limpiar.emit();
  }
}
