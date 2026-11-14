(() => {
  const selectors = () => window.GreenValleyAspireSelectors;
  const text = element => String(element?.innerText || element?.textContent || "").replace(/\s+/g, " ").trim();
  const equalsAlias = (value, aliases) => aliases.some(alias => text(value).toLowerCase() === alias.toLowerCase());

  function findOrderPanel() {
    const config = selectors();
    const agGrids = [...new Set([...document.querySelectorAll(".ag-root,[role='grid']")])];
    const required = ["SellBuyFlag", "StatusCode", "Remaining", "Price", "ValidityCode"];
    const ranked = agGrids.map(grid => {
      const ids = new Set([...grid.querySelectorAll("[role='columnheader'][col-id]")].map(header => header.getAttribute("col-id")));
      const hasRequired = required.every(id => ids.has(id));
      const hasSymbol = ids.has("Symbol_1") || ids.has("Symbol");
      const rowCount = grid.querySelectorAll(".ag-row[row-id],[role='row'][row-id]").length;
      const score = hasRequired && hasSymbol ? (rowCount * 100) + (ids.has("AccountNameA") ? 20 : 0) + (ids.has("Symbol_1") ? 10 : 0) : -1;
      return { grid, score };
    }).filter(candidate => candidate.score >= 0).sort((a, b) => b.score - a.score);
    if (ranked.length) return ranked[0].grid;
    const candidates = [
      ...document.querySelectorAll("table,[role='grid'],.dx-datagrid,.ag-root,.ant-table"),
      ...document.querySelectorAll(config.panelCandidates.join(","))
    ];
    return candidates.find(node => {
      const panelText = text(node);
      const hasPanelTitle = config.orderPanelText.some(label => panelText.includes(label));
      const hasHeaders = Object.values(config.headerAliases).slice(0, 5).filter(aliases => aliases.some(label => panelText.includes(label))).length >= 4;
      return hasHeaders || (hasPanelTitle && hasHeaders);
    }) || null;
  }

  function headerMap(panel) {
    const config = selectors();
    const headers = [...panel.querySelectorAll("th,[role='columnheader'],[role='presentation']")]
      .map(node => text(node))
      .filter(Boolean);
    const map = {};
    for (const [field, aliases] of Object.entries(config.headerAliases)) {
      const index = headers.findIndex(header => equalsAlias(header, aliases));
      if (index >= 0) map[field] = index;
    }
    return { headers, map };
  }

  function rowCells(row) {
    const config = selectors();
    const cells = [...row.querySelectorAll(config.cellCandidates.join(","))].map(node => text(node)).filter(Boolean);
    return cells.length ? cells : [];
  }

  function isLikelyOrder(values, map) {
    if (!values.length || values.length < 5) return false;
    const joined = values.join(" ");
    const side = values[map.side ?? 0] || joined;
    return /(شراء|بيع|buy|sell)/i.test(side) && /\d/.test(joined);
  }

  const AG_COLUMN_IDS = {
    side: ["SellBuyFlag"],
    symbol: ["Symbol_1", "Symbol"],
    company: ["CompanyShortNameA"],
    status: ["StatusCode"],
    remainingQuantity: ["Remaining"],
    price: ["Price"],
    validity: ["ValidityCode"],
    account: ["AccountNameA"]
  };

  function agCellValue(cell) {
    return String(cell?.getAttribute("title") || text(cell)).trim();
  }

  function rowsFromAgGrid(panel) {
    const grouped = new Map();
    for (const row of panel.querySelectorAll(".ag-row[row-id],[role='row'][row-id]")) {
      const rowId = row.getAttribute("row-id");
      if (!rowId) continue;
      const record = grouped.get(rowId) || { orderId: rowId };
      for (const cell of row.querySelectorAll("[role='gridcell'][col-id],.ag-cell[col-id]")) {
        const colId = cell.getAttribute("col-id");
        for (const [field, ids] of Object.entries(AG_COLUMN_IDS)) {
          if (ids.includes(colId) && !record[field]) record[field] = agCellValue(cell);
        }
      }
      grouped.set(rowId, record);
    }
    return [...grouped.values()].filter(row => row.symbol && row.side);
  }

  function isOpenOrder(row) {
    const status = String(row.status || "").toLowerCase();
    const remaining = Number(String(row.remainingQuantity || "0").replace(/,/g, ""));
    const explicitlyClosed = /(ملغ|منفذ بالكامل|cancel|filled|reject|expired)/i.test(status);
    const explicitlyOpen = /(فعال|مفتوح|جزئي|active|open|partial)/i.test(status);
    return !explicitlyClosed && (explicitlyOpen || remaining > 0);
  }

  function rowsFromPanel(panel, map) {
    const config = selectors();
    const seen = new Set();
    const rows = [];
    for (const selector of config.rowCandidates) {
      for (const row of panel.querySelectorAll(selector)) {
        if (seen.has(row)) continue;
        seen.add(row);
        const values = rowCells(row);
        if (!isLikelyOrder(values, map)) continue;
        const field = key => values[map[key] ?? -1] || "";
        rows.push({
          orderId: field("orderId"),
          side: field("side"),
          symbol: field("symbol"),
          company: field("company"),
          status: field("status"),
          remainingQuantity: field("remainingQuantity"),
          price: field("price"),
          validity: field("validity"),
          account: field("account")
        });
      }
    }
    return rows;
  }

  window.GreenValleyAspireReader = {
    // Every row Aspire is showing, including executed and cancelled ones. The
    // post-check needs these: an order that fills immediately never rests in
    // Open Orders, and filtering it away made a successful order look failed.
    readVisibleOrders() {
      const panel = findOrderPanel();
      if (!panel) return { ok: false, reason: "ORDER_PANEL_NOT_FOUND", rawCount: 0, orders: [] };
      const { map } = headerMap(panel);
      const visibleRows = rowsFromAgGrid(panel);
      const rawOrders = visibleRows.length ? visibleRows : rowsFromPanel(panel, map);
      return {
        ok: true,
        rawCount: rawOrders.length,
        orders: rawOrders.map(order => window.GreenValleyOrderModel.normalizeOrder(order))
      };
    },
    readOpenOrders() {
      const panel = findOrderPanel();
      if (!panel) return { ok: false, reason: "ORDER_PANEL_NOT_FOUND", rawCount: 0, orders: [] };
      const { headers, map } = headerMap(panel);
      const visibleRows = rowsFromAgGrid(panel);
      const rawOrders = (visibleRows.length ? visibleRows : rowsFromPanel(panel, map)).filter(isOpenOrder);
      return {
        ok: true,
        reason: rawOrders.length ? "OK" : "NO_OPEN_ORDERS_VISIBLE",
        rawCount: rawOrders.length,
        visibleRowCount: visibleRows.length,
        headers,
        mappedFields: Object.keys(map),
        orders: rawOrders.map(order => window.GreenValleyOrderModel.normalizeOrder(order))
      };
    }
  };
})();
