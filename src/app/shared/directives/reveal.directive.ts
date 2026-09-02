import {
  afterNextRender,
  Directive,
  ElementRef,
  inject,
  OnDestroy,
} from '@angular/core';

/**
 * Aparición suave al hacer scroll (fade-up).
 *
 * Seguro para SSR: IntersectionObserver y matchMedia se usan únicamente
 * dentro de `afterNextRender` (solo navegador). Respeta
 * prefers-reduced-motion.
 *
 * Uso: <div vmReveal>...</div>
 */
@Directive({
  selector: '[vmReveal]',
})
export class RevealDirective implements OnDestroy {
  private readonly element: HTMLElement;
  private observer: IntersectionObserver | null = null;

  constructor() {
    this.element = inject(ElementRef<HTMLElement>).nativeElement;
    // Solo se ejecuta en el cliente, tras el primer render.
    afterNextRender(() => this.init());
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
    this.observer = null;
  }

  private init(): void {
    const reducedMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches;

    if (reducedMotion || typeof IntersectionObserver === 'undefined') {
      this.element.classList.add('vm-is-visible');
      return;
    }

    const rect = this.element.getBoundingClientRect();
    // Si ya está dentro del viewport no se oculta para evitar parpadeos.
    if (rect.top < window.innerHeight - 40 && rect.bottom > 0) {
      this.element.classList.add('vm-is-visible');
      return;
    }

    this.element.classList.add('vm-reveal');

    this.observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            this.element.classList.add('vm-is-visible');
            this.observer?.disconnect();
            this.observer = null;
          }
        }
      },
      { threshold: 0.12, rootMargin: '0px 0px -48px 0px' },
    );
    this.observer.observe(this.element);
  }
}
