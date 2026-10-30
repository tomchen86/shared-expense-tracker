# Ledger

## Purpose

記帳：金額規則（每個幣別的小數位數、金額文字怎麼解析和轉回文字、金額上限、平均分攤和支出日期），以及手機 app 上新增和修改支出的支出表單和存著的支出。金額規則放在 `packages/domain`，每個客戶端都照同一套套用（ADR-0002、ADR-0004）；手機 app 把支出存在本機資料裡（ADR-0006）。支出表單是新增支出的 New Expense 和修改支出的 Edit Expense。個人支出是屬於本機身分的個人空間、付款和分攤都是個人 participant 的支出（SHELL-2.1）。手機地區的幣別是手機第一個偏好的語言和地區所用的幣別。表單的幣別在 New Expense 是新支出的幣別（LEDGER-15.1），在 Edit Expense 是這筆支出的幣別；金額欄位的文字經 LEDGER-19.1 轉換後，依 LEDGER-2.1 到 LEDGER-4.1 能換成表單幣別的最小單位，就是合法的金額。表單有變更，是指金額、標題、分類、日期或備註有任何一欄和打開表單時不同；比較金額、標題和備註時不管頭尾空白。裝置所在的時區是 JavaScript 執行環境回報的時區，今天是裝置所在時區的今天（LEDGER-8.1）。

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

The mobile app SHALL 在 Expenses 分頁的根畫面放一個 + 按鈕，畫面沒有另外給它名稱，所以名稱是「Add expense」（SHELL-41.1）；按一下就打開 New Expense。

#### Scenario: 打開 app

- **WHEN** 打開 app，本機資料開好
- **THEN** Expenses 分頁的根畫面有名稱是「Add expense」的按鈕

#### Scenario: 按 + 按鈕

- **WHEN** 按「Add expense」
- **THEN** 打開 New Expense，目前的網址是 `/expenses/new`

### Requirement: LEDGER-12.1 支出表單的網址

The mobile app SHALL 以網址 `/expenses/new` 打開 New Expense，以 `/expenses/<支出的 ID>/edit` 打開這筆支出的 Edit Expense；支出表單是蓋住分頁列的 sheet，導覽列標題是「New Expense」或「Edit Expense」。

#### Scenario: New Expense

- **WHEN** 在 Expenses 分頁開啟 `/expenses/new`
- **THEN** 顯示導覽列標題是「New Expense」的 sheet

#### Scenario: Edit Expense

- **WHEN** 存下「Coffee run」之後，開啟 `/expenses/<它的 ID>/edit`
- **THEN** 顯示導覽列標題是「Edit Expense」的 sheet，標題欄位是「Coffee run」

### Requirement: LEDGER-13.1 支出表單的內容

The mobile app SHALL 讓支出表單的標題列有取消「Cancel」和確認，確認在 New Expense 是「Add」、在 Edit Expense 是「Save」（SHELL-47.1、SHELL-48.1）；表單上依序是表單幣別的代碼、名稱是「Amount in <表單幣別>」並用數字和小數點鍵盤的金額欄位、名稱是「Expense title」的標題欄位、名稱是「Category, <分類名稱>」的分類按鈕、名稱是「Date」的日期欄位，以及名稱是「Expense note」的備註欄位。

#### Scenario: New Expense

- **WHEN** 手機地區的幣別是 USD，第一次啟動後打開 New Expense
- **THEN** 標題列有「Cancel」和「Add」；表單上依序是「USD」、「Amount in USD」、「Expense title」、「Category, Food & Dining」、「Date」、「Expense note」，金額欄位用數字和小數點鍵盤

#### Scenario: Edit Expense

- **WHEN** 打開一筆 JPY 支出的 Edit Expense
- **THEN** 標題列有「Cancel」和「Save」，金額欄位前面是「JPY」，名稱是「Amount in JPY」

### Requirement: LEDGER-14.1 打開 New Expense 時的內容

WHEN 打開 New Expense，the mobile app SHALL 讓金額、標題和備註都是空的，分類是依儲存的順序排第一的分類（CATEGORIES-7.1），日期是今天。

#### Scenario: 第一次啟動

- **WHEN** 第一次啟動後打開 New Expense
- **THEN** 金額、標題和備註都是空的，分類是「Food & Dining」，日期是今天

#### Scenario: 第一個分類改了名

- **WHEN** 在 Manage Categories 把 Food & Dining 改名為「Meals」，再打開 New Expense
- **THEN** 分類是「Meals」

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

### Requirement: LEDGER-17.1 從清單選分類

WHEN 使用者按分類按鈕，the mobile app SHALL 打開標題是「Category」的清單，依儲存的順序列出每個分類，並把表單上選的那一個標示為已選取；按一個分類就選它並回到表單，按「Cancel」就回到表單、分類不變。

#### Scenario: 打開清單

- **WHEN** 第一次啟動後，在 New Expense 按「Category, Food & Dining」
- **THEN** 清單依序是九個預設分類，只有 Food & Dining 標示為已選取

#### Scenario: 新增的分類

- **WHEN** 在 Manage Categories 新增「Gym」之後，在 New Expense 打開清單
- **THEN** Gym 排在 Uncategorized 後面

#### Scenario: 選分類

- **WHEN** 在清單按「Shopping」
- **THEN** 回到表單，分類按鈕是「Category, Shopping」；再打開清單時，標示為已選取的是 Shopping

#### Scenario: 取消

- **WHEN** 打開清單後按「Cancel」
- **THEN** 回到表單，分類按鈕仍是「Category, Food & Dining」

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

### Requirement: LEDGER-22.1 按 Save 存下修改

WHEN 使用者在 Edit Expense 按 Save，the mobile app SHALL 照 LEDGER-21.1 的規則，用表單上的金額、標題、分類、日期和備註更新這筆支出，保留它的 ID、幣別和所屬的空間，付款和分攤改成個人 participant 的新金額，然後關閉表單。

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

### Requirement: LEDGER-29.1 (manual) 手機上的今天和日期選擇器

WHERE iPhone 或 Android 手機，the mobile app SHALL 讓 New Expense 的日期是手機時區的今天，日期選擇器選不到今天以後的日子，選了哪一天，日期欄位就顯示哪一天。

#### Scenario: 當地比 UTC 早一天

- **WHEN** 手機的時區設成 `Pacific/Auckland`，在當地上午（UTC 還是前一天）打開 New Expense
- **THEN** 日期是當地的今天

#### Scenario: 當地比 UTC 晚一天

- **WHEN** 手機的時區設成 `America/Los_Angeles`，在當地晚上（UTC 已經是隔天）打開 New Expense
- **THEN** 日期是當地的今天

#### Scenario: 選日期

- **WHEN** 打開日期選擇器，選前天
- **THEN** 明天以後的日子都不能選；選了之後，日期欄位顯示前天
