import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { forkJoin } from 'rxjs';

import { AuthService } from '../../../../autenticacion-seguridad/auth/services/auth.service';
import { ConfirmDialog } from '../../../../../shared/components/confirm-dialog/confirm-dialog';
import { RolFormDialog } from '../../components/rol-form-dialog/rol-form-dialog';
import {
  Accion,
  FuncionPermisos,
  ModuloPermisos,
  PermisoSeleccionado,
  RolPermisos,
  RolPermisosUpdate,
} from '../../models/permiso.model';
import { Rol, RolDetalle } from '../../models/rol.model';
import { RolesService } from '../../services/roles.service';
import {
  esRolAdministrador,
  humanizarCodigo,
  nombreRolAmigable,
} from '../../utils/humanizar.util';
import { traducirErrorRoles } from '../../utils/http-error.util';

/** Confirmación de habilitar/deshabilitar un rol. */
interface ConfirmacionEstadoRol {
  rol: Rol;
  habilitar: boolean;
}

/** Clave única de un permiso dentro de los conjuntos de estado. */
function clavePermiso(funcionId: number, accionId: number): string {
  return `${funcionId}:${accionId}`;
}

/** Compara dos conjuntos de claves sin importar el orden. */
function conjuntosIguales(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  if (a.size !== b.size) {
    return false;
  }
  for (const clave of a) {
    if (!b.has(clave)) {
      return false;
    }
  }
  return true;
}

/**
 * Pantalla Gestionar Roles y Permisos (CU04) - /admin/seguridad/roles-permisos.
 *
 * Layout de escritorio: lista de roles a la izquierda y matriz de permisos a la
 * derecha (agrupada por módulo). La matriz se construye íntegramente con la
 * información devuelta por GET /roles/catalogo-permisos y por
 * GET /roles/{id}/permisos; nunca se hardcodean ids.
 *
 * Al guardar se envía UN SOLO PUT /roles/{id}/permisos con toda la matriz.
 */
@Component({
  selector: 'app-roles-permisos-page',
  imports: [ConfirmDialog, RolFormDialog],
  styleUrls: ['./roles-permisos-page.css', './roles-permisos-page-matriz.css'],
  templateUrl: './roles-permisos-page.html',
})
export class RolesPermisosPage {
  private readonly rolesService = inject(RolesService);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly roles = signal<Rol[]>([]);
  readonly rolSeleccionado = signal<Rol | null>(null);
  readonly detalleRol = signal<RolDetalle | null>(null);
  readonly catalogo = signal<ModuloPermisos[]>([]);

  readonly cargandoRoles = signal(false);
  readonly cargandoMatriz = signal(false);
  readonly errorRoles = signal<string | null>(null);
  readonly errorMatriz = signal<string | null>(null);
  readonly mensajeExito = signal<string | null>(null);
  readonly guardando = signal(false);

  /** Permisos marcados en la matriz (estado de trabajo). */
  readonly seleccion = signal<Set<string>>(new Set());
  /** Permisos confirmados en el backend (estado guardado). */
  readonly permisosGuardados = signal<Set<string>>(new Set());

  readonly modulosAbiertos = signal<ReadonlySet<number>>(new Set());

  readonly dialogoRolAbierto = signal(false);
  readonly rolEditar = signal<RolDetalle | null>(null);
  readonly confirmacionGuardar = signal(false);
  readonly confirmacionEstado = signal<ConfirmacionEstadoRol | null>(null);
  readonly confirmacionDescartar = signal(false);
  readonly accionPendiente = signal<(() => void) | null>(null);

  /** true cuando la matriz tiene cambios no guardados. */
  readonly dirty = computed(
    () => !conjuntosIguales(this.seleccion(), this.permisosGuardados()),
  );

  /** El rol ADMINISTRADOR se muestra en solo lectura (backend lo valida). */
  readonly soloLectura = computed(() => {
    const rol = this.rolSeleccionado();
    return rol !== null && esRolAdministrador(rol.nombre);
  });

  /** Columnas de acción derivadas del catálogo (nunca fijas). */
  readonly columnas = computed<Accion[]>(() => {
    const orden: Accion[] = [];
    const vistos = new Set<number>();
    for (const modulo of this.catalogo()) {
      for (const funcion of modulo.funciones) {
        for (const accion of funcion.acciones) {
          if (!vistos.has(accion.id)) {
            vistos.add(accion.id);
            orden.push(accion);
          }
        }
      }
    }
    return orden;
  });

  /** Total de celdas posibles en la matriz. */
  readonly totalAcciones = computed(() => {
    let total = 0;
    for (const modulo of this.catalogo()) {
      for (const funcion of modulo.funciones) {
        total += funcion.acciones.length;
      }
    }
    return total;
  });

  /** Permisos actualmente marcados en la matriz. */
  readonly otorgadas = computed(() => this.seleccion().size);

  ngOnInit(): void {
    this.cargarInicial();
  }

  /** Etiquetas amigables (delegación para el template). */
  humanizar(nombre: string): string {
    return humanizarCodigo(nombre);
  }

  nombreRol(nombre: string): string {
    return nombreRolAmigable(nombre);
  }

  esRolAdministrador(nombre: string): boolean {
    return esRolAdministrador(nombre);
  }

  // ===== Carga inicial =====

  private cargarInicial(): void {
    this.cargandoRoles.set(true);
    this.errorRoles.set(null);
    this.mensajeExito.set(null);

    forkJoin({
      roles: this.rolesService.listarRoles(),
      catalogo: this.rolesService.obtenerCatalogoPermisos(),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ roles, catalogo }) => {
          this.cargandoRoles.set(false);
          this.roles.set(roles);
          this.catalogo.set(catalogo);
          this.abrirTodosModulos();
          if (roles.length > 0) {
            this.seleccionarRolDirecto(roles[0]);
          }
        },
        error: (error: unknown) => {
          this.cargandoRoles.set(false);
          this.manejarErrorComun(error, 'roles');
        },
      });
  }

  // ===== Selección de rol =====

  /** Solicita seleccionar un rol; si hay cambios sin guardar, pide confirmación. */
  solicitarSeleccionRol(rol: Rol): void {
    const actual = this.rolSeleccionado();
    const mismo = actual !== null && actual.id === rol.id;

    // Mismo rol con ediciones sin guardar: no hacer nada.
    if (mismo && this.dirty()) {
      return;
    }
    // Mismo rol ya cargado correctamente: no hace falta recargar.
    const cargadoOk =
      this.detalleRol() !== null && !this.errorMatriz() && !this.cargandoMatriz();
    if (mismo && cargadoOk) {
      return;
    }

    if (this.dirty()) {
      this.accionPendiente.set(() => this.seleccionarRolDirecto(rol));
      this.confirmacionDescartar.set(true);
      return;
    }
    this.seleccionarRolDirecto(rol);
  }

  /** Selección desde el <select> de móvil/tablet. */
  cambiarRolDesdeSelect(evento: Event): void {
    const select = evento.target as HTMLSelectElement;
    const id = Number(select.value);
    const rol = this.roles().find((r) => r.id === id);
    if (rol !== undefined) {
      this.solicitarSeleccionRol(rol);
    }
    // Devuelve el control al rol realmente seleccionado (por si se cancela).
    const actual = this.rolSeleccionado();
    select.value = actual !== null ? String(actual.id) : '';
  }

  private seleccionarRolDirecto(rol: Rol): void {
    this.rolSeleccionado.set(rol);
    this.detalleRol.set(null);
    this.errorMatriz.set(null);
    this.mensajeExito.set(null);
    this.seleccion.set(new Set());
    this.permisosGuardados.set(new Set());
    this.cargarDatosRol(rol.id);
  }

  private cargarDatosRol(rolId: number): void {
    this.cargandoMatriz.set(true);
    this.errorMatriz.set(null);

    forkJoin({
      detalle: this.rolesService.obtenerRol(rolId),
      permisos: this.rolesService.obtenerPermisosRol(rolId),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ detalle, permisos }) => {
          this.cargandoMatriz.set(false);
          this.detalleRol.set(detalle);
          this.rolSeleccionado.update((seleccionado) =>
            seleccionado !== null && seleccionado.id === detalle.id
              ? {
                  ...seleccionado,
                  nombre: detalle.nombre,
                  descripcion: detalle.descripcion,
                  estado: detalle.estado,
                }
              : seleccionado,
          );
          const otorgadas = this.otorgadasDePermisos(permisos);
          this.seleccion.set(otorgadas);
          this.permisosGuardados.set(otorgadas);
          this.abrirTodosModulos();
        },
        error: (error: unknown) => {
          this.cargandoMatriz.set(false);
          this.detalleRol.set(null);
          this.manejarErrorComun(error, 'matriz');
        },
      });
  }

  private otorgadasDePermisos(permisos: RolPermisos): Set<string> {
    const claves = new Set<string>();
    for (const modulo of permisos.modulos) {
      for (const funcion of modulo.funciones) {
        for (const accion of funcion.acciones) {
          if (accion.otorgada) {
            claves.add(clavePermiso(funcion.id, accion.id));
          }
        }
      }
    }
    return claves;
  }

  // ===== Confirmación al abandonar cambios sin guardar =====

  confirmarDescartar(): void {
    this.confirmacionDescartar.set(false);
    const accion = this.accionPendiente();
    this.accionPendiente.set(null);
    if (accion !== null) {
      accion();
    }
  }

  cancelarDescartar(): void {
    this.confirmacionDescartar.set(false);
    this.accionPendiente.set(null);
  }

  // ===== Crear / editar rol =====

  abrirNuevoRol(): void {
    const abrir = () => {
      this.rolEditar.set(null);
      this.dialogoRolAbierto.set(true);
    };
    if (this.dirty()) {
      this.accionPendiente.set(abrir);
      this.confirmacionDescartar.set(true);
      return;
    }
    abrir();
  }

  abrirEditarRol(): void {
    if (this.soloLectura()) {
      return;
    }
    const detalle = this.detalleRol();
    if (detalle === null) {
      return;
    }
    this.rolEditar.set(detalle);
    this.dialogoRolAbierto.set(true);
  }

  cerrarDialogoRol(): void {
    this.dialogoRolAbierto.set(false);
    this.rolEditar.set(null);
  }

  onRolGuardado(rol: Rol): void {
    const editando = this.rolEditar();
    this.dialogoRolAbierto.set(false);
    this.rolEditar.set(null);

    if (editando === null) {
      this.mensajeExito.set(
        `Rol "${this.nombreRol(rol.nombre)}" creado. Ahora puedes configurar su matriz de permisos.`,
      );
      this.roles.update((lista) => [...lista, rol]);
      this.seleccionarRolDirecto(rol);
      return;
    }

    this.roles.update((lista) =>
      lista.map((r) =>
        r.id === rol.id
          ? { ...r, nombre: rol.nombre, descripcion: rol.descripcion, estado: rol.estado }
          : r,
      ),
    );
    this.rolSeleccionado.update((seleccionado) =>
      seleccionado !== null && seleccionado.id === rol.id
        ? {
            ...seleccionado,
            nombre: rol.nombre,
            descripcion: rol.descripcion,
            estado: rol.estado,
          }
        : seleccionado,
    );
    this.detalleRol.update((detalle) =>
      detalle !== null && detalle.id === rol.id
        ? {
            ...detalle,
            nombre: rol.nombre,
            descripcion: rol.descripcion,
            estado: rol.estado,
          }
        : detalle,
    );
    this.mensajeExito.set('Rol actualizado correctamente.');
  }

  // ===== Habilitar / deshabilitar =====

  solicitarCambioEstado(): void {
    const rol = this.rolSeleccionado();
    if (rol === null || this.soloLectura() || this.guardando() || this.cargandoMatriz()) {
      return;
    }
    this.confirmacionEstado.set({ rol, habilitar: !rol.estado });
  }

  cancelarCambioEstado(): void {
    this.confirmacionEstado.set(null);
  }

  confirmarCambioEstado(): void {
    const pendiente = this.confirmacionEstado();
    this.confirmacionEstado.set(null);
    if (pendiente === null) {
      return;
    }

    const { rol, habilitar } = pendiente;
    this.guardando.set(true);
    this.errorMatriz.set(null);
    this.mensajeExito.set(null);

    this.rolesService
      .cambiarEstadoRol(rol.id, habilitar)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (actualizado) => {
          this.guardando.set(false);
          this.actualizarRolEnEstadoLocal(actualizado);
          this.mensajeExito.set(
            habilitar
              ? `El rol "${this.nombreRol(actualizado.nombre)}" fue habilitado.`
              : `El rol "${this.nombreRol(actualizado.nombre)}" fue deshabilitado.`,
          );
        },
        error: (error: unknown) => {
          this.guardando.set(false);
          this.manejarErrorComun(error, 'matriz');
        },
      });
  }

  private actualizarRolEnEstadoLocal(rol: Rol): void {
    const datos = { nombre: rol.nombre, descripcion: rol.descripcion, estado: rol.estado };
    this.roles.update((lista) => lista.map((r) => (r.id === rol.id ? { ...r, ...datos } : r)));
    this.rolSeleccionado.update((seleccionado) =>
      seleccionado !== null && seleccionado.id === rol.id
        ? { ...seleccionado, ...datos }
        : seleccionado,
    );
    this.detalleRol.update((detalle) =>
      detalle !== null && detalle.id === rol.id ? { ...detalle, ...datos } : detalle,
    );
  }

  // ===== Matriz de permisos =====

  estaOtorgada(funcionId: number, accionId: number): boolean {
    return this.seleccion().has(clavePermiso(funcionId, accionId));
  }

  alternarAccion(funcionId: number, accionId: number): void {
    this.actualizarSeleccion((claves) => {
      const siguiente = new Set(claves);
      const clave = clavePermiso(funcionId, accionId);
      if (siguiente.has(clave)) {
        siguiente.delete(clave);
      } else {
        siguiente.add(clave);
      }
      return siguiente;
    });
  }

  alternarFuncion(funcion: FuncionPermisos): void {
    this.actualizarSeleccion((claves) => {
      const siguiente = new Set(claves);
      const completa = this.funcionCompleta(funcion);
      for (const accion of funcion.acciones) {
        const clave = clavePermiso(funcion.id, accion.id);
        if (completa) {
          siguiente.delete(clave);
        } else {
          siguiente.add(clave);
        }
      }
      return siguiente;
    });
  }

  alternarModulo(modulo: ModuloPermisos): void {
    this.actualizarSeleccion((claves) => {
      const siguiente = new Set(claves);
      const completo = this.moduloCompleto(modulo);
      for (const funcion of modulo.funciones) {
        for (const accion of funcion.acciones) {
          const clave = clavePermiso(funcion.id, accion.id);
          if (completo) {
            siguiente.delete(clave);
          } else {
            siguiente.add(clave);
          }
        }
      }
      return siguiente;
    });
  }

  private actualizarSeleccion(
    transformar: (actual: ReadonlySet<string>) => Set<string>,
  ): void {
    if (this.soloLectura() || this.cargandoMatriz() || this.guardando()) {
      return;
    }
    this.errorMatriz.set(null);
    this.seleccion.set(transformar(this.seleccion()));
  }

  funcionCompleta(funcion: FuncionPermisos): boolean {
    return funcion.acciones.every((accion) => this.estaOtorgada(funcion.id, accion.id));
  }

  funcionParcial(funcion: FuncionPermisos): boolean {
    const marcadas = funcion.acciones.filter((accion) =>
      this.estaOtorgada(funcion.id, accion.id),
    ).length;
    return marcadas > 0 && marcadas < funcion.acciones.length;
  }

  moduloCompleto(modulo: ModuloPermisos): boolean {
    return modulo.funciones.every((funcion) => this.funcionCompleta(funcion));
  }

  moduloParcial(modulo: ModuloPermisos): boolean {
    return !this.moduloCompleto(modulo) && this.otorgadasModulo(modulo) > 0;
  }

  otorgadasModulo(modulo: ModuloPermisos): number {
    let total = 0;
    for (const funcion of modulo.funciones) {
      for (const accion of funcion.acciones) {
        if (this.estaOtorgada(funcion.id, accion.id)) {
          total += 1;
        }
      }
    }
    return total;
  }

  accionesModulo(modulo: ModuloPermisos): number {
    return modulo.funciones.reduce((acumulado, funcion) => {
      return acumulado + funcion.acciones.length;
    }, 0);
  }

  moduloAbierto(id: number): boolean {
    return this.modulosAbiertos().has(id);
  }

  alternarModuloAbierto(id: number): void {
    this.modulosAbiertos.update((actual) => {
      const siguiente = new Set(actual);
      if (siguiente.has(id)) {
        siguiente.delete(id);
      } else {
        siguiente.add(id);
      }
      return siguiente;
    });
  }

  private abrirTodosModulos(): void {
    this.modulosAbiertos.set(new Set(this.catalogo().map((modulo) => modulo.id)));
  }

  // ===== Guardar / descartar matriz =====

  solicitarGuardarPermisos(): void {
    if (!this.dirty() || this.soloLectura() || this.guardando() || this.cargandoMatriz()) {
      return;
    }
    this.confirmacionGuardar.set(true);
  }

  cancelarGuardarPermisos(): void {
    this.confirmacionGuardar.set(false);
  }

  confirmarGuardarPermisos(): void {
    const rol = this.rolSeleccionado();
    this.confirmacionGuardar.set(false);
    if (rol === null) {
      return;
    }

    const payload = this.construirPayloadPermisos();
    this.guardando.set(true);
    this.errorMatriz.set(null);
    this.mensajeExito.set(null);

    this.rolesService
      .guardarPermisosRol(rol.id, payload)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.guardando.set(false);
          this.permisosGuardados.set(new Set(this.seleccion()));
          this.mensajeExito.set(
            `Matriz de permisos de "${this.nombreRol(rol.nombre)}" actualizada correctamente.`,
          );
        },
        error: (error: unknown) => {
          this.guardando.set(false);
          this.manejarErrorComun(error, 'matriz');
        },
      });
  }

  descartarCambios(): void {
    if (!this.dirty() || this.guardando()) {
      return;
    }
    this.seleccion.set(new Set(this.permisosGuardados()));
    this.errorMatriz.set(null);
    this.mensajeExito.set(null);
  }

  private construirPayloadPermisos(): RolPermisosUpdate {
    const items: PermisoSeleccionado[] = [];
    for (const clave of this.seleccion()) {
      const partes = clave.split(':');
      const funcionId = Number(partes[0]);
      const accionId = Number(partes[1]);
      if (Number.isInteger(funcionId) && Number.isInteger(accionId)) {
        items.push({ funcion_id: funcionId, accion_id: accionId });
      }
    }
    items.sort((a, b) => a.funcion_id - b.funcion_id || a.accion_id - b.accion_id);
    return { permisos: items };
  }

  // ===== Errores =====

  private manejarErrorComun(error: unknown, destino: 'roles' | 'matriz'): void {
    const traducido = traducirErrorRoles(error);
    if (traducido.sesionExpirada) {
      this.authService.cerrarSesion();
      void this.router.navigateByUrl('/auth/personal/login');
      return;
    }
    if (destino === 'roles') {
      this.errorRoles.set(traducido.mensaje);
      return;
    }
    this.errorMatriz.set(traducido.mensaje);
  }
}
