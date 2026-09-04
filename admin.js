
const rupees = n => "Rs " + Number(n).toLocaleString("en-NP");

async function login() {
  const res = await fetch("/api/admin/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: document.getElementById("password").value })
  });
  const data = await res.json();
  if (!res.ok) { document.getElementById("loginErr").textContent = data.error; return; }
  boot();
}
async function logout() { await fetch("/api/admin/logout", { method: "POST" }); location.reload(); }
function show(tab) {
  document.getElementById("ordersView").classList.toggle("hidden", tab !== "orders");
  document.getElementById("productsView").classList.toggle("hidden", tab !== "products");
}
async function boot() {
  const oRes = await fetch("/api/admin/orders");
  if (oRes.status === 401) return;
  document.getElementById("loginBox").classList.add("hidden");
  document.getElementById("app").classList.remove("hidden");
  const orders = (await oRes.json()).orders || [];
  const products = (await (await fetch("/api/admin/products")).json()).products || [];
  renderOrders(orders);
  renderProducts(products);
}
function renderOrders(list) {
  const el = document.getElementById("ordersView");
  if (!list.length) { el.innerHTML = "<h2>Orders</h2><p class='muted'>No orders yet.</p>"; return; }
  el.innerHTML = "<h2>Orders</h2>" + list.map(o =>
    '<div class="order-row"><b>' + o.code + "</b> · " + o.name + " · " + o.phone + " · " + o.city +
    '<br><span class="muted">' + o.address + " · " + (o.notes || "No notes") + " · " + o.payment + " · " + new Date(o.created_at).toLocaleString() + "</span><br>" +
    (o.items || []).map(i => i.name + " / " + i.size + " x " + i.qty).join(" · ") +
    '<div class="order-total"><b>' + rupees(o.total) + '</b> <select data-id="' + o.id + '">' +
    ["new","confirmed","packed","shipped","delivered","cancelled"].map(s =>
      "<option" + (s === o.status ? " selected" : "") + ">" + s + "</option>"
    ).join("") + "</select></div></div>"
  ).join("");
  el.querySelectorAll("select[data-id]").forEach(sel => {
    sel.onchange = () => setStatus(sel.getAttribute("data-id"), sel.value);
  });
}
async function setStatus(id, status) {
  await fetch("/api/admin/orders/" + id + "/status", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status })
  });
  boot();
}
function renderProducts(list) {
  document.getElementById("productsView").innerHTML =
    "<h2>Products</h2><table><tr><th>Name</th><th>Category</th><th>Price</th><th>Compare</th><th>Stock</th><th>Hot</th><th></th></tr>" +
    list.map(p =>
      "<tr>" +
      '<td><input id="n' + p.id + '" value="' + String(p.name).replace(/"/g, "&quot;") + '"></td>' +
      '<td><input id="c' + p.id + '" value="' + (p.category || "") + '"></td>' +
      '<td><input class="narrow" id="p' + p.id + '" type="number" value="' + p.price + '"></td>' +
      '<td><input class="narrow" id="m' + p.id + '" type="number" value="' + (p.compare_at || 0) + '"></td>' +
      '<td><input class="tiny" id="s' + p.id + '" type="number" value="' + p.stock + '"></td>' +
      '<td><input id="f' + p.id + '" type="checkbox"' + (p.featured ? " checked" : "") + "></td>" +
      '<td><button class="btn btn-auto" data-save="' + p.id + '">Save</button></td>' +
      "</tr>"
    ).join("") +
    "</table>" +
    '<h3 class="mt-16">Add product</h3>' +
    "<label>Name</label><input id='nn'>" +
    "<label>Category</label><input id='nc' value='Current Kits'>" +
    "<label>Description</label><textarea id='nd'></textarea>" +
    "<label>Price</label><input id='np' type='number' value='2499'>" +
    "<label>Compare-at price</label><input id='nm' type='number' value='3200'>" +
    "<label>Sizes (comma)</label><input id='nsz' value='S,M,L,XL,XXL'>" +
    "<label>Image path</label><input id='ni' value='images/fJiqL.jpg'>" +
    "<label>Stock</label><input id='nst' type='number' value='10'>" +
    '<button class="btn btn-auto mt-10" id="addBtn">Add product</button>';
  document.querySelectorAll("[data-save]").forEach(btn => {
    btn.onclick = () => save(btn.getAttribute("data-save"));
  });
  document.getElementById("addBtn").onclick = addP;
}
async function save(id) {
  await fetch("/api/admin/products/" + id, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: document.getElementById("n" + id).value,
      category: document.getElementById("c" + id).value,
      price: Number(document.getElementById("p" + id).value),
      compare_at: Number(document.getElementById("m" + id).value),
      stock: Number(document.getElementById("s" + id).value),
      featured: document.getElementById("f" + id).checked,
      active: 1
    })
  });
  boot();
}
async function addP() {
  await fetch("/api/admin/products", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: document.getElementById("nn").value,
      category: document.getElementById("nc").value,
      description: document.getElementById("nd").value,
      price: Number(document.getElementById("np").value),
      compare_at: Number(document.getElementById("nm").value),
      sizes: document.getElementById("nsz").value,
      image: document.getElementById("ni").value,
      stock: Number(document.getElementById("nst").value),
      featured: true
    })
  });
  boot();
}
document.getElementById("loginBtn").onclick = login;
document.getElementById("tabOrders").onclick = () => show("orders");
document.getElementById("tabProducts").onclick = () => show("products");
document.getElementById("logoutBtn").onclick = logout;
boot();
