import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, apikey, authorization",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...cors, "Content-Type": "application/json" }
});
const encoder = new TextEncoder();
const sessionSecret = Deno.env.get("PORTFOLIO_SESSION_SECRET") || "";

function base64url(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function decode64url(value: string) {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  return Uint8Array.from(atob(normalized + "=".repeat((4 - normalized.length % 4) % 4)), (char) => char.charCodeAt(0));
}

async function signature(payload: string) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(sessionSecret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(payload)));
}

async function createToken() {
  const payload = base64url(encoder.encode(JSON.stringify({ exp: Date.now() + 8 * 60 * 60 * 1000 })));
  return `${payload}.${base64url(await signature(payload))}`;
}

async function validToken(token: string) {
  try {
    const [payload, supplied] = token.split(".");
    if (!payload || !supplied || !sessionSecret) return false;
    const expected = await signature(payload);
    const actual = decode64url(supplied);
    if (actual.length !== expected.length) return false;
    let difference = 0;
    expected.forEach((byte, index) => { difference |= byte ^ actual[index]; });
    const data = JSON.parse(new TextDecoder().decode(decode64url(payload)));
    return difference === 0 && Number(data.exp) > Date.now();
  } catch {
    return false;
  }
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (request.method !== "POST") return json({ error: "Método no permitido." }, 405);

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Solicitud inválida." }, 400);
  }

  if (body.action === "login") {
    const username = Deno.env.get("PORTFOLIO_ADMIN_USERNAME") || "rodrigopisurno";
    const password = Deno.env.get("PORTFOLIO_ADMIN_PASSWORD");
    const accepted = typeof password === "string" &&
      body.username === username && body.password === password;
    if (!accepted) {
      await new Promise((resolve) => setTimeout(resolve, 700));
      return json({ error: "Usuario o contraseña incorrectos." }, 401);
    }
    return json({ token: await createToken() });
  }

  if (!await validToken(String(body.token || ""))) {
    return json({ error: "La sesión venció. Volvé a iniciar sesión." }, 401);
  }

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return json({ error: "Supabase no está configurado." }, 500);
  const supabase = createClient(url, serviceKey);

  if (body.action === "save") {
    if (!body.content || typeof body.content !== "object") return json({ error: "Contenido inválido." }, 400);
    if (JSON.stringify(body.content).length > 2_000_000) return json({ error: "El contenido supera el límite permitido." }, 413);
    const { error } = await supabase.from("portfolio_content").upsert({
      id: "main", content: body.content, updated_at: new Date().toISOString()
    });
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true });
  }

  if (body.action === "create_upload") {
    const mime = String(body.contentType || "");
    const extensions: Record<string, string> = {
      "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp",
      "image/gif": "gif", "image/avif": "avif"
    };
    const extension = extensions[mime];
    if (!extension) return json({ error: "Formato de imagen no permitido." }, 400);
    const path = `uploads/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.${extension}`;
    const { data, error } = await supabase.storage.from("portfolio-media").createSignedUploadUrl(path);
    if (error || !data) return json({ error: error?.message || "No se pudo preparar la carga." }, 500);
    return json({ path, uploadToken: data.token });
  }

  if (body.action === "import_image") {
    let source: URL;
    try {
      source = new URL(String(body.url || ""));
    } catch {
      return json({ error: "La URL de imagen no es válida." }, 400);
    }
    const privateHost = /^(localhost|0\.0\.0\.0|\[?::1\]?)$/i.test(source.hostname) ||
      /^(127\.|10\.|192\.168\.|169\.254\.)/.test(source.hostname) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(source.hostname);
    if (!["http:", "https:"].includes(source.protocol) || privateHost) {
      return json({ error: "La URL de imagen no está permitida." }, 400);
    }
    const response = await fetch(source, { redirect: "follow" });
    if (!response.ok) return json({ error: "No se pudo descargar la imagen externa." }, 400);
    const mime = (response.headers.get("content-type") || "").split(";")[0].toLowerCase();
    const extensions: Record<string, string> = {
      "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp",
      "image/gif": "gif", "image/avif": "avif"
    };
    const extension = extensions[mime];
    if (!extension) return json({ error: "La URL no apunta a una imagen permitida." }, 400);
    const declaredSize = Number(response.headers.get("content-length") || 0);
    if (declaredSize > 10_485_760) return json({ error: "La imagen supera los 10 MB." }, 413);
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.length > 10_485_760) return json({ error: "La imagen supera los 10 MB." }, 413);
    const path = `imports/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.${extension}`;
    const { error } = await supabase.storage.from("portfolio-media").upload(path, bytes, { contentType: mime });
    if (error) return json({ error: error.message }, 500);
    const publicUrl = supabase.storage.from("portfolio-media").getPublicUrl(path).data.publicUrl;
    return json({ path, publicUrl });
  }

  if (body.action === "delete_image") {
    const marker = "/storage/v1/object/public/portfolio-media/";
    const imageUrl = String(body.url || "");
    const markerIndex = imageUrl.indexOf(marker);
    if (markerIndex === -1) return json({ ok: true });
    const path = decodeURIComponent(imageUrl.slice(markerIndex + marker.length));
    if (!path.startsWith("uploads/") && !path.startsWith("imports/")) {
      return json({ error: "No se puede eliminar esa imagen." }, 400);
    }
    const { error } = await supabase.storage.from("portfolio-media").remove([path]);
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true });
  }

  return json({ error: "Acción desconocida." }, 400);
});
