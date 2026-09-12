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
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { Router } from '@angular/router';

import { AuthService } from '../../../../autenticacion-seguridad/auth/services/auth.service';
import {
  Temporada,
  TemporadaCreatePayload,
  TemporadaUpdatePayload,
} from '../../models/temporada.model';
import { TemporadasService } from '../../services/temporadas.service';
import { traducirErrorTemporadasColecciones } from '../../utils/temporadas-colecciones-error.util';

/**
 * Valida que `fecha_inicio <= fecha_fin`.
 *
 * Las fechas se manejan como cadenas ISO (YYYY-MM-DD), por lo que la
 * comparación lexicográfica equivale a la comparación cronológica.
 */
function rangoFechasValido(group: AbstractControl): ValidationErrors | null {
  const inicio = group.get('fechaInicio')?.value as string | null;
  const fin = group.get('fechaFin')?.value as string | null;
  if (!inicio || !fin) {
    return null;
  }
  return inicio <= fin ? null : { rangoInvalido: true };
}

/**
 * Diálogo para crear o editar una temporada (CU08).
 *
 * - Crear: POST /temporadas.
 * - Editar: PATCH /temporadas/{id} con los campos modificados.
 *
 * Valida en cliente nombre obligatorio y `fecha_inicio <= fecha_fin`. El
 * backend valida además nombre único (409) y rango de fechas (400).
 */
@Component({
  selector: 'app-temporada-form-dialog',
  imports: [ReactiveFormsModule],
  styleUrl: './temporada-form-dialog.css',
  templateUrl: './temporada-form-dialog.html',
})
export class TemporadaFormDialog {
  /** Temporada a editar, o null cuando el diálogo se usa para crear. */
  readonly temporada = input<Temporada | null>(null);

  readonly guardado = output<Temporada>();
  readonly cerrado = output<void>();

  private readonly temporadasService = inject(TemporadasService);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly guardando = signal(false);
  readonly mensajeError = signal<string | null>(null);

  readonly form = new FormGroup(
    {
      nombre: new FormControl('', {
        nonNullable: true,
        validators: [Validators.required, Validators.maxLength(100)],
      }),
      fechaInicio: new FormControl('', {
        nonNullable: true,
        validators: [Validators.required],
      }),
      fechaFin: new FormControl('', {
        nonNullable: true,
        validators: [Validators.required],
      }),
    },
    { validators: rangoFechasValido },
  );

  ngOnInit(): void {
    const temporada = this.temporada();
    if (temporada !== null) {
      this.form.setValue(
        {
          nombre: temporada.nombre,
          fechaInicio: temporada.fecha_inicio,
          fechaFin: temporada.fecha_fin,
        },
        { emitEvent: false },
      );
    }
  }

  esCreacion(): boolean {
    return this.temporada() === null;
  }

  /** Mensaje de error del rango de fechas (validación cruzada). */
  errorRango(): string | null {
    if (this.form.errors?.['rangoInvalido'] && this.form.touched) {
      return 'La fecha de inicio no puede ser posterior a la fecha de fin.';
    }
    return null;
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

    const controls = this.form.controls;
    if (controls.nombre.invalid || controls.fechaInicio.invalid || controls.fechaFin.invalid) {
      this.form.markAllAsTouched();
      this.mensajeError.set('Revisa los campos del formulario.');
      return;
    }
    if (this.form.errors?.['rangoInvalido']) {
      this.form.markAllAsTouched();
      this.mensajeError.set(
        'La fecha de inicio no puede ser posterior a la fecha de fin.',
      );
      return;
    }

    const temporadaActual = this.temporada();
    const nombre = controls.nombre.value.trim();
    const fechaInicio = controls.fechaInicio.value;
    const fechaFin = controls.fechaFin.value;

    this.guardando.set(true);

    let peticion;
    if (temporadaActual === null) {
      const payload: TemporadaCreatePayload = {
        nombre,
        fecha_inicio: fechaInicio,
        fecha_fin: fechaFin,
      };
      peticion = this.temporadasService.crearTemporada(payload);
    } else {
      const payload: TemporadaUpdatePayload = {};
      if (nombre !== temporadaActual.nombre) {
        payload.nombre = nombre;
      }
      if (fechaInicio !== temporadaActual.fecha_inicio) {
        payload.fecha_inicio = fechaInicio;
      }
      if (fechaFin !== temporadaActual.fecha_fin) {
        payload.fecha_fin = fechaFin;
      }
      if (Object.keys(payload).length === 0) {
        this.guardando.set(false);
        this.mensajeError.set('No se detectaron cambios para guardar.');
        return;
      }
      peticion = this.temporadasService.actualizarTemporada(
        temporadaActual.id,
        payload,
      );
    }

    peticion.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (temporada) => {
        this.guardando.set(false);
        this.guardado.emit(temporada);
      },
      error: (error: unknown) => {
        this.guardando.set(false);
        this.manejarError(error);
      },
    });
  }

  private manejarError(error: unknown): void {
    const traducido = traducirErrorTemporadasColecciones(error);
    if (traducido.sesionExpirada) {
      this.authService.cerrarSesion();
      void this.router.navigateByUrl('/auth/personal/login');
      return;
    }
    this.mensajeError.set(traducido.mensaje);
  }
}
