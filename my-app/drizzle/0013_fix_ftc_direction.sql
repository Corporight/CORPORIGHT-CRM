-- Extend financial_tree_categories.direction to allow 'BOTH'.
-- Required for the CORRECTION category (correction documents span income and expense).
-- FINANCE_DIRECTIONS (movements, payment_groups) remains unchanged at 3 values.
ALTER TABLE "financial_tree_categories" DROP CONSTRAINT "ftc_direction_check";
--> statement-breakpoint
ALTER TABLE "financial_tree_categories"
  ADD CONSTRAINT "ftc_direction_check"
  CHECK ("financial_tree_categories"."direction" IN ('INCOME', 'EXPENSE', 'INTERNAL', 'BOTH'));
