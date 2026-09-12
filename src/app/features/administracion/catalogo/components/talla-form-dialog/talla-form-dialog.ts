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
  Talla,
  TallaCreatePayload,
  TallaUpdatePayload,
} from '../../models/talla.model';
import { TallasService } from '../../services/tallas.service';
import { traducirErrorCatalogo } from '../../utils/http-error.util';

/**
 * Diálogo para crear o editar una talla (CU07).
 *
 * - Crear: POST /tallas.
 * - Editar: PATCH /tallas/{id} solo si el nombre cambió.
 *
 * El backend responde 409 si el nombre ya existe. No incluye estado: la
 * habilitación/deshabilitación es una acción aparte desde el listado.
 */
@Component({
  selector: 'app-talla-form-dialog',
  imports: [ReactiveFormsModule],
  styleUrl: './talla-form-dialog.css',
  templateUrl: './talla-form-dialog.html',
})
export class TallaFormDialog {
  /** Talla a editar, o null cuando el diálogo se usa para crear. */
  readonly talla = input<Talla | null>(null);

  readonly guardado = output<Talla>();
  readonly cerrado = output<void>();

  private readonly tallasService = inject(TallasService);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly guardando = signal(false);
  readonly mensajeError = signal<string | null>(null);

  readonly form = new FormGroup({
    nombre: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(30)],
    }),
  });

  ngOnInit(): void {
    const talla = this.talla();
    if (talla !== null) {
      this.form.controls.nombre.setValue(talla.nombre);
    }
  }

  esCreacion(): boolean {
    return this.talla() === null;
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
      this.mensajeError.set('Revisa el nombre de la talla.');
      return;
    }

    const tallaActual = this.talla();
    const nombre = controlNombre.value.trim();

    this.guardando.set(true);

    let peticion;
    if (tallaActual === null) {
      const payload: TallaCreatePayload = { nombre };
      peticion = this.tallasService.crearTalla(payload);
    } else {
      if (nombre === tallaActual.nombre) {
        this.guardando.set(false);
        this.mensajeError.set('No se detectaron cambios para guardar.');
        return;
      }
      const payload: TallaUpdatePayload = { nombre };
      peticion = this.tallasService.actualizarTalla(tallaActual.id, payload);
    }

    peticion.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (talla) => {
        this.guardando.set(false);
        this.guardado.emit(talla);
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
