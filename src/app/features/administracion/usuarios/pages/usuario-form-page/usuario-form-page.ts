import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { AuthService } from '../../../../autenticacion-seguridad/auth/services/auth.service';
import { SucursalActiva } from '../../models/catalogos.model';
import {
  EmpleadoUpdatePayload,
  Usuario,
  UsuarioCreatePayload,
  UsuarioUpdatePayload,
} from '../../models/usuario.model';
import { Rol } from '../../../roles-permisos/models/rol.model';
import { RolesService } from '../../../roles-permisos/services/roles.service';
import { SucursalesService } from '../../services/sucursales.service';
import { UsuariosService } from '../../services/usuarios.service';
import { traducirErrorHttp } from '../../utils/http-error.util';

/** Valores originales del usuario para calcular solo los cambios al editar. */
interface UsuarioOriginal {
  correo: string;
  rol_id: number;
  empleado: {
    nombres: string;
    apellidos: string;
    ci: string;
    telefono: string | null;
    sucursal_id: number;
    fecha_contratacion: string;
  } | null;
}

/** Devuelve la fecha de hoy en formato ISO (YYYY-MM-DD) en hora local. */
function hoyIso(): string {
  const ahora = new Date();
  const mes = String(ahora.getMonth() + 1).padStart(2, '0');
  const dia = String(ahora.getDate()).padStart(2, '0');
  return `${ahora.getFullYear()}-${mes}-${dia}`;
}

/**
 * Formulario de usuario (CU03) - /admin/usuarios/nuevo y
 * /admin/usuarios/:id/editar.
 *
 * - Crear: POST /usuarios (cuenta + empleado + sucursal + rol + contraseña).
 * - Editar: PATCH /usuarios/{id} enviando únicamente los campos modificados
 *   (el cambio de rol se realiza con el mismo PATCH general).
 */
@Component({
  selector: 'app-usuario-form-page',
  imports: [ReactiveFormsModule, RouterLink],
  styleUrl: './usuario-form-page.css',
  templateUrl: './usuario-form-page.html',
})
export class UsuarioFormPage {
  private readonly usuariosService = inject(UsuariosService);
  private readonly rolesService = inject(RolesService);
  private readonly sucursalesService = inject(SucursalesService);
  private readonly authService = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly roles = signal<Rol[]>([]);
  readonly sucursales = signal<SucursalActiva[]>([]);

  readonly esEdicion = signal(false);
  readonly sinEmpleado = signal(false);
  readonly cargandoUsuario = signal(false);
  readonly guardando = signal(false);
  readonly mensajeError = signal<string | null>(null);
  readonly mensajeExito = signal<string | null>(null);
  readonly guardarLabel = signal('Guardar');

  readonly form = new FormGroup({
    cuenta: new FormGroup({
      correo: new FormControl('', {
        nonNullable: true,
        validators: [
          Validators.required,
          Validators.email,
          Validators.minLength(5),
          Validators.maxLength(150),
        ],
      }),
      password: new FormControl('', {
        nonNullable: true,
        validators: [Validators.minLength(8), Validators.maxLength(128)],
      }),
      rolId: new FormControl<number | null>(null, [Validators.required]),
    }),
    empleado: new FormGroup({
      nombres: new FormControl('', {
        nonNullable: true,
        validators: [
          Validators.required,
          Validators.minLength(2),
          Validators.maxLength(100),
        ],
      }),
      apellidos: new FormControl('', {
        nonNullable: true,
        validators: [
          Validators.required,
          Validators.minLength(2),
          Validators.maxLength(100),
        ],
      }),
      ci: new FormControl('', {
        nonNullable: true,
        validators: [
          Validators.required,
          Validators.minLength(3),
          Validators.maxLength(30),
        ],
      }),
      telefono: new FormControl('', {
        nonNullable: true,
        validators: [Validators.maxLength(30)],
      }),
      sucursalId: new FormControl<number | null>(null, [Validators.required]),
      fechaContratacion: new FormControl('', {
        nonNullable: true,
        validators: [Validators.required],
      }),
    }),
  });

  private usuarioId: number | null = null;
  private original: UsuarioOriginal | null = null;

  /** Accesos directos a los controles del formulario para el template. */
  get cuentaCorreo(): AbstractControl | null {
    return this.form.controls.cuenta.get('correo');
  }
  get cuentaPassword(): AbstractControl | null {
    return this.form.controls.cuenta.get('password');
  }
  get cuentaRol(): AbstractControl | null {
    return this.form.controls.cuenta.get('rolId');
  }
  get empleadoNombres(): AbstractControl | null {
    return this.form.controls.empleado.get('nombres');
  }
  get empleadoApellidos(): AbstractControl | null {
    return this.form.controls.empleado.get('apellidos');
  }
  get empleadoCi(): AbstractControl | null {
    return this.form.controls.empleado.get('ci');
  }
  get empleadoTelefono(): AbstractControl | null {
    return this.form.controls.empleado.get('telefono');
  }
  get empleadoSucursal(): AbstractControl | null {
    return this.form.controls.empleado.get('sucursalId');
  }
  get empleadoFecha(): AbstractControl | null {
    return this.form.controls.empleado.get('fechaContratacion');
  }

  ngOnInit(): void {
    this.cargarCatalogos();

    const idParam = this.route.snapshot.paramMap.get('id');
    if (idParam !== null && /^\d+$/.test(idParam)) {
      this.usuarioId = Number(idParam);
      this.esEdicion.set(true);
      this.guardarLabel.set('Guardar cambios');
      // En edición la contraseña es opcional (dejar en blanco conserva la actual).
      this.cargarUsuario();
    } else {
      // Crear: la contraseña temporal es obligatoria.
      const password = this.form.controls.cuenta.controls.password;
      password.setValidators([
        Validators.required,
        Validators.minLength(8),
        Validators.maxLength(128),
      ]);
      this.form.controls.empleado.controls.fechaContratacion.setValue(hoyIso());
    }
  }

  /** Ruta de retorno: al detalle (edición) o al listado (creación). */
  rutaVolver(): string {
    return this.esEdicion() && this.usuarioId !== null
      ? `/admin/usuarios/${this.usuarioId}`
      : '/admin/usuarios';
  }

  mensajeCampo(control: AbstractControl | null): string | null {
    if (!control || control.untouched || !control.errors) {
      return null;
    }
    const errores = control.errors;
    if (errores['required']) {
      return 'Este campo es obligatorio.';
    }
    if (errores['email']) {
      return 'Ingresa un correo electrónico válido.';
    }
    if (errores['minlength']) {
      return `Debe tener al menos ${errores['minlength'].requiredLength} caracteres.`;
    }
    if (errores['maxlength']) {
      return `Debe tener como máximo ${errores['maxlength'].requiredLength} caracteres.`;
    }
    return null;
  }

  onSubmit(): void {
    if (this.guardando()) {
      return;
    }
    this.mensajeError.set(null);
    this.mensajeExito.set(null);

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.mensajeError.set('Revisa los campos marcados e inténtalo nuevamente.');
      return;
    }

    this.guardando.set(true);

    let peticion;
    if (this.esEdicion()) {
      const payload = this.construirPayloadActualizacion();
      if (payload === null) {
        this.guardando.set(false);
        this.mensajeError.set('No se detectaron cambios para guardar.');
        return;
      }
      peticion = this.usuariosService.actualizarUsuario(
        this.usuarioId as number,
        payload,
      );
    } else {
      peticion = this.usuariosService.crearUsuario(this.construirPayloadCreacion());
    }

    peticion.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.guardando.set(false);
        this.mensajeExito.set(
          this.esEdicion()
            ? 'Cambios guardados correctamente.'
            : 'Usuario registrado correctamente.',
        );
        window.setTimeout(() => {
          void this.router.navigateByUrl('/admin/usuarios');
        }, 900);
      },
      error: (error: unknown) => {
        this.guardando.set(false);
        this.manejarError(error);
      },
    });
  }

  /** Construye el payload de creación (POST /usuarios). */
  private construirPayloadCreacion(): UsuarioCreatePayload {
    const cuenta = this.form.controls.cuenta.getRawValue();
    const empleado = this.form.controls.empleado.getRawValue();

    return {
      correo: cuenta.correo.trim(),
      password: cuenta.password,
      rol_id: cuenta.rolId as number,
      empleado: {
        nombres: empleado.nombres.trim(),
        apellidos: empleado.apellidos.trim(),
        ci: empleado.ci.trim(),
        telefono: this.normalizarTelefono(empleado.telefono),
        sucursal_id: empleado.sucursalId as number,
        fecha_contratacion: empleado.fechaContratacion,
      },
    };
  }

  /**
   * Construye el payload parcial de edición (PATCH /usuarios/{id}) con los
   * campos modificados. Devuelve null si no hay cambios que guardar.
   */
  private construirPayloadActualizacion(): UsuarioUpdatePayload | null {
    const payload: UsuarioUpdatePayload = {};
    const original = this.original;
    const cuenta = this.form.controls.cuenta.getRawValue();
    const empleado = this.form.controls.empleado.getRawValue();

    if (original === null) {
      return null;
    }

    if (cuenta.correo.trim().toLowerCase() !== original.correo.toLowerCase()) {
      payload.correo = cuenta.correo.trim();
    }
    if (cuenta.password.length > 0) {
      payload.password = cuenta.password;
    }
    if (cuenta.rolId !== null && cuenta.rolId !== original.rol_id) {
      payload.rol_id = cuenta.rolId;
    }

    if (original.empleado !== null) {
      const empleadoOriginal = original.empleado;
      const cambiosEmpleado: EmpleadoUpdatePayload = {};

      if (empleado.nombres.trim() !== empleadoOriginal.nombres) {
        cambiosEmpleado.nombres = empleado.nombres.trim();
      }
      if (empleado.apellidos.trim() !== empleadoOriginal.apellidos) {
        cambiosEmpleado.apellidos = empleado.apellidos.trim();
      }
      if (empleado.ci.trim() !== empleadoOriginal.ci) {
        cambiosEmpleado.ci = empleado.ci.trim();
      }
      const telefono = this.normalizarTelefono(empleado.telefono);
      if (telefono !== empleadoOriginal.telefono) {
        cambiosEmpleado.telefono = telefono;
      }
      if (
        empleado.sucursalId !== null &&
        empleado.sucursalId !== empleadoOriginal.sucursal_id
      ) {
        cambiosEmpleado.sucursal_id = empleado.sucursalId;
      }
      if (empleado.fechaContratacion !== empleadoOriginal.fecha_contratacion) {
        cambiosEmpleado.fecha_contratacion = empleado.fechaContratacion;
      }

      if (Object.keys(cambiosEmpleado).length > 0) {
        payload.empleado = cambiosEmpleado;
      }
    }

    const sinCambios =
      payload.correo === undefined &&
      payload.password === undefined &&
      payload.rol_id === undefined &&
      payload.empleado === undefined;
    return sinCambios ? null : payload;
  }

  private cargarUsuario(): void {
    if (this.usuarioId === null) {
      return;
    }
    this.cargandoUsuario.set(true);
    this.usuariosService
      .obtenerUsuario(this.usuarioId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (usuario: Usuario) => {
          this.cargandoUsuario.set(false);
          this.aplicarUsuario(usuario);
        },
        error: (error: unknown) => {
          this.cargandoUsuario.set(false);
          this.manejarError(error);
        },
      });
  }

  private aplicarUsuario(usuario: Usuario): void {
    const empleado = usuario.empleado;

    this.form.controls.cuenta.patchValue({
      correo: usuario.correo,
      rolId: usuario.rol.id,
    });

    this.original = {
      correo: usuario.correo,
      rol_id: usuario.rol.id,
      empleado: empleado
        ? {
            nombres: empleado.nombres,
            apellidos: empleado.apellidos,
            ci: empleado.ci,
            telefono: empleado.telefono,
            sucursal_id: empleado.sucursal.id,
            fecha_contratacion: empleado.fecha_contratacion,
          }
        : null,
    };

    if (empleado === null) {
      this.sinEmpleado.set(true);
      this.form.controls.empleado.disable();
      return;
    }

    this.form.controls.empleado.patchValue({
      nombres: empleado.nombres,
      apellidos: empleado.apellidos,
      ci: empleado.ci,
      telefono: empleado.telefono ?? '',
      sucursalId: empleado.sucursal.id,
      fechaContratacion: empleado.fecha_contratacion,
    });
  }

  private cargarCatalogos(): void {
    this.rolesService
      .listarRolesAsignablesInternos()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (roles) => this.roles.set(roles),
        error: (error: unknown) => this.manejarError(error),
      });

    this.sucursalesService
      .listarSucursalesActivas()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (sucursales) => this.sucursales.set(sucursales),
        error: (error: unknown) => this.manejarError(error),
      });
  }

  private normalizarTelefono(telefono: string): string | null {
    const valor = telefono.trim();
    return valor.length > 0 ? valor : null;
  }

  private manejarError(error: unknown): void {
    const traducido = traducirErrorHttp(error);
    if (traducido.sesionExpirada) {
      this.authService.cerrarSesion();
      void this.router.navigateByUrl('/auth/personal/login');
      return;
    }
    this.mensajeError.set(traducido.mensaje);
  }
}
