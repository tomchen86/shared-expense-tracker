# Sharing

## Purpose

共同帳本的加密工具（ADR-0015）：用鑰匙加密和解密內容、用私鑰簽名、把內容裝成只有另一支手機打得開的 box，以及從密鑰材料導出金鑰。工具放在 `packages/domain` 自己的入口，給手機 app 用；它不存任何東西、不連網路，也不自己產生亂數（SHARING-14.1）。演算法是 XChaCha20-Poly1305（draft-irtf-cfrg-xchacha-03）、Ed25519（RFC 8032）、X25519（RFC 7748）和 HKDF-SHA-256（RFC 5869）。位元組以十六進位寫出：`0x01` 是一個 byte，沒有 `0x` 的一串是依序的 bytes，`…` 是省略的部分。鑰匙是 32 bytes 的對稱金鑰。nonce 是呼叫者給的 24 bytes，每次加密或裝 box 都要是新的隨機值。附加資料是一段不加密、但解密時要給出一模一樣的 bytes，可以是空的。密文是 SHARING-1.1 的格式，它的第一個 byte 是格式版本。簽名私鑰是 32 bytes 的 Ed25519 私鑰，box 私鑰是 32 bytes 的 X25519 私鑰，各有一把 32 bytes 的公開金鑰（SHARING-5.1、7.1）。共享密鑰是 X25519 用一把 box 私鑰和另一把 box 公開金鑰算出的 32 bytes。box 是交出方裝給收受方的密文（SHARING-8.1）：情境是裝 box 時給的一段 bytes，可以是空的；salt 是裝 box 時可以再給的 32 bytes；打開時兩者都要和裝的時候一樣。密鑰材料是導出金鑰的來源，用途是用來區分金鑰的一段 bytes，兩者都可以是字串（SHARING-12.1）。解密密文或打開 box 有兩種失敗：解不開（SHARING-3.1、10.1、11.1）和不認得格式版本（SHARING-4.1），兩種都不回傳任何內容。拒絕是丟出錯誤，不產出任何結果；長度不對的輸入一律先被拒絕（SHARING-15.1），其他的規則說的都是長度對的輸入。

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

### Requirement: SHARING-4.1 不認得的格式版本

IF 要解密的密文或要打開的 box 的第一個 byte 不是 `0x01`，THEN the domain package SHALL 回報不認得這個格式版本，不回傳任何內容，不管其餘的 bytes 和其他的輸入對不對。

#### Scenario: 其他的格式版本

- **WHEN** 把一段解得開的密文的第一個 byte 換成 `00`，或 `02` 到 `ff` 的任何一個值，再用原本的鑰匙和附加資料解密
- **THEN** 回報不認得格式版本

#### Scenario: 其他的輸入也不對

- **WHEN** 密文只有 `00`、`02` 或 `ff` 一個 byte；或第一個 byte 是 `02`，鑰匙和附加資料也不是加密時的
- **THEN** 回報不認得格式版本

#### Scenario: box

- **WHEN** 把一個打得開的 box 的第一個 byte 換成 `02`，再照原樣打開，或改用別的交出方公開金鑰和情境打開
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

### Requirement: SHARING-7.1 box 私鑰的公開金鑰

WHEN 從 box 私鑰算公開金鑰，the domain package SHALL 回傳 RFC 7748 的 X25519 用這把私鑰和基點 9 算出的 32 bytes。

#### Scenario: RFC 7748 6.1 的 Alice 和 Bob

- **WHEN** box 私鑰是 Alice 的 `77076d0a7318a57d3c16c17251b26645df4c2f87ebc0992ab177fba51db92c2a` 和 Bob 的 `5dab087e624a8a4b79e17f8b83800ee66f3bb1292618b6fd1c2f8b27ff88e0eb`
- **THEN** 公開金鑰分別是 `8520f0098930a754748b7ddcb43ef75a0dbf3a0d26381af4eba4a98eaa9b4e6a` 和 `de9edb7d7b7dc1b4d35b61c2ece435373f8343c85b78674dadfc7e146f882b4f`

### Requirement: SHARING-8.1 box 是用雙方的共享密鑰導出的鑰匙加密的密文

WHEN 交出方用自己的 box 私鑰、收受方的 box 公開金鑰、一段情境、一個 nonce 和可以沒有的 salt 把一段內容裝成 box，the domain package SHALL 產出這段內容的密文（SHARING-1.1），附加資料是空的，鑰匙是 HKDF-SHA-256 輸出的前 32 bytes：IKM 是這把私鑰和這把公開金鑰的共享密鑰，salt 是給的 salt、沒給時是 32 個 `0x00`，info 依序是 ASCII 的 `shared-expense/box/v1`、交出方的公開金鑰、收受方的公開金鑰和情境。

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

### Requirement: SHARING-9.1 收受方打得開 box

WHEN 收受方用自己的 box 私鑰、交出方的 box 公開金鑰，和裝 box 時的情境和 salt 打開 box，the domain package SHALL 回傳裝進去的內容。

#### Scenario: Bob 打開 Alice 的 box

- **WHEN** Bob 用自己的私鑰、Alice 的公開金鑰和情境 `a0a1a2a3a4a5a6a7`，打開 SHARING-8.1 第一個 scenario 的 box；再加上那段 salt，打開第二個 scenario 的 box
- **THEN** 兩次都得到 `101112131415161718191a1b1c1d1e1f202122232425262728292a2b2c2d2e2f`

#### Scenario: 沒給 salt 和 32 個 0x00 是同一段 salt

- **WHEN** Bob 打開第一個 scenario 的 box 時，salt 給 32 個 `0x00`
- **THEN** 一樣打得開

#### Scenario: 各種內容、情境和 salt

- **WHEN** 另外兩支手機之間裝 0、32 和 1,000 bytes 的內容，情境是空的、8 bytes 或 100 bytes，有 salt 或沒有，再由收受方照樣打開
- **THEN** 每次都得到裝進去的內容

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

- **WHEN** 對方的公開金鑰是 `0000000000000000000000000000000000000000000000000000000000000080` 或 `ecffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff`，也就是上面兩個點把最後一個 byte 最高的 bit 設成 1
- **THEN** 結果和上一個 scenario 一樣

### Requirement: SHARING-12.1 從密鑰材料和用途導出金鑰

WHEN 從一段密鑰材料和一個用途導出金鑰，the domain package SHALL 回傳 HKDF-SHA-256 輸出的前 32 bytes：IKM 是密鑰材料，info 是用途，salt 是給的 salt、沒給時是空的，密鑰材料或用途是字串時用它的 UTF-8 編碼，所以同樣的輸入得到同樣的金鑰，不同的用途得到不同的金鑰。

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

### Requirement: SHARING-13.1 每個演算法都通過標準測試向量

The domain package SHALL 對每個演算法的標準測試向量給出標準列出的結果：XChaCha20-Poly1305 是 draft-irtf-cfrg-xchacha-03 的 A.3.1，Ed25519 是 RFC 8032 7.1 的五個測試，X25519 是 RFC 7748 的 6.1，HKDF-SHA-256 是 RFC 5869 的 A.1 到 A.3。

#### Scenario: XChaCha20-Poly1305

- **WHEN** 用 A.3.1 的鑰匙、nonce 和附加資料加密它的明文，再解密結果
- **THEN** 密文在 `01` 和 nonce 之後是 A.3.1 列出的密文和驗證碼 `c0875924c1c7987947deafd8780acf49`，解密得到原本的明文

#### Scenario: Ed25519

- **WHEN** 用 TEST 1、TEST 2、TEST 3、TEST 1024 和 TEST SHA(abc) 的私鑰算公開金鑰，並簽各自的訊息
- **THEN** 公開金鑰和簽名都和 RFC 列出的一樣，例如 TEST 1 簽 0 bytes 的訊息得到 `e5564300c360ac729086e2cc806e828a84877f1eb8e5d974d873e065224901555fb8821590a33bacc61e39701cf9b46bd25bf5f0595bbe24655141438e7a100b`

#### Scenario: X25519

- **WHEN** 從 6.1 的兩把私鑰算公開金鑰，由 Alice 裝一個 box 給 Bob，再由 Bob 打開
- **THEN** 公開金鑰和 RFC 列出的一樣，box 的鑰匙出自 RFC 列出的共享密鑰 `4a5d9d5ba4ce2de1728e3bf480350f25e07e21c947d19e3376f09b3c1e161742`（SHARING-8.1 的第一個 scenario），Bob 打得開

#### Scenario: HKDF-SHA-256

- **WHEN** 把 A.1、A.2 和 A.3 的 IKM 當密鑰材料、info 當用途，連同各自的 salt 導出金鑰
- **THEN** 金鑰是各自列出的 OKM 的前 32 bytes：`3cb25f25faacd57a90434f64d0362f2a2d2d0a90cf1a5a4c5db02d56ecc4c5bf`、`b11e398dc80327a1c8e7f78c596a49344f012eda2d4efad8a050cc4c19afa97c` 和 `8da4e775a563c18f715f802a063c5a31b8a11f5c5ee1879ec3454e5f3c738d2d`

### Requirement: SHARING-14.1 亂數只來自呼叫者

The domain package SHALL 只用呼叫者交給它的鑰匙、私鑰、nonce 和 salt，不向執行環境要亂數：同樣的輸入每次都得到同樣的結果，在沒有 Web Crypto 的執行環境（例如 Hermes）也一樣。

#### Scenario: 同樣的輸入

- **WHEN** 用同樣的輸入各做兩次加密、裝 box、簽名、算兩種公開金鑰和導出金鑰
- **THEN** 兩次的結果一模一樣

#### Scenario: 執行環境沒有 Web Crypto

- **WHEN** 執行環境沒有 Web Crypto，再做上面每一件事，以及解密和打開 box
- **THEN** 結果都和上面各個 scenario 列出的一樣，而且沒有呼叫 `Math.random` 或 Node 的亂數函式

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
