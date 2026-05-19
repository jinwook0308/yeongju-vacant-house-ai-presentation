/**
 * owner-requests.js
 * 영주시 공공형 빈집 활용 플랫폼 - 소유자 신청 내역 페이지 스크립트
 */

let currentStatusFilter = 'all';

window.addEventListener('load', function () {
  renderHeader('');
  renderFooter();

  if (!requireLogin()) return;

  setupStatusFilterTabs();
  renderRequestsList('all');
  setupModalClose('requestDetailModal');
});

/**
 * 상태 필터 탭을 설정합니다.
 */
function setupStatusFilterTabs() {
  document.querySelectorAll('.status-filter-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.status-filter-tab').forEach(t => t.classList.remove('is-active'));
      tab.classList.add('is-active');
      currentStatusFilter = tab.dataset.status;
      renderRequestsList(currentStatusFilter);
    });
  });
}

/**
 * 신청 내역 목록을 렌더링합니다.
 * @param {string} statusFilter
 */
function renderRequestsList(statusFilter) {
  const container = document.getElementById('requestsList');
  if (!container) return;

  let requests = getOwnerVisibleRequests();
  if (statusFilter !== 'all') {
    requests = requests.filter(r => r.reviewStatus === statusFilter);
  }

  if (requests.length === 0) {
    container.innerHTML = `
      <div style="text-align:center;padding:60px 20px;color:var(--color-text-muted);">
        <div style="font-size:3rem;margin-bottom:16px;">📋</div>
        <p>해당 상태의 신청 내역이 없습니다.</p>
        <a href="owner-register.html" class="btn btn--owner-positive" style="margin-top:16px;">빈집 등록 신청하기</a>
      </div>
    `;
    return;
  }

  const statusLabels = {
    submitted:    { label: '신청 완료',  cls: 'badge--submitted' },
    under_review: { label: '검토 중',    cls: 'badge--pending' },
    site_visit:   { label: '현장 방문',  cls: 'badge--pending' },
    approved:     { label: '승인 완료',  cls: 'badge--approved' },
    rejected:     { label: '반려',       cls: 'badge--rejected' },
  };

  const buildingTypeLabels = {
    hanok: '한옥', farmhouse: '농가주택', modern: '근현대 주택',
    apartment: '아파트/빌라', other: '기타',
  };

  container.innerHTML = requests.map(req => {
    const status = statusLabels[req.reviewStatus] || { label: req.reviewStatus, cls: '' };
    return `
      <div class="request-card" onclick="showRequestDetail('${req.id}')">
        <div class="request-card__header">
          <div>
            <div class="request-card__title">📍 영주시 ${req.districtName} · ${req.address}</div>
            <div class="request-card__address">${req.ownerName} 소유</div>
          </div>
          <span class="badge ${status.cls}">${status.label}</span>
        </div>
        <div class="request-card__body">
          <div class="request-card__meta-item">
            <span class="request-card__meta-label">건물 유형</span>
            <span class="request-card__meta-value">${buildingTypeLabels[req.buildingType] || req.buildingType}</span>
          </div>
          <div class="request-card__meta-item">
            <span class="request-card__meta-label">희망 활용</span>
            <span class="request-card__meta-value">${req.usageTypes.join(', ')}</span>
          </div>
          <div class="request-card__meta-item">
            <span class="request-card__meta-label">건물 상태</span>
            <span class="request-card__meta-value">${req.buildingCondition}</span>
          </div>
        </div>
        <div class="request-card__footer">
          <span class="request-card__date">신청일: ${formatDateShort(req.submittedAt)}</span>
          <span style="font-size:var(--font-size-xs);color:var(--color-primary);">상세 보기 →</span>
        </div>
      </div>
    `;
  }).join('');
}

/**
 * 신청 상세 모달을 표시합니다.
 * @param {string} requestId
 */
function showRequestDetail(requestId) {
  const req = getOwnerVisibleRequests().find(r => r.id === requestId);
  if (!req) return;

  const content = document.getElementById('requestDetailContent');
  if (!content) return;

  const statusLabels = {
    submitted:    '신청 완료',
    under_review: '검토 중',
    site_visit:   '현장 방문 예정',
    approved:     '승인 완료',
    rejected:     '반려',
  };

  const statusSteps = ['submitted', 'under_review', 'site_visit', 'approved'];
  const currentStatusIdx = statusSteps.indexOf(req.reviewStatus);
  const rejectedReviewHtml = req.reviewStatus === 'rejected' && req.reviewComment ? `
    <div class="request-detail-rejected-comment">
      <strong>검토의견</strong>
      <p>${req.reviewComment}</p>
    </div>
  ` : '';

  content.innerHTML = `
    <div class="request-detail-section">
      <div class="request-detail-section__title">신청 상태</div>
      <div class="status-timeline">
        ${statusSteps.map((step, idx) => `
          <div class="status-timeline-item ${idx < currentStatusIdx ? 'is-done' : ''} ${idx === currentStatusIdx ? 'is-current' : ''}">
            <div class="status-timeline-item__dot"></div>
            <div class="status-timeline-item__label">${statusLabels[step] || step}</div>
          </div>
        `).join('')}
        ${req.reviewStatus === 'rejected' ? `
          <div class="status-timeline-item is-current">
            <div class="status-timeline-item__dot" style="background:var(--color-danger);"></div>
            <div class="status-timeline-item__label">반려 처리</div>
          </div>
        ` : ''}
      </div>
      ${rejectedReviewHtml}
    </div>

    <div class="request-detail-section">
      <div class="request-detail-section__title">빈집 위치</div>
      <div class="request-detail-grid">
        <div class="request-detail-item">
          <div class="request-detail-item__label">읍면동</div>
          <div class="request-detail-item__value">영주시 ${req.districtName}</div>
        </div>
        <div class="request-detail-item">
          <div class="request-detail-item__label">상세 주소</div>
          <div class="request-detail-item__value">${req.address}</div>
        </div>
      </div>
    </div>

    <div class="request-detail-section">
      <div class="request-detail-section__title">건물 정보</div>
      <div class="request-detail-grid">
        <div class="request-detail-item">
          <div class="request-detail-item__label">건물 유형</div>
          <div class="request-detail-item__value">${req.buildingType}</div>
        </div>
        <div class="request-detail-item">
          <div class="request-detail-item__label">건물 상태</div>
          <div class="request-detail-item__value">${req.buildingCondition}</div>
        </div>
        <div class="request-detail-item">
          <div class="request-detail-item__label">희망 활용</div>
          <div class="request-detail-item__value">${req.usageTypes.join(', ')}</div>
        </div>
        <div class="request-detail-item">
          <div class="request-detail-item__label">신청일</div>
          <div class="request-detail-item__value">${formatDateShort(req.submittedAt)}</div>
        </div>
      </div>
    </div>

    ${req.reviewComment && req.reviewStatus !== 'rejected' ? `
      <div class="request-detail-section">
        <div class="request-detail-section__title">검토 의견</div>
        <div style="background:var(--color-bg-section);border-radius:var(--border-radius-sm);padding:var(--spacing-md);font-size:var(--font-size-sm);color:var(--color-text-secondary);">
          ${req.reviewComment}
        </div>
      </div>
    ` : ''}
  `;

  openModal('requestDetailModal');
}

function getOwnerVisibleRequests() {
  const user = getCurrentUser();
  const requests = typeof getAllRegistrationRequests === 'function'
    ? getAllRegistrationRequests()
    : REGISTRATION_REQUESTS;
  if (!user) return [];
  return requests.filter(req =>
    typeof matchesOwnerIdentity === 'function'
      ? matchesOwnerIdentity(req, user)
      : (
        req.ownerUserId === user.id ||
        req.ownerUserId === user.email ||
        req.ownerName === user.name
      )
  );
}
