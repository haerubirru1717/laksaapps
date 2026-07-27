// ── LAKSA CONFIGURATION ──

// Endpoint API Cloudflare Worker (backend)
const CLOUD_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? (localStorage.getItem('LAKSA_API_URL') || 'https://laksana.haerubirru17.workers.dev')
  : 'https://laksana.haerubirru17.workers.dev';
