// db.js
import Database from 'better-sqlite3';
import path from 'path';

const dbPath = path.resolve('./user_messages.db');
const db = new Database(dbPath);

// 🔄 DB initialization

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

db.exec(`
  CREATE TABLE IF NOT EXISTS user_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT,
    user TEXT,
    rem TEXT,
    timestamp INTEGER
  );
`);

function saveGroupInfo(chat) {
  if (!chat.id || !chat.type.includes('group')) return;
  const groupId = chat.id.toString();
  const title = chat.title || 'Unnamed Group';
  const username = chat.username || null;
  const joinedAt = Date.now();

  const stmt = db.prepare(`
    INSERT INTO groups (group_id, title, username, joined_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(group_id) DO UPDATE SET
      title = excluded.title,
      username = excluded.username
  `);

  stmt.run(groupId, title, username, joinedAt);
}

function getAllGroups() {
  const stmt = db.prepare(`SELECT * FROM groups ORDER BY joined_at DESC`);
  return stmt.all();
}

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

function saveUserMessage(userId, userText, remText) {
  const timestamp = Date.now();
  const insert = db.prepare(`
    INSERT INTO user_messages (user_id, user, rem, timestamp)
    VALUES (?, ?, ?, ?)
  `);
  insert.run(userId, userText, remText, timestamp);

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
    SELECT user, rem FROM user_messages WHERE user_id = ?
    ORDER BY timestamp ASC
    LIMIT 20
  `);
  const rows = select.all(userId);
  return rows;
}

export {
  saveUserMessage,
  getUserLastMessages,
  cacheUserInfo,
  getUserInfoByUsername,
  getUserInfoById,
  saveGroupInfo,
  getAllGroups
};
