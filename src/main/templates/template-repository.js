const { randomUUID } = require('node:crypto');

const defaultTemplates = [
  ['Admissão', ['Receber documentação', 'Conferir documentos', 'Cadastrar funcionário', 'Preparar documentação', 'Transmitir evento', 'Conferir retorno', 'Finalizar']],
  ['Férias', ['Solicitar período', 'Conferir período aquisitivo', 'Calcular', 'Gerar documentos', 'Enviar', 'Registrar', 'Finalizar']],
  ['Rescisão', ['Receber solicitação', 'Conferir dados', 'Calcular', 'Gerar documentos', 'Transmitir eventos', 'Conferir retorno', 'Finalizar']],
  ['Folha', ['Receber informações', 'Conferir ponto', 'Calcular', 'Revisar', 'Transmitir eventos', 'Conferir processamento', 'Finalizar']]
];

function createTemplateRepository(database) {
  const insertTemplate = database.prepare(`
    INSERT INTO task_templates (id, name, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?)
  `);
  const insertStep = database.prepare(`
    INSERT INTO template_steps (id, template_id, title, position) VALUES (?, ?, ?, ?)
  `);

  function create(name, steps, description = '') {
    const now = new Date().toISOString();
    const templateId = randomUUID();
    insertTemplate.run(templateId, name.trim(), description.trim(), now, now);
    steps.forEach((title, position) => insertStep.run(randomUUID(), templateId, title.trim(), position));
    return { id: templateId, name: name.trim(), steps };
  }

  return {
    seedDefaults() {
      if (database.prepare('SELECT COUNT(*) AS count FROM task_templates').get().count > 0) return;
      database.exec('BEGIN');
      try {
        defaultTemplates.forEach(([name, steps]) => create(name, steps));
        database.exec('COMMIT');
      } catch (error) {
        database.exec('ROLLBACK');
        throw error;
      }
    },

    list() {
      return database.prepare(`
        SELECT t.id, t.name, t.description, COUNT(s.id) AS stepCount
        FROM task_templates t
        LEFT JOIN template_steps s ON s.template_id = t.id
        GROUP BY t.id
        ORDER BY t.name COLLATE NOCASE
      `).all();
    },

    getDetails(templateId) {
      const template = database.prepare('SELECT id, name, description FROM task_templates WHERE id = ?').get(templateId);
      if (!template) throw new Error('Template nao encontrado.');
      return {
        ...template,
        steps: database.prepare(`
          SELECT id, title, position, estimated_minutes AS estimatedMinutes
          FROM template_steps WHERE template_id = ? ORDER BY position
        `).all(templateId)
      };
    },

    create
  };
}

module.exports = { createTemplateRepository };