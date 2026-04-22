DROP TABLE "relation_attributes";--> statement-breakpoint
ALTER TABLE "relation_events" DROP CONSTRAINT "relation_events_type_check";--> statement-breakpoint
ALTER TABLE "relations" ADD COLUMN "share_percentage" numeric(5, 2);--> statement-breakpoint
ALTER TABLE "relations" ADD COLUMN "note_internal" text;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_active_relation" ON "relations" USING btree ("subject_a_id","subject_b_id","relation_type") WHERE "relations"."is_active" = true;--> statement-breakpoint
ALTER TABLE "relation_events" ADD CONSTRAINT "relation_events_type_check" CHECK ("relation_events"."event_type" IN ('CREATED', 'TERMINATED', 'UPDATED', 'REACTIVATED'));--> statement-breakpoint
ALTER TABLE "relations" ADD CONSTRAINT "relations_share_percentage_range" CHECK ("relations"."share_percentage" IS NULL OR ("relations"."share_percentage" >= 0 AND "relations"."share_percentage" <= 100));