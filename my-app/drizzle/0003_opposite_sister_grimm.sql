CREATE TABLE "aml_checks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subject_id" uuid NOT NULL,
	"check_type" text NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"result_payload" jsonb,
	"checked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	CONSTRAINT "aml_checks_type_check" CHECK ("aml_checks"."check_type" IN ('DOCUMENT', 'SANCTIONS', 'PEP', 'MANUAL')),
	CONSTRAINT "aml_checks_status_check" CHECK ("aml_checks"."status" IN ('PENDING', 'PASSED', 'FAILED'))
);
--> statement-breakpoint
CREATE TABLE "aml_records" (
	"subject_id" uuid PRIMARY KEY NOT NULL,
	"kyc_status" text DEFAULT 'NOT_STARTED' NOT NULL,
	"risk_level" text,
	"verified_at" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	CONSTRAINT "aml_records_kyc_status_check" CHECK ("aml_records"."kyc_status" IN ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'REJECTED')),
	CONSTRAINT "aml_records_risk_level_check" CHECK ("aml_records"."risk_level" IS NULL OR "aml_records"."risk_level" IN ('LOW', 'MEDIUM', 'HIGH'))
);
--> statement-breakpoint
ALTER TABLE "aml_checks" ADD CONSTRAINT "aml_checks_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "aml_checks" ADD CONSTRAINT "aml_checks_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "aml_records" ADD CONSTRAINT "aml_records_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "aml_records" ADD CONSTRAINT "aml_records_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_aml_checks_subject" ON "aml_checks" USING btree ("subject_id");--> statement-breakpoint
CREATE INDEX "idx_aml_checks_type" ON "aml_checks" USING btree ("check_type");