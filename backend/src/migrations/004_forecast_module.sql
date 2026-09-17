-- Forecast Module — parses the "Forecasting" sheet from the same workbook
-- that feeds plan_programs (Efficiency_Plan sheet). Independent of, and
-- additive to, the existing Plan module — no existing tables/columns are
-- modified beyond the two new nullable columns on plan_uploaded_files below.

CREATE TABLE IF NOT EXISTS forecast_programs (
  id SERIAL PRIMARY KEY,
  upload_id INTEGER REFERENCES plan_uploaded_files(id) ON DELETE CASCADE,
  dept VARCHAR(100),
  program_name VARCHAR(255),
  pm_responsible VARCHAR(255),
  baseline VARCHAR(100),
  baseline_start DATE,
  baseline_end DATE,
  estimated_hrs DECIMAL(15,4),
  savings_hrs DECIMAL(15,4),
  savings_euros DECIMAL(15,4),
  reuse_library DECIMAL(15,4),
  tech_competency DECIMAL(15,4),
  ai_copilot DECIMAL(15,4),
  automation_testing DECIMAL(15,4),
  automation_reviews DECIMAL(15,4),
  automation_cicd DECIMAL(15,4),
  automation_others DECIMAL(15,4),
  simulators_tools DECIMAL(15,4),
  sdlc_improvement DECIMAL(15,4),
  inefficiency_reduction DECIMAL(15,4),
  row_number INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_forecast_programs_upload_id ON forecast_programs(upload_id);
CREATE INDEX IF NOT EXISTS idx_forecast_programs_dept ON forecast_programs(dept);
CREATE INDEX IF NOT EXISTS idx_forecast_programs_program_name ON forecast_programs(program_name);
CREATE INDEX IF NOT EXISTS idx_forecast_programs_baseline_start ON forecast_programs(baseline_start);
CREATE INDEX IF NOT EXISTS idx_forecast_programs_baseline_end ON forecast_programs(baseline_end);

ALTER TABLE plan_uploaded_files ADD COLUMN IF NOT EXISTS forecast_record_count INTEGER DEFAULT 0;
ALTER TABLE plan_uploaded_files ADD COLUMN IF NOT EXISTS forecast_validation_report JSONB;
