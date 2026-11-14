# Green Valley Trade Assistant

A Windows order-entry assistant pairs with an Edge extension for the Aspire Securities interface. The operator supplies order values and makes trading decisions. The extension reads the ticket, applies side and settlement checks and handles confirmation and post-submission states.

## Engineering scope

The delivery contains an installer, a portable executable and the extension source. The desktop source and build-time suites are absent from this snapshot. A post-check that cannot verify an outcome requires the operator to inspect Aspire before any retry. Settlement may be absent from the confirmation screen.

## Getting started

For offline review, open the extension manifest, order model and executor source. The English deployment guide covers Windows installation, Edge setup and pairing. Live brokerage access is outside the portfolio demonstration.

## Status and verification

Version 1.0.0 delivery bundle. Live execution unverified.

All tracked extension JavaScript files passed `node --check`. The release record reports 11 extension and 58 desktop tests passing at build time. Both shipped EXEs returned `NotSigned` in an Authenticode check. Neither binary ran during this review.

## Source and evidence

- [README_EN.md](README_EN.md)
- [VERSION_EN.txt](VERSION_EN.txt)
- [manifest.json](2%20-%20Aspire%20Trade%20Extension/manifest.json)
- [order-model.js](2%20-%20Aspire%20Trade%20Extension/shared/order-model.js)
- [aspire-executor.js](2%20-%20Aspire%20Trade%20Extension/content/aspire-executor.js)
- [USER_GUIDE_AR.md](4%20-%20%D8%A7%D9%84%D8%AF%D9%84%D9%8A%D9%84/USER_GUIDE_AR.md)

## Author

Ahmed Mohamed Elsayed Elreefy. Engineering work includes requirements, technical decisions, AI-assisted implementation, debugging and acceptance review.
