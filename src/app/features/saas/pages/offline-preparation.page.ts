import { Component, OnInit, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { OfflineDownloadService } from '../offline/offline-download.service';
import { SaasBrand } from '../components/saas-brand/saas-brand';
import { TenantApiService } from '../services/tenant-api.service';

@Component({ selector: 'app-offline-preparation', standalone: true, imports: [RouterLink, SaasBrand], templateUrl: './offline-preparation.page.html', styleUrl: './saas-pages.css' })
export class OfflinePreparationPage implements OnInit {
  readonly api = inject(TenantApiService); readonly offline = inject(OfflineDownloadService);
  online = typeof navigator === 'undefined' ? true : navigator.onLine;
  ngOnInit(): void { void this.offline.cargarEstado(); }
  async descargar(): Promise<void> { try { await this.offline.descargar(); } catch { /* estado visible */ } }
  estadoTexto(): string { return this.offline.estado().replaceAll('_', ' '); }
  fecha(): string { const date = this.offline.snapshot()?.download_completed_at; return date ? new Date(date).toLocaleString() : 'Nunca'; }
}
