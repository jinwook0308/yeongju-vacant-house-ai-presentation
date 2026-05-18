/**
 * guest-list.js
 * 영주시 공공 빈집 활용 플랫폼 - 승인 빈집 목록 페이지 스크립트
 */

const API_BASE_URL = typeof getApiBaseUrl === 'function' ? getApiBaseUrl() : 'http://localhost:8000';
const HOUSE_REVIEW_STORAGE_KEY = 'yeongjuHouseReviews';
const NEW_APPROVED_HOUSE_BASELINE_KEY = 'yeongjuNewApprovedHouseBaselineIds';

let currentFilters = {
  approvedOnly: true,
  keyword: '',
  district: '',
  checkIn: '',
  checkOut: '',
  operationType: '',
  grade: '',
  minCapacity: '',
};

let currentSort = 'latest';
let latestHouseDataset = [];
let isNewHouseSectionOpen = false;
let currentNewHousePage = 0;

const fallbackListImages = [
  '../assets/images/yeongju_spring.jpg',
  '../assets/images/yeongju_autumn.jpg',
  '../assets/images/yeongju_summer.jpg',
  '../assets/images/yeongju_winter.jpg',
  '../assets/images/yeongju_mas.jpg',
];

window.addEventListener('load', () => {
  renderHeader('house-list');
  renderFooter();
  renderStickyHeaderFilter();
  populateDistrictFilter();
  hydrateFiltersFromUrl();
  syncAllFilterControlsFromState();
  setupFilterEvents();
  setupNewHouseSectionToggle();
  setupStickyHeaderEvents();
  loadHouses();
  updateStickyFilterHeaderState();
});

window.addEventListener('scroll', updateStickyFilterHeaderState, { passive: true });
window.addEventListener('resize', updateStickyFilterHeaderState);

window.addEventListener('yeongju:auth-changed', () => {
  if (latestHouseDataset.length) {
    renderHouseList(latestHouseDataset);
  }
});

window.addEventListener('yeongju:wishlist-changed', () => {
  if (latestHouseDataset.length) {
    renderHouseList(latestHouseDataset);
  }
});

window.addEventListener('yeongju:platform-data-changed', () => {
  loadHouses();
});

window.addEventListener('storage', (event) => {
  if ([PLATFORM_REQUESTS_KEY, APPROVED_HOUSES_KEY].includes(event.key)) {
    loadHouses();
  }
});

function getMainFilterControls() {
  return {
    keyword: document.getElementById('filterKeyword'),
    district: document.getElementById('filterDistrict'),
    checkIn: document.getElementById('filterCheckIn'),
    checkOut: document.getElementById('filterCheckOut'),
    operationType: document.getElementById('filterOperationType'),
    grade: document.getElementById('filterGrade'),
    capacity: document.getElementById('filterCapacity'),
    sort: document.getElementById('houseSortSelect'),
  };
}

function getHeaderFilterControls() {
  return {
    keyword: document.getElementById('headerFilterKeyword'),
    district: document.getElementById('headerFilterDistrict'),
    checkIn: document.getElementById('headerFilterCheckIn'),
    checkOut: document.getElementById('headerFilterCheckOut'),
    operationType: document.getElementById('headerFilterOperationType'),
    grade: document.getElementById('headerFilterGrade'),
    capacity: document.getElementById('headerFilterCapacity'),
    sort: document.getElementById('headerSortSelect'),
  };
}

function hydrateFiltersFromUrl() {
  const params = getUrlParams();
  if (params.district) {
    currentFilters.district = params.district;
  }
  if (params.checkIn) {
    currentFilters.checkIn = params.checkIn;
  }
  if (params.checkOut) {
    currentFilters.checkOut = params.checkOut;
  }
}

function populateDistrictFilter() {
  const options = [
    '<option value="">전체 지역</option>',
    ...YEONGJU_DISTRICTS.map(
      (district) => `<option value="${district.id}">영주시 ${district.name}</option>`
    ),
  ].join('');

  const mainDistrict = document.getElementById('filterDistrict');
  const headerDistrict = document.getElementById('headerFilterDistrict');

  if (mainDistrict) mainDistrict.innerHTML = options;
  if (headerDistrict) headerDistrict.innerHTML = options;
}

function renderStickyHeaderFilter() {
  const nav = document.querySelector('.guest-list-page .site-header__nav');
  if (!nav || nav.querySelector('#listHeaderFilterBar')) return;

  nav.insertAdjacentHTML(
    'beforeend',
    `
      <div class="site-header__list-filter" id="listHeaderFilterBar" aria-label="빈집 목록 빠른 필터">
        <input type="text" id="headerFilterKeyword" class="form-control site-header__list-filter-control" placeholder="빈집명, 지역명 검색" aria-label="검색어">
        <select id="headerFilterDistrict" class="form-control form-select site-header__list-filter-control" aria-label="영주시 지역">
          <option value="">전체 지역</option>
        </select>
        <input type="date" id="headerFilterCheckIn" class="form-control site-header__list-filter-control" aria-label="체크인">
        <input type="date" id="headerFilterCheckOut" class="form-control site-header__list-filter-control" aria-label="체크아웃">
        <select id="headerFilterOperationType" class="form-control form-select site-header__list-filter-control" aria-label="이용 유형">
          <option value="">전체 유형</option>
          <option value="lodging">숙박 가능</option>
          <option value="longterm">장기 체류형</option>
          <option value="experience">체험 공간형</option>
        </select>
        <select id="headerFilterGrade" class="form-control form-select site-header__list-filter-control" aria-label="상태 등급">
          <option value="">전체 등급</option>
          <option value="1">1등급</option>
          <option value="2">2등급</option>
        </select>
        <select id="headerFilterCapacity" class="form-control form-select site-header__list-filter-control" aria-label="최소 수용 인원">
          <option value="">제한 없음</option>
          <option value="2">2명 이상</option>
          <option value="4">4명 이상</option>
          <option value="6">6명 이상</option>
        </select>
        <select id="headerSortSelect" class="form-control form-select site-header__list-filter-control" aria-label="정렬">
          <option value="latest">최신 순</option>
          <option value="recommended">추천 순</option>
          <option value="priceLow">가격 낮은 순</option>
          <option value="priceHigh">가격 높은 순</option>
          <option value="capacity">수용 인원 순</option>
          <option value="grade">등급 순</option>
        </select>
        <button type="button" class="btn btn--primary btn--sm site-header__list-filter-apply" id="headerFilterApplyBtn">검색</button>
      </div>
    `
  );
}

function syncAllFilterControlsFromState() {
  const main = getMainFilterControls();
  const header = getHeaderFilterControls();

  if (main.keyword) main.keyword.value = currentFilters.keyword;
  if (main.district) main.district.value = currentFilters.district;
  if (main.checkIn) main.checkIn.value = currentFilters.checkIn;
  if (main.checkOut) main.checkOut.value = currentFilters.checkOut;
  if (main.operationType) main.operationType.value = currentFilters.operationType;
  if (main.grade) main.grade.value = currentFilters.grade;
  if (main.capacity) main.capacity.value = currentFilters.minCapacity;
  if (main.sort) main.sort.value = currentSort;

  if (header.keyword) header.keyword.value = currentFilters.keyword;
  if (header.district) header.district.value = currentFilters.district;
  if (header.checkIn) header.checkIn.value = currentFilters.checkIn;
  if (header.checkOut) header.checkOut.value = currentFilters.checkOut;
  if (header.operationType) header.operationType.value = currentFilters.operationType;
  if (header.grade) header.grade.value = currentFilters.grade;
  if (header.capacity) header.capacity.value = currentFilters.minCapacity;
  if (header.sort) header.sort.value = currentSort;
}

function syncHeaderFilterFromMain() {
  const main = getMainFilterControls();
  const header = getHeaderFilterControls();

  if (header.keyword && main.keyword) header.keyword.value = main.keyword.value;
  if (header.district && main.district) header.district.value = main.district.value;
  if (header.checkIn && main.checkIn) header.checkIn.value = main.checkIn.value;
  if (header.checkOut && main.checkOut) header.checkOut.value = main.checkOut.value;
  if (header.operationType && main.operationType) header.operationType.value = main.operationType.value;
  if (header.grade && main.grade) header.grade.value = main.grade.value;
  if (header.capacity && main.capacity) header.capacity.value = main.capacity.value;
  if (header.sort && main.sort) header.sort.value = main.sort.value;
}

function syncMainFilterFromHeader() {
  const main = getMainFilterControls();
  const header = getHeaderFilterControls();

  if (main.keyword && header.keyword) main.keyword.value = header.keyword.value;
  if (main.district && header.district) main.district.value = header.district.value;
  if (main.checkIn && header.checkIn) main.checkIn.value = header.checkIn.value;
  if (main.checkOut && header.checkOut) main.checkOut.value = header.checkOut.value;
  if (main.operationType && header.operationType) main.operationType.value = header.operationType.value;
  if (main.grade && header.grade) main.grade.value = header.grade.value;
  if (main.capacity && header.capacity) main.capacity.value = header.capacity.value;
  if (main.sort && header.sort) main.sort.value = header.sort.value;
}

function setupFilterEvents() {
  document.getElementById('filterApplyBtn')?.addEventListener('click', () => applyFilters('main'));
  document.getElementById('filterResetBtn')?.addEventListener('click', resetFilters);
  document.getElementById('emptyResetBtn')?.addEventListener('click', resetFilters);

  const main = getMainFilterControls();

  main.sort?.addEventListener('change', (event) => {
    currentSort = event.target.value;
    syncHeaderFilterFromMain();
    loadHouses();
  });

  main.keyword?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      applyFilters('main');
    }
  });

  [main.keyword, main.district, main.checkIn, main.checkOut, main.operationType, main.grade, main.capacity].forEach((control) => {
    if (!control) return;
    const eventName = control.tagName === 'INPUT' ? 'input' : 'change';
    control.addEventListener(eventName, syncHeaderFilterFromMain);
  });
}

function setupStickyHeaderEvents() {
  const header = getHeaderFilterControls();

  document.getElementById('headerFilterApplyBtn')?.addEventListener('click', () => applyFilters('header'));

  header.keyword?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      applyFilters('header');
    }
  });

  header.keyword?.addEventListener('input', syncMainFilterFromHeader);
  header.district?.addEventListener('change', syncMainFilterFromHeader);
  header.checkIn?.addEventListener('change', syncMainFilterFromHeader);
  header.checkOut?.addEventListener('change', syncMainFilterFromHeader);
  header.operationType?.addEventListener('change', syncMainFilterFromHeader);
  header.grade?.addEventListener('change', syncMainFilterFromHeader);
  header.capacity?.addEventListener('change', syncMainFilterFromHeader);
  header.sort?.addEventListener('change', (event) => {
    currentSort = event.target.value;
    syncMainFilterFromHeader();
    loadHouses();
  });
}

function applyFilters(source = 'main') {
  const main = getMainFilterControls();
  const header = getHeaderFilterControls();
  const sourceControls = source === 'header' ? header : main;

  const nextCheckIn = sourceControls.checkIn?.value || '';
  const nextCheckOut = sourceControls.checkOut?.value || '';

  if ((nextCheckIn && !nextCheckOut) || (!nextCheckIn && nextCheckOut)) {
    showToast('체크인과 체크아웃 날짜를 모두 선택해 주세요.', 'warning');
    return;
  }

  if (nextCheckIn && nextCheckOut && new Date(nextCheckIn) >= new Date(nextCheckOut)) {
    showToast('체크아웃은 체크인 이후 날짜여야 합니다.', 'warning');
    return;
  }

  if (source === 'header') {
    currentFilters.keyword = header.keyword?.value.trim() || '';
    currentFilters.district = header.district?.value || '';
    currentFilters.checkIn = nextCheckIn;
    currentFilters.checkOut = nextCheckOut;
    currentFilters.operationType = header.operationType?.value || '';
    currentFilters.grade = header.grade?.value || '';
    currentFilters.minCapacity = header.capacity?.value || '';
    syncMainFilterFromHeader();
  } else {
    currentFilters.keyword = main.keyword?.value.trim() || '';
    currentFilters.district = main.district?.value || '';
    currentFilters.checkIn = nextCheckIn;
    currentFilters.checkOut = nextCheckOut;
    currentFilters.operationType = main.operationType?.value || '';
    currentFilters.grade = main.grade?.value || '';
    currentFilters.minCapacity = main.capacity?.value || '';
    syncHeaderFilterFromMain();
  }

  currentFilters.approvedOnly = true;
  setUrlParams({
    district: currentFilters.district || null,
    checkIn: currentFilters.checkIn || null,
    checkOut: currentFilters.checkOut || null,
  }, true);
  loadHouses();
}

function resetFilters() {
  currentFilters = {
    approvedOnly: true,
    keyword: '',
    district: '',
    checkIn: '',
    checkOut: '',
    operationType: '',
    grade: '',
    minCapacity: '',
  };
  currentSort = 'latest';
  setUrlParams({ district: null, checkIn: null, checkOut: null }, true);
  syncAllFilterControlsFromState();
  loadHouses();
}

async function loadHouses() {
  const localHouses = typeof getAllVacantHouses === 'function'
    ? getAllVacantHouses()
    : [];
  try {
    const response = await fetch(`${API_BASE_URL}/houses`);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const houses = await response.json();
    renderHouseList(mergeHouseDatasets(houses, localHouses));
  } catch (error) {
    console.error('빈집 목록 API를 불러오지 못했습니다.', error);
    renderHouseList(localHouses);
  }
}

function mergeHouseDatasets(...datasets) {
  const merged = new Map();

  datasets
    .flat()
    .filter(Boolean)
    .forEach((house) => {
      if (!house?.id) return;
      merged.set(String(house.id), { ...house });
    });

  return [...merged.values()];
}

function renderHouseList(houses) {
  const list = document.getElementById('houseCardGrid');
  const emptyResult = document.getElementById('emptyResult');
  const countEl = document.getElementById('houseListCount');
  if (!list) return;

  latestHouseDataset = Array.isArray(houses) ? houses : [];
  renderNewHouseSection(latestHouseDataset);

  let filteredHouses = filterVacantHouses(houses, currentFilters);
  filteredHouses = filterHousesByAvailability(filteredHouses, currentFilters);
  filteredHouses = sortHouses(filteredHouses, currentSort);

  if (countEl) {
    countEl.innerHTML = `<strong>${filteredHouses.length}건</strong><span>공개 승인된 빈집</span>`;
  }

  if (filteredHouses.length === 0) {
    list.innerHTML = '';
    if (emptyResult) emptyResult.style.display = 'block';
    return;
  }

  if (emptyResult) emptyResult.style.display = 'none';

  const wishlist = getWishlist();

  list.innerHTML = filteredHouses.map((house, index) => {
    const tags = Array.isArray(house.tags) ? house.tags : [];
    const reviewBadge = getReviewStatusBadge(house.reviewStatus);
    const gradeBadge = getConditionGradeBadge(house.conditionGrade);
    const operationBadge = getOperationTypeBadge(house.operationType);
    const primaryPhoto = typeof getHousePhotoUrl === 'function' ? getHousePhotoUrl(house) : '';
    const displayPhoto = primaryPhoto || fallbackListImages[index % fallbackListImages.length];
    const description = house.description || buildFallbackDescription(house);
    const isWishlisted = wishlist.includes(house.id);
    const delay = Math.min(index * 0.04, 0.36);
    const detailHref = createHouseDetailHref(house.id);

    return `
      <article class="house-list-card" style="animation-delay:${delay}s">
        <button
          type="button"
          class="house-list-card__wishlist-btn ${isWishlisted ? 'is-wishlisted' : ''}"
          onclick="handleWishlistToggle(event, '${house.id}', this)"
          aria-label="찜하기"
        >
          ${isWishlisted ? '♥' : '♡'}
        </button>
        <a href="${detailHref}" class="house-list-card__link">
          <div class="house-list-card__media">
            ${displayPhoto ? `<img class="house-list-card__image" src="${displayPhoto}" alt="${house.name}">` : `<div class="house-list-card__image-placeholder">영주시 승인 빈집</div>`}
          </div>

          <div class="house-list-card__content">
            <p class="house-list-card__eyebrow">영주시 공공 검토를 거친 승인 빈집</p>
            <h3 class="house-list-card__title">${house.name}</h3>
            <p class="house-list-card__location">경상북도 영주시 ${house.districtName}${house.address ? ` · ${house.address}` : ''}</p>
            <p class="house-list-card__description">${description}</p>
            <div class="house-list-card__meta-badges">
              ${reviewBadge}
              ${gradeBadge}
            </div>
            <div class="house-list-card__tag-list">
              ${tags.map((tag) => `<span class="house-list-card__tag">${tag}</span>`).join('')}
            </div>
          </div>

          <div class="house-list-card__aside">
            <div class="house-list-card__status">${operationBadge}</div>
            <dl class="house-list-card__facts">
              <div>
                <dt>최대 인원</dt>
                <dd>${house.maxCapacity}명</dd>
              </div>
              <div>
                <dt>공공데이터</dt>
                <dd>${formatGradeLabel(house.conditionGrade)}</dd>
              </div>
            </dl>
            <div class="house-list-card__price-wrap">
              <span class="house-list-card__price-note">1박 기준</span>
              <strong class="house-list-card__price">${house.priceRange}</strong>
            </div>
            <span class="house-list-card__cta">상세 보기</span>
          </div>
        </a>
      </article>
    `;
  }).join('');
}

function setupNewHouseSectionToggle() {
  const toggle = document.getElementById('newHouseToggle');
  const section = document.getElementById('newHouseSection');
  const prevBtn = document.getElementById('newHousePrevBtn');
  const nextBtn = document.getElementById('newHouseNextBtn');
  if (!toggle || !section) return;

  toggle.addEventListener('click', () => {
    isNewHouseSectionOpen = !isNewHouseSectionOpen;
    applyNewHouseSectionState();
  });

  prevBtn?.addEventListener('click', () => moveNewHousePage(-1));
  nextBtn?.addEventListener('click', () => moveNewHousePage(1));
  window.addEventListener('resize', syncNewHouseSlider);
}

function applyNewHouseSectionState() {
  const section = document.getElementById('newHouseSection');
  const toggle = document.getElementById('newHouseToggle');
  if (!section || !toggle) return;

  section.classList.toggle('is-open', isNewHouseSectionOpen);
  toggle.setAttribute('aria-expanded', String(isNewHouseSectionOpen));
}

function renderNewHouseSection(houses) {
  const grid = document.getElementById('newHouseGrid');
  const viewportWrap = document.getElementById('newHouseViewportWrap');
  const prevBtn = document.getElementById('newHousePrevBtn');
  const nextBtn = document.getElementById('newHouseNextBtn');
  if (!grid || !viewportWrap) return;

  const newApprovedHouses = getFilteredNewApprovedHouses(houses);
  const totalNewCount = newApprovedHouses.length;
  currentNewHousePage = 0;

  if (totalNewCount === 0) {
    viewportWrap.classList.add('is-empty');
    prevBtn.hidden = true;
    nextBtn.hidden = true;
    grid.style.transform = 'translateX(0)';
    grid.innerHTML = `
      <div class="new-house-section__empty">
        승인 된 신규빈집이 없습니다
      </div>
    `;
    applyNewHouseSectionState();
    return;
  }

  viewportWrap.classList.remove('is-empty');
  const wishlist = getWishlist();

  grid.innerHTML = newApprovedHouses.map((house, index) => {
    const reviewBadge = getReviewStatusBadge(house.reviewStatus);
    const gradeBadge = getConditionGradeBadge(house.conditionGrade);
    const operationBadge = getOperationTypeBadge(house.operationType);
    const tags = Array.isArray(house.tags) ? house.tags.slice(0, 3) : [];
    const primaryPhoto = typeof getHousePhotoUrl === 'function' ? getHousePhotoUrl(house) : '';
    const displayPhoto = primaryPhoto || fallbackListImages[index % fallbackListImages.length];
    const isWishlisted = wishlist.includes(house.id);
    const detailHref = createHouseDetailHref(house.id);

    return `
      <article class="new-house-card" style="animation-delay:${Math.min(index * 0.05, 0.18)}s">
        <a href="${detailHref}" class="new-house-card__link">
          <div class="new-house-card__media">
            ${displayPhoto ? `<img class="new-house-card__image" src="${displayPhoto}" alt="${house.name}">` : `<div class="new-house-card__image-placeholder">영주시 승인 빈집</div>`}
            <div class="new-house-card__badges">
              ${reviewBadge}
              ${gradeBadge}
            </div>
          </div>

          <div class="new-house-card__content">
            <p class="new-house-card__location">영주시 ${house.districtName}</p>
            <h3 class="new-house-card__title">${house.name}</h3>
            <div class="new-house-card__tag-list">
              ${tags.map((tag) => `<span class="new-house-card__tag">${tag}</span>`).join('')}
            </div>
            <div class="new-house-card__footer">
              <div class="new-house-card__status">${operationBadge}</div>
              <div class="new-house-card__price">
                <span class="new-house-card__price-note">1박 기준</span>
                <strong>${house.priceRange}</strong>
              </div>
            </div>
            <span class="new-house-card__cta">${isWishlisted ? '찜한 빈집 보기' : '상세 보기'}</span>
          </div>
        </a>
      </article>
    `;
  }).join('');

  applyNewHouseSectionState();
  syncNewHouseSlider();
}

function getNewHouseVisibleCount() {
  if (window.innerWidth <= 768) return 1;
  if (window.innerWidth <= 1024) return 2;
  return 3;
}

function getNewHousePageCount() {
  const cards = document.querySelectorAll('.new-house-card');
  const visibleCount = getNewHouseVisibleCount();
  if (!cards.length) return 0;
  return Math.ceil(cards.length / visibleCount);
}

function moveNewHousePage(direction) {
  const pageCount = getNewHousePageCount();
  if (!pageCount) return;

  currentNewHousePage = Math.max(0, Math.min(currentNewHousePage + direction, pageCount - 1));
  syncNewHouseSlider();
}

function syncNewHouseSlider() {
  const track = document.getElementById('newHouseGrid');
  const cards = track ? Array.from(track.querySelectorAll('.new-house-card')) : [];
  const prevBtn = document.getElementById('newHousePrevBtn');
  const nextBtn = document.getElementById('newHouseNextBtn');

  if (!track || !cards.length) return;

  const visibleCount = getNewHouseVisibleCount();
  const pageCount = Math.ceil(cards.length / visibleCount);
  currentNewHousePage = Math.max(0, Math.min(currentNewHousePage, Math.max(pageCount - 1, 0)));

  const firstCard = cards[0];
  const secondCard = cards[1];
  const cardWidth = firstCard.getBoundingClientRect().width;
  const gap = secondCard ? (secondCard.getBoundingClientRect().left - firstCard.getBoundingClientRect().right) : 18;
  const offset = currentNewHousePage * visibleCount * (cardWidth + gap);
  track.style.transform = `translateX(-${offset}px)`;

  prevBtn.hidden = cards.length <= visibleCount;
  nextBtn.hidden = cards.length <= visibleCount;
  if (!prevBtn.hidden) {
    prevBtn.disabled = currentNewHousePage === 0;
    nextBtn.disabled = currentNewHousePage >= pageCount - 1;
  }
}

function getFilteredNewApprovedHouses(houses) {
  const approvedIds = ensureNewApprovedHouseBaseline(houses);

  const filtered = filterVacantHouses(houses, currentFilters)
    .filter((house) => {
      const reviewStatus = String(house?.reviewStatus || '').toLowerCase();
      const isApproved = reviewStatus === 'approved' || house?.isApproved === true;
      return isApproved && !approvedIds.includes(String(house.id));
    });

  const available = filterHousesByAvailability(filtered, currentFilters);

  return [...available].sort((a, b) => new Date(b.approvedAt || b.registeredAt || 0) - new Date(a.approvedAt || a.registeredAt || 0));
}

function ensureNewApprovedHouseBaseline(houses) {
  const stored = getNewApprovedHouseBaseline();
  if (stored.length) {
    const registrationApprovedIds = new Set(
      (Array.isArray(houses) ? houses : [])
        .filter((house) => String(house?.source || '') === 'registration-request')
        .map((house) => String(house.id))
    );
    const sanitized = stored.filter((id) => !registrationApprovedIds.has(String(id)));
    if (sanitized.length !== stored.length) {
      setNewApprovedHouseBaseline(sanitized);
    }
    return sanitized;
  }

  const approvedIds = (Array.isArray(houses) ? houses : [])
    .filter((house) => {
      const reviewStatus = String(house?.reviewStatus || '').toLowerCase();
      const isApproved = reviewStatus === 'approved' || house?.isApproved === true;
      if (!isApproved) return false;
      return String(house?.source || '') !== 'registration-request';
    })
    .map((house) => String(house.id));

  setNewApprovedHouseBaseline(approvedIds);
  return approvedIds;
}

function getNewApprovedHouseBaseline() {
  try {
    const raw = localStorage.getItem(NEW_APPROVED_HOUSE_BASELINE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch (error) {
    console.warn('신규 빈집 기준선을 불러오지 못했습니다.', error);
    return [];
  }
}

function setNewApprovedHouseBaseline(ids) {
  try {
    localStorage.setItem(NEW_APPROVED_HOUSE_BASELINE_KEY, JSON.stringify(Array.from(new Set(ids.map(String)))));
  } catch (error) {
    console.warn('신규 빈집 기준선을 저장하지 못했습니다.', error);
  }
}

function sortHouses(houses, sortKey) {
  const sorted = [...houses];

  if (sortKey === 'recommended') {
    sorted.sort((a, b) => {
      const ratingDiff = getHouseAverageRating(b.id) - getHouseAverageRating(a.id);
      if (ratingDiff !== 0) return ratingDiff;

      const recommendDiff = getHouseRecommendCount(b.id) - getHouseRecommendCount(a.id);
      if (recommendDiff !== 0) return recommendDiff;

      const reviewCountDiff = getHouseReviewCount(b.id) - getHouseReviewCount(a.id);
      if (reviewCountDiff !== 0) return reviewCountDiff;

      return new Date(b.registeredAt || 0) - new Date(a.registeredAt || 0);
    });
  } else if (sortKey === 'priceLow') {
    sorted.sort((a, b) => getHousePriceValue(a) - getHousePriceValue(b));
  } else if (sortKey === 'priceHigh') {
    sorted.sort((a, b) => getHousePriceValue(b) - getHousePriceValue(a));
  } else if (sortKey === 'capacity') {
    sorted.sort((a, b) => b.maxCapacity - a.maxCapacity);
  } else if (sortKey === 'grade') {
    const gradeOrder = { '1': 0, '2': 1, '3': 2, '4': 3, A: 0, B: 1, C: 2, D: 3 };
    sorted.sort((a, b) => (gradeOrder[a.conditionGrade] || 9) - (gradeOrder[b.conditionGrade] || 9));
  } else {
    sorted.sort((a, b) => new Date(b.registeredAt) - new Date(a.registeredAt));
  }

  return sorted;
}

function createHouseDetailHref(houseId) {
  const params = new URLSearchParams({ id: String(houseId) });

  if (currentFilters.keyword) {
    params.set('keyword', currentFilters.keyword);
  }

  if (currentFilters.district) {
    params.set('district', currentFilters.district);
  }

  if (currentFilters.checkIn) {
    params.set('checkIn', currentFilters.checkIn);
  }

  if (currentFilters.checkOut) {
    params.set('checkOut', currentFilters.checkOut);
  }

  if (currentFilters.operationType) {
    params.set('operationType', currentFilters.operationType);
  }

  if (currentFilters.grade) {
    params.set('grade', currentFilters.grade);
  }

  if (currentFilters.minCapacity) {
    params.set('minCapacity', currentFilters.minCapacity);
  }

  return `guest-detail.html?${params.toString()}`;
}

function filterHousesByAvailability(houses, filters) {
  if (!filters.checkIn || !filters.checkOut) {
    return houses;
  }

  return houses.filter((house) => isHouseAvailableForRange(house.id, filters.checkIn, filters.checkOut));
}

function isHouseAvailableForRange(houseId, checkIn, checkOut) {
  if (typeof getAllBookingRequests !== 'function' || !checkIn || !checkOut) {
    return true;
  }

  const requestedStart = new Date(checkIn);
  const requestedEnd = new Date(checkOut);

  if (!(requestedStart instanceof Date) || Number.isNaN(requestedStart.getTime())) return true;
  if (!(requestedEnd instanceof Date) || Number.isNaN(requestedEnd.getTime())) return true;

  const nonBlockingStatuses = new Set(['rejected', 'cancelled', 'withdrawn']);

  return !getAllBookingRequests().some((booking) => {
    if (!booking) return false;
    if (String(booking.houseId || '') !== String(houseId)) return false;

    const status = String(booking.status || '').trim().toLowerCase();
    if (nonBlockingStatuses.has(status)) return false;

    const bookingStart = new Date(booking.checkIn);
    const bookingEnd = new Date(booking.checkOut);
    if (Number.isNaN(bookingStart.getTime()) || Number.isNaN(bookingEnd.getTime())) return false;

    return bookingStart < requestedEnd && bookingEnd > requestedStart;
  });
}

function getHousePriceValue(house) {
  const raw = String(house?.priceRange || '').replace(/,/g, '');

  const manwonMatch = raw.match(/(\d+(?:\.\d+)?)\s*만원/);
  if (manwonMatch) {
    return Number(manwonMatch[1]) * 10000;
  }

  const wonMatch = raw.match(/(\d+(?:\.\d+)?)\s*원/);
  if (wonMatch) {
    return Number(wonMatch[1]);
  }

  const numericTokens = raw.match(/\d+(?:\.\d+)?/g) || [];
  return numericTokens.length ? Number(numericTokens[numericTokens.length - 1]) : Number.MAX_SAFE_INTEGER;
}

function getRecommendationScore(house) {
  const gradeScoreMap = { '1': 40, '2': 28, '3': 18, '4': 10, A: 40, B: 28, C: 18, D: 10 };
  const typeScoreMap = { lodging: 18, longterm: 12, experience: 8, review_needed: 2 };
  const photoScore = (typeof getHousePhotoUrl === 'function' && getHousePhotoUrl(house)) ? 8 : 0;
  const verifiedScore = house?.isVerified ? 8 : 0;
  const capacityScore = Math.min(Number(house?.maxCapacity || 0), 8);

  return (
    (gradeScoreMap[String(house?.conditionGrade || '')] || 0) +
    (typeScoreMap[String(house?.operationType || '')] || 0) +
    photoScore +
    verifiedScore +
    capacityScore
  );
}

function getStoredHouseReviews() {
  try {
    const raw = localStorage.getItem(HOUSE_REVIEW_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn('리뷰 데이터를 불러오지 못했습니다.', error);
    return [];
  }
}

function getHouseReviewsById(houseId) {
  return getStoredHouseReviews().filter((review) => String(review.houseId) === String(houseId));
}

function getHouseAverageRating(houseId) {
  const reviews = getHouseReviewsById(houseId);
  if (!reviews.length) return 0;

  const total = reviews.reduce((sum, review) => {
    const rating = Number(review.rating || 0);
    return sum + (Number.isFinite(rating) ? rating : 0);
  }, 0);
  const average = total / reviews.length;
  return Number.isFinite(average) ? average : 0;
}

function getHouseReviewCount(houseId) {
  return getHouseReviewsById(houseId).length;
}

function getHouseRecommendCount(houseId) {
  return getHouseReviewsById(houseId).filter((review) => review.recommended).length;
}

function buildFallbackDescription(house) {
  const typeLabel = {
    lodging: '숙박 운영이 가능한 승인 빈집입니다.',
    longterm: '장기 체류형으로 활용할 수 있는 승인 빈집입니다.',
    experience: '체험·방문형 공간으로 운영 가능한 승인 빈집입니다.',
    review_needed: '추가 검토가 필요한 영주시 빈집입니다.',
  }[house.operationType] || '영주시 공공 검토를 마친 빈집입니다.';

  return `영주시 ${house.districtName}에 위치해 있으며, ${typeLabel}`;
}

function formatGradeLabel(grade) {
  if (!grade) return '-';
  return String(grade).endsWith('등급') ? String(grade) : `${grade}등급`;
}

function updateStickyFilterHeaderState() {
  const body = document.body;
  const panel = document.getElementById('houseFilterPanel');
  const header = document.getElementById('siteHeader');

  if (!body.classList.contains('guest-list-page') || !panel || !header || window.innerWidth <= 1180) {
    body.classList.remove('is-filter-header-active');
    return;
  }

  const threshold = header.offsetHeight + 18;
  const panelBottom = panel.getBoundingClientRect().bottom;
  body.classList.toggle('is-filter-header-active', panelBottom <= threshold);
}

function handleWishlistToggle(event, houseId, button) {
  event.preventDefault();
  event.stopPropagation();

  if (!isLoggedIn()) {
    alert('로그인 후 이용해 주세요.');
    setTimeout(() => {
      window.location.href = getRootPath() + 'auth/login.html';
    }, 300);
    return;
  }

  const added = toggleWishlist(houseId);
  if (added === null) return;

  button.textContent = added ? '♥' : '♡';
  button.classList.toggle('is-wishlisted', added);
}
