// Tipos do contrato API ↔ painel do emarsys-hub.
// Serão preenchidos na Fase 1 (tenancy) e Fase 2 (endpoints de negócio).

export type TenantStatus = 'active' | 'inactive';

export interface Tenant {
  id: string;
  slug: string;
  name: string;
  status: TenantStatus;
  createdAt: string;
  updatedAt: string;
}
