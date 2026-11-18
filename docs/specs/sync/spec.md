# Sync

## Purpose

共同帳本的同步：每支手機把自己和別人的修改合併成同一個結果所用的規則，以及手機 app 怎麼把共同帳本的變更寫成事件、怎麼套用收到的事件。規則放在 `packages/domain`，是純函式：不讀時鐘，不用亂數，比較字串時不依語言設定，所以每支手機算出的結果都一樣（ADR-0016）。domain 只判定和合併交給它的事件；手機 app 把變更寫成待上傳的事件（SYNC-20.1 到 SYNC-27.1、SYNC-33.1 到 SYNC-35.1、SYNC-38.1），把收到的事件判定、合併之後寫進支出、分類、群組和成員的資料（SYNC-28.1 到 SYNC-32.1、SYNC-36.1、SYNC-37.1、SYNC-39.1 到 SYNC-44.1）。事件怎麼加密、上傳和下載，以及遇到不認得格式版本的事件之後怎麼辦，都不在這裡。

紀錄是共同帳本裡同步的一筆資料，有支出、分類、群組和成員四種，用種類和 ID 辨認。每筆紀錄分成幾個單位（SYNC-5.1、SYNC-6.1），合併時一個單位整個一起換。事件是一次修改：改一筆紀錄的一個或幾個單位，或永久刪除這筆紀錄；一筆紀錄的第一個事件帶著它的每一個單位。事件有哪些欄位、各是什麼型別，定義在 `packages/domain` 的程式裡。每個事件帶著格式版本，這裡寫的是格式版本 1 的規則。把支出移到垃圾桶或還原（ledger），改的是「在不在垃圾桶裡」這個單位，不是永久刪除。

時間戳記由毫秒、計數器和裝置 ID 組成（SYNC-1.1）；每個事件有一個，它改的單位都用這一個。校正後的時間是手機的時鐘加上它和伺服器的時間差（ADR-0015）。手機看過的最新時間戳記，是它合併過的事件裡最晚的時間戳記，自己的修改也算（SYNC-15.1）。單位根據的版本，是寫下這次修改時，這個單位在那支手機上原本的時間戳記；原本沒有這個單位就不帶。收到時間是 API 收到事件的時間，同一個事件在每支手機上都一樣；手機判定自己還沒送出的修改時沒有收到時間。

判定只看一個事件和它的收到時間，結果是可以套用、不套用，或不認得它的格式版本（SYNC-3.1 到 SYNC-10.1），所以每支手機對同一個事件的判定都一樣；不套用的事件不合併，就像不存在。合併是把可以套用的事件併進它指的那筆紀錄（SYNC-11.1 到 SYNC-13.1、SYNC-15.1 到 SYNC-17.1、SYNC-19.1）。合併的結果是這筆紀錄每個單位的值和時間戳記；紀錄被永久刪除之後只剩刪除紀錄，也就是刪除它的事件的時間戳記。手機自己的金額修改，是這支手機自己對一筆支出最後一次改金額那一組時，那個事件的時間戳記和那一組的內容；別人的事件有沒有蓋掉它，只拿這兩個相比（SYNC-14.1）。

下面的情境裡，時間戳記寫成「毫秒/計數器/裝置 ID」，例如 `2000/0/phone-a`。Dinner 是這樣一筆支出：標題「Dinner」，日期 `2025-03-14`，沒有備註，分類是 Food & Dining、`#D81B60`，金額那一組是 10001 USD、Casey 付 10001、分攤依序是 Blake 3334、Taylor 3334、Casey 3333，不在垃圾桶裡；它的第一個事件的時間戳記是 `1000/0/phone-a`。

手機 app 這一邊，共同帳本是在這支手機上已經變成共同帳本的群組（SYNC-20.1），它的紀錄是這個群組、它的成員和前成員、它的分類和它的支出，封存的分類和垃圾桶裡的支出也算；個人支出、個人分類和還不是共同帳本的群組都不是共同帳本的紀錄。群組什麼時候變成共同帳本（邀請）不在這裡。這支手機的裝置 ID 是群組變成共同帳本時交給手機 app 的裝置 ID。手機還沒有從伺服器得知時間差之前，校正後的時間就是手機的時鐘。本機資料替共同帳本的每筆紀錄記著每個單位的值和時間戳記、它的刪除紀錄，以及手機看過的最新時間戳記；支出、分類、群組和成員的資料（ledger、categories、groups）存的是合併的結果。紀錄建立的時間戳記，是它合併過的事件裡最早的時間戳記；群組變成共同帳本時就有的紀錄，是那時給它的時間戳記。待上傳的事件是這支手機寫下、還沒上傳的事件，每個有自己的事件 ID 和所屬的共同帳本，依寫下的先後排列。收到的事件是 API 轉來、已經解密的事件，帶著它的事件 ID、上傳它的裝置 ID、收到時間和內容；套用是把一次交來的收到的事件判定、合併並存下（SYNC-28.1）。事件的大小是它的內容寫成 JSON（JavaScript 的 `JSON.stringify`，沒有多餘的空白）、以 UTF-8 編碼後的 bytes 數，加上加密多出來的 41 bytes（ADR-0015、ADR-0021）。

手機 app 的情境裡，這支手機的裝置 ID 是 `phone-a`，別支手機是 `phone-b`；名字是 Taylor，Brisbane 是 Taylor 建立、依序加入 Casey 和 Blake 的群組，Tokyo 是另一個群組，各有九個預設分類（CATEGORIES-2.1）。T 是 `2026-10-30T04:00:00Z` 的毫秒數：除非另外說明，Brisbane 在校正後的時間 T 變成共同帳本，Tokyo 不是共同帳本，之後的變更都發生在校正後的時間 T+60000，所以這支手機寫的事件，時間戳記依序是 `T+60000/0/phone-a`、`T+60000/1/phone-a`，依此類推。這些情境裡的 Dinner 是在 Brisbane 用 New Expense 新增的那一筆（LEDGER-54.1）：10001 USD、`2026-10-30`、Food & Dining、沒有備註，Casey 付款，分攤依序是 Blake 3334、Taylor 3334、Casey 3333。Lunch 是 `phone-b` 新增的支出：3000 USD、`2026-10-30`、Food & Dining、沒有備註，Casey 付款，分攤依序是 Taylor 1500、Casey 1500，不在垃圾桶裡。別支手機的事件，收到時間都是它的時間戳記的毫秒，除非另外說明。

## Requirements

### Requirement: SYNC-1.1 時間戳記的先後

WHEN 比較兩個時間戳記，the domain package SHALL 先比毫秒，毫秒相同再比計數器，計數器也相同再比裝置 ID，比較大的那一個比較晚；三項都相同才是同一個時間戳記。毫秒和計數器比數值；裝置 ID 從頭逐位元組比，前面都相同時比較長的比較大，不依語言設定排序。

#### Scenario: 毫秒不同

- **WHEN** 比較 `1000/5/b` 和 `1001/0/a`
- **THEN** `1001/0/a` 比較晚

#### Scenario: 毫秒相同

- **WHEN** 比較 `1000/9/b` 和 `1000/10/a`
- **THEN** `1000/10/a` 比較晚

#### Scenario: 毫秒和計數器都相同

- **WHEN** 毫秒和計數器都相同，裝置 ID 是 `Z9` 和 `a1`、`10` 和 `9`、`ab` 和 `abc`
- **THEN** 比較晚的分別是 `a1`、`9`、`abc`

#### Scenario: 三項都相同

- **WHEN** 比較 `1000/5/b` 和另一個 `1000/5/b`
- **THEN** 是同一個時間戳記，沒有先後

### Requirement: SYNC-2.1 新修改的時間戳記

WHEN 手機要為一次新的修改取時間戳記，the domain package SHALL 用這支手機的裝置 ID，給出比手機看過的最新時間戳記晚的時間戳記：手機還沒看過任何時間戳記，或校正後的時間比看過的毫秒晚時，毫秒是校正後的時間，計數器是 0；否則毫秒沿用看過的，計數器加 1。看過的計數器已經是 9,007,199,254,740,991、不能再加時，毫秒改用看過的加 1，計數器是 0。

#### Scenario: 還沒看過任何時間戳記

- **WHEN** `phone-a` 在校正後的時間 5000 修改
- **THEN** 時間戳記是 `5000/0/phone-a`

#### Scenario: 時鐘比看過的晚

- **WHEN** `phone-a` 看過的最新時間戳記是 `4000/7/phone-b`，校正後的時間是 5000
- **THEN** 時間戳記是 `5000/0/phone-a`

#### Scenario: 同一毫秒裡再改一次

- **WHEN** `phone-a` 看過的最新時間戳記是 `5000/0/phone-a`，校正後的時間還是 5000
- **THEN** 時間戳記是 `5000/1/phone-a`

#### Scenario: 時鐘比看過的慢

- **WHEN** `phone-a` 看過的最新時間戳記是 `9000/2/phone-b`，校正後的時間是 5000
- **THEN** 時間戳記是 `9000/3/phone-a`，比看過的晚

#### Scenario: 計數器到了上限

- **WHEN** `phone-a` 看過的最新時間戳記是 `9000/9007199254740991/phone-b`，校正後的時間是 5000
- **THEN** 時間戳記是 `9001/0/phone-a`

### Requirement: SYNC-3.1 不認得的格式版本不判定

IF 事件的格式版本是比 1 大的整數，THEN the domain package SHALL 回報它不認得這個格式版本，不判定這個事件可以套用還是不套用。

#### Scenario: 格式版本 2

- **WHEN** 判定一個格式版本是 2、其他內容和 Dinner 的第一個事件一樣的事件
- **THEN** 回報不認得這個格式版本

#### Scenario: 看不懂的內容

- **WHEN** 事件的格式版本是 3，帶著格式版本 1 沒有的欄位，時間戳記也比收到時間晚一小時
- **THEN** 仍然回報不認得這個格式版本，不是不套用

### Requirement: SYNC-4.1 結構不對的事件不套用

IF 事件的格式版本不是正整數，或格式版本 1 的事件不合這些規定，THEN the domain package SHALL 判定它不套用，原因是結構：事件和它裡面的每一層，都剛好是 `packages/domain` 的事件型別規定的欄位和型別，不多也不少；時間戳記的毫秒和計數器是 0 到 9,007,199,254,740,991 之間的整數，裝置 ID 是一個以上的 ASCII 可見字元（U+0021 到 U+007E），單位根據的版本也一樣；紀錄的種類是支出、分類、群組或成員；紀錄的 ID 不是空字串；改單位的事件至少改一個單位，而且只改這種紀錄有的單位（SYNC-5.1、SYNC-6.1）；永久刪除的事件只能刪支出或分類。

#### Scenario: 不是事件

- **WHEN** 交來判定的是空值、一段文字、一個數字或一個陣列
- **THEN** 不套用，原因是結構

#### Scenario: 格式版本不是正整數

- **WHEN** 事件沒有格式版本，或格式版本是 0、-1、1.5、文字 `1`
- **THEN** 不套用，原因是結構

#### Scenario: 少了或多了欄位

- **WHEN** 事件少了時間戳記、紀錄的種類或紀錄的 ID；既沒有改單位也不是永久刪除，或兩者都有；多帶一個事件型別沒有的欄位；時間戳記多了或少了一項；某個單位沒有值，或多帶一項
- **THEN** 都不套用，原因是結構

#### Scenario: 時間戳記

- **WHEN** 時間戳記的毫秒是 -1、1000.5、9007199254740992 或文字 `1000`；計數器是 -1 或 0.5；裝置 ID 是空字串、`phone a`、`phöne`，或不是字串
- **THEN** 都不套用，原因是結構

#### Scenario: 根據的版本

- **WHEN** 單位根據的版本是數字 1000，或是計數器 -1 的時間戳記
- **THEN** 不套用，原因是結構

#### Scenario: 紀錄的種類和 ID

- **WHEN** 紀錄的種類是 `settlement`，或紀錄的 ID 是空字串、數字 7
- **THEN** 不套用，原因是結構

#### Scenario: 改的單位

- **WHEN** 改單位的事件一個單位都沒改；群組的事件改了「是否被移出群組」；支出的事件改了「是否封存」
- **THEN** 都不套用，原因是結構

#### Scenario: 永久刪除

- **WHEN** 事件永久刪除群組或成員，或永久刪除的記號不是 true
- **THEN** 不套用，原因是結構

#### Scenario: 合法的事件

- **WHEN** 判定 Dinner 的第一個事件、帶著根據的版本改 Dinner 標題的事件、永久刪除支出的事件、永久刪除分類的事件，或時間戳記是 `9007199254740991/9007199254740991/!~` 的事件
- **THEN** 都可以套用

### Requirement: SYNC-5.1 支出的單位

The domain package SHALL 把支出分成六個單位：標題；日期；備註；分類，連同分類的 ID 和存檔時的名稱和顏色；金額那一組，也就是金額、幣別，以及依序的付款和分攤；在不在垃圾桶裡。IF 事件裡這些單位的值不合規定，THEN the domain package SHALL 判定它不套用，原因是結構：標題不是空字串；日期是有效的支出日期（LEDGER-9.1）；備註是非空的字串，沒有備註時是空值；分類的 ID 和名稱不是空字串，顏色是 `#` 加六個十六進位數字；金額是 1 到 999,999,999,999 之間的整數（LEDGER-4.1）；每一筆付款和分攤的 participant 不是空字串，金額是 0 到 999,999,999,999 之間的整數，同一個 participant 在付款裡不出現兩次，在分攤裡也不出現兩次。判定字串是不是空的時候，不先去掉頭尾空白。

#### Scenario: Dinner

- **WHEN** 判定 Dinner 的第一個事件
- **THEN** 可以套用

#### Scenario: 標題

- **WHEN** 標題是空字串，或是數字 7
- **THEN** 不套用，原因是結構；標題是一個空白時可以套用

#### Scenario: 日期

- **WHEN** 日期是 `2025-02-30`、`2025-1-5` 或空字串
- **THEN** 不套用，原因是結構

#### Scenario: 備註

- **WHEN** 備註是空字串，或是數字 7
- **THEN** 不套用，原因是結構；備註是「Window seat」或空值時可以套用

#### Scenario: 分類

- **WHEN** 分類的 ID 或名稱是空字串，少了名稱，多帶一項，或顏色是 `red`、`#D81B6`、`#G81B60`
- **THEN** 不套用，原因是結構；顏色是 `#d81b60` 時可以套用

#### Scenario: 金額

- **WHEN** 金額是 0（付款和分攤也都是 0）、-1、12.5，或 1000000000000（付款和分攤的總和也是 1000000000000）
- **THEN** 不套用，原因是結構；金額是 999999999999 時可以套用

#### Scenario: 付款和分攤

- **WHEN** 某一筆分攤的金額是 -1、0.5 或 1000000000000，某一筆的 participant 是空字串，Blake 在分攤裡出現兩次，或 Casey 在付款裡出現兩次
- **THEN** 不套用，原因是結構；Casey 同時在付款和分攤裡，或某一筆分攤的金額是 0 時，可以套用

#### Scenario: 在不在垃圾桶裡

- **WHEN** 這個單位的值是文字 `yes`
- **THEN** 不套用，原因是結構

### Requirement: SYNC-6.1 分類、群組和成員的單位

The domain package SHALL 把分類分成名稱、顏色和是否封存三個單位，群組只有名稱一個單位，成員分成名稱和是否被移出群組兩個單位。IF 事件裡這些單位的值不合規定，THEN the domain package SHALL 判定它不套用，原因是結構：名稱不是空字串；顏色是 `#` 加六個十六進位數字；是否封存和是否被移出群組是布林值。

#### Scenario: 合法的分類、群組和成員

- **WHEN** 判定分類 Fuel 的第一個事件（名稱「Fuel」、`#1E88E5`、沒有封存）、把群組改名為「Brissie」的事件、成員 Blake 的第一個事件（名稱「Blake」、沒有被移出群組），或只把 Blake 改成被移出群組的事件
- **THEN** 都可以套用

#### Scenario: 名稱

- **WHEN** 分類、群組或成員的名稱是空字串，或是數字 7
- **THEN** 不套用，原因是結構

#### Scenario: 顏色

- **WHEN** 分類的顏色是 `blue` 或 `#1E88E`
- **THEN** 不套用，原因是結構

#### Scenario: 是否封存和是否被移出群組

- **WHEN** 是否封存是數字 1，或是否被移出群組是文字 `true`
- **THEN** 不套用，原因是結構

### Requirement: SYNC-7.1 幣別不支援的事件不套用

IF 事件的金額那一組的幣別不在固定的幣別表裡（LEDGER-1.1），THEN the domain package SHALL 判定它不套用，原因是幣別。

#### Scenario: 不支援的幣別

- **WHEN** 金額那一組的幣別是 `XYZ`、`usd`、`XAU` 或空字串
- **THEN** 不套用，原因是幣別

#### Scenario: 支援的幣別

- **WHEN** 金額那一組是 1200 `JPY`，或 1234 `KWD`
- **THEN** 可以套用

### Requirement: SYNC-8.1 加總不對的事件不套用

IF 事件的金額那一組裡，付款的金額總和或分攤的金額總和不等於金額，THEN the domain package SHALL 判定它不套用，原因是加總。

#### Scenario: 分攤少了

- **WHEN** 金額是 10001，分攤是 3334、3333、3333
- **THEN** 不套用，原因是加總

#### Scenario: 付款多了

- **WHEN** 金額是 10001，Casey 付 10002
- **THEN** 不套用，原因是加總

#### Scenario: 沒有付款或沒有分攤

- **WHEN** 金額是 10001，付款是空的；或分攤是空的
- **THEN** 不套用，原因是加總

#### Scenario: 加總剛好

- **WHEN** 金額是 10001，Casey 付 6000、Taylor 付 4001；或金額是 1，分攤是 Casey 1、Blake 0；或金額是 999999999999，分攤是 999999999998 和 1
- **THEN** 可以套用

### Requirement: SYNC-9.1 時間戳記比收到時間晚太多的事件不套用

IF 事件的時間戳記的毫秒比它的收到時間晚超過 600,000 毫秒（10 分鐘），THEN the domain package SHALL 判定它不套用，原因是時鐘。沒有收到時間時不檢查這一條。

#### Scenario: 時鐘調快一小時

- **WHEN** 收到時間是 1700000000000，事件的時間戳記是 `1700003600000/0/phone-b`
- **THEN** 不套用，原因是時鐘

#### Scenario: 剛好 10 分鐘

- **WHEN** 收到時間是 1700000000000，時間戳記的毫秒是 1700000600000；或是 1700000600001
- **THEN** 前者可以套用；後者不套用，原因是時鐘

#### Scenario: 離線三天才上傳

- **WHEN** 收到時間是 1700000000000，時間戳記的毫秒是 1699740800000
- **THEN** 可以套用

#### Scenario: 還沒送出的修改

- **WHEN** 手機判定自己還沒送出的修改，沒有收到時間，時間戳記的毫秒是 1700003600000
- **THEN** 可以套用

#### Scenario: 永久刪除的事件

- **WHEN** 收到時間是 1700000000000，永久刪除 Dinner 的事件的時間戳記是 `1700003600000/0/phone-b`
- **THEN** 不套用，原因是時鐘

#### Scenario: 調快的時鐘拖不動別人

- **WHEN** `phone-a` 有 Dinner，看過的最新時間戳記是 `1700000000000/0/phone-a`；它收到時鐘調快一小時、改 Dinner 標題的事件，和同樣調快一小時、永久刪除 Dinner 的事件，之後在校正後的時間 1700000001000 修改
- **THEN** 兩個事件都不套用，Dinner 和看過的最新時間戳記都不變；新修改的時間戳記是 `1700000001000/0/phone-a`

### Requirement: SYNC-10.1 違反不只一種規定時的原因

IF 事件違反的規定不只一種，THEN the domain package SHALL 回報這個順序裡最前面的原因：結構、時鐘、幣別、加總。

#### Scenario: 結構和時鐘

- **WHEN** 事件的標題是空字串，時間戳記也比收到時間晚一小時
- **THEN** 不套用，原因是結構

#### Scenario: 時鐘和幣別

- **WHEN** 事件的幣別是 `XYZ`，時間戳記也比收到時間晚一小時
- **THEN** 不套用，原因是時鐘

#### Scenario: 幣別和加總

- **WHEN** 事件的幣別是 `XYZ`，分攤的總和也不等於金額
- **THEN** 不套用，原因是幣別

### Requirement: SYNC-11.1 逐單位合併，時間戳記晚的留下

WHEN 把事件合併進它指的紀錄，the domain package SHALL 對事件改的每個單位這樣決定：紀錄還沒有這個單位，或事件的時間戳記比紀錄裡這個單位的時間戳記晚（SYNC-1.1），就換成事件的值並記下事件的時間戳記；事件的時間戳記比較早，就留下紀錄原有的值和時間戳記；兩個時間戳記相同時，留下比較大的值（SYNC-19.1）。事件沒有改的單位都不變；交進來的紀錄和事件不被改動。

#### Scenario: 紀錄的第一個事件

- **WHEN** 手機還沒有 Dinner，合併它的第一個事件
- **THEN** 紀錄的六個單位都是 Dinner 的值，時間戳記都是 `1000/0/phone-a`

#### Scenario: 兩支手機改不同的單位

- **WHEN** 一個事件在 `2000/0/phone-a` 把 Dinner 的標題改成「Supper」，另一個在 `2000/0/phone-b` 把備註改成「Window seat」，不管哪個先合併
- **THEN** 標題是「Supper」、時間戳記 `2000/0/phone-a`，備註是「Window seat」、時間戳記 `2000/0/phone-b`，其他四個單位不變

#### Scenario: 兩支手機改同一個單位

- **WHEN** 一個事件在 `2000/0/phone-a` 把標題改成「Supper」，另一個在 `3000/0/phone-b` 改成「Late dinner」，不管哪個先合併
- **THEN** 標題是「Late dinner」，時間戳記 `3000/0/phone-b`

#### Scenario: 毫秒相同

- **WHEN** 改標題的兩個事件的時間戳記是 `2000/0/phone-b` 和 `2000/1/phone-a`；或是 `2000/0/phone-a` 和 `2000/0/phone-b`
- **THEN** 留下的分別是 `2000/1/phone-a` 和 `2000/0/phone-b` 的標題

#### Scenario: 看過別人的修改之後才改

- **WHEN** `phone-a` 在 `7200000/0/phone-a` 把標題改成「Supper」；`phone-b` 的時鐘慢一小時，它合併這個事件之後，在校正後的時間 3605000 把標題改成「Late dinner」
- **THEN** `phone-b` 的修改的時間戳記是 `7200000/1/phone-b`（SYNC-2.1），兩個事件不管哪個先合併，標題都是「Late dinner」

#### Scenario: 移到垃圾桶之後還原

- **WHEN** 一個事件在 `2000/0/phone-a` 把 Dinner 移到垃圾桶，另一個在 `3000/0/phone-b` 還原它，不管哪個先合併
- **THEN** Dinner 不在垃圾桶裡

#### Scenario: 修改比第一個事件先到

- **WHEN** 手機還沒有 Dinner，先合併 `2000/0/phone-b` 把標題改成「Supper」的事件，再合併 Dinner 的第一個事件
- **THEN** 先是只有標題一個單位的紀錄；之後標題仍是「Supper」、時間戳記 `2000/0/phone-b`，其他五個單位來自第一個事件

#### Scenario: 不改動交進來的資料

- **WHEN** 把改標題的事件合併進 Dinner
- **THEN** 交進來的紀錄和事件都和合併之前一樣

### Requirement: SYNC-12.1 金額那一組整組一起換

The domain package SHALL 把金額、幣別、付款和分攤當成一個單位合併：時間戳記晚的那一組整組留下，結果裡不會有一個事件的金額配上另一個事件的付款或分攤。

#### Scenario: 一邊改金額，一邊改分攤的人

- **WHEN** 一個事件在 `2000/0/phone-a` 把 Dinner 的金額改成 10000（Casey 付 10000，分攤依序是 Blake 3334、Taylor 3333、Casey 3333），另一個在 `3000/0/phone-b` 改成只由 Blake 和 Taylor 分攤（10001，Casey 付 10001，分攤依序是 Blake 5001、Taylor 5000），不管哪個先合併
- **THEN** 金額那一組整組是 `phone-b` 的：10001 USD，Casey 付 10001，分攤依序是 Blake 5001、Taylor 5000

#### Scenario: 一邊改付款人，一邊改金額

- **WHEN** 一個事件在 `3000/0/phone-a` 把付款人改成 Taylor（10001，分攤不變），另一個在 `2000/0/phone-b` 把金額改成 20000（Casey 付 20000，分攤依序是 Blake 6667、Taylor 6667、Casey 6666），不管哪個先合併
- **THEN** 金額那一組整組是 `phone-a` 的：10001 USD，Taylor 付 10001，分攤依序是 Blake 3334、Taylor 3334、Casey 3333

#### Scenario: 另一支手機改的是別的單位

- **WHEN** 一個事件在 `2000/0/phone-a` 把金額改成 10000，另一個在 `3000/0/phone-b` 只把標題改成「Supper」
- **THEN** 金額那一組是 `phone-a` 的 10000，標題是「Supper」

### Requirement: SYNC-13.1 永久刪除優先

WHEN 合併永久刪除紀錄的事件，the domain package SHALL 丟掉這筆紀錄的每個單位，只留下刪除紀錄；紀錄有了刪除紀錄之後，不管再合併什麼事件、時間戳記是早是晚，都維持被刪除、沒有任何單位。兩個事件都永久刪除同一筆紀錄時，刪除紀錄留時間戳記比較晚的那一個。

#### Scenario: 刪除之後收到比較晚的修改

- **WHEN** 合併 `2000/0/phone-a` 永久刪除 Dinner 的事件，再合併 `3000/0/phone-b` 把標題改成「Supper」的事件
- **THEN** Dinner 仍是被刪除的，沒有任何單位，刪除紀錄的時間戳記是 `2000/0/phone-a`

#### Scenario: 比較晚的修改先到

- **WHEN** 先合併 `3000/0/phone-b` 改標題的事件，再合併 `2000/0/phone-a` 永久刪除的事件
- **THEN** 結果和上一個情境一樣

#### Scenario: 刪除比第一個事件先到

- **WHEN** 手機還沒有 Dinner，先合併 `2000/0/phone-b` 永久刪除它的事件，再合併它的第一個事件
- **THEN** Dinner 是被刪除的，沒有任何單位

#### Scenario: 還原救不回來

- **WHEN** Dinner 在 `2000/0/phone-a` 被永久刪除，之後合併 `3000/0/phone-b` 把它從垃圾桶還原的事件
- **THEN** Dinner 仍是被刪除的

#### Scenario: 兩支手機都永久刪除

- **WHEN** 兩個事件在 `2000/0/phone-a` 和 `2500/0/phone-b` 永久刪除 Dinner，不管哪個先合併
- **THEN** Dinner 是被刪除的，刪除紀錄的時間戳記是 `2500/0/phone-b`

#### Scenario: 分類

- **WHEN** 合併 `2000/0/phone-a` 永久刪除分類 Fuel 的事件，再合併 `3000/0/phone-b` 把它改名為「Petrol」的事件
- **THEN** Fuel 仍是被刪除的

### Requirement: SYNC-14.1 指出被蓋掉的金額修改

WHEN 拿一個事件和手機自己的金額修改相比，事件改了金額那一組、它的時間戳記比那次修改的晚，而且它這一組根據的版本比那次修改的時間戳記早，或沒有帶根據的版本，the domain package SHALL 指出那次修改被這個事件蓋掉了：寫這個事件的手機沒看過它。這只看這個事件和那次修改，不看紀錄現在的樣子，所以和其他事件、合併的順序和次數都無關。兩組的金額、幣別，以及付款和分攤每一筆的 participant、金額和順序都相同時，不算被蓋掉；事件沒有改金額那一組，或是永久刪除紀錄，也不算。

#### Scenario: 兩個人同時改金額

- **WHEN** Lunch 的金額那一組在 `1000/0/phone-you` 是 300 JPY（你付 300，分攤是你 150、Bob 150）；你在 `5000/0/phone-you` 改成 320（你付 320，分攤各 160）；Bob 的事件在 `6000/0/phone-bob` 改成 350（你付 350，分攤各 175），根據的版本是 `1000/0/phone-you`
- **THEN** 你的修改被 Bob 的事件蓋掉了；再比一次，答案一樣

#### Scenario: 看過才改

- **WHEN** Bob 的事件根據的版本是 `5000/0/phone-you`
- **THEN** 沒有被蓋掉

#### Scenario: 事件比較早

- **WHEN** Bob 的事件的時間戳記是 `4000/0/phone-bob`，根據的版本是 `1000/0/phone-you`
- **THEN** 沒有被蓋掉

#### Scenario: 時間戳記相同

- **WHEN** 事件的時間戳記也是 `5000/0/phone-you`，金額那一組卻是 350，根據的版本是 `1000/0/phone-you`
- **THEN** 沒有被蓋掉

#### Scenario: 沒有帶根據的版本

- **WHEN** Bob 在 `6000/0/phone-bob` 的事件裡，金額那一組沒有帶根據的版本
- **THEN** 你的修改被蓋掉了

#### Scenario: 根據的版本比你的修改晚

- **WHEN** Bob 的事件根據的版本是 `5500/0/phone-carol`
- **THEN** 沒有被蓋掉

#### Scenario: 第三支手機先改了

- **WHEN** Carol 看過你的 320，在 `5500/0/phone-carol` 改成 330（根據 `5000/0/phone-you`）；Bob 兩個都沒看過，在 `6000/0/phone-bob` 改成 350（根據 `1000/0/phone-you`）；你的手機先合併 Carol 的事件再合併 Bob 的，或先合併 Bob 的再合併 Carol 的
- **THEN** 兩種順序最後都是 Bob 的 350；Carol 的事件都沒有蓋掉你的修改，Bob 的事件都蓋掉了

#### Scenario: 改成一模一樣的內容

- **WHEN** 你和 Bob 都改成 350，付款和分攤也完全相同，Bob 的事件根據的版本是 `1000/0/phone-you`
- **THEN** 沒有被蓋掉

#### Scenario: 金額相同，其他地方不同

- **WHEN** 你和 Bob 都改成 350，但 Bob 的分攤依序是 Bob 175、你 175；或付款的人是 Bob；或幣別是 `TWD`；或分攤是你 176、Bob 174
- **THEN** 你的修改都被蓋掉了

#### Scenario: 沒有改金額那一組

- **WHEN** Bob 在 `6000/0/phone-bob` 的事件只把 Lunch 的標題改成「Late lunch」，根據的版本是 `1000/0/phone-you`
- **THEN** 沒有被蓋掉

#### Scenario: 永久刪除

- **WHEN** Bob 在 `6000/0/phone-bob` 的事件永久刪除 Lunch
- **THEN** 沒有被蓋掉

### Requirement: SYNC-15.1 看過的最新時間戳記

WHEN 合併一個事件，the domain package SHALL 回報手機看過的最新時間戳記：原本看過的和這個事件的時間戳記裡比較晚的那一個；事件沒有改到任何單位時也一樣。

#### Scenario: 第一個事件

- **WHEN** 手機還沒看過任何時間戳記，合併時間戳記 `5000/0/phone-b` 的事件
- **THEN** 看過的最新時間戳記是 `5000/0/phone-b`

#### Scenario: 事件比較晚或比較早

- **WHEN** 看過的是 `5000/0/phone-a`，合併 `6000/0/phone-b` 的事件；或看過的是 `6000/0/phone-b`，合併 `5000/0/phone-a` 的事件
- **THEN** 兩次看過的最新時間戳記都是 `6000/0/phone-b`

#### Scenario: 永久刪除的事件

- **WHEN** 看過的是 `5000/0/phone-a`，合併 `6000/0/phone-b` 永久刪除 Dinner 的事件
- **THEN** 看過的最新時間戳記是 `6000/0/phone-b`

#### Scenario: 事件沒有改到任何單位

- **WHEN** Dinner 在 `2000/0/phone-a` 被永久刪除，看過的是 `2000/0/phone-a`，合併 `2500/0/phone-b` 改它標題的事件
- **THEN** Dinner 不變，看過的最新時間戳記是 `2500/0/phone-b`

#### Scenario: 接著的修改

- **WHEN** `phone-a` 合併 `6000/0/phone-b` 的事件之後，在校正後的時間 5000 修改
- **THEN** 新修改的時間戳記是 `6000/1/phone-a`

### Requirement: SYNC-16.1 單位到齊才有可以顯示的內容

WHILE 一筆紀錄還缺它這種紀錄的任何一個單位，或已經被永久刪除，the domain package SHALL 回報它沒有可以顯示的內容；單位到齊時回報每個單位現在的值。

#### Scenario: 到齊

- **WHEN** 合併 Dinner 的第一個事件，再合併把標題改成「Supper」的事件
- **THEN** 可以顯示的內容是 Dinner 的值，標題是「Supper」

#### Scenario: 只收到後來的修改

- **WHEN** 手機只合併了改 Dinner 標題的事件，沒有它的第一個事件
- **THEN** 沒有可以顯示的內容；之後合併第一個事件，就有了

#### Scenario: 被永久刪除

- **WHEN** Dinner 被永久刪除
- **THEN** 沒有可以顯示的內容

#### Scenario: 分類、群組和成員

- **WHEN** 分類只有名稱和顏色、還缺是否封存；成員只有名稱；群組有名稱
- **THEN** 分類和成員沒有可以顯示的內容，群組有；分類補上是否封存、成員補上是否被移出群組之後也有

### Requirement: SYNC-17.1 順序和重複不影響結果

WHEN 同一組事件以不同的順序合併，或其中的事件重複合併，the domain package SHALL 讓每筆紀錄的合併結果和手機看過的最新時間戳記都一模一樣，事件的時間戳記相同時也一樣（SYNC-19.1）。

#### Scenario: 重複合併

- **WHEN** 把同一個事件合併兩次、三次
- **THEN** 結果和合併一次一樣

#### Scenario: 打亂順序

- **WHEN** 一組事件裡有四種紀錄的第一個事件、改同一個單位和改不同單位的修改、移到垃圾桶和還原、永久刪除和比它晚的修改；用固定種子的亂數把它們打亂 200 次，每次再隨機重複其中幾個，逐一判定並合併
- **THEN** 每一次的結果，都和依時間戳記的先後各合併一次的結果一模一樣

#### Scenario: 混著不套用的事件

- **WHEN** 這組事件裡還有加總不對、結構不對、幣別不支援的事件，和時間戳記比收到時間晚一小時的修改和永久刪除，它們的時間戳記都比其他事件晚
- **THEN** 每一次的結果都和沒有這些事件時一樣

#### Scenario: 隨機產生的事件

- **WHEN** 用固定種子的亂數產生 150 個可以套用的事件，時間戳記只有 12 種，所以常常相同，其中有些單位最晚的時間戳記由不同的值共用；把它們打亂 50 次，每次再隨機重複其中幾個，逐一合併
- **THEN** 每一次的結果都一模一樣

### Requirement: SYNC-18.1 交來的資料對不上時丟出錯誤

IF 交給它合併的紀錄不是事件指的那一筆，也就是種類或 ID 不同；交給它和手機自己的金額修改相比的事件，指的不是那次修改所屬的那筆支出；交給它判定的收到時間不是 0 到 9,007,199,254,740,991 之間的整數；或取新修改的時間戳記時，校正後的時間不是這個範圍裡的整數、裝置 ID 不合 SYNC-4.1 的規定，或看過的最新時間戳記的毫秒和計數器都已經是 9,007,199,254,740,991、取不出更晚的，THEN the domain package SHALL 丟出錯誤，不回傳結果。

#### Scenario: 別筆紀錄

- **WHEN** 把另一筆支出 Fuel 的事件合併進 Dinner 的紀錄
- **THEN** 丟出錯誤

#### Scenario: 種類不同

- **WHEN** 把種類是分類、ID 和 Dinner 相同的事件合併進 Dinner 這筆支出的紀錄
- **THEN** 丟出錯誤

#### Scenario: 別筆支出的金額修改

- **WHEN** 拿 Dinner 的事件，或種類是分類、ID 和 Lunch 相同的事件，和你對 Lunch 的金額修改相比
- **THEN** 丟出錯誤

#### Scenario: 收到時間

- **WHEN** 判定事件時，收到時間是 -1、1.5 或不是數字
- **THEN** 丟出錯誤

#### Scenario: 校正後的時間和裝置 ID

- **WHEN** 取新修改的時間戳記時，校正後的時間是 -1、1.5 或不是數字，或裝置 ID 是空字串、`phone a`、`phöne`
- **THEN** 丟出錯誤

#### Scenario: 取不出更晚的時間戳記

- **WHEN** 取新修改的時間戳記時，看過的最新時間戳記是 `9007199254740991/9007199254740991/phone-b`
- **THEN** 丟出錯誤

### Requirement: SYNC-19.1 時間戳記相同時留下比較大的值

WHEN 事件的時間戳記和紀錄裡某個單位的時間戳記相同，the domain package SHALL 留下兩個值裡比較大的那一個，時間戳記不變，所以結果和哪個事件先合併無關。比大小不依語言設定：字串從頭逐一比 UTF-16 code unit，第一個不同的決定大小，前面都相同時比較長的比較大；數字比數值；「是」比「否」大；有備註比沒有備註大；分類依序比顏色、ID、名稱；金額那一組依序比金額、幣別、付款、分攤；付款和分攤各自從頭逐筆比，每一筆先比金額、再比 participant，前面都相同時筆數多的比較大。依序比的時候，第一個不同的地方決定大小。

#### Scenario: 標題

- **WHEN** 時間戳記都是 `2000/0/phone-a` 的兩個事件，把 Dinner 的標題改成「Supper」和「Late dinner」；「Dinner」和「Dinner at eight」；「Supper」和「dinner」；「Supper」和「晚餐」；「😀」和「～」，各用兩種順序合併
- **THEN** 留下的分別是「Supper」、「Dinner at eight」、「dinner」、「晚餐」、「～」，時間戳記仍是 `2000/0/phone-a`

#### Scenario: 日期、備註和垃圾桶

- **WHEN** 時間戳記相同的兩個事件，把日期改成 `2025-03-14` 和 `2025-03-15`；一個把備註改成「Window seat」、一個改成沒有備註；一個把 Dinner 移到垃圾桶、一個還原它
- **THEN** 留下的分別是 `2025-03-15`、「Window seat」、在垃圾桶裡

#### Scenario: 分類

- **WHEN** 時間戳記相同的兩個事件，把分類改成 `#1E88E5` 的 `cat-fuel`「Fuel」和 `#D81B60` 的 `cat-food`「Food & Dining」；改成顏色相同的 `cat-a`「Zoo」和 `cat-b`「Apple」；改成顏色和 ID 都相同、名稱是「Food」和「Dining」
- **THEN** 留下的分別是「Food & Dining」、`cat-b`「Apple」、「Food」

#### Scenario: 金額那一組

- **WHEN** 時間戳記相同的兩個事件，把金額那一組改成 10000 `USD` 和 10001 `JPY`；改成 Taylor 付的 10001 `JPY` 和 Casey 付的 10001 `USD`；金額和幣別相同時，改成 Casey 付 10001、分攤是 Blake 5001 和 Taylor 5000，和 Taylor 付 10001、分攤是 Blake 3334、Taylor 3334 和 Casey 3333；改成 Casey 付 6000、Taylor 付 4001，和 Blake 付 10001；付款相同時，分攤改成 Blake 5001、Taylor 5000，和 Blake 3334、Taylor 3334、Casey 3333；分攤改成 Blake 5000、Taylor 5001，和 Taylor 5000、Blake 5001；改成 Casey 付 10001，和 Casey 付 10001、Taylor 付 0
- **THEN** 留下的分別是 10001 `JPY` 的、10001 `USD` 的、Taylor 付的、Blake 付 10001 的、Blake 5001 和 Taylor 5000 的、Taylor 5000 和 Blake 5001 的、有兩筆付款的

#### Scenario: 分類、群組和成員的單位

- **WHEN** 時間戳記相同的兩個事件，把群組改名為「Brisbane」和「Brissie」；把成員改成被移出群組和沒有被移出；把分類改成封存和沒有封存；把分類的顏色改成 `#1E88E5` 和 `#43A047`
- **THEN** 留下的分別是「Brissie」、被移出群組、封存、`#43A047`

#### Scenario: 三個值

- **WHEN** 時間戳記都是 `2000/0/phone-a` 的三個事件，把 Dinner 的標題改成「Supper」、「Late dinner」和「Dinner at eight」，用六種順序合併
- **THEN** 六種順序都留下「Supper」

### Requirement: SYNC-20.1 群組變成共同帳本時，每筆紀錄都拿到時間戳記

WHEN 群組變成共同帳本，the mobile app SHALL 在同一個 SQLite transaction 裡把它記成共同帳本、記下這支手機的裝置 ID，並替它的每筆紀錄記下每個單位現在的值和時間戳記，不寫任何事件：每筆紀錄各取一個新的時間戳記（SYNC-2.1，用校正後的時間和這支手機的裝置 ID），它的每個單位都用這一個；成員依 Members 的順序（GROUPS-24.3）一個比一個晚，前成員依被移出的先後一個比一個晚，分類依儲存的順序（CATEGORIES-7.5）一個比一個晚。其中任何一筆存不進去，就都不留下，群組仍不是共同帳本；群組已經是共同帳本時什麼都不改。

#### Scenario: 不寫事件

- **WHEN** Brisbane 有 Dinner，在 T 變成共同帳本
- **THEN** 沒有待上傳的事件

#### Scenario: 之後的修改根據那時的時間戳記

- **WHEN** Brisbane 有 Dinner，在 T 變成共同帳本之後，把 Dinner 的標題改成「Supper」，再把 Brisbane 改名為「Brissie」
- **THEN** 兩個事件裡，標題和群組名稱根據的版本都是毫秒 T、裝置 ID `phone-a` 的時間戳記

#### Scenario: 成員

- **WHEN** Brisbane 依序加入 Casey、Blake 和 Dana 之後變成共同帳本，再把三位各改一次名，然後把 Casey 移出群組
- **THEN** 三個改名的事件根據的版本，Casey 的比 Blake 的早，Blake 的比 Dana 的早，毫秒都是 T；移出 Casey 的事件根據的版本，和改他名稱的事件根據的版本是同一個時間戳記

#### Scenario: 前成員

- **WHEN** 先把 Blake 移出 Brisbane，再把 Casey 移出，然後 Brisbane 變成共同帳本，之後把兩位都加回來
- **THEN** 兩個事件根據的版本，Blake 的比 Casey 的早，毫秒都是 T

#### Scenario: 分類

- **WHEN** Brisbane 新增 Flights 之後變成共同帳本，再把 Flights、Other 和 Food & Dining 各改一次名
- **THEN** 三個事件根據的版本，Food & Dining 的比 Other 的早，Other 的比 Flights 的早，毫秒都是 T

#### Scenario: 垃圾桶裡的支出和封存的分類

- **WHEN** Brisbane 的 Pharmacy 在垃圾桶裡、分類 Health 封存了，Brisbane 變成共同帳本之後，還原 Pharmacy，再還原 Health
- **THEN** 兩個事件都帶著根據的版本，毫秒是 T

#### Scenario: 存不進去

- **WHEN** Brisbane 變成共同帳本時，不論哪一筆寫入失敗
- **THEN** 本機資料和之前一樣，Brisbane 不是共同帳本；恢復後再做一次，之後替 Brisbane 改名就寫出一個事件

#### Scenario: 已經是共同帳本

- **WHEN** Brisbane 在 T 變成共同帳本之後，在 T+60000 再變一次
- **THEN** 本機資料不變；之後替 Brisbane 改名，名稱根據的版本的毫秒仍是 T

### Requirement: SYNC-21.1 共同帳本的變更和它的事件一起存下

WHEN 使用者在共同帳本做了要寫成事件的變更（SYNC-22.1 到 SYNC-25.1、SYNC-33.1、SYNC-34.1、SYNC-38.1），the mobile app SHALL 在存下這次變更的同一個 SQLite transaction 裡，存下它的事件、這些紀錄改過的單位和時間戳記，以及手機看過的最新時間戳記，其中任何一筆存不進去就都不留下，畫面照這個動作原本存不進去時的提示；每個事件的格式版本是 1，判定為可以套用（SYNC-3.1 到 SYNC-10.1），屬於這個共同帳本，有一個新的事件 ID，是小寫的第 4 版 UUID，時間戳記是用校正後的時間和這支手機的裝置 ID 取的新時間戳記（SYNC-2.1），一次變更寫好幾個事件時一個接一個各取一個；待上傳的事件依寫下的先後排列，重新啟動 app 之後還在，事件 ID 和順序都不變。

#### Scenario: 同一毫秒裡的幾次變更

- **WHEN** 在 T+60000 新增 Dinner、把它移到垃圾桶、按 Undo，到了 T+120000 再把標題改成「Supper」
- **THEN** 四個事件的時間戳記依序是 `T+60000/0/phone-a`、`T+60000/1/phone-a`、`T+60000/2/phone-a`、`T+120000/0/phone-a`

#### Scenario: 事件和事件 ID

- **WHEN** 新增 Dinner、改它的金額、把它移到垃圾桶再按 Undo
- **THEN** 有四個待上傳的事件，都屬於 Brisbane，都判定為可以套用，事件 ID 是四個不同的小寫第 4 版 UUID

#### Scenario: 重新啟動

- **WHEN** 接著重新啟動 app
- **THEN** 待上傳的事件和重新啟動前一樣，事件 ID 和順序都不變

#### Scenario: 存支出到一半失敗

- **WHEN** 在 Brisbane 新增 Dinner 時，不論哪一筆寫入失敗
- **THEN** 跳出「Unable to Save Expense」的提示框（LEDGER-26.1），本機資料和按 Add 之前一樣，沒有支出也沒有事件；恢復後再按一次，存下 Dinner 和一個時間戳記是 `T+60000/0/phone-a` 的事件

#### Scenario: 移到垃圾桶到一半失敗

- **WHEN** 把 Dinner 移到垃圾桶時，不論哪一筆寫入失敗
- **THEN** 跳出「Unable to Update Trash」的提示框（LEDGER-82.1），本機資料和之前一樣；恢復後再做一次，Dinner 移到垃圾桶，寫出一個事件

#### Scenario: 加成員到一半失敗

- **WHEN** 在 Brisbane 加入 Dana 時，不論哪一筆寫入失敗
- **THEN** 跳出「Unable to Add Member」的提示框（GROUPS-35.2），本機資料和按 Return 之前一樣；恢復後再按一次，Dana 加入，寫出一個事件

#### Scenario: 搬移到一半失敗

- **WHEN** 把 Brisbane 的 Gym 的兩筆支出搬到 Shopping 時，不論哪一筆寫入失敗
- **THEN** 跳出「Unable to Update Category」的提示框（CATEGORIES-41.1），「Move Gym Expenses」仍開著，本機資料和之前一樣，一個事件也沒有多；恢復後再按一次，寫出三個事件

### Requirement: SYNC-22.1 新增支出寫成帶著六個單位的事件

WHEN 使用者在共同帳本新增支出（LEDGER-54.1），或把個人支出改成共同帳本的支出（LEDGER-57.1），the mobile app SHALL 為這筆支出寫一個事件，帶著存下的六個單位，都不帶根據的版本：標題、日期、備註（沒有備註時是空值）、分類的 ID 和存檔時的名稱和顏色、金額那一組（金額、幣別，以及依序的付款和分攤，participant 是成員 ID）、不在垃圾桶裡；紀錄的 ID 是支出的 ID，個人支出改成共同帳本的支出時 ID 不變。

#### Scenario: 新增 Dinner

- **WHEN** 在 Brisbane 新增 Dinner
- **THEN** 寫出一個事件：種類是支出，ID 是 Dinner 的 ID，時間戳記 `T+60000/0/phone-a`；標題「Dinner」，日期 `2026-10-30`，備註是空值，分類是 Brisbane 的 Food & Dining 的 ID、「Food & Dining」和 `#D81B60`，金額那一組是 10001 USD、Casey 付 10001、分攤依序是 Blake 3334、Taylor 3334、Casey 3333，不在垃圾桶裡；六個單位都沒有根據的版本

#### Scenario: 備註、日期和分類

- **WHEN** 在 Brisbane 新增 `2026-10-29` 的「Taxi」，25.00、Transportation、備註「 Airport 」，Taylor 付款，只有 Casey 分攤
- **THEN** 事件的日期是 `2026-10-29`，備註是「Airport」，分類是 Brisbane 的 Transportation，金額那一組是 2500 USD、Taylor 付 2500、分攤是 Casey 2500

#### Scenario: 個人支出改成共同帳本的支出

- **WHEN** 把 875 USD 的個人支出「Coffee run」改成 Brisbane 的支出，Taylor 付款，依序選 Taylor 和 Casey 分攤，按 Save
- **THEN** 新增個人支出時沒有事件；這時寫出一個事件，紀錄的 ID 是 Coffee run 原本的 ID，帶著六個單位，都沒有根據的版本：分類是 Brisbane 的 Food & Dining，金額那一組是 875 USD、Taylor 付 875、分攤依序是 Taylor 438、Casey 437

### Requirement: SYNC-23.1 修改支出只寫值不同的單位

WHEN 使用者存下共同帳本支出的修改（LEDGER-56.1、LEDGER-60.1），the mobile app SHALL 寫一個事件，只帶存檔之後的值和存檔之前存著的值不同的單位，每個都帶著根據的版本，也就是存檔之前這個單位的時間戳記：金額、幣別、付款或分攤有任何不同，順序不同也算，就帶整組金額；分類只在分類 ID 不同時才帶，帶著新分類的 ID 和這次存檔時的名稱和顏色，所以分類改了名稱或顏色而支出沒有換分類時不帶，支出存著的分類名稱和顏色也不變（LEDGER-27.2），顯示 Uncategorized 的支出（SYNC-41.1）沒有換分類時也不帶。沒有任何單位不同時不寫事件，也不取時間戳記。

#### Scenario: 只改標題

- **WHEN** 新增 Dinner 之後，把它的標題改成「Supper」
- **THEN** 事件 `T+60000/1/phone-a` 只帶標題「Supper」，根據的版本是 `T+60000/0/phone-a`

#### Scenario: 改金額

- **WHEN** 把 Dinner 的金額改成「100.00」
- **THEN** 事件只帶金額那一組：10000 USD、Casey 付 10000、分攤依序是 Blake 3334、Taylor 3333、Casey 3333，根據的版本是 `T+60000/0/phone-a`

#### Scenario: 只改付款人

- **WHEN** 只把 Dinner 的付款人改成 Taylor
- **THEN** 事件只帶金額那一組：10001 USD、Taylor 付 10001，分攤和原本一樣

#### Scenario: 分攤的順序

- **WHEN** 在 Dinner 的 Split Between 拿掉 Blake 再選 Blake，並把標題改成「Supper」
- **THEN** 事件帶標題和金額那一組，分攤依序是 Taylor 3334、Casey 3334、Blake 3333

#### Scenario: 備註、日期和分類

- **WHEN** 把 Dinner 的備註改成「Window seat」、日期改成 `2026-10-29`、分類改成 Travel 後存檔，再把備註清空存檔
- **THEN** 第一個事件帶備註、日期和分類三個單位，分類是 Brisbane 的 Travel 的 ID、「Travel」和 `#3949AB`，根據的版本都是 `T+60000/0/phone-a`；第二個事件 `T+60000/2/phone-a` 只帶備註，值是空值，根據的版本是 `T+60000/1/phone-a`

#### Scenario: 分類改了名和顏色

- **WHEN** 新增 Dinner 之後，把 Brisbane 的 Food & Dining 改名為「Meals」並改用 `#43A047`，再把 Dinner 的標題改成「Supper」
- **THEN** 改 Dinner 的事件只帶標題；Dinner 存的分類仍是同一個 ID、「Food & Dining」和 `#D81B60`

#### Scenario: 什麼都沒變的存檔

- **WHEN** 新增 Dinner 之後，在 Edit Expense 把金額「100.01」改寫成「100,01」按 Save，之後再把標題改成「Supper」
- **THEN** 第一次沒有寫出事件；改標題的事件的時間戳記是 `T+60000/1/phone-a`

#### Scenario: 顯示 Uncategorized 的支出

- **WHEN** Squat rack 使用 Brisbane 的 Gym，別支手機永久刪除了 Gym，所以它顯示 Uncategorized；把它的標題改成「Bench」，之後再把分類改成 Shopping
- **THEN** 第一個事件只帶標題；第二個事件只帶分類，是 Brisbane 的 Shopping，根據的版本是新增 Squat rack 的事件的時間戳記

### Requirement: SYNC-24.1 移到垃圾桶和還原寫成「在不在垃圾桶裡」的修改

WHEN 使用者把共同帳本的支出移到垃圾桶（LEDGER-71.3），或按 Undo 或 Restore 把它從垃圾桶還原（LEDGER-75.3、LEDGER-79.3），the mobile app SHALL 寫一個只改「在不在垃圾桶裡」的事件，帶著根據的版本：移到垃圾桶是「是」，還原是「否」。

#### Scenario: 刪除再 Undo

- **WHEN** 新增 Dinner 之後，對它的卡片使用「Delete expense」，再按「Undo」
- **THEN** 依序寫出 `T+60000/1/phone-a` 的「是」，根據的版本是 `T+60000/0/phone-a`；以及 `T+60000/2/phone-a` 的「否」，根據的版本是 `T+60000/1/phone-a`

#### Scenario: 從群組的畫面刪除，從 Trash 還原

- **WHEN** 在 Brisbane 的畫面刪除 Dinner，再在 Trash 打開它按「Restore」
- **THEN** 寫出同樣的兩個事件

### Requirement: SYNC-25.1 搬走分類的支出時，每筆支出各寫一個事件

WHEN 使用者把共同帳本的一個分類的支出搬到另一個分類（CATEGORIES-40.1），the mobile app SHALL 為每一筆搬走的支出各寫一個只改分類的事件，垃圾桶裡的支出也一樣，帶著新分類的 ID、名稱、顏色和根據的版本。

#### Scenario: 搬到 Shopping

- **WHEN** Brisbane 新增 Gym，用它記了 Squat rack 和 Chalk，Chalk 在垃圾桶裡，再把 Gym 的支出搬到 Shopping
- **THEN** Squat rack 和 Chalk 各有一個事件，只帶分類：Brisbane 的 Shopping 的 ID、「Shopping」和 `#FBC02D`，根據的版本是各自新增時的時間戳記；連同封存 Gym 的事件（SYNC-38.1）一共三個，時間戳記一個接一個

### Requirement: SYNC-26.1 不是共同帳本的資料不寫事件

WHILE 支出是個人支出、分類是個人分類，或群組還不是共同帳本，the mobile app SHALL 在它們新增、修改、刪除或還原時不寫事件；建立群組、永久刪除個人支出和清空垃圾桶（LEDGER-80.2、LEDGER-81.2）也不寫事件。

#### Scenario: 個人支出

- **WHEN** Brisbane 是共同帳本，新增個人支出 Coffee run，改它的標題和金額，把它移到垃圾桶、按 Undo、再移到垃圾桶，然後永久刪除
- **THEN** 沒有待上傳的事件

#### Scenario: 不是共同帳本的群組的支出

- **WHEN** 在 Tokyo 新增 Sushi，改它的標題和金額，把它移到垃圾桶、還原、再移到垃圾桶
- **THEN** 沒有待上傳的事件

#### Scenario: 清空垃圾桶

- **WHEN** 垃圾桶裡有個人支出 Coffee run、Brisbane 的 Dinner 和 Tokyo 的 Sushi，清空垃圾桶
- **THEN** 沒有寫出事件；Coffee run 永久刪除了，Dinner 和 Sushi 仍在垃圾桶裡

#### Scenario: 不是共同帳本的群組和成員

- **WHEN** 把 Tokyo 改名為「Kyoto」，加入 Evan，把 Dana 改名，把 Evan 移出，再建立群組「Osaka」
- **THEN** 沒有待上傳的事件

#### Scenario: 個人分類和不是共同帳本的群組的分類

- **WHEN** 在 Manage Categories 新增 Gym 再改名、改色，在 Tokyo 的 Group Categories 新增 Flights、改名，再刪除它和 Other
- **THEN** 沒有待上傳的事件

### Requirement: SYNC-27.1 寫成的事件太大時不儲存

IF 一次變更要寫的事件裡，有一個的大小超過 65,536 bytes，THEN the mobile app SHALL 不儲存這次變更，不留下任何事件，並跳出提示框，表單或名稱欄位保持開啟並保留輸入：支出表單是標題「Unable to Save Expense」、內容「This expense is too large to sync. Shorten the title or note and try again.」；Rename Group、Members 的名稱欄位和 Rename Member 的標題分別是「Unable to Rename Group」、「Unable to Add Member」和「Unable to Rename Member」，內容都是「This name is too long to sync. Shorten it and try again.」。不寫事件的變更沒有這個限制。

#### Scenario: 很長的備註

- **WHEN** 在 Brisbane 的 New Expense 填好 Dinner，備註是 70,000 個「a」，按 Add
- **THEN** 跳出「Unable to Save Expense」和這句話，表單仍開著，備註還在；沒有存下支出，也沒有事件。把備註改成「Window seat」再按 Add，表單關閉，寫出一個事件

#### Scenario: 剛好 65,536 bytes

- **WHEN** Dinner 的備註長到讓事件的大小是 65,537 bytes 時按 Add，再刪掉一個字按 Add
- **THEN** 第一次跳出這個提示框，沒有存下；第二次存下，事件的大小剛好是 65,536 bytes

#### Scenario: 算 bytes 不算字數

- **WHEN** 備註是 22,000 個「帳」（66,000 bytes）時按 Add，再改成 21,000 個「帳」按 Add
- **THEN** 第一次跳出這個提示框；第二次存下

#### Scenario: 個人支出改成共同帳本的支出

- **WHEN** 備註是 70,000 個「a」的個人支出 Coffee run，在 Edit Expense 改成 Brisbane 的支出，按 Save
- **THEN** 跳出這個提示框，Edit Expense 仍開著；Coffee run 仍是原本的個人支出，沒有事件

#### Scenario: 只改長備註的支出的標題

- **WHEN** Brisbane 變成共同帳本之前，Dinner 的備註就是 70,000 個「a」；變成共同帳本之後，把 Dinner 的標題改成「Supper」
- **THEN** 存下，事件只帶標題，沒有提示框

#### Scenario: 群組名稱

- **WHEN** 在 Brisbane 的 Rename Group 輸入 70,000 個「a」，按 Save
- **THEN** 跳出「Unable to Rename Group」和「This name is too long to sync. Shorten it and try again.」，Rename Group 仍開著，名稱欄位還是那 70,000 個字；群組仍叫 Brisbane，沒有事件

#### Scenario: 成員名稱

- **WHEN** 在 Brisbane 的 Members 的名稱欄位輸入 22,000 個「帳」按 Return；或在 Casey 的 Rename Member 輸入 70,000 個「a」按 Save
- **THEN** 分別跳出「Unable to Add Member」和「Unable to Rename Member」，內容都是那句話；名稱欄位保留輸入，Rename Member 仍開著，成員沒有改變，沒有事件

#### Scenario: 不寫事件的變更

- **WHEN** 新增備註是 70,000 個「a」的個人支出和 Tokyo 的支出，把 Tokyo 改名為 70,000 個「a」，再加入名稱是 70,000 個「a」的成員
- **THEN** 都存下，沒有提示框

### Requirement: SYNC-28.1 套用收到的事件

WHEN 手機 app 套用共同帳本收到的事件，the mobile app SHALL 依交來的順序，用每個事件的收到時間判定它（SYNC-3.1 到 SYNC-10.1），把可以套用的合併進它指的紀錄（SYNC-11.1 到 SYNC-19.1），並在同一個 SQLite transaction 裡存下這次交來的事件合併後的單位、時間戳記、刪除紀錄、手機看過的最新時間戳記（SYNC-15.1）和合併的結果，其中任何一筆存不進去就都不留下。同一個事件再收到，或這支手機自己寫的事件再收到，本機資料不變；同一組事件不管以什麼順序收到，每筆紀錄合併的結果都一樣（SYNC-17.1）。

#### Scenario: 別支手機新增的支出

- **WHEN** 套用 Lunch 的第一個事件
- **THEN** 存著的支出多了 Lunch：ID 是紀錄的 ID，空間是 Brisbane，3000 USD、`2026-10-30`、Food & Dining、沒有備註，Casey 付 3000，分攤依序是 Taylor 1500、Casey 1500，不在垃圾桶裡

#### Scenario: 再收到一次

- **WHEN** 套用 Lunch 的第一個事件、把它的標題改成「Brunch」的事件、另一筆支出 Taxi 的第一個事件和永久刪除 Taxi 的事件之後，把這四個事件原樣再套用一次，再以不同的順序套用一次
- **THEN** 本機資料和第一次套用之後一樣，支出清單只有 Brunch

#### Scenario: 比較晚的修改先到

- **WHEN** 套用 Lunch 的第一個事件之後，先套用 `T+62000/0/phone-b` 把標題改成「Late lunch」的事件，再套用 `T+61000/0/phone-b` 改成「Brunch」的事件
- **THEN** 標題是「Late lunch」

#### Scenario: 自己寫的事件

- **WHEN** 新增 Dinner 並把標題改成「Supper」之後，把這兩個待上傳的事件當成收到的事件套用
- **THEN** 本機資料不變

#### Scenario: 比手機的時間晚的事件

- **WHEN** 校正後的時間是 T+60000，套用時間戳記是 `T+360000/0/phone-b` 的 Lunch 的第一個事件，再新增 Dinner
- **THEN** Dinner 的事件的時間戳記是 `T+360000/1/phone-a`

#### Scenario: 套用到一半失敗

- **WHEN** 一起套用 Lunch 和 Taxi 的第一個事件時，不論哪一筆寫入失敗
- **THEN** 本機資料和之前一樣，兩筆都沒有；恢復後再套用，兩筆都有

### Requirement: SYNC-29.1 套用的支出顯示在每個畫面

WHEN 套用的事件讓共同帳本的一筆支出的六個單位到齊，或改了已經到齊的支出，the mobile app SHALL 讓存著的這筆支出是合併的結果，並讓開著的畫面不必重新啟動就照新的資料顯示：支出清單和 This Month、群組的畫面和群組的金額、明細、Trash、Balances 和 Insights。剛到齊的支出算是這時新增的（LEDGER-28.1），之後的修改不改變它在同一天裡的位置；「在不在垃圾桶裡」從否變成是，算是這時移到垃圾桶（LEDGER-77.3），沒有 Undo 提示，從是變成否就回到原來的位置；單位還沒到齊的支出不出現在任何畫面。

#### Scenario: 支出清單

- **WHEN** 有 Dinner，支出清單開著時套用 Lunch 的第一個事件
- **THEN** 卡片由上而下是 Lunch、Dinner；Lunch 的卡片是「Lunch」、「$15.00」、「Food & Dining」、「Brisbane」，卡片上方是「This Month: $48.34」

#### Scenario: 群組的畫面

- **WHEN** 有 Dinner，Brisbane 的畫面開著時，依序套用 Lunch 和 Taxi（2500 USD，Casey 付款，只有 Blake 分攤）的第一個事件
- **THEN** 卡片由上而下是 Taxi、Lunch、Dinner；Lunch 的卡片是「Lunch」、「$30.00」、「Food & Dining」、「Paid by Casey」，卡片上方是「Group Total: $155.01」

#### Scenario: 和你無關的支出

- **WHEN** 套用 Taxi 的第一個事件
- **THEN** Brisbane 的畫面有 Taxi 的卡片，支出清單沒有（LEDGER-64.2）

#### Scenario: Balances 和 Insights

- **WHEN** 有 Dinner，套用 Lunch 的第一個事件
- **THEN** 個人的 Insights 的總額是「$48.34」；Brisbane 的 Balances 是「Taylor (You)」「Owes $48.34」「Paid $0.00 · Share $48.34」、「Casey」「Is Owed $81.68」「Paid $130.01 · Share $48.33」、「Blake」「Owes $33.34」「Paid $0.00 · Share $33.34」

#### Scenario: 開著的明細

- **WHEN** Lunch 的明細開著時，套用把它的標題改成「Late lunch」、備註改成「Window seat」、金額那一組改成 4000 USD（Taylor 付 4000，分攤依序是 Taylor 2000、Blake 2000）的事件
- **THEN** 明細顯示「Late lunch」、「$40.00」、「You paid」「$40.00」、「Your share」「$20.00」、「You are owed」「$20.00」，付款的是「Taylor (You)」，分攤的是「Taylor (You)」和「Blake」，備註是「Window seat」，沒有 Casey

#### Scenario: 修改不改變位置

- **WHEN** 套用 Lunch 的第一個事件之後新增 Dinner，再套用把 Lunch 的標題改成「Late lunch」的事件
- **THEN** 卡片由上而下仍是 Dinner、Late lunch

#### Scenario: 單位還沒到齊

- **WHEN** 手機還沒有 Lunch，套用只改它標題為「Brunch」的事件
- **THEN** 存著的支出沒有它，Brisbane 的畫面沒有卡片；再套用 Lunch 的第一個事件，就有標題是「Brunch」的卡片

#### Scenario: 別支手機把支出移到垃圾桶

- **WHEN** 個人支出 Coffee run 已經在垃圾桶裡，有 Dinner 和你付款、自己分攤的 2500 USD 的 Taxi，套用把 Dinner 移到垃圾桶的事件
- **THEN** 支出清單只剩 Taxi，卡片上方是「This Month: $25.00」，沒有 Undo 提示；Trash 由上而下是 Dinner、Coffee run

#### Scenario: 別支手機還原

- **WHEN** 接著套用把 Dinner 還原的事件
- **THEN** Trash 只剩 Coffee run；支出清單由上而下是 Taxi、Dinner

#### Scenario: 已經在垃圾桶裡

- **WHEN** 依序把 Dinner 和 Coffee run 移到垃圾桶之後，套用別支手機也把 Dinner 移到垃圾桶的事件
- **THEN** Trash 由上而下仍是 Coffee run、Dinner

#### Scenario: 重新啟動

- **WHEN** 套用 Lunch 的第一個事件和把標題改成「Late lunch」的事件之後重新啟動 app
- **THEN** 支出清單有 Late lunch 的卡片

### Requirement: SYNC-30.1 套用永久刪除支出的事件

WHEN 套用永久刪除共同帳本支出的事件，the mobile app SHALL 把這筆支出和它的付款、分攤從本機資料刪掉，只留下刪除紀錄：它不再出現在任何畫面，垃圾桶裡的也一樣，開著的明細只顯示「Expense not found.」（LEDGER-39.1），也不再算使用它的分類（CATEGORIES-34.1）；之後不管再套用這筆支出的什麼事件，或它的第一個事件比刪除晚到，它都不出現。

#### Scenario: 支出清單上的支出

- **WHEN** 有 Dinner，套用永久刪除它的事件
- **THEN** 支出清單沒有卡片，是「This Month: —」；Brisbane 的畫面沒有卡片；Trash 只顯示「No deleted expenses.」；存著的支出沒有 Dinner

#### Scenario: 垃圾桶裡的支出

- **WHEN** Dinner 在垃圾桶裡，Trash 開著時套用永久刪除它的事件
- **THEN** Trash 只顯示「No deleted expenses.」

#### Scenario: 開著的明細

- **WHEN** Dinner 的明細開著時套用永久刪除它的事件
- **THEN** 明細只顯示「Expense not found.」

#### Scenario: 之後的事件

- **WHEN** Dinner 被永久刪除之後，套用時間戳記比較晚、改它標題並把它還原的事件，和一個帶著它六個單位的事件；另外先套用永久刪除 Lunch 的事件，再套用 Lunch 的第一個事件
- **THEN** 存著的支出沒有 Dinner，也沒有 Lunch

#### Scenario: 分類不再使用中

- **WHEN** Brisbane 的 Gym 只有 Squat rack 一筆支出，套用永久刪除 Squat rack 的事件之後，在 Brisbane 的 Group Categories 移除 Gym
- **THEN** 跳出「Delete Category?」

### Requirement: SYNC-31.1 不套用的事件不改資料，並留下紀錄

IF 收到的事件被判定不套用（SYNC-10.1），THEN the mobile app SHALL 不改任何紀錄，不提高手機看過的最新時間戳記，並留下一筆紀錄：這個事件的 ID、上傳它的裝置 ID、收到時間和內容，它所屬的共同帳本，以及不套用的原因；同一個事件 ID 再收到時不多留一筆，排在它後面的事件照常套用，紀錄在重新啟動 app 之後還在。

#### Scenario: 四種原因

- **WHEN** 有 Dinner，一起套用五個事件：金額是 3100、分攤加總仍是 3000 的 Lunch；標題是空字串的 Lunch；幣別是 `XYZ` 的 Lunch；時間戳記比收到時間晚一小時的 Lunch；以及內容是空值的事件
- **THEN** 存著的支出和待上傳的事件都和之前一樣，支出清單只有 Dinner；依序留下五筆紀錄，原因是加總、結構、幣別、時鐘、結構，各帶著事件的 ID、上傳的裝置 ID `phone-b`、收到時間、收到的內容和 Brisbane 的群組 ID

#### Scenario: 調快的時鐘拖不動這支手機

- **WHEN** 套用時間戳記比收到時間晚一小時的 Lunch 之後，新增 Dinner
- **THEN** Dinner 的事件的時間戳記是 `T+60000/0/phone-a`

#### Scenario: 後面的事件照常套用

- **WHEN** 一起套用標題是空字串的 Taxi 的第一個事件和 Lunch 的第一個事件
- **THEN** 支出清單有 Lunch；留下一筆紀錄

#### Scenario: 再收到一次

- **WHEN** 同一個不套用的事件套用兩次，再重新啟動 app
- **THEN** 只有一筆紀錄

### Requirement: SYNC-32.1 事件只改它所屬的共同帳本

IF 收到的事件指的支出、分類或成員的 ID，在本機資料裡是別的空間的支出、分類或成員，或群組的事件指的不是這個共同帳本的群組 ID，THEN the mobile app SHALL 不改那筆資料，也不在這個共同帳本新增或改任何東西；排在它後面的事件照常套用。

#### Scenario: 個人支出和別的群組的支出

- **WHEN** 有個人支出 Coffee run 和 Tokyo 的 Sushi，在 Brisbane 套用：帶著六個單位、ID 是 Coffee run 的 ID 的事件；改 Sushi 標題的事件、永久刪除 Sushi 的事件、帶著六個單位而 ID 是 Sushi 的 ID 的事件；最後是 Taxi 的第一個事件
- **THEN** Coffee run 和 Sushi 都和之前一樣，支出清單由上而下是 Sushi、Coffee run；Brisbane 的畫面只有 Taxi 的卡片

#### Scenario: 別的群組

- **WHEN** 在 Brisbane 套用把 Tokyo 的群組 ID 改名為「Hacked」的群組事件
- **THEN** Brisbane 和 Tokyo 的名稱和成員都和之前一樣

#### Scenario: 別的群組的成員

- **WHEN** 在 Brisbane 套用改 Tokyo 的成員 Dana 的名稱、把她移出群組，以及帶著她的 ID 和兩個單位的事件
- **THEN** Brisbane 和 Tokyo 的成員都和之前一樣

#### Scenario: 個人分類和別的群組的分類

- **WHEN** 在 Brisbane 套用改一個個人分類名稱的事件、永久刪除 Tokyo 的一個分類的事件，以及帶著那個分類的 ID 和三個單位的事件
- **THEN** 每個範圍的分類都和之前一樣

### Requirement: SYNC-33.1 改群組名稱寫成群組的事件

WHEN 使用者存下共同帳本的新名稱（GROUPS-41.1），the mobile app SHALL 寫一個改群組名稱的事件：紀錄的種類是群組，ID 是群組 ID，名稱是存下的名稱，帶著根據的版本。

#### Scenario: 改名兩次

- **WHEN** 把 Brisbane 改名為「 Brissie 」，再改名為「Brisbane 2026」
- **THEN** 第一個事件 `T+60000/0/phone-a` 的名稱是「Brissie」，根據的版本的毫秒是 T；第二個事件 `T+60000/1/phone-a` 的名稱是「Brisbane 2026」，根據的版本是 `T+60000/0/phone-a`

### Requirement: SYNC-34.1 成員的變更寫成成員的事件

WHEN 使用者在共同帳本加入新的成員（GROUPS-31.3）、把前成員加回來（GROUPS-34.3）、改成員的名稱（GROUPS-38.1）或把成員移出群組（GROUPS-26.1），the mobile app SHALL 為這位成員寫一個事件，紀錄的種類是成員，ID 是成員 ID：加入新的成員是帶著名稱和「沒有被移出群組」兩個單位、不帶根據的版本的事件；加回來只把「是否被移出群組」改成否；改名只改名稱；移出只把「是否被移出群組」改成是；後三種都帶著根據的版本。

#### Scenario: 加入 Dana

- **WHEN** 在 Brisbane 加入「Dana」
- **THEN** 寫出一個事件：ID 是 Dana 的成員 ID，名稱「Dana」，沒有被移出群組，兩個單位都沒有根據的版本

#### Scenario: 改名

- **WHEN** 把 Casey 改名為「 Casey Lee 」，再把你在 Brisbane 的名稱改成「Sam」
- **THEN** 依序寫出只帶名稱「Casey Lee」和只帶名稱「Sam」的事件，ID 分別是 Casey 和你的成員 ID，根據的版本的毫秒都是 T

#### Scenario: 移出再加回來

- **WHEN** 把 Blake 移出 Brisbane，再輸入「blake」把他加回來
- **THEN** 依序寫出 `T+60000/0/phone-a` 只把「是否被移出群組」改成是的事件，根據的版本的毫秒是 T；以及 `T+60000/1/phone-a` 只改成否的事件，根據的版本是 `T+60000/0/phone-a`

### Requirement: SYNC-35.1 封存留在這支手機上

The mobile app SHALL 把共同帳本的封存留在這支手機上：封存或還原共同帳本（GROUPS-48.1、GROUPS-57.1）不寫事件；共同帳本封存時照常套用收到的事件，它仍是封存的，照封存群組的樣子顯示合併的結果（GROUPS-55.2、LEDGER-67.2），從垃圾桶還原它的支出（LEDGER-79.3）也照常寫事件。

#### Scenario: 封存和還原

- **WHEN** 封存 Brisbane，再還原它
- **THEN** 沒有待上傳的事件

#### Scenario: 封存時收到事件

- **WHEN** 封存 Brisbane 之後，套用把它改名為「Brissie」的事件，和 Lunch（Casey 付款，只有 Taylor 分攤）的第一個事件
- **THEN** 它仍是封存的，Groups 根畫面沒有它的卡片；Archived Groups 有「Open Brissie」，它的畫面有 Lunch 的卡片；支出清單有 Lunch 的卡片

#### Scenario: 還原封存群組的支出

- **WHEN** 新增 Dinner、把它移到垃圾桶、封存 Brisbane 之後，在 Trash 還原 Dinner
- **THEN** 寫出 `T+60000/2/phone-a` 把 Dinner 的「在不在垃圾桶裡」改成否的事件

### Requirement: SYNC-36.1 套用群組和成員的事件

WHEN 套用共同帳本的群組或成員的事件，the mobile app SHALL 讓存著的群組名稱和成員是合併的結果，並讓開著的畫面不必重新啟動就照新的資料顯示：兩個單位到齊、沒有被移出群組的成員是群組的成員，這支手機第一次看到的成員沒有使用者 ID；被移出群組的成員是前成員，他的付款和分攤不變（GROUPS-66.1）；改了名稱的成員，成員 ID 和使用者 ID 都不變，所以你的成員仍是你；單位還沒到齊的成員不出現在任何畫面。

#### Scenario: 群組改名

- **WHEN** 有 Dinner，Brisbane 的畫面開著時，套用把 Brisbane 改名為「Brissie」的事件
- **THEN** 畫面的標題是「Brissie」，Groups 根畫面是「Open Brissie」，支出清單上 Dinner 的卡片是「Brissie」；群組 ID 不變

#### Scenario: 別支手機加入成員

- **WHEN** Brisbane 的 Members 開著時，套用成員 Dana 的第一個事件
- **THEN** Members 由上而下是「Taylor (You)」、「Casey」、「Blake」、「Dana」和「Add Member」；Dana 沒有使用者 ID；New Expense 選了 Brisbane 之後，Who Paid? 依序是 Taylor (You)、Casey、Blake、Dana

#### Scenario: 改名

- **WHEN** 套用把 Casey 改名為「Casey Lee」和把你的成員改名為「Sam」的事件
- **THEN** Members 由上而下是「Sam (You)」、「Casey Lee」、「Blake」和「Add Member」；你的成員 ID 和使用者 ID 都不變

#### Scenario: 移出和加回來

- **WHEN** 有 Dinner，Members 開著時套用把 Blake 移出群組的事件，之後再套用把他加回來的事件
- **THEN** 先是 Members 只有「Taylor (You)」、「Casey」和「Add Member」，Blake 是前成員，Dinner 的付款和分攤都不變；之後 Members 是「Taylor (You)」、「Casey」、「Blake」和「Add Member」

#### Scenario: 單位還沒到齊

- **WHEN** 手機還沒有 Dana，套用只改她名稱為「Dana D.」的事件
- **THEN** Members 沒有她；再套用她的第一個事件，Members 多了「Dana D.」

#### Scenario: 重新啟動

- **WHEN** 套用 Dana 的第一個事件和把 Casey 移出群組的事件之後重新啟動 app
- **THEN** Members 由上而下是「Taylor (You)」、「Blake」、「Dana」和「Add Member」

### Requirement: SYNC-37.1 成員依「是否被移出群組」的時間戳記排列

The mobile app SHALL 讓共同帳本的成員依「是否被移出群組」這個單位的時間戳記由早到晚排列（SYNC-1.1），不依事件到達的先後，所以每支手機上的順序都一樣，兩支手機同時加入的成員都留下，同名也一樣；改名不改變位置，被移出再加回來的排在最後（GROUPS-24.3）；前成員裡最近被移出的，是這個時間戳記最晚的那一位（GROUPS-34.3）。

#### Scenario: 比較早加入的後到

- **WHEN** 這支手機在 T+180000 加入 Evan 之後，才套用 `T+120000/0/phone-b` 加入 Dana 的事件
- **THEN** Members 由上而下是「Taylor (You)」、「Casey」、「Blake」、「Dana」、「Evan」和「Add Member」

#### Scenario: 同一毫秒加入

- **WHEN** 這支手機在 T+60000 加入 Bob（`T+60000/0/phone-a`），再套用 `T+60000/0/phone-b` 加入另一位 Bob 和 `T+60000/0/phone-0` 加入 Zed 的事件
- **THEN** Members 由上而下是「Taylor (You)」、「Casey」、「Blake」、「Zed」、「Bob」、「Bob」和「Add Member」，兩位 Bob 都在，這支手機加的排在前面

#### Scenario: 移出再加回來，和改名

- **WHEN** 依序套用把 Casey 移出群組、把他加回來，以及把你的成員改名為「Sam」的事件，時間戳記一個比一個晚
- **THEN** Members 由上而下是「Sam (You)」、「Blake」、「Casey」和「Add Member」

#### Scenario: 最近被移出的前成員

- **WHEN** 依序套用 `T+62000/0/phone-b` 把 Blake 移出群組、`T+60500/0/phone-b` 把 Casey 改名為「BLAKE」、`T+61000/0/phone-b` 把他移出群組的事件，再在 Members 的名稱欄位輸入「blake」按 Return
- **THEN** 跳出「Add Blake Back?」，問的是時間戳記比較晚才被移出的 Blake，不是比較晚才收到的 BLAKE

### Requirement: SYNC-38.1 分類的變更寫成分類的事件

WHEN 使用者在共同帳本新增分類（CATEGORIES-11.2、LEDGER-62.2）、改它的名稱或顏色、封存它（CATEGORIES-36.1、CATEGORIES-40.1）、還原它（CATEGORIES-38.2）或刪除它（CATEGORIES-34.1），the mobile app SHALL 為這個分類寫一個事件，紀錄的種類是分類，ID 是分類 ID：新增是帶著名稱、顏色和「沒有封存」三個單位、不帶根據的版本的事件；改名或改色只帶值不同的單位，名稱和顏色都沒有不同時不寫事件，也不取時間戳記；封存和還原只改「是否封存」；這三種都帶著根據的版本；刪除是永久刪除這個分類的事件，並留下它的刪除紀錄，之後收到這個分類的任何事件它都不再出現（SYNC-13.1）。

#### Scenario: 新增

- **WHEN** 在 Brisbane 的 Group Categories 新增「 Flights 」
- **THEN** 寫出一個事件：ID 是 Flights 的分類 ID，名稱「Flights」，顏色 `#43A047`，沒有封存，三個單位都沒有根據的版本

#### Scenario: 從支出表單新增

- **WHEN** 在選了 Brisbane 的 New Expense 從「+ Add New Category」新增 Flights，再按 Add 存下 Dinner
- **THEN** 依序寫出 Flights 的事件 `T+60000/0/phone-a` 和 Dinner 的事件 `T+60000/1/phone-a`，Dinner 的分類是 Flights

#### Scenario: 改名和改色

- **WHEN** 依序把 Shopping 改名為「 Groceries 」、只把它的顏色改成 `#00ACC1`、再改名為「Food shop」並改用 `#C62828`
- **THEN** 三個事件依序只帶名稱「Groceries」、只帶顏色 `#00ACC1`、帶名稱「Food shop」和顏色 `#C62828`；第三個事件裡，名稱根據的版本是第一個事件的時間戳記，顏色根據的版本是第二個事件的

#### Scenario: 什麼都沒改就存檔

- **WHEN** 打開 Shopping 的 Edit Category，什麼都沒改就按 Save，之後再把它改名為「Groceries」
- **THEN** 第一次沒有寫出事件；改名的事件的時間戳記是 `T+60000/0/phone-a`

#### Scenario: 封存和還原

- **WHEN** 有支出使用 Health 時封存它，再還原它
- **THEN** 依序寫出只把「是否封存」改成是和只改成否的事件，後者根據的版本是前者的時間戳記

#### Scenario: 刪除

- **WHEN** 沒有支出使用 Other 時，在 Brisbane 的 Group Categories 移除它，按 Delete
- **THEN** 寫出一個永久刪除 Other 的事件 `T+60000/0/phone-a`

#### Scenario: 刪除之後又收到它的事件

- **WHEN** 套用別支手機新增 Hotels 的事件之後，這支手機刪除 Hotels，再套用一個帶著 Hotels 三個單位的事件和一個改它名稱的事件
- **THEN** Brisbane 的 Group Categories 沒有 Hotels，本機資料也沒有這個分類

#### Scenario: 搬走支出

- **WHEN** Brisbane 新增 Gym，用它記了 Squat rack，再把 Gym 的支出搬到 Shopping
- **THEN** 寫出兩個事件，其中一個只把 Gym 的「是否封存」改成是，根據的版本是新增 Gym 的事件的時間戳記；另一個見 SYNC-25.1

### Requirement: SYNC-39.1 套用分類的事件

WHEN 套用共同帳本的分類的事件，the mobile app SHALL 讓存著的這個分類是合併的結果，並讓開著的畫面不必重新啟動就照新的資料顯示：三個單位到齊的分類是這個共同帳本的分類，名稱或顏色和這個範圍的其他分類相同時也照樣留下（CATEGORIES-12.2 和 CATEGORIES-13.3 只在輸入時檢查）；單位還沒到齊的分類不出現在任何畫面；群組的預設分類 Uncategorized 不受事件影響，名稱和顏色都不變，不會封存，也不會被刪除。

#### Scenario: 別支手機新增的分類

- **WHEN** Brisbane 的 Group Categories 開著時，套用分類 Hotels（`#00ACC1`、沒有封存）的第一個事件
- **THEN** 「CATEGORIES」下是九個預設分類和最後一列「Hotels」，色點是 `#00ACC1`；選了 Brisbane 的 New Expense 的分類清單有 Hotels

#### Scenario: 改名、改色、封存和還原

- **WHEN** 依序套用把 Shopping 改名為「Groceries」並改用 `#00ACC1`、把它封存、再把它還原的事件
- **THEN** 先是第三列變成「Groceries」，色點是 `#00ACC1`；再來「CATEGORIES」下沒有它，「ARCHIVED」下是「Groceries」；最後它回到第三列

#### Scenario: 同名同色

- **WHEN** 這支手機在 Brisbane 新增用 `#43A047` 的 Flights 之後，套用別支手機新增的「flights」、`#43A047` 的第一個事件
- **THEN** 「CATEGORIES」下最後兩列是「Flights」和「flights」，色點都是 `#43A047`

#### Scenario: Uncategorized

- **WHEN** 有一筆支出使用 Brisbane 的 Uncategorized，套用把它改名為「Hacked」、改用 `#C62828` 並封存的事件，和永久刪除它的事件
- **THEN** Brisbane 的 Group Categories 仍是九個預設分類，最後一列是「Uncategorized」，色點是 `#757575`，沒有「ARCHIVED」；那筆支出不變

#### Scenario: 單位還沒到齊

- **WHEN** 手機還沒有 Hotels，套用只改它名稱為「Stays」的事件
- **THEN** 列表沒有它；再套用它的第一個事件，最後一列是「Stays」

#### Scenario: 重新啟動

- **WHEN** 套用 Hotels 的第一個事件和把 Other 改名為「Misc」的事件之後重新啟動 app
- **THEN** 第八列是「Misc」，最後一列是「Hotels」

### Requirement: SYNC-40.1 套用永久刪除分類的事件

WHEN 套用永久刪除共同帳本分類的事件，the mobile app SHALL 把這個分類從本機資料刪掉，只留下刪除紀錄，它不再出現在任何畫面，有支出使用它時也一樣（SYNC-41.1）；之後不管再套用這個分類的什麼事件，它都不出現。

#### Scenario: 有支出使用的分類

- **WHEN** Brisbane 的 Gym 有 Squat rack 和垃圾桶裡的 Chalk 兩筆支出，套用永久刪除 Gym 的事件
- **THEN** 本機資料沒有 Gym，Brisbane 的 Group Categories 只有九個預設分類

#### Scenario: 之後的事件

- **WHEN** 套用永久刪除 Other 的事件之後，再套用時間戳記比較晚、把它改名為「Misc」的事件，和一個帶著它三個單位的事件
- **THEN** Brisbane 的 Group Categories 沒有 Other，也沒有 Misc

### Requirement: SYNC-41.1 支出的分類是群組沒有的分類時顯示 Uncategorized

WHILE 共同帳本的支出合併後的分類不是這個群組現有的分類，是被永久刪除的，或這個群組從來沒有的，the mobile app SHALL 讓這筆支出存著並顯示這個群組的 Uncategorized：它的 ID、「Uncategorized」和 `#757575`，垃圾桶裡的支出也一樣；合併後的分類成為這個群組現有的分類之後，支出就存著並顯示合併後的分類。

#### Scenario: 分類被別支手機永久刪除

- **WHEN** Squat rack 和垃圾桶裡的 Chalk 都使用 Brisbane 的 Gym，套用永久刪除 Gym 的事件
- **THEN** 兩筆支出存的分類都是 Brisbane 的 Uncategorized；支出清單上 Squat rack 的卡片和 Trash 上 Chalk 的卡片，分類都是「Uncategorized」

#### Scenario: 別支手機用了已經刪除的分類

- **WHEN** 這支手機刪除 Brisbane 的 Other 之後，套用分類是 Other 的 Lunch 的第一個事件
- **THEN** Lunch 存的分類是 Brisbane 的 Uncategorized，卡片上是「Uncategorized」

#### Scenario: 群組從來沒有的分類

- **WHEN** 接著套用把 Lunch 的分類改成一個這個群組沒有的 ID、名稱「Hotels」的事件
- **THEN** Lunch 的分類仍是 Brisbane 的 Uncategorized

#### Scenario: 分類比支出晚到

- **WHEN** 手機還沒有分類 Hotels，套用分類是 Hotels（`#00ACC1`）的 Lunch 的第一個事件，之後才套用 Hotels 的第一個事件
- **THEN** 先是 Lunch 存的分類是 Brisbane 的 Uncategorized；Hotels 到了之後，Lunch 存的分類是 Hotels 的 ID、「Hotels」和 `#00ACC1`，卡片上是「Hotels」

### Requirement: SYNC-42.1 分類依建立的時間戳記排列

The mobile app SHALL 讓共同帳本的分類依建立的時間戳記由早到晚排列（SYNC-1.1），不依事件到達的先後，所以每支手機上的順序都一樣；改名、改色、封存和還原都不改變位置（CATEGORIES-7.5、CATEGORIES-37.2）。

#### Scenario: 比較早建立的後到

- **WHEN** 這支手機在 T+180000 新增 Flights 之後，才套用 `T+120000/0/phone-b` 新增 Hotels 的事件
- **THEN** 「CATEGORIES」下是九個預設分類、Hotels、Flights

#### Scenario: 同一毫秒建立

- **WHEN** 這支手機在 T+60000 新增 Flights（`T+60000/0/phone-a`），再套用 `T+60000/0/phone-b` 新增 Hotels 和 `T+60000/0/phone-0` 新增 Zoo 的事件
- **THEN** 九個預設分類之後依序是 Zoo、Flights、Hotels

#### Scenario: 改名、改色、封存和還原

- **WHEN** 接著套用把 Zoo 改名為「Animals」並改色、把 Flights 封存、再把 Flights 還原的事件
- **THEN** 九個預設分類之後依序是 Animals、Flights、Hotels

### Requirement: SYNC-43.1 交來的事件不能套用時丟出錯誤

IF 交給手機 app 套用的事件裡有不認得格式版本的事件（SYNC-3.1），或它們所屬的群組在這支手機上不是共同帳本，THEN the mobile app SHALL 丟出錯誤，這一次交來的事件一個都不套用，本機資料不變。

#### Scenario: 不認得的格式版本

- **WHEN** 一起套用 Lunch 的第一個事件和一個格式版本是 2 的事件
- **THEN** 丟出錯誤，本機資料和之前一樣，沒有 Lunch；之後只套用 Lunch 的第一個事件，支出清單就有 Lunch

#### Scenario: 不是共同帳本的群組

- **WHEN** 對不是共同帳本的 Tokyo 套用 Lunch 的第一個事件
- **THEN** 丟出錯誤，本機資料和之前一樣

### Requirement: SYNC-44.1 套用的事件讓支出離開垃圾桶時收起它的 Undo 提示

WHEN 套用的事件把共同帳本的一筆支出從垃圾桶還原，或把它永久刪除，而這支手機上這一筆的 Undo 提示（LEDGER-73.2）還在，the mobile app SHALL 立刻收起這個提示；別筆支出的 Undo 提示不受影響。

#### Scenario: 別支手機還原

- **WHEN** 把 Dinner 移到垃圾桶，Undo 提示還在時，套用別支手機把 Dinner 還原的事件
- **THEN** 提示收起；支出清單有 Dinner 的卡片

#### Scenario: 別支手機永久刪除

- **WHEN** 把 Dinner 移到垃圾桶，Undo 提示還在時，套用永久刪除 Dinner 的事件
- **THEN** 提示收起

#### Scenario: 還原的是別筆

- **WHEN** 有 Dinner 和你付款、自己分攤的 Taxi，依序把 Taxi 和 Dinner 移到垃圾桶，Dinner 的 Undo 提示還在時，套用別支手機把 Taxi 還原的事件
- **THEN** 支出清單有 Taxi 的卡片；Dinner 的提示仍在
