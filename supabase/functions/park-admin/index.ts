// =====================================================================
//  Supabase Edge Function: park-admin
//  Zakládání účtů kantorů, nastavení hesla a mazání účtů.
//
//  Proč funkce a ne přímo z prohlížeče: zakládat účty umí jen Supabase
//  Admin API se service_role klíčem, a ten se nesmí dostat do prohlížeče.
//  Funkce si proto ověří, že volající je přihlášený admin, a teprve pak
//  jedná jeho jménem.
//
//  Nasazení:
//    supabase functions deploy park-admin
//  (SUPABASE_URL, SUPABASE_ANON_KEY a SUPABASE_SERVICE_ROLE_KEY
//   nastavuje Supabase automaticky, nic dalšího doplňovat nemusíte.)
//
//  Volání z aplikace:
//    sb.functions.invoke('park-admin', { body: { action:'create', ... } })
// =====================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const EMAIL_DOMAIN = "gjk.cz";
const MIN_PASSWORD = 8;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return json({ error: "Chybí přihlášení." }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // 1) kdo volá
    const asUser = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authErr } = await asUser.auth.getUser();
    if (authErr || !user) return json({ error: "Neplatné přihlášení." }, 401);

    // 2) je to admin?
    const admin = createClient(supabaseUrl, serviceKey);
    const { data: me } = await admin
      .from("park_users").select("role").eq("id", user.id).maybeSingle();
    if (me?.role !== "admin") {
      return json({ error: "Tuto akci smí provést jen správce." }, 403);
    }

    const body = await req.json();
    const action = String(body.action ?? "");

    // ---------------------------------------------------------------
    if (action === "create") {
      const email = String(body.email ?? "").trim().toLowerCase();
      const password = String(body.password ?? "");
      const full_name = String(body.full_name ?? "").trim();
      const phone = String(body.phone ?? "").trim();
      const role = body.role === "admin" ? "admin" : "teacher";
      const plates = Array.isArray(body.plates)
        ? body.plates.map((p: string) => String(p).toUpperCase().replace(/[^A-Z0-9]/g, ""))
          .filter(Boolean)
        : [];

      if (!email.endsWith("@" + EMAIL_DOMAIN)) {
        return json({ error: `Účet lze založit jen pro adresu @${EMAIL_DOMAIN}.` }, 400);
      }
      if (password.length < MIN_PASSWORD) {
        return json({ error: `Heslo musí mít alespoň ${MIN_PASSWORD} znaků.` }, 400);
      }
      if (!full_name) return json({ error: "Vyplňte jméno." }, 400);

      const { data: created, error: cErr } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,          // účet je rovnou aktivní, nic se nikam neposílá
        user_metadata: { full_name },
      });
      if (cErr) {
        const dup = /already|exists|registered/i.test(cErr.message);
        return json({ error: dup ? "Účet s touto adresou už existuje." : cErr.message }, 400);
      }

      const { error: pErr } = await admin.from("park_users").upsert({
        id: created.user.id,
        email,
        full_name,
        phone,
        plates,
        role,
        is_active: true,
        must_change_password: true,   // při prvním přihlášení si nastaví vlastní
      }, { onConflict: "id" });

      if (pErr) {
        // profil se nepovedl — účet nenecháváme viset
        await admin.auth.admin.deleteUser(created.user.id);
        return json({ error: `Profil se nepodařilo založit: ${pErr.message}` }, 500);
      }

      return json({ ok: true, id: created.user.id, email });
    }

    // ---------------------------------------------------------------
    if (action === "set_password") {
      const user_id = String(body.user_id ?? "");
      const password = String(body.password ?? "");
      if (!user_id) return json({ error: "Chybí uživatel." }, 400);
      if (password.length < MIN_PASSWORD) {
        return json({ error: `Heslo musí mít alespoň ${MIN_PASSWORD} znaků.` }, 400);
      }

      const { error } = await admin.auth.admin.updateUserById(user_id, { password });
      if (error) return json({ error: error.message }, 400);

      await admin.from("park_users")
        .update({ must_change_password: true }).eq("id", user_id);

      return json({ ok: true });
    }

    // ---------------------------------------------------------------
    if (action === "delete") {
      const user_id = String(body.user_id ?? "");
      if (!user_id) return json({ error: "Chybí uživatel." }, 400);
      if (user_id === user.id) {
        return json({ error: "Nelze smazat vlastní účet." }, 400);
      }
      // park_users i rezervace odejdou kaskádou přes cizí klíče
      const { error } = await admin.auth.admin.deleteUser(user_id);
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true });
    }

    return json({ error: "Neznámá akce." }, 400);
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
