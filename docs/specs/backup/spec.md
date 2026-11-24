# Backup

## Purpose

手動匯出入：把這支手機的全部資料存成一個檔案，以及用一個檔案的內容取代這支手機的資料。兩者都只讀寫手機上的東西，不連任何伺服器（ADR-0005）。入口是 Settings 根畫面 DATA 區塊的「Export Data」和「Import Data」兩列（SHELL-71.1）。

全部資料是本機資料（shell）裡的所有內容：個人和群組的支出連同它們的付款、分攤和最後修改時間，垃圾桶裡的也算，以及支出清單和每個群組的畫面的排序、篩選和存起來的篩選（ledger）；每個空間的分類，封存的也算（categories）；群組和成員，封存的群組和前成員也算（groups）；本機身分和它的名字、外觀選項（shell）和 Insights 的圖表類型（insights）；以及這份資料跑過的 migration 紀錄（ADR-0006）。匯出檔是 app 匯出時產生的檔案：一個 SQLite 資料庫檔，內容是全部資料在同一個時間點的複本，另外記著匯出時間，也就是產生它的那一刻（ADR-0020）。匯出檔的版本是它的 migration 紀錄：紀錄是 app 的 migration 清單開頭的一部分，就是比 app 舊；紀錄包含整份清單，後面還有 app 沒有的 migration，就是比 app 新。

分享畫面是系統用來把檔案存到別處或交給其他 app 的畫面。檔案選擇畫面是系統讓使用者選一個檔案的畫面，它交給 app 的是那個檔案的複本。暫存檔是 app 為了一次匯出或匯入寫在手機上、本機資料以外的檔案，包括交給分享畫面的匯出檔和檔案選擇畫面交來的複本。匯出的暫存檔在分享畫面關閉之後還留著，到 app 下一次啟動或下一次匯出時才刪（BACKUP-25.1）。匯出正在進行，是從點「Export Data」到分享畫面關閉，或到跳出匯出失敗的提示框。匯入正在進行，是從點「Import Data」到下面其中一件事發生：使用者在檔案選擇畫面取消、跳出不能匯入的提示框、使用者在確認框按「Cancel」、匯入完成，或跳出匯入失敗的提示框。裝置所在的時區、手機地區的日期格式和手機的地區，都和 ledger 的定義一樣。

Scenario 裡「Taylor 的資料」是指：名字是「Taylor」，外觀選項是 Dark，Insights 的圖表類型是 Bar；群組 Brisbane 有成員 Taylor、Casey 和已經被移出的 Blake，另有封存的群組 Tokyo；個人空間多了分類「Gym」、封存了「Travel」，Brisbane 多了分類「Flights」；個人支出有 Coffee run 8.75 USD 和 Train 3.00 USD，Brisbane 有 Casey 付、三位成員分攤的 Dinner 100.01 USD，垃圾桶裡有個人支出 Lunch 12.00 USD。它有 2 個群組，不在垃圾桶裡的支出有 3 筆。

全部資料也包括裝置身分的紀錄（SHARING-46.1）和共同帳本的同步資料（sync）。共同帳本、紀錄、單位、時間戳記、刪除紀錄、手機看過的最新時間戳記、待上傳的事件、套用，以及不套用的事件留下的紀錄，都和 sync 的定義一樣。同步資料是本機資料替同步記著的東西：哪些群組是共同帳本和這支手機在裡面用的裝置 ID、每筆紀錄每個單位的值和時間戳記、刪除紀錄、手機看過的最新時間戳記、待上傳的事件，以及不套用的事件留下的紀錄。匯出檔裡的共同帳本，是匯出檔的同步資料記成共同帳本的群組。匯入之後這支手機的同步資料回到匯出那一刻，只有手機看過的最新時間戳記不倒退（BACKUP-13.3、BACKUP-27.1、ADR-0025）。

唯讀副本和授權失效都和 sync、sharing 的定義一樣。這支手機在一個共同帳本裡，是指那個共同帳本在這支手機上不是唯讀副本：API 還把這支手機當成它的成員手機。匯入有兩處要看共同帳本（ADR-0042）：這支手機在裡面的共同帳本，匯入之後會不見時，不讓它匯入（BACKUP-28.1）；匯入之後這支手機授權失效時，匯出檔裡的共同帳本成為唯讀副本（BACKUP-29.1）。兩處都只看本機資料、匯出檔和 secure store，不連任何伺服器。

有共同帳本的 Scenario 裡，T 是 `2026-11-18T06:32:00Z` 的毫秒數；Taylor 的手機的裝置 ID 是 `phone-a`，別支手機是 `phone-b`；Brisbane 是 Taylor 建立、依序加入 Casey 和 Blake 的群組，在校正後的時間 T 變成共同帳本，Tokyo 是另一個群組，不是共同帳本；時間戳記的寫法和 sync 一樣，例如 `T+60000/0/phone-a`。Lunch 是 `phone-b` 新增的 Brisbane 的支出，3000 USD，除非另外說明，Casey 付款、Taylor 和 Casey 各分攤 1500，收到時間是它的時間戳記的毫秒。

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

### Requirement: BACKUP-6.1 分享畫面關閉後不提示，暫存檔先留著

WHEN 分享畫面關閉，不論使用者分享了檔案還是取消，the mobile app SHALL 不顯示任何提示，也不刪這次匯出的暫存檔，因為分享畫面關閉時，接手的 app 可能還沒讀完檔案；它留到 BACKUP-25.1 的時候才刪。

#### Scenario: 分享畫面還開著

- **WHEN** 點「Export Data」，分享畫面還開著
- **THEN** 交給分享畫面的檔案還在，別的 app 讀得到它

#### Scenario: 分享畫面關閉之後

- **WHEN** 點「Export Data」，在分享畫面把檔案交給別的 app，或取消，分享畫面關閉
- **THEN** 沒有提示框；交給分享畫面的檔案還在，內容沒有變

### Requirement: BACKUP-25.1 啟動時和下一次匯出時刪掉之前的暫存檔

WHEN app 啟動，或使用者點「Export Data」，the mobile app SHALL 先刪掉之前的匯出和匯入留在手機上的暫存檔，所以手機上最多只有一次匯出的暫存檔；刪不掉時照常啟動、照常匯出，不顯示提示。

#### Scenario: 再匯出一次

- **WHEN** 匯出一次，分享畫面關閉之後再點「Export Data」
- **THEN** 手機上只有第二次匯出的暫存檔

#### Scenario: 重新啟動

- **WHEN** 匯出之後關掉 app，再打開
- **THEN** 手機上沒有暫存檔

#### Scenario: 分享到一半 app 被結束

- **WHEN** 分享畫面還開著時 app 被系統結束，再打開 app
- **THEN** 手機上沒有暫存檔

#### Scenario: 匯入到一半 app 被結束

- **WHEN** 檔案選擇畫面交來的複本還在手機上時 app 被系統結束，再打開 app
- **THEN** 手機上沒有暫存檔

#### Scenario: 刪不掉

- **WHEN** 之前的暫存檔刪不掉時打開 app，再點「Export Data」
- **THEN** app 照常顯示畫面，分享畫面照常打開，沒有提示框

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

WHEN 使用者在 Settings 根畫面點「Import Data」，the mobile app SHALL 打開檔案選擇畫面，讓使用者選任何一個檔案，使用者取消時什麼都不做。

#### Scenario: 打開

- **WHEN** 點「Import Data」
- **THEN** 檔案選擇畫面打開，還沒有任何提示框

#### Scenario: 取消

- **WHEN** 點「Import Data」，在檔案選擇畫面取消
- **THEN** 沒有提示框，本機資料和點之前一樣，停在 Settings 根畫面

### Requirement: BACKUP-26.1 檔案選擇畫面打不開或交不出檔案時提示

IF 使用者點「Import Data」之後檔案選擇畫面打不開，或它交不出使用者所選檔案的複本，THEN the mobile app SHALL 不寫入任何資料，本機資料和畫面都不變，並跳出標題「Unable to Import Data」、內容「Your data could not be imported. Your data was not changed.」的提示框。

#### Scenario: 打不開

- **WHEN** 點「Import Data」，檔案選擇畫面打不開
- **THEN** 跳出這個提示框；本機資料和點之前一樣，停在 Settings 根畫面，「Export Data」和「Import Data」恢復可以點

#### Scenario: 交不出複本

- **WHEN** 點「Import Data」並選了 Taylor 的資料的匯出檔，但檔案選擇畫面交不出它的複本，例如手機沒有空間放複本
- **THEN** 跳出這個提示框，沒有確認框，本機資料不變

#### Scenario: 再試一次

- **WHEN** 檔案選擇畫面恢復正常之後，再點「Import Data」並選同一個匯出檔
- **THEN** 跳出「Replace All Data?」

### Requirement: BACKUP-11.2 寫入之前顯示摘要並確認

WHEN 使用者選了一個可以匯入的匯出檔，而它沒有被 BACKUP-28.1 擋下，the mobile app SHALL 在寫入任何資料之前跳出確認框：標題「Replace All Data?」，內容「This file was exported on <匯出時間> and has <群組數> and <支出數>. Importing it replaces all the data on this phone. This cannot be undone.」，選項是「Cancel」和破壞性的「Replace」。匯出時間是手機地區的日期格式（LEDGER-30.2）的日期、「at」、和英文加手機的地區所用的短時間格式的時和分，手機回報不出地區或平台沒有這個地區的英文格式時只用英文，都以裝置所在的時區顯示；群組數是匯出檔裡的群組有幾個，封存的也算，寫成「1 group」或「2 groups」；支出數是匯出檔裡個人和群組的支出有幾筆，垃圾桶裡的不算，寫成「1 expense」或「2 expenses」，0 也用複數。IF 匯入會讓這支手機還沒送出的變更不見，THEN the mobile app SHALL 在內容後面空一行，再接一段：不見的是一個時，「1 change in your shared groups hasn't been sent yet and will be lost. To send it first, tap Cancel, connect to the internet, and open the app again.」；其他時候，「<個數> changes in your shared groups haven't been sent yet and will be lost. To send them first, tap Cancel, connect to the internet, and open the app again.」。會不見的，是這支手機在裡面的共同帳本的待上傳事件裡，事件 ID 不是匯出檔的待上傳事件的那些：匯出檔裡的那些跟著匯入回來，之後照常上傳（BACKUP-13.3）；唯讀副本的待上傳事件本來就送不出去，不算。匯入不替使用者同步：它不連任何伺服器。

#### Scenario: Taylor 的資料

- **WHEN** 手機第一個偏好的語言和地區是英文（美國），裝置在台北；選了 `2026-11-18T06:32:00Z` 匯出的 Taylor 的資料
- **THEN** 跳出「Replace All Data?」，內容是「This file was exported on Nov 18, 2026 at 2:32 PM and has 2 groups and 3 expenses. Importing it replaces all the data on this phone. This cannot be undone.」，選項是 Cancel 和破壞性的 Replace；本機資料還沒有任何改變

#### Scenario: 手機的語言不是英文

- **WHEN** 手機第一個偏好的語言和地區是繁體中文（澳洲），裝置在台北，選了同一個匯出檔
- **THEN** 內容裡的匯出時間是「18 Nov 2026 at 2:32 pm」

#### Scenario: 手機回報不出地區

- **WHEN** 手機第一個偏好的語言是日文，沒有地區，裝置在台北，選了同一個匯出檔
- **THEN** 內容裡的匯出時間是「Nov 18, 2026 at 2:32 PM」，不是日文的寫法

#### Scenario: 裝置在別的時區

- **WHEN** 手機是英文（美國），裝置在洛杉磯，選了同一個匯出檔
- **THEN** 內容裡的匯出時間是「Nov 17, 2026 at 10:32 PM」

#### Scenario: 有還沒送出的變更

- **WHEN** Taylor 的手機匯出之後把 Brisbane 改名為「Brissie」，這個事件還沒上傳；選自己剛才的匯出檔
- **THEN** 內容是原本那一段、空一行，和「1 change in your shared groups hasn't been sent yet and will be lost. To send it first, tap Cancel, connect to the internet, and open the app again.」

#### Scenario: 三個還沒送出的變更

- **WHEN** 匯出之後改名三次，三個事件都還沒上傳；選自己剛才的匯出檔
- **THEN** 第二段是「3 changes in your shared groups haven't been sent yet and will be lost. To send them first, tap Cancel, connect to the internet, and open the app again.」

#### Scenario: 匯出檔裡也有的不算

- **WHEN** Taylor 的手機把 Brisbane 改名為「Brissie」之後才匯出，這個事件一直沒上傳；選這個匯出檔
- **THEN** 內容只有原本那一段

#### Scenario: 唯讀副本的不算

- **WHEN** Brisbane 是唯讀副本，有兩個待上傳的事件；選 Taylor 的資料的匯出檔
- **THEN** 內容只有原本那一段

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

### Requirement: BACKUP-13.3 按 Replace 時用匯出檔的內容取代全部資料

WHEN 使用者在確認框按「Replace」，the mobile app SHALL 在一個 transaction 裡把本機資料的全部內容換成匯出檔的內容：換完之後，除了手機看過的最新時間戳記（BACKUP-27.1），和授權失效的手機上共同帳本成為唯讀副本這件事（BACKUP-29.1），本機資料的每一張表都和匯出時的本機資料一樣，原本在這支手機上、匯出檔裡沒有的資料都不在了，本機身分也是匯出檔裡的那一個。同步資料也在內，所以匯入之後：匯出檔裡的共同帳本是共同帳本，其中的唯讀副本仍是唯讀副本、原因不變，其他群組都不是；每筆紀錄每個單位的值和時間戳記、刪除紀錄、待上傳的事件連同它們的事件 ID 和順序、不套用的事件留下的紀錄，都是匯出檔裡的；匯出之後才寫下的待上傳事件，和匯出之後的其他修改一樣不在了。

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

#### Scenario: 匯入自己之前的匯出檔，手機上有共同帳本

- **WHEN** Taylor 的手機把 Brisbane 改名為「Brissie」，套用了 Lunch 的第一個事件和一個標題是空字串、所以不套用的事件，然後匯出；之後再把群組改名為「Sydney」、又套用一個不套用的事件，再匯入自己剛才的匯出檔
- **THEN** 待上傳的事件只有改名為「Brissie」的那一個，事件 ID 和匯出時一樣；不套用的事件留下的紀錄只有匯出時的那一筆；群組叫 Brissie，Lunch 還在；之後替 Tokyo 改名不寫事件，替 Brissie 改名寫出一個事件，名稱根據的版本是改名為「Brissie」那個事件的時間戳記

#### Scenario: 重裝之後匯入自己的匯出檔

- **WHEN** Taylor 的手機重裝了 app，本機資料是新的，secure store 裡它的 seed 和 Brisbane 的群組鑰匙都還在；它匯入上面那個匯出檔，再替 Brissie 改名
- **THEN** 匯入之後這支手機待上傳的事件、不套用的事件留下的紀錄都和匯出時一樣；改名寫出的事件屬於 Brisbane 的群組 ID，時間戳記的裝置 ID 是 `phone-a`，名稱根據的版本是改名為「Brissie」那個事件的時間戳記

#### Scenario: 匯出檔裡的唯讀副本

- **WHEN** Taylor 的手機上 Brisbane 成為唯讀副本、原因是不是成員之後匯出；再匯入這個匯出檔
- **THEN** Brisbane 仍是唯讀副本，原因是不是成員

### Requirement: BACKUP-27.1 匯入不讓手機看過的最新時間戳記倒退

WHEN 使用者在確認框按「Replace」，the mobile app SHALL 在寫入匯出檔內容的同一個 transaction 裡，讓手機看過的最新時間戳記（SYNC-15.1）是匯出檔裡的和這支手機匯入之前的兩個裡比較晚的那一個（SYNC-1.1）；只有一邊有就用那一個，兩邊都沒有就沒有。所以匯入之後新修改的時間戳記（SYNC-2.1），比這支手機匯入之前寫過和看過的時間戳記都晚，也比匯出檔記著的看過的最新時間戳記晚。

#### Scenario: 匯入自己之前的匯出檔

- **WHEN** Taylor 的手機在校正後的時間 T+60000 匯出；之後套用時間戳記是 `T+360000/0/phone-b` 的 Lunch 的第一個事件，再把 Brisbane 改名為「Brissie」，這個事件的時間戳記是 `T+360000/1/phone-a`；然後匯入自己剛才的匯出檔，在校正後的時間 T+120000 把 Brisbane 改名為「Sydney」
- **THEN** 這個事件的時間戳記是 `T+360000/2/phone-a`，不是 `T+120000/0/phone-a`；名稱根據的版本是匯出檔裡的，毫秒是 T；待上傳的事件只有這一個

#### Scenario: 匯出檔裡的比較晚

- **WHEN** Taylor 的手機套用時間戳記是 `T+360000/0/phone-b` 的 Lunch 的第一個事件之後才匯出；它重裝了 app，本機資料是新的，secure store 裡它的 seed 和 Brisbane 的群組鑰匙都還在；它匯入這個匯出檔，在校正後的時間 T+120000 把 Brisbane 改名為「Sydney」
- **THEN** 這個事件的時間戳記是 `T+360000/1/phone-a`

#### Scenario: 匯出檔沒有共同帳本

- **WHEN** Taylor 的手機寫過時間戳記 `T+360000/1/phone-a` 的事件之後，Brisbane 成為唯讀副本；它匯入 Taylor 的資料的匯出檔，它沒有共同帳本；在校正後的時間 T+120000，Brisbane 變成共同帳本，裝置 ID 是 `phone-a`，再把它改名為「Sydney」
- **THEN** 這個事件的時間戳記和名稱根據的版本，毫秒都是 T+360000

#### Scenario: 兩邊都沒有

- **WHEN** 沒有共同帳本的手機匯入 Taylor 的資料的匯出檔，在校正後的時間 T+120000，Brisbane 變成共同帳本，再把它改名為「Sydney」
- **THEN** 這個事件的時間戳記和名稱根據的版本，毫秒都是 T+120000

### Requirement: BACKUP-28.1 匯入之後這支手機在裡面的共同帳本會不見時，不能匯入

IF 使用者選了一個可以匯入的匯出檔，而這支手機在裡面的共同帳本有任何一個，在匯出檔裡不是這支手機的共同帳本，THEN the mobile app SHALL 不跳出確認框，不寫入任何資料，本機資料和畫面都不變，並跳出標題「Leave Shared Groups First」的提示框。內容在這樣的共同帳本只有一個時是「This phone is still a member of <名稱>, and this file would remove that group from it. Leave the group first, then import the file again.」；有幾個時是「This phone is still a member of <名稱>, and this file would remove those groups from it. Leave them first, then import the file again.」，名稱依它們在這支手機上建立的先後，兩個時用「 and 」連接，三個以上時前面的用「, 」隔開、最後兩個用「 and 」連接。在匯出檔裡是這支手機的共同帳本，是指匯出檔的同步資料把同一個群組 ID 記成共同帳本，它在匯出檔裡不是唯讀副本，這支手機在裡面用的裝置 ID 也和本機資料裡的一樣。有一種情況另外不算：secure store 裡有這支手機現在替它記著的鑰匙世代的群組鑰匙（sync 的 SYNC-94.1），卻沒有匯出檔替它記著的那個鑰匙世代的那一把。這支手機連現在的那一把都沒有時，或 secure store 讀不了時（sharing 的 SHARING-30.1），不看這一項。不能用的檔案和比 app 新的匯出檔先照 BACKUP-15.1 和 BACKUP-17.1 處理。

不擋的話，匯入之後本機資料裡沒有那個共同帳本，或它成了唯讀副本，API 卻還把這支手機當成它的成員手機：別的成員看到一支不再同步的手機，要有人把它移除；這支手機之後用邀請連結再加入時，API 說它已經是成員（SHARING-222.1）。匯出檔是這支手機上一次在那個群組裡時留下的——它離開過，又被同意回來——也擋：那時的群組鑰匙在它成為唯讀副本時刪掉了（SYNC-302.1），匯入之後它解不開下載的事件，也沒有鑰匙可以上傳（SYNC-95.1），API 沒有接得上的 box（sharing 的 SHARING-279.1），兩邊都停住，畫面上卻沒有任何說明。使用者先退出那個群組（groups 的 GROUPS-152.1），它成為唯讀副本，就可以匯入。這支手機自己的匯出檔，裡面那些共同帳本都還是它的，照常匯入，之後接著同步（SYNC-92.2）。

#### Scenario: 加入之前的匯出檔

- **WHEN** Taylor 的手機匯出之後，Tokyo 也變成共同帳本；選自己剛才的匯出檔
- **THEN** 沒有跳出「Replace All Data?」；跳出「Leave Shared Groups First」，內容是「This phone is still a member of Tokyo, and this file would remove that group from it. Leave the group first, then import the file again.」；本機資料和之前完全一樣

#### Scenario: 別支手機的匯出檔

- **WHEN** 一支手機有自己的共同帳本 Osaka，裝置 ID 是 `phone-s`；選 Taylor 的手機的匯出檔，裡面沒有 Osaka
- **THEN** 跳出「Leave Shared Groups First」，內容說的是 Osaka

#### Scenario: 同一個群組，別支手機

- **WHEN** Casey 的手機在 Brisbane 裡，裝置 ID 是 `phone-b`；選 Taylor 的手機的匯出檔，裡面 Brisbane 是共同帳本，裝置 ID 是 `phone-a`
- **THEN** 跳出「Leave Shared Groups First」，內容說的是 Brisbane

#### Scenario: 匯出檔裡它是唯讀副本

- **WHEN** Taylor 的手機在 Brisbane 成為唯讀副本時匯出，之後它又在 Brisbane 裡；選那個匯出檔
- **THEN** 跳出「Leave Shared Groups First」，內容說的是 Brisbane

#### Scenario: 幾個群組

- **WHEN** 這支手機依序建立了 Osaka、Kyoto 和 Nara，都是它在裡面的共同帳本；選一個裡面都沒有它們的匯出檔；或只有 Osaka 和 Nara 是
- **THEN** 內容分別是「This phone is still a member of Osaka, Kyoto and Nara, and this file would remove those groups from it. Leave them first, then import the file again.」和「This phone is still a member of Osaka and Nara, and this file would remove those groups from it. Leave them first, then import the file again.」

#### Scenario: 自己的匯出檔

- **WHEN** Taylor 的手機在 Brisbane 裡，匯出之後又改了資料；選自己剛才的匯出檔
- **THEN** 跳出「Replace All Data?」

#### Scenario: 上一次在群組裡時的匯出檔

- **WHEN** Taylor 的手機在 Brisbane 的鑰匙世代是 1 時匯出；之後它離開、又被同意回來，現在替 Brisbane 記著的鑰匙世代是 2，secure store 裡有鑰匙世代 2 的群組鑰匙，沒有鑰匙世代 1 的；選那個匯出檔
- **THEN** 跳出「Leave Shared Groups First」，內容說的是 Brisbane；本機資料和之前完全一樣

#### Scenario: 換鑰匙之前的匯出檔，鑰匙都還在

- **WHEN** Taylor 的手機在 Brisbane 的鑰匙世代是 1 時匯出；之後群組換了鑰匙，它一直在裡面，secure store 裡有鑰匙世代 1 和 2 的群組鑰匙；選那個匯出檔
- **THEN** 跳出「Replace All Data?」

#### Scenario: 唯讀副本不擋

- **WHEN** 這支手機的 Osaka 是唯讀副本，它沒有別的共同帳本；選 Taylor 的手機的匯出檔
- **THEN** 跳出「Replace All Data?」

### Requirement: BACKUP-29.1 匯入之後授權失效的手機上，匯出檔裡的共同帳本是唯讀副本

WHEN 使用者在確認框按「Replace」，而匯入之後這支手機授權失效，也就是匯出檔有裝置身分的紀錄，它的裝置 ID 在這支手機的 secure store 裡沒有 seed（SHARING-29.1），the mobile app SHALL 在寫入匯出檔內容的同一個 transaction 裡，把匯出檔裡每個共同帳本記成唯讀副本，原因是授權失效（sync 的 SYNC-301.1、SYNC-302.1）；匯出檔裡已經是唯讀副本的，原因不變。所以匯入一完成，它們就只能看（groups 的 GROUPS-155.1、GROUPS-156.1），不等下一次同步：別支手機的匯出檔在這支手機上同步不了，中間寫下的變更永遠送不出去。它們待上傳的事件照匯出檔留著，不上傳。IF 這時 secure store 讀不了（SHARING-30.1），THEN the mobile app SHALL 照常匯入，不把共同帳本記成唯讀副本；之後的同步照 SYNC-301.1。WHILE 匯入之後這支手機不是授權失效——匯出檔沒有裝置身分的紀錄，或它的 seed 在這支手機的 secure store 裡——匯出檔裡的共同帳本 SHALL 照匯出檔，不因為匯入而成為唯讀副本：這支手機自己的匯出檔是這樣，它接著同步（SYNC-92.2），API 說它不是成員時才成為唯讀副本（SYNC-300.1）。

#### Scenario: 別支手機的匯出檔

- **WHEN** Taylor 的手機的匯出檔裡 Brisbane 是共同帳本，有一個待上傳的事件；一支第一次打開 app 的手機匯入它
- **THEN** 匯入完成時 Brisbane 是唯讀副本，原因是授權失效；它的畫面的橫幅是「This phone can't sync this group anymore. This copy is read-only and won't update.」，下面是「1 change made on this phone was never sent to the group.」；那個待上傳的事件還在；app 沒有發出任何網路請求

#### Scenario: 自己的匯出檔

- **WHEN** Taylor 的手機重裝了 app，secure store 裡它的 seed 還在；它匯入自己的匯出檔
- **THEN** Brisbane 不是唯讀副本，它的畫面有「Add expense」

#### Scenario: 匯出檔裡已經是唯讀副本

- **WHEN** 匯出檔裡 Brisbane 是唯讀副本，原因是不是成員，Tokyo 是共同帳本；一支第一次打開 app 的手機匯入它
- **THEN** Brisbane 的原因仍是不是成員；Tokyo 是唯讀副本，原因是授權失效

#### Scenario: secure store 讀不了

- **WHEN** 讀 secure store 時它回報錯誤，一支手機匯入 Taylor 的手機的匯出檔
- **THEN** 匯入完成，Brisbane 不是唯讀副本

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

IF 使用者選的檔案不能用，THEN the mobile app SHALL 不寫入任何資料，本機資料和畫面都不變，並跳出標題「Unable to Import Data」、內容「This file is damaged or was not exported by this app. Your data was not changed.」的提示框。檔案不能用，是指它符合下面任何一項：不是 SQLite 資料庫檔；不完整或損壞；沒有 migration 紀錄，或它的 migration 紀錄和 app 的 migration 清單開頭對不上；裡面有 BACKUP-24.1 不允許的東西；沒有匯出時間，或匯出時間不是一個有效的時刻；內容違反 BACKUP-16.2 的規則。沒有損壞、版本比 app 新的匯出檔不算在這裡，照 BACKUP-17.1 處理。開發版也一樣，不會因為 migration 對不上就刪掉本機資料（SHELL-5.1）。

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

- **WHEN** 選了一個直接從手機複製出來的本機資料庫檔，它的 migration 紀錄和 app 的一樣，但沒有匯出時間；或一個匯出時間被刪掉的匯出檔
- **THEN** 跳出這個提示框，本機資料不變

#### Scenario: 匯出時間不是時刻

- **WHEN** 選了一個匯出檔，它記的匯出時間被改成不是時刻的值，例如文字「not a time」
- **THEN** 跳出這個提示框，本機資料不變

#### Scenario: 開發版

- **WHEN** 在開發版選了一個 migration 紀錄對不上的資料庫檔
- **THEN** 跳出這個提示框，本機資料不變

### Requirement: BACKUP-24.1 匯出檔裡只能有預期的表和索引

IF 使用者選的資料庫檔裡，除了 app 的 migration 建出來的表和索引、以及匯出檔記匯出時間的那一張表之外還有別的東西，或其中一張表、一個索引的定義和 migration 建出來的不一樣，THEN the mobile app SHALL 照 BACKUP-15.1 不寫入並提示。別的東西是指任何 view、任何 trigger、多出來的表和多出來的索引；定義包括欄位、型別、預設值和限制。版本比 app 舊的匯出檔，view 和 trigger 在升級之前就不能有，表和索引是拿升級之後的和 migration 建出來的比（BACKUP-18.1）；版本比 app 新的匯出檔不照這一條檢查（BACKUP-17.1）。

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

### Requirement: BACKUP-16.2 內容違反規則的匯出檔不寫入

IF 匯出檔的內容違反規則，THEN the mobile app SHALL 照 BACKUP-15.1 不寫入並提示。規則只有這些：資料庫自己的限制都成立，也就是每張表的 CHECK、NOT NULL、UNIQUE、主鍵和 foreign key；有本機身分；每個分類和每筆支出所屬的空間，是本機身分的個人空間或匯出檔裡的一個群組；個人空間的支出，付款和分攤都記在個人 participant 下；不是共同帳本的群組的支出，付款和分攤都記在那個群組的成員下，前成員也算；每筆支出的付款加總和分攤加總都等於它的金額；每筆支出的幣別是支援的幣別（LEDGER-1.1）；每筆支出的日期是有效的支出日期（LEDGER-9.1）。匯出檔裡的共同帳本的支出，付款和分攤記在誰下面都不算違反規則，其他規則照舊：套用事件之後，它們可以記在這支手機上不是那個群組成員的 ID 下（ADR-0021），這樣的手機匯出的檔案也要匯得回去（ADR-0025）。

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

#### Scenario: 空間不存在

- **WHEN** 匯出檔裡 Coffee run 所屬的空間被改成一個不是個人空間、也不是任何群組的 ID；或個人空間的分類 Shopping 所屬的空間被改成這樣的 ID
- **THEN** 跳出「Unable to Import Data」，本機資料不變

#### Scenario: 付款或分攤的人不在那個空間

- **WHEN** 匯出檔是 Taylor 的資料，裡面沒有共同帳本，Dinner 的付款被記在一個不是 Brisbane 成員的 ID 下；或個人支出 Coffee run 的分攤被記在 Casey 的成員 ID 下
- **THEN** 跳出「Unable to Import Data」，本機資料不變

#### Scenario: 前成員

- **WHEN** 匯出檔是 Taylor 的資料，Dinner 的分攤裡有已經被移出的 Blake
- **THEN** 不算違反規則，跳出的是「Replace All Data?」

#### Scenario: 共同帳本的支出記在這支手機沒有的成員下

- **WHEN** Taylor 的手機套用 `phone-b` 的兩個事件：加入成員 Dana 的事件，時間戳記比收到時間晚一小時，所以不套用（SYNC-9.1）；和 Dana 付款、Taylor 和 Dana 各分攤 1500 的 Lunch 的第一個事件，照常套用（SYNC-31.2）。這支手機匯出，再在自己身上、或在一支第一次打開 app 的手機上選這個匯出檔
- **THEN** 兩支手機都跳出「Replace All Data?」，內容寫的是「has 2 groups and 1 expense」；按「Replace」之後，本機資料和匯出時一樣，Lunch 的付款和 Dana 的那一筆分攤仍記在 Dana 的 ID 下，Brisbane 的成員裡沒有這個 ID

#### Scenario: 手動改過的匯出檔

- **WHEN** 匯出檔裡 Brisbane 是共同帳本，它的 Lunch 的付款被改記在一個不是 Brisbane 成員的 ID 下
- **THEN** 不算違反規則，跳出的是「Replace All Data?」

#### Scenario: 共同帳本的支出仍要守其他規則

- **WHEN** Dana 付款的那個匯出檔裡，Lunch 的分攤被改成 1500 和 1400；或 Lunch 的幣別被改成 `XYZ`
- **THEN** 跳出「Unable to Import Data」，本機資料不變

#### Scenario: 同一個匯出檔裡不是共同帳本的群組和個人支出

- **WHEN** 匯出檔裡 Brisbane 是共同帳本，Tokyo 不是；Tokyo 的支出 Sushi 的付款被記在一個不是 Tokyo 成員的 ID 下；或個人支出 Coffee run 的分攤被記在那個 ID 下
- **THEN** 跳出「Unable to Import Data」，本機資料不變

### Requirement: BACKUP-17.1 比 app 新的匯出檔不寫入，請使用者更新 app

IF 使用者選的檔案是沒有損壞的 SQLite 資料庫檔，而它的版本比 app 新，THEN the mobile app SHALL 不寫入任何資料，本機資料和畫面都不變，並跳出標題「Unable to Import Data」、內容「This file was exported by a newer version of the app. Update the app, then try again. Your data was not changed.」的提示框，不再照 BACKUP-24.1 和 BACKUP-16.2 檢查它，因為新版的匯出檔本來就可能有 app 不認得的表和欄位；開發版也一樣。沒有損壞，是指 SQLite 自己檢查這個檔案的完整性時找不到問題；這項檢查不看 foreign key。

#### Scenario: 違反 foreign key 的新版匯出檔

- **WHEN** 選了一個新版匯出檔，裡面有一位成員屬於一個不存在的群組
- **THEN** 跳出這個提示框，不是「This file is damaged or was not exported by this app.」；本機資料不變

#### Scenario: 新版 app 的匯出檔

- **WHEN** 選了一個多跑了一個 migration、因此多了一張表的 app 所匯出的匯出檔
- **THEN** 跳出這個提示框，不是「This file is damaged or was not exported by this app.」；沒有確認框，本機資料和選檔案之前一樣

#### Scenario: 損壞的新版匯出檔

- **WHEN** 選了一個只剩前半的新版匯出檔
- **THEN** 跳出的是 BACKUP-15.1 的提示框，本機資料不變

#### Scenario: 開發版

- **WHEN** 在開發版選了同一個匯出檔
- **THEN** 跳出這個提示框，本機資料不變

### Requirement: BACKUP-18.1 比 app 舊的匯出檔升級之後匯入

WHEN 使用者選了一個版本比 app 舊的匯出檔，the mobile app SHALL 先在它的複本上跑它還沒跑過的 migration（ADR-0006），再把升級後的內容當成匯出檔，照 BACKUP-11.2 到 BACKUP-16.2 和 BACKUP-24.1 處理；確認框和同一個版本的匯出檔一樣，不另外說明它是舊版的。有一個 migration 跑不完的檔案是不能用的檔案（BACKUP-15.1）。

#### Scenario: 還沒有圖表類型的 app 所匯出的檔案

- **WHEN** 選了一個 app 在加上 Insights 圖表類型的那個 migration 之前所匯出的 Taylor 的資料
- **THEN** 跳出「Replace All Data?」，內容寫的是「has 2 groups and 3 expenses」；按「Replace」之後，支出、分類、群組、成員、本機身分、名字和外觀選項都和匯出時一樣，圖表類型是 Auto，本機資料的 migration 紀錄和 app 的 migration 清單一樣

#### Scenario: 支出還沒有最後修改時間的 app 所匯出的檔案

- **WHEN** 選了一個 app 在支出有最後修改時間（LEDGER-120.1）之前所匯出的匯出檔，裡面有依序新增的個人支出 A、B 和 C，按「Replace」
- **THEN** 照常匯入，支出清單有這三筆；它們沒有最後修改時間，支出清單的排序換成 Recently Edited 時由上而下是 C、B、A

#### Scenario: 還沒有篩選的 app 所匯出的檔案

- **WHEN** 手機上支出清單的 Paid by Me 開著、有存起來的篩選「Mine」，選了一個 app 在清單有篩選（LEDGER-140.1）之前所匯出的匯出檔，按「Replace」
- **THEN** 照常匯入；匯入完成時支出清單沒有篩選，Filters 裡沒有 SAVED FILTERS

#### Scenario: 升級後違反規則

- **WHEN** 選了一個比 app 舊的匯出檔，裡面 Dinner 的分攤加起來不等於金額
- **THEN** 跳出「Unable to Import Data」，本機資料不變

#### Scenario: migration 跑不完

- **WHEN** 選了一個比 app 舊的匯出檔，它已經有一個叫 `chartType` 的欄位，所以加上圖表類型的那個 migration 跑不完
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

#### Scenario: 換平台

- **WHEN** 把 iPhone 匯出的檔案拿到 Android 手機上匯入；再把 Android 手機匯出的檔案拿到 iPhone 上匯入
- **THEN** 兩次都跳出「Replace All Data?」，按「Replace」之後每個畫面都和匯出時一樣

#### Scenario: 交給別的 app

- **WHEN** 從分享畫面用 AirDrop、郵件或訊息把匯出檔傳到另一支手機，在那支手機上把它存成檔案，再點「Import Data」選它
- **THEN** 跳出「Replace All Data?」，按「Replace」之後每個畫面都和匯出時一樣

#### Scenario: 飛航模式

- **WHEN** 手機開著飛航模式，匯出到手機上的檔案，再匯入
- **THEN** 兩者都照常完成
