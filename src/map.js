// Live GPS Incident Tracking Map & Telemetry Controller
import L from 'leaflet';

export class EmergencyMap {
  constructor(containerId) {
    this.containerId = containerId;
    this.map = null;
    this.userMarker = null;
    this.accuracyCircle = null;
    this.pathPolyline = null;
    this.breadcrumbCoords = [];
    this.isTracking = false;
    this.simulatedInterval = null;

    // Default coordinates: Downtown / Campus corridor
    this.currentPos = {
      lat: 12.9716,
      lng: 77.5946,
      accuracy: 6,
      speed: 1.4, // m/s
      heading: 45,
      altitude: 920,
      address: 'Cubbon Park Transit Blvd, Central Metro Zone'
    };

    // Pre-calculated route coordinates for realistic motion simulation
    this.routeWaypoints = [
      { lat: 12.9716, lng: 77.5946, address: 'Cubbon Park Transit Blvd, Central Metro Zone' },
      { lat: 12.9722, lng: 77.5952, address: 'Kasturba Cross Rd, East Gate' },
      { lat: 12.9730, lng: 77.5960, address: 'Queens Promenade & Tech Hub Corner' },
      { lat: 12.9738, lng: 77.5968, address: 'University North Quadrangle, Block C' },
      { lat: 12.9745, lng: 77.5975, address: 'Commerce Avenue & Outer Ring Junction' },
      { lat: 12.9752, lng: 77.5982, address: 'Metro Station Exit 3, South Concourse' }
    ];
    this.currentWaypointIndex = 0;
  }

  init() {
    const el = document.getElementById(this.containerId);
    if (!el) return;

    // Initialize Leaflet map
    this.map = L.map(this.containerId, {
      zoomControl: false,
      attributionControl: false
    }).setView([this.currentPos.lat, this.currentPos.lng], 16);

    // Dark styled tile layer
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      maxZoom: 19,
      subdomains: 'abcd'
    }).addTo(this.map);

    // Zoom control at bottom right
    L.control.zoom({ position: 'bottomright' }).addTo(this.map);

    this.createMarkers();
    this.updateHud();
  }

  createMarkers() {
    // Custom pulsing SVG beacon marker
    const beaconIcon = L.divIcon({
      className: 'custom-beacon-marker',
      html: `
        <div class="beacon-pin" id="map-beacon-pin">
          <div class="beacon-pulse"></div>
          <div class="beacon-core"></div>
        </div>
      `,
      iconSize: [32, 32],
      iconAnchor: [16, 16]
    });

    this.userMarker = L.marker([this.currentPos.lat, this.currentPos.lng], { icon: beaconIcon }).addTo(this.map);

    // Accuracy perimeter circle
    this.accuracyCircle = L.circle([this.currentPos.lat, this.currentPos.lng], {
      radius: this.currentPos.accuracy * 2,
      color: '#3b82f6',
      fillColor: '#3b82f6',
      fillOpacity: 0.12,
      weight: 1.5,
      dashArray: '4, 4'
    }).addTo(this.map);

    // History trail
    this.breadcrumbCoords.push([this.currentPos.lat, this.currentPos.lng]);
    this.pathPolyline = L.polyline(this.breadcrumbCoords, {
      color: '#6366f1',
      weight: 3,
      opacity: 0.8,
      dashArray: '6, 6'
    }).addTo(this.map);
  }

  setEmergencyMode(isEmergency) {
    const pin = document.getElementById('map-beacon-pin');
    if (pin) {
      if (isEmergency) {
        pin.classList.add('emergency-beacon');
      } else {
        pin.classList.remove('emergency-beacon');
      }
    }
    if (this.accuracyCircle) {
      this.accuracyCircle.setStyle({
        color: isEmergency ? '#ef4444' : '#3b82f6',
        fillColor: isEmergency ? '#ef4444' : '#3b82f6'
      });
    }
  }

  updatePosition(lat, lng, address = null, speed = 1.2) {
    this.currentPos.lat = lat;
    this.currentPos.lng = lng;
    this.currentPos.speed = speed;
    if (address) this.currentPos.address = address;

    if (this.userMarker) {
      this.userMarker.setLatLng([lat, lng]);
    }
    if (this.accuracyCircle) {
      this.accuracyCircle.setLatLng([lat, lng]);
    }

    this.breadcrumbCoords.push([lat, lng]);
    if (this.breadcrumbCoords.length > 50) this.breadcrumbCoords.shift();
    if (this.pathPolyline) {
      this.pathPolyline.setLatLngs(this.breadcrumbCoords);
    }

    if (this.map) {
      this.map.panTo([lat, lng], { animate: true, duration: 0.8 });
    }
    this.updateHud();
  }

  updateHud() {
    const latEl = document.getElementById('hud-lat');
    const lngEl = document.getElementById('hud-lng');
    const accEl = document.getElementById('hud-acc');
    const spdEl = document.getElementById('hud-spd');
    const addrEl = document.getElementById('hud-address');

    if (latEl) latEl.textContent = this.currentPos.lat.toFixed(5);
    if (lngEl) lngEl.textContent = this.currentPos.lng.toFixed(5);
    if (accEl) accEl.textContent = `±${this.currentPos.accuracy}m`;
    if (spdEl) spdEl.textContent = `${(this.currentPos.speed * 3.6).toFixed(1)} km/h`;
    if (addrEl) addrEl.textContent = this.currentPos.address;
  }

  // Simulate movement along a realistic route
  startMovementSimulation() {
    if (this.simulatedInterval) clearInterval(this.simulatedInterval);

    this.simulatedInterval = setInterval(() => {
      this.currentWaypointIndex = (this.currentWaypointIndex + 1) % this.routeWaypoints.length;
      const target = this.routeWaypoints[this.currentWaypointIndex];
      
      // Interpolate with slight jitter to simulate real GPS noise
      const jitterLat = target.lat + (Math.random() - 0.5) * 0.00015;
      const jitterLng = target.lng + (Math.random() - 0.5) * 0.00015;
      const speed = +(1.2 + Math.random() * 0.8).toFixed(1);

      this.updatePosition(jitterLat, jitterLng, target.address, speed);
    }, 4500);
  }

  stopMovementSimulation() {
    if (this.simulatedInterval) {
      clearInterval(this.simulatedInterval);
      this.simulatedInterval = null;
    }
  }

  centerOnWearer() {
    if (this.map) {
      this.map.setView([this.currentPos.lat, this.currentPos.lng], 17, { animate: true });
    }
  }

  requestRealLocation() {
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          const acc = Math.round(pos.coords.accuracy);
          this.currentPos.accuracy = acc;
          this.updatePosition(lat, lng, 'Current Real GPS Location', pos.coords.speed || 0);
          this.centerOnWearer();
        },
        (err) => {
          console.warn('Geolocation access denied or failed:', err);
        },
        { enableHighAccuracy: true, timeout: 10000 }
      );
    }
  }

  // Display Authoritative Emergency Location reported to AEGIS Backend
  displayAuthoritativeEmergency(record) {
    if (!record || record.latitude === null || record.longitude === null) {
      console.warn('[AEGIS-Map] Cannot display emergency on map: Location was unavailable.');
      return;
    }

    const lat = Number(record.latitude);
    const lng = Number(record.longitude);
    const acc = Number(record.accuracy || 5);
    const googleMapsUrl = record.google_maps_url || `https://www.google.com/maps?q=${lat},${lng}`;
    const timeStr = new Date(record.timestamp || record.created_at || Date.now()).toLocaleTimeString();

    // Update map current pos
    this.currentPos.lat = lat;
    this.currentPos.lng = lng;
    this.currentPos.accuracy = acc;
    if (record.readable_address) {
      this.currentPos.address = record.readable_address;
    }

    this.updatePosition(lat, lng, record.readable_address, 0);
    this.setEmergencyMode(true);

    if (this.map) {
      this.map.setView([lat, lng], 17, { animate: true });

      // Create or update emergency popup
      if (this.userMarker) {
        const popupContent = `
          <div class="map-emergency-popup">
            <div class="popup-title">🚨 ${record.alert_type || 'AEGIS'} EMERGENCY ACTIVE</div>
            <div class="popup-id">ID: <code>${record.emergency_id}</code></div>
            <div class="popup-detail"><strong>Authoritative GPS:</strong> <span>${lat.toFixed(5)}°, ${lng.toFixed(5)}°</span></div>
            <div class="popup-detail"><strong>Accuracy:</strong> <span>±${acc}m</span></div>
            <div class="popup-detail"><strong>Status:</strong> <span class="status-dispatched">${record.emergency_status || 'DISPATCHED'}</span></div>
            <div class="popup-detail"><strong>Time:</strong> <span>${timeStr}</span></div>
            ${record.readable_address ? `<div class="popup-address"><strong>Address:</strong> ${record.readable_address}</div>` : ''}
            <div class="popup-action">
              <a href="${googleMapsUrl}" target="_blank" rel="noopener noreferrer" class="btn-popup-gmaps">
                🌐 Open in Google Maps
              </a>
            </div>
          </div>
        `;
        this.userMarker.bindPopup(popupContent, { maxWidth: 320 }).openPopup();
      }
    }
  }
}

