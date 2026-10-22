# Roadmap

這份文件只寫方向和順序：每個階段一行，寫它為什麼排在這裡，加上一個連結。細節寫在 `docs/proposals/`，進度和日期看 GitHub 的 milestone。只有方向改變時才改這份文件。

## 目標

讓情侶和小團體一起記帳、分攤支出：每個人在自己的手機上記帳，沒有網路也能用，連上線後資料自動同步，隨時看得到誰該付誰多少。第一個對外版本是手機 app。

## 現在（Now）

（目前沒有。階段開始時，start-phase 會把它從下面移上來，並連到它的 milestone。）

## 接下來（Next）

- **重建**：把 baseline 手機 app 已有的功能搬過來，補上 spec 和驗收測試。之後每個階段都要建立在這些 spec、測試和清楚的程式邊界上，所以排第一。Proposal：[重建](proposals/2026-10-23-rebuild-and-first-release.md#重建)
- **帳號**：資料一旦存在伺服器上，這是最基本的保護，所以排在雲端共享之前。Proposal：[帳號](proposals/2026-10-23-rebuild-and-first-release.md#帳號)
- **雲端共享**：第一個對外版本的前提：沒有它，就只是一個人用的記帳 app。Proposal：[雲端共享](proposals/2026-10-23-rebuild-and-first-release.md#雲端共享)

## 之後（Later）

- **指定金額分攤**：很常見的分帳方式，但不影響第一個版本能不能上線。Proposal：[指定金額分攤](proposals/2026-10-23-rebuild-and-first-release.md#指定金額分攤)
- **找得到以前的支出**：資料一多就需要，但少了它也能上線。Proposal：[找得到以前的支出](proposals/2026-10-23-rebuild-and-first-release.md#找得到以前的支出)
- **網頁版**：要等雲端共享做好，網頁才有資料可以看。Proposal：[網頁版](proposals/2026-10-23-rebuild-and-first-release.md#網頁版)
- **上線後的監控**：要先有正式部署的 API 才有意義。Proposal：[上線後的監控](proposals/2026-10-23-rebuild-and-first-release.md#上線後的監控)
- **報表匯出**：等有人真的需要把資料拿到別處用時再做。Proposal：[報表匯出](proposals/2026-10-23-rebuild-and-first-release.md#報表匯出)

## 不做（Not doing）

- **連結銀行帳戶**：自動匯入交易要處理金融資料的法規和資安，超出這個專案能負擔的範圍。
- **即時匯率換算**：各幣別分開加總就夠用；換算會帶來「用哪一天的匯率」這種沒有標準答案的問題。
- **付費方案**：先確定有人持續在用，再談收費。
- **只為了換技術而重寫**：例如換狀態管理套件、換測試框架、上 Kubernetes。除非它解決一個量得出來的問題。
