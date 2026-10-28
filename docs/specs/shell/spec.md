# Shell

## Purpose

App 外殼：開啟本機資料、開啟期間的載入畫面、打不開時的錯誤畫面、這支手機的本機身分，載入後的分頁列、各分頁自己的堆疊和返回按鈕，以及 Settings 根畫面上的名字和入口列。本機資料是手機上的 SQLite 資料庫；開啟時依序跑 migration，還沒有本機身分時再建立一個（ADR-0006）。開發版是指 `__DEV__` 為真的 build。分頁的根畫面是分頁堆疊最底下的畫面，也就是選中分頁時最先看到的畫面。名字是本機身分裡存著的名字。

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

WHERE iOS，the mobile app SHALL 讓各分頁根畫面的標題是原生大標題。

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

### Requirement: SHELL-16.1 Settings 根畫面的內容

The mobile app SHALL 在 Settings 根畫面顯示 PROFILE 區塊和排在它後面的 APP 區塊：PROFILE 有「Your Name」名字欄位，下方說明「Used to identify you in shared expenses and balances.」；APP 有「Manage Categories」和「Archived Groups」兩列。

#### Scenario: 打開 Settings

- **WHEN** 選中 Settings 分頁
- **THEN** 由上而下依序看到「PROFILE」、「Your Name」、「Used to identify you in shared expenses and balances.」、「APP」、「Manage Categories」、「Archived Groups」

### Requirement: SHELL-17.1 名字欄位顯示存著的名字

The mobile app SHALL 讓名字欄位的無障礙名稱是「Your name」，欄位顯示存著的名字；還沒有名字時，欄位是空的並顯示「Enter your name」。

#### Scenario: 還沒有名字

- **WHEN** 第一次打開 app，選中 Settings 分頁
- **THEN** 名字欄位是空的，顯示「Enter your name」

#### Scenario: 重新啟動後

- **WHEN** 存好「Taylor」後重新啟動 app
- **THEN** 名字欄位顯示「Taylor」

### Requirement: SHELL-18.1 失焦或按 Return 時儲存名字

WHEN 名字欄位失去焦點或按下 Return，the mobile app SHALL 把欄位的文字去掉頭尾空白後存成名字，欄位改顯示去空白後的值，app 其他地方也立即改用新的名字；畫面上沒有 Save 按鈕，存好時也不顯示任何提示。

#### Scenario: 失焦時儲存

- **WHEN** 輸入「 Taylor 」後讓欄位失焦
- **THEN** 名字存成「Taylor」，欄位顯示「Taylor」，沒有任何提示，讀取本機身分的地方立即拿到「Taylor」

#### Scenario: 按 Return 時儲存

- **WHEN** 輸入「Sam」後按 Return
- **THEN** 名字存成「Sam」

#### Scenario: 沒有 Save 按鈕

- **WHEN** 選中 Settings 分頁
- **THEN** 畫面上沒有 Save 按鈕

### Requirement: SHELL-19.1 名字沒變時不儲存

IF 欄位的文字去掉頭尾空白後和存著的名字相同，THEN the mobile app SHALL 不儲存，也不顯示任何提示。

#### Scenario: 只多了空白

- **WHEN** 名字是「Taylor」，輸入「 Taylor 」後讓欄位失焦
- **THEN** 不儲存，沒有任何提示；即使這時寫入會失敗，也不顯示失敗的提示

#### Scenario: 還沒有名字

- **WHEN** 還沒存過名字，欄位只有空白就失焦
- **THEN** 不儲存，也不顯示「Please enter your name」

### Requirement: SHELL-20.1 清空名字時在欄位下方提示

IF 已經存過名字，而欄位的文字去掉頭尾空白後是空的，THEN the mobile app SHALL 不儲存、不跳出提示框，在名字欄位下方顯示「Please enter your name」並讓螢幕閱讀器念出來，直到下一次失焦或按 Return 時欄位有非空白的文字；欄位保留使用者輸入的內容。

#### Scenario: 清空後失焦

- **WHEN** 名字是「Taylor」，清空欄位後讓它失焦
- **THEN** 欄位維持空白，下方顯示「Please enter your name」，螢幕閱讀器念出這句話，沒有提示框，名字仍是「Taylor」

#### Scenario: 只有空白時按 Return

- **WHEN** 名字是「Taylor」，輸入「   」後按 Return
- **THEN** 下方顯示「Please enter your name」，沒有提示框，名字仍是「Taylor」

#### Scenario: 存好新的名字

- **WHEN** 出現「Please enter your name」之後，輸入「Sam」並讓欄位失焦
- **THEN** 名字存成「Sam」，「Please enter your name」消失

#### Scenario: 改回原本的名字

- **WHEN** 出現「Please enter your name」之後，輸入「Taylor」並讓欄位失焦
- **THEN** 不儲存，「Please enter your name」消失

#### Scenario: 新的名字存不進去

- **WHEN** 出現「Please enter your name」之後，資料庫無法寫入時輸入「Sam」並讓欄位失焦
- **THEN** 跳出「Unable to Save Settings」，「Please enter your name」消失，名字仍是「Taylor」

### Requirement: SHELL-21.1 儲存中鎖住名字欄位

WHILE 名字正在儲存，the mobile app SHALL 讓名字欄位不能編輯，並忽略再次失焦或按 Return，所以一次編輯只存一次。

#### Scenario: 儲存中

- **WHEN** 輸入「Taylor」後按 Return，儲存還沒完成
- **THEN** 名字欄位不能編輯；存好後恢復可以編輯，顯示「Taylor」

#### Scenario: 按 Return 又失焦

- **WHEN** 輸入「Taylor」後按 Return，儲存完成前欄位又失焦，而這次儲存失敗
- **THEN** 只跳出一次「Unable to Save Settings」

### Requirement: SHELL-22.1 儲存失敗時提示

IF 名字存不進去，THEN the mobile app SHALL 跳出標題「Unable to Save Settings」、內容「Your settings could not be saved. Please try again.」的提示框，名字維持原本的值，欄位保留輸入的文字並恢復可以編輯。

#### Scenario: 寫入失敗

- **WHEN** 資料庫無法寫入時，輸入「Taylor」並讓欄位失焦
- **THEN** 跳出這個提示框，名字仍是原本的值，欄位顯示「Taylor」而且可以編輯

#### Scenario: 再試一次

- **WHEN** 寫入失敗後資料庫恢復，再按一次 Return
- **THEN** 名字存成「Taylor」

### Requirement: SHELL-23.1 點入口列推入 Settings 分頁的畫面

WHEN 使用者在 Settings 根畫面點「Manage Categories」或「Archived Groups」，the mobile app SHALL 在 Settings 分頁推入對應的畫面。

#### Scenario: 點 Manage Categories

- **WHEN** 點「Manage Categories」
- **THEN** 分頁列仍選中 Settings，Settings 分頁的堆疊由下而上是「Settings」根畫面和「Manage Categories」，目前的網址是 `/settings/manage-categories`

#### Scenario: 點 Archived Groups

- **WHEN** 點「Archived Groups」
- **THEN** 分頁列仍選中 Settings，Settings 分頁的堆疊由下而上是「Settings」根畫面和「Archived Groups」，目前的網址是 `/settings/archived-groups`

### Requirement: SHELL-24.1 鍵盤開著或字級放大時仍能操作 Settings

WHILE 鍵盤開著或字級放大，the mobile app SHALL 讓 Settings 根畫面可以捲動到每一列，點另一列時直接執行那一列的動作，不會只收起鍵盤。

#### Scenario: 輸入名字時點一列

- **WHEN** 正在輸入名字、鍵盤開著時點「Archived Groups」
- **THEN** 直接推入 Archived Groups，不必再點一次

#### Scenario: 字級放大

- **WHEN** 字級放大到一頁放不下所有列
- **THEN** 可以捲動到每一列

### Requirement: SHELL-25.1 iOS 大標題在捲動時收合

WHERE iOS，WHEN 分頁根畫面的內容比螢幕長並往上捲動，the mobile app SHALL 把大標題收合成一般標題。

#### Scenario: 捲動 Settings

- **WHEN** iOS 上 Settings 根畫面的內容比螢幕長（例如字級放大），往上捲動
- **THEN** 大標題收合成一般標題
