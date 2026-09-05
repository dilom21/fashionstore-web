/**
 * Modelos de datos del dominio de autenticación y seguridad.
 *
 * Los nombres de propiedad coinciden exactamente con el JSON real que expone
 * el backend FastAPI (access_token, token_type, cliente_id, empleado_id,
 * sucursal_id). No se convierten a camelCase para mantener compatibilidad
 * directa con la API.
 */

/** Credenciales de acceso, comunes para clientes y personal. */
export interface LoginRequest {
  correo: string;
  password: string;
}

/** Contexto de autenticación dentro de la aplicación. */
export type AuthContext = 'cliente' | 'personal';

/**
 * Identidad/sesión básica que devuelve GET /auth/me.
 * No incluye nombre, apellido, cliente_id, empleado_id ni sucursal_id:
 * esos datos solo llegan en la respuesta del login.
 */
export interface UsuarioAuth {
  id: number;
  correo: string;
  rol: string;
  contexto: AuthContext;
}

/** Usuario cliente con los datos completos del login (POST /auth/clientes/login). */
export interface ClienteAuth extends UsuarioAuth {
  cliente_id: number;
  nombre: string;
  apellido: string;
}

/** Usuario de personal con los datos completos del login (POST /auth/personal/login). */
export interface PersonalAuth extends UsuarioAuth {
  empleado_id: number;
  nombre: string;
  apellido: string;
  sucursal_id: number;
}

/** Parte común de toda respuesta de login (JWT emitido por FastAPI). */
export interface LoginResponseBase {
  access_token: string;
  token_type: string;
}

/** Respuesta de POST /auth/clientes/login. */
export interface ClienteLoginResponse extends LoginResponseBase {
  usuario: ClienteAuth;
}

/** Respuesta de POST /auth/personal/login. */
export interface PersonalLoginResponse extends LoginResponseBase {
  usuario: PersonalAuth;
}
