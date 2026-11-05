import {
  Component,
  DestroyRef,
  ElementRef,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';

import { AdminIcon } from '../../../features/administracion/components/admin-icon/admin-icon';
import {
  TENANT_ROL_ADMINISTRADOR,
  TenantCiudad,
  TenantErrorNormalizado,
  TenantSucursal,
  TenantSucursalCrear,
} from '../../models/tenant.models';
import { SaasCatalogoService } from '../../services/saas-catalogo.service';
import { SaasEmpresaService } from '../../services/saas-empresa.service';
import { SaasErrorService } from '../../services/saas-error.service';
import { SaasSessionService } from '../../services/saas-session.service';
import { SaasSucursalesService } from '../../services/saas-sucursales.service';

/**
 * Sucursales de la empresa (`/tenant/empresa/sucursales`).
 *
 * `ciudad_id` se elige de `GET /tenant/catalogo/ciudades` (diccionario global)
 * y la tabla muestra el nombre de la ciudad. Si el catálogo llega vacío o con
 * 403 se muestra un aviso y se deshabilita el alta: nunca se permite teclear un
 * identificador a mano.
 *
 * Las escrituras (alta y cambio de estado) exigen ADMINISTRADOR en el backend:
 * la UI oculta los controles para el resto de roles, pero la autorización real
 * sigue siendo del backend.
 */
@Component({
  selector: 'app-saas-sucursales-page',
  imports: [ReactiveFormsModule, AdminIcon],
  styleUrl: './saas-sucursales.page.css',
  templateUrl: './saas-sucursales.page.html',
})
export class SaasSucursalesPage {
  private readonly sucursalesService = inject(SaasSucursalesService);
  private readonly catalogoService = inject(SaasCatalogoService);
  private readonly empresaService = inject(SaasEmpresaService);
  private readonly sesion = inject(SaasSessionService);
  private readonly errores = inject(SaasErrorService);
  private readonly destroyRef = inject(DestroyRef);

  readonly sucursales = signal<TenantSucursal[]>([]);
  readonly cargando = signal(true);
  readonly mensajeError = signal<string | null>(null);

  /** Catálogo global de ciudades que alimenta el selector del alta. */
  readonly ciudades = signal<TenantCiudad[]>([]);
  readonly cargandoCiudades = signal(true);
  readonly errorCiudades = signal<string | null>(null);
  readonly ciudadesSinPermiso = signal(false);

  /** Máximo de sucursales activas del plan; `null` si no se pudo consultar. */
  readonly maximoPlan = signal<number | null>(null);

  readonly formularioAbierto = signal(false);
  readonly guardando = signal(false);
  readonly errorFormulario = signal<TenantErrorNormalizado | null>(null);
  readonly esErrorLimite = signal(false);

  readonly mensajeExito = signal<string | null>(null);

  /** Sucursal pendiente de confirmación (activar/desactivar). */
  readonly confirmacion = signal<TenantSucursal | null>(null);
  readonly cambiandoId = signal<number | null>(null);
  readonly errorConfirmacion = signal<string | null>(null);

  /** Elemento que abrió el diálogo, para devolverle el foco al cerrarlo. */
  private focoPrevio: HTMLElement | null = null;

  readonly form = new FormGroup({
    nombre: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(120)],
    }),
    direccion: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(255)],
    }),
    telefono: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(30)],
    }),
    // El contrato exige un entero > 0; el valor sale del selector de ciudades
    // y nunca se teclea a mano.
    ciudad_id: new FormControl<number | null>(null, {
      validators: [Validators.required, Validators.min(1)],
    }),
  });

  private readonly nombreInput =
    viewChild<ElementRef<HTMLInputElement>>('nombreInput');
  private readonly direccionInput =
    viewChild<ElementRef<HTMLInputElement>>('direccionInput');
  private readonly telefonoInput =
    viewChild<ElementRef<HTMLInputElement>>('telefonoInput');
  private readonly ciudadInput =
    viewChild<ElementRef<HTMLSelectElement>>('ciudadInput');

  /** `true` cuando la membresía tiene rol ADMINISTRADOR. */
  readonly esAdministrador = computed(
    () => normalizarRol(this.sesion.rol()) === TENANT_ROL_ADMINISTRADOR,
  );

  /** `true` si el catálogo de ciudades está disponible para el alta. */
  readonly catalogoCiudadesDisponible = computed(
    () =>
      !this.cargandoCiudades() &&
      this.ciudades().length > 0 &&
      !this.ciudadesSinPermiso(),
  );

  /** El alta solo se habilita al administrador y con catálogo de ciudades. */
  readonly puedeCrear = computed(
    () => this.esAdministrador() && this.catalogoCiudadesDisponible(),
  );

  readonly activas = computed(
    () => this.sucursales().filter((sucursal) => sucursal.estado).length,
  );

  readonly total = computed(() => this.sucursales().length);

  readonly maximo = computed(() => this.maximoPlan() ?? 0);

  /** `true` cuando el plan ya no admite otra sucursal activa. */
  readonly limiteAlcanzado = computed(
    () => this.maximo() > 0 && this.activas() >= this.maximo(),
  );

  readonly textoLimite = computed(() => {
    const maximo = this.maximoPlan();
    if (maximo === null) {
      return 'El límite del plan no está disponible en este momento.';
    }
    return `${this.activas()} de ${maximo} sucursales activas permitidas por el plan.`;
  });

  constructor() {
    this.cargarLimitePlan();
    this.cargarCiudades();
    this.cargarSucursales();
  }

  recargar(): void {
    if (this.cargando()) {
      return;
    }
    this.cargarSucursales();
  }

  recargarCiudades(): void {
    if (this.cargandoCiudades()) {
      return;
    }
    this.cargarCiudades();
  }

  abrirFormulario(): void {
    if (!this.puedeCrear() || this.guardando()) {
      return;
    }
    this.formularioAbierto.set(true);
    this.errorFormulario.set(null);
    this.esErrorLimite.set(false);
  }

  cerrarFormulario(): void {
    if (this.guardando()) {
      return;
    }
    this.formularioAbierto.set(false);
    this.errorFormulario.set(null);
    this.esErrorLimite.set(false);
  }

  /** Envía el alta. Ante error conserva los datos escritos en el formulario. */
  enviar(): void {
    if (this.guardando() || !this.puedeCrear()) {
      return;
    }

    this.form.markAllAsTouched();
    this.errorFormulario.set(null);
    this.esErrorLimite.set(false);
    this.mensajeExito.set(null);

    if (this.form.invalid) {
      this.enfocarPrimerError();
      return;
    }

    const valores = this.form.getRawValue();
    const ciudadId = valores.ciudad_id;
    if (ciudadId === null || !Number.isInteger(ciudadId) || ciudadId <= 0) {
      this.form.controls.ciudad_id.setErrors({ min: true });
      this.form.controls.ciudad_id.markAsTouched();
      this.enfocarPrimerError();
      return;
    }

    const dto: TenantSucursalCrear = {
      ciudad_id: ciudadId,
      nombre: valores.nombre.trim(),
      direccion: valores.direccion.trim(),
    };
    const telefono = valores.telefono.trim();
    if (telefono.length > 0) {
      dto.telefono = telefono;
    }

    this.guardando.set(true);

    this.sucursalesService
      .crear(dto)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (sucursal) => {
          this.guardando.set(false);
          this.sucursales.update((lista) => ordenarPorId([...lista, sucursal]));
          this.formularioAbierto.set(false);
          this.form.reset({
            nombre: '',
            direccion: '',
            telefono: '',
            ciudad_id: null,
          });
          this.mensajeExito.set(
            `Sucursal «${sucursal.nombre}» creada correctamente.`,
          );
        },
        error: (error: unknown) => {
          this.guardando.set(false);
          const normalizado = this.errores.normalizar(
            error,
            'sucursales/crear',
          );
          this.errorFormulario.set(normalizado);
          this.esErrorLimite.set(
            normalizado.estado === 409 &&
              /limite de sucursales/i.test(normalizado.mensaje),
          );
          if (normalizado.esValidacion) {
            this.enfocarPrimerError();
          }
        },
      });
  }

  /** Pide confirmación antes de cambiar el estado de una sucursal. */
  pedirConfirmacion(sucursal: TenantSucursal, evento?: Event): void {
    if (!this.esAdministrador()) {
      return;
    }
    const disparador = evento?.currentTarget;
    this.focoPrevio =
      disparador instanceof HTMLElement ? disparador : null;
    this.errorConfirmacion.set(null);
    this.confirmacion.set(sucursal);
  }

  cancelarConfirmacion(): void {
    if (this.cambiandoId() !== null) {
      return;
    }
    this.confirmacion.set(null);
    this.errorConfirmacion.set(null);
    this.restaurarFoco();
  }

  /**
   * Mantiene el foco dentro del diálogo mientras está abierto.
   *
   * Se usa junto con `role="dialog" aria-modal="true"`; sin trampa de foco el
   * lector de pantalla podría salir al contenido de fondo.
   */
  contenerFoco(evento: KeyboardEvent): void {
    if (evento.key !== 'Tab') {
      return;
    }
    const contenedor = evento.currentTarget;
    if (!(contenedor instanceof HTMLElement)) {
      return;
    }
    const focos = Array.from(
      contenedor.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    );
    if (focos.length === 0) {
      return;
    }
    const primero = focos[0];
    const ultimo = focos[focos.length - 1];
    const activo = document.activeElement;

    if (evento.shiftKey && activo === primero) {
      evento.preventDefault();
      ultimo.focus();
    } else if (!evento.shiftKey && activo === ultimo) {
      evento.preventDefault();
      primero.focus();
    }
  }

  /** Aplica el cambio de estado confirmado. */
  ejecutarCambio(): void {
    const sucursal = this.confirmacion();
    if (sucursal === null || this.cambiandoId() !== null) {
      return;
    }

    const nuevoEstado = !sucursal.estado;
    this.cambiandoId.set(sucursal.id);
    this.errorConfirmacion.set(null);
    this.mensajeExito.set(null);

    this.sucursalesService
      .cambiarEstado(sucursal.id, nuevoEstado)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (actualizada) => {
          this.cambiandoId.set(null);
          this.confirmacion.set(null);
          this.sucursales.update((lista) =>
            lista.map((fila) =>
              fila.id === actualizada.id ? actualizada : fila,
            ),
          );
          this.mensajeExito.set(
            actualizada.estado
              ? `Sucursal «${actualizada.nombre}» activada.`
              : `Sucursal «${actualizada.nombre}» desactivada.`,
          );
          this.restaurarFoco();
        },
        error: (error: unknown) => {
          this.cambiandoId.set(null);
          this.errorConfirmacion.set(
            this.errores.mensajeDeError(error, 'sucursales/estado'),
          );
        },
      });
  }

  /** Mensaje de validación del nombre. */
  mensajeNombre(): string | null {
    const control = this.form.controls.nombre;
    if (control.untouched || !control.invalid) {
      return null;
    }
    return control.hasError('required')
      ? 'Ingresa el nombre de la sucursal.'
      : 'El nombre admite como máximo 120 caracteres.';
  }

  /** Mensaje de validación de la dirección. */
  mensajeDireccion(): string | null {
    const control = this.form.controls.direccion;
    if (control.untouched || !control.invalid) {
      return null;
    }
    return control.hasError('required')
      ? 'Ingresa la dirección de la sucursal.'
      : 'La dirección admite como máximo 255 caracteres.';
  }

  /** Mensaje de validación del teléfono (opcional). */
  mensajeTelefono(): string | null {
    const control = this.form.controls.telefono;
    if (control.untouched || !control.invalid) {
      return null;
    }
    return 'El teléfono admite como máximo 30 caracteres.';
  }

  /** Mensaje de validación del identificador de ciudad. */
  mensajeCiudad(): string | null {
    const control = this.form.controls.ciudad_id;
    if (control.untouched || !control.invalid) {
      return null;
    }
    if (control.hasError('required')) {
      return 'Selecciona la ciudad de la sucursal.';
    }
    return 'Selecciona una ciudad válida.';
  }

  /** Nombre de la ciudad para la tabla; el `#id` queda como respaldo. */
  nombreCiudad(ciudadId: number): string {
    return (
      this.ciudades().find((ciudad) => ciudad.id === ciudadId)?.nombre ??
      `Ciudad #${ciudadId}`
    );
  }

  /** Nombre completo de la sucursal destino de una acción. */
  etiquetaAccion(sucursal: TenantSucursal): string {
    return sucursal.estado
      ? `Desactivar la sucursal ${sucursal.nombre}`
      : `Activar la sucursal ${sucursal.nombre}`;
  }

  /** Lleva el foco al primer campo inválido del formulario. */
  private enfocarPrimerError(): void {
    const candidatos: Array<[
      boolean,
      ElementRef<HTMLInputElement | HTMLSelectElement> | undefined,
    ]> = [
      [this.form.controls.nombre.invalid, this.nombreInput()],
      [this.form.controls.direccion.invalid, this.direccionInput()],
      [this.form.controls.ciudad_id.invalid, this.ciudadInput()],
      [this.form.controls.telefono.invalid, this.telefonoInput()],
    ];

    for (const [invalido, referencia] of candidatos) {
      if (invalido && referencia !== undefined) {
        referencia.nativeElement.focus();
        return;
      }
    }
  }

  /** Carga el diccionario global de ciudades; un 403 solo deshabilita el alta. */
  private cargarCiudades(): void {
    this.cargandoCiudades.set(true);
    this.errorCiudades.set(null);
    this.ciudadesSinPermiso.set(false);

    this.catalogoService
      .listarCiudades()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (ciudades) => {
          this.ciudades.set(
            [...ciudades].sort((a, b) => a.nombre.localeCompare(b.nombre)),
          );
          this.cargandoCiudades.set(false);
        },
        error: (error: unknown) => {
          this.ciudades.set([]);
          this.cargandoCiudades.set(false);
          const normalizado = this.errores.normalizar(
            error,
            'sucursales/ciudades',
          );
          if (normalizado.estado === 403) {
            this.ciudadesSinPermiso.set(true);
          }
          this.errorCiudades.set(normalizado.mensaje);
        },
      });
  }

  private cargarSucursales(): void {    this.cargando.set(true);
    this.mensajeError.set(null);

    this.sucursalesService
      .listar()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (sucursales) => {
          this.sucursales.set(ordenarPorId(sucursales));
          this.cargando.set(false);
        },
        error: (error: unknown) => {
          this.sucursales.set([]);
          this.cargando.set(false);
          this.mensajeError.set(
            this.errores.mensajeDeError(error, 'sucursales/listar'),
          );
        },
      });
  }

  /** Devuelve el foco al botón que abrió el diálogo. */
  private restaurarFoco(): void {
    const previo = this.focoPrevio;
    this.focoPrevio = null;
    if (previo !== null) {
      previo.focus();
    }
  }

  /** El límite es informativo: si falla, la lista de sucursales sigue viva. */
  private cargarLimitePlan(): void {
    this.empresaService
      .obtenerEmpresa()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (empresa) => {
          this.maximoPlan.set(
            empresa.suscripcion?.max_sucursales_activas ?? null,
          );
        },
        error: () => {
          this.maximoPlan.set(null);
        },
      });
  }
}

/** Normaliza un nombre de rol para compararlo (mayúsculas, sin espacios). */
function normalizarRol(rol: string | null | undefined): string {
  return (rol ?? '').trim().toUpperCase();
}

/** Ordena por identificador ascendente sin mutar el arreglo recibido. */
function ordenarPorId(sucursales: TenantSucursal[]): TenantSucursal[] {
  return [...sucursales].sort((a, b) => a.id - b.id);
}
