/**
 * Selección e identificación de la EMPRESA (tenant) en las pantallas de acceso.
 *
 * El mecanismo SaaS exige `empresa_slug` EXPLÍCITO en:
 * - `POST /auth/tenant/login` (contexto "cliente" y "personal"),
 * - `POST /auth/tenant/clientes/registro`.
 *
 * Reglas de este módulo:
 * - La lista de empresas SIEMPRE proviene de `GET /auth/tenant/empresas`
 *   (`TenantApiService.empresasPublicas()`). Aquí no hay listas fijas ni
 *   empresas de ejemplo: una empresa inventada nunca llega al backend.
 * - Ninguna empresa se selecciona automáticamente: el usuario la elige y el
 *   formulario no se envía sin una empresa válida.
 * - El slug que se envía se valida contra la lista realmente devuelta por el
 *   backend (`buscarEmpresaPorSlug`), de modo que una empresa inexistente o que
 *   ya no aparece disponible se rechaza antes de llamar a la API.
 * - Solo viven funciones PURAS de normalización/búsqueda, para que el login del
 *   cliente, el login del personal y el registro validen igual.
 *
 * `environment.empresaSlug` se conserva como metadato público del despliegue
 * (`obtenerEmpresaSlugPublica`), pero YA NO decide a qué empresa se autentica:
 * esa decisión es del selector y el backend la confirma con `/auth/tenant/me`.
 */
import { environment } from '../../../environments/environment';

/**
 * Patrón de `empresa_slug` acordado con FastAPI
 * (`TenantLoginRequest.empresa_slug`): minúsculas, números y guiones simples.
 * Es el mismo que valida la columna `empresa.slug` en PostgreSQL.
 */
export const PATRON_EMPRESA_SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/**
 * Empresa que puede elegirse en los formularios de acceso.
 *
 * Coincide con la respuesta de `GET /auth/tenant/empresas`:
 * `{ slug, nombre_comercial }`. Se muestra el nombre comercial y se conserva
 * el slug como identificador interno (es lo único que viaja al backend).
 */
export interface EmpresaPublicaOpcion {
  slug: string;
  nombre_comercial: string;
}

/**
 * Normaliza un slug de empresa (recortes + minúsculas) y comprueba el contrato
 * del backend. Devuelve `null` si no es un slug válido.
 */
export function normalizarSlugEmpresa(
  valor: string | null | undefined,
): string | null {
  const slug = (valor ?? '').trim().toLowerCase();
  if (slug.length === 0 || slug.length > 80) {
    return null;
  }
  return PATRON_EMPRESA_SLUG.test(slug) ? slug : null;
}

/**
 * Busca una empresa en la lista devuelta por el backend.
 *
 * Devuelve `null` cuando el slug no es válido o cuando NO aparece en la lista
 * disponible: una empresa inexistente (o ya deshabilitada) nunca se usa para
 * autenticar ni para registrar.
 */
export function buscarEmpresaPorSlug(
  empresas: readonly EmpresaPublicaOpcion[],
  slug: string | null | undefined,
): EmpresaPublicaOpcion | null {
  const buscado = normalizarSlugEmpresa(slug);
  if (buscado === null) {
    return null;
  }
  return (
    empresas.find(
      (empresa) => normalizarSlugEmpresa(empresa.slug) === buscado,
    ) ?? null
  );
}

/**
 * `empresa_slug` configurado en el entorno, normalizado, o `null`.
 *
 * Es un METADATO del despliegue (no un secreto y no autoriza nada). El login ya
 * no lo usa para autenticar: la empresa la elige el usuario en el selector y el
 * backend confirma empresa, contexto y membresía con `/auth/tenant/me`.
 */
export function obtenerEmpresaSlugPublica(): string | null {
  const configurado = environment.empresaSlug ?? '';
  const slug = configurado.trim().toLowerCase();
  if (slug.length === 0 || slug.length > 80) {
    return null;
  }
  return PATRON_EMPRESA_SLUG.test(slug) ? slug : null;
}
