# Operación offline de la PWA (T07)

Módulo `src/app/saas/offline`: cola local, caché de consulta y sincronización
idempotente de **ventas de contado** y **reservas** contra los contratos tenant.

## Componentes

| Archivo | Responsabilidad |
| --- | --- |
| `offline.models.ts` | Tipos, estados, backoff y etiquetas de la cola. |
| `offline-db.service.ts` | IndexedDB versionada (`fashionstore_saas_offline`, v1). |
| `offline-queue.service.ts` | Deduplicación por UUID, transiciones y caché por scope. |
| `saas-connectivity.service.ts` | Señal `enLinea` desde `online`/`offline`. |
| `offline-sync.service.ts` | Drenaje contra `/tenant/**`, reintentos y conflictos. |
| `saas-offline-panel` | Indicador, contador, botón de sincronizar y conflictos. |

## Esquema local (v1)

- `operaciones` (`keyPath: operacion_id`): índice compuesto
  `por_scope = [empresa_id, usuario_id]`, más `por_estado` y `por_tipo`.
- `cache` (`keyPath: clave`): inventario y sucursales consultados, con
  `actualizado_en` para avisar que el dato puede estar desactualizado.
- `meta`: solo `scope_activo`; nunca tokens ni credenciales.

Cada registro guarda empresa, usuario, tipo, estado, intentos, backoff, la carga
mínima del contrato y el resultado público. El JWT permanece únicamente en
`sessionStorage`; **no** se copia a IndexedDB.

## Estados y reintentos

`PENDIENTE → ENVIADO → CONFIRMADO | CONFLICTO | ERROR`.

- Backoff exponencial: 2 s, 4 s, 8 s, 16 s y 32 s; tras 5 intentos queda
  `ERROR` y exige reintento manual.
- Un `ENVIADO` huérfano (pestaña cerrada) se reclama y reenvía.
- Nada se borra por enviarse; solo `descartar` elimina un registro revisado.

## Contratos usados

- `POST /tenant/ventas/contado` con el mismo `operacion_id` UUID: el servidor
  responde 200 en el replay idéntico.
- `POST /tenant/reservas` (contexto cliente). El contrato no acepta clave de
  idempotencia: antes de reintentar se consulta `GET /tenant/cliente/reservas` y
  se confirma si ya existe la misma reserva (carrito + fecha de atención).
- `PATCH /tenant/reservas/{id}/cancelar|finalizar-sin-compra`. Ante 409 se
  consulta el estado vigente: si ya es `CANCELADA`/`ATENDIDA`, se confirma.

Ninguna ruta legacy (`/ventas/presencial`, `/pagos`, etc.) se usa en la cola.

## Aislamiento y limpieza

- Lecturas y escrituras siempre filtradas por `empresa_id` + `usuario_id`.
- Cambio de empresa/usuario: se borra el scope anterior antes de cargar el nuevo.
- `SaasSessionService.cerrarSesion()` borra toda la base local (operaciones,
  caché y metadatos) para no dejar información de la empresa anterior.

## Límites conocidos

- `POST /tenant/reservas` exige contexto **cliente**; la creación offline se
  ofrece en el canal cliente (`/saas/cliente`). La pantalla `/saas/reservas`
  (personal) encola cancelaciones y finalizaciones.
- El contrato de reservas no publica una clave de idempotencia; la deduplicación
  se resuelve consultando el listado del cliente.
- La instalación PWA y el ciclo real offline/online no se ejercitaron en un
  navegador automatizado; la evidencia es el build con `ngsw.json`,
  `ngsw-worker.js` y el manifest, más las pruebas con IndexedDB simulado.
