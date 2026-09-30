async function loadSystemStatus() {
  const statusElement = document.querySelector('#system-status');

  try {
    const status = await window.dpFlow.system.getStatus();
    statusElement.textContent = `SQLite local conectado · migracao ${status.schemaVersion} aplicada`;
  } catch (error) {
    statusElement.textContent = 'Nao foi possivel verificar o banco local.';
    console.error('Falha ao consultar status do sistema:', error);
  }
}

let newsTimer;
let newsIndex = 0;

let dashboardNews = [];

function renderNewsSlide() {
  if (!dashboardNews.length) {
    document.querySelector('#news-counter').textContent = '-- / --';
    document.querySelector('#news-slide').innerHTML = '<div class="news-offline"><strong>Notícias indisponíveis no momento</strong><span>O feed será atualizado quando houver conexão.</span></div>';
    document.querySelector('#news-dots').innerHTML = '';
    return;
  }
  const item = dashboardNews[newsIndex];
  document.querySelector('#news-counter').textContent = `${String(newsIndex + 1).padStart(2, '0')} / ${dashboardNews.length}`;
  const image = item.image || 'https://images.unsplash.com/photo-1504711434969-e33886168f5c?auto=format&fit=crop&w=900&q=80';
  const date = item.publishedAt ? new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' }).format(new Date(item.publishedAt)) : '';
  document.querySelector('#news-slide').innerHTML = `<a class="news-feature" href="${item.url}" target="_blank" rel="noreferrer"><img src="${image}" alt="Imagem da notícia: ${escapeHtml(item.title)}" /><div class="news-feature-copy"><span>${item.category}${date ? ` · ${date}` : ''}</span><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.summary || 'Leia a atualização completa no Portal Contábeis.')}</p><small>${escapeHtml(item.source)} · ler matéria completa ↗</small></div></a>`;
  document.querySelector('#news-dots').innerHTML = dashboardNews.map((_, index) => `<button class="news-dot ${index === newsIndex ? 'active' : ''}" data-news-index="${index}" type="button" aria-label="Ir para notícia ${index + 1}"></button>`).join('');
  document.querySelectorAll('.news-dot').forEach((dot) => dot.addEventListener('click', () => {
    newsIndex = Number(dot.dataset.newsIndex);
    renderNewsSlide();
    restartNewsTimer();
  }));
}

function advanceNews(direction) {
  newsIndex = (newsIndex + direction + dashboardNews.length) % dashboardNews.length;
  renderNewsSlide();
  restartNewsTimer();
}

function restartNewsTimer() {
  clearInterval(newsTimer);
  newsTimer = setInterval(() => advanceNews(1), 8000);
}

async function setupNewsCarousel() {
  const result = await window.dpFlow.news.list();
  dashboardNews = result.items;
  renderNewsSlide();
  if (!dashboardNews.length) return;
  document.querySelector('#news-previous').addEventListener('click', () => advanceNews(-1));
  document.querySelector('#news-next').addEventListener('click', () => advanceNews(1));
  const carousel = document.querySelector('#news-carousel');
  carousel.addEventListener('mouseenter', () => clearInterval(newsTimer));
  carousel.addEventListener('mouseleave', restartNewsTimer);
  restartNewsTimer();
}

function getBrazilianHolidays(year) {
  return new Set([
    `${year}-01-01`, `${year}-04-21`, `${year}-05-01`, `${year}-09-07`,
    `${year}-10-12`, `${year}-11-02`, `${year}-11-15`, `${year}-11-20`, `${year}-12-25`
  ]);
}

function getFifthBusinessDay(year, month) {
  const date = new Date(year, month, 1);
  let businessDays = 0;
  while (businessDays < 5) {
    const dateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    if (date.getDay() !== 0 && !getBrazilianHolidays(date.getFullYear()).has(dateKey)) businessDays += 1;
    if (businessDays < 5) date.setDate(date.getDate() + 1);
  }
  return date;
}

function getPayrollGuideDueDate(year, month) {
  const date = new Date(year, month, 20);
  if (date.getDay() === 6) date.setDate(19);
  if (date.getDay() === 0) date.setDate(18);
  return date;
}

function renderDashboardIntel() {
  const now = new Date();
  let targetMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  let target = getFifthBusinessDay(targetMonth.getFullYear(), targetMonth.getMonth());
  const targetDay = new Date(target.getFullYear(), target.getMonth(), target.getDate());
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (today > targetDay) {
    targetMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    target = getFifthBusinessDay(targetMonth.getFullYear(), targetMonth.getMonth());
  }
  let guideMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  let guideDueDate = getPayrollGuideDueDate(guideMonth.getFullYear(), guideMonth.getMonth());
  if (today > guideDueDate) {
    guideMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    guideDueDate = getPayrollGuideDueDate(guideMonth.getFullYear(), guideMonth.getMonth());
  }
  document.querySelector('#current-date-label').textContent = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' }).format(now).toUpperCase();
  document.querySelector('#business-day-date').textContent = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' }).format(target);
  document.querySelector('#business-day-context').textContent = targetMonth.getMonth() === now.getMonth() ? 'Deste mês · referência para pagamentos' : 'Próximo mês · referência para pagamentos';
  const guideDateLabel = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' }).format(guideDueDate);
  document.querySelector('#fgts-due-date').textContent = guideDateLabel;
  document.querySelector('#inss-due-date').textContent = guideDateLabel;
}

function updateMetric(selector, value) {
  const element = document.querySelector(selector);
  if (element) {
    element.textContent = value;
  }
}

function renderProfile(profile) {
  const button = document.querySelector('#profile-button');
  const initials = document.querySelector('.profile-initials');
  const picture = document.querySelector('.profile-picture');
  if (!button || !initials || !picture) return;
  if (!profile) {
    button.title = 'Entrar com Google';
    button.setAttribute('aria-label', 'Entrar com Google');
    initials.textContent = 'DF';
    picture.removeAttribute('src');
    picture.classList.remove('visible');
    return;
  }
  const name = profile.displayName || profile.email || 'Usuário';
  initials.textContent = name.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
  button.title = profile.email ? `${name} · ${profile.email}` : name;
  button.setAttribute('aria-label', `Perfil de ${name}`);
  if (profile.pictureUrl) {
    picture.src = profile.pictureUrl;
    picture.classList.add('visible');
  }
}

function renderGreeting(profile) {
  const greeting = document.querySelector('#greeting-title');
  if (!greeting) return;
  const hour = new Date().getHours();
  const period = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite';
  const name = profile?.displayName?.split(/\s+/)[0];
  greeting.textContent = name ? `${period}, ${name}.` : `${period}.`;
}

async function setupProfile() {
  const initialProfile = await window.dpFlow.profile.getState();
  renderProfile(initialProfile);
  renderGreeting(initialProfile);
  document.querySelector('#profile-button').addEventListener('click', async () => {
    const current = await window.dpFlow.profile.getState();
    if (current) {
      showNotification(`${current.displayName || current.email} está conectado(a).`, { title: 'Conta Google' });
      return;
    }
    const button = document.querySelector('#profile-button');
    button.disabled = true;
    try {
      const profile = await window.dpFlow.profile.authorizeGoogle();
      renderProfile(profile);
      renderGreeting(profile);
      showNotification(`Conta ${profile.email} conectada.`, { title: 'Google conectado' });
      await loadAdmissionsState();
    } catch (error) {
      showNotification(error.message, { title: 'Não foi possível conectar', tone: 'error' });
    } finally {
      button.disabled = false;
    }
  });
}

function admissionCompany(response) {
  const answer = response.answers?.find((item) => /empresa|raz[aã]o social|empregador|contratante/i.test(item.title));
  return answer?.values?.[0]?.trim() || 'Empresa não informada';
}

function renderAdmissionCompanyFilter(responses) {
  const select = document.querySelector('#admission-company-filter');
  const current = select.value;
  const companies = [...new Set(responses.map(admissionCompany))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  select.innerHTML = '<option value="">Todas as empresas</option>' + companies.map((company) => `<option value="${escapeHtml(company)}">${escapeHtml(company)}</option>`).join('');
  select.value = companies.includes(current) ? current : '';
}

let collaborationTimer;

function renderCollaborationStatus(status) {
  const badge = document.querySelector('#collaboration-badge');
  const sidebarTitle = document.querySelector('#collaboration-sidebar-title');
  const sidebarStatus = document.querySelector('#collaboration-sidebar-status');
  const workspaceTitle = document.querySelector('#collaboration-workspace-title');
  const folderInput = document.querySelector('#collaboration-folder-path');
  const disconnectButton = document.querySelector('#disconnect-collaboration');
  const identityTitle = document.querySelector('#collaboration-identity-title');
  const identityInput = document.querySelector('#collaboration-name');
  if (!badge || !sidebarTitle || !sidebarStatus) return;
  const connected = status.connected;
  const actorName = status.actor?.name || 'Conta local';
  badge.textContent = connected ? `${status.members.length} conta${status.members.length === 1 ? '' : 's'}` : 'Modo local';
  sidebarTitle.textContent = connected ? `Equipe · ${actorName}` : 'Modo local';
  sidebarStatus.textContent = connected ? 'Sincronização ativa' : 'Dados protegidos neste dispositivo';
  workspaceTitle.textContent = connected ? 'Espaço conectado' : 'Nenhum espaço conectado';
  folderInput.value = status.workspacePath || '';
  identityTitle.textContent = actorName;
  identityInput.value = status.actor?.name === 'Conta local' ? '' : status.actor.name;
  disconnectButton.classList.toggle('hidden', !connected);
  const membersList = document.querySelector('#collaboration-members-list');
  membersList.innerHTML = connected ? status.members.map((member) => `<div class="collaboration-member"><span class="member-avatar">${escapeHtml((member.name || '?').slice(0, 1).toUpperCase())}</span><div><strong>${escapeHtml(member.name || 'Conta')}</strong><small>${member.id === status.actor.id ? 'Esta conta' : 'Membro do espaço'}</small></div></div>`).join('') : '<p class="empty-state">Conecte um espaço para ver os membros.</p>';
}

async function setupCollaboration() {
  const update = async () => renderCollaborationStatus(await window.dpFlow.collaboration.getStatus());
  await update();
  document.querySelector('#choose-collaboration-folder').addEventListener('click', async () => {
    const folder = await window.dpFlow.collaboration.chooseFolder();
    if (folder) document.querySelector('#collaboration-folder-path').value = folder;
  });
  document.querySelector('#collaboration-identity-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const error = document.querySelector('#collaboration-identity-error');
    error.textContent = '';
    try {
      await window.dpFlow.collaboration.setActor(new FormData(event.currentTarget).get('name'));
      await update();
      showNotification('Nome da conta atualizado.', { title: 'Colaboração' });
    } catch (requestError) { error.textContent = requestError.message; }
  });
  document.querySelector('#collaboration-workspace-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const error = document.querySelector('#collaboration-workspace-error');
    error.textContent = '';
    try {
      const values = Object.fromEntries(new FormData(event.currentTarget).entries());
      const status = await window.dpFlow.collaboration.connect({ folderPath: values.folderPath, name: document.querySelector('#collaboration-name').value });
      renderCollaborationStatus(status);
      await Promise.all([loadRecords(), loadDashboard()]);
      showNotification('Este dispositivo agora compartilha o espaço.', { title: 'Colaboração ativa' });
    } catch (requestError) { error.textContent = requestError.message; }
  });
  document.querySelector('#sync-collaboration').addEventListener('click', async () => {
    try {
      renderCollaborationStatus(await window.dpFlow.collaboration.sync());
      await Promise.all([loadRecords(), loadDashboard()]);
      showNotification('Dados atualizados.', { title: 'Sincronização concluída' });
    } catch (error) { showNotification(error.message, { title: 'Falha na sincronização', tone: 'error' }); }
  });
  document.querySelector('#disconnect-collaboration').addEventListener('click', async () => {
    renderCollaborationStatus(await window.dpFlow.collaboration.disconnect());
    showNotification('O espaço foi desconectado neste dispositivo.', { title: 'Modo local' });
  });
  clearInterval(collaborationTimer);
  collaborationTimer = setInterval(async () => {
    try {
      const status = await window.dpFlow.collaboration.sync();
      renderCollaborationStatus(status);
      await Promise.all([loadRecords(), loadDashboard()]);
    } catch (error) { console.warn('Sincronização colaborativa indisponível:', error.message); }
  }, 10000);
}

async function loadDashboard() {
  const [summary, employeeSummary] = await Promise.all([window.dpFlow.dashboard.getSummary(), window.dpFlow.employees.summary()]);
  updateMetric('[data-metric="overdue"]', summary.overdue);
  updateMetric('[data-metric="today"]', summary.dueToday);
  updateMetric('[data-metric="in-progress"]', summary.inProgress);
  updateMetric('[data-metric="experience-alerts"]', employeeSummary.experienceAlerts);
  updateMetric('[data-metric="vacation-alerts"]', employeeSummary.vacationAlerts);
}

function setupOnboarding() {
  const modal = document.querySelector('#onboarding-modal');
  const form = document.querySelector('#onboarding-form');
  const errorElement = document.querySelector('#onboarding-error');

  const setOpen = (open) => modal.classList.toggle('hidden', !open);
  document.querySelector('#open-onboarding').addEventListener('click', () => setOpen(true));
  document.querySelector('#close-onboarding').addEventListener('click', () => setOpen(false));

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    errorElement.textContent = '';
    const formData = new FormData(form);
    const payload = Object.fromEntries(formData.entries());

    try {
      await window.dpFlow.onboarding.save(payload);
      form.reset();
      setOpen(false);
      renderGreeting({ displayName: payload.name });
      document.querySelector('#next-step-title').textContent = 'Seu primeiro fluxo está criado.';
      document.querySelector('#open-onboarding').textContent = 'Adicionar outra rotina →';
      await loadDashboard();
    } catch (error) {
      errorElement.textContent = error.message || 'Nao foi possivel salvar os dados.';
    }
  });
}

function formatDate(dateValue) {
  if (!dateValue) return 'Sem prazo';
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' }).format(new Date(dateValue));
}

function renderTasks(tasks) {
  const list = document.querySelector('#task-list');
  const columns = [
    { status: 'BACKLOG', label: 'Backlog' },
    { status: 'TODO', label: 'A fazer' },
    { status: 'IN_PROGRESS', label: 'Em andamento' },
    { status: 'WAITING', label: 'Aguardando' },
  ];
  list.innerHTML = columns.map((column) => {
    const columnTasks = tasks.filter((task) => task.status === column.status);
    return `<section class="kanban-column" data-status="${column.status}"><header><strong>${column.label}</strong><span>${columnTasks.length}</span></header><div class="kanban-cards">${columnTasks.map((task) => `
      <article class="kanban-card" data-task-id="${task.id}" tabindex="0">
        <button class="kanban-title" data-task-id="${task.id}" type="button">${escapeHtml(task.title)}</button>
        <span class="kanban-company">${escapeHtml(task.companyName || 'Sem empresa')}</span>
        ${task.description ? `<p class="kanban-description">${escapeHtml(task.description)}</p>` : ''}
        <span class="kanban-date">Criada por ${escapeHtml(task.createdByName || 'Conta local')}</span>
        <span class="kanban-date">${formatDate(task.dueAt)}</span>
        <label class="kanban-move">Mover para<select data-task-id="${task.id}" class="task-status-select">
          ${columns.map((option) => `<option value="${option.status}" ${option.status === task.status ? 'selected' : ''}>${option.label}</option>`).join('')}
        </select></label>
      </article>
    `).join('') || '<p class="kanban-empty">Vazio</p>'}</div></section>`;
  }).join('');
}

function renderCompletedTasks(tasks) {
  const list = document.querySelector('#completed-task-list');
  list.innerHTML = tasks.length ? tasks.map((task) => `<article class="completed-task-row"><div><strong>${escapeHtml(task.title)}</strong><span>${escapeHtml(task.companyName || 'Sem empresa')} · concluída por ${escapeHtml(task.completedByName || 'Conta local')}</span></div><time>Concluída em ${formatDate(task.completedAt)}</time><button class="completed-task-reopen" data-task-id="${task.id}" type="button">Reabrir</button></article>`).join('') : '<p class="empty-state">Nenhuma tarefa concluída recentemente.</p>';
  list.querySelectorAll('.completed-task-reopen').forEach((button) => button.addEventListener('click', () => openTaskDetails(button.dataset.taskId)));
}

let agendaMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
let selectedAgendaDate = null;

function agendaDateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function renderAgendaCalendar(tasks) {
  const label = document.querySelector('#agenda-calendar-label');
  const grid = document.querySelector('#agenda-calendar-grid');
  const todayKey = agendaDateKey(new Date());
  const taskCounts = new Map();
  tasks.forEach((task) => {
    if (!task.dueAt) return;
    const key = agendaDateKey(new Date(task.dueAt));
    taskCounts.set(key, (taskCounts.get(key) || 0) + 1);
  });
  label.textContent = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(agendaMonth);
  const firstDay = agendaMonth.getDay();
  const daysInMonth = new Date(agendaMonth.getFullYear(), agendaMonth.getMonth() + 1, 0).getDate();
  const cells = [];
  for (let index = 0; index < firstDay; index += 1) cells.push('<span class="agenda-calendar-empty" aria-hidden="true"></span>');
  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = new Date(agendaMonth.getFullYear(), agendaMonth.getMonth(), day);
    const key = agendaDateKey(date);
    const count = taskCounts.get(key) || 0;
    cells.push(`<button class="agenda-calendar-day ${key === todayKey ? 'today' : ''} ${key === selectedAgendaDate ? 'selected' : ''}" data-agenda-date="${key}" type="button"><span>${day}</span>${count ? `<strong>${count}</strong>` : ''}</button>`);
  }
  grid.innerHTML = cells.join('');
  grid.querySelectorAll('.agenda-calendar-day').forEach((button) => button.addEventListener('click', () => {
    selectedAgendaDate = selectedAgendaDate === button.dataset.agendaDate ? null : button.dataset.agendaDate;
    renderAgenda(agendaTasks);
  }));
}

let agendaTasks = [];

function renderAgenda(tasks) {
  agendaTasks = tasks;
  renderAgendaCalendar(tasks);
  const list = document.querySelector('#agenda-list');
  const visibleTasks = selectedAgendaDate
    ? tasks.filter((task) => task.dueAt && agendaDateKey(new Date(task.dueAt)) === selectedAgendaDate)
    : [...tasks].sort((a, b) => (a.dueAt ? new Date(a.dueAt).getTime() : Number.POSITIVE_INFINITY) - (b.dueAt ? new Date(b.dueAt).getTime() : Number.POSITIVE_INFINITY));
  const label = selectedAgendaDate
    ? new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' }).format(new Date(`${selectedAgendaDate}T12:00:00`))
    : 'Todas as tarefas';
  list.innerHTML = visibleTasks.length ? `<section class="agenda-group"><header><strong>${label}</strong><span>${visibleTasks.length}</span></header>${visibleTasks.map((task) => `<button class="agenda-task" data-task-id="${task.id}" type="button"><span><strong>${escapeHtml(task.title)}</strong><small>${escapeHtml(task.companyName || 'Sem empresa')} · ${task.status.replace('_', ' ')}</small></span><time>${task.dueAt ? formatAgendaDate(task.dueAt) : 'Sem prazo'}</time></button>`).join('')}</section>` : `<p class="empty-state">${selectedAgendaDate ? 'Nenhuma tarefa para este dia.' : 'Nenhuma tarefa aberta na agenda.'}</p>`;
  list.querySelectorAll('.agenda-task').forEach((button) => button.addEventListener('click', () => openTaskDetails(button.dataset.taskId)));
}

function formatAgendaDate(dateValue) {
  return new Intl.DateTimeFormat('pt-BR', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(dateValue));
}

async function renderChecklistPage(tasks) {
  const list = document.querySelector('#checklist-page-list');
  const details = await Promise.all(tasks.map((task) => window.dpFlow.tasks.getDetails(task.id)));
  list.innerHTML = details.map(({ task, checklist }) => `
    <article class="checklist-task-row">
      <div><strong>${escapeHtml(task.title)}</strong><span>${escapeHtml(task.companyName || 'Sem empresa')} · ${checklist.filter((item) => item.completedAt).length}/${checklist.length} concluídas</span></div>
      <div class="checklist-page-items">${checklist.map((item) => `<label class="checklist-page-item"><input type="checkbox" data-task-id="${task.id}" data-checklist-id="${item.id}" ${item.completedAt ? 'checked' : ''} /><span>${escapeHtml(item.title)}</span></label>`).join('')}</div>
    </article>
  `).join('') || '<p class="empty-state">Nenhuma tarefa cadastrada.</p>';
  list.querySelectorAll('input[data-checklist-id]').forEach((input) => input.addEventListener('change', async (event) => {
    await window.dpFlow.tasks.toggleChecklistItem({ taskId: event.target.dataset.taskId, checklistId: event.target.dataset.checklistId, completed: event.target.checked });
    await Promise.all([loadRecords(), loadDashboard()]);
    await renderChecklistPage(await window.dpFlow.tasks.list());
  }));
}

function renderCompanies(companies) {
  const list = document.querySelector('#company-list');
  list.innerHTML = companies.length ? companies.map((company) => `
    <article class="record-row">
      <div class="record-icon company-icon">${escapeHtml(company.name.slice(0, 1).toUpperCase())}</div>
      <div class="record-main"><strong>${escapeHtml(company.name)}</strong><span>${company.cnpj || 'CNPJ não informado'}</span></div>
      <span class="company-count">${company.openTaskCount} pendente${company.openTaskCount === 1 ? '' : 's'}</span>
      <span class="record-date">${company.taskCount} tarefa${company.taskCount === 1 ? '' : 's'}</span>
      <button class="danger-button company-delete-button" type="button" data-company-id="${company.id}" data-company-name="${escapeHtml(company.name)}" data-task-count="${company.taskCount}">Excluir</button>
    </article>
  `).join('') : '<p class="empty-state">Nenhuma empresa cadastrada ainda.</p>';
  list.querySelectorAll('.company-delete-button').forEach((button) => button.addEventListener('click', async () => {
    const taskCount = Number(button.dataset.taskCount);
    const taskMessage = taskCount ? ` Isso também removerá ${taskCount} tarefa${taskCount === 1 ? '' : 's'} e seus históricos.` : '';
    const confirmed = window.confirm(`Excluir a empresa "${button.dataset.companyName}"?${taskMessage} Esta ação não pode ser desfeita.`);
    if (!confirmed) return;
    try {
      await window.dpFlow.companies.remove(button.dataset.companyId);
      showNotification(`A empresa "${button.dataset.companyName}" e seus dados vinculados foram removidos.`, { title: 'Empresa excluída' });
      await Promise.all([loadRecords(), loadDashboard()]);
    } catch (error) {
      showNotification(error.message, { title: 'Não foi possível excluir', tone: 'error' });
    }
  }));
}

function employeeDate(value) {
  if (!value) return 'Não informado';
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(`${value}T12:00:00`));
}

function employeeStatusLabel(employee) {
  if (employee.vacationStatus === 'OVERDUE') return ['vacation-alert', 'FÉRIAS VENCIDAS'];
  if (employee.vacationStatus === 'VACATION_WARNING') return ['vacation-warning', 'ATENÇÃO: férias vencem em até 60 dias'];
  if (employee.experienceStatus === 'SECOND_PERIOD_IN_PROGRESS') return ['experiencia-alert', '2º período de experiência em andamento'];
  if (employee.experienceStatus === 'SECOND_PERIOD_CONCLUDED') return ['experiencia-alert', '2º período de experiência concluído'];
  if (employee.experienceStatus === 'FIRST_PERIOD_CONCLUDED') return ['experiencia-alert', '1º período de experiência concluído'];
  if (employee.experienceStatus === 'IN_PROGRESS') return ['status-calm', '1º período de experiência em andamento'];
  if (employee.experienceStatus === 'CONCLUDED') return ['experiencia-alert', 'Experiência concluída'];
  if (employee.vacationStatus === 'AVAILABLE') return ['vacation-ready', 'Férias disponíveis'];
  if (employee.vacationStatus === 'TAKEN') return ['vacation-scheduled', 'Férias gozadas'];
  if (employee.vacationStatus === 'SCHEDULED') return ['vacation-scheduled', 'Férias programadas'];
  return ['status-calm', 'Em acompanhamento'];
}

function renderEmployeeSummary(summary) {
  document.querySelector('#employee-summary').innerHTML = `
    <article class="summary-filter" data-alert-filter=""><span>Total ativos</span><strong>${summary.total}</strong><small>Funcionários acompanhados</small></article>
    <article class="summary-warm summary-filter" data-alert-filter="experience"><span>Experiência para revisar</span><strong>${summary.experienceAlerts}</strong><small>1º período concluído</small></article>
    <article class="summary-teal summary-filter" data-alert-filter="vacation"><span>Férias para acompanhar</span><strong>${summary.vacationAlerts}</strong><small>Disponíveis ou em atraso</small></article>
    <article class="summary-coral summary-filter" data-alert-filter="overdue"><span>Férias em atraso</span><strong>${summary.overdueVacations}</strong><small>Exigem atenção prioritária</small></article>`;
  document.querySelectorAll('.summary-filter').forEach((card) => {
    card.tabIndex = 0;
    card.setAttribute('role', 'button');
    card.addEventListener('click', () => {
      document.querySelector('#employee-alert-filter').value = card.dataset.alertFilter;
      document.querySelector('#employee-status-filter').value = 'ACTIVE';
      loadEmployees();
    });
    card.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        card.click();
      }
    });
  });
}

function renderEmployees(employees) {
  const list = document.querySelector('#employee-list');
  list.innerHTML = employees.length ? employees.map((employee) => {
    const [statusClass, statusLabel] = employeeStatusLabel(employee);
    return `<article class="employee-row ${employee.vacationStatus === 'OVERDUE' ? 'employee-overdue' : employee.vacationStatus === 'VACATION_WARNING' ? 'employee-vacation-warning' : ''}">
      <div class="record-icon company-icon">${escapeHtml(employee.name.slice(0, 1).toUpperCase())}</div>
      <div class="employee-main"><strong>${escapeHtml(employee.name)}</strong><span>Vínculo: ${escapeHtml(employee.employmentCompanyName || employee.employmentCompanyOtherName || 'Outra empresa')}${employee.role ? ` · ${escapeHtml(employee.role)}` : ''}</span><small>Responsável: ${escapeHtml(employee.companyName)} · Admissão: ${employeeDate(employee.admissionDate)}${employee.cpf ? ` · CPF: ${escapeHtml(employee.cpf)}` : ''}</small>${employee.responsiblePhone || employee.responsibleEmail ? `<small>Contato: ${employee.responsiblePhone ? escapeHtml(employee.responsiblePhone) : ''}${employee.responsiblePhone && employee.responsibleEmail ? ' · ' : ''}${employee.responsibleEmail ? escapeHtml(employee.responsibleEmail) : ''}</small>` : ''}</div>
      <div class="employee-periods"><span class="${statusClass}">${statusLabel}</span><small>Experiência final: ${employeeDate(employee.experienceFinalEnd)}</small><small>Período aquisitivo vigente até: ${employeeDate(employee.acquisitionEnd)}</small><small>Prazo para conceder férias: ${employeeDate(employee.firstConcessionEnd)}</small></div>
      <div class="employee-actions"><button class="secondary-button employee-edit-button" type="button" data-employee-id="${employee.id}">Editar</button><button class="danger-button employee-delete-button" type="button" data-employee-id="${employee.id}" data-employee-name="${escapeHtml(employee.name)}">Excluir</button></div>
    </article>`;
  }).join('') : '<p class="empty-state">Nenhum funcionário encontrado com esses filtros.</p>';
  list.querySelectorAll('.employee-edit-button').forEach((button) => button.addEventListener('click', () => {
    const employee = employees.find((item) => item.id === button.dataset.employeeId);
    if (employee) window.dispatchEvent(new CustomEvent('dp-flow:edit-employee', { detail: employee }));
  }));
  list.querySelectorAll('.employee-delete-button').forEach((button) => button.addEventListener('click', async () => {
    if (!window.confirm(`Excluir o funcionário "${button.dataset.employeeName}"?`)) return;
    await window.dpFlow.employees.remove(button.dataset.employeeId);
    showNotification(`O funcionário "${button.dataset.employeeName}" foi removido.`, { title: 'Funcionário excluído' });
    await loadEmployees();
  }));
}

async function loadEmployees() {
  const filters = {
    companyId: document.querySelector('#employee-company-filter').value,
    search: document.querySelector('#employee-search').value.trim(),
    status: document.querySelector('#employee-status-filter').value,
    alertFilter: document.querySelector('#employee-alert-filter').value
  };
  const [employees, summary, companies] = await Promise.all([window.dpFlow.employees.list(filters), window.dpFlow.employees.summary(), window.dpFlow.companies.list()]);
  renderEmployeeSummary(summary);
  renderEmployees(employees);
  const companyOptions = companies.map((company) => `<option value="${company.id}">${escapeHtml(company.name)}</option>`).join('');
  document.querySelector('#employee-company-filter').innerHTML = '<option value="">Todas as empresas</option>' + companyOptions;
  document.querySelector('#employee-company-filter').value = filters.companyId;
  document.querySelector('#employee-company').innerHTML = companyOptions;
  document.querySelector('#employee-employment-company').innerHTML = `${companyOptions}<option value="__OTHER__">Outra empresa</option>`;
}

function vacationStatusLabel(status) {
  return { PENDING: 'Em aquisição', AVAILABLE: 'Disponível', SCHEDULED: 'Programada', TAKEN: 'Gozada', OVERDUE: 'Vencida' }[status] || status;
}

function renderVacationTable(periods) {
  const container = document.querySelector('#vacation-table-wrap');
  if (!periods.length) {
    container.innerHTML = '<p class="empty-state">Nenhum período encontrado para este funcionário.</p>';
    return;
  }
  container.innerHTML = `<div class="vacation-table-note">Altere a situação quando as férias já tiverem sido gozadas fora do DP Flow. Períodos vencidos aparecem automaticamente em vermelho.</div><table class="vacation-table"><thead><tr><th>Período aquisitivo</th><th>Prazo concessivo</th><th>Situação</th><th>Início do gozo</th><th>Fim do gozo</th><th>Dias</th><th>Observação</th><th></th></tr></thead><tbody>${periods.map((period) => `<tr class="${period.status === 'OVERDUE' ? 'vacation-row-overdue' : ''}">
    <td><strong>${employeeDate(period.acquisitionStart)}</strong><small>até ${employeeDate(period.acquisitionEnd)}</small></td>
    <td>${employeeDate(period.concessionEnd)}</td>
    <td><select data-vacation-field="status" data-vacation-id="${period.id}"><option value="PENDING" ${period.status === 'PENDING' ? 'selected' : ''}>Em aquisição</option><option value="AVAILABLE" ${period.status === 'AVAILABLE' ? 'selected' : ''}>Disponível</option><option value="SCHEDULED" ${period.status === 'SCHEDULED' ? 'selected' : ''}>Programada</option><option value="TAKEN" ${period.status === 'TAKEN' ? 'selected' : ''}>Gozada</option><option value="OVERDUE" ${period.status === 'OVERDUE' ? 'selected' : ''}>Vencida</option></select></td>
    <td><input type="date" value="${period.leaveStart || ''}" data-vacation-field="leaveStart" data-vacation-id="${period.id}" /></td><td><input type="date" value="${period.leaveEnd || ''}" data-vacation-field="leaveEnd" data-vacation-id="${period.id}" /></td><td><input class="vacation-days-input" type="number" min="0" max="30" value="${period.leaveDays ?? ''}" data-vacation-field="leaveDays" data-vacation-id="${period.id}" /></td><td><input value="${escapeHtml(period.notes || '')}" maxlength="300" placeholder="Observação" data-vacation-field="notes" data-vacation-id="${period.id}" /></td><td><button class="secondary-button vacation-save-button" type="button" data-vacation-id="${period.id}">Salvar</button></td></tr>`).join('')}</tbody></table>`;
  container.querySelectorAll('.vacation-save-button').forEach((button) => button.addEventListener('click', async () => {
    const id = button.dataset.vacationId;
    const values = {};
    container.querySelectorAll(`[data-vacation-id="${id}"]`).forEach((field) => { if (field.dataset.vacationField) values[field.dataset.vacationField] = field.value; });
    try {
      await window.dpFlow.vacations.update({ id, ...values });
      showNotification('Período de férias atualizado.', { title: 'Férias' });
      await loadVacationPeriods();
    } catch (error) { showNotification(error.message, { title: 'Não foi possível salvar', tone: 'error' }); }
  }));
}

async function loadVacationPeriods() {
  const employeeId = document.querySelector('#vacation-employee-select').value;
  const container = document.querySelector('#vacation-table-wrap');
  if (!employeeId) { container.innerHTML = '<p class="empty-state">Selecione um funcionário para visualizar a tabela de férias.</p>'; return; }
  renderVacationTable(await window.dpFlow.vacations.list({ employeeId }));
}

async function loadVacationEmployees() {
  const search = document.querySelector('#vacation-employee-search').value.trim();
  const companyId = document.querySelector('#vacation-company-filter').value;
  const [employees, companies] = await Promise.all([window.dpFlow.employees.list({ search, companyId, status: '' }), window.dpFlow.companies.list()]);
  const companyFilter = document.querySelector('#vacation-company-filter');
  const selectedCompany = companyFilter.value;
  companyFilter.innerHTML = '<option value="">Todas as empresas</option>' + companies.map((company) => `<option value="${company.id}">${escapeHtml(company.name)}</option>`).join('');
  companyFilter.value = selectedCompany;
  const select = document.querySelector('#vacation-employee-select');
  const selectedEmployee = select.value;
  select.innerHTML = '<option value="">Selecione um funcionário</option>' + employees.map((employee) => `<option value="${employee.id}">${escapeHtml(employee.name)} · ${escapeHtml(employee.companyName)}</option>`).join('');
  select.value = employees.some((employee) => employee.id === selectedEmployee) ? selectedEmployee : '';
  await loadVacationPeriods();
}

function renderExperienceTable(employees) {
  const container = document.querySelector('#experience-table-wrap');
  if (!employees.length) {
    container.innerHTML = '<p class="empty-state">Nenhum funcionário ativo encontrado.</p>';
    return;
  }
  container.innerHTML = `<table class="experience-table"><thead><tr><th>Funcionário</th><th>Admissão</th><th>1º período</th><th>Período final</th><th>Status</th><th></th></tr></thead><tbody>${employees.map((employee) => `<tr>
    <td><strong>${escapeHtml(employee.name)}</strong><small>${escapeHtml(employee.companyName)}</small></td>
    <td>${employeeDate(employee.admissionDate)}</td><td>${employeeDate(employee.experienceFirstEnd)}</td><td>${employeeDate(employee.experienceFinalEnd)}</td>
    <td><select data-experience-status="${employee.id}"><option value="IN_PROGRESS" ${employee.experienceStatus === 'IN_PROGRESS' ? 'selected' : ''}>1º período em andamento</option><option value="FIRST_PERIOD_CONCLUDED" ${employee.experienceStatus === 'FIRST_PERIOD_CONCLUDED' ? 'selected' : ''}>1º período concluído</option><option value="SECOND_PERIOD_IN_PROGRESS" ${employee.experienceStatus === 'SECOND_PERIOD_IN_PROGRESS' ? 'selected' : ''}>2º período em andamento</option><option value="SECOND_PERIOD_CONCLUDED" ${employee.experienceStatus === 'SECOND_PERIOD_CONCLUDED' ? 'selected' : ''}>2º período concluído</option><option value="CONCLUDED" ${employee.experienceStatus === 'CONCLUDED' ? 'selected' : ''}>Experiência concluída</option></select></td>
    <td><button class="secondary-button experience-save-button" type="button" data-employee-id="${employee.id}">Salvar</button></td></tr>`).join('')}</tbody></table>`;
  container.querySelectorAll('.experience-save-button').forEach((button) => button.addEventListener('click', async () => {
    const employee = employees.find((item) => item.id === button.dataset.employeeId);
    const experienceStatus = container.querySelector(`[data-experience-status="${employee.id}"]`).value;
    try {
      await window.dpFlow.employees.update({ ...employee, experienceStatus });
      showNotification(`Experiência de ${employee.name} atualizada.`, { title: 'Experiência' });
      await loadExperienceEmployees();
      await loadEmployees();
    } catch (error) { showNotification(error.message, { title: 'Não foi possível salvar', tone: 'error' }); }
  }));
}

async function loadExperienceEmployees() {
  renderExperienceTable(await window.dpFlow.employees.list({ status: 'ACTIVE' }));
}

const employeeDocumentTypes = [
  ['EPI', 'Ficha de EPI'], ['ASO', 'ASO'], ['NR12', 'NR12'], ['NR18', 'NR18'], ['NR35', 'NR35'], ['OS', 'Ordem de Serviço'], ['APR', 'APR']
];
const employeeDocumentDefaultValidity = { EPI: 6, ASO: 12, NR12: 12, NR18: 12, NR35: 12, OS: 12, APR: 12 };

function renderEmployeeDocuments(documents) {
  const container = document.querySelector('#document-table-wrap');
  const byType = new Map(documents.map((document) => [document.documentType, document]));
  container.innerHTML = `<table class="vacation-table employee-document-table"><thead><tr><th>Documento</th><th>Data do documento</th><th>Validade (meses)</th><th>Vencimento</th><th>Status</th><th>Observação</th><th></th></tr></thead><tbody>${employeeDocumentTypes.map(([type, label]) => {
    const document = byType.get(type) || { documentType: type, label, issuedDate: '', expiresAt: '', validityMonths: employeeDocumentDefaultValidity[type], status: 'MISSING_DATE', notes: '' };
    const statusLabel = { OVERDUE: 'VENCIDO', EXPIRING_SOON: 'VENCE EM ATÉ 7 DIAS', VALID: 'VÁLIDO', MISSING_DATE: 'PENDENTE' }[document.status];
    const rowClass = document.status === 'OVERDUE' ? 'employee-document-overdue' : document.status === 'EXPIRING_SOON' ? 'employee-document-warning' : '';
    return `<tr class="${rowClass}"><td><strong>${escapeHtml(label)}</strong><small>Prazo configurável pela empresa</small></td><td><input type="date" value="${escapeHtml(document.issuedDate || '')}" data-document-field="issuedDate" data-document-type="${type}" /></td><td><input class="document-validity-input" type="number" min="1" max="120" step="1" value="${escapeHtml(document.validityMonths || 12)}" data-document-field="validityMonths" data-document-type="${type}" /></td><td>${document.expiresAt ? employeeDate(document.expiresAt) : 'Não calculado'}</td><td><span class="document-status">${statusLabel}</span></td><td><input value="${escapeHtml(document.notes || '')}" maxlength="300" placeholder="Observação" data-document-field="notes" data-document-type="${type}" /></td><td class="document-actions"><button class="secondary-button document-save-all-button" type="button" data-document-type="${type}">Salvar para todos</button><button class="secondary-button document-save-button" type="button" data-document-type="${type}">Salvar</button></td></tr>`;
  }).join('')}</tbody></table>`;
  container.querySelectorAll('.document-save-button').forEach((button) => button.addEventListener('click', async () => {
    const type = button.dataset.documentType;
    const issuedDate = container.querySelector(`[data-document-field="issuedDate"][data-document-type="${type}"]`).value;
    const validityMonths = container.querySelector(`[data-document-field="validityMonths"][data-document-type="${type}"]`).value;
    const notes = container.querySelector(`[data-document-field="notes"][data-document-type="${type}"]`).value;
    const employeeId = document.querySelector('#document-employee-select').value;
    try {
      await window.dpFlow.employees.updateDocument({ employeeId, type, issuedDate, validityMonths, notes });
      showNotification('Documento atualizado.', { title: 'Documentação' });
      await loadEmployeeDocuments();
    } catch (error) { showNotification(error.message, { title: 'Não foi possível salvar', tone: 'error' }); }
  }));
  container.querySelectorAll('.document-save-all-button').forEach((button) => button.addEventListener('click', async () => {
    const type = button.dataset.documentType;
    const validityMonths = container.querySelector(`[data-document-field="validityMonths"][data-document-type="${type}"]`).value;
    if (!window.confirm('Aplicar este prazo para todos os funcionários cadastrados?')) return;
    try {
      const result = await window.dpFlow.employees.updateDocumentForAll({ type, validityMonths });
      showNotification(`Prazo aplicado para ${result.count} funcionário(s).`, { title: 'Documentação' });
      await loadEmployeeDocuments();
    } catch (error) { showNotification(error.message, { title: 'Não foi possível salvar', tone: 'error' }); }
  }));
}

async function loadEmployeeDocuments() {
  const employeeId = document.querySelector('#document-employee-select').value;
  const container = document.querySelector('#document-table-wrap');
  if (!employeeId) { container.innerHTML = '<p class="empty-state">Selecione um funcionário para visualizar a documentação.</p>'; return; }
  renderEmployeeDocuments(await window.dpFlow.employees.listDocuments(employeeId));
}

function renderDocumentEmployeeDirectory(employees) {
  const directory = document.querySelector('#document-employee-directory');
  const selectedEmployeeId = document.querySelector('#document-employee-select').value;
  if (selectedEmployeeId || !employees.length) {
    directory.innerHTML = '';
    return;
  }
  const sortedEmployees = [...employees].sort((left, right) => left.name.localeCompare(right.name, 'pt-BR', { sensitivity: 'base' }));
  directory.innerHTML = `<div class="document-directory-heading"><strong>Selecione um funcionário</strong><span>${sortedEmployees.length} cadastrado(s)</span></div><div class="document-directory-list">${sortedEmployees.map((employee) => `<button class="document-directory-item" type="button" data-document-directory-id="${employee.id}"><span class="record-icon company-icon">${escapeHtml(employee.name.slice(0, 1).toUpperCase())}</span><span><strong>${escapeHtml(employee.name)}</strong><small>${escapeHtml(employee.companyName)}${employee.role ? ` · ${escapeHtml(employee.role)}` : ''}</small></span><span class="document-directory-status ${employee.employmentStatus === 'INACTIVE' ? 'inactive' : ''}">${employee.employmentStatus === 'INACTIVE' ? 'Desligado' : 'Ativo'}</span></button>`).join('')}</div>`;
  directory.querySelectorAll('.document-directory-item').forEach((button) => button.addEventListener('click', () => {
    document.querySelector('#document-employee-select').value = button.dataset.documentDirectoryId;
    loadDocumentEmployees();
  }));
}

async function loadDocumentEmployees() {
  const search = document.querySelector('#document-employee-search').value.trim();
  const companyFilter = document.querySelector('#document-company-filter');
  const [employees, companies] = await Promise.all([window.dpFlow.employees.list({ search, companyId: companyFilter.value, status: '' }), window.dpFlow.companies.list()]);
  const selectedCompany = companyFilter.value;
  companyFilter.innerHTML = '<option value="">Todas as empresas</option>' + companies.map((company) => `<option value="${company.id}">${escapeHtml(company.name)}</option>`).join('');
  companyFilter.value = selectedCompany;
  const select = document.querySelector('#document-employee-select');
  const selectedEmployee = select.value;
  select.innerHTML = '<option value="">Selecione um funcionário</option>' + employees.map((employee) => `<option value="${employee.id}">${escapeHtml(employee.name)}</option>`).join('');
  select.value = employees.some((employee) => employee.id === selectedEmployee) ? selectedEmployee : '';
  const selected = employees.find((employee) => employee.id === select.value);
  const statusSelect = document.querySelector('#document-employee-status');
  const statusSave = document.querySelector('#document-status-save');
  const statusControls = document.querySelector('#document-status-controls');
  statusSelect.value = selected?.employmentStatus || 'ACTIVE';
  statusControls.classList.toggle('hidden', !selected);
  renderDocumentEmployeeDirectory(employees);
  await loadEmployeeDocuments();
}

function setupEmployeeDocuments() {
  document.querySelector('#document-back-to-employees').addEventListener('click', () => {
    document.querySelector('[data-employee-tab="overview"]').click();
  });
  document.querySelector('#document-employee-select').addEventListener('change', loadDocumentEmployees);
  document.querySelector('#document-company-filter').addEventListener('change', loadDocumentEmployees);
  document.querySelector('#document-status-save').addEventListener('click', async () => {
    const employeeId = document.querySelector('#document-employee-select').value;
    const employmentStatus = document.querySelector('#document-employee-status').value;
    if (!employeeId) return;
    try {
      await window.dpFlow.employees.updateStatus({ id: employeeId, employmentStatus });
      showNotification('Situação do funcionário atualizada.', { title: 'Documentação' });
      await Promise.all([loadDocumentEmployees(), loadEmployees(), loadCalculationEmployees()]);
    } catch (error) { showNotification(error.message, { title: 'Não foi possível salvar', tone: 'error' }); }
  });
  let timer;
  document.querySelector('#document-employee-search').addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(loadDocumentEmployees, 180); });
}

function setupEmployeeTabs() {
  const overview = document.querySelector('#employees-view');
  const vacations = document.querySelector('#vacations-view');
  const experience = document.querySelector('#experience-view');
  const documents = document.querySelector('#documents-view');
  document.querySelectorAll('[data-employee-tab]').forEach((tab) => tab.addEventListener('click', async () => {
    const selected = tab.dataset.employeeTab;
    overview.classList.toggle('hidden', selected !== 'overview');
    vacations.classList.toggle('hidden', selected !== 'vacations');
    experience.classList.toggle('hidden', selected !== 'experience');
    documents.classList.toggle('hidden', selected !== 'documents');
    document.querySelectorAll('[data-employee-tab]').forEach((item) => {
      const active = item === tab;
      item.classList.toggle('active', active);
      item.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    if (selected === 'vacations') await loadVacationEmployees();
    if (selected === 'experience') await loadExperienceEmployees();
    if (selected === 'documents') await loadDocumentEmployees();
  }));
}

function setupVacations() {
  document.querySelector('#vacation-employee-select').addEventListener('change', loadVacationPeriods);
  document.querySelector('#vacation-company-filter').addEventListener('change', loadVacationEmployees);
  let timer;
  document.querySelector('#vacation-employee-search').addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(loadVacationEmployees, 180); });
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
}

const taskProcessPresets = {
  admission: {
    title: 'Admissão',
    steps: ['Receber documentação', 'Conferir documentos', 'Cadastrar funcionário', 'Preparar documentação', 'Transmitir evento', 'Conferir retorno', 'Finalizar']
  },
  vacation: {
    title: 'Férias',
    steps: ['Solicitar período', 'Conferir período aquisitivo', 'Calcular', 'Gerar documentos', 'Enviar', 'Registrar', 'Finalizar']
  },
  termination: {
    title: 'Rescisão',
    steps: ['Receber solicitação', 'Conferir dados', 'Calcular', 'Gerar documentos', 'Transmitir eventos', 'Conferir retorno', 'Finalizar']
  },
  payroll: {
    title: 'Fechamento de folha',
    steps: ['Receber informações', 'Conferir ponto', 'Calcular folha', 'Revisar valores', 'Transmitir eventos', 'Conferir processamento', 'Finalizar']
  }
};

async function loadRecords() {
  const [tasks, completedTasks, companies] = await Promise.all([window.dpFlow.tasks.list(), window.dpFlow.tasks.listCompleted(), window.dpFlow.companies.list()]);
  renderTasks(tasks);
  renderCompletedTasks(completedTasks);
  renderAgenda(tasks);
  renderCompanies(companies);
  const companySelect = document.querySelector('#task-company');
  companySelect.innerHTML = companies.map((company) => `<option value="${company.id}">${escapeHtml(company.name)}</option>`).join('');
  document.querySelectorAll('.task-status-select').forEach((select) => select.addEventListener('change', async (event) => {
    try {
      await window.dpFlow.tasks.updateStatus({ taskId: event.target.dataset.taskId, status: event.target.value });
      await Promise.all([loadRecords(), loadDashboard()]);
    } catch (error) {
      console.error('Falha ao atualizar status:', error);
      await loadRecords();
    }
  }));
  document.querySelectorAll('.kanban-title').forEach((button) => button.addEventListener('click', () => openTaskDetails(button.dataset.taskId)));
  setupKanbanDrag();
}

let dragState;

function setupKanbanDrag() {
  document.querySelectorAll('.kanban-card').forEach((card) => card.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || event.target.closest('button, select, input, textarea')) return;
    const bounds = card.getBoundingClientRect();
    const clone = card.cloneNode(true);
    const placeholder = document.createElement('div');
    placeholder.className = 'kanban-placeholder';
    placeholder.style.height = `${bounds.height}px`;
    card.parentElement.insertBefore(placeholder, card);
    clone.classList.add('kanban-drag-ghost');
    clone.style.width = `${bounds.width}px`;
    clone.style.left = '0px';
    clone.style.top = '0px';
    clone.style.transform = `translate3d(${bounds.left}px, ${bounds.top}px, 0) rotate(1.5deg) scale(1.02)`;
    document.body.appendChild(clone);
    card.classList.add('kanban-card-source');
    dragState = {
      card,
      clone,
      placeholder,
      offsetX: event.clientX - bounds.left,
      offsetY: event.clientY - bounds.top,
      moved: false,
      target: null,
      frame: 0,
      pointerX: event.clientX,
      pointerY: event.clientY
    };
    document.addEventListener('pointermove', handleKanbanPointerMove);
    document.addEventListener('pointerup', handleKanbanPointerUp, { once: true });
    event.preventDefault();
  }));
}

function handleKanbanPointerMove(event) {
  if (!dragState) return;
  dragState.moved = true;
  dragState.pointerX = event.clientX;
  dragState.pointerY = event.clientY;
  if (!dragState.frame) dragState.frame = requestAnimationFrame(updateDragFrame);
}

function updateDragFrame() {
  if (!dragState) return;
  dragState.frame = 0;
  const x = dragState.pointerX - dragState.offsetX;
  const y = dragState.pointerY - dragState.offsetY;
  dragState.clone.style.transform = `translate3d(${x}px, ${y}px, 0) rotate(1.5deg) scale(1.02)`;
  const target = document.elementFromPoint(dragState.pointerX, dragState.pointerY)?.closest('.kanban-column');
  if (target === dragState.target) return;
  dragState.target?.classList.remove('kanban-drop-target');
  dragState.target = target;
  target?.classList.add('kanban-drop-target');
}

async function handleKanbanPointerUp(event) {
  if (!dragState) return;
  document.removeEventListener('pointermove', handleKanbanPointerMove);
  const state = dragState;
  dragState = null;
  if (state.frame) cancelAnimationFrame(state.frame);
  state.target?.classList.remove('kanban-drop-target');
  if (!state.moved) {
    state.clone.remove();
    state.placeholder.remove();
    state.card.classList.remove('kanban-card-source');
    openTaskDetails(state.card.dataset.taskId);
    return;
  }

  const target = document.elementFromPoint(event.clientX, event.clientY)?.closest('.kanban-column') || state.target;
  if (!target) {
    state.clone.classList.add('kanban-drop-reject');
    setTimeout(() => { state.clone.remove(); state.placeholder.remove(); state.card.classList.remove('kanban-card-source'); }, 180);
    return;
  }

  const targetBounds = target.getBoundingClientRect();
  const cloneBounds = state.clone.getBoundingClientRect();
  state.clone.style.transform = `translate3d(${targetBounds.left + (targetBounds.width - cloneBounds.width) / 2}px, ${targetBounds.top + 55}px, 0) rotate(0) scale(1)`;
  state.clone.classList.add('kanban-drop-snap');
  try {
    await window.dpFlow.tasks.updateStatus({ taskId: state.card.dataset.taskId, status: target.dataset.status });
    setTimeout(async () => {
      state.clone.remove();
      state.placeholder.remove();
      await Promise.all([loadRecords(), loadDashboard()]);
    }, 180);
  } catch (error) {
    console.error('Falha ao mover tarefa:', error);
    state.clone.remove();
    state.placeholder.remove();
    state.card.classList.remove('kanban-card-source');
  }
}

function toDateTimeLocal(dateValue) {
  if (!dateValue) return '';
  const date = new Date(dateValue);
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function renderTaskHistory(history) {
  const historyElement = document.querySelector('#task-history');
  historyElement.innerHTML = history.length ? history.map((entry) => `
    <div class="history-entry"><span>${new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(entry.createdAt))}</span><strong>${escapeHtml(entry.description)}</strong></div>
  `).join('') : '<p class="empty-state">Nenhum evento registrado.</p>';
}

function renderTaskChecklist(checklist) {
  const element = document.querySelector('#task-checklist');
  const completedCount = checklist.filter((item) => item.completedAt).length;
  element.innerHTML = checklist.length ? `<div class="checklist-progress"><span>${completedCount}/${checklist.length} etapas concluídas</span><span>${Math.round((completedCount / checklist.length) * 100)}%</span></div>${checklist.map((item) => `
    <label class="checklist-item ${item.completedAt ? 'completed' : ''}">
      <input type="checkbox" data-checklist-id="${item.id}" ${item.completedAt ? 'checked' : ''} />
      <span>${escapeHtml(item.title)}</span>
    </label>
  `).join('')}` : '<p class="empty-state">Nenhuma etapa vinculada.</p>';
  element.querySelectorAll('input[data-checklist-id]').forEach((input) => input.addEventListener('change', async (event) => {
    const updated = await window.dpFlow.tasks.toggleChecklistItem({
      taskId: document.querySelector('#task-detail-form').elements.taskId.value,
      checklistId: event.target.dataset.checklistId,
      completed: event.target.checked
    });
    renderTaskChecklist(updated.checklist);
    renderTaskHistory(updated.history);
    if (updated.task.status === 'DONE') {
      showNotification('Tarefa concluída automaticamente pelo checklist.');
      await Promise.all([loadRecords(), loadDashboard()]);
    } else if (!event.target.checked) {
      showNotification('Tarefa reaberta: ainda há etapas pendentes.');
      await Promise.all([loadRecords(), loadDashboard()]);
    }
  }));
}

let notificationTimeout;
let notificationExitTimeout;

function showNotification(message, { title = 'Atualização', tone = 'success' } = {}) {
  const element = document.querySelector('#app-notification');
  const titleElement = document.querySelector('#notification-title');
  const messageElement = document.querySelector('#notification-message');
  const progressElement = element.querySelector('.notification-progress span');
  clearTimeout(notificationTimeout);
  clearTimeout(notificationExitTimeout);
  titleElement.textContent = title;
  messageElement.textContent = message;
  element.dataset.tone = tone;
  element.classList.remove('notification-exit', 'hidden');
  element.classList.remove('notification-enter');
  void element.offsetWidth;
  element.classList.add('notification-enter');
  progressElement.style.animation = 'none';
  void progressElement.offsetWidth;
  progressElement.style.animation = 'notification-progress 4.2s linear forwards';
  const dismiss = () => {
    clearTimeout(notificationTimeout);
    element.classList.remove('notification-enter');
    element.classList.add('notification-exit');
    notificationExitTimeout = setTimeout(() => {
      element.classList.add('hidden');
      element.classList.remove('notification-exit');
    }, 240);
  };
  document.querySelector('#notification-close').onclick = dismiss;
  notificationTimeout = setTimeout(dismiss, 4200);
}

let timerInterval;
let currentTimer;

function formatDuration(totalSeconds) {
  const hours = Math.floor(totalSeconds / 3600).toString().padStart(2, '0');
  const minutes = Math.floor((totalSeconds % 3600) / 60).toString().padStart(2, '0');
  const seconds = Math.floor(totalSeconds % 60).toString().padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
}

function renderTimer(timer) {
  currentTimer = timer;
  const display = document.querySelector('#task-timer-display');
  const button = document.querySelector('#task-timer-toggle');
  if (!display || !button) return;
  const runningSeconds = timer.active ? Math.max(0, Math.floor((Date.now() - new Date(timer.active.startedAt).getTime()) / 1000)) : 0;
  display.textContent = formatDuration(timer.totalSeconds + runningSeconds);
  button.innerHTML = timer.active ? 'Pausar cronômetro <span>Ⅱ</span>' : 'Iniciar cronômetro <span>▶</span>';
}

function updateTimerDisplay() {
  if (!currentTimer?.active) return;
  const display = document.querySelector('#task-timer-display');
  const runningSeconds = Math.max(0, Math.floor((Date.now() - new Date(currentTimer.active.startedAt).getTime()) / 1000));
  display.textContent = formatDuration(currentTimer.totalSeconds + runningSeconds);
}

function startTimerTicker() {
  clearInterval(timerInterval);
  updateTimerDisplay();
  if (currentTimer?.active) timerInterval = setInterval(updateTimerDisplay, 250);
}

async function openTaskDetails(taskId) {
  const modal = document.querySelector('#task-detail-modal');
  const form = document.querySelector('#task-detail-form');
  const { task, history, evidence, checklist } = await window.dpFlow.tasks.getDetails(taskId);
  document.querySelector('#task-detail-title').textContent = task.title;
  document.querySelector('#task-detail-company').textContent = task.companyName || 'Sem empresa vinculada';
  document.querySelector('#task-detail-status').textContent = task.status === 'DONE' ? 'Concluída' : 'Status atual: ' + task.status;
  document.querySelector('#task-detail-status-toggle').textContent = task.status === 'DONE' ? 'Reabrir tarefa' : 'Concluir tarefa';
  document.querySelector('#task-detail-status-toggle').dataset.status = task.status;
  form.elements.taskId.value = task.id;
  form.elements.description.value = task.description || '';
  form.elements.priority.value = task.priority;
  form.elements.estimatedMinutes.value = task.estimatedMinutes || '';
  form.elements.dueAt.value = toDateTimeLocal(task.dueAt);
  renderTaskHistory(history);
  renderTaskChecklist(checklist);
  currentTimer = { ...(await window.dpFlow.tasks.getTimer(taskId)), taskId };
  renderTimer(currentTimer);
  startTimerTicker();
  const evidenceElement = document.querySelector('#task-history');
  if (evidence.length) {
    evidenceElement.insertAdjacentHTML('afterbegin', evidence.map((item) => `<div class="evidence-entry"><strong>Evidência ${escapeHtml(item.eventType)}</strong><span>${escapeHtml(item.source)} · confiança ${Math.round(item.confidence * 100)}%</span></div>`).join(''));
  }
  document.querySelector('#task-detail-error').textContent = '';
  modal.classList.remove('hidden');
}

function setupTaskDetails() {
  const modal = document.querySelector('#task-detail-modal');
  const form = document.querySelector('#task-detail-form');
  document.querySelector('#close-task-detail').addEventListener('click', () => {
    clearInterval(timerInterval);
    modal.classList.add('hidden');
  });
  document.querySelector('#task-timer-toggle').addEventListener('click', async () => {
    const taskId = form.elements.taskId.value;
    currentTimer.active ? await window.dpFlow.tasks.stopTimer(taskId) : await window.dpFlow.tasks.startTimer(taskId);
    currentTimer = { ...(await window.dpFlow.tasks.getTimer(taskId)), taskId };
    renderTimer(currentTimer);
    startTimerTicker();
  });
  document.querySelector('#task-detail-status-toggle').addEventListener('click', async (event) => {
    const taskId = form.elements.taskId.value;
    const nextStatus = event.currentTarget.dataset.status === 'DONE' ? 'TODO' : 'DONE';
    const error = document.querySelector('#task-detail-error');
    error.textContent = '';
    try {
      await window.dpFlow.tasks.updateStatus({ taskId, status: nextStatus });
      modal.classList.add('hidden');
      await Promise.all([loadRecords(), loadDashboard()]);
    } catch (requestError) {
      error.textContent = requestError.message;
    }
  });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const error = document.querySelector('#task-detail-error');
    error.textContent = '';
    try {
      await window.dpFlow.tasks.updateDetails(Object.fromEntries(new FormData(form).entries()));
      modal.classList.add('hidden');
      await Promise.all([loadRecords(), loadDashboard()]);
    } catch (requestError) {
      error.textContent = requestError.message;
    }
  });
}

function setupNavigation() {
  const views = document.querySelectorAll('.view');
  document.querySelectorAll('.nav-item').forEach((item) => item.addEventListener('click', async (event) => {
    event.preventDefault();
    const viewName = item.getAttribute('href').slice(1);
    const targetView = document.querySelector(`#${viewName}-view`);
    if (!targetView) return;
    views.forEach((view) => view.classList.toggle('hidden', view !== targetView));
    document.querySelectorAll('.nav-item').forEach((navItem) => navItem.classList.toggle('active', navItem === item));
    if (viewName === 'tasks' || viewName === 'calendar' || viewName === 'companies') {
      await loadRecords();
    }
    if (viewName === 'employees') await loadEmployees();
    if (viewName === 'calculations') await loadCalculationEmployees();
    if (viewName === 'admissions') await loadAdmissionsState();
  }));
}

function setupAgendaCalendar() {
  document.querySelector('#agenda-previous-month').addEventListener('click', () => {
    agendaMonth = new Date(agendaMonth.getFullYear(), agendaMonth.getMonth() - 1, 1);
    selectedAgendaDate = null;
    renderAgenda(agendaTasks);
  });
  document.querySelector('#agenda-next-month').addEventListener('click', () => {
    agendaMonth = new Date(agendaMonth.getFullYear(), agendaMonth.getMonth() + 1, 1);
    selectedAgendaDate = null;
    renderAgenda(agendaTasks);
  });
  document.querySelector('#agenda-today').addEventListener('click', () => {
    const today = new Date();
    agendaMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    selectedAgendaDate = agendaDateKey(today);
    renderAgenda(agendaTasks);
  });
  document.querySelector('#agenda-clear-filter').addEventListener('click', () => {
    selectedAgendaDate = null;
    renderAgenda(agendaTasks);
  });
}

let admissionResponses = [];
let allAdmissionResponses = [];
let admissionSyncTimer;

function renderAdmissionResponses(responses) {
  const list = document.querySelector('#admission-response-list');
  allAdmissionResponses = responses;
  renderAdmissionCompanyFilter(responses);
  const companyFilter = document.querySelector('#admission-company-filter').value;
  admissionResponses = companyFilter ? responses.filter((response) => admissionCompany(response) === companyFilter) : responses;
  list.innerHTML = admissionResponses.length ? admissionResponses.map((response, index) => {
    const firstAnswer = response.answers?.find((answer) => answer.values?.length)?.values?.[0] || 'Resposta sem nome identificado';
    const submitted = response.submittedAt ? formatAgendaDate(response.submittedAt) : 'Sem data';
    return `<button class="admission-response-item ${index === 0 ? 'active' : ''}" type="button" data-admission-index="${index}"><strong>${escapeHtml(firstAnswer)}</strong><span>${submitted}</span><small>${response.files.length} documento${response.files.length === 1 ? '' : 's'} · ${response.status}</small></button>`;
  }).join('') : '<p class="empty-state">Nenhuma resposta recebida ainda.</p>';
  list.querySelectorAll('[data-admission-index]').forEach((item) => item.addEventListener('click', () => {
    list.querySelectorAll('.admission-response-item').forEach((button) => button.classList.toggle('active', button === item));
    renderAdmissionDetail(admissionResponses[Number(item.dataset.admissionIndex)]);
  }));
  if (admissionResponses[0]) renderAdmissionDetail(admissionResponses[0]);
}

function renderAdmissionDetail(response) {
  const detail = document.querySelector('#admission-response-detail');
  if (!response) return;
  detail.innerHTML = `<div class="admission-detail-heading"><div><p class="eyebrow">RESPOSTA RECEBIDA</p><h3>${escapeHtml(response.answers?.[0]?.values?.[0] || 'Admissão sem nome identificado')}</h3><p class="form-hint">Enviada em ${response.submittedAt ? formatAgendaDate(response.submittedAt) : 'data não informada'}</p></div><select class="admission-status-select" data-response-id="${response.id}" aria-label="Status da admissão"><option value="NEW" ${response.status === 'NEW' ? 'selected' : ''}>Nova</option><option value="REVIEWING" ${response.status === 'REVIEWING' ? 'selected' : ''}>Em conferência</option><option value="PENDING" ${response.status === 'PENDING' ? 'selected' : ''}>Documentação pendente</option><option value="APPROVED" ${response.status === 'APPROVED' ? 'selected' : ''}>Aprovada</option><option value="ARCHIVED" ${response.status === 'ARCHIVED' ? 'selected' : ''}>Arquivada</option></select></div><div class="admission-answer-grid">${response.answers.map((answer) => `<div><span>${escapeHtml(answer.title)}</span><strong>${escapeHtml(answer.values.join(', ') || 'Não respondido')}</strong></div>`).join('')}</div><div class="admission-files"><p class="eyebrow">DOCUMENTOS ENVIADOS</p>${response.files.length ? response.files.map((file) => `<button class="admission-file" type="button" data-file-id="${escapeHtml(file.fileId)}" data-file-name="${escapeHtml(file.fileName)}" data-response-id="${response.id}"><span>↧</span><strong>${escapeHtml(file.fileName)}</strong><small>Baixar arquivo</small></button>`).join('') : '<p class="form-hint">Nenhum arquivo enviado nesta resposta.</p>'}</div>`;
  detail.querySelector('.admission-status-select')?.addEventListener('change', async (event) => {
    await window.dpFlow.admissions.updateStatus({ responseId: response.id, status: event.target.value });
    response.status = event.target.value;
    showNotification('Status da admissão atualizado.', { title: 'Admissão' });
  });
  detail.querySelectorAll('.admission-file').forEach((button) => button.addEventListener('click', async () => {
    try {
      const result = await window.dpFlow.admissions.downloadFile({ responseId: button.dataset.responseId, fileId: button.dataset.fileId, fileName: button.dataset.fileName });
      showNotification(`Arquivo salvo em ${result.path}.`, { title: 'Documento baixado' });
    } catch (error) {
      showNotification(error.message, { title: 'Não foi possível baixar', tone: 'error' });
    }
  }));
}

async function loadAdmissionResponses() {
  const formId = document.querySelector('#admission-form-select').value;
  if (!formId) return renderAdmissionResponses([]);
  const responses = await window.dpFlow.admissions.listResponses(formId);
  renderAdmissionResponses(responses);
}

async function loadAdmissionsState() {
  const state = await window.dpFlow.admissions.getState();
  const badge = document.querySelector('#admissions-account-badge');
  badge.textContent = state.account ? `Google · ${state.account.email}` : 'Google não conectado';
  document.querySelector('#google-account-card').classList.toggle('connected', Boolean(state.account));
  const select = document.querySelector('#admission-form-select');
  select.innerHTML = state.forms.length ? state.forms.map((form) => `<option value="${form.id}">${escapeHtml(form.title)}</option>`).join('') : '<option value="">Nenhum formulário vinculado</option>';
  await loadAdmissionResponses();
}

function setupAdmissions() {
  document.querySelector('#google-account-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const error = document.querySelector('#google-account-error');
    error.textContent = '';
    try {
      await window.dpFlow.admissions.authorizeGoogle();
      showNotification('Conta Google conectada.', { title: 'Google conectado' });
      renderProfile(await window.dpFlow.profile.getState());
      await loadAdmissionsState();
    } catch (requestError) { error.textContent = requestError.message; }
  });
  document.querySelector('#admission-form-link').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const error = document.querySelector('#admission-form-error');
    error.textContent = '';
    try {
      await window.dpFlow.admissions.linkForm(new FormData(event.currentTarget).get('formUrl'));
      form.reset();
      showNotification('Formulário vinculado com sucesso.', { title: 'Admissões' });
      await loadAdmissionsState();
    } catch (requestError) { error.textContent = requestError.message; }
  });
  document.querySelector('#admission-form-select').addEventListener('change', loadAdmissionResponses);
  document.querySelector('#admission-company-filter').addEventListener('change', () => renderAdmissionResponses(allAdmissionResponses));
  document.querySelector('#sync-admissions').addEventListener('click', async () => {
    const formId = document.querySelector('#admission-form-select').value;
    if (!formId) return;
    const status = document.querySelector('#admission-sync-status');
    status.textContent = 'Sincronizando respostas...';
    try {
      const result = await window.dpFlow.admissions.sync(formId);
      status.textContent = `${result.imported} resposta(s) lida(s) · agora`;
      await loadAdmissionsState();
    } catch (error) { status.textContent = error.message; }
  });
  loadAdmissionsState().catch((error) => { document.querySelector('#admission-sync-status').textContent = error.message; });
  clearInterval(admissionSyncTimer);
  admissionSyncTimer = setInterval(async () => {
    const formId = document.querySelector('#admission-form-select').value;
    if (!formId) return;
    try {
      await window.dpFlow.admissions.sync(formId);
      await loadAdmissionsState();
    } catch (error) {
      console.warn('Sincronização automática de admissões indisponível:', error.message);
    }
  }, 5 * 60 * 1000);
}

function setupSupport() {
  document.querySelector('#support-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const error = document.querySelector('#support-error');
    error.textContent = '';
    const payload = Object.fromEntries(new FormData(form).entries());
    try {
      await window.dpFlow.support.send(payload);
      form.reset();
      showNotification('A mensagem foi enviada diretamente para o suporte.', { title: 'Suporte' });
    } catch (requestError) {
      if (!/invalid_grant|insufficient authentication scopes|access_token_scope_insufficient/i.test(requestError.message || '')) {
        error.textContent = requestError.message;
        return;
      }
      try {
        showNotification('A autorização Google precisa da permissão do Gmail. Vamos reconectar sua conta.', { title: 'Reconectando Google' });
        await window.dpFlow.profile.authorizeGoogle();
        await window.dpFlow.support.send(payload);
        form.reset();
        showNotification('A mensagem foi enviada diretamente para o suporte.', { title: 'Suporte' });
      } catch (reauthorizationError) {
        error.textContent = `Não foi possível renovar a autorização Google: ${reauthorizationError.message}`;
      }
    }
  });
}

const contractModels = [
  { title: 'Prazo indeterminado', type: 'CLT · vínculo padrão', text: `CONTRATO PRAZO INDETERMINADO

Pelo presente instrumento particular de Contrato de Trabalho, a empresa [Empresa_Razao_social], com sede à [EndEmpresa_Logradouro], inscrita no CNPJ: [Empresa_CNPJ], denominada Empregadora. E o Sr.(a) [Funcionario_Nome], domiciliado à, [EndFuncionario], inscrito no CPF: [Funcionario_CPF], doravante designado Empregado, celebram o presente Contrato Individual de Trabalho, conforme legislação trabalhista em vigor, regido pelas cláusulas abaixo e demais disposições vigentes:

1 - O Empregado trabalhará para a Empregadora na função de [Contrato_Cargo], e mais as funções que vierem a ser objeto de ordens verbais, cartas ou avisos, segundo as necessidades da Empregadora desde que compatíveis com as suas atribuições.

2 - O local de trabalho situa-se O MESMO DA EMPRESA podendo a Empregadora, a qualquer tempo, transferir o Empregado a título temporário ou definitivo, tanto no âmbito da unidade para a qual foi admitido, como para outras, em qualquer localidade deste Estado ou de outro dentro do País, em conformidade com o parágrafo 1º do artigo 469 da Consolidação das Leis do Trabalho.

3 - A jornada de trabalho será de [Número] horas semanais, distribuídas conforme jornada descrita em ficha de registro, o EMPREGADO compromete-se em trabalhar com regime de compensação e de prorrogação de horas, conforme necessidade da EMPREGADORA observadas as formalidades legais vigentes.

4 - O Empregado perceberá a remuneração de R$: [Contrato_Salario], por Mês [Contrato_Salario_Extenso].

5 - O prazo deste contrato é INDETERMINADO, com início em [Contrato_Data_de_admissao].

6 - Além dos descontos previstos em Lei, reserva-se a Empregadora o direito de descontar do Empregado as importâncias correspondentes aos danos causados por ele, com fundamento no parágrafo 1º do artigo 462 da Consolidação das Leis do Trabalho.

7 - O Empregado fica ciente do Regulamento da Empresa e das Normas de Segurança que regulam suas atividades na Empregadora e se compromete a usar os equipamentos de segurança fornecidos, sob a pena de ser punido por falta grave, nos termos da Legislação vigente e demais disposições inerentes à segurança e medicina do trabalho.

8 - O contrato poderá ser rescindido:
- Por qualquer das partes, mediante aviso prévio de 30 (trinta) dias.
- Imediatamente, em caso de descumprimento das obrigações contratuais.

9 - CONFIDENCIALIDADE
As partes comprometem-se a manter sigilo sobre todas as informações confidenciais trocadas durante a vigência deste contrato, mesmo após sua rescisão.

E, por estarem assim justas e contratadas, firmam o presente instrumento em duas vias de igual teor e forma.

[EndEmpresa_Cidade], [Sistema_Contrato_Experiencia_Parte_2]

_________________________________________________________
[Funcionario_Nome]
CPF [Funcionario_CPF]

_________________________________________________________
[Empresa_Razao_social]
[Empresa_CNPJ]` },
  { title: 'Experiência', type: 'CLT · prazo determinado', text: `CONTRATO DE TRABALHO PARA FINS DE EXPERIÊNCIA

Pelo presente instrumento particular que entre si celebram, de um lado a empresa (RAZÃO SOCIAL) localizada em (END. EMPRESA), situada na cidade (MUN. EMP.), inscrita no CNPJ sob o número (CNPJ), neste ato denominada simplesmente EMPREGADORA, e de outro, o(a) Sr(a). (NOME FUNC.), inscrito no CPF sob o Nº: (CPF) doravante denominado EMPREGADO, firmam contrato individual de trabalho, em caráter de prazo determinado, mediante as seguintes condições:

1. DA FUNÇÃO E ATIVIDADES
O EMPREGADO é contratado para exercer a função de [Nome do Cargo], competindo-lhe executar todas as tarefas inerentes ao cargo, bem como as ordens e diretrizes repassadas pelo EMPREGADOR.

2. DO PRAZO DE EXPERIÊNCIA E PRORROGAÇÃO
Este contrato é firmado em caráter de experiência, conforme o artigo 443, § 2º, alínea "c" da CLT.

Vigência: Terá início em [Dia/Mês/Ano] e término previsto para [Dia/Mês/Ano], perfazendo o total de [Número, ex: 45] dias.

Prorrogação: O presente instrumento poderá ser prorrogado uma única vez por mútuo consentimento, desde que a soma total dos períodos não ultrapasse o limite legal de 90 (noventa) dias (Art. 445, parágrafo único da CLT).

3. DA JORNADA DE TRABALHO
A jornada de trabalho será de [Número] horas semanais, distribuídas conforme jornada descrita em ficha de registro, o EMPREGADO compromete-se em trabalhar com regime de compensação e de prorrogação de horas, conforme necessidade da EMPREGADORA observadas as formalidades legais vigentes.

4. DA REMUNERAÇÃO
Como contraprestação pelo trabalho, o EMPREGADOR pagará ao EMPREGADO o salário bruto mensal de R$ [Valor] ([Valor por Extenso]), sujeito aos descontos legais aplicáveis.

5. DA RESCISÃO ANTECIPADA E DA CLÁUSULA ASSECURATÓRIA DE DIREITO RECÍPROCO
Caso qualquer uma das partes resolva rescindir o presente contrato antes do prazo estipulado na Cláusula 6ª, aplicar-se-ão as regras dos artigos 479 e 480 da CLT:

Se a rescisão partir do EMPREGADOR sem justa causa, este pagará ao EMPREGADO, a título de indenização, metade da remuneração a que teria direito até o término do contrato.

Se a rescisão partir do EMPREGADO sem justa causa, este deverá indenizar o EMPREGADOR pelos prejuízos que desse fato lhe resultarem, limitada essa indenização ao valor que teria direito em caso de dispensa.

6. DA EFETIVAÇÃO DO CONTRATO
Se após o término do prazo de experiência (ou de sua prorrogação) o EMPREGADO continuar prestando serviços à empresa, este contrato passará a vigorar automaticamente como Contrato de Trabalho por Prazo Indeterminado, mantendo-se válidas todas as demais cláusulas.

E POR ESTAREM DE PLENO ACORDO, ASSINAM AMBAS AS PARTES, EM DUAS VIAS DE IGUAL TEOR.

[Cidade - UF], [Dia] de [Mês] de [Ano].

_______________________________________
EMPREGADOR (Nome da Empresa / Assinatura)

______________________________________
EMPREGADO (Nome Completo / Assinatura)` },
  { title: 'Prazo determinado', type: 'CLT · projeto ou período', text: `CONTRATO DE TRABALHO POR PRAZO DETERMINADO

Pelo presente instrumento particular que entre si celebram, de um lado a empresa (RAZÃO SOCIAL) localizada em (END. EMPRESA), situada na cidade (MUN. EMP.), inscrita no CNPJ sob o número (CNPJ), neste ato denominada simplesmente EMPREGADORA, e de outro, o(a) Sr(a). (NOME FUNC.), inscrito no CPF sob o Nº: (CPF) doravante denominado EMPREGADO, firmam contrato individual de trabalho, em caráter de prazo determinado, mediante as seguintes condições:

CLÁUSULA 1ª – DO OBJETO E DA FUNÇÃO
O EMPREGADO é contratado para exercer a função de [Nome do Cargo], obrigando-se a realizar os serviços inerentes a este cargo, bem como outras tarefas determinadas pelo EMPREGADOR que sejam compatíveis com a sua condição pessoal e profissional.

CLÁUSULA 2ª – DA JUSTIFICATIVA DA DETERMINAÇÃO DO PRAZO
O presente contrato é firmado por prazo determinado com base no artigo 443, § 2º, da CLT, justificando-se em razão de:

[ ] a) Serviço cuja natureza ou transitoriedade justifica a predeterminação do prazo (ex: instalação de novo sistema, projeto específico).
[ ] b) Atividade empresarial de caráter transitório (ex: pico sazonal de vendas/produção).
[ ] c) Substituição provisória de empregado afastado (ex: licença-maternidade/médica).

CLÁUSULA 3ª – DO LOCAL DE TRABALHO
O EMPREGADO prestará seus serviços no estabelecimento do EMPREGADOR situado em [Endereço do Local de Trabalho], ou em outro local determinado pela empresa, desde que compatível com as regras laborais.

CLÁUSULA 4ª – DA JORNADA DE TRABALHO
A jornada de trabalho será de [Número] horas semanais, distribuídas conforme jornada descrita em ficha de registro, o EMPREGADO compromete-se em trabalhar com regime de compensação e de prorrogação de horas, conforme necessidade da EMPREGADORA observadas as formalidades legais vigentes.

CLÁUSULA 5ª – DA REMUNERAÇÃO
Como contraprestação pelos serviços prestados, o EMPREGADOR pagará ao EMPREGADO o salário bruto mensal de R$ [Valor por Extenso] ([Valor em Números]), com os descontos legais previstos em lei.

CLÁUSULA 6ª – DA VIGÊNCIA E DA PRORROGAÇÃO
O presente contrato terá início em [Dia/Mês/Ano] e término previsto para [Dia/Mês/Ano], totalizando o período de [Número] dias.

Parágrafo Único: O presente contrato poderá ser prorrogado uma única vez por mútuo consentimento, desde que a soma dos períodos não ultrapasse o limite legal de 2 (dois) anos previsto no artigo 445 da CLT.

CLÁUSULA 7ª – DA RESCISÃO ANTECIPADA
Caso qualquer uma das partes resolva rescindir o presente contrato antes do prazo estipulado na Cláusula 6ª, aplicar-se-ão as regras dos artigos 479 e 480 da CLT:

Se a rescisão partir do EMPREGADOR sem justa causa, este pagará ao EMPREGADO, a título de indenização, metade da remuneração a que teria direito até o término do contrato.

Se a rescisão partir do EMPREGADO sem justa causa, este deverá indenizar o EMPREGADOR pelos prejuízos que desse fato lhe resultarem, limitada essa indenização ao valor que teria direito em caso de dispensa.

CLÁUSULA 8ª – CIÊNCIA
O EMPREGADO declara ter plena ciência de que este contrato possui prazo determinado e que, ao seu término, não haverá obrigação de continuidade do vínculo empregatício, salvo se houver nova contratação.

E POR ESTAREM DE PLENO ACORDO, ASSINAM AMBAS AS PARTES, EM DUAS VIAS DE IGUAL TEOR.

[Cidade - UF], [Dia] de [Mês] de [Ano].

EMPREGADOR (Nome da Empresa / Assinatura)

EMPREGADO (Nome Completo / Assinatura)` },
  { title: 'Trabalho intermitente', type: 'CLT · alternância de atividade', text: `CONTRATO INDIVIDUAL DE TRABALHO INTERMITENTE

Pelo presente instrumento particular de Contrato de Trabalho, a empresa [Empresa_Razao_social], com sede à [EndEmpresa_Logradouro], inscrita no CNPJ: [Empresa_CNPJ], denominada Empregadora. E o Sr.(a) [Funcionario_Nome], domiciliado à, [EndFuncionario], inscrito no CPF: [Funcionario_CPF], doravante designado Empregado, celebram o presente Contrato Individual de Trabalho, conforme legislação trabalhista em vigor, regido pelas cláusulas abaixo e demais disposições vigentes:

CLÁUSULA PRIMEIRA – DO OBJETO E DA NÃO CONTINUIDADE
O Empregado é contratado para exercer a função de [Nome do Cargo/Função], cujas atividades principais consistem em [Breve descrição das tarefas]. A prestação de serviços não será contínua, ocorrendo com alternância de períodos de atividade e de inatividade, determinados de acordo com a necessidade do Empregador.

CLÁUSULA SEGUNDA – DA CONVOCAÇÃO E DA ACEITAÇÃO
A convocação do Empregado para o trabalho será feita pelo Empregador por qualquer meio de comunicação eficaz (como e-mail, telefone ou mensagem de texto), com antecedência mínima de 3 (três) dias corridos.

§ 1º – O Empregado terá o prazo de 24 (vinte e quatro) horas para responder à convocação, sendo que o seu silêncio será considerado como recusa.

§ 2º – A recusa da convocação não descaracteriza o contrato de trabalho intermitente e não constitui ato de insubordinação ou justa causa.

CLÁUSULA TERCEIRA – DA REMUNERAÇÃO
O Empregador pagará ao Empregado o valor-hora de R$ [Valor por Extenso] por hora efetivamente trabalhada.

§ 1º – O valor-hora não poderá ser inferior ao valor horário do salário mínimo, nem inferior ao salário pago aos demais empregados da empresa que exerçam a mesma função.

§ 2º – Ao final de cada período de prestação de serviços, o Empregado receberá o pagamento imediato das seguintes parcelas:
I - Remuneração pelas horas trabalhadas;
II - Férias proporcionais com acréscimo de 1/3;
III - Décimo terceiro salário proporcional;
IV - Repouso semanal remunerado (DSR);
V - Adicionais legais aplicáveis (como noturno, insalubridade, se houver).

CLÁUSULA QUARTA – DO PERÍODO DE INATIVIDADE
O período de inatividade não é considerado tempo à disposição do Empregador, ou seja, o tempo de inatividade não é remunerado. Durante esse intervalo, o Empregado estará totalmente livre para prestar serviços a outros contratantes.

CLÁUSULA QUINTA – DOS ENCARGOS E RECIBO
O Empregador efetuará o recolhimento da contribuição previdenciária (INSS) e o depósito do FGTS com base nos valores pagos no mês, fornecendo ao Empregado os comprovantes do cumprimento dessas obrigações. O pagamento das parcelas da Cláusula Terceira será discriminado em recibo próprio.

CLÁUSULA SEXTA – DA VIGÊNCIA
Este contrato é celebrado por prazo [determinado / indeterminado], iniciando-se em [Data de Início].

CLÁUSULA SÉTIMA – DA EXTINÇÃO E RESCISÃO DO CONTRATO
O presente contrato de trabalho poderá ser extinto a qualquer momento, por iniciativa de qualquer uma das partes, mediante as seguintes condições e modalidades:

§ 1º – Da Inatividade: A ausência de convocação por parte do Empregador ou a recusa de chamados pelo Empregado, independentemente do período decorrido, não caracterizam a extinção automática do contrato de trabalho, mantendo-se o vínculo ativo até que haja manifestação formal de rescisão.

§ 2º – Da Dispensa Sem Justa Causa: Ocorrendo a rescisão por iniciativa do Empregador, sem justa causa, o Empregado terá direito ao aviso prévio (calculado com base na média dos valores recebidos no período contratual) e à indenização de 40% (quarenta por cento) sobre o saldo do FGTS, além do saque dos depósitos vinculados.

§ 3º – Do Pedido de Demissão: Ocorrendo a rescisão por iniciativa do Empregado, este deverá manifestar sua intenção por escrito com antecedência mínima de 30 (trinta) dias, sob pena de desconto do aviso prévio, caso não haja a dispensa do cumprimento pelo Empregador.

§ 4º – Do Acordo Mútuo: O contrato poderá ser extinto por mútuo acordo entre as partes, nos termos do art. 484-A da CLT, hipótese na qual o aviso prévio indenizado será pago pela metade (50%) e a multa rescisória do FGTS será devida no patamar de 20% (vinte por cento), permitindo-se o saque de até 80% do saldo do fundo de garantia, sem direito ao seguro-desemprego.

E, por estarem assim justas e contratadas, firmam o presente instrumento em duas vias de igual teor e forma.

[Cidade - UF], [Dia] de [Mês] de [Ano].

[Nome da Empresa / Empregador]
[Nome do Empregado]` }
];

function formatMoney(value) {
  return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function renderCalculationResult(targetId, lines, total) {
  const target = document.querySelector(`#${targetId}`);
  target.querySelector('.result-total strong').textContent = formatMoney(total);
  target.querySelector('.result-lines').innerHTML = lines.map((line) => `<div class="result-line"><span>${line.label}</span><strong>${formatMoney(line.value)}</strong></div>`).join('');
}

let calculationEmployees = [];

function monthsElapsedSince(value) {
  if (!value) return 0;
  const start = new Date(`${value}T12:00:00`);
  const today = new Date();
  return Math.min(12, Math.max(1, (today.getFullYear() - start.getFullYear()) * 12 + today.getMonth() - start.getMonth() + 1));
}

function populateCalculationEmployees() {
  const options = calculationEmployees.map((employee) => `<option value="${employee.id}">${escapeHtml(employee.name)} · ${escapeHtml(employee.companyName)}</option>`).join('');
  ['#termination-employee', '#vacation-employee', '#provision-employee'].forEach((selector) => {
    const select = document.querySelector(selector);
    if (select) select.innerHTML = `<option value="">${selector === '#provision-employee' ? 'Selecione um funcionário' : 'Simulação manual'}</option>${options}`;
  });
}

function applyCalculationEmployee(employeeId) {
  const employee = calculationEmployees.find((item) => item.id === employeeId);
  if (!employee) return;
  const termination = document.querySelector('#termination-form');
  const vacation = document.querySelector('#vacation-form');
  const provision = document.querySelector('#salary-provision-form');
  const salary = Number(employee.salaryBase) || 0;
  termination.elements.salary.value = salary;
  termination.elements.thirteenthMonths.value = monthsElapsedSince(employee.admissionDate);
  termination.elements.vacationMonths.value = monthsElapsedSince(employee.admissionDate);
  termination.elements.vacationOverdue.value = employee.vacationStatus === 'OVERDUE' ? 'yes' : 'no';
  vacation.elements.salary.value = salary;
  provision.elements.salary.value = salary;
}

async function loadCalculationEmployees() {
  calculationEmployees = await window.dpFlow.employees.list({ status: 'ACTIVE' });
  populateCalculationEmployees();
}

function setupContractsAndCalculations() {
  const modelList = document.querySelector('#contract-model-list');
  const previewTitle = document.querySelector('#contract-preview-title');
  const previewText = document.querySelector('#contract-preview-text');
  let latestSalaryProvision = null;
  modelList.innerHTML = contractModels.map((model, index) => `<button class="contract-model ${index === 0 ? 'active' : ''}" type="button" data-contract-index="${index}"><span class="contract-number">0${index + 1}</span><span><strong>${model.title}</strong><small>${model.type}</small></span><span class="contract-arrow">→</span></button>`).join('');
  const selectContract = (index) => {
    const model = contractModels[index];
    previewTitle.textContent = model.title;
    previewText.value = model.text;
    modelList.querySelectorAll('.contract-model').forEach((item) => item.classList.toggle('active', item.dataset.contractIndex === String(index)));
  };
  modelList.addEventListener('click', (event) => {
    const button = event.target.closest('[data-contract-index]');
    if (button) selectContract(button.dataset.contractIndex);
  });
  selectContract(0);
  document.querySelector('#copy-contract-model').addEventListener('click', async () => {
    await navigator.clipboard.writeText(previewText.value);
    showNotification('Texto copiado para a área de transferência.', { title: 'Modelo copiado' });
  });

  document.querySelectorAll('.calculation-tab').forEach((tab) => tab.addEventListener('click', () => {
    document.querySelectorAll('.calculation-tab').forEach((item) => item.classList.toggle('active', item === tab));
    document.querySelector('#termination-calculation').classList.toggle('hidden', tab.dataset.calculation !== 'termination');
    document.querySelector('#vacation-calculation').classList.toggle('hidden', tab.dataset.calculation !== 'vacation');
    document.querySelector('#salary-provision-calculation').classList.toggle('hidden', tab.dataset.calculation !== 'salary-provision');
  }));
  ['#termination-employee', '#vacation-employee', '#provision-employee'].forEach((selector) => document.querySelector(selector).addEventListener('change', (event) => applyCalculationEmployee(event.target.value)));
  document.querySelector('#termination-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget).entries());
    const salary = Number(values.salary);
    const balance = salary / 30 * Number(values.workedDays);
    const thirteenth = salary / 12 * Number(values.thirteenthMonths);
    const overdueVacation = values.vacationOverdue === 'yes' ? salary : 0;
    const proportionalVacation = salary / 12 * Number(values.vacationMonths);
    const vacation = overdueVacation + proportionalVacation;
    const vacationThird = vacation / 3;
    const notice = values.notice === 'yes' ? salary : values.notice === 'deducted' ? -salary : 0;
    const discounts = Number(values.discounts);
    const noticeLabel = values.notice === 'deducted' ? 'Aviso prévio descontado' : 'Aviso prévio indenizado';
    renderCalculationResult('termination-result', [{ label: 'Saldo de salário', value: balance }, { label: '13º proporcional', value: thirteenth }, { label: 'Férias vencidas', value: overdueVacation }, { label: 'Férias proporcionais', value: proportionalVacation }, { label: '1/3 de férias', value: vacationThird }, { label: noticeLabel, value: notice }, { label: 'Descontos', value: -discounts }], balance + thirteenth + vacation + vacationThird + notice - discounts);
  });
  document.querySelector('#vacation-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget).entries());
    const salary = Number(values.salary);
    const vacation = salary / 30 * Number(values.days);
    const bonus = salary / 30 * Number(values.bonusDays);
    const third = vacation / 3;
    const discounts = Number(values.discounts);
    renderCalculationResult('vacation-result', [{ label: 'Remuneração das férias', value: vacation }, { label: 'Abono pecuniário', value: bonus }, { label: '1/3 constitucional', value: third }, { label: 'Descontos', value: -discounts }], vacation + bonus + third - discounts);
  });
  document.querySelector('#salary-provision-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget).entries());
    const salary = Number(values.salary);
    const thirteenth = salary / 12;
    const vacation = salary / 12;
    const vacationThird = vacation / 3;
    const fgts = salary * Number(values.fgtsRate);
    const severanceFine = fgts * Number(values.severanceFineRate);
    const inss = salary * Number(values.inssRate);
    const rat = salary * Number(values.ratRate);
    const thirdParty = salary * Number(values.thirdPartyRate);
    const total = salary + thirteenth + vacation + vacationThird + fgts + severanceFine + inss + rat + thirdParty;
    const lines = [{ label: 'Salário base', value: salary }, { label: 'Provisão de 13º (1/12)', value: thirteenth }, { label: 'Provisão de férias (1/12)', value: vacation }, { label: '1/3 constitucional de férias', value: vacationThird }, { label: `FGTS (${Number(values.fgtsRate) * 100}%)`, value: fgts }, { label: `Multa rescisória do FGTS (${Number(values.severanceFineRate) * 100}% do FGTS)`, value: severanceFine }, { label: `INSS patronal (${Number(values.inssRate) * 100}%)`, value: inss }, { label: `RAT (${Number(values.ratRate) * 100}%)`, value: rat }, { label: `Terceiros (${Number(values.thirdPartyRate) * 100}%)`, value: thirdParty }];
    renderCalculationResult('salary-provision-result', lines, total);
    const employee = calculationEmployees.find((item) => item.id === values.employeeId);
    latestSalaryProvision = { employeeName: employee?.name || 'Funcionário não informado', cpf: employee?.cpf || '', companyName: employee?.companyName || '', admissionDate: employee?.admissionDate || '', lines: lines.map((line) => ({ label: line.label, value: formatMoney(line.value) })), total: formatMoney(total) };
    document.querySelector('#export-salary-provision-pdf').disabled = false;
  });
  document.querySelector('#export-salary-provision-pdf').addEventListener('click', async () => {
    if (!latestSalaryProvision) return;
    try {
      const result = await window.dpFlow.salaryProvision.exportPdf(latestSalaryProvision);
      if (!result.canceled) showNotification('PDF salvo com sucesso.', { title: 'Provisão registrada' });
    } catch (error) {
      showNotification(error.message || 'Não foi possível gerar o PDF.', { title: 'Erro ao gerar PDF', tone: 'error' });
    }
  });
  loadCalculationEmployees();
}

function renderEmployeeImportPreview(result) {
  const preview = document.querySelector('#employee-import-preview');
  const warningText = result.warnings.length ? `<p class="import-warning">${result.warnings.length} aviso(s): ${result.warnings.map((warning) => escapeHtml(`Linha ${warning.row}: ${warning.issue}`)).join(' · ')}</p>` : '';
  preview.innerHTML = `${warningText}<p class="form-hint">${result.candidates.length} funcionário(s) encontrado(s). Serão ignorados apenas CPFs já cadastrados ou repetidos.</p><div class="import-preview-table"><table><thead><tr><th>Nome</th><th>CPF</th><th>Admissão</th><th>Salário base</th><th>Cargo</th><th>Situação</th></tr></thead><tbody>${result.candidates.map((candidate) => `<tr><td>${escapeHtml(candidate.name)}</td><td>${escapeHtml(candidate.cpf)}</td><td>${employeeDate(candidate.admissionDate)}</td><td>${formatMoney(candidate.salaryBase)}</td><td>${escapeHtml(candidate.role || 'Não informado')}</td><td>${candidate.employmentStatus === 'ACTIVE' ? 'Ativo' : 'Inativo'}</td></tr>`).join('')}</tbody></table></div>`;
}

async function setupEmployeeImport() {
  const modal = document.querySelector('#employee-import-modal');
  const form = document.querySelector('#employee-import-form');
  const error = document.querySelector('#employee-import-error');
  const confirm = document.querySelector('#confirm-employee-import');
  let parsedResult = null;
  let selectedFile = '';

  async function loadImportCompanies(reportCompanyName = '') {
    const companies = await window.dpFlow.companies.list();
    const options = companies.map((company) => `<option value="${company.id}">${escapeHtml(company.name)}</option>`).join('');
    document.querySelector('#employee-import-company').innerHTML = '<option value="">Selecione uma empresa...</option>' + options;
    const reportOption = reportCompanyName ? `<option value="__REPORT_COMPANY__">${escapeHtml(reportCompanyName)} (empresa do relatório)</option>` : '';
    document.querySelector('#employee-import-employment-company').innerHTML = '<option value="">Mesma empresa responsável</option>' + reportOption + options;
  }

  document.querySelector('#import-employees-button').addEventListener('click', async () => {
    error.textContent = '';
    parsedResult = null;
    selectedFile = await window.dpFlow.employees.chooseFile();
    if (!selectedFile) return;
    document.querySelector('#employee-import-file-name').textContent = `Arquivo: ${selectedFile.split(/[/\\]/).pop()}`;
    document.querySelector('#employee-import-preview').innerHTML = '<p class="empty-state">Analisando o relatório...</p>';
    confirm.disabled = true;
    modal.classList.remove('hidden');
    try {
      parsedResult = await window.dpFlow.employees.parseFile(selectedFile);
      await loadImportCompanies(parsedResult.companyName);
      renderEmployeeImportPreview(parsedResult);
      confirm.disabled = false;
    } catch (requestError) {
      error.textContent = requestError.message;
    }
  });
  document.querySelector('#close-employee-import').addEventListener('click', () => modal.classList.add('hidden'));
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    error.textContent = '';
    if (!parsedResult) return;
    const values = Object.fromEntries(new FormData(form).entries());
    if (values.employmentCompanyId === '__REPORT_COMPANY__') {
      values.employmentCompanyId = '';
      values.employmentCompanyName = parsedResult.companyName;
    }
    confirm.disabled = true;
    try {
      const result = await window.dpFlow.employees.importBatch({ ...values, candidates: parsedResult.candidates });
      modal.classList.add('hidden');
      showNotification(`${result.imported.length} funcionário(s) importado(s)${result.skipped.length ? ` · ${result.skipped.length} ignorado(s)` : ''}.`, { title: 'Importação concluída' });
      await loadEmployees();
    } catch (requestError) {
      error.textContent = requestError.message;
      confirm.disabled = false;
    }
  });
}

function setupRecordForms() {
  let editingEmployeeId = '';
  const employeeForm = document.querySelector('#employee-form');
  const employeeFormContainer = document.querySelector('#employee-form-container');
  const employeeFormSubmit = document.querySelector('#employee-form-submit');
  const setOtherCompanyField = (value) => {
    const otherField = document.querySelector('#employee-other-company-field');
    const otherInput = document.querySelector('#employee-other-company');
    const isOther = value === '__OTHER__';
    otherField.classList.toggle('hidden', !isOther);
    otherInput.required = isOther;
  };
  document.querySelector('#open-task-form').addEventListener('click', () => document.querySelector('#task-form-container').classList.toggle('hidden'));
  document.querySelector('#open-company-form').addEventListener('click', () => document.querySelector('#company-form-container').classList.toggle('hidden'));
  document.querySelector('#open-employee-form').addEventListener('click', () => {
    editingEmployeeId = '';
    employeeForm.reset();
    document.querySelector('#employee-error').textContent = '';
    setOtherCompanyField(employeeForm.elements.employmentCompanyId.value);
    employeeFormSubmit.innerHTML = 'Salvar funcionário <span>→</span>';
    employeeFormContainer.classList.toggle('hidden');
  });
  document.querySelector('#employee-employment-company').addEventListener('change', (event) => {
    setOtherCompanyField(event.target.value);
    if (event.target.value !== '__OTHER__') document.querySelector('#employee-other-company').value = '';
  });
  window.addEventListener('dp-flow:edit-employee', (event) => {
    const employee = event.detail;
    editingEmployeeId = employee.id;
    Object.entries({ name: employee.name, cpf: employee.cpf, role: employee.role, salaryBase: employee.salaryBase || '', admissionDate: employee.admissionDate, employmentStatus: employee.employmentStatus, responsiblePhone: employee.responsiblePhone, responsibleEmail: employee.responsibleEmail, notes: employee.notes }).forEach(([field, value]) => { employeeForm.elements[field].value = value || ''; });
    const employmentCompany = employee.employmentCompanyId || '__OTHER__';
    employeeForm.elements.employmentCompanyId.value = employmentCompany;
    employeeForm.elements.employmentCompanyName.value = employee.employmentCompanyOtherName || '';
    employeeForm.elements.companyId.value = employee.companyId;
    setOtherCompanyField(employmentCompany);
    document.querySelector('#employee-error').textContent = '';
    employeeFormSubmit.innerHTML = 'Atualizar funcionário <span>→</span>';
    employeeFormContainer.classList.remove('hidden');
    employeeFormContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });
  document.querySelector('#task-process-preset').addEventListener('change', (event) => {
    const preset = taskProcessPresets[event.target.value];
    if (!preset) return;
    const form = document.querySelector('#task-form');
    form.elements.title.value = preset.title;
    form.elements.checklist.value = preset.steps.join('\n');
  });

  document.querySelector('#task-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const error = document.querySelector('#task-error');
    try {
      const createdTask = await window.dpFlow.tasks.create(Object.fromEntries(new FormData(form).entries()));
      form.reset();
      document.querySelector('#task-form-container').classList.add('hidden');
      showNotification(`A tarefa "${createdTask.title}" foi criada.`, { title: 'Nova tarefa' });
      await Promise.all([loadRecords(), loadDashboard()]);
    } catch (requestError) {
      error.textContent = requestError.message;
    }
  });

  document.querySelector('#company-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const error = document.querySelector('#company-error');
    error.textContent = '';
    try {
      const createdCompany = await window.dpFlow.companies.create(Object.fromEntries(new FormData(form).entries()));
      form.reset();
      document.querySelector('#company-form-container').classList.add('hidden');
      showNotification(`A empresa "${createdCompany.name}" foi cadastrada.`, { title: 'Empresa cadastrada' });
      await loadRecords();
    } catch (requestError) {
      error.textContent = requestError.message;
    }
  });

  employeeForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const error = document.querySelector('#employee-error');
    error.textContent = '';
    try {
      const payload = Object.fromEntries(new FormData(form).entries());
      if (payload.employmentCompanyId === '__OTHER__') {
        payload.employmentCompanyId = '';
      }
      const wasEditing = Boolean(editingEmployeeId);
      const employee = wasEditing
        ? await window.dpFlow.employees.update({ id: editingEmployeeId, ...payload })
        : await window.dpFlow.employees.create(payload);
      form.reset();
      employeeFormContainer.classList.add('hidden');
      editingEmployeeId = '';
      employeeFormSubmit.innerHTML = 'Salvar funcionário <span>→</span>';
      showNotification(`O funcionário "${employee.name}" foi ${wasEditing ? 'atualizado' : 'cadastrado'}.`, { title: wasEditing ? 'Funcionário atualizado' : 'Funcionário cadastrado' });
      await Promise.all([loadEmployees(), loadCalculationEmployees()]);
    } catch (requestError) {
      error.textContent = requestError.message;
    }
  });
  ['#employee-company-filter', '#employee-status-filter', '#employee-alert-filter'].forEach((selector) => document.querySelector(selector).addEventListener('change', loadEmployees));
  let employeeSearchTimer;
  document.querySelector('#employee-search').addEventListener('input', () => {
    clearTimeout(employeeSearchTimer);
    employeeSearchTimer = setTimeout(loadEmployees, 180);
  });


}

async function startDashboard() {
  renderDashboardIntel();
  await setupNewsCarousel();
  await loadSystemStatus();
  await loadDashboard();
  setupOnboarding();
  await setupProfile();
  await setupCollaboration();
  setupNavigation();
  setupAgendaCalendar();
  setupContractsAndCalculations();
  setupAdmissions();
  setupSupport();
  setupRecordForms();
  await setupEmployeeImport();
  setupVacations();
  setupEmployeeDocuments();
  setupEmployeeTabs();
  await loadEmployees();
  setupTaskDetails();
  await loadRecords();
}

startDashboard().catch((error) => console.error('Falha ao carregar dashboard:', error));
