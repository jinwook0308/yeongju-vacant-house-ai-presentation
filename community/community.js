document.addEventListener("DOMContentLoaded", () => {
  if (typeof renderHeader === "function") {
    renderHeader("community");
  }

  const heroBottomTabs = document.querySelector(".community-hero__bottom-tabs");
  if (heroBottomTabs) {
    heroBottomTabs.remove();
  }

  const user = typeof getCurrentUser === "function" ? getCurrentUser() : null;
  const isAdmin = user?.role === "admin";

  const noticeBoard = document.getElementById("noticeBoard");
  const qnaBoard = document.getElementById("qnaBoard");
  const boardTitle = document.getElementById("boardTitle");
  const boardDescription = document.getElementById("boardDescription");
  if (boardDescription && !document.querySelector(".community-board-switch")) {
    const boardSwitch = document.createElement("div");
    boardSwitch.className = "community-board-switch";
    boardSwitch.innerHTML = `
      <button class="community-switch-tab is-active" data-board="notice" type="button">공지사항</button>
      <button class="community-switch-tab" data-board="qna" type="button">Q&A</button>
    `;
    boardDescription.insertAdjacentElement("afterend", boardSwitch);
  }
  const boardTabs = document.querySelectorAll(".community-switch-tab");
  const summaryBoardName = document.getElementById("summaryBoardName");
  const summaryTotalCount = document.getElementById("summaryTotalCount");
  const summaryFilteredCount = document.getElementById("summaryFilteredCount");
  const noticeTableBody = document.getElementById("noticeTableBody");
  const qnaList = document.getElementById("qnaList");
  const searchInput = document.getElementById("communitySearchInput");
  const searchBtn = document.getElementById("communitySearchBtn");
  const noticeWriteToggle = document.getElementById("noticeWriteToggle");
  const qnaWriteToggle = document.getElementById("qnaWriteToggle");
  const noticeWritePanel = document.getElementById("noticeWritePanel");
  const qnaWritePanel = document.getElementById("qnaWritePanel");
  const qnaCancelBtn = document.getElementById("qnaCancelBtn");
  const communityAiModal = document.getElementById("communityAiModal");
  const communityAiModalClose = document.getElementById("communityAiModalClose");
  const communityAiModalCancel = document.getElementById("communityAiModalCancel");
  const communityAiModalConfirm = document.getElementById("communityAiModalConfirm");

  let currentBoard = "notice";
  let currentKeyword = "";

  function getActiveUser() {
    return typeof getCurrentUser === "function" ? getCurrentUser() : null;
  }

  function redirectToLogin(message = "로그인 후 이용 가능합니다.") {
    showToast(message, "warning");
    window.setTimeout(() => {
      window.location.href = `${getRootPath()}auth/login.html`;
    }, 900);
  }

  function ensureLoggedIn(message) {
    if (typeof isLoggedIn === "function" && isLoggedIn()) {
      return true;
    }
    redirectToLogin(message);
    return false;
  }

  function openCommunityAiModal() {
    communityAiModal?.classList.add("is-open");
    document.body.classList.add("modal-open");
  }

  function closeCommunityAiModal() {
    communityAiModal?.classList.remove("is-open");
    document.body.classList.remove("modal-open");
  }

  function bindCommunityAiModalTriggers() {
    const aiLinks = document.querySelectorAll('[data-nav-key="ai"]');
    aiLinks.forEach((link) => {
      link.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        openCommunityAiModal();
      });
    });
  }

  function getSeedNotices() {
    const rawCommunityData =
      typeof communityData !== "undefined" && Array.isArray(communityData)
        ? communityData
        : Array.isArray(window.communityData)
          ? window.communityData
          : [];

    return rawCommunityData
      .filter((item) => {
        const category = String(item.category || "");
        return category === "공지사항" || category === "" || category === "전체";
      })
      .map((item, index) => ({
        id: `seed-notice-${item.id ?? index + 1}`,
        title: item.title ?? "제목 없음",
        content: item.content ?? item.preview ?? "",
        date: item.date ?? "-",
        author: "공공기관",
        isPinned: Boolean(item.isPinned),
      }));
  }

  function getSeedQnas() {
    const rawFaqData =
      typeof faqData !== "undefined" && Array.isArray(faqData)
        ? faqData
        : Array.isArray(window.faqData)
          ? window.faqData
          : [];

    return rawFaqData.map((item, index) => ({
      id: `seed-qna-${index + 1}`,
      question: item.q ?? `질문 ${index + 1}`,
      detail: "",
      answer: item.a ?? "답변이 없습니다.",
      author: "플랫폼",
      isPrivate: false,
      createdAt: "-",
      answeredBy: "공공기관",
    }));
  }

  function getNoticeData() {
    const stored = typeof getStoredCommunityNotices === "function" ? getStoredCommunityNotices() : [];
    return [...stored, ...getSeedNotices()];
  }

  function getQnaData() {
    const stored = typeof getStoredCommunityQna === "function" ? getStoredCommunityQna() : [];
    return [...stored, ...getSeedQnas()];
  }

  function updateSummary(total, filtered) {
    summaryBoardName.textContent = currentBoard === "notice" ? "공지사항" : "Q&A";
    summaryTotalCount.textContent = String(total);
    summaryFilteredCount.textContent = String(filtered);
  }

  function toggleWritePanels(target) {
    noticeWritePanel.classList.toggle("is-open", target === "notice" && noticeWritePanel.classList.contains("is-open") === false);
    qnaWritePanel.classList.toggle("is-open", target === "qna" && qnaWritePanel.classList.contains("is-open") === false);
  }

  function resetQnaWriteForm() {
    document.getElementById("qnaQuestionInput").value = "";
    document.getElementById("qnaDetailInput").value = "";
    document.getElementById("qnaVisibilityInput").value = "public";
  }

  function renderNoticeList() {
    const notices = getNoticeData();
    const keyword = currentKeyword.trim().toLowerCase();
    const filtered = notices.filter((item) => {
      if (!keyword) return true;
      return (
        String(item.title).toLowerCase().includes(keyword) ||
        String(item.content).toLowerCase().includes(keyword)
      );
    });

    if (filtered.length === 0) {
      noticeTableBody.innerHTML = `<tr><td colspan="4">검색 결과가 없습니다.</td></tr>`;
      updateSummary(notices.length, 0);
      return;
    }

    noticeTableBody.innerHTML = filtered
      .map((item, index) => `
        <tr>
          <td>${filtered.length - index}</td>
          <td class="community-table__title-cell">
            <a class="community-table__title-link community-table__title-button" href="notice-detail.html?id=${encodeURIComponent(item.id)}">
              ${item.isPinned ? '<span class="community-badge community-badge--notice">중요</span>' : ""}
              <span>${item.title}</span>
            </a>
            <p class="community-table__preview">${item.content}</p>
          </td>
          <td>${item.date}</td>
          <td><span class="community-badge community-badge--notice">${item.author || "운영안내"}</span></td>
        </tr>
      `)
      .join("");

    updateSummary(notices.length, filtered.length);
  }

  function renderQnaList() {
    const qnas = getQnaData();
    const keyword = currentKeyword.trim().toLowerCase();
    const filtered = qnas.filter((item) => {
      if (!keyword) return true;
      return (
        String(item.question).toLowerCase().includes(keyword) ||
        String(item.detail).toLowerCase().includes(keyword) ||
        String(item.answer).toLowerCase().includes(keyword)
      );
    });

    if (filtered.length === 0) {
      qnaList.innerHTML = `
        <div class="community-qna-item">
          <div class="community-qna-question">
            <strong>검색 결과가 없습니다.</strong>
            <span>-</span>
          </div>
        </div>
      `;
      updateSummary(qnas.length, 0);
      return;
    }

    qnaList.innerHTML = filtered
      .map((item) => {
        const hidden = item.isPrivate && !isAdmin && item.author !== user?.name;
        const answer = item.answer || "";
        return `
          <div class="community-qna-item" data-qna-id="${item.id}">
            <button class="community-qna-question" type="button">
              <strong>
                ${item.isPrivate ? '<span class="community-badge community-badge--private">비공개</span>' : '<span class="community-badge community-badge--qna">공개</span>'}
                ${hidden ? "비공개 문의입니다." : item.question}
              </strong>
              <span>+</span>
            </button>
            <div class="community-qna-answer">
              ${hidden ? "작성자와 공공기관 관리자만 확인할 수 있습니다." : `
                ${item.detail ? `<p class="community-qna-detail">${item.detail}</p>` : ""}
                <div class="community-answer-box ${answer ? "is-answered" : ""}">
                  <strong>${answer ? "공공기관 답변" : "답변 대기"}</strong>
                  <p>${answer || "공공기관 담당자가 확인 후 답변을 등록합니다."}</p>
                  ${item.answeredBy ? `<small>${item.answeredBy} · ${item.answeredAt || item.createdAt || ""}</small>` : ""}
                </div>
                ${isAdmin ? `
                  <div class="community-answer-form">
                    <textarea class="community-form-control community-form-textarea" rows="3" placeholder="공공기관 답변 입력">${answer}</textarea>
                    <button class="community-write-submit community-answer-submit" type="button">답변 등록</button>
                  </div>
                ` : ""}
              `}
            </div>
          </div>
        `;
      })
      .join("");

    document.querySelectorAll(".community-qna-question").forEach((button) => {
      button.addEventListener("click", () => {
        const item = button.closest(".community-qna-item");
        const isOpen = item.classList.contains("is-open");

        document.querySelectorAll(".community-qna-item").forEach((qnaItem) => {
          qnaItem.classList.remove("is-open");
          const sign = qnaItem.querySelector(".community-qna-question > span");
          if (sign) sign.textContent = "+";
        });

        if (!isOpen) {
          item.classList.add("is-open");
          const sign = item.querySelector(".community-qna-question > span");
          if (sign) sign.textContent = "−";
        }
      });
    });

    document.querySelectorAll(".community-answer-submit").forEach((button) => {
      button.addEventListener("click", () => {
        const item = button.closest(".community-qna-item");
        const qnaId = item?.dataset.qnaId;
        const textarea = item?.querySelector(".community-answer-form textarea");
        const answer = textarea?.value.trim();
        if (!answer) {
          showToast("답변 내용을 입력해주세요.", "warning");
          return;
        }
        if (typeof answerCommunityQna === "function") {
          answerCommunityQna(qnaId, answer, user?.name || "공공기관");
          showToast("답변이 등록되었습니다.", "success");
          renderQnaList();
        }
      });
    });

    updateSummary(qnas.length, filtered.length);
  }

  function switchBoard(board) {
    currentBoard = board;
    currentKeyword = searchInput.value || "";

    boardTabs.forEach((tab) => {
      tab.classList.toggle("is-active", tab.dataset.board === board);
    });

    if (board === "notice") {
      noticeBoard.classList.add("is-active");
      qnaBoard.classList.remove("is-active");
      qnaWritePanel.classList.remove("is-open");
      boardTitle.textContent = "공지사항";
      boardDescription.textContent = "플랫폼 운영 소식과 공공기관 안내사항을 확인할 수 있습니다.";
      renderNoticeList();
    } else {
      qnaBoard.classList.add("is-active");
      noticeBoard.classList.remove("is-active");
      noticeWritePanel.classList.remove("is-open");
      qnaWritePanel.classList.add("is-open");
      boardTitle.textContent = "Q&A";
      boardDescription.textContent = "공개·비공개 문의를 남기고 공공기관 답변을 확인할 수 있습니다.";
      renderQnaList();
    }
  }

  noticeWriteToggle.style.display = isAdmin ? "inline-flex" : "none";

  noticeWriteToggle.addEventListener("click", () => {
    if (!isAdmin) {
      showToast("공지사항은 공공기관 관리자만 작성할 수 있습니다.", "warning");
      return;
    }
    switchBoard("notice");
    toggleWritePanels("notice");
  });

  qnaWriteToggle?.addEventListener("click", () => {
    if (!ensureLoggedIn("Q&A 작성은 로그인 후 이용 가능합니다.")) return;
    switchBoard("qna");
    toggleWritePanels("qna");
  });

  qnaCancelBtn?.addEventListener("click", () => {
    resetQnaWriteForm();
    qnaWritePanel.classList.add("is-open");
  });

  document.getElementById("noticeSubmitBtn").addEventListener("click", () => {
    if (!isAdmin) {
      showToast("공지사항은 공공기관 관리자만 작성할 수 있습니다.", "warning");
      return;
    }
    const title = document.getElementById("noticeTitleInput").value.trim();
    const content = document.getElementById("noticeContentInput").value.trim();
    if (!title || !content) {
      showToast("공지 제목과 내용을 입력해주세요.", "warning");
      return;
    }
    saveCommunityNotice({
      title,
      content,
      author: user?.name || "공공기관",
      isPinned: document.getElementById("noticePinnedInput").checked,
    });
    document.getElementById("noticeTitleInput").value = "";
    document.getElementById("noticeContentInput").value = "";
    document.getElementById("noticePinnedInput").checked = false;
    noticeWritePanel.classList.remove("is-open");
    showToast("공지사항이 등록되었습니다.", "success");
    renderNoticeList();
  });

  document.getElementById("qnaSubmitBtn").addEventListener("click", () => {
    if (!ensureLoggedIn("Q&A 작성은 로그인 후 이용 가능합니다.")) return;

    const activeUser = getActiveUser();
    const question = document.getElementById("qnaQuestionInput").value.trim();
    const detail = document.getElementById("qnaDetailInput").value.trim();
    if (!question) {
      showToast("질문 제목을 입력해주세요.", "warning");
      return;
    }
    saveCommunityQna({
      question,
      detail,
      author: activeUser?.name || "사용자",
      isPrivate: document.getElementById("qnaVisibilityInput").value === "private",
    });
    resetQnaWriteForm();
    qnaWritePanel.classList.add("is-open");
    showToast("Q&A가 등록되었습니다.", "success");
    renderQnaList();
  });

  bindCommunityAiModalTriggers();

  communityAiModalClose?.addEventListener("click", closeCommunityAiModal);
  communityAiModalCancel?.addEventListener("click", closeCommunityAiModal);
  communityAiModal?.addEventListener("click", (event) => {
    if (event.target === communityAiModal) {
      closeCommunityAiModal();
    }
  });
  communityAiModalConfirm?.addEventListener("click", () => {
    closeCommunityAiModal();
    window.location.href = `${getRootPath()}guest/guest-ai.html`;
  });

  boardTabs.forEach((tab) => {
    tab.addEventListener("click", () => switchBoard(tab.dataset.board));
  });

  function handleSearch() {
    currentKeyword = searchInput.value || "";
    if (currentBoard === "notice") {
      renderNoticeList();
    } else {
      renderQnaList();
    }
  }

  searchBtn.addEventListener("click", handleSearch);
  searchInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") handleSearch();
  });

  window.addEventListener("yeongju:platform-data-changed", (event) => {
    if (String(event.detail?.type || "").startsWith("community")) {
      currentBoard === "notice" ? renderNoticeList() : renderQnaList();
    }
  });

  switchBoard("notice");
});
