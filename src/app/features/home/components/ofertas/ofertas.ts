import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

/**
 * "Ofertas de temporada": sección de presentación.
 *
 * DEUDA PÚBLICA DE PROMOCIONES:
 * El backend todavía no expone un contrato público de promociones activas
 * para el cliente. `GET /promociones` es administrativo (CU10) y requiere
 * autenticación de personal, por lo que la landing no puede consumirlo.
 *
 * Por eso esta sección NO muestra descuentos, precios rebajados ni productos
 * mock: únicamente invita a explorar el catálogo real. Cuando exista un
 * contrato público de promociones activas (o la promoción efectiva integrada
 * al catálogo público), esta sección deberá consumirlo.
 */
@Component({
  selector: 'app-ofertas',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './ofertas.css',
  templateUrl: './ofertas.html',
})
export class Ofertas {}
