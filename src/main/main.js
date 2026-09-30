const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const path = require('node:path');
const { createDatabase } = require('./database/database');
const { createCompanyRepository } = require('./companies/company-repository');
const { createTaskRepository } = require('./tasks/task-repository');
const { createSettingsRepository } = require('./settings/settings-repository');
const { createTemplateRepository } = require('./templates/template-repository');
const { createAdmissionsRepository } = require('./admissions/admissions-repository');
const { createGoogleOAuthAdmissionsService } = require('./admissions/google-oauth-admissions-service');
const { createCollaborationRepository } = require('./collaboration/collaboration-repository');
const { createEmployeeRepository } = require('./employees/employee-repository');
const { createVacationRepository } = require('./employees/vacation-repository');
const { parseEmployeeFile } = require('./employees/employee-pdf-parser');

let databaseContext;
let repositories;
let admissionsService;

function decodeXml(value) {
  return value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

function readRssTag(block, tag) {
  const match = block.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'i'));
  return match ? decodeXml(match[1].trim()) : '';
}

function readRssAttribute(block, tag, attribute) {
  const match = block.match(new RegExp(`<${tag}[^>]*\\s${attribute}="([^"]+)"`, 'i'));
  return match ? decodeXml(match[1]) : null;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
}

function salaryProvisionPdfHtml(payload) {
  const lines = Array.isArray(payload.lines) ? payload.lines : [];
  const generatedAt = new Date().toLocaleString('pt-BR');
  const rows = lines.map((line) => `<tr><td>${escapeHtml(line.label)}</td><td>${escapeHtml(line.value)}</td></tr>`).join('');
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><style>
    @page { size: A4; margin: 18mm; } body { font-family: Arial, sans-serif; color: #202a2e; font-size: 12px; }
    h1 { margin: 0 0 4px; font-size: 24px; } h2 { margin: 24px 0 8px; font-size: 15px; border-bottom: 1px solid #c8d1d2; padding-bottom: 6px; }
    .muted { color: #607074; } .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 5px 24px; margin-top: 16px; }
    .meta strong { display: block; font-size: 13px; } table { width: 100%; border-collapse: collapse; margin-top: 8px; }
    td { border-bottom: 1px solid #dce2e2; padding: 8px 4px; } td:last-child { text-align: right; font-weight: 600; }
    .total { margin-top: 16px; padding: 12px; background: #edf4f2; display: flex; justify-content: space-between; font-size: 16px; font-weight: 700; }
    footer { margin-top: 28px; font-size: 10px; color: #607074; }
  </style></head><body>
    <h1>Provisão de salário</h1><div class="muted">Estimativa mensal para conferência interna</div>
    <h2>Funcionário</h2><div class="meta"><div><span class="muted">Nome</span><strong>${escapeHtml(payload.employeeName)}</strong></div><div><span class="muted">CPF</span><strong>${escapeHtml(payload.cpf || 'Não informado')}</strong></div><div><span class="muted">Empresa</span><strong>${escapeHtml(payload.companyName || 'Não informada')}</strong></div><div><span class="muted">Admissão</span><strong>${escapeHtml(payload.admissionDate || 'Não informada')}</strong></div></div>
    <h2>Composição mensal</h2><table><tbody>${rows}</tbody></table><div class="total"><span>Total estimado</span><span>${escapeHtml(payload.total)}</span></div>
    <footer>Gerado pelo DP Flow em ${escapeHtml(generatedAt)}. Este documento é uma estimativa e não substitui o cálculo oficial da folha.</footer>
  </body></html>`;
}

async function fetchDpNews() {
  const response = await fetch('https://www.contabeis.com.br/rss/noticias/', { headers: { 'User-Agent': 'DP-Flow/0.1' } });
  if (!response.ok) throw new Error(`Feed de noticias respondeu ${response.status}.`);
  const xml = await response.text();
  const items = [...xml.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi)].map((match) => match[1]);
  return items.slice(0, 10).map((item) => ({
    category: 'Atualização de DP/RH',
    title: readRssTag(item, 'title') || 'Notícia de Departamento Pessoal',
    summary: readRssTag(item, 'description').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim().slice(0, 220),
    source: 'Portal Contábeis',
    url: readRssTag(item, 'link') || 'https://www.contabeis.com.br/noticias/',
    publishedAt: readRssTag(item, 'pubDate') || null,
    image: readRssAttribute(item, 'enclosure', 'url') || readRssAttribute(item, 'media:content', 'url')
  }));
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: '#f4f1eb',
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  window.loadFile(path.join(__dirname, '../renderer/index.html'));
}

app.whenReady().then(() => {
  databaseContext = createDatabase(app.getPath('userData'));
  const settingsRepository = createSettingsRepository(databaseContext.database);
  const collaborationRepository = createCollaborationRepository(databaseContext.database, settingsRepository);
  repositories = {
    companies: createCompanyRepository(databaseContext.database),
    tasks: createTaskRepository(databaseContext.database),
    settings: settingsRepository,
    templates: createTemplateRepository(databaseContext.database),
    admissions: createAdmissionsRepository(databaseContext.database),
    employees: createEmployeeRepository(databaseContext.database),
    vacations: createVacationRepository(databaseContext.database),
    collaboration: collaborationRepository
  };
  repositories.templates.seedDefaults();
  admissionsService = createGoogleOAuthAdmissionsService({
    repository: repositories.admissions,
    userDataPath: app.getPath('userData'),
    openExternal: (url) => shell.openExternal(url)
  });

  ipcMain.handle('system:get-status', () => ({
    databasePath: databaseContext.databasePath,
    schemaVersion: databaseContext.database
      .prepare('SELECT MAX(version) AS version FROM schema_migrations')
      .get().version
  }));
  ipcMain.handle('collaboration:get-status', () => repositories.collaboration.status());
  ipcMain.handle('collaboration:set-actor', (_event, name) => repositories.collaboration.setActor(name));
  ipcMain.handle('collaboration:choose-folder', async () => {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] });
    return result.canceled ? null : result.filePaths[0];
  });
  ipcMain.handle('collaboration:connect', (_event, payload) => repositories.collaboration.connect(payload?.folderPath, payload?.name));
  ipcMain.handle('collaboration:disconnect', () => repositories.collaboration.disconnect());
  ipcMain.handle('collaboration:sync', () => repositories.collaboration.sync());
  ipcMain.handle('news:list', async () => {
    try {
      return { items: await fetchDpNews(), offline: false };
    } catch (error) {
      console.error('Falha ao atualizar noticias:', error);
      return { items: [], offline: true };
    }
  });

  ipcMain.handle('onboarding:get-state', () => ({
    completed: repositories.settings.get('onboarding.completed') === 'true'
  }));

  ipcMain.handle('onboarding:save', (_event, payload) => {
    repositories.collaboration.sync();
    const name = typeof payload?.name === 'string' ? payload.name.trim() : '';
    const role = typeof payload?.role === 'string' ? payload.role.trim() : '';
    const companyName = typeof payload?.companyName === 'string' ? payload.companyName.trim() : '';
    const companyCnpj = typeof payload?.companyCnpj === 'string' ? payload.companyCnpj.trim() : '';
    const taskTitle = typeof payload?.taskTitle === 'string' ? payload.taskTitle.trim() : '';

    if (!name || !role || !companyName || !companyCnpj || !taskTitle) {
      throw new Error('Nome, perfil, empresa, CNPJ e primeira tarefa sao obrigatorios.');
    }

    databaseContext.database.exec('BEGIN');
    try {
      const company = repositories.companies.create({ name: companyName, cnpj: companyCnpj });
      const task = repositories.tasks.create({ title: taskTitle, companyId: company.id });
      const actor = repositories.collaboration.getActor();
      databaseContext.database.prepare('UPDATE companies SET created_by_id = ?, created_by_name = ?, updated_by_id = ?, updated_by_name = ? WHERE id = ?').run(actor.id, actor.name, actor.id, actor.name, company.id);
      databaseContext.database.prepare('UPDATE tasks SET created_by_id = ?, created_by_name = ? WHERE id = ?').run(actor.id, actor.name, task.id);
      repositories.settings.save('profile.name', name);
      repositories.settings.save('profile.role', role);
      repositories.settings.save('onboarding.completed', 'true');
      databaseContext.database.exec('COMMIT');
      repositories.collaboration.publish();

      return { company, task };
    } catch (error) {
      databaseContext.database.exec('ROLLBACK');
      throw error;
    }
  });

  ipcMain.handle('dashboard:get-summary', () => { repositories.collaboration.sync(); return repositories.tasks.summary(); });
  ipcMain.handle('tasks:list', () => { repositories.collaboration.sync(); return repositories.tasks.list(); });
  ipcMain.handle('tasks:list-completed', () => { repositories.collaboration.sync(); return repositories.tasks.listCompleted(); });
  ipcMain.handle('companies:list', () => { repositories.collaboration.sync(); return repositories.companies.list(); });
  ipcMain.handle('companies:create', (_event, payload) => {
    repositories.collaboration.sync();
    const name = typeof payload?.name === 'string' ? payload.name.trim() : '';
    const cnpj = typeof payload?.cnpj === 'string' ? payload.cnpj.trim() : '';

    if (!name || !cnpj) {
      throw new Error('Informe o nome e o CNPJ da empresa.');
    }

    const company = repositories.companies.create({ name, cnpj });
    const actor = repositories.collaboration.getActor();
    databaseContext.database.prepare('UPDATE companies SET created_by_id = ?, created_by_name = ?, updated_by_id = ?, updated_by_name = ? WHERE id = ?').run(actor.id, actor.name, actor.id, actor.name, company.id);
    repositories.collaboration.publish();
    return company;
  });
  ipcMain.handle('companies:remove', (_event, companyId) => {
    repositories.collaboration.sync();
    if (typeof companyId !== 'string' || !companyId.trim()) {
      throw new Error('Empresa invalida.');
    }
    const company = repositories.companies.remove(companyId);
    repositories.collaboration.publish();
    return company;
  });
  ipcMain.handle('employees:list', (_event, filters) => { repositories.collaboration.sync(); return repositories.employees.list(filters || {}); });
  ipcMain.handle('employees:choose-file', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [
        { name: 'Arquivos de funcionários', extensions: ['pdf', 'txt', 'html', 'htm', 'csv', 'tsv', 'json'] },
        { name: 'Todos os arquivos', extensions: ['*'] }
      ]
    });
    return result.canceled ? null : result.filePaths[0];
  });
  ipcMain.handle('employees:parse-file', async (_event, filePath) => {
    if (typeof filePath !== 'string' || !filePath.trim()) throw new Error('Arquivo não informado.');
    return parseEmployeeFile(filePath);
  });
  ipcMain.handle('employees:import-batch', (_event, payload) => {
    repositories.collaboration.sync();
    const result = repositories.employees.importMany(payload || {});
    repositories.collaboration.publish();
    return result;
  });
  ipcMain.handle('employees:summary', () => { repositories.collaboration.sync(); return repositories.employees.summary(); });
  ipcMain.handle('employees:documents-list', (_event, employeeId) => {
    repositories.collaboration.sync();
    return repositories.employees.listDocuments(employeeId);
  });
  ipcMain.handle('employees:document-update', (_event, payload) => {
    repositories.collaboration.sync();
    const document = repositories.employees.updateDocument(payload || {});
    repositories.collaboration.publish();
    return document;
  });
  ipcMain.handle('employees:document-update-all', (_event, payload) => {
    repositories.collaboration.sync();
    const count = repositories.employees.updateDocumentForAll(payload || {});
    repositories.collaboration.publish();
    return { count };
  });
  ipcMain.handle('employees:status-update', (_event, payload) => {
    repositories.collaboration.sync();
    const employee = repositories.employees.updateEmploymentStatus(payload || {});
    repositories.collaboration.publish();
    return employee;
  });
  ipcMain.handle('salary-provision:export-pdf', async (_event, payload) => {
    if (!payload?.employeeName || !Array.isArray(payload.lines)) throw new Error('Calcule a provisão antes de gerar o PDF.');
    const result = await dialog.showSaveDialog({
      title: 'Salvar provisão de salário',
      defaultPath: `provisao-${String(payload.employeeName).replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'funcionario'}.pdf`,
      filters: [{ name: 'PDF', extensions: ['pdf'] }]
    });
    if (result.canceled || !result.filePath) return { canceled: true };
    const pdfWindow = new BrowserWindow({ show: false, webPreferences: { sandbox: true } });
    try {
      await pdfWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(salaryProvisionPdfHtml(payload))}`);
      const pdf = await pdfWindow.webContents.printToPDF({ printBackground: true, pageSize: 'A4' });
      require('node:fs').writeFileSync(result.filePath, pdf);
      return { canceled: false, filePath: result.filePath };
    } finally {
      if (!pdfWindow.isDestroyed()) pdfWindow.destroy();
    }
  });
  ipcMain.handle('employees:create', (_event, payload) => {
    repositories.collaboration.sync();
    const employee = repositories.employees.create(payload || {});
    repositories.collaboration.publish();
    return employee;
  });
  ipcMain.handle('employees:update', (_event, payload) => {
    repositories.collaboration.sync();
    const employee = repositories.employees.update(payload || {});
    repositories.collaboration.publish();
    return employee;
  });
  ipcMain.handle('employees:remove', (_event, employeeId) => {
    repositories.collaboration.sync();
    const employee = repositories.employees.remove(employeeId);
    repositories.collaboration.publish();
    return employee;
  });
  ipcMain.handle('vacations:list', (_event, filters) => { repositories.collaboration.sync(); return repositories.vacations.list(filters || {}); });
  ipcMain.handle('vacations:update', (_event, payload) => {
    repositories.collaboration.sync();
    const period = repositories.vacations.update(payload || {});
    repositories.collaboration.publish();
    return period;
  });
  ipcMain.handle('profile:get-state', async () => {
    let account = repositories.admissions.getAccount();
    const localName = repositories.settings.get('profile.name');
    if (account && (!account.displayName || !account.pictureUrl)) {
      try {
        account = await admissionsService.refreshProfile();
      } catch (error) {
        console.warn('Não foi possível atualizar o perfil Google:', error.message);
      }
    }
    if (account) return { displayName: account.displayName || localName, email: account.email, pictureUrl: account.pictureUrl };
    return localName ? { displayName: localName, email: null, pictureUrl: null } : null;
  });
  ipcMain.handle('profile:authorize-google', async () => {
    await admissionsService.authorize();
    const account = repositories.admissions.getAccount();
    return { displayName: account.displayName, email: account.email, pictureUrl: account.pictureUrl };
  });
  ipcMain.handle('support:send', async (_event, payload) => {
    const subject = typeof payload?.subject === 'string' ? payload.subject.trim() : '';
    const message = typeof payload?.message === 'string' ? payload.message.trim() : '';
    const sender = typeof payload?.sender === 'string' ? payload.sender.trim() : '';
    if (!subject || !message) throw new Error('Informe o assunto e a mensagem para o suporte.');
    const account = repositories.admissions.getAccount();
    const userName = account?.displayName || repositories.settings.get('profile.name') || 'Usuário não identificado';
    return admissionsService.sendSupportEmail({ subject, message, userName, sender });
  });
  ipcMain.handle('admissions:get-state', () => ({ account: repositories.admissions.getAccount() ? { email: repositories.admissions.getAccount().email } : null, forms: repositories.admissions.listForms() }));
  ipcMain.handle('admissions:authorize-google', () => admissionsService.authorize());
  ipcMain.handle('admissions:link-form', (_event, formUrl) => admissionsService.linkForm(formUrl));
  ipcMain.handle('admissions:sync', async (_event, formId) => {
    const form = repositories.admissions.getForm(formId);
    if (!form) throw new Error('Formulário de admissão não encontrado.');
    return admissionsService.syncForm(form);
  });
  ipcMain.handle('admissions:list-responses', (_event, formId) => repositories.admissions.listResponses(formId));
  ipcMain.handle('admissions:update-status', (_event, payload) => repositories.admissions.updateResponseStatus(payload?.responseId, payload?.status));
  ipcMain.handle('admissions:download-file', (_event, payload) => admissionsService.downloadFile(payload?.responseId, payload?.fileId, payload?.fileName));
  ipcMain.handle('tasks:create', (_event, payload) => {
    repositories.collaboration.sync();
    const title = typeof payload?.title === 'string' ? payload.title.trim() : '';
    const companyId = typeof payload?.companyId === 'string' ? payload.companyId : '';
    const priority = typeof payload?.priority === 'string' ? payload.priority : 'MEDIUM';
    const dueAt = typeof payload?.dueAt === 'string' && payload.dueAt ? payload.dueAt : null;
    const estimatedMinutes = Number.parseInt(payload?.estimatedMinutes, 10);
    const checklist = typeof payload?.checklist === 'string'
      ? payload.checklist.split('\n').map((title) => title.trim()).filter(Boolean).map((item) => ({ title: item }))
      : [];

    if (!title || !companyId) {
      throw new Error('Informe o título da tarefa e a empresa.');
    }
    if (!['LOW', 'MEDIUM', 'HIGH', 'URGENT'].includes(priority)) {
      throw new Error('Prioridade de tarefa invalida.');
    }

    const task = repositories.tasks.create({ title, companyId, priority, dueAt, estimatedMinutes: Number.isNaN(estimatedMinutes) ? null : estimatedMinutes, checklist });
    const actor = repositories.collaboration.getActor();
    databaseContext.database.prepare('UPDATE tasks SET created_by_id = ?, created_by_name = ? WHERE id = ?').run(actor.id, actor.name, task.id);
    databaseContext.database.prepare('UPDATE task_history SET metadata_json = ? WHERE task_id = ? AND event_type = ? AND metadata_json IS NULL').run(JSON.stringify({ actorId: actor.id, actorName: actor.name }), task.id, 'TASK_CREATED');
    repositories.collaboration.publish();
    return task;
  });
  ipcMain.handle('tasks:update-status', (_event, payload) => {
    repositories.collaboration.sync();
    const taskId = typeof payload?.taskId === 'string' ? payload.taskId : '';
    const status = typeof payload?.status === 'string' ? payload.status : '';
    const task = repositories.tasks.updateStatus(taskId, status);
    const actor = repositories.collaboration.getActor();
    if (status === 'DONE') {
      databaseContext.database.prepare('UPDATE tasks SET completed_by_id = ?, completed_by_name = ? WHERE id = ?').run(actor.id, actor.name, taskId);
    }
    databaseContext.database.prepare('INSERT INTO task_history (task_id, event_type, description, metadata_json, created_at) VALUES (?, ?, ?, ?, ?)').run(taskId, 'COLLABORATION', status === 'DONE' ? `Tarefa concluída por ${actor.name}` : `Status alterado por ${actor.name}`, JSON.stringify({ actorId: actor.id, actorName: actor.name, status }), new Date().toISOString());
    repositories.collaboration.publish();
    return task;
  });
  ipcMain.handle('tasks:get-details', (_event, taskId) => repositories.tasks.getDetails(taskId));
  ipcMain.handle('tasks:update-details', (_event, payload) => {
    repositories.collaboration.sync();
    const taskId = typeof payload?.taskId === 'string' ? payload.taskId : '';
    const description = typeof payload?.description === 'string' ? payload.description : '';
    const priority = typeof payload?.priority === 'string' ? payload.priority : 'MEDIUM';
    const dueAt = typeof payload?.dueAt === 'string' ? payload.dueAt : null;
    const estimatedMinutes = Number.parseInt(payload?.estimatedMinutes, 10);

    if (!taskId) {
      throw new Error('Tarefa invalida.');
    }

    const details = repositories.tasks.updateDetails({
      taskId,
      description,
      priority,
      dueAt,
      estimatedMinutes: Number.isNaN(estimatedMinutes) ? null : estimatedMinutes
    });
    repositories.collaboration.publish();
    return details;
  });
  ipcMain.handle('tasks:get-timer', (_event, taskId) => repositories.tasks.getTimer(taskId));
  ipcMain.handle('tasks:start-timer', (_event, taskId) => { repositories.collaboration.sync(); const result = repositories.tasks.startTimer(taskId); repositories.collaboration.publish(); return result; });
  ipcMain.handle('tasks:stop-timer', (_event, taskId) => { repositories.collaboration.sync(); const result = repositories.tasks.stopTimer(taskId); repositories.collaboration.publish(); return result; });
  ipcMain.handle('tasks:toggle-checklist-item', (_event, payload) => { repositories.collaboration.sync(); const result = repositories.tasks.toggleChecklistItem(payload?.taskId, payload?.checklistId, payload?.completed === true); repositories.collaboration.publish(); return result; });
  ipcMain.handle('templates:list', () => repositories.templates.list());
  ipcMain.handle('templates:create', (_event, payload) => {
    repositories.collaboration.sync();
    const name = typeof payload?.name === 'string' ? payload.name.trim() : '';
    const steps = Array.isArray(payload?.steps) ? payload.steps.filter((step) => typeof step === 'string' && step.trim()) : [];
    if (!name || !steps.length) throw new Error('Informe o nome e pelo menos uma etapa.');
    const template = repositories.templates.create(name, steps);
    repositories.collaboration.publish();
    return template;
  });
  ipcMain.handle('templates:instantiate', (_event, payload) => {
    repositories.collaboration.sync();
    const templateId = typeof payload?.templateId === 'string' ? payload.templateId : '';
    const companyId = typeof payload?.companyId === 'string' ? payload.companyId : '';
    if (!templateId || !companyId) throw new Error('Selecione um template e uma empresa.');
    const template = repositories.templates.getDetails(templateId);
    databaseContext.database.exec('BEGIN');
    try {
      const tasks = template.steps.map((step) => repositories.tasks.create({
        title: `${template.name}: ${step.title}`,
        companyId,
        estimatedMinutes: step.estimatedMinutes,
        checklist: [{ title: step.title }]
      }));
      databaseContext.database.exec('COMMIT');
      repositories.collaboration.publish();
      return { templateId, tasksCreated: tasks.length };
    } catch (error) {
      databaseContext.database.exec('ROLLBACK');
      throw error;
    }
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  if (databaseContext) {
    databaseContext.database.close();
  }
});
