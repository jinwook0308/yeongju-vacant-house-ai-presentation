/**
 * login.js
 * 영주시 공공형 빈집 활용 플랫폼 - 로그인 페이지 스크립트
 */

const API_BASE_URL = typeof getApiBaseUrl === 'function'
  ? getApiBaseUrl()
  : 'http://127.0.0.1:8000';

const ROLE_LABELS = {
  guest: '투숙 희망자',
  owner: '빈집 소유자',
  admin: '공공기관 관리자',
};

// 역할별 로그인 후 이동 경로
const ROLE_REDIRECT_PATHS = {
  guest: 'guest/guest-list.html',
  owner: 'owner/owner-mypage.html',
  admin: 'admin/admin-dashboard.html',
};

let selectedRole = null;

window.addEventListener('load', function () {
  renderHeader('');
  renderFooter();

  if (tryHandleSocialCallback()) {
    return;
  }

  // URL 파라미터로 역할 사전 선택
  const params = getUrlParams();
  if (params.role) {
    highlightQuickLoginBtn(params.role);
  }

  // 로그인 폼 제출 이벤트
  const loginForm = document.getElementById('loginForm');
  if (loginForm) {
    loginForm.addEventListener('submit', handleLoginSubmit);
  }

  // 비밀번호 토글
  const passwordToggle = document.getElementById('passwordToggle');
  const passwordInput = document.getElementById('loginPassword');
  if (passwordToggle && passwordInput) {
    passwordToggle.addEventListener('click', () => {
      const isPassword = passwordInput.type === 'password';
      passwordInput.type = isPassword ? 'text' : 'password';
      passwordToggle.textContent = isPassword ? '🙈' : '👁';
    });
  }

  // 모달 닫기 설정
  setupModalClose('forgotPasswordModal');

  // 이미 로그인된 경우 리다이렉트
  const currentUser = getCurrentUser();
  if (currentUser) {
    const redirectPath = getRootPath() + (ROLE_REDIRECT_PATHS[currentUser.role] || 'home/index.html');
    window.location.href = redirectPath;
  }
});

/**
 * 빠른 로그인 처리
 * @param {string} role - 역할 코드 (guest/owner/admin)
 */
function quickLogin(role) {
  const roleLabel = ROLE_LABELS[role];
  if (!roleLabel) return;

  // 같은 역할을 다시 누르면 선택 해제
  if (selectedRole === role) {
    selectedRole = null;
    highlightQuickLoginBtn(null);
    showToast('회원 유형 선택이 해제되었습니다.', 'warning');
    return;
  }

  selectedRole = role;
  highlightQuickLoginBtn(role);

  showToast(`${roleLabel} 선택됨. 로그인 버튼을 눌러주세요.`, 'success');
}

/**
 * 로그인 폼 제출 처리
 * @param {Event} e
 */
async function handleLoginSubmit(e) {
  e.preventDefault();

  const roleSelection = selectedRole;
  const email = document.getElementById('loginId').value.trim();
  const password = document.getElementById('loginPassword').value;
  const rememberMe = document.getElementById('rememberMe').checked;

  if (!roleSelection) {
    showToast('회원 유형을 선택해주세요.', 'warning');
    return;
  }

  if (!email || !password) {
    showToast('이메일과 비밀번호를 입력해주세요.', 'warning');
    return;
  }

  try {
    const response = await fetch(`${API_BASE_URL}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email,
        password,
        role: roleSelection,
      }),
    });

    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      showToast(result.detail || '로그인에 실패했습니다.', 'warning');
      return;
    }

    const user = result.user;
    selectedRole = user.role;
    loginUser(user, rememberMe);
    showToast(`${user.roleLabel || ROLE_LABELS[user.role] || '사용자'}로 로그인되었습니다.`, 'success');

    setTimeout(() => {
      const redirectPath = getRootPath() + (ROLE_REDIRECT_PATHS[user.role] || 'home/index.html');
      window.location.href = redirectPath;
    }, 400);
  } catch (error) {
    showToast('서버에 연결할 수 없습니다. 잠시 후 다시 시도해주세요.', 'danger');
  }
}


/**
 * 비밀번호 찾기 모달 표시
 */
function showForgotPassword() {
  openModal('forgotPasswordModal');
}

// =========================================================
// SNS 간편 로그인 (UI 연결만 — OAuth 구현 추후)
// =========================================================
const SNS_PROVIDER_LABELS = {
  kakao: '카카오',
  google: '구글',
};

function parseSocialUserPayload(encodedUser) {
  if (!encodedUser) return null;

  try {
    const normalized = encodedUser.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, ch => ch.charCodeAt(0));
    const jsonString = new TextDecoder('utf-8').decode(bytes);
    return JSON.parse(jsonString);
  } catch (error) {
    return null;
  }
}

function tryHandleSocialCallback() {
  const params = getUrlParams();

  if (params.socialError) {
    showToast(params.socialError, 'warning');
    setUrlParams({ socialError: null, socialLogin: null, user: null }, true);
    return false;
  }

  if (params.socialLogin !== 'success' || !params.user) {
    return false;
  }

  const user = parseSocialUserPayload(params.user);
  if (!user) {
    showToast('소셜 로그인 응답을 처리하지 못했습니다.', 'danger');
    setUrlParams({ socialError: null, socialLogin: null, user: null }, true);
    return false;
  }

  loginUser(user, false);
  setUrlParams({ socialError: null, socialLogin: null, user: null }, true);
  showToast(`${user.roleLabel || ROLE_LABELS[user.role] || '사용자'}로 로그인되었습니다.`, 'success');

  setTimeout(() => {
    const redirectPath = getRootPath() + (ROLE_REDIRECT_PATHS[user.role] || 'home/index.html');
    window.location.href = redirectPath;
  }, 400);

  return true;
}

/**
 * SNS 간편 로그인 버튼 클릭 핸들러
 * @param {'naver'|'kakao'|'google'} provider
 */
async function handleSnsLogin(provider) {
  const label = SNS_PROVIDER_LABELS[provider] || provider;
  const roleSelection = selectedRole;

  if (!roleSelection) {
    showToast('먼저 회원 유형을 선택해주세요.', 'warning');
    return;
  }

  try {
    const response = await fetch(`${API_BASE_URL}/auth/social/${provider}/start?role=${encodeURIComponent(roleSelection)}`);
    const result = await response.json().catch(() => ({}));

    if (!response.ok || !result.authUrl) {
      showToast(result.detail || `${label} 로그인 준비에 실패했습니다.`, 'warning');
      return;
    }

    window.location.href = result.authUrl;
  } catch (error) {
    showToast(`${label} 로그인 서버에 연결할 수 없습니다.`, 'danger');
  }
}

/**
 * 비밀번호 재설정 링크 발송 처리 (데모)
 */
function submitForgotPassword() {
  const email = document.getElementById('forgotEmail').value.trim();
  if (!email) {
    showToast('이메일 주소를 입력해주세요.', 'warning');
    return;
  }
  closeModal('forgotPasswordModal');
  showToast('비밀번호 재설정 링크를 발송했습니다. (데모)', 'success');
}

/**
 * 빠른 로그인 버튼 강조 표시
 * @param {string} role
 */
function highlightQuickLoginBtn(role) {
  const btnMap = {
    guest: 'quick-login-btn--guest',
    owner: 'quick-login-btn--owner',
    admin: 'quick-login-btn--admin',
  };

  Object.values(btnMap).forEach(cls => {
    const btn = document.querySelector(`.${cls}`);
    if (btn) {
      btn.style.borderColor = '';
      btn.style.backgroundColor = '';
    }
  });

  const selectedClass = btnMap[role];
  if (selectedClass) {
    const selectedBtn = document.querySelector(`.${selectedClass}`);
    if (selectedBtn) {
      selectedBtn.style.borderColor = 'var(--color-primary)';
      selectedBtn.style.backgroundColor = 'rgba(201, 168, 76, 0.08)';
    }
  }
}
