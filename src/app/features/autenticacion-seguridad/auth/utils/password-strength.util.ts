/**
 * Política de contraseña de clientes: MISMA regla que valida el backend
 * (POST /auth/clientes/registro). No se hace ninguna petición para evaluarla.
 *
 * Reglas exactas:
 *  1. longitud entre 8 y 128 caracteres;
 *  2. al menos una letra minúscula a-z;
 *  3. al menos una letra MAYÚSCULA A-Z;
 *  4. al menos un número 0-9;
 *  5. al menos un carácter especial: cualquier carácter que NO sea A-Z, a-z,
 *     0-9 ni espacio. El ESPACIO no cuenta como carácter especial.
 */

export const PASSWORD_MIN_LONGITUD = 8;
export const PASSWORD_MAX_LONGITUD = 128;

export type NivelPassword = 'insegura' | 'media' | 'segura';

/** Resultado de evaluar una contraseña contra la política real. */
export interface PasswordStrength {
  /** 8 a 128 caracteres. */
  longitud: boolean;
  minuscula: boolean;
  mayuscula: boolean;
  numero: boolean;
  /** Cualquier carácter que no sea A-Z, a-z, 0-9 ni espacio. */
  especial: boolean;
  /** 0 a 5 requisitos cumplidos (para la barra y el checklist). */
  cantidadCumplida: number;
  nivel: NivelPassword;
  /** `true` solo cuando cumple los 5 requisitos (nivel VERDE). */
  valida: boolean;
}

/** Fila del checklist visible bajo la barra de fortaleza. */
export interface RequisitoPassword {
  clave: 'longitud' | 'mayuscula' | 'minuscula' | 'numero' | 'especial';
  etiqueta: string;
  cumple: boolean;
}

const RE_MINUSCULA = /[a-z]/;
const RE_MAYUSCULA = /[A-Z]/;
const RE_NUMERO = /[0-9]/;
/** Especial = todo lo que no sea A-Z, a-z, 0-9 ni espacio. */
const RE_ESPECIAL = /[^A-Za-z0-9\s]/;

/** Orden del checklist (mismo que se explica al usuario). */
const REQUISITOS_BASE: readonly {
  clave: RequisitoPassword['clave'];
  etiqueta: string;
}[] = [
  { clave: 'longitud', etiqueta: '8 a 128 caracteres' },
  { clave: 'mayuscula', etiqueta: 'Una letra mayúscula' },
  { clave: 'minuscula', etiqueta: 'Una letra minúscula' },
  { clave: 'numero', etiqueta: 'Un número' },
  { clave: 'especial', etiqueta: 'Un carácter especial' },
];

/** Evalúa la contraseña con las reglas EXACTAS del backend. */
export function evaluarFortalezaPassword(password: string): PasswordStrength {
  const valor = password ?? '';

  const longitud =
    valor.length >= PASSWORD_MIN_LONGITUD &&
    valor.length <= PASSWORD_MAX_LONGITUD;
  const minuscula = RE_MINUSCULA.test(valor);
  const mayuscula = RE_MAYUSCULA.test(valor);
  const numero = RE_NUMERO.test(valor);
  const especial = RE_ESPECIAL.test(valor);

  const cantidadCumplida = [
    longitud,
    minuscula,
    mayuscula,
    numero,
    especial,
  ].filter(Boolean).length;

  // Solo 5/5 es VERDE (cumple la política). Con 3 o 4 requisitos el nivel es
  // medio; con 0-2 la contraseña todavía es insegura.
  const nivel: NivelPassword =
    cantidadCumplida === 5
      ? 'segura'
      : cantidadCumplida >= 3
        ? 'media'
        : 'insegura';

  return {
    longitud,
    minuscula,
    mayuscula,
    numero,
    especial,
    cantidadCumplida,
    nivel,
    valida: cantidadCumplida === 5,
  };
}

/** Checklist de requisitos con el estado real de cada uno. */
export function requisitosPassword(
  fortaleza: PasswordStrength,
): RequisitoPassword[] {
  return REQUISITOS_BASE.map((requisito) => ({
    ...requisito,
    cumple: fortaleza[requisito.clave],
  }));
}

/** Ancho de la barra (0-100) proporcional a los requisitos cumplidos. */
export function progresoFortaleza(fortaleza: PasswordStrength): number {
  return Math.round(
    (fortaleza.cantidadCumplida / REQUISITOS_BASE.length) * 100,
  );
}

/** Etiqueta visible del nivel de fortaleza. */
export function etiquetaNivel(fortaleza: PasswordStrength): string {
  if (fortaleza.nivel === 'segura') {
    return 'SEGURA';
  }
  return fortaleza.nivel === 'media' ? 'NIVEL MEDIO' : 'INSEGURA';
}
