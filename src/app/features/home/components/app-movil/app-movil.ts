import { Component, signal } from '@angular/core';

/**
 * Sección promocional de la app móvil. La Realidad Aumentada es
 * exclusiva de la app: aquí solo se menciona, nunca se implementa.
 */
@Component({
  selector: 'app-app-movil',
  imports: [],
  styleUrl: './app-movil.css',
  templateUrl: './app-movil.html',
})
export class AppMovil {
  readonly showInfo = signal(false);

  conocerApp(): void {
    this.showInfo.set(true);
  }
}
