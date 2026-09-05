/**
 * Utilidades de presentación para el dominio de Roles (CU04).
 *
 * El backend identifica roles base por NOMBRE (nunca por id). Estas constantes
 * y funciones permiten mostrar nombres amigables sin hardcodear ids.
 */

/** Roles base definidos por el backend (identificados por nombre). */
export const ROLES_BASE: readonly string[] = [
  'ADMINISTRADOR',
  'ENCARGADO_SUCURSAL',
  'CAJERO',
  'CLIENTE',
];

/** Nombre exacto del rol con protección especial (backend lo valida). */
export const NOMBRE_ROL_ADMINISTRADOR = 'ADMINISTRADOR';

/** Etiquetas legibles preferidas para códigos conocidos. */
const ETIQUETAS_CONOCIDAS: Readonly<Record<string, string>> = {
  SEGURIDAD: 'Seguridad',
  CATALOGO: 'Catálogo',
  INVENTARIO: 'Inventario',
  RESERVAS: 'Reservas',
  VENTAS: 'Ventas y pagos',
  VENTAS_PAGOS: 'Ventas y pagos',
  COMPRAS: 'Compras y proveedores',
  COMPRAS_PROVEEDORES: 'Compras y proveedores',
  REPORTES: 'Reportes',
  GESTIONAR_USUARIOS: 'Gestionar usuarios',
  GESTIONAR_ROLES: 'Gestionar roles',
  CONSULTAR_BITACORA: 'Consultar bitácora',
  ADMINISTRADOR: 'Administrador',
  ENCARGADO_SUCURSAL: 'Encargado de sucursal',
  CAJERO: 'Cajero',
  CLIENTE: 'Cliente',
  CREAR: 'Crear',
  CONSULTAR: 'Consultar',
  EDITAR: 'Editar',
  ELIMINAR: 'Eliminar',
  EJECUTAR: 'Ejecutar',
  MODIFICAR: 'Modificar',
};

/** true si el nombre corresponde al rol ADMINISTRADOR. */
export function esRolAdministrador(nombre: string): boolean {
  return nombre.trim().toUpperCase() === NOMBRE_ROL_ADMINISTRADOR;
}

/** true si el nombre pertenece al conjunto de roles base del backend. */
export function esRolBase(nombre: string): boolean {
  const normalizado = nombre.trim().toUpperCase();
  return ROLES_BASE.some((base) => base === normalizado);
}

/** Convierte un código (MODULO_FUNCION) en una etiqueta legible. */
export function humanizarCodigo(codigo: string): string {
  const clave = codigo.trim().toUpperCase();
  const conocida = ETIQUETAS_CONOCIDAS[clave];
  if (conocida !== undefined) {
    return conocida;
  }
  if (clave.length === 0) {
    return codigo;
  }
  const palabras = clave
    .split('_')
    .filter(Boolean)
    .map((palabra) => palabra.toLowerCase());
  const primera = palabras[0] ?? '';
  const resto = palabras.slice(1);
  return [primera.charAt(0).toUpperCase() + primera.slice(1), ...resto].join(' ');
}

/** Etiqueta amigable de un rol para listas y encabezados. */
export function nombreRolAmigable(nombre: string): string {
  return humanizarCodigo(nombre);
}
