# Shell

## Purpose

App 外殼：開啟本機資料、開啟期間的載入畫面、打不開時的錯誤畫面、這支手機的本機身分，載入後的分頁列、各分頁自己的堆疊和返回按鈕，Settings 根畫面上的名字、外觀選項和入口列，app 的深淺色和半透明表面，以及各畫面共用的 + 按鈕和標題列動作。本機資料是手機上的 SQLite 資料庫；開啟時依序跑 migration，還沒有本機身分時再建立一個（ADR-0006）。開發版是指 `__DEV__` 為真的 build。分頁的根畫面是分頁堆疊最底下的畫面，也就是選中分頁時最先看到的畫面。名字是本機身分裡存著的名字。外觀選項是存在本機資料裡的 System、Light 或 Dark；app 的外觀是 app 現在用淺色還是深色：外觀選項是 Light 或 Dark 時就是它，是 System 時跟著手機。跟著外觀的顏色是指淺色和深色時不同的顏色，或是由系統依外觀決定的顏色。「降低透明度」是 iOS 輔助使用裡的同名設定。毛玻璃是看得到後面模糊內容的半透明表面；玻璃是 iOS 26 起的 Liquid Glass。app 自己加的毛玻璃或玻璃，不包括分頁列、標題列、分段控制這些系統元件本身畫的。+ 按鈕是畫面浮在底部的圓形按鈕；標題列動作是畫面放在自己標題列上的取消、確認、編輯，以及收進選單的其他動作；一個選單最多放兩個動作，畫面可以把選單裡的動作標成破壞性的。它們的名稱、要執行的動作和是否停用，都由畫面決定。選項選單是畫面放在標題列上、讓使用者從二到三個選項裡選一個的選單，它的名稱、標題、圖示、選項、每個選項要執行的動作和現在的選項，都由畫面決定。分頁裡的畫面是分頁堆疊上、看得到分頁列的畫面；分頁外的畫面是不在分頁堆疊上、看不到分頁列的畫面。下方安全區是畫面底部被系統擋住的高度，在 iOS 的分頁裡也包括分頁列。

本機資料開好之後，App 外殼也規定畫面讀不出本機資料時的錯誤，以及畫面重新讀取時按下的動作。畫面讀本機資料，是畫面讀它要顯示或要用來決定動作的本機資料，例如 Groups 根畫面讀群組：讀出來就是讀完，讀的時候出錯就是讀不出本機資料；寫入本機資料時出錯不算讀不出，照各畫面自己的提示處理，例如 SHELL-22.1。畫面回到前景，是它又成為看得到的畫面，例如切回它所在的分頁、從推在它上面的畫面返回，或蓋在它上面的表單關閉；回到前景時再讀一次本機資料的畫面，從回到前景到再讀完之前是還沒重新讀完。從底部升起的表單是從畫面底部升起、蓋在其他畫面上的畫面，例如 Members、Balances 和支出表單。

## Requirements

### Requirement: SHELL-1.2 載入期間只顯示載入指示

WHILE 本機資料還在開啟，或是在 iOS 上還不知道有沒有開「降低透明度」，the mobile app SHALL 只顯示一個無障礙標籤為「Restoring local data」的載入指示，不顯示 app 的畫面。

#### Scenario: 還沒開好

- **WHEN** 本機資料庫還沒開好
- **THEN** 畫面上只有標籤為「Restoring local data」的載入指示

#### Scenario: 開好之後

- **WHEN** 本機資料開好了，在 iOS 上也知道了有沒有開「降低透明度」
- **THEN** 載入指示消失，顯示 app 的畫面

#### Scenario: iOS 還不知道「降低透明度」

- **WHEN** iOS 上本機資料開好了，但系統還沒回答有沒有開「降低透明度」
- **THEN** 畫面上仍然只有載入指示；系統回答之後才顯示 app 的畫面

#### Scenario: Android 不等「降低透明度」

- **WHEN** Android 上本機資料開好了，系統一直沒回答有沒有開「降低透明度」
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

### Requirement: SHELL-16.2 Settings 根畫面的 PROFILE 和 APP 區塊

The mobile app SHALL 在 Settings 根畫面顯示 PROFILE 區塊和排在它後面的 APP 區塊：PROFILE 有「Your Name」名字欄位，下方說明「Used to identify you in shared expenses and balances.」；APP 有「Manage Categories」、「Archived Groups」和「Trash」三列。

#### Scenario: 打開 Settings

- **WHEN** 選中 Settings 分頁
- **THEN** 由上而下依序看到「PROFILE」、「Your Name」、「Used to identify you in shared expenses and balances.」、「APP」、「Manage Categories」、「Archived Groups」、「Trash」

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

### Requirement: SHELL-23.2 點入口列推入 Settings 分頁的畫面

WHEN 使用者在 Settings 根畫面點「Manage Categories」、「Archived Groups」或「Trash」，the mobile app SHALL 在 Settings 分頁推入對應的畫面。

#### Scenario: 點 Manage Categories

- **WHEN** 點「Manage Categories」
- **THEN** 分頁列仍選中 Settings，Settings 分頁的堆疊由下而上是「Settings」根畫面和「Manage Categories」，目前的網址是 `/settings/manage-categories`

#### Scenario: 點 Archived Groups

- **WHEN** 點「Archived Groups」
- **THEN** 分頁列仍選中 Settings，Settings 分頁的堆疊由下而上是「Settings」根畫面和「Archived Groups」，目前的網址是 `/settings/archived-groups`

#### Scenario: 點 Trash

- **WHEN** 點「Trash」
- **THEN** 分頁列仍選中 Settings，Settings 分頁的堆疊由下而上是「Settings」根畫面和「Trash」，目前的網址是 `/settings/trash`

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

### Requirement: SHELL-26.1 Settings 根畫面的 APPEARANCE 區塊

The mobile app SHALL 在 Settings 根畫面的 PROFILE 和 APP 區塊之間顯示 APPEARANCE 區塊，裡面是無障礙名稱為「Appearance」的單選群組，依序是「System」、「Light」、「Dark」三個選項，並標示現在的外觀選項；還沒選過時是 System。

#### Scenario: 打開 Settings

- **WHEN** 選中 Settings 分頁
- **THEN** 由上而下依序看到「PROFILE」、「APPEARANCE」、「APP」三個區塊標題，APPEARANCE 裡依序是「System」、「Light」、「Dark」

#### Scenario: 還沒選過

- **WHEN** 第一次打開 app，選中 Settings 分頁
- **THEN** 標示的是 System

### Requirement: SHELL-27.2 (manual) iOS 的外觀選擇器

WHERE iOS，the mobile app SHALL 把 Appearance 單選群組顯示成 large 大小的系統分段控制，拖曳滑塊再放開時吸附到最近的選項並選它；沒開「降低透明度」時，拖曳會顯示系統的 Liquid Glass 效果。

#### Scenario: 拖曳

- **WHEN** 把滑塊從 System 拖到 Light 和 Dark 之間、靠近 Dark 的地方再放開
- **THEN** 滑塊吸附到 Dark，app 變成深色

#### Scenario: 外觀

- **WHEN** iOS 26 上沒有開「降低透明度」，拖曳滑塊
- **THEN** 滑塊是 Liquid Glass，分段控制是 large 的高度

### Requirement: SHELL-28.1 Android 的外觀選擇器

WHERE Android，the mobile app SHALL 把 Appearance 單選群組的三個選項顯示成並排的按鈕，螢幕閱讀器把現在的選項念成已勾選。

#### Scenario: 打開 Settings

- **WHEN** Android 上選中 Settings 分頁
- **THEN** APPEARANCE 裡是並排的「System」、「Light」、「Dark」三個按鈕，System 是已勾選

### Requirement: SHELL-29.1 選 Light 或 Dark 時立即套用並存起來

WHEN 使用者選 Light 或 Dark，the mobile app SHALL 立即讓 app 的外觀變成這個選項，不管手機用淺色還是深色，標示這個選項，並把它存成外觀選項；存好時不顯示任何提示。

#### Scenario: 選 Dark

- **WHEN** 手機是淺色，在 Settings 根畫面選「Dark」
- **THEN** app 立即變成深色，標示 Dark，沒有任何提示

#### Scenario: 選 Light

- **WHEN** 手機是深色，選「Light」
- **THEN** app 立即變成淺色，標示 Light

### Requirement: SHELL-30.1 選 System 時跟著手機

WHEN 使用者選 System，the mobile app SHALL 不再自己決定外觀，讓 app 的外觀跟著手機，手機之後切換淺色或深色時也立即跟著切換。

#### Scenario: 從 Dark 選回 System

- **WHEN** 手機是淺色，選了 Dark 之後再選「System」
- **THEN** app 立即回到淺色，標示 System

#### Scenario: 手機切換

- **WHEN** 外觀選項是 System，手機從淺色切成深色，再切回淺色
- **THEN** app 每次都立即跟著切換

### Requirement: SHELL-31.1 啟動時就是存著的外觀

WHEN app 啟動，the mobile app SHALL 在載入指示消失、第一次顯示 app 的畫面時，就已經是存著的外觀選項，Settings 也標示它。

#### Scenario: 存著 Dark

- **WHEN** 手機是淺色，選了 Dark 之後重新啟動 app
- **THEN** 第一個畫面就是深色，Settings 標示 Dark

#### Scenario: 還沒選過

- **WHEN** 手機是深色，第一次啟動 app
- **THEN** app 是深色，Settings 標示 System

### Requirement: SHELL-32.1 儲存中鎖住外觀選擇器

WHILE 外觀選項正在儲存，the mobile app SHALL 讓 Appearance 單選群組不能操作，所以一次選擇只存一次。

#### Scenario: 儲存中

- **WHEN** 選了「Dark」，儲存還沒完成
- **THEN** 三個選項都不能選；存好後恢復可以選，標示 Dark

#### Scenario: 儲存中點另一個選項

- **WHEN** 選了「Dark」，儲存還沒完成時點「Light」
- **THEN** 沒有任何反應；重新啟動 app 後，外觀選項是 Dark

### Requirement: SHELL-33.1 外觀選項存不進去時提示

IF 外觀選項存不進去，THEN the mobile app SHALL 跳出標題「Unable to Save Settings」、內容「Your settings could not be saved. Please try again.」的提示框，app 的外觀和標示的選項都維持原本的值，選擇器恢復可以操作。

#### Scenario: 寫入失敗

- **WHEN** 手機是淺色、外觀選項是 System，資料庫無法寫入時選「Dark」
- **THEN** 跳出這個提示框一次，app 仍是淺色，標示 System，選項可以選

#### Scenario: 再試一次

- **WHEN** 寫入失敗後資料庫恢復，再選一次「Dark」
- **THEN** app 變成深色；重新啟動 app 後，外觀選項是 Dark

### Requirement: SHELL-34.1 顏色跟著外觀

The mobile app SHALL 讓畫面的背景、文字、區塊、分隔線和提示文字都用跟著 app 外觀的顏色，每段文字都指定顏色；本機資料的載入和錯誤畫面用跟著手機外觀的顏色。使用者資料裡的顏色，例如分類的顏色，不在這條規則裡。

#### Scenario: 分頁的根畫面

- **WHEN** app 從淺色變成深色
- **THEN** Groups、Expenses、Settings 的根畫面和標題列都只用跟著外觀的顏色，每段文字都指定了顏色

#### Scenario: 載入畫面

- **WHEN** 手機是淺色或深色，本機資料還在開啟
- **THEN** 載入畫面有背景顏色，只用跟著手機外觀的顏色

#### Scenario: 錯誤畫面

- **WHEN** 手機是淺色或深色，本機資料打不開
- **THEN** 錯誤畫面有背景顏色，背景和兩行字只用跟著手機外觀的顏色

### Requirement: SHELL-35.1 iOS 的 Settings 區塊用毛玻璃

WHERE iOS，WHILE 沒有開「降低透明度」，the mobile app SHALL 讓 Settings 根畫面的 PROFILE 和 APP 區塊用毛玻璃。

#### Scenario: 沒開「降低透明度」

- **WHEN** iOS 上沒有開「降低透明度」，打開 Settings
- **THEN** PROFILE 和 APP 區塊都是毛玻璃

### Requirement: SHELL-36.1 iOS 開著「降低透明度」時不透明

WHERE iOS，WHILE 開著「降低透明度」，the mobile app SHALL 讓畫面上沒有 app 自己加的毛玻璃或玻璃，區塊都改用不透明的顏色；app 啟動時只問系統一次，之後跟著系統的變更通知立即切換。

#### Scenario: 開著

- **WHEN** iOS 上開著「降低透明度」，打開 Settings
- **THEN** PROFILE 和 APP 區塊不透明，畫面上沒有 app 自己加的毛玻璃或玻璃

#### Scenario: 執行中打開

- **WHEN** Settings 開著時，在系統打開「降低透明度」
- **THEN** 區塊立即變成不透明，畫面上沒有 app 自己加的毛玻璃

#### Scenario: 執行中關掉

- **WHEN** 開著「降低透明度」時打開 Settings，再在系統關掉它
- **THEN** 區塊立即變成毛玻璃

#### Scenario: 只問一次

- **WHEN** app 啟動、打開 Settings，之後在系統切換「降低透明度」兩次
- **THEN** app 只問過系統一次有沒有開「降低透明度」

### Requirement: SHELL-37.1 iOS 問不到「降低透明度」時當成開著

WHERE iOS，IF 系統回答不了有沒有開「降低透明度」，THEN the mobile app SHALL 當成開著，直到系統通知它的值。

#### Scenario: 問不到

- **WHEN** iOS 上問「降低透明度」時發生錯誤
- **THEN** app 照常顯示畫面，Settings 的區塊不透明，畫面上沒有 app 自己加的毛玻璃或玻璃

#### Scenario: 之後收到通知

- **WHEN** 問不到之後，系統通知「降低透明度」是關著的
- **THEN** 區塊變成毛玻璃

### Requirement: SHELL-38.1 Android 用不透明的表面

WHERE Android，the mobile app SHALL 不自己加毛玻璃或玻璃，區塊都用不透明的顏色。

#### Scenario: 打開 Settings

- **WHEN** Android 上打開 Settings
- **THEN** 畫面上沒有 app 自己加的毛玻璃或玻璃，PROFILE 和 APP 區塊不透明

### Requirement: SHELL-39.1 (e2e) iOS 上點一下就選中外觀選項

WHERE iOS，WHEN 使用者在 Settings 根畫面點 Appearance 分段控制的一個選項，the mobile app SHALL 選中那個選項。

#### Scenario: 點 Dark

- **WHEN** iOS 上第一次打開 app，在 Settings 根畫面點「Dark」
- **THEN** 選中的是 Dark，不再是 System；重新打開 app 後仍是 Dark

### Requirement: SHELL-40.1 (e2e) iOS 外觀選擇器的無障礙資訊

WHERE iOS，the mobile app SHALL 讓 Appearance 分段控制在無障礙功能裡是名稱為「Appearance」的群組，裡面是「System」、「Light」、「Dark」三個選項，現在的選項標示成已選取，讓 VoiceOver 念出來。

#### Scenario: 打開 Settings

- **WHEN** iOS 上第一次打開 app，選中 Settings 分頁
- **THEN** 有一個名稱為「Appearance」的群組，裡面是「System」、「Light」、「Dark」，只有 System 標示成已選取

### Requirement: SHELL-41.1 + 按鈕的位置、大小和名稱

The mobile app SHALL 把 + 按鈕放在畫面底部的正中間，是 60×60 的圓形，表面沒有用玻璃時是不透明的顏色，角色是 button，無障礙名稱是畫面給的名稱，畫面沒給時是「Add expense」。

#### Scenario: 畫面給了名稱

- **WHEN** 畫面顯示名稱是「Add group」的 + 按鈕
- **THEN** 畫面上有一個角色是 button、名稱是「Add group」的按鈕，是水平置中的 60×60 圓形

#### Scenario: 畫面沒給名稱

- **WHEN** 畫面顯示 + 按鈕，沒給名稱
- **THEN** 按鈕的名稱是「Add expense」

#### Scenario: 沒有玻璃

- **WHEN** Android 上，或是 iOS 上開著「降低透明度」時，顯示 + 按鈕
- **THEN** 按鈕的表面是不透明的顏色

### Requirement: SHELL-42.1 + 按鈕和畫面底部的距離

The mobile app SHALL 讓 + 按鈕的底邊和畫面底部的距離，在 iOS 上是下方安全區的高度加 16；在 Android 上，分頁裡的畫面是 16，分頁外的畫面是下方安全區的高度加 16。

#### Scenario: iOS 的分頁裡

- **WHEN** iOS 上分頁裡的畫面顯示 + 按鈕，下方安全區是分頁列加上 Home 指示條的 83
- **THEN** 按鈕的底邊離畫面底部 99，也就是在分頁列上方 16

#### Scenario: iOS 的分頁外

- **WHEN** iOS 上分頁外的畫面顯示 + 按鈕，下方安全區是 34
- **THEN** 按鈕的底邊離畫面底部 50

#### Scenario: Android 的分頁裡

- **WHEN** Android 上分頁裡的畫面顯示 + 按鈕，下方安全區是 24
- **THEN** 按鈕的底邊離畫面底部 16；畫面在分頁列上方就結束，所以也是在分頁列上方 16

#### Scenario: Android 的分頁外

- **WHEN** Android 上分頁外的畫面顯示 + 按鈕，下方安全區是 24
- **THEN** 按鈕的底邊離畫面底部 40

#### Scenario: 安全區改變

- **WHEN** iOS 上分頁外的畫面顯示 + 按鈕時，下方安全區從 34 變成 21，例如手機轉成橫向
- **THEN** 按鈕的底邊立即改成離畫面底部 37

### Requirement: SHELL-43.1 每按一次就執行一次

WHEN 使用者按 + 按鈕或標題列的動作，the mobile app SHALL 每按一次就執行一次畫面給的動作。

#### Scenario: 連按兩次 + 按鈕

- **WHEN** 連按兩次 + 按鈕
- **THEN** 畫面給的動作執行兩次

#### Scenario: 標題列的動作

- **WHEN** 按一次確認「Add」，再從選單選一次「Members」
- **THEN** 「Add」和「Members」的動作各執行一次

### Requirement: SHELL-44.1 iOS 的 + 按鈕圖示和按壓回饋

WHERE iOS，the mobile app SHALL 讓 + 按鈕的圖示是文字顏色的 SF Symbol `plus`，按住時把按鈕縮成 0.96 倍，觸發動作時發出一次輕的觸覺回饋。

#### Scenario: 圖示

- **WHEN** iOS 上顯示 + 按鈕
- **THEN** 圖示是文字顏色的 `plus`，螢幕閱讀器只念按鈕的名稱

#### Scenario: 按住再放開

- **WHEN** 按住 + 按鈕，再放開
- **THEN** 按住時按鈕縮成 0.96 倍，放開後恢復原來的大小

#### Scenario: 觸覺回饋

- **WHEN** 按住 + 按鈕，再放開
- **THEN** 手指碰到按鈕時沒有觸覺回饋，放開、觸發動作時發出一次輕的觸覺回饋

### Requirement: SHELL-45.1 (manual) iOS 的 + 按鈕用玻璃

WHERE iOS，WHILE 沒有開「降低透明度」，the mobile app SHALL 讓 + 按鈕在 iOS 26 起是會回應觸碰的 Liquid Glass，在更早的 iOS 是不透明的顏色。

#### Scenario: iOS 26

- **WHEN** iOS 26 上沒有開「降低透明度」，按住 + 按鈕
- **THEN** 按鈕是 Liquid Glass，按住時玻璃有觸碰的效果

#### Scenario: 更早的 iOS

- **WHEN** iOS 18 上顯示 + 按鈕
- **THEN** 按鈕是不透明的顏色

### Requirement: SHELL-46.1 Android 的 + 按鈕圖示和按壓回饋

WHERE Android，the mobile app SHALL 讓 + 按鈕的圖示是「+」字，按下時顯示 ripple，不發出觸覺回饋。

#### Scenario: 圖示

- **WHEN** Android 上顯示 + 按鈕
- **THEN** 圖示是「+」字，螢幕閱讀器只念按鈕的名稱

#### Scenario: 按下

- **WHEN** 按一下 + 按鈕
- **THEN** 按鈕顯示 ripple，沒有觸覺回饋

### Requirement: SHELL-47.2 iOS 的標題列動作

WHERE iOS，the mobile app SHALL 把畫面給的標題列動作放進原生標題列：取消和關閉是左邊 plain 樣式、圖示是 SF Symbol `xmark` 的按鈕，確認是右邊 prominent 樣式、圖示是 SF Symbol `checkmark` 的按鈕，兩者都用系統的顏色，不另外指定，無障礙名稱是畫面給的文字；其他動作依序收進右邊一個圖示是 SF Symbol `ellipsis.circle` 的原生選單，選單的無障礙名稱是畫面給的名稱；確認和選單都有時，確認在最右邊。不是取消、確認的文字動作（例如「Edit」）維持文字。

#### Scenario: 取消和確認

- **WHEN** iOS 上畫面給取消「Cancel」和確認「Add」
- **THEN** 標題列左邊是 plain、圖示 `xmark`、名稱「Cancel」的按鈕，右邊是 prominent、圖示 `checkmark`、名稱「Add」的按鈕，都沒有另外指定顏色

#### Scenario: 關閉

- **WHEN** iOS 上畫面只給關閉「Close」，例如 Members 或 Group Categories
- **THEN** 標題列左邊是 plain、圖示 `xmark`、名稱「Close」的按鈕

#### Scenario: 其他動作

- **WHEN** 畫面給名稱是「Group actions」的選單，裡面依序是「Members」和「Delete」
- **THEN** 標題列右邊是圖示 `ellipsis.circle`、名稱「Group actions」的選單，依序列出「Members」和「Delete」

#### Scenario: 確認和選單

- **WHEN** 畫面同時給確認「Save」和名稱是「Expense actions」的選單
- **THEN** 標題列右邊由右而左是名稱「Save」的按鈕和選單

#### Scenario: Edit

- **WHEN** 打開支出的明細
- **THEN** 標題列的「Edit」是文字按鈕，沒有圖示

### Requirement: SHELL-48.1 Android 的標題列動作

WHERE Android，the mobile app SHALL 把畫面給的標題列動作顯示成至少 48×48 dp 的 Material Symbols 圖示按鈕，無障礙名稱是動作的名稱：取消是左邊的 `close`，確認是右邊強調色的 `check`，其他動作收進最右邊、名稱是選單名稱的 `more_vert`，按下後跳出標題是選單名稱的對話框，依序列出這些動作和「Cancel」。

#### Scenario: 取消和確認

- **WHEN** Android 上畫面給取消「Cancel」和確認「Add」
- **THEN** 標題列左邊是名稱「Cancel」的 `close`，右邊是名稱「Add」、強調色的 `check`，兩個按鈕都至少 48×48 dp

#### Scenario: 其他動作

- **WHEN** 畫面給名稱是「Group actions」的選單，裡面依序是「Members」和「Delete」，然後按名稱「Group actions」的 `more_vert`
- **THEN** 跳出標題「Group actions」的對話框，依序列出「Members」和「Delete」，另外有「Cancel」

#### Scenario: 確認和選單

- **WHEN** 畫面同時給確認「Save」和名稱是「Expense actions」的選單
- **THEN** 標題列右邊由左而右是 `check` 和 `more_vert`

#### Scenario: 按 Cancel

- **WHEN** 在對話框按「Cancel」
- **THEN** 對話框關掉，沒有執行任何動作

### Requirement: SHELL-49.1 停用的標題列動作

IF 畫面停用標題列的某個動作，THEN the mobile app SHALL 讓它不能按：iOS 上仍然顯示，按鈕和選單項目都是停用的樣子，選單本身一直能打開；Android 上圖示按鈕仍然顯示，不透明度是 38%，`more_vert` 的對話框不列出停用的動作，其他動作都停用時 `more_vert` 本身也停用。

#### Scenario: iOS 的按鈕

- **WHEN** iOS 上確認「Add」停用
- **THEN** 「Add」顯示成停用的，按了沒有反應

#### Scenario: iOS 的選單項目

- **WHEN** iOS 上選單裡的「Delete」停用
- **THEN** 選單照樣能打開，「Delete」是停用的，「Members」可以選

#### Scenario: iOS 的動作都停用

- **WHEN** iOS 上選單裡的「Members」和「Delete」都停用
- **THEN** 選單照樣能打開，兩個動作都是停用的

#### Scenario: Android 的按鈕

- **WHEN** Android 上確認「Add」停用
- **THEN** `check` 仍然顯示，不透明度 38%，按了沒有反應

#### Scenario: Android 的對話框

- **WHEN** Android 上選單裡的「Delete」停用，「Members」沒有停用
- **THEN** 對話框只列出「Members」和「Cancel」

#### Scenario: Android 的動作都停用

- **WHEN** Android 上選單裡的「Members」和「Delete」都停用
- **THEN** `more_vert` 仍然顯示，不透明度 38%，按了沒有反應

### Requirement: SHELL-50.1 Android 標題列按鈕的 ripple

WHERE Android，WHEN 使用者按下標題列上沒有停用的圖示按鈕，the mobile app SHALL 在按鈕上顯示半徑 24 dp 的圓形 ripple，顏色跟著 app 的外觀。

#### Scenario: 按下

- **WHEN** Android 上按下標題列的 `close`、`check` 或 `more_vert`
- **THEN** 按鈕上出現以按鈕中心為圓心、半徑 24 dp 的圓形 ripple

#### Scenario: 深色

- **WHEN** app 是深色時按下這些按鈕
- **THEN** ripple 的顏色和淺色時不同，或是由系統依外觀決定

### Requirement: SHELL-51.1 Android 選單的對話框可以直接關掉

WHERE Android，WHILE `more_vert` 的對話框開著，WHEN 使用者按返回鍵或點對話框外面，the mobile app SHALL 關掉對話框，不執行任何動作。

#### Scenario: 按返回鍵

- **WHEN** Android 上 `more_vert` 的對話框開著時按返回鍵
- **THEN** 對話框關掉，「Members」和「Delete」都沒有執行

#### Scenario: 點外面

- **WHEN** 對話框開著時點對話框外面
- **THEN** 對話框關掉，沒有執行任何動作

### Requirement: SHELL-52.1 標題列的編輯動作

The mobile app SHALL 把畫面給的編輯動作放在標題列右邊：iOS 上是 plain 樣式的文字按鈕，文字和無障礙名稱是畫面給的名稱；Android 上是至少 48×48 dp 的 Material Symbols `edit` 圖示按鈕，無障礙名稱是畫面給的名稱。

#### Scenario: iOS

- **WHEN** iOS 上畫面給名稱是「Edit」的編輯動作
- **THEN** 標題列右邊是 plain 的「Edit」

#### Scenario: Android

- **WHEN** Android 上畫面給名稱是「Edit」的編輯動作
- **THEN** 標題列右邊是名稱「Edit」的 `edit`，至少 48×48 dp

### Requirement: SHELL-53.1 破壞性的選單動作

WHERE iOS，the mobile app SHALL 用破壞性的樣式（紅字）顯示畫面標成破壞性的選單動作；選單裡其他的動作照常顯示。

#### Scenario: 標成破壞性

- **WHEN** iOS 上畫面給名稱是「Expense actions」的選單，裡面的「Delete」標成破壞性
- **THEN** 選單裡的「Delete」是破壞性的樣式

#### Scenario: 沒有標成破壞性

- **WHEN** iOS 上畫面給名稱是「Group actions」的選單，裡面的「Members」沒有標成破壞性
- **THEN** 選單裡的「Members」不是破壞性的樣式

### Requirement: SHELL-54.1 iOS 的選項選單

WHERE iOS，the mobile app SHALL 把畫面給的選項選單放在原生標題列的右邊，是圖示為畫面給的 SF Symbol、無障礙名稱是選單名稱的原生選單：選單最上面是畫面給的標題，下面依序列出選項，只有現在的選項打勾；選一個選項就執行它的動作一次。

#### Scenario: 選單

- **WHEN** iOS 上畫面給名稱「Chart visualization」、標題「Visualization」、圖示 `chart.bar.xaxis` 的選項選單，選項依序是「Auto」、「Donut」、「Bar」，現在的是 Auto
- **THEN** 標題列右邊是圖示 `chart.bar.xaxis`、名稱「Chart visualization」的選單，標題是「Visualization」，依序列出 Auto、Donut、Bar，只有 Auto 打勾

#### Scenario: 選一個選項

- **WHEN** 在選單選「Bar」
- **THEN** 執行 Bar 的動作一次，其他選項的動作都沒有執行

### Requirement: SHELL-55.1 Android 的選項選單

WHERE Android，the mobile app SHALL 把畫面給的選項選單放在標題列右邊，是至少 48×48 dp、圖示為畫面給的 Material Symbols 的圖示按鈕，無障礙名稱是「<選單名稱>, <現在的選項> selected」；按下時跳出標題是選單名稱的對話框，依序列出選項，現在的選項後面接「, selected」，沒有「Cancel」；選一個選項就執行它的動作一次；按返回鍵或點對話框外面就關掉對話框，不執行任何動作。

#### Scenario: 按鈕

- **WHEN** Android 上畫面給名稱「Chart visualization」、圖示 `bar_chart` 的選項選單，選項依序是「Auto」、「Donut」、「Bar」，現在的是 Auto
- **THEN** 標題列右邊是名稱「Chart visualization, Auto selected」的 `bar_chart`，至少 48×48 dp

#### Scenario: 對話框

- **WHEN** 按下這個按鈕
- **THEN** 跳出標題「Chart visualization」的對話框，依序列出「Auto, selected」、「Donut」和「Bar」，沒有「Cancel」；返回鍵或點外面可以關掉它

#### Scenario: 選一個選項

- **WHEN** 在對話框選「Bar」
- **THEN** 執行 Bar 的動作一次，其他選項的動作都沒有執行

### Requirement: SHELL-60.1 畫面讀不出本機資料時顯示錯誤

IF 畫面讀不出本機資料，THEN the mobile app SHALL 不關閉 app，讓這個畫面在標題列以下只顯示「Unable to Load Local Data」、「Your data was not changed.」和角色為 button、名稱為「Try Again」的按鈕，不顯示讀到一半或之前讀到的資料、沒有資料或找不到資料時的提示（例如 GROUPS-1.2、GROUPS-21.1、LEDGER-39.1、LEDGER-85.1、CATEGORIES-25.1 的）和 + 按鈕；標題列的標題是這個畫面還沒讀到資料時的標題，例如群組的畫面是「Group Details」，標題列上只有返回按鈕，或從底部升起的表單的取消動作；本機資料保持讀之前的樣子。Settings 根畫面讀不出數量要用的本機資料時，照 SHELL-62.1。

#### Scenario: Groups 根畫面

- **WHEN** 第一次啟動 app 後選中 Groups 分頁，Groups 根畫面讀不出群組
- **THEN** 標題是「Groups」，畫面上只有「Unable to Load Local Data」、「Your data was not changed.」和「Try Again」，沒有「No groups yet. Tap + to create a group.」，也沒有「Add group」；分頁列仍在，選中 Groups

#### Scenario: 找不到的群組

- **WHEN** 打開 `/groups/00000000-0000-4000-8000-000000000000`，群組的畫面讀不出群組
- **THEN** 標題是「Group Details」，畫面上只有這三樣，沒有「Group not found.」；標題列只有返回按鈕，沒有「Group actions」

#### Scenario: 支出的明細

- **WHEN** 打開 `/expenses/00000000-0000-4000-8000-000000000000`，明細讀不出支出
- **THEN** 標題是「Expense」，畫面上只有這三樣，沒有「Expense not found.」；標題列沒有「Edit」

#### Scenario: 從底部升起的表單

- **WHEN** 讀不出本機資料時打開 New Expense，或打開 Brisbane 的 Members
- **THEN** 表單上只有這三樣；New Expense 的標題列只有「Cancel」，沒有「Add」，Members 的只有「Close」

#### Scenario: 回到畫面時讀不出

- **WHEN** Groups 根畫面列出 Brisbane 之後切到 Expenses 分頁，再切回 Groups 時讀不出群組
- **THEN** 畫面上只有這三樣，沒有 Brisbane 的卡片

#### Scenario: 本機資料不變

- **WHEN** 畫面因為讀不出本機資料而顯示這三樣
- **THEN** 本機資料和讀之前完全一樣

### Requirement: SHELL-61.1 按 Try Again 時再讀一次

WHEN 使用者在讀不出本機資料的畫面按「Try Again」，the mobile app SHALL 再讀一次這個畫面的本機資料，讀完就照常顯示這個畫面，讀不出就仍顯示 SHELL-60.1 的錯誤；沒有按「Try Again」時，畫面回到前景也不再讀。

#### Scenario: 又讀得出來

- **WHEN** 有 Brisbane 時，Groups 根畫面讀不出群組之後，本機資料又讀得出來，按「Try Again」
- **THEN** 錯誤消失，顯示 Brisbane 的卡片和「Add group」

#### Scenario: 仍然讀不出

- **WHEN** 仍讀不出本機資料時按「Try Again」
- **THEN** 畫面上仍只有「Unable to Load Local Data」、「Your data was not changed.」和「Try Again」

#### Scenario: 離開再回來

- **WHEN** Groups 根畫面讀不出群組之後，本機資料又讀得出來，切到 Expenses 分頁再切回 Groups
- **THEN** 仍顯示錯誤；按「Try Again」之後才顯示 Brisbane 的卡片

#### Scenario: 表單

- **WHEN** New Expense 讀不出本機資料之後，本機資料又讀得出來，按「Try Again」
- **THEN** New Expense 照 LEDGER-13.2 顯示欄位，標題列有「Cancel」和「Add」

### Requirement: SHELL-62.1 Settings 根畫面讀不出時不顯示數量

IF Settings 根畫面讀不出「Archived Groups」或「Trash」那一列的數量要用的本機資料，THEN the mobile app SHALL 照常顯示 Settings 根畫面，只讓那一列不顯示數量，無障礙名稱是「Archived groups」或「Trash」（GROUPS-51.1、LEDGER-76.1），不顯示 SHELL-60.1 的錯誤；名字欄位、外觀選項和三個入口列都照常能用。Settings 根畫面回到前景時再讀一次，讀完就顯示數量。

#### Scenario: 都讀不出

- **WHEN** 第一次啟動 app 後選中 Settings 分頁，Settings 根畫面讀不出本機資料
- **THEN** 「Archived Groups」和「Trash」右邊都沒有數量，無障礙名稱是「Archived groups」和「Trash」；PROFILE、APPEARANCE 和 APP 區塊照常顯示，沒有「Unable to Load Local Data」

#### Scenario: 只讀不出支出

- **WHEN** 第一次啟動 app 後選中 Settings 分頁，Settings 根畫面讀得出群組、讀不出支出
- **THEN** 「Archived Groups」右邊是「0」，「Trash」右邊沒有數量

#### Scenario: 照常能用

- **WHEN** 讀不出本機資料時輸入名字「Taylor」並讓欄位失焦，再點「Archived Groups」
- **THEN** 名字存成「Taylor」；Settings 分頁推入 Archived Groups（SHELL-23.2），它讀不出群組，照 SHELL-60.1 顯示錯誤

#### Scenario: 回到 Settings 根畫面

- **WHEN** 本機資料又讀得出來之後，切到 Expenses 分頁再切回 Settings
- **THEN** 「Archived Groups」和「Trash」右邊都是「0」

### Requirement: SHELL-63.1 讀不出本機資料時照常離開畫面

WHILE 畫面顯示讀不出本機資料，the mobile app SHALL 讓使用者照常離開它：分頁列照常能切換分頁；推入的畫面照常能按返回按鈕回到上一個畫面；從底部升起的表單照常能按標題列的「Cancel」或「Close」，或往下滑關閉，不問要不要放棄變更；Android 的返回鍵照常回到上一個畫面或關閉表單，在分頁的根畫面照 SHELL-15.1。

#### Scenario: 切換分頁

- **WHEN** Groups 根畫面讀不出群組時點 Expenses 分頁
- **THEN** 選中 Expenses

#### Scenario: 返回

- **WHEN** 群組的畫面讀不出群組時按返回按鈕，或在 Android 上按返回鍵
- **THEN** 回到 Groups 根畫面

#### Scenario: 關閉表單

- **WHEN** New Expense 讀不出本機資料時按「Cancel」、往下滑，或在 Android 上按返回鍵
- **THEN** New Expense 關閉，沒有跳出「Discard Changes?」

#### Scenario: 關閉 Members

- **WHEN** Members 讀不出群組時按「Close」或往下滑
- **THEN** Members 關閉

#### Scenario: Android 的分頁根畫面

- **WHEN** Android 上從 Expenses 切到 Groups 分頁，Groups 根畫面讀不出群組時按返回鍵
- **THEN** 切到 Expenses

### Requirement: SHELL-64.1 還沒重新讀完時照舊顯示，按下的動作照重新讀完的畫面處理

WHILE 畫面還沒重新讀完，the mobile app SHALL 照舊顯示上一次讀到的內容和動作，不換成載入指示，也不先清空；這時使用者按下會改本機資料、或會打開能改本機資料的表單或提示框的動作，SHALL 把它當成在重新讀完的畫面上按下的：重新讀完的畫面上沒有這個動作或它不能按，就不打開表單或提示框，也不改本機資料；有的話照重新讀完的畫面來做。重新讀不出本機資料時，畫面照 SHELL-60.1 顯示錯誤，按下的動作也不做。

#### Scenario: Group Categories 的群組封存了

- **WHEN** Brisbane 的 Group Categories 開在 Settings 分頁時，在 Groups 分頁封存 Brisbane，切回 Settings 分頁，還沒重新讀完時點 Shopping、按「Add category」，或對 Shopping 做螢幕閱讀器的「Remove」動作
- **THEN** 重新讀完之後沒有開啟分類表單，也沒有跳出提示框，Brisbane 的分類都沒變；畫面照 CATEGORIES-43.1 是唯讀的

#### Scenario: 分類在別處改了名

- **WHEN** Manage Categories 開在 Settings 分頁時，以網址 `/manage-categories` 把 Shopping 改名為「Groceries」，切回 Settings 分頁，還沒重新讀完時點 Shopping
- **THEN** 重新讀完之後開啟「Edit Category」，名稱是「Groceries」

#### Scenario: 群組的畫面

- **WHEN** 從 Archived Groups 打開封存的 Brisbane、按「Restore Group」之後，在 Groups 分頁再封存 Brisbane，切回 Settings 分頁，還沒重新讀完時在 Group actions 選「Rename Group」，或按「Add expense」
- **THEN** 重新讀完之後沒有打開 Rename Group 或 New Expense；畫面照 GROUPS-55.2 顯示「Archived group. Expenses and allocations are read-only.」和「Restore Group」

#### Scenario: 支出的明細

- **WHEN** Brisbane 的 Dinner 的明細開在 Expenses 分頁時，在 Groups 分頁封存 Brisbane，切回 Expenses 分頁，還沒重新讀完時按「Edit」
- **THEN** 重新讀完之後沒有打開 Edit Expense，「Edit」照 LEDGER-67.2 停用

#### Scenario: 支出在別的分頁移到垃圾桶

- **WHEN** Brisbane 的 Dinner 的明細開在 Groups 分頁時，在 Expenses 分頁把 Dinner 移到垃圾桶，切回 Groups 分頁，還沒重新讀完時按「Edit」
- **THEN** 重新讀完之後沒有打開 Edit Expense，明細只顯示「Expense not found.」（LEDGER-71.3）

#### Scenario: 支出表單

- **WHEN** 在 New Expense 輸入金額和標題並選 Gym，從以網址 `/manage-categories` 打開的 Manage Categories 刪除 Gym 後關閉它，還沒重新讀完時按「Add」
- **THEN** 存下一筆支出，分類是個人空間的 Uncategorized（LEDGER-63.1）

#### Scenario: 重新讀不出

- **WHEN** Brisbane 的 Group Categories 切回來、還沒重新讀完時點 Shopping，而重新讀不出本機資料
- **THEN** 沒有開啟分類表單，畫面照 SHELL-60.1 顯示錯誤

### Requirement: SHELL-65.2 iOS 的分類表單使用同一套原生標題列

WHERE iOS，the mobile app SHALL 讓 New Category 和 Edit Category 的 sheet 使用原生標題列，標題只出現一次，操作照 SHELL-47.2：左邊是 Cancel，右邊分別是確認 Add 和 Save，內容捲動時標題與操作仍留在標題列。

#### Scenario: 新增與編輯分類

- **WHEN** 從 Manage Categories、Group Categories，或支出表單的「+ Add New Category」，打開 New Category 或 Edit Category
- **THEN** 原生標題列左邊是 Cancel，右邊是 Add 或 Save；名稱空白時確認按鈕停用，儲存中兩邊都停用

### Requirement: SHELL-66.2 (manual) Sheet 的初始高度依內容決定

WHERE iPhone 直向，WHEN 開啟從底部升起的 sheet，the mobile app SHALL 依內容決定初始高度：New Group、Rename Group、Rename Member、New Category 和 Edit Category 在內容能容納時貼合內容，最後一個內容與底部安全區之間的空白不超過一列內容的高度；內容超過可用高度時，sheet 直接開到整個可用高度並可捲動，不先變矮；鍵盤與大字級需要更多空間時可以增高或捲動，不能遮住目前輸入欄位或操作按鈕。支出表單貼合內容時，不能切掉表單的底部：最下面的列都看得到，按得到。

#### Scenario: 短表單

- **WHEN** 以預設字級在 iPhone 17 打開 New Group、Brisbane 的 Rename Group 或 Casey 的 Rename Member，再收起鍵盤
- **THEN** sheet 不超過半個可用畫面；表單最後一列與底部安全區之間不多出超過一列的空白；底下的原畫面仍有一部分可見

#### Scenario: 分類表單

- **WHEN** 以預設字級在 iPhone 17 打開 Shopping 的 Edit Category，鍵盤收起
- **THEN** 名稱與 27 色色盤按內容排列，sheet 底部沒有為填滿螢幕而增加的大面積空白；New Category 遵守同一規則

#### Scenario: 放大的文字

- **WHEN** 文字放到系統最大的輔助使用字級，打開 New Expense 並選了群組
- **THEN** sheet 開到整個可用高度；可捲到 Split between，標題列不跟著捲走

#### Scenario: 支出表單的底部

- **WHEN** 連續打開 New Expense 十次
- **THEN** 每次「Split with others」和「Expense note」都完整顯示，按得到；表單下方沒有被切掉的痕跡

#### Scenario: 鍵盤需要空間

- **WHEN** 在較小的 iPhone 上開啟 Rename Member，或在 New Category 輸入名稱，並使用最大的輔助使用字級
- **THEN** 欄位與 Cancel、Save 或 Add 都能操作，必要時 sheet 增高；收起鍵盤後沒有留下鍵盤原本佔用的空白區

#### Scenario: 其他 sheet

- **WHEN** 打開 Members、Balances、Manage Categories 或支出表單
- **THEN** 高度有對應的內容用途；完整支出表單可以使用較高的 sheet，少量內容不僅為了填滿螢幕而拉高

### Requirement: SHELL-67.2 (manual) iOS 的 sheet 採系統材質與一致的操作外觀

WHERE iOS，the mobile app SHALL 讓 sheet 的導覽與操作使用系統原生外觀，在支援且未降低透明度的 iOS 上呈現 Liquid Glass，並依系統外觀與輔助使用設定調整；畫面底部的 Undo 提示和群組封存的提示是 Liquid Glass 的膠囊；表單欄位、分類色盤、成員與金額等內容使用可讀的內容底色，不疊加 Liquid Glass，舊版 iOS 使用其原生外觀，Android 遵守 SHELL-38.1。

#### Scenario: 從選付款人到編輯分類

- **WHEN** iOS 26 沒開降低透明度，在淺色及深色下依序開啟 New Group、Rename Group、Rename Member 和 Edit Category，並把一筆支出移到垃圾桶、封存一個群組
- **THEN** 標題列和操作的材質、按鈕形狀與互動符合相同的系統外觀；✓ 與 ✕ 清楚可讀，內容沒有額外一層玻璃覆蓋；Undo 提示和群組封存的提示都是玻璃的膠囊

#### Scenario: 降低透明度與舊版 iOS

- **WHEN** iOS 26 開啟降低透明度，或在不支援 Liquid Glass 的 iOS 上開啟上述 sheet
- **THEN** 系統控制使用該環境的原生外觀，app 自己的材質遵守 SHELL-36.1、37.1；文字、選取標記與色盤仍清楚可辨，操作及高度規則不變

#### Scenario: Android

- **WHEN** 在 Android 上開啟上述表單，以及支出表單的清單
- **THEN** 表面不透明，沒有 app 自己加的玻璃；儲存、取消、選人與返回仍遵守各能力的規則

### Requirement: SHELL-68.1 (manual) 放不下的文字尾端漸層消失

The mobile app SHALL 讓只佔一行、放不下的文字在尾端漸層消失，不顯示「…」；漸層從離邊緣約三個字寬的地方開始，短到放得下的文字沒有漸層，文字的顏色和背景不變；螢幕閱讀器仍讀出完整的文字。

#### Scenario: 很長的標題

- **WHEN** 新增標題是 200 個「a」的支出，並以淺色和深色查看卡片
- **THEN** 標題只佔一行，尾端漸層消失，沒有「…」，兩種外觀下漸層都融入卡片的底色

#### Scenario: 放得下

- **WHEN** 新增標題是「Coffee」的支出
- **THEN** 標題沒有漸層

### Requirement: SHELL-69.1 (e2e) 卡片和分類列可以一路往左滑到底

WHEN 使用者把露出動作的卡片（LEDGER-70.2、GROUPS-47.1）或分類列（CATEGORIES-32.3）一路往左滑，超過寬度的 60% 再放開，the mobile app SHALL 當成按了它露出的動作；滑不到 60% 就放開時，只露出動作，沒有觸發。

#### Scenario: 支出卡片

- **WHEN** 在支出清單把 Coffee run 的卡片一路往左滑到底再放開
- **THEN** Coffee run 移出支出清單，顯示「Moved to Trash」和「Undo」

#### Scenario: 滑一小段

- **WHEN** 把 Lunch 的卡片往左滑一小段再放開
- **THEN** 露出「Delete」，Lunch 還在支出清單

#### Scenario: 群組卡片

- **WHEN** 在 Groups 根畫面把 Brisbane 的卡片一路往左滑到底再放開
- **THEN** Brisbane 移出 Groups 根畫面（GROUPS-48.1）

#### Scenario: 分類列

- **WHEN** 在 Manage Categories 把 Other 那一列一路往左滑到底再放開
- **THEN** 跳出「Delete Category?」，那一列收回

### Requirement: SHELL-70.1 (manual) 左滑的動作是紅色圓形

The mobile app SHALL 讓左滑露出的動作是紅色的圓形，裡面是白色的圖示（iOS 是 SF Symbol，Android 是 Material Symbols）；卡片的動作在圓形下方有說明文字，分類列沒有說明文字，只有圖示。一路往左滑時圓形跟著手指拉成紅色的膠囊；超過 SHELL-69.1 的位置時有一下觸覺回饋，滑回時回到圓形；滑回 60% 以內再放開，只露出動作，沒有觸發。

#### Scenario: 支出卡片

- **WHEN** 把 Coffee run 的卡片往左滑一小段
- **THEN** 露出紅色圓形和白色的垃圾桶，下方是「Delete」

#### Scenario: 分類列

- **WHEN** 把 Other 那一列往左滑一小段
- **THEN** 露出紅色圓形和白色的圖示，沒有說明文字

#### Scenario: 一路往左滑

- **WHEN** 在實機上把 Coffee run 的卡片一路往左滑，超過 60% 後滑回，再滑過去
- **THEN** 圓形拉成膠囊，每次超過 60% 時都有一下觸覺回饋；滑回時回到圓形

#### Scenario: 滑回再放開

- **WHEN** 把 Coffee run 的卡片往左滑超過 60%，不放手滑回 60% 以內再放開
- **THEN** Coffee run 還在支出清單，只露出「Delete」
