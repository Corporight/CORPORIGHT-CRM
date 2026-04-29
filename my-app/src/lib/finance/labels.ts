import { FINANCIAL_MOVEMENT_VAT_MODES } from '@/db/schema'

export const VAT_MODE_LABELS: Record<(typeof FINANCIAL_MOVEMENT_VAT_MODES)[number], string> = {
  NO_VAT: 'Bez DPH',
  STANDARD: 'Standardní DPH',
  REVERSE_CHARGE: 'Přenesená daň',
}
