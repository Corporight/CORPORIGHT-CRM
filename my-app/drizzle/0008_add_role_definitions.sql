CREATE TABLE "role_definitions" (
	"code" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"participant_type" text NOT NULL,
	"generates_relation" boolean DEFAULT false NOT NULL,
	"requires_share" boolean DEFAULT false NOT NULL,
	"requires_acting_person" boolean DEFAULT false NOT NULL,
	"aml_requirement" text DEFAULT 'EXEMPT' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "role_definitions_participant_type_check" CHECK ("role_definitions"."participant_type" IN ('CORPORATE', 'SERVICE')),
	CONSTRAINT "role_definitions_aml_requirement_check" CHECK ("role_definitions"."aml_requirement" IN ('REQUIRED', 'OPTIONAL', 'EXEMPT'))
);

INSERT INTO role_definitions
  (code, name, participant_type, generates_relation, requires_share, requires_acting_person, aml_requirement, sort_order)
VALUES
  ('DIRECTOR',                   'Director',                    'CORPORATE', true,  false, false, 'REQUIRED', 10),
  ('STATUTORY_DIRECTOR',         'Statutory Director',          'CORPORATE', false, false, false, 'REQUIRED', 20),
  ('BOARD_MEMBER',               'Board Member',                'CORPORATE', false, false, false, 'REQUIRED', 30),
  ('BOARD_CHAIR',                'Board Chair',                 'CORPORATE', false, false, false, 'REQUIRED', 40),
  ('SUPERVISORY_BOARD_MEMBER',   'Supervisory Board Member',    'CORPORATE', false, false, false, 'REQUIRED', 50),
  ('SUPERVISORY_BOARD_CHAIR',    'Supervisory Board Chair',     'CORPORATE', false, false, false, 'REQUIRED', 60),
  ('ADMIN_BOARD_MEMBER',         'Administrative Board Member', 'CORPORATE', false, false, false, 'REQUIRED', 70),
  ('PROCURIST',                  'Procurist',                   'CORPORATE', true,  false, false, 'REQUIRED', 80),
  ('SHAREHOLDER',                'Shareholder',                 'CORPORATE', true,  true,  false, 'REQUIRED', 90),
  ('BENEFICIAL_OWNER',           'Beneficial Owner',            'CORPORATE', true,  false, false, 'REQUIRED', 100),
  ('RESPONSIBLE_REPRESENTATIVE', 'Responsible Representative',  'CORPORATE', false, false, false, 'REQUIRED', 110),
  ('ASSOCIATION_CHAIR',          'Association Chair',           'CORPORATE', false, false, false, 'REQUIRED', 120),
  ('ASSOCIATION_BOARD_MEMBER',   'Association Board Member',    'CORPORATE', false, false, false, 'REQUIRED', 130),
  ('FOUNDATION_TRUSTEE',         'Foundation Trustee',          'CORPORATE', false, false, false, 'REQUIRED', 140),
  ('FOUNDATION_AUDITOR',         'Foundation Auditor',          'CORPORATE', false, false, false, 'EXEMPT',   150),
  ('ORDERER',                    'Orderer',                     'SERVICE',   false, false, false, 'EXEMPT',   200),
  ('RECIPIENT',                  'Recipient',                   'SERVICE',   false, false, false, 'EXEMPT',   210),
  ('BILLING',                    'Billing Contact',             'SERVICE',   false, false, false, 'EXEMPT',   220),
  ('PRIMARY_CONTACT',            'Primary Contact',             'SERVICE',   false, false, false, 'EXEMPT',   230),
  ('CONTACT',                    'Contact',                     'SERVICE',   false, false, false, 'EXEMPT',   240),
  ('PROPERTY_OWNER',             'Property Owner',              'SERVICE',   false, false, false, 'EXEMPT',   250)
ON CONFLICT (code) DO NOTHING;
