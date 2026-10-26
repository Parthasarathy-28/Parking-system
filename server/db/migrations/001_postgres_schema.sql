-- ParkPulse 2.0 — PostgreSQL Production Schema Migration
-- Compatible with PostgreSQL 14, 15, 16+

-- 1. Colleges
CREATE TABLE IF NOT EXISTS colleges (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  address TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 2. Users
CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(64) PRIMARY KEY,
  college_id VARCHAR(64) NOT NULL REFERENCES colleges(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(32) NOT NULL CHECK (role IN ('admin', 'student', 'staff')),
  user_category VARCHAR(32) DEFAULT 'student' CHECK (user_category IN ('student', 'staff', 'admin')),
  vehicle_type VARCHAR(16) CHECK (vehicle_type IN ('bike', 'car', NULL)),
  is_active SMALLINT DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 3. Parking Zones
CREATE TABLE IF NOT EXISTS parking_zones (
  id VARCHAR(64) PRIMARY KEY,
  college_id VARCHAR(64) NOT NULL REFERENCES colleges(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  zone_code VARCHAR(16) NOT NULL,
  category VARCHAR(32) DEFAULT 'student' CHECK (category IN ('student', 'staff')),
  vehicle_type VARCHAR(16) NOT NULL CHECK (vehicle_type IN ('bike', 'car', 'any')),
  access_policy VARCHAR(32) DEFAULT 'student_only' CHECK (access_policy IN ('student_only', 'staff_only', 'open')),
  staff_only SMALLINT DEFAULT 0,
  total_capacity INT DEFAULT 0,
  description TEXT,
  color VARCHAR(32) DEFAULT '#10B981',
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(college_id, zone_code)
);

-- 4. Parking Slots
CREATE TABLE IF NOT EXISTS parking_slots (
  id VARCHAR(64) PRIMARY KEY,
  college_id VARCHAR(64) NOT NULL REFERENCES colleges(id) ON DELETE CASCADE,
  zone_id VARCHAR(64) NOT NULL REFERENCES parking_zones(id) ON DELETE CASCADE,
  slot_number VARCHAR(32) NOT NULL,
  vehicle_type VARCHAR(16) NOT NULL CHECK (vehicle_type IN ('bike', 'car')),
  allocation_priority INT NOT NULL DEFAULT 100,
  operational_status VARCHAR(32) NOT NULL DEFAULT 'available' CHECK (operational_status IN ('available', 'blocked', 'maintenance')),
  occupancy_status VARCHAR(32) NOT NULL DEFAULT 'free' CHECK (occupancy_status IN ('free', 'held', 'occupied')),
  current_allocation_id VARCHAR(64),
  access_node_id VARCHAR(64),
  position_x DOUBLE PRECISION DEFAULT 0,
  position_y DOUBLE PRECISION DEFAULT 0,
  last_updated TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(college_id, slot_number)
);

-- 5. Geofence Settings
CREATE TABLE IF NOT EXISTS geofence_settings (
  id VARCHAR(64) PRIMARY KEY,
  college_id VARCHAR(64) NOT NULL UNIQUE REFERENCES colleges(id) ON DELETE CASCADE,
  campus_lat DOUBLE PRECISION NOT NULL,
  campus_lng DOUBLE PRECISION NOT NULL,
  campus_radius_m DOUBLE PRECISION NOT NULL DEFAULT 500,
  parking_entry_lat DOUBLE PRECISION NOT NULL,
  parking_entry_lng DOUBLE PRECISION NOT NULL,
  parking_entry_radius_m DOUBLE PRECISION NOT NULL DEFAULT 150,
  min_accuracy_m DOUBLE PRECISION NOT NULL DEFAULT 50,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 6. Map Nodes
CREATE TABLE IF NOT EXISTS map_nodes (
  id VARCHAR(64) PRIMARY KEY,
  college_id VARCHAR(64) NOT NULL REFERENCES colleges(id) ON DELETE CASCADE,
  node_id VARCHAR(64) NOT NULL,
  x DOUBLE PRECISION NOT NULL,
  y DOUBLE PRECISION NOT NULL,
  node_type VARCHAR(32) NOT NULL,
  label VARCHAR(128),
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(college_id, node_id)
);

-- 7. Map Edges
CREATE TABLE IF NOT EXISTS map_edges (
  id VARCHAR(64) PRIMARY KEY,
  college_id VARCHAR(64) NOT NULL REFERENCES colleges(id) ON DELETE CASCADE,
  from_node_id VARCHAR(64) NOT NULL,
  to_node_id VARCHAR(64) NOT NULL,
  distance DOUBLE PRECISION NOT NULL DEFAULT 1.0,
  direction VARCHAR(32) DEFAULT 'two_way',
  is_blocked SMALLINT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 8. Parking Requests
CREATE TABLE IF NOT EXISTS parking_requests (
  id VARCHAR(64) PRIMARY KEY,
  college_id VARCHAR(64) NOT NULL REFERENCES colleges(id) ON DELETE CASCADE,
  user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  vehicle_type VARCHAR(16) NOT NULL CHECK (vehicle_type IN ('bike', 'car')),
  sequence_number BIGINT NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'allocated', 'queued', 'cancelled', 'expired')),
  location_lat DOUBLE PRECISION,
  location_lng DOUBLE PRECISION,
  location_accuracy DOUBLE PRECISION,
  geofence_verified SMALLINT DEFAULT 0,
  idempotency_key VARCHAR(128) UNIQUE,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 9. Parking Allocations
CREATE TABLE IF NOT EXISTS parking_allocations (
  id VARCHAR(64) PRIMARY KEY,
  college_id VARCHAR(64) NOT NULL REFERENCES colleges(id) ON DELETE CASCADE,
  request_id VARCHAR(64) NOT NULL REFERENCES parking_requests(id) ON DELETE CASCADE,
  user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  slot_id VARCHAR(64) NOT NULL REFERENCES parking_slots(id) ON DELETE CASCADE,
  status VARCHAR(32) NOT NULL DEFAULT 'held' CHECK (status IN ('held', 'confirmed', 'expired', 'cancelled', 'reallocated')),
  request_sequence BIGINT,
  allocated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMPTZ,
  confirmed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  reallocated_to VARCHAR(64) REFERENCES parking_allocations(id),
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 10. Parking Sessions
CREATE TABLE IF NOT EXISTS parking_sessions (
  id VARCHAR(64) PRIMARY KEY,
  college_id VARCHAR(64) NOT NULL REFERENCES colleges(id) ON DELETE CASCADE,
  allocation_id VARCHAR(64) NOT NULL REFERENCES parking_allocations(id) ON DELETE CASCADE,
  user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  slot_id VARCHAR(64) NOT NULL REFERENCES parking_slots(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ended_at TIMESTAMPTZ,
  duration_minutes INT
);

-- 11. Waiting Queue
CREATE TABLE IF NOT EXISTS waiting_queue (
  id VARCHAR(64) PRIMARY KEY,
  college_id VARCHAR(64) NOT NULL REFERENCES colleges(id) ON DELETE CASCADE,
  request_id VARCHAR(64) NOT NULL UNIQUE REFERENCES parking_requests(id) ON DELETE CASCADE,
  user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  vehicle_type VARCHAR(16) NOT NULL CHECK (vehicle_type IN ('bike', 'car')),
  queue_position INT NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'offered', 'accepted', 'declined', 'expired', 'cancelled')),
  offered_slot_id VARCHAR(64) REFERENCES parking_slots(id),
  offer_expires_at TIMESTAMPTZ,
  original_sequence BIGINT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 12. Occupancy Events
CREATE TABLE IF NOT EXISTS occupancy_events (
  id VARCHAR(64) PRIMARY KEY,
  college_id VARCHAR(64) NOT NULL REFERENCES colleges(id) ON DELETE CASCADE,
  slot_id VARCHAR(64) NOT NULL REFERENCES parking_slots(id) ON DELETE CASCADE,
  event_type VARCHAR(64) NOT NULL,
  triggered_by VARCHAR(64) NOT NULL,
  triggered_by_user_id VARCHAR(64) REFERENCES users(id),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 13. Notifications
CREATE TABLE IF NOT EXISTS notifications (
  id VARCHAR(64) PRIMARY KEY,
  college_id VARCHAR(64) NOT NULL REFERENCES colleges(id) ON DELETE CASCADE,
  user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(64) NOT NULL,
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  data JSONB DEFAULT '{}'::jsonb,
  is_read SMALLINT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 14. Audit Logs
CREATE TABLE IF NOT EXISTS audit_logs (
  id VARCHAR(64) PRIMARY KEY,
  college_id VARCHAR(64) NOT NULL,
  user_id VARCHAR(64),
  action VARCHAR(64) NOT NULL,
  entity_type VARCHAR(64),
  entity_id VARCHAR(64),
  details JSONB DEFAULT '{}'::jsonb,
  ip_address VARCHAR(64),
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 15. Location Approvals
CREATE TABLE IF NOT EXISTS location_approvals (
  id VARCHAR(64) PRIMARY KEY,
  college_id VARCHAR(64) NOT NULL REFERENCES colleges(id) ON DELETE CASCADE,
  user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  approved_by VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  used SMALLINT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 16. Request Sequences
CREATE TABLE IF NOT EXISTS request_sequences (
  college_id VARCHAR(64) NOT NULL REFERENCES colleges(id) ON DELETE CASCADE,
  next_sequence BIGINT NOT NULL DEFAULT 1,
  PRIMARY KEY (college_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_pg_slots_college ON parking_slots(college_id);
CREATE INDEX IF NOT EXISTS idx_pg_slots_zone ON parking_slots(zone_id);
CREATE INDEX IF NOT EXISTS idx_pg_allocations_user ON parking_allocations(user_id);
CREATE INDEX IF NOT EXISTS idx_pg_allocations_slot ON parking_allocations(slot_id);
CREATE INDEX IF NOT EXISTS idx_pg_allocations_status ON parking_allocations(status);
CREATE INDEX IF NOT EXISTS idx_pg_queue_college ON waiting_queue(college_id, vehicle_type, status);
CREATE INDEX IF NOT EXISTS idx_pg_notifications_user ON notifications(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_pg_requests_user ON parking_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_pg_map_nodes ON map_nodes(college_id, node_id);
CREATE INDEX IF NOT EXISTS idx_pg_map_edges ON map_edges(college_id, from_node_id, to_node_id);
