# Groups

## Purpose

群組：Groups 分頁根畫面上的群組列表、建立群組的 New Group、每個群組的畫面，以及從群組的畫面打開的 Members、Rename Member 和 Rename Group，群組的封存和還原、Settings 分頁上列出封存群組的 Archived Groups，還有存在本機資料裡的群組和成員（ADR-0006）。每個群組有一個群組 ID、一個名稱和成員；每位成員有一個成員 ID 和一個名稱，你在群組裡的成員另外有使用者 ID，從 Members 加入的成員沒有使用者 ID。你是這支手機的本機身分：你的使用者 ID、個人空間 ID、個人 participant ID 和名字都在本機身分裡（shell）。存過名字是指名字不是空字串。你在群組裡的成員，是使用者 ID 等於你的使用者 ID 的那位成員；群組裡其他的成員是別人。前成員是被移出群組、還沒加回來的人；群組的成員只算現在的成員，不算前成員。共同帳本是在這支手機上已經變成共同帳本的群組（sync）。兩個成員名稱去掉頭尾空白並轉成小寫（JavaScript 的 `toLowerCase()`，不依裝置的語言設定）後相同，就是同名。New Group 是建立群組的表單。建立中是指 New Group 開始把群組寫入本機資料之後，存好或存不進去之前。Rename Member 和 Rename Group 是名稱表單；Members 的名稱欄位是在 Members 按「Add Member」後出現、用來加入成員的欄位（GROUPS-29.2）；Members 的成員清單是成員那幾列，加上最後的「Add Member」或名稱欄位，和清單下面關於人數上限的那句話（GROUPS-105.1）；「Invite with Link」在成員清單的上面，自成一區，不是清單的一列（GROUPS-106.1），它打開的 Invite 見 sharing；手機上的申請是這支手機用邀請連結申請加入別人的群組的申請，六種狀態的都算（sharing），申請的卡片是 Groups 根畫面上替它顯示的卡片（GROUPS-108.2）；收到的申請是別的手機申請加入這支手機上的共同帳本、這支手機讀得懂的申請（sharing 的 SHARING-190.1、SHARING-191.1），它們顯示在群組的畫面上的按鈕（GROUPS-130.1）和 Members 的申請那一區（GROUPS-131.1），點了跳出申請的選單（GROUPS-132.1）；有手機的成員是共同帳本裡存著使用者 ID 的成員（sync 的 SYNC-251.2），也就是你在裡面的成員，和名冊裡有別支手機的紀錄代表的成員；儲存中是指名稱表單或 Members 的名稱欄位開始寫入本機資料之後，存好或存不進去之前，所以名稱空白、和成員同名，或還在問要不要加回前成員時，都不是儲存中；移除中是指選了 Remove from Group 之後，存好或存不進去之前；移除別支手機代表的成員時，是按了確認框的「Remove」之後，到移除有結果為止（GROUPS-151.1），退出中是按了確認框的「Leave」之後，到退出有結果為止。別支手機代表的成員，是共同帳本的名冊裡有別支手機的紀錄代表的成員，不看那筆紀錄的使用者 ID（sync 的 SYNC-251.2）。唯讀副本是在這支手機上不再同步、只能看的共同帳本（sync 的 SYNC-300.1 到 SYNC-302.1）：這支手機被移除、退出了，或授權失效。這份 spec 說未封存的群組和共同帳本能做的事——改名、加入和移出成員、邀請、同意申請、新增支出——唯讀副本都不能做，它的畫面照封存的群組顯示（GROUPS-155.1、GROUPS-156.1）；它的卡片仍留在原本的地方（GROUPS-153.1）。使用者可以把它從這支手機刪掉（GROUPS-157.1 到 GROUPS-159.1）；別的群組 app 都不刪除。封存的群組是本機資料裡標成封存的群組，它的群組 ID、名稱和成員都留著；其他的群組是未封存的群組；還原是拿掉封存的標記。封存中是指開始把封存寫入本機資料之後，存好或存不進去之前；還原中也一樣。群組的卡片是 Groups 根畫面上的卡片，封存群組的卡片是 Archived Groups 上的卡片。群組的畫面在 Groups 分頁上，從封存群組的卡片打開時在 Settings 分頁上；從群組的畫面打開的 Members 和名稱表單都和它在同一個分頁。群組的畫面也列出這個群組不在垃圾桶裡、日期在群組的畫面的期間裡、通過這個畫面的篩選的支出（GROUPS-61.6），支出的卡片、明細、垃圾桶、期間、期間列、篩選和膠囊列見 ledger。Balances 是從群組的畫面打開、列出群組裡每個人的已付、份額和淨額的畫面，和群組的畫面在同一個分頁。一個人在群組裡某個幣別的已付，是這個群組不在垃圾桶裡、這個幣別的支出的付款裡記在他的成員 ID 下的金額總和；份額是這些支出的分攤裡記在他的成員 ID 下的金額總和；淨額是已付減份額。你的已付、份額和淨額是你在群組裡的成員的。群組的金額是群組的畫面上清單上方的總額（GROUPS-68.6）和你的淨額、Balances，以及群組的卡片上的份額和淨額；它們都依幣別分開，不把不同幣別的金額相加或換算。

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

The mobile app SHALL 讓 New Group 的標題是「New Group」，標題列有取消「Cancel」和確認「Create」（SHELL-47.2、SHELL-48.2），內容由上而下是區塊標題「GROUP DETAILS」、區塊裡唯一的一列「Name」和它的名稱欄位，以及說明「Members can be added after the group is created.」；名稱欄位的無障礙名稱是「Group name」，開啟時是空的、顯示「Group name」，並取得焦點。

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

WHEN 使用者點群組的卡片，the mobile app SHALL 在 Groups 分頁推入這個群組的畫面，大標題是群組名稱（GROUPS-100.1），分頁列仍選中 Groups。

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

### Requirement: GROUPS-17.2 群組名稱不限長度，也可以重複

The mobile app SHALL 讓群組名稱不限長度，也可以和其他群組的名稱相同；共同帳本的名稱寫成的事件太大時不儲存（SYNC-27.1）。

#### Scenario: 很長的名稱

- **WHEN** 一個一個輸入 300 個「a」，按 Create
- **THEN** 存下的名稱是 300 個「a」

#### Scenario: 同名的群組

- **WHEN** 建立「Trip」之後再建立一個「Trip」
- **THEN** Groups 根畫面有兩張「Trip」的卡片

### Requirement: GROUPS-18.2 卡片上的群組名稱只佔一行

The mobile app SHALL 在群組的卡片上只用一行顯示群組名稱，放不下時尾端漸層消失（SHELL-68.1）；卡片的無障礙名稱仍是完整的「Open <群組名稱>」。

#### Scenario: 很長的名稱

- **WHEN** 建立名稱是 300 個「a」的群組
- **THEN** 卡片上的名稱只佔一行，放不下的部分不顯示，也沒有「…」；卡片的無障礙名稱是「Open 」加上完整的 300 個「a」

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

### Requirement: GROUPS-22.3 群組的畫面的 Group actions 選單

The mobile app SHALL 在群組的畫面的標題列放一個名稱是「Group actions」的選單（SHELL-47.2、SHELL-48.2）：未封存的群組依序是「Members」、「Rename Group」和「Categories」，封存的群組依序是「Members」和「Categories」。

#### Scenario: iOS

- **WHEN** iOS 上開啟 Brisbane 的畫面
- **THEN** 標題列右邊是圖示 `ellipsis.circle`、名稱「Group actions」的選單，依序列出「Members」、「Rename Group」和「Categories」

#### Scenario: Android

- **WHEN** Android 上在 Brisbane 的畫面按「Group actions」
- **THEN** 跳出標題「Group actions」的對話框，按鈕是「Members」、「Rename Group」和「Categories」，沒有「Cancel」

#### Scenario: 封存的群組

- **WHEN** 封存 Brisbane 之後，在 iOS 上開啟它的畫面，或在 Android 上按它的「Group actions」
- **THEN** iOS 的選單依序列出「Members」和「Categories」；Android 的對話框按鈕是「Members」、「Categories」和「Cancel」

### Requirement: GROUPS-23.2 開啟和關閉 Members

WHEN 使用者在 Group actions 選「Members」，the mobile app SHALL 開啟從畫面底部升起、蓋在群組的畫面上的 Members，標題是「Members」，標題列只有取消「Close」（SHELL-47.2、SHELL-48.2）；沒有在移除中，Members 的名稱欄位也沒有在儲存中時，按 Close、把 Members 往下滑或按 Android 的返回鍵，SHALL 關閉 Members，回到群組的畫面。

#### Scenario: 開啟

- **WHEN** 在 Brisbane 的畫面選 Group actions 的「Members」
- **THEN** Members 從底部升起，蓋在 Brisbane 的畫面上，標題是「Members」，標題列只有「Close」；仍選中 Groups 分頁

#### Scenario: 按 Close

- **WHEN** 在 Members 按「Close」
- **THEN** Members 關閉，顯示 Brisbane 的畫面

#### Scenario: 往下滑或按返回鍵

- **WHEN** 在 iOS 上把 Members 往下滑，或在 Android 上按返回鍵
- **THEN** Members 關閉，顯示 Brisbane 的畫面

### Requirement: GROUPS-24.4 未封存群組的 Members 列出成員

The mobile app SHALL 在未封存群組的 Members 依加入的先後，由上而下列出群組的每位成員，被移出後再加回來的排在最後；每位成員那一列都是角色為 button 的按鈕，右邊有「›」：你那一列是你的成員名稱加上「 (You)」，無障礙名稱也是這樣；別人那一列是他的名稱，無障礙名稱是他的名稱；共同帳本裡有手機的別人，那一列另外顯示「Joined」，無障礙名稱是他的名稱、逗號、空格和「Joined」，例如「Casey, Joined」，所以每位成員都看得出誰已經用自己的手機加入；最後一列是角色為 button、名稱為「Add Member」的按鈕，共同帳本有 20 位以上的成員時沒有這一列（GROUPS-105.1）。

#### Scenario: 只有你

- **WHEN** 名字是「Taylor」，建立「Brisbane」後開啟它的 Members
- **THEN** 由上而下是「Taylor (You)」和「Add Member」；「Taylor (You)」那一列右邊有「›」，是名稱為「Taylor (You)」的按鈕

#### Scenario: 三位成員

- **WHEN** 在 Brisbane 依序加入「Casey」和「Blake」
- **THEN** 由上而下是「Taylor (You)」、「Casey」、「Blake」和「Add Member」；Casey 和 Blake 那兩列右邊有「›」，是名稱分別為「Casey」和「Blake」的按鈕

#### Scenario: 有手機的成員

- **WHEN** Brisbane 是共同帳本，名冊裡有別支手機代表 Casey 的紀錄（sync 的 SYNC-251.2），開啟它的 Members
- **THEN** Casey 那一列顯示「Casey」和「Joined」，是名稱為「Casey, Joined」的按鈕；Blake 那一列沒有「Joined」；你那一列仍是「Taylor (You)」，沒有「Joined」

### Requirement: GROUPS-25.4 在未封存群組的 Members 點成員那一列跳出他的選單

WHEN 使用者在未封存群組的 Members 點成員那一列，the mobile app SHALL 跳出標題是這位成員的名稱的選單：別人的選單內容是「If removed, their historical payments and shares will be retained.」，依序是「Rename」、「Remove from Group」和「Cancel」，別支手機代表的成員也是這個選單；你的選單沒有內容，依序是「Rename」和「Cancel」，群組是共同帳本時依序是「Rename」、「Leave Group」和「Cancel」。iOS 上選單是動作表（action sheet），「Remove from Group」和「Leave Group」是破壞性的樣式；Android 上選單是對話框。按 Cancel 時關閉選單，什麼都不改；Android 上按返回鍵或點對話框外面也一樣。

#### Scenario: iOS

- **WHEN** iOS 上在 Members 點「Blake」
- **THEN** 跳出標題「Blake」、內容是這句話的動作表，依序是「Rename」、破壞性的「Remove from Group」和「Cancel」

#### Scenario: Android

- **WHEN** Android 上在 Members 點「Blake」
- **THEN** 跳出標題「Blake」、內容是這句話的對話框，依序是「Rename」、「Remove from Group」和「Cancel」

#### Scenario: 你的選單

- **WHEN** 名字是「Taylor」，Brisbane 還不是共同帳本，在 Members 點「Taylor (You)」
- **THEN** 跳出標題「Taylor」、沒有內容的選單，依序是「Rename」和「Cancel」

#### Scenario: 共同帳本裡你的選單

- **WHEN** Brisbane 是共同帳本，在 Members 點「Taylor (You)」
- **THEN** iOS 上跳出標題「Taylor」、沒有內容的動作表，依序是「Rename」、破壞性的「Leave Group」和「Cancel」；Android 上是按鈕「Rename」、「Leave Group」和「Cancel」的對話框

#### Scenario: 有手機的成員的選單

- **WHEN** Brisbane 是共同帳本，名冊裡有別支手機代表 Casey 的紀錄，在 Members 點 Casey 那一列
- **THEN** 跳出標題「Casey」、內容是「If removed, their historical payments and shares will be retained.」的選單，依序是「Rename」、「Remove from Group」和「Cancel」

#### Scenario: 按 Cancel

- **WHEN** 在 Blake 的選單按「Cancel」
- **THEN** 選單關閉，Members 仍列出 Blake，Brisbane 的成員沒有改變

#### Scenario: Android 上直接關掉

- **WHEN** Android 上 Blake 的對話框開著時按返回鍵，或點對話框外面
- **THEN** 對話框關閉，Members 仍列出 Blake，Brisbane 的成員沒有改變

### Requirement: GROUPS-26.2 選 Remove from Group 時移出群組

WHEN 使用者在沒有別支手機代表的別人的選單選「Remove from Group」，the mobile app SHALL 不再另外確認，直接把他移出群組，存好後 Members 不再列出他，離線也一樣；別支手機代表的成員照 GROUPS-150.1 先確認，再連上線移除。

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

WHEN 使用者在未封存群組的 Members 按「Add Member」，the mobile app SHALL 不開新的畫面，把「Add Member」那一列換成名稱欄位，讓它取得焦點並打開鍵盤：名稱欄位的無障礙名稱是「Member name」，開啟時是空的、顯示「Enter member name」；名稱欄位失去焦點時，例如收起鍵盤或點了成員那一列，名稱欄位和裡面的名稱都留著，名稱欄位開著時點成員那一列，第一下就跳出他的選單（GROUPS-25.4）；Members 關閉時，名稱欄位裡還沒加入的名稱不會存下。

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

### Requirement: GROUPS-31.3 按 Return 時加入新的成員

WHEN 使用者在 Members 的名稱欄位按 Return，而名稱去掉頭尾空白後不是空的，也和群組的成員、這個群組的前成員都不同名，the mobile app SHALL 以去掉頭尾空白的名稱把一位新的成員加入群組，存好後把他列在成員的最後，名稱欄位清空並保有焦點，仍在最下面，可以接著加下一位；名稱的長度沒有上限，還不是共同帳本的群組，成員的人數也沒有上限。共同帳本的人數見 GROUPS-105.1，名稱寫成的事件太大時見 SYNC-27.1。

#### Scenario: 去掉頭尾空白

- **WHEN** 在 Brisbane 的名稱欄位輸入「 Blake 」，按 Return
- **THEN** Members 由上而下是「Taylor (You)」、「Blake」和空的名稱欄位，名稱欄位仍有焦點；存下的名稱是「Blake」

#### Scenario: 接著加下一位

- **WHEN** 再輸入「Casey」，按 Return
- **THEN** 依序是「Taylor (You)」、「Blake」、「Casey」和空的名稱欄位

#### Scenario: 很多成員

- **WHEN** 在還不是共同帳本的 Brisbane 一位一位加入 30 位成員
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

### Requirement: GROUPS-34.4 和前成員同名時問要不要加回來

IF 使用者在 Members 的名稱欄位按 Return 時，名稱不和群組的任何成員同名，但和這個群組的前成員同名，THEN the mobile app SHALL 先不儲存，跳出標題「Add <前成員的名稱> Back?」、內容「<前成員的名稱> was in this group before. Adding them back reconnects their past payments and shares.」的提示框，選項是「Cancel」和「Add Back」，同名的前成員不只一位時問的是最近被移出的那一位：按 Add Back 時讓他回到群組，沿用他原本的成員 ID 和名稱，存好後把他列在成員的最後，名稱欄位清空並保有焦點，他是共同帳本的第 20 位成員時名稱欄位就收起（GROUPS-105.1）；按 Cancel 時名稱欄位保留輸入，Android 上按返回鍵或點提示框外面也一樣。

#### Scenario: 加回來

- **WHEN** Brisbane 有 Taylor、Blake 和 Casey，移除 Blake 之後，在名稱欄位輸入「blake」，按 Return，再按「Add Back」
- **THEN** 先跳出標題「Add Blake Back?」、內容「Blake was in this group before. Adding them back reconnects their past payments and shares.」的提示框；按 Add Back 後 Members 由上而下是「Taylor (You)」、「Casey」、「Blake」和空的名稱欄位；Blake 的成員 ID 和移除之前一樣，名稱是「Blake」

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

WHEN 使用者在成員的選單選「Rename」，the mobile app SHALL 開啟從畫面底部升起、蓋在 Members 上的 Rename Member，標題是「Rename Member」，標題列有取消「Cancel」和確認「Save」（SHELL-47.2、SHELL-48.2），內容只有名稱欄位：名稱欄位的無障礙名稱是「Member name」，開啟時是這位成員現在的名稱，並取得焦點，清空時顯示「Enter member name」。

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

### Requirement: GROUPS-40.3 長按標題或在 Group actions 選 Rename Group 時開啟 Rename Group

WHEN 使用者在未封存群組的畫面長按大標題（GROUPS-100.1），或在 Group actions 選「Rename Group」，the mobile app SHALL 開啟從畫面底部升起、蓋在群組的畫面上的 Rename Group，標題是「Rename Group」，標題列有取消「Cancel」和確認「Save」（SHELL-47.2、SHELL-48.2），內容由上而下是區塊標題「GROUP DETAILS」、區塊裡唯一的一列「Name」和它的名稱欄位；名稱欄位的無障礙名稱是「Group name」，開啟時是群組現在的名稱，並取得焦點，清空時顯示「Group name」；封存的群組長按大標題沒有作用。

#### Scenario: 長按標題

- **WHEN** 在 Brisbane 的畫面長按大標題「Brisbane」
- **THEN** Rename Group 從底部升起，蓋在 Brisbane 的畫面上，名稱欄位是「Brisbane」，已經取得焦點

#### Scenario: 從 Group actions 開啟

- **WHEN** 在 Brisbane 的畫面選 Group actions 的「Rename Group」
- **THEN** Rename Group 從底部升起，蓋在 Brisbane 的畫面上，標題是「Rename Group」，標題列的取消是「Cancel」、確認是「Save」；由上而下是「GROUP DETAILS」、「Name」和名稱欄位，名稱欄位是「Brisbane」，已經取得焦點

#### Scenario: 封存的群組

- **WHEN** 封存 Brisbane 之後打開它的畫面，長按大標題
- **THEN** 沒有打開 Rename Group

#### Scenario: 清空名稱

- **WHEN** 在 Brisbane 的 Rename Group 清空名稱
- **THEN** 名稱欄位顯示「Group name」

### Requirement: GROUPS-41.1 按 Save 或 Return 時存下群組的新名稱

WHEN 使用者在 Rename Group 按 Save 或在名稱欄位按 Return，而 Save 沒有停用，the mobile app SHALL 把群組的名稱改成去掉頭尾空白的名稱，群組 ID、成員和群組在 Groups 根畫面的位置都不變，存好後關閉 Rename Group，回到群組的畫面，畫面的大標題和 Groups 根畫面上這個群組的卡片都改用新的名稱。

#### Scenario: 改名

- **WHEN** 有 Trip 和 Paris，在 Trip 的 Rename Group 輸入「 Tokyo 2026 」，按 Save
- **THEN** Rename Group 關閉，群組的畫面的大標題是「Tokyo 2026」；返回 Groups 根畫面，由上而下是「Open Tokyo 2026」和「Open Paris」；群組 ID 和成員都沒有改變，存下的名稱是「Tokyo 2026」

#### Scenario: 按 Return

- **WHEN** 在 Rename Group 輸入「Kyoto」，在名稱欄位按 Return
- **THEN** Rename Group 關閉，群組的畫面的大標題是「Kyoto」

#### Scenario: 重新啟動

- **WHEN** 把 Trip 改名為「Tokyo 2026」之後重新啟動 app
- **THEN** Groups 根畫面有「Open Tokyo 2026」，沒有 Trip

#### Scenario: 儲存中切到別的分頁

- **WHEN** Android 上在 Trip 的 Rename Group 輸入「Tokyo」按 Save，還沒存好時點 Settings 分頁
- **THEN** 存好後回到 Groups 分頁，Rename Group 已經關閉，群組的畫面的大標題是「Tokyo」

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
- **THEN** Rename Group 關閉，群組的畫面的大標題仍是「Trip」

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

### Requirement: GROUPS-53.2 封存群組的卡片

The mobile app SHALL 讓封存群組的卡片由上而下顯示群組名稱和「Archived group」，名稱只佔一行、放不下時尾端漸層消失（SHELL-68.1）；卡片是角色為 button、無障礙名稱為完整的「Open <群組名稱>」的按鈕，卡片之外另有一個顯示「Restore」、無障礙名稱為「Restore <群組名稱>」的按鈕。

#### Scenario: 封存的 Brisbane

- **WHEN** 封存 Brisbane 之後打開 Archived Groups
- **THEN** 卡片由上而下是「Brisbane」和「Archived group」，是名稱為「Open Brisbane」的按鈕；卡片之外有顯示「Restore」、名稱為「Restore Brisbane」的按鈕

#### Scenario: 很長的名稱

- **WHEN** 封存名稱是 300 個「a」的群組
- **THEN** 卡片上的名稱只佔一行，放不下的部分不顯示，也沒有「…」；卡片的無障礙名稱是「Open 」加上完整的 300 個「a」，Restore 按鈕的是「Restore 」加上完整的 300 個「a」

### Requirement: GROUPS-54.1 點封存群組的卡片在 Settings 分頁推入群組的畫面

WHEN 使用者點封存群組的卡片，the mobile app SHALL 在 Settings 分頁推入這個群組的畫面，網址是 `/settings/archived-groups/<群組 ID>`，大標題是群組名稱（GROUPS-100.1），分頁列仍選中 Settings；從這個畫面返回時回到 Archived Groups，從它打開的 Members 和名稱表單也都蓋在它上面，留在 Settings 分頁。

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

### Requirement: GROUPS-55.2 封存群組的畫面顯示唯讀的提示和 Restore Group

WHILE 群組已封存，the mobile app SHALL 在它的畫面的大標題下面顯示「Archived group. Expenses and allocations are read-only.」，下面是角色為 button、名稱為「Restore Group」的按鈕。

#### Scenario: 從 Archived Groups 打開

- **WHEN** 封存 Brisbane 之後，從 Archived Groups 打開它的畫面
- **THEN** 由上而下是大標題「Brisbane」、「Archived group. Expenses and allocations are read-only.」、「Restore Group」按鈕和「No expenses in this group yet.」

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
- **THEN** 成員列又是按鈕，最後一列是「Add Member」（GROUPS-24.4）

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

### Requirement: GROUPS-61.6 群組的畫面列出群組在期間裡通過篩選的支出

WHILE 群組有不在垃圾桶裡的支出，the mobile app SHALL 在群組的畫面依這個畫面的排序（LEDGER-121.1）列出這個群組每一筆不在垃圾桶裡、日期在群組的畫面的期間裡（LEDGER-107.2）、通過這個畫面的篩選（LEDGER-129.1）的支出的卡片，包括和你無關的，不顯示「No expenses in this group yet.」；還沒選過排序時是 LEDGER-28.1 的順序，搜尋中列出的是這個群組符合搜尋、通過篩選的支出，不管日期（LEDGER-125.2）；修改之後沒有通過篩選的支出，卡片離開群組的畫面，篩選不變，篩選裡選著的一項因此沒有支出用到時也不變（LEDGER-141.1）；卡片和支出清單上群組支出的卡片一樣（LEDGER-33.3、LEDGER-65.4），但卡片金額是支出的全額，分類那一行的右邊不是群組名稱，而是「Paid by <付款人的名稱>」，付款人是你時是「Paid by You」，付款人是前成員時用他存著的名稱，放不下時尾端漸層消失（SHELL-68.1），螢幕閱讀器在分類和日期之間讀出它。

#### Scenario: 兩筆支出

- **WHEN** Brisbane 依序新增 `2026-10-29` 的「Taxi」和 `2026-10-30` 的「Dinner」
- **THEN** Brisbane 的畫面由上而下是 Dinner 和 Taxi 的卡片，沒有「No expenses in this group yet.」

#### Scenario: 卡片

- **WHEN** Dinner 是 10001 USD、Food & Dining，Casey 付款，依序分給 Blake、Taylor 和 Casey
- **THEN** 卡片依序顯示「Dinner」、「$100.01」、「Food & Dining」、「Paid by Casey」；螢幕閱讀器讀出這四項和「Oct 30, 2026」

#### Scenario: 你付款

- **WHEN** 名字是「Taylor」，Taylor 付了 Dinner
- **THEN** 卡片上是「Paid by You」

#### Scenario: 前成員付款

- **WHEN** 把付了 Dinner 的 Casey 移出 Brisbane（GROUPS-34.4）
- **THEN** 卡片上仍是「Paid by Casey」

#### Scenario: 和你無關的支出

- **WHEN** Taxi 是 Casey 付款，只有 Blake 分攤
- **THEN** Brisbane 的畫面有 Taxi 的卡片

#### Scenario: 其他群組的支出

- **WHEN** Tokyo 有一筆「Sushi」
- **THEN** Brisbane 的畫面沒有 Sushi 的卡片

#### Scenario: 封存的群組

- **WHEN** 封存 Brisbane 之後，從 Archived Groups 打開它的畫面
- **THEN** 唯讀的提示和「Restore Group」下面是 Dinner 和 Taxi 的卡片，卡片上是「Paid by <付款人的名稱>」

#### Scenario: 重新啟動

- **WHEN** 重新啟動 app 後打開 Brisbane 的畫面
- **THEN** 仍是 Dinner 和 Taxi 的卡片

#### Scenario: 垃圾桶裡的支出

- **WHEN** 把 Taxi 移到垃圾桶
- **THEN** Brisbane 的畫面只有 Dinner 的卡片

#### Scenario: 期間

- **WHEN** 今天是 `2026-10-30`，Brisbane 有 `2026-10-29` 的「Taxi」和 `2026-09-30` 的「Dinner」，打開 Brisbane 的畫面，再把期間換成這個月
- **THEN** 打開時由上而下是 Taxi 和 Dinner 的卡片；換成這個月之後只有 Taxi 的卡片，沒有「No expenses in this group yet.」

#### Scenario: 換了排序

- **WHEN** 把 Brisbane 的畫面的排序換成 Oldest First
- **THEN** 由上而下是 Dinner 和 Taxi 的卡片

#### Scenario: 搜尋中

- **WHEN** 期間是這個月時，在 Brisbane 的畫面搜尋「dinner」
- **THEN** 只有 Dinner 的卡片，卡片上仍是「Paid by <付款人的名稱>」

#### Scenario: 有篩選

- **WHEN** Brisbane 有 Taylor 付的「Dinner」和 Casey 付的「Taxi」，在 Filters 的 Paid by 選「Casey」
- **THEN** Brisbane 的畫面只有 Taxi 的卡片，沒有「No expenses in this group yet.」

#### Scenario: 修改之後沒有通過篩選

- **WHEN** Casey 還付了「Hotel」，篩選是 Paid by 的 Casey 時，在 Edit Expense 把 Taxi 的付款人改成 Taylor 後按 Save
- **THEN** Brisbane 的畫面只有 Hotel 的卡片，膠囊列的 Paid by 仍是「Paid by Casey」

#### Scenario: 修改之後沒有支出用到選著的付款人

- **WHEN** Brisbane 有 Taylor 付的「Dinner」，Casey 只付了「Taxi」，篩選是 Paid by 的 Casey 時，在 Edit Expense 把 Taxi 的付款人改成 Taylor 後按 Save
- **THEN** Brisbane 的畫面的膠囊列仍是「Paid by Casey」，沒有卡片，顯示「No Matching Expenses」；清除篩選之後 Dinner 和 Taxi 的卡片都在

### Requirement: GROUPS-62.1 讀完支出之前不顯示沒有支出的樣子

WHILE 群組的畫面還沒讀完這個群組的支出，the mobile app SHALL 不顯示「No expenses in this group yet.」。

#### Scenario: 打開群組

- **WHEN** Brisbane 有 Dinner 時打開它的畫面，還沒讀完支出
- **THEN** 沒有「No expenses in this group yet.」；讀完之後顯示 Dinner 的卡片

### Requirement: GROUPS-63.1 點群組畫面上的卡片推入明細

WHEN 使用者點群組的畫面上的卡片，the mobile app SHALL 在群組的畫面所在的分頁推入這筆支出的明細（LEDGER-37.3、LEDGER-66.3），標題是「Expense」，網址在 Groups 分頁是 `/groups/expenses/<支出的 ID>`，在 Settings 分頁是 `/settings/archived-groups/expenses/<支出的 ID>`，分頁列仍選中同一個分頁；連點兩次也只推入一個明細，返回或按 Android 的返回鍵就回到群組的畫面。

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

WHEN 使用者把成員移出群組（GROUPS-26.2），the mobile app SHALL 不改這個群組的支出，他的付款和分攤的金額和成員 ID 都保留。

#### Scenario: 移出分攤的人

- **WHEN** Dinner 依序分給 Blake、Taylor 和 Casey，把 Blake 移出 Brisbane
- **THEN** 存著的 Dinner 的付款和分攤都和移出之前一樣

#### Scenario: 加回來

- **WHEN** 再把 Blake 加回 Brisbane（GROUPS-34.4）
- **THEN** Dinner 的分攤仍記在 Blake 原本的成員 ID 下，他又是 Brisbane 的成員

### Requirement: GROUPS-67.1 (manual) 群組畫面最後一張卡片不被 + 按鈕擋住

WHERE iPhone 或 Android 手機，WHEN 群組的畫面捲到最底，the mobile app SHALL 讓最後一張卡片整張露在 + 按鈕上方。

#### Scenario: 很多支出

- **WHEN** Brisbane 有 20 筆支出，把它的畫面捲到最底
- **THEN** 最後一張卡片整張在 + 按鈕上方，沒有被擋住

### Requirement: GROUPS-68.6 群組的畫面上的期間列和總額

WHILE 群組有不在垃圾桶裡的支出而且群組的畫面不在搜尋中（LEDGER-126.2），the mobile app SHALL 在群組的畫面上、支出的卡片上方顯示期間列（LEDGER-108.2），它下面是清單上方的總額：一行「<畫面上的卡片用到的每個幣別的全額總和，依幣別代碼排序，以「, 」隔開>」，放不下時尾端漸層消失（SHELL-68.1），沒有卡片時是「—」；期間是全部期間時期間列是「Group Total」，沒有篩選時總額就是這個群組全部不在垃圾桶裡的支出的總額；有篩選時（LEDGER-129.1）卡片只有通過篩選的那些，總額也只加總它們。總額是一個按鈕，右邊有「›」，螢幕閱讀器把它讀成一個按鈕，讀出「<期間的名稱>: <這一行的總額>」，沒有卡片時讀出「<期間的名稱>: nothing」，都不讀「›」，再讀出無障礙提示「Opens Insights」；按一下就在群組的畫面所在的分頁推入開在同一段期間的這個群組的 Insights（INSIGHTS-14.1、INSIGHTS-45.1）：Groups 分頁是 `/groups/insights?groupId=<群組 ID>`，Settings 分頁是 `/settings/archived-groups/insights?groupId=<群組 ID>`，再照 LEDGER-35.6 加上期間，全部期間時和這個月一樣，連按兩次也只推入一個；Insights 不跟著篩選。群組沒有不在垃圾桶裡的支出時，或在搜尋中，SHALL 不顯示期間列和總額。

#### Scenario: 一個幣別

- **WHEN** 名字是「Taylor」，Brisbane 有 Taylor 付的 10001 USD 的 Dinner，以及 Casey 付、只有 Blake 分攤的 2500 USD 的 Taxi
- **THEN** Brisbane 的畫面在卡片上方由上而下是期間列「Group Total」和總額「$125.01」；總額是一個按鈕，右邊有「›」，螢幕閱讀器讀出「Group Total: $125.01」和提示「Opens Insights」

#### Scenario: 幾個幣別

- **WHEN** Brisbane 還有一筆 3000 JPY 的 Sushi
- **THEN** 總額是一行「¥3,000, $125.01」，螢幕閱讀器讀出「Group Total: ¥3,000, $125.01」，按鈕右邊只有一個「›」

#### Scenario: 跟著期間

- **WHEN** 今天是 `2026-10-30`，Brisbane 有 `2026-10-29` 的 10001 USD 的 Dinner 和 `2026-09-30` 的 2500 USD 的 Taxi，把期間換成這個月
- **THEN** 期間列是「October 2026」，總額是「$100.01」，螢幕閱讀器讀出「October 2026: $100.01」；卡片只有 Dinner

#### Scenario: 期間裡沒有支出

- **WHEN** 今天是 `2026-10-30`，Brisbane 只有 `2026-09-30` 的 Taxi，把期間換成這個月
- **THEN** 總額是「—」，螢幕閱讀器讀出「October 2026: nothing」

#### Scenario: 修改之後

- **WHEN** 在 Brisbane 的畫面打開 Dinner 的明細，按「Edit」把金額改成「90.00」後按 Save，再返回 Brisbane 的畫面
- **THEN** 總額是「$115.00」

#### Scenario: 按一下

- **WHEN** 今天是 `2026-10-30`，Dinner 和 Taxi 的日期都是今天，期間是全部期間時按「$125.01」
- **THEN** 仍選中 Groups 分頁，Groups 分頁的堆疊由下而上是「Groups」、「Brisbane」和「Insights」，網址是 `/groups/insights`，加上 Brisbane 的群組 ID；Insights 選中的期間是「October 2026」，總額是「$125.01」

#### Scenario: 上個月

- **WHEN** 今天是 `2026-10-30`，Brisbane 有 `2026-10-29` 的 Dinner 和 `2026-09-30` 的 Taxi，把期間換成上個月之後按總額
- **THEN** Insights 選中的期間是「September 2026」，總額是「$25.00」

#### Scenario: 連按兩次

- **WHEN** 連按兩次「$125.01」
- **THEN** 只推入一個 Insights

#### Scenario: 沒有支出

- **WHEN** 打開還沒有支出的 Brisbane 的畫面
- **THEN** 沒有期間列和總額

#### Scenario: 搜尋中

- **WHEN** 在 Brisbane 的畫面搜尋「dinner」，再結束搜尋
- **THEN** 搜尋中沒有期間列和總額；結束之後期間列是「Group Total」，總額是「$125.01」

#### Scenario: 有篩選

- **WHEN** 名字是「Taylor」，Brisbane 有 Taylor 付的 10001 USD 的 Dinner 和 Casey 付的 2500 USD 的 Taxi，在 Filters 的 Paid by 選「Casey」
- **THEN** 期間列仍是「Group Total」，總額是「$25.00」，螢幕閱讀器讀出「Group Total: $25.00」

#### Scenario: 篩選之後沒有卡片

- **WHEN** 接著把 Amount 的 Min 改成「100」
- **THEN** 總額是「—」，螢幕閱讀器讀出「Group Total: nothing」

#### Scenario: 封存的群組

- **WHEN** 封存 Brisbane 之後，從 Archived Groups 打開它的畫面
- **THEN** 「Restore Group」下面是期間列「Group Total」和總額「$125.01」，再下面是卡片；按「$125.01」時，在 Settings 分頁推入 `/settings/archived-groups/insights`，加上 Brisbane 的群組 ID，堆疊由下而上是「Settings」、「Archived Groups」、「Brisbane」和「Insights」

### Requirement: GROUPS-69.4 群組的畫面上你的淨額

WHILE 群組有不在垃圾桶裡的支出而且群組的畫面不在搜尋中（LEDGER-126.2），the mobile app SHALL 在群組的畫面上、清單上方的總額（GROUPS-68.6）的下面、支出的卡片上方顯示你在這個群組的淨額，算的是這個群組全部不在垃圾桶裡的支出，不跟著期間，也不跟著篩選；最多兩行，先是「You owe: <淨額小於 0 的每個幣別的淨額絕對值>」，再是「You're owed: <淨額大於 0 的每個幣別的淨額>」，都依幣別代碼排序，以「, 」隔開，放不下時尾端漸層消失（SHELL-68.1），沒有這個方向的幣別時就沒有這一行；每個幣別的淨額都是 0 時，只有一行「Settled up」；這幾行合起來是一個按鈕，右邊有「›」，螢幕閱讀器把它讀成一個按鈕，讀出這幾行但不讀「›」，再讀出無障礙提示「Opens Balances」，按一下就打開 Balances（GROUPS-70.1）；群組沒有不在垃圾桶裡的支出時，或在搜尋中，SHALL 不顯示這幾行。

#### Scenario: 別人欠你

- **WHEN** 名字是「Taylor」，Brisbane 依序加入 Casey 和 Blake，有 Taylor 付的 60.00 USD 的 Dinner，分給 Taylor、Casey 和 Blake，以及 Casey 付、只有 Blake 分攤的 25.00 USD 的 Taxi
- **THEN** 總額「$85.00」下面是「You're owed: $40.00」，再下面是卡片；它是一個按鈕，右邊有「›」，螢幕閱讀器讀出「You're owed: $40.00」和提示「Opens Balances」

#### Scenario: 你欠別人

- **WHEN** Brisbane 只有 Casey 付的 60.00 USD 的 Dinner，分給 Taylor、Casey 和 Blake
- **THEN** 總額下面是「You owe: $20.00」

#### Scenario: 打平

- **WHEN** Brisbane 只有 Taylor 付、只分給 Taylor 的 20.00 USD 的 Coffee，或只有和你無關的支出
- **THEN** 總額下面是「Settled up」

#### Scenario: 兩個方向

- **WHEN** Brisbane 有 Casey 付的 3000 JPY 的 Sushi，分給 Taylor 和 Casey，以及 Taylor 付、分給 Taylor、Casey 和 Blake 的 60.00 USD 的 Dinner
- **THEN** 由上而下是「You owe: ¥1,500」和「You're owed: $40.00」，兩行在同一個按鈕裡，按鈕右邊只有一個「›」

#### Scenario: 同一個方向幾個幣別

- **WHEN** Brisbane 有 Taylor 付、分給 Taylor 和 Casey 的 60.00 AUD 的 Taxi，以及 Taylor 付、分給 Taylor、Casey 和 Blake 的 60.00 USD 的 Dinner
- **THEN** 只有一行「You're owed: A$30.00, $40.00」

#### Scenario: 有一個幣別打平

- **WHEN** Brisbane 有 Casey 付的 Sushi，以及 Taylor 付、只分給 Taylor 的 20.00 USD 的 Coffee
- **THEN** 只有「You owe: ¥1,500」，沒有「Settled up」

#### Scenario: 沒有支出

- **WHEN** 打開還沒有支出的 Brisbane 的畫面
- **THEN** 沒有「You're owed」、「You owe」和「Settled up」

#### Scenario: 按下

- **WHEN** 按「You're owed: $40.00」
- **THEN** 打開 Brisbane 的 Balances

#### Scenario: 不跟著期間

- **WHEN** 今天是 `2026-10-30`，Brisbane 只有 `2026-09-30` Taylor 付的 60.00 USD 的 Dinner，分給 Taylor、Casey 和 Blake，把期間換成這個月
- **THEN** 總額是「—」，它下面仍是「You're owed: $40.00」

#### Scenario: 搜尋中

- **WHEN** 在 Brisbane 的畫面搜尋「dinner」，再結束搜尋
- **THEN** 搜尋中沒有「You're owed: $40.00」，也沒有打開 Balances 的按鈕；結束之後它又在總額下面

#### Scenario: 不跟著篩選

- **WHEN** 名字是「Taylor」，Brisbane 只有 Taylor 付、分給 Taylor、Casey 和 Blake 的 60.00 USD 的 Dinner，在 Filters 把 Amount 的 Min 改成「100」
- **THEN** 總額是「—」，它下面仍是「You're owed: $40.00」，再下面是膠囊列

### Requirement: GROUPS-70.1 開啟和關閉 Balances

WHEN 使用者按群組的畫面上你的淨額（GROUPS-69.4），the mobile app SHALL 開啟從畫面底部升起、蓋在群組的畫面上的 Balances，標題是「Balances」，標題列只有取消「Close」（SHELL-47.2、SHELL-48.2）；按 Close、把 Balances 往下滑或按 Android 的返回鍵，SHALL 關閉 Balances，回到群組的畫面。

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

The mobile app SHALL 在 Balances 依幣別代碼排序，為群組不在垃圾桶裡的支出用到的每個幣別各放一個區塊，用到兩個以上幣別時每個區塊的標題是幣別代碼，只有一個幣別時沒有標題，區塊裡由上而下先依 GROUPS-24.4 的順序列出群組的每位成員，再依被移出的先後列出這個幣別不在垃圾桶裡的支出的付款或分攤裡的前成員；每個人一列，依序是他的名稱（你的成員是你的成員名稱加上「 (You)」，前成員是他存著的名稱）、淨額大於 0 時的「Is Owed <淨額>」、小於 0 時的「Owes <淨額的絕對值>」或等於 0 時的「Settled up」，以及「Paid <已付> · Share <份額>」，所以每個幣別所有人的淨額加總是 0。

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

### Requirement: GROUPS-72.4 群組的卡片顯示成員人數

The mobile app SHALL 在群組的卡片上、群組名稱那一行的右邊顯示群組的成員人數，一位時是「1 member」，其他時候是「<人數> members」；前成員不算在內；唯讀副本顯示的不是成員人數，是「Read-only copy」（GROUPS-153.1）。群組名稱是粗體。字級很大時，成員人數改在名稱的下一行（GROUPS-104.1）。

#### Scenario: 新建立的群組

- **WHEN** 以預設的字級建立「Brisbane」
- **THEN** Brisbane 的卡片依序是「Brisbane」和「1 member」，「1 member」在「Brisbane」右邊

#### Scenario: 加入成員

- **WHEN** 在 Brisbane 依序加入 Casey 和 Blake，再回到 Groups 根畫面
- **THEN** 卡片上是「3 members」

#### Scenario: 移出和加回

- **WHEN** 把 Blake 移出 Brisbane
- **THEN** 卡片上是「2 members」；把他加回來之後是「3 members」

### Requirement: GROUPS-73.2 群組的卡片顯示你的份額和淨額

The mobile app SHALL 在群組的卡片上、名稱那一行的下面固定顯示兩行，每一行只佔一行，放不下時尾端漸層消失（SHELL-68.1）：群組沒有不在垃圾桶裡的支出時，是「No spending yet」和一行空白；你的淨額同時有大於 0 和小於 0 的幣別時，是「You owe: <淨額小於 0 的每個幣別的淨額絕對值>」和「You're owed: <淨額大於 0 的每個幣別的淨額>」；其他時候是「Your share: <每個幣別的你的份額>」，以及「You owe: <…>」、「You're owed: <…>」或每個幣別的淨額都是 0 時的「Settled up」。同一行的幣別依幣別代碼排序，以「, 」隔開。卡片的名稱仍是「Open <群組名稱>」（GROUPS-2.2），螢幕閱讀器讀完名稱，接著依序讀出成員人數和有內容的每一行。

#### Scenario: 兩個方向

- **WHEN** 名字是「Taylor」，Brisbane 依序加入 Casey 和 Blake，有 Taylor 付的 120.00 AUD 的 Groceries，分給 Taylor 和 Casey，以及 Casey 付的 60.00 USD 的 Tickets，分給 Taylor、Casey 和 Blake
- **THEN** Brisbane 的卡片依序是「Brisbane」、「3 members」、「You owe: $20.00」、「You're owed: A$60.00」，沒有「Your share」

#### Scenario: 同一個方向幾個幣別

- **WHEN** Brisbane 有 Taylor 付的 120.00 AUD 的 Groceries，分給 Taylor 和 Casey，以及 Taylor 付的 60.00 USD 的 Dinner，分給 Taylor、Casey 和 Blake
- **THEN** 卡片上是「Your share: A$60.00, $20.00」和「You're owed: A$60.00, $40.00」

#### Scenario: 打平

- **WHEN** Brisbane 只有 Taylor 付的 20.00 USD 的 Coffee，只分給 Taylor
- **THEN** 卡片上是「Your share: $20.00」和「Settled up」

#### Scenario: 和你無關的支出

- **WHEN** Brisbane 只有 Casey 付的 25.00 USD 的 Taxi，只分給 Blake
- **THEN** 卡片上是「Your share: $0.00」和「Settled up」

#### Scenario: 還沒有支出

- **WHEN** Brisbane 還沒有支出
- **THEN** 卡片依序是「Brisbane」、「1 member」和「No spending yet」

#### Scenario: 螢幕閱讀器

- **WHEN** 螢幕閱讀器讀「兩個方向」的 Brisbane 的卡片
- **THEN** 讀出名稱「Open Brisbane」，接著依序是「3 members」、「You owe: $20.00」、「You're owed: A$60.00」

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
- **THEN** Brisbane 的畫面的總額是「$30.00」，你的淨額是「You owe: $10.00」；Balances 是「Taylor (You)」「Owes $10.00」「Paid $0.00 · Share $10.00」、「Casey」「Is Owed $20.00」「Paid $30.00 · Share $10.00」、「Blake」「Owes $10.00」「Paid $0.00 · Share $10.00」；卡片上是「Your share: $10.00」和「You owe: $10.00」

#### Scenario: 還原

- **WHEN** 按 Undo 提示的「Undo」，或在 Trash 還原 Dinner
- **THEN** 總額又是「$90.00」，你的淨額是「You're owed: $30.00」，卡片上是「Your share: $30.00」和「You're owed: $30.00」

#### Scenario: 都在垃圾桶裡

- **WHEN** 把 Dinner 和 Taxi 都移到垃圾桶
- **THEN** Brisbane 的畫面沒有期間列、總額和你的淨額，顯示「No expenses in this group yet.」；卡片上是「No spending yet」

### Requirement: GROUPS-76.1 (e2e) 名稱表單開著鍵盤時能一次按下儲存或取消

WHILE Rename Group 或 Rename Member 的鍵盤開著，the mobile app SHALL 讓名稱欄位、Cancel 與 Save 可見且可操作，使用者輸入有效的新名稱後按一次 Save 就儲存並返回原畫面，按一次 Cancel 就放棄這次修改並返回原畫面，不需要先按一次收起鍵盤。

#### Scenario: Rename Group

- **WHEN** 在 Brisbane 的 Rename Group 輸入 Tokyo，鍵盤保持開著，按一次 Save
- **THEN** 回到群組畫面，名稱是 Tokyo；重新打開後輸入 Osaka 並按一次 Cancel，回到群組畫面仍是 Tokyo

#### Scenario: Rename Member

- **WHEN** 在 Casey 的 Rename Member 輸入 Casey K.，鍵盤保持開著，按一次 Save
- **THEN** 回到 Members，成員是 Casey K.；重新打開後輸入 Casey L. 並按一次 Cancel，回到 Members 仍是 Casey K.

#### Scenario: 放大的文字

- **WHEN** 使用較小螢幕或放大字級開啟名稱表單
- **THEN** 可藉由增高或捲動 sheet 操作名稱欄位；Cancel 與 Save 仍留在標題列，沒有被鍵盤遮住

### Requirement: GROUPS-77.1 群組的金額用手機地區的貨幣格式

The mobile app SHALL 讓 Groups 根畫面、群組的畫面和 Balances，用手機地區的貨幣格式（LEDGER-40.2）顯示金額。

#### Scenario: 手機的語言不是英文

- **WHEN** 手機第一個偏好的語言和地區是法文（澳洲），Brisbane 有 Taylor、Casey 和 Blake，Taylor 付了 60.00 AUD，三人平分
- **THEN** Groups 根畫面的 Brisbane 是「Your share: $20.00」和「You're owed: $40.00」；Brisbane 的畫面的總額是「$60.00」，你的淨額是「You're owed: $40.00」；Balances 上 Taylor 是「Is Owed $40.00」和「Paid $60.00 · Share $20.00」，都不是「20,00 $AU」這樣的格式

### Requirement: GROUPS-78.1 (e2e) 往右斜向拖曳或捲動清單時收起露出的 Archive

WHILE 群組的卡片露出「Archive」，WHEN 使用者從這張卡片或露出的「Archive」往右拖過露出寬度的一半或快速往右滑，或捲動 Groups 根畫面，the mobile app SHALL 收起這張卡片並停用「Archive」，不按下「Archive」，也不打開群組的畫面；手指開始移動時橫向位移大於縱向位移就是往右拖曳，放手前清單都不捲動；開始移動時縱向位移大於或等於橫向位移就是捲動清單，方向確定後直到放手都不改變。

#### Scenario: 往右下斜向拖曳

- **WHEN** Groups 根畫面的群組多到能捲動，把其中一張卡片往左滑露出「Archive」，再從這張卡片往右約 120 pt、往下約 80 pt 拖曳後放手
- **THEN** 「Archive」收起並停用

#### Scenario: 清單不跟著動

- **WHEN** 同一張卡片再露出「Archive」，從這張卡片往右約 300 pt、往上約 220 pt 拖曳後放手
- **THEN** 「Archive」收起，清單沒有捲動，這張卡片還在原來的位置

#### Scenario: 主要是上下拖

- **WHEN** 同一張卡片再露出「Archive」，從這張卡片往右約 120 pt、往上約 390 pt 拖曳後放手
- **THEN** 清單捲動，「Archive」收起

#### Scenario: 從露出的 Archive 往右拖

- **WHEN** 一張卡片露出「Archive」，從「Archive」上往右約 90 pt 拖曳後放手
- **THEN** 「Archive」收起，沒有按下它，群組沒有封存

#### Scenario: 從別張卡片捲動清單

- **WHEN** 一張卡片露出「Archive」時，從另一張卡片往上約 390 pt 拖曳
- **THEN** 清單捲動，「Archive」收起，沒有打開群組的畫面，群組沒有封存

#### Scenario: Android

- **WHEN** 在 Android 手機重複上述拖曳
- **THEN** 結果相同，pt 在 Android 以 dp 計

### Requirement: GROUPS-79.2 (e2e) 往左拖群組的卡片時清單不捲動

WHEN 使用者從還沒露出「Archive」的群組的卡片開始拖曳，且手指開始移動時橫向位移大於縱向位移，the mobile app SHALL 容許手指的縱向偏移，放手前清單都不捲動，往左拖時依 GROUPS-47.1 露出「Archive」，超過 SHELL-69.1 的位置時依它觸發；開始移動時縱向位移大於或等於橫向位移就是捲動清單，不露出「Archive」，方向確定後直到放手都不改變。

#### Scenario: 斜向往左拖

- **WHEN** Groups 根畫面的群組多到能捲動，從一張卡片往左約 200 pt、往上約 150 pt 拖曳後放手
- **THEN** 這張卡片露出「Archive」，清單沒有捲動，這張卡片還在原來的位置

#### Scenario: 主要是上下拖

- **WHEN** 從一張卡片往左約 120 pt、往上約 390 pt 拖曳後放手
- **THEN** 清單捲動，沒有露出「Archive」

#### Scenario: Android

- **WHEN** 在 Android 手機重複上述拖曳，往左不超過 SHELL-69.1 的位置
- **THEN** 結果相同，pt 在 Android 以 dp 計

### Requirement: GROUPS-80.1 (e2e) iOS 26 以上從收起的卡片水平往右拖返回

WHERE iOS 26 以上，WHILE 未封存群組的畫面開著，WHEN 使用者從沒有露出「Delete」的支出卡片幾乎水平地往右拖曳，the mobile app SHALL 返回上一頁；比較斜的拖曳由系統決定返回或捲動清單。

#### Scenario: 水平往右拖

- **WHEN** 從 Groups 根畫面打開 Brisbane，從 Dinner 的卡片水平往右約 280 pt 拖曳
- **THEN** 回到 Groups 根畫面

#### Scenario: 比較斜的拖曳

- **WHEN** 從 Dinner 的卡片往右約 280 pt、往上約 90 pt 拖曳
- **THEN** 系統可能捲動清單並留在 Brisbane 的畫面，卡片不露出也不打開明細

### Requirement: GROUPS-100.1 群組的畫面的大標題

The mobile app SHALL 在群組的畫面的標題列下方，用大字顯示群組名稱，標題列上不顯示名稱；大標題捲出畫面之後，標題列才顯示名稱。大標題是一個按鈕，名稱是群組名稱，預設收起只佔一行，按一下展開成完整的名稱，再按一下收起；未封存的群組長按時打開 Rename Group（GROUPS-40.3），螢幕閱讀器讀出無障礙提示「Shows the full name. Long press renames the group.」；封存的群組沒有這個提示。找不到群組時，標題列是「Group Details」。

#### Scenario: 打開群組

- **WHEN** 打開 Brisbane 的畫面
- **THEN** 標題列沒有「Brisbane」；標題列下方是名稱「Brisbane」的按鈕，標示為收起，無障礙提示是「Shows the full name. Long press renames the group.」

#### Scenario: 展開和收起

- **WHEN** 打開名稱是 300 個「a」的群組，按大標題，再按一次
- **THEN** 第一次按完標示為展開，完整顯示 300 個「a」；第二次按完標示為收起，只佔一行

#### Scenario: 封存的群組

- **WHEN** 打開封存的 Brisbane 的畫面，按大標題
- **THEN** 標示為展開，沒有無障礙提示

#### Scenario: 捲出畫面

- **WHEN** 把 Brisbane 的畫面往下捲到大標題捲出畫面
- **THEN** 標題列顯示「Brisbane」

#### Scenario: 找不到的群組

- **WHEN** 以不存在的群組 ID 打開群組的畫面
- **THEN** 標題列是「Group Details」，沒有大標題

### Requirement: GROUPS-101.1 (manual) 長群組名先縮小再漸層

The mobile app SHALL 讓群組的畫面的大標題放不下時先縮小，最小到 24 pt，還放不下才尾端漸層消失（SHELL-68.1）；展開時維持同一個字級，換行顯示完整的名稱。

#### Scenario: 稍長的名稱

- **WHEN** 打開名稱是「Brisbane Road Trip 2026」的群組
- **THEN** 大標題縮小到放得下，沒有漸層

#### Scenario: 很長的名稱

- **WHEN** 打開名稱是 300 個「a」的群組，再按大標題
- **THEN** 收起時字級是 24 pt，尾端漸層消失；展開時字級不變，顯示完整的名稱

### Requirement: GROUPS-107.2 群組的畫面最上面顯示有幾筆支出掛著標記

WHILE 共同帳本有掛著標記的支出，也就是需要確認的支出或可能重複的支出（sync），the mobile app SHALL 在它的畫面的大標題下面顯示一個按鈕：LEDGER-151.1 的圖示，後面是「1 expense needs review」，不只一筆時是「<筆數> expenses need review」，右邊有「›」；筆數是這個群組全部掛著標記的支出，同時需要確認又可能重複的支出只算一筆，可能重複的支出的對象不算，不跟著期間、篩選和搜尋；它在 SYNC-75.1 和 SYNC-83.1 的那兩句話下面，封存的共同帳本顯示在唯讀的提示（GROUPS-55.2）上面；螢幕閱讀器把它讀成一個按鈕，讀出這句話，不讀圖示和「›」，再讀出無障礙提示「Opens the first one」；按一下就照 GROUPS-63.1 推入第一筆的明細，也就是這些支出依 LEDGER-28.1 的順序最前面的那一筆，不管畫面的排序，也不管它掛的是哪一種標記，連按兩次也只推入一個。群組沒有掛著標記的支出時，SHALL 不顯示這個按鈕；別的群組的畫面只算自己的。

#### Scenario: 一筆

- **WHEN** Brisbane 是共同帳本，你把 Dinner 的金額改成 120.00，之後套用別支手機的 90.00（sync），打開 Brisbane 的畫面
- **THEN** 大標題「Brisbane」下面是一個按鈕「1 expense needs review」，前面是 LEDGER-151.1 的圖示，右邊有「›」，再下面是期間列；螢幕閱讀器讀出一個按鈕「1 expense needs review」和提示「Opens the first one」

#### Scenario: 兩筆

- **WHEN** Brisbane 還有日期是 `2026-10-29` 的 Taxi，它也需要確認
- **THEN** 按鈕是「2 expenses need review」

#### Scenario: 按下

- **WHEN** Dinner（`2026-10-30`）和 Taxi（`2026-10-29`）都需要確認，Brisbane 的畫面的排序是 Oldest First，按「2 expenses need review」
- **THEN** 仍選中 Groups 分頁，Groups 分頁的堆疊由下而上是「Groups」、「Brisbane」和「Expense」，網址是 `/groups/expenses/` 加上 Dinner 的 ID，明細最上面是標記的區塊（LEDGER-152.1）

#### Scenario: 連按兩次

- **WHEN** 連按兩次這個按鈕
- **THEN** 只推入一個明細；返回一次就回到 Brisbane 的畫面

#### Scenario: 處理之後

- **WHEN** 在 Dinner 的明細按「Keep Current」再返回；之後在 Taxi 的明細按「Use Mine」再返回
- **THEN** 第一次返回時按鈕是「1 expense needs review」，按了打開的是 Taxi；第二次返回時沒有這個按鈕

#### Scenario: 不跟著期間、篩選和搜尋

- **WHEN** 今天是 `2026-10-30`，需要確認的只有 `2026-09-15` 的 Hotel，它現在是 $90.00，Brisbane 另有今天的 Taxi（$100.01）；Brisbane 的畫面的期間是這個月，或期間是全部期間而篩選是 Amount 的 Min「95」，或正在搜尋「taxi」
- **THEN** 畫面上都只有 Taxi 的卡片，仍有「1 expense needs review」；按了打開 Hotel 的明細

#### Scenario: 垃圾桶裡的支出

- **WHEN** 只有 Dinner 需要確認，把它移到垃圾桶，再按 Undo
- **THEN** 移到垃圾桶之後沒有這個按鈕；Undo 之後又是「1 expense needs review」

#### Scenario: 和同步的那兩句話

- **WHEN** Brisbane 停在格式版本 2 的事件（SYNC-75.1），Dinner 也需要確認
- **THEN** 大標題下面由上而下是 SYNC-75.1 的那句話和「1 expense needs review」

#### Scenario: 封存的共同帳本

- **WHEN** Dinner 需要確認時封存 Brisbane，從 Archived Groups 打開它的畫面，按「1 expense needs review」
- **THEN** 由上而下是大標題「Brisbane」、「1 expense needs review」、「Archived group. Expenses and allocations are read-only.」和「Restore Group」；按了之後在 Settings 分頁推入 `/settings/archived-groups/expenses/` 加上 Dinner 的 ID

#### Scenario: 沒有掛著標記的支出

- **WHEN** 打開沒有支出被蓋掉過、也沒有可能重複的支出的 Brisbane 的畫面，和不是共同帳本的 Tokyo 的畫面；或 Brisbane 的 Dinner 需要確認時打開 Tokyo 的畫面
- **THEN** 都沒有這個按鈕

#### Scenario: 可能重複的支出

- **WHEN** Brisbane 是共同帳本，新增 Dinner 之後套用別支手機的 Supper 的第一個事件（sync），打開 Brisbane 的畫面，按「1 expense needs review」
- **THEN** 按鈕是「1 expense needs review」，不是 2：Supper 算，它的對象 Dinner 不算；按了推入 Supper 的明細，最上面是可能重複的區塊（LEDGER-157.1）

#### Scenario: 兩種標記各一筆

- **WHEN** Brisbane 的 Taxi（`2026-10-29`）需要確認，`2026-10-30` 的 Supper 是可能重複的支出，按「2 expenses need review」
- **THEN** 按鈕是「2 expenses need review」；按了推入 Supper 的明細

#### Scenario: 需要確認的那一筆日期比較新

- **WHEN** `2026-10-29` 的 Supper 是可能重複的支出，`2026-10-30` 的 Taxi 需要確認，按「2 expenses need review」
- **THEN** 按了推入 Taxi 的明細，最上面是 LEDGER-152.1 的區塊：先後只看 LEDGER-28.1 的順序，不看標記的種類

#### Scenario: 一筆支出掛著兩種標記

- **WHEN** Dinner 同時需要確認，也是可能重複的支出（LEDGER-156.1），Brisbane 沒有別的掛著標記的支出
- **THEN** 按鈕是「1 expense needs review」；在 Dinner 的明細按「Keep Current」之後仍是「1 expense needs review」，再按「Not a Duplicate」之後沒有這個按鈕

#### Scenario: 處理可能重複的支出之後

- **WHEN** Supper 是 Brisbane 唯一掛著標記的支出，在它的明細按「Not a Duplicate」再返回；或按「Delete This Expense」
- **THEN** 回到 Brisbane 的畫面時都沒有這個按鈕

#### Scenario: 別支手機說了不是重複

- **WHEN** Brisbane 的畫面開著、顯示「1 expense needs review」時，套用說 Dinner 和 Supper 不是重複的事件（sync）
- **THEN** 不必重新打開，這個按鈕就消失

#### Scenario: 重新啟動

- **WHEN** Dinner 需要確認時重新啟動 app，打開 Brisbane 的畫面
- **THEN** 仍是「1 expense needs review」

### Requirement: GROUPS-102.1 在 Group actions 打開 Group Categories

WHEN 使用者在 Group actions 選「Categories」，the mobile app SHALL 打開蓋在群組的畫面上的 sheet，網址是 `/manage-categories?scopeKind=group&spaceId=<群組 ID>`，內容是這個群組的 Group Categories（CATEGORIES-23.4）；按「Close」，或 iOS 上往下滑、Android 上按返回鍵時關閉，回到群組的畫面。封存的群組打開時是唯讀的（CATEGORIES-43.1）。

#### Scenario: 打開

- **WHEN** 在 Brisbane 的畫面選 Group actions 的「Categories」
- **THEN** 網址是 `/manage-categories`，加上 `scopeKind=group` 和 Brisbane 的群組 ID；標題是「Group Categories」，列出 Brisbane 的分類

#### Scenario: 關閉

- **WHEN** 按「Close」
- **THEN** 回到 Brisbane 的畫面

#### Scenario: 封存的群組

- **WHEN** 封存 Brisbane 之後，在它的畫面選 Group actions 的「Categories」
- **THEN** 打開唯讀的 Group Categories，沒有「Add category」

### Requirement: GROUPS-103.1 (manual) 群組的卡片一樣高

The mobile app SHALL 讓 Groups 根畫面上每張群組的卡片一樣高，不管內容是兩行金額還是「No spending yet」。

#### Scenario: 幾種卡片

- **WHEN** 有還沒有支出的 Brisbane、打平的 Tokyo，以及同時有 You owe 和 You're owed 的 Paris
- **THEN** 三張卡片一樣高

#### Scenario: 最大的字級

- **WHEN** iOS 上把字級設成最大的輔助使用字級，有同樣三個群組
- **THEN** 三張卡片仍然一樣高，名稱、成員人數和下面兩行都在卡片裡，沒有被切掉

### Requirement: GROUPS-104.1 字級很大時，群組卡片的成員人數在名稱下一行

WHILE 手機的字級是 iOS 的輔助使用字級，或 Android 的字型大小在 150% 以上，the mobile app SHALL 在群組的卡片上把成員人數放在群組名稱的下一行，讓名稱使用整行的寬度，仍然只佔一行，放不下時尾端漸層消失（SHELL-68.1）；比這小的字級，成員人數在名稱右邊（GROUPS-72.4）。

#### Scenario: iOS 的輔助使用字級

- **WHEN** iOS 上把字級設成最小的輔助使用字級，建立「Brisbane」；再把字級設成最大的輔助使用字級
- **THEN** 兩種字級時，Brisbane 的卡片都依序是「Brisbane」和「1 member」，「1 member」在「Brisbane」下一行；「Brisbane」只佔一行，放不下時尾端漸層消失

#### Scenario: iOS 最大的一般字級

- **WHEN** iOS 上把字級設成最大的非輔助使用字級，建立「Brisbane」
- **THEN** 「1 member」仍在「Brisbane」右邊

#### Scenario: Android

- **WHEN** Android 上把字型大小設成 150%，建立「Brisbane」；再依序設成 200% 和 130%
- **THEN** 150% 和 200% 時「1 member」在「Brisbane」下一行；130% 時回到「Brisbane」右邊

### Requirement: GROUPS-105.1 共同帳本有 20 位成員時不能再加

WHILE 未封存的共同帳本有 20 位以上的成員，the mobile app SHALL 在它的 Members 不顯示「Add Member」和名稱欄位，在成員的下面顯示「A shared group can have up to 20 members.」；第 20 位成員存好後，不管是新加入的還是加回來的前成員，名稱欄位就收起。前成員不算；別支手機加入的成員讓人數超過 20 位時每一位都留下（SYNC-37.1）；成員少於 20 位時，SHALL 照常顯示「Add Member」，不顯示這句話。

#### Scenario: 20 位成員

- **WHEN** 你和 19 位成員的共同帳本 Brisbane，打開它的 Members
- **THEN** 由上而下是 20 位成員，最後是「A shared group can have up to 20 members.」；沒有「Add Member」，也沒有名稱欄位

#### Scenario: 加入第 20 位

- **WHEN** Brisbane 有 19 位成員，在 Members 的名稱欄位輸入「Tina」，按 Return
- **THEN** Tina 排在成員的最後，名稱欄位收起，沒有「Add Member」，最後是這句話

#### Scenario: 移出一位

- **WHEN** 接著把一位成員移出 Brisbane
- **THEN** Members 最後又是「Add Member」，沒有這句話

#### Scenario: 加回來的是第 20 位

- **WHEN** Brisbane 有 19 位成員和前成員 Member 19，在 Members 的名稱欄位輸入「member 19」按 Return，再按「Add Back」
- **THEN** Member 19 排在成員的最後，名稱欄位收起，沒有「Add Member」，最後是這句話

#### Scenario: 前成員不算

- **WHEN** Brisbane 有 21 位成員，移出兩位之後變成共同帳本
- **THEN** Members 列出 19 位成員和「Add Member」，沒有這句話

#### Scenario: 別支手機讓人數超過 20 位

- **WHEN** Brisbane 有 20 位成員，Members 開著時套用別支手機加入 Dana 的事件，之後一位一位移出兩位成員
- **THEN** 先是列出 21 位成員，沒有「Add Member」；移出一位之後有 20 位，仍沒有「Add Member」；再移出一位之後有 19 位，最後是「Add Member」

#### Scenario: 名稱欄位開著時別支手機加入第 20 位

- **WHEN** Brisbane 有 19 位成員，Members 的名稱欄位裡有「Tina」時，套用別支手機加入 Dana 的事件；之後移出一位成員，再按「Add Member」
- **THEN** 先是名稱欄位收起，最後是這句話；按「Add Member」之後，名稱欄位是空的（GROUPS-29.2）

#### Scenario: 還不是共同帳本

- **WHEN** 還不是共同帳本的群組有 31 位成員
- **THEN** Members 最後仍是「Add Member」（GROUPS-31.3）

### Requirement: GROUPS-106.1 未封存群組的 Members 有 Invite with Link

WHILE 群組沒有封存，the mobile app SHALL 在它的 Members 的成員清單上面另外顯示一區，裡面只有一列：角色為 button、名稱為「Invite with Link」的按鈕，右邊有「›」，按了開啟 Invite（SHARING-91.1）。封存群組的 Members 沒有這一列。

#### Scenario: 未封存的群組

- **WHEN** 名字是「Taylor」，建立「Brisbane」後開啟它的 Members
- **THEN** 由上而下是「Invite with Link」、「Taylor (You)」和「Add Member」；「Invite with Link」是名稱為「Invite with Link」的按鈕，右邊有「›」，在成員清單的那一區之外

#### Scenario: 共同帳本有 20 位成員

- **WHEN** 你和 19 位成員的共同帳本 Brisbane，打開它的 Members
- **THEN** 最上面仍是「Invite with Link」，最後是「A shared group can have up to 20 members.」（GROUPS-105.1）

#### Scenario: 封存的群組

- **WHEN** 封存 Brisbane 之後打開它的 Members
- **THEN** 沒有「Invite with Link」（GROUPS-56.1）；還原之後又有

### Requirement: GROUPS-108.2 Groups 根畫面列出這支手機的申請

WHILE 本機資料存著申請（sharing），the mobile app SHALL 在 Groups 根畫面群組的卡片上面，依存下的先後由上而下各顯示一張申請的卡片：卡片顯示申請的群組名稱，下面一行照申請的狀態（sharing）：等待同意的是「Waiting for approval」，還沒送出的是「Not sent」，要重選的是「Choose again」，同意了還沒加入好的是「Approved」，被拒絕的是「Request declined」，邀請不再有效的是「Invite no longer valid」；狀態變了，卡片不必重新啟動就跟著換。卡片是角色為 button、無障礙名稱為「Open request to join <群組名稱>」的按鈕，按了打開 Join Group，顯示這個申請（SHARING-225.1）。沒有申請時沒有這些卡片；沒有未封存的群組時，申請的卡片下面仍是 GROUPS-1.2 的那句話。

#### Scenario: 一個等待中的申請

- **WHEN** 沒有群組的手機用邀請連結申請加入 Brisbane，API 回答申請送出了，關閉 Join Group 之後選中 Groups 分頁
- **THEN** 由上而下是名稱為「Open request to join Brisbane」的卡片，上面有「Brisbane」和「Waiting for approval」，再來才是「No groups yet. Tap + to create a group.」

#### Scenario: 按卡片

- **WHEN** 按這張卡片
- **THEN** Join Group 蓋在 Groups 根畫面上，顯示「Waiting for Approval」和「Brisbane」；關閉之後回到 Groups 根畫面

#### Scenario: 還沒送出的申請

- **WHEN** 沒有網路時按了「Send Request」，關閉 Join Group 之後選中 Groups 分頁
- **THEN** 申請的卡片上有「Brisbane」和「Not sent」；按了之後 Join Group 顯示「Your request hasn't been sent.」、「Try Again」和「Cancel Request」

#### Scenario: 其他的狀態

- **WHEN** Brisbane 的申請是要重選的；是同意了還沒加入好的；是被拒絕的；或是邀請不再有效的
- **THEN** 卡片上「Brisbane」的下面依序是「Choose again」、「Approved」、「Request declined」和「Invite no longer valid」；四種的無障礙名稱都是「Open request to join Brisbane」

#### Scenario: 加入好了之後

- **WHEN** 成員同意了 Brisbane 的申請，這支手機加入好了（sharing 的 SHARING-219.2）
- **THEN** 沒有申請的卡片，群組的卡片裡有「Open Brisbane」

#### Scenario: 排在群組的卡片上面

- **WHEN** 有群組 Paris 的手機，依序申請加入 Brisbane 和 Tokyo
- **THEN** 由上而下是 Brisbane 的申請的卡片、Tokyo 的申請的卡片，和「Open Paris」

#### Scenario: 取消之後

- **WHEN** 取消 Brisbane 的申請
- **THEN** Groups 根畫面沒有它的卡片

#### Scenario: 重新啟動之後

- **WHEN** 有一個等待中的申請時重新啟動 app，選中 Groups 分頁
- **THEN** 申請的卡片還在

### Requirement: GROUPS-130.1 群組的畫面顯示有幾個人想加入

WHILE 未封存的共同帳本有收到的申請，the mobile app SHALL 在它的畫面的大標題下面顯示一個按鈕：「1 person wants to join」，不只一個時是「<個數> people want to join」，右邊有「›」；它在 GROUPS-107.2 的按鈕下面，沒有那顆按鈕時在 SYNC-75.1 和 SYNC-83.1 的那兩句話下面；螢幕閱讀器把它讀成一個按鈕，讀出這句話，不讀「›」，再讀出無障礙提示「Opens Members」；按一下開啟這個群組的 Members（GROUPS-23.2），連按兩次也只開一個。沒有收到的申請時 SHALL 不顯示這個按鈕；封存的共同帳本和還不是共同帳本的群組都沒有；別的群組的畫面只算自己的。

#### Scenario: 一個申請

- **WHEN** Brisbane 是共同帳本，收到的申請有 Dana 的（sharing 的 SHARING-190.1），打開 Brisbane 的畫面
- **THEN** 大標題「Brisbane」下面是一個按鈕「1 person wants to join」，右邊有「›」；螢幕閱讀器讀出一個按鈕「1 person wants to join」和提示「Opens Members」

#### Scenario: 兩個申請

- **WHEN** 收到的申請另外有一個
- **THEN** 按鈕是「2 people want to join」

#### Scenario: 按下

- **WHEN** 按這個按鈕
- **THEN** Members 蓋在 Brisbane 的畫面上，申請那一區有 Dana 那一列（GROUPS-131.1）

#### Scenario: 和需要確認的支出一起

- **WHEN** Brisbane 另外有一筆需要確認的支出（GROUPS-107.2）
- **THEN** 大標題下面依序是「1 expense needs review」和「1 person wants to join」兩個按鈕

#### Scenario: 沒有申請，或別的群組

- **WHEN** Brisbane 沒有收到的申請；或另一個共同帳本 Tokyo 有收到的申請，打開 Brisbane 的畫面
- **THEN** Brisbane 的畫面沒有這個按鈕

### Requirement: GROUPS-131.1 Members 列出收到的申請

WHILE 未封存的共同帳本有收到的申請，the mobile app SHALL 在它的 Members，「Invite with Link」那一區和成員清單之間另外顯示一區，最上面是「Requests」，下面照 API 列出的順序（sharing 的 SHARING-170.1）一個申請一列：每一列是角色為 button 的按鈕，右邊有「›」，上面一行是申請的名字，下面一行在要當新成員時是「Wants to join as a new member」，選了成員時是「Wants to join as <那位成員現在的名稱>」，選的成員不是這個共同帳本的成員時是「Wants to join as a member who left」，正在處理時是「Approving…」或「Declining…」（SHARING-202.1）；無障礙名稱是這兩行以逗號和空格相連。收到的申請變了，這一區不必關閉再打開就跟著換；沒有收到的申請時沒有這一區，封存群組的 Members 也沒有。

#### Scenario: 兩個申請

- **WHEN** 收到的申請依序是 Dana 當新成員的，和名字是「Evan」、選了 Casey 的；打開 Brisbane 的 Members
- **THEN** 由上而下是「Invite with Link」、「Requests」、名稱為「Dana, Wants to join as a new member」的按鈕、名稱為「Evan, Wants to join as Casey」的按鈕，再來才是「Taylor (You)」、「Casey」、「Blake」和「Add Member」

#### Scenario: 選的成員改了名，或被移出了

- **WHEN** Members 開著時把 Casey 改名為「Casey Lee」；之後把他移出群組
- **THEN** Evan 那一列的第二行先是「Wants to join as Casey Lee」，之後是「Wants to join as a member who left」

#### Scenario: 沒有申請

- **WHEN** 沒有收到的申請
- **THEN** Members 沒有「Requests」，由上而下是「Invite with Link」和成員清單

#### Scenario: 封存的群組

- **WHEN** 封存 Brisbane 之後打開它的 Members
- **THEN** 沒有「Requests」那一區（GROUPS-56.1）

### Requirement: GROUPS-132.1 點申請那一列跳出同意或拒絕的選單

WHEN 使用者在 Members 點一個申請的那一列，the mobile app SHALL 跳出標題是申請的名字的選單，iOS 上是動作表（action sheet），Android 上是對話框：可以同意的申請，內容是「They'll see this group's expenses and can add and change them.」，依序是「Approve」、「Decline」和「Cancel」；不能同意的申請，內容是 sharing 的 SHARING-194.1 那個原因的那一句，依序是「Decline」和「Cancel」。iOS 上「Decline」是破壞性的樣式。按「Approve」照 SHARING-195.1 同意，按「Decline」照 SHARING-201.1 拒絕，選單都先關閉；按「Cancel」關閉選單，什麼都不做，Android 上按返回鍵或點對話框外面也一樣。

#### Scenario: iOS

- **WHEN** iOS 上在 Members 點 Dana 當新成員的那一列
- **THEN** 跳出標題「Dana」、內容是「They'll see this group's expenses and can add and change them.」的動作表，依序是「Approve」、破壞性的「Decline」和「Cancel」

#### Scenario: Android

- **WHEN** Android 上點同一列
- **THEN** 跳出標題「Dana」、內容是這句話的對話框，依序是「Approve」、「Decline」和「Cancel」

#### Scenario: 不能同意的申請

- **WHEN** Evan 的申請選了 Casey，而 Casey 已經有手機；點 Evan 那一列
- **THEN** 選單的內容是「Casey has already joined from another phone. This request can't be approved.」，依序是「Decline」和「Cancel」，沒有「Approve」

#### Scenario: 按 Cancel

- **WHEN** 在 Dana 的選單按「Cancel」；或 Android 上按返回鍵，或點對話框外面
- **THEN** 選單關閉，Dana 那一列還在；API 沒有收到同意和拒絕的請求

### Requirement: GROUPS-150.1 移除別支手機代表的成員之前先確認

WHEN 使用者在未封存的共同帳本的 Members，在別支手機代表的成員的選單選「Remove from Group」，the mobile app SHALL 先跳出提示框：標題「Remove <成員名稱>?」，訊息「<成員名稱>'s phone will lose access to this group right away. Their past payments and shares will be kept.」，按鈕是「Cancel」和破壞性的「Remove」。按「Remove」才照 sharing 的 SHARING-270.1 移除，這要連上線；按「Cancel」關閉提示框，什麼都不做，Android 上按返回鍵或點提示框外面也一樣。

#### Scenario: 確認

- **WHEN** Brisbane 是共同帳本，名冊裡有別支手機代表 Dana 的紀錄；在 Members 點 Dana 那一列，選「Remove from Group」
- **THEN** 跳出標題「Remove Dana?」的提示框，訊息是「Dana's phone will lose access to this group right away. Their past payments and shares will be kept.」，按鈕是「Cancel」和破壞性的「Remove」；API 還沒有收到任何請求，Members 仍列出 Dana

#### Scenario: 按 Cancel

- **WHEN** 在提示框按「Cancel」
- **THEN** 提示框關閉，Members 仍列出 Dana，她那一列有「Joined」；API 沒有收到換鑰匙的請求

#### Scenario: 沒有手機的成員不問

- **WHEN** 在同一個共同帳本的 Members 點沒有手機的 Blake，選「Remove from Group」
- **THEN** 沒有跳出提示框，Members 不再列出 Blake（GROUPS-26.2）；API 沒有收到換鑰匙的請求

### Requirement: GROUPS-151.1 移除別支手機代表的成員和退出的時候鎖住 Members

WHILE 別支手機代表的成員在移除中，也就是按了「Remove」之後、移除有結果之前，the mobile app SHALL 讓他那一列的第二行顯示「Removing…」，不顯示「Joined」，無障礙名稱是他的名稱、逗號、空格和「Removing…」，並照 GROUPS-27.2 鎖住 Members；WHILE 退出中，也就是按了「Leave」之後、退出有結果之前，SHALL 讓你那一列的第二行顯示「Leaving…」，無障礙名稱是你那一列原本的名稱、逗號、空格和「Leaving…」，也照 GROUPS-27.2 鎖住 Members。移除好了時 Members 不再列出他，並解開；退出好了時 Members 關閉（SHARING-276.1）；沒成功時解開，並照 SHARING-274.1 或 SHARING-277.1 跳出提示框。

#### Scenario: 移除中

- **WHEN** 在 Dana 的確認框按「Remove」，API 還沒回答換鑰匙的請求
- **THEN** Dana 那一列是「Dana」和「Removing…」，是名稱為「Dana, Removing…」的按鈕；Close 停用，點「Casey」不跳出選單，按「Add Member」不出現名稱欄位，往下滑或按 Android 的返回鍵 Members 都不關閉

#### Scenario: 移除好了

- **WHEN** API 回答換好了，這支手機同步之後
- **THEN** Members 不再列出 Dana，Close 恢復可以按

#### Scenario: 退出中

- **WHEN** 在退出的確認框按「Leave」，API 還沒回答退出的請求
- **THEN** 你那一列是「Taylor (You)」和「Leaving…」，名稱是「Taylor (You), Leaving…」；Close 停用，每一列都按了沒有反應

#### Scenario: 沒成功

- **WHEN** 換鑰匙的請求沒有得到回應
- **THEN** 跳出「Unable to Remove Member」之後，Dana 那一列又是「Dana」和「Joined」，Close 和每一列都恢復可以按

### Requirement: GROUPS-152.1 退出之前先確認，並寫出你還沒結清的金額

WHEN 使用者在共同帳本裡你的選單選「Leave Group」，the mobile app SHALL 跳出提示框：標題「Leave <群組名稱>?」；訊息依序是這幾段，段落之間空一行：「This phone keeps a read-only copy. You won't see new expenses or be able to change this group.」；你在這個群組的淨額有不是 0 的幣別時，GROUPS-69.4 的那一行或兩行，也就是「You owe: …」、「You're owed: …」或兩行都有，中間換行；名冊裡沒有別支手機代表任何一位成員時，「No other phone has joined this group, so nobody else will have its expenses.」。按鈕是「Cancel」和破壞性的「Leave」。按「Leave」才照 sharing 的 SHARING-276.1 退出，這要連上線；按「Cancel」關閉提示框，什麼都不做，Android 上按返回鍵或點提示框外面也一樣。退出不必先結清，也不必別的成員同意。

#### Scenario: 你欠別人

- **WHEN** Brisbane 是共同帳本，名冊裡有別支手機代表 Dana 的紀錄；只有 Casey 付的 60.00 USD 的 Dinner，分給 Taylor、Casey 和 Blake；在 Members 點「Taylor (You)」，選「Leave Group」
- **THEN** 跳出標題「Leave Brisbane?」的提示框，訊息是「This phone keeps a read-only copy. You won't see new expenses or be able to change this group.」、一行空白和「You owe: $20.00」，按鈕是「Cancel」和破壞性的「Leave」；API 還沒有收到退出的請求

#### Scenario: 兩個方向

- **WHEN** Brisbane 另外有 Taylor 付的 3000 JPY 的 Sushi，分給 Taylor 和 Casey
- **THEN** 訊息的第二段是兩行：「You owe: $20.00」和「You're owed: ¥1,500」

#### Scenario: 打平或沒有支出

- **WHEN** Brisbane 沒有支出，或你的淨額每個幣別都是 0
- **THEN** 訊息只有第一段，沒有「Settled up」

#### Scenario: 沒有別的手機

- **WHEN** Brisbane 是 Taylor 邀請過、還沒有人加入的共同帳本，名冊沒有紀錄；選「Leave Group」
- **THEN** 訊息的最後一段是「No other phone has joined this group, so nobody else will have its expenses.」

#### Scenario: 按 Cancel

- **WHEN** 在提示框按「Cancel」
- **THEN** 提示框關閉，Brisbane 不是唯讀副本；API 沒有收到退出的請求

### Requirement: GROUPS-153.1 唯讀副本的卡片留在原本的地方，寫著 Read-only copy

WHILE 群組是唯讀副本（sync），the mobile app SHALL 讓它的卡片留在原本的地方：沒有封存的在 Groups 根畫面依建立的先後該在的位置（GROUPS-2.2），封存的在 Archived Groups（GROUPS-52.1）。群組的卡片上，原本顯示成員人數的地方（GROUPS-72.4、GROUPS-104.1）改顯示「Read-only copy」，其他都不變：名稱、你的份額和淨額（GROUPS-73.2）和無障礙名稱。它照常可以封存和還原（GROUPS-48.1、GROUPS-57.1），兩者都不改它是唯讀副本。

#### Scenario: Groups 根畫面

- **WHEN** 依序建立 Brisbane、Tokyo 和 Paris，Tokyo 成為唯讀副本
- **THEN** Groups 根畫面依序是 Brisbane、Tokyo 和 Paris 的卡片；Tokyo 的卡片是名稱為「Open Tokyo」的按鈕，上面是「Tokyo」和「Read-only copy」，沒有「1 member」；另外兩張仍顯示成員人數

#### Scenario: 封存和還原

- **WHEN** 封存唯讀副本 Tokyo，再從 Archived Groups 按它的「Restore」
- **THEN** 先是它的卡片在 Archived Groups，由上而下是「Tokyo」和「Archived group」；還原之後回到 Groups 根畫面原本的位置，仍寫著「Read-only copy」，它的畫面仍有唯讀副本的橫幅

### Requirement: GROUPS-155.1 唯讀副本的畫面用橫幅說明，沒有 Restore Group

WHILE 群組是唯讀副本，the mobile app SHALL 在它的畫面的大標題下面顯示橫幅，文字依它成為唯讀副本的原因（sync 的 SYNC-300.1、SYNC-301.1，sharing 的 SHARING-276.1）：不是成員是「You're no longer a member of this group. This copy is read-only and won't update.」；退出是「You left this group. This copy is read-only and won't update.」；授權失效是「This phone can't sync this group anymore. This copy is read-only and won't update.」。它有待上傳的事件時，橫幅下面多一行：一個時是「1 change made on this phone was never sent to the group.」，其他時候是「<個數> changes made on this phone were never sent to the group.」。這個畫面沒有「Restore Group」，封存的唯讀副本也沒有；也不顯示封存群組的那句提示（GROUPS-55.2）、等 app 更新和群組滿了的那兩句話（SYNC-75.1、SYNC-83.1）、需要確認的按鈕（GROUPS-107.2）和想加入的按鈕（GROUPS-130.1）。

#### Scenario: 被移除

- **WHEN** Brisbane 成為唯讀副本，原因是不是成員，沒有待上傳的事件；打開它的畫面
- **THEN** 由上而下是大標題「Brisbane」、「You're no longer a member of this group. This copy is read-only and won't update.」、「Delete Copy」按鈕（GROUPS-157.1）和支出的清單；沒有「Restore Group」，也沒有「Archived group. Expenses and allocations are read-only.」

#### Scenario: 退出和授權失效

- **WHEN** Brisbane 成為唯讀副本的原因是退出；或是授權失效
- **THEN** 橫幅分別是「You left this group. This copy is read-only and won't update.」和「This phone can't sync this group anymore. This copy is read-only and won't update.」

#### Scenario: 沒送出的變更

- **WHEN** Brisbane 成為唯讀副本時有一個待上傳的事件；或有三個
- **THEN** 橫幅下面分別是「1 change made on this phone was never sent to the group.」和「3 changes made on this phone were never sent to the group.」

#### Scenario: 封存的唯讀副本

- **WHEN** 封存唯讀副本 Brisbane 之後，從 Archived Groups 打開它的畫面
- **THEN** 畫面上是唯讀副本的橫幅，沒有「Archived group. Expenses and allocations are read-only.」，也沒有「Restore Group」

#### Scenario: 原本顯示的提示都不顯示

- **WHEN** Brisbane 成為唯讀副本之前在等 app 更新（SYNC-75.1），有一筆需要確認的支出和一個收到的申請
- **THEN** 它的畫面只有唯讀副本的橫幅，沒有那句話和那兩個按鈕

### Requirement: GROUPS-156.1 唯讀副本的畫面和 Members 只能看

WHILE 群組是唯讀副本，the mobile app SHALL 不管它有沒有封存，都照封存的群組顯示它的畫面和 Members：Group actions 依序是「Members」和「Categories」（GROUPS-22.3 裡封存的群組的那一種），畫面沒有「Add expense」按鈕（GROUPS-64.1），長按大標題不開啟 Rename Group；Members 照 GROUPS-56.1 只列出成員，成員列都不是按鈕、沒有「›」和「Joined」，沒有「Add Member」、「Invite with Link」和「Requests」那一區。它的支出和分類也只能看（ledger 的 LEDGER-220.1 到 LEDGER-222.1、categories 的 CATEGORIES-60.1）。

#### Scenario: Group actions

- **WHEN** 沒有封存的 Brisbane 成為唯讀副本；iOS 上打開它的畫面，或 Android 上按「Group actions」
- **THEN** iOS 的選單依序列出「Members」和「Categories」，沒有「Rename Group」；Android 的對話框按鈕是「Members」、「Categories」和「Cancel」

#### Scenario: 沒有 Add expense，也不能改名

- **WHEN** 打開唯讀副本 Brisbane 的畫面，長按大標題
- **THEN** 畫面上沒有「Add expense」按鈕；沒有開啟 Rename Group

#### Scenario: Members

- **WHEN** Brisbane 的成員是 Taylor、Casey、Blake 和有手機的 Dana，它成為唯讀副本之後打開 Members
- **THEN** 由上而下是「Taylor (You)」、「Casey」、「Blake」和「Dana」；Members 的內容裡沒有任何按鈕、「›」和「Joined」，沒有「Invite with Link」和「Add Member」；點任何一列都沒有跳出選單

### Requirement: GROUPS-157.1 唯讀副本的畫面有 Delete Copy，按了先確認

WHILE 群組是唯讀副本，the mobile app SHALL 在它的畫面的橫幅下面——有沒送出的變更那一行時，在那一行下面（GROUPS-155.1）——顯示角色為 button、名稱為「Delete Copy」的按鈕，封存的唯讀副本也有。WHEN 使用者按它，the mobile app SHALL 在改動本機資料之前跳出提示框：標題「Delete This Copy?」；訊息在它沒有待上傳的事件時是「This copy and its expenses will be deleted from this phone. This can't be undone.」，有一個時是「This copy and its expenses will be deleted from this phone, including 1 change that was never sent to the group. This can't be undone.」，其他時候是「This copy and its expenses will be deleted from this phone, including <個數> changes that were never sent to the group. This can't be undone.」；按鈕是「Cancel」和破壞性的「Delete」。按「Delete」才照 GROUPS-158.1 刪除；按「Cancel」關閉提示框，什麼都不做，Android 上按返回鍵或點提示框外面也一樣。不是唯讀副本的群組，畫面上沒有這個按鈕：app 只刪除唯讀副本，不刪除別的群組。

#### Scenario: 按 Delete Copy

- **WHEN** Brisbane 成為唯讀副本，沒有待上傳的事件；在它的畫面按「Delete Copy」
- **THEN** 跳出「Delete This Copy?」，訊息是「This copy and its expenses will be deleted from this phone. This can't be undone.」，按鈕是 Cancel 和破壞性的 Delete；本機資料還沒有任何改變

#### Scenario: 有沒送出的變更

- **WHEN** Brisbane 成為唯讀副本時有一個待上傳的事件；或有三個；按「Delete Copy」
- **THEN** 橫幅、那一行和「Delete Copy」由上而下排列；訊息分別是「This copy and its expenses will be deleted from this phone, including 1 change that was never sent to the group. This can't be undone.」和「This copy and its expenses will be deleted from this phone, including 3 changes that were never sent to the group. This can't be undone.」

#### Scenario: 按 Cancel

- **WHEN** 在這個提示框按「Cancel」
- **THEN** Brisbane 仍是唯讀副本，畫面不變，本機資料和按「Delete Copy」之前完全一樣

#### Scenario: 封存的唯讀副本

- **WHEN** 封存唯讀副本 Brisbane 之後，從 Archived Groups 打開它的畫面
- **THEN** 橫幅下面是「Delete Copy」按鈕

#### Scenario: 不是唯讀副本的群組

- **WHEN** 打開共同帳本 Tokyo 的畫面；或打開封存的、不是唯讀副本的群組的畫面
- **THEN** 畫面上都沒有「Delete Copy」

### Requirement: GROUPS-158.1 按 Delete 時把這份副本從這支手機刪掉

WHEN 使用者在「Delete This Copy?」按「Delete」，the mobile app SHALL 在一個 SQLite transaction 裡，從本機資料刪掉這個群組和本機資料替它存著的每一樣東西：它的成員和前成員；它的分類；它的支出，垃圾桶裡的也算；它的支出清單的排序和篩選條件（ledger）；它的同步資料，也就是每筆紀錄的值和時間戳記、刪除紀錄、待上傳的事件、不套用的事件留下的紀錄、名冊，和它是唯讀副本這件事（sync）；還有它的邀請（sharing）。刪除不發出任何網路請求，不寫事件。手機看過的最新時間戳記（SYNC-2.1）、這支手機的裝置身分和 secure store 的內容都不變；別的群組、個人的帳和這支手機送出的加入申請都不受影響。存好之後，SHALL 關閉這個群組的畫面：從 Groups 根畫面打開的，回到 Groups 根畫面；從 Archived Groups 打開的，回到 Archived Groups；那裡不再有它的卡片。它的支出不再出現在 Expenses 和 Trash。別的分頁上還開著它的畫面或它的支出的明細時，那些畫面照找不到群組和找不到支出的規則顯示（GROUPS-21.1、ledger 的 LEDGER-39.1）。

#### Scenario: 刪除

- **WHEN** 唯讀副本 Brisbane 有成員 Taylor、Casey 和 Blake，有支出 Lunch，垃圾桶裡有它的支出 Taxi；Tokyo 是共同帳本，另外有個人支出 Coffee；在 Brisbane 的畫面按「Delete Copy」，再按「Delete」
- **THEN** 回到 Groups 根畫面，上面只有 Tokyo 的卡片；Expenses 只列出 Coffee，Trash 沒有 Taxi；本機資料裡沒有任何一列帶著 Brisbane 的群組 ID、它的成員的成員 ID、它的分類的 ID 或它的支出的 ID；Tokyo、Coffee 和手機看過的最新時間戳記都和刪除之前一樣；API 沒有收到任何請求

#### Scenario: 沒送出的變更一起刪掉

- **WHEN** Brisbane 成為唯讀副本時有兩個待上傳的事件；刪除這份副本
- **THEN** 這支手機沒有待上傳的事件，之後的同步也不上傳它們

#### Scenario: 封存的唯讀副本

- **WHEN** 封存唯讀副本 Brisbane 之後，從 Archived Groups 打開它的畫面，按「Delete Copy」，再按「Delete」
- **THEN** 回到 Archived Groups，顯示「No archived groups.」

#### Scenario: 重新啟動之後

- **WHEN** 刪除唯讀副本 Brisbane 之後重新啟動 app
- **THEN** Groups 根畫面沒有 Brisbane 的卡片；API 沒有收到 Brisbane 的請求

#### Scenario: 別的分頁上開著它的支出

- **WHEN** Expenses 分頁上開著 Lunch 的明細；到 Groups 分頁打開唯讀副本 Brisbane 的畫面，刪除這份副本，再回到 Expenses 分頁
- **THEN** 明細只顯示「Expense not found.」

### Requirement: GROUPS-159.1 刪不掉時說明，副本還在

IF 刪除唯讀副本存不進本機資料，THEN the mobile app SHALL 跳出標題「Unable to Delete Copy」、內容「The copy could not be deleted. Please try again.」的提示框，本機資料和按「Delete」之前完全一樣，畫面不關閉，仍是唯讀副本的畫面。WHILE 刪除還沒存好，the mobile app SHALL 停用「Delete Copy」，到存好或失敗為止。

#### Scenario: 寫不進去

- **WHEN** 資料庫無法寫入時，在唯讀副本 Brisbane 的畫面按「Delete Copy」，再按「Delete」
- **THEN** 跳出這個提示框；畫面仍顯示唯讀副本的橫幅和「Delete Copy」；本機資料和之前完全一樣

#### Scenario: 之後再刪一次

- **WHEN** 資料庫又可以寫入之後，再按「Delete Copy」和「Delete」
- **THEN** 回到 Groups 根畫面，沒有 Brisbane 的卡片

#### Scenario: 還沒存好

- **WHEN** 按了「Delete」，還沒存好
- **THEN** 「Delete Copy」停用；存好之後回到 Groups 根畫面
