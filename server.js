
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { DatabaseSync } = require("node:sqlite");

const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "jerseyvilla2026";
const sessions = new Map();

const db = new DatabaseSync(path.join(ROOT, "data.sqlite"));
db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY,
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
  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY,
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
  CREATE TABLE IF NOT EXISTS order_items (
    id INTEGER PRIMARY KEY,
    order_id INTEGER NOT NULL,
    product_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    size TEXT NOT NULL,
    qty INTEGER NOT NULL,
    price INTEGER NOT NULL
  );
`);
function hasColumn(table, col) {
  return db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === col);
}
if (!hasColumn("products", "compare_at")) db.exec("ALTER TABLE products ADD COLUMN compare_at INTEGER NOT NULL DEFAULT 0");
if (!hasColumn("products", "featured")) db.exec("ALTER TABLE products ADD COLUMN featured INTEGER NOT NULL DEFAULT 0");
if (!hasColumn("orders", "payment")) db.exec("ALTER TABLE orders ADD COLUMN payment TEXT NOT NULL DEFAULT 'cod'");

const seed = [
  ["White & Gold Home", "white-gold-home", "Current Kits", "Premium home-style kit. Name and number print available in checkout notes.", 2499, 3200, "S,M,L,XL,XXL", "images/fJiqL.jpg", 18, 1],
  ["Blaugrana Stripe", "blaugrana-stripe", "Current Kits", "Classic blue-red stripe with embroidery-style finish.", 2499, 3300, "S,M,L,XL,XXL", "images/R5GAM.jpg", 14, 1],
  ["Albiceleste Stripe", "albiceleste-stripe", "National Teams", "Light blue and white national home style.", 2399, 2999, "S,M,L,XL,XXL", "images/OjPWC.jpg", 16, 1],
  ["Canarinho Home", "canarinho-home", "National Teams", "Bright yellow with green trim.", 2399, 2999, "S,M,L,XL,XXL", "images/3BOzW.jpg", 12, 0],
  ["Vintage Collar Red", "vintage-collar-red", "Retro", "Classic collar retro cut. Limited restock.", 2699, 3499, "M,L,XL,XXL", "images/feDjL.jpg", 8, 1],
  ["Pink Dragon Drop", "pink-dragon", "Special Edition", "Limited special edition. Low stock.", 2999, 3999, "S,M,L,XL", "images/NZtY1.jpg", 6, 1],
];
if (db.prepare("SELECT COUNT(*) AS n FROM products").get().n === 0) {
  const ins = db.prepare(`INSERT INTO products (name, slug, category, description, price, compare_at, sizes, image, stock, featured) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  for (const row of seed) ins.run(...row);
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
function makeCode() {
  const n = db.prepare("SELECT IFNULL(MAX(id),0)+1 AS n FROM orders").get().n;
  return "JV" + String(n).padStart(4, "0");
}

async function handleApi(req, res, url) {
  const method = req.method;
  const p = url.pathname;
  if (method === "GET" && p === "/api/products") {
    const cat = url.searchParams.get("category");
    const q = (url.searchParams.get("q") || "").trim().toLowerCase();
    let rows = db.prepare("SELECT * FROM products WHERE active = 1 ORDER BY featured DESC, id").all();
    if (cat) rows = rows.filter((r) => r.category === cat);
    if (q) rows = rows.filter((r) => (r.name + " " + r.category).toLowerCase().includes(q));
    const cats = db.prepare("SELECT DISTINCT category FROM products WHERE active = 1").all().map((r) => r.category);
    return json(res, 200, { products: rows.map(pub), categories: cats });
  }
  if (method === "GET" && p.startsWith("/api/products/")) {
    const key = decodeURIComponent(p.split("/").pop());
    const row = /^\d+$/.test(key)
      ? db.prepare("SELECT * FROM products WHERE id = ? AND active = 1").get(Number(key))
      : db.prepare("SELECT * FROM products WHERE slug = ? AND active = 1").get(key);
    if (!row) return json(res, 404, { error: "Product not found" });
    const related = db.prepare("SELECT * FROM products WHERE active = 1 AND id != ? ORDER BY featured DESC LIMIT 4").all(row.id);
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
      const product = db.prepare("SELECT * FROM products WHERE id = ? AND active = 1").get(Number(item.productId));
      if (!product) return json(res, 400, { error: "A product is no longer available." });
      const sizes = String(product.sizes).split(",").map((s) => s.trim());
      const size = String(item.size || "").toUpperCase();
      if (!sizes.includes(size)) return json(res, 400, { error: `Size ${size} is not available for ${product.name}.` });
      const qty = Math.max(1, Math.min(5, Number(item.qty) || 1));
      if (product.stock < qty) return json(res, 400, { error: `${product.name} does not have enough stock.` });
      lines.push({ product, size, qty, price: product.price });
      total += product.price * qty;
    }
    const code = makeCode();
    const created = new Date().toISOString();
    db.exec("BEGIN");
    try {
      const info = db.prepare(`INSERT INTO orders (code, name, phone, city, address, notes, payment, total, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'new', ?)`).run(code, name, phone, city, address, notes, payment, total, created);
      const oid = info.lastInsertRowid;
      const addItem = db.prepare("INSERT INTO order_items (order_id, product_id, name, size, qty, price) VALUES (?, ?, ?, ?, ?, ?)");
      const dec = db.prepare("UPDATE products SET stock = stock - ? WHERE id = ?");
      for (const line of lines) {
        addItem.run(oid, line.product.id, line.product.name, line.size, line.qty, line.price);
        dec.run(line.qty, line.product.id);
      }
      db.exec("COMMIT");
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
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
    const orders = db.prepare("SELECT * FROM orders ORDER BY id DESC").all();
    const items = db.prepare("SELECT * FROM order_items").all();
    const by = {};
    for (const it of items) (by[it.order_id] ||= []).push(it);
    return json(res, 200, { orders: orders.map((o) => ({ ...o, items: by[o.id] || [] })) });
  }
  if (method === "POST" && /^\/api\/admin\/orders\/\d+\/status$/.test(p)) {
    const id = Number(p.split("/")[4]);
    const status = String((await readBody(req).catch(() => ({}))).status || "");
    const allowed = ["new", "confirmed", "packed", "shipped", "delivered", "cancelled"];
    if (!allowed.includes(status)) return json(res, 400, { error: "Invalid status." });
    const row = db.prepare("SELECT * FROM orders WHERE id = ?").get(id);
    if (!row) return json(res, 404, { error: "Order not found." });
    if (status === "cancelled" && row.status !== "cancelled") {
      for (const it of db.prepare("SELECT product_id, qty FROM order_items WHERE order_id = ?").all(id)) {
        db.prepare("UPDATE products SET stock = stock + ? WHERE id = ?").run(it.qty, it.product_id);
      }
    }
    db.prepare("UPDATE orders SET status = ? WHERE id = ?").run(status, id);
    return json(res, 200, { ok: true });
  }
  if (method === "GET" && p === "/api/admin/products") {
    return json(res, 200, { products: db.prepare("SELECT * FROM products ORDER BY id").all() });
  }
  if (method === "POST" && p === "/api/admin/products") {
    const b = await readBody(req).catch(() => ({}));
    const name = String(b.name || "").trim();
    if (name.length < 2) return json(res, 400, { error: "Product name required." });
    const slug = String(b.slug || name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    db.prepare(`INSERT INTO products (name, slug, category, description, price, compare_at, sizes, image, stock, featured, active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`).run(
      name, slug, String(b.category || "Current Kits"), String(b.description || ""),
      Number(b.price) || 0, Number(b.compare_at) || 0, String(b.sizes || "S,M,L,XL"),
      String(b.image || "images/fJiqL.jpg"), Number(b.stock) || 0, b.featured ? 1 : 0
    );
    return json(res, 201, { ok: true });
  }
  if (method === "POST" && /^\/api\/admin\/products\/\d+$/.test(p)) {
    const id = Number(p.split("/").pop());
    const b = await readBody(req).catch(() => ({}));
    const cur = db.prepare("SELECT * FROM products WHERE id = ?").get(id);
    if (!cur) return json(res, 404, { error: "Not found" });
    db.prepare(`UPDATE products SET name=?, category=?, description=?, price=?, compare_at=?, sizes=?, image=?, stock=?, featured=?, active=? WHERE id=?`).run(
      String(b.name || cur.name), String(b.category || cur.category), String(b.description ?? cur.description),
      Number.isFinite(Number(b.price)) ? Number(b.price) : cur.price,
      Number.isFinite(Number(b.compare_at)) ? Number(b.compare_at) : cur.compare_at,
      String(b.sizes || cur.sizes), String(b.image || cur.image),
      Number.isFinite(Number(b.stock)) ? Number(b.stock) : cur.stock,
      b.featured ? 1 : 0, b.active === 0 ? 0 : 1, id
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

const server = http.createServer(async (req, res) => {
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
});

server.listen(PORT, () => {
  console.log("The Jersey Villa running at http://localhost:" + PORT);
  console.log("Admin panel: http://localhost:" + PORT + "/admin");
});
