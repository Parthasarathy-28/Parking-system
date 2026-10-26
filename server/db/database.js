// ParkPulse Database - Uses Node.js 24+ built-in sqlite module
// No native compilation needed!

const { DatabaseSync } = require('node:sqlite');
const path = require('path');

const DB_PATH = path.join(__dirname, 'parkpulse.db');

let _db = null;

function getDb() {
  if (_db) return _db;

  _db = new DatabaseSync(DB_PATH);

  // Enable WAL mode and foreign keys
  _db.exec('PRAGMA journal_mode = WAL');
  _db.exec('PRAGMA foreign_keys = ON');

  createTables(_db);
  return _db;
}

function createTables(db) {
  db.exec(`
    -- Colleges
    CREATE TABLE IF NOT EXISTS colleges (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      address TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    -- Users
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      college_id TEXT NOT NULL REFERENCES colleges(id),
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin', 'student', 'staff')),
      vehicle_type TEXT CHECK(vehicle_type IN ('bike', 'car', NULL)),
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    -- Parking Zones
    CREATE TABLE IF NOT EXISTS parking_zones (
      id TEXT PRIMARY KEY,
      college_id TEXT NOT NULL REFERENCES colleges(id),
      name TEXT NOT NULL,
      zone_code TEXT NOT NULL,
      vehicle_type TEXT NOT NULL CHECK(vehicle_type IN ('bike', 'car', 'any')),
      staff_only INTEGER DEFAULT 0,
      total_capacity INTEGER DEFAULT 0,
      description TEXT,
      color TEXT DEFAULT '#10B981',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(college_id, zone_code)
    );

    -- Parking Slots
    CREATE TABLE IF NOT EXISTS parking_slots (
      id TEXT PRIMARY KEY,
      college_id TEXT NOT NULL REFERENCES colleges(id),
      zone_id TEXT NOT NULL REFERENCES parking_zones(id),
      slot_number TEXT NOT NULL,
      vehicle_type TEXT NOT NULL CHECK(vehicle_type IN ('bike', 'car')),
      allocation_priority INTEGER NOT NULL DEFAULT 100,
      operational_status TEXT NOT NULL DEFAULT 'available' CHECK(operational_status IN ('available', 'blocked', 'maintenance')),
      occupancy_status TEXT NOT NULL DEFAULT 'free' CHECK(occupancy_status IN ('free', 'held', 'occupied')),
      current_allocation_id TEXT,
      position_x REAL DEFAULT 0,
      position_y REAL DEFAULT 0,
      last_updated TEXT DEFAULT (datetime('now')),
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(college_id, slot_number)
    );

    -- Geofence Settings
    CREATE TABLE IF NOT EXISTS geofence_settings (
      id TEXT PRIMARY KEY,
      college_id TEXT NOT NULL UNIQUE REFERENCES colleges(id),
      campus_lat REAL NOT NULL,
      campus_lng REAL NOT NULL,
      campus_radius_m REAL NOT NULL DEFAULT 500,
      parking_entry_lat REAL NOT NULL,
      parking_entry_lng REAL NOT NULL,
      parking_entry_radius_m REAL NOT NULL DEFAULT 100,
      min_accuracy_m REAL NOT NULL DEFAULT 50,
      updated_at TEXT DEFAULT (datetime('now'))
    );

    -- Parking Requests
    CREATE TABLE IF NOT EXISTS parking_requests (
      id TEXT PRIMARY KEY,
      college_id TEXT NOT NULL REFERENCES colleges(id),
      user_id TEXT NOT NULL REFERENCES users(id),
      vehicle_type TEXT NOT NULL CHECK(vehicle_type IN ('bike', 'car')),
      sequence_number INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'allocated', 'queued', 'cancelled', 'expired')),
      location_lat REAL,
      location_lng REAL,
      location_accuracy REAL,
      geofence_verified INTEGER DEFAULT 0,
      idempotency_key TEXT UNIQUE,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    -- Parking Allocations
    CREATE TABLE IF NOT EXISTS parking_allocations (
      id TEXT PRIMARY KEY,
      college_id TEXT NOT NULL REFERENCES colleges(id),
      request_id TEXT NOT NULL REFERENCES parking_requests(id),
      user_id TEXT NOT NULL REFERENCES users(id),
      slot_id TEXT NOT NULL REFERENCES parking_slots(id),
      status TEXT NOT NULL DEFAULT 'held' CHECK(status IN ('held', 'confirmed', 'expired', 'cancelled', 'reallocated')),
      expires_at TEXT,
      confirmed_at TEXT,
      cancelled_at TEXT,
      reallocated_to TEXT REFERENCES parking_allocations(id),
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    -- Parking Sessions
    CREATE TABLE IF NOT EXISTS parking_sessions (
      id TEXT PRIMARY KEY,
      college_id TEXT NOT NULL REFERENCES colleges(id),
      allocation_id TEXT NOT NULL REFERENCES parking_allocations(id),
      user_id TEXT NOT NULL REFERENCES users(id),
      slot_id TEXT NOT NULL REFERENCES parking_slots(id),
      started_at TEXT NOT NULL DEFAULT (datetime('now')),
      ended_at TEXT,
      duration_minutes INTEGER
    );

    -- Waiting Queue
    CREATE TABLE IF NOT EXISTS waiting_queue (
      id TEXT PRIMARY KEY,
      college_id TEXT NOT NULL REFERENCES colleges(id),
      request_id TEXT NOT NULL UNIQUE REFERENCES parking_requests(id),
      user_id TEXT NOT NULL REFERENCES users(id),
      vehicle_type TEXT NOT NULL CHECK(vehicle_type IN ('bike', 'car')),
      queue_position INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'waiting' CHECK(status IN ('waiting', 'offered', 'accepted', 'declined', 'expired', 'cancelled')),
      offered_slot_id TEXT REFERENCES parking_slots(id),
      offer_expires_at TEXT,
      original_sequence INTEGER,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    -- Occupancy Events
    CREATE TABLE IF NOT EXISTS occupancy_events (
      id TEXT PRIMARY KEY,
      college_id TEXT NOT NULL REFERENCES colleges(id),
      slot_id TEXT NOT NULL REFERENCES parking_slots(id),
      event_type TEXT NOT NULL CHECK(event_type IN ('vehicle_entered', 'vehicle_exited', 'unexpected_occupancy', 'slot_unavailable', 'slot_available')),
      triggered_by TEXT NOT NULL CHECK(triggered_by IN ('sensor', 'admin_simulated', 'student_confirmed', 'student_exit', 'system')),
      triggered_by_user_id TEXT REFERENCES users(id),
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Notifications
    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      college_id TEXT NOT NULL REFERENCES colleges(id),
      user_id TEXT NOT NULL REFERENCES users(id),
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      data TEXT DEFAULT '{}',
      is_read INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Audit Logs
    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      college_id TEXT NOT NULL,
      user_id TEXT,
      action TEXT NOT NULL,
      entity_type TEXT,
      entity_id TEXT,
      details TEXT DEFAULT '{}',
      ip_address TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Location Approvals
    CREATE TABLE IF NOT EXISTS location_approvals (
      id TEXT PRIMARY KEY,
      college_id TEXT NOT NULL REFERENCES colleges(id),
      user_id TEXT NOT NULL REFERENCES users(id),
      approved_by TEXT NOT NULL REFERENCES users(id),
      reason TEXT,
      expires_at TEXT NOT NULL,
      used INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Sequence counter
    CREATE TABLE IF NOT EXISTS request_sequences (
      college_id TEXT NOT NULL REFERENCES colleges(id),
      next_sequence INTEGER NOT NULL DEFAULT 1,
      PRIMARY KEY(college_id)
    );

    -- Indexes
    CREATE INDEX IF NOT EXISTS idx_slots_college ON parking_slots(college_id);
    CREATE INDEX IF NOT EXISTS idx_slots_zone ON parking_slots(zone_id);
    CREATE INDEX IF NOT EXISTS idx_allocations_user ON parking_allocations(user_id);
    CREATE INDEX IF NOT EXISTS idx_allocations_slot ON parking_allocations(slot_id);
    CREATE INDEX IF NOT EXISTS idx_allocations_status ON parking_allocations(status);
    CREATE INDEX IF NOT EXISTS idx_queue_college ON waiting_queue(college_id, vehicle_type, status);
    CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read);
    CREATE INDEX IF NOT EXISTS idx_requests_user ON parking_requests(user_id);
  `);
}

// Wrapper to make node:sqlite work like better-sqlite3 API
// node:sqlite uses prepare().get(), .all(), .run() - SAME API!

module.exports = { getDb, DB_PATH };
