import {
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { SAAS_MODE } from '../../../../core/config/app-mode';
import { obtenerEmpresaSlugPublica } from '../../../../core/config/empresa-publica';
import { ToastService } from '../../../../core/services/toast.service';
import { ConfirmDialog } from '../../../../shared/components/confirm-dialog/confirm-dialog';
import { AuthService } from '../../../autenticacion-seguridad/auth/services/auth.service';
import { Navbar } from '../../../home/components/navbar/navbar';
import { TenantApiService } from '../../../saas/services/tenant-api.service';
import {
  EstadoReserva,
  ReservaDetalle,
  ReservaItem,
} from '../../models/reserva.model';
import { ReservasService } from '../../services/reservas.service';
import { traducirErrorReserva } from '../../utils/reserva-error.util';
import { formatearFechaHoraReserva } from '../../utils/reserva-fecha.util';

/**
 * Detalle de una reserva (CU11/CU16) - /reservas/:reserva_id.
 *
 * SOLO LECTURA: no se pueden editar prendas ni cantidades. La única acción es
 * cancelarla mientras el backend lo permita (PENDIENTE o CONFIRMADA).
 *
 * En SaaS el listado/detalle usan `/tenant/reservas` y el estado tras cancelar
 * proviene de la respuesta real del backend.
 */
@Component({
  selector: 'app-reserva-detalle-page',
  imports: [Navbar, RouterLink, ConfirmDialog],
  styleUrl: './reserva-detalle-page.css',
  templateUrl: './reserva-detalle-page.html',
})
export class ReservaDetallePage implements OnInit {
  private readonly reservasService = inject(ReservasService);
  private readonly authService = inject(AuthService);
  private readonly tenantApi = inject(TenantApiService);
  private readonly toast = inject(ToastService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly saasMode = inject(SAAS_MODE);

  readonly reservaId = signal<number | null>(null);
  readonly reserva = signal<ReservaDetalle | null>(null);
  readonly cargando = signal(false);
  readonly error = signal<string | null>(null);

  readonly mostrandoConfirmacion = signal(false);
  readonly cancelando = signal(false);

  readonly items = computed<ReservaItem[]>(() => this.reserva()?.items ?? []);
  readonly unidades = computed(() => this.reserva()?.cantidad_unidades ?? 0);
  readonly puedeCancelar = computed(() => {
    const reserva = this.reserva();
    return reserva !== null && this.reservasService.esCancelable(reserva.estado);
  });

  /** Coherencia tienda/sesión (no se consultan reservas de otra empresa). */
  readonly empresaIncoherente = computed(() => {
    if (!this.saasMode || this.tenantApi.contexto() !== 'cliente') {
      return false;
    }
    const catalogo = obtenerEmpresaSlugPublica();
    const sesion =
      this.tenantApi.identidad()?.empresa_slug?.trim().toLowerCase() ?? null;
    return catalogo === null || sesion === null || sesion !== catalogo;
  });

  ngOnInit(): void {
    const id = Number(this.route.snapshot.paramMap.get('reserva_id'));
    if (!Number.isInteger(id) || id <= 0) {
      this.error.set('La reserva solicitada no es válida.');
      return;
    }
    this.reservaId.set(id);
    this.cargar(id);
  }

  cargar(reservaId: number): void {
    if (this.empresaIncoherente()) {
      this.reserva.set(null);
      this.error.set(
        'Tu sesión pertenece a otra empresa. Inicia sesión en esta tienda para ver esta reserva.',
      );
      return;
    }
    this.cargando.set(true);
    this.error.set(null);
    this.reservasService
      .obtenerReserva(reservaId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (detalle) => {
          this.cargando.set(false);
          this.reserva.set(detalle);
        },
        error: (error: unknown) => {
          this.cargando.set(false);
          this.reserva.set(null);
          this.manejarError(error);
        },
      });
  }

  fechaReserva(): string {
    return formatearFechaHoraReserva(
      this.reserva()?.fecha_reserva ?? null,
      this.saasMode,
    );
  }

  fechaAtencion(): string {
    return formatearFechaHoraReserva(
      this.reserva()?.fecha_atencion ?? null,
      this.saasMode,
    );
  }

  claseEstado(): string {
    const estado = (this.reserva()?.estado ?? '').trim().toLowerCase();
    return estado.length > 0 ? estado : 'desconocido';
  }

  solicitarCancelar(): void {
    if (this.cancelando()) {
      return;
    }
    this.mostrandoConfirmacion.set(true);
  }

  cancelarCancelacion(): void {
    this.mostrandoConfirmacion.set(false);
  }

  confirmarCancelar(): void {
    const reservaId = this.reservaId();
    this.mostrandoConfirmacion.set(false);
    if (reservaId === null || this.cancelando()) {
      return;
    }

    this.cancelando.set(true);
    this.reservasService
      .cancelarReserva(reservaId, null)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (resultado) => {
          this.cancelando.set(false);
          // Se refleja el estado REAL devuelto por el backend (ya confirmado).
          this.reserva.update((actual) =>
            actual === null
              ? actual
              : { ...actual, estado: resultado.estado as EstadoReserva },
          );
          this.toast.mostrar('Reserva cancelada.', 'ok');
        },
        error: (error: unknown) => {
          this.cancelando.set(false);
          this.manejarError(error, true);
        },
      });
  }

  irAMisReservas(): void {
    void this.router.navigate(['/reservas']);
  }

  reintentar(): void {
    const reservaId = this.reservaId();
    if (reservaId !== null) {
      this.cargar(reservaId);
    }
  }

  private manejarError(error: unknown, comoToast = false): void {
    const traducido = traducirErrorReserva(error);
    if (traducido.sesionExpirada) {
      this.cerrarSesion();
      return;
    }
    if (comoToast) {
      this.toast.mostrar(traducido.mensaje, 'error');
      return;
    }
    this.error.set(traducido.mensaje);
  }

  private cerrarSesion(): void {
    if (this.saasMode) {
      this.tenantApi.cerrarSesion();
    } else {
      this.authService.cerrarSesion();
    }
    void this.router.navigate(['/login'], {
      queryParams: { returnUrl: this.router.url },
    });
  }
}
