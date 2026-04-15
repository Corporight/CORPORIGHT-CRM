CREATE TABLE "companies_for_sale" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subject_id" uuid NOT NULL,
	"status" text DEFAULT 'FOR_SALE' NOT NULL,
	"source_type" text NOT NULL,
	"base_price" numeric(12, 2) NOT NULL,
	"current_price" numeric(12, 2) NOT NULL,
	"reserved_by_order_id" uuid,
	"reserved_at" timestamp with time zone,
	"sold_at" timestamp with time zone,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	CONSTRAINT "companies_for_sale_status_check" CHECK ("companies_for_sale"."status" IN ('FOR_SALE', 'RESERVED', 'SOLD', 'WITHDRAWN')),
	CONSTRAINT "companies_for_sale_source_type_check" CHECK ("companies_for_sale"."source_type" IN ('INTERNAL', 'EXTERNAL'))
);
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "company_for_sale_id" uuid;--> statement-breakpoint
ALTER TABLE "companies_for_sale" ADD CONSTRAINT "companies_for_sale_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "companies_for_sale" ADD CONSTRAINT "companies_for_sale_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_companies_for_sale_subject_active" ON "companies_for_sale" USING btree ("subject_id") WHERE status NOT IN ('SOLD', 'WITHDRAWN');--> statement-breakpoint
CREATE INDEX "idx_companies_for_sale_status" ON "companies_for_sale" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_companies_for_sale_subject" ON "companies_for_sale" USING btree ("subject_id");--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_company_for_sale_id_companies_for_sale_id_fk" FOREIGN KEY ("company_for_sale_id") REFERENCES "public"."companies_for_sale"("id") ON DELETE set null ON UPDATE no action;