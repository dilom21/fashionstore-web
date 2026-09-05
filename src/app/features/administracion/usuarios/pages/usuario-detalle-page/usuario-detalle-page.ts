import { DatePipe } from '@angular/common';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { AuthService } from '../../../../autenticacion-seguridad/auth/services/auth.service';
import { ConfirmDialog } from '../../../../../shared/components/confirm-dialog/confirm-dialog';
import { Usuario } from '../../models/usuario.model';
import { UsuariosService } from '../../services/usuarios.service';
import { traducirErrorHttp } from '../../utils/http-error.util';

/** Estado de carga y manejo de la confirmación de habilitar/deshabilitar. */
interface ConfirmacionEstado {
  habilitar: boolean;
}

/**
 * Detalle de usuario (CU03) - /admin/usuarios/:id.
 *
 * Consume GET /usuarios/{id} y muestra la ficha completa con acciones de
 * editar y habilitar/deshabilitar.
 */
@Component({
  selector: 'app-usuario-detalle-page',
  imports: [RouterLink, DatePipe, ConfirmDialog],
  styleUrl: './usuario-detalle-page.css',
  templateUrl: './usuario-detalle-page.html',
})
export class UsuarioDetallePage {
  private readonly usuariosService = inject(UsuariosService);
  private readonly authService = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly usuario = signal<Usuario | null>(null);
  readonly cargando = signal(true);
  readonly error = signal<string | null>(null);
  readonly procesando = signal(false);
  readonly mensajeExito = signal<string | null>(null);
  readonly confirmacion = signal<ConfirmacionEstado | null>(null);

  private usuarioId: number | null = null;

  ngOnInit(): void {
    const idParam = this.route.snapshot.paramMap.get('id');
    if (idParam === null || !/^\d+$/.test(idParam)) {
      this.error.set('No se encontró el usuario solicitado.');
      this.cargando.set(false);
      return;
    }
    this.usuarioId = Number(idParam);
    this.cargarUsuario();
  }

  nombreEmpleado(): string {
    const empleado = this.usuario()?.empleado;
    if (!empleado) {
      return '—';
    }
    return `${empleado.nombres} ${empleado.apellidos}`.trim();
  }

  esMiCuenta(): boolean {
    return this.usuario()?.id === this.authService.usuarioActual()?.id;
  }

  solicitarCambioEstado(): void {
    if (this.procesando()) {
      return;
    }
    const usuario = this.usuario();
    if (usuario === null) {
      return;
    }
    if (usuario.estado && this.esMiCuenta()) {
      return;
    }
    this.confirmacion.set({ habilitar: !usuario.estado });
  }

  cancelarConfirmacion(): void {
    this.confirmacion.set(null);
  }

  confirmarCambioEstado(): void {
    const pendiente = this.confirmacion();
    this.confirmacion.set(null);
    const usuario = this.usuario();
    if (pendiente === null || usuario === null || this.usuarioId === null) {
      return;
    }

    this.procesando.set(true);
    this.error.set(null);
    this.mensajeExito.set(null);

    this.usuariosService
      .cambiarEstadoUsuario(this.usuarioId, pendiente.habilitar)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.procesando.set(false);
          this.mensajeExito.set(
            pendiente.habilitar
              ? `La cuenta de ${usuario.correo} fue habilitada.`
              : `La cuenta de ${usuario.correo} fue deshabilitada.`,
          );
          this.cargarUsuario();
        },
        error: (error: unknown) => {
          this.procesando.set(false);
          this.manejarError(error);
        },
      });
  }

  private cargarUsuario(): void {
    if (this.usuarioId === null) {
      return;
    }
    this.cargando.set(true);
    this.error.set(null);

    this.usuariosService
      .obtenerUsuario(this.usuarioId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (usuario) => {
          this.cargando.set(false);
          this.usuario.set(usuario);
        },
        error: (error: unknown) => {
          this.cargando.set(false);
          this.usuario.set(null);
          this.manejarError(error);
        },
      });
  }

  private manejarError(error: unknown): void {
    const traducido = traducirErrorHttp(error);
    if (traducido.sesionExpirada) {
      this.authService.cerrarSesion();
      void this.router.navigateByUrl('/auth/personal/login');
      return;
    }
    this.error.set(traducido.mensaje);
  }
}
