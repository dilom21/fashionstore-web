import { CommonModule } from '@angular/common';
import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { forkJoin } from 'rxjs';
import { Empresa, Plan, PlataformaSaasService } from '../services/plataforma-saas.service';

@Component({
  standalone: true,
  imports: [CommonModule],
  templateUrl: './dashboard.page.html',
  styleUrl: './plataforma.css',
})
export class PlataformaDashboardPage {
  private readonly api = inject(PlataformaSaasService);
  private readonly destroyRef = inject(DestroyRef);

  readonly loading = signal(true);
  readonly error = signal('');
  readonly empresas = signal<Empresa[]>([]);
  readonly planes = signal<Plan[]>([]);
  readonly empresasTotal = computed(() => this.empresas().length);
  readonly empresasActivas = computed(() => this.empresas().filter(e => e.estado).length);
  readonly planesTotal = computed(() => this.planes().length);
  readonly planesActivos = computed(() => this.planes().filter(p => p.estado).length);

  ngOnInit(): void { this.load(); }

  load(): void {
    this.loading.set(true);
    this.error.set('');
    forkJoin({ empresas: this.api.empresas(), planes: this.api.planes() })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ empresas, planes }) => {
          this.empresas.set(empresas);
          this.planes.set(planes);
          this.loading.set(false);
        },
        error: () => {
          this.error.set('No fue posible cargar las métricas globales. Intenta nuevamente.');
          this.loading.set(false);
        },
      });
  }
}
