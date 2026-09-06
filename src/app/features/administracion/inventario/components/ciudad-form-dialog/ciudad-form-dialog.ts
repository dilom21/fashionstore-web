import { Component, DestroyRef, inject, input, output, signal } from '@angular/core';
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
import { Ciudad, CiudadCreatePayload, CiudadUpdatePayload } from '../../models/ciudad.model';
import { CiudadesService } from '../../services/ciudades.service';
import { traducirErrorInventario } from '../../utils/http-error.util';

/**
 * Diálogo para crear o editar una ciudad (CU06).
 *
 * - Crear: POST /ciudades.
 * - Editar: PATCH /ciudades/{id} enviando únicamente el nombre si cambió.
 *
 * No incluye selector de estado: habilitar/deshabilitar es una acción aparte
 * (PATCH /ciudades/{id}/estado) desde el listado.
 */
@Component({
  selector: 'app-ciudad-form-dialog',
  imports: [ReactiveFormsModule],
  styleUrl: './ciudad-form-dialog.css',
  templateUrl: './ciudad-form-dialog.html',
})
export class CiudadFormDialog {
  /** Ciudad a editar, o null cuando el diálogo se usa para crear. */
  readonly ciudad = input<Ciudad | null>(null);

  /** Emite la ciudad creada/actualizada por el backend al confirmar. */
  readonly guardado = output<Ciudad>();
  readonly cerrado = output<void>();

  private readonly ciudadesService = inject(CiudadesService);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly guardando = signal(false);
  readonly mensajeError = signal<string | null>(null);

  readonly form = new FormGroup({
    nombre: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(2), Validators.maxLength(80)],
    }),
  });

  ngOnInit(): void {
    const ciudad = this.ciudad();
    if (ciudad !== null) {
      this.form.controls.nombre.setValue(ciudad.nombre);
    }
  }

  esCreacion(): boolean {
    return this.ciudad() === null;
  }

  mensajeCampo(control: AbstractControl | null): string | null {
    if (control === null || control.untouched || !control.errors) {
      return null;
    }
    const errores = control.errors;
    if (errores['required']) {
      return 'Este campo es obligatorio.';
    }
    if (errores['minlength']) {
      return `Debe tener al menos ${errores['minlength'].requiredLength} caracteres.`;
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
      this.mensajeError.set('Revisa el nombre de la ciudad.');
      return;
    }

    const ciudadActual = this.ciudad();
    const nombre = controlNombre.value.trim();

    this.guardando.set(true);

    let peticion;
    if (ciudadActual === null) {
      const payload: CiudadCreatePayload = { nombre };
      peticion = this.ciudadesService.crearCiudad(payload);
    } else {
      if (nombre === ciudadActual.nombre) {
        this.guardando.set(false);
        this.mensajeError.set('No se detectaron cambios para guardar.');
        return;
      }
      const payload: CiudadUpdatePayload = { nombre };
      peticion = this.ciudadesService.actualizarCiudad(ciudadActual.id, payload);
    }

    peticion.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (ciudad) => {
        this.guardando.set(false);
        this.guardado.emit(ciudad);
      },
      error: (error: unknown) => {
        this.guardando.set(false);
        this.manejarError(error);
      },
    });
  }

  private manejarError(error: unknown): void {
    const traducido = traducirErrorInventario(error);
    if (traducido.sesionExpirada) {
      this.authService.cerrarSesion();
      void this.router.navigateByUrl('/auth/personal/login');
      return;
    }
    this.mensajeError.set(traducido.mensaje);
  }
}
