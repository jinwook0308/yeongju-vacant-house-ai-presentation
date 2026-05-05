const adminUserState = {
  users: [],
  loading: false,
};

window.addEventListener('load', function () {
  renderHeader('admin');
  renderFooter();

  requestAnimationFrame(function () {
    if (!requireAdminLogin()) return;
    if (typeof syncAdminManagementNavigation === 'function') {
      syncAdminManagementNavigation();
    }
    if (!requireAdminManagerAccess()) return;

    bindAdminUserManagementEvents();
    syncReviewPendingBadge();
    loadAdminUsers();

    window.addEventListener('yeongju:platform-data-changed', handleAdminUserPlatformChanged);
    window.addEventListener('storage', handleAdminUserStorageChanged);
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

function requireAdminManagerAccess() {
  if (typeof hasAdminPermission === 'function' && hasAdminPermission('admin_manage_users')) {
    return true;
  }

  const main = document.getElementById('adminUserManagementMain');
  if (main) {
    main.innerHTML = `
      <section class="admin-panel admin-user-access-denied">
        <div class="admin-panel__header">
          <h1 class="admin-panel__title">접근 권한이 없습니다.</h1>
        </div>
        <div class="admin-user-empty">
          <strong>총괄 관리자만 공공기관 사용자 관리를 열 수 있습니다.</strong>
          <span>reviewer / approver 계정은 검토 화면만 사용할 수 있습니다.</span>
        </div>
      </section>
    `;
  }
  return false;
}

function bindAdminUserManagementEvents() {
  document.getElementById('adminUserRefreshBtn')?.addEventListener('click', function () {
    loadAdminUsers();
  });

  document.getElementById('pendingAdminUsersTable')?.addEventListener('click', function (event) {
    const button = event.target.closest('[data-approve-admin-user]');
    if (!button) return;
    approveAdminUser(button.dataset.approveAdminUser);
  });

  document.getElementById('activeAdminUsersTable')?.addEventListener('click', function (event) {
    const button = event.target.closest('[data-update-admin-role]');
    if (!button) return;
    updateAdminUserRole(button.dataset.updateAdminRole);
  });
}

function handleAdminUserPlatformChanged(event) {
  const type = String(event?.detail?.type || '');
  if (type.includes('admin-user') || type.includes('registration-request')) {
    syncReviewPendingBadge();
  }
  if (type.includes('admin-user')) {
    loadAdminUsers();
  }
}

function handleAdminUserStorageChanged(event) {
  if (event.key === PLATFORM_REQUESTS_KEY) {
    syncReviewPendingBadge();
  }
}

function syncReviewPendingBadge() {
  const badge = document.getElementById('pendingCountBadge');
  if (!badge || typeof getAllRegistrationRequests !== 'function') return;

  const pendingCount = getAllRegistrationRequests().filter((request) =>
    ['submitted', 'under_review', 'site_visit'].includes(request.reviewStatus)
  ).length;

  badge.textContent = String(pendingCount);
  badge.hidden = pendingCount === 0;
}

async function loadAdminUsers() {
  const currentUser = getCurrentUser();
  if (!currentUser) return;

  adminUserState.loading = true;
  renderAdminUsers();

  try {
    const response = await fetch(`${getApiBaseUrl()}/admin/users?adminUserId=${encodeURIComponent(currentUser.id)}`);
    const data = await response.json().catch(() => []);

    if (!response.ok) {
      throw new Error(data.detail || '공공기관 사용자 목록을 불러오지 못했습니다.');
    }

    adminUserState.users = Array.isArray(data) ? data : [];
    renderAdminUsers();
  } catch (error) {
    console.error(error);
    showToast(error.message || '공공기관 사용자 목록 조회 중 오류가 발생했습니다.', 'danger');
    adminUserState.users = [];
    renderAdminUsers();
  } finally {
    adminUserState.loading = false;
    renderAdminUsers();
  }
}

function renderAdminUsers() {
  renderAdminUserSummary();
  renderPendingAdminUsers();
  renderActiveAdminUsers();
}

function renderAdminUserSummary() {
  const grid = document.getElementById('adminUserSummaryGrid');
  if (!grid) return;

  const users = adminUserState.users;
  const pendingCount = users.filter((user) => user.status === 'pending_approval').length;
  const activeCount = users.filter((user) => user.status === 'active').length;
  const approverCount = users.filter((user) => user.status === 'active' && user.adminRole === 'approver').length;
  const superAdminCount = users.filter((user) => user.status === 'active' && user.adminRole === 'super_admin').length;

  const cards = [
    { label: '승인 대기 계정', value: pendingCount, note: '로그인 전 총괄 승인 필요' },
    { label: '활성 공공기관 계정', value: activeCount, note: '현재 로그인 가능한 계정 수' },
    { label: '승인 권한자', value: approverCount, note: '최종 승인 / 반려 처리 담당' },
    { label: '총괄 관리자', value: superAdminCount, note: '재배정 / 잠금 해제 / 권한 관리' },
  ];

  grid.innerHTML = cards.map((card) => `
    <article class="admin-user-summary-card">
      <span class="admin-user-summary-card__label">${escapeHtml(card.label)}</span>
      <strong class="admin-user-summary-card__value">${Number(card.value || 0).toLocaleString('ko-KR')}</strong>
      <span class="admin-user-summary-card__note">${escapeHtml(card.note)}</span>
    </article>
  `).join('');
}

function renderPendingAdminUsers() {
  const container = document.getElementById('pendingAdminUsersTable');
  const countEl = document.getElementById('pendingAdminUsersCount');
  if (!container) return;

  const pendingUsers = adminUserState.users.filter((user) => user.status === 'pending_approval');
  if (countEl) countEl.textContent = `총 ${pendingUsers.length}명`;

  if (adminUserState.loading && !adminUserState.users.length) {
    container.innerHTML = renderAdminUserEmpty('공공기관 계정 목록을 불러오는 중입니다.', '잠시만 기다려 주세요.');
    return;
  }

  if (!pendingUsers.length) {
    container.innerHTML = renderAdminUserEmpty('승인 대기 중인 공공기관 계정이 없습니다.', '새 공공기관 회원가입이 들어오면 여기에 표시됩니다.');
    return;
  }

  container.innerHTML = `
    <div class="admin-user-table-wrap">
      <table class="admin-table">
        <thead>
          <tr>
            <th>사용자</th>
            <th>부서</th>
            <th>상태</th>
            <th>승인 권한</th>
            <th>작업</th>
          </tr>
        </thead>
        <tbody>
          ${pendingUsers.map((user) => renderPendingUserRow(user)).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function renderActiveAdminUsers() {
  const container = document.getElementById('activeAdminUsersTable');
  const countEl = document.getElementById('activeAdminUsersCount');
  if (!container) return;

  const activeUsers = adminUserState.users.filter((user) => user.status === 'active');
  if (countEl) countEl.textContent = `총 ${activeUsers.length}명`;

  if (adminUserState.loading && !adminUserState.users.length) {
    container.innerHTML = renderAdminUserEmpty('공공기관 계정 목록을 불러오는 중입니다.', '잠시만 기다려 주세요.');
    return;
  }

  if (!activeUsers.length) {
    container.innerHTML = renderAdminUserEmpty('활성 공공기관 계정이 없습니다.', '승인된 계정이 생기면 여기에 표시됩니다.');
    return;
  }

  container.innerHTML = `
    <div class="admin-user-table-wrap">
      <table class="admin-table">
        <thead>
          <tr>
            <th>사용자</th>
            <th>부서</th>
            <th>현재 권한</th>
            <th>상태</th>
            <th>권한 변경</th>
            <th>작업</th>
          </tr>
        </thead>
        <tbody>
          ${activeUsers.map((user) => renderActiveUserRow(user)).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function renderPendingUserRow(user) {
  return `
    <tr>
      <td>
        <span class="admin-table__strong">${escapeHtml(user.name || '-')}</span>
        <span class="admin-user-table__sub">${escapeHtml(user.email || '-')}</span>
      </td>
      <td>${escapeHtml(user.department || '미입력')}</td>
      <td><span class="admin-user-status-chip" data-status="${escapeAttr(user.status || '')}">${escapeHtml(getStatusLabel(user.status))}</span></td>
      <td>
        <div class="admin-user-action-row">
          <select class="form-control form-select" data-admin-role-select="${escapeAttr(user.id)}">
            ${renderAdminRoleOptions(user.adminRole || 'reviewer')}
          </select>
        </div>
      </td>
      <td>
        <button type="button" class="btn btn--primary btn--sm" data-approve-admin-user="${escapeAttr(user.id)}">승인</button>
      </td>
    </tr>
  `;
}

function renderActiveUserRow(user) {
  const currentUser = getCurrentUser();
  const currentAdminRole = typeof getAdminRole === 'function' ? getAdminRole(currentUser) : '';
  const isSystemAdminTarget = user.adminRole === 'system_admin';
  const isSelfAccount = String(currentUser?.id || '') === String(user.id || '');
  const allowSystemAdmin = typeof hasAdminPermission === 'function' && hasAdminPermission('system_manage', currentUser);
  const canEditRole = !isSelfAccount && (!isSystemAdminTarget || allowSystemAdmin);

  return `
    <tr>
      <td>
        <span class="admin-table__strong">${escapeHtml(user.name || '-')}</span>
        <span class="admin-user-table__sub">${escapeHtml(user.email || '-')}</span>
      </td>
      <td>${escapeHtml(user.department || '미입력')}</td>
      <td><span class="admin-user-role-chip">${escapeHtml(user.adminRoleLabel || getAdminRoleLabel(user.adminRole || 'reviewer'))}</span></td>
      <td><span class="admin-user-status-chip" data-status="${escapeAttr(user.status || '')}">${escapeHtml(getStatusLabel(user.status))}</span></td>
      <td>
        ${canEditRole ? `
          <div class="admin-user-action-row">
            <select class="form-control form-select" data-admin-role-select="${escapeAttr(user.id)}">
              ${renderAdminRoleOptions(user.adminRole || 'reviewer')}
            </select>
          </div>
        ` : `<span class="admin-user-readonly-note">${escapeHtml(isSelfAccount ? '본인 계정' : '읽기 전용')}</span>`}
      </td>
      <td>
        ${canEditRole ? `
          <button type="button" class="btn btn--ghost btn--sm" data-update-admin-role="${escapeAttr(user.id)}">권한 저장</button>
        ` : `<span class="admin-user-muted">${escapeHtml(currentAdminRole === 'system_admin' ? '시스템 계정' : '잠금 상태')}</span>`}
      </td>
    </tr>
  `;
}

function renderAdminRoleOptions(selectedRole) {
  const currentUser = getCurrentUser();
  const allowSystemAdmin = typeof hasAdminPermission === 'function' && hasAdminPermission('system_manage', currentUser);
  const roles = ['reviewer', 'approver', 'super_admin'];
  if (allowSystemAdmin) {
    roles.push('system_admin');
  }

  return roles.map((role) => `
    <option value="${escapeAttr(role)}" ${role === selectedRole ? 'selected' : ''}>
      ${escapeHtml(getAdminRoleLabel(role))}
    </option>
  `).join('');
}

function renderAdminUserEmpty(title, description) {
  return `
    <div class="admin-user-empty">
      <strong>${escapeHtml(title)}</strong>
      <span>${escapeHtml(description)}</span>
    </div>
  `;
}

function getStatusLabel(status) {
  const labels = {
    pending_approval: '승인 대기',
    active: '활성',
    suspended: '중지',
    withdrawn: '탈퇴',
  };
  return labels[String(status || '').trim().toLowerCase()] || '상태 미정';
}

async function approveAdminUser(userId) {
  const currentUser = getCurrentUser();
  if (!currentUser) return;

  const select = document.querySelector(`[data-admin-role-select="${CSS.escape(String(userId))}"]`);
  const adminRole = select?.value || 'reviewer';

  const confirmed = confirm('이 공공기관 계정을 승인하시겠습니까?\n승인 후 로그인과 검토 업무 사용이 가능해집니다.');
  if (!confirmed) return;

  try {
    const response = await fetch(`${getApiBaseUrl()}/admin/users/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        adminUserId: Number(currentUser.id),
        targetUserId: Number(userId),
        adminRole,
      }),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.detail || '공공기관 계정 승인에 실패했습니다.');
    }

    showToast(data.message || '공공기관 계정 승인이 완료되었습니다.', 'success');
    emitPlatformDataChanged({ type: 'admin-user-update', user: data.user || null });
    loadAdminUsers();
  } catch (error) {
    console.error(error);
    showToast(error.message || '공공기관 계정 승인 중 오류가 발생했습니다.', 'danger');
  }
}

async function updateAdminUserRole(userId) {
  const currentUser = getCurrentUser();
  if (!currentUser) return;

  const select = document.querySelector(`[data-admin-role-select="${CSS.escape(String(userId))}"]`);
  const adminRole = select?.value || 'reviewer';

  try {
    const response = await fetch(`${getApiBaseUrl()}/admin/users/role`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        adminUserId: Number(currentUser.id),
        targetUserId: Number(userId),
        adminRole,
      }),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.detail || '공공기관 사용자 권한 변경에 실패했습니다.');
    }

    showToast(data.message || '공공기관 사용자 권한이 변경되었습니다.', 'success');
    emitPlatformDataChanged({ type: 'admin-user-update', user: data.user || null });
    loadAdminUsers();
  } catch (error) {
    console.error(error);
    showToast(error.message || '공공기관 사용자 권한 변경 중 오류가 발생했습니다.', 'danger');
  }
}
