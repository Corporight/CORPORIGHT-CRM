CREATE TABLE "centers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"vat_mode" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "centers_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "financial_movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payment_group_id" uuid,
	"order_id" uuid,
	"order_item_id" uuid,
	"subject_id" uuid,
	"vat_registration_id" uuid,
	"center_id" uuid NOT NULL,
	"direction" text NOT NULL,
	"amount_gross" numeric(14, 2) NOT NULL,
	"amount_net" numeric(14, 2) NOT NULL,
	"vat_amount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"vat_mode" text DEFAULT 'NO_VAT' NOT NULL,
	"vat_rate" numeric(5, 2) DEFAULT '0' NOT NULL,
	"category_id" uuid NOT NULL,
	"type_id" uuid NOT NULL,
	"detail_id" uuid NOT NULL,
	"description" text NOT NULL,
	"movement_date" date NOT NULL,
	"accounting_date" date,
	"document_number" text,
	"document_date" date,
	"template_id" uuid,
	"note" text,
	"note_internal" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	CONSTRAINT "fm_direction_check" CHECK ("financial_movements"."direction" IN ('INCOME', 'EXPENSE', 'INTERNAL')),
	CONSTRAINT "fm_vat_mode_check" CHECK ("financial_movements"."vat_mode" IN ('NO_VAT', 'STANDARD', 'REVERSE_CHARGE')),
	CONSTRAINT "fm_amount_gross_check" CHECK ("financial_movements"."amount_gross" >= 0),
	CONSTRAINT "fm_amount_net_check" CHECK ("financial_movements"."amount_net" >= 0),
	CONSTRAINT "fm_vat_amount_check" CHECK ("financial_movements"."vat_amount" >= 0)
);
--> statement-breakpoint
CREATE TABLE "financial_tree_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"direction" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "financial_tree_categories_code_unique" UNIQUE("code"),
	CONSTRAINT "ftc_direction_check" CHECK ("financial_tree_categories"."direction" IN ('INCOME', 'EXPENSE', 'INTERNAL'))
);
--> statement-breakpoint
CREATE TABLE "financial_tree_details" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"type_id" uuid NOT NULL,
	"name" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "financial_tree_details_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "financial_tree_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"category_id" uuid NOT NULL,
	"name" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "financial_tree_types_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "payment_allocations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payment_group_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"allocated_amount" numeric(14, 2) NOT NULL,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"cancelled_at" timestamp with time zone,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	CONSTRAINT "pa_status_check" CHECK ("payment_allocations"."status" IN ('ACTIVE', 'CANCELLED')),
	CONSTRAINT "pa_allocated_amount_check" CHECK ("payment_allocations"."allocated_amount" > 0)
);
--> statement-breakpoint
CREATE TABLE "payment_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"center_id" uuid NOT NULL,
	"direction" text NOT NULL,
	"total_amount" numeric(14, 2) NOT NULL,
	"allocated_amount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"processing_status" text DEFAULT 'NEW' NOT NULL,
	"currency" text DEFAULT 'CZK' NOT NULL,
	"transaction_date" date NOT NULL,
	"counterparty_subject_id" uuid,
	"counterparty_name" text,
	"counterparty_account_number" text,
	"counterparty_bank_code" text,
	"variable_symbol" text,
	"constant_symbol" text,
	"specific_symbol" text,
	"bank_reference" text,
	"source" text DEFAULT 'MANUAL' NOT NULL,
	"note" text,
	"note_internal" text,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	CONSTRAINT "pg_direction_check" CHECK ("payment_groups"."direction" IN ('INCOME', 'EXPENSE', 'INTERNAL')),
	CONSTRAINT "pg_status_check" CHECK ("payment_groups"."processing_status" IN ('NEW', 'PARTIALLY_ALLOCATED', 'FULLY_ALLOCATED', 'CANCELLED')),
	CONSTRAINT "pg_source_check" CHECK ("payment_groups"."source" IN ('MANUAL', 'CASH', 'BANK_IMPORT')),
	CONSTRAINT "pg_total_amount_check" CHECK ("payment_groups"."total_amount" > 0),
	CONSTRAINT "pg_allocated_amount_check" CHECK ("payment_groups"."allocated_amount" >= 0)
);
--> statement-breakpoint
ALTER TABLE "financial_movements" ADD CONSTRAINT "financial_movements_payment_group_id_payment_groups_id_fk" FOREIGN KEY ("payment_group_id") REFERENCES "public"."payment_groups"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_movements" ADD CONSTRAINT "financial_movements_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_movements" ADD CONSTRAINT "financial_movements_order_item_id_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_movements" ADD CONSTRAINT "financial_movements_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_movements" ADD CONSTRAINT "financial_movements_center_id_centers_id_fk" FOREIGN KEY ("center_id") REFERENCES "public"."centers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_movements" ADD CONSTRAINT "financial_movements_category_id_financial_tree_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."financial_tree_categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_movements" ADD CONSTRAINT "financial_movements_type_id_financial_tree_types_id_fk" FOREIGN KEY ("type_id") REFERENCES "public"."financial_tree_types"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_movements" ADD CONSTRAINT "financial_movements_detail_id_financial_tree_details_id_fk" FOREIGN KEY ("detail_id") REFERENCES "public"."financial_tree_details"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_movements" ADD CONSTRAINT "financial_movements_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_tree_details" ADD CONSTRAINT "financial_tree_details_type_id_financial_tree_types_id_fk" FOREIGN KEY ("type_id") REFERENCES "public"."financial_tree_types"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_tree_types" ADD CONSTRAINT "financial_tree_types_category_id_financial_tree_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."financial_tree_categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_payment_group_id_payment_groups_id_fk" FOREIGN KEY ("payment_group_id") REFERENCES "public"."payment_groups"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_groups" ADD CONSTRAINT "payment_groups_center_id_centers_id_fk" FOREIGN KEY ("center_id") REFERENCES "public"."centers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_groups" ADD CONSTRAINT "payment_groups_counterparty_subject_id_subjects_id_fk" FOREIGN KEY ("counterparty_subject_id") REFERENCES "public"."subjects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_groups" ADD CONSTRAINT "payment_groups_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_financial_movements_order" ON "financial_movements" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "idx_financial_movements_payment_group" ON "financial_movements" USING btree ("payment_group_id");--> statement-breakpoint
CREATE INDEX "idx_financial_movements_movement_date" ON "financial_movements" USING btree ("movement_date");--> statement-breakpoint
CREATE INDEX "idx_financial_movements_direction" ON "financial_movements" USING btree ("direction");--> statement-breakpoint
CREATE INDEX "idx_payment_allocations_order" ON "payment_allocations" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "idx_payment_allocations_group" ON "payment_allocations" USING btree ("payment_group_id");--> statement-breakpoint
CREATE INDEX "idx_payment_allocations_status" ON "payment_allocations" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_payment_groups_status" ON "payment_groups" USING btree ("processing_status");--> statement-breakpoint
CREATE INDEX "idx_payment_groups_direction" ON "payment_groups" USING btree ("direction");