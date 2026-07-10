/**
 * Tipos e validação do payload de contato (porte do schema do conector de
 * origem, sem o client_type de marca — o destino é resolvido por environment).
 */

import { z } from 'zod';

export const contactPayloadSchema = z
  .object({
    customer_id: z.string().min(1).optional().nullable(),
    email: z.string().email().optional().nullable(),
    cpf: z.string().min(11).optional().nullable(),
    bday: z.coerce.date().optional().nullable(),
    first_name: z.string().min(1).optional().nullable(),
    last_name: z.string().min(1).optional().nullable(),
    phone: z.string().min(1).optional().nullable(),
    mobile: z.string().min(1).optional().nullable(),
    gender: z.enum(['M', 'F']).optional().nullable(),
    address: z.string().min(1).optional().nullable(),
    city: z.string().min(1).optional().nullable(),
    state: z.string().min(1).optional().nullable(),
    country: z.number().min(1).optional().nullable(),
    postal_code: z.string().min(1).optional().nullable(),
    opt_in: z.boolean().optional().nullable(),
    mobile_opt_in: z.boolean().optional().nullable(),
    last_purchase_date: z.coerce.date().optional().nullable(),
    registration_date: z.coerce.date().optional().nullable(),
  })
  .refine((data) => data.email || data.cpf, {
    message: 'É necessário informar ao menos o e-mail ou o CPF',
    path: ['email'],
  });

export type ContactPayload = z.infer<typeof contactPayloadSchema>;

/** Contato normalizado para o gateway (id = customer_id || cpf || email). */
export type ContactData = ContactPayload & {
  id: string;
  /** True quando o mesmo webhook foi distribuído para mais de um environment. */
  fanOut: boolean;
};

export function toContactData(payload: ContactPayload, fanOut: boolean): ContactData {
  const id = (payload.customer_id || payload.cpf || payload.email) as string;
  return { ...payload, id, fanOut };
}

/** Configurações do flow contacts (environment_flows.settings). */
export type ContactsFlowSettings = {
  debug?: boolean;
  maxAttempts?: number;
  /** Base do backoff exponencial em segundos (delay = base * 2^attempts). */
  backoffBaseSeconds?: number;
  batchSize?: number;
};
