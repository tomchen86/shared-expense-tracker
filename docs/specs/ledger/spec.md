# Ledger

## Purpose

記帳：金額規則（每個幣別的小數位數、金額文字怎麼解析和轉回文字、金額上限、平均分攤和支出日期），以及手機 app 上新增和修改支出的支出表單、存著的支出、Expenses 分頁的支出清單和支出的明細。金額規則放在 `packages/domain`，每個客戶端都照同一套套用（ADR-0002、ADR-0004）；手機 app 把支出存在本機資料裡（ADR-0006）。支出表單是新增支出的 New Expense 和修改支出的 Edit Expense。個人支出是屬於本機身分的個人空間、付款和分攤都是個人 participant 的支出（SHELL-2.1）。手機地區的幣別是手機第一個偏好的語言和地區所用的幣別。表單的幣別在 New Expense 是新支出的幣別（LEDGER-15.1），在 Edit Expense 是這筆支出的幣別；金額欄位的文字經 LEDGER-19.1 轉換後，依 LEDGER-2.1 到 LEDGER-4.1 能換成表單幣別的最小單位，就是合法的金額。表單有變更，是指金額、標題、分類、日期或備註有任何一欄和打開表單時不同；比較金額、標題和備註時不管頭尾空白。裝置所在的時區是 JavaScript 執行環境回報的時區，今天是裝置所在時區的今天（LEDGER-8.1）。支出清單是 Expenses 分頁的根畫面，上方是 Your Total Share，下面是支出的卡片；明細是點卡片後推入、顯示一筆支出的畫面。手機地區的貨幣格式，是手機第一個偏好的語言和地區用來顯示一個幣別的金額的格式；手機地區的日期格式見 LEDGER-30.1。刪除支出是把它移到垃圾桶：本機資料把它標成在垃圾桶裡，它的其他資料都不變，所以垃圾桶裡的支出仍是存著的支出，仍算使用它的分類（CATEGORIES-34.1、35.1、40.1）；還原是拿掉這個標記，永久刪除是把這筆支出和它的付款、分攤從本機資料刪掉。Undo 提示是支出移到垃圾桶之後，顯示在畫面底部、可以按 Undo 的提示；Undo 時間是 5 秒，螢幕閱讀器開著時是 15 秒，螢幕閱讀器是 iOS 的 VoiceOver 或 Android 的 TalkBack。Trash 是 Settings 分頁上列出垃圾桶裡的支出的畫面；唯讀明細是在 Trash 點卡片後推入、顯示垃圾桶裡一筆支出的畫面。

## Requirements

### Requirement: LEDGER-1.1 幣別的小數位數來自固定的 ISO 4217 表

The domain package SHALL 從固定的幣別表查每個幣別的小數位數。這張表收錄 ISO 4217 List One 裡所有規定了小數位數的代碼；表裡沒有的代碼，包括小寫的代碼，都 SHALL 視為不支援。

#### Scenario: 常見幣別

- **WHEN** 查 `USD`、`EUR`、`TWD`、`JPY`、`KWD` 的小數位數
- **THEN** 分別是 2、2、2、0、3

#### Scenario: 不支援的代碼

- **WHEN** 查 `XYZ`、`usd`，或 ISO 沒有規定小數位數的 `XAU`
- **THEN** 結果是不支援

### Requirement: LEDGER-2.1 把金額文字換成最小單位的整數

WHEN 解析一段金額文字和一個幣別，the domain package SHALL 先去掉前後空白，再把它換成該幣別最小單位的整數。

#### Scenario: 依幣別的小數位數換算

- **WHEN** 解析 `12.34` USD、`12.3` AUD、`12` JPY、`1.234` KWD
- **THEN** 結果分別是 1234、1230、12、1234

#### Scenario: 前後有空白

- **WHEN** 解析 ` 8.75 ` USD
- **THEN** 結果是 875

### Requirement: LEDGER-3.1 拒絕不合法的金額文字

IF 金額文字不是正的十進位數字，或小數位數超過幣別允許的位數，或幣別不支援，THEN the domain package SHALL 拒絕它，不回傳金額。正的十進位數字是指：整數部分是 `0`，或不以 `0` 開頭的數字；可以再接一個小數點和至少一位數字；而且數值大於 0。

#### Scenario: 零和負數

- **WHEN** 解析 `0`、`0.00`、`-1` USD
- **THEN** 三個都被拒絕

#### Scenario: 不是十進位數字

- **WHEN** 解析 `12abc`、`1e3`、`Infinity`、空字串、只有空白、`.5`、`12.`、`05`、`12,5` USD
- **THEN** 全部被拒絕

#### Scenario: 小數位數太多

- **WHEN** 解析 `10.999` USD、`1.0` JPY
- **THEN** 兩個都被拒絕

#### Scenario: 不支援的幣別

- **WHEN** 解析 `10` XYZ
- **THEN** 被拒絕

### Requirement: LEDGER-4.1 金額上限是 999,999,999,999 個最小單位

IF 金額超過 999,999,999,999 個最小單位，THEN the domain package SHALL 拒絕它。

#### Scenario: 剛好在上限

- **WHEN** 解析 `9999999999.99` USD、`999999999999` JPY
- **THEN** 結果都是 999999999999

#### Scenario: 超過上限

- **WHEN** 解析 `10000000000.00` USD、`1000000000000` JPY
- **THEN** 兩個都被拒絕

### Requirement: LEDGER-5.2 把金額轉回小數文字

WHEN 把 0 到 9,007,199,254,740,991 之間的整數金額轉回文字（例如顯示分攤的份額，或填回輸入框），the domain package SHALL 依幣別的小數位數輸出，不加貨幣符號和千分位；金額在 1 到 999,999,999,999 之間時，輸出的文字依 LEDGER-2.1 解析後是同一個金額。

#### Scenario: 依幣別的小數位數輸出

- **WHEN** 轉換 1500 USD、5 USD、1200 JPY、1234 KWD、999999999999 USD
- **THEN** 結果分別是 `15.00`、`0.05`、`1200`、`1.234`、`9999999999.99`，而且都能解析回同一個金額

#### Scenario: 零和超過單筆上限的金額

- **WHEN** 轉換 0 USD、0 JPY、9007199254740991 USD
- **THEN** 結果分別是 `0.00`、`0`、`90071992547409.91`

### Requirement: LEDGER-6.1 平均分攤

WHEN 把一筆金額平均分給 n 位參與者，the domain package SHALL 讓每位先得到 ⌊金額 ÷ n⌋，剩下的（金額 mod n）個最小單位依參與者的順序，從第一位起每人多給一個。份額依參與者原本的順序回傳，總和等於金額。

#### Scenario: 除不盡

- **WHEN** 1000 分給 A、B、C；10001 分給 A、B、C
- **THEN** 分別是 334、333、333；3334、3334、3333

#### Scenario: 多出來的依名單順序給

- **WHEN** 1000 分給 B、A、C
- **THEN** B 得 334，A 得 333，C 得 333，依 B、A、C 的順序回傳

#### Scenario: 金額比人數少

- **WHEN** 1 分給 A、B
- **THEN** A 得 1，B 得 0，B 仍在結果裡

#### Scenario: 除得盡

- **WHEN** 1000 分給 A、B、C、D
- **THEN** 每人 250

### Requirement: LEDGER-7.1 拒絕不合法的分攤

IF 參與者名單是空的、有重複的參與者，或金額不是 1 到 999,999,999,999 之間的整數，THEN the domain package SHALL 拒絕分攤，不回傳任何份額。

#### Scenario: 參與者不合法

- **WHEN** 1000 分給空的名單，或分給 A、A、B
- **THEN** 兩次都被拒絕

#### Scenario: 金額不合法

- **WHEN** 把 0、12.5、1000000000000 分給 A、B
- **THEN** 全部被拒絕

#### Scenario: 上限的金額

- **WHEN** 999999999999 分給 A、B、C
- **THEN** 每人 333333333333

### Requirement: LEDGER-8.1 支出日期用指定時區的日曆

WHEN 把一個時間點換成某個時區的支出日期，the domain package SHALL 用那個時區的日曆日期，格式是 `YYYY-MM-DD`，不換成 UTC 的日期。手機 app 傳入的是裝置所在的時區。

#### Scenario: 當地已經是隔天

- **WHEN** 時區是 `Australia/Sydney`，時間點是 `2025-01-01T13:30:00Z`（當地 1 月 2 日 00:30）
- **THEN** 支出日期是 `2025-01-02`

#### Scenario: 當地還是前一天

- **WHEN** 時區是 `America/Los_Angeles`，時間點是 `2025-01-01T05:00:00Z`（當地 12 月 31 日 21:00）
- **THEN** 支出日期是 `2024-12-31`

### Requirement: LEDGER-9.1 判斷日期文字是不是有效的支出日期

IF 日期文字不是有效的 `YYYY-MM-DD` 日曆日期，THEN the domain package SHALL 判定它不是有效的支出日期。

#### Scenario: 有效的日期

- **WHEN** 檢查 `2024-02-29`、`2025-12-31`
- **THEN** 兩個都有效

#### Scenario: 無效的日期

- **WHEN** 檢查 `2025-02-29`、`2025-02-30`、`2025-13-01`、`2025-1-5`、`2025/01/05`、空字串
- **THEN** 全部無效

### Requirement: LEDGER-10.1 拒絕不能轉回文字的金額

IF 要轉回文字的金額不是 0 到 9,007,199,254,740,991 之間的整數，或幣別不支援，THEN the domain package SHALL 拒絕，不回傳文字。

#### Scenario: 金額不合法

- **WHEN** 轉換 -1 USD、12.5 USD、9007199254740992 USD
- **THEN** 全部被拒絕

#### Scenario: 不支援的幣別

- **WHEN** 轉換 100 XYZ、100 usd
- **THEN** 兩個都被拒絕

### Requirement: LEDGER-11.1 Expenses 分頁的 + 按鈕打開 New Expense

The mobile app SHALL 在 Expenses 分頁的根畫面放一個 + 按鈕，畫面沒有另外給它名稱，所以名稱是「Add expense」（SHELL-41.1）；按一下就打開 New Expense，連按兩次也只打開一個。

#### Scenario: 打開 app

- **WHEN** 打開 app，本機資料開好
- **THEN** Expenses 分頁的根畫面有名稱是「Add expense」的按鈕

#### Scenario: 按 + 按鈕

- **WHEN** 按「Add expense」
- **THEN** 打開 New Expense，目前的網址是 `/expenses/new`

#### Scenario: 連按兩次

- **WHEN** 連按兩次「Add expense」
- **THEN** 只打開一個 New Expense；按一次 Cancel 就回到 Expenses 的根畫面

### Requirement: LEDGER-12.1 支出表單的網址和呈現

The mobile app SHALL 以網址 `/expenses/new` 打開 New Expense，以 `/expenses/<支出的 ID>/edit` 打開這筆支出的 Edit Expense；支出表單的導覽列標題是「New Expense」或「Edit Expense」，從畫面底部升起並蓋住分頁列，在 iOS 上是 sheet，在 Android 上是有自己標題列的全螢幕畫面。

#### Scenario: New Expense

- **WHEN** iOS 上在 Expenses 分頁開啟 `/expenses/new`
- **THEN** 顯示導覽列標題是「New Expense」的 sheet

#### Scenario: Edit Expense

- **WHEN** 存下「Coffee run」之後，開啟 `/expenses/<它的 ID>/edit`
- **THEN** 顯示導覽列標題是「Edit Expense」的 sheet，標題欄位是「Coffee run」

#### Scenario: Android

- **WHEN** Android 上按「Add expense」
- **THEN** New Expense 從畫面底部升起，蓋住分頁列，標題列上有「Cancel」和「Add」

### Requirement: LEDGER-13.1 支出表單的內容

The mobile app SHALL 讓支出表單的標題列有取消「Cancel」和確認，確認在 New Expense 是「Add」、在 Edit Expense 是「Save」（SHELL-47.1、SHELL-48.1）；表單上依序是表單幣別的代碼、名稱是「Amount in <表單幣別>」並用數字和小數點鍵盤的金額欄位、名稱是「Expense title」的標題欄位、名稱是「Category, <分類名稱>」的分類按鈕、名稱是「Date」的日期欄位，以及名稱是「Expense note」的備註欄位。

#### Scenario: New Expense

- **WHEN** 手機地區的幣別是 USD，第一次啟動後打開 New Expense
- **THEN** 標題列有「Cancel」和「Add」；表單上依序是「USD」、「Amount in USD」、「Expense title」、「Category, Food & Dining」、「Date」、「Expense note」，金額欄位用數字和小數點鍵盤

#### Scenario: Edit Expense

- **WHEN** 打開一筆 JPY 支出的 Edit Expense
- **THEN** 標題列有「Cancel」和「Save」，金額欄位前面是「JPY」，名稱是「Amount in JPY」

### Requirement: LEDGER-14.2 打開 New Expense 時的內容

WHEN 打開 New Expense，the mobile app SHALL 讓金額、標題和備註都是空的，分類是個人空間未封存的分類中依儲存的順序排第一的那一個（CATEGORIES-7.3），日期是今天。

#### Scenario: 第一次啟動

- **WHEN** 第一次啟動後打開 New Expense
- **THEN** 金額、標題和備註都是空的，分類是「Food & Dining」，日期是今天

#### Scenario: 第一個分類改了名

- **WHEN** 在 Manage Categories 把 Food & Dining 改名為「Meals」，再打開 New Expense
- **THEN** 分類是「Meals」

#### Scenario: 第一個分類封存了

- **WHEN** 封存有支出使用的 Food & Dining，再打開 New Expense
- **THEN** 分類是「Transportation」

#### Scenario: 當地已經是隔天

- **WHEN** 裝置所在的時區是 `Australia/Sydney`，現在是 `2025-01-01T13:30:00Z`（當地 1 月 2 日 00:30）
- **THEN** 日期是 `2025-01-02`

#### Scenario: 當地還是前一天

- **WHEN** 裝置所在的時區是 `America/Los_Angeles`，現在是 `2025-01-01T05:00:00Z`（當地 12 月 31 日 21:00）
- **THEN** 日期是 `2024-12-31`

### Requirement: LEDGER-15.1 新支出用手機地區的幣別

WHEN 打開 New Expense，the mobile app SHALL 以手機地區的幣別作為表單的幣別；手機回報不出幣別，或回報的幣別依 LEDGER-1.1 不支援時，改用 USD。

#### Scenario: 有小數的幣別

- **WHEN** 手機地區的幣別是 TWD，在 New Expense 輸入金額「8.75」存下
- **THEN** 表單上是「TWD」和「Amount in TWD」，存下的是 875 TWD

#### Scenario: 沒有小數的幣別

- **WHEN** 手機地區的幣別是 JPY
- **THEN** 金額是「12.5」時 Add 停用；「1200」存成 1200 JPY

#### Scenario: 回報不出幣別

- **WHEN** 手機回報不出幣別
- **THEN** 表單的幣別是 USD

#### Scenario: 不支援的幣別

- **WHEN** 手機回報的幣別是 `XAU`
- **THEN** 表單的幣別是 USD

### Requirement: LEDGER-16.1 打開 Edit Expense 時帶入這筆支出

WHEN 打開某筆支出的 Edit Expense，the mobile app SHALL 以這筆支出的幣別作為表單的幣別，帶入依 LEDGER-5.2 轉回文字的金額，以及它的標題、分類、日期和備註；分類顯示的是分類現在的名稱。

#### Scenario: 帶入支出

- **WHEN** 打開這筆支出的 Edit Expense：「Coffee run」、875 USD、`2024-12-25`、Shopping、備註「Morning treat」
- **THEN** 金額是「8.75」，標題是「Coffee run」，分類是「Category, Shopping」，日期是 `2024-12-25`，備註是「Morning treat」

#### Scenario: 支出和手機地區的幣別不同

- **WHEN** 手機地區的幣別改成 USD 之後，打開一筆 1200 JPY 支出的 Edit Expense
- **THEN** 表單的幣別是 JPY，金額是「1200」

#### Scenario: 沒有備註

- **WHEN** 打開沒有備註的支出的 Edit Expense
- **THEN** 備註欄位是空的

#### Scenario: 分類改了名

- **WHEN** 存下 Shopping 的支出之後，把 Shopping 改名為「Groceries」，再打開這筆支出的 Edit Expense
- **THEN** 分類是「Category, Groceries」

### Requirement: LEDGER-17.3 從清單選分類

WHEN 使用者按分類按鈕，the mobile app SHALL 打開標題是「Category」的清單，依儲存的順序列出個人空間每個未封存的分類（CATEGORIES-7.3），並把表單上選的那一個標示為已選取，表單上的分類已封存時沒有標示為已選取的分類；按一個分類就選它並回到表單，按「Cancel」就回到表單、分類不變，所以沒有改選時，存檔後支出仍用那個已封存的分類。

#### Scenario: 打開清單

- **WHEN** 第一次啟動後，在 New Expense 按「Category, Food & Dining」
- **THEN** 清單依序是九個預設分類，只有 Food & Dining 標示為已選取

#### Scenario: 新增的分類

- **WHEN** 在 Manage Categories 新增「Gym」之後，在 New Expense 打開清單
- **THEN** Gym 排在 Uncategorized 後面

#### Scenario: 群組的分類

- **WHEN** 建立「Brisbane」，在它的 Group Categories 新增「Flights」，並把 Shopping 改名為「Groceries」之後，在 New Expense 打開清單
- **THEN** 清單依序是個人空間的九個預設分類，每個名稱只出現一次；沒有 Flights，也沒有 Groceries

#### Scenario: 選分類

- **WHEN** 在清單按「Shopping」
- **THEN** 回到表單，分類按鈕是「Category, Shopping」；再打開清單時，標示為已選取的是 Shopping

#### Scenario: 取消

- **WHEN** 打開清單後按「Cancel」
- **THEN** 回到表單，分類按鈕仍是「Category, Food & Dining」

#### Scenario: 封存的分類

- **WHEN** 封存有支出使用的 Gym 之後，在 New Expense 打開清單
- **THEN** 清單依序是九個預設分類，沒有 Gym

#### Scenario: 支出的分類封存了

- **WHEN** Gym 封存之後，打開一筆 Gym 支出的 Edit Expense，再打開清單
- **THEN** 分類按鈕是「Category, Gym」；清單沒有 Gym，也沒有標示為已選取的分類；按 Cancel 後分類按鈕仍是「Category, Gym」

#### Scenario: 沒有改選就存檔

- **WHEN** 在這筆支出的 Edit Expense 把標題改成「Spin class」，按 Save
- **THEN** 支出存的分類仍是 Gym 的 ID、名稱和顏色

### Requirement: LEDGER-18.1 日期最晚是今天

The mobile app SHALL 讓日期欄位最晚只能選今天；在日期欄位選了一天，表單的日期就是那一天。

#### Scenario: 最晚的日期

- **WHEN** 裝置所在的時區是 `Australia/Sydney`，現在是 `2025-01-01T13:30:00Z`，打開 New Expense 或 Edit Expense
- **THEN** 日期欄位最晚只能選 `2025-01-02`

#### Scenario: 選以前的日期

- **WHEN** 在日期欄位選 `2024-12-25`，輸入標題和金額後按 Add
- **THEN** 日期欄位是 `2024-12-25`，存下的支出日期是 `2024-12-25`

### Requirement: LEDGER-19.1 金額欄位的全形數字和逗號

The mobile app SHALL 先把金額欄位文字裡的全形數字、「．」和「，」換成半形，再把「,」換成「.」，然後才判斷它是不是合法的金額，並依 LEDGER-2.1 解析。

#### Scenario: 全形數字

- **WHEN** 表單的幣別是 USD，金額是「１２.３」
- **THEN** 存成 1230

#### Scenario: 逗號當小數點

- **WHEN** 金額是「12,5」
- **THEN** 存成 1250

#### Scenario: 全形的小數點和逗號

- **WHEN** 金額是「１２．３４」或「１２，５」
- **THEN** 分別存成 1234 和 1250

#### Scenario: 千分位的逗號

- **WHEN** 金額是「1,234.56」
- **THEN** 不是合法的金額，Add 停用

### Requirement: LEDGER-20.1 何時能按 Add 或 Save

WHILE 表單沒有變更、標題去掉頭尾空白後是空的，或金額不是合法的金額，the mobile app SHALL 停用 Add 或 Save（SHELL-49.1）。

#### Scenario: 剛打開 New Expense

- **WHEN** 打開 New Expense
- **THEN** Add 停用

#### Scenario: 金額是 0

- **WHEN** 標題是「Invalid」，金額是「0」
- **THEN** Add 停用

#### Scenario: 標題只有空白

- **WHEN** 金額是「8.75」，標題是「   」
- **THEN** Add 停用；標題改成「Coffee」後 Add 可以按

#### Scenario: 不合法的金額

- **WHEN** 標題是「Coffee」，金額是「10.999」、「12abc」、「-1」或「10000000000.00」
- **THEN** Add 停用；金額是「9999999999.99」時 Add 可以按

#### Scenario: 剛打開 Edit Expense

- **WHEN** 打開「Coffee run」的 Edit Expense
- **THEN** Save 停用

#### Scenario: 改了又改回

- **WHEN** 把標題改成「Lunch」
- **THEN** Save 可以按；再改回「 Coffee run 」後 Save 停用

#### Scenario: 沒有小數的幣別

- **WHEN** 把一筆 JPY 支出的金額改成「12.5」
- **THEN** Save 停用

### Requirement: LEDGER-21.1 按 Add 存下新的個人支出

WHEN 使用者在 New Expense 按 Add，the mobile app SHALL 存下一筆新的個人支出並關閉表單：標題和備註去掉頭尾空白，備註是空的就不存，金額是解析出來的最小單位整數，幣別、分類和日期是表單上的，付款和分攤都只有個人 participant 的全額；儲存完成前再按 Add 也只存一筆。

#### Scenario: 新增

- **WHEN** 手機地區的幣別是 USD，今天是 `2026-10-30`，輸入金額「 8.75 」、標題「 Coffee run 」、備註「 Morning treat 」後按 Add
- **THEN** 表單關閉，回到 Expenses；存下一筆個人支出：「Coffee run」、875 USD、`2026-10-30`、Food & Dining、備註「Morning treat」，付款和分攤都是個人 participant 的 875

#### Scenario: 空白的備註

- **WHEN** 備註是「   」
- **THEN** 存下的支出沒有備註

#### Scenario: 連按兩次

- **WHEN** 連按兩次 Add，第二次在儲存完成之前
- **THEN** 只多一筆支出

### Requirement: LEDGER-22.1 按 Save 存下個人支出的修改

WHEN 使用者在個人支出的 Edit Expense 按 Save，the mobile app SHALL 照 LEDGER-21.1 的規則，用表單上的金額、標題、分類、日期和備註更新這筆支出，保留它的 ID、幣別和所屬的空間，付款和分攤改成個人 participant 的新金額，然後關閉表單。

#### Scenario: 改金額

- **WHEN** 把 875 USD 的「Coffee run」的金額改成「12.50」後按 Save
- **THEN** 表單關閉；仍只有這一筆支出，金額是 1250 USD，付款和分攤都是個人 participant 的 1250

#### Scenario: 沒有小數的幣別

- **WHEN** 把 1200 JPY 的支出的金額改成「1500」後按 Save
- **THEN** 金額是 1500 JPY

#### Scenario: 改分類、日期和備註

- **WHEN** 把分類改成 Shopping、日期改成 `2024-12-25`、備註清空後按 Save
- **THEN** 支出的分類是 Shopping，日期是 `2024-12-25`，沒有備註

### Requirement: LEDGER-23.1 沒有變更時直接關閉表單

WHEN 表單沒有變更時，使用者按 Cancel、往下滑關閉表單或按 Android 的返回鍵，the mobile app SHALL 不跳出提示框，直接關閉表單。

#### Scenario: 按 Cancel

- **WHEN** 打開 New Expense 後按 Cancel
- **THEN** 表單關閉，沒有提示框，也沒有存下支出

#### Scenario: 改了又改回

- **WHEN** 在 Edit Expense 把標題改成「Lunch」再改回「Coffee run」，然後按 Cancel
- **THEN** 表單關閉，沒有提示框

#### Scenario: 往下滑

- **WHEN** iOS 上沒有變更時往下滑表單
- **THEN** 表單關閉，沒有提示框

#### Scenario: Android 的返回鍵

- **WHEN** Android 上沒有變更時按返回鍵
- **THEN** 表單關閉，回到 Expenses

### Requirement: LEDGER-24.1 有變更時先確認再放棄

IF 表單有變更時，使用者按 Cancel、往下滑關閉表單或按 Android 的返回鍵，THEN the mobile app SHALL 先不關閉表單，跳出標題「Discard Changes?」、內容「Your changes will not be saved.」的提示框，選項是「Keep Editing」和破壞性的「Discard」：按 Keep Editing 留在表單並保留輸入，按 Discard 不儲存就關閉表單。

#### Scenario: 繼續編輯

- **WHEN** 在 New Expense 輸入標題「Coffee」後按 Cancel，再按 Keep Editing
- **THEN** 表單仍開著，標題是「Coffee」

#### Scenario: 放棄

- **WHEN** 輸入標題「Coffee」後按 Cancel，再按 Discard
- **THEN** 表單關閉，沒有存下支出

#### Scenario: 只改了分類

- **WHEN** 在 New Expense 只把分類改成 Shopping，然後按 Cancel
- **THEN** 跳出這個提示框

#### Scenario: 放棄修改

- **WHEN** 在 Edit Expense 把標題改成「Lunch」，按 Cancel 再按 Discard
- **THEN** 支出的標題仍是「Coffee run」

#### Scenario: 往下滑

- **WHEN** iOS 上有變更時往下滑表單
- **THEN** 表單沒有關閉，跳出這個提示框

#### Scenario: Android 的返回鍵

- **WHEN** Android 上有變更時按返回鍵
- **THEN** 表單沒有關閉，跳出這個提示框

### Requirement: LEDGER-25.1 儲存中鎖住表單

WHILE 支出正在儲存，the mobile app SHALL 停用 Cancel 和 Add 或 Save，讓金額、標題、備註、分類按鈕和日期欄位都不能操作，往下滑或按 Android 的返回鍵也不關閉表單，直到存好或存不進去為止。

#### Scenario: 新增中

- **WHEN** 按 Add 後，儲存還沒完成
- **THEN** Cancel 和 Add 都停用，各欄位都不能操作；存好後表單關閉，多了一筆支出

#### Scenario: 往下滑或按返回鍵

- **WHEN** 儲存還沒完成時往下滑表單，或在 Android 上按返回鍵
- **THEN** 表單不關閉，也沒有提示框

#### Scenario: 存不進去之後

- **WHEN** 資料庫無法寫入時按 Add
- **THEN** 存不進去之後，Cancel 和 Add 恢復可以按，各欄位恢復可以操作

### Requirement: LEDGER-26.1 存不進去時提示

IF 支出存不進本機資料，THEN the mobile app SHALL 跳出標題「Unable to Save Expense」、內容「Your expense could not be saved. Please try again.」的提示框，表單保持開啟並保留輸入，存著的支出維持按 Add 或 Save 之前的樣子；恢復後再按 Add 或 Save，只會存成一筆。

#### Scenario: 新增失敗

- **WHEN** 資料庫無法寫入時，輸入「Coffee run」和「8.75」後按 Add
- **THEN** 跳出這個提示框，表單仍開著，標題是「Coffee run」，Add 可以按；按 Cancel 再按 Discard 後，沒有存下支出

#### Scenario: 再試一次

- **WHEN** 新增失敗後資料庫恢復，再按一次 Add
- **THEN** 表單關閉，只存下一筆支出

#### Scenario: 修改失敗

- **WHEN** 資料庫無法寫入時，把「Coffee run」的金額改成「12.50」後按 Save
- **THEN** 跳出這個提示框；按 Cancel 再按 Discard 後，支出仍是 875 USD

#### Scenario: 寫到一半才失敗

- **WHEN** 存下一筆支出的寫入裡，前面的成功、後面的失敗，不論是在第幾筆寫入失敗
- **THEN** 存著的支出和按 Add 或 Save 之前一樣，沒有只存了一半的支出；恢復後再按一次，存下完整的一筆

### Requirement: LEDGER-27.1 本機資料保存的支出

The mobile app SHALL 在本機資料保存每筆支出的 ID、標題、金額、幣別、日期、分類（分類的 ID，以及最後一次存檔時分類的名稱和顏色）、有的話還有備註、所屬的空間（個人空間或某個群組）、付款和分攤，重新啟動 app 後都還在。

#### Scenario: 重新啟動

- **WHEN** 新增兩筆支出、修改其中一筆，然後重新啟動 app
- **THEN** 兩筆支出都和重新啟動前一樣

#### Scenario: 分類改了名

- **WHEN** 存下 Shopping 的支出之後，在 Manage Categories 把 Shopping 改名為「Groceries」並改用 `#43A047`
- **THEN** 支出存的分類仍是 Shopping 的 ID，名稱和顏色仍是「Shopping」和 `#FBC02D`

#### Scenario: 再存一次

- **WHEN** 分類改名之後，再修改這筆支出的標題並按 Save
- **THEN** 支出存的分類名稱和顏色是「Groceries」和 `#43A047`

### Requirement: LEDGER-28.1 支出依日期從新到舊排列

The mobile app SHALL 讓存著的支出依日期從新到舊排列；同一天的，後新增的排在前面，修改支出不改變它在同一天裡的位置。

#### Scenario: 不同的日期

- **WHEN** 依序新增日期是 `2025-01-01` 的 A、`2025-01-03` 的 B、`2025-01-02` 的 C
- **THEN** 順序是 B、C、A

#### Scenario: 同一天

- **WHEN** 依序新增日期都是 `2025-01-01` 的 D 和 E
- **THEN** 順序是 E、D

#### Scenario: 修改

- **WHEN** 修改 D 的標題
- **THEN** 順序仍是 E、D

#### Scenario: 改日期

- **WHEN** 把 D 的日期改成 `2025-01-02`
- **THEN** 順序是 D、E

### Requirement: LEDGER-29.3 (manual) 手機上的今天、地區幣別和日期

WHERE iPhone 或 Android 手機，the mobile app SHALL 讓 New Expense 的日期是手機時區的今天、幣別是手機地區的幣別，日期欄位用手機地區的日期格式顯示日期（LEDGER-30.1），日期選擇器選不到今天以後的日子，選了哪一天，日期欄位就顯示哪一天。手機地區的日期格式由各個平台自己決定，iPhone 和 Android 可以不一樣。

#### Scenario: 當地比 UTC 早一天

- **WHEN** 手機的時區設成 `Pacific/Auckland`，在當地上午（UTC 還是前一天）打開 New Expense
- **THEN** 日期是當地的今天

#### Scenario: 當地比 UTC 晚一天

- **WHEN** 手機的時區設成 `America/Los_Angeles`，在當地晚上（UTC 已經是隔天）打開 New Expense
- **THEN** 日期是當地的今天

#### Scenario: 手機地區的幣別

- **WHEN** 手機的地區設成日本，打開 New Expense
- **THEN** 表單上是「JPY」，金額欄位的名稱是「Amount in JPY」

#### Scenario: 兩個平台各用自己的日期格式

- **WHEN** iPhone 和 Android 手機的語言和地區都設成繁體中文（台灣），打開 New Expense
- **THEN** 兩邊的日期欄位各自用平台的中等長度日期格式顯示今天，例如 iPhone 是「2026年10月30日」，Android 是「2026/10/30」

#### Scenario: 選日期

- **WHEN** 打開日期選擇器，選前天
- **THEN** 明天以後的日子都不能選；選了之後，日期欄位顯示前天

### Requirement: LEDGER-30.1 日期欄位用手機地區的日期格式

The mobile app SHALL 讓日期欄位用手機地區的日期格式顯示日期，螢幕閱讀器讀出名稱「Date」和同一個日期；手機地區的日期格式，是手機第一個偏好的語言和地區所用的中等長度日期格式。

#### Scenario: 美國

- **WHEN** 手機第一個偏好的語言和地區是英文（美國），今天是 `2026-10-30`，打開 New Expense
- **THEN** 日期欄位顯示「Oct 30, 2026」，螢幕閱讀器讀出「Date」和「Oct 30, 2026」

#### Scenario: 日本

- **WHEN** 手機第一個偏好的語言和地區是日文（日本），今天是 `2026-10-30`
- **THEN** 日期欄位顯示「2026/10/30」

#### Scenario: 選了別的日子

- **WHEN** 在日期欄位選 `2024-12-25`
- **THEN** 日期欄位顯示「Dec 25, 2024」

### Requirement: LEDGER-31.2 支出清單依序列出個人支出

The mobile app SHALL 在支出清單上，依 LEDGER-28.1 的順序由上而下列出每筆不在垃圾桶裡的個人支出的卡片；新增、修改、移到垃圾桶或還原支出之後回到支出清單，或重新啟動 app 之後，卡片都和存著的支出一致。

#### Scenario: 不同的日期

- **WHEN** 依序新增日期是 `2025-01-01` 的「A」、`2025-01-03` 的「B」、`2025-01-02` 的「C」
- **THEN** 卡片由上而下是 B、C、A

#### Scenario: 同一天

- **WHEN** 依序新增日期都是 `2025-01-01` 的「E」、「F」和「D」
- **THEN** 卡片由上而下是 D、F、E

#### Scenario: 新增之後

- **WHEN** 有「Coffee run」時，在 New Expense 新增日期是今天的「Lunch」
- **THEN** 表單關閉後，卡片由上而下是 Lunch、Coffee run

#### Scenario: 修改之後

- **WHEN** 在 Edit Expense 把「Coffee run」的標題改成「Lunch」、金額改成「12.50」後按 Save
- **THEN** 表單關閉後，卡片是「Lunch」和「$12.50」，沒有「Coffee run」

#### Scenario: 重新啟動

- **WHEN** 新增「Coffee run」和「Lunch」之後重新啟動 app
- **THEN** 卡片由上而下仍是 Lunch、Coffee run

#### Scenario: 垃圾桶裡的支出

- **WHEN** 有「Coffee run」和「Lunch」時，把 Lunch 移到垃圾桶，再重新啟動 app
- **THEN** 卡片只有 Coffee run

### Requirement: LEDGER-32.1 沒有支出時顯示提示

WHILE 本機資料裡沒有個人支出，the mobile app SHALL 在支出清單上顯示「No expenses to display. Add a personal expense or get involved in a group expense.」，沒有任何卡片。

#### Scenario: 第一次啟動

- **WHEN** 第一次啟動 app
- **THEN** 支出清單顯示這句話，沒有卡片

#### Scenario: 新增第一筆支出

- **WHEN** 新增「Coffee run」
- **THEN** 這句話消失，只有 Coffee run 的卡片

### Requirement: LEDGER-33.1 卡片的內容

The mobile app SHALL 讓每張卡片是一個按鈕，依序顯示支出的標題、卡片金額、分類現在的名稱和日期，不顯示付款人和備註；螢幕閱讀器把卡片讀成一個按鈕，依同樣的順序讀出這四項。個人支出的卡片金額是它的全額。

#### Scenario: 一筆支出

- **WHEN** 存過名字「Tom」之後，新增「Coffee run」：875 USD、Food & Dining、`2026-10-30`、備註「Morning treat」
- **THEN** 卡片依序顯示「Coffee run」、「$8.75」、「Food & Dining」、「Oct 30, 2026」；卡片上沒有「Morning treat」、「Tom」或付款的字樣

#### Scenario: 螢幕閱讀器

- **WHEN** 螢幕閱讀器讀這張卡片
- **THEN** 讀出一個按鈕，依序是「Coffee run」、「$8.75」、「Food & Dining」、「Oct 30, 2026」

#### Scenario: 分類改了名

- **WHEN** 新增 Shopping 的支出之後，在 Manage Categories 把 Shopping 改名為「Groceries」
- **THEN** 卡片上的分類是「Groceries」

### Requirement: LEDGER-34.1 卡片上的標題只佔一行

The mobile app SHALL 在卡片上只用一行顯示標題，放不下時在結尾以「…」截斷；螢幕閱讀器仍讀出完整的標題。

#### Scenario: 很長的標題

- **WHEN** 新增標題是 200 個「a」的支出
- **THEN** 卡片上的標題只佔一行，放不下的部分在結尾截斷；螢幕閱讀器讀出完整的 200 個「a」

### Requirement: LEDGER-35.1 Your Total Share 依幣別加總卡片金額

The mobile app SHALL 在支出清單的卡片上方，為卡片用到的每個幣別各顯示一行「Your Total Share: <這個幣別所有卡片金額的總和>」，依幣別代碼排序；沒有卡片時只顯示一行「Your Total Share: —」；這幾行是文字，不是按鈕。

#### Scenario: 一個幣別

- **WHEN** 有 875 USD 和 1250 USD 兩筆支出
- **THEN** 卡片上方只有「Your Total Share: $21.25」

#### Scenario: 幾個幣別

- **WHEN** 依序新增日期相同的 30 AUD、875 USD、1200 JPY
- **THEN** 卡片由上而下是 JPY、USD、AUD 的支出；卡片上方由上而下是「Your Total Share: A$0.30」、「Your Total Share: ¥1,200」、「Your Total Share: $8.75」

#### Scenario: 不是按鈕

- **WHEN** 有 875 USD 的支出時點「Your Total Share: $8.75」
- **THEN** 它不在任何按鈕裡，點了沒有反應

#### Scenario: 沒有支出

- **WHEN** 第一次啟動 app
- **THEN** 卡片上方只有「Your Total Share: —」

#### Scenario: 修改之後

- **WHEN** 把 875 USD 的支出的金額改成「12.50」
- **THEN** 回到支出清單時是「Your Total Share: $12.50」

#### Scenario: 總和超過單筆的上限

- **WHEN** 有兩筆 999,999,999,999 USD 的支出
- **THEN** 是「Your Total Share: $19,999,999,999.98」

### Requirement: LEDGER-36.1 點卡片推入明細

WHEN 使用者點卡片，the mobile app SHALL 在 Expenses 分頁推入這筆支出的明細，網址是 `/expenses/<支出的 ID>`，標題是「Expense」，分頁列仍選中 Expenses；連點兩次也只推入一個明細，返回或按 Android 的返回鍵就回到支出清單。

#### Scenario: 點卡片

- **WHEN** 有「Coffee run」和「Lunch」時，點 Lunch 的卡片
- **THEN** 分頁列仍選中 Expenses，Expenses 分頁的堆疊由下而上是「Expenses」根畫面和「Expense」，明細是 Lunch 的，網址是 `/expenses/` 加上 Lunch 的 ID

#### Scenario: 以網址開啟

- **WHEN** 以 `/expenses/` 加上 Lunch 的 ID 開啟 app
- **THEN** 選中 Expenses 分頁，Expenses 分頁的堆疊由下而上是「Expenses」根畫面和「Expense」，明細是 Lunch 的

#### Scenario: 連點兩次

- **WHEN** 連點兩次 Lunch 的卡片
- **THEN** 只推入一個明細；返回一次就回到支出清單

#### Scenario: 返回

- **WHEN** 在明細返回，或在 Android 上按返回鍵
- **THEN** 回到支出清單，分頁列仍選中 Expenses

### Requirement: LEDGER-37.1 明細的內容

The mobile app SHALL 在明細上依序顯示支出的標題、金額、「DETAILS」區塊裡的「Category」和分類現在的名稱、「Date」和日期，有備註時再顯示「NOTE」區塊和備註；標題和備註都完整顯示，不截斷。

#### Scenario: 有備註

- **WHEN** 打開「Coffee run」的明細：875 USD、Shopping、`2024-12-25`、備註「Morning treat」
- **THEN** 依序顯示「Coffee run」、「$8.75」、「DETAILS」、「Category」、「Shopping」、「Date」、「Dec 25, 2024」、「NOTE」、「Morning treat」

#### Scenario: 沒有備註

- **WHEN** 打開沒有備註的支出的明細
- **THEN** 沒有「NOTE」區塊

#### Scenario: 分類改了名

- **WHEN** 把 Shopping 改名為「Groceries」之後，打開這筆支出的明細
- **THEN** 分類是「Groceries」

#### Scenario: 很長的標題和備註

- **WHEN** 打開標題是 200 個「a」、備註是 500 個「b」的支出的明細
- **THEN** 標題和備註都完整顯示，沒有截斷

### Requirement: LEDGER-38.1 明細的 Edit 打開 Edit Expense

The mobile app SHALL 在明細的標題列放名稱是「Edit」的編輯動作（SHELL-52.1），按一下就打開這筆支出的 Edit Expense（LEDGER-12.1），連按兩次也只打開一個；Edit Expense 關閉後，明細顯示的是這筆支出存著的樣子。

#### Scenario: 按 Edit

- **WHEN** 在 Coffee run 的明細按「Edit」
- **THEN** 打開 Coffee run 的 Edit Expense，網址是 `/expenses/<它的 ID>/edit`

#### Scenario: 存下修改

- **WHEN** 在 Edit Expense 把標題改成「Lunch」、金額改成「12.50」後按 Save
- **THEN** 表單關閉，回到明細，明細顯示「Lunch」和「$12.50」

#### Scenario: 連按兩次

- **WHEN** 連按兩次「Edit」
- **THEN** 只打開一個 Edit Expense；按一次 Cancel 就回到明細

### Requirement: LEDGER-39.1 找不到支出時顯示「Expense not found.」

IF 明細網址裡的 ID 不是任何支出的 ID，THEN the mobile app SHALL 讓明細的標題是「Expense」，只顯示「Expense not found.」，標題列沒有「Edit」；打開存在的支出時，SHALL 從推入明細到讀完支出都不顯示「Expense not found.」。

#### Scenario: 不存在的支出

- **WHEN** 以 `/expenses/00000000-0000-4000-8000-000000000000` 開啟 app
- **THEN** 選中 Expenses 分頁，明細的標題是「Expense」，只顯示「Expense not found.」，標題列沒有「Edit」

#### Scenario: 存在的支出

- **WHEN** 點 Coffee run 的卡片，或以它的網址開啟 app
- **THEN** 明細剛推入時和讀完 Coffee run 之後，都沒有顯示「Expense not found.」

### Requirement: LEDGER-40.1 金額和日期用手機地區的格式

The mobile app SHALL 讓卡片、Your Total Share 和明細，用手機地區的貨幣格式和幣別的小數位數（LEDGER-1.1）顯示金額，讓卡片和明細用手機地區的日期格式（LEDGER-30.1）顯示支出的日期，日期不因手機的時區提早或延後一天。

#### Scenario: 英文（美國）

- **WHEN** 手機第一個偏好的語言和地區是英文（美國），有日期是 `2026-10-30` 的 875 USD、30 AUD 和 1200 JPY 三筆支出
- **THEN** 金額分別是「$8.75」、「A$0.30」和「¥1,200」，日期是「Oct 30, 2026」

#### Scenario: 日文（日本）

- **WHEN** 手機第一個偏好的語言和地區是日文（日本），有日期是 `2026-10-30` 的 1200 JPY 的支出
- **THEN** 金額是「￥1,200」，日期是「2026/10/30」

#### Scenario: 小數位數和地區的習慣不同

- **WHEN** 手機第一個偏好的語言和地區是英文（美國），有 123456 IDR 和 1234 IQD 的支出
- **THEN** 金額是「IDR 1,234.56」和「IQD 1.234」，小數位數照 LEDGER-1.1，不是「IDR 1,235」或「IQD 1」

#### Scenario: 上限的金額

- **WHEN** 有一筆 999,999,999,999 USD 的支出
- **THEN** 卡片和明細的金額都是「$9,999,999,999.99」

#### Scenario: UTC 以西的時區

- **WHEN** 手機的時區是 `America/Los_Angeles`，新增日期是 `2026-10-25` 的支出
- **THEN** 卡片和明細的日期都是「Oct 25, 2026」，不是前一天的「Oct 24, 2026」

### Requirement: LEDGER-41.1 (manual) 手機上的金額和日期格式

WHERE iPhone 或 Android 手機，the mobile app SHALL 讓卡片、Your Total Share 和明細，依手機的語言和地區顯示金額和日期（LEDGER-40.1），在 UTC 以東的時區，日期也不提早一天；格式由各個平台決定，iPhone 和 Android 可以不一樣。

#### Scenario: 英文（美國）

- **WHEN** 手機的語言和地區設成英文（美國），新增 8.75 USD 的支出
- **THEN** 卡片和明細的金額是「$8.75」，日期是今天，例如「Oct 30, 2026」；Your Total Share 是「Your Total Share: $8.75」

#### Scenario: 繁體中文（台灣）

- **WHEN** 手機的語言和地區設成繁體中文（台灣），新增 8.75 TWD 的支出
- **THEN** 金額用台灣的貨幣格式，例如「$8.75」；日期用平台的中等長度日期格式

#### Scenario: 換了語言和地區

- **WHEN** 有 USD 的支出時，把手機的語言和地區從英文（美國）改成繁體中文（台灣），再打開 app
- **THEN** USD 的金額改用台灣的格式，例如「US$8.75」

#### Scenario: UTC 以東的時區

- **WHEN** 手機的時區設成 `Asia/Tokyo`，新增日期是 `2026-10-25` 的支出
- **THEN** 卡片和明細的日期都是 2026 年 10 月 25 日，不是前一天

### Requirement: LEDGER-42.1 (manual) 最後一張卡片不被 + 按鈕擋住

WHERE iPhone 或 Android 手機，WHEN 支出清單捲到最底，the mobile app SHALL 讓最後一張卡片整張露在 + 按鈕上方。

#### Scenario: 很多支出

- **WHEN** 有 20 筆支出，把支出清單捲到最底
- **THEN** 最後一張卡片整張在 + 按鈕上方，沒有被擋住

### Requirement: LEDGER-43.1 讀完支出之前不顯示沒有支出的樣子

WHILE 支出清單還沒讀完存著的支出，the mobile app SHALL 不顯示 LEDGER-32.1 的提示和「Your Total Share: —」。

#### Scenario: 開啟 app

- **WHEN** 有 Coffee run 時開啟 app，支出清單還沒讀完存著的支出
- **THEN** 支出清單沒有「No expenses to display. Add a personal expense or get involved in a group expense.」和「Your Total Share: —」；讀完之後顯示 Coffee run 的卡片

### Requirement: LEDGER-44.1 從明細返回時清單已經是新的

WHEN 從明細打開的 Edit Expense 存好支出，the mobile app SHALL 在從明細返回之前，就讓明細底下的支出清單顯示存著的卡片和 Your Total Share，返回時不先出現修改前的內容。

#### Scenario: 改了金額再返回

- **WHEN** 在 875 USD 的 Coffee run 的明細按「Edit」，把金額改成「9.25」後按 Save，再從明細返回
- **THEN** 支出清單一出現就是「$9.25」和「Your Total Share: $9.25」，沒有先出現「$8.75」

### Requirement: LEDGER-70.1 (e2e) 左滑卡片露出 Delete

WHEN 使用者在支出清單把個人支出的卡片往左滑，the mobile app SHALL 在卡片右邊露出顯示「Delete」的按鈕，它的無障礙名稱是「Delete <標題> expense」；按下它就把這筆支出移到垃圾桶（LEDGER-71.1）。

#### Scenario: 左滑

- **WHEN** 在支出清單把 Coffee run 的卡片往左滑
- **THEN** 卡片右邊露出「Delete」，它的無障礙名稱是「Delete Coffee run expense」

#### Scenario: 按 Delete

- **WHEN** 按露出的「Delete」
- **THEN** Coffee run 的卡片移出支出清單，畫面底部顯示「Moved to Trash」

### Requirement: LEDGER-71.1 刪除支出時移到垃圾桶

WHEN 使用者按個人支出的卡片左滑露出的「Delete」、使用個人支出的卡片上名稱是「Delete expense」的輔助功能動作，或在個人支出的明細的 Expense actions 選「Delete」（LEDGER-72.1），the mobile app SHALL 不另外確認，就把這筆支出移到垃圾桶，存好後才把它的卡片移出支出清單、不再把它算進 Your Total Share，沒有其他卡片時顯示 LEDGER-32.1 的提示，重新啟動 app 之後也一樣；存好之前再按一次或再用一次，也只移一次。重新啟動 app 之後它仍在垃圾桶裡，以網址打開它的明細時，和 LEDGER-39.1 一樣只顯示「Expense not found.」，標題列沒有「Edit」和「Expense actions」。

#### Scenario: 卡片的輔助功能動作

- **WHEN** 有 Coffee run 和 Lunch
- **THEN** 兩張卡片都有名稱是「Delete expense」的輔助功能動作

#### Scenario: 移到垃圾桶

- **WHEN** 有 875 USD 的 Coffee run 和 1250 USD 的 Lunch，對 Lunch 的卡片使用「Delete expense」
- **THEN** 沒有跳出提示框；卡片只剩 Coffee run，卡片上方是「Your Total Share: $8.75」

#### Scenario: 最後一筆

- **WHEN** 只有 Coffee run 時把它移到垃圾桶，再重新啟動 app
- **THEN** 移到垃圾桶之後和重新啟動之後，支出清單都顯示「No expenses to display. Add a personal expense or get involved in a group expense.」和「Your Total Share: —」，沒有卡片

#### Scenario: 存好之前

- **WHEN** 把 Lunch 移到垃圾桶，還沒存好
- **THEN** Lunch 的卡片仍在支出清單上；存好後才移出

#### Scenario: 存好之前再用一次

- **WHEN** 對 Lunch 的卡片使用「Delete expense」，還沒存好時再用一次
- **THEN** Lunch 只移到垃圾桶一次，螢幕閱讀器只念一次「Lunch moved to Trash. Undo available.」

#### Scenario: 重新啟動

- **WHEN** 把 Lunch 移到垃圾桶之後重新啟動 app
- **THEN** 支出清單只有 Coffee run，Trash 有 Lunch

#### Scenario: 以網址打開明細

- **WHEN** Lunch 在垃圾桶裡時，以 `/expenses/` 加上 Lunch 的 ID 開啟 app
- **THEN** 明細只顯示「Expense not found.」，標題列沒有「Edit」和「Expense actions」

#### Scenario: 分類仍算使用中

- **WHEN** Gym 唯一一筆支出在垃圾桶裡時，在 Manage Categories 移除 Gym
- **THEN** 跳出「Archive “Gym”?」，內容是「This category is used by 1 expense. Existing expenses will keep their category, but it will no longer appear for new expenses.」

#### Scenario: 用 Move Expenses… 搬走

- **WHEN** Gym 唯一一筆支出 Squat rack 在垃圾桶裡時，在 Manage Categories 移除 Gym，選「Move Expenses…」，再選 Shopping
- **THEN** 「ARCHIVED」下的「Restore Gym」有「Delete」動作；在 Trash 還原 Squat rack 之後，它的卡片上的分類是「Shopping」

### Requirement: LEDGER-72.1 明細的 Expense actions 選單

The mobile app SHALL 在個人支出的明細的標題列、「Edit」的右邊放一個名稱是「Expense actions」的選單（SHELL-47.1、SHELL-48.1），裡面只有破壞性的「Delete」（SHELL-53.1）；選「Delete」時，SHALL 把這筆支出移到垃圾桶（LEDGER-71.1），存好後返回支出清單，存好之前再選一次也只返回一次。

#### Scenario: iOS

- **WHEN** iOS 上打開 Coffee run 的明細
- **THEN** 標題列右邊由右而左是圖示 `ellipsis.circle`、名稱「Expense actions」的選單和 plain 的「Edit」；選單裡只有「Delete」，是破壞性的樣式

#### Scenario: Android

- **WHEN** Android 上打開 Coffee run 的明細，按名稱「Expense actions」的 `more_vert`
- **THEN** 標題列右邊由左而右是 `edit` 和 `more_vert`；跳出標題「Expense actions」的對話框，依序列出「Delete」和「Cancel」

#### Scenario: 選 Delete

- **WHEN** 有 Coffee run 和 Lunch 時，在 Lunch 的明細選「Delete」
- **THEN** 沒有跳出確認；返回支出清單，Expenses 分頁的堆疊只剩「Expenses」根畫面，卡片只剩 Coffee run，畫面底部顯示「Moved to Trash」

#### Scenario: 存好之前

- **WHEN** 在 Lunch 的明細選「Delete」，還沒存好
- **THEN** 明細仍開著，顯示 Lunch；存好後才返回支出清單

#### Scenario: 存好之前再選一次

- **WHEN** 在 Lunch 的明細選「Delete」，還沒存好時再選一次
- **THEN** 存好後只返回一次：分頁列仍選中 Expenses，Expenses 分頁的堆疊只剩「Expenses」根畫面；螢幕閱讀器只念一次「Lunch moved to Trash. Undo available.」

#### Scenario: 找不到支出

- **WHEN** 以 `/expenses/00000000-0000-4000-8000-000000000000` 開啟 app
- **THEN** 標題列沒有「Expense actions」

### Requirement: LEDGER-73.1 移到垃圾桶後顯示 Undo 提示

WHEN 支出移到垃圾桶並存好，the mobile app SHALL 在畫面底部顯示 Undo 提示，依序是「Moved to Trash」、「·」和一個顯示「Undo」、無障礙名稱是「Undo deletion of <標題>」的按鈕，並讓螢幕閱讀器念出「<標題> moved to Trash. Undo available.」；提示蓋在 app 的畫面上，切換到別的分頁也還在。提示收起之前又有支出移到垃圾桶，提示就換成那一筆的，從它存好時重新算 Undo 時間，較早的那一筆不再有 Undo。

#### Scenario: 移到垃圾桶

- **WHEN** 把 Coffee run 移到垃圾桶
- **THEN** 存好時顯示「Moved to Trash」、「·」和「Undo」，「Undo」是名稱為「Undo deletion of Coffee run」的按鈕；螢幕閱讀器念出「Coffee run moved to Trash. Undo available.」

#### Scenario: 還沒存好

- **WHEN** 把 Coffee run 移到垃圾桶，還沒存好
- **THEN** 不顯示提示，螢幕閱讀器也不念

#### Scenario: 切換分頁

- **WHEN** 提示顯示時選中 Groups 分頁
- **THEN** 提示仍在；按「Undo」照樣放回 Coffee run

#### Scenario: 接著刪除另一筆

- **WHEN** 把 Coffee run 移到垃圾桶 3 秒後，再把 Lunch 移到垃圾桶
- **THEN** Lunch 存好時螢幕閱讀器念出「Lunch moved to Trash. Undo available.」，提示的按鈕換成「Undo deletion of Lunch」，沒有「Undo deletion of Coffee run」；提示到 Lunch 存好之後 5 秒才收起，Coffee run 一直在垃圾桶裡

### Requirement: LEDGER-74.1 Undo 提示收起的時候

The mobile app SHALL 讓 Undo 提示從那一筆存好時起顯示 Undo 時間後收起，那一筆支出留在垃圾桶裡；提示顯示時打開或關掉螢幕閱讀器，就從那時起依螢幕閱讀器現在的狀態，重新算這一筆完整的 Undo 時間。提示收起之前，那一筆在 Trash 被還原、永久刪除或清空，SHALL 立刻收起提示。

#### Scenario: 5 秒

- **WHEN** 螢幕閱讀器沒開時把 Coffee run 移到垃圾桶
- **THEN** 存好之後過了 4.9 秒仍顯示提示，到 5 秒時收起；Trash 有 Coffee run

#### Scenario: 15 秒

- **WHEN** 螢幕閱讀器開著時把 Coffee run 移到垃圾桶
- **THEN** 存好之後過了 14.9 秒仍顯示提示，到 15 秒時收起

#### Scenario: 打開螢幕閱讀器

- **WHEN** 螢幕閱讀器沒開，提示顯示 2 秒後打開螢幕閱讀器
- **THEN** 從那時起過了 14.9 秒仍顯示提示，到 15 秒時收起

#### Scenario: 關掉螢幕閱讀器

- **WHEN** 螢幕閱讀器開著，提示顯示 5 秒後關掉螢幕閱讀器
- **THEN** 從那時起過了 4.9 秒仍顯示提示，到 5 秒時收起

#### Scenario: 在 Trash 還原或永久刪除

- **WHEN** 把 Coffee run 移到垃圾桶，提示還在時，在 Trash 打開它按「Restore」，或選「Delete Permanently」再按「Delete」
- **THEN** 存好時提示就收起

#### Scenario: 清空垃圾桶

- **WHEN** 把 Coffee run 移到垃圾桶，提示還在時，在 Trash 清空垃圾桶
- **THEN** 存好時提示就收起

#### Scenario: 還原別筆

- **WHEN** Lunch 已經在垃圾桶裡，把 Coffee run 移到垃圾桶，提示還在時，在 Trash 還原 Lunch
- **THEN** Coffee run 的提示仍在

### Requirement: LEDGER-75.1 按 Undo 時還原支出

WHEN 使用者按 Undo 提示的「Undo」，the mobile app SHALL 不另外確認，就把這筆支出從垃圾桶還原，存好後收起提示，讓它的卡片回到支出清單上依 LEDGER-28.1 該在的位置，再算進 Your Total Share，也不再出現在 Trash。

#### Scenario: 按 Undo

- **WHEN** 有 875 USD 的 Coffee run 和 1250 USD 的 Lunch，把 Lunch 移到垃圾桶後按「Undo」
- **THEN** 沒有跳出提示框，提示收起；卡片由上而下又是 Lunch、Coffee run，卡片上方是「Your Total Share: $21.25」；Trash 只顯示「No deleted expenses.」

#### Scenario: 原來的位置

- **WHEN** 依序新增日期都是 `2025-01-01` 的「E」、「F」和「D」，把 F 移到垃圾桶後按「Undo」
- **THEN** 卡片由上而下仍是 D、F、E

#### Scenario: 從明細刪除之後

- **WHEN** 在 Lunch 的明細選「Delete」，返回支出清單後按「Undo」
- **THEN** Lunch 的卡片回到支出清單，Expenses 分頁的堆疊仍只有「Expenses」根畫面

#### Scenario: 重新啟動

- **WHEN** 按「Undo」之後重新啟動 app
- **THEN** 卡片由上而下仍是 Lunch、Coffee run

### Requirement: LEDGER-76.1 Settings 的 Trash 列顯示筆數

The mobile app SHALL 在 Settings 根畫面「Trash」那一列的文字右邊，顯示垃圾桶裡的支出的筆數，沒有時是「0」，這一列的無障礙名稱是「Trash, <筆數>」；Settings 根畫面讀完存著的支出之前，SHALL 不顯示筆數，這一列的無障礙名稱是「Trash」。

#### Scenario: 還沒有刪除

- **WHEN** 第一次啟動 app，選中 Settings 分頁
- **THEN** 「Trash」右邊是「0」，這一列的無障礙名稱是「Trash, 0」

#### Scenario: 刪除兩筆

- **WHEN** 把 Coffee run 和 Lunch 移到垃圾桶之後選中 Settings 分頁
- **THEN** 「Trash」右邊是「2」，這一列的無障礙名稱是「Trash, 2」

#### Scenario: 還原一筆

- **WHEN** 在 Trash 還原 Lunch，再返回 Settings 的根畫面
- **THEN** 「Trash」右邊是「1」，這一列的無障礙名稱是「Trash, 1」

#### Scenario: 讀完之前

- **WHEN** 有垃圾桶裡的 Lunch 時開啟 app 並選中 Settings 分頁，Settings 根畫面還沒讀完存著的支出
- **THEN** 「Trash」右邊沒有數量，這一列的無障礙名稱是「Trash」；讀完之後右邊是「1」，無障礙名稱是「Trash, 1」

### Requirement: LEDGER-77.1 Trash 列出垃圾桶裡的支出

The mobile app SHALL 在 Trash 依移到垃圾桶的先後，最後移入的在最上面，由上而下列出垃圾桶裡每筆個人支出的卡片；卡片顯示的內容和螢幕閱讀器讀出的，都和支出清單上的卡片一樣（LEDGER-33.1、LEDGER-34.1、LEDGER-40.1），但卡片不能左滑，也沒有「Delete expense」動作。垃圾桶裡沒有支出時，SHALL 只顯示「No deleted expenses.」，但讀完存著的支出之前不顯示這句話。

#### Scenario: 依移入的先後

- **WHEN** 依序新增日期是 `2025-01-03` 的「A」、`2025-01-01` 的「B」和 `2025-01-02` 的「C」，再依序把 A、C、B 移到垃圾桶，打開 Trash
- **THEN** 卡片由上而下是 B、C、A

#### Scenario: 再移入一次

- **WHEN** 接著在 Trash 還原 A，再把 A 移到垃圾桶
- **THEN** 卡片由上而下是 A、B、C

#### Scenario: 卡片的內容

- **WHEN** 把 875 USD、Food & Dining、`2026-10-30`、備註「Morning treat」的 Coffee run 移到垃圾桶，打開 Trash
- **THEN** 卡片依序顯示「Coffee run」、「$8.75」、「Food & Dining」、「Oct 30, 2026」，沒有「Morning treat」；螢幕閱讀器把它讀成一個按鈕，依序讀出這四項；卡片沒有「Delete expense」動作

#### Scenario: 只列垃圾桶裡的

- **WHEN** 有 Coffee run 和 Lunch，只把 Lunch 移到垃圾桶
- **THEN** Trash 只有 Lunch 的卡片

#### Scenario: Trash 開著時

- **WHEN** Trash 開著時，從 Expenses 分頁把 Lunch 移到垃圾桶，再選中 Settings 分頁
- **THEN** Trash 有 Lunch 的卡片

#### Scenario: 空的

- **WHEN** 第一次啟動後打開 Trash
- **THEN** 只顯示「No deleted expenses.」，沒有卡片

#### Scenario: 讀完之前

- **WHEN** 有垃圾桶裡的 Lunch 時開啟 app 並打開 Trash，Trash 還沒讀完存著的支出
- **THEN** 沒有「No deleted expenses.」；讀完之後顯示 Lunch 的卡片

### Requirement: LEDGER-78.1 點 Trash 的卡片推入唯讀明細

WHEN 使用者點 Trash 的卡片，the mobile app SHALL 在 Settings 分頁推入這筆支出的唯讀明細，網址是 `/settings/trash/<支出的 ID>`，標題是「Expense」，最上面是「This expense is in the Trash.」，下面是名稱為「Restore」的按鈕，再下面依 LEDGER-37.1 顯示支出的內容；標題列沒有「Edit」，只有名稱是「Expense actions」的選單（SHELL-47.1、SHELL-48.1），裡面只有破壞性的「Delete Permanently」（SHELL-53.1）。連點兩次也只推入一個唯讀明細，返回時回到 Trash；從推入到讀完支出，都不顯示「Expense not found.」。唯讀明細跟著存著的支出：網址裡的 ID 不是垃圾桶裡的支出，或打開之後那一筆因為別處的操作（例如 Undo 提示的 Undo）離開了垃圾桶時，SHALL 只顯示「Expense not found.」，標題列沒有選單。

#### Scenario: 點卡片

- **WHEN** 把 875 USD、Shopping、`2024-12-25`、備註「Morning treat」的 Coffee run 移到垃圾桶，在 Trash 點它的卡片
- **THEN** 分頁列仍選中 Settings，Settings 分頁的堆疊由下而上是「Settings」根畫面、「Trash」和「Expense」，網址是 `/settings/trash/` 加上 Coffee run 的 ID；由上而下依序顯示「This expense is in the Trash.」、「Restore」、「Coffee run」、「$8.75」、「DETAILS」、「Category」、「Shopping」、「Date」、「Dec 25, 2024」、「NOTE」、「Morning treat」

#### Scenario: iOS 的標題列

- **WHEN** iOS 上打開 Coffee run 的唯讀明細
- **THEN** 標題列右邊只有圖示 `ellipsis.circle`、名稱「Expense actions」的選單，裡面只有破壞性的「Delete Permanently」；沒有「Edit」

#### Scenario: Android 的標題列

- **WHEN** Android 上打開 Coffee run 的唯讀明細，按名稱「Expense actions」的 `more_vert`
- **THEN** 標題列右邊只有 `more_vert`；跳出標題「Expense actions」的對話框，依序列出「Delete Permanently」和「Cancel」

#### Scenario: 連點兩次

- **WHEN** 連點兩次 Coffee run 在 Trash 的卡片
- **THEN** 只推入一個唯讀明細；返回一次就回到 Trash

#### Scenario: 返回

- **WHEN** 在唯讀明細返回，或在 Android 上按返回鍵
- **THEN** 回到 Trash，分頁列仍選中 Settings

#### Scenario: 讀完之前

- **WHEN** 點 Coffee run 在 Trash 的卡片，唯讀明細還沒讀完支出
- **THEN** 沒有顯示「Expense not found.」

#### Scenario: 不在垃圾桶裡的支出

- **WHEN** Lunch 不在垃圾桶裡，以 `/settings/trash/` 加上 Lunch 的 ID 開啟 app
- **THEN** 標題是「Expense」，只顯示「Expense not found.」，標題列沒有「Expense actions」

#### Scenario: 打開之後被 Undo 還原

- **WHEN** 把 Coffee run 移到垃圾桶，提示還在時打開它的唯讀明細，再按提示的「Undo」
- **THEN** 唯讀明細只顯示「Expense not found.」，標題列沒有「Expense actions」

### Requirement: LEDGER-79.1 按 Restore 時從垃圾桶還原

WHEN 使用者在唯讀明細按「Restore」，the mobile app SHALL 不另外確認，就把這筆支出從垃圾桶還原，存好後返回 Trash，讓它不再出現在 Trash，回到支出清單上依 LEDGER-28.1 該在的位置，再算進 Your Total Share；存好之前再按一次，也只還原一次、只返回一次。

#### Scenario: 還原

- **WHEN** 依序新增日期都是 `2025-01-01` 的「E」、「F」和「D」，把 F 移到垃圾桶，在 Trash 打開 F，按「Restore」
- **THEN** 沒有跳出提示框；回到 Trash，只顯示「No deleted expenses.」；支出清單由上而下是 D、F、E

#### Scenario: 和移到垃圾桶之前一樣

- **WHEN** 還原 875 USD、Shopping、`2024-12-25`、備註「Morning treat」的 Coffee run，再打開它的明細
- **THEN** 明細依序顯示「Coffee run」、「$8.75」、「DETAILS」、「Category」、「Shopping」、「Date」、「Dec 25, 2024」、「NOTE」、「Morning treat」

#### Scenario: 存好之前

- **WHEN** 按「Restore」，還沒存好
- **THEN** 唯讀明細仍開著；存好後才返回 Trash

#### Scenario: 存好之前再按一次

- **WHEN** 按「Restore」，還沒存好時再按一次
- **THEN** 存好後只返回一次：Settings 分頁的堆疊由下而上是「Settings」根畫面和「Trash」

### Requirement: LEDGER-80.1 選 Delete Permanently 時先確認再永久刪除

WHEN 使用者在唯讀明細的 Expense actions 選「Delete Permanently」，the mobile app SHALL 跳出標題「Delete Expense?」、內容「This permanently deletes the expense.」的提示框，選項是「Cancel」和破壞性的「Delete」：按 Delete 就永久刪除這筆支出，存好後返回 Trash，它不再出現在任何畫面上，也不再算使用它的分類；按 Cancel 什麼都不變。

#### Scenario: 永久刪除

- **WHEN** Coffee run 和 Lunch 都在垃圾桶裡，在 Lunch 的唯讀明細選「Delete Permanently」，再按「Delete」
- **THEN** 回到 Trash，只剩 Coffee run 的卡片；重新啟動 app 之後，Trash 仍只有 Coffee run，支出清單上也沒有 Lunch

#### Scenario: 提示框

- **WHEN** 在唯讀明細選「Delete Permanently」
- **THEN** 跳出「Delete Expense?」，內容是「This permanently deletes the expense.」，選項是 Cancel 和破壞性的 Delete

#### Scenario: 取消

- **WHEN** 選「Delete Permanently」之後按「Cancel」
- **THEN** 唯讀明細仍開著，Lunch 仍在 Trash 裡

#### Scenario: 分類不再使用中

- **WHEN** Gym 唯一一筆支出在垃圾桶裡，把它永久刪除之後，在 Manage Categories 移除 Gym
- **THEN** 跳出「Delete Category?」

### Requirement: LEDGER-81.1 Empty Trash 先確認再清空垃圾桶

WHILE 垃圾桶裡有支出，the mobile app SHALL 在 Trash 的卡片上方顯示名稱為「Empty Trash」的按鈕；按下時跳出標題「Empty Trash?」、內容「This permanently deletes the expenses in the Trash.」的提示框，選項是「Cancel」和破壞性的「Empty Trash」：按 Empty Trash 就永久刪除垃圾桶裡所有的支出，存好後 Trash 只顯示「No deleted expenses.」；按 Cancel 什麼都不變。垃圾桶裡沒有支出時，SHALL 不顯示這個按鈕。

#### Scenario: 清空

- **WHEN** 有 Tea，把 Coffee run 和 Lunch 移到垃圾桶，在 Trash 按「Empty Trash」，再按提示框的「Empty Trash」
- **THEN** Trash 只顯示「No deleted expenses.」，沒有「Empty Trash」按鈕；Settings 根畫面的 Trash 是「0」；支出清單只有 Tea；重新啟動 app 之後也一樣

#### Scenario: 按鈕的位置

- **WHEN** 有垃圾桶裡的 Coffee run 時打開 Trash
- **THEN** 「Empty Trash」在 Coffee run 的卡片上方

#### Scenario: 提示框

- **WHEN** 按「Empty Trash」
- **THEN** 跳出「Empty Trash?」，內容是「This permanently deletes the expenses in the Trash.」，選項是 Cancel 和破壞性的 Empty Trash

#### Scenario: 取消

- **WHEN** 按「Empty Trash」之後按「Cancel」
- **THEN** Trash 仍有 Coffee run 和 Lunch 的卡片

#### Scenario: 空的

- **WHEN** 第一次啟動後打開 Trash
- **THEN** 沒有「Empty Trash」按鈕

#### Scenario: 分類不再使用中

- **WHEN** Gym 唯一一筆支出在垃圾桶裡，清空垃圾桶之後，在 Manage Categories 移除 Gym
- **THEN** 跳出「Delete Category?」

### Requirement: LEDGER-82.1 垃圾桶的變更存不進去時提示

IF 移到垃圾桶、Undo、Restore、Delete Permanently 或 Empty Trash 存不進本機資料，THEN the mobile app SHALL 跳出標題「Unable to Update Trash」、內容「Your change could not be saved. Please try again.」的提示框，畫面維持原樣，本機資料維持這個動作之前的樣子。

#### Scenario: 移到垃圾桶

- **WHEN** 資料庫無法寫入時，對 Coffee run 的卡片使用「Delete expense」
- **THEN** 跳出這個提示框，沒有 Undo 提示；Coffee run 的卡片仍在支出清單上，本機資料和之前一樣

#### Scenario: 從明細刪除

- **WHEN** 資料庫無法寫入時，在 Coffee run 的明細選「Delete」
- **THEN** 跳出這個提示框，明細仍開著

#### Scenario: Undo

- **WHEN** 把 Coffee run 移到垃圾桶之後資料庫無法寫入，按「Undo」
- **THEN** 跳出這個提示框，Undo 提示仍在，Coffee run 的卡片仍不在支出清單上

#### Scenario: Restore 和 Delete Permanently

- **WHEN** 資料庫無法寫入時，在 Coffee run 的唯讀明細按「Restore」，或選「Delete Permanently」再按「Delete」
- **THEN** 跳出這個提示框，唯讀明細仍開著，Coffee run 仍在 Trash 裡

#### Scenario: Empty Trash

- **WHEN** 資料庫無法寫入時，清空有 Coffee run 和 Lunch 的垃圾桶
- **THEN** 跳出這個提示框，Trash 仍有這兩張卡片

#### Scenario: 寫到一半失敗

- **WHEN** 移到垃圾桶或清空垃圾桶時，某一筆寫入失敗，在它之前的寫入都成功了，不論是哪一筆
- **THEN** 跳出這個提示框，本機資料和這個動作之前一樣

#### Scenario: 再試一次

- **WHEN** 失敗後資料庫恢復，再把 Coffee run 移到垃圾桶
- **THEN** Coffee run 的卡片移出支出清單，顯示 Undo 提示

### Requirement: LEDGER-83.1 (manual) 手機上的 Undo 提示

WHERE iPhone 或 Android 手機，WHILE Undo 提示顯示，the mobile app SHALL 讓它整個在 + 按鈕和分頁列的上方，不擋住它們，並讓 VoiceOver 和 TalkBack 念出它（LEDGER-73.1）。

#### Scenario: 支出清單

- **WHEN** 在支出清單把一筆支出移到垃圾桶
- **THEN** 提示整個在 + 按鈕上方；提示顯示時，+ 按鈕和分頁列都按得到

#### Scenario: Groups 分頁

- **WHEN** 提示顯示時選中 Groups 分頁
- **THEN** 提示在 Add group 的 + 按鈕上方，不擋住它

#### Scenario: 螢幕閱讀器

- **WHEN** 開著 VoiceOver 或 TalkBack 時，把 Coffee run 移到垃圾桶
- **THEN** 念出「Coffee run moved to Trash. Undo available.」，提示顯示 15 秒
