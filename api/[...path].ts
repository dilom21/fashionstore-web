import type { IncomingMessage, ServerResponse } from 'node:http';

const ALLOWED_PREFIX = '/api/plataforma/';
const HOP_BY_HOP = new Set([
  'connection',
  'content-length',
  'host',
  'keep-alive',
  'transfer-encoding',
  'upgrade',
]);
const FORWARDED_REQUEST_HEADERS = [
  'accept',
  'accept-language',
  'authorization',
  'cookie',
  'content-type',
  'origin',
  'referer',
  'user-agent',
  'x-csrf-token',
];

type VercelRequest = IncomingMessage & {
  query?: Record<string, string | string[] | undefined>;
  body?: unknown;
};

type VercelResponse = ServerResponse & {
  status: (code: number) => VercelResponse;
  json: (value: unknown) => void;
};

function json(res: VercelResponse, status: number, value: unknown): void {
  const body = JSON.stringify(value);
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(body);
}

function pathFromRequest(req: VercelRequest): string {
  const queryPath = req.query?.path;
  const segments = Array.isArray(queryPath)
    ? queryPath
    : typeof queryPath === 'string'
      ? [queryPath]
      : [];
  return `/api/${segments.map((part) => encodeURIComponent(part)).join('/')}`;
}

async function readBody(req: IncomingMessage): Promise<Buffer | undefined> {
  if (req.method === 'GET' || req.method === 'HEAD') return undefined;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return chunks.length ? Buffer.concat(chunks) : undefined;
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  const path = pathFromRequest(req);
  if (!path.startsWith(ALLOWED_PREFIX)) {
    json(res, 404, { detail: 'Ruta API no permitida' });
    return;
  }

  const origin = process.env['SAAS_BACKEND_ORIGIN']?.replace(/\/$/, '');
  if (!origin) {
    json(res, 503, { detail: 'BFF sin origen de backend configurado' });
    return;
  }

  const query = new URL(req.url ?? '', 'https://vercel.invalid').search;
  const headers = new Headers();
  for (const name of FORWARDED_REQUEST_HEADERS) {
    const value = req.headers[name];
    if (typeof value === 'string') headers.set(name, value);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const requestBody = await readBody(req);
    const upstream = await fetch(`${origin}${path}${query}`, {
      method: req.method ?? 'GET',
      headers,
      body: requestBody ? (requestBody as unknown as BodyInit) : undefined,
      signal: controller.signal,
      redirect: 'manual',
    });

    res.statusCode = upstream.status;
    res.setHeader('Cache-Control', 'no-store');
    upstream.headers.forEach((value, name) => {
      if (!HOP_BY_HOP.has(name) && name !== 'set-cookie') {
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
    json(res, 503, { detail });
  } finally {
    clearTimeout(timeout);
  }
}
