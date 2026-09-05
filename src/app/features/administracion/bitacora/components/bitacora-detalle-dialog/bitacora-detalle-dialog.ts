import { DatePipe } from '@angular/common';
import {
  Component,
  DestroyRef,
  HostListener,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';

import { AuthService } from '../../../../autenticacion-seguridad/auth/services/auth.service';
import { BitacoraEvento } from '../../models/bitacora.model';
import { BitacoraService } from '../../services/bitacora.service';
import { traducirErrorBitacora } from '../../utils/http-error.util';
import {
  esEventoDeSistema,
  humanizarBitacora,
  textoDescripcionEvento,
  textoIpEvento,
  textoRolEvento,
  textoUsuarioEvento,
} from '../../utils/humanizar.util';

/**
 * Diálogo de detalle de un evento de bitácora (CU05).
 *
 * Solo lectura: consume GET /bitacora/{bitacora_id} al abrirse y muestra la
 * ficha completa. Nunca permite crear, editar ni eliminar.
 */
@Component({
  selector: 'app-bitacora-detalle-dialog',
  imports: [DatePipe],
  styleUrl: './bitacora-detalle-dialog.css',
  templateUrl: './bitacora-detalle-dialog.html',
})
export class BitacoraDetalleDialog {
  /** Id del evento a consultar. */
  readonly bitacoraId = input.required<number>();
  /** Emitido al cerrar el diálogo. */
  readonly cerrado = output<void>();

  private readonly bitacoraService = inject(BitacoraService);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly evento = signal<BitacoraEvento | null>(null);
  readonly cargando = signal(true);
  readonly error = signal<string | null>(null);

  /** Delegaciones de presentación para el template. */
  readonly humanizar = humanizarBitacora;
  readonly esSistema = esEventoDeSistema;
  readonly textoUsuario = textoUsuarioEvento;
  readonly textoRol = textoRolEvento;
  readonly textoIp = textoIpEvento;
  readonly textoDescripcion = textoDescripcionEvento;

  ngOnInit(): void {
    this.cargar();
  }

  cargar(): void {
    this.cargando.set(true);
    this.error.set(null);
    this.bitacoraService
      .obtenerBitacora(this.bitacoraId())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (evento) => {
          this.cargando.set(false);
          this.evento.set(evento);
        },
        error: (error: unknown) => {
          this.cargando.set(false);
          this.manejarError(error);
        },
      });
  }

  cerrar(): void {
    this.cerrado.emit();
  }

  @HostListener('document:keydown', ['$event'])
  onKeydown(evento: KeyboardEvent): void {
    if (evento.key === 'Escape') {
      this.cerrar();
    }
  }

  private manejarError(error: unknown): void {
    const traducido = traducirErrorBitacora(error);
    if (traducido.sesionExpirada) {
      this.authService.cerrarSesion();
      void this.router.navigateByUrl('/auth/personal/login');
      return;
    }
    this.error.set(traducido.mensaje);
  }
}
