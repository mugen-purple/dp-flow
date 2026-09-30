const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('dpFlow', {
  system: {
    getStatus: () => ipcRenderer.invoke('system:get-status')
  },
  collaboration: {
    getStatus: () => ipcRenderer.invoke('collaboration:get-status'),
    setActor: (name) => ipcRenderer.invoke('collaboration:set-actor', name),
    chooseFolder: () => ipcRenderer.invoke('collaboration:choose-folder'),
    connect: (payload) => ipcRenderer.invoke('collaboration:connect', payload),
    disconnect: () => ipcRenderer.invoke('collaboration:disconnect'),
    sync: () => ipcRenderer.invoke('collaboration:sync')
  },
  files: {
    getPath: (file) => webUtils.getPathForFile(file)
  },
  onboarding: {
    getState: () => ipcRenderer.invoke('onboarding:get-state'),
    save: (payload) => ipcRenderer.invoke('onboarding:save', payload)
  },
  dashboard: {
    getSummary: () => ipcRenderer.invoke('dashboard:get-summary')
  },
  news: {
    list: () => ipcRenderer.invoke('news:list')
  },
  profile: {
    getState: () => ipcRenderer.invoke('profile:get-state'),
    authorizeGoogle: () => ipcRenderer.invoke('profile:authorize-google')
  },
  support: {
    send: (payload) => ipcRenderer.invoke('support:send', payload)
  },
  tasks: {
    list: () => ipcRenderer.invoke('tasks:list'),
    listCompleted: () => ipcRenderer.invoke('tasks:list-completed'),
    create: (payload) => ipcRenderer.invoke('tasks:create', payload),
    updateStatus: (payload) => ipcRenderer.invoke('tasks:update-status', payload),
    getDetails: (taskId) => ipcRenderer.invoke('tasks:get-details', taskId),
    updateDetails: (payload) => ipcRenderer.invoke('tasks:update-details', payload),
    getTimer: (taskId) => ipcRenderer.invoke('tasks:get-timer', taskId),
    startTimer: (taskId) => ipcRenderer.invoke('tasks:start-timer', taskId),
    stopTimer: (taskId) => ipcRenderer.invoke('tasks:stop-timer', taskId),
    toggleChecklistItem: (payload) => ipcRenderer.invoke('tasks:toggle-checklist-item', payload)
  },
  companies: {
    list: () => ipcRenderer.invoke('companies:list'),
    create: (payload) => ipcRenderer.invoke('companies:create', payload),
    remove: (companyId) => ipcRenderer.invoke('companies:remove', companyId)
  },
  employees: {
    list: (filters) => ipcRenderer.invoke('employees:list', filters),
    chooseFile: () => ipcRenderer.invoke('employees:choose-file'),
    parseFile: (filePath) => ipcRenderer.invoke('employees:parse-file', filePath),
    importBatch: (payload) => ipcRenderer.invoke('employees:import-batch', payload),
    summary: () => ipcRenderer.invoke('employees:summary'),
    listDocuments: (employeeId) => ipcRenderer.invoke('employees:documents-list', employeeId),
    updateDocument: (payload) => ipcRenderer.invoke('employees:document-update', payload),
    updateDocumentForAll: (payload) => ipcRenderer.invoke('employees:document-update-all', payload),
    updateStatus: (payload) => ipcRenderer.invoke('employees:status-update', payload),
    create: (payload) => ipcRenderer.invoke('employees:create', payload),
    update: (payload) => ipcRenderer.invoke('employees:update', payload),
    remove: (employeeId) => ipcRenderer.invoke('employees:remove', employeeId)
  },
  salaryProvision: {
    exportPdf: (payload) => ipcRenderer.invoke('salary-provision:export-pdf', payload)
  },
  vacations: {
    list: (filters) => ipcRenderer.invoke('vacations:list', filters),
    update: (payload) => ipcRenderer.invoke('vacations:update', payload)
  },
  admissions: {
    getState: () => ipcRenderer.invoke('admissions:get-state'),
    authorizeGoogle: () => ipcRenderer.invoke('admissions:authorize-google'),
    linkForm: (formUrl) => ipcRenderer.invoke('admissions:link-form', formUrl),
    sync: (formId) => ipcRenderer.invoke('admissions:sync', formId),
    listResponses: (formId) => ipcRenderer.invoke('admissions:list-responses', formId),
    updateStatus: (payload) => ipcRenderer.invoke('admissions:update-status', payload),
    downloadFile: (payload) => ipcRenderer.invoke('admissions:download-file', payload)
  },
  templates: {
    list: () => ipcRenderer.invoke('templates:list'),
    create: (payload) => ipcRenderer.invoke('templates:create', payload),
    instantiate: (payload) => ipcRenderer.invoke('templates:instantiate', payload)
  }
});
