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
  Proveedor,
  ProveedorCreatePayload,
  ProveedorUpdatePayload,
} from '../../models/proveedor.model';
import { ProveedoresService } from '../../services/proveedores.service';
import { traducirErrorProveedores } from '../../utils/proveedores-error.util';

/**
 * Diálogo para crear o editar un proveedor (CU11).
 *
 * - Crear: POST /proveedores.
 * - Editar: PATCH /proveedores/{id} enviando únicamente los campos modificados.
 *
 * `razon_social` es obligatoria (no única). `nit`, `correo`, `telefono` y
 * `direccion` son opcionales; los campos vacíos se envían como `null` para que
 * el backend conserve la regla real (p. ej. NIT vacío -> null).
 */
@Component({
  selector: 'app-proveedor-form-dialog',
  imports: [ReactiveFormsModule],
  styleUrl: './proveedor-form-dialog.css',
  templateUrl: './proveedor-form-dialog.html',
})
export class ProveedorFormDialog {
  /** Proveedor a editar, o null cuando el diálogo se usa para crear. */
  readonly proveedor = input<Proveedor | null>(null);

  readonly guardado = output<Proveedor>();
  readonly cerrado = output<void>();

  private readonly proveedoresService = inject(ProveedoresService);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly guardando = signal(false);
  readonly mensajeError = signal<string | null>(null);

  readonly form = new FormGroup({
    razonSocial: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(150)],
    }),
    nit: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(30)],
    }),
    correo: new FormControl('', {
      nonNullable: true,
      validators: [Validators.email, Validators.maxLength(150)],
    }),
    telefono: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(30)],
    }),
    direccion: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(255)],
    }),
  });

  ngOnInit(): void {
    const proveedor = this.proveedor();
    if (proveedor !== null) {
      this.form.setValue(
        {
          razonSocial: proveedor.razon_social,
          nit: proveedor.nit ?? '',
          correo: proveedor.correo ?? '',
          telefono: proveedor.telefono ?? '',
          direccion: proveedor.direccion ?? '',
        },
        { emitEvent: false },
      );
    }
  }

  esCreacion(): boolean {
    return this.proveedor() === null;
  }

  mensajeCampo(control: AbstractControl | null): string | null {
    if (control === null || control.untouched || !control.errors) {
      return null;
    }
    const errores = control.errors;
    if (errores['required']) {
      return 'Este campo es obligatorio.';
    }
    if (errores['email']) {
      return 'Ingresa un correo válido.';
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
    if (
      controls.razonSocial.invalid ||
      controls.nit.invalid ||
      controls.correo.invalid ||
      controls.telefono.invalid ||
      controls.direccion.invalid
    ) {
      this.form.markAllAsTouched();
      this.mensajeError.set('Revisa los campos del formulario.');
      return;
    }

    const razonSocial = controls.razonSocial.value.trim();
    const nit = this.normalizarOpcional(controls.nit.value);
    const correo = this.normalizarOpcional(controls.correo.value);
    const telefono = this.normalizarOpcional(controls.telefono.value);
    const direccion = this.normalizarOpcional(controls.direccion.value);

    const proveedorActual = this.proveedor();
    this.guardando.set(true);

    let peticion;
    if (proveedorActual === null) {
      const payload: ProveedorCreatePayload = {
        razon_social: razonSocial,
        nit,
        correo,
        telefono,
        direccion,
      };
      peticion = this.proveedoresService.crearProveedor(payload);
    } else {
      const cambios = this.construirCambios(proveedorActual, {
        razonSocial,
        nit,
        correo,
        telefono,
        direccion,
      });
      if (cambios === null) {
        this.guardando.set(false);
        this.mensajeError.set('No se detectaron cambios para guardar.');
        return;
      }
      peticion = this.proveedoresService.actualizarProveedor(
        proveedorActual.id,
        cambios,
      );
    }

    peticion.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (proveedor) => {
        this.guardando.set(false);
        this.guardado.emit(proveedor);
      },
      error: (error: unknown) => {
        this.guardando.set(false);
        this.manejarError(error);
      },
    });
  }

  private construirCambios(
    proveedor: Proveedor,
    valores: {
      razonSocial: string;
      nit: string | null;
      correo: string | null;
      telefono: string | null;
      direccion: string | null;
    },
  ): ProveedorUpdatePayload | null {
    const payload: ProveedorUpdatePayload = {};

    if (valores.razonSocial !== proveedor.razon_social) {
      payload.razon_social = valores.razonSocial;
    }
    if (valores.nit !== proveedor.nit) {
      payload.nit = valores.nit;
    }
    if (valores.correo !== proveedor.correo) {
      payload.correo = valores.correo;
    }
    if (valores.telefono !== proveedor.telefono) {
      payload.telefono = valores.telefono;
    }
    if (valores.direccion !== proveedor.direccion) {
      payload.direccion = valores.direccion;
    }

    return Object.keys(payload).length === 0 ? null : payload;
  }

  private normalizarOpcional(valor: string): string | null {
    const limpio = valor.trim();
    return limpio.length > 0 ? limpio : null;
  }

  private manejarError(error: unknown): void {
    const traducido = traducirErrorProveedores(error);
    if (traducido.sesionExpirada) {
      this.authService.cerrarSesion();
      void this.router.navigateByUrl('/auth/personal/login');
      return;
    }
    this.mensajeError.set(traducido.mensaje);
  }
}
