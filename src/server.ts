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
