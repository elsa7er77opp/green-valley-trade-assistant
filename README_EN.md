# GREEN VALLEY TRADE ASSISTANT — 1.0.0

**Deployment guide for a client machine**

This is an execution tool, not investment advice. Every value in an order — symbol, side, account, price, quantity, validity and settlement — comes from the user. The tool chooses none of them.

---

## What is in this folder

| Folder | Contents |
|---|---|
| `1 - Installer` | `GREEN_VALLEY_TRADE_ASSISTANT_Setup.exe` — the recommended way to install |
| `2 - Aspire Trade Extension` | The Edge extension, version `0.6.2`. A spare copy; the installer also places it inside the program folder |
| `3 - نسخة بدون تثبيت` | The same application, run directly, no installation |
| `4 - الدليل` | `USER_GUIDE_AR.md` (Arabic operating guide) and `VERSION.txt` |
| `README_EN.md` | This file |
| `VERSION_EN.txt` | Versions, test counts, and what has and has not been proven live |
| `اقرأني أولاً — التركيب على جهاز العميل.txt` | The Arabic version of this file |

---

## Requirements on the client machine

- Windows 10 or 11, 64-bit
- Microsoft Edge
- A working Aspire account, signed in
- Administrator rights (for installation only)

Python is not required. The application is bundled into a single executable.

---

## Installation — five steps

### 1. Install the application

Run `1 - Installer\GREEN_VALLEY_TRADE_ASSISTANT_Setup.exe`.

If Windows shows **"Windows protected your PC"**, click **More info → Run anyway**. This is the normal warning for any executable that is not signed with a paid certificate.

When it finishes it opens two things by itself: the extension folder, and the `edge://extensions` page. Leave both open — the next step needs them.

### 2. Load the extension in Edge (once)

This is the one step no installer can perform, because the extension is not published on the Edge store.

On the `edge://extensions` page:

1. Turn on **Developer mode** (the switch on the left)
2. Click **Load unpacked**
3. Select the folder
   `C:\Program Files\Green Valley\GREEN VALLEY TRADE ASSISTANT\Aspire Trade Extension`
   (or the `2 - Aspire Trade Extension` folder in this delivery)
4. Confirm the extension appears and reads version **0.6.2**

Leave that folder where it is and do not delete it — Edge reads from it every time.

### 3. Pair the application with the extension

1. Open **GREEN VALLEY TRADE ASSISTANT** from the Start menu or the desktop shortcut
2. In the application find **Extension pairing token** and click **Copy**
3. Open the extension popup in Edge and paste the token
4. Click **Test desktop connection**
5. The badge at the top of the application must read **`BRIDGE: CONNECTED`**

If it reads something else:

| Badge | What to do |
|---|---|
| `WAITING FOR EXTENSION` | The extension is not loaded, or Edge is closed |
| `WRONG TOKEN` | Copy the token again and paste it again |
| `EXTENSION SILENT` | Reload the extension from `edge://extensions`, and open Aspire |

Each machine has its own pairing token. After a reinstall the extension gets a **new ID in Edge**, so the token must be pasted once more.

### 4. Open Aspire

1. Sign in to Aspire in Edge
2. Open the **Order List** page specifically
3. In the application click **Refresh through bridge** — the open orders must appear

If they appear, the whole chain is working.

### 5. Try it before any real order

The first time, run with **Sponsor off** (or ladder **Preview**). The Aspire ticket fills and stops at the confirmation screen; nothing is submitted. Check the side, price and quantity yourself.

Do not enable Sponsor on a real order before you have seen a ticket fill correctly.

---

## What the client needs to understand

### Settlement

The Settlement field follows the selected side automatically:

| Side | Settlement field |
|---|---|
| **BUY** | Locked to `NORMAL` — a BUY ticket has no settlement field in Aspire at all |
| **SELL** | Cleared, and its options become `T+0` / `T+1` / `T+2` only. The user chooses |

The tool **never** picks a settlement period for anyone — it decides when the money reaches the account. That is why switching from BUY to SELL leaves the field empty instead of filling in a period.

Aspire **does not show the settlement period on its confirmation screen**, so it cannot be verified there. The value seen on the ticket is the only reference.

### Reading a result honestly

`POSTCHECK_NOT_VERIFIED_QUEUE_STOPPED` **does not mean the order was not sent.** The post-check looks for the order in Open Orders after submission; an order that fills immediately is no longer there, so it cannot match.

The rule: check Aspire yourself before repeating any plan.

### The Order Ladder

- Capped at **50 orders**
- One rung is sent at a time; the next is sent only after the previous one reports back
- A failed rung **halts the ladder immediately** and reports which order stopped and why
- Price the rungs away from the market — SELL above the ask, BUY below the bid — so each rests in Open Orders and can be verified

**Stated plainly:** a full SELL ladder has not yet been run against real orders. Single SELL orders are proven, and a 10-rung BUY ladder is proven. It uses the same per-order path, so nothing technical stands in the way — it simply has not been observed yet. See `VERSION_EN.txt` for the full list of what is and is not proven.

### Diagnostic files

The extension no longer writes JSON diagnostics into `Downloads` automatically — it used to fill the folder on every run.

Nothing is lost: the **last 10 captures are always kept inside the extension**. To retrieve them, open the extension popup and click **Save the last captured diagnostics** — one file with all of them.

While troubleshooting, tick **Save diagnostics to Downloads automatically** to restore the old behaviour, and untick it when finished.

---

## If something goes wrong

| Problem | What to do |
|---|---|
| Badge reads `WAITING FOR EXTENSION` | The extension is not loaded, or Edge is closed |
| Badge reads `WRONG TOKEN` | Copy and paste the pairing token again |
| Badge reads `EXTENSION SILENT` | Reload the extension, then open Aspire |
| The application will not start | Try the copy in `3 - نسخة بدون تثبيت` |
| Open orders do not appear | Make sure Aspire is on the **Order List** page |
| The ladder will not start | Click **Reset ladder** |
| The ladder stopped suddenly | Read the message — usually buying power or share balance ran out |
| The ticket will not fill | Make sure Aspire is on the orders page and no old ticket is open |

The complete table of error messages is in `4 - الدليل\USER_GUIDE_AR.md`.

---

## Notice

This program is an execution and assistance tool — **not an investment advisory tool**. Every decision to buy, sell, price or time an order is the user's alone, and Sponsor Mode sends **real orders with real money**.
