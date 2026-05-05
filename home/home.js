/**
 * home.js
 * 영주시 공공형 빈집 활용 플랫폼 - 메인 페이지 스크립트
 * 홈의 승인 빈집 미리보기만 Python API와 연결합니다.
 */

const API_BASE_URL = typeof getApiBaseUrl === 'function' ? getApiBaseUrl() : 'http://localhost:8000';

window.addEventListener('load', function () {
  renderHeader('home');
  renderFooter();

  setupHeroSeasonSlider();
  setupInteractiveCards();
  syncRoleCardsForLoginState();
  loadHomeStats();
  loadApprovedHousesPreview();
  renderDistrictGrid();
  setupScrollAnimation('.animate-on-scroll');

  window.addEventListener('yeongju:platform-data-changed', () => {
    loadHomeStats();
    loadApprovedHousesPreview();
  });
});

window.addEventListener('yeongju:auth-changed', () => {
  syncRoleCardsForLoginState();
});

let latestHomeHouseDataset = [];

function setupInteractiveCards() {
  document.querySelectorAll('[data-link-href]').forEach((card) => {
    if (card.dataset.linkBound === 'true') return;
    card.dataset.linkBound = 'true';

    const navigate = () => {
      const href = card.dataset.linkHref;
      if (!href) return;
      window.location.href = href;
    };

    card.addEventListener('click', (event) => {
      if (event.target.closest('a, button, input, select, textarea')) return;
      navigate();
    });

    card.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      navigate();
    });
  });
}

function syncRoleCardsForLoginState() {
  const user = getCurrentUser();
  const ctaMap = {
    guest: { href: '../guest/guest-mypage.html', label: '내 마이페이지로 이동' },
    owner: { href: '../owner/owner-mypage.html', label: '소유자 페이지로 이동' },
    admin: { href: '../admin/admin-dashboard.html', label: '관리자 대시보드로 이동' },
  };

  document.querySelectorAll('[data-role-cta]').forEach((button) => {
    const role = button.dataset.roleCta;
    const defaultHref = button.dataset.defaultHref || button.getAttribute('href') || '#';
    const defaultLabel = button.dataset.defaultLabel || button.textContent.trim();

    if (!user) {
      button.hidden = false;
      button.setAttribute('href', defaultHref);
      button.textContent = defaultLabel;
      return;
    }

    if (user.role === role && ctaMap[role]) {
      button.hidden = false;
      button.setAttribute('href', ctaMap[role].href);
      button.textContent = ctaMap[role].label;
      return;
    }

    button.hidden = true;
  });
}

function setupHeroSeasonSlider() {
  const slides = Array.from(document.querySelectorAll('.hero-banner__slide'));
  if (slides.length <= 1) return;

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    slides.forEach((slide, index) => {
      slide.classList.toggle('is-active', index === 0);
    });
    return;
  }

  let activeIndex = slides.findIndex(slide => slide.classList.contains('is-active'));
  activeIndex = activeIndex >= 0 ? activeIndex : 0;

  const showSlide = (nextIndex) => {
    slides.forEach((slide, index) => {
      slide.classList.toggle('is-active', index === nextIndex);
    });
  };

  showSlide(activeIndex);

  window.setInterval(() => {
    activeIndex = (activeIndex + 1) % slides.length;
    showSlide(activeIndex);
  }, 5000);
}

function setMetricText(id, value, suffix = '') {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = `${value}${suffix}`;
}

function setHomeMetricsUnavailable() {
  ['heroMetricRegistered', 'heroMetricApproved', 'heroMetricDistricts', 'heroMetricVendors'].forEach((id) => {
    setMetricText(id, '-');
  });
}

function updateHomeMetrics(stats) {
  if (!stats) {
    setHomeMetricsUnavailable();
    return;
  }

  const registeredCount = Number(stats.registeredHouses || 0);
  const approvedCount = Number(stats.approvedHouses || 0);
  const districtCount = Number(stats.districtCoverage || 0);
  const vendorCount = Number(stats.vendors || 0);

  setMetricText('heroMetricRegistered', registeredCount);
  setMetricText('heroMetricApproved', approvedCount);
  setMetricText('heroMetricDistricts', districtCount);
  setMetricText('heroMetricVendors', vendorCount);
  setMetricText('approvedKpiCount', approvedCount, '건');
  setMetricText('districtCoverageCount', districtCount, '개');
  setMetricText('districtApprovedCount', approvedCount, '건');
}

function buildStatsFromHouseList(houses) {
  const list = Array.isArray(houses) ? houses : [];
  const registrationRequests = typeof getAllRegistrationRequests === 'function' ? getAllRegistrationRequests() : [];
  const approvedCount = list.filter((house) => house.isApproved && house.reviewStatus === 'approved').length;
  const districtIds = new Set(
    list
      .map((house) => house.districtId || house.districtName)
      .filter(Boolean)
      .map(String)
  );

  return {
    registeredHouses: list.length + registrationRequests.length,
    approvedHouses: approvedCount,
    districtCoverage: districtIds.size,
    vendors: typeof VENDOR_LIST !== 'undefined' && Array.isArray(VENDOR_LIST) ? VENDOR_LIST.length : 0,
  };
}

async function loadHomeStats() {
  const registrationRequests = typeof getAllRegistrationRequests === 'function' ? getAllRegistrationRequests() : [];
  const localHouses = typeof getAllVacantHouses === 'function'
    ? getAllVacantHouses()
    : (typeof VACANT_HOUSE_LIST !== 'undefined' && Array.isArray(VACANT_HOUSE_LIST) ? VACANT_HOUSE_LIST : []);
  try {
    const [statsResponse, housesResponse] = await Promise.all([
      fetch(`${API_BASE_URL}/site/stats`),
      fetch(`${API_BASE_URL}/houses`),
    ]);
    if (!statsResponse.ok) {
      throw new Error(`HTTP ${statsResponse.status}`);
    }

    const stats = await statsResponse.json();
    stats.registeredHouses = Number(stats.registeredHouses || 0) + registrationRequests.length;

    let mergedHouses = localHouses;
    if (housesResponse.ok) {
      const houses = await housesResponse.json();
      mergedHouses = mergeHomeHouseDatasets(houses, localHouses);
    }

    stats.approvedHouses = mergedHouses.filter((house) => house?.isApproved && String(house?.reviewStatus || '').toLowerCase() === 'approved').length;
    stats.districtCoverage = new Set(
      mergedHouses
        .map((house) => house?.districtId || house?.districtName)
        .filter(Boolean)
        .map(String)
    ).size;
    updateHomeMetrics(stats);
  } catch (error) {
    console.warn('홈 운영 현황 API를 사용할 수 없어 빈집 목록 API로 통계를 계산합니다.', error);
    try {
      const response = await fetch(`${API_BASE_URL}/houses`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const houses = await response.json();
      updateHomeMetrics(buildStatsFromHouseList(mergeHomeHouseDatasets(houses, localHouses)));
    } catch (fallbackError) {
      console.error('빈집 목록 API도 불러오지 못해 운영 현황을 표시하지 못했습니다.', fallbackError);
      updateHomeMetrics(buildStatsFromHouseList(localHouses));
    }
  }
}

/**
 * 승인된 빈집 미리보기 로드
 */
function mergeHomeHouseDatasets(...datasets) {
  const merged = new Map();
  datasets.flat().filter(Boolean).forEach((house) => {
    if (house?.id) {
      merged.set(String(house.id), { ...house });
    }
  });
  return [...merged.values()];
}

async function loadApprovedHousesPreview() {
  const localHouses = typeof getAllVacantHouses === 'function'
    ? getAllVacantHouses()
    : (typeof VACANT_HOUSE_LIST !== 'undefined' && Array.isArray(VACANT_HOUSE_LIST) ? VACANT_HOUSE_LIST : []);

  try {
    const response = await fetch(`${API_BASE_URL}/houses`);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const houses = await response.json();
    const mergedHouses = mergeHomeHouseDatasets(houses, localHouses);
    renderApprovedHousesPreview(mergedHouses);
  } catch (error) {
    console.warn('홈 빈집 미리보기 API를 사용할 수 없어 샘플 데이터로 표시합니다.', error);
    renderApprovedHousesPreview(localHouses);
  }
}

/**
 * 승인된 빈집 미리보기 렌더링
 */
function renderApprovedHousesPreview(houseList) {
  const grid = document.getElementById('approvedHouseGrid');
  if (!grid) return;

  const approvedHouses = houseList
    .filter(house => house.isApproved && house.reviewStatus === 'approved')
    .sort((a, b) => new Date(b.approvedAt || b.registeredAt || 0) - new Date(a.approvedAt || a.registeredAt || 0))
    .slice(0, 3);

  if (approvedHouses.length === 0) {
    grid.innerHTML = '<p class="text-center text-muted">현재 공개된 빈집이 없습니다.</p>';
    return;
  }

  const houseEmojis = { lodging: '🏠', longterm: '📅', experience: '🌿', review_needed: '🔍' };

  grid.innerHTML = approvedHouses.map(house => `
    <a href="../guest/guest-detail.html?id=${house.id}" class="approved-house-card animate-on-scroll">
      <div class="approved-house-card__image-wrap">
        <div class="approved-house-card__image-placeholder">
          ${houseEmojis[house.operationType] || '🏠'}
        </div>
        <div class="approved-house-card__badges">
          <span class="badge badge--public">✓ 공개 승인</span>
          ${getConditionGradeBadge(house.conditionGrade)}
        </div>
      </div>
      <div class="approved-house-card__body">
        <div class="approved-house-card__location">
          📍 영주시 ${house.districtName}
        </div>
        <h3 class="approved-house-card__name">${house.name}</h3>
        <p class="approved-house-card__desc">${house.description}</p>
        <div class="approved-house-card__meta">
          <span class="approved-house-card__capacity">👥 최대 ${house.maxCapacity}명</span>
          <span class="approved-house-card__price">${house.priceRange}</span>
        </div>
      </div>
    </a>
  `).join('');

  setupScrollAnimation('.animate-on-scroll');
}

/**
 * 영주시 읍면동 그리드 렌더링
 * 이 부분은 데모 통계 그대로 유지
 */
function renderDistrictGrid() {
  const grid = document.getElementById('districtGrid');
  if (!grid) return;

  grid.innerHTML = YEONGJU_DISTRICTS.map(district => {
    const districtStats = DISTRICT_STATISTICS.find(s => s.districtId === district.id);
    const approvedCount = districtStats ? districtStats.approved : 0;

    return `
      <a href="../guest/guest-list.html?district=${district.id}" class="district-chip">
        <span class="district-chip__name">${district.name}</span>
        <span class="district-chip__count">승인 ${approvedCount}건</span>
      </a>
    `;
  }).join('');
}
