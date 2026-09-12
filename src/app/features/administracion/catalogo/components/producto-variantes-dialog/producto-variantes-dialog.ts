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
import { Color } from '../../models/color.model';
import { Producto } from '../../models/producto.model';
import { Talla } from '../../models/talla.model';
import {
  Variante,
  VarianteCreatePayload,
  VarianteUpdatePayload,
} from '../../models/variante.model';
import { ColoresService } from '../../services/colores.service';
import { TallasService } from '../../services/tallas.service';
import { VariantesService } from '../../services/variantes.service';
import { traducirErrorCatalogo } from '../../utils/http-error.util';

/** Modo del formulario embebido de variantes. */
type ModoFormulario = 'cerrado' | 'crear' | 'editar';

/** Confirmación pendiente de habilitar/deshabilitar una variante. */
interface ConfirmacionVariante {
  variante: Variante;
  habilitar: boolean;
}

/**
 * Diálogo de gestión de variantes de un producto (CU07).
 *
 * Se abre dentro del detalle del producto seleccionado. Permite listar, crear,
 * editar y habilitar/deshabilitar variantes consumiendo:
 * GET/POST /productos/{producto_id}/variantes,
 * PATCH /variantes/{id} y PATCH /variantes/{id}/estado.
 *
 * Solo se ofrecen tallas y colores activos. Los errores 409 del backend
 * (SKU duplicado, combinación producto+talla+color duplicada, referencias
 * inactivas) se muestran con el `detail` real.
 */
@Component({
  selector: 'app-producto-variantes-dialog',
  imports: [ReactiveFormsModule],
  styleUrl: './producto-variantes-dialog.css',
  templateUrl: './producto-variantes-dialog.html',
})
export class ProductoVariantesDialog {
  readonly producto = input.required<Producto>();

  readonly cerrado = output<void>();

  private readonly variantesService = inject(VariantesService);
  private readonly tallasService = inject(TallasService);
  private readonly coloresService = inject(ColoresService);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly variantes = signal<Variante[]>([]);
  readonly cargando = signal(false);
  readonly error = signal<string | null>(null);
  readonly exito = signal<string | null>(null);
  readonly procesandoEstado = signal(false);

  readonly tallasActivas = signal<Talla[]>([]);
  readonly coloresActivos = signal<Color[]>([]);

  readonly modoForm = signal<ModoFormulario>('cerrado');
  readonly varianteEnEdicion = signal<Variante | null>(null);
  readonly guardandoForm = signal(false);
  readonly errorForm = signal<string | null>(null);

  readonly confirmacion = signal<ConfirmacionVariante | null>(null);

  readonly form = new FormGroup({
    sku: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(80)],
    }),
    tallaId: new FormControl<number | null>(null, [Validators.required]),
    colorId: new FormControl<number | null>(null, [Validators.required]),
  });

  ngOnInit(): void {
    this.cargarVariantes();
    this.cargarTallasActivas();
    this.cargarColoresActivos();
  }

  // ===== Carga =====

  private cargarVariantes(): void {
    this.cargando.set(true);
    this.error.set(null);
    this.variantesService
      .listarVariantes(this.producto().id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (variantes) => {
          this.cargando.set(false);
          this.variantes.set(variantes);
        },
        error: (error: unknown) => {
          this.cargando.set(false);
          this.variantes.set([]);
          this.manejarError(error, 'lista');
        },
      });
  }

  private cargarTallasActivas(): void {
    this.tallasService
      .listarTallas({ estado: true })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (tallas) => this.tallasActivas.set(tallas),
        error: (error: unknown) => this.manejarError(error, 'lista'),
      });
  }

  private cargarColoresActivos(): void {
    this.coloresService
      .listarColores({ estado: true })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (colores) => this.coloresActivos.set(colores),
        error: (error: unknown) => this.manejarError(error, 'lista'),
      });
  }

  // ===== Opciones de los selectores =====

  opcionesTallas(): Talla[] {
    const activas = this.tallasActivas();
    const variante = this.varianteEnEdicion();
    if (variante === null) {
      return activas;
    }
    if (activas.some((talla) => talla.id === variante.talla.id)) {
      return activas;
    }
    return [
      ...activas,
      {
        id: variante.talla.id,
        nombre: `${variante.talla.nombre} (inactiva)`,
        estado: false,
      },
    ];
  }

  opcionesColores(): Color[] {
    const activos = this.coloresActivos();
    const variante = this.varianteEnEdicion();
    if (variante === null) {
      return activos;
    }
    if (activos.some((color) => color.id === variante.color.id)) {
      return activos;
    }
    return [
      ...activos,
      {
        id: variante.color.id,
        nombre: `${variante.color.nombre} (inactivo)`,
        estado: false,
      },
    ];
  }

  // ===== Formulario =====

  abrirCrear(): void {
    if (this.guardandoForm()) {
      return;
    }
    this.errorForm.set(null);
    this.varianteEnEdicion.set(null);
    this.form.reset(
      { sku: '', tallaId: null, colorId: null },
      { emitEvent: false },
    );
    this.modoForm.set('crear');
  }

  abrirEditar(variante: Variante): void {
    if (this.guardandoForm()) {
      return;
    }
    this.errorForm.set(null);
    this.varianteEnEdicion.set(variante);
    this.form.reset(
      {
        sku: variante.sku,
        tallaId: variante.talla.id,
        colorId: variante.color.id,
      },
      { emitEvent: false },
    );
    this.modoForm.set('editar');
  }

  cerrarForm(): void {
    if (this.guardandoForm()) {
      return;
    }
    this.modoForm.set('cerrado');
    this.varianteEnEdicion.set(null);
    this.errorForm.set(null);
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

  guardar(): void {
    if (this.guardandoForm()) {
      return;
    }
    this.errorForm.set(null);

    const controls = this.form.controls;
    const tallaId = controls.tallaId.value;
    const colorId = controls.colorId.value;
    const sku = controls.sku.value.trim();

    if (
      controls.sku.invalid ||
      tallaId === null ||
      tallaId === undefined ||
      colorId === null ||
      colorId === undefined
    ) {
      this.form.markAllAsTouched();
      this.errorForm.set('Revisa los campos de la variante.');
      return;
    }

    const varianteActual = this.varianteEnEdicion();
    this.guardandoForm.set(true);

    let peticion;
    if (varianteActual === null) {
      const payload: VarianteCreatePayload = {
        talla_id: tallaId,
        color_id: colorId,
        sku,
      };
      peticion = this.variantesService.crearVariante(
        this.producto().id,
        payload,
      );
    } else {
      const payload: VarianteUpdatePayload = {};
      if (tallaId !== varianteActual.talla.id) {
        payload.talla_id = tallaId;
      }
      if (colorId !== varianteActual.color.id) {
        payload.color_id = colorId;
      }
      if (sku !== varianteActual.sku) {
        payload.sku = sku;
      }
      if (Object.keys(payload).length === 0) {
        this.guardandoForm.set(false);
        this.errorForm.set('No se detectaron cambios para guardar.');
        return;
      }
      peticion = this.variantesService.actualizarVariante(
        varianteActual.id,
        payload,
      );
    }

    peticion.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (variante) => {
        this.guardandoForm.set(false);
        this.modoForm.set('cerrado');
        this.varianteEnEdicion.set(null);
        this.exito.set(
          varianteActual === null
            ? `Variante ${variante.sku} creada correctamente.`
            : `Variante ${variante.sku} actualizada correctamente.`,
        );
        this.cargarVariantes();
      },
      error: (error: unknown) => {
        this.guardandoForm.set(false);
        this.manejarError(error, 'form');
      },
    });
  }

  // ===== Estado =====

  solicitarCambioEstado(variante: Variante): void {
    if (this.procesandoEstado()) {
      return;
    }
    this.confirmacion.set({ variante, habilitar: !variante.estado });
  }

  cancelarCambioEstado(): void {
    this.confirmacion.set(null);
  }

  confirmarCambioEstado(): void {
    const pendiente = this.confirmacion();
    this.confirmacion.set(null);
    if (pendiente === null) {
      return;
    }

    const { variante, habilitar } = pendiente;
    this.procesandoEstado.set(true);
    this.error.set(null);
    this.exito.set(null);

    this.variantesService
      .cambiarEstadoVariante(variante.id, habilitar)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (actualizada) => {
          this.procesandoEstado.set(false);
          this.exito.set(
            `Se ${habilitar ? 'habilitó' : 'deshabilitó'} la variante ${actualizada.sku}.`,
          );
          this.cargarVariantes();
        },
        error: (error: unknown) => {
          this.procesandoEstado.set(false);
          this.manejarError(error, 'lista');
        },
      });
  }

  cerrar(): void {
    this.cerrado.emit();
  }

  // ===== Errores =====

  private manejarError(error: unknown, destino: 'lista' | 'form'): void {
    const traducido = traducirErrorCatalogo(error);
    if (traducido.sesionExpirada) {
      this.authService.cerrarSesion();
      void this.router.navigateByUrl('/auth/personal/login');
      return;
    }
    if (destino === 'form') {
      this.errorForm.set(traducido.mensaje);
      return;
    }
    this.error.set(traducido.mensaje);
  }
}
