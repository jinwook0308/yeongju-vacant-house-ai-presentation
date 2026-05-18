const API_BASE_URL = typeof getApiBaseUrl === 'function' ? getApiBaseUrl() : 'http://localhost:8000';
const HOUSE_REVIEW_STORAGE_KEY = 'yeongjuHouseReviews';
let currentHouse = null;
let currentSimilarHouses = [];
let currentHouseDetailParams = {};

const DETAIL_DISTRICT_COORDS = {
  '풍기읍': [36.9830, 128.5440],
  '순흥면': [36.9420, 128.5910],
  '봉현면': [36.9100, 128.5200],
  '부석면': [36.9960, 128.6700],
  '이산면': [36.8530, 128.4980],
  '문수면': [36.8000, 128.5300],
  '장수면': [36.8680, 128.6780],
  '평은면': [36.8340, 128.6360],
  '안정면': [36.9100, 128.6800],
  '단산면': [36.8690, 128.5340],
  '영주동': [36.8050, 128.6240],
  '상망동': [36.8150, 128.6380],
  '가흥동': [36.8240, 128.6520],
  '하망동': [36.8320, 128.6630],
  '휴천동': [36.8100, 128.5950],
};

const DETAIL_OPERATION_LABELS = {
  lodging: '숙박 가능형',
  longterm: '장기체류형',
  experience: '체험공간형',
  review_needed: '추가 검토 필요',
};

const DETAIL_OPERATION_EMOJIS = {
  lodging: '🏠',
  longterm: '📅',
  experience: '🌿',
  review_needed: '🔍',
};

window.addEventListener('load', initHouseDetailPage);
window.addEventListener('yeongju:auth-changed', syncDetailWishlistButton);
window.addEventListener('yeongju:wishlist-changed', syncDetailWishlistButton);

function isApiHouseIdSupported(houseId) {
  const normalized = String(houseId || '').trim();
  return /^VH\d+$/i.test(normalized) || /^\d+$/.test(normalized);
}

function getDetailDistrictNameFromQuery(districtId, fallbackName = '') {
  if (districtId && Array.isArray(YEONGJU_DISTRICTS)) {
    const matched = YEONGJU_DISTRICTS.find((district) => String(district.id) === String(districtId));
    if (matched?.name) {
      return matched.name;
    }
  }

  return fallbackName || '';
}

function formatDetailShortDate(value) {
  if (!value) return '';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
  return `${date.getMonth() + 1}.${date.getDate()}(${weekdays[date.getDay()]})`;
}

function buildDetailSearchSummary(params, house) {
  const chips = [];
  const districtName = getDetailDistrictNameFromQuery(params.district, house?.districtName || '');
  const operationLabel = DETAIL_OPERATION_LABELS[params.operationType] || '';

  if (districtName) {
    chips.push(`영주시 ${districtName}`);
  }

  if (params.keyword) {
    chips.push(`검색어 ${params.keyword}`);
  }

  if (params.checkIn && params.checkOut) {
    chips.push(`${formatDetailShortDate(params.checkIn)} ~ ${formatDetailShortDate(params.checkOut)}`);
  } else if (params.checkIn) {
    chips.push(`입실 ${formatDetailShortDate(params.checkIn)}`);
  }

  if (params.minCapacity) {
    chips.push(`${params.minCapacity}명 이상`);
  }

  if (operationLabel) {
    chips.push(operationLabel);
  }

  if (params.grade) {
    chips.push(`공공데이터 ${params.grade}등급`);
  }

  return chips;
}

function buildHouseGalleryPhotos(house, primaryPhoto) {
  const candidatePhotos = typeof getHousePhotos === 'function' ? getHousePhotos(house) : [];
  const rawPhotos = Array.isArray(candidatePhotos) ? candidatePhotos : [];

  const photoUrls = [
    primaryPhoto,
    ...rawPhotos.map((photo) => photo?.dataUrl || photo?.url || photo?.src || '').filter(Boolean),
  ].filter(Boolean);

  return Array.from(new Set(photoUrls)).slice(0, 5);
}

function renderDetailMap(house) {
  const lat = Number(house.lat);
  const lon = Number(house.lon);
  const coords = Number.isFinite(lat) && Number.isFinite(lon)
    ? [lat, lon]
    : (DETAIL_DISTRICT_COORDS[house.districtName] || [36.872, 128.60]);

  ['bookingLocationMap', 'detailLocationMap'].forEach((elementId) => {
    const element = document.getElementById(elementId);
    if (!element || typeof L === 'undefined') return;

    if (element._leaflet_id) {
      element._leaflet_id = null;
      element.innerHTML = '';
    }

    const map = L.map(element, { scrollWheelZoom: false, zoomControl: true }).setView(coords, 13);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: 'OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map);

    L.marker(coords)
      .addTo(map)
      .bindPopup(`${house.name || '승인 빈집'}<br>${house.address || `영주시 ${house.districtName || ''}`}`)
      .openPopup();
  });
}

async function initHouseDetailPage() {
  renderHeader('house-list');
  renderFooter();
  document.body.classList.add('user-platform-page');

  const params = getUrlParams();
  const houseId = params.id;

  if (!houseId) {
    showNotFound();
    return;
  }

  if (!isApiHouseIdSupported(houseId)) {
    const fallbackHouse = getFallbackHouseById(houseId);
    if (!fallbackHouse) {
      showNotFound();
      return;
    }

    currentHouse = fallbackHouse;
    currentHouseDetailParams = params;
    const similarHouses = getFallbackApprovedHouses()
      .filter((item) =>
        item.id !== fallbackHouse.id &&
        item.isApproved &&
        (item.districtId === fallbackHouse.districtId || item.operationType === fallbackHouse.operationType)
      )
      .slice(0, 3);

    currentSimilarHouses = similarHouses;
    renderHouseDetailTopRedesign(fallbackHouse, similarHouses, params);
    renderDetailMap(fallbackHouse);
    setupModalClose('bookingRequestModal');
    return;
  }

  try {
    const houseResponse = await fetch(`${API_BASE_URL}/houses/${houseId}`);
    if (!houseResponse.ok) {
      throw new Error(`HTTP ${houseResponse.status}`);
    }

    const house = await houseResponse.json();
    if (!house || !house.isApproved) {
      showNotFound();
      return;
    }

    let similarHouses = [];
    try {
      const listResponse = await fetch(`${API_BASE_URL}/houses`);
      if (listResponse.ok) {
        const allHouses = await listResponse.json();
        similarHouses = allHouses
          .filter((item) =>
            item.id !== house.id &&
            item.isApproved &&
            (item.districtId === house.districtId || item.operationType === house.operationType)
          )
          .slice(0, 3);
      }
    } catch (error) {
      console.warn('비슷한 빈집 목록은 생략합니다.', error);
    }

    currentHouse = house;
    currentHouseDetailParams = params;
    currentSimilarHouses = similarHouses;
    renderHouseDetailTopRedesign(house, similarHouses, params);
    renderDetailMap(house);
    setupModalClose('bookingRequestModal');
  } catch (error) {
    console.warn('상세 API 호출에 실패해 대체 로직을 확인합니다.', error);
    const fallbackHouse = getFallbackHouseById(houseId);
    if (!fallbackHouse) {
      showNotFound();
      return;
    }

    currentHouse = fallbackHouse;
    currentHouseDetailParams = params;
    const similarHouses = getFallbackApprovedHouses()
      .filter((item) =>
        item.id !== fallbackHouse.id &&
        item.isApproved &&
        (item.districtId === fallbackHouse.districtId || item.operationType === fallbackHouse.operationType)
      )
      .slice(0, 3);

    currentSimilarHouses = similarHouses;
    renderHouseDetailTopRedesign(fallbackHouse, similarHouses, params);
    renderDetailMap(fallbackHouse);
    setupModalClose('bookingRequestModal');
  }
}

function getFallbackApprovedHouses() {
  if (typeof getAllVacantHouses === 'function') {
    return getAllVacantHouses().filter((house) => house.isApproved);
  }
  if (typeof VACANT_HOUSE_LIST !== 'undefined' && Array.isArray(VACANT_HOUSE_LIST)) {
    return VACANT_HOUSE_LIST.filter((house) => house.isApproved);
  }
  return [];
}

function getFallbackHouseById(houseId) {
  return getFallbackApprovedHouses().find((house) => String(house.id) === String(houseId)) || null;
}

function renderHouseDetailTopRedesign(house, similarHouses = [], params = {}) {
  const main = document.getElementById('houseDetailMain');
  if (!main) return;

  const defaultDetailPhoto = '../assets/images/hero-yeongju.jpg';
  const primaryPhoto = (typeof getHousePhotoUrl === 'function' ? getHousePhotoUrl(house) : '') || defaultDetailPhoto;
  const housePhotos = buildHouseGalleryPhotos(house, primaryPhoto);
  const isWishlisted = getWishlist().includes(house.id);
  const availablePeriod = house.availablePeriod || '\uC77C\uC815 \uD611\uC758';
  const usagePurpose = Array.isArray(house.usagePurpose) && house.usagePurpose.length
    ? house.usagePurpose
    : [DETAIL_OPERATION_LABELS[house.operationType] || '\uACF5\uACF5 \uC219\uBC15 \uACF5\uAC04'];
  const facilities = Array.isArray(house.facilities) && house.facilities.length
    ? house.facilities
    : ['\uAE30\uBCF8 \uC124\uBE44 \uC810\uAC80 \uC644\uB8CC', '\uC8FC\uBCC0 \uC811\uADFC \uC0C1\uD0DC \uC591\uD638', '\uACF5\uACF5 \uC0AC\uC6A9 \uAC00\uB2A5'];
  const tags = Array.isArray(house.tags) && house.tags.length
    ? house.tags
    : [house.districtName, DETAIL_OPERATION_LABELS[house.operationType]].filter(Boolean);
  const reviewSummary = house.reviewSummary || '\uC601\uC8FC\uC2DC \uACF5\uACF5\uAE30\uAD00 \uAC80\uD1A0\uB97C \uAC70\uCCD0 \uACF5\uAC1C \uAC00\uB2A5\uD55C \uBE48\uC9D1\uC73C\uB85C \uB4F1\uB85D\uB418\uC5C8\uC2B5\uB2C8\uB2E4. \uC2E4\uC81C \uC774\uC6A9 \uC804\uC5D0\uB294 \uD604\uC7A5 \uC0C1\uD0DC\uC640 \uC774\uC6A9 \uC870\uAC74\uC744 \uB2E4\uC2DC \uD655\uC778\uD574 \uC8FC\uC138\uC694.';
  const houseName = escapeHtml(house.name || '\uC2B9\uC778 \uBE48\uC9D1');
  const districtNameRaw = house.districtName || '-';
  const districtName = escapeHtml(districtNameRaw);
  const reviews = getHouseReviewsById(house.id);
  const reviewStats = getHouseReviewStats(reviews);
  const address = escapeHtml(house.address || '-');
  const wishlistLabel = isWishlisted ? '\uCC1C \uD574\uC81C' : '\uCC1C\uD558\uAE30';
  const searchSummaryChips = buildDetailSearchSummary(params, house);
  const fallbackSummaryChips = [
    districtNameRaw ? `\uC601\uC8FC\uC2DC ${districtNameRaw}` : '',
    house.maxCapacity ? `${Number(house.maxCapacity)}\uBA85 \uC774\uC6A9 \uAC00\uB2A5` : '',
    DETAIL_OPERATION_LABELS[house.operationType] || '',
  ].filter(Boolean);
  const summaryChips = (searchSummaryChips.length ? searchSummaryChips : fallbackSummaryChips).slice(0, 5);
  const listSearchParams = new URLSearchParams();

  ['keyword', 'district', 'checkIn', 'checkOut', 'operationType', 'grade', 'minCapacity'].forEach((key) => {
    if (params[key]) {
      listSearchParams.set(key, params[key]);
    }
  });

  const listHref = `guest-list.html${listSearchParams.toString() ? `?${listSearchParams.toString()}` : ''}`;
  const galleryMainPhoto = housePhotos[0] || primaryPhoto;
  const gallerySidePhotos = housePhotos.slice(1, 5);

  while (gallerySidePhotos.length < 4) {
    gallerySidePhotos.push(galleryMainPhoto);
  }

  const detailTabs = [
    { id: 'detailOverview', label: '\uAC1C\uC694' },
    { id: 'detailReview', label: '\uACF5\uACF5 \uAC80\uD1A0' },
    { id: 'detailFacilities', label: '\uC2DC\uC124 \uC815\uBCF4' },
    { id: 'detailLocation', label: '\uC704\uCE58' },
    { id: 'detailReviews', label: '\uC774\uC6A9 \uD6C4\uAE30' },
    { id: 'detailPolicy', label: '\uC774\uC6A9 \uC815\uCC45' },
  ];

  main.innerHTML = `
    <div class="house-detail-page">
      <section class="house-search-summary">
        <div class="house-search-summary__inner">
          <div class="house-search-summary__content">
            <span class="house-search-summary__eyebrow">\uC601\uC8FC\uC2DC \uBE48\uC9D1 \uC774\uC6A9 \uC870\uAC74</span>
            <div class="house-search-summary__chips">
              ${summaryChips.map((chip) => `<span class="house-search-summary__chip">${escapeHtml(chip)}</span>`).join('')}
            </div>
          </div>
          <a class="house-search-summary__action" href="${escapeAttr(listHref)}">\uC870\uAC74 \uB2E4\uC2DC \uBCF4\uAE30</a>
        </div>
      </section>

      <div class="house-gallery-shell">
        <nav class="house-breadcrumb" aria-label="\uACBD\uB85C">
          <a href="../home/index.html">\uD648</a>
          <span class="house-breadcrumb__sep">/</span>
          <a href="${escapeAttr(listHref)}">\uBE48\uC9D1 \uBAA9\uB85D</a>
          <span class="house-breadcrumb__sep">/</span>
          <span class="house-breadcrumb__current">${houseName}</span>
        </nav>

        <section class="house-gallery">
          <div class="house-gallery__badge-area">
            <span class="badge badge--public">\uACF5\uAC1C \uD655\uC778</span>
            ${safeBadge(getConditionGradeBadge, house.conditionGrade)}
            ${safeBadge(getOperationTypeBadge, house.operationType)}
            ${house.isVerified ? '<span class="badge badge--public">\uAC80\uC99D \uC644\uB8CC</span>' : ''}
          </div>

          <div class="house-gallery__layout">
            <div class="house-gallery__main">
              <img class="house-gallery__image" src="${galleryMainPhoto}" alt="${houseName}">
              <div class="house-gallery__overlay">
                <div class="house-gallery__headline">
                  <span class="house-gallery__district">\uC601\uC8FC\uC2DC ${districtName}</span>
                  <h1>${houseName}</h1>
                  <p>${address}</p>
                </div>
                <span class="house-gallery__photo-count">\uC0AC\uC9C4 ${housePhotos.length || 1}\uC7A5</span>
              </div>
            </div>

            <div class="house-gallery__side">
              ${gallerySidePhotos.map((photo, index) => `
                <div class="house-gallery__side-card">
                  <img class="house-gallery__side-image" src="${photo}" alt="${houseName} \uBCF4\uC870 \uC0AC\uC9C4 ${index + 1}">
                  ${index === 3 ? '<span class="house-gallery__side-overlay">\uD604\uC7A5 \uC0AC\uC9C4 \uC815\uBCF4</span>' : ''}
                </div>
              `).join('')}
            </div>
          </div>
        </section>

        <nav class="house-detail-tabs" aria-label="\uC0C1\uC138 \uC815\uBCF4 \uC139\uC158">
          ${detailTabs.map((tab) => `<a class="house-detail-tabs__link" href="#${tab.id}">${tab.label}</a>`).join('')}
        </nav>
      </div>

      <div class="house-detail-layout">
        <div class="house-detail-info">
          <section class="house-detail-overview" id="detailOverview">
            <h2 class="house-detail-info__title">${houseName}</h2>
            <div class="house-detail-info__location">&#128205; \uACBD\uC0C1\uBD81\uB3C4 \uC601\uC8FC\uC2DC ${districtName} \u00B7 ${address}</div>
            <div class="house-detail-info__badges">
              ${safeBadge(getReviewStatusBadge, house.reviewStatus)}
              ${safeBadge(getConditionGradeBadge, house.conditionGrade)}
              ${safeBadge(getOperationTypeBadge, house.operationType)}
              ${house.isVerified ? '<span class="badge badge--public">\uAC80\uC99D \uC644\uB8CC</span>' : ''}
            </div>

            <div class="house-detail-overview__highlights">
              <div class="house-detail-overview__highlight">
                <span class="house-detail-overview__label">\uCD5C\uB300 \uC218\uC6A9 \uC778\uC6D0</span>
                <strong class="house-detail-overview__value">${Number(house.maxCapacity || 0)}\uBA85</strong>
              </div>
              <div class="house-detail-overview__highlight">
                <span class="house-detail-overview__label">\uC774\uC6A9 \uAC00\uB2A5 \uAE30\uAC04</span>
                <strong class="house-detail-overview__value">${escapeHtml(availablePeriod)}</strong>
              </div>
              <div class="house-detail-overview__highlight">
                <span class="house-detail-overview__label">\uD65C\uC6A9 \uC720\uD615</span>
                <strong class="house-detail-overview__value">${escapeHtml(DETAIL_OPERATION_LABELS[house.operationType] || '\uC815\uBCF4 \uC5C6\uC74C')}</strong>
              </div>
              <div class="house-detail-overview__highlight">
                <span class="house-detail-overview__label">\uAC80\uD1A0 \uC0C1\uD0DC</span>
                <strong class="house-detail-overview__value">${escapeHtml(getSafeConditionText(house.conditionGrade))}</strong>
              </div>
            </div>
          </section>

          <div class="house-detail-section house-detail-section--facts">
            <h2 class="house-detail-section__title"><span class="section-title-icon">&#128204;</span>\uAE30\uBCF8 \uC815\uBCF4</h2>
            <div class="house-info-grid">
              <div class="house-info-item">
                <div class="house-info-item__label">\uC704\uCE58</div>
                <div class="house-info-item__value">\uC601\uC8FC\uC2DC ${districtName}</div>
              </div>
              <div class="house-info-item">
                <div class="house-info-item__label">\uCD5C\uB300 \uC218\uC6A9 \uC778\uC6D0</div>
                <div class="house-info-item__value">${Number(house.maxCapacity || 0)}\uBA85</div>
              </div>
              <div class="house-info-item">
                <div class="house-info-item__label">\uC774\uC6A9 \uAC00\uB2A5 \uAE30\uAC04</div>
                <div class="house-info-item__value">${escapeHtml(availablePeriod)}</div>
              </div>
              <div class="house-info-item">
                <div class="house-info-item__label">\uC774\uC6A9 \uBAA9\uC801</div>
                <div class="house-info-item__value">${escapeHtml(usagePurpose.join(', '))}</div>
              </div>
              <div class="house-info-item">
                <div class="house-info-item__label">\uC2B9\uC778\uC77C</div>
                <div class="house-info-item__value">${formatDateKo(house.approvedAt || house.registeredAt)}</div>
              </div>
              <div class="house-info-item">
                <div class="house-info-item__label">\uCCAD\uC18C \uC644\uB8CC</div>
                <div class="house-info-item__value">${house.isCleaningDone ? '\uC644\uB8CC' : '\uC0AC\uC804 \uD655\uC778 \uD544\uC694'}</div>
              </div>
            </div>
          </div>

          <div class="house-detail-section house-detail-section--story">
            <h2 class="house-detail-section__title"><span class="section-title-icon">&#128214;</span>\uACF5\uAC04 \uC18C\uAC1C</h2>
            <p class="house-description-text">${escapeHtml(house.description || '\uB4F1\uB85D\uB41C \uC0C1\uC138 \uC124\uBA85\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.')}</p>
          </div>

          <div class="house-detail-section house-detail-section--facilities" id="detailFacilities">
            <h2 class="house-detail-section__title"><span class="section-title-icon">&#127968;</span>\uC8FC\uC694 \uC2DC\uC124</h2>
            <div class="house-facilities-list">
              ${facilities.map((facility) => `<span class="house-facility-tag">&#10003; ${escapeHtml(facility)}</span>`).join('')}
            </div>
          </div>

          <div class="house-detail-section house-detail-section--review" id="detailReview">
            <h2 class="house-detail-section__title"><span class="section-title-icon">&#128221;</span>\uACF5\uACF5\uAE30\uAD00 \uAC80\uD1A0 \uACB0\uACFC</h2>
            <div class="review-panel review-panel--approved">
              <div class="review-panel__headline">
                <span class="review-panel__tag">\uAC80\uD1A0 \uC644\uB8CC</span>
                <span class="review-panel__title">\uC601\uC8FC\uC2DC \uACF5\uACF5\uAE30\uAD00 \uAC80\uD1A0 \uBC0F \uC2B9\uC778</span>
              </div>
              <p class="review-panel__body">${escapeHtml(reviewSummary)}</p>
            </div>

            <div class="info-panel info-panel--neutral">
              <div class="info-panel__header">
                <span class="info-panel__header-icon">&#8505;</span>
                <span class="info-panel__header-title">\uC0C1\uD0DC \uB4F1\uAE09 \uC548\uB0B4</span>
              </div>
              <div class="info-panel__body">
                <p class="info-panel__summary">${escapeHtml(getSafeConditionText(house.conditionGrade))}</p>
                <p class="info-panel__detail">\uC6B4\uC601 \uC804 \uCD5C\uC885 \uC810\uAC80\uACFC \uD604\uC7A5 \uD655\uC778 \uACB0\uACFC\uC5D0 \uB530\uB77C \uC2E4\uC81C \uC774\uC6A9 \uC870\uAC74\uC740 \uC870\uC815\uB420 \uC218 \uC788\uC2B5\uB2C8\uB2E4.</p>
              </div>
            </div>

            <div class="info-panel info-panel--caution">
              <div class="info-panel__header">
                <span class="info-panel__header-icon">!</span>
                <span class="info-panel__header-title">\uC774\uC6A9 \uC804 \uC8FC\uC758\uC0AC\uD56D</span>
              </div>
              <div class="info-panel__body">
                <p class="info-panel__detail">${escapeHtml(getSafeGradeCautionText(house.conditionGrade))}</p>
              </div>
            </div>
          </div>

          <div class="house-detail-section house-detail-section--location" id="detailLocation">
            <h2 class="house-detail-section__title"><span class="section-title-icon">&#128205;</span>\uC704\uCE58 \uBC0F \uC9C0\uB3C4</h2>
            <div class="house-location-grid">
              <div class="house-location-copy">
                <p class="house-location-copy__lead">\uC601\uC8FC\uC2DC ${districtName} \uAE30\uC900 \uAC70\uC810\uACFC \uC778\uC811 \uACF5\uACF5 \uC2DC\uC124 \uD655\uC778\uC774 \uAC00\uB2A5\uD558\uBA70, \uC774\uC6A9 \uC804 \uAD50\uD1B5\uACFC \uC8FC\uBCC0 \uD658\uACBD \uC870\uAC74\uC744 \uD568\uAED8 \uC0B4\uD3B4\uBCFC \uC218 \uC788\uC2B5\uB2C8\uB2E4.</p>
                <div class="house-policy-list">
                  <div class="house-policy-item">
                    <strong>\uC704\uCE58</strong>
                    <span>${address}</span>
                  </div>
                  <div class="house-policy-item">
                    <strong>\uAE30\uCD08 \uC548\uB0B4</strong>
                    <span>\uC774\uC6A9 \uC694\uCCAD \uC774\uD6C4 \uC815\uD655\uD55C \uAE38\uC548\uB0B4\uC640 \uC8FC\uBCC0 \uC811\uADFC \uC815\uBCF4\uAC00 \uD568\uAED8 \uC81C\uACF5\uB429\uB2C8\uB2E4.</span>
                  </div>
                  <div class="house-policy-item">
                    <strong>\uC601\uC8FC\uC2DC \uAE30\uC900 \uC815\uBCF4</strong>
                    <span>\uC601\uC8FC\uC2DC \uBE48\uC9D1 \uC704\uCE58 \uBC0F \uAD8C\uC5ED \uC815\uBCF4\uB294 \uACF5\uACF5\uB370\uC774\uD130 \uAE30\uC900\uC744 \uBC18\uC601\uD574 \uC548\uB0B4\uD569\uB2C8\uB2E4.</span>
                  </div>
                </div>
              </div>
              <div class="house-detail-map booking-map" id="detailLocationMap"></div>
            </div>
          </div>

          <div class="house-detail-section house-detail-section--policy" id="detailPolicy">
            <h2 class="house-detail-section__title"><span class="section-title-icon">&#128203;</span>\uC774\uC6A9 \uC815\uCC45 \uBC0F \uD589\uC815 \uC548\uB0B4</h2>
            <div class="house-policy-list">
              <div class="house-policy-item">
                <strong>\uC774\uC6A9 \uC694\uCCAD \uBC29\uC2DD</strong>
                <span>\uC774\uC6A9 \uC2E0\uCCAD\uC740 \uC989\uC2DC \uD655\uC815\uB418\uC9C0 \uC54A\uC73C\uBA70, \uC601\uC8FC\uC2DC \uAD00\uB9AC\uC790 \uAC80\uD1A0\uC640 \uC2B9\uC778 \uC808\uCC28\uB97C \uAC70\uCCD0 \uCD5C\uC885 \uC5EC\uBD80\uAC00 \uACB0\uC815\uB429\uB2C8\uB2E4.</span>
              </div>
              <div class="house-policy-item">
                <strong>\uCCB4\uB958 \uBC0F \uC77C\uC815 \uD611\uC758</strong>
                <span>\uC778\uC6D0, \uAE30\uAC04, \uD65C\uC6A9 \uBAA9\uC801\uC5D0 \uB530\uB77C \uC77C\uBC18 \uC219\uBC15\uACFC \uB2E4\uB978 \uC6B4\uC601 \uAE30\uC900\uC774 \uC801\uC6A9\uB420 \uC218 \uC788\uC5B4 \uC0AC\uC804 \uC548\uB0B4\uAC00 \uC911\uC694\uD569\uB2C8\uB2E4.</span>
              </div>
              <div class="house-policy-item">
                <strong>\uBC95\uC801 \u00B7 \uD589\uC815 \uC815\uBCF4</strong>
                <span>\uC601\uC8FC\uC2DC \uACF5\uAC1C \uC0C1\uD0DC\uC640 \uAD00\uB9AC \uAE30\uC900\uC5D0 \uB530\uB978 \uAE30\uBCF8 \uC548\uB0B4\uC774\uBA70, \uC0C1\uC138 \uBC95\uC801 \uC815\uBCF4\uB294 \uBCC4\uB3C4 \uC548\uB0B4 \uD398\uC774\uC9C0\uC640 \uD568\uAED8 \uD655\uC778\uD574 \uC8FC\uC138\uC694.</span>
              </div>
            </div>
          </div>

          <div class="house-detail-section house-detail-section--tags">
            <h2 class="house-detail-section__title"><span class="section-title-icon">#</span>\uD0DC\uADF8</h2>
            <div class="house-tags-list">
              ${tags.map((tag) => `<span class="house-tag-item">${escapeHtml(tag)}</span>`).join('')}
            </div>
          </div>

          ${renderHouseReviewSection(house, reviews, reviewStats)}
        </div>

        <div class="booking-sidebar">
          <div class="booking-card">
            <div class="booking-card__header">
              <div class="booking-card__price">${escapeHtml(house.priceRange || '\uC77C\uC815 \uD611\uC758')}</div>
              <div class="booking-card__price-label">\uC601\uC8FC\uC2DC \uACF5\uACF5\uAE30\uAD00 \uAC80\uD1A0\uAC00 \uC644\uB8CC\uB41C \uBE48\uC9D1 \uC774\uC6A9 \uC548\uB0B4</div>
            </div>
            <div class="booking-card__body">
              <div class="booking-card__info-row">
                <span class="booking-card__info-label">\uACF5\uACF5\uB370\uC774\uD130 \uC0C1\uD0DC</span>
                <span class="booking-card__info-value">${escapeHtml(getSafeConditionText(house.conditionGrade))}</span>
              </div>
              <div class="booking-card__info-row">
                <span class="booking-card__info-label">\uC774\uC6A9 \uC720\uD615</span>
                <span class="booking-card__info-value">${escapeHtml(DETAIL_OPERATION_LABELS[house.operationType] || '\uC815\uBCF4 \uC5C6\uC74C')}</span>
              </div>
              <div class="booking-card__info-row">
                <span class="booking-card__info-label">\uCD5C\uB300 \uC778\uC6D0</span>
                <span class="booking-card__info-value">${Number(house.maxCapacity || 0)}\uBA85</span>
              </div>
              <div class="booking-card__info-row">
                <span class="booking-card__info-label">\uC774\uC6A9 \uAE30\uAC04</span>
                <span class="booking-card__info-value">${escapeHtml(availablePeriod)}</span>
              </div>

              <button class="btn btn--primary btn--full btn--lg" onclick="openBookingModal()">\uC774\uC6A9 \uC2E0\uCCAD \uC811\uC218</button>
              <button class="btn btn--ghost btn--full" id="detailWishlistBtn" onclick="handleDetailWishlist('${escapeAttr(house.id)}')">${wishlistLabel}</button>

              <div class="booking-notice">
                <span>\uC548\uB0B4</span>
                <p>\uC774\uC6A9 \uC694\uCCAD\uC740 \uC989\uC2DC \uD655\uC815\uB418\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.<br>\uC601\uC8FC\uC2DC \uAD00\uB9AC\uC790 \uAC80\uD1A0 \uACB0\uACFC\uB97C \uBC18\uC601\uD574 \uC2B9\uC778 \uC5EC\uBD80\uB97C \uC548\uB0B4\uD574 \uB4DC\uB9BD\uB2C8\uB2E4.</p>
              </div>

              <div class="booking-location-label">\uC120\uD0DD\uD55C \uBE48\uC9D1 \uC704\uCE58</div>
              <div class="booking-location-addr">\uACBD\uC0C1\uBD81\uB3C4 \uC601\uC8FC\uC2DC ${districtName}</div>
              <div class="booking-map" id="bookingLocationMap"></div>
            </div>
          </div>
        </div>
      </div>

      ${similarHouses.length > 0 ? `
        <div class="similar-houses-section">
          <div class="similar-houses-section__header">
            <h2 class="similar-houses-section__title">\uBE44\uC2B7\uD55C \uC601\uC8FC \uBE48\uC9D1</h2>
          </div>
          <div class="grid grid--3">
            ${similarHouses.map((item) => `
              <a href="guest-detail.html?id=${encodeURIComponent(item.id)}" style="text-decoration:none;color:inherit;">
                <div class="card">
                  <div class="card__image-placeholder">${DETAIL_OPERATION_EMOJIS[item.operationType] || '\uD83C\uDFE0'}</div>
                  <div class="card__body">
                    <div style="font-size:var(--font-size-xs);color:var(--color-text-muted);margin-bottom:4px;">&#128205; \uC601\uC8FC\uC2DC ${escapeHtml(item.districtName || '-')}</div>
                    <h3 class="card__title">${escapeHtml(item.name || '\uC2B9\uC778 \uBE48\uC9D1')}</h3>
                    <div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:8px;">
                      ${safeBadge(getConditionGradeBadge, item.conditionGrade)}
                      ${safeBadge(getOperationTypeBadge, item.operationType)}
                    </div>
                  </div>
                </div>
              </a>
            `).join('')}
          </div>
        </div>
      ` : ''}
    </div>
  `;

  syncDetailWishlistButton();
  bindHouseReviewEvents(house);
}


function renderHouseDetail(house, similarHouses = []) {
  const main = document.getElementById('houseDetailMain');
  if (!main) return;

  const defaultDetailPhoto = '../assets/images/hero-yeongju.jpg';
  const primaryPhoto = (typeof getHousePhotoUrl === 'function' ? getHousePhotoUrl(house) : '') || defaultDetailPhoto;
  const housePhotos = typeof getHousePhotos === 'function' ? getHousePhotos(house) : [];
  const isWishlisted = getWishlist().includes(house.id);
  const availablePeriod = house.availablePeriod || '일정 협의';
  const usagePurpose = Array.isArray(house.usagePurpose) && house.usagePurpose.length
    ? house.usagePurpose
    : [DETAIL_OPERATION_LABELS[house.operationType] || '공공 숙박 공간'];
  const facilities = Array.isArray(house.facilities) && house.facilities.length
    ? house.facilities
    : ['기본 설비 점검 완료', '주방 상태 양호', '공공 사용 가능'];
  const tags = Array.isArray(house.tags) && house.tags.length
    ? house.tags
    : [house.districtName, DETAIL_OPERATION_LABELS[house.operationType]].filter(Boolean);
  const reviewSummary = house.reviewSummary || '공공기관 검토를 거쳐 공개 가능한 빈집으로 등록했습니다. 실제 이용 전 운영 조건과 현장 상태를 다시 확인해 주세요.';
  const houseName = escapeHtml(house.name || '승인 빈집');
  const districtName = escapeHtml(house.districtName || '-');
  const reviews = getHouseReviewsById(house.id);
  const reviewStats = getHouseReviewStats(reviews);
  const address = escapeHtml(house.address || '-');
  const wishlistLabel = isWishlisted ? '찜 해제' : '찜하기';

  main.innerHTML = `
    <div class="house-detail-page">
      <div class="house-gallery">
        ${primaryPhoto ? `<img class="house-gallery__image" src="${primaryPhoto}" alt="${houseName}">` : ''}
        ${primaryPhoto ? '' : `<span class="house-gallery__emoji">${DETAIL_OPERATION_EMOJIS[house.operationType] || '🏠'}</span>`}
        ${housePhotos.length > 1 ? `
          <div class="house-gallery__thumbs">
            ${housePhotos.slice(0, 5).map((photo) => `
              <img src="${photo.dataUrl || photo.url || photo.src}" alt="${escapeHtml(photo.name || house.name || '첨부 사진')}">
            `).join('')}
          </div>
        ` : ''}
        <div class="house-gallery__badge-area">
          <span class="badge badge--public">공개 확인</span>
          ${safeBadge(getConditionGradeBadge, house.conditionGrade)}
          ${safeBadge(getOperationTypeBadge, house.operationType)}
        </div>
        <div class="house-gallery__divider"></div>
      </div>

      <div class="house-detail-layout">
        <div class="house-detail-info">
          <div class="house-detail-overview">
          <nav class="house-breadcrumb" aria-label="경로">
            <a href="../home/index.html">홈</a>
            <span class="house-breadcrumb__sep">›</span>
            <a href="guest-list.html">빈집 목록</a>
            <span class="house-breadcrumb__sep">›</span>
            <span class="house-breadcrumb__current">${houseName}</span>
          </nav>

          <h1 class="house-detail-info__title">${houseName}</h1>
          <div class="house-detail-info__location">📍 경상북도 영주시 ${districtName} · ${address}</div>
          <div class="house-detail-info__badges">
            ${safeBadge(getReviewStatusBadge, house.reviewStatus)}
            ${safeBadge(getConditionGradeBadge, house.conditionGrade)}
            ${safeBadge(getOperationTypeBadge, house.operationType)}
            ${house.isVerified ? '<span class="badge badge--public">검증 완료</span>' : ''}
          </div>
          </div>

          <div class="house-detail-section house-detail-section--facts">
            <h2 class="house-detail-section__title"><span class="section-title-icon">📋</span>기본 정보</h2>
            <div class="house-info-grid">
              <div class="house-info-item">
                <div class="house-info-item__label">위치</div>
                <div class="house-info-item__value">영주시 ${districtName}</div>
              </div>
              <div class="house-info-item">
                <div class="house-info-item__label">최대 수용 인원</div>
                <div class="house-info-item__value">${Number(house.maxCapacity || 0)}명</div>
              </div>
              <div class="house-info-item">
                <div class="house-info-item__label">이용 가능 기간</div>
                <div class="house-info-item__value">${escapeHtml(availablePeriod)}</div>
              </div>
              <div class="house-info-item">
                <div class="house-info-item__label">이용 목적</div>
                <div class="house-info-item__value">${escapeHtml(usagePurpose.join(', '))}</div>
              </div>
              <div class="house-info-item">
                <div class="house-info-item__label">확인일</div>
                <div class="house-info-item__value">${formatDateKo(house.approvedAt || house.registeredAt)}</div>
              </div>
              <div class="house-info-item">
                <div class="house-info-item__label">청소 완료</div>
                <div class="house-info-item__value">${house.isCleaningDone ? '완료' : '사전 확인 필요'}</div>
              </div>
            </div>
          </div>

          <div class="house-detail-section house-detail-section--story">
            <h2 class="house-detail-section__title"><span class="section-title-icon">🏡</span>공간 소개</h2>
            <p class="house-description-text">${escapeHtml(house.description || '등록된 상세 설명이 없습니다.')}</p>
          </div>

          <div class="house-detail-section house-detail-section--facilities">
            <h2 class="house-detail-section__title"><span class="section-title-icon">✨</span>주요 시설</h2>
            <div class="house-facilities-list">
              ${facilities.map((facility) => `<span class="house-facility-tag">• ${escapeHtml(facility)}</span>`).join('')}
            </div>
          </div>

          <div class="house-detail-section house-detail-section--review">
            <h2 class="house-detail-section__title"><span class="section-title-icon">🛡️</span>공공기관 검토 결과</h2>
            <div class="review-panel review-panel--approved">
              <div class="review-panel__headline">
                <span class="review-panel__tag">검토 완료</span>
                <span class="review-panel__title">영주시 공공기관 검토 확인</span>
              </div>
              <p class="review-panel__body">${escapeHtml(reviewSummary)}</p>
            </div>

            <div class="info-panel info-panel--neutral">
              <div class="info-panel__header">
                <span class="info-panel__header-icon">📌</span>
                <span class="info-panel__header-title">상태 등급 안내</span>
              </div>
              <div class="info-panel__body">
                <p class="info-panel__summary">${escapeHtml(getSafeConditionText(house.conditionGrade))}</p>
                <p class="info-panel__detail">운영 전 최종 점검과 현장 확인 결과에 따라 실제 이용 조건은 조정될 수 있습니다.</p>
              </div>
            </div>

            <div class="info-panel info-panel--caution">
              <div class="info-panel__header">
                <span class="info-panel__header-icon">⚠️</span>
                <span class="info-panel__header-title">이용 전 주의사항</span>
              </div>
              <div class="info-panel__body">
                <p class="info-panel__detail">${escapeHtml(getSafeGradeCautionText(house.conditionGrade))}</p>
              </div>
            </div>
          </div>

          <div class="house-detail-section house-detail-section--tags">
            <h2 class="house-detail-section__title"><span class="section-title-icon">#</span>태그</h2>
            <div class="house-tags-list">
              ${tags.map((tag) => `<span class="house-tag-item">${escapeHtml(tag)}</span>`).join('')}
            </div>
          </div>

          ${renderHouseReviewSection(house, reviews, reviewStats)}
        </div>

        <div class="booking-sidebar">
          <div class="booking-card">
            <div class="booking-card__header">
              <div class="booking-card__price">${escapeHtml(house.priceRange || '일정 협의')}</div>
              <div class="booking-card__price-label">영주시 공공기관 확인 빈집</div>
            </div>
            <div class="booking-card__body">
              <div class="booking-card__info-row">
                <span class="booking-card__info-label">공공데이터 상태</span>
                <span class="booking-card__info-value">${escapeHtml(getSafeConditionText(house.conditionGrade))}</span>
              </div>
              <div class="booking-card__info-row">
                <span class="booking-card__info-label">운영 유형</span>
                <span class="booking-card__info-value">${escapeHtml(DETAIL_OPERATION_LABELS[house.operationType] || '정보 없음')}</span>
              </div>
              <div class="booking-card__info-row">
                <span class="booking-card__info-label">최대 인원</span>
                <span class="booking-card__info-value">${Number(house.maxCapacity || 0)}명</span>
              </div>
              <div class="booking-card__info-row">
                <span class="booking-card__info-label">이용 기간</span>
                <span class="booking-card__info-value">${escapeHtml(availablePeriod)}</span>
              </div>

              <button class="btn btn--primary btn--full btn--lg" onclick="openBookingModal()">예약 요청 접수</button>
              <button class="btn btn--ghost btn--full" id="detailWishlistBtn" onclick="handleDetailWishlist('${escapeAttr(house.id)}')">${wishlistLabel}</button>

              <div class="booking-notice">
                <span>안내</span>
                <p>예약 요청은 즉시 확정되지 않습니다.<br>관리자 검토 후 확인 여부를 안내드립니다.</p>
              </div>

              <div class="booking-location-label">선택한 빈집 위치</div>
              <div class="booking-location-addr">경상북도 영주시 ${districtName}</div>
              <div class="booking-map" id="bookingLocationMap"></div>
            </div>
          </div>
        </div>
      </div>

      ${similarHouses.length > 0 ? `
        <div class="similar-houses-section">
          <div class="similar-houses-section__header">
            <h2 class="similar-houses-section__title">비슷한 영주 빈집</h2>
          </div>
          <div class="grid grid--3">
            ${similarHouses.map((item) => `
              <a href="guest-detail.html?id=${encodeURIComponent(item.id)}" style="text-decoration:none;color:inherit;">
                <div class="card">
                  <div class="card__image-placeholder">${DETAIL_OPERATION_EMOJIS[item.operationType] || '🏠'}</div>
                  <div class="card__body">
                    <div style="font-size:var(--font-size-xs);color:var(--color-text-muted);margin-bottom:4px;">📍 영주시 ${escapeHtml(item.districtName || '-')}</div>
                    <h3 class="card__title">${escapeHtml(item.name || '승인 빈집')}</h3>
                    <div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:8px;">
                      ${safeBadge(getConditionGradeBadge, item.conditionGrade)}
                      ${safeBadge(getOperationTypeBadge, item.operationType)}
                    </div>
                  </div>
                </div>
              </a>
            `).join('')}
          </div>
        </div>
      ` : ''}
    </div>
  `;

  syncDetailWishlistButton();
  bindHouseReviewEvents(house);
}

function renderHouseReviewSection(house, reviews, stats) {
  const currentUser = typeof getCurrentUser === 'function' ? getCurrentUser() : null;
  const defaultAuthor = currentUser?.name || currentUser?.email || '방문자';
  const reviewItems = reviews.length
    ? reviews.map((review) => `
        <article class="house-review-card">
          <div class="house-review-card__meta">
            <div>
              <div class="house-review-card__author">${escapeHtml(review.author || '방문자')}</div>
              <div class="house-review-card__date">${escapeHtml(formatDateKo(review.createdAt))}</div>
            </div>
            <div class="house-review-card__score-wrap">
              <span class="house-review-card__score">${renderReviewStars(review.rating)}</span>
              <span class="house-review-card__rating">${Number(review.rating || 0).toFixed(1)}</span>
              <span class="house-review-card__recommend ${review.recommended ? 'is-positive' : 'is-neutral'}">
                ${review.recommended ? '추천해요' : '보통이에요'}
              </span>
            </div>
          </div>
          <p class="house-review-card__content">${escapeHtml(review.content || '')}</p>
        </article>
      `).join('')
    : `
        <div class="house-review-empty">
          아직 등록된 이용 후기가 없습니다. 첫 후기를 남겨 보세요.
        </div>
      `;

  return `
    <section class="house-detail-section house-detail-section--reviews" id="detailReviews">
      <div class="house-review-section__header">
        <div>
          <h2 class="house-detail-section__title"><span class="section-title-icon">★</span>이용 후기</h2>
          <p class="house-review-section__subtitle">영주시 승인 빈집을 이용한 뒤 느낀 점과 추천 여부를 자유롭게 남길 수 있습니다.</p>
        </div>
        <div class="house-review-summary">
          <div class="house-review-summary__item">
            <span class="house-review-summary__label">평균 별점</span>
            <strong class="house-review-summary__value">${stats.averageLabel}</strong>
          </div>
          <div class="house-review-summary__item">
            <span class="house-review-summary__label">리뷰 수</span>
            <strong class="house-review-summary__value">${stats.total}건</strong>
          </div>
          <div class="house-review-summary__item">
            <span class="house-review-summary__label">추천</span>
            <strong class="house-review-summary__value">${stats.recommended}명</strong>
          </div>
        </div>
      </div>

      <form class="house-review-form" id="houseReviewForm">
        <div class="house-review-form__grid">
          <label class="house-review-form__field">
            <span class="house-review-form__label">작성자</span>
            <input type="text" class="form-control" id="houseReviewAuthor" value="${escapeAttr(defaultAuthor)}" placeholder="이름 또는 닉네임">
          </label>
          <label class="house-review-form__field">
            <span class="house-review-form__label">별점</span>
            <select class="form-select" id="houseReviewRating">
              <option value="5">5점</option>
              <option value="4">4점</option>
              <option value="3">3점</option>
              <option value="2">2점</option>
              <option value="1">1점</option>
            </select>
          </label>
          <label class="house-review-form__field">
            <span class="house-review-form__label">추천 여부</span>
            <select class="form-select" id="houseReviewRecommend">
              <option value="yes">추천해요</option>
              <option value="no">보통이에요</option>
            </select>
          </label>
        </div>
        <label class="house-review-form__field house-review-form__field--full">
          <span class="house-review-form__label">리뷰 내용</span>
          <textarea class="form-control" id="houseReviewContent" rows="4" placeholder="실제로 느낀 장점, 아쉬운 점, 추천 이유를 자유롭게 적어 주세요."></textarea>
        </label>
        <div class="house-review-form__actions">
          <button type="submit" class="btn btn--primary">리뷰 등록</button>
        </div>
      </form>

      <div class="house-review-list">
        ${reviewItems}
      </div>
    </section>
  `;
}

function getStoredHouseReviews() {
  try {
    const raw = localStorage.getItem(HOUSE_REVIEW_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn('리뷰 저장 데이터를 불러오지 못했습니다.', error);
    return [];
  }
}

function getHouseReviewsById(houseId) {
  return getStoredHouseReviews()
    .filter((review) => String(review.houseId) === String(houseId))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function getHouseReviewStats(reviews) {
  const total = reviews.length;
  const average = total
    ? reviews.reduce((sum, review) => sum + Number(review.rating || 0), 0) / total
    : 0;
  const recommended = reviews.filter((review) => review.recommended).length;

  return {
    total,
    average,
    averageLabel: total ? average.toFixed(1) : '0.0',
    recommended,
  };
}

function saveHouseReview(review) {
  const reviews = getStoredHouseReviews();
  reviews.unshift(review);
  localStorage.setItem(HOUSE_REVIEW_STORAGE_KEY, JSON.stringify(reviews));
}

function renderReviewStars(rating) {
  const normalized = Math.max(1, Math.min(5, Math.round(Number(rating) || 0)));
  return `${'★'.repeat(normalized)}${'☆'.repeat(5 - normalized)}`;
}

function bindHouseReviewEvents(house) {
  const form = document.getElementById('houseReviewForm');
  if (!form) return;

  form.addEventListener('submit', (event) => {
    event.preventDefault();

    const author = document.getElementById('houseReviewAuthor')?.value.trim() || '방문자';
    const rating = Number(document.getElementById('houseReviewRating')?.value || 5);
    const recommended = document.getElementById('houseReviewRecommend')?.value !== 'no';
    const content = document.getElementById('houseReviewContent')?.value.trim() || '';

    if (!content) {
      showToast?.('리뷰 내용을 입력해 주세요.', 'warning');
      return;
    }

    saveHouseReview({
      id: `review-${Date.now()}`,
      houseId: house.id,
      author,
      rating,
      recommended,
      content,
      createdAt: new Date().toISOString(),
    });

    renderHouseDetailTopRedesign(currentHouse, currentSimilarHouses, currentHouseDetailParams);
    renderDetailMap(currentHouse);

    const reviewSection = document.querySelector('.house-detail-section--reviews');
    reviewSection?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    showToast?.('리뷰가 등록되었습니다.', 'success');
  });
}

function showNotFound() {
  const main = document.getElementById('houseDetailMain');
  if (!main) return;

  main.innerHTML = `
    <div class="access-denied">
      <div class="access-denied__icon">🏠</div>
      <h2 class="access-denied__title">빈집 정보를 찾을 수 없습니다</h2>
      <p class="access-denied__desc">해당 빈집이 존재하지 않거나 아직 공개 승인되지 않았습니다.</p>
      <a href="guest-list.html" class="btn btn--primary">목록으로 돌아가기</a>
    </div>
  `;
}

function openBookingModal() {
  if (!isLoggedIn()) {
    showToast('로그인 후 예약 요청이 가능합니다.', 'warning');
    setTimeout(() => { window.location.href = '../auth/login.html'; }, 1000);
    return;
  }
  syncBookingDatesFromUrl();
  openModal('bookingRequestModal');
}

function submitBookingRequest() {
  const checkIn = document.getElementById('bookingCheckIn').value;
  const checkOut = document.getElementById('bookingCheckOut').value;
  const guests = document.getElementById('bookingGuests').value;
  const purpose = document.getElementById('bookingPurpose')?.value.trim() || '';
  const user = getCurrentUser();

  if (!checkIn || !checkOut) {
    showToast('체크인과 체크아웃 날짜를 선택해 주세요.', 'warning');
    return;
  }

  if (new Date(checkIn) >= new Date(checkOut)) {
    showToast('체크아웃은 체크인 이후여야 합니다.', 'warning');
    return;
  }

  if (!currentHouse || !user) {
    showToast('예약 요청에 필요한 정보를 찾을 수 없습니다.', 'warning');
    return;
  }

  if (!isBookingRangeAvailable(currentHouse.id, checkIn, checkOut)) {
    showToast('선택한 날짜에는 이미 예약 요청이 있어 다른 빈집을 확인해 주세요.', 'warning');
    return;
  }

  const bookingOwner = resolveBookingOwner(currentHouse);

  if (typeof saveBookingRequest === 'function') {
    saveBookingRequest({
      houseId: currentHouse.id,
      houseName: currentHouse.name,
      districtId: currentHouse.districtId || '',
      districtName: currentHouse.districtName || '',
      ownerType: currentHouse.ownerType || 'private',
      ownerUserId: bookingOwner.ownerUserId || '',
      ownerEmail: bookingOwner.ownerEmail || '',
      ownerName: bookingOwner.ownerName || '',
      checkIn,
      checkOut,
      purpose,
      guestCount: Number(guests || 1),
      guests: Number(guests || 1),
      guestUserId: user.id || '',
      guestEmail: user.email || '',
      guestName: user.name || 'user',
    });
  }

  closeModal('bookingRequestModal');
  showToast('예약 요청이 접수되었습니다. 검토 후 안내드리겠습니다.', 'success');
}

function resolveBookingOwner(house) {
  const directOwner = {
    ownerUserId: house?.ownerUserId || '',
    ownerEmail: house?.ownerEmail || '',
    ownerName: house?.ownerName || '',
  };

  if (directOwner.ownerUserId || directOwner.ownerEmail || directOwner.ownerName) {
    return directOwner;
  }

  const fallbackHouse = typeof getVacantHouseById === 'function' ? getVacantHouseById(house?.id) : null;
  return {
    ownerUserId: fallbackHouse?.ownerUserId || '',
    ownerEmail: fallbackHouse?.ownerEmail || '',
    ownerName: fallbackHouse?.ownerName || '',
  };
}

function syncBookingDatesFromUrl() {
  const params = getUrlParams();
  const checkInField = document.getElementById('bookingCheckIn');
  const checkOutField = document.getElementById('bookingCheckOut');

  if (checkInField && params.checkIn && !checkInField.value) {
    checkInField.value = params.checkIn;
  }

  if (checkOutField && params.checkOut && !checkOutField.value) {
    checkOutField.value = params.checkOut;
  }
}

function isBookingRangeAvailable(houseId, checkIn, checkOut) {
  if (typeof getAllBookingRequests !== 'function') {
    return true;
  }

  const requestedStart = new Date(checkIn);
  const requestedEnd = new Date(checkOut);
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

function handleDetailWishlist(houseId) {
  if (!isLoggedIn()) {
    showToast('로그인 후 찜 기능을 이용할 수 있습니다.', 'warning');
    setTimeout(() => { window.location.href = '../auth/login.html'; }, 300);
    return;
  }

  const added = toggleWishlist(houseId);
  if (added === null) return;

  const button = document.getElementById('detailWishlistBtn');
  if (button) {
    button.textContent = added ? '찜 해제' : '찜하기';
  }
}

function syncDetailWishlistButton() {
  if (!currentHouse) return;

  const button = document.getElementById('detailWishlistBtn');
  if (!button) return;

  const isWishlisted = getWishlist().includes(currentHouse.id);
  button.textContent = isWishlisted ? '찜 해제' : '찜하기';
}

function safeBadge(badgeFn, value) {
  if (typeof badgeFn === 'function') {
    return badgeFn(value);
  }
  return '';
}

function getSafeConditionText(grade) {
  if (typeof getConditionGradeText === 'function') {
    return getConditionGradeText(grade);
  }
  return grade || '확인 필요';
}

function getSafeGradeCautionText(grade) {
  if (typeof getGradeCautionText === 'function') {
    return getGradeCautionText(grade);
  }
  return '실제 이용 전 현장 상태와 운영 조건을 다시 확인해 주세요.';
}

function formatDateKo(dateValue) {
  if (!dateValue) return '-';
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return String(dateValue);
  return date.toLocaleDateString('ko-KR');
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
