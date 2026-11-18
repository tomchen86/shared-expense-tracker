# Sharing

## Purpose

共同帳本靠金鑰認手機，內容加密之後才離開手機（ADR-0015、ADR-0022）。這裡有三塊：`packages/domain` 的加密工具（SHARING-1.1 到 16.1）；手機 app 的裝置身分，和它怎麼替送給 API 的每個請求簽名（SHARING-19.1 到 30.1、43.1）；API 怎麼替手機註冊、檢查簽名和限制請求（SHARING-31.1 到 42.1、44.1）。手機 app 和 API 用 `packages/domain` 的同一個函式組出要簽的 bytes（SHARING-17.1、18.1）。這裡沒有畫面：哪個畫面什麼時候送請求、授權失效時畫面上顯示什麼，都不在這裡。

加密工具：用鑰匙加密和解密內容、用私鑰簽名、把內容裝成只有另一支手機打得開的 box，以及從密鑰材料導出金鑰。工具放在 `packages/domain` 自己的入口，給手機 app 用；它不存任何東西、不連網路，也不自己產生鑰匙、私鑰、nonce 或 salt（SHARING-14.1）。演算法是 XChaCha20-Poly1305（draft-irtf-cfrg-xchacha-03）、Ed25519（RFC 8032）、X25519（RFC 7748）和 HKDF-SHA-256（RFC 5869）。bytes 是一個 `Uint8Array`，以十六進位寫出：`0x01` 是一個 byte，沒有 `0x` 的一串是依序的 bytes，`…` 是省略的部分。鑰匙是 32 bytes 的對稱金鑰。nonce 是呼叫者給的 24 bytes，每次加密或裝 box 都要是新的隨機值。附加資料是一段不加密、但解密時要給出一模一樣的 bytes，可以是空的。密文是 SHARING-1.1 的格式，它的第一個 byte 是格式版本。簽名私鑰是 32 bytes 的 Ed25519 私鑰，box 私鑰是 32 bytes 的 X25519 私鑰，各有一把 32 bytes 的公開金鑰（SHARING-5.1、7.1）。共享密鑰是 X25519 用一把 box 私鑰和另一把 box 公開金鑰算出的 32 bytes。box 是交出方裝給收受方的密文（SHARING-8.1）：情境是裝 box 時給的一段 bytes，可以是空的；salt 是裝 box 時可以再給的 32 bytes；打開時兩者都要和裝的時候一樣。密鑰材料是導出金鑰的來源，用途是用來區分金鑰的一段 bytes，兩者都可以是字串（SHARING-12.1）。解密密文或打開 box 有兩種失敗：解不開（SHARING-3.1、10.1、11.1）和不認得格式版本（SHARING-4.2），兩種都不回傳任何內容。`packages/domain` 拒絕，是丟出錯誤，不產出任何結果。不是 bytes 的輸入一律先被拒絕（SHARING-16.1），只有導出金鑰的密鑰材料和用途也可以是字串；其他的規則說的都是這樣的輸入。沒給一個輸入，是指沒有它，或它是 `undefined`；只有 salt 可以不給。SHARING-15.1 列出的輸入（鑰匙、私鑰、nonce、box 的 salt 和裝 box 時收受方的公開金鑰）長度不對時也一律先被拒絕；要解密的 bytes、要打開的 box 和交出方的公開金鑰不管多長，都照其他的規則回報。

裝置身分是一支手機給 API 認的身分：一個裝置 ID 和一個 seed。裝置 ID 是小寫的第 4 版 UUID，存在本機資料（shell）；seed 是 32 bytes 的隨機值，只存在 `expo-secure-store`（下面叫 secure store），本機資料和 API 都沒有它。簽名私鑰從 seed 導出（SHARING-21.1），它的公開金鑰就是這支手機的公開金鑰。一支手機是這三種之一：沒有裝置身分，是本機資料沒有裝置 ID；有裝置身分，是本機資料有裝置 ID，secure store 裡也有它的 seed；授權失效，是本機資料有裝置 ID，secure store 裡卻沒有它的 seed（SHARING-29.1）。送請求是手機 app 的其他功能要連 API 時做的事：交出 API 的網址、方法、路徑和可以沒有的內容，得到 API 的回應，或得知沒有得到回應、沒有送出（SHARING-22.1 到 30.1）；內容是 bytes，交來的是文字時用它的 UTF-8 編碼。送請求失敗，是呼叫的一方得到錯誤，不是上面任何一種結果（SHARING-24.1、25.1、30.1）。手機 app 用執行環境全域的 `fetch` 連 API。註冊是手機把裝置 ID 和公開金鑰交給 API（SHARING-22.1、38.1）。手機的時鐘是手機自己的時間；時間差是 API 的時間減掉手機的時鐘，由 API 告訴手機（SHARING-27.1），還沒得知時是 0；校正後的時間是手機的時鐘加上時間差。重新啟動 app 是結束 app 再打開，本機資料和 secure store 裡的東西都還在。

簽名的請求是帶著四個欄位的 HTTP 請求：裝置 ID、請求時間、請求的 nonce 和簽名。請求時間是簽名當下的時間，從 1970-01-01T00:00:00Z 起的毫秒數；請求的 nonce 是 16 bytes 的隨機值，寫成 32 個小寫十六進位字元，和加密用的 nonce 無關；簽名是簽名私鑰對要簽的 bytes（SHARING-17.1）的簽名（SHARING-6.1），寫成 128 個小寫十六進位字元。方法是 HTTP 的方法，例如 `GET` 和 `POST`。路徑是請求的網址裡，從主機後面的 `/` 起到結尾的部分，有查詢時連 `?` 和查詢在內；它只能用送出和收到時都不會被改寫的寫法（SHARING-18.1），所以手機簽的和 API 收到的是同一段文字。請求的內容是 HTTP 的 body，沒有時是 0 bytes；內容雜湊是內容那些 bytes 的 SHA-256。四個欄位怎麼放進請求、註冊的內容，和 API 每種回應的格式，都定義在 `packages/domain` 的程式裡，手機 app 和 API 用同一份。

API 的時間是 API 處理請求時自己的時鐘，從 1970-01-01T00:00:00Z 起的毫秒數。請求通過檢查，是它是簽名的請求，而且沒有被 SHARING-32.1 到 37.1 任何一條拒絕，註冊的請求還要沒有被 SHARING-39.1 到 41.1 拒絕；通過檢查的請求才交給路由。API 拒絕一個請求，是回應一個帶著原因的拒絕，不做這個請求要做的事，資料庫和收到它之前一模一樣；原因是簽名、時鐘、重送、請求太多、內容不對或註冊太多。公開的路由是不必簽名的路由：`GET /health`，以及在自己的 requirement 裡寫明不必簽名的路由。IP 是請求來自的 IPv4 或 IPv6 位址：API 在 Cloudflare Workers 上時是 Cloudflare 放在 `CF-Connecting-IP` 的位址，在 Node 上時是連線的來源位址，都不是請求自己帶的其他標頭。IP 雜湊的金鑰是 API 所在的環境給它的一段保密的文字，用來算 IP 加了金鑰的雜湊（SHARING-42.1、44.1）。

下面的情境裡，T 是 `2026-11-18T06:32:00Z`，也就是 1794983520000；除非另外說明，手機的時鐘和 API 的時間都是 T，API 的網址是 `https://api.example.test`。Taylor 的手機的裝置 ID 是 `0f8fad5b-d9cb-469f-a165-70867728950e`，Casey 的手機是 `7c9e6679-7425-40de-944b-e07fc1f90ae7`，各有自己的簽名私鑰；API 的情境裡，除非另外說明，請求都來自 `203.0.113.7`，Taylor 的手機已經註冊。`/no-such-route` 是一個沒有路由的路徑。

## Requirements

### Requirement: SHARING-1.1 密文依序是格式版本、nonce 和 XChaCha20-Poly1305 的結果

WHEN 用一把鑰匙、一個 nonce 和一段附加資料加密一段內容，the domain package SHALL 產出密文：依序是格式版本 `0x01`、這個 nonce，以及 XChaCha20-Poly1305 用這把鑰匙、這個 nonce 和這段附加資料加密這段內容的結果，也就是和內容一樣長的 bytes 加上 16 bytes 的驗證碼。

#### Scenario: draft 的測試向量

- **WHEN** 用鑰匙 `808182838485868788898a8b8c8d8e8f909192939495969798999a9b9c9d9e9f`、nonce `404142434445464748494a4b4c4d4e4f5051525354555657` 和附加資料 `50515253c0c1c2c3c4c5c6c7`，加密 114 bytes 的 `Ladies and Gentlemen of the class of '99: If I could offer you only one tip for the future, sunscreen would be it.`
- **THEN** 密文是 155 bytes：`01`、這個 nonce、draft-irtf-cfrg-xchacha-03 的 A.3.1 列出的 114 bytes（`bd6d179d…8b13b52e`），最後是驗證碼 `c0875924c1c7987947deafd8780acf49`

#### Scenario: 空的內容

- **WHEN** 用同一把鑰匙、nonce 和附加資料加密 0 bytes 的內容
- **THEN** 密文是 41 bytes：`01`、這個 nonce 和驗證碼 `e4c5191f68fd06d9592f83754480d19d`

#### Scenario: 密文比內容長 41 bytes

- **WHEN** 加密 1、1,000、65,536 和 262,144 bytes 的內容
- **THEN** 密文分別是 42、1,041、65,577 和 262,185 bytes，開頭都是 `01` 和這次的 nonce

#### Scenario: 輸入是一大塊 bytes 裡的一段

- **WHEN** 第一個 scenario 的鑰匙、nonce、附加資料和內容，各是一塊較大的 bytes 中間的一段
- **THEN** 密文和第一個 scenario 的一樣

### Requirement: SHARING-2.1 用加密時的鑰匙和附加資料解得開

WHEN 用加密時的鑰匙和附加資料解密一段密文，the domain package SHALL 回傳加密前的內容。

#### Scenario: draft 的測試向量

- **WHEN** 用 SHARING-1.1 第一個 scenario 的鑰匙和附加資料，解密那段 155 bytes 的密文
- **THEN** 得到 `Ladies and Gentlemen of the class of '99: …` 那 114 bytes

#### Scenario: 各種長度的內容

- **WHEN** 加密 0、1、1,000、65,536 和 262,144 bytes 的內容，附加資料是空的或 `50515253c0c1c2c3c4c5c6c7`，再用同一把鑰匙和同一段附加資料解密
- **THEN** 每次都得到加密前的內容

#### Scenario: 輸入是一大塊 bytes 裡的一段

- **WHEN** 鑰匙、密文和附加資料各是一塊較大的 bytes 中間的一段
- **THEN** 一樣解得開

### Requirement: SHARING-3.1 解不開的密文

IF 要解密的 bytes 是空的，或格式版本是 `0x01` 但不是用這把鑰匙和這段附加資料加密出來、之後沒被改過的密文，THEN the domain package SHALL 回報解不開，不回傳任何內容。

#### Scenario: 改掉一個 bit

- **WHEN** 把 SHARING-1.1 第一個 scenario 的密文裡，格式版本之後的任何一個 bit 改掉（nonce、加密後的內容或驗證碼），再用原本的鑰匙和附加資料解密
- **THEN** 回報解不開

#### Scenario: 截短或加長

- **WHEN** 解密那段密文去掉最後一個 byte、在最後多加一個 byte、只留前 41 bytes、只留前 40 bytes 或只留 `01` 的結果，或解密 0 bytes
- **THEN** 都回報解不開

#### Scenario: 別把鑰匙

- **WHEN** 用和加密時差任何一個 bit 的鑰匙解密
- **THEN** 回報解不開

#### Scenario: 附加資料不同

- **WHEN** 解密時給的附加資料和加密時差任何一個 bit、少最後一個 byte、多一個 byte，或是空的；或加密時附加資料是空的，解密時給了 `00`
- **THEN** 都回報解不開

### Requirement: SHARING-4.2 不認得的格式版本

IF 要解密的密文或要打開的 box 的第一個 byte 不是 `0x01`，THEN the domain package SHALL 回報不認得這個格式版本，不回傳任何內容，不管其餘的 bytes 對不對，也不管 SHARING-15.1 和 16.1 以外的輸入對不對。

#### Scenario: 其他的格式版本

- **WHEN** 把一段解得開的密文的第一個 byte 換成 `00`，或 `02` 到 `ff` 的任何一個值，再用原本的鑰匙和附加資料解密
- **THEN** 回報不認得格式版本

#### Scenario: 其他的輸入也不對

- **WHEN** 密文只有 `00`、`02` 或 `ff` 一個 byte；或第一個 byte 是 `02`，鑰匙和附加資料也不是加密時的
- **THEN** 回報不認得格式版本

#### Scenario: box

- **WHEN** 把一個打得開的 box 的第一個 byte 換成 `02`，再照原樣打開，或改用別的交出方公開金鑰和情境、0 bytes 的交出方公開金鑰打開
- **THEN** 回報不認得格式版本

### Requirement: SHARING-5.1 簽名私鑰的公開金鑰

WHEN 從簽名私鑰算公開金鑰，the domain package SHALL 回傳 RFC 8032 為這把私鑰定義的 32 bytes Ed25519 公開金鑰。

#### Scenario: RFC 8032 的 TEST 1

- **WHEN** 簽名私鑰是 `9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60`
- **THEN** 公開金鑰是 `d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a`

### Requirement: SHARING-6.1 簽名是 Web Crypto 驗得過的 Ed25519 簽名

WHEN 用簽名私鑰簽一段內容，the domain package SHALL 產出 RFC 8032 的 64 bytes Ed25519 簽名，API 用 Web Crypto 的 `Ed25519`、這把私鑰的公開金鑰和這段內容驗得過。

#### Scenario: RFC 8032 的 TEST 2

- **WHEN** 用簽名私鑰 `4ccd089b28ff96da9db6c346ec114e0f5b8a319f35aba624da8cf6ed4fb8a6fb` 簽 `72` 這一個 byte
- **THEN** 簽名是 `92a009a9f0d4cab8720e820b5f642540a2b27b5416503f8fb3762223ebdb69da085ac1e43e15996e458f3613d0f11d8c387b2eaeb4302aeeb00d291612bb0c00`

#### Scenario: Web Crypto 驗得過

- **WHEN** 簽 0、1、200 和 65,536 bytes 的內容，再把公開金鑰以 raw 格式匯入 Web Crypto 的 `Ed25519` 去驗簽名
- **THEN** 都驗得過；換成別的內容、改過一個 bit 的簽名，或別把私鑰的公開金鑰，都驗不過

#### Scenario: 輸入是一大塊 bytes 裡的一段

- **WHEN** RFC 8032 的 TEST 3 的私鑰和 `af82` 這兩個 bytes 的訊息，各是一塊較大的 bytes 中間的一段
- **THEN** 公開金鑰和簽名都和 RFC 列出的一樣

### Requirement: SHARING-7.1 box 私鑰的公開金鑰

WHEN 從 box 私鑰算公開金鑰，the domain package SHALL 回傳 RFC 7748 的 X25519 用這把私鑰和基點 9 算出的 32 bytes。

#### Scenario: RFC 7748 6.1 的 Alice 和 Bob

- **WHEN** box 私鑰是 Alice 的 `77076d0a7318a57d3c16c17251b26645df4c2f87ebc0992ab177fba51db92c2a` 和 Bob 的 `5dab087e624a8a4b79e17f8b83800ee66f3bb1292618b6fd1c2f8b27ff88e0eb`
- **THEN** 公開金鑰分別是 `8520f0098930a754748b7ddcb43ef75a0dbf3a0d26381af4eba4a98eaa9b4e6a` 和 `de9edb7d7b7dc1b4d35b61c2ece435373f8343c85b78674dadfc7e146f882b4f`

### Requirement: SHARING-8.1 box 是用雙方的共享密鑰導出的鑰匙加密的密文

WHEN 交出方用自己的 box 私鑰、收受方的 box 公開金鑰、一段情境、一個 nonce 和可以沒有的 salt 把一段內容裝成 box，the domain package SHALL 產出這段內容的密文（SHARING-1.1），附加資料是空的，鑰匙是 HKDF-SHA-256 輸出的前 32 bytes：IKM 是這把私鑰和這把公開金鑰的共享密鑰，salt 是給的 salt、沒給時是 32 個 `0x00`，info 依序是 ASCII 的 `shared-expense/box/v1`、交出方私鑰的公開金鑰（SHARING-7.1）、呼叫者給的收受方公開金鑰那 32 bytes 和情境。

#### Scenario: Alice 裝給 Bob

- **WHEN** 交出方的私鑰是 SHARING-7.1 的 Alice 的，收受方的公開金鑰是 Bob 的，情境是 `a0a1a2a3a4a5a6a7`，nonce 是 `000102030405060708090a0b0c0d0e0f1011121314151617`，沒有 salt，內容是 `101112131415161718191a1b1c1d1e1f202122232425262728292a2b2c2d2e2f`
- **THEN** 共享密鑰是 RFC 7748 6.1 列出的 `4a5d9d5ba4ce2de1728e3bf480350f25e07e21c947d19e3376f09b3c1e161742`，鑰匙是 `49e763afbe9c2920c85d73d8f4902a34e2bcb9ccf33df3be706e3907581295b6`，box 是 73 bytes：`01`、這個 nonce，接著 `dddc128ed1cb022029f654454a4935c7948b28d3f64a09c0a15eb723e2cd6b40430fd540da3c06987c365f1077aafd30`

#### Scenario: 加上 salt

- **WHEN** 同樣的輸入再加上 salt `505152535455565758595a5b5c5d5e5f606162636465666768696a6b6c6d6e6f`
- **THEN** 鑰匙是 `02f7d8ed3df11ac7508be233d508b1850cbcd59e7ef5d33583c3ff16c4b8ab1f`，box 在 `01` 和 nonce 之後是 `61b3d7e611ddb3cf5578d4239d2d9d3e4d2d4e0d843b71ed1e8cad9c7d5b21ebde39f4fe2d8f662086f1a1e393d48aa0`

#### Scenario: 沒給 salt 等於 32 個 0x00

- **WHEN** 同樣的輸入，salt 給 32 個 `0x00`
- **THEN** box 和沒給 salt 時一模一樣

#### Scenario: 各種內容、情境和 salt

- **WHEN** 裝 0、32 和 1,000 bytes 的內容，情境是空的、8 bytes 或 100 bytes，有 salt 或沒有
- **THEN** box 都等於用上面的 info 和 salt 從共享密鑰導出金鑰（SHARING-12.1），再用它和空的附加資料加密內容（SHARING-1.1）的結果

#### Scenario: 收受方的公開金鑰最高的 bit 是 1

- **WHEN** 交出方的私鑰是 RFC 7748 5.2 第二個向量的 `4b66e9d4d1b4673c5ad22691957d6af5c11b6421e0ea01d42ca4169e7918ba0d`，收受方的公開金鑰是它的 `e5210f12786811d3f4b7959d0538ae2c31dbe7106fc03c3efc4cd549c715a493`（最後一個 byte 最高的 bit 是 1），情境、nonce 和內容同第一個 scenario，沒有 salt
- **THEN** 共享密鑰是 RFC 列出的 `95cbde9476e8907d7aade45cb4b873f88b595a68799fa152e6f8f7647aac7957`（X25519 不看那個 bit），info 裡放的是給的那 32 bytes，鑰匙是 `6cb4fc97fadfb1b5789476ffe91b13f642458597b69b87056dea97b61e56d5b4`，box 在 `01` 和 nonce 之後是 `bb4113dee6e0799c425c8973f940b5cbe70a567d9b8be2bc19e146faed7377159d1b18097924a880b0cb5a1ae9be208e`

#### Scenario: 輸入是一大塊 bytes 裡的一段

- **WHEN** 第一個 scenario 的私鑰、公開金鑰、情境、nonce 和內容，和第二個 scenario 的 salt，各是一塊較大的 bytes 中間的一段
- **THEN** box 和那兩個 scenario 的一樣

### Requirement: SHARING-9.1 收受方打得開 box

WHEN 收受方用自己的 box 私鑰、交出方的 box 公開金鑰，和裝 box 時的情境和 salt 打開 box，the domain package SHALL 回傳裝進去的內容；鑰匙照 SHARING-8.1 導出，info 裡交出方的公開金鑰是呼叫者給的那 32 bytes，收受方的是這把私鑰的公開金鑰。

#### Scenario: Bob 打開 Alice 的 box

- **WHEN** Bob 用自己的私鑰、Alice 的公開金鑰和情境 `a0a1a2a3a4a5a6a7`，打開 SHARING-8.1 第一個 scenario 的 box；再加上那段 salt，打開第二個 scenario 的 box
- **THEN** 兩次都得到 `101112131415161718191a1b1c1d1e1f202122232425262728292a2b2c2d2e2f`

#### Scenario: 沒給 salt 和 32 個 0x00 是同一段 salt

- **WHEN** Bob 打開第一個 scenario 的 box 時，salt 給 32 個 `0x00`
- **THEN** 一樣打得開

#### Scenario: 各種內容、情境和 salt

- **WHEN** 另外兩支手機之間裝 0、32 和 1,000 bytes 的內容，情境是空的、8 bytes 或 100 bytes，有 salt 或沒有，再由收受方照樣打開
- **THEN** 每次都得到裝進去的內容

#### Scenario: RFC 7748 5.2 的兩個向量

- **WHEN** 收受方的私鑰是 5.2 一個向量的 scalar，交出方的公開金鑰是它的 u，box 是拿它列出的結果當共享密鑰、照 SHARING-8.1 做出來的
- **THEN** 兩個向量的 box 都打得開；第二個向量的 u 最高的 bit 是 1，照樣打得開

#### Scenario: 輸入是一大塊 bytes 裡的一段

- **WHEN** Bob 打開 SHARING-8.1 第二個 scenario 的 box 時，私鑰、公開金鑰、情境、salt 和 box 各是一塊較大的 bytes 中間的一段
- **THEN** 一樣打得開

### Requirement: SHARING-10.1 打不開的 box

IF 要打開的 box 是空的，或格式版本是 `0x01` 但打開時的私鑰不是收受方的、給的交出方公開金鑰不是交出方的、情境或 salt 和裝的時候不同，或 box 被改過，THEN the domain package SHALL 回報解不開，不回傳任何內容。

#### Scenario: 別支手機

- **WHEN** 第三支手機用自己的私鑰和 Alice 的公開金鑰，打開 Alice 裝給 Bob 的 box
- **THEN** 回報解不開

#### Scenario: 交出方對不上

- **WHEN** Bob 打開 Alice 裝給他的 box，給的交出方公開金鑰卻是第三支手機的、Bob 自己的、和 Alice 的差任何一個 bit 的，或是 0、31 或 33 bytes
- **THEN** 都回報解不開

#### Scenario: 方向對調

- **WHEN** Alice 用自己的私鑰和 Bob 的公開金鑰，把她裝給 Bob 的 box 當成 Bob 裝給她的來打開
- **THEN** 回報解不開

#### Scenario: 情境不同

- **WHEN** Bob 打開時給的情境和裝的時候差任何一個 bit、少最後一個 byte、多一個 byte，或是空的
- **THEN** 都回報解不開

#### Scenario: salt 不同

- **WHEN** 裝的時候有 salt，打開時沒給，或給的 salt 差任何一個 bit；或裝的時候沒有 salt，打開時給了一段不是 32 個 `0x00` 的 salt
- **THEN** 都回報解不開

#### Scenario: box 被改過

- **WHEN** 把 box 裡格式版本之後的任何一個 bit 改掉、去掉最後一個 byte、在最後多加一個 byte、只留前 41 bytes、只留前 40 bytes 或只留 `01`，Bob 再照原樣打開；或打開 0 bytes
- **THEN** 都回報解不開

### Requirement: SHARING-11.1 低階的 box 公開金鑰

IF 對方的 box 公開金鑰是 X25519 的低階點，也就是它和任何 box 私鑰的共享密鑰都是 32 個 `0x00`，THEN the domain package SHALL 拒絕對它裝 box，並在打開聲稱由它交出、格式版本是 `0x01` 的 box 時回報解不開。

#### Scenario: 七個低階點

- **WHEN** 對方的公開金鑰是 `0000000000000000000000000000000000000000000000000000000000000000`、`0100000000000000000000000000000000000000000000000000000000000000`、`e0eb7a7c3b41b8ae1656e3faf19fc46ada098deb9c32b1fd866205165f49b800`、`5f9c95bca3508c24b1d0b1559c83ef5b04445cc4581c8e86d8224eddd09f1157`、`ecffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff7f`、`edffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff7f` 或 `eeffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff7f`
- **THEN** 對它裝 box 被拒絕；拿 32 個 `0x00` 當共享密鑰、照 SHARING-8.1 做出一個聲稱由它交出的 box，Bob 指定它是交出方來打開時，回報解不開

#### Scenario: 最高的 bit 不算

- **WHEN** 對方的公開金鑰是上面七個把最後一個 byte 最高的 bit 設成 1 的寫法：`0000000000000000000000000000000000000000000000000000000000000080`、`0100000000000000000000000000000000000000000000000000000000000080`、`e0eb7a7c3b41b8ae1656e3faf19fc46ada098deb9c32b1fd866205165f49b880`、`5f9c95bca3508c24b1d0b1559c83ef5b04445cc4581c8e86d8224eddd09f11d7`、`ecffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff`、`edffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff` 或 `eeffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff`
- **THEN** 結果和上一個 scenario 一樣；這十四個就是共享密鑰一定是 32 個 `0x00` 的所有 32 bytes

### Requirement: SHARING-12.1 從密鑰材料和用途導出金鑰

WHEN 從一段密鑰材料和一個用途導出金鑰，the domain package SHALL 回傳 HKDF-SHA-256 輸出的前 32 bytes：IKM 是密鑰材料，info 是用途，salt 是給的 salt、沒給時是 32 個 `0x00`，密鑰材料或用途是字串時用它的 UTF-8 編碼，所以同樣的輸入得到同樣的金鑰，不同的用途得到不同的金鑰。

#### Scenario: 同樣的輸入

- **WHEN** 從字串 `example-link-secret` 和用途 `example/card` 導出金鑰兩次
- **THEN** 兩次都是 `a5337fd9990df31b2111febc0f48a24fd4892e5fcb4cdedff0e9213f7176b799`

#### Scenario: 不同的用途

- **WHEN** 從同一個字串和用途 `example/request` 導出金鑰
- **THEN** 是 `31c14db8bd56df80d7e79ff66529f475099cce47e513d4fdad8c6d47ae9ba6f0`

#### Scenario: 字串照原樣使用

- **WHEN** 密鑰材料是 `example-link-secreT`、`Example-link-secret`，或後面多一個空白的 `example-link-secret `，用途都是 `example/card`
- **THEN** 金鑰分別是 `82600dd65ee80e1cf5f9a1ee1440de88ef48b0ab8091c3c452adc63d98987539`、`99e4b8631a0fa8580147025637d471ea514a08a8849d909014576aef669ff836` 和 `a4bfa89d64ca61b6a41c17e466c47b501020f63a7c29214001ce41b08b0033bb`

#### Scenario: 字串用 UTF-8

- **WHEN** 密鑰材料是字串 `換機碼é`，或是它的 UTF-8 編碼 `e68f9be6a99fe7a2bcc3a9` 這 11 bytes，用途是 `example/bundle`
- **THEN** 金鑰都是 `08e209d7918f22b4aba83920f3f4925c612c1f9a9ecc5efd08862d88615c26a0`

#### Scenario: 密鑰材料是 bytes

- **WHEN** 密鑰材料是 `000102…1e1f` 這 32 bytes，用途是 `example/signing`
- **THEN** 金鑰是 `0034950fd14d8a2753e83477d00dd8ecd0aa4041ac51f2a4a5c84fbc49603273`

#### Scenario: 空的密鑰材料

- **WHEN** 密鑰材料是空字串，用途是 `example/card`
- **THEN** 金鑰是 `8d928ff6ef426b24d041696a57bd669f55b20c81953e9950c168afc422067761`

#### Scenario: 加上 salt

- **WHEN** 從 `example-link-secret` 和用途 `example/card` 導出金鑰，salt 是 `505152…6e6f` 這 32 bytes
- **THEN** 金鑰是 `2a51033a3d1bd337fe455a90b9a9574f22e11a9bc52347e5bda07f94eb64799f`

#### Scenario: 輸入是一大塊 bytes 裡的一段

- **WHEN** RFC 5869 A.1 的 IKM、salt 和 info 各是一塊較大的 bytes 中間的一段
- **THEN** 金鑰一樣是 `3cb25f25faacd57a90434f64d0362f2a2d2d0a90cf1a5a4c5db02d56ecc4c5bf`

### Requirement: SHARING-13.1 每個演算法都通過標準測試向量

The domain package SHALL 對每個演算法的標準測試向量給出標準列出的結果：XChaCha20-Poly1305 是 draft-irtf-cfrg-xchacha-03 的 A.3.1，Ed25519 是 RFC 8032 7.1 的五個測試，X25519 是 RFC 7748 5.2 的兩個單次向量、迭代一次的結果和 6.1，HKDF-SHA-256 是 RFC 5869 的 A.1 到 A.3。

#### Scenario: XChaCha20-Poly1305

- **WHEN** 用 A.3.1 的鑰匙、nonce 和附加資料加密它的明文，再解密結果
- **THEN** 密文在 `01` 和 nonce 之後是 A.3.1 列出的密文和驗證碼 `c0875924c1c7987947deafd8780acf49`，解密得到原本的明文

#### Scenario: Ed25519

- **WHEN** 用 TEST 1、TEST 2、TEST 3、TEST 1024 和 TEST SHA(abc) 的私鑰算公開金鑰，並簽各自的訊息
- **THEN** 公開金鑰和簽名都和 RFC 列出的一樣，例如 TEST 1 簽 0 bytes 的訊息得到 `e5564300c360ac729086e2cc806e828a84877f1eb8e5d974d873e065224901555fb8821590a33bacc61e39701cf9b46bd25bf5f0595bbe24655141438e7a100b`

#### Scenario: X25519 的 5.2

- **WHEN** 拿 5.2 兩個單次向量的 scalar 當 box 私鑰、u 當對方的公開金鑰，裝一個 box，也打開一個對方裝的 box
- **THEN** box 的鑰匙都出自 RFC 列出的結果 `c3da55379de9c6908e94ea4df28d084f32eccf03491c71f754b4075577a28552` 和 `95cbde9476e8907d7aade45cb4b873f88b595a68799fa152e6f8f7647aac7957`（SHARING-8.1、9.1 的 scenario）

#### Scenario: X25519 迭代一次

- **WHEN** 從 box 私鑰 `0900000000000000000000000000000000000000000000000000000000000000` 算公開金鑰
- **THEN** 是 5.2 列出的迭代一次的結果 `422c8e7a6227d7bca1350b3e2bb7279f7897b87bb6854b783c60e80311ae3079`；迭代 1,000 次和 1,000,000 次要直接算 X25519，工具沒有這個函式，不在這條裡

#### Scenario: X25519 的 6.1

- **WHEN** 從 6.1 的兩把私鑰算公開金鑰，由 Alice 裝一個 box 給 Bob，再由 Bob 打開
- **THEN** 公開金鑰和 RFC 列出的一樣，box 的鑰匙出自 RFC 列出的共享密鑰 `4a5d9d5ba4ce2de1728e3bf480350f25e07e21c947d19e3376f09b3c1e161742`（SHARING-8.1 的第一個 scenario），Bob 打得開

#### Scenario: HKDF-SHA-256

- **WHEN** 把 A.1、A.2 和 A.3 的 IKM 當密鑰材料、info 當用途，連同各自的 salt 導出金鑰
- **THEN** 金鑰是各自列出的 OKM 的前 32 bytes：`3cb25f25faacd57a90434f64d0362f2a2d2d0a90cf1a5a4c5db02d56ecc4c5bf`、`b11e398dc80327a1c8e7f78c596a49344f012eda2d4efad8a050cc4c19afa97c` 和 `8da4e775a563c18f715f802a063c5a31b8a11f5c5ee1879ec3454e5f3c738d2d`

### Requirement: SHARING-14.1 鑰匙、私鑰、nonce 和 salt 只來自呼叫者

The domain package SHALL 只把呼叫者交給它的 bytes 當鑰匙、私鑰、nonce 和 salt，自己不產生任何一個：同樣的輸入每次都得到同樣的結果，在沒有 Web Crypto、Node 的 `crypto` 模組和 `Buffer` 的執行環境（例如 Hermes）也算得出同樣的結果，而且任何時候都不使用 `Math.random`。

#### Scenario: 同樣的輸入

- **WHEN** 用同樣的輸入各做三次加密、裝 box、簽名、算兩種公開金鑰和導出金鑰
- **THEN** 每次的結果一模一樣，而且沒有呼叫 `Math.random`

#### Scenario: 像 Hermes 的執行環境

- **WHEN** 執行環境從載入工具之前就沒有 Web Crypto 和 `Buffer`，匯入 Node 的 `crypto` 模組會失敗，再做上面每一件事，以及解密和打開 box
- **THEN** 結果都和上面各個 scenario 列出的一樣，而且沒有呼叫 `Math.random`

#### Scenario: 像 Hermes 的執行環境裡的 Ed25519

- **WHEN** 在同樣的執行環境，用 RFC 8032 7.1 五個測試的私鑰算公開金鑰，並簽各自的訊息
- **THEN** 公開金鑰和簽名都和 RFC 列出的一樣，Web Crypto 的 `Ed25519` 也驗得過這些簽名

### Requirement: SHARING-15.1 長度不對的鑰匙、私鑰、nonce 和 salt

IF 交給工具的鑰匙或私鑰不是 32 bytes、nonce 不是 24 bytes、裝或打開 box 時給的 salt 不是 32 bytes，或裝 box 時收受方的公開金鑰不是 32 bytes，THEN the domain package SHALL 拒絕，不管其他的輸入是什麼。

#### Scenario: 鑰匙

- **WHEN** 加密或解密時給 0、16、31 或 33 bytes 的鑰匙
- **THEN** 被拒絕；要解密的是空的 bytes 或格式版本不認得的密文時也一樣

#### Scenario: nonce

- **WHEN** 加密或裝 box 時給 0、12、23 或 25 bytes 的 nonce
- **THEN** 被拒絕

#### Scenario: 私鑰

- **WHEN** 簽名、算兩種公開金鑰、裝 box 或打開 box 時給 0、31、33 或 64 bytes 的私鑰
- **THEN** 被拒絕；要打開的是空的 bytes 或格式版本不認得的 box 時也一樣

#### Scenario: salt

- **WHEN** 裝或打開 box 時給 0、16、31 或 33 bytes 的 salt
- **THEN** 被拒絕；要打開的是空的 bytes 或格式版本不認得的 box 時也一樣

#### Scenario: 收受方的公開金鑰

- **WHEN** 裝 box 時給 0、31 或 33 bytes 的收受方公開金鑰
- **THEN** 被拒絕

### Requirement: SHARING-16.1 不是 bytes 的輸入

IF 交給工具的鑰匙、私鑰、公開金鑰、nonce、內容、附加資料、情境、要解密的密文或要打開的 box 不是 bytes（沒給或是 `null` 也算），給了的 salt 不是 bytes，或導出金鑰的密鑰材料或用途既不是 bytes 也不是字串，THEN the domain package SHALL 拒絕，不管其他的輸入是什麼。

#### Scenario: 一樣長、但不是 bytes

- **WHEN** 加密、解密、簽名、算兩種公開金鑰、裝 box 或打開 box 時，把任何一個輸入換成一樣長的數字陣列、`Uint16Array`、字串，或只有 `length` 的物件
- **THEN** 都被拒絕

#### Scenario: 沒給或是 null

- **WHEN** 加密、解密、簽名、算兩種公開金鑰、裝 box 或打開 box 時，salt 以外的任何一個輸入沒給或是 `null`，或 salt 是 `null`
- **THEN** 都被拒絕；所以加密不會產出沒綁附加資料的密文，解密也不會把沒給的附加資料當成空的

#### Scenario: salt 是 undefined

- **WHEN** 裝 box、打開 box 或導出金鑰時，salt 是 `undefined`
- **THEN** 和沒給 salt 一樣（SHARING-8.1、9.1、12.1）

#### Scenario: 解密和打開 box 不把它當成解不開

- **WHEN** 解密時鑰匙、密文或附加資料是數字陣列，或打開 box 時私鑰、交出方的公開金鑰、情境、salt 或 box 是數字陣列，內容和 SHARING-2.1、9.1 解得開的那些 bytes 一樣
- **THEN** 被拒絕，不是回報解不開，也不回傳內容

#### Scenario: 先於格式版本和空的輸入

- **WHEN** 密文的第一個 byte 是 `02` 而附加資料是數字陣列，box 的第一個 byte 是 `02` 而情境是數字陣列，或 box 是 0 bytes 而交出方的公開金鑰是數字陣列
- **THEN** 都被拒絕

#### Scenario: 導出金鑰

- **WHEN** 密鑰材料或用途是數字陣列、`Uint16Array`、數字、只有 `length` 的物件、`null`，或沒給；或 salt 是字串、數字陣列或 `null`
- **THEN** 都被拒絕，沒給的用途不會被當成空的用途；密鑰材料和用途是字串或 bytes 時照 SHARING-12.1

### Requirement: SHARING-17.1 要簽的 bytes 是七行 ASCII 文字

WHEN 替一個請求組出要簽的 bytes，the domain package SHALL 回傳七行文字的 ASCII bytes，行和行之間是一個 `0x0a`，最後一行之後沒有：依序是 `shared-expense/request/v1`、方法、路徑、內容雜湊的 64 個小寫十六進位字元、裝置 ID、請求時間的十進位寫法（沒有正負號、小數點和多餘的 0），和請求的 nonce；交給它的內容雜湊不會被改動。

#### Scenario: 註冊的請求

- **WHEN** 方法是 `POST`，路徑是 `/devices`，內容雜湊是 `6909fde5637134de28fc345ef65c422aeb3133035e2dcf77fd56b044348bf87b`，裝置 ID 是 `0f8fad5b-d9cb-469f-a165-70867728950e`，請求時間是 1794983520000，請求的 nonce 是 `000102030405060708090a0b0c0d0e0f`
- **THEN** 得到 188 bytes，是這七行的 ASCII，中間各隔一個 `0x0a`：`shared-expense/request/v1`、`POST`、`/devices`、`6909fde5637134de28fc345ef65c422aeb3133035e2dcf77fd56b044348bf87b`、`0f8fad5b-d9cb-469f-a165-70867728950e`、`1794983520000`、`000102030405060708090a0b0c0d0e0f`

#### Scenario: 沒有內容、有查詢的請求

- **WHEN** 方法是 `GET`，路徑是 `/example/items?after=41&limit=100`，內容雜湊是 0 bytes 的 SHA-256 `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`，裝置 ID 和請求時間同上，請求的 nonce 是 `a0a1a2a3a4a5a6a7a8a9aaabacadaeaf`
- **THEN** 第二行是 `GET`，第三行是 `/example/items?after=41&limit=100` 整段，第四行是 `e3b0c442…7852b855` 那 64 個字元，最後一行是這個 nonce

#### Scenario: 請求時間最小和最大

- **WHEN** 請求時間是 0，或 9007199254740991
- **THEN** 第六行是 `0`，或 `9007199254740991`

#### Scenario: 每個欄位都算在裡面

- **WHEN** 把第一個 scenario 的方法換成 `PUT`、路徑換成 `/devices?x=1`、內容雜湊改掉一個 bit、裝置 ID 換成 `7c9e6679-7425-40de-944b-e07fc1f90ae7`、請求時間換成 1794983520001，或 nonce 換成 `000102030405060708090a0b0c0d0e10`，一次換一個
- **THEN** 每次得到的 bytes 都和第一個 scenario 的不同

#### Scenario: 輸入是一大塊 bytes 裡的一段

- **WHEN** 第一個 scenario 的內容雜湊是一塊較大的 bytes 中間的一段
- **THEN** 得到的 bytes 和第一個 scenario 的一樣

### Requirement: SHARING-18.1 寫法不對的欄位組不出要簽的 bytes

IF 方法不是一個以上的大寫英文字母，路徑的寫法不對，內容雜湊不是 32 bytes，裝置 ID 不是小寫的第 4 版 UUID，請求時間不是 0 到 9,007,199,254,740,991 之間的整數，或請求的 nonce 不是 32 個小寫十六進位字元，THEN the domain package SHALL 拒絕，所以每一行裡都沒有換行，兩個不同的請求組不出同樣的 bytes。路徑的寫法是：`/` 開頭的文字；第一個 `?` 之前只有英文字母、數字和 `-`、`.`、`_`、`~`、`/`，沒有連續的兩個 `/`，用 `/` 隔開的每一段都不是 `.` 或 `..`；有 `?` 時，它後面至少有一個字元，而且只有英文字母、數字和 `-`、`.`、`_`、`~`、`/`、`%`、`?`、`=`、`&`。別的寫法在送出或收到時可能被改寫，例如空白、引號和 `..`。

#### Scenario: 方法

- **WHEN** 方法是 `get`、`Get`、空的文字、後面多一個空白的 `GET `、`G-T`、中間有換行的 `GET` 和 `POST`，或不是文字
- **THEN** 都被拒絕

#### Scenario: 路徑

- **WHEN** 路徑是空的文字、`devices`、`/a b`、中間有換行或 tab 的 `/a` 和 `b`、`/帳本`，或不是文字
- **THEN** 都被拒絕

#### Scenario: 會被改寫的路徑

- **WHEN** 路徑是 `/a//b`、`//a`、`/a/./b`、`/a/../b`、`/a/..`、`/.`、`/a%20b`、`/a%2e%2e/b`、`/a'b`、`/a"b`、`/a<b`、`/a{b}`、`/a|b`、`/a\b`、`/a#b`、`/a+b`、`/a?`，或查詢是 `?x='1'`、`?x=a b`、`?x=a#b`、`?x=a+b`
- **THEN** 都被拒絕

#### Scenario: 可以用的路徑

- **WHEN** 路徑是 `/`、`/devices`、`/a/`、`/a.b/c-d_e~f`、`/.well-known/x`、`/a/.../b`、`/a?x=1&y=%E5%B8%B3`、`/a?x=/b/../c?d`
- **THEN** 都組得出要簽的 bytes，第三行就是這段路徑

#### Scenario: 內容雜湊

- **WHEN** 內容雜湊是 0、31 或 33 bytes，是 64 個十六進位字元的文字，是 32 個數字的陣列，或沒給
- **THEN** 都被拒絕

#### Scenario: 裝置 ID

- **WHEN** 裝置 ID 是大寫的 `0F8FAD5B-D9CB-469F-A165-70867728950E`、第 1 版的 `0f8fad5b-d9cb-169f-a165-70867728950e`、變體不對的 `0f8fad5b-d9cb-469f-c165-70867728950e`、沒有連字號的 `0f8fad5bd9cb469fa16570867728950e`、後面多一個換行的 UUID、`phone-a`、空的文字，或不是文字
- **THEN** 都被拒絕

#### Scenario: 請求時間

- **WHEN** 請求時間是 -1、1.5、9007199254740992、不是數字的值（NaN）、無限大，或文字 `1794983520000`
- **THEN** 都被拒絕

#### Scenario: 請求的 nonce

- **WHEN** 請求的 nonce 是 31 或 33 個十六進位字元、大寫的 `000102030405060708090A0B0C0D0E0F`、最後一個字元是 `g`、後面多一個換行，或是 16 bytes 而不是文字
- **THEN** 都被拒絕

### Requirement: SHARING-19.1 送請求之前沒有裝置身分，也不連網路

The mobile app SHALL 在第一次送請求之前沒有裝置身分，也不發出任何網路請求：本機資料沒有裝置 ID，secure store 裡沒有 app 寫的項目。讀裝置身分和時間差不會產生裝置身分。

#### Scenario: 在新手機上記帳

- **WHEN** 在一支新手機上打開 app，新增一筆個人支出，再重新啟動 app
- **THEN** app 沒有發出任何網路請求，secure store 是空的，這支手機沒有裝置身分

#### Scenario: 讀裝置身分

- **WHEN** 在沒有裝置身分的手機上讀裝置身分和時間差
- **THEN** 得知沒有裝置身分，時間差是 0；沒有發出網路請求，secure store 仍是空的

### Requirement: SHARING-20.1 第一次送請求時產生裝置身分

WHEN 沒有裝置身分的手機要送請求，the mobile app SHALL 先產生裝置身分：裝置 ID 是 `expo-crypto` 的 `randomUUID` 給的，seed 是 `expo-crypto` 的 `getRandomValues` 或 `getRandomBytesAsync` 給的 32 bytes，不用 `expo-crypto` 的 `getRandomBytes` 和 `Math.random`，在沒有 Web Crypto 和 `Buffer` 的執行環境（例如 Hermes）也照樣產生；seed 存進 secure store 的一個項目，項目的名稱裡有裝置 ID，設定成第一次解鎖之後讀得到、只留在這支手機（`AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY`），讀它不必經過使用者驗證；裝置 ID 存進本機資料。seed 和簽名私鑰都不寫進本機資料。已經有裝置身分的手機不再產生，幾個請求同時要送時也只產生一個。

#### Scenario: 新手機第一次送請求

- **WHEN** 沒有裝置身分的手機送一個請求
- **THEN** 這支手機有裝置身分，裝置 ID 是 `randomUUID` 給的那一個；secure store 裡剛好有一個項目，名稱裡有這個裝置 ID，是用 `AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY` 存的，沒有要求使用者驗證；過程中沒有用到 `getRandomBytes` 和 `Math.random`，執行環境沒有 Web Crypto 和 `Buffer`

#### Scenario: seed 不在本機資料裡

- **WHEN** 手機產生了裝置身分，也送過請求
- **THEN** 在本機資料的檔案裡找不到 seed 和簽名私鑰，不論是原始的 bytes、十六進位還是 Base64

#### Scenario: 已經有裝置身分

- **WHEN** 有裝置身分的手機再送兩個請求，重新啟動 app 之後又送一個
- **THEN** 每個請求的裝置 ID 都是原本的那一個，secure store 裡仍只有那一個項目

#### Scenario: 同時送兩個請求

- **WHEN** 沒有裝置身分的手機同時送兩個請求
- **THEN** 兩個請求的裝置 ID 相同，secure store 裡只有一個項目

### Requirement: SHARING-21.1 簽名私鑰從 seed 導出

The mobile app SHALL 用從 seed 導出的金鑰當簽名私鑰：密鑰材料是 seed，用途是 `shared-expense/device/signing/v1`，不給 salt（SHARING-12.1）；註冊時交給 API 的，是這把私鑰的公開金鑰（SHARING-5.1）。

#### Scenario: 已知的 seed

- **WHEN** `expo-crypto` 給的 seed 是 `000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f`，手機第一次送請求
- **THEN** 註冊的請求帶的公開金鑰是 `6fd0e31e547724487390b224a27934039e75568c032ed392a162b0537e9217f8`，也就是簽名私鑰 `bdbb0a00ab23997ad90a4549a3b99cef1eb93f42150a20916a56f85bd31dcf81` 的公開金鑰

#### Scenario: 別的 seed

- **WHEN** `expo-crypto` 給的 seed 是別的 32 bytes
- **THEN** 註冊的請求帶的公開金鑰，是照同樣的方法從那個 seed 算出來的，和上面的不同

### Requirement: SHARING-22.1 送請求之前先註冊

WHEN 手機要送請求，而 API 還沒回答過這個裝置身分註冊好了，the mobile app SHALL 先送註冊的請求：對 `/devices` 的 `POST`，內容帶著這支手機的公開金鑰，和其他請求一樣簽名（SHARING-25.1）；API 回答註冊好了，才送原本的請求，並把註冊好了記在本機資料，之後不再註冊，重新啟動 app 之後也一樣。

#### Scenario: 第一次送請求

- **WHEN** 沒有裝置身分的手機送對 `/example/items` 的 `GET`
- **THEN** API 依序收到兩個請求：對 `/devices` 的 `POST`，內容帶著這支手機的公開金鑰；然後是對 `/example/items` 的 `GET`。兩個的裝置 ID 相同

#### Scenario: 之後的請求

- **WHEN** 註冊好了的手機再送一個請求
- **THEN** API 只收到這個請求，沒有再收到註冊的請求

#### Scenario: 重新啟動之後

- **WHEN** 註冊好了的手機重新啟動 app，再送一個請求
- **THEN** API 只收到這個請求

### Requirement: SHARING-23.1 註冊沒成功時留著同一個裝置身分

IF 註冊的請求沒有得到回應，或 API 的回應不是註冊好了，THEN the mobile app SHALL 不送原本的請求，告訴呼叫的一方沒有得到回應，或沒註冊成和 API 的回應，並留著同一個裝置身分：下一次要送請求時，用同一個裝置 ID 和公開金鑰再註冊，不產生第二個裝置身分。註冊的請求和其他請求一樣，自己不再送（SHARING-26.1）。

#### Scenario: 沒有網路

- **WHEN** 沒有裝置身分的手機在沒有網路時送一個請求，網路恢復之後再送一次
- **THEN** 第一次得知沒有得到回應，這支手機已經有裝置身分；第二次 API 收到註冊的請求和原本的請求，裝置 ID 和公開金鑰是第一次產生的那一組，secure store 裡只有一個項目

#### Scenario: API 存下了，回應卻沒送到

- **WHEN** 註冊的請求到了 API，回應在路上丟了，之後手機再送一次請求
- **THEN** 第一次得知沒有得到回應，原本的請求沒有送出；第二次手機用同一個裝置 ID 和公開金鑰再註冊，API 回答註冊好了，原本的請求才送出

#### Scenario: API 拒絕註冊

- **WHEN** API 因為註冊太多拒絕註冊的請求
- **THEN** 原本的請求沒有送出，呼叫的一方得知沒註冊成，也拿到 API 的回應；這支手機的裝置身分不變，下一次送請求時用它再註冊

#### Scenario: 回應不是註冊好了

- **WHEN** API 對註冊的請求回應 500、404，或回應 200 而內容不是註冊好了
- **THEN** 原本的請求沒有送出，呼叫的一方得知沒註冊成，也拿到這個回應；下一次送請求時手機再註冊

#### Scenario: 重新啟動之後再試

- **WHEN** 註冊沒有得到回應，重新啟動 app，再送一個請求
- **THEN** 註冊的請求用的是同一個裝置 ID 和公開金鑰

### Requirement: SHARING-24.1 裝置身分沒存好，就當成沒有

IF 產生裝置身分時 seed 存不進 secure store，或裝置 ID 存不進本機資料，THEN the mobile app SHALL 讓這次送請求失敗，不發出任何網路請求，本機資料沒有裝置 ID：這支手機仍是沒有裝置身分，不是授權失效，下一次要送請求時重新產生。secure store 裡名稱沒有本機資料的裝置 ID 的項目，app 一律不用。

#### Scenario: seed 存不進去

- **WHEN** secure store 寫不進去時，沒有裝置身分的手機送一個請求
- **THEN** 送請求失敗，沒有發出網路請求，這支手機沒有裝置身分；secure store 恢復之後再送，就產生裝置身分、註冊並送出

#### Scenario: 裝置 ID 存不進去

- **WHEN** 本機資料寫不進去時，沒有裝置身分的手機送一個請求
- **THEN** 送請求失敗，沒有發出網路請求，這支手機沒有裝置身分，不是授權失效；本機資料恢復之後再送，就產生裝置身分、註冊並送出，secure store 裡名稱有這個裝置 ID 的項目只有一個

#### Scenario: 之前安裝留下的項目

- **WHEN** secure store 裡有之前安裝留下的項目，是別的裝置 ID 和它的 seed，本機資料沒有裝置 ID
- **THEN** 這支手機沒有裝置身分；第一次送請求時產生新的裝置 ID 和 seed，註冊的公開金鑰不是從留下的那個 seed 算出來的，留下的項目沒有被改

### Requirement: SHARING-25.1 每個請求都簽名

WHEN 手機 app 把一個請求送給 API，註冊的請求和再送一次的請求也算，the mobile app SHALL 讓它是簽名的請求，送到呼叫的一方給的 API 網址加上路徑：要簽的 bytes 照 SHARING-17.1，用這個請求的方法、路徑、送出的內容的雜湊、這支手機的裝置 ID、簽名當下校正後的時間，和一個新的請求 nonce；nonce 是 `expo-crypto` 的 `getRandomValues` 或 `getRandomBytesAsync` 給的 16 bytes，每送一次換一個；簽名是簽名私鑰對這些 bytes 的簽名（SHARING-6.1）。在沒有 Web Crypto 和 `Buffer` 的執行環境（例如 Hermes）也一樣。呼叫的一方給的方法或路徑寫法不對（SHARING-18.1）時，送請求失敗，不產生裝置身分，也不發出任何網路請求。

#### Scenario: 沒有內容的 GET

- **WHEN** 執行環境沒有 Web Crypto 和 `Buffer`，有裝置身分的手機在 T 送對 `/example/items?after=41&limit=100` 的 `GET`，沒有內容
- **THEN** API 在 `https://api.example.test/example/items?after=41&limit=100` 收到 `GET`，沒有內容；它帶著這支手機的裝置 ID、請求時間 1794983520000、一個 `expo-crypto` 給的 nonce，和用 Web Crypto 的 `Ed25519`、這支手機的公開金鑰驗得過的簽名，簽的是這個方法、路徑、0 bytes 的內容雜湊和這三個欄位

#### Scenario: 有內容的 POST

- **WHEN** 手機送對 `/example/items` 的 `POST`，內容是 `00ff10`、1,000 bytes 或 262,144 bytes
- **THEN** API 收到的內容和交來的一樣，簽的內容雜湊是這些 bytes 的 SHA-256

#### Scenario: 內容是文字

- **WHEN** 手機送的內容是文字 `{"note":"晚餐 🍜 é"}`
- **THEN** API 收到的內容是它的 UTF-8 編碼，簽的內容雜湊是這些 bytes 的 SHA-256

#### Scenario: 每次的 nonce 都不同

- **WHEN** 手機連續送五個一模一樣的請求
- **THEN** 五個請求的 nonce 都不同，註冊的請求用的也不同，每一個都是 `expo-crypto` 給的

#### Scenario: 簽名當下的時間

- **WHEN** 手機在 T 送一個請求，在 T+90,000 再送一個
- **THEN** 兩個請求的請求時間分別是 1794983520000 和 1794983610000

#### Scenario: 方法或路徑的寫法不對

- **WHEN** 沒有裝置身分的手機，或註冊好了的手機，送方法是 `get` 的請求，或路徑是 `example/items`、`/a b`、`/a'b`、`/a//b`、`/a/../b` 或 `/a?` 的請求
- **THEN** 送請求失敗，沒有發出網路請求；沒有裝置身分的手機仍然沒有裝置身分

### Requirement: SHARING-26.1 請求的結果原樣交給呼叫的一方

WHEN 手機 app 送出的請求有了結果，the mobile app SHALL 把結果原樣交給呼叫的一方，自己不再送：API 回應了，就交出回應的狀態碼和內容，不論狀態碼是什麼、是不是拒絕；沒有得到回應，就告訴呼叫的一方沒有得到回應。只有 SHARING-27.1 和 28.1 的情況會再送一次。

#### Scenario: API 回應了

- **WHEN** API 對一個請求回應狀態碼 200 和內容 `{"items":[]}`，對另一個回應 404 和 `not found`，對第三個回應 500 和空的內容
- **THEN** 呼叫的一方分別拿到這三個狀態碼和內容，每個請求 API 都只收到一次

#### Scenario: 內容不是文字

- **WHEN** API 回應的內容是 `00ff80fe0a0d` 這 6 bytes
- **THEN** 呼叫的一方拿到一模一樣的 6 bytes

#### Scenario: API 因為簽名或重送拒絕

- **WHEN** API 因為簽名，或因為重送，拒絕一個請求
- **THEN** 呼叫的一方拿到這個拒絕的狀態碼和內容，API 只收到這個請求一次

#### Scenario: 沒有得到回應

- **WHEN** 註冊好了的手機在沒有網路時送一個請求
- **THEN** 呼叫的一方得知沒有得到回應，手機只試了一次

### Requirement: SHARING-27.1 時鐘不準時照 API 的時間校正，再送一次

IF API 因為時鐘拒絕手機送的請求，而回應帶著 API 的時間，THEN the mobile app SHALL 把時間差改成 API 的時間減掉手機這時的時鐘，存在本機資料，再用校正後的時間和新的請求 nonce 重新簽名，把這個請求再送一次。之後的請求都用校正後的時間簽名，重新啟動 app 之後也一樣。同一個請求只因為時鐘再送一次：再送的那一次又因為時鐘被拒絕時，照樣改時間差，然後把這個回應交給呼叫的一方。註冊的請求也照這一條。回應帶的 API 的時間不是 0 到 9,007,199,254,740,991 之間的整數時，不改時間差，也不再送。

#### Scenario: 手機慢一小時

- **WHEN** 手機的時鐘是 T，API 的時間是 T+3,600,000，註冊好了的手機送一個請求
- **THEN** API 先收到請求時間是 T 的請求並因為時鐘拒絕，再收到請求時間是 T+3,600,000、nonce 不同的同一個請求；呼叫的一方拿到第二次的回應，時間差是 3,600,000

#### Scenario: 手機快一小時

- **WHEN** 手機的時鐘是 T，API 的時間是 T-3,600,000，註冊好了的手機送一個請求
- **THEN** 第二次的請求時間是 T-3,600,000，時間差是 -3,600,000

#### Scenario: 之後的請求

- **WHEN** 時間差是 3,600,000，手機的時鐘走到 T+60,000 時再送一個請求
- **THEN** API 只收到一次，請求時間是 T+3,660,000

#### Scenario: 第一個請求就不準

- **WHEN** 沒有裝置身分的手機比 API 慢一小時，送一個請求
- **THEN** API 依序收到：被拒絕的註冊、請求時間校正過的註冊、請求時間校正過的原本的請求；呼叫的一方拿到原本的請求的回應

#### Scenario: 再送還是被拒絕

- **WHEN** API 第一次回應的時間是 T+3,600,000，再送的那一次又因為時鐘被拒絕，這次回應的時間是 T+7,200,000
- **THEN** API 只收到這個請求兩次，呼叫的一方拿到第二個拒絕，時間差是 7,200,000

#### Scenario: 時鐘後來調準了

- **WHEN** 時間差是 3,600,000 的手機把時鐘調成和 API 一樣，再送一個請求
- **THEN** 第一次的請求時間比 API 的時間晚一小時，被拒絕；再送的那一次通過，時間差變成 0

#### Scenario: 回應沒有帶對的時間

- **WHEN** API 因為時鐘拒絕，回應裡 API 的時間不見了、是文字 `soon`、是 -1 或是 1.5
- **THEN** 手機沒有再送，時間差不變，呼叫的一方拿到這個回應

#### Scenario: 重新啟動之後

- **WHEN** 時間差是 3,600,000 的手機重新啟動 app，在手機的時鐘是 T 時送一個請求
- **THEN** 讀到的時間差仍是 3,600,000，請求時間是 T+3,600,000

### Requirement: SHARING-28.1 請求太多時等 API 說的時間，再送一次

IF API 因為請求太多拒絕手機送的請求，而回應說要等的毫秒數是 0 到 60,000 之間的整數，THEN the mobile app SHALL 等這麼久，再用當下校正後的時間和新的請求 nonce 重新簽名，把這個請求再送一次；等的時候不送這個請求。同一個請求只這樣等一次：再送的那一次又因為請求太多被拒絕時，把這個回應交給呼叫的一方。註冊的請求也照這一條。回應說的不是這樣的整數時，不等也不再送。

#### Scenario: 等 30 秒

- **WHEN** API 在 T 因為請求太多拒絕一個請求，說要等 30,000 毫秒
- **THEN** 到 T+29,999 為止 API 沒有再收到這個請求；在 T+30,000 收到，請求時間是 T+30,000，nonce 不同；呼叫的一方拿到這一次的回應

#### Scenario: 等 0 毫秒

- **WHEN** API 說要等 0 毫秒
- **THEN** 手機馬上再送一次

#### Scenario: 再送還是被拒絕

- **WHEN** 再送的那一次又因為請求太多被拒絕，說要等 10,000 毫秒
- **THEN** 手機不再等，API 只收到這個請求兩次，呼叫的一方拿到第二個拒絕

#### Scenario: 註冊的請求

- **WHEN** 沒有裝置身分的手機送請求，註冊的請求因為請求太多被拒絕，說要等 5,000 毫秒
- **THEN** 手機等 5,000 毫秒再註冊，API 回答註冊好了，原本的請求才送出

#### Scenario: 要等的時間不對

- **WHEN** API 因為請求太多拒絕，回應裡要等的毫秒數不見了、是 60,001、-1、1.5 或文字 `30000`
- **THEN** 手機不等也不再送，呼叫的一方拿到這個回應

### Requirement: SHARING-29.1 讀不到 seed 時是授權失效

IF 本機資料有裝置 ID，而 secure store 裡沒有它的 seed（例如把備份還原到另一支手機），或那個項目的內容不是 seed，THEN the mobile app SHALL 把這支手機當成授權失效：讀裝置身分得知授權失效和這個裝置 ID；要送請求時不送，告訴呼叫的一方授權失效，不發出任何網路請求，不產生新的裝置身分，本機資料和 secure store 都不變；app 照常打開，個人的帳照常記。

#### Scenario: 備份還原到另一支手機

- **WHEN** 註冊好了的手機的本機資料被複製到另一支手機，那支手機的 secure store 是空的
- **THEN** 在那支手機上讀裝置身分，得知授權失效，裝置 ID 是原本的那一個

#### Scenario: 要送請求

- **WHEN** 授權失效的手機送一個請求
- **THEN** 呼叫的一方得知授權失效；沒有發出網路請求，沒有向 `expo-crypto` 要裝置 ID 或 seed，secure store 仍是空的，本機資料不變

#### Scenario: 打開 app 記個人的帳

- **WHEN** 在授權失效的手機上打開 app，新增個人支出 Coffee run 8.75
- **THEN** app 開在 Expenses 分頁，支出清單有 Coffee run，它存進了本機資料；app 沒有發出任何網路請求，這支手機仍是授權失效

#### Scenario: secure store 裡只有別的裝置 ID 的項目

- **WHEN** 本機資料的裝置 ID 在 secure store 裡沒有項目，secure store 裡只有別的裝置 ID 的項目
- **THEN** 這支手機是授權失效，那個項目沒有被用，也沒有被改

#### Scenario: 項目的內容不是 seed

- **WHEN** secure store 裡這個裝置 ID 的項目，內容被換成空的文字，或文字 `not a seed`
- **THEN** 這支手機是授權失效，送請求時不發出網路請求

### Requirement: SHARING-30.1 secure store 一時讀不了，不算授權失效

IF 讀 secure store 時它回報錯誤，不是回報沒有這個項目（例如手機重開機之後還沒解鎖過），THEN the mobile app SHALL 不把這支手機當成授權失效：這次讀裝置身分或送請求失敗，不發出任何網路請求，不產生新的裝置身分，本機資料和 secure store 都不變；之後讀得到了，就用同一個裝置身分照常送請求。

#### Scenario: 還沒解鎖過

- **WHEN** 註冊好了的手機讀 secure store 時得到錯誤，這時讀裝置身分，也送一個請求
- **THEN** 兩件事都失敗，不是得知授權失效；沒有發出網路請求，沒有向 `expo-crypto` 要裝置 ID 或 seed，本機資料和 secure store 都不變

#### Scenario: 之後讀得到了

- **WHEN** secure store 恢復之後，手機再送一個請求
- **THEN** API 只收到這個請求，裝置 ID 是原本的那一個，簽名用原本的公開金鑰驗得過

### Requirement: SHARING-31.1 除了公開的路由，請求通過檢查才交給路由

The API SHALL 只把通過檢查的簽名的請求交給路由，公開的路由除外：檢查依序是欄位（SHARING-32.1）、裝置和簽名（SHARING-33.1、34.1）、時鐘（SHARING-35.1）、重送（SHARING-36.1）和請求太多（SHARING-37.1），第一個沒通過的決定拒絕的原因。註冊的請求多三項：欄位之後先檢查內容（SHARING-39.1）；裝置和簽名那一項，是用內容裡的公開金鑰驗簽名，而且裝置 ID 沒有用別把公開金鑰註冊過（SHARING-38.1、40.1）；請求太多之後，最後才檢查註冊太多（SHARING-41.1）。路徑沒有路由的請求也要通過檢查，通過了才回答找不到。

#### Scenario: 沒簽名的請求

- **WHEN** 沒帶四個欄位的請求打 `POST /devices`、`GET /no-such-route` 或 `GET /`
- **THEN** 都被拒絕，原因是簽名；`GET /no-such-route` 得到的不是找不到

#### Scenario: 通過檢查、沒有路由

- **WHEN** Taylor 的手機送簽名的 `GET /no-such-route`
- **THEN** API 回答找不到（404），不是拒絕

#### Scenario: 公開的路由

- **WHEN** 沒簽名的請求打 `GET /health`、`POST /health` 和 `GET /health/more`
- **THEN** API 照常回答 `GET /health`（200）；另外兩個不是公開的路由，被拒絕，原因是簽名

#### Scenario: 第一個沒通過的檢查決定原因

- **WHEN** Taylor 的手機送三個請求：一個簽名被改掉一個 bit，請求時間也早了一小時；一個簽名對，請求時間早了一小時；一個簽名和請求時間都對，nonce 是它之前通過檢查的請求用過的，而且它在這一分鐘已經有 60 個請求通過檢查
- **THEN** 拒絕的原因分別是簽名、時鐘和重送

#### Scenario: 註冊的請求的順序

- **WHEN** Casey 的手機還沒註冊，送四個註冊的請求：一個內容是 `{}`，又少了簽名這個欄位；一個內容是 `{}`，簽名是 128 個 `0`，請求時間也早了一小時；一個帶 Taylor 的裝置 ID，內容是 Casey 的公開金鑰，用 Casey 的簽名私鑰簽，請求時間早了一小時；一個內容和簽名都對，請求時間早了一小時，而且它來自的 IP 已經註冊了 30 支新的裝置
- **THEN** 拒絕的原因分別是簽名、內容不對、簽名和時鐘；最後那一個把請求時間改對再送，原因才是註冊太多

### Requirement: SHARING-32.1 簽名的欄位不齊或寫法不對

IF 請求少了裝置 ID、請求時間、請求的 nonce 或簽名其中一個欄位，或其中一個的寫法不對，THEN the API SHALL 拒絕，原因是簽名。裝置 ID 和請求的 nonce 的寫法照 SHARING-18.1；請求時間是 0 到 9,007,199,254,740,991 之間的整數的十進位寫法，沒有正負號、小數點、空白和多餘的 0；簽名是 128 個小寫十六進位字元。

#### Scenario: 少一個欄位

- **WHEN** Taylor 的手機簽好的 `GET /no-such-route`，送出時少了裝置 ID、請求時間、nonce 或簽名，一次少一個
- **THEN** 都被拒絕，原因是簽名

#### Scenario: 寫法不對

- **WHEN** 同一個簽好的請求，送出時把裝置 ID 寫成大寫；把請求時間寫成 `01794983520000`、`1794983520000.0`、`+1794983520000`、`1.79498352e12` 或中間有空白的 `17949835 20000`；把 nonce 寫成大寫；或把簽名寫成大寫、少一個字元，或 Base64
- **THEN** 都被拒絕，原因是簽名；照原樣送出的那一個通過檢查

### Requirement: SHARING-33.1 沒註冊過的裝置

IF 簽名的請求不是註冊的請求，而它的裝置 ID 沒有註冊過，THEN the API SHALL 拒絕，原因是簽名。

#### Scenario: 還沒註冊

- **WHEN** Casey 的手機還沒註冊，用自己的簽名私鑰簽了 `GET /no-such-route` 送出
- **THEN** 被拒絕，原因是簽名；Casey 的手機註冊之後再送一個這樣的請求，就通過檢查

### Requirement: SHARING-34.1 簽名對不上收到的請求

IF 請求的簽名，不是這支裝置註冊的公開金鑰對收到的請求的簽名，THEN the API SHALL 拒絕，原因是簽名：要簽的 bytes 照 SHARING-17.1，用收到的方法、路徑、收到的內容的雜湊，和請求帶的裝置 ID、請求時間和 nonce；簽名用 Web Crypto 的 `Ed25519` 驗。收到的方法或路徑寫法不對、組不出要簽的 bytes（SHARING-18.1）的請求，也因為簽名被拒絕。註冊的請求用它內容裡的公開金鑰驗（SHARING-38.1、40.1）。

#### Scenario: 沒被改過

- **WHEN** Taylor 的手機送簽名的 `POST /no-such-route?after=41`，內容是 `{"note":"晚餐"}` 的 UTF-8 編碼
- **THEN** 通過檢查

#### Scenario: 方法、路徑或查詢被改過

- **WHEN** 同樣簽好的請求，送出時方法換成 `PUT`，路徑換成 `/no-such-route2`，查詢換成 `?after=42`、拿掉，或多加 `&limit=1`
- **THEN** 都被拒絕，原因是簽名

#### Scenario: 內容被改過

- **WHEN** 同樣簽好的請求，送出時內容改掉一個 byte、後面多一個 byte、少最後一個 byte，或沒有內容
- **THEN** 都被拒絕，原因是簽名

#### Scenario: 欄位被改過

- **WHEN** 同樣簽好的請求，送出時請求時間加 1，nonce 換成另一個，或簽名改掉一個 bit
- **THEN** 都被拒絕，原因是簽名

#### Scenario: 路徑的寫法不對

- **WHEN** Taylor 的手機的請求打 `/no-such-route/it's`、`/no-such-route//x`、`/no-such-route/a%20b` 或 `/no-such-route?x=a+b`，簽的就是這段路徑，API 收到的也是這一段
- **THEN** 都被拒絕，原因是簽名

#### Scenario: 別支裝置的簽名

- **WHEN** Casey 的手機也註冊了。一個請求帶 Taylor 的裝置 ID，卻是 Casey 的簽名私鑰簽的；另一個是 Taylor 簽好的請求，送出時裝置 ID 換成 Casey 的
- **THEN** 都被拒絕，原因是簽名

### Requirement: SHARING-35.1 請求時間離 API 的時間超過 5 分鐘

IF 簽名對得上的請求，請求時間比 API 的時間早或晚超過 300,000 毫秒，THEN the API SHALL 拒絕，原因是時鐘，並在回應裡帶著 API 的時間。

#### Scenario: 剛好 5 分鐘

- **WHEN** API 的時間是 T，Taylor 的手機送請求時間是 T-300,000 的請求，和請求時間是 T+300,000 的請求
- **THEN** 都通過檢查

#### Scenario: 超過 5 分鐘

- **WHEN** API 的時間是 T，Taylor 的手機送請求時間是 T-300,001、T+300,001、T-3,600,000 和 0 的請求
- **THEN** 都被拒絕，原因是時鐘，回應帶的 API 的時間是 1794983520000

### Requirement: SHARING-36.1 重送的請求

IF 這支裝置之前有一個通過檢查的請求用過同一個請求 nonce，而那個請求的請求時間離 API 的時間還在 300,000 毫秒以內，THEN the API SHALL 拒絕，原因是重送。所以原樣再送一次的請求一定被拒絕：不是因為重送，就是因為時鐘。同時送到的幾份一樣的請求，只有一份通過檢查。

#### Scenario: 原樣再送

- **WHEN** Taylor 的手機的一個請求通過檢查之後，同一個請求原樣再送一次
- **THEN** 第二次被拒絕，原因是重送

#### Scenario: 同一個 nonce 的別的請求

- **WHEN** Taylor 的手機用通過檢查的請求用過的 nonce，重新簽一個路徑和請求時間都不同的請求
- **THEN** 被拒絕，原因是重送

#### Scenario: 別支裝置用同一個 nonce

- **WHEN** Casey 的手機註冊之後，用 Taylor 的手機用過的 nonce 簽一個請求
- **THEN** 通過檢查

#### Scenario: 同時送到

- **WHEN** 同一個簽好的請求同時送到五份
- **THEN** 只有一份通過檢查，其他四份被拒絕，原因是重送

#### Scenario: 5 分鐘之後原樣再送

- **WHEN** 請求時間是 T 的請求在 T 通過檢查，API 的時間到了 T+300,001 時原樣再送一次
- **THEN** 被拒絕，原因是時鐘

#### Scenario: 被拒絕的請求沒有用掉 nonce

- **WHEN** API 的時間是 T 時，請求時間是 T+600,000 的請求因為時鐘被拒絕；API 的時間到了 T+480,000 時，同一個請求原樣再送一次
- **THEN** 第二次通過檢查

### Requirement: SHARING-37.1 一支裝置一分鐘最多 60 個請求

IF 一支裝置已經有 60 個請求，在 API 的時間過去不到 60,000 毫秒內通過檢查，THEN the API SHALL 拒絕它的下一個請求，原因是請求太多，並在回應裡帶著要等的毫秒數：那 60 個裡最早的一個，離滿 60,000 毫秒還有多久。被 API 拒絕的請求都不算在 60 個裡；註冊的請求和路徑沒有路由的請求，通過檢查的都算。同時送到的請求也一樣，通過檢查的不超過 60 個。

#### Scenario: 第 61 個

- **WHEN** Taylor 的手機從 T 起每 500 毫秒送一個請求，共 60 個，最後一個在 T+29,500，都通過檢查；在 T+30,000 再送一個
- **THEN** 這一個被拒絕，原因是請求太多，要等 30,000 毫秒

#### Scenario: 等完之後

- **WHEN** 接著在 T+59,999 送一個，在 T+60,000 送兩個
- **THEN** T+59,999 的被拒絕，要等 1 毫秒；T+60,000 的第一個通過檢查，第二個被拒絕，要等 500 毫秒

#### Scenario: 兩支裝置各算各的

- **WHEN** Taylor 的手機在 T 已經有 60 個請求通過檢查，Casey 的手機在 T 送一個請求
- **THEN** Casey 的請求通過檢查

#### Scenario: 被拒絕的不算

- **WHEN** 在 T 有 100 個帶 Taylor 的裝置 ID、簽名不對的請求被拒絕，之後 Taylor 的手機在 T 送 60 個請求
- **THEN** 60 個都通過檢查

#### Scenario: 註冊的請求和沒有路由的請求也算

- **WHEN** Casey 的手機在 T 註冊，再註冊 29 次，又送 30 個 `GET /no-such-route`，都通過檢查；在 T 再送一個
- **THEN** 這一個被拒絕，原因是請求太多

#### Scenario: 同時送到

- **WHEN** Taylor 的手機的 80 個請求同時送到
- **THEN** 剛好 60 個通過檢查，20 個被拒絕，原因是請求太多

### Requirement: SHARING-38.1 註冊存下裝置 ID 和公開金鑰

WHEN 對 `/devices` 的 `POST` 是簽名的請求，內容是一把 Ed25519 公開金鑰，簽名用這把公開金鑰驗得過（SHARING-34.1），也通過其餘的檢查，the API SHALL 存下這個裝置 ID 和這把公開金鑰，回答註冊好了；之後這支裝置的請求都用這把公開金鑰驗。這個裝置 ID 已經用同一把公開金鑰註冊過時，只回答註冊好了，不多存一支裝置；同一支裝置、同一把公開金鑰的幾個註冊同時送到時也一樣，每一個都回答註冊好了，只存一支，只算一支新的裝置（SHARING-41.1）。

#### Scenario: 新的裝置

- **WHEN** Casey 的手機還沒註冊，送註冊的請求，內容是它的公開金鑰，用它的簽名私鑰簽
- **THEN** API 回答註冊好了（200）；之後 Casey 的手機簽的 `GET /no-such-route` 通過檢查

#### Scenario: 沒有對應的私鑰

- **WHEN** 註冊的請求的內容是 Casey 的公開金鑰，簽名卻是 Taylor 的簽名私鑰簽的，或簽名是 128 個 `0`
- **THEN** 被拒絕，原因是簽名，Casey 的裝置 ID 沒有註冊

#### Scenario: 同一支裝置再註冊

- **WHEN** Casey 的手機註冊好之後，用同一個裝置 ID 和公開金鑰再送一次註冊的請求
- **THEN** API 回答註冊好了，資料庫裡 Casey 的裝置仍只有一支

#### Scenario: 同一支裝置的註冊同時送到

- **WHEN** Casey 的手機還沒註冊，它的五個註冊的請求同時送到，nonce 各不相同
- **THEN** 五個都得到註冊好了的回答，資料庫裡 Casey 的公開金鑰只存了一次；這個 IP 接著還能註冊 29 支新的裝置，再多一支才被拒絕

### Requirement: SHARING-39.1 註冊的內容不對

IF 註冊的請求四個欄位的寫法都對，而它的內容不是剛好一把 Ed25519 公開金鑰，THEN the API SHALL 拒絕，原因是內容不對。

#### Scenario: 內容不對

- **WHEN** Casey 的手機送的註冊的請求，內容是空的、不是 JSON 的文字 `hello`、一個陣列、少了公開金鑰的 `{}`，或公開金鑰是 31 或 33 bytes、大寫的十六進位，或 Base64，簽名都是 Casey 的簽名私鑰對送出的請求簽的
- **THEN** 都被拒絕，原因是內容不對，Casey 的裝置 ID 沒有註冊

#### Scenario: 多帶了別的東西

- **WHEN** 註冊的請求的內容除了 Casey 的公開金鑰，還多帶一個名字「Casey」
- **THEN** 被拒絕，原因是內容不對

### Requirement: SHARING-40.1 裝置 ID 已經屬於別把公開金鑰

IF 註冊的請求的裝置 ID 已經用另一把公開金鑰註冊過，THEN the API SHALL 拒絕，原因是簽名，原本註冊的公開金鑰不變。

#### Scenario: 別把私鑰來註冊同一個裝置 ID

- **WHEN** 註冊的請求帶 Taylor 的裝置 ID，內容是 Casey 的公開金鑰，用 Casey 的簽名私鑰簽
- **THEN** 被拒絕，原因是簽名；Taylor 的手機原本的簽名私鑰簽的請求照常通過檢查，Casey 的簽名私鑰簽的、帶 Taylor 的裝置 ID 的請求仍被拒絕

#### Scenario: 原本的私鑰要換公開金鑰

- **WHEN** 註冊的請求帶 Taylor 的裝置 ID，內容是 Casey 的公開金鑰，用 Taylor 的簽名私鑰簽
- **THEN** 被拒絕，原因是簽名，Taylor 註冊的公開金鑰不變

### Requirement: SHARING-41.1 同一個 IP 一小時最多註冊 30 支新的裝置

IF 同一個 IP 已經有 30 支新的裝置，在 API 的時間過去不到 3,600,000 毫秒內註冊，THEN the API SHALL 拒絕這個 IP 再註冊新的裝置，原因是註冊太多。已經註冊過的裝置再註冊（SHARING-38.1）不算新的，也不會因此被拒絕；被拒絕的註冊不算。同時送到的註冊也一樣，3,600,000 毫秒內註冊好的新裝置不超過 30 支。IPv6 位址前 64 bits 相同的算同一個 IP；寫成 IPv6 的 IPv4 位址（`::ffff:203.0.113.7`）算那個 IPv4 位址。

#### Scenario: 第 31 支

- **WHEN** `198.51.100.20` 在 T 註冊了 30 支新的裝置，在 T+1,000 再註冊一支
- **THEN** 前 30 支都註冊好了；第 31 支被拒絕，原因是註冊太多，它的裝置 ID 沒有註冊

#### Scenario: 別的 IP

- **WHEN** 同一個時候，`198.51.100.21` 註冊一支新的裝置
- **THEN** 註冊好了

#### Scenario: 一小時之後

- **WHEN** `198.51.100.20` 在 T+3,599,999 註冊一支新的裝置，在 T+3,600,000 再註冊一次
- **THEN** T+3,599,999 的被拒絕；T+3,600,000 的註冊好了

#### Scenario: 已經註冊過的裝置

- **WHEN** `198.51.100.20` 已經註冊了 30 支，其中一支在 T+1,000 用同一把公開金鑰再註冊一次
- **THEN** API 回答註冊好了

#### Scenario: 被拒絕的註冊不算

- **WHEN** `198.51.100.20` 在 T 送了 40 個簽名不對的註冊的請求，之後在 T 註冊 30 支新的裝置
- **THEN** 30 支都註冊好了

#### Scenario: 同時送到

- **WHEN** `198.51.100.20` 的 40 支新裝置的註冊同時送到
- **THEN** 剛好 30 支註冊好了；另外 10 個被拒絕，原因是註冊太多，那 10 個裝置 ID 都沒有註冊

#### Scenario: IPv6

- **WHEN** `2001:db8:1:2::1` 註冊了 30 支新的裝置，接著 `2001:0db8:0001:0002:ffff:ffff:ffff:ffff` 和 `2001:db8:1:3::1` 各註冊一支
- **THEN** 前一個和 `2001:db8:1:2::1` 的前 64 bits 相同，被拒絕；後一個註冊好了

#### Scenario: 寫成 IPv6 的 IPv4 位址

- **WHEN** `198.51.100.20` 註冊了 30 支新的裝置，接著 `::ffff:198.51.100.20` 和 `::ffff:198.51.100.21` 各註冊一支
- **THEN** 前一個被拒絕，後一個註冊好了

#### Scenario: 請求自己說的位址不算

- **WHEN** API 在 Node 上，沒有另外指定 IP 的來源，30 支新的裝置從同一台機器註冊，第 31 支的請求帶著 `X-Forwarded-For: 198.51.100.99` 和 `CF-Connecting-IP: 198.51.100.99`
- **THEN** 第 31 支被拒絕，原因是註冊太多

### Requirement: SHARING-42.1 關於一支手機，API 只存裝置 ID 和公開金鑰，不存 IP

The API SHALL 關於一支手機只存它的裝置 ID 和公開金鑰，以及檢查要用的東西：它通過檢查的請求的 nonce 和時間，和它註冊時 IP 加了金鑰的雜湊；IP 本身、IP 不加金鑰的雜湊，和請求的其他標頭都不存。

#### Scenario: 註冊之後的資料庫

- **WHEN** Casey 的手機從 `203.0.113.7` 註冊，又送了一個 `GET /no-such-route`，兩個請求都帶著 `User-Agent: CaseysPhone/1.0`
- **THEN** 資料庫裡有 Casey 的裝置 ID 和公開金鑰；找不到 `203.0.113.7`，找不到它的 SHA-256、SHA-1 和 MD5，不論是原始的 bytes、十六進位還是 Base64，也找不到 `CaseysPhone`

#### Scenario: IPv6

- **WHEN** Casey 的手機從 `2001:db8:1:2::1` 註冊
- **THEN** 資料庫裡找不到 `2001:db8:1:2::1`、`2001:db8:1:2`，和它們的 SHA-256，不論是原始的 bytes、十六進位還是 Base64

### Requirement: SHARING-43.1 (manual) Android 的備份和裝置轉移不帶走 seed

WHEN Android 的自動備份或裝置轉移把 app 的資料搬到另一次安裝，the mobile app SHALL 讓本機資料照常被帶過去，secure store 的項目不被帶過去，所以還原之後的手機是授權失效（SHARING-29.1）。

#### Scenario: 還原到另一支手機

- **WHEN** 有裝置身分、也記了支出的 Android 手機做了備份，在另一支 Android 手機安裝 app 並還原這份備份
- **THEN** 另一支手機上支出和群組都在，這支手機是授權失效

#### Scenario: 移除再安裝

- **WHEN** 同一支 Android 手機移除 app，再安裝並從備份還原
- **THEN** 支出和群組都在，這支手機是授權失效

### Requirement: SHARING-44.1 沒有 IP 雜湊的金鑰或得不到 IP 時，不註冊新的裝置

IF API 沒有 IP 雜湊的金鑰，或金鑰是空的，或得不到註冊的請求來自的 IP，THEN the API SHALL 不註冊新的裝置：對通過其餘檢查的、新的裝置的註冊，回答 API 自己出了錯（狀態碼 500），資料庫不變。已經註冊的裝置不受影響，它們的請求和再註冊都照常。

#### Scenario: 沒有金鑰

- **WHEN** API 沒有拿到 IP 雜湊的金鑰，或拿到的是空的文字，Casey 的手機送註冊的請求
- **THEN** API 回答 500，Casey 的裝置 ID 沒有註冊，資料庫不變

#### Scenario: 得不到 IP

- **WHEN** API 得到的請求來源是空的文字，或不是 IP 位址的 `unknown`，Casey 的手機送註冊的請求
- **THEN** API 回答 500，Casey 的裝置 ID 沒有註冊，資料庫不變

#### Scenario: 已經註冊的裝置

- **WHEN** Taylor 的手機註冊好之後，API 得到的請求來源變成 `unknown`，Taylor 的手機送一個請求，又用同一把公開金鑰再註冊一次
- **THEN** 請求通過檢查，再註冊也得到註冊好了的回答
