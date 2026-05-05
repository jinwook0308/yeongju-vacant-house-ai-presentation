/**
 * admin-district.js
 * 영주 빈집 플랫폼 - 관리자 지역별 현황
 */

let selectedDistrictId = null;
let adminDistrictHouses = [];
let adminDistrictHousesLoaded = false;

window.addEventListener('load', function () {
  renderHeader('admin');
  renderFooter();

  requestAnimationFrame(async function () {
    if (!requireAdminLogin()) return;
    if (typeof syncAdminManagementNavigation === 'function') {
      syncAdminManagementNavigation();
    }

    await loadAdminDistrictHouses();
    renderDistrictOverviewGrid();
    renderAllDistrictStatsTable();
    syncAdminPendingBadge();

    const params = getUrlParams();
    if (params.district) {
      drillDownDistrict(params.district);
    }

    window.addEventListener('yeongju:platform-data-changed', refreshDistrictPage);
    window.addEventListener('storage', handleDistrictStorageChanged);
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

function handleDistrictStorageChanged(event) {
  if ([PLATFORM_REQUESTS_KEY, APPROVED_HOUSES_KEY].includes(event.key)) {
    refreshDistrictPage();
  }
}

function refreshDistrictPage() {
  loadAdminDistrictHouses().finally(() => {
    renderDistrictOverviewGrid();
    renderAllDistrictStatsTable();
    syncAdminPendingBadge();

    if (selectedDistrictId) {
      drillDownDistrict(selectedDistrictId, false);
    }
  });
}

function getDistrictRequestsSource() {
  return typeof getAllRegistrationRequests === 'function'
    ? getAllRegistrationRequests()
    : (Array.isArray(REGISTRATION_REQUESTS) ? [...REGISTRATION_REQUESTS] : []);
}

function getDistrictHousesSource() {
  if (adminDistrictHousesLoaded) {
    return adminDistrictHouses;
  }
  return typeof getAllVacantHouses === 'function'
    ? getAllVacantHouses()
    : (Array.isArray(VACANT_HOUSE_LIST) ? [...VACANT_HOUSE_LIST] : []);
}

async function loadAdminDistrictHouses() {
  if (adminDistrictHousesLoaded) return;

  try {
    const response = await fetch(`${getApiBaseUrl()}/houses`);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    adminDistrictHouses = await response.json();
    adminDistrictHousesLoaded = true;
  } catch (error) {
    console.error('관리자 지역별 현황의 실제 빈집 데이터를 불러오지 못했습니다.', error);
    adminDistrictHouses = [];
    adminDistrictHousesLoaded = true;
  }
}

function getDistrictStatsData() {
  const requests = getDistrictRequestsSource();
  const houses = getDistrictHousesSource();

  return YEONGJU_DISTRICTS.map((district) => {
    const districtRequests = requests.filter((request) => request.districtId === district.id);
    const districtHouses = houses.filter((house) => house.districtId === district.id && house.isApproved);

    return {
      districtId: district.id,
      districtName: district.name,
      total: districtRequests.length,
      pending: districtRequests.filter((request) => ['submitted', 'under_review', 'site_visit', 'approval_pending'].includes(request.reviewStatus)).length,
      approved: districtRequests.filter((request) => request.reviewStatus === 'approved').length,
      rejected: districtRequests.filter((request) => request.reviewStatus === 'rejected').length,
      publicHouses: districtHouses.length,
    };
  });
}

function renderDistrictOverviewGrid() {
  const grid = document.getElementById('districtOverviewGrid');
  if (!grid) return;

  const stats = getDistrictStatsData();

  grid.innerHTML = stats.map((stat) => `
    <div class="district-card ${selectedDistrictId === stat.districtId ? 'is-selected' : ''}"
         id="districtCard_${stat.districtId}"
         onclick="drillDownDistrict('${stat.districtId}')"
         title="${stat.districtName} 상세 보기">
      <div class="district-card__name">📍 ${stat.districtName}</div>
      <div class="district-card__stats">
        <div class="district-card__stat-row">
          <span class="district-card__stat-label">총 신청</span>
          <span class="district-card__stat-value district-card__stat-value--total">${stat.total}건</span>
        </div>
        <div class="district-card__stat-row">
          <span class="district-card__stat-label">승인 완료</span>
          <span class="district-card__stat-value district-card__stat-value--approved">${stat.approved}건</span>
        </div>
        <div class="district-card__stat-row">
          <span class="district-card__stat-label">검토 대기</span>
          <span class="district-card__stat-value district-card__stat-value--pending">${stat.pending}건</span>
        </div>
      </div>
      <div class="district-card__click-hint">클릭하여 상세 보기 →</div>
    </div>
  `).join('');
}

function drillDownDistrict(districtId, scrollIntoView = true) {
  selectedDistrictId = districtId;

  document.querySelectorAll('.district-card').forEach((card) => {
    card.classList.toggle('is-selected', card.id === `districtCard_${districtId}`);
  });

  const district = YEONGJU_DISTRICTS.find((item) => item.id === districtId);
  const stat = getDistrictStatsData().find((item) => item.districtId === districtId);
  if (!district || !stat) return;

  const section = document.getElementById('districtDrilldownSection');
  if (section) section.style.display = 'block';

  const header = document.getElementById('districtDrilldownHeader');
  if (header) {
    header.innerHTML = `
      <div>
        <div class="district-drilldown-header__title">📍 영주시 ${district.name} 상세 현황</div>
        <div class="district-drilldown-header__subtitle">${district.description || '영주시 행정구역 기준 현황입니다.'}</div>
      </div>
      <button class="btn btn--ghost btn--sm" style="color:rgba(255,255,255,0.7);border-color:rgba(255,255,255,0.2);" onclick="closeDrilldown()">닫기</button>
    `;
  }

  const kpiRow = document.getElementById('districtKpiRow');
  if (kpiRow) {
    const kpis = [
      { label: '총 신청 건수', value: stat.total, color: 'var(--color-primary)' },
      { label: '검토 대기', value: stat.pending, color: 'var(--color-warning)' },
      { label: '승인 완료', value: stat.approved, color: 'var(--color-success)' },
      { label: '공개 빈집 수', value: stat.publicHouses, color: 'var(--color-secondary)' },
    ];

    kpiRow.innerHTML = kpis.map((kpi) => `
      <div class="district-kpi-item">
        <div class="district-kpi-item__value" style="color:${kpi.color};">${kpi.value}</div>
        <div class="district-kpi-item__label">${kpi.label}</div>
      </div>
    `).join('');
  }

  const requestsTitle = document.getElementById('districtRequestsTitle');
  if (requestsTitle) {
    requestsTitle.textContent = `${district.name} 신청 목록`;
  }

  const filterLink = document.getElementById('districtFilterLink');
  if (filterLink) {
    filterLink.href = `admin-review-list.html?district=${districtId}`;
  }

  renderDistrictRequests(districtId);
  renderDistrictApprovedHouses(districtId);
  setUrlParams({ district: districtId }, true);

  if (scrollIntoView) {
    section?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

function renderDistrictRequests(districtId) {
  const container = document.getElementById('districtRequestsTable');
  if (!container) return;

  const requests = getDistrictRequestsSource()
    .filter((request) => request.districtId === districtId)
    .filter((request) => request.reviewStatus !== 'approved')
    .sort((a, b) => new Date(b.submittedAt || 0) - new Date(a.submittedAt || 0));

  if (!requests.length) {
    container.innerHTML = '<p style="padding:20px;color:var(--color-text-muted);text-align:center;">해당 지역의 신청 내역이 없습니다.</p>';
    return;
  }

  const statusMap = {
    submitted: { label: '신청 완료', cls: 'badge--submitted' },
    under_review: { label: '검토 중', cls: 'badge--pending' },
    site_visit: { label: '현장 방문', cls: 'badge--pending' },
    approval_pending: { label: '승인 대기', cls: 'badge--pending' },
    rejected: { label: '반려', cls: 'badge--rejected' },
  };

  container.innerHTML = `
    <table class="admin-table">
      <thead>
        <tr>
          <th>소유자</th>
          <th>주소</th>
          <th>건물 유형</th>
          <th>상태</th>
          <th>신청일</th>
          <th>작업</th>
        </tr>
      </thead>
      <tbody>
        ${requests.map((request) => {
          const status = statusMap[request.reviewStatus] || { label: request.reviewStatus || '확인 필요', cls: '' };
          return `
            <tr>
              <td style="font-weight:600;color:var(--color-text-primary);">${escapeHtml(request.ownerName || '-')}</td>
              <td>${escapeHtml(request.address || '-')}</td>
              <td>${escapeHtml(getDistrictBuildingTypeLabel(request.buildingType))}</td>
              <td><span class="badge ${status.cls}">${status.label}</span></td>
              <td>${formatDateShort(request.submittedAt)}</td>
              <td><a href="admin-review-detail.html?id=${encodeURIComponent(request.id)}" class="btn btn--primary btn--sm">검토</a></td>
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>
  `;
}

function renderDistrictApprovedHouses(districtId) {
  const container = document.getElementById('districtApprovedHouses');
  if (!container) return;

  const houses = getDistrictHousesSource()
    .filter((house) => house.districtId === districtId && house.isApproved)
    .sort((a, b) => new Date(b.approvedAt || 0) - new Date(a.approvedAt || 0));

  if (!houses.length) {
    container.innerHTML = '<p style="padding:20px;color:var(--color-text-muted);text-align:center;">해당 지역의 공개 승인 빈집이 없습니다.</p>';
    return;
  }

  container.innerHTML = `
    <table class="admin-table">
      <thead>
        <tr>
          <th>빈집명</th>
          <th>운영 유형</th>
          <th>상태 등급</th>
          <th>최대 인원</th>
          <th>승인일</th>
          <th>공개 상태</th>
        </tr>
      </thead>
      <tbody>
        ${houses.map((house) => `
          <tr>
            <td style="font-weight:600;color:var(--color-text-primary);">
              <a href="../guest/guest-detail.html?id=${encodeURIComponent(house.id)}" target="_blank" style="color:var(--color-primary);text-decoration:none;">
                ${escapeHtml(house.name || '승인 빈집')}
              </a>
            </td>
            <td>${getOperationTypeBadge(house.operationType)}</td>
            <td>${getConditionGradeBadge(house.conditionGrade)}</td>
            <td>${Number(house.maxCapacity || 0)}명</td>
            <td>${formatDateShort(house.approvedAt || house.registeredAt)}</td>
            <td><span class="badge badge--public">공개 중</span></td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

function closeDrilldown() {
  selectedDistrictId = null;
  document.getElementById('districtDrilldownSection').style.display = 'none';
  document.querySelectorAll('.district-card').forEach((card) => card.classList.remove('is-selected'));
  setUrlParams({ district: null }, true);
}

function renderAllDistrictStatsTable() {
  const container = document.getElementById('allDistrictStatsTable');
  if (!container) return;

  const stats = getDistrictStatsData();

  container.innerHTML = `
    <table class="admin-table">
      <thead>
        <tr>
          <th>읍면동</th>
          <th>총 신청</th>
          <th>검토 대기</th>
          <th>승인 완료</th>
          <th>반려</th>
          <th>공개 빈집</th>
          <th>승인율</th>
          <th>상세</th>
        </tr>
      </thead>
      <tbody>
        ${stats.map((stat) => {
          const approvalRate = stat.total > 0 ? Math.round((stat.approved / stat.total) * 100) : 0;
          return `
            <tr>
              <td style="font-weight:600;color:var(--color-text-primary);">📍 ${stat.districtName}</td>
              <td>${stat.total}</td>
              <td><span style="color:var(--color-warning);font-weight:600;">${stat.pending}</span></td>
              <td><span style="color:var(--color-success);font-weight:600;">${stat.approved}</span></td>
              <td><span style="color:var(--color-danger);">${stat.rejected}</span></td>
              <td>${stat.publicHouses}</td>
              <td>
                <div style="display:flex;align-items:center;gap:8px;">
                  <div style="flex:1;height:6px;background:var(--color-bg-section);border-radius:3px;overflow:hidden;">
                    <div style="width:${approvalRate}%;height:100%;background:var(--color-success);border-radius:3px;"></div>
                  </div>
                  <span style="font-size:var(--font-size-xs);color:var(--color-text-muted);">${approvalRate}%</span>
                </div>
              </td>
              <td><button class="btn btn--ghost btn--sm" onclick="drillDownDistrict('${stat.districtId}')">상세 보기</button></td>
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>
  `;
}

function getDistrictBuildingTypeLabel(type) {
  const labels = {
    hanok: '한옥',
    farmhouse: '농가주택',
    modern: '근현대 주택',
    apartment: '아파트/빌라',
    other: '기타',
  };
  return labels[type] || type || '-';
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
