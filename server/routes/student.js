// Student routes
const express = require('express');
const { z } = require('zod');
const { getDb } = require('../db/database');
const { requireAuth, requireStudent } = require('../middleware/auth');
const { verifyGeofence } = require('../lib/geofence');
const { processRequest, confirmParking, exitParking, cancelAllocation, acceptQueueOffer } = require('../services/allocationEngine');
const { getRouteToSlot } = require('../lib/dijkstra');
const rateLimit = require('express-rate-limit');

const router = express.Router();

const requestLimiter = rateLimit({ windowMs: 60000, max: 5 });

// GET /api/student/dashboard
router.get('/dashboard', requireAuth, requireStudent, (req, res) => {
  const db = getDb();
  const userId = req.user.id;
  const collegeId = req.collegeId;

  const activeAllocation = db.prepare(`
    SELECT pa.*, ps.slot_number, ps.vehicle_type as slot_vehicle_type, ps.position_x, ps.position_y,
           pz.name as zone_name, pz.zone_code
    FROM parking_allocations pa
    JOIN parking_slots ps ON pa.slot_id = ps.id
    JOIN parking_zones pz ON ps.zone_id = pz.id
    WHERE pa.user_id = ? AND pa.status IN ('held', 'confirmed')
  `).get(userId);

  const queueEntry = db.prepare(`
    SELECT * FROM waiting_queue WHERE user_id = ? AND status IN ('waiting', 'offered')
  `).get(userId);

  const availableByType = db.prepare(`
    SELECT ps.vehicle_type, pz.staff_only,
           COUNT(*) as available,
           SUM(CASE WHEN ps.occupancy_status = 'held' THEN 1 ELSE 0 END) as held,
           SUM(CASE WHEN ps.occupancy_status = 'occupied' THEN 1 ELSE 0 END) as occupied,
           SUM(CASE WHEN ps.operational_status = 'blocked' THEN 1 ELSE 0 END) as blocked
    FROM parking_slots ps
    JOIN parking_zones pz ON ps.zone_id = pz.id
    WHERE ps.college_id = ?
    GROUP BY ps.vehicle_type, pz.staff_only
  `).all(collegeId);

  const recentHistory = db.prepare(`
    SELECT pa.*, ps.slot_number, pz.name as zone_name
    FROM parking_allocations pa
    JOIN parking_slots ps ON pa.slot_id = ps.id
    JOIN parking_zones pz ON ps.zone_id = pz.id
    WHERE pa.user_id = ? AND pa.status NOT IN ('held', 'confirmed')
    ORDER BY pa.created_at DESC LIMIT 10
  `).all(userId);

  const notifications = db.prepare(`
    SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 20
  `).all(userId);

  const unreadCount = db.prepare(`SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = 0`).get(userId);

  res.json({
    user: {
      id: req.user.id,
      name: req.user.name,
      role: req.user.role,
      vehicleType: req.user.vehicle_type,
    },
    activeAllocation,
    queueEntry,
    availability: availableByType,
    recentHistory,
    notifications,
    unreadCount: unreadCount.count,
  });
});

// POST /api/student/verify-location
router.post('/verify-location', requireAuth, requireStudent, (req, res) => {
  const schema = z.object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
    accuracy: z.number().positive(),
    isDemoMode: z.boolean().optional().default(false),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid location data.', details: parsed.error.issues });
  }

  const { lat, lng, accuracy, isDemoMode } = parsed.data;
  const db = getDb();

  const geofenceSettings = db.prepare('SELECT * FROM geofence_settings WHERE college_id = ?').get(req.collegeId);
  if (!geofenceSettings) {
    return res.status(500).json({ error: 'Geofence not configured for this college.' });
  }

  // In demo mode, we still verify but log it clearly
  const result = verifyGeofence(lat, lng, accuracy, geofenceSettings);

  // Log location check (coarse — no precise coords stored in production)
  const db2 = getDb();
  db2.prepare(`
    INSERT INTO audit_logs (id, college_id, user_id, action, details)
    VALUES (?, ?, ?, 'location_verified', ?)
  `).run(
    require('uuid').v4(),
    req.collegeId, req.user.id,
    JSON.stringify({
      status: result.status,
      isDemoMode,
      // Only coarse info stored
      distanceToCampus: result.distanceToCampus,
      distanceToParkingEntry: result.distanceToParkingEntry,
    })
  );

  return res.json({
    ...result,
    isDemoMode,
    eligible: result.insideParkingEntry,
    geofenceSettings: {
      campusRadius: geofenceSettings.campus_radius_m,
      parkingEntryRadius: geofenceSettings.parking_entry_radius_m,
      minAccuracy: geofenceSettings.min_accuracy_m,
    }
  });
});

// GET /api/student/availability
router.get('/availability', requireAuth, (req, res) => {
  const db = getDb();
  const zones = db.prepare(`
    SELECT pz.*, 
      COUNT(ps.id) as total_slots,
      SUM(CASE WHEN ps.operational_status = 'available' AND ps.occupancy_status = 'free' THEN 1 ELSE 0 END) as available,
      SUM(CASE WHEN ps.occupancy_status = 'held' THEN 1 ELSE 0 END) as held,
      SUM(CASE WHEN ps.occupancy_status = 'occupied' THEN 1 ELSE 0 END) as occupied,
      SUM(CASE WHEN ps.operational_status = 'blocked' THEN 1 ELSE 0 END) as blocked,
      SUM(CASE WHEN ps.operational_status = 'maintenance' THEN 1 ELSE 0 END) as maintenance
    FROM parking_zones pz
    LEFT JOIN parking_slots ps ON pz.id = ps.zone_id
    WHERE pz.college_id = ?
    GROUP BY pz.id
    ORDER BY pz.zone_code
  `).all(req.collegeId);

  const queueStats = db.prepare(`
    SELECT vehicle_type, COUNT(*) as count
    FROM waiting_queue WHERE college_id = ? AND status = 'waiting'
    GROUP BY vehicle_type
  `).all(req.collegeId);

  return res.json({ zones, queueStats });
});

// GET /api/student/slots-map — slot positions and statuses for the parking map SVG
router.get('/slots-map', requireAuth, requireStudent, (req, res) => {
  const db = getDb();
  const slots = db.prepare(`
    SELECT ps.id, ps.slot_number, ps.vehicle_type, ps.operational_status, ps.occupancy_status,
           ps.position_x, ps.position_y, ps.allocation_priority,
           pz.name as zone_name, pz.zone_code, pz.staff_only, pz.color,
           CASE WHEN pa.user_id = ? THEN 1 ELSE 0 END as is_mine
    FROM parking_slots ps
    JOIN parking_zones pz ON ps.zone_id = pz.id
    LEFT JOIN parking_allocations pa ON ps.current_allocation_id = pa.id AND pa.status IN ('held','confirmed')
    WHERE ps.college_id = ?
    ORDER BY ps.allocation_priority ASC
  `).all(req.user.id, req.collegeId);

  const zones = db.prepare(`SELECT * FROM parking_zones WHERE college_id = ? ORDER BY zone_code`).all(req.collegeId);

  return res.json({ slots, zones });
});

// GET /api/student/route/:slotId — route from entrance to a specific slot
router.get('/route/:slotId', requireAuth, requireStudent, (req, res) => {
  const db = getDb();
  const allSlots = db.prepare('SELECT * FROM parking_slots WHERE college_id = ?').all(req.collegeId);
  const route = getRouteToSlot(allSlots, req.params.slotId);
  return res.json({ route });
});

// POST /api/student/request-slot
router.post('/request-slot', requireAuth, requireStudent, requestLimiter, (req, res) => {
  const schema = z.object({
    vehicleType: z.enum(['bike', 'car']),
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
    accuracy: z.number().positive(),
    isDemoMode: z.boolean().optional().default(false),
    manualApprovalId: z.string().optional(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid request data.', details: parsed.error.issues });
  }

  const { vehicleType, lat, lng, accuracy, isDemoMode, manualApprovalId } = parsed.data;
  const db = getDb();

  // Check for manual approval (for GPS-challenged users)
  if (manualApprovalId) {
    const approval = db.prepare(`
      SELECT * FROM location_approvals WHERE id = ? AND user_id = ? AND used = 0 AND expires_at > datetime('now')
    `).get(manualApprovalId, req.user.id);

    if (!approval) {
      return res.status(403).json({ error: 'Manual location approval not found or expired.' });
    }
    db.prepare('UPDATE location_approvals SET used = 1 WHERE id = ?').run(manualApprovalId);
  } else {
    // Backend geofence verification
    const geofenceSettings = db.prepare('SELECT * FROM geofence_settings WHERE college_id = ?').get(req.collegeId);
    if (!geofenceSettings) {
      return res.status(500).json({ error: 'Geofence not configured.' });
    }

    const geoResult = verifyGeofence(lat, lng, accuracy, geofenceSettings);

    if (!geoResult.insideParkingEntry && !isDemoMode) {
      return res.status(403).json({
        error: 'Location verification failed.',
        details: geoResult.message,
        status: geoResult.status,
      });
    }
  }

  const result = processRequest(
    req.collegeId,
    req.user.id,
    vehicleType,
    req.user.role,
    { lat, lng, accuracy, verified: true }
  );

  if (!result.success) {
    const statusCode = result.reason === 'already_allocated' ? 409 : 400;
    return res.status(statusCode).json({ error: result.message, reason: result.reason });
  }

  // Get route if allocated
  let route = null;
  if (result.type === 'allocated' && result.slot) {
    const allSlots = db.prepare('SELECT * FROM parking_slots WHERE college_id = ?').all(req.collegeId);
    route = getRouteToSlot(allSlots, result.slot.id);
  }

  return res.json({ ...result, route });
});

// POST /api/student/confirm-parking
router.post('/confirm-parking', requireAuth, requireStudent, (req, res) => {
  const schema = z.object({ allocationId: z.string() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid data.' });

  const result = confirmParking(parsed.data.allocationId, req.user.id);
  if (!result.success) return res.status(400).json({ error: result.message });
  return res.json(result);
});

// POST /api/student/exit-parking
router.post('/exit-parking', requireAuth, requireStudent, (req, res) => {
  const schema = z.object({ allocationId: z.string() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid data.' });

  const result = exitParking(parsed.data.allocationId, req.user.id);
  if (!result.success) return res.status(400).json({ error: result.message });
  return res.json(result);
});

// POST /api/student/cancel-allocation
router.post('/cancel-allocation', requireAuth, requireStudent, (req, res) => {
  const schema = z.object({ allocationId: z.string() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid data.' });

  const result = cancelAllocation(parsed.data.allocationId, req.user.id);
  if (!result.success) return res.status(400).json({ error: result.message });
  return res.json(result);
});

// GET /api/student/queue-position
router.get('/queue-position', requireAuth, requireStudent, (req, res) => {
  const db = getDb();
  const entry = db.prepare(`
    SELECT wq.*, ps.slot_number as offered_slot_number
    FROM waiting_queue wq
    LEFT JOIN parking_slots ps ON wq.offered_slot_id = ps.id
    WHERE wq.user_id = ? AND wq.status IN ('waiting', 'offered')
  `).get(req.user.id);

  return res.json({ queueEntry: entry });
});

// POST /api/student/accept-queue-offer
router.post('/accept-queue-offer', requireAuth, requireStudent, (req, res) => {
  const schema = z.object({ queueEntryId: z.string() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid data.' });

  const db = getDb();
  const allSlots = db.prepare('SELECT * FROM parking_slots WHERE college_id = ?').all(req.collegeId);

  const result = acceptQueueOffer(parsed.data.queueEntryId, req.user.id);
  if (!result.success) return res.status(400).json({ error: result.message });

  let route = null;
  if (result.slot) {
    route = getRouteToSlot(allSlots, result.slot.id);
  }

  return res.json({ ...result, route });
});

// POST /api/student/decline-queue-offer
router.post('/decline-queue-offer', requireAuth, requireStudent, (req, res) => {
  const schema = z.object({ queueEntryId: z.string() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid data.' });

  const db = getDb();
  const entry = db.prepare('SELECT * FROM waiting_queue WHERE id = ? AND user_id = ?').get(parsed.data.queueEntryId, req.user.id);
  if (!entry) return res.status(404).json({ error: 'Queue entry not found.' });

  db.prepare('UPDATE waiting_queue SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run('declined', entry.id);

  const { processQueueForSlot } = require('../services/allocationEngine');
  processQueueForSlot(req.collegeId, entry.vehicle_type);

  return res.json({ success: true });
});

// GET /api/student/history
router.get('/history', requireAuth, requireStudent, (req, res) => {
  const db = getDb();
  const history = db.prepare(`
    SELECT pa.*, ps.slot_number, pz.name as zone_name, pz.zone_code,
           sess.started_at as session_start, sess.ended_at as session_end, sess.duration_minutes
    FROM parking_allocations pa
    JOIN parking_slots ps ON pa.slot_id = ps.id
    JOIN parking_zones pz ON ps.zone_id = pz.id
    LEFT JOIN parking_sessions sess ON sess.allocation_id = pa.id
    WHERE pa.user_id = ?
    ORDER BY pa.created_at DESC LIMIT 20
  `).all(req.user.id);

  return res.json({ history });
});

// GET /api/student/notifications
router.get('/notifications', requireAuth, requireStudent, (req, res) => {
  const db = getDb();
  const notifications = db.prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50').all(req.user.id);
  const unread = db.prepare('SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = 0').get(req.user.id);
  return res.json({ notifications, unreadCount: unread.count });
});

// POST /api/student/mark-notifications-read
router.post('/mark-notifications-read', requireAuth, requireStudent, (req, res) => {
  const db = getDb();
  db.prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ?').run(req.user.id);
  return res.json({ success: true });
});

// GET /api/student/route/:slotId
router.get('/route/:slotId', requireAuth, requireStudent, (req, res) => {
  const db = getDb();
  const allSlots = db.prepare('SELECT * FROM parking_slots WHERE college_id = ?').all(req.collegeId);
  const route = getRouteToSlot(allSlots, req.params.slotId);
  if (!route) return res.status(404).json({ error: 'No route found to this slot.' });
  return res.json({ route });
});

module.exports = router;
