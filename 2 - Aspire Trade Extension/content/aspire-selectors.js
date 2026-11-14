/**
 * Keep platform-specific selectors here. Aspire can change its React grid;
 * this adapter is the only file expected to require maintenance in that case.
 */
window.GreenValleyAspireSelectors = {
  orderPanelText: ["لائحة الطلبات", "Order List", "Open Orders"],
  headerAliases: {
    side: ["العملية", "Operation", "Side"],
    symbol: ["السهم", "Symbol"],
    company: ["اسم الشركة", "Company"],
    status: ["الحالة", "Status"],
    remainingQuantity: ["الكمية المتبقية", "Remaining Quantity", "Remaining"],
    price: ["السعر", "Price"],
    validity: ["الصلاحية", "Validity"],
    account: ["اسم الحساب", "Account"],
    orderId: ["رقم الأمر", "Order ID", "Order No"]
  },
  panelCandidates: [
    "[role='tabpanel']",
    ".ant-tabs-tabpane",
    ".ant-tabs-content-holder",
    "[class*='order']",
    "[class*='Order']"
  ],
  rowCandidates: [
    "tr",
    "[role='row']",
    ".ag-row",
    ".ant-table-row",
    ".ReactVirtualized__Table__row",
    "[data-row-key]"
  ],
  cellCandidates: [
    "td",
    "[role='gridcell']",
    ".ag-cell",
    ".ant-table-cell",
    ".ReactVirtualized__Table__rowColumn"
  ]
};
