/**
 * CLOUDFLARE WORKER BACKEND WITH INTERACTIVE & CAPTION-BASED TELEGRAM BOT
 * 
 * Skenario Alur Kerja (Workflow) Super Cerdas & Intuitif Telegram Struk:
 * 1. Pengguna melampirkan foto struk dan menambahkan kalimat keterangan (caption), 
 *    misalnya "bayar pakai bank mandiri" atau cukup ketik "mandiri".
 * 2. Bot membaca keterangan (caption) tersebut saat gambar diunggah.
 * 3. Jika nama rekening/e-wallet pengguna COCOK dengan kata kunci di caption:
 *    - Bot otomatis menganalisis struk lewat AI Vision.
 *    - Transaksi LANGSUNG disimpan ke database D1 SQLite menggunakan rekening tercocok.
 *    - Saldo langsung dipotong dan bot mengirim notifikasi sukses instan tanpa perlu tombol pilihan lagi (Zero-Click Save!).
 * 4. Jika keterangan kosong ATAU tidak ada nama rekening yang cocok di caption:
 *    - Bot otomatis jatuh ke workflow fallback: menyimpan draf di `pending_scans` dan mengirimkan 
 *      Inline Keyboard berisi daftar rekening riil pengguna untuk dipilih secara manual sekali klik.
 */

export default {
  async fetch(request, env, ctx) {
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      const url = new URL(request.url);
      
      // 1. TELEGRAM WEBHOOK HANDLER
      if (url.pathname === "/telegram-webhook" && request.method === "POST") {
        const update = await request.json();
        await handleTelegramUpdate(update, env);
        return new Response("OK", { status: 200 });
      }

      // 2. WEB API: SCAN RECEIPT FROM WEBAPP
      if (url.pathname === "/scan-receipt" && request.method === "POST") {
        const userId = url.searchParams.get("user_id");
        if (!userId) return new Response(JSON.stringify({ error: "Missing user_id" }), { status: 400, headers: corsHeaders });
        
        const body = await request.json();
        const scanResult = await processReceiptGroq(body.image, env);
        return new Response(JSON.stringify(scanResult), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      // 3. MOCK WEB API ENDPOINTS
      const userId = url.searchParams.get("user_id");
      if (url.pathname === "/accounts" && request.method === "GET") {
        const { results } = await env.DB.prepare("SELECT * FROM accounts WHERE user_id = ? ORDER BY name ASC").bind(userId).all();
        return new Response(JSON.stringify(results), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      if (url.pathname === "/") {
        return new Response("Laksa Premium Backend API & Telegram Bot is Online! 🚀", {
          headers: { ...corsHeaders, "Content-Type": "text/plain" }
        });
      }

      return new Response(JSON.stringify({ error: "Not Found" }), { status: 404, headers: corsHeaders });

    } catch (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }
  }
};

// ── TELEGRAM HANDLERS ──
async function handleTelegramUpdate(update, env) {
  const BOT_TOKEN = env.TELEGRAM_BOT_TOKEN;
  const sendText = async (chatId, text, replyMarkup = null) => {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "Markdown",
        reply_markup: replyMarkup
      })
    });
  };

  const editMessage = async (chatId, messageId, text, replyMarkup = null) => {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/editMessageText`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        message_id: messageId,
        text,
        parse_mode: "Markdown",
        reply_markup: replyMarkup
      })
    });
  };

  // A. USER SEND PHOTO (STRUK)
  if (update.message && update.message.photo) {
    const chatId = update.message.chat.id;
    const tgId = String(chatId);
    const caption = (update.message.caption || "").trim().toLowerCase();
    
    // Cari user_id berdasarkan Telegram ID di database
    const user = await env.DB.prepare("SELECT name FROM users WHERE telegram_id = ?").bind(tgId).first();
    if (!user) {
      await sendText(chatId, "⚠️ *Telegram ID Anda belum terdaftar di aplikasi Laksa.*\nSilakan masukkan Telegram ID ini di halaman Setelan aplikasi Laksa Anda: `" + tgId + "`");
      return;
    }

    await sendText(chatId, "⏳ *Struk diterima! Sedang menganalisis detail belanjaan Anda menggunakan AI...*");

    try {
      // Ambil file foto ukuran terbesar
      const photo = update.message.photo;
      const largestPhoto = photo[photo.length - 1];
      const fileId = largestPhoto.file_id;

      // Ambil file path dari Telegram API
      const fileResp = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${fileId}`);
      const fileData = await fileResp.json();
      if (!fileData.ok) throw new Error("Gagal mengambil info file dari Telegram.");

      const filePath = fileData.result.file_path;
      const imgUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${filePath}`;

      // Unduh gambar struk dan ubah ke Base64
      const imgResp = await fetch(imgUrl);
      const imgBuffer = await imgResp.arrayBuffer();
      const base64Img = btoa(String.fromCharCode(...new Uint8Array(imgBuffer)));

      // Panggil Vision AI (Groq)
      const parsed = await processReceiptGroq(base64Img, env);

      // Cek apakah nominal struk terdeteksi (mendukung 0 rupiah)
      const hasTotal = parsed.total !== undefined && parsed.total !== null && parsed.total !== "" && !isNaN(parsed.total);
      const hasAmount = parsed.amount !== undefined && parsed.amount !== null && parsed.amount !== "" && !isNaN(parsed.amount);
      if (!hasTotal && !hasAmount) throw new Error("Gagal mendeteksi total pembayaran. Pastikan foto struk terlihat jelas.");

      const totalVal = Number(parsed.total) || Number(parsed.amount) || 0;
      const storeName = parsed.store || "Merchant";
      const dateStr = parsed.date || new Date().toISOString().slice(0, 10);
      const notes = parsed.items ? parsed.items.map(i => `${i.name} (x${i.qty || 1})`).join(", ").slice(0, 200) : "Scan Struk";

      // Ambil daftar rekening pengguna untuk pencocokan caption atau tombol pilihan
      const accounts = await env.DB.prepare("SELECT id, name, balance FROM accounts WHERE user_id = ?").bind(tgId).all();
      if (!accounts.results || accounts.results.length === 0) {
        await sendText(chatId, "⚠️ *Rekening belum diset.*\nSilakan buat minimal 1 rekening terlebih dahulu di web aplikasi Laksa Anda.");
        return;
      }

      // ── LOGIKA DETEKSI OTOMATIS VIA CAPTION (REKENING MATCHING) ──
      let matchedAcc = null;
      if (caption) {
        // Cari nama rekening yang terkandung dalam teks caption pengguna
        matchedAcc = accounts.results.find(acc => {
          const accName = acc.name.toLowerCase();
          const cleanName = accName.replace(/\bbank\b|\be-wallet\b|\bcard\b/gi, "").trim();
          return caption.includes(accName) || (cleanName.length >= 3 && caption.includes(cleanName));
        });

        // Fallback pencocokan singkatan standar jika belum cocok secara langsung
        if (!matchedAcc) {
          matchedAcc = accounts.results.find(acc => {
            const accName = acc.name.toLowerCase();
            if (accName.includes("bni") && caption.includes("bni")) return true;
            if (accName.includes("bca") && caption.includes("bca")) return true;
            if (accName.includes("mandiri") && caption.includes("mandiri")) return true;
            if (accName.includes("gopay") && caption.includes("gopay")) return true;
            if (accName.includes("ovo") && caption.includes("ovo")) return true;
            if (accName.includes("dana") && caption.includes("dana")) return true;
            if (accName.includes("jago") && caption.includes("jago")) return true;
            if (accName.includes("permata") && caption.includes("permata")) return true;
            if (accName.includes("spay") || accName.includes("shopee")) {
              if (caption.includes("spay") || caption.includes("shopee") || caption.includes("shopeepay")) return true;
            }
            return false;
          });
        }
      }

      // JIKA REKENING TERCOCOKAN DI CAPTION → LAKUKAN PENYIMPANAN OTOMATIS INSTAN (ZERO CLICK)
      if (matchedAcc) {
        const amount = totalVal;
        const newBalance = Number(matchedAcc.balance) - amount;

        // Validasi saldo rekening terkait (kecuali struk nominal Rp 0)
        if (amount > 0 && newBalance < 0) {
          await sendText(chatId, `⚠️ *Pencatatan otomatis via "${update.message.caption}" dibatalkan karena saldo ${matchedAcc.name} tidak cukup!*\nSaldo saat ini: Rp ${Number(matchedAcc.balance).toLocaleString("id-ID")}, dibutuhkan: Rp ${amount.toLocaleString("id-ID")}.\n\n_Sistem mengalihkan ke pilihan rekening manual di bawah ini:_`);
          matchedAcc = null; // Menyetel ke null agar jatuh ke workflow fallback di bawah
        } else {
          // 1. Simpan transaksi pengeluaran langsung
          await env.DB.prepare(`
            INSERT INTO transactions (id, type, amount, date, account_id, category_id, note, store, source)
            VALUES (?, 'expense', ?, ?, ?, 'c12', ?, ?, 'telegram')
          `).bind("tx_" + Math.random().toString(36).substring(2, 11), amount, dateStr, matchedAcc.id, notes, storeName).run();

          // 2. Potong saldo rekening di database
          await env.DB.prepare("UPDATE accounts SET balance = balance - ? WHERE id = ?").bind(amount, matchedAcc.id).run();

          // 3. Susun rincian sukses otomatis
          let rincianSuccess = `✅ *TRANSAKSI BERHASIL DICATAT OTOMATIS!*\n`;
          rincianSuccess += `_(Dideteksi otomatis menggunakan rekening: *${matchedAcc.name}*)_\n\n`;
          rincianSuccess += `🏪 *Merchant:* ${storeName}\n`;
          rincianSuccess += `💵 *Total Belanja:* Rp ${amount.toLocaleString("id-ID")}\n`;
          rincianSuccess += `💳 *Metode:* ${matchedAcc.name}\n`;
          rincianSuccess += `💰 *Sisa Saldo:* Rp ${newBalance.toLocaleString("id-ID")}\n`;
          rincianSuccess += `📅 *Tanggal:* ${dateStr}\n`;
          
          if (parsed.items && parsed.items.length > 0) {
            rincianSuccess += `\n📦 *Daftar Item:*\n`;
            parsed.items.forEach((it, i) => {
              rincianSuccess += `${i + 1}. _${it.name}_ (x${it.qty || 1}) - Rp ${(it.total_price || 0).toLocaleString("id-ID")}\n`;
            });
          }
          rincianSuccess += `\n_Catatan transaksi berhasil disinkronkan ke aplikasi Laksa Anda._`;
          
          await sendText(chatId, rincianSuccess);
          return; // Keluar dari fungsi, alur sukses tanpa perlu menampilkan tombol pilihan lagi!
        }
      }

      // ── WORKFLOW FALLBACK: TAMPILKAN TOMBOL PILIHAN REKENING SECARA INTERAKTIF ──
      // Buat pending scan ID kustom
      const pendingId = "pend_" + Math.random().toString(36).substring(2, 11);

      // Simpan draf ke tabel `pending_scans`
      await env.DB.prepare(`
        CREATE TABLE IF NOT EXISTS pending_scans (
          id TEXT PRIMARY KEY,
          user_id TEXT,
          store TEXT,
          amount REAL,
          date TEXT,
          note TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `).run();

      await env.DB.prepare(`
        INSERT INTO pending_scans (id, user_id, store, amount, date, note)
        VALUES (?, ?, ?, ?, ?, ?)
      `).bind(pendingId, tgId, storeName, totalVal, dateStr, notes).run();

      // Format rincian struk belanja
      let rincian = `🛒 *RINCIAN STRUK BELANJA*\n\n`;
      rincian += `🏪 *Toko:* ${storeName}\n`;
      rincian += `📅 *Tanggal:* ${dateStr}\n`;
      rincian += `💵 *Total:* Rp ${totalVal.toLocaleString("id-ID")}\n`;
      if (parsed.discount > 0) rincian += `🏷️ *Diskon:* Rp ${Number(parsed.discount).toLocaleString("id-ID")}\n`;
      
      if (parsed.items && parsed.items.length > 0) {
        rincian += `\n📦 *Daftar Item:*\n`;
        parsed.items.forEach((it, i) => {
          rincian += `${i + 1}. _${it.name}_ (x${it.qty || 1}) - Rp ${(it.total_price || 0).toLocaleString("id-ID")}\n`;
        });
      }
      rincian += `\n❓ *Apakah rincian belanjaan di atas sudah benar?*\nSilakan pilih rekening pembayaran di bawah ini untuk menyimpannya:`;

      // Buat tombol rekening dinamis
      const inlineKeyboard = accounts.results.map(acc => [
        {
          text: `💳 ${acc.name} (Saldo: Rp ${Number(acc.balance).toLocaleString("id-ID")})`,
          callback_data: `pay:${pendingId}:${acc.id}`
        }
      ]);
      // Tambahkan opsi batalkan
      inlineKeyboard.push([{ text: "❌ Batalkan Pencatatan", callback_data: `cancel:${pendingId}` }]);

      const replyMarkup = { inline_keyboard: inlineKeyboard };
      await sendText(chatId, rincian, replyMarkup);

    } catch (err) {
      await sendText(chatId, "❌ *Gagal memproses struk:* " + err.message + "\nSilakan kirim ulang foto struk yang lebih fokus.");
    }
  }

  // B. USER CLICK INLINE BUTTON (CALLBACK QUERY)
  if (update.callback_query) {
    const callbackQuery = update.callback_query;
    const chatId = callbackQuery.message.chat.id;
    const messageId = callbackQuery.message.message_id;
    const tgId = String(chatId);
    const data = callbackQuery.data;

    if (data.startsWith("pay:")) {
      const parts = data.split(":");
      const pendingId = parts[1];
      const accountId = parts[2];

      try {
        // Ambil data struk pending
        const draft = await env.DB.prepare("SELECT * FROM pending_scans WHERE id = ?").bind(pendingId).first();
        if (!draft) {
          await editMessage(chatId, messageId, "⚠️ *Data struk kedaluwarsa atau sudah pernah disimpan.*");
          return;
        }

        // Ambil info rekening untuk verifikasi saldo
        const account = await env.DB.prepare("SELECT name, balance FROM accounts WHERE id = ? AND user_id = ?").bind(accountId, tgId).first();
        if (!account) throw new Error("Rekening tidak ditemukan.");

        const amount = Number(draft.amount) || 0;
        const newBalance = Number(account.balance) - amount;

        // Validasi saldo (kecuali nominal Rp 0)
        if (amount > 0 && newBalance < 0) {
          const accounts = await env.DB.prepare("SELECT id, name, balance FROM accounts WHERE user_id = ?").bind(tgId).all();
          const inlineKeyboard = accounts.results.map(acc => [
            {
              text: `💳 ${acc.name} (Saldo: Rp ${Number(acc.balance).toLocaleString("id-ID")})`,
              callback_data: `pay:${pendingId}:${acc.id}`
            }
          ]);
          inlineKeyboard.push([{ text: "❌ Batalkan Pencatatan", callback_data: `cancel:${pendingId}` }]);
          
          await editMessage(chatId, messageId, `❌ *Saldo ${account.name} tidak mencukupi!* (Saldo saat ini: Rp ${Number(account.balance).toLocaleString("id-ID")}, dibutuhkan: Rp ${amount.toLocaleString("id-ID")}).\nSilakan pilih rekening lainnya:`, { inline_keyboard: inlineKeyboard });
          return;
        }

        // Jalankan transaksi di database SQLite D1
        await env.DB.prepare(`
          INSERT INTO transactions (id, type, amount, date, account_id, category_id, note, store, source)
          VALUES (?, 'expense', ?, ?, ?, 'c12', ?, ?, 'telegram')
        `).bind("tx_" + Math.random().toString(36).substring(2, 11), amount, draft.date, accountId, draft.note, draft.store).run();

        // Potong saldo rekening
        await env.DB.prepare("UPDATE accounts SET balance = balance - ? WHERE id = ?").bind(amount, accountId).run();

        // Hapus draf pending scan
        await env.DB.prepare("DELETE FROM pending_scans WHERE id = ?").bind(pendingId).run();

        // Kirim konfirmasi sukses
        const successMsg = `✅ *TRANSAKSI BERHASIL DICATAT!*\n\n🏪 *Merchant:* ${draft.store}\n💵 *Total Belanja:* Rp ${amount.toLocaleString("id-ID")}\n💳 *Metode:* ${account.name}\n💰 *Sisa Saldo:* Rp ${newBalance.toLocaleString("id-ID")}\n📅 *Tanggal:* ${draft.date}\n\n_Catatan transaksi berhasil disinkronkan ke aplikasi Laksa Anda._`;
        await editMessage(chatId, messageId, successMsg);

      } catch (err) {
        await sendText(chatId, "⚠️ *Gagal menyimpan transaksi:* " + err.message);
      }
    } else if (data.startsWith("cancel:")) {
      const pendingId = data.split(":")[1];
      await env.DB.prepare("DELETE FROM pending_scans WHERE id = ?").bind(pendingId).run();
      await editMessage(chatId, messageId, "❌ *Pencatatan struk dibatalkan.*");
    }
  }
}

// ── GROQ RECEIPT VISION PARSER ──
async function processReceiptGroq(base64Image, env) {
  const GROQ_KEY = env.GROQ_API_KEY;
  if (!GROQ_KEY) throw new Error("Missing GROQ_API_KEY environment variable in Cloudflare Worker.");

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${GROQ_KEY}`
    },
    body: JSON.stringify({
      model: "llama-3.2-11b-vision-preview",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Analisis struk belanja ini dan keluarkan data dalam bentuk JSON murni tanpa tambahan markdown block. Format objek JSON:
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
- JANGAN menyertakan block \`\`\`json di awal dan di akhir, langsung keluarkan objek JSON.`
            },
            {
              type: "image_url",
              image_url: {
                url: `data:image/jpeg;base64,${base64Image}`
              }
            }
          ]
        }
      ],
      temperature: 0.1,
      max_tokens: 1024
    })
  });

  if (!response.ok) {
    throw new Error("Groq API error: " + response.statusText);
  }

  const result = await response.json();
  const rawText = result.choices[0].message.content.trim();
  
  try {
    const match = rawText.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("JSON not found in LLM response");
    return JSON.parse(match[0]);
  } catch (e) {
    throw new Error("Gagal mengurai teks hasil OCR AI: " + e.message);
  }
}
