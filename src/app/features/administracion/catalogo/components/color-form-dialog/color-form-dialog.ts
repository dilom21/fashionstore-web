import {
  Component,
  DestroyRef,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { Router } from '@angular/router';

import { AuthService } from '../../../../autenticacion-seguridad/auth/services/auth.service';
import {
  Color,
  ColorCreatePayload,
  ColorUpdatePayload,
} from '../../models/color.model';
import { ColoresService } from '../../services/colores.service';
import { traducirErrorCatalogo } from '../../utils/http-error.util';

/**
 * Diálogo para crear o editar un color (CU07).
 *
 * - Crear: POST /colores.
 * - Editar: PATCH /colores/{id} solo si el nombre cambió.
 *
 * La tabla de colores no tiene código hexadecimal: solo nombre y estado.
 * El backend responde 409 si el nombre ya existe. La habilitación/
 * deshabilitación es una acción aparte desde el listado.
 */
@Component({
  selector: 'app-color-form-dialog',
  imports: [ReactiveFormsModule],
  styleUrl: './color-form-dialog.css',
  templateUrl: './color-form-dialog.html',
})
export class ColorFormDialog {
  /** Color a editar, o null cuando el diálogo se usa para crear. */
  readonly color = input<Color | null>(null);

  readonly guardado = output<Color>();
  readonly cerrado = output<void>();

  private readonly coloresService = inject(ColoresService);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly guardando = signal(false);
  readonly mensajeError = signal<string | null>(null);

  readonly form = new FormGroup({
    nombre: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(60)],
    }),
  });

  ngOnInit(): void {
    const color = this.color();
    if (color !== null) {
      this.form.controls.nombre.setValue(color.nombre);
    }
  }

  esCreacion(): boolean {
    return this.color() === null;
  }

  mensajeCampo(control: AbstractControl | null): string | null {
    if (control === null || control.untouched || !control.errors) {
      return null;
    }
    const errores = control.errors;
    if (errores['required']) {
      return 'Este campo es obligatorio.';
    }
    if (errores['maxlength']) {
      return `Debe tener como máximo ${errores['maxlength'].requiredLength} caracteres.`;
    }
    return null;
  }

  cancelar(): void {
    if (this.guardando()) {
      return;
    }
    this.cerrado.emit();
  }

  onSubmit(): void {
    if (this.guardando()) {
      return;
    }
    this.mensajeError.set(null);

    const controlNombre = this.form.controls.nombre;
    if (controlNombre.invalid) {
      controlNombre.markAsTouched();
      this.mensajeError.set('Revisa el nombre del color.');
      return;
    }

    const colorActual = this.color();
    const nombre = controlNombre.value.trim();

    this.guardando.set(true);

    let peticion;
    if (colorActual === null) {
      const payload: ColorCreatePayload = { nombre };
      peticion = this.coloresService.crearColor(payload);
    } else {
      if (nombre === colorActual.nombre) {
        this.guardando.set(false);
        this.mensajeError.set('No se detectaron cambios para guardar.');
        return;
      }
      const payload: ColorUpdatePayload = { nombre };
      peticion = this.coloresService.actualizarColor(colorActual.id, payload);
    }

    peticion.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (color) => {
        this.guardando.set(false);
        this.guardado.emit(color);
      },
      error: (error: unknown) => {
        this.guardando.set(false);
        this.manejarError(error);
      },
    });
  }

  private manejarError(error: unknown): void {
    const traducido = traducirErrorCatalogo(error);
    if (traducido.sesionExpirada) {
      this.authService.cerrarSesion();
      void this.router.navigateByUrl('/auth/personal/login');
      return;
    }
    this.mensajeError.set(traducido.mensaje);
  }
}
