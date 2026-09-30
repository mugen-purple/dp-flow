const { randomUUID } = require('node:crypto');

function createEmployeeRepository(database) {
  const documentRules = {
    EPI: { label: 'Ficha de EPI', months: 6 },
    ASO: { label: 'ASO', months: 12 },
    NR12: { label: 'NR12', months: 12 },
    NR18: { label: 'NR18', months: 12 },
    NR35: { label: 'NR35', months: 12 },
    OS: { label: 'Ordem de Serviço', months: 12 },
    APR: { label: 'APR', months: 12 }
  };

  function documentExpiry(issuedDate, months) {
    if (!issuedDate) return '';
    const date = new Date(`${issuedDate}T12:00:00`);
    const originalDay = date.getDate();
    date.setDate(1);
    date.setMonth(date.getMonth() + months);
    const lastDayOfTargetMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
    date.setDate(Math.min(originalDay, lastDayOfTargetMonth));
    return date.toISOString().slice(0, 10);
  }

  function documentStatus(expiresAt) {
    if (!expiresAt) return 'MISSING_DATE';
    const today = new Date().toISOString().slice(0, 10);
    if (expiresAt < today) return 'OVERDUE';
    const warningDate = new Date();
    warningDate.setDate(warningDate.getDate() + 7);
    return expiresAt <= warningDate.toISOString().slice(0, 10) ? 'EXPIRING_SOON' : 'VALID';
  }

  function listDocuments(employeeId) {
    return database.prepare(`SELECT id, employee_id AS employeeId, document_type AS documentType, issued_date AS issuedDate, expires_at AS expiresAt, validity_months AS validityMonths, source, notes, created_at AS createdAt, updated_at AS updatedAt FROM employee_documents WHERE employee_id = ? ORDER BY document_type`).all(employeeId).map((document) => {
      const validityMonths = Number(document.validityMonths) || documentRules[document.documentType]?.months || 12;
      const expiresAt = documentExpiry(document.issuedDate, validityMonths);
      return { ...document, expiresAt, label: documentRules[document.documentType]?.label || document.documentType, validityMonths, status: documentStatus(expiresAt) };
    });
  }

  function saveDocument(employeeId, { type, issuedDate = '', validityMonths, notes = '', source = 'MANUAL' }) {
    const rule = documentRules[type];
    if (!rule) throw new Error('Tipo de documento inválido.');
    const normalizedValidity = Number(validityMonths) || rule.months;
    if (normalizedValidity < 1 || normalizedValidity > 120) throw new Error('A validade deve estar entre 1 e 120 meses.');
    const now = new Date().toISOString();
    const existing = database.prepare('SELECT id FROM employee_documents WHERE employee_id = ? AND document_type = ?').get(employeeId, type);
    if (existing) {
      database.prepare('UPDATE employee_documents SET issued_date = ?, expires_at = ?, validity_months = ?, source = ?, notes = ?, updated_at = ? WHERE id = ?').run(issuedDate || null, documentExpiry(issuedDate, normalizedValidity) || null, normalizedValidity, source, notes.trim(), now, existing.id);
      return existing.id;
    }
    const id = randomUUID();
    database.prepare('INSERT INTO employee_documents (id, employee_id, document_type, issued_date, expires_at, validity_months, source, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(id, employeeId, type, issuedDate || null, documentExpiry(issuedDate, normalizedValidity) || null, normalizedValidity, source, notes.trim(), now, now);
    return id;
  }
  function addDays(value, days) {
    const date = new Date(`${value}T12:00:00`);
    date.setDate(date.getDate() + days);
    return date.toISOString().slice(0, 10);
  }

  function addMonths(value, months) {
    const date = new Date(`${value}T12:00:00`);
    date.setMonth(date.getMonth() + months);
    return date.toISOString().slice(0, 10);
  }

  function dayDifference(value) {
    const today = new Date();
    const date = new Date(`${value}T12:00:00`);
    return Math.ceil((date - new Date(today.getFullYear(), today.getMonth(), today.getDate())) / 86400000);
  }

  function experienceNeedsReview(status) {
    return status === 'FIRST_PERIOD_CONCLUDED';
  }

  function currentAcquisitionStart(value) {
    const today = new Date();
    let start = value;
    while (addMonths(start, 12) <= today.toISOString().slice(0, 10)) start = addMonths(start, 12);
    return start;
  }

  function persistedVacationStatus(employeeId) {
    const today = new Date().toISOString().slice(0, 10);
    const periods = database.prepare(`
      SELECT acquisition_start AS acquisitionStart, acquisition_end AS acquisitionEnd,
        concession_end AS concessionEnd, status
      FROM vacation_periods
      WHERE employee_id = ?
      ORDER BY acquisition_start
    `).all(employeeId).map((period) => ({
      ...period,
      status: period.status === 'PENDING' && period.concessionEnd < today
        ? 'OVERDUE'
        : period.status === 'PENDING' && period.acquisitionEnd < today ? 'AVAILABLE' : period.status
    }));
    if (!periods.length) return null;

    const activePeriod = periods.find((period) => !['TAKEN', 'PENDING'].includes(period.status))
      || periods.find((period) => period.status === 'PENDING')
      || periods[periods.length - 1];
    if (activePeriod.status === 'AVAILABLE') {
      const daysUntilConcession = dayDifference(activePeriod.concessionEnd);
      return daysUntilConcession >= 0 && daysUntilConcession <= 60 ? 'VACATION_WARNING' : 'AVAILABLE';
    }
    return activePeriod.status;
  }

  function enrich(employee) {
    const experienceFirstEnd = addDays(employee.admissionDate, 44);
    const experienceFinalEnd = addDays(employee.admissionDate, 89);
    const acquisitionStart = currentAcquisitionStart(employee.admissionDate);
    const acquisitionEnd = addDays(addMonths(acquisitionStart, 12), -1);
    const concessionEnd = addDays(addMonths(acquisitionStart, 24), -1);
    const firstConcessionEnd = addDays(addMonths(employee.admissionDate, 24), -1);
    const firstExperienceDays = dayDifference(experienceFirstEnd);
    const finalExperienceDays = dayDifference(experienceFinalEnd);
    const vacationAcquisitionDays = dayDifference(acquisitionEnd);
    const vacationConcessionDays = dayDifference(concessionEnd);
    const persistedStatus = persistedVacationStatus(employee.id);
    return {
      ...employee,
      experienceFirstEnd,
      experienceFinalEnd,
      acquisitionStart,
      acquisitionEnd,
      concessionEnd,
      experienceStatus: employee.persistedExperienceStatus || (finalExperienceDays < 0 ? 'SECOND_PERIOD_CONCLUDED' : firstExperienceDays < 0 ? 'SECOND_PERIOD_IN_PROGRESS' : 'IN_PROGRESS'),
      vacationStatus: persistedStatus || (dayDifference(firstConcessionEnd) < 0 ? 'OVERDUE' : vacationAcquisitionDays < 0 ? 'AVAILABLE' : 'ACQUIRING'),
      firstConcessionEnd,
      experienceDaysRemaining: Math.max(finalExperienceDays, 0),
      vacationDaysRemaining: Math.max(vacationAcquisitionDays, 0),
      concessionDaysRemaining: Math.max(vacationConcessionDays, 0)
    };
  }

  function getById(id) {
    const employee = database.prepare(`
      SELECT e.id, e.company_id AS companyId, c.name AS companyName,
        e.employment_company_id AS employmentCompanyId, ec.name AS employmentCompanyName,
        e.employment_company_name AS employmentCompanyOtherName, e.name, e.cpf, e.role,
        e.admission_date AS admissionDate, e.employment_status AS employmentStatus, e.salary_base AS salaryBase, e.experience_status AS persistedExperienceStatus,
        e.responsible_phone AS responsiblePhone, e.responsible_email AS responsibleEmail,
        e.vacation_start_date AS vacationStartDate, e.vacation_end_date AS vacationEndDate,
        e.notes, e.created_at AS createdAt, e.updated_at AS updatedAt
      FROM employees e JOIN companies c ON c.id = e.company_id
      LEFT JOIN companies ec ON ec.id = e.employment_company_id WHERE e.id = ?
    `).get(id);
    return employee ? enrich(employee) : null;
  }

  return {
    create({ companyId, employmentCompanyId = '', employmentCompanyName = '', name, cpf = '', role = '', salaryBase = 0, admissionDate, vacationStartDate = '', vacationEndDate = '', responsiblePhone = '', responsibleEmail = '', notes = '' }) {
      if (!database.prepare('SELECT id FROM companies WHERE id = ?').get(companyId)) throw new Error('Empresa não encontrada.');
      if (employmentCompanyId && !database.prepare('SELECT id FROM companies WHERE id = ?').get(employmentCompanyId)) throw new Error('Empresa do vínculo não encontrada.');
      if (!employmentCompanyId && !employmentCompanyName?.trim()) throw new Error('Informe a empresa do vínculo.');
      if (!name?.trim() || !admissionDate) throw new Error('Informe o nome e a data de admissão.');
      const now = new Date().toISOString();
      const id = randomUUID();
      database.prepare(`INSERT INTO employees (id, company_id, employment_company_id, employment_company_name, name, cpf, role, salary_base, admission_date, vacation_start_date, vacation_end_date, responsible_phone, responsible_email, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(id, companyId, employmentCompanyId || null, employmentCompanyId ? null : employmentCompanyName.trim(), name.trim(), cpf.trim(), role.trim(), Number(salaryBase) || 0, admissionDate, vacationStartDate || null, vacationEndDate || null, responsiblePhone.trim(), responsibleEmail.trim(), notes.trim(), now, now);
      return getById(id);
    },

    importMany({ companyId, employmentCompanyId = '', employmentCompanyName = '', responsiblePhone = '', responsibleEmail = '', candidates = [] } = {}) {
      if (!database.prepare('SELECT id FROM companies WHERE id = ?').get(companyId)) throw new Error('Empresa responsável não encontrada.');
      if (employmentCompanyId && !database.prepare('SELECT id FROM companies WHERE id = ?').get(employmentCompanyId)) throw new Error('Empresa do vínculo não encontrada.');
      if (!Array.isArray(candidates) || !candidates.length) throw new Error('Nenhum funcionário válido para importar.');
      const resolvedEmploymentCompanyId = employmentCompanyId || (employmentCompanyName ? '' : companyId);
      const insert = database.prepare(`INSERT INTO employees (id, company_id, employment_company_id, employment_company_name, name, cpf, role, salary_base, admission_date, employment_status, vacation_start_date, vacation_end_date, responsible_phone, responsible_email, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
      const imported = [];
      const skipped = [];
      const existingCpfs = new Set(database.prepare('SELECT cpf FROM employees WHERE cpf <> ?').all('').map((employee) => employee.cpf));
      const fileCpfs = new Set();
      const now = new Date().toISOString();
      database.exec('BEGIN');
      try {
        candidates.forEach((candidate, index) => {
          const cpf = String(candidate.cpf || '').trim();
          const name = String(candidate.name || '').replace(/\s+/g, ' ').trim();
          if (!name || !candidate.admissionDate) { skipped.push({ row: candidate.row || index + 1, name, issue: 'Nome ou data de admissão ausente.' }); return; }
          if (cpf && (existingCpfs.has(cpf) || fileCpfs.has(cpf))) { skipped.push({ row: candidate.row || index + 1, name, issue: `CPF já cadastrado ou repetido: ${cpf}.` }); return; }
          const id = randomUUID();
          insert.run(id, companyId, resolvedEmploymentCompanyId || null, resolvedEmploymentCompanyId ? null : employmentCompanyName.trim(), name, cpf, String(candidate.role || '').trim(), Number(candidate.salaryBase) || 0, candidate.admissionDate, candidate.employmentStatus === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE', null, null, responsiblePhone.trim(), responsibleEmail.trim(), String(candidate.notes || '').trim(), now, now);
          (candidate.documents || []).forEach((document) => {
            if (document.issuedDate) saveDocument(id, { type: document.type, issuedDate: document.issuedDate, source: 'IMPORT' });
          });
          imported.push({ id, name, cpf });
          if (cpf) fileCpfs.add(cpf);
        });
        database.exec('COMMIT');
      } catch (error) {
        database.exec('ROLLBACK');
        throw error;
      }
      return { imported, skipped };
    },

    list({ companyId = '', search = '', status = 'ACTIVE', alertFilter = '' } = {}) {
      const conditions = [];
      const values = [];
      if (companyId) { conditions.push('e.company_id = ?'); values.push(companyId); }
      if (status) { conditions.push('e.employment_status = ?'); values.push(status); }
      if (search) { conditions.push('(e.name LIKE ? OR e.cpf LIKE ? OR e.role LIKE ?)'); values.push(`%${search}%`, `%${search}%`, `%${search}%`); }
      const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
      return database.prepare(`
        SELECT e.id, e.company_id AS companyId, c.name AS companyName,
          e.employment_company_id AS employmentCompanyId, ec.name AS employmentCompanyName,
          e.employment_company_name AS employmentCompanyOtherName, e.name, e.cpf, e.role,
          e.admission_date AS admissionDate, e.employment_status AS employmentStatus, e.salary_base AS salaryBase, e.experience_status AS persistedExperienceStatus,
          e.responsible_phone AS responsiblePhone, e.responsible_email AS responsibleEmail,
          e.vacation_start_date AS vacationStartDate, e.vacation_end_date AS vacationEndDate,
          e.notes, e.created_at AS createdAt, e.updated_at AS updatedAt
        FROM employees e JOIN companies c ON c.id = e.company_id
        LEFT JOIN companies ec ON ec.id = e.employment_company_id ${where} ORDER BY c.name COLLATE NOCASE, e.name COLLATE NOCASE
      `).all(...values).map(enrich).filter((employee) => {
        if (alertFilter === 'experience') return experienceNeedsReview(employee.experienceStatus);
        if (alertFilter === 'vacation') return ['AVAILABLE', 'VACATION_WARNING', 'OVERDUE'].includes(employee.vacationStatus);
        if (alertFilter === 'overdue') return employee.vacationStatus === 'OVERDUE';
        return true;
      });
    },

    summary() {
      const employees = this.list();
      return {
        total: employees.length,
        experienceAlerts: employees.filter((employee) => experienceNeedsReview(employee.experienceStatus)).length,
        vacationAlerts: employees.filter((employee) => ['AVAILABLE', 'VACATION_WARNING', 'OVERDUE'].includes(employee.vacationStatus)).length,
        overdueVacations: employees.filter((employee) => employee.vacationStatus === 'OVERDUE').length
      };
    },

    listDocuments,

    updateDocument({ employeeId, type, issuedDate = '', validityMonths, notes = '' }) {
      if (!getById(employeeId)) throw new Error('Funcionário não encontrado.');
      saveDocument(employeeId, { type, issuedDate, validityMonths, notes, source: 'MANUAL' });
      return listDocuments(employeeId).find((document) => document.documentType === type);
    },

    updateDocumentForAll({ type, validityMonths }) {
      const employeeIds = database.prepare('SELECT id FROM employees').all().map((employee) => employee.id);
      const rule = documentRules[type];
      if (!rule) throw new Error('Tipo de documento inválido.');
      const normalizedValidity = Number(validityMonths) || rule.months;
      if (normalizedValidity < 1 || normalizedValidity > 120) throw new Error('A validade deve estar entre 1 e 120 meses.');
      const now = new Date().toISOString();
      database.exec('BEGIN');
      try {
        employeeIds.forEach((employeeId) => {
          const existing = database.prepare('SELECT id, issued_date AS issuedDate FROM employee_documents WHERE employee_id = ? AND document_type = ?').get(employeeId, type);
          if (existing) {
            database.prepare('UPDATE employee_documents SET expires_at = ?, validity_months = ?, updated_at = ? WHERE id = ?').run(documentExpiry(existing.issuedDate, normalizedValidity) || null, normalizedValidity, now, existing.id);
          } else {
            saveDocument(employeeId, { type, validityMonths: normalizedValidity, source: 'MANUAL' });
          }
        });
        database.exec('COMMIT');
      } catch (error) {
        database.exec('ROLLBACK');
        throw error;
      }
      return employeeIds.length;
    },

    updateEmploymentStatus({ id, employmentStatus }) {
      if (!getById(id)) throw new Error('Funcionário não encontrado.');
      if (!['ACTIVE', 'INACTIVE'].includes(employmentStatus)) throw new Error('Situação do funcionário inválida.');
      database.prepare('UPDATE employees SET employment_status = ?, updated_at = ? WHERE id = ?').run(employmentStatus, new Date().toISOString(), id);
      return getById(id);
    },

    update({ id, companyId, employmentCompanyId = '', employmentCompanyName = '', name, cpf = '', role = '', salaryBase = 0, admissionDate, employmentStatus = 'ACTIVE', experienceStatus, vacationStartDate = '', vacationEndDate = '', responsiblePhone = '', responsibleEmail = '', notes = '' }) {
      const existing = getById(id);
      if (!existing) throw new Error('Funcionário não encontrado.');
      if (!database.prepare('SELECT id FROM companies WHERE id = ?').get(companyId)) throw new Error('Empresa responsável não encontrada.');
      if (employmentCompanyId && !database.prepare('SELECT id FROM companies WHERE id = ?').get(employmentCompanyId)) throw new Error('Empresa do vínculo não encontrada.');
      if (!employmentCompanyId && !employmentCompanyName?.trim()) throw new Error('Informe a empresa do vínculo.');
      if (!name?.trim() || !admissionDate) throw new Error('Informe o nome e a data de admissão.');
      if (!['ACTIVE', 'INACTIVE'].includes(employmentStatus)) throw new Error('Situação do funcionário inválida.');
      const now = new Date().toISOString();
      if (experienceStatus && !['IN_PROGRESS', 'FIRST_PERIOD_CONCLUDED', 'SECOND_PERIOD_IN_PROGRESS', 'SECOND_PERIOD_CONCLUDED', 'CONCLUDED'].includes(experienceStatus)) throw new Error('Status de experiência inválido.');
      database.prepare(`UPDATE employees SET company_id = ?, employment_company_id = ?, employment_company_name = ?, name = ?, cpf = ?, role = ?, salary_base = ?, admission_date = ?, employment_status = ?, experience_status = ?, vacation_start_date = ?, vacation_end_date = ?, responsible_phone = ?, responsible_email = ?, notes = ?, updated_at = ? WHERE id = ?`)
        .run(companyId, employmentCompanyId || null, employmentCompanyId ? null : employmentCompanyName.trim(), name.trim(), cpf.trim(), role.trim(), Number(salaryBase) || 0, admissionDate, employmentStatus, experienceStatus === undefined ? existing.persistedExperienceStatus : (experienceStatus || null), vacationStartDate || null, vacationEndDate || null, responsiblePhone.trim(), responsibleEmail.trim(), notes.trim(), now, id);
      return getById(id);
    },

    remove(id) {
      const employee = getById(id);
      if (!employee) throw new Error('Funcionário não encontrado.');
      database.prepare('DELETE FROM employees WHERE id = ?').run(id);
      return employee;
    }
  };
}

module.exports = { createEmployeeRepository };