import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { forkJoin } from 'rxjs';

import { TenantPromotion, TenantSeason } from '../../models/t05-t06.models';
import { SaasT05T06Service } from '../../services/saas-t05-t06.service';

@Component({
  selector: 'app-saas-merchandising-page', imports: [ReactiveFormsModule],
  templateUrl: './saas-merchandising.page.html', styleUrl: './saas-merchandising.page.css',
})
export class SaasMerchandisingPage {
  private readonly api = inject(SaasT05T06Service);
  private readonly destroyRef = inject(DestroyRef);
  readonly seasons = signal<TenantSeason[]>([]);
  readonly promotions = signal<TenantPromotion[]>([]);
  readonly error = signal<string | null>(null);
  readonly saving = signal(false);
  readonly seasonForm = new FormGroup({
    nombre: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    fecha_inicio: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    fecha_fin: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
  });
  readonly promotionForm = new FormGroup({
    nombre: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    descripcion: new FormControl('', { nonNullable: true }),
    tipo_descuento: new FormControl<'PORCENTAJE' | 'MONTO'>('PORCENTAJE', { nonNullable: true }),
    valor_descuento: new FormControl('10', { nonNullable: true, validators: [Validators.required] }),
    fecha_inicio: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    fecha_fin: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
  });

  constructor() { this.load(); }

  load(): void {
    forkJoin({ seasons: this.api.seasons(), promotions: this.api.promotions() })
      .pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
        next: ({ seasons, promotions }) => { this.seasons.set(seasons); this.promotions.set(promotions); },
        error: () => this.error.set('No fue posible cargar la planificación comercial.'),
      });
  }

  createSeason(): void {
    if (this.seasonForm.invalid || this.saving()) return;
    this.saving.set(true); this.error.set(null);
    this.api.createSeason(this.seasonForm.getRawValue()).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (item) => { this.seasons.update((items) => [item, ...items]); this.seasonForm.reset(); this.saving.set(false); },
      error: () => { this.error.set('No fue posible crear la temporada.'); this.saving.set(false); },
    });
  }

  createPromotion(): void {
    if (this.promotionForm.invalid || this.saving()) return;
    const value = this.promotionForm.getRawValue();
    this.saving.set(true); this.error.set(null);
    this.api.createPromotion({ ...value, descripcion: value.descripcion || null, valor_descuento: value.valor_descuento })
      .pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
        next: (item) => { this.promotions.update((items) => [item, ...items]); this.promotionForm.reset({ tipo_descuento: 'PORCENTAJE', valor_descuento: '10' }); this.saving.set(false); },
        error: () => { this.error.set('No fue posible crear la promoción.'); this.saving.set(false); },
      });
  }
}
