# FashionStore — Contexto Frontend CU05
## Consultar Bitácora del Sistema

## Estado actual
Frontend Angular `fashionstore-web`.

Ya están completos:
- CU03 Gestionar Usuarios
- CU04 Gestionar Roles y Permisos
- Admin shell y sidebar
- interceptor JWT
- manejo de errores reutilizable
- confirm dialog reutilizable

Sidebar actual:
```text
Seguridad
├── Gestionar Usuarios
├── Gestionar Roles y Permisos
└── Consultar Bitácora
```

Ruta preparada:
`/admin/seguridad/bitacora`

CU05 debe reemplazar la pantalla temporal por una implementación real.

No crear otro shell/sidebar. No tocar backend/Supabase/.env/git.

## API esperada
Consumir el contrato REAL del backend:
- `GET /bitacora`
- `GET /bitacora/catalogos`
- `GET /bitacora/{bitacora_id}`

Filtros esperados:
- buscar
- usuario_id
- accion
- entidad_afectada
- fecha_desde
- fecha_hasta
- limit
- offset

No inventar endpoints si Swagger real difiere ligeramente.

## Objetivo UI
Pantalla administrativa de auditoría **solo lectura**.

Debe permitir:
- ver eventos recientes
- buscar
- filtrar
- paginar
- abrir detalle

NO permitir:
- crear
- editar
- eliminar
- limpiar la bitácora

## Diseño principal
Ruta:
`/admin/seguridad/bitacora`

Cabecera:
```text
Bitácora del sistema
Consulta las actividades registradas en FashionStore
```

Filtros:
```text
[Buscar...] [Usuario ▼] [Acción ▼] [Entidad ▼]
[Desde 📅] [Hasta 📅] [Limpiar filtros]
```

Tabla desktop:
`Fecha y hora | Usuario | Acción | Entidad | IP | Descripción | Ver`

Móvil: preferir cards/apilado si evita scroll horizontal excesivo.

## Catálogos
Los selects deben cargarse desde `GET /bitacora/catalogos`.
No derivar acciones/entidades solo de la página visible.
No hardcodear IDs ni listas.

## Usuario e IP nulos
Si `usuario` es null mostrar `Sistema`.
Si `ip` es null mostrar `—` o `No disponible`.

## Detalle
Al pulsar Ver, mostrar modal/dialog o panel lateral de solo lectura con:
- ID
- fecha/hora
- usuario
- rol
- acción
- entidad
- IP
- descripción completa

No usar `innerHTML` para descripción.

## Paginación
Usar `total`, `limit`, `offset` del backend.
Mostrar total y navegación anterior/siguiente.
Opcional tamaños 25/50/100.
No cargar toda la bitácora en memoria.

## Fechas
Backend devuelve ISO 8601.
Mostrar hora local del navegador con formato consistente.
Los inputs deben enviar el formato esperado por la API.

## Feature sugerido
```text
features/administracion/bitacora/
├── models/
├── services/
├── pages/
├── components/
└── utils/
```

Servicio sugerido: `BitacoraService`
Métodos:
- listarBitacora(filtros)
- obtenerBitacora(id)
- obtenerCatalogos()

Interfaces estrictas, no `any`.

## Humanización
Centralizar nombres visibles:
- MODIFICAR → Modificar
- usuario → Usuario
etc.

No modificar los valores reales enviados al backend.

## Sidebar
Actualizar `Consultar Bitácora` de `Próx./en construcción` a `funcional`.
Debe permanecer activa en `/admin/seguridad/bitacora`.
CU03 y CU04 intactos.

## Seguridad frontend
El backend es autoridad real.
401 → cerrar sesión y redirigir a login personal según convención existente.
403 → mensaje amigable / comportamiento consistente.
Reutilizar utilidades de error existentes.

## UX
Incluir:
- loading
- empty state
- error
- reintentar
- limpiar filtros
- total
- detalle

No botones de escritura.

## Responsive y accesibilidad
Desktop: tabla completa.
Tablet: compactar columnas.
Móvil: cards/apilado.

Accesibilidad:
- labels
- headers de tabla
- aria-label
- foco visible
- no depender solo del color

## Pruebas frontend
1. sidebar → Bitácora
2. carga inicial
3. paginación
4. búsqueda
5. filtro usuario
6. filtro acción
7. filtro entidad
8. fechas
9. combinar filtros
10. limpiar filtros
11. detalle
12. usuario null
13. IP null
14. empty state
15. 401
16. 403
17. responsive

Regresión:
- CU03
- CU04
- /admin/inicio
- sidebar
- login personal
- logout

Build:
`npm run build`

## Criterio de terminado
CU05 frontend completo cuando la ruta sea funcional, exista listado paginado, filtros reales, detalle, nulls manejados, solo lectura, sidebar actualizada, responsive y build verde.
