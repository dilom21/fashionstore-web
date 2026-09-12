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
import { Categoria } from '../../models/categoria.model';
import {
  Producto,
  ProductoCreatePayload,
  ProductoUpdatePayload,
} from '../../models/producto.model';
import { ProductosService } from '../../services/productos.service';
import { traducirErrorCatalogo } from '../../utils/http-error.util';

/**
 * Diálogo para crear o editar un producto (CU07).
 *
 * - Crear: POST /productos.
 * - Editar: PATCH /productos/{id} con los campos modificados.
 *
 * Las categorías provienen del backend. Solo se ofrecen categorías activas;
 * al editar un producto cuya categoría quedó inactiva, se conserva como opción
 * de contexto para no forzar un movimiento. El backend valida categoría activa,
 * nombre obligatorio y precio > 0.
 */
@Component({
  selector: 'app-producto-form-dialog',
  imports: [ReactiveFormsModule],
  styleUrl: './producto-form-dialog.css',
  templateUrl: './producto-form-dialog.html',
})
export class ProductoFormDialog {
  /** Producto a editar, o null cuando el diálogo se usa para crear. */
  readonly producto = input<Producto | null>(null);
  /** Categorías disponibles (se filtran las activas en el selector). */
  readonly categorias = input<Categoria[]>([]);

  readonly guardado = output<Producto>();
  readonly cerrado = output<void>();

  private readonly productosService = inject(ProductosService);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly guardando = signal(false);
  readonly mensajeError = signal<string | null>(null);

  readonly form = new FormGroup({
    nombre: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(150)],
    }),
    categoriaId: new FormControl<number | null>(null, [Validators.required]),
    descripcion: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(1000)],
    }),
    precio: new FormControl<number | null>(null, [
      Validators.required,
      Validators.min(0.01),
    ]),
  });

  ngOnInit(): void {
    const producto = this.producto();
    if (producto !== null) {
      this.form.controls.nombre.setValue(producto.nombre);
      this.form.controls.categoriaId.setValue(producto.categoria_id);
      this.form.controls.descripcion.setValue(producto.descripcion ?? '');
      this.form.controls.precio.setValue(producto.precio);
    }
  }

  esCreacion(): boolean {
    return this.producto() === null;
  }

  /**
   * Opciones de categoría del selector: solo activas. En edición, si la
   * categoría actual ya no está activa se conserva como opción de contexto.
   */
  opcionesCategorias(): Categoria[] {
    const activas = this.categorias().filter((categoria) => categoria.estado);
    const producto = this.producto();
    if (producto === null) {
      return activas;
    }
    if (activas.some((categoria) => categoria.id === producto.categoria_id)) {
      return activas;
    }
    return [
      ...activas,
      {
        id: producto.categoria_id,
        nombre: `${producto.categoria.nombre} (categoría inactiva)`,
        descripcion: null,
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
    if (errores['maxlength']) {
      return `Debe tener como máximo ${errores['maxlength'].requiredLength} caracteres.`;
    }
    if (errores['min']) {
      return 'El precio debe ser mayor a 0.';
    }
    return null;
  }

  errorCategoria(): string | null {
    const control = this.form.controls.categoriaId;
    if (control.untouched || control.value !== null) {
      return null;
    }
    return 'Selecciona una categoría activa.';
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
    const categoriaSeleccionada = controls.categoriaId.value;
    const precio = controls.precio.value;

    if (
      controls.nombre.invalid ||
      controls.descripcion.invalid ||
      categoriaSeleccionada === null ||
      categoriaSeleccionada === undefined ||
      precio === null ||
      precio === undefined ||
      precio <= 0
    ) {
      this.form.markAllAsTouched();
      this.mensajeError.set('Revisa los campos del formulario.');
      return;
    }

    const productoActual = this.producto();
    const nombre = controls.nombre.value.trim();
    const descripcion = this.normalizarDescripcion(controls.descripcion.value);

    this.guardando.set(true);

    let peticion;
    if (productoActual === null) {
      const payload: ProductoCreatePayload = {
        categoria_id: categoriaSeleccionada,
        nombre,
        descripcion,
        precio,
      };
      peticion = this.productosService.crearProducto(payload);
    } else {
      const payload: ProductoUpdatePayload = {};
      if (categoriaSeleccionada !== productoActual.categoria_id) {
        payload.categoria_id = categoriaSeleccionada;
      }
      if (nombre !== productoActual.nombre) {
        payload.nombre = nombre;
      }
      if (descripcion !== productoActual.descripcion) {
        payload.descripcion = descripcion;
      }
      if (precio !== productoActual.precio) {
        payload.precio = precio;
      }
      if (Object.keys(payload).length === 0) {
        this.guardando.set(false);
        this.mensajeError.set('No se detectaron cambios para guardar.');
        return;
      }
      peticion = this.productosService.actualizarProducto(
        productoActual.id,
        payload,
      );
    }

    peticion.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (producto) => {
        this.guardando.set(false);
        this.guardado.emit(producto);
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
