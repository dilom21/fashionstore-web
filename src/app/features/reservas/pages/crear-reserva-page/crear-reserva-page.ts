import { DecimalPipe } from '@angular/common';
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

import { ToastService } from '../../../../core/services/toast.service';
import { AuthService } from '../../../autenticacion-seguridad/auth/services/auth.service';
import {
  CarritoDetalle,
  CarritoItem,
} from '../../../carrito/models/carrito.model';
import { CarritoService } from '../../../carrito/services/carrito.service';
import { Navbar } from '../../../home/components/navbar/navbar';
import { ReservasService } from '../../services/reservas.service';
import {
  combinarFechaHoraAtencion,
  esFechaHoraFutura,
  formatearFechaSeleccion,
} from '../../utils/reserva-fecha.util';
import { traducirErrorReserva } from '../../utils/reserva-error.util';

/**
 * Crear reserva de prendas (CU16) - /reservas/nueva/:carrito_id.
 *
 * La reserva utiliza el CARRITO COMPLETO: aquí no se eligen prendas, no se
 * cambian cantidades ni se elimina nada (para eso está CU15).
 *
 * La sucursal la determina el carrito y NO se puede cambiar. Se envía solo
 * `carrito_id`, `fecha_atencion` y `observacion`: nunca `cliente_id`,
 * `sucursal_id`, prendas ni cantidades.
 */
@Component({
  selector: 'app-crear-reserva-page',
  imports: [Navbar, RouterLink, DecimalPipe],
  styleUrl: './crear-reserva-page.css',
  templateUrl: './crear-reserva-page.html',
})
export class CrearReservaPage implements OnInit {
  private readonly carritoService = inject(CarritoService);
  private readonly reservasService = inject(ReservasService);
  private readonly authService = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly carritoId = signal<number | null>(null);
  readonly carrito = signal<CarritoDetalle | null>(null);
  readonly cargando = signal(false);
  readonly error = signal<string | null>(null);
  readonly errorFecha = signal<string | null>(null);
  readonly volverAlCarrito = signal(false);
  readonly guardando = signal(false);

  /** Campos del formulario: fecha + hora concretas (sin rangos). */
  readonly fecha = signal('');
  readonly hora = signal('');
  readonly observacion = signal('');

  readonly items = computed<CarritoItem[]>(() => this.carrito()?.items ?? []);
  readonly lineas = computed(() => this.items().length);
  readonly unidades = computed(
    () => this.carrito()?.cantidad_total_unidades ?? 0,
  );
  readonly subtotal = computed(() => this.carrito()?.subtotal_carrito ?? 0);

  readonly fechaLegible = computed(() =>
    this.fecha().length > 0 ? formatearFechaSeleccion(this.fecha()) : '—',
  );

  /**
   * Error de carga del carrito (solo mientras no hay carrito). Los errores del
   * POST se muestran junto al resumen sin ocultar el formulario.
   */
  readonly errorCarga = computed(() =>
    this.carrito() === null ? this.error() : null,
  );

  readonly puedeConfirmar = computed(
    () =>
      this.carrito() !== null &&
      this.fecha().length > 0 &&
      this.hora().length > 0 &&
      !this.guardando() &&
      !this.cargando(),
  );

  ngOnInit(): void {
    const id = Number(this.route.snapshot.paramMap.get('carrito_id'));
    if (!Number.isInteger(id) || id <= 0) {
      this.error.set('El carrito solicitado no es válido.');
      return;
    }
    this.carritoId.set(id);
    this.cargarCarrito(id);
  }

  cargarCarrito(carritoId: number): void {
    this.cargando.set(true);
    this.error.set(null);
    this.carritoService
      .obtenerCarrito(carritoId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (detalle) => {
          this.cargando.set(false);
          if (!this.carritoService.estaActivo(detalle)) {
            this.irAlListadoDeCarritos(
              'Este carrito ya no está disponible para reservar.',
            );
            return;
          }
          this.carrito.set(detalle);
        },
        error: (error: unknown) => {
          this.cargando.set(false);
          this.carrito.set(null);
          const traducido = traducirErrorReserva(error);
          if (traducido.sesionExpirada) {
            this.cerrarSesion();
            return;
          }
          if (traducido.volverAlCarrito) {
            this.irAlListadoDeCarritos(traducido.mensaje);
            return;
          }
          this.error.set(traducido.mensaje);
        },
      });
  }

  confirmarReserva(): void {
    const carritoId = this.carritoId();
    if (carritoId === null || this.carrito() === null || this.guardando()) {
      return;
    }

    const fechaAtencion = combinarFechaHoraAtencion(this.fecha(), this.hora());
    if (fechaAtencion === null) {
      this.errorFecha.set('Selecciona la fecha y la hora de atención.');
      return;
    }
    if (!esFechaHoraFutura(this.fecha(), this.hora())) {
      this.errorFecha.set('La fecha y hora de atención debe ser futura.');
      return;
    }

    this.errorFecha.set(null);
    this.error.set(null);
    this.volverAlCarrito.set(false);
    this.guardando.set(true);

    const observacion = this.observacion().trim();
    this.reservasService
      .crearReserva({
        carrito_id: carritoId,
        fecha_atencion: fechaAtencion,
        observacion: observacion.length > 0 ? observacion : null,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (reserva) => {
          this.guardando.set(false);
          this.toast.mostrar('Reserva creada correctamente.', 'ok');
          // El backend ya marcó el carrito como CONVERTIDO: se refresca el badge.
          this.carritoService.refrescarContador();
          void this.router.navigate(['/reservas', reserva.reserva_id]);
        },
        error: (error: unknown) => {
          this.guardando.set(false);
          const traducido = traducirErrorReserva(error);
          if (traducido.sesionExpirada) {
            this.cerrarSesion();
            return;
          }
          this.volverAlCarrito.set(traducido.volverAlCarrito);
          this.error.set(traducido.mensaje);
        },
      });
  }

  volverAlCarritoActual(): void {
    const carritoId = this.carritoId();
    if (carritoId !== null) {
      void this.router.navigate(['/carritos', carritoId]);
    }
  }

  irAMisReservas(): void {
    void this.router.navigate(['/reservas']);
  }

  onFecha(evento: Event): void {
    this.fecha.set((evento.target as HTMLInputElement).value);
    this.errorFecha.set(null);
  }

  onHora(evento: Event): void {
    this.hora.set((evento.target as HTMLInputElement).value);
    this.errorFecha.set(null);
  }

  onObservacion(evento: Event): void {
    this.observacion.set((evento.target as HTMLTextAreaElement).value);
  }

  private irAlListadoDeCarritos(mensaje: string): void {
    this.toast.mostrar(mensaje, 'info');
    void this.router.navigate(['/carritos']);
  }

  private cerrarSesion(): void {
    this.authService.cerrarSesion();
    this.carritoService.limpiar();
    void this.router.navigate(['/login'], {
      queryParams: { returnUrl: this.router.url },
    });
  }
}
