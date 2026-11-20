# Sharing

## Purpose

共同帳本靠金鑰認手機，內容加密之後才離開手機（ADR-0015、ADR-0022）。這裡有六塊：`packages/domain` 的加密工具（SHARING-1.1 到 16.1）；手機 app 的裝置身分，和它怎麼替送給 API 的每個請求簽名（SHARING-19.1 到 30.1、43.1、45.1、46.1）；API 怎麼替手機註冊、檢查簽名和限制請求（SHARING-31.2 到 42.1、44.1、47.1 到 51.1）；邀請連結的基礎（SHARING-60.1 到 76.1）；API 怎麼替共同帳本存下邀請和它的名片（SHARING-77.1 到 89.1）；和手機 app 怎麼讓群組變成共同帳本、建立和撤回邀請（SHARING-90.1 到 111.1）。手機 app 和 API 用 `packages/domain` 的同一個函式組出要簽的 bytes（SHARING-17.1、18.1）。裝置身分和簽名沒有畫面：授權失效的手機除了不能邀請（SHARING-106.1）之外畫面上顯示什麼，不在這裡。

加密工具：用鑰匙加密和解密內容、用私鑰簽名、把內容裝成只有另一支手機打得開的 box，以及從密鑰材料導出金鑰。工具放在 `packages/domain` 自己的入口，給手機 app 用；它不存任何東西、不連網路，也不自己產生鑰匙、私鑰、nonce 或 salt（SHARING-14.1）。演算法是 XChaCha20-Poly1305（draft-irtf-cfrg-xchacha-03）、Ed25519（RFC 8032）、X25519（RFC 7748）和 HKDF-SHA-256（RFC 5869）。bytes 是一個 `Uint8Array`，以十六進位寫出：`0x01` 是一個 byte，沒有 `0x` 的一串是依序的 bytes，`…` 是省略的部分。鑰匙是 32 bytes 的對稱金鑰。nonce 是呼叫者給的 24 bytes，每次加密或裝 box 都要是新的隨機值。附加資料是一段不加密、但解密時要給出一模一樣的 bytes，可以是空的。密文是 SHARING-1.1 的格式，它的第一個 byte 是格式版本。簽名私鑰是 32 bytes 的 Ed25519 私鑰，box 私鑰是 32 bytes 的 X25519 私鑰，各有一把 32 bytes 的公開金鑰（SHARING-5.1、7.1）。共享密鑰是 X25519 用一把 box 私鑰和另一把 box 公開金鑰算出的 32 bytes。box 是交出方裝給收受方的密文（SHARING-8.1）：情境是裝 box 時給的一段 bytes，可以是空的；salt 是裝 box 時可以再給的 32 bytes；打開時兩者都要和裝的時候一樣。密鑰材料是導出金鑰的來源，用途是用來區分金鑰的一段 bytes，兩者都可以是字串（SHARING-12.1）。解密密文或打開 box 有兩種失敗：解不開（SHARING-3.1、10.1、11.1）和不認得格式版本（SHARING-4.2），兩種都不回傳任何內容。`packages/domain` 拒絕，是丟出錯誤，不產出任何結果。不是 bytes 的輸入一律先被拒絕（SHARING-16.1），只有導出金鑰的密鑰材料和用途也可以是字串；其他的規則說的都是這樣的輸入。沒給一個輸入，是指沒有它，或它是 `undefined`；只有 salt 可以不給。SHARING-15.1 列出的輸入（鑰匙、私鑰、nonce、box 的 salt 和裝 box 時收受方的公開金鑰）長度不對時也一律先被拒絕；要解密的 bytes、要打開的 box 和交出方的公開金鑰不管多長，都照其他的規則回報。

裝置身分是一支手機給 API 認的身分：一個裝置 ID 和一個 seed。裝置 ID 是小寫的第 4 版 UUID，存在本機資料（shell）；seed 是 32 bytes 的隨機值，只存在 `expo-secure-store`（下面叫 secure store），本機資料和 API 都沒有它。簽名私鑰從 seed 導出（SHARING-21.1），它的公開金鑰就是這支手機的公開金鑰。一支手機是這三種之一：沒有裝置身分，是本機資料沒有裝置 ID；有裝置身分，是本機資料有裝置 ID，secure store 裡也有它的 seed；授權失效，是本機資料有裝置 ID，secure store 裡卻沒有它的 seed（SHARING-29.1）。送請求是手機 app 的其他功能要連 API 時做的事：交出 API 的網址、方法、路徑和可以沒有的內容，得到 API 的回應，或得知沒有得到回應、沒有送出（SHARING-22.1 到 30.1）；內容是 bytes，交來的是文字時用它的 UTF-8 編碼。送請求失敗，是呼叫的一方得到錯誤，不是上面任何一種結果（SHARING-24.1、25.1、30.1、45.1）。手機 app 用執行環境全域的 `fetch` 連 API。註冊是手機把裝置 ID 和公開金鑰交給 API（SHARING-22.1、38.1）。手機的時鐘是手機自己的時間；時間差是 API 的時間減掉手機的時鐘，由 API 告訴手機（SHARING-27.1），還沒得知時是 0；校正後的時間是手機的時鐘加上時間差。重新啟動 app 是結束 app 再打開，本機資料和 secure store 裡的東西都還在。

簽名的請求是帶著四個欄位的 HTTP 請求：裝置 ID、請求時間、請求的 nonce 和簽名。請求時間是簽名當下的時間，從 1970-01-01T00:00:00Z 起的毫秒數；請求的 nonce 是 16 bytes 的隨機值，寫成 32 個小寫十六進位字元，和加密用的 nonce 無關；簽名是簽名私鑰對要簽的 bytes（SHARING-17.1）的簽名（SHARING-6.1），寫成 128 個小寫十六進位字元。方法是 HTTP 的方法，例如 `GET` 和 `POST`。路徑是請求的網址裡，從主機後面的 `/` 起到結尾的部分，有查詢時連 `?` 和查詢在內；它只能用送出和收到時都不會被改寫的寫法（SHARING-18.1），所以手機簽的和 API 收到的是同一段文字。請求的內容是 HTTP 的 body，沒有時是 0 bytes；`GET` 和 `HEAD` 的請求，API 一律當它的內容是 0 bytes，不讀它帶的 body（SHARING-51.1）：手機不送帶內容的 `GET` 和 `HEAD`（SHARING-45.1），而 API 拿不拿得到這種 body，要看它跑在 Node 還是 Cloudflare Workers 上。內容雜湊是內容那些 bytes 的 SHA-256。標明的內容長度是請求的 `Content-Length` 寫的 bytes 數；沒有 `Content-Length` 就是沒有標明，這時不論內容怎麼送來，收到結尾才知道它有多長，HTTP/1.1 的分段送（`Transfer-Encoding: chunked`）是其中一種。內容的上限是 1,048,576 bytes（1 MiB），不是打公開的路由的請求都用這一個（SHARING-48.2）；API 不等過大的內容送完就拒絕（SHARING-49.1），所以不必把超過上限的內容留在記憶體裡，沒簽名的人送再大的內容也一樣。四個欄位怎麼放進請求、註冊的內容，和 API 每種回應的格式，都定義在 `packages/domain` 的程式裡，手機 app 和 API 用同一份。

API 的時間是 API 處理請求時自己的時鐘，從 1970-01-01T00:00:00Z 起的毫秒數。請求通過檢查，是它是簽名的請求，而且沒有被 SHARING-32.1 到 37.1 和 48.2 任何一條拒絕，註冊的請求還要沒有被 SHARING-39.1 到 41.1 和 47.1 拒絕，也不是 SHARING-44.1 說的、API 不註冊的那一種；通過檢查的請求才交給路由。這裡的 requirement 說 API 拒絕一個請求，是回應一個帶著原因的拒絕，不做這個請求要做的事，資料庫和收到它之前一模一樣；原因是簽名、時鐘、重送、請求太多、內容不對、內容太大或註冊太多。通過檢查之後才被路由自己拒絕的請求不在這裡：它已經通過檢查，所以算進這支裝置的請求數，nonce 也用掉了，路由的 requirement 自己說它拒絕時什麼不變（SYNC-60.1、SHARING-87.1）。公開的路由是不必簽名的路由：`GET /health`，以及在自己的 requirement 裡寫明不必簽名的路由（SHARING-60.1 到 62.1、76.1）；公開的路由不讀請求的內容（SHARING-50.1）。IP 是請求來自的 IPv4 或 IPv6 位址：API 在 Cloudflare Workers 上時是 Cloudflare 放在 `CF-Connecting-IP` 的位址，在 Node 上時是連線的來源位址，都不是請求自己帶的其他標頭。IP 雜湊的金鑰是 API 所在的環境給它的一段保密的文字，用來算 IP 加了金鑰的雜湊（SHARING-42.1、44.1）。

SHARING-17.1 到 51.1 的情境裡，T 是 `2026-11-18T06:32:00Z`，也就是 1794983520000；除非另外說明，手機的時鐘和 API 的時間都是 T，API 的網址是 `https://api.example.test`。Taylor 的手機的裝置 ID 是 `0f8fad5b-d9cb-469f-a165-70867728950e`，Casey 的手機是 `7c9e6679-7425-40de-944b-e07fc1f90ae7`，各有自己的簽名私鑰；API 的情境裡，除非另外說明，請求都來自 `203.0.113.7`，Taylor 的手機已經註冊。`/no-such-route` 是一個沒有路由的路徑。

邀請連結的基礎（ADR-0023）：點邀請連結時，裝了 app 的手機直接打開 app，沒裝的人看到下載頁（SHARING-60.1 到 76.1）。邀請連結是 `https://<主機>/i/<代號>#<字串>`（ADR-0015）：主機是 API 在這個環境的網域，代號是路徑裡 `/i/` 後面的那一段，`#` 後面的部分只留在開連結的那支手機上，瀏覽器不會把它送給任何伺服器。API 給三樣東西：iOS 和 Android 用來確認這個網域的連結歸 app 開的兩個驗證檔（SHARING-60.1、61.1），和下載頁（SHARING-62.1 到 68.1）；誰都可以拿，請求不必簽名，也不必帶裝置身分，用 `HEAD` 問也一樣（SHARING-76.1）。它們的內容出自這個環境的 App 設定：開邀請連結的 iOS App，各寫成 `<Team ID>.<bundle ID>`；開邀請連結的 Android App，各有 package 名稱和簽它的憑證的 SHA-256 指紋；以及 iPhone 和 Android 各一個下載連結。每一項都可以沒有。下載頁是 API 對邀請連結的路徑回的網頁；頁面上的文字是它顯示給人看的字，不算 `<head>`、`<script>` 和 `<style>` 裡的。對手機 app 來說，邀請連結是系統交給它的這兩種連結：scheme 是 `https`、路徑以 `/i/` 開頭的連結，不管主機是什麼，因為系統只把驗證過的網域的連結交給 app；和以 `shared-expense-tracker://i/` 開頭的連結，也就是下載頁的「Open in App」帶的那一種（SHARING-66.1）。系統交連結給 app 有兩個時機：app 沒在執行時用它啟動 app，和 app 執行中時交給它。SHARING-60.1 到 76.1 不看代號和 `#` 後面的部分是什麼，也不看有沒有這個邀請：下載頁對每個代號都一樣，手機 app 收到連結之後看群組和申請加入也還不在這裡。SHARING-60.1 到 76.1 的情境裡，API 的網址是 `https://links.example.test`，「完整的連結」是 `https://links.example.test/i/3q2-7wEjRWeJq83vEjRWeA#AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8`，它的代號和 `#` 後面的部分只是長度和字元像真的例子。

邀請（ADR-0015、ADR-0026）：共同帳本的成員建立邀請，把它的連結或 QR code 交給別人；邀請可以給好幾個人用。代號是 16 bytes 的隨機值，`#` 後面的字串是 32 bytes 的隨機值，都由建立邀請的手機產生，寫成沒有 `=` 的 base64url（RFC 4648 第 5 節），分別是 22 個和 43 個字元；16 bytes 的寫法最後一個字元只會是 `A`、`Q`、`g` 或 `w`，32 bytes 的寫法最後一個字元只會是 `AEIMQUYcgkosw048` 裡的一個。名片是手機加密過的群組名稱和成員名單（SHARING-95.1），讓拿到連結的人在申請之前看得到要加入哪個群組；API 不解讀它，它是 41 到 65,536 bytes，在請求和回應裡寫成小寫的十六進位。名片的 cursor 是上傳名片的手機那時在這個群組的 cursor（sync）。

邀請 API 是三個簽名的請求，先通過對簽名的請求的檢查，才輪到 SHARING-77.1 到 89.1：建立邀請是 `PUT /groups/<群組 ID>/invites/<代號>`，內容是 JSON，更新名片也是它；撤回是 `DELETE /groups/<群組 ID>/invites/<代號>`，沒有內容；讀邀請是 `GET /invites/<代號>`。群組、成員手機和群組最新的序號是 sync 的事件 API 的那一些。API 上的邀請是 API 替一個群組記的東西：代號、到期時間、有沒有被撤回，以及名片和名片的 cursor。到期時間是建立時 API 的時間加 604,800,000 毫秒，也就是 7 天。有效的邀請是沒有被撤回、API 的時間也比到期時間早的邀請；一個群組同時最多有一個。API 見過的代號，是 API 記著的任何一個邀請的代號，不管那個邀請有沒有效。API 回答邀請建立好了、撤回好了，指的都是狀態碼 200。邀請 API 拒絕一個請求，是回應一個帶著原因的拒絕，不做這個請求要做的事：原因是內容不對（400）、不是成員（403，sync 的同一個原因）、已經有邀請（409，`invite-exists`）或沒有這個邀請（404，`no-invite`）。請求的內容和每種回應有哪些欄位、各是什麼型別，定義在 `packages/domain` 的程式裡，手機 app 和 API 用同一份。誰來申請加入、怎麼同意，都不在這裡。

API 的情境（SHARING-77.1 到 89.1）沿用 sync 的 API 情境：T、Taylor 和 Casey 的手機、Brisbane 和 Tokyo 都和那裡一樣，Brisbane 已經由 Taylor 的手機建立，Tokyo 還沒有建立，除非另外說明。代號 A 是 `3q2-7wEjRWeJq83vEjRWeA`，代號 B 是 `AAECAwQFBgcICQoLDA0ODw`，代號 C 是 `__7dzLuqmYh3ZlVEMyIRAA`。名片 X、Y、Z、W 各是 200 bytes、內容不同的隨機 bytes；除非另外說明，名片的 cursor 是 0。情境說一支手機是成員手機，而那個群組不是它建立的，是測試直接把它記成成員手機。

手機 app 這一邊（SHARING-90.1 到 111.1）：API 的網址是 app 建置時環境變數 `EXPO_PUBLIC_API_URL` 給的網址，沒有結尾的 `/`，例如 `https://api.example.test`；邀請連結的主機就是它的主機。群組鑰匙是共同帳本的手機加密事件用的 32 bytes 的鑰匙，一個鑰匙世代一把（ADR-0015）；這裡只產生世代 1 的，事件怎麼用它加密不在這裡（sync）。手機上的邀請是本機資料替一個共同帳本存著的邀請：代號、`#` 後面的字串和到期時間；校正後的時間比到期時間早，它就是有效的。邀請是共同帳本的一種紀錄：建立和撤回都寫成事件（SYNC-80.1），別的成員手機套用事件之後也存著它（SYNC-81.1），所以每位成員看到的是同一條連結，也都能撤回。待上傳的事件、共同帳本、校正後的時間和套用見 sync。Invite 是從 Members 打開的畫面。準備邀請是按「Invite with Link」或「Try Again」之後手機做的事：有有效的邀請就顯示它（SHARING-100.1），沒有就建立一個，群組還不是共同帳本時先讓它變成共同帳本（SHARING-92.1）；它的結果是 Invite 顯示邀請，或顯示一句說明。

手機 app 的情境（SHARING-90.1 到 111.1）裡，T、手機的時鐘和 API 的時間同 SHARING-17.1 的情境，API 的網址是 `https://api.example.test`，名字是 Taylor，手機的地區是美國、時區是 `Asia/Taipei`。Brisbane 和 Tokyo 是 Taylor 建立的群組；除非另外說明，它們還不是共同帳本，手機沒有裝置身分，API 照 SHARING-31.2 到 89.1 和 SYNC-45.1 回答。「邀請建立好了」指 Invite 顯示邀請連結。

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

#### Scenario: API 因為內容太大拒絕

- **WHEN** API 因為內容太大拒絕一個請求（SHARING-48.2）
- **THEN** 呼叫的一方拿到這個拒絕的狀態碼 413 和內容，API 只收到這個請求一次，手機沒有把它拆小或再送

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

### Requirement: SHARING-31.2 除了公開的路由，請求通過檢查才交給路由

The API SHALL 只把通過檢查的簽名的請求交給路由，公開的路由除外：檢查依序是欄位（SHARING-32.1）、內容太大（SHARING-48.2）、裝置和簽名（SHARING-33.1、34.2）、時鐘（SHARING-35.1）、重送（SHARING-36.1）和請求太多（SHARING-37.1），第一個沒通過的決定拒絕的原因。註冊的請求多三項：內容太大之後先檢查內容（SHARING-39.1、47.1）；裝置和簽名那一項，是用內容裡的公開金鑰驗簽名，而且裝置 ID 沒有用別把公開金鑰註冊過（SHARING-38.1、40.1）；請求太多之後，最後才檢查註冊太多（SHARING-41.1）。路徑沒有路由的請求也要通過檢查，通過了才回答找不到。

#### Scenario: 沒簽名的請求

- **WHEN** 沒帶四個欄位的請求打 `POST /devices`、`GET /no-such-route` 或 `GET /`
- **THEN** 都被拒絕，原因是簽名；`GET /no-such-route` 得到的不是找不到

#### Scenario: 通過檢查、沒有路由

- **WHEN** Taylor 的手機送簽名的 `GET /no-such-route`
- **THEN** API 回答找不到（404），不是拒絕

#### Scenario: 公開的路由

- **WHEN** 沒簽名的請求打 `GET /health`、`HEAD /health`、`POST /health` 和 `GET /health/more`
- **THEN** API 照常回答 `GET /health`（200）；另外三個不是公開的路由，被拒絕，原因是簽名

#### Scenario: 驗證檔和下載頁

- **WHEN** 沒簽名的請求打 `GET /.well-known/apple-app-site-association`、`GET /.well-known/assetlinks.json`、`GET /i/a` 和 `HEAD /i/a`，以及 `POST /i/a`、`GET /i/a/b`、`GET /.well-known/other` 和 `POST /.well-known/assetlinks.json`
- **THEN** 前四個是公開的路由（SHARING-60.1 到 62.1、76.1），API 照常回答（200）；後四個不是，被拒絕，原因是簽名

#### Scenario: 第一個沒通過的檢查決定原因

- **WHEN** Taylor 的手機送三個請求：一個簽名被改掉一個 bit，請求時間也早了一小時；一個簽名對，請求時間早了一小時；一個簽名和請求時間都對，nonce 是它之前通過檢查的請求用過的，而且它在這一分鐘已經有 60 個請求通過檢查
- **THEN** 拒絕的原因分別是簽名、時鐘和重送

#### Scenario: 內容太大排在欄位之後、其他檢查之前

- **WHEN** 八個請求標明的內容長度都是 1,048,577 bytes。三個是 Taylor 的手機簽好的，送出時一個少了簽名這個欄位，一個把裝置 ID 寫成大寫，一個把 nonce 寫成大寫。另外五個的四個欄位寫法都對：三個是 Taylor 的手機簽的，一個簽名被改掉一個 bit、請求時間也早了一小時，一個簽名對、請求時間早了一小時，一個打 `/no-such-route//x`；兩個是還沒註冊的 Casey 的手機簽的，一個打 `/no-such-route`，一個是註冊的請求，內容不是 JSON。八個都只送出標頭，一個 byte 的內容都沒送
- **THEN** 前三個被拒絕的原因是簽名，後五個都是內容太大

#### Scenario: 沒有標明內容長度時，順序一樣

- **WHEN** 上面後五個請求改成不標明內容長度，各分段送了 1,048,577 bytes 之後不再送，也不結束
- **THEN** 五個被拒絕的原因都是內容太大

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

### Requirement: SHARING-34.2 簽名對不上收到的請求

IF 請求的簽名，不是這支裝置註冊的公開金鑰對收到的請求的簽名，THEN the API SHALL 拒絕，原因是簽名：要簽的 bytes 照 SHARING-17.1，用收到的方法、路徑、收到的內容的雜湊，和請求帶的裝置 ID、請求時間和 nonce；簽名用 Web Crypto 的 `Ed25519` 驗。`GET` 和 `HEAD` 的請求收到的內容是 0 bytes（SHARING-51.1），不論它帶了什麼 body，所以用的是 0 bytes 的雜湊。收到的方法或路徑寫法不對、組不出要簽的 bytes（SHARING-18.1）的請求，也因為簽名被拒絕。註冊的請求用它內容裡的公開金鑰驗（SHARING-38.1、40.1）。

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

IF 一支裝置已經有 60 個請求，在 API 的時間過去不到 60,000 毫秒內通過檢查，THEN the API SHALL 拒絕它的下一個請求，原因是請求太多，並在回應裡帶著要等的毫秒數：那 60 個裡最早的一個，離滿 60,000 毫秒還有多久。沒通過檢查的請求都不算在 60 個裡；註冊的請求、路徑沒有路由的請求，和通過檢查之後才被路由自己拒絕的請求（SYNC-60.1），通過檢查的都算。同時送到的請求也一樣，通過檢查的不超過 60 個。

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

WHEN 對 `/devices` 的 `POST` 是簽名的請求，內容是一把 Ed25519 公開金鑰，簽名用這把公開金鑰驗得過（SHARING-34.2），也通過其餘的檢查，the API SHALL 存下這個裝置 ID 和這把公開金鑰，回答註冊好了；之後這支裝置的請求都用這把公開金鑰驗。這個裝置 ID 已經用同一把公開金鑰註冊過時，只回答註冊好了，不多存一支裝置；同一支裝置、同一把公開金鑰的幾個註冊同時送到時也一樣，每一個都回答註冊好了，只存一支，只算一支新的裝置（SHARING-41.1）。

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

#### Scenario: 兩把公開金鑰同時註冊同一個裝置 ID

- **WHEN** 兩支手機用同一個還沒註冊的裝置 ID，各用自己的公開金鑰和簽名私鑰，同時送註冊的請求
- **THEN** 只有一支註冊好了；另一支被拒絕，原因是簽名，它的公開金鑰沒有存下，之後只有註冊好的那一支簽的請求通過檢查

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

The API SHALL 為了註冊和檢查，關於一支手機只存它的裝置 ID 和公開金鑰，以及檢查要用的東西：它通過檢查的請求的 nonce 和時間，和它註冊時 IP 加了金鑰的雜湊；IP 本身、IP 不加金鑰的雜湊，和請求的其他標頭都不存。它在群組裡的東西另外照 SYNC-61.1。

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

### Requirement: SHARING-45.1 GET 和 HEAD 帶了內容就不送

IF 呼叫的一方要送的請求，方法是 `GET` 或 `HEAD`，卻帶了不是空的內容，THEN the mobile app SHALL 讓送請求失敗，不產生裝置身分，也不發出任何網路請求。`fetch` 不送帶內容的 `GET` 和 `HEAD`；照樣去送的話，呼叫的一方只會得知沒有得到回應，以為是網路的問題。內容是 0 bytes 或空的文字時，算是沒有內容，照常送出。

#### Scenario: 帶了內容

- **WHEN** 沒有裝置身分的手機，或註冊好了的手機，送帶著 `00ff10` 這 3 bytes 或文字 `{}` 的 `GET`，或帶著 1 byte 或文字 `x` 的 `HEAD`
- **THEN** 送請求失敗，沒有發出網路請求；沒有裝置身分的手機仍然沒有裝置身分

#### Scenario: 內容是空的

- **WHEN** 註冊好了的手機送 `GET` 或 `HEAD`，交來的內容是 0 bytes，或空的文字
- **THEN** 請求照常送出，沒有內容，簽的內容雜湊是 0 bytes 的 SHA-256

### Requirement: SHARING-46.1 匯入匯出檔時，裝置身分的紀錄換成檔案裡的

WHEN 使用者匯入匯出檔（BACKUP-13.2），the mobile app SHALL 把這支手機的裝置 ID、註冊好了的記號和時間差，和其他本機資料一樣換成匯出檔裡的，匯出檔裡沒有就都沒有；secure store 裡的項目不動，過程中不發出任何網路請求。匯出檔帶著匯出那支手機的這三項（BACKUP-3.1），不帶 seed 和簽名私鑰。所以匯入之後：匯出檔的裝置 ID 在這支手機的 secure store 裡有 seed，這支手機就有裝置身分；沒有，就是授權失效（SHARING-29.1）；匯出檔沒有裝置 ID，就是沒有裝置身分，下一次送請求時產生新的（SHARING-20.1）。這支手機原本的 seed 留在 secure store 裡，不再使用（SHARING-24.1）。

#### Scenario: 匯出檔的內容

- **WHEN** 註冊好了的手機點「Export Data」
- **THEN** 匯出檔裡有它的裝置 ID；在匯出檔的 bytes 裡找不到它的 seed 和簽名私鑰，不論是原始的 bytes、十六進位還是 Base64

#### Scenario: 匯入別支手機的匯出檔

- **WHEN** Taylor 的手機和 Casey 的手機都註冊好了，各有自己的 secure store，在 Casey 的手機上匯入 Taylor 的手機的匯出檔
- **THEN** Casey 的手機是授權失效，裝置 ID 是 Taylor 的手機的；Casey 的手機的 secure store 裡仍只有它原本的那個項目，沒有被改；匯入時沒有發出網路請求，之後送請求得知授權失效，也不發出網路請求

#### Scenario: 匯入沒有裝置身分的匯出檔

- **WHEN** 註冊好了的手機，匯入一支沒有裝置身分的手機的匯出檔，之後送一個請求
- **THEN** 匯入之後這支手機沒有裝置身分；送請求時產生新的裝置 ID 和 seed 並註冊，公開金鑰和原本的不同，secure store 裡原本的項目還在、沒有被改

#### Scenario: 匯入自己之前的匯出檔

- **WHEN** 註冊好了、時間差是 3,600,000 的手機匯出之後，時間差被校正成 0，再匯入自己剛才的匯出檔
- **THEN** 這支手機有裝置身分，裝置 ID 不變；時間差回到 3,600,000；API 的時間仍比手機快一小時的話，下一個請求直接送出並通過，沒有先註冊

### Requirement: SHARING-47.1 低階的 Ed25519 公開金鑰不能註冊

IF 註冊的請求內容裡的公開金鑰是 Ed25519 的低階點，THEN the API SHALL 拒絕，原因是內容不對，不論 API 所在的執行環境驗簽名時接不接受這種公開金鑰。低階點沒有對應的私鑰，卻有不必私鑰就驗得過的簽名，所以拿它註冊的裝置 ID，誰都能冒用。低階點有八個；連同它們不標準的寫法，就是下面列的七個寫法，和把這七個最後一個 byte 最高的 bit 設成 1 的另外七個。

#### Scenario: 十四個寫法

- **WHEN** Casey 的手機送註冊的請求，內容裡的公開金鑰是 `0000000000000000000000000000000000000000000000000000000000000000`、`0100000000000000000000000000000000000000000000000000000000000000`、`26e8958fc2b227b045c3f489f2ef98f0d5dfac05d3c63339b13802886d53fc05`、`c7176a703d4dd84fba3c0b760d10670f2a2053fa2c39ccc64ec7fd7792ac037a`、`ecffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff7f`、`edffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff7f` 或 `eeffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff7f`，或這七個把最後一個 byte 最高的 bit 設成 1 的寫法（最後一個 byte 分別是 `80`、`80`、`85`、`fa`、`ff`、`ff`、`ff`）；簽名是 `01` 接著 63 個 `00`，或是 Casey 的簽名私鑰簽的
- **THEN** 都被拒絕，原因是內容不對，Casey 的裝置 ID 沒有註冊；之後帶著 `01` 接著 63 個 `00` 這個簽名、用這個裝置 ID 的請求，因為簽名被拒絕

#### Scenario: 不是低階點的公開金鑰

- **WHEN** 註冊的請求內容裡的公開金鑰是 `0300000000000000000000000000000000000000000000000000000000000000`，簽名是 `01` 接著 63 個 `00`
- **THEN** 它不是低階點，內容是對的；被拒絕的原因是簽名

### Requirement: SHARING-48.2 內容超過 1 MiB 的請求

IF 不是打公開的路由的請求四個欄位的寫法都對，而它的內容超過 1,048,576 bytes，THEN the API SHALL 拒絕，原因是內容太大，不論內容是什麼、簽名對不對、裝置有沒有註冊。有標明內容長度時，看的是標明的數字；沒有標明時，看的是收到的 bytes 數。剛好 1,048,576 bytes 的內容不算太大，照其餘的檢查處理。`GET` 和 `HEAD` 的請求的內容是 0 bytes（SHARING-51.1），不論它帶的 body 標明多長、送來多少，都不算太大。

#### Scenario: 多 1 byte

- **WHEN** Taylor 的手機送簽名的 `POST /no-such-route`，內容是 1,048,577 bytes，簽名是對這些內容簽的
- **THEN** 被拒絕，原因是內容太大（413），資料庫和收到它之前一模一樣

#### Scenario: 剛好在上限

- **WHEN** Taylor 的手機送兩個簽名的 `POST /no-such-route`，內容都是 1,048,576 bytes，一個標明內容長度，一個沒有標明、分段送完；再送一個一樣大的，簽名被改掉一個 bit
- **THEN** 前兩個通過檢查；第三個被拒絕，原因是簽名，不是內容太大

#### Scenario: 沒有標明內容長度

- **WHEN** Taylor 的手機送簽名的 `POST /no-such-route`，沒有標明內容長度，內容分段送完，總共 1,048,577 bytes，簽名是對這些內容簽的
- **THEN** 被拒絕，原因是內容太大，資料庫和收到它之前一模一樣

#### Scenario: 註冊的請求

- **WHEN** Casey 的手機還沒註冊，送註冊的請求，內容是它的公開金鑰的 JSON、後面接著空白，總共 1,048,577 bytes，簽名是對這些內容簽的
- **THEN** 被拒絕，原因是內容太大，Casey 的裝置 ID 沒有註冊

### Requirement: SHARING-49.1 會因為欄位或內容太大被拒絕的請求，不等內容送完就拒絕

WHEN 請求已經送到的部分足以知道它會因為欄位（SHARING-32.1）或內容太大（SHARING-48.2）被拒絕，the API SHALL 這時就拒絕，不等內容其餘的部分送到：欄位沒通過的，和標明的內容長度超過上限的，一個 byte 的內容都不必送到；沒有標明內容長度的，收到的內容一超過上限就拒絕。

#### Scenario: 標明的內容長度超過上限，內容還沒送

- **WHEN** 帶著四個欄位的 `POST /no-such-route` 標明內容是 1,048,577 bytes，或 107,374,182,400 bytes（100 GiB），送出標頭之後一個 byte 的內容都沒送
- **THEN** API 就回應拒絕，原因是內容太大

#### Scenario: 沒有標明內容長度，送到超過上限

- **WHEN** 帶著四個欄位的 `POST /no-such-route` 沒有標明內容長度，分段送了 1,048,577 bytes 之後不再送，也不結束
- **THEN** API 就回應拒絕，原因是內容太大

#### Scenario: 欄位沒通過

- **WHEN** 沒帶四個欄位的 `POST /no-such-route` 和 `POST /health`，各標明內容是 1,048,577 bytes 而一個 byte 都沒送，或沒有標明內容長度、一個 byte 都沒送也不結束
- **THEN** API 都回應拒絕，原因是簽名

### Requirement: SHARING-50.1 公開的路由不讀請求的內容

WHEN 公開的路由收到帶著內容的請求，the API SHALL 回答得和沒帶內容時一樣，不論內容多大，也不等內容送到。

#### Scenario: 帶著內容打公開的路由

- **WHEN** 沒簽名的 `GET /health`、`GET /.well-known/apple-app-site-association`、`GET /.well-known/assetlinks.json` 和 `GET /i/a`，各標明內容是 1,048,577 bytes 而一個 byte 都沒送，或沒有標明內容長度、送了 1,024 bytes 之後不再送也不結束
- **THEN** 每一個得到的狀態和內容，都和沒帶內容的同一個請求一樣（200）

### Requirement: SHARING-51.1 `GET` 和 `HEAD` 的請求，內容是 0 bytes

WHEN 不是打公開的路由的 `GET` 或 `HEAD` 請求帶著 body，the API SHALL 不讀這個 body，照內容是 0 bytes 的請求來檢查，不論 body 多大、有沒有標明長度、送到了沒有：它不會因為內容太大被拒絕（SHARING-48.2），簽名要是對 0 bytes 的內容簽的才對得上（SHARING-34.2），API 也不等 body 送到就回應。

#### Scenario: 標明很長的 body，一個 byte 都沒送

- **WHEN** Taylor 的手機送簽名的 `GET /no-such-route` 和 `HEAD /no-such-route`，簽名是對 0 bytes 的內容簽的，各標明內容是 1,048,577 bytes 或 107,374,182,400 bytes（100 GiB），送出標頭之後一個 byte 都沒送
- **THEN** 都通過檢查，API 回答找不到（404），不是內容太大

#### Scenario: 沒有標明長度，分段送、不結束

- **WHEN** 同樣簽的 `GET /no-such-route` 和 `HEAD /no-such-route` 沒有標明內容長度，分段送了 1,024 bytes 之後不再送，也不結束
- **THEN** 都通過檢查，API 不等它結束就回答找不到

#### Scenario: body 送完了

- **WHEN** 同樣簽的 `GET /no-such-route` 和 `HEAD /no-such-route` 帶著 `00ff10` 這 3 bytes 的 body，標明長度送完，或沒有標明長度、分段送完
- **THEN** 都通過檢查

#### Scenario: 簽名是對 body 簽的

- **WHEN** Taylor 的手機送 `GET /no-such-route`，body 是文字 `{}`，簽名是對這 2 bytes 的內容簽的；再送 `HEAD /no-such-route`，body 是 `00` 這 1 byte，簽名是對這 1 byte 的內容簽的；body 都標明長度送完
- **THEN** 都被拒絕，原因是簽名（401）

#### Scenario: 其餘的檢查照舊

- **WHEN** 兩個 `GET /no-such-route` 各標明內容是 1,048,577 bytes 而一個 byte 都沒送，簽名都是對 0 bytes 的內容簽的：一個是還沒註冊的 Casey 的手機簽的，一個是 Taylor 的手機簽的、請求時間比 API 的時間早一小時
- **THEN** 前一個被拒絕，原因是簽名；後一個被拒絕，原因是時鐘；都不是內容太大

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

### Requirement: SHARING-77.1 建立邀請

WHEN 成員手機送建立邀請的請求，代號是 API 沒見過的，而這個群組沒有有效的邀請，the API SHALL 記下這個邀請：它屬於這個群組，到期時間是 API 的時間加 604,800,000 毫秒，名片和名片的 cursor 是請求帶的；並回答邀請建立好了，回應帶著代號、到期時間和名片的 cursor。群組的每一支成員手機都可以建立，不管群組是不是它建立的。

#### Scenario: Taylor 建立 Brisbane 的邀請

- **WHEN** Brisbane 沒有邀請，Taylor 的手機在 T 送 `PUT /groups/9b2f6c1e-8d47-4f3a-b1c5-2e7d90a4f6b8/invites/3q2-7wEjRWeJq83vEjRWeA`，內容是 `{"cursor":0,"card":"<名片 X 的十六進位>"}`
- **THEN** API 回答邀請建立好了（200），回應是 `{"code":"3q2-7wEjRWeJq83vEjRWeA","expiresAtMs":1795588320000,"cursor":0}`；之後 Casey 的手機讀代號 A，得到同一個到期時間和名片 X

#### Scenario: 別的成員手機建立

- **WHEN** Casey 的手機是 Brisbane 的成員手機，Brisbane 沒有邀請，Casey 的手機用代號 A 建立邀請
- **THEN** 邀請建立好了

#### Scenario: 兩個群組各有邀請

- **WHEN** Taylor 的手機建立了 Brisbane 和 Tokyo，在 Brisbane 用代號 A 和名片 X 建立邀請，在 Tokyo 用代號 B 和名片 Y 建立邀請
- **THEN** 兩個都建立好了；讀代號 A 得到名片 X，讀代號 B 得到名片 Y

#### Scenario: 名片最小和最大

- **WHEN** Taylor 的手機在 Brisbane 用 41 bytes 的名片建立邀請，在 Tokyo 用 65,536 bytes 的名片建立邀請
- **THEN** 兩個都建立好了，讀到的名片和上傳的一樣

#### Scenario: cursor 不是 0

- **WHEN** Brisbane 有三個事件，Taylor 的手機用代號 A 建立邀請，名片的 cursor 是 3
- **THEN** 邀請建立好了，回應的 cursor 是 3

### Requirement: SHARING-78.1 有效的邀請再送一次時，留下 cursor 比較大的名片

WHEN 成員手機送建立邀請的請求，代號是這個群組有效的邀請的代號，the API SHALL 回答邀請建立好了，到期時間不變：請求帶的名片的 cursor 大於或等於存著的，就把名片和 cursor 換成請求帶的；比存著的小，就留著原本的。回應帶著 API 這時存著的名片的 cursor。所以沒收到回應的手機可以原樣再送，幾支手機各自上傳名片時，比較舊的不會蓋掉比較新的。同一個建立邀請的請求有幾個同時送到時，每一個都回答建立好了，只有一個邀請。

#### Scenario: 原樣再送一次

- **WHEN** Taylor 的手機在 T 用代號 A、名片 X 和 cursor 0 建立邀請，在 T+1,000 用同樣的內容再送一次
- **THEN** 兩次都回答邀請建立好了，到期時間都是 1795588320000；讀代號 A 得到名片 X

#### Scenario: cursor 比較大

- **WHEN** Brisbane 有五個事件，代號 A 的邀請存著 cursor 2 的名片 X；成員手機 Casey 的手機用代號 A 送 cursor 5 的名片 Y
- **THEN** 回答邀請建立好了，回應的 cursor 是 5；讀代號 A 得到名片 Y

#### Scenario: cursor 比較小

- **WHEN** 接著 Taylor 的手機用代號 A 送 cursor 3 的名片 Z
- **THEN** 回答邀請建立好了，回應的 cursor 是 5；讀代號 A 得到的仍是名片 Y

#### Scenario: cursor 一樣

- **WHEN** 接著 Taylor 的手機用代號 A 送 cursor 5 的名片 Z
- **THEN** 回答邀請建立好了，回應的 cursor 是 5；讀代號 A 得到名片 Z

#### Scenario: 到期時間不延後

- **WHEN** 代號 A 的邀請在 T 建立，Taylor 的手機在 T+259,200,000（3 天後）用代號 A 送新的名片
- **THEN** 回應的到期時間仍是 1795588320000

#### Scenario: 同時送到

- **WHEN** Brisbane 沒有邀請，Taylor 的手機用代號 A 建立邀請的五個請求同時送到
- **THEN** 五個都回答邀請建立好了，到期時間相同；之後用代號 B 建立被拒絕，原因是已經有邀請

### Requirement: SHARING-79.1 群組已經有另一個有效的邀請

IF 建立邀請的請求的代號是 API 沒見過的，而這個群組已經有有效的邀請，THEN the API SHALL 拒絕，原因是已經有邀請，原本的邀請不變，這個代號之後仍是 API 沒見過的；一個群組的幾支成員手機同時用不同的代號建立時，只有一個建立好了。

#### Scenario: 第二個邀請

- **WHEN** Brisbane 有代號 A 的有效邀請，成員手機 Casey 的手機用代號 B 建立邀請
- **THEN** 被拒絕，原因是已經有邀請（409）；讀代號 B 被拒絕，原因是沒有這個邀請；讀代號 A 得到的名片和之前一樣

#### Scenario: 被拒絕的代號之後還能用

- **WHEN** 接著 Taylor 的手機撤回代號 A，Casey 的手機再用代號 B 建立邀請
- **THEN** 邀請建立好了

#### Scenario: 同時建立

- **WHEN** 五個群組各有 Taylor 和 Casey 的手機兩支成員手機、沒有邀請，兩支手機同時各用自己的代號在每個群組建立邀請
- **THEN** 每個群組都剛好一支手機得到邀請建立好了，另一支被拒絕，原因是已經有邀請；每個群組讀得到的只有建立好的那個代號

### Requirement: SHARING-80.1 代號只能用一次

IF 建立邀請的請求的代號是 API 見過的，卻不是這個群組有效的邀請的代號——它是這個群組已經過期或撤回的邀請的，或是別的群組的邀請的，不管那個邀請有沒有效——THEN the API SHALL 拒絕，原因是沒有這個邀請，什麼都不改。

#### Scenario: 撤回的邀請

- **WHEN** Taylor 的手機撤回 Brisbane 代號 A 的邀請之後，再用代號 A 建立邀請
- **THEN** 被拒絕，原因是沒有這個邀請（404）；讀代號 A 仍被拒絕；之後用代號 B 建立，邀請建立好了

#### Scenario: 過期的邀請

- **WHEN** 代號 A 的邀請在 T 建立，Taylor 的手機在 T+604,800,000 用代號 A 送新的名片
- **THEN** 被拒絕，原因是沒有這個邀請

#### Scenario: 別的群組的邀請

- **WHEN** Casey 的手機建立了 Tokyo 和它代號 B 的邀請；Taylor 的手機在 Brisbane 用代號 B 建立邀請
- **THEN** 被拒絕，原因是沒有這個邀請；讀代號 B 得到的仍是 Casey 的手機上傳的名片；之後 Taylor 的手機在 Brisbane 用代號 A 建立，邀請建立好了

#### Scenario: 別的群組已經撤回的邀請

- **WHEN** Casey 的手機撤回 Tokyo 代號 B 的邀請之後，Taylor 的手機在 Brisbane 用代號 B 建立邀請
- **THEN** 被拒絕，原因是沒有這個邀請

### Requirement: SHARING-81.1 邀請在 7 天後失效

WHILE API 的時間比邀請的到期時間早，而且邀請沒有被撤回，the API SHALL 把它當成有效的邀請；API 的時間到了到期時間，它就不再有效：讀不到它，它的群組可以建立新的邀請。

#### Scenario: 到期前一毫秒

- **WHEN** 代號 A 的邀請在 T 建立；在 T+604,799,999，Casey 的手機讀代號 A，Taylor 的手機用代號 B 建立邀請
- **THEN** 讀到代號 A 的名片；用代號 B 建立被拒絕，原因是已經有邀請

#### Scenario: 到期的那一毫秒

- **WHEN** 在 T+604,800,000，Casey 的手機讀代號 A，Taylor 的手機用代號 B 建立邀請
- **THEN** 讀代號 A 被拒絕，原因是沒有這個邀請；代號 B 的邀請建立好了，到期時間是 1796193120000

### Requirement: SHARING-82.1 撤回邀請

WHEN 成員手機送撤回的請求，the API SHALL 讓這個群組帶這個代號的有效邀請立刻失效，不再存著它的名片，並回答撤回好了，回應帶著代號；群組的每一支成員手機都可以撤回，不管邀請是哪一支建立的。這個群組沒有帶這個代號的有效邀請時——已經撤回、已經過期、API 沒見過這個代號，或它是別的群組的邀請的——只回答撤回好了，什麼都不改。

#### Scenario: 別的成員手機撤回

- **WHEN** Taylor 的手機用代號 A 和名片 X 建立了 Brisbane 的邀請，成員手機 Casey 的手機送 `DELETE /groups/9b2f6c1e-8d47-4f3a-b1c5-2e7d90a4f6b8/invites/3q2-7wEjRWeJq83vEjRWeA`，沒有內容
- **THEN** API 回答撤回好了（200），回應是 `{"code":"3q2-7wEjRWeJq83vEjRWeA"}`；緊接著讀代號 A 被拒絕，原因是沒有這個邀請；資料庫裡找不到名片 X；Taylor 的手機用代號 B 建立，邀請建立好了

#### Scenario: 再撤回一次

- **WHEN** 接著 Taylor 的手機再送一次撤回代號 A 的請求
- **THEN** 回答撤回好了；代號 B 的邀請不變

#### Scenario: 別的群組的邀請

- **WHEN** Casey 的手機建立了 Tokyo 和它代號 B 的邀請；Taylor 的手機送撤回 Brisbane 代號 B 的請求
- **THEN** 回答撤回好了；讀代號 B 仍得到 Tokyo 的名片

#### Scenario: API 沒見過的代號

- **WHEN** Brisbane 沒有邀請，Taylor 的手機送撤回代號 A 的請求，再用代號 A 建立邀請
- **THEN** 撤回回答撤回好了；邀請建立好了

### Requirement: SHARING-83.1 用代號讀邀請

WHEN 註冊過的手機送讀邀請的請求，代號是有效的邀請的，the API SHALL 回傳這個邀請的到期時間和 API 存著的名片，不管這支手機是不是那個群組的成員手機；回應不帶群組 ID，並說 `Cache-Control: no-store`。讀邀請不改任何邀請。

#### Scenario: 不是成員手機的手機讀

- **WHEN** Brisbane 有代號 A、名片 X 的邀請，在 T 建立；Casey 的手機不是 Brisbane 的成員手機，送 `GET /invites/3q2-7wEjRWeJq83vEjRWeA`
- **THEN** API 回 200，回應是 `{"expiresAtMs":1795588320000,"card":"<名片 X 的十六進位>"}`，標頭有 `Cache-Control: no-store`；回應裡沒有 Brisbane 的群組 ID

#### Scenario: 成員手機讀

- **WHEN** Taylor 的手機讀代號 A
- **THEN** 得到一樣的回應

#### Scenario: 讀了不改

- **WHEN** Casey 的手機讀代號 A 三次
- **THEN** 三次的回應一樣；除了 API 替每個通過檢查的請求留的紀錄，資料庫和之前一樣

### Requirement: SHARING-84.1 沒有這個有效的邀請

IF 讀邀請的請求的代號不是有效的邀請的，THEN the API SHALL 拒絕，原因是沒有這個邀請；API 沒見過的代號、過期的邀請和撤回的邀請，得到的回應一模一樣。

#### Scenario: 三種代號

- **WHEN** 代號 A 的邀請已經撤回，代號 B 的邀請已經過期，代號 C 是 API 沒見過的；Casey 的手機各讀一次
- **THEN** 三個請求都被拒絕，原因是沒有這個邀請（404），回應一模一樣

### Requirement: SHARING-85.1 不是成員手機的手機不能建立和撤回邀請

IF 建立邀請或撤回的請求打的群組沒有把這支手機記成成員手機，或沒有這個群組，THEN the API SHALL 拒絕，原因是不是成員（SYNC-49.1 的同一個原因）；這兩種情況的回應一模一樣，也不因代號是不是哪個邀請的而不同，所以不是成員手機的手機分不出群組存不存在、有沒有邀請。

#### Scenario: 不是成員手機

- **WHEN** Brisbane 有代號 A 的有效邀請，Tokyo 還沒有建立；Casey 的手機不是成員手機，對兩個群組各送：用代號 A 建立邀請、用代號 B 建立邀請、撤回代號 A
- **THEN** 六個請求都被拒絕，原因是不是成員（403），兩個群組得到的回應一模一樣；讀代號 A 得到的名片和之前一樣

#### Scenario: 成為成員手機之後

- **WHEN** Casey 的手機成為 Brisbane 的成員手機之後，送撤回代號 A 的請求
- **THEN** 回答撤回好了

### Requirement: SHARING-86.1 邀請 API 的請求寫得不對

IF 邀請 API 的請求寫得不對，THEN the API SHALL 拒絕，原因是內容不對：群組 ID 不是小寫的第 4 版 UUID；代號不是 16 bytes 的 base64url 寫法；網址帶了查詢；建立邀請的內容不是剛好有 `cursor` 和 `card` 兩個欄位的 JSON 物件，`cursor` 不是 0 到 9,007,199,254,740,991 之間的整數，或 `card` 不是 41 到 65,536 bytes 的小寫十六進位寫法；撤回的請求帶了內容；或建立邀請帶的 cursor 比群組最新的序號大。

#### Scenario: 代號的寫法

- **WHEN** Taylor 的手機用這些代號建立邀請、撤回和讀邀請：少一個字元的 `3q2-7wEjRWeJq83vEjRWe`、多一個字元的 `3q2-7wEjRWeJq83vEjRWeAA`、最後一個字元不是 16 bytes 寫得出來的 `3q2-7wEjRWeJq83vEjRWeB`、中間有 `.` 的 `3q2-7wEjRWe.q83vEjRWeA`，或 `invite`
- **THEN** 都被拒絕，原因是內容不對（400）

#### Scenario: 群組 ID 的寫法

- **WHEN** Taylor 的手機用大寫的 `9B2F6C1E-8D47-4F3A-B1C5-2E7D90A4F6B8` 或 `brisbane` 當群組 ID，建立邀請和撤回
- **THEN** 都被拒絕，原因是內容不對

#### Scenario: 建立邀請的內容

- **WHEN** Taylor 的手機用代號 A 建立邀請，內容是：0 bytes、`{}`、只有 `cursor`、只有 `card`、多帶 `"name":"Brisbane"`、一個陣列、不是 JSON 的文字；`cursor` 是 -1、1.5、文字 `0` 或 9007199254740992；`card` 是數字、大寫的十六進位、奇數個字元、40 bytes 或 65,537 bytes
- **THEN** 都被拒絕，原因是內容不對；Brisbane 沒有邀請，資料庫裡找不到「Brisbane」

#### Scenario: 帶了查詢

- **WHEN** Taylor 的手機建立邀請、撤回和讀邀請的請求，網址後面各帶 `?x=1`
- **THEN** 都被拒絕，原因是內容不對

#### Scenario: 撤回帶了內容

- **WHEN** Brisbane 有代號 A 的有效邀請，Taylor 的手機送撤回它的請求，內容是 `{}`
- **THEN** 被拒絕，原因是內容不對；讀代號 A 仍得到它的名片

#### Scenario: cursor 比群組最新的序號大

- **WHEN** Brisbane 有三個事件，Taylor 的手機用代號 A 建立邀請，名片的 cursor 是 4；再用 cursor 3 送一次
- **THEN** 前一次被拒絕，原因是內容不對；後一次邀請建立好了

### Requirement: SHARING-87.1 邀請 API 的請求有不只一個問題時的原因

IF 邀請 API 的請求有不只一個會讓它被拒絕的問題，THEN the API SHALL 回報這個順序裡最前面的原因：對簽名的請求的檢查（SHARING-31.2）；寫法上的內容不對，也就是 SHARING-86.1 裡除了 cursor 的大小以外的每一項；不是成員（SHARING-85.1）；cursor 比群組最新的序號大的內容不對；沒有這個邀請（SHARING-80.1、SHARING-84.1）；已經有邀請（SHARING-79.1）。被對簽名的請求的檢查以外的原因拒絕的請求，已經通過那些檢查：它算進這支裝置的請求數（SHARING-37.1），原樣再送一次是重送（SHARING-36.1）；除此之外，每個群組和每個邀請都和收到它之前一樣。

#### Scenario: 沒簽名或沒註冊

- **WHEN** 建立邀請、撤回和讀邀請的請求，沒帶簽名的四個欄位，或由還沒註冊的手機簽名
- **THEN** 六個請求都被拒絕，原因是簽名，資料庫不變

#### Scenario: 寫法先於是不是成員

- **WHEN** Casey 的手機不是 Brisbane 的成員手機，它用代號 A 建立邀請時內容是 `{}`，撤回時帶了 `?x=1`
- **THEN** 兩個請求都被拒絕，原因是內容不對

#### Scenario: 是不是成員先於 cursor 的大小和邀請的狀態

- **WHEN** Brisbane 沒有事件，有代號 A 的有效邀請；Casey 的手機不是成員手機，它用代號 B、cursor 9 建立邀請
- **THEN** 被拒絕，原因是不是成員；Taylor 的手機送同樣的請求時，原因是內容不對

#### Scenario: cursor 的大小先於邀請的狀態

- **WHEN** Brisbane 沒有事件，代號 A 的邀請已經撤回；Taylor 的手機用代號 A、cursor 9 建立邀請
- **THEN** 被拒絕，原因是內容不對，不是沒有這個邀請

#### Scenario: 被拒絕的請求用掉了 nonce

- **WHEN** Casey 的手機讀代號 C 被拒絕，原因是沒有這個邀請，之後同一個請求原樣再送一次
- **THEN** 第二次被拒絕，原因是重送

#### Scenario: 被拒絕的請求算進請求數

- **WHEN** Casey 的手機在 T 註冊，它接著在 T 送的 59 個讀代號 C 的請求都因為沒有這個邀請被拒絕，然後再送一個
- **THEN** 這一個被拒絕，原因是請求太多，要等 60,000 毫秒

### Requirement: SHARING-88.1 關於一個邀請，API 只存代號、群組、時間、名片和 cursor

The API SHALL 關於一個邀請只存：代號、它的群組、建立和到期的時間、有沒有被撤回，以及名片和名片的 cursor；被拒絕的請求帶的名片、被換掉的名片、撤回的邀請的名片，和請求的其他標頭都不存。過期的邀請的名片留到什麼時候不在這裡。`#` 後面的字串和從它導出的金鑰不在任何請求裡，所以 API 沒有它們。

#### Scenario: 建立之後的資料庫

- **WHEN** Taylor 的手機用代號 A 和名片 X 建立 Brisbane 的邀請，請求帶著 `User-Agent: TaylorsPhone/1.0` 和 `X-Group-Name: Brisbane-Trip`
- **THEN** 資料庫裡找得到名片 X，剛好一份；找不到 `TaylorsPhone` 和 `Brisbane-Trip`

#### Scenario: 沒有存下的名片

- **WHEN** Brisbane 有五個事件，代號 A 的邀請存著 cursor 5 的名片 X；Taylor 的手機用代號 A 送 cursor 3 的名片 Y，不是成員手機的 Casey 的手機用代號 A 送名片 Z，Taylor 的手機再用代號 A 送 cursor 5 的名片 W
- **THEN** 資料庫裡找得到名片 W，剛好一份；名片 X、Y 和 Z 都找不到，不論是原始的 bytes、十六進位還是 Base64

### Requirement: SHARING-89.1 同樣的路徑配上別的方法，不是邀請 API 的請求

IF 簽名的請求打 `/groups/<群組 ID>/invites/<代號>` 而方法不是 `PUT` 或 `DELETE`，或打 `/invites/<代號>` 而方法不是 `GET`，THEN the API SHALL 把它當成路徑沒有路由的請求，回答找不到，不改任何邀請。`HEAD` 也一樣：它不是讀邀請。

#### Scenario: 別的方法

- **WHEN** Brisbane 有代號 A 的有效邀請，Taylor 的手機對 `/groups/9b2f6c1e-8d47-4f3a-b1c5-2e7d90a4f6b8/invites/3q2-7wEjRWeJq83vEjRWeA` 送 `GET`、`HEAD`、帶著建立邀請的內容的 `POST` 和 `PATCH`，對 `/invites/3q2-7wEjRWeJq83vEjRWeA` 送 `HEAD`、`DELETE`、帶著建立邀請的內容的 `PUT` 和 `POST`
- **THEN** 八個請求都得到找不到（404），不是任何一種拒絕；讀代號 A 仍得到它的名片

### Requirement: SHARING-90.1 沒按過 Invite with Link 的群組不連伺服器

The mobile app SHALL 不為還不是共同帳本的群組發出任何網路請求，也不產生裝置身分或群組鑰匙，直到使用者在它的 Members 按「Invite with Link」：建立群組、加入和改成員、記支出、打開 Members，都不會。

#### Scenario: 只在手機上用的群組

- **WHEN** 在新手機上建立 Brisbane，加入 Casey，新增一筆 Brisbane 的支出，把 Brisbane 改名，打開它的 Members 再關閉，然後重新啟動 app
- **THEN** app 沒有發出任何網路請求，secure store 是空的，這支手機沒有裝置身分，也沒有待上傳的事件

#### Scenario: 別的群組邀請過

- **WHEN** Brisbane 已經是共同帳本，接著建立 Tokyo，加入成員並新增 Tokyo 的支出
- **THEN** 這段期間 app 沒有發出任何路徑裡有 Tokyo 的群組 ID 的請求，也沒有註冊、建立群組或邀請的請求；secure store 裡沒有 Tokyo 的群組鑰匙，Tokyo 的變更沒有寫成事件

### Requirement: SHARING-91.1 按 Invite with Link 開啟 Invite

WHEN 使用者在 Members 按「Invite with Link」（GROUPS-106.1），the mobile app SHALL 開啟從畫面底部升起、蓋在 Members 上的 Invite，標題是「Invite」，標題列只有關閉「Close」（SHELL-47.2、SHELL-48.2），並開始準備邀請；準備邀請還沒有結果時，Invite 的內容只有「Creating link…」。按 Close、把 Invite 往下滑或按 Android 的返回鍵，SHALL 關閉 Invite，回到 Members，準備邀請還沒有結果時也一樣。一個群組同時只準備一次邀請：準備邀請還沒有結果時又按「Invite with Link」，就等同一次的結果，不另外發出請求。

#### Scenario: 開啟

- **WHEN** 在 Brisbane 的 Members 按「Invite with Link」
- **THEN** Invite 從底部升起，蓋在 Members 上，標題是「Invite」，標題列只有「Close」；仍選中 Groups 分頁

#### Scenario: 還沒有結果

- **WHEN** API 還沒回答建立群組的請求
- **THEN** Invite 的內容只有「Creating link…」

#### Scenario: 關閉

- **WHEN** 在 Invite 按「Close」，或在 iOS 上把它往下滑，或在 Android 上按返回鍵
- **THEN** Invite 關閉，顯示 Brisbane 的 Members

#### Scenario: 還沒有結果時再按一次

- **WHEN** API 還沒回答時關閉 Invite，再按「Invite with Link」，之後 API 才回答
- **THEN** Invite 顯示邀請連結；API 只收到一個註冊的請求、一個建立群組的請求和一個建立邀請的請求

### Requirement: SHARING-92.1 第一次準備邀請時，群組變成共同帳本

WHEN 準備邀請，而群組還不是共同帳本，the mobile app SHALL 依序做這些事：送建立群組的請求（SYNC-45.1），路徑帶著這個群組的群組 ID，沒有內容，這支手機沒有裝置身分時先產生並註冊（SHARING-20.1、SHARING-22.1）；API 回答建立好了之後，產生群組鑰匙（SHARING-93.1），再讓群組變成共同帳本（SYNC-20.1），用的是這支手機的裝置 ID 和這時校正後的時間；然後建立邀請（SHARING-94.1 到 SHARING-97.1）。API 沒有回答建立好了，群組就不變成共同帳本。群組已經是共同帳本時，準備邀請不再送建立群組的請求。

#### Scenario: 新手機第一次邀請

- **WHEN** 沒有裝置身分的手機上，在 Brisbane 的 Members 按「Invite with Link」
- **THEN** API 依序收到三個請求：對 `/devices` 的 `POST`、對 `/groups/<Brisbane 的群組 ID>` 沒有內容的 `PUT`，和對 `/groups/<Brisbane 的群組 ID>/invites/<代號>` 的 `PUT`，三個的裝置 ID 相同；Invite 顯示邀請連結

#### Scenario: 從這時起變更都寫成事件

- **WHEN** 接著把 Brisbane 改名為「Brissie」
- **THEN** 待上傳的事件多一個群組的事件，時間戳記的裝置 ID 是這支手機的裝置 ID，名稱根據的版本的毫秒是按「Invite with Link」那時校正後的時間

#### Scenario: 原本就有資料的群組

- **WHEN** Brisbane 有 Casey、Blake 和支出 Dinner，按「Invite with Link」，邀請建立好了
- **THEN** 待上傳的事件只有邀請的那一個，沒有 Dinner、成員或分類的事件；之後把 Dinner 的標題改成「Supper」，待上傳的事件才多一個支出的事件

#### Scenario: 用校正後的時間

- **WHEN** API 的時間比手機的時鐘快 10 分鐘，在 Brisbane 按「Invite with Link」，邀請建立好了之後把 Brisbane 改名
- **THEN** 改名的事件裡，名稱根據的版本的毫秒是手機的時鐘加 600,000

#### Scenario: 另一個群組

- **WHEN** Brisbane 已經是共同帳本，在 Tokyo 的 Members 按「Invite with Link」
- **THEN** API 收到建立 Tokyo 的請求和建立 Tokyo 的邀請的請求，沒有再收到註冊的請求

#### Scenario: 已經是共同帳本

- **WHEN** 撤回 Brisbane 的邀請之後，再按「Invite with Link」
- **THEN** API 只多收到一個建立邀請的請求，沒有建立群組的請求

### Requirement: SHARING-93.1 群組鑰匙存在 secure store

WHEN 群組要變成共同帳本，the mobile app SHALL 先有它世代 1 的群組鑰匙：`expo-crypto` 的 `getRandomValues` 或 `getRandomBytesAsync` 給的 32 bytes，不用 `getRandomBytes` 和 `Math.random`；存進 secure store 名稱是 `group-key.<群組 ID>.1` 的項目，值是 64 個小寫十六進位字元，設定成第一次解鎖之後讀得到、只留在這支手機（`AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY`），讀它不必經過使用者驗證。secure store 已經有這個項目、值也是 64 個小寫十六進位字元時沿用它，不另外產生。群組鑰匙不寫進本機資料，也不放進任何請求。IF 鑰匙存不進 secure store，THEN the mobile app SHALL 不讓群組變成共同帳本。

#### Scenario: 第一次邀請之後

- **WHEN** 新手機上 Brisbane 的邀請建立好了
- **THEN** secure store 裡有兩個項目：裝置身分的 seed，和名稱是 `group-key.<Brisbane 的群組 ID>.1` 的項目；後者的值是 64 個小寫十六進位字元，是 `getRandomValues` 或 `getRandomBytesAsync` 給的 32 bytes，用 `AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY` 存的，沒有要求使用者驗證；過程中沒有用到 `getRandomBytes`

#### Scenario: 鑰匙不在本機資料和請求裡

- **WHEN** Brisbane 的邀請建立好了
- **THEN** 本機資料的檔案和 API 收到的每個請求裡都找不到群組鑰匙，不論是原始的 bytes、十六進位還是 Base64

#### Scenario: 兩個群組

- **WHEN** Brisbane 和 Tokyo 都邀請過
- **THEN** secure store 裡各有一個群組鑰匙的項目，值不同

#### Scenario: 已經有這個項目

- **WHEN** secure store 已經有 `group-key.<Brisbane 的群組 ID>.1`，值是 `000102…1e1f` 的十六進位，Brisbane 還不是共同帳本；按「Invite with Link」，邀請建立好了
- **THEN** 這個項目的值不變

#### Scenario: 存不進 secure store

- **WHEN** 有裝置身分的手機上 secure store 寫不進去，在 Brisbane 按「Invite with Link」
- **THEN** Invite 顯示「Something went wrong. Try again later.」（SHARING-106.1）；Brisbane 不是共同帳本，之後替它改名不寫事件；secure store 恢復之後按「Try Again」，邀請建立好了

### Requirement: SHARING-94.1 邀請的代號、字串和連結

WHEN 建立邀請，the mobile app SHALL 用 `expo-crypto` 的 `getRandomValues` 或 `getRandomBytesAsync` 給的 16 bytes 當代號、另外給的 32 bytes 當 `#` 後面的字串，不用 `getRandomBytes` 和 `Math.random`；兩者各寫成沒有 `=` 的 base64url，是 22 個和 43 個字元。邀請連結是 API 的網址、`/i/`、代號、`#` 和字串。每個邀請的代號和字串都是新產生的。

#### Scenario: 連結的寫法

- **WHEN** API 的網址是 `https://api.example.test`，Brisbane 的邀請建立好了
- **THEN** Invite 顯示的連結是 `https://api.example.test/i/`、22 個 base64url 字元、`#` 和 43 個 base64url 字元；前一段是建立邀請的請求路徑裡的代號，解開是 `expo-crypto` 給的 16 bytes，後一段解開是 `expo-crypto` 給的 32 bytes

#### Scenario: 每個邀請都不同

- **WHEN** 撤回 Brisbane 的邀請之後再建立一個，Tokyo 也建立一個
- **THEN** 三個邀請的代號都不同，`#` 後面的字串也都不同

### Requirement: SHARING-95.1 建立邀請的請求帶著加密的名片

WHEN 建立邀請，the mobile app SHALL 送建立邀請的請求（SHARING-77.1）：路徑帶著群組 ID 和代號，內容是名片的 cursor 和名片。名片是名片內容用名片金鑰加密的密文（SHARING-1.1）：名片金鑰從 `#` 後面的那 32 bytes 導出，用途是 `shared-expense/invite/card/v1`，不給 salt（SHARING-12.1）；nonce 是 `expo-crypto` 給的 24 bytes，每次加密都是新的；附加資料是 `shared-expense/invite/card/v1`、一個換行（`0x0A`）和代號，以 UTF-8 編碼。名片內容是一個 JSON 物件（JavaScript 的 `JSON.stringify`，沒有多餘的空白，以 UTF-8 編碼），依序有兩個欄位：`name` 是群組名稱；`members` 依 Members 的順序（GROUPS-24.3）列出群組的每位成員，每位依序是 `id`（成員 ID）、`name`（成員名稱）和 `hasDevice`（這位成員有使用者 ID 時是 `true`，否則是 `false`）。前成員不在名片裡。名片的 cursor 是這支手機在這個群組的 cursor（sync），還沒下載過這個群組的事件時是 0。

#### Scenario: Brisbane 的名片

- **WHEN** 名字是「Taylor」，Brisbane 依序加入 Casey 和 Blake，按「Invite with Link」
- **THEN** 建立邀請的請求內容是 `{"cursor":0,"card":"<十六進位>"}`；用連結裡 `#` 後面的字串導出的名片金鑰和上面的附加資料解開名片，得到 `{"name":"Brisbane","members":[{"id":"<Taylor 的成員 ID>","name":"Taylor","hasDevice":true},{"id":"<Casey 的成員 ID>","name":"Casey","hasDevice":false},{"id":"<Blake 的成員 ID>","name":"Blake","hasDevice":false}]}`；名片的第 2 到第 25 個 byte 是 `expo-crypto` 給的 24 bytes

#### Scenario: 前成員

- **WHEN** 把 Blake 移出 Brisbane 之後按「Invite with Link」
- **THEN** 名片的 `members` 只有 Taylor 和 Casey

#### Scenario: 你在群組裡的名稱

- **WHEN** 把你在 Brisbane 的成員改名為「Tay」之後按「Invite with Link」
- **THEN** 名片裡你那一位的 `name` 是「Tay」，`hasDevice` 是 `true`

### Requirement: SHARING-96.1 `#` 後面的字串不離開手機

The mobile app SHALL 不把 `#` 後面的字串和名片金鑰放進任何請求：網址、簽名的欄位和內容裡都沒有，不論是原始的 bytes、十六進位還是 Base64。群組名稱和成員名稱也不以明文出現在任何請求裡。

#### Scenario: 建立、更新名片和撤回

- **WHEN** Brisbane 有成員 Casey，建立邀請，把 Brisbane 改名為「Brissie」（SHARING-109.1），再撤回邀請
- **THEN** API 收到的每個請求裡都找不到 `#` 後面的字串和名片金鑰，也找不到「Brisbane」、「Brissie」和「Casey」

### Requirement: SHARING-97.1 邀請建立好了之後，存下它並寫下它的事件

WHEN API 回答邀請建立好了，the mobile app SHALL 在同一個 SQLite transaction 裡存下這個邀請——代號、`#` 後面的字串和 API 回答的到期時間——並寫下邀請的第一個事件（SYNC-80.1、SYNC-21.1），送出請求之前存的那一份代號和字串（SHARING-105.1）也在這個 transaction 裡拿掉；其中一個存不進去就都不留下，那一份也還在。API 沒有回答建立好了時不存邀請，也不寫事件。

#### Scenario: 邀請的事件

- **WHEN** 在 T 按 Brisbane 的「Invite with Link」，邀請建立好了
- **THEN** 待上傳的事件剛好一個，屬於 Brisbane：紀錄的種類是邀請，紀錄的 ID 是代號，「連結」這個單位的值是 `#` 後面的字串和到期時間 T+604,800,000，沒有根據的版本；時間戳記的毫秒是 T，裝置 ID 是這支手機的裝置 ID

#### Scenario: 沒有建立好

- **WHEN** 建立邀請的請求沒有得到回應
- **THEN** 沒有待上傳的事件

### Requirement: SHARING-98.1 Invite 顯示邀請的連結和 QR code

WHILE Invite 顯示一個邀請，the mobile app SHALL 由上而下顯示：這條邀請連結的 QR code，無障礙名稱是「Invite link QR code」；整條邀請連結的文字；角色為 button、名稱為「Share Link」的按鈕；「Anyone with this link can ask to join. A member has to approve each request.」；「Expires 」加上到期時間在手機時區的日期，用手機地區的日期格式（LEDGER-30.2）；以及角色為 button、名稱為「Revoke Link」的按鈕。

#### Scenario: Brisbane 的邀請

- **WHEN** 手機的地區是美國、時區是 `Asia/Taipei`，在 T 建立 Brisbane 的邀請
- **THEN** Invite 由上而下是內容為整條連結的 QR code、整條連結、「Share Link」、「Anyone with this link can ask to join. A member has to approve each request.」、「Expires Nov 25, 2026」和「Revoke Link」

#### Scenario: 到期日照手機的時區

- **WHEN** 手機的時區是 `America/Los_Angeles`，邀請的到期時間是 `2026-11-25T06:32:00Z`
- **THEN** 顯示「Expires Nov 24, 2026」

### Requirement: SHARING-99.1 按 Share Link 交給系統的分享畫面

WHEN 使用者在 Invite 按「Share Link」，the mobile app SHALL 打開系統的分享畫面，交給它的內容只有整條邀請連結，沒有別的文字。

#### Scenario: 分享

- **WHEN** 在 Brisbane 的 Invite 按「Share Link」
- **THEN** 系統的分享畫面打開一次，內容是 Invite 上的那條連結，連 `#` 和它後面的字串在內，沒有別的文字

### Requirement: SHARING-100.1 已經有有效的邀請時直接顯示

WHEN 準備邀請，而這支手機存著這個群組有效的邀請，the mobile app SHALL 直接顯示它，不為此發出網路請求，沒有網路時也一樣；重新啟動 app 之後、邀請是套用別支手機的事件得來的（SYNC-81.1）時也一樣。存著不只一個有效的邀請時，顯示到期時間最晚的那一個，一樣晚時顯示代號的字元逐一比較起來比較大的那一個。

#### Scenario: 再打開

- **WHEN** Brisbane 的邀請建立好了之後關閉 Invite，再按「Invite with Link」
- **THEN** Invite 顯示同一條連結；API 沒有多收到請求

#### Scenario: 沒有網路

- **WHEN** 接著手機沒有網路，重新啟動 app，在 Brisbane 的 Members 按「Invite with Link」
- **THEN** Invite 顯示同一條連結

#### Scenario: 兩個有效的邀請

- **WHEN** Brisbane 存著這支手機建立的邀請，到期時間是 T+604,800,000；套用別支手機建立另一個邀請的事件，到期時間是 T+604,860,000；再打開 Invite
- **THEN** 顯示別支手機建立的那一個的連結

### Requirement: SHARING-101.1 存著的邀請都過期時建立新的

WHEN 準備邀請，而這個群組是共同帳本，這支手機存著的它的邀請都不是有效的——校正後的時間不比到期時間早——或一個都沒有，the mobile app SHALL 建立新的邀請，代號和 `#` 後面的字串都是新的。

#### Scenario: 到期前一毫秒

- **WHEN** Brisbane 的邀請在 T 建立，手機的時鐘是 T+604,799,999 時按「Invite with Link」
- **THEN** Invite 顯示原本的連結，API 沒有多收到請求

#### Scenario: 到期之後

- **WHEN** 手機的時鐘是 T+604,800,000 時按「Invite with Link」
- **THEN** API 收到一個建立邀請的請求，代號和原本的不同；Invite 顯示新的連結，「Expires Dec 2, 2026」；待上傳的事件多一個新邀請的事件

### Requirement: SHARING-102.1 撤回邀請

WHEN 使用者在 Invite 按「Revoke Link」，the mobile app SHALL 先跳出提示框：標題「Revoke Link?」，訊息「People who haven't joined yet won't be able to use this link.」，按鈕是「Cancel」和破壞性的「Revoke」。按「Revoke」才送撤回這個邀請的請求（SHARING-82.1）；API 回答撤回好了之後，在同一個 SQLite transaction 裡刪掉存著的這個邀請並寫下永久刪除它的事件（SYNC-80.1），然後關閉 Invite，回到 Members。按「Cancel」什麼都不做。

#### Scenario: 撤回

- **WHEN** 在 Brisbane 的 Invite 按「Revoke Link」，再按「Revoke」
- **THEN** API 收到對 `/groups/<Brisbane 的群組 ID>/invites/<代號>` 沒有內容的 `DELETE`；待上傳的事件多一個永久刪除這個邀請的事件；Invite 關閉，顯示 Members

#### Scenario: 撤回之後再邀請

- **WHEN** 接著按「Invite with Link」
- **THEN** API 收到建立邀請的請求，代號是新的；Invite 顯示新的連結

#### Scenario: 按 Cancel

- **WHEN** 在提示框按「Cancel」
- **THEN** API 沒有收到撤回的請求，Invite 仍顯示原本的連結，沒有多寫事件

### Requirement: SHARING-103.1 撤回沒成功時邀請還在

IF 撤回的請求沒有得到撤回好了的回答，或 API 回答撤回好了、本機資料卻存不進去，THEN the mobile app SHALL 留著這個邀請，不寫事件，Invite 仍顯示它，並跳出標題是「Unable to Revoke Link」的提示框：沒有得到回應時訊息是「Connect to the internet and try again.」，其他情況是「Something went wrong. Try again later.」。之後可以再撤回一次。

#### Scenario: 沒有網路

- **WHEN** 手機沒有網路，在 Invite 按「Revoke Link」，再按「Revoke」
- **THEN** 跳出「Unable to Revoke Link」，訊息是「Connect to the internet and try again.」；Invite 仍顯示原本的連結，沒有多寫事件

#### Scenario: API 拒絕

- **WHEN** API 拒絕撤回的請求，原因是不是成員
- **THEN** 跳出「Unable to Revoke Link」，訊息是「Something went wrong. Try again later.」；Invite 仍顯示原本的連結

#### Scenario: API 撤回了，手機卻存不下

- **WHEN** API 回答撤回好了，本機資料這時卻寫不進去；恢復之後再按「Revoke Link」和「Revoke」
- **THEN** 先跳出「Unable to Revoke Link」，訊息是「Something went wrong. Try again later.」，Invite 仍顯示原本的連結，沒有多寫事件；再撤回之後 Invite 關閉，待上傳的事件多一個永久刪除這個邀請的事件

### Requirement: SHARING-104.1 連不上 API 時說明要連上線才能邀請

IF 準備邀請時有請求沒有得到回應——沒有網路、連不上 API，或 app 建置時沒有給 API 的網址——THEN the mobile app SHALL 在 Invite 顯示「Connect to the internet to invite people to this group.」和角色為 button、名稱為「Try Again」的按鈕，不顯示連結；已經做完的步驟留著，按「Try Again」或下次按「Invite with Link」時，從還沒做完的那一步接著做。記帳不受影響：這個群組和其他的資料照常能新增和修改（ADR-0005）。

#### Scenario: 沒有網路

- **WHEN** 手機沒有網路，在 Brisbane 的 Members 按「Invite with Link」
- **THEN** Invite 顯示「Connect to the internet to invite people to this group.」和「Try Again」，沒有連結；Brisbane 不是共同帳本；關閉 Invite 之後在 Brisbane 新增一筆支出，存得下，沒有寫事件

#### Scenario: 連上線之後再試

- **WHEN** 接著手機有網路，再按「Invite with Link」
- **THEN** Invite 顯示邀請連結

#### Scenario: 建立群組的回應沒收到

- **WHEN** API 建立了群組，回應卻沒送到手機；之後在 Invite 按「Try Again」
- **THEN** 先顯示「Connect to the internet to invite people to this group.」，Brisbane 還不是共同帳本；按了之後 API 再收到一次建立這個群組的請求，Invite 顯示邀請連結

#### Scenario: 建立邀請的回應沒收到

- **WHEN** API 建立了邀請，回應卻沒送到手機
- **THEN** Invite 顯示「Connect to the internet to invite people to this group.」；Brisbane 已經是共同帳本，替它改名會寫事件

#### Scenario: 沒有 API 的網址

- **WHEN** app 建置時沒有給 API 的網址，在 Brisbane 的 Members 按「Invite with Link」
- **THEN** Invite 顯示「Connect to the internet to invite people to this group.」；app 沒有發出任何網路請求

### Requirement: SHARING-105.1 沒有結果的建立邀請，再試時用同一個代號

WHEN 建立邀請，the mobile app SHALL 在送出請求之前把這次的代號和 `#` 後面的字串存進本機資料；IF 這個請求沒有得到 API 的回答，被對簽名的請求的檢查拒絕（例如請求太多或時鐘，SHARING-31.2），得到看不懂的回應，或 API 回答邀請建立好了、邀請卻沒能存進本機資料（SHARING-97.1），THEN 下次準備這個群組的邀請時用同一個代號和字串再送，重新啟動 app 之後也一樣，所以 API 已經建立的邀請不會變成沒有人有字串的邀請。這一份只在兩個時候拿掉：邀請存好的那個 transaction 裡，和邀請 API 用它自己的原因拒絕這個請求的時候，也就是已經有邀請、沒有這個邀請、不是成員或內容不對（SHARING-79.1、SHARING-80.1、SHARING-85.1、SHARING-86.1）。

#### Scenario: 再試一次

- **WHEN** API 建立了邀請，回應卻沒送到手機；之後在 Invite 按「Try Again」
- **THEN** API 收到的第二個建立邀請的請求，路徑和第一個一樣；Invite 顯示的連結裡是這個代號

#### Scenario: 重新啟動之後

- **WHEN** API 建立了邀請，回應卻沒送到手機；重新啟動 app，在 Brisbane 的 Members 按「Invite with Link」
- **THEN** API 收到的建立邀請的請求，路徑和重新啟動之前的那一個一樣

#### Scenario: 再試時被請求太多擋下

- **WHEN** API 建立了邀請，回應卻沒送到手機；按「Try Again」時，建立邀請的請求因為請求太多被拒絕，等了之後再送仍被拒絕；之後再按一次「Try Again」
- **THEN** 被拒絕時 Invite 顯示「Something went wrong. Try again later.」（SHARING-106.1）；最後一次送出的建立邀請的請求，路徑和第一個一樣，Invite 顯示這個代號的連結

#### Scenario: API 建立了邀請，手機卻存不下它

- **WHEN** API 回答邀請建立好了，本機資料這時卻寫不進去；恢復之後在 Invite 按「Try Again」
- **THEN** 先顯示「Something went wrong. Try again later.」（SHARING-106.1），沒有待上傳的事件；按了之後 API 收到的第二個建立邀請的請求，路徑和第一個一樣，Invite 顯示這個代號的連結，待上傳的事件剛好一個

### Requirement: SHARING-106.1 邀請準備不了時的說明

IF 準備邀請時 API 的回答不是建立好了，或有東西存不進去，THEN the mobile app SHALL 在 Invite 顯示說明，不顯示連結：

- 建立群組或建立邀請被拒絕，原因是不是成員（例如群組 ID 已經是別的手機的群組，SYNC-47.1），或這支手機授權失效（SHARING-29.1）：「This group can't be shared from this phone.」，沒有「Try Again」。
- 建立邀請被拒絕，原因是已經有邀請：「Another member has already created an invite link. It appears here after this phone syncs.」和「Try Again」。
- 建立邀請被拒絕，原因是沒有這個邀請：換一組新的代號和字串再送一次；再被拒絕、原因又是沒有這個邀請，就照下一項，是別的原因就照那個原因的那一項。只有帶著這個原因的拒絕才算：沒有帶原因的 404 是看不懂的回應。
- 其他情況——註冊沒成功、請求太多、看不懂的回應、存不進 secure store 或本機資料——：「Something went wrong. Try again later.」和「Try Again」。

#### Scenario: 群組 ID 已經是別的手機的群組

- **WHEN** API 拒絕建立 Brisbane 的請求，原因是不是成員
- **THEN** Invite 顯示「This group can't be shared from this phone.」，沒有「Try Again」；Brisbane 不是共同帳本，照常能記帳

#### Scenario: 授權失效

- **WHEN** 這支手機授權失效，在 Brisbane 的 Members 按「Invite with Link」
- **THEN** Invite 顯示「This group can't be shared from this phone.」；app 沒有發出任何網路請求

#### Scenario: 別的成員已經建立邀請

- **WHEN** Brisbane 是共同帳本，這支手機沒有存著它的邀請，API 拒絕建立邀請的請求，原因是已經有邀請
- **THEN** Invite 顯示「Another member has already created an invite link. It appears here after this phone syncs.」和「Try Again」；沒有寫事件

#### Scenario: 之後套用了那個邀請的事件

- **WHEN** 接著套用別支手機建立邀請的事件，再按「Try Again」
- **THEN** Invite 顯示那個邀請的連結，API 沒有多收到建立邀請的請求

#### Scenario: 代號用過了

- **WHEN** API 拒絕第一個建立邀請的請求，原因是沒有這個邀請
- **THEN** API 接著收到第二個建立邀請的請求，代號不同；Invite 顯示第二個代號的連結

#### Scenario: 其他的拒絕

- **WHEN** API 拒絕註冊，原因是註冊太多；或拒絕建立群組，原因是請求太多，等了之後再送仍被拒絕；或對建立邀請的請求回 500，回沒有帶原因的 404，或回 200 但內容不是邀請建立好了的回應
- **THEN** Invite 都顯示「Something went wrong. Try again later.」和「Try Again」

### Requirement: SHARING-107.1 成員超過 20 位的群組不能變成共同帳本

IF 準備邀請時群組還不是共同帳本，而它有超過 20 位成員，前成員不算，THEN the mobile app SHALL 不發出任何網路請求，不讓群組變成共同帳本，在 Invite 顯示「A shared group can have up to 20 members. Remove members to invite people.」，沒有「Try Again」；剛好 20 位時照常準備邀請。

#### Scenario: 21 位成員

- **WHEN** Brisbane 有你和 20 位成員，還不是共同帳本，按「Invite with Link」
- **THEN** Invite 顯示「A shared group can have up to 20 members. Remove members to invite people.」；app 沒有發出任何網路請求，Brisbane 不是共同帳本

#### Scenario: 移出一位之後

- **WHEN** 接著移出一位成員，再按「Invite with Link」
- **THEN** Invite 顯示邀請連結，名片有 20 位成員

### Requirement: SHARING-108.1 名片太大時不能邀請

IF 準備邀請時要建立邀請（SHARING-92.1、SHARING-101.1），而名片會超過 65,536 bytes，也就是名片內容的 bytes 數加上加密多出來的 41 bytes 超過它，THEN the mobile app SHALL 不發出任何網路請求，還不是共同帳本的群組不變成共同帳本，在 Invite 顯示「The group and member names are too long to invite people. Shorten them and try again.」，沒有「Try Again」。

#### Scenario: 剛好 65,536 bytes

- **WHEN** 只有你的群組，群組名稱的長度讓名片剛好是 65,536 bytes，按「Invite with Link」
- **THEN** 邀請建立好了

#### Scenario: 多一個 byte

- **WHEN** 群組名稱再多一個字元，按「Invite with Link」
- **THEN** Invite 顯示「The group and member names are too long to invite people. Shorten them and try again.」；app 沒有發出任何網路請求，群組不是共同帳本

#### Scenario: 已經有有效的邀請

- **WHEN** 存著有效的邀請的共同帳本，群組名稱和成員名稱後來長到名片會超過 65,536 bytes，按「Invite with Link」
- **THEN** Invite 照常顯示存著的邀請（SHARING-100.1），不顯示這句話

### Requirement: SHARING-109.1 群組名稱或成員變動時更新名片

WHEN 群組名稱，或群組成員的名單、順序、名稱、有沒有使用者 ID，在這支手機上變了——在這支手機上改的，或套用收到的事件改的——而這支手機存著這個群組有效的邀請，the mobile app SHALL 用新的名片替 SHARING-100.1 會顯示的那個邀請再送一次建立邀請的請求（SHARING-78.1、SHARING-95.1），不必等使用者打開 Invite，也不顯示任何提示。IF 這個請求沒有得到邀請建立好了的回答，THEN 下次這些資料再變，或下次準備這個群組的邀請時再送。這些資料沒有變時不送；新的名片會超過 65,536 bytes（SHARING-108.1）時也不送，等它不超過了再送。

#### Scenario: 改群組名稱

- **WHEN** Brisbane 的邀請建立好了之後，把 Brisbane 改名為「Brissie」
- **THEN** API 多收到一個建立邀請的請求，代號和原本的一樣；解開它的名片，`name` 是「Brissie」；名片的 nonce 和上一份不同；沒有跳出提示框

#### Scenario: 成員變動

- **WHEN** 接著加入 Dana，把 Casey 改名為「Casey Lee」，再移出 Blake
- **THEN** API 又收到三個建立邀請的請求；最後一個的名片裡依序是 Taylor、Casey Lee 和 Dana

#### Scenario: 套用別支手機的事件

- **WHEN** 套用別支手機在 Brisbane 加入 Evan 的事件
- **THEN** API 多收到一個建立邀請的請求，名片的最後一位是 Evan，`hasDevice` 是 `false`

#### Scenario: 沒有網路時改的

- **WHEN** 手機沒有網路時把 Brisbane 改名為「Bris」，之後有網路，再按「Invite with Link」
- **THEN** 改名時沒有跳出提示框；按了之後 API 收到一個建立邀請的請求，名片的 `name` 是「Bris」；Invite 顯示原本的連結

#### Scenario: 名片沒有變

- **WHEN** Brisbane 的邀請建立好了之後，新增一筆 Brisbane 的支出、新增一個分類，再關閉又打開 Invite
- **THEN** API 沒有多收到請求

#### Scenario: 沒有有效的邀請

- **WHEN** 撤回 Brisbane 的邀請之後把它改名；或邀請過期之後把它改名
- **THEN** API 沒有收到建立邀請的請求

#### Scenario: 被拒絕

- **WHEN** API 拒絕更新名片的請求，原因是沒有這個邀請
- **THEN** 沒有跳出提示框，存著的邀請不變，沒有多寫事件

#### Scenario: 名片太大

- **WHEN** Brisbane 的邀請建立好了之後，把群組名稱改成 40,000 個字元，再把你的成員名稱改成 40,000 個字元，之後把成員名稱改回「Tay」
- **THEN** 改群組名稱之後 API 收到新的名片；改成員名稱之後 API 沒有多收到建立邀請的請求，也沒有跳出提示框；改回「Tay」之後 API 收到新的名片，裡面是 40,000 個字元的群組名稱和「Tay」

### Requirement: SHARING-110.1 (manual) 掃 QR code 和分享連結

WHEN 使用者在真的手機上把邀請交給別人，the mobile app SHALL 讓系統的分享畫面送出完整的邀請連結，並讓別支手機的相機掃 Invite 上的 QR code 時打開同一條連結。

#### Scenario: iPhone 和 Android 各做一次

- **WHEN** 在裝了連到一個環境的 build 的手機上，替一個群組按「Invite with Link」，按「Share Link」用訊息 app 傳給另一支手機；再用另一支手機的相機掃 Invite 上的 QR code；在 Android 上另外按返回鍵
- **THEN** 系統的分享畫面打開；收到的訊息是完整的連結，連 `#` 後面的字串在內；相機認出同一條連結，點了之後打開 app 的 Invite Link（SHARING-70.1、SHARING-71.1），或在沒裝 app 的手機上打開下載頁；Android 的返回鍵關閉 Invite，回到 Members

### Requirement: SHARING-111.1 邀請的請求等不到回應時在 60 秒後放棄

IF 準備邀請、撤回邀請或更新名片時送出的一個請求——註冊這支手機的請求也算——送出 60 秒之後還沒有收完回應，THEN the mobile app SHALL 放棄這個請求，把它當成沒有得到回應：準備邀請照 SHARING-104.1 和 SHARING-105.1，撤回照 SHARING-103.1，更新名片照 SHARING-109.1。放棄之後才到的回應不算數：不存邀請，不寫事件，Invite 顯示的也不變。這支手機之後送的請求不等被放棄的那一個。每個送出的請求各自算 60 秒：API 要求等待的時間（SHARING-28.1）不算在內，等過之後或校正時鐘之後再送的那一次重新算。

#### Scenario: 註冊一直沒有回應

- **WHEN** Taylor 的手機還沒有裝置身分，在 Brisbane 的 Members 按「Invite with Link」，API 一直沒有回答註冊的請求；過了 50 秒；再過 15 秒；之後 API 照常回答，按「Try Again」
- **THEN** 50 秒時 Invite 的內容只有「Creating link…」；再過 15 秒，Invite 顯示「Connect to the internet to invite people to this group.」和「Try Again」，Brisbane 不是共同帳本；按了之後 API 收到第二個註冊的請求，Invite 顯示邀請連結

#### Scenario: 建立邀請的回應在放棄之後才到

- **WHEN** API 建立了邀請，卻一直沒有回答那個請求；過了 65 秒 API 才回答；之後按「Try Again」
- **THEN** 65 秒時 Invite 顯示「Connect to the internet to invite people to this group.」和「Try Again」；回答到了之後 Invite 顯示的不變，沒有待上傳的事件；按了之後 API 收到的第二個建立邀請的請求，路徑和第一個一樣，Invite 顯示這個代號的連結，待上傳的事件剛好一個

#### Scenario: 撤回一直沒有回應

- **WHEN** 在 Invite 按「Revoke Link」，再按「Revoke」，API 撤回了邀請，卻一直沒有回答；過了 50 秒；再過 15 秒
- **THEN** 50 秒時沒有跳出別的提示框；再過 15 秒，跳出「Unable to Revoke Link」，訊息是「Connect to the internet and try again.」，Invite 仍顯示原本的連結，沒有多寫事件

#### Scenario: 更新名片一直沒有回應

- **WHEN** Brisbane 的邀請建立好了之後，把 Brisbane 改名為「Brissie」，API 一直沒有回答更新名片的請求；過了 65 秒，API 仍沒有回答，再把它改名為「Bris」
- **THEN** 沒有跳出提示框；API 再收到一個建立邀請的請求，代號和原本的一樣，名片的 `name` 是「Bris」

#### Scenario: 每個請求各自算 60 秒

- **WHEN** Taylor 的手機還沒有裝置身分，在 Brisbane 的 Members 按「Invite with Link」，API 過了 50 秒才回答註冊的請求，又過了 50 秒才回答建立群組的請求
- **THEN** API 回答建立群組的請求之前，Invite 的內容只有「Creating link…」；回答之後 Invite 顯示邀請連結；API 只收到一個註冊的請求和一個建立群組的請求
