-- Plan Module Database Schema
-- New dashboard using the simplified 14-column Plan Data Excel format

-- Plan Upload Years
CREATE TABLE IF NOT EXISTS plan_upload_years (
  id SERIAL PRIMARY KEY,
  year INTEGER UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Plan Uploaded Files
CREATE TABLE IF NOT EXISTS plan_uploaded_files (
  id SERIAL PRIMARY KEY,
  year_id INTEGER REFERENCES plan_upload_years(id) ON DELETE CASCADE,
  file_name VARCHAR(255) NOT NULL,
  original_name VARCHAR(255) NOT NULL,
  file_path VARCHAR(500),
  file_size BIGINT,
  upload_version INTEGER NOT NULL DEFAULT 1,
  dataset_name VARCHAR(255),
  uploaded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  record_count INTEGER DEFAULT 0,
  status VARCHAR(50) DEFAULT 'completed',
  notes TEXT,
  validation_report JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Plan Programs (strict 14-column schema — no derived fields, raw Excel values only)
CREATE TABLE IF NOT EXISTS plan_programs (
  id SERIAL PRIMARY KEY,
  upload_id INTEGER REFERENCES plan_uploaded_files(id) ON DELETE CASCADE,
  dept VARCHAR(100),
  program_name VARCHAR(255),
  pm_responsible VARCHAR(255),
  program_code VARCHAR(100),
  baseline VARCHAR(100),
  baseline_start DATE,
  baseline_end DATE,
  estimated_hrs DECIMAL(15,4),
  actual_hrs DECIMAL(15,4),
  effort_variance DECIMAL(15,4),
  productivity_index DECIMAL(10,4),
  total_effort_saved_hrs DECIMAL(15,4),
  total_effort_saved_euros DECIMAL(15,4),
  total_cost_saved_euros DECIMAL(15,4),
  row_number INTEGER,
  is_manual BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_plan_programs_upload_id ON plan_programs(upload_id);
CREATE INDEX IF NOT EXISTS idx_plan_programs_dept ON plan_programs(dept);
CREATE INDEX IF NOT EXISTS idx_plan_programs_baseline_start ON plan_programs(baseline_start);
CREATE INDEX IF NOT EXISTS idx_plan_programs_baseline_end ON plan_programs(baseline_end);
CREATE INDEX IF NOT EXISTS idx_plan_uploaded_files_year_id ON plan_uploaded_files(year_id);
