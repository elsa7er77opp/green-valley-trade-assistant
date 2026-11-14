const ASPIRE_ORIGIN = "https://trade.aspiresecurities.com/";
const ASPIRE_TAB_PATTERNS = ["https://trade.aspiresecurities.com/NewEtrade/*", "https://trade.aspiresecurities.com/newetrade/*"];
const ASPIRE_CONTENT_FILES = [
  "shared/order-model.js",
  "content/aspire-selectors.js",
  "content/aspire-execution-selectors.js",
  "content/aspire-reader.js",
  "content/aspire-executor.js",
  "content/content.js"
];
// Reloading the extension orphans the content script in an Aspire tab that is
// already open: it can no longer reach this worker, so the desktop bridge stops
// polling and the desktop badge falls to EXTENSION SILENT with no visible cause.
// Re-injecting on every worker start restores the bridge without a page reload.
// content.js guards each listener, so a live tab is not double-registered.
const reviveAspireTabs = async () => {
  try {
    const tabs = await chrome.tabs.query({ url: ASPIRE_TAB_PATTERNS });
    for (const tab of tabs) {
      if (!tab?.id) continue;
      try {
        await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ASPIRE_CONTENT_FILES });
      } catch (_injectionError) {
        // The tab may be mid-navigation or closed; the manifest injection covers it.
      }
    }
  } catch (_queryError) {}
};
chrome.runtime.onInstalled.addListener(reviveAspireTabs);
chrome.runtime.onStartup.addListener(reviveAspireTabs);
reviveAspireTabs();

// ---------------------------------------------------------------------------
// Diagnostic capture
//
// Every automatic diagnostic used to land in Downloads on every run. That is
// what made the 0.4.4-0.6.1 defects findable, but in day-to-day use it buries
// the folder in JSON nobody reads. Automatic captures are therefore OFF by
// default and go through this one helper, so the switch cannot be bypassed by
// adding another download call later.
//
// The last capture of each kind is always kept in chrome.storage.local, so a
// failure can still be inspected without the files ever being written. Turning
// the switch on in the popup restores the old behaviour for a support session.
// The popup's own "Capture ... diagnostic" buttons are unaffected: those are
// downloads the user explicitly asked for by clicking.
// ---------------------------------------------------------------------------
const DIAGNOSTIC_DOWNLOADS_KEY = "greenValleyDiagnosticDownloads";
const DIAGNOSTIC_LAST_KEY = "greenValleyLastDiagnostics";
const DIAGNOSTIC_KEEP = 10;

const saveDiagnostic = async (filename, payload) => {
  const json = JSON.stringify(payload, null, 2);

  // Always keep the most recent captures in extension storage, files or not.
  try {
    const stored = await chrome.storage.local.get(DIAGNOSTIC_LAST_KEY);
    const kept = Array.isArray(stored?.[DIAGNOSTIC_LAST_KEY]) ? stored[DIAGNOSTIC_LAST_KEY] : [];
    kept.unshift({ filename, capturedAt: new Date().toISOString(), json });
    await chrome.storage.local.set({ [DIAGNOSTIC_LAST_KEY]: kept.slice(0, DIAGNOSTIC_KEEP) });
  } catch (_storageError) {
    // Storage is a convenience here; never let it stop the flow.
  }

  let enabled = false;
  try {
    const setting = await chrome.storage.local.get(DIAGNOSTIC_DOWNLOADS_KEY);
    enabled = setting?.[DIAGNOSTIC_DOWNLOADS_KEY] === true;
  } catch (_settingError) {
    enabled = false;
  }
  if (!enabled) return;

  const bytes = new TextEncoder().encode(json);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  chrome.downloads.download({ url: `data:application/json;base64,${btoa(binary)}`, filename, saveAs: false });
};

const safeTrustedClick = async (message, sender, expectedIntent) => {
  const tabId = sender?.tab?.id;
  const tabUrl = String(sender?.tab?.url || "");
  const x = Number(message?.point?.x); const y = Number(message?.point?.y);
  const symbol = String(message?.symbol || "");
  const validSymbol = expectedIntent !== "TRUSTED_SYMBOL_OPTION_ONLY" || /^[A-Z0-9.-]+$/i.test(symbol);
  if (message?.intent !== expectedIntent || !validSymbol || !Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0 || !tabId || !tabUrl.startsWith(ASPIRE_ORIGIN)) {
    return { ok: false, reason: expectedIntent };
  }
  const target = { tabId };
  let attached = false;
  try {
    await chrome.debugger.attach(target, "1.3"); attached = true;
    await chrome.debugger.sendCommand(target, "Input.dispatchMouseEvent", { type: "mouseMoved", x, y, button: "none", buttons: 0 });
    await chrome.debugger.sendCommand(target, "Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", buttons: 1, clickCount: 1 });
    await chrome.debugger.sendCommand(target, "Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", buttons: 0, clickCount: 1 });
    return { ok: true, mode: "TRUSTED_FIRST_STAGE_ONLY" };
  } catch (error) {
    return { ok: false, reason: `TRUSTED_FIRST_STAGE_CLICK_FAILED_${String(error?.message || "UNKNOWN")}` };
  } finally {
    if (attached) { try { await chrome.debugger.detach(target); } catch (_) {} }
  }
};

// Real keyboard input for the symbol query only. Aspire's React search widget
// can refuse a programmatic value; this reuses the same constrained debugger
// path already approved for the exact symbol option, and can type nothing but a
// validated security code into the focused search field.
const safeTrustedSymbolQuery = async (message, sender) => {
  const tabId = sender?.tab?.id;
  const tabUrl = String(sender?.tab?.url || "");
  const symbol = String(message?.symbol || "");
  const x = Number(message?.point?.x); const y = Number(message?.point?.y);
  if (message?.intent !== "TRUSTED_SYMBOL_QUERY_ONLY" || !/^[A-Z0-9.-]{1,16}$/i.test(symbol) || !Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0 || !tabId || !tabUrl.startsWith(ASPIRE_ORIGIN)) {
    return { ok: false, reason: "TRUSTED_SYMBOL_QUERY_ONLY" };
  }
  const target = { tabId };
  let attached = false;
  try {
    await chrome.debugger.attach(target, "1.3"); attached = true;
    // Triple click selects any stale query so the authored symbol replaces it.
    await chrome.debugger.sendCommand(target, "Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", buttons: 1, clickCount: 3 });
    await chrome.debugger.sendCommand(target, "Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", buttons: 0, clickCount: 3 });
    for (const character of symbol) {
      await chrome.debugger.sendCommand(target, "Input.dispatchKeyEvent", { type: "keyDown", text: character, unmodifiedText: character, key: character });
      await chrome.debugger.sendCommand(target, "Input.dispatchKeyEvent", { type: "keyUp", key: character });
    }
    return { ok: true, mode: "TRUSTED_SYMBOL_QUERY_ONLY" };
  } catch (error) {
    return { ok: false, reason: `TRUSTED_SYMBOL_QUERY_FAILED_${String(error?.message || "UNKNOWN")}` };
  } finally {
    if (attached) { try { await chrome.debugger.detach(target); } catch (_) {} }
  }
};

const DESKTOP_BRIDGE_URL = "http://127.0.0.1:55230";
const desktopBridgeHttp = async (message, sender) => {
  const tabUrl = String(sender?.tab?.url || "");
  const bridge = message?.bridge;
  const path = String(message?.path || "");
  const method = String(message?.method || "GET").toUpperCase();
  const allowedPaths = new Set(["/v1/command", "/v1/orders", "/v1/result"]);
  if (!tabUrl.startsWith(ASPIRE_ORIGIN) || !bridge?.enabled || bridge.url !== DESKTOP_BRIDGE_URL || !bridge.token || !allowedPaths.has(path) || !["GET", "POST"].includes(method)) {
    return { ok: false, reason: "DESKTOP_BRIDGE_REQUEST_REJECTED" };
  }
  try {
    const response = await fetch(`${DESKTOP_BRIDGE_URL}${path}`, {
      method,
      headers: { "Content-Type": "application/json", "X-GV-Pairing": bridge.token },
      body: method === "POST" ? String(message?.body || "{}") : undefined
    });
    const text = await response.text();
    let body = null;
    try { body = text ? JSON.parse(text) : null; } catch (_) { body = null; }
    return { ok: response.ok, status: response.status, body };
  } catch (error) {
    return { ok: false, reason: `DESKTOP_BRIDGE_HTTP_FAILED_${String(error?.message || "UNKNOWN")}` };
  }
};

// Read-only reachability probe used by the popup so pairing reports the real
// desktop state instead of assuming success after a local storage write.
const desktopBridgePing = async token => {
  if (!token) return { ok: false, reason: "DESKTOP_BRIDGE_TOKEN_MISSING" };
  try {
    const response = await fetch(`${DESKTOP_BRIDGE_URL}/v1/ping`, { method: "GET", headers: { "X-GV-Pairing": token } });
    if (response.status === 403) return { ok: false, reason: "DESKTOP_BRIDGE_TOKEN_REJECTED" };
    if (!response.ok) return { ok: false, reason: `DESKTOP_BRIDGE_STATUS_${response.status}` };
    return { ok: true, mode: "DESKTOP_BRIDGE_PAIRED" };
  } catch (_error) {
    return { ok: false, reason: "DESKTOP_BRIDGE_APP_NOT_RUNNING" };
  }
};

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "GREEN_VALLEY_DESKTOP_BRIDGE_PING") {
    desktopBridgePing(String(message?.token || "")).then(sendResponse);
    return true;
  }
  if (message?.type === "GREEN_VALLEY_DESKTOP_BRIDGE_HTTP") {
    desktopBridgeHttp(message, sender).then(sendResponse);
    return true;
  }
  if (message?.type === "GREEN_VALLEY_TRUSTED_FIRST_STAGE_CLICK") {
    safeTrustedClick(message, sender, "TRUSTED_FIRST_STAGE_ONLY").then(sendResponse);
    return true;
  }
  if (message?.type === "GREEN_VALLEY_TRUSTED_SYMBOL_QUERY") {
    safeTrustedSymbolQuery(message, sender).then(sendResponse);
    return true;
  }
  if (message?.type === "GREEN_VALLEY_TRUSTED_SYMBOL_OPTION_CLICK") {
    safeTrustedClick(message, sender, "TRUSTED_SYMBOL_OPTION_ONLY").then(sendResponse);
    return true;
  }
  if (message?.type === "GREEN_VALLEY_TRUSTED_FINAL_CONFIRM_CLICK") {
    safeTrustedClick(message, sender, "TRUSTED_FINAL_CONFIRM_ONLY").then(sendResponse);
    return true;
  }
  if (message?.type === "GREEN_VALLEY_FIRST_STAGE_BROKER_REJECTION") {
    saveDiagnostic("green_valley_aspire_first_stage_broker_rejection.json", { ok: false, mode: "READ_ONLY_FIRST_STAGE_BROKER_REJECTION", capturedAt: new Date().toISOString(), brokerRejectionMessages: message.brokerRejectionMessages, warningDialogCandidates: message.warningDialogCandidates, submitButtons: message.submitButtons });
    return;
  }
  if (message?.type === "GREEN_VALLEY_FIRST_STAGE_CLICK_DELIVERY") {
    saveDiagnostic("green_valley_aspire_first_stage_click_delivery.json", { ok: true, mode: "READ_ONLY_FIRST_STAGE_CLICK_DELIVERY", capturedAt: new Date().toISOString(), delivery: message.delivery });
    return;
  }
  if (message?.type === "GREEN_VALLEY_SIDE_SELECTION_DIAGNOSTIC" && message.report) {
    saveDiagnostic("green_valley_aspire_side_selection_diagnostic.json", message.report);
    return;
  }
  if (message?.type === "GREEN_VALLEY_SETTLEMENT_DIAGNOSTIC" && message.report) {
    saveDiagnostic("green_valley_aspire_settlement_diagnostic.json", message.report);
    return;
  }
  if (message?.type === "GREEN_VALLEY_SYMBOL_SELECTION_STATE" && message.report) {
    saveDiagnostic("green_valley_aspire_symbol_selection_state.json", message.report);
    return;
  }
  if (message?.type === "GREEN_VALLEY_FIRST_STAGE_DIALOG_MISSING") {
    saveDiagnostic("green_valley_aspire_first_stage_dialog_missing.json", { ok: false, mode: "READ_ONLY_FIRST_STAGE_DIALOG_MISSING", capturedAt: new Date().toISOString(), submitButtons: message.submitButtons, dialogCandidates: message.dialogCandidates, visibleNoticeTexts: message.visibleNoticeTexts, accountState: message.accountState, ticket: message.ticket, settlement: message.settlement, rootText: message.rootText, activeElement: message.activeElement });
    return;
  }
  if (message?.type === "GREEN_VALLEY_CONFIRMATION_SETTLEMENT_MISMATCH") {
    saveDiagnostic("green_valley_aspire_confirmation_settlement_mismatch.json", { ok: false, mode: "READ_ONLY_CONFIRMATION_SETTLEMENT_MISMATCH", capturedAt: new Date().toISOString(), target: message.target, confirmation: message.confirmation });
    return;
  }
  if (message?.type === "GREEN_VALLEY_PREVIEW_TO_CONFIRMATION_RESULT" && message.result) {
    saveDiagnostic("green_valley_aspire_preview_to_confirmation_result.json", message.result);
    return;
  }
  if (message?.type === "GREEN_VALLEY_ONE_TAP_SPONSOR_RESULT" && message.result) {
    saveDiagnostic("green_valley_aspire_one_tap_sponsor_result.json", { ...message.result, mode: "ONE_TAP_SPONSOR" });
    return;
  }
  if (message?.type === "GREEN_VALLEY_FIRST_STAGE_TICKET_MISMATCH") {
    saveDiagnostic("green_valley_aspire_first_stage_ticket_mismatch.json", { ok: false, mode: "READ_ONLY_FIRST_STAGE_TICKET_MISMATCH", capturedAt: new Date().toISOString(), expectedTicket: message.expectedTicket, observedTicket: message.observedTicket, firstStageMismatchedFields: message.firstStageMismatchedFields });
    return;
  }
  if (message?.type === "GREEN_VALLEY_FIRST_STAGE_CONFIRMATION_RESULT" && message.result) {
    saveDiagnostic("green_valley_aspire_first_stage_confirmation_result.json", message.result);
    return;
  }
  if (message?.type === "GREEN_VALLEY_CONFIRMATION_DIAGNOSTIC_READY" && message.report) {
    saveDiagnostic("green_valley_aspire_confirmation_diagnostic.json", message.report);
    return;
  }
  if (message?.type === "GREEN_VALLEY_TICKET_POSTFILL_MISMATCH") {
    saveDiagnostic("green_valley_aspire_ticket_postfill_diagnostic.json", {
      ok: false,
      mode: "READ_ONLY_POSTFILL_MISMATCH_DIAGNOSTIC",
      capturedAt: new Date().toISOString(),
      expectedTicket: message.expectedTicket,
      observedTicket: message.observedTicket,
      mismatchedFields: message.mismatchedFields
    });
    return;
  }
  if (message?.type === "GREEN_VALLEY_ARMED_TICKET_FILL_RESULT" && message.result) {
    saveDiagnostic("green_valley_aspire_ticket_fill_result.json", message.result);
    return;
  }
  if (message?.type !== "GREEN_VALLEY_TICKET_DIAGNOSTIC_READY" || !message.report) return;
  const filename = /READ_ONLY_(?:POPULATION_FAILURE|PREFILL_LOCK)_DIAGNOSTIC/.test(message.report.mode)
    ? "green_valley_aspire_ticket_failure_diagnostic.json"
    : "green_valley_aspire_ticket_diagnostic_focused.json";
  saveDiagnostic(filename, message.report);
});
