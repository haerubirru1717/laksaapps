// ── LAKSA CONFIGURATION ──

// Endpoint API Cloudflare Worker (backend)
const CLOUD_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? 'http://localhost:8787'
  : 'https://laksana.haerubirru17.workers.dev';

// Google OAuth Client ID
const GOOGLE_CLIENT_ID = '78312786561-s8vsodvn2qpto00epscegvbs79olbn37.apps.googleusercontent.com';
