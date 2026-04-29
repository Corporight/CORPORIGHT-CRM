-- Canonical finance master data seed — Wave 11.1
-- All statements are idempotent (ON CONFLICT (code) DO NOTHING).
-- Run order: centers → categories → types → details.
-- Types and details use subquery joins on parent code to resolve UUIDs without
-- needing to know the actual generated UUIDs.

-- ── Centers ────────────────────────────────────────────────────────
INSERT INTO centers (code, name, vat_mode, sort_order)
VALUES
  ('CORPORIGHT',            'Corporight s.r.o.',            'STANDARD', 10),
  ('CORPORIGHT_CONSULTING', 'Corporight Consulting s.r.o.', 'NO_VAT',   20),
  ('NON_COMPANY',           'Nefiremní',                    'NO_VAT',   30),
  ('VAT_REGISTRATIONS',     'VAT Registrace',               'NO_VAT',   40)
ON CONFLICT (code) DO NOTHING;

-- ── Financial Tree Categories ──────────────────────────────────────
INSERT INTO financial_tree_categories (code, name, direction, sort_order)
VALUES
  ('INCOME_SERVICES',    'Příjem – služby',      'INCOME',   10),
  ('EXPENSE_SERVICES',   'Náklady – služby',     'EXPENSE',  20),
  ('EXPENSE_OPERATIONS', 'Náklady – provozní',   'EXPENSE',  30),
  ('OPTIMIZATION',       'Optimalizace',         'EXPENSE',  40),
  ('CORRECTION',         'Opravný doklad',        'BOTH',     50),
  ('TAX_PAYMENT',        'Platba FÚ',            'EXPENSE',  60),
  ('INTERNAL',           'Interní převod',        'INTERNAL', 70)
ON CONFLICT (code) DO NOTHING;

-- ── Financial Tree Types — INCOME_SERVICES ─────────────────────────
INSERT INTO financial_tree_types (code, category_id, name, sort_order)
SELECT d.code, c.id, d.name, d.sort_order
FROM (VALUES
  ('INC_SVC_FOUNDING',            'Příjem – založení společnosti', 10),
  ('INC_SVC_COMPANY_CHANGE',      'Příjem – změny ve společnosti', 20),
  ('INC_SVC_COMPANY_SALE',        'Příjem – prodej společnosti',   30),
  ('INC_SVC_REGISTERED_OFFICE',   'Příjem – sídla',                40),
  ('INC_SVC_FREELANCER',          'Příjem – osvč',                 50),
  ('INC_SVC_PERMANENT_RESIDENCE', 'Příjem – trvalý pobyt',         60),
  ('INC_SVC_OTHER',               'Příjem – ostatní',              70)
) AS d(code, name, sort_order)
CROSS JOIN (SELECT id FROM financial_tree_categories WHERE code = 'INCOME_SERVICES') AS c
ON CONFLICT (code) DO NOTHING;

-- ── Financial Tree Types — EXPENSE_SERVICES ────────────────────────
INSERT INTO financial_tree_types (code, category_id, name, sort_order)
SELECT d.code, c.id, d.name, d.sort_order
FROM (VALUES
  ('EXP_SVC_FOUNDING',            'Náklady – založení společnosti', 10),
  ('EXP_SVC_COMPANY_CHANGE',      'Náklady – změny ve společnosti', 20),
  ('EXP_SVC_COMPANY_SALE',        'Náklady – prodej společností',   30),
  ('EXP_SVC_REGISTERED_OFFICE',   'Náklady – sídlo podnikání',      40),
  ('EXP_SVC_FREELANCER',          'Náklady – osvč',                 50),
  ('EXP_SVC_PERMANENT_RESIDENCE', 'Náklady – trvalý pobyt',         60),
  ('EXP_SVC_OTHER',               'Náklady – ostatní',              70)
) AS d(code, name, sort_order)
CROSS JOIN (SELECT id FROM financial_tree_categories WHERE code = 'EXPENSE_SERVICES') AS c
ON CONFLICT (code) DO NOTHING;

-- ── Financial Tree Types — EXPENSE_OPERATIONS ──────────────────────
INSERT INTO financial_tree_types (code, category_id, name, sort_order)
SELECT d.code, c.id, d.name, d.sort_order
FROM (VALUES
  ('EXP_OPS_PAYROLL',     'Náklady – výplaty',     10),
  ('EXP_OPS_LEGAL',       'Náklady – právní',      20),
  ('EXP_OPS_ACCOUNTING',  'Náklady – účetní',      30),
  ('EXP_OPS_MARKETING',   'Náklady – marketing',   40),
  ('EXP_OPS_OFFICE',      'Náklady – kancelář',    50),
  ('EXP_OPS_IT_GRAPHICS', 'Náklady – IT & grafika', 60),
  ('EXP_OPS_OTHER',       'Náklady – ostatní',     70)
) AS d(code, name, sort_order)
CROSS JOIN (SELECT id FROM financial_tree_categories WHERE code = 'EXPENSE_OPERATIONS') AS c
ON CONFLICT (code) DO NOTHING;

-- ── Financial Tree Types — OPTIMIZATION ────────────────────────────
INSERT INTO financial_tree_types (code, category_id, name, sort_order)
SELECT d.code, c.id, d.name, d.sort_order
FROM (VALUES
  ('OPT_LEGAL',       'Náklady – právní',      10),
  ('OPT_ACCOUNTING',  'Náklady – účetní',      20),
  ('OPT_MARKETING',   'Náklady – marketing',   30),
  ('OPT_OFFICE',      'Náklady – kancelář',    40),
  ('OPT_IT_GRAPHICS', 'Náklady – IT & grafika', 50),
  ('OPT_OTHER',       'Náklady – ostatní',     60)
) AS d(code, name, sort_order)
CROSS JOIN (SELECT id FROM financial_tree_categories WHERE code = 'OPTIMIZATION') AS c
ON CONFLICT (code) DO NOTHING;

-- ── Financial Tree Types — CORRECTION ─────────────────────────────
-- 21 types: 7 income correction + 14 expense correction.
-- COR_EXP_SVC_OTHER and COR_EXP_OPS_OTHER are both named 'Náklady – ostatní'
-- but represent service-expense other and operations-expense other respectively.
INSERT INTO financial_tree_types (code, category_id, name, sort_order)
SELECT d.code, c.id, d.name, d.sort_order
FROM (VALUES
  ('COR_INC_FOUNDING',            'Příjem – založení společnosti',  10),
  ('COR_INC_COMPANY_CHANGE',      'Příjem – změny ve společnosti',  20),
  ('COR_INC_COMPANY_SALE',        'Příjem – prodej společností',    30),
  ('COR_INC_REGISTERED_OFFICE',   'Příjem – sídlo podnikání',       40),
  ('COR_INC_FREELANCER',          'Příjem – osvč',                  50),
  ('COR_INC_PERMANENT_RESIDENCE', 'Příjem – trvalý pobyt',          60),
  ('COR_INC_OTHER',               'Příjem – ostatní',               70),
  ('COR_EXP_FOUNDING',            'Náklady – založení společnosti', 80),
  ('COR_EXP_COMPANY_CHANGE',      'Náklady – změny ve společnosti', 90),
  ('COR_EXP_COMPANY_SALE',        'Náklady – prodej společností',   100),
  ('COR_EXP_REGISTERED_OFFICE',   'Náklady – sídlo podnikání',      110),
  ('COR_EXP_FREELANCER',          'Náklady – osvč',                 120),
  ('COR_EXP_PERMANENT_RESIDENCE', 'Náklady – trvalý pobyt',         130),
  ('COR_EXP_SVC_OTHER',           'Náklady – ostatní',              140),
  ('COR_EXP_PAYROLL',             'Náklady – výplaty',              150),
  ('COR_EXP_LEGAL',               'Náklady – právní',               160),
  ('COR_EXP_ACCOUNTING',          'Náklady – účetní',               170),
  ('COR_EXP_MARKETING',           'Náklady – marketing',            180),
  ('COR_EXP_OFFICE',              'Náklady – kancelář',             190),
  ('COR_EXP_IT_GRAPHICS',         'Náklady – IT & grafika',         200),
  ('COR_EXP_OPS_OTHER',           'Náklady – ostatní',              210)
) AS d(code, name, sort_order)
CROSS JOIN (SELECT id FROM financial_tree_categories WHERE code = 'CORRECTION') AS c
ON CONFLICT (code) DO NOTHING;

-- ── Financial Tree Types — TAX_PAYMENT ────────────────────────────
INSERT INTO financial_tree_types (code, category_id, name, sort_order)
SELECT d.code, c.id, d.name, d.sort_order
FROM (VALUES
  ('TAX_VAT',       'Platba DPH',  10),
  ('TAX_CORPORATE', 'Platba DPPO', 20)
) AS d(code, name, sort_order)
CROSS JOIN (SELECT id FROM financial_tree_categories WHERE code = 'TAX_PAYMENT') AS c
ON CONFLICT (code) DO NOTHING;

-- ── Financial Tree Types — INTERNAL ───────────────────────────────
INSERT INTO financial_tree_types (code, category_id, name, sort_order)
SELECT d.code, c.id, d.name, d.sort_order
FROM (VALUES
  ('INT_ACC_WITHDRAWAL',  'Výběr z účtu',        10),
  ('INT_ACC_DEPOSIT',     'Vklad na účet',        20),
  ('INT_CASH_WITHDRAWAL', 'Výběr z pokladny',     30),
  ('INT_CASH_DEPOSIT',    'Vklad na pokladnu',    40),
  ('INT_INTER_COMPANY',   'Převod mezi firmami',  50)
) AS d(code, name, sort_order)
CROSS JOIN (SELECT id FROM financial_tree_categories WHERE code = 'INTERNAL') AS c
ON CONFLICT (code) DO NOTHING;

-- ══════════════════════════════════════════════════════════════════
-- FINANCIAL TREE DETAILS
-- ══════════════════════════════════════════════════════════════════

-- ── Details — INC_SVC_FOUNDING ─────────────────────────────────────
INSERT INTO financial_tree_details (code, type_id, name, sort_order)
SELECT d.code, t.id, d.name, d.sort_order
FROM (VALUES
  ('DET_INC_FND_SRO',       'Založení s.r.o.',              10),
  ('DET_INC_FND_SMLOUVA',   'Společenská smlouva',          20),
  ('DET_INC_FND_AS',        'Založení a.s.',                30),
  ('DET_INC_FND_SE',        'Založení SE',                  40),
  ('DET_INC_FND_SPOLEK',    'Založení spolku',              50),
  ('DET_INC_FND_NADACE',    'Založení nadačního fondu',     60),
  ('DET_INC_FND_STANOVY',   'Kompozice stanov',             70),
  ('DET_INC_FND_ZIVNOST_A', 'Živnost odborná (A)',          80),
  ('DET_INC_FND_ZK20K',     'ZK nad 20 000 Kč',            90),
  ('DET_INC_FND_KMENOVE',   'Kmenové listy',               100),
  ('DET_INC_FND_PROKURA',   'Ustanovení prokuristy',       110),
  ('DET_INC_FND_ESM',       'Zápis do ESM',                120)
) AS d(code, name, sort_order)
CROSS JOIN (SELECT id FROM financial_tree_types WHERE code = 'INC_SVC_FOUNDING') AS t
ON CONFLICT (code) DO NOTHING;

-- ── Details — INC_SVC_COMPANY_CHANGE ──────────────────────────────
INSERT INTO financial_tree_details (code, type_id, name, sort_order)
SELECT d.code, t.id, d.name, d.sort_order
FROM (VALUES
  ('DET_INC_CHG_NOTAR',    'Změna (notář)',          10),
  ('DET_INC_CHG_SOUD',     'Změna (soud)',           20),
  ('DET_INC_CHG_ZIVNOST',  'Živnost odborná',        30),
  ('DET_INC_CHG_ZK20K',    'ZK nad 20 000 Kč',      40),
  ('DET_INC_CHG_KMENOVE',  'Kmenové listy',          50),
  ('DET_INC_CHG_PROKURA',  'Ustanovení prokuristy',  60),
  ('DET_INC_CHG_ESM_A',    'Zápis do ESM (A)',       70),
  ('DET_INC_CHG_ESM_B',    'Zápis do ESM (B)',       80),
  ('DET_INC_CHG_STANOVY',  'Změna stanov',           90)
) AS d(code, name, sort_order)
CROSS JOIN (SELECT id FROM financial_tree_types WHERE code = 'INC_SVC_COMPANY_CHANGE') AS t
ON CONFLICT (code) DO NOTHING;

-- ── Details — INC_SVC_COMPANY_SALE ────────────────────────────────
INSERT INTO financial_tree_details (code, type_id, name, sort_order)
SELECT d.code, t.id, d.name, d.sort_order
FROM (VALUES
  ('DET_INC_SAL_DPH_INT',   'Plátce DPH – interní',    10),
  ('DET_INC_SAL_DPH_EXT',   'Plátce DPH – externí',    20),
  ('DET_INC_SAL_NODPH_INT', 'Neplátce DPH – interní',  30),
  ('DET_INC_SAL_NODPH_EXT', 'Neplátce DPH – externí',  40)
) AS d(code, name, sort_order)
CROSS JOIN (SELECT id FROM financial_tree_types WHERE code = 'INC_SVC_COMPANY_SALE') AS t
ON CONFLICT (code) DO NOTHING;

-- ── Details — INC_SVC_REGISTERED_OFFICE ───────────────────────────
INSERT INTO financial_tree_details (code, type_id, name, sort_order)
SELECT d.code, t.id, d.name, d.sort_order
FROM (VALUES
  ('DET_INC_SID_P1_PRICNA', 'Praha 1 - Příčná',       10),
  ('DET_INC_SID_P3_VIKLEF', 'Praha 3 - Viklefova',    20),
  ('DET_INC_SID_P8_SVET',   'Praha 8 - Světova',      30),
  ('DET_INC_SID_P10_KOR',   'Praha 10 - Korunní',     40),
  ('DET_INC_SID_BRNO',      'Brno – Příkop',          50),
  ('DET_INC_SID_OSTRAVA',   'Ostrava – Čujkovova',    60),
  ('DET_INC_SID_SKENO',     'Skenování pošty',         70)
) AS d(code, name, sort_order)
CROSS JOIN (SELECT id FROM financial_tree_types WHERE code = 'INC_SVC_REGISTERED_OFFICE') AS t
ON CONFLICT (code) DO NOTHING;

-- ── Details — INC_SVC_FREELANCER ──────────────────────────────────
INSERT INTO financial_tree_details (code, type_id, name, sort_order)
SELECT d.code, t.id, d.name, d.sort_order
FROM (VALUES
  ('DET_INC_FRL_ZALOZENI', 'Založení osvč',                  10),
  ('DET_INC_FRL_ZMENA',    'Změna osvč',                     20),
  ('DET_INC_FRL_ZIVNOST',  'Živnost odborná',                30),
  ('DET_INC_FRL_PAUSALNI', 'Registrace k paušální dani',     40)
) AS d(code, name, sort_order)
CROSS JOIN (SELECT id FROM financial_tree_types WHERE code = 'INC_SVC_FREELANCER') AS t
ON CONFLICT (code) DO NOTHING;

-- ── Details — INC_SVC_PERMANENT_RESIDENCE ─────────────────────────
INSERT INTO financial_tree_details (code, type_id, name, sort_order)
SELECT d.code, t.id, d.name, d.sort_order
FROM (VALUES
  ('DET_INC_TP_P1_PRICNA', 'Praha 1 - Příčná',  10),
  ('DET_INC_TP_P9_DANDA',  'Praha 9 - Dandova',  20),
  ('DET_INC_TP_BRNO',      'Brno – Příkop',      30),
  ('DET_INC_TP_SKENO',     'Skenování pošty',     40)
) AS d(code, name, sort_order)
CROSS JOIN (SELECT id FROM financial_tree_types WHERE code = 'INC_SVC_PERMANENT_RESIDENCE') AS t
ON CONFLICT (code) DO NOTHING;

-- ── Details — INC_SVC_OTHER ───────────────────────────────────────
INSERT INTO financial_tree_details (code, type_id, name, sort_order)
SELECT d.code, t.id, d.name, d.sort_order
FROM (VALUES
  ('DET_INC_OTH_UCETNI',    'Účetní služby',       10),
  ('DET_INC_OTH_PRAVNI',    'Právní služby',        20),
  ('DET_INC_OTH_DATOVA',    'Datová schránka',      30),
  ('DET_INC_OTH_APOSTILA',  'Apostila',             40),
  ('DET_INC_OTH_SUPERLEGAL','Superlegalizace',       50),
  ('DET_INC_OTH_PREKLADY',  'Ověřené překlady',     60)
) AS d(code, name, sort_order)
CROSS JOIN (SELECT id FROM financial_tree_types WHERE code = 'INC_SVC_OTHER') AS t
ON CONFLICT (code) DO NOTHING;

-- ── Details — EXP_SVC_FOUNDING ────────────────────────────────────
INSERT INTO financial_tree_details (code, type_id, name, sort_order)
SELECT d.code, t.id, d.name, d.sort_order
FROM (VALUES
  ('DET_EXP_FND_NOTAR',    'Notář',             10),
  ('DET_EXP_FND_POPLATEK', 'Správní poplatky',  20)
) AS d(code, name, sort_order)
CROSS JOIN (SELECT id FROM financial_tree_types WHERE code = 'EXP_SVC_FOUNDING') AS t
ON CONFLICT (code) DO NOTHING;

-- ── Details — EXP_SVC_COMPANY_CHANGE ──────────────────────────────
INSERT INTO financial_tree_details (code, type_id, name, sort_order)
SELECT d.code, t.id, d.name, d.sort_order
FROM (VALUES
  ('DET_EXP_CHG_NOTAR',    'Notář',             10),
  ('DET_EXP_CHG_POPLATEK', 'Správní poplatky',  20)
) AS d(code, name, sort_order)
CROSS JOIN (SELECT id FROM financial_tree_types WHERE code = 'EXP_SVC_COMPANY_CHANGE') AS t
ON CONFLICT (code) DO NOTHING;

-- ── Details — EXP_SVC_COMPANY_SALE ────────────────────────────────
INSERT INTO financial_tree_details (code, type_id, name, sort_order)
SELECT d.code, t.id, d.name, d.sort_order
FROM (VALUES
  ('DET_EXP_SAL_RM_FND_NOTAR',  'RM založení – notář',             10),
  ('DET_EXP_SAL_RM_FND_ZIVN',   'RM založení – živnosti',          20),
  ('DET_EXP_SAL_RM_FND_SIDLO',  'RM založení – sídlo',             30),
  ('DET_EXP_SAL_RM_PROV_FND',   'RM provize – založení',           40),
  ('DET_EXP_SAL_RN_PROV_PROD',  'RN provize – prodej',             50),
  ('DET_EXP_SAL_RM_DOMENA',     'RM – doména',                     60),
  ('DET_EXP_SAL_RM_HOSTING',    'RM – webhosting',                 70),
  ('DET_EXP_SAL_RM_SW',         'RM – software',                   80),
  ('DET_EXP_SAL_RM_KANCL',      'RM – kancelářské vybavení',      90),
  ('DET_EXP_SAL_RM_PROD',       'RM – produkty',                  100),
  ('DET_EXP_SAL_RM_UCETNI',     'RM – účetní',                    110),
  ('DET_EXP_SAL_RM_BEZDIUZN',   'RM – potvrzení o bezdlužnosti',  120),
  ('DET_EXP_SAL_KONVERZE',      'Konverze / ověření',             130),
  ('DET_EXP_SAL_PROVIZE',       'Provize partneři',               140)
) AS d(code, name, sort_order)
CROSS JOIN (SELECT id FROM financial_tree_types WHERE code = 'EXP_SVC_COMPANY_SALE') AS t
ON CONFLICT (code) DO NOTHING;

-- ── Details — EXP_SVC_REGISTERED_OFFICE ───────────────────────────
INSERT INTO financial_tree_details (code, type_id, name, sort_order)
SELECT d.code, t.id, d.name, d.sort_order
FROM (VALUES
  ('DET_EXP_SID_P1_PRICNA', 'Praha 1 (Příčná)',       10),
  ('DET_EXP_SID_P3_VIKLEF', 'Praha 3 (Viklefova)',    20),
  ('DET_EXP_SID_P8_SVET',   'Praha 8 (Světova)',      30),
  ('DET_EXP_SID_P10_KOR',   'Praha 10 (Korunní)',     40),
  ('DET_EXP_SID_BRNO',      'Brno (Příkop)',          50),
  ('DET_EXP_SID_OSTRAVA',   'Ostrava (Dlouhá)',       60),
  ('DET_EXP_SID_SKENO',     'Skenování pošty (sídlo)', 70),
  ('DET_EXP_SID_KONVERZE',  'Konverze / ověřování',   80),
  ('DET_EXP_SID_PROVIZE',   'Provize partneři',        90)
) AS d(code, name, sort_order)
CROSS JOIN (SELECT id FROM financial_tree_types WHERE code = 'EXP_SVC_REGISTERED_OFFICE') AS t
ON CONFLICT (code) DO NOTHING;

-- ── Details — EXP_SVC_FREELANCER ──────────────────────────────────
INSERT INTO financial_tree_details (code, type_id, name, sort_order)
SELECT d.code, t.id, d.name, d.sort_order
FROM (VALUES
  ('DET_EXP_FRL_POPLATEK', 'Správní poplatky', 10)
) AS d(code, name, sort_order)
CROSS JOIN (SELECT id FROM financial_tree_types WHERE code = 'EXP_SVC_FREELANCER') AS t
ON CONFLICT (code) DO NOTHING;

-- ── Details — EXP_SVC_PERMANENT_RESIDENCE ─────────────────────────
INSERT INTO financial_tree_details (code, type_id, name, sort_order)
SELECT d.code, t.id, d.name, d.sort_order
FROM (VALUES
  ('DET_EXP_TP_P1_PRICNA', 'Praha 1 (Příčná)',  10),
  ('DET_EXP_TP_P9_DANDA',  'Praha 9 (Dandova)',  20),
  ('DET_EXP_TP_BRNO',      'Brno (Příkop)',      30)
) AS d(code, name, sort_order)
CROSS JOIN (SELECT id FROM financial_tree_types WHERE code = 'EXP_SVC_PERMANENT_RESIDENCE') AS t
ON CONFLICT (code) DO NOTHING;

-- ── Details — EXP_SVC_OTHER (placeholder) ─────────────────────────
INSERT INTO financial_tree_details (code, type_id, name, sort_order)
SELECT d.code, t.id, d.name, d.sort_order
FROM (VALUES
  ('DET_EXP_SVC_OTH_OSTATNI', 'Ostatní', 10)
) AS d(code, name, sort_order)
CROSS JOIN (SELECT id FROM financial_tree_types WHERE code = 'EXP_SVC_OTHER') AS t
ON CONFLICT (code) DO NOTHING;

-- ── Details — EXP_OPS_PAYROLL ─────────────────────────────────────
INSERT INTO financial_tree_details (code, type_id, name, sort_order)
SELECT d.code, t.id, d.name, d.sort_order
FROM (VALUES
  ('DET_EXP_PAY_KRISTIAN', 'Kristian', 10)
) AS d(code, name, sort_order)
CROSS JOIN (SELECT id FROM financial_tree_types WHERE code = 'EXP_OPS_PAYROLL') AS t
ON CONFLICT (code) DO NOTHING;

-- ── Details — EXP_OPS_LEGAL ───────────────────────────────────────
INSERT INTO financial_tree_details (code, type_id, name, sort_order)
SELECT d.code, t.id, d.name, d.sort_order
FROM (VALUES
  ('DET_EXP_LEG_NOTAR',   'Notář',            10),
  ('DET_EXP_LEG_POPLATEK','Správní poplatky',  20),
  ('DET_EXP_LEG_ADVO',    'Advokáti',          30),
  ('DET_EXP_LEG_SANKCE',  'Sankce a pokuty',   40)
) AS d(code, name, sort_order)
CROSS JOIN (SELECT id FROM financial_tree_types WHERE code = 'EXP_OPS_LEGAL') AS t
ON CONFLICT (code) DO NOTHING;

-- ── Details — EXP_OPS_ACCOUNTING ──────────────────────────────────
INSERT INTO financial_tree_details (code, type_id, name, sort_order)
SELECT d.code, t.id, d.name, d.sort_order
FROM (VALUES
  ('DET_EXP_ACC_DPH',  'Zpracování DPH',   10),
  ('DET_EXP_ACC_DPPO', 'Zpracování DPPO',  20),
  ('DET_EXP_ACC_KONZ', 'Konzultace',        30)
) AS d(code, name, sort_order)
CROSS JOIN (SELECT id FROM financial_tree_types WHERE code = 'EXP_OPS_ACCOUNTING') AS t
ON CONFLICT (code) DO NOTHING;

-- ── Details — EXP_OPS_MARKETING ───────────────────────────────────
INSERT INTO financial_tree_details (code, type_id, name, sort_order)
SELECT d.code, t.id, d.name, d.sort_order
FROM (VALUES
  ('DET_EXP_MKT_SEO',     'SEO',                    10),
  ('DET_EXP_MKT_PPC',     'PPC',                    20),
  ('DET_EXP_MKT_OBSAH',   'Tvorba obsahu',           30),
  ('DET_EXP_MKT_NASTROJE','Marketingové nástroje',   40),
  ('DET_EXP_MKT_KONZ',    'Konzultace',              50)
) AS d(code, name, sort_order)
CROSS JOIN (SELECT id FROM financial_tree_types WHERE code = 'EXP_OPS_MARKETING') AS t
ON CONFLICT (code) DO NOTHING;

-- ── Details — EXP_OPS_OFFICE ──────────────────────────────────────
INSERT INTO financial_tree_details (code, type_id, name, sort_order)
SELECT d.code, t.id, d.name, d.sort_order
FROM (VALUES
  ('DET_EXP_OFC_VYBAVENI', 'Kancelářské vybavení',  10),
  ('DET_EXP_OFC_TELEFON',  'Telefon / internet',     20),
  ('DET_EXP_OFC_GOOGLE',   'Google',                 30),
  ('DET_EXP_OFC_CHATGPT',  'ChatGPT',                40),
  ('DET_EXP_OFC_FAKTUROID','Fakturoid',               50),
  ('DET_EXP_OFC_KONVERZE', 'Konverze / ověřování',   60),
  ('DET_EXP_OFC_REPRE',    'Reprezentace',            70),
  ('DET_EXP_OFC_AUTO',     'Auto',                   80)
) AS d(code, name, sort_order)
CROSS JOIN (SELECT id FROM financial_tree_types WHERE code = 'EXP_OPS_OFFICE') AS t
ON CONFLICT (code) DO NOTHING;

-- ── Details — EXP_OPS_IT_GRAPHICS ─────────────────────────────────
INSERT INTO financial_tree_details (code, type_id, name, sort_order)
SELECT d.code, t.id, d.name, d.sort_order
FROM (VALUES
  ('DET_EXP_IT_DOMENA',  'Web doména',       10),
  ('DET_EXP_IT_HOSTING', 'Web hosting',      20),
  ('DET_EXP_IT_PLUGINY', 'Web pluginy',       30),
  ('DET_EXP_IT_SLUZBY',  'Služby IT',        40),
  ('DET_EXP_IT_GRAFIKA', 'Grafické služby',  50),
  ('DET_EXP_IT_LICENCE', 'Licence software', 60)
) AS d(code, name, sort_order)
CROSS JOIN (SELECT id FROM financial_tree_types WHERE code = 'EXP_OPS_IT_GRAPHICS') AS t
ON CONFLICT (code) DO NOTHING;

-- ── Details — EXP_OPS_OTHER (placeholder) ─────────────────────────
INSERT INTO financial_tree_details (code, type_id, name, sort_order)
SELECT d.code, t.id, d.name, d.sort_order
FROM (VALUES
  ('DET_EXP_OPS_OTH_OSTATNI', 'Ostatní', 10)
) AS d(code, name, sort_order)
CROSS JOIN (SELECT id FROM financial_tree_types WHERE code = 'EXP_OPS_OTHER') AS t
ON CONFLICT (code) DO NOTHING;

-- ── Details — OPT_LEGAL ───────────────────────────────────────────
INSERT INTO financial_tree_details (code, type_id, name, sort_order)
SELECT d.code, t.id, d.name, d.sort_order
FROM (VALUES
  ('DET_OPT_LEG_NOTAR',   'Notář',            10),
  ('DET_OPT_LEG_POPLATEK','Správní poplatky',  20),
  ('DET_OPT_LEG_ADVO',    'Advokáti',          30),
  ('DET_OPT_LEG_SANKCE',  'Sankce a pokuty',   40)
) AS d(code, name, sort_order)
CROSS JOIN (SELECT id FROM financial_tree_types WHERE code = 'OPT_LEGAL') AS t
ON CONFLICT (code) DO NOTHING;

-- ── Details — OPT_ACCOUNTING ──────────────────────────────────────
INSERT INTO financial_tree_details (code, type_id, name, sort_order)
SELECT d.code, t.id, d.name, d.sort_order
FROM (VALUES
  ('DET_OPT_ACC_DPH',  'Zpracování DPH',   10),
  ('DET_OPT_ACC_DPPO', 'Zpracování DPPO',  20),
  ('DET_OPT_ACC_KONZ', 'Konzultace',        30)
) AS d(code, name, sort_order)
CROSS JOIN (SELECT id FROM financial_tree_types WHERE code = 'OPT_ACCOUNTING') AS t
ON CONFLICT (code) DO NOTHING;

-- ── Details — OPT_MARKETING ───────────────────────────────────────
INSERT INTO financial_tree_details (code, type_id, name, sort_order)
SELECT d.code, t.id, d.name, d.sort_order
FROM (VALUES
  ('DET_OPT_MKT_SEO',     'SEO',                    10),
  ('DET_OPT_MKT_PPC',     'PPC',                    20),
  ('DET_OPT_MKT_OBSAH',   'Tvorba obsahu',           30),
  ('DET_OPT_MKT_NASTROJE','Marketingové nástroje',   40),
  ('DET_OPT_MKT_KONZ',    'Konzultace',              50)
) AS d(code, name, sort_order)
CROSS JOIN (SELECT id FROM financial_tree_types WHERE code = 'OPT_MARKETING') AS t
ON CONFLICT (code) DO NOTHING;

-- ── Details — OPT_OFFICE ──────────────────────────────────────────
INSERT INTO financial_tree_details (code, type_id, name, sort_order)
SELECT d.code, t.id, d.name, d.sort_order
FROM (VALUES
  ('DET_OPT_OFC_VYBAVENI', 'Kancelářské vybavení',  10),
  ('DET_OPT_OFC_TELEFON',  'Telefon / internet',     20),
  ('DET_OPT_OFC_GOOGLE',   'Google',                 30),
  ('DET_OPT_OFC_CHATGPT',  'ChatGPT',                40),
  ('DET_OPT_OFC_FAKTUROID','Fakturoid',               50),
  ('DET_OPT_OFC_KONVERZE', 'Konverze / ověřování',   60),
  ('DET_OPT_OFC_REPRE',    'Reprezentace',            70),
  ('DET_OPT_OFC_AUTO',     'Auto',                   80)
) AS d(code, name, sort_order)
CROSS JOIN (SELECT id FROM financial_tree_types WHERE code = 'OPT_OFFICE') AS t
ON CONFLICT (code) DO NOTHING;

-- ── Details — OPT_IT_GRAPHICS ─────────────────────────────────────
INSERT INTO financial_tree_details (code, type_id, name, sort_order)
SELECT d.code, t.id, d.name, d.sort_order
FROM (VALUES
  ('DET_OPT_IT_DOMENA',  'Web doména',       10),
  ('DET_OPT_IT_HOSTING', 'Web hosting',      20),
  ('DET_OPT_IT_PLUGINY', 'Web pluginy',       30),
  ('DET_OPT_IT_SLUZBY',  'Služby IT',        40),
  ('DET_OPT_IT_GRAFIKA', 'Grafické služby',  50),
  ('DET_OPT_IT_LICENCE', 'Licence software', 60)
) AS d(code, name, sort_order)
CROSS JOIN (SELECT id FROM financial_tree_types WHERE code = 'OPT_IT_GRAPHICS') AS t
ON CONFLICT (code) DO NOTHING;

-- ── Details — OPT_OTHER (placeholder) ────────────────────────────
INSERT INTO financial_tree_details (code, type_id, name, sort_order)
SELECT d.code, t.id, d.name, d.sort_order
FROM (VALUES
  ('DET_OPT_OTH_OSTATNI', 'Ostatní', 10)
) AS d(code, name, sort_order)
CROSS JOIN (SELECT id FROM financial_tree_types WHERE code = 'OPT_OTHER') AS t
ON CONFLICT (code) DO NOTHING;

-- ── Details — COR_INC_FOUNDING ────────────────────────────────────
INSERT INTO financial_tree_details (code, type_id, name, sort_order)
SELECT d.code, t.id, d.name, d.sort_order
FROM (VALUES
  ('DET_COR_INC_FND_SRO',       'Založení s.r.o.',           10),
  ('DET_COR_INC_FND_SMLOUVA',   'Společenská smlouva',       20),
  ('DET_COR_INC_FND_AS',        'Založení a.s.',             30),
  ('DET_COR_INC_FND_SE',        'Založení SE',               40),
  ('DET_COR_INC_FND_SPOLEK',    'Založení spolku',           50),
  ('DET_COR_INC_FND_NADACE',    'Založení nadačního fondu',  60),
  ('DET_COR_INC_FND_STANOVY',   'Kompozice stanov',          70),
  ('DET_COR_INC_FND_ZIVNOST_A', 'Živnost odborná (A)',       80),
  ('DET_COR_INC_FND_ZK20K',     'ZK nad 20 000 Kč',         90),
  ('DET_COR_INC_FND_KMENOVE',   'Kmenové listy',            100),
  ('DET_COR_INC_FND_PROKURA',   'Ustanovení prokuristy',    110),
  ('DET_COR_INC_FND_ESM',       'Zápis do ESM',             120)
) AS d(code, name, sort_order)
CROSS JOIN (SELECT id FROM financial_tree_types WHERE code = 'COR_INC_FOUNDING') AS t
ON CONFLICT (code) DO NOTHING;

-- ── Details — COR_INC_COMPANY_CHANGE ──────────────────────────────
INSERT INTO financial_tree_details (code, type_id, name, sort_order)
SELECT d.code, t.id, d.name, d.sort_order
FROM (VALUES
  ('DET_COR_INC_CHG_NOTAR',   'Změna (notář)',         10),
  ('DET_COR_INC_CHG_SOUD',    'Změna (soud)',          20),
  ('DET_COR_INC_CHG_ZIVNOST', 'Živnost odborná',       30),
  ('DET_COR_INC_CHG_ZK20K',   'ZK nad 20 000 Kč',     40),
  ('DET_COR_INC_CHG_KMENOVE', 'Kmenové listy',         50),
  ('DET_COR_INC_CHG_PROKURA', 'Ustanovení prokuristy', 60),
  ('DET_COR_INC_CHG_ESM_A',   'Zápis do ESM (A)',      70),
  ('DET_COR_INC_CHG_ESM_B',   'Zápis do ESM (B)',      80),
  ('DET_COR_INC_CHG_STANOVY', 'Změna stanov',          90)
) AS d(code, name, sort_order)
CROSS JOIN (SELECT id FROM financial_tree_types WHERE code = 'COR_INC_COMPANY_CHANGE') AS t
ON CONFLICT (code) DO NOTHING;

-- ── Details — COR_INC_COMPANY_SALE ────────────────────────────────
INSERT INTO financial_tree_details (code, type_id, name, sort_order)
SELECT d.code, t.id, d.name, d.sort_order
FROM (VALUES
  ('DET_COR_INC_SAL_DPH',   'RM plátce DPH',   10),
  ('DET_COR_INC_SAL_NODPH', 'RM neplátce DPH', 20)
) AS d(code, name, sort_order)
CROSS JOIN (SELECT id FROM financial_tree_types WHERE code = 'COR_INC_COMPANY_SALE') AS t
ON CONFLICT (code) DO NOTHING;

-- ── Details — COR_INC_REGISTERED_OFFICE ───────────────────────────
INSERT INTO financial_tree_details (code, type_id, name, sort_order)
SELECT d.code, t.id, d.name, d.sort_order
FROM (VALUES
  ('DET_COR_INC_SID_P1_PRICNA', 'Praha 1 - Příčná',    10),
  ('DET_COR_INC_SID_P3_VIKLEF', 'Praha 3 - Viklefova',  20),
  ('DET_COR_INC_SID_P8_SVET',   'Praha 8 - Světova',    30),
  ('DET_COR_INC_SID_P10_KOR',   'Praha 10 - Korunní',   40),
  ('DET_COR_INC_SID_BRNO',      'Brno – Příkop',        50),
  ('DET_COR_INC_SID_OSTRAVA',   'Ostrava – Čujkovova',  60),
  ('DET_COR_INC_SID_SKENO',     'Skenování pošty',       70)
) AS d(code, name, sort_order)
CROSS JOIN (SELECT id FROM financial_tree_types WHERE code = 'COR_INC_REGISTERED_OFFICE') AS t
ON CONFLICT (code) DO NOTHING;

-- ── Details — COR_INC_FREELANCER ──────────────────────────────────
INSERT INTO financial_tree_details (code, type_id, name, sort_order)
SELECT d.code, t.id, d.name, d.sort_order
FROM (VALUES
  ('DET_COR_INC_FRL_ZALOZENI', 'Založení osvč',              10),
  ('DET_COR_INC_FRL_ZMENA',    'Změna osvč',                 20),
  ('DET_COR_INC_FRL_ZIVNOST',  'Živnost odborná',            30),
  ('DET_COR_INC_FRL_PAUSALNI', 'Registrace k paušální dani', 40)
) AS d(code, name, sort_order)
CROSS JOIN (SELECT id FROM financial_tree_types WHERE code = 'COR_INC_FREELANCER') AS t
ON CONFLICT (code) DO NOTHING;

-- ── Details — COR_INC_PERMANENT_RESIDENCE ─────────────────────────
INSERT INTO financial_tree_details (code, type_id, name, sort_order)
SELECT d.code, t.id, d.name, d.sort_order
FROM (VALUES
  ('DET_COR_INC_TP_P1_PRICNA', 'Praha 1 - Příčná',  10),
  ('DET_COR_INC_TP_P9_DANDA',  'Praha 9 - Dandova',  20),
  ('DET_COR_INC_TP_BRNO',      'Brno – Příkop',      30),
  ('DET_COR_INC_TP_SKENO',     'Skenování pošty',     40)
) AS d(code, name, sort_order)
CROSS JOIN (SELECT id FROM financial_tree_types WHERE code = 'COR_INC_PERMANENT_RESIDENCE') AS t
ON CONFLICT (code) DO NOTHING;

-- ── Details — COR_INC_OTHER ───────────────────────────────────────
INSERT INTO financial_tree_details (code, type_id, name, sort_order)
SELECT d.code, t.id, d.name, d.sort_order
FROM (VALUES
  ('DET_COR_INC_OTH_UCETNI',    'Účetní služby',       10),
  ('DET_COR_INC_OTH_PRAVNI',    'Právní služby',        20),
  ('DET_COR_INC_OTH_DATOVA',    'Datová schránka',      30),
  ('DET_COR_INC_OTH_APOSTILA',  'Apostila',             40),
  ('DET_COR_INC_OTH_SUPERLEGAL','Superlegalizace',       50),
  ('DET_COR_INC_OTH_PREKLADY',  'Ověřené překlady',     60)
) AS d(code, name, sort_order)
CROSS JOIN (SELECT id FROM financial_tree_types WHERE code = 'COR_INC_OTHER') AS t
ON CONFLICT (code) DO NOTHING;

-- ── Details — COR_EXP_FOUNDING ────────────────────────────────────
INSERT INTO financial_tree_details (code, type_id, name, sort_order)
SELECT d.code, t.id, d.name, d.sort_order
FROM (VALUES
  ('DET_COR_EXP_FND_NOTAR',    'Notář',            10),
  ('DET_COR_EXP_FND_POPLATEK', 'Správní poplatky', 20)
) AS d(code, name, sort_order)
CROSS JOIN (SELECT id FROM financial_tree_types WHERE code = 'COR_EXP_FOUNDING') AS t
ON CONFLICT (code) DO NOTHING;

-- ── Details — COR_EXP_COMPANY_CHANGE ──────────────────────────────
INSERT INTO financial_tree_details (code, type_id, name, sort_order)
SELECT d.code, t.id, d.name, d.sort_order
FROM (VALUES
  ('DET_COR_EXP_CHG_NOTAR',    'Notář',            10),
  ('DET_COR_EXP_CHG_POPLATEK', 'Správní poplatky', 20)
) AS d(code, name, sort_order)
CROSS JOIN (SELECT id FROM financial_tree_types WHERE code = 'COR_EXP_COMPANY_CHANGE') AS t
ON CONFLICT (code) DO NOTHING;

-- ── Details — COR_EXP_COMPANY_SALE ────────────────────────────────
INSERT INTO financial_tree_details (code, type_id, name, sort_order)
SELECT d.code, t.id, d.name, d.sort_order
FROM (VALUES
  ('DET_COR_EXP_SAL_RM_FND_NOTAR', 'RM založení – notář',           10),
  ('DET_COR_EXP_SAL_RM_FND_ZIVN',  'RM založení – živnosti',        20),
  ('DET_COR_EXP_SAL_RM_FND_SIDLO', 'RM založení – sídlo',           30),
  ('DET_COR_EXP_SAL_RM_DOMENA',    'RM – doména',                   40),
  ('DET_COR_EXP_SAL_RM_HOSTING',   'RM – webhosting',               50),
  ('DET_COR_EXP_SAL_RM_SW',        'RM – software',                 60),
  ('DET_COR_EXP_SAL_RM_KANCL',     'RM – kancelářské vybavení',    70),
  ('DET_COR_EXP_SAL_RM_PROD',      'RM – produkty',                 80),
  ('DET_COR_EXP_SAL_RM_UCETNI',    'RM – účetní',                   90),
  ('DET_COR_EXP_SAL_PROVIZE',      'Provize partneři',              100)
) AS d(code, name, sort_order)
CROSS JOIN (SELECT id FROM financial_tree_types WHERE code = 'COR_EXP_COMPANY_SALE') AS t
ON CONFLICT (code) DO NOTHING;

-- ── Details — COR_EXP_REGISTERED_OFFICE ───────────────────────────
INSERT INTO financial_tree_details (code, type_id, name, sort_order)
SELECT d.code, t.id, d.name, d.sort_order
FROM (VALUES
  ('DET_COR_EXP_SID_P1_PRICNA', 'Praha 1 (Příčná)',       10),
  ('DET_COR_EXP_SID_P3_VIKLEF', 'Praha 3 (Viklefova)',    20),
  ('DET_COR_EXP_SID_P8_SVET',   'Praha 8 (Světova)',      30),
  ('DET_COR_EXP_SID_P10_KOR',   'Praha 10 (Korunní)',     40),
  ('DET_COR_EXP_SID_BRNO',      'Brno (Příkop)',          50),
  ('DET_COR_EXP_SID_OSTRAVA',   'Ostrava (Dlouhá)',       60),
  ('DET_COR_EXP_SID_SKENO',     'Skenování pošty (sídlo)', 70),
  ('DET_COR_EXP_SID_KONVERZE',  'Konverze / ověřování',   80),
  ('DET_COR_EXP_SID_PROVIZE',   'Provize partneři',        90)
) AS d(code, name, sort_order)
CROSS JOIN (SELECT id FROM financial_tree_types WHERE code = 'COR_EXP_REGISTERED_OFFICE') AS t
ON CONFLICT (code) DO NOTHING;

-- ── Details — COR_EXP_FREELANCER ──────────────────────────────────
INSERT INTO financial_tree_details (code, type_id, name, sort_order)
SELECT d.code, t.id, d.name, d.sort_order
FROM (VALUES
  ('DET_COR_EXP_FRL_POPLATEK', 'Správní poplatky', 10)
) AS d(code, name, sort_order)
CROSS JOIN (SELECT id FROM financial_tree_types WHERE code = 'COR_EXP_FREELANCER') AS t
ON CONFLICT (code) DO NOTHING;

-- ── Details — COR_EXP_PERMANENT_RESIDENCE ─────────────────────────
INSERT INTO financial_tree_details (code, type_id, name, sort_order)
SELECT d.code, t.id, d.name, d.sort_order
FROM (VALUES
  ('DET_COR_EXP_TP_P1_PRICNA', 'Praha 1 (Příčná)',  10),
  ('DET_COR_EXP_TP_P9_DANDA',  'Praha 9 (Dandova)',  20),
  ('DET_COR_EXP_TP_BRNO',      'Brno (Příkop)',      30)
) AS d(code, name, sort_order)
CROSS JOIN (SELECT id FROM financial_tree_types WHERE code = 'COR_EXP_PERMANENT_RESIDENCE') AS t
ON CONFLICT (code) DO NOTHING;

-- ── Details — COR_EXP_SVC_OTHER (placeholder) ─────────────────────
INSERT INTO financial_tree_details (code, type_id, name, sort_order)
SELECT d.code, t.id, d.name, d.sort_order
FROM (VALUES
  ('DET_COR_EXP_SVC_OTH_OSTATNI', 'Ostatní', 10)
) AS d(code, name, sort_order)
CROSS JOIN (SELECT id FROM financial_tree_types WHERE code = 'COR_EXP_SVC_OTHER') AS t
ON CONFLICT (code) DO NOTHING;

-- ── Details — COR_EXP_PAYROLL ─────────────────────────────────────
INSERT INTO financial_tree_details (code, type_id, name, sort_order)
SELECT d.code, t.id, d.name, d.sort_order
FROM (VALUES
  ('DET_COR_EXP_PAY_KRISTIAN', 'Kristian', 10)
) AS d(code, name, sort_order)
CROSS JOIN (SELECT id FROM financial_tree_types WHERE code = 'COR_EXP_PAYROLL') AS t
ON CONFLICT (code) DO NOTHING;

-- ── Details — COR_EXP_LEGAL ───────────────────────────────────────
INSERT INTO financial_tree_details (code, type_id, name, sort_order)
SELECT d.code, t.id, d.name, d.sort_order
FROM (VALUES
  ('DET_COR_EXP_LEG_NOTAR',   'Notář',            10),
  ('DET_COR_EXP_LEG_POPLATEK','Správní poplatky',  20),
  ('DET_COR_EXP_LEG_ADVO',    'Advokáti',          30),
  ('DET_COR_EXP_LEG_SANKCE',  'Sankce a pokuty',   40)
) AS d(code, name, sort_order)
CROSS JOIN (SELECT id FROM financial_tree_types WHERE code = 'COR_EXP_LEGAL') AS t
ON CONFLICT (code) DO NOTHING;

-- ── Details — COR_EXP_ACCOUNTING ──────────────────────────────────
INSERT INTO financial_tree_details (code, type_id, name, sort_order)
SELECT d.code, t.id, d.name, d.sort_order
FROM (VALUES
  ('DET_COR_EXP_ACC_DPH',  'Zpracování DPH',  10),
  ('DET_COR_EXP_ACC_DPPO', 'Zpracování DPPO', 20),
  ('DET_COR_EXP_ACC_KONZ', 'Konzultace',       30)
) AS d(code, name, sort_order)
CROSS JOIN (SELECT id FROM financial_tree_types WHERE code = 'COR_EXP_ACCOUNTING') AS t
ON CONFLICT (code) DO NOTHING;

-- ── Details — COR_EXP_MARKETING ───────────────────────────────────
INSERT INTO financial_tree_details (code, type_id, name, sort_order)
SELECT d.code, t.id, d.name, d.sort_order
FROM (VALUES
  ('DET_COR_EXP_MKT_SEO',     'SEO',                   10),
  ('DET_COR_EXP_MKT_PPC',     'PPC',                   20),
  ('DET_COR_EXP_MKT_OBSAH',   'Tvorba obsahu',          30),
  ('DET_COR_EXP_MKT_NASTROJE','Marketingové nástroje',  40),
  ('DET_COR_EXP_MKT_KONZ',    'Konzultace',             50)
) AS d(code, name, sort_order)
CROSS JOIN (SELECT id FROM financial_tree_types WHERE code = 'COR_EXP_MARKETING') AS t
ON CONFLICT (code) DO NOTHING;

-- ── Details — COR_EXP_OFFICE ──────────────────────────────────────
INSERT INTO financial_tree_details (code, type_id, name, sort_order)
SELECT d.code, t.id, d.name, d.sort_order
FROM (VALUES
  ('DET_COR_EXP_OFC_VYBAVENI', 'Kancelářské vybavení',  10),
  ('DET_COR_EXP_OFC_TELEFON',  'Telefon / internet',     20),
  ('DET_COR_EXP_OFC_GOOGLE',   'Google',                 30),
  ('DET_COR_EXP_OFC_CHATGPT',  'ChatGPT',                40),
  ('DET_COR_EXP_OFC_FAKTUROID','Fakturoid',               50),
  ('DET_COR_EXP_OFC_KONVERZE', 'Konverze / ověřování',   60),
  ('DET_COR_EXP_OFC_REPRE',    'Reprezentace',            70),
  ('DET_COR_EXP_OFC_AUTO',     'Auto',                   80)
) AS d(code, name, sort_order)
CROSS JOIN (SELECT id FROM financial_tree_types WHERE code = 'COR_EXP_OFFICE') AS t
ON CONFLICT (code) DO NOTHING;

-- ── Details — COR_EXP_IT_GRAPHICS ─────────────────────────────────
INSERT INTO financial_tree_details (code, type_id, name, sort_order)
SELECT d.code, t.id, d.name, d.sort_order
FROM (VALUES
  ('DET_COR_EXP_IT_DOMENA',  'Web doména',       10),
  ('DET_COR_EXP_IT_HOSTING', 'Web hosting',      20),
  ('DET_COR_EXP_IT_PLUGINY', 'Web pluginy',       30),
  ('DET_COR_EXP_IT_SLUZBY',  'Služby IT',        40),
  ('DET_COR_EXP_IT_GRAFIKA', 'Grafické služby',  50),
  ('DET_COR_EXP_IT_LICENCE', 'Licence software', 60)
) AS d(code, name, sort_order)
CROSS JOIN (SELECT id FROM financial_tree_types WHERE code = 'COR_EXP_IT_GRAPHICS') AS t
ON CONFLICT (code) DO NOTHING;

-- ── Details — COR_EXP_OPS_OTHER (placeholder) ─────────────────────
INSERT INTO financial_tree_details (code, type_id, name, sort_order)
SELECT d.code, t.id, d.name, d.sort_order
FROM (VALUES
  ('DET_COR_EXP_OPS_OTH_OSTATNI', 'Ostatní', 10)
) AS d(code, name, sort_order)
CROSS JOIN (SELECT id FROM financial_tree_types WHERE code = 'COR_EXP_OPS_OTHER') AS t
ON CONFLICT (code) DO NOTHING;

-- ── Details — TAX_VAT (type = leaf detail) ────────────────────────
INSERT INTO financial_tree_details (code, type_id, name, sort_order)
SELECT d.code, t.id, d.name, d.sort_order
FROM (VALUES
  ('DET_TAX_VAT', 'Platba DPH', 10)
) AS d(code, name, sort_order)
CROSS JOIN (SELECT id FROM financial_tree_types WHERE code = 'TAX_VAT') AS t
ON CONFLICT (code) DO NOTHING;

-- ── Details — TAX_CORPORATE (type = leaf detail) ──────────────────
INSERT INTO financial_tree_details (code, type_id, name, sort_order)
SELECT d.code, t.id, d.name, d.sort_order
FROM (VALUES
  ('DET_TAX_CORP', 'Platba DPPO', 10)
) AS d(code, name, sort_order)
CROSS JOIN (SELECT id FROM financial_tree_types WHERE code = 'TAX_CORPORATE') AS t
ON CONFLICT (code) DO NOTHING;

-- ── Details — INTERNAL types (type = leaf detail) ─────────────────
INSERT INTO financial_tree_details (code, type_id, name, sort_order)
SELECT d.code, t.id, d.name, d.sort_order
FROM (VALUES ('DET_INT_ACC_WD', 'Výběr z účtu', 10)) AS d(code, name, sort_order)
CROSS JOIN (SELECT id FROM financial_tree_types WHERE code = 'INT_ACC_WITHDRAWAL') AS t
ON CONFLICT (code) DO NOTHING;

INSERT INTO financial_tree_details (code, type_id, name, sort_order)
SELECT d.code, t.id, d.name, d.sort_order
FROM (VALUES ('DET_INT_ACC_DEP', 'Vklad na účet', 10)) AS d(code, name, sort_order)
CROSS JOIN (SELECT id FROM financial_tree_types WHERE code = 'INT_ACC_DEPOSIT') AS t
ON CONFLICT (code) DO NOTHING;

INSERT INTO financial_tree_details (code, type_id, name, sort_order)
SELECT d.code, t.id, d.name, d.sort_order
FROM (VALUES ('DET_INT_CASH_WD', 'Výběr z pokladny', 10)) AS d(code, name, sort_order)
CROSS JOIN (SELECT id FROM financial_tree_types WHERE code = 'INT_CASH_WITHDRAWAL') AS t
ON CONFLICT (code) DO NOTHING;

INSERT INTO financial_tree_details (code, type_id, name, sort_order)
SELECT d.code, t.id, d.name, d.sort_order
FROM (VALUES ('DET_INT_CASH_DEP', 'Vklad na pokladnu', 10)) AS d(code, name, sort_order)
CROSS JOIN (SELECT id FROM financial_tree_types WHERE code = 'INT_CASH_DEPOSIT') AS t
ON CONFLICT (code) DO NOTHING;

INSERT INTO financial_tree_details (code, type_id, name, sort_order)
SELECT d.code, t.id, d.name, d.sort_order
FROM (VALUES ('DET_INT_INTER_CO', 'Převod mezi firmami', 10)) AS d(code, name, sort_order)
CROSS JOIN (SELECT id FROM financial_tree_types WHERE code = 'INT_INTER_COMPANY') AS t
ON CONFLICT (code) DO NOTHING;
