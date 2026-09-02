import { Component, ElementRef, signal, viewChild } from '@angular/core';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

type SubscribeState = 'idle' | 'error' | 'ok';

/**
 * Newsletter: suscripción 100% demo (sin backend).
 */
@Component({
  selector: 'app-newsletter',
  imports: [],
  styleUrl: './newsletter.css',
  templateUrl: './newsletter.html',
})
export class Newsletter {
  readonly state = signal<SubscribeState>('idle');
  readonly emailInput = viewChild<ElementRef<HTMLInputElement>>('emailInput');

  subscribe(): void {
    const value = this.emailInput()?.nativeElement.value.trim() ?? '';
    if (!EMAIL_PATTERN.test(value)) {
      this.state.set('error');
      return;
    }
    this.state.set('ok');
    if (this.emailInput()) {
      this.emailInput()!.nativeElement.value = '';
    }
  }

  onSubmit(event: Event): void {
    event.preventDefault();
    this.subscribe();
  }
}
