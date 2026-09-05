# FashionStore — Contexto Frontend CU04
## Gestionar Roles y Permisos

## 1. Proyecto
Frontend: Angular (`fashionstore-web`)

Angular consume únicamente FastAPI.
No conectar Angular directamente a Supabase.
No modificar backend desde la ventana frontend.
No modificar `.env`.
No instalar librerías innecesarias.
No hacer commit ni push.

## 2. Estado actual frontend
CU03 — Gestionar Usuarios está terminado.

Rutas actuales:
- /admin/inicio
- /admin/usuarios
- /admin/usuarios/nuevo
- /admin/usuarios/:id
- /admin/usuarios/:id/editar

Layout administrativo:
features/administracion/
- administracion-shell/
- administracion.routes.ts
- models/admin-nav-item.ts
- navigation/admin-nav.config.ts
- components/admin-icon/
- components/admin-sidebar/
- components/modulo-en-construccion/
- inicio/
- usuarios/

Sidebar:
Inicio
Seguridad
  - Gestionar Usuarios (funcional)
  - Gestionar Roles y Permisos (en construcción)
  - Consultar Bitácora (en construcción)
Catálogo
Inventario
Reservas
Ventas y Pagos
Compras y Proveedores
Reportes

Ruta ya preparada:
`/admin/seguridad/roles-permisos`

CU04 debe reemplazar la pantalla temporal por implementación real.

## 3. Diseño visual
Mantener:
- sidebar azul marino
- VANTER MEN
- item activo azul
- iconos SVG reutilizables
- responsive
- sidebar colapsable
- drawer móvil
- tarjeta de sesión
- estilo coherente con login interno

No crear otro shell/sidebar.

## 4. APIs backend esperadas
Consumir contrato REAL del backend:
- GET /roles
- GET /roles/{rol_id}
- POST /roles
- PATCH /roles/{rol_id}
- PATCH /roles/{rol_id}/estado
- GET /roles/catalogo-permisos
- GET /roles/{rol_id}/permisos
- PUT /roles/{rol_id}/permisos

Debe seguir funcionando:
- GET /roles?asignable_interno=true

No inventar endpoints si Swagger real difiere ligeramente.

## 5. Objetivo frontend
Permitir:
- listar roles
- seleccionar rol
- crear rol
- editar rol
- habilitar/deshabilitar
- consultar permisos
- editar matriz
- guardar permisos

## 6. Pantalla principal
Ruta:
`/admin/seguridad/roles-permisos`

Desktop:
panel izquierdo de roles + panel derecho de permisos.

Móvil:
selector de rol + módulos acordeón.

## 7. Matriz de permisos
Agrupar por módulo.

Columnas:
- Crear
- Consultar
- Editar
- Eliminar
- Ejecutar

Humanizar nombres visibles:
- GESTIONAR_USUARIOS → Gestionar usuarios
- CONSULTAR_BITACORA → Consultar bitácora

Enviar IDs reales al backend.
No hardcodear IDs.

## 8. Interacciones
Permitir:
- marcar/desmarcar
- seleccionar función completa
- opcional seleccionar módulo completo
- detectar cambios
- Guardar
- Descartar
- confirmación antes de reemplazar matriz

No guardar checkbox por checkbox.
Un solo `PUT /roles/{id}/permisos`.

## 9. ADMINISTRADOR protegido
Al seleccionar ADMINISTRADOR:
- matriz completa solo lectura
- badge "Rol del sistema"
- no deshabilitar
- no renombrar

Backend también valida.

## 10. Roles base
- ADMINISTRADOR
- ENCARGADO_SUCURSAL
- CAJERO
- CLIENTE

Mostrar nombres amigables.
No usar IDs fijos.

## 11. Crear rol
Campos:
- nombre
- descripcion

Validaciones:
- required
- nombre limpio
- mensaje amigable ante 409

Tras crear:
- refrescar
- seleccionar rol
- permitir configurar permisos

## 12. Editar rol
Respetar protecciones backend.
Roles personalizados: nombre/descripcion/estado según API.

## 13. Estado
Reutilizar `shared/components/confirm-dialog` si sirve.
Manejar 409 por usuarios activos.

## 14. Servicios
Reutilizar/refactorizar servicio de roles existente sin romper CU03.

Métodos conceptuales:
- listarRoles
- obtenerRol
- crearRol
- actualizarRol
- cambiarEstadoRol
- obtenerCatalogoPermisos
- obtenerPermisosRol
- guardarPermisosRol

## 15. Modelos
Interfaces estrictas, no `any`:
- Rol
- RolDetalle
- RolCreateRequest
- RolUpdateRequest
- Accion
- FuncionPermisos
- ModuloPermisos
- PermisoSeleccionado
- RolPermisos
- RolPermisosUpdate

## 16. Estado UI
Gestionar:
- loadingRoles
- loadingPermisos
- saving
- error
- success
- dirty
- selectedRole

Si cambia de rol con cambios sin guardar, pedir confirmación o bloquear cambio.

## 17. Sidebar
Actualizar `admin-nav.config.ts`:
- Gestionar Roles y Permisos deja de ser Próx.
- ruta /admin/seguridad/roles-permisos activa
- CU03 intacto
- Bitácora sigue en construcción

## 18. Permisos reales
`AdminNavItem` ya tiene campo permiso.
Dejar preparada integración futura, pero no inventar permisos de sesión si backend no los expone.
Backend sigue siendo fuente de seguridad.

## 19. Errores
- 401 sesión expirada
- 403 sin permiso
- 404 recurso no encontrado
- 409 duplicado / rol en uso
- 422 validación

Reutilizar utilidades de CU03.

## 20. Responsive
Desktop:
- roles izquierda
- matriz derecha

Tablet:
- panel compacto

Móvil:
- selector de rol
- módulos acordeón
- checkboxes legibles

## 21. Accesibilidad
- labels
- aria-label en iconos
- checkboxes accesibles
- foco visible
- no depender solo del color

## 22. Pruebas
- abrir CU04 desde sidebar
- listar roles
- seleccionar
- matriz
- crear
- editar
- guardar permisos
- descartar
- ADMINISTRADOR read-only
- 409 rol en uso
- 401/403
- responsive
- logout

Regresión:
- CU03 /admin/usuarios
- /admin/inicio
- sidebar
- login personal

Build:
`npm run build`

## 23. Resultado esperado
CU04 FRONTEND:
- lista de roles
- CRUD lógico
- matriz módulo/función/acción
- edición atómica visual
- protección visual ADMINISTRADOR
- sidebar integrada
- manejo de errores
- responsive
- CU03 intacto
