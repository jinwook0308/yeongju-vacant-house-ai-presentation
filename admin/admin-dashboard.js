/**
 * 관리자 운영 대시보드
 * 샘플 데이터와 localStorage에 저장된 실제 사용자 신청 데이터를 함께 집계합니다.
 */

const DASHBOARD_BOOKING_KEY = 'yeongjuBookingRequests';
const WORK_QUEUE_STATE = { active: 'review' };
let dashboardStats = null;
let dashboardHouses = [];
let dashboardDataLoaded = false;

window.addEventListener('load', initAdminDashboard);

async function initAdminDashboard() {
  renderHeader('admin');
  renderFooter();

  if (!requireAdminLogin()) return;
  if (typeof syncAdminManagementNavigation === 'function') {
    syncAdminManagementNavigation();
  }

  await loadDashboardOperationalData();
  renderCommandMeta();
  renderDashboard();
  setupDashboardEvents();
  focusDashboardSectionFromHash();

  window.addEventListener('yeongju:platform-data-changed', refreshAdminDashboard);
  window.addEventListener('hashchange', focusDashboardSectionFromHash);
  window.addEventListener('storage', (event) => {
    if (
      [PLATFORM_REQUESTS_KEY, DASHBOARD_BOOKING_KEY, COMMUNITY_QNA_KEY, WITHDRAW_REQUESTS_KEY].includes(event.key) ||
      String(event.key || '').startsWith(NOTIFICATION_KEY_PREFIX)
    ) {
      refreshAdminDashboard();
    }
  });
}

function requireAdminLogin() {
  const user = getCurrentUser();
  if (!user) {
    window.location.href = '../auth/login.html?role=admin';
    return false;
  }
  if (user.role !== 'admin') {
    document.body.innerHTML = `
      <main class="access-denied">
        <div class="access-denied__icon" aria-hidden="true">!</div>
        <h2 class="access-denied__title">접근 권한이 없습니다</h2>
        <p class="access-denied__desc">관리자 계정으로 로그인해야 운영 대시보드를 볼 수 있습니다.</p>
        <a href="../auth/login.html?role=admin" class="btn btn--primary">관리자 로그인</a>
      </main>
    `;
    return false;
  }
  return true;
}

function setupDashboardEvents() {
  document.getElementById('adminWorkQueue')?.addEventListener('click', (event) => {
    const tab = event.target.closest('[data-work-tab]');
    if (tab) {
      WORK_QUEUE_STATE.active = tab.dataset.workTab;
      renderWorkQueue();
      return;
    }

    const action = event.target.closest('[data-request-action]');
    if (action) {
      event.preventDefault();
      const { requestId, requestAction } = action.dataset;
      if (requestAction === 'review') {
        window.location.href = `admin-review-detail.html?id=${encodeURIComponent(requestId)}`;
      } else if (requestAction === 'visit') {
        updateRegistrationRequestSafely(requestId, { reviewStatus: 'site_visit' });
      }
    }
  });

  document.getElementById('adminMarkReadBtn')?.addEventListener('click', () => {
    if (typeof markNotificationsRead === 'function') {
      clearDashboardHash();
      markNotificationsRead(getCurrentUser());
      renderHeader('admin');
      refreshAdminDashboard();
    }
  });

  document.getElementById('adminWithdrawalPanel')?.addEventListener('click', async (event) => {
    const action = event.target.closest('[data-withdrawal-action]');
    if (!action) return;

    const { withdrawalId, withdrawalAction } = action.dataset;
    if (withdrawalAction !== 'approve') return;

    try {
      await handleWithdrawalApproval(withdrawalId);
    } catch (error) {
      console.error(error);
      if (typeof showToast === 'function') {
        showToast(error.message || '탈퇴 승인 처리 중 오류가 발생했습니다.', 'danger');
      }
    }
  });
}

function refreshAdminDashboard() {
  loadDashboardOperationalData(true).finally(() => {
    renderCommandMeta();
    renderDashboard();
    focusDashboardSectionFromHash();
  });
}

function renderDashboard() {
  updatePendingBadge();
  renderKpiCards();
  renderOpsOverview();
  renderWorkQueue();
  renderRecentRequestsTable();
  renderBookingPanel();
  renderWithdrawalPanel();
  renderStatusDistributionChart();
  renderMonthlyTrendChart();
  renderOperationTypeChart();
  renderDistrictSummaryTable();
  renderNotificationsPanel();
  renderQuickActions();
}

function renderCommandMeta() {
  const today = new Date();
  const dateEl = document.getElementById('adminCurrentDate');
  const updatedEl = document.getElementById('adminLastUpdated');

  if (dateEl) {
    dateEl.textContent = `오늘 ${today.toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      weekday: 'short',
    })}`;
  }

  if (updatedEl) {
    updatedEl.textContent = `마지막 갱신 ${today.toLocaleTimeString('ko-KR', {
      hour: '2-digit',
      minute: '2-digit',
    })}`;
  }
}

function updatePendingBadge() {
  const badge = document.getElementById('pendingCountBadge');
  if (!badge) return;
  const pendingCount = getDashboardRequests().filter((request) =>
    ['submitted', 'under_review', 'site_visit', 'approval_pending'].includes(request.reviewStatus)
  ).length;
  badge.textContent = pendingCount;
  badge.hidden = pendingCount === 0;
}

function getDashboardRequests() {
  const requests = typeof getAllRegistrationRequests === 'function'
    ? getAllRegistrationRequests()
    : (typeof REGISTRATION_REQUESTS !== 'undefined' ? REGISTRATION_REQUESTS : []);

  return [...requests].sort((a, b) => getPriorityWeight(b) - getPriorityWeight(a) || toTime(b.submittedAt) - toTime(a.submittedAt));
}

function getDashboardHouses() {
  if (dashboardDataLoaded) {
    return dashboardHouses;
  }
  return typeof VACANT_HOUSE_LIST !== 'undefined' && Array.isArray(VACANT_HOUSE_LIST)
    ? VACANT_HOUSE_LIST
    : [];
}

async function loadDashboardOperationalData(force = false) {
  if (dashboardDataLoaded && !force) return;

  try {
    const [statsResponse, housesResponse] = await Promise.all([
      fetch(`${getApiBaseUrl()}/site/stats`),
      fetch(`${getApiBaseUrl()}/houses`),
    ]);

    if (!statsResponse.ok) throw new Error(`stats HTTP ${statsResponse.status}`);
    if (!housesResponse.ok) throw new Error(`houses HTTP ${housesResponse.status}`);

    dashboardStats = await statsResponse.json();
    dashboardHouses = await housesResponse.json();
    dashboardDataLoaded = true;
  } catch (error) {
    console.error('관리자 대시보드 실제 운영 데이터를 불러오지 못했습니다.', error);
    dashboardStats = null;
    dashboardHouses = [];
    dashboardDataLoaded = true;
  }
}

function getDashboardVendors() {
  return typeof VENDOR_LIST !== 'undefined' && Array.isArray(VENDOR_LIST)
    ? VENDOR_LIST
    : [];
}

function getDashboardDistricts() {
  return typeof YEONGJU_DISTRICTS !== 'undefined' && Array.isArray(YEONGJU_DISTRICTS)
    ? YEONGJU_DISTRICTS
    : [];
}

function getBaseRequestIds() {
  const base = typeof getBaseRegistrationRequests === 'function'
    ? getBaseRegistrationRequests()
    : (typeof REGISTRATION_REQUESTS !== 'undefined' ? REGISTRATION_REQUESTS : []);
  return new Set(base.map((request) => String(request.id)));
}

function getNewStoredRegistrationRequests() {
  const baseIds = getBaseRequestIds();
  const stored = typeof getStoredRegistrationRequests === 'function' ? getStoredRegistrationRequests() : [];
  return stored.filter((request) => !baseIds.has(String(request.id)));
}

function getOperationalSummary() {
  const requests = getDashboardRequests();
  const houses = getDashboardHouses();
  const registered = Number(dashboardStats?.registeredHouses || houses.length || 0);
  const approved = Number(dashboardStats?.approvedHouses || houses.filter((house) => house.isApproved).length || 0);
  const pendingReview = requests.filter((request) => ['submitted', 'under_review', 'site_visit', 'approval_pending'].includes(request.reviewStatus)).length;
  const bookings = getDashboardBookings();
  const pendingBooking = bookings.filter((booking) => booking.status === 'pending').length;

  return {
    registered,
    approved,
    pendingReview,
    pendingBooking,
    districtCoverage: Number(dashboardStats?.districtCoverage || 0),
    vendors: Number(dashboardStats?.vendors || getDashboardVendors().length || 0),
    houses,
    requests,
    bookings,
  };
}

function renderKpiCards() {
  const grid = document.getElementById('adminKpiGrid');
  if (!grid) return;

  const summary = getOperationalSummary();
  const kpis = [
    { label: '등록 빈집', value: summary.registered, note: '사용자 신청 즉시 반영', badge: '+실시간', tone: 'green' },
    { label: '승인 완료 빈집', value: summary.approved, note: '공개 목록 운영 기준', badge: '운영중', tone: 'gold' },
    { label: '검토 대기 신청', value: summary.pendingReview, note: '신청/검토/현장방문 포함', badge: '처리필요', tone: summary.pendingReview ? 'red' : 'green' },
    { label: '예약 승인 대기', value: summary.pendingBooking, note: '운영 책임자 승인 기준', badge: summary.pendingBooking ? '대기' : '정상', tone: summary.pendingBooking ? 'blue' : 'green' },
    { label: '읍면동 커버리지', value: summary.districtCoverage, note: '영주시 행정구역 기준', badge: '전체', tone: 'green' },
    { label: '협력업체 수', value: summary.vendors, note: '보수/운영/인테리어 연계', badge: '연계', tone: 'gold' },
  ];

  grid.innerHTML = kpis.map((kpi) => `
    <article class="admin-kpi-card" data-tone="${kpi.tone}">
      <div class="admin-kpi-card__top">
        <span class="admin-kpi-card__label">${escapeHtml(kpi.label)}</span>
        <span class="admin-kpi-card__badge">${escapeHtml(kpi.badge)}</span>
      </div>
      <strong class="admin-kpi-card__value">${formatDashboardNumber(kpi.value)}</strong>
      <span class="admin-kpi-card__note">${escapeHtml(kpi.note)}</span>
    </article>
  `).join('');
}

function renderOpsOverview() {
  const container = document.getElementById('adminOpsOverview');
  if (!container) return;

  const summary = getOperationalSummary();
  const qnaWaiting = getUnansweredQna().length;
  const repairNeeded = summary.requests.filter((request) => includesAny(request.buildingCondition, ['보수', 'repair']) || request.reviewStatus === 'repair').length;

  const metrics = [
    { label: '등록 빈집', value: summary.registered },
    { label: '승인 완료', value: summary.approved },
    { label: '보수 필요', value: repairNeeded },
    { label: '미응답 Q&A', value: qnaWaiting },
  ];

  container.innerHTML = `
    <div class="admin-ops-body">
      <div class="admin-ops-metrics">
        ${metrics.map((metric) => `
          <div class="admin-ops-card">
            <strong>${formatDashboardNumber(metric.value)}</strong>
            <span>${escapeHtml(metric.label)}</span>
          </div>
        `).join('')}
      </div>
      <p class="admin-ops-insight">
        신규 사용자 신청은 공개 데이터와 분리해 집계되며, 승인 처리 시 운영 현황 숫자가 즉시 다시 계산됩니다.
      </p>
    </div>
  `;
}

function renderWorkQueue() {
  const container = document.getElementById('adminWorkQueue');
  if (!container) return;

  const queues = getWorkQueueGroups();
  const active = queues.find((queue) => queue.key === WORK_QUEUE_STATE.active) || queues[0];
  WORK_QUEUE_STATE.active = active.key;

  container.innerHTML = `
    <div class="admin-segment" role="tablist" aria-label="업무 분류">
      ${queues.map((queue) => `
        <button type="button" class="admin-segment__btn ${queue.key === active.key ? 'is-active' : ''}" data-work-tab="${queue.key}">
          ${escapeHtml(queue.label)}
          <span>${queue.items.length}</span>
        </button>
      `).join('')}
    </div>
    ${active.items.length ? `
      <div class="admin-queue-list">
        ${active.items.slice(0, 6).map(renderWorkQueueItem).join('')}
      </div>
    ` : renderEmptyState('처리할 업무가 없습니다', '현재 선택한 분류의 대기 항목이 없습니다.')}
  `;
}

function getWorkQueueGroups() {
  const requests = getDashboardRequests();
  const bookings = getDashboardBookings();
  const qnas = getUnansweredQna();

  return [
    {
      key: 'review',
      label: '신청검토 대기',
      items: requests.filter((request) => ['submitted', 'under_review'].includes(request.reviewStatus)),
    },
    {
      key: 'approval',
      label: '승인 대기',
      items: requests.filter((request) => request.reviewStatus === 'approval_pending'),
    },
    {
      key: 'visit',
      label: '현장방문 예정',
      items: requests.filter((request) => request.reviewStatus === 'site_visit'),
    },
    {
      key: 'repair',
      label: '보수필요',
      items: requests.filter((request) => includesAny(request.buildingCondition, ['보수', 'repair'])),
    },
    {
      key: 'booking',
      label: '예약승인대기',
      items: bookings.filter((booking) => booking.status === 'pending'),
    },
    {
      key: 'qna',
      label: '미응답 Q&A',
      items: qnas,
    },
  ];
}

function renderWorkQueueItem(item) {
  if (item.kind === 'booking' || item.guestName) {
    return renderBookingQueueItem(item);
  }

  if (item.question) {
    return `
      <article class="admin-queue-item">
        <div class="admin-queue-item__top">
          <strong class="admin-queue-item__title">${escapeHtml(item.question)}</strong>
          <span class="admin-priority-badge" data-priority="medium">응답 대기</span>
        </div>
        <div class="admin-queue-item__meta">
          <span>작성자 ${escapeHtml(item.author || '방문자')}</span>
          <span>접수일 ${formatDateShortSafe(item.createdAt)}</span>
          <span>${item.isPrivate ? '비공개 문의' : '공개 문의'}</span>
        </div>
        <div class="admin-queue-item__actions">
          <a class="admin-action-btn admin-action-btn--primary" href="../community/community.html">Q&A 답변</a>
        </div>
      </article>
    `;
  }

  const status = getReviewStatusMeta(item.reviewStatus);
  const priority = getRequestPriority(item);
  const source = getRequestSource(item);

  return `
    <article class="admin-queue-item">
      <div class="admin-queue-item__top">
        <strong class="admin-queue-item__title">${escapeHtml(item.ownerName || '신청자 미상')} · ${escapeHtml(item.districtName || '지역 미상')}</strong>
        <span class="admin-priority-badge" data-priority="${priority.key}">${priority.label}</span>
      </div>
      <div class="admin-queue-item__meta">
        <span>접수번호 ${escapeHtml(item.id || '-')}</span>
        <span>위치 ${escapeHtml(item.address || '-')}</span>
        <span>접수일 ${formatDateShortSafe(item.submittedAt)}</span>
        <span class="admin-state-badge" data-tone="${status.tone}">${status.label}</span>
        <span class="admin-source-badge ${source.isUser ? 'is-user' : ''}">${source.label}</span>
      </div>
      <div class="admin-queue-item__actions">
        <button type="button" class="admin-action-btn admin-action-btn--primary" data-request-id="${escapeAttr(item.id)}" data-request-action="review">상세 검토</button>
        ${['submitted', 'under_review'].includes(item.reviewStatus) ? `<button type="button" class="admin-action-btn" data-request-id="${escapeAttr(item.id)}" data-request-action="visit">현장방문 전환</button>` : ''}
      </div>
    </article>
  `;
}

function renderBookingQueueItem(booking) {
  const authority = getBookingAuthority(booking);
  return `
    <article class="admin-queue-item">
      <div class="admin-queue-item__top">
        <strong class="admin-queue-item__title">${escapeHtml(booking.houseName)} · ${escapeHtml(booking.guestName)}</strong>
        <span class="admin-priority-badge" data-priority="medium">예약 대기</span>
      </div>
      <div class="admin-queue-item__meta">
        <span>${formatDateShortSafe(booking.checkIn)} ~ ${formatDateShortSafe(booking.checkOut)}</span>
        <span>${escapeHtml(authority)}</span>
        <span>${escapeHtml(booking.guestCount || 1)}명</span>
      </div>
      <div class="admin-queue-item__actions">
        <span class="admin-source-badge">빈집 소유자 처리 대기</span>
      </div>
    </article>
  `;
}

function renderRecentRequestsTable() {
  const container = document.getElementById('recentRequestsTable');
  if (!container) return;

  const requests = getDashboardRequests().slice(0, 8);
  if (!requests.length) {
    container.innerHTML = renderEmptyState('신청 데이터가 없습니다', '빈집 등록 신청이 들어오면 이곳에 표시됩니다.');
    return;
  }

  container.innerHTML = `
    <div class="admin-table-wrap">
      <table class="admin-table">
        <thead>
          <tr>
            <th>접수번호</th>
            <th>신청자</th>
            <th>위치</th>
            <th>건물유형</th>
            <th>사진첨부</th>
            <th>상태</th>
            <th>접수일</th>
            <th>담당 작업</th>
          </tr>
        </thead>
        <tbody>
          ${requests.map(renderRequestRow).join('')}
        </tbody>
      </table>
    </div>
    <div class="admin-mobile-list">
      ${requests.map(renderRequestMobileCard).join('')}
    </div>
  `;
}

function renderRequestRow(request) {
  const status = getReviewStatusMeta(request.reviewStatus);
  const source = getRequestSource(request);
  const photos = getPhotoCount(request);
  const building = getBuildingTypeLabel(request.buildingType);

  return `
    <tr data-clickable onclick="location.href='admin-review-detail.html?id=${encodeURIComponent(request.id)}'">
      <td>
        <span class="admin-table__strong">${escapeHtml(request.id || '-')}</span>
        <span class="admin-table__muted">${source.label}</span>
      </td>
      <td class="admin-table__strong">${escapeHtml(request.ownerName || '-')}</td>
      <td>
        <span class="admin-table__strong">${escapeHtml(request.districtName || '-')}</span>
        <span class="admin-table__muted">${escapeHtml(request.address || '-')}</span>
      </td>
      <td>${escapeHtml(building)}</td>
      <td>${photos > 0 ? `<span class="admin-photo-badge">사진 ${photos}장</span>` : '<span class="admin-source-badge">없음</span>'}</td>
      <td><span class="admin-state-badge" data-tone="${status.tone}">${status.label}</span></td>
      <td>${formatDateShortSafe(request.submittedAt)}</td>
      <td>
        <div class="admin-table-actions">
          <a class="admin-action-btn admin-action-btn--primary" href="admin-review-detail.html?id=${encodeURIComponent(request.id)}" onclick="event.stopPropagation()">검토</a>
        </div>
      </td>
    </tr>
  `;
}

function renderRequestMobileCard(request) {
  const status = getReviewStatusMeta(request.reviewStatus);
  const source = getRequestSource(request);
  const photos = getPhotoCount(request);

  return `
    <a class="admin-mobile-card" href="admin-review-detail.html?id=${encodeURIComponent(request.id)}">
      <strong class="admin-mobile-card__title">${escapeHtml(request.ownerName || '-')} · ${escapeHtml(request.districtName || '-')}</strong>
      <div class="admin-mobile-card__meta">
        <span>${escapeHtml(request.id || '-')}</span>
        <span>${formatDateShortSafe(request.submittedAt)}</span>
        <span class="admin-state-badge" data-tone="${status.tone}">${status.label}</span>
        <span class="admin-source-badge ${source.isUser ? 'is-user' : ''}">${source.label}</span>
        <span class="admin-photo-badge">${photos > 0 ? `사진 ${photos}장` : '사진 없음'}</span>
      </div>
    </a>
  `;
}

function renderBookingPanel() {
  const container = document.getElementById('bookingApprovalPanel');
  if (!container) return;

  const bookings = getDashboardBookings();
  const pending = bookings.filter((booking) => booking.status === 'pending');
  const today = toDateOnly(new Date());
  const todayCheckIn = bookings.filter((booking) => booking.checkIn === today).length;
  const soonCheckOut = bookings.filter((booking) => diffDays(today, booking.checkOut) >= 0 && diffDays(today, booking.checkOut) <= 2).length;
  const cancelRequests = bookings.filter((booking) => booking.status === 'cancel_requested').length;

  container.innerHTML = `
    <div class="admin-ops-body">
      <div class="admin-ops-metrics">
        <div class="admin-ops-card"><strong>${pending.length}</strong><span>예약 대기</span></div>
        <div class="admin-ops-card"><strong>${todayCheckIn}</strong><span>오늘 체크인</span></div>
        <div class="admin-ops-card"><strong>${soonCheckOut}</strong><span>곧 체크아웃</span></div>
        <div class="admin-ops-card"><strong>${cancelRequests}</strong><span>취소 요청</span></div>
      </div>
    </div>
    ${pending.length ? `
      <div class="admin-booking-list">
        ${pending.slice(0, 4).map(renderBookingItem).join('')}
      </div>
    ` : renderEmptyState('예약 승인 대기 건이 없습니다', '신규 예약이 들어오면 운영 책임자 기준으로 표시됩니다.')}
  `;
}

function renderWithdrawalPanel() {
  const container = document.getElementById('adminWithdrawalPanel');
  if (!container) return;

  const requests = typeof getPendingOwnerWithdrawalRequests === 'function'
    ? getPendingOwnerWithdrawalRequests()
    : [];

  if (!requests.length) {
    container.innerHTML = renderEmptyState('대기 중인 탈퇴 요청이 없습니다', '빈집 소유자 탈퇴 요청이 접수되면 이곳에서 승인할 수 있습니다.');
    return;
  }

  container.innerHTML = `
    <div class="admin-booking-list">
      ${requests.map(renderWithdrawalItem).join('')}
    </div>
  `;
}

function renderWithdrawalItem(request) {
  return `
    <article class="admin-booking-item">
      <div class="admin-booking-item__top">
        <strong class="admin-booking-item__title">${escapeHtml(request.userName || '소유자')} · 탈퇴 승인 요청</strong>
        <span class="admin-state-badge" data-tone="red">승인 대기</span>
      </div>
      <div class="admin-booking-item__meta">
        <span>계정 ${escapeHtml(request.userEmail || '-')}</span>
        <span>요청일 ${formatDateShortSafe(String(request.submittedAt || '').slice(0, 10))}</span>
        <span>사유 ${escapeHtml(request.reason || '-')}</span>
      </div>
      <div class="admin-booking-item__actions">
        <button type="button" class="admin-action-btn admin-action-btn--primary" data-withdrawal-id="${escapeAttr(request.id)}" data-withdrawal-action="approve">탈퇴 승인</button>
      </div>
    </article>
  `;
}

async function handleWithdrawalApproval(withdrawalId) {
  const requests = typeof getPendingOwnerWithdrawalRequests === 'function'
    ? getPendingOwnerWithdrawalRequests()
    : [];
  const target = requests.find((request) => String(request.id) === String(withdrawalId));

  if (!target) {
    throw new Error('승인할 탈퇴 요청을 찾을 수 없습니다.');
  }

  const confirmed = window.confirm(`${target.userName || '소유자'}님의 탈퇴를 승인하시겠습니까?\n승인 후 빈집목록에서 해당 소유자 빈집이 제거됩니다.`);
  if (!confirmed) return;

  if (typeof approveOwnerWithdrawalRequest !== 'function') {
    throw new Error('탈퇴 승인 함수를 찾을 수 없습니다.');
  }

  await approveOwnerWithdrawalRequest(withdrawalId, getCurrentUser());
  if (typeof showToast === 'function') {
    showToast('빈집 소유자 탈퇴를 승인했습니다.', 'success');
  }
  refreshAdminDashboard();
}

function focusDashboardSectionFromHash() {
  const hash = window.location.hash || '';
  if (!hash) return;
  if (hash !== '#withdrawalApprovalPanel') return;

  const target = document.querySelector(hash);
  if (!target) return;

  target.classList.add('is-targeted');
  window.setTimeout(() => {
    target.classList.remove('is-targeted');
  }, 1800);

  window.requestAnimationFrame(() => {
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

function clearDashboardHash() {
  if (!window.location.hash) return;
  if (!window.history || typeof window.history.replaceState !== 'function') return;
  window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
}

function renderBookingItem(booking) {
  return `
    <article class="admin-booking-item">
      <div class="admin-booking-item__top">
        <strong class="admin-booking-item__title">${escapeHtml(booking.houseName)} · ${escapeHtml(booking.guestName)}</strong>
        <span class="admin-state-badge" data-tone="blue">승인 대기</span>
      </div>
      <div class="admin-booking-item__meta">
        <span>${formatDateShortSafe(booking.checkIn)} ~ ${formatDateShortSafe(booking.checkOut)}</span>
        <span>${escapeHtml(getBookingAuthority(booking))}</span>
        <span>${escapeHtml(booking.guestCount || 1)}명</span>
      </div>
      <div class="admin-booking-item__actions">
        <span class="admin-source-badge">빈집 소유자 처리 대기</span>
      </div>
    </article>
  `;
}

function renderStatusDistributionChart() {
  const container = document.getElementById('statusDistributionChart');
  if (!container) return;

  const requests = getDashboardRequests();
  const groups = [
    { key: 'submitted', label: '신청 완료', color: '#a17a1e' },
    { key: 'under_review', label: '검토 중', color: '#255f86' },
    { key: 'site_visit', label: '현장 방문', color: '#5a6670' },
    { key: 'approval_pending', label: '승인 대기', color: '#8f6f18' },
    { key: 'approved', label: '승인', color: '#174b3c' },
    { key: 'rejected', label: '반려', color: '#a33a32' },
  ];
  const total = Math.max(1, requests.length);
  const waiting = requests.filter((request) => ['submitted', 'under_review', 'site_visit', 'approval_pending'].includes(request.reviewStatus)).length;

  container.innerHTML = `
    <div class="admin-chart">
      ${groups.map((group) => {
        const count = requests.filter((request) => request.reviewStatus === group.key).length;
        return renderBarRow(group.label, count, total, group.color);
      }).join('')}
      <p class="admin-chart-insight">검토 흐름에 남아 있는 신청은 ${waiting}건입니다. 접수일이 오래된 건부터 우선 확인하세요.</p>
    </div>
  `;
}

function renderMonthlyTrendChart() {
  const container = document.getElementById('monthlyTrendChart');
  if (!container) return;

  const requests = getDashboardRequests();
  const months = getRecentMonths(6);
  const counts = months.map((month) => ({
    month,
    count: requests.filter((request) => String(request.submittedAt || '').startsWith(month)).length,
  }));
  const max = Math.max(1, ...counts.map((item) => item.count));

  container.innerHTML = `
    <div class="admin-month-chart">
      ${counts.map((item) => `
        <div class="admin-month-chart__item">
          <div class="admin-month-chart__bar" style="height:${Math.max(14, Math.round((item.count / max) * 150))}px"></div>
          <span class="admin-month-chart__count">${item.count}</span>
          <span class="admin-month-chart__label">${item.month.slice(5)}월</span>
        </div>
      `).join('')}
    </div>
  `;
}

function renderOperationTypeChart() {
  const container = document.getElementById('operationTypeChart');
  if (!container) return;

  const requests = getDashboardRequests();
  const groups = [
    { label: '숙박', color: '#174b3c', match: (value) => includesAny(value, ['숙박', 'lodging']) },
    { label: '장기체류', color: '#a17a1e', match: (value) => includesAny(value, ['장기', 'longterm']) },
    { label: '체험공간', color: '#255f86', match: (value) => includesAny(value, ['체험', 'experience']) },
    { label: '커뮤니티', color: '#68716a', match: (value) => includesAny(value, ['커뮤니티', 'community']) },
  ];
  const counts = groups.map((group) => ({
    ...group,
    count: requests.filter((request) => (request.usageTypes || []).some(group.match)).length,
  }));
  const total = Math.max(1, counts.reduce((sum, item) => sum + item.count, 0));
  let degrees = 0;
  const segments = counts.map((item) => {
    const next = degrees + Math.round((item.count / total) * 360);
    const segment = `${item.color} ${degrees}deg ${next}deg`;
    degrees = next;
    return segment;
  }).join(', ');

  container.innerHTML = `
    <div class="admin-donut-wrap">
      <div class="admin-donut" style="background: conic-gradient(${segments || '#d8d3c8 0deg 360deg'});" aria-hidden="true"></div>
      <div class="admin-donut-legend">
        ${counts.map((item) => `
          <div class="admin-donut-legend__item">
            <span class="admin-donut-legend__name"><span class="admin-donut-legend__dot" style="--legend-color:${item.color};"></span>${escapeHtml(item.label)}</span>
            <span class="admin-donut-legend__count">${item.count}</span>
          </div>
        `).join('')}
        <p class="admin-chart-insight">숙박과 체험 활용은 승인 검토 후 공개 목록 전환 가능성이 높은 유형입니다.</p>
      </div>
    </div>
  `;
}

function renderDistrictSummaryTable() {
  const container = document.getElementById('districtSummaryTable');
  if (!container) return;

  const districts = getComputedDistrictStats().slice(0, 8);
  if (!districts.length) {
    container.innerHTML = renderEmptyState('지역 데이터가 없습니다', '영주시 읍면동 데이터가 연결되면 표시됩니다.');
    return;
  }

  container.innerHTML = `
    <div class="admin-table-wrap">
      <table class="admin-table">
        <thead>
          <tr>
            <th>읍면동</th>
            <th>신청</th>
            <th>승인</th>
            <th>대기</th>
            <th>반려</th>
          </tr>
        </thead>
        <tbody>
          ${districts.map((district) => `
            <tr data-clickable onclick="location.href='admin-district.html?district=${encodeURIComponent(district.districtId)}'">
              <td class="admin-table__strong">${escapeHtml(district.districtName)}</td>
              <td>${district.total}</td>
              <td><span class="admin-state-badge" data-tone="green">${district.approved}</span></td>
              <td><span class="admin-state-badge" data-tone="gold">${district.pending}</span></td>
              <td><span class="admin-state-badge" data-tone="red">${district.rejected}</span></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
    <div class="admin-mobile-list">
      ${districts.map((district) => `
        <a class="admin-mobile-card" href="admin-district.html?district=${encodeURIComponent(district.districtId)}">
          <strong class="admin-mobile-card__title">${escapeHtml(district.districtName)}</strong>
          <div class="admin-mobile-card__meta">
            <span>신청 ${district.total}</span>
            <span>승인 ${district.approved}</span>
            <span>대기 ${district.pending}</span>
            <span>반려 ${district.rejected}</span>
          </div>
        </a>
      `).join('')}
    </div>
  `;
}

function getComputedDistrictStats(requests = getDashboardRequests()) {
  const districts = getDashboardDistricts();
  const houses = getDashboardHouses();
  return districts.map((district) => {
    const districtRequests = requests.filter((request) => request.districtId === district.id);
    const districtHouses = houses.filter((house) => house.districtId === district.id);
    return {
      districtId: district.id,
      districtName: district.name,
      total: districtRequests.length + districtHouses.length,
      approved: districtRequests.filter((request) => request.reviewStatus === 'approved').length + districtHouses.filter((house) => house.isApproved).length,
      pending: districtRequests.filter((request) => ['submitted', 'under_review', 'site_visit', 'approval_pending'].includes(request.reviewStatus)).length,
      rejected: districtRequests.filter((request) => request.reviewStatus === 'rejected').length,
    };
  }).sort((a, b) => b.total - a.total || b.pending - a.pending);
}

function renderNotificationsPanel() {
  const container = document.getElementById('adminNotificationsPanel');
  if (!container) return;

  const notifications = typeof getNotifications === 'function' ? getNotifications(getCurrentUser()) : [];
  const fallback = getFallbackNotifications();
  const list = notifications.length ? notifications : fallback;

  if (!list.length) {
    container.innerHTML = renderEmptyState('알림이 없습니다', '새 신청, 예약, Q&A가 들어오면 이곳에 표시됩니다.');
    return;
  }

  container.innerHTML = `
    <div class="admin-notice-list">
      ${list.slice(0, 6).map((notice) => `
        <a class="admin-notice-item ${notice.read ? '' : 'is-unread'}" href="${escapeAttr(notice.href || '#')}">
          <div class="admin-notice-item__top">
            <strong class="admin-notice-item__title"><span class="admin-notice-item__dot" aria-hidden="true"></span>${escapeHtml(notice.message || '운영 알림')}</strong>
            <span class="admin-state-badge" data-tone="${getNoticeTone(notice.type)}">${escapeHtml(getNoticeTypeLabel(notice.type))}</span>
          </div>
          <div class="admin-notice-item__meta">
            <span>${notice.createdAt ? new Date(notice.createdAt).toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '오늘'}</span>
          </div>
        </a>
      `).join('')}
    </div>
  `;
}

function renderQuickActions() {
  const container = document.getElementById('adminQuickActions');
  if (!container) return;

  const actions = [
    { code: 'RV', label: '신청 검토 목록', hint: '접수/현장방문/승인 처리', href: 'admin-review-list.html' },
    { code: 'DT', label: '지역별 현황', hint: '읍면동별 신청/승인 추적', href: 'admin-district.html' },
    { code: 'AN', label: '빈집 분석 리포트', hint: '운영 통계와 공개 데이터 확인', href: 'admin-analytics.html' },
    { code: 'VN', label: '협력업체 관리', hint: '보수/운영 대행 업체 확인', href: '../vendor/vendor-list.html' },
  ];

  if (typeof hasAdminPermission === 'function' && hasAdminPermission('admin_manage_users')) {
    actions.push({ code: 'UM', label: '공공기관 사용자 관리', hint: '가입 승인과 권한 배정', href: 'admin-user-management.html' });
  }

  container.innerHTML = actions.map((action) => `
    <a href="${action.href}" class="admin-quick-action-btn">
      <span class="admin-quick-action-btn__icon">${escapeHtml(action.code)}</span>
      <span class="admin-quick-action-btn__text">
        <span class="admin-quick-action-btn__label">${escapeHtml(action.label)}</span>
        <span class="admin-quick-action-btn__hint">${escapeHtml(action.hint)}</span>
      </span>
      <span aria-hidden="true">›</span>
    </a>
  `).join('');
}

function getDashboardBookings() {
  const seed = typeof BOOKING_REQUESTS !== 'undefined' && Array.isArray(BOOKING_REQUESTS) ? BOOKING_REQUESTS : [];
  const stored = readDashboardStorage(DASHBOARD_BOOKING_KEY, []);
  const merged = new Map();
  [...seed, ...getFallbackBookings(), ...(Array.isArray(stored) ? stored : [])].forEach((booking) => {
    if (booking && booking.id) merged.set(String(booking.id), { ...booking });
  });
  return [...merged.values()].sort((a, b) => getBookingStatusWeight(b.status) - getBookingStatusWeight(a.status) || toTime(b.createdAt) - toTime(a.createdAt));
}

function getFallbackBookings() {
  const houses = getDashboardHouses();
  const firstHouse = houses[0] || {};
  const secondHouse = houses[1] || {};
  return [
    {
      id: 'booking-demo-001',
      kind: 'booking',
      houseId: firstHouse.id || 'house-001',
      houseName: firstHouse.name || '풍기 한옥 숙박 공간',
      ownerType: 'private',
      guestName: '박서연',
      guestCount: 2,
      checkIn: '2026-04-26',
      checkOut: '2026-04-28',
      status: 'pending',
      createdAt: '2026-04-22T09:30:00',
    },
    {
      id: 'booking-demo-002',
      kind: 'booking',
      houseId: secondHouse.id || 'house-002',
      houseName: secondHouse.name || '부석 체험형 빈집',
      ownerType: 'public',
      guestName: '정민호',
      guestCount: 4,
      checkIn: '2026-04-23',
      checkOut: '2026-04-24',
      status: 'approved',
      createdAt: '2026-04-20T14:20:00',
    },
  ];
}

function updateBookingStatus(bookingId, status) {
  const all = getDashboardBookings();
  const target = all.find((booking) => String(booking.id) === String(bookingId));
  if (!target) return;

  const updated = {
    ...target,
    status,
    updatedAt: new Date().toISOString(),
  };

  const stored = readDashboardStorage(DASHBOARD_BOOKING_KEY, []);
  const next = Array.isArray(stored) ? [...stored] : [];
  const index = next.findIndex((booking) => String(booking.id) === String(bookingId));
  if (index >= 0) {
    next[index] = updated;
  } else {
    next.unshift(updated);
  }
  writeDashboardStorage(DASHBOARD_BOOKING_KEY, next);

  const message = {
    approved: '예약을 승인했습니다.',
    rejected: '예약을 거절했습니다.',
    hold: '예약을 보류했습니다.',
  }[status] || '예약 상태를 변경했습니다.';

  if (typeof showToast === 'function') showToast(message, status === 'rejected' ? 'warning' : 'success');
  refreshAdminDashboard();
}

function updateRegistrationRequestSafely(requestId, updates) {
  if (typeof updateRegistrationRequest === 'function') {
    updateRegistrationRequest(requestId, updates);
    if (typeof showToast === 'function') showToast('신청 상태가 현장방문 예정으로 변경되었습니다.', 'success');
    refreshAdminDashboard();
  }
}

function getUnansweredQna() {
  const qnas = typeof getStoredCommunityQna === 'function' ? getStoredCommunityQna() : [];
  return qnas.filter((qna) => !String(qna.answer || '').trim()).map((qna) => ({ ...qna, kind: 'qna' }));
}

function getFallbackNotifications() {
  const requests = getDashboardRequests();
  const pending = requests.find((request) => ['submitted', 'under_review', 'approval_pending'].includes(request.reviewStatus));
  const notices = [];
  if (pending) {
    notices.push({
      type: 'request',
      read: false,
      message: `${pending.ownerName || '신청자'}님의 빈집 등록 신청 검토가 필요합니다.`,
      href: `admin-review-detail.html?id=${encodeURIComponent(pending.id)}`,
      createdAt: pending.submittedAt,
    });
  }
  if (getDashboardBookings().some((booking) => booking.status === 'pending')) {
    notices.push({
      type: 'booking',
      read: false,
      message: '신규 예약 승인 대기 건이 있습니다.',
      href: '#bookingApprovalPanel',
      createdAt: new Date().toISOString(),
    });
  }
  return notices;
}

function getRequestSource(request) {
  const baseIds = getBaseRequestIds();
  const isUser = !baseIds.has(String(request.id));
  return {
    isUser,
    label: isUser ? '사용자 신청' : '공개 데이터',
  };
}

function getRequestPriority(request) {
  if (request.reviewStatus === 'submitted') return { key: 'high', label: '긴급' };
  if (['under_review', 'site_visit', 'approval_pending'].includes(request.reviewStatus)) return { key: 'medium', label: '확인' };
  return { key: 'low', label: '일반' };
}

function getPriorityWeight(request) {
  const map = { submitted: 5, under_review: 4, site_visit: 3, approval_pending: 2, repair: 1, approved: 1, rejected: 0 };
  return map[request.reviewStatus] || 0;
}

function getReviewStatusMeta(status) {
  const map = {
    submitted: { label: '신청 완료', tone: 'gold' },
    under_review: { label: '검토 중', tone: 'blue' },
    site_visit: { label: '현장 방문', tone: 'blue' },
    approval_pending: { label: '승인 대기', tone: 'gold' },
    approved: { label: '승인 완료', tone: 'green' },
    rejected: { label: '반려', tone: 'red' },
    repair: { label: '보수 필요', tone: 'gold' },
  };
  return map[status] || { label: status || '상태 없음', tone: 'gold' };
}

function getBuildingTypeLabel(type) {
  const labels = {
    hanok: '한옥',
    farmhouse: '농가주택',
    modern: '근현대 주택',
    apartment: '아파트/빌라',
    other: '기타',
  };
  return labels[type] || type || '-';
}

function getPhotoCount(request) {
  if (Array.isArray(request.photos)) return request.photos.length;
  if (Array.isArray(request.attachments)) return request.attachments.length;
  if (request.photoCount) return Number(request.photoCount) || 0;
  return 0;
}

function getBookingAuthority(booking) {
  const ownerType = String(booking.ownerType || '').toLowerCase();
  if (ownerType.includes('public') || ownerType.includes('공공')) return '빈집 소유자 승인';
  if (ownerType.includes('vendor') || ownerType.includes('협력')) return '빈집 소유자 승인';
  return '개인 소유자 승인';
}

function getBookingStatusWeight(status) {
  return { pending: 3, hold: 2, cancel_requested: 2, approved: 1, rejected: 0 }[status] || 0;
}

function getNoticeTone(type) {
  return {
    request: 'gold',
    booking: 'blue',
    qna: 'red',
    repair: 'gold',
    'request-status': 'green',
  }[type] || 'green';
}

function getNoticeTypeLabel(type) {
  return {
    request: '등록 신청',
    booking: '예약',
    qna: 'Q&A',
    repair: '보수',
    'request-status': '처리',
    info: '알림',
  }[type] || '알림';
}

function renderBarRow(label, count, total, color) {
  const width = Math.max(3, Math.round((count / total) * 100));
  return `
    <div class="admin-bar-row">
      <span class="admin-bar-row__label">${escapeHtml(label)}</span>
      <span class="admin-bar-row__track">
        <span class="admin-bar-row__fill" style="width:${width}%;background:${color};"></span>
      </span>
      <span class="admin-bar-row__count">${count}</span>
    </div>
  `;
}

function renderEmptyState(title, desc) {
  return `
    <div class="admin-empty-state">
      <div>
        <strong>${escapeHtml(title)}</strong>
        <span>${escapeHtml(desc)}</span>
      </div>
    </div>
  `;
}

function getRecentMonths(count) {
  const now = new Date();
  const months = [];
  for (let index = count - 1; index >= 0; index -= 1) {
    const date = new Date(now.getFullYear(), now.getMonth() - index, 1);
    months.push(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`);
  }
  return months;
}

function readDashboardStorage(key, fallback) {
  try {
    const parsed = JSON.parse(localStorage.getItem(key));
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function writeDashboardStorage(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function formatDashboardNumber(value) {
  const number = Number(value) || 0;
  return number.toLocaleString('ko-KR');
}

function formatDateShortSafe(dateString) {
  if (!dateString) return '-';
  if (typeof formatDateShort === 'function') return formatDateShort(String(dateString).slice(0, 10));
  return String(dateString).slice(0, 10).replace(/-/g, '.');
}

function toDateOnly(date) {
  const source = date instanceof Date ? date : new Date(date);
  return `${source.getFullYear()}-${String(source.getMonth() + 1).padStart(2, '0')}-${String(source.getDate()).padStart(2, '0')}`;
}

function toTime(dateString) {
  const time = new Date(dateString || 0).getTime();
  return Number.isNaN(time) ? 0 : time;
}

function diffDays(fromDate, toDate) {
  const from = new Date(fromDate);
  const to = new Date(toDate);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return 999;
  return Math.ceil((to - from) / 86400000);
}

function includesAny(value, needles) {
  const text = Array.isArray(value) ? value.join(' ') : String(value || '');
  return needles.some((needle) => text.toLowerCase().includes(String(needle).toLowerCase()));
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
