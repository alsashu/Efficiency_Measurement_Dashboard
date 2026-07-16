-- TC Efficiency Measurement Dashboard Database Schema

-- Roles
CREATE TABLE IF NOT EXISTS roles (
  id SERIAL PRIMARY KEY,
  name VARCHAR(50) UNIQUE NOT NULL,
  description TEXT,
  permissions JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Users
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(100) UNIQUE NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role_id INTEGER REFERENCES roles(id) ON DELETE SET NULL,
  first_name VARCHAR(100),
  last_name VARCHAR(100),
  is_active BOOLEAN DEFAULT TRUE,
  last_login TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Upload Years
CREATE TABLE IF NOT EXISTS upload_years (
  id SERIAL PRIMARY KEY,
  year INTEGER UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Uploaded Files
CREATE TABLE IF NOT EXISTS uploaded_files (
  id SERIAL PRIMARY KEY,
  year_id INTEGER REFERENCES upload_years(id) ON DELETE CASCADE,
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
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Programs (main data table matching Excel columns exactly)
CREATE TABLE IF NOT EXISTS programs (
  id SERIAL PRIMARY KEY,
  upload_id INTEGER REFERENCES uploaded_files(id) ON DELETE CASCADE,
  dept VARCHAR(100),
  program_name VARCHAR(255),
  pm_responsible VARCHAR(255),
  program_code VARCHAR(100),
  baseline VARCHAR(100),
  baseline_start DATE,
  baseline_end DATE,
  funding_source VARCHAR(255),
  funding_source_ref TEXT,
  approved_budget_ke DECIMAL(15,4),
  actual_budget_ke DECIMAL(15,4),
  estimated_hrs DECIMAL(15,4),
  actual_hrs DECIMAL(15,4),
  effort_variance DECIMAL(15,4),
  productivity_index DECIMAL(10,4),
  total_effort_saved DECIMAL(15,4),
  total_cost_saved DECIMAL(15,4),
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
  material_cost_reduction DECIMAL(15,4),
  other_cost_savings DECIMAL(15,4),
  opportunities_outcomes TEXT,
  remarks TEXT,
  fy_ending DATE,
  efficiency_pct DECIMAL(10,4),
  row_number INTEGER,
  is_manual BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Audit Logs
CREATE TABLE IF NOT EXISTS audit_logs (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(100),
  entity_id INTEGER,
  details JSONB,
  ip_address VARCHAR(50),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Notifications
CREATE TABLE IF NOT EXISTS notifications (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  message TEXT,
  type VARCHAR(50) DEFAULT 'info',
  is_read BOOLEAN DEFAULT FALSE,
  link VARCHAR(500),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Sync Queue (unused — retained for backward compatibility, no longer written to)
CREATE TABLE IF NOT EXISTS sync_queue (
  id SERIAL PRIMARY KEY,
  client_id VARCHAR(100),
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  operation VARCHAR(50) NOT NULL,
  entity_type VARCHAR(100) NOT NULL,
  entity_id INTEGER,
  payload JSONB,
  status VARCHAR(50) DEFAULT 'pending',
  attempts INTEGER DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  processed_at TIMESTAMPTZ
);

-- KPI Thresholds / Alerts
CREATE TABLE IF NOT EXISTS kpi_thresholds (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  metric_key VARCHAR(100) NOT NULL,
  operator VARCHAR(20) NOT NULL,
  threshold_value DECIMAL(15,4) NOT NULL,
  alert_type VARCHAR(50) DEFAULT 'warning',
  is_active BOOLEAN DEFAULT TRUE,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Scheduled Reports
CREATE TABLE IF NOT EXISTS scheduled_reports (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  report_type VARCHAR(100),
  schedule_cron VARCHAR(100),
  format VARCHAR(50) DEFAULT 'pdf',
  recipients TEXT[],
  filters JSONB,
  is_active BOOLEAN DEFAULT TRUE,
  last_run TIMESTAMPTZ,
  next_run TIMESTAMPTZ,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Dashboard Layouts
CREATE TABLE IF NOT EXISTS dashboard_layouts (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  layout JSONB NOT NULL,
  is_default BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- System Settings
CREATE TABLE IF NOT EXISTS system_settings (
  id SERIAL PRIMARY KEY,
  key VARCHAR(100) UNIQUE NOT NULL,
  value JSONB,
  description TEXT,
  updated_by INTEGER REFERENCES users(id),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_programs_upload_id ON programs(upload_id);
CREATE INDEX IF NOT EXISTS idx_programs_dept ON programs(dept);
CREATE INDEX IF NOT EXISTS idx_programs_program_name ON programs(program_name);
CREATE INDEX IF NOT EXISTS idx_programs_fy_ending ON programs(fy_ending);
CREATE INDEX IF NOT EXISTS idx_programs_baseline_start ON programs(baseline_start);
CREATE INDEX IF NOT EXISTS idx_uploaded_files_year_id ON uploaded_files(year_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_sync_queue_status ON sync_queue(status);
