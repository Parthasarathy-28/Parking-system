// ParkPulse Database Seed Script
// Uses Node.js 24 built-in sqlite module
// Run: node db/seed.js

const { getDb } = require('./database');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

async function seed() {
  const db = getDb();
  console.log('🌱 Seeding ParkPulse database...');

  // Clear existing data in correct order
  db.exec(`
    DELETE FROM audit_logs;
    DELETE FROM notifications;
    DELETE FROM occupancy_events;
    DELETE FROM waiting_queue;
    DELETE FROM parking_sessions;
    DELETE FROM parking_allocations;
    DELETE FROM parking_requests;
    DELETE FROM geofence_settings;
    DELETE FROM parking_slots;
    DELETE FROM parking_zones;
    DELETE FROM location_approvals;
    DELETE FROM users;
    DELETE FROM request_sequences;
    DELETE FROM colleges;
  `);

  // --- College ---
  const collegeId = 'college-psg-1';
  db.prepare(`INSERT INTO colleges (id, name, address) VALUES (?, ?, ?)`).run(
    collegeId, 'PSG College of Technology', 'Peelamedu, Coimbatore - 641004, Tamil Nadu'
  );

  // Request sequence
  db.prepare(`INSERT OR REPLACE INTO request_sequences (college_id, next_sequence) VALUES (?, 1)`).run(collegeId);

  // --- Password Hashing ---
  const adminHash = bcrypt.hashSync('Admin@123', 10);
  const studentHash = bcrypt.hashSync('Student@123', 10);
  const staffHash = bcrypt.hashSync('Staff@123', 10);

  // --- Users ---
  const insertUser = db.prepare(`INSERT INTO users (id, college_id, name, email, password_hash, role, vehicle_type) VALUES (?, ?, ?, ?, ?, ?, ?)`);
  const users = [
    ['user-admin-1', collegeId, 'Dr. Rajesh Kumar', 'admin@parkpulse.edu', adminHash, 'admin', null],
    ['user-arun-1', collegeId, 'Arun Krishnamurthy', 'arun@student.psg.edu', studentHash, 'student', 'bike'],
    ['user-bala-1', collegeId, 'Balasubramanian Venkat', 'bala@student.psg.edu', studentHash, 'student', 'car'],
    ['user-priya-1', collegeId, 'Priya Sundararajan', 'priya@student.psg.edu', studentHash, 'student', 'bike'],
    ['user-karthik-1', collegeId, 'Karthikeyan Murugan', 'karthik@student.psg.edu', studentHash, 'student', 'car'],
    ['user-meena-1', collegeId, 'Meenakshi Raman', 'meena@student.psg.edu', studentHash, 'student', 'bike'],
    ['user-staff-1', collegeId, 'Prof. Suresh Babu', 'suresh@staff.psg.edu', staffHash, 'staff', 'car'],
    ['user-staff-2', collegeId, 'Dr. Kavitha Natarajan', 'kavitha@staff.psg.edu', staffHash, 'staff', 'car'],
  ];
  for (const u of users) insertUser.run(...u);
  console.log(`✅ Created ${users.length} users`);

  // --- Parking Zones ---
  const insertZone = db.prepare(`INSERT INTO parking_zones (id, college_id, name, zone_code, vehicle_type, staff_only, color, total_capacity) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
  insertZone.run('zone-bike-a', collegeId, 'Zone A – Bike Parking', 'A', 'bike', 0, '#10B981', 16);
  insertZone.run('zone-car-b', collegeId, 'Zone B – Car Parking', 'B', 'car', 0, '#3B82F6', 12);
  insertZone.run('zone-staff-c', collegeId, 'Zone C – Staff Reserved', 'C', 'car', 1, '#8B5CF6', 8);
  console.log('✅ Created 3 zones');

  // --- Parking Slots ---
  const insertSlot = db.prepare(`
    INSERT INTO parking_slots (id, college_id, zone_id, slot_number, vehicle_type, allocation_priority, position_x, position_y)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  // Zone A - Bikes (16 slots, 4 cols x 4 rows)
  for (let i = 1; i <= 16; i++) {
    const col = (i - 1) % 4;
    const row = Math.floor((i - 1) / 4);
    insertSlot.run(`slot-a${i}`, collegeId, 'zone-bike-a', `A${i}`, 'bike', i, 60 + col * 90, 80 + row * 70);
  }

  // Zone B - Cars (12 slots, 3 cols x 4 rows)
  for (let i = 1; i <= 12; i++) {
    const col = (i - 1) % 3;
    const row = Math.floor((i - 1) / 3);
    insertSlot.run(`slot-b${i}`, collegeId, 'zone-car-b', `B${i}`, 'car', 16 + i, 480 + col * 120, 80 + row * 90);
  }

  // Zone C - Staff Cars (8 slots, 4 cols x 2 rows)
  for (let i = 1; i <= 8; i++) {
    const col = (i - 1) % 4;
    const row = Math.floor((i - 1) / 4);
    insertSlot.run(`slot-c${i}`, collegeId, 'zone-staff-c', `C${i}`, 'car', 28 + i, 60 + col * 120, 440 + row * 90);
  }
  console.log('✅ Created 36 parking slots (A1-A16, B1-B12, C1-C8)');

  // --- Geofence Settings (PSG Tech approximate coords) ---
  db.prepare(`
    INSERT INTO geofence_settings (id, college_id, campus_lat, campus_lng, campus_radius_m, parking_entry_lat, parking_entry_lng, parking_entry_radius_m, min_accuracy_m)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(uuidv4(), collegeId, 11.0238, 77.0069, 500, 11.0245, 77.0072, 150, 50);
  console.log('✅ Geofence configured (PSG Tech, Coimbatore)');

  // --- Demo audit data for analytics ---
  const auditInsert = db.prepare(`INSERT INTO audit_logs (id, college_id, user_id, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?, ?, ?)`);
  const demoEvents = [
    ['allocation_created', '{"demo":true,"hour":8}'],
    ['allocation_created', '{"demo":true,"hour":9}'],
    ['allocation_created', '{"demo":true,"hour":9}'],
    ['allocation_created', '{"demo":true,"hour":10}'],
    ['allocation_created', '{"demo":true,"hour":10}'],
    ['allocation_created', '{"demo":true,"hour":10}'],
    ['allocation_expired', '{"demo":true,"hour":10}'],
    ['allocation_created', '{"demo":true,"hour":11}'],
    ['reallocation_created', '{"demo":true,"hour":11}'],
    ['allocation_created', '{"demo":true,"hour":12}'],
    ['allocation_created', '{"demo":true,"hour":12}'],
    ['allocation_created', '{"demo":true,"hour":13}'],
    ['reallocation_created', '{"demo":true,"hour":13}'],
  ];
  for (const [action, detail] of demoEvents) {
    auditInsert.run(uuidv4(), collegeId, 'user-admin-1', action, 'parking_allocation', uuidv4(), detail);
  }
  console.log('✅ Demo analytics data seeded');

  console.log('\n🎉 Database seeded successfully!\n');
  console.log('╔═══════════════════════════════════════════════════╗');
  console.log('║              DEMO CREDENTIALS                    ║');
  console.log('╠═══════════════════════════════════════════════════╣');
  console.log('║  Admin:   admin@parkpulse.edu   / Admin@123      ║');
  console.log('║  Arun:    arun@student.psg.edu  / Student@123    ║');
  console.log('║  Bala:    bala@student.psg.edu  / Student@123    ║');
  console.log('║  Priya:   priya@student.psg.edu / Student@123    ║');
  console.log('║  Staff:   suresh@staff.psg.edu  / Staff@123      ║');
  console.log('╚═══════════════════════════════════════════════════╝\n');

  process.exit(0);
}

seed().catch(err => {
  console.error('❌ Seed failed:', err);
  process.exit(1);
});
