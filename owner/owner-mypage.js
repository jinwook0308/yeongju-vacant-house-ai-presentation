window.addEventListener('load', function () {
  renderHeader('');
  renderFooter();

  if (!requireLogin()) return;
  if (typeof isOwnerUser === 'function' && !isOwnerUser()) {
    renderAccessDenied();
    return;
  }

  renderOwnerDashboard();
  bindOwnerBookingActions();

  window.addEventListener('yeongju:platform-data-changed', handleOwnerPlatformChange);
  window.addEventListener('yeongju:auth-changed', renderOwnerDashboard);
});

function handleOwnerPlatformChange(event) {
  const type = String(event.detail?.type || '');
  if (!type) return;

  if (type.includes('booking') || type.includes('notification') || type.includes('request')) {
    renderOwnerDashboard();
  }
}

function renderOwnerDashboard() {
  renderOwnerStats();
  renderRecentRequests();
  renderOwnerBookingRequests();
  renderNotifications();
}

function renderOwnerStats() {
  const grid = document.getElementById('ownerStatsGrid');
  if (!grid) return;

  const requests = getOwnerVisibleRequests();
  const bookings = typeof getOwnerVisibleBookingRequests === 'function'
    ? getOwnerVisibleBookingRequests()
    : [];

  const stats = [
    { icon: '01', value: requests.length, label: '총 신청 건수' },
    { icon: '02', value: requests.filter((request) => request.reviewStatus === 'approved').length, label: '승인 완료' },
    { icon: '03', value: bookings.filter((booking) => booking.status === 'pending').length, label: '예약 승인 대기' },
    { icon: '04', value: bookings.filter((booking) => booking.status === 'approved').length, label: '예약 승인 완료' },
  ];

  grid.innerHTML = stats.map((item) => `
    <div class="owner-stat-card">
      <div class="owner-stat-card__icon-wrap">
        <div class="owner-stat-card__icon">${item.icon}</div>
      </div>
      <div class="owner-stat-card__value">${item.value}</div>
      <div class="owner-stat-card__label">${item.label}</div>
    </div>
  `).join('');
}

function renderRecentRequests() {
  const container = document.getElementById('ownerRecentRequests');
  if (!container) return;

  const recent = getOwnerVisibleRequests().slice(0, 3);
  if (!recent.length) {
    container.innerHTML = `
      <p class="owner-empty-state">
        신청 내역이 없습니다.
        <a href="owner-register.html" class="btn btn--owner-positive btn--sm">빈집 등록 신청하기</a>
      </p>
    `;
    return;
  }

  const statusMap = {
    submitted: { label: '신청 완료', cls: 'badge--submitted' },
    under_review: { label: '검토 중', cls: 'badge--pending' },
    site_visit: { label: '현장 방문', cls: 'badge--pending' },
    approved: { label: '승인 완료', cls: 'badge--approved' },
    rejected: { label: '반려', cls: 'badge--rejected' },
  };

  container.innerHTML = recent.map((request) => {
    const status = statusMap[request.reviewStatus] || { label: request.reviewStatus || '확인 필요', cls: '' };
    return `
      <div class="owner-row-card">
        <div>
          <div class="owner-row-card__title">영주시 ${escapeHtml(request.districtName || '-')} · ${escapeHtml(request.address || '-')}</div>
          <div class="owner-row-card__meta">신청일 ${formatDateShort(request.submittedAt)}</div>
        </div>
        <span class="badge ${status.cls}">${status.label}</span>
      </div>
    `;
  }).join('');
}

function renderOwnerBookingRequests() {
  const container = document.getElementById('ownerBookingRequests');
  if (!container) return;

  const bookings = typeof getOwnerVisibleBookingRequests === 'function'
    ? getOwnerVisibleBookingRequests()
    : [];

  if (!bookings.length) {
    container.innerHTML = '<p class="owner-empty-state">들어온 예약 요청이 없습니다.</p>';
    return;
  }

  const statusMap = {
    pending: { label: '승인 대기', cls: 'badge--pending' },
    approved: { label: '승인 완료', cls: 'badge--approved' },
    rejected: { label: '거절', cls: 'badge--rejected' },
    hold: { label: '보류', cls: 'badge--pending' },
    confirmed: { label: '예약 확정', cls: 'badge--approved' },
    cancel_requested: { label: '취소 요청', cls: 'badge--rejected' },
  };

  container.innerHTML = bookings.map((booking) => {
    const status = statusMap[booking.status] || { label: booking.status || '확인 필요', cls: '' };
    const actionButtons = booking.status === 'pending'
      ? `
        <div class="owner-booking-card__actions">
          <button type="button" class="btn btn--owner-positive btn--sm" data-booking-id="${escapeAttr(booking.id)}" data-booking-action="approved">승인</button>
          <button type="button" class="btn btn--ghost btn--sm" data-booking-id="${escapeAttr(booking.id)}" data-booking-action="hold">보류</button>
          <button type="button" class="btn btn--danger btn--sm" data-booking-id="${escapeAttr(booking.id)}" data-booking-action="rejected">거절</button>
        </div>
      `
      : `
        <div class="owner-booking-card__footer">
          <span>${booking.ownerReviewedAt ? `처리일 ${formatDateShort(String(booking.ownerReviewedAt).slice(0, 10))}` : '처리 완료된 요청입니다.'}</span>
        </div>
      `;

    return `
      <article class="owner-booking-card">
        <div class="owner-booking-card__header">
          <div>
            <strong class="owner-booking-card__title">${escapeHtml(booking.houseName || '예약 요청')}</strong>
            <div class="owner-booking-card__meta">${escapeHtml(booking.guestName || '투숙객')} · ${escapeHtml(booking.guestCount || booking.guests || 1)}명</div>
          </div>
          <span class="badge ${status.cls}">${status.label}</span>
        </div>
        <div class="owner-booking-card__details">
          <span>일정 ${formatDateShort(booking.checkIn)} ~ ${formatDateShort(booking.checkOut)}</span>
          <span>지역 영주시 ${escapeHtml(booking.districtName || '-')}</span>
          <span>목적 ${escapeHtml(booking.purpose || '-')}</span>
        </div>
        ${actionButtons}
      </article>
    `;
  }).join('');
}

function bindOwnerBookingActions() {
  document.getElementById('ownerBookingRequests')?.addEventListener('click', function (event) {
    const button = event.target.closest('[data-booking-action]');
    if (!button) return;

    const { bookingId, bookingAction } = button.dataset;
    handleOwnerBookingAction(bookingId, bookingAction);
  });
}

function handleOwnerBookingAction(bookingId, status) {
  try {
    if (typeof updateBookingRequestStatus !== 'function') {
      throw new Error('예약 상태 변경 함수를 찾을 수 없습니다.');
    }

    updateBookingRequestStatus(bookingId, status, getCurrentUser());
    const message = {
      approved: '예약을 승인했습니다.',
      hold: '예약을 보류했습니다.',
      rejected: '예약을 거절했습니다.',
    }[status] || '예약 상태를 변경했습니다.';
    showToast(message, status === 'rejected' ? 'warning' : 'success');
    renderOwnerDashboard();
  } catch (error) {
    console.error(error);
    showToast(error.message || '예약 상태 변경 중 오류가 발생했습니다.', 'danger');
  }
}

function renderNotifications() {
  const container = document.getElementById('ownerNotifications');
  if (!container) return;

  const notifications = typeof getNotifications === 'function' ? getNotifications() : [];
  if (!notifications.length) {
    container.innerHTML = '<p class="owner-empty-state">새 알림이 없습니다.</p>';
    return;
  }

  container.innerHTML = notifications.map((notification) => `
    <div class="notification-item ${notification.read ? '' : 'is-unread'}">
      <div class="notification-item__icon">알림</div>
      <div class="notification-item__content">
        <div class="notification-item__title">${escapeHtml(notification.message || '알림')}</div>
        <div class="notification-item__desc">${escapeHtml(notification.type || '알림')}</div>
      </div>
      <div class="notification-item__date">${notification.createdAt ? new Date(notification.createdAt).toLocaleDateString('ko-KR') : ''}</div>
    </div>
  `).join('');
}

function getOwnerVisibleRequests() {
  const user = getCurrentUser();
  const requests = typeof getAllRegistrationRequests === 'function'
    ? getAllRegistrationRequests()
    : REGISTRATION_REQUESTS;
  if (!user) return [];
  return requests.filter((request) =>
    typeof matchesOwnerIdentity === 'function'
      ? matchesOwnerIdentity(request, user)
      : (
        request.ownerUserId === user.id ||
        request.ownerUserId === user.email ||
        request.ownerName === user.name
      )
  );
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[char]));
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/`/g, '&#96;');
}
