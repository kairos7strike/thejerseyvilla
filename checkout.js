function drawSummary() {
  const cart = getCart();
  const box = document.getElementById("summary");
  if (!cart.length) {
    box.innerHTML = "<h2>Order summary</h2><p class='muted'>Cart is empty. <a href='/'>Go to shop</a></p>";
    return;
  }
  box.innerHTML = "<h2>Order summary</h2>" +
    cart.map(function (i) {
      return "<p>" + i.name + " / " + i.size + " x " + i.qty + " — <b>" + rupees(i.price * i.qty) + "</b></p>";
    }).join("") +
    '<hr class="hr"><p class="summary-line"><span>Total</span><b>' + rupees(totalCart()) + "</b></p>";
}
async function placeOrder() {
  const cart = getCart();
  if (!cart.length) { document.getElementById("err").textContent = "Cart is empty."; return; }
  const res = await fetch("/api/orders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: document.getElementById("name").value,
      phone: document.getElementById("phone").value,
      city: document.getElementById("city").value,
      address: document.getElementById("address").value,
      notes: document.getElementById("notes").value,
      payment: document.getElementById("payment").value,
      items: cart.map(function (i) { return { productId: i.productId, size: i.size, qty: i.qty }; })
    })
  });
  const data = await res.json();
  if (!res.ok) { document.getElementById("err").textContent = data.error || "Could not place order."; return; }
  localStorage.removeItem("jv-cart");
  document.querySelector(".checkout").innerHTML =
    '<div class="ok"><h2>Order placed</h2><p>Your order code is <b>' + data.code + "</b>.</p><p>Total " + rupees(data.total) + '. Keep this code.</p><p><a href="/">Back to shop</a></p></div>';
}
document.getElementById("placeBtn").onclick = placeOrder;
drawSummary();
