const { randomUUID } = require('node:crypto');

function createTaskRepository(database) {
  const validStatuses = new Set(['BACKLOG', 'TODO', 'IN_PROGRESS', 'WAITING', 'DONE']);
  const completedTaskRetentionDays = 30;
  const insertTask = database.prepare(`
    INSERT INTO tasks (
      id, title, description, company_id, status, priority, due_at,
      estimated_minutes, actual_minutes, source, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 'MANUAL', ?, ?)
  `);

  const insertHistory = database.prepare(`
    INSERT INTO task_history (task_id, event_type, description, metadata_json, created_at)
    VALUES (?, ?, ?, ?, ?)
  `);

  function closeActiveTimer(taskId, now, reason) {
    const activeEntry = database.prepare(`
      SELECT id, started_at AS startedAt
      FROM task_time_entries
      WHERE task_id = ? AND ended_at IS NULL
    `).get(taskId);
    if (!activeEntry) return false;

    const durationSeconds = Math.max(0, Math.floor((now - new Date(activeEntry.startedAt)) / 1000));
    const nowIso = now.toISOString();
    database.prepare(`
      UPDATE task_time_entries SET ended_at = ?, duration_seconds = ? WHERE id = ?
    `).run(nowIso, durationSeconds, activeEntry.id);
    database.prepare(`
      UPDATE tasks SET actual_minutes = CAST((SELECT COALESCE(SUM(duration_seconds), 0) FROM task_time_entries WHERE task_id = ?) / 60 AS INTEGER), updated_at = ? WHERE id = ?
    `).run(taskId, nowIso, taskId);
    insertHistory.run(taskId, 'TIMER_STOPPED', `${reason}: ${durationSeconds}s registrados`, null, nowIso);
    return true;
  }

  return {
    create({ title, companyId, priority = 'MEDIUM', dueAt = null, estimatedMinutes = null, checklist = [] }) {
      const now = new Date().toISOString();
      const task = {
        id: randomUUID(),
        title: title.trim(),
        companyId,
        status: 'BACKLOG',
        priority,
        dueAt,
        estimatedMinutes,
        createdAt: now,
        updatedAt: now
      };

      insertTask.run(
        task.id,
        task.title,
        '',
        task.companyId,
        task.status,
        task.priority,
        task.dueAt,
        task.estimatedMinutes,
        task.createdAt,
        task.updatedAt
      );
      insertHistory.run(task.id, 'TASK_CREATED', 'Tarefa criada no onboarding', null, now);
      const checklistItems = checklist.length ? checklist : [{ title: 'Concluir tarefa' }];
      checklistItems.forEach((item, position) => {
        database.prepare('INSERT INTO task_checklists (id, task_id, title, position) VALUES (?, ?, ?, ?)')
          .run(randomUUID(), task.id, item.title || item, position);
      });

      return task;
    },

    summary() {
      const row = database.prepare(`
        SELECT
          COUNT(*) AS total,
          SUM(CASE WHEN status = 'IN_PROGRESS' THEN 1 ELSE 0 END) AS in_progress,
          SUM(CASE WHEN status = 'DONE' THEN 1 ELSE 0 END) AS completed,
          SUM(CASE WHEN due_at IS NOT NULL AND due_at < datetime('now') AND status != 'DONE' THEN 1 ELSE 0 END) AS overdue,
          SUM(CASE WHEN date(due_at) = date('now', 'localtime') AND status != 'DONE' THEN 1 ELSE 0 END) AS due_today
        FROM tasks
      `).get();

      return {
        total: row.total || 0,
        inProgress: row.in_progress || 0,
        completed: row.completed || 0,
        overdue: row.overdue || 0,
        dueToday: row.due_today || 0
      };
    },

    list() {
      return database.prepare(`
        SELECT
          t.id,
          t.title,
          t.status,
          t.priority,
          t.description,
          t.due_at AS dueAt,
          t.created_at AS createdAt,
          t.created_by_name AS createdByName,
          c.name AS companyName
        FROM tasks t
        LEFT JOIN companies c ON c.id = t.company_id
        WHERE t.status != 'DONE'
        ORDER BY
          CASE t.status WHEN 'IN_PROGRESS' THEN 1 WHEN 'BACKLOG' THEN 2 ELSE 3 END,
          t.due_at IS NULL,
          t.due_at,
          t.created_at DESC
      `).all();
    },

    listCompleted() {
      const cutoff = new Date(Date.now() - completedTaskRetentionDays * 24 * 60 * 60 * 1000).toISOString();
      database.prepare(`DELETE FROM tasks WHERE status = 'DONE' AND completed_at IS NOT NULL AND completed_at < ?`).run(cutoff);
      return database.prepare(`
        SELECT t.id, t.title, t.priority, t.completed_at AS completedAt,
          t.completed_by_name AS completedByName,
          t.created_by_name AS createdByName,
          c.name AS companyName
        FROM tasks t
        LEFT JOIN companies c ON c.id = t.company_id
        WHERE t.status = 'DONE'
        ORDER BY t.completed_at DESC
      `).all();
    },

    updateStatus(taskId, status) {
      if (!validStatuses.has(status)) {
        throw new Error('Status de tarefa invalido.');
      }

      const task = database.prepare('SELECT id, status, title FROM tasks WHERE id = ?').get(taskId);
      if (!task) {
        throw new Error('Tarefa nao encontrada.');
      }

      if (task.status === status && !(status === 'DONE' && this.getTimer(taskId).active)) {
        return task;
      }

      const now = new Date();
      if (status === 'DONE') {
        const checklist = database.prepare('SELECT COUNT(*) AS total, SUM(CASE WHEN completed_at IS NOT NULL THEN 1 ELSE 0 END) AS completed FROM task_checklists WHERE task_id = ?').get(taskId);
        if (checklist.total > 0 && checklist.completed !== checklist.total) {
          throw new Error('Conclua todas as etapas do checklist antes de finalizar a tarefa.');
        }
        closeActiveTimer(taskId, now, 'Cronometro encerrado pela conclusao');
      }
      const nowIso = now.toISOString();
      database.prepare(`
        UPDATE tasks
        SET status = ?, updated_at = ?, completed_at = CASE WHEN ? = 'DONE' THEN ? ELSE NULL END
        WHERE id = ?
      `).run(status, nowIso, status, nowIso, taskId);
      insertHistory.run(
        taskId,
        'STATUS_CHANGED',
        `Status alterado de ${task.status} para ${status}`,
        JSON.stringify({ from: task.status, to: status }),
        nowIso
      );

      return { ...task, status };
    },

    getDetails(taskId) {
      const task = database.prepare(`
        SELECT
          t.id,
          t.title,
          t.description,
          t.company_id AS companyId,
          t.status,
          t.priority,
          t.due_at AS dueAt,
          t.estimated_minutes AS estimatedMinutes,
          t.actual_minutes AS actualMinutes,
          t.created_at AS createdAt,
          t.updated_at AS updatedAt,
          t.completed_at AS completedAt,
          t.created_by_name AS createdByName,
          t.completed_by_name AS completedByName,
          c.name AS companyName
        FROM tasks t
        LEFT JOIN companies c ON c.id = t.company_id
        WHERE t.id = ?
      `).get(taskId);

      if (!task) {
        throw new Error('Tarefa nao encontrada.');
      }

      return {
        task,
        history: database.prepare(`
          SELECT id, event_type AS eventType, description, created_at AS createdAt
          FROM task_history
          WHERE task_id = ?
          ORDER BY created_at DESC, id DESC
        `).all(taskId),
        evidence: database.prepare(`
          SELECT source, event_type AS eventType, confidence, detected_at AS detectedAt, details_json AS detailsJson
          FROM completion_evidence
          WHERE task_id = ?
          ORDER BY detected_at DESC
        `).all(taskId),
        checklist: database.prepare(`
          SELECT id, title, position, completed_at AS completedAt
          FROM task_checklists WHERE task_id = ? ORDER BY position
        `).all(taskId)
      };
    },

    updateDetails({ taskId, description, priority, dueAt, estimatedMinutes }) {
      const validPriorities = new Set(['LOW', 'MEDIUM', 'HIGH', 'URGENT']);
      if (!validPriorities.has(priority)) {
        throw new Error('Prioridade de tarefa invalida.');
      }

      const task = database.prepare('SELECT id FROM tasks WHERE id = ?').get(taskId);
      if (!task) {
        throw new Error('Tarefa nao encontrada.');
      }

      const now = new Date().toISOString();
      database.prepare(`
        UPDATE tasks
        SET description = ?, priority = ?, due_at = ?, estimated_minutes = ?, updated_at = ?
        WHERE id = ?
      `).run(description.trim(), priority, dueAt || null, estimatedMinutes || null, now, taskId);
      insertHistory.run(taskId, 'TASK_UPDATED', 'Detalhes da tarefa atualizados', null, now);

      return this.getDetails(taskId);
    },

    toggleChecklistItem(taskId, checklistId, completed) {
      const item = database.prepare('SELECT id FROM task_checklists WHERE id = ? AND task_id = ?').get(checklistId, taskId);
      if (!item) throw new Error('Item de checklist nao encontrado.');

      const now = new Date().toISOString();
      database.prepare('UPDATE task_checklists SET completed_at = ? WHERE id = ?').run(completed ? now : null, checklistId);
      insertHistory.run(taskId, 'CHECKLIST_UPDATED', completed ? 'Etapa de checklist concluida' : 'Etapa de checklist reaberta', JSON.stringify({ checklistId, completed }), now);

      const counts = database.prepare(`
        SELECT COUNT(*) AS total, SUM(CASE WHEN completed_at IS NOT NULL THEN 1 ELSE 0 END) AS completed
        FROM task_checklists WHERE task_id = ?
      `).get(taskId);
      if (counts.total > 0 && counts.total === counts.completed) this.updateStatus(taskId, 'DONE');
      if (!completed) {
        const task = database.prepare('SELECT status FROM tasks WHERE id = ?').get(taskId);
        if (task.status === 'DONE') this.updateStatus(taskId, 'TODO');
      }
      return this.getDetails(taskId);
    },

    getTimer(taskId) {
      const activeEntry = database.prepare(`
        SELECT id, started_at AS startedAt
        FROM task_time_entries
        WHERE task_id = ? AND ended_at IS NULL
      `).get(taskId);
      const total = database.prepare(`
        SELECT COALESCE(SUM(duration_seconds), 0) AS seconds
        FROM task_time_entries
        WHERE task_id = ?
      `).get(taskId).seconds;

      return { active: activeEntry || null, totalSeconds: total };
    },

    startTimer(taskId) {
      const task = database.prepare('SELECT id FROM tasks WHERE id = ?').get(taskId);
      if (!task) throw new Error('Tarefa nao encontrada.');
      if (this.getTimer(taskId).active) throw new Error('Esta tarefa ja possui um cronometro ativo.');

      const now = new Date().toISOString();
      database.prepare(`
        INSERT INTO task_time_entries (id, task_id, started_at) VALUES (?, ?, ?)
      `).run(randomUUID(), taskId, now);
      const currentStatus = database.prepare('SELECT status FROM tasks WHERE id = ?').get(taskId).status;
      if (currentStatus !== 'IN_PROGRESS' && currentStatus !== 'DONE') {
        database.prepare('UPDATE tasks SET status = ?, updated_at = ? WHERE id = ?').run('IN_PROGRESS', now, taskId);
        insertHistory.run(taskId, 'STATUS_CHANGED', `Status alterado de ${currentStatus} para IN_PROGRESS`, JSON.stringify({ from: currentStatus, to: 'IN_PROGRESS', reason: 'timer_started' }), now);
      }
      insertHistory.run(taskId, 'TIMER_STARTED', 'Cronometro iniciado', null, now);
      return this.getTimer(taskId);
    },

    stopTimer(taskId) {
      const timer = this.getTimer(taskId);
      if (!timer.active) throw new Error('Esta tarefa nao possui um cronometro ativo.');

      closeActiveTimer(taskId, new Date(), 'Cronometro pausado');
      return this.getTimer(taskId);
    }
  };
}

module.exports = { createTaskRepository };
