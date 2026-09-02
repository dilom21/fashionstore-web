import { Component } from '@angular/core';
import { IMAGES } from '../../data/images';

/** Sección destacada del servicio de reserva en sucursal. */
@Component({
  selector: 'app-reserva-sucursal',
  imports: [],
  styleUrl: './reserva-sucursal.css',
  templateUrl: './reserva-sucursal.html',
})
export class ReservaSucursal {
  readonly image = IMAGES.reservaSucursal;
}
