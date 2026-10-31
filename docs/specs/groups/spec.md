# Groups

## Purpose

群組：Groups 分頁根畫面上的群組列表、建立群組的 New Group、Groups 分頁上每個群組的畫面，以及從群組的畫面打開的 Members、Add Member、Rename Member 和 Rename Group，還有存在本機資料裡的群組和成員（ADR-0006）。每個群組有一個群組 ID、一個名稱和成員；每位成員有一個成員 ID 和一個名稱，你在群組裡的成員另外有使用者 ID，從 Add Member 加入的成員沒有使用者 ID。你是這支手機的本機身分：你的使用者 ID、個人空間 ID、個人 participant ID 和名字都在本機身分裡（shell）。存過名字是指名字不是空字串。你在群組裡的成員，是使用者 ID 等於你的使用者 ID 的那位成員；群組裡其他的成員是別人。前成員是被移出群組、還沒加回來的人；群組的成員只算現在的成員，不算前成員。兩個成員名稱去掉頭尾空白並轉成小寫（JavaScript 的 `toLowerCase()`，不依裝置的語言設定）後相同，就是同名。New Group 是建立群組的表單。建立中是指按下 Create 或 Return 之後，群組存好或存不進去之前。Add Member、Rename Member 和 Rename Group 是名稱表單；儲存中是指在名稱表單按下確認、Return 或 Add Back 之後，存好或存不進去之前；移除中是指選了 Remove from Group 之後，存好或存不進去之前。

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

### Requirement: GROUPS-18.1 卡片上的群組名稱只佔一行

The mobile app SHALL 在群組的卡片上只用一行顯示群組名稱，放不下時在結尾以「…」截斷；卡片的無障礙名稱仍是完整的「Open <群組名稱>」。

#### Scenario: 很長的名稱

- **WHEN** 建立名稱是 300 個「a」的群組
- **THEN** 卡片上的名稱只佔一行，放不下的部分在結尾截斷；卡片的無障礙名稱是「Open 」加上完整的 300 個「a」

### Requirement: GROUPS-19.1 名稱欄位的鍵盤

The mobile app SHALL 讓 New Group 名稱欄位的鍵盤把每個字的開頭自動大寫、不自動校正，並以完成鍵當 Return 鍵。

#### Scenario: 輸入名稱

- **WHEN** 開啟 New Group，用手機的鍵盤輸入「teh trip」
- **THEN** 名稱欄位是「Teh Trip」：每個字的開頭都大寫，「teh」沒有被校正成「the」；鍵盤的 Return 鍵是完成鍵

### Requirement: GROUPS-20.1 群組的畫面在沒有支出時顯示提示

WHILE 群組沒有支出，the mobile app SHALL 在群組的畫面顯示「No expenses in this group yet.」。

#### Scenario: 新建立的群組

- **WHEN** 建立「Brisbane」後點「Open Brisbane」
- **THEN** 群組的畫面顯示「No expenses in this group yet.」

### Requirement: GROUPS-21.1 找不到群組時顯示「Group not found.」

IF 群組的畫面的網址裡的 ID 不是任何群組的群組 ID，THEN the mobile app SHALL 讓這個畫面的標題是「Group Details」，只顯示「Group not found.」，標題列沒有「Group actions」選單；開啟存在的群組時，SHALL 從推入畫面到讀完群組都不顯示「Group not found.」。

#### Scenario: 不存在的群組

- **WHEN** 以 `/groups/00000000-0000-4000-8000-000000000000` 開啟 app
- **THEN** 選中 Groups 分頁，標題是「Group Details」，顯示「Group not found.」，沒有「No expenses in this group yet.」，也沒有「Group actions」選單

#### Scenario: 存在的群組

- **WHEN** 點「Open Brisbane」
- **THEN** 推入的畫面一開始和讀完 Brisbane 之後，都沒有顯示「Group not found.」

### Requirement: GROUPS-22.1 群組的畫面的 Group actions 選單

The mobile app SHALL 在群組的畫面的標題列放一個名稱是「Group actions」的選單，依序是「Members」和「Rename Group」（SHELL-47.1、SHELL-48.1）。

#### Scenario: iOS

- **WHEN** iOS 上開啟 Brisbane 的畫面
- **THEN** 標題列右邊是圖示 `ellipsis.circle`、名稱「Group actions」的選單，依序列出「Members」和「Rename Group」

#### Scenario: Android

- **WHEN** Android 上在 Brisbane 的畫面按「Group actions」
- **THEN** 跳出標題「Group actions」的對話框，依序列出「Members」、「Rename Group」和「Cancel」

### Requirement: GROUPS-23.1 開啟和關閉 Members

WHEN 使用者在 Group actions 選「Members」，the mobile app SHALL 開啟從畫面底部升起、蓋在群組的畫面上的 Members，標題是「Members」，標題列只有取消「Close」（SHELL-47.1、SHELL-48.1）；沒有在移除中時，按 Close、把 Members 往下滑或按 Android 的返回鍵，SHALL 關閉 Members，回到群組的畫面。

#### Scenario: 開啟

- **WHEN** 在 Brisbane 的畫面選 Group actions 的「Members」
- **THEN** Members 從底部升起，蓋在 Brisbane 的畫面上，標題是「Members」，標題列只有「Close」；仍選中 Groups 分頁

#### Scenario: 按 Close

- **WHEN** 在 Members 按「Close」
- **THEN** Members 關閉，顯示 Brisbane 的畫面

#### Scenario: 往下滑或按返回鍵

- **WHEN** 在 iOS 上把 Members 往下滑，或在 Android 上按返回鍵
- **THEN** Members 關閉，顯示 Brisbane 的畫面

### Requirement: GROUPS-24.1 Members 列出群組的成員

The mobile app SHALL 在 Members 依加入的先後，由上而下列出群組的每位成員，被移出後再加回來的排在最後：你那一列是你的成員名稱加上「 (You)」，不是按鈕；別人那一列是他的名稱和「›」，是角色為 button、無障礙名稱為他的名稱的按鈕；最後一列是角色為 button、名稱為「Add Member」的按鈕。

#### Scenario: 只有你

- **WHEN** 名字是「Taylor」，建立「Brisbane」後開啟它的 Members
- **THEN** 由上而下是「Taylor (You)」和「Add Member」；「Taylor (You)」那一列不是按鈕

#### Scenario: 三位成員

- **WHEN** 在 Brisbane 依序加入「Blake」和「Casey」
- **THEN** 由上而下是「Taylor (You)」、「Blake」、「Casey」和「Add Member」；Blake 和 Casey 那兩列右邊有「›」，是名稱分別為「Blake」和「Casey」的按鈕

### Requirement: GROUPS-25.1 點別人那一列跳出他的選單

WHEN 使用者在 Members 點別人那一列，the mobile app SHALL 跳出標題是他的名稱、內容是「If removed, their historical payments and shares will be retained.」的選單，依序是「Rename」、破壞性的「Remove from Group」和「Cancel」：iOS 上是動作表（action sheet），Android 上是對話框；按 Cancel 時關閉選單，什麼都不改。

#### Scenario: iOS

- **WHEN** iOS 上在 Members 點「Blake」
- **THEN** 跳出標題「Blake」、內容是這句話的動作表，依序是「Rename」、破壞性的「Remove from Group」和「Cancel」

#### Scenario: Android

- **WHEN** Android 上在 Members 點「Blake」
- **THEN** 跳出標題「Blake」、內容是這句話的對話框，依序是「Rename」、破壞性的「Remove from Group」和「Cancel」

#### Scenario: 按 Cancel

- **WHEN** 在 Blake 的選單按「Cancel」
- **THEN** 選單關閉，Members 仍列出 Blake，Brisbane 的成員沒有改變

### Requirement: GROUPS-26.1 選 Remove from Group 時移出群組

WHEN 使用者在別人的選單選「Remove from Group」，the mobile app SHALL 不再另外確認，直接把他移出群組，存好後 Members 不再列出他。

#### Scenario: 移除

- **WHEN** Brisbane 有 Taylor、Blake 和 Casey，在 Blake 的選單選「Remove from Group」
- **THEN** 沒有跳出其他提示框；Members 由上而下是「Taylor (You)」、「Casey」和「Add Member」；Brisbane 的成員是 Taylor 和 Casey

#### Scenario: 重新啟動

- **WHEN** 移除 Blake 之後重新啟動 app
- **THEN** Brisbane 的成員仍是 Taylor 和 Casey

### Requirement: GROUPS-27.1 移除中鎖住 Members

WHILE 有成員在移除中，the mobile app SHALL 停用 Close，讓每一列和「Add Member」都不能按，也不讓 Members 因為往下滑或按 Android 的返回鍵而關閉，直到存好或存不進去為止。

#### Scenario: 移除中

- **WHEN** 在 Blake 的選單選「Remove from Group」，還沒存好
- **THEN** Close 停用；點「Casey」不跳出選單，按「Add Member」不開啟 Add Member；Members 仍開著；存好後 Blake 不在了，Close 恢復可以按

#### Scenario: 往下滑或按返回鍵

- **WHEN** 還沒存好時往下滑 Members，或在 Android 上按返回鍵
- **THEN** Members 不關閉

#### Scenario: 存不進去之後

- **WHEN** 移除存不進去之後
- **THEN** Close、每一列和「Add Member」都恢復可以按

### Requirement: GROUPS-28.1 移除存不進去時提示

IF 移除存不進本機資料，THEN the mobile app SHALL 跳出標題「Unable to Remove Member」、內容「The member could not be removed. Please try again.」的提示框，Members 仍列出這位成員，本機資料維持選 Remove from Group 之前的樣子。

#### Scenario: 寫不進去

- **WHEN** 資料庫無法寫入時，在 Blake 的選單選「Remove from Group」
- **THEN** 跳出這個提示框，Members 仍列出 Blake，本機資料和移除之前一樣

#### Scenario: 寫到一半失敗

- **WHEN** 移除時的某一筆寫入失敗，在它之前的寫入都成功了，不論是哪一筆
- **THEN** 跳出這個提示框，本機資料和移除之前一樣

#### Scenario: 再試一次

- **WHEN** 失敗後資料庫恢復，再選一次「Remove from Group」
- **THEN** Members 不再列出 Blake

### Requirement: GROUPS-29.1 開啟 Add Member

WHEN 使用者在 Members 按「Add Member」，the mobile app SHALL 開啟從畫面底部升起、蓋在 Members 上的 Add Member，標題是「Add Member」，標題列有取消「Cancel」和確認「Add」（SHELL-47.1、SHELL-48.1），內容只有名稱欄位：名稱欄位的無障礙名稱是「Member name」，開啟時是空的、顯示「Enter member name」，並取得焦點。

#### Scenario: 開啟

- **WHEN** 在 Brisbane 的 Members 按「Add Member」
- **THEN** Add Member 從底部升起，蓋在 Members 上，標題是「Add Member」，標題列的取消是「Cancel」、確認是「Add」；名稱欄位是空的，顯示「Enter member name」，已經取得焦點

### Requirement: GROUPS-30.1 名稱空白時停用 Add

WHILE Add Member 的名稱去掉頭尾空白後是空的，the mobile app SHALL 停用 Add（SHELL-49.1），在名稱欄位按 Return 也不新增。

#### Scenario: 還沒輸入名稱

- **WHEN** 名稱是空的，或只有「   」
- **THEN** Add 停用，按 Return 不新增；輸入「Blake」後 Add 可以按

### Requirement: GROUPS-31.1 按 Add 或 Return 時加入新的成員

WHEN 使用者在 Add Member 按 Add，或在名稱欄位按 Return，而名稱去掉頭尾空白後不是空的，也和群組的成員、這個群組的前成員都不同名，the mobile app SHALL 以去掉頭尾空白的名稱把一位新的成員加入群組，存好後關閉 Add Member，回到 Members，把他列在最後；成員的人數和名稱的長度都沒有上限。

#### Scenario: 去掉頭尾空白

- **WHEN** 在 Brisbane 的 Add Member 輸入「 Blake 」，按 Add
- **THEN** Add Member 關閉，Members 由上而下是「Taylor (You)」、「Blake」和「Add Member」；存下的名稱是「Blake」

#### Scenario: 按 Return

- **WHEN** 輸入「Casey」，在名稱欄位按 Return
- **THEN** Add Member 關閉，Casey 排在最後

#### Scenario: 很多成員

- **WHEN** 在 Brisbane 一位一位加入 30 位成員
- **THEN** Brisbane 有 31 位成員，依加入的先後排列

#### Scenario: 很長的名稱

- **WHEN** 輸入 300 個「a」，按 Add
- **THEN** 存下的名稱是 300 個「a」

### Requirement: GROUPS-32.1 加入的成員的 ID

WHEN 一位新的成員從 Add Member 加入群組，the mobile app SHALL 給他一個新的成員 ID，不給他使用者 ID；成員 ID 是小寫的第 4 版 UUID，和本機資料裡其他任何 ID 都不同。

#### Scenario: 加入 Blake

- **WHEN** 在 Brisbane 加入「Blake」
- **THEN** Blake 沒有使用者 ID；他的成員 ID 是小寫的第 4 版 UUID，和 Brisbane 的群組 ID、你的成員 ID、你的使用者 ID、個人空間 ID 和個人 participant ID 都不同

#### Scenario: 兩個群組都有 Blake

- **WHEN** 在 Brisbane 和 Tokyo 都加入「Blake」
- **THEN** 兩位 Blake 的成員 ID 不同

### Requirement: GROUPS-33.1 和群組的成員同名時在欄位下方提示

IF 使用者在 Add Member 按 Add 或 Return 時，名稱和群組的某位成員同名，或在 Rename Member 按 Save 或 Return 時，名稱和群組的另一位成員同名，THEN the mobile app SHALL 不儲存、不關閉表單、不跳出提示框，在名稱欄位下方顯示「A member with this name already exists.」並讓螢幕閱讀器念出來，直到名稱被修改；你也算群組的成員。

#### Scenario: 和別人同名

- **WHEN** Brisbane 有 Taylor 和 Blake，在 Add Member 輸入「 blake 」，按 Add
- **THEN** Add Member 仍開著，名稱欄位下方顯示這句話，螢幕閱讀器念出來，沒有提示框；Brisbane 仍只有 Taylor 和 Blake

#### Scenario: 你的名字

- **WHEN** 你的名字是「Taylor」，在 Add Member 輸入「TAYLOR」，按 Add
- **THEN** 名稱欄位下方顯示這句話，沒有新增成員

#### Scenario: 改成別人的名稱

- **WHEN** Brisbane 有 Taylor、Blake 和 Casey，在 Casey 的 Rename Member 把名稱改成「Blake」，按 Save
- **THEN** Rename Member 仍開著，名稱欄位下方顯示這句話；Casey 的名稱沒有改變

#### Scenario: 修改名稱

- **WHEN** 出現這句話之後，把名稱改成「Blake K.」
- **THEN** 這句話消失

#### Scenario: 同時和成員、前成員同名

- **WHEN** 移除 Blake 之後，把 Casey 改名為「Blake」，再在 Add Member 輸入「blake」，按 Add
- **THEN** 名稱欄位下方顯示這句話，沒有問要不要加回來

### Requirement: GROUPS-34.1 和前成員同名時問要不要加回來

IF 使用者在 Add Member 按 Add 或 Return 時，名稱不和群組的任何成員同名，但和這個群組的一位前成員同名，THEN the mobile app SHALL 先不儲存，跳出標題「Add <前成員的名稱> Back?」、內容「<前成員的名稱> was removed from this group before. Adding them back reconnects their past payments and shares.」的提示框，選項是「Cancel」和「Add Back」：按 Add Back 時讓他回到群組，沿用他原本的成員 ID 和名稱，存好後關閉 Add Member，回到 Members，把他列在最後；按 Cancel 時留在 Add Member，保留輸入。

#### Scenario: 加回來

- **WHEN** Brisbane 有 Taylor、Blake 和 Casey，移除 Blake 之後，在 Add Member 輸入「blake」，按 Add，再按「Add Back」
- **THEN** 先跳出標題「Add Blake Back?」、內容「Blake was removed from this group before. Adding them back reconnects their past payments and shares.」的提示框；按 Add Back 後 Add Member 關閉，Members 由上而下是「Taylor (You)」、「Casey」、「Blake」和「Add Member」；Blake 的成員 ID 和移除之前一樣，名稱是「Blake」

#### Scenario: 按 Cancel

- **WHEN** 在這個提示框按「Cancel」
- **THEN** Add Member 仍開著，名稱欄位是「blake」，Brisbane 的成員是 Taylor 和 Casey

#### Scenario: 重新啟動之後

- **WHEN** 移除 Blake、重新啟動 app 之後，在 Add Member 輸入「Blake」，按 Add，再按「Add Back」
- **THEN** Blake 回到 Brisbane，成員 ID 和移除之前一樣

#### Scenario: 別的群組的前成員

- **WHEN** 在 Tokyo 移除「Blake」之後，在 Brisbane 的 Add Member 輸入「Blake」，按 Add
- **THEN** 沒有問要不要加回來，Brisbane 加入一位新的 Blake，成員 ID 和 Tokyo 的 Blake 不同

### Requirement: GROUPS-35.1 新增存不進去時提示

IF 新的成員，或按 Add Back 時加回來的前成員，存不進本機資料，THEN the mobile app SHALL 跳出標題「Unable to Add Member」、內容「The member could not be saved. Please try again.」的提示框，Add Member 保持開啟並保留輸入，本機資料維持按下之前的樣子。

#### Scenario: 寫不進去

- **WHEN** 資料庫無法寫入時，在 Add Member 輸入「Blake」按 Add
- **THEN** 跳出這個提示框，Add Member 仍開著，名稱欄位是「Blake」，Add 可以再按；本機資料和按 Add 之前一樣

#### Scenario: 寫到一半失敗

- **WHEN** 加入時的某一筆寫入失敗，在它之前的寫入都成功了，不論是哪一筆
- **THEN** 跳出這個提示框，本機資料和按 Add 之前一樣

#### Scenario: 加回來時寫不進去

- **WHEN** 資料庫無法寫入時，在「Add Blake Back?」按「Add Back」
- **THEN** 跳出這個提示框，Add Member 仍開著，Blake 仍是前成員

#### Scenario: 再試一次

- **WHEN** 失敗後資料庫恢復，再按一次 Add
- **THEN** Add Member 關閉，Brisbane 只多了一位 Blake

### Requirement: GROUPS-36.1 開啟 Rename Member

WHEN 使用者在別人的選單選「Rename」，the mobile app SHALL 開啟從畫面底部升起、蓋在 Members 上的 Rename Member，標題是「Rename Member」，標題列有取消「Cancel」和確認「Save」（SHELL-47.1、SHELL-48.1），內容只有名稱欄位：名稱欄位的無障礙名稱是「Member name」，開啟時是他現在的名稱，並取得焦點。

#### Scenario: 開啟

- **WHEN** 在 Members 點「Blake」，選「Rename」
- **THEN** Rename Member 從底部升起，蓋在 Members 上，標題是「Rename Member」，標題列的取消是「Cancel」、確認是「Save」；名稱欄位是「Blake」，已經取得焦點

### Requirement: GROUPS-37.1 名稱沒有改變或空白時停用 Save

WHILE Rename Member 或 Rename Group 的名稱去掉頭尾空白後是空的，或和打開表單時的名稱完全相同，the mobile app SHALL 停用 Save（SHELL-49.1），在名稱欄位按 Return 也不儲存。

#### Scenario: 剛開啟

- **WHEN** 開啟 Blake 的 Rename Member，或 Brisbane 的 Rename Group
- **THEN** Save 停用

#### Scenario: 只多了空白

- **WHEN** 在 Blake 的 Rename Member 把名稱改成「 Blake 」，或清空成「   」
- **THEN** Save 停用，按 Return 不儲存

#### Scenario: 只改了大小寫

- **WHEN** 在 Blake 的 Rename Member 把名稱改成「BLAKE」
- **THEN** Save 可以按

### Requirement: GROUPS-38.1 按 Save 或 Return 時存下成員的新名稱

WHEN 使用者在 Rename Member 按 Save 或在名稱欄位按 Return，而 Save 沒有停用，名稱也不和群組的另一位成員同名，the mobile app SHALL 把這位成員的名稱改成去掉頭尾空白的名稱，成員 ID 和他在 Members 的位置都不變，存好後關閉 Rename Member，回到 Members。

#### Scenario: 改正打錯的名稱

- **WHEN** Brisbane 有 Taylor、Blak 和 Casey，在 Blak 的 Rename Member 輸入「 Blake 」，按 Save
- **THEN** Rename Member 關閉，Members 由上而下是「Taylor (You)」、「Blake」、「Casey」和「Add Member」；他的成員 ID 沒有改變，存下的名稱是「Blake」

#### Scenario: 按 Return

- **WHEN** 在 Casey 的 Rename Member 輸入「Casey Lee」，在名稱欄位按 Return
- **THEN** Rename Member 關閉，Casey 那一列是「Casey Lee」

#### Scenario: 和前成員同名

- **WHEN** 移除 Blake 之後，在 Casey 的 Rename Member 輸入「Blake」，按 Save
- **THEN** Casey 的名稱改成「Blake」

#### Scenario: 重新啟動

- **WHEN** 把 Blak 改名為「Blake」之後重新啟動 app
- **THEN** 他的名稱仍是「Blake」

### Requirement: GROUPS-39.1 成員的新名稱存不進去時提示

IF 成員的新名稱存不進本機資料，THEN the mobile app SHALL 跳出標題「Unable to Rename Member」、內容「The member could not be saved. Please try again.」的提示框，Rename Member 保持開啟並保留輸入，成員的名稱維持原本的值。

#### Scenario: 寫不進去

- **WHEN** 資料庫無法寫入時，在 Blak 的 Rename Member 輸入「Blake」按 Save
- **THEN** 跳出這個提示框，Rename Member 仍開著，名稱欄位是「Blake」，Save 可以再按；他的名稱仍是「Blak」

#### Scenario: 再試一次

- **WHEN** 失敗後資料庫恢復，再按一次 Save
- **THEN** Rename Member 關閉，他的名稱是「Blake」

### Requirement: GROUPS-40.1 開啟 Rename Group

WHEN 使用者在 Group actions 選「Rename Group」，the mobile app SHALL 開啟從畫面底部升起、蓋在群組的畫面上的 Rename Group，標題是「Rename Group」，標題列有取消「Cancel」和確認「Save」（SHELL-47.1、SHELL-48.1），內容由上而下是區塊標題「GROUP DETAILS」、區塊裡唯一的一列「Name」和它的名稱欄位；名稱欄位的無障礙名稱是「Group name」，開啟時是群組現在的名稱，並取得焦點。

#### Scenario: 開啟

- **WHEN** 在 Brisbane 的畫面選 Group actions 的「Rename Group」
- **THEN** Rename Group 從底部升起，蓋在 Brisbane 的畫面上，標題是「Rename Group」，標題列的取消是「Cancel」、確認是「Save」；由上而下是「GROUP DETAILS」、「Name」和名稱欄位，名稱欄位是「Brisbane」，已經取得焦點

### Requirement: GROUPS-41.1 按 Save 或 Return 時存下群組的新名稱

WHEN 使用者在 Rename Group 按 Save 或在名稱欄位按 Return，而 Save 沒有停用，the mobile app SHALL 把群組的名稱改成去掉頭尾空白的名稱，群組 ID、成員和群組在 Groups 根畫面的位置都不變，存好後關閉 Rename Group，回到群組的畫面，畫面的標題和 Groups 根畫面上這個群組的卡片都改用新的名稱。

#### Scenario: 改名

- **WHEN** 有 Trip 和 Paris，在 Trip 的 Rename Group 輸入「 Tokyo 2026 」，按 Save
- **THEN** Rename Group 關閉，群組的畫面的標題是「Tokyo 2026」；返回 Groups 根畫面，由上而下是「Open Tokyo 2026」和「Open Paris」；群組 ID 和成員都沒有改變，存下的名稱是「Tokyo 2026」

#### Scenario: 按 Return

- **WHEN** 在 Rename Group 輸入「Kyoto」，在名稱欄位按 Return
- **THEN** Rename Group 關閉，群組的畫面的標題是「Kyoto」

#### Scenario: 重新啟動

- **WHEN** 把 Trip 改名為「Tokyo 2026」之後重新啟動 app
- **THEN** Groups 根畫面有「Open Tokyo 2026」，沒有 Trip

### Requirement: GROUPS-42.1 群組的新名稱存不進去時提示

IF 群組的新名稱存不進本機資料，THEN the mobile app SHALL 跳出標題「Unable to Rename Group」、內容「Your group could not be saved. Please try again.」的提示框，Rename Group 保持開啟並保留輸入，群組的名稱維持原本的值。

#### Scenario: 寫不進去

- **WHEN** 資料庫無法寫入時，在 Trip 的 Rename Group 輸入「Tokyo」按 Save
- **THEN** 跳出這個提示框，Rename Group 仍開著，名稱欄位是「Tokyo」，Save 可以再按；群組的名稱仍是「Trip」

#### Scenario: 再試一次

- **WHEN** 失敗後資料庫恢復，再按一次 Save
- **THEN** Rename Group 關閉，群組的名稱是「Tokyo」

### Requirement: GROUPS-43.1 按 Cancel、往下滑或按返回鍵時不儲存

WHEN 沒有在儲存中，而使用者在名稱表單按 Cancel、把它往下滑或按 Android 的返回鍵，the mobile app SHALL 關閉這個表單，不儲存：從 Add Member 和 Rename Member 回到 Members，從 Rename Group 回到群組的畫面。

#### Scenario: Add Member

- **WHEN** 在 Add Member 輸入「Blake」後按 Cancel
- **THEN** Add Member 關閉，Members 沒有 Blake；再按「Add Member」時名稱欄位是空的

#### Scenario: Rename Member

- **WHEN** 在 Blake 的 Rename Member 輸入「Blake K.」後按 Cancel
- **THEN** Rename Member 關閉，Members 仍是「Blake」

#### Scenario: Rename Group

- **WHEN** 在 Trip 的 Rename Group 輸入「Tokyo」後按 Cancel
- **THEN** Rename Group 關閉，群組的畫面的標題仍是「Trip」

#### Scenario: 往下滑或按返回鍵

- **WHEN** 在 iOS 上把名稱表單往下滑，或在 Android 上按返回鍵
- **THEN** 表單關閉，沒有儲存

### Requirement: GROUPS-44.1 儲存中鎖住名稱表單

WHILE 名稱表單在儲存中，the mobile app SHALL 停用它的 Cancel 和確認，讓名稱欄位不能編輯，再按確認或 Return 也不再儲存一次，也不讓表單因為往下滑或按 Android 的返回鍵而關閉，直到存好或存不進去為止。

#### Scenario: 新增中

- **WHEN** 在 Add Member 輸入「Blake」按 Add，還沒存好
- **THEN** Cancel 和 Add 都停用，名稱欄位不能編輯，Add Member 仍開著；存好後 Add Member 關閉，多了 Blake

#### Scenario: 連按兩次

- **WHEN** 在 Add Member 輸入「Blake」後連按兩次 Add，或按 Add 後在存好之前按 Return，第二次都在存好之前
- **THEN** 只加入一位 Blake，沒有顯示「A member with this name already exists.」

#### Scenario: 改名中

- **WHEN** 在 Rename Member 或 Rename Group 按 Save，還沒存好
- **THEN** Cancel 和 Save 都停用，名稱欄位不能編輯，表單仍開著

#### Scenario: 往下滑或按返回鍵

- **WHEN** 還沒存好時往下滑表單，或在 Android 上按返回鍵
- **THEN** 表單不關閉；存好後才關閉

#### Scenario: 存不進去之後

- **WHEN** 存不進去之後
- **THEN** Cancel、確認和名稱欄位都恢復可以用

### Requirement: GROUPS-45.1 名稱表單的鍵盤

The mobile app SHALL 讓名稱表單的名稱欄位的鍵盤把每個字的開頭自動大寫、不自動校正，並以完成鍵當 Return 鍵。

#### Scenario: 輸入名稱

- **WHEN** 在 Add Member、Rename Member 或 Rename Group，用手機的鍵盤輸入「teh trip」
- **THEN** 名稱欄位是「Teh Trip」：每個字的開頭都大寫，「teh」沒有被校正成「the」；鍵盤的 Return 鍵是完成鍵

### Requirement: GROUPS-46.1 你改名時一起改你在群組裡的成員名稱

WHEN 使用者在 Settings 存下新的名字（SHELL-18.1），the mobile app SHALL 在同一次儲存裡，把你在每個群組裡的成員名稱改成新的名字；名字存不進去時（SHELL-22.1），名字和你在每個群組裡的成員名稱都維持原本的值。

#### Scenario: 改名

- **WHEN** 名字是「Taylor」，建立「Brisbane」和「Tokyo」之後，在 Settings 把名字改成「Sam」
- **THEN** Brisbane 和 Tokyo 裡你的成員名稱都是「Sam」，Members 是「Sam (You)」；成員 ID 和使用者 ID 都沒有改變

#### Scenario: 別人的名稱不變

- **WHEN** Brisbane 有 Blake，把名字改成「Sam」
- **THEN** Blake 的名稱仍是「Blake」

#### Scenario: 寫到一半失敗

- **WHEN** 改名時的某一筆寫入失敗，在它之前的寫入都成功了，不論是哪一筆
- **THEN** 跳出「Unable to Save Settings」；名字仍是「Taylor」，Brisbane 和 Tokyo 裡你的成員名稱也仍是「Taylor」

#### Scenario: 重新啟動

- **WHEN** 改名為「Sam」之後重新啟動 app
- **THEN** Brisbane 裡你的成員名稱仍是「Sam」
