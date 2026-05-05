/**
 * admin-analytics.js
 * 영주 빈집 플랫폼 - 관리자 빈집 분석
 */

let analyticsHouses = [];
let analyticsHousesLoaded = false;

window.addEventListener('load', function () {
  renderHeader('admin');
  renderFooter();

  requestAnimationFrame(async function () {
    if (!requireAdminLogin()) return;
    if (typeof syncAdminManagementNavigation === 'function') {
      syncAdminManagementNavigation();
    }

    await loadAnalyticsHouses();
    renderAnalyticsPage();
    window.addEventListener('yeongju:platform-data-changed', renderAnalyticsPage);
    window.addEventListener('storage', handleAnalyticsStorageChanged);
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

function handleAnalyticsStorageChanged(event) {
  if ([PLATFORM_REQUESTS_KEY, APPROVED_HOUSES_KEY].includes(event.key)) {
    renderAnalyticsPage();
  }
}

function renderAnalyticsPage() {
  loadAnalyticsHouses().finally(() => {
    renderAnalyticsSummary();
    renderDistrictBarChart();
    renderBuildingTypeChart();
    renderMonthlyTrendChart();
    renderOperationTypeChart();
    renderInsights();
    syncAdminPendingBadge();
  });
}

function getAnalyticsRequests() {
  return typeof getAllRegistrationRequests === 'function'
    ? getAllRegistrationRequests()
    : (Array.isArray(REGISTRATION_REQUESTS) ? [...REGISTRATION_REQUESTS] : []);
}

function getAnalyticsHouses() {
  if (analyticsHousesLoaded) {
    return analyticsHouses;
  }
  return typeof getAllVacantHouses === 'function'
    ? getAllVacantHouses()
    : (Array.isArray(VACANT_HOUSE_LIST) ? [...VACANT_HOUSE_LIST] : []);
}

async function loadAnalyticsHouses() {
  if (analyticsHousesLoaded) return;

  try {
    const response = await fetch(`${getApiBaseUrl()}/houses`);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    analyticsHouses = await response.json();
    analyticsHousesLoaded = true;
  } catch (error) {
    console.error('관리자 분석의 실제 빈집 데이터를 불러오지 못했습니다.', error);
    analyticsHouses = [];
    analyticsHousesLoaded = true;
  }
}

function renderAnalyticsSummary() {
  const container = document.getElementById('analyticsSummaryRow');
  if (!container) return;

  const requests = getAnalyticsRequests();
  const houses = getAnalyticsHouses().filter((house) => house.isApproved);
  const total = requests.length;
  const approved = requests.filter((request) => request.reviewStatus === 'approved').length;
  const pending = requests.filter((request) => ['submitted', 'under_review', 'site_visit', 'approval_pending'].includes(request.reviewStatus)).length;
  const publicHouses = houses.length;
  const approvalRate = total > 0 ? Math.round((approved / total) * 100) : 0;

  const summaries = [
    { value: total, label: '총 신청 건수' },
    { value: `${approvalRate}%`, label: '전체 승인율' },
    { value: approved, label: '승인 완료' },
    { value: pending, label: '검토 대기' },
    { value: publicHouses, label: '공개 중인 빈집' },
  ];

  container.innerHTML = summaries.map((summary) => `
    <div class="analytics-summary-card">
      <div class="analytics-summary-card__value">${summary.value}</div>
      <div class="analytics-summary-card__label">${summary.label}</div>
    </div>
  `).join('');
}

function renderDistrictBarChart() {
  const container = document.getElementById('districtBarChart');
  if (!container) return;

  const requests = getAnalyticsRequests();
  const stats = YEONGJU_DISTRICTS.map((district) => ({
    name: district.name,
    count: requests.filter((request) => request.districtId === district.id).length,
  })).filter((district) => district.count > 0);

  const maxTotal = Math.max(...stats.map((item) => item.count), 1);
  const colors = ['#c9a84c', '#6b7c5e', '#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

  container.innerHTML = `
    <div class="h-bar-chart">
      ${stats.map((stat, index) => `
        <div class="h-bar-item">
          <div class="h-bar-item__label">${stat.name}</div>
          <div class="h-bar-item__bar-wrap">
            <div class="h-bar-item__bar"
              style="width:${Math.round((stat.count / maxTotal) * 100)}%;background-color:${colors[index % colors.length]};">
              ${stat.count}
            </div>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

function renderBuildingTypeChart() {
  const container = document.getElementById('buildingTypeChart');
  if (!container) return;

  const labels = {
    hanok: '한옥',
    farmhouse: '농가주택',
    modern: '근현대 주택',
    apartment: '아파트/빌라',
    other: '기타',
  };

  const counts = {};
  const requests = getAnalyticsRequests();
  requests.forEach((request) => {
    const key = request.buildingType || 'other';
    counts[key] = (counts[key] || 0) + 1;
  });

  const total = requests.length || 1;
  const colors = ['#c9a84c', '#6b7c5e', '#3b82f6', '#22c55e', '#f59e0b'];

  container.innerHTML = `
    <div class="h-bar-chart">
      ${Object.entries(counts).map(([type, count], index) => `
        <div class="h-bar-item">
          <div class="h-bar-item__label">${labels[type] || type}</div>
          <div class="h-bar-item__bar-wrap">
            <div class="h-bar-item__bar"
              style="width:${Math.round((count / total) * 100)}%;background-color:${colors[index % colors.length]};">
              ${count}건 (${Math.round((count / total) * 100)}%)
            </div>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

function renderMonthlyTrendChart() {
  const container = document.getElementById('monthlyTrendChart');
  if (!container) return;

  const requests = getAnalyticsRequests();
  const months = getRecentMonthLabels(6);
  const counts = months.map((monthLabel) => ({
    month: monthLabel,
    count: requests.filter((request) => toMonthLabel(request.submittedAt) === monthLabel).length,
  }));
  const maxCount = Math.max(...counts.map((item) => item.count), 1);

  container.innerHTML = `
    <div style="display:flex;align-items:flex-end;gap:8px;height:160px;padding-bottom:20px;position:relative;">
      ${counts.map((item) => `
        <div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px;height:100%;justify-content:flex-end;">
          <div style="font-size:11px;color:var(--color-text-muted);">${item.count}</div>
          <div style="width:100%;background:linear-gradient(to top, var(--color-primary), var(--color-primary-light));border-radius:4px 4px 0 0;height:${Math.max(12, Math.round((item.count / maxCount) * 120))}px;transition:height 0.6s ease;"></div>
          <div style="font-size:10px;color:var(--color-text-muted);white-space:nowrap;">${item.month}</div>
        </div>
      `).join('')}
    </div>
  `;
}

function renderOperationTypeChart() {
  const container = document.getElementById('operationTypeChart');
  if (!container) return;

  const labels = {
    lodging: '숙박 가능',
    longterm: '장기체류형',
    experience: '체험공간형',
    review_needed: '추가 검토 필요',
  };

  const counts = {};
  const houses = getAnalyticsHouses().filter((house) => house.isApproved);
  houses.forEach((house) => {
    const key = house.operationType || 'review_needed';
    counts[key] = (counts[key] || 0) + 1;
  });

  const total = houses.length || 1;
  const colors = ['#c9a84c', '#6b7c5e', '#22c55e', '#f59e0b'];

  container.innerHTML = `
    <div class="h-bar-chart">
      ${Object.entries(counts).map(([type, count], index) => `
        <div class="h-bar-item">
          <div class="h-bar-item__label">${labels[type] || type}</div>
          <div class="h-bar-item__bar-wrap">
            <div class="h-bar-item__bar"
              style="width:${Math.round((count / total) * 100)}%;background-color:${colors[index % colors.length]};">
              ${count}건
            </div>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

function renderInsights() {
  const container = document.getElementById('analyticsInsights');
  if (!container) return;

  const requests = getAnalyticsRequests();
  const stats = YEONGJU_DISTRICTS.map((district) => ({
    name: district.name,
    count: requests.filter((request) => request.districtId === district.id).length,
  })).sort((a, b) => b.count - a.count);
  const topDistrict = stats[0];
  const approvedCount = requests.filter((request) => request.reviewStatus === 'approved').length;
  const approvalRate = requests.length ? Math.round((approvedCount / requests.length) * 100) : 0;
  const pendingCount = requests.filter((request) => ['submitted', 'under_review', 'site_visit', 'approval_pending'].includes(request.reviewStatus)).length;

  const insights = [
    {
      icon: '📍',
      title: '신청 집중 지역',
      text: `${topDistrict?.name || '풍기읍'}에서 가장 많은 빈집 등록 신청이 접수되었습니다. 현장 검토 인력 우선 배치에 적합한 구간입니다.`,
    },
    {
      icon: '✅',
      title: '승인 처리 현황',
      text: `현재 전체 승인율은 ${approvalRate}%입니다. 검토 대기 ${pendingCount}건을 중심으로 우선순위 조정이 필요합니다.`,
    },
    {
      icon: '🏠',
      title: '주요 건물 유형',
      text: '한옥과 농가주택 비중이 높아 공공 활용 기준과 보수 지원 연계 검토가 중요합니다.',
    },
    {
      icon: '📈',
      title: '최근 추이',
      text: '최근 6개월 기준으로 신청 흐름이 유지되고 있어 지역별 승인 전환율 관리가 핵심입니다.',
    },
  ];

  container.innerHTML = insights.map((insight) => `
    <div class="insight-card">
      <div class="insight-card__title">${insight.icon} ${insight.title}</div>
      <p class="insight-card__text">${insight.text}</p>
    </div>
  `).join('');
}

function getRecentMonthLabels(length) {
  const labels = [];
  const base = new Date();
  base.setDate(1);

  for (let index = length - 1; index >= 0; index -= 1) {
    const date = new Date(base);
    date.setMonth(base.getMonth() - index);
    labels.push(`${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}`);
  }

  return labels;
}

function toMonthLabel(dateValue) {
  if (!dateValue) return '';
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function exportToExcel() {
  showToast('리포트 내보내기는 백엔드 연동 후 사용할 수 있습니다. (데모)', 'info');
}
