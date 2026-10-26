// Admin routes
const express = require('express');
const { z } = require('zod');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db/database');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { reallocateIfNeeded, processQueueForSlot, logAudit, createNotification, broadcastSlotUpdate, broadcastToCollege } = require('../services/allocationEngine');

const router = express.Router();

// GET /api/admin/dashboard
router.get('/dashboard', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const collegeId = req.collegeId;

  const stats = db.prepare(`
    SELECT
      COUNT(*) as total_slots,
      SUM(CASE WHEN ps.operational_status = 'available' AND ps.occupancy_status = 'free' THEN 1 ELSE 0 END) as available,
      SUM(CASE WHEN ps.occupancy_status = 'held' THEN 1 ELSE 0 END) as held,
      SUM(CASE WHEN ps.occupancy_status = 'occupied' THEN 1 ELSE 0 END) as occupied,
      SUM(CASE WHEN ps.operational_status = 'blocked' THEN 1 ELSE 0 END) as blocked,
      SUM(CASE WHEN ps.operational_status = 'maintenance' THEN 1 ELSE 0 END) as maintenance
    FROM parking_slots ps WHERE college_id = ?
  `).get(collegeId);

  const queueStats = db.prepare(`
    SELECT vehicle_type, COUNT(*) as count
    FROM waiting_queue WHERE college_id = ? AND status = 'waiting'
    GROUP BY vehicle_type
  `).all(collegeId);

  const zoneStats = db.prepare(`
    SELECT pz.name, pz.zone_code, pz.vehicle_type, pz.staff_only,
      COUNT(ps.id) as total,
      SUM(CASE WHEN ps.operational_status = 'available' AND ps.occupancy_status = 'free' THEN 1 ELSE 0 END) as available,
      SUM(CASE WHEN ps.occupancy_status = 'held' THEN 1 ELSE 0 END) as held,
      SUM(CASE WHEN ps.occupancy_status = 'occupied' THEN 1 ELSE 0 END) as occupied,
      SUM(CASE WHEN ps.operational_status = 'blocked' THEN 1 ELSE 0 END) as blocked
    FROM parking_zones pz
    LEFT JOIN parking_slots ps ON pz.id = ps.zone_id
    WHERE pz.college_id = ?
    GROUP BY pz.id ORDER BY pz.zone_code
  `).all(collegeId);

  const activeAllocations = db.prepare(`
    SELECT pa.*, u.name as user_name, u.email, u.role, ps.slot_number, pz.name as zone_name
    FROM parking_allocations pa
    JOIN users u ON pa.user_id = u.id
    JOIN parking_slots ps ON pa.slot_id = ps.id
    JOIN parking_zones pz ON ps.zone_id = pz.id
    WHERE pa.college_id = ? AND pa.status IN ('held', 'confirmed')
    ORDER BY pa.created_at DESC
  `).all(collegeId);

  const queueList = db.prepare(`
    SELECT wq.*, u.name as user_name, u.email
    FROM waiting_queue wq JOIN users u ON wq.user_id = u.id
    WHERE wq.college_id = ? AND wq.status IN ('waiting', 'offered')
    ORDER BY wq.queue_position ASC
  `).all(collegeId);

  const recentAudit = db.prepare(`
    SELECT al.*, u.name as user_name FROM audit_logs al
    LEFT JOIN users u ON al.user_id = u.id
    WHERE al.college_id = ? ORDER BY al.created_at DESC LIMIT 20
  `).all(collegeId);

  // Student vs Staff split stats
  const roleStats = db.prepare(`
    SELECT
      pz.staff_only,
      pz.vehicle_type,
      COUNT(ps.id) as total,
      SUM(CASE WHEN ps.operational_status = 'available' AND ps.occupancy_status = 'free' THEN 1 ELSE 0 END) as available,
      SUM(CASE WHEN ps.occupancy_status = 'held' THEN 1 ELSE 0 END) as held,
      SUM(CASE WHEN ps.occupancy_status = 'occupied' THEN 1 ELSE 0 END) as occupied,
      SUM(CASE WHEN ps.operational_status = 'blocked' THEN 1 ELSE 0 END) as blocked
    FROM parking_zones pz
    LEFT JOIN parking_slots ps ON pz.id = ps.zone_id
    WHERE pz.college_id = ?
    GROUP BY pz.staff_only, pz.vehicle_type
    ORDER BY pz.staff_only ASC, pz.vehicle_type ASC
  `).all(collegeId);

  return res.json({ stats, queueStats, zoneStats, activeAllocations, queueList, recentAudit, roleStats });
});

// GET /api/admin/slots
router.get('/slots', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const slots = db.prepare(`
    SELECT ps.*, pz.name as zone_name, pz.zone_code, pz.vehicle_type as zone_vehicle_type,
           pa.id as active_allocation_id, pa.status as allocation_status,
           u.name as allocated_user_name, u.email as allocated_user_email
    FROM parking_slots ps
    JOIN parking_zones pz ON ps.zone_id = pz.id
    LEFT JOIN parking_allocations pa ON ps.current_allocation_id = pa.id AND pa.status IN ('held','confirmed')
    LEFT JOIN users u ON pa.user_id = u.id
    WHERE ps.college_id = ?
    ORDER BY ps.allocation_priority ASC
  `).all(req.collegeId);

  return res.json({ slots });
});

// POST /api/admin/slots
router.post('/slots', requireAuth, requireAdmin, (req, res) => {
  const schema = z.object({
    zoneId: z.string(),
    slotNumber: z.string().min(1).max(20),
    vehicleType: z.enum(['bike', 'car']),
    allocationPriority: z.number().int().positive(),
    positionX: z.number().optional().default(0),
    positionY: z.number().optional().default(0),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid slot data.', details: parsed.error.issues });

  const { zoneId, slotNumber, vehicleType, allocationPriority, positionX, positionY } = parsed.data;
  const db = getDb();

  // Verify zone belongs to college
  const zone = db.prepare('SELECT * FROM parking_zones WHERE id = ? AND college_id = ?').get(zoneId, req.collegeId);
  if (!zone) return res.status(404).json({ error: 'Zone not found.' });

  // Check for duplicate slot number
  const existing = db.prepare('SELECT id FROM parking_slots WHERE college_id = ? AND slot_number = ?').get(req.collegeId, slotNumber);
  if (existing) return res.status(409).json({ error: `Slot number ${slotNumber} already exists.` });

  const slotId = uuidv4();
  db.prepare(`
    INSERT INTO parking_slots (id, college_id, zone_id, slot_number, vehicle_type, allocation_priority, position_x, position_y)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(slotId, req.collegeId, zoneId, slotNumber, vehicleType, allocationPriority, positionX, positionY);

  // Update zone capacity
  db.prepare(`UPDATE parking_zones SET total_capacity = total_capacity + 1 WHERE id = ?`).run(zoneId);

  logAudit(db, req.collegeId, req.user.id, 'slot_created', 'parking_slot', slotId, { slotNumber, vehicleType });
  broadcastToCollege(req.collegeId, 'slot:created', { slotId, slotNumber });

  return res.status(201).json({ success: true, slotId });
});

// PATCH /api/admin/slots/:slotId
router.patch('/slots/:slotId', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const slot = db.prepare('SELECT * FROM parking_slots WHERE id = ? AND college_id = ?').get(req.params.slotId, req.collegeId);
  if (!slot) return res.status(404).json({ error: 'Slot not found.' });

  const schema = z.object({
    allocationPriority: z.number().int().positive().optional(),
    positionX: z.number().optional(),
    positionY: z.number().optional(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid data.' });

  if (parsed.data.allocationPriority !== undefined) {
    db.prepare('UPDATE parking_slots SET allocation_priority = ?, last_updated = CURRENT_TIMESTAMP WHERE id = ?').run(parsed.data.allocationPriority, slot.id);
  }

  logAudit(db, req.collegeId, req.user.id, 'slot_updated', 'parking_slot', slot.id, parsed.data);
  return res.json({ success: true });
});

// POST /api/admin/slots/:slotId/block
router.post('/slots/:slotId/block', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const slot = db.prepare('SELECT * FROM parking_slots WHERE id = ? AND college_id = ?').get(req.params.slotId, req.collegeId);
  if (!slot) return res.status(404).json({ error: 'Slot not found.' });

  const schema = z.object({
    action: z.enum(['block_after_session', 'cancel_and_block']).optional().default('block_after_session'),
    reason: z.string().optional(),
  });
  const { action, reason } = schema.parse(req.body || {});

  // Check if held or occupied
  if (slot.occupancy_status === 'held' || slot.occupancy_status === 'occupied') {
    if (action === 'block_after_session') {
      // Just mark operational status, keep occupancy intact
      db.prepare(`UPDATE parking_slots SET operational_status = 'blocked', last_updated = CURRENT_TIMESTAMP WHERE id = ?`).run(slot.id);
      logAudit(db, req.collegeId, req.user.id, 'slot_blocked', 'parking_slot', slot.id, { action: 'after_session', reason });
      return res.json({ success: true, message: `Slot ${slot.slot_number} will be blocked after current session ends.` });
    } else if (action === 'cancel_and_block') {
      // Cancel any held allocation and reallocate
      const heldAlloc = db.prepare('SELECT * FROM parking_allocations WHERE slot_id = ? AND status = ?').get(slot.id, 'held');
      if (heldAlloc) {
        // This triggers automatic reallocation
        db.prepare('UPDATE parking_slots SET occupancy_status = \'free\', current_allocation_id = NULL WHERE id = ?').run(slot.id);
        reallocateIfNeeded(db, req.collegeId, slot.id);
      }
      db.prepare(`UPDATE parking_slots SET operational_status = 'blocked', last_updated = CURRENT_TIMESTAMP WHERE id = ?`).run(slot.id);
      logAudit(db, req.collegeId, req.user.id, 'slot_blocked_forced', 'parking_slot', slot.id, { reason });
      broadcastSlotUpdate(slot.id, 'slot:blocked', { slotId: slot.id, slotNumber: slot.slot_number });
      return res.json({ success: true, message: `Slot ${slot.slot_number} blocked and student reallocated.` });
    }
  }

  // Simple block for available/free slot
  db.prepare(`UPDATE parking_slots SET operational_status = 'blocked', last_updated = CURRENT_TIMESTAMP WHERE id = ?`).run(slot.id);
  logAudit(db, req.collegeId, req.user.id, 'slot_blocked', 'parking_slot', slot.id, { reason });
  broadcastSlotUpdate(slot.id, 'slot:blocked', { slotId: slot.id, slotNumber: slot.slot_number });

  return res.json({ success: true, message: `Slot ${slot.slot_number} blocked.` });
});

// POST /api/admin/slots/:slotId/unblock
router.post('/slots/:slotId/unblock', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const slot = db.prepare('SELECT * FROM parking_slots WHERE id = ? AND college_id = ?').get(req.params.slotId, req.collegeId);
  if (!slot) return res.status(404).json({ error: 'Slot not found.' });

  db.prepare(`UPDATE parking_slots SET operational_status = 'available', last_updated = CURRENT_TIMESTAMP WHERE id = ?`).run(slot.id);
  logAudit(db, req.collegeId, req.user.id, 'slot_unblocked', 'parking_slot', slot.id, {});
  broadcastSlotUpdate(slot.id, 'slot:unblocked', { slotId: slot.id, slotNumber: slot.slot_number });

  // Check if anyone in queue can now get this slot
  processQueueForSlot(req.collegeId, slot.vehicle_type);

  return res.json({ success: true });
});

// POST /api/admin/slots/priority
router.post('/slots/priority', requireAuth, requireAdmin, (req, res) => {
  const schema = z.object({
    priorities: z.array(z.object({ slotId: z.string(), priority: z.number().int().positive() }))
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid priority data.' });

  const db = getDb();
  const update = db.prepare('UPDATE parking_slots SET allocation_priority = ?, last_updated = CURRENT_TIMESTAMP WHERE id = ? AND college_id = ?');

  const updateAll = db.transaction(() => {
    for (const { slotId, priority } of parsed.data.priorities) {
      update.run(priority, slotId, req.collegeId);
    }
  });
  updateAll();

  logAudit(db, req.collegeId, req.user.id, 'priorities_updated', 'parking_slot', null, { count: parsed.data.priorities.length });
  broadcastToCollege(req.collegeId, 'slot:priority_updated', {});

  return res.json({ success: true });
});

// GET /api/admin/zones
router.get('/zones', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const zones = db.prepare(`
    SELECT pz.*,
      COUNT(ps.id) as total_slots,
      SUM(CASE WHEN ps.operational_status = 'available' AND ps.occupancy_status = 'free' THEN 1 ELSE 0 END) as available,
      SUM(CASE WHEN ps.occupancy_status = 'occupied' THEN 1 ELSE 0 END) as occupied
    FROM parking_zones pz
    LEFT JOIN parking_slots ps ON pz.id = ps.zone_id
    WHERE pz.college_id = ?
    GROUP BY pz.id ORDER BY pz.zone_code
  `).all(req.collegeId);
  return res.json({ zones });
});

// POST /api/admin/zones
router.post('/zones', requireAuth, requireAdmin, (req, res) => {
  const schema = z.object({
    name: z.string().min(2),
    zoneCode: z.string().min(1).max(10),
    vehicleType: z.enum(['bike', 'car', 'any']),
    staffOnly: z.boolean().optional().default(false),
    color: z.string().optional().default('#10B981'),
    description: z.string().optional(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid zone data.' });

  const { name, zoneCode, vehicleType, staffOnly, color, description } = parsed.data;
  const db = getDb();

  const zoneId = uuidv4();
  db.prepare(`
    INSERT INTO parking_zones (id, college_id, name, zone_code, vehicle_type, staff_only, color, description)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(zoneId, req.collegeId, name, zoneCode, vehicleType, staffOnly ? 1 : 0, color, description || null);

  logAudit(db, req.collegeId, req.user.id, 'zone_created', 'parking_zone', zoneId, { name, zoneCode });
  return res.status(201).json({ success: true, zoneId });
});

// GET /api/admin/geofence
router.get('/geofence', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const settings = db.prepare('SELECT * FROM geofence_settings WHERE college_id = ?').get(req.collegeId);
  return res.json({ settings });
});

// POST /api/admin/geofence
router.post('/geofence', requireAuth, requireAdmin, (req, res) => {
  const schema = z.object({
    campusLat: z.number().min(-90).max(90),
    campusLng: z.number().min(-180).max(180),
    campusRadiusM: z.number().positive().max(5000),
    parkingEntryLat: z.number().min(-90).max(90),
    parkingEntryLng: z.number().min(-180).max(180),
    parkingEntryRadiusM: z.number().positive().max(500),
    minAccuracyM: z.number().positive().max(200),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid geofence data.', details: parsed.error.issues });

  const { campusLat, campusLng, campusRadiusM, parkingEntryLat, parkingEntryLng, parkingEntryRadiusM, minAccuracyM } = parsed.data;
  const db = getDb();

  const existing = db.prepare('SELECT id FROM geofence_settings WHERE college_id = ?').get(req.collegeId);
  if (existing) {
    db.prepare(`
      UPDATE geofence_settings SET campus_lat=?, campus_lng=?, campus_radius_m=?,
        parking_entry_lat=?, parking_entry_lng=?, parking_entry_radius_m=?, min_accuracy_m=?,
        updated_at=CURRENT_TIMESTAMP WHERE college_id=?
    `).run(campusLat, campusLng, campusRadiusM, parkingEntryLat, parkingEntryLng, parkingEntryRadiusM, minAccuracyM, req.collegeId);
  } else {
    db.prepare(`
      INSERT INTO geofence_settings (id, college_id, campus_lat, campus_lng, campus_radius_m, parking_entry_lat, parking_entry_lng, parking_entry_radius_m, min_accuracy_m)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(uuidv4(), req.collegeId, campusLat, campusLng, campusRadiusM, parkingEntryLat, parkingEntryLng, parkingEntryRadiusM, minAccuracyM);
  }

  logAudit(db, req.collegeId, req.user.id, 'geofence_updated', 'geofence_settings', null, { campusLat, campusLng });
  broadcastToCollege(req.collegeId, 'geofence:updated', {});

  return res.json({ success: true });
});

// POST /api/admin/simulate-occupancy
router.post('/simulate-occupancy', requireAuth, requireAdmin, (req, res) => {
  const schema = z.object({
    slotId: z.string(),
    eventType: z.enum(['vehicle_entered', 'vehicle_exited', 'unexpected_occupancy', 'slot_unavailable', 'slot_available']),
    notes: z.string().optional(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid event data.' });

  const { slotId, eventType, notes } = parsed.data;
  const db = getDb();

  const slot = db.prepare('SELECT ps.*, pz.vehicle_type as zone_vehicle_type FROM parking_slots ps JOIN parking_zones pz ON ps.zone_id = pz.id WHERE ps.id = ? AND ps.college_id = ?').get(slotId, req.collegeId);
  if (!slot) return res.status(404).json({ error: 'Slot not found.' });

  // Log occupancy event
  db.prepare(`
    INSERT INTO occupancy_events (id, college_id, slot_id, event_type, triggered_by, triggered_by_user_id, notes)
    VALUES (?, ?, ?, ?, 'admin_simulated', ?, ?)
  `).run(uuidv4(), req.collegeId, slotId, eventType, req.user.id, notes || null);

  // Apply the event
  let updateMsg = '';
  switch (eventType) {
    case 'vehicle_entered':
      db.prepare(`UPDATE parking_slots SET occupancy_status = 'occupied', last_updated = CURRENT_TIMESTAMP WHERE id = ?`).run(slotId);
      broadcastSlotUpdate(slotId, 'slot:occupied', { slotId, slotNumber: slot.slot_number });
      updateMsg = `Slot ${slot.slot_number} marked as occupied`;
      break;

    case 'vehicle_exited':
      // Only mark as free if not in a confirmed session
      const confirmedAlloc = db.prepare('SELECT * FROM parking_allocations WHERE slot_id = ? AND status = ?').get(slotId, 'confirmed');
      if (!confirmedAlloc) {
        db.prepare(`UPDATE parking_slots SET occupancy_status = 'free', current_allocation_id = NULL, last_updated = CURRENT_TIMESTAMP WHERE id = ?`).run(slotId);
        broadcastSlotUpdate(slotId, 'slot:released', { slotId, slotNumber: slot.slot_number });
        processQueueForSlot(req.collegeId, slot.vehicle_type);
      }
      updateMsg = `Slot ${slot.slot_number} vehicle exit simulated`;
      break;

    case 'unexpected_occupancy':
      // This is the REALLOCATION scenario
      db.prepare(`UPDATE parking_slots SET occupancy_status = 'occupied', last_updated = CURRENT_TIMESTAMP WHERE id = ?`).run(slotId);
      // Check for held allocation and trigger reallocation
      reallocateIfNeeded(db, req.collegeId, slotId);
      broadcastSlotUpdate(slotId, 'slot:occupied', { slotId, slotNumber: slot.slot_number, type: 'unexpected' });
      updateMsg = `Unexpected occupancy at ${slot.slot_number} — reallocation triggered if held`;
      break;

    case 'slot_unavailable':
      db.prepare(`UPDATE parking_slots SET operational_status = 'maintenance', last_updated = CURRENT_TIMESTAMP WHERE id = ?`).run(slotId);
      broadcastSlotUpdate(slotId, 'slot:blocked', { slotId, slotNumber: slot.slot_number });
      updateMsg = `Slot ${slot.slot_number} marked as unavailable`;
      break;

    case 'slot_available':
      db.prepare(`UPDATE parking_slots SET operational_status = 'available', occupancy_status = 'free', last_updated = CURRENT_TIMESTAMP WHERE id = ?`).run(slotId);
      broadcastSlotUpdate(slotId, 'slot:unblocked', { slotId, slotNumber: slot.slot_number });
      processQueueForSlot(req.collegeId, slot.vehicle_type);
      updateMsg = `Slot ${slot.slot_number} marked as available`;
      break;
  }

  logAudit(db, req.collegeId, req.user.id, 'sensor_simulated', 'parking_slot', slotId, { eventType, notes });
  return res.json({ success: true, message: updateMsg });
});

// GET /api/admin/analytics
router.get('/analytics', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const collegeId = req.collegeId;

  // Hourly allocation counts (last 24 hours + demo data)
  const hourlyAllocations = db.prepare(`
    SELECT
      strftime('%H', created_at) as hour,
      COUNT(*) as count,
      MAX(CASE WHEN json_extract(details, '$.demo') = 1 THEN 1 ELSE 0 END) as has_demo
    FROM audit_logs
    WHERE college_id = ? AND action = 'allocation_created'
    GROUP BY hour ORDER BY hour
  `).all(collegeId);

  // Reallocation events
  const reallocations = db.prepare(`
    SELECT COUNT(*) as count FROM audit_logs
    WHERE college_id = ? AND action = 'reallocation_created'
  `).get(collegeId);

  // Expired holds
  const expiredHolds = db.prepare(`
    SELECT COUNT(*) as count FROM parking_allocations
    WHERE college_id = ? AND status = 'expired'
  `).get(collegeId);

  // Zone occupancy
  const zoneOccupancy = db.prepare(`
    SELECT pz.name, pz.zone_code,
      SUM(CASE WHEN ps.occupancy_status = 'occupied' THEN 1 ELSE 0 END) as occupied,
      SUM(CASE WHEN ps.operational_status = 'available' AND ps.occupancy_status = 'free' THEN 1 ELSE 0 END) as available,
      COUNT(ps.id) as total
    FROM parking_zones pz
    LEFT JOIN parking_slots ps ON pz.id = ps.zone_id
    WHERE pz.college_id = ?
    GROUP BY pz.id
  `).all(collegeId);

  // Recent sessions
  const recentSessions = db.prepare(`
    SELECT ps.*, u.name as user_name, sl.slot_number, pz.name as zone_name
    FROM parking_sessions ps
    JOIN users u ON ps.user_id = u.id
    JOIN parking_slots sl ON ps.slot_id = sl.id
    JOIN parking_zones pz ON sl.zone_id = pz.id
    WHERE ps.college_id = ?
    ORDER BY ps.started_at DESC LIMIT 10
  `).all(collegeId);

  // Total requests today
  const todayRequests = db.prepare(`
    SELECT COUNT(*) as count FROM parking_requests
    WHERE college_id = ? AND date(created_at) = date('now')
  `).get(collegeId);

  return res.json({
    hourlyAllocations,
    reallocations: reallocations.count,
    expiredHolds: expiredHolds.count,
    zoneOccupancy,
    recentSessions,
    todayRequests: todayRequests.count,
  });
});

// POST /api/admin/manual-location-approval
router.post('/manual-location-approval', requireAuth, requireAdmin, (req, res) => {
  const schema = z.object({
    userId: z.string(),
    reason: z.string().min(5),
    expiresInMinutes: z.number().int().min(5).max(60).default(15),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid data.' });

  const { userId, reason, expiresInMinutes } = parsed.data;
  const db = getDb();

  const user = db.prepare('SELECT * FROM users WHERE id = ? AND college_id = ?').get(userId, req.collegeId);
  if (!user) return res.status(404).json({ error: 'User not found.' });

  const expiresAt = new Date(Date.now() + expiresInMinutes * 60000).toISOString();
  const approvalId = uuidv4();

  db.prepare(`
    INSERT INTO location_approvals (id, college_id, user_id, approved_by, reason, expires_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(approvalId, req.collegeId, userId, req.user.id, reason, expiresAt);

  logAudit(db, req.collegeId, req.user.id, 'manual_approval_granted', 'location_approval', approvalId, { targetUser: userId, reason });

  return res.json({ success: true, approvalId, expiresAt });
});

// POST /api/admin/reset-demo
router.post('/reset-demo', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const collegeId = req.collegeId;

  db.transaction(() => {
    // Cancel all active allocations
    db.prepare(`UPDATE parking_allocations SET status = 'cancelled', cancelled_at = CURRENT_TIMESTAMP WHERE college_id = ? AND status IN ('held', 'confirmed')`).run(collegeId);

    // Close all sessions
    db.prepare(`UPDATE parking_sessions SET ended_at = CURRENT_TIMESTAMP WHERE college_id = ? AND ended_at IS NULL`).run(collegeId);

    // Clear queue
    db.prepare(`UPDATE waiting_queue SET status = 'cancelled' WHERE college_id = ? AND status IN ('waiting', 'offered')`).run(collegeId);

    // Reset all slots to available/free
    db.prepare(`UPDATE parking_slots SET occupancy_status = 'free', operational_status = 'available', current_allocation_id = NULL, last_updated = CURRENT_TIMESTAMP WHERE college_id = ?`).run(collegeId);

    // Reset priority to default (1-36 by slot order)
    const slots = db.prepare(`SELECT id FROM parking_slots WHERE college_id = ? ORDER BY slot_number ASC`).all(collegeId);
    slots.forEach((s, i) => {
      db.prepare('UPDATE parking_slots SET allocation_priority = ? WHERE id = ?').run(i + 1, s.id);
    });

    // Mark requests as cancelled
    db.prepare(`UPDATE parking_requests SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE college_id = ? AND status IN ('pending', 'allocated', 'queued')`).run(collegeId);
  })();

  logAudit(db, collegeId, req.user.id, 'demo_reset', 'college', collegeId, {});
  broadcastToCollege(collegeId, 'demo:reset', {});

  return res.json({ success: true, message: 'Demo data reset. All slots are now available.' });
});

// GET /api/admin/users
router.get('/users', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const users = db.prepare(`SELECT id, name, email, role, vehicle_type, is_active, created_at FROM users WHERE college_id = ? ORDER BY role, name`).all(req.collegeId);
  return res.json({ users });
});

module.exports = router;
