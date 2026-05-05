/**
 * admin-review-list.js
 * 영주 빈집 플랫폼 - 관리자 신청 검토 목록
 */

let currentFilters = { keyword: '', district: '', status: '', buildingType: '' };
let currentSort = 'latest';

window.addEventListener('load', function () {
  renderHeader('admin');
  renderFooter();

  requestAnimationFrame(function () {
    if (!requireAdminLogin()) return;
    if (typeof syncAdminManagementNavigation === 'function') {
      syncAdminManagementNavigation();
    }

    populateDistrictFilter();
    hydrateFiltersFromUrl();
    renderReviewList();
    setupFilterEvents();

    window.addEventListener('yeongju:platform-data-changed', handleReviewDataChanged);
    window.addEventListener('storage', handleReviewStorageChanged);
  });
});

function requireAdminLogin() {
  const user = getCurrentUser();
  if (!user || user.role !== 'admin') {
    window.location.href = '../auth/login.html?role=admin';
    return false;
  }
  return true;
}

function hydrateFiltersFromUrl() {
  const params = getUrlParams();
  if (params.district) {
    currentFilters.district = params.district;
    const districtEl = document.getElementById('filterDistrict');
    if (districtEl) districtEl.value = params.district;
  }

  if (params.status) {
    currentFilters.status = params.status;
    const statusEl = document.getElementById('filterStatus');
    if (statusEl) statusEl.value = params.status;
  }
}

function handleReviewDataChanged(event) {
  const type = String(event?.detail?.type || '');
  if (type.includes('registration-request')) {
    renderReviewList();
  }
}

function handleReviewStorageChanged(event) {
  if (event.key === PLATFORM_REQUESTS_KEY) {
    renderReviewList();
  }
}

function populateDistrictFilter() {
  const select = document.getElementById('filterDistrict');
  if (!select) return;

  YEONGJU_DISTRICTS.forEach((district) => {
    const option = document.createElement('option');
    option.value = district.id;
    option.textContent = `영주시 ${district.name}`;
    select.appendChild(option);
  });
}

function setupFilterEvents() {
  document.getElementById('filterApplyBtn')?.addEventListener('click', applyFilters);
  document.getElementById('filterResetBtn')?.addEventListener('click', resetFilters);
  document.getElementById('reviewSortSelect')?.addEventListener('change', function (event) {
    currentSort = event.target.value;
    renderReviewList();
  });
  document.getElementById('filterKeyword')?.addEventListener('keydown', function (event) {
    if (event.key === 'Enter') applyFilters();
  });
}

function applyFilters() {
  currentFilters.keyword = document.getElementById('filterKeyword')?.value.trim() || '';
  currentFilters.district = document.getElementById('filterDistrict')?.value || '';
  currentFilters.status = document.getElementById('filterStatus')?.value || '';
  currentFilters.buildingType = document.getElementById('filterBuildingType')?.value || '';
  renderReviewList();
}

function resetFilters() {
  currentFilters = { keyword: '', district: '', status: '', buildingType: '' };
  currentSort = 'latest';

  document.getElementById('filterKeyword').value = '';
  document.getElementById('filterDistrict').value = '';
  document.getElementById('filterStatus').value = '';
  document.getElementById('filterBuildingType').value = '';
  document.getElementById('reviewSortSelect').value = 'latest';

  renderReviewList();
}

function renderReviewList() {
  const activeContainer = document.getElementById('reviewListTable');
  const activeCountEl = document.getElementById('reviewListCount');
  const rejectedContainer = document.getElementById('rejectedListTable');
  const rejectedCountEl = document.getElementById('rejectedListCount');
  if (!activeContainer || !rejectedContainer) return;

  const requests = getAllRegistrationRequests();
  const activeRequests = filterAndSortRequests(getActiveRegistrationRequests(requests), false);
  const rejectedRequests = filterAndSortRequests(getRejectedRegistrationRequests(requests), true);

  if (activeCountEl) activeCountEl.textContent = `총 ${activeRequests.length}건`;
  if (rejectedCountEl) rejectedCountEl.textContent = `총 ${rejectedRequests.length}건`;

  activeContainer.innerHTML = renderActiveRequestsTable(activeRequests);
  rejectedContainer.innerHTML = renderRejectedRequestsTable(rejectedRequests);
  syncAdminPendingBadge();
}

function filterAndSortRequests(requests, rejectedOnly) {
  let filtered = Array.isArray(requests) ? [...requests] : [];

  if (currentFilters.keyword) {
    const keyword = currentFilters.keyword.toLowerCase();
    filtered = filtered.filter((request) =>
      String(request.ownerName || '').toLowerCase().includes(keyword)
      || String(request.address || '').toLowerCase().includes(keyword)
      || String(request.districtName || '').toLowerCase().includes(keyword)
      || String(request.assignedReviewerName || '').toLowerCase().includes(keyword)
    );
  }

  if (currentFilters.district) {
    filtered = filtered.filter((request) => request.districtId === currentFilters.district);
  }

  if (currentFilters.buildingType) {
    filtered = filtered.filter((request) => request.buildingType === currentFilters.buildingType);
  }

  if (currentFilters.status) {
    if (currentFilters.status === 'rejected') {
      filtered = rejectedOnly ? filtered : [];
    } else {
      filtered = rejectedOnly ? [] : filtered.filter((request) => request.reviewStatus === currentFilters.status);
    }
  }

  if (currentSort === 'oldest') {
    filtered.sort((a, b) => new Date(a.submittedAt || 0) - new Date(b.submittedAt || 0));
  } else if (currentSort === 'district') {
    filtered.sort((a, b) => String(a.districtName || '').localeCompare(String(b.districtName || ''), 'ko'));
  } else {
    filtered.sort((a, b) => new Date(b.submittedAt || 0) - new Date(a.submittedAt || 0));
  }

  return filtered;
}

function renderActiveRequestsTable(requests) {
  if (!requests.length) {
    return `
      <div class="review-empty-state">
        <div class="review-empty-state__icon">검토</div>
        <p>현재 검토 중인 신청 목록이 없습니다.</p>
      </div>
    `;
  }

  return `
    <table class="admin-table">
      <thead>
        <tr>
          <th>우선순위</th>
          <th>소유자</th>
          <th>영주시 지역</th>
          <th>건물 유형</th>
          <th>신청 상태</th>
          <th>신청일</th>
          <th>담당 작업</th>
        </tr>
      </thead>
      <tbody>
        ${requests.map((request) => renderActiveRequestRow(request)).join('')}
      </tbody>
    </table>
  `;
}

function renderRejectedRequestsTable(requests) {
  if (!requests.length) {
    return `
      <div class="review-empty-state review-empty-state--muted">
        <div class="review-empty-state__icon">반려</div>
        <p>반려 처리된 신청이 없습니다.</p>
      </div>
    `;
  }

  return `
    <table class="admin-table">
      <thead>
        <tr>
          <th>소유자</th>
          <th>영주시 지역</th>
          <th>건물 유형</th>
          <th>반려일</th>
          <th>검토 의견</th>
          <th>작업</th>
        </tr>
      </thead>
      <tbody>
        ${requests.map((request) => renderRejectedRequestRow(request)).join('')}
      </tbody>
    </table>
  `;
}

function renderActiveRequestRow(request) {
  const user = getCurrentUser();
  const priority = getPriorityMeta(request);
  const status = getStatusMeta(request.reviewStatus);
  const assignmentText = getAssignmentText(request, user);
  const actionHtml = getRowActionHtml(request, user);

  return `
    <tr>
      <td>
        <span class="priority-indicator ${priority.className}">${priority.label}</span>
      </td>
      <td class="review-owner-cell">
        <div>${escapeHtml(request.ownerName || '-')}</div>
        <div class="review-owner-meta">${escapeHtml(assignmentText)}</div>
      </td>
      <td>
        <a href="admin-district.html?district=${encodeURIComponent(request.districtId || '')}" class="review-district-link">
          영주 ${escapeHtml(request.districtName || '-')}
        </a>
      </td>
      <td>${escapeHtml(getBuildingTypeLabel(request.buildingType))}</td>
      <td><span class="badge ${status.className}">${status.label}</span></td>
      <td>${formatDateShort(request.submittedAt)}</td>
      <td>
        <div class="review-row-actions">
          ${actionHtml}
        </div>
      </td>
    </tr>
  `;
}

function renderRejectedRequestRow(request) {
  const rejectedAt = request.updatedAt || request.submittedAt;
  const reviewComment = String(request.reviewComment || request.rejectionReason || '등록 기준에 맞지 않아 반려했습니다.');

  return `
    <tr>
      <td class="review-owner-cell">${escapeHtml(request.ownerName || '-')}</td>
      <td>영주 ${escapeHtml(request.districtName || '-')}</td>
      <td>${escapeHtml(getBuildingTypeLabel(request.buildingType))}</td>
      <td>${formatDateShort(rejectedAt)}</td>
      <td class="review-comment-cell">${escapeHtml(reviewComment)}</td>
      <td>
        <div class="review-row-actions">
          <a href="admin-review-detail.html?id=${encodeURIComponent(request.id)}" class="btn btn--ghost btn--sm">상세</a>
        </div>
      </td>
    </tr>
  `;
}

function getRowActionHtml(request, user) {
  const encodedId = encodeURIComponent(request.id);
  const primaryLabel = canApproveReviewRequest(request, user)
    ? '승인 검토'
    : (isRequestAssignedToUser(request, user) ? '검토 계속' : '상세');
  const detailLink = `<a href="admin-review-detail.html?id=${encodedId}" class="btn btn--primary btn--sm">${primaryLabel}</a>`;

  if (isReviewRequestLockedForUser(request, user)) {
    return `
      ${detailLink}
      <span class="review-lock-badge">읽기 전용</span>
    `;
  }

  if (canStartReviewRequest(request, user)) {
    return `
      ${detailLink}
      <button class="btn btn--ghost btn--sm" onclick="startReviewRequestFlow('${escapeAttr(request.id)}')">검토 시작</button>
    `;
  }

  if (request.assignedReviewerId && hasAdminPermission('review_manage', user) && !isRequestAssignedToUser(request, user)) {
    return `
      ${detailLink}
      <button class="btn btn--ghost btn--sm" onclick="unlockReviewRequestFlow('${escapeAttr(request.id)}')">잠금 해제</button>
    `;
  }

  return detailLink;
}

function getAssignmentText(request, user) {
  if (request.reviewStatus === 'approval_pending') {
    const reviewerName = request.reviewCompletedByName || request.assignedReviewerName || '검토 담당자';
    const reviewerRole = getAdminRoleLabel(request.reviewCompletedByRole || request.assignedReviewerRole || 'reviewer');
    return `승인 대기 · ${reviewerName} · ${reviewerRole}`;
  }

  if (!request.assignedReviewerId) {
    return hasAdminPermission('review_start', user) ? '미배정' : '배정 대기';
  }

  if (isRequestAssignedToUser(request, user)) {
    return `내 담당 · ${getAdminRoleLabel(user)}`;
  }

  const assignedLabel = getAdminRoleLabel(request.assignedReviewerRole || 'reviewer');
  return `${request.assignedReviewerName || '담당자'} · ${assignedLabel}`;
}

function getPriorityMeta(request) {
  if (request.reviewStatus === 'submitted') {
    return { label: '높음', className: 'priority-indicator--high' };
  }
  if (['under_review', 'site_visit', 'approval_pending'].includes(request.reviewStatus)) {
    return { label: '보통', className: 'priority-indicator--medium' };
  }
  return { label: '낮음', className: 'priority-indicator--low' };
}

function getStatusMeta(status) {
  const map = {
    submitted: { label: '신청 완료', className: 'badge--submitted' },
    under_review: { label: '검토 중', className: 'badge--pending' },
    site_visit: { label: '현장 방문', className: 'badge--pending' },
    approval_pending: { label: '승인 대기', className: 'badge--pending' },
    rejected: { label: '반려', className: 'badge--rejected' },
  };
  return map[status] || { label: status || '확인 필요', className: '' };
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

function startReviewRequestFlow(requestId) {
  const request = getAllRegistrationRequests().find((item) => String(item.id) === String(requestId));
  if (!request) return;

  const confirmed = confirm('이 신청을 담당하시겠습니까?\n담당자로 배정되면 다른 사용자는 읽기 전용으로 전환됩니다.');
  if (!confirmed) return;

  try {
    startReviewRequest(requestId);
    showToast('검토 시작과 담당자 배정이 완료되었습니다.', 'success');
    renderReviewList();
  } catch (error) {
    const message = error?.code === 'VERSION_MISMATCH'
      ? '이미 다른 담당자가 먼저 처리했습니다.'
      : (error?.message || '검토 시작 처리 중 오류가 발생했습니다.');
    showToast(message, 'warning');
    renderReviewList();
  }
}

function unlockReviewRequestFlow(requestId) {
  const confirmed = confirm('이 신청의 담당자 잠금을 해제하시겠습니까?\n잠금 해제 후 다시 미배정 상태가 됩니다.');
  if (!confirmed) return;

  try {
    unlockReviewRequest(requestId);
    showToast('담당자 잠금이 해제되었습니다.', 'success');
    renderReviewList();
  } catch (error) {
    showToast(error?.message || '잠금 해제 중 오류가 발생했습니다.', 'warning');
  }
}

function exportToExcel() {
  showToast('엑셀 내보내기는 백엔드 연동 후 사용할 수 있습니다. (데모)', 'info');
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttr(value) {
  return escapeHtml(value);
}
