import { CommonModule } from '@angular/common';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Plan, PlataformaSaasService } from '../services/plataforma-saas.service';

@Component({
  standalone: true,
  imports: [CommonModule],
  templateUrl: './planes.page.html',
  styleUrl: './plataforma.css',
})
export class PlanesPage {
  private readonly api = inject(PlataformaSaasService);
  private readonly destroyRef = inject(DestroyRef);

  readonly items = signal<Plan[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly changingId = signal<number | null>(null);

  ngOnInit(): void { this.load(); }

  load(): void {
    this.loading.set(true);
    this.error.set('');
    this.api.planes().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: planes => {
        this.items.set(planes);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('No fue posible cargar los planes SaaS.');
        this.loading.set(false);
      },
    });
  }

  toggle(plan: Plan): void {
    if (this.changingId() !== null) return;
    this.changingId.set(plan.id);
    this.error.set('');
    this.api.cambiarPlan(plan.id, !plan.estado)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.changingId.set(null);
          this.load();
        },
        error: e => {
          this.changingId.set(null);
          this.error.set(e.status === 409
            ? 'No se puede desactivar un plan con suscripciones activas.'
            : 'No fue posible cambiar el estado del plan.');
        },
      });
  }
}
