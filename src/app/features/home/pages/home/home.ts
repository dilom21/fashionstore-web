import { Component } from '@angular/core';
import { Navbar } from '../../components/navbar/navbar';
import { Hero } from '../../components/hero/hero';
import { Beneficios } from '../../components/beneficios/beneficios';
import { Categorias } from '../../components/categorias/categorias';
import { ProductosDestacados } from '../../components/productos-destacados/productos-destacados';
import { Lookbook } from '../../components/lookbook/lookbook';
import { NuevosIngresos } from '../../components/nuevos-ingresos/nuevos-ingresos';
import { ReservaSucursal } from '../../components/reserva-sucursal/reserva-sucursal';
import { Ofertas } from '../../components/ofertas/ofertas';
import { Testimonios } from '../../components/testimonios/testimonios';
import { AppMovil } from '../../components/app-movil/app-movil';
import { Newsletter } from '../../components/newsletter/newsletter';
import { Footer } from '../../components/footer/footer';
import { RevealDirective } from '../../../../shared/directives/reveal.directive';

/**
 * Landing pública de VANTER MEN.
 * Actúa como página compositora: ensambla las secciones en orden
 * (la lógica de cada sección vive en su propio componente).
 */
@Component({
  selector: 'app-home',
  imports: [
    Navbar,
    Hero,
    Beneficios,
    Categorias,
    ProductosDestacados,
    Lookbook,
    NuevosIngresos,
    ReservaSucursal,
    Ofertas,
    Testimonios,
    AppMovil,
    Newsletter,
    Footer,
    RevealDirective,
  ],
  styleUrl: './home.css',
  templateUrl: './home.html',
})
export class Home {}
