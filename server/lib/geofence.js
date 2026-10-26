// Haversine distance calculation for geofencing
// Returns distance in meters between two lat/lng points

function haversineDistance(lat1, lng1, lat2, lng2) {
  const R = 6371000; // Earth's radius in meters
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(degrees) {
  return degrees * (Math.PI / 180);
}

/**
 * Verify a user's location against geofence settings
 * @returns {Object} { insideCampus, insideParkingEntry, status, message }
 */
function verifyGeofence(lat, lng, accuracy, settings) {
  const { campus_lat, campus_lng, campus_radius_m, parking_entry_lat, parking_entry_lng, parking_entry_radius_m, min_accuracy_m } = settings;

  // Check accuracy first
  if (accuracy > min_accuracy_m) {
    return {
      insideCampus: false,
      insideParkingEntry: false,
      status: 'accuracy_insufficient',
      message: `GPS accuracy (${Math.round(accuracy)}m) is below required threshold (${min_accuracy_m}m). Please move to an open area.`,
    };
  }

  const distanceToCampus = haversineDistance(lat, lng, campus_lat, campus_lng);
  const distanceToParkingEntry = haversineDistance(lat, lng, parking_entry_lat, parking_entry_lng);

  const insideCampus = distanceToCampus <= campus_radius_m;
  const insideParkingEntry = distanceToParkingEntry <= parking_entry_radius_m;

  let status, message;
  if (insideParkingEntry) {
    status = 'inside_parking_entry';
    message = 'You are at the parking entrance. You can request a slot!';
  } else if (insideCampus) {
    status = 'inside_campus';
    message = `You are on campus but not at the parking entrance yet. Distance to parking: ${Math.round(distanceToParkingEntry)}m`;
  } else {
    status = 'outside_campus';
    message = `You are off-campus. Distance to campus: ${Math.round(distanceToCampus)}m`;
  }

  return {
    insideCampus,
    insideParkingEntry,
    status,
    message,
    distanceToCampus: Math.round(distanceToCampus),
    distanceToParkingEntry: Math.round(distanceToParkingEntry),
  };
}

module.exports = { haversineDistance, verifyGeofence };
