export type OfflineOperationStatus = 'pendiente' | 'enviado' | 'confirmado' | 'conflicto' | 'error';

export interface OfflineOperationRecord {
  operation_id: string;
  scope_key: string;
  type: string;
  status: OfflineOperationStatus;
  created_at: string;
  updated_at?: string;
  attempts: number;
  last_error?: string | null;
  contract_version: number;
}
