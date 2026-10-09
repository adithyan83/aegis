// Real Mobile Phone Hardware Actions: GPS, Haptics, Flashlight Strobe, Screen WakeLock, Web Bluetooth & Native Share
import { safetyState } from './state.js';

export class PhoneHardwareManager {
  constructor() {
    this.vibrateSupported = 'vibrate' in navigator;
    this.bluetoothSupported = 'bluetooth' in navigator;
    this.geolocationSupported = 'geolocation' in navigator;
    this.wakeLockSupported = 'wakeLock' in navigator;
    this.shareSupported = 'share' in navigator;

    // Real GPS Watcher
    this.geoWatchId = null;
    this.currentCoords = {
      lat: null,
      lng: null,
      accuracy: null,
      speed: null,
      altitude: null,
      address: 'Detecting live phone location...'
    };

    // Wake Lock
    this.wakeLock = null;
    this.wakeLockActive = false;

    // Camera Torch / Flashlight Strobe
    this.torchStream = null;
    this.torchTrack = null;
    this.torchSupported = false;
    this.torchStrobeInterval = null;
    this.torchState = false;

    // Bluetooth Hardware State
    this.bleDevice = null;
    this.bleServer = null;
    this.bleConnected = false;

    this.subscribers = [];
  }

  subscribe(callback) {
    this.subscribers.push(callback);
    callback(this.getSnapshot());
    return () => {
      this.subscribers = this.subscribers.filter(cb => cb !== callback);
    };
  }

  notify() {
    const snap = this.getSnapshot();
    this.subscribers.forEach(cb => cb(snap));
  }

  getSnapshot() {
    return {
      vibrateSupported: this.vibrateSupported,
      bluetoothSupported: this.bluetoothSupported,
      geolocationSupported: this.geolocationSupported,
      wakeLockSupported: this.wakeLockSupported,
      wakeLockActive: this.wakeLockActive,
      torchSupported: this.torchSupported,
      shareSupported: this.shareSupported,
      coords: { ...this.currentCoords },
      bleConnected: this.bleConnected,
      bleDeviceName: this.bleDevice ? (this.bleDevice.name || 'AEGIS Device') : null
    };
  }

  // --- 1. SCREEN WAKE LOCK API (Keeps screen awake during emergency) ---
  async requestWakeLock() {
    if (!this.wakeLockSupported) return false;
    try {
      this.wakeLock = await navigator.wakeLock.request('screen');
      this.wakeLockActive = true;
      this.wakeLock.addEventListener('release', () => {
        this.wakeLockActive = false;
        this.notify();
      });
      safetyState.logEvent('INFO', '🔒 Screen Wake Lock engaged (Display will not sleep in emergency).');
      this.notify();
      return true;
    } catch (err) {
      console.warn('Wake Lock error:', err);
      return false;
    }
  }

  releaseWakeLock() {
    if (this.wakeLock) {
      this.wakeLock.release();
      this.wakeLock = null;
      this.wakeLockActive = false;
      this.notify();
    }
  }

  // --- 2. PHYSICAL PHONE VIBRATION (HAPTICS) ---
  triggerHapticPulse() {
    if (this.vibrateSupported) {
      try {
        navigator.vibrate([180, 80, 180]);
      } catch (e) {}
    }
  }

  triggerHapticWarning() {
    if (this.vibrateSupported) {
      try {
        navigator.vibrate([400, 150, 400, 150, 500]);
      } catch (e) {}
    }
  }

  triggerHapticImpact() {
    if (this.vibrateSupported) {
      try {
        // Urgent continuous alert pulse
        navigator.vibrate([600, 200, 600, 200, 800, 200, 1000]);
      } catch (e) {}
    }
  }

  stopHaptics() {
    if (this.vibrateSupported) {
      try {
        navigator.vibrate(0);
      } catch (e) {}
    }
  }

  // --- 3. CAMERA TORCH / LED STROBE (Visual distress beacon) ---
  async initCameraTorch() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return false;
    try {
      this.torchStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' }
      });
      this.torchTrack = this.torchStream.getVideoTracks()[0];
      const capabilities = this.torchTrack.getCapabilities ? this.torchTrack.getCapabilities() : {};
      
      if (capabilities.torch) {
        this.torchSupported = true;
        safetyState.logEvent('SUCCESS', '🔦 Camera LED Flashlight / Strobe ready for emergency distress.');
        this.notify();
        return true;
      }
    } catch (e) {
      console.warn('Torch access note:', e);
    }
    return false;
  }

  async startTorchStrobe() {
    if (!this.torchTrack) {
      const initialized = await this.initCameraTorch();
      if (!initialized) return;
    }

    this.stopTorchStrobe();
    this.torchStrobeInterval = setInterval(async () => {
      try {
        this.torchState = !this.torchState;
        await this.torchTrack.applyConstraints({
          advanced: [{ torch: this.torchState }]
        });
      } catch (e) {}
    }, 400);
  }

  stopTorchStrobe() {
    if (this.torchStrobeInterval) {
      clearInterval(this.torchStrobeInterval);
      this.torchStrobeInterval = null;
    }
    if (this.torchTrack) {
      try {
        this.torchTrack.applyConstraints({ advanced: [{ torch: false }] });
      } catch (e) {}
    }
  }

  // --- 4. REAL PHONE GPS TRACKING ---
  startRealGPSTracking(onLocationUpdate) {
    if (!this.geolocationSupported) {
      alert('Geolocation is not supported by your browser.');
      return;
    }

    const options = {
      enableHighAccuracy: true,
      maximumAge: 1000,
      timeout: 10000
    };

    if (this.geoWatchId !== null) {
      navigator.geolocation.clearWatch(this.geoWatchId);
    }

    this.geoWatchId = navigator.geolocation.watchPosition(
      async (pos) => {
        const { latitude, longitude, accuracy, speed, altitude } = pos.coords;
        this.currentCoords.lat = latitude;
        this.currentCoords.lng = longitude;
        this.currentCoords.accuracy = Math.round(accuracy);
        this.currentCoords.speed = speed ? +(speed * 3.6).toFixed(1) : 0;
        this.currentCoords.altitude = altitude ? Math.round(altitude) : 0;

        if (onLocationUpdate) {
          onLocationUpdate(this.currentCoords);
        }

        this.reverseGeocode(latitude, longitude);
        this.notify();
      },
      (err) => {
        console.warn('GPS Watcher status:', err.message);
      },
      options
    );

    // Keep screen awake while tracking
    this.requestWakeLock();
    safetyState.logEvent('INFO', '📍 Live GPS Tracking active on real phone coordinates.');
  }

  async reverseGeocode(lat, lng) {
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`, {
        headers: { 'Accept': 'application/json' }
      });
      if (res.ok) {
        const data = await res.json();
        if (data.display_name) {
          this.currentCoords.address = data.display_name;
          this.notify();
        }
      }
    } catch (e) {}
  }

  // --- 5. NATIVE OS WEB SHARE API (Triggers native WhatsApp/Messages/Contacts sheet) ---
  async executeNativeShare(payload) {
    if (!this.shareSupported) return false;
    try {
      await navigator.share({
        title: payload.title || '🚨 AEGIS One Emergency SOS',
        text: payload.smsText,
        url: window.location.href
      });
      safetyState.logEvent('SUCCESS', '📲 Native OS Share Sheet executed successfully.');
      return true;
    } catch (err) {
      console.warn('Native share dismissed or failed:', err);
      return false;
    }
  }

  // --- 6. WEB BLUETOOTH API FOR REAL WEARABLE HARDWARE ---
  async connectRealBLEDevice() {
    if (!this.bluetoothSupported) {
      alert('Web Bluetooth API is supported in Chrome (Android, macOS, Windows, Linux). Please check your browser.');
      return false;
    }

    try {
      safetyState.logEvent('INFO', '🔍 Scanning for AEGIS One / Bluetooth button...');
      
      this.bleDevice = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: [
          'battery_service',
          'generic_access',
          '0000ffe0-0000-1000-8000-00805f9b34fb', // Standard BLE Serial / ESP32
          '19b10000-e8f2-537e-4f6c-d104768a1214'  // AEGIS Custom Service
        ]
      });

      this.bleDevice.addEventListener('gattserverdisconnected', () => {
        this.bleConnected = false;
        safetyState.logEvent('WARN', '🔌 AEGIS One Hardware Disconnected.');
        this.notify();
      });

      safetyState.logEvent('INFO', `🔗 Connecting to ${this.bleDevice.name || 'AEGIS Device'}...`);
      this.bleServer = await this.bleDevice.gatt.connect();
      this.bleConnected = true;

      try {
        const services = await this.bleServer.getPrimaryServices();
        for (const service of services) {
          const chars = await service.getCharacteristics();
          for (const char of chars) {
            if (char.properties.notify || char.properties.indicate) {
              await char.startNotifications();
              char.addEventListener('characteristicvaluechanged', (e) => {
                this.handleBLEHardwarePayload(e.target.value);
              });
            }
          }
        }
      } catch (err) {
        console.log('BLE GATT characteristics subscribed:', err);
      }

      safetyState.logEvent('SUCCESS', `✅ Paired with ${this.bleDevice.name || 'AEGIS One'}! Hardware button line active.`);
      this.notify();
      return true;
    } catch (err) {
      console.warn('Bluetooth pairing cancelled or failed:', err);
      safetyState.logEvent('INFO', `BLE Scan: ${err.message}`);
      return false;
    }
  }

  handleBLEHardwarePayload(dataView) {
    const rawVal = dataView.getUint8(0);
    // Button 1: 0x01 (Police), Button 2: 0x02 (Medical), Button 3: 0x03 (Contact)
    if (rawVal === 1) {
      safetyState.triggerAlert('POLICE', false);
    } else if (rawVal === 2) {
      safetyState.triggerAlert('MEDICAL', false);
    } else if (rawVal === 3) {
      safetyState.triggerAlert('CONTACT', false);
    } else {
      safetyState.triggerAlert('POLICE', false);
    }
  }

  disconnectBLE() {
    if (this.bleDevice && this.bleDevice.gatt.connected) {
      this.bleDevice.gatt.disconnect();
    }
    this.bleConnected = false;
    this.bleDevice = null;
    this.notify();
  }
}

export const phoneSensors = new PhoneHardwareManager();
