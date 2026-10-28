# Shell

## Purpose

App 外殼：開啟本機資料、開啟期間的載入畫面、打不開時的錯誤畫面、這支手機的本機身分，以及載入後的分頁列、各分頁自己的堆疊和返回按鈕。本機資料是手機上的 SQLite 資料庫；開啟時依序跑 migration，還沒有本機身分時再建立一個（ADR-0006）。開發版是指 `__DEV__` 為真的 build。分頁的根畫面是分頁堆疊最底下的畫面，也就是選中分頁時最先看到的畫面。

## Requirements

### Requirement: SHELL-1.1 開啟本機資料時只顯示載入指示

WHILE 本機資料還在開啟，the mobile app SHALL 只顯示一個無障礙標籤為「Restoring local data」的載入指示，不顯示 app 的畫面。

#### Scenario: 還沒開好

- **WHEN** 本機資料庫還沒開好
- **THEN** 畫面上只有標籤為「Restoring local data」的載入指示

#### Scenario: 開好之後

- **WHEN** 本機資料開好了
- **THEN** 載入指示消失，顯示 app 的畫面

### Requirement: SHELL-2.1 還沒有本機身分時建立一個

WHEN app 啟動時本機資料裡還沒有本機身分，the mobile app SHALL 建立一個：使用者、個人空間、個人 participant 各一個小寫的第 4 版 UUID，三個互不相同，名字是空字串。

#### Scenario: 第一次啟動

- **WHEN** app 第一次啟動
- **THEN** 三個 ID 都是小寫的第 4 版 UUID、互不相同，名字是空字串

#### Scenario: 清除 app 資料之後

- **WHEN** 清除 app 資料，再啟動 app
- **THEN** 三個 ID 都和清除前不同

### Requirement: SHELL-3.1 重新啟動後沿用同一個本機身分

The mobile app SHALL 在顯示畫面之前存好本機身分，之後只要本機資料還在，每次啟動都沿用它。

#### Scenario: 畫面一出現就關掉

- **WHEN** app 第一次顯示畫面後馬上關掉，再重新啟動
- **THEN** 三個 ID 和名字都和關掉前一樣

### Requirement: SHELL-4.1 本機資料打不開時顯示錯誤，不動資料

IF 本機資料打不開，THEN the mobile app SHALL 在載入指示的位置顯示「Unable to Load Local Data」和「Your data was not changed.」，不顯示 app 的畫面，並讓本機資料保持開啟前的樣子，開啟時寫到一半的 migration 或本機身分都不留下。打不開是指資料庫無法開啟或讀取、開啟時跑 migration 或建立本機身分失敗，或是不在開發版上、而資料庫記錄的 migration 和 app 的 migration 清單開頭對不上（ADR-0006）。

#### Scenario: 開不了資料庫

- **WHEN** 開啟資料庫失敗，開發版也一樣
- **THEN** 顯示這兩行訊息

#### Scenario: 檔案不是資料庫

- **WHEN** 資料庫檔案的內容不是 SQLite 資料庫，開發版也一樣
- **THEN** 顯示這兩行訊息，檔案內容和之前完全一樣

#### Scenario: 寫不進去

- **WHEN** 資料庫只能讀、不能寫，而開啟時要跑 migration 或建立本機身分，開發版也一樣
- **THEN** 顯示這兩行訊息，檔案內容和之前完全一樣

#### Scenario: 在新版上裝回舊版

- **WHEN** 不是開發版，而資料庫記錄了 app 的所有 migration，再加上一個這個版本沒有的 migration
- **THEN** 顯示這兩行訊息，檔案內容和之前完全一樣

#### Scenario: migration 的內容不同

- **WHEN** 不是開發版，而資料庫記錄的 migration 和 app 的同一個位置的 migration 內容不同
- **THEN** 顯示這兩行訊息，檔案內容和之前完全一樣

### Requirement: SHELL-5.1 開發版遇到對不上的資料就重新開始

IF app 是開發版，而資料庫記錄的 migration 和 app 的 migration 清單開頭對不上，THEN the mobile app SHALL 刪除本機資料，以新的本機身分重新開始（ADR-0006）。

#### Scenario: 在新版上裝回舊版

- **WHEN** 開發版啟動時，資料庫記錄了 app 的所有 migration，再加上一個這個版本沒有的 migration
- **THEN** app 照常顯示畫面，三個 ID 都和之前不同，新版多出的資料不在了

#### Scenario: migration 的內容不同

- **WHEN** 開發版啟動時，資料庫記錄的 migration 和 app 的同一個位置的 migration 內容不同
- **THEN** app 照常顯示畫面，有一個新的本機身分，原本資料庫裡的資料都不在了

### Requirement: SHELL-6.1 載入後顯示三個分頁並選中 Expenses

WHEN 本機資料開好，the mobile app SHALL 顯示原生分頁列，依序是「Groups」、「Expenses」、「Settings」，三個分頁的標籤一直顯示，並選中 Expenses。

#### Scenario: 打開 app

- **WHEN** 打開 app，本機資料開好
- **THEN** 分頁列依序是「Groups」、「Expenses」、「Settings」，選中的是 Expenses

#### Scenario: 沒選中的分頁

- **WHEN** 選中的是 Expenses
- **THEN** Groups 和 Settings 的標籤也一直顯示，不是只有選中的分頁才有標籤

### Requirement: SHELL-7.1 iOS 的分頁圖示

WHERE iOS，the mobile app SHALL 以 SF Symbols `person.3`、`creditcard`、`gearshape` 作為 Groups、Expenses、Settings 的分頁圖示，分頁選中時改用 `person.3.fill`、`creditcard.fill`、`gearshape.fill`。

#### Scenario: 分頁圖示

- **WHEN** iOS 上顯示分頁列
- **THEN** Groups 的圖示是 `person.3`，選中時是 `person.3.fill`；Expenses 是 `creditcard` 和 `creditcard.fill`；Settings 是 `gearshape` 和 `gearshape.fill`

### Requirement: SHELL-8.1 Android 的分頁圖示

WHERE Android，the mobile app SHALL 以 Material Symbols `groups`、`payments`、`settings` 作為 Groups、Expenses、Settings 的分頁圖示，分頁選中時也用同一個圖示。

#### Scenario: 分頁圖示

- **WHEN** Android 上顯示分頁列
- **THEN** Groups、Expenses、Settings 的圖示是 `groups`、`payments`、`settings`，選中時不變

### Requirement: SHELL-9.1 分頁根畫面只有原生標題列

The mobile app SHALL 讓各分頁的根畫面只有一個原生標題列，顯示分頁名稱「Groups」、「Expenses」或「Settings」，畫面內容不另外顯示這個標題。

#### Scenario: 打開 app

- **WHEN** 打開 app，本機資料開好
- **THEN** 三個分頁根畫面的標題列分別是「Groups」、「Expenses」、「Settings」，沒有其他標題列，例如標題是 `(tabs)` 的標題列

#### Scenario: 畫面內容

- **WHEN** 顯示分頁的根畫面
- **THEN** 畫面內容裡沒有一段文字剛好是「Groups」、「Expenses」或「Settings」；像「Archived Groups」這樣只是包含分頁名稱的文字不算

### Requirement: SHELL-10.1 iOS 的分頁根畫面用大標題

WHERE iOS，the mobile app SHALL 讓各分頁根畫面的標題是可收合的原生大標題。

#### Scenario: 分頁根畫面

- **WHEN** iOS 上顯示 Groups、Expenses 或 Settings 的根畫面
- **THEN** 標題是原生大標題

### Requirement: SHELL-11.1 分頁的網址

The mobile app SHALL 以網址 `/` 代表 Expenses 分頁、`/groups` 代表 Groups 分頁、`/settings` 代表 Settings 分頁。

#### Scenario: 開啟網址

- **WHEN** 以 `/`、`/groups` 或 `/settings` 開啟 app
- **THEN** 選中 Expenses、Groups 或 Settings，顯示它的根畫面，目前的網址就是開啟的網址

#### Scenario: 切換分頁

- **WHEN** 在 Expenses 點 Groups 分頁
- **THEN** 目前的網址是 `/groups`

### Requirement: SHELL-12.1 從 Settings 推入的畫面留在 Settings 分頁

WHEN 從 Settings 的根畫面推入 Archived Groups（`/settings/archived-groups`）或 Manage Categories（`/settings/manage-categories`），the mobile app SHALL 把它推到 Settings 分頁的堆疊上，標題是「Archived Groups」或「Manage Categories」，分頁列仍選中 Settings。

#### Scenario: 推入 Archived Groups

- **WHEN** 在 Settings 的根畫面推入 `/settings/archived-groups`
- **THEN** 分頁列仍選中 Settings，Settings 分頁的堆疊由下而上是「Settings」根畫面和「Archived Groups」，目前的網址是 `/settings/archived-groups`

#### Scenario: 推入 Manage Categories

- **WHEN** 在 Settings 的根畫面推入 `/settings/manage-categories`
- **THEN** 分頁列仍選中 Settings，Settings 分頁的堆疊由下而上是「Settings」根畫面和「Manage Categories」，目前的網址是 `/settings/manage-categories`

#### Scenario: 返回

- **WHEN** 在推入的 Archived Groups 返回
- **THEN** 回到 Settings 的根畫面，分頁列仍選中 Settings

### Requirement: SHELL-13.1 iOS 的返回按鈕只有箭頭

WHERE iOS，the mobile app SHALL 讓返回按鈕只顯示箭頭，無障礙名稱是「Back」，不顯示前一個畫面的標題或 `(tabs)` 等路由名稱。

#### Scenario: Archived Groups 的返回按鈕

- **WHEN** iOS 上從 Settings 的根畫面推入 Archived Groups
- **THEN** 返回按鈕只有箭頭，沒有「Settings」字樣，無障礙名稱是「Back」

### Requirement: SHELL-14.1 iPad 維持分頁列

WHERE iPad，the mobile app SHALL 維持分頁列，不換成側邊欄。

#### Scenario: 在 iPad 上

- **WHEN** 在 iPad 上顯示分頁
- **THEN** 顯示分頁列，沒有側邊欄，也不能切換成側邊欄

### Requirement: SHELL-15.1 Android 返回鍵先回到 Expenses

WHERE Android，the mobile app SHALL 讓系統返回鍵在 Groups 或 Settings 的根畫面切到 Expenses 分頁，在 Expenses 的根畫面離開 app。

#### Scenario: 在 Groups 按返回鍵

- **WHEN** 從 Expenses 點到 Groups 分頁，再按返回鍵
- **THEN** 切到 Expenses，app 沒有離開

#### Scenario: 在 Settings 按返回鍵

- **WHEN** 從 Expenses 點到 Groups，再點到 Settings，然後按返回鍵
- **THEN** 切到 Expenses，不是 Groups

#### Scenario: 以網址開啟 Groups

- **WHEN** 以 `/groups` 開啟 app，按兩次返回鍵
- **THEN** 第一次切到 Expenses，第二次離開 app

#### Scenario: 在 Expenses 按返回鍵

- **WHEN** 在 Expenses 的根畫面按返回鍵
- **THEN** 離開 app

#### Scenario: 先退出推入的畫面

- **WHEN** 在 Settings 的根畫面推入 Archived Groups，再按兩次返回鍵
- **THEN** 第一次回到 Settings 的根畫面，第二次切到 Expenses
