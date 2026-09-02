import { Component } from '@angular/core';

interface Testimonial {
  name: string;
  initials: string;
  text: string;
}

const TESTIMONIALS: Testimonial[] = [
  {
    name: 'Andrés M.',
    initials: 'AM',
    text: 'La calidad de las prendas es excelente y la reserva en sucursal hizo todo mucho más fácil.',
  },
  {
    name: 'Diego R.',
    initials: 'DR',
    text: 'Pedí online y recogí en tienda sin complicaciones. Atención cercana y muy buena selección.',
  },
  {
    name: 'Jorge L.',
    initials: 'JL',
    text: 'Por fin una tienda con estilo claro para hombre. Las poleras y camisas se sienten premium.',
  },
];

/** Testimonios mock (presentación, sin datos inventados de ciudades). */
@Component({
  selector: 'app-testimonios',
  imports: [],
  styleUrl: './testimonios.css',
  templateUrl: './testimonios.html',
})
export class Testimonios {
  readonly testimonials = TESTIMONIALS;
  readonly stars = [0, 1, 2, 3, 4];
}
