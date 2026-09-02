import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

/**
 * Página de inicio de sesión.
 *
 * Versión mínima por ahora: la ruta /login queda preparada y funcional;
 * el diseño completo del login se desarrollará en otra fase.
 */
@Component({
  selector: 'app-login',
  imports: [RouterLink],
  styleUrl: './login.css',
  templateUrl: './login.html',
})
export class Login {}
