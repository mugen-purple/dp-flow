const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { google } = require('googleapis');
const oauthConfig = require('../config/google-oauth');

const CALLBACK_HOST = 'localhost';
const CALLBACK_PORT = 42813;
const CALLBACK_URL = `http://${CALLBACK_HOST}:${CALLBACK_PORT}/oauth2callback`;
const SCOPES = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/forms.body.readonly',
  'https://www.googleapis.com/auth/forms.responses.readonly',
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/gmail.send'
];

function createGoogleOAuthAdmissionsService({ repository, userDataPath, openExternal }) {
  let oauthServer;

  function profileData(user) {
    return { displayName: user.data.name, pictureUrl: user.data.picture, email: user.data.email };
  }

  function validateConfig() {
    if (!oauthConfig.clientId || oauthConfig.clientId.includes('COLE_SEU_') || !oauthConfig.clientSecret || oauthConfig.clientSecret.includes('COLE_SEU_')) {
      throw new Error('O responsável técnico ainda precisa configurar as credenciais Google do DP Flow.');
    }
  }

  function createClient(clientId = oauthConfig.clientId, clientSecret = oauthConfig.clientSecret) {
    return new google.auth.OAuth2(clientId, clientSecret, CALLBACK_URL);
  }

  async function authorize() {
    validateConfig();
    const client = createClient();
    const authorizationUrl = client.generateAuthUrl({ access_type: 'offline', prompt: 'consent', scope: SCOPES });
    if (oauthServer) throw new Error('Já existe uma autorização Google em andamento.');

    const code = await new Promise((resolve, reject) => {
      oauthServer = http.createServer((request, response) => {
        const url = new URL(request.url, CALLBACK_URL);
        if (url.pathname !== '/oauth2callback') return;
        if (url.searchParams.get('error')) {
          response.end('Autorização cancelada. Você pode fechar esta janela.');
          reject(new Error(`Autorização Google cancelada: ${url.searchParams.get('error')}`));
          return;
        }
        response.end('Google autorizado. Você pode fechar esta janela e voltar ao DP Flow.');
        resolve(url.searchParams.get('code'));
      });
      oauthServer.once('error', (error) => reject(new Error(`Não foi possível iniciar o retorno do Google: ${error.message}`)));
      oauthServer.listen(CALLBACK_PORT, CALLBACK_HOST, () => openExternal(authorizationUrl));
    }).finally(() => {
      oauthServer?.close();
      oauthServer = null;
    });

    if (!code) throw new Error('O Google não retornou o código de autorização.');
    const { tokens } = await client.getToken(code);
    client.setCredentials(tokens);
    const user = await google.oauth2({ version: 'v2', auth: client }).userinfo.get();
    if (!tokens.refresh_token) throw new Error('O Google não forneceu refresh token. Remova o acesso antigo do DP Flow e tente novamente.');
    const profile = profileData(user);
    return repository.saveAccount({ ...profile, clientId: oauthConfig.clientId, clientSecret: oauthConfig.clientSecret, refreshToken: tokens.refresh_token });
  }

  async function getAuthorizedClient() {
    validateConfig();
    const account = repository.getAccount();
    if (!account || account.clientId !== oauthConfig.clientId) throw new Error('Conecte uma conta Google antes de continuar.');
    const client = createClient(account.clientId, account.clientSecret);
    client.setCredentials({ refresh_token: account.refreshToken });
    return client;
  }

  async function refreshProfile() {
    const client = await getAuthorizedClient();
    const user = await google.oauth2({ version: 'v2', auth: client }).userinfo.get();
    return repository.updateAccountProfile(profileData(user));
  }

  async function getFormId(value) {
    const input = String(value || '').trim();
    if (!input) return '';
    if (/^[a-zA-Z0-9_-]+$/.test(input)) return input;

    let currentUrl = input;
    for (let redirect = 0; redirect < 5; redirect += 1) {
      const match = currentUrl.match(/\/forms\/d\/(?:e\/)?([a-zA-Z0-9_-]+)/i) || currentUrl.match(/\/d\/e\/([a-zA-Z0-9_-]+)/i);
      if (match) return match[1];

      let parsedUrl;
      try {
        parsedUrl = new URL(currentUrl);
      } catch {
        throw new Error('Cole um link válido do Google Forms ou o ID do formulário.');
      }
      if (parsedUrl.hostname !== 'forms.gle') {
        throw new Error('Não encontrei o ID nesse link. Use o link de edição, compartilhamento ou resposta do Google Forms.');
      }
      const response = await fetch(currentUrl, { method: 'HEAD', redirect: 'manual' });
      const location = response.headers.get('location');
      if (!location) throw new Error('Não foi possível abrir o link curto do Google Forms.');
      currentUrl = new URL(location, currentUrl).toString();
    }
    throw new Error('O link do Google Forms teve redirecionamentos demais.');
  }

  async function linkForm(formUrl) {
    const formId = await getFormId(formUrl);
    if (!formId) throw new Error('Informe o link ou ID do Google Forms.');
    const client = await getAuthorizedClient();
    const form = await google.forms({ version: 'v1', auth: client }).forms.get({ formId });
    const account = repository.getAccount();
    return repository.saveForm({ accountId: account.id, formId, formUrl: String(formUrl).startsWith('http') ? formUrl : `https://docs.google.com/forms/d/${formId}/edit`, title: form.data.info?.title || 'Formulário de admissão' });
  }

  function parseResponse(response, form) {
    const items = new Map();
    for (const item of form.items || []) {
      const question = item.questionItem?.question;
      if (question?.questionId) items.set(question.questionId, item.title || 'Campo sem título');
    }
    const answers = [];
    const files = [];
    for (const answer of Object.values(response.answers || {})) {
      const title = items.get(answer.questionId) || 'Resposta';
      const textValues = answer.textAnswers?.answers?.map((item) => item.value) || [];
      const uploadedFiles = answer.fileUploadAnswers?.files || [];
      answers.push({ title, values: textValues.length ? textValues : uploadedFiles.map((file) => file.displayName) });
      for (const file of uploadedFiles) files.push({ fileId: file.fileId, fileName: file.displayName, mimeType: file.mimeType });
    }
    return { answers, files };
  }

  async function syncForm(formRecord) {
    const client = await getAuthorizedClient();
    const formsApi = google.forms({ version: 'v1', auth: client });
    const form = (await formsApi.forms.get({ formId: formRecord.formId })).data;
    let pageToken;
    let imported = 0;
    do {
      const result = await formsApi.forms.responses.list({ formId: formRecord.formId, pageSize: 500, pageToken });
      for (const response of result.data.responses || []) {
        const parsed = parseResponse(response, form);
        repository.saveResponse({ formId: formRecord.id, googleResponseId: response.responseId, submittedAt: response.createTime, answers: parsed.answers, files: parsed.files });
        imported += 1;
      }
      pageToken = result.data.nextPageToken;
    } while (pageToken);
    repository.markSynced(formRecord.id);
    return { imported, form: repository.getForm(formRecord.id) };
  }

  async function downloadFile(responseId, fileId, fileName) {
    const client = await getAuthorizedClient();
    const drive = google.drive({ version: 'v3', auth: client });
    const targetDirectory = path.join(userDataPath, 'admissions-files');
    fs.mkdirSync(targetDirectory, { recursive: true });
    const safeName = String(fileName || fileId).replace(/[<>:"/\\|?*]+/g, '_');
    const targetPath = path.join(targetDirectory, `${responseId}-${safeName}`);
    const result = await drive.files.get({ fileId, alt: 'media' }, { responseType: 'stream' });
    await new Promise((resolve, reject) => {
      const output = fs.createWriteStream(targetPath);
      result.data.pipe(output);
      output.on('finish', resolve);
      output.on('error', reject);
    });
    return { path: targetPath, fileName: safeName };
  }

  async function sendSupportEmail({ subject, message, userName, sender }) {
    const client = await getAuthorizedClient();
    const account = repository.getAccount();
    const recipient = 'davi.andrade.dp@gmail.com';
    const safeSubject = `[DP Flow] ${userName || 'Usuário'} · ${subject}`;
    const body = [
      `Usuário: ${userName || 'Não identificado'}`,
      `Contato: ${sender || 'Não informado'}`,
      `Conta Google: ${account?.email || 'Não informada'}`,
      '',
      message
    ].join('\n');
    const headers = [
      `To: ${recipient}`,
      `Subject: ${safeSubject}`,
      'Content-Type: text/plain; charset="UTF-8"',
      'MIME-Version: 1.0'
    ];
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(sender || '')) headers.push(`Reply-To: ${sender}`);
    const raw = Buffer.from(`${headers.join('\r\n')}\r\n\r\n${body}`, 'utf8').toString('base64url');
    try {
      await google.gmail({ version: 'v1', auth: client }).users.messages.send({
        userId: 'me',
        requestBody: { raw }
      });
    } catch (error) {
      const details = `${error.message || ''} ${error.response?.data?.error?.status || ''}`;
      if (/SERVICE_DISABLED|Gmail API has not been used|gmail\.googleapis\.com/i.test(details)) {
        throw new Error('A Gmail API está desativada. Ative-a no Google Cloud neste link: https://console.developers.google.com/apis/api/gmail.googleapis.com/overview?project=551256848965. Depois aguarde alguns minutos e tente novamente.');
      }
      throw error;
    }
    return { email: recipient };
  }

  return { authorize, refreshProfile, linkForm, syncForm, downloadFile, sendSupportEmail };
}

module.exports = { createGoogleOAuthAdmissionsService };
