// AEGIS One Multi-Channel Emergency Dispatcher
// Reference: KnightMaster Innovations Pvt. Ltd. - AEGIS One Specs
import { safetyState, ALERT_TYPES } from './state.js';
import { contactManager } from './contacts.js';

export class EmergencyDispatcher {
  constructor() {
    this.webhookUrl = '';
  }

  generatePayload(alertType, coords) {
    const lat = coords.lat ? coords.lat.toFixed(5) : '12.97160';
    const lng = coords.lng ? coords.lng.toFixed(5) : '77.59460';
    const mapUrl = `https://maps.google.com/?q=${lat},${lng}`;
    const time = new Date().toLocaleTimeString();
    const med = safetyState.medicalProfile;

    if (alertType === ALERT_TYPES.POLICE) {
      return {
        title: '🚨 POLICE EMERGENCY SOS BROADCAST',
        recipient: 'Nearest Police Control Room & PCR Patrol Units',
        smsText: `🚨 POLICE EMERGENCY ALERT: AEGIS One user has triggered an SOS beacon! Location: ${mapUrl} (Address: ${coords.address || 'GPS Lock Active'}, Accuracy: ±${coords.accuracy || 5}m). User ID: ${med.nationalId}. Urgent Police Assistance Required!`,
        category: 'POLICE'
      };
    } else if (alertType === ALERT_TYPES.MEDICAL || alertType === ALERT_TYPES.CRASH) {
      return {
        title: alertType === ALERT_TYPES.CRASH ? '💥 VEHICLE CRASH EMERGENCY' : '🚑 MEDICAL EMERGENCY BROADCAST',
        recipient: 'Emergency Medical Services (EMS) & Nearby Hospitals',
        smsText: `🚑 MEDICAL EMERGENCY: AEGIS One user requires urgent ambulance response! Location: ${mapUrl} (Accuracy: ±${coords.accuracy || 5}m).\nPATIENT MEDICAL ID: ${med.fullName} | Blood Group: ${med.bloodGroup} | Allergies: ${med.allergies} | Conditions: ${med.conditions}. Dispatch paramedics immediately!`,
        category: 'MEDICAL'
      };
    } else {
      return {
        title: '👥 EMERGENCY ALERT TO FAMILY & FRIENDS',
        recipient: 'Designated Family Members & Emergency Contacts',
        smsText: `🚨 SOS EMERGENCY: I have activated my AEGIS One Personal Safety Device! My current live location: ${mapUrl} (${coords.address || 'Locked'}). Battery: ${safetyState.telemetry.battery}%. Please contact me or send help immediately!`,
        category: 'CONTACT'
      };
    }
  }

  getSMSLink(phone, message) {
    const cleanNumber = phone.replace(/[^0-9+]/g, '');
    return `sms:${cleanNumber}?body=${encodeURIComponent(message)}`;
  }

  getWhatsAppLink(phone, message) {
    const cleanNumber = phone.replace(/[^0-9]/g, '');
    return `https://api.whatsapp.com/send?phone=${cleanNumber}&text=${encodeURIComponent(message)}`;
  }

  getCallLink(phone) {
    const cleanNumber = phone.replace(/[^0-9+]/g, '');
    return `tel:${cleanNumber}`;
  }

  // Trigger dedicated dispatch dialog
  dispatchToContacts(coords) {
    const alertType = safetyState.activeAlertType || ALERT_TYPES.POLICE;
    const payload = this.generatePayload(alertType, coords);
    const contacts = contactManager.contacts;

    this.renderDispatchDialog(alertType, payload, contacts, coords);
  }

  renderDispatchDialog(alertType, payload, contacts, coords) {
    let modal = document.getElementById('modal-real-dispatch');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'modal-real-dispatch';
      modal.className = 'modal-backdrop visible';
      document.body.appendChild(modal);
    }

    const med = safetyState.medicalProfile;
    const isMedical = alertType === ALERT_TYPES.MEDICAL || alertType === ALERT_TYPES.CRASH;
    const isPolice = alertType === ALERT_TYPES.POLICE;

    modal.innerHTML = `
      <div class="modal-dialog emergency-dispatch-dialog alert-${alertType.toLowerCase()}">
        <div class="modal-header emergency-header">
          <div class="modal-title-group">
            <span class="emergency-badge">${payload.title}</span>
            <h3>${payload.recipient}</h3>
            <p>Confirmed emergency dispatch is active. Tap below to transmit live GPS and medical data.</p>
          </div>
          <button class="modal-btn-close" id="btn-close-dispatch-modal">&times;</button>
        </div>

        <div class="dispatch-dialog-body">
          ${isMedical ? `
            <div class="medical-summary-banner">
              <strong>🏥 Attached Medical ID:</strong>
              <span>${med.fullName} (${med.bloodGroup}) • Allergies: ${med.allergies} • ${med.conditions}</span>
            </div>
          ` : ''}

          <div class="message-preview-box">
            <label>OUTGOING EMERGENCY TRANSMISSION PAYLOAD:</label>
            <pre>${payload.smsText}</pre>
            <div class="payload-actions-row">
              <button id="btn-copy-sos-payload" class="btn-copy-payload">📋 Copy Message</button>
              <button id="btn-native-share-payload" class="btn-native-share">📲 Execute Native Phone Share (WhatsApp/SMS)</button>
            </div>
          </div>

          <div class="contacts-dispatch-actions">
            <h4>${isPolice ? 'Direct Police & First Responder Dispatch:' : isMedical ? 'Direct Medical & Ambulance Dispatch:' : 'Saved Family & Emergency Contacts:'}</h4>
            ${contacts.map(c => `
              <div class="dispatch-contact-row">
                <div class="contact-info">
                  <strong>${c.name}</strong>
                  <span>${c.phone} • ${c.relation}</span>
                </div>
                <div class="dispatch-btns">
                  <a href="${this.getWhatsAppLink(c.phone, payload.smsText)}" target="_blank" class="btn-dispatch-wa">
                    💬 WhatsApp
                  </a>
                  <a href="${this.getSMSLink(c.phone, payload.smsText)}" class="btn-dispatch-sms">
                    📲 SMS
                  </a>
                  <a href="${this.getCallLink(c.phone)}" class="btn-dispatch-call">
                    📞 Call
                  </a>
                </div>
              </div>
            `).join('')}
          </div>

          <div class="emergency-hotlines">
            <span>Direct Emergency Control Room Numbers:</span>
            <div class="hotline-btns">
              <a href="tel:112" class="btn-hotline btn-hotline-112">🚨 Call 112 (National Emergency)</a>
              <a href="tel:100" class="btn-hotline">🚔 Call 100 (Police Control)</a>
              <a href="tel:108" class="btn-hotline btn-hotline-med">🚑 Call 108 (Ambulance)</a>
            </div>
          </div>
        </div>
      </div>
    `;

    modal.classList.add('visible');

    document.getElementById('btn-close-dispatch-modal')?.addEventListener('click', () => {
      modal.classList.remove('visible');
    });

    document.getElementById('btn-copy-sos-payload')?.addEventListener('click', (e) => {
      navigator.clipboard.writeText(payload.smsText);
      e.target.textContent = '✅ Copied to Clipboard!';
      setTimeout(() => e.target.textContent = '📋 Copy Message', 2000);
    });

    // Native OS Share execution on smartphone
    document.getElementById('btn-native-share-payload')?.addEventListener('click', async () => {
      if (navigator.share) {
        try {
          await navigator.share({
            title: payload.title,
            text: payload.smsText
          });
        } catch (e) {}
      } else if (contacts.length > 0) {
        // Fallback: Launch SMS with first priority contact
        window.location.href = this.getSMSLink(contacts[0].phone, payload.smsText);
      }
    });
  }
}

export const dispatcher = new EmergencyDispatcher();
