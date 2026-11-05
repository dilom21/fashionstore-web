import { DecimalPipe } from '@angular/common';
import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';

import { TenantDynamicReport, TenantGeneratedReport, TenantMLReport, TenantReportSummary } from '../../models/t05-t06.models';
import { SaasSessionService } from '../../services/saas-session.service';
import { SaasT05T06Service } from '../../services/saas-t05-t06.service';

@Component({
  selector: 'app-saas-reportes-page',
  imports: [DecimalPipe, ReactiveFormsModule],
  templateUrl: './saas-reportes.page.html',
  styleUrl: './saas-reportes.page.css',
})
export class SaasReportesPage {
  private readonly api = inject(SaasT05T06Service);
  private readonly session = inject(SaasSessionService);
  private readonly destroyRef = inject(DestroyRef);
  readonly allowsAi = computed(() => this.session.sesion()?.permite_reportes_ia === true);
  readonly form = new FormGroup({
    fecha_desde: new FormControl('', { nonNullable: true }),
    fecha_hasta: new FormControl('', { nonNullable: true }),
    tipo: new FormControl('ventas', { nonNullable: true }),
  });
  readonly summary = signal<TenantReportSummary | null>(null);
  readonly generated = signal<TenantGeneratedReport | null>(null);
  readonly loading = signal(false);
  readonly generating = signal(false);
  readonly error = signal<string | null>(null);
  readonly dynamic = signal<TenantDynamicReport | null>(null);
  readonly ml = signal<TenantMLReport | null>(null);
  readonly question = new FormControl('', { nonNullable: true });
  readonly reportTypes = [
    { value: 'ventas', label: 'Ventas' }, { value: 'inventario', label: 'Inventario' },
    { value: 'reservas', label: 'Reservas' }, { value: 'clientes', label: 'Clientes y productos' },
  ] as const;
  readonly exporting = signal(false);
  readonly chartBars = computed(() => {
    const series = this.dynamic()?.serie ?? [];
    const values = series.map((point) => Number(point.value) || 0);
    const maximum = Math.max(...values, 1);
    return series.map((point, index) => ({ label: point.label, value: point.value,
      x: 8 + index * 44, height: Math.max(2, (values[index] / maximum) * 82) }));
  });

  constructor() { this.load(); }

  private filters(includeType = true) {
    const value = this.form.getRawValue();
    return {
      ...(value.fecha_desde ? { fecha_desde: value.fecha_desde } : {}),
      ...(value.fecha_hasta ? { fecha_hasta: value.fecha_hasta } : {}),
      ...(includeType && value.tipo ? { tipo: value.tipo } : {}),
    };
  }

  load(): void {
    this.loading.set(true); this.error.set(null); this.generated.set(null);
    this.api.reportSummary(this.filters(false)).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (value) => { this.summary.set(value); this.loading.set(false); },
      error: () => { this.error.set('No fue posible cargar el resumen del período.'); this.loading.set(false); },
    });
  }

  generate(): void {
    if (!this.allowsAi() || this.generating()) return;
    this.generating.set(true); this.error.set(null);
    this.api.generatedReport(this.filters(false)).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (value) => { this.generated.set(value); this.generating.set(false); },
      error: () => { this.error.set('No fue posible generar el análisis.'); this.generating.set(false); },
    });
  }

  ask(): void {
    const question = this.question.value.trim();
    if (!question) return;
    this.api.dynamicReport({ ...this.filters(), pregunta: question }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (value) => this.dynamic.set(value), error: () => this.error.set('No fue posible consultar el reporte.')
    });
  }

  selectReport(): void {
    this.api.dynamicReport(this.filters()).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (value) => this.dynamic.set(value), error: () => this.error.set('No fue posible cargar el reporte seleccionado.'),
    });
  }

  export(format: 'xlsx' | 'pdf'): void {
    if (this.exporting()) return;
    this.exporting.set(true);
    this.api.exportReport(this.form.controls.tipo.value, format, this.filters())
      .pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
        next: (response) => {
          if (response.body) {
            const link = document.createElement('a');
            link.href = URL.createObjectURL(response.body);
            link.download = `${this.form.controls.tipo.value}.${format}`;
            link.click(); URL.revokeObjectURL(link.href);
          }
          this.exporting.set(false);
        },
        error: () => { this.error.set('No fue posible exportar el reporte.'); this.exporting.set(false); },
      });
  }

  loadMl(): void {
    this.api.mlReport().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (value) => this.ml.set(value), error: () => this.error.set('No fue posible cargar la analítica local.')
    });
  }
}
