/**
 * vendor-list.js
 * 영주시 공공형 빈집 활용 플랫폼 - 협력업체 목록 스크립트
 */

const API_BASE_URL = typeof getApiBaseUrl === 'function' ? getApiBaseUrl() : 'http://localhost:8000';
let currentVendorType = 'all';
let selectedVendorId = null;

// 협력업체 샘플 데이터 (영주시 지역 업체)
const VENDOR_PARTNERS = [
  {
    id: 'v001',
    name: '영주 건축사사무소',
    type: 'construction',
    typeLabel: '건축·리모델링',
    icon: '🏗️',
    desc: '영주시 전통 건축물 전문 리모델링 업체. 한옥 및 농가주택 보수·복원 20년 경력.',
    tags: ['한옥 리모델링', '농가주택', '구조 보강', '문화재 근처'],
    rating: 4.8,
    projects: 34,
    contact: '054-631-XXXX',
    address: '경북 영주시 영주동',
    certifications: ['건축사 면허', '문화재 수리 자격'],
    specialties: ['한옥 복원', '농가주택 리모델링', '구조 안전 진단'],
  },
  {
    id: 'v002',
    name: '풍기 인테리어',
    type: 'interior',
    typeLabel: '인테리어',
    icon: '🎨',
    desc: '빈집 활용 특화 인테리어 전문. 숙박·체험 공간 설계 및 시공.',
    tags: ['숙박 인테리어', '체험공간', '친환경 자재', '저비용'],
    rating: 4.6,
    projects: 21,
    contact: '054-636-XXXX',
    address: '경북 영주시 풍기읍',
    certifications: ['실내건축기사'],
    specialties: ['게스트하우스 인테리어', '카페 공간 설계', '친환경 리노베이션'],
  },
  {
    id: 'v003',
    name: '영주 게스트하우스 운영협동조합',
    type: 'operation',
    typeLabel: '운영·관리',
    icon: '🏨',
    desc: '영주시 빈집 게스트하우스 위탁 운영 전문. 예약·청소·관리 일괄 서비스.',
    tags: ['위탁 운영', '예약 관리', '청소 서비스', '수익 배분'],
    rating: 4.9,
    projects: 12,
    contact: '054-638-XXXX',
    address: '경북 영주시 영주동',
    certifications: ['관광숙박업 등록'],
    specialties: ['단기 숙박 운영', '장기 체류 관리', '지역 투어 연계'],
  },
  {
    id: 'v004',
    name: '소백산 귀농귀촌 컨설팅',
    type: 'consulting',
    typeLabel: '컨설팅',
    icon: '📋',
    desc: '귀농귀촌 희망자 및 빈집 소유자 대상 활용 방안 컨설팅. 보조금 신청 지원.',
    tags: ['귀농귀촌', '보조금 신청', '사업계획서', '법률 자문'],
    rating: 4.7,
    projects: 45,
    contact: '054-632-XXXX',
    address: '경북 영주시 순흥면',
    certifications: ['귀농귀촌 전문 상담사'],
    specialties: ['빈집 활용 사업계획', '정부 지원금 신청', '귀농 정착 지원'],
  },
  {
    id: 'v005',
    name: '영주 종합건설',
    type: 'construction',
    typeLabel: '건축·리모델링',
    icon: '🔨',
    desc: '영주시 전역 빈집 보수 공사 전문. 소규모 수선부터 대규모 리모델링까지.',
    tags: ['소규모 수선', '지붕 보수', '외벽 공사', '빠른 시공'],
    rating: 4.5,
    projects: 67,
    contact: '054-635-XXXX',
    address: '경북 영주시 가흥동',
    certifications: ['종합건설업 면허', '소방시설 공사업'],
    specialties: ['긴급 보수', '지붕·외벽 수선', '전기·배관 교체'],
  },
  {
    id: 'v006',
    name: '안정 농촌체험 운영사',
    type: 'operation',
    typeLabel: '운영·관리',
    icon: '🌾',
    desc: '농촌 체험 프로그램 기획 및 운영. 빈집을 농촌 체험 거점으로 전환.',
    tags: ['농촌 체험', '프로그램 기획', '학교 연계', '계절 행사'],
    rating: 4.8,
    projects: 8,
    contact: '054-637-XXXX',
    address: '경북 영주시 안정면',
    certifications: ['농촌체험관광 인증'],
    specialties: ['농촌 체험 프로그램', '학교 현장학습 연계', '계절 농업 체험'],
  },
];

window.addEventListener('load', function () {
  renderHeader('vendor');
  renderFooter();

  setupVendorFilterTabs();
  renderVendorGrid('all');
  setupModalClose('vendorDetailModal');
});

/**
 * 업체 유형 필터 탭을 설정합니다.
 */
function setupVendorFilterTabs() {
  document.querySelectorAll('.vendor-filter-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.vendor-filter-tab').forEach(t => t.classList.remove('is-active'));
      tab.classList.add('is-active');
      currentVendorType = tab.dataset.type;
      renderVendorGrid(currentVendorType);
    });
  });
}

/**
 * 협력업체 그리드를 렌더링합니다.
 * @param {string} type
 */
function renderVendorGrid(type) {
  const grid = document.getElementById('vendorGrid');
  if (!grid) return;

  const vendors = type === 'all' ? VENDOR_PARTNERS : VENDOR_PARTNERS.filter(v => v.type === type);
  renderResultMeta(type, vendors.length);

  if (vendors.length === 0) {
    grid.innerHTML = `
      <div class="vendor-empty">
        <div class="vendor-empty__icon">🔧</div>
        <p>해당 유형의 협력업체가 없습니다.</p>
      </div>
    `;
    return;
  }

  grid.innerHTML = vendors.map(vendor => `
    <div class="vendor-card" onclick="showVendorDetail('${vendor.id}')">
      <div class="vendor-card__header">
        <div class="vendor-card__logo">${vendor.icon}</div>
        <div class="vendor-card__info">
          <h3 class="vendor-card__name">${vendor.name}</h3>
          <div class="vendor-card__type">${vendor.typeLabel}</div>
        </div>
      </div>
      <p class="vendor-card__desc">${vendor.desc}</p>
      <div class="vendor-card__tags">
        ${vendor.tags.map(tag => `<span class="vendor-card__tag">${tag}</span>`).join('')}
      </div>
      <div class="vendor-card__footer">
        <div class="vendor-card__rating">
          ⭐ ${vendor.rating}
        </div>
        <div class="vendor-card__projects">프로젝트 ${vendor.projects}건</div>
        <div class="vendor-card__cta">상세 보기 →</div>
      </div>
    </div>
  `).join('');
}

function renderResultMeta(type, count) {
  const labelEl = document.getElementById('vendorResultLabel');
  const countEl = document.getElementById('vendorResultCount');
  if (!labelEl || !countEl) return;

  const typeLabels = {
    all: '전체 협력업체',
    construction: '건축·리모델링 협력업체',
    interior: '인테리어 협력업체',
    operation: '운영·관리 협력업체',
    consulting: '컨설팅 협력업체',
  };

  labelEl.textContent = typeLabels[type] || '협력업체';
  countEl.textContent = `${count}개 업체`;
}

/**
 * 업체 상세 모달을 표시합니다.
 * @param {string} vendorId
 */
function showVendorDetail(vendorId) {
  const vendor = VENDOR_PARTNERS.find(v => v.id === vendorId);
  if (!vendor) return;

  selectedVendorId = vendorId;

  const titleEl = document.getElementById('vendorModalTitle');
  const bodyEl  = document.getElementById('vendorModalBody');

  if (titleEl) titleEl.textContent = `${vendor.icon} ${vendor.name}`;

  if (bodyEl) {
    bodyEl.innerHTML = `
      <div class="vendor-detail-grid">
        <div class="vendor-detail-item">
          <div class="vendor-detail-item__label">업체 유형</div>
          <div class="vendor-detail-item__value">${vendor.typeLabel}</div>
        </div>
        <div class="vendor-detail-item">
          <div class="vendor-detail-item__label">연락처</div>
          <div class="vendor-detail-item__value">${vendor.contact}</div>
        </div>
        <div class="vendor-detail-item">
          <div class="vendor-detail-item__label">주소</div>
          <div class="vendor-detail-item__value">${vendor.address}</div>
        </div>
        <div class="vendor-detail-item">
          <div class="vendor-detail-item__label">평점</div>
          <div class="vendor-detail-item__value">⭐ ${vendor.rating} (${vendor.projects}건)</div>
        </div>
      </div>

      <div style="margin-bottom:var(--spacing-lg);">
        <div style="font-size:var(--font-size-xs);font-weight:700;color:var(--color-text-muted);margin-bottom:8px;">업체 소개</div>
        <p style="font-size:var(--font-size-sm);color:var(--color-text-secondary);line-height:1.7;">${vendor.desc}</p>
      </div>

      <div style="margin-bottom:var(--spacing-lg);">
        <div style="font-size:var(--font-size-xs);font-weight:700;color:var(--color-text-muted);margin-bottom:8px;">주요 전문 분야</div>
        <ul style="list-style:none;padding:0;display:flex;flex-direction:column;gap:4px;">
          ${vendor.specialties.map(s => `
            <li style="font-size:var(--font-size-sm);color:var(--color-text-secondary);">✓ ${s}</li>
          `).join('')}
        </ul>
      </div>

      <div>
        <div style="font-size:var(--font-size-xs);font-weight:700;color:var(--color-text-muted);margin-bottom:8px;">자격·인증</div>
        <div style="display:flex;flex-wrap:wrap;gap:8px;">
          ${vendor.certifications.map(c => `
            <span style="background:var(--color-bg-section);border:1px solid var(--color-border-light);border-radius:12px;padding:4px 12px;font-size:var(--font-size-xs);color:var(--color-text-secondary);">
              🏅 ${c}
            </span>
          `).join('')}
        </div>
      </div>
      ${renderOwnerAiHelper(vendor)}
    `;
  }

  bindVendorAiHelper(vendor);
  openModal('vendorDetailModal');
}

/**
 * 업체 문의하기 (데모)
 */
function contactVendor() {
  const vendor = VENDOR_PARTNERS.find(v => v.id === selectedVendorId);
  if (!vendor) return;
  const draft = document.getElementById('vendorAiDraftOutput')?.value.trim();
  closeModal('vendorDetailModal');
  showToast(
    draft
      ? `${vendor.name}에 문의 요청을 보냈습니다. 요구사항 초안도 함께 확인해 주세요. (데모)`
      : `${vendor.name}에 문의 요청을 보냈습니다. (데모)`,
    'success'
  );
}

function renderOwnerAiHelper(vendor) {
  const user = getCurrentUser();
  if (user?.role !== 'owner') return '';

  return `
    <section class="vendor-ai-helper">
      <div class="vendor-ai-helper__header">
        <strong>빈집 소유자 전용 AI 요구사항 작성 도우미</strong>
        <p>${vendor.name}에 전달할 보수 범위, 일정, 예산, 요청사항을 먼저 정리해 초안을 만들어 드립니다.</p>
      </div>
      <label class="vendor-ai-helper__label" for="vendorAiConditionInput">요청 조건 입력</label>
      <textarea id="vendorAiConditionInput" class="form-control vendor-ai-helper__input" rows="4" placeholder="예: 지붕 누수 보수, 외부 도색, 5월 중 일정 희망, 예산 300만원 내외"></textarea>
      <label class="vendor-ai-helper__label" for="vendorAiDraftOutput">생성된 요구사항 초안</label>
      <textarea id="vendorAiDraftOutput" class="form-control vendor-ai-helper__output" rows="8" placeholder="AI가 협력업체 제출용 요구사항 초안을 작성합니다."></textarea>
      <div class="vendor-ai-helper__actions">
        <button type="button" class="btn btn--secondary btn--sm" id="vendorAiGenerateBtn">요구사항 초안 생성</button>
      </div>
    </section>
  `;
}

function bindVendorAiHelper(vendor) {
  const button = document.getElementById('vendorAiGenerateBtn');
  if (!button) return;

  button.addEventListener('click', async () => {
    const input = document.getElementById('vendorAiConditionInput');
    const output = document.getElementById('vendorAiDraftOutput');
    const conditions = input?.value.trim() || '';

    if (!conditions) {
      showToast('협력업체에 전달할 조건을 먼저 입력해주세요.', 'warning');
      return;
    }

    const originalLabel = button.textContent;
    button.disabled = true;
    button.textContent = '초안 생성 중...';

    try {
      const response = await fetch(`${API_BASE_URL}/ai/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: [
            '당신은 영주시 빈집 소유자의 협력업체 제출용 요구사항을 정리하는 도우미입니다.',
            `업체명: ${vendor.name}`,
            `업체 유형: ${vendor.typeLabel}`,
            `전문 분야: ${(vendor.specialties || []).join(', ')}`,
            '아래 입력 조건을 바탕으로 한국어 요구사항 초안을 작성하세요.',
            '형식: 1) 작업 목적 2) 요청 범위 3) 희망 일정 4) 확인 요청 사항',
            `입력 조건: ${conditions}`,
          ].join('\n'),
          history: [],
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.message) {
        throw new Error(data.detail || 'AI 응답을 생성하지 못했습니다.');
      }

      if (output) {
        output.value = data.message.trim();
      }
      showToast('요구사항 초안이 생성되었습니다.', 'success');
    } catch (error) {
      if (output) {
        output.value = buildVendorRequirementDraft(vendor, conditions);
      }
      showToast('AI 연결이 원활하지 않아 기본 초안으로 작성했습니다.', 'warning');
    } finally {
      button.disabled = false;
      button.textContent = originalLabel;
    }
  });
}

function buildVendorRequirementDraft(vendor, conditions) {
  return [
    `[${vendor.name} 협력 요청 초안]`,
    '',
    '1. 작업 목적',
    `- 빈집 운영 준비를 위해 ${vendor.typeLabel} 관련 작업 검토를 요청드립니다.`,
    '',
    '2. 요청 범위',
    `- ${conditions}`,
    '',
    '3. 희망 일정',
    '- 현장 확인 후 가능한 일정과 예상 소요 기간을 안내 부탁드립니다.',
    '',
    '4. 확인 요청 사항',
    '- 현장 방문 가능 여부',
    '- 예상 견적 범위',
    '- 선행 보수 필요 항목',
  ].join('\n');
}
