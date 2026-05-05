document.addEventListener('DOMContentLoaded', () => {
  if (typeof renderHeader === 'function') {
    renderHeader('community');
  }

  if (typeof renderFooter === 'function') {
    renderFooter();
  }

  const titleEl = document.getElementById('noticeTitle');
  const dateEl = document.getElementById('noticeDate');
  const authorEl = document.getElementById('noticeAuthor');
  const viewsEl = document.getElementById('noticeViews');
  const contentEl = document.getElementById('noticeContent');
  const attachmentsEl = document.getElementById('noticeAttachments');
  const prevLinkEl = document.getElementById('noticePrevLink');
  const nextLinkEl = document.getElementById('noticeNextLink');

  const params = typeof getUrlParams === 'function' ? getUrlParams() : {};
  const noticeId = String(params.id || '').trim();

  const notices = getNoticeData();
  const noticeIndex = notices.findIndex((item) => String(item.id) === noticeId);
  const notice = noticeIndex >= 0 ? notices[noticeIndex] : null;

  if (!notice) {
    titleEl.textContent = '공지사항을 찾을 수 없습니다.';
    dateEl.textContent = '-';
    authorEl.textContent = '운영 안내';
    viewsEl.textContent = '0';
    attachmentsEl.innerHTML = '<div class="notice-article__file-empty">해당 공지사항이 존재하지 않거나 삭제되었습니다.</div>';
    contentEl.innerHTML = '<p>입력하신 경로를 다시 확인해 주세요.</p>';
    setPagerLink(prevLinkEl, null, true, '이전 글이 없습니다.');
    setPagerLink(nextLinkEl, null, true, '다음 글이 없습니다.');
    return;
  }

  const views = incrementNoticeViewCount(notice.id);
  const attachments = normalizeNoticeAttachments(notice);
  const prevNotice = noticeIndex < notices.length - 1 ? notices[noticeIndex + 1] : null;
  const nextNotice = noticeIndex > 0 ? notices[noticeIndex - 1] : null;

  document.title = `${notice.title || '공지사항'} | 공지사항 | 영주 빈집 플랫폼`;
  titleEl.textContent = notice.title || '공지사항';
  dateEl.textContent = notice.date || '-';
  authorEl.textContent = notice.author || '운영 안내';
  viewsEl.textContent = String(views);
  attachmentsEl.innerHTML = renderAttachmentsMarkup(attachments);
  contentEl.innerHTML = renderNoticeBody(notice.content || notice.preview || '');

  setPagerLink(prevLinkEl, prevNotice, !prevNotice, prevNotice ? `이전  ${prevNotice.title}` : '이전 글이 없습니다.');
  setPagerLink(nextLinkEl, nextNotice, !nextNotice, nextNotice ? `다음  ${nextNotice.title}` : '다음 글이 없습니다.');
});

function getNoticeData() {
  const stored = typeof getStoredCommunityNotices === 'function' ? getStoredCommunityNotices() : [];
  const seed = getSeedNotices();
  return [...stored, ...seed].sort((a, b) => new Date(b.date) - new Date(a.date));
}

function getSeedNotices() {
  const rawCommunityData =
    typeof communityData !== 'undefined' && Array.isArray(communityData)
      ? communityData
      : Array.isArray(window.communityData)
        ? window.communityData
        : [];

  return rawCommunityData
    .filter((item) => String(item.category || '').includes('공지'))
    .map((item) => ({
      id: `seed-notice-${item.id}`,
      title: item.title,
      content: item.content || item.preview || '',
      date: item.date,
      author: '운영 안내',
      isPinned: true,
      attachments: [],
    }));
}

function incrementNoticeViewCount(noticeId) {
  const storageKey = 'yeongjuNoticeViews';

  try {
    const raw = localStorage.getItem(storageKey);
    const parsed = raw ? JSON.parse(raw) : {};
    const currentCount = Number(parsed[noticeId] || 0) + 1;
    parsed[noticeId] = currentCount;
    localStorage.setItem(storageKey, JSON.stringify(parsed));
    return currentCount;
  } catch (error) {
    console.warn('공지 조회 수를 저장하지 못했습니다.', error);
    return 1;
  }
}

function normalizeNoticeAttachments(notice) {
  if (Array.isArray(notice.attachments) && notice.attachments.length) {
    return notice.attachments.map((item, index) => ({
      name: item.name || `첨부파일 ${index + 1}`,
      url: item.url || '#',
      extension: getAttachmentExtension(item.name || item.url || ''),
    }));
  }

  return [];
}

function renderAttachmentsMarkup(attachments) {
  if (!attachments.length) {
    return '<div class="notice-article__file-empty">등록된 첨부파일이 없습니다.</div>';
  }

  return attachments
    .map((file) => `
      <a class="notice-article__file-link" href="${escapeHtml(file.url)}" target="_blank" rel="noopener noreferrer">
        <span class="notice-article__file-badge">${escapeHtml(file.extension)}</span>
        <span>${escapeHtml(file.name)}</span>
      </a>
    `)
    .join('');
}

function renderNoticeBody(content) {
  const lines = String(content || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line, index, array) => !(line === '' && array[index - 1] === ''));

  if (!lines.length) {
    return '<p>등록된 상세 내용이 없습니다.</p>';
  }

  const blocks = [];
  let listBuffer = [];

  const flushList = () => {
    if (!listBuffer.length) return;
    blocks.push(`<ul>${listBuffer.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`);
    listBuffer = [];
  };

  lines.forEach((line) => {
    if (!line) {
      flushList();
      return;
    }

    if (line.startsWith('- ') || line.startsWith('• ') || line.startsWith('· ')) {
      listBuffer.push(line.slice(2).trim());
      return;
    }

    flushList();
    blocks.push(`<p>${escapeHtml(line)}</p>`);
  });

  flushList();
  return blocks.join('');
}

function setPagerLink(element, notice, disabled, label) {
  if (!element) return;

  element.textContent = label;

  if (disabled || !notice) {
    element.href = 'community.html';
    element.classList.add('is-disabled');
    return;
  }

  element.href = `notice-detail.html?id=${encodeURIComponent(notice.id)}`;
  element.classList.remove('is-disabled');
}

function getAttachmentExtension(value) {
  const match = String(value || '').match(/\.([a-z0-9]+)$/i);
  return match ? match[1].toUpperCase() : 'FILE';
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
