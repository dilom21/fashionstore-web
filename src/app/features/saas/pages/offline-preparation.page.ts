import { Component, HostListener, OnInit, inject } from '@angular/core';
import { RouterLink } from '@angular/router';

import { OfflineDownloadService } from '../offline/offline-download.service';
import { TenantApiService } from '../services/tenant-api.service';

@Component({
  selector: 'app-offline-preparation',
  imports: [RouterLink],
  templateUrl: './offline-preparation.page.html',
  styleUrl: './offline-pages.css',
})
export class OfflinePreparationPage implements OnInit {
  readonly api = inject(TenantApiService);
  readonly offline = inject(OfflineDownloadService);
  online = typeof navigator === 'undefined' ? true : navigator.onLine;

  @HostListener('window:online') onOnline(): void { this.online = true; }
  @HostListener('window:offline') onOffline(): void { this.online = false; }

  ngOnInit(): void {
    void this.offline.cargarEstado();
  }

  descargar(): void {
    if (this.offline.estado() === 'DESCARGANDO') return;
    if (!this.online) {
      this.offline.error.set('Conéctate a Internet para descargar o actualizar el catálogo.');
      return;
    }
    void this.offline.descargar().catch(() => undefined);
  }
}
