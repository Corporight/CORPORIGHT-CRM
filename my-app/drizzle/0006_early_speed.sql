CREATE TABLE "subject_settings" (
	"subject_id" uuid PRIMARY KEY NOT NULL,
	"notifications_email_enabled" boolean DEFAULT true NOT NULL,
	"notifications_sms_enabled" boolean DEFAULT true NOT NULL,
	"preferred_language" text DEFAULT 'cs' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "subject_company_profiles" ADD COLUMN "vat_payer" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "subject_person_profiles" ADD COLUMN "title_before" text;--> statement-breakpoint
ALTER TABLE "subject_person_profiles" ADD COLUMN "title_after" text;--> statement-breakpoint
ALTER TABLE "subject_settings" ADD CONSTRAINT "subject_settings_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE cascade ON UPDATE no action;