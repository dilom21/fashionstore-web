import { HttpErrorResponse } from '@angular/common/http';
import {
  afterNextRender,
  Component,
  DestroyRef,
  effect,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { map, switchMap, tap } from 'rxjs';

import {
  EmpresaPublicaOpcion,
  buscarEmpresaPorSlug,
} from '../../../../../core/config/empresa-publica';
import {
  TenantApiService,
  TenantIdentidad,
  TenantLoginRespuesta,
} from '../../../../saas/services/tenant-api.service';
import { AuthService } from '../../services/auth.service';

/**
 * El backend responde 401 tanto a credenciales inválidas como a una cuenta que
 * no pertenece a la empresa solicitada (mismo `detail`, a propósito, para no
 * revelar qué correos existen). El mensaje cubre ambos casos sin distinguirlos.
 */
const MENSAJE_CREDENCIALES =
  'No pudimos iniciar sesión. Verifica tu correo, tu contraseña y la empresa seleccionada, e inténtalo nuevamente.';
const MENSAJE_CONEXION =
  'No pudimos conectarnos con el servicio. Inténtalo nuevamente en unos momentos.';
const MENSAJE_SERVICIO_SAAS =
  'El acceso de clientes todavía no está habilitado en el servidor.';
const MENSAJE_SIN_PERFIL_CLIENTE =
  'Esta cuenta no tiene un perfil de cliente activo en la empresa seleccionada.';
const MENSAJE_EMPRESA_DISTINTA =
  'Esta cuenta no pertenece a la empresa seleccionada.';
const MENSAJE_EMPRESA_REQUERIDA =
  'Selecciona la empresa de tu cuenta para continuar.';
const MENSAJE_EMPRESA_NO_DISPONIBLE =
  'La empresa seleccionada ya no está disponible. Vuelve a seleccionarla de la lista.';
const MENSAJE_EMPRESAS_CARGA =
  'No pudimos cargar las empresas disponibles. Reinténtalo en unos momentos.';
const MENSAJE_SIN_EMPRESAS =
  'No hay empresas disponibles para iniciar sesión en este momento.';

/**
 * Áreas que siguen usando la autenticación anterior (JWT legacy) y que por
 * tanto NO son un destino válido tras un login SaaS mientras no se adapten.
 * Se conserva la ruta `/login` fuera de los destinos para no reentrar en esta
 * misma pantalla.
 */
const PREFIJOS_NO_ADAPTADOS = [
  '/admin',
  '/personal',
  '/dashboard',
  '/saas',
  '/auth',
  '/reservas',
  '/checkout',
  '/pagos',
  '/ventas',
  '/login',
];

/**
 * Devuelve la URL de retorno si es un destino INTERNO y compatible con el
 * alcance actual (tienda pública), o `null` en cualquier otro caso.
 *
 * Rechaza URLs externas, protocolos (`https://…`), `//dominio`, barras
 * invertidas, caracteres de control y áreas todavía no adaptadas al modo
 * empresarial: nunca se redirige a una pantalla legacy protegida ni fuera del
 * sitio.
 */
export function destinoInternoSeguro(valor: string | null): string | null {
  if (valor === null) {
    return null;
  }
  const url = valor.trim();
  if (url.length === 0 || url.length > 512) {
    return null;
  }
  if (!url.startsWith('/') || url.startsWith('//')) {
    return null;
  }
  if (url.includes('\\') || /[\u0000-\u001f\u007f]/.test(url)) {
    return null;
  }
  // Solo la ruta (sin query/fragmento) decide si el área está adaptada.
  const ruta = url.split(/[?#]/)[0].toLowerCase();
  if (
    PREFIJOS_NO_ADAPTADOS.some(
      (prefijo) => ruta === prefijo || ruta.startsWith(`${prefijo}/`),
    )
  ) {
    return null;
  }
  return url;
}

/**
 * Página de inicio de sesión de CLIENTES (tienda pública FashionStore).
 *
 * - Muestra un SELECTOR de empresas alimentado por `GET /auth/tenant/empresas`
 *   (`TenantApiService.empresasPublicas()`): nunca una lista fija y nunca una
 *   empresa preseleccionada. Sin empresa elegida no se intenta autenticar.
 * - Autentica con el mecanismo SaaS: `TenantApiService.login()`
 *   (`POST /auth/tenant/login`) con `contexto: 'cliente'` y el `empresa_slug`
 *   REALMENTE elegido por el usuario.
 * - El JWT por sí solo NO autentica: la identidad se confirma SIEMPRE con
 *   `GET /auth/tenant/me`, comprobando el contexto cliente y que la empresa
 *   confirmada sea la misma que se eligió en el selector.
 * - Una pestaña comparte una única sesión empresarial: si la pestaña tenía una
 *   sesión de PERSONAL, el login del cliente la sustituye y vuelve a confirmar
 *   la identidad con `/me` (nunca se mezclan identidades). Si `/me` falla, se
 *   limpia la sesión empresarial en lugar de dejar un token sin identidad.
 * - No usa el JWT legacy ni lo escribe: la sesión antigua de clientes
 *   (`vanter_access_token`) se mantiene intacta para los módulos no adaptados.
 * - "Crear cuenta" exige una empresa elegida y la transporta a /registro como
 *   `?empresa=<slug>` (el registro no permite cambiarla). De vuelta al login,
 *   `?empresa=<slug>` rellena el selector con la MISMA empresa elegida.
 * - El registro público de clientes vive en /registro (CU29); la recuperación
 *   de contraseña sigue pendiente.
 * - Si el cliente ya está autenticado, redirige a returnUrl válido o a "/".
 *
 * Diseño del primer parcial: el HTML/CSS se conserva y solo se agrega el campo
 * del selector. Se mantiene la MISMA API pública de la plantilla (form,
 * enviando, mensajeError, mostrarPassword, toggleMostrarPassword, onSubmit,
 * mensajeCorreo, mensajePassword) más los mensajes del selector.
 */
@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule, RouterLink],
  styleUrl: './login.css',
  templateUrl: './login.html',
})
export class Login {
  private readonly authService = inject(AuthService);
  private readonly tenantApi = inject(TenantApiService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);

  /** Evita navegaciones duplicadas si el effect se reevalúa. */
  private redirigiendo = false;

  /**
   * Empresa a preseleccionar cuando se llega desde el registro o desde un
   * enlace interno (`?empresa=<slug>`). Solo se aplica si esa empresa aparece
   * realmente en la lista devuelta por el backend.
   */
  private empresaPreferida: string | null = null;

  readonly form = new FormGroup({
    empresa_slug: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required],
    }),
    correo: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.email],
    }),
    password: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required],
    }),
  });

  /** Empresas del selector (`GET /auth/tenant/empresas`). */
  readonly empresas = signal<EmpresaPublicaOpcion[]>([]);
  readonly cargandoEmpresas = signal(false);
  readonly errorEmpresas = signal<string | null>(null);

  readonly enviando = signal(false);
  readonly mensajeError = signal<string | null>(null);
  readonly mostrarPassword = signal(false);

  constructor() {
    // Al editar cualquier campo se limpia el error general mostrado.
    this.form.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.mensajeError.set(null));

    // Precarga opcional del correo enviado desde el registro (?correo=...).
    // Solo el correo: la contraseña queda vacía y NO hay auto-login.
    const correoPrecargado = this.route.snapshot.queryParamMap.get('correo');
    if (correoPrecargado !== null && correoPrecargado.trim().length > 0) {
      this.form.controls.correo.setValue(
        correoPrecargado.trim().slice(0, 150),
      );
    }

    // Empresa elegida antes de pasar por el registro. No se confía en la URL:
    // el slug solo se aplica si aparece en la lista REAL del backend.
    const empresaUrl = this.route.snapshot.queryParamMap.get('empresa');
    this.empresaPreferida =
      empresaUrl !== null && empresaUrl.trim().length > 0 ? empresaUrl : null;

    // El selector se carga en el navegador (SSR-safe): no bloquea el primer
    // render ni lanza peticiones durante el prerenderizado.
    afterNextRender(() => this.cargarEmpresas());

    // Si ya existe una sesión de CLIENTE confirmada por el backend (SaaS o, en
    // su defecto, la sesión legacy todavía vigente), esta página no debe
    // mostrarse: se redirige a returnUrl válido o a "/".
    effect(() => {
      const clienteSaas =
        this.tenantApi.contexto() === 'cliente' && this.tenantApi.autenticado();
      const clienteLegacy =
        this.authService.contexto() === 'cliente' &&
        this.authService.autenticado();
      if (clienteSaas || clienteLegacy) {
        this.redirigirTrasLogin();
      }
    });
  }

  onSubmit(): void {
    if (this.enviando()) {
      return;
    }

    this.form.markAllAsTouched();
    this.mensajeError.set(null);

    // La empresa la elige el usuario en el selector. Sin una empresa REAL de la
    // lista no se intenta autenticar (nunca se envía un slug inventado).
    const empresa = this.empresaSeleccionada();
    if (empresa === null) {
      this.mensajeError.set(this.mensajeEmpresaNoSeleccionada());
      return;
    }

    if (this.form.invalid) {
      return;
    }

    this.enviando.set(true);
    const { correo, password } = this.form.getRawValue();
    const empresaSlug = empresa.slug;

    /**
     * `true` cuando el backend ya emitió el JWT empresarial de ESTE intento.
     * Si algo falla después, la sesión se limpia; si falla el propio login
     * (401/403/503/red), no se toca ninguna sesión previa de la pestaña.
     */
    let tokenEmitido = false;

    this.tenantApi
      .login({
        correo,
        password,
        empresa_slug: empresaSlug,
        contexto: 'cliente',
      })
      .pipe(
        tap(() => {
          tokenEmitido = true;
        }),
        // El JWT por sí solo no autentica: la identidad se confirma con /me.
        switchMap((respuesta: TenantLoginRespuesta) =>
          this.tenantApi
            .me()
            .pipe(map((identidad) => ({ respuesta, identidad }))),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: ({ respuesta, identidad }) => {
          this.enviando.set(false);
          const problema = this.validarSesionCliente(
            identidad,
            respuesta,
            empresaSlug,
          );
          if (problema !== null) {
            this.tenantApi.cerrarSesion();
            this.mensajeError.set(problema);
            return;
          }
          // La redirección la realiza el effect: la identidad de cliente ya
          // quedó confirmada por el backend.
        },
        error: (error: unknown) => {
          if (tokenEmitido) {
            // Token emitido sin identidad confirmada: no se deja una sesión
            // empresarial a medias.
            this.tenantApi.cerrarSesion();
          }
          this.enviando.set(false);
          this.mensajeError.set(this.mensajeParaError(error));
        },
      });
  }

  toggleMostrarPassword(): void {
    this.mostrarPassword.update((visible) => !visible);
  }

  /**
   * Carga el selector con las empresas REALES del backend
   * (`GET /auth/tenant/empresas`). No hay listas fijas: si el endpoint falla o
   * devuelve una lista vacía, se informa y no se permite autenticar.
   */
  cargarEmpresas(): void {
    if (this.cargandoEmpresas()) {
      return;
    }
    this.cargandoEmpresas.set(true);
    this.errorEmpresas.set(null);

    this.tenantApi
      .empresasPublicas()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (empresas) => {
          this.cargandoEmpresas.set(false);
          this.empresas.set(empresas);
          if (empresas.length === 0) {
            this.errorEmpresas.set(MENSAJE_SIN_EMPRESAS);
            return;
          }
          this.aplicarEmpresaPreferida();
        },
        error: () => {
          this.cargandoEmpresas.set(false);
          this.empresas.set([]);
          this.errorEmpresas.set(MENSAJE_EMPRESAS_CARGA);
        },
      });
  }

  /**
   * Empresa del selector validada contra la lista disponible, o `null` si no
   * hay ninguna elegida o si la elegida ya no aparece en el backend.
   */
  empresaSeleccionada(): EmpresaPublicaOpcion | null {
    return buscarEmpresaPorSlug(
      this.empresas(),
      this.form.controls.empresa_slug.value,
    );
  }

  /** Mensaje del campo empresa, o null si no corresponde mostrarlo. */
  mensajeEmpresa(): string | null {
    const control = this.form.controls.empresa_slug;
    if (control.untouched || !control.invalid) {
      return null;
    }
    if (control.hasError('required')) {
      return 'Selecciona la empresa de tu cuenta.';
    }
    return null;
  }

  /**
   * Abre el registro llevando la empresa elegida. Sin empresa no se navega:
   * el usuario permanece en el login con un mensaje claro (el registro exige
   * una empresa y no permite cambiarla).
   */
  irARegistro(): void {
    const empresa = this.empresaSeleccionada();
    if (empresa === null) {
      this.form.controls.empresa_slug.markAsTouched();
      this.mensajeError.set(this.mensajeEmpresaNoSeleccionada());
      return;
    }
    void this.router.navigate(['/registro'], {
      queryParams: { empresa: empresa.slug },
    });
  }

  /**
   * Mensaje para una selección de empresa ausente o no disponible. Distingue
   * "falta elegir" de "la empresa ya no está en la lista" para que el usuario
   * sepa si debe seleccionar o reintentar la carga.
   */
  private mensajeEmpresaNoSeleccionada(): string {
    if (this.empresas().length === 0) {
      return this.errorEmpresas() ?? MENSAJE_SIN_EMPRESAS;
    }
    return this.form.controls.empresa_slug.value.trim().length === 0
      ? MENSAJE_EMPRESA_REQUERIDA
      : MENSAJE_EMPRESA_NO_DISPONIBLE;
  }

  /**
   * Aplica `?empresa=<slug>` (una sola vez y solo si la empresa existe en la
   * lista real). Nunca selecciona una empresa por su cuenta.
   */
  private aplicarEmpresaPreferida(): void {
    const preferida = this.empresaPreferida;
    if (preferida === null || this.form.controls.empresa_slug.value !== '') {
      return;
    }
    const empresa = buscarEmpresaPorSlug(this.empresas(), preferida);
    this.empresaPreferida = null;
    if (empresa !== null) {
      this.form.controls.empresa_slug.setValue(empresa.slug);
    }
  }

  /** Mensaje de validación del correo, o null si no corresponde mostrarlo. */
  mensajeCorreo(): string | null {
    const control = this.form.controls.correo;
    if (control.untouched || !control.invalid) {
      return null;
    }
    if (control.hasError('required')) {
      return 'Ingresa tu correo electrónico.';
    }
    if (control.hasError('email')) {
      return 'Ingresa un correo electrónico válido.';
    }
    return null;
  }

  /** Mensaje de validación de la contraseña, o null si no corresponde. */
  mensajePassword(): string | null {
    const control = this.form.controls.password;
    if (control.untouched || !control.invalid) {
      return null;
    }
    if (control.hasError('required')) {
      return 'Ingresa tu contraseña.';
    }
    return null;
  }

  /**
   * Destino tras el login: solo se acepta una ruta interna y compatible con el
   * alcance adaptado (tienda pública). Cualquier otro valor —dominio externo,
   * `//host`, URL malformada o área legacy protegida— cae en "/".
   */
  private destinoTrasLogin(): string {
    const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl');
    return destinoInternoSeguro(returnUrl) ?? '/';
  }

  private redirigirTrasLogin(): void {
    if (this.redirigiendo) {
      return;
    }
    this.redirigiendo = true;
    void this.router.navigateByUrl(this.destinoTrasLogin(), {
      replaceUrl: true,
    });
  }

  /**
   * Comprueba que la identidad confirmada por `/auth/tenant/me` es realmente la
   * del CLIENTE en la empresa de esta tienda. Devuelve el mensaje de error, o
   * `null` si la sesión es válida.
   */
  private validarSesionCliente(
    identidad: TenantIdentidad,
    respuesta: TenantLoginRespuesta,
    empresaSlug: string,
  ): string | null {
    if (identidad.contexto !== 'cliente' || respuesta.contexto !== 'cliente') {
      return MENSAJE_SIN_PERFIL_CLIENTE;
    }
    const slugIdentidad = identidad.empresa_slug.trim().toLowerCase();
    const slugLogin = respuesta.empresa_slug.trim().toLowerCase();
    if (
      slugIdentidad !== empresaSlug ||
      slugLogin !== empresaSlug ||
      identidad.empresa_id !== respuesta.empresa_id
    ) {
      return MENSAJE_EMPRESA_DISTINTA;
    }
    return null;
  }

  private mensajeParaError(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      // 401: credenciales inválidas o cuenta que no pertenece a la empresa.
      if (error.status === 401) {
        return MENSAJE_CREDENCIALES;
      }
      // 403: la empresa no reconoce un perfil de cliente para esta cuenta.
      if (error.status === 403) {
        return MENSAJE_SIN_PERFIL_CLIENTE;
      }
      if (error.status === 422) {
        return MENSAJE_CREDENCIALES;
      }
      if (error.status === 503) {
        return MENSAJE_SERVICIO_SAAS;
      }
      if (error.status === 0 || error.status >= 500) {
        return MENSAJE_CONEXION;
      }
    }
    return MENSAJE_CREDENCIALES;
  }
}
