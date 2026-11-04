# Ledger

## Purpose

記帳：金額規則（每個幣別的小數位數、金額文字怎麼解析和轉回文字、金額上限、平均分攤和支出日期），以及手機 app 上新增和修改支出的支出表單、和群組分攤、存著的支出、Expenses 分頁的支出清單和支出的明細。金額規則放在 `packages/domain`，每個客戶端都照同一套套用（ADR-0002、ADR-0004）；手機 app 把支出存在本機資料裡（ADR-0006）。支出表單是新增支出的 New Expense 和修改支出的 Edit Expense。個人支出是屬於本機身分的個人空間、付款和分攤都是個人 participant 的支出（SHELL-2.1）。群組支出是屬於一個群組的空間的支出，付款和分攤都記在這個群組的成員的成員 ID 下；成員、你的成員、前成員和成員現在的名稱見 groups。你的 participant 是個人 participant，以及每個群組裡你的成員；一筆支出裡你付的，是它的付款裡你的 participant 的金額總和，你的份額是它的分攤裡你的 participant 的金額總和。和你有關的群組支出，是付款或分攤裡有你的 participant 的群組支出，分攤的金額是 0 也算。表單的空間在「Split with others」開著並選了群組時是那個群組，其他時候是個人空間；分攤的欄位是「Split with others」、群組、付款人和分攤的人；分攤的順序是分攤的人被選的先後（LEDGER-49.1），存下之後是存著的順序（LEDGER-58.1）。手機地區的幣別是手機第一個偏好的語言和地區所用的幣別。表單的幣別在 New Expense 是新支出的幣別（LEDGER-15.1），在 Edit Expense 是這筆支出的幣別；金額欄位的文字經 LEDGER-19.1 轉換後，依 LEDGER-2.1 到 LEDGER-4.1 能換成表單幣別的最小單位，就是合法的金額。表單有變更，是指金額、標題、分類、日期、備註或分攤的欄位（LEDGER-59.1）有任何一欄和打開表單時不同；比較金額、標題和備註時不管頭尾空白。裝置所在的時區是 JavaScript 執行環境回報的時區，今天是裝置所在時區的今天（LEDGER-8.1）。支出清單是 Expenses 分頁的根畫面，上方是 This Month（LEDGER-35.2），下面是支出的卡片；明細是點卡片後推入、顯示一筆支出的畫面。手機地區的貨幣格式，是手機第一個偏好的語言和地區用來顯示一個幣別的金額的格式；手機地區的日期格式見 LEDGER-30.1。刪除支出是把它移到垃圾桶：本機資料把它標成在垃圾桶裡，它的其他資料都不變，所以垃圾桶裡的支出仍是存著的支出，仍算使用它的分類（CATEGORIES-34.1、35.1、40.1）；還原是拿掉這個標記，永久刪除是把這筆支出和它的付款、分攤從本機資料刪掉。Undo 提示是支出移到垃圾桶之後，顯示在畫面底部、可以按 Undo 的提示；Undo 時間是 5 秒，螢幕閱讀器開著時是 15 秒，螢幕閱讀器是 iOS 的 VoiceOver 或 Android 的 TalkBack。Trash 是 Settings 分頁上列出垃圾桶裡的支出的畫面；唯讀明細是在 Trash 點卡片後推入、顯示垃圾桶裡一筆支出的畫面。

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

### Requirement: LEDGER-14.3 打開 New Expense 時的內容

WHEN 打開 New Expense，the mobile app SHALL 讓金額、標題和備註都是空的，分類是表單的空間未封存的分類中依儲存的順序排第一的那一個（CATEGORIES-7.4），日期是今天。

#### Scenario: 第一次啟動

- **WHEN** 第一次啟動後打開 New Expense
- **THEN** 金額、標題和備註都是空的，分類是「Food & Dining」，日期是今天

#### Scenario: 第一個分類改了名

- **WHEN** 在 Manage Categories 把 Food & Dining 改名為「Meals」，再打開 New Expense
- **THEN** 分類是「Meals」

#### Scenario: 第一個分類封存了

- **WHEN** 封存有支出使用的 Food & Dining，再打開 New Expense
- **THEN** 分類是「Transportation」

#### Scenario: 從群組打開

- **WHEN** 在 Brisbane 的 Group Categories 把 Food & Dining 改名為「Meals」，再在 Brisbane 的畫面按「Add expense」（GROUPS-64.1）
- **THEN** 分類是 Brisbane 的「Meals」；從 Expenses 分頁打開 New Expense 時，分類仍是個人空間的「Food & Dining」

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

### Requirement: LEDGER-17.4 從清單選分類

WHEN 使用者按分類按鈕，the mobile app SHALL 打開標題是「Category」的清單，依儲存的順序列出表單的空間每個未封存的分類（CATEGORIES-7.4），最後是「+ Add New Category」按鈕（LEDGER-62.1），並把表單上選的那一個標示為已選取，表單上的分類已封存時沒有標示為已選取的分類；按一個分類就選它並回到表單，按「Cancel」就回到表單、分類不變，所以沒有改選時，存檔後支出仍用那個已封存的分類，在表單開著時才封存的也一樣。

#### Scenario: 打開清單

- **WHEN** 第一次啟動後，在 New Expense 按「Category, Food & Dining」
- **THEN** 清單依序是九個預設分類和「+ Add New Category」，只有 Food & Dining 標示為已選取

#### Scenario: 新增的分類

- **WHEN** 在 Manage Categories 新增「Gym」之後，在 New Expense 打開清單
- **THEN** Gym 排在 Uncategorized 後面

#### Scenario: 群組的分類

- **WHEN** 建立「Brisbane」，在它的 Group Categories 新增「Flights」，並把 Shopping 改名為「Groceries」之後，在 New Expense 打開清單
- **THEN** 清單依序是個人空間的九個預設分類，每個名稱只出現一次；沒有 Flights，也沒有 Groceries

#### Scenario: 選了群組

- **WHEN** 同樣在 Brisbane 新增 Flights 並把 Shopping 改名為「Groceries」之後，在 New Expense 選了 Brisbane（LEDGER-46.1）再打開清單
- **THEN** 清單依序是 Food & Dining、Transportation、Groceries、Entertainment、Bills & Utilities、Health、Travel、Other、Uncategorized、Flights 和「+ Add New Category」

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

#### Scenario: 表單開著時封存

- **WHEN** 在一筆 Gym 支出的 Edit Expense，從「+ Add New Category」打開的 Manage Categories 移除 Gym 並選 Archive，按 Close，再把標題改成「Spin class」後按 Save
- **THEN** 回到表單時分類按鈕仍是「Category, Gym」；支出存的分類仍是 Gym 的 ID

#### Scenario: 搬走支出再封存

- **WHEN** 改成在那裡對 Gym 選 Move Expenses… 並按 Shopping，按 Close，再把標題改成「Spin class」後按 Save
- **THEN** 回到表單時分類按鈕仍是「Category, Gym」；支出存的分類是 Gym 的 ID

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

### Requirement: LEDGER-21.2 按 Add 存下新的個人支出

WHEN 使用者在「Split with others」關著的 New Expense 按 Add，the mobile app SHALL 存下一筆新的個人支出並關閉表單：標題和備註去掉頭尾空白，備註是空的就不存，金額是解析出來的最小單位整數，幣別、分類和日期是表單上的，付款和分攤都只有個人 participant 的全額；儲存完成前再按 Add 也只存一筆。

#### Scenario: 新增

- **WHEN** 手機地區的幣別是 USD，今天是 `2026-10-30`，輸入金額「 8.75 」、標題「 Coffee run 」、備註「 Morning treat 」後按 Add
- **THEN** 表單關閉，回到 Expenses；存下一筆個人支出：「Coffee run」、875 USD、`2026-10-30`、Food & Dining、備註「Morning treat」，付款和分攤都是個人 participant 的 875

#### Scenario: 空白的備註

- **WHEN** 備註是「   」
- **THEN** 存下的支出沒有備註

#### Scenario: 連按兩次

- **WHEN** 連按兩次 Add，第二次在儲存完成之前
- **THEN** 只多一筆支出

#### Scenario: 開了又關

- **WHEN** 打開「Split with others」選了 Brisbane，再關掉，然後輸入「8.75」和「Coffee run」按 Add
- **THEN** 存下的是個人支出，付款和分攤都是個人 participant 的 875

### Requirement: LEDGER-22.2 按 Save 存下個人支出的修改

WHEN 使用者在個人支出的 Edit Expense，「Split with others」關著時按 Save，the mobile app SHALL 照 LEDGER-21.2 的規則，用表單上的金額、標題、分類、日期和備註更新這筆支出，保留它的 ID、幣別和所屬的空間，付款和分攤改成個人 participant 的新金額，然後關閉表單。

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

### Requirement: LEDGER-32.2 沒有支出時顯示提示

WHILE 本機資料裡沒有支出清單要列出的支出（LEDGER-31.2、LEDGER-64.2），the mobile app SHALL 在支出清單上顯示「No expenses to display. Add a personal expense or get involved in a group expense.」，沒有任何卡片。

#### Scenario: 第一次啟動

- **WHEN** 第一次啟動 app
- **THEN** 支出清單顯示這句話，沒有卡片

#### Scenario: 新增第一筆支出

- **WHEN** 新增「Coffee run」
- **THEN** 這句話消失，只有 Coffee run 的卡片

#### Scenario: 只有和你無關的群組支出

- **WHEN** 只有一筆 Brisbane 的支出，Casey 付款，只有 Blake 分攤
- **THEN** 支出清單顯示這句話，沒有卡片

#### Scenario: 你有分攤的群組支出

- **WHEN** 只有一筆 Brisbane 的支出，Casey 付款，Casey 和 Taylor 分攤
- **THEN** 沒有這句話，只有它的卡片

### Requirement: LEDGER-33.2 卡片的內容

The mobile app SHALL 讓每張卡片是一個按鈕，依序顯示支出的標題、卡片金額、分類和日期，不顯示付款人和備註；分類是分類現在顏色的色點，後面接分類現在的名稱，分類已封存時名稱是「<分類現在的名稱> (Archived)」，色點和分類沒封存時一樣；螢幕閱讀器把卡片讀成一個按鈕，依序讀出標題、卡片金額、卡片上分類的名稱和日期，不讀色點。個人支出的卡片金額是它的全額。

#### Scenario: 一筆支出

- **WHEN** 存過名字「Tom」之後，新增「Coffee run」：875 USD、Food & Dining、`2026-10-30`、備註「Morning treat」
- **THEN** 卡片依序顯示「Coffee run」、「$8.75」、「Food & Dining」、「Oct 30, 2026」；卡片上沒有「Morning treat」、「Tom」或付款的字樣

#### Scenario: 螢幕閱讀器

- **WHEN** 螢幕閱讀器讀這張卡片
- **THEN** 讀出一個按鈕，依序是「Coffee run」、「$8.75」、「Food & Dining」、「Oct 30, 2026」

#### Scenario: 分類改了名

- **WHEN** 新增 Shopping 的支出之後，在 Manage Categories 把 Shopping 改名為「Groceries」
- **THEN** 卡片上的分類是「Groceries」

#### Scenario: 色點

- **WHEN** 新增 Food & Dining 的「Coffee run」
- **THEN** 卡片上「$8.75」和「Food & Dining」之間是 `#D81B60` 的色點；螢幕閱讀器只讀出「Coffee run」、「$8.75」、「Food & Dining」和「Oct 30, 2026」，不讀色點

#### Scenario: 分類改了顏色

- **WHEN** 新增 Shopping 的支出之後，在 Manage Categories 把 Shopping 改用 `#43A047`
- **THEN** 卡片上的色點是 `#43A047`

#### Scenario: 分類封存了

- **WHEN** 有 Shopping 的「Coffee run」和 Food & Dining 的「Lunch」時，封存 Shopping
- **THEN** Coffee run 的卡片依序顯示「Coffee run」、「$8.75」、「Shopping (Archived)」、「Oct 30, 2026」，螢幕閱讀器也依序讀出這四項，色點仍是 `#FBC02D`，沒有變淡；Lunch 的卡片上的分類仍是「Food & Dining」

#### Scenario: 改了名和顏色又封存

- **WHEN** 把 Shopping 改名為「Groceries」並改用 `#43A047` 之後，封存 Groceries
- **THEN** 卡片上的分類是「Groceries (Archived)」，色點是 `#43A047`

#### Scenario: 還原

- **WHEN** 封存 Shopping 之後，在 Manage Categories 點「Restore Shopping」
- **THEN** 卡片上的分類是「Shopping」，沒有「(Archived)」

### Requirement: LEDGER-34.1 卡片上的標題只佔一行

The mobile app SHALL 在卡片上只用一行顯示標題，放不下時在結尾以「…」截斷；螢幕閱讀器仍讀出完整的標題。

#### Scenario: 很長的標題

- **WHEN** 新增標題是 200 個「a」的支出
- **THEN** 卡片上的標題只佔一行，放不下的部分在結尾截斷；螢幕閱讀器讀出完整的 200 個「a」

### Requirement: LEDGER-35.2 This Month 依幣別加總這個月的卡片金額，點了打開 Insights

The mobile app SHALL 在支出清單的卡片上方，為日期在這個月的卡片用到的每個幣別各顯示一行「This Month: <這個幣別、日期在這個月的卡片金額的總和>」，依幣別代碼排序，這個月是今天所在的月份；沒有日期在這個月的卡片時只顯示一行「This Month: —」。這幾行合成一個按鈕，螢幕閱讀器讀出「View expense insights. Spent this month <依同樣的順序、以「, 」隔開的每個總和>.」，沒有日期在這個月的卡片時讀出「View expense insights. Nothing spent this month.」；按一下就以 `/insights` 推入個人的 Insights（INSIGHTS-13.1），連按兩次也只推入一個。

#### Scenario: 一個幣別

- **WHEN** 今天是 `2026-10-30`，有日期是今天的 875 USD 和 1250 USD 兩筆支出
- **THEN** 卡片上方只有「This Month: $21.25」；螢幕閱讀器把它讀成按鈕「View expense insights. Spent this month $21.25.」

#### Scenario: 幾個幣別

- **WHEN** 依序新增日期都是今天的 30 AUD、875 USD、1200 JPY
- **THEN** 卡片由上而下是 JPY、USD、AUD 的支出；卡片上方由上而下是「This Month: A$0.30」、「This Month: ¥1,200」、「This Month: $8.75」，螢幕閱讀器讀出「View expense insights. Spent this month A$0.30, ¥1,200, $8.75.」

#### Scenario: 只算這個月

- **WHEN** 今天是 `2026-10-30`，有日期是 `2026-10-01` 的 875 USD、`2026-09-30` 的 1250 USD 和 `2025-10-15` 的 300 USD
- **THEN** 三張卡片都在支出清單上，卡片上方只有「This Month: $8.75」

#### Scenario: 這個月沒有支出

- **WHEN** 今天是 `2026-10-30`，只有日期是 `2026-09-30` 的支出
- **THEN** 它的卡片在支出清單上，卡片上方只有「This Month: —」，螢幕閱讀器讀出「View expense insights. Nothing spent this month.」

#### Scenario: 月初，UTC 還在上個月

- **WHEN** 手機的時區是 `Asia/Taipei`，當地是 `2026-11-01` 上午 0:30（UTC 還是 10 月 31 日），有日期是 `2026-10-31` 和 `2026-11-01` 的 875 USD 和 300 USD
- **THEN** 卡片上方只有「This Month: $3.00」

#### Scenario: 按一下

- **WHEN** 有 875 USD 的支出時按「This Month: $8.75」
- **THEN** 分頁列仍選中 Expenses，Expenses 分頁的堆疊由下而上是「Expenses」根畫面和「Insights」，網址是 `/insights`

#### Scenario: 連按兩次

- **WHEN** 連按兩次「This Month: $8.75」
- **THEN** 只推入一個 Insights；返回一次就回到支出清單

#### Scenario: 沒有支出

- **WHEN** 第一次啟動 app
- **THEN** 卡片上方只有「This Month: —」，螢幕閱讀器讀出「View expense insights. Nothing spent this month.」；按了推入 Insights

#### Scenario: 修改之後

- **WHEN** 把 875 USD 的支出的金額改成「12.50」
- **THEN** 回到支出清單時是「This Month: $12.50」

#### Scenario: 總和超過單筆的上限

- **WHEN** 有兩筆日期是今天的 999,999,999,999 USD 的支出
- **THEN** 是「This Month: $19,999,999,999.98」

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

### Requirement: LEDGER-37.2 明細的內容

The mobile app SHALL 在明細上依序顯示支出的標題、金額、「DETAILS」區塊裡的「Category」和分類、「Date」和日期，有備註時再顯示「NOTE」區塊和備註；分類和卡片上的一樣，是分類現在顏色的色點，後面接分類現在的名稱，分類已封存時名稱是「<分類現在的名稱> (Archived)」，色點和分類沒封存時一樣，螢幕閱讀器不讀色點；標題和備註都完整顯示，不截斷。

#### Scenario: 有備註

- **WHEN** 打開「Coffee run」的明細：875 USD、Shopping、`2024-12-25`、備註「Morning treat」
- **THEN** 依序顯示「Coffee run」、「$8.75」、「DETAILS」、「Category」、「Shopping」、「Date」、「Dec 25, 2024」、「NOTE」、「Morning treat」

#### Scenario: 沒有備註

- **WHEN** 打開沒有備註的支出的明細
- **THEN** 沒有「NOTE」區塊

#### Scenario: 分類改了名

- **WHEN** 把 Shopping 改名為「Groceries」之後，打開這筆支出的明細
- **THEN** 分類是「Groceries」

#### Scenario: 色點

- **WHEN** 打開 Shopping 的支出的明細
- **THEN** 「Category」後面、「Shopping」前面是 `#FBC02D` 的色點，螢幕閱讀器不讀這個色點

#### Scenario: 分類改了顏色

- **WHEN** 把 Shopping 改用 `#43A047` 之後，打開這筆支出的明細
- **THEN** 色點是 `#43A047`

#### Scenario: 分類封存了

- **WHEN** 封存 Shopping 之後，打開 Shopping 的支出的明細
- **THEN** 依序顯示「DETAILS」、「Category」、「Shopping (Archived)」、「Date」，色點仍是 `#FBC02D`，沒有變淡

#### Scenario: 改了名和顏色又封存

- **WHEN** 把 Shopping 改名為「Groceries」並改用 `#43A047` 之後，封存 Groceries，再打開這筆支出的明細
- **THEN** 分類是「Groceries (Archived)」，色點是 `#43A047`

#### Scenario: 明細開著時封存和還原

- **WHEN** Shopping 的支出的明細開著時，在 Settings 分頁封存 Shopping，再回到 Expenses 分頁
- **THEN** 明細仍開著，分類是「Shopping (Archived)」；再到 Manage Categories 點「Restore Shopping」，回到 Expenses 分頁時，分類是「Shopping」，沒有「(Archived)」

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

The mobile app SHALL 讓卡片、This Month 和明細，用手機地區的貨幣格式和幣別的小數位數（LEDGER-1.1）顯示金額，讓卡片和明細用手機地區的日期格式（LEDGER-30.1）顯示支出的日期，日期不因手機的時區提早或延後一天。

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

### Requirement: LEDGER-41.2 (manual) 手機上的金額和日期格式

WHERE iPhone 或 Android 手機，the mobile app SHALL 讓卡片、This Month 和明細，依手機的語言和地區顯示金額和日期（LEDGER-40.1），在 UTC 以東的時區，日期也不提早一天；格式由各個平台決定，iPhone 和 Android 可以不一樣。

#### Scenario: 英文（美國）

- **WHEN** 手機的語言和地區設成英文（美國），新增 8.75 USD 的支出
- **THEN** 卡片和明細的金額是「$8.75」，日期是今天，例如「Oct 30, 2026」；This Month 是「This Month: $8.75」

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

### Requirement: LEDGER-43.2 讀完支出之前不顯示沒有支出的樣子

WHILE 支出清單還沒讀完存著的支出，the mobile app SHALL 不顯示 LEDGER-32.2 的提示和「This Month: —」。

#### Scenario: 開啟 app

- **WHEN** 有 Coffee run 時開啟 app，支出清單還沒讀完存著的支出
- **THEN** 支出清單沒有「No expenses to display. Add a personal expense or get involved in a group expense.」和「This Month: —」；讀完之後顯示 Coffee run 的卡片

### Requirement: LEDGER-44.2 從明細返回時清單已經是新的

WHEN 從明細打開的 Edit Expense 存好支出，the mobile app SHALL 在從明細返回之前，就讓明細底下的支出清單顯示存著的卡片和 This Month，返回時不先出現修改前的內容。

#### Scenario: 改了金額再返回

- **WHEN** 在 875 USD 的 Coffee run 的明細按「Edit」，把金額改成「9.25」後按 Save，再從明細返回
- **THEN** 支出清單一出現就是「$9.25」和「This Month: $9.25」，沒有先出現「$8.75」

### Requirement: LEDGER-45.1 「Split with others」開關

The mobile app SHALL 在支出表單的備註欄位下面放一個名稱是「Split with others」的開關；打開 New Expense 時它是關著的，以群組的網址打開時除外（LEDGER-52.1），打開個人支出的 Edit Expense 時也是關著的。

#### Scenario: New Expense

- **WHEN** 第一次啟動後打開 New Expense
- **THEN** 備註欄位下面是名稱「Split with others」、關著的開關；表單上沒有「Group」、「Paid by」和「Split between」

#### Scenario: 個人支出的 Edit Expense

- **WHEN** 打開「Coffee run」的 Edit Expense
- **THEN** 「Split with others」關著

### Requirement: LEDGER-46.1 打開開關時選群組

WHEN 使用者打開「Split with others」，或按「Group」，the mobile app SHALL 打開標題是「Select Group」的清單，依建立的先後列出每個未封存的群組（GROUPS-2.2），每個群組是名稱為群組名稱的按鈕，表單上選的群組標示為已選取，並有「Cancel」按鈕；按一個群組就選它並回到表單，按 Cancel 就回到表單，選的群組不變，開關仍開著。

#### Scenario: 打開開關

- **WHEN** 依序建立 Brisbane、Tokyo、Paris 並封存 Tokyo 之後，在 New Expense 打開「Split with others」
- **THEN** 打開「Select Group」，依序是 Brisbane 和 Paris，沒有標示為已選取的群組

#### Scenario: 選群組

- **WHEN** 按「Brisbane」
- **THEN** 回到表單，開關開著，有「Group, Brisbane」；按「Group, Brisbane」時，Select Group 裡 Brisbane 標示為已選取

#### Scenario: 取消

- **WHEN** 打開開關後按「Cancel」
- **THEN** 回到表單，開關仍開著，有「Group, not selected」

#### Scenario: 選了群組之後取消

- **WHEN** 選了 Brisbane 和付款人 Taylor 之後，按「Group, Brisbane」，再按「Cancel」
- **THEN** 仍是「Group, Brisbane」和「Paid by, Taylor (You)」

#### Scenario: 還沒有群組

- **WHEN** 還沒有任何群組時打開開關
- **THEN** Select Group 沒有任何群組，只有「Cancel」

### Requirement: LEDGER-47.1 開關下面的 Group、Paid by 和 Split between

WHILE「Split with others」開著，the mobile app SHALL 在開關下面放名稱是「Group, <群組名稱>」的按鈕，還沒選群組時是「Group, not selected」；選了群組之後，再依序放名稱是「Paid by, <付款人>」的按鈕，還沒選付款人時是「Paid by, not selected」，以及依分攤的人數名稱是「Split between, Choose people」、「Split between, 1 person」或「Split between, <人數> people」的按鈕。付款人是成員現在的名稱，你的成員後面加上「 (You)」，前成員是他存著的名稱；分攤的人數也算前成員。開關關著時，這三個按鈕都不顯示。

#### Scenario: 還沒選群組

- **WHEN** 在 New Expense 打開開關，在 Select Group 按 Cancel
- **THEN** 開關下面只有「Group, not selected」

#### Scenario: 選了群組

- **WHEN** 名字是「Taylor」，選了 Brisbane
- **THEN** 開關下面依序是「Group, Brisbane」、「Paid by, not selected」和「Split between, Choose people」

#### Scenario: 選了付款人和分攤的人

- **WHEN** 選 Taylor 為付款人，再依序選 Casey 和 Taylor 分攤
- **THEN** 是「Paid by, Taylor (You)」和「Split between, 2 people」；只選 Casey 時是「Split between, 1 person」

#### Scenario: 有前成員

- **WHEN** Casey 付款、依序分給 Blake、Taylor 和 Casey 的 Dinner，把 Casey 和 Blake 移出 Brisbane 之後，打開它的 Edit Expense
- **THEN** 是「Paid by, Casey」和「Split between, 3 people」

#### Scenario: 關掉開關

- **WHEN** 關掉「Split with others」
- **THEN** 沒有「Group」、「Paid by」和「Split between」

### Requirement: LEDGER-48.1 選付款人

WHEN 使用者按「Paid by」，the mobile app SHALL 打開標題是「Who Paid?」的清單，依 GROUPS-24.2 的順序列出選的群組的每位成員，你那一列是你的成員名稱加上「 (You)」，別人那一列是他現在的名稱，每一列是按鈕，付款人標示為已選取，並有「Cancel」按鈕；按一位成員就選他為付款人並回到表單，按 Cancel 就回到表單、付款人不變。

#### Scenario: 列出成員

- **WHEN** 名字是「Taylor」，Brisbane 依序加入 Casey 和 Blake，在 New Expense 選 Brisbane 後按「Paid by, not selected」
- **THEN** 打開「Who Paid?」，依序是「Taylor (You)」、「Casey」和「Blake」，沒有標示為已選取的成員

#### Scenario: 選付款人

- **WHEN** 按「Casey」
- **THEN** 回到表單，有「Paid by, Casey」；再打開時 Casey 標示為已選取

#### Scenario: 取消

- **WHEN** 付款人是 Casey 時打開 Who Paid?，按 Cancel
- **THEN** 回到表單，仍是「Paid by, Casey」

#### Scenario: 不列出前成員

- **WHEN** 把 Casey 移出 Brisbane 之後，在 New Expense 選 Brisbane 並按「Paid by, not selected」
- **THEN** 依序是「Taylor (You)」和「Blake」

### Requirement: LEDGER-49.1 選分攤的人

WHEN 使用者按「Split between」，the mobile app SHALL 打開標題是「Split Between」的清單，依 GROUPS-24.2 的順序列出選的群組的每位成員，名稱同 LEDGER-48.1，每一列是按鈕，分攤的人標示為已選取，並有「Done」按鈕；按一位還不是分攤的人的成員，就把他加在分攤的順序的最後，按一位分攤的人就把他拿掉；按 Done 回到表單。

#### Scenario: 選兩位

- **WHEN** 在 Split Between 依序按「Casey」和「Taylor (You)」，再按 Done
- **THEN** 按完時 Casey 和 Taylor (You) 標示為已選取，Blake 沒有；回到表單是「Split between, 2 people」，分攤的順序是 Casey、Taylor

#### Scenario: 再按一次就拿掉

- **WHEN** 再打開 Split Between，按「Casey」，再按 Done
- **THEN** Casey 不再標示為已選取；是「Split between, 1 person」

#### Scenario: 拿掉再選

- **WHEN** 依序選 Casey、Taylor 和 Blake，拿掉 Casey，再選 Casey
- **THEN** 分攤的順序是 Taylor、Blake、Casey

#### Scenario: 不列出前成員

- **WHEN** 把 Casey 移出 Brisbane 之後，在 New Expense 選 Brisbane 並按「Split between, Choose people」
- **THEN** 依序是「Taylor (You)」和「Blake」

### Requirement: LEDGER-50.1 換群組或關掉開關時清空付款人和分攤的人

WHEN 使用者在 Select Group 選了和表單上不同的群組，或關掉「Split with others」，the mobile app SHALL 清空付款人和分攤的人，關掉開關時也清空選的群組；在 Select Group 選表單上同一個群組時，付款人和分攤的人都不變。

#### Scenario: 換群組

- **WHEN** 在 Brisbane 選了付款人和分攤的人之後，按「Group, Brisbane」改選 Tokyo
- **THEN** 是「Group, Tokyo」、「Paid by, not selected」和「Split between, Choose people」

#### Scenario: 選同一個群組

- **WHEN** 在 Brisbane 選了 Taylor 付款、Casey 分攤之後，按「Group, Brisbane」再選 Brisbane
- **THEN** 仍是「Paid by, Taylor (You)」和「Split between, 1 person」

#### Scenario: 關掉再打開

- **WHEN** 選好 Brisbane、付款人和分攤的人之後關掉開關，再打開
- **THEN** Select Group 沒有標示為已選取的群組；選 Brisbane 後是「Paid by, not selected」和「Split between, Choose people」

### Requirement: LEDGER-51.1 表單的空間改變時換分類

WHEN 表單的空間改變，the mobile app SHALL 把表單上的分類換成新的空間裡和它同名（CATEGORIES-4.1）的未封存分類，新的空間沒有這樣的分類時，換成新的空間的 Uncategorized。

#### Scenario: 有同名的分類

- **WHEN** 在 New Expense 選 Shopping，再打開開關選 Brisbane
- **THEN** 分類按鈕是「Category, Shopping」；選好付款人和分攤的人後按 Add，支出存的是 Brisbane 的 Shopping 的 ID

#### Scenario: 名稱的大小寫不同

- **WHEN** 個人空間有「Gym」，Brisbane 有「GYM」，選 Gym 後選 Brisbane
- **THEN** 分類按鈕是「Category, GYM」

#### Scenario: 沒有同名的分類

- **WHEN** 選了個人空間的 Gym 之後選 Brisbane，而 Brisbane 沒有 Gym
- **THEN** 分類按鈕是「Category, Uncategorized」，存的是 Brisbane 的 Uncategorized 的 ID

#### Scenario: 同名的分類封存了

- **WHEN** Brisbane 的 Shopping 封存之後，在 New Expense 選 Shopping 再選 Brisbane
- **THEN** 分類按鈕是「Category, Uncategorized」

#### Scenario: 換群組

- **WHEN** Brisbane 和 Tokyo 都新增了「Flights」，在 Brisbane 選了 Flights 之後改選 Tokyo
- **THEN** 分類按鈕是「Category, Flights」，存的是 Tokyo 的 Flights 的 ID

#### Scenario: 關掉開關

- **WHEN** 在 Brisbane 選了 Flights 之後關掉開關，而個人空間沒有 Flights
- **THEN** 分類按鈕是「Category, Uncategorized」，存的是個人空間的 Uncategorized 的 ID

### Requirement: LEDGER-52.1 以群組的網址打開 New Expense

WHEN 以 `/expenses/new?groupId=<群組 ID>` 打開 New Expense，而這是未封存群組的群組 ID，the mobile app SHALL 讓「Split with others」開著並選了這個群組，付款人和分攤的人都還沒選；這不是任何群組的群組 ID，或群組已封存時，照 LEDGER-14.3 和 LEDGER-45.1 打開，開關關著。

#### Scenario: 未封存的群組

- **WHEN** 在 Brisbane 的 Group Categories 把 Food & Dining 改名為「Meals」之後，以 `/expenses/new?groupId=` 加上 Brisbane 的群組 ID 打開
- **THEN** 開關開著，是「Group, Brisbane」、「Paid by, not selected」和「Split between, Choose people」，分類是「Meals」

#### Scenario: 找不到的群組

- **WHEN** 以 `/expenses/new?groupId=00000000-0000-4000-8000-000000000000` 打開
- **THEN** 開關關著，分類是個人空間的「Food & Dining」

#### Scenario: 封存的群組

- **WHEN** 封存 Brisbane 之後，以 `/expenses/new?groupId=` 加上它的群組 ID 打開
- **THEN** 開關關著；打開開關時，Select Group 沒有 Brisbane

### Requirement: LEDGER-53.1 分攤還沒選好時停用 Add 或 Save

WHILE「Split with others」開著，卻還沒選群組、付款人，或沒有任何一位分攤的人，the mobile app SHALL 停用 Add 或 Save（SHELL-49.1）。

#### Scenario: 還沒選群組

- **WHEN** 金額是「8.75」、標題是「Coffee」時打開開關，在 Select Group 按 Cancel
- **THEN** Add 停用

#### Scenario: 還沒選付款人

- **WHEN** 選了 Brisbane，也選了 Casey 分攤，還沒選付款人
- **THEN** Add 停用；選 Taylor 為付款人後 Add 可以按

#### Scenario: 沒有分攤的人

- **WHEN** 選了 Brisbane 和付款人，還沒選分攤的人
- **THEN** Add 停用；在 Split Between 選了 Casey 又拿掉後，Add 仍停用

#### Scenario: Edit Expense

- **WHEN** 在群組支出的 Edit Expense 改了標題，再把分攤的人都拿掉
- **THEN** Save 停用

### Requirement: LEDGER-54.1 按 Add 存下群組支出

WHEN 使用者在「Split with others」開著的 New Expense 按 Add，the mobile app SHALL 存下一筆屬於選的群組的新支出並關閉表單：標題、備註、金額、幣別、分類和日期照 LEDGER-21.2 的規則，付款只有付款人的全額，分攤是照 LEDGER-6.1 依分攤的順序把金額平均分給分攤的人，都記在他們的成員 ID 下；儲存完成前再按 Add 也只存一筆。

#### Scenario: 除不盡

- **WHEN** Brisbane 有 Taylor、Casey 和 Blake，輸入金額「100.01」、標題「Dinner」，Casey 付款，依序選 Blake、Taylor 和 Casey 分攤，按 Add
- **THEN** 表單關閉；存下一筆空間是 Brisbane 的「Dinner」，10001 USD，付款是 Casey 的 10001，分攤依序是 Blake 3334、Taylor 3334、Casey 3333

#### Scenario: 付款人不分攤

- **WHEN** Taylor 付款，依序選 Casey 和 Blake 分攤
- **THEN** 付款是 Taylor 的 10001，分攤依序是 Casey 5001、Blake 5000

#### Scenario: 你沒有付款也沒有分攤

- **WHEN** Casey 付款，只選 Blake 分攤
- **THEN** 存下這筆支出，付款和分攤裡都沒有 Taylor

#### Scenario: 金額比人數少

- **WHEN** 金額是「0.01」，依序選 Casey 和 Blake 分攤
- **THEN** 分攤依序是 Casey 1、Blake 0

#### Scenario: 連按兩次

- **WHEN** 連按兩次 Add，第二次在儲存完成之前
- **THEN** 只多一筆支出

### Requirement: LEDGER-55.1 打開群組支出的 Edit Expense

WHEN 打開群組支出的 Edit Expense，the mobile app SHALL 照 LEDGER-16.1 帶入這筆支出，讓「Split with others」開著並選了它的群組，付款人是它的付款人，分攤的人依存下的順序是它的分攤的人，並停用開關和「Group」，所以不能換群組，也不能改成個人支出。

#### Scenario: 帶入

- **WHEN** 打開 Brisbane 的「Dinner」的 Edit Expense：Casey 付款，依序是 Blake、Taylor 和 Casey 分攤
- **THEN** 開關開著且停用，「Group, Brisbane」停用，是「Paid by, Casey」和「Split between, 3 people」；Split Between 裡三位都標示為已選取

#### Scenario: 成員改了名

- **WHEN** 把 Casey 改名為「Cass」之後，打開 Dinner 的 Edit Expense
- **THEN** 是「Paid by, Cass」

#### Scenario: 分類清單

- **WHEN** 在 Dinner 的 Edit Expense 打開分類清單
- **THEN** 列出 Brisbane 的分類

### Requirement: LEDGER-56.1 按 Save 存下群組支出的修改

WHEN 使用者在群組支出的 Edit Expense 按 Save，the mobile app SHALL 照 LEDGER-21.2 的規則更新標題、備註、金額、分類和日期，保留它的 ID、幣別和群組，付款改成付款人的全額，分攤改成照 LEDGER-6.1 依分攤的順序把金額平均分給分攤的人，然後關閉表單。

#### Scenario: 只改金額

- **WHEN** Casey 付款、分攤依序是 Blake、Taylor、Casey 的 10001 USD 的 Dinner，金額改成「100.00」後按 Save
- **THEN** 付款是 Casey 的 10000，分攤依序是 Blake 3334、Taylor 3333、Casey 3333

#### Scenario: 改付款人

- **WHEN** 把付款人改成 Taylor 後按 Save
- **THEN** 付款是 Taylor 的 10001，分攤不變

#### Scenario: 新選的人排在最後

- **WHEN** 分攤依序是 Blake 和 Taylor 的 10001 USD 的支出，再選 Casey 後按 Save
- **THEN** 分攤依序是 Blake 3334、Taylor 3334、Casey 3333

#### Scenario: 拿掉再選

- **WHEN** 分攤依序是 Blake、Taylor、Casey，拿掉 Blake 再選 Blake，並把標題改成「Supper」後按 Save
- **THEN** 分攤依序是 Taylor 3334、Casey 3334、Blake 3333

### Requirement: LEDGER-57.1 把個人支出改成群組支出

WHEN 使用者在個人支出的 Edit Expense 打開「Split with others」，選好群組、付款人和分攤的人後按 Save，the mobile app SHALL 照 LEDGER-56.1 的規則把這筆支出存成屬於選的群組的支出，保留它的 ID 和幣別，然後關閉表單。

#### Scenario: 改成群組支出

- **WHEN** 把 875 USD 的「Coffee run」改成 Brisbane 的支出，Taylor 付款，依序選 Taylor 和 Casey 分攤，按 Save
- **THEN** 仍只有這一筆支出，ID 不變，空間是 Brisbane，付款是 Taylor 的 875，分攤依序是 Taylor 438、Casey 437，分類是 Brisbane 的 Food & Dining

#### Scenario: 再打開

- **WHEN** 之後再打開它的 Edit Expense
- **THEN** 「Split with others」開著且停用

### Requirement: LEDGER-58.1 存下分攤的順序

The mobile app SHALL 在本機資料保存群組支出的分攤的順序，重新啟動 app 之後，Edit Expense 和明細都還是照這個順序（LEDGER-55.1、56.1、66.1）。

#### Scenario: 讀回存著的支出

- **WHEN** 存下分攤依序是 Blake、Taylor、Casey 的 10001 USD 的 Dinner，重新啟動 app
- **THEN** 存著的 Dinner 的分攤依序是 Blake、Taylor、Casey

#### Scenario: 重新啟動之後改金額

- **WHEN** 重新啟動之後，把 Dinner 的金額改成「100.00」後按 Save
- **THEN** 分攤依序是 Blake 3334、Taylor 3333、Casey 3333

### Requirement: LEDGER-59.1 分攤的欄位也是表單的欄位

The mobile app SHALL 讓「Split with others」、群組、付款人和分攤的人（不管順序）任何一個和打開表單時不同，都算表單有變更（LEDGER-20.1、23.1、24.1），並在支出儲存中和其他欄位一樣不能操作（LEDGER-25.1）。

#### Scenario: 只打開開關

- **WHEN** 在 New Expense 只打開「Split with others」，在 Select Group 按 Cancel，再按表單的 Cancel
- **THEN** 跳出「Discard Changes?」

#### Scenario: 打開又關掉

- **WHEN** 打開開關、選了 Brisbane 之後關掉開關，再按 Cancel
- **THEN** 表單直接關閉，沒有提示框

#### Scenario: 只改付款人

- **WHEN** 在 Casey 付款的 Dinner 的 Edit Expense 只把付款人改成 Taylor
- **THEN** Save 可以按；改回 Casey 後 Save 停用

#### Scenario: 拿掉再選同一位

- **WHEN** 只在 Split Between 拿掉 Blake 再選 Blake
- **THEN** Save 停用

#### Scenario: 儲存中

- **WHEN** 選好群組、付款人和分攤的人後按 Add，儲存還沒完成
- **THEN** 開關、「Group」、「Paid by」和「Split between」都不能操作

### Requirement: LEDGER-60.1 有前成員時不能改金額和分攤

WHILE 修改的群組支出的付款人或分攤的人裡有前成員，the mobile app SHALL 停用金額欄位、「Paid by」和「Split between」，在金額欄位下面顯示「Someone in this expense was removed from this group, so its amount and split can't be changed here. Other details can still be saved.」，按 Save 時付款和分攤都不變；標題、分類、日期和備註照常可以改。

#### Scenario: 分攤的人被移出

- **WHEN** 分攤依序是 Blake、Taylor、Casey 的 Dinner，把 Blake 移出 Brisbane 之後，打開它的 Edit Expense
- **THEN** 金額欄位、「Paid by」和「Split between」都停用，金額欄位下面是這句話

#### Scenario: 改其他欄位

- **WHEN** 把標題改成「Supper」後按 Save
- **THEN** 標題是「Supper」，付款和分攤都和之前一樣，Blake 的分攤也還在

#### Scenario: 付款人被移出

- **WHEN** 把付款人 Casey 移出 Brisbane 之後，打開 Dinner 的 Edit Expense，把標題改成「Supper」後按 Save
- **THEN** 打開時金額欄位、「Paid by」和「Split between」都停用，有這句話；存好之後標題是「Supper」，付款和分攤都和之前一樣

#### Scenario: 加回來

- **WHEN** 把 Blake 加回 Brisbane（GROUPS-34.2）之後，打開 Dinner 的 Edit Expense
- **THEN** 都可以操作，沒有這句話

### Requirement: LEDGER-61.1 修改封存群組的支出時擋下

IF 使用者在封存群組的支出的 Edit Expense 按 Save，THEN the mobile app SHALL 不儲存，跳出標題「Historical Shared Expense」、內容「Restore its group before editing this expense.」的提示框，表單保持開啟並保留輸入。

#### Scenario: 封存之後

- **WHEN** 封存 Brisbane 之後，以 `/expenses/<Dinner 的 ID>/edit` 打開，把標題改成「Supper」後按 Save
- **THEN** 跳出這個提示框，表單仍開著，標題是「Supper」；存著的 Dinner 沒有改變

#### Scenario: 還原之後

- **WHEN** 還原 Brisbane 之後，再把 Dinner 的標題改成「Supper」並按 Save
- **THEN** 表單關閉，Dinner 的標題是「Supper」

### Requirement: LEDGER-62.1 從分類清單打開分類的畫面

WHEN 使用者在分類清單按「+ Add New Category」，the mobile app SHALL 關閉分類清單，打開表單的空間的 Manage Categories 或 Group Categories（CATEGORIES-22.2、23.3），網址是 `/manage-categories`，表單的空間是群組時加上 `?scopeKind=group&spaceId=<群組 ID>`；它和支出表單一樣從畫面底部升起、蓋在表單上（LEDGER-12.1），標題列有取消「Close」和 CATEGORIES-7.4 的「Add category」，按 Close、往下滑或按 Android 的返回鍵時關閉它，回到表單，表單上的輸入都不變。

#### Scenario: 個人空間

- **WHEN** 在 New Expense 輸入「8.75」和「Coffee」，打開分類清單並按「+ Add New Category」
- **THEN** 標題是「Manage Categories」的畫面蓋在 New Expense 上，標題列有「Close」和「Add category」，網址是 `/manage-categories`

#### Scenario: 群組

- **WHEN** 選了 Brisbane 之後，打開分類清單並按「+ Add New Category」
- **THEN** 打開 Brisbane 的 Group Categories，網址是 `/manage-categories?scopeKind=group&spaceId=` 加上 Brisbane 的群組 ID

#### Scenario: 新增分類後關閉

- **WHEN** 在這裡新增「Gym」，再按 Close
- **THEN** 回到 New Expense，金額是「8.75」，標題是「Coffee」，分類仍是「Category, Food & Dining」；打開分類清單時 Gym 排在 Uncategorized 後面

#### Scenario: 改名

- **WHEN** 表單上的分類是 Shopping 時，在這裡把 Shopping 改名為「Groceries」，再按 Close
- **THEN** 分類按鈕是「Category, Groceries」

#### Scenario: 往下滑或按返回鍵

- **WHEN** iOS 上往下滑它，或在 Android 上按返回鍵
- **THEN** 回到表單，輸入都不變

### Requirement: LEDGER-63.1 表單開著時分類被刪除

IF 表單開著時，表單上的分類被刪除（CATEGORIES-34.1），THEN the mobile app SHALL 把表單上的分類換成表單的空間的 Uncategorized。

#### Scenario: 刪除新增的分類

- **WHEN** 在 New Expense 從「+ Add New Category」新增「Gym」，關閉後選 Gym，再從「+ Add New Category」移除 Gym 並按 Delete，然後按 Close
- **THEN** 分類按鈕是「Category, Uncategorized」；輸入金額和標題後按 Add，支出存的是個人空間的 Uncategorized 的 ID

#### Scenario: 群組的分類

- **WHEN** 在選了 Brisbane 的 New Expense，從「+ Add New Category」新增「Flights」並選它，再從「+ Add New Category」刪除 Flights
- **THEN** 分類按鈕是「Category, Uncategorized」，是 Brisbane 的 Uncategorized

### Requirement: LEDGER-64.2 支出清單也列出和你有關的群組支出

The mobile app SHALL 在支出清單上，和個人支出一起依 LEDGER-28.1 的順序列出每筆不在垃圾桶裡、和你有關的群組支出的卡片，封存的群組的也列出；和你無關的群組支出不列出。

#### Scenario: 你分攤的

- **WHEN** Brisbane 有一筆 Casey 付款、Taylor 和 Casey 分攤的「Dinner」
- **THEN** 支出清單有 Dinner 的卡片

#### Scenario: 只有你付款

- **WHEN** Taylor 付款，只有 Casey 和 Blake 分攤
- **THEN** 支出清單有這筆的卡片

#### Scenario: 你分攤到 0

- **WHEN** Casey 付款，0.01 USD 依序分給 Casey 和 Taylor
- **THEN** 支出清單有這筆的卡片

#### Scenario: 和你無關的

- **WHEN** Casey 付款，只有 Blake 分攤
- **THEN** 支出清單沒有這筆的卡片

#### Scenario: 和個人支出排在一起

- **WHEN** 依序新增日期是 `2025-01-02` 的個人支出「Coffee run」、`2025-01-03` 的 Brisbane 的「Dinner」、`2025-01-01` 的 Brisbane 的「Taxi」，Taylor 都有分攤
- **THEN** 卡片由上而下是 Dinner、Coffee run、Taxi

#### Scenario: 封存的群組

- **WHEN** 封存 Brisbane
- **THEN** Dinner 的卡片仍在

#### Scenario: 垃圾桶裡的

- **WHEN** 把 Dinner 移到垃圾桶
- **THEN** 支出清單沒有 Dinner 的卡片

### Requirement: LEDGER-65.3 群組支出的卡片

The mobile app SHALL 讓群組支出的卡片在分類和日期之間顯示群組的名稱，群組已封存時是「<群組名稱> · Archived」，螢幕閱讀器也在同樣的位置讀出它；群組支出的卡片金額是你的份額，只有付款沒有分攤時是 0，所以 This Month 也只算你的份額（LEDGER-35.2）。

#### Scenario: 卡片

- **WHEN** Brisbane 有 `2026-10-30` 的「Dinner」，10001 USD、Food & Dining，依序分給 Blake、Taylor 和 Casey
- **THEN** 卡片依序顯示「Dinner」、「$33.34」、「Food & Dining」、「Brisbane」、「Oct 30, 2026」；螢幕閱讀器讀出一個按鈕，依序是這五項

#### Scenario: 只有你付款

- **WHEN** Taylor 付款，只有 Casey 和 Blake 分攤
- **THEN** 卡片金額是「$0.00」

#### Scenario: This Month

- **WHEN** 除了 Dinner，還有一筆 875 USD 的個人支出
- **THEN** 是「This Month: $42.09」

#### Scenario: 封存和還原

- **WHEN** 封存 Brisbane
- **THEN** 卡片上是「Brisbane · Archived」；還原後是「Brisbane」

#### Scenario: 群組改了名

- **WHEN** 把 Brisbane 改名為「Sydney」
- **THEN** 卡片上是「Sydney」

### Requirement: LEDGER-66.2 群組支出的明細

WHEN 打開群組支出的明細，the mobile app SHALL 依序顯示標題、全額，「YOUR POSITION」區塊裡的「You paid」和你付的、「Your share」和你的份額，以及你付的減你的份額大於 0 時的「You are owed」、小於 0 時的「You owe」、等於 0 時的「Settled up」和兩者差額的絕對值，然後是「PAID BY」和「SPLIT」區塊，依存下的順序每位付款人或分攤的人一列，是他現在的名稱（你的成員加上「 (You)」，前成員是他存著的名稱）和他的金額，再來是「DETAILS」區塊，在「Category」前面多一列「Group」和群組名稱，其餘照 LEDGER-37.2；標題列和個人支出的明細一樣，有「Edit」（LEDGER-38.1）和它右邊的「Expense actions」（LEDGER-72.2）。

#### Scenario: 你付的比份額多

- **WHEN** 打開 Brisbane 的「Dinner」的明細：`2026-10-30`、Food & Dining、6000 USD，Taylor 付款，依序分給 Taylor、Casey 和 Blake
- **THEN** 依序是「Dinner」、「$60.00」、「YOUR POSITION」、「You paid」、「$60.00」、「Your share」、「$20.00」、「You are owed」、「$40.00」、「PAID BY」、「Taylor (You)」、「$60.00」、「SPLIT」、「Taylor (You)」、「$20.00」、「Casey」、「$20.00」、「Blake」、「$20.00」、「DETAILS」、「Group」、「Brisbane」、「Category」、「Food & Dining」、「Date」、「Oct 30, 2026」

#### Scenario: 你付的比份額少

- **WHEN** 改成 Casey 付款
- **THEN** 是「You paid」「$0.00」、「Your share」「$20.00」、「You owe」「$20.00」，PAID BY 是「Casey」「$60.00」

#### Scenario: 剛好打平

- **WHEN** 2000 USD，Taylor 付款，只有 Taylor 分攤
- **THEN** 是「Settled up」「$0.00」

#### Scenario: 和你無關

- **WHEN** 從群組的畫面打開 Casey 付款、只有 Blake 分攤的支出的明細
- **THEN** 是「You paid」「$0.00」、「Your share」「$0.00」、「Settled up」「$0.00」

#### Scenario: 分攤的順序和名稱

- **WHEN** 依序分給 Blake、Taylor 和 Casey，之後把 Casey 改名為「Cass」，把 Blake 移出 Brisbane
- **THEN** SPLIT 依序是「Blake」、「Taylor (You)」、「Cass」

#### Scenario: 備註

- **WHEN** 備註是「Birthday」
- **THEN** 「DETAILS」區塊後面是「NOTE」和「Birthday」

#### Scenario: 以網址打開

- **WHEN** 以 `/expenses/` 加上 Dinner 的 ID 開啟 app
- **THEN** 顯示 Dinner 的明細，沒有「Expense not found.」

#### Scenario: 標題列

- **WHEN** 打開 Dinner 的明細
- **THEN** 標題列和個人支出的明細一樣，有「Edit」和它右邊的「Expense actions」

### Requirement: LEDGER-67.2 封存群組的支出只能看

WHILE 支出的群組已封存，the mobile app SHALL 在它的明細的金額下面顯示「Shared history」和「Payments and shares are preserved as read-only history. Restore this group before editing.」，在「DETAILS」的「Group」後面多一列「Status」和「Archived · Read-only」，並停用「Edit」和「Expense actions」裡的「Delete」（SHELL-49.1）；它的卡片沒有 Delete：往左滑不露出「Delete」，也沒有「Delete expense」的輔助功能動作；群組還原後不再顯示這些，Edit 和 Delete 恢復可以用，卡片也有 Delete。

#### Scenario: 封存之後

- **WHEN** 封存 Brisbane 之後，打開 Dinner 的明細
- **THEN** 金額下面是「Shared history」和這句話，「Group」「Brisbane」後面是「Status」「Archived · Read-only」，Edit 停用；iOS 上 Expense actions 的選單照樣能打開，「Delete」是停用的；Android 上 Expense actions 的 `more_vert` 停用

#### Scenario: 卡片

- **WHEN** 封存 Brisbane
- **THEN** 支出清單和 Brisbane 的畫面上，Dinner 的卡片都沒有「Delete expense」的輔助功能動作，往左滑也不露出「Delete」

#### Scenario: 還原之後

- **WHEN** 還原 Brisbane 之後，打開 Dinner 的明細
- **THEN** 沒有「Shared history」和「Status」，Edit 可以按，Expense actions 的「Delete」可以選；Dinner 的卡片有「Delete expense」的輔助功能動作

### Requirement: LEDGER-68.1 (e2e) iOS 上從表單打開的清單和畫面蓋在表單上

WHERE iOS，WHEN 從支出表單打開 Select Group、Who Paid?、Split Between、分類清單，或從「+ Add New Category」打開分類的畫面，the mobile app SHALL 讓它蓋在表單上，關閉後回到表單，表單上的輸入都不變。

#### Scenario: 從群組新增

- **WHEN** iOS 上在 Brisbane 的畫面按「Add expense」，輸入金額和標題，從「+ Add New Category」新增「Flights」並選它，按「Group, Brisbane」後在 Select Group 再按 Brisbane，從 Who Paid? 選付款人、從 Split Between 選分攤的人，再按 Add
- **THEN** 每個清單和 Group Categories 都蓋在表單上，關閉後表單上的輸入都在；表單關閉後回到 Brisbane 的畫面，有這筆支出的卡片

### Requirement: LEDGER-70.2 (e2e) 左滑卡片露出 Delete

WHEN 使用者在支出清單或群組的畫面，把個人支出或未封存群組的支出的卡片往左滑，the mobile app SHALL 在卡片右邊露出顯示「Delete」的按鈕，它的無障礙名稱是「Delete <標題> expense」；按下它就把這筆支出移到垃圾桶（LEDGER-71.3）。

#### Scenario: 左滑

- **WHEN** 在支出清單把 Coffee run 的卡片往左滑
- **THEN** 卡片右邊露出「Delete」，它的無障礙名稱是「Delete Coffee run expense」

#### Scenario: 按 Delete

- **WHEN** 按露出的「Delete」
- **THEN** Coffee run 的卡片移出支出清單，畫面底部顯示「Moved to Trash」

#### Scenario: 群組的畫面

- **WHEN** 在 Brisbane 的畫面把 Dinner 的卡片往左滑，按露出的「Delete」
- **THEN** 露出的按鈕的無障礙名稱是「Delete Dinner expense」；按下後 Dinner 的卡片移出 Brisbane 的畫面，畫面底部顯示「Moved to Trash」

### Requirement: LEDGER-71.3 刪除支出時移到垃圾桶

WHEN 使用者按個人支出或未封存群組的支出的卡片左滑露出的「Delete」、使用這些卡片上名稱是「Delete expense」的輔助功能動作，或在它們的明細的 Expense actions 選「Delete」（LEDGER-72.2），the mobile app SHALL 不另外確認，就把這筆支出移到垃圾桶，存好後才把它的卡片移出支出清單和群組的畫面、不再把它算進 This Month 和群組的金額（GROUPS-75.1），支出清單沒有其他卡片時顯示 LEDGER-32.2 的提示，群組的畫面沒有其他卡片時顯示 GROUPS-20.2 的提示，重新啟動 app 之後也一樣；存好之前再按一次或再用一次，也只移一次；重新啟動 app 之後它仍在垃圾桶裡，以網址打開它的明細，或明細開著時它在另一個畫面被移到垃圾桶，明細都和 LEDGER-39.1 一樣只顯示「Expense not found.」，標題列沒有「Edit」和「Expense actions」。

#### Scenario: 卡片的輔助功能動作

- **WHEN** 有 Coffee run、Lunch 和 Brisbane 的 Dinner
- **THEN** 支出清單上三張卡片，以及 Brisbane 的畫面上 Dinner 的卡片，都有名稱是「Delete expense」的輔助功能動作

#### Scenario: 移到垃圾桶

- **WHEN** 有 875 USD 的 Coffee run 和 1250 USD 的 Lunch，對 Lunch 的卡片使用「Delete expense」
- **THEN** 沒有跳出提示框；卡片只剩 Coffee run，卡片上方是「This Month: $8.75」

#### Scenario: 最後一筆

- **WHEN** 只有 Coffee run 時把它移到垃圾桶，再重新啟動 app
- **THEN** 移到垃圾桶之後和重新啟動之後，支出清單都顯示「No expenses to display. Add a personal expense or get involved in a group expense.」和「This Month: —」，沒有卡片

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

#### Scenario: 群組支出

- **WHEN** Brisbane 有 Taylor 分攤的 Dinner，以及 Casey 付款、只有 Blake 分攤的 Taxi，在 Brisbane 的畫面對 Taxi 的卡片使用「Delete expense」，在支出清單對 Dinner 的卡片使用「Delete expense」
- **THEN** 沒有跳出提示框；Brisbane 的畫面沒有卡片，顯示「No expenses in this group yet.」；支出清單沒有 Dinner 的卡片；重新啟動 app 之後也一樣

#### Scenario: 以網址打開群組支出的明細

- **WHEN** Dinner 在垃圾桶裡時，以 `/groups/expenses/` 加上 Dinner 的 ID 開啟 app
- **THEN** 明細只顯示「Expense not found.」，標題列沒有「Edit」和「Expense actions」

#### Scenario: 明細開著時在另一個分頁刪除

- **WHEN** 在 Brisbane 的畫面打開 Dinner 的明細，切到 Expenses 分頁，對 Dinner 的卡片使用「Delete expense」，再切回 Groups 分頁
- **THEN** Groups 分頁上的明細只顯示「Expense not found.」，標題列沒有「Edit」和「Expense actions」

#### Scenario: 分類仍算使用中

- **WHEN** Gym 唯一一筆支出在垃圾桶裡時，在 Manage Categories 移除 Gym
- **THEN** 跳出「Archive “Gym”?」，內容是「This category is used by 1 expense. Existing expenses will keep their category, but it will no longer appear for new expenses.」

#### Scenario: 用 Move Expenses… 搬走

- **WHEN** Gym 唯一一筆支出 Squat rack 在垃圾桶裡時，在 Manage Categories 移除 Gym，選「Move Expenses…」，再選 Shopping
- **THEN** 「ARCHIVED」下的「Restore Gym」有「Delete」動作；在 Trash 還原 Squat rack 之後，它的卡片上的分類是「Shopping」

### Requirement: LEDGER-72.2 明細的 Expense actions 選單

The mobile app SHALL 在個人支出和群組支出的明細的標題列、「Edit」的右邊放一個名稱是「Expense actions」的選單（SHELL-47.1、SHELL-48.1），裡面只有破壞性的「Delete」（SHELL-53.1）；選「Delete」時，SHALL 把這筆支出移到垃圾桶（LEDGER-71.3），存好後返回推入明細的支出清單或群組的畫面，存好之前再選一次也只返回一次。

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

#### Scenario: 群組的畫面推入的明細

- **WHEN** 在 Brisbane 的畫面點 Dinner 的卡片，在它的明細選「Delete」
- **THEN** 沒有跳出確認；返回 Brisbane 的畫面，Groups 分頁的堆疊由下而上是「Groups」根畫面和「Brisbane」，Brisbane 的畫面沒有 Dinner 的卡片，畫面底部顯示「Moved to Trash」

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

### Requirement: LEDGER-75.3 按 Undo 時還原支出

WHEN 使用者按 Undo 提示的「Undo」，the mobile app SHALL 不另外確認，就把這筆支出從垃圾桶還原，存好後收起提示，讓它的卡片照 LEDGER-31.2、LEDGER-64.2 和 GROUPS-61.2 回到支出清單和群組的畫面上依 LEDGER-28.1 該在的位置，再照 LEDGER-35.2 算進 This Month 和群組的金額（GROUPS-75.1），也不再出現在 Trash。

#### Scenario: 按 Undo

- **WHEN** 有 875 USD 的 Coffee run 和 1250 USD 的 Lunch，把 Lunch 移到垃圾桶後按「Undo」
- **THEN** 沒有跳出提示框，提示收起；卡片由上而下又是 Lunch、Coffee run，卡片上方是「This Month: $21.25」；Trash 只顯示「No deleted expenses.」

#### Scenario: 原來的位置

- **WHEN** 依序新增日期都是 `2025-01-01` 的「E」、「F」和「D」，把 F 移到垃圾桶後按「Undo」
- **THEN** 卡片由上而下仍是 D、F、E

#### Scenario: 從明細刪除之後

- **WHEN** 在 Lunch 的明細選「Delete」，返回支出清單後按「Undo」
- **THEN** Lunch 的卡片回到支出清單，Expenses 分頁的堆疊仍只有「Expenses」根畫面

#### Scenario: 重新啟動

- **WHEN** 按「Undo」之後重新啟動 app
- **THEN** 卡片由上而下仍是 Lunch、Coffee run

#### Scenario: 群組支出

- **WHEN** Brisbane 有 Taylor 分攤的 Dinner，以及 Casey 付款、只有 Blake 分攤的 Taxi，在 Brisbane 的畫面把 Taxi 移到垃圾桶後按「Undo」，再把 Dinner 移到垃圾桶後按「Undo」
- **THEN** Brisbane 的畫面又有 Taxi 和 Dinner 的卡片；支出清單又有 Dinner 的卡片，沒有 Taxi 的

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

#### Scenario: 群組支出

- **WHEN** 把 Coffee run 和 Brisbane 的 Dinner 移到垃圾桶之後選中 Settings 分頁
- **THEN** 「Trash」右邊是「2」，這一列的無障礙名稱是「Trash, 2」

### Requirement: LEDGER-77.2 Trash 列出垃圾桶裡的支出

The mobile app SHALL 在 Trash 依移到垃圾桶的先後，最後移入的在最上面，由上而下列出垃圾桶裡每筆支出的卡片，個人支出和群組支出都列出；個人支出的卡片顯示的內容和螢幕閱讀器讀出的，都和支出清單上的卡片一樣（LEDGER-33.2、LEDGER-34.1、LEDGER-40.1），群組支出的卡片和群組的畫面上的一樣（GROUPS-61.2），卡片金額是支出的全額；卡片都不能左滑，也沒有「Delete expense」動作。垃圾桶裡沒有支出時，SHALL 只顯示「No deleted expenses.」，但讀完存著的支出之前不顯示這句話。

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

#### Scenario: 分類封存了

- **WHEN** Gym 唯一一筆支出 Squat rack 在垃圾桶裡時，封存 Gym
- **THEN** Trash 上 Squat rack 的卡片的分類是「Gym (Archived)」，螢幕閱讀器也讀出「Gym (Archived)」

#### Scenario: 群組支出

- **WHEN** 依序把 Coffee run 和 Brisbane 的 Dinner（10001 USD、Food & Dining、`2026-10-30`，依序分給 Blake、Taylor 和 Casey）移到垃圾桶，打開 Trash
- **THEN** 卡片由上而下是 Dinner、Coffee run；Dinner 的卡片依序顯示「Dinner」、「$100.01」、「Food & Dining」、「Brisbane」、「Oct 30, 2026」，螢幕閱讀器把它讀成一個按鈕，依序讀出這五項；卡片沒有「Delete expense」動作

#### Scenario: 和你無關的群組支出

- **WHEN** 在 Brisbane 的畫面把 Casey 付款、只有 Blake 分攤的 2500 USD 的 Taxi 移到垃圾桶
- **THEN** Trash 有 Taxi 的卡片，金額是「$25.00」

#### Scenario: 群組封存了

- **WHEN** Dinner 在垃圾桶裡時封存 Brisbane
- **THEN** Trash 上 Dinner 的卡片是「Brisbane · Archived」

#### Scenario: Trash 開著時

- **WHEN** Trash 開著時，從 Expenses 分頁把 Lunch 移到垃圾桶，再選中 Settings 分頁
- **THEN** Trash 有 Lunch 的卡片

#### Scenario: 空的

- **WHEN** 第一次啟動後打開 Trash
- **THEN** 只顯示「No deleted expenses.」，沒有卡片

#### Scenario: 讀完之前

- **WHEN** 有垃圾桶裡的 Lunch 時開啟 app 並打開 Trash，Trash 還沒讀完存著的支出
- **THEN** 沒有「No deleted expenses.」；讀完之後顯示 Lunch 的卡片

### Requirement: LEDGER-78.2 點 Trash 的卡片推入唯讀明細

WHEN 使用者點 Trash 的卡片，the mobile app SHALL 在 Settings 分頁推入這筆支出的唯讀明細，網址是 `/settings/trash/<支出的 ID>`，標題是「Expense」，最上面是「This expense is in the Trash.」，下面是名稱為「Restore」的按鈕，再下面是和明細一樣的支出的內容：個人支出照 LEDGER-37.2，群組支出照 LEDGER-66.2，群組已封存時「DETAILS」裡還有 LEDGER-67.2 的「Status」，但沒有它的「Shared history」那段說明；標題列沒有「Edit」，只有名稱是「Expense actions」的選單（SHELL-47.1、SHELL-48.1），裡面只有破壞性的「Delete Permanently」（SHELL-53.1）。連點兩次也只推入一個唯讀明細，返回時回到 Trash；從推入到讀完支出，都不顯示「Expense not found.」。唯讀明細跟著存著的支出：網址裡的 ID 不是垃圾桶裡的支出，或打開之後那一筆因為別處的操作（例如 Undo 提示的 Undo）離開了垃圾桶時，SHALL 只顯示「Expense not found.」，標題列沒有選單。

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

#### Scenario: 分類封存了

- **WHEN** Gym 唯一一筆支出 Squat rack 在垃圾桶裡時，封存 Gym，再打開 Squat rack 的唯讀明細
- **THEN** 「Category」的分類是「Gym (Archived)」

#### Scenario: 打開之後被 Undo 還原

- **WHEN** 把 Coffee run 移到垃圾桶，提示還在時打開它的唯讀明細，再按提示的「Undo」
- **THEN** 唯讀明細只顯示「Expense not found.」，標題列沒有「Expense actions」

#### Scenario: 群組支出

- **WHEN** 把 Brisbane 的 Dinner（6000 USD、Food & Dining、`2026-10-30`，Taylor 付款，依序分給 Taylor、Casey 和 Blake）移到垃圾桶，在 Trash 點它的卡片
- **THEN** 由上而下依序顯示「This expense is in the Trash.」、「Restore」、「Dinner」、「$60.00」、「YOUR POSITION」、「You paid」、「$60.00」、「Your share」、「$20.00」、「You are owed」、「$40.00」、「PAID BY」、「Taylor (You)」、「$60.00」、「SPLIT」、「Taylor (You)」、「$20.00」、「Casey」、「$20.00」、「Blake」、「$20.00」、「DETAILS」、「Group」、「Brisbane」、「Category」、「Food & Dining」、「Date」、「Oct 30, 2026」；標題列只有「Expense actions」

#### Scenario: 群組封存了

- **WHEN** Dinner 在垃圾桶裡時封存 Brisbane，再在 Trash 打開 Dinner
- **THEN** 「Group」「Brisbane」後面是「Status」「Archived · Read-only」；沒有「Shared history」和那段說明

### Requirement: LEDGER-79.3 按 Restore 時從垃圾桶還原

WHEN 使用者在唯讀明細按「Restore」，the mobile app SHALL 不另外確認，就把這筆支出從垃圾桶還原，存好後返回 Trash，讓它不再出現在 Trash，照 LEDGER-31.2、LEDGER-64.2 和 GROUPS-61.2 回到支出清單和群組的畫面上依 LEDGER-28.1 該在的位置，再照 LEDGER-35.2 算進 This Month 和群組的金額（GROUPS-75.1）；群組已封存時也一樣還原，它回到封存群組的畫面上，照 LEDGER-67.2 只能看；存好之前再按一次，也只還原一次、只返回一次。

#### Scenario: 還原

- **WHEN** 依序新增日期都是 `2025-01-01` 的「E」、「F」和「D」，把 F 移到垃圾桶，在 Trash 打開 F，按「Restore」
- **THEN** 沒有跳出提示框；回到 Trash，只顯示「No deleted expenses.」；支出清單由上而下是 D、F、E

#### Scenario: 和移到垃圾桶之前一樣

- **WHEN** 還原 875 USD、Shopping、`2024-12-25`、備註「Morning treat」的 Coffee run，再打開它的明細
- **THEN** 支出清單上有它的卡片；它的日期不在這個月，所以卡片上方是「This Month: —」；明細依序顯示「Coffee run」、「$8.75」、「DETAILS」、「Category」、「Shopping」、「Date」、「Dec 25, 2024」、「NOTE」、「Morning treat」

#### Scenario: 存好之前

- **WHEN** 按「Restore」，還沒存好
- **THEN** 唯讀明細仍開著；存好後才返回 Trash

#### Scenario: 存好之前再按一次

- **WHEN** 按「Restore」，還沒存好時再按一次
- **THEN** 存好後只返回一次：Settings 分頁的堆疊由下而上是「Settings」根畫面和「Trash」

#### Scenario: 群組支出

- **WHEN** 在 Brisbane 的畫面把 Casey 付款、只有 Blake 分攤的 Taxi 移到垃圾桶，在 Trash 打開 Taxi，按「Restore」
- **THEN** 回到 Trash，只顯示「No deleted expenses.」；Brisbane 的畫面又有 Taxi 的卡片，支出清單上沒有

#### Scenario: 群組封存了

- **WHEN** Dinner 在垃圾桶裡時封存 Brisbane，再在 Trash 打開 Dinner，按「Restore」
- **THEN** 沒有跳出提示框；回到 Trash，只顯示「No deleted expenses.」；從 Archived Groups 打開 Brisbane 的畫面時有 Dinner 的卡片，卡片上是「Brisbane · Archived」，沒有「Delete expense」動作

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

#### Scenario: 群組支出

- **WHEN** Brisbane 的 Dinner 在垃圾桶裡，在它的唯讀明細選「Delete Permanently」，再按「Delete」
- **THEN** 回到 Trash，只顯示「No deleted expenses.」；本機資料沒有 Dinner，也沒有它的付款和分攤

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

#### Scenario: 群組支出

- **WHEN** 垃圾桶裡有 Coffee run 和 Brisbane 的 Dinner，在 Trash 按「Empty Trash」，再按提示框的「Empty Trash」
- **THEN** Trash 只顯示「No deleted expenses.」；本機資料沒有 Coffee run 和 Dinner

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

#### Scenario: 群組的畫面

- **WHEN** 在 Brisbane 的畫面把 Dinner 移到垃圾桶
- **THEN** 提示在 Add expense 的 + 按鈕上方，不擋住它

#### Scenario: 螢幕閱讀器

- **WHEN** 開著 VoiceOver 或 TalkBack 時，把 Coffee run 移到垃圾桶
- **THEN** 念出「Coffee run moved to Trash. Undo available.」，提示顯示 15 秒

### Requirement: LEDGER-84.1 (e2e) 往左滑沒有 Delete 的卡片時不打開明細

WHEN 使用者把沒有 Delete 的支出卡片往左滑，也就是封存群組的支出的卡片（LEDGER-67.2）和 Trash 的卡片（LEDGER-77.2），the mobile app SHALL 不打開明細或唯讀明細，卡片也不露出任何按鈕。

#### Scenario: Trash 的卡片

- **WHEN** 在 Trash 把 Dinner 的卡片往左滑
- **THEN** 仍是 Trash，沒有打開 Dinner 的唯讀明細，卡片旁邊沒有露出按鈕

#### Scenario: 封存群組的支出的卡片

- **WHEN** 封存 Brisbane 之後，在支出清單把 Dinner 的卡片往左滑
- **THEN** 仍是支出清單，沒有打開 Dinner 的明細，也沒有露出「Delete」

### Requirement: LEDGER-85.1 Edit Expense 找不到支出時顯示「Expense not found.」

IF Edit Expense 網址裡的 ID 不是任何支出的 ID，或是垃圾桶裡的支出的 ID，THEN the mobile app SHALL 讓 Edit Expense 只顯示「Expense not found.」，標題列只有「Cancel」，沒有支出表單的欄位和「Save」；按 Cancel、往下滑或按 Android 的返回鍵時直接關閉，不跳出提示框，什麼都不存；打開存在而且不在垃圾桶裡的支出時，SHALL 從打開到讀完都不顯示「Expense not found.」。

#### Scenario: 垃圾桶裡的支出

- **WHEN** Coffee run 在垃圾桶裡時，以 `/expenses/<它的 ID>/edit` 打開 Edit Expense
- **THEN** 導覽列標題是「Edit Expense」，只顯示「Expense not found.」，標題列只有「Cancel」；按 Cancel 後表單關閉，沒有提示框，Coffee run 仍在垃圾桶裡，和之前一樣

#### Scenario: 垃圾桶裡的群組支出

- **WHEN** Brisbane 的 Dinner 在垃圾桶裡時，以它的 Edit Expense 網址打開
- **THEN** 只顯示「Expense not found.」，沒有「Split with others」；往下滑關閉之後，Dinner 仍在垃圾桶裡，空間仍是 Brisbane

#### Scenario: 不存在的支出

- **WHEN** 以 `/expenses/00000000-0000-4000-8000-000000000000/edit` 打開 Edit Expense
- **THEN** 只顯示「Expense not found.」，標題列只有「Cancel」

#### Scenario: 存在的支出

- **WHEN** 以 Coffee run 的 Edit Expense 網址打開，Edit Expense 還沒讀完支出
- **THEN** 沒有顯示「Expense not found.」；讀完之後標題欄位是「Coffee run」
