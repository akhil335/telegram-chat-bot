//  db.js
import Database from 'better-sqlite3';
import path from 'path';

const dbPath = path.resolve('./user_messages.db');
const db = new Database(dbPath);

// Create new table for user info

// 🔄 Add to existing DB init
// (This won't overwrite existing data)
db.exec(`
  CREATE TABLE IF NOT EXISTS user_info (
    user_id TEXT PRIMARY KEY,
    username TEXT,
    first_name TEXT,
    last_name TEXT,
    updated_at INTEGER
  );
`);

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
  const stmt = db.prepare(`
    SELECT * FROM user_info WHERE LOWER(username) = ?
  `);
  return stmt.get(username?.toLowerCase());
}

function getUserInfoById(userId) {
  const stmt = db.prepare(`SELECT * FROM user_info WHERE user_id = ?`);
  return stmt.get(userId.toString());
}

// Export existing functions
function saveUserMessage(userId, message) {
  const timestamp = Date.now();

  const insert = db.prepare(`
    INSERT INTO user_messages (user_id, message, timestamp)
    VALUES (?, ?, ?)
  `);
  insert.run(userId, message, timestamp);

  const countStmt = db.prepare(`
    SELECT COUNT(*) as count FROM user_messages WHERE user_id = ?
  `);
  const { count } = countStmt.get(userId);

  if (count > 20) {
    const deleteOldest = db.prepare(`
      DELETE FROM user_messages WHERE id IN (
        SELECT id FROM user_messages WHERE user_id = ?
        ORDER BY timestamp ASC LIMIT ?
      )
    `);
    deleteOldest.run(userId, count - 20);
  }

  const usersCountStmt = db.prepare(`
    SELECT COUNT(DISTINCT user_id) as userCount FROM user_messages
  `);
  const { userCount } = usersCountStmt.get();

  if (userCount > 50) {
    const oldestUsersStmt = db.prepare(`
      SELECT user_id, MIN(timestamp) as first_msg_ts
      FROM user_messages
      GROUP BY user_id
      ORDER BY first_msg_ts ASC
      LIMIT ?
    `);

    const deleteCount = userCount - 50;
    const oldestUsers = oldestUsersStmt.all(deleteCount);

    const deleteUserStmt = db.prepare(`
      DELETE FROM user_messages WHERE user_id = ?
    `);

    for (const user of oldestUsers) {
      deleteUserStmt.run(user.user_id);
    }
  }
}

function getUserLastMessages(userId) {
  const select = db.prepare(`
    SELECT message FROM user_messages WHERE user_id = ?
    ORDER BY timestamp ASC
    LIMIT 20
  `);
  const rows = select.all(userId);
  return rows.map(r => r.message);
}

export {
  saveUserMessage,
  getUserLastMessages,
  cacheUserInfo,
  getUserInfoByUsername,
  getUserInfoById
};
