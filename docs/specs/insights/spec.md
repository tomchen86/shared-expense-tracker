# Insights

## Purpose

支出分析的計算規則：個人或群組情境下計入哪些支出、各計多少，依月份和年份建立期間，分幣別和類別加總，與上一個期間比較，以及每個幣別畫哪種圖。這些規則放在 `packages/domain`（ADR-0002）。金額都是最小單位的整數（ADR-0004），支出日期是 `YYYY-MM-DD`（LEDGER-8.1）。它只計算交給它的支出和類別清單，不判斷支出是否已刪除，也不看群組或類別是否已封存。

## Requirements

### Requirement: INSIGHTS-1.1 個人情境計入個人空間的全額和自己的分攤額

WHILE 分析個人支出，the domain package SHALL 對個人空間的支出計入全額，對其他支出計入使用者的 participant 在該支出的分攤額總和，不論誰付款。使用者的 participant 是個人 participant，以及 `userId` 是使用者的 participant。

#### Scenario: 個人空間的支出

- **WHEN** 個人空間有一筆 1200 的支出，分攤記在另一個 participant 名下
- **THEN** 計入 1200

#### Scenario: 群組支出只算自己的分攤額

- **WHEN** 一筆 10000 的群組支出，個人 participant 分攤 2000，別人分攤 8000
- **THEN** 計入 2000

#### Scenario: 以 userId 連結的 participant

- **WHEN** 一筆 900 的群組支出，個人 participant 分攤 300，`userId` 是使用者的 participant 分攤 200，`userId` 是別人的 participant 分攤 400
- **THEN** 計入 500

#### Scenario: 別人的支出

- **WHEN** 同一個月還有一筆 700 的群組支出，全部由沒有 `userId` 的 participant 分攤
- **THEN** 這筆不計入，該月的總額不變

### Requirement: INSIGHTS-2.1 群組情境計入該群組支出的全額

WHILE 分析一個群組，the domain package SHALL 計入該群組每筆支出的全額，不論誰分攤，也不計入其他群組和個人空間的支出。

#### Scenario: 只算這個群組

- **WHEN** 群組在同一個月有 3000 和 1000 兩筆支出，另一個群組有 500，個人空間有 700
- **THEN** 該月的總額是 4000

### Requirement: INSIGHTS-3.1 不計入日期無效或計入金額不在範圍內的支出

IF 支出的日期不是有效的支出日期（LEDGER-9.1），或它的計入金額（INSIGHTS-1.1、INSIGHTS-2.1）不是 1 到 9,007,199,254,740,991 之間的整數，THEN the domain package SHALL 不計入這筆支出：它不算進任何總額，也不為它建立期間。

#### Scenario: 日期無效

- **WHEN** 支出的日期是 `2025-02-30`、`2025/01/05` 或空字串
- **THEN** 都不計入，沒有任何期間

#### Scenario: 金額不在範圍內

- **WHEN** 群組支出的金額是 0、-100、9,007,199,254,740,992，或 12.5 個最小單位
- **THEN** 都不計入，沒有任何期間

#### Scenario: 自己的分攤額是 0

- **WHEN** 個人情境下，一筆群組支出裡個人 participant 分攤 0，例如只付了款
- **THEN** 不計入，沒有任何期間

#### Scenario: 和計入的支出混在一起

- **WHEN** 2025 年 1 月有 1000 和 0 兩筆支出，另有一筆日期是 `2025-02-30` 的 500，和一筆 3 月的 -5
- **THEN** 只有 `2025-01` 一個月份期間和 `2025` 一個年份期間，總額都是 1000

### Requirement: INSIGHTS-4.1 只為有計入支出的月份和年份建立期間

The domain package SHALL 依計入支出的日期，為每個有計入支出的月份和年份各建立一個期間，月份和年份各自由舊到新排列。月份期間以 `YYYY-MM` 識別，名稱是英文月份加年份；年份期間以 `YYYY` 識別，名稱就是年份。

#### Scenario: 跳過沒有支出的月份

- **WHEN** 支出的日期是 `2025-03-10`、`2024-12-31`、`2025-01-02`、`2025-01-20`
- **THEN** 月份期間依序是 `2024-12`「December 2024」、`2025-01`「January 2025」、`2025-03`「March 2025」；年份期間依序是 `2024`「2024」、`2025`「2025」

#### Scenario: 月份的名稱

- **WHEN** 2025 年的每個月各有一筆支出
- **THEN** 月份期間的名稱依序是「January 2025」、「February 2025」、「March 2025」、「April 2025」、「May 2025」、「June 2025」、「July 2025」、「August 2025」、「September 2025」、「October 2025」、「November 2025」、「December 2025」

#### Scenario: 沒有計入的支出

- **WHEN** 沒有任何計入的支出
- **THEN** 沒有月份期間，也沒有年份期間

### Requirement: INSIGHTS-5.1 每個期間分幣別加總

The domain package SHALL 為每個期間依幣別代碼排序，列出該期間有計入支出的每個幣別和它的總額，不換算，也不跨幣別加總；只在其他期間有支出的幣別不列出。

#### Scenario: 三個幣別

- **WHEN** 2025 年 1 月有 1200 USD、2000 JPY、450 AUD、300 USD
- **THEN** 依序是 AUD 450、JPY 2000、USD 1500

#### Scenario: 年份的總額

- **WHEN** 2024 年 12 月有 200 USD，2025 年 1 月有 1000 USD、3 月有 500 USD
- **THEN** 2024 年是 USD 200，2025 年是 USD 1500

#### Scenario: 只有上一期有的幣別

- **WHEN** 2024 年 12 月有 2000 JPY 和 500 USD，2025 年 1 月只有 800 USD
- **THEN** 2025 年 1 月只列出 USD

### Requirement: INSIGHTS-6.1 在每個幣別內依類別合併支出

The domain package SHALL 在每個幣別內，把 `categoryId` 相同的支出合併成一個類別。沒有 `categoryId` 的支出依它存的類別名稱，對到類別清單裡第一個名稱完全相同的類別，和該類別的支出合併；對不到類別的，依存的類別名稱合併。

#### Scenario: 同一個 categoryId

- **WHEN** 兩筆 `categoryId` 是 `food` 的支出 400 和 600，存的類別名稱分別是「Food」和「Old food name」，還有一筆 `travel` 的 500
- **THEN** 類別是 Food 1000、Travel 500

#### Scenario: 沒有 categoryId 的支出依名稱對到類別

- **WHEN** 一筆沒有 `categoryId`、存的類別名稱是「Food」的 300，和一筆 `categoryId` 是 `food` 的 200
- **THEN** 只有一個類別 Food 500

#### Scenario: 兩個同名的類別

- **WHEN** 類別清單依序有 `food-1`「Food」和 `food-2`「Food」；支出是沒有 `categoryId`、存的類別名稱是「Food」的 300，`food-1` 的 200，`food-2` 的 100
- **THEN** `food-1` 的 Food 是 500，`food-2` 的 Food 是 100

#### Scenario: 對不到類別的名稱

- **WHEN** 沒有 `categoryId`、類別清單裡也沒有的「Gifts」100 和 200，以及「Books」50
- **THEN** 類別是 Gifts 300、Books 50

#### Scenario: 同一個類別在不同幣別

- **WHEN** `food` 有一筆 400 USD 和一筆 1000 JPY
- **THEN** USD 和 JPY 各有一個 Food，分別是 400 和 1000

### Requirement: INSIGHTS-7.1 類別的名稱和顏色

The domain package SHALL 用對到的類別目前的名稱和顏色；有 `categoryId` 卻不在類別清單裡的支出不再依名稱比對。對不到類別的那一列，用合併的支出中有快照、日期最晚的那筆的類別快照；都沒有快照時，用日期最晚的那筆存的類別名稱和灰色 `#808080`。同一天有好幾筆可選時，依名稱、再依顏色的 Unicode 碼位順序，取最前的那個。

#### Scenario: 類別改過名

- **WHEN** `food` 現在叫「Meals」、顏色是 `#222222`，支出的快照是「Food」、`#111111`
- **THEN** 類別的名稱和顏色是 Meals、`#222222`

#### Scenario: categoryId 不在清單裡

- **WHEN** 支出的 `categoryId` 是清單裡沒有的 `gone`，存的類別名稱是清單裡有的「Food」，快照是「Road Trip」、`#5678C8`
- **THEN** 類別的名稱和顏色是 Road Trip、`#5678C8`

#### Scenario: 名稱對不到但有快照

- **WHEN** 支出沒有 `categoryId`，存的類別名稱「Misc」不在清單裡，快照是「Snacks」、`#333333`
- **THEN** 類別的名稱和顏色是 Snacks、`#333333`

#### Scenario: 沒有快照

- **WHEN** 支出的 `categoryId` 是清單裡沒有的 `gone`，存的類別名稱是「Food」，沒有快照；或支出沒有 `categoryId`，存的類別名稱「Misc」不在清單裡，也沒有快照
- **THEN** 分別是 Food、`#808080` 和 Misc、`#808080`

#### Scenario: 合併的支出快照不同

- **WHEN** 三筆 `categoryId` 都是清單裡沒有的 `gone`：2025-01-05 的 100 快照是「Snacks」、`#111111`，2025-01-20 的 200 快照是「Treats」、`#222222`，2025-02-10 的 300 快照是「Sweets」、`#333333`
- **THEN** 2025 年 1 月是 Treats、`#222222` 300，2 月是 Sweets、`#333333` 300，2025 年是 Sweets、`#333333` 600

#### Scenario: 較晚的那筆沒有快照

- **WHEN** 兩筆 `categoryId` 都是 `gone`：2025-01-05 的快照是「Snacks」、`#111111`，2025-01-20 的沒有快照，存的類別名稱是「Old name」
- **THEN** 類別的名稱和顏色是 Snacks、`#111111`

#### Scenario: 同一天的快照不同

- **WHEN** 兩筆 `categoryId` 都是 `gone`、日期相同，快照分別是「Treats」、`#222222` 和「Snacks」、`#111111`；或分別是「Snacks」、`#222222` 和「Snacks」、`#111111`
- **THEN** 都是 Snacks、`#111111`

#### Scenario: 都沒有快照、存的名稱不同

- **WHEN** 三筆 `categoryId` 都是 `gone`、都沒有快照：2025-01-05 存的類別名稱是「Alpha」，2025-01-20 的兩筆是「Zeta」和「Yak」
- **THEN** 類別的名稱和顏色是 Yak、`#808080`

### Requirement: INSIGHTS-8.1 類別的百分比和順序

The domain package SHALL 以類別金額佔該幣別總額的百分比作為類別的百分比，不四捨五入，並依金額由大到小排列類別。金額相同時，依名稱轉成小寫後的 Unicode 碼位順序排列；轉成小寫後相同時，依名稱本身的碼位順序；名稱也相同時，依顏色的碼位順序。

#### Scenario: 以該幣別的總額計

- **WHEN** 2025 年 1 月有 Travel 2000 USD、Food 6000 USD、Food 5000 JPY
- **THEN** USD 依序是 Food 75、Travel 25；JPY 是 Food 100

#### Scenario: 除不盡

- **WHEN** Food 100、Travel 200
- **THEN** 依序是 Travel 66.666…、Food 33.333…，不四捨五入

#### Scenario: 金額相同時依名稱

- **WHEN** 「Coffee」是 900，「Banana」、「apple」、「Fig」、「Éclair」、「餐飲」、「交通」、「😀」、「ｆ」都是 500
- **THEN** 依序是 Coffee、apple、Banana、Fig、Éclair、交通、餐飲、ｆ、😀，在每台裝置上都一樣

#### Scenario: 名稱只差大小寫或完全相同

- **WHEN** 類別清單有兩個「Tea」，顏色是 `#FF0000` 和 `#00FF00`；它們和一筆存的類別名稱是「tea」、對不到類別的支出，金額都是 500
- **THEN** 依序是 Tea `#00FF00`、Tea `#FF0000`、tea `#808080`

### Requirement: INSIGHTS-9.1 與上一個期間比較

WHEN 期間之前還有同一種的期間（月份或年份），the domain package SHALL 為它的每個幣別和最近的上一個期間比較：差額是本期的總額減上一期該幣別的總額，百分比是差額佔上一期總額的百分比，不四捨五入；上一期沒有該幣別時，上一期的總額是 0，百分比是空值。最早的期間沒有比較。

#### Scenario: 增加、減少和持平

- **WHEN** 上個月和這個月分別是 800 和 1200、1200 和 900、1000 和 1000
- **THEN** 差額和百分比分別是 400 和 50、-300 和 -25、0 和 0

#### Scenario: 跳過沒有支出的月份

- **WHEN** 2024 年 10 月有 1000，11 月和 12 月沒有支出，2025 年 1 月有 2000
- **THEN** 2025 年 1 月和 2024 年 10 月比較：上一期 1000，差額 1000，百分比 100

#### Scenario: 上一期沒有這個幣別

- **WHEN** 2024 年 12 月只有 500 USD，2025 年 1 月有 1000 USD 和 2000 JPY
- **THEN** 2025 年 1 月的 JPY 是上一期 0、差額 2000、百分比空值；USD 是上一期 500、差額 500、百分比 100

#### Scenario: 除不盡

- **WHEN** 上個月 300，這個月 400
- **THEN** 百分比是 33.333…，不四捨五入

#### Scenario: 年份

- **WHEN** 2022 年有 1000，2023 年沒有支出，2024 年有 1500
- **THEN** 2024 年和 2022 年比較：上一期 1000，差額 500，百分比 50

#### Scenario: 最早的期間

- **WHEN** 期間是最早的月份或年份
- **THEN** 它的幣別都沒有比較

### Requirement: INSIGHTS-10.1 依圖表偏好選圖

The domain package SHALL 依圖表偏好決定每個幣別畫哪種圖：Auto 時 1 個類別是進度條，2 到 5 個是環圈圖，6 個以上是橫條圖；Donut 一律是環圈圖；Bar 一律是橫條圖。除了超過 5 個類別的環圈圖（INSIGHTS-11.1），圖表畫出該幣別的全部類別。

#### Scenario: Auto

- **WHEN** 偏好是 Auto，類別有 1、2、5、6 個
- **THEN** 分別是進度條、環圈圖、環圈圖、橫條圖

#### Scenario: Donut 和 Bar

- **WHEN** 偏好是 Donut 或 Bar，類別有 1 或 7 個
- **THEN** Donut 都是環圈圖，Bar 都是橫條圖

#### Scenario: 畫出全部類別

- **WHEN** Auto 有 1、5、6 個類別，Donut 有 5 個，Bar 有 7 個
- **THEN** 圖表的類別和該幣別的類別相同

### Requirement: INSIGHTS-11.1 環圈圖超過 5 個類別時合併成 Others

IF 環圈圖有超過 5 個類別，THEN the domain package SHALL 只畫金額最大的 5 個類別，其餘合併成一個名為「Others」、灰色 `#808080` 的類別，金額是其餘類別的總和，百分比以該幣別的總額計；該幣別的類別仍是全部類別，不含 Others。

#### Scenario: 7 個類別

- **WHEN** 偏好是 Donut，7 個類別的金額是 70、60、50、40、30、20、10
- **THEN** 圖表是金額最大的 5 個類別加上 Others 30，`#808080`，百分比 10.714…；該幣別的類別是全部 7 個，沒有 Others

#### Scenario: 6 個類別

- **WHEN** 偏好是 Donut，6 個類別的金額是 60、50、40、30、20、10
- **THEN** 圖表是金額最大的 5 個類別加上 Others 10

### Requirement: INSIGHTS-12.1 總額超過安全整數時拒絕計算

IF 任何一個期間裡某個幣別的總額超過 9,007,199,254,740,991，THEN the domain package SHALL 拒絕計算，不回傳任何期間。

#### Scenario: 剛好在上限

- **WHEN** 2025 年 1 月有 9,007,199,254,740,990 USD 和 500 JPY，2 月有 1 USD
- **THEN** 照常計算，2025 年的 USD 總額是 9,007,199,254,740,991，JPY 總額是 500

#### Scenario: 年份的總額超過上限

- **WHEN** 2025 年 1 月有 9,007,199,254,740,990 USD，2 月有 2 USD，兩個月份各自都沒有超過
- **THEN** 拒絕計算，不回傳任何期間
