/**
 * guest-map.js
 * 영주시 공공형 빈집 활용 플랫폼 - 지도보기 페이지 스크립트
 */

const API_BASE_URL = typeof getApiBaseUrl === 'function' ? getApiBaseUrl() : 'http://localhost:8000';

const YEONGJU_BOUNDS = L.latLngBounds([36.75, 128.45], [37.05, 128.80]);
const YEONGJU_CENTER = [36.872, 128.60];
const DEFAULT_ZOOM = 11;
const DISTRICT_FOCUS_ZOOM = 13;

const DISTRICT_COORDS = {
  '풍기읍': [36.9830, 128.5440],
  '순흥면': [36.9420, 128.5910],
  '단산면': [36.9100, 128.5200],
  '부석면': [36.9960, 128.6700],
  '이산면': [36.8530, 128.4980],
  '문수면': [36.8000, 128.5300],
  '평은면': [36.8680, 128.6780],
  '장수면': [36.8340, 128.6360],
  '안정면': [36.9100, 128.6800],
  '봉현면': [36.8690, 128.5340],
  '영주동': [36.8050, 128.6240],
  '상망동': [36.8150, 128.6380],
  '가흥동': [36.8240, 128.6520],
  '하망동': [36.8320, 128.6630],
  '휴천동': [36.8100, 128.5950],
};

function getDistrictCoordsFromHouses(districtName) {
  const houses = getApprovedHouses().filter(house => {
    const lat = Number(house.lat);
    const lon = Number(house.lon);

    return (
      house.districtName === districtName &&
      Number.isFinite(lat) &&
      Number.isFinite(lon)
    );
  });

  if (!houses.length) {
    return DISTRICT_COORDS[districtName] || YEONGJU_CENTER;
  }

  const avgLat = houses.reduce((sum, house) => sum + Number(house.lat), 0) / houses.length;
  const avgLon = houses.reduce((sum, house) => sum + Number(house.lon), 0) / houses.length;

  return [avgLat, avgLon];
}

function focusDistrictOnMap(districtName) {
  if (!state.map || !districtName) return;

  const districtHouses = getApprovedHouses().filter((house) => {
    const lat = Number(house.lat);
    const lon = Number(house.lon);

    return (
      house &&
      house.districtName === districtName &&
      Number.isFinite(lat) &&
      Number.isFinite(lon)
    );
  });

  if (!districtHouses.length) {
    state.map.flyTo(getDistrictCoordsFromHouses(districtName), DISTRICT_FOCUS_ZOOM, { duration: 0.45 });
    return;
  }

  const bounds = L.latLngBounds(
    districtHouses.map((house) => [Number(house.lat), Number(house.lon)])
  );

  if (bounds.isValid()) {
    state.map.flyToBounds(bounds.pad(0.18), {
      duration: 0.45,
      maxZoom: DISTRICT_FOCUS_ZOOM,
      padding: [28, 28],
    });
    return;
  }

  state.map.flyTo(getDistrictCoordsFromHouses(districtName), DISTRICT_FOCUS_ZOOM, { duration: 0.45 });
}

const state = {
  map: null,
  houses: [],
  selectedDistrict: '',
  mapHoverDistrict: '',
  listHoverDistrict: '',
  search: '',
  type: 'all',
  grade: 'all',
  overlayCollapsed: false,
  markersLayer: null,
  markerElements: {},
  suppressMapResetUntil: 0,
};

const TYPE_LABELS = {
  lodging: '숙박 가능',
  longterm: '장기체류형',
  experience: '체험공간형',
  review_needed: '추가 검토 필요',
};

const TYPE_EMOJIS = {
  lodging: '🏠',
  longterm: '📅',
  experience: '🌿',
  review_needed: '🔎',
};

function normalizeGrade(grade) {
  const key = String(grade || '').trim().toUpperCase();
  if (key === '1') return 'A';
  if (key === '2') return 'B';
  if (key === '3') return 'C';
  if (key === '4') return 'D';
  return key;
}

function isApprovedVisibleHouse(house) {
  if (!house) return false;

  const status = String(house.reviewStatus || 'approved').trim().toLowerCase();
  const isApproved = house.isApproved === true || status === 'approved';

  return isApproved && status === 'approved' && house.makePublic !== false;
}

function getApprovedHouses() {
  return state.houses.filter(isApprovedVisibleHouse);
}

function suppressMapReset(duration = 420) {
  state.suppressMapResetUntil = Date.now() + duration;
}

function filterHouses(houses, { applyDistrict = true } = {}) {
  const keyword = state.search.trim().toLowerCase();

  return houses.filter(house => {
    if (!house) return false;

    if (applyDistrict && state.selectedDistrict && house.districtName !== state.selectedDistrict) {
      return false;
    }

    if (state.type !== 'all' && house.operationType !== state.type) {
      return false;
    }

    if (state.grade !== 'all' && normalizeGrade(house.conditionGrade) !== state.grade) {
      return false;
    }

    if (!keyword) return true;

    const haystack = [
      house.name,
      house.address,
      house.districtName,
      ...(Array.isArray(house.tags) ? house.tags : []),
    ].join(' ').toLowerCase();

    return haystack.includes(keyword);
  });
}

function buildDistrictCounts(houses) {
  const counts = {};
  Object.keys(DISTRICT_COORDS).forEach(name => { counts[name] = 0; });

  houses.forEach(house => {
    if (house.districtName && counts[house.districtName] !== undefined) {
      counts[house.districtName] += 1;
    }
  });

  return counts;
}

function createBubbleIcon(name, count, isSelected, maxCount) {
  const ratio = maxCount > 0 ? (count / maxCount) : 0;
  const size = Math.round(70 + Math.min(32, ratio * 32));
  const selectedClass = isSelected ? ' district-bubble--selected' : '';
  const clickableClass = count > 0 ? ' district-bubble--clickable' : '';

  return L.divIcon({
    className: '',
    html: `
      <div class="district-bubble${selectedClass}${clickableClass}" data-district="${name}" style="--bubble-size:${size}px">
        <div class="district-bubble__name">${name}</div>
        <div class="district-bubble__count">${count}건</div>
      </div>
    `,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

function syncMarkerElement(districtName, marker) {
  const markerEl = marker.getElement();
  if (!markerEl) return;

  const bubbleEl = markerEl.querySelector('.district-bubble');
  if (bubbleEl) {
    state.markerElements[districtName] = bubbleEl;
  }
}

function updateMarkerStateClasses() {
  Object.entries(state.markerElements).forEach(([districtName, el]) => {
    const isSelected = state.selectedDistrict === districtName;
    const isMapHovered = state.mapHoverDistrict === districtName;
    const isLinked = state.listHoverDistrict === districtName;

    el.classList.toggle('district-bubble--selected', isSelected);
    el.classList.toggle('district-bubble--hovered', isMapHovered);
    el.classList.toggle('district-bubble--linked', isLinked);
  });
}

function ensureMap() {
  if (state.map) return;

  state.map = L.map('districtMap', {
    center: YEONGJU_CENTER,
    zoom: DEFAULT_ZOOM,
    minZoom: 11,
    maxZoom: 15,
    zoomControl: false,
    worldCopyJump: false,
    preferCanvas: true,
  });

  L.control.zoom({ position: 'topright' }).addTo(state.map);

  state.map.fitBounds(YEONGJU_BOUNDS, { padding: [8, 8] });

  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors',
    minZoom: 11,
    maxZoom: 19,
    noWrap: true,
  }).addTo(state.map);

  state.markersLayer = L.layerGroup().addTo(state.map);

  state.map.on('click', () => {
    if (Date.now() < state.suppressMapResetUntil) {
      return;
    }

    if (state.selectedDistrict) {
      state.selectedDistrict = '';
      syncDistrictFilterUI();
      updateOverlayHint();
      renderAll();
      state.map.fitBounds(YEONGJU_BOUNDS, { padding: [8, 8] });
    }
  });
}

function renderDistrictMarkers() {
  if (!state.map || !state.markersLayer) return;

  state.markersLayer.clearLayers();
  state.markerElements = {};

  const pool = filterHouses(getApprovedHouses(), { applyDistrict: false });
  const counts = buildDistrictCounts(pool);
  const maxCount = Math.max(...Object.values(counts), 0);

  Object.keys(DISTRICT_COORDS).forEach((districtName) => {
    const coords = getDistrictCoordsFromHouses(districtName);
    const count = counts[districtName] || 0;
    const marker = L.marker(coords, {
      icon: createBubbleIcon(districtName, count, state.selectedDistrict === districtName, maxCount),
      keyboard: true,
      title: `${districtName} ${count}건`,
      riseOnHover: true,
      bubblingMouseEvents: false,
    });

    marker.on('click', (event) => {
      if (event?.originalEvent) {
        L.DomEvent.stop(event.originalEvent);
      }
      suppressMapReset();
      state.selectedDistrict = districtName;
      syncDistrictFilterUI();
      updateOverlayHint();
      renderAll();
      requestAnimationFrame(() => focusDistrictOnMap(districtName));
    });

    marker.on('mouseover', () => {
      state.mapHoverDistrict = districtName;
      updateMarkerStateClasses();
    });

    marker.on('mouseout', () => {
      if (state.mapHoverDistrict === districtName) {
        state.mapHoverDistrict = '';
      }
      updateMarkerStateClasses();
    });

    state.markersLayer.addLayer(marker);
    marker.on('add', () => {
      syncMarkerElement(districtName, marker);
      const markerEl = marker.getElement();
      if (markerEl) {
        L.DomEvent.disableClickPropagation(markerEl);
        L.DomEvent.disableScrollPropagation(markerEl);
      }
      updateMarkerStateClasses();
    });
  });

  setTimeout(updateMarkerStateClasses, 0);
}

function getDisplayHouses() {
  if (!state.selectedDistrict) return [];

  const result = filterHouses(getApprovedHouses(), { applyDistrict: true });

  return result.sort((a, b) => {
    const da = new Date(a.registeredAt || '1970-01-01').getTime();
    const db = new Date(b.registeredAt || '1970-01-01').getTime();
    return db - da;
  });
}

function pickInitialDistrict() {
  const counts = buildDistrictCounts(filterHouses(getApprovedHouses(), { applyDistrict: false }));
  const entries = Object.entries(counts).filter(([, count]) => count > 0);
  if (!entries.length) return '';

  entries.sort((a, b) => b[1] - a[1]);
  return entries[0][0];
}

function renderListPanel() {
  const titleEl = document.getElementById('mapListTitle');
  const countEl = document.getElementById('mapListCount');
  const bodyEl = document.getElementById('mapResultBody');
  if (!titleEl || !countEl || !bodyEl) return;

  if (!state.selectedDistrict) {
    titleEl.textContent = '지역을 선택해 주세요';
    countEl.textContent = '0건';
    bodyEl.innerHTML = `
      <div class="map-empty-state">
        지도의 원형 마커를 클릭하면 해당 지역 빈집 리스트를 확인할 수 있습니다.<br>
        상단 검색/필터를 함께 사용하면 더 빠르게 탐색할 수 있습니다.
      </div>
    `;
    return;
  }

  const houses = getDisplayHouses();
  titleEl.textContent = `영주시 ${state.selectedDistrict}`;
  countEl.textContent = `${houses.length}건`;

  if (houses.length === 0) {
    bodyEl.innerHTML = `
      <div class="map-empty-state">
        선택한 조건에서 조회되는 빈집이 없습니다.<br>
        필터를 완화하거나 초기화를 눌러 다시 확인해 주세요.
      </div>
    `;
    return;
  }

  bodyEl.innerHTML = houses.map(house => {
    const districtName = house.districtName || state.selectedDistrict || '영주시';
    const houseName = house.name || `${districtName} 빈집`;
    const priceText = house.priceRange || '운영 조건 협의';
    const capacityText = Number.isFinite(house.maxCapacity) ? `${house.maxCapacity}` : (house.maxCapacity || '-');
    const tags = (Array.isArray(house.tags) ? house.tags : []).slice(0, 3);
    const gradeText = getConditionGradeText(house.conditionGrade);
    const typeText = TYPE_LABELS[house.operationType] || '유형 미정';
    const emoji = TYPE_EMOJIS[house.operationType] || '🏠';
    const statusText = '공개 승인';

    return `
      <a class="map-house-card" data-district="${districtName}" href="guest-detail.html?id=${house.id}" aria-label="${houseName} 상세 보기">
        <div class="map-house-card__thumb">${emoji}</div>
        <div class="map-house-card__content">
          <div class="map-house-card__location">📍 영주시 ${districtName}</div>
          <h3 class="map-house-card__name">${houseName}</h3>

          <div class="map-house-card__meta">
            <span class="map-house-card__price">${priceText}</span>
            <span class="map-house-card__capacity">최대 ${capacityText}명</span>
          </div>

          <div class="map-house-card__badge-row">
            <span class="map-badge map-badge--grade">${gradeText}</span>
            <span class="map-badge map-badge--type">${typeText}</span>
            <span class="map-badge map-badge--status">${statusText}</span>
          </div>

          <div class="map-house-card__tags">${tags.length ? `#${tags.join('  #')}` : '#영주시  #공공형빈집'}</div>
          <div class="map-house-card__action">상세보기 <span>→</span></div>
        </div>
      </a>
    `;
  }).join('');
}

function populateDistrictFilter() {
  const districtSelect = document.getElementById('mapDistrictFilter');
  if (!districtSelect) return;

  const options = ['<option value="">지도에서 선택</option>']
    .concat(
      Object.keys(DISTRICT_COORDS).map(name => `<option value="${name}">${name}</option>`)
    );

  districtSelect.innerHTML = options.join('');
}

function syncDistrictFilterUI() {
  const districtSelect = document.getElementById('mapDistrictFilter');
  if (districtSelect) {
    districtSelect.value = state.selectedDistrict;
  }
}

function updateOverlayHint() {
  const hintEl = document.getElementById('mapOverlayHint');
  if (!hintEl) return;

  if (!state.selectedDistrict) {
    hintEl.textContent = '영주시 읍면동 원형 마커를 클릭하면 오른쪽 패널에 지역별 빈집 목록이 표시됩니다.';
    return;
  }

  hintEl.textContent = `현재 ${state.selectedDistrict} 기준으로 표시 중입니다. 지도 빈 공간을 누르면 선택이 해제됩니다.`;
}

function syncOverlayState() {
  const overlay = document.getElementById('mapOverlay');
  const toggleBtn = document.getElementById('mapOverlayToggle');
  if (!overlay || !toggleBtn) return;

  overlay.classList.toggle('is-collapsed', state.overlayCollapsed);
  toggleBtn.textContent = state.overlayCollapsed ? '펼치기' : '접기';
  toggleBtn.setAttribute('aria-expanded', String(!state.overlayCollapsed));

  window.setTimeout(() => {
    state.map?.invalidateSize();
  }, 180);
}

function bindEvents() {
  const searchInput = document.getElementById('mapSearchInput');
  const districtSelect = document.getElementById('mapDistrictFilter');
  const typeSelect = document.getElementById('mapTypeFilter');
  const gradeSelect = document.getElementById('mapGradeFilter');
  const resetBtn = document.getElementById('mapResetBtn');
  const resultBody = document.getElementById('mapResultBody');
  const overlayToggle = document.getElementById('mapOverlayToggle');

  if (searchInput) {
    searchInput.addEventListener('input', e => {
      state.search = e.target.value || '';
      renderAll();
    });
  }

  if (districtSelect) {
    districtSelect.addEventListener('change', e => {
      state.selectedDistrict = e.target.value || '';
      updateOverlayHint();
      renderAll();

      suppressMapReset();
      if (state.selectedDistrict) {
        requestAnimationFrame(() => focusDistrictOnMap(state.selectedDistrict));
      } else {
        state.map.fitBounds(YEONGJU_BOUNDS, { padding: [8, 8] });
      }
    });
  }

  if (typeSelect) {
    typeSelect.addEventListener('change', e => {
      state.type = e.target.value || 'all';
      renderAll();
    });
  }

  if (gradeSelect) {
    gradeSelect.addEventListener('change', e => {
      state.grade = e.target.value || 'all';
      renderAll();
    });
  }

  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      state.selectedDistrict = '';
      state.mapHoverDistrict = '';
      state.listHoverDistrict = '';
      state.search = '';
      state.type = 'all';
      state.grade = 'all';

      if (searchInput) searchInput.value = '';
      if (typeSelect) typeSelect.value = 'all';
      if (gradeSelect) gradeSelect.value = 'all';
      syncDistrictFilterUI();
      updateOverlayHint();
      renderAll();
      suppressMapReset();
      state.map.fitBounds(YEONGJU_BOUNDS, { padding: [8, 8] });
    });
  }

  if (overlayToggle) {
    overlayToggle.addEventListener('click', () => {
      state.overlayCollapsed = !state.overlayCollapsed;
      syncOverlayState();
    });
  }

  if (resultBody) {
    resultBody.addEventListener('mouseover', e => {
      const card = e.target.closest('.map-house-card');
      if (!card) return;

      const district = card.dataset.district || '';
      if (state.listHoverDistrict !== district) {
        state.listHoverDistrict = district;
        updateMarkerStateClasses();
      }
    });

    resultBody.addEventListener('mouseout', e => {
      const card = e.target.closest('.map-house-card');
      if (!card) return;

      const related = e.relatedTarget;
      if (related instanceof Element && card.contains(related)) return;

      state.listHoverDistrict = '';
      updateMarkerStateClasses();
    });

    resultBody.addEventListener('mouseleave', () => {
      state.listHoverDistrict = '';
      updateMarkerStateClasses();
    });
  }
}

function renderAll() {
  renderDistrictMarkers();
  renderListPanel();
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

async function loadHouses() {
  const localHouses = typeof getAllVacantHouses === 'function'
    ? getAllVacantHouses()
    : (typeof VACANT_HOUSE_LIST !== 'undefined' ? VACANT_HOUSE_LIST : []);
  try {
    const response = await fetch(`${API_BASE_URL}/houses`);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const houses = await response.json();
    return mergeHouseDatasets(houses, localHouses);
  } catch (error) {
    console.warn('API 호출 실패, 샘플 데이터 사용:', error.message);
    return localHouses;
  }
}

async function initMapPage() {
  renderHeader('map');
  ensureMap();
  populateDistrictFilter();
  bindEvents();
  syncOverlayState();

  state.houses = await loadHouses();

  state.selectedDistrict = pickInitialDistrict();
  syncDistrictFilterUI();
  updateOverlayHint();

  if (state.selectedDistrict) {
    focusDistrictOnMap(state.selectedDistrict);
  }

  renderAll();
}

window.addEventListener('yeongju:platform-data-changed', async () => {
  state.houses = await loadHouses();
  renderAll();
});

window.addEventListener('storage', async (event) => {
  if (![PLATFORM_REQUESTS_KEY, APPROVED_HOUSES_KEY].includes(event.key)) return;
  state.houses = await loadHouses();
  renderAll();
});

window.addEventListener('load', initMapPage);
