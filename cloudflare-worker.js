/**
 * CLOUDFLARE WORKER FOR LAKSA WEB APP
 * 
 * Silakan tempel (paste) kode Cloudflare Worker Anda di bawah ini.
 * 
 * Worker ini bertindak sebagai backend API yang menghubungkan web Laksa (frontend)
 * dengan database D1 (SQLite) milik Cloudflare, serta mengatur CORS headers agar
 * aplikasi dapat diakses dengan aman dari localhost maupun domain produksi.
 */

export default {
  async fetch(request, env, ctx) {
    // TENTUKAN CORS HEADERS
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*", // Memungkinkan akses dari localhost/situs Anda
      "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    };

    // Tangani Preflight Request OPTIONS (Keamanan Browser)
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: corsHeaders
      });
    }

    try {
      const url = new URL(request.url);
      const userId = url.searchParams.get("user_id");

      // Validasi Parameter user_id (Telegram ID)
      if (!userId && url.pathname !== "/") {
        return new Response(JSON.stringify({ error: "Missing user_id query parameter" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      // ── CONTOH PLACEHOLDER ROUTING DATABASE D1 ──
      
      // GET /accounts (Mengambil Daftar Rekening)
      if (url.pathname === "/accounts" && request.method === "GET") {
        // Contoh Query D1: 
        // const { results } = await env.DB.prepare("SELECT * FROM accounts WHERE user_id = ?").bind(userId).all();
        // return new Response(JSON.stringify(results), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        
        return new Response(JSON.stringify([
          { id: "mock-1", name: "Bank Contoh (Placeholder)", balance: 1000000, color: "#2563eb" }
        ]), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      // Default Response untuk Root "/"
      if (url.pathname === "/") {
        return new Response("Laksa API Backend is Online! 🚀", {
          headers: { ...corsHeaders, "Content-Type": "text/plain" }
        });
      }

      // Jalur Tidak Ditemukan
      return new Response(JSON.stringify({ error: "Not Found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });

    } catch (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }
  }
};
