import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  input,
  output,
  viewChild,
} from '@angular/core';

/**
 * Diálogo flotante de RESULTADO (feedback de éxito).
 *
 * Complementa a `ConfirmDialog` (que está pensado para preguntas): este se usa
 * cuando una operación ya terminó correctamente y solo hay que informar. Muestra
 * un check verde, el código del documento, la referencia opcional y un único
 * botón de acción principal.
 *
 * El padre decide cuándo mostrarlo (render condicional). No ejecuta ninguna
 * acción por sí mismo: emite `accion` (botón principal) o `cerrado` (X / Escape).
 * El foco va al botón principal en el navegador (SSR-safe con
 * `afterNextRender`).
 */
@Component({
  selector: 'app-result-dialog',
  imports: [],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './result-dialog.css',
  templateUrl: './result-dialog.html',
})
export class ResultDialog {
  /** Título del resultado (p. ej. "Devolución completada"). */
  readonly titulo = input.required<string>();
  /** Código visual del documento (p. ej. DEV-00003). */
  readonly codigo = input<string | null>(null);
  /** Referencia secundaria (p. ej. Venta VTA-00558). */
  readonly referencia = input<string | null>(null);
  /** Mensaje principal del resultado. */
  readonly mensaje = input<string | null>(null);
  /** Línea adicional de contexto. */
  readonly detalle = input<string | null>(null);
  readonly accionLabel = input('Entendido');
  /** Permite cerrar con la X o Escape (el botón principal siempre está). */
  readonly cerrable = input(true);

  readonly accion = output<void>();
  readonly cerrado = output<void>();

  private readonly accionBoton =
    viewChild<ElementRef<HTMLButtonElement>>('accionBoton');

  constructor() {
    afterNextRender(() => this.accionBoton()?.nativeElement.focus());
  }

  confirmar(): void {
    this.accion.emit();
  }

  cerrar(): void {
    if (this.cerrable()) {
      this.cerrado.emit();
    }
  }
}
