const $ = selector => document.querySelector(selector);
const escapeHtml = value => String(value ?? "").replace(/[&<>'"]/g, character => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "'":"&#39;", '"':"&quot;" }[character]));
const fmt = value => Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 4 });
let guardedPlan = null;
let emergencyStop = false;
let singleButtonPhase = "PREPARE";
let sponsorModeEnabled = false;
const DESKTOP_BRIDGE_URL = "http://127.0.0.1:55230";

async function activeTab() { const [tab] = await chrome.tabs.query({ active: true, currentWindow: true }); return tab; }
async function sendReadOnlyBridgeMessage(tab, message) {
  let report;
  try {
    report = await chrome.tabs.sendMessage(tab.id, message);
  } catch (_error) {
    report = null;
  }
  if (report) return report;
  await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content/content.js"] });
  return chrome.tabs.sendMessage(tab.id, message);
}
function renderRows(target, rows, cells) { $(target).innerHTML = rows.map(row => `<tr>${cells.map(cell => `<td>${escapeHtml(cell(row))}</td>`).join("")}</tr>`).join(""); }
function executionState(text) { $("#execution-status").textContent = text; }
function newId() { return `GV-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`; }
function setSingleButtonPhase(phase) {
  singleButtonPhase = phase;
  const primary = $("#prepare-confirmation");
  const ready = phase === "FINAL_CONFIRMATION_READY";
  primary.textContent = sponsorModeEnabled ? "Send verified order" : (ready ? "Send verified order" : "Prepare Aspire confirmation from preview");
  $("#confirmation").hidden = sponsorModeEnabled;
  $("#confirmation").disabled = sponsorModeEnabled || !ready || emergencyStop;
  $("#execute").hidden = true;
}
function renderSponsorMode() {
  $("#sponsor-mode").checked = sponsorModeEnabled;
  setSingleButtonPhase(singleButtonPhase);
}
async function restoreSponsorMode() {
  const stored = await chrome.storage.local.get(["GREEN_VALLEY_SPONSOR_MODE"]);
  sponsorModeEnabled = Boolean(stored.GREEN_VALLEY_SPONSOR_MODE);
  renderSponsorMode();
}
async function refreshSingleButtonPhase() {
  if (!guardedPlan || emergencyStop) return;
  try {
    const tab = await activeTab();
    const result = await sendReadOnlyBridgeMessage(tab, { type: "GREEN_VALLEY_VALIDATE_VISIBLE_CONFIRMATION", plan: guardedPlan });
    if (!result?.ok) return;
    setSingleButtonPhase("FINAL_CONFIRMATION_READY");
    executionState(`Confirmation verified. Enter the exact phrase, then use this same button to send one ${guardedPlan.targets[0].side} order and check Open Orders.`);
  } catch (_error) {}
}
function showPlan(plan, status) {
  guardedPlan = plan;
  const target = plan.targets[0];
  $("#account").value = target.account; $("#symbol").value = target.symbol; $("#side").value = target.side; $("#quantity").value = target.quantity; $("#price").value = target.price; $("#validity").value = target.validity; $("#settlement").value = target.settlement || "T+0";
  $("#preview-box").hidden = false; $("#preview-box").innerHTML = `<strong>Preview ${escapeHtml(plan.planId)}</strong><br>${escapeHtml(target.account)} · ${escapeHtml(target.side)} ${escapeHtml(target.symbol)} · ${fmt(target.quantity)} shares · Limit ${fmt(target.price)} · ${escapeHtml(target.validity)} · ${escapeHtml(target.settlement || "T+0")}<br><small>Required phrase: ${escapeHtml(plan.confirmationPhrase)}</small>`;
  $("#prepare-confirmation").disabled = false; $("#populate").disabled = false; $("#open-confirmation").disabled = false; $("#validate").disabled = false; setSingleButtonPhase("PREPARE"); executionState(status);
}
async function restoreGuardedPlan() {
  const stored = await chrome.storage.session.get(["gvGuardedPlan"]);
  if (!stored?.gvGuardedPlan || !Array.isArray(stored.gvGuardedPlan.targets) || stored.gvGuardedPlan.targets.length !== 1) return;
  showPlan(stored.gvGuardedPlan, "Restored guarded plan. Checking whether Aspire confirmation is visible.");
  await refreshSingleButtonPhase();
}
const DESKTOP_BRIDGE_FAILURES = {
  DESKTOP_BRIDGE_APP_NOT_RUNNING: "NOT PAIRED — GREEN VALLEY Trade Assistant is not answering on 127.0.0.1:55230. Open the desktop application first.",
  DESKTOP_BRIDGE_TOKEN_REJECTED: "NOT PAIRED — the desktop application rejected this token. Copy the current token from Trade Assistant and paste it again.",
  DESKTOP_BRIDGE_TOKEN_MISSING: "Paste the pairing token shown in Trade Assistant Desktop."
};
const describeDesktopBridgeFailure = reason => DESKTOP_BRIDGE_FAILURES[reason] || `NOT PAIRED — ${reason || "unknown bridge error"}.`;
// The popup never claims a pairing it has not proven against the running app.
const verifyDesktopBridge = async token => {
  try { return await chrome.runtime.sendMessage({ type: "GREEN_VALLEY_DESKTOP_BRIDGE_PING", token }); }
  catch (error) { return { ok: false, reason: String(error?.message || "DESKTOP_BRIDGE_PING_FAILED") }; }
};
async function reportDesktopBridge(token) {
  $("#desktop-bridge-status").textContent = "Checking the desktop application…";
  const probe = await verifyDesktopBridge(token);
  $("#desktop-bridge-status").textContent = probe?.ok
    ? "PAIRED — the desktop application answered. Keep Aspire's Order List open so commands are collected."
    : describeDesktopBridgeFailure(probe?.reason);
  return Boolean(probe?.ok);
}
async function restoreDesktopBridge() {
  const stored = await chrome.storage.local.get(["GREEN_VALLEY_DESKTOP_BRIDGE"]);
  const bridge = stored.GREEN_VALLEY_DESKTOP_BRIDGE;
  if (!bridge?.enabled || bridge.url !== DESKTOP_BRIDGE_URL || !bridge.token) return;
  $("#desktop-bridge-token").value = bridge.token;
  await reportDesktopBridge(bridge.token);
}
async function initializePopup() { await restoreSponsorMode(); await restoreGuardedPlan(); await restoreDesktopBridge(); }
initializePopup().catch(() => {});

$("#save-desktop-bridge").addEventListener("click", async () => {
  const token = $("#desktop-bridge-token").value.trim();
  if (!token) { $("#desktop-bridge-status").textContent = DESKTOP_BRIDGE_FAILURES.DESKTOP_BRIDGE_TOKEN_MISSING; return; }
  const paired = await reportDesktopBridge(token);
  if (!paired) return;
  await chrome.storage.local.set({ GREEN_VALLEY_DESKTOP_BRIDGE: { enabled: true, url: DESKTOP_BRIDGE_URL, token } });
});

$("#test-desktop-bridge").addEventListener("click", async () => {
  await reportDesktopBridge($("#desktop-bridge-token").value.trim());
});

$("#sponsor-mode").addEventListener("change", async event => {
  sponsorModeEnabled = Boolean(event.target.checked);
  await chrome.storage.local.set({ GREEN_VALLEY_SPONSOR_MODE: sponsorModeEnabled });
  renderSponsorMode();
  executionState(sponsorModeEnabled ? "One-Tap Sponsor Mode enabled. Verified confirmation values are still required before the primary button can send." : "One-Tap Sponsor Mode disabled. Exact phrase is required before sending.");
});

$("#read").addEventListener("click", async () => {
  $("#status").textContent = "Reading visible Aspire Order List…"; $("#summary").hidden = true; $("#details").hidden = true;
  try {
    const tab = await activeTab(); const result = await chrome.tabs.sendMessage(tab.id, { type: "GREEN_VALLEY_READ_OPEN_ORDERS" });
    if (!result?.ok) throw new Error(result?.reason || "Could not read the Order List.");
    $("#status").textContent = result.rawCount ? `Read ${result.rawCount} visible order(s).` : "No visible open orders are currently listed.";
    renderRows("#groups", result.aggregates, [row => row.symbol, row => row.side, row => row.orderCount, row => fmt(row.totalRemainingQuantity), row => fmt(row.weightedAveragePrice)]);
    renderRows("#orders", result.orders, [row => row.symbol, row => row.side, row => fmt(row.remainingQuantity), row => fmt(row.price), row => row.status]);
    $("#summary").hidden = !result.aggregates.length; $("#details").hidden = !result.orders.length;
  } catch (error) { $("#status").textContent = `Read failed: ${error.message}`; }
});

$("#diagnostic").addEventListener("click", async () => {
  $("#status").textContent = "Capturing read-only AG Grid structure…";
  try {
    const tab = await activeTab();
    const report = await chrome.tabs.sendMessage(tab.id, { type: "GREEN_VALLEY_CAPTURE_ORDER_GRID_DIAGNOSTIC" });
    if (!report?.ok) throw new Error("Diagnostic capture failed.");
    const blobUrl = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: "application/json" }));
    await chrome.downloads.download({ url: blobUrl, filename: "green_valley_aspire_grid_diagnostic.json", saveAs: false });
    $("#status").textContent = `Diagnostic saved: ${report.gridCount} grid candidate(s). No trading action was taken.`;
    setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);
  } catch (error) {
    $("#status").textContent = `Diagnostic failed: ${error.message}`;
  }
});

$("#ticket-diagnostic").addEventListener("click", async () => {
  $("#status").textContent = "Capturing read-only Ticket and autocomplete state…";
  try {
    const tab = await activeTab();
    const report = await sendReadOnlyBridgeMessage(tab, { type: "GREEN_VALLEY_CAPTURE_TICKET_DIAGNOSTIC" });
    if (!report?.ok) throw new Error("Ticket diagnostic capture failed.");
    const blobUrl = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: "application/json" }));
    await chrome.downloads.download({ url: blobUrl, filename: "green_valley_aspire_ticket_diagnostic.json", saveAs: false });
    $("#status").textContent = `Ticket diagnostic saved: ${report.autocompleteOptions.length} visible suggestion(s). No trading action was taken.`;
    setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);
  } catch (error) {
    $("#status").textContent = `Ticket diagnostic failed: ${error.message}`;
  }
});

$("#capture-sell-ticket-diagnostic").addEventListener("click", async () => {
  $("#status").textContent = "Capturing read-only SELL Ticket controls…";
  try {
    const tab = await activeTab();
    const report = await sendReadOnlyBridgeMessage(tab, { type: "GREEN_VALLEY_CAPTURE_SELL_TICKET_DIAGNOSTIC" });
    if (!report?.ok) throw new Error("SELL ticket diagnostic capture failed.");
    const blobUrl = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: "application/json" }));
    await chrome.downloads.download({ url: blobUrl, filename: "green_valley_aspire_sell_ticket_diagnostic.json", saveAs: false });
    $("#status").textContent = `SELL diagnostic saved: ${report.controls.length} visible control(s). No trading action was taken.`;
    setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);
  } catch (error) {
    $("#status").textContent = `SELL diagnostic failed: ${error.message}`;
  }
});

$("#arm-ticket-diagnostic").addEventListener("click", async () => {
  $("#status").textContent = "Arming focused-input diagnostic…";
  try {
    const tab = await activeTab();
    const result = await sendReadOnlyBridgeMessage(tab, { type: "GREEN_VALLEY_ARM_TICKET_DIAGNOSTIC" });
    if (!result?.ok) throw new Error("Could not arm focused diagnostic.");
    $("#status").textContent = "Armed. Return to Aspire and type the symbol. The capture is kept in the extension; tick the box above to also save it to Downloads.";
    setTimeout(() => window.close(), 600);
  } catch (error) {
    $("#status").textContent = `Arm failed: ${error.message}`;
  }
});

$("#arm-confirmation-diagnostic").addEventListener("click", async () => {
  $("#status").textContent = "Arming confirmation-dialog diagnostic…";
  try {
    const tab = await activeTab();
    const result = await sendReadOnlyBridgeMessage(tab, { type: "GREEN_VALLEY_ARM_CONFIRMATION_DIAGNOSTIC" });
    if (!result?.ok) throw new Error("Could not arm confirmation diagnostic.");
    $("#status").textContent = "Armed. Return to Aspire and open the confirmation dialog. The capture is kept in the extension; tick the box above to also save it to Downloads.";
    setTimeout(() => window.close(), 600);
  } catch (error) {
    $("#status").textContent = `Arm failed: ${error.message}`;
  }
});

// ---------------------------------------------------------------------------
// Diagnostic downloads switch
//
// The automatic captures in background.js used to write a JSON to Downloads on
// every single run. They are off by default now. The last captures are still
// kept inside the extension either way, and the button below writes them out
// on demand - so a support session needs one click, not a permanently
// cluttered Downloads folder.
// ---------------------------------------------------------------------------
const DIAGNOSTIC_DOWNLOADS_KEY = "greenValleyDiagnosticDownloads";
const DIAGNOSTIC_LAST_KEY = "greenValleyLastDiagnostics";

(async () => {
  try {
    const stored = await chrome.storage.local.get(DIAGNOSTIC_DOWNLOADS_KEY);
    $("#diagnostic-downloads").checked = stored?.[DIAGNOSTIC_DOWNLOADS_KEY] === true;
  } catch (_error) {
    $("#diagnostic-downloads").checked = false;
  }
})();

$("#diagnostic-downloads").addEventListener("change", async event => {
  const enabled = event.target.checked === true;
  try {
    await chrome.storage.local.set({ [DIAGNOSTIC_DOWNLOADS_KEY]: enabled });
    $("#status").textContent = enabled
      ? "Diagnostics will be saved to Downloads on every capture."
      : "Diagnostics are no longer written to Downloads. They are still kept inside the extension.";
  } catch (error) {
    $("#status").textContent = `Could not save that setting: ${error.message}`;
  }
});

$("#save-last-diagnostics").addEventListener("click", async () => {
  try {
    const stored = await chrome.storage.local.get(DIAGNOSTIC_LAST_KEY);
    const kept = Array.isArray(stored?.[DIAGNOSTIC_LAST_KEY]) ? stored[DIAGNOSTIC_LAST_KEY] : [];
    if (!kept.length) { $("#status").textContent = "No diagnostics have been captured yet."; return; }
    const blobUrl = URL.createObjectURL(new Blob([JSON.stringify(kept, null, 2)], { type: "application/json" }));
    await chrome.downloads.download({ url: blobUrl, filename: "green_valley_aspire_last_diagnostics.json", saveAs: false });
    $("#status").textContent = `Saved the last ${kept.length} capture(s) to Downloads.`;
    setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);
  } catch (error) {
    $("#status").textContent = `Could not save the diagnostics: ${error.message}`;
  }
});

$("#preview").addEventListener("click", async () => {
  const account = $("#account").value.trim(); const symbol = $("#symbol").value.trim().toUpperCase(); const side = $("#side").value; const quantity = Number($("#quantity").value); const price = Number($("#price").value); const validity = $("#validity").value; const settlement = $("#settlement").value;
  if (!account || !symbol || !Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(price) || price <= 0) { executionState("Enter account, symbol, positive quantity, and positive limit price."); return; }
  const planId = newId(); const confirmationPhrase = `CONFIRM ${planId} ${side} ${symbol} ${quantity} @ ${price}`;
  guardedPlan = { schemaVersion: 1, mode: "USER_CONFIRMED_EXECUTION", kind: "NEW_ORDER", planId, createdAt: new Date().toISOString(), sources: [], targets: [{ account, symbol, side, quantity, price, validity, settlement }], confirmationPhrase };
  try {
    await chrome.storage.session.set({ gvGuardedPlan: guardedPlan });
    showPlan(guardedPlan, "Preview created. Fill the Aspire ticket from this preview; no order is submitted.");
  } catch (_error) {
    guardedPlan = null; executionState("Preview storage failed. No ticket fill or order action is available.");
  }
});

$("#populate").addEventListener("click", async () => {
  if (!guardedPlan || emergencyStop) return;
  try {
    const tab = await activeTab();
    const result = await sendReadOnlyBridgeMessage(tab, { type: "GREEN_VALLEY_ARM_TICKET_FILL", plan: guardedPlan, emergencyStop });
    if (!result?.ok) throw new Error(result?.reason || "Could not arm Ticket fill.");
    executionState("Armed for 20 seconds. This popup closes; open Aspire New Buy Order now. Ticket fill only—no order is submitted.");
    setTimeout(() => window.close(), 650);
  } catch (error) {
    executionState(`Ticket fill arm blocked: ${error.message}. No action was sent.`);
  }
});

$("#prepare-confirmation").addEventListener("click", async () => {
  if (!guardedPlan || emergencyStop) return;
  try {
    if (singleButtonPhase === "FINAL_CONFIRMATION_READY") {
      const confirmationPhrase = $("#confirmation").value.trim();
      if (!sponsorModeEnabled && confirmationPhrase !== guardedPlan.confirmationPhrase) { executionState("The exact confirmation phrase does not match this preview."); return; }
      const tab = await activeTab();
      const result = await chrome.tabs.sendMessage(tab.id, { type: "GREEN_VALLEY_EXECUTE_GUARDED_PLAN", plan: guardedPlan, confirmationPhrase, emergencyStop, sponsorMode: sponsorModeEnabled });
      if (!result?.ok) { executionState(`Execution stopped: ${result?.reason || "unknown result"}.`); return; }
      await chrome.storage.session.remove("gvGuardedPlan");
      guardedPlan = null; setSingleButtonPhase("PREPARE"); $("#prepare-confirmation").disabled = true;
      executionState(`Order verified for plan ${result.planId}. Open Orders post-check passed.`);
      return;
    }
    const tab = await activeTab();
    if (sponsorModeEnabled) {
      const result = await sendReadOnlyBridgeMessage(tab, { type: "GREEN_VALLEY_ARM_SPONSOR_ONE_TAP", plan: guardedPlan, emergencyStop });
      if (!result?.ok) throw new Error(result?.reason || "Could not arm One-Tap Sponsor Mode.");
      executionState("One-Tap Sponsor Mode armed. This popup closes; Aspire preparation, confirmation, submit, and Open Orders check run as one verified flow.");
      setTimeout(() => window.close(), 650);
      return;
    }
    const result = await sendReadOnlyBridgeMessage(tab, { type: "GREEN_VALLEY_ARM_PREVIEW_TO_CONFIRMATION", plan: guardedPlan, emergencyStop });
    if (!result?.ok) throw new Error(result?.reason || "Could not arm preview-to-confirmation workflow.");
    executionState("Armed for 20 seconds. This popup closes; the extension opens New Order, fills the preview, and opens confirmation only.");
    setTimeout(() => window.close(), 650);
  } catch (error) {
    executionState(`Preview-to-confirmation blocked: ${error.message}. No action was sent.`);
  }
});

$("#open-confirmation").addEventListener("click", async () => {
  if (!guardedPlan || emergencyStop) return;
  try {
    const tab = await activeTab();
    const result = await sendReadOnlyBridgeMessage(tab, { type: "GREEN_VALLEY_ARM_FIRST_STAGE_CONFIRMATION", plan: guardedPlan, emergencyStop });
    if (!result?.ok) throw new Error(result?.reason || "Could not arm first-stage confirmation.");
    executionState("Armed for 20 seconds. This popup closes; return to Aspire. The extension opens the confirmation dialog only, never the final confirmation.");
    setTimeout(() => window.close(), 650);
  } catch (error) {
    executionState(`First-stage confirmation blocked: ${error.message}. No action was sent.`);
  }
});

$("#validate").addEventListener("click", async () => {
  if (!guardedPlan || emergencyStop) return;
  const tab = await activeTab(); const result = await sendReadOnlyBridgeMessage(tab, { type: "GREEN_VALLEY_VALIDATE_VISIBLE_CONFIRMATION", plan: guardedPlan });
  if (!result?.ok) { executionState(`Confirmation validation blocked: ${result?.reason || "unknown error"}. No action was sent.`); return; }
  $("#confirmation").disabled = true; $("#execute").disabled = true; executionState(`Confirmation dialog matches ${guardedPlan.targets[0].side}. Final program submit remains locked pending post-check mapping.`);
});

$("#execute").addEventListener("click", async () => {
  if (!guardedPlan || emergencyStop) { executionState("Emergency Stop is active or no plan is present."); return; }
  const confirmationPhrase = $("#confirmation").value.trim(); if (confirmationPhrase !== guardedPlan.confirmationPhrase) { executionState("The exact confirmation phrase does not match this preview."); return; }
  const tab = await activeTab(); const result = await chrome.tabs.sendMessage(tab.id, { type: "GREEN_VALLEY_EXECUTE_GUARDED_PLAN", plan: guardedPlan, confirmationPhrase, emergencyStop });
  executionState(result?.ok ? `Order verified for plan ${guardedPlan.planId}.` : `Execution stopped: ${result?.reason || "unknown result"}.`); if (!result?.ok) $("#execute").disabled = true;
});

$("#stop").addEventListener("click", async () => { emergencyStop = !emergencyStop; $("#stop").textContent = emergencyStop ? "STOPPED — Reset local lock" : "EMERGENCY STOP"; $("#execute").disabled = emergencyStop || !guardedPlan; if (emergencyStop) { await chrome.storage.session.remove("gvGuardedPlan"); guardedPlan = null; $("#prepare-confirmation").disabled = true; $("#populate").disabled = true; $("#open-confirmation").disabled = true; $("#validate").disabled = true; } executionState(emergencyStop ? "Emergency Stop active. The guarded plan was cleared and no order may be sent." : "Emergency Stop reset. Create a new preview before any validation."); });
