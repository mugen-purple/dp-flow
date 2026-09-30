const { randomUUID } = require('node:crypto');

function createEsocialRepository(database) {
  return {
    listAuthorizations() {
      return database.prepare(`SELECT id, grantor_company_id AS grantorCompanyId, represented_company_id AS representedCompanyId, environment, status, official_reference AS officialReference, last_verified_at AS lastVerifiedAt, last_error AS lastError FROM esocial_authorizations ORDER BY updated_at DESC`).all();
    },
    saveAuthorization({ grantorCompanyId, representedCompanyId, environment = 'RESTRICTED' }) {
      const now = new Date().toISOString();
      const existing = database.prepare('SELECT id FROM esocial_authorizations WHERE grantor_company_id = ? AND represented_company_id = ?').get(grantorCompanyId, representedCompanyId);
      if (existing) {
        database.prepare('UPDATE esocial_authorizations SET environment = ?, status = \'PENDING\', last_error = NULL, updated_at = ? WHERE id = ?').run(environment, now, existing.id);
        return { id: existing.id };
      }
      const id = randomUUID();
      database.prepare(`INSERT INTO esocial_authorizations (id, grantor_company_id, represented_company_id, environment, status, created_at, updated_at) VALUES (?, ?, ?, ?, 'PENDING', ?, ?)`).run(id, grantorCompanyId, representedCompanyId, environment, now, now);
      return { id };
    },
    recordRequest({ authorizationId, companyId, operation, protocol = null, status, responseXml = null, errorMessage = null }) {
      const now = new Date().toISOString();
      const id = randomUUID();
      database.prepare(`INSERT INTO esocial_requests (id, authorization_id, company_id, operation, protocol, status, response_xml, error_message, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(id, authorizationId, companyId, operation, protocol, status, responseXml, errorMessage, now, now);
      return { id, protocol, status };
    },
    listPendingRequests() {
      return database.prepare(`SELECT id, authorization_id AS authorizationId, company_id AS companyId, protocol, status FROM esocial_requests WHERE operation = 'SEND_S1299' AND status = 'SENT' AND protocol IS NOT NULL ORDER BY created_at`).all();
    },
    updateRequest(id, status, responseXml = null, errorMessage = null) {
      database.prepare('UPDATE esocial_requests SET status = ?, response_xml = COALESCE(?, response_xml), error_message = ?, updated_at = ? WHERE id = ?').run(status, responseXml, errorMessage, new Date().toISOString(), id);
    },
    updateAuthorization(id, status, officialReference = null, lastError = null) {
      database.prepare('UPDATE esocial_authorizations SET status = ?, official_reference = COALESCE(?, official_reference), last_verified_at = ?, last_error = ?, updated_at = ? WHERE id = ?').run(status, officialReference, new Date().toISOString(), lastError, new Date().toISOString(), id);
    }
  };
}

module.exports = { createEsocialRepository };