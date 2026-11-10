import { Component, OnInit, inject } from '@angular/core';
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

  ngOnInit(): void {
    void this.offline.cargarEstado();
  }

  descargar(): void {
    if (this.offline.estado() === 'DESCARGANDO') return;
    void this.offline.descargar().catch(() => undefined);
  }
}
