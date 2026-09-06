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
import { Ciudad } from '../../models/ciudad.model';
import {
  Sucursal,
  SucursalCreatePayload,
  SucursalUpdatePayload,
} from '../../models/sucursal.model';
import { SucursalesService } from '../../services/sucursales.service';
import { traducirErrorInventario } from '../../utils/http-error.util';

/**
 * Diálogo para crear o editar una sucursal (CU06).
 *
 * - Crear: POST /sucursales.
 * - Editar: PATCH /sucursales/{id} enviando únicamente los campos modificados.
 *
 * Las ciudades disponibles provienen del backend y se reciben por input
 * (solo activas). Si la ciudad actual de una sucursal quedó inactiva, se
 * conserva como opción de contexto para poder editar la sucursal sin
 * forzar un movimiento, respetando la regla "no se puede mover a una
 * ciudad inactiva".
 */
@Component({
  selector: 'app-sucursal-form-dialog',
  imports: [ReactiveFormsModule],
  styleUrl: './sucursal-form-dialog.css',
  templateUrl: './sucursal-form-dialog.html',
})
export class SucursalFormDialog {
  /** Sucursal a editar, o null cuando el diálogo se usa para crear. */
  readonly sucursal = input<Sucursal | null>(null);
  /** Ciudades activas disponibles (catálogo real del backend). */
  readonly ciudades = input<Ciudad[]>([]);

  /** Emite la sucursal creada/actualizada por el backend al confirmar. */
  readonly guardado = output<Sucursal>();
  readonly cerrado = output<void>();

  private readonly sucursalesService = inject(SucursalesService);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly guardando = signal(false);
  readonly mensajeError = signal<string | null>(null);

  readonly form = new FormGroup({
    nombre: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(2), Validators.maxLength(100)],
    }),
    ciudadId: new FormControl<number | null>(null, [Validators.required]),
    direccion: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(3), Validators.maxLength(255)],
    }),
    telefono: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(30)],
    }),
  });

  ngOnInit(): void {
    const sucursal = this.sucursal();
    if (sucursal !== null) {
      this.form.controls.nombre.setValue(sucursal.nombre);
      this.form.controls.ciudadId.setValue(sucursal.ciudad.id);
      this.form.controls.direccion.setValue(sucursal.direccion);
      this.form.controls.telefono.setValue(sucursal.telefono ?? '');
    }
  }

  esCreacion(): boolean {
    return this.sucursal() === null;
  }

  /**
   * Opciones de ciudad del selector: ciudades activas. En edición, si la
   * ciudad actual de la sucursal ya no está activa se conserva como opción
   * (etiquetada) para no perder el valor actual del registro.
   */
  opcionesCiudades(): Ciudad[] {
    const activas = this.ciudades();
    const sucursal = this.sucursal();
    if (sucursal === null) {
      return activas;
    }
    if (activas.some((ciudad) => ciudad.id === sucursal.ciudad.id)) {
      return activas;
    }
    return [
      ...activas,
      {
        id: sucursal.ciudad.id,
        nombre: `${sucursal.ciudad.nombre} (ciudad inactiva)`,
        estado: false,
      },
    ];
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

  errorCiudad(): string | null {
    const control = this.form.controls.ciudadId;
    if (control.untouched || control.value !== null) {
      return null;
    }
    return control.disabled ? null : 'Selecciona una ciudad activa.';
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
    const ciudadSeleccionada = controls.ciudadId.value;

    if (
      controls.nombre.invalid ||
      controls.direccion.invalid ||
      ciudadSeleccionada === null ||
      ciudadSeleccionada === undefined
    ) {
      this.form.markAllAsTouched();
      this.mensajeError.set('Revisa los campos del formulario.');
      return;
    }

    const sucursalActual = this.sucursal();
    this.guardando.set(true);

    let peticion;
    if (sucursalActual === null) {
      const payload: SucursalCreatePayload = {
        nombre: controls.nombre.value.trim(),
        ciudad_id: ciudadSeleccionada,
        direccion: controls.direccion.value.trim(),
        telefono: this.normalizarTelefono(controls.telefono.value),
      };
      peticion = this.sucursalesService.crearSucursal(payload);
    } else {
      const cambios = this.construirCambios(sucursalActual);
      if (cambios === null) {
        this.guardando.set(false);
        this.mensajeError.set('No se detectaron cambios para guardar.');
        return;
      }
      peticion = this.sucursalesService.actualizarSucursal(sucursalActual.id, cambios);
    }

    peticion.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (sucursal) => {
        this.guardando.set(false);
        this.guardado.emit(sucursal);
      },
      error: (error: unknown) => {
        this.guardando.set(false);
        this.manejarError(error);
      },
    });
  }

  private construirCambios(sucursal: Sucursal): SucursalUpdatePayload | null {
    const controls = this.form.controls;
    const payload: SucursalUpdatePayload = {};

    const nombre = controls.nombre.value.trim();
    if (nombre !== sucursal.nombre) {
      payload.nombre = nombre;
    }

    const ciudadId = controls.ciudadId.value;
    if (ciudadId !== null && ciudadId !== undefined && ciudadId !== sucursal.ciudad.id) {
      payload.ciudad_id = ciudadId;
    }

    const direccion = controls.direccion.value.trim();
    if (direccion !== sucursal.direccion) {
      payload.direccion = direccion;
    }

    const telefono = this.normalizarTelefono(controls.telefono.value);
    if (telefono !== sucursal.telefono) {
      payload.telefono = telefono;
    }

    return Object.keys(payload).length === 0 ? null : payload;
  }

  private normalizarTelefono(valor: string): string | null {
    const telefono = valor.trim();
    return telefono.length > 0 ? telefono : null;
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
