(() => {
  const rejected = reason => ({ ok: false, mode: "LOCKED", reason });
  const config = () => window.GreenValleyAspireExecutionSelectors || {};
  const find = candidates => (Array.isArray(candidates) ? candidates.map(selector => document.querySelector(selector)).find(Boolean) : null);
  const findAll = candidates => (Array.isArray(candidates) ? candidates.flatMap(selector => [...document.querySelectorAll(selector)]) : []);
  const isVisible = element => Boolean(element && element.getClientRects().length && [...element.getClientRects()].some(rect => rect.width > 0 && rect.height > 0));
  const findVisible = candidates => findAll(candidates).find(isVisible) || find(candidates);
  const findTicketRoot = selectors => findAll(selectors.root).find(isVisible) || null;
  const findTicketAll = (root, candidates) => (root && Array.isArray(candidates) ? candidates.flatMap(selector => [...root.querySelectorAll(selector)]) : []);
  const findTicketVisible = (root, candidates) => findTicketAll(root, candidates).find(isVisible) || null;
  const ticketGateState = (selectors, root) => ({
    rootCandidates: findAll(selectors.root).map(element => ({ visible: isVisible(element), id: element.id || "", className: String(element.className || "") })),
    visibleRootFound: Boolean(root),
    fields: ["symbolInput", "accountInput", "quantityInput", "orderTypeInput", "priceInput", "validityInputs"].map(name => ({
      name,
      total: findTicketAll(root, selectors[name]).length,
      visible: findTicketAll(root, selectors[name]).filter(isVisible).length
    }))
  });
  const emitTicketDiagnostic = (mode, extra = {}) => {
    try {
      const report = window.GreenValleyTicketDiagnosticReport?.(mode);
      if (report) chrome.runtime.sendMessage({ type: "GREEN_VALLEY_TICKET_DIAGNOSTIC_READY", report: { ...report, ...extra } });
    } catch (_diagnosticError) {}
  };
  const allPresent = (values) => values.every(values => find(values));
  // The native value setter must come from the element's own interface. Applying
  // HTMLInputElement's setter to a <select> throws "Illegal invocation" in
  // Chromium, which is how account selection failed silently before 0.4.7.
  const nativeValueSetter = element => {
    const interfaces = [
      [typeof HTMLSelectElement !== "undefined" ? HTMLSelectElement : null, HTMLSelectElement],
      [typeof HTMLTextAreaElement !== "undefined" ? HTMLTextAreaElement : null, HTMLTextAreaElement],
      [typeof HTMLInputElement !== "undefined" ? HTMLInputElement : null, HTMLInputElement]
    ];
    for (const [available, constructor] of interfaces) {
      if (available && element instanceof constructor) return Object.getOwnPropertyDescriptor(constructor.prototype, "value")?.set || null;
    }
    return Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), "value")?.set || null;
  };
  const setValue = (element, value) => {
    const setter = nativeValueSetter(element);
    // A refused setter must never abort the guarded flow; plain assignment still
    // lets the verification step below catch a value Aspire did not accept.
    try {
      if (setter) setter.call(element, String(value)); else element.value = String(value);
    } catch (_setterError) {
      element.value = String(value);
    }
    const inputEvent = typeof InputEvent === "function"
      ? new InputEvent("input", { bubbles: true, data: String(value), inputType: "insertText" })
      : new Event("input", { bubbles: true });
    element.dispatchEvent(inputEvent);
    element.dispatchEvent(new Event("change", { bubbles: true }));
  };
  const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
  const normalize = value => String(value ?? "").trim().toLowerCase();
  const symbolMatchesExpectedCode = (observed, expected) => {
    const wanted = normalize(expected);
    const display = normalize(observed);
    return display === wanted || display.startsWith(`${wanted} /`);
  };
  const ticketSideLabels = { BUY: ["شراء", "buy"], SELL: ["بيع", "sell"] };
  // NORMAL ("عادي") is the settlement Aspire offers when no T+ period applies.
  const settlementValues = new Set(["T+0", "T+1", "T+2", "NORMAL"]);
  const settlementOptionLabels = { NORMAL: ["عادي", "عادى", "normal"] };
  const directText = node => String([...(node?.childNodes || [])]
    .filter(child => child.nodeType === Node.TEXT_NODE)
    .map(child => child.textContent)
    .join(" ")).trim();
  const rgbChannels = value => {
    const match = String(value || "").match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
    return match ? { r: Number(match[1]), g: Number(match[2]), b: Number(match[3]) } : null;
  };
  // A selected SELL control is painted a strong red. Matching one exact colour
  // string breaks on any theme change, so the check asserts the property that
  // actually distinguishes it from an unselected control and from selected BUY
  // (which is green): red clearly dominant over both other channels.
  const isSelectedSellColour = value => {
    const channels = rgbChannels(value);
    return Boolean(channels && channels.r >= 170 && channels.r - channels.g >= 50 && channels.r - channels.b >= 50);
  };
  const emitSideSelectionDiagnostic = (root, side, selectors, control) => {
    const clean = value => String(value || "").replace(/\s+/g, " ").trim();
    const describeSide = node => ({
      tag: node.tagName,
      className: String(node.className || ""),
      directText: clean(directText(node)),
      role: node.getAttribute("role") || "",
      ariaPressed: node.getAttribute("aria-pressed") || "",
      ariaSelected: node.getAttribute("aria-selected") || "",
      backgroundColor: String(getComputedStyle(node).backgroundColor || ""),
      color: String(getComputedStyle(node).color || ""),
      isTargetControl: node === control,
      visible: isVisible(node)
    });
    const candidates = root
      ? [...root.querySelectorAll("*")]
          .filter(node => isVisible(node) && [...ticketSideLabels.BUY, ...ticketSideLabels.SELL].includes(normalize(directText(node))))
          .slice(0, 20)
          .map(describeSide)
      : [];
    chrome.runtime.sendMessage({ type: "GREEN_VALLEY_SIDE_SELECTION_DIAGNOSTIC", report: {
      ok: false,
      mode: "READ_ONLY_SIDE_SELECTION_DIAGNOSTIC",
      capturedAt: new Date().toISOString(),
      requestedSide: side,
      sideCandidates: candidates
    } });
  };
  const selectTicketSide = async (root, side, selectors) => {
    if (side === "BUY") return;
    if (side === "SELL") {
      const control = findTicketAll(root, selectors.sellSide)
        .filter(isVisible)
        .find(node => ticketSideLabels.SELL.includes(normalize(directText(node) || node.textContent)));
      if (!control) throw new Error("TICKET_SIDE_CONTROL_NOT_FOUND_SELL");
      control.click();
      // React repaints the selected state after the click, so the verification
      // must wait for it instead of reading the colour on the same frame.
      const deadline = Date.now() + 2000;
      while (Date.now() < deadline) {
        if (isSelectedSellColour(getComputedStyle(control).backgroundColor)) return;
        await sleep(120);
      }
      // Never fall back to BUY silently: stop, and record what the control showed.
      emitSideSelectionDiagnostic(root, side, selectors, control);
      throw new Error("SELL_SIDE_SELECTION_NOT_VERIFIED");
    }
    const wanted = ticketSideLabels[side];
    const dedicatedCandidates = findTicketAll(root, selectors.sellSide).filter(isVisible);
    const fallbackCandidates = [...root.querySelectorAll('[tabindex="3"]')].filter(isVisible);
    const control = wanted && [...dedicatedCandidates, ...fallbackCandidates].find(node => wanted.includes(normalize(directText(node) || node.textContent)));
    if (!control) throw new Error("TICKET_SIDE_CONTROL_NOT_FOUND_SELL");
    control.click();
  };
  // Aspire renders the settlement control with inconsistent spacing, an Arabic
  // "ت" instead of "T", and Arabic-Indic digits depending on the ticket locale.
  // Normalisation keeps the user-authored plan value authoritative while still
  // matching the visible control.
  const normalizeSettlementLabel = value => String(value ?? "")
    .replace(/[\u064B-\u0652\u200e\u200f\u061C]/g, "")
    .replace(/[\u0660-\u0669]/g, digit => String(digit.charCodeAt(0) - 0x0660))
    .replace(/[\u06F0-\u06F9]/g, digit => String(digit.charCodeAt(0) - 0x06F0))
    .replace(/\s+/g, "")
    .replace(/[\u062a\u0637]/g, "t")
    .toLowerCase();
  // The real settlement control is Aspire's "التسوية" group of T+0/T+1/T+2
  // controls, which renders on SELL tickets only. It is NOT "طريقة التنفيذ"
  // (execution method, "عادي") — those are two separate fields, and confusing
  // them left التسوية unset, which Aspire refuses in silence.
  const isTPlusLabel = value => /^t\s*\+\s*[0-2]$/i.test(String(value || "").trim()) || /^\u062a\s*\+\s*[0-2]$/.test(String(value || "").trim());
  const settlementCandidates = (root, selectors) => {
    const scoped = findTicketAll(root, selectors.settlementButtons);
    const fallback = root ? [...root.querySelectorAll("button, [role='button'], [role='radio'], label, span, div")] : [];
    return [...new Set([...scoped, ...fallback])]
      .filter(isVisible)
      .filter(node => isTPlusLabel(directText(node) || node.textContent));
  };
  // A select counts as the settlement control only when it actually offers a
  // T+ period. A select whose sole option is "عادي" is the execution method.
  const tPlusSelect = (root, selectors) => findTicketAll(root, selectors.settlementSelects)
    .filter(isVisible)
    .find(select => [...select.options].some(option => isTPlusLabel(option.text))) || null;
  const settlementOptionMatches = (option, settlement) => {
    const labels = settlementOptionLabels[settlement];
    const text = normalizeSettlementLabel(option.text);
    if (labels) return labels.map(normalizeSettlementLabel).includes(text);
    return text === normalizeSettlementLabel(settlement);
  };
  // The settlement select is the one offering "عادي" or an explicit T+ period —
  // never the validity select, which offers اليوم / صالح حتى الغائه.
  // "طريقة التنفيذ" — the execution-method select ("عادي"). Kept for evidence
  // only; it is NOT the settlement field.
  const executionMethodSelect = (root, selectors) => findTicketAll(root, selectors.settlementSelects)
    .filter(isVisible)
    .find(select => {
      const texts = [...select.options].map(option => normalizeSettlementLabel(option.text));
      const looksLikeValidity = texts.some(text => /اليوم|صالححتى|تنفيذجزء|التنفيذأوالإلغاء/.test(text));
      const looksLikeSettlement = texts.some(text => /^t\+[0-2]$/.test(text) || /^عاد[يى]$/.test(text));
      return looksLikeSettlement && !looksLikeValidity;
    }) || null;
  const settlementSelectOptions = (root, selectors) => {
    const select = executionMethodSelect(root, selectors);
    return select ? [...select.options].map(option => ({ text: String(option.text || "").trim(), value: String(option.value || "") })) : [];
  };
  // Aspire renders the settlement row only after its "أظهر المزيد" expander is
  // opened. Until then the ticket exposes no T+ control at all.
  const expandLabels = ["أظهر المزيد", "اظهر المزيد", "المزيد", "show more"];
  const expandCandidates = (root, selectors) => [...new Set([
    ...findTicketAll(root, selectors.expandMore),
    ...(root ? [...root.querySelectorAll("button")] : [])
  ])].filter(node => isVisible(node) && !node.disabled && expandLabels.includes(normalize(directText(node) || node.textContent)));
  const emitSettlementDiagnostic = (root, wanted, selectors, expandedCount = 0) => {
    const clean = value => String(value || "").replace(/\s+/g, " ").trim();
    const describeButton = node => ({
      text: clean(node.textContent).slice(0, 120),
      normalized: normalizeSettlementLabel(directText(node) || node.textContent),
      className: String(node.className || ""),
      visible: isVisible(node),
      disabled: Boolean(node.disabled)
    });
    // The settlement control is not a button in every Aspire build. Capture every
    // form control and every element whose own text mentions a settlement period,
    // so the real control can be identified without another guess.
    const describeControl = node => ({
      tag: node.tagName,
      id: node.id || "",
      name: node.getAttribute("name") || "",
      type: node.getAttribute("type") || "",
      role: node.getAttribute("role") || "",
      className: String(node.className || ""),
      visible: isVisible(node),
      disabled: Boolean(node.disabled),
      checked: Boolean(node.checked),
      value: clean(node.value),
      ariaLabel: clean(node.getAttribute("aria-label")),
      title: clean(node.getAttribute("title")),
      text: clean(directText(node) || node.textContent).slice(0, 100),
      options: node.tagName === "SELECT" ? [...node.options].map(option => ({ text: clean(option.text), value: clean(option.value), selected: Boolean(option.selected) })) : undefined
    });
    const settlementPattern = /t\s*\+\s*[0-2]|\u062a\s*\+\s*[0-2]|تسوية|التسوية|السداد|فترة/i;
    const settlementTextMatches = root
      ? [...root.querySelectorAll("*")]
          .filter(node => isVisible(node) && settlementPattern.test(clean(directText(node))))
          .slice(0, 40)
          .map(node => ({
            tag: node.tagName,
            id: node.id || "",
            className: String(node.className || ""),
            role: node.getAttribute("role") || "",
            directText: clean(directText(node)).slice(0, 120),
            parentTag: node.parentElement?.tagName || "",
            parentClassName: String(node.parentElement?.className || "")
          }))
      : [];
    const roots = findAll(selectors.root).map((node, index) => ({
      index,
      id: node.id || "",
      className: String(node.className || ""),
      visible: isVisible(node),
      isActiveRoot: node === root,
      symbolValues: [...node.querySelectorAll((selectors.symbolInput || []).join(",") || "input")].map(input => String(input.value || "")),
      settlementButtons: [...node.querySelectorAll((selectors.settlementButtons || []).join(",") || "button.SettelmentTypeBtn")].map(describeButton),
      allButtons: [...node.querySelectorAll("button")].filter(isVisible).slice(0, 60).map(describeButton)
    }));
    chrome.runtime.sendMessage({ type: "GREEN_VALLEY_SETTLEMENT_DIAGNOSTIC", report: {
      ok: false,
      mode: "READ_ONLY_SETTLEMENT_DIAGNOSTIC",
      capturedAt: new Date().toISOString(),
      wanted,
      expandersOpened: expandedCount,
      expandersAvailable: expandCandidates(root, selectors).length,
      rootCount: roots.length,
      roots,
      settlementTextMatches,
      tPlusControls: settlementCandidates(root, selectors).map(node => ({
        label: String(directText(node) || node.textContent).trim(),
        className: String(node.className || ""),
        backgroundColor: String(getComputedStyle(node).backgroundColor || ""),
        ariaPressed: node.getAttribute("aria-pressed") || "",
        ariaSelected: node.getAttribute("aria-selected") || ""
      })),
      tPlusSelectFound: Boolean(tPlusSelect(root, selectors)),
      executionMethodSelectFound: Boolean(executionMethodSelect(root, selectors)),
      executionMethodOptions: settlementSelectOptions(root, selectors),
      formControls: root ? [...root.querySelectorAll("input, select, textarea, [role='radio'], [role='tab'], [role='option']")].filter(isVisible).slice(0, 80).map(describeControl) : [],
      rootText: root ? clean(root.innerText || root.textContent).slice(0, 4000) : ""
    } });
  };
  // Aspire gives no attribute that reliably means "this settlement is chosen",
  // so selection is verified by comparison: after the click the chosen control
  // must either look different from how it looked before, or differ from its
  // unselected siblings. A click React dropped leaves all three identical.
  const settlementFingerprint = node => [
    String(node.className || ""),
    String(getComputedStyle(node).backgroundColor || ""),
    String(getComputedStyle(node).color || ""),
    node.getAttribute("aria-pressed") || "",
    node.getAttribute("aria-selected") || ""
  ].join("|");
  const settlementLooksSelected = (control, before, root, selectors) => {
    const now = settlementFingerprint(control);
    if (now !== before) return true;
    const siblings = settlementCandidates(root, selectors).filter(node => node !== control);
    return siblings.length > 0 && siblings.every(node => settlementFingerprint(node) !== now);
  };
  async function clickSettlementControl(control, root, selectors) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const before = settlementFingerprint(control);
      control.click();
      const deadline = Date.now() + 1200;
      while (Date.now() < deadline) {
        if (settlementLooksSelected(control, before, root, selectors)) return true;
        await sleep(120);
      }
    }
    return false;
  }

  async function selectSettlement(root, settlement, selectors, timeoutMs = 6000) {
    const wanted = String(settlement || "").toUpperCase();
    const target = normalizeSettlementLabel(wanted);
    const opened = [];
    const tPlusControls = () => settlementCandidates(root, selectors);
    let unverifiedSelection = false;
    const applyTPlus = async () => {
      const control = tPlusControls().find(node => normalizeSettlementLabel(directText(node) || node.textContent) === target);
      if (control) {
        if (await clickSettlementControl(control, root, selectors)) return true;
        // The control exists but the click never registered. Never continue:
        // Aspire refuses an unset settlement silently, with no dialog at all.
        unverifiedSelection = true;
        return false;
      }
      const select = tPlusSelect(root, selectors);
      const option = select ? [...select.options].find(candidate => normalizeSettlementLabel(candidate.text) === target) : null;
      if (option) {
        setValue(select, option.value);
        return normalizeSettlementLabel(select.options[select.selectedIndex]?.text) === target;
      }
      return false;
    };
    const applyNormal = () => {
      // NORMAL means "this ticket exposes no settlement period". If Aspire is
      // showing one, the user must author it — never assume on their behalf.
      const offered = tPlusControls().map(node => String(directText(node) || node.textContent).trim());
      const select = tPlusSelect(root, selectors);
      const offeredFromSelect = select ? [...select.options].map(option => String(option.text || "").trim()).filter(isTPlusLabel) : [];
      const available = [...new Set([...offered, ...offeredFromSelect])];
      if (available.length) {
        emitSettlementDiagnostic(root, wanted, selectors, opened.length);
        throw new Error(`TICKET_SETTLEMENT_REQUIRES_EXPLICIT_PERIOD_AVAILABLE_${available.join(" | ")}`);
      }
      return true;
    };
    const tryApply = async () => (wanted === "NORMAL" ? applyNormal() : applyTPlus());
    const waitFor = async milliseconds => {
      const end = Date.now() + milliseconds;
      while (Date.now() < end) {
        if (await tryApply()) return true;
        await sleep(150);
      }
      return false;
    };
    // 1. Use the ticket exactly as the user left it.
    if (await waitFor(1500)) return;
    // 2. Only then open one collapsed section at a time, closing again any
    //    section that did not reveal the settlement.
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const expander = expandCandidates(root, selectors).find(node => !opened.includes(node));
      if (!expander) break;
      opened.push(expander);
      expander.click();
      await sleep(300);
      if (await waitFor(600)) return;
      expander.click();
      await sleep(200);
    }
    emitSettlementDiagnostic(root, wanted, selectors, opened.length);
    const select = tPlusSelect(root, selectors);
    const available = [
      ...tPlusControls().map(node => String(directText(node) || node.textContent).trim()),
      ...(select ? [...select.options].map(option => String(option.text || "").trim()) : [])
    ].filter(Boolean).join(" | ");
    if (unverifiedSelection) throw new Error(`TICKET_SETTLEMENT_SELECTION_NOT_VERIFIED_${wanted}`);
    throw new Error(available
      ? `TICKET_SETTLEMENT_OPTION_NOT_OFFERED_${wanted}_AVAILABLE_${available}`
      : `TICKET_SETTLEMENT_CONTROL_NOT_FOUND_${wanted || "EMPTY"}`);
  }

  // Aspire can keep several #orderEntryDropdown instances mounted at once. The
  // ticket that actually accepted the user-authored symbol is the only valid
  // root; re-resolving blindly can jump into an empty duplicate.
  const resolveActiveRoot = (previousRoot, selectors, symbol) => {
    const roots = findAll(selectors.root).filter(isVisible);
    const matching = roots.find(candidate => {
      const input = [...candidate.querySelectorAll((selectors.symbolInput || []).join(",") || "input")].find(isVisible);
      return input && symbolMatchesExpectedCode(String(input.value || ""), symbol);
    });
    if (matching) return matching;
    if (previousRoot && previousRoot.isConnected && isVisible(previousRoot)) return previousRoot;
    return roots[0] || previousRoot || null;
  };
  const confirmationText = dialog => String(dialog?.textContent || "").replace(/\s+/g, " ").trim();
  const readConfirmationDialog = () => {
    const selectors = config().ticket || {};
    const dialog = findVisible(selectors.confirmationDialog);
    if (!dialog) return null;
    return {
      dialog,
      text: confirmationText(dialog),
      confirmButton: findAll(selectors.confirmationSubmit).filter(isVisible).find(button => dialog.contains(button)) || null,
      editButton: findAll(selectors.confirmationEdit).filter(isVisible).find(button => dialog.contains(button)) || null
    };
  };
  const confirmationMatchesTarget = target => {
    const confirmation = readConfirmationDialog();
    if (!confirmation || !confirmation.confirmButton || !confirmation.editButton) return rejected("TICKET_CONFIRMATION_DIALOG_NOT_FOUND");
    const text = normalize(confirmation.text);
    const sideWords = ticketSideLabels[target.side] || [];
    if (!sideWords.some(word => text.includes(normalize(word)))) return rejected("TICKET_CONFIRMATION_SIDE_MISMATCH");
    const price = Number(target.price);
    const priceTokens = [String(price), price.toFixed(3)].map(normalize);
    const validityWords = target.validity === "DAY" ? ["اليوم", "day"] : ["صالح حتى الغائه", "gtc"];
    const required = [
      normalize(target.account),
      String(Number(target.quantity)),
      ...validityWords.map(normalize)
    ];
    const hasAccount = text.includes(normalize(target.account));
    const hasQuantity = text.includes(String(Number(target.quantity)));
    const hasPrice = priceTokens.some(token => text.includes(token));
    const hasLimit = /محدد|limit/.test(text);
    const hasValidity = validityWords.some(word => text.includes(normalize(word)));
    const explicitSettlementTokens = [...new Set([...confirmation.text.matchAll(/T\s*\+\s*([012])/gi)].map(match => `T+${match[1]}`))];
    // Aspire sometimes omits settlement from the confirmation copy. Absence is
    // not treated as a mismatch, but any explicitly shown settlement must
    // equal the plan authored by the user.
    // For a NORMAL ("عادي") plan any explicitly displayed T+ period is a conflict.
    const hasSettlement = !explicitSettlementTokens.length || explicitSettlementTokens.includes(target.settlement);
    if (!hasSettlement) {
      chrome.runtime.sendMessage({
        type: "GREEN_VALLEY_CONFIRMATION_SETTLEMENT_MISMATCH",
        target: { side: target.side, symbol: target.symbol, settlement: target.settlement, quantity: Number(target.quantity), price: Number(target.price) },
        confirmation: {
          text: confirmation.text,
          confirmButton: confirmation.confirmButton ? { text: String(confirmation.confirmButton.textContent || "").trim(), disabled: Boolean(confirmation.confirmButton.disabled), className: String(confirmation.confirmButton.className || "") } : null,
          editButton: confirmation.editButton ? { text: String(confirmation.editButton.textContent || "").trim(), disabled: Boolean(confirmation.editButton.disabled), className: String(confirmation.editButton.className || "") } : null
        }
      });
      return rejected("TICKET_CONFIRMATION_SETTLEMENT_MISMATCH");
    }
    if (!hasAccount || !hasQuantity || !hasPrice || !hasLimit || !hasValidity) return rejected("TICKET_CONFIRMATION_VALUE_MISMATCH");
    return { ok: true, mode: "CONFIRMATION_VERIFIED_NOT_SUBMITTED", confirmation: { text: confirmation.text, confirmLabel: confirmation.confirmButton.textContent?.trim() || "", editLabel: confirmation.editButton.textContent?.trim() || "" } };
  };
  const ticketMatchesTarget = (ticket, target) => normalize(ticket.account).includes(normalize(target.account))
    && symbolMatchesExpectedCode(ticket.symbol, target.symbol)
    && ticket.quantity === Number(target.quantity)
    && ticket.price === Number(target.price)
    && /محدد|limit/i.test(ticket.orderType)
    && (target.validity === "DAY" ? /اليوم|day/i.test(ticket.validity) : /صالح حتى الغائه|gtc/i.test(ticket.validity));
  const firstStageMismatchedFields = (ticket, target) => [
    !normalize(ticket.account).includes(normalize(target.account)) && "account",
    !symbolMatchesExpectedCode(ticket.symbol, target.symbol) && "symbol",
    ticket.quantity !== Number(target.quantity) && "quantity",
    ticket.price !== Number(target.price) && "price",
    !/محدد|limit/i.test(ticket.orderType) && "orderType",
    !(target.validity === "DAY" ? /اليوم|day/i.test(ticket.validity) : /صالح حتى الغائه|gtc/i.test(ticket.validity)) && "validity"
  ].filter(Boolean);
  const emitFirstStageTicketMismatch = (target, observedTicket) => {
    chrome.runtime.sendMessage({
      type: "GREEN_VALLEY_FIRST_STAGE_TICKET_MISMATCH",
      expectedTicket: { account: target.account, symbol: target.symbol, quantity: Number(target.quantity), price: Number(target.price), validity: target.validity, side: target.side },
      observedTicket,
      firstStageMismatchedFields: firstStageMismatchedFields(observedTicket, target)
    });
  };
  const emitFirstStageDialogMissing = (root, selectors) => {
    const submitButtons = findAll(selectors.submit).filter(button => root?.contains(button)).map(button => ({
      text: String(button.textContent || "").replace(/\s+/g, " ").trim(), className: String(button.className || ""), disabled: Boolean(button.disabled), visible: isVisible(button)
    }));
    const dialogCandidates = [...document.querySelectorAll("[role='dialog'], .custom-popup, .modal, .modal-dialog, .swal2-container, [class*='popup']")]
      .filter(isVisible).slice(0, 25).map(node => ({ tag: node.tagName, className: String(node.className || ""), text: String(node.textContent || "").replace(/\s+/g, " ").trim().slice(0, 500) }));
    const active = document.activeElement;
    chrome.runtime.sendMessage({ type: "GREEN_VALLEY_FIRST_STAGE_DIALOG_MISSING", submitButtons, dialogCandidates, visibleNoticeTexts: visibleNoticeTexts(), accountState: ticketAccountState(root), ticket: readTicket(root), settlement: (() => {
      const ticketSelectors = config().ticket || {};
      const select = executionMethodSelect(root, ticketSelectors);
      const selected = select ? select.options[select.selectedIndex] || null : null;
      return {
        tPlusControls: settlementCandidates(root, ticketSelectors).map(node => ({
          label: String(directText(node) || node.textContent).trim(),
          className: String(node.className || ""),
          backgroundColor: String(getComputedStyle(node).backgroundColor || ""),
          ariaPressed: node.getAttribute("aria-pressed") || "",
          ariaSelected: node.getAttribute("aria-selected") || ""
        })),
        executionMethodFound: Boolean(select),
        executionMethodSelectedText: String(selected?.text || "").trim(),
        executionMethodOptions: select ? [...select.options].map(option => ({ text: String(option.text || "").trim(), value: String(option.value || ""), selected: Boolean(option.selected) })) : []
      };
    })(), rootText: String(root?.innerText || root?.textContent || "").replace(/\s+/g, " ").trim().slice(0, 4000), activeElement: active ? { tag: active.tagName, id: active.id || "", className: String(active.className || "") } : null });
  };
  const noticeText = node => String(node?.textContent || "").replace(/\s+/g, " ").trim();
  // Every visible notice-shaped element, whatever it says. Used as evidence only.
  const visibleNoticeTexts = () => {
    const seen = new Set();
    return [...document.querySelectorAll("[role='alert'], .toast, .toast-message, .alert, .notification, .message, [class*='toast'], [class*='alert'], [class*='notification'], [class*='error']")]
      .filter(isVisible)
      .map(noticeText)
      .filter(text => text && text.length <= 1000 && !seen.has(text) && seen.add(text))
      .slice(0, 20);
  };
  // Only explicit refusal wording counts. Bare words such as "رصيد" or "مراجعة"
  // appear in ordinary Aspire field labels — treating them as rejections
  // reported "الرصيد المتوفر" as a broker refusal and hid the real cause.
  const brokerWarningPattern = /غير مسموح|لا يمكن|غير مسموح به|غير كاف|لا يوجد رصيد|رصيد غير|مرفوض|تم الرفض|فشل|تجاوز الحد|يرجى المراجعة|حدث خطأ|خطأ في|error|invalid|insufficient|not allowed|rejected|failed/i;
  // A container whose class merely contains "alert" is not a rejection: a page
  // badge reading "1" was once reported as one, which hid the real cause of a
  // missing confirmation dialog. A rejection must carry actual warning wording.
  const isBrokerWarningText = text => text.length >= 8 && text.length <= 1000 && brokerWarningPattern.test(text);
  // Aspire prints the account's live capacity in the ticket header. When it
  // refuses an order in silence, this is almost always the reason — so read it
  // and say so, instead of reporting a missing dialog the user cannot act on.
  const numberAfterLabel = (text, label) => {
    const match = text.match(new RegExp(label + "\\s*([0-9][0-9.,]*)"));
    if (!match) return null;
    const value = Number(String(match[1]).replace(/,/g, ""));
    return Number.isFinite(value) ? value : null;
  };
  const ticketAccountState = root => {
    const text = String(root?.innerText || root?.textContent || "").replace(/\s+/g, " ");
    return {
      buyingPower: numberAfterLabel(text, "القوة الشرائية"),
      shareBalance: numberAfterLabel(text, "رصيد الاسهم")
    };
  };
  // Only an unambiguous zero is treated as an explanation. A parsing miss must
  // never block an order the account could actually place.
  const capacityRefusalReason = (root, target) => {
    const state = ticketAccountState(root);
    if (String(target.side).toUpperCase() === "BUY" && state.buyingPower === 0) {
      return "INSUFFICIENT_BUYING_POWER_ZERO";
    }
    if (String(target.side).toUpperCase() === "SELL" && state.shareBalance === 0) {
      return "NO_SHARES_AVAILABLE_TO_SELL";
    }
    return "";
  };

  const brokerRejectionMessages = () => {
    const seen = new Set();
    const candidates = [...document.querySelectorAll("[role='alert'], .toast, .toast-message, .alert, .notification, .message, [class*='toast'], [class*='alert'], [class*='notification'], [class*='error']")]
      .filter(isVisible)
      .concat([...document.querySelectorAll("body *")].filter(node => isVisible(node) && brokerWarningPattern.test(String(node.textContent || "")) && ![...node.children].some(child => brokerWarningPattern.test(String(child.textContent || "")))));
    return candidates.map(noticeText).filter(text => isBrokerWarningText(text) && !seen.has(text) && seen.add(text)).slice(0, 20);
  };
  const emitFirstStageBrokerRejection = (messages, root, selectors) => {
    const warningDialogCandidates = [...document.querySelectorAll("[role='dialog'], .custom-popup, .modal, .modal-dialog, .swal2-container, [class*='popup'], [class*='alert'], [class*='toast']")]
      .filter(isVisible)
      .map(node => ({
        tag: node.tagName,
        className: String(node.className || ""),
        text: String(node.textContent || "").replace(/\s+/g, " ").trim().slice(0, 1500),
        buttons: [...node.querySelectorAll("button")].filter(isVisible).map(button => ({ text: String(button.textContent || "").replace(/\s+/g, " ").trim(), disabled: Boolean(button.disabled), className: String(button.className || "") }))
      })).slice(0, 25);
    chrome.runtime.sendMessage({ type: "GREEN_VALLEY_FIRST_STAGE_BROKER_REJECTION", brokerRejectionMessages: messages, warningDialogCandidates, submitButtons: findAll(selectors.submit).filter(button => root?.contains(button)).map(button => ({ text: String(button.textContent || "").trim(), disabled: Boolean(button.disabled), visible: isVisible(button) })) });
  };
  const observeFirstStageClickDelivery = button => new Promise(resolve => {
    let settled = false;
    const finish = delivery => {
      if (settled) return;
      settled = true;
      document.removeEventListener("click", listener, true);
      chrome.runtime.sendMessage({ type: "GREEN_VALLEY_FIRST_STAGE_CLICK_DELIVERY", delivery });
      resolve(delivery);
    };
    const listener = event => finish({ delivered: true, isTrusted: Boolean(event.isTrusted), targetMatchesSubmit: event.target === button || button.contains(event.target), targetTag: event.target?.tagName || "", targetClassName: String(event.target?.className || "") });
    document.addEventListener("click", listener, true);
    setTimeout(() => finish({ delivered: false, isTrusted: false, targetMatchesSubmit: false, targetTag: "", targetClassName: "" }), 1200);
  });
  const symbolOptionCandidates = (searchRoot, optionSelectors) => [...searchRoot.querySelectorAll(optionSelectors)].filter(isVisible).map(node => ({
    tag: node.tagName, className: String(node.className || ""), value: String(node.getAttribute("value") || node.dataset?.value || ""), text: String(node.textContent || "").replace(/\s+/g, " ").trim(), ariaSelected: node.getAttribute("aria-selected") || ""
  }));
  const emitSymbolSelectionState = (phase, symbol, searchRoot, optionSelectors, selectedOption = null, attemptEvidence = null) => {
    const currentInput = searchRoot?.querySelector(".select-search__input");
    const selectors = config().ticket || {};
    // Aspire can leave an earlier ticket mounted. Record every candidate input so
    // a refused query can be traced to the exact widget that ignored it.
    const inputCandidates = symbolInputCandidates(selectors).map((input, index) => ({
      index,
      value: String(input.value || ""),
      disabled: Boolean(input.disabled),
      readOnly: Boolean(input.readOnly),
      isActiveElement: input === document.activeElement,
      isCurrentSearchRoot: Boolean(searchRoot && searchRoot.contains(input)),
      className: String(input.className || "")
    }));
    chrome.runtime.sendMessage({ type: "GREEN_VALLEY_SYMBOL_SELECTION_STATE", report: {
      ok: true, mode: "READ_ONLY_SYMBOL_SELECTION_STATE", phase, symbol, inputValue: String(currentInput?.value || ""), inputCandidateCount: inputCandidates.length, inputCandidates, attemptEvidence, selectedOption: selectedOption ? { value: String(selectedOption.getAttribute("value") || selectedOption.dataset?.value || ""), text: String(selectedOption.textContent || "").replace(/\s+/g, " ").trim() } : null, symbolOptionCandidates: symbolOptionCandidates(searchRoot, optionSelectors)
    } });
  };
  // Every visible search input inside every visible ticket root, in document order.
  const symbolInputCandidates = selectors => findAll(selectors.root)
    .filter(isVisible)
    .flatMap(root => findTicketAll(root, selectors.symbolInput))
    .filter(isVisible);

  async function applySymbolToInput(element, symbol, optionSelectors) {
    const searchRoot = element.closest("#custom-select-search");
    if (!searchRoot) throw new Error(`TICKET_SYMBOL_SEARCH_ROOT_NOT_FOUND_${symbol}`);
    element.focus();
    element.click();
    // React can discard the first programmatic query while it is still mounting
    // the search widget. Retry the authored symbol instead of failing on one frame.
    const attemptEvidence = [];
    const liveInput = () => searchRoot.querySelector(".select-search__input") || element;
    let applied = false;
    for (let attempt = 0; attempt < 5 && !applied; attempt += 1) {
      const record = { attempt, valueBefore: String(liveInput().value || "") };
      if (attempt < 2) {
        // Programmatic path first: it is the least invasive and has worked on
        // freshly mounted Aspire tickets.
        record.method = "NATIVE_SETTER";
        setValue(element, symbol);
        record.valueAfterWrite = String(element.value || "");
        element.dispatchEvent(new KeyboardEvent("keydown", { key: symbol.slice(-1), bubbles: true, cancelable: true }));
        element.dispatchEvent(new KeyboardEvent("keyup", { key: symbol.slice(-1), bubbles: true, cancelable: true }));
      } else {
        // React refused the programmatic query. Fall back to real keyboard input
        // through the same constrained path used for the exact symbol option.
        record.method = "TRUSTED_TYPING";
        const rect = element.getBoundingClientRect();
        const typed = await chrome.runtime.sendMessage({
          type: "GREEN_VALLEY_TRUSTED_SYMBOL_QUERY",
          intent: "TRUSTED_SYMBOL_QUERY_ONLY",
          symbol,
          point: { x: rect.left + (rect.width / 2), y: rect.top + (rect.height / 2) }
        });
        record.trusted = Boolean(typed?.ok);
        record.trustedReason = typed?.ok ? "" : String(typed?.reason || "");
        record.valueAfterWrite = String(liveInput().value || "");
      }
      await sleep(240);
      record.valueAfterDelay = String(liveInput().value || "");
      attemptEvidence.push(record);
      applied = symbolMatchesExpectedCode(liveInput().value, symbol);
    }
    if (!applied) {
      emitSymbolSelectionState("QUERY_NOT_APPLIED", symbol, searchRoot, optionSelectors, null, attemptEvidence);
      throw new Error(`TICKET_SYMBOL_QUERY_NOT_APPLIED_${symbol}`);
    }
    // Aspire uses react-select-search. Its onChange runs only when the
    // rendered option button is selected; raw input assignment is not enough.
    const deadline = Date.now() + 4000;
    const wanted = normalize(symbol);
    let option = null;
    while (Date.now() < deadline && !option) {
      option = [...searchRoot.querySelectorAll(optionSelectors)].find(node => {
        if (!isVisible(node)) return false;
        const optionValue = normalize(node.getAttribute("value") || node.dataset?.value);
        const optionText = normalize(node.textContent);
        return optionValue === wanted || optionText === wanted || optionText.startsWith(`${wanted} `);
      });
      if (!option) await sleep(120);
    }
    if (!option) {
      emitSymbolSelectionState("OPTION_NOT_FOUND", symbol, searchRoot, optionSelectors);
      throw new Error(`TICKET_SYMBOL_OPTION_NOT_FOUND_${symbol}`);
    }
    emitSymbolSelectionState("BEFORE_OPTION_CLICK", symbol, searchRoot, optionSelectors, option);
    const optionRect = option.getBoundingClientRect();
    const trustedClick = await chrome.runtime.sendMessage({
      type: "GREEN_VALLEY_TRUSTED_SYMBOL_OPTION_CLICK",
      intent: "TRUSTED_SYMBOL_OPTION_ONLY",
      symbol,
      point: { x: optionRect.left + (optionRect.width / 2), y: optionRect.top + (optionRect.height / 2) }
    });
    if (!trustedClick?.ok) throw new Error(trustedClick?.reason || `TRUSTED_SYMBOL_OPTION_CLICK_BLOCKED_${symbol}`);
    const confirmationDeadline = Date.now() + 1800;
    while (Date.now() < confirmationDeadline) {
      const currentInput = searchRoot.querySelector(".select-search__input") || element;
      if (symbolMatchesExpectedCode(currentInput.value, symbol)) {
        emitSymbolSelectionState("AFTER_OPTION_CLICK", symbol, searchRoot, optionSelectors, option);
        return;
      }
      await sleep(120);
    }
    emitSymbolSelectionState("SELECTION_NOT_CONFIRMED", symbol, searchRoot, optionSelectors, option);
    throw new Error(`TICKET_SYMBOL_SELECTION_NOT_CONFIRMED_${symbol}`);
  }

  // Returns the ticket root that actually holds the user-authored symbol.
  async function selectLiveSymbol(previousRoot, symbol, selectors) {
    const optionSelectors = selectors.symbolOptions;
    const candidates = symbolInputCandidates(selectors);
    if (!candidates.length) throw new Error(`TICKET_SYMBOL_INPUT_NOT_VISIBLE_${symbol}`);
    const rootOf = input => input.closest("#orderEntryDropdown") || previousRoot;
    // A previous attempt can leave the ticket open with this symbol already
    // accepted. Retyping it would only clear Aspire's committed selection.
    const settled = candidates.find(input => symbolMatchesExpectedCode(input.value, symbol));
    if (settled) return rootOf(settled);
    let lastError = null;
    for (const element of candidates) {
      try {
        await applySymbolToInput(element, symbol, optionSelectors);
        return rootOf(element);
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError || new Error(`TICKET_SYMBOL_QUERY_NOT_APPLIED_${symbol}`);
  }

  const optionValues = element => [...(element?.options || [])].map(item => ({ text: String(item.text || "").trim(), value: String(item.value || "").trim() }));
  const setSelectByText = (element, preferredTexts, fieldName) => {
    const wanted = preferredTexts.map(normalize);
    const option = [...element.options].find(item => wanted.includes(normalize(item.text)) || wanted.includes(normalize(item.value)))
      || [...element.options].find(item => wanted.some(value => normalize(item.text).includes(value) || normalize(item.value).includes(value)));
    if (!option) throw new Error(`TICKET_OPTION_NOT_FOUND_${fieldName}_AVAILABLE_${optionValues(element).map(item => `${item.text || "<blank>"}:${item.value || "<blank>"}`).join("|") || "NONE"}`);
    setValue(element, option.value);
  };

  async function selectWhenAvailable(elementOrResolver, preferredTexts, fieldName, timeoutMs = 3500) {
    const started = Date.now();
    let lastError = null;
    while (Date.now() - started < timeoutMs) {
      try {
        const element = typeof elementOrResolver === "function" ? elementOrResolver() : elementOrResolver;
        if (!element) throw new Error(`TICKET_OPTION_NOT_FOUND_${fieldName}_AVAILABLE_NONE`);
        setSelectByText(element, preferredTexts, fieldName);
        return;
      } catch (error) {
        lastError = error;
        await sleep(150);
      }
    }
    throw lastError || new Error(`TICKET_OPTION_NOT_FOUND_${fieldName}_AVAILABLE_NONE`);
  }

  const readTicket = (root = findTicketRoot(config().ticket || {})) => {
    const selectors = config().ticket || {};
    const validityInputs = findTicketAll(root, selectors.validityInputs).filter(isVisible);
    const validityInput = validityInputs.find(element => /اليوم|day|صالح حتى|gtc/i.test(element.textContent || "")) || validityInputs[0];
    return {
      account: findTicketVisible(root, selectors.accountInput)?.selectedOptions?.[0]?.textContent?.trim() || "",
      symbol: findTicketVisible(root, selectors.symbolInput)?.value?.trim().toUpperCase() || "",
      quantity: Number(findTicketVisible(root, selectors.quantityInput)?.value || 0),
      orderType: findTicketVisible(root, selectors.orderTypeInput)?.selectedOptions?.[0]?.textContent?.trim() || "",
      price: Number(findTicketVisible(root, selectors.priceInput)?.value || 0),
      validity: validityInput?.selectedOptions?.[0]?.textContent?.trim() || "",
    };
  };

  function capability(kind = "ALL") {
    const selectors = config();
    const ticketFields = [selectors.ticket?.openNewOrder, selectors.ticket?.symbolInput, selectors.ticket?.quantityInput, selectors.ticket?.priceInput, selectors.ticket?.submit];
    const rowFields = [selectors.row?.modify, selectors.row?.cancel, selectors.row?.formPrice, selectors.row?.formSubmit];
    if (!allPresent(ticketFields)) return rejected("EXECUTION_LOCKED_PENDING_LIVE_SELECTOR_VALIDATION");
    if (kind !== "NEW_ORDER" && !allPresent(rowFields)) return rejected("EXECUTION_LOCKED_PENDING_LIVE_SELECTOR_VALIDATION");
    return { ok: true, mode: "GUARDED", reason: "LIVE_SELECTORS_AVAILABLE" };
  }

  function planIsSafe(plan) {
    if (!plan || plan.schemaVersion !== 1 || plan.mode !== "USER_CONFIRMED_EXECUTION") return rejected("INVALID_GUARDED_PLAN");
    if (!plan.planId || !plan.confirmationPhrase || !Array.isArray(plan.targets) || !plan.targets.length) return rejected("INCOMPLETE_GUARDED_PLAN");
    if (!plan.targets.every(target => target.account && target.symbol && ["BUY", "SELL"].includes(target.side) && Number(target.quantity) > 0 && Number(target.price) > 0 && settlementValues.has(target.settlement))) return rejected("INVALID_TARGET_VALUES");
    return { ok: true };
  }

  function visibleOrderMatches(source) {
    const result = window.GreenValleyAspireReader?.readOpenOrders();
    return Boolean(result?.ok && result.orders.some(order =>
      String(order.orderId || "") === String(source.order_id || source.orderId || "") &&
      String(order.symbol || "") === String(source.symbol || "") &&
      String(order.side || "").toUpperCase() === String(source.side || "").toUpperCase() &&
      Number(order.remainingQuantity) === Number(source.remaining_quantity ?? source.remainingQuantity) &&
      Number(order.price) === Number(source.price)
    ));
  }
  const orderIsExecuted = order => /منفذ|نفذ|filled|executed/i.test(String(order.status || ""));
  // An order that rests keeps its full remaining quantity. An order that fills
  // immediately reports zero remaining and an executed status — both are proof
  // that the authored order reached the market.
  const targetMatchesSubmittedOrder = (order, target) => symbolMatchesExpectedCode(order.symbol, target.symbol)
    && String(order.side || "").toUpperCase() === String(target.side || "").toUpperCase()
    && Number(order.price) === Number(target.price)
    && (Number(order.remainingQuantity) === Number(target.quantity) || orderIsExecuted(order));
  const matchingSubmittedOrders = target => {
    const result = window.GreenValleyAspireReader?.readVisibleOrders?.() || window.GreenValleyAspireReader?.readOpenOrders?.();
    const orders = Array.isArray(result?.orders) ? result.orders.filter(order => targetMatchesSubmittedOrder(order, target)) : [];
    return { count: orders.length, executed: orders.some(orderIsExecuted) };
  };
  const matchingOpenOrderCount = target => matchingSubmittedOrders(target).count;
  async function waitForOpenOrder(target, previousCount, timeoutMs = 10000) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      const match = matchingSubmittedOrders(target);
      if (match.count > previousCount) {
        return { ok: true, postCheckMatch: match.executed ? "EXECUTED" : "RESTING" };
      }
      await sleep(250);
    }
    return rejected("POSTCHECK_NOT_VERIFIED_QUEUE_STOPPED");
  }

  function validatePlan(plan) {
    const valid = planIsSafe(plan); if (!valid.ok) return valid;
    const cap = capability(plan.kind); if (!cap.ok) return cap;
    if ((plan.sources || []).some(source => !visibleOrderMatches(source))) return rejected("PRECHECK_ROW_MISMATCH");
    return { ok: true, mode: "GUARDED", planId: plan.planId, sourcesVerified: (plan.sources || []).length };
  }
  function validateVisibleConfirmation(plan) {
    const valid = planIsSafe(plan); if (!valid.ok) return valid;
    if (plan.kind !== "NEW_ORDER" || plan.targets.length !== 1) return rejected("TICKET_CONFIRMATION_REQUIRES_ONE_NEW_ORDER");
    return confirmationMatchesTarget(plan.targets[0]);
  }
  async function openFirstStageConfirmation(plan, emergencyStop = false) {
    if (emergencyStop) return rejected("EMERGENCY_STOP_ACTIVE");
    const valid = planIsSafe(plan); if (!valid.ok) return valid;
    if (plan.kind !== "NEW_ORDER" || plan.targets.length !== 1) return rejected("TICKET_SUBMISSION_REQUIRES_ONE_NEW_ORDER");
    const target = plan.targets[0];
    const selectors = config().ticket || {};
    const root = resolveActiveRoot(null, selectors, target.symbol);
    if (!root) return rejected("TICKET_SUBMIT_ROOT_NOT_VISIBLE");
    const ticket = readTicket(root);
    if (!ticketMatchesTarget(ticket, target)) {
      emitFirstStageTicketMismatch(target, ticket);
      return rejected("TICKET_SUBMIT_VALUE_MISMATCH");
    }
    const existing = readConfirmationDialog();
    if (existing) return validateVisibleConfirmation(plan);
    // Aspire accepts the click and then does nothing at all when the account
    // cannot cover the order, so stop before submitting rather than after.
    const capacityBefore = capacityRefusalReason(root, target);
    if (capacityBefore) return rejected(capacityBefore);
    const firstStageSubmit = findAll(selectors.submit).filter(isVisible).find(button => root.contains(button));
    if (!firstStageSubmit) return rejected("TICKET_SUBMIT_BUTTON_NOT_VISIBLE");
    const rect = firstStageSubmit.getBoundingClientRect();
    const clickDelivery = observeFirstStageClickDelivery(firstStageSubmit);
    const trustedClick = await chrome.runtime.sendMessage({
      type: "GREEN_VALLEY_TRUSTED_FIRST_STAGE_CLICK",
      intent: "TRUSTED_FIRST_STAGE_ONLY",
      point: { x: rect.left + (rect.width / 2), y: rect.top + (rect.height / 2) }
    });
    if (!trustedClick?.ok) return rejected(trustedClick?.reason || "TRUSTED_FIRST_STAGE_CLICK_BLOCKED");
    await clickDelivery;
    const started = Date.now();
    while (Date.now() - started < 6000 && !readConfirmationDialog()) await sleep(120);
    const confirmationCheck = validateVisibleConfirmation(plan);
    if (!confirmationCheck.ok) {
      if (confirmationCheck.reason === "TICKET_CONFIRMATION_DIALOG_NOT_FOUND") {
        // Always record why no dialog appeared. A broker rejection is reported
        // in addition, never instead — a wrong rejection guess used to suppress
        // the only diagnostic that could explain a missing confirmation.
        emitFirstStageDialogMissing(root, selectors);
        const messages = brokerRejectionMessages();
        if (messages.length) {
          emitFirstStageBrokerRejection(messages, root, selectors);
          return rejected("TICKET_BROKER_REJECTION");
        }
        const capacityAfter = capacityRefusalReason(root, target);
        if (capacityAfter) return rejected(capacityAfter);
      }
      return confirmationCheck;
    }
    return { ok: true, mode: "FIRST_STAGE_CONFIRMATION_OPENED", confirmation: confirmationCheck.confirmation };
  }

  async function populateTicketFromPlan(plan, emergencyStop = false) {
    if (emergencyStop) return rejected("EMERGENCY_STOP_ACTIVE");
    const valid = planIsSafe(plan); if (!valid.ok) return valid;
    if (plan.kind !== "NEW_ORDER" || plan.targets.length !== 1) return rejected("TICKET_POPULATION_REQUIRES_ONE_NEW_ORDER");
    const selectors = config().ticket || {};
    let root = findTicketRoot(selectors);
    const required = [selectors.accountInput, selectors.symbolInput, selectors.quantityInput, selectors.orderTypeInput, selectors.priceInput];
    if (!root || !required.every(candidate => findTicketVisible(root, candidate)) || !findTicketAll(root, selectors.validityInputs).length) {
      emitTicketDiagnostic("READ_ONLY_PREFILL_LOCK_DIAGNOSTIC", { failureReason: "TICKET_POPULATION_LOCKED_PENDING_SELECTOR_VALIDATION", preFillGate: ticketGateState(selectors, root) });
      return rejected("TICKET_POPULATION_LOCKED_PENDING_SELECTOR_VALIDATION");
    }
    const target = plan.targets[0];
    try {
      root = await selectLiveSymbol(root, target.symbol, selectors);
      root = resolveActiveRoot(root, selectors, target.symbol);
      // Aspire fills the account options after a real symbol selection, not
      // merely after a raw input value assignment.
      await selectWhenAvailable(() => findTicketVisible(root, selectors.accountInput), [target.account], "ACCOUNT_AFTER_SYMBOL_SELECTION", 5000);
      root = resolveActiveRoot(root, selectors, target.symbol);
      // Aspire remounts and resets the side after accepting a real symbol.
      // Apply the documented SELL control only after symbol/account state is live.
      await selectTicketSide(root, target.side, selectors);
      await sleep(120);
      await selectSettlement(root, target.settlement, selectors);
      await sleep(120);
      setValue(findTicketVisible(root, selectors.quantityInput), target.quantity);
      await selectWhenAvailable(() => findTicketVisible(root, selectors.orderTypeInput), ["سعر محدد", "limit"], "ORDER_TYPE");
      setValue(findTicketVisible(root, selectors.priceInput), target.price);
      const currentValidityInput = () => {
        const validityInputs = findTicketAll(root, selectors.validityInputs).filter(isVisible);
        return validityInputs.find(element => /اليوم|day|صالح حتى|gtc/i.test(element.textContent || "")) || validityInputs[0] || null;
      };
      await selectWhenAvailable(currentValidityInput, target.validity === "DAY" ? ["اليوم", "day"] : ["صالح حتى الغائه", "gtc"], "VALIDITY");
      const visible = readTicket(root);
      const expectedTicket = { account: target.account, symbol: String(target.symbol).toUpperCase(), quantity: Number(target.quantity), price: Number(target.price), orderType: "LIMIT", validity: target.validity };
      const observedTicket = visible;
      const mismatchedFields = [
        !normalize(observedTicket.account).includes(normalize(expectedTicket.account)) && "account",
        !symbolMatchesExpectedCode(observedTicket.symbol, expectedTicket.symbol) && "symbol",
        observedTicket.quantity !== expectedTicket.quantity && "quantity",
        observedTicket.price !== expectedTicket.price && "price",
        !/سعر محدد|limit/i.test(observedTicket.orderType) && "orderType",
        !(expectedTicket.validity === "DAY" ? /اليوم|day/i.test(observedTicket.validity) : /صالح حتى الغائه|gtc/i.test(observedTicket.validity)) && "validity"
      ].filter(Boolean);
      if (mismatchedFields.length) {
        chrome.runtime.sendMessage({ type: "GREEN_VALLEY_TICKET_POSTFILL_MISMATCH", expectedTicket, observedTicket, mismatchedFields });
        return rejected("TICKET_POSTPOPULATION_MISMATCH");
      }
      return { ok: true, mode: "TICKET_FILLED_NOT_SUBMITTED", planId: plan.planId, ticket: visible };
    } catch (error) {
      const reason = String(error?.message || "TICKET_POPULATION_FAILED");
      // An unexpected runtime error must name the exact step, not only its text.
      emitTicketDiagnostic("READ_ONLY_POPULATION_FAILURE_DIAGNOSTIC", { failureReason: reason, failureStack: String(error?.stack || "").split("\n").slice(0, 6).join(" | "), preFillGate: ticketGateState(selectors, root) });
      return rejected(reason);
    }
  }

  async function executeConfirmedPlan(plan, confirmationPhrase, emergencyStop = false, sponsorMode = false) {
    if (emergencyStop) return rejected("EMERGENCY_STOP_ACTIVE");
    const check = planIsSafe(plan); if (!check.ok) return check;
    if (!sponsorMode && confirmationPhrase !== plan.confirmationPhrase) return rejected("EXACT_CONFIRMATION_REQUIRED");
    if (plan.kind !== "NEW_ORDER" || plan.targets.length !== 1) return rejected("TICKET_SUBMISSION_REQUIRES_ONE_NEW_ORDER");
    const target = plan.targets[0];
    const selectors = config().ticket || {};
    const root = resolveActiveRoot(null, selectors, target.symbol);
    if (!root) return rejected("TICKET_SUBMIT_ROOT_NOT_VISIBLE");
    if (!ticketMatchesTarget(readTicket(root), target)) return rejected("TICKET_SUBMIT_VALUE_MISMATCH");
    const existingConfirmation = readConfirmationDialog();
    if (existingConfirmation) {
      const confirmationCheck = validateVisibleConfirmation(plan); if (!confirmationCheck.ok) return confirmationCheck;
      const beforeCount = matchingOpenOrderCount(target);
      const rect = existingConfirmation.confirmButton.getBoundingClientRect();
      const trustedClick = await chrome.runtime.sendMessage({
        type: "GREEN_VALLEY_TRUSTED_FINAL_CONFIRM_CLICK",
        intent: "TRUSTED_FINAL_CONFIRM_ONLY",
        point: { x: rect.left + (rect.width / 2), y: rect.top + (rect.height / 2) }
      });
      if (!trustedClick?.ok) return rejected(trustedClick?.reason || "TRUSTED_FINAL_CONFIRM_CLICK_BLOCKED");
      const postcheck = await waitForOpenOrder(target, beforeCount);
      return postcheck.ok
        ? { ok: true, mode: "GUARDED", planId: plan.planId, verifiedTargets: 1, postCheckMatch: postcheck.postCheckMatch }
        : postcheck;
    }
    return { ok: false, mode: "FINAL_CONFIRMATION_REQUIRED", reason: "REOPEN_EXTENSION_AND_REENTER_EXACT_PHRASE" };
  }

  window.GreenValleyAspireExecutor = { capability, validatePlan, validateVisibleConfirmation, openFirstStageConfirmation, populateTicketFromPlan, readTicket, executeConfirmedPlan };
})();
