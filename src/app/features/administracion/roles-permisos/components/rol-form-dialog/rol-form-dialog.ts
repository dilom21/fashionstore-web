import { Component, DestroyRef, inject, input, output, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { Router } from '@angular/router';

import { AuthService } from '../../../../autenticacion-seguridad/auth/services/auth.service';
import { RolesService } from '../../services/roles.service';
import {
  Rol,
  RolCreateRequest,
  RolDetalle,
  RolUpdateRequest,
} from '../../models/rol.model';
import { traducirErrorRoles } from '../../utils/http-error.util';

/**
 * Diálogo para crear o editar un rol (CU04).
 *
 * - Crear: POST /roles con nombre y descripción.
 * - Editar: PATCH /roles/{id}. Si `nombreBloqueado` es true (rol base) el
 *   nombre se muestra como texto y solo se permite cambiar la descripción,
 *   respetando la regla del backend (los roles base no pueden renombrarse).
 */
@Component({
  selector: 'app-rol-form-dialog',
  imports: [ReactiveFormsModule],
  styleUrl: './rol-form-dialog.css',
  templateUrl: './rol-form-dialog.html',
})
export class RolFormDialog {
  /** Rol a editar, o null cuando el diálogo se usa para crear. */
  readonly rol = input<RolDetalle | null>(null);
  /** true cuando el nombre no puede modificarse (rol base). */
  readonly nombreBloqueado = input(false);

  /** Emite el rol creado/actualizado por el backend al confirmar. */
  readonly guardado = output<Rol>();
  readonly cerrado = output<void>();

  private readonly rolesService = inject(RolesService);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly guardando = signal(false);
  readonly mensajeError = signal<string | null>(null);

  readonly form = new FormGroup({
    nombre: new FormControl('', {
      nonNullable: true,
      validators: [
        Validators.required,
        Validators.minLength(2),
        Validators.maxLength(80),
      ],
    }),
    descripcion: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(255)],
    }),
  });

  ngOnInit(): void {
    const rol = this.rol();
    if (rol !== null) {
      this.form.controls.nombre.setValue(rol.nombre);
      this.form.controls.descripcion.setValue(rol.descripcion ?? '');
      if (this.nombreBloqueado()) {
        this.form.controls.nombre.disable();
      }
    }
  }

  esCreacion(): boolean {
    return this.rol() === null;
  }

  mensajeCampoNombre(): string | null {
    const control = this.form.controls.nombre;
    if (control.disabled || control.untouched || !control.errors) {
      return null;
    }
    return control.errors['required']
      ? 'El nombre del rol es obligatorio.'
      : control.errors['minlength']
        ? 'El nombre debe tener al menos 2 caracteres.'
        : control.errors['maxlength']
          ? 'El nombre no puede superar los 80 caracteres.'
          : null;
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
    const controlDescripcion = this.form.controls.descripcion;

    if (controlNombre.enabled && controlNombre.invalid) {
      controlNombre.markAsTouched();
      this.mensajeError.set('Revisa el nombre del rol.');
      return;
    }

    const nombre = controlNombre.value.trim();
    const descripcion = this.normalizarDescripcion(controlDescripcion.value);

    this.guardando.set(true);

    const rolActual = this.rol();
    let peticion;

    if (rolActual === null) {
      const payload: RolCreateRequest = { nombre, descripcion };
      peticion = this.rolesService.crearRol(payload);
    } else {
      const payload = this.construirPayloadEdicion(rolActual, nombre, descripcion);
      if (payload === null) {
        this.guardando.set(false);
        this.mensajeError.set('No se detectaron cambios para guardar.');
        return;
      }
      peticion = this.rolesService.actualizarRol(rolActual.id, payload);
    }

    peticion.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (rol) => {
        this.guardando.set(false);
        this.guardado.emit(rol);
      },
      error: (error: unknown) => {
        this.guardando.set(false);
        this.manejarError(error);
      },
    });
  }

  private construirPayloadEdicion(
    rol: RolDetalle,
    nombre: string,
    descripcion: string | null,
  ): RolUpdateRequest | null {
    const payload: RolUpdateRequest = {};

    if (!this.nombreBloqueado()) {
      const nombreOriginal = rol.nombre.trim().toUpperCase();
      const nombreNuevo = nombre.trim().toUpperCase();
      if (nombreNuevo.length > 0 && nombreNuevo !== nombreOriginal) {
        payload.nombre = nombre.trim();
      }
    }

    if (descripcion !== (rol.descripcion ?? null)) {
      payload.descripcion = descripcion;
    }

    return Object.keys(payload).length === 0 ? null : payload;
  }

  private normalizarDescripcion(valor: string): string | null {
    const descripcion = valor.trim();
    return descripcion.length > 0 ? descripcion : null;
  }

  private manejarError(error: unknown): void {
    const traducido = traducirErrorRoles(error);
    if (traducido.sesionExpirada) {
      this.authService.cerrarSesion();
      void this.router.navigateByUrl('/auth/personal/login');
      return;
    }
    this.mensajeError.set(traducido.mensaje);
  }
}
