/**
 * Entorno de la aplicación.
 *
 * La URL base de la API (backend FastAPI de FashionStore / VANTER MEN) queda
 * centralizada aquí. Ningún servicio debe escribir esta URL directamente.
 *
 * Por ahora existe un único archivo de entorno y no hay 'fileReplacements'
 * configurado en angular.json, por lo que este valor se usa tanto en desarrollo
 * como en cualquier build actual. Cuando se configuren entornos adicionales
 * (p. ej. producción en Render), los valores se separarán por entorno.
 */
export const environment = {
  apiUrl: 'https://fashionstore-api-qv8n.onrender.com',
};
