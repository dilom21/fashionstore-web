import {
  Component,
  DestroyRef,
  computed,
  inject,
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

import { AdminIcon } from '../../../../features/administracion/components/admin-icon/admin-icon';
import {
  TenantErrorNormalizado,
  TenantProducto,
  TenantProveedorCreado,
  TenantProveedorCrear,
} from '../../../models/tenant.models';
import { SaasCatalogoService } from '../../../services/saas-catalogo.service';
import { SaasErrorService } from '../../../services/saas-error.service';
import { SaasProveedoresService } from '../../../services/saas-proveedores.service';

/** Límites del contrato `POST /tenant/proveedores`. */
export const MAX_RAZON_SOCIAL = 150;
export const MAX_NIT = 30;
export const MAX_CORREO = 150;
export const MAX_TELEFONO = 30;
export const MAX_DIRECCION = 255;
export const MAX_PRODUCTOS_PROVEEDOR = 100;

type TipoErrorProveedor =
  | 'permiso'
  | 'deshabilitado'
  | 'conflicto'
  | 'validacion'
  | 'otro';

type CampoProveedor =
  | 'razon_social'
  | 'nit'
  | 'correo'
  | 'telefono'
  | 'direccion';

/**
 * Panel de alta de proveedor dentro de Compras (5C0).
 *
 * Datos que envía: razón social, NIT/correo/teléfono/dirección opcionales y
 * los productos de la EMPRESA a los que se asocia. Nunca envía `empresa_id`
 * ni `usuario_id`. La lista de productos se consulta al catálogo tenant; un
 * 403 solo deshabilita la asociación, no el alta.
 */
@Component({
  selector: 'app-saas-nuevo-proveedor',
  imports: [ReactiveFormsModule, AdminIcon],
  styleUrl: './nuevo-proveedor.css',
  templateUrl: './nuevo-proveedor.html',
})
export class SaasNuevoProveedorPanel {
  private readonly proveedoresService = inject(SaasProveedoresService);
  private readonly catalogoService = inject(SaasCatalogoService);
  private readonly errores = inject(SaasErrorService);
  private readonly destroyRef = inject(DestroyRef);

  /** Emite el proveedor creado para que Compras refresque su selector. */
  readonly creado = output<TenantProveedorCreado>();
  /** Pide cerrar el panel sin crear nada. */
  readonly cancelar = output<void>();

  readonly maxRazonSocial = MAX_RAZON_SOCIAL;
  readonly maxNit = MAX_NIT;
  readonly maxCorreo = MAX_CORREO;
  readonly maxTelefono = MAX_TELEFONO;
  readonly maxDireccion = MAX_DIRECCION;
  readonly maxProductos = MAX_PRODUCTOS_PROVEEDOR;

  readonly guardando = signal(false);
  readonly error = signal<TenantErrorNormalizado | null>(null);
  readonly mensajeExito = signal<string | null>(null);

  readonly productos = signal<TenantProducto[]>([]);
  readonly cargandoProductos = signal(true);
  readonly errorProductos = signal<string | null>(null);
  readonly productosSinPermiso = signal(false);
  readonly seleccionados = signal<ReadonlySet<number>>(new Set<number>());

  readonly form = new FormGroup({
    razon_social: new FormControl('', {
      nonNullable: true,
      validators: [
        Validators.required,
        Validators.maxLength(MAX_RAZON_SOCIAL),
      ],
    }),
    nit: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(MAX_NIT)],
    }),
    correo: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(MAX_CORREO), correoValido],
    }),
    telefono: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(MAX_TELEFONO)],
    }),
    direccion: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(MAX_DIRECCION)],
    }),
  });

  readonly tipoError = computed<TipoErrorProveedor | null>(() => {
    const normalizado = this.error();
    if (normalizado === null) {
      return null;
    }
    if (normalizado.estado === 403) {
      return 'permiso';
    }
    if (normalizado.estado === 503) {
      return 'deshabilitado';
    }
    if (normalizado.estado === 409) {
      return 'conflicto';
    }
    return normalizado.esValidacion ? 'validacion' : 'otro';
  });

  readonly mensajeSeleccion = computed(() => {
    const total = this.seleccionados().size;
    if (total === 0) {
      return 'Sin productos asociados: el proveedor se crea, pero la orden de compra rechazará sus productos hasta asociarlos.';
    }
    return `${total} producto${total === 1 ? '' : 's'} asociado${total === 1 ? '' : 's'}.`;
  });

  constructor() {
    this.cargarProductos();
  }

  /** `true` si hay razón social y no hay un envío en curso. */
  puedeGuardar(): boolean {
    return (
      !this.guardando() &&
      this.form.controls.razon_social.value.trim().length > 0
    );
  }

  /** Mensaje de error visible de un campo (solo si ya fue tocado). */
  mensajeCampo(campo: CampoProveedor): string | null {
    const control = this.form.controls[campo];
    if (control.untouched || !control.invalid) {
      return null;
    }
    if (control.hasError('required')) {
      return 'La razón social es obligatoria.';
    }
    if (control.hasError('maxlength')) {
      return 'El valor supera el máximo permitido.';
    }
    if (control.hasError('correoInvalido')) {
      return 'Indica un correo válido o deja el campo vacío.';
    }
    return 'Revisa este campo.';
  }

  /** `true` si el producto está marcado. */
  estaSeleccionado(productoId: number): boolean {
    return this.seleccionados().has(productoId);
  }

  /** Alterna la asociación de un producto de la empresa. */
  alternarProducto(productoId: number, evento: Event): void {
    const marcado =
      evento.target instanceof HTMLInputElement ? evento.target.checked : false;
    const actual = new Set(this.seleccionados());
    if (marcado) {
      if (actual.size >= MAX_PRODUCTOS_PROVEEDOR) {
        if (evento.target instanceof HTMLInputElement) {
          evento.target.checked = false;
        }
        return;
      }
      actual.add(productoId);
    } else {
      actual.delete(productoId);
    }
    this.seleccionados.set(actual);
    this.error.set(null);
  }

  /** Carga los productos de la empresa; un 403 solo afecta la asociación. */
  cargarProductos(): void {
    this.cargandoProductos.set(true);
    this.errorProductos.set(null);
    this.productosSinPermiso.set(false);

    this.catalogoService
      .listarProductos({ limit: 100, offset: 0 })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (productos) => {
          this.productos.set(
            [...productos].sort((a, b) => a.nombre.localeCompare(b.nombre)),
          );
          this.cargandoProductos.set(false);
        },
        error: (error: unknown) => {
          this.productos.set([]);
          this.cargandoProductos.set(false);
          const normalizado = this.errores.normalizar(
            error,
            'proveedores/productos',
          );
          if (normalizado.estado === 403) {
            this.productosSinPermiso.set(true);
          }
          this.errorProductos.set(normalizado.mensaje);
        },
      });
  }

  /** Envía el alta. Ante error conserva los datos escritos. */
  guardar(): void {
    if (this.guardando()) {
      return;
    }
    this.form.markAllAsTouched();
    this.error.set(null);
    this.mensajeExito.set(null);
    if (!this.puedeGuardar() || this.form.invalid) {
      return;
    }

    const valores = this.form.getRawValue();
    const dto: TenantProveedorCrear = {
      razon_social: valores.razon_social.trim(),
      producto_ids: [...this.seleccionados()].sort((a, b) => a - b),
    };
    const nit = valores.nit.trim();
    const correo = valores.correo.trim();
    const telefono = valores.telefono.trim();
    const direccion = valores.direccion.trim();
    if (nit) {
      dto.nit = nit;
    }
    if (correo) {
      dto.correo = correo;
    }
    if (telefono) {
      dto.telefono = telefono;
    }
    if (direccion) {
      dto.direccion = direccion;
    }

    this.guardando.set(true);
    this.proveedoresService
      .crear(dto)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (proveedor) => {
          this.guardando.set(false);
          this.mensajeExito.set(
            `Proveedor «${proveedor.razon_social}» creado (#${proveedor.id}) con ${proveedor.total_productos} producto(s).`,
          );
          this.form.reset({
            razon_social: '',
            nit: '',
            correo: '',
            telefono: '',
            direccion: '',
          });
          this.seleccionados.set(new Set());
          this.creado.emit(proveedor);
        },
        error: (error: unknown) => {
          this.guardando.set(false);
          this.error.set(this.errores.normalizar(error, 'proveedores/crear'));
        },
      });
  }
}

/** Valida un correo opcional con el mismo criterio que el backend. */
function correoValido(control: AbstractControl): ValidationErrors | null {
  const texto = String(control.value ?? '').trim();
  if (texto.length === 0) {
    return null;
  }
  const partes = texto.split('@');
  const valido =
    partes.length === 2 &&
    partes[0].length > 0 &&
    partes[1].includes('.') &&
    !texto.includes(' ');
  return valido ? null : { correoInvalido: true };
}
