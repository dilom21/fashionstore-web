import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

import { AuthService } from '../../../../autenticacion-seguridad/auth/services/auth.service';
import { ConfirmDialog } from '../../../../../shared/components/confirm-dialog/confirm-dialog';
import { Sucursal } from '../../../inventario/models/sucursal.model';
import { SucursalesService } from '../../../inventario/services/sucursales.service';
import { Usuario } from '../../models/usuario.model';
import { Rol } from '../../../roles-permisos/models/rol.model';
import { RolesService } from '../../../roles-permisos/services/roles.service';
import { UsuariosService } from '../../services/usuarios.service';
import { traducirErrorHttp } from '../../utils/http-error.util';

/** Acción de habilitar/deshabilitar pendiente de confirmación. */
interface ConfirmacionEstado {
  usuario: Usuario;
  habilitar: boolean;
}

/**
 * Listado de usuarios (CU03) - /admin/usuarios.
 *
 * Muestra los usuarios internos con búsqueda y filtros (rol, estado,
 * sucursal), y permite registrar, consultar, editar, habilitar o deshabilitar.
 * Los catálogos de rol y sucursal se cargan desde API real.
 */
@Component({
  selector: 'app-usuarios-page',
  imports: [ReactiveFormsModule, RouterLink, ConfirmDialog],
  styleUrl: './usuarios-page.css',
  templateUrl: './usuarios-page.html',
})
export class UsuariosPage {
  private readonly usuariosService = inject(UsuariosService);
  private readonly rolesService = inject(RolesService);
  private readonly sucursalesService = inject(SucursalesService);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly usuarios = signal<Usuario[]>([]);
  readonly roles = signal<Rol[]>([]);
  readonly sucursales = signal<Sucursal[]>([]);

  readonly cargando = signal(false);
  readonly cargandoCatalogos = signal(false);
  readonly errorLista = signal<string | null>(null);
  readonly errorCatalogos = signal<string | null>(null);
  readonly mensajeExito = signal<string | null>(null);
  readonly procesandoId = signal<number | null>(null);
  readonly confirmacion = signal<ConfirmacionEstado | null>(null);

  readonly filtros = new FormGroup({
    buscar: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(150)] }),
    rolId: new FormControl<number | null>({
      value: null,
      disabled: true,
    }),
    estado: new FormControl<'activos' | 'inactivos' | ''>(''),
    sucursalId: new FormControl<number | null>(null),
  });

  constructor() {
    this.filtros.controls.rolId.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.cargarUsuarios());
    this.filtros.controls.estado.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.cargarUsuarios());
    this.filtros.controls.sucursalId.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.cargarUsuarios());
  }

  ngOnInit(): void {
    this.cargarCatalogos();
    this.cargarUsuarios();
  }

  /** Devuelve el id del administrador autenticado (para proteger auto-deshabilitación). */
  esMiCuenta(usuario: Usuario): boolean {
    return usuario.id === this.authService.usuarioActual()?.id;
  }

  buscar(): void {
    this.cargarUsuarios();
  }

  limpiarFiltros(): void {
    this.filtros.reset(
      { buscar: '', rolId: null, estado: '', sucursalId: null },
      { emitEvent: false },
    );
    this.cargarUsuarios();
  }

  nombreEmpleado(usuario: Usuario): string {
    if (!usuario.empleado) {
      return '—';
    }
    return `${usuario.empleado.nombres} ${usuario.empleado.apellidos}`.trim();
  }

  sucursalEmpleado(usuario: Usuario): string {
    return usuario.empleado?.sucursal?.nombre ?? '—';
  }

  tieneFiltrosActivos(): boolean {
    const { buscar, rolId, estado, sucursalId } = this.filtros.getRawValue();
    return Boolean(buscar.trim() || rolId || estado || sucursalId);
  }

  solicitarCambioEstado(usuario: Usuario): void {
    if (this.procesandoId() !== null) {
      return;
    }
    if (usuario.estado && this.esMiCuenta(usuario)) {
      return;
    }
    this.confirmacion.set({ usuario, habilitar: !usuario.estado });
  }

  cancelarConfirmacion(): void {
    this.confirmacion.set(null);
  }

  confirmarCambioEstado(): void {
    const pendiente = this.confirmacion();
    this.confirmacion.set(null);
    if (pendiente === null) {
      return;
    }

    const { usuario, habilitar } = pendiente;
    const accion = habilitar ? 'habilitó' : 'deshabilitó';
    this.procesandoId.set(usuario.id);
    this.errorLista.set(null);
    this.mensajeExito.set(null);

    this.usuariosService
      .cambiarEstadoUsuario(usuario.id, habilitar)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.procesandoId.set(null);
          this.mensajeExito.set(`Se ${accion} la cuenta de ${usuario.correo}.`);
          this.cargarUsuarios();
        },
        error: (error: unknown) => {
          this.procesandoId.set(null);
          this.manejarError(error, 'lista');
        },
      });
  }

  private cargarUsuarios(): void {
    this.cargando.set(true);
    this.errorLista.set(null);

    const valores = this.filtros.getRawValue();
    this.usuariosService
      .listarUsuarios({
        buscar: valores.buscar || undefined,
        rol_id: valores.rolId ?? undefined,
        estado:
          valores.estado === 'activos'
            ? true
            : valores.estado === 'inactivos'
              ? false
              : undefined,
        sucursal_id: valores.sucursalId ?? undefined,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (respuesta) => {
          this.cargando.set(false);
          this.usuarios.set(respuesta.items);
        },
        error: (error: unknown) => {
          this.cargando.set(false);
          this.usuarios.set([]);
          this.manejarError(error, 'lista');
        },
      });
  }

  private cargarCatalogos(): void {
  this.cargandoCatalogos.set(true);
  this.errorCatalogos.set(null);
  this.actualizarEstadoFiltroRol();

  const roles$ = this.rolesService.listarRolesAsignablesInternos();
  const sucursales$ = this.sucursalesService.listarSucursalesActivas();

  roles$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
    next: (roles) => {
      this.roles.set(roles);
      this.actualizarEstadoFiltroRol();
    },
    error: (error: unknown) => {
      this.actualizarEstadoFiltroRol();
      this.manejarError(error, 'catalogos');
    },
  });

  sucursales$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
    next: (sucursales) => {
      this.sucursales.set(sucursales);
      this.cargandoCatalogos.set(false);
      this.actualizarEstadoFiltroRol();
    },
    error: (error: unknown) => {
      this.cargandoCatalogos.set(false);
      this.actualizarEstadoFiltroRol();
      this.manejarError(error, 'catalogos');
    },
  });
}

  private manejarError(error: unknown, destino: 'lista' | 'catalogos'): void {
    const traducido = traducirErrorHttp(error);
    if (traducido.sesionExpirada) {
      this.authService.cerrarSesion();
      void this.router.navigateByUrl('/auth/personal/login');
      return;
    }
    if (destino === 'catalogos') {
      this.errorCatalogos.set(traducido.mensaje);
      return;
    }
    this.errorLista.set(traducido.mensaje);
  }

  private actualizarEstadoFiltroRol(): void {
  const control = this.filtros.controls.rolId;

    if (this.cargandoCatalogos() || this.roles().length === 0) {
      control.disable({ emitEvent: false });
    } else {
      control.enable({ emitEvent: false });
    }
  }

}
