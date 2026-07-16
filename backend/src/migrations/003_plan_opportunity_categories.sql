-- Plan Module — Opportunity Category Breakdown
-- Adds the 10 opportunity-category columns (Hours) that break down
-- "Total Effort Saved from Opportunities" by source, mirroring the
-- legacy `programs` table's category columns (001_initial.sql).

ALTER TABLE plan_programs ADD COLUMN IF NOT EXISTS reuse_library DECIMAL(15,4);
ALTER TABLE plan_programs ADD COLUMN IF NOT EXISTS tech_competency DECIMAL(15,4);
ALTER TABLE plan_programs ADD COLUMN IF NOT EXISTS ai_copilot DECIMAL(15,4);
ALTER TABLE plan_programs ADD COLUMN IF NOT EXISTS automation_testing DECIMAL(15,4);
ALTER TABLE plan_programs ADD COLUMN IF NOT EXISTS automation_reviews DECIMAL(15,4);
ALTER TABLE plan_programs ADD COLUMN IF NOT EXISTS automation_cicd DECIMAL(15,4);
ALTER TABLE plan_programs ADD COLUMN IF NOT EXISTS automation_others DECIMAL(15,4);
ALTER TABLE plan_programs ADD COLUMN IF NOT EXISTS simulators_tools DECIMAL(15,4);
ALTER TABLE plan_programs ADD COLUMN IF NOT EXISTS sdlc_improvement DECIMAL(15,4);
ALTER TABLE plan_programs ADD COLUMN IF NOT EXISTS inefficiency_reduction DECIMAL(15,4);
