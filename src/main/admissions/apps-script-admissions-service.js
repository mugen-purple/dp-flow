const fs = require('node:fs');
const path = require('node:path');

function createAppsScriptAdmissionsService({ repository, userDataPath }) {
  async function request(account, payload) {
    const response = await fetch(account.clientSecret, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, secret: account.refreshToken })
    });
    if (!response.ok) throw new Error(`Ponte do Google respondeu HTTP ${response.status}.`);
    const result = await response.json();
    if (result.error) throw new Error(result.error);
    return result;
  }

  function getFormId(value) {
    const match = String(value || '').match(/\/forms\/d\/([a-zA-Z0-9_-]+)/);
    return match ? match[1] : String(value || '').trim();
  }

  async function configure({ bridgeUrl, secret }) {
    if (!bridgeUrl || !/^https:\/\//i.test(bridgeUrl)) throw new Error('Informe a URL HTTPS da ponte Apps Script.');
    if (!secret || secret.length < 20) throw new Error('Use um segredo com pelo menos 20 caracteres.');
    return repository.saveAccount({ email: 'Ponte Apps Script', clientId: 'apps-script-bridge', clientSecret: bridgeUrl, refreshToken: secret });
  }

  async function linkForm(formUrl) {
    const formId = getFormId(formUrl);
    const account = repository.getAccount();
    if (!account || account.clientId !== 'apps-script-bridge') throw new Error('Configure a ponte Apps Script antes de vincular o formulário.');
    if (!formId) throw new Error('Informe o link ou ID do Google Forms.');
    const result = await request(account, { action: 'sync', formId });
    return repository.saveForm({ accountId: account.id, formId, formUrl: String(formUrl).startsWith('http') ? formUrl : `https://docs.google.com/forms/d/${formId}/edit`, title: result.title || 'Formulário de admissão' });
  }

  async function syncForm(formRecord) {
    const account = repository.getAccount();
    if (!account || account.clientId !== 'apps-script-bridge') throw new Error('Configure a ponte Apps Script antes de sincronizar.');
    const result = await request(account, { action: 'sync', formId: formRecord.formId });
    let imported = 0;
    for (const response of result.responses || []) {
      repository.saveResponse({ formId: formRecord.id, googleResponseId: response.responseId, submittedAt: response.createTime, answers: response.answers || [], files: response.files || [] });
      imported += 1;
    }
    repository.markSynced(formRecord.id);
    return { imported, form: repository.getForm(formRecord.id) };
  }

  async function downloadFile(responseId, fileId, fileName) {
    const account = repository.getAccount();
    const result = await request(account, { action: 'download', fileId });
    const targetDirectory = path.join(userDataPath, 'admissions-files');
    fs.mkdirSync(targetDirectory, { recursive: true });
    const safeName = String(fileName || result.fileName || fileId).replace(/[<>:"/\\|?*]+/g, '_');
    const targetPath = path.join(targetDirectory, `${responseId}-${safeName}`);
    fs.writeFileSync(targetPath, Buffer.from(result.base64, 'base64'));
    return { path: targetPath, fileName: safeName };
  }

  return { configure, linkForm, syncForm, downloadFile };
}

module.exports = { createAppsScriptAdmissionsService };
