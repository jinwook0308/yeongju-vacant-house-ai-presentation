/**
 * guest-ai.js
 * ?곸＜??怨듦났??鍮덉쭛 ?쒖슜 ?뚮옯??- AI 異붿쿇 ?섏씠吏 ?ㅽ겕由쏀듃
 * GPT API + 諛깆뿏??異붿쿇 API ?곕룞 踰꾩쟾
 */

const API_BASE_URL = typeof getApiBaseUrl === 'function' ? getApiBaseUrl() : 'http://localhost:8000';
const AI_CHAT_STORAGE_KEY = 'yeongjuAiChatHistory';
let aiChatHistory = [];
let aiChatDisplayHistory = [];

async function handleChatSend() {
  const input = document.getElementById('aiChatInput');
  const messages = document.getElementById('aiChatMessages');
  const text = input.value.trim();

  if (!text) return;

  appendChatMessage(messages, 'user', escapeHtml(text));
  aiChatDisplayHistory.push({ kind: 'user', message: text });
  syncAiApiHistory();
  saveAiChatHistory();
  input.value = '';

  const loadingEl = appendLoadingMessage(messages);

  try {
    const response = await fetch(`${API_BASE_URL}/ai/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: text,
        history: aiChatHistory.slice(-8)
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    loadingEl.remove();

    appendBotResponse(
      messages,
      data.message,
      Array.isArray(data.recommendations) ? data.recommendations : [],
      data.parsedConditions,
      data.knowledgeApplied
    );
    aiChatDisplayHistory.push({
      kind: 'bot',
      message: data.message,
      recommendations: Array.isArray(data.recommendations) ? data.recommendations : [],
      parsedConditions: data.parsedConditions || null,
      knowledgeApplied: Boolean(data.knowledgeApplied),
    });
    syncAiApiHistory();
    saveAiChatHistory();
  } catch (error) {
    console.error('AI 채팅 요청 실패:', error);
    loadingEl.remove();
    aiChatDisplayHistory.push({
      kind: 'bot',
      message: '죄송합니다. 현재 AI 채팅 서버와 연결되지 않았습니다. 백엔드가 실행 중인지 확인해주세요.',
      recommendations: [],
      parsedConditions: null,
      knowledgeApplied: false,
    });
    syncAiApiHistory();
    saveAiChatHistory();
    appendChatMessage(
      messages,
      'bot',
      '죄송합니다. 현재 AI 채팅 서버와 연결되지 않았습니다.<br>백엔드가 실행 중인지 확인해주세요.'
    );
  }
}

// HTML onclick?먯꽌???곌퀬 ?띠쑝硫???以?異붽?
window.handleChatSend = handleChatSend;

document.addEventListener('DOMContentLoaded', function () {
  try {
    if (typeof renderHeader === 'function') renderHeader('ai');
    if (typeof renderFooter === 'function') renderFooter();
  } catch (e) {
    console.error('?ㅻ뜑/?명꽣 ?뚮뜑留??ㅻ쪟:', e);
  }

  const sendBtn = document.getElementById('aiChatSendBtn');
  const input = document.getElementById('aiChatInput');

  if (sendBtn) {
    sendBtn.addEventListener('click', handleChatSend);
  }

  if (input) {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleChatSend();
      }
    });
  }

  restoreAiChatHistory();
});

/**
 * 遺꾩쐞湲??좏깮 踰꾪듉???ㅼ젙?⑸땲??
 */
function setupMoodButtons() {
  document.querySelectorAll('.ai-mood-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const mood = btn.dataset.mood;
      if (btn.classList.contains('is-selected')) {
        btn.classList.remove('is-selected');
        selectedMoods = selectedMoods.filter(m => m !== mood);
      } else {
        btn.classList.add('is-selected');
        selectedMoods.push(mood);
      }
    });
  });
}

/**
 * AI 異붿쿇 濡쒖쭅???ㅽ뻾?⑸땲??
 * ?ㅼ젣 ?쒕퉬?ㅼ뿉?쒕뒗 Python 諛깆뿏??API瑜??몄텧?⑸땲??
 */
function runAiRecommendation() {
  const district = document.getElementById('aiDistrict').value;
  const capacity = parseInt(document.getElementById('aiCapacity').value);
  const stayDuration = document.getElementById('aiStayDuration').value;
  const budget = document.getElementById('aiBudget').value;

  // 濡쒕뵫 ?쒖떆
  document.getElementById('aiResultIntro').style.display = 'none';
  document.getElementById('aiResultContent').style.display = 'none';
  document.getElementById('aiResultLoading').style.display = 'flex';

  // 異붿쿇 泥섎━ (?곕え: 1.5珥?吏????寃곌낵)
  setTimeout(() => {
    const recommendations = computeAiRecommendations({ district, capacity, stayDuration, budget, moods: selectedMoods });
    displayAiRecommendations(recommendations, { district, capacity, stayDuration, budget });
  }, 1500);
}

/**
 * 議곌굔???곕씪 異붿쿇 鍮덉쭛??怨꾩궛?⑸땲??
 * @param {Object} conditions - 異붿쿇 議곌굔
 * @returns {Array} 異붿쿇 鍮덉쭛 紐⑸줉 (?먯닔 ?ы븿)
 */
function computeAiRecommendations(conditions) {
  const approvedHouses = VACANT_HOUSE_LIST.filter((house) => house.isApproved);

  const scored = approvedHouses.map((house) => {
    let score = 0;
    const reasons = [];

    if (conditions.district && house.districtId === conditions.district) {
      score += 30;
      reasons.push('영주시 희망 지역과 일치');
    } else if (!conditions.district) {
      score += 10;
    }

    if (house.maxCapacity >= conditions.capacity) {
      score += 20;
      reasons.push(`${conditions.capacity}명 이상 수용 가능`);
    }

    if (conditions.stayDuration === 'long' && house.operationType === 'longterm') {
      score += 25;
      reasons.push('장기 체류 활용에 적합');
    } else if (conditions.stayDuration === 'short' && house.operationType === 'lodging') {
      score += 20;
      reasons.push('단기 숙박 활용에 적합');
    } else if (conditions.stayDuration === 'medium') {
      score += 10;
    }

    if (conditions.moods.includes('nature') && house.tags.some((tag) => ['자연', '계곡', '숲'].includes(tag))) {
      score += 15;
      reasons.push('자연 친화적인 입지');
    }
    if (conditions.moods.includes('family') && house.tags.some((tag) => ['가족', '키즈', '체험'].includes(tag))) {
      score += 15;
      reasons.push('가족 단위 이용에 적합');
    }
    if (conditions.moods.includes('experience') && house.operationType === 'experience') {
      score += 20;
      reasons.push('체험형 공간 운영에 적합');
    }
    if (conditions.moods.includes('farming') && house.tags.some((tag) => ['농촌', '과수', '사과'].includes(tag))) {
      score += 20;
      reasons.push('영주 농촌 체험과 연결 가능');
    }
    if (conditions.moods.includes('hiking') && house.tags.some((tag) => ['등산', '트레킹', '산'].includes(tag))) {
      score += 20;
      reasons.push('등산·트레킹 수요와 잘 맞음');
    }

    if (house.conditionGrade === 'A') {
      score += 10;
      reasons.push('상태 등급 A로 즉시 활용 가능');
    }

    return { house, score, reasons };
  });

  return scored
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4);
}

function syncAiApiHistory() {
  aiChatHistory = aiChatDisplayHistory
    .filter((entry) => entry && (entry.kind === 'user' || entry.kind === 'bot'))
    .map((entry) => ({
      role: entry.kind === 'user' ? 'user' : 'assistant',
      content: entry.message || '',
    }));
}

function saveAiChatHistory() {
  try {
    localStorage.setItem(AI_CHAT_STORAGE_KEY, JSON.stringify(aiChatDisplayHistory.slice(-20)));
  } catch (error) {
    console.warn('AI ???湲곕줉 ??μ뿉 ?ㅽ뙣?덉뒿?덈떎.', error);
  }
}

function restoreAiChatHistory() {
  const messages = document.getElementById('aiChatMessages');
  if (!messages) return;

  try {
    const saved = JSON.parse(localStorage.getItem(AI_CHAT_STORAGE_KEY) || '[]');
    if (!Array.isArray(saved) || saved.length === 0) return;

    aiChatDisplayHistory = saved.filter((entry) => entry && typeof entry === 'object');
    syncAiApiHistory();

    aiChatDisplayHistory.forEach((entry) => {
      if (entry.kind === 'user') {
        appendChatMessage(messages, 'user', escapeHtml(entry.message || ''));
        return;
      }

      appendBotResponse(
        messages,
        entry.message || '',
        Array.isArray(entry.recommendations) ? entry.recommendations : [],
        entry.parsedConditions || null,
        Boolean(entry.knowledgeApplied),
        { scroll: false }
      );
    });
  } catch (error) {
    aiChatDisplayHistory = [];
    aiChatHistory = [];
    localStorage.removeItem(AI_CHAT_STORAGE_KEY);
  }
}

function appendBotResponse(container, message, recommendations = [], parsedConditions = null, knowledgeApplied = false, options = {}) {
  const wrapper = document.createElement('div');
  wrapper.className = 'ai-chat-msg ai-chat-msg--bot ai-chat-msg--bot-response';

  const parsedSummary = buildParsedSummary(parsedConditions || {});
  const cardsHtml = renderRecommendationCards(recommendations);
  const summaryHtml = recommendations.length
    ? `
      <div class="ai-response-summary">
        <strong class="ai-response-summary__title">추천 조건 해석</strong>
        <p class="ai-response-summary__text">${escapeHtml(parsedSummary)}</p>
        ${knowledgeApplied ? '<p class="ai-response-summary__meta">영주시 지역 특성을 반영해 추천했습니다.</p>' : ''}
      </div>
    `
    : '';
  const resultHtml = cardsHtml
    ? `
      <div class="ai-response-results">
        <div class="ai-response-results__title">추천 빈집 연결</div>
        <div class="ai-result-stack">${cardsHtml}</div>
      </div>
    `
    : '';

  wrapper.innerHTML = `
    <div class="ai-chat-msg__avatar"><img src="../assets/images/yeongju_mas.jpg" alt="영주 AI 마스코트"></div>
    <div class="ai-chat-msg__content ai-chat-msg__content--wide">
      <div class="ai-chat-msg__name">AI 추천 도우미</div>
      <div class="ai-chat-msg__bubble ai-chat-msg__bubble--response">
        <div class="ai-response-copy">${formatBotText(message)}</div>
        ${summaryHtml}
        ${resultHtml}
      </div>
    </div>
  `;

  container.appendChild(wrapper);
  if (options.scroll !== false) {
    requestAnimationFrame(() => {
      wrapper.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }
  return wrapper;
}

function renderRecommendationCards(recommendations = []) {
  return recommendations.map((item, idx) => {
    const house = item.house;
    return `
      <a href="guest-detail.html?id=${house.id}" class="ai-result-card">
        <div class="ai-result-card__rank">${idx + 1}</div>
        <div class="ai-result-card__emoji">${getHouseEmoji(house.operationType)}</div>
        <div class="ai-result-card__info">
          <div class="ai-result-card__name">${escapeHtml(house.name)}</div>
          <div class="ai-result-card__location">영주시 ${escapeHtml(house.districtName)} ? 최대 ${house.maxCapacity}명</div>
          <div class="ai-result-card__badge-row">
            ${getConditionGradeBadge(house.conditionGrade)}
            ${getOperationTypeBadge(house.operationType)}
          </div>
          <div class="ai-result-card__match">추천 이유: ${item.reasons.map(escapeHtml).join(' ? ')}</div>
          <div class="ai-result-card__meta">
            <div><strong>공공데이터 반영</strong> : ${escapeHtml(getPublicDataSummary(house))}</div>
            <div><strong>참고</strong> : ${escapeHtml(getGradeCautionText(house.conditionGrade))}</div>
          </div>
        </div>
        <div class="ai-result-card__price">${escapeHtml(house.priceRange)}</div>
      </a>
    `;
  }).join('');
}

function appendLoadingMessage(container) {
  const msg = document.createElement('div');
  msg.className = 'ai-chat-msg ai-chat-msg--bot';
  msg.innerHTML = `
    <div class="ai-chat-msg__avatar"><img src="../assets/images/yeongju_mas.jpg" alt="영주 AI 마스코트"></div>
    <div class="ai-chat-msg__content">
      <div class="ai-chat-msg__name">AI 추천 도우미</div>
      <div class="ai-chat-msg__bubble">
        추천 조건을 분석하고 있습니다.
        <span class="ai-chat-loading" aria-hidden="true"><span></span><span></span><span></span></span>
      </div>
    </div>
  `;
  container.appendChild(msg);
  container.scrollTop = container.scrollHeight;
  return msg;
}

function appendChatMessage(container, role, html) {
  const msg = document.createElement('div');
  msg.className = `ai-chat-msg ai-chat-msg--${role}`;

  if (role === 'user') {
    msg.innerHTML = `
      <div class="ai-chat-msg__content">
        <div class="ai-chat-msg__name">사용자</div>
        <div class="ai-chat-msg__bubble">${html}</div>
      </div>
    `;
  } else {
    msg.innerHTML = `
      <div class="ai-chat-msg__avatar"><img src="../assets/images/yeongju_mas.jpg" alt="영주 AI 마스코트"></div>
      <div class="ai-chat-msg__content">
        <div class="ai-chat-msg__name">AI 추천 도우미</div>
        <div class="ai-chat-msg__bubble">${html}</div>
      </div>
    `;
  }
  container.appendChild(msg);
  container.scrollTop = container.scrollHeight;
}

function buildParsedSummary(parsedConditions = {}) {
  const parts = [];
  if (parsedConditions.districtName) parts.push(`지역: ${parsedConditions.districtName}`);
  if (parsedConditions.capacity) parts.push(`인원: ${parsedConditions.capacity}명`);
  if (parsedConditions.stayDuration) {
    const stayDurationMap = { short: '단기', medium: '중기', long: '장기' };
    parts.push(`체류: ${stayDurationMap[parsedConditions.stayDuration] || parsedConditions.stayDuration}`);
  }
  if (Array.isArray(parsedConditions.moods) && parsedConditions.moods.length > 0) {
    parts.push(`분위기: ${parsedConditions.moods.join(', ')}`);
  }
  return parts.length > 0 ? parts.join(' ? ') : '질문 내용을 기준으로 조건을 자동 해석했습니다.';
}

function getPublicDataSummary(house) {
  const statusSummary = house.status ? `현장 상태 ${house.status}` : '현장 상태 정보 없음';
  return `${statusSummary}, ${getConditionGradeText(house.conditionGrade)} 반영`;
}

function getHouseEmoji(operationType) {
  return {
    lodging: '🏡',
    longterm: '🛏️',
    experience: '🌿',
    review_needed: '📋',
  }[operationType] || '🏠';
}

function formatBotText(text) {
  return escapeHtml(text).replace(/\n/g, '<br>');
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
