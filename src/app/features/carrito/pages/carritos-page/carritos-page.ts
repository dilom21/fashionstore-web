import { DatePipe, DecimalPipe } from '@angular/common';
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
import { CarritoResumen } from '../../models/carrito.model';
import { CarritoService } from '../../services/carrito.service';
import { traducirErrorCarrito } from '../../utils/carrito-error.util';

/**
 * Listado "Tus carritos" (CU15) - /carritos.
 *
 * Cada tarjeta representa UN carrito activo (una sucursal). El backend es la
 * autoridad: solo llegan los carritos vigentes (los expirados/eliminados no
 * aparecen). El contador del navbar es el nº de carritos, no de unidades.
 */
@Component({
  selector: 'app-carritos-page',
  imports: [Navbar, RouterLink, DatePipe, DecimalPipe, ConfirmDialog],
  styleUrl: './carritos-page.css',
  templateUrl: './carritos-page.html',
})
export class CarritosPage implements OnInit {
  readonly carritoService = inject(CarritoService);

  private readonly authService = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly error = signal<string | null>(null);
  readonly eliminando = signal(false);
  readonly pendienteEliminar = signal<CarritoResumen | null>(null);

  ngOnInit(): void {
    this.cargar();
  }

  cargar(): void {
    this.error.set(null);
    this.carritoService
      .listarCarritos()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        error: (error: unknown) => {
          const traducido = traducirErrorCarrito(error);
          if (traducido.sesionExpirada) {
            this.cerrarSesion();
            return;
          }
          this.error.set(traducido.mensaje);
        },
      });
  }

  verCarrito(carrito: CarritoResumen): void {
    void this.router.navigate(['/carritos', carrito.carrito_id]);
  }

  solicitarEliminar(carrito: CarritoResumen): void {
    if (this.eliminando()) {
      return;
    }
    this.pendienteEliminar.set(carrito);
  }

  cancelarEliminar(): void {
    this.pendienteEliminar.set(null);
  }

  confirmarEliminar(): void {
    const pendiente = this.pendienteEliminar();
    this.pendienteEliminar.set(null);
    if (pendiente === null) {
      return;
    }

    this.eliminando.set(true);
    this.carritoService
      .eliminarCarrito(pendiente.carrito_id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.eliminando.set(false);
          this.toast.mostrar('Carrito eliminado.', 'ok');
          this.cargar();
        },
        error: (error: unknown) => {
          this.eliminando.set(false);
          const traducido = traducirErrorCarrito(error);
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
    this.carritoService.limpiar();
    void this.router.navigate(['/login'], {
      queryParams: { returnUrl: this.router.url },
    });
  }
}
