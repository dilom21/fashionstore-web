import { CommonModule } from '@angular/common';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Empresa, PlataformaSaasService } from '../services/plataforma-saas.service';

@Component({
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './primer-administrador.page.html',
  styleUrl: './plataforma.css',
})
export class PrimerAdministradorPage {
  readonly fb = inject(FormBuilder);
  private readonly api = inject(PlataformaSaasService);
  private readonly route = inject(ActivatedRoute);
  readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly empresa = signal<Empresa | undefined>(undefined);
  readonly loadingEmpresa = signal(true);
  readonly error = signal('');
  readonly ok = signal('');
  readonly loading = signal(false);

  readonly form = this.fb.nonNullable.group({
    correo: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(8)]],
    nombres: ['', Validators.required],
    apellidos: ['', Validators.required],
    ci: ['', Validators.required],
    ciudad_id: [0, [Validators.required, Validators.min(1)]],
    nombre_sucursal: ['', Validators.required],
    direccion_sucursal: ['', Validators.required],
    telefono: [''],
  });

  ngOnInit(): void { this.loadEmpresa(); }

  loadEmpresa(): void {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    this.loadingEmpresa.set(true);
    this.error.set('');
    this.api.empresas().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: empresas => {
        this.empresa.set(empresas.find(x => x.id === id));
        this.loadingEmpresa.set(false);
        if (!this.empresa()) this.error.set('No se encontró la empresa seleccionada.');
      },
      error: () => {
        this.loadingEmpresa.set(false);
        this.error.set('No fue posible consultar la empresa.');
      },
    });
  }

  submit(): void {
    const empresa = this.empresa();
    if (!empresa || this.form.invalid || this.loading()) {
      this.form.markAllAsTouched();
      return;
    }
    this.loading.set(true);
    this.error.set('');
    this.ok.set('');
    this.api.crearAdministrador(empresa.id, this.form.getRawValue())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.loading.set(false);
          this.ok.set('Administrador inicial creado correctamente. La contraseña no se almacena en el navegador.');
          this.form.reset({
            correo: '', password: '', nombres: '', apellidos: '', ci: '', ciudad_id: 0,
            nombre_sucursal: '', direccion_sucursal: '', telefono: '',
          });
        },
        error: e => {
          this.loading.set(false);
          this.error.set(e.status === 409
            ? 'La empresa ya tiene administrador inicial o existe un conflicto.'
            : e.status === 422
              ? 'Revisa los campos enviados.'
              : e.status === 401 || e.status === 403
                ? 'La sesión de plataforma no autoriza esta operación.'
                : 'No fue posible crear el administrador.');
        },
      });
  }
}
