const { randomUUID } = require('node:crypto');

const migrations = [
  {
    version: 1,
    name: 'initial-schema',
    up: (database) => {
      database.exec(`
        CREATE TABLE IF NOT EXISTS companies (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL CHECK (length(trim(name)) > 0),
          cnpj TEXT,
          internal_code TEXT,
          notes TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS tasks (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL CHECK (length(trim(title)) > 0),
          description TEXT NOT NULL DEFAULT '',
          company_id TEXT REFERENCES companies(id) ON DELETE SET NULL,
          status TEXT NOT NULL DEFAULT 'BACKLOG',
          priority TEXT NOT NULL DEFAULT 'MEDIUM',
          due_at TEXT,
          estimated_minutes INTEGER CHECK (estimated_minutes IS NULL OR estimated_minutes >= 0),
          actual_minutes INTEGER NOT NULL DEFAULT 0 CHECK (actual_minutes >= 0),
          source TEXT NOT NULL DEFAULT 'MANUAL',
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          completed_at TEXT
        );

        CREATE TABLE IF NOT EXISTS task_history (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
          event_type TEXT NOT NULL,
          description TEXT NOT NULL,
          metadata_json TEXT,
          created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS settings (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_tasks_company_id ON tasks(company_id);
        CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
        CREATE INDEX IF NOT EXISTS idx_tasks_due_at ON tasks(due_at);
        CREATE INDEX IF NOT EXISTS idx_task_history_task_id ON task_history(task_id);
      `);
    }
  },
  {
    version: 2,
    name: 'time-and-integration-events',
    up: (database) => {
      database.exec(`
        CREATE TABLE IF NOT EXISTS task_time_entries (
          id TEXT PRIMARY KEY,
          task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
          started_at TEXT NOT NULL,
          ended_at TEXT,
          duration_seconds INTEGER NOT NULL DEFAULT 0 CHECK (duration_seconds >= 0)
        );

        CREATE UNIQUE INDEX IF NOT EXISTS idx_one_active_time_entry_per_task
          ON task_time_entries(task_id) WHERE ended_at IS NULL;
        CREATE INDEX IF NOT EXISTS idx_task_time_entries_task_id ON task_time_entries(task_id);

        CREATE TABLE IF NOT EXISTS integration_events (
          id TEXT PRIMARY KEY,
          provider TEXT NOT NULL,
          event_type TEXT NOT NULL,
          company_id TEXT REFERENCES companies(id) ON DELETE SET NULL,
          payload_json TEXT NOT NULL,
          received_at TEXT NOT NULL,
          processed_at TEXT
        );

        CREATE TABLE IF NOT EXISTS completion_evidence (
          id TEXT PRIMARY KEY,
          task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
          integration_event_id TEXT REFERENCES integration_events(id) ON DELETE SET NULL,
          source TEXT NOT NULL,
          event_type TEXT NOT NULL,
          confidence REAL NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
          detected_at TEXT NOT NULL,
          details_json TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_integration_events_company_id ON integration_events(company_id);
        CREATE INDEX IF NOT EXISTS idx_completion_evidence_task_id ON completion_evidence(task_id);
      `);
    }
  },
  {
    version: 3,
    name: 'task-templates',
    up: (database) => {
      database.exec(`
        CREATE TABLE IF NOT EXISTS task_templates (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL CHECK (length(trim(name)) > 0),
          description TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS template_steps (
          id TEXT PRIMARY KEY,
          template_id TEXT NOT NULL REFERENCES task_templates(id) ON DELETE CASCADE,
          title TEXT NOT NULL CHECK (length(trim(title)) > 0),
          position INTEGER NOT NULL CHECK (position >= 0),
          estimated_minutes INTEGER CHECK (estimated_minutes IS NULL OR estimated_minutes >= 0)
        );

        CREATE INDEX IF NOT EXISTS idx_template_steps_template_id ON template_steps(template_id);
      `);
    }
  },
  {
    version: 4,
    name: 'task-checklists',
    up: (database) => {
      database.exec(`
        CREATE TABLE IF NOT EXISTS task_checklists (
          id TEXT PRIMARY KEY,
          task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
          title TEXT NOT NULL CHECK (length(trim(title)) > 0),
          position INTEGER NOT NULL CHECK (position >= 0),
          completed_at TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_task_checklists_task_id ON task_checklists(task_id);
      `);
    }
  },
  {
    version: 5,
    name: 'backfill-task-checklists',
    up: (database) => {
      const tasksWithoutChecklist = database.prepare(`
        SELECT t.id, t.title
        FROM tasks t
        WHERE NOT EXISTS (SELECT 1 FROM task_checklists c WHERE c.task_id = t.id)
      `).all();
      const insertChecklist = database.prepare(
        'INSERT INTO task_checklists (id, task_id, title, position, completed_at) VALUES (?, ?, ?, 0, ?)'
      );
      for (const task of tasksWithoutChecklist) {
        insertChecklist.run(randomUUID(), task.id, 'Concluir tarefa', task.status === 'DONE' ? new Date().toISOString() : null);
      }
    }
  },
  {
    version: 6,
    name: 'completed-task-retention',
    up: () => {
      // Retention is enforced by the repository on each local read.
    }
  },
  {
    version: 7,
    name: 'esocial-proxy-authorizations',
    up: (database) => {
      database.exec(`
        CREATE TABLE IF NOT EXISTS esocial_authorizations (
          id TEXT PRIMARY KEY,
          grantor_company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
          represented_company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
          provider TEXT NOT NULL DEFAULT 'eSocial',
          status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'ACTIVE', 'EXPIRED', 'REVOKED')),
          official_reference TEXT,
          last_verified_at TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          UNIQUE (grantor_company_id, represented_company_id),
          CHECK (grantor_company_id != represented_company_id)
        );

        CREATE INDEX IF NOT EXISTS idx_esocial_auth_represented ON esocial_authorizations(represented_company_id);
        CREATE INDEX IF NOT EXISTS idx_esocial_auth_grantor ON esocial_authorizations(grantor_company_id);
      `);
    }
  },
  {
    version: 8,
    name: 'esocial-webservice-state',
    up: (database) => {
      database.exec(`
        ALTER TABLE esocial_authorizations ADD COLUMN environment TEXT NOT NULL DEFAULT 'RESTRICTED';
        ALTER TABLE esocial_authorizations ADD COLUMN last_error TEXT;

        CREATE TABLE IF NOT EXISTS esocial_requests (
          id TEXT PRIMARY KEY,
          authorization_id TEXT REFERENCES esocial_authorizations(id) ON DELETE SET NULL,
          company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
          operation TEXT NOT NULL,
          protocol TEXT,
          status TEXT NOT NULL,
          response_xml TEXT,
          error_message TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_esocial_requests_company ON esocial_requests(company_id);
        CREATE INDEX IF NOT EXISTS idx_esocial_requests_protocol ON esocial_requests(protocol);
      `);
    }
  },
  {
    version: 9,
    name: 'google-forms-admissions',
    up: (database) => {
      database.exec(`
        CREATE TABLE IF NOT EXISTS google_accounts (
          id TEXT PRIMARY KEY,
          email TEXT NOT NULL,
          client_id TEXT NOT NULL,
          client_secret TEXT NOT NULL,
          refresh_token TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS admission_forms (
          id TEXT PRIMARY KEY,
          google_account_id TEXT NOT NULL REFERENCES google_accounts(id) ON DELETE CASCADE,
          form_id TEXT NOT NULL,
          form_url TEXT NOT NULL,
          title TEXT NOT NULL,
          last_synced_at TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          UNIQUE (google_account_id, form_id)
        );

        CREATE TABLE IF NOT EXISTS admission_responses (
          id TEXT PRIMARY KEY,
          form_id TEXT NOT NULL REFERENCES admission_forms(id) ON DELETE CASCADE,
          google_response_id TEXT NOT NULL,
          submitted_at TEXT,
          answers_json TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'NEW' CHECK (status IN ('NEW', 'REVIEWING', 'PENDING', 'APPROVED', 'ARCHIVED')),
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          UNIQUE (form_id, google_response_id)
        );

        CREATE TABLE IF NOT EXISTS admission_files (
          id TEXT PRIMARY KEY,
          response_id TEXT NOT NULL REFERENCES admission_responses(id) ON DELETE CASCADE,
          file_id TEXT NOT NULL,
          file_name TEXT NOT NULL,
          mime_type TEXT NOT NULL DEFAULT 'application/octet-stream',
          created_at TEXT NOT NULL,
          UNIQUE (response_id, file_id)
        );

        CREATE INDEX IF NOT EXISTS idx_admission_responses_form ON admission_responses(form_id);
        CREATE INDEX IF NOT EXISTS idx_admission_files_response ON admission_files(response_id);
      `);
    }
  },
  {
    version: 10,
    name: 'google-account-profile',
    up: (database) => {
      database.exec(`
        ALTER TABLE google_accounts ADD COLUMN display_name TEXT;
        ALTER TABLE google_accounts ADD COLUMN picture_url TEXT;
      `);
    }
  },
  {
    version: 11,
    name: 'collaboration-authorship',
    up: (database) => {
      database.exec(`
        ALTER TABLE tasks ADD COLUMN created_by_id TEXT;
        ALTER TABLE tasks ADD COLUMN created_by_name TEXT;
        ALTER TABLE tasks ADD COLUMN completed_by_id TEXT;
        ALTER TABLE tasks ADD COLUMN completed_by_name TEXT;
        ALTER TABLE companies ADD COLUMN created_by_id TEXT;
        ALTER TABLE companies ADD COLUMN created_by_name TEXT;
        ALTER TABLE companies ADD COLUMN updated_by_id TEXT;
        ALTER TABLE companies ADD COLUMN updated_by_name TEXT;
      `);
    }
  },
  {
    version: 12,
    name: 'employee-management',
    up: (database) => {
      database.exec(`
        CREATE TABLE IF NOT EXISTS employees (
          id TEXT PRIMARY KEY,
          company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
          name TEXT NOT NULL CHECK (length(trim(name)) > 0),
          cpf TEXT NOT NULL DEFAULT '',
          role TEXT NOT NULL DEFAULT '',
          admission_date TEXT NOT NULL,
          employment_status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (employment_status IN ('ACTIVE', 'INACTIVE')),
          vacation_start_date TEXT,
          vacation_end_date TEXT,
          notes TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_employees_company_id ON employees(company_id);
        CREATE INDEX IF NOT EXISTS idx_employees_admission_date ON employees(admission_date);
        CREATE INDEX IF NOT EXISTS idx_employees_status ON employees(employment_status);
      `);
    }
  },
  {
    version: 13,
    name: 'employee-company-association',
    up: (database) => {
      database.exec(`
        ALTER TABLE employees ADD COLUMN employment_company_id TEXT REFERENCES companies(id) ON DELETE SET NULL;
        ALTER TABLE employees ADD COLUMN employment_company_name TEXT;
        UPDATE employees SET employment_company_id = company_id WHERE employment_company_id IS NULL AND employment_company_name IS NULL;
        CREATE INDEX IF NOT EXISTS idx_employees_employment_company ON employees(employment_company_id);
      `);
    }
  },
  {
    version: 14,
    name: 'employee-vacation-periods',
    up: (database) => {
      database.exec(`
        CREATE TABLE IF NOT EXISTS vacation_periods (
          id TEXT PRIMARY KEY,
          employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
          acquisition_start TEXT NOT NULL,
          acquisition_end TEXT NOT NULL,
          concession_end TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'AVAILABLE', 'SCHEDULED', 'TAKEN', 'OVERDUE')),
          leave_start TEXT,
          leave_end TEXT,
          leave_days INTEGER CHECK (leave_days IS NULL OR leave_days >= 0),
          notes TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          UNIQUE (employee_id, acquisition_start)
        );
        CREATE INDEX IF NOT EXISTS idx_vacation_periods_employee ON vacation_periods(employee_id);
        CREATE INDEX IF NOT EXISTS idx_vacation_periods_status ON vacation_periods(status);
      `);
    }
  },
  {
    version: 15,
    name: 'employee-experience-status',
    up: (database) => {
      database.exec('ALTER TABLE employees ADD COLUMN experience_status TEXT');
    }
  },
  {
    version: 16,
    name: 'employee-responsible-contact',
    up: (database) => {
      database.exec('ALTER TABLE employees ADD COLUMN responsible_phone TEXT NOT NULL DEFAULT \'\'; ALTER TABLE employees ADD COLUMN responsible_email TEXT NOT NULL DEFAULT \'\';');
    }
  },
  {
    version: 17,
    name: 'employee-salary-base',
    up: (database) => {
      database.exec('ALTER TABLE employees ADD COLUMN salary_base REAL NOT NULL DEFAULT 0');
    }
  },
  {
    version: 18,
    name: 'employee-compliance-documents',
    up: (database) => {
      database.exec(`
        CREATE TABLE IF NOT EXISTS employee_documents (
          id TEXT PRIMARY KEY,
          employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
          document_type TEXT NOT NULL CHECK (document_type IN ('EPI', 'ASO', 'NR12', 'NR18', 'NR35', 'OS', 'APR')),
          issued_date TEXT,
          expires_at TEXT,
          source TEXT NOT NULL DEFAULT 'MANUAL',
          notes TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          UNIQUE (employee_id, document_type)
        );
        CREATE INDEX IF NOT EXISTS idx_employee_documents_employee ON employee_documents(employee_id);
        CREATE INDEX IF NOT EXISTS idx_employee_documents_expiry ON employee_documents(expires_at);
      `);
    }
  },
  {
    version: 19,
    name: 'employee-document-validity',
    up: (database) => {
      database.exec('ALTER TABLE employee_documents ADD COLUMN validity_months INTEGER');
    }
  }
];

function runMigrations(database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    );
  `);

  const appliedVersions = new Set(
    database.prepare('SELECT version FROM schema_migrations ORDER BY version').all().map((row) => row.version)
  );

  database.exec('BEGIN');

  try {
    for (const migration of migrations) {
      if (appliedVersions.has(migration.version)) {
        continue;
      }

      migration.up(database);
      database.prepare(
        'INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)'
      ).run(migration.version, migration.name, new Date().toISOString());
    }

    database.exec('COMMIT');
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  }

  return migrations.length;
}

module.exports = { runMigrations };
