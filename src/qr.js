// Dynamic Mobile Connection QR Code Generator
import QRCode from 'qrcode';

export async function initQRCode(canvasId, urlTextId) {
  const canvas = document.getElementById(canvasId);
  const textEl = document.getElementById(urlTextId);
  if (!canvas) return;

  // Prefer local network IP for mobile scanning
  const currentHost = window.location.hostname;
  let targetUrl = window.location.origin;

  // If opened via localhost on desktop, point to network IP 192.168.1.36 so phone can connect
  if (currentHost === 'localhost' || currentHost === '127.0.0.1') {
    targetUrl = `http://192.168.1.36:${window.location.port || 3000}/`;
  }

  if (textEl) {
    textEl.textContent = targetUrl;
  }

  try {
    await QRCode.toCanvas(canvas, targetUrl, {
      width: 190,
      margin: 1,
      color: {
        dark: '#ffffff',
        light: '#0b101b'
      }
    });
  } catch (err) {
    console.warn('QR code generation failed:', err);
  }
}
