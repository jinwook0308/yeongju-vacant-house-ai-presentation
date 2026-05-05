/**
 * common.js
 * 영주시 공공형 빈집 활용 플랫폼 - 공통 유틸리티 함수
 * 모든 페이지에서 공유하는 기능 모음
 */

/* ============================================================
   인증 및 세션 관리
   ============================================================ */

const AUTH_STORAGE_KEY = 'yeongjuCurrentUser';
const LEGACY_WISHLIST_KEY = 'yeongjuWishlist';
const WISHLIST_KEY_PREFIX = 'yeongjuWishlist:';
const PLATFORM_REQUESTS_KEY = 'yeongjuRegistrationRequests';
const APPROVED_HOUSES_KEY = 'yeongjuApprovedHouses';
const BOOKING_REQUESTS_KEY = 'yeongjuBookingRequests';
const NOTIFICATION_KEY_PREFIX = 'yeongjuNotifications:';
const COMMUNITY_NOTICE_KEY = 'yeongjuCommunityNotices';
const COMMUNITY_QNA_KEY = 'yeongjuCommunityQna';
const WITHDRAW_REQUESTS_KEY = 'yeongjuWithdrawRequests';
const OWNER_REGISTRATION_LIMIT = 3;
const APPROVAL_PENDING_STATUS = 'approval_pending';
const REVIEW_EDITABLE_STATUSES = ['submitted', 'under_review', 'site_visit'];
const ACTIVE_REVIEW_STATUSES = [...REVIEW_EDITABLE_STATUSES, APPROVAL_PENDING_STATUS];
const ADMIN_ROLE_LABELS = {
  reviewer: '검토 담당자',
  approver: '승인 권한자',
  super_admin: '총괄 관리자',
  system_admin: '시스템 관리자',
};
const ADMIN_ROLE_PERMISSIONS = {
  reviewer: ['review_start', 'review_edit'],
  approver: ['review_start', 'review_edit', 'review_approve'],
  super_admin: ['review_start', 'review_edit', 'review_approve', 'review_manage', 'admin_manage_users'],
  system_admin: ['review_start', 'review_edit', 'review_approve', 'review_manage', 'admin_manage_users', 'system_manage'],
};

function buildUserScopedStorageId(user) {
  if (!user) return null;

  const role = String(user.role || 'guest').trim().toLowerCase();
  const rawIdentifier = user.id || user.email || user.username || user.name;
  if (!rawIdentifier) return null;

  return encodeURIComponent(`${role}:${String(rawIdentifier).trim().toLowerCase()}`);
}

function getUserWishlistStorageKey(user = getCurrentUser()) {
  const scopedId = buildUserScopedStorageId(user);
  if (!scopedId) return null;
  return `${WISHLIST_KEY_PREFIX}${scopedId}`;
}

function emitAuthChanged() {
  window.dispatchEvent(new CustomEvent('yeongju:auth-changed', {
    detail: { user: getCurrentUser() },
  }));
}

function emitWishlistChanged(user, wishlist) {
  window.dispatchEvent(new CustomEvent('yeongju:wishlist-changed', {
    detail: {
      user,
      wishlist: [...wishlist],
      storageKey: getUserWishlistStorageKey(user),
    },
  }));
}

function emitPlatformDataChanged(detail = {}) {
  window.dispatchEvent(new CustomEvent('yeongju:platform-data-changed', { detail }));
}

function normalizeUserRecord(userData = {}) {
  if (!userData || typeof userData !== 'object') return null;

  const normalized = { ...userData };
  if (normalized.role === 'admin') {
    const adminRole = String(normalized.adminRole || '').trim().toLowerCase() || 'super_admin';
    normalized.adminRole = ADMIN_ROLE_LABELS[adminRole] ? adminRole : 'super_admin';
    normalized.adminRoleLabel = ADMIN_ROLE_LABELS[normalized.adminRole];
    normalized.department = normalized.department || '';
  }

  return normalized;
}

function getAdminRole(user = getCurrentUser()) {
  if (!user || user.role !== 'admin') return '';
  const adminRole = String(user.adminRole || '').trim().toLowerCase() || 'super_admin';
  return ADMIN_ROLE_LABELS[adminRole] ? adminRole : 'super_admin';
}

function getAdminRoleLabel(roleOrUser = getCurrentUser()) {
  const role = typeof roleOrUser === 'string' ? roleOrUser : getAdminRole(roleOrUser);
  return ADMIN_ROLE_LABELS[role] || '공공기관 사용자';
}

function hasAdminPermission(permission, user = getCurrentUser()) {
  if (!user || user.role !== 'admin') return false;
  const adminRole = getAdminRole(user);
  const permissions = ADMIN_ROLE_PERMISSIONS[adminRole] || [];
  return permissions.includes(permission);
}

function syncAdminManagementNavigation(user = getCurrentUser()) {
  const canManageUsers = hasAdminPermission('admin_manage_users', user);
  const nav = document.querySelector('.admin-nav');
  let navItem = document.querySelector('[data-admin-manage-users-nav]');

  if (canManageUsers && nav && !navItem) {
    navItem = document.createElement('a');
    navItem.href = 'admin-user-management.html';
    navItem.className = 'admin-nav__item';
    navItem.dataset.adminManageUsersNav = 'true';
    navItem.innerHTML = `
      <span class="admin-nav__icon" aria-hidden="true">06</span>
      <span>공공기관 사용자 관리</span>
    `;
    nav.appendChild(navItem);
  }

  if (navItem) {
    navItem.hidden = !canManageUsers;
    navItem.classList.toggle(
      'is-active',
      canManageUsers && String(window.location.pathname || '').includes('/admin/admin-user-management.html')
    );
  }

  document.querySelectorAll('[data-admin-manage-users-nav]').forEach((element) => {
    element.hidden = !canManageUsers;
  });
  document.querySelectorAll('[data-admin-manage-users-only]').forEach((element) => {
    element.hidden = !canManageUsers;
  });
}

function normalizeReviewHistory(history = [], request = {}) {
  if (Array.isArray(history) && history.length) {
    return history.map((item, index) => ({
      id: item.id || `history-${request.id || 'request'}-${index}`,
      action: item.action || 'update',
      at: item.at || item.date || request.updatedAt || request.submittedAt || new Date().toISOString(),
      actorId: item.actorId || '',
      actorName: item.actorName || item.by || '시스템',
      actorRole: item.actorRole || '',
      fromStatus: item.fromStatus || '',
      toStatus: item.toStatus || '',
      note: item.note || '',
    }));
  }

  if (request?.submittedAt) {
    return [{
      id: `history-${request.id || 'request'}-submitted`,
      action: 'submitted',
      at: request.submittedAt,
      actorId: String(request.ownerUserId || ''),
      actorName: request.ownerName || '신청자',
      actorRole: 'owner',
      fromStatus: '',
      toStatus: request.reviewStatus || 'submitted',
      note: '등록 신청 접수',
    }];
  }

  return [];
}

function normalizeRegistrationWorkflow(request = {}) {
  const version = Number(request.version);
  return {
    ...request,
    version: Number.isFinite(version) && version > 0 ? version : 1,
    assignedReviewerId: request.assignedReviewerId ?? '',
    assignedReviewerName: request.assignedReviewerName ?? '',
    assignedReviewerRole: request.assignedReviewerRole ?? '',
    lockedById: request.lockedById ?? '',
    lockedByName: request.lockedByName ?? '',
    lockedByRole: request.lockedByRole ?? '',
    lockedAt: request.lockedAt ?? '',
    internalReviewNote: request.internalReviewNote ?? '',
    reviewCompletedById: request.reviewCompletedById ?? '',
    reviewCompletedByName: request.reviewCompletedByName ?? '',
    reviewCompletedByRole: request.reviewCompletedByRole ?? '',
    reviewCompletedAt: request.reviewCompletedAt ?? '',
    reviewHistory: normalizeReviewHistory(request.reviewHistory, request),
  };
}

function isRequestAssignedToUser(request, user = getCurrentUser()) {
  if (!request || !user) return false;
  return String(request.assignedReviewerId || '') === String(user.id || '');
}

function isReviewRequestLockedForUser(request, user = getCurrentUser()) {
  if (!request || !user || user.role !== 'admin') return false;
  if (String(request.reviewStatus || '') === APPROVAL_PENDING_STATUS && hasAdminPermission('review_approve', user)) {
    return false;
  }
  if (!request.assignedReviewerId) return false;
  if (isRequestAssignedToUser(request, user)) return false;
  return !hasAdminPermission('review_manage', user);
}

function canStartReviewRequest(request, user = getCurrentUser()) {
  if (!request || !user || user.role !== 'admin') return false;
  if (!REVIEW_EDITABLE_STATUSES.includes(String(request.reviewStatus || ''))) return false;
  if (request.assignedReviewerId) return false;
  return hasAdminPermission('review_start', user);
}

function canEditReviewRequest(request, user = getCurrentUser()) {
  if (!request || !user || user.role !== 'admin') return false;
  if (hasAdminPermission('review_manage', user)) return true;
  if (!REVIEW_EDITABLE_STATUSES.includes(String(request.reviewStatus || ''))) return false;
  return isRequestAssignedToUser(request, user) && hasAdminPermission('review_edit', user);
}

function canApproveReviewRequest(request, user = getCurrentUser()) {
  if (!request || !user || user.role !== 'admin') return false;
  if (!hasAdminPermission('review_approve', user)) return false;
  return String(request.reviewStatus || '') === APPROVAL_PENDING_STATUS;
}

function buildReviewHistoryEntry(action, request, updates = {}, actor = getCurrentUser()) {
  const nextStatus = updates.reviewStatus || request.reviewStatus || '';
  const previousStatus = request.reviewStatus || '';
  const actorName = actor?.name || '시스템';
  const actorRole = actor?.role === 'admin' ? getAdminRole(actor) : (actor?.role || '');
  let note = updates.historyNote || '';

  if (!note) {
    if (action === 'review_start') note = '검토 시작 및 담당자 배정';
    if (action === 'submit_for_approval') note = '승인 대기로 전달';
    if (action === 'reassign') note = '담당자 재배정';
    if (action === 'unlock') note = '잠금 해제';
    if (action === 'status_change') note = '검토 상태 변경';
    if (action === 'approve') note = updates.reviewComment || '승인 처리';
    if (action === 'reject') note = updates.reviewComment || updates.rejectReason || '반려 처리';
    if (action === 'note') note = updates.internalReviewNote || '검토 메모 저장';
  }

  return {
    id: `history-${request.id || 'request'}-${Date.now()}`,
    action,
    at: new Date().toISOString(),
    actorId: String(actor?.id || ''),
    actorName,
    actorRole,
    fromStatus: previousStatus,
    toStatus: nextStatus,
    note,
  };
}

function readJsonStorage(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key));
    return value ?? fallback;
  } catch {
    return fallback;
  }
}

function writeJsonStorage(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function getBaseRegistrationRequests() {
  if (typeof REGISTRATION_REQUESTS !== 'undefined' && Array.isArray(REGISTRATION_REQUESTS)) {
    return REGISTRATION_REQUESTS.map(request => ({ ...request }));
  }
  return [];
}

function getStoredRegistrationRequests() {
  const stored = readJsonStorage(PLATFORM_REQUESTS_KEY, []);
  return Array.isArray(stored) ? stored : [];
}

function getAllRegistrationRequests() {
  const merged = new Map();
  getBaseRegistrationRequests().forEach(request => merged.set(String(request.id), normalizeRegistrationWorkflow({ ...request })));
  getStoredRegistrationRequests().forEach(request => merged.set(String(request.id), normalizeRegistrationWorkflow({ ...request })));
  return [...merged.values()].sort((a, b) => new Date(b.submittedAt || 0) - new Date(a.submittedAt || 0));
}

function getActiveRegistrationRequests(requests = getAllRegistrationRequests()) {
  const source = Array.isArray(requests) ? requests : getAllRegistrationRequests();
  return source.filter((request) => ACTIVE_REVIEW_STATUSES.includes(String(request.reviewStatus || '')));
}

function getRejectedRegistrationRequests(requests = getAllRegistrationRequests()) {
  const source = Array.isArray(requests) ? requests : getAllRegistrationRequests();
  return source.filter((request) => String(request.reviewStatus || '') === 'rejected');
}

function getPendingReviewCount(requests = getAllRegistrationRequests()) {
  return getActiveRegistrationRequests(requests).length;
}

function syncAdminPendingBadge() {
  const badge = document.getElementById('pendingCountBadge');
  if (!badge) return 0;

  const pendingCount = getPendingReviewCount();
  badge.textContent = String(pendingCount);
  badge.hidden = pendingCount === 0;
  return pendingCount;
}

function getOwnerRegistrationLimit() {
  return OWNER_REGISTRATION_LIMIT;
}

function isOwnerRegistrationCounted(request) {
  return request && request.reviewStatus !== 'rejected' && request.reviewStatus !== 'withdrawn';
}

function getOwnerRegistrationCount(user = getCurrentUser()) {
  if (!user || user.role !== 'owner') return 0;

  const strongIdentifiers = new Set([
    user.id,
    user.email,
  ].filter(Boolean).map(value => String(value)));
  const fallbackName = strongIdentifiers.size === 0 && user.name ? String(user.name) : '';

  return getAllRegistrationRequests().filter((request) => {
    if (!isOwnerRegistrationCounted(request)) return false;

    if (strongIdentifiers.size > 0) {
      return strongIdentifiers.has(String(request.ownerUserId || '')) ||
        strongIdentifiers.has(String(request.ownerEmail || ''));
    }

    return fallbackName ? String(request.ownerName || '') === fallbackName : false;
  }).length;
}

function matchesOwnerIdentity(request = {}, user = {}) {
  const strongIdentifiers = new Set([
    user.id,
    user.userId,
    user.email,
    user.userEmail,
  ].filter(Boolean).map(value => String(value)));
  const fallbackName = strongIdentifiers.size === 0
    ? String(user.name || user.userName || '').trim()
    : '';

  if (strongIdentifiers.size > 0) {
    return strongIdentifiers.has(String(request.ownerUserId || request.userId || '')) ||
      strongIdentifiers.has(String(request.ownerEmail || request.userEmail || ''));
  }

  return fallbackName ? String(request.ownerName || request.userName || '').trim() === fallbackName : false;
}

function getStoredApprovedHouses() {
  const stored = readJsonStorage(APPROVED_HOUSES_KEY, []);
  return Array.isArray(stored) ? stored : [];
}

function upsertStoredApprovedHouse(house) {
  if (!house?.id) return;

  const stored = getStoredApprovedHouses();
  const next = [...stored];
  const index = next.findIndex((item) => String(item?.id) === String(house.id));

  if (index >= 0) {
    next[index] = { ...next[index], ...house };
  } else {
    next.unshift({ ...house });
  }

  writeJsonStorage(APPROVED_HOUSES_KEY, next);
}

function removeStoredApprovedHouseByRequest(requestId) {
  if (!requestId) return;

  const next = getStoredApprovedHouses().filter((house) => {
    const sameRequestId = String(house?.requestId || '') === String(requestId);
    const sameApprovedId = String(house?.id || '') === `approved-${requestId}`;
    return !sameRequestId && !sameApprovedId;
  });

  writeJsonStorage(APPROVED_HOUSES_KEY, next);
}

function getHousePhotoUrl(house) {
  const photos = Array.isArray(house?.photos) ? house.photos : [];
  const photo = photos.find(item => item && (item.dataUrl || item.url || item.src || typeof item === 'string'));
  if (!photo) return '';
  return typeof photo === 'string' ? photo : (photo.dataUrl || photo.url || photo.src || '');
}

function getHousePhotos(house) {
  const photos = Array.isArray(house?.photos) ? house.photos : [];
  return photos
    .map(photo => {
      if (typeof photo === 'string') return { name: '첨부 사진', dataUrl: photo };
      return photo;
    })
    .filter(photo => photo && (photo.dataUrl || photo.url || photo.src));
}

function getOperationTypeFromRequest(request) {
  if (request.operationType) return request.operationType;

  const usageText = Array.isArray(request.usageTypes)
    ? request.usageTypes.join(' ')
    : String(request.usageTypes || '');
  const normalized = usageText.toLowerCase();

  if (usageText.includes('장기') || normalized.includes('longterm')) return 'longterm';
  if (usageText.includes('체험') || normalized.includes('experience')) return 'experience';
  if (usageText.includes('커뮤니티') || normalized.includes('community')) return 'experience';
  return 'lodging';
}

function buildApprovedHouseFromRequest(request) {
  const operationType = getOperationTypeFromRequest(request);
  const usageTypes = Array.isArray(request.usageTypes) ? request.usageTypes : [];
  const buildingTypeLabel = request.buildingTypeLabel || request.buildingType || '빈집';
  const districtName = request.districtName || '';
  const generatedName = districtName
    ? `${districtName} 승인 빈집`
    : `${request.ownerName || '사용자'} 승인 빈집`;

  return {
    id: request.approvedHouseId || `approved-${request.id}`,
    requestId: request.id,
    ownerUserId: request.ownerUserId || '',
    ownerName: request.ownerName || '',
    ownerEmail: request.ownerEmail || '',
    name: request.houseName || generatedName,
    districtId: request.districtId,
    districtName,
    address: [request.address, request.addressDetail].filter(Boolean).join(' '),
    description: request.description || `${districtName || '영주시'}에 등록 승인된 빈집입니다.`,
    conditionGrade: request.conditionGrade || 'B',
    reviewStatus: 'approved',
    operationType,
    maxCapacity: Number(request.maxCapacity || request.capacity || 4),
    priceRange: request.priceRange || '협의 필요',
    tags: [
      districtName,
      buildingTypeLabel,
      ...usageTypes,
    ].filter(Boolean).slice(0, 5),
    photos: getHousePhotos(request),
    photoCount: request.photoCount || getHousePhotos(request).length,
    isApproved: true,
    isVerified: true,
    isCleaningDone: request.needsCleaning === 'no' || request.isCleaningDone || false,
    usagePurpose: usageTypes,
    facilities: request.facilities || ['관리자 승인 완료', '상세 이용 조건 협의 필요'],
    registeredAt: request.submittedAt || request.createdAt || new Date().toISOString().split('T')[0],
    approvedAt: request.approvedAt || request.updatedAt || new Date().toISOString().split('T')[0],
    reviewSummary: request.reviewComment || '관리자 검토 후 공개 승인된 빈집입니다.',
    source: 'registration-request',
  };
}

function getApprovedRegistrationHouses() {
  return getAllRegistrationRequests()
    .filter(request => request.reviewStatus === 'approved' && request.makePublic !== false)
    .filter(request => !isRegistrationHiddenByWithdrawal(request))
    .map(buildApprovedHouseFromRequest);
}

function getAllVacantHouses() {
  const merged = new Map();
  const baseHouses = typeof VACANT_HOUSE_LIST !== 'undefined' && Array.isArray(VACANT_HOUSE_LIST)
    ? VACANT_HOUSE_LIST
    : [];

  baseHouses.forEach(house => merged.set(String(house.id), { ...house }));
  getStoredApprovedHouses()
    .filter(house => !isApprovedHouseHiddenByWithdrawal(house))
    .forEach(house => merged.set(String(house.id), { ...house }));
  getApprovedRegistrationHouses().forEach(house => merged.set(String(house.id), { ...house }));

  return [...merged.values()].sort((a, b) => new Date(b.registeredAt || b.approvedAt || 0) - new Date(a.registeredAt || a.approvedAt || 0));
}

function getVacantHouseById(houseId) {
  return getAllVacantHouses().find(house => String(house.id) === String(houseId)) || null;
}

function saveRegistrationRequest(request) {
  const stored = getStoredRegistrationRequests();
  const currentUser = getCurrentUser();
  const normalized = normalizeRegistrationWorkflow({
    ...request,
    ownerUserId: request.ownerUserId || currentUser?.id || '',
    ownerName: request.ownerName || currentUser?.name || '',
    ownerEmail: request.ownerEmail || currentUser?.email || '',
    id: request.id || `req-${Date.now()}`,
    reviewStatus: request.reviewStatus || 'submitted',
    submittedAt: request.submittedAt || new Date().toISOString().split('T')[0],
    version: request.version || 1,
  });

  if (currentUser?.role === 'owner' && !stored.some(item => String(item.id) === String(normalized.id))) {
    const currentCount = getOwnerRegistrationCount(currentUser);
    if (currentCount >= getOwnerRegistrationLimit()) {
      throw new Error(`빈집 소유자는 최대 ${getOwnerRegistrationLimit()}건까지 등록 신청할 수 있습니다.`);
    }
  }

  const index = stored.findIndex(item => String(item.id) === String(normalized.id));
  if (index >= 0) {
    stored[index] = normalized;
  } else {
    stored.unshift(normalized);
  }
  if (!normalized.reviewHistory?.length) {
    normalized.reviewHistory = normalizeReviewHistory([], normalized);
  }

  writeJsonStorage(PLATFORM_REQUESTS_KEY, stored);
  addNotification('admin', {
    type: 'request',
    message: `${normalized.ownerName || '소유자'}님의 빈집 등록 신청이 접수되었습니다.`,
    href: `${getRootPath()}admin/admin-review-detail.html?id=${encodeURIComponent(normalized.id)}`,
  });
  emitPlatformDataChanged({ type: 'registration-request', request: normalized });
  return normalizeRegistrationWorkflow(normalized);
}

function updateRegistrationRequest(requestId, updates = {}, options = {}) {
  const all = getAllRegistrationRequests();
  const target = all.find(item => String(item.id) === String(requestId));
  if (!target) return null;

  const actor = normalizeUserRecord(options.actor || getCurrentUser());
  const expectedVersion = options.expectedVersion == null ? null : Number(options.expectedVersion);
  const currentVersion = Number(target.version || 1);

  if (expectedVersion !== null && Number.isFinite(expectedVersion) && expectedVersion !== currentVersion) {
    const versionError = new Error('이미 다른 담당자가 먼저 처리했습니다.');
    versionError.code = 'VERSION_MISMATCH';
    versionError.currentRequest = normalizeRegistrationWorkflow(target);
    throw versionError;
  }

  const nextReviewStatus = updates.reviewStatus || target.reviewStatus;
  const shouldClearLock = ['approved', 'rejected', APPROVAL_PENDING_STATUS].includes(String(nextReviewStatus || ''));
  const nextVersion = currentVersion + 1;
  const nextHistory = [...(Array.isArray(target.reviewHistory) ? target.reviewHistory : [])];
  const historyAction = options.historyAction
    || (updates.reviewStatus === 'approved' ? 'approve'
      : updates.reviewStatus === 'rejected' ? 'reject'
        : updates.reviewStatus && updates.reviewStatus !== target.reviewStatus ? 'status_change'
          : updates.internalReviewNote !== undefined ? 'note'
            : '');

  if (historyAction) {
    nextHistory.push(buildReviewHistoryEntry(historyAction, target, updates, actor));
  }

  const updated = normalizeRegistrationWorkflow({
    ...target,
    ...updates,
    updatedAt: new Date().toISOString(),
    version: nextVersion,
    reviewHistory: nextHistory,
    lockedById: shouldClearLock ? '' : (updates.lockedById ?? target.lockedById),
    lockedByName: shouldClearLock ? '' : (updates.lockedByName ?? target.lockedByName),
    lockedByRole: shouldClearLock ? '' : (updates.lockedByRole ?? target.lockedByRole),
    lockedAt: shouldClearLock ? '' : (updates.lockedAt ?? target.lockedAt),
  });
  const stored = getStoredRegistrationRequests();
  const index = stored.findIndex(item => String(item.id) === String(requestId));
  if (index >= 0) {
    stored[index] = updated;
  } else {
    stored.unshift(updated);
  }
  writeJsonStorage(PLATFORM_REQUESTS_KEY, stored);

  if (updated.reviewStatus === 'approved' && updated.makePublic !== false) {
    const approvedHouse = buildApprovedHouseFromRequest(updated);
    upsertStoredApprovedHouse(approvedHouse);
    addNotification('guest', {
      type: 'house-approved',
      message: `새 승인 빈집이 등록되었습니다: ${approvedHouse.name}`,
      href: `${getRootPath()}guest/guest-detail.html?id=${encodeURIComponent(approvedHouse.id)}`,
    });
    emitPlatformDataChanged({ type: 'approved-house', house: approvedHouse, request: updated });
  } else {
    removeStoredApprovedHouseByRequest(updated.id);
  }

  if (['approved', 'rejected', 'under_review', 'site_visit'].includes(updates.reviewStatus)) {
    const statusText = {
      approved: '승인 완료',
      rejected: '반려',
      under_review: '검토 중',
      site_visit: '현장 방문 예정',
    }[updates.reviewStatus] || '상태 변경';
    addNotification('owner', {
      type: 'request-status',
      message: `${updated.districtName || '등록 신청'} 빈집 신청이 ${statusText} 상태로 변경되었습니다.`,
      href: `${getRootPath()}owner/owner-requests.html`,
    }, {
      targetUser: {
        id: updated.ownerUserId,
        email: updated.ownerEmail,
        name: updated.ownerName,
        role: 'owner',
      },
    });
  }

  emitPlatformDataChanged({ type: 'registration-request-update', request: updated });
  return updated;
}

function startReviewRequest(requestId, user = getCurrentUser()) {
  const actor = normalizeUserRecord(user);
  const request = getAllRegistrationRequests().find((item) => String(item.id) === String(requestId));
  if (!request) {
    throw new Error('신청 정보를 찾을 수 없습니다.');
  }

  if (!canStartReviewRequest(request, actor) && !hasAdminPermission('review_manage', actor)) {
    throw new Error('검토 시작 권한이 없습니다.');
  }

  return updateRegistrationRequest(requestId, {
    assignedReviewerId: actor?.id || '',
    assignedReviewerName: actor?.name || '',
    assignedReviewerRole: getAdminRole(actor),
    lockedById: actor?.id || '',
    lockedByName: actor?.name || '',
    lockedByRole: getAdminRole(actor),
    lockedAt: new Date().toISOString(),
    reviewStatus: request.reviewStatus === 'submitted' ? 'under_review' : request.reviewStatus,
  }, {
    actor,
    expectedVersion: request.version,
    historyAction: request.assignedReviewerId ? 'reassign' : 'review_start',
  });
}

function submitReviewForApproval(requestId, user = getCurrentUser()) {
  const actor = normalizeUserRecord(user);
  const request = getAllRegistrationRequests().find((item) => String(item.id) === String(requestId));
  if (!request) {
    throw new Error('요청 정보를 찾을 수 없습니다.');
  }

  if (!canEditReviewRequest(request, actor)) {
    throw new Error('승인 대기로 전달할 권한이 없습니다.');
  }

  if (!REVIEW_EDITABLE_STATUSES.includes(String(request.reviewStatus || ''))) {
    throw new Error('현재 상태에서는 승인 대기로 전달할 수 없습니다.');
  }

  return updateRegistrationRequest(requestId, {
    reviewStatus: APPROVAL_PENDING_STATUS,
    reviewCompletedById: actor?.id || '',
    reviewCompletedByName: actor?.name || '',
    reviewCompletedByRole: getAdminRole(actor),
    reviewCompletedAt: new Date().toISOString(),
    assignedReviewerId: '',
    assignedReviewerName: '',
    assignedReviewerRole: '',
    lockedById: '',
    lockedByName: '',
    lockedByRole: '',
    lockedAt: '',
  }, {
    actor,
    expectedVersion: request.version,
    historyAction: 'submit_for_approval',
  });
}

function unlockReviewRequest(requestId, user = getCurrentUser()) {
  const actor = normalizeUserRecord(user);
  if (!hasAdminPermission('review_manage', actor)) {
    throw new Error('잠금 해제 권한이 없습니다.');
  }

  const request = getAllRegistrationRequests().find((item) => String(item.id) === String(requestId));
  if (!request) {
    throw new Error('신청 정보를 찾을 수 없습니다.');
  }

  return updateRegistrationRequest(requestId, {
    assignedReviewerId: '',
    assignedReviewerName: '',
    assignedReviewerRole: '',
    lockedById: '',
    lockedByName: '',
    lockedByRole: '',
    lockedAt: '',
  }, {
    actor,
    expectedVersion: request.version,
    historyAction: 'unlock',
  });
}

function getNotificationKey(role) {
  return `${NOTIFICATION_KEY_PREFIX}${role || 'guest'}`;
}

function getUserNotificationKey(user = getCurrentUser()) {
  const scopedId = buildUserScopedStorageId(user);
  return scopedId ? `${NOTIFICATION_KEY_PREFIX}user:${scopedId}` : null;
}

function getUserNotificationReadStateKey(user = getCurrentUser()) {
  const scopedId = buildUserScopedStorageId(user);
  return scopedId ? `${NOTIFICATION_KEY_PREFIX}read:${scopedId}` : null;
}

function normalizeNotificationEntry(notification = {}) {
  return {
    id: notification.id || `notice-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    message: notification.message || '',
    href: notification.href || '#',
    type: notification.type || 'info',
    read: Boolean(notification.read),
    createdAt: notification.createdAt || new Date().toISOString(),
  };
}

function prependNotificationToList(list, notification) {
  const normalized = normalizeNotificationEntry(notification);
  return [normalized, ...(Array.isArray(list) ? list : [])]
    .filter((item, index, source) => source.findIndex((entry) => String(entry.id) === String(item.id)) === index)
    .slice(0, 20);
}

function readNotificationList(key) {
  const list = readJsonStorage(key, []);
  return Array.isArray(list) ? list : [];
}

function readUserNotificationReadState(user = getCurrentUser()) {
  const key = getUserNotificationReadStateKey(user);
  if (!key) return {};
  const state = readJsonStorage(key, {});
  return state && typeof state === 'object' && !Array.isArray(state) ? state : {};
}

function writeUserNotificationReadState(user = getCurrentUser(), state = {}) {
  const key = getUserNotificationReadStateKey(user);
  if (!key) return;
  writeJsonStorage(key, state);
}

function addNotification(role, notification, options = {}) {
  const targetUser = normalizeUserRecord(options.targetUser || null);
  const targetKey = targetUser ? getUserNotificationKey(targetUser) : null;
  const key = targetKey || getNotificationKey(role);
  const list = readNotificationList(key);
  const next = prependNotificationToList(list, notification);
  writeJsonStorage(key, next);
  emitPlatformDataChanged({
    type: 'notification',
    role,
    key,
    targetUserKey: targetKey,
  });
}

function getStoredBookingRequests() {
  const stored = readJsonStorage(BOOKING_REQUESTS_KEY, []);
  return Array.isArray(stored) ? stored : [];
}

function getAllBookingRequests() {
  const merged = new Map();
  const base = typeof BOOKING_REQUESTS !== 'undefined' && Array.isArray(BOOKING_REQUESTS) ? BOOKING_REQUESTS : [];

  [...base, ...getStoredBookingRequests()].forEach((booking) => {
    if (!booking || !booking.id) return;
    merged.set(String(booking.id), { ...booking });
  });

  return [...merged.values()].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
}

function saveBookingRequest(booking) {
  const currentUser = getCurrentUser();
  const stored = getStoredBookingRequests();
  const normalized = {
    ...booking,
    id: booking.id || `booking-${Date.now()}`,
    kind: booking.kind || 'booking',
    status: booking.status || 'pending',
    guestUserId: booking.guestUserId || currentUser?.id || '',
    guestEmail: booking.guestEmail || currentUser?.email || '',
    guestName: booking.guestName || currentUser?.name || '투숙 희망자',
    guestCount: Number(booking.guestCount || booking.guests || 1),
    guests: Number(booking.guests || booking.guestCount || 1),
    createdAt: booking.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  stored.unshift(normalized);
  writeJsonStorage(BOOKING_REQUESTS_KEY, stored);
  if (normalized.ownerUserId || normalized.ownerEmail || normalized.ownerName) {
    addNotification('owner', {
      type: 'booking-request',
      message: `${normalized.houseName || '빈집'} 예약 요청이 접수되었습니다.`,
      href: `${getRootPath()}owner/owner-mypage.html`,
    }, {
      targetUser: {
        id: normalized.ownerUserId,
        email: normalized.ownerEmail,
        name: normalized.ownerName,
        role: 'owner',
      },
    });
  }
  emitPlatformDataChanged({ type: 'booking-request', booking: normalized });
  return normalized;
}

function matchesBookingOwnerIdentity(booking = {}, user = {}) {
  const strongIdentifiers = new Set([
    user.id,
    user.userId,
    user.email,
    user.userEmail,
  ].filter(Boolean).map((value) => String(value)));
  const fallbackName = strongIdentifiers.size === 0
    ? String(user.name || user.userName || '').trim()
    : '';

  if (strongIdentifiers.size > 0) {
    return strongIdentifiers.has(String(booking.ownerUserId || ''))
      || strongIdentifiers.has(String(booking.ownerEmail || ''));
  }

  return fallbackName ? String(booking.ownerName || '').trim() === fallbackName : false;
}

function getOwnerVisibleBookingRequests(user = getCurrentUser()) {
  if (!user || user.role !== 'owner') return [];
  return getAllBookingRequests().filter((booking) => matchesBookingOwnerIdentity(booking, user));
}

function updateBookingRequestStatus(bookingId, status, user = getCurrentUser()) {
  const actor = normalizeUserRecord(user);
  if (!actor || actor.role !== 'owner') {
    throw new Error('예약 상태를 변경할 권한이 없습니다.');
  }

  const allowedStatuses = new Set(['approved', 'rejected', 'hold']);
  if (!allowedStatuses.has(String(status || '').trim().toLowerCase())) {
    throw new Error('지원하지 않는 예약 상태입니다.');
  }

  const allBookings = getAllBookingRequests();
  const target = allBookings.find((booking) => String(booking.id) === String(bookingId));
  if (!target) {
    throw new Error('예약 요청을 찾을 수 없습니다.');
  }

  if (!matchesBookingOwnerIdentity(target, actor)) {
    throw new Error('내 빈집 예약만 처리할 수 있습니다.');
  }

  const stored = getStoredBookingRequests();
  const updated = {
    ...target,
    status,
    ownerReviewedAt: new Date().toISOString(),
    ownerReviewedById: actor.id || '',
    ownerReviewedByName: actor.name || '',
    updatedAt: new Date().toISOString(),
  };

  const index = stored.findIndex((booking) => String(booking.id) === String(bookingId));
  if (index >= 0) {
    stored[index] = updated;
  } else {
    stored.unshift(updated);
  }
  writeJsonStorage(BOOKING_REQUESTS_KEY, stored);

  if (updated.guestUserId || updated.guestEmail || updated.guestName) {
    const statusText = {
      approved: '승인',
      rejected: '거절',
      hold: '보류',
    }[status] || '변경';
    addNotification('guest', {
      type: 'booking-status',
      message: `${updated.houseName || '예약'} 요청이 ${statusText}되었습니다.`,
      href: `${getRootPath()}guest/guest-mypage.html#bookings`,
    }, {
      targetUser: {
        id: updated.guestUserId,
        email: updated.guestEmail,
        name: updated.guestName,
        role: 'guest',
      },
    });
  }

  emitPlatformDataChanged({ type: 'booking-status-update', booking: updated });
  return updated;
}

function getNotifications(user = getCurrentUser()) {
  const role = user?.role || 'guest';
  const useRoleNotifications = role === 'admin';
  const roleList = useRoleNotifications ? readNotificationList(getNotificationKey(role)) : [];
  const userKey = getUserNotificationKey(user);
  const personalList = userKey ? readNotificationList(userKey) : [];
  const readState = readUserNotificationReadState(user);
  const merged = new Map();

  roleList.forEach((item) => {
    const normalized = normalizeNotificationEntry(item);
    merged.set(String(normalized.id), {
      ...normalized,
      read: Boolean(readState[normalized.id]),
      scope: 'role',
    });
  });

  personalList.forEach((item) => {
    const normalized = normalizeNotificationEntry(item);
    merged.set(String(normalized.id), {
      ...normalized,
      scope: 'user',
    });
  });

  return [...merged.values()]
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
    .map((item) => {
    if (role === 'admin' && item?.type === 'withdrawal-request') {
      return {
        ...item,
        href: `${getRootPath()}admin/admin-dashboard.html#withdrawalApprovalPanel`,
      };
    }
    return item;
  });
}

function getUnreadNotificationCount(user = getCurrentUser()) {
  return getNotifications(user).filter(item => !item.read).length;
}

function markNotificationsRead(user = getCurrentUser()) {
  const role = user?.role || 'guest';
  const useRoleNotifications = role === 'admin';
  const userKey = getUserNotificationKey(user);
  if (userKey) {
    const personalList = readNotificationList(userKey).map((item) => ({ ...normalizeNotificationEntry(item), read: true }));
    writeJsonStorage(userKey, personalList);
  }

  const readState = readUserNotificationReadState(user);
  if (useRoleNotifications) {
    readNotificationList(getNotificationKey(role)).forEach((item) => {
      const id = String(item?.id || '');
      if (id) readState[id] = true;
    });
  }
  writeUserNotificationReadState(user, readState);
  emitPlatformDataChanged({ type: 'notification-read', role, userKey });
}

function getStoredCommunityNotices() {
  const stored = readJsonStorage(COMMUNITY_NOTICE_KEY, []);
  return Array.isArray(stored) ? stored : [];
}

function saveCommunityNotice(notice) {
  const notices = getStoredCommunityNotices();
  const saved = {
    id: notice.id || `notice-${Date.now()}`,
    title: notice.title,
    content: notice.content,
    date: notice.date || new Date().toISOString().split('T')[0],
    author: notice.author || '공공기관',
    isPinned: Boolean(notice.isPinned),
  };
  notices.unshift(saved);
  writeJsonStorage(COMMUNITY_NOTICE_KEY, notices);
  addNotification('guest', {
    type: 'community',
    message: `새 공지사항: ${saved.title}`,
    href: `${getRootPath()}community/community.html`,
  });
  emitPlatformDataChanged({ type: 'community-notice', notice: saved });
  return saved;
}

function getStoredCommunityQna() {
  const stored = readJsonStorage(COMMUNITY_QNA_KEY, []);
  return Array.isArray(stored) ? stored : [];
}

function getStoredWithdrawalRequests() {
  const stored = readJsonStorage(WITHDRAW_REQUESTS_KEY, []);
  return Array.isArray(stored) ? stored : [];
}

function saveStoredWithdrawalRequests(requests) {
  writeJsonStorage(WITHDRAW_REQUESTS_KEY, Array.isArray(requests) ? requests : []);
}

function removeStoredWithdrawalRequestForUser(user = getCurrentUser()) {
  if (!user) return;

  const filtered = getStoredWithdrawalRequests().filter((request) =>
    !(
      String(request.userId) === String(user.id) &&
      String(request.role || '') === String(user.role || '')
    )
  );

  saveStoredWithdrawalRequests(filtered);
}

function getCurrentUserWithdrawalRequest(user = getCurrentUser()) {
  if (!user) return null;

  const requests = getStoredWithdrawalRequests();
  return requests.find((request) =>
    String(request.userId) === String(user.id) &&
    String(request.role || '') === String(user.role || '')
  ) || null;
}

function isFinalizedWithdrawalStatus(status) {
  return ['approved', 'completed', 'withdrawn'].includes(String(status || '').trim().toLowerCase());
}

function isRegistrationHiddenByWithdrawal(request) {
  if (!request) return false;

  return getStoredWithdrawalRequests().some((withdrawalRequest) => {
    if (String(withdrawalRequest.role || '') !== 'owner') return false;
    if (!isFinalizedWithdrawalStatus(withdrawalRequest.status)) return false;
    return matchesOwnerIdentity(request, withdrawalRequest);
  });
}

function isApprovedHouseHiddenByWithdrawal(house) {
  if (!house) return false;

  if (isRegistrationHiddenByWithdrawal(house)) {
    return true;
  }

  if (!house.requestId) return false;

  const sourceRequest = getStoredRegistrationRequests().find((request) => String(request.id) === String(house.requestId));
  return isRegistrationHiddenByWithdrawal(sourceRequest);
}

function submitWithdrawalRequest(user = getCurrentUser(), payload = {}) {
  if (!user) return null;

  const requests = getStoredWithdrawalRequests();
  const existingIndex = requests.findIndex((request) =>
    String(request.userId) === String(user.id) &&
    String(request.role || '') === String(user.role || '')
  );

  const saved = {
    id: payload.id || `withdraw-${Date.now()}`,
    userId: user.id,
    userName: user.name || '사용자',
    userEmail: user.email || '',
    role: user.role || 'guest',
    status: payload.status || 'pending_approval',
    reason: String(payload.reason || '').trim(),
    submittedAt: payload.submittedAt || new Date().toISOString(),
    approvedAt: payload.approvedAt || '',
    adminMemo: payload.adminMemo || '',
  };

  if (existingIndex >= 0) {
    requests[existingIndex] = {
      ...requests[existingIndex],
      ...saved,
      id: requests[existingIndex].id || saved.id,
      submittedAt: requests[existingIndex].submittedAt || saved.submittedAt,
    };
  } else {
    requests.unshift(saved);
  }

  saveStoredWithdrawalRequests(requests);

  addNotification('admin', {
    type: 'withdrawal-request',
    message: `${saved.userName}님의 회원 탈퇴 요청이 접수되었습니다.`,
    href: `${getRootPath()}admin/admin-dashboard.html#withdrawalApprovalPanel`,
  });

  emitPlatformDataChanged({ type: 'withdrawal-request', request: saved });
  return existingIndex >= 0 ? requests[existingIndex] : saved;
}

function getPendingOwnerWithdrawalRequests() {
  return getStoredWithdrawalRequests()
    .filter((request) =>
      String(request.role || '') === 'owner' &&
      String(request.status || '').trim().toLowerCase() === 'pending_approval'
    )
    .sort((a, b) => new Date(b.submittedAt || 0) - new Date(a.submittedAt || 0));
}

function updateWithdrawalRequestStatus(requestId, updates = {}) {
  const requests = getStoredWithdrawalRequests();
  const index = requests.findIndex((request) => String(request.id) === String(requestId));
  if (index < 0) return null;

  requests[index] = {
    ...requests[index],
    ...updates,
  };

  saveStoredWithdrawalRequests(requests);
  emitPlatformDataChanged({ type: 'withdrawal-request-update', request: requests[index] });
  return requests[index];
}

async function approveOwnerWithdrawalRequest(requestId, adminUser = getCurrentUser()) {
  if (!adminUser || adminUser.role !== 'admin') {
    throw new Error('관리자 계정으로만 탈퇴 승인을 진행할 수 있습니다.');
  }

  const request = getStoredWithdrawalRequests().find((item) => String(item.id) === String(requestId));
  if (!request) {
    throw new Error('탈퇴 요청 정보를 찾을 수 없습니다.');
  }

  const response = await fetch(`${getApiBaseUrl()}/admin/withdraw/approve`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      adminUserId: adminUser.id,
      targetUserId: Number(request.userId),
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.detail || '탈퇴 승인 처리에 실패했습니다.');
  }

  const updated = updateWithdrawalRequestStatus(requestId, {
    status: 'approved',
    approvedAt: new Date().toISOString(),
    adminMemo: data.message || '영주시 승인 완료',
  });

  addNotification('admin', {
    type: 'withdrawal-approved',
    message: `${request.userName}님의 탈퇴를 승인했습니다.`,
    href: `${getRootPath()}admin/admin-dashboard.html#withdrawalApprovalPanel`,
  });

  return updated;
}

function saveCommunityQna(qna) {
  const qnas = getStoredCommunityQna();
  const currentUser = getCurrentUser();
  const saved = {
    id: qna.id || `qna-${Date.now()}`,
    question: qna.question,
    detail: qna.detail || '',
    author: qna.author || '방문자',
    authorUserId: qna.authorUserId || currentUser?.id || '',
    authorEmail: qna.authorEmail || currentUser?.email || '',
    authorRole: qna.authorRole || currentUser?.role || 'guest',
    authorName: qna.authorName || qna.author || currentUser?.name || '방문자',
    isPrivate: Boolean(qna.isPrivate),
    answer: qna.answer || '',
    answeredBy: qna.answeredBy || '',
    createdAt: qna.createdAt || new Date().toISOString().split('T')[0],
  };
  qnas.unshift(saved);
  writeJsonStorage(COMMUNITY_QNA_KEY, qnas);
  addNotification('admin', {
    type: 'qna',
    message: `새 Q&A 문의: ${saved.question}`,
    href: `${getRootPath()}community/community.html`,
  });
  emitPlatformDataChanged({ type: 'community-qna', qna: saved });
  return saved;
}

function answerCommunityQna(qnaId, answer, adminName = '공공기관') {
  const qnas = getStoredCommunityQna();
  const index = qnas.findIndex(item => String(item.id) === String(qnaId));
  if (index < 0) return null;
  qnas[index] = {
    ...qnas[index],
    answer,
    answeredBy: adminName,
    answeredAt: new Date().toISOString().split('T')[0],
  };
  writeJsonStorage(COMMUNITY_QNA_KEY, qnas);
  addNotification(qnas[index].authorRole || 'guest', {
    type: 'qna-answer',
    message: `Q&A 답변이 등록되었습니다: ${qnas[index].question}`,
    href: `${getRootPath()}community/community.html`,
  }, {
    targetUser: {
      id: qnas[index].authorUserId,
      email: qnas[index].authorEmail,
      name: qnas[index].authorName || qnas[index].author,
      role: qnas[index].authorRole || 'guest',
    },
  });
  emitPlatformDataChanged({ type: 'community-qna-answer', qna: qnas[index] });
  return qnas[index];
}

/**
 * 현재 로그인된 사용자 정보를 반환합니다.
 * 추후 Python 백엔드 연동 시 API 호출로 교체하세요.
 * @returns {Object|null} 사용자 정보 객체 또는 null
 */
function getCurrentUser() {
  const userJson = sessionStorage.getItem(AUTH_STORAGE_KEY) || localStorage.getItem(AUTH_STORAGE_KEY);
  if (!userJson) return null;
  try {
    const user = normalizeUserRecord(JSON.parse(userJson));
    const withdrawalRequest = user && user.role === 'owner'
      ? getCurrentUserWithdrawalRequest(user)
      : null;

    if (withdrawalRequest && isFinalizedWithdrawalStatus(withdrawalRequest.status)) {
      sessionStorage.removeItem(AUTH_STORAGE_KEY);
      localStorage.removeItem(AUTH_STORAGE_KEY);
      localStorage.removeItem(LEGACY_WISHLIST_KEY);
      return null;
    }

    return user;
  } catch {
    return null;
  }
}

/**
 * 사용자 로그인 처리 (데모용)
 * @param {Object} userData - 사용자 정보
 * @param {boolean} rememberMe - 로그인 유지 여부
 */
function loginUser(userData, rememberMe = false) {
  const storage = rememberMe ? localStorage : sessionStorage;
  const normalizedUser = normalizeUserRecord(userData);

  sessionStorage.removeItem(AUTH_STORAGE_KEY);
  localStorage.removeItem(AUTH_STORAGE_KEY);
  localStorage.removeItem(LEGACY_WISHLIST_KEY);

  storage.setItem(AUTH_STORAGE_KEY, JSON.stringify(normalizedUser));
  emitAuthChanged();
}

/**
 * 사용자 로그아웃 처리
 */
function logoutUser() {
  sessionStorage.removeItem(AUTH_STORAGE_KEY);
  localStorage.removeItem(AUTH_STORAGE_KEY);
  localStorage.removeItem(LEGACY_WISHLIST_KEY);
  emitAuthChanged();
  window.location.href = getRootPath() + 'home/index.html';
}

function getApiBaseUrl() {
  if (window.YEONGJU_API_BASE_URL) {
    return String(window.YEONGJU_API_BASE_URL).replace(/\/$/, '');
  }

  // 현재 로컬 시연용 Python FastAPI 주소
  return 'http://127.0.0.1:8000';
}

async function withdrawCurrentUser() {
  const user = getCurrentUser();

  if (!user) {
    showToast('로그인 정보가 없습니다.', 'warning');
    return;
  }

  const confirmed = window.confirm('정말 회원탈퇴 하시겠습니까?\n탈퇴 후 계정 정보는 DB에서 완전히 삭제되며 복구할 수 없습니다.');
  if (!confirmed) return;

  try {
    const response = await fetch(`${getApiBaseUrl()}/auth/withdraw`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        userId: user.id,
      }),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.detail || '회원탈퇴 처리에 실패했습니다.');
    }

    sessionStorage.removeItem(AUTH_STORAGE_KEY);
    localStorage.removeItem(AUTH_STORAGE_KEY);
    localStorage.removeItem(LEGACY_WISHLIST_KEY);
    removeStoredWithdrawalRequestForUser(user);

    showToast('회원탈퇴가 완료되어 계정 정보가 완전히 삭제되었습니다.', 'success', 1800);

    setTimeout(() => {
      window.location.href = getRootPath() + 'home/index.html';
    }, 700);
  } catch (error) {
    console.error(error);
    showToast(error.message || '회원탈퇴 중 오류가 발생했습니다.', 'danger');
  }
}

/**
 * 관리자 권한 확인
 * @returns {boolean}
 */
function isAdminUser() {
  const user = getCurrentUser();
  return user && user.role === 'admin';
}

function isOwnerUser(user = getCurrentUser()) {
  return Boolean(user && user.role === 'owner');
}

/**
 * 로그인 여부 확인
 * @returns {boolean}
 */
function isLoggedIn() {
  return getCurrentUser() !== null;
}

/**
 * 관리자 페이지 접근 권한 검사
 * 관리자가 아닌 경우 접근 거부 화면을 렌더링합니다.
 */
function requireAdminAccess() {
  if (!isAdminUser()) {
    renderAccessDenied();
    return false;
  }
  return true;
}

/**
 * 로그인 필요 페이지 접근 권한 검사
 * 비로그인 시 로그인 페이지로 리다이렉트합니다.
 */
function requireLogin() {
  if (!isLoggedIn()) {
    window.location.href = getRootPath() + 'auth/login.html';
    return false;
  }
  return true;
}

/* ============================================================
   경로 유틸리티
   ============================================================ */

/**
 * 현재 파일 위치에서 프로젝트 루트 경로를 계산합니다.
 * @returns {string} 루트 경로 (예: '../' 또는 '../../')
 */
function getRootPath() {
  const path = window.location.pathname;

  if (window.location.hostname.includes('github.io')) {
    return '/yeongju-vacant-house-ai/';
  }

  if (path.includes('/home/')) return '../';
  if (path.includes('/guest/')) return '../';
  if (path.includes('/auth/')) return '../';
  if (path.includes('/admin/')) return '../';
  if (path.includes('/owner/')) return '../';
  if (path.includes('/vendor/')) return '../';
  if (path.includes('/legal/')) return '../';
  if (path.includes('/community/')) return '../';

  return './';
}

function getNotificationSectionHref(user = getCurrentUser()) {
  if (!user) return `${getRootPath()}auth/login.html`;

  const root = getRootPath();
  return {
    guest: `${root}guest/guest-mypage.html#guestNotifications`,
    owner: `${root}owner/owner-mypage.html#ownerNotifications`,
    admin: `${root}admin/admin-dashboard.html#adminNotificationsPanel`,
  }[user.role] || `${root}home/index.html`;
}

/* ============================================================
   접근 거부 화면 렌더링
   ============================================================ */

/**
 * 접근 거부 화면을 메인 콘텐츠 영역에 렌더링합니다.
 */
function renderAccessDenied() {
  const mainContent = document.querySelector('main') || document.body;
  mainContent.innerHTML = `
    <div class="access-denied">
      <div class="access-denied__icon">🔒</div>
      <h2 class="access-denied__title">접근 권한이 없습니다</h2>
      <p class="access-denied__desc">
        이 페이지는 공공기관 관리자만 접근할 수 있습니다.<br>
        로그인 정보를 확인하거나 담당자에게 문의하세요.
      </p>
      <div style="display:flex;gap:12px;justify-content:center;">
        <a href="${getRootPath()}auth/login.html" class="btn btn--primary">로그인 페이지로</a>
        <a href="${getRootPath()}home/index.html" class="btn btn--ghost">메인으로 돌아가기</a>
      </div>
    </div>
  `;
}

/* ============================================================
   토스트 알림
   ============================================================ */

/**
 * 토스트 알림을 표시합니다.
 * @param {string} message - 표시할 메시지
 * @param {'success'|'warning'|'danger'|'info'} type - 알림 유형
 * @param {number} duration - 표시 시간 (ms)
 */
function showToast(message, type = 'info', duration = 3000) {
  let container = document.querySelector('.toast-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const iconMap = { success: '✅', warning: '⚠️', danger: '❌', info: 'ℹ️' };
  const toast = document.createElement('div');
  toast.className = `toast toast--${type}`;
  toast.innerHTML = `<span>${iconMap[type] || 'ℹ️'}</span><span>${message}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.animation = 'toastSlideIn 0.3s ease reverse';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

/* ============================================================
   날짜 포맷 유틸리티
   ============================================================ */

/**
 * 날짜 문자열을 한국어 형식으로 변환합니다.
 * @param {string} dateString - ISO 날짜 문자열
 * @returns {string} 포맷된 날짜 (예: 2025년 4월 5일)
 */
function formatDateKo(dateString) {
  if (!dateString) return '-';
  const date = new Date(dateString);
  return date.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });
}

/**
 * 날짜 문자열을 짧은 형식으로 변환합니다.
 * @param {string} dateString - ISO 날짜 문자열
 * @returns {string} 포맷된 날짜 (예: 2025.04.05)
 */
function formatDateShort(dateString) {
  if (!dateString) return '-';
  return dateString.replace(/-/g, '.');
}

/* ============================================================
   상태 배지 HTML 생성
   ============================================================ */

/**
 * 검토 상태에 따른 배지 HTML을 반환합니다.
 * @param {string} status - 검토 상태 코드
 * @returns {string} 배지 HTML
 */
function getReviewStatusBadge(status) {
  const statusMap = {
    approved:  { label: '승인 완료', cls: 'badge--approved' },
    pending:   { label: '검토 중',   cls: 'badge--pending' },
    repair:    { label: '보수 필요', cls: 'badge--repair' },
    rejected:  { label: '반려',      cls: 'badge--rejected' },
    submitted: { label: '신청 완료', cls: 'badge--submitted' },
  };
  const s = statusMap[status] || { label: status, cls: '' };
  return `<span class="badge ${s.cls}">${s.label}</span>`;
}

/**
 * 상태 등급에 따른 배지 HTML을 반환합니다.
 */
function getConditionGradeBadge(grade) {
  const key = String(grade || '').trim().toUpperCase();

  const gradeMap = {
    '1': { label: '공공데이터 1등급', cls: 'badge--grade-a' },
    '2': { label: '공공데이터 2등급', cls: 'badge--grade-b' },
    '3': { label: '공공데이터 3등급', cls: 'badge--grade-c' },
    '4': { label: '공공데이터 4등급', cls: 'badge--grade-d' },
    A: { label: '공공데이터 기준 A등급', cls: 'badge--grade-a' },
    B: { label: '공공데이터 기준 B등급', cls: 'badge--grade-b' },
    C: { label: '공공데이터 기준 C등급', cls: 'badge--grade-c' },
    D: { label: '공공데이터 기준 D등급', cls: 'badge--grade-d' },
  };

  const g = gradeMap[key] || { label: `공공데이터 등급 ${key || '-'}`, cls: '' };
  return `<span class="badge ${g.cls}">${g.label}</span>`;
}

function getConditionGradeText(grade) {
  const key = String(grade || '').trim().toUpperCase();
  const textMap = {
    '1': '1등급',
    '2': '2등급',
    '3': '3등급',
    '4': '4등급',
    A: 'A등급',
    B: 'B등급',
    C: 'C등급',
    D: 'D등급',
  };
  return textMap[key] || `${key}등급`;
}

function getGradeCautionText(grade) {
  const key = String(grade || '').trim().toUpperCase();

  if (key === '1' || key === 'A') {
    return '공공데이터 기준 상태는 비교적 양호하지만 실제 이용 전<br> 현장 상태와 운영 가능 여부를 다시 확인하는 것이 좋습니다.';
  }
  if (key === '2' || key === 'B') {
    return '기본 활용 가능 후보이지만 소규모 정비 여부와 실제 내부 상태를 확인하는 것이 좋습니다.';
  }
  if (key === '3' || key === 'C') {
    return '보수 필요 가능성이 있어 체험·숙박 전 추가 점검이 필요합니다.';
  }
  if (key === '4' || key === 'D') {
    return '즉시 운영보다는 추가 검토 대상에 가깝기 때문에 실제 사용 전 확인이 필요합니다.';
  }

  return '공공데이터 정보만으로 실제 체험 적합도를 확정할 수 없어 현장 확인이 필요합니다.';
}

/**
 * 운영 유형에 따른 배지 HTML을 반환합니다.
 */
function getOperationTypeBadge(type) {
  const typeMap = {
    lodging:       { label: '숙박 가능',     cls: 'badge--approved' },
    longterm:      { label: '장기체류형',    cls: 'badge--pending' },
    experience:    { label: '체험공간형',    cls: 'badge--submitted' },
    review_needed: { label: '추가 검토 필요', cls: 'badge--repair' },
  };
  const t = typeMap[type] || { label: type, cls: '' };
  return `<span class="badge ${t.cls}">${t.label}</span>`;
}

/* ============================================================
   모달 유틸리티
   ============================================================ */

/**
 * 모달을 엽니다.
 * @param {string} modalId - 모달 요소의 ID
 */
function openModal(modalId) {
  const overlay = document.getElementById(modalId);
  if (overlay) {
    overlay.classList.add('is-open');
    document.body.style.overflow = 'hidden';
  }
}

/**
 * 모달을 닫습니다.
 * @param {string} modalId - 모달 요소의 ID
 */
function closeModal(modalId) {
  const overlay = document.getElementById(modalId);
  if (overlay) {
    overlay.classList.remove('is-open');
    document.body.style.overflow = '';
  }
}

/**
 * 모달 외부 클릭 시 닫기 이벤트를 등록합니다.
 * @param {string} modalId - 모달 요소의 ID
 */
function setupModalClose(modalId) {
  const overlay = document.getElementById(modalId);
  if (!overlay) return;

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeModal(modalId);
  });

  const closeBtn = overlay.querySelector('.modal__close');
  if (closeBtn) closeBtn.addEventListener('click', () => closeModal(modalId));
}

/* ============================================================
   URL 파라미터 유틸리티
   ============================================================ */

/**
 * URL 쿼리 파라미터를 객체로 반환합니다.
 * @returns {Object} 파라미터 객체
 */
function getUrlParams() {
  const params = {};
  new URLSearchParams(window.location.search).forEach((value, key) => {
    params[key] = value;
  });
  return params;
}

/**
 * URL 쿼리 파라미터를 설정합니다.
 * @param {Object} params - 설정할 파라미터 객체
 * @param {boolean} replace - 현재 히스토리를 교체할지 여부
 */
function setUrlParams(params, replace = false) {
  const url = new URL(window.location);
  Object.entries(params).forEach(([key, value]) => {
    if (value === null || value === undefined || value === '') {
      url.searchParams.delete(key);
    } else {
      url.searchParams.set(key, value);
    }
  });
  if (replace) {
    history.replaceState({}, '', url);
  } else {
    history.pushState({}, '', url);
  }
}

/* ============================================================
   필터 유틸리티
   ============================================================ */

/**
 * 빈집 목록을 필터 조건에 따라 필터링합니다.
 * @param {Array} houseList - 빈집 목록
 * @param {Object} filters - 필터 조건
 * @returns {Array} 필터링된 목록
 */
function filterVacantHouses(houseList, filters) {
  return houseList.filter(house => {
    // 승인된 빈집만 (게스트 화면용)
    if (filters.approvedOnly && !house.isApproved) return false;

    // 지역 필터
    if (filters.district && house.districtId !== filters.district) return false;

    // 상태 등급 필터
    if (filters.grade && house.conditionGrade !== filters.grade) return false;

    // 운영 유형 필터
    if (filters.operationType && house.operationType !== filters.operationType) return false;

    // 검토 상태 필터
    if (filters.reviewStatus && house.reviewStatus !== filters.reviewStatus) return false;

    // 수용 인원 필터
    if (filters.minCapacity && house.maxCapacity < parseInt(filters.minCapacity)) return false;

    // 검색어 필터
    if (filters.keyword) {
      const keyword = filters.keyword.toLowerCase();
      const searchTarget = `${house.name} ${house.districtName} ${house.address} ${house.description}`.toLowerCase();
      if (!searchTarget.includes(keyword)) return false;
    }

    return true;
  });
}

/* ============================================================
   로컬 스토리지 유틸리티
   ============================================================ */

/**
 * 찜한 빈집 목록을 가져옵니다.
 * @returns {Array} 찜한 빈집 ID 배열
 */
function getWishlist() {
  const user = getCurrentUser();
  const storageKey = getUserWishlistStorageKey(user);

  localStorage.removeItem(LEGACY_WISHLIST_KEY);

  if (!storageKey) {
    return [];
  }

  const json = localStorage.getItem(storageKey);

  try {
    const wishlist = JSON.parse(json);
    return Array.isArray(wishlist) ? wishlist : [];
  } catch {
    return [];
  }
}

/**
 * 빈집을 찜 목록에 추가하거나 제거합니다.
 * @param {string} houseId - 빈집 ID
 * @returns {boolean} 추가 여부 (true: 추가, false: 제거)
 */
function toggleWishlist(houseId) {
  const user = getCurrentUser();
  const storageKey = getUserWishlistStorageKey(user);

  if (!user || !storageKey) {
    showToast('로그인 후 찜 기능을 이용해주세요.', 'warning');
    return null;
  }

  const wishlist = getWishlist();
  const index = wishlist.indexOf(houseId);

  localStorage.removeItem(LEGACY_WISHLIST_KEY);

  if (index === -1) {
    wishlist.push(houseId);
    showToast('찜 목록에 추가되었습니다.', 'success');
    localStorage.setItem(storageKey, JSON.stringify(wishlist));
    emitWishlistChanged(user, wishlist);
    return true;
  } else {
    wishlist.splice(index, 1);
    showToast('찜 목록에서 제거되었습니다.', 'info');
    localStorage.setItem(storageKey, JSON.stringify(wishlist));
    emitWishlistChanged(user, wishlist);
    return false;
  }
}

/* ============================================================
   숫자 포맷 유틸리티
   ============================================================ */

/**
 * 숫자를 한국어 단위로 포맷합니다.
 * @param {number} num
 * @returns {string}
 */
function formatNumber(num) {
  return num.toLocaleString('ko-KR');
}

/* ============================================================
   DOM 유틸리티
   ============================================================ */

/**
 * 요소가 뷰포트에 진입할 때 애니메이션 클래스를 추가합니다.
 * @param {string} selector - 대상 요소 선택자
 * @param {string} animationClass - 추가할 클래스
 */
function setupScrollAnimation(selector, animationClass = 'is-visible') {
  const elements = document.querySelectorAll(selector);
  if (!elements.length) return;

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add(animationClass);
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1 });

  elements.forEach(el => observer.observe(el));
}

/**
 * 탭 UI를 초기화합니다.
 * @param {string} tabContainerSelector - 탭 컨테이너 선택자
 */
function initTabs(tabContainerSelector) {
  const container = document.querySelector(tabContainerSelector);
  if (!container) return;

  const tabBtns = container.querySelectorAll('[data-tab]');
  const tabPanels = container.querySelectorAll('[data-tab-panel]');

  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetTab = btn.dataset.tab;

      tabBtns.forEach(b => b.classList.remove('is-active'));
      tabPanels.forEach(p => p.classList.remove('is-active'));

      btn.classList.add('is-active');
      const targetPanel = container.querySelector(`[data-tab-panel="${targetTab}"]`);
      if (targetPanel) targetPanel.classList.add('is-active');
    });
  });
}

/* ============================================================
   페이지 초기화 공통 로직
   ============================================================ */

/**
 * 페이지 로드 시 공통 초기화를 수행합니다.
 * header.js, footer.js가 로드된 후 호출됩니다.
 */
function initCommonPage() {
  // 스크롤 애니메이션 설정
  setupScrollAnimation('.animate-on-scroll');

  // 모바일 메뉴 토글
  const mobileToggle = document.querySelector('.site-header__mobile-toggle');
  const mobileNav = document.querySelector('.site-header__mobile-nav');
  if (mobileToggle && mobileNav) {
    mobileToggle.addEventListener('click', () => {
      mobileNav.classList.toggle('is-open');
    });
  }
}

// DOM 로드 완료 후 공통 초기화 실행
document.addEventListener('DOMContentLoaded', initCommonPage);
