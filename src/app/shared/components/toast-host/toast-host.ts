import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { ToastService } from '../../../core/services/toast.service';

/**
 * Host visual de los avisos efímeros (toast).
 *
 * Componente presentacional: lee el estado de `ToastService` (signal) y se
 * monta una sola vez en el navbar, de modo que cualquier pantalla pública
 * puede lanzar avisos sin duplicar markup.
 */
@Component({
  selector: 'app-toast-host',
  imports: [],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './toast-host.css',
  templateUrl: './toast-host.html',
})
export class ToastHost {
  readonly toastService = inject(ToastService);
}
