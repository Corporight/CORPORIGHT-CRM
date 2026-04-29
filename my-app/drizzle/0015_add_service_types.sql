-- Wave 11.2: Create service_types reference table.
-- Canonical catalog for all services offered. Source of truth for Orders and Finance.
-- long_term_service_type_id: nullable UUID without FK — long_term_service_types is Phase 2.
-- financial_tree_detail_id: nullable FK — populated in seed only where one unambiguous
--   income detail exists per service; NULL otherwise (detail chosen at movement entry).

CREATE TABLE "service_types" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "service_category" text NOT NULL,
  "applicable_to" text NOT NULL,
  "allowed_primary_service_codes" text[],
  "base_price" numeric(12, 2) DEFAULT '0' NOT NULL,
  "vat_rate" numeric(5, 2) DEFAULT '21' NOT NULL,
  "source_of_funds_threshold" numeric(14, 2),
  "financial_tree_detail_id" uuid,
  "creates_long_term_service" boolean DEFAULT false NOT NULL,
  "long_term_service_type_id" uuid,
  "requires_recipient" boolean DEFAULT false NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "service_types_code_unique" UNIQUE ("code"),
  CONSTRAINT "st_category_check" CHECK ("service_category" IN ('PRIMARY', 'SUPPLEMENTARY', 'STANDALONE')),
  CONSTRAINT "st_applicable_to_check" CHECK ("applicable_to" IN ('COMPANY', 'PERSON', 'BOTH')),
  CONSTRAINT "st_base_price_check" CHECK ("base_price" >= 0),
  CONSTRAINT "st_vat_rate_check" CHECK ("vat_rate" >= 0 AND "vat_rate" <= 100)
);
--> statement-breakpoint
ALTER TABLE "service_types"
  ADD CONSTRAINT "st_financial_tree_detail_id_fk"
  FOREIGN KEY ("financial_tree_detail_id")
  REFERENCES "financial_tree_details"("id")
  ON DELETE SET NULL;
--> statement-breakpoint
CREATE INDEX "idx_service_types_category" ON "service_types" ("service_category");
--> statement-breakpoint
CREATE INDEX "idx_service_types_active" ON "service_types" ("is_active");
