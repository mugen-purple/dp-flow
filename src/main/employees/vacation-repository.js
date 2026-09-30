const { randomUUID } = require('node:crypto');

function createVacationRepository(database) {
  const today = () => new Date().toISOString().slice(0, 10);

  function addMonths(value, months) {
    const date = new Date(`${value}T12:00:00`);
    date.setMonth(date.getMonth() + months);
    return date.toISOString().slice(0, 10);
  }

  function addDays(value, days) {
    const date = new Date(`${value}T12:00:00`);
    date.setDate(date.getDate() + days);
    return date.toISOString().slice(0, 10);
  }

  function periodDates(admissionDate, index) {
    const start = addMonths(admissionDate, index * 12);
    const acquisitionEnd = addDays(addMonths(start, 12), -1);
    const concessionEnd = addDays(addMonths(start, 24), -1);
    return { start, acquisitionEnd, concessionEnd };
  }

  function effectiveStatus(period) {
    if (period.status === 'PENDING' && period.concessionEnd < today()) {
      return { ...period, status: 'OVERDUE' };
    }
    if (period.status === 'PENDING' && period.acquisitionEnd < today()) {
      return { ...period, status: 'AVAILABLE' };
    }
    return period;
  }

  function row(id) {
    const result = database.prepare(`
      SELECT v.id, v.employee_id AS employeeId, e.name AS employeeName, e.cpf,
        c.name AS responsibleCompanyName, v.acquisition_start AS acquisitionStart,
        v.acquisition_end AS acquisitionEnd, v.concession_end AS concessionEnd,
        v.status, v.leave_start AS leaveStart, v.leave_end AS leaveEnd,
        v.leave_days AS leaveDays, v.notes, v.created_at AS createdAt, v.updated_at AS updatedAt
      FROM vacation_periods v
      JOIN employees e ON e.id = v.employee_id
      JOIN companies c ON c.id = e.company_id
      WHERE v.id = ?
    `).get(id);
    return result ? effectiveStatus(result) : null;
  }

  function ensurePeriods(employeeId) {
    const employee = database.prepare('SELECT id, admission_date AS admissionDate FROM employees WHERE id = ?').get(employeeId);
    if (!employee) throw new Error('Funcionário não encontrado.');
    const currentYear = new Date().getFullYear();
    const insert = database.prepare(`INSERT OR IGNORE INTO vacation_periods (id, employee_id, acquisition_start, acquisition_end, concession_end, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'PENDING', ?, ?)`);
    const admissionYear = Number(employee.admissionDate.slice(0, 4));
    const maxIndex = Math.max(1, currentYear - admissionYear + 2);
    const now = new Date().toISOString();
    for (let index = 0; index <= maxIndex; index += 1) {
      const dates = periodDates(employee.admissionDate, index);
      insert.run(randomUUID(), employee.id, dates.start, dates.acquisitionEnd, dates.concessionEnd, now, now);
    }
  }

  return {
    list({ employeeId = '', companyId = '', search = '', status = '' } = {}) {
      const employeeIds = employeeId ? [employeeId] : database.prepare(`SELECT e.id FROM employees e WHERE (? = '' OR e.company_id = ?) AND (? = '' OR e.name LIKE ? OR e.cpf LIKE ?)`).all(companyId, companyId, search, `%${search}%`, `%${search}%`).map((item) => item.id);
      employeeIds.forEach(ensurePeriods);
      if (!employeeIds.length) return [];
      const placeholders = employeeIds.map(() => '?').join(', ');
      const rows = database.prepare(`SELECT v.id, v.employee_id AS employeeId, e.name AS employeeName, e.cpf, c.name AS responsibleCompanyName, v.acquisition_start AS acquisitionStart, v.acquisition_end AS acquisitionEnd, v.concession_end AS concessionEnd, v.status, v.leave_start AS leaveStart, v.leave_end AS leaveEnd, v.leave_days AS leaveDays, v.notes, v.created_at AS createdAt, v.updated_at AS updatedAt FROM vacation_periods v JOIN employees e ON e.id = v.employee_id JOIN companies c ON c.id = e.company_id WHERE v.employee_id IN (${placeholders}) ORDER BY e.name COLLATE NOCASE, v.acquisition_start`).all(...employeeIds).map(effectiveStatus);
      return status ? rows.filter((period) => period.status === status) : rows;
    },

    update({ id, status, leaveStart = '', leaveEnd = '', leaveDays = '', notes = '' }) {
      const period = row(id);
      if (!period) throw new Error('Período de férias não encontrado.');
      if (!['PENDING', 'AVAILABLE', 'SCHEDULED', 'TAKEN', 'OVERDUE'].includes(status)) throw new Error('Situação de férias inválida.');
      const now = new Date().toISOString();
      database.prepare('UPDATE vacation_periods SET status = ?, leave_start = ?, leave_end = ?, leave_days = ?, notes = ?, updated_at = ? WHERE id = ?').run(status, leaveStart || null, leaveEnd || null, leaveDays === '' ? null : Number(leaveDays), notes.trim(), now, id);
      return row(id);
    }
  };
}

module.exports = { createVacationRepository };