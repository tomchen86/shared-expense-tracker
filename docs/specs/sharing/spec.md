# Sharing

## Purpose

共同帳本的加密工具（ADR-0015）：用鑰匙加密和解密內容、用私鑰簽名、把內容裝成只有另一支手機打得開的 box，以及從密鑰材料導出金鑰。工具放在 `packages/domain` 自己的入口，給手機 app 用；它不存任何東西、不連網路，也不自己產生鑰匙、私鑰、nonce 或 salt（SHARING-14.1）。演算法是 XChaCha20-Poly1305（draft-irtf-cfrg-xchacha-03）、Ed25519（RFC 8032）、X25519（RFC 7748）和 HKDF-SHA-256（RFC 5869）。bytes 是一個 `Uint8Array`，以十六進位寫出：`0x01` 是一個 byte，沒有 `0x` 的一串是依序的 bytes，`…` 是省略的部分。鑰匙是 32 bytes 的對稱金鑰。nonce 是呼叫者給的 24 bytes，每次加密或裝 box 都要是新的隨機值。附加資料是一段不加密、但解密時要給出一模一樣的 bytes，可以是空的。密文是 SHARING-1.1 的格式，它的第一個 byte 是格式版本。簽名私鑰是 32 bytes 的 Ed25519 私鑰，box 私鑰是 32 bytes 的 X25519 私鑰，各有一把 32 bytes 的公開金鑰（SHARING-5.1、7.1）。共享密鑰是 X25519 用一把 box 私鑰和另一把 box 公開金鑰算出的 32 bytes。box 是交出方裝給收受方的密文（SHARING-8.1）：情境是裝 box 時給的一段 bytes，可以是空的；salt 是裝 box 時可以再給的 32 bytes；打開時兩者都要和裝的時候一樣。密鑰材料是導出金鑰的來源，用途是用來區分金鑰的一段 bytes，兩者都可以是字串（SHARING-12.1）。解密密文或打開 box 有兩種失敗：解不開（SHARING-3.1、10.1、11.1）和不認得格式版本（SHARING-4.2），兩種都不回傳任何內容。拒絕是丟出錯誤，不產出任何結果。不是 bytes 的輸入一律先被拒絕（SHARING-16.1），只有導出金鑰的密鑰材料和用途也可以是字串；其他的規則說的都是這樣的輸入。沒給一個輸入，是指沒有它，或它是 `undefined`；只有 salt 可以不給。SHARING-15.1 列出的輸入（鑰匙、私鑰、nonce、box 的 salt 和裝 box 時收受方的公開金鑰）長度不對時也一律先被拒絕；要解密的 bytes、要打開的 box 和交出方的公開金鑰不管多長，都照其他的規則回報。

邀請連結的基礎（ADR-0023）：點邀請連結時，裝了 app 的手機直接打開 app，沒裝的人看到下載頁（SHARING-60.1 到 76.1）。邀請連結是 `https://<主機>/i/<代號>#<字串>`（ADR-0015）：主機是 API 在這個環境的網域，代號是路徑裡 `/i/` 後面的那一段，`#` 後面的部分只留在開連結的那支手機上，瀏覽器不會把它送給任何伺服器。API 給三樣東西：iOS 和 Android 用來確認這個網域的連結歸 app 開的兩個驗證檔（SHARING-60.1、61.1），和下載頁（SHARING-62.1 到 68.1）；誰都可以拿，請求不必簽名，也不必帶裝置身分，用 `HEAD` 問也一樣（SHARING-76.1）。它們的內容出自這個環境的 App 設定：開邀請連結的 iOS App，各寫成 `<Team ID>.<bundle ID>`；開邀請連結的 Android App，各有 package 名稱和簽它的憑證的 SHA-256 指紋；以及 iPhone 和 Android 各一個下載連結。每一項都可以沒有。下載頁是 API 對邀請連結的路徑回的網頁；頁面上的文字是它顯示給人看的字，不算 `<head>`、`<script>` 和 `<style>` 裡的。對手機 app 來說，邀請連結是系統交給它的這兩種連結：scheme 是 `https`、路徑以 `/i/` 開頭的連結，不管主機是什麼，因為系統只把驗證過的網域的連結交給 app；和以 `shared-expense-tracker://i/` 開頭的連結，也就是下載頁的「Open in App」帶的那一種（SHARING-66.1）。系統交連結給 app 有兩個時機：app 沒在執行時用它啟動 app，和 app 執行中時交給它。這裡還沒有建立邀請、看群組或申請加入，所以代號和 `#` 後面的部分是什麼、有沒有這個邀請，都不影響這裡的任何一條。SHARING-60.1 到 76.1 的情境裡，API 的網址是 `https://links.example.test`，「完整的連結」是 `https://links.example.test/i/3q2-7wEjRWeJq83vEjRWeA#AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8`，它的代號和 `#` 後面的部分只是長度和字元像真的例子。

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

### Requirement: SHARING-60.1 `apple-app-site-association` 列出開邀請連結的 iOS App

WHEN 有人請求 `GET /.well-known/apple-app-site-association`，the API SHALL 不必簽名就直接回 200，不轉址，`Content-Type` 是 `application/json`，內容是 JSON `{"applinks":{"details":[{"appIDs":[…],"components":[{"/":"/i/*"}]}]}}`，`appIDs` 依序是這個環境設定的 iOS App；一個 iOS App 都沒有設定時，`details` 是空的陣列。

#### Scenario: 一個 iOS App

- **WHEN** 這個環境設定的 iOS App 是 `ABCDE12345.com.tomchen.sharedexpensetracker`，請求 `GET /.well-known/apple-app-site-association`，沒有簽名
- **THEN** 回 200，`Content-Type` 是 `application/json`，內容是 `{"applinks":{"details":[{"appIDs":["ABCDE12345.com.tomchen.sharedexpensetracker"],"components":[{"/":"/i/*"}]}]}}`，沒有其他欄位

#### Scenario: 兩個 iOS App

- **WHEN** 設定的 iOS App 依序是 `ABCDE12345.com.tomchen.sharedexpensetracker` 和 `FGHIJ67890.com.example.other`
- **THEN** `details` 只有一項，它的 `appIDs` 依序是這兩個

#### Scenario: 沒有設定 iOS App

- **WHEN** 這個環境沒有設定 iOS App
- **THEN** 回 200，內容是 `{"applinks":{"details":[]}}`

### Requirement: SHARING-61.1 `assetlinks.json` 列出開邀請連結的 Android App

WHEN 有人請求 `GET /.well-known/assetlinks.json`，the API SHALL 不必簽名就直接回 200，不轉址，`Content-Type` 是 `application/json`，內容是一個 JSON 陣列，依序為這個環境設定的每個 Android App 放一項：`relation` 是 `["delegate_permission/common.handle_all_urls"]`，`target` 的 `namespace` 是 `android_app`、`package_name` 是它的 package 名稱、`sha256_cert_fingerprints` 依序是它的憑證指紋，照設定的寫法；一個 Android App 都沒有設定時是空的陣列。

#### Scenario: 一個 Android App，兩個指紋

- **WHEN** 這個環境設定的 Android App 是 `com.tomchen.sharedexpensetracker`，指紋依序是 `14:6D:E9:83:C5:73:06:50:D8:EE:B9:95:2F:34:FC:64:16:A0:83:42:E6:1D:BE:A8:8A:04:96:B2:3F:CF:44:E5` 和 `FA:C6:17:45:DC:09:03:78:6F:B9:ED:E6:2A:96:2B:39:9F:73:48:F0:BB:6F:89:9B:83:32:66:75:91:03:3B:9C`，請求 `GET /.well-known/assetlinks.json`，沒有簽名
- **THEN** 回 200，`Content-Type` 是 `application/json`，內容是只有一項的陣列：`relation` 是 `["delegate_permission/common.handle_all_urls"]`，`target` 是 `namespace` 為 `android_app`、`package_name` 為 `com.tomchen.sharedexpensetracker`、`sha256_cert_fingerprints` 依序為這兩個指紋，沒有其他欄位

#### Scenario: 兩個 Android App

- **WHEN** 設定的 Android App 依序是 `com.tomchen.sharedexpensetracker`（指紋是上面的第一個）和 `com.example.other`（指紋是上面的第二個）
- **THEN** 陣列依序有這兩項，各有自己的 package 名稱和指紋

#### Scenario: 沒有設定 Android App

- **WHEN** 這個環境沒有設定 Android App
- **THEN** 回 200，內容是 `[]`

### Requirement: SHARING-62.1 邀請連結的路徑回下載頁，每個代號都一樣

WHEN 有人請求 `GET /i/<代號>`，代號是一段不是空的、不含 `/` 的路徑，the API SHALL 不必簽名就直接回 200，不轉址，`Content-Type` 是 `text/html; charset=utf-8`，內容是下載頁，不設任何 cookie；不管代號是什麼、有沒有這個邀請、請求帶什麼查詢和標頭，回的內容和 `Content-Security-Policy` 都一模一樣。

#### Scenario: 完整的連結的路徑

- **WHEN** 請求 `GET /i/3q2-7wEjRWeJq83vEjRWeA`，沒有簽名
- **THEN** 回 200，`Content-Type` 是 `text/html; charset=utf-8`，沒有 `Set-Cookie`，內容是下載頁

#### Scenario: 各種代號

- **WHEN** 代號是 `a`、2,000 個 `a`、`abc.png` 或 `%3Cscript%3Ealert(1)%3C%2Fscript%3E`
- **THEN** 回的內容和 `Content-Security-Policy` 都和上一個 scenario 的一模一樣；內容裡沒有 `3q2-7wEjRWeJq83vEjRWeA`，也沒有 `alert(1)`

#### Scenario: 帶著查詢

- **WHEN** 請求 `GET /i/3q2-7wEjRWeJq83vEjRWeA?openExternalBrowser=1` 或 `GET /i/3q2-7wEjRWeJq83vEjRWeA?fbclid=IwAR0abc&utm_source=line`
- **THEN** 回的內容和 `Content-Security-Policy` 一模一樣

#### Scenario: 不看是什麼裝置

- **WHEN** 請求的 `User-Agent` 是 iPhone 的 Safari、Android 的 Chrome 或 LINE 的內建瀏覽器，或沒有 `User-Agent`；`Accept-Language` 是 `zh-TW`，或沒有
- **THEN** 回的內容和 `Content-Security-Policy` 一模一樣

### Requirement: SHARING-63.1 `/i/` 後面不是剛好一段代號時不回下載頁

IF 請求的路徑是 `/i` 或 `/i/`，或 `/i/` 後面的部分含有 `/`，THEN the API SHALL 不回下載頁，回應的狀態是 4xx。

#### Scenario: 沒有代號，或多了一段

- **WHEN** 請求 `GET /i`、`GET /i/`、`GET /i/a/b`、`GET /i/a/` 或 `GET /i//a`
- **THEN** 回應的狀態是 4xx，內容不是下載頁

### Requirement: SHARING-64.1 下載頁的文字

The API SHALL 讓下載頁標成英文（`<html lang="en">`）、以裝置的寬度排版（`<meta name="viewport" content="width=device-width, initial-scale=1">`），`<title>` 是「Shared Expense Tracker」；頁面上的文字由上而下是 `<h1>` 的「Shared Expense Tracker」、「You've been invited to join a group.」和一個連結（`<a>`）「Open in App」，再來是下載的說明和下載連結（SHARING-65.1），沒有其他文字。

#### Scenario: 兩個下載連結都有設定

- **WHEN** 這個環境兩個下載連結都有設定，瀏覽器顯示下載頁
- **THEN** 頁面上的文字依序是「Shared Expense Tracker」、「You've been invited to join a group.」、「Open in App」、「Don't have the app? Install it, then tap your invite link again.」、「Download for iPhone」和「Download for Android」，沒有其他文字；第一個是唯一的 `<h1>`，`<title>` 是「Shared Expense Tracker」

#### Scenario: 語言和寬度

- **WHEN** 讀下載頁的 HTML
- **THEN** `<html>` 的 `lang` 是 `en`，有 `<meta name="viewport" content="width=device-width, initial-scale=1">`

### Requirement: SHARING-65.1 下載連結只列這個環境有的

The API SHALL 在下載頁的「Open in App」下面顯示下載的說明：這個環境至少設定了一個下載連結時，是「Don't have the app? Install it, then tap your invite link again.」，後面依序是有設定的平台的連結（`<a>`），iPhone 的是「Download for iPhone」、Android 的是「Download for Android」，各自連到設定的網址；兩個都沒有設定時，是「Don't have the app? It isn't available to download yet.」，沒有下載連結。

#### Scenario: 兩個都有

- **WHEN** iPhone 的下載連結是 `https://testflight.apple.com/join/AbCd1234`，Android 的是 `https://play.google.com/apps/internaltest/4701234567890123456`
- **THEN** 「Open in App」下面依序是「Don't have the app? Install it, then tap your invite link again.」、連到 `https://testflight.apple.com/join/AbCd1234` 的「Download for iPhone」，和連到 `https://play.google.com/apps/internaltest/4701234567890123456` 的「Download for Android」

#### Scenario: 只有 iPhone 的

- **WHEN** 只設定了 iPhone 的下載連結
- **THEN** 說明後面只有「Download for iPhone」，頁面上沒有「Download for Android」

#### Scenario: 只有 Android 的

- **WHEN** 只設定了 Android 的下載連結
- **THEN** 說明後面只有「Download for Android」，頁面上沒有「Download for iPhone」

#### Scenario: 兩個都沒有

- **WHEN** 兩個下載連結都沒有設定
- **THEN** 「Open in App」下面只有「Don't have the app? It isn't available to download yet.」，頁面上唯一的連結是「Open in App」

### Requirement: SHARING-66.1 「Open in App」帶著整條邀請連結

WHEN 瀏覽器顯示下載頁，the API SHALL 讓頁面行內的 script 把「Open in App」連到 `shared-expense-tracker://` 接上這一頁網址的路徑去掉開頭的 `/`，再接上網址的 `#` 和它後面的部分，照網址上的寫法，不帶查詢；網址沒有 `#`，或 `#` 後面是空的時，不接 `#`；頁面自己不跳轉，使用者按了「Open in App」才打開。

#### Scenario: 完整的連結

- **WHEN** 瀏覽器以 `https://links.example.test/i/3q2-7wEjRWeJq83vEjRWeA#AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8` 顯示下載頁
- **THEN** 「Open in App」連到 `shared-expense-tracker://i/3q2-7wEjRWeJq83vEjRWeA#AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8`

#### Scenario: 帶著查詢

- **WHEN** 瀏覽器以 `https://links.example.test/i/3q2-7wEjRWeJq83vEjRWeA?openExternalBrowser=1#AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8` 顯示下載頁
- **THEN** 「Open in App」連到的和上一個 scenario 一樣，沒有查詢

#### Scenario: 沒有 `#` 後面的部分

- **WHEN** 瀏覽器以 `https://links.example.test/i/3q2-7wEjRWeJq83vEjRWeA`，或後面只多一個 `#` 的同一個網址顯示下載頁
- **THEN** 「Open in App」連到 `shared-expense-tracker://i/3q2-7wEjRWeJq83vEjRWeA`

#### Scenario: `#` 後面有其他符號

- **WHEN** 瀏覽器以 `https://links.example.test/i/abc#k-1_2.3~4%2F5=6&7+8?9` 顯示下載頁
- **THEN** 「Open in App」連到 `shared-expense-tracker://i/abc#k-1_2.3~4%2F5=6&7+8?9`

#### Scenario: 不自己跳轉

- **WHEN** 瀏覽器以完整的連結顯示下載頁，使用者什麼都沒按
- **THEN** 這一頁的網址沒有變，頁面沒有打開或跳到任何地方

### Requirement: SHARING-67.1 下載頁不載入別處的東西，也不把 `#` 後面的部分送出去

The API SHALL 讓下載頁只用寫在頁面裡的 script 和 style，不載入別處的 script、style、圖片、字型或頁框，它的 script 只讀這一頁的網址來設定「Open in App」的連結，不發出任何請求，也不寫 cookie，而且回應的 `Content-Security-Policy` 只放行這些行內的 script 和 style：`default-src 'none'`、`base-uri 'none'`、`form-action 'none'`、`frame-ancestors 'none'`，以及只列出頁面裡每一段行內 script 的 `'sha256-…'` 的 `script-src`，頁面有行內 style 時還有只列出每一段行內 style 的 `'sha256-…'` 的 `style-src`，沒有其他 directive。

#### Scenario: 頁面裡的東西

- **WHEN** 兩個下載連結都有設定，讀下載頁的 HTML
- **THEN** 沒有帶 `src` 或 `srcset` 的元素，沒有 `<link>`、`<iframe>`、`<frame>`、`<object>`、`<embed>`、`<form>`、`<base>` 和 `<meta http-equiv="refresh">`，沒有 `style` 屬性和 `on` 開頭的屬性；有至少一段行內的 `<script>`；連結只有「Open in App」和兩個下載連結

#### Scenario: Content-Security-Policy

- **WHEN** 讀下載頁回應的 `Content-Security-Policy`
- **THEN** 它有 `default-src 'none'`、`base-uri 'none'`、`form-action 'none'` 和 `frame-ancestors 'none'`；`script-src` 只列 `'sha256-…'`，頁面裡每一段 `<script>` 的 SHA-256 都在裡面；有 `<style>` 時 `style-src` 也一樣；沒有其他 directive，也沒有 `'unsafe-inline'`、`'unsafe-eval'`、主機或 `*`

#### Scenario: 在瀏覽器裡

- **WHEN** 瀏覽器以完整的連結顯示下載頁
- **THEN** 頁面的 script 沒有用 `fetch`、`XMLHttpRequest`、`navigator.sendBeacon`、`WebSocket`、`EventSource` 或 `window.open`，沒有建立圖片、`<link>`、頁框或其他帶 `src` 的元素，`document.cookie` 是空的；`#` 後面的部分只出現在「Open in App」的連結裡

### Requirement: SHARING-68.1 連結預覽只有 App 的名稱和說明

WHEN 通訊軟體為了顯示預覽而請求邀請連結，the API SHALL 回同一個下載頁（SHARING-62.1），它的 `og:title` 是「Shared Expense Tracker」，`og:description` 和 `<meta name="description">` 都是「Keep personal and shared expenses in one place, with your partner or friends.」，沒有其他 `og:` 或 `twitter:` 的 meta，也沒有圖片。

#### Scenario: 預覽用的資料

- **WHEN** 讀下載頁的 HTML
- **THEN** `<title>` 和 `og:title` 是「Shared Expense Tracker」，`og:description` 和 `<meta name="description">` 是「Keep personal and shared expenses in one place, with your partner or friends.」；`og:` 的 meta 只有這兩個，沒有 `twitter:` 的 meta，沒有 `og:image` 和 `og:url`

#### Scenario: 抓預覽的程式

- **WHEN** 請求 `GET /i/3q2-7wEjRWeJq83vEjRWeA` 的 `User-Agent` 是 `facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)`、`WhatsApp/2.23.20.0`、`TelegramBot (like TwitterBot)` 或 `Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)`
- **THEN** 回的內容和瀏覽器拿到的一模一樣，裡面沒有請求的代號，也沒有群組或成員的任何資訊

### Requirement: SHARING-69.1 連不上資料庫時照樣回驗證檔和下載頁

IF API 連不上資料庫，THEN the API SHALL 照樣回兩個驗證檔和下載頁，內容和連得上時一樣。

#### Scenario: 資料庫連不上

- **WHEN** API 的資料庫連不上，請求 `GET /.well-known/apple-app-site-association`、`GET /.well-known/assetlinks.json` 和 `GET /i/3q2-7wEjRWeJq83vEjRWeA`
- **THEN** 三個都回 200，內容和資料庫連得上時一樣

### Requirement: SHARING-70.1 (manual) 裝了 app 的手機點邀請連結時直接打開 app

WHEN 使用者在裝了 app 的手機上點一條邀請連結，或用相機掃它的 QR code，而連結的主機是這個 build 的設定裡列的網域（iOS 的 Associated Domains、Android 的 intent filter），the mobile app SHALL 直接被系統打開，不先顯示瀏覽器的頁面，並打開 Invite Link（SHARING-71.1），上面的連結和點的那一條一個字都不差，包含 `#` 後面的部分。

#### Scenario: iPhone，app 沒在執行

- **WHEN** 結束 app 之後，在「備忘錄」或「訊息」裡點完整的連結，主機換成這個環境的
- **THEN** app 打開，沒有出現 Safari；Invite Link 上的連結和點的那一條一模一樣

#### Scenario: iPhone，app 在背景

- **WHEN** app 停在 Settings 分頁、退到背景之後，點同一條連結
- **THEN** app 回到前景，Invite Link 蓋在 Settings 上，連結一模一樣

#### Scenario: iPhone 的相機

- **WHEN** 用相機掃同一條連結的 QR code，再點相機跳出的連結
- **THEN** app 打開，Invite Link 上的連結一模一樣

#### Scenario: Android

- **WHEN** 在「訊息」裡點同一條連結，或執行 `adb shell am start -a android.intent.action.VIEW -c android.intent.category.BROWSABLE -d '<連結>'`
- **THEN** app 打開，沒有出現瀏覽器，也沒有問要用哪個 app 開；Invite Link 上的連結一模一樣；`adb shell pm get-app-links com.tomchen.sharedexpensetracker` 列出這個主機是 `verified`

#### Scenario: 不是邀請連結的路徑

- **WHEN** 點 `https://<這個環境的主機>/health`
- **THEN** 在瀏覽器打開，不打開 app

### Requirement: SHARING-71.1 收到邀請連結時打開 Invite Link，照原樣顯示整條連結

WHEN 系統把一條邀請連結交給 app，不管是用它啟動 app 還是在 app 執行中交來，the mobile app SHALL 在本機資料開好之後打開從畫面底部升起、蓋在當時的畫面上的 Invite Link，標題是「Invite Link」，標題列只有取消「Close」（SHELL-47.2、SHELL-48.2），內容只有這條連結的文字，和系統交來的一個字都不差，一行放不下時換行，不截斷；用邀請連結啟動 app 時，它蓋在 Expenses 的根畫面上；本機資料還在開啟時只有載入指示（SHELL-1.2），打不開時只有錯誤（SHELL-4.1），都不打開 Invite Link。

#### Scenario: app 執行中收到完整的連結

- **WHEN** app 停在 Settings 的根畫面時，系統交來完整的連結
- **THEN** Invite Link 從底部升起，蓋在 Settings 上，標題是「Invite Link」，標題列只有「Close」；內容只有 `https://links.example.test/i/3q2-7wEjRWeJq83vEjRWeA#AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8`

#### Scenario: app 自己的 scheme

- **WHEN** app 執行中，系統交來 `shared-expense-tracker://i/3q2-7wEjRWeJq83vEjRWeA#AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8`
- **THEN** Invite Link 的內容只有這條 `shared-expense-tracker://` 開頭的連結，一個字都不差

#### Scenario: 用連結啟動 app

- **WHEN** app 沒在執行，系統用完整的連結，或用上一個 scenario 的連結啟動 app
- **THEN** 本機資料開好之後，Invite Link 蓋在 Expenses 的根畫面上，分頁列選中 Expenses，內容只有啟動 app 的那條連結

#### Scenario: 連結的其他寫法

- **WHEN** 系統交來 `https://links.example.test/i/3q2-7wEjRWeJq83vEjRWeA?openExternalBrowser=1#AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8`、`https://links.example.test/i/3q2-7wEjRWeJq83vEjRWeA`、結尾多一個 `#` 的同一條、`https://links.example.test/i/a%2Fb%20c?x=%26&y=1+2#k%2D1+2=3&4?5`、`https://other.example.org/i/abc#def`、`https://links.example.test/i/#def`、`https://links.example.test/i/a/b#c` 或 `shared-expense-tracker://i/abc?x=1#def`
- **THEN** 每一條都打開 Invite Link，內容就是那一條，沒有少掉查詢或 `#` 後面的部分，`%` 開頭的寫法和 `+` 也沒有被換掉

#### Scenario: 很長的連結

- **WHEN** 系統交來的連結，`#` 後面是 2,000 個 `a`
- **THEN** Invite Link 顯示整條連結，沒有限制行數，也沒有截斷

#### Scenario: 蓋在推入的畫面或開著的表單上

- **WHEN** app 停在從 Settings 推入的 Archived Groups，或開著 New Group 的表單時，系統交來完整的連結
- **THEN** Invite Link 蓋在那個畫面或表單上

#### Scenario: 用連結啟動 app，本機資料還在開啟

- **WHEN** 系統用完整的連結啟動 app，本機資料還沒開好
- **THEN** 畫面上只有載入指示，沒有 Invite Link；開好之後，Invite Link 蓋在 Expenses 的根畫面上，內容是這條連結

#### Scenario: 開啟期間交來的連結

- **WHEN** app 以 `/settings` 啟動，本機資料還沒開好時，系統先交來完整的連結，再交來 `https://links.example.test/i/ASNFZ4mrze_-3LqYdlQyEA#ICEiIyQlJicoKSorLC0uLzAxMjM0NTY3ODk6Ozw9Pj8`
- **THEN** 畫面上仍然只有載入指示；開好之後只打開一個 Invite Link，蓋在 Settings 的根畫面上，內容是後交來的那一條

#### Scenario: 本機資料打不開

- **WHEN** 系統用完整的連結啟動 app，而本機資料打不開；之後系統又交來另一條邀請連結
- **THEN** 一直只顯示「Unable to Load Local Data」和「Your data was not changed.」，沒有 Invite Link；結束 app 之後，本機資料打得開時再用同一條連結啟動，就打開 Invite Link

### Requirement: SHARING-72.1 關閉 Invite Link 回到它蓋住的畫面

WHEN 使用者在 Invite Link 按「Close」、在 iOS 上把它往下滑，或在 Android 上按返回鍵，the mobile app SHALL 關閉 Invite Link，回到它蓋住的畫面，那個畫面和收到連結之前一樣；用邀請連結啟動 app 的，回到 Expenses 的根畫面。

#### Scenario: 按 Close

- **WHEN** app 停在 Settings 的根畫面時收到完整的連結，再按 Invite Link 的「Close」
- **THEN** Invite Link 關閉，回到 Settings 的根畫面，分頁列仍選中 Settings

#### Scenario: 往下滑

- **WHEN** iOS 上把 Invite Link 往下滑
- **THEN** Invite Link 關閉，回到它蓋住的畫面

#### Scenario: Android 的返回鍵

- **WHEN** Android 上 app 停在 Settings 的根畫面時收到完整的連結，再按返回鍵
- **THEN** Invite Link 關閉，回到 Settings 的根畫面，app 沒有離開

#### Scenario: 用連結啟動 app 之後關閉

- **WHEN** 系統用完整的連結啟動 app，再按「Close」
- **THEN** 回到 Expenses 的根畫面，分頁列選中 Expenses；之後點 Groups 分頁會切到 Groups

#### Scenario: Android 上用連結啟動 app 之後按返回鍵

- **WHEN** Android 上系統用完整的連結啟動 app，再按兩次返回鍵
- **THEN** 第一次關閉 Invite Link、回到 Expenses 的根畫面，第二次離開 app（SHELL-15.1）

#### Scenario: 表單上輸入到一半的字

- **WHEN** 在 New Group 的表單輸入「Bris」之後收到完整的連結，再按 Invite Link 的「Close」
- **THEN** 回到 New Group 的表單，名稱欄位仍是「Bris」

#### Scenario: 推入的畫面

- **WHEN** app 停在從 Settings 推入的 Archived Groups 時收到完整的連結，再按「Close」
- **THEN** 回到 Archived Groups，Settings 分頁的堆疊仍是「Settings」根畫面和「Archived Groups」

### Requirement: SHARING-73.1 Invite Link 開著時又收到邀請連結

IF Invite Link 開著時系統又交來一條邀請連結，THEN the mobile app SHALL 仍然只開著一個 Invite Link，顯示新交來的這一條，關閉一次就回到原來蓋住的畫面。

#### Scenario: 另一條連結

- **WHEN** app 停在 Settings 的根畫面時收到完整的連結，Invite Link 開著時又收到 `https://links.example.test/i/ASNFZ4mrze_-3LqYdlQyEA#ICEiIyQlJicoKSorLC0uLzAxMjM0NTY3ODk6Ozw9Pj8`
- **THEN** 只有一個 Invite Link，內容只有第二條連結；按一次「Close」就回到 Settings 的根畫面

#### Scenario: 同一條連結再來一次

- **WHEN** Invite Link 開著時又收到同一條完整的連結
- **THEN** 只有一個 Invite Link，內容仍是這條連結；按一次「Close」就回到原來的畫面

#### Scenario: 關閉之後再收到

- **WHEN** 關閉 Invite Link 之後，又收到第二條連結
- **THEN** Invite Link 再打開，內容只有第二條連結

### Requirement: SHARING-74.1 不是邀請連結的連結不打開 Invite Link

IF 系統交來的連結是 `shared-expense-tracker://` 開頭、卻不是 `shared-expense-tracker://i/` 開頭，THEN the mobile app SHALL 不打開 Invite Link，照連結的路徑打開畫面；沒有哪一個路徑會打開 Invite Link。

#### Scenario: 路徑以 i 開頭的畫面

- **WHEN** app 執行中，系統交來 `shared-expense-tracker://insights`
- **THEN** 在 Expenses 分頁推入「Insights」，沒有打開 Invite Link

#### Scenario: 其他畫面

- **WHEN** app 執行中，系統交來 `shared-expense-tracker://settings/manage-categories`
- **THEN** 在 Settings 分頁推入「Manage Categories」，沒有打開 Invite Link

#### Scenario: 用這種連結啟動 app

- **WHEN** 系統用 `shared-expense-tracker://groups` 啟動 app
- **THEN** 分頁列選中 Groups，沒有打開 Invite Link

#### Scenario: `://` 後面多一個斜線

- **WHEN** 邀請連結打開過 Invite Link、使用者把它關閉之後，系統交來 `shared-expense-tracker:///i/3q2-7wEjRWeJq83vEjRWeA#AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8`、`shared-expense-tracker:///i/invite` 或 `shared-expense-tracker:///i/invite?link=hello`
- **THEN** 沒有打開 Invite Link

#### Scenario: 用多一個斜線的連結啟動 app

- **WHEN** 系統用上面三條連結的任何一條啟動 app
- **THEN** 沒有打開 Invite Link

### Requirement: SHARING-75.1 (manual) 在不會自動打開 app 的瀏覽器裡，「Open in App」打開 app

WHEN 使用者在裝了 app 的手機上，從不會自動打開 app 的瀏覽器看到下載頁，例如 LINE 聊天裡的內建瀏覽器，再按「Open in App」，the mobile app SHALL 被打開並打開 Invite Link（SHARING-71.1），上面是 `shared-expense-tracker://` 開頭、帶著同一個代號和 `#` 後面的部分的連結。

#### Scenario: LINE（iPhone）

- **WHEN** 在 iPhone 的 LINE 聊天裡點完整的連結，主機換成這個環境的；LINE 的內建瀏覽器顯示下載頁之後，按「Open in App」
- **THEN** app 打開，Invite Link 上是 `shared-expense-tracker://i/3q2-7wEjRWeJq83vEjRWeA#AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8`

#### Scenario: LINE（Android）

- **WHEN** 在 Android 的 LINE 聊天裡做同樣的事
- **THEN** app 打開，Invite Link 上是同一條 `shared-expense-tracker://` 開頭的連結

#### Scenario: Safari 的網址列

- **WHEN** 把同一條連結貼進 iPhone 的 Safari 網址列，Safari 顯示下載頁之後，按「Open in App」
- **THEN** app 打開，Invite Link 上是同一條 `shared-expense-tracker://` 開頭的連結

#### Scenario: 沒裝 app

- **WHEN** 在沒裝 app 的手機上點同一條連結
- **THEN** 瀏覽器顯示下載頁；按下載連結會到這個環境設定的網址

### Requirement: SHARING-76.1 `HEAD` 得到和 `GET` 一樣的回應，沒有內容

WHEN 有人用 `HEAD` 請求 `/.well-known/apple-app-site-association`、`/.well-known/assetlinks.json` 或 `/i/<代號>`，the API SHALL 不必簽名就回和 `GET` 同一個路徑時一樣的狀態、`Content-Type` 和 `Content-Security-Policy`，沒有內容。

#### Scenario: 兩個驗證檔和下載頁

- **WHEN** 請求 `HEAD /.well-known/apple-app-site-association`、`HEAD /.well-known/assetlinks.json` 和 `HEAD /i/3q2-7wEjRWeJq83vEjRWeA`，沒有簽名
- **THEN** 三個都回 200，`Content-Type` 和 `GET` 時一樣，下載頁的 `Content-Security-Policy` 也和 `GET` 時一樣，都沒有內容

#### Scenario: 不是邀請連結的路徑

- **WHEN** 請求 `HEAD /i/a/b`
- **THEN** 回應的狀態是 4xx（SHARING-63.1）
