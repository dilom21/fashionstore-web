import { Component } from '@angular/core';

type BeneficioIcon = 'tienda' | 'seguro' | 'reserva' | 'atencion';

interface Beneficio {
  icon: BeneficioIcon;
  title: string;
  text: string;
}

const BENEFICIOS: Beneficio[] = [
  {
    icon: 'tienda',
    title: 'Compra online',
    text: 'Explora el catálogo y compra desde donde estés.',
  },
  {
    icon: 'seguro',
    title: 'Pago seguro',
    text: 'Tus datos protegidos en cada transacción.',
  },
  {
    icon: 'reserva',
    title: 'Reserva en sucursal',
    text: 'Aparta tus prendas y pruébatelas en tienda.',
  },
  {
    icon: 'atencion',
    title: 'Atención al cliente',
    text: 'Acompañamiento antes, durante y después.',
  },
];

/**
 * Franja de beneficios reales del sistema (sin estadísticas falsas).
 */
@Component({
  selector: 'app-beneficios',
  imports: [],
  styleUrl: './beneficios.css',
  templateUrl: './beneficios.html',
})
export class Beneficios {
  readonly beneficios = BENEFICIOS;
}
