import {
  Component,
  DestroyRef,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { Router } from '@angular/router';
import { catchError, forkJoin, of } from 'rxjs';

import { AuthService } from '../../../../autenticacion-seguridad/auth/services/auth.service';
import { Sucursal } from '../../../inventario/models/sucursal.model';
import { SucursalesService } from '../../../inventario/services/sucursales.service';
import { Proveedor } from '../../models/proveedor.model';
import { ProveedoresService } from '../../services/proveedores.service';
import {
  OrdenCompra,
  OrdenCompraCreatePayload,
  OrdenCompraUpdatePayload,
} from '../../models/orden-compra.model';
import { OrdenesCompraService } from '../../services/ordenes-compra.service';
import { traducirErrorOrdenesCompra } from '../../utils/ordenes-compra-error.util';
import { hoyIso } from '../../utils/ordenes-compra.util';

/**
 * Diálogo para crear o editar la cabecera de una orden de compra (CU12).
 *
 * - Crear: POST /ordenes-compra. Solo ofrece proveedores y sucursales ACTIVAS.
 *   No se envía `empleado_id`: el backend lo deriva del usuario autenticado.
 * - Editar: PATCH /ordenes-compra/{id} enviando solo `fecha_estimada` y
 *   `observacion` modificadas. `proveedor_id` y `sucursal_id` no son editables.
 *
 * `fecha_estimada` es opcional; si se informa debe ser igual o posterior a la
 * fecha de la orden (o a hoy al crear). El backend sigue siendo la autoridad.
 */
@Component({
  selector: 'app-orden-compra-form-dialog',
  imports: [ReactiveFormsModule],
  styleUrl: './orden-compra-form-dialog.css',
  templateUrl: './orden-compra-form-dialog.html',
})
export class OrdenCompraFormDialog {
  /** Orden a editar, o null cuando el diálogo se usa para crear. */
  readonly orden = input<OrdenCompra | null>(null);

  readonly guardado = output<OrdenCompra>();
  readonly cerrado = output<void>();

  private readonly ordenesService = inject(OrdenesCompraService);
  private readonly proveedoresService = inject(ProveedoresService);
  private readonly sucursalesService = inject(SucursalesService);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly guardando = signal(false);
  readonly cargandoCatalogos = signal(false);
  readonly mensajeError = signal<string | null>(null);
  readonly proveedores = signal<Proveedor[]>([]);
  readonly sucursales = signal<Sucursal[]>([]);

  /** Controles exclusivos de creación (en edición no se usan). */
  readonly proveedorCtrl = new FormControl<number | null>(null, {
    validators: [Validators.required],
  });
  readonly sucursalCtrl = new FormControl<number | null>(null, {
    validators: [Validators.required],
  });

  readonly form = new FormGroup({
    fechaEstimada: new FormControl('', { nonNullable: true }),
    observacion: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(500)],
    }),
  });

  readonly fechaMinima = computed(() => {
    const actual = this.orden();
    if (actual !== null && actual.fecha_orden) {
      return actual.fecha_orden.slice(0, 10);
    }
    return hoyIso();
  });

  ngOnInit(): void {
    const actual = this.orden();
    if (actual !== null) {
      this.form.setValue(
        {
          fechaEstimada: actual.fecha_estimada ? actual.fecha_estimada.slice(0, 10) : '',
          observacion: actual.observacion ?? '',
        },
        { emitEvent: false },
      );
      return;
    }
    this.cargarCatalogos();
  }

  esCreacion(): boolean {
    return this.orden() === null;
  }

  private cargarCatalogos(): void {
    this.cargandoCatalogos.set(true);
    forkJoin({
      proveedores: this.proveedoresService
        .listarProveedores({ estado: true })
        .pipe(catchError(() => of([]))),
      sucursales: this.sucursalesService
        .listarSucursales({ estado: true })
        .pipe(catchError(() => of([]))),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(({ proveedores, sucursales }) => {
        this.cargandoCatalogos.set(false);
        this.proveedores.set(proveedores);
        this.sucursales.set(sucursales);
      });
  }

  fechaEstimadaInvalida(): boolean {
    const valor = this.form.controls.fechaEstimada.value;
    if (!valor) {
      return false;
    }
    return valor < this.fechaMinima();
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

    const creacion = this.esCreacion();

    if (creacion && (this.proveedorCtrl.invalid || this.sucursalCtrl.invalid)) {
      this.proveedorCtrl.markAsTouched();
      this.sucursalCtrl.markAsTouched();
      this.mensajeError.set('Selecciona el proveedor y la sucursal.');
      return;
    }

    if (this.form.controls.observacion.invalid) {
      this.form.controls.observacion.markAsTouched();
      this.mensajeError.set('Revisa los campos del formulario.');
      return;
    }

    if (this.fechaEstimadaInvalida()) {
      this.mensajeError.set(
        `La fecha estimada no puede ser anterior a ${this.fechaMinima()}.`,
      );
      return;
    }

    const fecha = this.form.controls.fechaEstimada.value;
    const observacion = this.form.controls.observacion.value.trim();
    this.guardando.set(true);

    if (creacion) {
      const payload: OrdenCompraCreatePayload = {
        proveedor_id: this.proveedorCtrl.value as number,
        sucursal_id: this.sucursalCtrl.value as number,
        fecha_estimada: fecha || null,
        observacion: observacion || null,
      };
      this.ordenesService
        .crearOrden(payload)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (orden) => {
            this.guardando.set(false);
            this.guardado.emit(orden);
          },
          error: (error: unknown) => {
            this.guardando.set(false);
            this.manejarError(error);
          },
        });
      return;
    }

    const actual = this.orden() as OrdenCompra;
    const cambios: OrdenCompraUpdatePayload = {};
    if (fecha !== (actual.fecha_estimada?.slice(0, 10) ?? '')) {
      cambios.fecha_estimada = fecha || null;
    }
    if (observacion !== (actual.observacion ?? '')) {
      cambios.observacion = observacion || null;
    }

    if (Object.keys(cambios).length === 0) {
      this.guardando.set(false);
      this.mensajeError.set('No se detectaron cambios para guardar.');
      return;
    }

    this.ordenesService
      .actualizarOrden(actual.id, cambios)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (orden) => {
          this.guardando.set(false);
          this.guardado.emit(orden);
        },
        error: (error: unknown) => {
          this.guardando.set(false);
          this.manejarError(error);
        },
      });
  }

  private manejarError(error: unknown): void {
    const traducido = traducirErrorOrdenesCompra(error);
    if (traducido.sesionExpirada) {
      this.authService.cerrarSesion();
      void this.router.navigateByUrl('/auth/personal/login');
      return;
    }
    this.mensajeError.set(traducido.mensaje);
  }
}
