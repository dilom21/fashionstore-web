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
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { AuthService } from '../../services/auth.service';

const MENSAJE_CREDENCIALES =
  'No pudimos iniciar sesión. Verifica tus datos e inténtalo nuevamente.';
const MENSAJE_CONEXION =
  'No pudimos conectarnos con el servicio. Inténtalo nuevamente en unos momentos.';

/**
 * Página de inicio de sesión de CLIENTES (VANTER MEN).
 *
 * - Usa exclusivamente AuthService.loginCliente() (POST /auth/clientes/login).
 * - El registro público de clientes vive en /registro (CU29); la recuperación
 *   de contraseña sigue pendiente.
 * - Si el cliente ya está autenticado, redirige a returnUrl válido o a "/".
 */
@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule, RouterLink],
  styleUrl: './login.css',
  templateUrl: './login.html',
})
export class Login {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
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

  constructor() {
    // Al editar cualquier campo se limpia el error general mostrado.
    this.form.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.mensajeError.set(null));

    // Precarga opcional del correo enviado desde el registro (?correo=...).
    // Solo el correo: la contraseña queda vacía y NO hay auto-login.
    const correoPrecargado = this.route.snapshot.queryParamMap.get('correo');
    if (correoPrecargado !== null && correoPrecargado.trim().length > 0) {
      this.form.controls.correo.setValue(
        correoPrecargado.trim().slice(0, 150),
      );
    }

    // Si ya existe un cliente autenticado (p. ej. tras restaurar sesión o
    // justo después de un login correcto), esta página no debe mostrarse:
    // se redirige a returnUrl válido o a "/".
    effect(() => {
      if (
        this.authService.contexto() === 'cliente' &&
        this.authService.autenticado()
      ) {
        this.redirigirTrasLogin();
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
      .loginCliente({ correo, password })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.enviando.set(false);
          // La redirección la realiza el effect: usuarioActual/contexto ya
          // reflejan al cliente autenticado.
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

  /**
   * Destino tras el login. Solo acepta rutas internas que empiecen por "/" y
   * no por "//", para evitar open redirect hacia dominios externos.
   */
  private destinoTrasLogin(): string {
    const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl');
    if (returnUrl && returnUrl.startsWith('/') && !returnUrl.startsWith('//')) {
      return returnUrl;
    }
    return '/';
  }

  private redirigirTrasLogin(): void {
    void this.router.navigateByUrl(this.destinoTrasLogin(), {
      replaceUrl: true,
    });
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
