import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DatePipe } from '@angular/common';
import { SaasBrand } from '../components/saas-brand/saas-brand';
import { TenantApiService } from '../services/tenant-api.service';
import { OfflineOperationsLocalStore } from '../offline/offline-operations-local.store';
import { OfflineOperationRecord, OfflineOperationStatus } from '../offline/offline-operation.models';

@Component({ selector: 'app-offline-operations', standalone: true, imports: [RouterLink, SaasBrand, DatePipe], templateUrl: './offline-operations.page.html', styleUrl: './saas-pages.css' })
export class OfflineOperationsPage implements OnInit {
  readonly api = inject(TenantApiService);
  private readonly store = inject(OfflineOperationsLocalStore);
  readonly rows = signal<OfflineOperationRecord[]>([]);
  readonly status = signal<OfflineOperationStatus | undefined>(undefined);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  ngOnInit(): void { void this.load(); }

  async load(): Promise<void> {
    this.loading.set(true); this.error.set(null);
    try { this.rows.set(await this.store.read(this.status())); }
    catch { this.error.set('No se pudo leer la cola local en este navegador.'); }
    finally { this.loading.set(false); }
  }

  async filter(value: string): Promise<void> { this.status.set(value ? value as OfflineOperationStatus : undefined); await this.load(); }
  label(value: OfflineOperationStatus): string { return ({ pendiente: 'Pendiente', enviado: 'En envío local', confirmado: 'Confirmado local', conflicto: 'Conflicto local', error: 'Error local' })[value]; }
}
