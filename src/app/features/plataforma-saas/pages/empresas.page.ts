import { CommonModule } from '@angular/common';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { Empresa, PlataformaSaasService } from '../services/plataforma-saas.service';

@Component({
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './empresas.page.html',
  styleUrl: './plataforma.css',
})
export class EmpresasPage {
  private readonly api = inject(PlataformaSaasService);
  private readonly destroyRef = inject(DestroyRef);

  readonly items = signal<Empresa[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly changingId = signal<number | null>(null);

  ngOnInit(): void { this.load(); }

  load(): void {
    this.loading.set(true);
    this.error.set('');
    this.api.empresas().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: empresas => {
        this.items.set(empresas);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('No fue posible cargar las empresas.');
        this.loading.set(false);
      },
    });
  }

  toggle(empresa: Empresa): void {
    if (this.changingId() !== null) return;
    this.changingId.set(empresa.id);
    this.error.set('');
    this.api.cambiarEmpresa(empresa.id, !empresa.estado)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.changingId.set(null);
          this.load();
        },
        error: () => {
          this.changingId.set(null);
          this.error.set('No fue posible cambiar el estado de la empresa.');
        },
      });
  }
}
