/**
 * LAKSA BOT — Cloudflare Worker v3.0
 * ─────────────────────────────────────────────────────
 * Clean rewrite. Single source of truth: Cloudflare D1.
 *
 * ENV VARS : TELEGRAM_TOKEN, GROQ_API_KEY
 * D1 BINDING: DB
 *
 * Fitur Bot Telegram:
 *   • Catat transaksi via teks bebas (fully auto)
 *   • Scan struk via foto
 *   • Lihat saldo & riwayat
 *   • Tagihan & pengingat
 *
 * Fitur Web API:
 *   • CRUD accounts, categories, transactions, budgets, goals, bills
 *   • POST /ai-chat      — proxy AI chat ke Groq
 *   • POST /scan-receipt — proxy scan struk ke Groq Vision
 *
 * Rekening: auto-detect dari teks → fallback keyboard jika tidak dikenali
 * Transaksi: fully auto jika rekening + kategori terdeteksi, langsung simpan
 */

// ─────────────────────────────────────────────────────
// CONSTANTS
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

const DEFAULT_CATEGORIES = [
  { name: "Makanan & Minuman", emoji: "🍜", type: "expense" },
  { name: "Transportasi",      emoji: "🚗", type: "expense" },
  { name: "Belanja",           emoji: "🛍️", type: "expense" },
  { name: "Kesehatan",         emoji: "🏥", type: "expense" },
  { name: "Hiburan",           emoji: "🎮", type: "expense" },
  { name: "Tagihan",           emoji: "💡", type: "expense" },
  { name: "Pendidikan",        emoji: "📚", type: "expense" },
  { name: "Gaji",              emoji: "💼", type: "income"  },
  { name: "Investasi",         emoji: "📈", type: "income"  },
  { name: "Lainnya",           emoji: "📌", type: "both"    },
];

// Volatile state per chat (in-memory)
// Hanya dipakai saat fallback pilih rekening lewat keyboard
const PENDING = new Map(); // chatId → { parsed, rawText, cat }

// ─────────────────────────────────────────────────────
// ENTRY POINT
// ─────────────────────────────────────────────────────
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return cors(new Response(null, { status: 204 }));
    try {
      if (request.method === "POST" && url.pathname === "/webhook") {
        const body = await request.json();
        await handleTelegram(body, env);
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
  const uid  = url.searchParams.get("user_id");

  if (path === "/" && m === "GET") return jsonRes({ status: "ok", version: "3.0.0" });
  if (path === "/setup")           return setupDatabase(env);

  // Web AI proxy (tidak perlu user_id)
  if (path === "/ai-chat"      && m === "POST") return handleAiChat(uid, await req.json(), env);
  if (path === "/scan-receipt" && m === "POST") return handleScanReceipt(uid, await req.json(), env);

  if (!uid) return jsonRes({ error: "user_id diperlukan" }, 400);

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

  // summary
  if (path === "/summary" && m === "GET") return getSummary(uid, url, env);

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

    // Perintah
    if (text === "/start" || text === "/menu") { await sendMenu(chatId, env); return; }
    if (text === "/myid")    { await sendMyId(chatId, userId, msg.from.first_name, env); return; }
    if (text === "/saldo")   { await sendSaldo(chatId, userId, env); return; }
    if (text === "/riwayat") { await sendRiwayat(chatId, userId, env); return; }
    if (text === "/tagihan") { await sendTagihan(chatId, userId, env); return; }
    if (text === "/batal")   { PENDING.delete(chatId); await tgSend(chatId, "❌ Dibatalkan.", env); return; }

    // Reply ke pesan bot → koreksi transaksi
    if (msg.reply_to_message?.from?.is_bot) {
      await handleCorrection(chatId, userId, msg.reply_to_message.text || "", text, env);
      return;
    }

    // Teks bebas → catat transaksi
    if (!text.startsWith("/")) { await handleFreeText(chatId, userId, text, env); return; }

    await sendMenu(chatId, env);
  } catch (e) {
    console.error("handleTelegram error:", e.message, e.stack);
    if (chatId) {
      await tgSend(chatId, "❌ Terjadi error: " + e.message + "\n\nCoba lagi atau ketik /menu.", env).catch(() => {});
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

  await fetch(`${TG(env.TELEGRAM_TOKEN)}/answerCallbackQuery`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ callback_query_id: cb.id }),
  });

  if (data === "menu")    { await sendMenu(chatId, env); return; }
  if (data === "saldo")   { await sendSaldo(chatId, userId, env); return; }
  if (data === "riwayat") { await sendRiwayat(chatId, userId, env); return; }
  if (data === "tagihan") { await sendTagihan(chatId, userId, env); return; }

  // Pilih rekening (fallback keyboard)
  if (data.startsWith("acc:")) { await handleAccPick(chatId, userId, data.slice(4), env); return; }

  // Edit transaksi via tombol
  if (data.startsWith("del:"))      { await deleteTx(chatId, userId, data.slice(4), env); return; }
  if (data.startsWith("del_transfer:")) {
    // data: "del_transfer:{idOut}"
    const idOut = data.slice(13);
    // Cari transaksi income pasangan (raw_text sama, type=income, dibuat bersamaan)
    const txOut = await env.DB.prepare(`SELECT * FROM transactions WHERE id = ? AND user_id = ?`).bind(idOut, userId).first();
    const txIn  = txOut
      ? await env.DB.prepare(`SELECT * FROM transactions WHERE user_id = ? AND type = 'income' AND raw_text = ? AND date = ? AND amount = ? AND id != ? ORDER BY created_at DESC LIMIT 1`)
          .bind(userId, txOut.raw_text, txOut.date, txOut.amount, idOut).first()
      : null;
    await deleteTx(chatId, userId, idOut, env);
    // Hapus juga transaksi masuk (income side) tanpa notifikasi ganda
    if (txIn) {
      await adjustBalance(txIn.account_id, txIn.type, txIn.amount, -1, env);
      await env.DB.prepare(`DELETE FROM transactions WHERE id = ?`).bind(txIn.id).run();
    }
    await tgSend(chatId, "🔄 *Transfer dibatalkan dan saldo dikembalikan.*", env,
      [[{ text: "🏠 Menu", callback_data: "menu" }]]
    );
    return;
  }
  if (data.startsWith("edit_acc:")) { await promptPickAccount(chatId, userId, data.slice(9), env); return; }
  if (data.startsWith("edit_cat:")) { await promptPickCategory(chatId, userId, data.slice(9), env); return; }
  if (data.startsWith("set_acc:"))  { await setTxAccount(chatId, userId, data, env); return; }
  if (data.startsWith("set_cat:"))  { await setTxCategory(chatId, userId, data, env); return; }

  // Edit jumlah & keterangan via ForceReply — user tinggal reply, handleCorrection tangkap otomatis
  if (data.startsWith("edit_amt:")) {
    const txId = data.slice(9);
    await tgSendForceReply(chatId,
      `✏️ *Edit Jumlah*

Reply pesan ini dengan jumlah baru.
_Contoh: 25rb atau 25000_

ID: ${txId}`,
      env
    );
    return;
  }
  if (data.startsWith("edit_note:")) {
    const txId = data.slice(10);
    await tgSendForceReply(chatId,
      `✏️ *Edit Keterangan*

Reply pesan ini dengan keterangan baru.
_Contoh: beli obat di apotek_

ID: ${txId}`,
      env
    );
    return;
  }
}

// ─────────────────────────────────────────────────────
// TEKS BEBAS → CATAT TRANSAKSI (FULLY AUTO)
// ─────────────────────────────────────────────────────
async function handleFreeText(chatId, userId, text, env) {
  if (!likelyTx(text)) { await sendMenu(chatId, env); return; }

  await tgSend(chatId, "⏳ Memproses...", env);

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
  if (!parsed.amount || parsed.amount <= 0) {
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

  // 5. Rekening tidak ketemu → fallback keyboard
  PENDING.set(chatId, { parsed, rawText: text, cat });
  await tgSend(chatId,
    `📋 *${fmtType(parsed.type)}: Rp${fmt(parsed.amount)}*\n📝 ${parsed.note || "-"}\n\n*Pilih rekening:*`,
    env,
    chunks(accs.map(a => ({ text: a.name, callback_data: `acc:${a.id}` })), 2)
  );
}

async function handleAccPick(chatId, userId, accId, env) {
  const pending = PENDING.get(chatId);
  if (!pending) { await tgSend(chatId, "❌ Sesi habis. Kirim ulang transaksinya ya.", env); return; }
  const acc = await env.DB.prepare(`SELECT * FROM accounts WHERE id = ? AND user_id = ?`).bind(accId, userId).first();
  if (!acc) { await tgSend(chatId, "❌ Rekening tidak valid.", env); return; }
  PENDING.delete(chatId);
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

  await tgSend(chatId,
    `${emoji} *Tersimpan!*\n\n${formatTx(tx)}\n\nID: ${id}`,
    env,
    [[
      { text: "✏️ Jumlah",     callback_data: `edit_amt:${id}`  },
      { text: "✏️ Keterangan", callback_data: `edit_note:${id}` },
    ],[
      { text: "💳 Rekening",   callback_data: `edit_acc:${id}`  },
      { text: "🏷️ Kategori",  callback_data: `edit_cat:${id}`  },
    ],[
      { text: "🗑️ Hapus",     callback_data: `del:${id}`       },
      { text: "🏠 Menu",       callback_data: "menu"            },
    ]]
  );
}

// ─────────────────────────────────────────────────────
// TRANSFER ANTAR REKENING
// ─────────────────────────────────────────────────────
async function handleTransfer(chatId, userId, parsed, accs, rawText, env) {
  const fromAcc = resolveAccount(parsed.from_account, accs);
  const toAcc   = resolveAccount(parsed.to_account, accs);

  // Kedua rekening tidak ketemu → tanya manual
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
    await tgSend(chatId, "❌ Rekening asal dan tujuan tidak boleh sama.", env);
    return;
  }

  await saveTransfer(chatId, userId, parsed, fromAcc, toAcc, rawText, env);
}

async function saveTransfer(chatId, userId, parsed, fromAcc, toAcc, rawText, env) {
  const date    = parsed.date || todayStr();
  const note    = parsed.note || `Transfer ${fromAcc.name} → ${toAcc.name}`;
  const idOut   = randomId();
  const idIn    = randomId();

  // Simpan 2 transaksi: expense dari rekening asal + income ke rekening tujuan
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
// FOTO → SCAN STRUK
// ─────────────────────────────────────────────────────
async function handlePhoto(msg, chatId, userId, env) {
  await tgSend(chatId, "📸 Membaca struk...", env);

  // Download foto dari Telegram
  const fileId  = msg.photo[msg.photo.length - 1].file_id;
  const fileRes = await fetch(`${TG(env.TELEGRAM_TOKEN)}/getFile?file_id=${fileId}`);
  const fd      = await fileRes.json();
  if (!fd.ok) { await tgSend(chatId, "❌ Gagal ambil foto dari Telegram.", env); return; }

  const fileUrl = `https://api.telegram.org/file/bot${env.TELEGRAM_TOKEN}/${fd.result.file_path}`;
  const imgRes  = await Promise.race([
    fetch(fileUrl),
    new Promise((_, r) => setTimeout(() => r(new Error("timeout")), 15000)),
  ]).catch(() => ({ ok: false }));

  if (!imgRes.ok) { await tgSend(chatId, "❌ Gagal download foto. Coba lagi.", env); return; }

  const base64 = bufToBase64(await imgRes.arrayBuffer());
  const result = await ocrReceipt(base64, "image/jpeg", env);

  if (result._error) {
    await tgSend(chatId,
      `❌ Gagal baca struk: ${result._error}\n\n• Foto lebih terang & fokus\n• Atau ketik manual: _beli di indomaret 45rb_`,
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

  const cats        = await dbCategories(userId, env);
  const filteredCats = cats.filter(c => c.type === "expense" || c.type === "both");
  const cat         = resolveCategory(null, result.note, result.store, "expense", filteredCats);
  const parsed      = { type: "expense", amount: result.total, note: result.note, store: result.store, date: result.date, account_name: null };

  if (accs.length === 1) {
    await saveTx(chatId, userId, parsed, accs[0], cat, "[foto struk]", env);
  } else {
    PENDING.set(chatId, { parsed, rawText: "[foto struk]", cat });
    await tgSend(chatId,
      `📋 *Struk: Rp${fmt(result.total)}*\n🏪 ${result.store || "-"}\n📅 ${result.date || "hari ini"}\n\n*Pilih rekening:*`,
      env,
      chunks(accs.map(a => ({ text: a.name, callback_data: `acc:${a.id}` })), 2)
    );
  }
}

// ─────────────────────────────────────────────────────
// KOREKSI VIA REPLY
// ─────────────────────────────────────────────────────
async function handleCorrection(chatId, userId, botMsg, userText, env) {
  const idMatch = botMsg.match(/ID: `?([a-f0-9-]{36})`?/);
  if (!idMatch) {
    await tgSend(chatId, "❌ Reply ke pesan konfirmasi yang ada ID-nya.", env);
    return;
  }

  const txId = idMatch[1];
  const tx   = await env.DB.prepare(`SELECT * FROM transactions WHERE id = ? AND user_id = ?`).bind(txId, userId).first();
  if (!tx) { await tgSend(chatId, "❌ Transaksi tidak ditemukan.", env); return; }

  await tgSend(chatId, "⏳ Memproses koreksi...", env);
  const raw = await parseCorrection(userText, tx, env);
  if (!raw || raw._error) {
    await tgSend(chatId,
      "❌ Tidak bisa memahami koreksinya.\n\nContoh:\n_jumlah 25rb_\n_rekening jago_\n_catatan beli obat_",
      env
    );
    return;
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
  if (!fields.length) { await tgSend(chatId, "❌ Tidak ada yang bisa diubah.", env); return; }

  await adjustBalance(tx.account_id, tx.type, tx.amount, -1, env);
  vals.push(txId);
  await env.DB.prepare(`UPDATE transactions SET ${fields.join(", ")} WHERE id = ?`).bind(...vals).run();
  const updated = await env.DB.prepare(`SELECT * FROM transactions WHERE id = ?`).bind(txId).first();
  await adjustBalance(updated.account_id, updated.type, updated.amount, +1, env);

  const full  = await getTxFull(txId, env);
  const emoji = full.type === "income" ? "💚" : "🔴";
  await tgSend(chatId,
    `${emoji} *Diperbarui!*\n\n${formatTx(full)}\n\n_✏️ Reply pesan ini untuk koreksi lagi._\n\`ID: ${txId}\``,
    env,
    [[
      { text: "🗑️ Hapus", callback_data: `del:${txId}` },
      { text: "🏠 Menu",  callback_data: "menu"         },
    ]]
  );
}

// ─────────────────────────────────────────────────────
// EDIT TRANSAKSI VIA TOMBOL
// ─────────────────────────────────────────────────────
async function promptPickAccount(chatId, userId, txId, env) {
  const accs = await dbAccounts(userId, env);
  await tgSend(chatId, `*Pilih rekening baru:*`, env,
    chunks(accs.map(a => ({ text: a.name, callback_data: `set_acc:${txId}:${a.id}` })), 2)
  );
}

async function promptPickCategory(chatId, userId, txId, env) {
  const tx       = await env.DB.prepare(`SELECT * FROM transactions WHERE id = ?`).bind(txId).first();
  const cats     = await dbCategories(userId, env);
  const filtered = cats.filter(c => c.type === (tx?.type || "expense") || c.type === "both");
  await tgSend(chatId, `*Pilih kategori baru:*`, env,
    chunks(filtered.map(c => ({ text: `${c.emoji} ${c.name}`, callback_data: `set_cat:${txId}:${c.id}` })), 2)
  );
}

async function setTxAccount(chatId, userId, data, env) {
  // data: "set_acc:{txId}:{accId}"
  const [, txId, accId] = data.split(":");
  const tx = await env.DB.prepare(`SELECT * FROM transactions WHERE id = ? AND user_id = ?`).bind(txId, userId).first();
  if (!tx) { await tgSend(chatId, "❌ Transaksi tidak ditemukan.", env); return; }
  await adjustBalance(tx.account_id, tx.type, tx.amount, -1, env);
  await env.DB.prepare(`UPDATE transactions SET account_id = ? WHERE id = ?`).bind(accId, txId).run();
  await adjustBalance(accId, tx.type, tx.amount, +1, env);
  const full = await getTxFull(txId, env);
  await tgSend(chatId, `✅ *Rekening diperbarui!*\n\n${formatTx(full)}\n\nID: ${txId}`, env,
    [[{ text: "🏠 Menu", callback_data: "menu" }]]
  );
}

async function setTxCategory(chatId, userId, data, env) {
  // data: "set_cat:{txId}:{catId}"
  const [, txId, catId] = data.split(":");
  const tx = await env.DB.prepare(`SELECT * FROM transactions WHERE id = ? AND user_id = ?`).bind(txId, userId).first();
  if (!tx) { await tgSend(chatId, "❌ Transaksi tidak ditemukan.", env); return; }
  await env.DB.prepare(`UPDATE transactions SET category_id = ? WHERE id = ?`).bind(catId, txId).run();
  const full = await getTxFull(txId, env);
  await tgSend(chatId, `✅ *Kategori diperbarui!*\n\n${formatTx(full)}\n\nID: ${txId}`, env,
    [[{ text: "🏠 Menu", callback_data: "menu" }]]
  );
}

async function deleteTx(chatId, userId, txId, env) {
  const tx = await env.DB.prepare(`SELECT * FROM transactions WHERE id = ? AND user_id = ?`).bind(txId, userId).first();
  if (!tx) { await tgSend(chatId, "❌ Transaksi tidak ditemukan.", env); return; }
  await adjustBalance(tx.account_id, tx.type, tx.amount, -1, env);
  await env.DB.prepare(`DELETE FROM transactions WHERE id = ?`).bind(txId).run();
  await tgSend(chatId, "🗑️ *Transaksi dihapus.*", env, [[{ text: "🏠 Menu", callback_data: "menu" }]]);
}

// ─────────────────────────────────────────────────────
// INFO COMMANDS
// ─────────────────────────────────────────────────────
async function sendMenu(chatId, env) {
  await tgSend(chatId,
    `🌊 *Laksa* — Pencatat Keuangan\n\n` +
    `Ketik langsung untuk mencatat:\n` +
    `_beli bakso 15rb pakai mandiri_\n` +
    `_gaji masuk 5jt ke bca_\n\n` +
    `Atau kirim foto struk 📸\n\n` +
    `*Perintah:*\n` +
    `/saldo — lihat saldo rekening\n` +
    `/riwayat — 10 transaksi terakhir\n` +
    `/tagihan — tagihan aktif\n` +
    `/myid — Telegram ID kamu\n` +
    `/batal — batalkan aksi`,
    env,
    [[
      { text: "💳 Saldo",    callback_data: "saldo"   },
      { text: "📋 Riwayat", callback_data: "riwayat" },
    ],[
      { text: "🗓️ Tagihan", callback_data: "tagihan" },
    ]]
  );
}

async function sendSaldo(chatId, userId, env) {
  const accs = await dbAccounts(userId, env);
  if (!accs.length) {
    await tgSend(chatId,
      "📭 Belum ada rekening.\n\nCatat transaksi pertamamu dan rekening akan dibuat otomatis.",
      env, [[{ text: "🏠 Menu", callback_data: "menu" }]]
    );
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
  await tgSend(chatId, msg, env, [[{ text: "🏠 Menu", callback_data: "menu" }]]);
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
    await tgSend(chatId, "📭 Belum ada transaksi.", env, [[{ text: "🏠 Menu", callback_data: "menu" }]]);
    return;
  }

  let msg = `📋 *10 Transaksi Terakhir:*\n\n`;
  for (const t of rows.results) {
    const e = t.type === "income" ? "💚" : "🔴";
    msg += `${e} ${fmtDate(t.date)} — *Rp${fmt(t.amount)}*\n`;
    msg += `   ${t.category_emoji || ""} ${t.note || "-"}  ·  ${t.account_name || "-"}\n\n`;
  }

  await tgSend(chatId, msg, env, [[{ text: "🏠 Menu", callback_data: "menu" }]]);
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
    await tgSend(chatId, "📭 Belum ada tagihan tercatat.\n\nTambahkan tagihan dari website Laksa.", env,
      [[{ text: "🏠 Menu", callback_data: "menu" }]]
    );
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

  await tgSend(chatId, msg, env, [[{ text: "🏠 Menu", callback_data: "menu" }]]);
}

async function sendMyId(chatId, userId, firstName, env) {
  await tgSend(chatId,
    `🪪 *Telegram ID kamu:*\n\n\`${userId}\`\n\nHai ${firstName || ""}! Salin angka ini ke halaman setup website Laksa. 🔒`,
    env
  );
}

// ─────────────────────────────────────────────────────
// AI — GROQ HELPERS
// ─────────────────────────────────────────────────────
async function groqChat(messages, env, { models = PARSE_MODELS, maxTokens = 300, temperature = 0.1, jsonMode = false } = {}) {
  let lastError = null;
  for (const model of models) {
    try {
      const payload = { model, messages, temperature, max_tokens: maxTokens };
      if (jsonMode) payload.response_format = { type: "json_object" };
      const res  = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${env.GROQ_API_KEY}` },
        body: JSON.stringify(payload),
      });
      if (res.status === 429 || res.status === 503) { lastError = `${model}: HTTP ${res.status}`; continue; }
      const data = await res.json();
      if (data.error) { lastError = `${model}: ${data.error.message}`; continue; }
      // Strip Qwen3 <think>...</think> reasoning blocks from response
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
- type: "income" jika ada kata gaji/dapat/terima/masuk/refund/cashback, "transfer" jika pindah uang antar rekening sendiri (pindah/transfer ke/dari), selain itu "expense"
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
    `Tugasmu: dari input bebas user, tentukan field mana yang ingin diubah dibanding transaksi saat ini. ` +
    `Balas HANYA JSON valid. Jangan tulis apapun selain JSON.`;

  const prompt =
    `TRANSAKSI SAAT INI:\n` +
    `- jumlah  : ${currentTx.amount}\n` +
    `- catatan : "${currentTx.note || ""}"\n` +
    `- tipe    : ${currentTx.type}\n` +
    `- tanggal : ${currentTx.date || today}\n\n` +
    `INPUT KOREKSI USER: "${text}"\n\n` +
    `TUGAS: Ekstrak HANYA field yang berubah. Output JSON dengan key yang relevan saja.\n\n` +
    `FIELD YANG BISA DIUBAH:\n` +
    `- amount   : angka murni. rb/ribu=x1000, jt/juta=x1000000. Titik=pemisah ribuan: "30.400"->30400\n` +
    `- note     : deskripsi/keterangan, string bebas maks 60 karakter\n` +
    `- account  : nama rekening (mandiri, bca, jago, gopay, ovo, dana, tunai, dll)\n` +
    `- category : pilih dari: Makanan & Minuman, Transportasi, Belanja, Kesehatan, Hiburan, Tagihan, Pendidikan, Gaji, Investasi, Lainnya\n` +
    `- type     : "income" atau "expense"\n` +
    `- date     : YYYY-MM-DD. Referensi: hari ini=${today}, kemarin=${yesterday}\n\n` +
    `WHITELIST NAMA REKENING (deteksi otomatis meski tanpa kata "pakai"/"rekening"/"ke"):\n` +
    `Bank umum: bca, mandiri, bni, bri, btn, bsi, bsi, mega, danamon, permata, panin, maybank, cimb, cimbniaga, ocbc, bukopin, dbs, hsbc, citibank, commonwealth, dki, nagari, jago, seabank, blu, neo, allobank, aladin, superbank, linebank, jenius, saqu, raya, hibank, ina, nobu, maspion, mayora, mestika, mnc, mncbank, victoria, sinarmas, btpn, sahabat sampoerna, anz, icbc, ccb\n` +
    `E-wallet & lainnya: gopay, ovo, dana, shopeepay, linkaja, flip, tunai, cash\n\n` +
    `ATURAN CERDAS:\n` +
    `- Input bisa kombinasi bebas, tangkap semua field yang disebutkan sekaligus\n` +
    `- Angka tanpa konteks lain = amount\n` +
    `- PRIORITAS TERTINGGI: Jika ada kata dari WHITELIST REKENING di manapun posisinya → SELALU tangkap sebagai account, BUKAN note\n` +
    `- Kata sifat/kegiatan/barang yang BUKAN nama rekening = note\n` +
    `- Jika user bilang "salah"/"bukan"/"harusnya"/"ganti" → fokus pada info setelahnya\n` +
    `- Jangan ubah field yang tidak disebutkan user\n` +
    `- Jangan tambahkan field dengan nilai sama dengan transaksi saat ini\n\n` +
    `CONTOH:\n` +
    `"30rb mandiri"                        -> {"amount":30000,"account":"mandiri"}\n` +
    `"20000 bank mandiri"                  -> {"amount":20000,"account":"mandiri"}\n` +
    `"bank bni"                            -> {"account":"bni"}\n` +
    `"salah, ini buat bensin gopay 35rb"   -> {"amount":35000,"note":"bensin","account":"gopay","category":"Transportasi"}\n` +
    `"kemarin beli makan siang bca 15000"  -> {"amount":15000,"note":"beli makan siang","account":"bca","date":"${yesterday}"}\n` +
    `"ganti ke transportasi"               -> {"category":"Transportasi"}\n` +
    `"bukan pengeluaran, ini pemasukan"    -> {"type":"income"}\n` +
    `"catatan obat batuk"                  -> {"note":"obat batuk"}\n` +
    `"eh salah rekening, pakai ovo"        -> {"account":"ovo"}\n` +
    `"15rb seabank"                        -> {"amount":15000,"account":"seabank"}`;

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
// JSON EXTRACTOR — robust, depth-aware
// ─────────────────────────────────────────────────────
function extractJSON(raw) {
  // 1. Direct parse
  try { return JSON.parse(raw.trim()); } catch {}
  // 2. Strip markdown fences then parse
  try {
    const s = raw.replace(/```json([\s\S]*?)```|```([\s\S]*?)```/g, (_, a, b) => (a || b || "").trim()).trim();
    return JSON.parse(s);
  } catch {}
  // 3. Find outermost { } by tracking depth
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

// ─────────────────────────────────────────────────────
// OCR STRUK — 2-pass: Vision OCR → Text Parser
// ─────────────────────────────────────────────────────
async function ocrReceipt(base64, mime, env) {
  try {
    // Pass 1: Vision OCR — baca teks mentah
    const ocrRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${env.GROQ_API_KEY}` },
      body: JSON.stringify({
        model: "meta-llama/llama-4-scout-17b-16e-instruct",
        temperature: 0.0,
        max_tokens: 800,
        messages: [{
          role: "user",
          content: [
            { type: "image_url", image_url: { url: `data:${mime};base64,${base64}` } },
            { type: "text", text: "Salin semua teks pada struk ini apa adanya, baris per baris. Jika tidak ada struk, balas: TIDAK_ADA_STRUK" },
          ],
        }],
      }),
    });
    if (!ocrRes.ok) return { _error: `Vision error ${ocrRes.status}` };
    const ocrText = (await ocrRes.json()).choices?.[0]?.message?.content?.trim() || "";
    if (!ocrText || ocrText === "TIDAK_ADA_STRUK") return { _error: "Tidak ada struk terdeteksi." };

    // Pass 2: Text parser — ekstrak field terstruktur
    const parsePrompt = `Kamu adalah parser struk belanja Indonesia.
Teks struk (hasil OCR):
---
${ocrText}
---

Ekstrak ke JSON murni (tanpa markdown):
{
  "store": "nama toko atau null",
  "date": "YYYY-MM-DD atau null",
  "note": "ringkasan singkat ≤60 karakter",
  "items": [{"name":"...","qty":1,"unit_price":0,"total_price":0,"category":"..."}],
  "total": angka total belanja,
  "tunai": angka uang dibayar (0 jika tidak ada),
  "change": angka kembalian (0 jika tidak ada),
  "discount": angka diskon (0 jika tidak ada),
  "confidence": "high|medium|low"
}

ATURAN: Titik DAN koma = pemisah ribuan. 19.600=19600, 35,600=35600.
Jika change=0 tapi tunai>total, hitung: change=tunai-total.
Kembalikan HANYA JSON.`;

    const { data: parseData } = await groqChat(
      [
        { role: "system", content: "Kamu adalah parser JSON. Balas HANYA dengan JSON object valid. Jangan tulis kode, penjelasan, markdown, atau teks apapun. Langsung mulai dengan karakter {." },
        { role: "user", content: parsePrompt }
      ],
      env, { maxTokens: 700, jsonMode: true }
    );
    const raw      = parseData.choices?.[0]?.message?.content || "";
    const parsed = extractJSON(raw);
    if (!parsed.total) return { _error: "Total tidak terdeteksi." };

    const extractNum = (s) => {
      if (!s && s !== 0) return 0;
      const m = String(s).match(/[\d][\d.,]*/g);
      if (!m) return 0;
      return parseInt(m[m.length - 1].replace(/[.,]/g, ""), 10) || 0;
    };

    const total    = extractNum(parsed.total);
    const tunai    = extractNum(parsed.tunai);
    const discount = extractNum(parsed.discount);
    let   change   = extractNum(parsed.change);
    if (change === 0 && tunai > total) change = tunai - total;

    return {
      store:      parsed.store || null,
      date:       parsed.date  || null,
      note:       parsed.note  || `Belanja di ${parsed.store || "toko"}`,
      items:      Array.isArray(parsed.items) ? parsed.items : [],
      total, discount, change, tunai,
      confidence: parsed.confidence || "medium",
    };
  } catch (e) { return { _error: e.message }; }
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

  const q = accountName.toLowerCase().replace(/^bank\s+/, "");

  // Alias → slug canonical: normalisasi nama panjang ke keyword pendek
  const ALIASES = {
    "central asia": "bca", "rakyat indonesia": "bri", "tabungan negara": "btn",
    "negara indonesia": "bni", "cimb niaga": "cimb", "ocbc nisp": "ocbc",
    "permata": "permata", "danamon": "danamon", "mandiri": "mandiri",
    "commonwealth": "commonwealth", "allo": "allobank",
  };
  let keyword = q;
  for (const [k, v] of Object.entries(ALIASES)) {
    if (q.includes(k)) { keyword = v; break; }
  }

  // 1. Exact match (setelah normalisasi)
  const exact = accs.find(a => a.name.toLowerCase().replace(/^bank\s+/, "") === keyword);
  if (exact) return exact;

  // 2. Keyword ada di dalam nama rekening user (paling umum)
  const forward = accs.find(a => a.name.toLowerCase().includes(keyword));
  if (forward) return forward;

  // 3. Nama rekening user ada di dalam keyword (fallback)
  const reverse = accs.find(a => keyword.includes(a.name.toLowerCase().replace(/^bank\s+/, "")));
  if (reverse) return reverse;

  return null;
}

function resolveCategory(categoryName, note, store, type, cats) {
  // 1. Dari nama kategori yang dideteksi AI
  if (categoryName) {
    const found = cats.find(c => c.name.toLowerCase() === categoryName.toLowerCase());
    if (found) return found;
  }
  // 2. Keyword matching dari note + store
  const t = `${note || ""} ${store || ""}`.toLowerCase();
  const EXPENSE_MAP = [
    { kw: ["makan","minum","nasi","bakso","soto","mie","ayam","ikan","sayur","kopi","teh","jus","es","cafe","resto","warung","warteg","rumah makan","pizza","burger","sushi","indomie","gorengan","jajan","snack","cemilan","boba","minuman","makanan","pecel","gado","sate","rendang","padang","seafood","geprek","seblak","batagor","siomay","baso"], cat: "Makanan & Minuman" },
    { kw: ["bensin","bbm","pertamax","pertalite","solar","spbu","parkir","tol","ojek","gojek","grab","maxim","ojol","taxi","taksi","bis","bus","kereta","krl","mrt","lrt","angkot"], cat: "Transportasi" },
    { kw: ["shopee","tokopedia","lazada","blibli","tiktok shop","indomaret","alfamart","supermarket","minimarket","mall","pakaian","baju","sepatu","tas","celana","kaos","jaket","helm","aksesori","kosmetik","skincare","sabun","sampo","deterjen","elektronik","gadget"], cat: "Belanja" },
    { kw: ["dokter","obat","apotek","rumah sakit","klinik","puskesmas","vitamin","suplemen","periksa","cek kesehatan","laboratorium","bpjs kesehatan"], cat: "Kesehatan" },
    { kw: ["netflix","spotify","youtube","prime","disney","vidio","game","steam","bioskop","nonton","film","konser","wisata","liburan","hotel","villa","tiket","wahana","karaoke"], cat: "Hiburan" },
    { kw: ["listrik","pln","token listrik","air pdam","internet","wifi","indihome","firstmedia","biznet","pulsa","paket data","telkomsel","xl","indosat","tri","axis","tagihan","iuran","cicilan","kredit","kpr","bpjs"], cat: "Tagihan" },
    { kw: ["kursus","buku","sekolah","kuliah","les","spp","kampus","universitas","seminar","workshop","pelatihan","training","ujian","sertifikasi"], cat: "Pendidikan" },
  ];
  const INCOME_MAP = [
    { kw: ["gaji","salary","upah","honor","thr","bonus","komisi"], cat: "Gaji" },
    { kw: ["dividen","return","profit","bunga","deposito","investasi","saham","reksa dana"], cat: "Investasi" },
  ];
  const MAP = type === "income" ? INCOME_MAP : EXPENSE_MAP;
  for (const { kw, cat } of MAP) {
    if (kw.some(k => t.includes(k))) {
      const found = cats.find(c => c.name === cat);
      if (found) return found;
    }
  }
  return cats.find(c => c.name === "Lainnya") || cats[0] || null;
}

function likelyTx(text) {
  const t = text.toLowerCase().trim();
  if (t.split(/\s+/).length < 2) return false;
  const SKIP = /^(oke|ok|iya|ya|yep|sip|siap|noted|makasih|thanks|thx|halo|hai|hi|hello|test|coba|ping|bagus|mantap|keren|wkwk|haha|lol)$/;
  if (SKIP.test(t)) return false;
  if (/\d/.test(t)) return true;
  const KW = [
    "beli","bayar","transfer","kirim","topup","gaji","dapat","terima",
    "masuk","keluar","jajan","order","pesan","nabung","tagihan","pulsa","bensin","makan","belanja",
    "ngirim","ngisi","isi","checkout","bayarin","traktir","nraktir",
    "patungan","split","dapet","dikirimin","bayaran","pindah",
    "indomaret","alfamart","grab","gojek","shopee","tokopedia","lazada",
  ];
  return KW.some(k => t.includes(k));
}

// ─────────────────────────────────────────────────────
// DATABASE — ACCOUNTS
// ─────────────────────────────────────────────────────
async function dbAccounts(userId, env) {
  return (await env.DB.prepare(`SELECT * FROM accounts WHERE user_id = ? ORDER BY created_at ASC`).bind(userId).all()).results;
}
async function getAccounts(uid, env) { return jsonRes(await dbAccounts(uid, env)); }
async function createAccount(uid, body, env) {
  const { name, balance = 0, color = null } = body;
  if (!name?.trim()) return jsonRes({ error: "name diperlukan" }, 400);
  const id = randomId();
  await env.DB.prepare(`INSERT INTO accounts (id, user_id, name, balance, color) VALUES (?, ?, ?, ?, ?)`)
    .bind(id, uid, name.trim(), Number(balance), color).run();
  return jsonRes(await env.DB.prepare(`SELECT * FROM accounts WHERE id = ?`).bind(id).first(), 201);
}
async function updateAccount(uid, id, body, env) {
  const acc = await env.DB.prepare(`SELECT * FROM accounts WHERE id = ? AND user_id = ?`).bind(id, uid).first();
  if (!acc) return jsonRes({ error: "Rekening tidak ditemukan" }, 404);
  const f = [], v = [];
  if (body.name    != null) { f.push("name = ?");    v.push(body.name); }
  if (body.balance != null) { f.push("balance = ?"); v.push(Number(body.balance)); }
  if (body.color   != null) { f.push("color = ?");   v.push(body.color); }
  if (f.length) { v.push(id); await env.DB.prepare(`UPDATE accounts SET ${f.join(", ")} WHERE id = ?`).bind(...v).run(); }
  return jsonRes(await env.DB.prepare(`SELECT * FROM accounts WHERE id = ?`).bind(id).first());
}
async function deleteAccount(uid, id, env) {
  const acc = await env.DB.prepare(`SELECT * FROM accounts WHERE id = ? AND user_id = ?`).bind(id, uid).first();
  if (!acc) return jsonRes({ error: "Rekening tidak ditemukan" }, 404);
  await env.DB.prepare(`DELETE FROM accounts WHERE id = ?`).bind(id).run();
  return jsonRes({ deleted: id });
}

// ─────────────────────────────────────────────────────
// DATABASE — CATEGORIES
// ─────────────────────────────────────────────────────
async function dbCategories(userId, env) {
  let r = await env.DB.prepare(`SELECT * FROM categories WHERE user_id = ? ORDER BY created_at ASC`).bind(userId).all();
  if (!r.results.length) { await seedCategories(userId, env); r = await env.DB.prepare(`SELECT * FROM categories WHERE user_id = ? ORDER BY created_at ASC`).bind(userId).all(); }
  return r.results;
}
async function seedCategories(userId, env) {
  for (const c of DEFAULT_CATEGORIES) {
    await env.DB.prepare(`INSERT OR IGNORE INTO categories (id, user_id, name, emoji, type) VALUES (?, ?, ?, ?, ?)`)
      .bind(randomId(), userId, c.name, c.emoji, c.type).run();
  }
}
async function getCategories(uid, env) { return jsonRes(await dbCategories(uid, env)); }
async function createCategory(uid, body, env) {
  const { name, emoji = "📌", type = "both" } = body;
  if (!name?.trim()) return jsonRes({ error: "name diperlukan" }, 400);
  const id = randomId();
  await env.DB.prepare(`INSERT INTO categories (id, user_id, name, emoji, type) VALUES (?, ?, ?, ?, ?)`)
    .bind(id, uid, name.trim(), emoji, type).run();
  return jsonRes(await env.DB.prepare(`SELECT * FROM categories WHERE id = ?`).bind(id).first(), 201);
}
async function deleteCategory(uid, id, env) {
  const cat = await env.DB.prepare(`SELECT * FROM categories WHERE id = ? AND user_id = ?`).bind(id, uid).first();
  if (!cat) return jsonRes({ error: "Kategori tidak ditemukan" }, 404);
  await env.DB.prepare(`DELETE FROM categories WHERE id = ?`).bind(id).run();
  return jsonRes({ deleted: id });
}

// ─────────────────────────────────────────────────────
// DATABASE — TRANSACTIONS
// ─────────────────────────────────────────────────────
async function getTransactions(uid, url, env) {
  const month  = url.searchParams.get("month");
  const limit  = Math.min(parseInt(url.searchParams.get("limit") || "200"), 500);
  const offset = parseInt(url.searchParams.get("offset") || "0");
  let q = `SELECT t.*, a.name AS account_name, a.color AS account_color,
           c.name AS category_name, c.emoji AS category_emoji
           FROM transactions t
           LEFT JOIN accounts a ON t.account_id = a.id
           LEFT JOIN categories c ON t.category_id = c.id
           WHERE t.user_id = ?`;
  const p = [uid];
  if (month) { q += ` AND t.date LIKE ?`; p.push(`${month}%`); }
  q += ` ORDER BY t.date DESC, t.created_at DESC LIMIT ? OFFSET ?`;
  p.push(limit, offset);
  return jsonRes((await env.DB.prepare(q).bind(...p).all()).results);
}
async function createTransaction(uid, body, env) {
  const { type, amount, date, account_id, category_id, note = "", store = null, source = "website" } = body;
  if (!type || !amount || !date || !account_id || !category_id)
    return jsonRes({ error: "type, amount, date, account_id, category_id diperlukan" }, 400);
  const acc = await env.DB.prepare(`SELECT id, balance FROM accounts WHERE id = ? AND user_id = ?`).bind(account_id, uid).first();
  if (!acc) return jsonRes({ error: "Rekening tidak valid" }, 400);
  if (type === 'expense' && Number(amount) > acc.balance) return jsonRes({ error: "Saldo rekening tidak mencukupi" }, 400);
  const cat = await env.DB.prepare(`SELECT id FROM categories WHERE id = ? AND user_id = ?`).bind(category_id, uid).first();
  if (!cat) return jsonRes({ error: "Kategori tidak valid" }, 400);
  const id = randomId();
  await env.DB.prepare(`INSERT INTO transactions (id, user_id, date, type, amount, note, store, account_id, category_id, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(id, uid, date, type, Number(amount), note, store, account_id, category_id, source).run();
  await adjustBalance(account_id, type, Number(amount), +1, env);
  return jsonRes(await getTxFull(id, env), 201);
}
async function updateTransaction(uid, id, body, env) {
  const tx = await env.DB.prepare(`SELECT * FROM transactions WHERE id = ? AND user_id = ?`).bind(id, uid).first();
  if (!tx) return jsonRes({ error: "Transaksi tidak ditemukan" }, 404);
  const newType = body.type || tx.type;
  const newAmt = body.amount !== undefined ? Number(body.amount) : tx.amount;
  const newAccId = body.account_id || tx.account_id;
  if (newType === 'expense') {
    const acc = await env.DB.prepare(`SELECT balance FROM accounts WHERE id = ? AND user_id = ?`).bind(newAccId, uid).first();
    if (acc) {
      let currentBal = acc.balance;
      if (tx.account_id === newAccId) currentBal += (tx.type === 'expense' ? tx.amount : -tx.amount);
      if (newAmt > currentBal) return jsonRes({ error: "Saldo rekening tidak mencukupi untuk update ini" }, 400);
    }
  }

  await adjustBalance(tx.account_id, tx.type, tx.amount, -1, env);
  const VALID = { type:1, amount:1, date:1, account_id:1, category_id:1, note:1, store:1 };
  const f = [], v = [];
  for (const [k, val] of Object.entries(body)) { if (VALID[k]) { f.push(`${k} = ?`); v.push(val); } }
  if (f.length) { v.push(id); await env.DB.prepare(`UPDATE transactions SET ${f.join(", ")} WHERE id = ?`).bind(...v).run(); }
  const updated = await env.DB.prepare(`SELECT * FROM transactions WHERE id = ?`).bind(id).first();
  await adjustBalance(updated.account_id, updated.type, updated.amount, +1, env);
  return jsonRes(await getTxFull(id, env));
}
async function deleteTransaction(uid, id, env) {
  const tx = await env.DB.prepare(`SELECT * FROM transactions WHERE id = ? AND user_id = ?`).bind(id, uid).first();
  if (!tx) return jsonRes({ error: "Transaksi tidak ditemukan" }, 404);
  await adjustBalance(tx.account_id, tx.type, tx.amount, -1, env);
  await env.DB.prepare(`DELETE FROM transactions WHERE id = ?`).bind(id).run();
  return jsonRes({ deleted: id });
}
async function getTxFull(id, env) {
  return await env.DB.prepare(`
    SELECT t.*, a.name AS account_name, a.color AS account_color,
           c.name AS category_name, c.emoji AS category_emoji
    FROM transactions t
    LEFT JOIN accounts a ON t.account_id = a.id
    LEFT JOIN categories c ON t.category_id = c.id
    WHERE t.id = ?
  `).bind(id).first();
}

// ─────────────────────────────────────────────────────
// DATABASE — BUDGETS
// ─────────────────────────────────────────────────────
async function getBudgets(uid, env) {
  return jsonRes((await env.DB.prepare(`SELECT * FROM budgets WHERE user_id = ? ORDER BY created_at ASC`).bind(uid).all()).results);
}
async function createBudget(uid, body, env) {
  const { category_id, limit_amount, month } = body;
  if (!category_id || !limit_amount) return jsonRes({ error: "category_id dan limit_amount diperlukan" }, 400);
  const existing = await env.DB.prepare(`SELECT id FROM budgets WHERE user_id = ? AND category_id = ? AND month = ?`).bind(uid, category_id, month).first();
  if (existing) return jsonRes({ error: "Anggaran sudah ada untuk bulan ini" }, 409);
  const id = randomId();
  await env.DB.prepare(`INSERT INTO budgets (id, user_id, category_id, limit_amount, month) VALUES (?, ?, ?, ?, ?)`)
    .bind(id, uid, category_id, Number(limit_amount), month).run();
  return jsonRes(await env.DB.prepare(`SELECT * FROM budgets WHERE id = ?`).bind(id).first(), 201);
}
async function deleteBudget(uid, id, env) {
  const b = await env.DB.prepare(`SELECT * FROM budgets WHERE id = ? AND user_id = ?`).bind(id, uid).first();
  if (!b) return jsonRes({ error: "Anggaran tidak ditemukan" }, 404);
  await env.DB.prepare(`DELETE FROM budgets WHERE id = ?`).bind(id).run();
  return jsonRes({ deleted: id });
}

// ─────────────────────────────────────────────────────
// DATABASE — GOALS
// ─────────────────────────────────────────────────────
async function getGoals(uid, env) {
  return jsonRes((await env.DB.prepare(`SELECT * FROM goals WHERE user_id = ? ORDER BY created_at ASC`).bind(uid).all()).results);
}
async function createGoal(uid, body, env) {
  const { name, target, current = 0, deadline = null, icon = "target" } = body;
  if (!name?.trim() || !target) return jsonRes({ error: "name dan target diperlukan" }, 400);
  const id = randomId();
  await env.DB.prepare(`INSERT INTO goals (id, user_id, name, target, current, deadline, icon) VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .bind(id, uid, name.trim(), Number(target), Number(current), deadline, icon).run();
  return jsonRes(await env.DB.prepare(`SELECT * FROM goals WHERE id = ?`).bind(id).first(), 201);
}
async function updateGoal(uid, id, body, env) {
  const g = await env.DB.prepare(`SELECT * FROM goals WHERE id = ? AND user_id = ?`).bind(id, uid).first();
  if (!g) return jsonRes({ error: "Target tidak ditemukan" }, 404);
  const VALID = { name:1, target:1, current:1, deadline:1, icon:1 };
  const f = [], v = [];
  for (const [k, val] of Object.entries(body)) { if (VALID[k]) { f.push(`${k} = ?`); v.push(val); } }
  if (f.length) { v.push(id); await env.DB.prepare(`UPDATE goals SET ${f.join(", ")} WHERE id = ?`).bind(...v).run(); }
  return jsonRes(await env.DB.prepare(`SELECT * FROM goals WHERE id = ?`).bind(id).first());
}
async function deleteGoal(uid, id, env) {
  const g = await env.DB.prepare(`SELECT * FROM goals WHERE id = ? AND user_id = ?`).bind(id, uid).first();
  if (!g) return jsonRes({ error: "Target tidak ditemukan" }, 404);
  await env.DB.prepare(`DELETE FROM goals WHERE id = ?`).bind(id).run();
  return jsonRes({ deleted: id });
}

// ─────────────────────────────────────────────────────
// DATABASE — BILLS
// ─────────────────────────────────────────────────────
async function getBills(uid, env) {
  await autoResetBills(uid, env);
  return jsonRes((await env.DB.prepare(
    `SELECT * FROM bills WHERE user_id = ? ORDER BY
      CASE status WHEN 'unpaid' THEN 0 ELSE 1 END,
      due_day ASC NULLS LAST, created_at ASC`
  ).bind(uid).all()).results);
}
async function createBill(uid, body, env) {
  const { name, bill_type = "lainnya", amount = 0, due_type = "monthly", due_day = null, due_date = null, notes = null, status = "unpaid" } = body;
  if (!name?.trim()) return jsonRes({ error: "name diperlukan" }, 400);
  const id = randomId();
  await env.DB.prepare(`INSERT INTO bills (id, user_id, name, bill_type, amount, due_type, due_day, due_date, notes, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(id, uid, name.trim(), bill_type, Number(amount), due_type, due_day ? Number(due_day) : null, due_date, notes, status).run();
  return jsonRes(await env.DB.prepare(`SELECT * FROM bills WHERE id = ?`).bind(id).first(), 201);
}
async function updateBill(uid, id, body, env) {
  const bill = await env.DB.prepare(`SELECT * FROM bills WHERE id = ? AND user_id = ?`).bind(id, uid).first();
  if (!bill) return jsonRes({ error: "Tagihan tidak ditemukan" }, 404);
  const VALID = { name:1, bill_type:1, amount:1, due_type:1, due_day:1, due_date:1, notes:1, status:1, paid_date:1 };
  const f = [], v = [];
  for (const [k, val] of Object.entries(body)) { if (VALID[k]) { f.push(`${k} = ?`); v.push(val); } }
  if (f.length) { v.push(id); await env.DB.prepare(`UPDATE bills SET ${f.join(", ")} WHERE id = ?`).bind(...v).run(); }
  return jsonRes(await env.DB.prepare(`SELECT * FROM bills WHERE id = ?`).bind(id).first());
}
async function deleteBill(uid, id, env) {
  const bill = await env.DB.prepare(`SELECT * FROM bills WHERE id = ? AND user_id = ?`).bind(id, uid).first();
  if (!bill) return jsonRes({ error: "Tagihan tidak ditemukan" }, 404);
  await env.DB.prepare(`DELETE FROM bills WHERE id = ?`).bind(id).run();
  return jsonRes({ deleted: id });
}
async function autoResetBills(userId, env) {
  const thisMonth = new Date().toISOString().slice(0, 7);
  try {
    await env.DB.prepare(
      `UPDATE bills SET status='unpaid', paid_date=NULL WHERE user_id=? AND due_type='monthly' AND status='paid' AND (paid_date IS NULL OR paid_date NOT LIKE ?)`
    ).bind(userId, `${thisMonth}%`).run();
  } catch(e) { console.warn("[autoResetBills]", e.message); }
}

// ─────────────────────────────────────────────────────
// DATABASE — SUMMARY
// ─────────────────────────────────────────────────────
async function getSummary(uid, url, env) {
  const month = url.searchParams.get("month") || new Date().toISOString().slice(0, 7);
  const [inc, exp, accs, cats] = await Promise.all([
    env.DB.prepare(`SELECT COALESCE(SUM(amount),0) AS total, COUNT(*) AS count FROM transactions WHERE user_id=? AND type='income' AND date LIKE ?`).bind(uid, `${month}%`).first(),
    env.DB.prepare(`SELECT COALESCE(SUM(amount),0) AS total, COUNT(*) AS count FROM transactions WHERE user_id=? AND type='expense' AND date LIKE ?`).bind(uid, `${month}%`).first(),
    env.DB.prepare(`SELECT * FROM accounts WHERE user_id=? ORDER BY created_at ASC`).bind(uid).all(),
    env.DB.prepare(`SELECT c.name, c.emoji, COALESCE(SUM(t.amount),0) AS total FROM transactions t JOIN categories c ON t.category_id=c.id WHERE t.user_id=? AND t.type='expense' AND t.date LIKE ? GROUP BY t.category_id ORDER BY total DESC LIMIT 5`).bind(uid, `${month}%`).all(),
  ]);
  return jsonRes({
    month,
    income:         { total: inc.total,  count: inc.count  },
    expense:        { total: exp.total,  count: exp.count  },
    net:            inc.total - exp.total,
    accounts:       accs.results,
    top_categories: cats.results,
  });
}

// ─────────────────────────────────────────────────────
// DATABASE SETUP — GET /setup
// ─────────────────────────────────────────────────────
async function setupDatabase(env) {
  const stmts = [
    `CREATE TABLE IF NOT EXISTS accounts (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, name TEXT NOT NULL, balance REAL NOT NULL DEFAULT 0, color TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`,
    `CREATE TABLE IF NOT EXISTS categories (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, name TEXT NOT NULL, emoji TEXT DEFAULT '📌', type TEXT DEFAULT 'both', created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`,
    `CREATE TABLE IF NOT EXISTS transactions (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, date TEXT NOT NULL, type TEXT NOT NULL, amount REAL NOT NULL, note TEXT, store TEXT, account_id TEXT, category_id TEXT, raw_text TEXT, source TEXT DEFAULT 'telegram', created_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (account_id) REFERENCES accounts(id), FOREIGN KEY (category_id) REFERENCES categories(id))`,
    `CREATE TABLE IF NOT EXISTS budgets (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, category_id TEXT NOT NULL, limit_amount REAL NOT NULL DEFAULT 0, month TEXT NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`,
    `CREATE TABLE IF NOT EXISTS goals (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, name TEXT NOT NULL, target REAL NOT NULL DEFAULT 0, current REAL NOT NULL DEFAULT 0, deadline TEXT, icon TEXT DEFAULT 'target', created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`,
    `CREATE TABLE IF NOT EXISTS bills (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, name TEXT NOT NULL, bill_type TEXT DEFAULT 'lainnya', amount REAL NOT NULL DEFAULT 0, due_type TEXT DEFAULT 'monthly', due_day INTEGER, due_date TEXT, notes TEXT, status TEXT DEFAULT 'unpaid', paid_date TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`,
    `CREATE INDEX IF NOT EXISTS idx_acc_user  ON accounts(user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_cat_user  ON categories(user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_tx_user   ON transactions(user_id, date)`,
    `CREATE INDEX IF NOT EXISTS idx_bud_user  ON budgets(user_id, month)`,
    `CREATE INDEX IF NOT EXISTS idx_goal_user ON goals(user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_bill_user ON bills(user_id)`,
  ];
  for (const s of stmts) await env.DB.prepare(s).run();

  const migs = [
    `ALTER TABLE transactions ADD COLUMN store TEXT`,
    `ALTER TABLE transactions ADD COLUMN source TEXT DEFAULT 'telegram'`,
    `ALTER TABLE transactions ADD COLUMN account_id TEXT`,
    `ALTER TABLE transactions ADD COLUMN category_id TEXT`,
    `ALTER TABLE transactions ADD COLUMN user_id TEXT`,
  ];
  const log = [];
  for (const m of migs) {
    try { await env.DB.prepare(m).run(); log.push(`✅ ${m.split("ADD COLUMN")[1].trim().split(" ")[0]}`); }
    catch { log.push(`— sudah ada`); }
  }

  return new Response(
    `✅ Laksa Bot v3.0 — Database siap!\n\nTabel: accounts, categories, transactions, budgets, goals, bills\nMigrasi: ${log.join(", ")}\n\nGroq chain:\n  Parse: ${PARSE_MODELS.join(" → ")}\n  Chat:  ${CHAT_MODELS.join(" → ")}\n  OCR:   llama-4-scout-17b (vision)\n\nEndpoints:\n  POST /ai-chat  POST /scan-receipt\n  CRUD /accounts /categories /transactions\n       /budgets /goals /bills\n  GET  /summary`,
    { headers: { "Content-Type": "text/plain; charset=utf-8" } }
  );
}

// ─────────────────────────────────────────────────────
// UTILITIES
// ─────────────────────────────────────────────────────
function randomId()   { return crypto.randomUUID(); }
function todayStr()   { return new Date().toISOString().split("T")[0]; }
function fmt(n)       { return new Intl.NumberFormat("id-ID").format(n || 0); }
function fmtDate(d)   {
  if (!d) return "-";
  try { const [y, m, day] = d.split("-"); return `${day}/${m}/${y}`; } catch { return d; }
}
function fmtType(t)   { return t === "income" ? "Pemasukan 💰" : "Pengeluaran 💸"; }
function chunks(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}
function formatTx(tx) {
  const noteLine = tx.store
    ? `${tx.note || "-"} · 🏪 ${tx.store}`
    : (tx.note || "-");
  return (
    `💰 *Rp${fmt(tx.amount)}*\n` +
    `📝 ${noteLine}\n` +
    `💳 ${tx.account_name || "-"}\n` +
    `🏷️ ${tx.category_emoji || ""} ${tx.category_name || "-"}\n` +
    `📅 ${fmtDate(tx.date)}`
  );
}
function bufToBase64(buffer) {
  const uint8 = new Uint8Array(buffer);
  let binary  = "";
  const chunk = 8192;
  for (let i = 0; i < uint8.length; i += chunk) {
    binary += String.fromCharCode(...uint8.subarray(i, i + chunk));
  }
  return btoa(binary);
}
async function adjustBalance(accountId, type, amount, dir, env) {
  if (!accountId) return;
  const delta = type === "income" ? dir * amount : -(dir * amount);
  await env.DB.prepare(`UPDATE accounts SET balance = balance + ? WHERE id = ?`).bind(delta, accountId).run();
}
function jsonRes(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}
function cors(res) {
  const h = new Headers(res.headers);
  h.set("Access-Control-Allow-Origin",  "*");
  h.set("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
  h.set("Access-Control-Allow-Headers", "Content-Type");
  return new Response(res.body, { status: res.status, headers: h });
}
async function tgSend(chatId, text, env, keyboard = null) {
  const body = { chat_id: chatId, text, parse_mode: "Markdown" };
  if (keyboard) body.reply_markup = { inline_keyboard: keyboard };
  const res  = await fetch(`${TG(env.TELEGRAM_TOKEN)}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!data.ok) {
    // Retry tanpa Markdown jika parsing gagal
    if (data.error_code === 400) {
      const plain = { chat_id: chatId, text: text.replace(/[*_`]/g, "") };
      if (keyboard) plain.reply_markup = { inline_keyboard: keyboard };
      await fetch(`${TG(env.TELEGRAM_TOKEN)}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(plain),
      });
    } else {
      throw new Error(`Telegram API error ${data.error_code}: ${data.description}`);
    }
  }
}

// Kirim pesan dengan ForceReply — keyboard Telegram otomatis muncul di user
// handleCorrection akan tangkap reply ini karena ID ada di teks pesan
async function tgSendForceReply(chatId, text, env) {
  await fetch(`${TG(env.TELEGRAM_TOKEN)}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "Markdown",
      reply_markup: { force_reply: true, selective: true },
    }),
  });
}
