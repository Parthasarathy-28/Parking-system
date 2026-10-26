// ParkPulse 2.0 Database Seed Script
// Configures Separate Student & Staff Parking Areas + Dijkstra Graph Nodes & Edges
// Run: node db/seed.js

const { getDb } = require('./database');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

async function seed() {
  const db = getDb();
  console.log('🌱 Seeding ParkPulse 2.0 database with Student & Staff separation...');

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
    DELETE FROM map_edges;
    DELETE FROM map_nodes;
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

  // --- Users with Authoritative user_category ---
  const insertUser = db.prepare(`
    INSERT INTO users (id, college_id, name, email, password_hash, role, user_category, vehicle_type)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const users = [
    ['user-admin-1', collegeId, 'Dr. Rajesh Kumar (Admin)', 'admin@parkpulse.edu', adminHash, 'admin', 'admin', null],
    ['user-arun-1', collegeId, 'Arun Krishnamurthy (Student)', 'arun@student.psg.edu', studentHash, 'student', 'student', 'bike'],
    ['user-bala-1', collegeId, 'Balasubramanian Venkat (Student)', 'bala@student.psg.edu', studentHash, 'student', 'student', 'car'],
    ['user-priya-1', collegeId, 'Priya Sundararajan (Student)', 'priya@student.psg.edu', studentHash, 'student', 'student', 'bike'],
    ['user-karthik-1', collegeId, 'Karthikeyan Murugan (Student)', 'karthik@student.psg.edu', studentHash, 'student', 'student', 'car'],
    ['user-meena-1', collegeId, 'Meenakshi Raman (Student)', 'meena@student.psg.edu', studentHash, 'student', 'student', 'bike'],
    ['user-staff-1', collegeId, 'Prof. Suresh Babu (Staff Car)', 'suresh@staff.psg.edu', staffHash, 'staff', 'staff', 'car'],
    ['user-staff-2', collegeId, 'Dr. Kavitha Natarajan (Staff Bike)', 'kavitha@staff.psg.edu', staffHash, 'staff', 'staff', 'bike'],
  ];

  for (const u of users) insertUser.run(...u);
  console.log(`✅ Created ${users.length} users with distinct Student and Staff categories`);

  // --- Parking Zones: Distinct Student & Staff Areas ---
  const insertZone = db.prepare(`
    INSERT INTO parking_zones (id, college_id, name, zone_code, category, vehicle_type, access_policy, staff_only, color, total_capacity)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  // Student Parking Zones
  insertZone.run('zone-bike-a', collegeId, 'Zone A – Student Bike Parking', 'A', 'student', 'bike', 'student_only', 0, '#10B981', 16);
  insertZone.run('zone-car-b', collegeId, 'Zone B – Student Car Parking', 'B', 'student', 'car', 'student_only', 0, '#3B82F6', 12);

  // Staff Parking Zones (Mandatory separate parking area requirement)
  insertZone.run('zone-staff-c', collegeId, 'Zone C – Staff Car Parking', 'C', 'staff', 'car', 'staff_only', 1, '#8B5CF6', 8);
  insertZone.run('zone-staff-d', collegeId, 'Zone D – Staff Bike Parking', 'D', 'staff', 'bike', 'staff_only', 1, '#EC4899', 8);
  console.log('✅ Created 4 separate zones (Student Bikes & Cars, Staff Bikes & Cars)');

  // --- Parking Slots ---
  const insertSlot = db.prepare(`
    INSERT INTO parking_slots (id, college_id, zone_id, slot_number, vehicle_type, allocation_priority, position_x, position_y, access_node_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  // Zone A - Student Bikes (16 slots: A1-A16)
  for (let i = 1; i <= 16; i++) {
    const col = (i - 1) % 4;
    const row = Math.floor((i - 1) / 4);
    insertSlot.run(`slot-a${i}`, collegeId, 'zone-bike-a', `A${i}`, 'bike', i, 60 + col * 90, 80 + row * 70, `lane-a-row${row + 1}`);
  }

  // Zone B - Student Cars (12 slots: B1-B12)
  for (let i = 1; i <= 12; i++) {
    const col = (i - 1) % 3;
    const row = Math.floor((i - 1) / 3);
    insertSlot.run(`slot-b${i}`, collegeId, 'zone-car-b', `B${i}`, 'car', 16 + i, 480 + col * 120, 80 + row * 90, `lane-b-row${row + 1}`);
  }

  // Zone C - Staff Reserved Cars (8 slots: C1-C8)
  for (let i = 1; i <= 8; i++) {
    const col = (i - 1) % 4;
    const row = Math.floor((i - 1) / 4);
    insertSlot.run(`slot-c${i}`, collegeId, 'zone-staff-c', `C${i}`, 'car', 28 + i, 60 + col * 120, 440 + row * 90, `lane-c-row${row + 1}`);
  }

  // Zone D - Staff Reserved Bikes (8 slots: D1-D8)
  for (let i = 1; i <= 8; i++) {
    const col = (i - 1) % 4;
    const row = Math.floor((i - 1) / 4);
    insertSlot.run(`slot-d${i}`, collegeId, 'zone-staff-d', `D${i}`, 'bike', 36 + i, 580 + col * 85, 440 + row * 90, `lane-d-row${row + 1}`);
  }
  console.log('✅ Created 44 parking slots (A1-A16, B1-B12, C1-C8, D1-D8)');

  // --- Map Nodes (Graph Vertices for Navigation) ---
  const insertNode = db.prepare(`
    INSERT INTO map_nodes (id, college_id, node_id, x, y, node_type, label)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const nodes = [
    ['node-entrance', collegeId, 'entrance', 410, 680, 'entrance', 'Main Campus Gate'],
    ['node-exit', collegeId, 'exit', 860, 360, 'exit', 'Campus Exit Gate'],
    ['node-lane-m1', collegeId, 'lane-main-1', 410, 500, 'lane', 'Campus Boulevard South'],
    ['node-lane-m2', collegeId, 'lane-main-2', 410, 430, 'lane', 'Campus Boulevard Central'],
    ['node-lane-m3', collegeId, 'lane-main-3', 410, 360, 'lane', 'Campus Boulevard North'],
    ['node-lane-a-st', collegeId, 'lane-a-start', 150, 500, 'junction', 'Student Bike Parking Entry (Zone A)'],
    ['node-lane-b-st', collegeId, 'lane-b-start', 600, 500, 'junction', 'Student Car Parking Entry (Zone B)'],
    ['node-lane-c-st', collegeId, 'lane-c-start', 150, 360, 'junction', 'Staff Car Parking Entry (Zone C)'],
    ['node-lane-d-st', collegeId, 'lane-d-start', 600, 360, 'junction', 'Staff Bike Parking Entry (Zone D)'],
    // Zone A rows
    ['node-lane-a-r1', collegeId, 'lane-a-row1', 150, 100, 'lane', 'Zone A — Row 1'],
    ['node-lane-a-r2', collegeId, 'lane-a-row2', 150, 170, 'lane', 'Zone A — Row 2'],
    ['node-lane-a-r3', collegeId, 'lane-a-row3', 150, 240, 'lane', 'Zone A — Row 3'],
    ['node-lane-a-r4', collegeId, 'lane-a-row4', 150, 310, 'lane', 'Zone A — Row 4'],
    // Zone B rows
    ['node-lane-b-r1', collegeId, 'lane-b-row1', 600, 100, 'lane', 'Zone B — Row 1'],
    ['node-lane-b-r2', collegeId, 'lane-b-row2', 600, 190, 'lane', 'Zone B — Row 2'],
    ['node-lane-b-r3', collegeId, 'lane-b-row3', 600, 280, 'lane', 'Zone B — Row 3'],
    ['node-lane-b-r4', collegeId, 'lane-b-row4', 600, 370, 'lane', 'Zone B — Row 4'],
    // Zone C rows
    ['node-lane-c-r1', collegeId, 'lane-c-row1', 150, 440, 'lane', 'Zone C — Row 1'],
    ['node-lane-c-r2', collegeId, 'lane-c-row2', 150, 530, 'lane', 'Zone C — Row 2'],
    // Zone D rows
    ['node-lane-d-r1', collegeId, 'lane-d-row1', 600, 440, 'lane', 'Zone D — Row 1'],
    ['node-lane-d-r2', collegeId, 'lane-d-row2', 600, 530, 'lane', 'Zone D — Row 2'],
  ];

  for (const n of nodes) insertNode.run(...n);
  console.log(`✅ Seeded ${nodes.length} map graph nodes into database`);

  // --- Map Edges (Graph Connections) ---
  const insertEdge = db.prepare(`
    INSERT INTO map_edges (id, college_id, from_node_id, to_node_id, distance, direction)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const edges = [
    ['entrance', 'lane-main-1', 1.0],
    ['lane-main-1', 'lane-a-start', 1.0],
    ['lane-main-1', 'lane-b-start', 1.0],
    ['lane-main-1', 'lane-main-2', 1.0],
    ['lane-main-2', 'lane-main-3', 1.0],
    ['lane-main-3', 'lane-c-start', 1.0],
    ['lane-main-3', 'lane-d-start', 1.0],
    ['lane-main-3', 'exit', 2.0],
    // Zone A
    ['lane-a-start', 'lane-a-row1', 1.0],
    ['lane-a-row1', 'lane-a-row2', 1.0],
    ['lane-a-row2', 'lane-a-row3', 1.0],
    ['lane-a-row3', 'lane-a-row4', 1.0],
    // Zone B
    ['lane-b-start', 'lane-b-row1', 1.0],
    ['lane-b-row1', 'lane-b-row2', 1.0],
    ['lane-b-row2', 'lane-b-row3', 1.0],
    ['lane-b-row3', 'lane-b-row4', 1.0],
    // Zone C
    ['lane-c-start', 'lane-c-row1', 1.0],
    ['lane-c-row1', 'lane-c-row2', 1.0],
    // Zone D
    ['lane-d-start', 'lane-d-row1', 1.0],
    ['lane-d-row1', 'lane-d-row2', 1.0],
  ];

  for (const [from, to, dist] of edges) {
    insertEdge.run(uuidv4(), collegeId, from, to, dist, 'two_way');
  }
  console.log(`✅ Seeded ${edges.length} lane graph connections into database`);

  // --- Geofence Settings (PSG Tech approximate coords) ---
  db.prepare(`
    INSERT INTO geofence_settings (id, college_id, campus_lat, campus_lng, campus_radius_m, parking_entry_lat, parking_entry_lng, parking_entry_radius_m, min_accuracy_m)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(uuidv4(), collegeId, 11.0238, 77.0069, 500, 11.0245, 77.0072, 150, 50);
  console.log('✅ Geofence configured (PSG Tech, Coimbatore)');

  // --- Demo audit data for analytics ---
  const auditInsert = db.prepare(`
    INSERT INTO audit_logs (id, college_id, user_id, action, entity_type, entity_id, details)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const demoEvents = [
    ['allocation_created', '{"demo":true,"hour":8,"zone":"Zone A"}'],
    ['allocation_created', '{"demo":true,"hour":9,"zone":"Zone B"}'],
    ['allocation_created', '{"demo":true,"hour":9,"zone":"Zone A"}'],
    ['allocation_created', '{"demo":true,"hour":10,"zone":"Zone C"}'],
    ['allocation_created', '{"demo":true,"hour":10,"zone":"Zone B"}'],
    ['allocation_created', '{"demo":true,"hour":10,"zone":"Zone D"}'],
    ['allocation_expired', '{"demo":true,"hour":10}'],
    ['allocation_created', '{"demo":true,"hour":11,"zone":"Zone A"}'],
    ['reallocation_created', '{"demo":true,"hour":11}'],
    ['allocation_created', '{"demo":true,"hour":12,"zone":"Zone B"}'],
    ['allocation_created', '{"demo":true,"hour":12,"zone":"Zone C"}'],
    ['allocation_created', '{"demo":true,"hour":13,"zone":"Zone D"}'],
  ];

  for (const [action, detail] of demoEvents) {
    auditInsert.run(uuidv4(), collegeId, 'user-admin-1', action, 'parking_allocation', uuidv4(), detail);
  }
  console.log('✅ Demo analytics data seeded');

  console.log('\n🎉 ParkPulse 2.0 Database seeded successfully!\n');
  console.log('╔══════════════════════════════════════════════════════════════════════╗');
  console.log('║                     PARKPULSE 2.0 DEMO CREDENTIALS                   ║');
  console.log('╠══════════════════════════════════════════════════════════════════════╣');
  console.log('║  Admin:        admin@parkpulse.edu   / Admin@123                     ║');
  console.log('║  Student Bike: arun@student.psg.edu  / Student@123  (Zone A)         ║');
  console.log('║  Student Car:  bala@student.psg.edu  / Student@123  (Zone B)         ║');
  console.log('║  Staff Car:    suresh@staff.psg.edu  / Staff@123    (Zone C)         ║');
  console.log('║  Staff Bike:   kavitha@staff.psg.edu / Staff@123    (Zone D)         ║');
  console.log('╚══════════════════════════════════════════════════════════════════════╝\n');

  process.exit(0);
}

seed().catch(err => {
  console.error('❌ Seed failed:', err);
  process.exit(1);
});
