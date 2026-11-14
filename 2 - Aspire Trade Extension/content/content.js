function greenValleyTicketDiagnosticReport(mode, observedInput = null) {
  const clean = value => String(value || "").replace(/\s+/g, " ").trim();
  const fieldDefinitions = [
    ["symbol", "#custom-select-search .select-search__input"],
    ["account", "#accountNumberBuyOrderPopup"],
    ["quantity", "#quantityOrderEntryPopup"],
    ["orderType", "#orderTypeOrderEntryPopup"],
    ["price", "#priceOrderEntryPopup"],
    ["validity", "select[id*='validityDateBuyOrderPopup']"]
  ];
  const ticketFields = fieldDefinitions.map(([name, selector]) => {
    const nodes = [...document.querySelectorAll(selector)];
    const values = nodes.map((node, index) => ({
      index,
      tag: node.tagName,
      id: node.id || "",
      className: clean(node.className),
      visible: node.getClientRects().length > 0,
      disabled: Boolean(node.disabled),
      value: clean(node.value),
      text: clean(node.innerText || node.textContent),
      ariaExpanded: node.getAttribute("aria-expanded") || ""
    })).sort((a, b) => Number(b.visible) - Number(a.visible));
    return { name, selector, count: nodes.length, visible: values.some(value => value.visible), values };
  });
  const optionSelector = [
    ".select-search__select [role='option']",
    ".select-search__select li",
    ".select-search__select option",
    ".select-search__option",
    "[role='listbox'] [role='option']",
    ".dropdown-menu [role='option']"
  ].join(",");
  const autocompleteOptions = [...document.querySelectorAll(optionSelector)]
    .filter(node => node.getClientRects().length > 0)
    .slice(0, 60)
    .map(node => ({
      tag: node.tagName,
      className: clean(node.className),
      role: node.getAttribute("role") || "",
      text: clean(node.innerText || node.textContent),
      value: clean(node.getAttribute("value") || node.dataset?.value),
      selected: node.getAttribute("aria-selected") || ""
    }));
  const accountOptions = [...document.querySelectorAll("#accountNumberBuyOrderPopup option")].map(option => ({
    value: clean(option.value),
    text: clean(option.textContent),
    selected: Boolean(option.selected)
  }));
  const active = document.activeElement;
  return {
    ok: true,
    capturedAt: new Date().toISOString(),
    url: location.origin + location.pathname,
    mode,
    observedInput: observedInput ? { value: clean(observedInput.value), id: observedInput.id || "", className: clean(observedInput.className) } : null,
    activeElement: active ? { tag: active.tagName, id: active.id || "", className: clean(active.className), value: clean(active.value) } : null,
    ticketFields,
    autocompleteOptions,
    accountOptions
  };
}
window.GreenValleyTicketDiagnosticReport = greenValleyTicketDiagnosticReport;

function greenValleySellTicketDiagnosticReport() {
  const clean = value => String(value || "").replace(/\s+/g, " ").trim();
  const visible = node => Boolean(node && node.getClientRects().length && [...node.getClientRects()].some(rect => rect.width > 0 && rect.height > 0));
  const root = [...document.querySelectorAll("#orderEntryDropdown")].find(visible) || null;
  const directText = node => clean([...node.childNodes]
    .filter(child => child.nodeType === Node.TEXT_NODE)
    .map(child => child.textContent)
    .join(" "));
  const describe = node => ({
    tag: node.tagName,
    id: node.id || "",
    className: clean(node.className),
    name: node.getAttribute("name") || "",
    type: node.getAttribute("type") || "",
    tabindex: node.getAttribute("tabindex") || "",
    visible: visible(node),
    disabled: Boolean(node.disabled),
    value: clean(node.value),
    text: clean(node.innerText || node.textContent).slice(0, 500)
  });
  const nodes = root ? [...root.querySelectorAll("input, select, textarea, button, [tabindex]")] : [];
  const sideNodes = root ? [...root.querySelectorAll("*")]
    .filter(visible)
    .filter(node => {
      const labels = [directText(node), node.getAttribute("aria-label"), node.getAttribute("title")]
        .map(clean)
        .filter(Boolean);
      return labels.some(label => /^(?:شراء|بيع|buy|sell)$/i.test(label));
    }) : [];
  const sideCandidates = sideNodes
    .map(node => ({
      ...describe(node),
      directText: directText(node),
      role: node.getAttribute("role") || "",
      ariaLabel: node.getAttribute("aria-label") || "",
      title: node.getAttribute("title") || "",
      parent: node.parentElement ? { tag: node.parentElement.tagName, id: node.parentElement.id || "", className: clean(node.parentElement.className) } : null
    }))
    .slice(0, 40);
  const sideControlDetails = sideNodes.slice(0, 12).map(node => {
    const ancestry = [];
    let current = node;
    for (let depth = 0; current && root?.contains(current) && depth < 5; depth += 1, current = current.parentElement) {
      ancestry.push({
        ...describe(current),
        checked: Boolean(current.checked),
        ariaPressed: current.getAttribute("aria-pressed") || "",
        ariaSelected: current.getAttribute("aria-selected") || "",
        outerHtml: String(current.outerHTML || "").slice(0, 1800)
      });
    }
    const localRoot = node.parentElement || node;
    const localControls = [...localRoot.querySelectorAll("input, button, label, [role], [aria-pressed], [aria-selected]")]
      .slice(0, 40)
      .map(control => ({
        ...describe(control),
        checked: Boolean(control.checked),
        ariaPressed: control.getAttribute("aria-pressed") || "",
        ariaSelected: control.getAttribute("aria-selected") || "",
        outerHtml: String(control.outerHTML || "").slice(0, 1200)
      }));
    return { label: directText(node), ancestry, localControls };
  });
  return {
    ok: true,
    mode: "READ_ONLY_SELL_TICKET_DIAGNOSTIC",
    capturedAt: new Date().toISOString(),
    url: location.origin + location.pathname,
    root: root ? { id: root.id || "", className: clean(root.className), visible: visible(root), text: clean(root.innerText || root.textContent).slice(0, 1500) } : null,
    controls: nodes.filter(visible).map(describe).slice(0, 120),
    sideCandidates,
    sideControlDetails,
    visibleButtons: nodes.filter(node => node.tagName === "BUTTON" && visible(node)).map(describe)
  };
}

if (!window.__greenValleyTicketDiagnosticInputListener) {
  window.__greenValleyTicketDiagnosticInputListener = true;
  let armed = false;
  let captureTimer = null;
  document.addEventListener("input", event => {
    const target = event.target;
    if (!armed || !target?.matches?.("#custom-select-search .select-search__input")) return;
    clearTimeout(captureTimer);
    captureTimer = setTimeout(() => {
      armed = false;
      chrome.runtime.sendMessage({ type: "GREEN_VALLEY_TICKET_DIAGNOSTIC_READY", report: greenValleyTicketDiagnosticReport("READ_ONLY_FOCUSED_TICKET_DIAGNOSTIC", target) });
    }, 700);
  }, true);
  window.__greenValleyArmTicketDiagnostic = () => { armed = true; clearTimeout(captureTimer); };
}

if (!window.__greenValleyArmedTicketFillListener) {
  window.__greenValleyArmedTicketFillListener = true;
  let armedTicketFillTimer = null;
  let armedTicketFillDeadline = null;
  const visibleNewOrder = () => {
    const root = document.querySelector("#orderEntryDropdown");
    return Boolean(root && root.getClientRects().length && [...root.getClientRects()].some(rect => rect.width > 0 && rect.height > 0));
  };
  window.__greenValleyArmTicketFill = (plan, emergencyStop) => {
    clearInterval(armedTicketFillTimer);
    clearTimeout(armedTicketFillDeadline);
    const finish = result => {
      clearInterval(armedTicketFillTimer);
      clearTimeout(armedTicketFillDeadline);
      chrome.runtime.sendMessage({ type: "GREEN_VALLEY_ARMED_TICKET_FILL_RESULT", result });
    };
    const tryFill = async () => {
      if (!visibleNewOrder()) return;
      clearInterval(armedTicketFillTimer);
      clearTimeout(armedTicketFillDeadline);
      try {
        finish(await window.GreenValleyAspireExecutor.populateTicketFromPlan(plan, emergencyStop));
      } catch (error) {
        finish({ ok: false, mode: "TICKET_FILLED_NOT_SUBMITTED", reason: String(error?.message || "TICKET_POPULATION_ERROR") });
      }
    };
    armedTicketFillTimer = setInterval(tryFill, 150);
    armedTicketFillDeadline = setTimeout(() => finish({ ok: false, mode: "READ_ONLY_ARMED_TICKET_FILL", reason: "TICKET_FILL_ARM_TIMEOUT" }), 20000);
    tryFill();
  };
}

if (!window.__greenValleyArmedFirstStageListener) {
  window.__greenValleyArmedFirstStageListener = true;
  let firstStageTimer = null;
  let firstStageDeadline = null;
  const visibleNewOrderForFirstStage = () => {
    const root = document.querySelector("#orderEntryDropdown");
    return Boolean(root && root.getClientRects().length && [...root.getClientRects()].some(rect => rect.width > 0 && rect.height > 0));
  };
  window.__greenValleyArmFirstStageConfirmation = (plan, emergencyStop) => {
    clearInterval(firstStageTimer); clearTimeout(firstStageDeadline);
    const finish = result => { clearInterval(firstStageTimer); clearTimeout(firstStageDeadline); chrome.runtime.sendMessage({ type: "GREEN_VALLEY_FIRST_STAGE_CONFIRMATION_RESULT", result }); };
    const tryOpen = async () => {
      if (!visibleNewOrderForFirstStage()) return;
      clearInterval(firstStageTimer); clearTimeout(firstStageDeadline);
      try { finish(await window.GreenValleyAspireExecutor.openFirstStageConfirmation(plan, emergencyStop)); }
      catch (error) { finish({ ok: false, mode: "READ_ONLY_FIRST_STAGE_CONFIRMATION", reason: String(error?.message || "FIRST_STAGE_CONFIRMATION_ERROR") }); }
    };
    firstStageTimer = setInterval(tryOpen, 150);
    firstStageDeadline = setTimeout(() => finish({ ok: false, mode: "READ_ONLY_FIRST_STAGE_CONFIRMATION", reason: "FIRST_STAGE_CONFIRMATION_ARM_TIMEOUT" }), 20000);
    tryOpen();
  };
}

if (!window.__greenValleyPreviewToConfirmationListener) {
  window.__greenValleyPreviewToConfirmationListener = true;
  let previewToConfirmationTimer = null;
  let previewToConfirmationDeadline = null;
  window.__greenValleyArmPreviewToConfirmation = (plan, emergencyStop) => {
    clearInterval(previewToConfirmationTimer); clearTimeout(previewToConfirmationDeadline);
    let quickOrderRequested = false;
    const finish = result => { clearInterval(previewToConfirmationTimer); clearTimeout(previewToConfirmationDeadline); chrome.runtime.sendMessage({ type: "GREEN_VALLEY_PREVIEW_TO_CONFIRMATION_RESULT", result }); window.__greenValleyDesktopBridgeReport?.(result); };
    const tryPrepare = async () => {
      const root = document.querySelector("#orderEntryDropdown");
      const rootVisible = Boolean(root && root.getClientRects().length && [...root.getClientRects()].some(rect => rect.width > 0 && rect.height > 0));
      if (!rootVisible) {
        if (!quickOrderRequested) {
          const trigger = [...document.querySelectorAll("button.quickorderBtn")].find(button => button.getClientRects().length > 0);
          if (!trigger) { finish({ ok: false, mode: "READ_ONLY_PREVIEW_TO_CONFIRMATION", reason: "QUICK_ORDER_TRIGGER_NOT_VISIBLE" }); return; }
          quickOrderRequested = true; trigger.click();
        }
        return;
      }
      clearInterval(previewToConfirmationTimer); clearTimeout(previewToConfirmationDeadline);
      try {
        const filled = await window.GreenValleyAspireExecutor.populateTicketFromPlan(plan, emergencyStop);
        if (!filled?.ok) { finish(filled); return; }
        finish(await window.GreenValleyAspireExecutor.openFirstStageConfirmation(plan, emergencyStop));
      } catch (error) {
        finish({ ok: false, mode: "READ_ONLY_PREVIEW_TO_CONFIRMATION", reason: String(error?.message || "PREVIEW_TO_CONFIRMATION_ERROR") });
      }
    };
    previewToConfirmationTimer = setInterval(tryPrepare, 150);
    previewToConfirmationDeadline = setTimeout(() => finish({ ok: false, mode: "READ_ONLY_PREVIEW_TO_CONFIRMATION", reason: "PREVIEW_TO_CONFIRMATION_ARM_TIMEOUT" }), 20000);
    tryPrepare();
  };
}

if (!window.__greenValleySponsorOneTapListener) {
  window.__greenValleySponsorOneTapListener = true;
  let sponsorOneTapTimer = null;
  let sponsorOneTapDeadline = null;
  window.__greenValleyArmSponsorOneTap = (plan, emergencyStop) => {
    clearInterval(sponsorOneTapTimer); clearTimeout(sponsorOneTapDeadline);
    let quickOrderRequested = false;
    let running = false;
	    const finish = result => {
	      clearInterval(sponsorOneTapTimer); clearTimeout(sponsorOneTapDeadline);
	      chrome.runtime.sendMessage({ type: "GREEN_VALLEY_ONE_TAP_SPONSOR_RESULT", result });
	      window.__greenValleyDesktopBridgeReport?.(result);
	    };
    const run = async () => {
      if (running) return;
      const root = document.querySelector("#orderEntryDropdown");
      const rootVisible = Boolean(root && root.getClientRects().length && [...root.getClientRects()].some(rect => rect.width > 0 && rect.height > 0));
      if (!rootVisible) {
        if (!quickOrderRequested) {
          const trigger = [...document.querySelectorAll("button.quickorderBtn")].find(button => button.getClientRects().length > 0);
          if (!trigger) { finish({ ok: false, mode: "ONE_TAP_SPONSOR", reason: "QUICK_ORDER_TRIGGER_NOT_VISIBLE" }); return; }
          quickOrderRequested = true;
          trigger.click();
        }
        return;
      }
      running = true;
      clearInterval(sponsorOneTapTimer); clearTimeout(sponsorOneTapDeadline);
      try {
        const filled = await window.GreenValleyAspireExecutor.populateTicketFromPlan(plan, emergencyStop);
        if (!filled?.ok) { finish(filled); return; }
        const opened = await window.GreenValleyAspireExecutor.openFirstStageConfirmation(plan, emergencyStop);
        if (!opened?.ok) { finish(opened); return; }
        finish(await window.GreenValleyAspireExecutor.executeConfirmedPlan(plan, "", emergencyStop, true));
      } catch (error) {
        finish({ ok: false, mode: "ONE_TAP_SPONSOR", reason: String(error?.message || "ONE_TAP_SPONSOR_ERROR") });
      }
    };
    sponsorOneTapTimer = setInterval(run, 150);
    sponsorOneTapDeadline = setTimeout(() => finish({ ok: false, mode: "ONE_TAP_SPONSOR", reason: "ONE_TAP_SPONSOR_TIMEOUT" }), 20000);
    run();
	  };
}

if (!window.__greenValleyDesktopBridgeListener) {
  window.__greenValleyDesktopBridgeListener = true;
  const DESKTOP_BRIDGE_URL = "http://127.0.0.1:55230";
  let desktopBridgeBusy = false;
  const desktopBridgeConfig = async () => {
    const stored = await chrome.storage.local.get(["GREEN_VALLEY_DESKTOP_BRIDGE"]);
    const bridge = stored?.GREEN_VALLEY_DESKTOP_BRIDGE;
    if (!bridge?.enabled || bridge.url !== DESKTOP_BRIDGE_URL || !bridge.token) return null;
    return bridge;
  };
  const desktopPlanToGuardedPlan = desktopPlan => {
    const target = {
      account: String(desktopPlan?.account || "").trim(),
      symbol: String(desktopPlan?.symbol || "").trim().toUpperCase(),
      side: String(desktopPlan?.side || "").trim().toUpperCase(),
      quantity: Number(desktopPlan?.quantity),
      price: Number(desktopPlan?.price),
      validity: String(desktopPlan?.validity || "").trim().toUpperCase(),
      settlement: String(desktopPlan?.settlement || "").trim().toUpperCase()
    };
    if (!desktopPlan?.plan_id || !target.account || !target.symbol || !["BUY", "SELL"].includes(target.side) || !Number.isFinite(target.quantity) || target.quantity <= 0 || !Number.isFinite(target.price) || target.price <= 0 || !["DAY", "GTC"].includes(target.validity) || !["T+0", "T+1", "T+2", "NORMAL"].includes(target.settlement)) return null;
    return { schemaVersion: 1, mode: "USER_CONFIRMED_EXECUTION", kind: "NEW_ORDER", planId: String(desktopPlan.plan_id), createdAt: String(desktopPlan.created_at || new Date().toISOString()), sources: [], targets: [target], confirmationPhrase: `DESKTOP ${desktopPlan.plan_id}` };
  };
  const bridgeFetch = async (bridge, path, options = {}) => chrome.runtime.sendMessage({
    type: "GREEN_VALLEY_DESKTOP_BRIDGE_HTTP",
    bridge,
    path,
    method: options.method || "GET",
    body: options.body || null
  });
  const postDesktopResult = async result => {
    const bridge = await desktopBridgeConfig();
    if (!bridge) return;
    try { await bridgeFetch(bridge, "/v1/result", { method: "POST", body: JSON.stringify(result) }); } catch (_error) {}
  };
  window.__greenValleyDesktopBridgeReport = postDesktopResult;
  const readAndPostOrders = async bridge => {
    try {
      const read = window.GreenValleyAspireReader.readOpenOrders();
      const orders = Array.isArray(read?.orders) ? read.orders : [];
      await bridgeFetch(bridge, "/v1/orders", { method: "POST", body: JSON.stringify({ orders }) });
      await postDesktopResult({ ok: Boolean(read?.ok), mode: "DESKTOP_OPEN_ORDERS", rawCount: read?.rawCount || 0 });
    } catch (error) {
      await postDesktopResult({ ok: false, mode: "DESKTOP_OPEN_ORDERS", reason: String(error?.message || "READ_FAILED") });
    }
  };
  let desktopBridgeTimer = null;
  const pollDesktopBridge = async () => {
    // After an extension reload this script is orphaned: chrome.runtime.id is
    // gone and every call throws. Stop the timer instead of failing silently
    // forever; the worker re-injects a live copy on its next start.
    if (!chrome.runtime?.id) { clearInterval(desktopBridgeTimer); return; }
    if (desktopBridgeBusy) return;
    const bridge = await desktopBridgeConfig();
    if (!bridge) return;
    desktopBridgeBusy = true;
    try {
      const response = await bridgeFetch(bridge, "/v1/command");
      if (!response?.ok) return;
      const command = response.body;
      if (command?.type === "READ_OPEN_ORDERS") { await readAndPostOrders(bridge); return; }
      if (command?.type !== "EXECUTE_USER_PLAN") return;
      const plan = desktopPlanToGuardedPlan(command.plan);
      if (!plan) { await postDesktopResult({ ok: false, mode: "DESKTOP_BRIDGE", reason: "DESKTOP_PLAN_REJECTED" }); return; }
      if (command.plan.sponsor_mode) {
        window.__greenValleyArmSponsorOneTap(plan, false);
      } else {
        window.__greenValleyArmPreviewToConfirmation(plan, false);
      }
    } catch (_error) {
      // The desktop program may be closed; do not retry or create browser action.
    } finally {
      desktopBridgeBusy = false;
    }
  };
  desktopBridgeTimer = setInterval(pollDesktopBridge, 900);
}

if (!window.__greenValleyConfirmationDiagnosticListener) {
  window.__greenValleyConfirmationDiagnosticListener = true;
  let confirmationTimer = null;
  let confirmationDeadline = null;
  const visibleElement = element => Boolean(element && element.getClientRects().length && [...element.getClientRects()].some(rect => rect.width > 0 && rect.height > 0));
  const confirmationDialogReport = () => {
    const dialog = [...document.querySelectorAll(".custom-popup")].find(visibleElement);
    if (!dialog) return null;
    const buttons = [...dialog.querySelectorAll("button")].filter(visibleElement).map(button => ({
      text: (button.textContent || "").replace(/\s+/g, " ").trim(),
      className: String(button.className || ""),
      disabled: Boolean(button.disabled)
    }));
    if (!buttons.length) return null;
    return {
      ok: true,
      capturedAt: new Date().toISOString(),
      mode: "READ_ONLY_CONFIRMATION_DIALOG_DIAGNOSTIC",
      dialog: { className: String(dialog.className || ""), text: (dialog.textContent || "").replace(/\s+/g, " ").trim().slice(0, 3000) },
      buttons,
      visibleOrderSubmitButtons: [...document.querySelectorAll("#orderEntryDropdown .btn-trade-orderPopup")].filter(visibleElement).map(button => ({ text: (button.textContent || "").trim(), disabled: Boolean(button.disabled), className: String(button.className || "") }))
    };
  };
  window.__greenValleyArmConfirmationDiagnostic = () => {
    clearInterval(confirmationTimer);
    clearTimeout(confirmationDeadline);
    const finish = report => {
      clearInterval(confirmationTimer);
      clearTimeout(confirmationDeadline);
      chrome.runtime.sendMessage({ type: "GREEN_VALLEY_CONFIRMATION_DIAGNOSTIC_READY", report });
    };
    const capture = () => {
      const report = confirmationDialogReport();
      if (report) finish(report);
    };
    confirmationTimer = setInterval(capture, 150);
    confirmationDeadline = setTimeout(() => finish({ ok: false, mode: "READ_ONLY_CONFIRMATION_DIALOG_DIAGNOSTIC", reason: "CONFIRMATION_DIALOG_ARM_TIMEOUT" }), 20000);
    capture();
  };
}

if (!window.__greenValleyMessageListener) {
  window.__greenValleyMessageListener = true;
chrome.runtime.onMessage.addListener((message, _sender, respond) => {
  if (message?.type === "GREEN_VALLEY_ARM_PREVIEW_TO_CONFIRMATION") {
    window.__greenValleyArmPreviewToConfirmation(message.plan, Boolean(message.emergencyStop));
    respond({ ok: true, mode: "READ_ONLY_PREVIEW_TO_CONFIRMATION", expiresInMs: 20000 });
    return true;
  }
  if (message?.type === "GREEN_VALLEY_ARM_SPONSOR_ONE_TAP") {
    window.__greenValleyArmSponsorOneTap(message.plan, Boolean(message.emergencyStop));
    respond({ ok: true, mode: "ONE_TAP_SPONSOR", expiresInMs: 20000 });
    return true;
  }
  if (message?.type === "GREEN_VALLEY_ARM_FIRST_STAGE_CONFIRMATION") {
    window.__greenValleyArmFirstStageConfirmation(message.plan, Boolean(message.emergencyStop));
    respond({ ok: true, mode: "READ_ONLY_FIRST_STAGE_CONFIRMATION", expiresInMs: 20000 });
    return true;
  }
  if (message?.type === "GREEN_VALLEY_ARM_CONFIRMATION_DIAGNOSTIC") {
    window.__greenValleyArmConfirmationDiagnostic();
    respond({ ok: true, mode: "READ_ONLY_CONFIRMATION_DIALOG_DIAGNOSTIC", expiresInMs: 20000 });
    return true;
  }
  if (message?.type === "GREEN_VALLEY_ARM_TICKET_FILL") {
    window.__greenValleyArmTicketFill(message.plan, Boolean(message.emergencyStop));
    respond({ ok: true, mode: "READ_ONLY_ARMED_TICKET_FILL", expiresInMs: 20000 });
    return true;
  }
  if (message?.type === "GREEN_VALLEY_ARM_TICKET_DIAGNOSTIC") {
    window.__greenValleyArmTicketDiagnostic();
    respond({ ok: true, mode: "READ_ONLY_TICKET_DIAGNOSTIC_ARMED" });
    return true;
  }
  if (message?.type === "GREEN_VALLEY_CAPTURE_TICKET_DIAGNOSTIC") {
    respond(greenValleyTicketDiagnosticReport("READ_ONLY_TICKET_DIAGNOSTIC"));
    return true;
  }
  if (message?.type === "GREEN_VALLEY_CAPTURE_SELL_TICKET_DIAGNOSTIC") {
    respond(greenValleySellTicketDiagnosticReport());
    return true;
  }
  if (message?.type === "GREEN_VALLEY_CAPTURE_ORDER_GRID_DIAGNOSTIC") {
    const allowedColumns = new Set(["SellBuyFlag", "Symbol_1", "Symbol", "StatusCode", "Remaining", "Price", "ValidityCode"]);
    const candidates = [...new Set([...document.querySelectorAll(".ag-root,[role='grid']")])];
    const grids = candidates.map((grid, gridIndex) => {
      const headers = [...grid.querySelectorAll("[role='columnheader']")].map(header => ({
        colId: header.getAttribute("col-id") || "",
        text: String(header.innerText || header.textContent || "").replace(/\s+/g, " ").trim()
      })).filter(header => header.colId || header.text);
      const rowMap = new Map();
      for (const row of grid.querySelectorAll(".ag-row[row-id],[role='row'][row-id]")) {
        const rowId = row.getAttribute("row-id") || "";
        if (!rowId) continue;
        const record = rowMap.get(rowId) || { rowId, rowIndex: row.getAttribute("row-index") || "", cells: {} };
        for (const cell of row.querySelectorAll("[role='gridcell'][col-id],.ag-cell[col-id]")) {
          const colId = cell.getAttribute("col-id") || "";
          if (!allowedColumns.has(colId)) continue;
          record.cells[colId] = String(cell.getAttribute("title") || cell.innerText || cell.textContent || "").replace(/\s+/g, " ").trim();
        }
        rowMap.set(rowId, record);
      }
      return { gridIndex, className: String(grid.className || ""), headers, rows: [...rowMap.values()] };
    }).filter(grid => grid.headers.length || grid.rows.length);
    respond({ ok: true, capturedAt: new Date().toISOString(), url: location.origin + location.pathname, gridCount: grids.length, grids });
    return true;
  }
  if (message?.type === "GREEN_VALLEY_EXECUTION_CAPABILITY") {
    respond(window.GreenValleyAspireExecutor.capability());
    return true;
  }
  if (message?.type === "GREEN_VALLEY_VALIDATE_GUARDED_PLAN") {
    respond(window.GreenValleyAspireExecutor.validatePlan(message.plan));
    return true;
  }
  if (message?.type === "GREEN_VALLEY_VALIDATE_VISIBLE_CONFIRMATION") {
    respond(window.GreenValleyAspireExecutor.validateVisibleConfirmation(message.plan));
    return true;
  }
  if (message?.type === "GREEN_VALLEY_POPULATE_TICKET_FROM_PLAN") {
    window.GreenValleyAspireExecutor.populateTicketFromPlan(message.plan, Boolean(message.emergencyStop))
      .then(respond)
      .catch(error => respond({ ok: false, mode: "TICKET_FILLED_NOT_SUBMITTED", reason: "TICKET_POPULATION_ERROR", detail: String(error?.message || error) }));
    return true;
  }
  if (message?.type === "GREEN_VALLEY_EXECUTE_GUARDED_PLAN") {
    window.GreenValleyAspireExecutor.executeConfirmedPlan(message.plan, message.confirmationPhrase, Boolean(message.emergencyStop), Boolean(message.sponsorMode))
      .then(respond)
      .catch(error => respond({ ok: false, mode: "GUARDED", reason: "EXECUTION_ERROR", detail: String(error?.message || error) }));
    return true;
  }
  if (message?.type !== "GREEN_VALLEY_READ_OPEN_ORDERS") return;
  try {
    const result = window.GreenValleyAspireReader.readOpenOrders();
    respond({
      ...result,
      aggregates: window.GreenValleyOrderModel.aggregateOrders(result.orders),
      mode: "READ_ONLY_SIMULATION"
    });
  } catch (error) {
    respond({ ok: false, reason: "READ_FAILED", detail: String(error?.message || error), orders: [], aggregates: [], mode: "READ_ONLY_SIMULATION" });
  }
  return true;
});
}
