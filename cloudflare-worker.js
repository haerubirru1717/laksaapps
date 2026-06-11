/**
 * LAKSA BOT & BACKEND API — Cloudflare Worker v3.0
 * ─────────────────────────────────────────────────────
 * Single source of truth: Cloudflare D1.
 *
 * ENV VARS : TELEGRAM_TOKEN, GROQ_API_KEY, TELEGRAM_WEBHOOK_SECRET (optional)
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

// Max age for pending text entries (ms)
const PENDING_TEXT_TTL_MS = 5 * 60 * 1000; // 5 menit

// JWT config
const JWT_EXPIRY_SECONDS = 7 * 24 * 60 * 60; // 7 hari

// ─────────────────────────────────────────────────────
// AUTH UTILITIES (PBKDF2 + JWT via Web Crypto API)
// ─────────────────────────────────────────────────────
async function hashPassword(password, salt) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: enc.encode(salt), iterations: 100000, hash: "SHA-256" },
    keyMaterial, 256
  );
  return btoa(String.fromCharCode(...new Uint8Array(bits)));
}

async function verifyPassword(password, salt, hash) {
  const computed = await hashPassword(password, salt);
  return computed === hash;
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

// ─────────────────────────────────────────────────────
// AUTH ENDPOINTS
// ─────────────────────────────────────────────────────
async function handleRegister(body, env) {
  const { email, password, name } = body || {};
  if (!email || !password || !name) return jsonRes({ error: "Email, password, dan nama wajib diisi" }, 400);
  const emailLower = email.toLowerCase().trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailLower)) return jsonRes({ error: "Format email tidak valid" }, 400);
  if (password.length < 6) return jsonRes({ error: "Password minimal 6 karakter" }, 400);
  const existing = await env.DB.prepare("SELECT id FROM users WHERE email = ?").bind(emailLower).first();
  if (existing) return jsonRes({ error: "Email sudah terdaftar" }, 409);
  const id = "usr_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);
  const salt = crypto.randomUUID();
  const passwordHash = await hashPassword(password, salt);
  await env.DB.prepare(
    "INSERT INTO users (id, email, name, password_hash, salt, created_at) VALUES (?, ?, ?, ?, ?, ?)"
  ).bind(id, emailLower, name.trim(), passwordHash, salt, new Date().toISOString()).run();
  // Seed default categories for new user
  await seedCategories(id, env);
  const token = await signJWT({ sub: id, email: emailLower, name: name.trim() }, env.JWT_SECRET || "laksa-default-secret");
  return jsonRes({ token, user: { id, email: emailLower, name: name.trim() } }, 201);
}

async function handleLogin(body, env) {
  const { email, password } = body || {};
  if (!email || !password) return jsonRes({ error: "Email dan password wajib diisi" }, 400);
  const emailLower = email.toLowerCase().trim();
  const user = await env.DB.prepare("SELECT * FROM users WHERE email = ?").bind(emailLower).first();
  if (!user) return jsonRes({ error: "Email atau password salah" }, 401);
  const valid = await verifyPassword(password, user.salt, user.password_hash);
  if (!valid) return jsonRes({ error: "Email atau password salah" }, 401);
  const token = await signJWT({ sub: user.id, email: user.email, name: user.name }, env.JWT_SECRET || "laksa-default-secret");
  return jsonRes({ token, user: { id: user.id, email: user.email, name: user.name, telegram_id: user.telegram_id } });
}

async function handleMe(req, env) {
  const token = extractToken(req);
  if (!token) return jsonRes({ error: "Token diperlukan" }, 401);
  const payload = await verifyJWT(token, env.JWT_SECRET || "laksa-default-secret");
  if (!payload) return jsonRes({ error: "Token tidak valid atau expired" }, 401);
  const user = await env.DB.prepare("SELECT id, email, name, telegram_id, created_at FROM users WHERE id = ?").bind(payload.sub).first();
  if (!user) return jsonRes({ error: "User tidak ditemukan" }, 404);
  return jsonRes(user);
}

async function handleLinkTelegram(req, body, env) {
  const token = extractToken(req);
  if (!token) return jsonRes({ error: "Token diperlukan" }, 401);
  const payload = await verifyJWT(token, env.JWT_SECRET || "laksa-default-secret");
  if (!payload) return jsonRes({ error: "Token tidak valid" }, 401);
  const { telegram_id } = body || {};
  if (!telegram_id) return jsonRes({ error: "telegram_id diperlukan" }, 400);
  await env.DB.prepare("UPDATE users SET telegram_id = ? WHERE id = ?").bind(String(telegram_id), payload.sub).run();
  return jsonRes({ status: "linked", telegram_id });
}

async function handleRefreshToken(req, env) {
  const token = extractToken(req);
  if (!token) return jsonRes({ error: "Token diperlukan" }, 401);
  const payload = await verifyJWT(token, env.JWT_SECRET || "laksa-default-secret");
  if (!payload) return jsonRes({ error: "Token tidak valid atau expired" }, 401);
  const user = await env.DB.prepare("SELECT id, email, name FROM users WHERE id = ?").bind(payload.sub).first();
  if (!user) return jsonRes({ error: "User tidak ditemukan" }, 404);
  const newToken = await signJWT({ sub: user.id, email: user.email, name: user.name }, env.JWT_SECRET || "laksa-default-secret");
  return jsonRes({ token: newToken });
}

// ─────────────────────────────────────────────────────
// ENTRY POINT
// ─────────────────────────────────────────────────────
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return cors(new Response(null, { status: 204 }));
    try {
      if (request.method === "POST" && (url.pathname === "/webhook" || url.pathname === "/telegram-webhook")) {
        // Webhook secret verification
        const secret = env.TELEGRAM_WEBHOOK_SECRET;
        if (secret) {
          const headerSecret = request.headers.get("X-Telegram-Bot-Api-Secret-Token");
          if (headerSecret !== secret) {
            return new Response("Unauthorized", { status: 403 });
          }
        }
        const body = await request.json();
        // Deduplication: skip already-processed updates
        const updateId = body.update_id;
        if (updateId) {
          const existing = await env.DB.prepare(
            "SELECT update_id FROM processed_updates WHERE update_id = ?"
          ).bind(updateId).first().catch(() => null);
          if (existing) return new Response("OK");
          await env.DB.prepare(
            "INSERT OR IGNORE INTO processed_updates (update_id) VALUES (?)"
          ).bind(updateId).run().catch(() => {});
        }
        ctx.waitUntil(handleTelegram(body, env));
        return new Response("OK");
      }
      return cors(await routeAPI(request, url, env));
    } catch (e) {
      console.error("Worker error:", e.message, e.stack);
      return cors(jsonRes({ error: e.message }, 500));
    }
  }
};

// ─────────────────────────────────────────────────────
// REST API ROUTER
// ─────────────────────────────────────────────────────
async function routeAPI(req, url, env) {
  const m    = req.method;
  const path = url.pathname;

  if (path === "/" && m === "GET") return jsonRes({ status: "ok", version: "3.0.0" });
  if (path === "/setup")           return setupDatabase(env);

  // Auth routes (public — no token needed)
  if (path === "/auth/register" && m === "POST") return handleRegister(await req.json(), env);
  if (path === "/auth/login"    && m === "POST") return handleLogin(await req.json(), env);
  if (path === "/auth/me"       && m === "GET")  return handleMe(req, env);
  if (path === "/auth/refresh"  && m === "POST") return handleRefreshToken(req, env);
  if (path === "/auth/link-telegram" && m === "POST") return handleLinkTelegram(req, await req.json(), env);

  // Resolve user_id: prefer JWT token, fallback to query param (backward compat for Telegram bot)
  let uid = null;
  const token = extractToken(req);
  if (token) {
    const payload = await verifyJWT(token, env.JWT_SECRET || "laksa-default-secret");
    if (!payload) return jsonRes({ error: "Token tidak valid atau expired" }, 401);
    uid = payload.sub;
  } else {
    uid = url.searchParams.get("user_id");
  }

  // Web AI proxy
  if (path === "/ai-chat"      && m === "POST") return handleAiChat(uid, await req.json(), env);
  if (path === "/scan-receipt" && m === "POST") return handleScanReceipt(uid, await req.json(), env);

  if (!uid) return jsonRes({ error: "Autentikasi diperlukan" }, 401);

  // accounts
  if (path === "/accounts") {
    if (m === "GET")  return getAccounts(uid, env);
    if (m === "POST") return createAccount(uid, await req.json(), env);
  }
  const accM = path.match(/^\/accounts\/([^/]+)$/);
  if (accM) {
    if (m === "PATCH")  return updateAccount(uid, accM[1], await req.json(), env);
    if (m === "DELETE") return deleteAccount(uid, accM[1], env);
  }

  // categories
  if (path === "/categories") {
    if (m === "GET")  return getCategories(uid, env);
    if (m === "POST") return createCategory(uid, await req.json(), env);
  }
  const catM = path.match(/^\/categories\/([^/]+)$/);
  if (catM && m === "DELETE") return deleteCategory(uid, catM[1], env);

  // transactions
  if (path === "/transactions") {
    if (m === "GET")  return getTransactions(uid, url, env);
    if (m === "POST") return createTransaction(uid, await req.json(), env);
  }
  const txM = path.match(/^\/transactions\/([^/]+)$/);
  if (txM) {
    if (m === "PATCH")  return updateTransaction(uid, txM[1], await req.json(), env);
    if (m === "DELETE") return deleteTransaction(uid, txM[1], env);
  }

  // budgets
  if (path === "/budgets") {
    if (m === "GET")  return getBudgets(uid, env);
    if (m === "POST") return createBudget(uid, await req.json(), env);
  }
  const budM = path.match(/^\/budgets\/([^/]+)$/);
  if (budM && m === "DELETE") return deleteBudget(uid, budM[1], env);

  // goals
  if (path === "/goals") {
    if (m === "GET")  return getGoals(uid, env);
    if (m === "POST") return createGoal(uid, await req.json(), env);
  }
  const goalM = path.match(/^\/goals\/([^/]+)$/);
  if (goalM) {
    if (m === "PATCH")  return updateGoal(uid, goalM[1], await req.json(), env);
    if (m === "DELETE") return deleteGoal(uid, goalM[1], env);
  }

  // bills
  if (path === "/bills") {
    if (m === "GET")  return getBills(uid, env);
    if (m === "POST") return createBill(uid, await req.json(), env);
  }
  const billM = path.match(/^\/bills\/([^/]+)$/);
  if (billM) {
    if (m === "PATCH")  return updateBill(uid, billM[1], await req.json(), env);
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
    if (m === "POST") return createPiutang(uid, await req.json(), env);
  }
  const ptgM = path.match(/^\/piutang\/([^/]+)$/);
  if (ptgM) {
    if (m === "PATCH")  return updatePiutang(uid, ptgM[1], await req.json(), env);
    if (m === "DELETE") return deletePiutang(uid, ptgM[1], env);
  }

  return jsonRes({ error: "Not found" }, 404);
}

// ─────────────────────────────────────────────────────
// TELEGRAM DISPATCHER
// ─────────────────────────────────────────────────────
async function handleTelegram(body, env) {
  const chatId = body?.callback_query?.message?.chat?.id || body?.message?.chat?.id;
  try {
    if (body.callback_query) { await handleCallback(body.callback_query, env); return; }

    const msg = body?.message;
    if (!msg) return;

    const userId = String(msg.from.id);
    const text   = (msg.text || "").trim();

    // Foto → scan struk
    if (msg.photo) { await handlePhoto(msg, chatId, userId, env); return; }
    if (!text) return;

    // Perintah — hapus history bot sebelumnya agar chat bersih
    if (text.startsWith("/") || !msg.reply_to_message) {
      await clearBotHistory(chatId, env);
    }

    if (text === "/start" || text === "/menu") { await sendMenu(chatId, userId, env); return; }
    if (text === "/myid")    { await sendMyId(chatId, userId, msg.from.first_name, env); return; }
    if (text === "/saldo")   { await sendSaldo(chatId, userId, env); return; }
    if (text === "/riwayat") { await sendRiwayat(chatId, userId, env); return; }
    if (text === "/tagihan") { await sendTagihan(chatId, userId, env); return; }
    if (text === "/batal")   { await clearPendingText(chatId, env); const mid = await tgSend(chatId, "❌ Dibatalkan.", env); await trackBotMsg(chatId, mid, env); return; }

    // Reply ke pesan bot → koreksi transaksi
    if (msg.reply_to_message?.from?.is_bot) {
      await handleCorrection(chatId, userId, msg.reply_to_message.text || "", text, env);
      return;
    }

    // Teks bebas → catat transaksi
    if (!text.startsWith("/")) { await handleFreeText(chatId, userId, text, env); return; }

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
async function handleCallback(cb, env) {
  const chatId = cb.message.chat.id;
  const userId = String(cb.from.id);
  const data   = cb.data;

  const TOKEN = env.TELEGRAM_TOKEN || env.TELEGRAM_BOT_TOKEN;
  await fetch(`${TG(TOKEN)}/answerCallbackQuery`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ callback_query_id: cb.id }),
  });

  // Hapus history bot sebelumnya untuk navigasi utama
  if (["menu","saldo","riwayat","tagihan","myid"].includes(data)) {
    await clearBotHistory(chatId, env);
  }

  if (data === "menu")    { await sendMenu(chatId, userId, env); return; }
  if (data === "saldo")   { await sendSaldo(chatId, userId, env); return; }
  if (data === "riwayat") { await sendRiwayat(chatId, userId, env); return; }
  if (data === "tagihan") { await sendTagihan(chatId, userId, env); return; }
  if (data === "myid")    { await sendMyId(chatId, userId, cb.from.first_name, env); return; }

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
      await adjustBalance(txIn.account_id, txIn.type, txIn.amount, -1, env);
      await env.DB.prepare(`DELETE FROM transactions WHERE id = ?`).bind(txIn.id).run();
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
    const draft = await env.DB.prepare("SELECT note FROM pending_scans WHERE id = ?").bind(pendingId).first();
    await env.DB.prepare("DELETE FROM pending_scans WHERE id = ?").bind(pendingId).run();
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
async function handleFreeText(chatId, userId, text, env) {
  if (!likelyTx(text)) { await sendMenu(chatId, userId, env); return; }

  const processingMid = await tgSend(chatId, "⏳ Memproses...", env);
  await trackBotMsg(chatId, processingMid, env);

  // 1. Parse dengan AI
  const parsed = await parseWithGroq(text, env);
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
  await clearPendingText(chatId, env);
  const { parsed, rawText, cat } = pending;
  await saveTx(chatId, userId, parsed, acc, cat, rawText, env);
}

async function saveTx(chatId, userId, parsed, acc, cat, rawText, env) {
  const id   = randomId();
  const date = parsed.date || todayStr();

  await env.DB.prepare(`
    INSERT INTO transactions (id, user_id, date, type, amount, note, store, account_id, category_id, raw_text, source)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'telegram')
  `).bind(
    id, userId, date, parsed.type, parsed.amount,
    parsed.note || "", parsed.store || null,
    acc.id, cat?.id || null, rawText
  ).run();

  await adjustBalance(acc.id, parsed.type, parsed.amount, +1, env);

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

  await env.DB.prepare(`
    INSERT INTO transactions (id, user_id, date, type, amount, note, store, account_id, category_id, raw_text, source)
    VALUES (?, ?, ?, 'expense', ?, ?, null, ?, null, ?, 'telegram')
  `).bind(idOut, userId, date, parsed.amount, note, fromAcc.id, rawText).run();

  await env.DB.prepare(`
    INSERT INTO transactions (id, user_id, date, type, amount, note, store, account_id, category_id, raw_text, source)
    VALUES (?, ?, ?, 'income', ?, ?, null, ?, null, ?, 'telegram')
  `).bind(idIn, userId, date, parsed.amount, note, toAcc.id, rawText).run();

  await adjustBalance(fromAcc.id, "expense", parsed.amount, +1, env);
  await adjustBalance(toAcc.id,   "income",  parsed.amount, +1, env);

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
async function handlePhoto(msg, chatId, userId, env) {
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
    const result = await ocrReceipt(base64, "image/jpeg", env);

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
        await env.DB.prepare(`
          INSERT INTO transactions (id, user_id, date, type, amount, note, store, account_id, category_id, raw_text, source)
          VALUES (?, ?, ?, 'income', ?, ?, ?, ?, ?, '[foto struk]', 'telegram')
        `).bind(id, userId, date, result.total, "Top-up " + targetAcc.name, result.store || null, targetAcc.id, cat?.id || null).run();
        await saveTransactionItems(id, result.items, env);
        await adjustBalance(targetAcc.id, "income", result.total, +1, env);

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
      await env.DB.prepare(`
        INSERT INTO transactions (id, user_id, date, type, amount, note, store, account_id, category_id, raw_text, source)
        VALUES (?, ?, ?, 'expense', ?, ?, ?, ?, ?, '[foto struk]', 'telegram')
      `).bind(id, userId, date, parsed.amount, parsed.note || "", parsed.store || null, matchedAcc.id, cat?.id || null).run();

      await saveTransactionItems(id, result.items, env);
      await adjustBalance(matchedAcc.id, "expense", parsed.amount, +1, env);

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
    const draft = await env.DB.prepare("SELECT * FROM pending_scans WHERE id = ?").bind(pendingId).first();
    if (!draft) {
      await editTgMessage(chatId, messageId, "⚠️ *Data struk kedaluwarsa atau sudah pernah disimpan.*", env);
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
    await env.DB.prepare(`
      INSERT INTO transactions (id, user_id, date, type, amount, note, store, account_id, category_id, raw_text, source)
      VALUES (?, ?, ?, 'expense', ?, ?, ?, ?, ?, '[foto struk]', 'telegram')
    `).bind(txId, userId, draft.date, amount, draftNote, draft.store, accountId, cat?.id || null).run();

    await saveTransactionItems(txId, items, env);
    await adjustBalance(accountId, "expense", amount, +1, env);
    await env.DB.prepare("DELETE FROM pending_scans WHERE id = ?").bind(pendingId).run();

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

  await adjustBalance(tx.account_id, tx.type, tx.amount, -1, env);
  vals.push(txId);
  await env.DB.prepare(`UPDATE transactions SET ${fields.join(", ")} WHERE id = ?`).bind(...vals).run();
  const updated = await env.DB.prepare(`SELECT * FROM transactions WHERE id = ?`).bind(txId).first();
  await adjustBalance(updated.account_id, updated.type, updated.amount, +1, env);

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
  await adjustBalance(tx.account_id, tx.type, tx.amount, -1, env);
  await env.DB.prepare("DELETE FROM transaction_items WHERE transaction_id = ?").bind(txId).run().catch(() => {});
  await env.DB.prepare(`DELETE FROM transactions WHERE id = ?`).bind(txId).run();
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
    ]]
  );
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
    LEFT JOIN categories c ON t.category_id = c.id
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

async function groqChat(messages, env, { models = PARSE_MODELS, maxTokens = 300, temperature = 0.1, jsonMode = false } = {}) {
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
        data.choices[0].message.content = data.choices[0].message.content.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
      }
      return { data, model };
    } catch (e) { lastError = `${model}: ${e.message}`; continue; }
  }
  throw new Error(`Semua model gagal. Terakhir: ${lastError}`);
}

async function parseWithGroq(text, env) {
  const today     = todayStr();
  const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];
  const twoDaysAgo = new Date(Date.now() - 2 * 86400000).toISOString().split("T")[0];

  const system = `Kamu adalah AI pencatat keuangan untuk orang Indonesia. Pahami bahasa gaul, singkatan, typo.

Field yang diekstrak:
- type: "income" jika ada kata gaji/dapat/terima/masuk/refund/cashback/topup/top-up/isi saldo/isi ulang, "transfer" jika pindah uang antar rekening sendiri (pindah/transfer ke/dari), selain itu "expense". PENTING: "topup gopay/ovo/dana/shopeepay" = income ke rekening e-wallet tersebut, BUKAN expense.
- amount: angka murni. rb/ribu/k=×1000, jt/juta=×1000000. Titik adalah pemisah ribuan: "15.000"→15000
- note: deskripsi item/barang yang dibeli/dijual, TANPA nama toko. Maks 60 karakter.
- store: nama toko/merchant/tempat. Deteksi dari pola "di X", "dari X", "@ X", atau nama brand dikenal. Tulis dalam Title Case. null jika tidak ada.
- date: YYYY-MM-DD jika ada petunjuk tanggal, null jika tidak ada petunjuk waktu sama sekali.
  Referensi waktu sekarang:
  • Hari ini / tadi / barusan / pagi ini / tadi malam / malam ini → ${today}
  • Kemarin / kemaren / yesterday → ${yesterday}
  • 2 hari lalu / dua hari lalu → ${twoDaysAgo}
  • Minggu lalu → hitung mundur 7 hari dari ${today}
  • Jika TIDAK ada petunjuk waktu sama sekali → null
- account_name: nama rekening jika disebutkan (mandiri, bca, jago, gopay, ovo, dana, tunai, dll), null jika tidak. Untuk transfer: null.
- from_account: rekening asal jika type=transfer, null jika bukan transfer
- to_account: rekening tujuan jika type=transfer, null jika bukan transfer
- category_name: pilih dari: Makanan & Minuman, Transportasi, Belanja, Kesehatan, Hiburan, Tagihan, Pendidikan, Gaji, Investasi, Lainnya

CONTOH:
"beli rokok 25000 di warung madura pakai mandiri"
→ {"type":"expense","amount":25000,"note":"beli rokok","store":"Warung Madura","date":null,"account_name":"mandiri","category_name":"Makanan & Minuman"}

"kemarin makan siang warteg 15rb"
→ {"type":"expense","amount":15000,"note":"makan siang","store":"Warteg","date":"${yesterday}","account_name":null,"category_name":"Makanan & Minuman"}

"tadi pagi gojek ke kantor 35rb gopay"
→ {"type":"expense","amount":35000,"note":"gojek ke kantor","store":"Gojek","date":"${today}","account_name":"gopay","category_name":"Transportasi"}

"pindah 500rb dari mandiri ke seabank"
→ {"type":"transfer","amount":500000,"note":"transfer mandiri ke seabank","store":null,"date":null,"account_name":null,"from_account":"mandiri","to_account":"seabank","category_name":null}

"topup gopay 700rb"
→ {"type":"income","amount":700000,"note":"topup gopay","store":null,"date":null,"account_name":"gopay","category_name":"Lainnya"}

Balas HANYA JSON valid tanpa markdown:
{"type":"expense","amount":0,"note":"","store":null,"date":null,"account_name":null,"from_account":null,"to_account":null,"category_name":null}`;

  try {
    const { data } = await groqChat(
      [{ role: "system", content: system }, { role: "user", content: text }],
      env, { maxTokens: 200, jsonMode: true }
    );
    const raw = data.choices?.[0]?.message?.content || "";
    return extractJSON(raw);
  } catch (e) { return { _error: e.message }; }
}

async function parseCorrection(text, currentTx, env) {
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
    `- category : pilih dari: Makanan & Minuman, Transportasi, Belanja, Kesehatan, Hiburan, Tagihan, Pendidikan, Gaji, Investasi, Lainnya\n` +
    `- type     : HANYA jika user EKSPLISIT bilang "tipe income"/"tipe expense"/"ubah ke pemasukan"/"ubah ke pengeluaran"\n` +
    `- date     : YYYY-MM-DD. Referensi: hari ini=${today}, kemarin=${yesterday}\n\n` +
    `WHITELIST NAMA REKENING:\n` +
    `Bank umum: bca, mandiri, bni, bri, btn, jago, seabank, blu, neo, allobank, aladin, superbank, linebank, jenius\n` +
    `E-wallet: gopay, ovo, dana, shopeepay, linkaja, flip, tunai, cash\n\n` +
    `INGAT: Output HANYA field yang user sebut. JANGAN tambah field lain. Balas HANYA JSON valid.`;

  try {
    const { data } = await groqChat(
      [{ role: "system", content: system }, { role: "user", content: prompt }],
      env, { maxTokens: 200, jsonMode: true }
    );
    const raw = data.choices?.[0]?.message?.content || "";
    return extractJSON(raw);
  } catch (e) { return { _error: e.message }; }
}

// ─────────────────────────────────────────────────────
// OCR STRUK — strict null/NaN 0-Rupiah Voucher Fix
// ─────────────────────────────────────────────────────
async function ocrReceipt(base64, mime, env) {
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
  if (!messages?.length) return jsonRes({ error: "messages diperlukan" }, 400);
  const chain = (Array.isArray(models) && models.length)
    ? models.filter(m => CHAT_MODELS.includes(m))
    : CHAT_MODELS;
  const tokenLimit = (typeof max_tokens === "number" && max_tokens > 0) ? max_tokens : 2048;
  try {
    const { data, model } = await groqChat(messages, env, {
      models: chain.length ? chain : CHAT_MODELS,
      maxTokens: tokenLimit,
      temperature: 0.8,
    });
    let content = data.choices?.[0]?.message?.content || "";
    // Strip Qwen3 <think>...</think> reasoning blocks
    content = content.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
    return jsonRes({ content, model });
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
  const result = await ocrReceipt(image, mime, env);
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
  if (text.includes("obat") || text.includes("sakit") || text.includes("dokter") || text.includes("klinik") || text.includes("apotek") || text.includes("rs") || text.includes("sehat")) {
    return cats.find(c => c.id === "c4") || cats.find(c => c.name.includes("Kesehatan"));
  }
  if (text.includes("bioskop") || text.includes("nonton") || text.includes("game") || text.includes("travel") || text.includes("hiburan") || text.includes("wisata") || text.includes("staycation")) {
    return cats.find(c => c.id === "c5") || cats.find(c => c.name.includes("Hiburan"));
  }
  if (text.includes("listrik") || text.includes("air") || text.includes("pdam") || text.includes("wifi") || text.includes("pulsa") || text.includes("internet") || text.includes("bpjs") || text.includes("kontrakan") || text.includes("kos")) {
    return cats.find(c => c.id === "c6") || cats.find(c => c.name.includes("Tagihan"));
  }
  if (text.includes("buku") || text.includes("sekolah") || text.includes("kuliah") || text.includes("kursus") || text.includes("pendidikan") || text.includes("spp") || text.includes("latihan")) {
    return cats.find(c => c.id === "c7") || cats.find(c => c.name.includes("Pendidikan"));
  }
  if (text.includes("gaji") || text.includes("bonus") || text.includes("thr") || text.includes("income")) {
    return cats.find(c => c.id === "c8") || cats.find(c => c.name.includes("Gaji"));
  }
  if (text.includes("reksa") || text.includes("saham") || text.includes("crypto") || text.includes("investasi") || text.includes("emas") || text.includes("obligasi")) {
    return cats.find(c => c.id === "c9") || cats.find(c => c.name.includes("Investasi"));
  }
  return cats.find(c => c.id === "c12") || cats.find(c => c.type === "both") || cats[0];
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
        telegram_id TEXT,
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

    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS categories (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        name TEXT NOT NULL,
        emoji TEXT,
        type TEXT NOT NULL
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
      CREATE TABLE IF NOT EXISTS processed_updates (
        update_id INTEGER PRIMARY KEY,
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

    // ── Setup Telegram Bot Commands (burger menu) ──
    const TOKEN = env.TELEGRAM_TOKEN || env.TELEGRAM_BOT_TOKEN;
    if (TOKEN) {
      await fetch(`https://api.telegram.org/bot${TOKEN}/setMyCommands`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          commands: [
            { command: "start", description: "Mulai bot Laksa" },
            { command: "menu",  description: "Buka dashboard keuangan" },
            { command: "myid",  description: "Lihat Telegram ID kamu" },
          ]
        })
      }).catch(() => {});
    }

    return jsonRes({ status: "success", message: "Database tables created + bot commands registered." });
  } catch (e) {
    return jsonRes({ error: e.message }, 500);
  }
}

async function seedCategories(userId, env) {
  const cats = [
    { id: "c1",  name: "Makanan & Minuman", emoji: "🍜", type: "expense" },
    { id: "c2",  name: "Transportasi",      emoji: "🚗", type: "expense" },
    { id: "c3",  name: "Belanja",           emoji: "🛍️", type: "expense" },
    { id: "c4",  name: "Kesehatan",         emoji: "🏥", type: "expense" },
    { id: "c5",  name: "Hiburan",           emoji: "🎮", type: "expense" },
    { id: "c6",  name: "Tagihan",           emoji: "💡", type: "expense" },
    { id: "c7",  name: "Pendidikan",        emoji: "📚", type: "expense" },
    { id: "c8",  name: "Gaji",              emoji: "💼", type: "income"  },
    { id: "c9",  name: "Investasi",         emoji: "📈", type: "income"  },
    { id: "c12", name: "Lainnya",           emoji: "📌", type: "both"    },
  ];
  for (const c of cats) {
    await env.DB.prepare(`
      INSERT OR IGNORE INTO categories (id, user_id, name, emoji, type)
      VALUES (?, ?, ?, ?, ?)
    `).bind(c.id, userId, c.name, c.emoji, c.type).run();
  }
}

async function dbAccounts(userId, env) {
  const { results } = await env.DB.prepare("SELECT * FROM accounts WHERE user_id = ? ORDER BY name ASC").bind(userId).all();
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
    LEFT JOIN categories c ON t.category_id = c.id
    WHERE t.id = ?
  `).bind(id).first();
}

// ─────────────────────────────────────────────────────
// CRUD ENDPOINT HANDLERS
// ─────────────────────────────────────────────────────
async function getAccounts(uid, env) {
  const { results } = await env.DB.prepare("SELECT * FROM accounts WHERE user_id = ? ORDER BY name ASC").bind(uid).all();
  return jsonRes(results);
}

async function createAccount(uid, body, env) {
  const id = body.id || randomId();
  await env.DB.prepare("INSERT INTO accounts (id, user_id, name, balance, color) VALUES (?, ?, ?, ?, ?)")
    .bind(id, uid, body.name, body.balance || 0, body.color || null)
    .run();
  return jsonRes({ id, status: "created" });
}

async function updateAccount(uid, id, body, env) {
  const fields = [];
  const vals = [];
  if (body.name !== undefined) { fields.push("name = ?"); vals.push(body.name); }
  if (body.balance !== undefined) { fields.push("balance = ?"); vals.push(body.balance); }
  if (body.color !== undefined) { fields.push("color = ?"); vals.push(body.color); }
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
  const id = body.id || randomId();
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
  const limit = parseInt(url.searchParams.get("limit") || "100", 10);
  let query = `
    SELECT t.*, a.name AS account_name, c.name AS category_name, c.emoji AS category_emoji
    FROM transactions t
    LEFT JOIN accounts a ON t.account_id = a.id
    LEFT JOIN categories c ON t.category_id = c.id
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
  const id = body.id || randomId();
  const date = body.date || todayStr();
  await env.DB.prepare(`
    INSERT INTO transactions (id, user_id, date, type, amount, note, store, account_id, category_id, raw_text, source)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id, uid, date, body.type, body.amount,
    body.note || "", body.store || null,
    body.account_id, body.category_id || null,
    body.raw_text || null, body.source || "web"
  ).run();

  await adjustBalance(body.account_id, body.type, body.amount, +1, env);
  return jsonRes({ id, status: "created" });
}

async function updateTransaction(uid, id, body, env) {
  const tx = await env.DB.prepare("SELECT * FROM transactions WHERE id = ? AND user_id = ?").bind(id, uid).first();
  if (!tx) return jsonRes({ error: "Transaction not found" }, 404);

  await adjustBalance(tx.account_id, tx.type, tx.amount, -1, env);

  const date = body.date || tx.date;
  const type = body.type || tx.type;
  const amount = body.amount !== undefined ? body.amount : tx.amount;
  const note = body.note !== undefined ? body.note : tx.note;
  const store = body.store !== undefined ? body.store : tx.store;
  const account_id = body.account_id || tx.account_id;
  const category_id = body.category_id !== undefined ? body.category_id : tx.category_id;

  await env.DB.prepare(`
    UPDATE transactions
    SET date = ?, type = ?, amount = ?, note = ?, store = ?, account_id = ?, category_id = ?
    WHERE id = ? AND user_id = ?
  `).bind(date, type, amount, note, store, account_id, category_id, id, uid).run();

  await adjustBalance(account_id, type, amount, +1, env);
  return jsonRes({ status: "updated" });
}

async function deleteTransaction(uid, id, env) {
  const tx = await env.DB.prepare("SELECT * FROM transactions WHERE id = ? AND user_id = ?").bind(id, uid).first();
  if (tx) {
    await adjustBalance(tx.account_id, tx.type, tx.amount, -1, env);
    await env.DB.prepare("DELETE FROM transaction_items WHERE transaction_id = ?").bind(id).run().catch(() => {});
    await env.DB.prepare("DELETE FROM transactions WHERE id = ? AND user_id = ?").bind(id, uid).run();
  }
  return jsonRes({ status: "deleted" });
}

async function getBudgets(uid, env) {
  const { results } = await env.DB.prepare(`
    SELECT b.*, c.name AS category_name, c.emoji AS category_emoji
    FROM budgets b
    LEFT JOIN categories c ON b.category_id = c.id
    WHERE b.user_id = ?
  `).bind(uid).all();
  return jsonRes(results);
}

async function createBudget(uid, body, env) {
  const id = body.id || randomId();
  await env.DB.prepare("INSERT INTO budgets (id, user_id, category_id, limit_amount, month) VALUES (?, ?, ?, ?, ?)")
    .bind(id, uid, body.category_id, body.limit_amount, body.month || new Date().toISOString().slice(0, 7))
    .run();
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
  const id = body.id || randomId();
  await env.DB.prepare("INSERT INTO goals (id, user_id, name, target, current, deadline, icon) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .bind(id, uid, body.name, body.target, body.current || 0, body.deadline || null, body.icon || "target")
    .run();
  return jsonRes({ id, status: "created" });
}

async function updateGoal(uid, id, body, env) {
  const fields = [];
  const vals = [];
  if (body.name !== undefined) { fields.push("name = ?"); vals.push(body.name); }
  if (body.target !== undefined) { fields.push("target = ?"); vals.push(body.target); }
  if (body.current !== undefined) { fields.push("current = ?"); vals.push(body.current); }
  if (body.deadline !== undefined) { fields.push("deadline = ?"); vals.push(body.deadline); }
  if (body.icon !== undefined) { fields.push("icon = ?"); vals.push(body.icon); }
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
  const id = body.id || randomId();
  await env.DB.prepare(`
    INSERT INTO bills (id, user_id, name, amount, status, due_type, due_day, due_date, paid_date)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(id, uid, body.name, body.amount || 0, body.status || "unpaid", body.due_type || "monthly", body.due_day || null, body.due_date || null, body.paid_date || null)
    .run();
  return jsonRes({ id, status: "created" });
}

async function updateBill(uid, id, body, env) {
  const fields = [];
  const vals = [];
  if (body.name !== undefined) { fields.push("name = ?"); vals.push(body.name); }
  if (body.amount !== undefined) { fields.push("amount = ?"); vals.push(body.amount); }
  if (body.status !== undefined) { fields.push("status = ?"); vals.push(body.status); }
  if (body.due_type !== undefined) { fields.push("due_type = ?"); vals.push(body.due_type); }
  if (body.due_day !== undefined) { fields.push("due_day = ?"); vals.push(body.due_day); }
  if (body.due_date !== undefined) { fields.push("due_date = ?"); vals.push(body.due_date); }
  if (body.paid_date !== undefined) { fields.push("paid_date = ?"); vals.push(body.paid_date); }
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
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function cors(response) {
  const headers = new Headers(response.headers);
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
    headers: { "Content-Type": "application/json" }
  });
}

async function adjustBalance(accountId, type, amount, factor, env) {
  const sign = type === "income" ? 1 : -1;
  const diff = amount * sign * factor;
  await env.DB.prepare("UPDATE accounts SET balance = balance + ? WHERE id = ?").bind(diff, accountId).run();
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
  const { borrower_name, amount, returned = 0, note = "", lend_date, due_date = null, status = "active" } = body;
  if (!borrower_name?.trim() || !amount) {
    return jsonRes({ error: "borrower_name dan amount diperlukan" }, 400);
  }
  const id = randomId();
  await env.DB.prepare(`
    INSERT INTO piutang (id, user_id, borrower_name, amount, returned, note, lend_date, due_date, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(id, uid, borrower_name.trim(), Number(amount), Number(returned), note, lend_date || todayStr(), due_date, status).run();

  return jsonRes(await env.DB.prepare("SELECT * FROM piutang WHERE id = ?").bind(id).first(), 201);
}

async function updatePiutang(uid, id, body, env) {
  const ptg = await env.DB.prepare("SELECT * FROM piutang WHERE id = ? AND user_id = ?").bind(id, uid).first();
  if (!ptg) return jsonRes({ error: "Data piutang tidak ditemukan" }, 404);

  const VALID = { borrower_name: 1, amount: 1, returned: 1, note: 1, lend_date: 1, due_date: 1, status: 1 };
  const f = [], v = [];
  for (const [k, val] of Object.entries(body)) {
    if (VALID[k]) {
      f.push(`${k} = ?`);
      v.push(val);
    }
  }
  if (f.length) {
    v.push(id);
    await env.DB.prepare(`UPDATE piutang SET ${f.join(", ")} WHERE id = ?`).bind(...v).run();
  }
  return jsonRes(await env.DB.prepare("SELECT * FROM piutang WHERE id = ?").bind(id).first());
}

async function deletePiutang(uid, id, env) {
  const ptg = await env.DB.prepare("SELECT * FROM piutang WHERE id = ? AND user_id = ?").bind(id, uid).first();
  if (!ptg) return jsonRes({ error: "Data piutang tidak ditemukan" }, 404);
  await env.DB.prepare("DELETE FROM piutang WHERE id = ?").bind(id).run();
  return jsonRes({ deleted: id });
}
