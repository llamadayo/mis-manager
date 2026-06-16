const STATUS_OPTIONS = ["待處理", "進行中", "已完成", "暫緩", "取消"];
const CLOSED_STATUSES = ["已完成", "暫緩", "取消"];
const PRIORITY_OPTIONS = ["低", "中", "高", "緊急"];
const PRIORITY_WEIGHT = { 低: 1, 中: 2, 高: 3, 緊急: 4 };

const app = document.querySelector("#app");

const state = {
  view: "overview",
  tasks: [],
  systems: [],
  engineers: [],
  history: [],
  selectedTaskId: null,
  selectedIds: new Set(),
  editingTaskId: null,
  editingSystemId: null,
  editingEngineerId: null,
  filters: {
    keyword: "",
    systemId: "",
    engineerId: "",
    status: "",
    due: "",
    sort: "dueAsc"
  },
  toast: null
};

const icons = {
  list: icon("M4 6h16M4 12h16M4 18h16"),
  plus: icon("M12 5v14M5 12h14"),
  systems: icon("M4 7h16M6 7v10a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7M9 11h6"),
  users: icon("M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2M9.5 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"),
  settings: icon("M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06A1.65 1.65 0 0 0 15 19.4a1.65 1.65 0 0 0-1 .6 1.65 1.65 0 0 0-.39 1.08V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-.6-1 1.65 1.65 0 0 0-1.08-.39H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-.6 1.65 1.65 0 0 0 .39-1.08V3a2 2 0 0 1 4 0v.09A1.65 1.65 0 0 0 15 4.6a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9c.14.35.35.67.6 1 .31.24.69.37 1.08.39H21a2 2 0 0 1 0 4h-.09A1.65 1.65 0 0 0 19.4 15Z"),
  edit: icon("M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z"),
  download: icon("M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"),
  upload: icon("M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12")
};

init();

async function init() {
  try {
    await loadAll();
    render();
  } catch (error) {
    app.innerHTML = `<main class="boot-screen"><p>${escapeHtml(error.message)}</p></main>`;
  }
}

async function loadAll() {
  const [tasksData, systemsData, engineersData] = await Promise.all([
    api("/api/tasks"),
    api("/api/systems"),
    api("/api/engineers")
  ]);

  state.tasks = tasksData.tasks;
  state.history = tasksData.history;
  state.systems = systemsData.systems;
  state.engineers = engineersData.engineers;

  if (!state.selectedTaskId && state.tasks.length > 0) {
    state.selectedTaskId = visibleTasks()[0]?.id ?? state.tasks[0].id;
  }
}

function render() {
  app.className = "app-shell";
  app.innerHTML = `
    <div class="layout">
      ${renderSidebar()}
      <main class="main">
        ${renderCurrentView()}
      </main>
    </div>
    ${state.toast ? `<div class="toast ${state.toast.type === "error" ? "error" : ""}">${escapeHtml(state.toast.message)}</div>` : ""}
  `;

  bindEvents();
}

function renderSidebar() {
  const items = [
    ["overview", "待辦總覽", icons.list],
    ["taskForm", "新增代辦", icons.plus],
    ["systems", "系統管理", icons.systems],
    ["engineers", "工程師管理", icons.users],
    ["settings", "設定", icons.settings]
  ];

  return `
    <aside class="sidebar">
      <div class="brand">
        <div class="brand-mark">MIS</div>
        <div>
          <p class="brand-title">MIS 代辦管理</p>
          <p class="brand-subtitle">Local task console</p>
        </div>
      </div>
      <nav class="nav" aria-label="主導覽">
        ${items
          .map(([view, label, navIcon]) => {
            const active = state.view === view || (state.view === "taskForm" && view === "taskForm");
            return `
              <button class="nav-button ${active ? "active" : ""}" type="button" data-nav="${view}">
                <span class="nav-icon" aria-hidden="true">${navIcon}</span>
                <span>${label}</span>
              </button>
            `;
          })
          .join("")}
      </nav>
      <div class="sidebar-foot">
        <strong>本機模式</strong><br>
        僅綁定 localhost，資料保存在本機 JSON。
      </div>
    </aside>
  `;
}

function renderCurrentView() {
  if (state.view === "taskForm") {
    return renderTaskForm();
  }

  if (state.view === "systems") {
    return renderSystemsView();
  }

  if (state.view === "engineers") {
    return renderEngineersView();
  }

  if (state.view === "settings") {
    return renderSettingsView();
  }

  return renderOverview();
}

function renderOverview() {
  const tasks = visibleTasks();
  const selectedTask = state.tasks.find((task) => task.id === state.selectedTaskId) ?? tasks[0] ?? null;

  if (selectedTask && state.selectedTaskId !== selectedTask.id) {
    state.selectedTaskId = selectedTask.id;
  }

  return `
    <section class="page">
      <header class="page-header">
        <div>
          <h1 class="page-title">待辦總覽</h1>
          <p class="page-description">依系統、工程師、狀態與期限追蹤待辦時效。</p>
        </div>
      </header>
      <div class="panel toolbar" role="search">
        <div class="field">
          <label for="keyword">搜尋</label>
          <input class="input" id="keyword" value="${escapeAttr(state.filters.keyword)}" placeholder="事項、系統、工程師">
        </div>
        ${renderSelectField("systemFilter", "系統", state.filters.systemId, [["", "全部系統"], ...state.systems.map((system) => [system.id, system.name])])}
        ${renderSelectField("statusFilter", "狀態", state.filters.status, [["", "全部狀態"], ["逾期", "逾期"], ...STATUS_OPTIONS.map((status) => [status, status])])}
        ${renderSelectField("engineerFilter", "工程師", state.filters.engineerId, [["", "全部工程師"], ...state.engineers.map((engineer) => [engineer.id, engineer.name])])}
        ${renderSelectField("dueFilter", "期限", state.filters.due, [["", "全部期限"], ["today", "今天到期"], ["week", "七天內"], ["overdue", "已逾期"]])}
        ${renderSelectField("sortFilter", "排序", state.filters.sort, [["dueAsc", "期限近到遠"], ["priorityDesc", "優先級高到低"], ["updatedDesc", "最近更新"]])}
      </div>
      ${renderBatchBar()}
      <div class="overview-grid">
        <section class="panel table-wrap" aria-label="待辦清單">
          ${tasks.length === 0 ? renderEmpty("目前沒有符合條件的待辦。") : renderTasksTable(tasks)}
        </section>
        <aside class="panel detail" aria-label="代辦詳情">
          ${renderTaskDetail(selectedTask)}
        </aside>
      </div>
    </section>
  `;
}

function renderBatchBar() {
  const selectedCount = state.selectedIds.size;

  return `
    <div class="batch-bar">
      <div class="batch-summary">${selectedCount > 0 ? `${selectedCount} 筆已選取` : "勾選待辦後可批次變更狀態"}</div>
      <div class="button-row">
        <select class="select" id="batchStatus" ${selectedCount === 0 ? "disabled" : ""}>
          ${STATUS_OPTIONS.map((status) => `<option value="${status}">${status}</option>`).join("")}
        </select>
        <button class="button primary" id="applyBatch" type="button" ${selectedCount === 0 ? "disabled" : ""}>批次變更狀態</button>
        <button class="button" id="clearSelection" type="button" ${selectedCount === 0 ? "disabled" : ""}>清除選取</button>
      </div>
    </div>
  `;
}

function renderTasksTable(tasks) {
  const allVisibleSelected = tasks.length > 0 && tasks.every((task) => state.selectedIds.has(task.id));

  return `
    <table class="table">
      <thead>
        <tr>
          <th class="checkbox-cell">
            <input class="checkbox" id="selectAllVisible" type="checkbox" ${allVisibleSelected ? "checked" : ""} aria-label="選取全部可見待辦">
          </th>
          <th>事項</th>
          <th>系統</th>
          <th>負責工程師</th>
          <th>期限</th>
          <th>狀態</th>
          <th>優先級</th>
        </tr>
      </thead>
      <tbody>
        ${tasks
          .map((task) => {
            const overdue = isOverdue(task);
            return `
              <tr class="${state.selectedTaskId === task.id ? "selected" : ""} ${overdue ? "overdue-row" : ""}" data-task-row="${task.id}">
                <td class="checkbox-cell">
                  <input class="checkbox" type="checkbox" data-select-task="${task.id}" ${state.selectedIds.has(task.id) ? "checked" : ""} aria-label="選取 ${escapeAttr(task.title)}">
                </td>
                <td>
                  <span class="task-title">
                    <strong>${escapeHtml(task.title)}</strong>
                    <small>${escapeHtml(trimNotes(task.notes))}</small>
                  </span>
                </td>
                <td>${escapeHtml(task.systemName)}</td>
                <td>${escapeHtml(task.engineerName)}</td>
                <td>${escapeHtml(task.dueDate)} ${overdue ? `<span class="badge overdue">逾期</span>` : ""}</td>
                <td>${statusBadge(task.status)}</td>
                <td>${priorityBadge(task.priority)}</td>
              </tr>
            `;
          })
          .join("")}
      </tbody>
    </table>
  `;
}

function renderTaskDetail(task) {
  if (!task) {
    return `<div class="detail-empty"><h2>代辦詳情</h2><p>選取一筆待辦後會顯示詳細資料。</p></div>`;
  }

  const historyItems = state.history
    .filter((entry) => entry.taskId === task.id)
    .slice()
    .sort((a, b) => b.changedAt.localeCompare(a.changedAt));

  return `
    <h2>代辦詳情</h2>
    <p class="detail-title">${escapeHtml(task.title)}</p>
    <div class="detail-meta">
      ${metaItem("系統", task.systemName)}
      ${metaItem("負責工程師", task.engineerName)}
      ${metaItem("期限", `${task.dueDate}${isOverdue(task) ? "（逾期）" : ""}`)}
      ${metaItem("狀態", task.status)}
      ${metaItem("優先級", task.priority)}
      ${metaItem("最後更新", formatDateTime(task.updatedAt))}
    </div>
    <h2>備註</h2>
    <p class="notes">${escapeHtml(task.notes || "未填寫備註")}</p>
    <div class="button-row" style="margin-top: 14px;">
      <button class="button" type="button" data-edit-task="${task.id}">
        <span class="button-icon" aria-hidden="true">${icons.edit}</span>
        編輯
      </button>
    </div>
    <h2 style="margin-top: 18px;">變更紀錄</h2>
    ${
      historyItems.length === 0
        ? `<p class="detail-empty">尚無狀態、指派或期限變更。</p>`
        : `<ul class="history-list">${historyItems.map(renderHistoryEntry).join("")}</ul>`
    }
  `;
}

function renderTaskForm() {
  const task = state.editingTaskId ? state.tasks.find((item) => item.id === state.editingTaskId) : null;
  const title = task ? "編輯代辦" : "新增代辦";
  const activeSystems = optionsWithCurrent(state.systems, task?.systemId);
  const activeEngineers = optionsWithCurrent(state.engineers, task?.engineerId);
  const canCreate = activeSystems.length > 0 && activeEngineers.length > 0;

  return `
    <section class="page">
      <header class="page-header">
        <div>
          <h1 class="page-title">${title}</h1>
          <p class="page-description">建立代辦、指定系統與工程師，並設定期限與優先級。</p>
        </div>
      </header>
      <div class="form-layout">
        <section class="panel form-panel">
          <h2>${title}</h2>
          ${!canCreate ? `<p class="detail-empty">請先建立至少一個啟用中的系統與工程師。</p>` : ""}
          <form id="taskForm" class="form-grid">
            <div class="form-field full">
              <label for="taskTitle">代辦事項</label>
              <input class="input" id="taskTitle" name="title" required maxlength="160" value="${escapeAttr(task?.title ?? "")}">
            </div>
            ${renderFormSelect("taskSystem", "所屬系統", "systemId", task?.systemId ?? "", activeSystems.map((system) => [system.id, system.name]))}
            ${renderFormSelect("taskEngineer", "指派工程師", "engineerId", task?.engineerId ?? "", activeEngineers.map((engineer) => [engineer.id, engineer.name]))}
            ${renderFormSelect("taskStatus", "狀態", "status", task?.status ?? "待處理", STATUS_OPTIONS.map((status) => [status, status]))}
            ${renderFormSelect("taskPriority", "優先級", "priority", task?.priority ?? "中", PRIORITY_OPTIONS.map((priority) => [priority, priority]))}
            <div class="form-field">
              <label for="taskDueDate">期限</label>
              <input class="input" id="taskDueDate" name="dueDate" type="date" required value="${escapeAttr(task?.dueDate ?? today())}">
            </div>
            <div class="form-field full">
              <label for="taskNotes">備註</label>
              <textarea class="textarea" id="taskNotes" name="notes" maxlength="2000">${escapeHtml(task?.notes ?? "")}</textarea>
            </div>
            <div class="form-field full">
              <div class="button-row">
                <button class="button primary" type="submit" ${!canCreate ? "disabled" : ""}>儲存代辦</button>
                <button class="button" type="button" id="cancelTaskForm">取消</button>
              </div>
            </div>
          </form>
        </section>
        <section class="panel list-panel">
          <h2>填寫原則</h2>
          <p class="detail-empty">逾期不需要手動設定。未完成且期限早於今天的代辦，會在總覽自動標示為逾期。</p>
        </section>
      </div>
    </section>
  `;
}

function renderSystemsView() {
  const editing = state.editingSystemId ? state.systems.find((system) => system.id === state.editingSystemId) : null;

  return renderManagementView({
    title: "系統管理",
    description: "維護你負責追蹤的 MIS 系統。停用後不會出現在新的代辦選單。",
    formTitle: editing ? "編輯系統" : "新增系統",
    formId: "systemForm",
    nameLabel: "系統名稱",
    contactLabel: "系統描述",
    contactName: "description",
    contactValue: editing?.description ?? "",
    nameValue: editing?.name ?? "",
    active: editing?.active ?? true,
    list: state.systems,
    editAttr: "data-edit-system",
    emptyText: "尚未建立系統。"
  });
}

function renderEngineersView() {
  const editing = state.editingEngineerId
    ? state.engineers.find((engineer) => engineer.id === state.editingEngineerId)
    : null;

  return renderManagementView({
    title: "工程師管理",
    description: "維護可指派的工程師。停用後不會出現在新的代辦選單。",
    formTitle: editing ? "編輯工程師" : "新增工程師",
    formId: "engineerForm",
    nameLabel: "工程師姓名",
    contactLabel: "聯絡資訊",
    contactName: "contact",
    contactValue: editing?.contact ?? "",
    nameValue: editing?.name ?? "",
    active: editing?.active ?? true,
    list: state.engineers,
    editAttr: "data-edit-engineer",
    emptyText: "尚未建立工程師。"
  });
}

function renderManagementView(config) {
  return `
    <section class="page">
      <header class="page-header">
        <div>
          <h1 class="page-title">${config.title}</h1>
          <p class="page-description">${config.description}</p>
        </div>
      </header>
      <div class="form-layout">
        <section class="panel form-panel">
          <h2>${config.formTitle}</h2>
          <form id="${config.formId}" class="form-grid">
            <div class="form-field full">
              <label for="entityName">${config.nameLabel}</label>
              <input class="input" id="entityName" name="name" required maxlength="80" value="${escapeAttr(config.nameValue)}">
            </div>
            <div class="form-field full">
              <label for="entityContact">${config.contactLabel}</label>
              <textarea class="textarea" id="entityContact" name="${config.contactName}" maxlength="400">${escapeHtml(config.contactValue)}</textarea>
            </div>
            <label class="inline-check form-field full">
              <input class="checkbox" name="active" type="checkbox" ${config.active ? "checked" : ""}>
              啟用
            </label>
            <div class="form-field full">
              <div class="button-row">
                <button class="button primary" type="submit">儲存</button>
                <button class="button" type="button" id="cancelManagementEdit">取消</button>
              </div>
            </div>
          </form>
        </section>
        <section class="panel list-panel">
          <h2>清單</h2>
          ${
            config.list.length === 0
              ? renderEmpty(config.emptyText)
              : `<div class="management-list">${config.list.map((item) => renderManagementRow(item, config.editAttr)).join("")}</div>`
          }
        </section>
      </div>
    </section>
  `;
}

function renderSettingsView() {
  return `
    <section class="page">
      <header class="page-header">
        <div>
          <h1 class="page-title">設定</h1>
          <p class="page-description">備份、還原與本機資料資訊。</p>
        </div>
      </header>
      <div class="settings-grid">
        <section class="setting-block">
          <h2>匯出備份</h2>
          <p>匯出目前所有系統、工程師、待辦與變更紀錄。</p>
          <button class="button primary" id="exportData" type="button">
            <span class="button-icon" aria-hidden="true">${icons.download}</span>
            匯出 JSON
          </button>
        </section>
        <section class="setting-block">
          <h2>匯入還原</h2>
          <p>匯入會覆蓋目前本機資料，請先確認備份來源可信。</p>
          <input class="input" id="importFile" type="file" accept="application/json,.json">
          <button class="button danger" id="importData" type="button">
            <span class="button-icon" aria-hidden="true">${icons.upload}</span>
            匯入 JSON
          </button>
        </section>
      </div>
      <section class="panel settings-panel">
        <h2>本機安全邊界</h2>
        <p class="detail-empty">Server 綁定 127.0.0.1，資料檔位於 data/store.json，第一版不提供登入與內網存取。</p>
      </section>
    </section>
  `;
}

function bindEvents() {
  document.querySelectorAll("[data-nav]").forEach((button) => {
    button.addEventListener("click", () => {
      const view = button.dataset.nav;
      state.view = view;
      state.editingTaskId = null;
      if (view !== "systems") state.editingSystemId = null;
      if (view !== "engineers") state.editingEngineerId = null;
      render();
    });
  });

  bindOverviewEvents();
  bindTaskFormEvents();
  bindManagementEvents();
  bindSettingsEvents();
}

function bindOverviewEvents() {
  const fields = [
    ["keyword", "keyword"],
    ["systemFilter", "systemId"],
    ["statusFilter", "status"],
    ["engineerFilter", "engineerId"],
    ["dueFilter", "due"],
    ["sortFilter", "sort"]
  ];

  for (const [id, key] of fields) {
    const element = document.querySelector(`#${id}`);
    if (!element) continue;
    element.addEventListener("input", () => {
      state.filters[key] = element.value;
      render();
    });
  }

  document.querySelectorAll("[data-task-row]").forEach((row) => {
    row.addEventListener("click", (event) => {
      if (event.target.closest("input, button, select, a")) return;
      state.selectedTaskId = row.dataset.taskRow;
      render();
    });
  });

  document.querySelectorAll("[data-select-task]").forEach((checkbox) => {
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) {
        state.selectedIds.add(checkbox.dataset.selectTask);
      } else {
        state.selectedIds.delete(checkbox.dataset.selectTask);
      }
      render();
    });
  });

  const selectAll = document.querySelector("#selectAllVisible");
  if (selectAll) {
    selectAll.addEventListener("change", () => {
      for (const task of visibleTasks()) {
        if (selectAll.checked) {
          state.selectedIds.add(task.id);
        } else {
          state.selectedIds.delete(task.id);
        }
      }
      render();
    });
  }

  document.querySelector("#clearSelection")?.addEventListener("click", () => {
    state.selectedIds.clear();
    render();
  });

  document.querySelector("#applyBatch")?.addEventListener("click", async () => {
    await runAction(async () => {
      const status = document.querySelector("#batchStatus").value;
      await api("/api/tasks/batch-status", {
        method: "POST",
        body: {
          ids: [...state.selectedIds],
          status
        }
      });
      state.selectedIds.clear();
      await loadAll();
      showToast("批次狀態已更新");
      render();
    });
  });

  document.querySelector("[data-edit-task]")?.addEventListener("click", (event) => {
    state.editingTaskId = event.currentTarget.dataset.editTask;
    state.view = "taskForm";
    render();
  });
}

function bindTaskFormEvents() {
  const form = document.querySelector("#taskForm");
  if (!form) return;

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const payload = Object.fromEntries(new FormData(form));
    const isEditing = Boolean(state.editingTaskId);

    await runAction(async () => {
      await api(isEditing ? `/api/tasks/${encodeURIComponent(state.editingTaskId)}` : "/api/tasks", {
        method: isEditing ? "PUT" : "POST",
        body: payload
      });
      await loadAll();
      showToast(isEditing ? "代辦已更新" : "代辦已建立");
      state.view = "overview";
      state.editingTaskId = null;
      render();
    });
  });

  document.querySelector("#cancelTaskForm")?.addEventListener("click", () => {
    state.view = "overview";
    state.editingTaskId = null;
    render();
  });
}

function bindManagementEvents() {
  const systemForm = document.querySelector("#systemForm");
  const engineerForm = document.querySelector("#engineerForm");

  if (systemForm) {
    systemForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      await saveManagedEntity("systems", systemForm, state.editingSystemId);
    });
  }

  if (engineerForm) {
    engineerForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      await saveManagedEntity("engineers", engineerForm, state.editingEngineerId);
    });
  }

  document.querySelectorAll("[data-edit-system]").forEach((button) => {
    button.addEventListener("click", () => {
      state.editingSystemId = button.dataset.editSystem;
      render();
    });
  });

  document.querySelectorAll("[data-edit-engineer]").forEach((button) => {
    button.addEventListener("click", () => {
      state.editingEngineerId = button.dataset.editEngineer;
      render();
    });
  });

  document.querySelector("#cancelManagementEdit")?.addEventListener("click", () => {
    state.editingSystemId = null;
    state.editingEngineerId = null;
    render();
  });
}

function bindSettingsEvents() {
  document.querySelector("#exportData")?.addEventListener("click", async () => {
    await runAction(async () => {
      const response = await fetch("/api/export");
      if (!response.ok) {
        throw new Error("匯出失敗");
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `mis-manager-backup-${today()}.json`;
      link.click();
      URL.revokeObjectURL(url);
      showToast("資料已匯出");
      render();
    });
  });

  document.querySelector("#importData")?.addEventListener("click", async () => {
    const fileInput = document.querySelector("#importFile");
    const file = fileInput?.files?.[0];

    if (!file) {
      showToast("請先選擇 JSON 檔", "error");
      return;
    }

    if (!window.confirm("匯入會覆蓋目前所有資料，確定要繼續？")) {
      return;
    }

    await runAction(async () => {
      const payload = JSON.parse(await file.text());
      await api("/api/import", { method: "POST", body: payload });
      await loadAll();
      showToast("資料已匯入");
      render();
    });
  });
}

async function saveManagedEntity(kind, form, editingId) {
  const payload = Object.fromEntries(new FormData(form));
  payload.active = Boolean(form.querySelector('[name="active"]').checked);
  const path = editingId ? `/api/${kind}/${encodeURIComponent(editingId)}` : `/api/${kind}`;

  await runAction(async () => {
    await api(path, {
      method: editingId ? "PUT" : "POST",
      body: payload
    });
    await loadAll();
    showToast(editingId ? "資料已更新" : "資料已建立");
    state.editingSystemId = null;
    state.editingEngineerId = null;
    render();
  });
}

async function runAction(action) {
  try {
    await action();
  } catch (error) {
    showToast(error.message, "error");
    render();
  }
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    method: options.method ?? "GET",
    headers: options.body ? { "Content-Type": "application/json" } : undefined,
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  const contentType = response.headers.get("content-type") ?? "";
  const payload = contentType.includes("application/json") ? await response.json() : null;

  if (!response.ok) {
    throw new Error(payload?.error ?? `HTTP ${response.status}`);
  }

  return payload;
}

function visibleTasks() {
  const keyword = state.filters.keyword.trim().toLowerCase();
  const todayValue = today();
  const weekEnd = addDays(todayValue, 7);

  return state.tasks
    .filter((task) => {
      if (keyword) {
        const haystack = `${task.title} ${task.notes} ${task.systemName} ${task.engineerName}`.toLowerCase();
        if (!haystack.includes(keyword)) return false;
      }

      if (state.filters.systemId && task.systemId !== state.filters.systemId) return false;
      if (state.filters.engineerId && task.engineerId !== state.filters.engineerId) return false;
      if (state.filters.status === "逾期" && !isOverdue(task)) return false;
      if (state.filters.status && state.filters.status !== "逾期" && task.status !== state.filters.status) return false;
      if (state.filters.due === "today" && task.dueDate !== todayValue) return false;
      if (state.filters.due === "week" && (task.dueDate < todayValue || task.dueDate > weekEnd)) return false;
      if (state.filters.due === "overdue" && !isOverdue(task)) return false;
      return true;
    })
    .sort((a, b) => {
      if (state.filters.sort === "priorityDesc") {
        return PRIORITY_WEIGHT[b.priority] - PRIORITY_WEIGHT[a.priority] || a.dueDate.localeCompare(b.dueDate);
      }

      if (state.filters.sort === "updatedDesc") {
        return b.updatedAt.localeCompare(a.updatedAt);
      }

      return a.dueDate.localeCompare(b.dueDate) || PRIORITY_WEIGHT[b.priority] - PRIORITY_WEIGHT[a.priority];
    });
}

function isOverdue(task) {
  return Boolean(task.dueDate && !CLOSED_STATUSES.includes(task.status) && task.dueDate < today());
}

function optionsWithCurrent(items, currentId) {
  return items.filter((item) => item.active || item.id === currentId);
}

function renderSelectField(id, label, value, options) {
  return `
    <div class="field">
      <label for="${id}">${label}</label>
      <select class="select" id="${id}">
        ${options.map(([optionValue, optionLabel]) => `<option value="${escapeAttr(optionValue)}" ${value === optionValue ? "selected" : ""}>${escapeHtml(optionLabel)}</option>`).join("")}
      </select>
    </div>
  `;
}

function renderFormSelect(id, label, name, value, options) {
  return `
    <div class="form-field">
      <label for="${id}">${label}</label>
      <select class="select" id="${id}" name="${name}" required>
        ${options.map(([optionValue, optionLabel]) => `<option value="${escapeAttr(optionValue)}" ${value === optionValue ? "selected" : ""}>${escapeHtml(optionLabel)}</option>`).join("")}
      </select>
    </div>
  `;
}

function renderManagementRow(item, editAttr) {
  return `
    <div class="management-row">
      <div>
        <p class="row-title">${escapeHtml(item.name)} ${item.active ? statusBadge("進行中", "啟用") : statusBadge("取消", "停用")}</p>
        <p class="row-subtitle">${escapeHtml(item.description ?? item.contact ?? "未填寫說明")}</p>
      </div>
      <button class="button" type="button" ${editAttr}="${item.id}">
        <span class="button-icon" aria-hidden="true">${icons.edit}</span>
        編輯
      </button>
    </div>
  `;
}

function renderEmpty(message) {
  return `<div class="empty-state">${escapeHtml(message)}</div>`;
}

function renderHistoryEntry(entry) {
  const fieldLabel = {
    status: "狀態",
    engineerId: "負責工程師",
    dueDate: "期限"
  }[entry.field];

  const before = entry.field === "engineerId" ? engineerName(entry.before) : entry.before;
  const after = entry.field === "engineerId" ? engineerName(entry.after) : entry.after;

  return `<li>${formatDateTime(entry.changedAt)}：${fieldLabel}由「${escapeHtml(before)}」改為「${escapeHtml(after)}」</li>`;
}

function metaItem(label, value) {
  return `
    <div class="meta-item">
      <span class="meta-label">${escapeHtml(label)}</span>
      <span>${escapeHtml(value || "-")}</span>
    </div>
  `;
}

function statusBadge(status, label = status) {
  const className = {
    待處理: "pending",
    進行中: "active",
    已完成: "done",
    暫緩: "paused",
    取消: "cancelled"
  }[status];

  return `<span class="badge ${className}">${escapeHtml(label)}</span>`;
}

function priorityBadge(priority) {
  const className = {
    低: "priority-low",
    中: "priority-medium",
    高: "priority-high",
    緊急: "priority-urgent"
  }[priority];

  return `<span class="badge ${className}">${escapeHtml(priority)}</span>`;
}

function engineerName(id) {
  return state.engineers.find((engineer) => engineer.id === id)?.name ?? id;
}

function trimNotes(notes) {
  if (!notes) return "未填寫備註";
  return notes.length > 34 ? `${notes.slice(0, 34)}...` : notes;
}

function showToast(message, type = "success") {
  state.toast = { message, type };
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => {
    state.toast = null;
    render();
  }, 2400);
}

function today() {
  const date = new Date();
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(dateOnly, days) {
  const date = new Date(`${dateOnly}T00:00:00`);
  date.setDate(date.getDate() + days);
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDateTime(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("zh-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function icon(pathData) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${pathData}"></path></svg>`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttr(value) {
  return escapeHtml(value);
}
