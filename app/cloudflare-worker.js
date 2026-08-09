/**
 * LAKSA BOT & BACKEND API — Cloudflare Worker v3.0
 * ─────────────────────────────────────────────────────
 * Single source of truth: Cloudflare D1.
 *
 * ENV VARS : TELEGRAM_TOKEN, TELEGRAM_WEBHOOK_SECRET,
 *            ADMIN_BOT_TOKEN, ADMIN_TELEGRAM_WEBHOOK_SECRET,
 *            ADMIN_TELEGRAM_ID (whitelist admin), GROQ_API_KEY, JWT_SECRET
 * D1 BINDING: DB
 *
 * Fitur Bot Telegram:
 *   • Catat transaksi via teks bebas (fully auto)
 *   • Scan struk via foto (Zero-Click matched caption / interactive keyboard fallback)
 *   • Lihat saldo & riwayat
 *   • Tagihan & pengingat
 *
 * Fitur Web API:
 *   • CRUD accounts, categories, transactions, budgets, goals, bills
 *   • POST /ai-chat      — proxy AI chat ke Groq
 *   • POST /scan-receipt — proxy scan struk ke Groq Vision
 */

// ─────────────────────────────────────────────────────
// CONSTANTS & CONFIGS
// ─────────────────────────────────────────────────────
const TG = (token) => `https://api.telegram.org/bot${token}`;

// Groq model chain — dicoba berurutan jika quota habis
const PARSE_MODELS = [
  "llama-3.1-8b-instant",
  "llama-3.3-70b-versatile",
  "meta-llama/llama-4-scout-17b-16e-instruct",
];
const CHAT_MODELS = [
  "qwen/qwen3-32b",                              // primary — terbaik untuk Bahasa Indonesia
  "llama-3.3-70b-versatile",                     // fallback 1
  "meta-llama/llama-4-scout-17b-16e-instruct",   // fallback 2
  "llama-3.1-8b-instant",                        // last resort
];
const VISION_MODELS = [
  "meta-llama/llama-4-scout-17b-16e-instruct",   // primary — current Groq vision model
  "meta-llama/llama-4-maverick-17b-128e-instruct", // fallback
];

// Premium Router AI Config (Requires Cloudflare Worker Secret: PREMIUM_AI_API_KEY)
const PREMIUM_AI_DEFAULT_KEY = "";
const PREMIUM_AI_DEFAULT_BASE = "https://router.lapakvip.com/api/v1/";
const PREMIUM_CHAT_MODELS = [
  "lv/gpt-5.5",
  "lv/deepseek-v4-flash",
  "lv/deepseek-v4-pro",
  "lv/glm-5.0-turbo",
  "lv/kimi-k2.6",
  "lv/gpt-5.6-sol",
  "lv/qwen3-coder-next"
];
const PREMIUM_PARSE_MODELS = [
  "lv/deepseek-v4-flash",
  "lv/gpt-5.5",
  "lv/glm-5.0-turbo",
  "lv/kimi-k2.5"
];
const PREMIUM_VISION_MODELS = [
  "lv/glm-5v-turbo",
  "lv/gpt-5.5",
  "lv/deepseek-v4-flash"
];

// Max age for pending text entries (ms)
const PENDING_TEXT_TTL_MS = 5 * 60 * 1000; // 5 menit

// JWT config
const JWT_EXPIRY_SECONDS = 7 * 24 * 60 * 60; // 7 hari
const MAX_JSON_BODY_BYTES = 1_000_000;
const MAX_AI_MESSAGES = 40;
const MAX_AI_MESSAGE_CHARS = 40_000;
const MAX_AI_TOKENS = 4096;
const MAX_RECEIPT_BYTES = 8 * 1024 * 1024;
const ALLOWED_IMAGE_MIMES = new Set(["image/jpeg", "image/png", "image/webp"]);

async function readJsonBodyBounded(request, maxBytes = MAX_JSON_BODY_BYTES) {
  const contentLength = Number(request.headers.get("Content-Length") || 0);
  if (contentLength > maxBytes) {
    const error = new Error("Payload terlalu besar");
    error.status = 413;
    throw error;
  }
  if (!request.body) return {};
  const reader = request.body.getReader();
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      const error = new Error("Payload terlalu besar");
      error.status = 413;
      throw error;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    const error = new Error("JSON tidak valid");
    error.status = 400;
    throw error;
  }
}

// Freemium config
const FREE_LIMIT_PER_FEATURE = 3; // 3x per fitur per hari
const LIMITED_FEATURES = ['ai_chat', 'scan_receipt', 'report_view', 'export_csv'];

// ─────────────────────────────────────────────────────
// AUTH UTILITIES (PBKDF2 + JWT via Web Crypto API)
// ─────────────────────────────────────────────────────
// CATATAN: jangan ubah nilai iterations begitu saja — semua hash lama dibuat dengan
// 100.000 iterasi dan akan gagal diverifikasi. Untuk naik ke 600.000 (rekomendasi OWASP),
// tambahkan kolom `pbkdf2_iterations` di tabel users lalu migrasi bertahap saat user login.
async function hashPassword(password, salt, iterations = 600000) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: enc.encode(salt), iterations, hash: "SHA-256" },
    keyMaterial, 256
  );
  return btoa(String.fromCharCode(...new Uint8Array(bits)));
}

async function verifyPassword(password, salt, hash, iterations = 100000) {
  const computed = await hashPassword(password, salt, Number(iterations) || 100000);
  return timingSafeEqual(computed, hash);
}

function secureSixDigitCode() {
  const value = new Uint32Array(1);
  crypto.getRandomValues(value);
  return String(100000 + (value[0] % 900000));
}

function securePairingCode() {
  const bytes = new Uint8Array(9);
  crypto.getRandomValues(bytes);
  return base64url(bytes).toUpperCase();
}

function validPassword(password) {
  return typeof password === "string" && password.length >= 10 && password.length <= 256;
}

/** HMAC-SHA256 berkunci -> hex. Dipakai untuk hash OTP agar tidak bisa di-brute-force offline. */
async function hmacHex(message, secret) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(String(message)));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
}

/** Perbandingan string waktu-konstan (cegah timing attack pada verifikasi OTP). */
function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function base64url(buf) {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64urlDecode(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  const bin = atob(str);
  return Uint8Array.from(bin, c => c.charCodeAt(0));
}

async function signJWT(payload, secret) {
  const enc = new TextEncoder();
  const header = { alg: "HS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  payload.iat = now;
  payload.exp = now + JWT_EXPIRY_SECONDS;
  const headerB64 = base64url(enc.encode(JSON.stringify(header)));
  const payloadB64 = base64url(enc.encode(JSON.stringify(payload)));
  const data = `${headerB64}.${payloadB64}`;
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  return `${data}.${base64url(sig)}`;
}

async function verifyJWT(token, secret) {
  const enc = new TextEncoder();
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [headerB64, payloadB64, sigB64] = parts;
  const data = `${headerB64}.${payloadB64}`;
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  const sig = base64urlDecode(sigB64);
  const valid = await crypto.subtle.verify("HMAC", key, sig, enc.encode(data));
  if (!valid) return null;
  const payload = JSON.parse(new TextDecoder().decode(base64urlDecode(payloadB64)));
  if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
  return payload;
}

function extractToken(req) {
  const auth = req.headers.get("Authorization");
  if (!auth || !auth.startsWith("Bearer ")) return null;
  return auth.slice(7);
}

async function verifyAdminJWT(req, env) {
  const token = extractToken(req);
  if (!token) return null;
  const payload = await verifyJWT(token, env.JWT_SECRET);
  if (!payload) return null;
  if (payload.role !== "admin") return null;
  if (!env.ADMIN_TELEGRAM_ID || String(payload.sub) !== String(env.ADMIN_TELEGRAM_ID)) return null;
  return payload;
}

async function authenticateUserToken(req, env) {
  const token = extractToken(req);
  if (!token) return null;
  const payload = await verifyJWT(token, env.JWT_SECRET);
  if (!payload?.sub || payload.role === "admin") return null;
  const user = await env.DB.prepare(
    "SELECT id, email, name, token_version, is_banned FROM users WHERE id = ?"
  ).bind(payload.sub).first();
  if (!user || user.is_banned) return null;
  if (Number(payload.ver || 0) !== Number(user.token_version || 0)) return null;
  return { payload, user };
}

function adminAuditStatement(adminId, action, target, details, env) {
  return env.DB.prepare(
    "INSERT INTO admin_audit_logs (id, admin_id, action, target, details, created_at) VALUES (?, ?, ?, ?, ?, ?)"
  ).bind(
    "log_" + crypto.randomUUID(),
    adminId,
    action,
    target || null,
    details ? JSON.stringify(details) : null,
    new Date().toISOString()
  );
}

async function logAdminAction(adminId, action, target, details, env) {
  await adminAuditStatement(adminId, action, target, details, env).run();
}

async function auditAdminBotMutation(adminId, updateId, action, target, details, env) {
  await logAdminAction(adminId, action, target, {
    ...details,
    update_id: updateId,
    channel: "telegram_admin_bot",
    outcome: "authorized_intent"
  }, env);
}

// ─────────────────────────────────────────────────────
// USAGE TRACKING (FREEMIUM)
// ─────────────────────────────────────────────────────
function todayMidnight() {
  const d = new Date();
  return d.toISOString().slice(0, 10) + 'T00:00:00';
}

async function getUserPlan(uid, env) {
  try {
    const user = await env.DB.prepare("SELECT plan, plan_expired_at, is_banned FROM users WHERE id = ?").bind(uid).first();
    if (!user) return { plan: 'free', expired: null, banned: false };
    if (user.plan === 'premium' && user.plan_expired_at) {
      if (new Date(user.plan_expired_at) < new Date()) {
        await env.DB.prepare("UPDATE users SET plan = 'free', plan_expired_at = NULL WHERE id = ?").bind(uid).run();
        return { plan: 'free', expired: null, banned: !!user.is_banned };
      }
    }
    return { plan: user.plan || 'free', expired: user.plan_expired_at, banned: !!user.is_banned };
  } catch (e) {
    return { plan: 'free', expired: null, banned: false };
  }
}

async function getUsageCount(uid, feature, env) {
  const midnight = todayMidnight();
  const row = await env.DB.prepare(
    "SELECT COUNT(*) as cnt FROM usage_logs WHERE user_id = ? AND feature = ? AND used_at >= ?"
  ).bind(uid, feature, midnight).first();
  return row?.cnt || 0;
}

async function checkAndTrackUsage(uid, feature, env) {
  try {
    const { plan, banned } = await getUserPlan(uid, env);
    if (banned) return { allowed: false, reason: 'banned', used: 0, limit: 0 };
    if (plan === 'premium') {
      await env.DB.prepare(
        "INSERT INTO usage_logs (id, user_id, feature, used_at) VALUES (?, ?, ?, ?)"
      ).bind('u_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6), uid, feature, new Date().toISOString()).run();
      return { allowed: true, used: 0, limit: -1 };
    }
    const day = new Date().toISOString().slice(0, 10);
    await env.DB.prepare(`
      INSERT INTO daily_usage (user_id, feature, day, count)
      VALUES (?, ?, ?, 1)
      ON CONFLICT(user_id, feature, day) DO UPDATE SET count = count + 1
    `).bind(uid, feature, day).run();
    const counter = await env.DB.prepare(
      "SELECT count FROM daily_usage WHERE user_id = ? AND feature = ? AND day = ?"
    ).bind(uid, feature, day).first();
    const used = Number(counter?.count || 0);
    if (used > FREE_LIMIT_PER_FEATURE) {
      return { allowed: false, reason: 'limit', used: FREE_LIMIT_PER_FEATURE, limit: FREE_LIMIT_PER_FEATURE };
    }
    await env.DB.prepare(
      "INSERT INTO usage_logs (id, user_id, feature, used_at) VALUES (?, ?, ?, ?)"
    ).bind(crypto.randomUUID(), uid, feature, new Date().toISOString()).run();
    return { allowed: true, used, limit: FREE_LIMIT_PER_FEATURE };
  } catch (e) {
    console.error("usage tracking failed:", e.message);
    return { allowed: false, reason: 'tracking_error', used: 0, limit: FREE_LIMIT_PER_FEATURE };
  }
}

async function resolveUserByTelegramId(tgId, env) {
  const user = await env.DB.prepare("SELECT id FROM users WHERE telegram_id = ?").bind(tgId).first();
  return user?.id || tgId;
}

async function checkTelegramUsage(tgUserId, feature, env) {
  const uid = await resolveUserByTelegramId(tgUserId, env);
  return checkAndTrackUsage(uid, feature, env);
}

async function getUsageStatus(uid, env) {
  const { plan, expired } = await getUserPlan(uid, env);
  const midnight = todayMidnight();
  const status = {};
  for (const f of LIMITED_FEATURES) {
    if (plan === 'premium') {
      status[f] = { used: 0, limit: -1 };
    } else {
      const used = await getUsageCount(uid, f, env);
      status[f] = { used, limit: FREE_LIMIT_PER_FEATURE };
    }
  }
  return { plan, plan_expired_at: expired, features: status };
}

// ─────────────────────────────────────────────────────
// AUTH ENDPOINTS
// ─────────────────────────────────────────────────────
async function handleRegister(body, env) {
  const { email, password, name } = body || {};
  if (!email || !password || !name) return jsonRes({ error: "Email, password, dan nama wajib diisi" }, 400);
  const emailLower = email.toLowerCase().trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailLower)) return jsonRes({ error: "Format email tidak valid" }, 400);
  if (!validPassword(password)) return jsonRes({ error: "Password harus 10–256 karakter" }, 400);
  const existing = await env.DB.prepare("SELECT id FROM users WHERE email = ?").bind(emailLower).first();
  if (existing) return jsonRes({ error: "Email sudah terdaftar" }, 409);
  const id = "usr_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);
  const salt = crypto.randomUUID();
  const passwordHash = await hashPassword(password, salt);
  await env.DB.prepare(
    "INSERT INTO users (id, email, name, password_hash, salt, pbkdf2_iterations, created_at) VALUES (?, ?, ?, ?, ?, 600000, ?)"
  ).bind(id, emailLower, name.trim(), passwordHash, salt, new Date().toISOString()).run();
  // Seed default categories + default account for new user
  await seedCategories(id, env);
  const defAccId = "acc_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6);
  await env.DB.prepare("INSERT OR IGNORE INTO accounts (id, user_id, name, balance, color) VALUES (?, ?, 'Tunai', 0, '#7c3aed')").bind(defAccId, id).run().catch(() => {});
  const token = await signJWT({ sub: id, email: emailLower, name: name.trim(), ver: 0 }, env.JWT_SECRET);
  return jsonRes({ token, user: { id, email: emailLower, name: name.trim() } }, 201);
}

async function handleLogin(body, env) {
  const { email, password } = body || {};
  if (!email || !password) return jsonRes({ error: "Email dan password wajib diisi" }, 400);
  const emailLower = email.toLowerCase().trim();
  const user = await env.DB.prepare("SELECT * FROM users WHERE email = ?").bind(emailLower).first();
  if (!user) return jsonRes({ error: "Email atau password salah" }, 401);
  const valid = await verifyPassword(password, user.salt, user.password_hash, user.pbkdf2_iterations);
  if (!valid) return jsonRes({ error: "Email atau password salah" }, 401);
  if (Number(user.pbkdf2_iterations || 100000) < 600000) {
    const upgradedHash = await hashPassword(password, user.salt, 600000);
    await env.DB.prepare("UPDATE users SET password_hash = ?, pbkdf2_iterations = 600000 WHERE id = ?")
      .bind(upgradedHash, user.id).run();
  }
  if (user.is_banned) return jsonRes({ error: "Akun diblokir" }, 403);
  const token = await signJWT({ sub: user.id, email: user.email, name: user.name, ver: Number(user.token_version || 0) }, env.JWT_SECRET);
  return jsonRes({ token, user: { id: user.id, email: user.email, name: user.name, telegram_id: user.telegram_id } });
}

async function handleMe(req, env) {
  const auth = await authenticateUserToken(req, env);
  if (!auth) return jsonRes({ error: "Token tidak valid, dicabut, atau expired" }, 401);
  const user = await env.DB.prepare("SELECT id, email, name, telegram_id, created_at FROM users WHERE id = ?").bind(auth.user.id).first();
  if (!user) return jsonRes({ error: "User tidak ditemukan" }, 404);
  return jsonRes(user);
}

async function handleStartTelegramLink(req, env) {
  const auth = await authenticateUserToken(req, env);
  if (!auth) return jsonRes({ error: "Autentikasi diperlukan" }, 401);
  const code = securePairingCode();
  const codeHash = await hmacHex(code, env.JWT_SECRET);
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  await env.DB.prepare("DELETE FROM telegram_link_challenges WHERE user_id = ?").bind(auth.user.id).run();
  await env.DB.prepare(
    "INSERT INTO telegram_link_challenges (code_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)"
  ).bind(codeHash, auth.user.id, expiresAt, new Date().toISOString()).run();
  return jsonRes({ code, expires_at: expiresAt, command: `/link ${code}` });
}

async function completeTelegramLink(rawTgId, code, env) {
  const codeHash = await hmacHex(String(code || "").trim().toUpperCase(), env.JWT_SECRET);
  const challenge = await env.DB.prepare(
    "SELECT user_id, expires_at, used_at FROM telegram_link_challenges WHERE code_hash = ?"
  ).bind(codeHash).first();
  if (!challenge || challenge.used_at || new Date(challenge.expires_at) <= new Date()) {
    return { ok: false, message: "Kode pairing tidak valid atau sudah kedaluwarsa." };
  }
  const existing = await env.DB.prepare(
    "SELECT id FROM users WHERE telegram_id = ? AND id <> ?"
  ).bind(String(rawTgId), challenge.user_id).first();
  if (existing) return { ok: false, message: "Telegram ini sudah terhubung ke akun lain." };
  const webUid = challenge.user_id;
  const tgStr = String(rawTgId);
  const now = new Date().toISOString();
  const statements = [
    env.DB.prepare("UPDATE telegram_link_challenges SET used_at = ? WHERE code_hash = ? AND used_at IS NULL").bind(now, codeHash),
    env.DB.prepare("DELETE FROM categories WHERE user_id = ? AND id IN (SELECT id FROM categories WHERE user_id = ?)").bind(tgStr, webUid),
    ...["transactions", "accounts", "categories", "budgets", "goals", "bills", "piutang", "pending_scans", "usage_logs"]
      .map(table => env.DB.prepare(`UPDATE ${table} SET user_id = ? WHERE user_id = ?`).bind(webUid, tgStr)),
    env.DB.prepare("UPDATE users SET telegram_id = ? WHERE id = ?").bind(tgStr, webUid)
  ];
  const results = await env.DB.batch(statements);
  if (!results?.[0]?.meta?.changes) return { ok: false, message: "Kode pairing sudah digunakan." };
  return { ok: true, message: "Telegram berhasil dihubungkan dengan aman." };
}

async function handleRefreshToken(req, env) {
  const auth = await authenticateUserToken(req, env);
  if (!auth) return jsonRes({ error: "Token tidak valid, dicabut, atau expired" }, 401);
  const user = auth.user;
  const newToken = await signJWT({ sub: user.id, email: user.email, name: user.name, ver: Number(user.token_version || 0) }, env.JWT_SECRET);
  return jsonRes({ token: newToken });
}

async function handleDeleteAccount(req, body, env) {
  const token = extractToken(req);
  if (!token) return jsonRes({ error: "Token diperlukan" }, 401);
  const payload = await verifyJWT(token, env.JWT_SECRET);
  if (!payload) return jsonRes({ error: "Token tidak valid" }, 401);
  const { password } = body || {};
  if (!password) return jsonRes({ error: "Password diperlukan untuk konfirmasi" }, 400);
  const ip = req.headers.get("CF-Connecting-IP") || req.headers.get("X-Forwarded-For") || "unknown";
  if (!await checkRateLimit(`delete-account:${payload.sub}:${ip}`, env, 5, 15 * 60 * 1000)) {
    return jsonRes({ error: "Terlalu banyak percobaan. Coba lagi dalam 15 menit." }, 429);
  }
  const user = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(payload.sub).first();
  if (!user) return jsonRes({ error: "User tidak ditemukan" }, 404);
  const valid = await verifyPassword(password, user.salt, user.password_hash, user.pbkdf2_iterations);
  if (!valid) return jsonRes({ error: "Password salah" }, 401);
  const uid = user.id;
  await env.DB.prepare("DELETE FROM transaction_items WHERE transaction_id IN (SELECT id FROM transactions WHERE user_id = ?)").bind(uid).run().catch(() => {});
  await env.DB.prepare("DELETE FROM transactions WHERE user_id = ?").bind(uid).run().catch(() => {});
  await env.DB.prepare("DELETE FROM accounts WHERE user_id = ?").bind(uid).run().catch(() => {});
  await env.DB.prepare("DELETE FROM categories WHERE user_id = ?").bind(uid).run().catch(() => {});
  await env.DB.prepare("DELETE FROM budgets WHERE user_id = ?").bind(uid).run().catch(() => {});
  await env.DB.prepare("DELETE FROM goals WHERE user_id = ?").bind(uid).run().catch(() => {});
  await env.DB.prepare("DELETE FROM bills WHERE user_id = ?").bind(uid).run().catch(() => {});
  await env.DB.prepare("DELETE FROM piutang WHERE user_id = ?").bind(uid).run().catch(() => {});
  await env.DB.prepare("DELETE FROM pending_scans WHERE user_id = ?").bind(uid).run().catch(() => {});
  await env.DB.prepare("DELETE FROM pending_texts WHERE user_id = ?").bind(uid).run().catch(() => {});
  await env.DB.prepare("DELETE FROM usage_logs WHERE user_id = ?").bind(uid).run().catch(() => {});
  await env.DB.prepare("DELETE FROM bot_messages WHERE user_id = ?").bind(uid).run().catch(() => {});
  await env.DB.prepare("DELETE FROM users WHERE id = ?").bind(uid).run();
  return jsonRes({ status: "deleted", message: "Akun dan semua data berhasil dihapus." });
}

async function handleForgotPassword(req, body, env) {
  const { email } = body || {};
  if (!email) return jsonRes({ error: "Email wajib diisi" }, 400);
  const emailLower = email.toLowerCase().trim();
  const user = await env.DB.prepare("SELECT id, name FROM users WHERE email = ?").bind(emailLower).first();
  
  // Jangan bocorkan apakah email terdaftar (user enumeration).
  // Balas sukses generik tanpa token, persis seperti alur OTP admin.
  if (!user) {
    return jsonRes({ message: "Jika email terdaftar, kode OTP telah dikirim." });
  }

  const otp = secureSixDigitCode();
  const nowSec = Math.floor(Date.now() / 1000);
  // OTP TIDAK PERNAH masuk payload JWT — payload JWT hanya base64, bisa dibaca siapa pun.
  // Yang disimpan adalah hash-nya (HMAC dengan JWT_SECRET, bukan SHA-256 polos yang
  // bisa di-brute-force offline karena OTP hanya 6 digit).
  const otpHash = await hmacHex(otp, env.JWT_SECRET);
  const challengeId = crypto.randomUUID();
  const resetToken = await signJWT(
    { sub: user.id, email: emailLower, purpose: "otp_verification", challenge_id: challengeId, reset_exp: nowSec + 600 },
    env.JWT_SECRET
  );
  await env.DB.prepare(
    "INSERT INTO otp_challenges (id, purpose, subject_id, otp_hash, expires_at, attempts, used_at) VALUES (?, 'password_reset', ?, ?, ?, 0, NULL)"
  ).bind(challengeId, user.id, otpHash, new Date((nowSec + 600) * 1000).toISOString()).run();

  const resendApiKey = env.RESEND_API_KEY;
  if (!resendApiKey) {
    return jsonRes({ error: "Layanan email belum dikonfigurasi oleh admin." }, 500);
  }

  const emailPayload = {
    from: "Laksa Apps <noreply@laksaapp.my.id>",
    to: [emailLower],
    subject: "OTP Reset Password Akun Laksa",
    html: `
      <div style="font-family:'Inter',system-ui,sans-serif;max-width:480px;margin:0 auto;padding:2rem;background:#f8fafc;border:1px solid #e2e8f0;border-radius:16px;">
        <h2 style="color:#1e293b;margin-top:0;font-weight:800;letter-spacing:-0.02em;">Kode OTP Reset Password</h2>
        <p style="color:#475569;font-size:0.9rem;line-height:1.6;">Halo <strong>${user.name || 'Pengguna'}</strong>,</p>
        <p style="color:#475569;font-size:0.9rem;line-height:1.6;">Berikut adalah kode OTP untuk mereset password akun Laksa Anda:</p>
        <div style="text-align:center;margin:1.8rem 0;">
          <span style="background:#2563eb;color:#fff;padding:0.75rem 2rem;border-radius:10px;font-size:1.8rem;font-weight:800;letter-spacing:0.3em;display:inline-block;box-shadow:0 4px 12px rgba(37,99,235,0.25);">${otp}</span>
        </div>
        <p style="color:#475569;font-size:0.9rem;line-height:1.6;">Kode ini hanya berlaku selama <strong>10 menit</strong>.</p>
        <p style="color:#94a3b8;font-size:0.75rem;margin-top:2rem;border-top:1px solid #e2e8f0;padding-top:1rem;">Jika Anda tidak merasa meminta reset password ini, silakan abaikan email ini.</p>
      </div>
    `
  };

  try {
    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${resendApiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(emailPayload)
    });
    
    if (!resp.ok) {
      const errText = await resp.text();
      console.error("Resend API error:", errText);
      let errMsg = "Gagal mengirim email pemulihan. ";
      try {
        const errJson = JSON.parse(errText);
        if (errJson && errJson.message) {
          errMsg += `Detail: ${errJson.message}`;
        } else {
          errMsg += `(HTTP ${resp.status})`;
        }
      } catch (e) {
        errMsg += `(HTTP ${resp.status})`;
      }
      return jsonRes({ error: errMsg }, 500);
    }
  } catch (e) {
    console.error("Resend fetch error:", e);
    return jsonRes({ error: "Koneksi ke server email gagal." }, 500);
  }

  return jsonRes({ message: "Kode OTP telah dikirim ke email Anda!", token: resetToken });
}

async function handleResetPassword(req, body, env) {
  const { token, otp, password } = body || {};
  if (!token || !password) return jsonRes({ error: "Sesi reset tidak valid atau password baru wajib diisi" }, 400);
  if (!validPassword(password)) return jsonRes({ error: "Password harus 10–256 karakter" }, 400);

  const payload = await verifyJWT(token, env.JWT_SECRET);
  if (!payload) {
    return jsonRes({ error: "Sesi reset tidak valid atau sudah kedaluwarsa" }, 400);
  }

  const nowSec = Math.floor(Date.now() / 1000);
  if (!payload.reset_exp || nowSec > payload.reset_exp) {
    return jsonRes({ error: "Sesi reset tidak valid atau sudah kedaluwarsa" }, 400);
  }

  if (payload.purpose === "otp_verification") {
    if (!otp) return jsonRes({ error: "Kode OTP wajib diisi" }, 400);
    const challenge = await env.DB.prepare(
      "SELECT otp_hash, expires_at, attempts, used_at FROM otp_challenges WHERE id = ? AND purpose = 'password_reset'"
    ).bind(payload.challenge_id).first();
    if (!challenge || challenge.used_at || challenge.attempts >= 5 || new Date(challenge.expires_at) <= new Date()) {
      return jsonRes({ error: "Sesi reset tidak valid atau sudah digunakan" }, 400);
    }
    await env.DB.prepare("UPDATE otp_challenges SET attempts = attempts + 1 WHERE id = ?").bind(payload.challenge_id).run();
    const inputHash = await hmacHex(otp.trim(), env.JWT_SECRET);
    if (!timingSafeEqual(inputHash, challenge.otp_hash)) {
      return jsonRes({ error: "Kode OTP salah" }, 400);
    }
    const claim = await env.DB.prepare(
      "UPDATE otp_challenges SET used_at = ? WHERE id = ? AND used_at IS NULL"
    ).bind(new Date().toISOString(), payload.challenge_id).run();
    if (!claim?.meta?.changes) return jsonRes({ error: "Kode OTP sudah digunakan" }, 400);
  } else {
    return jsonRes({ error: "Sesi reset tidak valid" }, 400);
  }

  const userId = payload.sub;
  const user = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(userId).first();
  if (!user) return jsonRes({ error: "User tidak ditemukan" }, 404);

  const salt = crypto.randomUUID();
  const passwordHash = await hashPassword(password, salt);

  await env.DB.prepare(
    "UPDATE users SET password_hash = ?, salt = ?, pbkdf2_iterations = 600000, token_version = COALESCE(token_version, 0) + 1 WHERE id = ?"
  ).bind(passwordHash, salt, userId).run();

  return jsonRes({ message: "Password berhasil diperbarui! Silakan login kembali dengan password baru." });
}

// ─────────────────────────────────────────────────────
// RATE LIMITING (per-IP, in-memory with D1 fallback)
// ─────────────────────────────────────────────────────
const RATE_LIMIT_WINDOW = 15 * 60 * 1000; // 15 menit
const RATE_LIMIT_MAX = 10; // max 10 attempts per 15 min per IP

async function checkRateLimit(key, env, max = RATE_LIMIT_MAX, windowMs = RATE_LIMIT_WINDOW) {
  const now = Date.now();
  const windowStart = Math.floor(now / windowMs) * windowMs;
  await env.DB.prepare(`
    INSERT INTO rate_limits (key, window_start, count, updated_at)
    VALUES (?, ?, 1, ?)
    ON CONFLICT(key, window_start) DO UPDATE SET count = count + 1, updated_at = excluded.updated_at
  `).bind(String(key), windowStart, new Date(now).toISOString()).run();
  const row = await env.DB.prepare(
    "SELECT count FROM rate_limits WHERE key = ? AND window_start = ?"
  ).bind(String(key), windowStart).first();
  return Number(row?.count || 0) <= max;
}

// ─────────────────────────────────────────────────────
// DEDUP INFRASTRUCTURE (lazy migration — auto-creates on first webhook)
// ─────────────────────────────────────────────────────
let _dedupReady = false;
let _securitySchemaReady = false;
async function ensureSecuritySchema(env) {
  if (_securitySchemaReady) return;
  await env.DB.batch([
    env.DB.prepare("CREATE TABLE IF NOT EXISTS telegram_link_challenges (code_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires_at DATETIME NOT NULL, created_at DATETIME NOT NULL, used_at DATETIME)"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS otp_challenges (id TEXT PRIMARY KEY, purpose TEXT NOT NULL, subject_id TEXT NOT NULL, otp_hash TEXT NOT NULL, expires_at DATETIME NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, used_at DATETIME)"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS rate_limits (key TEXT NOT NULL, window_start INTEGER NOT NULL, count INTEGER NOT NULL DEFAULT 0, updated_at DATETIME NOT NULL, PRIMARY KEY (key, window_start))"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS daily_usage (user_id TEXT NOT NULL, feature TEXT NOT NULL, day TEXT NOT NULL, count INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (user_id, feature, day))")
  ]);
  await env.DB.prepare("ALTER TABLE users ADD COLUMN token_version INTEGER NOT NULL DEFAULT 0").run().catch(() => {});
  await env.DB.prepare("ALTER TABLE users ADD COLUMN pbkdf2_iterations INTEGER NOT NULL DEFAULT 100000").run().catch(() => {});
  await env.DB.prepare("ALTER TABLE payment_requests ADD COLUMN coupon_code TEXT").run().catch(() => {});
  await env.DB.prepare("ALTER TABLE payment_requests ADD COLUMN provider_signature TEXT").run().catch(() => {});
  await env.DB.prepare("ALTER TABLE payment_requests ADD COLUMN provider_total INTEGER").run().catch(() => {});
  await env.DB.prepare("ALTER TABLE payment_requests ADD COLUMN provider_reference TEXT").run().catch(() => {});
  await env.DB.prepare("DELETE FROM app_settings WHERE key = 'qris_image_url'").run().catch(() => {});
  await env.DB.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_telegram_unique ON users (telegram_id) WHERE telegram_id IS NOT NULL").run()
    .catch(e => console.error("telegram unique index migration requires duplicate cleanup:", e.message));
  _securitySchemaReady = true;
}

async function ensureDedup(env) {
  if (_dedupReady) return;
  try {
    await env.DB.prepare(
      "CREATE TABLE IF NOT EXISTS processed_bot_updates_v2 (update_id TEXT PRIMARY KEY, status TEXT NOT NULL DEFAULT 'completed', payload TEXT, attempts INTEGER NOT NULL DEFAULT 0, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)"
    ).run();

    await env.DB.prepare(
      "ALTER TABLE transactions ADD COLUMN idempotency_key TEXT"
    ).run().catch(() => {});
    await env.DB.prepare(
      "CREATE UNIQUE INDEX IF NOT EXISTS idx_tx_idempotency ON transactions (idempotency_key) WHERE idempotency_key IS NOT NULL"
    ).run().catch(() => {});
    await env.DB.prepare(
      "ALTER TABLE transactions ADD COLUMN dedup_hash TEXT"
    ).run().catch(() => {});
    await env.DB.prepare(
      "CREATE UNIQUE INDEX IF NOT EXISTS idx_tx_dedup_hash ON transactions (dedup_hash) WHERE dedup_hash IS NOT NULL"
    ).run().catch(() => {});
    await env.DB.prepare(
      "ALTER TABLE transactions ADD COLUMN transfer_group_id TEXT"
    ).run().catch(() => {});
    await env.DB.prepare(
      "CREATE INDEX IF NOT EXISTS idx_tx_transfer_group ON transactions (transfer_group_id) WHERE transfer_group_id IS NOT NULL"
    ).run().catch(() => {});
    _dedupReady = true;
  } catch (e) {
    _dedupReady = false;
    throw new Error(`Dedup schema unavailable: ${e.message}`);
  }
}

function validTelegramUpdateId(updateId) {
  return Number.isSafeInteger(updateId) && updateId >= 0;
}

async function claimTelegramUpdate(botName, updateId, payload, env) {
  if (!validTelegramUpdateId(updateId)) throw new Error("Invalid Telegram update_id");
  const key = `${botName}:${updateId}`;
  try {
    await env.DB.prepare(
      "INSERT INTO processed_bot_updates_v2 (update_id, status, payload, attempts, updated_at) VALUES (?, 'processing', ?, 1, CURRENT_TIMESTAMP)"
    ).bind(key, JSON.stringify(payload)).run();
    return true;
  } catch (e) {
    const message = String(e?.message || "");
    if (message.includes("UNIQUE") || message.includes("constraint")) {
      const retry = await env.DB.prepare(`UPDATE processed_bot_updates_v2 SET status = 'processing', payload = ?, attempts = attempts + 1, updated_at = CURRENT_TIMESTAMP WHERE update_id = ? AND attempts < 5 AND (status = 'failed' OR (status = 'processing' AND updated_at < datetime('now', '-5 minutes')))`)
        .bind(JSON.stringify(payload), key).run();
      return (retry.meta?.changes || 0) === 1;
    }
    throw e;
  }
}

async function markTelegramUpdate(botName, updateId, status, env) {
  if (updateId === undefined || updateId === null) return;
  await env.DB.prepare("UPDATE processed_bot_updates_v2 SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE update_id = ?")
    .bind(status, `${botName}:${updateId}`).run();
}

async function processTelegramUpdate(botName, body, env) {
  try {
    if (botName === "admin") await handleAdminBot(body, env, body?.update_id);
    else await handleTelegram(body, env, body?.update_id);
    await markTelegramUpdate(botName, body?.update_id, "completed", env);
  } catch (error) {
    const failureStatus = botName === "admin" ? "terminal_failed" : "failed";
    await markTelegramUpdate(botName, body?.update_id, failureStatus, env).catch(() => {});
    throw error;
  }
}

async function retryFailedBotUpdates(env) {
  await ensureDedup(env);
  const { results = [] } = await env.DB.prepare("SELECT update_id, payload FROM processed_bot_updates_v2 WHERE status = 'failed' AND attempts < 5 ORDER BY updated_at LIMIT 20").all();
  for (const row of results) {
    try {
      const split = row.update_id.indexOf(':');
      const botName = row.update_id.slice(0, split);
      const body = JSON.parse(row.payload || '{}');
      if (!validTelegramUpdateId(body?.update_id)) throw new Error("Malformed persisted Telegram payload");
      if (await claimTelegramUpdate(botName, body.update_id, body, env)) {
        await processTelegramUpdate(botName, body, env).catch(() => {});
      }
    } catch (error) {
      await env.DB.prepare("UPDATE processed_bot_updates_v2 SET status = 'terminal_failed', updated_at = CURRENT_TIMESTAMP WHERE update_id = ?")
        .bind(row.update_id).run().catch(() => {});
      console.error("telegram retry payload:", row.update_id, error.message);
    }
  }
}

// Atomic content-based dedup hash: same user+type+amount+account+date within
// the same 1-minute bucket → same hash → UNIQUE constraint rejects at DB level.
// No TOCTOU race — the DB enforces uniqueness during INSERT, not via SELECT.
function txDedupHash(userId, type, amount, accountId, date) {
  const bucket = Math.floor(Date.now() / 60000);
  return `${userId}|${type}|${amount}|${accountId}|${date}|${bucket}`;
}

// ─────────────────────────────────────────────────────
// ENTRY POINT
// ─────────────────────────────────────────────────────
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return cors(new Response(null, { status: 204 }), request);
    try {
      if (request.method === "POST" && (url.pathname === "/webhook" || url.pathname === "/telegram-webhook")) {
        // Webhook secret verification (security guard — harus sebelum parse body)
        // FAIL-CLOSED: kalau secret belum diset, tolak — jangan lewati pemeriksaan.
        const secret = env.TELEGRAM_WEBHOOK_SECRET;
        if (!secret) {
          console.error("TELEGRAM_WEBHOOK_SECRET belum diatur — webhook ditolak.");
          return new Response("Unauthorized", { status: 403 });
        }
        const headerSecret = request.headers.get("X-Telegram-Bot-Api-Secret-Token");
        if (headerSecret !== secret) {
          return new Response("Unauthorized", { status: 403 });
        }

        const body = await readJsonBodyBounded(request); // parse body setelah auth check
        if (!validTelegramUpdateId(body?.update_id)) return new Response("Bad Request", { status: 400 });

        // ── Auto-ensure dedup infrastructure exists (lazy migration) ──
        await ensureSecuritySchema(env);
        await ensureDedup(env);

        // ── Deduplication: cegah triple insert dari Telegram webhook retry ──
        const updateId = body?.update_id;
        if (!await claimTelegramUpdate("consumer", updateId, body, env)) {
          return new Response("OK");
        }

        // Balas Telegram SEGERA sebelum processing dimulai (cegah timeout → retry)
        // ctx.waitUntil() memastikan handleTelegram tetap berjalan di background
        ctx.waitUntil(processTelegramUpdate("consumer", body, env));
        return new Response("OK");

      }
      // Admin bot webhook
      if (request.method === "POST" && url.pathname === "/admin-webhook") {
        // FAIL-CLOSED: sama seperti webhook utama.
        const secret = env.ADMIN_TELEGRAM_WEBHOOK_SECRET;
        if (!secret) {
          console.error("ADMIN_TELEGRAM_WEBHOOK_SECRET belum diatur — webhook admin ditolak.");
          return new Response("Unauthorized", { status: 403 });
        }
        const headerSecret = request.headers.get("X-Telegram-Bot-Api-Secret-Token");
        if (headerSecret !== secret) {
          return new Response("Unauthorized", { status: 403 });
        }
        const body = await readJsonBodyBounded(request);
        if (!validTelegramUpdateId(body?.update_id)) return new Response("Bad Request", { status: 400 });
        await ensureDedup(env);
        if (!await claimTelegramUpdate("admin", body?.update_id, body, env)) {
          return new Response("OK");
        }
        ctx.waitUntil(processTelegramUpdate("admin", body, env));
        return new Response("OK");
      }
      return cors(await routeAPI(request, url, env), request);
    } catch (e) {
      if (e?.status === 400 || e?.status === 413) {
        return cors(jsonRes({ error: e.message }, e.status), request);
      }
      console.error("Worker error:", e.message, e.stack);
      return cors(jsonRes({ error: "Terjadi kesalahan internal", request_id: crypto.randomUUID() }, 500), request);
    }
  },
  async scheduled(event, env, ctx) {
    ctx.waitUntil(Promise.all([cleanupOldData(env), retryFailedBotUpdates(env), reconcilePendingPayments(env)]));
  }
};

// ─────────────────────────────────────────────────────
// REST API ROUTER
// ─────────────────────────────────────────────────────
async function routeAPI(req, url, env) {
  const m    = req.method;
  const path = url.pathname;

  if (!env.JWT_SECRET) return jsonRes({ error: "Server misconfigured" }, 500);
  const contentLength = Number(req.headers.get("Content-Length") || 0);
  if (contentLength > MAX_JSON_BODY_BYTES && path !== "/scan-receipt") {
    return jsonRes({ error: "Payload terlalu besar" }, 413);
  }
  await ensureSecuritySchema(env);

  if (path === "/" && m === "GET") return jsonRes({ status: "ok", version: "3.5.0" });
  if (path === "/setup") {
    const secret = req.headers.get("X-Setup-Secret");
    if (!secret || secret !== env.SETUP_SECRET) return jsonRes({ error: "Not found" }, 404);
    return setupDatabase(env);
  }

  // ── ADMIN PANEL ROUTES ──
  if ((path === "/admin/auth/otp-request" || path === "/admin/auth/otp-verify") && m === "POST") {
    const ip = req.headers.get("CF-Connecting-IP") || req.headers.get("X-Forwarded-For") || "unknown";
    if (!await checkRateLimit(`admin-auth:${ip}`, env, 8, 15 * 60 * 1000)) {
      return jsonRes({ error: "Terlalu banyak percobaan. Coba lagi dalam 15 menit." }, 429);
    }
    if (path === "/admin/auth/otp-request") return handleAdminOtpRequest(await readJsonBodyBounded(req), env);
    if (path === "/admin/auth/otp-verify") return handleAdminOtpVerify(await readJsonBodyBounded(req), ip, env);
  }

  if (path.startsWith("/admin/")) {
    const adminPayload = await verifyAdminJWT(req, env);
    if (!adminPayload) return jsonRes({ error: "Autentikasi admin diperlukan" }, 401);
    const adminId = adminPayload.sub;

    if (path === "/admin/auth/me" && m === "GET") {
      return jsonRes({ telegram_id: adminId });
    }
    if (path === "/admin/stats" && m === "GET") {
      return handleAdminStats(adminId, env);
    }
    if (path === "/admin/users" && m === "GET") {
      return handleAdminGetUsers(adminId, url, env);
    }
    if (path === "/admin/pricing" && m === "GET") {
      return handleAdminGetPricing(adminId, env);
    }
    if (path === "/admin/pricing" && m === "POST") {
      return handleAdminUpdatePricing(adminId, await readJsonBodyBounded(req), env);
    }
    if (path === "/admin/coupons" && m === "GET") {
      return handleAdminGetCoupons(adminId, env);
    }
    if (path === "/admin/coupons" && m === "POST") {
      return handleAdminCreateCoupon(adminId, await readJsonBodyBounded(req), env);
    }
    if (path === "/admin/audit-logs" && m === "GET") {
      return handleAdminGetAuditLogs(adminId, url, env);
    }

    // Dynamic routes
    const userMatch = path.match(/^\/admin\/users\/([^/]+)$/);
    if (userMatch && m === "GET") {
      return handleAdminGetUserDetail(adminId, userMatch[1], env);
    }
    if (userMatch && m === "DELETE") {
      return handleAdminDeleteUser(adminId, userMatch[1], env);
    }

    const userBanMatch = path.match(/^\/admin\/users\/([^/]+)\/ban$/);
    if (userBanMatch && m === "POST") {
      return handleAdminBanUser(adminId, userBanMatch[1], env);
    }

    const userUnbanMatch = path.match(/^\/admin\/users\/([^/]+)\/unban$/);
    if (userUnbanMatch && m === "POST") {
      return handleAdminUnbanUser(adminId, userUnbanMatch[1], env);
    }

    const userResetPwMatch = path.match(/^\/admin\/users\/([^/]+)\/reset-password$/);
    if (userResetPwMatch && m === "POST") {
      return handleAdminResetPassword(adminId, userResetPwMatch[1], await readJsonBodyBounded(req), env);
    }

    const userExtendMatch = path.match(/^\/admin\/users\/([^/]+)\/extend$/);
    if (userExtendMatch && m === "POST") {
      return handleAdminExtendUser(adminId, userExtendMatch[1], await readJsonBodyBounded(req), env);
    }

    const userRevokeMatch = path.match(/^\/admin\/users\/([^/]+)\/revoke$/);
    if (userRevokeMatch && m === "POST") {
      return handleAdminRevokeUser(adminId, userRevokeMatch[1], env);
    }

    const couponDeleteMatch = path.match(/^\/admin\/coupons\/([^/]+)$/);
    if (couponDeleteMatch && m === "DELETE") {
      return handleAdminDeleteCoupon(adminId, couponDeleteMatch[1], env);
    }

    return jsonRes({ error: "Endpoint admin tidak ditemukan" }, 404);
  }

  // Auth routes (public — no token needed)
  if ((path === "/auth/login" || path === "/auth/register" || path === "/auth/forgot-password" || path === "/auth/reset-password") && m === "POST") {
    const ip = req.headers.get("CF-Connecting-IP") || req.headers.get("X-Forwarded-For") || "unknown";
    if (!await checkRateLimit(`user-auth:${ip}`, env, 10, 15 * 60 * 1000)) {
      return jsonRes({ error: "Terlalu banyak percobaan. Coba lagi dalam 15 menit." }, 429);
    }
  }
  if (path === "/auth/register" && m === "POST") return handleRegister(await readJsonBodyBounded(req), env);
  if (path === "/auth/login"    && m === "POST") return handleLogin(await readJsonBodyBounded(req), env);
  if (path === "/auth/me"       && m === "GET")  return handleMe(req, env);
  if (path === "/auth/refresh"  && m === "POST") return handleRefreshToken(req, env);
  if (path === "/auth/link-telegram" && m === "POST") return jsonRes({ error: "Endpoint lama dinonaktifkan. Gunakan pairing code." }, 410);
  if (path === "/auth/telegram-link/start" && m === "POST") return handleStartTelegramLink(req, env);
  if (path === "/auth/delete-account" && m === "POST") return handleDeleteAccount(req, await readJsonBodyBounded(req), env);
  if (path === "/auth/forgot-password" && m === "POST") return handleForgotPassword(req, await readJsonBodyBounded(req), env);
  if (path === "/auth/reset-password" && m === "POST") return handleResetPassword(req, await readJsonBodyBounded(req), env);

  // Public pricing endpoint
  if (path === "/pricing" && m === "GET") {
    const prices = await env.DB.prepare("SELECT id, duration_days, price, label FROM pricing WHERE active = 1 ORDER BY duration_days ASC").all();
    return jsonRes(prices.results || []);
  }

  // KlikQRIS MY PG webhook. Signature and provider status are both verified.
  if (path === "/payment/klikqris-webhook" && m === "POST") {
    return handleKlikQrisWebhook(await readJsonBodyBounded(req), env);
  }

  // Resolve user_id: prefer JWT token, fallback to query param (secured with secret header)
  let uid = null;
  const token = extractToken(req);
  if (token) {
    const auth = await authenticateUserToken(req, env);
    if (!auth) return jsonRes({ error: "Token tidak valid, dicabut, atau expired" }, 401);
    uid = auth.user.id;
  } else {
    const internalSecret = req.headers.get("X-Internal-Secret");
    if (internalSecret && env.INTERNAL_SECRET && internalSecret === env.INTERNAL_SECRET) {
      uid = url.searchParams.get("user_id");
    }
  }

  // Usage status
  if (path === "/usage/status" && m === "GET") {
    if (!uid) return jsonRes({ error: "Autentikasi diperlukan" }, 401);
    return jsonRes(await getUsageStatus(uid, env));
  }

  // Usage track (for client-side tracked features like report_view)
  const usageTrackM = path.match(/^\/usage\/track\/([^/]+)$/);
  if (usageTrackM && m === "GET") {
    if (!uid) return jsonRes({ error: "Autentikasi diperlukan" }, 401);
    const feature = usageTrackM[1];
    if (!LIMITED_FEATURES.includes(feature)) return jsonRes({ error: "Feature tidak valid" }, 400);
    const usage = await checkAndTrackUsage(uid, feature, env);
    if (!usage.allowed) {
      if (usage.reason === 'banned') return jsonRes({ error: "Akun diblokir" }, 403);
      return jsonRes({ error: "Batas harian tercapai. Upgrade ke Premium untuk akses unlimited.", upgrade: true, used: usage.used, limit: usage.limit }, 429);
    }
    return jsonRes({ used: usage.used, limit: usage.limit });
  }

  // Public pricing (no auth required)
  if (path === "/pricing/public" && m === "GET") {
    try {
      const prices = await env.DB.prepare("SELECT id, duration_days, price, original_price, label FROM pricing WHERE active = 1 ORDER BY duration_days ASC").all();
      return jsonRes({ pricing: (prices.results || []).map(p => ({ ...p, original_price: p.original_price || null })) });
    } catch (e) {
      return jsonRes({ pricing: [] });
    }
  }

  // Validate coupon
  if (path === "/coupon/validate" && m === "POST") {
    if (!uid) return jsonRes({ error: "Autentikasi diperlukan" }, 401);
    const { code, pricing_id } = await readJsonBodyBounded(req);
    if (!code) return jsonRes({ error: "Kode kupon diperlukan" }, 400);
    try {
      const coupon = await env.DB.prepare(
        "SELECT * FROM coupons WHERE code = ? AND active = 1"
      ).bind(code.toUpperCase().trim()).first();
      if (!coupon) return jsonRes({ error: "Kupon tidak valid atau sudah expired" }, 404);
      if (coupon.max_uses > 0 && coupon.used_count >= coupon.max_uses) return jsonRes({ error: "Kupon sudah habis" }, 410);
      if (coupon.expired_at && new Date(coupon.expired_at) < new Date()) return jsonRes({ error: "Kupon sudah expired" }, 410);
      let discount_amount = 0;
      if (pricing_id) {
        const pr = await env.DB.prepare("SELECT price FROM pricing WHERE id = ?").bind(pricing_id).first();
        if (pr) {
          if (coupon.type === 'percent') discount_amount = Math.floor(pr.price * coupon.value / 100);
          else discount_amount = coupon.value;
          if (discount_amount > pr.price) discount_amount = pr.price;
        }
      }
      return jsonRes({ valid: true, code: coupon.code, type: coupon.type, value: coupon.value, discount_amount, description: coupon.description });
    } catch (e) {
      return jsonRes({ error: "Gagal validasi kupon" }, 500);
    }
  }

  // Create a KlikQRIS MY PG checkout. Amount and coupon are recalculated on the
  // server so the browser cannot choose its own price.
  if (path === "/payment/request" && m === "POST") {
    if (!uid) return jsonRes({ error: "Autentikasi diperlukan" }, 401);
    const body = await readJsonBodyBounded(req);
    const result = await createKlikQrisCheckout(uid, body.pricing_id, body.coupon_code, env, {
      reusePending: true
    });
    if (!result.ok) return jsonRes({ error: result.error }, result.status);
    return jsonRes(result);
  }

  // Web AI proxy (usage limited)
  if (path === "/ai-chat" && m === "POST") {
    if (!uid) return jsonRes({ error: "Autentikasi diperlukan" }, 401);
    const usage = await checkAndTrackUsage(uid, 'ai_chat', env);
    if (!usage.allowed) {
      if (usage.reason === 'banned') return jsonRes({ error: "Akun diblokir" }, 403);
      return jsonRes({ error: "Batas harian AI Chat tercapai. Upgrade ke Premium untuk akses unlimited.", upgrade: true, used: usage.used, limit: usage.limit }, 429);
    }
    return handleAiChat(uid, await readJsonBodyBounded(req), env);
  }
  if (path === "/scan-receipt" && m === "POST") {
    if (!uid) return jsonRes({ error: "Autentikasi diperlukan" }, 401);
    const usage = await checkAndTrackUsage(uid, 'scan_receipt', env);
    if (!usage.allowed) {
      if (usage.reason === 'banned') return jsonRes({ error: "Akun diblokir" }, 403);
      return jsonRes({ error: "Batas harian Scan Struk tercapai. Upgrade ke Premium untuk akses unlimited.", upgrade: true, used: usage.used, limit: usage.limit }, 429);
    }
    const scanJsonLimit = Math.ceil(MAX_RECEIPT_BYTES * 4 / 3) + 100_000;
    return handleScanReceipt(uid, await readJsonBodyBounded(req, scanJsonLimit), env);
  }

  if (!uid) return jsonRes({ error: "Autentikasi diperlukan" }, 401);

  // Blokir user yang di-ban di SEMUA endpoint data, bukan hanya fitur berkuota.
  // Tanpa ini, user yang di-ban tetap bisa CRUD memakai token lama sampai 7 hari.
  {
    const banCheck = await getUserPlan(uid, env);
    if (banCheck.banned) {
      return jsonRes({ error: "Akun Anda telah diblokir. Hubungi admin." }, 403);
    }
  }

  // accounts
  if (path === "/accounts") {
    if (m === "GET")  return getAccounts(uid, env);
    if (m === "POST") return createAccount(uid, await readJsonBodyBounded(req), env);
    if (m === "DELETE") return deleteAllAccounts(uid, env);
  }
  const accM = path.match(/^\/accounts\/([^/]+)$/);
  if (accM) {
    if (m === "PATCH")  return updateAccount(uid, accM[1], await readJsonBodyBounded(req), env);
    if (m === "DELETE") return deleteAccount(uid, accM[1], env);
  }

  // categories
  if (path === "/categories") {
    if (m === "GET")  return getCategories(uid, env);
    if (m === "POST") return createCategory(uid, await readJsonBodyBounded(req), env);
    if (m === "DELETE") return deleteAllCategories(uid, env);
  }
  const catM = path.match(/^\/categories\/([^/]+)$/);
  if (catM && m === "DELETE") return deleteCategory(uid, catM[1], env);

  // transactions
  if (path === "/transactions") {
    if (m === "GET")  return getTransactions(uid, url, env);
    if (m === "POST") return createTransaction(uid, await readJsonBodyBounded(req), env);
    if (m === "DELETE") return deleteAllTransactions(uid, env);
  }
  const txM = path.match(/^\/transactions\/([^/]+)$/);
  if (txM) {
    if (m === "PATCH")  return updateTransaction(uid, txM[1], await readJsonBodyBounded(req), env);
    if (m === "DELETE") return deleteTransaction(uid, txM[1], env);
  }

  // budgets
  if (path === "/budgets") {
    if (m === "GET")  return getBudgets(uid, env);
    if (m === "POST") return createBudget(uid, await readJsonBodyBounded(req), env);
  }
  const budM = path.match(/^\/budgets\/([^/]+)$/);
  if (budM && m === "DELETE") return deleteBudget(uid, budM[1], env);

  // goals
  if (path === "/goals") {
    if (m === "GET")  return getGoals(uid, env);
    if (m === "POST") return createGoal(uid, await readJsonBodyBounded(req), env);
  }
  const goalM = path.match(/^\/goals\/([^/]+)$/);
  if (goalM) {
    if (m === "PATCH")  return updateGoal(uid, goalM[1], await readJsonBodyBounded(req), env);
    if (m === "DELETE") return deleteGoal(uid, goalM[1], env);
  }

  // bills
  if (path === "/bills") {
    if (m === "GET")  return getBills(uid, env);
    if (m === "POST") return createBill(uid, await readJsonBodyBounded(req), env);
  }
  const billM = path.match(/^\/bills\/([^/]+)$/);
  if (billM) {
    if (m === "PATCH")  return updateBill(uid, billM[1], await readJsonBodyBounded(req), env);
    if (m === "DELETE") return deleteBill(uid, billM[1], env);
  }

  // transaction-items
  if (path === "/transaction-items" && m === "GET") {
    const txId = url.searchParams.get("transaction_id");
    if (!txId) return jsonRes({ error: "transaction_id diperlukan" }, 400);
    return getTransactionItems(uid, txId, env);
  }

  // piutang
  if (path === "/piutang") {
    if (m === "GET")  return getPiutang(uid, env);
    if (m === "POST") return createPiutang(uid, await readJsonBodyBounded(req), env);
  }
  const ptgM = path.match(/^\/piutang\/([^/]+)$/);
  if (ptgM) {
    if (m === "PATCH")  return updatePiutang(uid, ptgM[1], await readJsonBodyBounded(req), env);
    if (m === "DELETE") return deletePiutang(uid, ptgM[1], env);
  }

  return jsonRes({ error: "Not found" }, 404);
}

// ─────────────────────────────────────────────────────
// TELEGRAM DISPATCHER
// ─────────────────────────────────────────────────────
function requirePrivateTelegramChat(chat, fromId) {
  return chat?.type === "private" && String(chat.id) === String(fromId);
}

async function handleTelegram(body, env, updateId) {
  const chatId = body?.callback_query?.message?.chat?.id || body?.message?.chat?.id;
  try {
    if (body.callback_query) { await handleCallback(body.callback_query, env, updateId); return; }

    const msg = body?.message;
    if (!msg) return;
    if (!requirePrivateTelegramChat(msg.chat, msg.from?.id)) return;

    const rawTgId = String(msg.from.id);
    const userId = await resolveUserByTelegramId(rawTgId, env);
    const text   = (msg.text || "").trim();

    // Foto → scan struk
    if (msg.photo) { await handlePhoto(msg, chatId, userId, env, updateId); return; }
    if (!text) return;

    // Perintah — hapus history bot sebelumnya agar chat bersih
    if (text.startsWith("/") || !msg.reply_to_message) {
      await clearBotHistory(chatId, env);
    }

    if (text === "/start" || text === "/menu") { await sendMenu(chatId, userId, env); return; }
    if (text === "/myid")    { await sendMyId(chatId, rawTgId, msg.from.first_name, env); return; }
    if (text.toLowerCase().startsWith("/link ")) {
      const result = await completeTelegramLink(rawTgId, text.slice(6), env);
      const mid = await tgSend(chatId, result.ok ? `✅ *${result.message}*` : `❌ ${result.message}`, env);
      await trackBotMsg(chatId, mid, env);
      return;
    }
    if (text === "/saldo")   { await sendSaldo(chatId, userId, env); return; }
    if (text === "/riwayat") { await sendRiwayat(chatId, userId, env); return; }
    if (text === "/tagihan") { await sendTagihan(chatId, userId, env); return; }
    if (/^\/(?:upgrade|premium)(?:@\w+)?$/i.test(text)) {
      await sendUpgradeMenu(chatId, userId, env);
      return;
    }
    if (text === "/batal")   { await clearPendingText(chatId, env); const mid = await tgSend(chatId, "❌ Dibatalkan.", env); await trackBotMsg(chatId, mid, env); return; }

    // Reply ke pesan bot → koreksi transaksi
    if (msg.reply_to_message?.from?.is_bot) {
      await handleCorrection(chatId, userId, msg.reply_to_message.text || "", text, env);
      return;
    }

    // Teks bebas → catat transaksi
    if (!text.startsWith("/")) { await handleFreeText(chatId, userId, text, env, updateId); return; }

    await sendMenu(chatId, userId, env);
  } catch (e) {
    console.error("handleTelegram error:", e.message, e.stack);
    if (chatId) {
      await tgSend(chatId, "⚠️ *Oops, ada gangguan teknis.*\n\nTim kami sudah diberitahu. Silakan coba lagi atau ketik /menu.", env).catch(() => {});
    }
  }
}

// ─────────────────────────────────────────────────────
// CALLBACK HANDLER
// ─────────────────────────────────────────────────────
async function handleCallback(cb, env, updateId) {
  if (!requirePrivateTelegramChat(cb.message?.chat, cb.from?.id)) return;
  const chatId = cb.message.chat.id;
  const rawTgId = String(cb.from.id);
  const userId = await resolveUserByTelegramId(rawTgId, env);
  const data   = cb.data;

  const TOKEN = env.TELEGRAM_TOKEN || env.TELEGRAM_BOT_TOKEN;
  await fetch(`${TG(TOKEN)}/answerCallbackQuery`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ callback_query_id: cb.id }),
  });

  // Hapus history bot sebelumnya untuk navigasi utama
  if (["menu","saldo","riwayat","tagihan","myid","upgrade"].includes(data)) {
    await clearBotHistory(chatId, env);
  }

  if (data === "menu")    { await sendMenu(chatId, userId, env); return; }
  if (data === "saldo")   { await sendSaldo(chatId, userId, env); return; }
  if (data === "riwayat") { await sendRiwayat(chatId, userId, env); return; }
  if (data === "tagihan") { await sendTagihan(chatId, userId, env); return; }
  if (data === "myid")    { await sendMyId(chatId, rawTgId, cb.from.first_name, env); return; }
  if (data === "upgrade") { await sendUpgradeMenu(chatId, userId, env); return; }

  if (data.startsWith("buy:")) {
    if (!userId) {
      const mid = await tgSend(
        chatId,
        "🔗 *Akun Telegram belum terhubung.*\n\nHubungkan akun Laksa terlebih dahulu dari Pengaturan aplikasi, lalu coba /upgrade lagi.",
        env,
        [[{ text: "🌐 Buka LaksaApp", url: "https://laksaapp.my.id/" }]]
      );
      await trackBotMsg(chatId, mid, env);
      return;
    }
    const pricingId = data.slice(4);
    const result = await createKlikQrisCheckout(userId, pricingId, null, env, {
      reusePending: true
    });
    if (!result.ok) {
      const mid = await tgSend(chatId, `❌ ${result.error}`, env, [[{ text: "↩️ Pilih Paket", callback_data: "upgrade" }]]);
      await trackBotMsg(chatId, mid, env);
      return;
    }
    const reusedText = result.reused ? "\n_Order pending sebelumnya digunakan kembali._" : "";
    const mid = await tgSend(
      chatId,
      `💳 *Checkout KlikQRIS siap*\n\n*Order:* \`${result.order_id}\`\n*Total:* Rp ${Number(result.amount).toLocaleString("id-ID")}${reusedText}\n\nPremium aktif otomatis setelah pembayaran terverifikasi. Jangan transfer di luar halaman KlikQRIS.`,
      env,
      [
        [{ text: "💳 Bayar via KlikQRIS", url: result.checkout_url }],
        [{ text: "↩️ Pilih Paket", callback_data: "upgrade" }]
      ]
    );
    await trackBotMsg(chatId, mid, env);
    return;
  }

  // Pilih rekening (fallback keyboard)
  if (data.startsWith("acc:")) { await handleAccPick(chatId, userId, data.slice(4), env); return; }

  // Edit transaksi via tombol
  if (data.startsWith("del:"))      { await deleteTx(chatId, userId, data.slice(4), env); return; }
  if (data.startsWith("del_transfer:")) {
    const idOut = data.slice(13);
    const txOut = await env.DB.prepare(`SELECT * FROM transactions WHERE id = ? AND user_id = ?`).bind(idOut, userId).first();
    const txIn  = txOut
      ? await env.DB.prepare(`SELECT * FROM transactions WHERE user_id = ? AND type = 'income' AND raw_text = ? AND date = ? AND amount = ? AND id != ? ORDER BY created_at DESC LIMIT 1`)
          .bind(userId, txOut.raw_text, txOut.date, txOut.amount, idOut).first()
      : null;
    await deleteTx(chatId, userId, idOut, env);
    if (txIn) {
      await adjustBalance(txIn.account_id, txIn.type, txIn.amount, -1, env, userId);
      await env.DB.prepare(`DELETE FROM transactions WHERE id = ? AND user_id = ?`).bind(txIn.id, userId).run();
    }
    await tgSend(chatId, "🔄 *Transfer dibatalkan dan saldo dikembalikan.*", env,
      [[{ text: "🏠 Menu", callback_data: "menu" }]]
    );
    return;
  }


  // Handle Interactive Photo Scan callbacks
  if (data.startsWith("pay:")) {
    const parts = data.split(":");
    const pendingId = parts[1];
    const accountId = parts[2];
    await handleReceiptKeyboardConfirm(chatId, userId, cb.message.message_id, pendingId, accountId, env);
  } else if (data.startsWith("cancel:")) {
    const pendingId = data.split(":")[1];
    const draft = await env.DB.prepare("SELECT note FROM pending_scans WHERE id = ? AND user_id = ?").bind(pendingId, userId).first();
    await env.DB.prepare("DELETE FROM pending_scans WHERE id = ? AND user_id = ?").bind(pendingId, userId).run();
    // Hapus pesan rincian struk jika ada
    if (draft) {
      const { rincianMsgId } = parseDraftNote(draft.note);
      if (rincianMsgId) await deleteTgMessage(chatId, rincianMsgId, env);
    }
    await editTgMessage(chatId, cb.message.message_id, "❌ *Pencatatan struk dibatalkan.*", env);
  }
}

// ─────────────────────────────────────────────────────
// TEKS BEBAS → CATAT TRANSAKSI (FULLY AUTO)
// ─────────────────────────────────────────────────────
async function handleFreeText(chatId, userId, text, env, updateId) {
  if (!likelyTx(text)) { await sendMenu(chatId, userId, env); return; }

  // Freemium limit check
  const usage = await checkTelegramUsage(userId, 'ai_chat', env);
  if (!usage.allowed) {
    if (usage.reason === 'banned') { await tgSend(chatId, "🚫 Akun Anda diblokir.", env); return; }
    await tgSend(chatId, `⚡ *Batas harian tercapai*\n\nUpgrade ke *Premium* untuk akses unlimited semua fitur.\n\n🚀 Upgrade: https://laksaapp.my.id/#upgrade`, env);
    return;
  }

  const processingMid = await tgSend(chatId, "⏳ Memproses...", env);
  await trackBotMsg(chatId, processingMid, env);

  // Stable idempotency key derived from Telegram update_id (survives retries)
  const idemKey = updateId ? `tg_ft_${updateId}` : crypto.randomUUID();

  // 1. Parse dengan AI (Check user plan for Premium AI Routing)
  const u = await env.DB.prepare("SELECT plan FROM users WHERE id = ?").bind(userId).first();
  const userPlan = u?.plan || 'free';
  const parsed = await parseWithGroq(text, env, userPlan);
  if (!parsed || parsed._error) {
    await tgSend(chatId,
      `❌ Gagal memproses: ${parsed?._error || "unknown"}\n\nCoba tulis ulang, contoh:\n_beli bakso 15rb pakai mandiri_`,
      env
    );
    return;
  }

  // Validasi amount
  if (parsed.amount === undefined || parsed.amount === null || isNaN(parsed.amount) || parsed.amount < 0) {
    await tgSend(chatId,
      `❌ Jumlah tidak terdeteksi.\n\nCoba tulis ulang dengan nominal yang jelas, contoh:\n_beli bakso *15rb* pakai mandiri_`,
      env
    );
    return;
  }

  // 2. Pastikan minimal ada 1 rekening di D1
  let accs = await dbAccounts(userId, env);
  if (!accs.length) {
    const accName = parsed.account_name || "Tunai";
    const accId   = randomId();
    await env.DB.prepare(`INSERT INTO accounts (id, user_id, name, balance, color) VALUES (?, ?, ?, 0, NULL)`)
      .bind(accId, userId, accName).run();
    await seedCategories(userId, env);
    accs = await dbAccounts(userId, env);
    await tgSend(chatId, `✅ Rekening *${accName}* dibuat otomatis.`, env);
  }

  // Attach idempotency key to parsed object
  parsed._idempotency_key = idemKey;

  // 3a. Transfer antar rekening — branch terpisah
  if (parsed.type === "transfer") {
    await handleTransfer(chatId, userId, parsed, accs, text, env);
    return;
  }

  // 3b. Resolve rekening & kategori (income/expense)
  const acc = resolveAccount(parsed.account_name, accs);
  const cats = await dbCategories(userId, env);
  const filteredCats = cats.filter(c => c.type === parsed.type || c.type === "both");
  const cat = resolveCategory(parsed.category_name, parsed.note, parsed.store, parsed.type, filteredCats);

  // 4. Rekening ketemu → langsung simpan
  if (acc) {
    await saveTx(chatId, userId, parsed, acc, cat, text, env);
    return;
  }

  // 5. Rekening tidak ketemu → fallback keyboard (persistent via D1)
  await savePendingText(chatId, parsed, text, cat, env);
  await tgSend(chatId,
    `📋 *${fmtType(parsed.type)}: Rp${fmt(parsed.amount)}*\n📝 ${parsed.note || "-"}\n\n*Pilih rekening:*`,
    env,
    chunks(accs.map(a => ({ text: a.name, callback_data: `acc:${a.id}` })), 2)
  );
}

async function handleAccPick(chatId, userId, accId, env) {
  const pending = await loadPendingText(chatId, env);
  if (!pending) { await tgSend(chatId, "⏰ *Sesi input habis.*\n\nKirim ulang transaksimu, ya! Ketik langsung atau kirim /menu.", env); return; }
  const acc = await env.DB.prepare(`SELECT * FROM accounts WHERE id = ? AND user_id = ?`).bind(accId, userId).first();
  if (!acc) { await tgSend(chatId, "⚠️ *Rekening tidak ditemukan.*\n\nPastikan nama rekening sudah benar. Ketik /saldo untuk lihat daftar rekeningmu.", env); return; }

  // Gating check: attempt to delete the pending text first to prevent concurrent duplicate inserts
  const delRes = await env.DB.prepare("DELETE FROM pending_texts WHERE chat_id = ?").bind(String(chatId)).run().catch(() => null);
  if (!delRes || delRes.meta.changes === 0) {
    return;
  }

  const { parsed, rawText, cat } = pending;
  await saveTx(chatId, userId, parsed, acc, cat, rawText, env);
}

async function saveTx(chatId, userId, parsed, acc, cat, rawText, env) {
  const id   = randomId();
  const date = parsed.date || todayStr();
  const idemKey = parsed._idempotency_key || crypto.randomUUID();
  const dedupHash = txDedupHash(userId, parsed.type, parsed.amount, acc.id, date);

  const result = await env.DB.prepare(`
    INSERT OR IGNORE INTO transactions (id, user_id, date, type, amount, note, store, account_id, category_id, raw_text, source, idempotency_key, dedup_hash)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'telegram', ?, ?)
  `).bind(
    id, userId, date, parsed.type, parsed.amount,
    parsed.note || "", parsed.store || null,
    acc.id, cat?.id || null, rawText, idemKey, dedupHash
  ).run();

  const changes = result.meta?.changes ?? -1;

  if (changes <= 0) return;
  await adjustBalance(acc.id, parsed.type, parsed.amount, +1, env, userId);

  const tx    = await getTxFull(id, env);
  const emoji = parsed.type === "income" ? "💚" : "🔴";

  const mid = await tgSend(chatId,
    `${emoji} *Tersimpan!*\n\n${formatTx(tx)}\n\n` +
    `_✏️ Reply pesan ini untuk koreksi_\n` +
    `_Contoh: jumlah 5.5jt / kategori gaji / rekening mandiri_\n\n` +
    `ID: \`${id}\``,
    env,
    [[
      { text: "🗑️ Hapus",     callback_data: `del:${id}`       },
      { text: "🏠 Menu",       callback_data: "menu"            },
    ]]
  );
  await trackBotMsg(chatId, mid, env);
}

// ─────────────────────────────────────────────────────
// TRANSFER ANTAR REKENING
// ─────────────────────────────────────────────────────
async function handleTransfer(chatId, userId, parsed, accs, rawText, env) {
  const fromAcc = resolveAccount(parsed.from_account, accs);
  const toAcc   = resolveAccount(parsed.to_account, accs);

  if (!fromAcc || !toAcc) {
    const missing = !fromAcc && !toAcc ? "rekening asal dan tujuan"
                  : !fromAcc ? `rekening asal (*${parsed.from_account || "?"}*)`
                  : `rekening tujuan (*${parsed.to_account || "?"}*)`;
    await tgSend(chatId,
      `💸 *Transfer Rp${fmt(parsed.amount)}*\n\n❌ ${missing} tidak ditemukan di daftar rekeningmu.\n\n` +
      `Rekening tersedia:\n${accs.map(a => `• ${a.name}`).join("\n")}\n\n` +
      `Coba tulis ulang dengan nama rekening yang tepat, contoh:\n_pindah 500rb dari mandiri ke seabank_`,
      env
    );
    return;
  }

  if (fromAcc.id === toAcc.id) {
    await tgSend(chatId, "⚠️ *Rekening asal dan tujuan sama.*\n\nPilih dua rekening yang berbeda untuk transfer.", env);
    return;
  }

  await saveTransfer(chatId, userId, parsed, fromAcc, toAcc, rawText, env);
}

async function saveTransfer(chatId, userId, parsed, fromAcc, toAcc, rawText, env) {
  const date    = parsed.date || todayStr();
  const note    = parsed.note || `Transfer ${fromAcc.name} → ${toAcc.name}`;
  const idOut   = randomId();
  const idIn    = randomId();
  const idemKey = parsed._idempotency_key || crypto.randomUUID();
  const dedupHashOut = txDedupHash(userId, 'expense', parsed.amount, fromAcc.id, date);
  const dedupHashIn  = txDedupHash(userId, 'income',  parsed.amount, toAcc.id,   date);

  const transferGroupId = crypto.randomUUID();
  const amount = Number(parsed.amount);
  if (!Number.isSafeInteger(amount) || amount < 1 || amount > FINANCIAL_MAX_AMOUNT) {
    throw new Error("Nominal transfer tidak valid");
  }
  await env.DB.batch([
    env.DB.prepare(`
      INSERT INTO transactions (id, user_id, date, type, amount, note, store, account_id, category_id, raw_text, source, idempotency_key, dedup_hash, transfer_group_id)
      VALUES (?, ?, ?, 'expense', ?, ?, null, ?, null, ?, 'telegram', ?, ?, ?)
    `).bind(idOut, userId, date, amount, note, fromAcc.id, rawText, idemKey, dedupHashOut, transferGroupId),
    env.DB.prepare(`
      INSERT INTO transactions (id, user_id, date, type, amount, note, store, account_id, category_id, raw_text, source, idempotency_key, dedup_hash, transfer_group_id)
      VALUES (?, ?, ?, 'income', ?, ?, null, ?, null, ?, 'telegram', ?, ?, ?)
    `).bind(idIn, userId, date, amount, note, toAcc.id, rawText, idemKey + '_in', dedupHashIn, transferGroupId),
    env.DB.prepare("UPDATE accounts SET balance = balance - ? WHERE id = ? AND user_id = ?")
      .bind(amount, fromAcc.id, userId),
    env.DB.prepare("UPDATE accounts SET balance = balance + ? WHERE id = ? AND user_id = ?")
      .bind(amount, toAcc.id, userId)
  ]);

  await tgSend(chatId,
    `🔄 *Transfer Tersimpan!*\n\n` +
    `💸 *Rp${fmt(parsed.amount)}*\n` +
    `📤 Dari: *${fromAcc.name}*\n` +
    `📥 Ke: *${toAcc.name}*\n` +
    `📅 ${fmtDate(date)}`,
    env,
    [[
      { text: "🗑️ Batal Transfer", callback_data: `del_transfer:${idOut}` },
      { text: "🏠 Menu",           callback_data: "menu"                  },
    ]]
  );
}

// ─────────────────────────────────────────────────────
// FOTO → INTERACTIVE OCR STRUK
// ─────────────────────────────────────────────────────
async function handlePhoto(msg, chatId, userId, env, updateId) {
  // Freemium limit check
  const usage = await checkTelegramUsage(userId, 'scan_receipt', env);
  if (!usage.allowed) {
    if (usage.reason === 'banned') { await tgSend(chatId, "🚫 Akun Anda diblokir.", env); return; }
    await tgSend(chatId, `⚡ *Batas harian tercapai*\n\nUpgrade ke *Premium* untuk akses unlimited semua fitur.\n\n🚀 Upgrade: https://laksaapp.my.id/#upgrade`, env);
    return;
  }

  const TOKEN = env.TELEGRAM_TOKEN || env.TELEGRAM_BOT_TOKEN;
  const caption = (msg.caption || "").trim().toLowerCase();
  await tgSend(chatId, "📸 *Membaca struk belanjaan Anda...*", env);

  try {
    const fileId  = msg.photo[msg.photo.length - 1].file_id;
    const fileRes = await fetch(`${TG(TOKEN)}/getFile?file_id=${fileId}`);
    const fd      = await fileRes.json();
    if (!fd.ok) { await tgSend(chatId, "⚠️ *Gagal mengambil foto.*\n\nCoba kirim ulang foto struk dengan kualitas yang lebih baik.", env); return; }

    const fileUrl = `https://api.telegram.org/file/bot${TOKEN}/${fd.result.file_path}`;
    const imgRes  = await Promise.race([
      fetch(fileUrl),
      new Promise((_, r) => setTimeout(() => r(new Error("timeout")), 15000)),
    ]).catch(() => ({ ok: false }));

    if (!imgRes.ok) { await tgSend(chatId, "⚠️ *Gagal memproses foto.*\n\nCoba kirim ulang foto struk. Pastikan foto jelas dan tidak buram.", env); return; }

    const base64 = bufToBase64(await imgRes.arrayBuffer());
    const u = await env.DB.prepare("SELECT plan FROM users WHERE id = ?").bind(userId).first();
    const userPlan = u?.plan || 'free';
    const result = await ocrReceipt(base64, "image/jpeg", env, userPlan);

    if (result._error) {
      await tgSend(chatId,
        `❌ Gagal baca struk: ${result._error}\n\n• Pastikan foto terang & fokus\n• Atau ketik manual: _beli di alfamart 45rb_`,
        env
      );
      return;
    }

    let accs = await dbAccounts(userId, env);
    if (!accs.length) {
      const accId = randomId();
      await env.DB.prepare(`INSERT INTO accounts (id, user_id, name, balance, color) VALUES (?, ?, ?, 0, NULL)`)
        .bind(accId, userId, "Tunai").run();
      await seedCategories(userId, env);
      accs = await dbAccounts(userId, env);
    }

    // ── DETEKSI TOP-UP / ISI SALDO (auto income) ──
    const topupPattern = /top\s*-?\s*up|isi\s+saldo|isi\s+ulang|pembayaran\s+(gopay|ovo|dana|shopeepay|linkaja)/i;
    const ewalletPattern = /gopay|ovo|dana|shopeepay|linkaja|grabpay/i;
    const itemsText = (result.items || []).map(i => i.name).join(" ");
    const scanText = `${result.store || ""} ${itemsText} ${result.note || ""}`;
    const isTopup = topupPattern.test(scanText);

    if (isTopup) {
      const ewalletMatch = scanText.match(ewalletPattern);
      const ewalletName = ewalletMatch ? ewalletMatch[0].toLowerCase() : null;
      let targetAcc = ewalletName ? resolveAccount(ewalletName, accs) : null;

      // Buat rekening e-wallet otomatis jika belum ada
      if (!targetAcc && ewalletName) {
        const newAccId = randomId();
        const displayName = ewalletName.charAt(0).toUpperCase() + ewalletName.slice(1);
        await env.DB.prepare(`INSERT INTO accounts (id, user_id, name, balance, color) VALUES (?, ?, ?, 0, NULL)`)
          .bind(newAccId, userId, displayName).run();
        accs = await dbAccounts(userId, env);
        targetAcc = accs.find(a => a.id === newAccId);
      }

      if (targetAcc) {
        const cats = await dbCategories(userId, env);
        const filteredCats = cats.filter(c => c.type === "income" || c.type === "both");
        const cat = resolveCategory(null, result.note || "topup", result.store, "income", filteredCats);
        const id = randomId();
        const date = result.date || todayStr();
        const idemKey = updateId ? `tg_ph_topup_${updateId}` : crypto.randomUUID();
        const dedupHash = txDedupHash(userId, 'income', result.total, targetAcc.id, date);
        const insResult = await env.DB.prepare(`
          INSERT OR IGNORE INTO transactions (id, user_id, date, type, amount, note, store, account_id, category_id, raw_text, source, idempotency_key, dedup_hash)
          VALUES (?, ?, ?, 'income', ?, ?, ?, ?, ?, '[foto struk]', 'telegram', ?, ?)
        `).bind(id, userId, date, result.total, "Top-up " + targetAcc.name, result.store || null, targetAcc.id, cat?.id || null, idemKey, dedupHash).run();
        await saveTransactionItems(id, result.items, env);
        if (insResult.meta?.changes > 0) await adjustBalance(targetAcc.id, "income", result.total, +1, env, userId);

        const mid = await tgSend(chatId,
          `💚 *Top-up Berhasil Dicatat!*\n\n` +
          `💳 *Rekening:* ${targetAcc.name}\n` +
          `💵 *Jumlah:* Rp${fmt(result.total)}\n` +
          `🏪 *Merchant:* ${result.store || "-"}\n` +
          `📅 *Tanggal:* ${fmtDate(date)}\n\n` +
          `_✏️ Reply pesan ini untuk koreksi_\n\nID: \`${id}\``,
          env, [[
            { text: "🗑️ Hapus", callback_data: `del:${id}` },
            { text: "🏠 Menu", callback_data: "menu" },
          ]]
        );
        await trackBotMsg(chatId, mid, env);
        return;
      }
    }

    const cats        = await dbCategories(userId, env);
    const filteredCats = cats.filter(c => c.type === "expense" || c.type === "both");
    const cat         = resolveCategory(null, result.note, result.store, "expense", filteredCats);
    const parsed      = { type: "expense", amount: result.total, note: result.note, store: result.store, date: result.date, account_name: null };

    // ── NAMA REKENING MATCHING DARI CAPTION (ZERO CLICK SAVE) ──
    let matchedAcc = null;
    if (caption) {
      matchedAcc = resolveAccount(caption, accs);
    }

    if (matchedAcc) {
      const id = randomId();
      const date = parsed.date || todayStr();
      const idemKey = updateId ? `tg_ph_caption_${updateId}` : crypto.randomUUID();
      const dedupHash = txDedupHash(userId, 'expense', parsed.amount, matchedAcc.id, date);
      const insResult = await env.DB.prepare(`
        INSERT OR IGNORE INTO transactions (id, user_id, date, type, amount, note, store, account_id, category_id, raw_text, source, idempotency_key, dedup_hash)
        VALUES (?, ?, ?, 'expense', ?, ?, ?, ?, ?, '[foto struk]', 'telegram', ?, ?)
      `).bind(id, userId, date, parsed.amount, parsed.note || "", parsed.store || null, matchedAcc.id, cat?.id || null, idemKey, dedupHash).run();

      await saveTransactionItems(id, result.items, env);
      if (insResult.meta?.changes > 0) await adjustBalance(matchedAcc.id, "expense", parsed.amount, +1, env, userId);

      let successMsg = `✅ *Tersimpan Otomatis!*\n`;
      successMsg += `_(Mencocokkan caption: *${matchedAcc.name}*)_\n\n`;
      successMsg += `🏪 *Merchant:* ${parsed.store || "-"}\n`;
      successMsg += `💵 *Total Belanja:* Rp${fmt(parsed.amount)}\n`;
      if (result.discount > 0) successMsg += `🏷️ *Diskon:* Rp${fmt(result.discount)}\n`;
      successMsg += `💳 *Metode:* ${matchedAcc.name}\n`;
      successMsg += `📅 *Tanggal:* ${fmtDate(date)}\n`;
      if (result.items && result.items.length > 0) {
        successMsg += `\n📦 *Daftar Item:*\n`;
        result.items.forEach((it, i) => {
          successMsg += `${i + 1}. _${it.name}_ (x${it.qty || 1}) - Rp${fmt(it.total_price || 0)}\n`;
        });
      }
      await tgSend(chatId, successMsg, env, [[{ text: "🏠 Menu", callback_data: "menu" }]]);
      return;
    }

    // ── FALLBACK INTERACTIVE KEYBOARD ──
    const pendingId = "pend_" + randomId();

    // Pesan 1: Rincian struk (read-only)
    let rincian = `🛒 *RINCIAN STRUK BELANJA*\n\n`;
    rincian += `🏪 *Toko:* ${result.store || "-"}\n`;
    rincian += `📅 *Tanggal:* ${fmtDate(result.date || todayStr())}\n`;
    rincian += `💵 *Total:* Rp${fmt(result.total)}\n`;
    if (result.discount > 0) rincian += `🏷️ *Diskon:* Rp${fmt(result.discount)}\n`;
    if (result.items && result.items.length > 0) {
      rincian += `\n📦 *Daftar Item:*\n`;
      result.items.forEach((it, i) => {
        rincian += `${i + 1}. _${it.name}_ (x${it.qty || 1}) - Rp${fmt(it.total_price || 0)}\n`;
      });
    }
    const rincianMsgId = await tgSend(chatId, rincian, env);

    // Store pending scan — encode rincian message_id + items in note for cleanup & save
    const noteWithMeta = JSON.stringify({ note: result.note || "Scan Struk", rincianMsgId, items: result.items || [] });
    await env.DB.prepare(`
      INSERT INTO pending_scans (id, user_id, store, amount, date, note)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(pendingId, userId, result.store || "Merchant", result.total, result.date || todayStr(), noteWithMeta).run();

    // Pesan 2: Pilih rekening (inline keyboard 2 kolom, compact)
    const accButtons = accs.map(acc => ({ text: `💳 ${acc.name}`, callback_data: `pay:${pendingId}:${acc.id}` }));
    const accKeyboard = chunks(accButtons, 2);
    accKeyboard.push([{ text: "❌ Batalkan", callback_data: `cancel:${pendingId}` }]);

    await tgSend(chatId, "💳 *Pilih rekening pembayaran:*", env, accKeyboard);
  } catch (err) {
    await tgSend(chatId, "⚠️ *Struk tidak dapat dibaca.*\n\nPastikan foto jelas, tidak terlipat, dan teksnya terbaca. Coba kirim ulang ya!", env);
  }
}

function parseDraftNote(raw) {
  try { const o = JSON.parse(raw); return { note: o.note || "Scan Struk", rincianMsgId: o.rincianMsgId || null, items: o.items || [] }; }
  catch { return { note: raw || "Scan Struk", rincianMsgId: null, items: [] }; }
}

async function handleReceiptKeyboardConfirm(chatId, userId, messageId, pendingId, accountId, env) {
  try {
    const draft = await env.DB.prepare("SELECT * FROM pending_scans WHERE id = ? AND user_id = ?").bind(pendingId, userId).first();
    if (!draft) {
      await editTgMessage(chatId, messageId, "⚠️ *Data struk kedaluwarsa atau sudah pernah disimpan.*", env);
      return;
    }

    // Gating check: attempt to delete the draft first to prevent concurrent duplicate inserts
    const delRes = await env.DB.prepare("DELETE FROM pending_scans WHERE id = ? AND user_id = ?").bind(pendingId, userId).run().catch(() => null);
    if (!delRes || delRes.meta.changes === 0) {
      return;
    }

    const { note: draftNote, rincianMsgId, items } = parseDraftNote(draft.note);
    const account = await env.DB.prepare("SELECT name, balance FROM accounts WHERE id = ? AND user_id = ?").bind(accountId, userId).first();
    if (!account) throw new Error("Rekening tidak ditemukan.");

    const amount = Number(draft.amount) || 0;
    const newBalance = Number(account.balance) - amount;

    // Resolve kategori secara dinamis (bukan hardcode 'c12')
    const cats = await dbCategories(userId, env);
    const filteredCats = cats.filter(c => c.type === "expense" || c.type === "both");
    const cat = resolveCategory(null, draftNote, draft.store, "expense", filteredCats);

    // Simpan transaksi
    const txId = randomId();
    const idemKey = 'receipt_' + pendingId;
    const dedupHash = txDedupHash(userId, 'expense', amount, accountId, draft.date);
    const insResult = await env.DB.prepare(`
      INSERT OR IGNORE INTO transactions (id, user_id, date, type, amount, note, store, account_id, category_id, raw_text, source, idempotency_key, dedup_hash)
      VALUES (?, ?, ?, 'expense', ?, ?, ?, ?, ?, '[foto struk]', 'telegram', ?, ?)
    `).bind(txId, userId, draft.date, amount, draftNote, draft.store, accountId, cat?.id || null, idemKey, dedupHash).run();

    await saveTransactionItems(txId, items, env);
    if (insResult.meta?.changes > 0) await adjustBalance(accountId, "expense", amount, +1, env, userId);

    // Hapus pesan rincian struk (Pesan 1) agar chat tetap bersih
    if (rincianMsgId) await deleteTgMessage(chatId, rincianMsgId, env);

    const successMsg = `✅ *TRANSAKSI BERHASIL DICATAT!*\n\n🏪 *Merchant:* ${draft.store}\n💵 *Total Belanja:* Rp${fmt(amount)}\n💳 *Metode:* ${account.name}\n💰 *Sisa Saldo:* Rp${fmt(newBalance)}\n📅 *Tanggal:* ${fmtDate(draft.date)}\n\n_✏️ Reply pesan ini untuk koreksi_\n_Contoh: jumlah 50rb / rekening mandiri / toko alfamart_\n\nID: \`${txId}\``;
    await editTgMessage(chatId, messageId, successMsg, env, [
      [{ text: "🗑️ Hapus", callback_data: `del:${txId}` }, { text: "🏠 Menu", callback_data: "menu" }]
    ]);
  } catch (err) {
    await tgSend(chatId, "⚠️ *Gagal menyimpan transaksi.*\n\nCoba ulangi dari awal dengan mengirim foto struk lagi.", env);
  }
}

// ─────────────────────────────────────────────────────
// KOREKSI VIA REPLY
// ─────────────────────────────────────────────────────
async function handleCorrection(chatId, userId, botMsg, userText, env) {
  const idMatch = botMsg.match(/ID:\s*`?([a-z0-9_]+)`?/);
  if (!idMatch) {
    await tgSend(chatId, "💡 *Untuk koreksi transaksi:*\n\nReply langsung ke pesan konfirmasi yang ada teks \"ID: ...\" di dalamnya.\n\n_Contoh: jumlah 50rb / kategori gaji / rekening mandiri_", env);
    return;
  }

  const txId = idMatch[1];
  const tx   = await env.DB.prepare(`SELECT * FROM transactions WHERE id = ? AND user_id = ?`).bind(txId, userId).first();
  if (!tx) { await tgSend(chatId, "⚠️ *Transaksi tidak ditemukan.*\n\nMungkin sudah dihapus. Ketik /riwayat untuk cek daftar transaksi.", env); return; }

  await tgSend(chatId, "⏳ Memproses koreksi...", env);
  const raw = await parseCorrection(userText, tx, env);
  if (!raw || raw._error) {
    await tgSend(chatId,
      "🤔 *Tidak bisa memahami koreksinya.*\n\nCoba tulis seperti ini:\n_jumlah 25rb_\n_rekening jago_\n_catatan beli obat_",
      env
    );
    return;
  }

  // ── LAPIS 2: Safeguard — filter field yang tidak disebut user ──
  const lo = userText.toLowerCase();
  const fieldKeywords = {
    amount:      /jumlah|nominal|harga|total|\d+\s*(rb|ribu|jt|juta|k)\b/i,
    note:        /catatan|keterangan|deskripsi|note/i,
    store:       /toko|merchant|tempat|store/i,
    account:     /rekening|rek|akun|account/i,
    category:    /kategori|category|kat\b/i,
    type:        /tipe|type|pemasukan|pengeluaran|income|expense/i,
    date:        /tanggal|date|tgl|kemarin|lusa/i,
  };
  for (const key of Object.keys(raw)) {
    if (key === "_error") continue;
    const kw = fieldKeywords[key];
    if (kw && !kw.test(lo)) {
      delete raw[key]; // AI hallucinated this field — user didn't mention it
    }
  }

  // Resolve rekening jika disebutkan
  if (raw.account) {
    const accs = await dbAccounts(userId, env);
    const a    = resolveAccount(raw.account, accs);
    if (a) raw.account_id = a.id;
    delete raw.account;
  }
  // Resolve kategori jika disebutkan
  if (raw.category) {
    const cats     = await dbCategories(userId, env);
    const filtered = cats.filter(c => c.type === tx.type || c.type === "both");
    const c        = filtered.find(x => x.name.toLowerCase().includes(raw.category.toLowerCase()));
    if (c) raw.category_id = c.id;
    delete raw.category;
  }

  const EDITABLE = { type:1, amount:1, date:1, account_id:1, category_id:1, note:1, store:1 };
  const fields = [], vals = [];
  for (const [k, v] of Object.entries(raw)) {
    if (EDITABLE[k]) { fields.push(`${k} = ?`); vals.push(v); }
  }
  if (!fields.length) { await tgSend(chatId, "🤔 *Hmm, tidak ada perubahan terdeteksi.*\n\nCoba tulis lebih spesifik, contoh:\n_jumlah 50rb_\n_kategori belanja_\n_rekening mandiri_", env); return; }

  await adjustBalance(tx.account_id, tx.type, tx.amount, -1, env, userId);
  vals.push(txId, userId);
  await env.DB.prepare(`UPDATE transactions SET ${fields.join(", ")} WHERE id = ? AND user_id = ?`).bind(...vals).run();
  const updated = await env.DB.prepare(`SELECT * FROM transactions WHERE id = ? AND user_id = ?`).bind(txId, userId).first();
  await adjustBalance(updated.account_id, updated.type, updated.amount, +1, env, userId);

  const full  = await getTxFull(txId, env);
  const emoji = full.type === "income" ? "💚" : "🔴";
  const mid = await tgSend(chatId,
    `${emoji} *Diperbarui!*\n\n${formatTx(full)}\n\n` +
    `_✏️ Reply pesan ini untuk koreksi lagi_\n` +
    `_Contoh: jumlah 5.5jt / kategori gaji / rekening mandiri_\n\n` +
    `ID: \`${txId}\``,
    env,
    [[
      { text: "🗑️ Hapus", callback_data: `del:${txId}` },
      { text: "🏠 Menu",  callback_data: "menu"         },
    ]]
  );
  await trackBotMsg(chatId, mid, env);
}

// ─────────────────────────────────────────────────────
async function deleteTx(chatId, userId, txId, env) {
  const tx = await env.DB.prepare(`SELECT * FROM transactions WHERE id = ? AND user_id = ?`).bind(txId, userId).first();
  if (!tx) { await tgSend(chatId, "⚠️ *Transaksi tidak ditemukan.*\n\nMungkin sudah dihapus sebelumnya.", env); return; }
  await adjustBalance(tx.account_id, tx.type, tx.amount, -1, env, userId);
  await env.DB.prepare("DELETE FROM transaction_items WHERE transaction_id = ?").bind(txId).run().catch(() => {});
  await env.DB.prepare(`DELETE FROM transactions WHERE id = ? AND user_id = ?`).bind(txId, userId).run();
  await tgSend(chatId, "🗑️ *Transaksi dihapus.*", env, [[{ text: "🏠 Menu", callback_data: "menu" }]]);
}

// ─────────────────────────────────────────────────────
// INFO COMMANDS
// ─────────────────────────────────────────────────────
async function sendMenu(chatId, userId, env) {
  let msg = `🌊 *LAKSA — Dashboard Keuangan*\n`;

  // ── Saldo ──
  const accs = await dbAccounts(userId, env);
  if (accs.length) {
    let total = 0;
    let accLines = "";
    for (const a of accs) {
      const sign = a.balance >= 0 ? "" : "−";
      accLines += `  ▪️ ${a.name}: ${sign}Rp${fmt(Math.abs(a.balance))}\n`;
      total += a.balance;
    }
    const tsign = total >= 0 ? "" : "−";
    msg += `\n💰 *Total Saldo: ${tsign}Rp${fmt(Math.abs(total))}*\n`;
    msg += `┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄\n`;
    msg += `🏦 *Rekening:*\n${accLines}`;
  } else {
    msg += `\n📭 _Belum ada rekening._\n`;
  }

  // ── Pemasukan & Pengeluaran bulan ini ──
  const now = new Date();
  const thisMonth = now.toISOString().slice(0, 7);
  const txMonth = await env.DB.prepare(
    `SELECT type, SUM(amount) AS total FROM transactions WHERE user_id = ? AND date LIKE ? GROUP BY type`
  ).bind(userId, `${thisMonth}%`).all();
  const monthIncome  = txMonth.results.find(r => r.type === "income")?.total || 0;
  const monthExpense = txMonth.results.find(r => r.type === "expense")?.total || 0;
  const diff = monthIncome - monthExpense;
  const diffSign = diff >= 0 ? "+" : "−";

  msg += `┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄\n`;
  msg += `📊 *Bulan Ini (${fmtMonthYear(thisMonth)}):*\n`;
  msg += `  💚 Pemasukan  : Rp${fmt(monthIncome)}\n`;
  msg += `  🔴 Pengeluaran: Rp${fmt(monthExpense)}\n`;
  msg += `  📈 Selisih    : ${diffSign}Rp${fmt(Math.abs(diff))}\n`;

  // ── Tagihan mendesak ──
  const bills = await env.DB.prepare(
    `SELECT * FROM bills WHERE user_id = ? AND status = 'unpaid' ORDER BY due_day ASC LIMIT 3`
  ).bind(userId).all();
  if (bills.results.length) {
    msg += `┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄\n`;
    msg += `🗓️ *Tagihan Mendesak:*\n`;
    for (const b of bills.results) {
      const dueDay = b.due_day || 1;
      const due = b.due_type === "once" && b.due_date
        ? new Date(b.due_date + "T00:00:00")
        : new Date(now.getFullYear(), now.getMonth(), dueDay);
      const diffDays = Math.ceil((due - now) / 86400000);
      const icon = diffDays < 0 ? "🔴" : diffDays <= 3 ? "🟡" : "⚪";
      const label = diffDays < 0 ? `Overdue ${Math.abs(diffDays)}h` : diffDays === 0 ? "Hari ini!" : `${diffDays} hari`;
      msg += `  ${icon} ${b.name}`;
      if (b.amount > 0) msg += ` — Rp${fmt(b.amount)}`;
      msg += ` _(${label})_\n`;
    }
  }

  // ── Petunjuk ──
  msg += `┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄\n`;
  msg += `✏️ _Ketik langsung untuk catat:_\n`;
  msg += `_beli bakso 15rb pakai mandiri_\n`;
  msg += `📸 _Kirim foto struk untuk scan_`;

  const mid = await tgSend(chatId, msg, env,
    [[
      { text: "💰 Saldo",    callback_data: "saldo"   },
      { text: "📋 Riwayat", callback_data: "riwayat" },
    ],[
      { text: "📑 Tagihan", callback_data: "tagihan" },
      { text: "ℹ️ Info Akun", callback_data: "myid" },
    ],[
      { text: "💎 Upgrade Premium", callback_data: "upgrade" },
    ]]
  );
  await trackBotMsg(chatId, mid, env);
}

async function sendUpgradeMenu(chatId, userId, env) {
  if (!userId) {
    const mid = await tgSend(
      chatId,
      "🔗 *Akun Telegram belum terhubung.*\n\nHubungkan Telegram dari Pengaturan LaksaApp agar pembelian Premium masuk ke akun yang benar.",
      env,
      [
        [{ text: "🌐 Buka LaksaApp", url: "https://laksaapp.my.id/" }],
        [{ text: "🏠 Menu", callback_data: "menu" }]
      ]
    );
    await trackBotMsg(chatId, mid, env);
    return;
  }

  const user = await env.DB.prepare(
    "SELECT plan, plan_expired_at, is_banned FROM users WHERE id = ?"
  ).bind(userId).first();
  if (!user || user.is_banned) {
    const mid = await tgSend(chatId, user?.is_banned ? "🚫 Akun Anda diblokir." : "❌ Akun tidak ditemukan.", env);
    await trackBotMsg(chatId, mid, env);
    return;
  }

  const prices = await env.DB.prepare(
    "SELECT id, label, price, original_price, duration_days FROM pricing WHERE active = 1 AND price > 0 ORDER BY duration_days ASC"
  ).all();
  if (!prices.results?.length) {
    const mid = await tgSend(chatId, "⚠️ Belum ada paket Premium yang tersedia.", env, [[{ text: "🏠 Menu", callback_data: "menu" }]]);
    await trackBotMsg(chatId, mid, env);
    return;
  }

  let message = "💎 *Upgrade Laksa Premium*\n\n";
  if (user.plan === "premium") {
    const expiry = user.plan_expired_at ? user.plan_expired_at.slice(0, 10) : "Lifetime";
    message += `Status saat ini: *Premium* (${expiry})\n\n`;
  }
  message += "Pilih paket di bawah. Total akhir dapat memiliki kode unik dari KlikQRIS.\n\n";
  message += "_Punya kupon? Gunakan checkout web._";

  const availablePrices = prices.results.filter(price =>
    /^[a-zA-Z0-9_-]{1,48}$/.test(String(price.id || "")) &&
    Number.isSafeInteger(Number(price.price)) &&
    Number(price.price) > 0
  );
  if (!availablePrices.length) {
    const mid = await tgSend(chatId, "⚠️ Konfigurasi paket Premium tidak valid.", env, [[{ text: "🏠 Menu", callback_data: "menu" }]]);
    await trackBotMsg(chatId, mid, env);
    return;
  }

  const keyboard = availablePrices.map(price => [{
    text: `${String(price.label || price.id).slice(0, 36)} — Rp ${Number(price.price).toLocaleString("id-ID")}`,
    callback_data: `buy:${price.id}`
  }]);
  keyboard.push([{ text: "🎟️ Checkout dengan Kupon", url: "https://laksaapp.my.id/#upgrade" }]);
  keyboard.push([{ text: "🏠 Menu", callback_data: "menu" }]);

  const mid = await tgSend(chatId, message, env, keyboard);
  await trackBotMsg(chatId, mid, env);
}

function fmtMonthYear(ym) {
  const [y, m] = ym.split("-");
  const months = ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"];
  return `${months[parseInt(m, 10) - 1]} ${y}`;
}

async function sendSaldo(chatId, userId, env) {
  const accs = await dbAccounts(userId, env);
  if (!accs.length) {
    const mid = await tgSend(chatId,
      "📭 Belum ada rekening.\n\nCatat transaksi pertamamu dan rekening akan dibuat otomatis.",
      env, [[{ text: "🏠 Menu", callback_data: "menu" }]]
    );
    await trackBotMsg(chatId, mid, env);
    return;
  }
  let msg   = `💳 *Saldo Rekening:*\n\n`;
  let total = 0;
  for (const a of accs) {
    const sign = a.balance >= 0 ? "" : "−";
    msg  += `▪️ *${a.name}*: ${sign}Rp${fmt(Math.abs(a.balance))}\n`;
    total += a.balance;
  }
  const tsign = total >= 0 ? "" : "−";
  msg += `\n📊 *Total: ${tsign}Rp${fmt(Math.abs(total))}*`;
  const mid = await tgSend(chatId, msg, env, [[{ text: "🏠 Menu", callback_data: "menu" }]]);
  await trackBotMsg(chatId, mid, env);
}

async function sendRiwayat(chatId, userId, env) {
  const rows = await env.DB.prepare(`
    SELECT t.*, a.name AS account_name, c.name AS category_name, c.emoji AS category_emoji
    FROM transactions t
    LEFT JOIN accounts a ON t.account_id = a.id
    LEFT JOIN categories c ON t.category_id = c.id AND c.user_id = t.user_id
    WHERE t.user_id = ? ORDER BY t.date DESC, t.created_at DESC LIMIT 10
  `).bind(userId).all();

  if (!rows.results.length) {
    const mid = await tgSend(chatId, "📭 Belum ada transaksi.", env, [[{ text: "🏠 Menu", callback_data: "menu" }]]);
    await trackBotMsg(chatId, mid, env);
    return;
  }

  let msg = `📋 *10 Transaksi Terakhir:*\n\n`;
  for (const t of rows.results) {
    const e = t.type === "income" ? "💚" : "🔴";
    msg += `${e} ${fmtDate(t.date)} — *Rp${fmt(t.amount)}*\n`;
    msg += `   ${t.category_emoji || ""} ${t.note || "-"}  ·  ${t.account_name || "-"}\n\n`;
  }

  const mid2 = await tgSend(chatId, msg, env, [[{ text: "🏠 Menu", callback_data: "menu" }]]);
  await trackBotMsg(chatId, mid2, env);
}

async function sendTagihan(chatId, userId, env) {
  const today     = new Date();
  const thisMonth = today.toISOString().slice(0, 7);

  await env.DB.prepare(`
    UPDATE bills SET status='unpaid', paid_date=NULL
    WHERE user_id=? AND due_type='monthly' AND status='paid'
    AND (paid_date IS NULL OR paid_date NOT LIKE ?)
  `).bind(userId, `${thisMonth}%`).run();

  const r = await env.DB.prepare(
    `SELECT * FROM bills WHERE user_id = ? ORDER BY due_day ASC NULLS LAST, created_at ASC`
  ).bind(userId).all();

  if (!r.results.length) {
    const mid = await tgSend(chatId, "📭 Belum ada tagihan tercatat.\n\nTambahkan tagihan dari website Laksa.", env,
      [[{ text: "🏠 Menu", callback_data: "menu" }]]
    );
    await trackBotMsg(chatId, mid, env);
    return;
  }

  const STATUS_ORDER = { unpaid: 0, paid: 1 };
  const sorted = r.results.sort((a, b) => (STATUS_ORDER[a.status] ?? 0) - (STATUS_ORDER[b.status] ?? 0));

  let totalUnpaid = 0;
  let msg = `🗓️ *Tagihan Bulan Ini:*\n\n`;

  for (const b of sorted) {
    const isPaid = b.status === "paid";
    let icon = "", statusLabel = "";

    if (isPaid) {
      icon = "🟢"; statusLabel = "Lunas ✓";
    } else {
      const dueDay = b.due_day || 1;
      const due    = b.due_type === "once" && b.due_date
        ? new Date(b.due_date + "T00:00:00")
        : new Date(today.getFullYear(), today.getMonth(), dueDay);
      const diffDays = Math.ceil((due - today) / 86400000);

      if      (diffDays < 0)  { icon = "🔴"; statusLabel = `Overdue ${Math.abs(diffDays)} hari`; }
      else if (diffDays === 0){ icon = "🟡"; statusLabel = "Jatuh tempo hari ini!"; }
      else if (diffDays <= 7) { icon = "🟡"; statusLabel = `${diffDays} hari lagi`; }
      else                    { icon = "⚪"; statusLabel = `${diffDays} hari lagi`; }

      if (b.amount > 0) totalUnpaid += b.amount;
    }

    const dueInfo = b.due_type === "once" && b.due_date
      ? fmtDate(b.due_date)
      : `Tgl ${b.due_day || 1} tiap bulan`;

    msg += `${icon} *${b.name}*`;
    if (b.amount > 0) msg += ` — Rp${fmt(b.amount)}`;
    msg += `\n   ${statusLabel} · ${dueInfo}\n\n`;
  }

  if (totalUnpaid > 0) {
    msg += `━━━━━━━━━━━━━━\n💸 *Total belum lunas: Rp${fmt(totalUnpaid)}*`;
  }

  const mid3 = await tgSend(chatId, msg, env, [[{ text: "🏠 Menu", callback_data: "menu" }]]);
  await trackBotMsg(chatId, mid3, env);
}

async function sendMyId(chatId, userId, firstName, env) {
  const mid = await tgSend(chatId,
    `🪪 *Telegram ID kamu:*\n\n\`${userId}\`\n\nHai ${firstName || ""}! Salin angka ini ke halaman setup website Laksa. 🔒`,
    env, [[{ text: "🏠 Menu", callback_data: "menu" }]]
  );
  await trackBotMsg(chatId, mid, env);
}

// ─────────────────────────────────────────────────────
// AI — GROQ HELPERS
// ─────────────────────────────────────────────────────
function fetchWithTimeout(url, options, timeoutMs = 15000) {
  return Promise.race([
    fetch(url, options),
    new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), timeoutMs)),
  ]);
}

async function groqChat(messages, env, { models = PARSE_MODELS, maxTokens = 300, temperature = 0.1, jsonMode = false, userPlan = 'free' } = {}) {
  // ─────────────────────────────────────────────────────
  // 1. PREMIUM USER ROUTE -> LapakVIP Router API (Ultra Fast / Unlimited Throttle)
  // ─────────────────────────────────────────────────────
  if (userPlan === 'premium') {
    const apiKey = env.PREMIUM_AI_API_KEY || PREMIUM_AI_DEFAULT_KEY;
    let baseUrl = env.PREMIUM_AI_BASE_URL || PREMIUM_AI_DEFAULT_BASE;
    if (!baseUrl.endsWith("/")) baseUrl += "/";
    const endpoint = `${baseUrl}chat/completions`;

    const defaultPremiumChain = jsonMode ? PREMIUM_PARSE_MODELS : PREMIUM_CHAT_MODELS;
    const targetModels = (Array.isArray(models) && models.length && models !== PARSE_MODELS && models !== CHAT_MODELS)
      ? models
      : defaultPremiumChain;

    for (const model of targetModels) {
      try {
        const payload = { model, messages, temperature, max_tokens: maxTokens };
        if (jsonMode) payload.response_format = { type: "json_object" };

        const res = await fetchWithTimeout(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${apiKey}`
          },
          body: JSON.stringify(payload)
        }, 20000);

        if (res.ok) {
          const data = await res.json();
          if (data.choices?.[0]?.message?.content) {
            data.choices[0].message.content = data.choices[0].message.content
              .replace(/<think>[\s\S]*?(?:<\/think>|$)/gi, '').trim();
            return { data, model, provider: "premium-router" };
          }
        }
      } catch (e) {
        // Fallback to next model or Groq API
      }
    }
  }

  // ─────────────────────────────────────────────────────
  // 2. FREE TIER ROUTE / FALLBACK -> Groq API
  // ─────────────────────────────────────────────────────
  let lastError = null;
  for (const model of models) {
    try {
      const payload = { model, messages, temperature, max_tokens: maxTokens };
      if (jsonMode) payload.response_format = { type: "json_object" };
      const res  = await fetchWithTimeout("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${env.GROQ_API_KEY}` },
        body: JSON.stringify(payload),
      });
      if (res.status === 429 || res.status === 503) { lastError = `${model}: HTTP ${res.status}`; continue; }
      if (!res.ok) { lastError = `${model}: HTTP ${res.status}`; continue; }
      const data = await res.json();
      if (data.error) { lastError = `${model}: ${data.error.message}`; continue; }
      if (data.choices?.[0]?.message?.content) {
        data.choices[0].message.content = data.choices[0].message.content.replace(/<think>[\s\S]*?(?:<\/think>|$)/gi, '').trim();
      }
      return { data, model, provider: "groq" };
    } catch (e) { lastError = `${model}: ${e.message}`; continue; }
  }
  throw new Error(`Semua model AI sedang sibuk. Terakhir: ${lastError}`);
}

async function parseWithGroq(text, env, userPlan = 'free') {
  const today     = todayStr();
  const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];
  const twoDaysAgo = new Date(Date.now() - 2 * 86400000).toISOString().split("T")[0];

  const system = `Kamu adalah AI pencatat keuangan untuk orang Indonesia. Pahami bahasa gaul, singkatan, typo.

Field yang diekstrak:
- type: "income" jika ada kata gaji/dapat/terima/masuk/refund/cashback/dividen/bonus/hadiah/jual/freelance/honor/topup/top-up/isi saldo/isi ulang/pemasukan, "transfer" jika pindah uang antar rekening sendiri (pindah/transfer ke/dari), selain itu "expense". PENTING: "topup gopay/ovo/dana/shopeepay" = income ke rekening e-wallet tersebut, BUKAN expense.
- amount: angka murni. rb/ribu/k=×1000, jt/juta=×1000000. Titik adalah pemisah ribuan: "15.000"→15000
- note: deskripsi BERMAKNA dari transaksi. Untuk expense: apa yang dibeli (TANPA nama toko). Untuk income: sumber pemasukan (misal "Dividen BBRI", "Gaji bulanan", "Freelance desain logo", "Bonus tahunan", "Cashback Shopee"). JANGAN isi "Lainnya" atau generik — selalu ekstrak deskripsi spesifik dari input user. Maks 60 karakter.
- store: nama toko/merchant/tempat BELANJA saja. Hanya untuk expense (misal "Alfamart", "Warteg", "Gojek"). Untuk income/transfer: SELALU null. Nama bank/perusahaan sumber dividen (BBRI, TLKM) BUKAN store. Deteksi dari pola "di X", "@ X", atau brand retail dikenal. Title Case.
- date: YYYY-MM-DD jika ada petunjuk tanggal, null jika tidak ada petunjuk waktu sama sekali.
  Referensi waktu sekarang:
  • Hari ini / tadi / barusan / pagi ini / tadi malam / malam ini → ${today}
  • Kemarin / kemaren / yesterday → ${yesterday}
  • 2 hari lalu / dua hari lalu → ${twoDaysAgo}
  • Minggu lalu → hitung mundur 7 hari dari ${today}
  • Jika TIDAK ada petunjuk waktu sama sekali → null
- account_name: nama rekening jika disebutkan (mandiri, bca, jago, gopay, ovo, dana, tunai/dompet/cash, dll), null jika tidak. "tunai"/"cash"/"dompet" = rekening kas/dompet fisik, BUKAN metode pembayaran. Untuk transfer: null.
- from_account: rekening asal jika type=transfer, null jika bukan transfer
- to_account: rekening tujuan jika type=transfer, null jika bukan transfer
- category_name: pilih PALING TEPAT dari: Makanan & Minuman, Transportasi, Belanja, Tagihan, Hiburan, Kesehatan, Pendidikan, Rumah Tangga, Perawatan Diri, Pajak, Cicilan, Sosial, Gaji, Freelance, Investasi, Hadiah, Bonus, Penjualan, Refund, Tabungan, Pemasukan Lainnya, Pengeluaran Lainnya
  PANDUAN KATEGORI:
  • Gaji/honor/upah → "Gaji"
  • Freelance/jasa/proyek → "Freelance"
  • Bonus/THR/insentif → "Bonus"
  • Dividen/bunga/return/capital gain/jual saham → "Investasi"
  • Cashback/refund → "Refund"
  • Hadiah/gift → "Hadiah"
  • Jual barang bekas/jual online → "Penjualan"
  • Makan/minum/kopi/snack → "Makanan & Minuman"
  • Grab/Gojek/bensin/parkir/tol → "Transportasi"
  • Listrik/air/internet/pulsa → "Tagihan"
  • Obat/dokter/RS → "Kesehatan"
  • Bioskop/game/Netflix/Spotify → "Hiburan"
  • Kursus/buku/sekolah → "Pendidikan"
  • Belanja online/baju/sepatu → "Belanja"
  • Renovasi/perabot/peralatan rumah → "Rumah Tangga"
  • Salon/skincare/spa → "Perawatan Diri"
  • Pajak/denda → "Pajak"
  • Cicilan/kredit/angsuran → "Cicilan"
  • Donasi/zakat/sedekah/infaq → "Sosial"
  • Nabung/tabungan → "Tabungan"
  • Topup e-wallet → "Pengeluaran Lainnya"

CONTOH PENGELUARAN:
"beli rokok 25000 di warung madura pakai mandiri"
→ {"type":"expense","amount":25000,"note":"Beli rokok","store":"Warung Madura","date":null,"account_name":"mandiri","category_name":"Makanan & Minuman"}

"kemarin makan siang warteg 15rb"
→ {"type":"expense","amount":15000,"note":"Makan siang","store":"Warteg","date":"${yesterday}","account_name":null,"category_name":"Makanan & Minuman"}

"tadi pagi gojek ke kantor 35rb gopay"
→ {"type":"expense","amount":35000,"note":"Gojek ke kantor","store":"Gojek","date":"${today}","account_name":"gopay","category_name":"Transportasi"}

"bayar listrik 350rb dari mandiri"
→ {"type":"expense","amount":350000,"note":"Bayar listrik","store":null,"date":null,"account_name":"mandiri","category_name":"Tagihan"}

CONTOH PEMASUKAN:
"pemasukan dividen bbri 10juta ke rekening mandiri"
→ {"type":"income","amount":10000000,"note":"Dividen BBRI","store":null,"date":null,"account_name":"mandiri","category_name":"Investasi"}

"gaji bulanan 8jt ke mandiri"
→ {"type":"income","amount":8000000,"note":"Gaji bulanan","store":null,"date":null,"account_name":"mandiri","category_name":"Gaji"}

"freelance desain logo 1.5jt ke dana"
→ {"type":"income","amount":1500000,"note":"Freelance desain logo","store":null,"date":null,"account_name":"dana","category_name":"Gaji"}

"cashback shopee 25rb ke shopeepay"
→ {"type":"income","amount":25000,"note":"Cashback Shopee","store":null,"date":null,"account_name":"shopeepay","category_name":"Lainnya"}

"jual laptop bekas 3jt tunai"
→ {"type":"income","amount":3000000,"note":"Jual laptop bekas","store":null,"date":null,"account_name":"tunai","category_name":"Lainnya"}

CONTOH TRANSFER:
"pindah 500rb dari mandiri ke seabank"
→ {"type":"transfer","amount":500000,"note":"Transfer mandiri ke seabank","store":null,"date":null,"account_name":null,"from_account":"mandiri","to_account":"seabank","category_name":null}

CONTOH TOPUP:
"topup gopay 700rb"
→ {"type":"income","amount":700000,"note":"Topup GoPay","store":null,"date":null,"account_name":"gopay","category_name":"Lainnya"}

Balas HANYA JSON valid tanpa markdown:
{"type":"expense","amount":0,"note":"","store":null,"date":null,"account_name":null,"from_account":null,"to_account":null,"category_name":null}`;

  try {
    const { data } = await groqChat(
      [{ role: "system", content: system }, { role: "user", content: text }],
      env, { maxTokens: 200, jsonMode: true, userPlan }
    );
    const raw = data.choices?.[0]?.message?.content || "";
    return extractJSON(raw);
  } catch (e) { return { _error: e.message }; }
}

async function parseCorrection(text, currentTx, env, userPlan = 'free') {
  const today     = todayStr();
  const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];

  const system = `Kamu adalah AI koreksi transaksi keuangan Indonesia. ` +
    `Tugasmu: dari input bebas user, tentukan field mana yang ingin diubah. ` +
    `ATURAN PENTING: Ubah HANYA field yang SECARA EKSPLISIT disebutkan user. ` +
    `JANGAN menginferensi atau menambah perubahan field lain. ` +
    `Contoh: "merchant indomaret" → {"store":"Indomaret"} SAJA. JANGAN ubah type/note/amount. ` +
    `Contoh: "jumlah 50rb" → {"amount":50000} SAJA. JANGAN ubah field lain. ` +
    `Balas HANYA JSON valid.`;

  const prompt =
    `TRANSAKSI SAAT INI:\n` +
    `- jumlah  : ${currentTx.amount}\n` +
    `- catatan : "${currentTx.note || ""}"\n` +
    `- toko    : "${currentTx.store || ""}"\n` +
    `- tipe    : ${currentTx.type}\n` +
    `- tanggal : ${currentTx.date || today}\n\n` +
    `INPUT KOREKSI USER: "${text}"\n\n` +
    `TUGAS: Ubah HANYA field yang EKSPLISIT disebutkan user. Jika user hanya menyebut 1 field, output HANYA 1 key.\n\n` +
    `FIELD YANG BISA DIUBAH:\n` +
    `- amount   : angka murni. rb/ribu=x1000, jt/juta=x1000000. Titik=pemisah ribuan: "30.400"->30400\n` +
    `- note     : deskripsi/keterangan, string bebas maks 60 karakter\n` +
    `- store    : nama toko/merchant/tempat. Title Case. Jika user bilang "toko X" atau "merchant X" \u2192 store: "X"\n` +
    `- account  : nama rekening (mandiri, bca, jago, gopay, ovo, dana, tunai, dll)\n` +
    `- category : pilih dari: Makanan & Minuman, Transportasi, Belanja, Tagihan, Hiburan, Kesehatan, Pendidikan, Rumah Tangga, Perawatan Diri, Pajak, Cicilan, Sosial, Gaji, Freelance, Investasi, Hadiah, Bonus, Penjualan, Refund, Tabungan, Pemasukan Lainnya, Pengeluaran Lainnya\n` +
    `- type     : HANYA jika user EKSPLISIT bilang "tipe income"/"tipe expense"/"ubah ke pemasukan"/"ubah ke pengeluaran"\n` +
    `- date     : YYYY-MM-DD. Referensi: hari ini=${today}, kemarin=${yesterday}\n\n` +
    `WHITELIST NAMA REKENING:\n` +
    `Bank umum: bca, mandiri, bni, bri, btn, jago, seabank, blu, neo, allobank, aladin, superbank, linebank, jenius\n` +
    `E-wallet: gopay, ovo, dana, shopeepay, linkaja, flip, tunai, cash\n\n` +
    `INGAT: Output HANYA field yang user sebut. JANGAN tambah field lain. Balas HANYA JSON valid.`;

  try {
    const { data } = await groqChat(
      [{ role: "system", content: system }, { role: "user", content: prompt }],
      env, { maxTokens: 200, jsonMode: true, userPlan }
    );
    const raw = data.choices?.[0]?.message?.content || "";
    return extractJSON(raw);
  } catch (e) { return { _error: e.message }; }
}

// ─────────────────────────────────────────────────────
// OCR STRUK — strict null/NaN 0-Rupiah Voucher Fix
// ─────────────────────────────────────────────────────
async function ocrReceipt(base64, mime, env, userPlan = 'free') {
  const visionPrompt = `Analisis struk belanja ini dan keluarkan data dalam bentuk JSON murni tanpa tambahan markdown block. Format objek JSON:
{
  "store": "Nama toko/merchant",
  "date": "Tanggal transaksi format YYYY-MM-DD",
  "items": [
    {"name": "Nama item/barang belanja", "qty": 1, "total_price": 25000, "category": "Makanan/Belanja/Transportasi/Lainnya"}
  ],
  "discount": 0,
  "tax": 0,
  "total": 50000,
  "change": 0,
  "confidence": "high/medium/low"
}
PENTING:
- Ekstrak diskon belanja jika ada ke dalam 'discount'.
- Jika struk total bernilai 0 rupiah karena didiskon penuh atau voucher, keluarkan nilai 'total' sebagai 0 (JANGAN menolaknya, keluarkan 0).
- JANGAN menyertakan block \`\`\`json di awal dan di akhir, langsung keluarkan objek JSON.`;

  // 1. If Premium User, try Premium Vision Models first
  if (userPlan === 'premium') {
    const apiKey = env.PREMIUM_AI_API_KEY || PREMIUM_AI_DEFAULT_KEY;
    let baseUrl = env.PREMIUM_AI_BASE_URL || PREMIUM_AI_DEFAULT_BASE;
    if (!baseUrl.endsWith("/")) baseUrl += "/";
    const endpoint = `${baseUrl}chat/completions`;

    for (const model of PREMIUM_VISION_MODELS) {
      try {
        const ocrRes = await fetchWithTimeout(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
          body: JSON.stringify({
            model,
            temperature: 0.1,
            max_tokens: 1024,
            messages: [{
              role: "user",
              content: [
                { type: "text", text: visionPrompt },
                { type: "image_url", image_url: { url: `data:${mime};base64,${base64}` } },
              ],
            }],
          }),
        }, 25000);

        if (ocrRes.ok) {
          const resData = await ocrRes.json();
          const rawText = resData.choices?.[0]?.message?.content?.trim() || "";
          if (rawText) {
            const parsed = extractJSON(rawText);
            const hasTotal  = parsed.total !== undefined && parsed.total !== null && parsed.total !== "" && !isNaN(parsed.total);
            const hasAmount = parsed.amount !== undefined && parsed.amount !== null && parsed.amount !== "" && !isNaN(parsed.amount);
            if (hasTotal || hasAmount) {
              const extractNum = (s) => {
                if (s === undefined || s === null || s === "") return 0;
                if (typeof s === "number") return s;
                const m = String(s).match(/[\d][\d.,]*/g);
                if (!m) return 0;
                return parseInt(m[m.length - 1].replace(/[.,]/g, ""), 10) || 0;
              };
              const total    = extractNum(parsed.total !== undefined ? parsed.total : parsed.amount);
              const tunai    = extractNum(parsed.tunai);
              const discount = extractNum(parsed.discount);
              let   change   = extractNum(parsed.change);
              if (change === 0 && tunai > total) change = tunai - total;

              return {
                store:      parsed.store || null,
                date:       parsed.date  || null,
                note:       parsed.note  || (parsed.store ? `Belanja di ${parsed.store}` : "Belanja"),
                items:      Array.isArray(parsed.items) ? parsed.items : [],
                total, discount, change, tunai,
                confidence: parsed.confidence || "high",
                provider:   "premium-router",
              };
            }
          }
        }
      } catch (e) {
        // Fallback to Groq vision
      }
    }
  }

  // 2. Free Tier / Fallback Vision OCR via Groq
  let lastError = null;
  for (const model of VISION_MODELS) {
    try {
      const ocrRes = await fetchWithTimeout("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${env.GROQ_API_KEY}` },
        body: JSON.stringify({
          model,
          temperature: 0.1,
          max_tokens: 1024,
          messages: [{
            role: "user",
            content: [
              { type: "text", text: visionPrompt },
              { type: "image_url", image_url: { url: `data:${mime};base64,${base64}` } },
            ],
          }],
        }),
      }, 25000);
      if (ocrRes.status === 429 || ocrRes.status === 503) { lastError = `${model}: HTTP ${ocrRes.status}`; continue; }
      if (!ocrRes.ok) { lastError = `${model}: HTTP ${ocrRes.status}`; continue; }

      const resData = await ocrRes.json();
      if (resData.error) { lastError = `${model}: ${resData.error.message}`; continue; }
      const rawText = resData.choices?.[0]?.message?.content?.trim() || "";
      if (!rawText) { lastError = `${model}: empty response`; continue; }
      const parsed  = extractJSON(rawText);

      // Strict 0-Rupiah Null/NaN Verification
      const hasTotal  = parsed.total !== undefined && parsed.total !== null && parsed.total !== "" && !isNaN(parsed.total);
      const hasAmount = parsed.amount !== undefined && parsed.amount !== null && parsed.amount !== "" && !isNaN(parsed.amount);
      if (!hasTotal && !hasAmount) { lastError = `${model}: Total tidak terdeteksi`; continue; }

      const extractNum = (s) => {
        if (s === undefined || s === null || s === "") return 0;
        if (typeof s === "number") return s;
        const m = String(s).match(/[\d][\d.,]*/g);
        if (!m) return 0;
        return parseInt(m[m.length - 1].replace(/[.,]/g, ""), 10) || 0;
      };

      const total    = extractNum(parsed.total !== undefined ? parsed.total : parsed.amount);
      const tunai    = extractNum(parsed.tunai);
      const discount = extractNum(parsed.discount);
      let   change   = extractNum(parsed.change);
      if (change === 0 && tunai > total) change = tunai - total;

      return {
        store:      parsed.store || null,
        date:       parsed.date  || null,
        note:       parsed.note  || (parsed.store ? `Belanja di ${parsed.store}` : "Belanja"),
        items:      Array.isArray(parsed.items) ? parsed.items : [],
        total, discount, change, tunai,
        confidence: parsed.confidence || "medium",
      };
    } catch (e) { lastError = `${model}: ${e.message}`; continue; }
  }
  return { _error: lastError || "Semua model vision gagal." };
}

// ─────────────────────────────────────────────────────
// WEBSITE AI PROXY — /ai-chat
// ─────────────────────────────────────────────────────
async function handleAiChat(uid, body, env) {
  const { messages, models, max_tokens } = body;
  if (!Array.isArray(messages) || !messages.length || messages.length > MAX_AI_MESSAGES) {
    return jsonRes({ error: "Jumlah messages tidak valid" }, 400);
  }
  const normalizedMessages = messages.map(m => ({
    role: ["system", "user", "assistant"].includes(m?.role) ? m.role : "user",
    content: typeof m?.content === "string" ? m.content : ""
  }));
  const totalChars = normalizedMessages.reduce((sum, m) => sum + m.content.length, 0);
  if (totalChars > MAX_AI_MESSAGE_CHARS) return jsonRes({ error: "Pesan terlalu panjang" }, 413);

  // Check User Tier Plan (Free vs Premium)
  let userPlan = 'free';
  if (uid) {
    const u = await env.DB.prepare("SELECT plan FROM users WHERE id = ?").bind(uid).first();
    if (u?.plan === 'premium') userPlan = 'premium';
  }

  const chain = (Array.isArray(models) && models.length)
    ? models.filter(m => CHAT_MODELS.includes(m) || PREMIUM_CHAT_MODELS.includes(m))
    : (userPlan === 'premium' ? PREMIUM_CHAT_MODELS : CHAT_MODELS);
  const tokenLimit = Math.min(MAX_AI_TOKENS, Math.max(1, Number(max_tokens) || 2048));
  try {
    const { data, model, provider } = await groqChat(normalizedMessages, env, {
      models: chain.length ? chain : (userPlan === 'premium' ? PREMIUM_CHAT_MODELS : CHAT_MODELS),
      maxTokens: tokenLimit,
      temperature: 0.8,
      userPlan,
    });
    let content = data.choices?.[0]?.message?.content || "";
    // Strip Qwen3 <think>...</think> reasoning blocks (handles missing closing tag safely)
    content = content.replace(/<think>[\s\S]*?(?:<\/think>|$)/gi, '').trim();
    return jsonRes({ content, model, provider });
  } catch (e) {
    return jsonRes({ error: "Semua model AI sedang sibuk. Coba lagi sebentar." }, 503);
  }
}

// ─────────────────────────────────────────────────────
// WEBSITE SCAN STRUK PROXY — /scan-receipt
// ─────────────────────────────────────────────────────
async function handleScanReceipt(uid, body, env) {
  const { image, mime = "image/jpeg" } = body;
  if (!image) return jsonRes({ error: "image (base64) diperlukan" }, 400);
  if (!ALLOWED_IMAGE_MIMES.has(mime)) return jsonRes({ error: "Format gambar tidak didukung" }, 415);
  const base64 = String(image).replace(/^data:[^;]+;base64,/, "");
  const estimatedBytes = Math.floor(base64.length * 0.75);
  if (estimatedBytes <= 0 || estimatedBytes > MAX_RECEIPT_BYTES) {
    return jsonRes({ error: "Ukuran gambar maksimum 8 MB" }, 413);
  }

  let userPlan = 'free';
  if (uid) {
    const u = await env.DB.prepare("SELECT plan FROM users WHERE id = ?").bind(uid).first();
    if (u?.plan === 'premium') userPlan = 'premium';
  }

  const result = await ocrReceipt(base64, mime, env, userPlan);
  if (result._error) return jsonRes({ error: result._error }, 422);
  return jsonRes(result);
}

// ─────────────────────────────────────────────────────
// RESOLVE HELPERS
// ─────────────────────────────────────────────────────
function resolveAccount(accountName, accs) {
  if (!accs.length) return null;
  if (!accountName) return accs.length === 1 ? accs[0] : null;

  const q = accountName.toLowerCase().trim();

  // 1. Direct or containment match of full name or clean name (e.g. "mandiri tabungan" matches "mandiri")
  for (const a of accs) {
    const accName = a.name.toLowerCase();
    const cleanName = accName.replace(/\bbank\b|\be-wallet\b|\bcard\b|\bwallet\b|\btabungan\b|\brekening\b/gi, "").trim();
    if (q.includes(accName) || accName.includes(q) || (cleanName.length >= 3 && (q.includes(cleanName) || cleanName.includes(q)))) {
      return a;
    }
  }

  // 2. Dynamic abbreviation/initials matching (e.g. account "Bank Central Asia" -> "bca", "Bank Rakyat Indonesia" -> "bri")
  for (const a of accs) {
    const accName = a.name.toLowerCase();
    const cleanName = accName.replace(/\bbank\b|\be-wallet\b|\bcard\b|\bwallet\b|\btabungan\b|\brekening\b/gi, "").trim();
    
    // Check clean name initials (e.g., "central asia" -> "ca")
    const words = cleanName.split(/\s+/).filter(w => w.length > 0);
    if (words.length >= 2) {
      const initials = words.map(w => w[0]).join("");
      if (initials.length >= 2 && (q.includes(initials) || initials.includes(q))) {
        return a;
      }
    }
    
    // Check full name initials (e.g., "bank central asia" -> "bca")
    const allWords = accName.split(/\s+/).filter(w => w.length > 0);
    if (allWords.length >= 2) {
      const allInitials = allWords.map(w => w[0]).join("");
      if (allInitials.length >= 2 && (q.includes(allInitials) || allInitials.includes(q))) {
        return a;
      }
    }
  }

  // 3. Keyword matching (e.g. "Mandiri Tabungan" -> keyword "mandiri")
  for (const a of accs) {
    const accName = a.name.toLowerCase();
    const cleanName = accName.replace(/\bbank\b|\be-wallet\b|\bcard\b|\bwallet\b|\btabungan\b|\brekening\b/gi, "").trim();
    const keywords = cleanName.split(/\s+/).filter(w => w.length >= 3);
    for (const kw of keywords) {
      if (q.includes(kw) || kw.includes(q)) {
        return a;
      }
    }
  }

  // 4. Standard Alias Fallbacks (for mapping slang words that might not be in the account name directly)
  const ALIASES = {
    "central asia": "bca", "rakyat indonesia": "bri", "tabungan negara": "btn",
    "negara indonesia": "bni", "cimb niaga": "cimb", "ocbc nisp": "ocbc",
    "permata": "permata", "danamon": "danamon", "mandiri": "mandiri",
    "gopay": "gopay", "ovo": "ovo", "dana": "dana", "shopeepay": "shopeepay",
    "spay": "shopeepay", "linkaja": "linkaja", "flip": "flip", "tunai": "tunai",
    "cash": "tunai", "jago": "jago", "seabank": "seabank", "blu": "blu",
    "neo": "neo", "allo": "allo", "aladin": "aladin", "superbank": "superbank",
    "line": "line", "jenius": "jenius", "saqu": "saqu", "raya": "raya"
  };

  let target = q;
  for (const [k, v] of Object.entries(ALIASES)) {
    if (q.includes(k)) {
      target = v;
      break;
    }
  }

  for (const a of accs) {
    const accName = a.name.toLowerCase();
    const cleanName = accName.replace(/\bbank\b|\be-wallet\b|\bcard\b|\bwallet\b|\btabungan\b|\brekening\b/gi, "").trim();
    if (accName.includes(target) || cleanName.includes(target) || target.includes(cleanName)) {
      return a;
    }
  }

  return null;
}

function resolveCategory(catName, note, store, type, cats) {
  if (!cats.length) return null;
  if (catName) {
    const matched = cats.find(c => c.name.toLowerCase().includes(catName.toLowerCase()));
    if (matched) return matched;
  }
  
  const text = ((note || "") + " " + (store || "")).toLowerCase();
  
  if (text.includes("makan") || text.includes("minum") || text.includes("bakso") || text.includes("kopi") || text.includes("cafe") || text.includes("warung") || text.includes("resto") || text.includes("teh") || text.includes("susu") || text.includes("martabak")) {
    return cats.find(c => c.id === "c1") || cats.find(c => c.name.includes("Makanan"));
  }
  if (text.includes("gojek") || text.includes("grab") || text.includes("bensin") || text.includes("parkir") || text.includes("transport") || text.includes("ojek") || text.includes("taksi") || text.includes("kereta") || text.includes("tiket")) {
    return cats.find(c => c.id === "c2") || cats.find(c => c.name.includes("Transportasi"));
  }
  if (text.includes("beli") || text.includes("belanja") || text.includes("baju") || text.includes("sepatu") || text.includes("tokopedia") || text.includes("shopee") || text.includes("indomaret") || text.includes("alfamart") || text.includes("supermarket")) {
    return cats.find(c => c.id === "c3") || cats.find(c => c.name.includes("Belanja"));
  }
  if (text.includes("listrik") || text.includes("air") || text.includes("pdam") || text.includes("wifi") || text.includes("pulsa") || text.includes("internet") || text.includes("bpjs") || text.includes("kontrakan") || text.includes("kos")) {
    return cats.find(c => c.id === "c4") || cats.find(c => c.name.includes("Tagihan"));
  }
  if (text.includes("bioskop") || text.includes("nonton") || text.includes("game") || text.includes("travel") || text.includes("hiburan") || text.includes("wisata") || text.includes("staycation")) {
    return cats.find(c => c.id === "c5") || cats.find(c => c.name.includes("Hiburan"));
  }
  if (text.includes("obat") || text.includes("sakit") || text.includes("dokter") || text.includes("klinik") || text.includes("apotek") || text.includes("rs") || text.includes("sehat")) {
    return cats.find(c => c.id === "c6") || cats.find(c => c.name.includes("Kesehatan"));
  }
  if (text.includes("buku") || text.includes("sekolah") || text.includes("kuliah") || text.includes("kursus") || text.includes("pendidikan") || text.includes("spp") || text.includes("latihan")) {
    return cats.find(c => c.id === "c7") || cats.find(c => c.name.includes("Pendidikan"));
  }
  if (text.includes("rumah") || text.includes("renovasi") || text.includes("furniture") || text.includes("perabot") || text.includes("peralatan")) {
    return cats.find(c => c.id === "c13") || cats.find(c => c.name.includes("Rumah Tangga"));
  }
  if (text.includes("salon") || text.includes("skincare") || text.includes("perawatan") || text.includes("kecantikan") || text.includes("spa")) {
    return cats.find(c => c.id === "c14") || cats.find(c => c.name.includes("Perawatan"));
  }
  if (text.includes("pajak") || text.includes("denda")) {
    return cats.find(c => c.id === "c15") || cats.find(c => c.name.includes("Pajak"));
  }
  if (text.includes("cicilan") || text.includes("kredit") || text.includes("angsuran") || text.includes("hutang")) {
    return cats.find(c => c.id === "c16") || cats.find(c => c.name.includes("Cicilan"));
  }
  if (text.includes("donasi") || text.includes("zakat") || text.includes("sedekah") || text.includes("infaq") || text.includes("amal") || text.includes("sosial")) {
    return cats.find(c => c.id === "c17") || cats.find(c => c.name.includes("Sosial"));
  }
  if (text.includes("gaji") || text.includes("honor") || text.includes("upah")) {
    return cats.find(c => c.id === "c8") || cats.find(c => c.name.includes("Gaji"));
  }
  if (text.includes("freelance") || text.includes("jasa") || text.includes("proyek")) {
    return cats.find(c => c.id === "c9") || cats.find(c => c.name.includes("Freelance"));
  }
  if (text.includes("reksa") || text.includes("saham") || text.includes("crypto") || text.includes("investasi") || text.includes("emas") || text.includes("obligasi") || text.includes("dividen")) {
    return cats.find(c => c.id === "c10") || cats.find(c => c.name.includes("Investasi"));
  }
  if (text.includes("hadiah") || text.includes("gift")) {
    return cats.find(c => c.id === "c11") || cats.find(c => c.name.includes("Hadiah"));
  }
  if (text.includes("bonus") || text.includes("thr") || text.includes("insentif")) {
    return cats.find(c => c.id === "c18") || cats.find(c => c.name.includes("Bonus"));
  }
  if (text.includes("jual") || text.includes("penjualan")) {
    return cats.find(c => c.id === "c19") || cats.find(c => c.name.includes("Penjualan"));
  }
  if (text.includes("refund") || text.includes("cashback") || text.includes("pengembalian")) {
    return cats.find(c => c.id === "c20") || cats.find(c => c.name.includes("Refund"));
  }
  if (text.includes("tabung") || text.includes("nabung") || text.includes("saving")) {
    return cats.find(c => c.id === "c21") || cats.find(c => c.name.includes("Tabungan"));
  }
  if (type === "income") {
    return cats.find(c => c.id === "c22") || cats.find(c => c.name.includes("Pemasukan Lainnya")) || cats[0];
  }
  return cats.find(c => c.id === "c23") || cats.find(c => c.name.includes("Pengeluaran Lainnya")) || cats[0];
}

// ─────────────────────────────────────────────────────
// ADMIN API HANDLERS
// ─────────────────────────────────────────────────────
async function handleAdminOtpRequest(body, env) {
  const { telegram_id } = body || {};
  if (!telegram_id) return jsonRes({ error: "Telegram ID wajib diisi" }, 400);

  const adminTelegramId = env.ADMIN_TELEGRAM_ID;
  if (!adminTelegramId) {
    return jsonRes({ error: "Server misconfigured: ADMIN_TELEGRAM_ID tidak diatur" }, 500);
  }

  // Generic message for security (don't reveal if ID matches or not)
  if (String(telegram_id).trim() !== String(adminTelegramId).trim()) {
    // Return a mock success response to avoid admin username/ID harvesting
    return jsonRes({ ok: true, message: "Jika ID terdaftar sebagai admin, OTP akan dikirim." });
  }

  const token = env.ADMIN_BOT_TOKEN;
  if (!token) {
    return jsonRes({ error: "Server misconfigured: ADMIN_BOT_TOKEN tidak diatur" }, 500);
  }

  // Generate 6-digit OTP
  const otp = secureSixDigitCode();

  // Send OTP message to admin Telegram
  try {
    const text = `🔐 *Kode OTP Admin Panel LaksaApp*\n\nKode verifikasi Anda adalah: \`${otp}\`\n\nKode ini hanya berlaku selama 3 menit. Jangan bagikan kode ini kepada siapapun!`;
    const tgResp = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: adminTelegramId, text, parse_mode: 'Markdown' })
    });

    if (!tgResp.ok) {
      const err = await tgResp.text();
      console.error("Telegram Send OTP Error:", err);
      return jsonRes({ error: "Gagal mengirim OTP ke Telegram. Pastikan Anda sudah memulai chat dengan Bot Admin." }, 500);
    }
  } catch (e) {
    console.error("Telegram Send OTP Exception:", e);
    return jsonRes({ error: "Gagal mengirim OTP ke Telegram." }, 500);
  }

  // State token containing hashed OTP (stateless verification)
  // HMAC (berkunci) — bukan SHA-256 polos. OTP 6 digit hanya 1 juta kombinasi,
  // jadi digest tanpa kunci bisa dipecahkan offline dalam hitungan detik.
  const otpHash = await hmacHex(otp, env.JWT_SECRET);

  const nowSec = Math.floor(Date.now() / 1000);
  const challengeId = crypto.randomUUID();
  await env.DB.prepare(
    "INSERT INTO otp_challenges (id, purpose, subject_id, otp_hash, expires_at, attempts, used_at) VALUES (?, 'admin_otp', ?, ?, ?, 0, NULL)"
  ).bind(challengeId, String(adminTelegramId), otpHash, new Date((nowSec + 180) * 1000).toISOString()).run();
  const stateToken = await signJWT(
    { telegram_id: adminTelegramId, challenge_id: challengeId, otp_exp: nowSec + 180, purpose: "admin_otp" },
    env.JWT_SECRET
  );

  return jsonRes({ ok: true, state_token: stateToken, message: "Kode OTP telah dikirim ke Telegram Anda." });
}

async function handleAdminOtpVerify(body, ip, env) {
  const { otp, state_token } = body || {};
  if (!otp || !state_token) {
    return jsonRes({ error: "OTP dan state token wajib diisi" }, 400);
  }

  const payload = await verifyJWT(state_token, env.JWT_SECRET);
  if (!payload || payload.purpose !== "admin_otp") {
    return jsonRes({ error: "Sesi verifikasi tidak valid atau telah kedaluwarsa" }, 400);
  }

  const nowSec = Math.floor(Date.now() / 1000);
  if (!payload.otp_exp || nowSec > payload.otp_exp) {
    return jsonRes({ error: "Kode OTP telah kedaluwarsa. Silakan minta kode baru." }, 400);
  }
  const challenge = await env.DB.prepare(
    "SELECT otp_hash, expires_at, attempts, used_at FROM otp_challenges WHERE id = ? AND purpose = 'admin_otp'"
  ).bind(payload.challenge_id).first();
  if (!challenge || challenge.used_at || challenge.attempts >= 5 || new Date(challenge.expires_at) <= new Date()) {
    return jsonRes({ error: "Sesi verifikasi tidak valid atau sudah digunakan" }, 400);
  }
  await env.DB.prepare("UPDATE otp_challenges SET attempts = attempts + 1 WHERE id = ?")
    .bind(payload.challenge_id).run();

  // Compare hash
  const inputHash = await hmacHex(otp.trim(), env.JWT_SECRET);

  if (!timingSafeEqual(inputHash, challenge.otp_hash)) {
    return jsonRes({ error: "Kode OTP salah" }, 400);
  }
  const claim = await env.DB.prepare(
    "UPDATE otp_challenges SET used_at = ? WHERE id = ? AND used_at IS NULL"
  ).bind(new Date().toISOString(), payload.challenge_id).run();
  if (!claim?.meta?.changes) return jsonRes({ error: "Kode OTP sudah digunakan" }, 400);

  // Generate Admin JWT Token
  const adminToken = await signJWT(
    { sub: payload.telegram_id, role: "admin" },
    env.JWT_SECRET
  );

  // Log action
  await logAdminAction(payload.telegram_id, "login", null, { ip }, env);

  return jsonRes({
    token: adminToken,
    admin: { telegram_id: payload.telegram_id }
  });
}

async function handleAdminStats(adminId, env) {
  try {
    const totalUsers = await env.DB.prepare("SELECT COUNT(*) as cnt FROM users").first();
    const premiumUsers = await env.DB.prepare("SELECT COUNT(*) as cnt FROM users WHERE plan = 'premium'").first();
    const bannedUsers = await env.DB.prepare("SELECT COUNT(*) as cnt FROM users WHERE is_banned = 1").first();
    
    const revenue = await env.DB.prepare("SELECT SUM(amount) as total FROM payment_requests WHERE status = 'approved'").first();
    const recentPayments = await env.DB.prepare(
      "SELECT id, user_id, email, pricing_id, amount, provider_total, status, created_at, resolved_at, resolved_by FROM payment_requests ORDER BY created_at DESC LIMIT 10"
    ).all();
    
    // Growth metrics (last 30 days)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const newUsersLast30Days = await env.DB.prepare("SELECT COUNT(*) as cnt FROM users WHERE created_at >= ?").bind(thirtyDaysAgo).first();

    return jsonRes({
      stats: {
        total_users: totalUsers?.cnt || 0,
        premium_users: premiumUsers?.cnt || 0,
        banned_users: bannedUsers?.cnt || 0,
        total_revenue: revenue?.total || 0,
        new_users_30d: newUsersLast30Days?.cnt || 0
      },
      recent_payments: recentPayments.results || []
    });
  } catch (e) {
    return jsonRes({ error: "Gagal memuat statistik: " + e.message }, 500);
  }
}

async function handleAdminGetUsers(adminId, url, env) {
  try {
    const search = url.searchParams.get("search") || "";
    const plan = url.searchParams.get("plan") || "";
    const status = url.searchParams.get("status") || "";
    const page = Math.max(1, parseInt(url.searchParams.get("page") || "1"));
    const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") || "50")));
    const offset = (page - 1) * limit;

    let query = "SELECT id, email, name, plan, plan_expired_at, is_banned, created_at FROM users WHERE 1=1";
    let countQuery = "SELECT COUNT(*) as cnt FROM users WHERE 1=1";
    const params = [];

    if (search) {
      query += " AND (email LIKE ? OR name LIKE ?)";
      countQuery += " AND (email LIKE ? OR name LIKE ?)";
      params.push(`%${search}%`, `%${search}%`);
    }
    if (plan) {
      query += " AND plan = ?";
      countQuery += " AND plan = ?";
      params.push(plan);
    }
    if (status) {
      if (status === "banned") {
        query += " AND is_banned = 1";
        countQuery += " AND is_banned = 1";
      } else if (status === "active") {
        query += " AND is_banned = 0";
        countQuery += " AND is_banned = 0";
      }
    }

    query += " ORDER BY created_at DESC LIMIT ? OFFSET ?";
    const bindings = [...params, limit, offset];
    
    const users = await env.DB.prepare(query).bind(...bindings).all();
    const total = await env.DB.prepare(countQuery).bind(...params).first();

    return jsonRes({
      users: users.results || [],
      total: total?.cnt || 0,
      page,
      limit
    });
  } catch (e) {
    return jsonRes({ error: "Gagal memuat daftar user: " + e.message }, 500);
  }
}

async function handleAdminGetUserDetail(adminId, userId, env) {
  try {
    const user = await env.DB.prepare("SELECT id, email, name, telegram_id, plan, plan_expired_at, is_banned, created_at FROM users WHERE id = ?").bind(userId).first();
    if (!user) return jsonRes({ error: "User tidak ditemukan" }, 404);

    const txCount = await env.DB.prepare("SELECT COUNT(*) as cnt FROM transactions WHERE user_id = ?").bind(userId).first();
    const payments = await env.DB.prepare(
      "SELECT id, pricing_id, amount, provider_total, status, created_at, resolved_at, resolved_by FROM payment_requests WHERE user_id = ? ORDER BY created_at DESC"
    ).bind(userId).all();

    return jsonRes({
      user,
      stats: {
        transactions_count: txCount?.cnt || 0
      },
      payments: payments.results || []
    });
  } catch (e) {
    return jsonRes({ error: "Gagal memuat detail user: " + e.message }, 500);
  }
}

async function handleAdminBanUser(adminId, userId, env) {
  try {
    const user = await env.DB.prepare("SELECT email FROM users WHERE id = ?").bind(userId).first();
    if (!user) return jsonRes({ error: "User tidak ditemukan" }, 404);

    await env.DB.prepare("UPDATE users SET is_banned = 1, token_version = COALESCE(token_version, 0) + 1 WHERE id = ?").bind(userId).run();
    await logAdminAction(adminId, "ban_user", userId, { email: user.email }, env);
    return jsonRes({ ok: true, message: "User berhasil diblokir" });
  } catch (e) {
    return jsonRes({ error: "Gagal memblokir user: " + e.message }, 500);
  }
}

async function handleAdminUnbanUser(adminId, userId, env) {
  try {
    const user = await env.DB.prepare("SELECT email FROM users WHERE id = ?").bind(userId).first();
    if (!user) return jsonRes({ error: "User tidak ditemukan" }, 404);

    await env.DB.prepare("UPDATE users SET is_banned = 0 WHERE id = ?").bind(userId).run();
    await logAdminAction(adminId, "unban_user", userId, { email: user.email }, env);
    return jsonRes({ ok: true, message: "Blokir user berhasil dibuka" });
  } catch (e) {
    return jsonRes({ error: "Gagal membuka blokir user: " + e.message }, 500);
  }
}

async function handleAdminDeleteUser(adminId, userId, env) {
  try {
    const user = await env.DB.prepare("SELECT email FROM users WHERE id = ?").bind(userId).first();
    if (!user) return jsonRes({ error: "User tidak ditemukan" }, 404);

    // Delete user data (cascade delete)
    await env.DB.prepare("DELETE FROM transaction_items WHERE transaction_id IN (SELECT id FROM transactions WHERE user_id = ?)").bind(userId).run().catch(() => {});
    await env.DB.prepare("DELETE FROM transactions WHERE user_id = ?").bind(userId).run().catch(() => {});
    await env.DB.prepare("DELETE FROM accounts WHERE user_id = ?").bind(userId).run().catch(() => {});
    await env.DB.prepare("DELETE FROM categories WHERE user_id = ?").bind(userId).run().catch(() => {});
    await env.DB.prepare("DELETE FROM budgets WHERE user_id = ?").bind(userId).run().catch(() => {});
    await env.DB.prepare("DELETE FROM goals WHERE user_id = ?").bind(userId).run().catch(() => {});
    await env.DB.prepare("DELETE FROM bills WHERE user_id = ?").bind(userId).run().catch(() => {});
    await env.DB.prepare("DELETE FROM piutang WHERE user_id = ?").bind(userId).run().catch(() => {});
    await env.DB.prepare("DELETE FROM pending_scans WHERE user_id = ?").bind(userId).run().catch(() => {});
    await env.DB.prepare("DELETE FROM pending_texts WHERE user_id = ?").bind(userId).run().catch(() => {});
    await env.DB.prepare("DELETE FROM usage_logs WHERE user_id = ?").bind(userId).run().catch(() => {});
    await env.DB.prepare("DELETE FROM bot_messages WHERE user_id = ?").bind(userId).run().catch(() => {});
    await env.DB.prepare("DELETE FROM users WHERE id = ?").bind(userId).run();

    await logAdminAction(adminId, "delete_user", userId, { email: user.email }, env);
    return jsonRes({ ok: true, message: "User dan semua data berhasil dihapus permanen" });
  } catch (e) {
    return jsonRes({ error: "Gagal menghapus user: " + e.message }, 500);
  }
}

async function handleAdminResetPassword(adminId, userId, body, env) {
  try {
    const { password } = body || {};
    if (!validPassword(password)) return jsonRes({ error: "Password harus 10–256 karakter" }, 400);

    const user = await env.DB.prepare("SELECT email FROM users WHERE id = ?").bind(userId).first();
    if (!user) return jsonRes({ error: "User tidak ditemukan" }, 404);

    const salt = crypto.randomUUID();
    const passwordHash = await hashPassword(password, salt);

    await env.DB.prepare("UPDATE users SET password_hash = ?, salt = ?, pbkdf2_iterations = 600000, token_version = COALESCE(token_version, 0) + 1 WHERE id = ?").bind(passwordHash, salt, userId).run();
    await logAdminAction(adminId, "reset_password", userId, { email: user.email }, env);

    return jsonRes({ ok: true, message: "Password user berhasil direset" });
  } catch (e) {
    return jsonRes({ error: "Gagal mereset password user: " + e.message }, 500);
  }
}

async function handleAdminExtendUser(adminId, userId, body, env) {
  try {
    const { duration } = body || {};
    const user = await env.DB.prepare("SELECT email, plan, plan_expired_at FROM users WHERE id = ?").bind(userId).first();
    if (!user) return jsonRes({ error: "User tidak ditemukan" }, 404);

    let days = 0;
    if (duration === "30d") days = 30;
    else if (duration === "90d") days = 90;
    else if (duration === "365d") days = 365;
    else return jsonRes({ error: "Durasi tidak valid. Gunakan: 30d, 90d, 365d" }, 400);

    let currentExp = user.plan_expired_at ? new Date(user.plan_expired_at).getTime() : Date.now();
    if (currentExp < Date.now()) currentExp = Date.now();

    const expiredAt = new Date(currentExp + days * 24 * 60 * 60 * 1000).toISOString();

    await env.DB.prepare("UPDATE users SET plan = 'premium', plan_expired_at = ? WHERE id = ?").bind(expiredAt, userId).run();
    await logAdminAction(adminId, "extend_premium", userId, { email: user.email, days }, env);

    return jsonRes({ ok: true, message: "Masa aktif premium diperpanjang untuk user " + user.email });
  } catch (e) {
    return jsonRes({ error: "Gagal extend premium: " + e.message }, 500);
  }
}

async function handleAdminRevokeUser(adminId, userId, env) {
  try {
    const user = await env.DB.prepare("SELECT email FROM users WHERE id = ?").bind(userId).first();
    if (!user) return jsonRes({ error: "User tidak ditemukan" }, 404);

    await env.DB.prepare("UPDATE users SET plan = 'free', plan_expired_at = NULL WHERE id = ?").bind(userId).run();
    await logAdminAction(adminId, "revoke_premium", userId, { email: user.email }, env);

    return jsonRes({ ok: true, message: "Premium dicabut untuk user " + user.email });
  } catch (e) {
    return jsonRes({ error: "Gagal mencabut premium: " + e.message }, 500);
  }
}

async function handleAdminGetPricing(adminId, env) {
  try {
    const prices = await env.DB.prepare("SELECT * FROM pricing ORDER BY duration_days ASC").all();
    return jsonRes(prices.results || []);
  } catch (e) {
    return jsonRes({ error: "Gagal mengambil data pricing: " + e.message }, 500);
  }
}

async function handleAdminUpdatePricing(adminId, body, env) {
  try {
    const { id, price, original_price, label, active } = body || {};
    const normalizedId = typeof id === "string" ? id.trim() : "";
    const normalizedLabel = typeof label === "string" ? label.trim() : "";
    const normalizedPrice = Number(price);
    const normalizedOriginalPrice = original_price === null || original_price === undefined || original_price === ""
      ? null
      : Number(original_price);
    const normalizedActive = active === 0 || active === false ? 0 : 1;

    if (!normalizedId || normalizedId.length > 64) {
      return jsonRes({ error: "Pricing ID tidak valid" }, 400);
    }
    if (!normalizedLabel || normalizedLabel.length > 80) {
      return jsonRes({ error: "Label paket harus 1–80 karakter" }, 400);
    }
    if (!Number.isSafeInteger(normalizedPrice) || normalizedPrice < 0 || normalizedPrice > 1_000_000_000) {
      return jsonRes({ error: "Harga paket tidak valid" }, 400);
    }
    if (
      normalizedOriginalPrice !== null &&
      (!Number.isSafeInteger(normalizedOriginalPrice) || normalizedOriginalPrice < 0 || normalizedOriginalPrice > 1_000_000_000)
    ) {
      return jsonRes({ error: "Harga coret tidak valid" }, 400);
    }
    if (normalizedActive === 1 && normalizedPrice < 1) {
      return jsonRes({ error: "Paket aktif harus memiliki harga minimal Rp1" }, 400);
    }
    
    const result = await env.DB.prepare(
      "UPDATE pricing SET price = ?, original_price = ?, label = ?, active = ? WHERE id = ?"
    ).bind(normalizedPrice, normalizedOriginalPrice, normalizedLabel, normalizedActive, normalizedId).run();
    if (!result?.meta?.changes) return jsonRes({ error: "Paket tidak ditemukan" }, 404);

    await logAdminAction(adminId, "update_pricing", normalizedId, {
      price: normalizedPrice,
      original_price: normalizedOriginalPrice,
      label: normalizedLabel,
      active: normalizedActive
    }, env);
    return jsonRes({ ok: true, message: "Pricing berhasil diperbarui" });
  } catch (e) {
    return jsonRes({ error: "Gagal memperbarui pricing: " + e.message }, 500);
  }
}

async function releaseCouponReservation(orderId, env) {
  const payment = await env.DB.prepare("SELECT coupon_code, coupon_reserved FROM payment_requests WHERE id = ?").bind(orderId).first();
  if (!payment?.coupon_code || Number(payment.coupon_reserved) !== 1) return;
  await env.DB.batch([
    env.DB.prepare("UPDATE coupons SET used_count = MAX(0, used_count - 1) WHERE code = ? AND used_count > 0 AND EXISTS (SELECT 1 FROM payment_requests WHERE id = ? AND coupon_reserved = 1)").bind(payment.coupon_code, orderId),
    env.DB.prepare("UPDATE payment_requests SET coupon_reserved = 0 WHERE id = ? AND coupon_reserved = 1").bind(orderId)
  ]);
}

async function createKlikQrisCheckout(uid, pricingId, rawCouponCode, env, { reusePending = false } = {}) {
  const merchantId = String(env.KLIKQRIS_MERCHANT_ID || "").trim();
  const apiKey = String(env.KLIKQRIS_API_KEY || "").trim();
  if (!/^[a-zA-Z0-9_-]{3,100}$/.test(merchantId) || apiKey.length < 16) {
    return { ok: false, status: 503, error: "Pembayaran belum dikonfigurasi" };
  }

  const normalizedPricingId = typeof pricingId === "string" ? pricingId.trim() : "";
  if (!/^[a-zA-Z0-9_-]{1,48}$/.test(normalizedPricingId)) {
    return { ok: false, status: 400, error: "pricing_id tidak valid" };
  }

  const pricing = await env.DB.prepare(
    "SELECT id, label, price, duration_days FROM pricing WHERE id = ? AND active = 1"
  ).bind(normalizedPricingId).first();
  const basePrice = Number(pricing?.price);
  if (!pricing || !Number.isSafeInteger(basePrice) || basePrice < 1 || basePrice > 1_000_000_000) {
    return { ok: false, status: 404, error: "Paket tidak ditemukan" };
  }

  const user = await env.DB.prepare(
    "SELECT email, name, plan, plan_expired_at, is_banned FROM users WHERE id = ?"
  ).bind(uid).first();
  if (!user) return { ok: false, status: 404, error: "User tidak ditemukan" };
  if (user.is_banned) return { ok: false, status: 403, error: "Akun diblokir" };
  if (user.plan === "premium" && !user.plan_expired_at) {
    return { ok: false, status: 409, error: "Akun sudah memiliki Premium Lifetime" };
  }

  let couponCode = null;
  let discount = 0;
  if (rawCouponCode) {
    couponCode = String(rawCouponCode).trim().toUpperCase();
    if (!/^[A-Z0-9]{3,32}$/.test(couponCode)) {
      return { ok: false, status: 400, error: "Kupon tidak valid" };
    }
    const coupon = await env.DB.prepare(
      "SELECT type, value, max_uses, used_count, expired_at FROM coupons WHERE code = ? AND active = 1"
    ).bind(couponCode).first();
    if (!coupon) return { ok: false, status: 400, error: "Kupon tidak valid" };
    if (coupon.max_uses > 0 && coupon.used_count >= coupon.max_uses) {
      return { ok: false, status: 410, error: "Kupon sudah habis" };
    }
    if (coupon.expired_at && new Date(coupon.expired_at) < new Date()) {
      return { ok: false, status: 410, error: "Kupon sudah expired" };
    }
    const couponValue = Number(coupon.value);
    if (!Number.isSafeInteger(couponValue) || couponValue < 0) {
      return { ok: false, status: 400, error: "Nilai kupon tidak valid" };
    }
    discount = coupon.type === "percent"
      ? Math.floor(basePrice * Math.min(couponValue, 100) / 100)
      : couponValue;
  }

  const amount = Math.max(1, basePrice - Math.max(0, Math.min(discount, basePrice - 1)));

  if (reusePending) {
    const existing = couponCode
      ? await env.DB.prepare(`
          SELECT id, provider_total, provider_reference
          FROM payment_requests
          WHERE user_id = ? AND pricing_id = ? AND coupon_code = ?
            AND status = 'pending' AND datetime(created_at) >= datetime('now', '-15 minutes')
          ORDER BY created_at DESC LIMIT 1
        `).bind(uid, normalizedPricingId, couponCode).first()
      : await env.DB.prepare(`
          SELECT id, provider_total, provider_reference
          FROM payment_requests
          WHERE user_id = ? AND pricing_id = ? AND coupon_code IS NULL
            AND status = 'pending' AND datetime(created_at) >= datetime('now', '-15 minutes')
          ORDER BY created_at DESC LIMIT 1
        `).bind(uid, normalizedPricingId).first();
    if (existing?.provider_reference) {
      try {
        const existingUrl = new URL(existing.provider_reference);
        if (
          existingUrl.protocol === "https:" &&
          existingUrl.hostname === "klikqris.com" &&
          Number.isSafeInteger(Number(existing.provider_total))
        ) {
          return {
            ok: true,
            order_id: existing.id,
            amount: Number(existing.provider_total),
            checkout_url: existingUrl.toString(),
            reused: true
          };
        }
      } catch {
        // Abaikan record lama yang URL-nya tidak valid dan buat order baru.
      }
    }
  }

  const reqId = `LAKSA-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
  const createdAt = new Date().toISOString();
  if (couponCode) {
    // Coupon reservation: capacity is consumed atomically before provider creation.
    const reservation = await env.DB.batch([
      env.DB.prepare("UPDATE coupons SET used_count = used_count + 1 WHERE code = ? AND active = 1 AND (max_uses = 0 OR used_count < max_uses)").bind(couponCode),
      env.DB.prepare("INSERT INTO payment_requests (id, user_id, email, pricing_id, amount, coupon_code, coupon_reserved, status, created_at) VALUES (?, ?, ?, ?, ?, ?, 1, 'creating', ?)")
        .bind(reqId, uid, user.email, normalizedPricingId, amount, couponCode, createdAt)
    ]);
    if ((reservation[0]?.meta?.changes || 0) !== 1) {
      await env.DB.prepare("DELETE FROM payment_requests WHERE id = ? AND status = 'creating'").bind(reqId).run();
      return { ok: false, status: 410, error: "Kupon sudah habis" };
    }
  } else {
    await env.DB.prepare(
      "INSERT INTO payment_requests (id, user_id, email, pricing_id, amount, coupon_code, coupon_reserved, status, created_at) VALUES (?, ?, ?, ?, ?, NULL, 0, 'creating', ?)"
    ).bind(reqId, uid, user.email, normalizedPricingId, amount, createdAt).run();
  }

  const createUrl = "https://klikqris.com/api/qris/create";
  let created;
  try {
    const response = await fetchWithTimeout(createUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "x-api-key": apiKey,
        "id_merchant": merchantId
      },
      body: JSON.stringify({
        order_id: reqId,
        id_merchant: merchantId,
        amount,
        keterangan: `Laksa ${String(pricing.label || normalizedPricingId).slice(0, 80)}`,
        callback_url: "https://laksana.haerubirru17.workers.dev/payment/klikqris-webhook"
      })
    }, 15000);
    const payload = await response.json().catch(() => null);
    created = payload?.data;
    if (!response.ok || payload?.status !== true || !created) throw new Error("Provider rejected transaction");
  } catch {
    await env.DB.prepare(
      "UPDATE payment_requests SET status = 'failed' WHERE id = ? AND status = 'creating'"
    ).bind(reqId).run();
    await releaseCouponReservation(reqId, env);
    return { ok: false, status: 502, error: "Gagal membuat pembayaran. Coba lagi." };
  }

  let checkout;
  try {
    checkout = new URL(created.qris_url);
  } catch {
    checkout = null;
  }
  const providerTotal = Number(created.total_amount);
  if (
    created.order_id !== reqId ||
    !checkout ||
    checkout.protocol !== "https:" ||
    checkout.hostname !== "klikqris.com" ||
    !Number.isSafeInteger(providerTotal) ||
    providerTotal < amount ||
    typeof created.signature !== "string" ||
    created.signature.length < 16
  ) {
    await env.DB.prepare(
      "UPDATE payment_requests SET status = 'failed' WHERE id = ? AND status = 'creating'"
    ).bind(reqId).run();
    await releaseCouponReservation(reqId, env);
    return { ok: false, status: 502, error: "Respons penyedia pembayaran tidak valid" };
  }

  await env.DB.prepare(`
    UPDATE payment_requests
    SET status = 'pending', provider_signature = ?, provider_total = ?, provider_reference = ?
    WHERE id = ? AND status = 'creating'
  `).bind(created.signature, providerTotal, checkout.toString(), reqId).run();

  return {
    ok: true,
    order_id: reqId,
    amount: providerTotal,
    checkout_url: checkout.toString(),
    expired_at: created.expired_at || null,
    reused: false
  };
}

async function ensurePaymentIntegritySchema(env) {
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS payment_outbox (
    id TEXT PRIMARY KEY,
    payment_id TEXT NOT NULL UNIQUE,
    user_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    attempts INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`).run();
  await env.DB.prepare("ALTER TABLE payment_requests ADD COLUMN coupon_reserved INTEGER NOT NULL DEFAULT 0").run().catch(() => {});
}

async function handleKlikQrisWebhook(body, env) {
  await ensurePaymentIntegritySchema(env);
  const merchantId = String(env.KLIKQRIS_MERCHANT_ID || "").trim();
  const apiKey = String(env.KLIKQRIS_API_KEY || "").trim();
  if (!merchantId || !apiKey) return jsonRes({ error: "Payment provider misconfigured" }, 503);

  const payload = body?.data && typeof body.data === "object" ? body.data : body;
  const orderId = typeof payload?.order_id === "string" ? payload.order_id : "";
  const callbackStatus = String(payload?.status || "").toUpperCase();
  const callbackSignature = typeof payload?.signature === "string" ? payload.signature : "";
  if (
    !/^LAKSA-\d{10,}-[a-f0-9-]{8}$/i.test(orderId) ||
    !["PAID", "SUCCESS", "EXPIRED"].includes(callbackStatus) ||
    payload?.merchant_id && String(payload.merchant_id) !== merchantId
  ) {
    return jsonRes({ status: false, error: "Invalid webhook payload" }, 400);
  }

  const payment = await env.DB.prepare(`
    SELECT pr.*, p.duration_days, p.label
    FROM payment_requests pr
    JOIN pricing p ON p.id = pr.pricing_id
    WHERE pr.id = ?
  `).bind(orderId).first();
  if (!payment) return jsonRes({ status: false, error: "Payment not found" }, 404);
  if (payment.status === "approved") return jsonRes({ status: true, duplicate: true });
  if (
    !payment.provider_signature ||
    !callbackSignature ||
    !timingSafeEqual(callbackSignature, payment.provider_signature)
  ) {
    return jsonRes({ status: false, error: "Invalid signature" }, 403);
  }

  const statusUrl = `https://klikqris.com/api/qris/status/${encodeURIComponent(orderId)}`;

  let providerTransaction;
  try {
    const response = await fetchWithTimeout(statusUrl, {
      headers: {
        "Accept": "application/json",
        "x-api-key": apiKey,
        "id_merchant": merchantId
      }
    }, 15000);
    if (!response.ok) return jsonRes({ status: false, error: "Payment verification unavailable" }, 502);
    const verified = await response.json();
    providerTransaction = verified?.data;
  } catch {
    return jsonRes({ status: false, error: "Payment verification unavailable" }, 502);
  }

  const verifiedStatus = String(providerTransaction?.status || "").toUpperCase();
  const verifiedOrder = providerTransaction?.order_id === orderId;
  const verifiedSignature = timingSafeEqual(String(providerTransaction?.signature || ""), payment.provider_signature);
  const verifiedAmount = Number(providerTransaction?.total_amount) === Number(payment.provider_total);
  if (!verifiedOrder || !verifiedSignature || !verifiedAmount) {
    return jsonRes({ status: false, error: "Payment is not verified" }, 409);
  }
  if (verifiedStatus === "EXPIRED") {
    await env.DB.prepare("UPDATE payment_requests SET status = 'expired', resolved_at = ?, resolved_by = 'klikqris' WHERE id = ? AND status IN ('creating', 'pending')")
      .bind(new Date().toISOString(), orderId).run();
    await releaseCouponReservation(orderId, env);
    return jsonRes({ status: true, expired: true });
  }
  if (verifiedStatus !== "SUCCESS") {
    return jsonRes({ status: false, error: "Payment is not verified" }, 409);
  }

  const now = new Date().toISOString();
  const statements = [];
  // Coupon reservation was consumed atomically when the order was created.

  if (Number(payment.duration_days) === 0) {
    statements.push(env.DB.prepare(`
      UPDATE users SET plan = 'premium', plan_expired_at = NULL
      WHERE id = ? AND EXISTS (
        SELECT 1 FROM payment_requests WHERE id = ? AND status = 'pending'
      )
    `).bind(payment.user_id, orderId));
  } else {
    const seconds = Math.floor(Number(payment.duration_days) * 86400);
    statements.push(env.DB.prepare(`
      UPDATE users
      SET plan = 'premium',
          plan_expired_at = CASE
            WHEN plan = 'premium' AND plan_expired_at IS NULL THEN NULL
            ELSE datetime(MAX(unixepoch('now'), COALESCE(unixepoch(plan_expired_at), 0)) + ?, 'unixepoch')
          END
      WHERE id = ? AND EXISTS (
        SELECT 1 FROM payment_requests WHERE id = ? AND status = 'pending'
      )
    `).bind(seconds, payment.user_id, orderId));
  }

  statements.push(env.DB.prepare(`
    INSERT OR IGNORE INTO payment_outbox (id, payment_id, user_id, status)
    SELECT ?, id, user_id, 'pending' FROM payment_requests WHERE id = ? AND status = 'pending'
  `).bind(`outbox_${orderId}`, orderId));
  statements.push(env.DB.prepare(`
    UPDATE payment_requests
    SET status = 'approved', resolved_at = ?, resolved_by = 'klikqris'
    WHERE id = ? AND status = 'pending'
  `).bind(now, orderId));

  const results = await env.DB.batch(statements);
  const fulfilled = (results.at(-1)?.meta?.changes || 0) === 1;
  if (!fulfilled) return jsonRes({ ok: true, duplicate: true });

  await logAdminAction("klikqris", "approve_premium", payment.user_id, {
    order_id: orderId,
    amount: Number(payment.provider_total),
    pricing_id: payment.pricing_id
  }, env);

  await retryFailedOutbox(env, orderId);
  return jsonRes({ status: true });
}

async function retryFailedOutbox(env, onlyPaymentId = null) {
  await ensurePaymentIntegritySchema(env);
  const query = onlyPaymentId
    ? "SELECT o.*, u.telegram_id, p.pricing_id FROM payment_outbox o JOIN users u ON u.id = o.user_id JOIN payment_requests p ON p.id = o.payment_id WHERE o.payment_id = ? AND (o.status IN ('pending','failed') OR (o.status = 'processing' AND o.updated_at < datetime('now', '-5 minutes'))) AND o.attempts < 5"
    : "SELECT o.*, u.telegram_id, p.pricing_id FROM payment_outbox o JOIN users u ON u.id = o.user_id JOIN payment_requests p ON p.id = o.payment_id WHERE (o.status IN ('pending','failed') OR (o.status = 'processing' AND o.updated_at < datetime('now', '-5 minutes'))) AND o.attempts < 5 ORDER BY o.created_at LIMIT 20";
  const result = onlyPaymentId
    ? await env.DB.prepare(query).bind(onlyPaymentId).all()
    : await env.DB.prepare(query).all();
  for (const row of result.results || []) {
    const claimed = await env.DB.prepare("UPDATE payment_outbox SET status = 'processing', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND (status IN ('pending','failed') OR (status = 'processing' AND updated_at < datetime('now', '-5 minutes')))")
      .bind(row.id).run();
    if ((claimed.meta?.changes || 0) !== 1) continue;
    if (!row.telegram_id) {
      await env.DB.prepare("UPDATE payment_outbox SET status = 'completed', updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(row.id).run();
      continue;
    }
    try {
      await tgSend(row.telegram_id, `✅ *Pembayaran berhasil diverifikasi.*\n\nPaket Premium sudah aktif otomatis.\nID pembayaran: \`${row.payment_id}\``, env);
      await env.DB.prepare("UPDATE payment_outbox SET status = 'completed', attempts = attempts + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(row.id).run();
    } catch {
      await env.DB.prepare("UPDATE payment_outbox SET status = 'failed', attempts = attempts + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(row.id).run();
    }
  }
}

async function reconcilePendingPayments(env) {
  await ensurePaymentIntegritySchema(env);
  const merchantId = String(env.KLIKQRIS_MERCHANT_ID || "").trim();
  const apiKey = String(env.KLIKQRIS_API_KEY || "").trim();
  if (!merchantId || !apiKey) return;
  const { results = [] } = await env.DB.prepare("SELECT id, provider_signature FROM payment_requests WHERE status IN ('creating', 'pending') AND provider_signature IS NOT NULL ORDER BY created_at LIMIT 20").all();
  for (const payment of results) {
    try {
      const response = await fetchWithTimeout(`https://klikqris.com/api/qris/status/${encodeURIComponent(payment.id)}`, {
        headers: { "Accept": "application/json", "x-api-key": apiKey, "id_merchant": merchantId }
      }, 15000);
      if (!response.ok) continue;
      const payload = await response.json();
      const transaction = payload?.data;
      const status = String(transaction?.status || '').toUpperCase();
      if (!["SUCCESS", "EXPIRED"].includes(status)) continue;
      await handleKlikQrisWebhook({
        order_id: payment.id,
        status,
        signature: transaction.signature
      }, env);
    } catch (error) {
      console.error("payment reconciliation:", payment.id, error.message);
    }
  }
  await retryFailedOutbox(env);
}

async function handleAdminGetCoupons(adminId, env) {
  try {
    const coupons = await env.DB.prepare("SELECT * FROM coupons ORDER BY created_at DESC").all();
    return jsonRes(coupons.results || []);
  } catch (e) {
    return jsonRes({ error: "Gagal mengambil data kupon: " + e.message }, 500);
  }
}

async function handleAdminCreateCoupon(adminId, body, env) {
  try {
    const { code, type, value, description, max_uses, expired_at } = body || {};
    const normalizedCode = typeof code === "string" ? code.trim().toUpperCase() : "";
    const normalizedDescription = typeof description === "string" ? description.trim() : "";
    const normalizedValue = Number(value);
    const normalizedMaxUses = Number(max_uses ?? 0);

    if (!normalizedCode || !type || value === undefined) {
      return jsonRes({ error: "Code, type, dan value wajib diisi" }, 400);
    }
    if (!/^[A-Z0-9]{3,32}$/.test(normalizedCode)) {
      return jsonRes({ error: "Kode kupon harus 3–32 huruf/angka" }, 400);
    }
    if (!["percent", "fixed"].includes(type)) {
      return jsonRes({ error: "Tipe kupon tidak valid" }, 400);
    }
    if (
      !Number.isSafeInteger(normalizedValue) ||
      normalizedValue < 1 ||
      normalizedValue > 1_000_000_000 ||
      (type === "percent" && normalizedValue > 100)
    ) {
      return jsonRes({ error: "Nilai kupon tidak valid" }, 400);
    }
    if (!Number.isSafeInteger(normalizedMaxUses) || normalizedMaxUses < 0 || normalizedMaxUses > 1_000_000) {
      return jsonRes({ error: "Batas penggunaan kupon tidak valid" }, 400);
    }
    if (normalizedDescription.length > 240) {
      return jsonRes({ error: "Deskripsi kupon maksimal 240 karakter" }, 400);
    }
    let normalizedExpiry = null;
    if (expired_at) {
      const parsedExpiry = new Date(expired_at);
      if (Number.isNaN(parsedExpiry.getTime())) {
        return jsonRes({ error: "Tanggal kedaluwarsa tidak valid" }, 400);
      }
      normalizedExpiry = parsedExpiry.toISOString();
    }

    const couponId = "cpn_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6);
    await env.DB.prepare(
      "INSERT INTO coupons (id, code, type, value, description, max_uses, expired_at, active) VALUES (?, ?, ?, ?, ?, ?, ?, 1)"
    ).bind(
      couponId,
      normalizedCode,
      type,
      normalizedValue,
      normalizedDescription || null,
      normalizedMaxUses,
      normalizedExpiry
    ).run();

    await logAdminAction(adminId, "create_coupon", normalizedCode, { type, value: normalizedValue }, env);
    return jsonRes({ ok: true, message: "Kupon berhasil dibuat" });
  } catch (e) {
    return jsonRes({ error: "Gagal membuat kupon: " + e.message }, 500);
  }
}

async function handleAdminDeleteCoupon(adminId, code, env) {
  try {
    if (!code) return jsonRes({ error: "Kode kupon diperlukan" }, 400);

    await env.DB.prepare("DELETE FROM coupons WHERE code = ?").bind(code.toUpperCase().trim()).run();
    await logAdminAction(adminId, "delete_coupon", code.toUpperCase().trim(), null, env);
    return jsonRes({ ok: true, message: "Kupon berhasil dihapus" });
  } catch (e) {
    return jsonRes({ error: "Gagal menghapus kupon: " + e.message }, 500);
  }
}

async function handleAdminGetAuditLogs(adminId, url, env) {
  try {
    const page = Math.max(1, parseInt(url.searchParams.get("page") || "1"));
    const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") || "50")));
    const offset = (page - 1) * limit;

    const logs = await env.DB.prepare(
      "SELECT * FROM admin_audit_logs ORDER BY created_at DESC LIMIT ? OFFSET ?"
    ).bind(limit, offset).all();

    const total = await env.DB.prepare("SELECT COUNT(*) as cnt FROM admin_audit_logs").first();

    return jsonRes({
      logs: logs.results || [],
      total: total?.cnt || 0,
      page,
      limit
    });
  } catch (e) {
    return jsonRes({ error: "Gagal mengambil log audit: " + e.message }, 500);
  }
}


// ─────────────────────────────────────────────────────
// DATABASE & SEEDING HELPERS
// ─────────────────────────────────────────────────────
async function setupDatabase(env) {
  try {
    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        salt TEXT NOT NULL,
        pbkdf2_iterations INTEGER NOT NULL DEFAULT 600000,
        telegram_id TEXT,
        plan TEXT DEFAULT 'free',
        plan_expired_at DATETIME,
        is_banned INTEGER DEFAULT 0,
        token_version INTEGER NOT NULL DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `).run();

    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS accounts (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        name TEXT NOT NULL,
        balance REAL DEFAULT 0,
        color TEXT
      )
    `).run();

    // Fail closed: a legacy single-column primary key needs a reviewed copy migration.
    const { results: categoryColumns } = await env.DB.prepare("PRAGMA table_info(categories)").all();
    if (categoryColumns && categoryColumns.length > 0) {
      const pkCols = categoryColumns.filter(column => column.pk > 0);
      if (pkCols.length === 1 && pkCols[0].name === "id") {
        throw new Error("Legacy categories schema requires an explicit backup-and-copy migration");
      }
    }

    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS categories (
        id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        name TEXT NOT NULL,
        emoji TEXT,
        type TEXT NOT NULL,
        PRIMARY KEY (id, user_id)
      )
    `).run();

    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS transactions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        date TEXT NOT NULL,
        type TEXT NOT NULL,
        amount REAL NOT NULL,
        note TEXT,
        store TEXT,
        account_id TEXT NOT NULL,
        category_id TEXT,
        raw_text TEXT,
        source TEXT,
        transfer_group_id TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `).run();

    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS budgets (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        category_id TEXT NOT NULL,
        limit_amount REAL NOT NULL,
        month TEXT NOT NULL
      )
    `).run();

    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS goals (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        name TEXT NOT NULL,
        target REAL NOT NULL,
        current REAL DEFAULT 0,
        deadline TEXT,
        icon TEXT
      )
    `).run();

    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS bills (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        name TEXT NOT NULL,
        amount REAL DEFAULT 0,
        status TEXT DEFAULT 'unpaid',
        due_type TEXT DEFAULT 'monthly',
        due_day INTEGER,
        due_date TEXT,
        paid_date TEXT
      )
    `).run();

    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS pending_scans (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        store TEXT,
        amount REAL,
        date TEXT,
        note TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `).run();

    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS piutang (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        borrower_name TEXT NOT NULL,
        amount REAL NOT NULL DEFAULT 0,
        returned REAL NOT NULL DEFAULT 0,
        note TEXT,
        lend_date TEXT,
        due_date TEXT,
        status TEXT NOT NULL DEFAULT 'active',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `).run();

    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS pending_texts (
        chat_id TEXT PRIMARY KEY,
        data TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `).run();

    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS processed_bot_updates_v2 (
        update_id TEXT PRIMARY KEY,
        status TEXT NOT NULL DEFAULT 'completed',
        payload TEXT,
        attempts INTEGER NOT NULL DEFAULT 0,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `).run();

    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS transaction_items (
        id TEXT PRIMARY KEY,
        transaction_id TEXT NOT NULL,
        name TEXT NOT NULL,
        qty INTEGER DEFAULT 1,
        price REAL DEFAULT 0
      )
    `).run();

    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS bot_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        chat_id TEXT NOT NULL,
        message_id INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `).run();

    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS usage_logs (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        feature TEXT NOT NULL,
        used_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `).run();

    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS pricing (
        id TEXT PRIMARY KEY,
        duration_days INTEGER NOT NULL,
        price INTEGER NOT NULL,
        label TEXT NOT NULL,
        active INTEGER DEFAULT 1
      )
    `).run();

    // Add new columns to existing users table (ignore if already exist)
    await env.DB.prepare("ALTER TABLE users ADD COLUMN plan TEXT DEFAULT 'free'").run().catch(() => {});
    await env.DB.prepare("ALTER TABLE users ADD COLUMN plan_expired_at DATETIME").run().catch(() => {});
    await env.DB.prepare("ALTER TABLE users ADD COLUMN is_banned INTEGER DEFAULT 0").run().catch(() => {});
    await env.DB.prepare("ALTER TABLE users ADD COLUMN token_version INTEGER NOT NULL DEFAULT 0").run().catch(() => {});
    await env.DB.prepare("ALTER TABLE users ADD COLUMN pbkdf2_iterations INTEGER NOT NULL DEFAULT 100000").run().catch(() => {});
    await env.DB.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_telegram_unique ON users (telegram_id) WHERE telegram_id IS NOT NULL").run()
      .catch(e => console.error("telegram unique index migration requires duplicate cleanup:", e.message));

    // Create indexes for usage_logs
    await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_usage_user_feature_date ON usage_logs (user_id, feature, used_at)").run();

    // Add idempotency_key column to transactions (idempotent migration)
    await env.DB.prepare("ALTER TABLE transactions ADD COLUMN idempotency_key TEXT").run().catch(() => {});
    await env.DB.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_tx_idempotency ON transactions (idempotency_key) WHERE idempotency_key IS NOT NULL").run().catch(() => {});

    // Payment requests table
    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS payment_requests (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        email TEXT NOT NULL,
        pricing_id TEXT,
        amount INTEGER,
        coupon_code TEXT,
        coupon_reserved INTEGER NOT NULL DEFAULT 0,
        provider_signature TEXT,
        provider_total INTEGER,
        provider_reference TEXT,
        status TEXT DEFAULT 'pending',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        resolved_at DATETIME,
        resolved_by TEXT
      )
    `).run();
    await env.DB.prepare("ALTER TABLE payment_requests ADD COLUMN coupon_code TEXT").run().catch(() => {});
    await env.DB.prepare("ALTER TABLE payment_requests ADD COLUMN coupon_reserved INTEGER NOT NULL DEFAULT 0").run().catch(() => {});
    await env.DB.prepare("ALTER TABLE payment_requests ADD COLUMN provider_signature TEXT").run().catch(() => {});
    await env.DB.prepare("ALTER TABLE payment_requests ADD COLUMN provider_total INTEGER").run().catch(() => {});
    await env.DB.prepare("ALTER TABLE payment_requests ADD COLUMN provider_reference TEXT").run().catch(() => {});

    // Coupons table
    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS coupons (
        id TEXT PRIMARY KEY,
        code TEXT UNIQUE NOT NULL,
        type TEXT NOT NULL DEFAULT 'percent',
        value INTEGER NOT NULL,
        description TEXT,
        max_uses INTEGER DEFAULT 0,
        used_count INTEGER DEFAULT 0,
        expired_at DATETIME,
        active INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `).run();

    // Add original_price column to pricing
    await env.DB.prepare("ALTER TABLE pricing ADD COLUMN original_price INTEGER").run().catch(() => {});

    // Admin audit logs table
    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS admin_audit_logs (
        id TEXT PRIMARY KEY,
        admin_id TEXT NOT NULL,
        action TEXT NOT NULL,
        target TEXT,
        details TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `).run();

    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS telegram_link_challenges (
        code_hash TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        expires_at DATETIME NOT NULL,
        created_at DATETIME NOT NULL,
        used_at DATETIME
      )
    `).run();
    await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_tg_link_user ON telegram_link_challenges (user_id)").run();

    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS otp_challenges (
        id TEXT PRIMARY KEY,
        purpose TEXT NOT NULL,
        subject_id TEXT NOT NULL,
        otp_hash TEXT NOT NULL,
        expires_at DATETIME NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0,
        used_at DATETIME
      )
    `).run();

    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS rate_limits (
        key TEXT NOT NULL,
        window_start INTEGER NOT NULL,
        count INTEGER NOT NULL DEFAULT 0,
        updated_at DATETIME NOT NULL,
        PRIMARY KEY (key, window_start)
      )
    `).run();

    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS daily_usage (
        user_id TEXT NOT NULL,
        feature TEXT NOT NULL,
        day TEXT NOT NULL,
        count INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (user_id, feature, day)
      )
    `).run();

    // Seed default pricing if empty
    const pricingCount = await env.DB.prepare("SELECT COUNT(*) as cnt FROM pricing").first();
    if (!pricingCount?.cnt) {
      await env.DB.prepare(
        "INSERT INTO pricing (id, duration_days, price, label) VALUES ('p30', 30, 0, '1 Bulan'), ('p90', 90, 0, '3 Bulan'), ('p365', 365, 0, '1 Tahun'), ('p0', 0, 0, 'Lifetime')"
      ).run();
    }

    // ── Setup command menu untuk dua bot Telegram yang berbeda ──
    const TOKEN = env.TELEGRAM_TOKEN || env.TELEGRAM_BOT_TOKEN;
    if (TOKEN) {
      const response = await fetch(`https://api.telegram.org/bot${TOKEN}/setMyCommands`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          commands: [
            { command: "start", description: "Mulai bot Laksa" },
            { command: "menu",  description: "Buka dashboard keuangan" },
            { command: "saldo", description: "Lihat saldo rekening" },
            { command: "riwayat", description: "Lihat transaksi terbaru" },
            { command: "tagihan", description: "Lihat daftar tagihan" },
            { command: "upgrade", description: "Beli paket Premium via KlikQRIS" },
            { command: "myid",  description: "Lihat Telegram ID kamu" },
          ]
        })
      });
      if (!response.ok) throw new Error("Gagal mendaftarkan command bot konsumen");
    }

    const ADMIN_TOKEN = env.ADMIN_BOT_TOKEN;
    if (ADMIN_TOKEN) {
      const response = await fetch(`https://api.telegram.org/bot${ADMIN_TOKEN}/setMyCommands`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          commands: [
            { command: "start", description: "Buka menu admin Laksa" },
            { command: "users", description: "Lihat pengguna terbaru" },
            { command: "search", description: "Cari pengguna" },
            { command: "pending", description: "Pantau pembayaran pending" },
            { command: "receipt", description: "Bukti pembayaran terverifikasi" },
            { command: "pricing", description: "Lihat harga paket" },
            { command: "coupon", description: "Kelola kupon" },
            { command: "stats", description: "Statistik aplikasi" },
            { command: "revenue", description: "Ringkasan pendapatan" },
          ]
        })
      });
      if (!response.ok) throw new Error("Gagal mendaftarkan command bot admin");
    }

    return jsonRes({ status: "success", message: "Database tables created + consumer/admin bot commands registered." });
  } catch (e) {
    return jsonRes({ error: e.message }, 500);
  }
}

async function seedCategories(userId, env) {
  const cats = [
    { id: "c1",  name: "Makanan & Minuman", type: "expense" },
    { id: "c2",  name: "Transportasi",      type: "expense" },
    { id: "c3",  name: "Belanja",           type: "expense" },
    { id: "c4",  name: "Tagihan",           type: "expense" },
    { id: "c5",  name: "Hiburan",           type: "expense" },
    { id: "c6",  name: "Kesehatan",         type: "expense" },
    { id: "c7",  name: "Pendidikan",        type: "expense" },
    { id: "c13", name: "Rumah Tangga",      type: "expense" },
    { id: "c14", name: "Perawatan Diri",    type: "expense" },
    { id: "c15", name: "Pajak",             type: "expense" },
    { id: "c16", name: "Cicilan",           type: "expense" },
    { id: "c17", name: "Sosial",            type: "expense" },
    { id: "c8",  name: "Gaji",              type: "income"  },
    { id: "c9",  name: "Freelance",         type: "income"  },
    { id: "c10", name: "Investasi",         type: "income"  },
    { id: "c11", name: "Hadiah",            type: "income"  },
    { id: "c18", name: "Bonus",             type: "income"  },
    { id: "c19", name: "Penjualan",         type: "income"  },
    { id: "c20", name: "Refund",            type: "income"  },
    { id: "c21", name: "Tabungan",          type: "both"    },
    { id: "c22", name: "Pemasukan Lainnya", type: "income"  },
    { id: "c23", name: "Pengeluaran Lainnya", type: "expense" },
  ];
  for (const c of cats) {
    await env.DB.prepare(`
      INSERT OR IGNORE INTO categories (id, user_id, name, emoji, type)
      VALUES (?, ?, ?, '', ?)
    `).bind(c.id, userId, c.name, c.type).run();
  }
}

async function dbAccounts(userId, env) {
  const { results } = await env.DB.prepare("SELECT * FROM accounts WHERE user_id = ? ORDER BY rowid ASC").bind(userId).all();
  return results || [];
}

async function dbCategories(userId, env) {
  let { results } = await env.DB.prepare("SELECT * FROM categories WHERE user_id = ?").bind(userId).all();
  if (!results || !results.length) {
    await seedCategories(userId, env);
    const r = await env.DB.prepare("SELECT * FROM categories WHERE user_id = ?").bind(userId).all();
    results = r.results || [];
  }
  return results || [];
}

// ─────────────────────────────────────────────────────
// PENDING TEXT HELPERS (D1-backed, replaces in-memory Map)
// ─────────────────────────────────────────────────────
async function savePendingText(chatId, parsed, rawText, cat, env) {
  const data = JSON.stringify({ parsed, rawText, cat });
  await env.DB.prepare(
    "INSERT OR REPLACE INTO pending_texts (chat_id, data, created_at) VALUES (?, ?, datetime('now'))"
  ).bind(String(chatId), data).run();
}

async function loadPendingText(chatId, env) {
  const row = await env.DB.prepare(
    "SELECT data, created_at FROM pending_texts WHERE chat_id = ?"
  ).bind(String(chatId)).first();
  if (!row) return null;
  const age = Date.now() - new Date(row.created_at + "Z").getTime();
  if (age > PENDING_TEXT_TTL_MS) {
    await clearPendingText(chatId, env);
    return null;
  }
  try { return JSON.parse(row.data); } catch { return null; }
}

async function clearPendingText(chatId, env) {
  await env.DB.prepare("DELETE FROM pending_texts WHERE chat_id = ?").bind(String(chatId)).run();
}

async function saveTransactionItems(txId, items, env) {
  if (!items || !items.length) return;
  for (const item of items) {
    await env.DB.prepare(
      "INSERT INTO transaction_items (id, transaction_id, name, qty, price) VALUES (?, ?, ?, ?, ?)"
    ).bind(randomId(), txId, item.name || "", item.qty || 1, item.total_price || 0).run();
  }
}

async function getTransactionItems(uid, txId, env) {
  const tx = await env.DB.prepare("SELECT id FROM transactions WHERE id = ? AND user_id = ?").bind(txId, uid).first();
  if (!tx) return jsonRes({ error: "Transaksi tidak ditemukan" }, 404);
  const { results } = await env.DB.prepare("SELECT * FROM transaction_items WHERE transaction_id = ?").bind(txId).all();
  return jsonRes(results || []);
}

async function getTxFull(id, env) {
  return await env.DB.prepare(`
    SELECT t.*, a.name AS account_name, c.name AS category_name, c.emoji AS category_emoji
    FROM transactions t
    LEFT JOIN accounts a ON t.account_id = a.id
    LEFT JOIN categories c ON t.category_id = c.id AND c.user_id = t.user_id
    WHERE t.id = ?
  `).bind(id).first();
}

// ─────────────────────────────────────────────────────
// CRUD ENDPOINT HANDLERS
// ─────────────────────────────────────────────────────
async function getAccounts(uid, env) {
  const { results } = await env.DB.prepare("SELECT * FROM accounts WHERE user_id = ? ORDER BY rowid ASC").bind(uid).all();
  return jsonRes(results);
}

async function createAccount(uid, body, env) {
  const id = crypto.randomUUID();
  const balance = Number(body.balance || 0);
  if (typeof body.name !== "string" || !body.name.trim() || body.name.length > 100 || !Number.isFinite(balance)) {
    return jsonRes({ error: "Data rekening tidak valid" }, 400);
  }
  await env.DB.prepare("INSERT INTO accounts (id, user_id, name, balance, color) VALUES (?, ?, ?, ?, ?)")
    .bind(id, uid, body.name.trim(), balance, /^#[0-9a-f]{6}$/i.test(body.color || "") ? body.color : null)
    .run();
  return jsonRes({ id, status: "created" });
}

async function updateAccount(uid, id, body, env) {
  const fields = [];
  const vals = [];
  if (body.name !== undefined) {
    if (typeof body.name !== "string" || !body.name.trim() || body.name.length > 100) return jsonRes({ error: "Nama rekening tidak valid" }, 400);
    fields.push("name = ?"); vals.push(body.name.trim());
  }
  if (body.balance !== undefined) {
    const balance = Number(body.balance);
    if (!Number.isFinite(balance)) return jsonRes({ error: "Saldo tidak valid" }, 400);
    fields.push("balance = ?"); vals.push(balance);
  }
  if (body.color !== undefined) {
    if (body.color !== null && !/^#[0-9a-f]{6}$/i.test(body.color)) return jsonRes({ error: "Warna tidak valid" }, 400);
    fields.push("color = ?"); vals.push(body.color);
  }
  if (fields.length) {
    vals.push(id, uid);
    await env.DB.prepare(`UPDATE accounts SET ${fields.join(", ")} WHERE id = ? AND user_id = ?`).bind(...vals).run();
  }
  return jsonRes({ status: "updated" });
}

async function deleteAccount(uid, id, env) {
  await env.DB.prepare("DELETE FROM accounts WHERE id = ? AND user_id = ?").bind(id, uid).run();
  return jsonRes({ status: "deleted" });
}

async function getCategories(uid, env) {
  const results = await dbCategories(uid, env);
  return jsonRes(results);
}

async function createCategory(uid, body, env) {
  const id = crypto.randomUUID();
  if (typeof body.name !== "string" || !body.name.trim() || body.name.length > 80) {
    return jsonRes({ error: "Nama kategori tidak valid" }, 400);
  }
  await env.DB.prepare("INSERT INTO categories (id, user_id, name, emoji, type) VALUES (?, ?, ?, ?, ?)")
    .bind(id, uid, body.name, body.emoji || "📌", body.type || "both")
    .run();
  return jsonRes({ id, status: "created" });
}

async function deleteCategory(uid, id, env) {
  await env.DB.prepare("DELETE FROM categories WHERE id = ? AND user_id = ?").bind(id, uid).run();
  return jsonRes({ status: "deleted" });
}

async function getTransactions(uid, url, env) {
  const month = url.searchParams.get("month");
  const limit = Math.min(500, Math.max(1, parseInt(url.searchParams.get("limit") || "100", 10) || 100));
  let query = `
    SELECT t.*, a.name AS account_name, c.name AS category_name, c.emoji AS category_emoji
    FROM transactions t
    LEFT JOIN accounts a ON t.account_id = a.id
    LEFT JOIN categories c ON t.category_id = c.id AND c.user_id = t.user_id
    WHERE t.user_id = ?
  `;
  const vals = [uid];
  if (month) {
    query += " AND t.date LIKE ?";
    vals.push(`${month}%`);
  }
  query += " ORDER BY t.date DESC, t.created_at DESC LIMIT ?";
  vals.push(limit);
  const { results } = await env.DB.prepare(query).bind(...vals).all();
  return jsonRes(results);
}

async function createTransaction(uid, body, env) {
  const amount = Number(body.amount);
  if (!["income", "expense"].includes(body.type) || !Number.isFinite(amount) || amount <= 0 || amount > 1_000_000_000_000) {
    return jsonRes({ error: "Jenis atau jumlah transaksi tidak valid" }, 400);
  }
  const ownedAccount = await env.DB.prepare("SELECT id FROM accounts WHERE id = ? AND user_id = ?")
    .bind(body.account_id, uid).first();
  if (!ownedAccount) return jsonRes({ error: "Rekening tidak ditemukan" }, 404);
  if (body.category_id) {
    const ownedCategory = await env.DB.prepare("SELECT id FROM categories WHERE id = ? AND user_id = ?")
      .bind(body.category_id, uid).first();
    if (!ownedCategory) return jsonRes({ error: "Kategori tidak ditemukan" }, 404);
  }
  const id = crypto.randomUUID();
  const date = body.date || todayStr();
  const clientIdempotency = String(body.idempotency_key || id).slice(0, 128);
  const idempotencyKey = `web_${uid}_${clientIdempotency}`;
  const dedupHash = txDedupHash(uid, body.type, body.amount, body.account_id, date);

  await ensureDedup(env);

  const sign = body.type === "income" ? 1 : -1;
  const diff = amount * sign;

  const insertStmt = env.DB.prepare(`
    INSERT INTO transactions (id, user_id, date, type, amount, note, store, account_id, category_id, raw_text, source, idempotency_key, dedup_hash)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id, uid, date, body.type, amount,
    String(body.note || "").slice(0, 500), body.store ? String(body.store).slice(0, 200) : null,
    body.account_id, body.category_id || null,
    body.raw_text || null, body.source || "web",
    idempotencyKey, dedupHash
  );

  const updateStmt = env.DB.prepare("UPDATE accounts SET balance = balance + ? WHERE id = ? AND user_id = ?").bind(diff, body.account_id, uid);

  try {
    await env.DB.batch([insertStmt, updateStmt]);
    return jsonRes({ id, status: "created", dedup_hash: dedupHash });
  } catch (e) {
    if (e.message && (e.message.includes("UNIQUE constraint") || e.message.includes("idx_tx_idempotency") || e.message.includes("idx_tx_dedup_hash"))) {
      return jsonRes({ id, status: "duplicate", dedup_hash: dedupHash });
    }
    throw e;
  }
}

async function updateTransaction(uid, id, body, env) {
  const tx = await env.DB.prepare("SELECT * FROM transactions WHERE id = ? AND user_id = ?").bind(id, uid).first();
  if (!tx) return jsonRes({ error: "Transaction not found" }, 404);

  const date = body.date || tx.date;
  const type = body.type || tx.type;
  const amount = body.amount !== undefined ? body.amount : tx.amount;
  const note = body.note !== undefined ? body.note : tx.note;
  const store = body.store !== undefined ? body.store : tx.store;
  const account_id = body.account_id || tx.account_id;
  const category_id = body.category_id !== undefined ? body.category_id : tx.category_id;
  const ownedAccount = await env.DB.prepare("SELECT id FROM accounts WHERE id = ? AND user_id = ?")
    .bind(account_id, uid).first();
  if (!ownedAccount) return jsonRes({ error: "Rekening tidak ditemukan" }, 404);
  if (!["income", "expense"].includes(type) || !Number.isFinite(Number(amount)) || Number(amount) <= 0) {
    return jsonRes({ error: "Jenis atau jumlah transaksi tidak valid" }, 400);
  }
  if (category_id) {
    const ownedCategory = await env.DB.prepare("SELECT id FROM categories WHERE id = ? AND user_id = ?")
      .bind(category_id, uid).first();
    if (!ownedCategory) return jsonRes({ error: "Kategori tidak ditemukan" }, 404);
  }

  const signOld = tx.type === "income" ? 1 : -1;
  const diffOld = tx.amount * signOld * -1;
  const revertStmt = env.DB.prepare("UPDATE accounts SET balance = balance + ? WHERE id = ? AND user_id = ?").bind(diffOld, tx.account_id, uid);

  const updateStmt = env.DB.prepare(`
    UPDATE transactions
    SET date = ?, type = ?, amount = ?, note = ?, store = ?, account_id = ?, category_id = ?
    WHERE id = ? AND user_id = ?
  `).bind(date, type, amount, note, store, account_id, category_id, id, uid);

  const signNew = type === "income" ? 1 : -1;
  const diffNew = amount * signNew * 1;
  const applyStmt = env.DB.prepare("UPDATE accounts SET balance = balance + ? WHERE id = ? AND user_id = ?").bind(diffNew, account_id, uid);

  await env.DB.batch([revertStmt, updateStmt, applyStmt]);
  return jsonRes({ status: "updated" });
}

async function deleteTransaction(uid, id, env) {
  const tx = await env.DB.prepare("SELECT * FROM transactions WHERE id = ? AND user_id = ?").bind(id, uid).first();
  if (tx) {
    const sign = tx.type === "income" ? 1 : -1;
    const diff = tx.amount * sign * -1;
    const revertStmt = env.DB.prepare("UPDATE accounts SET balance = balance + ? WHERE id = ? AND user_id = ?").bind(diff, tx.account_id, uid);
    const deleteItemsStmt = env.DB.prepare("DELETE FROM transaction_items WHERE transaction_id = ?").bind(id);
    const deleteTxStmt = env.DB.prepare("DELETE FROM transactions WHERE id = ? AND user_id = ?").bind(id, uid);

    await env.DB.batch([revertStmt, deleteItemsStmt, deleteTxStmt]);
  }
  return jsonRes({ status: "deleted" });
}

async function deleteAllTransactions(uid, env) {
  // Reverse balance adjustments for all transactions
  const { results: txs } = await env.DB.prepare("SELECT * FROM transactions WHERE user_id = ?").bind(uid).all();
  for (const tx of txs) {
    const sign = tx.type === "income" ? 1 : -1;
    await env.DB.prepare("UPDATE accounts SET balance = balance + ? WHERE id = ? AND user_id = ?")
      .bind(tx.amount * sign * -1, tx.account_id, uid).run().catch(() => {});
  }
  await env.DB.prepare("DELETE FROM transaction_items WHERE transaction_id IN (SELECT id FROM transactions WHERE user_id = ?)").bind(uid).run().catch(() => {});
  await env.DB.prepare("DELETE FROM transactions WHERE user_id = ?").bind(uid).run();
  return jsonRes({ status: "deleted", count: txs.length });
}

async function deleteAllAccounts(uid, env) {
  await env.DB.prepare("DELETE FROM accounts WHERE user_id = ?").bind(uid).run();
  return jsonRes({ status: "deleted" });
}

async function deleteAllCategories(uid, env) {
  await env.DB.prepare("DELETE FROM categories WHERE user_id = ?").bind(uid).run();
  return jsonRes({ status: "deleted" });
}

async function getBudgets(uid, env) {
  const { results } = await env.DB.prepare(`
    SELECT b.*, c.name AS category_name, c.emoji AS category_emoji
    FROM budgets b
    LEFT JOIN categories c ON b.category_id = c.id AND c.user_id = b.user_id
    WHERE b.user_id = ?
  `).bind(uid).all();
  return jsonRes(results);
}

const FINANCIAL_MAX_AMOUNT = 9_000_000_000_000;
const FINANCIAL_MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const FINANCIAL_DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const BILL_STATUSES = new Set(["unpaid", "paid"]);
const BILL_DUE_TYPES = new Set(["monthly", "once"]);
const PIUTANG_STATUSES = new Set(["active", "paid", "overdue"]);

function validateFinancialAmount(value, field, { min = 0, required = true } = {}) {
  if (!required && (value === undefined || value === null)) return { value: null };
  if (typeof value !== "number" || !Number.isFinite(value) || !Number.isSafeInteger(value) || value < min || value > FINANCIAL_MAX_AMOUNT) {
    return { error: `${field} harus berupa bilangan bulat aman antara ${min} dan ${FINANCIAL_MAX_AMOUNT}` };
  }
  return { value };
}

function validateFinancialString(value, field, { min = 1, max = 100, nullable = false } = {}) {
  if (nullable && (value === null || value === undefined || value === "")) return { value: null };
  if (typeof value !== "string") return { error: `${field} harus berupa teks` };
  const trimmed = value.trim();
  if (trimmed.length < min || trimmed.length > max) return { error: `${field} harus ${min}-${max} karakter` };
  return { value: trimmed };
}

function validateFinancialDate(value, field, nullable = true) {
  if (nullable && (value === null || value === undefined || value === "")) return { value: null };
  if (typeof value !== "string" || !FINANCIAL_DATE_RE.test(value)) return { error: `${field} harus berformat YYYY-MM-DD` };
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) return { error: `${field} bukan tanggal kalender yang valid` };
  return { value };
}

function financialValidationError(...checks) {
  const failed = checks.find(check => check.error);
  return failed ? jsonRes({ error: failed.error }, 400) : null;
}

async function createBudget(uid, body, env) {
  const category = validateFinancialString(body?.category_id, "category_id", { max: 128 });
  const amount = validateFinancialAmount(body?.limit_amount, "limit_amount", { min: 1 });
  const month = body?.month === undefined ? new Date().toISOString().slice(0, 7) : body.month;
  const invalid = financialValidationError(category, amount);
  if (invalid) return invalid;
  if (typeof month !== "string" || !FINANCIAL_MONTH_RE.test(month)) return jsonRes({ error: "month harus berformat YYYY-MM" }, 400);
  const ownedCategory = await env.DB.prepare("SELECT id FROM categories WHERE id = ? AND user_id = ?").bind(category.value, uid).first();
  if (!ownedCategory) return jsonRes({ error: "Kategori tidak ditemukan" }, 404);
  const id = randomId();
  await env.DB.prepare("INSERT INTO budgets (id, user_id, category_id, limit_amount, month) VALUES (?, ?, ?, ?, ?)")
    .bind(id, uid, category.value, amount.value, month).run();
  return jsonRes({ id, status: "created" });
}

async function deleteBudget(uid, id, env) {
  await env.DB.prepare("DELETE FROM budgets WHERE id = ? AND user_id = ?").bind(id, uid).run();
  return jsonRes({ status: "deleted" });
}

async function getGoals(uid, env) {
  const { results } = await env.DB.prepare("SELECT * FROM goals WHERE user_id = ?").bind(uid).all();
  return jsonRes(results);
}

async function createGoal(uid, body, env) {
  const name = validateFinancialString(body?.name, "name", { max: 100 });
  const target = validateFinancialAmount(body?.target, "target", { min: 1 });
  const current = validateFinancialAmount(body?.current ?? 0, "current");
  const deadline = validateFinancialDate(body?.deadline, "deadline");
  const icon = validateFinancialString(body?.icon ?? "target", "icon", { max: 50 });
  const invalid = financialValidationError(name, target, current, deadline, icon);
  if (invalid) return invalid;
  const id = randomId();
  await env.DB.prepare("INSERT INTO goals (id, user_id, name, target, current, deadline, icon) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .bind(id, uid, name.value, target.value, current.value, deadline.value, icon.value)
    .run();
  return jsonRes({ id, status: "created" });
}

async function updateGoal(uid, id, body, env) {
  const fields = [];
  const vals = [];
  const validators = {
    name: value => validateFinancialString(value, "name", { max: 100 }),
    target: value => validateFinancialAmount(value, "target", { min: 1 }),
    current: value => validateFinancialAmount(value, "current"),
    deadline: value => validateFinancialDate(value, "deadline"),
    icon: value => validateFinancialString(value, "icon", { max: 50 })
  };
  for (const [field, validate] of Object.entries(validators)) {
    if (body?.[field] === undefined) continue;
    const checked = validate(body[field]);
    if (checked.error) return jsonRes({ error: checked.error }, 400);
    fields.push(`${field} = ?`); vals.push(checked.value);
  }
  if (fields.length) {
    vals.push(id, uid);
    await env.DB.prepare(`UPDATE goals SET ${fields.join(", ")} WHERE id = ? AND user_id = ?`).bind(...vals).run();
  }
  return jsonRes({ status: "updated" });
}

async function deleteGoal(uid, id, env) {
  await env.DB.prepare("DELETE FROM goals WHERE id = ? AND user_id = ?").bind(id, uid).run();
  return jsonRes({ status: "deleted" });
}

async function getBills(uid, env) {
  const { results } = await env.DB.prepare("SELECT * FROM bills WHERE user_id = ?").bind(uid).all();
  return jsonRes(results);
}

async function createBill(uid, body, env) {
  const name = validateFinancialString(body?.name, "name", { max: 100 });
  const amount = validateFinancialAmount(body?.amount, "amount");
  const status = body?.status ?? "unpaid";
  const dueType = body?.due_type ?? "monthly";
  const dueDay = body?.due_day ?? null;
  const dueDate = validateFinancialDate(body?.due_date, "due_date");
  const paidDate = validateFinancialDate(body?.paid_date, "paid_date");
  const invalid = financialValidationError(name, amount, dueDate, paidDate);
  if (invalid) return invalid;
  if (!BILL_STATUSES.has(status) || !BILL_DUE_TYPES.has(dueType)) return jsonRes({ error: "status atau due_type tidak valid" }, 400);
  if (dueDay !== null && (!Number.isSafeInteger(dueDay) || dueDay < 1 || dueDay > 31)) return jsonRes({ error: "due_day harus 1-31" }, 400);
  const id = randomId();
  await env.DB.prepare(`
    INSERT INTO bills (id, user_id, name, amount, status, due_type, due_day, due_date, paid_date)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(id, uid, name.value, amount.value, status, dueType, dueDay, dueDate.value, paidDate.value)
    .run();
  return jsonRes({ id, status: "created" });
}

async function updateBill(uid, id, body, env) {
  const fields = [];
  const vals = [];
  const validators = {
    name: value => validateFinancialString(value, "name", { max: 100 }),
    amount: value => validateFinancialAmount(value, "amount"),
    status: value => BILL_STATUSES.has(value) ? { value } : { error: "status tidak valid" },
    due_type: value => BILL_DUE_TYPES.has(value) ? { value } : { error: "due_type tidak valid" },
    due_day: value => value === null || (Number.isSafeInteger(value) && value >= 1 && value <= 31) ? { value } : { error: "due_day harus 1-31" },
    due_date: value => validateFinancialDate(value, "due_date"),
    paid_date: value => validateFinancialDate(value, "paid_date")
  };
  for (const [field, validate] of Object.entries(validators)) {
    if (body?.[field] === undefined) continue;
    const checked = validate(body[field]);
    if (checked.error) return jsonRes({ error: checked.error }, 400);
    fields.push(`${field} = ?`); vals.push(checked.value);
  }
  if (fields.length) {
    vals.push(id, uid);
    await env.DB.prepare(`UPDATE bills SET ${fields.join(", ")} WHERE id = ? AND user_id = ?`).bind(...vals).run();
  }
  return jsonRes({ status: "updated" });
}

async function deleteBill(uid, id, env) {
  await env.DB.prepare("DELETE FROM bills WHERE id = ? AND user_id = ?").bind(id, uid).run();
  return jsonRes({ status: "deleted" });
}

// ─────────────────────────────────────────────────────
// HELPERS & CORE UTILITIES
// ─────────────────────────────────────────────────────
const ALLOWED_ORIGINS = [
  "https://laksaapp.my.id",
  "https://admin.laksaapp.my.id",
  "https://haerubirru17.github.io"
];

const corsHeaders = {
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function cors(response, request = null) {
  const headers = new Headers(response.headers);
  let origin = "";
  if (request) {
    const reqOrigin = request.headers.get("Origin");
    if (reqOrigin) {
      const isAllowed = ALLOWED_ORIGINS.includes(reqOrigin) || 
                        reqOrigin.startsWith("http://localhost:") || 
                        reqOrigin.startsWith("http://127.0.0.1:");
      if (isAllowed) {
        origin = reqOrigin;
        headers.set("Vary", "Origin");
      }
    }
  }
  headers.set("Access-Control-Allow-Origin", origin || "https://laksaapp.my.id");
  for (const [k, v] of Object.entries(corsHeaders)) {
    headers.set(k, v);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function jsonRes(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff"
    }
  });
}

async function adjustBalance(accountId, type, amount, factor, env, userId) {
  if (!userId) throw new Error("Missing account owner");
  const sign = type === "income" ? 1 : -1;
  const diff = amount * sign * factor;
  const result = await env.DB.prepare("UPDATE accounts SET balance = balance + ? WHERE id = ? AND user_id = ?")
    .bind(diff, accountId, userId).run();
  if ((result.meta?.changes ?? 0) !== 1) throw new Error("Account ownership check failed");
}

function formatTx(tx) {
  if (!tx) return "-";
  const typeLabel = tx.type === "income" ? "💚 Pemasukan" : "🔴 Pengeluaran";
  let msg = `*${typeLabel}*
💸 *Rp${fmt(tx.amount)}*
🏷️ Kategori: *${tx.category_emoji || ""} ${tx.category_name || "Lainnya"}*
💳 Rekening: *${tx.account_name || "-"}*
📝 Catatan: _${tx.note || "-"}_`;
  if (tx.store) {
    msg += `\n🏪 ${tx.type === "income" ? "Merchant" : "Toko"}: _${tx.store}_`;
  }
  msg += `\n📅 Tanggal: *${fmtDate(tx.date)}*`;
  return msg;
}

function fmt(num) {
  if (num == null || isNaN(num)) return "0";
  return Math.round(num).toLocaleString("id-ID");
}

function fmtDate(dateStr) {
  if (!dateStr) return "-";
  try {
    const parts = dateStr.split("-");
    if (parts.length === 3) {
      const months = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
      const day = parseInt(parts[2], 10);
      const month = months[parseInt(parts[1], 10) - 1];
      const year = parts[0];
      return `${day} ${month} ${year}`;
    }
  } catch {}
  return dateStr;
}

function fmtType(type) {
  return type === "income" ? "Pemasukan" : type === "transfer" ? "Transfer" : "Pengeluaran";
}

function chunks(arr, size) {
  const res = [];
  for (let i = 0; i < arr.length; i += size) res.push(arr.slice(i, i + size));
  return res;
}

function randomId() {
  return "id_" + Math.random().toString(36).substring(2, 15);
}

function todayStr() {
  return new Date().toISOString().split("T")[0];
}

function bufToBase64(buf) {
  let binary = "";
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function extractJSON(raw) {
  try { return JSON.parse(raw.trim()); } catch {}
  try {
    const s = raw.replace(/```json([\s\S]*?)```|```([\s\S]*?)```/g, (_, a, b) => (a || b || "").trim()).trim();
    return JSON.parse(s);
  } catch {}
  let depth = 0, start = -1;
  for (let i = 0; i < raw.length; i++) {
    if (raw[i] === "{") { if (depth === 0) start = i; depth++; }
    else if (raw[i] === "}") {
      depth--;
      if (depth === 0 && start !== -1) {
        try { return JSON.parse(raw.slice(start, i + 1)); } catch {}
      }
    }
  }
  throw new Error("Tidak ada JSON valid. Raw: " + raw.slice(0, 200));
}

function likelyTx(text) {
  const lower = text.toLowerCase();
  const hasNum = /\b\d+(?:[.,]\d+)?\s*(?:rb|k|jt|juta|ribu)?\b/.test(lower);
  const keywords = ["beli", "bayar", "gaji", "pemasukan", "pengeluaran", "transfer", "pindah", "masuk", "keluar", "belanja", "topup", "tarik", "uang", "saldo", "cashback", "refund", "tambah", "setor", "tabung", "nabung", "cicil", "angsuran", "hutang", "piutang"];
  const hasKeyword = keywords.some(k => lower.includes(k));
  return hasNum || hasKeyword;
}

function stripMarkdown(text) {
  return text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // [text](url) → text
    .replace(/[*_`]/g, "");                     // remove *, _, `
}

async function tgSend(chatId, text, env, keyboard = null) {
  const TOKEN = env.TELEGRAM_TOKEN || env.TELEGRAM_BOT_TOKEN;
  const payload = {
    chat_id: chatId,
    text,
    parse_mode: "Markdown"
  };
  if (keyboard) {
    payload.reply_markup = { inline_keyboard: keyboard };
  }
  const res = await fetch(`${TG(TOKEN)}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (res.ok) {
    const data = await res.json().catch(() => null);
    return data?.result?.message_id || null;
  }
  // Retry without Markdown — strip formatting chars so they don't show as raw text
  delete payload.parse_mode;
  payload.text = stripMarkdown(text);
  const res2 = await fetch(`${TG(TOKEN)}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const data2 = await res2.json().catch(() => null);
  return data2?.result?.message_id || null;
}

// ── Bot message tracking (clean history) ──
async function trackBotMsg(chatId, messageId, env) {
  if (!messageId) return;
  await env.DB.prepare("INSERT INTO bot_messages (chat_id, message_id) VALUES (?, ?)")
    .bind(String(chatId), messageId).run().catch(() => {});
}

async function clearBotHistory(chatId, env) {
  const rows = await env.DB.prepare("SELECT message_id FROM bot_messages WHERE chat_id = ?")
    .bind(String(chatId)).all().catch(() => ({ results: [] }));
  const ids = rows.results || [];
  for (const r of ids) {
    await deleteTgMessage(chatId, r.message_id, env);
  }
  await env.DB.prepare("DELETE FROM bot_messages WHERE chat_id = ?")
    .bind(String(chatId)).run().catch(() => {});
}

async function deleteTgMessage(chatId, messageId, env) {
  const TOKEN = env.TELEGRAM_TOKEN || env.TELEGRAM_BOT_TOKEN;
  await fetch(`${TG(TOKEN)}/deleteMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, message_id: messageId })
  }).catch(() => {});
}

async function editTgMessage(chatId, messageId, text, env, keyboard = null) {
  const TOKEN = env.TELEGRAM_TOKEN || env.TELEGRAM_BOT_TOKEN;
  const payload = {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: "Markdown"
  };
  if (keyboard) {
    payload.reply_markup = { inline_keyboard: keyboard };
  }
  const res = await fetch(`${TG(TOKEN)}/editMessageText`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    delete payload.parse_mode;
    payload.text = stripMarkdown(text);
    await fetch(`${TG(TOKEN)}/editMessageText`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
  }
}

// ─────────────────────────────────────────────────────
// PIUTANG CRUD HANDLERS
// ─────────────────────────────────────────────────────
async function getPiutang(uid, env) {
  const { results } = await env.DB.prepare("SELECT * FROM piutang WHERE user_id = ? ORDER BY lend_date DESC, created_at DESC").bind(uid).all();
  return jsonRes(results);
}

async function createPiutang(uid, body, env) {
  const borrower = validateFinancialString(body?.borrower_name, "borrower_name", { max: 100 });
  const amount = validateFinancialAmount(body?.amount, "amount", { min: 1 });
  const returned = validateFinancialAmount(body?.returned ?? 0, "returned");
  const note = validateFinancialString(body?.note ?? "", "note", { min: 0, max: 500 });
  const lendDate = validateFinancialDate(body?.lend_date ?? todayStr(), "lend_date", false);
  const dueDate = validateFinancialDate(body?.due_date, "due_date");
  const status = body?.status ?? "active";
  const invalid = financialValidationError(borrower, amount, returned, note, lendDate, dueDate);
  if (invalid) return invalid;
  if (!PIUTANG_STATUSES.has(status)) return jsonRes({ error: "status tidak valid" }, 400);
  if (returned.value > amount.value) return jsonRes({ error: "returned tidak boleh melebihi amount" }, 400);
  const id = randomId();
  await env.DB.prepare(`
    INSERT INTO piutang (id, user_id, borrower_name, amount, returned, note, lend_date, due_date, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(id, uid, borrower.value, amount.value, returned.value, note.value, lendDate.value, dueDate.value, status).run();

  return jsonRes(await env.DB.prepare("SELECT * FROM piutang WHERE id = ? AND user_id = ?").bind(id, uid).first(), 201);
}

async function updatePiutang(uid, id, body, env) {
  const ptg = await env.DB.prepare("SELECT * FROM piutang WHERE id = ? AND user_id = ?").bind(id, uid).first();
  if (!ptg) return jsonRes({ error: "Data piutang tidak ditemukan" }, 404);

  const validators = {
    borrower_name: value => validateFinancialString(value, "borrower_name", { max: 100 }),
    amount: value => validateFinancialAmount(value, "amount", { min: 1 }),
    returned: value => validateFinancialAmount(value, "returned"),
    note: value => validateFinancialString(value, "note", { min: 0, max: 500 }),
    lend_date: value => validateFinancialDate(value, "lend_date", false),
    due_date: value => validateFinancialDate(value, "due_date"),
    status: value => PIUTANG_STATUSES.has(value) ? { value } : { error: "status tidak valid" }
  };
  const f = [], v = [];
  for (const [field, validate] of Object.entries(validators)) {
    if (body?.[field] === undefined) continue;
    const checked = validate(body[field]);
    if (checked.error) return jsonRes({ error: checked.error }, 400);
    f.push(`${field} = ?`); v.push(checked.value);
  }
  const nextAmount = body?.amount ?? ptg.amount;
  const nextReturned = body?.returned ?? ptg.returned;
  if (nextReturned > nextAmount) return jsonRes({ error: "returned tidak boleh melebihi amount" }, 400);
  if (f.length) {
    v.push(id, uid);
    await env.DB.prepare(`UPDATE piutang SET ${f.join(", ")} WHERE id = ? AND user_id = ?`).bind(...v).run();
  }
  return jsonRes(await env.DB.prepare("SELECT * FROM piutang WHERE id = ? AND user_id = ?").bind(id, uid).first());
}

async function deletePiutang(uid, id, env) {
  const ptg = await env.DB.prepare("SELECT * FROM piutang WHERE id = ? AND user_id = ?").bind(id, uid).first();
  if (!ptg) return jsonRes({ error: "Data piutang tidak ditemukan" }, 404);
  await env.DB.prepare("DELETE FROM piutang WHERE id = ?").bind(id).run();
  return jsonRes({ deleted: id });
}

// ─────────────────────────────────────────────────────
// ADMIN BOT (Separate Telegram Bot for Management)
// ─────────────────────────────────────────────────────
function parseAdminBoundedInteger(value, { min = 0, max = 1_000_000_000 } = {}) {
  if (typeof value !== "string" || !/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= min && parsed <= max ? parsed : null;
}

async function handleAdminBot(body, env, updateId) {
  const msg = body?.message;
  if (!msg) return;
  if (!requirePrivateTelegramChat(msg.chat, msg.from?.id)) return;

  const chatId = msg.chat.id;
  const fromId = String(msg.from.id);
  const rawText = (msg.text || '').trim();
  const ADMIN_TOKEN = env.ADMIN_BOT_TOKEN;
  const ADMIN_ID = env.ADMIN_TELEGRAM_ID;

  if (!ADMIN_TOKEN) return;

  // Normalize command: strip bot username suffix (e.g. /command@botname) and lowercase command prefix
  let text = rawText;
  if (text.startsWith('/')) {
    const spaceIndex = text.indexOf(' ');
    let cmd = spaceIndex === -1 ? text : text.slice(0, spaceIndex);
    const rest = spaceIndex === -1 ? '' : text.slice(spaceIndex);
    const atIndex = cmd.indexOf('@');
    if (atIndex !== -1) {
      cmd = cmd.slice(0, atIndex);
    }
    text = (cmd.toLowerCase() + rest).trim();
  }

  // Whitelist: hanya admin. FAIL-CLOSED — kalau ADMIN_ID belum diset, tolak semua.
  if (!ADMIN_ID) {
    console.error("ADMIN_TELEGRAM_ID belum diatur — semua perintah bot admin ditolak.");
    return;
  }
  if (fromId !== ADMIN_ID) {
    await adminSend(chatId, "⛔ Unauthorized. Bot ini hanya untuk admin.", ADMIN_TOKEN);
    return;
  }

  try {
    if (text === '/start' || text === '/help') {
      await adminSend(chatId, `🔐 *Admin Panel Laksa*\n\n*Perintah tersedia:*\n\n📋 *User Management*\n/users — List semua user\n/search email — Cari user\n/user email — Detail user\n/ban email — Ban user\n/unban email — Buka blokir user\n/deleteuser email — Hapus akun permanen\n\n💎 *Premium Management*\n/extend email durasi — Perpanjang premium administratif\n/revoke email — Cabut premium\n/pending — Pantau pembayaran yang menunggu gateway\n/receipt email — Bukti pembayaran KlikQRIS terverifikasi\n\n💰 *Pricing*\n/pricing — Lihat harga saat ini\n/setprice id harga — Update harga\n/setoriginal id harga — Set harga coret\n\n🎫 *Kupon*\n/coupon list — Lihat semua kupon\n/coupon create KODE tipe nilai\n/coupon delete KODE — Hapus kupon\n\n📊 *Statistik*\n/stats — Overview dashboard\n/revenue — Revenue summary\n\nPembayaran hanya diaktifkan otomatis setelah verifikasi KlikQRIS MY PG.`, ADMIN_TOKEN);
      return;
    }

    if (text === '/users') {
      const users = await env.DB.prepare("SELECT id, email, name, plan, plan_expired_at, is_banned, created_at FROM users ORDER BY created_at DESC LIMIT 50").all();
      if (!users.results?.length) { await adminSend(chatId, "📭 Belum ada user.", ADMIN_TOKEN); return; }
      let msg = `👥 *Users* (${users.results.length})\n\n`;
      users.results.forEach((u, i) => {
        const status = u.is_banned ? '🚫' : u.plan === 'premium' ? '💎' : '🆓';
        msg += `${i+1}. ${status} *${u.name}*\n   ${u.email}\n   Plan: ${u.plan || 'free'}${u.plan_expired_at ? ' (exp: ' + u.plan_expired_at.slice(0,10) + ')' : ''}\n\n`;
      });
      await adminSend(chatId, msg, ADMIN_TOKEN);
      return;
    }

    if (text === '/search') { await adminSend(chatId, "📝 Format: /search email atau nama", ADMIN_TOKEN); return; }
    if (text.startsWith('/search ')) {
      const query = text.slice(8).trim();
      if (!query) { await adminSend(chatId, "📝 Format: /search email atau nama", ADMIN_TOKEN); return; }
      const users = await env.DB.prepare("SELECT id, email, name, plan, plan_expired_at, is_banned FROM users WHERE email LIKE ? OR name LIKE ? LIMIT 10").bind(`%${query}%`, `%${query}%`).all();
      if (!users.results?.length) { await adminSend(chatId, `🔍 Tidak ditemukan user dengan "${query}"`, ADMIN_TOKEN); return; }
      let msg = `🔍 *Hasil pencarian:* "${query}"\n\n`;
      users.results.forEach((u, i) => {
        const status = u.is_banned ? '🚫 BANNED' : u.plan === 'premium' ? '💎 Premium' : '🆓 Free';
        msg += `${i+1}. *${u.name}* (${u.email})\n   Status: ${status}\n\n`;
      });
      await adminSend(chatId, msg, ADMIN_TOKEN);
      return;
    }

    if (text === '/user') { await adminSend(chatId, "📝 Format: /user email@contoh.com", ADMIN_TOKEN); return; }
    if (text.startsWith('/user ')) {
      const email = text.slice(6).trim().toLowerCase();
      if (!email) { await adminSend(chatId, "📝 Format: /user email@contoh.com", ADMIN_TOKEN); return; }
      const user = await env.DB.prepare("SELECT * FROM users WHERE email = ?").bind(email).first();
      if (!user) { await adminSend(chatId, `❌ User "${email}" tidak ditemukan.`, ADMIN_TOKEN); return; }
      const midnight = todayMidnight();
      const usageRows = await env.DB.prepare("SELECT feature, COUNT(*) as cnt FROM usage_logs WHERE user_id = ? AND used_at >= ? GROUP BY feature").bind(user.id, midnight).all();
      let usageStr = 'Tidak ada';
      if (usageRows.results?.length) {
        usageStr = usageRows.results.map(r => `${r.feature}: ${r.cnt}x`).join(', ');
      }
      const txCount = await env.DB.prepare("SELECT COUNT(*) as cnt FROM transactions WHERE user_id = ?").bind(user.id).first();
      await adminSend(chatId, `👤 *Detail User*\n\n*Nama:* ${user.name}\n*Email:* ${user.email}\n*ID:* \`${user.id}\`\n*Telegram:* ${user.telegram_id || '-'}\n*Plan:* ${user.plan || 'free'}\n*Expired:* ${user.plan_expired_at || '-'}\n*Banned:* ${user.is_banned ? 'Ya' : 'Tidak'}\n*Dibuat:* ${user.created_at}\n\n📊 *Usage hari ini:* ${usageStr}\n💳 *Total transaksi:* ${txCount?.cnt || 0}`, ADMIN_TOKEN);
      return;
    }

    if (text === '/extend') { await adminSend(chatId, "📝 Format: /extend email@contoh.com 30d", ADMIN_TOKEN); return; }
    if (text.startsWith('/extend ')) {
      const parts = text.slice(8).trim().split(/\s+/);
      const email = parts[0]?.toLowerCase();
      const duration = parts[1] || '30d';
      if (!email) { await adminSend(chatId, "📝 Format: /extend email@contoh.com 30d", ADMIN_TOKEN); return; }
      const user = await env.DB.prepare("SELECT id, name, email, plan, plan_expired_at FROM users WHERE email = ?").bind(email).first();
      if (!user) { await adminSend(chatId, `❌ User "${email}" tidak ditemukan.`, ADMIN_TOKEN); return; }
      const days = duration === 'lifetime' ? 0 : parseAdminBoundedInteger(duration.replace(/d$/i, ''), { min: 1, max: 3650 });
      if (days === null) { await adminSend(chatId, "❌ Durasi harus 1-3650 hari atau lifetime.", ADMIN_TOKEN); return; }
      let expiredAt = null;
      if (days > 0) {
        const base = user.plan_expired_at ? new Date(user.plan_expired_at) : new Date();
        if (base < new Date()) base.setTime(Date.now());
        base.setDate(base.getDate() + days);
        expiredAt = base.toISOString();
      }
      await auditAdminBotMutation(fromId, updateId, "extend_premium", user.id, { before: { plan: user.plan, plan_expired_at: user.plan_expired_at }, after: { plan: "premium", plan_expired_at: expiredAt } }, env);
      await env.DB.prepare("UPDATE users SET plan = 'premium', plan_expired_at = ? WHERE id = ?").bind(expiredAt, user.id).run();
      await adminSend(chatId, `✅ *Premium diperpanjang!*\n\n*User:* ${user.name} (${user.email})\n*Baru expired:* ${expiredAt ? expiredAt.slice(0,10) : 'Lifetime'}`, ADMIN_TOKEN);
      return;
    }

    if (text === '/revoke') { await adminSend(chatId, "📝 Format: /revoke email@contoh.com", ADMIN_TOKEN); return; }
    if (text.startsWith('/revoke ')) {
      const email = text.slice(8).trim().toLowerCase();
      if (!email) { await adminSend(chatId, "📝 Format: /revoke email@contoh.com", ADMIN_TOKEN); return; }
      const user = await env.DB.prepare("SELECT id, name FROM users WHERE email = ?").bind(email).first();
      if (!user) { await adminSend(chatId, `❌ User "${email}" tidak ditemukan.`, ADMIN_TOKEN); return; }
      await auditAdminBotMutation(fromId, updateId, "revoke_premium", user.id, { after: { plan: "free" } }, env);
      await env.DB.prepare("UPDATE users SET plan = 'free', plan_expired_at = NULL WHERE id = ?").bind(user.id).run();
      await adminSend(chatId, `⬇️ *Premium dicabut*\n\n*User:* ${user.name} (${user.email})\nStatus sekarang: Free`, ADMIN_TOKEN);
      return;
    }

    if (text === '/ban') { await adminSend(chatId, "📝 Format: /ban email@contoh.com", ADMIN_TOKEN); return; }
    if (text.startsWith('/ban ')) {
      const email = text.slice(5).trim().toLowerCase();
      if (!email) { await adminSend(chatId, "📝 Format: /ban email@contoh.com", ADMIN_TOKEN); return; }
      const user = await env.DB.prepare("SELECT id, name FROM users WHERE email = ?").bind(email).first();
      if (!user) { await adminSend(chatId, `❌ User "${email}" tidak ditemukan.`, ADMIN_TOKEN); return; }
      await auditAdminBotMutation(fromId, updateId, "ban_user", user.id, { after: { is_banned: 1 } }, env);
      await env.DB.prepare("UPDATE users SET is_banned = 1, token_version = COALESCE(token_version, 0) + 1 WHERE id = ?").bind(user.id).run();
      await adminSend(chatId, `🚫 *User di-ban*\n\n*User:* ${user.name} (${user.email})`, ADMIN_TOKEN);
      return;
    }

    if (text === '/unban') { await adminSend(chatId, "📝 Format: /unban email@contoh.com", ADMIN_TOKEN); return; }
    if (text.startsWith('/unban ')) {
      const email = text.slice(7).trim().toLowerCase();
      if (!email) { await adminSend(chatId, "📝 Format: /unban email@contoh.com", ADMIN_TOKEN); return; }
      const user = await env.DB.prepare("SELECT id, name FROM users WHERE email = ?").bind(email).first();
      if (!user) { await adminSend(chatId, `❌ User "${email}" tidak ditemukan.`, ADMIN_TOKEN); return; }
      await auditAdminBotMutation(fromId, updateId, "unban_user", user.id, { after: { is_banned: 0 } }, env);
      await env.DB.prepare("UPDATE users SET is_banned = 0 WHERE id = ?").bind(user.id).run();
      await adminSend(chatId, `✅ *User di-unban*\n\n*User:* ${user.name} (${user.email})`, ADMIN_TOKEN);
      return;
    }

    if (text === '/deleteuser') { await adminSend(chatId, "📝 Format: /deleteuser email@contoh.com\n\n⚠️ PERMANEN — semua data user akan dihapus.", ADMIN_TOKEN); return; }
    if (text.startsWith('/deleteuser ')) {
      const email = text.slice(12).trim().toLowerCase();
      if (!email) { await adminSend(chatId, "📝 Format: /deleteuser email@contoh.com", ADMIN_TOKEN); return; }
      const user = await env.DB.prepare("SELECT id, name FROM users WHERE email = ?").bind(email).first();
      if (!user) { await adminSend(chatId, `❌ User "${email}" tidak ditemukan.`, ADMIN_TOKEN); return; }
      const uid = user.id;
      await auditAdminBotMutation(fromId, updateId, "delete_user", uid, { email }, env);
      await env.DB.prepare("DELETE FROM transaction_items WHERE transaction_id IN (SELECT id FROM transactions WHERE user_id = ?)").bind(uid).run().catch(() => {});
      await env.DB.prepare("DELETE FROM transactions WHERE user_id = ?").bind(uid).run().catch(() => {});
      await env.DB.prepare("DELETE FROM accounts WHERE user_id = ?").bind(uid).run().catch(() => {});
      await env.DB.prepare("DELETE FROM categories WHERE user_id = ?").bind(uid).run().catch(() => {});
      await env.DB.prepare("DELETE FROM budgets WHERE user_id = ?").bind(uid).run().catch(() => {});
      await env.DB.prepare("DELETE FROM goals WHERE user_id = ?").bind(uid).run().catch(() => {});
      await env.DB.prepare("DELETE FROM bills WHERE user_id = ?").bind(uid).run().catch(() => {});
      await env.DB.prepare("DELETE FROM piutang WHERE user_id = ?").bind(uid).run().catch(() => {});
      await env.DB.prepare("DELETE FROM pending_scans WHERE user_id = ?").bind(uid).run().catch(() => {});
      await env.DB.prepare("DELETE FROM pending_texts WHERE user_id = ?").bind(uid).run().catch(() => {});
      await env.DB.prepare("DELETE FROM usage_logs WHERE user_id = ?").bind(uid).run().catch(() => {});
      await env.DB.prepare("DELETE FROM bot_messages WHERE user_id = ?").bind(uid).run().catch(() => {});
      await env.DB.prepare("DELETE FROM users WHERE id = ?").bind(uid).run();
      await adminSend(chatId, `🗑️ *Akun dihapus permanen*\n\n*User:* ${user.name} (${email})\n\nSemua data (transaksi, rekening, kategori, dll) telah dihapus.`, ADMIN_TOKEN);
      return;
    }

    if (text === '/pricing') {
      const prices = await env.DB.prepare("SELECT * FROM pricing ORDER BY duration_days ASC").all();
      if (!prices.results?.length) { await adminSend(chatId, "📭 Pricing belum diset.", ADMIN_TOKEN); return; }
      let msg = `💰 *Pricing Saat Ini*\n\n`;
      prices.results.forEach(p => {
        const dur = p.duration_days === 0 ? 'Lifetime' : `${p.duration_days} hari`;
        const origStr = p.original_price ? ` (coret: Rp ${p.original_price.toLocaleString('id-ID')})` : '';
        msg += `• *${p.label}* (${dur}): Rp ${p.price.toLocaleString('id-ID')}${origStr}\n  ID: \`${p.id}\`\n\n`;
      });
      msg += `\n_Update: /setprice p30 29000_\n_Harga coret: /setoriginal p30 17000_`;
      await adminSend(chatId, msg, ADMIN_TOKEN);
      return;
    }

    if (text === '/setprice') { await adminSend(chatId, "📝 Format: /setprice id harga\nContoh: /setprice p30 29000\n\nID: p30, p90, p365, p0", ADMIN_TOKEN); return; }
    if (text.startsWith('/setprice ')) {
      const parts = text.slice(10).trim().split(/\s+/);
      const priceId = parts[0];
      const price = parseAdminBoundedInteger(parts[1], { min: 1, max: 1_000_000_000 });
      if (!priceId || price === null) { await adminSend(chatId, "📝 Format: /setprice id harga\nHarga harus integer positif yang valid.", ADMIN_TOKEN); return; }
      const existing = await env.DB.prepare("SELECT * FROM pricing WHERE id = ?").bind(priceId).first();
      if (!existing) { await adminSend(chatId, `❌ Pricing ID "${priceId}" tidak ditemukan.\nID yang valid: p30, p90, p365, p0`, ADMIN_TOKEN); return; }
      await auditAdminBotMutation(fromId, updateId, "set_price", priceId, { before: existing.price, after: price }, env);
      await env.DB.prepare("UPDATE pricing SET price = ? WHERE id = ?").bind(price, priceId).run();
      await adminSend(chatId, `✅ *Harga diupdate!*\n\n*${existing.label}:* Rp ${price.toLocaleString('id-ID')}`, ADMIN_TOKEN);
      return;
    }

    if (text === '/setoriginal') { await adminSend(chatId, "📝 Format: /setoriginal id harga_asli\nContoh: /setoriginal p30 17000\n\nHarga asli ditampilkan dicoret di modal upgrade.", ADMIN_TOKEN); return; }
    if (text.startsWith('/setoriginal ')) {
      const parts = text.slice(13).trim().split(/\s+/);
      const priceId = parts[0];
      const origPrice = parseAdminBoundedInteger(parts[1], { min: 1, max: 1_000_000_000 });
      if (!priceId || origPrice === null) { await adminSend(chatId, "📝 Format: /setoriginal id harga_asli\nHarga harus integer positif yang valid.", ADMIN_TOKEN); return; }
      const existing = await env.DB.prepare("SELECT * FROM pricing WHERE id = ?").bind(priceId).first();
      if (!existing) { await adminSend(chatId, `❌ Pricing ID "${priceId}" tidak ditemukan.`, ADMIN_TOKEN); return; }
      await auditAdminBotMutation(fromId, updateId, "set_original_price", priceId, { before: existing.original_price, after: origPrice }, env);
      await env.DB.prepare("UPDATE pricing SET original_price = ? WHERE id = ?").bind(origPrice, priceId).run();
      await adminSend(chatId, `✅ *Harga coret diupdate!*\n\n*${existing.label}:* ~~Rp ${origPrice.toLocaleString('id-ID')}~~ → Rp ${existing.price.toLocaleString('id-ID')}`, ADMIN_TOKEN);
      return;
    }

    if (text === '/coupon') { await adminSend(chatId, "📝 *Kelola Kupon Diskon*\n\n/coupon list — Lihat semua kupon\n/coupon create KODE persen/nominal nilai [max_uses] [expired_at]\n/coupon delete KODE — Hapus kupon\n\nContoh:\n/coupon create NEWYEAR percent 20 100 2026-12-31\n/coupon create DISKON10K fixed 10000 50\n/coupon create VIP percent 50 1", ADMIN_TOKEN); return; }
    if (text === '/coupon list') {
      const coupons = await env.DB.prepare("SELECT * FROM coupons ORDER BY created_at DESC").all().catch(() => ({ results: [] }));
      if (!coupons.results?.length) { await adminSend(chatId, "📭 Belum ada kupon.", ADMIN_TOKEN); return; }
      let msg = `🎫 *Kupon Aktif*\n\n`;
      coupons.results.forEach((c, i) => {
        const val = c.type === 'percent' ? `${c.value}%` : `Rp ${c.value.toLocaleString('id-ID')}`;
        const uses = c.max_uses > 0 ? `${c.used_count}/${c.max_uses}` : `${c.used_count}/∞`;
        const status = c.active ? '✅' : '❌';
        const exp = c.expired_at ? c.expired_at.slice(0, 10) : '-';
        msg += `${i+1}. ${status} *${c.code}* — ${val}\n   Terpakai: ${uses} | Exp: ${exp}\n   ${c.description || ''}\n\n`;
      });
      await adminSend(chatId, msg, ADMIN_TOKEN);
      return;
    }
    if (text.startsWith('/coupon create ')) {
      const parts = text.slice(15).trim().split(/\s+/);
      const code = parts[0]?.toUpperCase();
      const type = parts[1]; // percent or fixed
      const value = parseAdminBoundedInteger(parts[2], { min: 1, max: 1_000_000_000 });
      const maxUses = parts[3] === undefined ? 0 : parseAdminBoundedInteger(parts[3], { min: 0, max: 1_000_000 });
      const expiredAt = parts[4] || null;
      if (!code || !type || value === null || maxUses === null || !['percent', 'fixed'].includes(type)) {
        await adminSend(chatId, "📝 Format: /coupon create KODE percent/fixed nilai [max_uses] [expired_at]\n\nContoh: /coupon create NEWYEAR percent 20 100 2026-12-31", ADMIN_TOKEN);
        return;
      }
      if (type === 'percent' && (value < 1 || value > 100)) { await adminSend(chatId, "❌ Persen harus antara 1-100.", ADMIN_TOKEN); return; }
      const id = 'cpn_' + Date.now();
      const desc = type === 'percent' ? `Diskon ${value}%` : `Potongan Rp ${value.toLocaleString('id-ID')}`;
      try {
        await auditAdminBotMutation(fromId, updateId, "create_coupon", code, { type, value, max_uses: maxUses, expired_at: expiredAt }, env);
        await env.DB.prepare(
          "INSERT INTO coupons (id, code, type, value, description, max_uses, expired_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
        ).bind(id, code, type, value, desc, maxUses, expiredAt).run();
        await adminSend(chatId, `✅ *Kupon dibuat!*\n\n*Kode:* \`${code}\`\n*Diskon:* ${desc}\n*Maks pakai:* ${maxUses || '∞'}\n*Expired:* ${expiredAt || '-'}`, ADMIN_TOKEN);
      } catch (e) {
        if (e.message?.includes('UNIQUE')) { await adminSend(chatId, `❌ Kode "${code}" sudah ada.`, ADMIN_TOKEN); }
        else { await adminSend(chatId, `❌ Error: ${e.message}`, ADMIN_TOKEN); }
      }
      return;
    }
    if (text.startsWith('/coupon delete ')) {
      const code = text.slice(15).trim().toUpperCase();
      if (!code) { await adminSend(chatId, "📝 Format: /coupon delete KODE", ADMIN_TOKEN); return; }
      await auditAdminBotMutation(fromId, updateId, "delete_coupon", code, {}, env);
      const result = await env.DB.prepare("DELETE FROM coupons WHERE code = ?").bind(code).run();
      if (result.meta?.changes > 0) { await adminSend(chatId, `🗑️ Kupon *${code}* dihapus.`, ADMIN_TOKEN); }
      else { await adminSend(chatId, `❌ Kupon "${code}" tidak ditemukan.`, ADMIN_TOKEN); }
      return;
    }

    if (text === '/stats') {
      const totalUsers = await env.DB.prepare("SELECT COUNT(*) as cnt FROM users").first();
      const freeUsers = await env.DB.prepare("SELECT COUNT(*) as cnt FROM users WHERE plan = 'free' OR plan IS NULL").first();
      const premiumUsers = await env.DB.prepare("SELECT COUNT(*) as cnt FROM users WHERE plan = 'premium'").first();
      const bannedUsers = await env.DB.prepare("SELECT COUNT(*) as cnt FROM users WHERE is_banned = 1").first();
      const todayUsage = await env.DB.prepare("SELECT feature, COUNT(*) as cnt FROM usage_logs WHERE used_at >= ? GROUP BY feature").bind(todayMidnight()).all();
      const todayNew = await env.DB.prepare("SELECT COUNT(*) as cnt FROM users WHERE created_at >= ?").bind(todayMidnight()).first();
      let usageStr = 'Tidak ada';
      if (todayUsage.results?.length) {
        usageStr = todayUsage.results.map(r => `  • ${r.feature}: ${r.cnt}x`).join('\n');
      }
      await adminSend(chatId, `📊 *Dashboard Laksa*\n\n👥 *Users*\n  Total: ${totalUsers?.cnt || 0}\n  Free: ${freeUsers?.cnt || 0}\n  Premium: ${premiumUsers?.cnt || 0}\n  Banned: ${bannedUsers?.cnt || 0}\n  Baru hari ini: ${todayNew?.cnt || 0}\n\n📈 *Usage Hari Ini*\n${usageStr}`, ADMIN_TOKEN);
      return;
    }

    if (text === '/revenue') {
      const prices = await env.DB.prepare("SELECT * FROM pricing").all();
      const premUsers = await env.DB.prepare("SELECT name, email, plan_expired_at FROM users WHERE plan = 'premium' ORDER BY plan_expired_at DESC").all();
      let msg = `💰 *Revenue Summary*\n\n💎 *Premium Users:* ${premUsers.results?.length || 0}\n\n`;
      if (premUsers.results?.length) {
        premUsers.results.forEach(u => {
          msg += `• ${u.name} (${u.email})\n  Exp: ${u.plan_expired_at ? u.plan_expired_at.slice(0,10) : 'Lifetime'}\n`;
        });
      }
      await adminSend(chatId, msg, ADMIN_TOKEN);
      return;
    }



    // /pending — list pending payment requests
    if (text === '/pending') {
      try {
        const pending = await env.DB.prepare(
          "SELECT pr.*, p.label, p.duration_days FROM payment_requests pr LEFT JOIN pricing p ON pr.pricing_id = p.id WHERE pr.status = 'pending' ORDER BY pr.created_at DESC LIMIT 20"
        ).all();
        if (!pending.results?.length) {
          await adminSend(chatId, "📭 Tidak ada request pending.", ADMIN_TOKEN);
          return;
        }
        let msg = `📋 *Pending Requests* (${pending.results.length})\n\n`;
        pending.results.forEach((r, i) => {
          const ago = Math.round((Date.now() - new Date(r.created_at).getTime()) / 60000);
          const agoStr = ago < 60 ? `${ago} menit lalu` : `${Math.round(ago/60)} jam lalu`;
          msg += `${i+1}. *${r.email}*\n   🧾 \`${r.id}\`\n   📦 ${r.label || '-'} (${r.duration_days === 0 ? 'Lifetime' : r.duration_days + ' hari'})\n   💰 Rp ${(r.provider_total ?? r.amount ?? 0).toLocaleString('id-ID')}\n   🕐 ${agoStr}\n   ⏳ Menunggu verifikasi gateway\n\n`;
        });
        await adminSend(chatId, msg, ADMIN_TOKEN);
      } catch (e) {
        await adminSend(chatId, `⚠️ Error: ${e.message}`, ADMIN_TOKEN);
      }
      return;
    }

    // /receipt email — only generate a receipt backed by a verified KlikQRIS payment
    if (text === '/receipt') { await adminSend(chatId, "📝 Format: /receipt email@contoh.com", ADMIN_TOKEN); return; }
    if (text.startsWith('/receipt ')) {
      const email = text.slice(9).trim().toLowerCase();
      if (!email) { await adminSend(chatId, "📝 Format: /receipt email@contoh.com", ADMIN_TOKEN); return; }
      const user = await env.DB.prepare("SELECT * FROM users WHERE email = ?").bind(email).first();
      if (!user) { await adminSend(chatId, `❌ User "${email}" tidak ditemukan.`, ADMIN_TOKEN); return; }
      const payment = await env.DB.prepare(`
        SELECT id, pricing_id, amount, provider_total, resolved_at
        FROM payment_requests
        WHERE user_id = ? AND status = 'approved' AND resolved_by = 'klikqris'
        ORDER BY resolved_at DESC LIMIT 1
      `).bind(user.id).first();
      if (!payment) {
        await adminSend(chatId, `❌ Tidak ada pembayaran KlikQRIS terverifikasi untuk "${email}".`, ADMIN_TOKEN);
        return;
      }
      const expDate = user.plan_expired_at ? new Date(user.plan_expired_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }) : 'Selamanya';
      const paidAt = new Date(payment.resolved_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
      const paidAmount = Number(payment.provider_total ?? payment.amount ?? 0).toLocaleString('id-ID');
      const receipt = `━━━━━━━━━━━━━━━━━━━━━━\n✅ PEMBAYARAN TERVERIFIKASI\n━━━━━━━━━━━━━━━━━━━━━━\n\nTerima kasih, ${user.name}!\n\n📋 Detail Pembayaran:\n• Order ID  : ${payment.id}\n• Paket     : ${payment.pricing_id}\n• Nominal   : Rp ${paidAmount}\n• Dibayar   : ${paidAt}\n• Gateway   : KlikQRIS\n\n💎 Detail Langganan:\n• Status    : Premium Aktif ✓\n• Berakhir  : ${expDate}\n\n━━━━━━━━━━━━━━━━━━━━━━`;
      await adminSend(chatId, `📋 *Receipt untuk copas ke WA:*\n\n\`\`\`\n${receipt}\n\`\`\``, ADMIN_TOKEN);
      return;
    }

    await adminSend(chatId, "❓ Perintah tidak dikenal. Ketik /start untuk melihat daftar perintah.", ADMIN_TOKEN);
  } catch (e) {
    await adminSend(chatId, `⚠️ Error: ${e.message}`, ADMIN_TOKEN).catch(() => {});
  }
}

async function adminSend(chatId, text, token) {
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' })
  });
}

async function cleanupOldData(env) {
  try {
    await ensureDedup(env);
    await env.DB.prepare(
      "DELETE FROM processed_bot_updates_v2 WHERE created_at < datetime('now', '-7 days')"
    ).run();
    await env.DB.prepare("DELETE FROM telegram_link_challenges WHERE expires_at < datetime('now', '-1 day')").run();
    await env.DB.prepare("DELETE FROM otp_challenges WHERE expires_at < datetime('now', '-1 day')").run();
    await env.DB.prepare("DELETE FROM rate_limits WHERE updated_at < datetime('now', '-1 day')").run();
    await env.DB.prepare("DELETE FROM daily_usage WHERE day < date('now', '-14 days')").run();
    console.log("Cleanup old data completed successfully.");
  } catch (e) {
    console.error("Cleanup old data error:", e.message);
  }
}
