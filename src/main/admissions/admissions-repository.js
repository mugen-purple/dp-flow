const { randomUUID } = require('node:crypto');

function createAdmissionsRepository(database) {
  const now = () => new Date().toISOString();

  return {
    saveAccount({ email, displayName = null, pictureUrl = null, clientId, clientSecret, refreshToken }) {
      const existing = database.prepare('SELECT id FROM google_accounts LIMIT 1').get();
      const timestamp = now();
      const id = existing?.id || randomUUID();
      if (existing) {
        database.prepare('UPDATE google_accounts SET email = ?, display_name = ?, picture_url = ?, client_id = ?, client_secret = ?, refresh_token = ?, updated_at = ? WHERE id = ?').run(email, displayName, pictureUrl, clientId, clientSecret, refreshToken, timestamp, id);
      } else {
        database.prepare('INSERT INTO google_accounts (id, email, display_name, picture_url, client_id, client_secret, refresh_token, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(id, email, displayName, pictureUrl, clientId, clientSecret, refreshToken, timestamp, timestamp);
      }
      return this.getAccount();
    },

    getAccount() {
      return database.prepare('SELECT id, email, display_name AS displayName, picture_url AS pictureUrl, client_id AS clientId, client_secret AS clientSecret, refresh_token AS refreshToken FROM google_accounts LIMIT 1').get() || null;
    },

    updateAccountProfile({ displayName, pictureUrl }) {
      database.prepare('UPDATE google_accounts SET display_name = ?, picture_url = ?, updated_at = ? WHERE id = (SELECT id FROM google_accounts LIMIT 1)').run(displayName || null, pictureUrl || null, now());
      return this.getAccount();
    },

    saveForm({ accountId, formId, formUrl, title }) {
      const timestamp = now();
      const id = database.prepare('SELECT id FROM admission_forms WHERE google_account_id = ? AND form_id = ?').get(accountId, formId)?.id || randomUUID();
      if (database.prepare('SELECT id FROM admission_forms WHERE id = ?').get(id)) {
        database.prepare('UPDATE admission_forms SET form_url = ?, title = ?, updated_at = ? WHERE id = ?').run(formUrl, title, timestamp, id);
      } else {
        database.prepare('INSERT INTO admission_forms (id, google_account_id, form_id, form_url, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(id, accountId, formId, formUrl, title, timestamp, timestamp);
      }
      return this.getForm(id);
    },

    getForm(id) {
      return database.prepare('SELECT id, google_account_id AS accountId, form_id AS formId, form_url AS formUrl, title, last_synced_at AS lastSyncedAt FROM admission_forms WHERE id = ?').get(id) || null;
    },

    listForms() {
      return database.prepare('SELECT id, google_account_id AS accountId, form_id AS formId, form_url AS formUrl, title, last_synced_at AS lastSyncedAt FROM admission_forms ORDER BY updated_at DESC').all();
    },

    saveResponse({ formId, googleResponseId, submittedAt, answers, files }) {
      const timestamp = now();
      const existing = database.prepare('SELECT id, status FROM admission_responses WHERE form_id = ? AND google_response_id = ?').get(formId, googleResponseId);
      const id = existing?.id || randomUUID();
      if (existing) {
        database.prepare('UPDATE admission_responses SET submitted_at = ?, answers_json = ?, updated_at = ? WHERE id = ?').run(submittedAt || null, JSON.stringify(answers), timestamp, id);
      } else {
        database.prepare('INSERT INTO admission_responses (id, form_id, google_response_id, submitted_at, answers_json, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, \'NEW\', ?, ?)').run(id, formId, googleResponseId, submittedAt || null, JSON.stringify(answers), timestamp, timestamp);
      }
      const insertFile = database.prepare(`INSERT INTO admission_files (id, response_id, file_id, file_name, mime_type, created_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(response_id, file_id) DO UPDATE SET file_name = excluded.file_name, mime_type = excluded.mime_type`);
      for (const file of files || []) insertFile.run(randomUUID(), id, file.fileId, file.fileName, file.mimeType || 'application/octet-stream', timestamp);
      return id;
    },

    markSynced(formId) {
      database.prepare('UPDATE admission_forms SET last_synced_at = ?, updated_at = ? WHERE id = ?').run(now(), now(), formId);
    },

    listResponses(formId) {
      const responses = database.prepare(`SELECT r.id, r.google_response_id AS googleResponseId, r.submitted_at AS submittedAt, r.answers_json AS answersJson, r.status, r.created_at AS createdAt, r.updated_at AS updatedAt, f.title AS formTitle FROM admission_responses r JOIN admission_forms f ON f.id = r.form_id WHERE r.form_id = ? ORDER BY COALESCE(r.submitted_at, r.created_at) DESC`).all(formId);
      const files = database.prepare('SELECT response_id AS responseId, file_id AS fileId, file_name AS fileName, mime_type AS mimeType FROM admission_files WHERE response_id IN (' + (responses.map(() => '?').join(',') || "''") + ')').all(...responses.map((response) => response.id));
      const filesByResponse = new Map();
      for (const file of files) filesByResponse.set(file.responseId, [...(filesByResponse.get(file.responseId) || []), file]);
      return responses.map((response) => ({ ...response, answers: JSON.parse(response.answersJson), files: filesByResponse.get(response.id) || [] }));
    },

    updateResponseStatus(responseId, status) {
      if (!['NEW', 'REVIEWING', 'PENDING', 'APPROVED', 'ARCHIVED'].includes(status)) throw new Error('Status de admissão inválido.');
      database.prepare('UPDATE admission_responses SET status = ?, updated_at = ? WHERE id = ?').run(status, now(), responseId);
      return true;
    }
  };
}

module.exports = { createAdmissionsRepository };
