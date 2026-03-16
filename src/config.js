/**
 * Pilates by Riven — App Configuration
 */

export const config = {
  // WhatsApp del studio (sin +, solo números):
  WHATSAPP_NUMBER: '50685438378',

  // Instagram del studio:
  INSTAGRAM: 'pilatesbyriven',

  // API backend URL (default: local dev):
  API_URL: import.meta.env.VITE_API_URL || 'http://localhost:3001',

  // Studio info:
  STUDIO_NAME: 'Pilates by Riven',
  OWNER: 'Andressa Gomes',
  LOCATION: 'Costa Rica',
}
