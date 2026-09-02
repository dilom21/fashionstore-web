import {
  afterNextRender,
  Component,
  ElementRef,
  OnDestroy,
  viewChild,
} from '@angular/core';
import { IMAGES } from '../../data/images';

interface LookSlide {
  id: string;
  num: string;
  title: string;
  caption: string;
  image: string;
  /** Variante de ancho de la composición. */
  style: 'a' | 'b' | 'c';
}

const LOOKS: LookSlide[] = [
  {
    id: 'look-1',
    num: '01',
    title: 'Essentialismo urbano',
    caption: 'Camisas y poleras en tonos neutros para el día.',
    image: IMAGES.lookbook.look1,
    style: 'a',
  },
  {
    id: 'look-2',
    num: '02',
    title: 'Noche VANTER',
    caption: 'Chaquetas y abrigos para después de las seis.',
    image: IMAGES.lookbook.look2,
    style: 'b',
  },
  {
    id: 'look-3',
    num: '03',
    title: 'Denim atemporal',
    caption: 'Jeans con corte limpio y actitud propia.',
    image: IMAGES.lookbook.look3,
    style: 'a',
  },
  {
    id: 'look-4',
    num: '04',
    title: 'Capas de invierno',
    caption: 'Suéteres y buzos en texturas suaves.',
    image: IMAGES.lookbook.look4,
    style: 'b',
  },
  {
    id: 'look-5',
    num: '05',
    title: 'Detalles que importan',
    caption: 'Accesorios para cerrar el look con carácter.',
    image: IMAGES.lookbook.look5,
    style: 'c',
  },
];

/**
 * Lookbook editorial con desplazamiento horizontal (drag + auto-scroll MUY
 * lento). Todo se inicializa en el navegador (seguro para SSR) y respeta
 * prefers-reduced-motion, hover y gestos.
 */
@Component({
  selector: 'app-lookbook',
  imports: [],
  styleUrl: './lookbook.css',
  templateUrl: './lookbook.html',
})
export class Lookbook implements OnDestroy {
  readonly slides = LOOKS;

  readonly track = viewChild<ElementRef<HTMLElement>>('track');

  private rafId = 0;
  private visible = false;
  private paused = false;
  private dragging = false;
  private reduced = true;

  private readonly onEnter = () => {
    this.paused = true;
  };
  private readonly onLeave = () => {
    this.paused = false;
    this.startLoop();
  };
  private readonly onFocusIn = () => {
    this.paused = true;
  };
  private readonly onFocusOut = () => {
    this.paused = false;
    this.startLoop();
  };
  private readonly onPointerDown = (event: PointerEvent) => {
    const element = this.track()?.nativeElement;
    if (!element || event.pointerType !== 'mouse') {
      return;
    }
    this.dragging = true;
    this.paused = true;
    this.startX = event.clientX;
    this.startLeft = element.scrollLeft;
    element.classList.add('is-dragging');
  };
  private readonly onPointerMove = (event: PointerEvent) => {
    const element = this.track()?.nativeElement;
    if (!this.dragging || !element) {
      return;
    }
    const delta = event.clientX - this.startX;
    element.scrollLeft = this.startLeft - delta;
  };
  private readonly endDrag = () => {
    if (!this.dragging) {
      return;
    }
    this.dragging = false;
    this.track()?.nativeElement.classList.remove('is-dragging');
    window.setTimeout(() => {
      this.paused = false;
      this.startLoop();
    }, 500);
  };

  private startX = 0;
  private startLeft = 0;

  constructor() {
    afterNextRender(() => {
      const element = this.track()?.nativeElement;
      if (!element) {
        return;
      }
      this.reduced = window.matchMedia(
        '(prefers-reduced-motion: reduce)',
      ).matches;

      element.addEventListener('mouseenter', this.onEnter);
      element.addEventListener('mouseleave', this.onLeave);
      element.addEventListener('focusin', this.onFocusIn);
      element.addEventListener('focusout', this.onFocusOut);
      element.addEventListener('pointerdown', this.onPointerDown);
      element.addEventListener('pointermove', this.onPointerMove);
      element.addEventListener('pointerup', this.endDrag);
      element.addEventListener('pointercancel', this.endDrag);

      if (!this.reduced && typeof IntersectionObserver !== 'undefined') {
        const observer = new IntersectionObserver(
          (entries) => {
            this.visible = entries[0]?.isIntersecting ?? false;
            if (this.visible && !this.paused) {
              this.startLoop();
            } else {
              this.stopLoop();
            }
          },
          { threshold: 0.05 },
        );
        observer.observe(element);
      }
    });
  }

  ngOnDestroy(): void {
    const element = this.track()?.nativeElement;
    element?.removeEventListener('mouseenter', this.onEnter);
    element?.removeEventListener('mouseleave', this.onLeave);
    element?.removeEventListener('focusin', this.onFocusIn);
    element?.removeEventListener('focusout', this.onFocusOut);
    element?.removeEventListener('pointerdown', this.onPointerDown);
    element?.removeEventListener('pointermove', this.onPointerMove);
    element?.removeEventListener('pointerup', this.endDrag);
    element?.removeEventListener('pointercancel', this.endDrag);
    this.stopLoop();
  }

  scroll(direction: number): void {
    const element = this.track()?.nativeElement;
    if (!element) {
      return;
    }
    element.scrollBy({
      left: direction * element.clientWidth * 0.85,
      behavior: 'smooth',
    });
  }

  private tick = () => {
    const element = this.track()?.nativeElement;
    if (this.visible && !this.paused && !this.dragging && element) {
      if (element.scrollLeft >= element.scrollWidth - element.clientWidth - 2) {
        element.scrollLeft = 0;
      } else {
        element.scrollLeft += 0.5;
      }
    }
    this.rafId = requestAnimationFrame(this.tick);
  };

  private startLoop(): void {
    if (this.reduced || this.dragging || this.rafId) {
      return;
    }
    this.rafId = requestAnimationFrame(this.tick);
  }

  private stopLoop(): void {
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
  }
}
