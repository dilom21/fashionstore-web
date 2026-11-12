import { CommonModule } from '@angular/common';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { Empresa, PlataformaSaasService, Suscripcion } from '../services/plataforma-saas.service';

@Component({
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './suscripciones.page.html',
  styleUrl: './plataforma.css',
})
export class SuscripcionesPage {
  private readonly api = inject(PlataformaSaasService);
  private readonly destroyRef = inject(DestroyRef);

  readonly empresas = signal<Empresa[]>([]);
  readonly items = signal<Suscripcion[]>([]);
  readonly id = signal(0);
  readonly loadingEmpresas = signal(true);
  readonly loadingHistorial = signal(false);
  readonly errorEmpresas = signal('');
  readonly error = signal('');

  ngOnInit(): void { this.loadEmpresas(); }

  loadEmpresas(): void {
    this.loadingEmpresas.set(true);
    this.errorEmpresas.set('');
    this.api.empresas().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: empresas => {
        this.empresas.set(empresas);
        this.loadingEmpresas.set(false);
      },
      error: () => {
        this.errorEmpresas.set('No fue posible consultar las empresas.');
        this.loadingEmpresas.set(false);
      },
    });
  }

  select(id: number): void {
    const selected = Number(id) || 0;
    this.id.set(selected);
    this.items.set([]);
    this.error.set('');
    this.loadingHistorial.set(selected > 0);
    if (!selected) return;

    this.api.suscripciones(selected)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: historial => {
          // Ignorar respuestas tardías de una empresa seleccionada anteriormente.
          if (this.id() !== selected) return;
          this.items.set(historial);
          this.loadingHistorial.set(false);
        },
        error: () => {
          if (this.id() !== selected) return;
          this.error.set('No fue posible cargar el historial.');
          this.loadingHistorial.set(false);
        },
      });
  }
}
