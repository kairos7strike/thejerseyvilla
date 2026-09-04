const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { Pool } = require("@neondatabase/serverless");

const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "jerseyvilla2026";
const sessions = new Map();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// --- small query helpers, mirroring the old db.prepare().get()/.all()/.run() shape ---
async function all(sql, params = []) {
  const res = await pool.query(sql, params);
  return res.rows;
}
async function get(sql, params = []) {
  const res = await pool.query(sql, params);
  return res.rows[0];
}
async function run(sql, params = []) {
  const res = await pool.query(sql, params);
  return res;
}

let initPromise = null;
async function ensureInit() {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    await run(`
      CREATE TABLE IF NOT EXISTS products (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        slug TEXT UNIQUE,
        category TEXT,
        description TEXT,
        price INTEGER NOT NULL,
        compare_at INTEGER NOT NULL DEFAULT 0,
        sizes TEXT NOT NULL,
        image TEXT NOT NULL,
        stock INTEGER NOT NULL DEFAULT 20,
        featured INTEGER NOT NULL DEFAULT 0,
        active INTEGER NOT NULL DEFAULT 1
      );
    `);
    await run(`
      CREATE TABLE IF NOT EXISTS orders (
        id SERIAL PRIMARY KEY,
        code TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        phone TEXT NOT NULL,
        city TEXT NOT NULL,
        address TEXT NOT NULL,
        notes TEXT,
        payment TEXT NOT NULL DEFAULT 'cod',
        total INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'new',
        created_at TEXT NOT NULL
      );
    `);
    await run(`
      CREATE TABLE IF NOT EXISTS order_items (
        id SERIAL PRIMARY KEY,
        order_id INTEGER NOT NULL,
        product_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        size TEXT NOT NULL,
        qty INTEGER NOT NULL,
        price INTEGER NOT NULL
      );
    `);

    const seed = [
      ["White & Gold Home", "white-gold-home", "Current Kits", "Premium home-style kit. Name and number print available in checkout notes.", 2499, 3200, "S,M,L,XL,XXL", "images/fJiqL.jpg", 18, 1],
      ["Blaugrana Stripe", "blaugrana-stripe", "Current Kits", "Classic blue-red stripe with embroidery-style finish.", 2499, 3300, "S,M,L,XL,XXL", "images/R5GAM.jpg", 14, 1],
      ["Albiceleste Stripe", "albiceleste-stripe", "National Teams", "Light blue and white national home style.", 2399, 2999, "S,M,L,XL,XXL", "images/OjPWC.jpg", 16, 1],
      ["Canarinho Home", "canarinho-home", "National Teams", "Bright yellow with green trim.", 2399, 2999, "S,M,L,XL,XXL", "images/3BOzW.jpg", 12, 0],
      ["Vintage Collar Red", "vintage-collar-red", "Retro", "Classic collar retro cut. Limited restock.", 2699, 3499, "M,L,XL,XXL", "images/feDjL.jpg", 8, 1],
      ["Pink Dragon Drop", "pink-dragon", "Special Edition", "Limited special edition. Low stock.", 2999, 3999, "S,M,L,XL", "images/NZtY1.jpg", 6, 1],
    ];
    const { count } = await get("SELECT COUNT(*) AS count FROM products");
    if (Number(count) === 0) {
      for (const row of seed) {
        await run(
          `INSERT INTO products (name, slug, category, description, price, compare_at, sizes, image, stock, featured)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          row
        );
      }
    }
  })();
  return initPromise;
}

const MIME = { ".html":"text/html; charset=utf-8",".css":"text/css; charset=utf-8",".js":"application/javascript; charset=utf-8",".json":"application/json; charset=utf-8",".jpg":"image/jpeg",".jpeg":"image/jpeg",".png":"image/png",".webp":"image/webp",".txt":"text/plain; charset=utf-8" };
function json(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(data));
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); } catch { reject(new Error("Invalid JSON")); }
    });
    req.on("error", reject);
  });
}
function cookies(req) {
  const out = {};
  for (const part of String(req.headers.cookie || "").split(";")) {
    const [k, ...r] = part.trim().split("=");
    if (k) out[k] = decodeURIComponent(r.join("="));
  }
  return out;
}
function isAdmin(req) { const t = cookies(req).admin; return t && sessions.has(t); }
function pub(row) {
  return {
    id: row.id, name: row.name, slug: row.slug, category: row.category, description: row.description,
    price: row.price, compareAt: row.compare_at || 0,
    save: row.compare_at > row.price ? row.compare_at - row.price : 0,
    sizes: String(row.sizes).split(",").map((s) => s.trim()).filter(Boolean),
    image: row.image, stock: row.stock, featured: !!row.featured,
  };
}
async function makeCode() {
  const row = await get("SELECT COALESCE(MAX(id),0)+1 AS n FROM orders");
  return "JV" + String(row.n).padStart(4, "0");
}

async function handleApi(req, res, url) {
  await ensureInit();
  const method = req.method;
  const p = url.pathname;

  if (method === "GET" && p === "/api/products") {
    const cat = url.searchParams.get("category");
    const q = (url.searchParams.get("q") || "").trim().toLowerCase();
    let rows = await all("SELECT * FROM products WHERE active = 1 ORDER BY featured DESC, id");
    if (cat) rows = rows.filter((r) => r.category === cat);
    if (q) rows = rows.filter((r) => (r.name + " " + r.category).toLowerCase().includes(q));
    const catRows = await all("SELECT DISTINCT category FROM products WHERE active = 1");
    const cats = catRows.map((r) => r.category);
    return json(res, 200, { products: rows.map(pub), categories: cats });
  }

  if (method === "GET" && p.startsWith("/api/products/")) {
    const key = decodeURIComponent(p.split("/").pop());
    const row = /^\d+$/.test(key)
      ? await get("SELECT * FROM products WHERE id = $1 AND active = 1", [Number(key)])
      : await get("SELECT * FROM products WHERE slug = $1 AND active = 1", [key]);
    if (!row) return json(res, 404, { error: "Product not found" });
    const related = await all("SELECT * FROM products WHERE active = 1 AND id != $1 ORDER BY featured DESC LIMIT 4", [row.id]);
    return json(res, 200, { product: pub(row), related: related.map(pub) });
  }

  if (method === "POST" && p === "/api/orders") {
    const body = await readBody(req).catch(() => null);
    if (!body) return json(res, 400, { error: "Invalid JSON" });
    const name = String(body.name || "").trim();
    const phone = String(body.phone || "").replace(/\s+/g, "");
    const city = String(body.city || "").trim();
    const address = String(body.address || "").trim();
    const notes = String(body.notes || "").trim();
    const payment = String(body.payment || "cod");
    const items = Array.isArray(body.items) ? body.items : [];
    if (name.length < 2) return json(res, 400, { error: "Enter your full name." });
    if (!/^[0-9+]{8,15}$/.test(phone)) return json(res, 400, { error: "Enter a valid phone number." });
    if (city.length < 2) return json(res, 400, { error: "Enter your city." });
    if (address.length < 4) return json(res, 400, { error: "Enter a delivery address." });
    if (!items.length) return json(res, 400, { error: "Cart is empty." });

    const lines = [];
    let total = 0;
    for (const item of items) {
      const product = await get("SELECT * FROM products WHERE id = $1 AND active = 1", [Number(item.productId)]);
      if (!product) return json(res, 400, { error: "A product is no longer available." });
      const sizes = String(product.sizes).split(",").map((s) => s.trim());
      const size = String(item.size || "").toUpperCase();
      if (!sizes.includes(size)) return json(res, 400, { error: `Size ${size} is not available for ${product.name}.` });
      const qty = Math.max(1, Math.min(5, Number(item.qty) || 1));
      if (product.stock < qty) return json(res, 400, { error: `${product.name} does not have enough stock.` });
      lines.push({ product, size, qty, price: product.price });
      total += product.price * qty;
    }

    const code = await makeCode();
    const created = new Date().toISOString();
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const orderRes = await client.query(
        `INSERT INTO orders (code, name, phone, city, address, notes, payment, total, status, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'new',$9) RETURNING id`,
        [code, name, phone, city, address, notes, payment, total, created]
      );
      const oid = orderRes.rows[0].id;
      for (const line of lines) {
        await client.query(
          "INSERT INTO order_items (order_id, product_id, name, size, qty, price) VALUES ($1,$2,$3,$4,$5,$6)",
          [oid, line.product.id, line.product.name, line.size, line.qty, line.price]
        );
        await client.query("UPDATE products SET stock = stock - $1 WHERE id = $2", [line.qty, line.product.id]);
      }
      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
    return json(res, 201, { ok: true, code, total });
  }

  if (method === "POST" && p === "/api/admin/login") {
    const body = await readBody(req).catch(() => ({}));
    if (String(body.password || "") !== ADMIN_PASSWORD) return json(res, 401, { error: "Wrong password." });
    const token = crypto.randomBytes(24).toString("hex");
    sessions.set(token, Date.now());
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Set-Cookie": `admin=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=86400` });
    return res.end(JSON.stringify({ ok: true }));
  }
  if (method === "POST" && p === "/api/admin/logout") {
    const token = cookies(req).admin;
    if (token) sessions.delete(token);
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Set-Cookie": "admin=; HttpOnly; Path=/; Max-Age=0" });
    return res.end(JSON.stringify({ ok: true }));
  }
  if (p.startsWith("/api/admin") && !isAdmin(req)) return json(res, 401, { error: "Admin login required." });

  if (method === "GET" && p === "/api/admin/orders") {
    const orders = await all("SELECT * FROM orders ORDER BY id DESC");
    const items = await all("SELECT * FROM order_items");
    const by = {};
    for (const it of items) (by[it.order_id] ||= []).push(it);
    return json(res, 200, { orders: orders.map((o) => ({ ...o, items: by[o.id] || [] })) });
  }

  if (method === "POST" && /^\/api\/admin\/orders\/\d+\/status$/.test(p)) {
    const id = Number(p.split("/")[4]);
    const status = String((await readBody(req).catch(() => ({}))).status || "");
    const allowed = ["new", "confirmed", "packed", "shipped", "delivered", "cancelled"];
    if (!allowed.includes(status)) return json(res, 400, { error: "Invalid status." });
    const row = await get("SELECT * FROM orders WHERE id = $1", [id]);
    if (!row) return json(res, 404, { error: "Order not found." });
    if (status === "cancelled" && row.status !== "cancelled") {
      const its = await all("SELECT product_id, qty FROM order_items WHERE order_id = $1", [id]);
      for (const it of its) {
        await run("UPDATE products SET stock = stock + $1 WHERE id = $2", [it.qty, it.product_id]);
      }
    }
    await run("UPDATE orders SET status = $1 WHERE id = $2", [status, id]);
    return json(res, 200, { ok: true });
  }

  if (method === "GET" && p === "/api/admin/products") {
    return json(res, 200, { products: await all("SELECT * FROM products ORDER BY id") });
  }

  if (method === "POST" && p === "/api/admin/products") {
    const b = await readBody(req).catch(() => ({}));
    const name = String(b.name || "").trim();
    if (name.length < 2) return json(res, 400, { error: "Product name required." });
    const slug = String(b.slug || name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    await run(
      `INSERT INTO products (name, slug, category, description, price, compare_at, sizes, image, stock, featured, active)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,1)`,
      [name, slug, String(b.category || "Current Kits"), String(b.description || ""),
       Number(b.price) || 0, Number(b.compare_at) || 0, String(b.sizes || "S,M,L,XL"),
       String(b.image || "images/fJiqL.jpg"), Number(b.stock) || 0, b.featured ? 1 : 0]
    );
    return json(res, 201, { ok: true });
  }

  if (method === "POST" && /^\/api\/admin\/products\/\d+$/.test(p)) {
    const id = Number(p.split("/").pop());
    const b = await readBody(req).catch(() => ({}));
    const cur = await get("SELECT * FROM products WHERE id = $1", [id]);
    if (!cur) return json(res, 404, { error: "Not found" });
    await run(
      `UPDATE products SET name=$1, category=$2, description=$3, price=$4, compare_at=$5, sizes=$6, image=$7, stock=$8, featured=$9, active=$10 WHERE id=$11`,
      [
        String(b.name || cur.name), String(b.category || cur.category), String(b.description ?? cur.description),
        Number.isFinite(Number(b.price)) ? Number(b.price) : cur.price,
        Number.isFinite(Number(b.compare_at)) ? Number(b.compare_at) : cur.compare_at,
        String(b.sizes || cur.sizes), String(b.image || cur.image),
        Number.isFinite(Number(b.stock)) ? Number(b.stock) : cur.stock,
        b.featured ? 1 : 0, b.active === 0 ? 0 : 1, id
      ]
    );
    return json(res, 200, { ok: true });
  }

  return json(res, 404, { error: "Unknown API route." });
}

function serveFile(res, full) {
  fs.readFile(full, (err, data) => {
    if (err) { res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }); return res.end("Not found"); }
    res.writeHead(200, { "Content-Type": MIME[path.extname(full)] || "application/octet-stream" });
    res.end(data);
  });
}

async function requestHandler(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  try {
    if (url.pathname.startsWith("/api/")) return await handleApi(req, res, url);
    let filePath = url.pathname;
    if (filePath === "/") filePath = "/index.html";
    else if (filePath === "/admin" || filePath === "/admin/") filePath = "/admin.html";
    else if (filePath === "/checkout" || filePath === "/checkout/") filePath = "/checkout.html";
    else if (filePath.startsWith("/product/")) filePath = "/product.html";
    const safe = path.normalize(filePath).replace(/^(\.\.[/\\])+/, "");
    const full = path.join(ROOT, safe);
    if (!full.startsWith(ROOT)) { res.writeHead(403); return res.end("Forbidden"); }
    return serveFile(res, full);
  } catch (err) {
    console.error(err);
    if (!res.headersSent) json(res, 500, { error: "Server error." });
  }
}

// Local dev: start a real listener.
if (require.main === module) {
  http.createServer(requestHandler).listen(PORT, () => {
    console.log("The Jersey Villa running at http://localhost:" + PORT);
    console.log("Admin panel: http://localhost:" + PORT + "/admin");
  });
}

// Vercel: export the request handler so it runs as a serverless function.
module.exports = requestHandler;
