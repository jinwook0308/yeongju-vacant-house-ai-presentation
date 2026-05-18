(() => {
  const AI_CHAT_STORAGE_KEY_PREFIX = 'yeongjuAiChatHistory:';
  const AI_CHAT_LEGACY_ANON_KEY = `${AI_CHAT_STORAGE_KEY_PREFIX}anonymous`;
  const AI_CHAT_HISTORY_LIMIT = 20;
  const AI_API_HISTORY_LIMIT = 8;

  function getApiBase() {
    return typeof getApiBaseUrl === 'function' ? getApiBaseUrl() : 'http://localhost:8000';
  }

  function getCurrentPlatformUser() {
    return typeof getCurrentUser === 'function' ? getCurrentUser() : null;
  }

  function buildStorageKey(user) {
    if (!user) return null;

    if (typeof buildUserScopedStorageId === 'function') {
      const scopedId = buildUserScopedStorageId(user);
      if (scopedId) {
        return `${AI_CHAT_STORAGE_KEY_PREFIX}${scopedId}`;
      }
    }

    const role = String(user.role || 'guest').trim().toLowerCase();
    const rawIdentifier = user.id || user.email || user.username || user.name;
    if (!rawIdentifier) return null;

    return `${AI_CHAT_STORAGE_KEY_PREFIX}${encodeURIComponent(`${role}:${String(rawIdentifier).trim().toLowerCase()}`)}`;
  }

  function isStoredUser(user) {
    return Boolean(buildStorageKey(user));
  }

  function escapeHtml(text) {
    return String(text ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatMultilineText(text) {
    return escapeHtml(text || '').replace(/\n/g, '<br>');
  }

  function buildParsedSummary(parsedConditions = {}) {
    const parts = [];
    if (parsedConditions.districtName) parts.push(`지역 ${parsedConditions.districtName}`);
    if (parsedConditions.capacity) parts.push(`인원 ${parsedConditions.capacity}명`);

    if (parsedConditions.stayDuration) {
      const stayDurationMap = { short: '단기', medium: '중기', long: '장기' };
      parts.push(`체류 ${stayDurationMap[parsedConditions.stayDuration] || parsedConditions.stayDuration}`);
    }

    if (Array.isArray(parsedConditions.moods) && parsedConditions.moods.length > 0) {
      parts.push(`분위기 ${parsedConditions.moods.join(', ')}`);
    }

    return parts.length > 0 ? parts.join(' · ') : '질문 내용을 기준으로 조건을 자동 해석했습니다.';
  }

  function getPublicDataSummary(house = {}) {
    const statusSummary = house.status ? `현장 상태 ${house.status}` : '현장 상태 정보 없음';
    const gradeText = typeof getConditionGradeText === 'function'
      ? getConditionGradeText(house.conditionGrade)
      : (house.conditionGrade || '등급 정보 없음');
    return `${statusSummary}, ${gradeText} 반영`;
  }

  function getHouseEmoji(operationType) {
    return {
      lodging: '🏡',
      longterm: '🛏️',
      experience: '🌿',
      review_needed: '📋',
    }[operationType] || '🏠';
  }

  function createTimestampLabel() {
    return new Date().toLocaleTimeString('ko-KR', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  }

  function createAiChat(options = {}) {
    const {
      rootElement,
      rootPath = '',
      recommendationTarget = '_self',
      openLinksInNewTab = false,
      welcomeMessage = '안녕하세요. 영주시 공공형 빈집 AI 추천 도우미입니다. 원하는 지역, 인원, 일정, 분위기를 말씀해 주세요.',
      initialPrompt = '예: "풍기읍, 4명, 2박, 조용한 자연 분위기"',
      onUnauthenticatedReset = null,
    } = options;

    if (!rootElement) {
      throw new Error('AI chat root element is required.');
    }

    const messagesEl = rootElement.querySelector('[data-ai-chat-messages]');
    const inputEl = rootElement.querySelector('[data-ai-chat-input]');
    const sendBtn = rootElement.querySelector('[data-ai-chat-send]');
    const statusEl = rootElement.querySelector('[data-ai-chat-status]');

    if (!messagesEl || !inputEl || !sendBtn) {
      throw new Error('AI chat root element is missing required children.');
    }

    const mascotSrc = `${rootPath}assets/images/yeongju_mas.jpg`;
    const detailBasePath = `${rootPath}guest/guest-detail.html`;

    let displayHistory = [];
    let apiHistory = [];
    let destroyed = false;
    let loadingMessageEl = null;

    function getUser() {
      return getCurrentPlatformUser();
    }

    function isPersistentUser() {
      return isStoredUser(getUser());
    }

    function getStorageKey() {
      return buildStorageKey(getUser());
    }

    function clearLegacyAnonymousStorage() {
      try {
        localStorage.removeItem(AI_CHAT_LEGACY_ANON_KEY);
      } catch (error) {
        // ignore
      }
    }

    function setStatus(text = '') {
      if (!statusEl) return;
      statusEl.textContent = text;
    }

    function isNearBottom() {
      const threshold = 88;
      return messagesEl.scrollHeight - messagesEl.scrollTop - messagesEl.clientHeight <= threshold;
    }

    function scrollToBottom(force = false) {
      if (force || isNearBottom()) {
        requestAnimationFrame(() => {
          messagesEl.scrollTop = messagesEl.scrollHeight;
        });
      }
    }

    function autoResizeInput() {
      if (!inputEl || inputEl.tagName !== 'TEXTAREA') return;
      inputEl.style.height = 'auto';
      const maxHeight = 140;
      inputEl.style.height = `${Math.min(inputEl.scrollHeight, maxHeight)}px`;
    }

    function clearMessages() {
      messagesEl.innerHTML = '';
    }

    function syncApiHistory() {
      apiHistory = displayHistory
        .filter((entry) => entry && (entry.kind === 'user' || entry.kind === 'bot'))
        .map((entry) => ({
          role: entry.kind === 'user' ? 'user' : 'assistant',
          content: entry.message || '',
        }));
    }

    function persistHistory() {
      clearLegacyAnonymousStorage();

      if (!isPersistentUser()) {
        return;
      }

      try {
        localStorage.setItem(getStorageKey(), JSON.stringify(displayHistory.slice(-AI_CHAT_HISTORY_LIMIT)));
      } catch (error) {
        console.warn('AI 대화 기록 저장에 실패했습니다.', error);
      }
    }

    function createMessageShell(kind) {
      const wrapper = document.createElement('article');
      wrapper.className = `ai-chat-message ai-chat-message--${kind}`;

      const header = document.createElement('div');
      header.className = 'ai-chat-message__meta';

      const label = document.createElement('strong');
      label.className = 'ai-chat-message__author';
      label.textContent = kind === 'user' ? '사용자' : 'AI 추천 도우미';

      const time = document.createElement('span');
      time.className = 'ai-chat-message__time';
      time.textContent = createTimestampLabel();

      header.append(label, time);

      const body = document.createElement('div');
      body.className = 'ai-chat-message__bubble';

      wrapper.append(header, body);
      return { wrapper, body };
    }

    function appendWelcomeMessage() {
      const shell = createMessageShell('bot');
      shell.body.innerHTML = `
        <p class="ai-chat-message__text">${formatMultilineText(welcomeMessage)}</p>
        <p class="ai-chat-message__hint">${escapeHtml(initialPrompt)}</p>
      `;
      messagesEl.appendChild(shell.wrapper);
      scrollToBottom(true);
    }

    function renderRecommendationCard(item, idx) {
      const house = item.house || {};
      const reasons = Array.isArray(item.reasons) ? item.reasons.filter(Boolean) : [];
      const detailUrl = `${detailBasePath}?id=${encodeURIComponent(house.id || '')}`;
      const capacityText = house.maxCapacity ? `최대 ${house.maxCapacity}명` : '인원 정보 없음';
      const locationText = `영주시 ${escapeHtml(house.districtName || '-')}`;
      const priceText = house.priceRange || '가격 문의';
      const priceLabel = typeof priceText === 'string' && priceText.trim() ? priceText.trim() : '가격 문의';

      return `
        <article class="ai-recommendation-card">
          <div class="ai-recommendation-card__top">
            <div class="ai-recommendation-card__rank">${idx + 1}</div>
            <div class="ai-recommendation-card__emoji" aria-hidden="true">${getHouseEmoji(house.operationType)}</div>
            <div class="ai-recommendation-card__main">
              <div class="ai-recommendation-card__title-row">
                <strong class="ai-recommendation-card__title">${escapeHtml(house.name || `추천 빈집 ${idx + 1}`)}</strong>
                <span class="ai-recommendation-card__price">${escapeHtml(priceLabel)}</span>
              </div>
              <p class="ai-recommendation-card__sub">${locationText} · ${escapeHtml(capacityText)}</p>
            </div>
          </div>
          <div class="ai-recommendation-card__badges">
            ${typeof getConditionGradeBadge === 'function' ? getConditionGradeBadge(house.conditionGrade) : ''}
            ${typeof getOperationTypeBadge === 'function' ? getOperationTypeBadge(house.operationType) : ''}
          </div>
          <div class="ai-recommendation-card__summary">
            <p><strong>추천 이유</strong> ${escapeHtml(reasons.join(', ') || '질문 조건과 잘 맞는 영주시 공개 빈집입니다.')}</p>
            <p><strong>공공데이터 반영</strong> ${escapeHtml(getPublicDataSummary(house))}</p>
            <p><strong>참고</strong> ${escapeHtml(typeof getGradeCautionText === 'function' ? getGradeCautionText(house.conditionGrade) : '상세 페이지에서 이용 조건을 함께 확인해 주세요.')}</p>
          </div>
          <div class="ai-recommendation-card__actions">
            <a
              href="${detailUrl}"
              class="ai-recommendation-card__link"
              ${openLinksInNewTab ? 'target="_blank" rel="noopener noreferrer"' : `target="${recommendationTarget}"`}
              data-ai-recommendation-link
            >
              상세보기
            </a>
          </div>
        </article>
      `;
    }

    function appendUserMessage(text, { persist = true } = {}) {
      const shell = createMessageShell('user');
      shell.body.innerHTML = `<p class="ai-chat-message__text">${formatMultilineText(text)}</p>`;
      messagesEl.appendChild(shell.wrapper);

      if (persist) {
        displayHistory.push({ kind: 'user', message: text });
        syncApiHistory();
        persistHistory();
      }

      scrollToBottom(true);
    }

    function appendBotMessage(entry, { persist = true, forceScroll = false } = {}) {
      const shell = createMessageShell('bot');
      const recommendations = Array.isArray(entry.recommendations) ? entry.recommendations : [];
      const parsedSummary = buildParsedSummary(entry.parsedConditions || {});
      const hasRecommendations = recommendations.length > 0;
      const introMessage = hasRecommendations
        ? `질문 조건과 맞는 영주시 승인 빈집 ${recommendations.length}곳을 찾았습니다. 아래 추천 카드에서 상세 정보를 확인해 주세요.`
        : (entry.message || '요청 내용을 기준으로 답변을 준비했습니다.');

      shell.body.innerHTML = `
        <p class="ai-chat-message__text">${formatMultilineText(introMessage)}</p>
        ${hasRecommendations ? `
          <div class="ai-chat-response-block">
            <strong class="ai-chat-response-block__title">추천 조건 해석</strong>
            <p class="ai-chat-response-block__text">${escapeHtml(parsedSummary)}</p>
            ${entry.knowledgeApplied ? '<p class="ai-chat-response-block__meta">영주시 공공데이터와 지역 특성을 함께 반영했습니다.</p>' : ''}
          </div>
          <div class="ai-chat-recommendations">
            ${recommendations.map((item, idx) => renderRecommendationCard(item, idx)).join('')}
          </div>
        ` : ''}
      `;

      if (!hasRecommendations && entry.message) {
        shell.body.innerHTML = `<p class="ai-chat-message__text">${formatMultilineText(entry.message)}</p>`;
      }

      messagesEl.appendChild(shell.wrapper);

      if (persist) {
        displayHistory.push({
          kind: 'bot',
          message: entry.message || introMessage,
          recommendations,
          parsedConditions: entry.parsedConditions || null,
          knowledgeApplied: Boolean(entry.knowledgeApplied),
        });
        syncApiHistory();
        persistHistory();
      }

      scrollToBottom(forceScroll);
    }

    function appendErrorMessage(message) {
      appendBotMessage({
        message,
        recommendations: [],
        parsedConditions: null,
        knowledgeApplied: false,
      }, { persist: true, forceScroll: true });
    }

    function appendTypingIndicator() {
      if (loadingMessageEl) return loadingMessageEl;

      const shell = createMessageShell('bot');
      shell.body.innerHTML = `
        <div class="ai-chat-typing">
          <span class="ai-chat-typing__dot"></span>
          <span class="ai-chat-typing__dot"></span>
          <span class="ai-chat-typing__dot"></span>
          <span class="ai-chat-typing__label">답변 생성 중...</span>
        </div>
      `;
      messagesEl.appendChild(shell.wrapper);
      loadingMessageEl = shell.wrapper;
      scrollToBottom(true);
      return loadingMessageEl;
    }

    function removeTypingIndicator() {
      if (loadingMessageEl) {
        loadingMessageEl.remove();
        loadingMessageEl = null;
      }
    }

    function resetConversation() {
      displayHistory = [];
      apiHistory = [];
      removeTypingIndicator();
      clearMessages();
      setStatus('');
      appendWelcomeMessage();
      if (!isPersistentUser()) {
        if (typeof onUnauthenticatedReset === 'function') {
          onUnauthenticatedReset();
        }
      }
    }

    function restoreConversation() {
      clearLegacyAnonymousStorage();
      displayHistory = [];
      apiHistory = [];
      removeTypingIndicator();
      clearMessages();
      setStatus('');

      if (!isPersistentUser()) {
        appendWelcomeMessage();
        return;
      }

      try {
        const rawSaved = localStorage.getItem(getStorageKey()) || '[]';
        const saved = JSON.parse(rawSaved);

        if (!Array.isArray(saved) || saved.length === 0) {
          appendWelcomeMessage();
          return;
        }

        displayHistory = saved.filter((entry) => entry && typeof entry === 'object').slice(-AI_CHAT_HISTORY_LIMIT);
        syncApiHistory();

        displayHistory.forEach((entry) => {
          if (entry.kind === 'user') {
            appendUserMessage(entry.message || '', { persist: false });
            return;
          }

          appendBotMessage(entry, { persist: false, forceScroll: false });
        });

        scrollToBottom(true);
      } catch (error) {
        try {
          localStorage.removeItem(getStorageKey());
        } catch (removeError) {
          // ignore
        }
        appendWelcomeMessage();
      }
    }

    async function sendCurrentMessage() {
      if (destroyed) return;

      const text = inputEl.value.trim();
      if (!text) return;

      const shouldForceScroll = isNearBottom();
      appendUserMessage(text);
      inputEl.value = '';
      autoResizeInput();
      setStatus('');
      appendTypingIndicator();

      try {
        const response = await fetch(`${getApiBase()}/ai/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: text,
            history: apiHistory.slice(-AI_API_HISTORY_LIMIT),
          }),
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();
        removeTypingIndicator();
        appendBotMessage({
          message: data.message || '',
          recommendations: Array.isArray(data.recommendations) ? data.recommendations : [],
          parsedConditions: data.parsedConditions || null,
          knowledgeApplied: Boolean(data.knowledgeApplied),
        }, { persist: true, forceScroll: shouldForceScroll });
      } catch (error) {
        removeTypingIndicator();
        appendErrorMessage('죄송합니다. 지금은 AI 추천 답변을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.');
      }
    }

    function handleInputKeydown(event) {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        sendCurrentMessage();
      }
    }

    function handleInputChange() {
      autoResizeInput();
    }

    function handleRecommendationLinkClick(event) {
      const link = event.target.closest('[data-ai-recommendation-link]');
      if (!link) return;
      event.stopPropagation();
    }

    function handleAuthChanged() {
      restoreConversation();
    }

    function mount() {
      clearLegacyAnonymousStorage();
      restoreConversation();
      autoResizeInput();

      sendBtn.addEventListener('click', sendCurrentMessage);
      inputEl.addEventListener('keydown', handleInputKeydown);
      inputEl.addEventListener('input', handleInputChange);
      messagesEl.addEventListener('click', handleRecommendationLinkClick);
      window.addEventListener('yeongju:auth-changed', handleAuthChanged);
    }

    function destroy() {
      if (destroyed) return;
      destroyed = true;
      removeTypingIndicator();
      sendBtn.removeEventListener('click', sendCurrentMessage);
      inputEl.removeEventListener('keydown', handleInputKeydown);
      inputEl.removeEventListener('input', handleInputChange);
      messagesEl.removeEventListener('click', handleRecommendationLinkClick);
      window.removeEventListener('yeongju:auth-changed', handleAuthChanged);
    }

    mount();

    return {
      destroy,
      resetConversation,
      restoreConversation,
      isPersistentUser,
      focusInput() {
        inputEl.focus();
      },
    };
  }

  window.YeongjuAiChatCore = {
    create: createAiChat,
  };
})();
