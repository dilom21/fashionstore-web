import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  isMainModule,
  writeResponseToNodeResponse,
} from '@angular/ssr/node';
import express from 'express';
import { join } from 'node:path';

const browserDistFolder = join(import.meta.dirname, '../browser');

const app = express();
const angularApp = new AngularNodeAppEngine();

/** BFF same-origin para la administración de plataforma. Nunca reenvía una
 * API key al navegador: solo conserva cookies y un allowlist de rutas. */
app.use('/api/plataforma', express.json({ limit: '32kb' }), async (req, res, next) => {
  const allowed = /^(GET|POST|PATCH) \/(auth\/(login|me|logout)|empresas(?:\/[^/]+(?:\/estado|\/suscripciones|\/administrador-inicial)?)?|planes(?:\/[^/]+\/estado)?)$/;
  if (!allowed.test(`${req.method} ${req.path}`)) { res.status(404).json({ detail: 'Ruta no disponible' }); return; }
  const origin = process.env['SAAS_BACKEND_ORIGIN']?.replace(/\/$/, '');
  if (!origin || !/^https:\/\//.test(origin) && process.env['NODE_ENV'] === 'production') {
    res.status(503).json({ detail: 'Proxy de plataforma no configurado' }); return;
  }
  const target = `${origin || 'http://127.0.0.1:8000'}/saas/superadmin${req.path}`;
  try {
    const headers: Record<string, string> = { accept: 'application/json' };
    if (req.headers['cookie']) headers['cookie'] = String(req.headers['cookie']);
    if (req.headers['x-csrf-token']) headers['x-csrf-token'] = String(req.headers['x-csrf-token']);
    if (req.headers['origin']) headers['origin'] = String(req.headers['origin']);
    if (req.body && ['POST', 'PATCH'].includes(req.method)) headers['content-type'] = 'application/json';
    const upstream = await fetch(target, { method: req.method, headers, body: ['POST', 'PATCH'].includes(req.method) ? JSON.stringify(req.body ?? {}) : undefined });
    res.status(upstream.status);
    const setCookies = upstream.headers.getSetCookie?.() ?? [];
    if (setCookies.length) res.setHeader('set-cookie', setCookies);
    res.setHeader('cache-control', 'no-store');
    res.setHeader('pragma', 'no-cache');
    const body = await upstream.text();
    res.type('application/json').send(body);
  } catch { res.status(503).json({ detail: 'Backend de plataforma no disponible' }); }
});

/**
 * Example Express Rest API endpoints can be defined here.
 * Uncomment and define endpoints as necessary.
 *
 * Example:
 * ```ts
 * app.get('/api/{*splat}', (req, res) => {
 *   // Handle API request
 * });
 * ```
 */

/**
 * Serve static files from /browser
 */
app.use(
  express.static(browserDistFolder, {
    maxAge: '1y',
    index: false,
    redirect: false,
  }),
);

/**
 * Un cliente que cancela la petición (recarga, navegación, cierre de pestaña o
 * recarga en caliente del dev-server) hace que Angular SSR aborte el render y
 * rechace con `AbortError`. No es un fallo de la aplicación: el cliente ya no
 * espera respuesta, así que se descarta sin registrar la traza.
 */
function esAbortoDeCliente(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { name?: unknown }).name === 'AbortError'
  );
}

/**
 * Handle all other requests by rendering the Angular application.
 */
app.use((req, res, next) => {
  angularApp
    .handle(req)
    .then((response) =>
      response ? writeResponseToNodeResponse(response, res) : next(),
    )
    .catch((error: unknown) => {
      if (esAbortoDeCliente(error)) {
        return;
      }
      next(error);
    });
});

/**
 * Red de seguridad: cualquier `AbortError` que llegue por el canal de errores de
 * Express (desconexión del cliente) se descarta sin imprimir la traza.
 */
app.use(
  (
    error: unknown,
    _req: express.Request,
    _res: express.Response,
    next: express.NextFunction,
  ) => {
    if (esAbortoDeCliente(error)) {
      return;
    }
    next(error);
  },
);

/**
 * Start the server if this module is the main entry point, or it is ran via PM2.
 * The server listens on the port defined by the `PORT` environment variable, or defaults to 4000.
 */
if (isMainModule(import.meta.url) || process.env['pm_id']) {
  const port = process.env['PORT'] || 4000;
  app.listen(port, (error) => {
    if (error) {
      throw error;
    }

    console.log(`Node Express server listening on http://localhost:${port}`);
  });
}

/**
 * Request handler used by the Angular CLI (for dev-server and during build) or Firebase Cloud Functions.
 */
export const reqHandler = createNodeRequestHandler(app);
