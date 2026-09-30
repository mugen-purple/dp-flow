function createSettingsRepository(database) {
  const saveSetting = database.prepare(`
    INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `);

  return {
    save(key, value) {
      saveSetting.run(key, value, new Date().toISOString());
    },

    get(key) {
      return database.prepare('SELECT value FROM settings WHERE key = ?').get(key)?.value ?? null;
    }
  };
}

module.exports = { createSettingsRepository };
