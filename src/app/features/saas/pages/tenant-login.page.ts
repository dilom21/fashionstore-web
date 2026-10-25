import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

import { TenantApiService } from '../services/tenant-api.service';

@Component({
  selector: 'app-saas-tenant-login',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './tenant-login.page.html',
  styleUrl: './saas-pages.css',
})
export class TenantLoginPage {
  private readonly api = inject(TenantApiService);
  private readonly router = inject(Router);
  readonly enviando = signal(false);
  readonly error = signal('');

  readonly form = new FormGroup({
    empresa_slug: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.pattern(/^[a-z0-9]+(-[a-z0-9]+)*$/)],
    }),
    correo: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.email],
    }),
    password: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required],
    }),
  });

  ingresar(): void {
    if (this.enviando()) return;
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    this.error.set('');
    this.enviando.set(true);
    this.api.login({ ...this.form.getRawValue(), contexto: 'personal' }).subscribe({
      next: () => this.api.me().subscribe({
        next: (identidad) => {
          this.enviando.set(false);
          if (identidad.contexto !== 'personal' || identidad.rol !== 'ADMINISTRADOR') {
            this.api.cerrarSesion();
            this.error.set('Esta cuenta no es administradora de la empresa.');
            return;
          }
          void this.router.navigateByUrl('/saas/empresa');
        },
        error: (err: HttpErrorResponse) => {
          this.api.cerrarSesion();
          this.enviando.set(false);
          this.error.set(this.mensaje(err));
        },
      }),
      error: (err: HttpErrorResponse) => {
        this.enviando.set(false);
        this.error.set(this.mensaje(err));
      },
    });
  }

  private mensaje(err: HttpErrorResponse): string {
    if (err.status === 503) return 'El servicio SaaS todavía no está habilitado en el servidor.';
    if (err.status === 401 || err.status === 403) return 'Credenciales o empresa incorrectas, o acceso revocado.';
    return 'No se pudo completar el ingreso. Comprueba la conexión con el servidor.';
  }
}
