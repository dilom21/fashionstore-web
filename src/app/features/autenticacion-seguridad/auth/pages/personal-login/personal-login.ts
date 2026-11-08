import { HttpErrorResponse } from '@angular/common/http';
import {
  afterNextRender,
  Component,
  DestroyRef,
  OnInit,
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
import { Router, RouterLink } from '@angular/router';
import { switchMap } from 'rxjs';

import {
  EmpresaPublicaOpcion,
  PATRON_EMPRESA_SLUG,
  buscarEmpresaPorSlug,
} from '../../../../../core/config/empresa-publica';
import {
  TenantApiService,
  TenantIdentidad,
} from '../../../../saas/services/tenant-api.service';
import { SaasBrand } from '../../../../saas/components/saas-brand/saas-brand';

const MENSAJE_CREDENCIALES =
  'No pudimos iniciar sesión. Revisa la empresa, tu correo y tu contraseña e inténtalo nuevamente.';
const MENSAJE_CONEXION =
  'No pudimos conectarnos con el servicio. Inténtalo nuevamente.';
const MENSAJE_SERVICIO_SAAS =
  'El acceso empresarial todavía no está habilitado en el servidor.';
const MENSAJE_SIN_PERFIL =
  'Esta cuenta no tiene un perfil de personal activo en la empresa indicada.';
const MENSAJE_EMPRESA_REQUERIDA =
  'Selecciona la empresa a la que perteneces para continuar.';
const MENSAJE_EMPRESA_NO_DISPONIBLE =
  'La empresa seleccionada ya no está disponible. Vuelve a seleccionarla de la lista.';
const MENSAJE_EMPRESAS_CARGA =
  'No pudimos cargar las empresas disponibles. Reinténtalo en unos momentos.';
const MENSAJE_SIN_EMPRESAS =
  'No hay empresas disponibles para iniciar sesión en este momento.';

/**
 * Destino del personal ADMINISTRADOR: el panel administrativo original
 * (/admin/inicio), que se conserva como base para adaptar los casos de uso.
 * La pantalla empresarial (CU04-CU05) se consulta desde su opción temporal
 * "CU4-CU5" de la barra lateral.
 */
const DESTINO_ADMINISTRADOR = '/admin/inicio';

/** Destino neutral para roles cuyos módulos aún no están adaptados a SaaS. */
const DESTINO_NEUTRAL = '/saas/sesion';

/**
 * Portal empresarial (FashionStore): acceso del PERSONAL de una empresa con el
 * mecanismo SaaS.
 *
 * Ruta interna: /auth/personal/login (se conserva la del primer parcial).
 * - La empresa se elige en un SELECTOR alimentado por
 *   `GET /auth/tenant/empresas` (`TenantApiService.empresasPublicas()`): no hay
 *   lista fija, no se preselecciona nada y sin empresa válida no se autentica.
 * - Autentica con `TenantApiService.login()` (POST /auth/tenant/login) usando
 *   el contexto `personal`, que fija el formulario y el usuario no elige.
 * - Tras el JWT consulta GET /auth/tenant/me: si la identidad empresarial no
 *   se puede recuperar, la sesión NO se considera válida y se limpia.
 * - No usa el login legacy de personal (POST /auth/personal/login), que se
 *   mantiene intacto para los módulos todavía no adaptados.
 * - El destino depende del rol empresarial devuelto por el backend:
 *   ADMINISTRADOR -> panel administrativo original (/admin/inicio);
 *   ENCARGADO_SUCURSAL y CAJERO -> pantalla neutral de sesión (sus módulos aún
 *   no están adaptados).
 */
@Component({
  selector: 'app-personal-login',
  imports: [ReactiveFormsModule, RouterLink, SaasBrand],
  styleUrl: './personal-login.css',
  templateUrl: './personal-login.html',
})
export class PersonalLogin implements OnInit {
  private readonly tenantApi = inject(TenantApiService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly form = new FormGroup({
    empresa_slug: new FormControl('', {
      nonNullable: true,
      validators: [
        Validators.required,
        Validators.pattern(PATRON_EMPRESA_SLUG),
      ],
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
  readonly avisoRecuperacion = signal(false);

  constructor() {
    // Al editar cualquier campo se limpia el error general mostrado.
    this.form.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.mensajeError.set(null));

    // El selector se carga en el navegador (SSR-safe): no bloquea el primer
    // render ni lanza peticiones durante el prerenderizado.
    afterNextRender(() => this.cargarEmpresas());
  }

  /**
   * Sesión empresarial ya iniciada (o restaurada tras recargar): no se vuelve
   * a pedir credenciales. Solo se acepta el contexto `personal`.
   */
  ngOnInit(): void {
    if (this.tenantApi.identidad() !== null) {
      this.redirigirSiEsPersonal(this.tenantApi.identidad());
      return;
    }

    if (!this.tenantApi.tieneToken()) {
      return;
    }

    this.tenantApi
      .restaurarSesion()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (identidad) => this.redirigirSiEsPersonal(identidad),
        error: () => {
          // No se pudo verificar la sesión: se permanece en el formulario.
        },
      });
  }

  onSubmit(): void {
    if (this.enviando()) {
      return;
    }

    this.form.markAllAsTouched();
    this.mensajeError.set(null);

    // La empresa se elige en el selector: sin una empresa REAL de la lista no
    // se autentica (nunca se envía un slug inventado).
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

    this.tenantApi
      .login({
        empresa_slug: empresa.slug,
        correo: correo.trim(),
        password,
        // Contexto fijado por el frontend: esta pantalla es solo de personal.
        contexto: 'personal',
      })
      .pipe(
        // Sin identidad empresarial confirmada no hay sesión válida.
        switchMap(() => this.tenantApi.me()),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (identidad) => {
          this.enviando.set(false);
          if (identidad.contexto !== 'personal') {
            this.tenantApi.cerrarSesion();
            this.mensajeError.set(MENSAJE_SIN_PERFIL);
            return;
          }
          void this.router.navigateByUrl(this.destinoPersonal());
        },
        error: (error: unknown) => {
          // El JWT pudo llegar, pero si GET /auth/tenant/me falla (401/403/5xx)
          // no se declara autenticado: se limpia la sesión empresarial.
          this.tenantApi.cerrarSesion();
          this.enviando.set(false);
          this.mensajeError.set(this.mensajeParaError(error));
        },
      });
  }

  toggleMostrarPassword(): void {
    this.mostrarPassword.update((visible) => !visible);
  }

  /** Recuperación de contraseña aún no disponible: solo feedback visual. */
  avisoDeRecuperacion(): void {
    this.avisoRecuperacion.set(true);
    window.setTimeout(() => this.avisoRecuperacion.set(false), 4000);
  }

  /**
   * Carga el selector con las empresas REALES del backend
   * (`GET /auth/tenant/empresas`). Nunca se usa una lista fija y no se
   * preselecciona ninguna empresa.
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
          }
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
      return 'Selecciona la empresa a la que perteneces.';
    }
    if (control.hasError('pattern')) {
      return 'Selecciona una empresa de la lista.';
    }
    return null;
  }

  /** Mensaje para una empresa ausente o que ya no está disponible. */
  private mensajeEmpresaNoSeleccionada(): string {
    if (this.empresas().length === 0) {
      return this.errorEmpresas() ?? MENSAJE_SIN_EMPRESAS;
    }
    return this.form.controls.empresa_slug.value.trim().length === 0
      ? MENSAJE_EMPRESA_REQUERIDA
      : MENSAJE_EMPRESA_NO_DISPONIBLE;
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
   * Redirección tras un login o una restauración correctos, según el rol
   * empresarial que devolvió el backend. No se envía a nadie a pantallas
   * legacy como si sus módulos ya funcionaran en modo empresarial.
   */
  private destinoPersonal(): string {
    return this.tenantApi.esAdministrador()
      ? DESTINO_ADMINISTRADOR
      : DESTINO_NEUTRAL;
  }

  private redirigirSiEsPersonal(identidad: TenantIdentidad | null): void {
    if (identidad === null || identidad.contexto !== 'personal') {
      return;
    }
    void this.router.navigateByUrl(this.destinoPersonal());
  }

  private mensajeParaError(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      if (error.status === 401 || error.status === 403) {
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