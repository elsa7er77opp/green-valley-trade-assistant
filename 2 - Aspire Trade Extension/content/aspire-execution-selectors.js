/*
  Complete browser-action selector contract. These arrays intentionally begin
  empty: only a supervised review of a live Aspire ticket may populate them.
  The executor refuses every action while a required selector is missing.
*/
window.GreenValleyAspireExecutionSelectors = {
  ticket: {
    openNewOrder: ["button.quickorderBtn"],
    root: ["#orderEntryDropdown"],
    accountInput: ["#accountNumberBuyOrderPopup"],
    symbolInput: ["#custom-select-search .select-search__input", "#orderEntryDropdown input[placeholder='السهم']"],
    symbolOptions: ["#custom-select-search .select-search__option", "#custom-select-search [role='option']", ".select-search__option", "[role='option']"],
    quantityInput: ["#quantityOrderEntryPopup"],
    orderTypeInput: ["#orderTypeOrderEntryPopup"],
    priceInput: ["#priceOrderEntryPopup"],
    settlementButtons: ["#orderEntryDropdown button.SettelmentTypeBtn"],
    // Live Aspire exposes settlement as the "طريقة التنفيذ" select, not as
    // buttons. Its id is shared with three unrelated selects, so the executor
    // identifies it by its option texts rather than by id alone.
    settlementSelects: ["#orderEntryDropdown select"],
    expandMore: ["#orderEntryDropdown button.ml-3.mr-auto.mt-1"],
    validityInputs: ["#orderEntryDropdown select[id='validityDateBuyOrderPopup']"],
    confirmationDialog: [".custom-popup"],
    confirmationSubmit: [".custom-popup .custom-btn-primary"],
    confirmationEdit: [".custom-popup .custom-btn-cancel"],
    buySide: [], sellSide: ["#orderEntryDropdown .pt-1.mr-3"], submit: ["#orderEntryDropdown .btn-trade-orderPopup"], confirmation: [".custom-popup .custom-btn-primary"],
  },
  row: {
    modify: [], cancel: [], formQuantity: [], formPrice: [], formSubmit: [], formConfirmation: [],
  },
  success: [],
  failure: [],
};
