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
  AbstractControl,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';

import { AdminIcon } from '../../../features/administracion/components/admin-icon/admin-icon';
import {
  AltaPersonalRespuesta,
  AltaPersonalSolicitud,
  TenantErrorNormalizado,
  TenantRol,
  TenantSucursal,
  TenantUsuarioMembresia,
} from '../../models/tenant.models';
import { SaasErrorService } from '../../services/saas-error.service';
import { SaasPermissionsService } from '../../services/saas-permissions.service';
import { SaasPersonalService } from '../../services/saas-personal.service';
import { SaasRolesService } from '../../services/saas-roles.service';
import { SaasSessionService } from '../../services/saas-session.service';
import { SaasSucursalesService } from '../../services/saas-sucursales.service';

/** Rol que el backend no permite asignar al personal de la empresa. */
const ROL_NO_ASIGNABLE = 'CLIENTE';

/**
 * Personal de la empresa (`/tenant/empresa/usuarios`).
 *
 * Contrato relevante:
 * - `GET /tenant/empresa/usuarios` exige ADMINISTRADOR: un rol con solo
 *   `PERSONAL/CONSULTAR` recibirá 403 y la pantalla lo muestra como error.
 * - El alta NO acepta contraseña: devuelve una invitación de un solo uso cuyo
 *   token solo existe en esa respuesta. El token vive únicamente en memoria y
 *   nunca se guarda en storage ni se registra en consola.
 * - El backend rechaza cambiar el rol/estado de la propia membresía (403) y
 *   desactivar al último administrador (409); esos mensajes se muestran tal
 *   cual llegan.
 *
 * La UI oculta las acciones de escritura cuando el rol no tiene
 * `PERSONAL/ADMINISTRAR`, pero la autorización real es siempre del backend.
 */
@Component({
  selector: 'app-saas-personal-page',
  imports: [ReactiveFormsModule, AdminIcon],
  styleUrl: './saas-personal.page.css',
  templateUrl: './saas-personal.page.html',
})
export class SaasPersonalPage {
  private readonly personalService = inject(SaasPersonalService);
  private readonly rolesService = inject(SaasRolesService);
  private readonly sucursalesService = inject(SaasSucursalesService);
  private readonly permisos = inject(SaasPermissionsService);
  private readonly sesion = inject(SaasSessionService);
  private readonly errores = inject(SaasErrorService);
  private readonly destroyRef = inject(DestroyRef);

  readonly personal = signal<TenantUsuarioMembresia[]>([]);
  readonly cargando = signal(true);
  readonly mensajeError = signal<string | null>(null);

  readonly roles = signal<TenantRol[]>([]);
  readonly sucursales = signal<TenantSucursal[]>([]);
  readonly catalogosCargando = signal(true);
  readonly errorCatalogos = signal<string | null>(null);

  readonly altaAbierta = signal(false);
  readonly guardandoAlta = signal(false);
  readonly errorAlta = signal<TenantErrorNormalizado | null>(null);

  /** Respuesta del alta con el token de un solo uso (solo en memoria). */
  readonly invitacion = signal<AltaPersonalRespuesta | null>(null);
  readonly copiado = signal<'ok' | 'error' | null>(null);

  readonly mensajeExito = signal<string | null>(null);
  readonly mensajeAccion = signal<string | null>(null);

  /** Fila con una operación en curso (evita dobles envíos). */
  readonly filaOcupadaId = signal<number | null>(null);

  /** Membresía pendiente de desactivación. */
  readonly confirmacion = signal<TenantUsuarioMembresia | null>(null);
  readonly errorConfirmacion = signal<string | null>(null);

  /** Elemento que abrió el diálogo, para devolverle el foco al cerrarlo. */
  private focoPrevio: HTMLElement | null = null;

  readonly formAlta = new FormGroup({
    correo: new FormControl('', {
      nonNullable: true,
      validators: [
        Validators.required,
        Validators.email,
        Validators.maxLength(150),
      ],
    }),
    nombres: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(120)],
    }),
    apellidos: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(120)],
    }),
    ci: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(35)],
    }),
    telefono: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(30)],
    }),
    sucursal_id: new FormControl<number | null>(null, {
      validators: [Validators.required, Validators.min(1)],
    }),
    rol_id: new FormControl<number | null>(null, {
      validators: [Validators.required, Validators.min(1)],
    }),
    expira_horas: new FormControl<number>(72, {
      nonNullable: true,
      validators: [
        Validators.required,
        Validators.min(1),
        Validators.max(168),
      ],
    }),
  });

  private readonly correoInput =
    viewChild<ElementRef<HTMLInputElement>>('correoInput');
  private readonly nombresInput =
    viewChild<ElementRef<HTMLInputElement>>('nombresInput');
  private readonly apellidosInput =
    viewChild<ElementRef<HTMLInputElement>>('apellidosInput');
  private readonly ciInput = viewChild<ElementRef<HTMLInputElement>>('ciInput');
  private readonly telefonoInput =
    viewChild<ElementRef<HTMLInputElement>>('telefonoInput');
  private readonly sucursalInput =
    viewChild<ElementRef<HTMLSelectElement>>('sucursalInput');
  private readonly rolInput =
    viewChild<ElementRef<HTMLSelectElement>>('rolInput');
  private readonly expiraInput =
    viewChild<ElementRef<HTMLInputElement>>('expiraInput');

  /** `true` cuando el rol puede escribir (PERSONAL/ADMINISTRAR). */
  readonly puedeAdministrar = computed(() =>
    this.permisos.puede('PERSONAL', 'ADMINISTRAR'),
  );

  /** Identificador de la membresía propia (no se puede modificar). */
  readonly propioId = computed(() => this.sesion.sesion()?.usuario_id ?? null);

  /** Roles asignables al personal: el backend rechaza CLIENTE con 422. */
  readonly rolesAsignables = computed(() =>
    this.roles().filter(
      (rol) => rol.nombre.trim().toUpperCase() !== ROL_NO_ASIGNABLE,
    ),
  );

  /** Destinos posibles de una mudanza: solo sucursales activas. */
  readonly sucursalesActivas = computed(() =>
    this.sucursales().filter((sucursal) => sucursal.estado),
  );

  readonly total = computed(() => this.personal().length);

  readonly activos = computed(
    () => this.personal().filter((fila) => fila.membresia_activa).length,
  );

  constructor() {
    this.cargarPersonal();
    this.cargarCatalogos();
  }

  // =============================== Listado ===============================

  recargar(): void {
    if (this.cargando()) {
      return;
    }
    this.cargarPersonal();
  }

  /** `true` cuando la fila corresponde a la membresía de quien consulta. */
  esPropio(fila: TenantUsuarioMembresia): boolean {
    return this.propioId() !== null && fila.usuario_id === this.propioId();
  }

  /** `true` si la fila admite acciones de escritura para el rol actual. */
  puedeEditarFila(fila: TenantUsuarioMembresia): boolean {
    return this.puedeAdministrar() && !this.esPropio(fila);
  }

  /** Fecha legible; devuelve el texto original si no es una fecha válida. */
  formatearFecha(iso: string | null | undefined): string {
    if (!iso) {
      return '—';
    }
    const fecha = new Date(iso);
    if (Number.isNaN(fecha.getTime())) {
      return iso;
    }
    return new Intl.DateTimeFormat('es', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(fecha);
  }

  /** Nombre visible de la persona, o el correo si no hay empleado asociado. */
  nombrePersona(fila: TenantUsuarioMembresia): string {
    const nombre = [fila.nombres, fila.apellidos]
      .filter((parte): parte is string => typeof parte === 'string')
      .join(' ')
      .trim();
    return nombre.length > 0 ? nombre : '—';
  }

  /** Texto legible de un booleano de estado (nunca solo color). */
  textoEstado(valor: boolean | null): string {
    if (valor === null) {
      return 'Sin registro';
    }
    return valor ? 'Activo' : 'Inactivo';
  }

  /** Nombre de la sucursal por identificador. */
  nombreSucursal(sucursalId: number | null): string {
    if (sucursalId === null) {
      return 'Sin sucursal';
    }
    return (
      this.sucursales().find((sucursal) => sucursal.id === sucursalId)
        ?.nombre ?? `Sucursal #${sucursalId}`
    );
  }

  /**
   * Opciones de sucursal para una fila: activas + la suya si quedó inactiva,
   * para no perder el valor actual del formulario.
   */
  opcionesSucursal(fila: TenantUsuarioMembresia): TenantSucursal[] {
    const activas = this.sucursalesActivas();
    const actual = this.sucursales().find(
      (sucursal) => sucursal.id === fila.sucursal_id,
    );
    if (actual === undefined || activas.some((s) => s.id === actual.id)) {
      return activas;
    }
    return [actual, ...activas];
  }

  /** `true` si el rol actual puede aparecer en el select de asignación. */
  esRolAsignable(nombre: string): boolean {
    const objetivo = normalizarRol(nombre);
    return this.rolesAsignables().some(
      (rol) => normalizarRol(rol.nombre) === objetivo,
    );
  }

  // ================================ Alta =================================

  abrirAlta(): void {
    if (!this.puedeAdministrar() || this.guardandoAlta()) {
      return;
    }
    this.altaAbierta.set(true);
    this.errorAlta.set(null);
  }

  cerrarAlta(): void {
    if (this.guardandoAlta()) {
      return;
    }
    this.altaAbierta.set(false);
    this.errorAlta.set(null);
  }

  /** Crea la cuenta de personal y deja la invitación lista para compartir. */
  enviarAlta(): void {
    if (this.guardandoAlta()) {
      return;
    }

    this.formAlta.markAllAsTouched();
    this.errorAlta.set(null);
    this.mensajeExito.set(null);

    if (this.formAlta.invalid) {
      this.enfocarPrimerError();
      return;
    }

    const valores = this.formAlta.getRawValue();
    const sucursalId = valores.sucursal_id;
    const rolId = valores.rol_id;
    const expira = valores.expira_horas;

    if (sucursalId === null || rolId === null || !esEnteroPositivo(expira)) {
      this.enfocarPrimerError();
      return;
    }

    const dto: AltaPersonalSolicitud = {
      correo: valores.correo.trim().toLowerCase(),
      nombres: valores.nombres.trim(),
      apellidos: valores.apellidos.trim(),
      ci: valores.ci.trim(),
      sucursal_id: sucursalId,
      rol_id: rolId,
      expira_horas: expira,
    };
    const telefono = valores.telefono.trim();
    if (telefono.length > 0) {
      dto.telefono = telefono;
    }

    this.guardandoAlta.set(true);

    this.personalService
      .alta(dto)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (respuesta) => {
          this.guardandoAlta.set(false);
          this.altaAbierta.set(false);
          this.copiado.set(null);
          this.invitacion.set(respuesta);
          this.formAlta.reset({
            correo: '',
            nombres: '',
            apellidos: '',
            ci: '',
            telefono: '',
            sucursal_id: null,
            rol_id: null,
            expira_horas: 72,
          });
          this.mensajeExito.set(
            `Invitación generada para ${respuesta.correo}.`,
          );
          // La lista no incluye cuentas pendientes de aceptar la invitación.
          this.cargarPersonal();
        },
        error: (error: unknown) => {
          this.guardandoAlta.set(false);
          const normalizado = this.errores.normalizar(error, 'personal/alta');
          this.errorAlta.set(normalizado);
          if (normalizado.esValidacion || normalizado.estado === 409) {
            this.enfocarPrimerError();
          }
        },
      });
  }

  /** Cierra el panel de invitación y descarta el token de la memoria. */
  cerrarInvitacion(): void {
    this.invitacion.set(null);
    this.copiado.set(null);
    this.mensajeExito.set(null);
  }

  /**
   * Copia el token al portapapeles.
   *
   * Usa la API moderna cuando existe y cae a la selección + `execCommand`
   * cuando el navegador la bloquea o no la soporta. Nunca registra el token.
   */
  async copiarToken(): Promise<void> {
    const token = this.invitacion()?.invitacion.token ?? null;
    if (token === null) {
      return;
    }
    this.copiado.set(null);

    let copiado = false;
    try {
      if (
        typeof navigator !== 'undefined' &&
        typeof navigator.clipboard?.writeText === 'function'
      ) {
        await navigator.clipboard.writeText(token);
        copiado = true;
      }
    } catch {
      copiado = false;
    }

    if (!copiado) {
      copiado = copiarConSeleccion(token);
    }

    this.copiado.set(copiado ? 'ok' : 'error');
  }

  // =========================== Acciones por fila =========================

  /** Cambia el rol de una fila; el backend rechaza el rol propio con 403. */
  cambiarRol(fila: TenantUsuarioMembresia, evento: Event): void {
    const valor = leerEnteroDeSelect(evento);
    if (valor === null || valor === fila.rol_id || this.filaOcupadaId() !== null) {
      return;
    }

    this.filaOcupadaId.set(fila.usuario_id);
    this.mensajeAccion.set(null);
    this.mensajeExito.set(null);

    this.personalService
      .cambiarRol(fila.usuario_id, valor)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (actualizada) => {
          this.filaOcupadaId.set(null);
          this.reemplazarFila(actualizada);
          this.mensajeExito.set(
            `Rol de ${actualizada.correo} actualizado a ${actualizada.rol}.`,
          );
        },
        error: (error: unknown) => {
          this.filaOcupadaId.set(null);
          // El select debe volver a mostrar el rol real del servidor.
          restaurarSelect(evento, fila.rol_id);
          this.mensajeAccion.set(
            this.errores.mensajeDeError(error, 'personal/rol'),
          );
        },
      });
  }

  /** Cambia la sucursal del empleado; exige empleado activo en el backend. */
  cambiarSucursal(fila: TenantUsuarioMembresia, evento: Event): void {
    const valor = leerEnteroDeSelect(evento);
    if (
      valor === null ||
      valor === fila.sucursal_id ||
      this.filaOcupadaId() !== null
    ) {
      return;
    }

    this.filaOcupadaId.set(fila.usuario_id);
    this.mensajeAccion.set(null);
    this.mensajeExito.set(null);

    this.personalService
      .cambiarSucursal(fila.usuario_id, valor)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (respuesta) => {
          this.filaOcupadaId.set(null);
          this.personal.update((lista) =>
            lista.map((filaActual) =>
              filaActual.usuario_id === respuesta.usuario_id
                ? { ...filaActual, sucursal_id: respuesta.sucursal_id }
                : filaActual,
            ),
          );
          this.mensajeExito.set(
            `${fila.correo} ahora trabaja en ${this.nombreSucursal(
              respuesta.sucursal_id,
            )}.`,
          );
        },
        error: (error: unknown) => {
          this.filaOcupadaId.set(null);
          // El select debe volver a mostrar la sucursal real del servidor.
          restaurarSelect(evento, fila.sucursal_id);
          this.mensajeAccion.set(
            this.errores.mensajeDeError(error, 'personal/sucursal'),
          );
        },
      });
  }

  /** Activa una membresía inactiva (sin confirmación: no es destructivo). */
  activarMembresia(fila: TenantUsuarioMembresia): void {
    if (!this.puedeAdministrar() || this.esPropio(fila)) {
      return;
    }
    this.aplicarEstado(fila, true);
  }

  /** Abre la confirmación antes de desactivar una membresía. */
  pedirDesactivar(fila: TenantUsuarioMembresia, evento?: Event): void {
    if (!this.puedeAdministrar() || this.esPropio(fila)) {
      return;
    }
    const disparador = evento?.currentTarget;
    this.focoPrevio =
      disparador instanceof HTMLElement ? disparador : null;
    this.errorConfirmacion.set(null);
    this.confirmacion.set(fila);
  }

  cancelarDesactivar(): void {
    if (this.filaOcupadaId() !== null) {
      return;
    }
    this.confirmacion.set(null);
    this.errorConfirmacion.set(null);
    this.restaurarFoco();
  }

  /**
   * Mantiene el foco dentro del diálogo mientras está abierto
   * (`role="dialog" aria-modal="true"`).
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

  /** Confirma la desactivación pendiente. */
  confirmarDesactivar(): void {
    const fila = this.confirmacion();
    if (fila === null || this.filaOcupadaId() !== null) {
      return;
    }
    this.errorConfirmacion.set(null);
    this.aplicarEstado(fila, false, true);
  }

  // ================================ Interno ==============================

  private aplicarEstado(
    fila: TenantUsuarioMembresia,
    estado: boolean,
    desdeConfirmacion = false,
  ): void {
    this.filaOcupadaId.set(fila.usuario_id);
    this.mensajeAccion.set(null);
    this.mensajeExito.set(null);

    this.personalService
      .cambiarEstado(fila.usuario_id, estado)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (actualizada) => {
          this.filaOcupadaId.set(null);
          this.confirmacion.set(null);
          this.reemplazarFila(actualizada);
          this.mensajeExito.set(
            actualizada.membresia_activa
              ? `Membresía de ${actualizada.correo} activada.`
              : `Membresía de ${actualizada.correo} desactivada.`,
          );
          this.restaurarFoco();
        },
        error: (error: unknown) => {
          this.filaOcupadaId.set(null);
          const mensaje = this.errores.mensajeDeError(error, 'personal/estado');
          if (desdeConfirmacion) {
            this.errorConfirmacion.set(mensaje);
          } else {
            this.mensajeAccion.set(mensaje);
          }
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

  private reemplazarFila(actualizada: TenantUsuarioMembresia): void {    this.personal.update((lista) =>
      lista.map((fila) =>
        fila.usuario_id === actualizada.usuario_id ? actualizada : fila,
      ),
    );
  }

  private cargarPersonal(): void {
    this.cargando.set(true);
    this.mensajeError.set(null);

    this.personalService
      .listar()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (personal) => {
          this.personal.set(
            [...personal].sort((a, b) => a.usuario_id - b.usuario_id),
          );
          this.cargando.set(false);
        },
        error: (error: unknown) => {
          this.personal.set([]);
          this.cargando.set(false);
          this.mensajeError.set(
            this.errores.mensajeDeError(error, 'personal/listar'),
          );
        },
      });
  }

  /** Roles y sucursales alimentan los selects; si fallan, se deshabilitan. */
  private cargarCatalogos(): void {
    this.catalogosCargando.set(true);
    this.errorCatalogos.set(null);

    let pendientes = 2;
    const finalizar = (): void => {
      pendientes -= 1;
      if (pendientes === 0) {
        this.catalogosCargando.set(false);
      }
    };

    this.rolesService
      .listarRoles()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (roles) => {
          this.roles.set(roles);
          finalizar();
        },
        error: (error: unknown) => {
          this.roles.set([]);
          this.errorCatalogos.set(
            this.errores.mensajeDeError(error, 'personal/roles'),
          );
          finalizar();
        },
      });

    this.sucursalesService
      .listar()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (sucursales) => {
          this.sucursales.set(sucursales);
          finalizar();
        },
        error: (error: unknown) => {
          this.sucursales.set([]);
          this.errorCatalogos.set(
            this.errores.mensajeDeError(error, 'personal/sucursales'),
          );
          finalizar();
        },
      });
  }

  // ============================== Validación =============================

  mensajeCorreo(): string | null {
    return mensajeDeControl(this.formAlta.controls.correo, {
      required: 'Ingresa el correo electrónico de la persona.',
      email: 'Ingresa un correo electrónico válido.',
      maxlength: 'El correo admite como máximo 150 caracteres.',
    });
  }

  mensajeNombres(): string | null {
    return mensajeDeControl(this.formAlta.controls.nombres, {
      required: 'Ingresa los nombres.',
      maxlength: 'Los nombres admiten como máximo 120 caracteres.',
    });
  }

  mensajeApellidos(): string | null {
    return mensajeDeControl(this.formAlta.controls.apellidos, {
      required: 'Ingresa los apellidos.',
      maxlength: 'Los apellidos admiten como máximo 120 caracteres.',
    });
  }

  mensajeCi(): string | null {
    return mensajeDeControl(this.formAlta.controls.ci, {
      required: 'Ingresa el documento de identidad.',
      maxlength: 'El documento admite como máximo 35 caracteres.',
    });
  }

  mensajeTelefono(): string | null {
    return mensajeDeControl(this.formAlta.controls.telefono, {
      maxlength: 'El teléfono admite como máximo 30 caracteres.',
    });
  }

  mensajeSucursal(): string | null {
    return mensajeDeControl(this.formAlta.controls.sucursal_id, {
      required: 'Selecciona la sucursal donde trabajará.',
      min: 'Selecciona una sucursal válida.',
    });
  }

  mensajeRol(): string | null {
    return mensajeDeControl(this.formAlta.controls.rol_id, {
      required: 'Selecciona el rol empresarial.',
      min: 'Selecciona un rol válido.',
    });
  }

  mensajeExpira(): string | null {
    return mensajeDeControl(this.formAlta.controls.expira_horas, {
      required: 'Indica las horas de vigencia de la invitación.',
      min: 'La invitación debe durar al menos 1 hora.',
      max: 'La invitación no puede durar más de 168 horas.',
    });
  }

  /** Lleva el foco al primer campo inválido del alta. */
  private enfocarPrimerError(): void {
    const candidatos: Array<[boolean, ElementRef<HTMLElement> | undefined]> = [
      [this.formAlta.controls.correo.invalid, this.correoInput()],
      [this.formAlta.controls.nombres.invalid, this.nombresInput()],
      [this.formAlta.controls.apellidos.invalid, this.apellidosInput()],
      [this.formAlta.controls.ci.invalid, this.ciInput()],
      [this.formAlta.controls.telefono.invalid, this.telefonoInput()],
      [this.formAlta.controls.sucursal_id.invalid, this.sucursalInput()],
      [this.formAlta.controls.rol_id.invalid, this.rolInput()],
      [this.formAlta.controls.expira_horas.invalid, this.expiraInput()],
    ];

    for (const [invalido, referencia] of candidatos) {
      if (invalido && referencia !== undefined) {
        referencia.nativeElement.focus();
        return;
      }
    }
  }
}

/** Normaliza un nombre de rol para compararlo (mayúsculas, sin espacios). */
function normalizarRol(rol: string | null | undefined): string {
  return (rol ?? '').trim().toUpperCase();
}

/** `true` si el valor es un entero >= 1 (horas de vigencia). */
function esEnteroPositivo(valor: unknown): valor is number {
  return typeof valor === 'number' && Number.isInteger(valor) && valor >= 1;
}

/** Lee un entero del `<select>` que disparó el evento. */
function leerEnteroDeSelect(evento: Event): number | null {
  const objetivo = evento.target;
  if (!(objetivo instanceof HTMLSelectElement)) {
    return null;
  }
  const valor = Number.parseInt(objetivo.value, 10);
  return Number.isFinite(valor) && valor > 0 ? valor : null;
}

/**
 * Devuelve el `<select>` al valor que tiene el servidor.
 *
 * Se usa cuando el PATCH falla: el control ya muestra la opción elegida y, sin
 * esta corrección, la fila quedaría mintiendo sobre el estado real.
 */
function restaurarSelect(evento: Event, valor: number | null): void {
  const objetivo = evento.target;
  if (objetivo instanceof HTMLSelectElement) {
    objetivo.value = valor === null ? '' : String(valor);
  }
}

/**
 * Copia usando la selección temporal de un `<textarea>`.
 *
 * Es el respaldo para navegadores sin `navigator.clipboard` o con permisos
 * denegados. Devuelve `false` si el navegador también bloquea `execCommand`.
 */
function copiarConSeleccion(texto: string): boolean {
  if (typeof document === 'undefined') {
    return false;
  }
  const area = document.createElement('textarea');
  area.value = texto;
  area.setAttribute('readonly', '');
  area.style.position = 'fixed';
  area.style.top = '-1000px';
  area.style.opacity = '0';
  document.body.appendChild(area);

  let copiado = false;
  try {
    area.select();
    copiado = document.execCommand('copy');
  } catch {
    copiado = false;
  } finally {
    document.body.removeChild(area);
  }
  return copiado;
}

/** Mensaje de error visible de un control (solo si ya fue tocado). */
function mensajeDeControl(
  control: AbstractControl,
  mensajes: Record<string, string>,
): string | null {
  if (control.untouched || !control.invalid) {
    return null;
  }
  for (const [clave, mensaje] of Object.entries(mensajes)) {
    if (control.hasError(clave)) {
      return mensaje;
    }
  }
  return 'Revisa este campo.';
}
