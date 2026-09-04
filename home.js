async function loadHome() {
  const params = new URLSearchParams(location.search);
  const q = params.get("q") || "";
  const cat = params.get("category") || "";
  const searchBox = document.getElementById("q");
  if (searchBox && q) searchBox.value = q;
  const query = new URLSearchParams();
  if (q) query.set("q", q);
  if (cat) query.set("category", cat);
  const res = await fetch("/api/products" + (query.toString() ? "?" + query : ""));
  const data = await res.json();
  const products = data.products || [];
  document.getElementById("cats").innerHTML =
    '<a href="/" class="' + (!cat ? "active" : "") + '">ALL</a>' +
    (data.categories || []).map(function (c) {
      return '<a class="' + (c === cat ? "active" : "") + '" href="/?category=' + encodeURIComponent(c) + '">' + c.toUpperCase() + "</a>";
    }).join("");
  const hot = products.filter(function (p) { return p.featured; });
  document.getElementById("hotGrid").innerHTML = (hot.length ? hot : products.slice(0, 4)).map(productCard).join("");
  document.getElementById("shopTitle").textContent = cat || q || "All jerseys";
  document.getElementById("allGrid").innerHTML = products.map(productCard).join("") || "<p class='muted'>No jerseys found.</p>";
}
loadHome().catch(function () {
  document.getElementById("allGrid").innerHTML = "<p class='muted'>Run node server.js and open http://localhost:3000</p>";
});
