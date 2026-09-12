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
  Categoria,
  CategoriaCreatePayload,
  CategoriaUpdatePayload,
} from '../../models/categoria.model';
import { CategoriasService } from '../../services/categorias.service';
import { traducirErrorCatalogo } from '../../utils/http-error.util';

/**
 * Diálogo para crear o editar una categoría (CU07).
 *
 * - Crear: POST /categorias.
 * - Editar: PATCH /categorias/{id} con los campos modificados.
 *
 * No incluye selector de estado: habilitar/deshabilitar es una acción aparte
 * (PATCH /categorias/{id}/estado) desde el listado. El backend responde 409 si
 * el nombre ya existe o si se intenta deshabilitar una categoría con productos
 * activos.
 */
@Component({
  selector: 'app-categoria-form-dialog',
  imports: [ReactiveFormsModule],
  styleUrl: './categoria-form-dialog.css',
  templateUrl: './categoria-form-dialog.html',
})
export class CategoriaFormDialog {
  /** Categoría a editar, o null cuando el diálogo se usa para crear. */
  readonly categoria = input<Categoria | null>(null);

  /** Emite la categoría creada/actualizada por el backend al confirmar. */
  readonly guardado = output<Categoria>();
  readonly cerrado = output<void>();

  private readonly categoriasService = inject(CategoriasService);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly guardando = signal(false);
  readonly mensajeError = signal<string | null>(null);

  readonly form = new FormGroup({
    nombre: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(100)],
    }),
    descripcion: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(255)],
    }),
  });

  ngOnInit(): void {
    const categoria = this.categoria();
    if (categoria !== null) {
      this.form.controls.nombre.setValue(categoria.nombre);
      this.form.controls.descripcion.setValue(categoria.descripcion ?? '');
    }
  }

  esCreacion(): boolean {
    return this.categoria() === null;
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
    if (controlNombre.invalid || this.form.controls.descripcion.invalid) {
      this.form.markAllAsTouched();
      this.mensajeError.set('Revisa los campos del formulario.');
      return;
    }

    const categoriaActual = this.categoria();
    const nombre = controlNombre.value.trim();
    const descripcion = this.normalizarDescripcion(
      this.form.controls.descripcion.value,
    );

    this.guardando.set(true);

    let peticion;
    if (categoriaActual === null) {
      const payload: CategoriaCreatePayload = { nombre, descripcion };
      peticion = this.categoriasService.crearCategoria(payload);
    } else {
      const payload: CategoriaUpdatePayload = {};
      if (nombre !== categoriaActual.nombre) {
        payload.nombre = nombre;
      }
      if (descripcion !== categoriaActual.descripcion) {
        payload.descripcion = descripcion;
      }
      if (Object.keys(payload).length === 0) {
        this.guardando.set(false);
        this.mensajeError.set('No se detectaron cambios para guardar.');
        return;
      }
      peticion = this.categoriasService.actualizarCategoria(
        categoriaActual.id,
        payload,
      );
    }

    peticion.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (categoria) => {
        this.guardando.set(false);
        this.guardado.emit(categoria);
      },
      error: (error: unknown) => {
        this.guardando.set(false);
        this.manejarError(error);
      },
    });
  }

  private normalizarDescripcion(valor: string): string | null {
    const limpio = valor.trim();
    return limpio.length > 0 ? limpio : null;
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
