const { randomUUID } = require('node:crypto');

function createCompanyRepository(database) {
  const insertCompany = database.prepare(`
    INSERT INTO companies (id, name, cnpj, internal_code, notes, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  return {
    create({ name, cnpj = '', internalCode = '', notes = '' }) {
      const normalizedCnpj = normalizeCnpj(cnpj);
      if (!/^[A-Z0-9]{14}$/.test(normalizedCnpj) || !isValidCnpj(normalizedCnpj)) {
        throw new Error('Informe um CNPJ valido com 14 caracteres, conforme o cadastro da Receita Federal.');
      }
      const now = new Date().toISOString();
      const company = {
        id: randomUUID(),
        name: name.trim(),
        cnpj: normalizedCnpj,
        internalCode: internalCode.trim(),
        notes: notes.trim(),
        createdAt: now,
        updatedAt: now
      };

      insertCompany.run(
        company.id,
        company.name,
        company.cnpj,
        company.internalCode,
        company.notes,
        company.createdAt,
        company.updatedAt
      );

      return company;
    },

    count() {
      return database.prepare('SELECT COUNT(*) AS count FROM companies').get().count;
    },

    getById(id) {
      return database.prepare('SELECT id, name, cnpj FROM companies WHERE id = ?').get(id) || null;
    },

    remove(id) {
      const company = database.prepare('SELECT id, name FROM companies WHERE id = ?').get(id);
      if (!company) {
        throw new Error('Empresa nao encontrada.');
      }
      database.exec('BEGIN');
      try {
        database.prepare('DELETE FROM tasks WHERE company_id = ?').run(id);
        database.prepare('DELETE FROM companies WHERE id = ?').run(id);
        database.exec('COMMIT');
      } catch (error) {
        database.exec('ROLLBACK');
        throw error;
      }
      return company;
    },

    list() {
      return database.prepare(`
        SELECT
          c.id,
          c.name,
          c.cnpj,
          c.internal_code AS internalCode,
          c.created_at AS createdAt,
          COUNT(t.id) AS taskCount,
          SUM(CASE WHEN t.status != 'DONE' THEN 1 ELSE 0 END) AS openTaskCount
        FROM companies c
        LEFT JOIN tasks t ON t.company_id = c.id
        GROUP BY c.id
        ORDER BY c.name COLLATE NOCASE
      `).all().map((company) => ({
        ...company,
        taskCount: company.taskCount || 0,
        openTaskCount: company.openTaskCount || 0
      }));
    }
  };
}

function isValidCnpj(cnpj) {
  if (!/^[A-Z0-9]{14}$/.test(cnpj) || !/^\d{2}$/.test(cnpj.slice(-2)) || /^(.)\1+$/.test(cnpj)) return false;
  const calculateDigit = (length) => {
    let sum = 0;
    let factor = length === 12 ? 5 : 6;
    for (let index = 0; index < length; index += 1) {
      sum += cnpjValue(cnpj[index]) * factor;
      factor = factor === 2 ? 9 : factor - 1;
    }
    return (sum % 11 < 2 ? 0 : 11 - (sum % 11));
  };
  return calculateDigit(12) === Number(cnpj[12]) && calculateDigit(13) === Number(cnpj[13]);
}

function normalizeCnpj(cnpj) {
  return String(cnpj).toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function cnpjValue(character) {
  return character >= 'A' && character <= 'Z' ? character.charCodeAt(0) - 48 : Number(character);
}

module.exports = { createCompanyRepository };
