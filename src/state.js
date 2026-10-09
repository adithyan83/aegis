// AEGIS One (IPSD) Core State Machine & Telemetry Engine
// Reference: KnightMaster Innovations Pvt. Ltd. - AEGIS One Specifications
import { sound } from './sound.js';

export const ALERT_TYPES = {
  POLICE: 'POLICE',         // Button 1: Police Emergency (Police Control Room, SOS)
  MEDICAL: 'MEDICAL',       // Button 2: Medical Emergency (Ambulance, Hospitals, Medical ID)
  CONTACT: 'CONTACT',       // Button 3: Custom Contact (Family, Friends)
  CRASH: 'CRASH'            // Automatic Vehicle Crash Detection Module
};

export const SYSTEM_STATES = {
  ALL_SAFE: 'ALL_SAFE',     // Standby, All Safe - No Alerts
  MISTOUCH_WINDOW: 'MISTOUCH_WINDOW', // 120s Alert Countdown & Cancel Window
  ACTIVE_DISPATCH: 'ACTIVE_DISPATCH', // Confirmed Emergency Dispatch Live
  RESOLVED: 'RESOLVED'
};

class AegisStateMachine {
  constructor() {
    this.state = SYSTEM_STATES.ALL_SAFE;
    this.activeAlertType = null;

    // Configurable Settings matching AEGIS One Spec
    this.config = {
      mistouchDurationSec: 120, // Default 120s Mistouch Prevention (configurable 15s - 120s)
      immediateLongPressSec: 5.0, // 5s Long press bypasses countdown for instant alert
      crashDetectionEnabled: true,
      buzzerEnabled: true,
      vibrationFeedback: true,
      securityPin: '1234'
    };

    // User Medical Profile (Sent with Medical Alerts)
    this.medicalProfile = {
      fullName: 'Alex Morgan',
      bloodGroup: 'O+ Positive',
      allergies: 'Penicillin, Peanuts',
      conditions: 'Mild Asthma',
      emergencyNotes: 'Carries inhaler in backpack. Organ donor.',
      nationalId: 'AEGIS-ID-9821'
    };

    // Telemetry matching AEGIS One Hardware
    this.telemetry = {
      battery: 94, // 500-650 mAh Li-Po
      batteryDaysRemaining: 5,
      isCharging: false,
      bleConnected: true,
      bleDeviceName: 'AEGIS One #882',
      gpsLocked: true,
      network: 'LTE-M / NB-IoT Active',
      waterproofRating: 'IP67',
      incidentStartTime: null
    };

    // Countdown and timers
    this.countdownTimer = null;
    this.countdownRemaining = 0;
    this.holdTimer = null;
    this.holdProgress = 0;
    this.holdingButton = null;

    // Listeners and logs
    this.subscribers = [];
    this.logs = [];
    this.alertTriggerListeners = [];
    this.alertCancelListeners = [];
    this.lastEmergencyRecord = null;

    // Load persisted medical profile if available
    this.loadPersistedData();
  }

  loadPersistedData() {
    try {
      const savedMed = localStorage.getItem('aegis_medical_profile');
      if (savedMed) this.medicalProfile = { ...this.medicalProfile, ...JSON.parse(savedMed) };
      const savedConfig = localStorage.getItem('aegis_config');
      if (savedConfig) this.config = { ...this.config, ...JSON.parse(savedConfig) };
    } catch (e) {}
  }

  saveData() {
    try {
      localStorage.setItem('aegis_medical_profile', JSON.stringify(this.medicalProfile));
      localStorage.setItem('aegis_config', JSON.stringify(this.config));
    } catch (e) {}
    this.notify();
  }

  subscribe(callback) {
    this.subscribers.push(callback);
    callback(this.getSnapshot());
    return () => {
      this.subscribers = this.subscribers.filter(cb => cb !== callback);
    };
  }

  onAlertTrigger(callback) {
    this.alertTriggerListeners.push(callback);
    return () => {
      this.alertTriggerListeners = this.alertTriggerListeners.filter(cb => cb !== callback);
    };
  }

  onAlertCancel(callback) {
    this.alertCancelListeners.push(callback);
    return () => {
      this.alertCancelListeners = this.alertCancelListeners.filter(cb => cb !== callback);
    };
  }

  notify() {
    const snap = this.getSnapshot();
    this.subscribers.forEach(cb => cb(snap));
  }

  getSnapshot() {
    return {
      state: this.state,
      activeAlertType: this.activeAlertType,
      config: { ...this.config },
      medicalProfile: { ...this.medicalProfile },
      telemetry: { ...this.telemetry },
      countdownRemaining: this.countdownRemaining,
      countdownPercent: this.config.mistouchDurationSec > 0 
        ? Math.max(0, Math.min(100, (this.countdownRemaining / this.config.mistouchDurationSec) * 100))
        : 0,
      holdProgress: this.holdProgress,
      holdingButton: this.holdingButton,
      lastEmergencyRecord: this.lastEmergencyRecord,
      logs: [...this.logs]
    };
  }

  logEvent(type, message, metadata = {}) {
    const entry = {
      id: Date.now() + Math.random().toString(36).substr(2, 4),
      time: new Date().toLocaleTimeString(),
      timestamp: Date.now(),
      type, // 'INFO' | 'WARN' | 'DANGER' | 'SUCCESS'
      message,
      metadata
    };
    this.logs.unshift(entry);
    if (this.logs.length > 100) this.logs.pop();
    this.notify();
  }

  // --- TRIGGER EMERGENCY (One of the 3 dedicated buttons or Crash) ---
  triggerAlert(alertType, immediate = false) {
    if (this.state === SYSTEM_STATES.ACTIVE_DISPATCH) return;

    this.activeAlertType = alertType;
    this.telemetry.incidentStartTime = Date.now();

    // Notify all registered alert trigger listeners (e.g. emergency location API flow)
    this.alertTriggerListeners.forEach(cb => {
      try { cb(alertType, immediate); } catch (e) { console.error('Alert trigger listener error:', e); }
    });

    if (immediate) {
      // 5s Long press bypass: Immediate alert without delay
      this.logEvent('DANGER', `🚨 IMMEDIATE ALERT SENT (5s Long Press Bypass): ${alertType}`);
      this.confirmEmergencyDispatch();
      return;
    }

    // Standard Alert Flow: 120s Mistouch Prevention Window
    this.state = SYSTEM_STATES.MISTOUCH_WINDOW;
    this.countdownRemaining = this.config.mistouchDurationSec;

    this.logEvent('WARN', `⚠️ ${alertType} Triggered. ${this.config.mistouchDurationSec}s mistouch cancellation window active.`);
    this.startCountdownTimer();
    this.notify();
  }

  startCountdownTimer() {
    if (this.countdownTimer) clearInterval(this.countdownTimer);

    this.countdownTimer = setInterval(() => {
      this.countdownRemaining = Math.max(0, +(this.countdownRemaining - 1));

      // Periodic warning beep/buzzer
      if (this.countdownRemaining % 10 === 0 && this.countdownRemaining > 0) {
        sound.playWarningBeep(540 + (this.config.mistouchDurationSec - this.countdownRemaining) * 2);
      }

      if (this.countdownRemaining <= 0) {
        clearInterval(this.countdownTimer);
        this.countdownTimer = null;
        this.confirmEmergencyDispatch();
      }
      this.notify();
    }, 1000);
  }

  // --- CANCELLATION / MISTOUCH DISMISSAL ---
  cancelAlert(method = 'USER_APP_CANCEL') {
    if (this.state !== SYSTEM_STATES.MISTOUCH_WINDOW && this.state !== SYSTEM_STATES.ACTIVE_DISPATCH) {
      return { success: false };
    }

    if (this.countdownTimer) {
      clearInterval(this.countdownTimer);
      this.countdownTimer = null;
    }

    const wasCountdown = this.state === SYSTEM_STATES.MISTOUCH_WINDOW;
    this.state = SYSTEM_STATES.ALL_SAFE;
    this.countdownRemaining = 0;
    this.holdProgress = 0;
    this.holdingButton = null;

    sound.playSafeChime();

    if (wasCountdown) {
      this.logEvent('SUCCESS', `✅ Mistouch Alert Cancelled via ${method}. System returned to All Safe.`);
    } else {
      this.logEvent('SUCCESS', `🛡️ Active ${this.activeAlertType} Emergency Resolved. Contacts updated.`);
    }

    // Notify cancel listeners
    this.alertCancelListeners.forEach(cb => {
      try { cb(method); } catch (e) { console.error('Cancel listener error:', e); }
    });

    this.activeAlertType = null;
    this.notify();
    return { success: true };
  }

  // --- CONFIRMED EMERGENCY DISPATCH ---
  confirmEmergencyDispatch() {
    if (this.countdownTimer) {
      clearInterval(this.countdownTimer);
      this.countdownTimer = null;
    }

    this.state = SYSTEM_STATES.ACTIVE_DISPATCH;
    sound.playEmergencyAlarm();

    const label = this.activeAlertType === ALERT_TYPES.POLICE ? 'POLICE EMERGENCY'
      : this.activeAlertType === ALERT_TYPES.MEDICAL ? 'MEDICAL & AMBULANCE DISPATCH'
      : this.activeAlertType === ALERT_TYPES.CRASH ? 'VEHICLE CRASH EMERGENCY'
      : 'FAMILY & CUSTOM CONTACT SOS';

    this.logEvent('DANGER', `💥 CONFIRMED EMERGENCY: ${label} Dispatched with Live GPS Coordinates!`);
    this.notify();
  }

  // --- LONG PRESS HANDLER (5s Immediate Trigger) ---
  startButtonHold(alertType) {
    this.holdingButton = alertType;
    this.holdProgress = 0;
    sound.playClick();

    const start = Date.now();
    const durationMs = this.config.immediateLongPressSec * 1000;

    if (this.holdTimer) clearInterval(this.holdTimer);
    this.holdTimer = setInterval(() => {
      const elapsed = Date.now() - start;
      this.holdProgress = Math.min(100, (elapsed / durationMs) * 100);

      if (this.holdProgress >= 100) {
        clearInterval(this.holdTimer);
        this.holdTimer = null;
        this.holdProgress = 0;
        this.holdingButton = null;
        // Immediate dispatch triggered!
        this.triggerAlert(alertType, true);
      }
      this.notify();
    }, 50);
  }

  endButtonHold(alertType) {
    if (this.holdTimer) {
      clearInterval(this.holdTimer);
      this.holdTimer = null;
    }

    // If released before 5s, trigger normal mistouch flow (single click)
    if (this.holdProgress < 100 && this.holdingButton === alertType) {
      this.triggerAlert(alertType, false);
    }

    this.holdProgress = 0;
    this.holdingButton = null;
    this.notify();
  }

  // Find My AEGIS Device Buzzer Locator
  triggerFindMyAegis() {
    this.logEvent('INFO', '🔊 "Find My AEGIS" command sent. Hardware buzzer sounding...');
    sound.playEmergencyAlarm();
  }
}

export const safetyState = new AegisStateMachine();
