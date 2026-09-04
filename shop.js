
const rupees = (n) => "Rs " + Number(n).toLocaleString("en-NP");
const cartKey = "jv-cart";
const getCart = () => JSON.parse(localStorage.getItem(cartKey) || "[]");
const setCart = (c) => { localStorage.setItem(cartKey, JSON.stringify(c)); updateBadge(); };
const countCart = () => getCart().reduce((s,i)=>s+i.qty,0);
const totalCart = () => getCart().reduce((s,i)=>s+i.price*i.qty,0);

function updateBadge(){
  document.querySelectorAll("[data-cart-count]").forEach(el => el.textContent = countCart());
}

function addToCart(item){
  const cart = getCart();
  const found = cart.find(i => i.productId===item.productId && i.size===item.size);
  if(found) found.qty += item.qty || 1;
  else cart.push({...item, qty: item.qty || 1});
  setCart(cart);
  openCart();
}

function changeQty(i,d){
  const cart = getCart();
  cart[i].qty += d;
  if(cart[i].qty < 1) cart.splice(i,1);
  setCart(cart);
  renderCart();
}

function productCard(p){
  const save = p.save ? `<span class="save">Save ${rupees(p.save)}</span>` : "";
  const was = p.compareAt ? `<span class="was">${rupees(p.compareAt)}</span>` : "";
  const sold = p.stock < 1;
  return `<article class="card">
    <a class="card-img" href="/product/${p.slug}"><img src="/${p.image}" alt="${p.name}"></a>
    <div class="card-body">
      <a href="/product/${p.slug}"><h3>${p.name}</h3></a>
      <div class="muted">${p.category}</div>
      <div class="prices"><span class="now">${rupees(p.price)}</span>${was}${save}</div>
      <button class="btn" ${sold?"disabled":""} onclick='quickAdd(${JSON.stringify(p).replace(/'/g,"&#39;")})'>${sold?"Out of stock":"Add To Cart"}</button>
    </div>
  </article>`;
}

function quickAdd(p){
  if(!p.sizes || !p.sizes.length) return;
  addToCart({productId:p.id,name:p.name,image:p.image,price:p.price,size:p.sizes[0],qty:1});
}

function openCart(){
  document.getElementById("overlay").classList.add("open");
  document.getElementById("drawer").classList.add("open");
  renderCart();
}
function closeCart(){
  document.getElementById("overlay").classList.remove("open");
  document.getElementById("drawer").classList.remove("open");
}
function renderCart(){
  const body = document.getElementById("cartBody");
  const foot = document.getElementById("cartFoot");
  const cart = getCart();
  if(!cart.length){
    body.innerHTML = '<p class="muted">Your cart is empty.</p>';
    foot.innerHTML = '<button class="btn" onclick="closeCart()">Continue shopping</button>';
    return;
  }
  body.innerHTML = cart.map((i,idx)=>`
    <div class="line">
      <img src="/${i.image}" alt="">
      <div>
        <b>${i.name}</b>
        <div class="muted">Size ${i.size} · ${rupees(i.price)}</div>
        <div class="qty-row">
          <button class="btn-outline btn-auto" onclick="changeQty(${idx},-1)">-</button>
          <span>${i.qty}</span>
          <button class="btn-outline btn-auto" onclick="changeQty(${idx},1)">+</button>
        </div>
      </div>
      <b>${rupees(i.price*i.qty)}</b>
    </div>`).join("");
  foot.innerHTML = `<div class="summary-line"><span>Total</span><b>${rupees(totalCart())}</b></div>
    <a class="btn" href="/checkout">Checkout</a>`;
}

async function searchGo(e){
  e.preventDefault();
  const q = document.getElementById("q").value.trim();
  location.href = q ? "/?q="+encodeURIComponent(q) : "/";
}

document.addEventListener("DOMContentLoaded", updateBadge);
