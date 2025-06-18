// cache.js

import fs from 'fs';
const CACHE_FILE = './usernameCache.json';

let cache = {};

// Load cache from disk (if exists)
if (fs.existsSync(CACHE_FILE)) {
  try {
    const raw = fs.readFileSync(CACHE_FILE);
    cache = JSON.parse(raw);
  } catch (e) {
    console.error('❌ Failed to read cache:', e);
  }
}

// Save to disk
function saveCache() {
  fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
}

// Set a username -> userId
export function cacheUser(username, id) {
  const lower = username.toLowerCase();
  cache[lower] = {
    id,
    lastSeen: Date.now()
  };
  saveCache();
}

// Get userId from username (returns null if not found)
export function getCachedUserId(username) {
  const lower = username.toLowerCase();
  return cache[lower]?.id || null;
}

// Optional: clear old entries (not used in 30 days)
export function pruneCache() {
  const cutoff = Date.now() - 1000 * 60 * 60 * 24 * 30;
  for (const key of Object.keys(cache)) {
    if (cache[key].lastSeen < cutoff) {
      delete cache[key];
    }
  }
  saveCache();
}
