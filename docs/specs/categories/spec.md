# Categories

## Purpose

支出的分類：色盤、預設分類、分類名稱和顏色的規則，以及 Settings 裡 Manage Categories 畫面上的新增、改名和改色。色盤、預設分類，以及名稱和顏色的規則放在 `packages/domain`，每個客戶端都照同一套套用（ADR-0002）；domain 只和交給它的其他分類比對。手機 app 把分類存在本機資料裡（ADR-0006）。每個分類有一個名稱和色盤上的一個顏色。分類表單是新增或編輯分類時開啟的表單。其他任何分類是指本機資料裡的所有分類，編輯時不含正在編輯的那一個。字元數是 UTF-16 code unit 的個數，也就是 JavaScript 字串的長度，所以 😀 這類 emoji 算兩個字元。

## Requirements

### Requirement: CATEGORIES-1.1 13 色的色盤

The domain package SHALL 以固定的 13 色色盤作為分類的顏色，依序是 `#D81B60`、`#1E88E5`、`#FBC02D`、`#00897B`、`#8E24AA`、`#F4511E`、`#3949AB`、`#6D4C41`、`#757575`、`#43A047`、`#00ACC1`、`#C62828`、`#9E9D24`。

#### Scenario: 色盤

- **WHEN** 讀取色盤
- **THEN** 依序是這 13 個色碼

### Requirement: CATEGORIES-2.1 九個預設分類

The domain package SHALL 提供九個預設分類，依序是 Food & Dining、Transportation、Shopping、Entertainment、Bills & Utilities、Health、Travel、Other、Uncategorized，顏色依序是色盤的前九色。

#### Scenario: 預設分類

- **WHEN** 讀取預設分類
- **THEN** 依序是 Food & Dining `#D81B60`、Transportation `#1E88E5`、Shopping `#FBC02D`、Entertainment `#00897B`、Bills & Utilities `#8E24AA`、Health `#F4511E`、Travel `#3949AB`、Other `#6D4C41`、Uncategorized `#757575`

### Requirement: CATEGORIES-3.1 名稱要有 1 到 50 個字元

IF 分類名稱去掉頭尾空白後是空的，或超過 50 個字元，THEN the domain package SHALL 判定這個名稱不能用，原因分別是名稱是空的、名稱太長。

#### Scenario: 空的名稱

- **WHEN** 名稱是空字串或「   」
- **THEN** 不能用，因為名稱是空的

#### Scenario: 剛好 50 個字元

- **WHEN** 名稱是 50 個「a」，或前後再各加一個空白
- **THEN** 可以用

#### Scenario: 超過 50 個字元

- **WHEN** 名稱是 51 個「a」
- **THEN** 不能用，因為名稱太長

#### Scenario: emoji

- **WHEN** 名稱是 25 個 😀，或 26 個 😀
- **THEN** 25 個可以用；26 個是 52 個字元，因為名稱太長而不能用

### Requirement: CATEGORIES-4.1 名稱不能和其他分類重複

IF 分類名稱和其他分類的名稱，兩邊都去掉頭尾空白並轉成小寫後相同，THEN the domain package SHALL 判定這個名稱重複，不能用。轉小寫不依裝置的語言設定（JavaScript 的 `toLowerCase()`），英文以外的字母也轉，例如 `É` 轉成 `é`。

#### Scenario: 只差大小寫或空白

- **WHEN** 其他分類是九個預設分類，名稱是「food & dining」或「 FOOD & DINING 」
- **THEN** 重複

#### Scenario: 英文以外的字母

- **WHEN** 其他分類有「Café」，名稱是「CAFÉ」
- **THEN** 重複

#### Scenario: 其他分類的名稱有空白

- **WHEN** 其他分類有「 Gym 」，名稱是「gym」
- **THEN** 重複

#### Scenario: 不同的名稱

- **WHEN** 其他分類是九個預設分類，名稱是「Food」；或沒有其他分類，名稱是「Food & Dining」
- **THEN** 可以用

### Requirement: CATEGORIES-5.1 可用的顏色

The domain package SHALL 把色盤上沒有被任何其他分類使用的顏色當作可用的顏色，依色盤的順序排列；比較色碼時不分大小寫。

#### Scenario: 沒有其他分類

- **WHEN** 沒有其他分類
- **THEN** 13 色都可用

#### Scenario: 預設分類用掉前九色

- **WHEN** 其他分類是九個預設分類
- **THEN** 可用的是 `#43A047`、`#00ACC1`、`#C62828`、`#9E9D24`

#### Scenario: 用掉中間的顏色

- **WHEN** 其他分類是九個預設分類，加上一個用 `#00ACC1` 的分類
- **THEN** 可用的是 `#43A047`、`#C62828`、`#9E9D24`

#### Scenario: 小寫的色碼

- **WHEN** 其他分類只有一個用 `#43a047` 的分類
- **THEN** 除了 `#43A047`，其他 12 色都可用

#### Scenario: 13 色都用掉了

- **WHEN** 其他分類用了全部 13 色
- **THEN** 沒有可用的顏色

### Requirement: CATEGORIES-6.1 還沒有分類時建立預設分類

WHEN app 開啟本機資料時裡面還沒有任何分類，the mobile app SHALL 依序建立九個預設分類（CATEGORIES-2.1）。

#### Scenario: 第一次啟動

- **WHEN** app 第一次啟動，打開 Manage Categories
- **THEN** 依序列出九個預設分類，名稱和顏色都和 CATEGORIES-2.1 一樣

#### Scenario: 重新啟動

- **WHEN** 第一次啟動後重新啟動 app
- **THEN** 仍是這九個分類，沒有再建立一次

### Requirement: CATEGORIES-7.1 Manage Categories 依儲存的順序列出分類

The mobile app SHALL 在 Manage Categories 的「CATEGORIES」下依儲存的順序列出每個分類，每一列有分類顏色的色點和分類名稱，並在導覽列放一個無障礙名稱是「Add category」的「+」按鈕。儲存的順序是建立的先後：預設分類在前，新增的分類依序排在後面，改名或改色不改變位置。

#### Scenario: 打開 Manage Categories

- **WHEN** 在 Settings 點「Manage Categories」
- **THEN** 「CATEGORIES」下是九個預設分類，每一列有色點和名稱；導覽列有「Add category」按鈕

#### Scenario: 新增的分類

- **WHEN** 新增「Gym」
- **THEN** 「Gym」排在 Uncategorized 後面

#### Scenario: 改名的分類

- **WHEN** 把 Shopping 改名為「Groceries」
- **THEN** 「Groceries」仍是第三列

### Requirement: CATEGORIES-8.1 開啟分類表單

WHEN 使用者點「Add category」或 Uncategorized 以外的分類，the mobile app SHALL 開啟分類表單：點「Add category」時標題是「New Category」，名稱是空的，選取和其他任何分類比對後的第一個可用的顏色（CATEGORIES-5.1）；點分類時標題是「Edit Category」，帶入這個分類的名稱和顏色。

#### Scenario: 新增

- **WHEN** 第一次啟動後點「Add category」
- **THEN** 開啟「New Category」，名稱是空的，選取 `#43A047`

#### Scenario: 再新增一個

- **WHEN** 新增了用 `#43A047` 的「Gym」之後，再點「Add category」
- **THEN** 選取 `#00ACC1`

#### Scenario: 編輯

- **WHEN** 點「Shopping」
- **THEN** 開啟「Edit Category」，名稱是「Shopping」，選取 `#FBC02D`

### Requirement: CATEGORIES-9.1 分類表單的內容

The mobile app SHALL 讓分類表單有「Cancel」按鈕、新增時是「Add」而編輯時是「Save」的按鈕、「NAME」下無障礙名稱是「Category name」的名稱欄位，以及「COLOR」下依色盤順序排列的 13 個顏色按鈕：其他任何分類用的顏色停用，無障礙名稱是「Color <色碼> already in use」；其餘顏色的無障礙名稱是「Select color <色碼>」，點了就改選這個顏色；選取的顏色標示為已選取。

#### Scenario: New Category

- **WHEN** 第一次啟動後開啟「New Category」
- **THEN** 有「Cancel」和「Add」，「NAME」在「COLOR」之前；前九色停用，例如「Color #D81B60 already in use」；後四色是「Select color #43A047」到「Select color #9E9D24」，只有 `#43A047` 標示為已選取

#### Scenario: Edit Category

- **WHEN** 開啟 Shopping 的「Edit Category」
- **THEN** 有「Save」；`#FBC02D` 沒有停用而且已選取，其他八個預設分類的顏色停用

#### Scenario: 改選顏色

- **WHEN** 在「New Category」點「Select color #C62828」，再點「Color #D81B60 already in use」
- **THEN** 選取的是 `#C62828`

### Requirement: CATEGORIES-10.1 名稱欄位最多 50 個字元，空白時不能存

The mobile app SHALL 讓名稱欄位最多接受 50 個字元，並在名稱去掉頭尾空白後是空的時停用 Add 或 Save。

#### Scenario: 還沒輸入名稱

- **WHEN** 「New Category」的名稱是空的，或只有「   」
- **THEN** Add 停用；輸入「Gym」後 Add 可以按

#### Scenario: 清空名稱

- **WHEN** 在 Shopping 的「Edit Category」清空名稱
- **THEN** Save 停用

#### Scenario: 輸入 51 個字元

- **WHEN** 在名稱欄位一個一個輸入 51 個「a」
- **THEN** 欄位裡只有 50 個「a」

### Requirement: CATEGORIES-11.1 按 Add 或 Save 時存下分類

WHEN 使用者按 Add 或 Save，而名稱沒有和其他任何分類重複，the mobile app SHALL 把去掉頭尾空白的名稱和選取的顏色存進本機資料，關閉表單，並在列表上顯示存好的分類；儲存完成前再按 Add 或 Save 不會再存一次。

#### Scenario: 新增

- **WHEN** 在「New Category」輸入「 Gym 」，點「Select color #C62828」，按 Add
- **THEN** 表單關閉，列表最後一列是「Gym」，色點是 `#C62828`

#### Scenario: 改預設分類的名稱和顏色

- **WHEN** 把 Shopping 改名為「Groceries」，選 `#43A047`，按 Save
- **THEN** 表單關閉，第三列是「Groceries」，色點是 `#43A047`，沒有「Shopping」

#### Scenario: 只改大小寫

- **WHEN** 把 Shopping 改名為「SHOPPING」，按 Save
- **THEN** 存成「SHOPPING」，不算重複

#### Scenario: 連按兩次

- **WHEN** 輸入「Gym」後連按兩次 Add，第二次在儲存完成之前
- **THEN** 只多出一個「Gym」

### Requirement: CATEGORIES-12.1 名稱重複時在名稱欄位下方提示

IF 按 Add 或 Save 時名稱和其他任何分類重複（CATEGORIES-4.1），THEN the mobile app SHALL 不儲存、不關閉表單、不跳出提示框，在名稱欄位下方顯示「A category with this name already exists.」並讓螢幕閱讀器念出來，直到名稱被修改。

#### Scenario: 新增同名的分類

- **WHEN** 在「New Category」輸入「food & dining」，按 Add
- **THEN** 表單仍開著，名稱欄位下方顯示這句話，螢幕閱讀器念出來，沒有提示框；按 Cancel 後只有一個 Food & Dining

#### Scenario: 改成其他分類的名稱

- **WHEN** 把 Shopping 改名為「 travel 」，按 Save
- **THEN** 表單仍開著，顯示這句話；按 Cancel 後 Shopping 沒有改變

#### Scenario: 修改名稱

- **WHEN** 出現這句話之後，把名稱改成「food」
- **THEN** 這句話消失

### Requirement: CATEGORIES-13.1 13 色都被用了就不能新增

IF 13 色都被其他任何分類用了，THEN the mobile app SHALL 讓「New Category」不選取任何顏色、停用 Add，並顯示「All category colors are already in use.」。

#### Scenario: 用完 13 色

- **WHEN** 新增四個分類用掉最後四色，再開啟「New Category」
- **THEN** 13 個顏色都停用，沒有選取的顏色，顯示這句話；輸入「Garden」後 Add 仍停用

#### Scenario: 用完時編輯

- **WHEN** 13 色都被用了，開啟 Travel 的「Edit Category」
- **THEN** `#3949AB` 沒有停用而且已選取，Save 可以按，不顯示這句話

### Requirement: CATEGORIES-14.1 Uncategorized 不能編輯

IF 分類是預設分類 Uncategorized，THEN the mobile app SHALL 讓它那一列不是可以按的按鈕，點了也不開啟分類表單；其他預設分類都可以點開編輯。

#### Scenario: 點 Uncategorized

- **WHEN** 點「Uncategorized」那一列
- **THEN** 沒有開啟分類表單

#### Scenario: 其他預設分類

- **WHEN** 點 Food & Dining、Transportation、Shopping、Entertainment、Bills & Utilities、Health、Travel 或 Other
- **THEN** 開啟這個分類的「Edit Category」

### Requirement: CATEGORIES-15.1 按 Cancel 時不儲存

WHEN 使用者在分類表單按 Cancel，the mobile app SHALL 關閉表單，不儲存表單裡的任何變更。

#### Scenario: 取消新增

- **WHEN** 在「New Category」輸入「Gym」後按 Cancel
- **THEN** 表單關閉，沒有「Gym」；再開啟「New Category」時名稱是空的

#### Scenario: 取消編輯

- **WHEN** 把 Shopping 改名為「Groceries」並選 `#43A047`，然後按 Cancel
- **THEN** 第三列仍是「Shopping」，色點是 `#FBC02D`

### Requirement: CATEGORIES-16.1 存不進去時提示

IF 分類存不進本機資料，THEN the mobile app SHALL 跳出標題「Unable to Save Category」、內容「Your category could not be saved. Please try again.」的提示框，表單保持開啟並保留輸入，分類維持原本的樣子。

#### Scenario: 新增失敗

- **WHEN** 資料庫無法寫入時，在「New Category」輸入「Gym」按 Add
- **THEN** 跳出這個提示框，表單仍開著，名稱欄位是「Gym」，Add 可以再按；按 Cancel 後沒有「Gym」

#### Scenario: 再試一次

- **WHEN** 新增失敗後資料庫恢復，再按一次 Add
- **THEN** 表單關閉，新增了「Gym」

#### Scenario: 編輯失敗

- **WHEN** 資料庫無法寫入時，把 Shopping 改名為「Groceries」按 Save
- **THEN** 跳出這個提示框；按 Cancel 後仍是「Shopping」

### Requirement: CATEGORIES-17.1 重新啟動後保留分類的變更

WHEN app 重新啟動，the mobile app SHALL 保留新增的分類，以及分類的改名和改色。

#### Scenario: 重新啟動

- **WHEN** 新增用 `#C62828` 的「Gym」，把 Shopping 改名為「Groceries」並改用 `#43A047`，然後重新啟動 app
- **THEN** Manage Categories 依序是 Food & Dining、Transportation、Groceries、Entertainment、Bills & Utilities、Health、Travel、Other、Uncategorized、Gym，顏色都和重新啟動前一樣

### Requirement: CATEGORIES-18.1 儲存中不能關閉表單

WHILE 分類正在儲存，the mobile app SHALL 停用 Cancel 和 Add 或 Save，直到存好或存不進去為止。

#### Scenario: 新增中

- **WHEN** 輸入「Gym」按 Add，儲存還沒完成
- **THEN** Cancel 和 Add 都停用，表單仍開著；存好後表單關閉，多了「Gym」

#### Scenario: 編輯中

- **WHEN** 把 Shopping 改名為「Groceries」按 Save，儲存還沒完成
- **THEN** Cancel 和 Save 都停用；存好後表單關閉，第三列是「Groceries」

#### Scenario: 存不進去之後

- **WHEN** 資料庫無法寫入時按 Add
- **THEN** 存不進去之後，Cancel 和 Add 都恢復可以按

### Requirement: CATEGORIES-19.1 建立預設分類失敗時當作本機資料打不開

IF 建立預設分類（CATEGORIES-6.1）失敗，THEN the mobile app SHALL 和本機資料打不開時一樣（SHELL-4.1），顯示「Unable to Load Local Data」和「Your data was not changed.」，不顯示 app 的畫面，並讓本機資料保持開啟前的樣子，不留下任何一個預設分類。

#### Scenario: 第一次啟動時寫不進分類

- **WHEN** 第一次啟動時，寫入最後一個預設分類 Uncategorized 失敗
- **THEN** 顯示這兩行訊息，本機資料的檔案內容和開啟前完全一樣

#### Scenario: 恢復後再啟動

- **WHEN** 寫入恢復後再啟動 app
- **THEN** 九個預設分類依序都在

### Requirement: CATEGORIES-20.1 (manual) 儲存中不能往下滑或按返回鍵關閉表單

WHILE 分類正在儲存，the mobile app SHALL 不讓分類表單因為往下滑或按 Android 的返回鍵而關閉。

#### Scenario: 往下滑或按返回鍵

- **WHEN** 儲存還沒完成時往下滑表單，或在 Android 上按返回鍵
- **THEN** 表單不關閉；存好後才關閉

### Requirement: CATEGORIES-21.1 儲存中鎖住名稱和顏色

WHILE 分類正在儲存，the mobile app SHALL 讓名稱欄位不能編輯，點顏色也不改選，直到存好或存不進去為止。

#### Scenario: 新增中

- **WHEN** 輸入「Gym」按 Add，儲存還沒完成
- **THEN** 名稱欄位不能編輯；點「Select color #C62828」之後選取的仍是 `#43A047`；存好後表單關閉，多了用 `#43A047` 的「Gym」

#### Scenario: 存不進去之後

- **WHEN** 資料庫無法寫入時按 Add
- **THEN** 存不進去之後，名稱欄位恢復可以編輯，點「Select color #C62828」就改選它
