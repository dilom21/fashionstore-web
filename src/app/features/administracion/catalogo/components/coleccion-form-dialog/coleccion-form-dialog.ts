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
  Coleccion,
  ColeccionCreatePayload,
  ColeccionUpdatePayload,
} from '../../models/coleccion.model';
import { Temporada } from '../../models/temporada.model';
import { ColeccionesService } from '../../services/colecciones.service';
import { traducirErrorTemporadasColecciones } from '../../utils/temporadas-colecciones-error.util';

/**
 * Diálogo para crear o editar una colección (CU08).
 *
 * - Crear: POST /colecciones (la temporada debe existir y estar activa).
 * - Editar: PATCH /colecciones/{id} con los campos modificados; mover a otra
 *   temporada solo se permite hacia una temporada activa.
 *
 * Solo se ofrecen temporadas activas. En edición, si la temporada actual quedó
 * inactiva, se conserva como opción de contexto para no forzar un movimiento.
 */
@Component({
  selector: 'app-coleccion-form-dialog',
  imports: [ReactiveFormsModule],
  styleUrl: './coleccion-form-dialog.css',
  templateUrl: './coleccion-form-dialog.html',
})
export class ColeccionFormDialog {
  /** Colección a editar, o null cuando el diálogo se usa para crear. */
  readonly coleccion = input<Coleccion | null>(null);
  /** Temporadas disponibles (se filtran las activas en el selector). */
  readonly temporadas = input<Temporada[]>([]);

  readonly guardado = output<Coleccion>();
  readonly cerrado = output<void>();

  private readonly coleccionesService = inject(ColeccionesService);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly guardando = signal(false);
  readonly mensajeError = signal<string | null>(null);

  readonly form = new FormGroup({
    temporadaId: new FormControl<number | null>(null, [Validators.required]),
    nombre: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(150)],
    }),
    descripcion: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(255)],
    }),
  });

  ngOnInit(): void {
    const coleccion = this.coleccion();
    if (coleccion !== null) {
      this.form.setValue(
        {
          temporadaId: coleccion.temporada_id,
          nombre: coleccion.nombre,
          descripcion: coleccion.descripcion ?? '',
        },
        { emitEvent: false },
      );
    }
  }

  esCreacion(): boolean {
    return this.coleccion() === null;
  }

  /**
   * Opciones del selector de temporada: solo activas. En edición, si la
   * temporada actual ya no está activa se conserva como opción de contexto.
   */
  opcionesTemporadas(): Temporada[] {
    const activas = this.temporadas().filter((temporada) => temporada.estado);
    const coleccion = this.coleccion();
    if (coleccion === null) {
      return activas;
    }
    if (activas.some((temporada) => temporada.id === coleccion.temporada_id)) {
      return activas;
    }
    const actual = this.temporadas().find(
      (temporada) => temporada.id === coleccion.temporada_id,
    );
    if (actual === undefined) {
      return activas;
    }
    return [...activas, actual];
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

  errorTemporada(): string | null {
    const control = this.form.controls.temporadaId;
    if (control.untouched || control.value !== null) {
      return null;
    }
    return 'Selecciona una temporada activa.';
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
    const temporadaId = controls.temporadaId.value;

    if (
      controls.nombre.invalid ||
      controls.descripcion.invalid ||
      temporadaId === null ||
      temporadaId === undefined
    ) {
      this.form.markAllAsTouched();
      this.mensajeError.set('Revisa los campos del formulario.');
      return;
    }

    const coleccionActual = this.coleccion();
    const nombre = controls.nombre.value.trim();
    const descripcion = this.normalizarDescripcion(controls.descripcion.value);

    this.guardando.set(true);

    let peticion;
    if (coleccionActual === null) {
      const payload: ColeccionCreatePayload = {
        temporada_id: temporadaId,
        nombre,
        descripcion,
      };
      peticion = this.coleccionesService.crearColeccion(payload);
    } else {
      const payload: ColeccionUpdatePayload = {};
      if (temporadaId !== coleccionActual.temporada_id) {
        payload.temporada_id = temporadaId;
      }
      if (nombre !== coleccionActual.nombre) {
        payload.nombre = nombre;
      }
      if (descripcion !== coleccionActual.descripcion) {
        payload.descripcion = descripcion;
      }
      if (Object.keys(payload).length === 0) {
        this.guardando.set(false);
        this.mensajeError.set('No se detectaron cambios para guardar.');
        return;
      }
      peticion = this.coleccionesService.actualizarColeccion(
        coleccionActual.id,
        payload,
      );
    }

    peticion.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (coleccion) => {
        this.guardando.set(false);
        this.guardado.emit(coleccion);
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
    const traducido = traducirErrorTemporadasColecciones(error);
    if (traducido.sesionExpirada) {
      this.authService.cerrarSesion();
      void this.router.navigateByUrl('/auth/personal/login');
      return;
    }
    this.mensajeError.set(traducido.mensaje);
  }
}
