/**
 * Use cases de dedupe de contatos — transplante do conector de origem
 * (SyncContactWithCpfUseCase / SyncContactWithoutCpfUseCase).
 *
 * A lógica de decisão é preservada; o que mudou:
 *  - sem DI/containers: funções puras recebendo o gateway
 *  - sem client_type 'full': o fan-out para N environments acontece no
 *    webhook (cada environment processa seu próprio registro da fila)
 */

import type { EmarsysContactsGateway, ExistingContact } from './gateway.js';
import type { ContactData } from './types.js';

export type SyncOutput = {
  message: string;
  action: 'created' | 'updated' | null;
};

// ── Com CPF ──────────────────────────────────────────────────────────────────

export async function syncContactWithCpf(
  gateway: EmarsysContactsGateway,
  contact: ContactData,
): Promise<SyncOutput> {
  if (!contact.email) {
    return handleZeroEmails(gateway, contact);
  }

  const emailsCount = await gateway.countEmail(contact.email);
  if (emailsCount === 0) {
    return handleZeroEmails(gateway, contact);
  }

  const contactsWithEmail = await gateway.getContactsDetailsByEmail(contact.email);
  if (emailsCount === 1) {
    return handleSingleEmail(gateway, contact, contactsWithEmail[0]);
  }
  return handleMultipleEmails(gateway, contact, contactsWithEmail);
}

async function handleZeroEmails(gateway: EmarsysContactsGateway, contact: ContactData): Promise<SyncOutput> {
  const cpfExists = await gateway.cpfExists(contact.cpf!);

  if (!cpfExists) {
    await gateway.createContact(contact);
    return { message: 'Criar novo cliente', action: 'created' };
  }

  const existingContactId = await gateway.getContactIdByCpf(contact.cpf!);
  await gateway.updateContact(contact, existingContactId);
  return { message: 'Atualiza cliente (ID)', action: 'updated' };
}

async function handleSingleEmail(
  gateway: EmarsysContactsGateway,
  contact: ContactData,
  existing: ExistingContact,
): Promise<SyncOutput> {
  const isExistingLead = !existing.cpf;

  if (isExistingLead) {
    const cpfExists = await gateway.cpfExists(contact.cpf!);

    if (!cpfExists) {
      await gateway.updateContact(contact, existing.id);
      return { message: 'Converte o Lead em Cliente', action: 'updated' };
    }

    const contactWithCpfId = await gateway.getContactIdByCpf(contact.cpf!);
    await gateway.updateContact(contact, contactWithCpfId);

    if (existing.id !== contactWithCpfId) {
      await gateway.deleteContact(existing.id);
      return { message: 'Atualiza Cliente com o Mesmo CPF (ID) e Apaga o Lead', action: 'updated' };
    }
    return { message: 'Atualiza cliente (ID)', action: 'updated' };
  }

  if (existing.cpf === contact.cpf) {
    await gateway.updateContact(contact, existing.id);
    return { message: 'Atualiza cliente (ID)', action: 'updated' };
  }

  const cpfExists = await gateway.cpfExists(contact.cpf!);
  if (cpfExists) {
    const contactWithCpfId = await gateway.getContactIdByCpf(contact.cpf!);
    await gateway.updateContact(contact, contactWithCpfId);
    return { message: 'Atualiza cliente (ID)', action: 'updated' };
  }

  await gateway.createContact(contact);
  return { message: 'Cria novo cliente', action: 'created' };
}

async function handleMultipleEmails(
  gateway: EmarsysContactsGateway,
  contact: ContactData,
  contactsWithEmail: ExistingContact[],
): Promise<SyncOutput> {
  const contactWithSameCpf = contactsWithEmail.find((c) => c.cpf === contact.cpf);
  const leadsWithSameEmail = contactsWithEmail.filter((c) => !c.cpf);

  if (contactWithSameCpf) {
    await gateway.updateContact(contact, contactWithSameCpf.id);

    const leadsToDelete = leadsWithSameEmail.filter((l) => l.id !== contactWithSameCpf.id);
    if (leadsToDelete.length > 0) {
      await deleteLeads(gateway, leadsToDelete);
      return { message: 'Atualiza cliente de mesmo CPF e Apaga o Lead', action: 'updated' };
    }
    return { message: 'Atualiza cliente de mesmo CPF', action: 'updated' };
  }

  const cpfExists = await gateway.cpfExists(contact.cpf!);
  if (cpfExists) {
    const contactWithCpfId = await gateway.getContactIdByCpf(contact.cpf!);
    await gateway.updateContact(contact, contactWithCpfId);

    const leadsToDelete = leadsWithSameEmail.filter((l) => l.id !== contactWithCpfId);
    if (leadsToDelete.length > 0) {
      await deleteLeads(gateway, leadsToDelete);
      return { message: 'Atualiza cliente (ID) e Apaga o Lead', action: 'updated' };
    }
    return { message: 'Atualiza cliente (ID)', action: 'updated' };
  }

  await gateway.createContact(contact);
  if (leadsWithSameEmail.length > 0) {
    await deleteLeads(gateway, leadsWithSameEmail);
    return { message: 'Cria novo cliente e Apaga o Lead', action: 'created' };
  }
  return { message: 'Cria novo cliente', action: 'created' };
}

// ── Sem CPF ──────────────────────────────────────────────────────────────────

export async function syncContactWithoutCpf(
  gateway: EmarsysContactsGateway,
  contact: ContactData,
): Promise<SyncOutput> {
  const emailsCount = await gateway.countEmail(contact.email!);

  if (emailsCount === 0) {
    await gateway.createContact(contact);
    return { message: 'Lead criado com sucesso', action: 'created' };
  }

  const contactsWithEmail = await gateway.getContactsDetailsByEmail(contact.email!);
  if (emailsCount === 1) {
    return handleSingleRecord(gateway, contact, contactsWithEmail[0]);
  }
  return handleMultipleRecords(gateway, contact, contactsWithEmail);
}

async function handleSingleRecord(
  gateway: EmarsysContactsGateway,
  contact: ContactData,
  existing: ExistingContact,
): Promise<SyncOutput> {
  // Payload sem CPF: preserva o CPF que já existir na base (o registro
  // existente continua sendo Cliente; sem CPF ele é Lead).
  const enriched: ContactData = existing.cpf ? { ...contact, cpf: existing.cpf, id: existing.cpf } : contact;

  await gateway.updateContact(enriched, existing.id);
  const label = existing.cpf ? 'Cliente' : 'Lead';
  return { message: `${label} atualizado (ID)`, action: 'updated' };
}

async function handleMultipleRecords(
  gateway: EmarsysContactsGateway,
  contact: ContactData,
  contacts: ExistingContact[],
): Promise<SyncOutput> {
  const existingClient = contacts.find((c) => c.cpf);

  if (existingClient) {
    // Prioriza quem tem CPF e mantém como Cliente
    const enriched: ContactData = existingClient.cpf
      ? { ...contact, cpf: existingClient.cpf, id: existingClient.cpf }
      : contact;
    await gateway.updateContact(enriched, existingClient.id);

    const leadsToRemove = contacts.filter((c) => c.id !== existingClient.id);
    if (leadsToRemove.length > 0) {
      await deleteLeads(gateway, leadsToRemove);
    }
    return { message: 'Cliente atualizado e registros duplicados removidos', action: 'updated' };
  }

  await deleteLeads(gateway, contacts);
  await gateway.createContact(contact);
  return { message: 'Leads antigos removidos e novo lead criado', action: 'created' };
}

async function deleteLeads(gateway: EmarsysContactsGateway, leads: ExistingContact[]): Promise<void> {
  for (const lead of leads) {
    await gateway.deleteContact(lead.id);
  }
}

/** Roteia para o use case certo conforme presença de CPF. */
export async function syncContact(gateway: EmarsysContactsGateway, contact: ContactData): Promise<SyncOutput> {
  return contact.cpf ? syncContactWithCpf(gateway, contact) : syncContactWithoutCpf(gateway, contact);
}
