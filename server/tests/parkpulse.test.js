// ParkPulse 2.0 Comprehensive Test Suite
// Tests FCFA Allocation, Student/Staff Zone Segregation, Dijkstra Graph Routing, and Geofence Math

const test = require('node:test');
const assert = require('node:assert/strict');
const { getDb } = require('../db/database');
const { dijkstra, buildParkingGraph, getRouteToSlot } = require('../lib/dijkstra');
const { verifyGeofence, haversineDistance } = require('../lib/geofence');
const { processRequest, confirmParking, cancelAllocation } = require('../services/allocationEngine');

test('1. Geofence & Haversine Distance Calculation', (t) => {
  // Test distance between identical coordinates is 0
  const distZero = haversineDistance(11.0238, 77.0069, 11.0238, 77.0069);
  assert.equal(Math.round(distZero), 0, 'Distance to self must be 0');

  // Test geofence settings
  const settings = {
    campus_lat: 11.0238,
    campus_lng: 77.0069,
    campus_radius_m: 500,
    parking_entry_lat: 11.0245,
    parking_entry_lng: 77.0072,
    parking_entry_radius_m: 150,
    min_accuracy_m: 50,
  };

  // Entrance gate position
  const gateCheck = verifyGeofence(11.0245, 77.0072, 10, settings);
  assert.equal(gateCheck.insideParkingEntry, true, 'Coordinates at parking gate must be inside entry radius');
  assert.equal(gateCheck.insideCampus, true, 'Coordinates at parking gate must be inside campus');

  // Distant coordinates outside campus
  const outsideCheck = verifyGeofence(11.0500, 77.0500, 10, settings);
  assert.equal(outsideCheck.insideCampus, false, 'Far coordinates must be outside campus');
  assert.equal(outsideCheck.status, 'outside_campus');

  // Low GPS accuracy check
  const badAccuracyCheck = verifyGeofence(11.0245, 77.0072, 120, settings);
  assert.equal(badAccuracyCheck.status, 'accuracy_insufficient', 'Accuracy > 50m must be rejected');
});

test('2. Dijkstra Shortest-Path Graph Navigation to Student & Staff Zones', (t) => {
  const mockSlots = [
    { id: 'slot-a1', slot_number: 'A1', vehicle_type: 'bike' },
    { id: 'slot-b1', slot_number: 'B1', vehicle_type: 'car' },
    { id: 'slot-c1', slot_number: 'C1', vehicle_type: 'car' },
    { id: 'slot-d1', slot_number: 'D1', vehicle_type: 'bike' },
  ];

  // Test Route to Student Bike (Zone A)
  const routeA = getRouteToSlot(mockSlots, 'slot-a1');
  assert.ok(routeA, 'Route to Zone A slot must exist');
  assert.equal(routeA.path[0], 'entrance', 'Route must start at entrance');
  assert.equal(routeA.path[routeA.path.length - 1], 'slot-a1', 'Route must terminate at target slot');
  assert.ok(routeA.path.includes('lane-a-start'), 'Route to Zone A must pass lane-a-start');

  // Test Route to Student Car (Zone B)
  const routeB = getRouteToSlot(mockSlots, 'slot-b1');
  assert.ok(routeB, 'Route to Zone B slot must exist');
  assert.ok(routeB.path.includes('lane-b-start'), 'Route to Zone B must pass lane-b-start');

  // Test Route to Staff Car (Zone C)
  const routeC = getRouteToSlot(mockSlots, 'slot-c1');
  assert.ok(routeC, 'Route to Zone C slot must exist');
  assert.ok(routeC.path.includes('lane-c-start'), 'Route to Zone C must pass lane-c-start');

  // Test Route to Staff Bike (Zone D)
  const routeD = getRouteToSlot(mockSlots, 'slot-d1');
  assert.ok(routeD, 'Route to Zone D slot must exist');
  assert.ok(routeD.path.includes('lane-d-start'), 'Route to Zone D must pass lane-d-start');
});

test('3. Student vs Staff Zone Segregation in FCFA Allocation Engine', (t) => {
  const db = getDb();
  const collegeId = 'college-psg-1';

  // Release any existing held slots for test users
  db.prepare(`UPDATE parking_slots SET occupancy_status = 'free', operational_status = 'available' WHERE college_id = ?`).run(collegeId);
  db.prepare(`DELETE FROM parking_allocations WHERE college_id = ?`).run(collegeId);
  db.prepare(`DELETE FROM parking_requests WHERE college_id = ?`).run(collegeId);

  // 1. Student Request (Bike)
  const studentResult = processRequest(
    collegeId,
    'user-arun-1', // Student role
    'bike',
    'student',
    { lat: 11.0245, lng: 77.0072, accuracy: 5, verified: true }
  );

  assert.equal(studentResult.success, true, 'Student slot request must succeed');
  assert.equal(studentResult.type, 'allocated');
  assert.ok(studentResult.slot.slot_number.startsWith('A'), `Student bike must be allocated to Zone A, got ${studentResult.slot.slot_number}`);

  // 2. Staff Request (Car)
  const staffResult = processRequest(
    collegeId,
    'user-staff-1', // Staff role
    'car',
    'staff',
    { lat: 11.0245, lng: 77.0072, accuracy: 5, verified: true }
  );

  assert.equal(staffResult.success, true, 'Staff slot request must succeed');
  assert.equal(staffResult.type, 'allocated');
  assert.ok(staffResult.slot.slot_number.startsWith('C'), `Staff car must be allocated to Zone C, got ${staffResult.slot.slot_number}`);

  // 3. Staff Request (Bike)
  const staffBikeResult = processRequest(
    collegeId,
    'user-staff-2', // Staff role
    'bike',
    'staff',
    { lat: 11.0245, lng: 77.0072, accuracy: 5, verified: true }
  );

  assert.equal(staffBikeResult.success, true, 'Staff bike slot request must succeed');
  assert.equal(staffBikeResult.type, 'allocated');
  assert.ok(staffBikeResult.slot.slot_number.startsWith('D'), `Staff bike must be allocated to Zone D, got ${staffBikeResult.slot.slot_number}`);

  // Clean up test allocations
  cancelAllocation(studentResult.allocation.id, 'user-arun-1');
  cancelAllocation(staffResult.allocation.id, 'user-staff-1');
  cancelAllocation(staffBikeResult.allocation.id, 'user-staff-2');
});
