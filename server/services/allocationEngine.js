// FCFA Allocation Engine - First Come First Allocated
// Uses Node.js 24 built-in sqlite module

const { getDb } = require('../db/database');
const { v4: uuidv4 } = require('uuid');

const HOLD_DURATION_MS = 3 * 60 * 1000; // 3 minutes
const QUEUE_OFFER_DURATION_MS = 60 * 1000; // 60 seconds

let _io = null;
function setSocketIo(io) { _io = io; }

function getNextSequence(db, collegeId) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const row = db.prepare('SELECT next_sequence FROM request_sequences WHERE college_id = ?').get(collegeId);
    const seq = row ? Number(row.next_sequence) : 1;
    db.prepare('UPDATE request_sequences SET next_sequence = ? WHERE college_id = ?').run(seq + 1, collegeId);
    db.exec('COMMIT');
    return seq;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

function findBestSlot(db, collegeId, vehicleType, userRole) {
  const isStaff = userRole === 'staff';
  let query = `
    SELECT ps.* FROM parking_slots ps
    JOIN parking_zones pz ON ps.zone_id = pz.id
    WHERE ps.college_id = ?
      AND ps.vehicle_type = ?
      AND ps.operational_status = 'available'
      AND ps.occupancy_status = 'free'
  `;
  if (isStaff) {
    query += ` AND (pz.category = 'staff' OR pz.staff_only = 1)`;
  } else {
    query += ` AND (pz.category = 'student' OR pz.category IS NULL) AND pz.staff_only = 0`;
  }
  query += ` ORDER BY ps.allocation_priority ASC LIMIT 1`;
  return db.prepare(query).get(collegeId, vehicleType);
}

function findNextBestSlot(db, collegeId, vehicleType, userRole, excludeSlotId) {
  const isStaff = userRole === 'staff';
  let query = `
    SELECT ps.* FROM parking_slots ps
    JOIN parking_zones pz ON ps.zone_id = pz.id
    WHERE ps.college_id = ?
      AND ps.vehicle_type = ?
      AND ps.operational_status = 'available'
      AND ps.occupancy_status = 'free'
      AND ps.id != ?
  `;
  if (isStaff) {
    query += ` AND (pz.category = 'staff' OR pz.staff_only = 1)`;
  } else {
    query += ` AND (pz.category = 'student' OR pz.category IS NULL) AND pz.staff_only = 0`;
  }
  query += ` ORDER BY ps.allocation_priority ASC LIMIT 1`;
  return db.prepare(query).get(collegeId, vehicleType, excludeSlotId);
}

/**
 * Atomically allocate a slot using BEGIN IMMEDIATE transaction
 */
function allocateSlot(db, collegeId, userId, requestId, slotId, vehicleType) {
  const allocationId = uuidv4();
  const expiresAt = new Date(Date.now() + HOLD_DURATION_MS).toISOString();

  db.exec('BEGIN IMMEDIATE');
  try {
    // Check slot is still free inside transaction
    const slot = db.prepare(`
      SELECT * FROM parking_slots WHERE id = ? AND college_id = ? AND operational_status = 'available' AND occupancy_status = 'free'
    `).get(slotId, collegeId);

    if (!slot) {
      db.exec('ROLLBACK');
      return { success: false, reason: 'slot_taken' };
    }

    // Check user doesn't already have active allocation
    const existing = db.prepare(`SELECT id FROM parking_allocations WHERE user_id = ? AND status IN ('held', 'confirmed')`).get(userId);
    if (existing) {
      db.exec('ROLLBACK');
      return { success: false, reason: 'already_allocated' };
    }

    // Mark slot as held
    db.prepare(`UPDATE parking_slots SET occupancy_status = 'held', current_allocation_id = ?, last_updated = datetime('now') WHERE id = ?`).run(allocationId, slotId);

    // Create allocation
    db.prepare(`
      INSERT INTO parking_allocations (id, college_id, request_id, user_id, slot_id, status, expires_at)
      VALUES (?, ?, ?, ?, ?, 'held', ?)
    `).run(allocationId, collegeId, requestId, userId, slotId, expiresAt);

    // Update request
    db.prepare(`UPDATE parking_requests SET status = 'allocated', updated_at = datetime('now') WHERE id = ?`).run(requestId);

    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }

  const allocation = db.prepare('SELECT * FROM parking_allocations WHERE id = ?').get(allocationId);
  const slotInfo = db.prepare(`
    SELECT ps.*, pz.name as zone_name, pz.zone_code
    FROM parking_slots ps JOIN parking_zones pz ON ps.zone_id = pz.id WHERE ps.id = ?
  `).get(slotId);

  return { success: true, allocation, slot: slotInfo };
}

/**
 * Main FCFA: Process a parking request
 */
function processRequest(collegeId, userId, vehicleType, userRole, locationData = {}) {
  const db = getDb();

  const existingAlloc = db.prepare(`SELECT * FROM parking_allocations WHERE user_id = ? AND status IN ('held', 'confirmed')`).get(userId);
  if (existingAlloc) {
    return { success: false, reason: 'already_allocated', message: 'You already have an active parking allocation.' };
  }

  const existingQueue = db.prepare(`SELECT * FROM waiting_queue WHERE user_id = ? AND status IN ('waiting', 'offered')`).get(userId);
  if (existingQueue) {
    return { success: false, reason: 'already_queued', message: 'You already have an active queue entry.' };
  }

  const sequenceNumber = getNextSequence(db, collegeId);
  const requestId = uuidv4();
  const idempotencyKey = `${userId}-${Date.now()}`;

  db.prepare(`
    INSERT INTO parking_requests (id, college_id, user_id, vehicle_type, sequence_number, status, location_lat, location_lng, location_accuracy, geofence_verified, idempotency_key)
    VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?)
  `).run(requestId, collegeId, userId, vehicleType, sequenceNumber,
    locationData.lat || null, locationData.lng || null,
    locationData.accuracy || null, locationData.verified ? 1 : 0, idempotencyKey);

  const bestSlot = findBestSlot(db, collegeId, vehicleType, userRole);
  if (!bestSlot) {
    return addToQueue(db, collegeId, userId, requestId, vehicleType, sequenceNumber);
  }

  let result = allocateSlot(db, collegeId, userId, requestId, bestSlot.id, vehicleType);

  if (!result.success && result.reason === 'slot_taken') {
    const nextSlot = findNextBestSlot(db, collegeId, vehicleType, userRole, bestSlot.id);
    if (nextSlot) result = allocateSlot(db, collegeId, userId, requestId, nextSlot.id, vehicleType);
  }

  if (!result.success) {
    return addToQueue(db, collegeId, userId, requestId, vehicleType, sequenceNumber);
  }

  logAudit(db, collegeId, userId, 'allocation_created', 'parking_allocation', result.allocation.id, { slot: result.slot.slot_number, sequence: sequenceNumber });

  broadcastSlotUpdate(result.slot.id, 'slot:held', { slotId: result.slot.id, slotNumber: result.slot.slot_number, allocationId: result.allocation.id });
  broadcastToUser(userId, 'allocation:created', { allocation: result.allocation, slot: result.slot, expiresAt: result.allocation.expires_at });

  return {
    success: true,
    type: 'allocated',
    allocation: result.allocation,
    slot: result.slot,
    expiresAt: result.allocation.expires_at,
    sequenceNumber,
  };
}

function addToQueue(db, collegeId, userId, requestId, vehicleType, sequenceNumber) {
  const maxPos = db.prepare(`
    SELECT COALESCE(MAX(queue_position), 0) as max_pos FROM waiting_queue
    WHERE college_id = ? AND vehicle_type = ? AND status = 'waiting'
  `).get(collegeId, vehicleType);

  const position = Number(maxPos.max_pos) + 1;
  const queueId = uuidv4();

  db.prepare(`
    INSERT INTO waiting_queue (id, college_id, request_id, user_id, vehicle_type, queue_position, status, original_sequence)
    VALUES (?, ?, ?, ?, ?, ?, 'waiting', ?)
  `).run(queueId, collegeId, requestId, userId, vehicleType, position, sequenceNumber);
  db.prepare(`UPDATE parking_requests SET status = 'queued', updated_at = datetime('now') WHERE id = ?`).run(requestId);

  broadcastToUser(userId, 'queue:updated', { position, vehicleType, status: 'waiting' });
  broadcastToCollege(collegeId, 'queue:updated', { vehicleType, totalWaiting: position });

  return { success: true, type: 'queued', queuePosition: position, vehicleType, message: 'All compatible slots are currently occupied. You have been added to the waiting queue.' };
}

function confirmParking(allocationId, userId) {
  const db = getDb();
  const allocation = db.prepare(`SELECT * FROM parking_allocations WHERE id = ? AND user_id = ? AND status = 'held'`).get(allocationId, userId);
  if (!allocation) return { success: false, message: 'No held allocation found to confirm.' };

  db.exec('BEGIN');
  try {
    db.prepare(`UPDATE parking_allocations SET status = 'confirmed', confirmed_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`).run(allocationId);
    db.prepare(`UPDATE parking_slots SET occupancy_status = 'occupied', last_updated = datetime('now') WHERE id = ?`).run(allocation.slot_id);

    const sessionId = uuidv4();
    db.prepare(`INSERT INTO parking_sessions (id, college_id, allocation_id, user_id, slot_id) VALUES (?, ?, ?, ?, ?)`).run(sessionId, allocation.college_id, allocationId, userId, allocation.slot_id);
    db.prepare(`INSERT INTO occupancy_events (id, college_id, slot_id, event_type, triggered_by, triggered_by_user_id) VALUES (?, ?, ?, 'vehicle_entered', 'student_confirmed', ?)`).run(uuidv4(), allocation.college_id, allocation.slot_id, userId);
    db.exec('COMMIT');

    const slot = db.prepare('SELECT ps.*, pz.name as zone_name FROM parking_slots ps JOIN parking_zones pz ON ps.zone_id = pz.id WHERE ps.id = ?').get(allocation.slot_id);
    broadcastSlotUpdate(allocation.slot_id, 'slot:occupied', { slotId: allocation.slot_id, slotNumber: slot.slot_number });
    return { success: true, sessionId, slot };
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

function exitParking(allocationId, userId) {
  const db = getDb();
  const allocation = db.prepare(`SELECT * FROM parking_allocations WHERE id = ? AND user_id = ? AND status = 'confirmed'`).get(allocationId, userId);
  if (!allocation) return { success: false, message: 'No confirmed allocation found.' };

  db.exec('BEGIN');
  try {
    db.prepare(`UPDATE parking_allocations SET status = 'cancelled', cancelled_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`).run(allocationId);
    db.prepare(`UPDATE parking_slots SET occupancy_status = 'free', current_allocation_id = NULL, last_updated = datetime('now') WHERE id = ?`).run(allocation.slot_id);
    db.prepare(`UPDATE parking_sessions SET ended_at = datetime('now'), duration_minutes = CAST((julianday('now') - julianday(started_at)) * 1440 AS INTEGER) WHERE allocation_id = ?`).run(allocationId);
    db.prepare(`INSERT INTO occupancy_events (id, college_id, slot_id, event_type, triggered_by, triggered_by_user_id) VALUES (?, ?, ?, 'vehicle_exited', 'student_exit', ?)`).run(uuidv4(), allocation.college_id, allocation.slot_id, userId);
    db.exec('COMMIT');

    const slot = db.prepare('SELECT ps.*, pz.name as zone_name FROM parking_slots ps JOIN parking_zones pz ON ps.zone_id = pz.id WHERE ps.id = ?').get(allocation.slot_id);
    broadcastSlotUpdate(allocation.slot_id, 'slot:released', { slotId: allocation.slot_id, slotNumber: slot.slot_number });
    processQueueForSlot(allocation.college_id, slot.vehicle_type);
    return { success: true, slot };
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

function cancelAllocation(allocationId, userId) {
  const db = getDb();
  const allocation = db.prepare(`SELECT * FROM parking_allocations WHERE id = ? AND user_id = ? AND status = 'held'`).get(allocationId, userId);
  if (!allocation) return { success: false, message: 'No held allocation to cancel.' };

  db.exec('BEGIN');
  try {
    db.prepare(`UPDATE parking_allocations SET status = 'cancelled', cancelled_at = datetime('now') WHERE id = ?`).run(allocationId);
    db.prepare(`UPDATE parking_slots SET occupancy_status = 'free', current_allocation_id = NULL, last_updated = datetime('now') WHERE id = ?`).run(allocation.slot_id);
    db.prepare(`UPDATE parking_requests SET status = 'cancelled', updated_at = datetime('now') WHERE id = ?`).run(allocation.request_id);
    db.exec('COMMIT');

    const slot = db.prepare('SELECT ps.*, pz.name as zone_name FROM parking_slots ps JOIN parking_zones pz ON ps.zone_id = pz.id WHERE ps.id = ?').get(allocation.slot_id);
    broadcastSlotUpdate(allocation.slot_id, 'slot:released', { slotId: allocation.slot_id, slotNumber: slot.slot_number });
    processQueueForSlot(allocation.college_id, slot.vehicle_type);
    return { success: true };
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

function reallocateIfNeeded(db, collegeId, slotId) {
  const heldAlloc = db.prepare(`SELECT * FROM parking_allocations WHERE slot_id = ? AND status = 'held'`).get(slotId);
  if (!heldAlloc) return;

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(heldAlloc.user_id);
  const oldSlot = db.prepare('SELECT * FROM parking_slots WHERE id = ?').get(slotId);

  const nextSlot = findBestSlotExcluding(db, collegeId, oldSlot.vehicle_type, user.role, [slotId]);

  if (!nextSlot) {
    // No replacement — move to front of queue
    db.exec('BEGIN');
    try {
      db.prepare(`UPDATE parking_allocations SET status = 'cancelled', cancelled_at = datetime('now') WHERE id = ?`).run(heldAlloc.id);
      db.prepare(`UPDATE waiting_queue SET queue_position = queue_position + 1 WHERE college_id = ? AND vehicle_type = ? AND status = 'waiting'`).run(collegeId, oldSlot.vehicle_type);

      const seq = getNextSequence(db, collegeId);
      const qId = uuidv4();
      db.prepare(`INSERT INTO waiting_queue (id, college_id, request_id, user_id, vehicle_type, queue_position, status, original_sequence) VALUES (?, ?, ?, ?, ?, 1, 'waiting', ?)`).run(qId, collegeId, heldAlloc.request_id, heldAlloc.user_id, oldSlot.vehicle_type, seq);
      db.prepare(`UPDATE parking_requests SET status = 'queued', updated_at = datetime('now') WHERE id = ?`).run(heldAlloc.request_id);
      db.exec('COMMIT');
    } catch (e) { db.exec('ROLLBACK'); throw e; }

    broadcastToUser(heldAlloc.user_id, 'allocation:reallocated', {
      oldSlot: oldSlot.slot_number, newSlot: null, type: 'queued',
      message: `Your assigned slot ${oldSlot.slot_number} is unavailable. You've been placed at the front of the queue.`
    });
    createNotification(db, collegeId, heldAlloc.user_id, 'reallocation_failed', 'Slot Unavailable – Queued',
      `Slot ${oldSlot.slot_number} is unavailable. You're at position 1 in the queue.`);
    return;
  }

  const newAllocResult = allocateSlot(db, collegeId, heldAlloc.user_id, heldAlloc.request_id, nextSlot.id, oldSlot.vehicle_type);
  if (!newAllocResult.success) return;

  db.prepare(`UPDATE parking_allocations SET status = 'reallocated', reallocated_to = ?, updated_at = datetime('now') WHERE id = ?`).run(newAllocResult.allocation.id, heldAlloc.id);

  logAudit(db, collegeId, null, 'reallocation_created', 'parking_allocation', newAllocResult.allocation.id, {
    oldSlot: oldSlot.slot_number, newSlot: nextSlot.slot_number, userId: heldAlloc.user_id
  });

  broadcastToUser(heldAlloc.user_id, 'allocation:reallocated', {
    oldSlot: oldSlot.slot_number, newSlot: nextSlot.slot_number,
    allocation: newAllocResult.allocation, slot: newAllocResult.slot,
    expiresAt: newAllocResult.allocation.expires_at, type: 'reallocated',
    message: `Your previously assigned slot ${oldSlot.slot_number} is unavailable. We've reassigned you to slot ${nextSlot.slot_number}.`
  });

  createNotification(db, collegeId, heldAlloc.user_id, 'reallocation',
    `Reallocated → Slot ${nextSlot.slot_number}`,
    `Your slot ${oldSlot.slot_number} became unavailable. Auto-reassigned to slot ${nextSlot.slot_number}.`
  );

  broadcastSlotUpdate(nextSlot.id, 'slot:held', { slotId: nextSlot.id, slotNumber: nextSlot.slot_number });
}

function findBestSlotExcluding(db, collegeId, vehicleType, userRole, excludeIds) {
  const isStaff = userRole === 'staff' || userRole === 'admin';
  const placeholders = excludeIds.map(() => '?').join(',');
  let query = `
    SELECT ps.* FROM parking_slots ps JOIN parking_zones pz ON ps.zone_id = pz.id
    WHERE ps.college_id = ? AND ps.vehicle_type = ? AND ps.operational_status = 'available' AND ps.occupancy_status = 'free'
    AND ps.id NOT IN (${placeholders})
  `;
  if (!isStaff) query += ` AND pz.staff_only = 0`;
  query += ` ORDER BY ps.allocation_priority ASC LIMIT 1`;
  return db.prepare(query).get(collegeId, vehicleType, ...excludeIds);
}

function processQueueForSlot(collegeId, vehicleType) {
  const db = getDb();

  const nextInQueue = db.prepare(`
    SELECT wq.*, u.role as user_role FROM waiting_queue wq JOIN users u ON wq.user_id = u.id
    WHERE wq.college_id = ? AND wq.vehicle_type = ? AND wq.status = 'waiting'
    ORDER BY wq.queue_position ASC LIMIT 1
  `).get(collegeId, vehicleType);

  if (!nextInQueue) return;

  const bestSlot = findBestSlot(db, collegeId, vehicleType, nextInQueue.user_role);
  if (!bestSlot) return;

  const offerExpiresAt = new Date(Date.now() + QUEUE_OFFER_DURATION_MS).toISOString();
  db.prepare(`UPDATE waiting_queue SET status = 'offered', offered_slot_id = ?, offer_expires_at = ?, updated_at = datetime('now') WHERE id = ?`).run(bestSlot.id, offerExpiresAt, nextInQueue.id);

  broadcastToUser(nextInQueue.user_id, 'queue:slot_offered', {
    queueEntryId: nextInQueue.id, slot: bestSlot, offerExpiresAt,
    message: `A parking slot is available! Slot ${bestSlot.slot_number} is reserved for you. Accept within 60 seconds.`
  });

  createNotification(db, collegeId, nextInQueue.user_id, 'queue_offer',
    `Slot Available: ${bestSlot.slot_number}`,
    `A slot is now available. Accept within 60 seconds.`
  );

  setTimeout(() => expireQueueOffer(nextInQueue.id, collegeId, vehicleType), QUEUE_OFFER_DURATION_MS + 2000);
}

function expireQueueOffer(queueEntryId, collegeId, vehicleType) {
  const db = getDb();
  const entry = db.prepare(`SELECT * FROM waiting_queue WHERE id = ? AND status = 'offered'`).get(queueEntryId);
  if (!entry) return;

  db.prepare(`UPDATE waiting_queue SET status = 'expired', updated_at = datetime('now') WHERE id = ?`).run(queueEntryId);
  db.prepare(`UPDATE parking_requests SET status = 'expired', updated_at = datetime('now') WHERE id = ?`).run(entry.request_id);

  broadcastToUser(entry.user_id, 'queue:offer_expired', { message: 'Your slot offer has expired.' });
  reorderQueue(db, collegeId, vehicleType);
  processQueueForSlot(collegeId, vehicleType);
}

function acceptQueueOffer(queueEntryId, userId) {
  const db = getDb();
  const entry = db.prepare(`SELECT wq.* FROM waiting_queue wq WHERE wq.id = ? AND wq.user_id = ? AND wq.status = 'offered'`).get(queueEntryId, userId);
  if (!entry) return { success: false, message: 'Queue offer not found or expired.' };

  if (new Date(entry.offer_expires_at) < new Date()) return { success: false, message: 'Offer has expired.' };

  const result = allocateSlot(db, entry.college_id, userId, entry.request_id, entry.offered_slot_id, entry.vehicle_type);
  if (!result.success) return { success: false, message: 'Slot no longer available.' };

  db.prepare(`UPDATE waiting_queue SET status = 'accepted', updated_at = datetime('now') WHERE id = ?`).run(queueEntryId);
  reorderQueue(db, entry.college_id, entry.vehicle_type);

  broadcastSlotUpdate(result.slot.id, 'slot:held', { slotId: result.slot.id });
  broadcastToUser(userId, 'allocation:created', { allocation: result.allocation, slot: result.slot });

  return { success: true, allocation: result.allocation, slot: result.slot };
}

function reorderQueue(db, collegeId, vehicleType) {
  const entries = db.prepare(`SELECT id FROM waiting_queue WHERE college_id = ? AND vehicle_type = ? AND status = 'waiting' ORDER BY queue_position ASC`).all(collegeId, vehicleType);
  const update = db.prepare(`UPDATE waiting_queue SET queue_position = ? WHERE id = ?`);
  db.exec('BEGIN');
  try {
    entries.forEach((e, i) => update.run(i + 1, e.id));
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); }
  broadcastToCollege(collegeId, 'queue:updated', { vehicleType, count: entries.length });
}

function recoverExpiredHolds() {
  const db = getDb();
  const now = new Date().toISOString();
  const expired = db.prepare(`
    SELECT pa.*, ps.vehicle_type as vtype, ps.slot_number
    FROM parking_allocations pa JOIN parking_slots ps ON pa.slot_id = ps.id
    WHERE pa.status = 'held' AND pa.expires_at < ?
  `).all(now);

  for (const alloc of expired) {
    const recentOccupancy = db.prepare(`
      SELECT * FROM occupancy_events WHERE slot_id = ? AND event_type = 'vehicle_entered'
      AND created_at > ? ORDER BY created_at DESC LIMIT 1
    `).get(alloc.slot_id, alloc.created_at);

    if (recentOccupancy) {
      db.prepare(`UPDATE parking_allocations SET status = 'confirmed', confirmed_at = datetime('now') WHERE id = ?`).run(alloc.id);
      db.prepare(`UPDATE parking_slots SET occupancy_status = 'occupied', last_updated = datetime('now') WHERE id = ?`).run(alloc.slot_id);
      continue;
    }

    db.exec('BEGIN');
    try {
      db.prepare(`UPDATE parking_allocations SET status = 'expired', updated_at = datetime('now') WHERE id = ?`).run(alloc.id);
      db.prepare(`UPDATE parking_slots SET occupancy_status = 'free', current_allocation_id = NULL, last_updated = datetime('now') WHERE id = ?`).run(alloc.slot_id);
      db.prepare(`UPDATE parking_requests SET status = 'expired', updated_at = datetime('now') WHERE id = ?`).run(alloc.request_id);
      db.exec('COMMIT');
    } catch (e) { db.exec('ROLLBACK'); continue; }

    broadcastToUser(alloc.user_id, 'hold:expired', { allocationId: alloc.id, slotId: alloc.slot_id, message: 'Your parking hold has expired. Please request a new slot.' });
    broadcastSlotUpdate(alloc.slot_id, 'slot:released', { slotId: alloc.slot_id, slotNumber: alloc.slot_number });
    createNotification(db, alloc.college_id, alloc.user_id, 'hold_expired', 'Parking Hold Expired', 'Your 3-minute hold has expired. Please request a new slot.');
    processQueueForSlot(alloc.college_id, alloc.vtype);
  }

  return expired.length;
}

// ---- Utilities ----

function logAudit(db, collegeId, userId, action, entityType, entityId, details = {}) {
  try {
    db.prepare(`INSERT INTO audit_logs (id, college_id, user_id, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(uuidv4(), collegeId, userId, action, entityType, entityId, JSON.stringify(details));
  } catch (e) { /* non-critical */ }
}

function createNotification(db, collegeId, userId, type, title, message, data = {}) {
  const notifId = uuidv4();
  try {
    db.prepare(`INSERT INTO notifications (id, college_id, user_id, type, title, message, data) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(notifId, collegeId, userId, type, title, message, JSON.stringify(data));
    if (_io) _io.to(`user:${userId}`).emit('notification:new', { id: notifId, type, title, message, data, createdAt: new Date().toISOString() });
  } catch (e) { /* non-critical */ }
  return notifId;
}

function broadcastSlotUpdate(slotId, event, data) {
  if (_io) _io.emit(event, { ...data, timestamp: new Date().toISOString() });
}

function broadcastToUser(userId, event, data) {
  if (_io) _io.to(`user:${userId}`).emit(event, { ...data, timestamp: new Date().toISOString() });
}

function broadcastToCollege(collegeId, event, data) {
  if (_io) _io.to(`college:${collegeId}`).emit(event, { ...data, timestamp: new Date().toISOString() });
}

module.exports = {
  processRequest, confirmParking, exitParking, cancelAllocation,
  reallocateIfNeeded, processQueueForSlot, acceptQueueOffer,
  recoverExpiredHolds, setSocketIo, logAudit, createNotification,
  broadcastSlotUpdate, broadcastToCollege, broadcastToUser,
  HOLD_DURATION_MS,
};
