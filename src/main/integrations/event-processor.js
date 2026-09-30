const { randomUUID } = require('node:crypto');

function createEventProcessor(database, taskRepository) {
  const insertEvent = database.prepare(`
    INSERT INTO integration_events (id, provider, event_type, company_id, payload_json, received_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const insertEvidence = database.prepare(`
    INSERT INTO completion_evidence (
      id, task_id, integration_event_id, source, event_type, confidence, detected_at, details_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const markProcessed = database.prepare('UPDATE integration_events SET processed_at = ? WHERE id = ?');
  const findTasks = database.prepare(`
    SELECT id, title, status
    FROM tasks
    WHERE company_id = ? AND status != 'DONE'
      AND (lower(title) LIKE '%folha%' OR lower(title) LIKE '%esocial%' OR lower(title) LIKE '%fechamento%')
  `);

  return {
    process(event) {
      if (!event || event.provider !== 'eSocial' || !['ESOCIAL_EVENT_PROCESSED', 'ESOCIAL_EVENT_CONFIRMED'].includes(event.type)) {
        throw new Error('Evento de integracao nao suportado.');
      }
      if (!event.companyId || !event.eventType) {
        throw new Error('Evento eSocial precisa de companyId e eventType.');
      }

      const receivedAt = event.timestamp || new Date().toISOString();
      const eventId = randomUUID();
      insertEvent.run(eventId, event.provider, event.type, event.companyId, JSON.stringify(event), receivedAt);

      const confidence = event.type === 'ESOCIAL_EVENT_CONFIRMED' ? 1 : (event.eventType === 'S-1299' ? 0.95 : 0.65);
      const matchingTasks = findTasks.all(event.companyId);
      const evidenceIds = [];

      for (const task of matchingTasks) {
        const evidenceId = randomUUID();
        insertEvidence.run(
          evidenceId,
          task.id,
          eventId,
          event.provider,
          event.eventType,
          confidence,
          receivedAt,
          JSON.stringify({ eventType: event.eventType, protocol: event.protocol || null, rule: event.type === 'ESOCIAL_EVENT_CONFIRMED' ? 'official-esocial-confirmation' : 'local-simulation' })
        );
        evidenceIds.push(evidenceId);

        if (confidence >= 0.9) {
          taskRepository.updateStatus(task.id, 'DONE');
        }
      }

      markProcessed.run(new Date().toISOString(), eventId);
      return { eventId, confidence, matchedTasks: matchingTasks.length, evidenceIds };
    }
  };
}

module.exports = { createEventProcessor };
