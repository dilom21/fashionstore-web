import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

/**
 * Diálogo de confirmación reutilizable (habilitar/deshabilitar, etc.).
 *
 * El padre decide cuándo mostrarlo (render condicional) y reacciona a los
 * eventos `confirmado` / `cancelado`. No ejecuta ninguna acción por sí mismo.
 */
@Component({
  selector: 'app-confirm-dialog',
  imports: [],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './confirm-dialog.css',
  templateUrl: './confirm-dialog.html',
})
export class ConfirmDialog {
  readonly titulo = input.required<string>();
  readonly mensaje = input.required<string>();
  readonly confirmarLabel = input('Confirmar');
  readonly cancelarLabel = input('Cancelar');
  /** Estilo destructivo del botón de confirmación. */
  readonly peligro = input(false);

  readonly confirmado = output<void>();
  readonly cancelado = output<void>();

  cancelar(): void {
    this.cancelado.emit();
  }

  confirmar(): void {
    this.confirmado.emit();
  }
}
