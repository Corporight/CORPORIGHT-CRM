export const ROLE_DEFINITION_LABELS: Record<string, string> = {
  // CORPORATE roles
  DIRECTOR:                   'Jednatel',
  STATUTORY_DIRECTOR:         'Statutární ředitel',
  BOARD_MEMBER:               'Člen představenstva',
  BOARD_CHAIR:                'Předseda představenstva',
  SUPERVISORY_BOARD_MEMBER:   'Člen dozorčí rady',
  SUPERVISORY_BOARD_CHAIR:    'Předseda dozorčí rady',
  ADMIN_BOARD_MEMBER:         'Člen správní rady',
  PROCURIST:                  'Prokurista',
  SHAREHOLDER:                'Společník',
  BENEFICIAL_OWNER:           'Skutečný majitel',
  RESPONSIBLE_REPRESENTATIVE: 'Odpovědný zástupce',
  ASSOCIATION_CHAIR:          'Předseda spolku',
  ASSOCIATION_BOARD_MEMBER:   'Člen spolku',
  FOUNDATION_TRUSTEE:         'Správce nadačního fondu',
  FOUNDATION_AUDITOR:         'Revizor',
  // SERVICE roles
  ORDERER:                    'Objednatel',
  RECIPIENT:                  'Příjemce služby',
  BILLING:                    'Fakturační subjekt',
  PRIMARY_CONTACT:            'Primární kontaktní osoba',
  CONTACT:                    'Kontaktní osoba',
  PROPERTY_OWNER:             'Majitel nemovitosti',
}

export function getRoleDefinitionLabel(code: string): string {
  return ROLE_DEFINITION_LABELS[code] ?? code
}
