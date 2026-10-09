// AEGIS One Backend Database Engine (SQLite via node:sqlite)
// KnightMaster Innovations Pvt. Ltd. - AEGIS One Security & Database Core
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const DATA_DIR = path.resolve(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, 'aegis.sqlite');
const db = new DatabaseSync(DB_PATH);

// Enable WAL mode for high concurrency & write performance
try {
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA synchronous = NORMAL;');
} catch (e) {
  console.warn('[AEGIS-DB] Pragma note:', e.message);
}

// 1. Initialize Tables: Users & Emergencies
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    user_id TEXT PRIMARY KEY,
    auth_token TEXT UNIQUE NOT NULL,
    full_name TEXT NOT NULL,
    blood_group TEXT,
    national_id TEXT,
    phone TEXT,
    role TEXT NOT NULL DEFAULT 'user', -- 'user' | 'responder' | 'admin'
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS emergencies (
    emergency_id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    latitude REAL,
    longitude REAL,
    accuracy REAL,
    timestamp INTEGER NOT NULL,
    readable_address TEXT,
    emergency_status TEXT NOT NULL, -- 'LOCATION_ACQUIRED' | 'LOCATION_UNAVAILABLE' | 'DISPATCHED' | 'RESOLVED'
    alert_type TEXT NOT NULL,       -- 'POLICE' | 'MEDICAL' | 'CONTACT' | 'CRASH'
    google_maps_url TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY(user_id) REFERENCES users(user_id)
  );

  CREATE INDEX IF NOT EXISTS idx_emergencies_user ON emergencies(user_id);
  CREATE INDEX IF NOT EXISTS idx_emergencies_status ON emergencies(emergency_status);
  CREATE INDEX IF NOT EXISTS idx_emergencies_created ON emergencies(created_at DESC);
`);

// 2. Seed Default User & Emergency Responder
const checkUser = db.prepare('SELECT user_id FROM users WHERE user_id = ?');
const defaultUser = checkUser.get('usr_aegis_9821');
if (!defaultUser) {
  const insertUser = db.prepare(`
    INSERT INTO users (user_id, auth_token, full_name, blood_group, national_id, phone, role, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  // Default Wearer User: Alex Morgan
  insertUser.run(
    'usr_aegis_9821',
    'aegis-secure-token-9821',
    'Alex Morgan',
    'O+ Positive',
    'AEGIS-ID-9821',
    '+1 (555) 234-8901',
    'user',
    Date.now()
  );
  // Default Dispatcher / Admin: Emergency Response Control Room
  insertUser.run(
    'usr_admin_control',
    'aegis-responder-admin-key',
    'Central Emergency Command (Admin)',
    null,
    'PCR-DISPATCH-01',
    '112',
    'responder',
    Date.now()
  );
  console.log('[AEGIS-DB] Seeded default users and responder credentials.');
}

// --- Database Operations ---

// User authentication lookup by token
function getUserByToken(token) {
  if (!token) return null;
  const stmt = db.prepare('SELECT user_id, full_name, blood_group, national_id, phone, role FROM users WHERE auth_token = ?');
  return stmt.get(token) || null;
}

// User lookup by ID
function getUserById(userId) {
  if (!userId) return null;
  const stmt = db.prepare('SELECT user_id, full_name, blood_group, national_id, phone, role FROM users WHERE user_id = ?');
  return stmt.get(userId) || null;
}

// Create new emergency record
function createEmergencyRecord(data) {
  const stmt = db.prepare(`
    INSERT INTO emergencies (
      emergency_id,
      user_id,
      latitude,
      longitude,
      accuracy,
      timestamp,
      readable_address,
      emergency_status,
      alert_type,
      google_maps_url,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    data.emergency_id,
    data.user_id,
    data.latitude ?? null,
    data.longitude ?? null,
    data.accuracy ?? null,
    data.timestamp,
    data.readable_address ?? null,
    data.emergency_status,
    data.alert_type || 'POLICE',
    data.google_maps_url ?? null,
    data.created_at || Date.now(),
    data.updated_at || Date.now()
  );

  return getEmergencyById(data.emergency_id);
}

// Update readable address (asynchronous reverse geocoding result)
function updateEmergencyAddress(emergencyId, address) {
  const stmt = db.prepare(`
    UPDATE emergencies 
    SET readable_address = ?, updated_at = ?
    WHERE emergency_id = ?
  `);
  stmt.run(address, Date.now(), emergencyId);
  return getEmergencyById(emergencyId);
}

// Update emergency status
function updateEmergencyStatus(emergencyId, status) {
  const stmt = db.prepare(`
    UPDATE emergencies 
    SET emergency_status = ?, updated_at = ?
    WHERE emergency_id = ?
  `);
  stmt.run(status, Date.now(), emergencyId);
  return getEmergencyById(emergencyId);
}

// Retrieve single emergency by ID
function getEmergencyById(emergencyId) {
  const stmt = db.prepare(`
    SELECT e.*, u.full_name, u.blood_group, u.national_id, u.phone as user_phone
    FROM emergencies e
    LEFT JOIN users u ON e.user_id = u.user_id
    WHERE e.emergency_id = ?
  `);
  return stmt.get(emergencyId) || null;
}

// List emergencies (with optional user_id filter for non-admin users)
function listEmergencies(filter = {}) {
  let query = `
    SELECT e.*, u.full_name, u.blood_group, u.national_id, u.phone as user_phone
    FROM emergencies e
    LEFT JOIN users u ON e.user_id = u.user_id
  `;
  const params = [];

  if (filter.user_id) {
    query += ' WHERE e.user_id = ?';
    params.push(filter.user_id);
  }

  query += ' ORDER BY e.created_at DESC LIMIT ? OFFSET ?';
  params.push(filter.limit || 50);
  params.push(filter.offset || 0);

  const stmt = db.prepare(query);
  return stmt.all(...params);
}

module.exports = {
  db,
  getUserByToken,
  getUserById,
  createEmergencyRecord,
  updateEmergencyAddress,
  updateEmergencyStatus,
  getEmergencyById,
  listEmergencies
};
