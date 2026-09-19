/**
 * Entorno de la aplicación.
 *
 * URL base del backend FastAPI (FashionStore / VANTER MEN), centralizada aquí.
 * Todos los servicios construyen sus peticiones como `environment.apiUrl` +
 * ruta del endpoint; ningún servicio escribe el host directamente.
 *
 * Desarrollo local: backend FastAPI levantado con Uvicorn en http://127.0.0.1:8000
 */
export const environment = {
  apiUrl: 'http://127.0.0.1:8000',
};
