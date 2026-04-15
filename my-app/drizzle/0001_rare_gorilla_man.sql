CREATE TABLE "relation_attributes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"relation_id" uuid NOT NULL,
	"key" text NOT NULL,
	"value" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "relations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subject_a_id" uuid NOT NULL,
	"subject_b_id" uuid NOT NULL,
	"relation_type" text NOT NULL,
	"valid_from" timestamp with time zone,
	"valid_to" timestamp with time zone,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	CONSTRAINT "relations_no_self_link" CHECK ("relations"."subject_a_id" != "relations"."subject_b_id"),
	CONSTRAINT "relations_type_check" CHECK ("relations"."relation_type" IN ('SHAREHOLDER', 'DIRECTOR', 'PROCURIST', 'BENEFICIAL_OWNER', 'REPRESENTATIVE'))
);
--> statement-breakpoint
ALTER TABLE "relation_attributes" ADD CONSTRAINT "relation_attributes_relation_id_relations_id_fk" FOREIGN KEY ("relation_id") REFERENCES "public"."relations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relations" ADD CONSTRAINT "relations_subject_a_id_subjects_id_fk" FOREIGN KEY ("subject_a_id") REFERENCES "public"."subjects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relations" ADD CONSTRAINT "relations_subject_b_id_subjects_id_fk" FOREIGN KEY ("subject_b_id") REFERENCES "public"."subjects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relations" ADD CONSTRAINT "relations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_relation_attribute_key" ON "relation_attributes" USING btree ("relation_id","key");--> statement-breakpoint
CREATE INDEX "idx_relations_subject_a" ON "relations" USING btree ("subject_a_id");--> statement-breakpoint
CREATE INDEX "idx_relations_subject_b" ON "relations" USING btree ("subject_b_id");