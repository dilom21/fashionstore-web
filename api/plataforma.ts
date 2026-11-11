import type { IncomingMessage, ServerResponse } from 'node:http';

type VercelRequest = IncomingMessage & {
  query?: Record<string, string | string[] | undefined>;
  body?: unknown;
};
type VercelResponse = ServerResponse;

const PREFIX = '/api/plataforma';
const BACKEND_PREFIX = '/saas/superadmin';

// Allowlist por metodo y ruta: no abre rutas del backend ajenas al SUPERADMIN.
const ALLOW: Readonly<Record<string, readonly RegExp[]>> = {
  GET: [
    /^\/auth\/me$/,
    /^\/empresas$/,
    /^\/planes$/,
    /^\/empresas\/[1-9][0-9]*\/suscripciones$/,
  ],
  POST: [
    /^\/auth\/login$/,
    /^\/auth\/logout$/,
    /^\/empresas$/,
    /^\/planes$/,
    /^\/empresas\/[1-9][0-9]*\/suscripciones$/,
    /^\/empresas\/[1-9][0-9]*\/administrador-inicial$/,
  ],
  PATCH: [
    /^\/empresas\/[1-9][0-9]*\/estado$/,
    /^\/planes\/[1-9][0-9]*\/estado$/,
    /^\/empresas\/[1-9][0-9]*\/suscripciones\/[1-9][0-9]*\/estado$/,
  ],
};

const REQUEST_HEADERS = [
  'accept', 'accept-language', 'content-type',
  'cookie', 'origin', 'referer', 'x-csrf-token',
] as const;
const SKIP_RESPONSE_HEADERS = new Set([
  'connection', 'content-length', 'content-encoding', 'keep-alive',
  'transfer-encoding', 'upgrade', 'set-cookie',
]);

function respondJson(res: VercelResponse, code: number, detail: string): void {
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Pragma', 'no-cache');
  res.end(JSON.stringify({ detail }));
}

function pathForRequest(req: VercelRequest, url: URL): string {
  // Ruta pública original conservada cuando no existe reescritura.
  if (url.pathname.startsWith(`${PREFIX}/`)) return url.pathname;

  // vercel.json reescribe /api/plataforma/auth/me a
  // /api/plataforma?path=auth/me. No dependemos del catch-all Next.js.
  const rawPath = req.query?.path ?? url.searchParams.get('path');
  const rest = (Array.isArray(rawPath) ? rawPath.join('/') : rawPath ?? '')
    .replace(/^\/+/, '');
  if (!rest || !/^[a-zA-Z0-9_/-]+$/.test(rest) || rest.includes('//')) return '';
  return `${PREFIX}/${rest}`;
}

async function bodyBytes(req: VercelRequest): Promise<Buffer | undefined> {
  if (!['POST', 'PATCH'].includes(req.method ?? '')) return undefined;

  // Vercel puede entregar el cuerpo ya parseado: leer nuevamente el stream
  // resultaria en un POST vacio, rompiendo login y CSRF.
  if (Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === 'string') return Buffer.from(req.body);
  if (req.body !== null && req.body !== undefined) {
    return Buffer.from(JSON.stringify(req.body));
  }
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  const requestUrl = new URL(req.url ?? '/', 'https://vercel.invalid');
  const path = pathForRequest(req, requestUrl);
  if (!path.startsWith(`${PREFIX}/`)) {
    respondJson(res, 404, 'Ruta API no permitida');
    return;
  }
  const suffix = path.slice(PREFIX.length);
  const method = (req.method ?? '').toUpperCase();
  if (!(ALLOW[method] ?? []).some(rule => rule.test(suffix))) {
    respondJson(res, 404, 'Ruta o metodo no disponible');
    return;
  }

  const origin = process.env['SAAS_BACKEND_ORIGIN']?.replace(/\/$/, '');
  if (!origin || !/^https:\/\/[^/]+$/.test(origin)) {
    respondJson(res, 503, 'BFF sin origen HTTPS configurado');
    return;
  }

  // El parametro interno `path` de la ruta dinamica no se reenvia al backend.
  const search = new URLSearchParams(requestUrl.searchParams);
  search.delete('path');
  const query = search.toString();
  const upstreamUrl = `${origin}${BACKEND_PREFIX}${suffix}${query ? `?${query}` : ''}`;

  const headers = new Headers();
  for (const name of REQUEST_HEADERS) {
    const value = req.headers[name];
    if (typeof value === 'string') headers.set(name, value);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const body = await bodyBytes(req);
    if (body && !headers.has('content-type')) headers.set('content-type', 'application/json');
    const upstream = await fetch(upstreamUrl, {
      method,
      headers,
      body: body as BodyInit | undefined,
      signal: controller.signal,
      redirect: 'manual',
    });

    res.statusCode = upstream.status;
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Pragma', 'no-cache');
    upstream.headers.forEach((value, name) => {
      if (!SKIP_RESPONSE_HEADERS.has(name.toLowerCase())) {
        res.setHeader(name, value);
      }
    });
    const cookies = upstream.headers.getSetCookie?.() ?? [];
    if (cookies.length) res.setHeader('Set-Cookie', cookies);
    res.end(Buffer.from(await upstream.arrayBuffer()));
  } catch (error) {
    const detail = error instanceof Error && error.name === 'AbortError'
      ? 'Tiempo de espera agotado al contactar el backend'
      : 'Backend no disponible';
    respondJson(res, 503, detail);
  } finally {
    clearTimeout(timeout);
  }
}
