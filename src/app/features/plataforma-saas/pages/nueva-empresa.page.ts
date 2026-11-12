import { CommonModule } from '@angular/common';
import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { Plan, PlataformaSaasService } from '../services/plataforma-saas.service';

@Component({
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './nueva-empresa.page.html',
  styleUrl: './plataforma.css',
})
export class NuevaEmpresaPage {
  readonly fb = inject(FormBuilder);
  private readonly api = inject(PlataformaSaasService);
  readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly planes = signal<Plan[]>([]);
  readonly planesActivos = computed(() => this.planes().filter(p => p.estado));
  readonly loadingPlanes = signal(true);
  readonly errorPlanes = signal('');
  readonly error = signal('');
  readonly loading = signal(false);

  readonly form = this.fb.nonNullable.group({
    razon_social: ['', Validators.required],
    nombre_comercial: ['', Validators.required],
    slug: ['', [Validators.required, Validators.pattern('^[a-z0-9]+(-[a-z0-9]+)*$')]],
    nit: [''],
    correo_contacto: ['', Validators.email],
    telefono: [''],
    plan_id: [0, Validators.min(1)],
    fecha_inicio: ['', Validators.required],
    fecha_vencimiento: ['', Validators.required],
  });

  ngOnInit(): void { this.loadPlanes(); }

  loadPlanes(): void {
    this.loadingPlanes.set(true);
    this.errorPlanes.set('');
    this.api.planes().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: planes => {
        this.planes.set(planes);
        this.loadingPlanes.set(false);
      },
      error: () => {
        this.errorPlanes.set('No fue posible cargar los planes activos.');
        this.loadingPlanes.set(false);
      },
    });
  }

  submit(): void {
    if (this.form.invalid || this.loading() || this.loadingPlanes() || this.errorPlanes()) {
      this.form.markAllAsTouched();
      return;
    }
    this.loading.set(true);
    this.error.set('');
    this.api.crearEmpresa(this.form.getRawValue())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => { void this.router.navigateByUrl('/plataforma/empresas'); },
        error: e => {
          this.loading.set(false);
          this.error.set(e.status === 409
            ? 'El slug ya está registrado.'
            : 'No fue posible registrar la empresa.');
        },
      });
  }
}
