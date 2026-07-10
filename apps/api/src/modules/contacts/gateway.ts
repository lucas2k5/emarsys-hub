/**
 * Gateway de contatos da Emarsys (API v3), parametrizado por environment.
 *
 * O que no conector de origem eram constantes por marca virou dado:
 *  - credenciais → connection emarsys_oauth2 (token via cache por environment)
 *  - field IDs   → emarsys_field_mappings, com defaults APENAS para os campos
 *    de sistema da Emarsys (IDs 1..37, iguais em qualquer conta). Campos
 *    custom (customer_id, cpf, buyer_type...) não têm default — precisam
 *    estar mapeados no painel.
 */

import axios, { type AxiosInstance } from 'axios';
import { createHash } from 'node:crypto';
import { getPool } from '../../db/pool.js';
import { getAccessToken, invalidateToken, type OAuth2Config } from '../emarsys/oauth2.js';
import type { EnvironmentContext } from '../../tenancy/context.js';
import type { ContactData } from './types.js';

// Campos de SISTEMA da Emarsys — mesmos IDs em toda conta (não são marca).
const SYSTEM_FIELD_DEFAULTS: Record<string, string> = {
  first_name: '1',
  last_name: '2',
  email: '3',
  birthdate: '4',
  gender: '5',
  address: '10',
  city: '11',
  state: '12',
  postal_code: '13',
  country: '14',
  phone: '15',
  opt_in: '31',
  mobile: '37',
  mobile_opt_in: '3245',
};

export type FieldMap = {
  ids: Record<string, string>;
  /** field_key marcado como is_external_id (chave de upsert). */
  externalIdKey: string;
};

export async function loadFieldMap(environmentId: string): Promise<FieldMap> {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT field_key, emarsys_field_id, is_external_id
     FROM emarsys_field_mappings WHERE environment_id = $1`,
    [environmentId],
  );

  const ids: Record<string, string> = { ...SYSTEM_FIELD_DEFAULTS };
  let externalIdKey = 'customer_id';
  for (const row of rows as Array<{ field_key: string; emarsys_field_id: string; is_external_id: boolean }>) {
    ids[row.field_key] = row.emarsys_field_id;
    if (row.is_external_id) externalIdKey = row.field_key;
  }

  for (const required of ['customer_id', 'cpf'] as const) {
    if (!ids[required]) {
      throw new Error(
        `Field mapping "${required}" não configurado para este environment (aba Campos Emarsys no painel)`,
      );
    }
  }

  return { ids, externalIdKey };
}

export type EmarsysApiResponse = {
  replyCode?: number;
  replyText?: string;
  data?: unknown;
};

export type ExistingContact = {
  id: string;
  email: string | null;
  cpf: string | null;
  isLead: boolean;
};

export class EmarsysContactsGateway {
  private client: AxiosInstance;

  constructor(
    private readonly environmentId: string,
    private readonly fields: FieldMap,
    apiBaseUrl: string,
    oauth2: OAuth2Config,
    private readonly tag: string,
  ) {
    this.client = axios.create({
      baseURL: apiBaseUrl,
      timeout: 15_000,
      headers: { 'Content-Type': 'application/json' },
    });

    this.client.interceptors.request.use(async (request) => {
      const token = await getAccessToken(this.environmentId, oauth2);
      request.headers.Authorization = `Bearer ${token}`;
      return request;
    });

    this.client.interceptors.response.use(
      (response) => response,
      async (error) => {
        const original = error.config as (typeof error.config & { _retry?: boolean }) | undefined;
        if (error.response?.status === 401 && original && !original._retry) {
          original._retry = true;
          invalidateToken(this.environmentId);
          const token = await getAccessToken(this.environmentId, oauth2);
          original.headers.Authorization = `Bearer ${token}`;
          return this.client.request(original);
        }
        return Promise.reject(error);
      },
    );
  }

  private handleEmarsysErrors(data: EmarsysApiResponse): void {
    if (data.replyCode && data.replyCode !== 0) {
      throw new Error(`Emarsys API Error: [${data.replyCode}] ${data.replyText}`);
    }
    const errors = (data.data as { errors?: Record<string, unknown> } | undefined)?.errors;
    if (errors && Object.keys(errors).length > 0) {
      throw new Error(`Emarsys Payload Error: ${JSON.stringify(errors)}`);
    }
  }

  private async queryByField(fieldId: string, value: string): Promise<Array<{ id: string }>> {
    const response = await this.client.get<EmarsysApiResponse>(
      `/api/v3/contact/query/?${fieldId}=${encodeURIComponent(value)}&return=3`,
    );
    return ((response.data?.data as { result?: Array<{ id: string }> } | undefined)?.result ?? []);
  }

  async countEmail(email: string): Promise<number> {
    return (await this.queryByField(this.fields.ids.email, email)).length;
  }

  async getContactsDetailsByEmail(email: string): Promise<ExistingContact[]> {
    const results = await this.queryByField(this.fields.ids.email, email);
    if (results.length === 0) return [];

    const { email: emailId, customer_id, cpf } = this.fields.ids;
    const response = await this.client.post<EmarsysApiResponse>('/api/v3/contact/getdata', {
      fields: [emailId, customer_id, cpf],
      keyId: 'id',
      keyValues: results.map((r) => r.id),
    });
    const contacts = ((response.data?.data as { result?: Array<Record<string, string>> } | undefined)?.result ?? []);

    return contacts.map((c) => ({
      id: c.id,
      email: c[emailId] ?? null,
      cpf: c[cpf] ?? null,
      isLead: !c[cpf],
    }));
  }

  async getContactIdByCpf(cpfValue: string): Promise<string | null> {
    const results = await this.queryByField(this.fields.ids.cpf, cpfValue);
    return results.length > 0 ? results[0].id : null;
  }

  async cpfExists(cpfValue: string): Promise<boolean> {
    return (await this.getContactIdByCpf(cpfValue)) !== null;
  }

  private formatDate(date: Date | string | null | undefined): string | null {
    if (!date) return null;
    const d = typeof date === 'string' ? new Date(date) : date;
    return d instanceof Date && !isNaN(d.getTime()) ? d.toISOString().split('T')[0] : null;
  }

  /**
   * Monta o payload de upsert traduzindo campos → field IDs do environment.
   * A chave externa (customer_id) recebe sha256 do id de origem, como no
   * conector original.
   */
  private buildContactPayload(contact: ContactData): Record<string, unknown> {
    const f = this.fields.ids;
    const data: Record<string, unknown> = {
      [f.customer_id]: createHash('sha256').update(contact.id).digest('hex'),
      [f.email]: contact.email ?? undefined,
    };

    if (contact.first_name) data[f.first_name] = contact.first_name;
    if (contact.last_name) data[f.last_name] = contact.last_name;
    if (contact.gender) data[f.gender] = contact.gender === 'M' ? 1 : 2;
    if (contact.bday) data[f.birthdate] = this.formatDate(contact.bday);
    if (contact.phone) data[f.phone] = contact.phone;
    if (contact.mobile) data[f.mobile] = contact.mobile;
    if (contact.address) data[f.address] = contact.address;
    if (contact.city) data[f.city] = contact.city;
    if (contact.state) data[f.state] = contact.state;
    if (contact.postal_code) data[f.postal_code] = contact.postal_code;
    if (contact.country) data[f.country] = contact.country;
    if (contact.cpf) data[f.cpf] = contact.cpf;
    if (contact.opt_in !== undefined && contact.opt_in !== null) data[f.opt_in] = contact.opt_in ? 1 : 2;
    if (contact.mobile_opt_in !== undefined && contact.mobile_opt_in !== null) {
      data[f.mobile_opt_in] = contact.mobile_opt_in ? 1 : 2;
    }
    // Campos custom opcionais — só entram se mapeados no painel
    if (f.buyer_type) data[f.buyer_type] = contact.fanOut ? 1 : 2;
    if (f.last_purchase_date && contact.last_purchase_date) {
      data[f.last_purchase_date] = this.formatDate(contact.last_purchase_date);
    }
    if (f.registration_date && contact.registration_date) {
      data[f.registration_date] = this.formatDate(contact.registration_date);
    }

    return data;
  }

  async createContact(contact: ContactData): Promise<void> {
    const payload = {
      key_id: this.fields.ids[this.fields.externalIdKey],
      contacts: [this.buildContactPayload(contact)],
    };
    const response = await this.client.put<EmarsysApiResponse>('/api/v3/contact/?create_if_not_exists=1', payload);
    this.handleEmarsysErrors(response.data);
  }

  async updateContact(contact: ContactData, contactId: string | null): Promise<void> {
    const contactPayload = this.buildContactPayload(contact);
    let payload: Record<string, unknown>;
    if (contactId) {
      payload = { key_id: 'id', contacts: [{ ...contactPayload, id: contactId }] };
    } else {
      payload = { key_id: this.fields.ids[this.fields.externalIdKey], contacts: [contactPayload] };
    }
    const response = await this.client.put<EmarsysApiResponse>('/api/v3/contact/?create_if_not_exists=1', payload);
    this.handleEmarsysErrors(response.data);
  }

  async deleteContact(contactId: string): Promise<void> {
    const response = await this.client.post<EmarsysApiResponse>('/api/v3/contact/delete', {
      id: [contactId],
      key_id: 'id',
    });
    this.handleEmarsysErrors(response.data);
  }
}

/** Constrói o gateway a partir do contexto do environment. */
export async function buildContactsGateway(ctx: EnvironmentContext): Promise<EmarsysContactsGateway> {
  const oauthConn = ctx.connections.emarsys_oauth2;
  if (!oauthConn) throw new Error('Connection "emarsys_oauth2" não configurada para este environment');

  const apiBaseUrl = oauthConn.config.apiBaseUrl || 'https://api.emarsys.net';
  const oauth2: OAuth2Config = {
    clientId: oauthConn.config.clientId,
    clientSecret: oauthConn.secrets.clientSecret,
    tokenEndpoint: oauthConn.config.tokenEndpoint || 'https://auth.emarsys.net/oauth2/token',
  };
  if (!oauth2.clientId || !oauth2.clientSecret) {
    throw new Error('Connection "emarsys_oauth2": clientId/clientSecret não configurados');
  }

  const fields = await loadFieldMap(ctx.environmentId);
  return new EmarsysContactsGateway(
    ctx.environmentId,
    fields,
    apiBaseUrl,
    oauth2,
    `${ctx.tenantSlug}/${ctx.envSlug}`,
  );
}
