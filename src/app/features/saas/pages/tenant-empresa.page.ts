import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, OnInit, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';

import {
  TenantApiService,
  TenantMiembro,
  TenantRol,
  TenantSucursal,
} from '../services/tenant-api.service';

@Component({
  selector: 'app-saas-tenant-empresa',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './tenant-empresa.page.html',
  styleUrl: './saas-pages.css',
})
export class TenantEmpresaPage implements OnInit {
  readonly api = inject(TenantApiService);
  private readonly router = inject(Router);
  readonly cargando = signal(true);
  readonly procesando = signal(false);
  readonly error = signal('');
  readonly exito = signal('');
  readonly sucursales = signal<TenantSucursal[]>([]);
  readonly usuarios = signal<TenantMiembro[]>([]);
  readonly roles = signal<TenantRol[]>([]);

  readonly formSucursal = new FormGroup({
    ciudad_id: new FormControl<number | null>(null, {
      validators: [Validators.required, Validators.min(1)],
    }),
    nombre: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(120)],
    }),
    direccion: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(255)],
    }),
    telefono: new FormControl('', { nonNullable: true }),
  });

  ngOnInit(): void {
    this.api.me().subscribe({
      next: (user) => {
        if (user.contexto !== 'personal' || user.rol !== 'ADMINISTRADOR') {
          this.denegar();
          return;
        }
        this.cargar();
      },
      error: () => this.denegar(),
    });
  }

  cargar(): void {
    this.cargando.set(true);
    this.error.set('');
    forkJoin({
      sucursales: this.api.sucursales(),
      usuarios: this.api.miembros(),
      roles: this.api.roles(),
    }).subscribe({
      next: (data) => {
        this.sucursales.set(data.sucursales);
        this.usuarios.set(data.usuarios);
        this.roles.set(data.roles);
        this.cargando.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.cargando.set(false);
        this.error.set(this.mensaje(err));
        if (err.status === 401 || err.status === 403) this.denegar();
      },
    });
  }

  registrarSucursal(): void {
    this.formSucursal.markAllAsTouched();
    if (this.procesando() || this.formSucursal.invalid) return;
    const data = this.formSucursal.getRawValue();
    this.operar(() => this.api.crearSucursal({
      ciudad_id: Number(data.ciudad_id),
      nombre: data.nombre.trim(),
      direccion: data.direccion.trim(),
      telefono: data.telefono.trim() || null,
    }), 'Sucursal registrada.');
  }

  estadoSucursal(row: TenantSucursal): void {
    if (!window.confirm('¿Cambiar el estado de esta sucursal?')) return;
    this.operar(() => this.api.cambiarEstadoSucursal(row.id, !row.estado),
      'Estado de sucursal actualizado.');
  }

  estadoUsuario(row: TenantMiembro): void {
    if (row.usuario_id === this.api.identidad()?.usuario_id) return;
    if (!window.confirm('¿Cambiar el acceso de este miembro a la empresa?')) return;
    this.operar(() => this.api.cambiarEstadoMiembro(row.usuario_id, !row.membresia_activa),
      'Membresía empresarial actualizada.');
  }

  cambiarRol(row: TenantMiembro, event: Event): void {
    if (row.usuario_id === this.api.identidad()?.usuario_id) return;
    const target = event.target as HTMLSelectElement;
    const rolId = Number(target.value);
    if (!Number.isInteger(rolId) || rolId < 1 || rolId === row.rol_id) return;
    if (!window.confirm('¿Asignar este rol dentro de la empresa?')) {
      target.value = String(row.rol_id);
      return;
    }
    this.operar(() => this.api.cambiarRol(row.usuario_id, rolId),
      'Rol empresarial actualizado.');
  }

  salir(): void {
    this.api.cerrarSesion();
    void this.router.navigateByUrl('/saas/ingresar');
  }

  private denegar(): void {
    this.api.cerrarSesion();
    this.cargando.set(false);
    void this.router.navigateByUrl('/saas/ingresar');
  }

  private operar<T>(accion: () => import('rxjs').Observable<T>,mensaje: string): void {
    if (this.procesando()) return;
    this.procesando.set(true);
    this.error.set('');
    this.exito.set('');
    accion().subscribe({
      next: () => {
        this.exito.set(mensaje);
        this.procesando.set(false);
        this.cargar();
      },
      error: (err: HttpErrorResponse) => {
        this.procesando.set(false);
        this.error.set(this.mensaje(err));
      },
    });
  }

  private mensaje(err: HttpErrorResponse): string {
    if (err.status === 409) return 'Operación rechazada por restricciones de la empresa, plan o último administrador.';
    if (err.status === 401 || err.status === 403) return 'No tienes autorización o tu membresía fue revocada.';
    if (err.status === 422) return 'Revisa los datos y restricciones antes de guardar.';
    if (err.status === 503) return 'La administración SaaS no está disponible en el servidor.';
    return 'No se pudo completar la operación en el servidor.';
  }
}
