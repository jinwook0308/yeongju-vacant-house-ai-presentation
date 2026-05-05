/**
 * guest-mypage.js
 * 영주 빈집 플랫폼 - 투숙 희망자 마이페이지
 */
const API_BASE_URL = typeof getApiBaseUrl === 'function' ? getApiBaseUrl() : 'http://localhost:8000';
let wishlistHouseSource = [];

window.addEventListener('load', function () {
  renderHeader('');
  renderFooter();

  if (!requireLogin()) return;

  setupSidebarTabs();

  try { renderBookings(); } catch (error) { console.warn('renderBookings 오류:', error); }
  loadWishlist();
  try { renderAiHistory(); } catch (error) { console.warn('renderAiHistory 오류:', error); }
  try { renderNotifications(); } catch (error) { console.warn('renderNotifications 오류:', error); }
});

window.addEventListener('yeongju:auth-changed', () => {
  if (wishlistHouseSource.length) {
    renderWishlist(wishlistHouseSource);
  }
  renderBookings();
});

window.addEventListener('yeongju:wishlist-changed', () => {
  if (wishlistHouseSource.length) {
    renderWishlist(wishlistHouseSource);
  }
});

window.addEventListener('yeongju:platform-data-changed', (event) => {
  const type = String(event.detail?.type || '');
  if (type.includes('notification')) {
    renderNotifications();
  }
  if (type.includes('booking')) {
    renderBookings();
  }
});

function setupSidebarTabs() {
  const triggers = document.querySelectorAll('[data-tab-trigger]');
  const sections = document.querySelectorAll('.mypage-section');

  const activateTab = (targetId) => {
    triggers.forEach((trigger) => {
      trigger.classList.toggle('is-active', trigger.dataset.tabTrigger === targetId);
    });

    sections.forEach((section) => {
      section.style.display = section.id === targetId ? 'block' : 'none';
    });
  };

  triggers.forEach((trigger) => {
    trigger.addEventListener('click', (event) => {
      event.preventDefault();
      const targetId = trigger.dataset.tabTrigger;
      activateTab(targetId);
      history.replaceState(null, '', `#${targetId}`);
    });
  });

  const initialTarget = window.location.hash ? window.location.hash.replace('#', '') : 'bookings';
  activateTab(document.getElementById(initialTarget) ? initialTarget : 'bookings');
}

function renderBookings() {
  const container = document.getElementById('bookingsList');
  if (!container) return;

  const bookings = getGuestBookings();
  if (bookings.length === 0) {
    container.innerHTML = '<p class="text-muted text-center">예약 요청 내역이 없습니다.</p>';
    return;
  }

  const statusMap = {
    confirmed: { label: '예약 확정', cls: 'badge--approved' },
    pending: { label: '검토 중', cls: 'badge--pending' },
    approved: { label: '승인 완료', cls: 'badge--approved' },
    rejected: { label: '거절', cls: 'badge--rejected' },
    hold: { label: '보류', cls: 'badge--pending' },
    cancel_requested: { label: '취소 요청', cls: 'badge--rejected' },
  };

  container.innerHTML = bookings.map((booking) => {
    const status = statusMap[booking.status] || { label: booking.status || '확인 필요', cls: '' };
    return `
      <div class="booking-item-card">
        <div class="booking-item-card__emoji">🏠</div>
        <div class="booking-item-card__info">
          <div class="booking-item-card__name">${booking.houseName || '예약 요청'}</div>
          <div class="booking-item-card__dates">
            📅 ${formatDateShort(booking.checkIn)} ~ ${formatDateShort(booking.checkOut)}
          </div>
          <div class="booking-item-card__meta">
            👥 ${booking.guests || booking.guestCount || 1}명 · 📍 영주시 ${booking.districtName || '-'} · 목적: ${booking.purpose || '-'}
          </div>
        </div>
        <div>
          <span class="badge ${status.cls}">${status.label}</span>
        </div>
      </div>
    `;
  }).join('');
}

function getGuestBookings() {
  const user = getCurrentUser();
  if (!user) return [];

  const allBookings = typeof getAllBookingRequests === 'function'
    ? getAllBookingRequests()
    : ((typeof BOOKING_REQUESTS !== 'undefined' && Array.isArray(BOOKING_REQUESTS)) ? BOOKING_REQUESTS : []);

  const identifiers = new Set([
    user.id,
    user.email,
  ].filter(Boolean).map((value) => String(value)));
  const fallbackName = identifiers.size === 0 ? String(user.name || '').trim() : '';

  return allBookings.filter((booking) => {
    if (identifiers.size > 0) {
      return identifiers.has(String(booking.guestUserId || '')) ||
        identifiers.has(String(booking.guestEmail || ''));
    }

    return fallbackName ? String(booking.guestName || '').trim() === fallbackName : false;
  });
}

async function loadWishlist() {
  try {
    const response = await fetch(`${API_BASE_URL}/houses`);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const houses = await response.json();
    wishlistHouseSource = Array.isArray(houses) ? houses : [];
    renderWishlist(wishlistHouseSource);
  } catch (error) {
    console.error('찜 목록 빈집 데이터를 불러오지 못했습니다:', error);
    const fallback = (typeof VACANT_HOUSE_LIST !== 'undefined') ? VACANT_HOUSE_LIST : [];
    wishlistHouseSource = fallback;
    renderWishlist(fallback);
  }
}

function renderWishlist(houses) {
  const grid = document.getElementById('wishlistGrid');
  if (!grid) return;

  const wishlist = getWishlist();
  const wishedHouses = houses.filter((house) => wishlist.includes(house.id));

  if (wishedHouses.length === 0) {
    grid.innerHTML = '<p class="text-muted">찜한 빈집이 없습니다. <a href="guest-list.html">빈집 목록</a>에서 찾아보세요.</p>';
    return;
  }

  const houseEmojis = { lodging: '🏠', longterm: '🛏️', experience: '🌿', review_needed: '📌' };

  grid.innerHTML = wishedHouses.map((house) => `
    <a href="guest-detail.html?id=${house.id}" style="text-decoration:none;color:inherit;">
      <div class="card">
        <div class="card__image-placeholder">${houseEmojis[house.operationType] || '🏠'}</div>
        <div class="card__body">
          <div style="font-size:var(--font-size-xs);color:var(--color-text-muted);margin-bottom:4px;">📍 영주시 ${house.districtName}</div>
          <h3 class="card__title">${house.name}</h3>
          <div style="margin-top:8px;">${getConditionGradeBadge(house.conditionGrade)}</div>
        </div>
      </div>
    </a>
  `).join('');
}

function renderAiHistory() {
  const container = document.getElementById('aiHistoryList');
  if (!container) return;

  const demoHistory = [
    { date: '2025-04-20', query: '풍기읍 가족 4명 2박 자연 휴양' },
    { date: '2025-04-15', query: '순흥면 문화 체험 2명 1박' },
    { date: '2025-04-10', query: '영주시 전체 장기체류 1명 조용한 곳' },
  ];

  container.innerHTML = demoHistory.map((item) => `
    <div class="ai-history-item">
      <div class="ai-history-item__date">${formatDateShort(item.date)}</div>
      <div class="ai-history-item__query">🤖 ${item.query}</div>
    </div>
  `).join('');
}

function renderNotifications() {
  const container = document.getElementById('guestNotificationsList');
  if (!container) return;

  const notifications = typeof getNotifications === 'function' ? getNotifications() : [];
  if (!notifications.length) {
    container.innerHTML = '<p class="text-muted text-center">표시할 알림이 없습니다.</p>';
    return;
  }

  container.innerHTML = notifications.map((notification) => `
    <a class="mypage-notification-item ${notification.read ? '' : 'is-unread'}" href="${notification.href || '#'}">
      <div class="mypage-notification-item__dot" aria-hidden="true"></div>
      <div class="mypage-notification-item__body">
        <strong>${notification.message}</strong>
        <span>${notification.type || '알림'}</span>
      </div>
      <small>${notification.createdAt ? new Date(notification.createdAt).toLocaleDateString('ko-KR') : ''}</small>
    </a>
  `).join('');
}
