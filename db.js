import Database from 'better-sqlite3';
import path from 'path';

const dbPath = path.resolve('./user_messages.db'); // current folder me file banegi
const db = new Database(dbPath);

// Table create karo agar pehle nahi bana hai
db.exec(`
  CREATE TABLE IF NOT EXISTS user_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    message TEXT NOT NULL,
    timestamp INTEGER NOT NULL
  );
`);

// User ka message save karne wali function
function saveUserMessage(userId, message) {
  const timestamp = Date.now();

  const insert = db.prepare(`
    INSERT INTO user_messages (user_id, message, timestamp)
    VALUES (?, ?, ?)
  `);
  insert.run(userId, message, timestamp);

  // Sirf last 20 messages rakho per user
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

  // Total 50 users se zyada na ho, purane users ko delete karo
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

// User ke last 20 messages le lo, purane se naya order me
function getUserLastMessages(userId) {
  const select = db.prepare(`
    SELECT message FROM user_messages WHERE user_id = ?
    ORDER BY timestamp ASC
    LIMIT 20
  `);
  const rows = select.all(userId);
  return rows.map(r => r.message);
}

export { saveUserMessage, getUserLastMessages };