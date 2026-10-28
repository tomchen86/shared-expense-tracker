# Shell

## Purpose

App 外殼：開啟本機資料、開啟期間的載入畫面、打不開時的錯誤畫面，以及這支手機的本機身分。本機資料是手機上的 SQLite 資料庫；開啟時依序跑 migration，還沒有本機身分時再建立一個（ADR-0006）。開發版是指 `__DEV__` 為真的 build。

## Requirements

### Requirement: SHELL-1.1 開啟本機資料時只顯示載入指示

WHILE 本機資料還在開啟，the mobile app SHALL 只顯示一個無障礙標籤為「Restoring local data」的載入指示，不顯示 app 的畫面。

#### Scenario: 還沒開好

- **WHEN** 本機資料庫還沒開好
- **THEN** 畫面上只有標籤為「Restoring local data」的載入指示

#### Scenario: 開好之後

- **WHEN** 本機資料開好了
- **THEN** 載入指示消失，顯示 app 的畫面

### Requirement: SHELL-2.1 還沒有本機身分時建立一個

WHEN app 啟動時本機資料裡還沒有本機身分，the mobile app SHALL 建立一個：使用者、個人空間、個人 participant 各一個小寫的第 4 版 UUID，三個互不相同，名字是空字串。

#### Scenario: 第一次啟動

- **WHEN** app 第一次啟動
- **THEN** 三個 ID 都是小寫的第 4 版 UUID、互不相同，名字是空字串

#### Scenario: 清除 app 資料之後

- **WHEN** 清除 app 資料，再啟動 app
- **THEN** 三個 ID 都和清除前不同

### Requirement: SHELL-3.1 重新啟動後沿用同一個本機身分

The mobile app SHALL 在顯示畫面之前存好本機身分，之後只要本機資料還在，每次啟動都沿用它。

#### Scenario: 畫面一出現就關掉

- **WHEN** app 第一次顯示畫面後馬上關掉，再重新啟動
- **THEN** 三個 ID 和名字都和關掉前一樣

### Requirement: SHELL-4.1 本機資料打不開時顯示錯誤，不動資料

IF 本機資料打不開，THEN the mobile app SHALL 在載入指示的位置顯示「Unable to Load Local Data」和「Your data was not changed.」，不顯示 app 的畫面，並讓本機資料保持開啟前的樣子，開啟時寫到一半的 migration 或本機身分都不留下。打不開是指資料庫無法開啟或讀取、開啟時跑 migration 或建立本機身分失敗，或是不在開發版上、而資料庫記錄的 migration 和 app 的 migration 清單開頭對不上（ADR-0006）。

#### Scenario: 開不了資料庫

- **WHEN** 開啟資料庫失敗，開發版也一樣
- **THEN** 顯示這兩行訊息

#### Scenario: 檔案不是資料庫

- **WHEN** 資料庫檔案的內容不是 SQLite 資料庫，開發版也一樣
- **THEN** 顯示這兩行訊息，檔案內容和之前完全一樣

#### Scenario: 寫不進去

- **WHEN** 資料庫只能讀、不能寫，而開啟時要跑 migration 或建立本機身分，開發版也一樣
- **THEN** 顯示這兩行訊息，檔案內容和之前完全一樣

#### Scenario: 在新版上裝回舊版

- **WHEN** 不是開發版，而資料庫記錄了 app 的所有 migration，再加上一個這個版本沒有的 migration
- **THEN** 顯示這兩行訊息，檔案內容和之前完全一樣

#### Scenario: migration 的內容不同

- **WHEN** 不是開發版，而資料庫記錄的 migration 和 app 的同一個位置的 migration 內容不同
- **THEN** 顯示這兩行訊息，檔案內容和之前完全一樣

### Requirement: SHELL-5.1 開發版遇到對不上的資料就重新開始

IF app 是開發版，而資料庫記錄的 migration 和 app 的 migration 清單開頭對不上，THEN the mobile app SHALL 刪除本機資料，以新的本機身分重新開始（ADR-0006）。

#### Scenario: 在新版上裝回舊版

- **WHEN** 開發版啟動時，資料庫記錄了 app 的所有 migration，再加上一個這個版本沒有的 migration
- **THEN** app 照常顯示畫面，三個 ID 都和之前不同，新版多出的資料不在了

#### Scenario: migration 的內容不同

- **WHEN** 開發版啟動時，資料庫記錄的 migration 和 app 的同一個位置的 migration 內容不同
- **THEN** app 照常顯示畫面，有一個新的本機身分，原本資料庫裡的資料都不在了
