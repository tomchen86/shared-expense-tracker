# Groups

## Purpose

群組：Groups 分頁根畫面上的群組列表、建立群組的 New Group、Groups 分頁上每個群組的畫面，以及存在本機資料裡的群組和成員（ADR-0006）。每個群組有一個群組 ID、一個名稱和成員；每位成員有一個成員 ID、一個使用者 ID 和一個名稱。你是這支手機的本機身分：你的使用者 ID、個人空間 ID、個人 participant ID 和名字都在本機身分裡（shell）。存過名字是指名字不是空字串。New Group 是建立群組的表單。建立中是指按下 Create 或 Return 之後，群組存好或存不進去之前。

## Requirements

### Requirement: GROUPS-1.1 還沒有群組時顯示提示

WHILE 本機資料裡沒有群組，the mobile app SHALL 在 Groups 根畫面顯示「No groups yet. Tap + to create a group.」。

#### Scenario: 第一次打開 Groups

- **WHEN** 第一次啟動 app，選中 Groups 分頁
- **THEN** 顯示「No groups yet. Tap + to create a group.」，沒有任何群組的卡片

#### Scenario: 建立第一個群組

- **WHEN** 建立「Brisbane」
- **THEN** 這句話消失，只有 Brisbane 的卡片

### Requirement: GROUPS-2.1 依建立的先後列出群組

The mobile app SHALL 在 Groups 根畫面依建立的先後，由上而下列出每個群組的卡片；卡片顯示群組名稱，是角色為 button、無障礙名稱為「Open <群組名稱>」的按鈕。

#### Scenario: 三個群組

- **WHEN** 依序建立「Brisbane」、「Tokyo」、「Paris」
- **THEN** 由上而下是 Brisbane、Tokyo、Paris 的卡片，名稱分別是「Open Brisbane」、「Open Tokyo」、「Open Paris」

#### Scenario: 手機的時間往回調

- **WHEN** 建立「Brisbane」之後，把手機的時間調回前一天，再建立「Tokyo」
- **THEN** Tokyo 仍排在 Brisbane 下面

### Requirement: GROUPS-3.1 Groups 根畫面有 Add group 按鈕

The mobile app SHALL 在 Groups 根畫面顯示名稱為「Add group」的 + 按鈕。

#### Scenario: 打開 Groups

- **WHEN** 選中 Groups 分頁，不論有沒有群組
- **THEN** 有名稱為「Add group」的 + 按鈕

### Requirement: GROUPS-4.1 還沒有名字時按 Add group 只跳出提示

IF 使用者還沒存過名字時按「Add group」，THEN the mobile app SHALL 不開啟 New Group，跳出標題「Username Required」、內容「Please set your username in Settings before creating a group.」、按鈕是「Cancel」和「Go to Settings」的提示框；按「Go to Settings」時切到 Settings 分頁的根畫面，按「Cancel」時留在 Groups 根畫面。

#### Scenario: 第一次啟動

- **WHEN** 第一次啟動 app，在 Groups 根畫面按「Add group」
- **THEN** 跳出這個提示框，沒有開啟 New Group

#### Scenario: 按 Go to Settings

- **WHEN** 在提示框按「Go to Settings」
- **THEN** 選中 Settings 分頁，顯示 Settings 的根畫面

#### Scenario: Settings 分頁已經推入其他畫面

- **WHEN** 在 Settings 分頁打開 Manage Categories，再回到 Groups 按「Add group」，在提示框按「Go to Settings」
- **THEN** 選中 Settings 分頁，Settings 分頁的堆疊只剩 Settings 的根畫面

#### Scenario: 按 Cancel

- **WHEN** 在提示框按「Cancel」
- **THEN** 仍選中 Groups 分頁，顯示 Groups 根畫面，沒有開啟 New Group

### Requirement: GROUPS-5.1 按 Add group 開啟 New Group

WHEN 使用者存過名字後按「Add group」，the mobile app SHALL 開啟從畫面底部升起、蓋在 Groups 根畫面上的 New Group；連按兩次也只開啟一個。

#### Scenario: 開啟

- **WHEN** 存好名字「Taylor」後，在 Groups 根畫面按「Add group」
- **THEN** New Group 從底部升起，蓋在 Groups 根畫面上，仍選中 Groups 分頁

#### Scenario: 連按兩次

- **WHEN** 連按兩次「Add group」
- **THEN** 只開啟一個 New Group；按一次 Cancel 就回到 Groups 根畫面

### Requirement: GROUPS-6.1 New Group 的內容

The mobile app SHALL 讓 New Group 的標題是「New Group」，標題列有取消「Cancel」和確認「Create」（SHELL-47.1、SHELL-48.1），內容由上而下是區塊標題「GROUP DETAILS」、區塊裡唯一的一列「Name」和它的名稱欄位，以及說明「Members can be added after the group is created.」；名稱欄位的無障礙名稱是「Group name」，開啟時是空的、顯示「Group name」，並取得焦點。

#### Scenario: 開啟 New Group

- **WHEN** 開啟 New Group
- **THEN** 標題是「New Group」，標題列的取消是「Cancel」、確認是「Create」；由上而下是「GROUP DETAILS」、「Name」、名稱欄位、「Members can be added after the group is created.」，沒有其他欄位

#### Scenario: 名稱欄位

- **WHEN** 開啟 New Group
- **THEN** 名稱欄位是空的，顯示「Group name」，已經取得焦點，鍵盤隨著出現

### Requirement: GROUPS-7.1 名稱空白時停用 Create

WHILE New Group 的名稱去掉頭尾空白後是空的，the mobile app SHALL 停用 Create（SHELL-49.1）。

#### Scenario: 還沒輸入名稱

- **WHEN** 名稱是空的，或只有「   」
- **THEN** Create 停用；輸入「Brisbane」後 Create 可以按

#### Scenario: 清空名稱

- **WHEN** 輸入「Brisbane」後把名稱清空
- **THEN** Create 又停用

### Requirement: GROUPS-8.1 按 Create 或 Return 時建立群組

WHEN 使用者按 Create，或在名稱欄位按 Return，而名稱去掉頭尾空白後不是空的，the mobile app SHALL 以去掉頭尾空白的名稱存下一個新的群組，存好後關閉 New Group，回到 Groups 根畫面，把這個群組列在最下面。

#### Scenario: 去掉頭尾空白

- **WHEN** 輸入「 Brisbane 」，按 Create
- **THEN** New Group 關閉，Groups 根畫面有「Brisbane」，存下的名稱是「Brisbane」

#### Scenario: 按 Return

- **WHEN** 輸入「Tokyo」，在名稱欄位按 Return
- **THEN** New Group 關閉，建立了「Tokyo」

#### Scenario: 名稱空白時按 Return

- **WHEN** 名稱只有「   」時按 Return
- **THEN** 沒有建立群組，New Group 仍開著

### Requirement: GROUPS-9.1 新群組的 ID 和唯一的成員

WHEN 群組建立，the mobile app SHALL 給它一個新的群組 ID，並把你加為它唯一的成員：一個新的成員 ID，使用者 ID 是你的使用者 ID，名稱是按 Create 或 Return 時的名字；群組 ID 和成員 ID 都是小寫的第 4 版 UUID，和本機資料裡其他任何 ID 都不同，所以成員 ID 也不是你的個人 participant ID。

#### Scenario: 建立第一個群組

- **WHEN** 名字是「Taylor」，建立「Brisbane」
- **THEN** Brisbane 只有一位成員，名稱是「Taylor」，使用者 ID 是你的使用者 ID；群組 ID 和成員 ID 都是小寫的第 4 版 UUID，彼此不同，也和你的使用者 ID、個人空間 ID、個人 participant ID 都不同

#### Scenario: 改名之後再建立

- **WHEN** 建立「Brisbane」之後把名字改成「Sam」，再建立「Tokyo」
- **THEN** Tokyo 唯一的成員名稱是「Sam」，使用者 ID 和 Brisbane 的成員相同；Tokyo 的群組 ID 和成員 ID 都和 Brisbane 的不同

### Requirement: GROUPS-10.1 還沒有名字時按 Create 只跳出提示

IF 使用者還沒存過名字時在 New Group 按 Create 或 Return，THEN the mobile app SHALL 不建立群組，跳出和按「Add group」時一樣的「Username Required」提示框（GROUPS-4.1）；按「Go to Settings」時關閉 New Group 並切到 Settings 分頁的根畫面，按「Cancel」時留在 New Group 並保留輸入。

#### Scenario: 以網址開啟 New Group

- **WHEN** 第一次啟動 app 時以 `/groups/new` 開啟，輸入「Brisbane」後按 Create
- **THEN** 跳出這個提示框，沒有建立群組

#### Scenario: 按 Cancel

- **WHEN** 在提示框按「Cancel」
- **THEN** New Group 仍開著，名稱欄位是「Brisbane」

#### Scenario: 按 Go to Settings

- **WHEN** 在提示框按「Go to Settings」
- **THEN** New Group 關閉，選中 Settings 分頁，顯示 Settings 的根畫面；Groups 分頁沒有群組

### Requirement: GROUPS-11.1 建立中鎖住 New Group

WHILE 群組正在建立，the mobile app SHALL 停用 Cancel 和 Create，讓名稱欄位不能編輯，再按 Create 或 Return 也不再建立一次，也不讓 New Group 因為往下滑或按 Android 的返回鍵而關閉，直到存好或存不進去為止。

#### Scenario: 建立中

- **WHEN** 輸入「Brisbane」按 Create，還沒存好
- **THEN** Cancel 和 Create 都停用，名稱欄位不能編輯，New Group 仍開著；存好後 New Group 關閉，多了「Brisbane」

#### Scenario: 連按兩次

- **WHEN** 輸入「Brisbane」後連按兩次 Create，第二次在存好之前
- **THEN** 只建立了一個「Brisbane」

#### Scenario: 建立中按 Return

- **WHEN** 輸入「Brisbane」按 Create，存好之前在名稱欄位按 Return
- **THEN** 只建立了一個「Brisbane」

#### Scenario: 往下滑或按返回鍵

- **WHEN** 還沒存好時往下滑 New Group，或在 Android 上按返回鍵
- **THEN** New Group 不關閉；存好後才關閉，回到 Groups 根畫面，仍選中 Groups 分頁

#### Scenario: 存不進去之後

- **WHEN** 存不進去之後
- **THEN** Cancel、Create 和名稱欄位都恢復可以用

### Requirement: GROUPS-12.1 存不進去時提示

IF 群組或它的成員存不進本機資料，THEN the mobile app SHALL 跳出標題「Unable to Create Group」、內容「Your group could not be saved. Please try again.」的提示框，New Group 保持開啟並保留輸入，本機資料維持按下 Create 之前的樣子，不留下這次的群組或成員。

#### Scenario: 寫不進去

- **WHEN** 資料庫無法寫入時，輸入「Brisbane」按 Create
- **THEN** 跳出這個提示框，New Group 仍開著，名稱欄位是「Brisbane」，Create 可以再按；本機資料和按 Create 之前一樣

#### Scenario: 寫到一半失敗

- **WHEN** 建立時的某一筆寫入失敗，在它之前的寫入都成功了，不論是哪一筆
- **THEN** 跳出這個提示框，本機資料和按 Create 之前一樣

#### Scenario: 再試一次

- **WHEN** 失敗後資料庫恢復，再按一次 Create
- **THEN** New Group 關閉，只建立了一個「Brisbane」

#### Scenario: 失敗後取消

- **WHEN** 失敗後按 Cancel
- **THEN** New Group 關閉，沒有群組

### Requirement: GROUPS-13.1 按 Cancel、往下滑或按返回鍵時不建立

WHEN 沒有在建立中，而使用者在 New Group 按 Cancel、把它往下滑或按 Android 的返回鍵，the mobile app SHALL 關閉 New Group，回到 Groups 根畫面，不建立群組。

#### Scenario: 按 Cancel

- **WHEN** 輸入「Brisbane」後按 Cancel
- **THEN** New Group 關閉，沒有群組；再按「Add group」時名稱欄位是空的

#### Scenario: 往下滑

- **WHEN** 在 iOS 上輸入「Brisbane」後把 New Group 往下滑
- **THEN** New Group 關閉，沒有群組

#### Scenario: 按 Android 的返回鍵

- **WHEN** 在 Android 上輸入「Brisbane」後按返回鍵
- **THEN** New Group 關閉，仍選中 Groups 分頁，沒有群組

### Requirement: GROUPS-14.1 New Group 和群組畫面的網址

The mobile app SHALL 以網址 `/groups/new` 代表開在 Groups 根畫面上的 New Group，以 `/groups/<群組 ID>` 代表 Groups 分頁上那個群組的畫面。

#### Scenario: 開啟 New Group

- **WHEN** 在 Groups 根畫面按「Add group」開啟 New Group
- **THEN** 目前的網址是 `/groups/new`

#### Scenario: 以網址開啟 New Group

- **WHEN** 存過名字後以 `/groups/new` 開啟 app，然後按 Cancel
- **THEN** 開啟時選中 Groups 分頁，New Group 蓋在 Groups 根畫面上；按 Cancel 後顯示 Groups 根畫面，網址是 `/groups`

#### Scenario: 以網址開啟 New Group 再建立

- **WHEN** 存過名字後以 `/groups/new` 開啟 app，建立「Brisbane」
- **THEN** 顯示 Groups 根畫面，列出 Brisbane

#### Scenario: 開啟群組

- **WHEN** 點「Open Brisbane」
- **THEN** 目前的網址是 `/groups/` 加上 Brisbane 的群組 ID

#### Scenario: 以網址開啟群組

- **WHEN** 以 `/groups/` 加上 Brisbane 的群組 ID 開啟 app
- **THEN** 選中 Groups 分頁，Groups 分頁的堆疊由下而上是「Groups」根畫面和「Brisbane」

### Requirement: GROUPS-15.1 點卡片開啟群組的畫面

WHEN 使用者點群組的卡片，the mobile app SHALL 在 Groups 分頁推入這個群組的畫面，標題是群組名稱，分頁列仍選中 Groups。

#### Scenario: 點卡片

- **WHEN** 有 Brisbane 和 Tokyo 時點「Open Tokyo」
- **THEN** 分頁列仍選中 Groups，Groups 分頁的堆疊由下而上是「Groups」根畫面和「Tokyo」

#### Scenario: 同名的群組

- **WHEN** 有兩個「Trip」時點第二張卡片
- **THEN** 推入的是後建立的那個 Trip 的畫面，網址是它的群組 ID

#### Scenario: 返回

- **WHEN** 在群組的畫面返回，或在 Android 上按返回鍵
- **THEN** 回到 Groups 根畫面，分頁列仍選中 Groups

### Requirement: GROUPS-16.1 重新啟動後保留群組和成員

WHEN app 重新啟動，the mobile app SHALL 保留每個群組、它們建立的先後和每位成員。

#### Scenario: 重新啟動

- **WHEN** 依序建立「Brisbane」和「Tokyo」後重新啟動 app
- **THEN** Groups 根畫面由上而下是 Brisbane、Tokyo；兩個群組的 ID、名稱和成員都和重新啟動前一樣

### Requirement: GROUPS-17.1 群組名稱不限長度，也可以重複

The mobile app SHALL 讓群組名稱不限長度，也可以和其他群組的名稱相同。

#### Scenario: 很長的名稱

- **WHEN** 一個一個輸入 300 個「a」，按 Create
- **THEN** 存下的名稱是 300 個「a」

#### Scenario: 同名的群組

- **WHEN** 建立「Trip」之後再建立一個「Trip」
- **THEN** Groups 根畫面有兩張「Trip」的卡片
