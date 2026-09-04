const slug = location.pathname.split("/").pop();
async function loadProduct() {
  const res = await fetch("/api/products/" + slug);
  if (!res.ok) {
    document.getElementById("pdp").innerHTML = "<p>Product not found. <a href='/'>Back to shop</a></p>";
    return;
  }
  const data = await res.json();
  const p = data.product;
  const sold = p.stock < 1;
  document.title = p.name + " | The Jersey Villa";
  document.getElementById("pdp").innerHTML =
    '<img src="/' + p.image + '" alt="' + p.name + '">' +
    "<div>" +
      '<div class="muted">' + p.category + "</div>" +
      '<h1 class="pdp-title">' + p.name + "</h1>" +
      '<div class="prices pdp-prices">' +
        '<span class="now">' + rupees(p.price) + "</span>" +
        (p.compareAt ? '<span class="was">' + rupees(p.compareAt) + "</span>" : "") +
        (p.save ? '<span class="save">Save ' + rupees(p.save) + "</span>" : "") +
      "</div>" +
      '<p class="pdp-desc">' + p.description + "</p>" +
      '<p class="muted">' + p.stock + " left · Exchange only</p>" +
      "<label>Choose size</label>" +
      '<select id="size">' + p.sizes.map(function (s) { return "<option>" + s + "</option>"; }).join("") + "</select>" +
      "<label>Quantity</label>" +
      '<select id="qty"><option>1</option><option>2</option><option>3</option><option>4</option><option>5</option></select>' +
      '<div class="mt-16"><button class="btn" id="buyBtn"' + (sold ? " disabled" : "") + ">" + (sold ? "Out of stock" : "ADD TO CART") + "</button></div>" +
    "</div>";
  window.__p = p;
  document.getElementById("related").innerHTML = (data.related || []).map(productCard).join("");
  const buyBtn = document.getElementById("buyBtn");
  if (buyBtn && !sold) buyBtn.onclick = function () {
    addToCart({
      productId: p.id, name: p.name, image: p.image, price: p.price,
      size: document.getElementById("size").value,
      qty: Number(document.getElementById("qty").value)
    });
  };
}
loadProduct();
