window.addEventListener('load', function () {
  renderHeader('');
  renderFooter();

  if (!requireLogin()) return;

  setupWithdrawPage();
});

function getWithdrawReturnHref(user = getCurrentUser()) {
  const root = getRootPath();
  return {
    guest: `${root}guest/guest-mypage.html`,
    owner: `${root}owner/owner-mypage.html`,
    admin: `${root}admin/admin-dashboard.html`,
  }[user?.role] || `${root}home/index.html`;
}

function setupWithdrawPage() {
  const user = getCurrentUser();
  if (!user) return;

  const eyebrow = document.getElementById('withdrawRoleEyebrow');
  const title = document.getElementById('withdrawTitle');
  const desc = document.getElementById('withdrawDescription');
  const directPanel = document.getElementById('withdrawDirectPanel');
  const cancelBtn = document.getElementById('withdrawCancelBtn');
  const confirmBtn = document.getElementById('withdrawConfirmBtn');
  const returnHref = getWithdrawReturnHref(user);

  if (eyebrow) {
    eyebrow.textContent = `${user.roleLabel || user.role || '사용자'} 계정`;
  }

  const handleCancel = () => {
    window.location.href = returnHref;
  };

  cancelBtn?.addEventListener('click', handleCancel);
  if (title) {
    title.textContent = '회원 탈퇴 진행';
  }

  if (desc) {
    desc.textContent = '탈퇴를 진행하면 계정과 저장된 로그인 정보가 즉시 삭제되며 복구할 수 없습니다.';
  }

  if (directPanel) directPanel.hidden = false;

  confirmBtn?.addEventListener('click', async () => {
    await withdrawCurrentUser();
  });
}
