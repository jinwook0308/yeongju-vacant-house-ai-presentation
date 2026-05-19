/**
 * admin-review-detail.js
 * 영주 빈집 플랫폼 - 관리자 신청 검토 상세
 */

let currentRequest = null;

window.addEventListener('load', async function () {
  renderHeader('admin');
  renderFooter();

  await awaitPlatformDataReady();

  requestAnimationFrame(function () {
    if (!requireAdminLogin()) return;
    if (typeof syncAdminManagementNavigation === 'function') {
      syncAdminManagementNavigation();
    }

    const params = getUrlParams();
    const requestId = params.id;
    if (!requestId) {
      showNotFound();
      return;
    }

    bindGlobalReviewEvents();
    reloadCurrentRequest(requestId);
    setupModalClose('approveModal');
    setupModalClose('rejectModal');
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

function bindGlobalReviewEvents() {
  window.addEventListener('yeongju:platform-data-changed', function (event) {
    const targetId = getUrlParams().id;
    const changedId = String(event?.detail?.request?.id || '');
    const type = String(event?.detail?.type || '');

    if (targetId && (changedId === String(targetId) || type.includes('registration-request'))) {
      reloadCurrentRequest(targetId);
    }
  });

  window.addEventListener('storage', function (event) {
    if (event.key === PLATFORM_REQUESTS_KEY) {
      const targetId = getUrlParams().id;
      if (targetId) reloadCurrentRequest(targetId);
    }
  });
}

function reloadCurrentRequest(requestId) {
  const requests = getAllRegistrationRequests();
  const request = requests.find((item) => String(item.id) === String(requestId));
  if (!request) {
    showNotFound();
    return;
  }

  currentRequest = request;
  renderReviewDetail(request);
}

function renderReviewDetail(request) {
  const main = document.getElementById('reviewDetailMain');
  if (!main) return;

  const user = getCurrentUser();
  const status = getStatusMeta(request.reviewStatus);
  const buildingTypeLabel = getBuildingTypeLabel(request.buildingType);
  const reviewState = getReviewState(request, user);

  main.innerHTML = `
    <div class="admin-main__header">
      <div>
        <div style="display:flex;align-items:center;gap:8px;font-size:var(--font-size-xs);color:var(--color-text-muted);margin-bottom:8px;">
          <a href="admin-review-list.html" style="color:var(--color-text-muted);">검토 목록</a>
          <span>></span>
          <span>검토 상세</span>
        </div>
        <h1 class="admin-main__title">영주 ${escapeHtml(request.districtName || '')} · ${escapeHtml(request.ownerName || '')} 신청</h1>
      </div>
      <span class="badge ${status.className}" style="font-size:var(--font-size-sm);">${status.label}</span>
    </div>

    ${renderWorkflowBanner(request, reviewState)}

    <div class="review-detail-layout">
      <div>
        <div class="review-info-section">
          <div class="review-info-section__header">소유자 정보</div>
          <div class="review-info-section__body">
            <div class="review-info-grid">
              <div class="review-info-item">
                <div class="review-info-item__label">소유자명</div>
                <div class="review-info-item__value">${escapeHtml(request.ownerName || '-')}</div>
              </div>
              <div class="review-info-item">
                <div class="review-info-item__label">연락처</div>
                <div class="review-info-item__value">${escapeHtml(request.ownerContact || '-')}</div>
              </div>
              <div class="review-info-item">
                <div class="review-info-item__label">소유자 유형</div>
                <div class="review-info-item__value">${escapeHtml(request.ownerType || '개인')}</div>
              </div>
              <div class="review-info-item">
                <div class="review-info-item__label">신청일</div>
                <div class="review-info-item__value">${formatDateKo(request.submittedAt)}</div>
              </div>
            </div>
          </div>
        </div>

        <div class="review-info-section">
          <div class="review-info-section__header">빈집 위치</div>
          <div class="review-info-section__body">
            <div class="review-info-grid">
              <div class="review-info-item">
                <div class="review-info-item__label">읍면동</div>
                <div class="review-info-item__value">
                  <a href="admin-district.html?district=${encodeURIComponent(request.districtId || '')}" style="color:var(--color-primary);">
                    영주 ${escapeHtml(request.districtName || '-')}
                  </a>
                </div>
              </div>
              <div class="review-info-item">
                <div class="review-info-item__label">상세 주소</div>
                <div class="review-info-item__value">${escapeHtml(request.address || '-')}</div>
              </div>
            </div>
          </div>
        </div>

        <div class="review-info-section">
          <div class="review-info-section__header">건물 정보</div>
          <div class="review-info-section__body">
            <div class="review-info-grid">
              <div class="review-info-item">
                <div class="review-info-item__label">건물 유형</div>
                <div class="review-info-item__value">${escapeHtml(buildingTypeLabel)}</div>
              </div>
              <div class="review-info-item">
                <div class="review-info-item__label">건물 상태</div>
                <div class="review-info-item__value">${escapeHtml(request.buildingCondition || '-')}</div>
              </div>
              <div class="review-info-item">
                <div class="review-info-item__label">활용 희망 유형</div>
                <div class="review-info-item__value">${escapeHtml((request.usageTypes || []).join(', ') || '-')}</div>
              </div>
              <div class="review-info-item">
                <div class="review-info-item__label">방치 기간</div>
                <div class="review-info-item__value">${escapeHtml(request.vacantYears || '-')}</div>
              </div>
            </div>
            ${request.description ? `
              <div style="margin-top:var(--spacing-md);padding:var(--spacing-md);background:var(--color-bg-section);border-radius:var(--border-radius-sm);">
                <div style="font-size:var(--font-size-xs);color:var(--color-text-muted);margin-bottom:4px;">추가 설명</div>
                <p style="font-size:var(--font-size-sm);color:var(--color-text-secondary);">${escapeHtml(request.description)}</p>
              </div>
            ` : ''}
          </div>
        </div>

        ${Array.isArray(request.photos) && request.photos.length ? `
          <div class="review-info-section">
            <div class="review-info-section__header">첨부 사진</div>
            <div class="review-info-section__body">
              <div class="review-photo-grid">
                ${request.photos.map((photo) => `
                  <figure class="review-photo-card">
                    <img src="${escapeAttr(photo.dataUrl || photo.url || photo.src || '')}" alt="${escapeAttr(photo.name || '첨부 사진')}">
                    <figcaption>${escapeHtml(photo.name || '첨부 사진')}</figcaption>
                  </figure>
                `).join('')}
              </div>
            </div>
          </div>
        ` : ''}

        <div class="review-info-section">
          <div class="review-info-section__header">검토 이력</div>
          <div class="review-info-section__body">
            <div id="reviewHistoryList">
              ${renderReviewHistory(request)}
            </div>
          </div>
        </div>
      </div>

      <div class="review-action-sidebar">
        <div class="review-action-card">
          <div class="review-action-card__header">검토 액션</div>
          <div class="review-action-card__body">
            <div class="review-action-card__status">
              <span class="review-action-card__status-label">현재 상태</span>
              <span class="badge ${status.className}">${status.label}</span>
            </div>
            <div class="review-assignment-box">
              <div><strong>담당자</strong></div>
              <div>${escapeHtml(reviewState.assignmentLabel)}</div>
              <div class="review-assignment-box__sub">${escapeHtml(reviewState.assignmentSubtext)}</div>
            </div>
            ${renderActionControls(request, reviewState)}
            <hr style="border:none;border-top:1px solid var(--color-border-light);margin:8px 0;">
            <a href="admin-district.html?district=${encodeURIComponent(request.districtId || '')}" class="btn btn--ghost btn--full">
              ${escapeHtml(request.districtName || '지역')} 현황 보기
            </a>
            <a href="admin-review-list.html" class="btn btn--ghost btn--full">목록으로</a>
          </div>
        </div>

        <div class="review-action-card">
          <div class="review-action-card__header">${escapeHtml(request.districtName || '영주')} 다른 신청</div>
          <div class="review-action-card__body">
            ${renderSameDistrictRequests(request)}
          </div>
        </div>
      </div>
    </div>
  `;
}

function getReviewState(request, user) {
  const isAssignedToCurrent = isRequestAssignedToUser(request, user);
  const readOnly = isReviewRequestLockedForUser(request, user);
  const canManage = hasAdminPermission('review_manage', user);
  const canStart = canStartReviewRequest(request, user);
  const canEdit = canEditReviewRequest(request, user);
  const canSubmitForApproval = canEdit
    && ['submitted', 'under_review', 'site_visit'].includes(String(request.reviewStatus || ''));
  const canApprove = canApproveReviewRequest(request, user);

  let assignmentLabel = '미배정';
  let assignmentSubtext = '누군가 검토 시작을 누르면 담당자가 지정됩니다.';

  if (request.assignedReviewerId) {
    assignmentLabel = `${request.assignedReviewerName || '담당자'} · ${getAdminRoleLabel(request.assignedReviewerRole || 'reviewer')}`;
    assignmentSubtext = request.lockedAt
      ? `${formatDateKo(request.lockedAt)} 잠금 시작`
      : '담당자 배정 상태';
  }

  if (isAssignedToCurrent) {
    assignmentLabel = `내 담당 · ${getAdminRoleLabel(user)}`;
    assignmentSubtext = request.lockedAt
      ? `${formatDateKo(request.lockedAt)}부터 검토 중`
      : '현재 내가 담당 중입니다.';
  }

  if (String(request.reviewStatus || '') === 'approval_pending') {
    const reviewerName = request.reviewCompletedByName || request.assignedReviewerName || '검토 담당자';
    const reviewerRole = getAdminRoleLabel(request.reviewCompletedByRole || request.assignedReviewerRole || 'reviewer');
    assignmentLabel = `${reviewerName} · ${reviewerRole}`;
    assignmentSubtext = request.reviewCompletedAt
      ? `${formatDateKo(request.reviewCompletedAt)} 승인 대기 전달`
      : '검토 완료 후 승인 담당자 결재 대기 중입니다.';
  }

  return {
    canManage,
    canStart,
    canEdit,
    canSubmitForApproval,
    canApprove,
    readOnly,
    isAssignedToCurrent,
    assignmentLabel,
    assignmentSubtext,
  };
}

function renderWorkflowBanner(request, reviewState) {
  if (String(request.reviewStatus || '') === 'approval_pending') {
    return `
      <div class="review-workflow-banner ${reviewState.canApprove ? 'review-workflow-banner--mine' : ''}">
        ${reviewState.canApprove
          ? '검토가 끝난 신청입니다. 승인 담당자가 최종 승인 또는 반려를 처리하세요.'
          : '검토가 완료되어 승인 담당자 결재를 기다리는 신청입니다.'}
      </div>
    `;
  }

  if (reviewState.readOnly) {
    return `
      <div class="review-workflow-banner review-workflow-banner--locked">
        현재 ${escapeHtml(request.assignedReviewerName || '다른 담당자')}님이 검토 중입니다. 이 화면은 읽기 전용입니다.
      </div>
    `;
  }

  if (!request.assignedReviewerId && reviewState.canStart) {
    return `
      <div class="review-workflow-banner">
        아직 담당자가 지정되지 않았습니다. 검토 시작을 누르면 이 신청이 내 담당으로 배정됩니다.
      </div>
    `;
  }

  if (reviewState.isAssignedToCurrent) {
    return `
      <div class="review-workflow-banner review-workflow-banner--mine">
        현재 이 신청은 내 담당 건입니다. 저장할 때 다른 담당자의 선처리 여부를 version으로 다시 확인합니다.
      </div>
    `;
  }

  return '';
}

function renderActionControls(request, reviewState) {
  const controls = [];

  if (reviewState.canStart) {
    controls.push('<button class="btn btn--primary btn--full" onclick="startReviewFromDetail()">검토 시작</button>');
  }

  if (reviewState.canManage && request.assignedReviewerId && !reviewState.isAssignedToCurrent) {
    controls.push('<button class="btn btn--ghost btn--full" onclick="takeOverReviewFromDetail()">내가 재배정</button>');
    controls.push('<button class="btn btn--ghost btn--full" onclick="unlockReviewFromDetail()">잠금 해제</button>');
  }

  if (reviewState.canEdit) {
    controls.push(`
      <div class="form-group">
        <label class="form-label">검토 상태 변경</label>
        <select id="statusChangeSelect" class="form-control form-select">
          <option value="">상태 선택</option>
          <option value="under_review">검토 중으로 변경</option>
          <option value="site_visit">현장 방문 예정으로 변경</option>
        </select>
      </div>
    `);
    controls.push('<button class="btn btn--ghost btn--full" onclick="changeStatus()">상태 변경</button>');
    controls.push(`
      <div class="form-group">
        <label class="form-label">검토 메모</label>
        <textarea id="internalReviewNote" class="form-control" rows="4" placeholder="내부 검토 메모를 기록하세요.">${escapeHtml(request.internalReviewNote || '')}</textarea>
      </div>
    `);
    controls.push('<button class="btn btn--ghost btn--full" onclick="saveInternalReviewNote()">메모 저장</button>');
    if (reviewState.canSubmitForApproval) {
      controls.push('<button class="btn btn--primary btn--full" onclick="submitForApproval()">검토 확인</button>');
    }
  } else if (request.internalReviewNote) {
    controls.push(`
      <div class="form-group">
        <label class="form-label">검토 메모</label>
        <div class="review-readonly-note">${escapeHtml(request.internalReviewNote)}</div>
      </div>
    `);
  }

  if (reviewState.canApprove) {
    controls.push('<hr style="border:none;border-top:1px solid var(--color-border-light);margin:8px 0;">');
    controls.push('<button class="btn btn--success btn--full" onclick="openModal(\'approveModal\')">승인 처리</button>');
    controls.push('<button class="btn btn--danger btn--full" onclick="openModal(\'rejectModal\')">반려 처리</button>');
  } else if (['approved', 'rejected'].includes(String(request.reviewStatus || ''))) {
    controls.push(`
      <div class="review-readonly-note">
        처리 완료된 신청입니다.${request.reviewComment ? `<br><strong>처리 의견:</strong> ${escapeHtml(request.reviewComment)}` : ''}
      </div>
    `);
  }

  if (!controls.length) {
    controls.push('<div class="review-readonly-note">현재 권한으로는 열람만 가능합니다.</div>');
  }

  return controls.join('');
}

function renderReviewHistory(request) {
  const history = Array.isArray(request.reviewHistory) ? [...request.reviewHistory] : [];

  if (!history.length) {
    return `
      <div class="review-history-item">
        <div class="review-history-item__dot"></div>
        <div class="review-history-item__content">
          <div class="review-history-item__action">신청 접수</div>
          <div class="review-history-item__meta">${formatDateKo(request.submittedAt)} · 신청자</div>
        </div>
      </div>
    `;
  }

  history.sort((a, b) => new Date(b.at || 0) - new Date(a.at || 0));

  return history.map((item) => `
    <div class="review-history-item">
      <div class="review-history-item__dot"></div>
      <div class="review-history-item__content">
        <div class="review-history-item__action">${escapeHtml(getHistoryActionLabel(item.action))}</div>
        <div class="review-history-item__meta">
          ${formatDateKo(item.at)} · ${escapeHtml(item.actorName || '시스템')}
          ${item.toStatus ? ` · ${escapeHtml(getStatusMeta(item.toStatus).label)}` : ''}
          ${item.note ? ` · ${escapeHtml(item.note)}` : ''}
        </div>
      </div>
    </div>
  `).join('');
}

function renderSameDistrictRequests(request) {
  const sameDistrict = getAllRegistrationRequests()
    .filter((item) => item.districtId === request.districtId && item.id !== request.id)
    .slice(0, 3);

  if (!sameDistrict.length) {
    return '<p style="font-size:var(--font-size-xs);color:var(--color-text-muted);">같은 지역의 다른 신청이 없습니다.</p>';
  }

  return sameDistrict.map((item) => {
    const status = getStatusMeta(item.reviewStatus);
    return `
      <a href="admin-review-detail.html?id=${encodeURIComponent(item.id)}"
         style="display:flex;justify-content:space-between;align-items:center;padding:8px;border-bottom:1px solid var(--color-border-light);text-decoration:none;color:inherit;font-size:var(--font-size-xs);">
        <span style="color:var(--color-text-primary);">${escapeHtml(item.ownerName)}</span>
        <span class="badge ${status.className}" style="font-size:10px;">${status.label}</span>
      </a>
    `;
  }).join('');
}

async function startReviewFromDetail() {
  if (!currentRequest) return;
  const confirmed = confirm('이 신청을 담당하시겠습니까?\n담당자로 배정되면 다른 사용자는 읽기 전용으로 전환됩니다.');
  if (!confirmed) return;

  try {
    currentRequest = typeof updateRegistrationRequestRemote === 'function'
      ? await updateRegistrationRequestRemote(currentRequest.id, {
        assignedReviewerId: getCurrentUser()?.id || '',
        assignedReviewerName: getCurrentUser()?.name || '',
        assignedReviewerRole: getAdminRole(getCurrentUser()),
        lockedById: getCurrentUser()?.id || '',
        lockedByName: getCurrentUser()?.name || '',
        lockedByRole: getAdminRole(getCurrentUser()),
        lockedAt: new Date().toISOString(),
        reviewStatus: currentRequest.reviewStatus === 'submitted' ? 'under_review' : currentRequest.reviewStatus,
      }, {
        actor: getCurrentUser(),
        expectedVersion: currentRequest.version,
        historyAction: currentRequest.assignedReviewerId ? 'reassign' : 'review_start',
      })
      : startReviewRequest(currentRequest.id);
    showToast('검토 시작과 담당자 배정이 완료되었습니다.', 'success');
    renderReviewDetail(currentRequest);
  } catch (error) {
    handleReviewError(error);
  }
}

async function takeOverReviewFromDetail() {
  if (!currentRequest) return;
  const confirmed = confirm('현재 잠긴 담당 건을 내 담당으로 재배정하시겠습니까?');
  if (!confirmed) return;

  try {
    currentRequest = typeof updateRegistrationRequestRemote === 'function'
      ? await updateRegistrationRequestRemote(currentRequest.id, {
        assignedReviewerId: getCurrentUser()?.id || '',
        assignedReviewerName: getCurrentUser()?.name || '',
        assignedReviewerRole: getAdminRole(getCurrentUser()),
        lockedById: getCurrentUser()?.id || '',
        lockedByName: getCurrentUser()?.name || '',
        lockedByRole: getAdminRole(getCurrentUser()),
        lockedAt: new Date().toISOString(),
        reviewStatus: currentRequest.reviewStatus === 'submitted' ? 'under_review' : currentRequest.reviewStatus,
      }, {
        actor: getCurrentUser(),
        expectedVersion: currentRequest.version,
        historyAction: currentRequest.assignedReviewerId ? 'reassign' : 'review_start',
      })
      : startReviewRequest(currentRequest.id);
    showToast('내 담당 건으로 재배정되었습니다.', 'success');
    renderReviewDetail(currentRequest);
  } catch (error) {
    handleReviewError(error);
  }
}

async function unlockReviewFromDetail() {
  if (!currentRequest) return;
  const confirmed = confirm('이 신청의 잠금을 해제하고 미배정 상태로 되돌리시겠습니까?');
  if (!confirmed) return;

  try {
    currentRequest = typeof updateRegistrationRequestRemote === 'function'
      ? await updateRegistrationRequestRemote(currentRequest.id, {
        assignedReviewerId: '',
        assignedReviewerName: '',
        assignedReviewerRole: '',
        lockedById: '',
        lockedByName: '',
        lockedByRole: '',
        lockedAt: '',
      }, {
        actor: getCurrentUser(),
        expectedVersion: currentRequest.version,
        historyAction: 'unlock',
      })
      : unlockReviewRequest(currentRequest.id);
    showToast('잠금이 해제되었습니다.', 'success');
    renderReviewDetail(currentRequest);
  } catch (error) {
    handleReviewError(error);
  }
}

async function changeStatus() {
  if (!currentRequest) return;
  const nextStatus = document.getElementById('statusChangeSelect')?.value;
  if (!nextStatus) {
    showToast('변경할 상태를 선택해주세요.', 'warning');
    return;
  }

  try {
    currentRequest = typeof updateRegistrationRequestRemote === 'function'
      ? await updateRegistrationRequestRemote(currentRequest.id, {
        reviewStatus: nextStatus,
      }, {
        expectedVersion: currentRequest.version,
        historyAction: 'status_change',
      })
      : updateRegistrationRequest(currentRequest.id, {
      reviewStatus: nextStatus,
    }, {
      expectedVersion: currentRequest.version,
      historyAction: 'status_change',
    });
    showToast('상태가 변경되었습니다.', 'success');
    renderReviewDetail(currentRequest);
  } catch (error) {
    handleReviewError(error);
  }
}

async function submitForApproval() {
  if (!currentRequest) return;
  const confirmed = confirm('이 신청을 승인 담당자 결재 대기로 전달하시겠습니까?');
  if (!confirmed) return;

  try {
    currentRequest = typeof updateRegistrationRequestRemote === 'function'
      ? await updateRegistrationRequestRemote(currentRequest.id, {
        reviewStatus: APPROVAL_PENDING_STATUS,
        reviewCompletedById: getCurrentUser()?.id || '',
        reviewCompletedByName: getCurrentUser()?.name || '',
        reviewCompletedByRole: getAdminRole(getCurrentUser()),
        reviewCompletedAt: new Date().toISOString(),
        assignedReviewerId: '',
        assignedReviewerName: '',
        assignedReviewerRole: '',
        lockedById: '',
        lockedByName: '',
        lockedByRole: '',
        lockedAt: '',
      }, {
        actor: getCurrentUser(),
        expectedVersion: currentRequest.version,
        historyAction: 'submit_for_approval',
      })
      : submitReviewForApproval(currentRequest.id);
    showToast('승인 담당자 결재 대기로 전달했습니다.', 'success');
    renderReviewDetail(currentRequest);
  } catch (error) {
    handleReviewError(error);
  }
}

async function saveInternalReviewNote() {
  if (!currentRequest) return;
  const note = document.getElementById('internalReviewNote')?.value.trim() || '';

  try {
    currentRequest = typeof updateRegistrationRequestRemote === 'function'
      ? await updateRegistrationRequestRemote(currentRequest.id, {
        internalReviewNote: note,
      }, {
        expectedVersion: currentRequest.version,
        historyAction: 'note',
      })
      : updateRegistrationRequest(currentRequest.id, {
      internalReviewNote: note,
    }, {
      expectedVersion: currentRequest.version,
      historyAction: 'note',
    });
    showToast('검토 메모가 저장되었습니다.', 'success');
    renderReviewDetail(currentRequest);
  } catch (error) {
    handleReviewError(error);
  }
}

async function submitApproval() {
  if (!currentRequest) return;

  const grade = document.getElementById('approveGrade').value;
  const operationType = document.getElementById('approveOperationType').value;
  const comment = document.getElementById('approveComment').value.trim();
  const makePublic = document.getElementById('approvePublic').checked;

  try {
    currentRequest = typeof updateRegistrationRequestRemote === 'function'
      ? await updateRegistrationRequestRemote(currentRequest.id, {
        reviewStatus: 'approved',
        reviewComment: comment || '?뱀씤 泥섎━',
        conditionGrade: grade,
        operationType,
        makePublic,
      }, {
        expectedVersion: currentRequest.version,
        historyAction: 'approve',
      })
      : updateRegistrationRequest(currentRequest.id, {
      reviewStatus: 'approved',
      reviewComment: comment || '승인 처리',
      conditionGrade: grade,
      operationType,
      makePublic,
    }, {
      expectedVersion: currentRequest.version,
      historyAction: 'approve',
    });
    closeModal('approveModal');
    showToast('승인 처리가 완료되었습니다.', 'success');
    renderReviewDetail(currentRequest);
  } catch (error) {
    closeModal('approveModal');
    handleReviewError(error);
  }
}

async function submitRejection() {
  if (!currentRequest) return;

  const reason = document.getElementById('rejectReason').value;
  const comment = document.getElementById('rejectComment').value.trim();
  if (!reason) {
    showToast('반려 사유를 선택해주세요.', 'warning');
    return;
  }

  try {
    currentRequest = typeof updateRegistrationRequestRemote === 'function'
      ? await updateRegistrationRequestRemote(currentRequest.id, {
        reviewStatus: 'rejected',
        reviewComment: comment || reason,
        rejectReason: reason,
      }, {
        expectedVersion: currentRequest.version,
        historyAction: 'reject',
      })
      : updateRegistrationRequest(currentRequest.id, {
      reviewStatus: 'rejected',
      reviewComment: comment || reason,
      rejectReason: reason,
    }, {
      expectedVersion: currentRequest.version,
      historyAction: 'reject',
    });
    closeModal('rejectModal');
    showToast('반려 처리가 완료되었습니다.', 'info');
    renderReviewDetail(currentRequest);
  } catch (error) {
    closeModal('rejectModal');
    handleReviewError(error);
  }
}

function handleReviewError(error) {
  if (error?.code === 'VERSION_MISMATCH') {
    currentRequest = error.currentRequest || currentRequest;
    renderReviewDetail(currentRequest);
    showToast('이미 다른 담당자가 먼저 처리했습니다.', 'warning');
    return;
  }

  showToast(error?.message || '처리 중 오류가 발생했습니다.', 'warning');
}

function showNotFound() {
  const main = document.getElementById('reviewDetailMain');
  if (!main) return;
  main.innerHTML = `
    <div class="access-denied">
      <div class="access-denied__icon">검토</div>
      <h2 class="access-denied__title">신청 내역을 찾을 수 없습니다</h2>
      <a href="admin-review-list.html" class="btn btn--primary">목록으로</a>
    </div>
  `;
}

function getStatusMeta(status) {
  const map = {
    submitted: { label: '신청 완료', className: 'badge--submitted' },
    under_review: { label: '검토 중', className: 'badge--pending' },
    site_visit: { label: '현장 방문', className: 'badge--pending' },
    approval_pending: { label: '승인 대기', className: 'badge--pending' },
    approved: { label: '승인 완료', className: 'badge--approved' },
    rejected: { label: '반려', className: 'badge--rejected' },
  };
  return map[status] || { label: status || '확인 필요', className: '' };
}

function getBuildingTypeLabel(type) {
  const labels = {
    hanok: '한옥',
    farmhouse: '농가주택',
    modern: '근현대 주택',
    apartment: '아파트/빌라',
    other: '기타',
  };
  return labels[type] || type || '-';
}

function getHistoryActionLabel(action) {
  const labels = {
    submitted: '신청 접수',
    review_start: '검토 시작',
    submit_for_approval: '승인 대기 전달',
    reassign: '담당자 재배정',
    unlock: '잠금 해제',
    status_change: '상태 변경',
    note: '검토 메모 저장',
    approve: '승인 처리',
    reject: '반려 처리',
    update: '정보 수정',
  };
  return labels[action] || action || '이력';
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
