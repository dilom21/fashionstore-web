import { Component } from '@angular/core';
import { IMAGES } from '../../data/images';

/**
 * Hero de la landing: fotografía masculina a sangre completa (cuando se
 * añada la imagen) cubierta por overlay oscuro, o fondo degradado
 * elegante mientras no haya fotografía.
 */
@Component({
  selector: 'app-hero',
  imports: [],
  styleUrl: './hero.css',
  templateUrl: './hero.html',
})
export class Hero {
  /** Ruta de la fotografía principal (ver features/home/data/images.ts). */
  readonly heroImage = IMAGES.hero.main;
}
