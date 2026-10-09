// AEGIS One Main Controller & Interaction Engine
// Reference: KnightMaster Innovations Pvt. Ltd. - AEGIS One Specs
import 'leaflet/dist/leaflet.css';
import { safetyState, SYSTEM_STATES, ALERT_TYPES } from './state.js';
import { EmergencyMap } from './map.js';
import { contactManager } from './contacts.js';
import { sound } from './sound.js';
import { phoneSensors } from './phoneSensors.js';
import { dispatcher } from './dispatch.js';
import { initQRCode } from './qr.js';
import { emergencyApi, LOCATION_UI_STATES } from './emergencyApi.js';

let emergencyMap = null;

document.addEventListener('DOMContentLoaded', () => {
  // 1. Initialize Leaflet Tactical Map
  emergencyMap = new EmergencyMap('tactical-map-container');
  emergencyMap.init();

  // 2. Setup Navigation Tabs
  setupNavigationTabs();

  // 3. Setup AEGIS One 3 Dedicated Hardware Buttons
  setupAegisHardwareButtons();

  // 4. Setup Showcase Screen Buttons
  setupShowcaseButtons();

  // 5. Setup Mistouch Cancellation & Emergency Resolution
  setupAlertControls();

  // 6. Setup Phone Gateway & GPS
  setupPhoneGateway();

  // 7. Setup Web Bluetooth for Physical AEGIS One
  setupWebBluetooth();

  // 8. Setup Medical Profile Form
  setupMedicalProfileForm();

  // 9. Setup Settings Form
  setupSettingsForm();

  // 10. Setup Emergency Contacts UI
  setupContactsUI();

  // 11. Setup Mobile QR Modal
  setupQRModal();

  // 12. Sound Toggle & Find My AEGIS
  setupUtilityButtons();

  // 13. Map controls & Admin Monitor
  setupMapControls();
  setupAdminMonitor();

  // 14. Setup Location Feedback Controller (Core location flow UI states)
  setupLocationFeedbackController();

  // 15. Wire Alert Trigger & Cancel Listeners to Emergency API
  safetyState.onAlertTrigger(handleEmergencyTrigger);
  safetyState.onAlertCancel(handleEmergencyCancel);

  // 16. Subscribe to State Changes & Update UI
  safetyState.subscribe(updateUIFromState);

  // Initial load of backend emergencies for admin map view
  loadRecentBackendEmergencies();

  // Initial log
  safetyState.logEvent('INFO', 'AEGIS One IPSD Initialized. 3 Dedicated Emergency Channels Armed.');
});

// Setup Tab Navigation (Hub, Map, Contacts, Medical, Specs)
function setupNavigationTabs() {
  const tabs = document.querySelectorAll('.nav-tab');
  const contents = document.querySelectorAll('.tab-content');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const targetId = tab.dataset.tab;

      tabs.forEach(t => t.classList.remove('active'));
      contents.forEach(c => c.classList.remove('active'));

      tab.classList.add('active');
      document.getElementById(targetId)?.classList.add('active');

      // Refresh map size if switching to map tab
      if (targetId === 'tab-map' && emergencyMap && emergencyMap.map) {
        setTimeout(() => emergencyMap.map.invalidateSize(), 150);
      }
    });
  });
}

// Setup the 3 Dedicated Hardware Buttons (Police 🔴, Medical 🟢, Contact 🔵)
function setupAegisHardwareButtons() {
  const buttons = [
    { id: 'btn-hw-police', barId: 'hold-progress-police', type: ALERT_TYPES.POLICE },
    { id: 'btn-hw-medical', barId: 'hold-progress-medical', type: ALERT_TYPES.MEDICAL },
    { id: 'btn-hw-contact', barId: 'hold-progress-contact', type: ALERT_TYPES.CONTACT }
  ];

  buttons.forEach(({ id, barId, type }) => {
    const btn = document.getElementById(id);
    const bar = document.getElementById(barId);
    if (!btn) return;

    let holdStart = 0;
    let holdTimer = null;

    const startPress = (e) => {
      e.preventDefault();
      btn.classList.add('pressed');
      phoneSensors.triggerHapticPulse();
      sound.playClick();
      holdStart = Date.now();

      // Track hold progress for 5s immediate trigger
      const targetDurationMs = safetyState.config.immediateLongPressSec * 1000;
      if (holdTimer) clearInterval(holdTimer);

      holdTimer = setInterval(() => {
        const elapsed = Date.now() - holdStart;
        const pct = Math.min(100, (elapsed / targetDurationMs) * 100);
        if (bar) bar.style.width = `${pct}%`;

        if (pct >= 100) {
          clearInterval(holdTimer);
          holdTimer = null;
          if (bar) bar.style.width = '0%';
          btn.classList.remove('pressed');
          // Immediate dispatch (bypasses 120s countdown)
          safetyState.triggerAlert(type, true);
        }
      }, 50);
    };

    const endPress = (e) => {
      e.preventDefault();
      btn.classList.remove('pressed');

      if (holdTimer) {
        clearInterval(holdTimer);
        holdTimer = null;
        if (bar) bar.style.width = '0%';

        const elapsed = Date.now() - holdStart;
        // If released before 5s, trigger standard 120s mistouch countdown
        if (elapsed < safetyState.config.immediateLongPressSec * 1000) {
          safetyState.triggerAlert(type, false);
        }
      }
    };

    btn.addEventListener('mousedown', startPress);
    btn.addEventListener('mouseup', endPress);
    btn.addEventListener('mouseleave', endPress);

    btn.addEventListener('touchstart', startPress, { passive: false });
    btn.addEventListener('touchend', endPress, { passive: false });
  });
}

// Setup On-Screen Dedicated Trigger Buttons
function setupShowcaseButtons() {
  document.querySelectorAll('.btn-trigger-action').forEach(btn => {
    btn.addEventListener('click', () => {
      const type = btn.dataset.type;
      safetyState.triggerAlert(type, false);
    });
  });
}

// Setup Alert Cancellation and PIN Resolution
function setupAlertControls() {
  // Cancel Alert button on the 120s Mistouch Banner
  const btnCancel = document.getElementById('btn-cancel-mistouch');
  btnCancel?.addEventListener('click', () => {
    phoneSensors.stopHaptics();
    safetyState.cancelAlert('MISTOUCH_APP_CANCEL');
  });

  // Resolve Active Emergency button
  const btnResolve = document.getElementById('btn-resolve-emergency');
  btnResolve?.addEventListener('click', () => {
    const pin = prompt(`Enter Security PIN to Deactivate Emergency (Default: ${safetyState.config.securityPin}):`, '1234');
    if (pin === safetyState.config.securityPin) {
      phoneSensors.stopHaptics();
      safetyState.cancelAlert('PIN_VERIFIED_DEACTIVATION');
      contactManager.resetStatus();
    } else if (pin !== null) {
      alert('Incorrect Security PIN. Emergency alert remains live!');
    }
  });
}

// Setup Phone GPS, Haptics, Torch & Native Share Execution
function setupPhoneGateway() {
  const btnSync = document.getElementById('btn-activate-phone-sensors');
  const btnVibe = document.getElementById('btn-test-phone-vibe');
  const btnTorch = document.getElementById('btn-toggle-torch');
  const btnShare = document.getElementById('btn-test-native-share');
  const termCoords = document.getElementById('terminal-coords');
  const termAddr = document.getElementById('terminal-address');
  const labelWake = document.getElementById('label-wake-lock');

  // 1. Sync GPS & Haptics
  btnSync?.addEventListener('click', async () => {
    btnSync.textContent = '⏳ Syncing Real GPS & Haptics...';

    // Start real continuous GPS tracking
    phoneSensors.startRealGPSTracking((coords) => {
      if (termCoords && coords.lat && coords.lng) {
        termCoords.textContent = `${coords.lat.toFixed(5)}° N, ${coords.lng.toFixed(5)}° E`;
      }
      if (termAddr && coords.address) {
        termAddr.textContent = coords.address;
      }
      if (emergencyMap && coords.lat && coords.lng) {
        emergencyMap.updatePosition(coords.lat, coords.lng, coords.address, coords.speed);
      }
      btnSync.textContent = '✅ Phone GPS & Haptics Synced';
      btnSync.classList.add('synced');
    });

    // Request Screen Wake Lock so phone stays awake
    await phoneSensors.requestWakeLock();
    if (labelWake) labelWake.textContent = 'Active (Display Locked Awake)';

    phoneSensors.triggerHapticPulse();
    sound.playClick();
  });

  // 2. Physical Vibration Test
  btnVibe?.addEventListener('click', () => {
    phoneSensors.triggerHapticImpact();
    sound.playWarningBeep(880);
    safetyState.logEvent('INFO', '📳 Executed physical vibration pulse on smartphone handset.');
  });

  // 3. Camera Flashlight Torch Strobe Test
  let torchOn = false;
  btnTorch?.addEventListener('click', async () => {
    torchOn = !torchOn;
    if (torchOn) {
      await phoneSensors.startTorchStrobe();
      btnTorch.textContent = '🔦 Stop Flashlight Strobe';
      btnTorch.classList.add('torch-active');
      safetyState.logEvent('INFO', '🔦 Emergency Camera LED Strobe active.');
    } else {
      phoneSensors.stopTorchStrobe();
      btnTorch.textContent = '🔦 Flashlight / Strobe';
      btnTorch.classList.remove('torch-active');
    }
  });

  // 4. Native Phone Emergency Share Test
  btnShare?.addEventListener('click', () => {
    const activeCoords = phoneSensors.currentCoords.lat
      ? phoneSensors.currentCoords
      : (emergencyMap ? emergencyMap.currentPos : { lat: 12.9716, lng: 77.5946, accuracy: 5 });

    dispatcher.dispatchToContacts(activeCoords);
  });
}

// Setup Web Bluetooth API for Physical AEGIS One Device
function setupWebBluetooth() {
  const btnBle = document.getElementById('btn-connect-ble');
  const labelBle = document.getElementById('ble-btn-label');

  btnBle?.addEventListener('click', async () => {
    if (phoneSensors.bleConnected) {
      phoneSensors.disconnectBLE();
      if (labelBle) labelBle.textContent = 'Pair AEGIS One';
      btnBle.classList.remove('connected');
    } else {
      if (labelBle) labelBle.textContent = 'Scanning BLE...';
      const success = await phoneSensors.connectRealBLEDevice();
      if (success) {
        if (labelBle) labelBle.textContent = `Connected: ${phoneSensors.bleDevice?.name || 'AEGIS One'}`;
        btnBle.classList.add('connected');
      } else {
        if (labelBle) labelBle.textContent = 'Pair AEGIS One';
      }
    }
  });
}

// Medical Profile Form Handler
function setupMedicalProfileForm() {
  const form = document.getElementById('form-medical-profile');
  const hudName = document.getElementById('hud-med-name');
  const hudBlood = document.getElementById('hud-blood-group');
  const hudAllergies = document.getElementById('hud-med-allergies');
  const hudConditions = document.getElementById('hud-med-conditions');

  // Populate form with current values
  const med = safetyState.medicalProfile;
  if (document.getElementById('med-full-name')) document.getElementById('med-full-name').value = med.fullName;
  if (document.getElementById('med-blood-group')) document.getElementById('med-blood-group').value = med.bloodGroup;
  if (document.getElementById('med-allergies')) document.getElementById('med-allergies').value = med.allergies;
  if (document.getElementById('med-conditions')) document.getElementById('med-conditions').value = med.conditions;
  if (document.getElementById('med-emergency-notes')) document.getElementById('med-emergency-notes').value = med.emergencyNotes;

  form?.addEventListener('submit', (e) => {
    e.preventDefault();
    safetyState.medicalProfile = {
      fullName: document.getElementById('med-full-name').value.trim(),
      bloodGroup: document.getElementById('med-blood-group').value,
      allergies: document.getElementById('med-allergies').value.trim(),
      conditions: document.getElementById('med-conditions').value.trim(),
      emergencyNotes: document.getElementById('med-emergency-notes').value.trim(),
      nationalId: safetyState.medicalProfile.nationalId
    };
    safetyState.saveData();

    if (hudName) hudName.textContent = safetyState.medicalProfile.fullName;
    if (hudBlood) hudBlood.textContent = safetyState.medicalProfile.bloodGroup;
    if (hudAllergies) hudAllergies.textContent = safetyState.medicalProfile.allergies;
    if (hudConditions) hudConditions.textContent = safetyState.medicalProfile.conditions;

    safetyState.logEvent('SUCCESS', 'Medical Profile & Emergency ID updated successfully.');
    alert('Medical Profile Saved! This information will be transmitted with Button 2 (Medical) alerts.');
  });
}

// Settings Form Handler
function setupSettingsForm() {
  const form = document.getElementById('form-settings');
  form?.addEventListener('submit', (e) => {
    e.preventDefault();
    safetyState.config.mistouchDurationSec = parseInt(document.getElementById('opt-mistouch-duration').value, 10);
    safetyState.config.immediateLongPressSec = parseFloat(document.getElementById('opt-hold-duration').value);
    safetyState.config.securityPin = document.getElementById('opt-security-pin').value.trim() || '1234';
    safetyState.saveData();

    safetyState.logEvent('INFO', `Settings Saved: Mistouch Window = ${safetyState.config.mistouchDurationSec}s, Long Press = ${safetyState.config.immediateLongPressSec}s`);
    alert('AEGIS One Settings Updated!');
  });
}

// Contact Management
function setupContactsUI() {
  const modal = document.getElementById('modal-add-contact');
  const openBtn = document.getElementById('btn-add-contact');
  const closeBtn = document.getElementById('btn-close-add-contact');
  const form = document.getElementById('form-add-contact');

  openBtn?.addEventListener('click', () => modal?.classList.add('visible'));
  closeBtn?.addEventListener('click', () => modal?.classList.remove('visible'));

  form?.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = document.getElementById('contact-name').value.trim();
    const phone = document.getElementById('contact-phone').value.trim();
    const relation = document.getElementById('contact-relation').value;
    const priority = document.getElementById('contact-priority').value;

    if (name && phone) {
      contactManager.addContact({ name, phone, relation, priority, channels: ['SMS', 'WhatsApp'] });
      form.reset();
      modal?.classList.remove('visible');
      safetyState.logEvent('INFO', `Added emergency contact: ${name} (${phone})`);
    }
  });

  contactManager.subscribe((contacts, dispatchQueue) => {
    renderContactsList(contacts);
    renderDispatchQueue(dispatchQueue);
  });
}

function renderContactsList(contacts) {
  const listEl = document.getElementById('contacts-list');
  if (!listEl) return;

  listEl.innerHTML = contacts.map(c => `
    <div class="contact-card priority-${c.priority} status-${c.status.toLowerCase()}">
      <div class="contact-avatar">${c.name.charAt(0)}</div>
      <div class="contact-details">
        <div class="contact-header">
          <span class="contact-name">${c.name}</span>
          <span class="badge-priority">P${c.priority}</span>
        </div>
        <div class="contact-meta">
          <span>${c.phone}</span> • <span class="relation-tag">${c.relation}</span>
        </div>
        <div class="contact-channels">
          ${c.channels.map(ch => `<span class="channel-pill">${ch}</span>`).join('')}
          <span class="status-pill status-${c.status.toLowerCase()}">${c.status}</span>
        </div>
      </div>
      <button class="btn-delete-contact" data-id="${c.id}" title="Remove Contact">×</button>
    </div>
  `).join('');

  listEl.querySelectorAll('.btn-delete-contact').forEach(btn => {
    btn.addEventListener('click', () => {
      contactManager.deleteContact(btn.dataset.id);
    });
  });
}

function renderDispatchQueue(queue) {
  const queueEl = document.getElementById('dispatch-queue-container');
  if (!queueEl) return;

  if (queue.length === 0) {
    queueEl.innerHTML = `<div class="empty-queue-hint">No active dispatches. Outgoing transmissions will appear here during an alert.</div>`;
    return;
  }

  queueEl.innerHTML = queue.map(item => `
    <div class="dispatch-message-item ${item.deliveryStatus.toLowerCase()}">
      <div class="dispatch-msg-header">
        <strong>${item.contactName} (${item.phone})</strong>
        <span class="dispatch-time">${item.time}</span>
      </div>
      <div class="dispatch-body">${item.smsText}</div>
      <div class="dispatch-status-badge">
        ${item.deliveryStatus === 'DELIVERED' ? '✓✓ Delivered to recipient' : item.deliveryStatus === 'ACKNOWLEDGED' ? '★ Acknowledged by Contact' : '⏳ Transmitting...'}
      </div>
    </div>
  `).join('');
}

// QR Modal for Phone Connection
function setupQRModal() {
  const btnOpen = document.getElementById('btn-open-mobile-link');
  const btnClose = document.getElementById('btn-close-phone-link');
  const modal = document.getElementById('modal-phone-link');

  btnOpen?.addEventListener('click', () => {
    modal?.classList.add('visible');
    initQRCode('qr-code-canvas', 'qr-target-url');
  });

  btnClose?.addEventListener('click', () => {
    modal?.classList.remove('visible');
  });
}

// Utility buttons (Sound toggle & Find My AEGIS)
function setupUtilityButtons() {
  const soundBtn = document.getElementById('btn-sound-toggle');
  soundBtn?.addEventListener('click', () => {
    const isMuted = !sound.toggleSound();
    soundBtn.classList.toggle('muted', isMuted);
    soundBtn.innerHTML = isMuted
      ? `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 5L6 9H2v6h4l5 4V5z"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg><span>Audio Muted</span>`
      : `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg><span>Audio Active</span>`;
    sound.playClick();
  });

  document.getElementById('btn-find-aegis')?.addEventListener('click', () => {
    safetyState.triggerFindMyAegis();
  });
}

// Map Controls
function setupMapControls() {
  document.getElementById('btn-map-center')?.addEventListener('click', () => emergencyMap.centerOnWearer());
  document.getElementById('btn-map-real-gps')?.addEventListener('click', () => {
    phoneSensors.startRealGPSTracking((coords) => {
      emergencyMap.updatePosition(coords.lat, coords.lng, coords.address, coords.speed);
      emergencyMap.centerOnWearer();
    });
  });

  const moveToggle = document.getElementById('btn-map-simulate-move');
  let moving = false;
  moveToggle?.addEventListener('click', () => {
    moving = !moving;
    if (moving) {
      emergencyMap.startMovementSimulation();
      moveToggle.classList.add('active-sim');
      moveToggle.textContent = '⏸ Pause Motion';
    } else {
      emergencyMap.stopMovementSimulation();
      moveToggle.classList.remove('active-sim');
      moveToggle.textContent = '▶ Simulate Motion';
    }
  });
}

// Format seconds into MM:SS format (e.g. 120 -> "02:00", 80 -> "01:20")
function formatSecondsToMMSS(seconds) {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = (seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

// Reactively Update the UI from State Machine Snapshot
function updateUIFromState(snapshot) {
  const { state, activeAlertType, config, telemetry, countdownRemaining, countdownPercent, logs } = snapshot;

  // 1. Status Pill & LED
  const statusPill = document.getElementById('system-status-pill');
  const statusText = document.getElementById('status-pill-text');
  const rgbLed = document.getElementById('device-rgb-led');
  const deviceStateLabel = document.getElementById('device-state-label');

  if (statusPill && statusText) {
    if (state === SYSTEM_STATES.ALL_SAFE) {
      statusPill.className = 'status-pill state-all_safe';
      statusText.textContent = 'ALL SAFE · NO ALERTS';
      if (rgbLed) rgbLed.className = 'aegis-rgb-led led-green';
      if (deviceStateLabel) deviceStateLabel.textContent = 'STANDBY / ARMED';
    } else if (state === SYSTEM_STATES.MISTOUCH_WINDOW) {
      statusPill.className = 'status-pill state-mistouch';
      statusText.textContent = `MISTOUCH WINDOW (${formatSecondsToMMSS(countdownRemaining)})`;
      if (rgbLed) rgbLed.className = 'aegis-rgb-led led-amber';
      if (deviceStateLabel) deviceStateLabel.textContent = 'COUNTDOWN IN PROGRESS';
      // Trigger physical phone vibration
      phoneSensors.triggerHapticWarning();
    } else if (state === SYSTEM_STATES.ACTIVE_DISPATCH) {
      statusPill.className = 'status-pill state-sos_active';
      statusText.textContent = `🚨 ${activeAlertType || 'EMERGENCY'} DISPATCH LIVE`;
      if (rgbLed) rgbLed.className = 'aegis-rgb-led led-red';
      if (deviceStateLabel) deviceStateLabel.textContent = 'BEACON ACTIVE';
    }
  }

  // 2. Mistouch Prevention Banner (Screen 2: Emergency Alert in Progress)
  const mistouchBanner = document.getElementById('mistouch-alert-banner');
  const timerDigits = document.getElementById('timer-display-digits');
  const progressBar = document.getElementById('countdown-progress-bar');
  const bannerCat = document.getElementById('banner-alert-category');
  const durationLabel = document.getElementById('countdown-duration-label');

  if (mistouchBanner) {
    if (state === SYSTEM_STATES.MISTOUCH_WINDOW) {
      mistouchBanner.classList.add('active');
      if (timerDigits) timerDigits.textContent = formatSecondsToMMSS(countdownRemaining);
      if (progressBar) progressBar.style.width = `${countdownPercent}%`;
      if (durationLabel) durationLabel.textContent = config.mistouchDurationSec;
      if (bannerCat) {
        bannerCat.textContent = activeAlertType === ALERT_TYPES.POLICE ? 'POLICE EMERGENCY IN PROGRESS'
          : activeAlertType === ALERT_TYPES.MEDICAL ? 'MEDICAL & AMBULANCE ALERT IN PROGRESS'
          : 'FAMILY & CUSTOM CONTACT ALERT IN PROGRESS';
      }
    } else {
      mistouchBanner.classList.remove('active');
    }
  }

  // 3. Active Emergency Banner
  const dispatchBanner = document.getElementById('active-dispatch-banner');
  const dispatchTitle = document.getElementById('active-dispatch-title');
  if (dispatchBanner) {
    dispatchBanner.classList.toggle('active', state === SYSTEM_STATES.ACTIVE_DISPATCH);
    if (dispatchTitle && activeAlertType) {
      dispatchTitle.textContent = `${activeAlertType} EMERGENCY DISPATCH ACTIVE`;
    }
  }

  // 4. Update Map Beacon state
  if (emergencyMap) {
    emergencyMap.setEmergencyMode(state === SYSTEM_STATES.ACTIVE_DISPATCH);
  }

  // 5. Automatic Dispatch Trigger when confirmed
  if (state === SYSTEM_STATES.ACTIVE_DISPATCH && contactManager.dispatchQueue.length === 0) {
    phoneSensors.triggerHapticImpact();

    const activeCoords = phoneSensors.currentCoords.lat
      ? phoneSensors.currentCoords
      : (emergencyMap ? emergencyMap.currentPos : { lat: 12.9716, lng: 77.5946, accuracy: 5 });

    // Open multi-channel dispatch dialog
    dispatcher.dispatchToContacts(activeCoords);

    contactManager.dispatchEmergencyAlerts({
      lat: activeCoords.lat,
      lng: activeCoords.lng,
      accuracy: activeCoords.accuracy || 5,
      battery: telemetry.battery,
      reason: activeAlertType
    });
  }

  // 6. Update Telemetry display
  const telBatt = document.getElementById('tel-battery');
  if (telBatt) telBatt.textContent = `${telemetry.battery}%`;

  // 7. Render Logs
  const logsContainer = document.getElementById('incident-logs-list');
  if (logsContainer && logs) {
    logsContainer.innerHTML = logs.slice(0, 15).map(log => `
      <div class="log-entry log-${log.type.toLowerCase()}">
        <span class="log-time">${log.time}</span>
        <span class="log-msg">${log.message}</span>
      </div>
    `).join('');
  }
}

// ==========================================================================
// EMERGENCY LOCATION WORKFLOW & UI FEEDBACK CONTROLLER
// Core requirement: Clear UI feedback states:
// "Getting your location...", "Location acquired", "Emergency alert sent", "Unable to access location"
// ==========================================================================

async function handleEmergencyTrigger(alertType, immediate) {
  try {
    const record = await emergencyApi.triggerEmergencyLocationFlow(alertType);
    if (record) {
      safetyState.lastEmergencyRecord = record;
      updateAdminEmergencyMonitor(record);

      if (emergencyMap && record.latitude !== null && record.longitude !== null) {
        emergencyMap.displayAuthoritativeEmergency(record);
      }
      loadRecentBackendEmergencies();
    }
  } catch (err) {
    console.error('[AEGIS] Emergency location trigger error:', err);
  }
}

async function handleEmergencyCancel(method) {
  const toast = document.getElementById('location-feedback-toast');
  if (emergencyApi.currentEmergencyRecord?.emergency_id) {
    try {
      await emergencyApi.resolveEmergency(emergencyApi.currentEmergencyRecord.emergency_id);
      loadRecentBackendEmergencies();
    } catch (e) {
      console.warn('Backend resolve error:', e.message);
    }
  }
  
  if (toast) {
    setTimeout(() => {
      if (safetyState.state === SYSTEM_STATES.ALL_SAFE) {
        toast.classList.add('hidden');
      }
    }, 3000);
  }
}

function setupLocationFeedbackController() {
  const toast = document.getElementById('location-feedback-toast');
  const icon = document.getElementById('feedback-icon');
  const title = document.getElementById('feedback-status-title');
  const details = document.getElementById('feedback-details-text');
  const gmapsBtn = document.getElementById('feedback-gmaps-link');
  const stripDot = document.getElementById('strip-loc-dot');
  const stripLabel = document.getElementById('strip-loc-label');
  const stripCoords = document.getElementById('strip-loc-coords');

  emergencyApi.onStatusChange(({ status, type, record }) => {
    if (!toast) return;

    // Show toast and reset previous state classes
    toast.classList.remove('hidden', 'state-getting', 'state-acquired', 'state-sent', 'state-unable');

    if (status === LOCATION_UI_STATES.GETTING) {
      toast.classList.add('state-getting');
      if (icon) icon.textContent = '📡';
      if (title) title.textContent = LOCATION_UI_STATES.GETTING;
      if (details) details.textContent = 'Querying browser GPS hardware (navigator.geolocation)...';
      if (gmapsBtn) gmapsBtn.classList.add('hidden');

      if (stripDot) stripDot.className = 'strip-loc-dot';
      if (stripLabel) stripLabel.textContent = LOCATION_UI_STATES.GETTING;
      if (stripCoords) stripCoords.textContent = 'Requesting GPS lock...';

      safetyState.logEvent('INFO', `📍 Location Status: ${LOCATION_UI_STATES.GETTING}`);

    } else if (status === LOCATION_UI_STATES.ACQUIRED) {
      toast.classList.add('state-acquired');
      if (icon) icon.textContent = '🎯';
      if (title) title.textContent = LOCATION_UI_STATES.ACQUIRED;
      if (details) details.textContent = 'GPS coordinates locked. Transmitting to backend...';
      if (gmapsBtn) gmapsBtn.classList.add('hidden');

      if (stripDot) stripDot.className = 'strip-loc-dot dot-acquired';
      if (stripLabel) stripLabel.textContent = LOCATION_UI_STATES.ACQUIRED;

      safetyState.logEvent('SUCCESS', `🎯 Location Status: ${LOCATION_UI_STATES.ACQUIRED}`);

    } else if (status === LOCATION_UI_STATES.SENT) {
      toast.classList.add('state-sent');
      if (icon) icon.textContent = '🚨';
      if (title) title.textContent = LOCATION_UI_STATES.SENT;

      const hasCoords = record && record.latitude !== null && record.longitude !== null;
      if (hasCoords) {
        if (details) {
          details.textContent = `Authoritative GPS: ${Number(record.latitude).toFixed(5)}, ${Number(record.longitude).toFixed(5)} (±${record.accuracy || 5}m)`;
        }
        if (gmapsBtn && record.google_maps_url) {
          gmapsBtn.href = record.google_maps_url;
          gmapsBtn.classList.remove('hidden');
        }
        if (stripCoords) {
          stripCoords.textContent = `${Number(record.latitude).toFixed(5)}° N, ${Number(record.longitude).toFixed(5)}° E (±${record.accuracy || 5}m)`;
        }
      } else {
        if (details) details.textContent = 'Dispatched without coordinates (Location was unavailable).';
        if (gmapsBtn) gmapsBtn.classList.add('hidden');
        if (stripCoords) stripCoords.textContent = 'Coordinates: Unavailable';
      }

      if (stripDot) stripDot.className = hasCoords ? 'strip-loc-dot dot-acquired' : 'strip-loc-dot dot-unable';
      if (stripLabel) stripLabel.textContent = LOCATION_UI_STATES.SENT;

      safetyState.logEvent('DANGER', `💥 ${LOCATION_UI_STATES.SENT}. Emergency ID: ${record?.emergency_id || 'Active'}`);

      // Update map and admin monitor
      if (record) {
        updateAdminEmergencyMonitor(record);
        if (emergencyMap && hasCoords) {
          emergencyMap.displayAuthoritativeEmergency(record);
        }
      }

    } else if (status === LOCATION_UI_STATES.UNABLE) {
      toast.classList.add('state-unable');
      if (icon) icon.textContent = '⚠️';
      if (title) title.textContent = LOCATION_UI_STATES.UNABLE;
      if (details) details.textContent = 'Permission denied or sensor unavailable. Continuing emergency alert...';
      if (gmapsBtn) gmapsBtn.classList.add('hidden');

      if (stripDot) stripDot.className = 'strip-loc-dot dot-unable';
      if (stripLabel) stripLabel.textContent = LOCATION_UI_STATES.UNABLE;
      if (stripCoords) stripCoords.textContent = 'Coordinates: Permission Denied / Sensor Unavailable';

      safetyState.logEvent('WARN', `⚠️ Location Status: ${LOCATION_UI_STATES.UNABLE}. Continuing alert dispatch.`);
    }
  });
}

// ==========================================================================
// RECIPIENT & ADMIN EMERGENCY DISPATCH MONITOR
// Authoritative Coordinates, Google Maps link, and Database Feed
// ==========================================================================

function setupAdminMonitor() {
  const btnRefresh = document.getElementById('btn-refresh-backend-emergencies');
  btnRefresh?.addEventListener('click', () => {
    btnRefresh.textContent = '⏳ Querying...';
    loadRecentBackendEmergencies().finally(() => {
      setTimeout(() => { btnRefresh.textContent = '🔄 Sync Database'; }, 400);
    });
  });

  const btnFocusPin = document.getElementById('btn-focus-emergency-pin');
  btnFocusPin?.addEventListener('click', () => {
    if (emergencyMap) {
      emergencyMap.centerOnWearer();
      if (emergencyMap.userMarker) emergencyMap.userMarker.openPopup();
    }
  });
}

function updateAdminEmergencyMonitor(record) {
  if (!record) return;

  const idEl = document.getElementById('monitor-emg-id');
  const userEl = document.getElementById('monitor-user-name');
  const coordsEl = document.getElementById('monitor-coords');
  const accEl = document.getElementById('monitor-accuracy');
  const typeEl = document.getElementById('monitor-alert-type');
  const addrEl = document.getElementById('monitor-address');
  const badgeEl = document.getElementById('monitor-status-badge');
  const gmapsLink = document.getElementById('monitor-gmaps-link');
  const activeDispatchCoords = document.getElementById('active-dispatch-coords');
  const activeDispatchGmaps = document.getElementById('btn-active-dispatch-gmaps');

  if (idEl) idEl.textContent = record.emergency_id;
  if (userEl) userEl.textContent = `${record.full_name || 'Alex Morgan'} (${record.user_id})`;

  const hasCoords = record.latitude !== null && record.longitude !== null;
  const latNum = Number(record.latitude);
  const lngNum = Number(record.longitude);

  if (hasCoords) {
    const coordsStr = `${latNum.toFixed(5)}° N, ${lngNum.toFixed(5)}° E`;
    if (coordsEl) coordsEl.textContent = coordsStr;
    if (accEl) accEl.textContent = `±${record.accuracy || 5} meters`;

    const gmapsUrl = record.google_maps_url || `https://www.google.com/maps?q=${latNum},${lngNum}`;
    if (gmapsLink) {
      gmapsLink.href = gmapsUrl;
      gmapsLink.classList.remove('disabled');
    }
    if (activeDispatchCoords) {
      activeDispatchCoords.textContent = `${coordsStr} (±${record.accuracy || 5}m)`;
    }
    if (activeDispatchGmaps) {
      activeDispatchGmaps.href = gmapsUrl;
      activeDispatchGmaps.classList.remove('hidden');
    }
  } else {
    if (coordsEl) coordsEl.textContent = 'Location Unavailable (Permission Denied / Error)';
    if (accEl) accEl.textContent = 'N/A';
    if (gmapsLink) {
      gmapsLink.href = '#';
      gmapsLink.classList.add('disabled');
    }
    if (activeDispatchCoords) {
      activeDispatchCoords.textContent = 'Location Unavailable';
    }
    if (activeDispatchGmaps) {
      activeDispatchGmaps.classList.add('hidden');
    }
  }

  if (typeEl) typeEl.textContent = `${record.alert_type || 'POLICE'} (${record.emergency_status || 'DISPATCHED'})`;
  if (badgeEl) {
    badgeEl.textContent = record.emergency_status || 'DISPATCHED';
    badgeEl.className = `badge-tag ${record.emergency_status === 'DISPATCHED' ? 'badge-red' : 'badge-amber'}`;
  }
  if (addrEl) {
    addrEl.textContent = record.readable_address || (hasCoords ? 'Pending reverse geocoding...' : 'No address available');
  }
}

async function loadRecentBackendEmergencies() {
  const container = document.getElementById('recent-emergencies-list');
  if (!container) return;

  try {
    const data = await emergencyApi.listEmergencies();
    const list = data.emergencies || [];

    if (list.length === 0) {
      container.innerHTML = `<div class="empty-feed-hint">No emergencies recorded in AEGIS database yet.</div>`;
      return;
    }

    container.innerHTML = list.map(item => {
      const timeStr = new Date(item.created_at || item.timestamp).toLocaleTimeString();
      const hasCoords = item.latitude !== null && item.longitude !== null;
      const coordsText = hasCoords 
        ? `${Number(item.latitude).toFixed(4)}°, ${Number(item.longitude).toFixed(4)}°`
        : 'GPS Unavailable';
      const typeClass = `badge-type-${(item.alert_type || 'police').toLowerCase()}`;

      return `
        <div class="recent-emg-row" data-id="${item.emergency_id}">
          <div class="recent-emg-left">
            <span class="recent-emg-type-badge ${typeClass}">${item.alert_type || 'POLICE'}</span>
            <span class="recent-emg-coords">${coordsText}</span>
          </div>
          <div class="recent-emg-right">
            <span class="recent-emg-time">${timeStr}</span>
            <button class="btn-table-view btn-view-emg" data-id="${item.emergency_id}">View on Map</button>
            ${hasCoords ? `<a href="${item.google_maps_url || `https://www.google.com/maps?q=${item.latitude},${item.longitude}`}" target="_blank" rel="noopener noreferrer" class="btn-table-view">Google Maps</a>` : ''}
          </div>
        </div>
      `;
    }).join('');

    // Attach click listeners to view on map
    container.querySelectorAll('.btn-view-emg').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const emgId = btn.dataset.id;
        const item = list.find(x => x.emergency_id === emgId);
        if (item) {
          updateAdminEmergencyMonitor(item);
          if (emergencyMap && item.latitude !== null && item.longitude !== null) {
            emergencyMap.displayAuthoritativeEmergency(item);
            // Switch to map tab if not already on it
            const mapTab = document.querySelector('.nav-tab[data-tab="tab-map"]');
            if (mapTab && !mapTab.classList.contains('active')) {
              mapTab.click();
            }
          }
        }
      });
    });

  } catch (err) {
    console.error('[AEGIS] Failed to load recent emergencies:', err);
  }
}

