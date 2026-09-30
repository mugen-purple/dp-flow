const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

function createCollaborationRepository(database, settings) {
  let workspacePath = settings.get('collaboration.workspacePath') || '';
  let actorId = settings.get('collaboration.actorId') || randomUUID();
  let actorName = settings.get('collaboration.actorName') || '';
  settings.save('collaboration.actorId', actorId);

  function now() {
    return new Date().toISOString();
  }

  function getActor() {
    return { id: actorId, name: actorName || 'Conta local' };
  }

  function workspaceFile() {
    return workspacePath ? path.join(workspacePath, 'dp-flow-workspace.json') : '';
  }

  function readWorkspace() {
    const file = workspaceFile();
    if (!file || !fs.existsSync(file)) return null;
    try {
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (error) {
      throw new Error(`Não foi possível ler o espaço colaborativo: ${error.message}`);
    }
  }

  function writeWorkspace(snapshot) {
    fs.mkdirSync(workspacePath, { recursive: true });
    const file = workspaceFile();
    const temporaryFile = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(temporaryFile, JSON.stringify(snapshot, null, 2), 'utf8');
    fs.renameSync(temporaryFile, file);
  }

  function allRows(table) {
    return database.prepare(`SELECT * FROM ${table}`).all();
  }

  function localSnapshot() {
    const timestamp = now();
    return {
      format: 1,
      workspaceId: settings.get('collaboration.workspaceId') || randomUUID(),
      updatedAt: timestamp,
      updatedBy: getActor(),
      members: [{ id: actorId, name: actorName || 'Conta local', lastSeenAt: timestamp }],
      companies: allRows('companies'),
      tasks: allRows('tasks'),
      taskHistory: allRows('task_history'),
      taskChecklists: allRows('task_checklists'),
      taskTimeEntries: allRows('task_time_entries'),
      taskTemplates: allRows('task_templates'),
      templateSteps: allRows('template_steps'),
      employees: allRows('employees'),
      vacationPeriods: allRows('vacation_periods'),
      activity: [{ id: randomUUID(), type: 'SYNC', description: 'Espaço colaborativo atualizado', actorId, actorName: actorName || 'Conta local', createdAt: timestamp }]
    };
  }

  function replaceTable(table, rows, columns) {
    database.prepare(`DELETE FROM ${table}`).run();
    if (!rows?.length) return;
    const placeholders = columns.map(() => '?').join(', ');
    const insert = database.prepare(`INSERT OR REPLACE INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`);
    rows.forEach((row) => insert.run(...columns.map((column) => row[column] ?? null)));
  }

  function importSnapshot(snapshot) {
    if (!snapshot || snapshot.format !== 1) throw new Error('Formato de espaço colaborativo não reconhecido.');
    database.exec('BEGIN');
    try {
      replaceTable('task_time_entries', [], ['id', 'task_id', 'started_at', 'ended_at', 'duration_seconds']);
      replaceTable('employees', [], ['id', 'company_id', 'employment_company_id', 'employment_company_name', 'name', 'cpf', 'role', 'admission_date', 'employment_status', 'vacation_start_date', 'vacation_end_date', 'notes', 'created_at', 'updated_at']);
      replaceTable('vacation_periods', [], ['id', 'employee_id', 'acquisition_start', 'acquisition_end', 'concession_end', 'status', 'leave_start', 'leave_end', 'leave_days', 'notes', 'created_at', 'updated_at']);
      replaceTable('task_history', [], ['id', 'task_id', 'event_type', 'description', 'metadata_json', 'created_at']);
      replaceTable('task_checklists', [], ['id', 'task_id', 'title', 'position', 'completed_at']);
      replaceTable('tasks', [], ['id', 'title', 'description', 'company_id', 'status', 'priority', 'due_at', 'estimated_minutes', 'actual_minutes', 'source', 'created_at', 'updated_at', 'completed_at', 'created_by_id', 'created_by_name', 'completed_by_id', 'completed_by_name']);
      replaceTable('companies', snapshot.companies, ['id', 'name', 'cnpj', 'internal_code', 'notes', 'created_at', 'updated_at', 'created_by_id', 'created_by_name', 'updated_by_id', 'updated_by_name']);
      replaceTable('employees', snapshot.employees || [], ['id', 'company_id', 'employment_company_id', 'employment_company_name', 'name', 'cpf', 'role', 'admission_date', 'employment_status', 'vacation_start_date', 'vacation_end_date', 'notes', 'created_at', 'updated_at']);
      replaceTable('vacation_periods', snapshot.vacationPeriods || [], ['id', 'employee_id', 'acquisition_start', 'acquisition_end', 'concession_end', 'status', 'leave_start', 'leave_end', 'leave_days', 'notes', 'created_at', 'updated_at']);
      replaceTable('template_steps', [], ['id', 'template_id', 'title', 'position', 'estimated_minutes']);
      replaceTable('task_templates', snapshot.taskTemplates, ['id', 'name', 'description', 'created_at', 'updated_at']);
      replaceTable('template_steps', snapshot.templateSteps, ['id', 'template_id', 'title', 'position', 'estimated_minutes']);
      replaceTable('tasks', snapshot.tasks, ['id', 'title', 'description', 'company_id', 'status', 'priority', 'due_at', 'estimated_minutes', 'actual_minutes', 'source', 'created_at', 'updated_at', 'completed_at', 'created_by_id', 'created_by_name', 'completed_by_id', 'completed_by_name']);
      replaceTable('task_checklists', snapshot.taskChecklists, ['id', 'task_id', 'title', 'position', 'completed_at']);
      replaceTable('task_history', snapshot.taskHistory, ['id', 'task_id', 'event_type', 'description', 'metadata_json', 'created_at']);
      replaceTable('task_time_entries', snapshot.taskTimeEntries, ['id', 'task_id', 'started_at', 'ended_at', 'duration_seconds']);
      database.exec('COMMIT');
    } catch (error) {
      database.exec('ROLLBACK');
      throw error;
    }
    settings.save('collaboration.lastSyncAt', snapshot.updatedAt || now());
    settings.save('collaboration.workspaceId', snapshot.workspaceId || randomUUID());
  }

  function publish() {
    if (!workspacePath) return { connected: false, actor: getActor() };
    const current = readWorkspace();
    const snapshot = localSnapshot();
    snapshot.workspaceId = settings.get('collaboration.workspaceId') || current?.workspaceId || randomUUID();
    snapshot.members = [...(current?.members || []).filter((member) => member.id !== actorId), ...snapshot.members];
    snapshot.activity = [...(current?.activity || []).slice(-99), ...snapshot.activity].slice(-100);
    writeWorkspace(snapshot);
    settings.save('collaboration.workspaceId', snapshot.workspaceId);
    settings.save('collaboration.lastSyncAt', snapshot.updatedAt);
    return status();
  }

  function sync() {
    if (!workspacePath) return status();
    const snapshot = readWorkspace();
    if (!snapshot) return publish();
    const lastSyncAt = settings.get('collaboration.lastSyncAt') || '';
    if (snapshot.updatedAt > lastSyncAt && snapshot.updatedBy?.id !== actorId) importSnapshot(snapshot);
    const current = readWorkspace();
    if (current) {
      const members = [...(current.members || []).filter((member) => member.id !== actorId), { id: actorId, name: actorName || 'Conta local', lastSeenAt: now() }];
      if (JSON.stringify(members) !== JSON.stringify(current.members)) {
        current.members = members;
        writeWorkspace(current);
      }
    }
    return status();
  }

  function connect(folderPath, name) {
    if (typeof folderPath !== 'string' || !folderPath.trim()) throw new Error('Escolha uma pasta para o espaço colaborativo.');
    if (typeof name === 'string' && name.trim()) {
      actorName = name.trim();
      settings.save('collaboration.actorName', actorName);
    }
    workspacePath = path.resolve(folderPath.trim());
    settings.save('collaboration.workspacePath', workspacePath);
    const existing = readWorkspace();
    if (existing) {
      settings.save('collaboration.workspaceId', existing.workspaceId || randomUUID());
      importSnapshot(existing);
    } else {
      publish();
    }
    return status();
  }

  function disconnect() {
    workspacePath = '';
    settings.save('collaboration.workspacePath', '');
    settings.save('collaboration.workspaceId', '');
    settings.save('collaboration.lastSyncAt', '');
    return status();
  }

  function setActor(name) {
    if (typeof name !== 'string' || !name.trim()) throw new Error('Informe o nome da conta colaboradora.');
    actorName = name.trim();
    settings.save('collaboration.actorName', actorName);
    if (workspacePath) publish();
    return status();
  }

  function status() {
    const snapshot = workspacePath ? readWorkspace() : null;
    return {
      connected: Boolean(workspacePath),
      workspacePath,
      workspaceId: settings.get('collaboration.workspaceId') || snapshot?.workspaceId || null,
      actor: getActor(),
      members: snapshot?.members || [{ id: actorId, name: actorName || 'Conta local', lastSeenAt: now() }],
      lastSyncAt: settings.get('collaboration.lastSyncAt') || null,
      updatedAt: snapshot?.updatedAt || null
    };
  }

  return { getActor, status, connect, disconnect, setActor, sync, publish };
}

module.exports = { createCollaborationRepository };
