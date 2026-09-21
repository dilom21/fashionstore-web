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
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { AuthService } from '../../../autenticacion-seguridad/auth/services/auth.service';
import { Navbar } from '../../../home/components/navbar/navbar';
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
 * CU23 - Comprobante de venta para el CLIENTE
 * (/ventas/:venta_id/comprobante).
 *
 * Se abre desde el resultado exitoso de CU22 (`PagoElectronicoPage` ->
 * VER COMPROBANTE) tras el pago con Stripe. Conserva la identidad del sitio del
 * cliente (mismo `Navbar`) y reutiliza la MISMA vista del comprobante que el
 * panel del personal: no se duplica el cuerpo del recibo.
 *
 * Solo lectura: consulta el comprobante ya emitido. No vuelve a consultar
 * Stripe, no registra pagos y no modifica la venta.
 */
@Component({
  selector: 'app-comprobante-cliente-page',
  imports: [Navbar, RouterLink, ComprobanteVentaView],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './comprobante-cliente-page.css',
  templateUrl: './comprobante-cliente-page.html',
})
export class ComprobanteClientePage implements OnInit {
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

  /** Regreso a las compras del cliente (contexto del sitio). */
  volver(): void {
    void this.router.navigate(['/carritos']);
  }

  /** Sesión expirada: se reutiliza el mecanismo existente del sitio. */
  private cerrarSesion(): void {
    this.authService.cerrarSesion();
    void this.router.navigate(['/login'], {
      queryParams: { returnUrl: this.router.url },
    });
  }
}
