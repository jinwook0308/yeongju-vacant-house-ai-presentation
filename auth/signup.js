/**
 * signup.js
 * 영주 빈집 플랫폼 - 회원가입 페이지 스크립트
 */

const API_BASE_URL = typeof getApiBaseUrl === 'function'
  ? getApiBaseUrl()
  : 'http://127.0.0.1:8000';

let selectedRole = null;
let signupDemoModalConfirmHandler = null;

const ROLE_LABELS = {
  guest: '투숙 희망자',
  owner: '빈집 소유자',
  admin: '공공기관 사용자',
};

const SNS_PROVIDER_LABELS = {
  kakao: '카카오',
  google: '구글',
};

window.addEventListener('load', function () {
  renderHeader('');
  renderFooter();

  const signupForm = document.getElementById('signupForm');
  if (signupForm) {
    signupForm.addEventListener('submit', handleSignupSubmit);
  }

  bindSignupDemoModal();
});

function selectRole(role) {
  selectedRole = role;

  const signupContainer = document.querySelector('.signup-container');
  const signupForm = document.getElementById('signupForm');
  const ownerFields = document.getElementById('ownerFields');
  const adminFields = document.getElementById('adminFields');

  document.querySelectorAll('.role-option').forEach((button) => {
    button.classList.toggle('is-selected', button.dataset.role === role);
  });

  document.getElementById('roleSelector').style.display = 'none';
  if (signupContainer) {
    signupContainer.classList.add('signup-container--form-active');
  }
  if (signupForm) {
    signupForm.hidden = false;
    signupForm.classList.add('is-active');
  }

  if (ownerFields) {
    ownerFields.hidden = role !== 'owner';
  }
  if (adminFields) {
    adminFields.hidden = role !== 'admin';
  }

  updateSignupSnsTitle();
}

function resetRoleSelection() {
  selectedRole = null;
  const signupContainer = document.querySelector('.signup-container');
  const signupForm = document.getElementById('signupForm');
  const ownerFields = document.getElementById('ownerFields');
  const adminFields = document.getElementById('adminFields');

  document.getElementById('roleSelector').style.display = 'block';
  if (signupContainer) {
    signupContainer.classList.remove('signup-container--form-active');
  }
  if (signupForm) {
    signupForm.hidden = true;
    signupForm.classList.remove('is-active');
  }
  if (ownerFields) {
    ownerFields.hidden = true;
  }
  if (adminFields) {
    adminFields.hidden = true;
  }

  updateSignupSnsTitle();
}

function updateSignupSnsTitle() {
  const titleEl = document.getElementById('signupSnsTitle');
  if (!titleEl) return;

  if (!selectedRole) {
    titleEl.textContent = '회원유형을 선택하고 간편 가입을 진행하세요.';
    return;
  }

  titleEl.textContent = `${ROLE_LABELS[selectedRole]} 유형으로 간편 가입`;
}

async function handleSignupSns(provider) {
  if (!selectedRole) {
    showToast('먼저 회원 유형을 선택해주세요.', 'warning');
    return;
  }

  const providerLabel = SNS_PROVIDER_LABELS[provider] || provider;

  try {
    const response = await fetch(`${API_BASE_URL}/auth/social/${provider}/start?role=${encodeURIComponent(selectedRole)}`);
    const result = await response.json().catch(() => ({}));

    if (!response.ok || !result.authUrl) {
      showToast(result.detail || `${providerLabel} 간편 가입 준비에 실패했습니다.`, 'warning');
      return;
    }

    window.location.href = result.authUrl;
  } catch (error) {
    showToast(`${providerLabel} 간편 가입 서버에 연결할 수 없습니다.`, 'danger');
  }
}

async function handleSignupSubmit(event) {
  event.preventDefault();

  const name = document.getElementById('signupName').value.trim();
  const email = document.getElementById('signupEmail').value.trim();
  const phone = document.getElementById('signupPhone').value.trim();
  const password = document.getElementById('signupPassword').value;
  const passwordConfirm = document.getElementById('signupPasswordConfirm').value;
  const agreeTerms = document.getElementById('agreeTerms').checked;
  const ownerAddress = document.getElementById('ownerAddress')?.value.trim() || '';
  const adminOrgCode = document.getElementById('adminOrgCode')?.value.trim() || '';
  const adminDept = document.getElementById('adminDept')?.value.trim() || '';

  if (!selectedRole) {
    showToast('회원 유형을 먼저 선택해주세요.', 'warning');
    return;
  }

  if (!name || !email || !phone || !password) {
    showToast('필수 항목을 모두 입력해주세요.', 'warning');
    return;
  }

  if (password.length < 8) {
    showToast('비밀번호는 8자 이상이어야 합니다.', 'warning');
    return;
  }

  if (password !== passwordConfirm) {
    showToast('비밀번호가 일치하지 않습니다.', 'danger');
    return;
  }

  if (!agreeTerms) {
    showToast('이용약관 동의가 필요합니다.', 'warning');
    return;
  }

  try {
    const response = await fetch(`${API_BASE_URL}/auth/signup`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name,
        email,
        phone,
        password,
        role: selectedRole,
        agreeTerms,
        ownerAddress: selectedRole === 'owner' ? ownerAddress : null,
        adminOrgCode: selectedRole === 'admin' ? adminOrgCode : null,
        adminDept: selectedRole === 'admin' ? adminDept : null,
      }),
    });

    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      showToast(result.detail || result.message || '회원가입 처리 중 오류가 발생했습니다.', 'danger');
      return;
    }

    if (!result.user) {
      showToast('회원가입 응답이 올바르지 않습니다.', 'danger');
      return;
    }

    loginUser(result.user, false);

    const redirectPaths = {
      guest: '../guest/guest-list.html',
      owner: '../owner/owner-mypage.html',
      admin: '../admin/admin-dashboard.html',
    };

    if (selectedRole === 'admin') {
      showSignupDemoModal(function () {
        window.location.href = redirectPaths.admin;
      });
      return;
    }

    showToast(result.message || '회원가입이 완료되었습니다.', 'success');

    setTimeout(() => {
      window.location.href = redirectPaths[selectedRole] || '../home/index.html';
    }, 700);
  } catch (error) {
    console.error('회원가입 요청 실패:', error);
    showToast('서버에 연결할 수 없습니다. 백엔드 실행 상태를 확인해주세요.', 'danger');
  }
}

function bindSignupDemoModal() {
  const modal = document.getElementById('signupDemoModal');
  const confirmButton = document.getElementById('signupDemoModalConfirm');

  if (!modal || !confirmButton) return;

  confirmButton.addEventListener('click', function () {
    const handler = signupDemoModalConfirmHandler;
    closeSignupDemoModal();
    if (typeof handler === 'function') {
      handler();
    }
  });
}

function showSignupDemoModal(onConfirm) {
  const modal = document.getElementById('signupDemoModal');
  const confirmButton = document.getElementById('signupDemoModalConfirm');

  if (!modal || !confirmButton) {
    if (typeof onConfirm === 'function') onConfirm();
    return;
  }

  signupDemoModalConfirmHandler = onConfirm;
  modal.hidden = false;
  confirmButton.focus();
}

function closeSignupDemoModal() {
  const modal = document.getElementById('signupDemoModal');
  if (!modal) return;

  modal.hidden = true;
  signupDemoModalConfirmHandler = null;
}
