import { FINANCIAL_MOVEMENT_VAT_MODES, FINANCE_DIRECTIONS, PAYMENT_GROUP_PROCESSING_STATUSES, PAYMENT_GROUP_SOURCES } from '@/db/schema'

export const VAT_MODE_LABELS: Record<(typeof FINANCIAL_MOVEMENT_VAT_MODES)[number], string> = {
  NO_VAT: 'Bez DPH',
  STANDARD: 'Standardní DPH',
  REVERSE_CHARGE: 'Přenesená daň',
}

export const DIRECTION_LABELS: Record<(typeof FINANCE_DIRECTIONS)[number], string> = {
  INCOME: 'Příjem',
  EXPENSE: 'Výdaj',
  INTERNAL: 'Interní',
}

export const PROCESSING_STATUS_LABELS: Record<(typeof PAYMENT_GROUP_PROCESSING_STATUSES)[number], string> = {
  NEW: 'Nová',
  PARTIALLY_ALLOCATED: 'Částečně alokována',
  FULLY_ALLOCATED: 'Plně alokována',
  CANCELLED: 'Zrušena',
}

export const SOURCE_LABELS: Record<(typeof PAYMENT_GROUP_SOURCES)[number], string> = {
  MANUAL: 'Manuální',
  CASH: 'Hotovost',
  BANK_IMPORT: 'Bankovní import',
}
