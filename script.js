(function () {
  'use strict';

  const products = [...document.querySelectorAll('.product')].map((card, index) => {
    const title = card.querySelector('h3')?.textContent.trim() || `Produto ${index + 1}`;
    const slug = title
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

    return {
      id: card.dataset.id || slug || `produto-${index + 1}`,
      title,
      price: Number(card.dataset.price || 0),
      category: card.querySelector('.p-body > small')?.textContent.trim() || 'Utilidades',
      img: card.querySelector('.p-img img')?.getAttribute('src') || '',
      alt: card.querySelector('.p-img img')?.getAttribute('alt') || title,
      card
    };
  });

  const catalog = Object.fromEntries(products.map(product => [product.id, product]));
  let cart = [];
  try {
    const savedCart = JSON.parse(localStorage.getItem('hipposCartV4') || '[]');
    if (Array.isArray(savedCart)) {
      cart = savedCart
        .map(item => {
          const product = catalog[String(item?.id)];
          if (!product) return null;
          return {
            ...product,
            qty: Math.max(1, Number(item?.qty) || 1)
          };
        })
        .filter(item => item && item.id && item.title && Number.isFinite(item.price));
    }
  } catch {
    cart = [];
  }

  let currentProduct = null;

  const cartDrawer = document.getElementById('cartDrawer');
  const overlay = document.getElementById('overlay');
  const cartItems = document.getElementById('cartItems');
  const cartTotal = document.getElementById('cartTotal');
  const cartCount = document.querySelector('.cart b');
  const toast = document.getElementById('toast');
  const productModal = document.getElementById('productModal');
  const themeToggle = document.getElementById('themeToggle');
  const dataHora = document.getElementById('dataHora');
  const countdown = document.getElementById('countdown');
  const countHours = document.getElementById('countHours');
  const countMinutes = document.getElementById('countMinutes');
  const countSeconds = document.getElementById('countSeconds');
  const cartCouponRow = document.getElementById('cartCouponRow');
  const cartCouponLabel = document.getElementById('cartCouponLabel');
  const cartDiscount = document.getElementById('cartDiscount');
  const removeCoupon = document.getElementById('removeCoupon');
  const couponAvailability = document.getElementById('couponAvailability');
  const couponAvailabilityText = document.getElementById('couponAvailabilityText');
  const availableCouponButton = document.getElementById('availableCouponButton');
  const modalOffer = document.getElementById('modalOffer');
  const modalOldPrice = document.getElementById('modalOldPrice');
  const orderSuccess = document.getElementById('orderSuccess');
  const successDetails = document.getElementById('successDetails');
  const successContinue = document.getElementById('successContinue');

  let currentProductFeatured = false;

  let activeCoupon = JSON.parse(localStorage.getItem('hipposCouponV4') || 'null');

  function money(value) {
    return Number(value || 0).toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    });
  }

  function saveCart() {
    localStorage.setItem('hipposCartV4', JSON.stringify(cart));
  }

  function cartQuantity() {
    return cart.reduce((total, item) => total + item.qty, 0);
  }

  function updateCartCount() {
    if (cartCount) cartCount.textContent = cartQuantity();
  }

  function showToast(message) {
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => toast.classList.remove('show'), 2400);
  }

  function renderCart() {
    updateCartCount();

    if (!cart.length) {
      cartItems.innerHTML = `
        <div class="empty-cart">
          <div>🛒</div>
          <strong>Seu carrinho está vazio</strong>
          <p>Adicione produtos para começar sua compra.</p>
          <button class="continue-btn" type="button" data-close-cart>Continuar comprando</button>
        </div>`;
    } else {
      cartItems.innerHTML = cart.map(item => `
        <div class="cart-item">
          <img src="${item.img}" alt="${item.alt}" onerror="this.onerror=null;this.src='assets/logo.jpeg';">
          <div class="cart-item-info">
            <strong>${item.title}</strong>
            <span>${money(item.price)}</span>
            <div class="qty-controls">
              <button type="button" data-minus="${item.id}" aria-label="Diminuir quantidade">−</button>
              <b>${item.qty}</b>
              <button type="button" data-plus="${item.id}" aria-label="Aumentar quantidade">+</button>
              <button type="button" class="remove-item" data-remove="${item.id}">Remover</button>
            </div>
          </div>
        </div>`).join('');
    }

    const subtotal = cart.reduce((sum, item) => sum + item.price * item.qty, 0);

    if (!cart.length) {
      activeCoupon = null;
      localStorage.removeItem('hipposCouponV4');
    }

    const eligibleSubtotal = getEligibleSubtotal();
    const featuredDiscount = getFeaturedDiscount();

    // Se o valor elegível caiu abaixo do mínimo, o cupom regular é retirado.
    if (activeCoupon?.type === 'regular' && eligibleSubtotal < activeCoupon.minimum) {
      activeCoupon = null;
      localStorage.removeItem('hipposCouponV4');
    }

    const regularDiscount = getRegularCouponDiscount(eligibleSubtotal);
    const discount = featuredDiscount + regularDiscount;

    if (discount > 0) {
      cartCouponRow.hidden = false;
      if (featuredDiscount > 0 && regularDiscount > 0) {
        cartCouponLabel.textContent = 'Destaque 5% + cupom';
      } else if (featuredDiscount > 0) {
        cartCouponLabel.textContent = 'Desconto dos produtos em destaque';
      } else {
        cartCouponLabel.textContent = `Cupom ${activeCoupon.code}`;
      }
      cartDiscount.textContent = `- ${money(discount)}`;
    } else {
      cartCouponRow.hidden = true;
    }

    updateCouponAvailability(eligibleSubtotal);

    const total = Math.max(0, subtotal - discount);
    cartTotal.textContent = money(total);
    saveCart();
  }

  const featuredIds = new Set(
    [...document.querySelectorAll('.featured-card')].map(card => card.dataset.featuredId)
  );

  function isFeaturedItem(item) {
    return Boolean(item?.featured) || featuredIds.has(item?.id);
  }

  function getFeaturedDiscount() {
    return cart
      .filter(isFeaturedItem)
      .reduce((sum, item) => sum + (item.price * item.qty * 0.05), 0);
  }

  function getEligibleSubtotal() {
    return cart
      .filter(item => !isFeaturedItem(item))
      .reduce((sum, item) => sum + item.price * item.qty, 0);
  }

  function getRegularCouponDiscount(eligibleSubtotal) {
    if (!activeCoupon || activeCoupon.type !== 'regular') return 0;
    if (eligibleSubtotal < activeCoupon.minimum) return 0;
    return Math.min(activeCoupon.discount, eligibleSubtotal);
  }

  function getTotalDiscount(subtotal) {
    return getFeaturedDiscount() + getRegularCouponDiscount(getEligibleSubtotal());
  }

  function getBestAvailableCoupon(eligibleSubtotal) {
    const coupons = [...document.querySelectorAll('.coupon')].map(card => ({
      code: card.dataset.coupon,
      discount: Number(card.dataset.discount),
      minimum: Number(card.dataset.minimum)
    }));

    return coupons
      .filter(coupon => eligibleSubtotal >= coupon.minimum)
      .sort((a, b) => b.minimum - a.minimum)[0] || null;
  }

  function updateCouponAvailability(eligibleSubtotal) {
    if (!couponAvailability || !couponAvailabilityText || !availableCouponButton) return;

    const available = getBestAvailableCoupon(eligibleSubtotal);

    if (!available || activeCoupon?.type === 'regular') {
      couponAvailability.hidden = true;
      return;
    }

    couponAvailability.hidden = false;
    couponAvailabilityText.textContent =
      `Você atingiu ${money(eligibleSubtotal)} em produtos elegíveis. Use ${available.code} e ganhe ${money(available.discount)} OFF.`;
    availableCouponButton.textContent = `Usar ${available.code}`;
    availableCouponButton.onclick = () => applyCoupon(available);
  }

  function applyCoupon(coupon) {
    const eligibleSubtotal = getEligibleSubtotal();

    if (eligibleSubtotal < coupon.minimum) {
      showToast(`O cupom ${coupon.code} exige R$ ${coupon.minimum.toFixed(2).replace('.', ',')} em produtos que não estão em destaque.`);
      return;
    }

    // Apenas UM cupom regular por compra.
    activeCoupon = {
      type: 'regular',
      code: coupon.code,
      discount: coupon.discount,
      minimum: coupon.minimum
    };
    localStorage.setItem('hipposCouponV4', JSON.stringify(activeCoupon));
    renderCart();
    showToast(`Cupom ${coupon.code} aplicado somente aos produtos fora do destaque.`);
  }

  function openCart() {
    renderCart();
    cartDrawer.classList.add('open');
    overlay.classList.add('show');
    document.body.classList.add('no-scroll');
  }

  function closePanels() {
    cartDrawer.classList.remove('open');
    productModal.classList.remove('show');
    overlay.classList.remove('show');
    document.body.classList.remove('no-scroll');
  }

  function addToCart(product, quantity = 1) {
    const found = cart.find(item => item.id === product.id);
    if (found) {
      found.qty += quantity;
    } else {
      cart.push({ ...product, qty: quantity });
    }
    renderCart();
    showToast(`${product.title} foi adicionado ao carrinho.`);
  }

  function productData(card) {
    return products.find(product => product.card === card);
  }

  function openProduct(product, featured = false) {
    currentProduct = product;
    currentProductFeatured = featured;
    document.getElementById('modalImg').src = product.img;
    document.getElementById('modalImg').alt = product.alt;
    document.getElementById('modalTitle').textContent = product.title;
    document.getElementById('modalCategory').textContent = product.category;

    const priceElement = document.getElementById('modalPrice');
    const modalAdd = document.getElementById('modalAdd');

    if (featured) {
      const featuredPrice = product.price * 0.95;
      modalOldPrice.hidden = false;
      modalOldPrice.textContent = money(product.price);
      modalOffer.hidden = false;
      priceElement.textContent = money(featuredPrice);
      priceElement.classList.add('featured-price-modal');
      modalAdd.textContent = 'Comprar com 5% OFF';
    } else {
      modalOldPrice.hidden = true;
      modalOffer.hidden = true;
      priceElement.textContent = money(product.price);
      priceElement.classList.remove('featured-price-modal');
      modalAdd.textContent = 'Adicionar ao carrinho';
    }

    document.getElementById('modalQty').value = 1;
    productModal.classList.add('show');
    overlay.classList.add('show');
    document.body.classList.add('no-scroll');
  }

  // Produtos em destaque: clique abre os detalhes e oferece 5% OFF.
  document.querySelectorAll('.featured-card').forEach(card => {
    const product = catalog[card.dataset.featuredId];
    if (!product) return;

    card.addEventListener('click', event => {
      if (event.target.closest('.featured-buy')) return;
      openProduct(product, true);
    });

    card.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        openProduct(product, true);
      }
    });

    card.querySelector('.featured-buy')?.addEventListener('click', event => {
      event.stopPropagation();
      addFeaturedToCart(product);
    });
  });

  function addFeaturedToCart(product, quantity = 1) {
    // O produto em destaque recebe 5% OFF automaticamente.
    // Esse desconto não é um cupom acumulável e não altera o valor dos demais produtos.
    const found = cart.find(item => item.id === product.id);
    if (found) found.qty += quantity;
    else cart.push({ ...product, qty: quantity, featured: true });

    renderCart();
    showToast(`${product.title} adicionado com 5% OFF exclusivo.`);
    openCart();
  }

  // 1) Carrinho: adicionar produtos e atualizar quantidade.
  document.querySelector('.cart')?.addEventListener('click', event => {
    event.preventDefault();
    openCart();
  });

  document.querySelectorAll('.buy-btn').forEach(button => {
    button.addEventListener('click', event => {
      event.stopPropagation();
      addToCart(productData(button.closest('.product')));
      openCart();
    });
  });

  document.querySelectorAll('.product').forEach(card => {
    card.addEventListener('click', event => {
      if (event.target.closest('button')) return;
      openProduct(productData(card));
    });
  });

  cartItems.addEventListener('click', event => {
    const id = event.target.dataset.plus || event.target.dataset.minus || event.target.dataset.remove;
    if (!id) return;

    const item = cart.find(product => product.id === id);
    if (!item) return;

    if (event.target.dataset.plus) item.qty += 1;
    if (event.target.dataset.minus) item.qty = Math.max(1, item.qty - 1);
    if (event.target.dataset.remove) cart = cart.filter(product => product.id !== id);

    renderCart();
  });

  document.querySelectorAll('[data-close-cart]').forEach(button => button.addEventListener('click', closePanels));
  document.getElementById('closeCart')?.addEventListener('click', closePanels);
  document.getElementById('closeModal')?.addEventListener('click', closePanels);
  overlay?.addEventListener('click', closePanels);
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') closePanels();
  });

  document.getElementById('modalPlus')?.addEventListener('click', () => {
    const input = document.getElementById('modalQty');
    input.value = Number(input.value) + 1;
  });

  document.getElementById('modalMinus')?.addEventListener('click', () => {
    const input = document.getElementById('modalQty');
    input.value = Math.max(1, Number(input.value) - 1);
  });

  document.getElementById('modalAdd')?.addEventListener('click', () => {
    if (!currentProduct) return;
    const quantity = Math.max(1, Number(document.getElementById('modalQty').value) || 1);

    if (currentProductFeatured) {
      addFeaturedToCart(currentProduct, quantity);
    } else {
      addToCart(currentProduct, quantity);
      closePanels();
      openCart();
    }
  });

  // 2) Pesquisa dinâmica dos produtos.
  function filterProducts(term = '') {
    const query = term.toLowerCase().trim();
    products.forEach(product => {
      const matches = !query || product.title.toLowerCase().includes(query) || product.category.toLowerCase().includes(query);
      product.card.style.display = matches ? '' : 'none';
    });

    document.getElementById('produtos')?.scrollIntoView({ behavior: 'smooth' });

    if (query && !products.some(product => product.card.style.display !== 'none')) {
      showToast('Nenhum produto encontrado.');
    }
  }

  document.querySelector('.search')?.addEventListener('submit', event => {
    event.preventDefault();
    filterProducts(document.getElementById('busca').value);
  });

  document.getElementById('busca')?.addEventListener('input', event => {
    if (event.target.value.length >= 2 || event.target.value.length === 0) {
      filterProducts(event.target.value);
    }
  });

  // 3) Favoritos e filtros.
  document.querySelectorAll('.p-img > button').forEach(button => {
    button.addEventListener('click', event => {
      event.stopPropagation();
      button.classList.toggle('liked');
      button.textContent = button.classList.contains('liked') ? '♥' : '♡';
      showToast(button.classList.contains('liked') ? 'Produto salvo nos favoritos.' : 'Produto removido dos favoritos.');
    });
  });

  document.querySelectorAll('.filter').forEach(button => {
    button.addEventListener('click', () => {
      document.querySelectorAll('.filter').forEach(item => item.classList.remove('active'));
      button.classList.add('active');
      const filter = button.textContent.trim();
      products.forEach(product => product.card.style.display = '');

      if (filter === 'Mais vendidos') {
        products.forEach(product => {
          if (!product.card.textContent.includes('mil') && !product.card.textContent.includes('2,4')) product.card.style.display = 'none';
        });
      }

      if (filter === 'Novidades') {
        products.forEach(product => {
          if (!product.card.textContent.includes('NOVO')) product.card.style.display = 'none';
        });
      }
    });
  });

  // 4) Tema claro/escuro com localStorage.
  function updateThemeButton(isDark) {
    themeToggle.textContent = isDark ? '☀️' : '🌙';
    themeToggle.setAttribute('aria-label', isDark ? 'Ativar modo claro' : 'Ativar modo escuro');
    themeToggle.setAttribute('aria-pressed', String(isDark));
    themeToggle.title = isDark ? 'Modo claro' : 'Modo escuro';
  }

  function applyTheme(isDark) {
    document.body.classList.toggle('dark-theme', isDark);
    updateThemeButton(isDark);
    localStorage.setItem('hipposTheme', isDark ? 'dark' : 'light');
  }

  const savedTheme = localStorage.getItem('hipposTheme');
  applyTheme(savedTheme === 'dark');

  themeToggle?.addEventListener('click', () => {
    applyTheme(!document.body.classList.contains('dark-theme'));
  });

  // 5) Data e hora atualizadas automaticamente.
  function updateDateTime() {
    if (!dataHora) return;
    const now = new Date();
    dataHora.textContent = `Atualizado em ${now.toLocaleDateString('pt-BR')} às ${now.toLocaleTimeString('pt-BR')}`;
  }

  updateDateTime();
  setInterval(updateDateTime, 1000);

  // 6) Cupons funcionais.
  document.querySelectorAll('.coupon').forEach(card => {
    const button = card.querySelector('button');
    button.addEventListener('click', () => {
      if (activeCoupon?.type === 'regular' && activeCoupon.code !== card.dataset.coupon) {
        showToast(`O cupom ${activeCoupon.code} já está aplicado. Remova-o para usar outro.`);
        return;
      }

      applyCoupon({
        code: card.dataset.coupon,
        discount: Number(card.dataset.discount),
        minimum: Number(card.dataset.minimum)
      });

      document.querySelectorAll('.coupon button').forEach(item => {
        item.classList.remove('applied');
        item.textContent = 'Aplicar';
      });

      if (activeCoupon?.type === 'regular' && activeCoupon?.code === card.dataset.coupon) {
        button.classList.add('applied');
        button.textContent = 'Aplicado ✓';
      }
    });
  });

  removeCoupon?.addEventListener('click', () => {
    activeCoupon = null;
    localStorage.removeItem('hipposCouponV4');
    renderCart();
    document.querySelectorAll('.coupon button').forEach(item => {
      item.classList.remove('applied');
      item.textContent = 'Aplicar';
    });
    showToast('Cupom removido.');
  });

  document.querySelector('.newsletter form')?.addEventListener('submit', event => {
    event.preventDefault();
    showToast('Cadastro realizado com sucesso!');
    event.target.reset();
  });

  // Finalização da compra: mostra uma página de confirmação com o resumo do pedido.
  document.getElementById('checkout')?.addEventListener('click', () => {
    if (!cart.length) {
      showToast('Seu carrinho está vazio.');
      return;
    }

    const subtotal = cart.reduce((sum, item) => sum + item.price * item.qty, 0);
    const discount = getTotalDiscount(subtotal);
    const total = Math.max(0, subtotal - discount);
    const orderNumber = `HP-${Date.now().toString().slice(-8)}`;
    const itemCount = cartQuantity();

    successDetails.innerHTML = `
      <div class="success-line"><span>Pedido</span><strong>#${orderNumber}</strong></div>
      <div class="success-line"><span>Itens</span><strong>${itemCount}</strong></div>
      <div class="success-line"><span>Subtotal</span><strong>${money(subtotal)}</strong></div>
      ${discount > 0 ? `<div class="success-line"><span>Descontos aplicados</span><strong>- ${money(discount)}</strong></div>` : ''}
      <div class="success-line success-total"><span>Total</span><strong>${money(total)}</strong></div>
    `;

    document.getElementById('successMessage').textContent =
      `Seu pedido #${orderNumber} foi registrado. Esta versão acadêmica simula a confirmação da compra.`;

    closePanels();
    document.querySelector('main').hidden = true;
    document.querySelector('footer')?.setAttribute('hidden', '');
    orderSuccess.hidden = false;
    orderSuccess.scrollIntoView({ behavior: 'smooth' });

    // Guarda um resumo do último pedido e limpa o carrinho.
    localStorage.setItem('hipposLastOrder', JSON.stringify({
      orderNumber, items: cart, subtotal, discount, total,
      coupon: activeCoupon
    }));
    cart = [];
    activeCoupon = null;
    localStorage.removeItem('hipposCartV4');
    localStorage.removeItem('hipposCouponV4');
    renderCart();
  });

  successContinue?.addEventListener('click', () => {
    orderSuccess.hidden = true;
    document.querySelector('main').hidden = false;
    document.querySelector('footer')?.removeAttribute('hidden');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  // 7) Contador regressivo real das ofertas.
  function startCountdown() {
    if (!countdown) return;

    const storageKey = 'hipposFlashDeadlineV4';
    let deadline = Number(localStorage.getItem(storageKey));

    if (!deadline || deadline <= Date.now()) {
      deadline = Date.now() + ((2 * 60 * 60) + (45 * 60) + 18) * 1000;
      localStorage.setItem(storageKey, String(deadline));
    }

    function tick() {
      const remaining = Math.max(0, deadline - Date.now());
      const totalSeconds = Math.floor(remaining / 1000);
      const hours = Math.floor(totalSeconds / 3600);
      const minutes = Math.floor((totalSeconds % 3600) / 60);
      const seconds = totalSeconds % 60;

      countHours.textContent = String(hours).padStart(2, '0');
      countMinutes.textContent = String(minutes).padStart(2, '0');
      countSeconds.textContent = String(seconds).padStart(2, '0');

      if (remaining <= 0) {
        countdown.innerHTML = '<b>00</b><em>:</em><b>00</b><em>:</em><b>00</b>';
        clearInterval(countdown.timer);
      }
    }

    tick();
    countdown.timer = setInterval(tick, 1000);
  }

  startCountdown();

  renderCart();

  if (activeCoupon?.type === 'featured') {
    document.querySelectorAll('.coupon button').forEach(item => {
      item.classList.remove('applied');
      item.textContent = 'Aplicar';
    });
  }
})();
