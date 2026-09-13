import { HttpErrorResponse } from '@angular/common/http';
import {
  Component,
  DestroyRef,
  effect,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

import { AuthService } from '../../services/auth.service';

const MENSAJE_CREDENCIALES =
  'No pudimos iniciar sesión. Verifica tus datos e inténtalo nuevamente.';
const MENSAJE_CONEXION =
  'No pudimos conectarnos con el servicio. Inténtalo nuevamente.';

/**
 * Página de acceso del PERSONAL (VANTER MEN).
 *
 * Ruta interna: /auth/personal/login.
 * - Usa exclusivamente AuthService.loginPersonal() (POST /auth/personal/login).
 * - No aparece en la tienda pública: el personal conoce la dirección.
 * - Si ya hay un usuario de personal autenticado, redirige a /dashboard.
 */
@Component({
  selector: 'app-personal-login',
  imports: [ReactiveFormsModule, RouterLink],
  styleUrl: './personal-login.css',
  templateUrl: './personal-login.html',
})
export class PersonalLogin {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly form = new FormGroup({
    correo: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.email],
    }),
    password: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required],
    }),
  });

  readonly enviando = signal(false);
  readonly mensajeError = signal<string | null>(null);
  readonly mostrarPassword = signal(false);
  readonly avisoRecuperacion = signal(false);

  constructor() {
    // Al editar cualquier campo se limpia el error general mostrado.
    this.form.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.mensajeError.set(null));

    // Personal ya autenticado (o sesión restaurada): va a su panel.
    // - ADMINISTRADOR: entra directo a Gestión de Usuarios.
    // - ENCARGADO_SUCURSAL: entra a CU13 (Consultar inventario).
    // - Resto (p. ej. CAJERO): al dashboard.
    effect(() => {
      if (
        this.authService.contexto() === 'personal' &&
        this.authService.autenticado()
      ) {
        void this.router.navigateByUrl(this.destinoPersonal());
      }
    });
  }

  onSubmit(): void {
    if (this.enviando()) {
      return;
    }

    this.form.markAllAsTouched();
    this.mensajeError.set(null);

    if (this.form.invalid) {
      return;
    }

    this.enviando.set(true);
    const { correo, password } = this.form.getRawValue();

    this.authService
      .loginPersonal({ correo, password })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.enviando.set(false);
          // El effect anterior redirige a /dashboard en cuanto la sesión
          // queda marcada como contexto "personal".
        },
        error: (error: unknown) => {
          this.enviando.set(false);
          this.mensajeError.set(this.mensajeParaError(error));
        },
      });
  }

  toggleMostrarPassword(): void {
    this.mostrarPassword.update((visible) => !visible);
  }

  /** Recuperación de contraseña aún no disponible: solo feedback visual. */
  avisoDeRecuperacion(): void {
    this.avisoRecuperacion.set(true);
    window.setTimeout(() => this.avisoRecuperacion.set(false), 4000);
  }

  /** Mensaje de validación del correo, o null si no corresponde mostrarlo. */
  mensajeCorreo(): string | null {
    const control = this.form.controls.correo;
    if (control.untouched || !control.invalid) {
      return null;
    }
    if (control.hasError('required')) {
      return 'Ingresa tu correo electrónico.';
    }
    if (control.hasError('email')) {
      return 'Ingresa un correo electrónico válido.';
    }
    return null;
  }

  /** Mensaje de validación de la contraseña, o null si no corresponde. */
  mensajePassword(): string | null {
    const control = this.form.controls.password;
    if (control.untouched || !control.invalid) {
      return null;
    }
    if (control.hasError('required')) {
      return 'Ingresa tu contraseña.';
    }
    return null;
  }

  /** Destino del personal autenticado según su rol (frontend/UX). */
  private destinoPersonal(): string {
    if (this.authService.esAdministrador()) {
      return '/admin/usuarios';
    }
    if (this.authService.esEncargadoSucursal()) {
      return '/admin/inventario/consultar';
    }
    return '/dashboard';
  }

  private mensajeParaError(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      if (error.status === 401) {
        return MENSAJE_CREDENCIALES;
      }
      if (error.status === 0 || error.status >= 500) {
        return MENSAJE_CONEXION;
      }
    }
    return MENSAJE_CREDENCIALES;
  }
}