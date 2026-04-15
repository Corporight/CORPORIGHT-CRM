CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"action" text NOT NULL,
	"diff" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" text DEFAULT 'agent' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "subject_addresses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subject_id" uuid NOT NULL,
	"address_type" text NOT NULL,
	"street" text NOT NULL,
	"city" text NOT NULL,
	"postal" text NOT NULL,
	"country" text DEFAULT 'CZ' NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	CONSTRAINT "subject_addresses_type_check" CHECK ("subject_addresses"."address_type" IN ('REGISTERED', 'MAILING', 'BILLING', 'OPERATIONAL'))
);
--> statement-breakpoint
CREATE TABLE "subject_company_profiles" (
	"subject_id" uuid PRIMARY KEY NOT NULL,
	"company_name" text NOT NULL,
	"registration_number" text NOT NULL,
	"vat_number" text,
	"legal_form" text,
	"registration_date" date,
	"registration_court" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	CONSTRAINT "subject_company_profiles_registration_number_unique" UNIQUE("registration_number")
);
--> statement-breakpoint
CREATE TABLE "subject_person_profiles" (
	"subject_id" uuid PRIMARY KEY NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"birth_date" date,
	"birth_number" text,
	"nationality" text,
	"id_doc_type" text,
	"id_doc_number" text,
	"id_doc_expiry" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid
);
--> statement-breakpoint
CREATE TABLE "subject_roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subject_id" uuid NOT NULL,
	"role" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"assigned_by" uuid,
	CONSTRAINT "subject_roles_role_check" CHECK ("subject_roles"."role" IN ('CLIENT', 'SUPPLIER'))
);
--> statement-breakpoint
CREATE TABLE "subjects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" text NOT NULL,
	"display_name" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"email" text,
	"phone" text,
	"tags" text[],
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	CONSTRAINT "subjects_type_check" CHECK ("subjects"."type" IN ('PERSON', 'COMPANY'))
);
--> statement-breakpoint
CREATE TABLE "future_subjects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"intended_type" text NOT NULL,
	"intended_name" text,
	"legal_form" text,
	"notes" text,
	"resolved_subject_id" uuid,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	CONSTRAINT "future_subjects_type_check" CHECK ("future_subjects"."intended_type" IN ('PERSON', 'COMPANY'))
);
--> statement-breakpoint
CREATE TABLE "order_change_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"action_type" text NOT NULL,
	"target_subject_id" uuid,
	"old_value" jsonb,
	"new_value" jsonb,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"applied_at" timestamp with time zone,
	"resulting_relation_id" uuid,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	CONSTRAINT "order_change_actions_type_check" CHECK ("order_change_actions"."action_type" IN ('DIRECTOR_APPOINTMENT', 'DIRECTOR_REMOVAL', 'SHARE_TRANSFER', 'ADDRESS_CHANGE', 'NAME_CHANGE', 'STATUTORY_REP_CHANGE', 'CAPITAL_CHANGE', 'OTHER')),
	CONSTRAINT "order_change_actions_status_check" CHECK ("order_change_actions"."status" IN ('PENDING', 'APPLIED', 'CANCELLED'))
);
--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"item_type" text NOT NULL,
	"description" text NOT NULL,
	"quantity" numeric(10, 2) DEFAULT '1' NOT NULL,
	"unit_price" numeric(12, 2) NOT NULL,
	"total_price" numeric(12, 2) NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid
);
--> statement-breakpoint
CREATE TABLE "order_participants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"subject_id" uuid,
	"future_subject_id" uuid,
	"role_code" text NOT NULL,
	"share_percentage" numeric(5, 2),
	"participant_context_type" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	CONSTRAINT "order_participants_subject_xor" CHECK (("order_participants"."subject_id" IS NOT NULL AND "order_participants"."future_subject_id" IS NULL)
        OR ("order_participants"."subject_id" IS NULL AND "order_participants"."future_subject_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" text NOT NULL,
	"order_type" text NOT NULL,
	"status" text DEFAULT 'CONCEPT' NOT NULL,
	"client_subject_id" uuid,
	"snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"confirmed_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"assigned_to" uuid,
	"due_date" date,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	CONSTRAINT "orders_number_unique" UNIQUE("number"),
	CONSTRAINT "orders_type_check" CHECK ("orders"."order_type" IN ('COMPANY_FORMATION', 'COMPANY_CHANGE', 'SHELF_PURCHASE', 'VAT_REGISTRATION', 'REGISTERED_OFFICE', 'ACCOUNTING', 'OTHER')),
	CONSTRAINT "orders_status_check" CHECK ("orders"."status" IN ('CONCEPT', 'WAITING_FOR_PAYMENT', 'DOCUMENT_PREPARATION', 'WAITING_FOR_DOCUMENTS', 'EXECUTION', 'COMPLETED', 'CANCELLED'))
);
--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subject_addresses" ADD CONSTRAINT "subject_addresses_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subject_addresses" ADD CONSTRAINT "subject_addresses_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subject_company_profiles" ADD CONSTRAINT "subject_company_profiles_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subject_company_profiles" ADD CONSTRAINT "subject_company_profiles_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subject_person_profiles" ADD CONSTRAINT "subject_person_profiles_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subject_person_profiles" ADD CONSTRAINT "subject_person_profiles_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subject_roles" ADD CONSTRAINT "subject_roles_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subject_roles" ADD CONSTRAINT "subject_roles_assigned_by_users_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subjects" ADD CONSTRAINT "subjects_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "future_subjects" ADD CONSTRAINT "future_subjects_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "future_subjects" ADD CONSTRAINT "future_subjects_resolved_subject_id_subjects_id_fk" FOREIGN KEY ("resolved_subject_id") REFERENCES "public"."subjects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "future_subjects" ADD CONSTRAINT "future_subjects_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_change_actions" ADD CONSTRAINT "order_change_actions_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_change_actions" ADD CONSTRAINT "order_change_actions_target_subject_id_subjects_id_fk" FOREIGN KEY ("target_subject_id") REFERENCES "public"."subjects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_change_actions" ADD CONSTRAINT "order_change_actions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_participants" ADD CONSTRAINT "order_participants_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_participants" ADD CONSTRAINT "order_participants_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_participants" ADD CONSTRAINT "order_participants_future_subject_id_future_subjects_id_fk" FOREIGN KEY ("future_subject_id") REFERENCES "public"."future_subjects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_participants" ADD CONSTRAINT "order_participants_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_client_subject_id_subjects_id_fk" FOREIGN KEY ("client_subject_id") REFERENCES "public"."subjects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_subject_address_primary" ON "subject_addresses" USING btree ("subject_id","address_type") WHERE "subject_addresses"."is_primary" = true;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_subject_role" ON "subject_roles" USING btree ("subject_id","role");--> statement-breakpoint
CREATE INDEX "idx_order_change_actions_order" ON "order_change_actions" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "idx_order_participants_order" ON "order_participants" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "idx_order_participants_subject" ON "order_participants" USING btree ("subject_id");--> statement-breakpoint
CREATE INDEX "idx_orders_status" ON "orders" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_orders_client" ON "orders" USING btree ("client_subject_id");