/**
 * Credenciales de las pruebas E2E.
 *
 * Se leen EXCLUSIVAMENTE de `process.env`; nunca hay valores por defecto,
 * correos ni contraseñas en el repositorio. Si falta una variable, la prueba
 * debe fallar con un mensaje explícito: `test.skip` fingiría cobertura.
 */

/** Error de configuración con el nombre exacto de la variable que falta. */
export class FaltaVariableEntorno extends Error {
  constructor(variable: string) {
    super(
      `Falta la variable de entorno ${variable}. ` +
        'Las pruebas E2E no usan credenciales por defecto: ejecútalas con el ' +
        'runner database/saas/123_e2e_navegador_5bz.py, que las inyecta desde ' +
        'el staging local de datos ficticios.',
    );
    this.name = 'FaltaVariableEntorno';
  }
}

/** Devuelve el valor de una variable obligatoria o falla con su nombre. */
export function requerida(variable: string): string {
  const valor = process.env[variable];
  if (valor === undefined || valor.trim().length === 0) {
    throw new FaltaVariableEntorno(variable);
  }
  return valor;
}

/** Credenciales disponibles para los escenarios del proyecto `saas`. */
export interface CredencialesE2E {
  correoA: string;
  correoB: string;
  correoCajeroB: string;
  password: string;
}

/**
 * Credenciales completas.
 *
 * Se resuelve DENTRO de cada prueba (no al importar el módulo) para que el
 * archivo se recolecte aunque falte configuración y el fallo apunte al test.
 */
export function credenciales(): CredencialesE2E {
  return {
    correoA: requerida('E2E_CORREO_A'),
    correoB: requerida('E2E_CORREO_B'),
    correoCajeroB: requerida('E2E_CORREO_CAJERO_B'),
    password: requerida('E2E_PASSWORD'),
  };
}
