export interface CarritoClienteTenant {
  carrito_id: number;
  sucursal_id: number;
  sucursal_nombre: string;
  cantidad_lineas: number;
  cantidad_unidades: number;
  subtotal: number;
  fecha_actualizacion: string;
}

export interface ListaCarritosClienteTenant {
  items: CarritoClienteTenant[];
  total_carritos_activos: number;
}

export interface ReservaClienteTenant {
  reserva_id: number;
  carrito_id: number | null;
  sucursal_id: number;
  sucursal_nombre: string;
  fecha_reserva: string;
  fecha_atencion: string;
  estado: string;
  observacion: string | null;
  cantidad_lineas: number;
  cantidad_unidades: number;
}

export interface VentaClienteTenant {
  venta_id: number;
  carrito_id: number | null;
  sucursal_id: number;
  sucursal_nombre: string;
  canal: string;
  estado: string;
  fecha_hora: string;
  total: number;
  idempotente?: boolean;
  cantidad_lineas?: number;
  cantidad_total_unidades?: number;
}

export interface HistorialClienteTenant {
  items: VentaClienteTenant[];
}

export interface IntencionPagoClienteTenant {
  venta_id: number;
  pago_id: number;
  payment_intent_id: string;
  client_secret: string | null;
  monto: number;
  moneda: string;
  estado_pago: string;
}

export interface EstadoPagoClienteTenant {
  venta_id: number;
  estado_venta: string;
  pago_id: number | null;
  estado_pago: string | null;
  payment_intent_id: string | null;
  compensacion_estado: string | null;
}

export interface ComprobanteClienteTenant extends VentaClienteTenant {
  pago: {
    pago_id: number;
    fecha_hora: string;
    monto: number;
    metodo: string;
    estado: string;
    referencia_transaccion: string | null;
    pasarela: string | null;
  };
}
