/**
 * Modelos del modo SaaS (multiempresa).
 *
 * Reflejan EXACTAMENTE el contrato del backend SaaS (`/auth/tenant/*` y
 * `/tenant/*`). No se inventan campos: cuando un dato todav├¡a no est├í expuesto
 * por un endpoint tenant se marca como opcional y se documenta.
 */

/** Contexto con el que se abre la sesi├│n de una empresa. */
export type TenantContexto = 'personal' | 'cliente';

/** Roles conocidos por el backend legacy; se comparan sin distinguir may├║sculas. */
export const TENANT_ROL_ADMINISTRADOR = 'ADMINISTRADOR';

/* ============================== Autenticaci├│n ============================== */

/** Body de `POST /auth/tenant/login` (`extra=forbid`: sin campos extra). */
export interface TenantLoginRequest {
  correo: string;
  password: string;
  empresa_slug: string;
  contexto: TenantContexto;
}

/** Respuesta 200 de `POST /auth/tenant/login`. */
export interface TenantLoginResponse {
  access_token: string;
  token_type: string;
  empresa_id: number;
  empresa_slug: string;
  empresa_nombre: string;
  rol: string;
  contexto: TenantContexto;
}

/** Respuesta 200 de `GET /auth/tenant/me` (identidad de la membres├¡a). */
export interface TenantMe {
  usuario_id: number;
  empresa_id: number;
  empresa_slug: string;
  empresa_nombre: string;
  rol: string;
  contexto: TenantContexto;
  plan_codigo: string;
  permite_reportes_ia: boolean;
}

/** Body de `POST /auth/tenant/invitaciones/aceptar`. */
export interface TenantInvitacionAceptarRequest {
  token: string;
  password: string;
  password_confirmacion: string;
}

/** Respuesta 200 de `POST /auth/tenant/invitaciones/aceptar`. */
export interface TenantInvitacionAceptarResponse {
  aceptada: boolean;
  usuario_id: number;
}

/* ============================ Empresa y plan ============================== */

/**
 * Suscripci├│n/plan vigente de la empresa.
 *
 * Es el objeto que devuelven `GET /tenant/empresa/plan` y
 * `GET /tenant/empresa/suscripcion`, y el que viaja anidado en
 * `GET /tenant/empresa/me` como `suscripcion`.
 *
 * `estado_suscripcion` se deja como `string`: el backend no publica un enum
 * cerrado para este campo y no se inventan valores.
 */
export interface TenantSuscripcion {
  suscripcion_id: number;
  fecha_inicio: string;
  fecha_vencimiento: string;
  estado_suscripcion: string;
  codigo: string;
  nombre: string;
  max_sucursales_activas: number;
  permite_productos: boolean;
  permite_ventas: boolean;
  permite_reservas: boolean;
  permite_offline: boolean;
  permite_reportes_convencionales: boolean;
  permite_reportes_ia: boolean;
  sucursales_activas: number;
}

/** Respuesta 200 de `GET /tenant/empresa/me`. */
export interface TenantEmpresa {
  id: number;
  slug: string;
  nombre_comercial: string;
  suscripcion: TenantSuscripcion;
}

/**
 * Sucursal de la empresa.
 *
 * Es la fila exacta de `GET /tenant/empresa/sucursales` y del objeto que
 * devuelven `POST /tenant/empresa/sucursales` y
 * `PATCH /tenant/empresa/sucursales/{id}/estado`.
 *
 * `ciudad_id` es el identificador de la tabla global de ciudades. El cat├ílogo
 * se consulta con `GET /tenant/catalogo/ciudades` y la UI lo presenta como
 * selector (ver `saas-sucursales.page.ts`).
 */
export interface TenantSucursal {
  id: number;
  ciudad_id: number;
  nombre: string;
  direccion: string;
  telefono: string | null;
  estado: boolean;
}

/**
 * Body de `POST /tenant/empresa/sucursales` (`extra=forbid`: sin campos extra).
 *
 * `telefono` es opcional; se omite del cuerpo cuando el formulario queda vac├¡o
 * para no enviar `null` donde el contrato admite ausencia.
 */
export interface TenantSucursalCrear {
  ciudad_id: number;
  nombre: string;
  direccion: string;
  telefono?: string;
}

/** Body de `PATCH /tenant/empresa/sucursales/{id}`. */
export interface TenantSucursalActualizar {
  ciudad_id: number;
  nombre: string;
  direccion: string;
  telefono?: string;
}

/**
 * Fila de `GET /tenant/empresa/usuarios` (permiso `PERSONAL/CONSULTAR`).
 *
 * El empleado puede no existir (`empleado_id`/`empleado_activo` nulos): la
 * membres├¡a y el perfil de empleado son entidades distintas en el backend.
 */
export interface TenantUsuarioMembresia {
  usuario_id: number;
  correo: string;
  usuario_activo: boolean;
  membresia_activa: boolean;
  rol_id: number;
  rol: string;
  empleado_id: number | null;
  sucursal_id: number | null;
  nombres: string | null;
  apellidos: string | null;
  empleado_activo: boolean | null;
}

/**
 * Body de `POST /tenant/empresa/usuarios`.
 *
 * No incluye `password`: el backend genera un hash inutilizable y la persona
 * define su contrase├▒a al aceptar la invitaci├│n.
 */
export interface AltaPersonalSolicitud {
  correo: string;
  nombres: string;
  apellidos: string;
  ci: string;
  telefono?: string;
  sucursal_id: number;
  rol_id: number;
  /** Vigencia de la invitaci├│n en horas (backend: 1..168, por defecto 72). */
  expira_horas?: number;
}

/**
 * Invitaci├│n de un solo uso devuelta SOLO en el 201 del alta.
 *
 * `token` no se vuelve a poder consultar: la UI lo muestra una vez y no lo
 * persiste en almacenamiento ni en logs.
 */
export interface InvitacionPersonal {
  token: string;
  expira_en: string;
  /** El backend lo devuelve fijo como `unico`. */
  uso: string;
  /** Endpoint con el que la persona acepta la invitaci├│n. */
  aceptacion: string;
}

/** Respuesta 201 de `POST /tenant/empresa/usuarios`. */
export interface AltaPersonalRespuesta {
  empresa_id: number;
  usuario_id: number;
  empleado_id: number;
  membresia_id: number;
  sucursal_id: number;
  correo: string;
  rol: string;
  estado_membresia: boolean;
  expira_en: string;
  invitacion: InvitacionPersonal;
}

/**
 * Respuesta 200 de `PATCH /tenant/empresa/usuarios/{id}/sucursal`.
 *
 * Es m├ís corta que una fila de la lista: el backend solo confirma la mudanza.
 */
export interface TenantUsuarioSucursal {
  usuario_id: number;
  empleado_id: number;
  sucursal_id: number;
  membresia_activa: boolean;
}

/** Elemento de `GET /tenant/empresa/roles`. */
export interface TenantRol {
  id: number;
  nombre: string;
  estado: boolean;
}

/* =============================== Permisos ================================ */

/** Par funci├│n/acci├│n del cat├ílogo de permisos de la empresa. */
export interface PermisoItem {
  funcion: string;
  accion: string;
}

/**
 * Permiso efectivo de un rol dentro de la matriz.
 *
 * `origen` indica si el valor viene de la excepci├│n de la empresa
 * (`EXCEPCION`) o del default del rol (`DEFAULT`).
 */
export interface PermisoAsignado {
  funcion: string;
  accion: string;
  permitido: boolean;
  origen: 'EXCEPCION' | 'DEFAULT';
}

/** Fila por rol de la matriz de permisos. */
export interface MatrizPermisosRol {
  rol_id: number;
  rol: string;
  permisos: PermisoAsignado[];
}

/** Respuesta 200 de `GET /tenant/empresa/permisos`. */
export interface MatrizPermisos {
  empresa_id: number;
  catalogo: PermisoItem[];
  roles: MatrizPermisosRol[];
}

/**
 * Item del body de `PATCH /tenant/empresa/roles/{rol_id}/permisos`.
 *
 * Solo viajan las filas modificadas (1..80 elementos seg├║n el backend).
 */
export interface PermisoCambio {
  funcion: string;
  accion: string;
  permitido: boolean;
}

/** Respuesta 200 de `PATCH /tenant/empresa/roles/{rol_id}/permisos`. */
export interface PermisosActualizados {
  rol_id: number;
  rol: string;
  actualizados: number;
}

/* ================================ Cat├ílogo ================================ */

/**
 * Categor├¡a de producto de la empresa (`/tenant/catalogo/categorias`).
 *
 * El contrato NO tiene `estado`: no se puede activar ni desactivar, y tampoco
 * existe `DELETE`. `descripcion` llega como `null` cuando no se inform├│.
 */
export interface TenantCategoria {
  id: number;
  nombre: string;
  descripcion: string | null;
}

/**
 * Body de `POST /tenant/catalogo/categorias` (`extra=forbid`).
 *
 * `descripcion` es opcional: se omite del cuerpo cuando el formulario queda
 * vac├¡o para no enviar `null` donde el contrato admite ausencia.
 */
export interface TenantCategoriaCrear {
  nombre: string;
  descripcion?: string;
}

/**
 * Body de `PATCH /tenant/catalogo/categorias/{id}`.
 *
 * Solo viajan los campos modificados: `{}` responde 422 y `nombre: null`
 * tambi├®n (el backend no permite vaciar un campo obligatorio).
 */
export interface TenantCategoriaEditar {
  nombre?: string;
  descripcion?: string;
}

/**
 * Producto de la empresa (`/tenant/catalogo/productos`).
 *
 * `precio` es un `Decimal` en el backend y Pydantic lo serializa como TEXTO
 * (`"120.00"`), no como n├║mero. Por eso se tipa `string` y solo se formatea;
 * el frontend nunca calcula totales.
 */
export interface TenantProducto {
  id: number;
  nombre: string;
  descripcion: string | null;
  precio: string;
  categoria_id: number;
  categoria_nombre: string;
}

/**
 * Body de `POST /tenant/catalogo/productos`.
 *
 * `categoria_id` debe ser > 0 y `precio` > 0 con 2 decimales; el backend
 * responde 422 si la categor├¡a no pertenece a la empresa.
 */
export interface TenantProductoCrear {
  categoria_id: number;
  nombre: string;
  descripcion?: string;
  precio: number;
}

/**
 * Body de `PATCH /tenant/catalogo/productos/{id}`.
 *
 * Solo viajan los campos modificados; los obligatorios no admiten `null`.
 */
export interface TenantProductoEditar {
  categoria_id?: number;
  nombre?: string;
  descripcion?: string;
  precio?: number;
}

/**
 * Variante de un producto.
 *
 * El backend devuelve los NOMBRES de talla y color (no sus identificadores):
 * los diccionarios globales se consultan con `GET /tenant/catalogo/tallas` y
 * `GET /tenant/catalogo/colores`.
 */
export interface TenantVariante {
  id: number;
  producto_id: number;
  sku: string;
  talla_id: number;
  talla: string;
  color_id: number;
  color: string;
}

/**
 * Body de `POST /tenant/catalogo/productos/{id}/variantes`.
 *
 * `talla_id` y `color_id` se eligen de los diccionarios globales
 * (`listarTallas()` / `listarColores()`); el backend rechaza valores
 * inexistentes o inactivos con 409/422.
 */
export interface TenantVarianteCrear {
  talla_id: number;
  color_id: number;
  sku: string;
}

/** Body de `PATCH /tenant/catalogo/variantes/{id}` (solo campos modificados). */
export interface TenantVarianteEditar {
  talla_id?: number;
  color_id?: number;
  sku?: string;
}

/* ==================== Diccionarios y cat├ílogos tenant ==================== */

/**
 * Fila de `GET /tenant/catalogo/tallas`.
 *
 * Diccionario GLOBAL (compartido por las empresas) que devuelve solo tallas
 * activas. Requiere `CATALOGO/CONSULTAR`.
 */
export interface TenantTalla {
  id: number;
  nombre: string;
}

/**
 * Fila de `GET /tenant/catalogo/colores`.
 *
 * Diccionario GLOBAL con los colores activos. Requiere `CATALOGO/CONSULTAR`.
 */
export interface TenantColor {
  id: number;
  nombre: string;
}

/**
 * Fila de `GET /tenant/catalogo/ciudades`.
 *
 * Diccionario GLOBAL de ciudades: alimenta el alta de sucursales. Requiere
 * `SUCURSALES/CONSULTAR`.
 */
export interface TenantCiudad {
  id: number;
  nombre: string;
}

/**
 * Fila de `GET /tenant/catalogo/proveedores`.
 *
 * Proveedores de la empresa (puede ser una lista vac├¡a). Requiere
 * `COMPRAS/CONSULTAR`; una empresa sin proveedores no puede crear ├│rdenes.
 */
export interface TenantProveedor {
  id: number;
  razon_social: string;
  estado: boolean;
  nit?: string | null;
  correo?: string | null;
  telefono?: string | null;
  direccion?: string | null;
  total_productos?: number;
}

/**
 * Body de `POST /tenant/proveedores` (5C0).
 *
 * `producto_ids` asocia el proveedor a productos DE LA EMPRESA para que la
 * orden de compra pueda validar `proveedor_producto`. El `empresa_id` nunca
 * viaja: lo deriva el backend del JWT.
 */
export interface TenantProveedorCrear {
  razon_social: string;
  nit?: string;
  correo?: string;
  telefono?: string;
  direccion?: string;
  producto_ids?: number[];
}

/** Respuesta 201 de `POST /tenant/proveedores`. */
export interface TenantProveedorCreado extends TenantProveedor {
  nit: string | null;
  correo: string | null;
  telefono: string | null;
  direccion: string | null;
  total_productos: number;
}

/** Respuesta 200 de `PUT /tenant/proveedores/{id}/productos`. */
export interface TenantProveedorProductosResultado {
  proveedor_id: number;
  total_productos: number;
}

/**
 * Fila de `GET /tenant/catalogo/temporadas`.
 *
 * `fecha_inicio`/`fecha_fin` son fechas ISO `AAAA-MM-DD`. Requiere
 * `COMPRAS/CONSULTAR`; el inventario exige una `temporada_id` real.
 */
export interface TenantTemporada {
  id: number;
  nombre: string;
  fecha_inicio: string;
  fecha_fin: string;
  estado: boolean;
}

/**
 * Fila de `GET /tenant/catalogo/variantes`.
 *
 * Listado de variantes de TODA la empresa (no de un producto concreto), con el
 * nombre del producto resuelto. Requiere `CATALOGO/CONSULTAR`.
 */
export interface TenantVarianteEmpresa {
  id: number;
  producto_id: number;
  producto_nombre: string;
  sku: string;
  talla_id: number;
  talla: string;
  color_id: number;
  color: string;
}

/* ================================ Ventas ================================= */

/** Medios de pago admitidos por `POST /tenant/ventas/contado`. */
export type MetodoPagoTenant =
  | 'EFECTIVO'
  | 'TARJETA'
  | 'TRANSFERENCIA'
  | 'QR'
  | 'OTRO';

/**
 * Fila de `GET /tenant/inventario`.
 *
 * Vista de inventario por sucursal con `stock_disponible` calculado en SQL
 * (`stock_actual - stock_reservado`). Requiere `VENTAS/CONSULTAR`; alimenta el
 * selector de inventario de la venta de contado.
 */
export interface TenantInventario {
  id: number;
  sucursal_id: number;
  sucursal_nombre: string;
  variante_producto_id: number;
  producto_id: number;
  producto_nombre: string;
  sku: string;
  talla_id: number;
  talla: string;
  color_id: number;
  color: string;
  temporada_id: number;
  temporada_nombre: string;
  stock_actual: number;
  stock_reservado: number;
  stock_disponible: number;
}

/** L├¡nea del body de venta: solo inventario y cantidad (el precio es del backend). */
export interface VentaContadoLineaSolicitud {
  inventario_id: number;
  cantidad: number;
}

/**
 * Body de `POST /tenant/ventas/contado` (`extra=forbid`: sin campos extra).
 *
 * `operacion_id` es el UUID de idempotencia: el mismo identificador con la
 * misma carga devuelve 200 (replay); con otra carga devuelve 409.
 */
export interface VentaContadoSolicitud {
  sucursal_id: number;
  operacion_id: string;
  metodo_pago?: MetodoPagoTenant;
  lineas: VentaContadoLineaSolicitud[];
}

/** L├¡nea resuelta por el backend: precio y subtotal son del servidor. */
export interface VentaContadoLineaRespuesta {
  inventario_id: number;
  cantidad: number;
  precio_unitario: number;
  subtotal: number;
}

/** Stock resultante de un `inventario_id` tras la venta. */
export interface VentaContadoStock {
  inventario_id: number;
  stock_actual: number;
  stock_reservado: number;
}

/**
 * Respuesta de `POST /tenant/ventas/contado` (201 alta / 200 replay).
 *
 * `idempotente` en `true` significa que la venta ya estaba registrada y el
 * backend devolvi├│ el mismo resultado sin volver a descontar stock.
 */
export interface VentaContadoRespuesta {
  venta_id: number;
  pago_id: number;
  estado: string;
  canal: string;
  metodo_pago: string;
  total: number;
  moneda: string;
  operacion_id: string;
  idempotente: boolean;
  lineas: VentaContadoLineaRespuesta[];
  stock: VentaContadoStock[];
}

/** Read-only CU23 receipt returned for a completed tenant contado sale. */
export interface ComprobanteContadoTenant {
  venta_id: number;
  fecha_hora: string;
  estado_venta: string;
  total: number;
  canal: string;
  pago: Record<string, unknown>;
  items: Array<Record<string, unknown>>;
}

/**
 * Fila de `GET /tenant/comercial/ventas` (solo ADMINISTRADOR).
 *
 * El backend expone una vista M├ìNIMA: ├║nicamente `id` y `estado`. No hay total,
 * l├¡neas, cliente ni fecha; la UI no debe aparentar m├ís detalle.
 */
export interface VentaComercialResumen {
  id: number;
  estado: string;
}

/* ================================ Reservas ================================ */

/**
 * Fila de `GET /tenant/comercial/reservas` y respuesta de
 * `GET /tenant/comercial/reservas/{id}` (solo ADMINISTRADOR).
 *
 * Vista M├ìNIMA del backend: ├║nicamente `id` y `estado`. No hay prendas,
 * cliente, sucursal ni fecha en este contrato; la UI no aparenta m├ís detalle.
 */
export interface ReservaComercial {
  id: number;
  estado: string;
}

/**
 * Body de `PATCH /tenant/reservas/{id}/cancelar` y
 * `PATCH /tenant/reservas/{id}/finalizar-sin-compra`.
 *
 * El backend exige cuerpo JSON (sin body responde 422). `observacion` es
 * opcional con 500 caracteres como m├íximo; `{}` es un cuerpo v├ílido.
 */
export interface ReservaAccionSolicitud {
  observacion?: string | null;
}

/** Respuesta de ambos `PATCH` de reserva: `estado` es el nuevo estado. */
export interface AccionReservaRespuesta {
  reserva_id: number;
  estado: string;
}

/**
 * Body de `POST /tenant/reservas` (contexto cliente, `extra=forbid`).
 *
 * `fecha_atencion` debe ser un datetime ISO CON zona horaria y futuro. El
 * `carrito_id` se valida contra el cliente due├▒o y la empresa del JWT; ni el
 * `empresa_id` ni el `cliente_id` viajan desde la UI.
 */
export interface ReservaCrearSolicitud {
  carrito_id: number;
  fecha_atencion: string;
  observacion?: string | null;
}

/** Respuesta 201 de `POST /tenant/reservas`. */
export interface ReservaCreadaTenant {
  reserva_id: number;
  carrito_id: number;
  estado: string;
}

/* ================================= Compras ================================ */

/** Estados publicados por `/tenant/ordenes-compra`. */
export type EstadoOrdenCompra =
  | 'BORRADOR'
  | 'ENVIADA'
  | 'PARCIAL'
  | 'RECIBIDA'
  | 'CANCELADA';

/**
 * Fila de `GET /tenant/ordenes-compra`.
 *
 * `fecha_orden`, `fecha_estimada` y `fecha_recepcion` son datetimes ISO del
 * backend (`fecha_estimada`/`fecha_recepcion` pueden llegar en `null`).
 */
export interface OrdenCompraResumen {
  id: number;
  proveedor_id: number;
  proveedor_razon_social: string;
  sucursal_id: number;
  sucursal_nombre: string;
  estado: EstadoOrdenCompra;
  fecha_orden: string;
  fecha_estimada: string | null;
  fecha_recepcion: string | null;
  total_lineas: number;
}

/**
 * L├¡nea de `GET /tenant/ordenes-compra/{id}`.
 *
 * `cantidad_recibida` y `cantidad_pendiente` los calcula el backend; la UI
 * solo los presenta y limita la cantidad a recibir con `cantidad_pendiente`.
 */
export interface OrdenCompraLinea {
  id: number;
  variante_producto_id: number;
  sku: string;
  temporada_id: number;
  temporada_nombre: string;
  cantidad: number;
  costo_unitario: number;
  cantidad_recibida: number;
  cantidad_pendiente: number;
}

/** `GET /tenant/ordenes-compra/{id}`: resumen + l├¡neas de la orden. */
export interface OrdenCompraDetalle extends OrdenCompraResumen {
  lineas: OrdenCompraLinea[];
}

/**
 * L├¡nea del body de `POST /tenant/ordenes-compra` (`extra=forbid`).
 *
 * `cantidad` es un entero 1..100000 y `costo_unitario` un decimal ÔëÑ 0 con 2
 * decimales. `variante_producto_id` y `temporada_id` se eligen de los
 * cat├ílogos tenant (`listarVariantesEmpresa` / `listarTemporadas`).
 */
export interface OrdenCompraLineaCrear {
  variante_producto_id: number;
  temporada_id: number;
  cantidad: number;
  costo_unitario: number;
}

/**
 * Body de `POST /tenant/ordenes-compra` (`extra=forbid`).
 *
 * `lineas` admite 1..50 elementos. `fecha_estimada` y `observacion` son
 * opcionales y se omiten cuando el formulario queda vac├¡o.
 */
export interface OrdenCompraCrear {
  proveedor_id: number;
  sucursal_id: number;
  fecha_estimada?: string;
  observacion?: string;
  lineas: OrdenCompraLineaCrear[];
}

/** L├¡nea repetida en el 201 de `POST /tenant/ordenes-compra`. */
export interface OrdenCompraLineaCreada {
  variante_producto_id: number;
  temporada_id: number;
  cantidad: number;
  costo_unitario: number;
}

/**
 * Respuesta 201/200 de `POST /tenant/ordenes-compra`.
 *
 * Es m├ís corta que `OrdenCompraDetalle`: la rutina de creaci├│n no resuelve
 * `proveedor_razon_social` ni `sucursal_nombre`.
 */
export interface OrdenCompraCreada {
  orden_compra_id: number;
  estado: string;
  proveedor_id: number;
  sucursal_id: number;
  total_lineas: number;
  lineas: OrdenCompraLineaCreada[];
  stock_modificado: boolean;
}

/** L├¡nea del body de `POST /tenant/ordenes-compra/{id}/recepciones`. */
export interface RecepcionLineaSolicitud {
  detalle_orden_compra_id: number;
  cantidad: number;
}

/**
 * Body de `POST /tenant/ordenes-compra/{id}/recepciones`.
 *
 * `operacion_id` es el UUID de idempotencia: el mismo identificador con la
 * misma carga responde 200 (replay); con otra carga, 409.
 */
export interface RecepcionSolicitud {
  operacion_id: string;
  observacion?: string | null;
  lineas: RecepcionLineaSolicitud[];
}

/** Stock resultante de un `inventario_id` tras la recepci├│n. */
export interface RecepcionStock {
  inventario_id: number;
  stock_actual: number;
  stock_reservado: number;
}

/** Respuesta de `POST /tenant/ordenes-compra/{id}/recepciones` (201/200). */
export interface RecepcionResultado {
  idempotente: boolean;
  recepcion_id: number;
  orden_compra_id: number;
  estado_orden: string;
  unidades_recibidas: number;
  stock: RecepcionStock[];
  operacion_id: string;
}

/** Respuesta de `enviar` y `cancelar` de una orden de compra. */
export interface TransicionOrdenCompra {
  idempotente: boolean;
  orden_compra_id: number;
  estado: string;
}

/* ============================== Devoluciones ============================== */

/** Estados publicados por `/tenant/devoluciones`. */
export type EstadoDevolucion =
  | 'SOLICITADA'
  | 'APROBADA'
  | 'RECHAZADA'
  | 'COMPLETADA';

/**
 * L├¡nea de `GET /tenant/devoluciones/ventas/{venta_id}/lineas`.
 *
 * `cantidad_disponible_devolver` la calcula el backend
 * (`cantidad - cantidad_devuelta`): es el m├íximo que la UI permite devolver.
 */
export interface VentaLineaDevolucion {
  detalle_venta_id: number;
  inventario_id: number;
  variante_producto_id: number;
  sku: string;
  producto_nombre: string;
  talla: string;
  color: string;
  cantidad: number;
  precio_unitario: number;
  cantidad_devuelta: number;
  cantidad_disponible_devolver: number;
}

/**
 * Respuesta de `GET /tenant/devoluciones/ventas/{venta_id}/lineas`.
 *
 * Requiere rol ADMINISTRADOR/ENCARGADO_SUCURSAL y el flag de devoluciones.
 * Una venta inexistente o de otra empresa responde 404 (sin distinguirlas).
 */
export interface VentaLineasTenant {
  venta_id: number;
  sucursal_id: number;
  estado: string;
  total: number;
  lineas: VentaLineaDevolucion[];
}

/** ├ìtem del body de `POST /tenant/devoluciones` (`extra=forbid`). */
export interface DevolucionItemCrear {
  detalle_venta_id: number;
  cantidad: number;
  reponer: boolean;
  motivo?: string;
}

/**
 * Body de `POST /tenant/devoluciones` (`extra=forbid`).
 *
 * `motivo` general es obligatorio (1..255); `observacion` admite hasta 2000.
 * `items` lleva 1..50 elementos y `operacion_id` es el UUID de idempotencia.
 */
export interface DevolucionCrear {
  venta_id: number;
  motivo: string;
  observacion?: string;
  operacion_id: string;
  items: DevolucionItemCrear[];
}

/**
 * ├ìtem repetido en el 201 de `POST /tenant/devoluciones`.
 *
 * Es m├ís corto que `DevolucionItem`: la rutina de creaci├│n no resuelve SKU ni
 * subtotal.
 */
export interface DevolucionItemCreado {
  detalle_venta_id: number;
  inventario_id: number;
  cantidad: number;
  reponer: boolean;
  precio_unitario: number;
}

/**
 * Reembolso declarado en el 201 de `POST /tenant/devoluciones`.
 *
 * Es INFORMATIVO: la pantalla no ejecuta pagos ni mueve dinero.
 */
export interface ReembolsoDeclarado {
  estado: string;
  ejecutado: boolean;
  medio: string;
  monto: number;
}

/**
 * Respuesta 201/200 de `POST /tenant/devoluciones`.
 *
 * `idempotente` en `true` significa replay del mismo `operacion_id` con la
 * misma carga; no vuelve a mover stock.
 */
export interface DevolucionCreada {
  idempotente: boolean;
  devolucion_id: number;
  venta_id: number;
  estado: string;
  motivo: string;
  unidades: number;
  monto_estimado: number;
  moneda: string;
  items: DevolucionItemCreado[];
  reembolso: ReembolsoDeclarado;
  stock_modificado: boolean;
  operacion_id: string;
}

/**
 * Fila de `GET /tenant/devoluciones`.
 *
 * `venta_total` y `monto_estimado` son montos informativos del servidor: la UI
 * nunca los recalcula ni ejecuta reembolsos.
 */
export interface DevolucionResumen {
  id: number;
  venta_id: number;
  fecha_hora: string;
  estado: EstadoDevolucion;
  motivo: string;
  observacion: string | null;
  sucursal_id: number;
  sucursal_nombre: string;
  venta_total: number;
  unidades: number;
  monto_estimado: number;
}

/** ├ìtem de `GET /tenant/devoluciones/{id}`. */
export interface DevolucionItem {
  detalle_devolucion_id: number;
  detalle_venta_id: number;
  cantidad: number;
  motivo: string | null;
  reponer: boolean;
  inventario_id: number;
  precio_unitario: number;
  sku: string;
  subtotal: number;
}

/**
 * Reembolso declarado por el backend en el detalle.
 *
 * Es INFORMATIVO: `medio` puede ser `NO_DISPONIBLE` y `ejecutado` indica si el
 * sistema lo ejecut├│. Esta pantalla no mueve dinero ni registra pagos.
 */
export interface ReembolsoTenant {
  reembolso_id: number;
  estado: string;
  monto: number;
  moneda: string;
  medio: string;
  ejecutado: boolean;
  referencia: string | null;
  fecha_creacion: string;
  fecha_ejecucion: string | null;
}

/**
 * `GET /tenant/devoluciones/{id}`: resumen + ├¡tems + reembolso.
 *
 * `reembolso` es `null` mientras la devoluci├│n no se haya procesado.
 */
export interface DevolucionDetalle extends DevolucionResumen {
  items: DevolucionItem[];
  reembolso: ReembolsoTenant | null;
}

/** Reembolso aplanado que devuelve `POST /tenant/devoluciones/{id}/procesar`. */
export interface ReembolsoProcesado {
  reembolso_id: number;
  estado: string;
  ejecutado: boolean;
  medio: string;
  monto: number;
  moneda: string;
}

/** Stock resultante de un `inventario_id` tras procesar la devoluci├│n. */
export interface DevolucionStock {
  inventario_id: number;
  stock_actual: number;
  stock_reservado: number;
}

/**
 * Respuesta de `POST /tenant/devoluciones/{id}/procesar`.
 *
 * Contrato propio del procesamiento (no es `DevolucionDetalle`): aplana stock,
 * unidades repuestas y el reembolso declarado.
 */
export interface DevolucionProcesada {
  idempotente: boolean;
  devolucion_id: number;
  venta_id: number;
  estado: string;
  unidades: number;
  unidades_repuestas: number;
  stock: DevolucionStock[];
  reembolso: ReembolsoProcesado;
  operacion_id: string;
}

/** Respuesta de `aprobar` y `rechazar` de una devoluci├│n. */
export interface AccionDevolucionRespuesta {
  idempotente: boolean;
  devolucion_id: number;
  estado: string;
}

/* ================================ Errores ================================ */

/**
 * Detalle de validaci├│n 422 de FastAPI: `detail` llega como LISTA de objetos.
 * En el resto de c├│digos `detail` es un STRING.
 */
export interface TenantErrorDetalleItem {
  type: string;
  loc: Array<string | number>;
  msg: string;
  input?: unknown;
}

/** Cuerpo de error del backend, con `detail` en cualquiera de sus dos formas. */
export interface TenantErrorCuerpo {
  detail?: string | TenantErrorDetalleItem[];
}

/**
 * Error normalizado que consume la UI.
 *
 * `mensaje` es el texto listo para mostrar; `detalle` es el texto crudo del
 * backend (├║til para diagn├│stico) y `campos` los nombres de campo implicados
 * en un 422.
 */
export interface TenantErrorNormalizado {
  /** C├│digo HTTP; 0 representa "sin red / sin respuesta". */
  estado: number;
  /** `true` cuando el error proviene de validaci├│n de campos (422). */
  esValidacion: boolean;
  mensaje: string;
  detalle: string | null;
  campos: string[];
  /** Segundos indicados por `Retry-After` en un 429, si llegaron. */
  reintentarEnSegundos: number | null;
}
