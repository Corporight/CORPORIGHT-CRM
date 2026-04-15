CREATE TABLE "relation_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"relation_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"triggered_by_order_id" uuid,
	"snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	CONSTRAINT "relation_events_type_check" CHECK ("relation_events"."event_type" IN ('CREATED', 'TERMINATED'))
);
--> statement-breakpoint
ALTER TABLE "relation_events" ADD CONSTRAINT "relation_events_relation_id_relations_id_fk" FOREIGN KEY ("relation_id") REFERENCES "public"."relations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relation_events" ADD CONSTRAINT "relation_events_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_relation_events_relation" ON "relation_events" USING btree ("relation_id");--> statement-breakpoint
ALTER TABLE "order_change_actions" ADD CONSTRAINT "order_change_actions_resulting_relation_id_relations_id_fk" FOREIGN KEY ("resulting_relation_id") REFERENCES "public"."relations"("id") ON DELETE set null ON UPDATE no action;