import Database from 'better-sqlite3';
import path from 'path';

const dbPath = path.resolve('./user_messages.db');
const db = new Database(dbPath);

// 🛠️ DB Table Initialization
db.exec(`
  CREATE TABLE IF NOT EXISTS user_info (
    user_id TEXT PRIMARY KEY,
    username TEXT,
    first_name TEXT,
    last_name TEXT,
    updated_at INTEGER
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS groups (
    group_id TEXT PRIMARY KEY,
    title TEXT,
    username TEXT,
    joined_at INTEGER
  );
`);

// ✅ Migration: Add 'last_active' column to groups
try {
  const columns = db.prepare(`PRAGMA table_info(groups)`).all();
  const hasLastActive = columns.some(col => col.name === 'last_active');
  if (!hasLastActive) {
    db.exec(`ALTER TABLE groups ADD COLUMN last_active INTEGER DEFAULT 0`);
    console.log('✅ Migrated: Added "last_active" to groups');
  }
} catch (err) {
  console.error('❌ Migration failed (groups):', err.message);
}

db.exec(`
  CREATE TABLE IF NOT EXISTS user_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT,
    user TEXT,
    rem TEXT,
    timestamp INTEGER
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS reminders (
    chat_id TEXT,
    message_id INTEGER,
    interval INTEGER,
    active INTEGER DEFAULT 1,
    delete_prev_message INTEGER DEFAULT 0,
    PRIMARY KEY (chat_id, message_id)
  );
`);

// ✅ Migration: Add 'custom_text' column to reminders
try {
  const reminderCols = db.prepare(`PRAGMA table_info(reminders)`).all();
  const hasCustomText = reminderCols.some(col => col.name === 'custom_text');
  if (!hasCustomText) {
    db.exec(`ALTER TABLE reminders ADD COLUMN custom_text TEXT`);
    console.log('✅ Migrated: Added "custom_text" to reminders');
  }
} catch (err) {
  console.error('❌ Migration failed (reminders):', err.message);
}

// ✅ Migration: Add 'delete_prev_message' column to reminders
try {
  const reminderCols = db.prepare(`PRAGMA table_info(reminders)`).all();
  const hasDeletePrev = reminderCols.some(col => col.name === 'delete_prev_message');
  if (!hasDeletePrev) {
    db.exec(`ALTER TABLE reminders ADD COLUMN delete_prev_message INTEGER DEFAULT 0`);
    console.log('✅ Migrated: Added "delete_prev_message" to reminders');
  }
} catch (err) {
  console.error('❌ Migration failed (reminders - delete_prev_message):', err.message);
}

// 🧠 User Info
function cacheUserInfo(user) {
  const { id, username, first_name, last_name } = user;
  const updatedAt = Date.now();
  const stmt = db.prepare(`
    INSERT INTO user_info (user_id, username, first_name, last_name, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      username = excluded.username,
      first_name = excluded.first_name,
      last_name = excluded.last_name,
      updated_at = excluded.updated_at
  `);
  stmt.run(id.toString(), username || null, first_name || null, last_name || null, updatedAt);
}

function getUserInfoByUsername(username) {
  return db.prepare(`SELECT * FROM user_info WHERE LOWER(username) = ?`).get(username?.toLowerCase());
}

function getUserInfoById(userId) {
  return db.prepare(`SELECT * FROM user_info WHERE user_id = ?`).get(userId.toString());
}

// 🏘️ Group Info
function saveGroupInfo(chat) {
  if (!chat.id || !chat.type.includes('group')) return;
  const stmt = db.prepare(`
    INSERT INTO groups (group_id, title, username, joined_at, last_active)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(group_id) DO UPDATE SET
      title = excluded.title,
      username = excluded.username,
      last_active = excluded.last_active
  `);
  stmt.run(
    chat.id.toString(),
    chat.title || 'Unnamed Group',
    chat.username || null,
    Date.now(),
    Date.now()
  );
}

function updateGroupActivity(groupId) {
  db.prepare(`UPDATE groups SET last_active = ? WHERE group_id = ?`)
    .run(Date.now(), groupId.toString());
}

function getAllGroups() {
  return db.prepare(`SELECT * FROM groups ORDER BY joined_at DESC`).all();
}

function getActiveGroups(withinMinutes = 1440) {
  const threshold = Date.now() - withinMinutes * 60 * 1000;
  return db.prepare(`
    SELECT * FROM groups WHERE last_active > ? ORDER BY last_active DESC
  `).all(threshold);
}

// 💬 User Messages
function saveUserMessage(userId, userText, remText) {
  const timestamp = Date.now();
  db.prepare(`
    INSERT INTO user_messages (user_id, user, rem, timestamp)
    VALUES (?, ?, ?, ?)
  `).run(userId, userText, remText, timestamp);

  const { count } = db.prepare(`SELECT COUNT(*) as count FROM user_messages WHERE user_id = ?`).get(userId);
  if (count > 20) {
    db.prepare(`
      DELETE FROM user_messages WHERE id IN (
        SELECT id FROM user_messages WHERE user_id = ? ORDER BY timestamp ASC LIMIT ?
      )
    `).run(userId, count - 20);
  }

  const { userCount } = db.prepare(`SELECT COUNT(DISTINCT user_id) as userCount FROM user_messages`).get();
  if (userCount > 50) {
    const oldestUsers = db.prepare(`
      SELECT user_id FROM user_messages
      GROUP BY user_id ORDER BY MIN(timestamp) ASC LIMIT ?
    `).all(userCount - 50);
    const delStmt = db.prepare(`DELETE FROM user_messages WHERE user_id = ?`);
    oldestUsers.forEach(u => delStmt.run(u.user_id));
  }
}

function getUserLastMessages(userId) {
  return db.prepare(`
    SELECT user, rem FROM user_messages
    WHERE user_id = ? ORDER BY timestamp ASC LIMIT 20
  `).all(userId);
}

// ⏰ Reminder System
function saveReminder(chatId, messageId, interval, customText = null, deletePrev = false) {
  db.prepare(`
    INSERT OR REPLACE INTO reminders
    (chat_id, message_id, interval, active, delete_prev_message, custom_text)
    VALUES (?, ?, ?, 1, ?, ?)
  `).run(chatId, messageId, interval, deletePrev ? 1 : 0, customText);
}

function removeReminder(chatId, messageId) {
  db.prepare(`
    UPDATE reminders SET active = 0 WHERE chat_id = ? AND message_id = ?
  `).run(chatId, messageId);
}

function clearAllReminders() {
  db.prepare(`DELETE FROM reminders`).run();
}

function getActiveReminders() {
  return db.prepare(`SELECT * FROM reminders WHERE active = 1`).all();
}

// 🚀 Export
export {
  cacheUserInfo,
  getUserInfoByUsername,
  getUserInfoById,
  saveGroupInfo,
  updateGroupActivity,
  getAllGroups,
  getActiveGroups,
  saveUserMessage,
  getUserLastMessages,
  saveReminder,
  removeReminder,
  clearAllReminders,
  getActiveReminders
};
