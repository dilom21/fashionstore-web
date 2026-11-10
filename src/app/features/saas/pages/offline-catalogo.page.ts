import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import {
  OfflineCatalogoData,
  OfflineCatalogoReaderService,
} from '../offline/offline-catalogo-reader.service';
import { TenantApiService } from '../services/tenant-api.service';

@Component({
  selector: 'app-offline-catalogo',
  imports: [RouterLink],
  templateUrl: './offline-catalogo.page.html',
  styleUrl: './offline-pages.css',
})
export class OfflineCatalogoPage implements OnInit {
  private readonly reader = inject(OfflineCatalogoReaderService);
  readonly api = inject(TenantApiService);
  readonly data = signal<OfflineCatalogoData | null>(null);
  readonly error = signal<string | null>(null);
  readonly cargando = signal(true);
  readonly buscar = signal('');

  ngOnInit(): void { void this.cargar(); }

  async cargar(): Promise<void> {
    this.cargando.set(true);
    try {
      this.data.set(await this.reader.leer({ buscar: this.buscar() }));
      this.error.set(null);
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'No se pudo leer la copia local.');
    } finally { this.cargando.set(false); }
  }
}
