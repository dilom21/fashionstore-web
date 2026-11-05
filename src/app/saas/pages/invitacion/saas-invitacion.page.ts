import {
  Component,
  DestroyRef,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';

import { SaasAuthService } from '../../services/saas-auth.service';
import { SaasErrorService } from '../../services/saas-error.service';

/**
 * Aceptación de invitación a una empresa (`POST /auth/tenant/invitaciones/aceptar`).
 *
 * El token puede llegar por query string (`/saas/invitacion?token=...`) o
 * pegarse manualmente. No se validan reglas de contraseña propias: el backend
 * es la autoridad (400/422) y sus mensajes se muestran traducidos.
 */
@Component({
  selector: 'app-saas-invitacion-page',
  imports: [ReactiveFormsModule, RouterLink],
  styleUrl: './saas-invitacion.page.css',
  templateUrl: './saas-invitacion.page.html',
})
export class SaasInvitacionPage {
  private readonly auth = inject(SaasAuthService);
  private readonly errores = inject(SaasErrorService);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);

  readonly form = new FormGroup({
    token: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required],
    }),
    password: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required],
    }),
    password_confirmacion: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required],
    }),
  });

  readonly enviando = signal(false);
  readonly mensajeError = signal<string | null>(null);
  readonly aceptada = signal(false);

  private readonly tokenInput =
    viewChild<ElementRef<HTMLInputElement>>('tokenInput');
  private readonly passwordInput =
    viewChild<ElementRef<HTMLInputElement>>('passwordInput');
  private readonly confirmacionInput =
    viewChild<ElementRef<HTMLInputElement>>('confirmacionInput');

  constructor() {
    const token = this.route.snapshot.queryParamMap.get('token');
    if (token !== null && token.trim().length > 0) {
      this.form.controls.token.setValue(token.trim());
    }

    this.form.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.mensajeError.set(null));
  }

  onSubmit(): void {
    if (this.enviando()) {
      return;
    }

    this.form.markAllAsTouched();
    this.mensajeError.set(null);

    if (this.form.invalid) {
      this.enfocarPrimerError();
      return;
    }

    const { token, password, password_confirmacion } = this.form.getRawValue();

    if (password !== password_confirmacion) {
      this.mensajeError.set('Las contraseñas no coinciden.');
      this.confirmacionInput()?.nativeElement.focus();
      return;
    }

    this.enviando.set(true);

    this.auth
      .aceptarInvitacion({ token, password, password_confirmacion })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.enviando.set(false);
          this.aceptada.set(true);
        },
        error: (error: unknown) => {
          this.enviando.set(false);
          this.mensajeError.set(
            this.errores.mensajeDeError(error, 'invitacion'),
          );
        },
      });
  }

  mensajeToken(): string | null {
    const control = this.form.controls.token;
    return control.untouched || !control.invalid
      ? null
      : 'Pega el token de tu invitación.';
  }

  mensajePassword(): string | null {
    const control = this.form.controls.password;
    return control.untouched || !control.invalid
      ? null
      : 'Define tu contraseña.';
  }

  mensajeConfirmacion(): string | null {
    const control = this.form.controls.password_confirmacion;
    return control.untouched || !control.invalid
      ? null
      : 'Repite la contraseña.';
  }

  private enfocarPrimerError(): void {
    const candidatos: Array<[boolean, ElementRef<HTMLInputElement> | undefined]> =
      [
        [this.form.controls.token.invalid, this.tokenInput()],
        [this.form.controls.password.invalid, this.passwordInput()],
        [
          this.form.controls.password_confirmacion.invalid,
          this.confirmacionInput(),
        ],
      ];

    for (const [invalido, referencia] of candidatos) {
      if (invalido && referencia !== undefined) {
        referencia.nativeElement.focus();
        return;
      }
    }
  }
}
