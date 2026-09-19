import {
  Component,
  DestroyRef,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';

import { ToastService } from '../../../../core/services/toast.service';
import { ConfirmDialog } from '../../../../shared/components/confirm-dialog/confirm-dialog';
import { AuthService } from '../../../autenticacion-seguridad/auth/services/auth.service';
import { Navbar } from '../../../home/components/navbar/navbar';
import { EstadoReserva, ReservaResumen } from '../../models/reserva.model';
import { ReservasService } from '../../services/reservas.service';
import { traducirErrorReserva } from '../../utils/reserva-error.util';
import { formatearFechaHora } from '../../utils/reserva-fecha.util';

/** Opciones del filtro por estado (los mismos estados del backend). */
const ESTADOS_RESERVA: ReadonlyArray<{
  valor: EstadoReserva | null;
  label: string;
}> = [
  { valor: null, label: 'Todas' },
  { valor: 'PENDIENTE', label: 'Pendiente' },
  { valor: 'CONFIRMADA', label: 'Confirmada' },
  { valor: 'ATENDIDA', label: 'Atendida' },
  { valor: 'CANCELADA', label: 'Cancelada' },
  { valor: 'VENCIDA', label: 'Vencida' },
];

/**
 * Mis reservas (CU16) - /reservas.
 *
 * Lista las reservas del cliente autenticado (GET /reservas). El backend es la
 * autoridad: el frontend no inventa estados ni reactiva nada.
 */
@Component({
  selector: 'app-reservas-page',
  imports: [Navbar, RouterLink, ConfirmDialog],
  styleUrl: './reservas-page.css',
  templateUrl: './reservas-page.html',
})
export class ReservasPage implements OnInit {
  private readonly reservasService = inject(ReservasService);
  private readonly authService = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly estados = ESTADOS_RESERVA;

  readonly reservas = signal<ReservaResumen[]>([]);
  readonly total = signal(0);
  readonly cargando = signal(false);
  readonly error = signal<string | null>(null);
  readonly estadoFiltro = signal<EstadoReserva | null>(null);

  readonly pendienteCancelar = signal<ReservaResumen | null>(null);
  readonly cancelando = signal(false);

  ngOnInit(): void {
    this.cargar();
  }

  cargar(): void {
    this.cargando.set(true);
    this.error.set(null);
    this.reservasService
      .listarReservas(this.estadoFiltro())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (respuesta) => {
          this.cargando.set(false);
          this.reservas.set(respuesta.items ?? []);
          this.total.set(respuesta.total_reservas ?? 0);
        },
        error: (error: unknown) => {
          this.cargando.set(false);
          this.reservas.set([]);
          this.total.set(0);
          const traducido = traducirErrorReserva(error);
          if (traducido.sesionExpirada) {
            this.cerrarSesion();
            return;
          }
          this.error.set(traducido.mensaje);
        },
      });
  }

  cambiarEstado(evento: Event): void {
    const valor = (evento.target as HTMLSelectElement).value;
    this.estadoFiltro.set(valor.length > 0 ? (valor as EstadoReserva) : null);
    this.cargar();
  }

  hayFiltro(): boolean {
    return this.estadoFiltro() !== null;
  }

  limpiarFiltro(): void {
    if (this.estadoFiltro() === null) {
      return;
    }
    this.estadoFiltro.set(null);
    this.cargar();
  }

  verReserva(reserva: ReservaResumen): void {
    void this.router.navigate(['/reservas', reserva.reserva_id]);
  }

  esCancelable(estado: string): boolean {
    return this.reservasService.esCancelable(estado);
  }

  claseEstado(estado: string): string {
    return (estado ?? '').trim().toLowerCase() || 'desconocido';
  }

  fechaAtencion(iso: string): string {
    return formatearFechaHora(iso);
  }

  solicitarCancelar(reserva: ReservaResumen): void {
    if (this.cancelando()) {
      return;
    }
    this.pendienteCancelar.set(reserva);
  }

  cancelarCancelacion(): void {
    this.pendienteCancelar.set(null);
  }

  confirmarCancelar(): void {
    const pendiente = this.pendienteCancelar();
    this.pendienteCancelar.set(null);
    if (pendiente === null) {
      return;
    }

    this.cancelando.set(true);
    this.reservasService
      .cancelarReserva(pendiente.reserva_id, null)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.cancelando.set(false);
          this.toast.mostrar('Reserva cancelada.', 'ok');
          this.cargar();
        },
        error: (error: unknown) => {
          this.cancelando.set(false);
          const traducido = traducirErrorReserva(error);
          if (traducido.sesionExpirada) {
            this.cerrarSesion();
            return;
          }
          this.toast.mostrar(traducido.mensaje, 'error');
        },
      });
  }

  reintentar(): void {
    this.cargar();
  }

  private cerrarSesion(): void {
    this.authService.cerrarSesion();
    void this.router.navigate(['/login'], {
      queryParams: { returnUrl: this.router.url },
    });
  }
}
