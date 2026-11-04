# Groups

## Purpose

群組：Groups 分頁根畫面上的群組列表、建立群組的 New Group、每個群組的畫面，以及從群組的畫面打開的 Members、Rename Member 和 Rename Group，群組的封存和還原、Settings 分頁上列出封存群組的 Archived Groups，還有存在本機資料裡的群組和成員（ADR-0006）。每個群組有一個群組 ID、一個名稱和成員；每位成員有一個成員 ID 和一個名稱，你在群組裡的成員另外有使用者 ID，從 Members 加入的成員沒有使用者 ID。你是這支手機的本機身分：你的使用者 ID、個人空間 ID、個人 participant ID 和名字都在本機身分裡（shell）。存過名字是指名字不是空字串。你在群組裡的成員，是使用者 ID 等於你的使用者 ID 的那位成員；群組裡其他的成員是別人。前成員是被移出群組、還沒加回來的人；群組的成員只算現在的成員，不算前成員。兩個成員名稱去掉頭尾空白並轉成小寫（JavaScript 的 `toLowerCase()`，不依裝置的語言設定）後相同，就是同名。New Group 是建立群組的表單。建立中是指 New Group 開始把群組寫入本機資料之後，存好或存不進去之前。Rename Member 和 Rename Group 是名稱表單；Members 的名稱欄位是在 Members 按「Add Member」後出現、用來加入成員的欄位（GROUPS-29.2）；儲存中是指名稱表單或 Members 的名稱欄位開始寫入本機資料之後，存好或存不進去之前，所以名稱空白、和成員同名，或還在問要不要加回前成員時，都不是儲存中；移除中是指選了 Remove from Group 之後，存好或存不進去之前。封存的群組是本機資料裡標成封存的群組，它的群組 ID、名稱和成員都留著；其他的群組是未封存的群組；還原是拿掉封存的標記。封存中是指開始把封存寫入本機資料之後，存好或存不進去之前；還原中也一樣。群組的卡片是 Groups 根畫面上的卡片，封存群組的卡片是 Archived Groups 上的卡片。群組的畫面在 Groups 分頁上，從封存群組的卡片打開時在 Settings 分頁上；從群組的畫面打開的 Members 和名稱表單都和它在同一個分頁。群組的畫面也列出這個群組不在垃圾桶裡的支出（GROUPS-61.2），支出的卡片、明細和垃圾桶見 ledger。Balances 是從群組的畫面打開、列出群組裡每個人的已付、份額和淨額的畫面，和群組的畫面在同一個分頁。一個人在群組裡某個幣別的已付，是這個群組不在垃圾桶裡、這個幣別的支出的付款裡記在他的成員 ID 下的金額總和；份額是這些支出的分攤裡記在他的成員 ID 下的金額總和；淨額是已付減份額。你的已付、份額和淨額是你在群組裡的成員的。群組的金額是群組的畫面上的 Group Total 和你的淨額、Balances，以及群組的卡片上的份額和淨額；它們都依幣別分開，不把不同幣別的金額相加或換算。

## Requirements

### Requirement: GROUPS-1.2 沒有未封存的群組時顯示提示

WHILE 本機資料裡沒有未封存的群組，the mobile app SHALL 在 Groups 根畫面顯示「No groups yet. Tap + to create a group.」；Groups 根畫面讀完存著的群組之前，SHALL 不顯示這句話。

#### Scenario: 第一次打開 Groups

- **WHEN** 第一次啟動 app，選中 Groups 分頁
- **THEN** 顯示「No groups yet. Tap + to create a group.」，沒有任何群組的卡片

#### Scenario: 建立第一個群組

- **WHEN** 建立「Brisbane」
- **THEN** 這句話消失，只有 Brisbane 的卡片

#### Scenario: 封存唯一的群組

- **WHEN** 只有 Brisbane 時封存它
- **THEN** 又顯示這句話，沒有任何群組的卡片

#### Scenario: 讀完之前

- **WHEN** 有 Brisbane 時開啟 app，Groups 根畫面還沒讀完存著的群組
- **THEN** 沒有顯示這句話；讀完之後顯示 Brisbane 的卡片

### Requirement: GROUPS-2.2 依建立的先後列出未封存的群組

The mobile app SHALL 在 Groups 根畫面依建立的先後，由上而下列出每個未封存群組的卡片，不列出封存的群組；卡片顯示群組名稱，是角色為 button、無障礙名稱為「Open <群組名稱>」的按鈕。

#### Scenario: 三個群組

- **WHEN** 依序建立「Brisbane」、「Tokyo」、「Paris」
- **THEN** 由上而下是 Brisbane、Tokyo、Paris 的卡片，名稱分別是「Open Brisbane」、「Open Tokyo」、「Open Paris」

#### Scenario: 手機的時間往回調

- **WHEN** 建立「Brisbane」之後，把手機的時間調回前一天，再建立「Tokyo」
- **THEN** Tokyo 仍排在 Brisbane 下面

#### Scenario: 封存其中一個

- **WHEN** 依序建立「Brisbane」、「Tokyo」、「Paris」，封存 Tokyo
- **THEN** 由上而下是 Brisbane 和 Paris 的卡片

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

#### Scenario: 建立中切到別的分頁

- **WHEN** Android 上輸入「Brisbane」按 Create，還沒存好時點 Settings 分頁
- **THEN** 存好後回到 Groups 分頁，New Group 已經關閉，Groups 根畫面有「Brisbane」

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

### Requirement: GROUPS-20.2 群組的畫面在沒有支出時顯示提示

WHILE 群組沒有不在垃圾桶裡的支出，the mobile app SHALL 在群組的畫面顯示「No expenses in this group yet.」。

#### Scenario: 新建立的群組

- **WHEN** 建立「Brisbane」後點「Open Brisbane」
- **THEN** 群組的畫面顯示「No expenses in this group yet.」

#### Scenario: 唯一的支出移到垃圾桶

- **WHEN** Brisbane 只有 Dinner 時，在 Brisbane 的畫面把 Dinner 移到垃圾桶（LEDGER-71.3）
- **THEN** Brisbane 的畫面沒有卡片，顯示「No expenses in this group yet.」

### Requirement: GROUPS-21.1 找不到群組時顯示「Group not found.」

IF 群組的畫面的網址裡的 ID 不是任何群組的群組 ID，THEN the mobile app SHALL 讓這個畫面的標題是「Group Details」，只顯示「Group not found.」，標題列沒有「Group actions」選單；開啟存在的群組時，SHALL 從推入畫面到讀完群組都不顯示「Group not found.」。

#### Scenario: 不存在的群組

- **WHEN** 以 `/groups/00000000-0000-4000-8000-000000000000` 開啟 app
- **THEN** 選中 Groups 分頁，標題是「Group Details」，顯示「Group not found.」，沒有「No expenses in this group yet.」，也沒有「Group actions」選單

#### Scenario: 存在的群組

- **WHEN** 點「Open Brisbane」
- **THEN** 推入的畫面一開始和讀完 Brisbane 之後，都沒有顯示「Group not found.」

### Requirement: GROUPS-22.2 群組的畫面的 Group actions 選單

The mobile app SHALL 在群組的畫面的標題列放一個名稱是「Group actions」的選單（SHELL-47.1、SHELL-48.1）：未封存的群組依序是「Members」和「Rename Group」，封存的群組只有「Members」。

#### Scenario: iOS

- **WHEN** iOS 上開啟 Brisbane 的畫面
- **THEN** 標題列右邊是圖示 `ellipsis.circle`、名稱「Group actions」的選單，依序列出「Members」和「Rename Group」

#### Scenario: Android

- **WHEN** Android 上在 Brisbane 的畫面按「Group actions」
- **THEN** 跳出標題「Group actions」的對話框，依序列出「Members」、「Rename Group」和「Cancel」

#### Scenario: 封存的群組

- **WHEN** 封存 Brisbane 之後，在 iOS 上開啟它的畫面，或在 Android 上按它的「Group actions」
- **THEN** iOS 的選單只列出「Members」；Android 的對話框依序列出「Members」和「Cancel」

### Requirement: GROUPS-23.2 開啟和關閉 Members

WHEN 使用者在 Group actions 選「Members」，the mobile app SHALL 開啟從畫面底部升起、蓋在群組的畫面上的 Members，標題是「Members」，標題列只有取消「Close」（SHELL-47.1、SHELL-48.1）；沒有在移除中，Members 的名稱欄位也沒有在儲存中時，按 Close、把 Members 往下滑或按 Android 的返回鍵，SHALL 關閉 Members，回到群組的畫面。

#### Scenario: 開啟

- **WHEN** 在 Brisbane 的畫面選 Group actions 的「Members」
- **THEN** Members 從底部升起，蓋在 Brisbane 的畫面上，標題是「Members」，標題列只有「Close」；仍選中 Groups 分頁

#### Scenario: 按 Close

- **WHEN** 在 Members 按「Close」
- **THEN** Members 關閉，顯示 Brisbane 的畫面

#### Scenario: 往下滑或按返回鍵

- **WHEN** 在 iOS 上把 Members 往下滑，或在 Android 上按返回鍵
- **THEN** Members 關閉，顯示 Brisbane 的畫面

### Requirement: GROUPS-24.2 未封存群組的 Members 列出成員

The mobile app SHALL 在未封存群組的 Members 依加入的先後，由上而下列出群組的每位成員，被移出後再加回來的排在最後；每位成員那一列都是角色為 button 的按鈕，右邊有「›」：你那一列是你的成員名稱加上「 (You)」，無障礙名稱也是這樣；別人那一列是他的名稱，無障礙名稱是他的名稱；最後一列是角色為 button、名稱為「Add Member」的按鈕。

#### Scenario: 只有你

- **WHEN** 名字是「Taylor」，建立「Brisbane」後開啟它的 Members
- **THEN** 由上而下是「Taylor (You)」和「Add Member」；「Taylor (You)」那一列右邊有「›」，是名稱為「Taylor (You)」的按鈕

#### Scenario: 三位成員

- **WHEN** 在 Brisbane 依序加入「Casey」和「Blake」
- **THEN** 由上而下是「Taylor (You)」、「Casey」、「Blake」和「Add Member」；Casey 和 Blake 那兩列右邊有「›」，是名稱分別為「Casey」和「Blake」的按鈕

### Requirement: GROUPS-25.2 在未封存群組的 Members 點成員那一列跳出他的選單

WHEN 使用者在未封存群組的 Members 點成員那一列，the mobile app SHALL 跳出標題是這位成員的名稱的選單：別人的選單內容是「If removed, their historical payments and shares will be retained.」，依序是「Rename」、「Remove from Group」和「Cancel」；你的選單沒有內容，依序是「Rename」和「Cancel」。iOS 上選單是動作表（action sheet），「Remove from Group」是破壞性的樣式；Android 上選單是對話框。按 Cancel 時關閉選單，什麼都不改；Android 上按返回鍵或點對話框外面也一樣。

#### Scenario: iOS

- **WHEN** iOS 上在 Members 點「Blake」
- **THEN** 跳出標題「Blake」、內容是這句話的動作表，依序是「Rename」、破壞性的「Remove from Group」和「Cancel」

#### Scenario: Android

- **WHEN** Android 上在 Members 點「Blake」
- **THEN** 跳出標題「Blake」、內容是這句話的對話框，依序是「Rename」、「Remove from Group」和「Cancel」

#### Scenario: 你的選單

- **WHEN** 名字是「Taylor」，在 Members 點「Taylor (You)」
- **THEN** 跳出標題「Taylor」、沒有內容的選單，依序是「Rename」和「Cancel」

#### Scenario: 按 Cancel

- **WHEN** 在 Blake 的選單按「Cancel」
- **THEN** 選單關閉，Members 仍列出 Blake，Brisbane 的成員沒有改變

#### Scenario: Android 上直接關掉

- **WHEN** Android 上 Blake 的對話框開著時按返回鍵，或點對話框外面
- **THEN** 對話框關閉，Members 仍列出 Blake，Brisbane 的成員沒有改變

### Requirement: GROUPS-26.1 選 Remove from Group 時移出群組

WHEN 使用者在別人的選單選「Remove from Group」，the mobile app SHALL 不再另外確認，直接把他移出群組，存好後 Members 不再列出他。

#### Scenario: 移除

- **WHEN** Brisbane 有 Taylor、Blake 和 Casey，在 Blake 的選單選「Remove from Group」
- **THEN** 沒有跳出其他提示框；Members 由上而下是「Taylor (You)」、「Casey」和「Add Member」；Brisbane 的成員是 Taylor 和 Casey

#### Scenario: 重新啟動

- **WHEN** 移除 Blake 之後重新啟動 app
- **THEN** Brisbane 的成員仍是 Taylor 和 Casey

### Requirement: GROUPS-27.2 移除中鎖住 Members

WHILE 有成員在移除中，the mobile app SHALL 停用 Close，讓每一列和「Add Member」都不能按，名稱欄位輸入的字不會改變名稱、按 Return 也不加入成員，也不讓 Members 因為往下滑或按 Android 的返回鍵而關閉，直到存好或存不進去為止。

#### Scenario: 移除中

- **WHEN** 在 Blake 的選單選「Remove from Group」，還沒存好
- **THEN** Close 停用；點「Casey」或「Taylor (You)」都不跳出選單，按「Add Member」不出現名稱欄位；Members 仍開著；存好後 Blake 不在了，Close 恢復可以按

#### Scenario: 往下滑或按返回鍵

- **WHEN** 還沒存好時往下滑 Members，或在 Android 上按返回鍵
- **THEN** Members 不關閉

#### Scenario: 名稱欄位開著時

- **WHEN** 名稱欄位裡有「Dana」時移除 Blake，還沒存好時在名稱欄位按 Return
- **THEN** 沒有加入 Dana；存好後 Blake 不在了，名稱欄位仍是「Dana」

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

### Requirement: GROUPS-29.2 按 Add Member 時多一列名稱欄位

WHEN 使用者在未封存群組的 Members 按「Add Member」，the mobile app SHALL 不開新的畫面，把「Add Member」那一列換成名稱欄位，讓它取得焦點並打開鍵盤：名稱欄位的無障礙名稱是「Member name」，開啟時是空的、顯示「Enter member name」；名稱欄位失去焦點時，例如收起鍵盤或點了成員那一列，名稱欄位和裡面的名稱都留著，名稱欄位開著時點成員那一列，第一下就跳出他的選單（GROUPS-25.2）；Members 關閉時，名稱欄位裡還沒加入的名稱不會存下。

#### Scenario: 按 Add Member

- **WHEN** 在 Brisbane 的 Members 按「Add Member」
- **THEN** 沒有打開新的畫面，最上面仍是 Members；「Add Member」那一列變成空的名稱欄位，顯示「Enter member name」，已經取得焦點

#### Scenario: 收起鍵盤

- **WHEN** 名稱欄位裡有「Blake」時收起鍵盤
- **THEN** 名稱欄位仍在最下面，仍是「Blake」

#### Scenario: 點成員那一列

- **WHEN** 名稱欄位裡有「Dana」、鍵盤開著時點「Blake」
- **THEN** 第一下就跳出 Blake 的選單；按 Cancel 後名稱欄位仍是「Dana」

#### Scenario: 還沒加入就關閉 Members

- **WHEN** 在名稱欄位輸入「Blake」後按 Members 的「Close」
- **THEN** Members 關閉，Brisbane 的成員仍只有 Taylor

### Requirement: GROUPS-30.2 名稱空白時按 Return 收起名稱欄位

WHEN 使用者在 Members 的名稱欄位按 Return，而名稱去掉頭尾空白後是空的，the mobile app SHALL 不新增成員，收起名稱欄位和鍵盤，那一列又是「Add Member」。

#### Scenario: 空的或只有空白

- **WHEN** 名稱欄位是空的，或只有「   」，按 Return
- **THEN** 沒有新增成員；名稱欄位收起，最後一列又是「Add Member」

### Requirement: GROUPS-31.2 按 Return 時加入新的成員

WHEN 使用者在 Members 的名稱欄位按 Return，而名稱去掉頭尾空白後不是空的，也和群組的成員、這個群組的前成員都不同名，the mobile app SHALL 以去掉頭尾空白的名稱把一位新的成員加入群組，存好後把他列在成員的最後，名稱欄位清空並保有焦點，仍在最下面，可以接著加下一位；成員的人數和名稱的長度都沒有上限。

#### Scenario: 去掉頭尾空白

- **WHEN** 在 Brisbane 的名稱欄位輸入「 Blake 」，按 Return
- **THEN** Members 由上而下是「Taylor (You)」、「Blake」和空的名稱欄位，名稱欄位仍有焦點；存下的名稱是「Blake」

#### Scenario: 接著加下一位

- **WHEN** 再輸入「Casey」，按 Return
- **THEN** 依序是「Taylor (You)」、「Blake」、「Casey」和空的名稱欄位

#### Scenario: 很多成員

- **WHEN** 在 Brisbane 一位一位加入 30 位成員
- **THEN** Brisbane 有 31 位成員，依加入的先後排列

#### Scenario: 很長的名稱

- **WHEN** 輸入 300 個「a」，按 Return
- **THEN** 存下的名稱是 300 個「a」

#### Scenario: 儲存中切到別的分頁

- **WHEN** Android 上在名稱欄位輸入「Blake」按 Return，還沒存好時點 Settings 分頁
- **THEN** 存好後回到 Groups 分頁，Members 列出 Blake

### Requirement: GROUPS-32.1 加入的成員的 ID

WHEN 一位新的成員從 Members 加入群組，the mobile app SHALL 給他一個新的成員 ID，不給他使用者 ID；成員 ID 是小寫的第 4 版 UUID，和本機資料裡其他任何 ID 都不同。

#### Scenario: 加入 Blake

- **WHEN** 在 Brisbane 加入「Blake」
- **THEN** Blake 沒有使用者 ID；他的成員 ID 是小寫的第 4 版 UUID，和 Brisbane 的群組 ID、你的成員 ID、你的使用者 ID、個人空間 ID 和個人 participant ID 都不同

#### Scenario: 兩個群組都有 Blake

- **WHEN** 在 Brisbane 和 Tokyo 都加入「Blake」
- **THEN** 兩位 Blake 的成員 ID 不同

### Requirement: GROUPS-33.2 和群組的成員同名時在欄位下方提示

IF 使用者在 Members 的名稱欄位按 Return 時，名稱和群組的某位成員同名，或在 Rename Member 按 Save 或 Return 時，名稱和群組的另一位成員同名，THEN the mobile app SHALL 不儲存、不收起名稱欄位也不關閉 Rename Member、不跳出提示框，保留輸入，在名稱欄位下方顯示「A member with this name already exists.」並讓螢幕閱讀器念出來，直到名稱被修改；你也算群組的成員。

#### Scenario: 和別人同名

- **WHEN** Brisbane 有 Taylor 和 Blake，在名稱欄位輸入「 blake 」，按 Return
- **THEN** 名稱欄位仍是「 blake 」，下方顯示這句話，螢幕閱讀器念出來，沒有提示框；Brisbane 仍只有 Taylor 和 Blake

#### Scenario: 你的名字

- **WHEN** 你的名字是「Taylor」，在名稱欄位輸入「TAYLOR」，按 Return
- **THEN** 名稱欄位下方顯示這句話，沒有新增成員

#### Scenario: 改成別人的名稱

- **WHEN** Brisbane 有 Taylor、Blake 和 Casey，在 Casey 的 Rename Member 把名稱改成「 blake 」，按 Save 或 Return
- **THEN** Rename Member 仍開著，名稱欄位下方顯示這句話；Casey 的名稱沒有改變

#### Scenario: 修改名稱

- **WHEN** 出現這句話之後，把名稱改成「Blake K.」
- **THEN** 這句話消失

#### Scenario: 同時和成員、前成員同名

- **WHEN** 移除 Blake 之後，把 Casey 改名為「Blake」，再在名稱欄位輸入「blake」，按 Return
- **THEN** 名稱欄位下方顯示這句話，沒有問要不要加回來

### Requirement: GROUPS-34.2 和前成員同名時問要不要加回來

IF 使用者在 Members 的名稱欄位按 Return 時，名稱不和群組的任何成員同名，但和這個群組的前成員同名，THEN the mobile app SHALL 先不儲存，跳出標題「Add <前成員的名稱> Back?」、內容「<前成員的名稱> was removed from this group before. Adding them back reconnects their past payments and shares.」的提示框，選項是「Cancel」和「Add Back」，同名的前成員不只一位時問的是最近被移出的那一位：按 Add Back 時讓他回到群組，沿用他原本的成員 ID 和名稱，存好後把他列在成員的最後，名稱欄位清空並保有焦點；按 Cancel 時名稱欄位保留輸入，Android 上按返回鍵或點提示框外面也一樣。

#### Scenario: 加回來

- **WHEN** Brisbane 有 Taylor、Blake 和 Casey，移除 Blake 之後，在名稱欄位輸入「blake」，按 Return，再按「Add Back」
- **THEN** 先跳出標題「Add Blake Back?」、內容「Blake was removed from this group before. Adding them back reconnects their past payments and shares.」的提示框；按 Add Back 後 Members 由上而下是「Taylor (You)」、「Casey」、「Blake」和空的名稱欄位；Blake 的成員 ID 和移除之前一樣，名稱是「Blake」

#### Scenario: 按 Cancel

- **WHEN** 在這個提示框按「Cancel」
- **THEN** 名稱欄位仍是「blake」而且可以編輯；Brisbane 的成員是 Taylor 和 Casey

#### Scenario: Android 上直接關掉

- **WHEN** Android 上這個提示框開著時按返回鍵，或點提示框外面
- **THEN** 提示框關閉，名稱欄位仍是「blake」；Brisbane 的成員是 Taylor 和 Casey

#### Scenario: 同名的前成員不只一位

- **WHEN** 移除 Blake 之後，把 Casey 改名為「BLAKE」再移除他，然後在名稱欄位輸入「blake」，按 Return，再按「Add Back」
- **THEN** 提示框的標題是「Add BLAKE Back?」；回到 Brisbane 的是原本的 Casey，成員 ID 和移除之前一樣，名稱是「BLAKE」；原本的 Blake 仍是前成員

#### Scenario: 最後被移除的人比較早加入

- **WHEN** Brisbane 依序加入 Blake 和 Casey，移除 Casey 之後，把 Blake 改名為「casey」再移除他，然後在名稱欄位輸入「Casey」，按 Return，再按「Add Back」
- **THEN** 提示框的標題是「Add casey Back?」；回到 Brisbane 的是原本的 Blake，成員 ID 和移除之前一樣，名稱是「casey」；原本的 Casey 仍是前成員

#### Scenario: 重新啟動之後

- **WHEN** 移除 Blake、重新啟動 app 之後，在名稱欄位輸入「Blake」，按 Return，再按「Add Back」
- **THEN** Blake 回到 Brisbane，成員 ID 和移除之前一樣

#### Scenario: 別的群組的前成員

- **WHEN** 在 Tokyo 移除「Blake」之後，在 Brisbane 的名稱欄位輸入「Blake」，按 Return
- **THEN** 沒有問要不要加回來，Brisbane 加入一位新的 Blake，成員 ID 和 Tokyo 的 Blake 不同

### Requirement: GROUPS-35.2 新增存不進去時提示

IF 新的成員，或按 Add Back 時加回來的前成員，存不進本機資料，THEN the mobile app SHALL 跳出標題「Unable to Add Member」、內容「The member could not be saved. Please try again.」的提示框，名稱欄位保留輸入，本機資料維持按下之前的樣子。

#### Scenario: 寫不進去

- **WHEN** 資料庫無法寫入時，在名稱欄位輸入「Blake」按 Return
- **THEN** 跳出這個提示框，名稱欄位仍是「Blake」而且可以編輯；本機資料和按 Return 之前一樣

#### Scenario: 寫到一半失敗

- **WHEN** 加入時的某一筆寫入失敗，在它之前的寫入都成功了，不論是哪一筆
- **THEN** 跳出這個提示框，本機資料和按 Return 之前一樣

#### Scenario: 加回來時寫不進去

- **WHEN** 資料庫無法寫入時，在「Add Blake Back?」按「Add Back」
- **THEN** 跳出這個提示框，名稱欄位仍是「Blake」，Blake 仍是前成員

#### Scenario: 再試一次

- **WHEN** 失敗後資料庫恢復，再按一次 Return
- **THEN** Brisbane 只多了一位 Blake

### Requirement: GROUPS-36.1 開啟 Rename Member

WHEN 使用者在成員的選單選「Rename」，the mobile app SHALL 開啟從畫面底部升起、蓋在 Members 上的 Rename Member，標題是「Rename Member」，標題列有取消「Cancel」和確認「Save」（SHELL-47.1、SHELL-48.1），內容只有名稱欄位：名稱欄位的無障礙名稱是「Member name」，開啟時是這位成員現在的名稱，並取得焦點，清空時顯示「Enter member name」。

#### Scenario: 開啟

- **WHEN** 在 Members 點「Blake」，選「Rename」
- **THEN** Rename Member 從底部升起，蓋在 Members 上，標題是「Rename Member」，標題列的取消是「Cancel」、確認是「Save」；名稱欄位是「Blake」，已經取得焦點

#### Scenario: 你的名稱

- **WHEN** 名字是「Taylor」，在 Members 點「Taylor (You)」，選「Rename」
- **THEN** Rename Member 的名稱欄位是「Taylor」

#### Scenario: 清空名稱

- **WHEN** 在 Blake 的 Rename Member 清空名稱
- **THEN** 名稱欄位顯示「Enter member name」

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

#### Scenario: 改你的名稱

- **WHEN** 名字是「Taylor」，在你的 Rename Member 輸入「Sam」，按 Save
- **THEN** Rename Member 關閉，Members 由上而下是「Sam (You)」和「Add Member」；你在 Brisbane 的成員 ID 和使用者 ID 都沒有改變

#### Scenario: 重新啟動

- **WHEN** 把 Blak 改名為「Blake」之後重新啟動 app
- **THEN** 他的名稱仍是「Blake」

#### Scenario: 儲存中切到別的分頁

- **WHEN** Android 上在 Blak 的 Rename Member 輸入「Blake」按 Save，還沒存好時點 Settings 分頁
- **THEN** 存好後回到 Groups 分頁，Rename Member 已經關閉，Members 列出 Blake

### Requirement: GROUPS-39.1 成員的新名稱存不進去時提示

IF 成員的新名稱存不進本機資料，THEN the mobile app SHALL 跳出標題「Unable to Rename Member」、內容「The member could not be saved. Please try again.」的提示框，Rename Member 保持開啟並保留輸入，本機資料維持按下之前的樣子。

#### Scenario: 寫不進去

- **WHEN** 資料庫無法寫入時，在 Blak 的 Rename Member 輸入「Blake」按 Save
- **THEN** 跳出這個提示框，Rename Member 仍開著，名稱欄位是「Blake」，Save 可以再按；本機資料和按 Save 之前一樣，他的名稱仍是「Blak」

#### Scenario: 寫到一半失敗

- **WHEN** 改名時的某一筆寫入失敗，在它之前的寫入都成功了，不論是哪一筆
- **THEN** 跳出這個提示框，本機資料和按 Save 之前一樣

#### Scenario: 再試一次

- **WHEN** 失敗後資料庫恢復，再按一次 Save
- **THEN** Rename Member 關閉，他的名稱是「Blake」

### Requirement: GROUPS-40.2 點標題或在 Group actions 選 Rename Group 時開啟 Rename Group

WHEN 使用者在未封存群組的畫面點標題，或在 Group actions 選「Rename Group」，the mobile app SHALL 開啟從畫面底部升起、蓋在群組的畫面上的 Rename Group，標題是「Rename Group」，標題列有取消「Cancel」和確認「Save」（SHELL-47.1、SHELL-48.1），內容由上而下是區塊標題「GROUP DETAILS」、區塊裡唯一的一列「Name」和它的名稱欄位；名稱欄位的無障礙名稱是「Group name」，開啟時是群組現在的名稱，並取得焦點，清空時顯示「Group name」；未封存群組的畫面的標題是名稱為群組名稱、無障礙提示為「Renames the group」的按鈕，名稱右邊有向下的箭頭（iOS 是 SF Symbol `chevron.down`，Android 是 Material Symbols `expand_more`），Android 上這個按鈕至少 48 dp 高，按下時在按鈕上顯示顏色跟著 app 外觀的 ripple；封存的群組和找不到的群組的畫面的標題不是按鈕，也沒有箭頭。

#### Scenario: 點標題

- **WHEN** 在 Brisbane 的畫面點標題「Brisbane」
- **THEN** Rename Group 從底部升起，蓋在 Brisbane 的畫面上，名稱欄位是「Brisbane」，已經取得焦點

#### Scenario: 從 Group actions 開啟

- **WHEN** 在 Brisbane 的畫面選 Group actions 的「Rename Group」
- **THEN** Rename Group 從底部升起，蓋在 Brisbane 的畫面上，標題是「Rename Group」，標題列的取消是「Cancel」、確認是「Save」；由上而下是「GROUP DETAILS」、「Name」和名稱欄位，名稱欄位是「Brisbane」，已經取得焦點

#### Scenario: 標題是按鈕

- **WHEN** 打開 Brisbane 的畫面
- **THEN** 標題列的標題「Brisbane」是名稱為「Brisbane」的按鈕，右邊有向下的箭頭；螢幕閱讀器讀出「Brisbane」，再讀出提示「Renames the group」

#### Scenario: Android

- **WHEN** Android 上打開 Brisbane 的畫面
- **THEN** 標題按鈕的箭頭是 `expand_more`，按鈕至少 48 dp 高；按下時按鈕上出現 ripple，深色和淺色時的顏色不同，或是由系統依外觀決定

#### Scenario: 封存的群組

- **WHEN** 封存 Brisbane 之後打開它的畫面
- **THEN** 標題「Brisbane」不是按鈕，沒有箭頭，點了沒有反應

#### Scenario: 清空名稱

- **WHEN** 在 Brisbane 的 Rename Group 清空名稱
- **THEN** 名稱欄位顯示「Group name」

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

#### Scenario: 儲存中切到別的分頁

- **WHEN** Android 上在 Trip 的 Rename Group 輸入「Tokyo」按 Save，還沒存好時點 Settings 分頁
- **THEN** 存好後回到 Groups 分頁，Rename Group 已經關閉，群組的畫面的標題是「Tokyo」

### Requirement: GROUPS-42.1 群組的新名稱存不進去時提示

IF 群組的新名稱存不進本機資料，THEN the mobile app SHALL 跳出標題「Unable to Rename Group」、內容「Your group could not be saved. Please try again.」的提示框，Rename Group 保持開啟並保留輸入，本機資料維持按下之前的樣子。

#### Scenario: 寫不進去

- **WHEN** 資料庫無法寫入時，在 Trip 的 Rename Group 輸入「Tokyo」按 Save
- **THEN** 跳出這個提示框，Rename Group 仍開著，名稱欄位是「Tokyo」，Save 可以再按；本機資料和按 Save 之前一樣，群組的名稱仍是「Trip」

#### Scenario: 寫到一半失敗

- **WHEN** 改名時的某一筆寫入失敗，在它之前的寫入都成功了，不論是哪一筆
- **THEN** 跳出這個提示框，本機資料和按 Save 之前一樣

#### Scenario: 再試一次

- **WHEN** 失敗後資料庫恢復，再按一次 Save
- **THEN** Rename Group 關閉，群組的名稱是「Tokyo」

### Requirement: GROUPS-43.2 按 Cancel、往下滑或按返回鍵時不儲存

WHEN 沒有在儲存中，而使用者在名稱表單按 Cancel、把它往下滑或按 Android 的返回鍵，the mobile app SHALL 關閉這個表單，不儲存：從 Rename Member 回到 Members，從 Rename Group 回到群組的畫面。

#### Scenario: Rename Member

- **WHEN** 在 Blake 的 Rename Member 輸入「Blake K.」後按 Cancel
- **THEN** Rename Member 關閉，Members 仍是「Blake」

#### Scenario: Rename Group

- **WHEN** 在 Trip 的 Rename Group 輸入「Tokyo」後按 Cancel
- **THEN** Rename Group 關閉，群組的畫面的標題仍是「Trip」

#### Scenario: 往下滑或按返回鍵

- **WHEN** 在 iOS 上把名稱表單往下滑，或在 Android 上按返回鍵
- **THEN** 表單關閉，沒有儲存

### Requirement: GROUPS-44.2 儲存中鎖住名稱表單和名稱欄位

WHILE 名稱表單或 Members 的名稱欄位在儲存中，the mobile app SHALL 不讓名稱被修改，再按確認或 Return 也不再儲存一次、不再提示；名稱表單另外讓名稱欄位不能編輯，停用它的 Cancel 和確認，也不因為往下滑或按 Android 的返回鍵而關閉；Members 的名稱欄位在儲存中時保有焦點和鍵盤，輸入的字不會改變名稱，Members 的 Close 停用，成員列都不能按，Members 也不因為往下滑或按 Android 的返回鍵而關閉；這些都到存好或存不進去為止。

#### Scenario: 新增中

- **WHEN** 在 Members 的名稱欄位輸入「Blake」按 Return，還沒存好
- **THEN** 名稱欄位仍是「Blake」，鍵盤仍開著，這時輸入的字不會改變名稱；Close 停用，Members 仍開著；存好後多了 Blake，名稱欄位清空，可以輸入下一位，Close 恢復可以按

#### Scenario: 連按兩次

- **WHEN** 在名稱欄位輸入「Blake」後連按兩次 Return，第二次在存好之前
- **THEN** 只加入一位 Blake，沒有顯示「A member with this name already exists.」

#### Scenario: 加回來中

- **WHEN** 在「Add Blake Back?」按「Add Back」，還沒存好
- **THEN** 輸入的字不會改變名稱欄位的名稱，Close 停用；這時按 Return 也不再問一次；存好後 Blake 回到群組

#### Scenario: 改名中

- **WHEN** 在 Rename Member 或 Rename Group 按 Save，還沒存好
- **THEN** Cancel 和 Save 都停用，名稱欄位不能編輯，表單仍開著

#### Scenario: 往下滑或按返回鍵

- **WHEN** Members 的名稱欄位、Rename Member 或 Rename Group 還沒存好時，往下滑 Members 或名稱表單，或在 Android 上按返回鍵
- **THEN** 都不關閉；存好後名稱表單才關閉，Members 仍開著

#### Scenario: 存不進去之後

- **WHEN** Members 的名稱欄位、Rename Member 或 Rename Group 存不進去之後
- **THEN** 名稱欄位、Close、Cancel 和確認都恢復可以用：可以修改名稱，按 Close 或 Cancel 會關閉，也能往下滑關閉

### Requirement: GROUPS-45.2 名稱表單和名稱欄位的鍵盤

The mobile app SHALL 讓名稱表單和 Members 的名稱欄位的鍵盤把每個字的開頭自動大寫、不自動校正，並以完成鍵當 Return 鍵。

#### Scenario: 輸入名稱

- **WHEN** 在 Members 的名稱欄位、Rename Member 或 Rename Group，用手機的鍵盤輸入「teh trip」
- **THEN** 名稱欄位是「Teh Trip」：每個字的開頭都大寫，「teh」沒有被校正成「the」；鍵盤的 Return 鍵是完成鍵

### Requirement: GROUPS-46.1 你在群組裡的名稱和你的名字分開

The mobile app SHALL 讓你的名字和你在每個群組裡的成員名稱各自獨立：在 Settings 存下新的名字（SHELL-18.1）時，不改你在任何群組裡的成員名稱，之後建立的群組才用新的名字（GROUPS-9.1）；在 Rename Member 改你在一個群組裡的名稱時，不改你的名字，也不改你在其他群組裡的成員名稱。

#### Scenario: 在 Settings 改名

- **WHEN** 名字是「Taylor」，建立「Brisbane」之後，在 Settings 把名字改成「Sam」
- **THEN** Brisbane 裡你的成員名稱仍是「Taylor」，Members 是「Taylor (You)」

#### Scenario: 在群組裡改你的名稱

- **WHEN** 名字是「Taylor」，建立「Brisbane」和「Tokyo」之後，在 Brisbane 的 Members 把你的名稱改成「Sam」
- **THEN** 你的名字仍是「Taylor」，Tokyo 裡你的成員名稱也仍是「Taylor」

### Requirement: GROUPS-47.1 (e2e) 左滑群組的卡片露出 Archive

WHEN 使用者在 Groups 根畫面把群組的卡片往左滑，the mobile app SHALL 在卡片右邊露出顯示「Archive」的按鈕，它的無障礙名稱是「Archive <群組名稱>」。

#### Scenario: 左滑

- **WHEN** 在 Groups 根畫面把 Brisbane 的卡片往左滑
- **THEN** 卡片右邊露出「Archive」，它的無障礙名稱是「Archive Brisbane」

### Requirement: GROUPS-48.1 按 Archive 時封存群組

WHEN 使用者按群組的卡片露出的「Archive」，或使用卡片上名稱是「Archive group」的輔助功能動作，the mobile app SHALL 不另外確認，就把這個群組存成封存的，群組 ID、名稱和成員都不變，存好後才把它的卡片移出 Groups 根畫面。

#### Scenario: 卡片的輔助功能動作

- **WHEN** 有 Brisbane 和 Tokyo
- **THEN** 兩張卡片都有名稱是「Archive group」的輔助功能動作

#### Scenario: 封存

- **WHEN** 有 Brisbane 和 Tokyo，Brisbane 的成員是 Taylor 和 Blake，對 Brisbane 的卡片使用「Archive group」
- **THEN** 沒有跳出提示框；Groups 根畫面只剩 Tokyo；本機資料裡 Brisbane 的群組 ID、名稱和成員都和封存之前一樣

#### Scenario: 存好之前

- **WHEN** 封存 Brisbane 還沒存好
- **THEN** Brisbane 的卡片仍在 Groups 根畫面；存好後才移出

#### Scenario: 按 Archive

- **WHEN** 左滑 Brisbane 的卡片，按「Archive」
- **THEN** Brisbane 移出 Groups 根畫面

### Requirement: GROUPS-49.1 封存後顯示通知

WHEN 群組存成封存的，the mobile app SHALL 在 Groups 根畫面顯示「Group archived · Find it in Settings」並讓螢幕閱讀器念出來，4.5 秒後收起；收起之前又有群組存成封存的，就從那時起重新算 4.5 秒。

#### Scenario: 封存 Brisbane

- **WHEN** 封存 Brisbane
- **THEN** 存好時顯示「Group archived · Find it in Settings」，螢幕閱讀器念出來；過了 4.4 秒仍顯示，到 4.5 秒時收起

#### Scenario: 接著封存另一個

- **WHEN** 封存 Brisbane 3 秒後封存 Tokyo
- **THEN** Tokyo 存好時螢幕閱讀器再念一次；這句話一直顯示，到 Tokyo 存好之後 4.5 秒才收起

#### Scenario: 還沒存好

- **WHEN** 封存 Brisbane 還沒存好
- **THEN** 不顯示這句話

### Requirement: GROUPS-50.1 封存存不進去時提示

IF 封存存不進本機資料，THEN the mobile app SHALL 跳出標題「Unable to Archive Group」、內容「The group could not be saved as archived. Please try again.」的提示框，不顯示「Group archived · Find it in Settings」，群組的卡片留在 Groups 根畫面，本機資料維持封存之前的樣子。

#### Scenario: 寫不進去

- **WHEN** 資料庫無法寫入時封存 Brisbane
- **THEN** 跳出這個提示框，沒有顯示通知；Brisbane 的卡片仍在 Groups 根畫面，本機資料和封存之前一樣

#### Scenario: 寫到一半失敗

- **WHEN** 封存時的某一筆寫入失敗，在它之前的寫入都成功了，不論是哪一筆
- **THEN** 跳出這個提示框，本機資料和封存之前一樣

#### Scenario: 再試一次

- **WHEN** 失敗後資料庫恢復，再封存一次 Brisbane
- **THEN** Brisbane 移出 Groups 根畫面，顯示「Group archived · Find it in Settings」

### Requirement: GROUPS-51.1 Settings 的 Archived Groups 列顯示封存群組的數量

The mobile app SHALL 在 Settings 根畫面「Archived Groups」那一列的文字右邊顯示封存群組的數量，沒有封存群組時是「0」，這一列的無障礙名稱是「Archived groups, <數量>」；Settings 根畫面讀完存著的群組之前，SHALL 不顯示數量，這一列的無障礙名稱是「Archived groups」。

#### Scenario: 還沒有封存

- **WHEN** 第一次啟動 app，選中 Settings 分頁
- **THEN** 「Archived Groups」右邊是「0」，這一列的無障礙名稱是「Archived groups, 0」

#### Scenario: 封存兩個

- **WHEN** 封存 Brisbane 和 Tokyo 之後選中 Settings 分頁
- **THEN** 「Archived Groups」右邊是「2」，這一列的無障礙名稱是「Archived groups, 2」

#### Scenario: 還原一個

- **WHEN** 在 Archived Groups 還原 Tokyo，再返回 Settings 的根畫面
- **THEN** 「Archived Groups」右邊是「1」，這一列的無障礙名稱是「Archived groups, 1」

#### Scenario: 讀完之前

- **WHEN** 有封存的 Brisbane 時開啟 app 並選中 Settings 分頁，Settings 根畫面還沒讀完存著的群組
- **THEN** 「Archived Groups」右邊沒有數量，這一列的無障礙名稱是「Archived groups」；讀完之後右邊是「1」，無障礙名稱是「Archived groups, 1」

### Requirement: GROUPS-52.1 Archived Groups 列出封存的群組

The mobile app SHALL 在 Archived Groups 依建立的先後，由上而下列出每個封存群組的卡片，不列出未封存的群組；沒有封存群組時只顯示「No archived groups.」，但讀完存著的群組之前不顯示這句話。

#### Scenario: 還沒有封存

- **WHEN** 有 Brisbane，沒有封存任何群組時打開 Archived Groups
- **THEN** 只顯示「No archived groups.」，沒有任何卡片

#### Scenario: 依建立的先後

- **WHEN** 依序建立 Tokyo、Brisbane、Lisbon、Paris，依序封存 Brisbane、Tokyo、Paris，然後打開 Archived Groups
- **THEN** 由上而下是 Tokyo、Brisbane 和 Paris 的卡片，沒有 Lisbon，也沒有「No archived groups.」

#### Scenario: 讀完之前

- **WHEN** 封存 Brisbane 之後打開 Archived Groups，Archived Groups 還沒讀完存著的群組
- **THEN** 沒有顯示「No archived groups.」；讀完之後顯示 Brisbane 的卡片

### Requirement: GROUPS-53.1 封存群組的卡片

The mobile app SHALL 讓封存群組的卡片由上而下顯示群組名稱和「Archived group」，名稱只佔一行、放不下時在結尾以「…」截斷；卡片是角色為 button、無障礙名稱為完整的「Open <群組名稱>」的按鈕，卡片之外另有一個顯示「Restore」、無障礙名稱為「Restore <群組名稱>」的按鈕。

#### Scenario: 封存的 Brisbane

- **WHEN** 封存 Brisbane 之後打開 Archived Groups
- **THEN** 卡片由上而下是「Brisbane」和「Archived group」，是名稱為「Open Brisbane」的按鈕；卡片之外有顯示「Restore」、名稱為「Restore Brisbane」的按鈕

#### Scenario: 很長的名稱

- **WHEN** 封存名稱是 300 個「a」的群組
- **THEN** 卡片上的名稱只佔一行，放不下的部分在結尾截斷；卡片的無障礙名稱是「Open 」加上完整的 300 個「a」，Restore 按鈕的是「Restore 」加上完整的 300 個「a」

### Requirement: GROUPS-54.1 點封存群組的卡片在 Settings 分頁推入群組的畫面

WHEN 使用者點封存群組的卡片，the mobile app SHALL 在 Settings 分頁推入這個群組的畫面，網址是 `/settings/archived-groups/<群組 ID>`，標題是群組名稱，分頁列仍選中 Settings；從這個畫面返回時回到 Archived Groups，從它打開的 Members 和名稱表單也都蓋在它上面，留在 Settings 分頁。

#### Scenario: 點卡片

- **WHEN** 封存 Brisbane 之後，在 Archived Groups 點「Open Brisbane」
- **THEN** 分頁列仍選中 Settings，Settings 分頁的堆疊由下而上是「Settings」根畫面、「Archived Groups」和「Brisbane」，網址是 `/settings/archived-groups/` 加上 Brisbane 的群組 ID；Groups 分頁的堆疊仍只有「Groups」根畫面

#### Scenario: 返回

- **WHEN** 在這個畫面返回，或在 Android 上按返回鍵
- **THEN** 回到 Archived Groups，分頁列仍選中 Settings

#### Scenario: 打開 Members

- **WHEN** 在這個畫面選 Group actions 的「Members」
- **THEN** Members 蓋在 Brisbane 的畫面上，分頁列仍選中 Settings

#### Scenario: 還原後新增成員和改名

- **WHEN** 在這個畫面按「Restore Group」，從 Members 加入「Blake」並把他改名為「Casey」，再從 Group actions 把群組改名為「Tokyo」
- **THEN** Members 的名稱欄位在 Members 裡，Rename Member 和 Rename Group 都蓋在這個畫面上，分頁列一直選中 Settings；群組的名稱是 Tokyo，成員是 Taylor 和 Casey

### Requirement: GROUPS-55.1 封存群組的畫面顯示唯讀的提示和 Restore Group

WHILE 群組已封存，the mobile app SHALL 在它的畫面最上面顯示「Archived group. Expenses and allocations are read-only.」，下面是角色為 button、名稱為「Restore Group」的按鈕。

#### Scenario: 從 Archived Groups 打開

- **WHEN** 封存 Brisbane 之後，從 Archived Groups 打開它的畫面
- **THEN** 由上而下是「Archived group. Expenses and allocations are read-only.」、「Restore Group」按鈕和「No expenses in this group yet.」

#### Scenario: 以網址在 Groups 分頁打開

- **WHEN** 封存 Brisbane 之後，以 `/groups/` 加上 Brisbane 的群組 ID 開啟 app
- **THEN** Groups 分頁上 Brisbane 的畫面也顯示這句話和「Restore Group」按鈕

#### Scenario: 未封存的群組

- **WHEN** 打開未封存的 Tokyo 的畫面
- **THEN** 沒有這句話，也沒有「Restore Group」

### Requirement: GROUPS-56.1 封存群組的 Members 只能看

WHILE 群組已封存，the mobile app SHALL 在它的 Members 依加入的先後，由上而下列出每位成員，你那一列是你的成員名稱加上「 (You)」，別人那一列是他的名稱；成員列都不是按鈕、右邊沒有「›」，點了不跳出選單，也沒有「Add Member」。

#### Scenario: 封存的 Brisbane

- **WHEN** 名字是「Taylor」，Brisbane 依序加入 Casey 和 Blake，封存之後打開它的 Members
- **THEN** 由上而下是「Taylor (You)」、「Casey」和「Blake」；Members 的內容裡沒有任何按鈕和「›」，也沒有「Add Member」

#### Scenario: 點成員

- **WHEN** 在封存的 Brisbane 的 Members 點「Blake」或「Taylor (You)」
- **THEN** 沒有跳出選單或提示框，Members 仍開著

#### Scenario: 還原之後

- **WHEN** 還原 Brisbane 之後打開它的 Members
- **THEN** 成員列又是按鈕，最後一列是「Add Member」（GROUPS-24.2）

### Requirement: GROUPS-57.1 按 Restore 或 Restore Group 時還原群組

WHEN 使用者在 Archived Groups 按群組的「Restore」，或在封存群組的畫面按「Restore Group」，the mobile app SHALL 不另外確認，只拿掉這個群組的封存標記，存好後把它移出 Archived Groups，讓它回到 Groups 根畫面上依建立的先後該在的位置；在群組的畫面還原時，畫面不再顯示唯讀的提示和「Restore Group」。

#### Scenario: 在 Archived Groups 還原

- **WHEN** 依序建立 Brisbane、Tokyo、Paris，封存 Tokyo，再建立 Rome，然後在 Archived Groups 按「Restore Tokyo」
- **THEN** 沒有跳出提示框；Archived Groups 只顯示「No archived groups.」；Groups 根畫面由上而下是 Brisbane、Tokyo、Paris、Rome

#### Scenario: 在群組的畫面還原

- **WHEN** 從 Archived Groups 打開封存的 Tokyo，按「Restore Group」
- **THEN** 畫面不再顯示唯讀的提示和「Restore Group」，Group actions 依序是「Members」和「Rename Group」；返回 Archived Groups 時只顯示「No archived groups.」

#### Scenario: 只拿掉封存標記

- **WHEN** Brisbane 有成員 Blake 和前成員 Casey，封存之後還原
- **THEN** 本機資料和封存之前完全一樣

#### Scenario: 在 Groups 分頁還原

- **WHEN** 有 Brisbane、Tokyo、Paris，以網址在 Groups 分頁打開封存的 Tokyo，按「Restore Group」，再返回
- **THEN** Groups 根畫面由上而下是 Brisbane、Tokyo、Paris

### Requirement: GROUPS-58.1 還原存不進去時提示

IF 還原存不進本機資料，THEN the mobile app SHALL 跳出標題「Unable to Restore Group」、內容「The group could not be restored. Please try again.」的提示框，群組仍是封存的：Archived Groups 仍列出它，群組的畫面仍顯示唯讀的提示和「Restore Group」，本機資料維持還原之前的樣子。

#### Scenario: 在 Archived Groups 寫不進去

- **WHEN** 資料庫無法寫入時，在 Archived Groups 按「Restore Brisbane」
- **THEN** 跳出這個提示框；Archived Groups 仍列出 Brisbane，本機資料和還原之前一樣

#### Scenario: 在群組的畫面寫不進去

- **WHEN** 資料庫無法寫入時，在封存的 Brisbane 的畫面按「Restore Group」
- **THEN** 跳出這個提示框，畫面仍顯示唯讀的提示和「Restore Group」

#### Scenario: 寫到一半失敗

- **WHEN** 還原時的某一筆寫入失敗，在它之前的寫入都成功了，不論是哪一筆
- **THEN** 跳出這個提示框，本機資料和還原之前一樣

#### Scenario: 再試一次

- **WHEN** 失敗後資料庫恢復，再按一次「Restore Brisbane」
- **THEN** Brisbane 移出 Archived Groups，回到 Groups 根畫面

### Requirement: GROUPS-59.1 封存中和還原中不會再做一次

WHILE 群組在封存中，the mobile app SHALL 不再封存它一次，所以再按 Archive 或再用「Archive group」都不再儲存、不跳出提示框；WHILE 群組在還原中，SHALL 停用它的「Restore」和「Restore Group」；兩者都到存好或存不進去為止。

#### Scenario: 封存中再封存

- **WHEN** 封存 Brisbane 還沒存好時，再對它的卡片使用一次「Archive group」
- **THEN** 存好後 Brisbane 移出 Groups 根畫面，沒有跳出提示框

#### Scenario: 在 Archived Groups 還原中

- **WHEN** 按「Restore Brisbane」，還沒存好
- **THEN** 「Restore Brisbane」停用，再按也沒有反應；存好後 Brisbane 移出 Archived Groups，沒有跳出提示框

#### Scenario: 在群組的畫面還原中

- **WHEN** 在封存的 Brisbane 的畫面按「Restore Group」，還沒存好
- **THEN** 「Restore Group」停用；存好後唯讀的提示消失

#### Scenario: 存不進去之後

- **WHEN** 還原存不進去之後
- **THEN** 「Restore」和「Restore Group」都恢復可以按

### Requirement: GROUPS-60.1 重新啟動後保留封存和還原

WHEN app 重新啟動，the mobile app SHALL 保留每個群組有沒有封存。

#### Scenario: 封存後重新啟動

- **WHEN** 依序建立 Brisbane、Tokyo、Paris，封存 Tokyo 之後重新啟動 app
- **THEN** Groups 根畫面由上而下是 Brisbane 和 Paris；Archived Groups 只列出 Tokyo

#### Scenario: 還原後重新啟動

- **WHEN** 還原 Tokyo 之後重新啟動 app
- **THEN** Groups 根畫面由上而下是 Brisbane、Tokyo、Paris；Archived Groups 只顯示「No archived groups.」

### Requirement: GROUPS-61.2 群組的畫面列出群組的支出

WHILE 群組有不在垃圾桶裡的支出，the mobile app SHALL 在群組的畫面依 LEDGER-28.1 的順序列出這個群組每一筆不在垃圾桶裡的支出的卡片，包括和你無關的，不顯示「No expenses in this group yet.」；卡片和支出清單上群組支出的卡片一樣（LEDGER-33.2、LEDGER-65.3），但卡片金額是支出的全額。

#### Scenario: 兩筆支出

- **WHEN** Brisbane 依序新增 `2026-10-29` 的「Taxi」和 `2026-10-30` 的「Dinner」
- **THEN** Brisbane 的畫面由上而下是 Dinner 和 Taxi 的卡片，沒有「No expenses in this group yet.」

#### Scenario: 卡片

- **WHEN** Dinner 是 10001 USD、Food & Dining，依序分給 Blake、Taylor 和 Casey
- **THEN** 卡片依序顯示「Dinner」、「$100.01」、「Food & Dining」、「Brisbane」、「Oct 30, 2026」

#### Scenario: 和你無關的支出

- **WHEN** Taxi 是 Casey 付款，只有 Blake 分攤
- **THEN** Brisbane 的畫面有 Taxi 的卡片

#### Scenario: 其他群組的支出

- **WHEN** Tokyo 有一筆「Sushi」
- **THEN** Brisbane 的畫面沒有 Sushi 的卡片

#### Scenario: 封存的群組

- **WHEN** 封存 Brisbane 之後，從 Archived Groups 打開它的畫面
- **THEN** 唯讀的提示和「Restore Group」下面是 Dinner 和 Taxi 的卡片，卡片上是「Brisbane · Archived」

#### Scenario: 重新啟動

- **WHEN** 重新啟動 app 後打開 Brisbane 的畫面
- **THEN** 仍是 Dinner 和 Taxi 的卡片

#### Scenario: 垃圾桶裡的支出

- **WHEN** 把 Taxi 移到垃圾桶
- **THEN** Brisbane 的畫面只有 Dinner 的卡片

### Requirement: GROUPS-62.1 讀完支出之前不顯示沒有支出的樣子

WHILE 群組的畫面還沒讀完這個群組的支出，the mobile app SHALL 不顯示「No expenses in this group yet.」。

#### Scenario: 打開群組

- **WHEN** Brisbane 有 Dinner 時打開它的畫面，還沒讀完支出
- **THEN** 沒有「No expenses in this group yet.」；讀完之後顯示 Dinner 的卡片

### Requirement: GROUPS-63.1 點群組畫面上的卡片推入明細

WHEN 使用者點群組的畫面上的卡片，the mobile app SHALL 在群組的畫面所在的分頁推入這筆支出的明細（LEDGER-37.2、LEDGER-66.2），標題是「Expense」，網址在 Groups 分頁是 `/groups/expenses/<支出的 ID>`，在 Settings 分頁是 `/settings/archived-groups/expenses/<支出的 ID>`，分頁列仍選中同一個分頁；連點兩次也只推入一個明細，返回或按 Android 的返回鍵就回到群組的畫面。

#### Scenario: Groups 分頁

- **WHEN** 在 Brisbane 的畫面點 Dinner 的卡片
- **THEN** 分頁列仍選中 Groups，Groups 分頁的堆疊由下而上是「Groups」根畫面、「Brisbane」和「Expense」，網址是 `/groups/expenses/` 加上 Dinner 的 ID

#### Scenario: Settings 分頁

- **WHEN** 封存 Brisbane 之後，從 Archived Groups 打開它的畫面，點 Dinner 的卡片
- **THEN** 分頁列仍選中 Settings，Settings 分頁的堆疊由下而上是「Settings」根畫面、「Archived Groups」、「Brisbane」和「Expense」，網址是 `/settings/archived-groups/expenses/` 加上 Dinner 的 ID

#### Scenario: 返回

- **WHEN** 在明細返回，或在 Android 上按返回鍵
- **THEN** 回到 Brisbane 的畫面

#### Scenario: 連點兩次

- **WHEN** 連點兩次 Dinner 的卡片
- **THEN** 只推入一個明細；返回一次就回到 Brisbane 的畫面

### Requirement: GROUPS-64.1 群組的畫面的 + 按鈕

WHILE 群組的畫面顯示的是未封存的群組，the mobile app SHALL 在畫面底部放名稱是「Add expense」的 + 按鈕（SHELL-41.1），按一下就以 `/expenses/new?groupId=<群組 ID>` 打開 New Expense（LEDGER-52.1），表單關閉後回到群組的畫面；封存的群組和找不到的群組的畫面都沒有 + 按鈕。

#### Scenario: 打開 New Expense

- **WHEN** 在 Brisbane 的畫面按「Add expense」
- **THEN** 打開 New Expense，是「Group, Brisbane」

#### Scenario: 存好之後

- **WHEN** 選好付款人和分攤的人後按 Add
- **THEN** 表單關閉，分頁列仍選中 Groups，回到 Brisbane 的畫面，畫面上有這筆支出的卡片

#### Scenario: 封存的群組

- **WHEN** 封存 Brisbane 之後，從 Archived Groups 打開它的畫面，或以 `/groups/` 加上它的群組 ID 開啟 app
- **THEN** 畫面上沒有「Add expense」按鈕

#### Scenario: 還原之後

- **WHEN** 在 Settings 分頁上 Brisbane 的畫面按「Restore Group」
- **THEN** 出現「Add expense」按鈕；按了打開 New Expense，是「Group, Brisbane」

#### Scenario: 找不到的群組

- **WHEN** 以 `/groups/00000000-0000-4000-8000-000000000000` 開啟 app
- **THEN** 畫面上沒有「Add expense」按鈕

### Requirement: GROUPS-65.1 存好支出後群組的畫面是新的

WHEN 支出存好，the mobile app SHALL 讓群組的畫面再出現時就是存著的卡片，從明細返回或表單關閉時，不先出現存好之前的內容。

#### Scenario: 從明細修改

- **WHEN** 在 Brisbane 的畫面點 10001 USD 的 Dinner，在明細按「Edit」把金額改成「90.00」後按 Save，再從明細返回
- **THEN** Brisbane 的畫面一出現就是「$90.00」，沒有先出現「$100.01」

#### Scenario: 從 Expenses 分頁新增

- **WHEN** Groups 分頁上開著 Brisbane 的畫面時，從 Expenses 分頁的 New Expense 新增一筆 Brisbane 的「Taxi」，再選 Groups 分頁
- **THEN** Brisbane 的畫面有 Taxi 的卡片

### Requirement: GROUPS-66.1 移出成員時不改支出

WHEN 使用者把成員移出群組（GROUPS-26.1），the mobile app SHALL 不改這個群組的支出，他的付款和分攤的金額和成員 ID 都保留。

#### Scenario: 移出分攤的人

- **WHEN** Dinner 依序分給 Blake、Taylor 和 Casey，把 Blake 移出 Brisbane
- **THEN** 存著的 Dinner 的付款和分攤都和移出之前一樣

#### Scenario: 加回來

- **WHEN** 再把 Blake 加回 Brisbane（GROUPS-34.2）
- **THEN** Dinner 的分攤仍記在 Blake 原本的成員 ID 下，他又是 Brisbane 的成員

### Requirement: GROUPS-67.1 (manual) 群組畫面最後一張卡片不被 + 按鈕擋住

WHERE iPhone 或 Android 手機，WHEN 群組的畫面捲到最底，the mobile app SHALL 讓最後一張卡片整張露在 + 按鈕上方。

#### Scenario: 很多支出

- **WHEN** Brisbane 有 20 筆支出，把它的畫面捲到最底
- **THEN** 最後一張卡片整張在 + 按鈕上方，沒有被擋住

### Requirement: GROUPS-68.2 群組的畫面上的 Group Total

WHILE 群組有不在垃圾桶裡的支出，the mobile app SHALL 在群組的畫面上、支出的卡片上方，為這些支出用到的每個幣別各顯示一行「Group Total: <這個幣別的支出的全額總和>」，依幣別代碼排序；這幾行合起來是一個按鈕，右邊有「›」，螢幕閱讀器把它讀成一個按鈕，讀出這幾行但不讀「›」，再讀出無障礙提示「Opens Insights」，按一下就在群組的畫面所在的分頁推入這個群組的 Insights（INSIGHTS-14.1）：Groups 分頁是 `/groups/insights?groupId=<群組 ID>`，Settings 分頁是 `/settings/archived-groups/insights?groupId=<群組 ID>`，連按兩次也只推入一個；群組沒有不在垃圾桶裡的支出時，SHALL 不顯示 Group Total。

#### Scenario: 一個幣別

- **WHEN** 名字是「Taylor」，Brisbane 有 Taylor 付的 10001 USD 的 Dinner，以及 Casey 付、只有 Blake 分攤的 2500 USD 的 Taxi
- **THEN** Brisbane 的畫面在卡片上方只有「Group Total: $125.01」；它是一個按鈕，右邊有「›」，螢幕閱讀器讀出「Group Total: $125.01」和提示「Opens Insights」

#### Scenario: 幾個幣別

- **WHEN** Brisbane 還有一筆 3000 JPY 的 Sushi
- **THEN** 由上而下是「Group Total: ¥3,000」和「Group Total: $125.01」，兩行在同一個按鈕裡，按鈕右邊只有一個「›」

#### Scenario: 修改之後

- **WHEN** 在 Brisbane 的畫面打開 Dinner 的明細，按「Edit」把金額改成「90.00」後按 Save，再返回 Brisbane 的畫面
- **THEN** 是「Group Total: $115.00」

#### Scenario: 按一下

- **WHEN** 按「Group Total: $125.01」
- **THEN** 仍選中 Groups 分頁，Groups 分頁的堆疊由下而上是「Groups」、「Brisbane」和「Insights」，網址是 `/groups/insights`，加上 Brisbane 的群組 ID；Insights 的總額是「$125.01」

#### Scenario: 連按兩次

- **WHEN** 連按兩次「Group Total: $125.01」
- **THEN** 只推入一個 Insights

#### Scenario: 沒有支出

- **WHEN** 打開還沒有支出的 Brisbane 的畫面
- **THEN** 沒有「Group Total」

#### Scenario: 封存的群組

- **WHEN** 封存 Brisbane 之後，從 Archived Groups 打開它的畫面
- **THEN** 「Restore Group」下面是「Group Total: $125.01」，再下面是卡片；按「Group Total: $125.01」時，在 Settings 分頁推入 `/settings/archived-groups/insights`，加上 Brisbane 的群組 ID，堆疊由下而上是「Settings」、「Archived Groups」、「Brisbane」和「Insights」

### Requirement: GROUPS-69.1 群組的畫面上你的淨額

WHILE 群組有不在垃圾桶裡的支出，the mobile app SHALL 在群組的畫面上、Group Total 的下面、支出的卡片上方顯示你在這個群組的淨額：依幣別代碼排序，你的淨額不是 0 的每個幣別各一行，大於 0 時是「You're owed: <淨額>」，小於 0 時是「You owe: <淨額的絕對值>」；每個幣別的淨額都是 0 時，只有一行「Settled up」；這幾行合起來是一個按鈕，右邊有「›」，螢幕閱讀器把它讀成一個按鈕，讀出這幾行但不讀「›」，再讀出無障礙提示「Opens Balances」，按一下就打開 Balances（GROUPS-70.1）；群組沒有不在垃圾桶裡的支出時，SHALL 不顯示這幾行。

#### Scenario: 別人欠你

- **WHEN** 名字是「Taylor」，Brisbane 依序加入 Casey 和 Blake，有 Taylor 付的 60.00 USD 的 Dinner，分給 Taylor、Casey 和 Blake，以及 Casey 付、只有 Blake 分攤的 25.00 USD 的 Taxi
- **THEN** 「Group Total: $85.00」下面是「You're owed: $40.00」，再下面是卡片；它是一個按鈕，右邊有「›」，螢幕閱讀器讀出「You're owed: $40.00」和提示「Opens Balances」

#### Scenario: 你欠別人

- **WHEN** Brisbane 只有 Casey 付的 60.00 USD 的 Dinner，分給 Taylor、Casey 和 Blake
- **THEN** Group Total 下面是「You owe: $20.00」

#### Scenario: 打平

- **WHEN** Brisbane 只有 Taylor 付、只分給 Taylor 的 20.00 USD 的 Coffee，或只有和你無關的支出
- **THEN** Group Total 下面是「Settled up」

#### Scenario: 幾個幣別

- **WHEN** Brisbane 有 Casey 付的 3000 JPY 的 Sushi，分給 Taylor 和 Casey，以及 Taylor 付、分給 Taylor、Casey 和 Blake 的 60.00 USD 的 Dinner
- **THEN** 由上而下是「You owe: ¥1,500」和「You're owed: $40.00」，兩行在同一個按鈕裡，按鈕右邊只有一個「›」

#### Scenario: 有一個幣別打平

- **WHEN** Brisbane 有 Casey 付的 Sushi，以及 Taylor 付、只分給 Taylor 的 20.00 USD 的 Coffee
- **THEN** 只有「You owe: ¥1,500」，沒有「Settled up」

#### Scenario: 沒有支出

- **WHEN** 打開還沒有支出的 Brisbane 的畫面
- **THEN** 沒有「You're owed」、「You owe」和「Settled up」

#### Scenario: 按下

- **WHEN** 按「You're owed: $40.00」
- **THEN** 打開 Brisbane 的 Balances

### Requirement: GROUPS-70.1 開啟和關閉 Balances

WHEN 使用者按群組的畫面上你的淨額（GROUPS-69.1），the mobile app SHALL 開啟從畫面底部升起、蓋在群組的畫面上的 Balances，標題是「Balances」，標題列只有取消「Close」（SHELL-47.1、SHELL-48.1）；按 Close、把 Balances 往下滑或按 Android 的返回鍵，SHALL 關閉 Balances，回到群組的畫面。

#### Scenario: 開啟

- **WHEN** 在 Brisbane 的畫面按「You're owed: $40.00」
- **THEN** Balances 從底部升起，蓋在 Brisbane 的畫面上，標題是「Balances」，標題列只有「Close」；仍選中 Groups 分頁

#### Scenario: 按 Close

- **WHEN** 在 Balances 按「Close」
- **THEN** Balances 關閉，顯示 Brisbane 的畫面

#### Scenario: 往下滑或按返回鍵

- **WHEN** 在 iOS 上把 Balances 往下滑，或在 Android 上按返回鍵
- **THEN** Balances 關閉，顯示 Brisbane 的畫面

#### Scenario: 封存的群組

- **WHEN** 封存 Brisbane 之後，從 Archived Groups 打開它的畫面，按你的淨額
- **THEN** Balances 蓋在 Brisbane 的畫面上，分頁列仍選中 Settings

### Requirement: GROUPS-71.1 Balances 列出每個人的已付、份額和淨額

The mobile app SHALL 在 Balances 依幣別代碼排序，為群組不在垃圾桶裡的支出用到的每個幣別各放一個區塊，用到兩個以上幣別時每個區塊的標題是幣別代碼，只有一個幣別時沒有標題，區塊裡由上而下先依 GROUPS-24.2 的順序列出群組的每位成員，再依被移出的先後列出這個幣別不在垃圾桶裡的支出的付款或分攤裡的前成員；每個人一列，依序是他的名稱（你的成員是你的成員名稱加上「 (You)」，前成員是他存著的名稱）、淨額大於 0 時的「Is Owed <淨額>」、小於 0 時的「Owes <淨額的絕對值>」或等於 0 時的「Settled up」，以及「Paid <已付> · Share <份額>」，所以每個幣別所有人的淨額加總是 0。

#### Scenario: 一個人付了全部

- **WHEN** 名字是「Taylor」，Brisbane 依序加入 Casey 和 Blake；Taylor 付了 60.00 USD 的 Dinner，分給 Taylor、Casey 和 Blake，20.00 USD 的 Taxi，分給 Casey 和 Blake，以及 20.00 USD 的 Tickets，只分給 Blake
- **THEN** Balances 沒有標題，由上而下是「Taylor (You)」「Is Owed $80.00」「Paid $100.00 · Share $20.00」、「Casey」「Owes $30.00」「Paid $0.00 · Share $30.00」、「Blake」「Owes $50.00」「Paid $0.00 · Share $50.00」；淨額 +8000、−3000、−5000 加總是 0

#### Scenario: 幾個幣別

- **WHEN** 還有 Casey 付的 3000 JPY 的 Sushi，分給 Taylor 和 Casey
- **THEN** 有「JPY」和「USD」兩個區塊，「JPY」的區塊在上面，由上而下是「Taylor (You)」「Owes ¥1,500」「Paid ¥0 · Share ¥1,500」、「Casey」「Is Owed ¥1,500」「Paid ¥3,000 · Share ¥1,500」、「Blake」「Settled up」「Paid ¥0 · Share ¥0」

#### Scenario: 前成員

- **WHEN** 有這四筆支出時，把 Blake 移出 Brisbane
- **THEN** 「USD」的區塊仍有 Blake，排在 Casey 下面，是「Blake」「Owes $50.00」「Paid $0.00 · Share $50.00」；「JPY」的區塊沒有 Blake

#### Scenario: 依被移出的先後

- **WHEN** 只有那三筆 USD 的支出，依序把 Blake 和 Casey 移出 Brisbane
- **THEN** 由上而下是「Taylor (You)」、「Blake」和「Casey」那三列

#### Scenario: 後來加入的成員

- **WHEN** 只有那三筆 USD 的支出，加入 Riley
- **THEN** Riley 排在 Blake 下面，是「Riley」「Settled up」「Paid $0.00 · Share $0.00」；把他移出 Brisbane 之後，Balances 沒有 Riley

#### Scenario: 成員改了名

- **WHEN** 把 Casey 改名為「Cass」
- **THEN** 那一列是「Cass」

#### Scenario: 只在垃圾桶裡的支出出現的前成員

- **WHEN** Brisbane 有 Taylor 付、Taylor 和 Casey 分攤的 60.00 USD 的 Dinner，以及 Casey 付、只有 Blake 分攤的 25.00 USD 的 Taxi，把 Blake 移出 Brisbane，再把 Taxi 移到垃圾桶
- **THEN** Balances 沒有 Blake；按 Undo 提示的「Undo」之後又有 Blake

### Requirement: GROUPS-72.1 群組的卡片顯示成員人數

The mobile app SHALL 在群組的卡片上、群組名稱的下面顯示群組的成員人數，一位時是「1 member」，其他時候是「<人數> members」；前成員不算在內。

#### Scenario: 新建立的群組

- **WHEN** 建立「Brisbane」
- **THEN** Brisbane 的卡片在「Brisbane」下面是「1 member」

#### Scenario: 加入成員

- **WHEN** 在 Brisbane 依序加入 Casey 和 Blake，再回到 Groups 根畫面
- **THEN** 卡片上是「3 members」

#### Scenario: 移出和加回

- **WHEN** 把 Blake 移出 Brisbane
- **THEN** 卡片上是「2 members」；把他加回來之後是「3 members」

### Requirement: GROUPS-73.1 群組的卡片顯示你的份額和淨額

The mobile app SHALL 在群組的卡片上、成員人數的下面，依幣別代碼排序，為群組不在垃圾桶裡的支出用到的每個幣別依序顯示「Your share: <你的份額>」，以及你的淨額大於 0 時的「You're owed: <淨額>」、小於 0 時的「You owe: <淨額的絕對值>」或等於 0 時的「Settled up」；群組沒有不在垃圾桶裡的支出時，SHALL 在成員人數的下面只顯示「No spending yet」；卡片的名稱仍是「Open <群組名稱>」（GROUPS-2.2），螢幕閱讀器讀完名稱，接著依序讀出它下面的每一行。

#### Scenario: 幾個幣別

- **WHEN** 名字是「Taylor」，Brisbane 依序加入 Casey 和 Blake，有 Taylor 付的 120.00 AUD 的 Groceries，分給 Taylor 和 Casey，以及 Casey 付的 60.00 USD 的 Tickets，分給 Taylor、Casey 和 Blake
- **THEN** Brisbane 的卡片由上而下是「Brisbane」、「3 members」、「Your share: A$60.00」、「You're owed: A$60.00」、「Your share: $20.00」、「You owe: $20.00」

#### Scenario: 打平

- **WHEN** Brisbane 只有 Taylor 付的 20.00 USD 的 Coffee，只分給 Taylor
- **THEN** 卡片上是「Your share: $20.00」和「Settled up」

#### Scenario: 和你無關的支出

- **WHEN** Brisbane 只有 Casey 付的 25.00 USD 的 Taxi，只分給 Blake
- **THEN** 卡片上是「Your share: $0.00」和「Settled up」

#### Scenario: 還沒有支出

- **WHEN** Brisbane 還沒有支出
- **THEN** 卡片由上而下是「Brisbane」、「1 member」和「No spending yet」

#### Scenario: 螢幕閱讀器

- **WHEN** 螢幕閱讀器讀「幾個幣別」的 Brisbane 的卡片
- **THEN** 讀出名稱「Open Brisbane」，接著依序是「3 members」、「Your share: A$60.00」、「You're owed: A$60.00」、「Your share: $20.00」、「You owe: $20.00」

#### Scenario: 從 Expenses 分頁新增之後

- **WHEN** 在 Expenses 分頁新增一筆 Brisbane 的支出，再選 Groups 分頁
- **THEN** Brisbane 的卡片已經算進這筆支出

### Requirement: GROUPS-74.1 讀完支出之前不顯示 No spending yet

WHILE Groups 根畫面還沒讀完存著的支出，the mobile app SHALL 不在群組的卡片上顯示「No spending yet」。

#### Scenario: 開啟 app

- **WHEN** Brisbane 有 Dinner 時打開 Groups 分頁，Groups 根畫面還沒讀完存著的支出
- **THEN** Brisbane 的卡片上沒有「No spending yet」；讀完之後顯示你的份額

### Requirement: GROUPS-75.1 群組的金額不算垃圾桶裡的支出

The mobile app SHALL 讓群組的金額只算這個群組不在垃圾桶裡的支出：群組的支出移到垃圾桶或從垃圾桶還原並存好之後，群組的畫面、Balances 和群組的卡片再出現時，都是照新的狀態算的金額。

#### Scenario: 移到垃圾桶

- **WHEN** 名字是「Taylor」，Brisbane 依序加入 Casey 和 Blake，有 Taylor 付的 60.00 USD 的 Dinner 和 Casey 付的 30.00 USD 的 Taxi，都分給 Taylor、Casey 和 Blake，然後把 Dinner 移到垃圾桶
- **THEN** Brisbane 的畫面是「Group Total: $30.00」和「You owe: $10.00」；Balances 是「Taylor (You)」「Owes $10.00」「Paid $0.00 · Share $10.00」、「Casey」「Is Owed $20.00」「Paid $30.00 · Share $10.00」、「Blake」「Owes $10.00」「Paid $0.00 · Share $10.00」；卡片上是「Your share: $10.00」和「You owe: $10.00」

#### Scenario: 還原

- **WHEN** 按 Undo 提示的「Undo」，或在 Trash 還原 Dinner
- **THEN** 又是「Group Total: $90.00」和「You're owed: $30.00」，卡片上是「Your share: $30.00」和「You're owed: $30.00」

#### Scenario: 都在垃圾桶裡

- **WHEN** 把 Dinner 和 Taxi 都移到垃圾桶
- **THEN** Brisbane 的畫面沒有 Group Total 和你的淨額，顯示「No expenses in this group yet.」；卡片上是「No spending yet」
