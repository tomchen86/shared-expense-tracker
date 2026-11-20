# Insights

## Purpose

支出分析：計算規則，以及手機 app 上顯示它的 Insights。計算規則是個人或群組情境下計入哪些支出、各計多少，依月份和年份建立期間，也替一段日期範圍算出一個期間，分幣別和類別加總，與上一個期間比較，以及每個幣別畫哪種圖；這些規則放在 `packages/domain`（ADR-0002）。金額都是最小單位的整數（ADR-0004），支出日期是 `YYYY-MM-DD`（LEDGER-8.1）。domain 只計算交給它的支出和類別清單，不判斷支出是否在垃圾桶裡，也不看群組或類別是否已封存。兩個類別名稱相同，是指兩邊都去掉頭尾空白並轉成小寫後相同，比法同 CATEGORIES-4.1。

Insights 是手機 app 上分析支出的畫面：個人的 Insights 分析個人情境（INSIGHTS-1.1），群組的 Insights 分析一個群組（INSIGHTS-2.1），兩者的畫面相同。計入的支出是 domain 計入的支出（INSIGHTS-3.1）。Insights 一次看一種期間：月份模式看月份期間，年份模式看年份期間（INSIGHTS-4.1），自訂模式看 From 到 To 這一段日期（INSIGHTS-46.1）；選中的期間是 Insights 現在顯示的期間，上一期是它之前最近的同一種期間，下一期是它之後最近的同一種期間，最早和最新的期間是現在這一種期間裡最早和最新的那一個；期間名稱是 INSIGHTS-4.1 的名稱。自訂模式下，選中的期間是 From 到 To 的範圍裡計入的支出算出的期間（INSIGHTS-44.1），範圍裡沒有計入的支出時沒有選中的期間；它沒有上一期和下一期，也沒有期間名稱。期間選擇器是點期間名稱時打開、選一個期間的地方。類別的支出是按 Insights 上一個類別那一列時打開的畫面（INSIGHTS-47.1）；它的期間、幣別和類別，是按那一列時 Insights 顯示的期間、那一列所在的幣別和那一列的類別。圖表類型是 Auto、Donut 或 Bar（INSIGHTS-10.1），存在本機資料裡，個人和群組的 Insights 用同一個。手機地區的貨幣格式見 LEDGER-40.2；手機地區的數字格式和百分比格式，是貨幣格式用的同一個語言和地區用來顯示數字和百分比的格式。螢幕閱讀器是 iOS 的 VoiceOver 或 Android 的 TalkBack。

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

### Requirement: INSIGHTS-6.2 在每個幣別內依類別名稱合併支出

The domain package SHALL 在每個幣別內，把對到的類別名稱相同的支出合併成一個類別，算在類別清單裡名稱相同的類別中最前面的那一個：有 `categoryId` 的支出對到清單裡 ID 相同的類別，沒有 `categoryId` 的支出對到清單裡第一個名稱和它存的類別名稱相同的類別。對不到類別的支出，有 `categoryId` 的依 `categoryId` 合併，沒有的依存的類別名稱合併，名稱相同就合成一個。

#### Scenario: 同一個 categoryId

- **WHEN** 兩筆 `categoryId` 是 `food` 的支出 400 和 600，存的類別名稱分別是「Food」和「Old food name」，還有一筆 `travel` 的 500
- **THEN** 類別是 Food 1000、Travel 500

#### Scenario: 沒有 categoryId 的支出依名稱對到類別

- **WHEN** 一筆沒有 `categoryId`、存的類別名稱是「 food 」的 300，和一筆 `categoryId` 是 `food` 的 200
- **THEN** 只有一個類別 Food 500

#### Scenario: 兩個空間的同名類別

- **WHEN** 類別清單依序有 `my-food`「Food & Dining」、`#D81B60` 和 `trip-food`「food & dining」、`#1E88E5`；支出是 `my-food` 的 300 和 `trip-food` 的 200
- **THEN** 只有一個類別 Food & Dining、`#D81B60`，500

#### Scenario: 用清單裡最前面的類別

- **WHEN** 類別清單依序有 `snacks-1`「Snacks」、`#111111` 和 `snacks-2`「SNACKS」、`#222222`；支出只有 `snacks-2` 的 100
- **THEN** 類別是 Snacks、`#111111`，100

#### Scenario: 對不到類別的名稱

- **WHEN** 沒有 `categoryId`、類別清單裡也沒有的「Gifts」100、「gifts」200，以及「Books」50，日期相同
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

- **WHEN** 兩筆 `categoryId` 分別是清單裡沒有的 `gone-1` 和 `gone-2` 的支出，快照都是「Tea」，顏色是 `#FF0000` 和 `#00FF00`；它們和一筆存的類別名稱是「tea」、對不到類別、沒有快照的支出，金額都是 500
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

### Requirement: INSIGHTS-13.1 個人的 Insights 開在 Expenses 分頁

WHEN 以網址 `/insights` 開啟 app 或推入這個網址，the mobile app SHALL 在 Expenses 分頁推入標題是「Insights」的個人的 Insights，分頁列仍選中 Expenses；返回或按 Android 的返回鍵就回到下面的畫面。

#### Scenario: 以網址開啟

- **WHEN** 以 `/insights` 開啟 app
- **THEN** 選中 Expenses 分頁，Expenses 分頁的堆疊由下而上是「Expenses」根畫面和「Insights」

#### Scenario: 返回

- **WHEN** 從支出清單打開 Insights 之後返回，或在 Android 上按返回鍵
- **THEN** 回到支出清單，分頁列仍選中 Expenses

### Requirement: INSIGHTS-14.1 群組的 Insights 開在 Groups 或 Settings 分頁

WHEN 以網址 `/groups/insights?groupId=<群組 ID>` 或 `/settings/archived-groups/insights?groupId=<群組 ID>` 開啟 app 或推入這個網址，the mobile app SHALL 在 Groups 或 Settings 分頁推入這個群組的 Insights，標題是「Insights」，分頁列選中同一個分頁，封存的群組也一樣；返回或按 Android 的返回鍵就回到下面的畫面。

#### Scenario: Groups 分頁

- **WHEN** Brisbane 有 6900 USD 的支出，以 `/groups/insights?groupId=` 加上 Brisbane 的群組 ID 開啟 app
- **THEN** 選中 Groups 分頁，Groups 分頁的堆疊由下而上是「Groups」根畫面和「Insights」，總額是「$69.00」

#### Scenario: Settings 分頁

- **WHEN** 封存 Brisbane 之後，以 `/settings/archived-groups/insights?groupId=` 加上它的群組 ID 開啟 app
- **THEN** 選中 Settings 分頁，Settings 分頁的堆疊由下而上是「Settings」根畫面和「Insights」，總額是「$69.00」

### Requirement: INSIGHTS-15.1 找不到群組時顯示「Group not found.」

IF 群組的 Insights 的網址沒有群組 ID，或它不是任何群組的群組 ID，THEN the mobile app SHALL 讓這個畫面的標題是「Insights」，只顯示「Group not found.」，標題列沒有「Chart visualization」選單；打開存在的群組時，SHALL 從推入畫面到讀完支出都不顯示「Group not found.」。

#### Scenario: 不存在的群組

- **WHEN** 以 `/groups/insights?groupId=00000000-0000-4000-8000-000000000000` 開啟 app
- **THEN** 選中 Groups 分頁，標題是「Insights」，只顯示「Group not found.」，沒有「No expenses yet」，標題列沒有「Chart visualization」

#### Scenario: 沒有群組 ID

- **WHEN** 以 `/groups/insights` 開啟 app
- **THEN** 只顯示「Group not found.」

#### Scenario: 存在的群組

- **WHEN** Brisbane 有支出時以它的 Insights 的網址開啟 app，還沒讀完支出
- **THEN** 沒有顯示「Group not found.」；讀完之後顯示 Brisbane 的總額

### Requirement: INSIGHTS-16.1 Insights 分析存著、不在垃圾桶裡的支出

The mobile app SHALL 讓個人的 Insights 依 INSIGHTS-1.1 分析所有不在垃圾桶裡的支出，包括封存群組的支出，讓群組的 Insights 依 INSIGHTS-2.1 分析這個群組所有不在垃圾桶裡的支出；垃圾桶裡的支出不算進任何 Insights。新增、修改、移到垃圾桶或還原支出之後回到 Insights，或重新啟動 app 之後，Insights 都和存著的支出一致。

#### Scenario: 個人的 Insights 算你的份額

- **WHEN** 存過名字「Taylor」，2026 年 10 月有 875 USD 的個人支出「Coffee run」，和 Brisbane 的 6000 USD 的「Dinner」，Casey 付款，依序分給 Taylor、Casey 和 Blake
- **THEN** 個人的 Insights 的總額是「$28.75」，和支出清單上方的總額「$28.75」一樣

#### Scenario: 和你無關的群組支出

- **WHEN** Brisbane 還有 900 USD 的「Taxi」，Casey 付款，只有 Blake 分攤
- **THEN** 個人的 Insights 的總額仍是「$28.75」；Brisbane 的 Insights 的總額是「$69.00」

#### Scenario: 其他群組

- **WHEN** Tokyo 有 500 USD 的「Sushi」，Taylor 付款也分攤
- **THEN** Brisbane 的 Insights 的總額仍是「$69.00」，Tokyo 的是「$5.00」，個人的是「$33.75」

#### Scenario: 封存的群組

- **WHEN** 沒有 Tokyo 時封存 Brisbane
- **THEN** 個人的 Insights 的總額仍是「$28.75」，Brisbane 的 Insights 仍是「$69.00」

#### Scenario: 垃圾桶裡的支出

- **WHEN** 把 Coffee run 移到垃圾桶
- **THEN** 個人的 Insights 的總額是「$20.00」；在 Trash 還原 Coffee run 之後又是「$28.75」

#### Scenario: Insights 開著時改了支出

- **WHEN** 個人的 Insights 開著時，在 Edit Expense 把 Dinner 的金額改成「90.00」後按 Save
- **THEN** 回到 Insights 時總額是「$38.75」

#### Scenario: 重新啟動

- **WHEN** 重新啟動 app 後打開 Insights
- **THEN** 總額和重新啟動之前一樣

### Requirement: INSIGHTS-17.1 個人的 Insights 合併不同空間的同名分類

WHILE 分析個人支出，the mobile app SHALL 把名稱相同的分類算成一個類別（INSIGHTS-6.2），用個人空間那個分類現在的名稱和顏色；個人空間沒有同名的分類時，用有同名分類的群組中最早建立的那一個的。群組的 Insights 用這個群組的分類現在的名稱和顏色。封存的分類和封存群組的分類也照這條規則，名稱後面不加「(Archived)」。

#### Scenario: 個人和群組的 Food & Dining

- **WHEN** 存過名字「Taylor」，Brisbane 的 Food & Dining 改用 `#43A047`；有 875 USD 的個人支出「Coffee run」，和 Brisbane 的 6000 USD 的「Dinner」，依序分給 Taylor、Casey 和 Blake，都是 Food & Dining
- **THEN** 個人的 Insights 只有一列 Food & Dining，色點是 `#D81B60`，金額是「$28.75」；Brisbane 的 Insights 是 Food & Dining，色點是 `#43A047`，金額是「$60.00」

#### Scenario: 個人空間沒有同名的分類

- **WHEN** 依序建立 Tokyo 和 Brisbane，在 Tokyo 的 Group Categories 新增「flights」，在 Brisbane 的新增「Flights」，兩邊各有一筆 Taylor 分攤的支出用它
- **THEN** 個人的 Insights 只有一列「flights」（最早建立的 Tokyo 的名稱，不是名稱排在前面的 Brisbane 或「Flights」），金額是兩筆的份額的總和

#### Scenario: 個人的分類改了名

- **WHEN** 在 Manage Categories 把 Food & Dining 改名為「Meals」
- **THEN** 個人的 Insights 有 Meals（Coffee run）和 Food & Dining（Dinner 的份額）兩列；Brisbane 的 Insights 仍是 Food & Dining

#### Scenario: 封存的分類

- **WHEN** 有 875 USD 的 Shopping 的支出時封存 Shopping
- **THEN** 個人的 Insights 仍是一列「Shopping」，色點是 `#FBC02D`，沒有「(Archived)」

### Requirement: INSIGHTS-18.1 沒有計入的支出時顯示提示

WHILE 沒有計入的支出，the mobile app SHALL 在 Insights 只顯示標題「No expenses yet」和「Add an expense to see spending insights.」，沒有期間的控制、總額和類別，標題列也沒有「Chart visualization」選單。

#### Scenario: 第一次啟動

- **WHEN** 第一次啟動 app 後打開個人的 Insights
- **THEN** 只顯示「No expenses yet」和「Add an expense to see spending insights.」，「No expenses yet」是標題；標題列沒有「Chart visualization」

#### Scenario: 只有垃圾桶裡的支出

- **WHEN** 唯一一筆支出 Coffee run 在垃圾桶裡，打開個人的 Insights
- **THEN** 只顯示這兩句話

#### Scenario: 份額是 0

- **WHEN** 只有 Brisbane 的「Taxi」，Taylor 付款，只有 Casey 分攤
- **THEN** 個人的 Insights 只顯示這兩句話；Brisbane 的 Insights 有 Taxi 的金額

#### Scenario: 新的群組

- **WHEN** 建立 Brisbane 之後打開它的 Insights
- **THEN** 只顯示這兩句話

### Requirement: INSIGHTS-19.2 讀完支出之前不顯示沒有支出的樣子

WHILE Insights 還沒讀完存著的支出，the mobile app SHALL 不顯示「No expenses yet」、「Add an expense to see spending insights.」和 INSIGHTS-20.1 的提示，自訂模式的「No Expenses in These Dates」、「Choose other dates to see spending insights.」和「Totals Too Large」（INSIGHTS-46.1）也不顯示。

#### Scenario: 開啟 app

- **WHEN** 有 Coffee run 時以 `/insights` 開啟 app，還沒讀完存著的支出
- **THEN** 沒有「No expenses yet」和「Add an expense to see spending insights.」；讀完之後顯示 Coffee run 的金額

#### Scenario: 以起訖日期開啟 app

- **WHEN** 今天是 `2026-10-30`，有今天的 Coffee run 時以 `/insights?from=2026-10-01&to=2026-10-30` 開啟 app，還沒讀完存著的支出
- **THEN** 沒有「No Expenses in These Dates」和「Choose other dates to see spending insights.」；讀完之後顯示 Coffee run 的金額

### Requirement: INSIGHTS-20.1 domain 拒絕計算時顯示提示

IF domain 因為總額超過上限拒絕計算（INSIGHTS-12.1），THEN the mobile app SHALL 在 Insights 只顯示標題「Totals Too Large」和「These totals are too large to show.」，沒有期間的控制、總額和類別，標題列也沒有「Chart visualization」選單。

#### Scenario: 一年的總額超過上限

- **WHEN** 2026 年的 USD 支出加起來超過 9,007,199,254,740,991，例如 9,008 筆 999,999,999,999 USD 的支出
- **THEN** 只顯示「Totals Too Large」和「These totals are too large to show.」，標題列沒有「Chart visualization」

### Requirement: INSIGHTS-21.2 打開時選中最新的月份

WHEN Insights 打開而網址沒有指定期間（INSIGHTS-45.1），the mobile app SHALL 用月份模式，選中最新的月份期間。

#### Scenario: 好幾個月份

- **WHEN** 支出的日期是 `2024-12-31`、`2025-01-20` 和 `2025-03-10`，以 `/insights` 打開 Insights
- **THEN** 選中的期間是「March 2025」

#### Scenario: 再打開一次

- **WHEN** 在 Insights 選中「January 2025」之後返回，再打開 Insights
- **THEN** 選中的期間又是「March 2025」

### Requirement: INSIGHTS-22.3 總額卡

The mobile app SHALL 在 Insights 顯示一張總額卡，最上面是一次「TOTAL SPENT」，下面為選中的期間的每個幣別，依幣別代碼排序各顯示用手機地區的貨幣格式顯示的總額（INSIGHTS-5.1）、在群組的 Insights 上一行「Your share: <你在這個幣別、這個期間不在垃圾桶裡的支出的份額>」，以及選中的期間有上一期時的比較（INSIGHTS-9.1）：上一期沒有這個幣別時是「No spending in <上一期的名稱>.」，差額是 0 時是「Same as <上一期的名稱>.」，其他時候是「<差額的絕對值> more than <上一期的名稱>, <百分比> percent.」，差額小於 0 時「more」換成「less」；差額的絕對值用手機地區的貨幣格式，百分比是 INSIGHTS-9.1 的百分比的絕對值，用手機地區的數字格式顯示到小數一位，四捨五入。螢幕閱讀器把每個幣別讀成一項「Total spent <總額>.」，有你的份額時再接一個空格和「Your share <份額>.」，有比較時再接一個空格和比較。

#### Scenario: 比上一期多

- **WHEN** 2024 年 12 月有 800 USD，2025 年 1 月有 1200 USD，選中 January 2025
- **THEN** 總額卡依序是「TOTAL SPENT」、「$12.00」和「$4.00 more than December 2024, 50.0 percent.」；螢幕閱讀器讀出「Total spent $12.00. $4.00 more than December 2024, 50.0 percent.」

#### Scenario: 比上一期少和持平

- **WHEN** 上一期和選中的期間分別是 1200 USD 和 900 USD，或都是 1000 USD
- **THEN** 比較分別是「$3.00 less than December 2024, 25.0 percent.」和「Same as December 2024.」

#### Scenario: 上一期沒有這個幣別

- **WHEN** 2024 年 12 月只有 500 USD，2025 年 1 月有 1000 USD 和 2000 JPY，選中 January 2025
- **THEN** 一張卡依序是「TOTAL SPENT」、「¥2,000」、「No spending in December 2024.」、「$10.00」、「$5.00 more than December 2024, 100.0 percent.」，「TOTAL SPENT」只有一個

#### Scenario: 最早的期間

- **WHEN** 選中 December 2024，它是最早的期間，有 800 USD
- **THEN** 總額卡只有「TOTAL SPENT」和「$8.00」；螢幕閱讀器讀出「Total spent $8.00.」

#### Scenario: 跳過沒有支出的月份

- **WHEN** 2024 年 10 月有 1000 USD，11 月和 12 月沒有支出，2025 年 1 月有 2000 USD，選中 January 2025
- **THEN** 比較是「$10.00 more than October 2024, 100.0 percent.」

#### Scenario: 四捨五入和數字格式

- **WHEN** 手機第一個偏好的語言和地區是英文（美國），上一期和選中的期間分別是 300 USD 和 500 USD，或 1 USD 和 1235 USD
- **THEN** 百分比分別是「66.7」和「123,400.0」

#### Scenario: 手機的語言不是英文

- **WHEN** 手機第一個偏好的語言和地區是法文（澳洲），2024 年 12 月有 800 AUD，選中有 1200 AUD 的 2025 年 1 月
- **THEN** 總額是「$12.00」，比較是「$4.00 more than December 2024, 50.0 percent.」，不是「12,00 $AU」

#### Scenario: 群組的 Insights

- **WHEN** 名字是「Taylor」，Brisbane 只有 2025 年 1 月 Casey 付的 60.00 USD 的 Dinner，分給 Taylor、Casey 和 Blake，打開 Brisbane 的 Insights
- **THEN** 總額卡依序是「TOTAL SPENT」、「$60.00」、「Your share: $20.00」；螢幕閱讀器讀出「Total spent $60.00. Your share $20.00.」

#### Scenario: 只算選中的期間

- **WHEN** Brisbane 在 2024 年 12 月有 30.00 USD 的 Dinner，2025 年 1 月有 60.00 USD 的 Dinner，都是 Casey 付、分給 Taylor、Casey 和 Blake，2025 年 1 月還有 Casey 付、只分給 Taylor、已移到垃圾桶的 9.00 USD 的 Taxi，打開 Brisbane 的 Insights
- **THEN** 總額卡依序是「TOTAL SPENT」、「$60.00」、「Your share: $20.00」和「$30.00 more than December 2024, 100.0 percent.」；螢幕閱讀器讀出「Total spent $60.00. Your share $20.00. $30.00 more than December 2024, 100.0 percent.」

#### Scenario: 和你無關的幣別

- **WHEN** Brisbane 同一期還有 Casey 付、只有 Blake 分攤的 3000 JPY 的 Taxi
- **THEN** 日圓的總額下面是「Your share: ¥0」

#### Scenario: 個人的 Insights

- **WHEN** 打開 Expenses 分頁的 Insights
- **THEN** 沒有「Your share」

### Requirement: INSIGHTS-23.4 每個幣別的類別

The mobile app SHALL 在總額卡下面，為選中的期間的每個幣別依幣別代碼排序，顯示標題「<幣別代碼> categories」、這個幣別的圖（INSIGHTS-24.1），和這個幣別的類別（INSIGHTS-6.2 到 INSIGHTS-8.1，不含 INSIGHTS-11.1 的 Others），依 INSIGHTS-8.1 的順序由上而下每個類別一列：類別顏色的色點、類別的名稱，和「<金額> · <百分比>」，金額用手機地區的貨幣格式，百分比用手機地區的百分比格式顯示到小數一位，四捨五入，例如英文（美國）是「75.0%」；名稱只佔一行，放不下時尾端漸層消失（SHELL-68.1）；每一列是一個按鈕，右邊有「›」，按了打開這個類別的支出（INSIGHTS-47.1）。螢幕閱讀器把每個幣別的標題讀成標題，把每一列讀成一個按鈕「<完整的名稱>, <金額>, <百分比的數字> percent」，再讀出無障礙提示「Shows these expenses」，不讀色點和「›」。

#### Scenario: 一個幣別

- **WHEN** 2025 年 1 月有 Food & Dining 的 600 USD 和 Transportation 的 200 USD
- **THEN** 總額卡下面依序是「USD categories」、Food & Dining 和「$6.00 · 75.0%」、Transportation 和「$2.00 · 25.0%」；色點分別是 `#D81B60` 和 `#1E88E5`，在名稱前面；每一列的右邊是「›」

#### Scenario: 螢幕閱讀器

- **WHEN** 螢幕閱讀器讀這兩列
- **THEN** 「USD categories」是標題，兩列讀成按鈕「Food & Dining, $6.00, 75.0 percent」和「Transportation, $2.00, 25.0 percent」，提示都是「Shows these expenses」，不讀色點和「›」

#### Scenario: 兩個幣別

- **WHEN** 2025 年 1 月有 Food & Dining 的 600 USD 和 Travel 的 2000 JPY
- **THEN** 依序是「JPY categories」和 Travel「¥2,000 · 100.0%」，再來是「USD categories」和 Food & Dining「$6.00 · 100.0%」

#### Scenario: 手機的語言不是英文

- **WHEN** 手機第一個偏好的語言和地區是法文（澳洲），2025 年 1 月有 Food & Dining 的 600 AUD 和 Transportation 的 200 AUD
- **THEN** 兩列是「$6.00 · 75.0%」和「$2.00 · 25.0%」，不是「6,00 $AU · 75,0 %」

#### Scenario: 不含 Others

- **WHEN** 圖表類型是 Donut，2025 年 1 月有 7 個類別的支出
- **THEN** 列出 7 個類別，沒有「Others」

#### Scenario: 四捨五入

- **WHEN** 2025 年 1 月有 Food & Dining、Transportation 和 Shopping 各 100 USD
- **THEN** 三列都是「$1.00 · 33.3%」

#### Scenario: 很長的名稱

- **WHEN** 分類的名稱是 50 個「a」
- **THEN** 這一列的名稱只佔一行，放不下的部分不顯示，也沒有「…」；螢幕閱讀器讀出完整的 50 個「a」

### Requirement: INSIGHTS-24.1 每個幣別的圖

The mobile app SHALL 在每個幣別的標題和類別之間，畫出 domain 依圖表類型為這個幣別決定的圖（INSIGHTS-10.1、INSIGHTS-11.1）：圖的種類，和圖上每個類別的名稱、顏色、金額和百分比，都和 domain 決定的一樣；螢幕閱讀器略過整張圖。

#### Scenario: Auto

- **WHEN** 圖表類型是 Auto，選中的期間的 USD 有 1 個、JPY 有 2 個、AUD 有 7 個類別
- **THEN** AUD 是畫出 7 個類別的橫條圖，JPY 是環圈圖，USD 是進度條

#### Scenario: Donut 合併 Others

- **WHEN** 圖表類型是 Donut，USD 有 7 個類別，金額是 70、60、50、40、30、20、10
- **THEN** USD 的圖是金額最大的 5 個類別加上 Others 30、`#808080` 的環圈圖

#### Scenario: 螢幕閱讀器

- **WHEN** 螢幕閱讀器讀 Insights
- **THEN** 跳過每一張圖，只讀標題、總額卡和類別

### Requirement: INSIGHTS-25.1 (manual) 手機上的圖

WHERE iPhone 或 Android 手機，the mobile app SHALL 用類別的顏色畫每個幣別的圖：進度條是一條長條，填滿的部分是那個類別的百分比；環圈圖是中間空心的圓環，每個類別一段，依類別的順序排列，每段的長度和它的金額成比例；橫條圖每個類別一列，依類別的順序由上而下，每條的長度和它的金額成比例，金額最大的最長。

#### Scenario: 進度條

- **WHEN** 圖表類型是 Auto，選中的期間只有 Food & Dining 的支出
- **THEN** 圖是一條填滿的 `#D81B60` 長條

#### Scenario: 環圈圖

- **WHEN** 圖表類型是 Auto，有 Food & Dining 500、Transportation 300 和 Shopping 200
- **THEN** 圖是中間空心的圓環，依序是佔一半的 `#D81B60`、佔 30% 的 `#1E88E5` 和佔 20% 的 `#FBC02D`

#### Scenario: 橫條圖

- **WHEN** 圖表類型是 Bar，有 Food & Dining 600 和 Transportation 300
- **THEN** 由上而下是 `#D81B60` 和 `#1E88E5` 的橫條，後者的長度是前者的一半

### Requirement: INSIGHTS-26.1 圖表類型的選單

WHILE Insights 有選中的期間，the mobile app SHALL 在標題列放名稱是「Chart visualization」、標題是「Visualization」的選項選單（SHELL-54.1、SHELL-55.1），圖示在 iOS 是 `chart.bar.xaxis`、在 Android 是 `bar_chart`，選項依序是「Auto」、「Donut」、「Bar」，標出現在的圖表類型，還沒選過時是 Auto；使用者選一個選項時，SHALL 立即用它重畫每個幣別的圖、標出它，並把它存成圖表類型，所以個人和群組的 Insights 都用它，重新啟動 app 之後也是它。

#### Scenario: iOS

- **WHEN** iOS 上第一次打開有支出的 Insights
- **THEN** 標題列右邊是圖示 `chart.bar.xaxis`、名稱「Chart visualization」、標題「Visualization」的選單，依序列出「Auto」、「Donut」、「Bar」，只有 Auto 打勾

#### Scenario: Android

- **WHEN** Android 上第一次打開有支出的 Insights，按名稱「Chart visualization, Auto selected」的 `bar_chart`
- **THEN** 跳出標題「Chart visualization」的對話框，依序列出「Auto, selected」、「Donut」和「Bar」

#### Scenario: 選 Donut

- **WHEN** USD 有 7 個類別時選「Donut」
- **THEN** USD 的圖立即變成金額最大的 5 個類別加上 Others 的環圈圖，Donut 打勾

#### Scenario: 重新啟動

- **WHEN** 選了「Bar」之後重新啟動 app，再打開 Insights
- **THEN** Bar 打勾，每個幣別的圖都是橫條圖

#### Scenario: 個人和群組

- **WHEN** 在個人的 Insights 選了「Donut」，再打開 Brisbane 的 Insights
- **THEN** Brisbane 的 Insights 也是 Donut 打勾

### Requirement: INSIGHTS-27.1 圖表類型存不進去時提示

IF 圖表類型存不進本機資料，THEN the mobile app SHALL 跳出標題「Unable to Save Settings」、內容「Your settings could not be saved. Please try again.」的提示框，圖和標出的選項都回到原本的圖表類型。

#### Scenario: 寫入失敗

- **WHEN** 圖表類型是 Auto，資料庫無法寫入時選「Bar」
- **THEN** 跳出這個提示框一次，Auto 打勾，圖是 Auto 的圖；重新啟動 app 之後仍是 Auto

#### Scenario: 再試一次

- **WHEN** 寫入失敗後資料庫恢復，再選一次「Bar」
- **THEN** Bar 打勾，圖是橫條圖；重新啟動 app 之後仍是 Bar

### Requirement: INSIGHTS-28.2 期間的控制

WHILE Insights 有選中的期間，或在自訂模式而 Insights 有計入的支出（From 到 To 的範圍裡沒有也算），the mobile app SHALL 在總額卡上方，由上而下顯示名稱是「Period aggregation」的單選群組，依序是「Month」、「Year」和「Custom」，標出現在的模式；月份和年份模式時，它下面是一列由左而右是名稱為「Previous period」的按鈕、期間名稱和名稱為「Next period」的按鈕，自訂模式時這一列換成 From 和 To（INSIGHTS-46.1）。有兩個以上的期間時，期間名稱後面有箭頭，按了打開期間選擇器（INSIGHTS-35.1）；除了 iOS 的年份選單（INSIGHTS-37.1），這時期間名稱是名稱為「Choose period. <期間名稱>」的按鈕。

#### Scenario: 好幾個月份

- **WHEN** 支出的日期是 `2025-01-20` 和 `2025-03-10`，打開 Insights
- **THEN** 總額卡上方是標出 Month 的「Period aggregation」，依序是「Month」、「Year」和「Custom」，和由左而右的「Previous period」、「March 2025」和「Next period」；「March 2025」是名稱為「Choose period. March 2025」的按鈕

#### Scenario: 自訂模式

- **WHEN** 接著選「Custom」
- **THEN** 標出 Custom；「Period aggregation」下面是 From 和 To，沒有「Previous period」、期間名稱和「Next period」

### Requirement: INSIGHTS-29.1 切換月份和年份

WHEN 使用者在月份模式選「Year」，the mobile app SHALL 換成年份模式，選中原本選中的月份所在的年份；WHEN 使用者在年份模式選「Month」，the mobile app SHALL 換成月份模式，選中這一年最新的月份期間。

#### Scenario: 切到年份

- **WHEN** 支出的日期是 `2024-11-10`、`2025-01-20` 和 `2025-03-10`，選中 January 2025 時選「Year」
- **THEN** 標出 Year，選中的期間是「2025」

#### Scenario: 切回月份

- **WHEN** 接著選「Month」
- **THEN** 標出 Month，選中的期間是「March 2025」

#### Scenario: 從較早的年份切回月份

- **WHEN** 年份模式選中 2024 時選「Month」
- **THEN** 選中的期間是「November 2024」

#### Scenario: 年份的比較

- **WHEN** 2024 年有 1000 USD，2025 年有 1500 USD，年份模式選中 2025
- **THEN** 比較是「$5.00 more than 2024, 50.0 percent.」

### Requirement: INSIGHTS-30.2 (e2e) iOS 的 Month、Year 和 Custom

WHERE iOS，the mobile app SHALL 把 Month、Year 和 Custom 的單選群組顯示成系統的分段控制，點一個選項就選中那個模式。

#### Scenario: 切到年份再切回月份

- **WHEN** iOS 上打開有這個月和上個月的支出的 Insights，點「Year」，再點「Month」
- **THEN** 點「Year」之後期間名稱是今年，點「Month」之後是這個月

#### Scenario: 切到自訂

- **WHEN** iOS 上接著點「Custom」，再點「Month」
- **THEN** 點「Custom」之後沒有期間名稱，出現 From 和 To 兩個日期；點「Month」之後期間名稱又是這個月

### Requirement: INSIGHTS-31.2 Android 的 Month、Year 和 Custom

WHERE Android，the mobile app SHALL 把 Month、Year 和 Custom 的單選群組顯示成並排的「Month」、「Year」和「Custom」三個按鈕，螢幕閱讀器把現在的模式念成已勾選。

#### Scenario: 打開 Insights

- **WHEN** Android 上打開有支出的 Insights
- **THEN** 「Period aggregation」裡是並排的「Month」、「Year」和「Custom」，Month 是已勾選

### Requirement: INSIGHTS-32.1 上一期和下一期

WHEN 使用者按「Previous period」或「Next period」，the mobile app SHALL 選中上一期或下一期，跳過沒有計入的支出的月份或年份；選中的是最早的期間時，SHALL 停用「Previous period」，選中的是最新的期間時，SHALL 停用「Next period」。

#### Scenario: 跳過沒有支出的月份

- **WHEN** 支出的日期是 `2024-10-05` 和 `2025-01-20`，選中 January 2025 時按「Previous period」
- **THEN** 選中的期間是「October 2024」，總額卡和類別都是 October 2024 的；再按「Next period」又是「January 2025」

#### Scenario: 停用

- **WHEN** 選中 January 2025，它是最新的期間
- **THEN** 「Next period」停用，按了沒有反應，「Previous period」可以按；選中 October 2024 時，「Previous period」停用

### Requirement: INSIGHTS-33.2 (e2e) 在期間名稱或內容上滑動

WHEN 使用者在期間名稱或下面的內容上往右滑，the mobile app SHALL 選中上一期；WHEN 使用者往左滑，the mobile app SHALL 選中下一期；那個方向沒有期間時，滑動沒有作用；往上滑時選中的期間不變。

#### Scenario: 往右滑再往左滑

- **WHEN** iOS 上選中最新的月份時，在期間名稱上往右滑，再往左滑
- **THEN** 往右滑之後選中上一期，「Next period」可以按；往左滑之後又是最新的月份，「Next period」停用

#### Scenario: 在內容上滑

- **WHEN** 選中最新的月份時，在總額卡上往右滑
- **THEN** 選中上一期

#### Scenario: 最新的期間往左滑

- **WHEN** 選中最新的月份時在期間名稱上往左滑
- **THEN** 選中的期間不變

#### Scenario: 上下滑

- **WHEN** 在內容上往上滑
- **THEN** 選中的期間不變

### Requirement: INSIGHTS-34.1 只有一個期間時

WHILE 現在是月份或年份模式，而這個模式只有一個期間，the mobile app SHALL 只用文字顯示期間名稱：沒有「Previous period」和「Next period」，期間名稱不是按鈕，後面沒有箭頭，點它或在它上面滑動都沒有作用。自訂模式沒有期間名稱（INSIGHTS-28.2）。

#### Scenario: 只有一個月份

- **WHEN** 只有日期是 `2025-01-20` 的支出
- **THEN** 「January 2025」是文字，不是按鈕；沒有「Previous period」和「Next period」

#### Scenario: 好幾個月份、只有一個年份

- **WHEN** 支出在 2025 年 1 月和 3 月，切到年份模式
- **THEN** 「2025」是文字，不是按鈕；沒有「Previous period」和「Next period」

### Requirement: INSIGHTS-35.1 期間選擇器

WHEN 使用者按期間名稱，the mobile app SHALL 打開期間選擇器，只列出現在這一種期間裡的期間，也就是有計入的支出的月份或年份；在期間選擇器選定一個期間，就選中它。各平台的期間選擇器見 INSIGHTS-36.2 到 INSIGHTS-39.1。

#### Scenario: 只列出有支出的月份

- **WHEN** 支出的日期是 `2024-11-10`、`2025-01-20` 和 `2025-03-10`，在月份模式按「Choose period. March 2025」
- **THEN** 期間選擇器的 2025 年只有 January 和 March，2024 年只有 November，沒有其他月份

### Requirement: INSIGHTS-36.2 (e2e) iOS 的月份選擇器

WHERE iOS，WHEN 使用者在月份模式按期間名稱，the mobile app SHALL 從底部升起標題是「Period」的面板，左邊是名稱為「Cancel」的按鈕，右邊是名稱為「Done」的按鈕，中間是「Year」和「Month」兩列，各有一個系統選單：Year 由新到舊列出有計入的支出的年份，Month 依月份的先後列出 Year 選的那一年裡的月份期間，一開始是選中的期間；在 Year 換一個年份時，Month 換成那一年的同一個月，那一年沒有這個月時換成那一年最新的月份。按「Done」就選中面板上的月份並關掉面板；按「Cancel」或往下滑就關掉面板，選中的期間不變。

#### Scenario: 選一個月份

- **WHEN** iOS 上選中 March 2025 時按期間名稱，在 Month 選「January」，按「Done」
- **THEN** 面板關掉，選中的期間是「January 2025」

#### Scenario: 換年份

- **WHEN** 有 2024 年 11 月的支出，在面板的 Year 選「2024」，按「Done」
- **THEN** 選中的期間是「November 2024」

#### Scenario: 取消

- **WHEN** 在 Month 選「January」之後按「Cancel」
- **THEN** 面板關掉，選中的期間仍是「March 2025」

### Requirement: INSIGHTS-37.1 (e2e) iOS 的年份選單

WHERE iOS，WHILE 年份模式有 2 到 8 個期間，the mobile app SHALL 讓期間名稱是一個系統選單，由新到舊列出這些年份，選中的年份打勾；選一個年份就選中它。

#### Scenario: 選去年

- **WHEN** iOS 上有今年和去年的支出，年份模式選中今年時按期間名稱，選去年
- **THEN** 選中的期間是去年

### Requirement: INSIGHTS-38.2 (manual) iOS 年份很多時的選擇器

WHERE iOS，WHILE 年份模式有 9 個以上的期間，WHEN 使用者按期間名稱，the mobile app SHALL 從底部升起標題是「Period」的面板：9 到 24 個期間時，面板裡是由舊到新的年份滾輪，一開始在選中的年份，左邊是名稱為「Cancel」的 ✕，右邊是名稱為「Done」的 ✓，按「Done」選中滾輪上的年份，按「Cancel」或往下滑選中的期間不變；25 個以上時，面板裡是「AVAILABLE PERIODS」和由新到舊的年份清單，選中的年份打勾，左邊是名稱為「Close」的 ✕，點一個年份就選中它並關掉面板，按「Close」或往下滑選中的期間不變。

#### Scenario: 滾輪

- **WHEN** iPhone 上有 2001 到 2012 年每年一筆支出，年份模式選中 2012 時按「Choose period. 2012」，把滾輪轉到 2005，按「Done」
- **THEN** 面板一開始在 2012；按 Done 之後選中的期間是「2005」

#### Scenario: 清單

- **WHEN** 有 1991 到 2025 年每年一筆支出，年份模式按「Choose period. 2025」，點「2000」
- **THEN** 清單由上而下從 2025 到 1991，2025 打勾；點了之後面板關掉，選中的期間是「2000」

### Requirement: INSIGHTS-39.1 Android 的期間選擇器

WHERE Android，WHEN 使用者按期間名稱，the mobile app SHALL 跳出對話框：月份模式的標題是「Select Month」，有兩個以上的年份時，上面是「YEAR」和由新到舊的年份按鈕，名稱是「Year <年份>」，正在看的年份標成已選，下面是「MONTH」、正在看的年份，和這一年的月份期間，由新到舊，每個月份是顯示月份、名稱是期間名稱的按鈕；正在看的年份一開始是選中的期間所在的年份，點年份按鈕只換下面列出的月份。年份模式的標題是「Select Year」，下面是「YEAR」和由新到舊的年份，每個年份是名稱為那個年份的按鈕。選中的期間打勾並標成已選；點一個月份或年份就選中它並關掉對話框；按名稱是「Close <標題>」的按鈕、按返回鍵或點對話框外面就關掉對話框，選中的期間不變。

#### Scenario: Select Month

- **WHEN** Android 上支出的日期是 `2024-11-10`、`2025-01-20` 和 `2025-03-10`，選中 March 2025 時按「Choose period. March 2025」
- **THEN** 跳出「Select Month」，依序是「YEAR」、「Year 2025」（已選）和「Year 2024」，再來是「MONTH」、「2025」、「March」（打勾、已選）和「January」，月份的名稱是「March 2025」和「January 2025」

#### Scenario: 看另一年

- **WHEN** 點「Year 2024」
- **THEN** 對話框仍開著，「Year 2024」已選，「MONTH」下是「2024」和「November」；選中的期間仍是「March 2025」

#### Scenario: 選一個月份

- **WHEN** 點「November」
- **THEN** 對話框關掉，選中的期間是「November 2024」

#### Scenario: 只有一個年份

- **WHEN** 支出只在 2025 年 1 月和 3 月，按「Choose period. March 2025」
- **THEN** 對話框沒有「YEAR」和年份按鈕，只有「MONTH」、「2025」、「March」和「January」

#### Scenario: Select Year

- **WHEN** 年份模式選中 2025 時按「Choose period. 2025」，再點「2024」
- **THEN** 跳出「Select Year」，依序是「YEAR」、「2025」（打勾、已選）和「2024」；點了之後對話框關掉，選中的期間是「2024」

#### Scenario: 關掉

- **WHEN** 對話框開著時按「Close Select Month」、按返回鍵或點對話框外面
- **THEN** 對話框關掉，選中的期間不變

### Requirement: INSIGHTS-40.1 選中的期間沒有支出了

IF 月份或年份模式選中的期間因為支出改變而不再是期間，THEN the mobile app SHALL 改選同一年最新的同一種期間，同一年沒有時改選最新的期間；一個期間都沒有時，顯示 INSIGHTS-18.1 的提示。自訂模式不改選，From 和 To 不變（INSIGHTS-46.1）。

#### Scenario: 同一年還有月份

- **WHEN** 存過名字「Taylor」，有 2024 年 11 月和 2025 年 1 月的個人支出，和 2025 年 3 月 Brisbane 的「Dinner」，Taylor 有分攤；個人的 Insights 選中 March 2025 時，在 Edit Expense 把 Dinner 的日期改成 `2024-11-15` 後按 Save
- **THEN** 回到 Insights 時選中的期間是「January 2025」

#### Scenario: 同一年沒有了

- **WHEN** 有 2024 年 11 月的個人支出和 2025 年 3 月的 Dinner，選中 March 2025 時把 Dinner 的日期改成 `2024-08-15`
- **THEN** 選中的期間是「November 2024」

#### Scenario: 都沒有了

- **WHEN** 只有 Dinner，個人的 Insights 開著時把 Dinner 改成只有 Casey 分攤
- **THEN** 個人的 Insights 只顯示「No expenses yet」和「Add an expense to see spending insights.」

### Requirement: INSIGHTS-41.1 iOS 上只從螢幕邊緣滑動返回

WHERE iOS，WHILE Insights 開著，the mobile app SHALL 只讓使用者從螢幕的左邊緣往右滑返回，在畫面其他地方往右滑不會返回。

#### Scenario: 從中間往右滑

- **WHEN** iOS 上在 Insights 從畫面中間往右滑
- **THEN** Insights 仍開著

#### Scenario: 從左邊緣往右滑

- **WHEN** 從螢幕的左邊緣往右滑
- **THEN** 回到下面的畫面

### Requirement: INSIGHTS-42.1 (manual) 滑動換期間的手感

The mobile app SHALL 在手指開始移動時就決定是換期間還是捲動內容，之後不變；換期間時畫面跟著手指走，放開後新的期間滑進來。

#### Scenario: 斜著滑

- **WHEN** 在總額卡上斜著往右滑，水平比垂直多
- **THEN** 畫面跟著手指走，放開後換到上一期，內容沒有捲動

#### Scenario: 上下滑

- **WHEN** 內容比畫面長時，在內容上往上滑
- **THEN** 內容捲動，選中的期間不變，畫面沒有左右移動

### Requirement: INSIGHTS-43.1 (manual) iOS 的 Period 面板用 ✕ 和 ✓

WHERE iOS，the mobile app SHALL 讓 Period 面板的 Cancel 和 Close 是 ✕ 的圖示、Done 是 prominent 的 ✓ 的圖示，和標題列的按鈕一樣（SHELL-47.2）。

#### Scenario: 月份選擇器

- **WHEN** iOS 上在月份模式按期間名稱
- **THEN** 面板左邊是 ✕，右邊是 prominent 的 ✓，顏色是系統的

### Requirement: INSIGHTS-44.1 日期範圍的期間

WHEN 給一段起訖日期，the domain package SHALL 把日期在起日到訖日之間（含這兩天）的計入支出（INSIGHTS-1.1 到 INSIGHTS-3.1）當成一個期間，照 INSIGHTS-5.1 到 INSIGHTS-8.1、INSIGHTS-10.1 和 INSIGHTS-11.1 算出每個幣別的總額、類別和圖；這個期間沒有比較（INSIGHTS-9.1），範圍裡沒有計入的支出時沒有任何幣別。IF 範圍裡某個幣別的總額超過 9,007,199,254,740,991，THEN the domain package SHALL 拒絕計算這個範圍。

#### Scenario: 含起訖兩天

- **WHEN** 支出的日期是 `2025-01-09`、`2025-01-10`、`2025-01-20` 和 `2025-01-21`，金額是 100、200、400 和 800 USD，範圍是 `2025-01-10` 到 `2025-01-20`
- **THEN** USD 的總額是 600

#### Scenario: 跨月和跨年

- **WHEN** `2024-12-31` 有 200 USD，`2025-01-02` 有 300 USD，`2025-02-01` 有 500 USD，範圍是 `2024-12-15` 到 `2025-01-15`
- **THEN** USD 的總額是 500，沒有比較

#### Scenario: 同一天

- **WHEN** `2025-01-10` 有 200 USD 和 2000 JPY，`2025-01-11` 有 400 USD，範圍是 `2025-01-10` 到 `2025-01-10`
- **THEN** 依序是 JPY 2000 和 USD 200

#### Scenario: 類別和圖

- **WHEN** 範圍裡有 Food 的 600 USD 和 Travel 的 200 USD，範圍外還有 Travel 的 5000 USD，偏好是 Auto
- **THEN** USD 的類別依序是 Food 600、75% 和 Travel 200、25%，圖是畫出這兩個類別的環圈圖

#### Scenario: 對不到類別時用範圍裡日期最晚的快照

- **WHEN** 三筆 `categoryId` 都是清單裡沒有的 `gone`：`2025-01-05` 的快照是「Snacks」，`2025-01-20` 的是「Treats」，`2025-02-10` 的是「Sweets」，範圍是 `2025-01-01` 到 `2025-01-31`
- **THEN** 類別的名稱是 Treats

#### Scenario: 範圍裡沒有計入的支出

- **WHEN** 只有 `2025-03-10` 的支出，範圍是 `2025-01-01` 到 `2025-01-31`；或範圍裡只有金額是 0 的支出
- **THEN** 沒有任何幣別，不是拒絕計算

#### Scenario: 個人情境

- **WHEN** 個人情境下，範圍裡有個人空間的 1200 和一筆 10000 的群組支出，個人 participant 分攤 2000
- **THEN** 總額是 3200

#### Scenario: 剛好在上限

- **WHEN** `2024-12-31` 有 9,007,199,254,740,990 USD，`2025-01-01` 有 1 USD，範圍是 `2024-12-31` 到 `2025-01-01`
- **THEN** USD 的總額是 9,007,199,254,740,991

#### Scenario: 範圍的總額超過上限

- **WHEN** `2024-12-31` 有 9,007,199,254,740,990 USD，`2025-01-01` 有 2 USD，兩個年份各自都沒有超過，範圍是 `2024-12-31` 到 `2025-01-01`
- **THEN** 拒絕計算這個範圍

### Requirement: INSIGHTS-45.1 網址指定的期間

WHEN 個人或群組的 Insights 的網址（INSIGHTS-13.1、INSIGHTS-14.1）帶有 `period=<YYYY-MM>`，the mobile app SHALL 用月份模式打開，選中那個月份；帶有 `period=<YYYY>` 時，SHALL 用年份模式打開，選中那一年。指定的月份或年份不是期間時，SHALL 改選同一年最新的同一種期間，同一年沒有時改選最新的同一種期間（同 INSIGHTS-40.1）。帶有 `from=<YYYY-MM-DD>` 和 `to=<YYYY-MM-DD>` 時，SHALL 用自訂模式打開，From 和 To 是這兩個日期，晚於今天的改成今天，這時不看 `period`。IF `from` 和 `to` 沒有同時給，或其中一個不是有效的支出日期（LEDGER-9.1），THEN the mobile app SHALL 當成沒有 `from` 和 `to`，照 `period` 打開；IF `period` 不是有效的月份或年份，THEN the mobile app SHALL 當成沒有 `period`。兩種都沒有時，就是網址沒有指定期間（INSIGHTS-21.2）。

#### Scenario: 月份

- **WHEN** 支出的日期是 `2024-12-31`、`2025-01-20` 和 `2025-03-10`，以 `/insights?period=2025-01` 開啟 app
- **THEN** 標出 Month，選中的期間是「January 2025」，不是最新的「March 2025」

#### Scenario: 年份

- **WHEN** 以 `/insights?period=2024` 開啟 app
- **THEN** 標出 Year，選中的期間是「2024」

#### Scenario: 這個月沒有支出

- **WHEN** 以 `/insights?period=2025-02` 開啟 app；或以 `/insights?period=2026-10` 開啟 app
- **THEN** 選中的期間分別是同一年最新的「March 2025」，和同一年沒有月份期間時最新的「March 2025」

#### Scenario: 這一年沒有支出

- **WHEN** 以 `/insights?period=2023` 開啟 app
- **THEN** 標出 Year，選中的期間是最新的「2025」

#### Scenario: 日期範圍

- **WHEN** 今天是 `2026-10-30`，以 `/insights?from=2025-01-01&to=2025-01-31` 開啟 app
- **THEN** 標出 Custom，From 和 To 是「Jan 1, 2025」和「Jan 31, 2025」，總額是 `2025-01-20` 那一筆的

#### Scenario: 晚於今天

- **WHEN** 今天是 `2026-10-30`，以 `/insights?from=2026-10-01&to=2026-10-31` 開啟 app
- **THEN** From 是「Oct 1, 2026」，To 是「Oct 30, 2026」

#### Scenario: 兩種都有

- **WHEN** 以 `/insights?period=2024-12&from=2025-01-01&to=2025-01-31` 開啟 app
- **THEN** 標出 Custom，From 和 To 是「Jan 1, 2025」和「Jan 31, 2025」

#### Scenario: 無效的期間

- **WHEN** 以 `/insights?period=2025-13`、`/insights?period=abc`、`/insights?from=2025-01-01`，或 `/insights?from=2025-02-30&to=2025-03-10` 開啟 app
- **THEN** 都標出 Month，選中的期間是最新的「March 2025」

#### Scenario: 起訖日期無效時看 period

- **WHEN** 以 `/insights?period=2025-01&from=2025-02-30&to=2025-03-10`，或 `/insights?period=2025-01&from=2025-01-05` 開啟 app
- **THEN** 都標出 Month，選中的期間是「January 2025」

#### Scenario: 群組的 Insights

- **WHEN** Brisbane 有 `2026-09-30` 的 2500 USD 和 `2026-10-29` 的 6000 USD 的支出，以 `/groups/insights?groupId=<Brisbane 的群組 ID>&period=2026-09` 開啟 app
- **THEN** 選中的期間是「September 2026」，總額是「$25.00」

### Requirement: INSIGHTS-46.1 自訂模式

WHEN 使用者在月份或年份模式選「Custom」，the mobile app SHALL 換成自訂模式，From 是選中的期間的第一天，To 是它的最後一天，晚於今天時是今天。WHILE Insights 在自訂模式，the mobile app SHALL 在「Period aggregation」下面顯示一列：名稱是「From」和「To」的兩個日期欄位，中間是「–」，用手機地區的日期格式顯示日期（LEDGER-30.2），都最晚只能選今天；總額卡、每個幣別的類別和圖，都是 From 到 To 的範圍照 INSIGHTS-44.1 算出的，From 晚於 To 時是 To 到 From，總額卡沒有比較；選了日期就立即照新的範圍顯示，在內容上滑動不換期間。支出因為修改、移到垃圾桶或套用收到的事件而改變時，自訂模式不照 INSIGHTS-40.1 改選：仍在自訂模式，From 和 To 不變，照改變之後的支出顯示。有計入的支出、但範圍裡沒有時，SHALL 在 From 和 To 下面只顯示標題「No Expenses in These Dates」和「Choose other dates to see spending insights.」，標題列沒有「Chart visualization」選單；完全沒有計入的支出時照 INSIGHTS-18.1，沒有「Period aggregation」，也沒有 From 和 To；domain 拒絕計算這個範圍（INSIGHTS-44.1）時，SHALL 在 From 和 To 下面只顯示標題「Totals Too Large」和「These totals are too large to show.」，標題列也沒有那個選單；domain 拒絕計算月份和年份的期間（INSIGHTS-12.1）時，自訂模式也照 INSIGHTS-20.1 只顯示那兩行，沒有「Period aggregation」，也沒有 From 和 To，範圍裡的總額沒有超過上限也一樣。WHEN 使用者在自訂模式選「Month」或「Year」，the mobile app SHALL 換成那個模式，選中範圍的最後一天所在的月份或年份，它不是期間時照 INSIGHTS-45.1 改選。

#### Scenario: 從月份換成自訂

- **WHEN** 今天是 `2026-10-30`，支出的日期是 `2025-01-20` 和 `2025-03-10`，選中 March 2025 時選「Custom」
- **THEN** 標出 Custom，From 是「Mar 1, 2025」，To 是「Mar 31, 2025」，總額是 `2025-03-10` 那一筆的，沒有比較

#### Scenario: 這個月和今年

- **WHEN** 今天是 `2026-10-30`，選中 October 2026 時選「Custom」；或年份模式選中 2026 時選「Custom」
- **THEN** From 分別是「Oct 1, 2026」和「Jan 1, 2026」，To 都是「Oct 30, 2026」

#### Scenario: 改日期

- **WHEN** 有 `2025-01-20` 的 800 USD 和 `2025-03-10` 的 1200 USD，把 From 選成 `2025-01-01`、To 選成 `2025-03-31`
- **THEN** 總額卡依序是「TOTAL SPENT」和「$20.00」，沒有比較；類別和圖是這兩筆的

#### Scenario: 不能選今天之後

- **WHEN** 今天是 `2026-10-30`，打開 From 或 To 的日期選擇器
- **THEN** 最晚只能選 `2026-10-30`

#### Scenario: From 晚於 To

- **WHEN** 把 From 選成 `2025-03-31`、To 選成 `2025-01-01`
- **THEN** 總額仍是「$20.00」

#### Scenario: 範圍裡沒有支出

- **WHEN** 把 From 選成 `2025-02-01`、To 選成 `2025-02-28`
- **THEN** From 和 To 下面只有標題「No Expenses in These Dates」和「Choose other dates to see spending insights.」，沒有總額卡，標題列沒有「Chart visualization」；「Period aggregation」和 From、To 都還在

#### Scenario: 完全沒有支出

- **WHEN** 第一次啟動 app 後以 `/insights?from=2026-10-01&to=2026-10-30` 打開個人的 Insights
- **THEN** 只顯示「No expenses yet」和「Add an expense to see spending insights.」，沒有「Period aggregation」、From 和 To

#### Scenario: 範圍裡的支出改到範圍外

- **WHEN** 有 `2024-11-10` 的支出和 `2025-03-10` 的「Coffee run」，From 是 `2025-03-01`、To 是 `2025-03-31` 時，在 Edit Expense 把 Coffee run 的日期改成 `2024-11-15` 後按 Save
- **THEN** 回到 Insights 時仍標出 Custom，From 和 To 仍是「Mar 1, 2025」和「Mar 31, 2025」，下面只有「No Expenses in These Dates」和「Choose other dates to see spending insights.」，沒有換成 November 2024

#### Scenario: 月份和年份的總額超過上限

- **WHEN** 2026 年的 USD 支出加起來超過 9,007,199,254,740,991，`2025-01-20` 還有一筆 8.75 USD 的支出，以 `/insights?from=2025-01-01&to=2025-01-31` 打開個人的 Insights
- **THEN** 只顯示「Totals Too Large」和「These totals are too large to show.」，沒有「Period aggregation」、From 和 To

#### Scenario: 群組的 Insights

- **WHEN** 名字是「Taylor」，Brisbane 有 `2025-01-20` Casey 付的 60.00 USD 的 Dinner，分給 Taylor、Casey 和 Blake，在 Brisbane 的 Insights 選「Custom」，把 From 選成 `2025-01-01`、To 選成 `2025-01-31`
- **THEN** 總額卡依序是「TOTAL SPENT」、「$60.00」和「Your share: $20.00」

#### Scenario: 換回月份和年份

- **WHEN** From 是 `2025-01-01`、To 是 `2025-03-31` 時選「Month」；或選「Year」
- **THEN** 選中的期間分別是「March 2025」和「2025」

#### Scenario: 換回月份時那個月沒有支出

- **WHEN** From 是 `2025-01-01`、To 是 `2025-02-28` 時選「Month」
- **THEN** 選中的期間是同一年最新的「March 2025」

#### Scenario: 範圍的總額超過上限

- **WHEN** 2025 年和 2026 年的 USD 支出各自沒有超過 9,007,199,254,740,991，加起來超過，From 和 To 包含這兩年
- **THEN** From 和 To 下面只有「Totals Too Large」和「These totals are too large to show.」；把範圍縮到 2026 年之後顯示 2026 年的總額

### Requirement: INSIGHTS-47.1 按類別那一列打開類別的支出

WHEN 使用者在個人、群組或封存群組的 Insights 按一個類別那一列，the mobile app SHALL 在 Insights 所在的分頁、Insights 的上面推入這個類別的支出，標題是那一列的類別名稱，分頁列仍選中同一個分頁；連按兩次也只推入一個。返回或按 Android 的返回鍵就回到 Insights，它的模式、選中的期間、From 和 To 都和按之前一樣；這之間支出改變了時，Insights 照改變之後的支出顯示：月份或年份模式選中的期間不再是期間時照 INSIGHTS-40.1 改選，自訂模式的 From 和 To 不變（INSIGHTS-46.1）。

#### Scenario: 個人的 Insights

- **WHEN** 2025 年 1 月有 Food & Dining 的 600 USD 和 Transportation 的 200 USD，在個人的 Insights 按 Food & Dining 那一列
- **THEN** 分頁列仍選中 Expenses，Expenses 分頁的堆疊由下而上是「Expenses」根畫面、「Insights」和「Food & Dining」

#### Scenario: 群組的 Insights

- **WHEN** Brisbane 有 Food & Dining 的 Dinner，在 Brisbane 的 Insights 按 Food & Dining 那一列
- **THEN** 分頁列仍選中 Groups，Groups 分頁的堆疊最上面兩個是「Insights」和它上面的「Food & Dining」

#### Scenario: 封存群組的 Insights

- **WHEN** 封存 Brisbane 之後，在 Settings 分頁的 Brisbane 的 Insights 按 Food & Dining 那一列
- **THEN** 分頁列仍選中 Settings，Settings 分頁的堆疊最上面兩個是「Insights」和它上面的「Food & Dining」

#### Scenario: 連按兩次

- **WHEN** 連按兩次 Food & Dining 那一列
- **THEN** 只推入一個「Food & Dining」；返回一次就回到 Insights

#### Scenario: 返回

- **WHEN** 有 2024 年和 2025 年的支出，年份模式選中 2024 時按 Food & Dining 那一列，再返回，或在 Android 上按返回鍵
- **THEN** 回到 Insights，仍標出 Year，選中的期間仍是「2024」

#### Scenario: 從自訂模式打開再返回

- **WHEN** From 是 `2025-01-01`、To 是 `2025-01-31` 時按 Food & Dining 那一列，再返回
- **THEN** 仍標出 Custom，From 和 To 仍是這兩個日期

#### Scenario: 選中的月份在這之間沒有支出了

- **WHEN** 有 `2026-09-15` Transportation 的「Bus」和 `2026-10-29` Food & Dining 的「Coffee run」，選中 October 2026 時按 Food & Dining 那一列，從 Coffee run 的明細把它移到垃圾桶，再返回
- **THEN** 返回之前，類別的支出最上面仍是「October 2026」、「$0.00」和「0 expenses」（INSIGHTS-52.1）；回到 Insights 時選中的期間是「September 2026」，只有 Transportation 那一列

### Requirement: INSIGHTS-48.1 類別的支出最上面的期間、金額和筆數

The mobile app SHALL 在類別的支出最上面由上而下顯示三行：它的期間、金額和筆數。期間在月份和年份模式是期間名稱，在自訂模式是「<範圍的第一天> – <範圍的最後一天>」，兩個日期用手機地區的日期格式（LEDGER-30.2），From 晚於 To 時第一天是 To；金額是下面每張卡片的卡片金額的總和（INSIGHTS-49.1），也就是 Insights 上那一列的金額，用手機地區的貨幣格式；筆數是下面的支出的筆數「<筆數> expenses」，只有一筆時是「1 expense」，只寫數字，不加千分位；還沒讀完存著的支出時，金額和筆數都不顯示。螢幕閱讀器把這三行讀成一項「Spent in <期間> <金額>. <筆數>.」，和支出清單上方的總額（LEDGER-35.6）同一個寫法；還沒讀完時這一項只讀出期間。

#### Scenario: 月份

- **WHEN** 2025 年 1 月有 Food & Dining 的 600 USD 和 250 USD 兩筆支出，和 Transportation 的 200 USD，選中 January 2025 時按 Food & Dining 那一列
- **THEN** 最上面依序是「January 2025」、「$8.50」和「2 expenses」；螢幕閱讀器把它們讀成一項「Spent in January 2025 $8.50. 2 expenses.」

#### Scenario: 年份

- **WHEN** 2025 年 1 月和 3 月各有一筆 Food & Dining 的 600 USD，年份模式選中 2025 時按 Food & Dining 那一列
- **THEN** 最上面依序是「2025」、「$12.00」和「2 expenses」

#### Scenario: 自訂範圍

- **WHEN** From 是 `2025-01-01`、To 是 `2025-01-31`，範圍裡只有一筆 Food & Dining 的 600 USD，按 Food & Dining 那一列
- **THEN** 最上面依序是「Jan 1, 2025 – Jan 31, 2025」、「$6.00」和「1 expense」；螢幕閱讀器讀出「Spent in Jan 1, 2025 – Jan 31, 2025 $6.00. 1 expense.」

#### Scenario: From 晚於 To

- **WHEN** From 是 `2025-03-31`、To 是 `2025-01-01` 時按 Food & Dining 那一列
- **THEN** 期間是「Jan 1, 2025 – Mar 31, 2025」

#### Scenario: 同一天

- **WHEN** From 和 To 都是 `2025-01-10` 時按 Food & Dining 那一列
- **THEN** 期間是「Jan 10, 2025 – Jan 10, 2025」

#### Scenario: 手機的地區不是美國

- **WHEN** 手機第一個偏好的語言和地區是法文（澳洲），From 是 `2025-01-01`、To 是 `2025-01-31`，範圍裡有 Food & Dining 的 600 AUD，按 Food & Dining 那一列
- **THEN** 最上面依序是「1 Jan 2025 – 31 Jan 2025」、「$6.00」和「1 expense」

#### Scenario: 讀完之前

- **WHEN** 按 Food & Dining 那一列，類別的支出還沒讀完存著的支出
- **THEN** 沒有金額和筆數，也沒有「0 expenses」，螢幕閱讀器也讀不到金額和筆數；讀完之後顯示「$8.50」和「2 expenses」

### Requirement: INSIGHTS-49.1 類別的支出列出 Insights 算進那一列的支出

The mobile app SHALL 在類別的支出的那三行下面，依 LEDGER-28.1 的順序由上而下，列出 Insights 在它的期間、它的幣別算進那一列的每一筆支出的卡片，也就是計入的支出（INSIGHTS-16.1）裡日期在期間裡、幣別相同、合併成這個類別的那些（INSIGHTS-6.2、INSIGHTS-17.1），由 domain 為那一列列出（INSIGHTS-55.1），每一段同一天的卡片上方照 LEDGER-102.1 顯示日期；沒有計入的支出不列出，例如你沒有分攤的群組支出。類別的支出沒有自己的排序和篩選：支出清單或群組的畫面選了別的排序（LEDGER-121.1）時，它的卡片仍照 LEDGER-28.1 的順序；那兩個畫面有篩選（LEDGER-129.1）時，它仍列出全部這些支出，和 Insights 一樣不跟著篩選（LEDGER-35.6）。從個人的 Insights 打開時，卡片和支出清單上的一樣（LEDGER-33.3、LEDGER-65.4），卡片金額是 Insights 計入的金額：個人支出是全額，群組支出是你的份額；從群組的 Insights 打開時，卡片和群組的畫面上的一樣（GROUPS-61.6），卡片金額是支出的全額。這些支出比螢幕上和它上下附近放得下的多時，SHALL 和 LEDGER-118.2 一樣只畫出螢幕上和附近的卡片，金額和筆數仍照全部的支出算。

#### Scenario: 個人的 Insights 是你的份額

- **WHEN** 名字是「Taylor」，有 `2026-10-29` 的 875 USD 的個人支出「Coffee run」，和 `2026-10-30` Brisbane 的 6000 USD 的「Dinner」，Casey 付款，依序分給 Taylor、Casey 和 Blake，都是 Food & Dining；在個人的 Insights 選中 October 2026 時按 Food & Dining 那一列
- **THEN** 最上面是「October 2026」、「$28.75」和「2 expenses」；下面依序是「Oct 30, 2026」、Dinner 的卡片、「Oct 29, 2026」和 Coffee run 的卡片，日期是標題；Dinner 的卡片依序顯示「Dinner」、「$20.00」、「Food & Dining」、「Brisbane」，Coffee run 的依序顯示「Coffee run」、「$8.75」、「Food & Dining」

#### Scenario: 群組的 Insights 是整筆金額

- **WHEN** 在 Brisbane 的 Insights 按 Food & Dining 那一列
- **THEN** 最上面是「October 2026」、「$60.00」和「1 expense」；Dinner 的卡片依序顯示「Dinner」、「$60.00」、「Food & Dining」、「Paid by Casey」

#### Scenario: 和你無關的群組支出

- **WHEN** Brisbane 還有 Food & Dining 的 900 USD 的「Taxi」，Casey 付款，只有 Blake 分攤
- **THEN** 個人的 Insights 打開的 Food & Dining 仍是「$28.75」和「2 expenses」，沒有 Taxi 的卡片；Brisbane 的 Insights 打開的是「$69.00」和「2 expenses」，有 Taxi 的卡片

#### Scenario: 你只付款

- **WHEN** Brisbane 還有 Food & Dining 的 1200 USD 的「Snacks」，Taylor 付款，只有 Casey 和 Blake 分攤
- **THEN** 個人的 Insights 打開的 Food & Dining 沒有 Snacks 的卡片，雖然支出清單上有它

#### Scenario: 其他類別和其他期間

- **WHEN** 有 `2025-01-10` Food & Dining 的「Lunch」、`2025-01-11` Transportation 的「Bus」和 `2025-03-10` Food & Dining 的「Brunch」，選中 January 2025 時按 Food & Dining 那一列
- **THEN** 只有 Lunch 的卡片

#### Scenario: 其他幣別

- **WHEN** 2025 年 1 月有 Food & Dining 的 600 USD 的「Lunch」和 2000 JPY 的「Ramen」，按「USD categories」下的 Food & Dining；或按「JPY categories」下的
- **THEN** 分別是「$6.00」、「1 expense」和 Lunch 的卡片，以及「¥2,000」、「1 expense」和 Ramen 的卡片

#### Scenario: 自訂範圍含起訖兩天

- **WHEN** Food & Dining 的支出的日期是 `2025-01-09`、`2025-01-10`、`2025-01-20` 和 `2025-01-21`，From 是 `2025-01-10`、To 是 `2025-01-20` 時按 Food & Dining 那一列
- **THEN** 只有 `2025-01-20` 和 `2025-01-10` 那兩筆的卡片，由上而下

#### Scenario: 同一天的順序

- **WHEN** 依序新增日期都是 `2025-01-10`、Food & Dining 的「E」、「F」和「D」，按 Food & Dining 那一列
- **THEN** 「Jan 10, 2025」只顯示一次，下面的卡片由上而下是 D、F、E

#### Scenario: 清單換了排序

- **WHEN** 有 Coffee run 和 Dinner，Brisbane 還有 `2026-10-30`、在 Dinner 之後新增的 Food & Dining 的 3000 USD 的「Lunch」，Casey 付款，Taylor 和 Casey 分攤；把支出清單和 Brisbane 的畫面的排序都換成 Oldest First，再從個人的 Insights 和 Brisbane 的 Insights 打開 Food & Dining
- **THEN** 支出清單由上而下是 Coffee run、Dinner、Lunch，Brisbane 的畫面是 Dinner、Lunch；個人的 Insights 打開的 Food & Dining 由上而下仍是 Lunch、Dinner、Coffee run，Brisbane 的 Insights 打開的仍是 Lunch、Dinner

#### Scenario: 清單有篩選

- **WHEN** 有 Coffee run 和 Dinner，支出清單的篩選是 Ledger 的 Personal，Brisbane 的畫面的篩選是 Amount 的 Min「100」，再從個人的 Insights 和 Brisbane 的 Insights 打開 Food & Dining
- **THEN** 支出清單只有 Coffee run，Brisbane 的畫面沒有卡片；個人的 Insights 打開的 Food & Dining 仍是「$28.75」、Dinner 和 Coffee run，Brisbane 的 Insights 打開的仍是「$60.00」和 Dinner

#### Scenario: 分類改了名

- **WHEN** Coffee run 和 Dinner 都在 October 2026，在 Manage Categories 把個人空間的 Food & Dining 改名為「Meals」，個人的 Insights 有 Meals 和 Food & Dining 兩列
- **THEN** 按 Meals 那一列，標題是「Meals」，只有 Coffee run 的卡片；按 Food & Dining 那一列，只有 Dinner 的卡片

#### Scenario: 名稱只差大小寫的分類

- **WHEN** 依序建立 Tokyo 和 Brisbane，Tokyo 的分類是「flights」，Brisbane 的是「Flights」；先新增 Brisbane 的 300 USD 的「To Brisbane」，再新增 Tokyo 的 200 USD 的「To Tokyo」，都是 Taylor 付款、自己分攤；個人的 Insights 只有一列「flights」（INSIGHTS-17.1），按那一列
- **THEN** 標題是「flights」，最上面是「$5.00」和「2 expenses」，卡片由上而下是 To Tokyo 和 To Brisbane；To Brisbane 的卡片上的分類仍是它自己的「Flights」

#### Scenario: 封存的分類

- **WHEN** 有 Shopping 的 875 USD 的「Shoes」時封存 Shopping，按 Shopping 那一列
- **THEN** 標題是「Shopping」，沒有「(Archived)」；Shoes 的卡片上的分類是「Shopping (Archived)」

#### Scenario: 封存的群組

- **WHEN** 封存 Brisbane 之後，在 Settings 分頁的 Brisbane 的 Insights 按 Food & Dining 那一列
- **THEN** Dinner 的卡片依序顯示「Dinner」、「$60.00」、「Food & Dining」、「Paid by Casey」

#### Scenario: 300 筆

- **WHEN** 有依序新增、日期都是 `2026-11-18`、每筆 100 USD、都是 Food & Dining 的 300 筆個人支出「Expense 1」到「Expense 300」，選中 November 2026 時按 Food & Dining 那一列
- **THEN** 畫出的卡片不到 300 張，從最上面的 Expense 300 起依序往下，中間沒有跳過；最上面是「$300.00」和「300 expenses」

### Requirement: INSIGHTS-50.1 點類別的支出上的卡片推入明細

WHEN 使用者點類別的支出上的卡片，the mobile app SHALL 在同一個分頁推入這筆支出的明細（LEDGER-37.3、LEDGER-66.3），和從支出清單或群組的畫面打開的一樣：標題是「Expense」，網址在 Expenses 分頁是 `/expenses/<支出的 ID>`，在 Groups 分頁是 `/groups/expenses/<支出的 ID>`，在 Settings 分頁是 `/settings/archived-groups/expenses/<支出的 ID>`，分頁列仍選中同一個分頁；連點兩次也只推入一個明細，返回或按 Android 的返回鍵就回到類別的支出。

#### Scenario: 個人的 Insights

- **WHEN** 在個人的 Insights 打開的 Food & Dining 點 Dinner 的卡片
- **THEN** 分頁列仍選中 Expenses，Expenses 分頁的堆疊最上面三個是「Insights」、「Food & Dining」和「Expense」，明細是 Dinner 的，網址是 `/expenses/` 加上 Dinner 的 ID，標題列有「Edit」和「Expense actions」

#### Scenario: 群組的 Insights

- **WHEN** 在 Brisbane 的 Insights 打開的 Food & Dining 點 Dinner 的卡片
- **THEN** 分頁列仍選中 Groups，網址是 `/groups/expenses/` 加上 Dinner 的 ID

#### Scenario: 封存群組的 Insights

- **WHEN** 封存 Brisbane 之後，在 Settings 分頁的 Brisbane 的 Insights 打開的 Food & Dining 點 Dinner 的卡片
- **THEN** 分頁列仍選中 Settings，網址是 `/settings/archived-groups/expenses/` 加上 Dinner 的 ID；明細照 LEDGER-67.2 是唯讀的

#### Scenario: 連點兩次

- **WHEN** 連點兩次 Dinner 的卡片
- **THEN** 只推入一個明細；返回一次就回到 Food & Dining

#### Scenario: 返回

- **WHEN** 在明細返回，或在 Android 上按返回鍵
- **THEN** 回到 Food & Dining，最上面的三行和卡片都和點之前一樣

### Requirement: INSIGHTS-51.1 類別的支出只能看

The mobile app SHALL 讓類別的支出只能看：卡片沒有名稱是「Delete expense」的輔助功能動作，畫面上沒有 + 按鈕，也沒有排序鈕（LEDGER-122.2），標題列除了返回沒有其他動作，沒有篩選動作（SHELL-72.2），也沒有搜尋欄位（SHELL-73.1）；個人支出、未封存群組的支出和封存群組的支出的卡片都一樣。

#### Scenario: 個人的 Insights

- **WHEN** 在個人的 Insights 打開的 Food & Dining 有 Coffee run 和 Brisbane 的 Dinner 的卡片
- **THEN** 兩張卡片都沒有「Delete expense」的輔助功能動作，雖然它們在支出清單上有；畫面上沒有「Add expense」，也沒有支出清單上有的排序鈕；標題列右邊沒有動作，沒有支出清單的標題列有的篩選動作和搜尋欄位

#### Scenario: 群組的 Insights

- **WHEN** 在 Brisbane 的 Insights 打開 Food & Dining
- **THEN** Dinner 的卡片沒有「Delete expense」的輔助功能動作，畫面上沒有「Add expense」和排序鈕，標題列沒有搜尋欄位

### Requirement: INSIGHTS-52.1 類別的支出跟著存著的支出

The mobile app SHALL 讓類別的支出的金額、筆數和卡片都和存著的支出一致，期間、幣別、類別和畫面的標題仍是打開時的：新增、修改、移到垃圾桶或還原支出之後回到類別的支出時都一樣，不管是在它打開的明細、另一個分頁還是 Trash 做的；類別的支出開著時套用收到的事件（SYNC-29.2），也不必重新啟動就照新的資料顯示。這時才算進那一列的支出照 LEDGER-28.1 出現在它的位置，不再算進那一列的支出離開這個畫面，支出的金額或標題改了的照新的顯示；日期不在期間裡的支出不出現，期間不像 LEDGER-117.2 那樣換成它的月份。一筆都沒有時，金額是這個幣別的 0，筆數是「0 expenses」，下面沒有卡片，也沒有其他提示。在明細的 Expense actions 選「Delete」時，SHALL 照 LEDGER-72.2 存好後返回類別的支出，並照 LEDGER-73.2 顯示 Undo 提示；按「Undo」之後，這筆支出的卡片回到類別的支出。

#### Scenario: 改了金額

- **WHEN** 個人的 Insights 打開的 Food & Dining 有 875 USD 的 Coffee run 和 Dinner 的份額 2000 USD，點 Coffee run 的卡片，在 Edit Expense 把金額改成「10.00」後按 Save，再返回
- **THEN** 最上面是「$30.00」和「2 expenses」，Coffee run 的卡片金額是「$10.00」

#### Scenario: 換了分類

- **WHEN** 點 Coffee run 的卡片，在 Edit Expense 把分類換成 Transportation 後按 Save，再返回
- **THEN** 標題仍是「Food & Dining」，最上面是「$20.00」和「1 expense」，只有 Dinner 的卡片

#### Scenario: 日期改到期間外

- **WHEN** 期間是 October 2026 時，把 Coffee run 的日期改成 `2026-09-15` 後按 Save，再返回
- **THEN** 期間仍是「October 2026」，只有 Dinner 的卡片

#### Scenario: 從明細移到垃圾桶

- **WHEN** 點 Coffee run 的卡片，在明細的 Expense actions 選「Delete」
- **THEN** 存好後回到 Food & Dining，不是 Insights 或支出清單；最上面是「$20.00」和「1 expense」，只有 Dinner 的卡片，畫面底部顯示「Moved to Trash」

#### Scenario: 按 Undo

- **WHEN** 接著按「Undo」
- **THEN** Coffee run 的卡片回到 Food & Dining，最上面是「$28.75」和「2 expenses」

#### Scenario: 在另一個分頁新增

- **WHEN** 個人的 Insights 打開的 Food & Dining 開在 Expenses 分頁，有 Coffee run 和 Dinner；到 Groups 分頁，在 Brisbane 的畫面新增 Food & Dining 的 3000 USD 的「Lunch」，Casey 付款，Taylor 和 Casey 分攤，再回到 Expenses 分頁
- **THEN** 最上面是「October 2026」、「$43.75」和「3 expenses」，卡片由上而下是 Lunch、Dinner、Coffee run

#### Scenario: 開著時套用另一支手機的事件

- **WHEN** Brisbane 是共同帳本，有 10001 USD 的 Dinner，Casey 付款，依序分給 Blake、Taylor 和 Casey；個人的 Insights 打開的 Food & Dining 開著時，依序套用另一支手機新增的兩筆 Food & Dining 支出的第一個事件，都是 3000 USD、Casey 付款、Taylor 和 Casey 分攤：日期是 `2026-09-15` 的「Brunch」和日期是 `2026-10-30` 的「Lunch」
- **THEN** 不必重新啟動，最上面是「October 2026」、「$48.34」和「2 expenses」，卡片由上而下是 Lunch、Dinner，沒有 Brunch

#### Scenario: 一筆都沒有了

- **WHEN** October 2026 只有 Food & Dining 的 Coffee run 和 Transportation 的「Bus」，在個人的 Insights 打開 Food & Dining，從 Coffee run 的明細把它移到垃圾桶
- **THEN** 回到 Food & Dining，最上面依序是「October 2026」、「$0.00」和「0 expenses」，下面沒有卡片，也沒有「No expenses yet」這類提示

#### Scenario: 回到 Insights

- **WHEN** 一筆都沒有之後再返回 Insights
- **THEN** Insights 只有 Transportation 那一列，沒有 Food & Dining

### Requirement: INSIGHTS-53.1 (e2e) 從類別那一列開始滑動時換期間，不打開類別的支出

WHEN 使用者從類別那一列開始往右或往左滑，the mobile app SHALL 照 INSIGHTS-33.2 選中上一期或下一期，不打開類別的支出；點一下那一列才打開。

#### Scenario: 在類別那一列上往右滑

- **WHEN** iOS 上有這個月和上個月的支出，選中這個月時，從 Food & Dining 那一列開始往右滑
- **THEN** 選中上個月，仍在 Insights，沒有打開「Food & Dining」

#### Scenario: 點一下

- **WHEN** 接著點 Food & Dining 那一列
- **THEN** 打開上個月的「Food & Dining」

### Requirement: INSIGHTS-54.1 (e2e) 往左滑類別的支出上的卡片時不露出 Delete

WHEN 使用者把類別的支出上的卡片往左滑，the mobile app SHALL 不露出「Delete」或任何按鈕，也不打開明細。

#### Scenario: 個人支出的卡片

- **WHEN** iOS 上在個人的 Insights 打開上個月的 Food & Dining，把裡面「Old lunch」的卡片往左滑
- **THEN** 仍是 Food & Dining，卡片旁邊沒有露出「Delete」，也沒有打開 Old lunch 的明細；點一下卡片才打開明細

### Requirement: INSIGHTS-55.1 每一列算進了哪些支出

WHEN 給一個月份、一個年份（INSIGHTS-4.1）或一段起訖日期（INSIGHTS-44.1），the domain package SHALL 為這個期間的每個幣別，依幣別代碼排序（INSIGHTS-5.1），再依它的類別的順序（INSIGHTS-8.1），列出每個類別算進的支出：就是給的支出裡算進這個類別的那些物件本身，照給的順序。每一筆計入的支出（INSIGHTS-1.1 到 INSIGHTS-3.1）只在它的幣別裡它合併進的那一個類別（INSIGHTS-6.2），沒有計入的支出不在任何類別，這個類別的金額就是這些支出計入的金額的總和。每個類別還有一個鍵，只看 INSIGHTS-6.2 合併的依據：對到的類別合併進的那個名稱，對不到時的 `categoryId` 或存的類別名稱；依據相同時鍵就相同，不管金額和其他支出，依據不同時鍵就不同，所以支出改了、類別的順序變了，也找得到同一個類別。期間裡沒有計入的支出時沒有任何幣別。IF 這個期間有幣別的總額超過 9,007,199,254,740,991，THEN the domain package SHALL 拒絕計算這個期間。

#### Scenario: 幣別和類別的順序

- **WHEN** 2025 年 1 月依序有 Food 的 600 USD、Travel 的 300 USD、Food 的 2000 JPY 和 Food 的 200 USD
- **THEN** 依序是 JPY 的 Food：2000 JPY 那一筆；USD 的 Food：600 和 200 USD 那兩筆，照給的順序；USD 的 Travel：300 USD 那一筆

#### Scenario: 月份、年份和範圍

- **WHEN** 2025 年 1 月 10 日、1 月 31 日和 3 月 10 日各有一筆 Food 的支出
- **THEN** 2025-01 是前兩筆，2025 是三筆，`2025-01-31` 到 `2025-03-10` 是後兩筆

#### Scenario: 合併成一個類別

- **WHEN** 類別清單依序是 Food、另一個空間的 food 和現在名稱是 Meals 的 `meals`；支出依序是 `categoryId` 是 Food 的、是 food 的、沒有 `categoryId` 而存的名稱是「FOOD」的、`categoryId` 是 `meals` 而存的名稱是「Food」的，和 `categoryId` 是清單裡沒有的 `gone`、快照是「Food」的
- **THEN** 一個類別是前三筆，Meals 是第四筆，另一個名稱也是 Food 的類別是第五筆，三個類別的鍵都不同

#### Scenario: 個人情境

- **WHEN** 個人情境下，有個人空間的 Food 支出、你分攤的群組 Food 支出，和你只付款、沒有分攤的群組 Food 支出
- **THEN** Food 是前兩筆；你只付款的那一筆不在任何類別

#### Scenario: 鍵跟著類別

- **WHEN** 有類別 Tea 的 500 USD，和 `categoryId` 是 `gone`、快照是「Tea」的 300 USD；之後 `gone` 那一筆改成 900 USD
- **THEN** 兩次都是兩個名稱是 Tea 的類別，順序對調，但 Tea 那一筆和 `gone` 那一筆各自的鍵都和之前一樣

#### Scenario: 超過上限

- **WHEN** 2025 年 1 月有兩筆 USD，合起來超過 9,007,199,254,740,991
- **THEN** 2025-01 和這兩筆所在的範圍都拒絕計算

### Requirement: INSIGHTS-56.1 (manual) Android 上從類別那一列開始滑動時換期間

WHERE Android 手機，WHEN 使用者從類別那一列開始往右或往左滑，the mobile app SHALL 和 INSIGHTS-53.1 一樣照 INSIGHTS-33.2 選中上一期或下一期，不打開類別的支出；點一下那一列才打開。

#### Scenario: 在類別那一列上往右滑

- **WHEN** Android 手機上有這個月和上個月的支出，選中這個月時，從 Food & Dining 那一列開始往右滑，再點一下那一列
- **THEN** 滑動之後選中上個月，仍在 Insights，沒有打開「Food & Dining」；點一下之後打開上個月的「Food & Dining」
