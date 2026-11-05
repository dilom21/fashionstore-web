import { HttpErrorResponse } from '@angular/common/http';
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
import { Router, RouterLink } from '@angular/router';

import { environment } from '../../../../environments/environment';
import { TenantContexto } from '../../models/tenant.models';
import { SaasAuthService } from '../../services/saas-auth.service';
import { SaasErrorService } from '../../services/saas-error.service';
import { SaasPermissionsService } from '../../services/saas-permissions.service';
import { SaasSessionService } from '../../services/saas-session.service';

/** Slug de empresa: minúsculas, números y guiones simples (sin guion final). */
export const SAAS_PATRON_SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/**
 * Aviso de credenciales incorrectas.
 *
 * Un 401 en `POST /auth/tenant/login` significa correo, contraseña o empresa
 * equivocados; el mensaje genérico de sesión expirada solo confunde (el usuario
 * ni siquiera había entrado).
 */
export const MENSAJE_CREDENCIALES_INVALIDAS =
  'Correo, contraseña o empresa incorrectos.';

/**
 * Login de empresa del modo SaaS (`POST /auth/tenant/login`).
 *
 * - El contexto (`personal` | `cliente`) forma parte del contrato: el backend
 *   valida que la membresía corresponda a ese contexto.
 * - Los errores se muestran con `SaasErrorService` (401, 422, 429, 503, red).
 * - Al autenticar se guarda la sesión y se navega a `/saas/inicio`; el guard
 *   de tenant completa la identidad con `GET /auth/tenant/me`.
 */
@Component({
  selector: 'app-saas-login-page',
  imports: [ReactiveFormsModule, RouterLink],
  styleUrl: './saas-login.page.css',
  templateUrl: './saas-login.page.html',
})
export class SaasLoginPage {
  private readonly auth = inject(SaasAuthService);
  private readonly sesion = inject(SaasSessionService);
  private readonly permisos = inject(SaasPermissionsService);
  private readonly errores = inject(SaasErrorService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  /** Entorno compilado, visible para evitar confundir SaaS local con legacy. */
  readonly entorno = environment.saasNombreEntorno;

  readonly form = new FormGroup({
    empresa_slug: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.pattern(SAAS_PATRON_SLUG)],
    }),
    correo: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.email],
    }),
    password: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required],
    }),
    contexto: new FormControl<TenantContexto>('personal', {
      nonNullable: true,
      validators: [Validators.required],
    }),
  });

  readonly enviando = signal(false);
  readonly mensajeError = signal<string | null>(null);

  private readonly slugInput =
    viewChild<ElementRef<HTMLInputElement>>('slugInput');
  private readonly correoInput =
    viewChild<ElementRef<HTMLInputElement>>('correoInput');
  private readonly passwordInput =
    viewChild<ElementRef<HTMLInputElement>>('passwordInput');

  constructor() {
    // Al volver al login el aviso de "sesión expirada" ya no aplica.
    this.sesion.limpiarExpirada();

    // Autocompletado (slug y correo recordados). Nunca se recuerda la clave.
    const slug = this.sesion.empresaSlugRecordado();
    if (slug !== null) {
      this.form.controls.empresa_slug.setValue(slug);
    }
    const correo = this.sesion.correoRecordado();
    if (correo !== null) {
      this.form.controls.correo.setValue(correo);
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

    const { empresa_slug, correo, password, contexto } =
      this.form.getRawValue();

    this.enviando.set(true);

    this.auth
      .login({ correo, password, empresa_slug, contexto })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (respuesta) => {
          this.enviando.set(false);
          this.sesion.guardarSesion(respuesta, correo);
          // La matriz anterior pertenecía a otra empresa/sesión.
          this.permisos.limpiar();
          void this.router.navigateByUrl(
            respuesta.contexto === 'cliente' ? '/saas/cliente' : '/saas/inicio', {
            replaceUrl: true,
          });
        },
        error: (error: unknown) => {
          this.enviando.set(false);
          this.mensajeError.set(this.mensajeDeLogin(error));
          if (error instanceof HttpErrorResponse && error.status === 0) {
            return;
          }
          this.enfocarPrimerError();
        },
      });
  }

  /** Mensaje de validación del slug de empresa, o null si no corresponde. */
  mensajeSlug(): string | null {
    const control = this.form.controls.empresa_slug;
    if (control.untouched || !control.invalid) {
      return null;
    }
    if (control.hasError('required')) {
      return 'Ingresa el slug de la empresa.';
    }
    return 'El slug solo admite minúsculas, números y guiones (ejemplo: mi-empresa).';
  }

  mensajeCorreo(): string | null {
    const control = this.form.controls.correo;
    if (control.untouched || !control.invalid) {
      return null;
    }
    if (control.hasError('required')) {
      return 'Ingresa tu correo electrónico.';
    }
    return 'Ingresa un correo electrónico válido.';
  }

  mensajePassword(): string | null {
    const control = this.form.controls.password;
    if (control.untouched || !control.invalid) {
      return null;
    }
    return control.hasError('required') ? 'Ingresa tu contraseña.' : null;
  }

  /**
   * Mensaje del fallo de login.
   *
   * El 401 del login es un problema de credenciales/empresa; el resto de
   * estados (422, 429, 503, red) siguen el traductor común de errores.
   */
  private mensajeDeLogin(error: unknown): string {
    if (error instanceof HttpErrorResponse && error.status === 401) {
      return MENSAJE_CREDENCIALES_INVALIDAS;
    }
    return this.errores.mensajeDeError(error, 'login');
  }

  /** Lleva el foco al primer campo inválido (accesibilidad de formularios). */
  private enfocarPrimerError(): void {
    const candidatos: Array<[
      boolean,
      ElementRef<HTMLInputElement> | undefined,
    ]> = [
      [this.form.controls.empresa_slug.invalid, this.slugInput()],
      [this.form.controls.correo.invalid, this.correoInput()],
      [this.form.controls.password.invalid, this.passwordInput()],
    ];

    for (const [invalido, referencia] of candidatos) {
      if (invalido && referencia !== undefined) {
        referencia.nativeElement.focus();
        return;
      }
    }
  }
}
