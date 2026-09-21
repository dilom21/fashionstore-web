import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  ValidationErrors,
  ValidatorFn,
  Validators,
} from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

import {
  ClienteRegistroRequest,
  ClienteRegistroResponse,
  OPCIONES_SEXO,
  SexoCliente,
} from '../../models/auth.models';
import { AuthService } from '../../services/auth.service';
import {
  PasswordStrength,
  etiquetaNivel,
  evaluarFortalezaPassword,
  progresoFortaleza,
  requisitosPassword,
} from '../../utils/password-strength.util';

const MENSAJE_CONEXION =
  'No pudimos conectarnos con el servicio. Inténtalo nuevamente.';
const MENSAJE_SERVIDOR = 'No pudimos crear tu cuenta. Inténtalo nuevamente.';
const MENSAJE_CONFLICTO = 'Ya existe una cuenta con los datos proporcionados.';
const MENSAJE_422 = 'Revisa los datos ingresados.';

/** Validador de grupo: `password` debe coincidir con `password_confirmacion`. */
const passwordsIguales: ValidatorFn = (
  grupo: AbstractControl,
): ValidationErrors | null => {
  const password = String(grupo.get('password')?.value ?? '');
  const confirmacion = String(grupo.get('password_confirmacion')?.value ?? '');
  // Sin confirmación escrita todavía no se marca error: ese campo tiene su
  // propio `required`.
  if (confirmacion.length === 0) {
    return null;
  }
  return password === confirmacion ? null : { passwordsDistintas: true };
};

/**
 * Registro público de CLIENTE (POST /auth/clientes/registro).
 *
 * - Solo crea la cuenta: NO hay auto-login ni se guarda JWT.
 * - La fortaleza de contraseña se calcula en el navegador con las MISMAS
 *   reglas del backend (sin consultar a la API).
 * - Estas validaciones son UX: el backend sigue siendo la autoridad
 *   (409 correo/CI, 422 datos).
 */
@Component({
  selector: 'app-registro-cliente',
  imports: [ReactiveFormsModule, RouterLink],
  styleUrl: './registro-cliente.css',
  templateUrl: './registro-cliente.html',
})
export class RegistroCliente {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly opcionesSexo = OPCIONES_SEXO;

  /** Fecha máxima seleccionable: hoy (el backend sigue validando). */
  readonly hoy = new Date().toISOString().slice(0, 10);

  readonly form = new FormGroup(
    {
      nombre: new FormControl('', {
        nonNullable: true,
        validators: [
          Validators.required,
          Validators.minLength(2),
          Validators.maxLength(100),
        ],
      }),
      apellido: new FormControl('', {
        nonNullable: true,
        validators: [
          Validators.required,
          Validators.minLength(2),
          Validators.maxLength(100),
        ],
      }),
      correo: new FormControl('', {
        nonNullable: true,
        validators: [
          Validators.required,
          Validators.email,
          Validators.maxLength(150),
        ],
      }),
      ci: new FormControl('', {
        nonNullable: true,
        validators: [
          Validators.required,
          Validators.minLength(3),
          Validators.maxLength(30),
        ],
      }),
      telefono: new FormControl('', {
        nonNullable: true,
        validators: [Validators.required, Validators.maxLength(30)],
      }),
      sexo: new FormControl<SexoCliente | ''>('', {
        nonNullable: true,
        validators: [Validators.required],
      }),
      fecha_nacimiento: new FormControl('', {
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
    },
    { validators: passwordsIguales },
  );

  /**
   * Estado reactivo del formulario. `form.valid` por si solo no es una señal,
   * por lo que un `computed` no se actualiza cuando el último campo completado
   * es, por ejemplo, nombre, correo o fecha de nacimiento.
   */
  private readonly estadoFormulario = toSignal(this.form.statusChanges, {
    initialValue: this.form.status,
  });

  readonly enviando = signal(false);
  readonly mensajeError = signal<string | null>(null);
  readonly mostrarPassword = signal(false);
  readonly mostrarConfirmacion = signal(false);
  /** Con datos ⇒ se muestra el modal «Cuenta creada». */
  readonly cuentaCreada = signal<ClienteRegistroResponse | null>(null);

  /** Espejos en señal: permiten evaluar fortaleza y confirmación en vivo. */
  private readonly passwordActual = signal('');
  private readonly confirmacionActual = signal('');

  readonly fortaleza = computed<PasswordStrength>(() =>
    evaluarFortalezaPassword(this.passwordActual()),
  );
  readonly requisitos = computed(() => requisitosPassword(this.fortaleza()));
  readonly progreso = computed(() => progresoFortaleza(this.fortaleza()));
  readonly nivelTexto = computed(() => etiquetaNivel(this.fortaleza()));
  /** El checklist/barra aparecen cuando el usuario empieza a escribir. */
  readonly mostrarFortaleza = computed(() => this.passwordActual().length > 0);

  /** Contraseñas distintas (solo se avisa cuando ya hay confirmación). */
  readonly passwordsDistintas = computed(
    () =>
      this.confirmacionActual().length > 0 &&
      this.form.hasError('passwordsDistintas'),
  );

  /**
   * CTA habilitado solo con formulario válido, contraseña VERDE (cumple la
   * política), sin envío en curso y sin discrepancias de confirmación.
   */
  readonly puedeEnviar = computed(
    () =>
      this.estadoFormulario() === 'VALID' &&
      this.fortaleza().valida &&
      !this.passwordsDistintas() &&
      !this.enviando(),
  );

  constructor() {
    this.form.controls.password.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((valor) => this.passwordActual.set(valor));

    this.form.controls.password_confirmacion.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((valor) => this.confirmacionActual.set(valor));

    // Al editar cualquier campo se limpia el error general mostrado.
    this.form.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.mensajeError.set(null));
  }

  // ===== Envío =====
  onSubmit(): void {
    if (this.enviando()) {
      return; // 1) nunca dos envíos simultáneos
    }

    this.form.markAllAsTouched(); // 2)
    this.mensajeError.set(null);

    if (this.form.invalid) {
      return; // 3)
    }
    if (!this.fortaleza().valida) {
      // 4) el backend revalida igualmente
      this.mensajeError.set(
        'La contraseña debe cumplir la política: 8 a 128 caracteres, una mayúscula, una minúscula, un número y un carácter especial.',
      );
      return;
    }
    if (this.passwordsDistintas()) {
      this.mensajeError.set('Las contraseñas no coinciden.'); // 5)
      return;
    }

    const valores = this.form.getRawValue();

    // 6) y 7) contrato exacto del backend, con textos normalizados.
    const datos: ClienteRegistroRequest = {
      nombre: valores.nombre.trim(),
      apellido: valores.apellido.trim(),
      correo: valores.correo.trim().toLowerCase(),
      ci: valores.ci.trim(),
      telefono: valores.telefono.trim(),
      sexo: valores.sexo as SexoCliente,
      fecha_nacimiento: valores.fecha_nacimiento,
      password: valores.password,
      password_confirmacion: valores.password_confirmacion,
    };

    this.enviando.set(true);

    this.authService
      .registrarCliente(datos) // 8)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (respuesta) => {
          // 9) 201: NO hay auto-login; se muestra la confirmación.
          this.enviando.set(false);
          this.cuentaCreada.set(respuesta);
        },
        error: (error: unknown) => {
          // 10) mensajes claros, sin HttpErrorResponse/JSON/stack.
          this.enviando.set(false);
          this.mensajeError.set(this.mensajeParaError(error));
        },
      });
  }

  toggleMostrarPassword(): void {
    this.mostrarPassword.update((visible) => !visible);
  }

  toggleMostrarConfirmacion(): void {
    this.mostrarConfirmacion.update((visible) => !visible);
  }

  /** Navega al login con el correo creado precargado (sin clave ni auto-login). */
  irALogin(): void {
    const correo = this.cuentaCreada()?.correo ?? null;
    void this.router.navigate(['/login'], {
      queryParams: correo === null || correo === '' ? {} : { correo },
    });
  }

  irATienda(): void {
    void this.router.navigateByUrl('/');
  }

  // ===== Mensajes por campo =====
  mensajeNombre(): string | null {
    return this.mensajeDe(this.form.controls.nombre, {
      required: 'Ingresa tu nombre.',
      minlength: 'El nombre debe tener al menos 2 caracteres.',
      maxlength: 'El nombre no puede superar 100 caracteres.',
    });
  }

  mensajeApellido(): string | null {
    return this.mensajeDe(this.form.controls.apellido, {
      required: 'Ingresa tu apellido.',
      minlength: 'El apellido debe tener al menos 2 caracteres.',
      maxlength: 'El apellido no puede superar 100 caracteres.',
    });
  }

  mensajeCorreo(): string | null {
    return this.mensajeDe(this.form.controls.correo, {
      required: 'Ingresa tu correo electrónico.',
      email: 'Ingresa un correo electrónico válido.',
      maxlength: 'El correo no puede superar 150 caracteres.',
    });
  }

  mensajeCi(): string | null {
    return this.mensajeDe(this.form.controls.ci, {
      required: 'Ingresa tu número de documento.',
      minlength: 'El documento debe tener al menos 3 caracteres.',
      maxlength: 'El documento no puede superar 30 caracteres.',
    });
  }

  mensajeTelefono(): string | null {
    return this.mensajeDe(this.form.controls.telefono, {
      required: 'Ingresa tu teléfono.',
      maxlength: 'El teléfono no puede superar 30 caracteres.',
    });
  }

  mensajeSexo(): string | null {
    return this.mensajeDe(this.form.controls.sexo, {
      required: 'Selecciona una opción.',
    });
  }

  mensajeFechaNacimiento(): string | null {
    return this.mensajeDe(this.form.controls.fecha_nacimiento, {
      required: 'Ingresa tu fecha de nacimiento.',
    });
  }

  mensajePassword(): string | null {
    return this.mensajeDe(this.form.controls.password, {
      required: 'Ingresa una contraseña.',
    });
  }

  mensajeConfirmacion(): string | null {
    const control = this.form.controls.password_confirmacion;
    if (control.untouched) {
      return null;
    }
    if (this.passwordsDistintas()) {
      return 'Las contraseñas no coinciden.';
    }
    return this.mensajeDe(control, { required: 'Confirma tu contraseña.' });
  }

  /** Mensaje del control: `null` mientras no deba mostrarse. */
  private mensajeDe(
    control: AbstractControl,
    mensajes: Record<string, string>,
  ): string | null {
    if (control.untouched || !control.invalid) {
      return null;
    }
    for (const clave of Object.keys(control.errors ?? {})) {
      const texto = mensajes[clave];
      if (texto !== undefined) {
        return texto;
      }
    }
    return mensajes['required'] ?? null;
  }

  // ===== Errores del backend (409 correo/CI se distinguen por `detail`) =====
  private mensajeParaError(error: unknown): string {
    if (!(error instanceof HttpErrorResponse)) {
      return MENSAJE_SERVIDOR;
    }

    if (error.status === 409) {
      const detalle = this.detalle(error);
      if (/correo|email/i.test(detalle)) {
        return 'Ya existe una cuenta registrada con este correo.';
      }
      if (
        /\bci\b/i.test(detalle) ||
        /documento/i.test(detalle) ||
        /carnet/i.test(detalle)
      ) {
        return 'Ya existe un cliente registrado con este documento.';
      }
      return MENSAJE_CONFLICTO;
    }

    if (error.status === 422) {
      const detalle = this.detalle(error);
      if (/coincid|confirmac/i.test(detalle)) {
        return 'Las contraseñas no coinciden.';
      }
      if (/password|contrase/i.test(detalle)) {
        return 'La contraseña debe cumplir la política: 8 a 128 caracteres, una mayúscula, una minúscula, un número y un carácter especial.';
      }
      return MENSAJE_422;
    }

    if (error.status === 0) {
      return MENSAJE_CONEXION;
    }

    return MENSAJE_SERVIDOR;
  }

  /** `detail` del backend como texto plano (nunca se muestra tal cual). */
  private detalle(error: HttpErrorResponse): string {
    const cuerpo: unknown = error.error;
    if (cuerpo === null || typeof cuerpo !== 'object') {
      return '';
    }
    const detalle = (cuerpo as { detail?: unknown }).detail;
    if (typeof detalle === 'string') {
      return detalle;
    }
    if (Array.isArray(detalle)) {
      return detalle
        .map((item) =>
          item !== null && typeof item === 'object'
            ? String((item as { msg?: unknown }).msg ?? '')
            : String(item),
        )
        .join(' ');
    }
    return '';
  }
}
