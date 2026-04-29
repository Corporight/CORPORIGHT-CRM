export const ORDER_STATUS_LABELS: Record<string, string> = {
  CONCEPT: 'Koncept',
  WAITING_FOR_PAYMENT: 'Čeká na platbu',
  DOCUMENT_PREPARATION: 'Příprava dokladů',
  WAITING_FOR_DOCUMENTS: 'Čeká na doklady',
  EXECUTION: 'Realizace',
  COMPLETED: 'Dokončeno',
  CANCELLED: 'Zrušeno',
}

export const ORDER_STATUS_STYLES: Record<string, string> = {
  CONCEPT: 'bg-gray-100 text-gray-600',
  WAITING_FOR_PAYMENT: 'bg-amber-50 text-amber-700',
  DOCUMENT_PREPARATION: 'bg-blue-50 text-blue-700',
  WAITING_FOR_DOCUMENTS: 'bg-orange-50 text-orange-700',
  EXECUTION: 'bg-violet-50 text-violet-700',
  COMPLETED: 'bg-green-50 text-green-700',
  CANCELLED: 'bg-red-50 text-red-600',
}

export const ORDER_TYPE_LABELS: Record<string, string> = {
  COMPANY_FORMATION: 'Založení s.r.o.',
  COMPANY_CHANGE: 'Změna spol.',
  SHELF_PURCHASE: 'Ready-made',
  VAT_REGISTRATION: 'Reg. DPH',
  REGISTERED_OFFICE: 'Sídlo',
  ACCOUNTING: 'Účetnictví',
  OTHER: 'Ostatní',
}

export const PAYMENT_STATUS_LABELS: Record<string, string> = {
  UNPAID: 'Nezaplaceno',
  PARTIALLY_PAID: 'Částečně zaplaceno',
  PAID: 'Zaplaceno',
  OVERPAID: 'Přeplatek',
}

export const PAYMENT_STATUS_STYLES: Record<string, string> = {
  UNPAID: 'bg-gray-100 text-gray-600',
  PARTIALLY_PAID: 'bg-amber-50 text-amber-700',
  PAID: 'bg-green-50 text-green-700',
  OVERPAID: 'bg-orange-50 text-orange-700',
}
