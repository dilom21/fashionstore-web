import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { PlataformaSaasService } from '../services/plataforma-saas.service';

@Component({
  standalone: true,
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  templateUrl: './shell.page.html',
  styleUrl: './plataforma.css',
})
export class PlataformaShellPage {
  private readonly api = inject(PlataformaSaasService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  readonly loggingOut = signal(false);
  readonly error = signal('');

  logout(): void {
    if (this.loggingOut()) return;
    this.loggingOut.set(true);
    this.error.set('');
    this.api.logout().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => { void this.router.navigateByUrl('/plataforma/ingresar'); },
      error: () => {
        this.loggingOut.set(false);
        this.error.set('No se pudo cerrar la sesión. Intenta nuevamente.');
      },
    });
  }
}
