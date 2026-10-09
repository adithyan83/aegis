// Emergency Contact Management and Notification Dispatch Simulator

export class ContactManager {
  constructor() {
    this.storageKey = 'aegis_emergency_contacts_v1';
    this.contacts = this.loadContacts();
    this.dispatchQueue = [];
    this.listeners = [];
  }

  getDefaultContacts() {
    return [
      {
        id: 'c1',
        name: 'Elena Vance (Mother)',
        phone: '+1 (555) 234-8901',
        relation: 'Family',
        priority: 1,
        channels: ['SMS', 'WhatsApp', 'CALL'],
        status: 'STANDBY' // 'STANDBY' | 'NOTIFYING' | 'ACKNOWLEDGED'
      },
      {
        id: 'c2',
        name: 'Campus Safety & Patrol HQ',
        phone: '+1 (555) 889-4400',
        relation: 'Security',
        priority: 1,
        channels: ['SMS', 'CALL', 'WEBHOOK'],
        status: 'STANDBY'
      },
      {
        id: 'c3',
        name: 'Marcus Brody (Roommate)',
        phone: '+1 (555) 345-6712',
        relation: 'Friend',
        priority: 2,
        channels: ['SMS', 'WhatsApp'],
        status: 'STANDBY'
      }
    ];
  }

  loadContacts() {
    try {
      const saved = localStorage.getItem(this.storageKey);
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return this.getDefaultContacts();
  }

  saveContacts() {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.contacts));
    } catch (e) {}
    this.notify();
  }

  subscribe(callback) {
    this.listeners.push(callback);
    callback(this.contacts, this.dispatchQueue);
    return () => {
      this.listeners = this.listeners.filter(cb => cb !== callback);
    };
  }

  notify() {
    this.listeners.forEach(cb => cb(this.contacts, this.dispatchQueue));
  }

  addContact(contact) {
    const newContact = {
      id: 'c_' + Date.now().toString(36),
      name: contact.name,
      phone: contact.phone,
      relation: contact.relation || 'Contact',
      priority: Number(contact.priority) || 2,
      channels: contact.channels || ['SMS'],
      status: 'STANDBY'
    };
    this.contacts.push(newContact);
    this.saveContacts();
  }

  deleteContact(id) {
    this.contacts = this.contacts.filter(c => c.id !== id);
    this.saveContacts();
  }

  // Generate & dispatch simulated emergency alerts to all contacts
  dispatchEmergencyAlerts(incidentData) {
    this.dispatchQueue = [];
    const timestamp = new Date().toLocaleTimeString();
    const mapUrl = `https://maps.google.com/?q=${incidentData.lat.toFixed(5)},${incidentData.lng.toFixed(5)}`;

    this.contacts.forEach((contact, idx) => {
      contact.status = 'NOTIFYING';

      // Build realistic payload
      const payload = {
        id: 'msg_' + Date.now() + '_' + idx,
        contactName: contact.name,
        phone: contact.phone,
        time: timestamp,
        channels: contact.channels,
        smsText: `🚨 SOS EMERGENCY ALERT: User triggered personal safety beacon! Location: ${mapUrl} (Accuracy: ±${incidentData.accuracy}m, Batt: ${incidentData.battery}%). Immediate assistance requested!`,
        deliveryStatus: 'SENDING' // 'SENDING' | 'DELIVERED' | 'ACKNOWLEDGED'
      };

      this.dispatchQueue.push(payload);

      // Simulate network delivery progression
      setTimeout(() => {
        payload.deliveryStatus = 'DELIVERED';
        this.notify();
      }, 1200 + idx * 800);

      // Simulate contact reading and acknowledging alert
      setTimeout(() => {
        payload.deliveryStatus = 'ACKNOWLEDGED';
        contact.status = 'ACKNOWLEDGED';
        this.notify();
      }, 4500 + idx * 2500);
    });

    this.notify();
  }

  resetStatus() {
    this.contacts.forEach(c => c.status = 'STANDBY');
    this.dispatchQueue = [];
    this.notify();
  }
}

export const contactManager = new ContactManager();
