import { CommonModule } from '@angular/common';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { PlataformaSaasService } from '../services/plataforma-saas.service';

@Component({
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './login.page.html',
  styleUrl: './plataforma.css',
})
export class PlataformaLoginPage {
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(PlataformaSaasService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  readonly loading = signal(false);
  readonly error = signal('');

  readonly form = this.fb.nonNullable.group({
    usuario: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(8)]],
  });

  submit(): void {
    if (this.form.invalid || this.loading()) {
      this.form.markAllAsTouched();
      return;
    }
    this.loading.set(true);
    this.error.set('');
    const { usuario, password } = this.form.getRawValue();
    this.api.login(usuario, password)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => { void this.router.navigateByUrl('/plataforma'); },
        error: e => {
          this.loading.set(false);
          this.error.set(e.status === 429
            ? 'Demasiados intentos. Intenta nuevamente más tarde.'
            : e.status === 503
              ? 'El acceso de plataforma no está habilitado en este entorno.'
              : 'Usuario o contraseña inválidos.');
        },
      });
  }
}
