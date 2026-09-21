import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';

import { AdminIcon } from '../../../administracion/components/admin-icon/admin-icon';
import { AuthService } from '../../../autenticacion-seguridad/auth/services/auth.service';
import { ComprobanteVentaView } from '../../components/comprobante-venta-view/comprobante-venta-view';
import {
  ComprobanteVenta,
  codigoVenta,
} from '../../models/comprobante-venta.model';
import { ComprobanteVentaService } from '../../services/comprobante-venta.service';
import {
  ErrorComprobanteVenta,
  traducirErrorComprobante,
} from '../../utils/comprobante-venta-error.util';

/**
 * CU23 - Comprobante de venta para el PERSONAL
 * (/personal/ventas/:venta_id/comprobante).
 *
 * Se abre contextualmente desde el resultado exitoso de CU21
 * (`PagoPresencialDialog` -> VER COMPROBANTE) tanto en la venta presencial
 * directa (CU20) como en la proveniente de una reserva (CU18 -> CU20).
 *
 * Es solo lectura: consulta GET /ventas/{venta_id}/comprobante. No registra
 * pagos, no modifica la venta ni la reserva y no ofrece listados (no existe un
 * endpoint de listado de comprobantes).
 */
@Component({
  selector: 'app-comprobante-personal-page',
  imports: [AdminIcon, ComprobanteVentaView],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './comprobante-personal-page.css',
  templateUrl: './comprobante-personal-page.html',
})
export class ComprobantePersonalPage implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly comprobanteService = inject(ComprobanteVentaService);
  private readonly authService = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);

  readonly comprobante = signal<ComprobanteVenta | null>(null);
  readonly cargando = signal(true);
  readonly error = signal<ErrorComprobanteVenta | null>(null);
  readonly ventaId = signal<number | null>(null);

  readonly codigo = computed(() => {
    const id = this.ventaId();
    return id === null ? '' : codigoVenta(id);
  });

  ngOnInit(): void {
    this.cargarComprobante();
  }

  /** Consulta el comprobante (carga inicial y REINTENTAR). */
  cargarComprobante(): void {
    const parametro = this.route.snapshot.paramMap.get('venta_id');
    const id = Number(parametro);

    if (parametro === null || !Number.isInteger(id) || id <= 0) {
      this.cargando.set(false);
      this.comprobante.set(null);
      this.error.set(
        traducirErrorComprobante(new HttpErrorResponse({ status: 404 })),
      );
      return;
    }

    this.ventaId.set(id);
    this.cargando.set(true);
    this.error.set(null);

    this.comprobanteService
      .obtenerComprobante(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (comprobante) => {
          this.comprobante.set(comprobante);
          this.cargando.set(false);
        },
        error: (error: unknown) => {
          const traducido = traducirErrorComprobante(error);
          this.cargando.set(false);
          if (traducido.sesionExpirada) {
            this.cerrarSesion();
            return;
          }
          this.comprobante.set(null);
          this.error.set(traducido);
        },
      });
  }

  /** Regreso al área operativa de ventas presenciales (contexto del personal). */
  volver(): void {
    void this.router.navigate(['/personal/ventas/presencial']);
  }

  /** Sesión expirada: se reutiliza el mecanismo existente. */
  private cerrarSesion(): void {
    this.authService.cerrarSesion();
    void this.router.navigate(['/auth/personal/login'], {
      queryParams: { returnUrl: this.router.url },
    });
  }
}
