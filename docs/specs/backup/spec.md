# Backup

## Purpose

手動匯出入：把這支手機的全部資料存成一個檔案，以及用一個檔案的內容取代這支手機的資料。兩者都只讀寫手機上的東西，不連任何伺服器（ADR-0005）。入口是 Settings 根畫面 DATA 區塊的「Export Data」和「Import Data」兩列（SHELL-71.1）。

全部資料是本機資料（shell）裡的所有內容：個人和群組的支出連同它們的付款和分攤，垃圾桶裡的也算（ledger）；每個空間的分類，封存的也算（categories）；群組和成員，封存的群組和前成員也算（groups）；本機身分和它的名字、外觀選項（shell）和 Insights 的圖表類型（insights）；以及這份資料跑過的 migration 紀錄（ADR-0006）。匯出檔是 app 匯出時產生的檔案：一個 SQLite 資料庫檔，內容是全部資料在同一個時間點的複本，另外記著匯出時間，也就是產生它的那一刻（ADR-0020）。匯出檔的版本是它的 migration 紀錄：紀錄是 app 的 migration 清單開頭的一部分，就是比 app 舊；紀錄包含整份清單，後面還有 app 沒有的 migration，就是比 app 新。

分享畫面是系統用來把檔案存到別處或交給其他 app 的畫面。檔案選擇畫面是系統讓使用者選一個檔案的畫面，它交給 app 的是那個檔案的複本。暫存檔是 app 為了一次匯出或匯入寫在手機上、本機資料以外的檔案，包括交給分享畫面的匯出檔和檔案選擇畫面交來的複本。匯出正在進行，是從點「Export Data」到分享畫面關閉，或到跳出匯出失敗的提示框。匯入正在進行，是從點「Import Data」到下面其中一件事發生：使用者在檔案選擇畫面取消、跳出不能匯入的提示框、使用者在確認框按「Cancel」、匯入完成，或跳出匯入失敗的提示框。裝置所在的時區、手機地區的日期格式和手機的地區，都和 ledger 的定義一樣。

Scenario 裡「Taylor 的資料」是指：名字是「Taylor」，外觀選項是 Dark，Insights 的圖表類型是 Bar；群組 Brisbane 有成員 Taylor、Casey 和已經被移出的 Blake，另有封存的群組 Tokyo；個人空間多了分類「Gym」、封存了「Travel」，Brisbane 多了分類「Flights」；個人支出有 Coffee run 8.75 USD 和 Train 3.00 USD，Brisbane 有 Casey 付、三位成員分攤的 Dinner 100.01 USD，垃圾桶裡有個人支出 Lunch 12.00 USD。它有 2 個群組，不在垃圾桶裡的支出有 3 筆。

## Requirements

### Requirement: BACKUP-1.1 點 Export Data 時產生匯出檔並打開分享畫面

WHEN 使用者在 Settings 根畫面點「Export Data」，the mobile app SHALL 把這支手機的全部資料寫成一個匯出檔，再打開分享畫面分享這個檔案；本機資料不變。

#### Scenario: 匯出

- **WHEN** 手機上是 Taylor 的資料，點「Export Data」
- **THEN** 分享畫面打開，分享的是一個匯出檔；本機資料和點之前一樣

#### Scenario: 還沒記過任何東西

- **WHEN** 第一次打開 app 就點「Export Data」
- **THEN** 分享畫面打開，分享的是一個匯出檔

### Requirement: BACKUP-2.1 匯出檔的檔名

The mobile app SHALL 把匯出檔命名為「Expenses Backup」、匯出時間的日期 `YYYY-MM-DD`、24 小時制的時和分 `HHmm`，中間各隔一個空白，副檔名是 `.sqlite`；日期和時間是裝置所在時區的。

#### Scenario: 下午

- **WHEN** 裝置在台北，現在是 `2026-11-18T06:32:00Z`，點「Export Data」
- **THEN** 檔名是 `Expenses Backup 2026-11-18 1432.sqlite`

#### Scenario: 當地還是前一天

- **WHEN** 裝置在洛杉磯，現在是 `2026-11-19T06:05:00Z`，點「Export Data」
- **THEN** 檔名是 `Expenses Backup 2026-11-18 2205.sqlite`

#### Scenario: 午夜過後

- **WHEN** 裝置在台北，現在是 `2026-11-18T16:07:00Z`，點「Export Data」
- **THEN** 檔名是 `Expenses Backup 2026-11-19 0007.sqlite`

### Requirement: BACKUP-3.1 匯出檔裡有全部資料

The mobile app SHALL 讓匯出檔是一個 SQLite 資料庫檔，本機資料的每一張表都在裡面，每一張表的每一列、每一欄都和本機資料一樣，migration 紀錄也在裡面（ADR-0020）。

#### Scenario: Taylor 的資料

- **WHEN** 手機上是 Taylor 的資料，點「Export Data」
- **THEN** 匯出檔裡有本機資料的每一張表，內容和本機資料完全一樣：四筆支出（垃圾桶裡的 Lunch 也在）和它們的付款、分攤，三個空間的分類（封存的 Travel 也在），Brisbane 和封存的 Tokyo，Brisbane 的三位成員（被移出的 Blake 也在），本機身分的三個 ID、名字「Taylor」、外觀選項 Dark、圖表類型 Bar，以及 migration 紀錄

#### Scenario: 還沒記過任何東西

- **WHEN** 第一次打開 app 就點「Export Data」
- **THEN** 匯出檔裡有本機身分、個人空間的預設分類和 migration 紀錄，和本機資料完全一樣

### Requirement: BACKUP-4.1 匯出檔是同一個時間點的資料

The mobile app SHALL 讓匯出檔的內容是本機資料在同一個時間點的樣子：匯出途中存進本機資料的一次修改，在匯出檔裡不是整個都在，就是整個都不在。

#### Scenario: 匯出途中存下一筆群組支出

- **WHEN** 匯出正在讀本機資料時，Brisbane 存下一筆 Casey 付、Taylor 和 Casey 分攤的 Taxi 30.00 USD
- **THEN** 匯出檔裡不是有 Taxi 連同它的一筆付款和兩筆分攤，就是完全沒有 Taxi、也沒有它的付款和分攤；不管這次修改落在匯出的哪一步之前都一樣

### Requirement: BACKUP-5.1 沒有網路時照常匯出

WHILE 手機沒有網路，the mobile app SHALL 照常匯出，過程中不發出任何網路請求。

#### Scenario: 沒有網路

- **WHEN** 手機沒有網路，手機上是 Taylor 的資料，點「Export Data」
- **THEN** 分享畫面打開，匯出檔的內容和本機資料完全一樣；app 沒有發出任何網路請求

### Requirement: BACKUP-6.1 分享畫面關閉後刪掉暫存檔

WHEN 分享畫面關閉，不論使用者分享了檔案還是取消，the mobile app SHALL 刪掉這次匯出的暫存檔，不顯示任何提示。

#### Scenario: 分享了檔案

- **WHEN** 點「Export Data」，在分享畫面把檔案存到別處
- **THEN** 手機上沒有留下暫存檔，沒有提示框

#### Scenario: 取消分享

- **WHEN** 點「Export Data」，在分享畫面取消
- **THEN** 手機上沒有留下暫存檔，沒有提示框

#### Scenario: 分享畫面還開著

- **WHEN** 點「Export Data」，分享畫面還開著
- **THEN** 交給分享畫面的檔案還在，別的 app 讀得到它

### Requirement: BACKUP-7.1 匯出失敗時提示，不留下暫存檔

IF 匯出檔寫不出來，或分享畫面打不開，THEN the mobile app SHALL 跳出標題「Unable to Export Data」、內容「Your data could not be exported. Please try again.」的提示框，並刪掉這次匯出的暫存檔；本機資料不變。

#### Scenario: 手機沒有空間

- **WHEN** 手機沒有空間寫暫存檔時點「Export Data」
- **THEN** 跳出這個提示框，分享畫面沒有打開，手機上沒有留下暫存檔，本機資料和點之前一樣

#### Scenario: 分享畫面打不開

- **WHEN** 匯出檔寫好了，但分享畫面打不開
- **THEN** 跳出這個提示框，手機上沒有留下暫存檔

#### Scenario: 再試一次

- **WHEN** 匯出失敗之後手機恢復正常，再點一次「Export Data」
- **THEN** 分享畫面打開，分享的是一個匯出檔

### Requirement: BACKUP-8.1 匯出中鎖住 DATA 區塊

WHILE 匯出正在進行，the mobile app SHALL 讓「Export Data」和「Import Data」兩列停用，所以點兩次只匯出一次。

#### Scenario: 分享畫面還開著

- **WHEN** 點「Export Data」，分享畫面還開著
- **THEN** 「Export Data」和「Import Data」都是停用的；分享畫面關閉之後，兩列恢復可以點

#### Scenario: 連點兩次

- **WHEN** 連點兩次「Export Data」
- **THEN** 只打開一次分享畫面，只寫了一個匯出檔

#### Scenario: 匯出失敗之後

- **WHEN** 匯出失敗，跳出「Unable to Export Data」
- **THEN** 兩列恢復可以點

### Requirement: BACKUP-9.1 (manual) 匯出檔裡沒有私鑰和群組鑰匙

The mobile app SHALL 不把這支手機的私鑰和任何一把群組鑰匙放進匯出檔；它們只存在 `expo-secure-store`（ADR-0015），匯出檔裡只有本機資料的內容和匯出時間。

#### Scenario: 已經加入共同帳本的手機

- **WHEN** 手機有裝置身分，也加入了共同帳本，點「Export Data」
- **THEN** 在匯出檔的位元組裡找不到這支手機的種子和任何一把群組鑰匙，不論是原始位元組、十六進位還是 Base64

### Requirement: BACKUP-10.1 點 Import Data 時打開檔案選擇畫面

WHEN 使用者在 Settings 根畫面點「Import Data」，the mobile app SHALL 打開檔案選擇畫面，讓使用者選任何一個檔案；使用者取消時 SHALL 什麼都不做。

#### Scenario: 打開

- **WHEN** 點「Import Data」
- **THEN** 檔案選擇畫面打開，還沒有任何提示框

#### Scenario: 取消

- **WHEN** 點「Import Data」，在檔案選擇畫面取消
- **THEN** 沒有提示框，本機資料和點之前一樣，停在 Settings 根畫面

### Requirement: BACKUP-11.1 寫入之前顯示摘要並確認

WHEN 使用者選了一個可以匯入的匯出檔，the mobile app SHALL 在寫入任何資料之前跳出確認框：標題「Replace All Data?」，內容「This file was exported on <匯出時間> and has <群組數> and <支出數>. Importing it replaces all the data on this phone. This cannot be undone.」，選項是「Cancel」和破壞性的「Replace」。匯出時間是手機地區的日期格式（LEDGER-30.2）的日期、「at」、和英文加手機的地區所用的短時間格式的時和分，手機回報不出地區或平台沒有這個地區的英文格式時只用英文，都以裝置所在的時區顯示；群組數是匯出檔裡的群組有幾個，封存的也算，寫成「1 group」或「2 groups」；支出數是匯出檔裡個人和群組的支出有幾筆，垃圾桶裡的不算，寫成「1 expense」或「2 expenses」，0 也用複數。

#### Scenario: Taylor 的資料

- **WHEN** 手機第一個偏好的語言和地區是英文（美國），裝置在台北；選了 `2026-11-18T06:32:00Z` 匯出的 Taylor 的資料
- **THEN** 跳出「Replace All Data?」，內容是「This file was exported on Nov 18, 2026 at 2:32 PM and has 2 groups and 3 expenses. Importing it replaces all the data on this phone. This cannot be undone.」，選項是 Cancel 和破壞性的 Replace；本機資料還沒有任何改變

#### Scenario: 手機的語言不是英文

- **WHEN** 手機第一個偏好的語言和地區是繁體中文（澳洲），裝置在台北，選了同一個匯出檔
- **THEN** 內容裡的匯出時間是「18 Nov 2026 at 2:32 pm」

#### Scenario: 裝置在別的時區

- **WHEN** 手機是英文（美國），裝置在洛杉磯，選了同一個匯出檔
- **THEN** 內容裡的匯出時間是「Nov 17, 2026 at 10:32 PM」

#### Scenario: 一個群組和一筆支出

- **WHEN** 匯出檔裡只有一個群組和一筆不在垃圾桶裡的支出
- **THEN** 內容寫的是「has 1 group and 1 expense」

#### Scenario: 沒有群組也沒有支出

- **WHEN** 匯出檔是第一次打開 app 就匯出的
- **THEN** 內容寫的是「has 0 groups and 0 expenses」

### Requirement: BACKUP-12.1 按 Cancel 時不匯入

WHEN 使用者在確認框按「Cancel」，the mobile app SHALL 不寫入任何資料，本機資料和畫面都不變。

#### Scenario: 取消

- **WHEN** 手機上有名字「Sam」和個人支出 Bus，選了 Taylor 的資料的匯出檔，在確認框按「Cancel」
- **THEN** 本機資料和選檔案之前一樣，仍停在 Settings 根畫面，名字欄位仍是「Sam」，沒有再跳出提示框

### Requirement: BACKUP-13.1 按 Replace 時用匯出檔的內容取代全部資料

WHEN 使用者在確認框按「Replace」，the mobile app SHALL 在一個 transaction 裡把本機資料的全部內容換成匯出檔的內容：換完之後，本機資料的每一張表都和匯出時的本機資料一樣，原本在這支手機上、匯出檔裡沒有的資料都不在了，本機身分也是匯出檔裡的那一個。

#### Scenario: 新手機

- **WHEN** 在一支第一次打開 app 的手機上，選了 Taylor 的資料的匯出檔並按「Replace」
- **THEN** 這支手機的本機資料和 Taylor 的手機匯出時完全一樣，本機身分的三個 ID 也一樣；原本新手機自己的本機身分和預設分類都不在了

#### Scenario: 手機上原本有資料

- **WHEN** 手機上有名字「Sam」、群組 Osaka、個人支出 Bus 和垃圾桶裡的 Tea，選了 Taylor 的資料的匯出檔並按「Replace」
- **THEN** 本機資料和 Taylor 的手機匯出時完全一樣，沒有 Sam、Osaka、Bus 和 Tea

#### Scenario: 匯出之後又改了資料

- **WHEN** Taylor 的手機匯出之後，又新增支出 Taxi、把 Brisbane 改名為「Sydney」，再選自己匯出的檔案並按「Replace」
- **THEN** 本機資料回到匯出時的樣子：沒有 Taxi，群組叫 Brisbane

#### Scenario: 同一個檔案匯入兩次

- **WHEN** 匯入 Taylor 的資料的匯出檔之後，再匯入同一個檔案一次
- **THEN** 本機資料和第一次匯入之後完全一樣

#### Scenario: 匯入之後再匯出

- **WHEN** 新手機匯入 Taylor 的資料的匯出檔之後，點「Export Data」
- **THEN** 新的匯出檔裡，本機資料的每一張表都和原本的匯出檔一樣

### Requirement: BACKUP-14.1 匯入完成後回到 app 載入後的樣子，顯示匯入的資料

WHEN 匯入完成，the mobile app SHALL 不必重新啟動就回到 app 載入後的樣子（SHELL-6.1）：選中 Expenses 分頁，每個分頁只剩根畫面，沒有蓋在上面的表單；每個畫面顯示的都是匯入的資料，app 用的本機身分、名字、外觀和 Insights 的圖表類型也立即是匯入的；不顯示完成的提示。

#### Scenario: 匯入 Taylor 的資料

- **WHEN** 在名字是「Sam」、有個人支出 Bus 的手機上，從 Settings 匯入 Taylor 的資料的匯出檔
- **THEN** 選中的是 Expenses 分頁，支出清單有 Coffee run、Train 和 Dinner，沒有 Bus；Groups 分頁列出 Brisbane；Settings 根畫面的名字欄位是「Taylor」，Archived Groups 是「1」，Trash 是「1」；確認框之後沒有再跳出任何提示框

#### Scenario: 本機身分

- **WHEN** 匯入完成
- **THEN** app 裡讀取本機身分的地方，立即拿到匯出檔裡的三個 ID 和名字「Taylor」，圖表類型是 Bar

#### Scenario: 外觀

- **WHEN** 手機是淺色模式、外觀選項是 System，匯入外觀選項是 Dark 的 Taylor 的資料
- **THEN** app 立即變成深色，app 用的外觀選項是 Dark

#### Scenario: 匯入前推入了別的畫面

- **WHEN** 匯入前在 Groups 分頁打開了群組 Osaka 的畫面，再到 Settings 匯入 Taylor 的資料
- **THEN** Groups 分頁只剩根畫面，列出 Brisbane

### Requirement: BACKUP-15.1 不能用的檔案不寫入

IF 使用者選的檔案不能用，THEN the mobile app SHALL 不寫入任何資料，本機資料和畫面都不變，並跳出標題「Unable to Import Data」、內容「This file is damaged or was not exported by this app. Your data was not changed.」的提示框。檔案不能用，是指它符合下面任何一項：不是 SQLite 資料庫檔；不完整或損壞；沒有 migration 紀錄，或它的 migration 紀錄和 app 的 migration 清單開頭對不上；裡面有 BACKUP-24.1 不允許的東西；沒有匯出時間；內容違反 BACKUP-16.1 的規則。開發版也一樣，不會因為 migration 對不上就刪掉本機資料（SHELL-5.1）。

#### Scenario: 不是資料庫

- **WHEN** 選了一個空檔案、一個純文字檔，或一張照片
- **THEN** 跳出這個提示框，本機資料和選檔案之前一樣，沒有確認框

#### Scenario: 只有前半

- **WHEN** 選了一個只剩前半的匯出檔
- **THEN** 跳出這個提示框，本機資料不變

#### Scenario: 中間壞了

- **WHEN** 選了一個中間一段位元組被蓋掉的匯出檔
- **THEN** 跳出這個提示框，本機資料不變

#### Scenario: 別的資料庫

- **WHEN** 選了一個別的程式做的 SQLite 資料庫檔，或一個 migration 紀錄的內容和 app 的不同的資料庫檔
- **THEN** 跳出這個提示框，本機資料不變

#### Scenario: 沒有匯出時間

- **WHEN** 選了一個直接從手機複製出來的本機資料庫檔，它的 migration 紀錄和 app 的一樣，但沒有匯出時間
- **THEN** 跳出這個提示框，本機資料不變

#### Scenario: 開發版

- **WHEN** 在開發版選了一個 migration 紀錄對不上的資料庫檔
- **THEN** 跳出這個提示框，本機資料不變

### Requirement: BACKUP-24.1 匯出檔裡只能有預期的表和索引

IF 使用者選的資料庫檔裡，除了 app 的 migration 建出來的表和索引、以及匯出檔記匯出時間的那一張表之外還有別的東西，或其中一張表、一個索引的定義和 migration 建出來的不一樣，THEN the mobile app SHALL 照 BACKUP-15.1 不寫入並提示。別的東西是指任何 view、任何 trigger、多出來的表和多出來的索引；定義包括欄位、型別、預設值和限制。版本比 app 舊的匯出檔，view 和 trigger 在升級之前就不能有，表和索引是拿升級之後的和 migration 建出來的比（BACKUP-18.1）。

#### Scenario: 多了一個 trigger

- **WHEN** 選了一個匯出檔，它的資料和 migration 紀錄都沒有問題，但多了一個會在寫入 expenses 時刪掉所有分類的 trigger
- **THEN** 跳出「Unable to Import Data」，沒有確認框，本機資料不變

#### Scenario: 有 view

- **WHEN** 選了一個多了一個 view 的匯出檔；或一個有一張表被換成同名 view 的匯出檔
- **THEN** 跳出「Unable to Import Data」，本機資料不變

#### Scenario: 多了一張表或一個索引

- **WHEN** 選了一個多了一張表 `notes` 的匯出檔；或一個在 expenses 上多了一個索引的匯出檔
- **THEN** 跳出「Unable to Import Data」，本機資料不變

#### Scenario: 表的定義不一樣

- **WHEN** 選了一個匯出檔，它的 expenses 少了 `note` 欄位，或多了一個欄位；或它的 groups 沒有了 `archived` 只能是 0 或 1 的限制
- **THEN** 跳出「Unable to Import Data」，本機資料不變

#### Scenario: 比 app 舊的匯出檔

- **WHEN** 選了一個版本比 app 舊、多了一個 trigger 的匯出檔
- **THEN** 跳出「Unable to Import Data」，本機資料不變

### Requirement: BACKUP-16.1 內容違反規則的匯出檔不寫入

IF 匯出檔的內容違反規則，THEN the mobile app SHALL 照 BACKUP-15.1 不寫入並提示。規則是：資料庫自己的限制都成立，也就是每張表的 CHECK、NOT NULL、UNIQUE、主鍵和 foreign key；有本機身分；每筆支出的付款加總和分攤加總都等於它的金額；每筆支出的幣別是支援的幣別（LEDGER-1.1）；每筆支出的日期是有效的支出日期（LEDGER-9.1）。

#### Scenario: 分攤加起來不等於金額

- **WHEN** 匯出檔裡 Dinner 的金額是 10001，分攤被改成 3334、3333、3333
- **THEN** 跳出「Unable to Import Data」，本機資料不變

#### Scenario: 付款加起來不等於金額

- **WHEN** 匯出檔裡 Dinner 的金額是 10001，Casey 的付款被改成 10002
- **THEN** 跳出「Unable to Import Data」，本機資料不變

#### Scenario: 沒有分攤

- **WHEN** 匯出檔裡 Coffee run 的分攤都被刪掉
- **THEN** 跳出「Unable to Import Data」，本機資料不變

#### Scenario: 幣別不支援

- **WHEN** 匯出檔裡 Coffee run 的幣別被改成 `XYZ`
- **THEN** 跳出「Unable to Import Data」，本機資料不變

#### Scenario: 日期無效

- **WHEN** 匯出檔裡 Coffee run 的日期被改成 `2025-02-30`
- **THEN** 跳出「Unable to Import Data」，本機資料不變

#### Scenario: 違反資料庫的限制

- **WHEN** 匯出檔裡 Coffee run 的金額被改成 0；或它的分類被改成一個不存在的分類；或有一位成員屬於一個不存在的群組
- **THEN** 跳出「Unable to Import Data」，本機資料不變

#### Scenario: 沒有本機身分

- **WHEN** 匯出檔裡的本機身分被刪掉
- **THEN** 跳出「Unable to Import Data」，本機資料不變

### Requirement: BACKUP-17.1 比 app 新的匯出檔不寫入，請使用者更新 app

IF 匯出檔的版本比 app 新，THEN the mobile app SHALL 不寫入任何資料，本機資料和畫面都不變，並跳出標題「Unable to Import Data」、內容「This file was exported by a newer version of the app. Update the app, then try again. Your data was not changed.」的提示框；開發版也一樣。

#### Scenario: 新版 app 的匯出檔

- **WHEN** 選了一個多跑了一個 migration 的 app 所匯出的匯出檔
- **THEN** 跳出這個提示框，沒有確認框，本機資料和選檔案之前一樣

#### Scenario: 開發版

- **WHEN** 在開發版選了同一個匯出檔
- **THEN** 跳出這個提示框，本機資料不變

### Requirement: BACKUP-18.1 比 app 舊的匯出檔升級之後匯入

WHEN 使用者選了一個版本比 app 舊的匯出檔，the mobile app SHALL 先在它的複本上跑它還沒跑過的 migration（ADR-0006），再把升級後的內容當成匯出檔，照 BACKUP-11.1 到 BACKUP-16.1 處理；確認框和同一個版本的匯出檔一樣，不另外說明它是舊版的。

#### Scenario: 還沒有圖表類型的 app 所匯出的檔案

- **WHEN** 選了一個少跑了最後一個 migration 的 app 所匯出的 Taylor 的資料，那時還沒有 Insights 的圖表類型
- **THEN** 跳出「Replace All Data?」，內容寫的是「has 2 groups and 3 expenses」；按「Replace」之後，支出、分類、群組、成員、本機身分、名字和外觀選項都和匯出時一樣，圖表類型是 Auto，本機資料的 migration 紀錄和 app 的 migration 清單一樣

#### Scenario: 升級後違反規則

- **WHEN** 選了一個比 app 舊的匯出檔，裡面 Dinner 的分攤加起來不等於金額
- **THEN** 跳出「Unable to Import Data」，本機資料不變

### Requirement: BACKUP-19.1 沒有網路時照常匯入

WHILE 手機沒有網路，the mobile app SHALL 照常匯入，過程中不發出任何網路請求。

#### Scenario: 沒有網路

- **WHEN** 手機沒有網路，在新手機上選了 Taylor 的資料的匯出檔並按「Replace」
- **THEN** 本機資料和 Taylor 的手機匯出時完全一樣；app 沒有發出任何網路請求

### Requirement: BACKUP-20.1 寫入失敗時本機資料不變

IF 按「Replace」之後寫入失敗，THEN the mobile app SHALL 讓本機資料維持匯入前的樣子，一點都不留下匯出檔的內容，畫面也不變，並跳出標題「Unable to Import Data」、內容「Your data could not be imported. Your data was not changed.」的提示框。

#### Scenario: 寫到一半失敗

- **WHEN** 手機上有名字「Sam」和個人支出 Bus，選了 Taylor 的資料的匯出檔並按「Replace」，寫入在開頭、中途或最後一步失敗
- **THEN** 跳出這個提示框；本機資料和匯入之前完全一樣，仍停在 Settings 根畫面，名字欄位仍是「Sam」

#### Scenario: 再試一次

- **WHEN** 寫入失敗之後手機恢復正常，再選同一個匯出檔並按「Replace」
- **THEN** 本機資料和 Taylor 的手機匯出時完全一樣

### Requirement: BACKUP-21.1 匯入結束後刪掉暫存檔

WHEN 匯入不再進行，不論是使用者取消、檔案不能匯入、匯入完成還是寫入失敗，the mobile app SHALL 刪掉這次匯入的暫存檔。

#### Scenario: 匯入完成

- **WHEN** 選了 Taylor 的資料的匯出檔並按「Replace」，匯入完成
- **THEN** 手機上沒有留下暫存檔

#### Scenario: 沒有匯入

- **WHEN** 在確認框按「Cancel」；或選了不能用的檔案；或選了比 app 新的匯出檔；或寫入失敗
- **THEN** 手機上沒有留下暫存檔

### Requirement: BACKUP-22.1 匯入中鎖住 DATA 區塊

WHILE 匯入正在進行，the mobile app SHALL 讓「Export Data」和「Import Data」兩列停用，所以點兩次只打開一次檔案選擇畫面。

#### Scenario: 檔案選擇畫面還開著

- **WHEN** 點「Import Data」，檔案選擇畫面還開著
- **THEN** 「Export Data」和「Import Data」都是停用的

#### Scenario: 連點兩次

- **WHEN** 連點兩次「Import Data」
- **THEN** 只打開一次檔案選擇畫面

#### Scenario: 確認框還開著

- **WHEN** 選了可以匯入的匯出檔，確認框還開著
- **THEN** 兩列都是停用的；按「Cancel」之後，兩列恢復可以點

#### Scenario: 不能匯入之後

- **WHEN** 在檔案選擇畫面取消，或跳出「Unable to Import Data」
- **THEN** 兩列恢復可以點

### Requirement: BACKUP-23.1 (manual) 在手機上匯出，再匯入另一支手機

WHERE iPhone 或 Android 手機，the mobile app SHALL 讓使用者從分享畫面把匯出檔存到手機上的檔案、雲端硬碟，或交給別的 app，並在另一支手機上、或清除 app 的資料之後，從檔案選擇畫面選這個檔案匯入；匯入之後每個畫面都和匯出時一樣。

#### Scenario: iPhone

- **WHEN** 在 iPhone 上記了個人和群組的支出、封存了一個群組、把一筆支出移到垃圾桶、改了名字和外觀，點「Export Data」，在分享畫面選「Save to Files」；刪掉 app 再重新安裝，點「Import Data」，選剛才的檔案並按「Replace」
- **THEN** 支出清單、群組、Archived Groups、Trash、分類、名字和外觀都和匯出時一樣

#### Scenario: Android

- **WHEN** 在 Android 手機上做同樣的事，從分享畫面把匯出檔存到雲端硬碟或手機上的檔案；清除 app 的資料，點「Import Data」，選剛才的檔案並按「Replace」
- **THEN** 每個畫面都和匯出時一樣

#### Scenario: 交給別的 app

- **WHEN** 從分享畫面用 AirDrop、郵件或訊息把匯出檔傳到另一支手機，在那支手機上把它存成檔案，再點「Import Data」選它
- **THEN** 跳出「Replace All Data?」，按「Replace」之後每個畫面都和匯出時一樣

#### Scenario: 飛航模式

- **WHEN** 手機開著飛航模式，匯出到手機上的檔案，再匯入
- **THEN** 兩者都照常完成
