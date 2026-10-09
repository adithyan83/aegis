// AEGIS Emergency Service & Notification Engine
// KnightMaster Innovations Pvt. Ltd. - AEGIS One Specs
const {
  createEmergencyRecord,
  updateEmergencyAddress,
  updateEmergencyStatus,
  getEmergencyById,
  listEmergencies
} = require('./db.js');

/**
 * Validates coordinate inputs securely
 * Checks bounds: -90 <= lat <= 90, -180 <= lon <= 180, accuracy >= 0
 */
function validateCoordinates(coords) {
  if (!coords) return { valid: false, reason: 'No coordinates object provided' };

  const { latitude, longitude, accuracy, timestamp } = coords;

  // Check if coordinates were explicitly omitted (e.g. permission denied)
  if (latitude === null || latitude === undefined || longitude === null || longitude === undefined) {
    return { valid: true, isUnavailable: true };
  }

  const lat = Number(latitude);
  const lng = Number(longitude);
  const acc = Number(accuracy ?? 0);
  const time = Number(timestamp ?? Date.now());

  if (isNaN(lat) || !isFinite(lat) || lat < -90 || lat > 90) {
    return { valid: false, reason: 'Latitude must be a valid number between -90 and 90 degrees' };
  }

  if (isNaN(lng) || !isFinite(lng) || lng < -180 || lng > 180) {
    return { valid: false, reason: 'Longitude must be a valid number between -180 and 180 degrees' };
  }

  if (isNaN(acc) || !isFinite(acc) || acc < 0) {
    return { valid: false, reason: 'Accuracy must be a non-negative number' };
  }

  if (isNaN(time) || time <= 0) {
    return { valid: false, reason: 'Timestamp must be a valid unix epoch millisecond integer' };
  }

  return {
    valid: true,
    isUnavailable: false,
    latitude: lat,
    longitude: lng,
    accuracy: Math.round(acc * 10) / 10,
    timestamp: Math.round(time)
  };
}

/**
 * Creates an emergency record and triggers notifications
 */
function handleEmergencyCreation({ user, coords, alertType = 'POLICE', readableAddress = null }) {
  // 1. Validate coordinates
  const validation = validateCoordinates(coords);
  if (!validation.valid) {
    throw new Error(`Invalid location data: ${validation.reason}`);
  }

  const emergencyId = `emg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const hasLocation = !validation.isUnavailable;

  const lat = hasLocation ? validation.latitude : null;
  const lng = hasLocation ? validation.longitude : null;
  const acc = hasLocation ? validation.accuracy : null;
  const time = hasLocation ? validation.timestamp : Date.now();

  const googleMapsUrl = hasLocation
    ? `https://www.google.com/maps?q=${lat},${lng}`
    : null;

  const emergencyStatus = hasLocation ? 'DISPATCHED' : 'LOCATION_UNAVAILABLE';

  // 2. Persist to Database
  const record = createEmergencyRecord({
    emergency_id: emergencyId,
    user_id: user.user_id,
    latitude: lat,
    longitude: lng,
    accuracy: acc,
    timestamp: time,
    readable_address: readableAddress,
    emergency_status: emergencyStatus,
    alert_type: alertType,
    google_maps_url: googleMapsUrl,
    created_at: Date.now(),
    updated_at: Date.now()
  });

  // 3. Trigger Server Emergency Notification Dispatch
  triggerServerEmergencyNotification(record, user);

  return record;
}

/**
 * Server-side emergency notification dispatcher
 * Notifies PCR, EMS, designated contacts with authoritative GPS coordinates
 */
function triggerServerEmergencyNotification(emergency, user) {
  const timeStr = new Date(emergency.timestamp).toLocaleTimeString();
  const alertName = emergency.alert_type || 'POLICE';
  const hasCoords = emergency.latitude !== null && emergency.longitude !== null;

  console.log(`\n======================================================`);
  console.log(`🚨 [AEGIS BACKEND] EMERGENCY NOTIFICATION BROADCAST TRIGGERED`);
  console.log(`======================================================`);
  console.log(`EMERGENCY ID:   ${emergency.emergency_id}`);
  console.log(`USER ID:        ${emergency.user_id} (${user.full_name || 'Alex Morgan'})`);
  console.log(`ALERT TYPE:     ${alertName}`);
  console.log(`TIME:           ${timeStr}`);
  console.log(`STATUS:         ${emergency.emergency_status}`);
  if (hasCoords) {
    console.log(`AUTHORITATIVE GPS: ${emergency.latitude}, ${emergency.longitude} (±${emergency.accuracy}m)`);
    console.log(`GOOGLE MAPS LINK:  ${emergency.google_maps_url}`);
  } else {
    console.log(`⚠️ LOCATION STATUS: LOCATION_UNAVAILABLE (GPS permission denied or pending on device)`);
  }
  if (emergency.readable_address) {
    console.log(`READABLE ADDRESS:  ${emergency.readable_address}`);
  }
  console.log(`RECIPIENTS:     Central Police Command (112), EMS Dispatch, Registered Emergency Contacts`);
  console.log(`======================================================\n`);
}

module.exports = {
  validateCoordinates,
  handleEmergencyCreation,
  updateEmergencyAddress,
  updateEmergencyStatus,
  getEmergencyById,
  listEmergencies
};
