import { Component, OnInit, inject, signal } from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';

import { OfflineOperationsService } from '../offline/offline-operations.service';
import { OfflineOperacion } from '../offline/offline.models';

@Component({ selector: 'app-offline-operaciones', imports: [CurrencyPipe, DatePipe, RouterLink], templateUrl: './offline-operaciones.page.html', styleUrl: './offline-pages.css' })
export class OfflineOperacionesPage implements OnInit {
  private readonly operations = inject(OfflineOperationsService);
  readonly rows = signal<OfflineOperacion[]>([]);
  readonly error = signal<string | null>(null);
  ngOnInit(): void { void this.cargar(); }
  async cargar(): Promise<void> { try { this.rows.set(await this.operations.listar()); this.error.set(null); } catch (error) { this.error.set(error instanceof Error ? error.message : 'No se pudieron leer las operaciones.'); } }
}
