const DP_FLOW_SECRET = 'COLE_UM_SEGREDO_LONGO_E_ALEATORIO_AQUI';

function doGet(event) {
  return handleRequest_(event?.parameter || {});
}

function doPost(event) {
  const body = event?.postData?.contents ? JSON.parse(event.postData.contents) : {};
  return handleRequest_(body);
}

function handleRequest_(params) {
  if (params.secret !== DP_FLOW_SECRET) return json_({ error: 'Não autorizado.' });
  try {
    const action = params.action || 'sync';
    if (action === 'sync') return syncForm_(String(params.formId || ''));
    if (action === 'download') return downloadFile_(String(params.fileId || ''));
    return json_({ error: 'Ação desconhecida.' });
  } catch (error) {
    return json_({ error: error.message });
  }
}

function syncForm_(formId) {
  if (!formId) throw new Error('formId é obrigatório.');
  const form = FormApp.openById(formId);
  const responses = form.getResponses().map((formResponse) => {
    const answers = [];
    const files = [];
    formResponse.getItemResponses().forEach((itemResponse) => {
      const item = itemResponse.getItem();
      const response = itemResponse.getResponse();
      const values = Array.isArray(response) ? response : [response];
      const answer = { title: item.getTitle(), values: values.map(String) };
      if (item.getType() === FormApp.ItemType.FILE_UPLOAD) {
        answer.values = [];
        values.forEach((fileId) => {
          const file = DriveApp.getFileById(String(fileId));
          answer.values.push(file.getName());
          files.push({ fileId: file.getId(), fileName: file.getName(), mimeType: file.getMimeType() });
        });
      }
      answers.push(answer);
    });
    return {
      responseId: formResponse.getId(),
      createTime: formResponse.getTimestamp().toISOString(),
      answers,
      files
    };
  });
  return json_({ title: form.getTitle(), formId, responses });
}

function downloadFile_(fileId) {
  if (!fileId) throw new Error('fileId é obrigatório.');
  const file = DriveApp.getFileById(fileId);
  return json_({ fileName: file.getName(), mimeType: file.getMimeType(), base64: Utilities.base64Encode(file.getBlob().getBytes()) });
}

function json_(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON);
}
