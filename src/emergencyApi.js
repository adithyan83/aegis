// AEGIS Emergency Location & Backend API Client
// Handles browser navigator.geolocation, POST /api/emergency, and async reverse geocoding
// Does NOT require any Google Maps API keys to obtain or display location.

export const LOCATION_UI_STATES = {
  GETTING: 'Getting your location...',
  ACQUIRED: 'Location acquired',
  SENT: 'Emergency alert sent',
  UNABLE: 'Unable to access location'
};

const DEFAULT_AUTH_TOKEN = 'aegis-secure-token-9821';

class EmergencyApiClient {
  constructor() {
    this.authToken = localStorage.getItem('aegis_auth_token') || DEFAULT_AUTH_TOKEN;
    this.currentEmergencyRecord = null;
    this.locationStatusListeners = [];
    this.currentStatusText = null;
    this.currentStatusType = 'idle'; // 'idle' | 'pending' | 'success' | 'error'
  }

  // Subscribe to location UI status changes
  onStatusChange(callback) {
    this.locationStatusListeners.push(callback);
    if (this.currentStatusText) {
      callback({ status: this.currentStatusText, type: this.currentStatusType, record: this.currentEmergencyRecord });
    }
    return () => {
      this.locationStatusListeners = this.locationStatusListeners.filter(cb => cb !== callback);
    };
  }

  notifyStatus(statusText, statusType = 'pending', record = null) {
    this.currentStatusText = statusText;
    this.currentStatusType = statusType;
    this.locationStatusListeners.forEach(cb => {
      try {
        cb({ status: statusText, type: statusType, record });
      } catch (e) {
        console.error('Status listener error:', e);
      }
    });
  }

  getHeaders() {
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.authToken}`
    };
  }

  /**
   * Browser Geolocation API: Requests and acquires user GPS position
   * High accuracy, strict 8-second timeout, zero cache.
   */
  async acquireLocation() {
    if (!('geolocation' in navigator)) {
      return {
        success: false,
        error: 'Geolocation is not supported by this browser',
        isPermissionDenied: false
      };
    }

    return new Promise((resolve) => {
      const options = {
        enableHighAccuracy: true,
        timeout: 8000,
        maximumAge: 0
      };

      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude, accuracy } = position.coords;
          resolve({
            success: true,
            coords: {
              latitude: Number(latitude),
              longitude: Number(longitude),
              accuracy: Math.round(accuracy * 10) / 10,
              timestamp: position.timestamp || Date.now()
            }
          });
        },
        (error) => {
          let errorMsg = 'Location acquisition error';
          let isDenied = false;

          switch (error.code) {
            case error.PERMISSION_DENIED:
              errorMsg = 'Location permission was denied by user/browser';
              isDenied = true;
              break;
            case error.POSITION_UNAVAILABLE:
              errorMsg = 'Location position unavailable from GPS/Wi-Fi sensors';
              break;
            case error.TIMEOUT:
              errorMsg = 'Location acquisition timed out';
              break;
          }

          resolve({
            success: false,
            error: errorMsg,
            isPermissionDenied: isDenied,
            code: error.code
          });
        },
        options
      );
    });
  }

  /**
   * Complete Emergency Location Flow:
   * 1. Notify UI: "Getting your location..."
   * 2. Request browser navigator.geolocation
   * 3. If acquired:
   *    - Notify UI: "Location acquired"
   *    - POST coordinates immediately to /api/emergency
   * 4. If denied/unavailable:
   *    - Notify UI: "Unable to access location"
   *    - DO NOT silently fail! Send emergency alert with null coords to backend.
   * 5. When backend responds:
   *    - Notify UI: "Emergency alert sent"
   * 6. Asynchronously trigger reverse geocoding in background (alert is NOT delayed)
   * 7. PATCH /api/emergency/:id with readable_address once obtained
   */
  async triggerEmergencyLocationFlow(alertType = 'POLICE') {
    // Step 1: Clear UI feedback - "Getting your location..."
    this.notifyStatus(LOCATION_UI_STATES.GETTING, 'pending');

    let coordsPayload = null;
    let locationAcquired = false;

    // Step 2: Attempt geolocation
    try {
      const geoResult = await this.acquireLocation();

      if (geoResult.success && geoResult.coords) {
        coordsPayload = geoResult.coords;
        locationAcquired = true;
        // Step 3a: "Location acquired"
        this.notifyStatus(LOCATION_UI_STATES.ACQUIRED, 'success');
      } else {
        // Step 3b: "Unable to access location"
        console.warn('[AEGIS-Location] Geolocation failed:', geoResult.error);
        this.notifyStatus(LOCATION_UI_STATES.UNABLE, 'error');
        // Do not fail silently: alert continues with location_unavailable payload
        coordsPayload = {
          latitude: null,
          longitude: null,
          accuracy: null,
          timestamp: Date.now()
        };
      }
    } catch (e) {
      console.error('[AEGIS-Location] Geolocation exception:', e);
      this.notifyStatus(LOCATION_UI_STATES.UNABLE, 'error');
      coordsPayload = {
        latitude: null,
        longitude: null,
        accuracy: null,
        timestamp: Date.now()
      };
    }

    // Small delay so the user clearly perceives the "Location acquired" transition
    if (locationAcquired) {
      await new Promise(r => setTimeout(r, 450));
    }

    // Step 4: Immediately send coordinates to AEGIS backend through secure POST API
    let emergencyRecord = null;
    try {
      const response = await fetch('/api/emergency', {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          latitude: coordsPayload.latitude,
          longitude: coordsPayload.longitude,
          accuracy: coordsPayload.accuracy,
          timestamp: coordsPayload.timestamp,
          alert_type: alertType
        })
      });

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(errJson.error || `Server responded with status ${response.status}`);
      }

      emergencyRecord = await response.json();
      this.currentEmergencyRecord = emergencyRecord;

      // Step 5: Notify UI: "Emergency alert sent"
      this.notifyStatus(LOCATION_UI_STATES.SENT, 'success', emergencyRecord);

    } catch (err) {
      console.error('[AEGIS-Backend] Failed to dispatch emergency to backend:', err);
      // Even if network fails, UI reflects the attempt
      this.notifyStatus(`Alert dispatch notice: ${err.message}`, 'error');
      throw err;
    }

    // Step 6: Asynchronously perform reverse geocoding in background (if coords available)
    if (locationAcquired && emergencyRecord && emergencyRecord.emergency_id) {
      this.backgroundReverseGeocode(emergencyRecord.emergency_id, coordsPayload.latitude, coordsPayload.longitude);
    }

    return emergencyRecord;
  }

  /**
   * Background reverse geocoding (OpenStreetMap Nominatim, no Google API key needed)
   * Updates readable_address via PATCH /api/emergency/:id
   */
  async backgroundReverseGeocode(emergencyId, lat, lng) {
    try {
      const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`;
      const res = await fetch(url, {
        headers: { 'Accept': 'application/json' }
      });

      if (res.ok) {
        const data = await res.json();
        const address = data.display_name;

        if (address) {
          // PATCH /api/emergency/:id
          const patchRes = await fetch(`/api/emergency/${emergencyId}`, {
            method: 'PATCH',
            headers: this.getHeaders(),
            body: JSON.stringify({ readable_address: address })
          });

          if (patchRes.ok) {
            const updated = await patchRes.json();
            if (this.currentEmergencyRecord && this.currentEmergencyRecord.emergency_id === emergencyId) {
              this.currentEmergencyRecord.readable_address = address;
              this.notifyStatus(LOCATION_UI_STATES.SENT, 'success', this.currentEmergencyRecord);
            }
          }
        }
      }
    } catch (e) {
      console.warn('[AEGIS-ReverseGeocode] Background reverse geocoding note:', e.message);
      // Emergency alert remains valid even if reverse geocoding fails
    }
  }

  /**
   * Fetch full details of an emergency record by ID
   */
  async getEmergency(emergencyId) {
    const res = await fetch(`/api/emergency/${emergencyId}`, {
      headers: this.getHeaders()
    });
    if (!res.ok) throw new Error('Failed to fetch emergency record');
    return res.json();
  }

  /**
   * Fetch list of emergency records (for Admin/Recipient map monitor)
   */
  async listEmergencies() {
    const res = await fetch('/api/emergency', {
      headers: this.getHeaders()
    });
    if (!res.ok) throw new Error('Failed to fetch emergencies list');
    return res.json();
  }

  /**
   * Resolve an emergency record
   */
  async resolveEmergency(emergencyId) {
    const res = await fetch(`/api/emergency/${emergencyId}/resolve`, {
      method: 'POST',
      headers: this.getHeaders()
    });
    if (!res.ok) throw new Error('Failed to resolve emergency');
    return res.json();
  }
}

export const emergencyApi = new EmergencyApiClient();
