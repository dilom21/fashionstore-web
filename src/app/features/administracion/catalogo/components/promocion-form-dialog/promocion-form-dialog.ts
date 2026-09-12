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
  Promocion,
  PromocionCreatePayload,
  PromocionUpdatePayload,
  TipoDescuento,
} from '../../models/promocion.model';
import { PromocionesService } from '../../services/promociones.service';
import { traducirErrorPromociones } from '../../utils/promociones-error.util';
import { datetimeLocalAIso, isoADatetimeLocal } from '../../utils/promociones.util';

/**
 * Valida que `fecha_inicio <= fecha_fin`.
 *
 * Los valores del formulario son cadenas de `datetime-local`; `new Date(...)`
 * las interpreta como hora local y compara el instante correctamente.
 */
function rangoFechasValido(group: AbstractControl): ValidationErrors | null {
  const inicio = group.get('fechaInicio')?.value as string | null;
  const fin = group.get('fechaFin')?.value as string | null;
  if (!inicio || !fin) {
    return null;
  }
  const inicioMs = new Date(inicio).getTime();
  const finMs = new Date(fin).getTime();
  if (Number.isNaN(inicioMs) || Number.isNaN(finMs)) {
    return null;
  }
  return inicioMs <= finMs ? null : { rangoInvalido: true };
}

/**
 * Valida `valor_descuento > 0` y, para PORCENTAJE, `<= 100`.
 *
 * No se reemplaza la validación del backend: es una comprobación temprana para
 * evitar viajes innecesarios.
 */
function valorDescuentoValido(group: AbstractControl): ValidationErrors | null {
  const tipo = group.get('tipoDescuento')?.value as TipoDescuento | null;
  const crudo = group.get('valorDescuento')?.value;
  if (crudo === null || crudo === undefined || crudo === '') {
    return null;
  }
  const valor = Number(crudo);
  if (!Number.isFinite(valor) || valor <= 0) {
    return { valorNoPositivo: true };
  }
  if (tipo === 'PORCENTAJE' && valor > 100) {
    return { porcentajeExcedido: true };
  }
  return null;
}

/**
 * Diálogo para crear o editar una promoción (CU10).
 *
 * - Crear: POST /promociones.
 * - Editar: PATCH /promociones/{id} con los campos modificados.
 *
 * Las fechas se capturan con `datetime-local` y se envían al backend en ISO
 * 8601 (UTC), porque el backend usa TIMESTAMPTZ.
 */
@Component({
  selector: 'app-promocion-form-dialog',
  imports: [ReactiveFormsModule],
  styleUrl: './promocion-form-dialog.css',
  templateUrl: './promocion-form-dialog.html',
})
export class PromocionFormDialog {
  /** Promoción a editar, o null cuando el diálogo se usa para crear. */
  readonly promocion = input<Promocion | null>(null);

  readonly guardado = output<Promocion>();
  readonly cerrado = output<void>();

  private readonly promocionesService = inject(PromocionesService);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly guardando = signal(false);
  readonly mensajeError = signal<string | null>(null);

  readonly form = new FormGroup(
    {
      nombre: new FormControl('', {
        nonNullable: true,
        validators: [Validators.required, Validators.maxLength(150)],
      }),
      descripcion: new FormControl('', {
        nonNullable: true,
        validators: [Validators.maxLength(255)],
      }),
      tipoDescuento: new FormControl<TipoDescuento>('PORCENTAJE', {
        nonNullable: true,
        validators: [Validators.required],
      }),
      valorDescuento: new FormControl<number | null>(null, {
        validators: [Validators.required],
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
    { validators: [rangoFechasValido, valorDescuentoValido] },
  );

  ngOnInit(): void {
    const promocion = this.promocion();
    if (promocion !== null) {
      this.form.setValue(
        {
          nombre: promocion.nombre,
          descripcion: promocion.descripcion ?? '',
          tipoDescuento: promocion.tipo_descuento,
          valorDescuento: Number(promocion.valor_descuento),
          fechaInicio: isoADatetimeLocal(promocion.fecha_inicio),
          fechaFin: isoADatetimeLocal(promocion.fecha_fin),
        },
        { emitEvent: false },
      );
    }
  }

  esCreacion(): boolean {
    return this.promocion() === null;
  }

  esPorcentaje(): boolean {
    return this.form.controls.tipoDescuento.value === 'PORCENTAJE';
  }

  /** Mensaje del rango de fechas (validación cruzada). */
  errorRango(): string | null {
    if (this.form.errors?.['rangoInvalido'] && this.form.touched) {
      return 'La fecha de inicio no puede ser posterior a la fecha de fin.';
    }
    return null;
  }

  /** Mensaje del valor del descuento (validación cruzada). */
  errorValor(): string | null {
    if (!this.form.touched || !this.form.errors) {
      return null;
    }
    if (this.form.errors['valorNoPositivo']) {
      return 'El valor del descuento debe ser mayor que 0.';
    }
    if (this.form.errors['porcentajeExcedido']) {
      return 'El porcentaje no puede superar 100.';
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
    const valorCrudo = controls.valorDescuento.value;
    if (
      controls.nombre.invalid ||
      controls.tipoDescuento.invalid ||
      controls.valorDescuento.invalid ||
      controls.fechaInicio.invalid ||
      controls.fechaFin.invalid ||
      valorCrudo === null
    ) {
      this.form.markAllAsTouched();
      this.mensajeError.set('Revisa los campos del formulario.');
      return;
    }

    const erroresForm = this.form.errors;
    if (
      erroresForm?.['rangoInvalido'] ||
      erroresForm?.['valorNoPositivo'] ||
      erroresForm?.['porcentajeExcedido']
    ) {
      this.form.markAllAsTouched();
      this.mensajeError.set('Revisa los datos ingresados.');
      return;
    }

    const promocionActual = this.promocion();
    const nombre = controls.nombre.value.trim();
    const descripcion = this.normalizarDescripcion(controls.descripcion.value);
    const tipoDescuento = controls.tipoDescuento.value;
    const valorDescuento = Number(valorCrudo);
    const fechaInicio = controls.fechaInicio.value;
    const fechaFin = controls.fechaFin.value;

    this.guardando.set(true);

    let peticion;
    if (promocionActual === null) {
      const payload: PromocionCreatePayload = {
        nombre,
        descripcion,
        tipo_descuento: tipoDescuento,
        valor_descuento: valorDescuento,
        fecha_inicio: datetimeLocalAIso(fechaInicio),
        fecha_fin: datetimeLocalAIso(fechaFin),
      };
      peticion = this.promocionesService.crearPromocion(payload);
    } else {
      const payload: PromocionUpdatePayload = {};
      if (nombre !== promocionActual.nombre) {
        payload.nombre = nombre;
      }
      if (descripcion !== promocionActual.descripcion) {
        payload.descripcion = descripcion;
      }
      if (tipoDescuento !== promocionActual.tipo_descuento) {
        payload.tipo_descuento = tipoDescuento;
      }
      if (Number(promocionActual.valor_descuento) !== valorDescuento) {
        payload.valor_descuento = valorDescuento;
      }
      if (isoADatetimeLocal(promocionActual.fecha_inicio) !== fechaInicio) {
        payload.fecha_inicio = datetimeLocalAIso(fechaInicio);
      }
      if (isoADatetimeLocal(promocionActual.fecha_fin) !== fechaFin) {
        payload.fecha_fin = datetimeLocalAIso(fechaFin);
      }
      if (Object.keys(payload).length === 0) {
        this.guardando.set(false);
        this.mensajeError.set('No se detectaron cambios para guardar.');
        return;
      }
      peticion = this.promocionesService.actualizarPromocion(
        promocionActual.id,
        payload,
      );
    }

    peticion.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (promocion) => {
        this.guardando.set(false);
        this.guardado.emit(promocion);
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
    const traducido = traducirErrorPromociones(error);
    if (traducido.sesionExpirada) {
      this.authService.cerrarSesion();
      void this.router.navigateByUrl('/auth/personal/login');
      return;
    }
    this.mensajeError.set(traducido.mensaje);
  }
}
