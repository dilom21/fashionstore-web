import { DecimalPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { AdminIcon } from '../../../administracion/components/admin-icon/admin-icon';
import {
  METODOS_PAGO_PRESENCIAL,
  MetodoPagoPresencial,
  PagoPresencialResponse,
  etiquetaMetodoPago,
} from '../../models/pago-presencial.model';
import { PagoPresencialService } from '../../services/pago-presencial.service';
import { traducirErrorPagoPresencial } from '../../utils/pago-presencial-error.util';

/**
 * CU21 - Diálogo reutilizable de pago presencial.
 *
 * Se abre desde una venta presencial PENDIENTE (CU20) ya sea directa o
 * proveniente de una reserva (CU18 -> CU20). Recibe los datos que las páginas
 * ya tienen en memoria (`venta_id`, `total`, `estado`, opcional `reserva_id`):
 * no reconstruye la venta ni recalcula el monto.
 *
 * Flujo: seleccionar método -> REGISTRAR PAGO -> confirmación explícita ->
 * POST /pagos/presencial. Al aprobarse muestra el pago APROBADO y el estado
 * final real devuelto por el backend, y bloquea cualquier nuevo pago desde la
 * misma UI. No integra Stripe (CU22).
 */
@Component({
  selector: 'app-pago-presencial-dialog',
  imports: [AdminIcon, DecimalPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './pago-presencial-dialog.css',
  templateUrl: './pago-presencial-dialog.html',
})
export class PagoPresencialDialog {
  private readonly pagoService = inject(PagoPresencialService);
  private readonly destroyRef = inject(DestroyRef);

  readonly ventaId = input.required<number>();
  readonly total = input.required<number>();
  /** Estado de la venta al abrir el diálogo (PENDIENTE es el esperado). */
  readonly estadoVenta = input<string>('PENDIENTE');
  /** Solo para presentación; el backend confirma la reserva. */
  readonly reservaId = input<number | null>(null);

  readonly cerrado = output<void>();
  readonly pagado = output<PagoPresencialResponse>();
  readonly sesionExpirada = output<void>();

  readonly metodos = METODOS_PAGO_PRESENCIAL;

  readonly metodo = signal<MetodoPagoPresencial | null>(null);
  readonly confirmando = signal(false);
  readonly procesando = signal(false);
  readonly error = signal<string | null>(null);
  readonly resultado = signal<PagoPresencialResponse | null>(null);

  readonly pagoRegistrado = computed(() => this.resultado() !== null);

  readonly etiquetaMetodoSeleccionado = computed(() =>
    etiquetaMetodoPago(this.metodo() ?? ''),
  );

  readonly estadoVentaFinal = computed(
    () => this.resultado()?.estado_venta ?? this.estadoVenta(),
  );

  /** Permite abrir la confirmación (el método se valida en solicitarPago). */
  readonly puedeSolicitar = computed(
    () => !this.procesando() && !this.pagoRegistrado(),
  );

  /** Confirmar exige método elegido y ninguna petición en curso. */
  readonly puedeConfirmar = computed(
    () =>
      this.metodo() !== null &&
      !this.procesando() &&
      !this.pagoRegistrado(),
  );

  seleccionarMetodo(valor: MetodoPagoPresencial): void {
    if (this.procesando() || this.pagoRegistrado()) {
      return;
    }
    this.metodo.set(valor);
    this.error.set(null);
  }

  /** Valida el método y pasa a la confirmación explícita. */
  solicitarPago(): void {
    if (this.procesando() || this.pagoRegistrado()) {
      return;
    }
    if (this.metodo() === null) {
      this.error.set('Selecciona un método de pago.');
      return;
    }
    this.error.set(null);
    this.confirmando.set(true);
  }

  volverASeleccion(): void {
    if (this.procesando()) {
      return;
    }
    this.confirmando.set(false);
  }

  /** POST /pagos/presencial con SOLO venta_id + metodo. */
  registrarPago(): void {
    const metodo = this.metodo();
    if (
      metodo === null ||
      this.procesando() ||
      this.pagoRegistrado()
    ) {
      return;
    }

    this.error.set(null);
    this.procesando.set(true);

    this.pagoService
      .registrarPresencial(this.ventaId(), metodo)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (pago) => {
          this.procesando.set(false);
          this.confirmando.set(false);
          this.resultado.set(pago);
          this.pagado.emit(pago);
        },
        error: (error: unknown) => {
          this.procesando.set(false);
          const traducido = traducirErrorPagoPresencial(error);
          if (traducido.sesionExpirada) {
            this.sesionExpirada.emit();
            return;
          }
          this.error.set(traducido.mensaje);
        },
      });
  }

  /** Cierra el diálogo (bloqueado mientras se procesa el pago). */
  cerrar(): void {
    if (this.procesando()) {
      return;
    }
    this.cerrado.emit();
  }

  etiqueta(metodo: string): string {
    return etiquetaMetodoPago(metodo);
  }
}
