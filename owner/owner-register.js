/**
 * owner-register.js
 * 영주시 공공형 빈집 활용 플랫폼 - 빈집 등록 신청 페이지 스크립트
 */

let currentStep = 1;
const TOTAL_STEPS = 5;
let selectedHousePhotos = [];
let ownerRegistrationLocked = false;
const OWNER_REGISTRATION_LIMIT_FALLBACK = 3;
const OWNER_PHOTO_LIMIT = 5;
const OWNER_PHOTO_MAX_SIZE = 10 * 1024 * 1024;

window.addEventListener('load', function () {
  renderHeader('register');
  renderFooter();

  if (!requireLogin()) return;

  syncOwnerRegistrationPolicy();
  populateDistrictSelect();
  setupAreaConversion();
  setupPhotoUpload();
  setupFormSubmit();
  updateStepUI(1);
});

function syncRegisterStepLayout(step) {
  const introPanel = document.querySelector('.register-intro-panel');
  const main = document.querySelector('.owner-register-main');

  if (main) {
    main.dataset.currentStep = String(step);
  }

  if (introPanel) {
    introPanel.classList.toggle('is-hidden', step !== 1);
  }
}

const PYEONG_CONVERSION = 3.3058;
let isAdjustingArea = false;

function setupAreaConversion() {
  const sqmInput = document.getElementById('buildingArea');
  const pyeongInput = document.getElementById('buildingAreaPyeong');
  if (!sqmInput || !pyeongInput) return;

  sqmInput.addEventListener('input', () => {
    if (isAdjustingArea) return;
    isAdjustingArea = true;
    const sqmValue = parseFloat(sqmInput.value);
    if (Number.isFinite(sqmValue)) {
      pyeongInput.value = (sqmValue / PYEONG_CONVERSION).toFixed(1).replace(/\.0$/, '');
    } else {
      pyeongInput.value = '';
    }
    isAdjustingArea = false;
  });

  pyeongInput.addEventListener('input', () => {
    if (isAdjustingArea) return;
    isAdjustingArea = true;
    const pyeongValue = parseFloat(pyeongInput.value);
    if (Number.isFinite(pyeongValue)) {
      sqmInput.value = (pyeongValue * PYEONG_CONVERSION).toFixed(1).replace(/\.0$/, '');
    } else {
      sqmInput.value = '';
    }
    isAdjustingArea = false;
  });
}

function setupPhotoUploadLegacy() {
  const input = document.getElementById('housePhotoInput');
  const grid = document.getElementById('photoPreviewGrid');
  const area = document.getElementById('photoUploadArea');
  if (!input || !grid || !area) return;

  const openFilePicker = () => {
    input.click();
  };

  area.addEventListener('click', (event) => {
    if (event.target.closest('label[for="housePhotoInput"]') || event.target.closest('#housePhotoInput')) {
      return;
    }
    openFilePicker();
  });

  area.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    if (event.target.closest('label[for="housePhotoInput"]') || event.target.closest('#housePhotoInput')) {
      return;
    }
    event.preventDefault();
    openFilePicker();
  });

  input.addEventListener('change', async () => {
    const files = Array.from(input.files || []).slice(0, 10);
    selectedHousePhotos = [];

    for (const file of files) {
      if (!file.type.startsWith('image/')) continue;
      if (file.size > 10 * 1024 * 1024) {
        showToast(`${file.name}은 10MB를 초과해 제외되었습니다.`, 'warning');
        continue;
      }
      const dataUrl = await readFileAsDataUrl(file);
      selectedHousePhotos.push({
        name: file.name,
        size: file.size,
        type: file.type,
        dataUrl,
      });
    }

    renderPhotoPreviews();
  });
}

function getOwnerRegistrationLimitValue() {
  return typeof getOwnerRegistrationLimit === 'function'
    ? getOwnerRegistrationLimit()
    : OWNER_REGISTRATION_LIMIT_FALLBACK;
}

function getCurrentOwnerRegistrationCount() {
  return typeof getOwnerRegistrationCount === 'function'
    ? getOwnerRegistrationCount(getCurrentUser())
    : 0;
}

function isOwnerRoleUser() {
  const user = getCurrentUser();
  return typeof isOwnerUser === 'function' ? isOwnerUser(user) : user?.role === 'owner';
}

function syncOwnerRegistrationPolicy() {
  const user = getCurrentUser();
  const isOwner = isOwnerRoleUser();
  const notice = document.getElementById('ownerRegistrationLimitNotice');
  const submitBtn = document.getElementById('ownerRegistrationSubmitBtn');
  const count = getCurrentOwnerRegistrationCount();
  const limit = getOwnerRegistrationLimitValue();

  if (document.getElementById('ownerName') && user?.name) {
    document.getElementById('ownerName').value = document.getElementById('ownerName').value || user.name;
  }

  if (document.getElementById('ownerEmail') && user?.email) {
    document.getElementById('ownerEmail').value = document.getElementById('ownerEmail').value || user.email;
  }

  ownerRegistrationLocked = Boolean(isOwner && count >= limit);

  if (notice) {
    if (isOwner) {
      notice.hidden = false;
      notice.classList.toggle('is-limit', ownerRegistrationLocked);
      notice.innerHTML = ownerRegistrationLocked
        ? `빈집 소유자는 최대 <strong>${limit}건</strong>까지 등록 신청할 수 있습니다. 현재 접수/운영 중인 신청이 <strong>${count}건</strong>이라 추가 신청이 잠시 제한됩니다.`
        : `빈집 소유자 등록 한도는 최대 <strong>${limit}건</strong>입니다. 현재 접수/운영 중인 신청은 <strong>${count}건</strong>입니다.`;
    } else {
      notice.hidden = true;
      notice.textContent = '';
      notice.classList.remove('is-limit');
    }
  }

  if (submitBtn) {
    submitBtn.disabled = ownerRegistrationLocked;
    submitBtn.setAttribute('aria-disabled', ownerRegistrationLocked ? 'true' : 'false');
  }
}

function validateOwnerRegistrationPolicy() {
  syncOwnerRegistrationPolicy();

  if (!isOwnerRoleUser()) return true;

  if (ownerRegistrationLocked) {
    showToast(`빈집 소유자는 최대 ${getOwnerRegistrationLimitValue()}건까지 등록 신청할 수 있습니다.`, 'warning');
    return false;
  }

  return true;
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function renderPhotoPreviewsLegacy() {
  const grid = document.getElementById('photoPreviewGrid');
  if (!grid) return;

  grid.innerHTML = selectedHousePhotos.map(photo => `
    <div class="photo-preview-card">
      <img src="${photo.dataUrl}" alt="${photo.name}">
      <span>${photo.name}</span>
    </div>
  `).join('');
}

/**
 * 영주시 읍면동 선택 옵션을 채웁니다.
 */
function buildPhotoKey(photo) {
  return [photo?.name || '', photo?.size || 0, photo?.type || '', photo?.lastModified || 0].join('::');
}

function releasePhotoPreviewUrl(photo) {
  if (!photo?.previewUrl || !String(photo.previewUrl).startsWith('blob:')) return;
  URL.revokeObjectURL(photo.previewUrl);
}

function clearSelectedHousePhotos() {
  selectedHousePhotos.forEach(releasePhotoPreviewUrl);
  selectedHousePhotos = [];
}

function renderPhotoSelectionMeta() {
  const meta = document.getElementById('photoSelectionMeta');
  if (!meta) return;

  if (selectedHousePhotos.length === 0) {
    meta.textContent = `사진은 최대 ${OWNER_PHOTO_LIMIT}장까지 등록할 수 있습니다. 여러 번 나눠서 선택해도 누적됩니다.`;
    return;
  }

  meta.textContent = `선택된 사진 ${selectedHousePhotos.length}/${OWNER_PHOTO_LIMIT}장`;
}

function setupPhotoUpload() {
  const input = document.getElementById('housePhotoInput');
  const grid = document.getElementById('photoPreviewGrid');
  const area = document.getElementById('photoUploadArea');
  if (!input || !grid || !area) return;

  const openFilePicker = () => {
    input.click();
  };

  area.addEventListener('click', (event) => {
    if (event.target.closest('label[for="housePhotoInput"]') || event.target.closest('#housePhotoInput')) {
      return;
    }
    openFilePicker();
  });

  area.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    if (event.target.closest('label[for="housePhotoInput"]') || event.target.closest('#housePhotoInput')) {
      return;
    }
    event.preventDefault();
    openFilePicker();
  });

  input.addEventListener('change', async () => {
    const files = Array.from(input.files || []);
    const existingPhotoKeys = new Set(selectedHousePhotos.map(buildPhotoKey));
    let skippedByLimit = 0;

    for (const file of files) {
      if (!file.type.startsWith('image/')) continue;

      if (file.size > OWNER_PHOTO_MAX_SIZE) {
        showToast(`${file.name}은 10MB를 초과해 제외되었습니다.`, 'warning');
        continue;
      }

      const photoKey = buildPhotoKey(file);
      if (existingPhotoKeys.has(photoKey)) {
        continue;
      }

      if (selectedHousePhotos.length >= OWNER_PHOTO_LIMIT) {
        skippedByLimit += 1;
        continue;
      }

      const previewUrl = URL.createObjectURL(file);
      selectedHousePhotos.push({
        name: file.name,
        size: file.size,
        type: file.type,
        lastModified: file.lastModified || 0,
        file,
        previewUrl,
      });
      existingPhotoKeys.add(photoKey);
    }

    if (skippedByLimit > 0) {
      showToast(`사진은 최대 ${OWNER_PHOTO_LIMIT}장까지 등록할 수 있습니다.`, 'warning');
    }

    input.value = '';
    renderPhotoPreviews();
  });

  grid.addEventListener('click', (event) => {
    const removeButton = event.target.closest('[data-photo-remove-index]');
    if (!removeButton) return;

    const index = Number(removeButton.dataset.photoRemoveIndex);
    if (!Number.isInteger(index) || index < 0 || index >= selectedHousePhotos.length) return;

    releasePhotoPreviewUrl(selectedHousePhotos[index]);
    selectedHousePhotos.splice(index, 1);
    renderPhotoPreviews();
  });

  renderPhotoPreviews();
}

function renderPhotoPreviews() {
  const grid = document.getElementById('photoPreviewGrid');
  if (!grid) return;

  renderPhotoSelectionMeta();

  if (!selectedHousePhotos.length) {
    grid.innerHTML = '';
    return;
  }

  grid.innerHTML = selectedHousePhotos.map((photo, index) => `
    <div class="photo-preview-card">
      <img src="${photo.previewUrl || photo.dataUrl || photo.url || photo.src || ''}" alt="${photo.name}">
      <button type="button" class="photo-preview-card__remove" data-photo-remove-index="${index}" aria-label="${photo.name} 삭제">×</button>
      <span>${photo.name}</span>
    </div>
  `).join('');
}

async function uploadSelectedHousePhotos() {
  if (!selectedHousePhotos.length) {
    return [];
  }

  const formData = new FormData();
  selectedHousePhotos.forEach((photo) => {
    if (photo?.file instanceof File) {
      formData.append('files', photo.file, photo.name || photo.file.name);
    }
  });

  const response = await fetch(`${getApiBaseUrl()}/uploads/house-photos`, {
    method: 'POST',
    body: formData,
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.detail || '사진 업로드 중 오류가 발생했습니다.');
  }

  return Array.isArray(payload.photos) ? payload.photos : [];
}

function populateDistrictSelect() {
  const select = document.getElementById('houseDistrict');
  if (!select) return;

  YEONGJU_DISTRICTS.forEach(district => {
    const option = document.createElement('option');
    option.value = district.id;
    option.textContent = `영주시 ${district.name}`;
    select.appendChild(option);
  });
}

/**
 * 특정 단계로 이동합니다.
 * @param {number} step
 */
function goToStep(step) {
  // 앞으로 이동할 때만 현재 단계 유효성 검사
  if (step > currentStep && !validateCurrentStep(currentStep)) return;

  // 이전 단계 완료 표시
  const prevStepEl = document.querySelector(`[data-step="${currentStep}"]`);
  if (prevStepEl && step > currentStep) {
    prevStepEl.classList.remove('is-active');
    prevStepEl.classList.add('is-done');
  }

  // 패널 전환
  document.getElementById(`step${currentStep}Panel`).style.display = 'none';
  document.getElementById(`step${step}Panel`).style.display = 'block';

  currentStep = step;
  updateStepUI(step);

  // 페이지 상단으로 스크롤
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/**
 * 단계 UI를 업데이트합니다.
 * @param {number} step
 */
function updateStepUI(step) {
  syncRegisterStepLayout(step);

  document.querySelectorAll('.register-step').forEach(el => {
    const stepNum = parseInt(el.dataset.step);
    el.classList.remove('is-active', 'is-done');
    if (stepNum === step) {
      el.classList.add('is-active');
    } else if (stepNum < step) {
      el.classList.add('is-done');
    }
  });

  document.querySelectorAll('.register-step__line').forEach((line, index) => {
    line.classList.toggle('is-done', index < step - 1);
  });
}

/**
 * 현재 단계의 유효성을 검사합니다.
 * @param {number} step
 * @returns {boolean}
 */
function validateCurrentStep(step) {
  if (step === 1) {
    const name = document.getElementById('ownerName').value.trim();
    const contact = document.getElementById('ownerContact').value.trim();
    const idType = document.getElementById('ownerIdType').value;
    if (!name || !contact || !idType) {
      showToast('소유자 정보를 모두 입력해주세요.', 'warning');
      return false;
    }
    if (!validateOwnerRegistrationPolicy()) {
      return false;
    }
  }
  if (step === 2) {
    const district = document.getElementById('houseDistrict').value;
    const address = document.getElementById('houseAddress').value.trim();
    if (!district || !address) {
      showToast('읍면동과 주소를 입력해주세요.', 'warning');
      return false;
    }
    // 상세 주소만 입력하면 됩니다. 읍면동 선택으로 이미 영주시 범위가 결정됩니다.
  }
  if (step === 3) {
    const buildingType = document.getElementById('buildingType').value;
    const condition = document.getElementById('buildingCondition').value;
    if (!buildingType || !condition) {
      showToast('건물 유형과 상태를 선택해주세요.', 'warning');
      return false;
    }
  }
  return true;
}

/**
 * 폼 제출 이벤트를 설정합니다.
 */
function setupFormSubmit() {
  const form = document.getElementById('ownerRegistrationForm');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!validateOwnerRegistrationPolicy()) return;
    if (!validateCurrentStep(4)) return;

    // 활용 유형 확인
    const usageTypes = Array.from(document.querySelectorAll('input[name="usageType"]:checked')).map(el => el.value);
    if (usageTypes.length === 0) {
      showToast('희망 활용 유형을 하나 이상 선택해주세요.', 'warning');
      return;
    }

    let savedRequest = null;
    try {
      savedRequest = await saveOwnerRegistrationRequest(usageTypes);
    } catch (error) {
      showToast(error.message || '등록 신청 접수 중 오류가 발생했습니다.', 'danger');
      return;
    }
    showToast('등록 신청이 접수되었습니다! 공공기관 대시보드로 즉시 전달되었습니다.', 'success');

    // 완료 단계로 이동
    document.getElementById('step4Panel').style.display = 'none';
    document.getElementById('step5Panel').style.display = 'block';
    currentStep = 5;
    updateStepUI(5);

    const statusEl = document.querySelector('.register-complete__status');
    if (statusEl && savedRequest) {
      statusEl.insertAdjacentHTML('beforeend', `<span class="register-complete__flow">신청번호 ${savedRequest.id}</span>`);
    }

    clearSelectedHousePhotos();
    renderPhotoPreviews();
    syncOwnerRegistrationPolicy();
  });
}

async function saveOwnerRegistrationRequest(usageTypes) {
  const user = getCurrentUser();
  const districtSelect = document.getElementById('houseDistrict');
  const districtName = districtSelect?.selectedOptions?.[0]?.textContent?.replace('영주시 ', '') || '';
  const typeSelect = document.getElementById('buildingType');
  const conditionSelect = document.getElementById('buildingCondition');
  const ownerTypeSelect = document.getElementById('ownerIdType');
  const uploadedPhotos = await uploadSelectedHousePhotos();

  const request = {
    id: `req-${Date.now()}`,
    ownerName: document.getElementById('ownerName').value.trim() || user?.name || '소유자',
    ownerContact: document.getElementById('ownerContact').value.trim(),
    ownerEmail: document.getElementById('ownerEmail').value.trim(),
    ownerType: ownerTypeSelect?.selectedOptions?.[0]?.textContent || '개인',
    ownerUserId: user?.id || user?.email || user?.name || '',
    ownerRole: user?.role || '',
    districtId: districtSelect.value,
    districtName,
    address: document.getElementById('houseAddress').value.trim(),
    addressDetail: document.getElementById('houseAddressDetail').value.trim(),
    buildingType: typeSelect.value,
    buildingTypeLabel: typeSelect?.selectedOptions?.[0]?.textContent || '',
    buildingYear: document.getElementById('buildingYear').value,
    buildingArea: document.getElementById('buildingArea').value,
    buildingAreaPyeong: document.getElementById('buildingAreaPyeong').value,
    buildingCondition: conditionSelect?.selectedOptions?.[0]?.textContent || '',
    vacantYears: document.getElementById('buildingVacantYears')?.selectedOptions?.[0]?.textContent || '',
    description: document.getElementById('buildingDesc').value.trim(),
    usageTypes: usageTypes.map(type => ({
      lodging: '숙박 공간',
      longterm: '장기체류 공간',
      experience: '체험 공간',
      community: '커뮤니티 공간',
    }[type] || type)),
    needsCleaning: document.querySelector('input[name="needsCleaning"]:checked')?.value || '',
    needsRepair: document.querySelector('input[name="needsRepair"]:checked')?.value || '',
    photos: uploadedPhotos,
    photoCount: uploadedPhotos.length,
    cityVerificationCode: '',
    cityVerificationRequired: false,
    cityVerificationStatus: 'not_required',
    reviewStatus: 'submitted',
    submittedAt: new Date().toISOString().split('T')[0],
  };

  if (typeof saveRegistrationRequest === 'function') {
    return saveRegistrationRequest(request);
  }
  return request;
}
