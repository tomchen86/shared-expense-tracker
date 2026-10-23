# Ledger

## Purpose

記帳的金額規則：每個幣別的小數位數、金額文字怎麼解析和轉回文字、金額上限、平均分攤，以及支出日期。這些規則放在 `packages/domain`，每個客戶端都照同一套套用（ADR-0002、ADR-0004）。

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

### Requirement: LEDGER-5.1 把金額轉回小數文字

WHEN 把最小單位的金額轉回文字（例如填回輸入框），the domain package SHALL 依幣別的小數位數輸出，不加貨幣符號和千分位，而且輸出的文字依 LEDGER-2.1 解析後是同一個金額。

#### Scenario: 依幣別的小數位數輸出

- **WHEN** 轉換 1500 USD、5 USD、1200 JPY、1234 KWD、999999999999 USD
- **THEN** 結果分別是 `15.00`、`0.05`、`1200`、`1.234`、`9999999999.99`

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
