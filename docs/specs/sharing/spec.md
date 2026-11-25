# Sharing

## Purpose

共同帳本靠金鑰認手機，內容加密之後才離開手機（ADR-0015、ADR-0022）。這裡有十四塊：`packages/domain` 的加密工具（SHARING-1.1 到 16.1）；手機 app 的裝置身分，和它怎麼替送給 API 的每個請求簽名（SHARING-19.2 到 30.1、43.1、45.1、46.1）；API 怎麼替手機註冊、檢查簽名和限制請求（SHARING-31.2 到 42.1、44.1、47.1 到 51.1）；邀請連結的基礎（SHARING-60.1 到 76.1）；API 怎麼替共同帳本存下邀請和它的名片（SHARING-77.1 到 89.1）；手機 app 怎麼讓群組變成共同帳本、建立和撤回邀請（SHARING-90.1 到 111.1）；API 怎麼替邀請存下加入的申請（SHARING-112.1 到 122.1）；手機 app 怎麼讓拿到邀請連結的人看到群組、選自己是誰、送出申請並等待同意（SHARING-123.1 到 145.1）；API 怎麼讓成員手機列出、同意和拒絕申請，並告訴申請的手機結果（SHARING-170.1 到 188.1）；手機 app 怎麼讓成員同意或拒絕申請、讓申請的手機得知結果並加入（SHARING-190.2 到 229.1）；API 怎麼讓成員手機移除別的成員手機、退出和換鑰匙（SHARING-250.1 到 265.1）；手機 app 怎麼移除有手機的成員、退出、替群組換鑰匙和拿到新的鑰匙（SHARING-270.1 到 289.1）；API 怎麼讓成員手機在同一個請求裡同意接手、移除舊手機和換鑰匙（SHARING-300.1 到 308.1）；和手機 app 怎麼讓人接手已經有手機的成員、讓成員同意接手，以及授權失效的手機怎麼換一個新的裝置身分（SHARING-320.1 到 330.1）。手機 app 和 API 用 `packages/domain` 的同一個函式組出要簽的 bytes（SHARING-17.1、18.1）。裝置身分和簽名沒有畫面：授權失效的手機除了不能邀請（SHARING-106.1）之外畫面上顯示什麼，不在這裡。

加密工具：用鑰匙加密和解密內容、用私鑰簽名、把內容裝成只有另一支手機打得開的 box，以及從密鑰材料導出金鑰。工具放在 `packages/domain` 自己的入口，給手機 app 用；它不存任何東西、不連網路，也不自己產生鑰匙、私鑰、nonce 或 salt（SHARING-14.1）。演算法是 XChaCha20-Poly1305（draft-irtf-cfrg-xchacha-03）、Ed25519（RFC 8032）、X25519（RFC 7748）和 HKDF-SHA-256（RFC 5869）。bytes 是一個 `Uint8Array`，以十六進位寫出：`0x01` 是一個 byte，沒有 `0x` 的一串是依序的 bytes，`…` 是省略的部分。鑰匙是 32 bytes 的對稱金鑰。nonce 是呼叫者給的 24 bytes，每次加密或裝 box 都要是新的隨機值。附加資料是一段不加密、但解密時要給出一模一樣的 bytes，可以是空的。密文是 SHARING-1.1 的格式，它的第一個 byte 是格式版本。簽名私鑰是 32 bytes 的 Ed25519 私鑰，box 私鑰是 32 bytes 的 X25519 私鑰，各有一把 32 bytes 的公開金鑰（SHARING-5.1、7.1）。共享密鑰是 X25519 用一把 box 私鑰和另一把 box 公開金鑰算出的 32 bytes。box 是交出方裝給收受方的密文（SHARING-8.1）：情境是裝 box 時給的一段 bytes，可以是空的；salt 是裝 box 時可以再給的 32 bytes；打開時兩者都要和裝的時候一樣。密鑰材料是導出金鑰的來源，用途是用來區分金鑰的一段 bytes，兩者都可以是字串（SHARING-12.1）。解密密文或打開 box 有兩種失敗：解不開（SHARING-3.1、10.1、11.1）和不認得格式版本（SHARING-4.2），兩種都不回傳任何內容。`packages/domain` 拒絕，是丟出錯誤，不產出任何結果。不是 bytes 的輸入一律先被拒絕（SHARING-16.1），只有導出金鑰的密鑰材料和用途也可以是字串；其他的規則說的都是這樣的輸入。沒給一個輸入，是指沒有它，或它是 `undefined`；只有 salt 可以不給。SHARING-15.1 列出的輸入（鑰匙、私鑰、nonce、box 的 salt 和裝 box 時收受方的公開金鑰）長度不對時也一律先被拒絕；要解密的 bytes、要打開的 box 和交出方的公開金鑰不管多長，都照其他的規則回報。

裝置身分是一支手機給 API 認的身分：一個裝置 ID 和一個 seed。裝置 ID 是小寫的第 4 版 UUID，存在本機資料（shell）；seed 是 32 bytes 的隨機值，只存在 `expo-secure-store`（下面叫 secure store），本機資料和 API 都沒有它。簽名私鑰從 seed 導出（SHARING-21.1），它的公開金鑰就是這支手機的公開金鑰；box 私鑰也從 seed 導出，用途不同（SHARING-136.1）。一支手機是這三種之一：沒有裝置身分，是本機資料沒有裝置 ID；有裝置身分，是本機資料有裝置 ID，secure store 裡也有它的 seed；授權失效，是本機資料有裝置 ID，secure store 裡卻沒有它的 seed（SHARING-29.1）；授權失效的手機在使用者送出加入的申請時換一個新的裝置身分（SHARING-321.1），別的時候都不換。送請求是手機 app 的其他功能要連 API 時做的事：交出 API 的網址、方法、路徑和可以沒有的內容，得到 API 的回應，或得知沒有得到回應、沒有送出（SHARING-22.1 到 30.1）；內容是 bytes，交來的是文字時用它的 UTF-8 編碼。送請求失敗，是呼叫的一方得到錯誤，不是上面任何一種結果（SHARING-24.1、25.1、30.1、45.1）。手機 app 用執行環境全域的 `fetch` 連 API。註冊是手機把裝置 ID 和公開金鑰交給 API（SHARING-22.1、38.1）。手機的時鐘是手機自己的時間；時間差是 API 的時間減掉手機的時鐘，由 API 告訴手機（SHARING-27.2），還沒得知時是 0；校正後的時間是手機的時鐘加上時間差。重新啟動 app 是結束 app 再打開，本機資料和 secure store 裡的東西都還在。

簽名的請求是帶著四個欄位的 HTTP 請求：裝置 ID、請求時間、請求的 nonce 和簽名。請求時間是簽名當下的時間，從 1970-01-01T00:00:00Z 起的毫秒數；請求的 nonce 是 16 bytes 的隨機值，寫成 32 個小寫十六進位字元，和加密用的 nonce 無關；簽名是簽名私鑰對要簽的 bytes（SHARING-17.1）的簽名（SHARING-6.1），寫成 128 個小寫十六進位字元。方法是 HTTP 的方法，例如 `GET` 和 `POST`。路徑是請求的網址裡，從主機後面的 `/` 起到結尾的部分，有查詢時連 `?` 和查詢在內；它只能用送出和收到時都不會被改寫的寫法（SHARING-18.1），所以手機簽的和 API 收到的是同一段文字。請求的內容是 HTTP 的 body，沒有時是 0 bytes；`GET` 和 `HEAD` 的請求，API 一律當它的內容是 0 bytes，不讀它帶的 body（SHARING-51.1）：手機不送帶內容的 `GET` 和 `HEAD`（SHARING-45.1），而 API 拿不拿得到這種 body，要看它跑在 Node 還是 Cloudflare Workers 上。內容雜湊是內容那些 bytes 的 SHA-256。標明的內容長度是請求的 `Content-Length` 寫的 bytes 數；沒有 `Content-Length` 就是沒有標明，這時不論內容怎麼送來，收到結尾才知道它有多長，HTTP/1.1 的分段送（`Transfer-Encoding: chunked`）是其中一種。內容的上限是 1,048,576 bytes（1 MiB），不是打公開的路由的請求都用這一個（SHARING-48.2）；API 不等過大的內容送完就拒絕（SHARING-49.1），所以不必把超過上限的內容留在記憶體裡，沒簽名的人送再大的內容也一樣。四個欄位怎麼放進請求、註冊的內容，和 API 每種回應的格式，都定義在 `packages/domain` 的程式裡，手機 app 和 API 用同一份。

API 的時間是 API 處理請求時自己的時鐘，從 1970-01-01T00:00:00Z 起的毫秒數。請求通過檢查，是它是簽名的請求，而且沒有被 SHARING-32.1 到 37.1 和 48.2 任何一條拒絕，註冊的請求還要沒有被 SHARING-39.1 到 41.1 和 47.1 拒絕，也不是 SHARING-44.1 說的、API 不註冊的那一種；通過檢查的請求才交給路由。這裡的 requirement 說 API 拒絕一個請求，是回應一個帶著原因的拒絕，不做這個請求要做的事，資料庫和收到它之前一模一樣；原因是簽名、時鐘、重送、請求太多、內容不對、內容太大或註冊太多。通過檢查之後才被路由自己拒絕的請求不在這裡：它已經通過檢查，所以算進這支裝置的請求數，nonce 也用掉了，路由的 requirement 自己說它拒絕時什麼不變（SYNC-60.2、SHARING-87.2、SHARING-119.1、SHARING-182.2、SHARING-262.1）。公開的路由是不必簽名的路由：`GET /health`，以及在自己的 requirement 裡寫明不必簽名的路由（SHARING-60.1 到 62.1、76.1、83.2）；公開的路由不讀請求的內容（SHARING-50.1）。IP 是請求來自的 IPv4 或 IPv6 位址：API 在 Cloudflare Workers 上時是 Cloudflare 放在 `CF-Connecting-IP` 的位址，在 Node 上時是連線的來源位址，都不是請求自己帶的其他標頭。IP 雜湊的金鑰是 API 所在的環境給它的一段保密的文字，用來算 IP 加了金鑰的雜湊（SHARING-42.1、44.1）。

SHARING-17.1 到 51.1 的情境裡，T 是 `2026-11-18T06:32:00Z`，也就是 1794983520000；除非另外說明，手機的時鐘和 API 的時間都是 T，API 的網址是 `https://api.example.test`。Taylor 的手機的裝置 ID 是 `0f8fad5b-d9cb-469f-a165-70867728950e`，Casey 的手機是 `7c9e6679-7425-40de-944b-e07fc1f90ae7`，各有自己的簽名私鑰；API 的情境裡，除非另外說明，請求都來自 `203.0.113.7`，Taylor 的手機已經註冊。`/no-such-route` 是一個沒有路由的路徑。

邀請連結的基礎（ADR-0023）：點邀請連結時，裝了 app 的手機直接打開 app，沒裝的人看到下載頁（SHARING-60.1 到 76.1）。邀請連結是 `https://<主機>/i/<代號>#<字串>`（ADR-0015）：主機是 API 在這個環境的網域，代號是路徑裡 `/i/` 後面的那一段，`#` 後面的部分只留在開連結的那支手機上，瀏覽器不會把它送給任何伺服器。API 給三樣東西：iOS 和 Android 用來確認這個網域的連結歸 app 開的兩個驗證檔（SHARING-60.1、61.1），和下載頁（SHARING-62.1 到 68.1）；誰都可以拿，請求不必簽名，也不必帶裝置身分，用 `HEAD` 問也一樣（SHARING-76.1）。它們的內容出自這個環境的 App 設定：開邀請連結的 iOS App，各寫成 `<Team ID>.<bundle ID>`；開邀請連結的 Android App，各有 package 名稱和簽它的憑證的 SHA-256 指紋；以及 iPhone 和 Android 各一個下載連結。每一項都可以沒有。下載頁是 API 對邀請連結的路徑回的網頁；頁面上的文字是它顯示給人看的字，不算 `<head>`、`<script>` 和 `<style>` 裡的。對手機 app 來說，邀請連結是系統交給它的這兩種連結：scheme 是 `https`、路徑以 `/i/` 開頭的連結，不管主機是什麼，因為系統只把驗證過的網域的連結交給 app；和以 `shared-expense-tracker://i/` 開頭的連結，也就是下載頁的「Open in App」帶的那一種（SHARING-66.1）。系統交連結給 app 有兩個時機：app 沒在執行時用它啟動 app，和 app 執行中時交給它。SHARING-60.1 到 69.1 和 76.1 不看代號和 `#` 後面的部分是什麼，也不看有沒有這個邀請：下載頁對每個代號都一樣。手機 app 收到邀請連結時打開 Join Group（SHARING-71.2 到 73.2）；Join Group 的內容照連結而定，見 SHARING-123.1 到 145.1。SHARING-60.1 到 76.1 的情境裡，API 的網址是 `https://links.example.test`，「完整的連結」是 `https://links.example.test/i/3q2-7wEjRWeJq83vEjRWeA#AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8`，它的代號和 `#` 後面的部分只是長度和字元像真的例子；「半條連結」是它沒有 `#` 和後面的部分的那一段，`https://links.example.test/i/3q2-7wEjRWeJq83vEjRWeA`。SHARING-71.2 到 74.1 的情境裡，app 建置時沒有給 API 的網址，手機上也沒有共同帳本和申請：所以完整的連結在 Join Group 顯示「Connect to the internet to join this group.」（SHARING-133.1），半條連結顯示「This invite link can't be used. Ask the person who sent it to send it again.」（SHARING-123.1），兩者都不發出網路請求。

邀請（ADR-0015、ADR-0026）：共同帳本的成員建立邀請，把它的連結或 QR code 交給別人；邀請可以給好幾個人用。代號是 16 bytes 的隨機值，`#` 後面的字串是 32 bytes 的隨機值，都由建立邀請的手機產生，寫成沒有 `=` 的 base64url（RFC 4648 第 5 節），分別是 22 個和 43 個字元；16 bytes 的寫法最後一個字元只會是 `A`、`Q`、`g` 或 `w`，32 bytes 的寫法最後一個字元只會是 `AEIMQUYcgkosw048` 裡的一個。名片是手機加密過的群組名稱和成員名單（SHARING-95.1），讓拿到連結的人在申請之前看得到要加入哪個群組；API 不解讀它，它是 41 到 65,536 bytes，在請求和回應裡寫成小寫的十六進位。名片的 cursor 是上傳名片的手機那時在這個群組的 cursor（sync）。

邀請 API 是三個請求。建立邀請和撤回是簽名的請求，先通過對簽名的請求的檢查，才輪到 SHARING-77.1 到 89.1：建立邀請是 `PUT /groups/<群組 ID>/invites/<代號>`，內容是 JSON，更新名片也是它；撤回是 `DELETE /groups/<群組 ID>/invites/<代號>`，沒有內容。讀邀請是 `GET /invites/<代號>`，是公開的路由（SHARING-83.2）：拿到連結的人還沒有裝置身分就讀得到名片，而沒有連結的字串的人解不開它。群組、成員手機和群組最新的序號是 sync 的事件 API 的那一些。API 上的邀請是 API 替一個群組記的東西：代號、到期時間、有沒有被撤回，以及名片和名片的 cursor。到期時間是建立時 API 的時間加 604,800,000 毫秒，也就是 7 天。有效的邀請是沒有被撤回、API 的時間也比到期時間早的邀請；一個群組同時最多有一個。API 見過的代號，是 API 記著的任何一個邀請的代號，不管那個邀請有沒有效。API 回答邀請建立好了、撤回好了，指的都是狀態碼 200。邀請 API 拒絕一個請求，是回應一個帶著原因的拒絕，不做這個請求要做的事：原因是內容不對（400）、不是成員（403，sync 的同一個原因）、已經有邀請（409，`invite-exists`）或沒有這個邀請（404，`no-invite`）。請求的內容和每種回應有哪些欄位、各是什麼型別，定義在 `packages/domain` 的程式裡，手機 app 和 API 用同一份。

API 的情境（SHARING-77.1 到 89.1）沿用 sync 的 API 情境：T、Taylor 和 Casey 的手機、Brisbane 和 Tokyo 都和那裡一樣，Brisbane 已經由 Taylor 的手機建立，Tokyo 還沒有建立，除非另外說明。代號 A 是 `3q2-7wEjRWeJq83vEjRWeA`，代號 B 是 `AAECAwQFBgcICQoLDA0ODw`，代號 C 是 `__7dzLuqmYh3ZlVEMyIRAA`。名片 X、Y、Z、W 各是 200 bytes、內容不同的隨機 bytes；除非另外說明，名片的 cursor 是 0。情境說一支手機是成員手機，而那個群組不是它建立的，是測試直接把它記成成員手機。

手機 app 這一邊（SHARING-90.1 到 111.1）：API 的網址是 app 建置時環境變數 `EXPO_PUBLIC_API_URL` 給的網址，沒有結尾的 `/`，例如 `https://api.example.test`；邀請連結的主機就是它的主機。群組鑰匙是共同帳本的手機加密事件用的 32 bytes 的鑰匙，一個鑰匙世代一把（ADR-0015）；這裡只產生世代 1 的，事件怎麼用它加密不在這裡（sync）。手機上的邀請是本機資料替一個共同帳本存著的邀請：代號、`#` 後面的字串和到期時間；校正後的時間比到期時間早，它就是有效的。邀請是共同帳本的一種紀錄：建立和撤回都寫成事件（SYNC-80.2），別的成員手機套用事件之後也存著它（SYNC-81.1），所以每位成員看到的是同一條連結，也都能撤回。待上傳的事件、共同帳本、校正後的時間和套用見 sync。Invite 是從 Members 打開的畫面。準備邀請是按「Invite with Link」或「Try Again」之後手機做的事：有有效的邀請就顯示它（SHARING-100.1），沒有就建立一個，群組還不是共同帳本時先讓它變成共同帳本（SHARING-92.1）；它的結果是 Invite 顯示邀請，或顯示一句說明。

手機 app 的情境（SHARING-90.1 到 111.1）裡，T、手機的時鐘和 API 的時間同 SHARING-17.1 的情境，API 的網址是 `https://api.example.test`，名字是 Taylor，手機的地區是美國、時區是 `Asia/Taipei`。Brisbane 和 Tokyo 是 Taylor 建立的群組；除非另外說明，它們還不是共同帳本，手機沒有裝置身分，API 照 SHARING-31.2 到 89.1 和 SYNC-45.1 回答。「邀請建立好了」指 Invite 顯示邀請連結。

申請加入（ADR-0015、ADR-0032）：拿到邀請連結的人在自己的手機上看到要加入哪個群組，選自己是誰，送出申請，等一位成員同意。成員怎麼看到申請、同意或拒絕，和申請的手機怎麼得知結果，見 SHARING-170.1 到 SHARING-229.1；接手已經有手機的成員見 SHARING-300.1 到 SHARING-330.1。

申請 API（SHARING-112.1 到 122.1）：API 上的申請是 API 替一個邀請和一支手機記的東西：邀請的代號、申請的手機的裝置 ID、收到的時間和申請的內容；一支手機在一個邀請最多有一個。申請的內容是手機加密過的名字、選擇和公開金鑰（SHARING-135.2），API 不解讀它，它是 41 到 65,536 bytes，在請求裡寫成小寫的十六進位。只有有效的邀請有申請：邀請被撤回時，API 不再存著它的申請；邀請過期之後，它的申請不再算數。申請 API 是兩個簽名的請求，先通過對簽名的請求的檢查，才輪到 SHARING-112.1 到 122.1：送出申請是 `PUT /invites/<代號>/request`，內容是 JSON `{"request":"<十六進位>"}`；取消申請是 `DELETE /invites/<代號>/request`，沒有內容。兩個說的都是「這支手機在這個邀請的申請」，是哪支手機，看請求的裝置 ID。API 回答申請送出了、取消好了，指的都是狀態碼 200，回應是 `{"code":"<代號>"}`。申請 API 拒絕一個請求，是回應一個帶著原因的拒絕，不做這個請求要做的事：原因是內容不對（400）、沒有這個邀請（404，`no-invite`）、已經是成員（409，`already-a-member`）或申請太多（409，`requests-full`）。請求的內容和每種回應有哪些欄位、各是什麼型別，定義在 `packages/domain` 的程式裡，手機 app 和 API 用同一份。

申請 API 的情境沿用邀請 API 的情境。除非另外說明：Brisbane 有代號 A 的有效邀請，是 Taylor 的手機在 T 建立的；Casey 的手機註冊過，不是 Brisbane 的成員手機。申請 P、Q、R 各是 200 bytes、內容不同的隨機 bytes。「別的手機」是另外註冊、不是任何群組的成員手機的手機。

手機 app 申請加入（SHARING-123.1 到 145.1）：Join Group 是手機 app 收到邀請連結時打開的畫面（SHARING-71.2），它的內容是標題列下面顯示的東西。連結的代號是邀請連結的路徑裡 `/i/` 後面，到 `?`、`#` 或結尾為止的那一段；連結的字串是第一個 `#` 後面的部分。寫法對的連結，是代號是 16 bytes、字串是 32 bytes 的 base64url 寫法的邀請連結，都沒有 `=`，也就是 SHARING-94.1 產生的那種；主機是什麼、有沒有查詢都不看。讀邀請是手機 app 對 API 的網址送沒有簽名的 `GET /invites/<代號>`（SHARING-83.2、SHARING-124.1）：它不是送請求，不帶簽名的四個欄位，不產生裝置身分，也不註冊。名片金鑰、名片的附加資料和名片內容見 SHARING-95.1；名片上的成員是解開的名片依序列出的成員，`hasDevice` 是 `true` 的是有手機的成員，`false` 的是沒有手機的成員。同名照 groups 的定義：去掉頭尾空白並轉成小寫後相同。你的名字和你的使用者 ID 見 shell。手機上的申請是本機資料存著的申請：邀請的代號和連結的字串、群組名稱、申請的名字、選的成員的成員 ID（選新成員時沒有）、是不是要接手（SHARING-320.1），和 API 有沒有回答過它送出了：回答過的是送出了的申請，還沒有的是還沒送出的申請。它是本機資料的一部分，所以重新啟動 app 之後還在，匯出檔也帶著它（backup）。申請金鑰是從連結的字串導出的金鑰（SHARING-135.2）。box 私鑰是這支手機從 seed 導出的 X25519 私鑰（SHARING-136.1）。手機 app 只在使用者打開連結、按「Send Request」、「Try Again」或取消申請時替申請送出或取消：它不自己重送申請；申請的結果，它在 app 打開和打開那個申請時問（SHARING-210.1）。

手機 app 申請加入的情境裡，T、手機的時鐘、API 的時間和 API 的網址同 SHARING-90.1 的情境，手機的地區是美國。這支手機是 Dana 的手機：除非另外說明，名字是「Dana」，沒有裝置身分，沒有群組，也沒有申請。Brisbane 是 Taylor 在別支手機上建立的共同帳本，成員依序是 Taylor（有手機，成員 ID `1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed`）、Casey（沒有手機，`6ec0bd7f-11c0-43da-975e-2a8ad9ebae0b`）和 Blake（沒有手機，`3f2504e0-4f89-41d3-9a0c-0305e82c3301`）。它有效的邀請是代號 A，`3q2-7wEjRWeJq83vEjRWeA`，在 T 建立；字串 S 是 `AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8`，也就是 `000102…1e1f` 那 32 bytes；API 存著用 S 的名片金鑰加密的 Brisbane 的名片。「Brisbane 的連結」是 `https://api.example.test/i/3q2-7wEjRWeJq83vEjRWeA#AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8`；「打開 Brisbane 的連結」是 app 停在 Expenses 的根畫面時，系統交來這條連結。Tokyo 是另一個共同帳本，只有 Taylor 一位成員，有手機；它有效的邀請是代號 B，`AAECAwQFBgcICQoLDA0ODw`，字串 S2 是 `ICEiIyQlJicoKSorLC0uLzAxMjM0NTY3ODk6Ozw9Pj8`，「Tokyo 的連結」照同樣的寫法。「表單」是 Join Group 顯示群組名稱、名字欄位和成員的樣子（SHARING-125.2）。「送出申請」沒有另外說明時，是打開 Brisbane 的連結，不改名字和選擇，按「Send Request」，API 回答申請送出了。API 照 SHARING-31.2 到 122.1 回答，除非另外說明。

同意或拒絕（ADR-0015、ADR-0039）：共同帳本的任何一位成員都能在自己的手機上看到加入的申請，同意或拒絕；同意之後，新手機拿到群組鑰匙和全部資料，它在群組裡就是申請時選的那位成員，每位成員都看得到。兩位成員同時處理同一個申請時，API 以先到的為準。申請的通知不在這裡；接手已經有手機的成員見 SHARING-300.1 到 SHARING-330.1，移除手機見 SHARING-250.1 到 SHARING-289.1。

同意的 API（SHARING-170.1 到 188.1）是四個簽名的請求，先通過對簽名的請求的檢查。前三個只有群組的成員手機能用：列出申請是 `GET /groups/<群組 ID>/requests`，接著列時是 `GET /groups/<群組 ID>/requests?after=<裝置 ID>`；拒絕是 `DELETE /groups/<群組 ID>/requests/<裝置 ID>?request=<那個申請的內容的 SHA-256>`，沒有內容；同意是 `POST /groups/<群組 ID>/requests/<裝置 ID>/approval`，內容是 JSON。路徑裡的裝置 ID 是申請的那支手機的。第四個是申請的手機問結果：`GET /invites/<代號>/request`。群組的申請，是這個群組有效的邀請底下的申請；群組沒有有效的邀請時一個都沒有。同意的內容有七個欄位：`request` 是那個申請的內容的 SHA-256，寫成 64 個小寫十六進位字元，讓 API 認出同意的是不是它現在存著的那一份，拒絕的網址帶的 `request` 也是它；`cursor` 是同意的手機在這個群組的 cursor；`snapshotId` 是它替申請的手機上傳的快照的快照 ID（sync）；`senderKey` 是它的 box 公開金鑰，32 bytes 的小寫十六進位寫法；`epoch` 是鑰匙世代；`box` 是裝著群組鑰匙、只有申請的手機打得開的 box（SHARING-198.1），41 到 65,536 bytes 的小寫十六進位寫法，API 不解讀它；`events` 是照上傳的寫法寫的事件（SYNC-53.1），API 也不解讀。交接是 API 替一支被同意的手機記的東西：邀請的代號、申請的裝置 ID、同意的裝置 ID、交出方的 box 公開金鑰、鑰匙世代和 box。API 回答列出的一頁、拒絕好了、同意好了和問到的結果，指的都是狀態碼 200。同意的 API 拒絕一個請求，是回應一個帶著原因的拒絕，不做這個請求要做的事：原因是內容不對（400）、不是成員（403）、沒有這個申請（404，`no-request`）、沒有跟上（409，`behind`）、需要換鑰匙（409，`rotation-needed`，SHARING-256.1）、鑰匙世代（409，sync 的同一個原因）、沒有快照（404，sync 的同一個原因）、成員手機滿了（409，`members-full`）或群組滿了（413，sync 的同一個原因）；問結果另外有沒有這個邀請（404）和已經是成員（409）。請求的內容和每種回應有哪些欄位、各是什麼型別，定義在 `packages/domain` 的程式裡，手機 app 和 API 用同一份。

同意的 API 的情境沿用申請 API 的情境和 sync 的 API 的快照情境。除非另外說明：Brisbane 有代號 A 的有效邀請，沒有事件；Casey 的手機在代號 A 送出了申請 P，它不是成員手機；S 是 Taylor 的手機給 Casey 的手機的完整快照，涵蓋的序號是 0。K 是 32 bytes、B 是 200 bytes 的隨機 bytes，E 是一個 200 bytes 的事件。「同意 Casey」是 Taylor 的手機送 `POST /groups/9b2f6c1e-8d47-4f3a-b1c5-2e7d90a4f6b8/requests/7c9e6679-7425-40de-944b-e07fc1f90ae7/approval`，內容是 `{"request":"<P 的 SHA-256>","cursor":0,"snapshotId":"<S 的快照 ID>","senderKey":"<K 的十六進位>","epoch":1,"box":"<B 的十六進位>","events":[{"id":"<E 的事件 ID>","content":"<E 的內容的十六進位>"}]}`；「拒絕 Casey」是它送 `DELETE /groups/9b2f6c1e-8d47-4f3a-b1c5-2e7d90a4f6b8/requests/7c9e6679-7425-40de-944b-e07fc1f90ae7?request=<P 的 SHA-256>`，沒有內容。

手機 app 同意或拒絕（SHARING-190.2 到 204.1）：收到的申請是成員的手機從 API 列出、用邀請的字串解開的申請（SHARING-191.2），只留在記憶體裡，不存進本機資料。申請的名字是申請的明文的 `name`，選的成員是 `memberId` 指的成員，`memberId` 是 `null` 的是要當新成員的申請，`takeover` 是 `true` 的是要接手的申請（SHARING-135.2、SHARING-191.2）。名冊、名冊紀錄和有手機的成員見 sync（SYNC-250.2、SYNC-251.2）。處理一個申請，是替它送同意或拒絕到有結果為止。它的畫面在 groups：群組的畫面上的按鈕（GROUPS-130.1）、Members 的申請那一區（GROUPS-131.2）和申請的選單（GROUPS-132.2）。這裡的情境沿用 SHARING-90.1 的手機 app 情境：這支手機是 Taylor 的手機，Brisbane 的成員依序是 Taylor、Casey 和 Blake，已經邀請過，所以是共同帳本，有有效的邀請，它的代號是 A、字串是 S；除非另外說明，Brisbane 沒有待上傳的事件，API 上它只有 Taylor 的手機一支成員手機。Dana 的手機是另一支註冊過的手機，裝置 ID 是 D，使用者 ID 是 `c9bf9e57-1685-4c89-bafb-ff5af830be8a`，有自己的 seed；「Dana 申請當新成員」是 API 上代號 A 底下有 D 的申請，內容是用 S 的申請金鑰加密的 `{"name":"Dana","memberId":null,"userId":"c9bf9e57-1685-4c89-bafb-ff5af830be8a","boxKey":"<Dana 的手機的 box 公開金鑰>"}`，照 SHARING-135.2 補了空格；「Dana 申請當 Casey」的 `memberId` 是 Casey 的成員 ID。「列出申請」是這支手機同步 Brisbane 之後照 SHARING-190.2 做的事。

手機 app 得知結果並加入（SHARING-210.1 到 229.1）：問結果是申請的手機替本機資料的一個申請送 `GET /invites/<代號>/request`。手機上的申請多了四種狀態，加上原本的兩種一共六種：還沒送出、等待同意、要重選（SHARING-212.2）、同意了還沒加入好（SHARING-221.1）、被拒絕（SHARING-213.1）和邀請不再有效（SHARING-214.1）；後兩種只留著群組名稱，使用者看過之後就刪掉。交接的 salt 是從連結的字串導出的 32 bytes（SHARING-198.1）。加入，是申請的手機得知同意之後打開 box、存下群組鑰匙、匯入快照，讓那個群組成為這支手機上的共同帳本。這裡的情境沿用手機 app 申請加入的情境（SHARING-123.1）：這支手機是 Dana 的手機，「送出申請」之後本機資料存著 Brisbane 的申請，是等待同意的。

移除、退出和換鑰匙（ADR-0015、ADR-0041）：共同帳本的任何一位成員都能把別的成員的手機移出群組，也能自己退出；離開的手機從那一刻起，對這個群組的每個請求都被 API 拒絕（SHARING-257.1），留在它上面的群組成為唯讀副本（sync）。手機離開之後，群組換一把離開的手機不知道的群組鑰匙：移除時由移除的那支手機在同一個請求裡換（SHARING-250.1），退出之後由留下來第一支同步的成員手機換（SHARING-256.1、SHARING-275.1）。離開的成員和他記過的支出都留在群組裡，他成為前成員（groups）。離開的手機可以把唯讀副本刪掉（groups 的 GROUPS-157.1 到 GROUPS-159.1），也可以用新的邀請連結再申請加入（ADR-0042）：送出之前先確認這支手機上的那一份會被取代（SHARING-226.2），被同意之後匯入的快照取代它（SHARING-289.1）；回來的人在名片上找不到自己，由同意的成員認出來，把原本那位前成員加回來（SHARING-288.1）。接手已經有手機的成員見 SHARING-300.1 到 SHARING-330.1；換手機不在這裡。

移除的 API（SHARING-250.1 到 265.1）是三個簽名的請求，先通過對簽名的請求的檢查，只有群組的成員手機能用：換鑰匙是 `POST /groups/<群組 ID>/rotation`，內容是 JSON，移除別的成員手機也是它；退出是 `POST /groups/<群組 ID>/leave`，沒有內容；拿鑰匙是 `GET /groups/<群組 ID>/keys?after=<鑰匙世代>`。換鑰匙的內容有五個欄位：`epoch` 是新的鑰匙世代；`remove` 是要移除的成員手機的裝置 ID，可以一個都沒有；`senderKey` 是送請求的手機的 box 公開金鑰，32 bytes 的小寫十六進位寫法；`boxes` 是給每一支留下來的成員手機的 box，送請求的手機自己也有一個，每一項是收件的裝置 ID（`deviceId`）和 41 到 1,024 bytes 的 box 的小寫十六進位寫法，API 不解讀它；`events` 是照上傳的寫法寫的事件（SYNC-53.1），可以一個都沒有。鑰匙的 box 是 API 替一支成員手機和一個鑰匙世代記的東西：收件的裝置 ID、鑰匙世代、交出方的 box 公開金鑰和 box。群組需要換鑰匙，是有成員手機退出之後，到留下來的成員手機替它換鑰匙為止（sync）。API 回答換好了、退出好了和拿到的一頁，指的都是狀態碼 200。這三個請求被拒絕，是回應一個帶著原因的拒絕，不做這個請求要做的事：原因是內容不對（400）、不是成員（403）、成員手機不一樣（409，`devices`，回應帶著群組現在的成員手機）、鑰匙世代（409，sync 的同一個原因）、不必換鑰匙（409，`rotation-not-needed`）或群組滿了（413，sync 的同一個原因）；需要換鑰匙（409，`rotation-needed`，回應也帶著群組現在的成員手機）是上傳、同意和下載在群組需要換鑰匙時得到的拒絕（SHARING-256.1）。請求的內容和每種回應有哪些欄位、各是什麼型別，定義在 `packages/domain` 的程式裡，手機 app 和 API 用同一份。

移除的 API 的情境沿用同意的 API 的情境。除非另外說明：Brisbane 沒有邀請、沒有事件，鑰匙世代是 1，不需要換鑰匙；Casey 的手機和 Dana 的手機也是它的成員手機，是測試直接記的；Dana 的手機的裝置 ID 是 `2d6f0a7e-3c1b-4e8a-9f52-6b7c8d9e0f1a`，已經註冊。K 是 32 bytes 的隨機 bytes；BT、BC 和 BD 各是 120 bytes、內容不同的隨機 bytes，是給 Taylor 的手機、Casey 的手機和 Dana 的手機的 box；E 是一個 200 bytes 的事件。「移除 Dana」是 Taylor 的手機送 `POST /groups/9b2f6c1e-8d47-4f3a-b1c5-2e7d90a4f6b8/rotation`，內容是 `{"epoch":2,"remove":["2d6f0a7e-3c1b-4e8a-9f52-6b7c8d9e0f1a"],"senderKey":"<K 的十六進位>","boxes":[{"deviceId":"0f8fad5b-d9cb-469f-a165-70867728950e","box":"<BT 的十六進位>"},{"deviceId":"7c9e6679-7425-40de-944b-e07fc1f90ae7","box":"<BC 的十六進位>"}],"events":[{"id":"<E 的事件 ID>","content":"<E 的內容的十六進位>"}]}`；別的換鑰匙的請求沒有另外說明的欄位和它一樣。一支手機「退出」是它送 `POST /groups/9b2f6c1e-8d47-4f3a-b1c5-2e7d90a4f6b8/leave`，沒有內容。D 是一天，86,400,000 毫秒。

手機 app 移除、退出、換鑰匙和回來（SHARING-270.1 到 289.1）：要離開的手機和留下來的手機見 SHARING-270.1 和 SHARING-271.1。離開過的手機再申請加入，和把回來的人加回原本那位前成員，見 SHARING-226.2、SHARING-288.1 和 SHARING-289.1。替群組換鑰匙，是成員手機送 `remove` 是空的換鑰匙的請求（SHARING-275.1）。名冊、名冊紀錄、不代表任何人和別支手機代表的成員見 sync（SYNC-250.2、SYNC-251.2）；這支手機在一個共同帳本的鑰匙世代見 SYNC-94.1；唯讀副本見 SYNC-300.1 到 SYNC-302.1。移除和退出的確認框，以及移除中和退出中的 Members 在 groups（GROUPS-150.1 到 GROUPS-152.1）。這裡的情境沿用手機 app 同意或拒絕的情境（SHARING-190.2）：這支手機是 Taylor 的手機。除非另外說明：Dana 的手機照 SHARING-195.2 到 SHARING-219.2 加入了 Brisbane，是排在 Blake 後面的新成員 Dana，所以名冊有 Taylor 的手機和 D 的兩筆紀錄，API 上 Brisbane 的成員手機是這兩支，鑰匙世代是 1，不需要換鑰匙；Taylor 的手機同步過，沒有待上傳的事件；Brisbane 的邀請（代號 A）還有效。說別支手機做了什麼，是它照這份 spec 做了並同步過，或測試替它送了同樣的請求。

接手（ADR-0015、ADR-0047）：成員的手機不見了，他用新手機打開邀請連結，選自己原本那位已經有手機的成員，送出要接手的申請；別的成員同意之後，新手機就是那位成員，他的成員 ID、名稱、付款和分攤都不變，原本代表他的手機從那一刻起失去存取權，群組換一把那支手機不知道的群組鑰匙。這三件事是 API 的同一個請求（SHARING-300.1）。舊手機下一次同步時得知自己被接手，留在它上面的群組成為唯讀副本（sync 的 SYNC-300.1、SYNC-330.1），橫幅說明原因（groups 的 GROUPS-155.2）；它要回來，就和被移除的手機一樣用新的邀請連結再申請。只有別的成員的手機能同意：名片上沒有別的有手機的成員時不能接手（SHARING-320.1），被接手的成員自己的手機也不能同意（SHARING-194.2）。

接手的 API（SHARING-300.1 到 308.1）是一個簽名的請求，先通過對簽名的請求的檢查，只有群組的成員手機能用：接手是 `POST /groups/<群組 ID>/requests/<裝置 ID>/takeover`，內容是 JSON，路徑裡的裝置 ID 是申請的那支手機的。它的內容有九個欄位：`request`、`cursor`、`snapshotId`、`senderKey`、`box` 和 `events` 和同意的請求的一樣；`epoch` 是新的鑰匙世代，也就是群組現在的下一個；`remove` 是要移除的成員手機的裝置 ID，至少一個；`boxes` 是給每一支留下來的成員手機的 box，送請求的手機自己也有一個，寫法和換鑰匙的請求的一樣，申請的手機不在裡面：它的群組鑰匙在 `box` 裡。被接手的手機，是 API 記著被接手的請求移除過、之後還沒有再成為這個群組的成員手機的手機（SHARING-305.1）；標頭 `x-replaced` 和它的值 `takeover` 定義在 `packages/domain` 的程式裡，手機 app 和 API 用同一份。API 回答接手好了，指的是狀態碼 200。接手的請求被拒絕，是回應一個帶著原因的拒絕，不做這個請求要做的事：原因是內容不對（400）、不是成員（403）、沒有這個申請（404，`no-request`）、沒有跟上（409，`behind`）、需要換鑰匙（409，`rotation-needed`）、成員手機不一樣（409，`devices`）、鑰匙世代（409）、沒有快照（404）或群組滿了（413），都是同意的 API 和移除的 API 的同一個原因。請求的內容和回應有哪些欄位、各是什麼型別，定義在 `packages/domain` 的程式裡，手機 app 和 API 用同一份。

接手的 API 的情境沿用同意的 API 的情境和移除的 API 的情境。除非另外說明：Brisbane 有代號 A 的有效邀請，沒有事件，鑰匙世代是 1，不需要換鑰匙；Taylor 的手機和 Dana 的手機是它的成員手機，Dana 的手機是測試直接記的；Casey 的手機在代號 A 送出了申請 P，它不是成員手機；S 是 Taylor 的手機給 Casey 的手機的完整快照，涵蓋的序號是 0。K 是 32 bytes、B 是 200 bytes、BT 是 120 bytes 的隨機 bytes，E 是一個 200 bytes 的事件。「Casey 接手 Dana」是 Taylor 的手機送 `POST /groups/9b2f6c1e-8d47-4f3a-b1c5-2e7d90a4f6b8/requests/7c9e6679-7425-40de-944b-e07fc1f90ae7/takeover`，內容是 `{"request":"<P 的 SHA-256>","cursor":0,"snapshotId":"<S 的快照 ID>","senderKey":"<K 的十六進位>","epoch":2,"box":"<B 的十六進位>","remove":["2d6f0a7e-3c1b-4e8a-9f52-6b7c8d9e0f1a"],"boxes":[{"deviceId":"0f8fad5b-d9cb-469f-a165-70867728950e","box":"<BT 的十六進位>"}],"events":[{"id":"<E 的事件 ID>","content":"<E 的內容的十六進位>"}]}`；別的接手的請求沒有另外說明的欄位和它一樣。

手機 app 接手（SHARING-320.1 到 330.1）：要接手的申請，是在表單選了一位有手機的成員的申請（SHARING-320.1），它的明文多一個欄位 `takeover`（SHARING-135.2）；收到的申請裡 `takeover` 是 `true` 的也是（SHARING-191.2）。要離開的手機和留下來的手機見 SHARING-322.1。換一個新的裝置身分，是授權失效的手機照 SHARING-321.1 做的事。申請那一邊的情境沿用手機 app 申請加入的情境（SHARING-123.1）：這支手機是 Dana 的手機，Brisbane 的名片上只有 Taylor 有手機，除非另外說明。成員那一邊的情境沿用手機 app 移除的情境（SHARING-270.1）：這支手機是 Taylor 的手機，Dana 的手機照 SHARING-195.2 到 SHARING-219.2 加入了 Brisbane，是排在 Blake 後面的成員 Dana，名冊有 Taylor 的手機和 D 的兩筆紀錄，鑰匙世代是 1，Brisbane 的邀請（代號 A）還有效；新手機是另一支註冊過的手機，裝置 ID 是 N，使用者 ID 是 `5c0a7e1d-3b2f-4d6a-8e9c-1f0b2a3c4d5e`，有自己的 seed；「新手機申請接手 Dana」是 API 上代號 A 底下有 N 的申請，內容是用 S 的申請金鑰加密的 `{"name":"Dana K.","memberId":"<Dana 的成員 ID>","userId":"5c0a7e1d-3b2f-4d6a-8e9c-1f0b2a3c4d5e","boxKey":"<新手機的 box 公開金鑰>","takeover":true}`，照 SHARING-135.2 補了空格；「同意接手」是 Taylor 的手機列出申請之後，在那個申請的選單按「Approve」。

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

### Requirement: SHARING-19.2 送請求之前沒有裝置身分，也不連網路

The mobile app SHALL 在第一次送請求之前沒有裝置身分，也不發出任何網路請求，只有讀邀請例外（SHARING-124.1）：本機資料沒有裝置 ID，secure store 裡沒有 app 寫的項目。讀裝置身分和時間差不會產生裝置身分，讀邀請也不會。

#### Scenario: 在新手機上記帳

- **WHEN** 在一支新手機上打開 app，新增一筆個人支出，再重新啟動 app
- **THEN** app 沒有發出任何網路請求，secure store 是空的，這支手機沒有裝置身分

#### Scenario: 讀裝置身分

- **WHEN** 在沒有裝置身分的手機上讀裝置身分和時間差
- **THEN** 得知沒有裝置身分，時間差是 0；沒有發出網路請求，secure store 仍是空的

#### Scenario: 打開邀請連結

- **WHEN** 在一支新手機上打開一條寫法對的邀請連結，看到群組名稱和成員之後關閉 Join Group
- **THEN** app 只發出讀邀請的那一個請求，它沒有帶簽名的四個欄位；secure store 是空的，這支手機沒有裝置身分

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

WHEN 手機 app 送出的請求有了結果，the mobile app SHALL 把結果原樣交給呼叫的一方，自己不再送：API 回應了，就交出回應的狀態碼和內容，不論狀態碼是什麼、是不是拒絕；沒有得到回應，就告訴呼叫的一方沒有得到回應。只有 SHARING-27.2 和 28.1 的情況會再送一次。

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

### Requirement: SHARING-27.2 時鐘不準時照 API 的時間校正，再送一次

IF API 因為時鐘拒絕手機送的請求，而回應帶著 API 的時間，THEN the mobile app SHALL 把時間差改成 API 的時間減掉手機這時的時鐘，存在本機資料，再用校正後的時間和新的請求 nonce 重新簽名，把這個請求再送一次：呼叫的一方另外交了校正之後要送的內容時，手機 app 存好時間差之後才向它要，只要一次，再送的請求帶的是它這時給的內容，簽的也是這份內容的雜湊；沒有交時，再送的內容和第一次一樣。之後的請求都用校正後的時間簽名，重新啟動 app 之後也一樣。同一個請求只因為時鐘再送一次：再送的那一次又因為時鐘被拒絕時，照樣改時間差，然後把這個回應交給呼叫的一方。註冊的請求也照這一條，它被拒絕時不向呼叫的一方要內容。回應帶的 API 的時間不是 0 到 9,007,199,254,740,991 之間的整數時，不改時間差，不再送，也不向呼叫的一方要內容。向呼叫的一方要內容時它失敗的話，送請求失敗，不再送。

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

#### Scenario: 校正之後換一份內容

- **WHEN** 手機的時鐘是 T，API 的時間是 T+3,600,000；註冊好了的手機送對 `/example/items` 的 `POST`，內容是 `first`，另外交了校正之後要送的內容，它給的是 `second`
- **THEN** API 先收到內容是 `first` 的請求並因為時鐘拒絕，再收到內容是 `second`、請求時間是 T+3,600,000 的請求，簽的內容雜湊是 `second` 的 SHA-256；手機向呼叫的一方要內容時，讀到的時間差已經是 3,600,000，而且只要了一次；呼叫的一方拿到第二次的回應

#### Scenario: 沒有被拒絕時不要內容

- **WHEN** 手機的時鐘和 API 的時間一樣，手機送內容是 `first` 的 `POST`，另外交了校正之後要送的內容
- **THEN** API 只收到內容是 `first` 的請求，手機沒有向呼叫的一方要內容

#### Scenario: 再送還是被拒絕時不再要

- **WHEN** 再送的那一次又因為時鐘被拒絕
- **THEN** 手機只向呼叫的一方要過一次內容，API 只收到這個請求兩次

#### Scenario: 請求太多的再送不換內容

- **WHEN** API 因為請求太多拒絕內容是 `first` 的 `POST`，說要等 0 毫秒，呼叫的一方另外交了校正之後要送的內容
- **THEN** 再送的請求內容仍是 `first`，手機沒有向呼叫的一方要內容

#### Scenario: 註冊被拒絕時不要內容

- **WHEN** 沒有裝置身分的手機比 API 慢一小時，送內容是 `first` 的 `POST`，另外交了校正之後要送的內容
- **THEN** 註冊的請求被拒絕、校正之後再送，都沒有向呼叫的一方要內容；原本的請求只送一次，內容是 `first`

#### Scenario: 要內容時失敗

- **WHEN** API 因為時鐘拒絕，手機向呼叫的一方要校正之後的內容時，它失敗了
- **THEN** 送請求失敗，API 只收到這個請求一次；時間差已經改了

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

IF 一支裝置已經有 60 個請求，在 API 的時間過去不到 60,000 毫秒內通過檢查，THEN the API SHALL 拒絕它的下一個請求，原因是請求太多，並在回應裡帶著要等的毫秒數：那 60 個裡最早的一個，離滿 60,000 毫秒還有多久。沒通過檢查的請求都不算在 60 個裡；註冊的請求、路徑沒有路由的請求，和通過檢查之後才被路由自己拒絕的請求（SYNC-60.2），通過檢查的都算。同時送到的請求也一樣，通過檢查的不超過 60 個。

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

The API SHALL 為了註冊和檢查，關於一支手機只存它的裝置 ID 和公開金鑰，以及檢查要用的東西：它通過檢查的請求的 nonce 和時間，和它註冊時 IP 加了金鑰的雜湊；IP 本身、IP 不加金鑰的雜湊，和請求的其他標頭都不存。它在群組裡的東西另外照 SYNC-61.4。

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

WHEN 使用者匯入匯出檔（BACKUP-13.3），the mobile app SHALL 把這支手機的裝置 ID、註冊好了的記號和時間差，和其他本機資料一樣換成匯出檔裡的，匯出檔裡沒有就都沒有；secure store 裡的項目不動，過程中不發出任何網路請求。匯出檔帶著匯出那支手機的這三項（BACKUP-3.1），不帶 seed 和簽名私鑰。所以匯入之後：匯出檔的裝置 ID 在這支手機的 secure store 裡有 seed，這支手機就有裝置身分；沒有，就是授權失效（SHARING-29.1）；匯出檔沒有裝置 ID，就是沒有裝置身分，下一次送請求時產生新的（SHARING-20.1）。這支手機原本的 seed 留在 secure store 裡，不再使用（SHARING-24.1）。

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

### Requirement: SHARING-70.2 (manual) 裝了 app 的手機點邀請連結時直接打開 app

WHEN 使用者在裝了 app 的手機上點一條邀請連結，或用相機掃它的 QR code，而連結的主機是這個 build 的設定裡列的網域（iOS 的 Associated Domains、Android 的 intent filter），the mobile app SHALL 直接被系統打開，不先顯示瀏覽器的頁面，並打開 Join Group（SHARING-71.2）；連結是另一支手機在這個環境剛建立的邀請的連結時，Join Group 顯示那個群組的名稱和成員（SHARING-125.2），所以 `#` 後面的部分完整交到了 app。

#### Scenario: iPhone，app 沒在執行

- **WHEN** 另一支手機在這個環境替群組 Brisbane 建立邀請，把連結傳來；結束 app 之後，在「備忘錄」或「訊息」裡點這條連結
- **THEN** app 打開，沒有出現 Safari；Join Group 顯示「Brisbane」和它的成員

#### Scenario: iPhone，app 在背景

- **WHEN** app 停在 Settings 分頁、退到背景之後，點同一條連結
- **THEN** app 回到前景，Join Group 蓋在 Settings 上，顯示「Brisbane」和它的成員

#### Scenario: iPhone 的相機

- **WHEN** 用相機掃同一條連結的 QR code，再點相機跳出的連結
- **THEN** app 打開，Join Group 顯示「Brisbane」和它的成員

#### Scenario: Android

- **WHEN** 在「訊息」裡點同一條連結，或執行 `adb shell am start -a android.intent.action.VIEW -c android.intent.category.BROWSABLE -d '<連結>'`
- **THEN** app 打開，沒有出現瀏覽器，也沒有問要用哪個 app 開；Join Group 顯示「Brisbane」和它的成員；`adb shell pm get-app-links com.tomchen.sharedexpensetracker` 列出這個主機是 `verified`

#### Scenario: 只複製到一半的連結

- **WHEN** 點同一條連結沒有 `#` 和後面的部分的那一段
- **THEN** app 打開，Join Group 顯示「This invite link can't be used. Ask the person who sent it to send it again.」

#### Scenario: 不是邀請連結的路徑

- **WHEN** 點 `https://<這個環境的主機>/health`
- **THEN** 在瀏覽器打開，不打開 app

### Requirement: SHARING-71.2 收到邀請連結時打開 Join Group

WHEN 系統把一條邀請連結交給 app，不管是用它啟動 app 還是在 app 執行中交來，the mobile app SHALL 在本機資料開好之後打開從畫面底部升起、蓋在當時的畫面上的 Join Group，標題是「Join Group」，標題列只有關閉「Close」（SHELL-47.2、SHELL-48.2），內容照這條連結而定（SHARING-123.1 到 133.1）；用邀請連結啟動 app 時，它蓋在 Expenses 的根畫面上；本機資料還在開啟時只有載入指示（SHELL-1.2），打不開時只有錯誤（SHELL-4.1），都不打開 Join Group。這支手機已經存著這條連結的邀請時不打開 Join Group，直接打開那個群組（SHARING-130.2）。

#### Scenario: app 執行中收到完整的連結

- **WHEN** app 停在 Settings 的根畫面時，系統交來完整的連結
- **THEN** Join Group 從底部升起，蓋在 Settings 上，標題是「Join Group」，標題列只有「Close」；內容是「Connect to the internet to join this group.」和「Try Again」

#### Scenario: app 自己的 scheme

- **WHEN** app 執行中，系統交來 `shared-expense-tracker://i/3q2-7wEjRWeJq83vEjRWeA#AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8`
- **THEN** Join Group 打開，內容和完整的連結一樣；交來的是 `shared-expense-tracker://i/3q2-7wEjRWeJq83vEjRWeA` 時，內容是「This invite link can't be used. Ask the person who sent it to send it again.」

#### Scenario: 用連結啟動 app

- **WHEN** app 沒在執行，系統用完整的連結，或用上一個 scenario 的第一條連結啟動 app
- **THEN** 本機資料開好之後，Join Group 蓋在 Expenses 的根畫面上，分頁列選中 Expenses，內容是「Connect to the internet to join this group.」和「Try Again」

#### Scenario: 主機不同、帶著查詢的連結

- **WHEN** 系統交來 `https://other.example.org/i/3q2-7wEjRWeJq83vEjRWeA?openExternalBrowser=1#AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8`、`https://links.example.test/i/abc#def`、`https://links.example.test/i/#def`、`https://links.example.test/i/a/b#c` 或 `shared-expense-tracker://i/abc?x=1#def`
- **THEN** 每一條都打開 Join Group

#### Scenario: 蓋在推入的畫面或開著的表單上

- **WHEN** app 停在從 Settings 推入的 Archived Groups，或開著 New Group 的表單時，系統交來完整的連結
- **THEN** Join Group 蓋在那個畫面或表單上

#### Scenario: 用連結啟動 app，本機資料還在開啟

- **WHEN** 系統用完整的連結啟動 app，本機資料還沒開好
- **THEN** 畫面上只有載入指示，沒有 Join Group；開好之後，Join Group 蓋在 Expenses 的根畫面上

#### Scenario: 開啟期間交來的連結

- **WHEN** app 以 `/settings` 啟動，本機資料還沒開好時，系統先交來完整的連結，再交來半條連結
- **THEN** 畫面上仍然只有載入指示；開好之後只打開一個 Join Group，蓋在 Settings 的根畫面上，內容是後交來的那一條的：「This invite link can't be used. Ask the person who sent it to send it again.」

#### Scenario: 本機資料打不開

- **WHEN** 系統用完整的連結啟動 app，而本機資料打不開；之後系統又交來另一條邀請連結
- **THEN** 一直只顯示「Unable to Load Local Data」和「Your data was not changed.」，沒有 Join Group；結束 app 之後，本機資料打得開時再用同一條連結啟動，就打開 Join Group

### Requirement: SHARING-72.1 關閉 Join Group 回到它蓋住的畫面

WHEN 使用者在 Join Group 按「Close」、在 iOS 上把它往下滑，或在 Android 上按返回鍵，the mobile app SHALL 關閉 Join Group，回到它蓋住的畫面，那個畫面和收到連結之前一樣；用邀請連結啟動 app 的，回到 Expenses 的根畫面。

#### Scenario: 按 Close

- **WHEN** app 停在 Settings 的根畫面時收到完整的連結，再按 Join Group 的「Close」
- **THEN** Join Group 關閉，回到 Settings 的根畫面，分頁列仍選中 Settings

#### Scenario: 往下滑

- **WHEN** iOS 上把 Join Group 往下滑
- **THEN** Join Group 關閉，回到它蓋住的畫面

#### Scenario: Android 的返回鍵

- **WHEN** Android 上 app 停在 Settings 的根畫面時收到完整的連結，再按返回鍵
- **THEN** Join Group 關閉，回到 Settings 的根畫面，app 沒有離開

#### Scenario: 用連結啟動 app 之後關閉

- **WHEN** 系統用完整的連結啟動 app，再按「Close」
- **THEN** 回到 Expenses 的根畫面，分頁列選中 Expenses；之後點 Groups 分頁會切到 Groups

#### Scenario: Android 上用連結啟動 app 之後按返回鍵

- **WHEN** Android 上系統用完整的連結啟動 app，再按兩次返回鍵
- **THEN** 第一次關閉 Join Group、回到 Expenses 的根畫面，第二次離開 app（SHELL-15.1）

#### Scenario: 表單上輸入到一半的字

- **WHEN** 在 New Group 的表單輸入「Bris」之後收到完整的連結，再按 Join Group 的「Close」
- **THEN** 回到 New Group 的表單，名稱欄位仍是「Bris」

#### Scenario: 推入的畫面

- **WHEN** app 停在從 Settings 推入的 Archived Groups 時收到完整的連結，再按「Close」
- **THEN** 回到 Archived Groups，Settings 分頁的堆疊仍是「Settings」根畫面和「Archived Groups」

### Requirement: SHARING-73.2 Join Group 開著時又收到邀請連結

IF Join Group 開著時系統又交來一條邀請連結，THEN the mobile app SHALL 仍然只開著一個 Join Group，關閉一次就回到原來蓋住的畫面：交來的連結和 Join Group 正在顯示的那一條代號或字串不同時，Join Group 改成剛為新交來的這一條打開的樣子，原本那一條填到一半的名字和選擇不留；代號和字串都相同時，Join Group 不變，填到一半的名字和選擇都留著，也不再讀一次邀請。已經存下的申請不受影響。

#### Scenario: 另一條連結

- **WHEN** app 停在 Settings 的根畫面時收到完整的連結，Join Group 開著時又收到半條連結
- **THEN** 只有一個 Join Group，內容是「This invite link can't be used. Ask the person who sent it to send it again.」；按一次「Close」就回到 Settings 的根畫面

#### Scenario: 同一條連結再來一次

- **WHEN** Join Group 開著時又收到同一條完整的連結
- **THEN** 只有一個 Join Group，內容不變；按一次「Close」就回到原來的畫面

#### Scenario: 關閉之後再收到

- **WHEN** 關閉 Join Group 之後，又收到半條連結
- **THEN** Join Group 再打開，內容是半條連結的

#### Scenario: 表單填到一半時同一條連結再來

- **WHEN** 打開 Brisbane 的連結，把名字欄位改成「Dana K.」、選了「Casey」之後，系統又交來 Brisbane 的連結
- **THEN** 名字欄位仍是「Dana K.」，仍選著「Casey」；API 沒有多收到讀邀請的請求

#### Scenario: 表單填到一半時來了另一個群組的連結

- **WHEN** 打開 Brisbane 的連結，把名字欄位改成「Dana K.」之後，系統交來 Tokyo 的連結
- **THEN** 只有一個 Join Group，顯示 Tokyo 的表單，名字欄位是「Dana」

### Requirement: SHARING-74.1 不是邀請連結的連結不打開 Join Group

IF 系統交來的連結是 `shared-expense-tracker://` 開頭、卻不是 `shared-expense-tracker://i/` 開頭，THEN the mobile app SHALL 不打開 Join Group，照連結的路徑打開畫面；沒有哪一個路徑會打開 Join Group。

#### Scenario: 路徑以 i 開頭的畫面

- **WHEN** app 執行中，系統交來 `shared-expense-tracker://insights`
- **THEN** 在 Expenses 分頁推入「Insights」，沒有打開 Join Group

#### Scenario: 其他畫面

- **WHEN** app 執行中，系統交來 `shared-expense-tracker://settings/manage-categories`
- **THEN** 在 Settings 分頁推入「Manage Categories」，沒有打開 Join Group

#### Scenario: 用這種連結啟動 app

- **WHEN** 系統用 `shared-expense-tracker://groups` 啟動 app
- **THEN** 分頁列選中 Groups，沒有打開 Join Group

#### Scenario: `://` 後面多一個斜線

- **WHEN** 邀請連結打開過 Join Group、使用者把它關閉之後，系統交來 `shared-expense-tracker:///i/3q2-7wEjRWeJq83vEjRWeA#AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8`、`shared-expense-tracker:///i/invite` 或 `shared-expense-tracker:///i/invite?link=hello`
- **THEN** 沒有打開 Join Group

#### Scenario: 用多一個斜線的連結啟動 app

- **WHEN** 系統用上面三條連結的任何一條啟動 app
- **THEN** 沒有打開 Join Group

### Requirement: SHARING-75.2 (manual) 在不會自動打開 app 的瀏覽器裡，「Open in App」打開 app

WHEN 使用者在裝了 app 的手機上，從不會自動打開 app 的瀏覽器看到下載頁，例如 LINE 聊天裡的內建瀏覽器，再按「Open in App」，the mobile app SHALL 被打開並打開 Join Group（SHARING-71.2）；連結是另一支手機在這個環境剛建立的邀請的連結時，Join Group 顯示那個群組的名稱和成員（SHARING-125.2），所以 `#` 後面的部分也跟著交到了 app。

#### Scenario: LINE（iPhone）

- **WHEN** 另一支手機在這個環境替群組 Brisbane 建立邀請；在 iPhone 的 LINE 聊天裡點它的連結，LINE 的內建瀏覽器顯示下載頁之後，按「Open in App」
- **THEN** app 打開，Join Group 顯示「Brisbane」和它的成員

#### Scenario: LINE（Android）

- **WHEN** 在 Android 的 LINE 聊天裡做同樣的事
- **THEN** app 打開，Join Group 顯示「Brisbane」和它的成員

#### Scenario: Safari 的網址列

- **WHEN** 把同一條連結貼進 iPhone 的 Safari 網址列，Safari 顯示下載頁之後，按「Open in App」
- **THEN** app 打開，Join Group 顯示「Brisbane」和它的成員

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

### Requirement: SHARING-83.2 用代號讀邀請，不必簽名

WHEN 有人送讀邀請的請求，代號是有效的邀請的，the API SHALL 不必簽名就回傳這個邀請的到期時間和 API 存著的名片：請求不必帶簽名的四個欄位，帶了也不檢查，不算進任何裝置的請求數，也不用掉 nonce；回應不帶群組 ID，並說 `Cache-Control: no-store`。讀邀請不改資料庫，也不讀請求的內容（SHARING-50.1）。

#### Scenario: 沒有簽名

- **WHEN** Brisbane 有代號 A、名片 X 的邀請，在 T 建立；有人送沒有簽名的 `GET /invites/3q2-7wEjRWeJq83vEjRWeA`
- **THEN** API 回 200，回應是 `{"expiresAtMs":1795588320000,"card":"<名片 X 的十六進位>"}`，標頭有 `Cache-Control: no-store`；回應裡沒有 Brisbane 的群組 ID

#### Scenario: 沒有註冊過的手機簽了名

- **WHEN** 一支沒有註冊過的手機替同一個請求簽名再送
- **THEN** 得到一樣的回應

#### Scenario: 簽名的請求原樣再送

- **WHEN** Casey 的手機送簽名的讀代號 A 的請求，再原樣送一次
- **THEN** 兩次得到一樣的回應，第二次不是重送

#### Scenario: 不算進請求數

- **WHEN** Casey 的手機在 T 送了 60 個簽名的讀代號 A 的請求，再送一個撤回 Brisbane 代號 B 的請求
- **THEN** 60 個都得到名片；撤回的請求被拒絕，原因是不是成員，不是請求太多

#### Scenario: 讀了不改

- **WHEN** 有人讀代號 A 三次，有簽名的和沒有簽名的都有
- **THEN** 三次的回應一樣；資料庫和之前一模一樣

#### Scenario: 帶著內容

- **WHEN** 沒簽名的讀代號 A 的請求標明內容是 1,048,577 bytes，而一個 byte 都沒送
- **THEN** 得到的狀態和內容，和沒帶內容時一樣

### Requirement: SHARING-84.1 沒有這個有效的邀請

IF 讀邀請的請求的代號不是有效的邀請的，THEN the API SHALL 拒絕，原因是沒有這個邀請；API 沒見過的代號、過期的邀請和撤回的邀請，得到的回應一模一樣。

#### Scenario: 三種代號

- **WHEN** 代號 A 的邀請已經撤回，代號 B 的邀請已經過期，代號 C 是 API 沒見過的；Casey 的手機各讀一次
- **THEN** 三個請求都被拒絕，原因是沒有這個邀請（404），回應一模一樣

### Requirement: SHARING-85.1 不是成員手機的手機不能建立和撤回邀請

IF 建立邀請或撤回的請求打的群組沒有把這支手機記成成員手機，或沒有這個群組，THEN the API SHALL 拒絕，原因是不是成員（SYNC-49.2 的同一個原因）；這兩種情況的回應一模一樣，也不因代號是不是哪個邀請的而不同，所以不是成員手機的手機分不出群組存不存在、有沒有邀請。

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

### Requirement: SHARING-87.2 邀請 API 的請求有不只一個問題時的原因

IF 邀請 API 的請求有不只一個會讓它被拒絕的問題，THEN the API SHALL 回報這個順序裡最前面的原因：對簽名的請求的檢查（SHARING-31.2），讀邀請沒有這一項（SHARING-83.2）；寫法上的內容不對，也就是 SHARING-86.1 裡除了 cursor 的大小以外的每一項；不是成員（SHARING-85.1）；cursor 比群組最新的序號大的內容不對；沒有這個邀請（SHARING-80.1、SHARING-84.1）；已經有邀請（SHARING-79.1）。建立邀請和撤回的請求，被對簽名的請求的檢查以外的原因拒絕時，已經通過那些檢查：它算進這支裝置的請求數（SHARING-37.1），原樣再送一次是重送（SHARING-36.1）；除此之外，每個群組和每個邀請都和收到它之前一樣。被拒絕的讀邀請什麼都不留下。

#### Scenario: 沒簽名或沒註冊

- **WHEN** 建立邀請和撤回的請求，沒帶簽名的四個欄位，或由還沒註冊的手機簽名
- **THEN** 四個請求都被拒絕，原因是簽名，資料庫不變

#### Scenario: 讀邀請不看簽名

- **WHEN** 沒簽名的讀邀請的請求，代號是 `invite`，或是 API 沒見過的代號 C
- **THEN** 前一個被拒絕，原因是內容不對；後一個被拒絕，原因是沒有這個邀請；都不是簽名

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

- **WHEN** Taylor 的手機用撤回過的代號 A 建立邀請被拒絕，原因是沒有這個邀請，之後同一個請求原樣再送一次
- **THEN** 第二次被拒絕，原因是重送

#### Scenario: 被拒絕的請求算進請求數

- **WHEN** Casey 的手機在 T 註冊，它不是 Brisbane 的成員手機，接著在 T 送的 59 個撤回 Brisbane 代號 A 的請求都因為不是成員被拒絕，然後再送一個
- **THEN** 這一個被拒絕，原因是請求太多，要等 60,000 毫秒

### Requirement: SHARING-88.1 關於一個邀請，API 只存代號、群組、時間、名片和 cursor

The API SHALL 關於一個邀請只存：代號、它的群組、建立和到期的時間、有沒有被撤回，以及名片和名片的 cursor；被拒絕的請求帶的名片、被換掉的名片、撤回的邀請的名片，和請求的其他標頭都不存。過期的邀請的名片留到 API 的清除刪掉它為止（SYNC-142.1）。`#` 後面的字串和從它導出的金鑰不在任何請求裡，所以 API 沒有它們。

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

WHEN 建立邀請，the mobile app SHALL 送建立邀請的請求（SHARING-77.1）：路徑帶著群組 ID 和代號，內容是名片的 cursor 和名片。名片是名片內容用名片金鑰加密的密文（SHARING-1.1）：名片金鑰從 `#` 後面的那 32 bytes 導出，用途是 `shared-expense/invite/card/v1`，不給 salt（SHARING-12.1）；nonce 是 `expo-crypto` 給的 24 bytes，每次加密都是新的；附加資料是 `shared-expense/invite/card/v1`、一個換行（`0x0A`）和代號，以 UTF-8 編碼。名片內容是一個 JSON 物件（JavaScript 的 `JSON.stringify`，沒有多餘的空白，以 UTF-8 編碼），依序有兩個欄位：`name` 是群組名稱；`members` 依 Members 的順序（GROUPS-24.4）列出群組的每位成員，每位依序是 `id`（成員 ID）、`name`（成員名稱）和 `hasDevice`（這位成員有使用者 ID 時是 `true`，否則是 `false`）。前成員不在名片裡。名片的 cursor 是這支手機在這個群組的 cursor（sync），還沒下載過這個群組的事件時是 0。

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

WHEN API 回答邀請建立好了，the mobile app SHALL 在同一個 SQLite transaction 裡存下這個邀請——代號、`#` 後面的字串和 API 回答的到期時間——並寫下邀請的第一個事件（SYNC-80.2、SYNC-21.1），送出請求之前存的那一份代號和字串（SHARING-105.1）也在這個 transaction 裡拿掉；其中一個存不進去就都不留下，那一份也還在。API 沒有回答建立好了時不存邀請，也不寫事件。

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

WHEN 使用者在 Invite 按「Revoke Link」，the mobile app SHALL 先跳出提示框：標題「Revoke Link?」，訊息「People who haven't joined yet won't be able to use this link.」，按鈕是「Cancel」和破壞性的「Revoke」。按「Revoke」才送撤回這個邀請的請求（SHARING-82.1）；API 回答撤回好了之後，在同一個 SQLite transaction 裡刪掉存著的這個邀請並寫下永久刪除它的事件（SYNC-80.2），然後關閉 Invite，回到 Members。按「Cancel」什麼都不做。

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
- **THEN** 系統的分享畫面打開；收到的訊息是完整的連結，連 `#` 後面的字串在內；相機認出同一條連結，點了之後打開 app 的 Join Group（SHARING-70.2、SHARING-71.2），或在沒裝 app 的手機上打開下載頁；Android 的返回鍵關閉 Invite，回到 Members

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

### Requirement: SHARING-112.1 送出申請

WHEN 註冊過的手機送送出申請的請求，代號是有效的邀請的，這支手機不是那個邀請的群組的成員手機，在這個邀請也還沒有申請，the API SHALL 記下這個申請：邀請的代號、這支手機的裝置 ID、API 的時間和請求帶的內容；並回答申請送出了，回應帶著代號。

#### Scenario: Casey 的手機申請加入 Brisbane

- **WHEN** Casey 的手機在 T+1,000 送 `PUT /invites/3q2-7wEjRWeJq83vEjRWeA/request`，內容是 `{"request":"<申請 P 的十六進位>"}`
- **THEN** API 回答申請送出了（200），回應是 `{"code":"3q2-7wEjRWeJq83vEjRWeA"}`；資料庫裡找得到申請 P，剛好一份

#### Scenario: 兩支手機各自申請

- **WHEN** Casey 的手機送申請 P，別的手機送申請 Q
- **THEN** 兩個都回答申請送出了；資料庫裡申請 P 和 Q 各有一份

#### Scenario: 內容最小和最大

- **WHEN** Casey 的手機送 41 bytes 的申請，別的手機送 65,536 bytes 的申請
- **THEN** 兩個都回答申請送出了

#### Scenario: 一支手機申請兩個群組

- **WHEN** Taylor 的手機另外建立了 Tokyo 和它代號 B 的邀請；Casey 的手機在代號 A 送申請 P，在代號 B 送申請 Q
- **THEN** 兩個都回答申請送出了；資料庫裡申請 P 和 Q 各有一份

#### Scenario: 別的群組的成員手機

- **WHEN** Casey 的手機建立了 Tokyo，是 Tokyo 的成員手機；它在代號 A 送申請 P
- **THEN** 回答申請送出了

### Requirement: SHARING-113.1 再送一次時換掉申請的內容

WHEN 手機送送出申請的請求，代號是有效的邀請的，而這支手機在這個邀請已經有申請，the API SHALL 把那個申請的內容換成請求帶的，仍然只有一個申請，並回答申請送出了；所以沒收到回應的手機可以再送。同一支手機的幾個送出申請的請求同時送到時，每一個都回答申請送出了，只留下一個申請。

#### Scenario: 原樣再送一次

- **WHEN** Casey 的手機在代號 A 送申請 P，再送一次申請 P
- **THEN** 兩次都回答申請送出了；資料庫裡申請 P 剛好一份

#### Scenario: 換成別的內容

- **WHEN** 接著 Casey 的手機在代號 A 送申請 Q
- **THEN** 回答申請送出了；資料庫裡申請 Q 剛好一份，找不到申請 P

#### Scenario: 同時送到

- **WHEN** Casey 的手機在代號 A 送申請 P 的五個請求同時送到
- **THEN** 五個都回答申請送出了；資料庫裡申請 P 剛好一份

### Requirement: SHARING-114.1 沒有這個有效的邀請時不收申請

IF 送出申請的請求的代號不是有效的邀請的，THEN the API SHALL 拒絕，原因是沒有這個邀請，不存請求帶的內容；API 沒見過的代號、過期的邀請和撤回的邀請，得到的回應一模一樣。

#### Scenario: 三種代號

- **WHEN** 代號 A 的邀請已經撤回，代號 B 的邀請已經過期，代號 C 是 API 沒見過的；Casey 的手機各送一次申請 P
- **THEN** 三個請求都被拒絕，原因是沒有這個邀請（404），回應一模一樣；資料庫裡找不到申請 P

#### Scenario: 到期前一毫秒和到期的那一毫秒

- **WHEN** 代號 A 的邀請在 T 建立；Casey 的手機在 T+604,799,999 送申請 P，別的手機在 T+604,800,000 送申請 Q
- **THEN** 申請 P 送出了；申請 Q 被拒絕，原因是沒有這個邀請

### Requirement: SHARING-115.1 成員手機不能申請

IF 送出申請的請求來自那個邀請的群組的成員手機，THEN the API SHALL 拒絕，原因是已經是成員，不存請求帶的內容；回應只有原因，不帶群組 ID。

#### Scenario: 建立群組的手機

- **WHEN** Taylor 的手機在代號 A 送申請 P
- **THEN** 被拒絕，原因是已經是成員（409），回應是 `{"error":"already-a-member"}`；資料庫裡找不到申請 P

#### Scenario: 別的成員手機

- **WHEN** Casey 的手機是 Brisbane 的成員手機，它在代號 A 送申請 P
- **THEN** 被拒絕，原因是已經是成員

### Requirement: SHARING-116.1 一個邀請最多 20 個申請

IF 送出申請的請求來自在這個邀請還沒有申請的手機，而這個邀請已經有 20 個申請，THEN the API SHALL 拒絕，原因是申請太多，不存請求帶的內容。已經有申請的手機照常換內容（SHARING-113.1）；有申請被取消之後，又收得下新的。幾支手機同時申請時，一個邀請的申請也不會超過 20 個。

#### Scenario: 第 21 支手機

- **WHEN** 20 支別的手機各在代號 A 送出了申請，Casey 的手機在代號 A 送申請 P
- **THEN** 被拒絕，原因是申請太多（409），回應是 `{"error":"requests-full"}`；資料庫裡找不到申請 P

#### Scenario: 已經有申請的手機再送

- **WHEN** 接著那 20 支手機裡的一支在代號 A 送申請 Q
- **THEN** 回答申請送出了；資料庫裡申請 Q 剛好一份

#### Scenario: 取消一個之後

- **WHEN** 接著那 20 支手機裡的另一支取消申請，Casey 的手機再送申請 P
- **THEN** 取消好了；申請 P 送出了

#### Scenario: 同時申請最後一個位置

- **WHEN** 代號 A 已經有 19 個申請，三支還沒有申請的手機同時各送一個申請
- **THEN** 剛好一支得到申請送出了，另外兩支被拒絕，原因是申請太多

#### Scenario: 別的邀請的申請不算

- **WHEN** 代號 A 已經有 20 個申請；Taylor 的手機另外建立了 Tokyo 和它代號 B 的邀請，Casey 的手機在代號 B 送申請 P
- **THEN** 回答申請送出了

### Requirement: SHARING-117.2 取消申請

WHEN 註冊過的手機送取消申請的請求，the API SHALL 不再存著這支手機在這個邀請的申請，並回答取消好了，回應帶著代號；別支手機的申請不變。這支手機在這個邀請沒有申請時——沒有申請過、已經取消、邀請已經過期或撤回，或 API 沒見過這個代號——只回答取消好了，什麼都不改。IF API 存著這支手機用這個代號被同意的交接（SHARING-173.2），邀請過期或被撤回之後也一樣，或這個代號是有效的邀請的代號、而這支手機是那個邀請的群組的成員手機，THEN the API SHALL 拒絕，原因是已經是成員，什麼都不改：它的申請已經被同意了，沒有可以取消的，手機 app 改問結果（SHARING-143.2）。寫得不對的取消先照 SHARING-118.1 被拒絕。

#### Scenario: 取消

- **WHEN** Casey 的手機在代號 A 送出了申請 P，別的手機送出了申請 Q；Casey 的手機送 `DELETE /invites/3q2-7wEjRWeJq83vEjRWeA/request`，沒有內容
- **THEN** API 回答取消好了（200），回應是 `{"code":"3q2-7wEjRWeJq83vEjRWeA"}`；資料庫裡找不到申請 P，申請 Q 仍剛好一份

#### Scenario: 再取消一次

- **WHEN** 接著 Casey 的手機再送一次取消申請的請求
- **THEN** 回答取消好了；申請 Q 仍剛好一份

#### Scenario: 取消之後再申請

- **WHEN** 接著 Casey 的手機在代號 A 送申請 R
- **THEN** 回答申請送出了；資料庫裡申請 R 剛好一份

#### Scenario: 沒有申請的代號

- **WHEN** 代號 A 的邀請已經撤回，代號 B 的邀請已經過期，代號 C 是 API 沒見過的；Casey 的手機各送一次取消申請的請求
- **THEN** 三個都回答取消好了，資料庫不變

#### Scenario: 成員手機

- **WHEN** Taylor 的手機送取消代號 A 的申請的請求
- **THEN** 被拒絕，原因是已經是成員（409），回應是 `{"error":"already-a-member"}`，什麼都不改

#### Scenario: 同意之後才取消

- **WHEN** Taylor 的手機同意 Casey 之後（SHARING-173.2），Casey 的手機送取消代號 A 的申請的請求；之後代號 A 被撤回，或 API 的時間到了 T+604,800,000，再送一次
- **THEN** 都被拒絕，原因是已經是成員；Casey 的手機仍是成員手機，它問結果仍得到同意了（SHARING-183.1）

#### Scenario: 成員手機取消過期的代號

- **WHEN** 代號 A 過期之後，Taylor 的手機送取消代號 A 的申請的請求
- **THEN** 回答取消好了，什麼都不改

### Requirement: SHARING-118.1 申請 API 的請求寫得不對

IF 申請 API 的請求寫得不對，THEN the API SHALL 拒絕，原因是內容不對：代號不是 16 bytes 的 base64url 寫法；網址帶了查詢；送出申請的內容不是剛好只有 `request` 一個欄位的 JSON 物件，或 `request` 不是 41 到 65,536 bytes 的小寫十六進位寫法；或取消申請的請求帶了內容。

#### Scenario: 代號的寫法

- **WHEN** Casey 的手機用這些代號送出申請和取消申請：少一個字元的 `3q2-7wEjRWeJq83vEjRWe`、多一個字元的 `3q2-7wEjRWeJq83vEjRWeAA`、最後一個字元不是 16 bytes 寫得出來的 `3q2-7wEjRWeJq83vEjRWeB`、中間有 `.` 的 `3q2-7wEjRWe.q83vEjRWeA`，或 `invite`
- **THEN** 都被拒絕，原因是內容不對（400）

#### Scenario: 送出申請的內容

- **WHEN** Casey 的手機在代號 A 送出申請，內容是：0 bytes、`{}`、多帶 `"name":"Casey"`、一個陣列、不是 JSON 的文字；`request` 是數字、大寫的十六進位、奇數個字元、40 bytes 或 65,537 bytes
- **THEN** 都被拒絕，原因是內容不對；代號 A 沒有申請，資料庫裡找不到「Casey」

#### Scenario: 帶了查詢

- **WHEN** Casey 的手機送出申請和取消申請的請求，網址後面各帶 `?x=1`
- **THEN** 都被拒絕，原因是內容不對

#### Scenario: 取消帶了內容

- **WHEN** Casey 的手機在代號 A 送出了申請 P，再送取消申請的請求，內容是 `{}`
- **THEN** 被拒絕，原因是內容不對；資料庫裡申請 P 仍剛好一份

### Requirement: SHARING-119.1 申請 API 的請求有不只一個問題時的原因

IF 申請 API 的請求有不只一個會讓它被拒絕的問題，THEN the API SHALL 回報這個順序裡最前面的原因：對簽名的請求的檢查（SHARING-31.2）；寫法上的內容不對（SHARING-118.1）；沒有這個邀請（SHARING-114.1）；已經是成員（SHARING-115.1）；申請太多（SHARING-116.1）。被對簽名的請求的檢查以外的原因拒絕的請求，已經通過那些檢查：它算進這支裝置的請求數（SHARING-37.1），原樣再送一次是重送（SHARING-36.1）；除此之外，每個邀請和每個申請都和收到它之前一樣。

#### Scenario: 沒簽名或沒註冊

- **WHEN** 送出申請和取消申請的請求，沒帶簽名的四個欄位，或由還沒註冊的手機簽名
- **THEN** 四個請求都被拒絕，原因是簽名，資料庫不變

#### Scenario: 寫法先於邀請的狀態

- **WHEN** Casey 的手機在 API 沒見過的代號 C 送出申請，內容是 `{}`
- **THEN** 被拒絕，原因是內容不對，不是沒有這個邀請

#### Scenario: 邀請的狀態先於是不是成員

- **WHEN** 代號 A 的邀請已經撤回，Taylor 的手機在代號 A 送申請 P
- **THEN** 被拒絕，原因是沒有這個邀請，不是已經是成員

#### Scenario: 是不是成員先於申請太多

- **WHEN** 代號 A 已經有 20 個申請，Taylor 的手機在代號 A 送申請 P
- **THEN** 被拒絕，原因是已經是成員，不是申請太多

#### Scenario: 被拒絕的請求用掉了 nonce

- **WHEN** Casey 的手機在代號 C 送申請 P 被拒絕，原因是沒有這個邀請，之後同一個請求原樣再送一次
- **THEN** 第二次被拒絕，原因是重送

### Requirement: SHARING-120.1 關於一個申請，API 只存代號、裝置 ID、時間和內容

The API SHALL 關於一個申請只存：邀請的代號、申請的手機的裝置 ID、收到的時間和申請的內容；被拒絕的請求帶的內容、被換掉的內容、取消的申請的內容，和請求的其他標頭都不存。連結的字串和從它導出的金鑰不在任何請求裡，所以 API 沒有它們，解不開申請的內容。

#### Scenario: 送出之後的資料庫

- **WHEN** Casey 的手機在代號 A 送申請 P，請求帶著 `User-Agent: CaseysPhone/1.0` 和 `X-Applicant-Name: Casey-Lee`
- **THEN** 資料庫裡找得到申請 P，剛好一份；找不到 `CaseysPhone` 和 `Casey-Lee`

#### Scenario: 沒有存下的內容

- **WHEN** Casey 的手機在代號 A 送申請 P，再送申請 Q，然後取消；成員手機 Taylor 的手機在代號 A 送申請 R
- **THEN** 資料庫裡找不到申請 P、Q 和 R，不論是原始的 bytes、十六進位還是 Base64

### Requirement: SHARING-121.1 撤回邀請時不再存著它的申請

WHEN 成員手機撤回一個有效的邀請（SHARING-82.1），the API SHALL 不再存著這個邀請的申請。過期的邀請的申請不再算數：這個群組之後的邀請，不管前一個是撤回還是過期，都從沒有申請開始；過期的邀請的申請由清除刪掉（sync 的 SYNC-151.1）。

#### Scenario: 撤回

- **WHEN** Casey 的手機和別的手機在代號 A 各送出了申請 P 和 Q，Taylor 的手機撤回代號 A
- **THEN** 資料庫裡找不到申請 P 和 Q

#### Scenario: 撤回之後的新邀請

- **WHEN** 代號 A 已經有 20 個申請，Taylor 的手機撤回代號 A，再用代號 B 建立邀請；Casey 的手機在代號 B 送申請 P
- **THEN** 回答申請送出了

#### Scenario: 過期之後的新邀請

- **WHEN** 代號 A 的邀請在 T 建立，已經有 20 個申請；在 T+604,800,000，Taylor 的手機用代號 B 建立邀請，Casey 的手機在代號 B 送申請 P
- **THEN** 回答申請送出了

### Requirement: SHARING-122.2 同樣的路徑配上別的方法，不是申請 API 的請求

IF 簽名的請求打 `/invites/<代號>/request` 而方法不是 `PUT`、`DELETE` 或 `GET`，THEN the API SHALL 把它當成路徑沒有路由的請求，回答找不到，不改任何申請。`HEAD` 也一樣：它不是問結果（SHARING-183.1），API 也沒有讀申請內容的請求給申請的手機。

#### Scenario: 別的方法

- **WHEN** Casey 的手機在代號 A 送出了申請 P，再對 `/invites/3q2-7wEjRWeJq83vEjRWeA/request` 送 `HEAD`、帶著送出申請的內容的 `POST` 和 `PATCH`
- **THEN** 三個請求都得到找不到（404），不是任何一種拒絕；資料庫裡申請 P 仍剛好一份

### Requirement: SHARING-123.1 寫法不對的連結不能用

IF Join Group 為一條寫法不對的邀請連結打開——連結的代號不是 16 bytes 的 base64url 寫法，或連結的字串不是 32 bytes 的 base64url 寫法，例如只複製到 `#` 之前——THEN the mobile app SHALL 讓 Join Group 的內容只有「This invite link can't be used. Ask the person who sent it to send it again.」，不發出任何網路請求，不產生裝置身分，本機資料和 secure store 都和收到連結之前一樣。

#### Scenario: 沒有 `#` 後面的部分

- **WHEN** 系統交來 `https://api.example.test/i/3q2-7wEjRWeJq83vEjRWeA`，或結尾多一個 `#` 的同一條
- **THEN** Join Group 的內容只有「This invite link can't be used. Ask the person who sent it to send it again.」；app 沒有發出任何網路請求，這支手機沒有裝置身分，secure store 是空的，本機資料不變

#### Scenario: 字串不完整

- **WHEN** 系統交來 Brisbane 的連結少了最後一個字元的那一段、最後多一個 `A` 的那一條，或最後一個字元換成 `9` 的那一條
- **THEN** 都是這句話，app 沒有發出任何網路請求

#### Scenario: 代號不對

- **WHEN** 系統交來 `https://api.example.test/i/abc#AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8`、`https://api.example.test/i/#AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8` 或 `https://api.example.test/i/3q2-7wEjRWeJq83vEjRWeA/x#AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8`
- **THEN** 都是這句話，app 沒有發出任何網路請求

#### Scenario: 帶著查詢的連結照常能用

- **WHEN** 系統交來 `https://api.example.test/i/3q2-7wEjRWeJq83vEjRWeA?openExternalBrowser=1#AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8`，或 `shared-expense-tracker://i/3q2-7wEjRWeJq83vEjRWeA#AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8`
- **THEN** Join Group 顯示 Brisbane 的表單

### Requirement: SHARING-124.1 打開寫法對的連結時讀邀請

WHEN Join Group 為一條寫法對的連結打開，而這支手機沒有存著這個代號的申請（SHARING-131.2），the mobile app SHALL 讀邀請：對 API 的網址送一個 `GET /invites/<連結的代號>`，沒有簽名的四個欄位，沒有內容，不管連結的主機是什麼；不產生裝置身分，也不註冊。讀邀請不是送請求，所以一次只發這一個請求：得到帶著原因的拒絕時，不校正時鐘再送（SHARING-27.2），也不等了再送（SHARING-28.1），那兩條只管簽名的請求。還沒有結果時，Join Group 的內容只有「Loading invite…」。讀邀請還沒有結果時 Join Group 被關閉，或換成了別的連結（SHARING-73.2），之後才到的回答 SHALL 不理會：不打開 Join Group 或群組的畫面，不改 Join Group 顯示的，也不留下任何資料。

#### Scenario: 新手機打開 Brisbane 的連結

- **WHEN** 打開 Brisbane 的連結
- **THEN** API 只收到一個請求：對 `/invites/3q2-7wEjRWeJq83vEjRWeA` 的 `GET`，沒有簽名的四個欄位，沒有內容；Join Group 顯示 Brisbane 的表單；這支手機沒有裝置身分，secure store 是空的

#### Scenario: 還沒有結果

- **WHEN** API 還沒回答讀邀請的請求
- **THEN** Join Group 的內容只有「Loading invite…」

#### Scenario: 連結的主機不是 API 的

- **WHEN** 系統交來 `https://other.example.org/i/3q2-7wEjRWeJq83vEjRWeA#AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8`
- **THEN** 讀邀請的請求送到 `https://api.example.test`，沒有請求送到別的主機；Join Group 顯示 Brisbane 的表單

#### Scenario: 還沒有結果時關閉

- **WHEN** API 還沒回答讀邀請的請求時按「Close」，之後 API 才回答
- **THEN** Join Group 沒有再打開；這支手機沒有裝置身分，本機資料不變

### Requirement: SHARING-125.2 讀到邀請之後顯示群組名稱和成員

WHEN API 回傳邀請，它的名片用連結的字串導出的名片金鑰和名片的附加資料解得開（SHARING-95.1），the mobile app SHALL 在 Join Group 由上而下顯示表單：群組名稱；名字欄位，無障礙名稱是「Your name」，帶入你的名字，沒有文字時顯示「Enter your name」；「Join as」；角色為 button、名稱為「New Member」的一列，名片上有 20 位以上的成員時沒有這一列（SHARING-129.2）；名片上的每位成員各一列，照名片的順序，每一列都是角色為 button 的按鈕：沒有手機的成員那一列顯示成員名稱，名稱是成員名稱；有手機的成員那一列顯示成員名稱和「Already joined」，名稱是成員名稱、逗號、空格和「Already joined」，選它是要接手這位成員（SHARING-320.1）；「A member of this group has to approve your request.」，選著有手機的成員時換成 SHARING-320.1 的那一句；以及角色為 button、名稱為「Send Request」的按鈕。「New Member」和成員那幾列裡，同時最多選著一列（預設選哪一列見 SHARING-126.1 和 SHARING-129.2）：選著的那一列右邊有勾號的圖示，iOS 是 SF Symbol `checkmark`，Android 是 Material Symbols 的 `check`，無障礙狀態是 selected，其他列沒有勾號；按其中一列就改選它。

#### Scenario: Brisbane 的表單

- **WHEN** 打開 Brisbane 的連結
- **THEN** Join Group 由上而下是「Brisbane」、內容是「Dana」的名字欄位、「Join as」、「New Member」、「Taylor」和「Already joined」、「Casey」、「Blake」、「A member of this group has to approve your request.」和「Send Request」；「New Member」、「Taylor, Already joined」、「Casey」和「Blake」都是按鈕，選著的是「New Member」

#### Scenario: 還沒有名字

- **WHEN** 還沒存過名字的手機打開 Brisbane 的連結
- **THEN** 名字欄位是空的，顯示「Enter your name」

#### Scenario: 每位成員都有手機

- **WHEN** 打開 Tokyo 的連結
- **THEN** 成員那幾列只有「New Member」，和名稱為「Taylor, Already joined」的按鈕

#### Scenario: 改選

- **WHEN** 在 Brisbane 的表單按「Casey」，再按「Blake」
- **THEN** 先是只選著「Casey」，只有它那一列有勾號；再是只選著「Blake」，勾號換到它那一列

#### Scenario: 選有手機的成員

- **WHEN** 在 Brisbane 的表單按「Taylor, Already joined」那一列
- **THEN** 只選著 Taylor 那一列，勾號在它那一列，「New Member」沒有勾號

#### Scenario: 改名字不改你的名字

- **WHEN** 把名字欄位改成「Dana K.」，送出申請之後看 Settings
- **THEN** Settings 的名字欄位仍是「Dana」

### Requirement: SHARING-126.1 名字和沒有手機的成員同名時預設選他

WHEN Join Group 顯示一個邀請的表單，而名片上的成員少於 20 位，the mobile app SHALL 預設選「New Member」；IF 你的名字和名片上一位沒有手機的成員同名，THEN SHALL 預設選那位成員，有幾位時選名片上最前面的那一位，名片上有 20 位以上的成員時也一樣（SHARING-129.2）。之後只有使用者按了才改選：修改名字欄位不改選著的那一列。

#### Scenario: 同名

- **WHEN** 名字是「casey」的手機打開 Brisbane 的連結
- **THEN** 選著的是「Casey」，不是「New Member」

#### Scenario: 和有手機的成員同名

- **WHEN** 名字是「Taylor」的手機打開 Brisbane 的連結
- **THEN** 選著的是「New Member」

#### Scenario: 修改名字欄位

- **WHEN** 名字是「Dana」的手機打開 Brisbane 的連結，把名字欄位改成「Casey」
- **THEN** 選著的仍是「New Member」

#### Scenario: 兩位同名的成員

- **WHEN** 名片上依序有沒有手機的「Sam」和另一位沒有手機的「sam」，名字是「Sam」的手機打開它的連結
- **THEN** 選著的是前面那一位

### Requirement: SHARING-127.1 名字空白或沒有選時停用 Send Request

WHILE 名字欄位去掉頭尾空白後是空的，或沒有選著任何一列（SHARING-129.2），the mobile app SHALL 停用「Send Request」，按了沒有反應。

#### Scenario: 還沒有名字

- **WHEN** 還沒存過名字的手機打開 Brisbane 的連結
- **THEN** 「Send Request」是停用的；輸入「   」之後仍是停用的；輸入「Dana」之後可以按

#### Scenario: 清空名字

- **WHEN** 名字是「Dana」的手機打開 Brisbane 的連結，把名字欄位清空，按「Send Request」
- **THEN** 沒有反應：API 沒有多收到請求，本機資料沒有申請

### Requirement: SHARING-128.1 要當新成員卻和成員同名時不送出

IF 使用者按「Send Request」時選著「New Member」，而名字欄位的名字和名片上的某位成員同名，有沒有手機的都算，THEN the mobile app SHALL 不送出：不產生裝置身分，不存申請，不發出網路請求，表單留著，在名字欄位下方顯示「A member with this name already exists.」並讓螢幕閱讀器念出來，直到名字欄位被修改或改選別的一列。

#### Scenario: 和沒有手機的成員同名

- **WHEN** 在 Brisbane 的表單把名字欄位改成「 casey 」，選著「New Member」，按「Send Request」
- **THEN** 名字欄位下方顯示「A member with this name already exists.」，螢幕閱讀器念出來；API 沒有多收到請求，本機資料沒有申請，這支手機沒有裝置身分

#### Scenario: 改選那位成員

- **WHEN** 接著按「Casey」，再按「Send Request」
- **THEN** 這句話消失；申請送出了，申請裡選的成員是 Casey

#### Scenario: 和有手機的成員同名

- **WHEN** 在 Brisbane 的表單把名字欄位改成「TAYLOR」，按「Send Request」
- **THEN** 顯示這句話，沒有送出

#### Scenario: 修改名字

- **WHEN** 出現這句話之後，把名字欄位改成「Taylor B.」
- **THEN** 這句話消失；按「Send Request」，申請送出了

#### Scenario: 選了成員時名字可以和別人同名

- **WHEN** 在 Brisbane 的表單把名字欄位改成「Taylor」，選「Casey」，按「Send Request」
- **THEN** 沒有這句話，申請送出了

### Requirement: SHARING-129.2 名片上有 20 位成員時不能當新成員

WHILE 名片上有 20 位以上的成員，the mobile app SHALL 在表單不顯示「New Member」那一列，在成員的下面顯示一句話：名片上有沒有手機的成員時是「A shared group can have up to 20 members. You can join as one of the members above.」；名片上每位成員都有手機時是「This group is full. A shared group can have up to 20 members.」，成員那幾列照常是按鈕，選其中一位是要接手他（SHARING-320.1）。兩種都預設不選任何一列，除非你的名字和其中一位沒有手機的成員同名（SHARING-126.1）。名片上的成員少於 20 位時，SHALL 照常顯示「New Member」，不顯示這兩句話。

#### Scenario: 20 位成員，兩位沒有手機

- **WHEN** 名片上有 20 位成員，其中 Casey 和 Blake 沒有手機，名字是「Dana」的手機打開它的連結
- **THEN** 表單沒有「New Member」，成員的下面是「A shared group can have up to 20 members. You can join as one of the members above.」；沒有選著任何一列，「Send Request」是停用的；按「Casey」之後可以按

#### Scenario: 20 位成員，名字和其中一位同名

- **WHEN** 同一張名片，名字是「casey」的手機打開它的連結
- **THEN** 選著的是「Casey」，「Send Request」可以按

#### Scenario: 20 位成員都有手機

- **WHEN** 名片上的 20 位成員都有手機
- **THEN** Join Group 顯示表單：群組名稱、名字欄位、「Join as」和 20 位成員各一列，都是名稱以「, Already joined」結尾的按鈕，下面是「This group is full. A shared group can have up to 20 members.」，沒有「New Member」；沒有選著任何一列，「Send Request」是停用的

#### Scenario: 在都有手機的 20 位成員裡選一位

- **WHEN** 接著按其中一位成員那一列
- **THEN** 選著他那一列，「Send Request」可以按；那句話的下面是 SHARING-320.1 說對方的手機會失去存取權的那一句

#### Scenario: 19 位成員

- **WHEN** 名片上有 19 位成員
- **THEN** 表單有「New Member」，沒有這兩句話

### Requirement: SHARING-130.2 已經是成員的手機直接打開那個群組

IF 系統交來寫法對的連結，而這支手機的本機資料替一個不是唯讀副本的共同帳本存著代號和字串都和連結相同的邀請，不管它過期了沒有，THEN the mobile app SHALL 不打開 Join Group，不發出網路請求，直接打開那個群組的畫面。IF 讀到邀請、解開名片之後，名片上有一位成員的成員 ID 是這支手機上一個不是唯讀副本的共同帳本的成員或前成員的成員 ID，THEN SHALL 關閉 Join Group，打開那個群組的畫面，不顯示表單。打開那個群組的畫面，是和系統交來它的畫面的連結一樣：未封存的群組是 `shared-expense-tracker://groups/<群組 ID>`（GROUPS-14.1），封存的群組是 `shared-expense-tracker://settings/archived-groups/<群組 ID>`（GROUPS-54.1）。兩種情況都不產生裝置身分，不存申請。這支手機是成員，本機卻沒有這條連結的邀請，而邀請也已經不是有效的——例如邀請被撤回之後本機刪掉了它，或這支手機是靠快照加入的，快照不帶過期的邀請——這時沒有名片可以認出是哪個群組，照 SHARING-132.1 顯示這條連結不能用。唯讀副本不算：這支手機已經不在那個共同帳本裡，它存著的邀請的連結照別的連結那樣讀邀請，名片上有它的成員時照常顯示表單，讓這支手機再申請加入（SHARING-226.2、SHARING-289.1）。

#### Scenario: 自己建立的邀請

- **WHEN** Taylor 的手機替 Brisbane 建立了邀請，app 停在 Settings 的根畫面時，系統交來這個邀請的連結
- **THEN** 沒有打開 Join Group；分頁列選中 Groups，顯示 Brisbane 的畫面；API 沒有多收到請求

#### Scenario: 用連結啟動 app

- **WHEN** 系統用這條連結啟動 app
- **THEN** 本機資料開好之後，分頁列選中 Groups，顯示 Brisbane 的畫面，沒有 Join Group

#### Scenario: 過期的邀請

- **WHEN** 手機的時鐘是 T+604,800,000 之後，系統交來同一條連結
- **THEN** 一樣打開 Brisbane 的畫面，沒有發出網路請求

#### Scenario: 字串不同

- **WHEN** 系統交來代號相同、字串是 S2 的連結
- **THEN** 打開 Join Group 並讀邀請；名片解不開，內容是「This invite link can't be used. Ask the person who sent it to send it again.」（SHARING-132.1）

#### Scenario: 還沒同步到的邀請

- **WHEN** Brisbane 是 Taylor 的手機上的共同帳本，這支手機沒有存著它的邀請；別支手機替 Brisbane 建立了代號 B 的邀請，名片上有 Taylor 的成員 ID；系統交來這個邀請的連結
- **THEN** Join Group 打開、讀邀請之後關閉，顯示 Brisbane 的畫面；這支手機沒有多存任何東西

#### Scenario: 名片上只有前成員是這支手機認得的

- **WHEN** Brisbane 是 Taylor 的手機上的共同帳本，Blake 已經被移出；別支手機替 Brisbane 建立的邀請，名片上只有 Blake 的成員 ID 是這支手機上的；系統交來這個邀請的連結
- **THEN** Join Group 關閉，顯示 Brisbane 的畫面

#### Scenario: 封存的群組

- **WHEN** Taylor 的手機封存了 Brisbane，系統交來它的邀請的連結
- **THEN** 分頁列選中 Settings，顯示 Brisbane 的畫面，上面有「Restore Group」

#### Scenario: 撤回之後的連結

- **WHEN** Taylor 的手機撤回了 Brisbane 的邀請，系統交來那個邀請的連結
- **THEN** Join Group 的內容只有「This invite link can't be used. Ask the person who sent it to send it again.」，沒有打開 Brisbane 的畫面

#### Scenario: 唯讀副本

- **WHEN** Brisbane 在這支手機上是唯讀副本；別支手機替 Brisbane 建立了代號 B 的邀請，名片上有 Casey 的成員 ID；系統交來這個邀請的連結
- **THEN** Join Group 顯示 Brisbane 的表單（SHARING-125.2），沒有關閉，也沒有打開 Brisbane 的畫面

#### Scenario: 唯讀副本存著的邀請

- **WHEN** 唯讀副本 Brisbane 在本機資料裡還存著代號 A 的邀請；系統交來它的連結
- **THEN** Join Group 打開，API 收到讀邀請的請求；邀請還有效時顯示表單，被撤回了就照 SHARING-132.1

### Requirement: SHARING-131.2 已經申請過的連結顯示那個申請

IF Join Group 為一條寫法對的連結打開，而本機資料存著這個代號的申請，THEN the mobile app SHALL 不顯示表單，讓 Join Group 顯示那個申請（SHARING-225.1），並替它問一次結果（SHARING-210.1）：送出了的顯示等待同意（SHARING-138.1），還沒送出的顯示還沒送出（SHARING-139.2）。IF 這個申請正在送出，也就是送出它的請求還沒有結果（SHARING-134.1），THEN 不管是從連結還是從申請的卡片（GROUPS-108.2）打開，Join Group 的內容 SHALL 只有「Sending request…」，沒有「Try Again」和「Cancel Request」，結果到了才照 SHARING-134.1、SHARING-139.2 或 SHARING-140.2 顯示：這樣同一個申請不會有兩個請求同時在路上，也不會在送出的請求還沒到 API 時被取消。

#### Scenario: 等待中再點連結

- **WHEN** 送出申請之後關閉 Join Group，再打開 Brisbane 的連結
- **THEN** Join Group 顯示「Waiting for Approval」和「Brisbane」，沒有表單；API 沒有多收到送出申請的請求

#### Scenario: 沒有網路

- **WHEN** 送出申請之後手機沒有網路，再打開 Brisbane 的連結
- **THEN** Join Group 一樣顯示「Waiting for Approval」

#### Scenario: 送出中再打開

- **WHEN** API 還沒回答送出申請的請求時關閉 Join Group，再打開 Brisbane 的連結，或在 Groups 根畫面按申請的卡片；之後 API 回答申請送出了
- **THEN** Join Group 的內容先是只有「Sending request…」，API 沒有多收到送出申請的請求，也沒有收到問結果的請求；回答到了之後顯示「Waiting for Approval」

### Requirement: SHARING-132.1 不能用的邀請不留下任何資料

IF 讀邀請被拒絕，原因是沒有這個邀請或內容不對；或讀到的名片用連結的字串解不開；或解開的內容不是名片內容，THEN the mobile app SHALL 讓 Join Group 的內容只有「This invite link can't be used. Ask the person who sent it to send it again.」；IF 名片是不認得的格式版本（SHARING-4.2），THEN 內容只有「Update the app to use this invite link.」。兩種情況都不產生裝置身分，本機資料和 secure store 都和收到連結之前一樣。名片內容，是一個 JSON 物件，`name` 是不是空字串的字串，`members` 是至少有一項的陣列，每一項的 `id` 是小寫的第 4 版 UUID，`name` 是不是空字串的字串，`hasDevice` 是布林值；多出來的欄位不看。

#### Scenario: 過期、撤回和沒見過的代號

- **WHEN** Brisbane 的邀請已經過期，或已經被撤回，或連結的代號是 API 沒見過的；打開它的連結
- **THEN** Join Group 的內容只有「This invite link can't be used. Ask the person who sent it to send it again.」；這支手機沒有裝置身分，secure store 是空的，本機資料不變

#### Scenario: 字串不對

- **WHEN** 系統交來代號是 A、字串是 S2 的連結
- **THEN** 是同一句話，這支手機沒有留下任何資料

#### Scenario: 名片內容不對

- **WHEN** API 存著的名片用 S 解得開，內容是 `{"name":"Brisbane"}`、`{"name":"Brisbane","members":[]}`、`{"name":"","members":[{"id":"1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed","name":"Taylor","hasDevice":true}]}`、`{"name":"Brisbane","members":[{"id":"taylor","name":"Taylor","hasDevice":true}]}`、`{"name":"Brisbane","members":[{"id":"1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed","name":"Taylor","hasDevice":"yes"}]}`，或不是 JSON 的文字
- **THEN** 都是同一句話

#### Scenario: 多出來的欄位

- **WHEN** 名片內容除了 `name` 和 `members`，另外有 `"note":"hi"`，每位成員另外有 `"color":"#D81B60"`
- **THEN** Join Group 顯示表單

#### Scenario: 不認得的格式版本

- **WHEN** API 存著的名片第一個 byte 是 `0x02`
- **THEN** Join Group 的內容只有「Update the app to use this invite link.」

### Requirement: SHARING-133.1 連不上 API 時說明要連上線才能加入

IF 讀邀請沒有得到回應——沒有網路、連不上 API，或 app 建置時沒有給 API 的網址——THEN the mobile app SHALL 在 Join Group 顯示「Connect to the internet to join this group.」和角色為 button、名稱為「Try Again」的按鈕；IF 得到的回應看不懂——不是邀請，也不是 SHARING-132.1 的那兩種拒絕；帶著別的原因的拒絕也算——THEN 顯示「Something went wrong. Try again later.」和「Try Again」。按「Try Again」再讀一次。兩種情況都不留下任何資料；記帳不受影響：個人和群組的資料照常能新增和修改（ADR-0005）。

#### Scenario: 沒有網路

- **WHEN** 手機沒有網路，打開 Brisbane 的連結
- **THEN** Join Group 顯示「Connect to the internet to join this group.」和「Try Again」；關閉 Join Group 之後新增一筆個人支出，存得下

#### Scenario: 連上線之後再試

- **WHEN** 接著手機有網路，再打開 Brisbane 的連結；或沒有關閉 Join Group，直接按「Try Again」
- **THEN** Join Group 顯示 Brisbane 的表單

#### Scenario: 沒有 API 的網址

- **WHEN** app 建置時沒有給 API 的網址，打開 Brisbane 的連結
- **THEN** Join Group 顯示「Connect to the internet to join this group.」和「Try Again」；app 沒有發出任何網路請求

#### Scenario: 看不懂的回應

- **WHEN** API 對讀邀請的請求回 500，回沒有帶原因的 404，或回 200 但內容不是邀請
- **THEN** Join Group 都顯示「Something went wrong. Try again later.」和「Try Again」

#### Scenario: 被拒絕，原因是請求太多

- **WHEN** API 拒絕讀邀請的請求，原因是請求太多，說要等 1,000 毫秒；之後過了 5 秒
- **THEN** Join Group 顯示「Something went wrong. Try again later.」和「Try Again」；app 沒有自己再讀一次（SHARING-124.1），API 只收到那一個請求

### Requirement: SHARING-134.1 按 Send Request 時存下申請並送出

WHEN 使用者在表單按「Send Request」，而它沒有被 SHARING-127.1、SHARING-128.1、SHARING-141.2 或 SHARING-320.1 擋下，the mobile app SHALL 依序做這些事：這支手機沒有裝置身分時先產生（SHARING-20.1），授權失效時先換一個新的（SHARING-321.1）；把申請存進本機資料，是還沒送出的申請，名字是名字欄位去掉頭尾空白後的文字；再送送出申請的請求（SHARING-112.1），路徑帶著連結的代號，內容是 `{"request":"<申請的內容的十六進位>"}`（SHARING-135.2），還沒註冊過時先註冊（SHARING-22.1）。還沒有結果時，Join Group 的內容只有「Sending request…」。API 回答申請送出了之後，SHALL 把本機資料的這個申請記成送出了；Join Group 這時還顯示著這個申請，就改成顯示等待同意（SHARING-138.1）。送出的結果，不管是這一條還是 SHARING-139.2、SHARING-140.2 的，都照樣記進本機資料，但 Join Group 已經關閉，或已經換成別的連結時（SHARING-73.2），SHALL 不因為它而打開 Join Group，也不改 Join Group 顯示的。

#### Scenario: 新手機第一次申請

- **WHEN** 打開 Brisbane 的連結，按「Send Request」
- **THEN** API 依序收到三個請求：沒有簽名的讀邀請、對 `/devices` 的 `POST`，和對 `/invites/3q2-7wEjRWeJq83vEjRWeA/request` 的 `PUT`，後兩個的裝置 ID 相同；Join Group 顯示「Waiting for Approval」；這支手機有裝置身分

#### Scenario: 已經有裝置身分的手機

- **WHEN** 註冊好了的手機打開 Brisbane 的連結，按「Send Request」
- **THEN** API 沒有收到註冊的請求；送出申請的請求的裝置 ID 是這支手機原本的

#### Scenario: 還沒有結果

- **WHEN** API 還沒回答送出申請的請求
- **THEN** Join Group 的內容只有「Sending request…」；本機資料已經存著這個申請，是還沒送出的

#### Scenario: 存下的申請

- **WHEN** 沒有網路時把名字欄位改成「 Dana K. 」，選「Blake」，按「Send Request」；關閉 Join Group，重新啟動 app，有網路之後在 Groups 根畫面按申請的卡片，再按「Try Again」
- **THEN** 本機資料存著一個這個代號的申請；卡片是「Open request to join Brisbane」；按了「Try Again」之後送出的申請，用 S 的申請金鑰解得開，名字是「Dana K.」，選的成員是 Blake 的成員 ID

#### Scenario: 送出中關閉

- **WHEN** API 還沒回答送出申請的請求時按「Close」，之後 API 才回答申請送出了
- **THEN** Join Group 沒有再打開；Groups 根畫面上這個申請的卡片是「Waiting for approval」

#### Scenario: 送出中來了另一條連結

- **WHEN** API 還沒回答送出 Brisbane 的申請的請求時，系統交來 Tokyo 的連結，之後 API 才回答
- **THEN** Join Group 顯示 Tokyo 的表單，回答到了也不變；Brisbane 的申請在本機資料裡是送出了的

### Requirement: SHARING-135.2 申請的內容用從連結的字串導出的金鑰加密

WHEN 送送出申請的請求，the mobile app SHALL 讓申請的內容是申請的明文用申請金鑰加密的密文（SHARING-1.1）：申請金鑰從連結的字串那 32 bytes 導出，用途是 `shared-expense/invite/request/v1`，不給 salt（SHARING-12.1）；nonce 是 `expo-crypto` 給的 24 bytes，每次加密都是新的；附加資料是 `shared-expense/invite/request/v1`、一個換行（`0x0A`）、連結的代號、一個換行和這支手機的裝置 ID，以 UTF-8 編碼。申請的明文是一個 JSON 物件（JavaScript 的 `JSON.stringify`，沒有多餘的空白，以 UTF-8 編碼），依序有四個欄位：`name` 是申請的名字；`memberId` 是選的成員的成員 ID，選「New Member」時是 `null`；`userId` 是你的使用者 ID；`boxKey` 是 box 私鑰的公開金鑰（SHARING-7.1、SHARING-136.1），寫成 64 個小寫十六進位字元；要接手的申請（SHARING-320.1）在這四個欄位之後多第五個欄位 `takeover`，值是 `true`，別的申請沒有這個欄位。JSON 物件後面 SHALL 補上空格（`0x20`），補到明文的 bytes 數是 256 的倍數，已經是 256 的倍數就不補：這樣 API 從密文的長度只看得出明文有幾個 256 bytes，名字在 71 bytes 以內時，看不出名字有多長，也看不出選的是新成員還是一位成員；名字在 55 bytes 以內時，也看不出是不是要接手。

#### Scenario: 當新成員

- **WHEN** 送出申請
- **THEN** 送出申請的請求內容是 `{"request":"<十六進位>"}`；用 S 導出的申請金鑰和上面的附加資料解開它，得到 256 bytes：`{"name":"Dana","memberId":null,"userId":"<這支手機的使用者 ID>","boxKey":"<這支手機 box 私鑰的公開金鑰>"}`，後面都是空格，沒有 `takeover` 這個欄位；密文是 297 bytes，它的第 2 到第 25 個 byte 是 `expo-crypto` 給的 24 bytes

#### Scenario: 選了成員

- **WHEN** 在 Brisbane 的表單選「Casey」，按「Send Request」
- **THEN** 解開的明文裡，`name` 是「Dana」，`memberId` 是 `6ec0bd7f-11c0-43da-975e-2a8ad9ebae0b`，沒有 `takeover` 這個欄位；密文一樣是 297 bytes

#### Scenario: 要接手

- **WHEN** 名片上 Taylor 和 Casey 都有手機；在 Brisbane 的表單按「Taylor, Already joined」那一列，按「Send Request」
- **THEN** 解開的明文是 256 bytes：`{"name":"Dana","memberId":"1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed","userId":"<這支手機的使用者 ID>","boxKey":"<這支手機 box 私鑰的公開金鑰>","takeover":true}`，後面都是空格；密文一樣是 297 bytes

#### Scenario: 要接手時補到 256 的倍數

- **WHEN** 要接手 Taylor，名字是 55 個「a」；或 56 個「a」
- **THEN** 明文依序是 256 和 512 bytes：55 個「a」時 JSON 物件剛好 256 bytes，後面沒有空格

#### Scenario: 補到 256 的倍數

- **WHEN** 選「New Member」，名字是 105 個「a」；或 106 個「a」；或 500 個「a」
- **THEN** 明文依序是 256、512 和 768 bytes：105 個「a」時 JSON 物件剛好 256 bytes，後面沒有空格；其他兩個後面補空格

#### Scenario: 附加資料帶著裝置 ID

- **WHEN** 用同一把申請金鑰，附加資料的裝置 ID 換成別的裝置 ID，或代號換成代號 B
- **THEN** 都解不開

#### Scenario: 再送一次

- **WHEN** 送出申請的回應沒送到手機，按「Try Again」再送一次
- **THEN** 兩個請求的密文解開是同樣的明文，nonce 不同

### Requirement: SHARING-136.1 box 私鑰從 seed 導出

The mobile app SHALL 用從 seed 導出的金鑰當這支手機的 box 私鑰：密鑰材料是 seed，用途是 `shared-expense/device/box/v1`，不給 salt（SHARING-12.1）；申請帶的 `boxKey` 是它的公開金鑰（SHARING-7.1）。box 私鑰不寫進本機資料，也不放進任何請求。

#### Scenario: 已知的 seed

- **WHEN** `expo-crypto` 給的 seed 是 `000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f`，送出申請
- **THEN** 申請的明文裡，`boxKey` 是 `bc908a559c76aef30842db38b5e1844f63847c087cf94b793fe477da10d44e75`，也就是 box 私鑰 `e7ae1fd80468c3fe2fb3fd20bbaf65a290e1e910a794db36f1ad02b5442aaa66` 的公開金鑰；註冊的請求帶的公開金鑰仍是 SHARING-21.1 的那一把

#### Scenario: box 私鑰不留在別處

- **WHEN** 送出申請之後
- **THEN** 在本機資料的檔案和 API 收到的每個請求裡都找不到 box 私鑰，不論是原始的 bytes、十六進位還是 Base64

### Requirement: SHARING-137.1 連結的字串、名字和選擇不離開手機

The mobile app SHALL 不把連結的字串、名片金鑰和申請金鑰放進任何請求：網址、簽名的欄位和內容裡都沒有，不論是原始的 bytes、十六進位還是 Base64。申請的名字、群組名稱、成員名稱、選的成員的成員 ID 和你的使用者 ID，也不以明文出現在任何請求裡。

#### Scenario: 讀邀請、申請和取消

- **WHEN** 打開 Brisbane 的連結，把名字欄位改成「Dana K.」，選「Casey」，送出申請，再取消申請
- **THEN** API 收到的每個請求裡都找不到 S、名片金鑰和申請金鑰，也找不到「Dana K.」、「Brisbane」、「Casey」、Casey 的成員 ID 和這支手機的使用者 ID

### Requirement: SHARING-138.1 等待同意的畫面

WHILE Join Group 顯示一個送出了的申請，the mobile app SHALL 由上而下顯示：「Waiting for Approval」；群組名稱；「A member of this group has to approve your request. You can keep using the app while you wait.」；以及角色為 button、名稱為「Cancel Request」的按鈕。

#### Scenario: 送出之後

- **WHEN** 送出申請
- **THEN** Join Group 由上而下是「Waiting for Approval」、「Brisbane」、「A member of this group has to approve your request. You can keep using the app while you wait.」和「Cancel Request」；標題仍是「Join Group」，標題列只有「Close」

### Requirement: SHARING-139.2 送出沒有結果時留著還沒送出的申請

IF 送出申請的請求沒有得到 API 的回答，被對簽名的請求的檢查拒絕（例如請求太多或時鐘，SHARING-31.2；內容太大除外，它照 SHARING-140.2），註冊沒成功，送請求失敗（例如 secure store 一時讀不了，SHARING-30.1），得到看不懂的回應，或 API 回答申請送出了、本機資料卻記不下來，THEN the mobile app SHALL 留著本機資料裡的申請，它仍是還沒送出的，並讓 Join Group 由上而下顯示：「Your request hasn't been sent.」；沒有得到回應時是「Connect to the internet and try again.」，其他情況是「Something went wrong. Try again later.」；角色為 button、名稱為「Try Again」的按鈕；和「Cancel Request」。按「Try Again」用同一個申請再送一次（SHARING-134.1），不再問名字和選擇。之後為還沒送出的申請打開 Join Group 時（SHARING-131.2、GROUPS-108.2），顯示「Your request hasn't been sent.」、「Try Again」和「Cancel Request」，沒有中間那一句。手機 app 不自己重送；API 其實已經收下的申請，手機在問結果時得知（SHARING-211.1）。

#### Scenario: 沒有網路

- **WHEN** 打開 Brisbane 的連結之後手機沒有網路，按「Send Request」
- **THEN** Join Group 由上而下是「Your request hasn't been sent.」、「Connect to the internet and try again.」、「Try Again」和「Cancel Request」；本機資料存著還沒送出的申請

#### Scenario: 連上線之後再試

- **WHEN** 接著手機有網路，按「Try Again」
- **THEN** API 收到送出申請的請求；Join Group 顯示「Waiting for Approval」，本機資料的申請是送出了的

#### Scenario: 回應沒收到

- **WHEN** API 收下了申請，回應卻沒送到手機；之後按「Try Again」
- **THEN** 先顯示「Your request hasn't been sent.」和「Connect to the internet and try again.」；按了之後 API 收到第二個送出申請的請求，路徑和第一個一樣，Join Group 顯示「Waiting for Approval」

#### Scenario: 請求太多和看不懂的回應

- **WHEN** 送出申請的請求因為請求太多被拒絕，等了之後再送仍被拒絕；或 API 回 500；或回 200 但內容不是申請送出了的回應；或 API 拒絕註冊，原因是註冊太多
- **THEN** Join Group 都顯示「Your request hasn't been sent.」、「Something went wrong. Try again later.」、「Try Again」和「Cancel Request」

#### Scenario: secure store 一時讀不了

- **WHEN** 註冊好了的手機，secure store 讀不了時按「Send Request」；恢復之後按「Try Again」
- **THEN** 先顯示「Your request hasn't been sent.」、「Something went wrong. Try again later.」、「Try Again」和「Cancel Request」，本機資料存著還沒送出的申請，API 沒有收到送出申請的請求；按了之後申請送出了

#### Scenario: API 收下了，手機卻記不下來

- **WHEN** API 回答申請送出了，本機資料這時卻寫不進去；恢復之後按「Try Again」
- **THEN** 先顯示「Your request hasn't been sent.」、「Something went wrong. Try again later.」、「Try Again」和「Cancel Request」；按了之後 API 收到第二個送出申請的請求，Join Group 顯示「Waiting for Approval」，API 上這支手機仍只有一個申請

#### Scenario: 之後再打開

- **WHEN** 沒有網路時按了「Send Request」，關閉 Join Group，重新啟動 app，再打開 Brisbane 的連結
- **THEN** Join Group 由上而下是「Your request hasn't been sent.」、「Try Again」和「Cancel Request」；app 沒有因為重新啟動而再送一次申請

### Requirement: SHARING-140.2 申請被拒絕時不留下申請

IF 送出申請的請求被申請 API 拒絕，或因為內容太大被拒絕（SHARING-48.2）：這是對簽名的請求的檢查裡，唯一一種原樣再送也不會過的，THEN the mobile app SHALL 刪掉本機資料裡的這個申請，讓 Join Group 的內容只有一句話：原因是沒有這個邀請時，「This invite link can't be used. Ask the person who sent it to send it again.」；申請太多時，「Too many people are waiting to join this group. Try again later.」；內容不對或內容太大時，「Something went wrong. Try again later.」。原因是已經是成員時不刪：這支手機可能剛被同意，所以問一次結果（SHARING-210.1），照問到的處理：API 回答同意了就加入（SHARING-216.1）；仍說已經是成員就刪掉申請，Join Group 的內容只有「This phone is already in this group.」（SHARING-222.1）；問不到時申請留著，仍是還沒送出的，下次再問（SHARING-215.1），因為它可能已經被同意了；這時 Join Group 照 SHARING-139.2 顯示，中間那一句在問結果的請求沒有得到回應時是「Connect to the internet and try again.」，其他情況是「Something went wrong. Try again later.」。只有帶著原因的拒絕才算：沒有帶原因的 404 是看不懂的回應（SHARING-139.2）。

#### Scenario: 邀請在送出之前被撤回

- **WHEN** 打開 Brisbane 的連結之後，別支手機撤回了邀請；按「Send Request」
- **THEN** Join Group 的內容只有「This invite link can't be used. Ask the person who sent it to send it again.」；本機資料沒有申請，Groups 根畫面沒有申請的卡片

#### Scenario: 申請太多

- **WHEN** API 拒絕送出申請的請求，原因是申請太多
- **THEN** Join Group 的內容只有「Too many people are waiting to join this group. Try again later.」；本機資料沒有申請

#### Scenario: 已經是成員

- **WHEN** API 拒絕送出申請的請求，原因是已經是成員，問結果時也拒絕，原因是已經是成員
- **THEN** API 在送出申請之後收到一個問結果的請求；Join Group 的內容只有「This phone is already in this group.」；本機資料沒有申請

#### Scenario: 剛被同意

- **WHEN** API 收下了申請，回應卻沒送到手機；成員同意了它；之後按「Try Again」，API 拒絕送出申請的請求，原因是已經是成員
- **THEN** 手機問結果，API 回答同意了，手機照 SHARING-216.1 加入；本機資料的申請沒有被當成被拒絕的刪掉

#### Scenario: 問不到結果

- **WHEN** API 拒絕送出申請的請求，原因是已經是成員；接著問結果的請求沒有得到回應，或 API 回 500
- **THEN** 本機資料的申請還在，是還沒送出的，Groups 根畫面仍有它的卡片；Join Group 由上而下是「Your request hasn't been sent.」、「Connect to the internet and try again.」（回 500 時是「Something went wrong. Try again later.」）、「Try Again」和「Cancel Request」，沒有「This phone is already in this group.」

#### Scenario: 內容不對或內容太大

- **WHEN** API 拒絕送出申請的請求，原因是內容不對或內容太大
- **THEN** Join Group 的內容只有「Something went wrong. Try again later.」；本機資料沒有申請

### Requirement: SHARING-141.2 送不出申請時留在表單

IF 使用者按「Send Request」時裝置身分產生不了（SHARING-24.1），授權失效的手機換不了新的裝置身分（SHARING-321.1），或申請存不進本機資料，THEN the mobile app SHALL 不發出網路請求，不留下申請，Join Group 仍顯示表單，名字欄位和選著的那一列都不變，並跳出標題是「Unable to Send Request」、訊息是「Something went wrong. Try again later.」的提示框。IF 使用者替還沒送出的申請按「Try Again」時，授權失效的手機換不了新的裝置身分，THEN SHALL 不發出網路請求，跳出同一個提示框，申請留著，Join Group 顯示的不變。授權失效本身不擋送出：這支手機照 SHARING-321.1 換一個新的裝置身分，再照常送出。

#### Scenario: 授權失效的手機照常送出

- **WHEN** 授權失效的手機打開 Brisbane 的連結，按「Send Request」
- **THEN** 沒有跳出提示框；API 在讀邀請之後收到註冊的請求和送出申請的請求（SHARING-321.1）；Join Group 顯示「Waiting for Approval」

#### Scenario: secure store 寫不進去

- **WHEN** secure store 寫不進去，在 Brisbane 的表單把名字欄位改成「Dana K.」，選「Casey」，按「Send Request」；secure store 恢復之後再按一次
- **THEN** 先跳出「Unable to Send Request」，訊息是「Something went wrong. Try again later.」，這支手機沒有裝置身分，本機資料沒有申請，名字欄位仍是「Dana K.」，仍選著「Casey」；再按之後申請送出了

#### Scenario: 本機資料寫不進去

- **WHEN** 註冊好了的手機，本機資料寫不進去時按「Send Request」
- **THEN** 跳出「Unable to Send Request」，訊息是「Something went wrong. Try again later.」；API 沒有收到送出申請的請求

#### Scenario: 授權失效的手機換不了新的裝置身分

- **WHEN** 授權失效的手機，secure store 寫不進去時打開 Brisbane 的連結，按「Send Request」
- **THEN** 跳出「Unable to Send Request」，訊息是「Something went wrong. Try again later.」；除了讀邀請，API 沒有收到請求；這支手機仍是授權失效，裝置 ID 和之前一樣，本機資料沒有申請，Join Group 仍顯示 Brisbane 的表單

#### Scenario: 按 Try Again 時授權失效

- **WHEN** 沒有網路時按了「Send Request」，關閉 Join Group；之後這支手機的 secure store 裡沒有了它的 seed；有網路之後再打開 Brisbane 的連結，按「Try Again」
- **THEN** 沒有跳出提示框；API 收到註冊的請求和送出申請的請求，兩個的裝置 ID 相同，不是這支手機原本的那一個；Join Group 顯示「Waiting for Approval」

#### Scenario: 按 Try Again 時換不了新的裝置身分

- **WHEN** 同樣的情況，按「Try Again」時 secure store 寫不進去
- **THEN** 跳出「Unable to Send Request」，訊息是「Something went wrong. Try again later.」；API 沒有收到請求；Join Group 仍顯示「Your request hasn't been sent.」、「Try Again」和「Cancel Request」，本機資料的申請還在

### Requirement: SHARING-142.1 取消申請

WHEN 使用者在 Join Group 按「Cancel Request」，the mobile app SHALL 先跳出提示框：標題「Cancel Request?」，訊息「You'll need the invite link to ask again.」，按鈕是「Keep Waiting」和破壞性的「Cancel Request」。按提示框的「Cancel Request」才送取消申請的請求（SHARING-117.2），路徑帶著申請的代號；API 回答取消好了之後，刪掉本機資料裡的這個申請，關閉 Join Group。還沒送出的申請也先送取消申請的請求：API 可能已經收下它。按「Keep Waiting」什麼都不做。一個申請同時只有一個請求在路上：取消申請的請求還沒有結果時，又確認一次取消或按「Try Again」，都不另外發出請求，等的是同一次取消的結果。取消申請的請求還沒有結果時關閉了 Join Group，再為同一個申請打開它（從連結，或從申請的卡片，GROUPS-108.2），Join Group SHALL 顯示那個申請，等的仍是同一次取消的結果；結果到了，和 Join Group 沒有關過一樣：取消好了就刪掉申請、關閉 Join Group，沒成功就照 SHARING-143.2 跳出提示框。

#### Scenario: 取消

- **WHEN** 送出申請之後按「Cancel Request」，再按提示框的「Cancel Request」
- **THEN** API 收到對 `/invites/3q2-7wEjRWeJq83vEjRWeA/request` 沒有內容的 `DELETE`；Join Group 關閉；本機資料沒有申請，Groups 根畫面沒有申請的卡片

#### Scenario: 取消之後再打開連結

- **WHEN** 接著打開 Brisbane 的連結
- **THEN** Join Group 顯示 Brisbane 的表單

#### Scenario: 按 Keep Waiting

- **WHEN** 在提示框按「Keep Waiting」
- **THEN** API 沒有收到取消申請的請求，Join Group 仍顯示「Waiting for Approval」，本機資料的申請還在

#### Scenario: 還沒有結果時再確認一次

- **WHEN** API 還沒回答取消申請的請求時，又確認一次取消；之後 API 才回答取消好了
- **THEN** API 只收到一個取消申請的請求；Join Group 關閉，本機資料沒有申請

#### Scenario: 還沒有結果時關閉再打開

- **WHEN** API 還沒回答取消申請的請求時按「Close」，再打開 Brisbane 的連結，或在 Groups 根畫面按申請的卡片；之後 API 才回答取消好了
- **THEN** 回答到之前，Join Group 顯示「Waiting for Approval」和「Brisbane」，API 沒有多收到取消申請的請求；回答到了之後 Join Group 關閉，本機資料沒有申請，Groups 根畫面沒有申請的卡片

#### Scenario: 還沒有結果時按 Try Again

- **WHEN** API 收下了申請，回應卻沒送到手機；按「Cancel Request」並確認，API 還沒回答取消申請的請求時按「Try Again」；之後 API 才回答取消好了
- **THEN** API 沒有多收到送出申請的請求；Join Group 關閉，本機資料沒有申請，API 上也沒有這支手機的申請

#### Scenario: 還沒送出的申請

- **WHEN** API 收下了申請，回應卻沒送到手機；在 Join Group 按「Cancel Request」，再按提示框的「Cancel Request」
- **THEN** API 收到取消申請的請求，API 上不再有這支手機的申請；Join Group 關閉，本機資料沒有申請

### Requirement: SHARING-143.2 取消沒成功時申請還在

IF 取消申請的請求沒有得到取消好了的回答，或 API 回答取消好了、本機資料卻存不進去，THEN the mobile app SHALL 留著本機資料裡的申請，Join Group 顯示的不變，並跳出標題是「Unable to Cancel Request」的提示框：沒有得到回應時訊息是「Connect to the internet and try again.」，其他情況是「Something went wrong. Try again later.」。之後可以再取消一次。IF 取消申請的請求被拒絕，原因是已經是成員（SHARING-117.2），THEN the mobile app SHALL 不跳出提示框，留著申請，替它問一次結果（SHARING-210.1），照問到的處理：成員在這之前同意了它，所以這支手機會加入（SHARING-216.1）；Join Group 關著時也一樣。取消的結果到的時候 Join Group 關著，或顯示的是別的連結或別的申請，SHALL 照樣照結果處理本機資料——取消好了就刪掉申請，沒成功就留著——但不跳出提示框，不打開也不關閉 Join Group，不改它顯示的；關過又為同一個申請打開了的 Join Group 不在這裡面，它照 SHARING-142.1 等同一次取消的結果。IF 這支手機授權失效（SHARING-29.1），THEN SHALL 不送請求，直接刪掉本機資料裡的這個申請並關閉 Join Group：它已經不能替那個裝置身分做任何事。

#### Scenario: 沒有網路

- **WHEN** 送出申請之後手機沒有網路，按「Cancel Request」，再按提示框的「Cancel Request」
- **THEN** 跳出「Unable to Cancel Request」，訊息是「Connect to the internet and try again.」；Join Group 仍顯示「Waiting for Approval」，本機資料的申請還在

#### Scenario: 看不懂的回應

- **WHEN** API 對取消申請的請求回 500
- **THEN** 跳出「Unable to Cancel Request」，訊息是「Something went wrong. Try again later.」；本機資料的申請還在

#### Scenario: API 取消了，手機卻存不下

- **WHEN** API 回答取消好了，本機資料這時卻寫不進去；恢復之後再取消一次
- **THEN** 先跳出「Unable to Cancel Request」，訊息是「Something went wrong. Try again later.」，申請還在；再取消之後 Join Group 關閉，本機資料沒有申請

#### Scenario: 結果到的時候 Join Group 已經關閉

- **WHEN** API 還沒回答取消申請的請求時按「Close」；之後 API 回 500，或回答取消好了
- **THEN** 兩種都沒有跳出提示框，Join Group 沒有再打開；回 500 時本機資料的申請還在，Groups 根畫面仍有它的卡片；回答取消好了時本機資料沒有申請

#### Scenario: 關閉再打開同一個申請之後才沒成功

- **WHEN** API 還沒回答取消申請的請求時按「Close」，再打開 Brisbane 的連結，或在 Groups 根畫面按申請的卡片；之後 API 回 500
- **THEN** 跳出「Unable to Cancel Request」，訊息是「Something went wrong. Try again later.」；Join Group 仍顯示「Waiting for Approval」，本機資料的申請還在

#### Scenario: 結果到的時候 Join Group 已經換成別的連結

- **WHEN** API 還沒回答取消 Brisbane 的申請的請求時，系統交來 Tokyo 的連結；之後 API 回 500，或回答取消好了
- **THEN** 兩種都沒有跳出提示框，Join Group 仍顯示 Tokyo 的表單；回 500 時 Brisbane 的申請還在本機資料裡，回答取消好了時沒有

#### Scenario: 授權失效

- **WHEN** 送出申請之後，這支手機的 secure store 裡沒有了它的 seed；按「Cancel Request」，再按提示框的「Cancel Request」
- **THEN** API 沒有收到取消申請的請求；Join Group 關閉，本機資料沒有申請

#### Scenario: 取消遇上同意

- **WHEN** Join Group 顯示「Waiting for Approval」時成員同意了這個申請；這支手機還沒問到，按「Cancel Request」，再按提示框的「Cancel Request」
- **THEN** API 拒絕取消申請的請求，原因是已經是成員；沒有跳出提示框；API 接著收到問結果的請求，回答同意了；這支手機加入好了，Join Group 關閉，顯示 Brisbane 的畫面（SHARING-220.1）

### Requirement: SHARING-144.2 等待期間照常記帳，重新啟動之後申請還在

WHILE 本機資料存著申請，the mobile app SHALL 照常讓使用者新增和修改個人和群組的資料，不因此發出網路請求；關閉 Join Group 不取消申請；重新啟動 app 之後申請還在，app 打開時只替它問結果（SHARING-210.1），不重送，也不取消。

#### Scenario: 等待中記帳

- **WHEN** 送出申請之後關閉 Join Group，新增一筆個人支出，建立群組「Paris」並在裡面新增一筆支出
- **THEN** 都存得下；API 沒有多收到請求，本機資料的申請還在

#### Scenario: 重新啟動

- **WHEN** 接著重新啟動 app，在 Groups 根畫面按申請的卡片（GROUPS-108.2）
- **THEN** Join Group 顯示「Waiting for Approval」和「Brisbane」；API 沒有多收到送出申請和取消申請的請求

#### Scenario: 兩個群組的申請

- **WHEN** 送出 Brisbane 的申請之後，打開 Tokyo 的連結並按「Send Request」
- **THEN** 本機資料存著兩個申請；再打開 Brisbane 的連結，Join Group 顯示 Brisbane 的那一個

### Requirement: SHARING-145.1 申請加入的請求等不到回應時在 60 秒後放棄

IF 讀邀請、送出申請或取消申請時送出的一個請求——註冊這支手機的請求也算——送出 60 秒之後還沒有收完回應，THEN the mobile app SHALL 放棄這個請求，把它當成沒有得到回應：讀邀請照 SHARING-133.1，送出申請照 SHARING-139.2，取消申請照 SHARING-143.2。放棄之後才到的回應不算數：Join Group 顯示的和本機資料都不因為它而變。這支手機之後送的請求不等被放棄的那一個。每個送出的請求各自算 60 秒：API 要求等待的時間（SHARING-28.1）不算在內，等過之後或校正時鐘之後再送的那一次重新算。

#### Scenario: 讀邀請一直沒有回應

- **WHEN** 打開 Brisbane 的連結，API 一直沒有回答讀邀請的請求；過了 50 秒；再過 15 秒；之後 API 照常回答，按「Try Again」
- **THEN** 50 秒時 Join Group 的內容只有「Loading invite…」；再過 15 秒，Join Group 顯示「Connect to the internet to join this group.」和「Try Again」；按了之後顯示 Brisbane 的表單

#### Scenario: 送出申請的回應在放棄之後才到

- **WHEN** 按「Send Request」，API 收下了申請，卻一直沒有回答那個請求；過了 65 秒 API 才回答
- **THEN** 65 秒時 Join Group 顯示「Your request hasn't been sent.」和「Connect to the internet and try again.」；回答到了之後 Join Group 顯示的不變，本機資料的申請仍是還沒送出的

#### Scenario: 註冊一直沒有回應

- **WHEN** 按「Send Request」，API 一直沒有回答註冊的請求；過了 65 秒；按「Try Again」時那個註冊的請求仍然沒有回答
- **THEN** 65 秒時 Join Group 顯示「Your request hasn't been sent.」和「Connect to the internet and try again.」，API 沒有收到送出申請的請求；按了之後 API 收到第二個註冊的請求和送出申請的請求，Join Group 顯示「Waiting for Approval」

#### Scenario: 取消一直沒有回應

- **WHEN** 送出申請之後按「Cancel Request」，再按提示框的「Cancel Request」，API 一直沒有回答；過了 50 秒；再過 15 秒
- **THEN** 50 秒時沒有跳出別的提示框；再過 15 秒，跳出「Unable to Cancel Request」，訊息是「Connect to the internet and try again.」，本機資料的申請還在

### Requirement: SHARING-170.1 成員手機列出群組的申請

WHEN 成員手機送列出申請的請求，the API SHALL 回傳這個群組的申請，依申請的裝置 ID 由小到大（字元逐一比較），每一個帶著邀請的代號、申請的裝置 ID 和申請的內容，並說這一頁之後還有沒有申請；群組沒有有效的邀請，或有效的邀請沒有申請時，回傳沒有申請的一頁。回應帶著 `Cache-Control: no-store`。列出不改任何東西；群組的每一支成員手機都可以列出，不管邀請是哪一支建立的。

#### Scenario: 兩個申請

- **WHEN** Casey 的手機送出了申請 P；裝置 ID 是 `11111111-1111-4111-8111-111111111111` 的手機另外在代號 A 送出了申請 Q；Taylor 的手機送 `GET /groups/9b2f6c1e-8d47-4f3a-b1c5-2e7d90a4f6b8/requests`
- **THEN** API 回 200，回應是 `{"requests":[{"code":"3q2-7wEjRWeJq83vEjRWeA","deviceId":"11111111-1111-4111-8111-111111111111","request":"<Q 的十六進位>"},{"code":"3q2-7wEjRWeJq83vEjRWeA","deviceId":"7c9e6679-7425-40de-944b-e07fc1f90ae7","request":"<P 的十六進位>"}],"more":false}`，標頭有 `Cache-Control: no-store`；資料庫和列出之前一樣，除了這個請求的紀錄

#### Scenario: 沒有申請

- **WHEN** 代號 A 沒有申請；或 Brisbane 沒有邀請
- **THEN** 回應都是 `{"requests":[],"more":false}`

#### Scenario: 不再算數的申請

- **WHEN** Casey 的手機取消了申請；或代號 A 的邀請被撤回；或 API 的時間到了它的到期時間 T+604,800,000，清除還沒執行
- **THEN** 三種情況列出的都是沒有申請的一頁

#### Scenario: 換過內容的申請

- **WHEN** Casey 的手機在代號 A 再送申請 Q，Taylor 的手機列出申請
- **THEN** 列出的只有一個申請，內容是 Q

#### Scenario: 別的群組的申請

- **WHEN** Taylor 的手機另外建立了 Tokyo 和它代號 B 的邀請，別的手機在代號 B 送出了申請 R；Taylor 的手機列出 Brisbane 的申請
- **THEN** 列出的只有 P

#### Scenario: 別的成員手機

- **WHEN** 另一支手機是 Brisbane 的成員手機，它列出 Brisbane 的申請
- **THEN** 得到 P

### Requirement: SHARING-171.1 列出的一頁最多 262,144 bytes 的內容

WHEN 列出申請，the API SHALL 讓一頁的申請的內容加起來不超過 262,144 bytes：依序放進申請，下一個放不下就停，並說之後還有申請；請求帶著 `?after=<裝置 ID>` 時，只列裝置 ID 比它大的申請。一個申請最大是 65,536 bytes，所以還有申請時，一頁至少有四個。

#### Scenario: 20 個小的申請

- **WHEN** 代號 A 有 20 個 200 bytes 的申請
- **THEN** 一頁就列出 20 個，之後沒有申請

#### Scenario: 放不下的留到下一頁

- **WHEN** 代號 A 有 6 個 65,536 bytes 的申請；Taylor 的手機列出申請，再帶著第一頁最後一個申請的裝置 ID 當 `after` 列一次
- **THEN** 第一頁是裝置 ID 最小的 4 個，說之後還有；第二頁是其餘 2 個，說之後沒有

#### Scenario: after 之後沒有申請

- **WHEN** `after` 是裝置 ID 最大的那個申請的裝置 ID；或是沒有申請的手機的裝置 ID `ffffffff-ffff-4fff-bfff-ffffffffffff`
- **THEN** 都是沒有申請的一頁，之後沒有

### Requirement: SHARING-172.1 成員手機拒絕申請

WHEN 成員手機送拒絕的請求，路徑裡的那支手機在這個群組有申請，而網址帶的 `request` 是那個申請現在的內容的 SHA-256，the API SHALL 不再存著那個申請，並回答拒絕好了，回應帶著那支手機的裝置 ID；別的申請不變。拒絕和同意一樣指名內容：成員拒絕的是他的手機列出的那一份，申請的手機在這之後換上的另一份不會被它刪掉（SHARING-174.1）。API 不留下它被拒絕過的紀錄：它的位置空出來（SHARING-116.1），那支手機之後可以再送申請（SHARING-112.1）。群組的每一支成員手機都可以拒絕。

#### Scenario: 拒絕 Casey

- **WHEN** 別的手機在代號 A 也送出了申請 Q；Taylor 的手機拒絕 Casey
- **THEN** API 回 200，回應是 `{"deviceId":"7c9e6679-7425-40de-944b-e07fc1f90ae7"}`；資料庫裡找不到申請 P，申請 Q 仍剛好一份；列出申請只有 Q

#### Scenario: 位置空出來

- **WHEN** 代號 A 已經有 20 個申請，Taylor 的手機拒絕其中一個，還沒有申請的手機接著送申請 R
- **THEN** 申請 R 送出了

#### Scenario: 被拒絕之後再申請

- **WHEN** Taylor 的手機拒絕 Casey 之後，Casey 的手機在代號 A 送申請 Q
- **THEN** 申請 Q 送出了，列出申請得到 Q

### Requirement: SHARING-173.2 成員手機同意申請

WHEN 成員手機送同意的請求，而它沒有被 SHARING-174.1 到 SHARING-182.2 和 SHARING-256.1 拒絕，the API SHALL 在同一個 transaction 裡做完這幾件事，不會只做一部分：把請求帶的事件照上傳存下（SYNC-50.1、SYNC-51.1），上傳的裝置是這支成員手機，鑰匙世代是請求帶的，收到時間是這時 API 的時間；把申請的手機記成這個群組的成員手機，它的進度是那份快照涵蓋的序號和這時 API 的時間（SYNC-58.1）；記下交接；不再存著那個申請。它回答同意好了，回應帶著申請的裝置 ID 和請求裡每個事件的序號。群組的每一支成員手機都可以同意，被同意而加入的也可以。

#### Scenario: 同意 Casey

- **WHEN** Taylor 的手機在 T+1,000 同意 Casey
- **THEN** API 回 200，回應是 `{"deviceId":"7c9e6679-7425-40de-944b-e07fc1f90ae7","events":[{"id":"<E 的事件 ID>","sequence":1}]}`；資料庫裡找不到申請 P，列出申請是沒有申請的一頁

#### Scenario: Casey 的手機成了成員手機

- **WHEN** 接著 Casey 的手機問 Brisbane 有沒有給它的快照，再從 cursor 0 下載 Brisbane 的事件
- **THEN** 問到 S；下載得到 E，它的序號是 1，上傳的裝置 ID 是 Taylor 的手機的，鑰匙世代是 1，收到時間是 T+1,000

#### Scenario: 進度是快照涵蓋的序號

- **WHEN** Brisbane 有三個事件，S 涵蓋的序號是 2，Taylor 的手機用 cursor 3 同意 Casey
- **THEN** 同意好了，E 的序號是 4；資料庫裡 Casey 的手機在 Brisbane 的進度是 cursor 2 和這時 API 的時間，所以清除不刪序號 3 和 4 的事件（SYNC-134.1）

#### Scenario: 被同意的手機再同意別人

- **WHEN** Casey 的手機被同意之後，別的手機在代號 A 送出申請 Q；Casey 的手機替它上傳完整的快照，用 cursor 1 同意它
- **THEN** 同意好了

### Requirement: SHARING-174.1 沒有這個申請時不能同意和拒絕

IF 同意或拒絕的請求的路徑裡的那支手機在這個群組沒有申請——它沒有申請過、取消了、已經被同意或拒絕，或邀請已經過期或被撤回——或同意或拒絕的請求帶的 `request` 不是那個申請現在的內容的 SHA-256，THEN the API SHALL 拒絕，原因是沒有這個申請，什麼都不改。

#### Scenario: 已經被拒絕

- **WHEN** Taylor 的手機拒絕 Casey 之後，再同意 Casey，再拒絕一次
- **THEN** 後兩個請求都被拒絕，原因是沒有這個申請（404），回應是 `{"error":"no-request"}`；Casey 的手機不是成員手機

#### Scenario: 已經被同意

- **WHEN** Taylor 的手機同意 Casey 之後，再同意一次，再拒絕 Casey
- **THEN** 後兩個請求都被拒絕，原因是沒有這個申請；Casey 的手機仍是成員手機，E 只存了一次

#### Scenario: 申請換了內容

- **WHEN** Casey 的手機在代號 A 再送申請 Q，Taylor 的手機用 P 的 SHA-256 同意 Casey，再用 P 的 SHA-256 拒絕 Casey
- **THEN** 都被拒絕，原因是沒有這個申請；申請 Q 還在，Casey 的手機不是成員手機；改用 Q 的 SHA-256 之後同意好了

#### Scenario: 邀請過期或被撤回

- **WHEN** API 的時間到了 T+604,800,000；或 Taylor 的手機撤回了代號 A；Taylor 的手機同意 Casey，再拒絕 Casey
- **THEN** 都被拒絕，原因是沒有這個申請

#### Scenario: 沒有申請過的手機

- **WHEN** Taylor 的手機同意或拒絕一支註冊過、沒有申請的手機，或裝置 ID 是 API 沒見過的 `ffffffff-ffff-4fff-bfff-ffffffffffff`
- **THEN** 都被拒絕，原因是沒有這個申請

### Requirement: SHARING-175.1 兩位成員同時處理同一個申請時，先到的為準

WHEN 同一個申請的幾個同意或拒絕的請求同時送到，the API SHALL 只讓其中一個成功，其餘的都被拒絕，原因是沒有這個申請；成功的是同意時，那支手機成為成員手機一次，請求帶的事件只有成功的那一個的存下。

#### Scenario: 兩支成員手機同時同意

- **WHEN** 五個群組各有 Taylor 的手機和另一支成員手機、一個申請，和給申請的手機的一份完整快照；兩支成員手機都帶著這一份快照的快照 ID、各帶自己的事件，同時同意同一個申請
- **THEN** 每個群組都剛好一個請求得到同意好了，另一個被拒絕，原因是沒有這個申請；每個群組只多一個事件，是成功的那個請求帶的；申請的手機在每個群組都是成員手機

#### Scenario: 同時同意和拒絕

- **WHEN** 五個群組各有兩支成員手機和一個申請，一支同意，另一支同時拒絕
- **THEN** 每個群組都剛好一個請求成功，另一個被拒絕，原因是沒有這個申請；同意成功的群組裡申請的手機是成員手機、多了一個事件，拒絕成功的群組裡它不是成員手機、沒有多事件

### Requirement: SHARING-176.1 同意的手機沒有跟上群組最新的序號時不能同意

IF 同意的請求帶的 `cursor` 比群組最新的序號小，THEN the API SHALL 拒絕，原因是沒有跟上，什麼都不改，申請還在：這支手機還沒看到群組最新的事件，其中可能有別的成員剛寫下的名冊紀錄，例如另一支手機剛被同意代表同一位成員。同意帶的事件存下之後群組最新的序號變大，所以兩支成員手機用同一個 cursor 同時同意兩個不同的申請時，只有一個成功。

#### Scenario: 少一個事件

- **WHEN** Brisbane 有三個事件，Taylor 的手機用 cursor 2 同意 Casey；再用 cursor 3 同意
- **THEN** 前一次被拒絕，原因是沒有跟上（409），回應是 `{"error":"behind"}`，申請 P 還在；後一次同意好了

#### Scenario: 同時同意兩個不同的申請

- **WHEN** 五個群組各有 Taylor 的手機和另一支成員手機、兩個申請和它們各自的完整快照；兩支成員手機用同一個 cursor 同時各同意一個申請
- **THEN** 每個群組都剛好一個請求得到同意好了，另一個被拒絕，原因是沒有跟上；被拒絕的那個申請還在

### Requirement: SHARING-177.1 同意指的快照要是給那支手機的完整快照

IF 同意的請求帶的 `snapshotId` 不是這個群組替申請的那支手機存著的完整快照的快照 ID（SYNC-108.2），或那份快照涵蓋的序號比群組清到的序號小（SYNC-136.2），THEN the API SHALL 拒絕，原因是沒有快照，什麼都不改，申請還在。涵蓋的序號剛好是群組清到的序號時照常同意。

#### Scenario: 沒有完整的快照

- **WHEN** S 沒有上傳過；或只上傳了三塊裡的兩塊；Taylor 的手機同意 Casey
- **THEN** 被拒絕，原因是沒有快照（404），回應是 `{"error":"no-snapshot"}`；申請 P 還在，Casey 的手機不是成員手機

#### Scenario: 給別支手機的快照，或被換掉的快照

- **WHEN** 同意帶的快照 ID 是 Taylor 的手機給別支手機的完整快照的；或 S 上傳之後，另一支成員手機替 Casey 的手機上傳了完整的 S2，Taylor 的手機仍帶著 S 的快照 ID
- **THEN** 都被拒絕，原因是沒有快照；後一種改帶 S2 的快照 ID 之後同意好了

#### Scenario: 接不上事件的快照

- **WHEN** Brisbane 的三個事件在清除裡都刪了，群組清到的序號是 3；之後 Taylor 的手機替 Casey 的手機上傳涵蓋的序號是 2 的完整快照，用 cursor 3 同意 Casey；再換成涵蓋的序號是 3 的完整快照
- **THEN** 前一次被拒絕，原因是沒有快照；後一次同意好了

### Requirement: SHARING-178.1 一個群組最多 20 支成員手機

IF 同意的請求送到時，這個群組已經有 20 支成員手機，THEN the API SHALL 拒絕，原因是成員手機滿了，什麼都不改，申請還在；有 19 支時照常同意。

#### Scenario: 第 21 支

- **WHEN** Brisbane 有 20 支成員手機，Taylor 的手機同意 Casey
- **THEN** 被拒絕，原因是成員手機滿了（409），回應是 `{"error":"members-full"}`；申請 P 還在

#### Scenario: 第 20 支

- **WHEN** Brisbane 有 19 支成員手機，Taylor 的手機同意 Casey
- **THEN** 同意好了，Brisbane 有 20 支成員手機

### Requirement: SHARING-179.1 同意帶的事件和上傳的事件一樣檢查

IF 同意的請求帶的 `epoch` 不是群組現在的鑰匙世代，THEN the API SHALL 拒絕，原因是鑰匙世代，回應帶著群組現在的鑰匙世代（SYNC-55.1）；IF 請求帶的事件存下之後，群組存著的事件的大小會超過上限，THEN the API SHALL 拒絕，原因是群組滿了（SYNC-56.1）。兩種都什麼都不改，申請還在，申請的手機不是成員手機。

#### Scenario: 鑰匙世代不對

- **WHEN** Taylor 的手機同意 Casey，`epoch` 是 2
- **THEN** 被拒絕，原因是鑰匙世代（409），回應是 `{"error":"epoch","epoch":1}`；申請 P 還在，E 沒有存下

#### Scenario: 群組滿了

- **WHEN** Brisbane 存著的事件的大小離上限只剩 199 bytes，Taylor 的手機帶著 200 bytes 的 E 同意 Casey
- **THEN** 被拒絕，原因是群組滿了（413）；申請 P 還在，Casey 的手機不是成員手機

### Requirement: SHARING-180.1 不是成員手機的手機不能列出、同意和拒絕

IF 列出、同意或拒絕的請求打的群組沒有把這支手機記成成員手機，或沒有這個群組，THEN the API SHALL 拒絕，原因是不是成員（SYNC-49.2 的同一個原因）；這兩種情況的回應一模一樣，也不因那個群組有沒有邀請、有沒有那支手機的申請而不同，所以不是成員手機的手機問不出一個群組有誰在申請。申請的手機也不能替自己同意。

#### Scenario: 不是成員手機

- **WHEN** 一支註冊過、不是成員手機的手機，對 Brisbane 和還沒有建立的 Tokyo 各送：列出申請、同意 Casey、拒絕 Casey
- **THEN** 六個請求都被拒絕，原因是不是成員（403），兩個群組得到的回應一模一樣；申請 P 還在

#### Scenario: 申請的手機替自己同意

- **WHEN** Casey 的手機自己送同意 Casey 的請求
- **THEN** 被拒絕，原因是不是成員

### Requirement: SHARING-181.1 同意的 API 的請求寫得不對

IF 同意的 API 的請求寫得不對，THEN the API SHALL 拒絕，原因是內容不對：群組 ID 或路徑裡的裝置 ID 不是小寫的第 4 版 UUID；問結果的代號不是 16 bytes 的 base64url 寫法；列出的網址帶的查詢不是剛好 `?after=` 加上一個小寫的第 4 版 UUID；拒絕的網址帶的查詢不是剛好 `?request=` 加上 64 個小寫十六進位字元；同意和問結果的網址帶了查詢；拒絕的請求帶了內容；同意的內容不是剛好有 `request`、`cursor`、`snapshotId`、`senderKey`、`epoch`、`box` 和 `events` 七個欄位的 JSON 物件，`request` 或 `senderKey` 不是 32 bytes 的小寫十六進位寫法，`cursor` 不是 0 到 9,007,199,254,740,991 之間的整數，`snapshotId` 不是小寫的第 4 版 UUID，`epoch` 不是 1 到 9,007,199,254,740,991 之間的整數，`box` 不是 41 到 65,536 bytes 的小寫十六進位寫法，或 `events` 不合上傳的事件的規定（SYNC-53.1：1 到 100 個，各有不重複的事件 ID 和 41 到 65,536 bytes 的內容）；或同意帶的 `cursor` 比群組最新的序號大。

#### Scenario: 路徑的寫法

- **WHEN** Taylor 的手機列出、同意和拒絕時，群組 ID 是大寫的 `9B2F6C1E-8D47-4F3A-B1C5-2E7D90A4F6B8` 或 `brisbane`；同意和拒絕時，路徑裡的裝置 ID 是 `casey` 或大寫的 `7C9E6679-7425-40DE-944B-E07FC1F90AE7`
- **THEN** 都被拒絕，原因是內容不對（400）

#### Scenario: 查詢

- **WHEN** 列出的網址後面是 `?after=casey`、`?after=`、`?x=1`，或 `?after=7c9e6679-7425-40de-944b-e07fc1f90ae7&x=1`；拒絕的網址沒有查詢，或後面是 `?request=`、`?request=` 加上 63 個十六進位字元、`?request=` 加上 P 的 SHA-256 的大寫寫法、`?x=1`，或 `?request=<P 的 SHA-256>&x=1`；同意和問結果的網址後面各帶 `?x=1`
- **THEN** 都被拒絕，原因是內容不對；申請 P 還在

#### Scenario: 同意的內容

- **WHEN** 同意 Casey 的內容是：0 bytes、`{}`、一個陣列、不是 JSON 的文字；少了七個欄位裡的任何一個；多帶 `"name":"Casey"`；`request` 是 63 或 65 個字元、大寫的十六進位，或數字；`senderKey` 是 31 bytes；`cursor` 是 -1、1.5 或文字 `0`；`snapshotId` 是 `snapshot`；`epoch` 是 0；`box` 是 40 bytes 或 65,537 bytes；`events` 是空的陣列、101 個事件、兩個事件 ID 相同的事件，或一個內容是 40 bytes 的事件
- **THEN** 都被拒絕，原因是內容不對；申請 P 還在，資料庫裡找不到「Casey」

#### Scenario: 拒絕帶了內容

- **WHEN** Taylor 的手機拒絕 Casey 的請求，網址帶著 P 的 SHA-256，另外帶著內容 `{}`
- **THEN** 被拒絕，原因是內容不對；申請 P 還在

#### Scenario: cursor 比群組最新的序號大

- **WHEN** Brisbane 有三個事件，Taylor 的手機用 cursor 4 同意 Casey
- **THEN** 被拒絕，原因是內容不對，不是沒有跟上

### Requirement: SHARING-182.2 同意的 API 的請求有不只一個問題時的原因

IF 同意的 API 的請求有不只一個會讓它被拒絕的問題，THEN the API SHALL 回報這個順序裡最前面的原因：對簽名的請求的檢查（SHARING-31.2）；寫法上的內容不對，也就是 SHARING-181.1 裡除了 `cursor` 的大小以外的每一項；不是成員（SHARING-180.1）；`cursor` 比群組最新的序號大的內容不對；沒有這個申請（SHARING-174.1）；沒有跟上（SHARING-176.1）；需要換鑰匙（SHARING-256.1）；鑰匙世代（SHARING-179.1）；沒有快照（SHARING-177.1）；成員手機滿了（SHARING-178.1）；群組滿了（SHARING-179.1）。問結果的請求在寫法之後照 SHARING-183.1 的順序。被對簽名的請求的檢查以外的原因拒絕的請求，已經通過那些檢查：它算進這支裝置的請求數（SHARING-37.1），原樣再送一次是重送（SHARING-36.1）；除此之外，每個群組、邀請、申請、快照和交接都和收到它之前一樣。

#### Scenario: 沒簽名或沒註冊

- **WHEN** 列出、同意、拒絕和問結果的請求，沒帶簽名的四個欄位，或由還沒註冊的手機簽名
- **THEN** 八個請求都被拒絕，原因是簽名，資料庫不變

#### Scenario: 寫法先於是不是成員

- **WHEN** 不是成員手機的手機同意 Casey，內容是 `{}`；拒絕 Casey 時帶了 `?x=1`
- **THEN** 都被拒絕，原因是內容不對

#### Scenario: 是不是成員先於申請的狀態

- **WHEN** 不是成員手機的手機同意一支沒有申請的手機
- **THEN** 被拒絕，原因是不是成員

#### Scenario: 沒有這個申請先於其他

- **WHEN** Brisbane 有三個事件、20 支成員手機；Taylor 的手機拒絕 Casey 之後，用 cursor 2、`epoch` 2 和沒有上傳過的快照 ID 同意 Casey
- **THEN** 被拒絕，原因是沒有這個申請

#### Scenario: 之後依序是沒有跟上、鑰匙世代、沒有快照、成員手機滿了

- **WHEN** Brisbane 有三個事件、20 支成員手機，申請 P 還在；Taylor 的手機用 cursor 2、`epoch` 2 和沒有上傳過的快照 ID 同意 Casey；把 cursor 改成 3 再送；再把 `epoch` 改成 1；再把快照 ID 改成 S 的
- **THEN** 四次的原因依序是沒有跟上、鑰匙世代、沒有快照、成員手機滿了

#### Scenario: cursor 太大先於沒有這個申請

- **WHEN** Brisbane 有三個事件；Taylor 的手機拒絕 Casey 之後，用 cursor 4 同意 Casey
- **THEN** 被拒絕，原因是內容不對，不是沒有這個申請

#### Scenario: 成員手機滿了先於群組滿了

- **WHEN** Brisbane 有 20 支成員手機，存著的事件的大小離上限只剩 199 bytes；Taylor 的手機帶著 200 bytes 的 E 同意 Casey
- **THEN** 被拒絕，原因是成員手機滿了，不是群組滿了

#### Scenario: 被拒絕的請求用掉了 nonce，也算進請求數

- **WHEN** Taylor 的手機拒絕一支沒有申請的手機，被拒絕，原因是沒有這個申請；同一個請求原樣再送一次
- **THEN** 第二次被拒絕，原因是重送

#### Scenario: 需要換鑰匙排在沒有跟上之後，鑰匙世代之前

- **WHEN** Brisbane 有三個事件，另一支成員手機退出了，申請 P 還在；Taylor 的手機用 cursor 2、`epoch` 2 和 S 的快照 ID 同意 Casey；把 cursor 改成 3 再送
- **THEN** 兩次的原因依序是沒有跟上和需要換鑰匙；申請 P 還在

### Requirement: SHARING-183.1 申請的手機問結果

WHEN 註冊過的手機送問結果的請求，the API SHALL 照這個順序回答最前面符合的那一種：API 存著這支手機用這個代號被同意的交接時，回答同意了，回應是 `state` 為 `approved`，加上群組 ID、同意的裝置 ID（`deviceId`）、交出方的 box 公開金鑰（`senderKey`）、鑰匙世代（`epoch`）和 box，邀請過期或被撤回之後也一樣；代號不是有效的邀請的代號時，拒絕，原因是沒有這個邀請（404），API 沒見過的代號、過期的和撤回的邀請得到的回應一模一樣；這支手機是那個邀請的群組的成員手機時，拒絕，原因是已經是成員（409）；這支手機在這個邀請有申請時，回答 `{"state":"waiting"}`；其他情況回答 `{"state":"none"}`。回應帶著 `Cache-Control: no-store`。問結果不改任何東西，同一個結果可以再問。

#### Scenario: 還在等

- **WHEN** Casey 的手機送 `GET /invites/3q2-7wEjRWeJq83vEjRWeA/request`
- **THEN** API 回 200，回應是 `{"state":"waiting"}`，標頭有 `Cache-Control: no-store`；資料庫裡申請 P 仍剛好一份

#### Scenario: 沒有申請

- **WHEN** 一支沒有申請過的手機問代號 A 的結果；或 Casey 的手機取消申請之後再問；或 Taylor 的手機拒絕 Casey 之後 Casey 的手機再問
- **THEN** 回應都是 `{"state":"none"}`，三種情況一模一樣

#### Scenario: 同意了

- **WHEN** Taylor 的手機同意 Casey 之後，Casey 的手機問代號 A 的結果，再問一次
- **THEN** 兩次的回應都是 `{"state":"approved","groupId":"9b2f6c1e-8d47-4f3a-b1c5-2e7d90a4f6b8","deviceId":"0f8fad5b-d9cb-469f-a165-70867728950e","senderKey":"<K 的十六進位>","epoch":1,"box":"<B 的十六進位>"}`

#### Scenario: 同意之後邀請過期或被撤回

- **WHEN** Taylor 的手機同意 Casey 之後撤回代號 A；或 API 的時間到了 T+604,800,000；Casey 的手機問代號 A 的結果
- **THEN** 仍回答同意了，內容和上一個 scenario 一樣

#### Scenario: 邀請不再有效

- **WHEN** Casey 的手機沒有被同意；代號 A 的邀請被撤回，或過期了；Casey 的手機問代號 A 的結果，再問 API 沒見過的代號 C 的結果
- **THEN** 都被拒絕，原因是沒有這個邀請（404），回應一模一樣

#### Scenario: 成員手機

- **WHEN** Taylor 的手機問代號 A 的結果
- **THEN** 被拒絕，原因是已經是成員（409），回應是 `{"error":"already-a-member"}`

#### Scenario: 成員手機問不再有效的代號

- **WHEN** Taylor 的手機撤回了代號 A，或 API 的時間到了 T+604,800,000；Taylor 的手機問代號 A 的結果
- **THEN** 被拒絕，原因是沒有這個邀請，不是已經是成員

#### Scenario: 別的邀請的結果

- **WHEN** Taylor 的手機另外建立了 Tokyo 和它代號 B 的邀請；Casey 的手機在代號 A 被同意之後，問代號 B 的結果
- **THEN** 回應是 `{"state":"none"}`

### Requirement: SHARING-185.1 新手機下載到事件之後，API 不再存著交接

WHEN 被同意的手機下載那個群組的事件並得到一頁（SYNC-58.1），the API SHALL 不再存著它在那個群組的交接：box 和交出方的 box 公開金鑰都不留在資料庫裡。手機 app 匯入了快照才下載事件（SYNC-111.1），匯入要用 box 裡的群組鑰匙，所以這時它已經用不到交接。之後它問那個代號的結果時照 SHARING-183.1：邀請還有效時被拒絕，原因是已經是成員。被拒絕的下載、需要快照的回答（SYNC-136.2）、別支手機的下載和這支手機的上傳都不刪。

#### Scenario: 下載之後

- **WHEN** Taylor 的手機同意 Casey 之後，Casey 的手機從 cursor 0 下載 Brisbane 的事件；再問代號 A 的結果
- **THEN** 下載得到一頁；資料庫裡找不到 B 和 K，不論是原始的 bytes、十六進位還是 Base64；問結果被拒絕，原因是已經是成員

#### Scenario: 不刪的情況

- **WHEN** Taylor 的手機同意 Casey 之後：Taylor 的手機下載 Brisbane 的事件；Casey 的手機上傳一個事件；Casey 的手機送一個沒有帶 cursor 的下載
- **THEN** 資料庫裡 B 仍剛好一份；Casey 的手機問結果仍得到同意了

#### Scenario: 需要快照的回答

- **WHEN** Taylor 的手機同意 Casey 之後，Brisbane 的事件在清除裡都刪了，群組清到的序號比 0 大；Casey 的手機從 cursor 0 下載 Brisbane 的事件
- **THEN** 得到需要快照的回答（SYNC-136.2）；資料庫裡 B 仍剛好一份，Casey 的手機問結果仍得到同意了

### Requirement: SHARING-186.1 關於同意和拒絕，API 只存交接

The API SHALL 關於一次同意只存 SHARING-173.2 說的東西：請求帶的事件、新的成員手機和它的進度（sync），以及交接的代號、兩個裝置 ID、交出方的 box 公開金鑰、鑰匙世代和 box；請求帶的申請內容的 SHA-256、同意了的申請的內容、被拒絕的同意帶的 box、公開金鑰和事件，和請求的其他標頭都不存。一次拒絕什麼都不存。邀請的字串和從它導出的值不在任何請求裡，所以 API 打不開 box，也沒有打開 box 要用的 salt（SHARING-198.1）。

#### Scenario: 同意之後的資料庫

- **WHEN** Taylor 的手機同意 Casey，請求帶著 `User-Agent: TaylorsPhone/1.0` 和 `X-Member-Name: Casey-Lee`
- **THEN** 資料庫裡找得到 B、K 和 E 的內容，各剛好一份；找不到申請 P、P 的 SHA-256、`TaylorsPhone` 和 `Casey-Lee`

#### Scenario: 被拒絕的同意

- **WHEN** Taylor 的手機用 cursor 0 同意 Casey，而 Brisbane 有三個事件；或用沒有上傳過的快照 ID 同意 Casey
- **THEN** 資料庫裡找不到這兩個請求帶的 box、公開金鑰和事件的內容，不論是原始的 bytes、十六進位還是 Base64

#### Scenario: 拒絕之後的資料庫

- **WHEN** Taylor 的手機拒絕 Casey
- **THEN** 除了這個請求的紀錄，資料庫沒有多出任何值；找不到申請 P

### Requirement: SHARING-187.1 同樣的路徑配上別的方法，不是同意的 API 的請求

IF 簽名的請求打 `/groups/<群組 ID>/requests` 而方法不是 `GET`，打 `/groups/<群組 ID>/requests/<裝置 ID>` 而方法不是 `DELETE`，或打 `/groups/<群組 ID>/requests/<裝置 ID>/approval` 而方法不是 `POST`，THEN the API SHALL 把它當成路徑沒有路由的請求，回答找不到，不改任何申請。`HEAD` 也一樣：它不是列出申請。

#### Scenario: 別的方法

- **WHEN** Taylor 的手機對 `/groups/9b2f6c1e-8d47-4f3a-b1c5-2e7d90a4f6b8/requests` 送 `HEAD`、`POST` 和 `DELETE`；對 `/groups/9b2f6c1e-8d47-4f3a-b1c5-2e7d90a4f6b8/requests/7c9e6679-7425-40de-944b-e07fc1f90ae7` 送 `GET`、`HEAD`、`PUT` 和帶著同意的內容的 `POST`；對它後面加上 `/approval` 的路徑送 `GET`、`HEAD`、`DELETE` 和帶著同意的內容的 `PUT`
- **THEN** 十一個請求都得到找不到（404），不是任何一種拒絕；申請 P 還在，Casey 的手機不是成員手機

### Requirement: SHARING-188.1 申請的手機換內容或取消，和成員的同意同時到時，只有一邊成功

WHEN 一支手機重送申請（SHARING-113.1）或取消申請（SHARING-117.2）的請求，和成員手機同意它的請求同時送到，the API SHALL 只讓其中一邊成功。同意成功時，另一個請求被拒絕，原因是已經是成員：那支手機是成員手機，API 沒有存著它的申請。另一個請求成功時，同意被拒絕，原因是沒有這個申請：那支手機不是成員手機，重送的新內容還在，取消的話它沒有申請。所以 API 不會照成員沒看過的內容同意，也不會有成員手機還留著申請。

#### Scenario: 重送和同意同時

- **WHEN** 五個群組各有一個申請 P 和給申請的手機的完整快照；申請的手機重送內容 Q，Taylor 的手機同時用 P 的 SHA-256 同意它
- **THEN** 每個群組都是這兩種之一：同意好了，重送被拒絕，原因是已經是成員，那支手機是成員手機，資料庫裡找不到 P 和 Q；或重送送出了，同意被拒絕，原因是沒有這個申請，那支手機不是成員手機，列出申請得到 Q

#### Scenario: 取消和同意同時

- **WHEN** 五個群組各有一個申請 P 和它的完整快照；申請的手機取消申請，Taylor 的手機同時同意它
- **THEN** 每個群組都是這兩種之一：同意好了，取消被拒絕，原因是已經是成員，那支手機是成員手機；或取消好了，同意被拒絕，原因是沒有這個申請，那支手機不是成員手機，沒有申請

### Requirement: SHARING-190.2 同步之後和打開 Members 時列出申請

WHEN 一個未封存的共同帳本的一次同步結束，而這次同步開頭的下載做完了（SYNC-69.2），或使用者打開它的 Members，the mobile app SHALL 列出它的申請：送列出申請的請求（SHARING-170.1），API 說之後還有時，帶著那一頁最後一個申請的裝置 ID 接著列（SHARING-171.1），到 API 說之後沒有為止；列完之後，收到的申請就是這一次讀得懂的那些（SHARING-191.2），取代上一次的。同步之後列不列，只看同步開頭的下載，也就是上傳之前的那些下載：它做完了，這次同步結束時就列出，之後的上傳沒有得到確認、上傳之後的下載（SYNC-160.2）沒有得到回應，或替別支成員手機上傳的快照（SYNC-166.1）沒有上傳好，都照列；同步開頭的下載沒有做完的同步不列出。IF 這支手機沒有存著這個共同帳本還沒到期的邀請，也就是校正後的時間比到期時間早的邀請，THEN the mobile app SHALL 不送列出的請求，收到的申請是空的：沒有邀請的字串，它解不開任何申請。IF 列出的請求沒有得到回應、被拒絕，或回應看不懂，THEN the mobile app SHALL 讓收到的申請和列出之前一樣，不顯示任何提示。封存的共同帳本不列出，收到的申請是空的。有申請正在處理的共同帳本（SHARING-202.1）也不列出，同步之後和打開 Members 時都一樣，所以處理到一半時收到的申請不會被換掉；處理完之後照 SHARING-199.1 到 SHARING-201.1，之後的同步和打開 Members 照常列出。

#### Scenario: app 打開之後

- **WHEN** Dana 申請當新成員之後，Taylor 的手機重新啟動 app
- **THEN** API 在 Brisbane 的下載之後收到一個 `GET /groups/<Brisbane 的群組 ID>/requests`；Brisbane 的畫面上有「1 person wants to join」（GROUPS-130.1）

#### Scenario: 上傳之後的下載沒有得到回應

- **WHEN** Dana 申請當新成員之後，Taylor 的手機同步，上傳了自己的一個事件；API 確認了上傳，上傳之後的下載沒有得到回應
- **THEN** 這次同步結束之前 API 沒有收到列出申請的請求，結束時收到一個；Brisbane 的畫面上有「1 person wants to join」

#### Scenario: 打開 Members

- **WHEN** Members 關著時 Dana 申請當新成員；Taylor 的手機沒有同步，打開 Brisbane 的 Members
- **THEN** API 多收到一個列出申請的請求；Members 的申請那一區有 Dana 那一列

#### Scenario: 接著列

- **WHEN** API 對列出的請求回答一頁，說之後還有，最後一個申請的裝置 ID 是 D
- **THEN** API 接著收到 `GET /groups/<Brisbane 的群組 ID>/requests?after=<D>`；兩頁裡讀得懂的申請都是收到的申請

#### Scenario: 沒有還沒到期的邀請

- **WHEN** Brisbane 的邀請被撤回之後同步；或手機的時鐘到了邀請的到期時間之後同步；或另一個共同帳本 Tokyo 從來沒有收過別人的邀請以外的事件、這支手機沒有存著它的邀請
- **THEN** API 沒有收到列出那個群組的申請的請求；它的畫面沒有申請的按鈕

#### Scenario: 列出沒有成功

- **WHEN** 收到的申請有 Dana 的；之後手機沒有網路，或 API 對列出的請求回 500，使用者打開 Members
- **THEN** 沒有跳出提示框；Members 仍有 Dana 那一列

#### Scenario: 申請不見了

- **WHEN** 收到的申請有 Dana 的；Dana 的手機取消了申請，Taylor 的手機再同步
- **THEN** Brisbane 的畫面沒有申請的按鈕，Members 沒有申請那一區

#### Scenario: 封存的共同帳本

- **WHEN** Taylor 的手機封存了 Brisbane，Dana 申請當新成員，Taylor 的手機重新啟動 app
- **THEN** API 沒有收到列出 Brisbane 的申請的請求；還原 Brisbane 之後打開它的 Members，才收到

#### Scenario: 處理到一半

- **WHEN** 收到的申請有 Dana 的；在她的選單按「Approve」，API 還沒回答同意的請求時，app 從背景回到前景並同步
- **THEN** 從按下去到 API 回答之前，API 沒有收到列出申請的請求；回答同意好了之後才收到一個

### Requirement: SHARING-191.2 用邀請的字串解開申請

WHEN 列出申請，the mobile app SHALL 用這支手機替這個共同帳本存著的、代號和那個申請相同的邀請的字串解開它：申請金鑰和附加資料照 SHARING-135.2，附加資料裡的裝置 ID 是 API 說的那個申請的裝置 ID。解開的明文去掉結尾的空格之後是一個 JSON 物件，`name` 是去掉頭尾空白後不是空的字串，`memberId` 是 `null` 或小寫的第 4 版 UUID，`userId` 是小寫的第 4 版 UUID，`boxKey` 是 64 個小寫十六進位字元、不是低階的 box 公開金鑰（SHARING-11.1），`takeover` 這個欄位沒有，或它的值是 `true` 而 `memberId` 不是 `null`，別的多出來的欄位不看：這樣的是讀得懂的申請，成為收到的申請，申請的名字是 `name` 去掉頭尾空白後的文字。`takeover` 是 `true` 的是要接手的申請（SHARING-135.2），沒有這個欄位的不是：手機 app 不照名冊猜一個申請是不是要接手，所以申請送出之後選的成員才有了手機時，它不會變成接手（SHARING-194.2）。

#### Scenario: 當新成員

- **WHEN** Dana 申請當新成員，列出申請
- **THEN** 收到的申請有一個：名字是「Dana」，要當新成員；Members 上它那一列是「Dana」和「Wants to join as a new member」（GROUPS-131.2）

#### Scenario: 選了成員

- **WHEN** Dana 申請當 Casey，申請的 `name` 是「 Dana K. 」，列出申請
- **THEN** 那一列是「Dana K.」和「Wants to join as Casey」

#### Scenario: 多出來的欄位

- **WHEN** Dana 的申請的明文另外有 `"note":"hi"`
- **THEN** 它是收到的申請

#### Scenario: 要接手

- **WHEN** 新手機申請接手 Dana，列出申請
- **THEN** 收到的申請有一個，是要接手的申請：Members 上它那一列是「Dana K.」和「Wants to take over Dana」（GROUPS-131.2）

#### Scenario: takeover 寫得不對

- **WHEN** 申請解得開，明文的 `takeover` 是 `false`、文字 `yes`、數字 1 或 `null`；或 `takeover` 是 `true` 而 `memberId` 是 `null`
- **THEN** 每一種都不是收到的申請，手機各替它送一個拒絕的請求（SHARING-192.1）

### Requirement: SHARING-192.1 讀不懂的申請不顯示，並替它送拒絕

IF 列出的一個申請用那個邀請的字串解不開（SHARING-3.1），或解開的不是 SHARING-191.2 說的內容，THEN the mobile app SHALL 不把它當成收到的申請，並替它送拒絕的請求（SHARING-172.1），網址的 `request` 是列出的那一份內容的 SHA-256，不問使用者，也不顯示任何提示：只知道代號、沒有連結的字串的人塞進來的申請，才不會一直佔著邀請的 20 個位置。拒絕沒成功時不再試，下次列出時它還在就再送。IF 申請的密文是這支手機不認得的格式版本（SHARING-4.2），或這支手機沒有存著那個代號的邀請，THEN the mobile app SHALL 不顯示它，也不替它送拒絕：別的成員的手機可能讀得懂。

#### Scenario: 解不開的申請

- **WHEN** API 列出三個申請：D 的是 `0x01` 加上 296 個隨機的 bytes，第一個 byte 是這支手機認得的格式版本；裝置 ID `11111111-1111-4111-8111-111111111111` 的是用別的字串的申請金鑰加密的；`22222222-2222-4222-8222-222222222222` 的是 Dana 替 D 加密的那一份，被搬到這個裝置 ID 底下
- **THEN** 收到的申請是空的，Brisbane 的畫面沒有申請的按鈕；API 收到三個拒絕的請求，各拒絕其中一支手機；沒有跳出提示框

#### Scenario: 內容不對

- **WHEN** 申請解得開，明文是：不是 JSON 的文字；`name` 是「   」；`memberId` 是 `casey`；少了 `userId`；`boxKey` 是 63 個字元，或是 64 個 `0`
- **THEN** 每一種都不是收到的申請，手機各替它送一個拒絕的請求

#### Scenario: 讀得懂的照常顯示

- **WHEN** API 列出 D 的讀得懂的申請和一個解不開的申請
- **THEN** 收到的申請只有 Dana 的；API 只收到拒絕另一個的請求

#### Scenario: 不認得的格式版本和沒有邀請

- **WHEN** 一個申請的第一個 byte 是 `0x02`；或 API 列出的申請的代號是這支手機沒有存著的代號 B
- **THEN** 都不是收到的申請；API 沒有收到拒絕的請求

#### Scenario: 拒絕沒成功

- **WHEN** 解不開的申請的拒絕請求沒有得到回應；之後再同步，API 仍列出它
- **THEN** 第一次沒有跳出提示框，也沒有再送；第二次列出之後 API 又收到一個拒絕它的請求

### Requirement: SHARING-193.1 收到的申請不存進本機資料

The mobile app SHALL 不把收到的申請寫進本機資料：申請的名字、選的成員、使用者 ID 和 box 公開金鑰只留在記憶體裡，所以重新啟動 app 之後、下一次列出之前沒有收到的申請，匯出檔（backup）也不帶著它們。

#### Scenario: 列出之後的本機資料

- **WHEN** 名字是「Dana K.」的 Dana 申請當新成員，Taylor 的手機列出申請
- **THEN** 本機資料的檔案裡找不到「Dana K.」、Dana 的使用者 ID 和她的 box 公開金鑰

#### Scenario: 重新啟動之後

- **WHEN** 接著手機沒有網路，重新啟動 app，打開 Brisbane 的畫面和 Members
- **THEN** 沒有申請的按鈕，也沒有申請那一區

### Requirement: SHARING-194.2 不能同意的申請

WHILE 收到的申請是下面任何一種，the mobile app SHALL 不讓它被同意：它的選單沒有「Approve」，內容是那個原因的那一句（GROUPS-132.2），照本機資料現在的樣子判斷，依序看最前面符合的。選的成員不是這個共同帳本的成員，例如被移出了：「The member this request chose is no longer in this group. This request can't be approved.」。選的成員是你自己，要接手的申請也一樣：「You're already in this group as <成員名稱>. This request can't be approved.」。不是要接手的申請，而選的成員已經有手機，也就是存著使用者 ID（SYNC-251.2）：「<成員名稱> has already joined from another phone. This request can't be approved.」。要接手的申請，而名冊裡沒有別支手機的紀錄代表選的成員（SYNC-251.2，不看那筆紀錄的使用者 ID）：「<成員名稱> hasn't joined from a phone, so there is nothing to take over. This request can't be approved.」。要當新成員，而共同帳本已經有 20 位以上的成員（GROUPS-105.1）：「A shared group can have up to 20 members. This request can't be approved.」。要當新成員，而申請的名字和一位成員同名（groups），有沒有手機的都算：「This group already has a member named <成員名稱>. This request can't be approved.」。要接手的申請，選的成員是別支手機代表的成員、又不是你自己時可以同意，同意它是接手（SHARING-322.1）。你自己的成員從建立群組或加入起就存著你的使用者 ID，名冊裡還沒有這支手機的紀錄時也一樣，所以選了一位有手機的成員、卻不是要接手的申請，在每一支成員手機上都不能同意；要接手你的申請，要別的成員的手機才能同意。同意的人不能替它改選，也不能把它改成接手或改成不是接手：申請的手機問結果時會發現，並請使用者重選（SHARING-212.2）。

#### Scenario: 選的成員已經有手機

- **WHEN** Dana 申請當 Casey；之後這支手機套用代表 Casey 的別支手機的名冊紀錄，再點 Dana 那一列
- **THEN** 選單的內容是「Casey has already joined from another phone. This request can't be approved.」，按鈕只有「Decline」和「Cancel」

#### Scenario: 選的成員是你自己

- **WHEN** Taylor 的手機還沒有同意過任何人，Brisbane 沒有名冊紀錄；Dana 的申請的 `memberId` 是 Taylor 的成員 ID；點 Dana 那一列
- **THEN** 那一列是「Dana」和「Wants to join as Taylor」；選單的內容是「You're already in this group as Taylor. This request can't be approved.」，按鈕只有「Decline」和「Cancel」

#### Scenario: 選的成員被移出了

- **WHEN** Dana 申請當 Blake，之後 Blake 被移出 Brisbane
- **THEN** 選單的內容是「The member this request chose is no longer in this group. This request can't be approved.」，沒有「Approve」

#### Scenario: 和成員同名

- **WHEN** Dana 申請當新成員，名字是「 casey 」
- **THEN** 選單的內容是「This group already has a member named Casey. This request can't be approved.」，沒有「Approve」

#### Scenario: 已經有 20 位成員

- **WHEN** Brisbane 有 20 位成員，Dana 申請當新成員；另一支手機申請當其中一位沒有手機的成員
- **THEN** Dana 的選單的內容是「A shared group can have up to 20 members. This request can't be approved.」，沒有「Approve」；另一個申請的選單有「Approve」

#### Scenario: 可以同意的申請

- **WHEN** Dana 申請當新成員，名字是「Dana」
- **THEN** 選單的內容是「They'll see this group's expenses and can add and change them.」，按鈕是「Approve」、「Decline」和「Cancel」

#### Scenario: 要接手別支手機代表的成員

- **WHEN** 新手機申請接手 Dana，點那一列
- **THEN** 選單的內容是「Dana K. wants to take over Dana. Dana's current phone will lose access to this group right away.」，按鈕是「Approve」、「Decline」和「Cancel」（GROUPS-132.2）

#### Scenario: 要接手你自己

- **WHEN** 新手機的申請要接手的是 Taylor，也就是這支手機自己的成員；點那一列
- **THEN** 選單的內容是「You're already in this group as Taylor. This request can't be approved.」，按鈕只有「Decline」和「Cancel」

#### Scenario: 要接手的成員沒有手機

- **WHEN** 新手機的申請要接手的是沒有手機的 Casey
- **THEN** 選單的內容是「Casey hasn't joined from a phone, so there is nothing to take over. This request can't be approved.」，沒有「Approve」

#### Scenario: 要接手的成員的手機離開了

- **WHEN** 新手機申請接手 Dana；之後 Dana 的手機退出，這支手機替群組換了鑰匙，Dana 是前成員
- **THEN** 選單的內容是「The member this request chose is no longer in this group. This request can't be approved.」，沒有「Approve」

#### Scenario: 申請送出之後選的成員才有了手機

- **WHEN** Dana 的手機還沒加入時，新手機申請當沒有手機的 Casey，不是要接手；之後另一支手機被同意代表 Casey，這支手機套用了它的名冊紀錄
- **THEN** 選單的內容是「Casey has already joined from another phone. This request can't be approved.」，沒有「Approve」：它沒有變成接手

### Requirement: SHARING-195.2 按 Approve 時同步、上傳快照，再送同意

WHEN 使用者在申請的選單按「Approve」，the mobile app SHALL 依序做這些事，前一步沒做成就不做下一步：同步這個共同帳本（SYNC-68.2），這次同步上傳了事件時再同步一次，讓這支手機的 cursor 到自己剛上傳的事件之後：第一次同步上傳之後的下載（SYNC-160.2）沒有得到回應時也照樣再同步，同步做成了沒有，只看最後這一次：它開頭的下載做完了，而且它不是停在一個沒有得到回應的請求，就是做成了（SHARING-200.2）；然後在同一個 SQLite transaction 裡，照那一刻的本機資料再看一次這個申請能不能同意（SHARING-194.2）、記下這支手機在這個共同帳本的 cursor、備好同意要寫下的事件（SHARING-196.2），並讀出快照的內容（SHARING-197.1、SYNC-114.3）；替申請的手機上傳那份快照；送同意的請求（SHARING-173.2），路徑帶著群組 ID 和申請的裝置 ID，`request` 是選單打開時那一列的申請的內容的 SHA-256，`cursor` 是那個 transaction 裡記下的 cursor，也就是那份快照涵蓋的序號，`snapshotId` 是剛上傳的那份快照的，`epoch` 是這支手機在這個共同帳本的鑰匙世代，`senderKey` 和 `box` 照 SHARING-198.1。所以檢查、事件、快照和 `cursor` 是同一刻的：這之後別的同步——app 回到前景，或存下變更——讓這支手機的 cursor 往前了，送出的仍是記下的那一個，API 就說沒有跟上（SHARING-176.1），這支手機照 SHARING-200.2 再看一次，不會照它沒有檢查過的資料同意。`request` 指名的是成員看到的那一份：申請的手機在選單打開之後換了內容，API 就說沒有這個申請（SHARING-174.1）。上傳快照和送同意的請求的這段時間，這個共同帳本照常同步（SYNC-88.1、SYNC-89.1），不等同意做完。API 回答同意好了之前，本機資料不因為這次同意而變：沒有多的成員、名冊紀錄和待上傳的事件。

#### Scenario: 同意 Dana

- **WHEN** Dana 申請當新成員，Taylor 的手機在她的選單按「Approve」
- **THEN** API 依序收到：Brisbane 的下載；給 D 的快照的每一塊；一個 `POST /groups/<Brisbane 的群組 ID>/requests/<D>/approval`，它的 `request` 是 Dana 的申請的內容的 SHA-256，`cursor` 等於那份快照涵蓋的序號，`snapshotId` 是那份快照的，`epoch` 是 1

#### Scenario: 同意之前先上傳自己的變更

- **WHEN** Taylor 的手機沒有網路時新增了 Dinner；有網路之後列出申請，同意 Dana
- **THEN** 同意的請求送出之前，Dinner 的事件已經上傳，這支手機也下載過它；那份快照有 Dinner，涵蓋的序號是 Dinner 的事件的序號

#### Scenario: 上傳之後的下載沒有得到回應

- **WHEN** Taylor 的手機沒有網路時新增了 Lunch；有網路之後列出申請，同意 Dana；API 確認了 Lunch 的上傳，上傳之後的下載沒有得到回應
- **THEN** 這支手機再同步一次，下載到 Lunch 的事件；之後上傳快照，只送一個同意的請求，API 回答同意好了

#### Scenario: API 回答之前

- **WHEN** API 還沒回答同意的請求
- **THEN** Members 的成員仍是 Taylor、Casey 和 Blake；本機資料沒有 Dana，沒有名冊紀錄，沒有待上傳的事件

#### Scenario: 檢查之後別的同步下載到新的事件

- **WHEN** Dana 申請當 Casey；按「Approve」之後，API 還沒回答上傳快照的請求時，別支手機上傳了代表 Casey 的名冊紀錄，app 從背景回到前景並同步；之後 API 才回答上傳快照的請求
- **THEN** 同意的請求的 `cursor` 等於那份快照涵蓋的序號，比群組最新的序號小 1，API 拒絕它，原因是沒有跟上；這支手機沒有再送同意的請求，跳出「Unable to Approve」，訊息是「Casey has already joined from another phone. This request can't be approved.」；Dana 的手機不是成員手機

#### Scenario: 選單打開之後申請換了內容

- **WHEN** Dana 申請當新成員，Taylor 的手機打開她的選單；這時 Dana 的手機把申請換成當 Casey，Taylor 的手機的 app 從背景回到前景，同步並列出申請；之後在還開著的選單按「Approve」
- **THEN** 同意的請求的 `request` 是原本那一份內容的 SHA-256，API 拒絕它，原因是沒有這個申請；跳出「Unable to Approve」，訊息是「This request has already been answered.」；Members 的申請那一區是「Dana」和「Wants to join as Casey」那一列，Dana 的手機不是成員手機

### Requirement: SHARING-196.2 同意帶著新成員和名冊紀錄的事件

WHEN 送同意的請求，the mobile app SHALL 讓 `events` 依序是這些紀錄的第一個事件，各照 SYNC-67.1 用群組鑰匙加密，各有新的事件 ID：這支手機自己的名冊紀錄，本機資料的名冊裡還沒有它時才有，代表的是你的成員 ID、你的使用者 ID 和這支手機的 box 公開金鑰；新成員的成員紀錄，要當新成員的申請才有，成員 ID 是新的小寫第 4 版 UUID，名稱是申請的名字，沒有被移出群組（SYNC-34.1）——使用者為這個申請按了「Add Back」時（SHARING-288.1），這一個換成把那位前成員加回來的事件，只把他的「是否被移出群組」改成否，帶著根據的版本，不改他的名稱；申請的手機的名冊紀錄，紀錄的 ID 是申請的裝置 ID，代表的是選的成員、那位新成員或加回來的那位前成員的成員 ID，和申請的 `userId` 和 `boxKey`（SYNC-250.2）。每個事件的格式版本是 1，判定為可以套用，時間戳記是用校正後的時間和這支手機的裝置 ID 取的新時間戳記（SYNC-2.1），一個接一個；取的時候就記下手機看過的最新時間戳記，所以同意沒成功時，這些時間戳記也不會再給別的變更。它們和待上傳的事件一樣，檢查過才放進快照和同意的請求（SYNC-84.1、SYNC-85.1）：比取的那一刻校正後的時間超前超過 300,000 毫秒的，照 SYNC-85.1 換成新的時間戳記，換完之後手機看過的最新時間戳記是最後換上的那一個。手機看過的最新時間戳記超前、卻沒有紀錄記著它時才會這樣；不換的話，時間戳記比收到時間晚超過 10 分鐘的事件每支手機都不套用（SYNC-9.1），API 卻已經把申請的手機記成成員手機，名冊裡沒有它。

#### Scenario: 第一次同意，當新成員

- **WHEN** 手機的時鐘和 API 的時間是 T+60,000，Taylor 的手機第一次同意別人，同意的是 Dana 當新成員的申請
- **THEN** 同意的請求有三個事件，用 Brisbane 的群組鑰匙解得開，依序是：名冊紀錄，ID 是這支手機的裝置 ID，代表 Taylor 的成員 ID、Taylor 的使用者 ID 和這支手機的 box 公開金鑰；成員紀錄，ID 是新的小寫第 4 版 UUID，名稱「Dana」，沒有被移出群組；名冊紀錄，ID 是 D，代表那個新的成員 ID、Dana 的使用者 ID 和她的 box 公開金鑰。三個事件都沒有根據的版本，時間戳記依序是 `T+60000/0/<這支手機的裝置 ID>`、計數器 1 和計數器 2 的

#### Scenario: 選了成員

- **WHEN** Taylor 的手機第一次同意別人，同意的是 Dana 當 Casey 的申請
- **THEN** 同意的請求有兩個事件：這支手機自己的名冊紀錄，和 D 的名冊紀錄，代表 Casey 的成員 ID；沒有成員紀錄

#### Scenario: 把前成員加回來

- **WHEN** Casey 是 Brisbane 的前成員；Taylor 的手機同意過別人之後，同意一個要當新成員、名字是「Casey」的申請，在提示框按了「Add Back」（SHARING-288.1）
- **THEN** 同意的請求有兩個事件：Casey 的成員紀錄的事件，只有「是否被移出群組」這個單位，值是否，根據的版本是他被移出的那個時間戳記；申請的手機的名冊紀錄，代表 Casey 原本的成員 ID。沒有新的成員紀錄

#### Scenario: 名冊裡已經有自己

- **WHEN** Taylor 的手機同意過 Dana 之後，另一支手機 E 申請當 Blake，Taylor 的手機同意它
- **THEN** 同意的請求只有一個事件：E 的名冊紀錄

#### Scenario: 時間戳記不再給別的變更

- **WHEN** 同意 Dana 的請求沒有得到回應；之後在同一個毫秒把 Brisbane 改名
- **THEN** 改名的事件的時間戳記比那三個事件的都晚

#### Scenario: 看過的最新時間戳記超前 9 分鐘

- **WHEN** Taylor 的手機同意過 Dana，Dana 的手機加入了；Dana 的手機上傳了兩個事件：永久刪除一筆 Taylor 的手機沒有的支出的，和時間戳記比 API 的時間晚 9 分鐘、改那筆支出的標題的（SYNC-85.1 的同一個情境）；Taylor 的手機同步之後，同意另一支手機當 Blake 的申請
- **THEN** 同意的請求只有一個事件，它的時間戳記的毫秒是這時校正後的時間加 1，計數器是 0，不是晚 9 分鐘的那一毫秒；快照裡那筆名冊紀錄的時間戳記和它一樣

#### Scenario: 看過的最新時間戳記超前一小時

- **WHEN** Taylor 的手機的時鐘被調成 T+3,660,000 之後新增 Dinner，這時留下本機資料的複本；同步之後本機資料換回那份複本，再同步到沒有待上傳的事件；API 的時間是 T+240,000 時同意 Dana 當新成員的申請，Dana 的手機加入，兩支手機都同步
- **THEN** 同意的請求的三個事件，時間戳記的毫秒都不比 T+240,000 晚超過 300,000；兩支手機上 Brisbane 的成員都有 Dana，兩支手機的 Brisbane 一模一樣，都沒有不套用的事件的紀錄

### Requirement: SHARING-197.1 同意時上傳的快照帶著同意要寫下的紀錄

WHEN 同意時替申請的手機上傳快照，the mobile app SHALL 照 SYNC-114.3 到 SYNC-120.1 上傳，收件的裝置 ID 是申請的裝置 ID；快照的紀錄除了本機資料替這個共同帳本記著的每一筆，另外有 SHARING-196.2 那些事件的紀錄：每個單位的值和時間戳記、建立的時間戳記都是那個事件的，不是群組變成共同帳本時就有的紀錄。所以新手機匯入快照就有自己的名冊紀錄和它代表的成員，之後下載到那些事件時什麼都不變（SYNC-126.1）。IF 上傳快照回報有待上傳的事件、沒有鑰匙、快照太大、快照存滿了或失敗（SYNC-115.1、SYNC-118.1、SYNC-120.1），THEN the mobile app SHALL 不送同意的請求（SHARING-200.2）。

#### Scenario: 快照有新成員和兩筆名冊紀錄

- **WHEN** Taylor 的手機第一次同意別人，同意的是 Dana 當新成員的申請
- **THEN** 給 D 的快照解開之後，紀錄裡有成員 Dana 和兩筆名冊紀錄，每個單位的值和時間戳記都和同意的請求裡那三個事件的一樣；其餘的紀錄是 Taylor 的手機原本的每一筆

#### Scenario: 快照傳不上去

- **WHEN** 上傳快照的第 0 塊被拒絕，原因是快照存滿了
- **THEN** API 沒有收到同意的請求；跳出「Unable to Approve」（SHARING-200.2）

### Requirement: SHARING-198.1 群組鑰匙裝在只有申請的手機打得開的 box 裡

WHEN 送同意的請求，the mobile app SHALL 讓 `box` 是這樣裝的 box（SHARING-8.1）：交出方的私鑰是這支手機的 box 私鑰（SHARING-136.1），`senderKey` 是它的公開金鑰；收受方的公開金鑰是申請的 `boxKey`；salt 是交接的 salt，也就是從邀請的字串那 32 bytes 導出的金鑰，用途是 `shared-expense/invite/handover/v1`，導出時不給 salt（SHARING-12.1）；情境是四行以換行（`0x0A`）相連、最後一行後面沒有換行的 UTF-8：`shared-expense/invite/handover/v1`、邀請的代號、群組 ID，和 `epoch` 的十進位寫法；nonce 是 `expo-crypto` 給的 24 bytes，每次都是新的。box 的內容是 JSON 物件 `{"keys":[{"epoch":<鑰匙世代>,"key":"<群組鑰匙的 64 個小寫十六進位字元>"}]}`（`JSON.stringify`，沒有多餘的空白，UTF-8）：從那份快照的鑰匙世代到 `epoch` 的每一把群組鑰匙各一項，依世代由小到大。沒有邀請的字串的人算不出交接的 salt，所以 API 換掉公開金鑰或 box，申請的手機就打不開。

#### Scenario: 申請的手機打得開

- **WHEN** Taylor 的手機同意 Dana
- **THEN** 用 Dana 的手機的 box 私鑰、請求的 `senderKey`、從 S 導出的交接的 salt，和 `shared-expense/invite/handover/v1`、代號 A、Brisbane 的群組 ID、`1` 這四行的情境打開 `box`，得到 `{"keys":[{"epoch":1,"key":"<Brisbane 鑰匙世代 1 的群組鑰匙>"}]}`；`senderKey` 是這支手機的 box 私鑰的公開金鑰；`box` 的第 2 到第 25 個 byte 是 `expo-crypto` 給的 24 bytes

#### Scenario: 少了字串就打不開

- **WHEN** 打開時不給 salt，改用從 S2 導出的 salt，把情境的代號換成代號 B，把群組 ID 換成 Tokyo 的，或把 `senderKey` 換成別把公開金鑰
- **THEN** 都打不開

### Requirement: SHARING-199.1 API 回答同意好了之後同步，新成員才進到本機資料

WHEN API 回答同意好了，the mobile app SHALL 同步這個共同帳本一次，下載到自己剛才送出的事件並照常套用（SYNC-28.3），新成員和名冊紀錄是這時才存進本機資料的；再列出申請（SHARING-190.2）。之後 Members 列出新成員，有手機的成員顯示「Joined」（GROUPS-24.4），名片也照新的成員更新（SHARING-109.1）。

#### Scenario: 同意 Dana 之後

- **WHEN** Taylor 的手機同意 Dana 當新成員的申請，API 回答同意好了
- **THEN** Members 的成員由上而下是「Taylor (You)」、「Casey」、「Blake」和「Dana」，Dana 那一列有「Joined」；沒有申請那一區；本機資料沒有待上傳的事件；API 收到新的名片，最後一位是 Dana，`hasDevice` 是 `true`

#### Scenario: 同意 Dana 當 Casey 之後

- **WHEN** Taylor 的手機同意 Dana 當 Casey 的申請
- **THEN** Members 的成員仍是三位，Casey 那一列有「Joined」；新的名片上 Casey 的 `hasDevice` 是 `true`

### Requirement: SHARING-200.2 同意沒成功時說明原因，申請還在

IF 同意沒有做完，THEN the mobile app SHALL 不因此改本機資料，收到的申請還在，並跳出標題是「Unable to Approve」的提示框，訊息依原因：同意之前最後那一次同步停在一個沒有得到回應的請求，或替申請的手機上傳快照、送同意的請求沒有得到回應時，「Connect to the internet and try again.」；API 拒絕同意，原因是沒有這個申請時，「This request has already been answered.」，並再列出申請（SHARING-190.2），別的成員處理過了、申請的手機取消了或換了內容都是這樣；原因是成員手機滿了時，「This group is full. A shared group can have up to 20 members.」；同步之後這支手機已經沒有那個申請的邀請時——同步帶來了撤回，或它照校正後的時間到期了——不上傳快照也不送同意，訊息是「This request has already been answered.」，並再列出申請（SHARING-190.2），所以它不再是收到的申請：邀請不再有效時 API 不再存著它的申請（SHARING-174.1）；同步之後這個申請變成不能同意時，SHARING-194.2 那個原因的那一句；其他情況——最後那一次同步開頭的下載得到了回應卻沒有做完、同步之後還有待上傳的事件、沒有群組鑰匙、替申請的手機上傳的快照太大或存滿了、別的拒絕和看不懂的回應——「Something went wrong. Try again later.」。最後那一次同步，是 SHARING-195.2 的第二次同步，沒有第二次時就是第一次；它的請求，是同步開頭的下載、落後時下載給這支手機的快照（SYNC-164.1）、上傳事件，和上傳之後的下載（SYNC-160.2）。它停在一個沒有得到回應的請求，是這些請求裡它送的最後一個沒有得到回應：下載和下載快照沒有得到回應時，同步就到此為止；上傳的一批沒有得到回應時，這次同步前面沒有別的一批得到確認，也到此為止，前面有一批得到確認，就還會照 SYNC-160.2 再下載，那個下載得到了回應，這次同步就不是停在沒有得到回應的請求，這時還有待上傳的事件，照其他情況。最後那一次同步上傳之後的下載得到了回應、卻不是一頁時（SYNC-160.2），同意照常做下去：這支手機的 cursor 還沒有涵蓋它剛上傳的事件，API 說沒有跟上時照下面再同步、再送。同步最後替別支成員手機上傳的快照（SYNC-166.1）不是為了這次同意：它沒有得到回應、被拒絕、太大或存滿了，同意都照常做下去，不跳出提示框。IF API 拒絕同意，原因是沒有跟上，THEN the mobile app SHALL 不跳出提示框，再同步，再照 SHARING-195.2 在同一個 transaction 裡看一次能不能同意並記下 cursor，用同一份快照和同樣的事件再送同意的請求，`cursor` 是這次記下的；這時不能同意了就不再送，訊息是 SHARING-194.2 那個原因的那一句。一次同意這樣最多再送兩次，第三次還是沒有跟上，就照其他情況。IF 原因是沒有快照，THEN the mobile app SHALL 重新上傳一份快照再送一次，再被拒絕就照其他情況。

#### Scenario: 沒有網路

- **WHEN** 手機沒有網路，在 Dana 的選單按「Approve」
- **THEN** 跳出「Unable to Approve」，訊息是「Connect to the internet and try again.」；Dana 那一列還在；本機資料沒有 Dana，沒有待上傳的事件

#### Scenario: 第二次同步上傳之後的下載沒有得到回應

- **WHEN** Taylor 的手機有一個待上傳的事件，在 Dana 的選單按「Approve」；第一次同步上傳之後下載的時候又存了一個變更（SYNC-160.2），第二次同步上傳了它，API 確認之後，上傳之後的下載沒有得到回應
- **THEN** API 沒有收到快照的分塊和同意的請求；跳出「Unable to Approve」，訊息是「Connect to the internet and try again.」；Dana 那一列還在

#### Scenario: 上傳之後的下載得到的回應不是一頁

- **WHEN** Taylor 的手機有一個待上傳的事件，在 Dana 的選單按「Approve」；第一次同步上傳之後下載的時候又存了一個變更（SYNC-160.2），第二次同步上傳了它，API 確認之後，對上傳之後的下載回 500
- **THEN** 沒有跳出提示框；API 收到給 D 的快照的每一塊和第一個同意的請求，拒絕它，原因是沒有跟上；這支手機再同步，送第二個同意的請求，API 回答同意好了

#### Scenario: 上傳的後面一批沒有得到回應，之後的下載有回應

- **WHEN** Taylor 的手機有一個待上傳的事件，在 Dana 的選單按「Approve」；第一次同步上傳之後下載的時候又存了 101 個變更，第二次同步分兩批上傳它們（SYNC-76.1）：API 確認了前一批的 100 個，後一批沒有得到回應，上傳之後的下載得到一頁
- **THEN** API 沒有收到快照的分塊和同意的請求；跳出「Unable to Approve」，訊息是「Something went wrong. Try again later.」；這支手機還有一個待上傳的事件，Dana 那一列還在

#### Scenario: 替別支成員手機上傳的快照沒有得到回應

- **WHEN** Dana 的手機加入之後，Taylor 的手機在等快照（SYNC-162.1）；Evan 申請當新成員，Dana 的手機在他的選單按「Approve」；同步最後替 Taylor 的手機上傳的快照沒有得到回應
- **THEN** 沒有跳出提示框；API 接著收到給 Evan 的手機的快照的每一塊和一個同意的請求，回答同意好了，Evan 的手機是成員手機

#### Scenario: 別的成員已經處理過

- **WHEN** API 拒絕同意的請求，原因是沒有這個申請；之後列出時 API 上沒有申請
- **THEN** 跳出「Unable to Approve」，訊息是「This request has already been answered.」；Members 沒有申請那一區

#### Scenario: 成員手機滿了

- **WHEN** API 拒絕同意的請求，原因是成員手機滿了
- **THEN** 訊息是「This group is full. A shared group can have up to 20 members.」

#### Scenario: 同步之後變成不能同意

- **WHEN** Dana 申請當 Casey；按「Approve」之後的那次同步，下載到代表 Casey 的別支手機的名冊紀錄
- **THEN** API 沒有收到快照的分塊和同意的請求；訊息是「Casey has already joined from another phone. This request can't be approved.」

#### Scenario: 同步之後邀請已經被撤回

- **WHEN** Dana 申請當新成員；別支手機撤回了邀請，Taylor 的手機還沒同步到；在 Dana 的選單按「Approve」
- **THEN** API 沒有收到快照的分塊和同意的請求；跳出「Unable to Approve」，訊息是「This request has already been answered.」；Members 沒有申請那一區

#### Scenario: 沒有跟上時再同步、再送

- **WHEN** API 拒絕第一個同意的請求，原因是沒有跟上，這時 Brisbane 多了別支手機的一個事件
- **THEN** 沒有跳出提示框；API 接著收到 Brisbane 的下載和第二個同意的請求，它的 `cursor` 比第一個大 1，`snapshotId` 和 `events` 和第一個一樣；API 回答同意好了之後，Dana 是成員

#### Scenario: 一直沒有跟上

- **WHEN** API 每次都拒絕同意的請求，原因是沒有跟上
- **THEN** API 一共收到三個同意的請求；之後跳出「Unable to Approve」，訊息是「Something went wrong. Try again later.」

#### Scenario: 沒有快照時重新上傳

- **WHEN** API 拒絕第一個同意的請求，原因是沒有快照
- **THEN** API 接著收到另一份快照的每一塊和第二個同意的請求，它的 `snapshotId` 是新的那一份的；再被拒絕，原因是沒有快照時，跳出「Something went wrong. Try again later.」

#### Scenario: 其他情況

- **WHEN** Brisbane 有傳不上去的待上傳事件（群組滿了，SYNC-82.1）；或 API 拒絕同意，原因是鑰匙世代；或回 500
- **THEN** 都跳出「Unable to Approve」，訊息是「Something went wrong. Try again later.」；Dana 那一列還在

### Requirement: SHARING-201.1 按 Decline 時送拒絕

WHEN 使用者在申請的選單按「Decline」，the mobile app SHALL 送拒絕的請求（SHARING-172.1），路徑帶著群組 ID 和申請的裝置 ID，網址的 `request` 是選單打開時那一列的申請的內容的 SHA-256；API 回答拒絕好了之後，那個申請不再是收到的申請。拒絕不同步，不改本機資料，也不寫事件。IF 拒絕沒成功，THEN the mobile app SHALL 讓申請還在，並跳出標題是「Unable to Decline」的提示框：沒有得到回應時訊息是「Connect to the internet and try again.」；原因是沒有這個申請時是「This request has already been answered.」，並再列出申請，申請的手機換了內容時新的那一份因此還在；其他情況是「Something went wrong. Try again later.」。

#### Scenario: 拒絕 Dana

- **WHEN** 在 Dana 的選單按「Decline」
- **THEN** API 收到沒有內容的 `DELETE /groups/<Brisbane 的群組 ID>/requests/<D>?request=<Dana 的申請的內容的 SHA-256>`；Members 沒有申請那一區，Brisbane 的畫面沒有申請的按鈕；本機資料不變，沒有待上傳的事件

#### Scenario: 沒有網路

- **WHEN** 手機沒有網路，在 Dana 的選單按「Decline」
- **THEN** 跳出「Unable to Decline」，訊息是「Connect to the internet and try again.」；Dana 那一列還在

#### Scenario: 別的成員已經處理過

- **WHEN** API 拒絕這個請求，原因是沒有這個申請；之後列出時 API 上沒有申請
- **THEN** 跳出「Unable to Decline」，訊息是「This request has already been answered.」；Members 沒有申請那一區

#### Scenario: 看不懂的回應

- **WHEN** API 對拒絕的請求回 500
- **THEN** 訊息是「Something went wrong. Try again later.」；Dana 那一列還在

#### Scenario: 選單打開之後申請換了內容

- **WHEN** Dana 申請當 Casey，Taylor 的手機打開她的選單；這時 Dana 的手機把申請換成當新成員；之後在選單按「Decline」
- **THEN** API 拒絕這個請求，原因是沒有這個申請，新的那一份還在；跳出「Unable to Decline」，訊息是「This request has already been answered.」；Members 的申請那一區是「Dana」和「Wants to join as a new member」那一列

### Requirement: SHARING-202.1 一個共同帳本一次處理一個申請

WHILE 一個共同帳本有申請正在處理，the mobile app SHALL 讓那個申請的那一列第二行顯示「Approving…」或「Declining…」，這個共同帳本每個申請的列都按了沒有反應；關閉 Members 不中斷處理。處理的結果到的時候 Members 已經關閉，SHALL 照樣照結果處理本機資料和收到的申請，但不跳出提示框。

#### Scenario: 同意中

- **WHEN** 收到的申請有 Dana 的和另一支手機的；在 Dana 的選單按「Approve」，API 還沒回答同意的請求時，點另一個申請的那一列，再點 Dana 那一列
- **THEN** Dana 那一列是「Dana」和「Approving…」；兩次都沒有跳出選單，API 沒有多收到同意和拒絕的請求

#### Scenario: 拒絕中

- **WHEN** 在 Dana 的選單按「Decline」，API 還沒回答
- **THEN** Dana 那一列是「Dana」和「Declining…」

#### Scenario: 關閉 Members 之後才有結果

- **WHEN** API 還沒回答同意的請求時關閉 Members；之後 API 回答同意好了，或回 500
- **THEN** 兩種都沒有跳出提示框；同意好了時，再打開 Members 有 Dana，她那一列有「Joined」；回 500 時，再打開 Members，申請那一區仍有 Dana 那一列

### Requirement: SHARING-203.1 申請的內容和群組鑰匙只以密文離開手機

The mobile app SHALL 不把申請的名字、選的成員的成員 ID、申請的使用者 ID 和 box 公開金鑰、新成員的成員 ID、群組鑰匙、邀請的字串、申請金鑰和交接的 salt 以明文放進任何請求：網址、簽名的欄位和內容裡都沒有，不論是原始的 bytes、十六進位還是 Base64。

#### Scenario: 列出、同意和拒絕

- **WHEN** Dana 申請當新成員，名字是「Dana K.」；Taylor 的手機列出申請、同意她；另一支手機申請當 Casey，Taylor 的手機拒絕它
- **THEN** API 收到的每個請求裡都找不到「Dana K.」、Dana 的使用者 ID 和 box 公開金鑰、Casey 的成員 ID、新成員的成員 ID、Brisbane 的群組鑰匙、S、申請金鑰和交接的 salt

### Requirement: SHARING-204.1 同意和問結果的請求等不到回應時在 60 秒後放棄

IF 列出申請、同意、拒絕或問結果時送出的一個請求送出 60 秒之後還沒有收完回應，THEN the mobile app SHALL 放棄這個請求，把它當成沒有得到回應：列出照 SHARING-190.2，同意照 SHARING-200.2，拒絕照 SHARING-201.1，問結果照 SHARING-215.1；同步、上傳快照和匯入快照送的請求照 SYNC-97.1。放棄之後才到的回應不算數。這支手機之後送的請求不等被放棄的那一個。每個送出的請求各自算 60 秒：API 要求等待的時間（SHARING-28.1）不算在內，等過之後或校正時鐘之後再送的那一次重新算。

#### Scenario: 同意一直沒有回應

- **WHEN** 在 Dana 的選單按「Approve」，API 收下了同意，卻一直沒有回答；過了 50 秒；再過 15 秒；之後 API 才回答
- **THEN** 50 秒時 Dana 那一列是「Approving…」；再過 15 秒，跳出「Unable to Approve」，訊息是「Connect to the internet and try again.」；回答到了之後沒有別的提示框

#### Scenario: 拒絕一直沒有回應

- **WHEN** 在 Dana 的選單按「Decline」，API 一直沒有回答；過了 65 秒
- **THEN** 跳出「Unable to Decline」，訊息是「Connect to the internet and try again.」；Dana 那一列還在

#### Scenario: 列出和問結果一直沒有回應

- **WHEN** 列出申請的請求一直沒有回答，過了 65 秒之後使用者再打開 Members；或 Dana 的手機問結果的請求一直沒有回答，過了 65 秒之後再打開那個申請
- **THEN** 都再送一個新的請求，不等原本的那一個；沒有跳出提示框

### Requirement: SHARING-210.1 app 打開和打開申請時問結果

WHEN app 打開（sync：啟動，或從背景回到前景），the mobile app SHALL 替本機資料裡每個還沒送出、等待同意、要重選，或同意了還沒加入好的申請各問一次結果；WHEN Join Group 為這樣的一個申請打開（從連結，SHARING-131.2；或從申請的卡片，GROUPS-108.2），或使用者在同意了還沒加入好的申請按「Try Again」（SHARING-221.1），SHALL 替那個申請問一次。問結果是送問結果的請求（SHARING-183.1），路徑帶著那個申請的代號；它不重送申請，也不取消。這些時候不問：這支手機授權失效（SHARING-29.1）；app 建置時沒有給 API 的網址；那個申請正在送出或正在取消（SHARING-134.1、SHARING-142.1）；那個申請已經在問結果或加入中，這時等的是同一次的結果。被拒絕和邀請不再有效的申請不問。還沒有結果時，Join Group 和申請的卡片顯示的和問之前一樣。

#### Scenario: 重新啟動 app

- **WHEN** 送出申請之後關閉 Join Group，重新啟動 app
- **THEN** API 收到一個 `GET /invites/3q2-7wEjRWeJq83vEjRWeA/request`，是簽名的請求，裝置 ID 是這支手機的；沒有收到送出申請和取消申請的請求

#### Scenario: 從背景回來

- **WHEN** 送出申請之後 app 進入背景再回到前景
- **THEN** API 多收到一個問結果的請求

#### Scenario: 打開申請

- **WHEN** 送出申請之後在 Groups 根畫面按申請的卡片；關閉之後再打開 Brisbane 的連結
- **THEN** 兩次各收到一個問結果的請求；回答之前 Join Group 顯示「Waiting for Approval」

#### Scenario: 兩個申請

- **WHEN** 手機上有 Brisbane 和 Tokyo 的申請，重新啟動 app
- **THEN** API 收到兩個問結果的請求，代號各是 A 和 B

#### Scenario: 還沒送出的申請也問

- **WHEN** 沒有網路時按了「Send Request」；有網路之後重新啟動 app
- **THEN** API 收到一個問結果的請求，沒有收到送出申請的請求

#### Scenario: 不問的時候

- **WHEN** 這支手機授權失效；或 app 建置時沒有給 API 的網址；或 API 還沒回答送出申請的請求；重新啟動 app，或打開那個申請
- **THEN** API 沒有收到問結果的請求

#### Scenario: 已經在問

- **WHEN** API 還沒回答問結果的請求時，關閉 Join Group 再打開那個申請
- **THEN** API 沒有多收到問結果的請求

### Requirement: SHARING-211.1 API 說還在等，或沒有這個申請

WHEN API 回答 `{"state":"waiting"}`，the mobile app SHALL 把還沒送出的申請記成等待同意的：API 已經收下它；並讀一次邀請（SHARING-124.1 的同一個請求），照名片看這個申請還合不合（SHARING-212.2）。讀邀請沒有得到回應、被拒絕、得到看不懂的回應或名片解不開時，申請不變。讀邀請被拒絕、原因是沒有這個邀請時也一樣，不照 SHARING-214.1 收掉申請：成員可能在這兩個請求之間同意了它，再撤回邀請，這時 API 存著它的交接，下次問結果就得到同意了（SHARING-183.1）；邀請真的不再有效而它沒有被同意時，下次問結果才得到沒有這個邀請。WHEN API 回答 `{"state":"none"}`，等待同意和要重選的申請是被拒絕了（SHARING-213.1）；還沒送出的申請不變：API 沒有收到它，手機 app 也不替它重送（SHARING-139.2）。

#### Scenario: 還在等

- **WHEN** 送出申請之後打開那個申請，API 回答 `{"state":"waiting"}`
- **THEN** API 接著收到一個沒有簽名的 `GET /invites/3q2-7wEjRWeJq83vEjRWeA`；Join Group 仍顯示「Waiting for Approval」，卡片仍是「Waiting for approval」

#### Scenario: API 其實收下了

- **WHEN** API 收下了申請，回應卻沒送到手機；之後重新啟動 app，API 回答 `{"state":"waiting"}`
- **THEN** 本機資料的申請是等待同意的；卡片從「Not sent」變成「Waiting for approval」；API 沒有多收到送出申請的請求

#### Scenario: API 沒有收到還沒送出的申請

- **WHEN** 沒有網路時按了「Send Request」；有網路之後重新啟動 app，API 回答 `{"state":"none"}`
- **THEN** 卡片仍是「Not sent」；API 沒有收到送出申請的請求；打開它，Join Group 顯示「Your request hasn't been sent.」、「Try Again」和「Cancel Request」

#### Scenario: 讀不到名片

- **WHEN** API 回答 `{"state":"waiting"}`，接著的讀邀請回 500，沒有得到回應，或被拒絕、原因是沒有這個邀請
- **THEN** 申請仍是等待同意的，本機資料仍存著連結的字串，沒有跳出提示框

#### Scenario: 兩個請求之間被同意、邀請被撤回

- **WHEN** API 回答 `{"state":"waiting"}` 之後，成員同意了這個申請並撤回邀請，所以接著的讀邀請被拒絕，原因是沒有這個邀請；之後重新啟動 app
- **THEN** 先是卡片仍是「Waiting for approval」；重新啟動之後問結果得到同意了，這支手機加入好了

### Requirement: SHARING-212.2 申請不合名片時請使用者重選

IF 問結果時讀到的名片上，申請選的成員不在名片上；或申請不是要接手的，而選的成員已經有手機；或申請是要接手的，而選的成員沒有手機，或名片上除了他沒有別的有手機的成員；或申請要當新成員，而名片上有 20 位以上的成員，或有成員和申請的名字同名，THEN the mobile app SHALL 把申請記成要重選的：成員的手機不會同意這樣的申請（SHARING-194.2），或沒有手機能同意它（SHARING-320.1）。申請又合名片時，要重選的申請回到等待同意。Join Group 為要重選的申請顯示時，SHALL 是 SHARING-125.2 到 SHARING-129.2 和 SHARING-320.1 的表單，照那張名片顯示，名字欄位帶入申請的名字，預設選的那一列照 SHARING-126.1 用申請的名字決定，另外最上面多一句「Choose again. Your earlier choice is no longer available.」，「Send Request」下面有「Cancel Request」（SHARING-142.1）。那張名片是這次 app 執行期間問結果時讀到的，不存進本機資料：為要重選的申請打開 Join Group 時還沒有它——例如重新啟動之後——就先問結果（SHARING-210.1），這段時間的內容只有「Loading invite…」，讀到名片才顯示表單；問結果或讀邀請沒有得到回應時，顯示「Connect to the internet to join this group.」和「Try Again」，得到看不懂的回應時顯示「Something went wrong. Try again later.」和「Try Again」（SHARING-133.1 的樣子），按「Try Again」再問一次，申請不變。按「Send Request」是用表單上的名字和選擇再送一次這個申請（SHARING-134.1），是不是要接手照表單上選的那一列（SHARING-320.1），API 換掉原本的內容（SHARING-113.1）；API 回答申請送出了，才把本機資料的申請換成表單上的名字和選擇，回到等待同意。IF 這次送出沒有結果（SHARING-139.2 的那幾種情況），THEN the mobile app SHALL 讓本機資料的申請不變，仍是要重選的、原本的名字和選擇：API 存著的可能還是原本那一份，把本機的換成新的，下次 API 說還在等時，這支手機會以為新的選擇送出了。這時 Join Group 照 SHARING-139.2 顯示「Your request hasn't been sent.」、那一句原因、「Try Again」和「Cancel Request」，按「Try Again」再送表單上的那一份；卡片仍是「Choose again」，關閉再打開是要重選的表單。

#### Scenario: 選的成員被別人選走

- **WHEN** 送出的申請選了 Casey；之後名片上 Casey 的 `hasDevice` 變成 `true`；重新啟動 app，API 回答 `{"state":"waiting"}`
- **THEN** 卡片是「Brisbane」和「Choose again」；按了之後 Join Group 由上而下是「Choose again. Your earlier choice is no longer available.」、「Brisbane」、內容是「Dana」的名字欄位、「Join as」、「New Member」、「Taylor」和「Already joined」、「Casey」和「Already joined」、「Blake」、「A member of this group has to approve your request.」、「Send Request」和「Cancel Request」；選著的是「New Member」

#### Scenario: 重選之後再送

- **WHEN** 接著按「Blake」，再按「Send Request」
- **THEN** API 收到送出申請的請求，路徑和原本的一樣；解開它，選的成員是 Blake 的成員 ID；Join Group 顯示「Waiting for Approval」

#### Scenario: 新成員的名字被用掉

- **WHEN** 送出的申請要當新成員，名字是「Dana」；之後名片上多了一位沒有手機的成員「dana」；打開那個申請
- **THEN** Join Group 顯示要重選的表單，選著的是「dana」那一列（SHARING-126.1）

#### Scenario: 群組滿了

- **WHEN** 送出的申請要當新成員；之後名片上有 20 位成員，其中兩位沒有手機
- **THEN** 表單沒有「New Member」，成員的下面是「A shared group can have up to 20 members. You can join as one of the members above.」（SHARING-129.2）

#### Scenario: 重新啟動之後沒有名片

- **WHEN** 申請是要重選的；手機沒有網路，重新啟動 app，按那張卡片；之後有網路，按「Try Again」
- **THEN** 先是 Join Group 的內容只有「Connect to the internet to join this group.」和「Try Again」，卡片仍是「Choose again」；按了之後是要重選的表單，最上面是「Choose again. Your earlier choice is no longer available.」

#### Scenario: 重選之後送不出去

- **WHEN** 送出的申請選了 Casey，現在是要重選的；在表單按「Blake」，手機沒有網路，按「Send Request」；之後有網路，按「Try Again」
- **THEN** 先是 Join Group 由上而下是「Your request hasn't been sent.」、「Connect to the internet and try again.」、「Try Again」和「Cancel Request」，卡片仍是「Choose again」，本機資料的申請選的仍是 Casey；按了之後 API 收到的申請選的是 Blake，Join Group 顯示「Waiting for Approval」，本機資料的申請選的是 Blake

#### Scenario: 又合了

- **WHEN** 申請是要重選的；之後名片上 Casey 的 `hasDevice` 又是 `false`，重新啟動 app，API 回答 `{"state":"waiting"}`
- **THEN** 卡片回到「Waiting for approval」

#### Scenario: 要接手的成員沒有手機了

- **WHEN** 名片上 Taylor 和 Casey 都有手機時送出要接手 Taylor 的申請；之後名片上 Taylor 的 `hasDevice` 變成 `false`；重新啟動 app，API 回答 `{"state":"waiting"}`
- **THEN** 卡片是「Brisbane」和「Choose again」

#### Scenario: 沒有別的手機能同意了

- **WHEN** 名片上 Taylor 和 Casey 都有手機時送出要接手 Taylor 的申請；之後名片上 Casey 的 `hasDevice` 變成 `false`；重新啟動 app，API 回答 `{"state":"waiting"}`
- **THEN** 卡片是「Choose again」；按了之後，表單上選「Taylor, Already joined」那一列時，「Send Request」是停用的（SHARING-320.1）

#### Scenario: 要接手的申請仍合名片

- **WHEN** 名片上 Taylor 和 Casey 都有手機時送出要接手 Taylor 的申請；重新啟動 app，API 回答 `{"state":"waiting"}`，名片沒有變
- **THEN** 卡片仍是「Waiting for approval」：選的成員有手機，不讓要接手的申請重選

#### Scenario: 重選成接手

- **WHEN** 送出的申請選了沒有手機的 Casey；之後名片上 Casey 有了手機，Taylor 也有；打開要重選的表單，按「Casey, Already joined」那一列，再按「Send Request」
- **THEN** API 收到送出申請的請求，路徑和原本的一樣；解開它，選的成員是 Casey 的成員 ID，`takeover` 是 `true`；本機資料的申請是要接手的申請

### Requirement: SHARING-213.1 被拒絕時說明，不留下群組的資料

WHEN 手機 app 得知申請被拒絕（SHARING-211.1），the mobile app SHALL 把本機資料裡的這個申請換成只有群組名稱和它被拒絕了：邀請的代號、連結的字串、申請的名字和選的成員都不留；這支手機沒有那個群組的紀錄、成員、支出和鑰匙。Join Group 正顯示這個申請，或為它打開時（GROUPS-108.2），內容由上而下是「Request Declined」、群組名稱、「A member of this group declined your request.」，和角色為 button、名稱為「OK」的按鈕；按「OK」刪掉它，關閉 Join Group。它不再問結果；之後打開同一條連結，是照沒有申請的連結讀邀請、顯示表單（SHARING-124.1）。

#### Scenario: 成員拒絕之後

- **WHEN** 送出申請之後成員拒絕了它；重新啟動 app，API 回答 `{"state":"none"}`
- **THEN** 卡片是「Brisbane」和「Request declined」；本機資料的檔案裡找不到 S 和代號 A，secure store 裡沒有群組鑰匙；這支手機沒有 Brisbane 這個群組

#### Scenario: 看過之後

- **WHEN** 按那張卡片，再按「OK」
- **THEN** 先是 Join Group 由上而下是「Request Declined」、「Brisbane」、「A member of this group declined your request.」和「OK」；按了之後 Join Group 關閉，Groups 根畫面沒有申請的卡片，本機資料沒有申請；API 沒有多收到請求

#### Scenario: Join Group 開著時得知

- **WHEN** Join Group 顯示「Waiting for Approval」時，問結果的回答是 `{"state":"none"}`
- **THEN** Join Group 換成「Request Declined」那幾行，沒有「Cancel Request」

#### Scenario: 再打開連結

- **WHEN** 卡片是「Request declined」時打開 Brisbane 的連結
- **THEN** Join Group 讀邀請，顯示 Brisbane 的表單

### Requirement: SHARING-214.1 邀請不再有效時說明，不留下群組的資料

WHEN 問結果的請求被拒絕，原因是沒有這個邀請，the mobile app SHALL 和被拒絕一樣只留下群組名稱（SHARING-213.1），記成邀請不再有效：這個邀請過期或被撤回了，API 不說是哪一種。Join Group 正顯示這個申請，或為它打開時，內容由上而下是「Invite No Longer Valid」、群組名稱、「This invite has expired or was turned off. Ask a member for a new link.」，和「OK」；按「OK」刪掉它，關閉 Join Group。還沒送出的申請也一樣。只有問結果的請求帶著這個原因的拒絕才算：沒有帶原因的 404 是看不懂的回應（SHARING-215.1），問結果之後的讀邀請被拒絕也不算（SHARING-211.1）。

#### Scenario: 邀請被撤回

- **WHEN** 送出申請之後邀請被撤回；重新啟動 app，API 拒絕問結果的請求，原因是沒有這個邀請
- **THEN** 卡片是「Brisbane」和「Invite no longer valid」；按了之後 Join Group 由上而下是「Invite No Longer Valid」、「Brisbane」、「This invite has expired or was turned off. Ask a member for a new link.」和「OK」；本機資料的檔案裡找不到 S

#### Scenario: 看過之後

- **WHEN** 按「OK」
- **THEN** Join Group 關閉，沒有申請的卡片，本機資料沒有申請

#### Scenario: 還沒送出的申請

- **WHEN** 沒有網路時按了「Send Request」；之後邀請過期，有網路之後打開那個申請
- **THEN** Join Group 顯示「Invite No Longer Valid」那幾行

#### Scenario: 同意了還沒加入好的申請

- **WHEN** Dana 的手機有 Brisbane 的唯讀副本，用新的邀請申請、被同意，打開了 box、存下群組鑰匙，下載快照時沒有回應；之後成員移除了她，那個邀請也被撤回（SHARING-284.1）；Dana 的手機再問結果，被拒絕，原因是沒有這個邀請
- **THEN** 申請記成邀請不再有效；secure store 裡沒有 Brisbane 任何鑰匙世代的群組鑰匙；副本和送出申請之前一樣（SHARING-289.1）

### Requirement: SHARING-215.1 問不到結果時申請不變

IF 問結果的請求沒有得到回應，被對簽名的請求的檢查拒絕（SHARING-31.2），或回應看不懂——不是 SHARING-183.1 的任何一種，沒有帶原因的 404 也算——THEN the mobile app SHALL 讓申請和問之前一樣，不跳出提示框，Join Group 和卡片顯示的不變；下次再問（SHARING-210.1）。

#### Scenario: 沒有網路

- **WHEN** 送出申請之後手機沒有網路，重新啟動 app，再打開那個申請
- **THEN** 沒有跳出提示框；Join Group 顯示「Waiting for Approval」，卡片是「Waiting for approval」

#### Scenario: 看不懂的回應

- **WHEN** API 對問結果的請求回 500，回沒有帶原因的 404，回 `{"state":"maybe"}`，或因為請求太多拒絕、等了之後再送仍被拒絕
- **THEN** 申請都不變，沒有跳出提示框

### Requirement: SHARING-216.1 得知同意之後打開 box，確認鑰匙來自有邀請字串的成員

WHEN API 回答同意了，the mobile app SHALL 把申請記成同意了還沒加入好（SHARING-221.1），再打開回應的 `box`（SHARING-9.1）：用這支手機的 box 私鑰（SHARING-136.1）、回應的 `senderKey`、從申請的連結的字串導出的交接的 salt，和 SHARING-198.1 的情境，其中代號是申請的，群組 ID 和鑰匙世代是回應的 `groupId` 和 `epoch`。打得開，就表示裝 box 的人有這條邀請連結的字串，也是那把公開金鑰的主人：API 沒有字串，換不了裡面的鑰匙，也換不了群組。IF box 打不開（SHARING-10.1、SHARING-11.1），或裡面不是 SHARING-198.1 的內容——`keys` 是至少一項的陣列，每一項的 `epoch` 是 1 以上的整數、一個比一個大，最後一項的等於回應的 `epoch`，`key` 是 64 個小寫十六進位字元——THEN the mobile app SHALL 不存任何鑰匙，不問那個群組有沒有快照，加入沒有做完，原因是出了問題；IF box 是不認得的格式版本（SHARING-4.2），THEN 原因是要更新 app（SHARING-221.1）。

#### Scenario: 打得開

- **WHEN** 成員同意了 Dana 的申請，box 是照 SHARING-198.1 裝的；Dana 的手機打開那個申請
- **THEN** secure store 裡有 `group-key.9b2f6c1e-8d47-4f3a-b1c5-2e7d90a4f6b8.1`，值是 box 裡的那把鑰匙；API 接著收到問 Brisbane 有沒有快照的請求

#### Scenario: API 換了東西

- **WHEN** API 回答同意了，但 `senderKey` 是別把公開金鑰；或 `groupId` 是另一個群組的；或 `epoch` 是 2；或 box 是別人用另一個字串的 salt 裝的；或 box 被改過一個 bit
- **THEN** 每一種 secure store 都沒有群組鑰匙，API 沒有收到問快照的請求；Join Group 顯示「Approved」、「Brisbane」、「Something went wrong. Try again later.」和「Try Again」

#### Scenario: box 的內容不對

- **WHEN** box 打得開，內容是 `{}`、`{"keys":[]}`、`{"keys":[{"epoch":1,"key":"abc"}]}`，或 `{"keys":[{"epoch":2,"key":"<64 個十六進位字元>"},{"epoch":1,"key":"<64 個十六進位字元>"}]}`
- **THEN** 都和上一個 scenario 一樣

#### Scenario: 不認得的格式版本

- **WHEN** box 的第一個 byte 是 `0x02`
- **THEN** Join Group 顯示「Approved」、「Brisbane」和「Update the app to finish joining this group.」

### Requirement: SHARING-217.2 先存下 box 裡的群組鑰匙，再匯入快照

WHEN box 打開了，the mobile app SHALL 把裡面每一把群組鑰匙寫進 secure store 名稱是 `group-key.<群組 ID>.<鑰匙世代>` 的項目（SYNC-66.1），設定和 SHARING-93.1 一樣，再替那個群組匯入快照（SYNC-121.1 到 SYNC-128.3、SHARING-218.1、SHARING-219.2）。這時那個群組還不是這支手機上的共同帳本，所以鑰匙不是照 SYNC-94.1 存的：匯入讓它成為共同帳本，這支手機在它的鑰匙世代是快照的（SYNC-124.2）。鑰匙在這支手機用它解任何事件之前就驗證過：它來自打得開的 box，而且解得開那份快照；解不開快照時（SYNC-123.1）群組沒有成為共同帳本，這支手機不下載它的事件。IF 鑰匙存不進 secure store，THEN the mobile app SHALL 不匯入，加入沒有做完，原因是出了問題。IF 本機資料已經有群組 ID 是回應的 `groupId` 的群組，而它不是這個申請記著的副本（SHARING-226.2）——它是這支手機還在裡面的共同帳本，或是申請沒有記著的唯讀副本，或是申請沒有記著、不是共同帳本的群組——THEN the mobile app SHALL 不存任何鑰匙，不問那個群組有沒有快照，加入沒有做完，原因是出了問題，那個群組和 secure store 裡它的群組鑰匙都和之前一樣：裝 box 的人就算有邀請的字串，也換不掉這支手機已經在的共同帳本的鑰匙，和使用者送出申請時沒有答應取代的那一份。它是申請記著的那一個群組、而且仍是唯讀副本或不是共同帳本時，照常存下鑰匙，匯入時取代它（SHARING-289.1）；申請記著的那一個群組這時已經是這支手機在裡面的共同帳本時，和別的共同帳本一樣不存。

#### Scenario: 鑰匙在 secure store

- **WHEN** 成員同意了 Dana 的申請，Dana 的手機加入好了；之後它新增一筆 Brisbane 的支出並同步
- **THEN** secure store 裡有 `group-key.<Brisbane 的群組 ID>.1`，值是 Brisbane 的群組鑰匙的 64 個小寫十六進位字元，設定是 `AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY`；上傳的請求的鑰匙世代是 1，別的成員的手機解得開那個事件

#### Scenario: 快照解不開

- **WHEN** box 打得開，但裡面的鑰匙不是加密那份快照的那一把
- **THEN** 這支手機沒有 Brisbane 這個群組，沒有下載 Brisbane 的事件；Join Group 顯示「Approved」、「Brisbane」、「Something went wrong. Try again later.」和「Try Again」

#### Scenario: 存不進 secure store

- **WHEN** box 打開了，secure store 這時卻寫不進去；恢復之後按「Try Again」
- **THEN** 先是 API 沒有收到問快照的請求，Join Group 顯示「Something went wrong. Try again later.」和「Try Again」；按了之後加入好了

#### Scenario: 同意指的是這支手機還在裡面的共同帳本

- **WHEN** Dana 的手機替自己的群組 Tokyo 建立過邀請，Tokyo 是共同帳本，secure store 裡有它鑰匙世代 1 的群組鑰匙；它申請加入 Brisbane，得知同意時，回應的 `groupId` 是 Tokyo 的群組 ID，box 打得開，裡面是別的鑰匙
- **THEN** secure store 裡 Tokyo 鑰匙世代 1 的群組鑰匙和之前一樣，沒有別的群組鑰匙；API 沒有收到問快照的請求；Join Group 顯示同意了和「Something went wrong. Try again later.」

#### Scenario: 申請記著一份副本，同意指的是另一個群組

- **WHEN** Dana 的手機有自己的一份 Brisbane，申請記著它；它另外有自己建立、不是共同帳本的群組 Tokyo；它得知同意時，回應的 `groupId` 是 Tokyo 的群組 ID，box 打得開
- **THEN** secure store 裡沒有任何群組鑰匙，API 沒有收到問快照的請求；Join Group 顯示同意了和「Something went wrong. Try again later.」；它自己的那一份 Brisbane 和 Tokyo 都和之前一樣

#### Scenario: 同意指的是申請沒有記著的群組

- **WHEN** Dana 的手機申請加入 Brisbane，申請沒有記著任何副本；它另外有自己建立、不是共同帳本的群組 Tokyo；它得知同意時，回應的 `groupId` 是 Tokyo 的群組 ID，box 打得開
- **THEN** secure store 裡沒有任何群組鑰匙，API 沒有收到問快照的請求；Join Group 顯示同意了和「Something went wrong. Try again later.」；Tokyo 和之前一樣

### Requirement: SHARING-218.1 匯入之前確認快照的名冊

WHEN 加入時下載的快照判定為可以匯入（SYNC-98.4），the mobile app SHALL 在匯入之前確認它的名冊紀錄（SYNC-250.2）：有同意的那支手機的紀錄，也就是 ID 是回應的 `deviceId` 的那一筆，它的 box 公開金鑰是打開 box 用的 `senderKey`；有這支手機自己的紀錄，它的使用者 ID 是你的使用者 ID，box 公開金鑰是這支手機的，代表的成員是快照裡兩個單位到齊、沒有被移出群組的成員。IF 有一項不合，THEN the mobile app SHALL 不匯入，不寫本機資料，加入沒有做完，原因是出了問題。

#### Scenario: 名冊對得上

- **WHEN** 成員照 SHARING-195.2 到 SHARING-198.1 同意了 Dana 的申請，Dana 的手機打開那個申請
- **THEN** 加入好了

#### Scenario: 名冊對不上

- **WHEN** 快照沒有同意的那支手機的名冊紀錄；或那筆紀錄的 box 公開金鑰不是 `senderKey`；或沒有 D 的名冊紀錄；或 D 的紀錄的使用者 ID 不是這支手機的；或它代表的成員不在快照裡，或被移出群組了
- **THEN** 每一種這支手機都沒有 Brisbane 這個群組，本機資料除了申請的狀態都不變；Join Group 顯示「Approved」、「Brisbane」、「Something went wrong. Try again later.」和「Try Again」

### Requirement: SHARING-219.2 匯入快照時刪掉申請，你就是選的那位成員

WHEN 加入時匯入快照，the mobile app SHALL 在匯入的同一個 SQLite transaction 裡刪掉本機資料的那個申請，其中一個存不進去就都不留下。匯入之後，那個群組是這支手機上的共同帳本（SYNC-125.2），你在群組裡的成員是名冊裡這支手機代表的那一位（SYNC-251.2、GROUPS-9.1）：申請選的成員、為這個申請新加的成員，或同意的成員為這個申請加回來的前成員（SHARING-288.1），名稱照快照，不改你的名字。這支手機有那個群組的副本時，匯入先取代它（SHARING-289.1）。接著 SHALL 同步這個共同帳本（SYNC-68.2），之後和別的共同帳本一樣同步。

#### Scenario: 當新成員

- **WHEN** 成員同意了 Dana 當新成員的申請，Dana 的手機重新啟動 app
- **THEN** Groups 根畫面有「Open Brisbane」，沒有申請的卡片；Brisbane 的 Members 由上而下是 Taylor、Casey、Blake 和「Dana (You)」，Taylor 那一列有「Joined」；本機資料沒有申請；API 收到 Brisbane 的下載，cursor 是快照涵蓋的序號

#### Scenario: 選了成員

- **WHEN** 成員同意了名字是「Dana」、選了 Casey 的申請
- **THEN** Members 上是「Casey (You)」，沒有叫 Dana 的成員；Settings 的名字欄位仍是「Dana」

#### Scenario: 存不進去

- **WHEN** 匯入時本機資料寫不進去；恢復之後按「Try Again」
- **THEN** 先是這支手機沒有 Brisbane 這個群組，申請還在，Join Group 顯示「Something went wrong. Try again later.」和「Try Again」；按了之後加入好了

#### Scenario: 加入之後記帳

- **WHEN** 加入好了之後，Dana 的手機在 Brisbane 新增 Lunch，Taylor 的手機同步
- **THEN** Taylor 的手機上有 Lunch；兩支手機上 Brisbane 的資料一模一樣（SYNC-126.1）

### Requirement: SHARING-220.1 加入好了之後打開那個群組

WHEN 加入好了，而 Join Group 正顯示那個申請，the mobile app SHALL 關閉 Join Group，打開那個群組的畫面，和系統交來它的畫面的連結一樣（SHARING-130.2）；Join Group 關著，或顯示的是別的連結或別的申請時，SHALL 不打開任何畫面：Groups 根畫面上那個申請的卡片換成群組的卡片。

#### Scenario: Join Group 開著

- **WHEN** Join Group 顯示「Waiting for Approval」時成員同意了；關閉再打開那個申請
- **THEN** 加入好了之後 Join Group 關閉，分頁列選中 Groups，顯示 Brisbane 的畫面

#### Scenario: Join Group 關著

- **WHEN** 成員同意了之後，app 停在 Expenses 的根畫面時從背景回到前景
- **THEN** 仍顯示 Expenses 的根畫面，沒有打開 Join Group；選中 Groups 分頁，有「Open Brisbane」，沒有申請的卡片

### Requirement: SHARING-221.1 同意了還沒加入好的申請

WHILE 手機上的申請是同意了還沒加入好的，the mobile app SHALL 把這個狀態存在本機資料，重新啟動之後還在，並讓 Join Group 為它顯示：加入中時，由上而下是「Approved」、群組名稱和「Finishing up…」；加入沒有做完時，是「Approved」、群組名稱、一句原因，和角色為 button、名稱為「Try Again」的按鈕，要更新 app 時沒有這顆按鈕。原因：問快照、下載快照或問結果的請求沒有得到回應時，「Connect to the internet to finish joining.」；快照或 box 是這支手機不認得的格式版本時（SYNC-123.1、SHARING-216.1），「Update the app to finish joining this group.」；其他情況——API 說沒有快照、快照用不了（SYNC-123.1、SYNC-128.3、SHARING-218.1）、box 打不開、鑰匙或資料存不進去——「Something went wrong. Try again later.」。這種申請沒有「Cancel Request」：這支手機已經是成員手機。加入沒有做完時，這支手機沒有那個群組的資料；按「Try Again」和 app 打開時再問結果、再加入一次（SHARING-210.1）。

#### Scenario: 加入中

- **WHEN** 成員同意了；Dana 的手機打開那個申請，API 還沒回答下載快照的請求
- **THEN** Join Group 由上而下是「Approved」、「Brisbane」和「Finishing up…」，沒有「Cancel Request」

#### Scenario: 下載到一半沒有網路

- **WHEN** 下載快照的一個請求沒有得到回應；之後有網路，按「Try Again」
- **THEN** 先是 Join Group 由上而下是「Approved」、「Brisbane」、「Connect to the internet to finish joining.」和「Try Again」，卡片是「Brisbane」和「Approved」，這支手機沒有 Brisbane 這個群組；按了之後 API 收到問結果的請求，加入好了

#### Scenario: 重新啟動之後

- **WHEN** 加入沒有做完，手機沒有網路，重新啟動 app
- **THEN** 卡片仍是「Brisbane」和「Approved」

#### Scenario: 沒有快照

- **WHEN** API 回答同意了，問快照時卻說沒有快照
- **THEN** Join Group 顯示「Approved」、「Brisbane」、「Something went wrong. Try again later.」和「Try Again」

#### Scenario: 要更新 app

- **WHEN** 快照的格式版本是這支手機不認得的
- **THEN** Join Group 顯示「Approved」、「Brisbane」和「Update the app to finish joining this group.」，沒有「Try Again」

### Requirement: SHARING-222.1 API 說這支手機已經是成員

IF 問結果被拒絕，原因是已經是成員，THEN the mobile app SHALL 刪掉本機資料的那個申請，不問那個群組有沒有快照；Join Group 正顯示它時，內容只有「This phone is already in this group.」。這支手機是成員手機，API 卻沒有給它的交接：例如它加入之後，本機資料回到加入之前的樣子（SYNC-92.2）。

#### Scenario: 本機資料回到加入之前

- **WHEN** Dana 的手機加入 Brisbane、下載過它的事件之後，本機資料回到申請還在等的時候；app 打開，API 拒絕問結果的請求，原因是已經是成員
- **THEN** 本機資料沒有申請，這支手機沒有 Brisbane 這個群組；API 沒有收到問快照的請求

#### Scenario: API 說已經是成員

- **WHEN** 打開一個等待同意的申請，API 拒絕問結果的請求，原因是已經是成員
- **THEN** Join Group 的內容只有「This phone is already in this group.」；本機資料沒有申請，Groups 根畫面沒有它的卡片

### Requirement: SHARING-225.1 Join Group 照申請的狀態顯示

WHILE Join Group 顯示手機上的一個申請，the mobile app SHALL 照它的狀態顯示，狀態變了就跟著換，不必關閉再打開：還沒送出的照 SHARING-139.2，等待同意的照 SHARING-138.1，要重選的照 SHARING-212.2，同意了還沒加入好的照 SHARING-221.1，被拒絕的照 SHARING-213.1，邀請不再有效的照 SHARING-214.1；標題都是「Join Group」，標題列只有「Close」。

#### Scenario: 從等待同意到被拒絕

- **WHEN** Join Group 顯示「Waiting for Approval」；app 進入背景再回到前景，API 回答 `{"state":"none"}`
- **THEN** Join Group 換成「Request Declined」、「Brisbane」、「A member of this group declined your request.」和「OK」，標題仍是「Join Group」

#### Scenario: 從還沒送出到等待同意

- **WHEN** Join Group 顯示「Your request hasn't been sent.」；問結果的回答是 `{"state":"waiting"}`
- **THEN** Join Group 換成「Waiting for Approval」那幾行

### Requirement: SHARING-226.2 手機上有這個群組的副本時，送出申請之前先確認

WHILE Join Group 顯示一個邀請的表單，而這支手機有這個群組的副本，the mobile app SHALL 照常顯示表單（SHARING-125.2）。這個群組的副本，是這支手機上一個群組，名片上有一位成員的成員 ID 是它的成員或前成員的成員 ID，有兩種：唯讀副本（sync）；和這支手機自己的一份，也就是不是共同帳本的群組，例如匯入過那個群組變成共同帳本之前的匯出檔（backup）。WHEN 使用者在表單按「Send Request」，而它沒有被 SHARING-127.1 或 SHARING-128.1 擋下，這支手機也不是授權失效（授權失效的手機先照 SHARING-321.1 換一個新的裝置身分，之後才到這裡），the mobile app SHALL 在下面兩種情況先跳出提示框，不存申請，不發出網路請求。副本是這支手機自己的一份時，標題「Replace Your Copy?」，訊息「This phone has its own copy of <群組名稱>. If your request is approved, the group's version replaces it, and anything changed only in your copy will be lost. To keep it, export your data first.」，群組名稱是表單上的。副本是唯讀副本，而且有待上傳的事件時，標題「Replace This Copy?」，訊息是「If your request is approved, the group's version replaces the read-only copy on this phone.」、一個空格，再接：一個時「1 change made on this phone was never sent to the group and will be lost.」，其他時候「<個數> changes made on this phone were never sent to the group and will be lost.」。按鈕都是「Cancel」和「Send Request」。按「Send Request」才照 SHARING-134.1 存下申請並送出；按「Cancel」關閉提示框，表單、名字欄位和選著的那一列都不變，Android 上按返回鍵或點提示框外面也一樣。唯讀副本沒有待上傳的事件時不問，直接照 SHARING-134.1：它有的，群組都有。不論問了沒有，存下的申請都記著這個副本的群組 ID，重新啟動 app 之後還記著：被同意時，只有它可以被取代（SHARING-217.2、SHARING-289.1）。這支手機自己的一份每次都問，也不寫筆數：送出時還沒有群組的版本，手機 app 不知道哪些東西只有這一份有。替還沒送出的申請按「Try Again」（SHARING-139.2），和替要重選的申請再按「Send Request」（SHARING-212.2）時不再問。副本在被同意、匯入快照的那一刻才被取代（SHARING-289.1），在那之前都不變。名片上的成員是這支手機上一個不是唯讀副本的共同帳本的成員或前成員時，照 SHARING-130.2 打開那個群組。

#### Scenario: 這支手機自己的一份

- **WHEN** 這支手機有一個不是共同帳本的群組 Brisbane，它的成員 Taylor 的成員 ID 就是名片上 Taylor 的成員 ID；打開 Brisbane 的連結，按「Blake」，再按「Send Request」
- **THEN** Join Group 先是 Brisbane 的表單；按了之後跳出「Replace Your Copy?」，訊息是「This phone has its own copy of Brisbane. If your request is approved, the group's version replaces it, and anything changed only in your copy will be lost. To keep it, export your data first.」，按鈕是「Cancel」和「Send Request」；API 只收到讀邀請的請求，本機資料沒有申請

#### Scenario: 按 Send Request

- **WHEN** 在這個提示框按「Send Request」
- **THEN** API 收到送出申請的請求，Join Group 顯示「Waiting for Approval」；這支手機上的 Brisbane 和之前完全一樣

#### Scenario: 按 Cancel

- **WHEN** 在這個提示框按「Cancel」
- **THEN** Join Group 仍是表單，選著的仍是「Blake」；API 沒有多收到請求，本機資料沒有申請

#### Scenario: 只有前成員對得上

- **WHEN** 這支手機上那個群組把 Blake 移出了，名片上只有 Blake 的成員 ID 是這支手機上的；打開 Brisbane 的連結，按「Send Request」
- **THEN** 一樣跳出「Replace Your Copy?」

#### Scenario: 唯讀副本有沒送出的變更

- **WHEN** Brisbane 在這支手機上是唯讀副本，有一個待上傳的事件；或有三個；打開 Brisbane 的新邀請的連結，按「Send Request」
- **THEN** 跳出「Replace This Copy?」，訊息分別是「If your request is approved, the group's version replaces the read-only copy on this phone. 1 change made on this phone was never sent to the group and will be lost.」和「If your request is approved, the group's version replaces the read-only copy on this phone. 3 changes made on this phone were never sent to the group and will be lost.」

#### Scenario: 唯讀副本沒有沒送出的變更

- **WHEN** 唯讀副本 Brisbane 沒有待上傳的事件；打開 Brisbane 的新邀請的連結，按「Send Request」
- **THEN** 沒有跳出提示框；API 收到送出申請的請求

### Requirement: SHARING-229.1 (manual) 兩支真的手機：申請、同意、加入

WHEN 一支真的手機用邀請連結申請加入，另一支真的手機的成員同意，the mobile app SHALL 讓新手機有那個群組的全部資料，兩支手機之後各自記的帳都出現在對方的手機上。

#### Scenario: iPhone 和 Android 各當一次新手機

- **WHEN** 在裝了連到同一個環境的 build 的兩支手機上：一支替有幾筆支出的群組按「Invite with Link」並分享連結；另一支點連結、送出申請；第一支打開 Members，在申請的選單按「Approve」；第二支把 app 切到背景再回來；之後兩支各新增一筆支出，再各打開 app 一次。另外做一次，第一支改按「Decline」
- **THEN** 同意的那一次：第二支的 Groups 根畫面出現那個群組，支出和第一支的一樣，Members 上自己那一列有「(You)」，第一支的 Members 上新成員那一列有「Joined」，各自新增的支出在對方的手機上也有。拒絕的那一次：第二支的卡片顯示「Request declined」，按了看到說明，按「OK」之後卡片消失，手機上沒有那個群組

### Requirement: SHARING-250.1 成員手機移除別的成員手機，同時換鑰匙

WHEN 成員手機送換鑰匙的請求，而它沒有被 SHARING-251.1 到 SHARING-253.1、SHARING-261.1 和 SHARING-262.1 拒絕，the API SHALL 在同一個 transaction 裡做完這幾件事，不會只做一部分：讓 `remove` 列出的每支手機不再是這個群組的成員手機，它在這個群組的進度、它是不是在等快照（SYNC-162.1）、給它的快照、給它的鑰匙的 box 和它的交接（SHARING-173.2）都不再存著，之後回傳的一頁不把它列進要快照的成員手機；把群組現在的鑰匙世代換成 `epoch`，群組不再需要換鑰匙；替 `boxes` 的每一項存下一個鑰匙的 box，也就是收件的裝置 ID、`epoch`、請求的 `senderKey` 和那個 box；把請求帶的事件照上傳存下（SYNC-50.1、SYNC-51.1），上傳的裝置是這支成員手機，鑰匙世代是 `epoch`，收到時間是這時 API 的時間。它回答換好了，回應帶著 `epoch` 和請求裡每個事件的序號。群組的每一支成員手機都可以送，被同意而加入的也可以，不管它自己的進度到哪裡：它不必跟上群組最新的序號。API 不撤回群組的邀請，也不動它的申請：邀請由手機撤回（SHARING-284.1）。

#### Scenario: 移除 Dana

- **WHEN** Taylor 的手機在 T+1,000 移除 Dana
- **THEN** API 回 200，回應是 `{"epoch":2,"events":[{"id":"<E 的事件 ID>","sequence":1}]}`；Brisbane 的成員手機是 Taylor 的手機和 Casey 的手機，鑰匙世代是 2

#### Scenario: 事件用新的鑰匙世代存下

- **WHEN** 接著 Casey 的手機從 cursor 0 下載 Brisbane 的事件
- **THEN** 得到 E，序號是 1，上傳的裝置 ID 是 Taylor 的手機的，鑰匙世代是 2，收到時間是 T+1,000

#### Scenario: 之後上傳要用新的鑰匙世代

- **WHEN** 接著 Taylor 的手機用鑰匙世代 1 上傳一個新事件，再用鑰匙世代 2 上傳它
- **THEN** 前一次被拒絕，原因是鑰匙世代，回應說群組現在的鑰匙世代是 2；後一次存下，序號是 2

#### Scenario: 進度落後的手機也能移除

- **WHEN** Brisbane 有三個事件，Taylor 的手機的進度是 cursor 0；它移除 Dana
- **THEN** 換好了，E 的序號是 4

#### Scenario: 一次移除兩支

- **WHEN** Taylor 的手機送換鑰匙的請求，`remove` 是 Casey 的手機和 Dana 的手機，`boxes` 只有給 Taylor 的手機的 BT
- **THEN** 換好了；Brisbane 的成員手機只有 Taylor 的手機

#### Scenario: 沒有事件

- **WHEN** Taylor 的手機移除 Dana，`events` 是空的陣列
- **THEN** 回應是 `{"epoch":2,"events":[]}`；Brisbane 仍沒有事件，鑰匙世代是 2

#### Scenario: 被同意而加入的手機移除別人

- **WHEN** Casey 的手機是被 Taylor 的手機同意而成為成員手機的；它送換鑰匙的請求，`remove` 是 Taylor 的手機，`boxes` 是給 Casey 的手機和 Dana 的手機的
- **THEN** 換好了；Taylor 的手機不是成員手機

#### Scenario: 被移除的手機留下的東西

- **WHEN** Dana 的手機是被同意而成為成員手機的，API 存著它的交接和給它的完整快照，也存著一次更早的換鑰匙留給它的 box；Taylor 的手機移除 Dana
- **THEN** 資料庫裡找不到那個交接的 box、那份快照任何一塊的內容和那個鑰匙的 box，不論是原始的 bytes、十六進位還是 Base64；Casey 的手機的進度和給它的 box 都還在

#### Scenario: 邀請還在

- **WHEN** Brisbane 有代號 A 的有效邀請和別的手機的申請 P；Taylor 的手機移除 Dana
- **THEN** 讀代號 A 仍得到名片，列出申請仍得到 P

#### Scenario: 等著快照的手機被移除

- **WHEN** Brisbane 清到的序號是 5，Casey 的手機和 Dana 的手機都從 cursor 2 下載過，得到需要快照的回答；Taylor 的手機移除 Dana，再從 cursor 5 下載
- **THEN** 那一頁的 `x-snapshot-needed-by` 只有 Casey 的手機的裝置 ID

### Requirement: SHARING-251.1 換鑰匙的請求要點名群組的每一支成員手機

IF 換鑰匙的請求的 `remove` 有一項不是這個群組的成員手機，或是送請求的這支手機自己；或 `boxes` 的裝置 ID 不是剛好這個群組的成員手機去掉 `remove` 列出的那些，送請求的手機自己也在裡面，不多也不少，THEN the API SHALL 拒絕，原因是成員手機不一樣，回應帶著這個群組現在每一支成員手機的裝置 ID，由小到大（字元逐一比較）；什麼都不改。所以手機準備請求之後成員名單變了——有手機被同意加入、退出，或被別人移除——請求就不成立，手機照回應的名單更新之後再試（SHARING-274.1）。

#### Scenario: 少了一支留下來的手機的 box

- **WHEN** Taylor 的手機送換鑰匙的請求，`remove` 是 Dana 的手機，`boxes` 只有給 Taylor 的手機的 BT
- **THEN** 被拒絕，原因是成員手機不一樣（409），回應是 `{"error":"devices","devices":["0f8fad5b-d9cb-469f-a165-70867728950e","2d6f0a7e-3c1b-4e8a-9f52-6b7c8d9e0f1a","7c9e6679-7425-40de-944b-e07fc1f90ae7"]}`；Dana 的手機仍是成員手機，鑰匙世代仍是 1，E 沒有存下

#### Scenario: 沒有給自己的 box

- **WHEN** Taylor 的手機移除 Dana，`boxes` 只有給 Casey 的手機的 BC
- **THEN** 被拒絕，原因是成員手機不一樣

#### Scenario: 多了一個 box

- **WHEN** Taylor 的手機移除 Dana，`boxes` 除了 BT 和 BC，另外有給一支註冊過、不是成員手機的手機的 box
- **THEN** 被拒絕，原因是成員手機不一樣

#### Scenario: remove 列了不是成員手機的手機，或自己

- **WHEN** `remove` 是一支註冊過、不是成員手機的手機，或 API 沒見過的 `ffffffff-ffff-4fff-bfff-ffffffffffff`，`boxes` 是給三支成員手機的；或 `remove` 是 Taylor 的手機自己，`boxes` 是給 Casey 的手機和 Dana 的手機的
- **THEN** 都被拒絕，原因是成員手機不一樣；Brisbane 的三支成員手機都還在

#### Scenario: 準備之後有手機加入

- **WHEN** Taylor 的手機備好移除 Dana 的請求之後，Casey 的手機同意了另一支手機的申請；Taylor 的手機送出那個請求
- **THEN** 被拒絕，原因是成員手機不一樣，回應的 `devices` 有四個裝置 ID，新加入的那一支也在裡面

#### Scenario: 準備之後有手機退出

- **WHEN** Taylor 的手機備好移除 Dana 的請求之後，Casey 的手機退出了；Taylor 的手機送出那個請求；再把 `boxes` 改成只有 BT 送一次
- **THEN** 前一次被拒絕，原因是成員手機不一樣，回應的 `devices` 是 Taylor 的手機和 Dana 的手機；後一次換好了

### Requirement: SHARING-252.1 新的鑰匙世代是群組現在的下一個

IF 換鑰匙的請求的 `epoch` 不是群組現在的鑰匙世代加 1，THEN the API SHALL 拒絕，原因是鑰匙世代，回應帶著群組現在的鑰匙世代（SYNC-55.1 的同一個原因）；什麼都不改。所以兩支手機照同一個鑰匙世代各換一次時，只有一支換得成，另一支拿到的是換過之後的世代。`epoch` 不在 2 到 9,007,199,254,740,991 之間的請求是寫得不對，照 SHARING-261.1 拒絕，不到這一條。

#### Scenario: 不是下一個

- **WHEN** Brisbane 的鑰匙世代是 1，Taylor 的手機移除 Dana，`epoch` 是 3 或 9007199254740991
- **THEN** 都被拒絕，原因是鑰匙世代（409），回應是 `{"error":"epoch","epoch":1}`；Dana 的手機仍是成員手機

#### Scenario: 已經換過

- **WHEN** Taylor 的手機移除 Dana 之後，Casey 的手機送 `epoch` 是 2、`remove` 是空的、`boxes` 是給 Taylor 的手機和 Casey 的手機的換鑰匙的請求
- **THEN** 被拒絕，原因是鑰匙世代，回應說群組現在的鑰匙世代是 2

### Requirement: SHARING-253.1 沒有手機要移除，群組也不需要換鑰匙時不換

IF 換鑰匙的請求的 `remove` 是空的，而群組不需要換鑰匙，THEN the API SHALL 拒絕，原因是不必換鑰匙；什麼都不改。成員手機只在有手機離開的時候換鑰匙。

#### Scenario: 不需要換

- **WHEN** Brisbane 不需要換鑰匙，Taylor 的手機送 `epoch` 是 2、`remove` 是空的、`boxes` 是給三支成員手機的換鑰匙的請求
- **THEN** 被拒絕，原因是不必換鑰匙（409），回應是 `{"error":"rotation-not-needed"}`；鑰匙世代仍是 1

#### Scenario: 有手機退出之後

- **WHEN** Dana 的手機退出之後，Taylor 的手機送 `epoch` 是 2、`remove` 是空的、`boxes` 是 BT 和 BC 的換鑰匙的請求
- **THEN** 換好了，回應是 `{"epoch":2,"events":[{"id":"<E 的事件 ID>","sequence":1}]}`；Brisbane 不再需要換鑰匙

### Requirement: SHARING-254.1 成員手機退出

WHEN 成員手機送退出的請求，the API SHALL 在同一個 transaction 裡讓它不再是這個群組的成員手機，它在這個群組的進度、它是不是在等快照（SYNC-162.1）、給它的快照、給它的鑰匙的 box 和它的交接都不再存著；群組還有別的成員手機時，把群組記成需要換鑰匙，鑰匙世代不變。它回答退出好了，回應帶著那支手機的裝置 ID。退出的請求沒有內容，不帶事件，也不帶鑰匙世代：API 不看群組存滿了沒有、這支手機的進度到哪裡、群組是不是已經需要換鑰匙，成員手機一定退得成。誰離開了，由替群組換鑰匙的手機寫成事件（SHARING-271.1）。

#### Scenario: Dana 退出

- **WHEN** Dana 的手機送 `POST /groups/9b2f6c1e-8d47-4f3a-b1c5-2e7d90a4f6b8/leave`
- **THEN** API 回 200，回應是 `{"deviceId":"2d6f0a7e-3c1b-4e8a-9f52-6b7c8d9e0f1a"}`；Brisbane 的成員手機是 Taylor 的手機和 Casey 的手機，鑰匙世代仍是 1，群組需要換鑰匙

#### Scenario: 群組滿了、進度落後的手機照樣退出

- **WHEN** Brisbane 存著的事件的大小剛好是 10,485,760 bytes，Dana 的手機沒有下載過；Dana 的手機退出
- **THEN** 退出好了

#### Scenario: 接連退出

- **WHEN** Dana 的手機退出之後，Casey 的手機也退出
- **THEN** 都退出好了；Brisbane 只有 Taylor 的手機一支成員手機，仍需要換鑰匙

#### Scenario: 退出的手機留下的東西

- **WHEN** API 存著給 Dana 的手機的完整快照和一個鑰匙的 box；Dana 的手機退出
- **THEN** 資料庫裡找不到那份快照任何一塊的內容和那個 box；別支手機的進度和 box 都還在

### Requirement: SHARING-255.1 最後一支成員手機退出時刪除群組

WHEN 退出的是群組最後一支成員手機，the API SHALL 在同一個 transaction 裡刪除這個群組：群組、它的事件、快照、鑰匙的 box、邀請的名片、申請和交接都不再存著；它的邀請的代號仍是 API 見過的代號（SHARING-80.1）。之後這個群組 ID 和沒有建立過的一樣：下載被拒絕，原因是不是成員；建立群組的請求（SYNC-45.1）建立一個新的群組，鑰匙世代是 1，沒有事件。

#### Scenario: 只有一支成員手機的群組

- **WHEN** Brisbane 只有 Taylor 的手機一支成員手機，有兩個事件、代號 A 的有效邀請和 Casey 的手機的申請 P；Taylor 的手機退出
- **THEN** 退出好了；資料庫裡找不到那兩個事件的內容、名片和 P；讀代號 A 被拒絕，原因是沒有這個邀請；Taylor 的手機下載 Brisbane 被拒絕，原因是不是成員

#### Scenario: 一支一支退出到最後

- **WHEN** Dana 的手機、Casey 的手機和 Taylor 的手機依序退出
- **THEN** 前兩次之後 Brisbane 還在；第三次之後資料庫裡找不到 Brisbane 的任何事件

#### Scenario: 同一個群組 ID 再建立

- **WHEN** 接著 Casey 的手機建立 Brisbane，上傳一個事件；再用代號 A 建立邀請
- **THEN** 群組建立好了，Casey 的手機是它唯一的成員手機，那個事件的序號是 1，鑰匙世代是 1；用代號 A 建立邀請被拒絕，原因是沒有這個邀請

### Requirement: SHARING-256.1 需要換鑰匙的群組先換鑰匙，才收上傳、同意和已經跟上的下載

WHILE 群組需要換鑰匙，the API SHALL 拒絕這三種請求，原因是需要換鑰匙，回應帶著這個群組現在每一支成員手機的裝置 ID，由小到大；什麼都不改，下載也不記進度：帶著這個群組還沒有的事件的上傳（SYNC-50.1）；同意的請求（SHARING-173.2）；`after` 等於群組最新的序號的下載（SYNC-57.3）。`after` 比群組最新的序號小的下載照常回答一頁、需要快照的回答或從這裡接著的回答（SYNC-136.2、SYNC-171.1），所以還沒跟上的手機先把事件收完，收完之後下一次同步才輪到它換。只帶著群組已經有的事件的上傳照常回答序號（SYNC-51.1）。列出和拒絕申請、建立和撤回邀請、上傳和下載快照、拿鑰匙和退出都照常。換鑰匙的請求成功之後（SHARING-250.1），這三種請求照常處理。所以離開的手機知道的那把鑰匙，不會再加密任何新的事件。

#### Scenario: 上傳

- **WHEN** Dana 的手機退出之後，Taylor 的手機用鑰匙世代 1 上傳一個新事件
- **THEN** 被拒絕，原因是需要換鑰匙（409），回應是 `{"error":"rotation-needed","devices":["0f8fad5b-d9cb-469f-a165-70867728950e","7c9e6679-7425-40de-944b-e07fc1f90ae7"]}`；那個事件沒有存下

#### Scenario: 已經跟上的下載

- **WHEN** Brisbane 有三個事件，Dana 的手機退出；Casey 的手機在 T+1,000 從 cursor 3 下載
- **THEN** 被拒絕，原因是需要換鑰匙，回應帶著同樣的兩個裝置 ID；資料庫裡 Casey 的手機沒有因為這個請求多出進度

#### Scenario: 還沒跟上的下載

- **WHEN** Brisbane 有三個事件，Dana 的手機退出；Casey 的手機從 cursor 0 和 cursor 2 下載
- **THEN** 分別得到序號 1 到 3 的事件和序號 3 的事件，都說之後沒有事件了

#### Scenario: 同意

- **WHEN** Brisbane 有代號 A 的有效邀請，別的手機送出了申請 P，Taylor 的手機替它上傳了完整的快照；Dana 的手機退出之後，Taylor 的手機同意那個申請
- **THEN** 被拒絕，原因是需要換鑰匙；申請 P 還在，那支手機不是成員手機

#### Scenario: 只有群組已經有的事件

- **WHEN** Brisbane 有事件 A；Dana 的手機退出之後，Taylor 的手機再上傳 A
- **THEN** API 回答 A 的序號 1

#### Scenario: 照常的請求

- **WHEN** Dana 的手機退出之後，Taylor 的手機列出申請、建立代號 B 的邀請、替 Casey 的手機上傳 S、拿鑰匙
- **THEN** 都照常回答

#### Scenario: 換過之後

- **WHEN** Dana 的手機退出之後，Taylor 的手機送 `epoch` 是 2、`remove` 是空的、`boxes` 是 BT 和 BC 的換鑰匙的請求；之後它用鑰匙世代 2 上傳一個新事件，Casey 的手機從 cursor 1 下載
- **THEN** 那個事件存下，序號是 2；Casey 的手機得到它

### Requirement: SHARING-257.1 不再是成員手機的手機，對這個群組的每個請求都被拒絕

WHEN 一支手機被移除（SHARING-250.1）或退出（SHARING-254.1），the API SHALL 從那個 transaction 起拒絕它對這個群組的每個請求，原因是不是成員，回應和從來不是成員手機的手機得到的一模一樣：上傳、下載、快照的三個請求、建立和撤回邀請、列出、同意和拒絕申請、換鑰匙、拿鑰匙和退出。它的裝置身分、它在別的群組的成員手機資格都不變；它仍可以讀邀請、送申請，被同意之後又是這個群組的成員手機，進度從那次同意算起（SHARING-173.2）。

#### Scenario: 被移除之後

- **WHEN** Taylor 的手機移除 Dana 之後，Dana 的手機對 Brisbane 送：上傳、下載、問有沒有快照、上傳一塊快照、下載一塊快照、建立邀請、撤回邀請、列出申請、同意、拒絕、換鑰匙、拿鑰匙和退出
- **THEN** 十三個請求都被拒絕，原因是不是成員（403），回應和一支註冊過、從來不是成員手機的手機送同樣的請求時一模一樣；資料庫除了這些請求的紀錄都不變

#### Scenario: 退出之後

- **WHEN** Dana 的手機退出之後，再從 cursor 0 下載 Brisbane，再退出一次
- **THEN** 兩個請求都被拒絕，原因是不是成員

#### Scenario: 別的群組不受影響

- **WHEN** Dana 的手機也是 Tokyo 的成員手機；Taylor 的手機把它移出 Brisbane 之後，它在 Tokyo 上傳一個事件
- **THEN** 那個事件存下

#### Scenario: 被移除的手機還沒加入

- **WHEN** Dana 的手機是用代號 A 被同意而成為成員手機的，還沒有下載過；Taylor 的手機移除 Dana 之後，Dana 的手機問代號 A 的結果
- **THEN** 回應是 `{"state":"none"}`，不是同意了

#### Scenario: 再被同意

- **WHEN** Taylor 的手機移除 Dana 之後，Dana 的手機在代號 A 送出申請，Casey 的手機替它上傳完整的快照並同意它；Dana 的手機拿鑰匙，`after` 是 0
- **THEN** Dana 的手機是成員手機；拿到的是沒有 box 的一頁，它被移除之前的 box 不在裡面

### Requirement: SHARING-259.1 成員手機拿給它的鑰匙的 box

WHEN 成員手機送拿鑰匙的請求，the API SHALL 回傳這個群組替它存著、鑰匙世代比 `after` 大的鑰匙的 box，依鑰匙世代由小到大，每一個帶著鑰匙世代、交出方的 box 公開金鑰（`senderKey`）和 box；一頁最多 100 個，並說這一頁之後還有沒有。在同一個請求裡，API 不再存著這支手機在這個群組、鑰匙世代不比 `after` 大的 box：`after` 是手機已經存好群組鑰匙的最大世代。別支手機的 box 不變。回應帶著 `Cache-Control: no-store`。

#### Scenario: 換過一次

- **WHEN** Taylor 的手機移除 Dana 之後，Casey 的手機送 `GET /groups/9b2f6c1e-8d47-4f3a-b1c5-2e7d90a4f6b8/keys?after=1`；Taylor 的手機送同樣的請求
- **THEN** Casey 的手機得到 `{"keys":[{"epoch":2,"senderKey":"<K 的十六進位>","box":"<BC 的十六進位>"}],"more":false}`，標頭有 `Cache-Control: no-store`；Taylor 的手機得到的 box 是 BT

#### Scenario: 再問一次

- **WHEN** Casey 的手機再用 `after=1` 問一次
- **THEN** 得到同樣的回應；資料庫裡 BC 仍剛好一份

#### Scenario: 存好之後

- **WHEN** 接著 Casey 的手機用 `after=2` 問
- **THEN** 得到 `{"keys":[],"more":false}`；資料庫裡找不到 BC，BT 仍剛好一份

#### Scenario: 換過兩次

- **WHEN** Taylor 的手機移除 Dana 之後，另一支手機被同意而成為成員手機，Taylor 的手機再用 `epoch` 3 把它移除；Casey 的手機用 `after=1` 問，再用 `after=2` 問
- **THEN** 前一次得到鑰匙世代 2 和 3 的兩個 box，依這個順序；後一次只得到鑰匙世代 3 的

#### Scenario: after 是 0

- **WHEN** Taylor 的手機移除 Dana 之後，Casey 的手機用 `after=0` 問
- **THEN** 得到鑰匙世代 2 的 box

#### Scenario: 沒有 box

- **WHEN** Brisbane 沒有換過鑰匙，Taylor 的手機用 `after=1` 問
- **THEN** 得到 `{"keys":[],"more":false}`

#### Scenario: 一頁最多 100 個

- **WHEN** Brisbane 換過 101 次鑰匙，每次都有給 Casey 的手機的 box；Casey 的手機用 `after=1` 問，再用 `after=101` 問
- **THEN** 前一次得到鑰匙世代 2 到 101 的 100 個 box，說之後還有；後一次得到鑰匙世代 102 的那一個，說之後沒有

### Requirement: SHARING-260.1 鑰匙的 box 留到手機拿走，或它不再是成員手機為止

The API SHALL 讓一個鑰匙的 box 存到這兩件事之一發生為止：收件的手機用不比它的鑰匙世代小的 `after` 拿鑰匙（SHARING-259.1），或收件的手機不再是這個群組的成員手機（SHARING-250.1、SHARING-254.1）。清除不刪它（SYNC-141.3），不管過了多久：離線再久的成員手機回來時，都拿得到它不在的時候換過的每一把鑰匙。

#### Scenario: 一年之後

- **WHEN** Taylor 的手機在 T 移除 Dana；在 T+365D 清除；之後 Casey 的手機用 `after=1` 拿鑰匙
- **THEN** 得到鑰匙世代 2 的 box BC

#### Scenario: 收件的手機離開之後

- **WHEN** Taylor 的手機移除 Dana 之後，Casey 的手機退出
- **THEN** 資料庫裡找不到 BC；BT 仍剛好一份

### Requirement: SHARING-261.1 換鑰匙、退出和拿鑰匙的請求寫得不對

IF 換鑰匙、退出或拿鑰匙的請求寫得不對，THEN the API SHALL 拒絕，原因是內容不對：群組 ID 不是小寫的第 4 版 UUID；換鑰匙或退出的網址帶了查詢；退出的請求帶了內容；換鑰匙的內容不是剛好有 `epoch`、`remove`、`senderKey`、`boxes` 和 `events` 五個欄位的 JSON 物件，`epoch` 不是 2 到 9,007,199,254,740,991 之間的整數，`remove` 不是 0 到 19 個不重複的小寫第 4 版 UUID 的陣列，`senderKey` 不是 32 bytes 的小寫十六進位寫法，`boxes` 不是 1 到 20 項的陣列、每一項剛好有 `deviceId` 和 `box` 兩個欄位，`deviceId` 不是小寫的第 4 版 UUID 或在 `boxes` 裡重複，`box` 不是 41 到 1,024 bytes 的小寫十六進位寫法，同一個裝置 ID 同時在 `remove` 和 `boxes` 裡，或 `events` 不是 0 到 100 個合上傳的規定的事件（SYNC-53.1：各有不重複的事件 ID 和 41 到 65,536 bytes 的內容），和上傳不同的只是可以一個都沒有；拿鑰匙的查詢不是剛好一個 `after`，它的值不是 0 到 9,007,199,254,740,991 之間的整數的十進位寫法（沒有正負號、小數點、多餘的 0 和 `%` 的寫法）。

#### Scenario: 路徑和查詢

- **WHEN** Taylor 的手機換鑰匙、退出和拿鑰匙時，群組 ID 是大寫的 `9B2F6C1E-8D47-4F3A-B1C5-2E7D90A4F6B8` 或 `brisbane`；換鑰匙和退出的網址後面帶 `?x=1`；拿鑰匙沒有查詢，或查詢是 `after=`、`after=-1`、`after=1.5`、`after=01`、`after=abc`、`after=%31`、`after=9007199254740992`、`epoch=1`、`after=1&x=1` 或 `after=1&after=1`
- **THEN** 都被拒絕，原因是內容不對（400）；Brisbane 的成員手機和鑰匙世代都不變

#### Scenario: 退出帶了內容

- **WHEN** Dana 的手機退出的請求帶著內容 `{}`
- **THEN** 被拒絕，原因是內容不對；Dana 的手機仍是成員手機

#### Scenario: 換鑰匙的內容

- **WHEN** 移除 Dana 的內容是：0 bytes、`{}`、一個陣列、不是 JSON 的文字；少了五個欄位裡的任何一個；多帶 `"cursor":0`；`epoch` 是 0、1、1.5 或文字 `2`；`remove` 不是陣列、有 20 項、有重複的兩項，或有一項是 `dana`；`senderKey` 是 31 bytes，或大寫的十六進位；`boxes` 是空的陣列、有 21 項、有兩項的 `deviceId` 相同、有一項多帶 `"epoch":2`、有一項的 `box` 是 40 bytes 或 1,025 bytes；Dana 的手機同時在 `remove` 和 `boxes` 裡；`events` 不是陣列、有 101 個事件、有兩個事件 ID 相同的事件，或有一個內容是 40 bytes 的事件
- **THEN** 都被拒絕，原因是內容不對；Dana 的手機仍是成員手機，鑰匙世代仍是 1

### Requirement: SHARING-262.1 換鑰匙、退出和拿鑰匙的請求有不只一個問題時的原因

IF 換鑰匙、退出或拿鑰匙的請求有不只一個會讓它被拒絕的問題，THEN the API SHALL 回報這個順序裡最前面的原因：對簽名的請求的檢查（SHARING-31.2）；內容不對（SHARING-261.1）；不是成員（SHARING-257.1）；成員手機不一樣（SHARING-251.1）；鑰匙世代（SHARING-252.1）；不必換鑰匙（SHARING-253.1）；群組滿了，也就是請求帶的事件存下之後，群組存著的事件的大小會超過上限（SYNC-56.1）。被對簽名的請求的檢查以外的原因拒絕的請求，已經通過那些檢查：它算進這支裝置的請求數（SHARING-37.1），原樣再送一次是重送（SHARING-36.1）；除此之外，每個群組、它的成員手機、鑰匙世代、事件、快照、box、邀請、申請和交接都和收到它之前一樣。

#### Scenario: 沒簽名或沒註冊

- **WHEN** 換鑰匙、退出和拿鑰匙的請求，沒帶簽名的四個欄位，或由還沒註冊的手機簽名
- **THEN** 六個請求都被拒絕，原因是簽名，資料庫不變

#### Scenario: 寫法先於是不是成員

- **WHEN** 一支註冊過、不是成員手機的手機對 Brisbane 送內容是 `{}` 的換鑰匙的請求，送帶著內容的退出的請求，和沒有查詢的拿鑰匙的請求
- **THEN** 都被拒絕，原因是內容不對

#### Scenario: 是不是成員先於其他

- **WHEN** 一支註冊過、不是成員手機的手機，對 Brisbane 和還沒有建立的 Tokyo 各送：`epoch` 是 9 的移除 Dana 的請求、退出的請求和 `after=1` 的拿鑰匙的請求
- **THEN** 六個請求都被拒絕，原因是不是成員，兩個群組得到的回應一模一樣

#### Scenario: 之後依序是成員手機不一樣、鑰匙世代、不必換鑰匙、群組滿了

- **WHEN** Brisbane 存著的事件的大小離上限只剩 199 bytes，不需要換鑰匙；Taylor 的手機送換鑰匙的請求，`epoch` 是 3、`remove` 是空的、`boxes` 只有 BT、`events` 是 200 bytes 的 E；把 `boxes` 改成給三支成員手機的再送；再把 `epoch` 改成 2；再把 `remove` 改成 Dana 的手機、`boxes` 改成 BT 和 BC
- **THEN** 四次的原因依序是成員手機不一樣、鑰匙世代、不必換鑰匙、群組滿了（413）；Dana 的手機仍是成員手機，鑰匙世代仍是 1

#### Scenario: 被拒絕的請求用掉了 nonce

- **WHEN** Taylor 的手機用 `epoch` 3 移除 Dana，被拒絕，原因是鑰匙世代；同一個請求原樣再送一次
- **THEN** 第二次被拒絕，原因是重送

### Requirement: SHARING-263.1 關於移除、退出和換鑰匙，API 只存成員手機、鑰匙世代和鑰匙的 box

The API SHALL 關於移除、退出和換鑰匙只存：群組現在的成員手機、現在的鑰匙世代、它需不需要換鑰匙、請求帶的事件（SHARING-250.1），和每個鑰匙的 box 的收件裝置 ID、鑰匙世代、交出方的 box 公開金鑰和 box。被拒絕的換鑰匙的請求帶的 box、公開金鑰和事件，以及請求的其他標頭都不存；離開的手機的進度、給它的快照、box 和交接都不留（SHARING-250.1、SHARING-254.1）。新的群組鑰匙和算 box 的 salt 用的上一把群組鑰匙都不在任何請求裡（SHARING-272.1），所以 API 打不開 box；哪支手機代表哪位成員、誰移除了誰，都只寫在加密的事件裡。

#### Scenario: 移除之後的資料庫

- **WHEN** Taylor 的手機移除 Dana，請求帶著 `User-Agent: TaylorsPhone/1.0` 和 `X-Member-Name: Dana-Kim`
- **THEN** 資料庫裡找得到 BT、BC、K 和 E 的內容，各剛好一份；找不到 `TaylorsPhone` 和 `Dana-Kim`

#### Scenario: 被拒絕的換鑰匙

- **WHEN** Taylor 的手機用 `epoch` 3 移除 Dana；或移除 Dana 時 `boxes` 只有 BT
- **THEN** 資料庫裡找不到這兩個請求帶的 box、公開金鑰和事件的內容，不論是原始的 bytes、十六進位還是 Base64

#### Scenario: 退出之後的資料庫

- **WHEN** Dana 的手機退出，請求帶著 `X-Reason: moving-out`
- **THEN** 資料庫裡找不到 `moving-out`，也沒有同時記著 Brisbane 的群組 ID 和 Dana 的手機的裝置 ID 的資料

### Requirement: SHARING-264.1 同樣的路徑配上別的方法，不是換鑰匙、退出和拿鑰匙的請求

IF 簽名的請求打 `/groups/<群組 ID>/rotation` 或 `/groups/<群組 ID>/leave` 而方法不是 `POST`，或打 `/groups/<群組 ID>/keys` 而方法不是 `GET`，THEN the API SHALL 把它當成路徑沒有路由的請求，回答找不到，不改任何群組。`HEAD` 也一樣：它不是拿鑰匙。

#### Scenario: 別的方法

- **WHEN** Taylor 的手機對 `/groups/9b2f6c1e-8d47-4f3a-b1c5-2e7d90a4f6b8/rotation` 送 `GET`、`HEAD`、`DELETE` 和帶著換鑰匙的內容的 `PUT`；對 `/groups/9b2f6c1e-8d47-4f3a-b1c5-2e7d90a4f6b8/leave` 送 `GET`、`HEAD`、`PUT` 和 `DELETE`；對 `/groups/9b2f6c1e-8d47-4f3a-b1c5-2e7d90a4f6b8/keys?after=1` 送 `HEAD`、`POST`、`PUT` 和 `DELETE`
- **THEN** 十二個請求都得到找不到（404），不是任何一種拒絕；Brisbane 的三支成員手機都還在，鑰匙世代仍是 1

### Requirement: SHARING-265.1 同時到的換鑰匙、同意和退出，結果和一個接一個到的一樣

WHEN 同一個群組的幾個換鑰匙、同意或退出的請求同時送到，the API SHALL 讓結果和它們一個接一個處理的某一種順序一樣：照同一個鑰匙世代換鑰匙的幾個請求只有一個成功；同意和換鑰匙同時到時，新手機成了成員手機的話，沒有給它的 box 的那個換鑰匙的請求就被拒絕，原因是成員手機不一樣，換鑰匙先成功的話，照舊的鑰匙世代的同意就被拒絕（SHARING-179.1）。所以群組裡不會有成員手機少了它那個鑰匙世代的 box，也不會有離開了的手機拿到新的 box。

#### Scenario: 兩支成員手機同時移除同一支

- **WHEN** 五個群組各有三支成員手機；其中兩支同時各送一個移除第三支的換鑰匙的請求，`epoch` 都是 2，`boxes` 各是自己裝的兩個
- **THEN** 每個群組都剛好一個請求得到換好了，另一個被拒絕，原因是成員手機不一樣或鑰匙世代；每個群組的鑰匙世代是 2，存著的 box 只有成功的那個請求的兩個，事件也只有它帶的

#### Scenario: 換鑰匙和同意同時

- **WHEN** 五個群組各有 Taylor 的手機和另一支成員手機、一個申請，和給申請的手機的一份完整快照；Taylor 的手機同意那個申請，另一支成員手機同時送移除 Taylor 的手機、`boxes` 只有它自己的換鑰匙的請求
- **THEN** 每個群組都是這兩種之一：同意好了，換鑰匙被拒絕，原因是成員手機不一樣，三支都是成員手機，鑰匙世代是 1；或換好了，同意被拒絕，原因是不是成員，申請還在，成員手機只有另一支，鑰匙世代是 2

#### Scenario: 退出和換鑰匙同時

- **WHEN** 五個群組各有三支成員手機；其中一支退出，另一支同時送移除它、`boxes` 是另外兩支的換鑰匙的請求
- **THEN** 每個群組那支手機都不是成員手機；換鑰匙的請求得到換好了，或被拒絕、原因是成員手機不一樣，這時群組需要換鑰匙，鑰匙世代仍是 1

### Requirement: SHARING-270.1 確認移除之後同步、備好換鑰匙的請求，再送出

WHEN 使用者在移除的確認框按「Remove」（GROUPS-150.1），the mobile app SHALL 依序做這些事：同步這個共同帳本一次（SYNC-68.2），這次同步不管做完了沒有都接著做；然後在同一個 SQLite transaction 裡，照那一刻的本機資料找出要離開的手機和留下來的手機、備好事件（SHARING-271.1）、產生新的群組鑰匙並裝好每一個 box（SHARING-272.1）；送換鑰匙的請求（SHARING-250.1），`epoch` 是這支手機在這個共同帳本的鑰匙世代（SYNC-94.1）加 1，`remove` 是要移除的手機，`senderKey`、`boxes` 和 `events` 照 SHARING-271.1 和 SHARING-272.1。要移除的手機，是名冊裡代表這位成員的每一支別的手機（SYNC-251.2），不看那筆紀錄的使用者 ID；留下來的手機，是名冊裡代表某位成員的其餘每一支手機，加上這支手機自己。API 回答換好了之前，本機資料不因為這次移除而變：那位成員仍是成員，沒有多的待上傳的事件，這支手機的鑰匙世代也不變。IF 那一刻名冊裡已經沒有別支手機代表這位成員——同步帶來了他離開的事件——THEN the mobile app SHALL 不送換鑰匙的請求：他仍是群組的成員時，照 GROUPS-26.2 把他移出群組；已經是前成員時什麼都不做。這支手機不必跟上群組最新的序號：同步得到需要快照的回答（SYNC-136.2）、這支手機還在等快照（SYNC-164.1）時照樣送。

#### Scenario: 移除 Dana

- **WHEN** 在 Members 點 Dana 那一列，選「Remove from Group」，再按「Remove」
- **THEN** API 依序收到：Brisbane 的下載；一個 `POST /groups/<Brisbane 的群組 ID>/rotation`，它的 `epoch` 是 2，`remove` 只有 D，`boxes` 只有給這支手機的那一個

#### Scenario: API 回答之前

- **WHEN** API 還沒回答換鑰匙的請求
- **THEN** Members 仍列出 Dana，她那一列有「Joined」；本機資料沒有待上傳的事件，secure store 裡沒有 Brisbane 鑰匙世代 2 的群組鑰匙

#### Scenario: 留下來的別支手機

- **WHEN** 另一支手機 E 被同意代表 Casey，Taylor 的手機同步過；Taylor 的手機移除 Dana
- **THEN** 換鑰匙的請求的 `remove` 只有 D，`boxes` 是給這支手機和 E 的兩個

#### Scenario: 兩支手機代表同一位成員

- **WHEN** 名冊裡 D 和另一支手機 E 都代表 Dana；Taylor 的手機移除 Dana
- **THEN** 換鑰匙的請求的 `remove` 是 D 和 E

#### Scenario: 別支手機用你的使用者 ID 代表別人

- **WHEN** D 的名冊紀錄的使用者 ID 是 Taylor 的使用者 ID，所以這支手機上 Dana 沒有使用者 ID；Taylor 的手機移除 Dana
- **THEN** 先跳出移除的確認框（GROUPS-150.1）；按「Remove」之後 API 收到換鑰匙的請求，`remove` 是 D

#### Scenario: 同步之後他已經沒有手機

- **WHEN** 另一支手機 E 代表 Casey；Dana 的手機退出之後，E 替群組換了鑰匙；Taylor 的手機還沒有同步，在 Dana 的確認框按「Remove」
- **THEN** API 收到 Brisbane 的下載，沒有收到換鑰匙的請求；Members 不再列出 Dana，沒有跳出提示框

#### Scenario: 自己也在等快照的手機

- **WHEN** Brisbane 的事件在清除裡都刪了，群組清到的序號比這支手機的 cursor 大，所以它的下載得到需要快照的回答；它移除 Dana
- **THEN** API 仍收到換鑰匙的請求，回答換好了；Dana 的手機不是成員手機

### Requirement: SHARING-271.1 換鑰匙帶的事件說誰離開了

WHEN 備換鑰匙的請求，the mobile app SHALL 讓 `events` 依序是這些事件，各有新的事件 ID，各照 SYNC-67.1 用新的群組鑰匙和新的鑰匙世代加密：對每一位沒有任何留下來的手機代表、卻有要離開的手機代表的成員，只要他的「是否被移出群組」還是否，一個把它改成是的事件（SYNC-34.1）；對每一支要離開的手機，一個把它的名冊紀錄改成不代表任何人的事件（SYNC-250.2）。要離開的手機，是要移除的手機（SHARING-270.1），加上名冊裡代表某位成員、卻不在留下來的手機裡的每一支手機：它已經退出，或被別支手機移除而那些事件沒有留下。每個事件帶著根據的版本，格式版本是 1，時間戳記是用校正後的時間和這支手機的裝置 ID 取的新時間戳記（SYNC-2.1），一個接一個；取的時候就記下手機看過的最新時間戳記，並和待上傳的事件一樣先檢查過（SYNC-84.1、SYNC-85.1），和同意帶的事件一樣（SHARING-196.2）。沒有要離開的手機時 `events` 是空的陣列。

#### Scenario: 移除 Dana

- **WHEN** 手機的時鐘和 API 的時間是 T+60,000，Taylor 的手機移除 Dana
- **THEN** 換鑰匙的請求有兩個事件，用新的群組鑰匙和鑰匙世代 2 的附加資料解得開，依序是：成員 Dana 的事件，只把「是否被移出群組」改成是；名冊紀錄 D 的事件，把代表改成不代表任何人。兩個都帶著根據的版本，時間戳記依序是 `T+60000/0/<這支手機的裝置 ID>` 和計數器 1 的；用鑰匙世代 1 的群組鑰匙解不開

#### Scenario: 還有別支手機代表他

- **WHEN** 名冊裡 D 和另一支手機 E 都代表 Dana；D 退出了，沒有手機替群組換過鑰匙；Taylor 的手機替群組換鑰匙（SHARING-275.1），API 說成員手機是這支手機和 E，所以只有 D 要離開
- **THEN** 換鑰匙的請求的 `remove` 是空的，只有一個事件：名冊紀錄 D 改成不代表任何人；沒有 Dana 的成員事件

#### Scenario: 已經退出的手機

- **WHEN** Dana 的手機退出了，沒有手機替群組換過鑰匙；另一支手機 E 代表 Casey；Taylor 的手機替群組換鑰匙（SHARING-275.1），API 說成員手機是這支手機和 E
- **THEN** 換鑰匙的請求的 `remove` 是空的，事件依序是 Dana 的成員事件和名冊紀錄 D 的事件

#### Scenario: 他已經被移出群組

- **WHEN** 別支手機先把 Dana 的「是否被移出群組」改成是，她因為有手機仍是成員（SYNC-36.4）；Taylor 的手機移除 Dana
- **THEN** 換鑰匙的請求只有一個事件：名冊紀錄 D 改成不代表任何人

### Requirement: SHARING-272.1 新的群組鑰匙裝在給每支留下來的手機的 box 裡

WHEN 備換鑰匙的請求，the mobile app SHALL 用 `expo-crypto` 給的 32 bytes 當新的群組鑰匙，每次備請求都是新的；並替每一支留下來的手機各裝一個 box（SHARING-8.1），這支手機自己也有一個：交出方的私鑰是這支手機的 box 私鑰（SHARING-136.1），`senderKey` 是它的公開金鑰；收受方的公開金鑰是那支手機的名冊紀錄的 box 公開金鑰，自己的那一個用這支手機的 box 公開金鑰；salt 是從這支手機在這個共同帳本現在的鑰匙世代的群組鑰匙那 32 bytes 導出的金鑰，用途是 `shared-expense/group-key/rotation/v1`，導出時不給 salt（SHARING-12.1）；情境是四行以換行（`0x0A`）相連、最後一行後面沒有換行的 UTF-8：`shared-expense/group-key/rotation/v1`、群組 ID、收件的裝置 ID，和新的鑰匙世代的十進位寫法；nonce 是 `expo-crypto` 給的 24 bytes，每個 box 都是新的。box 的內容是 JSON 物件 `{"keys":[{"epoch":<新的鑰匙世代>,"key":"<新的群組鑰匙的 64 個小寫十六進位字元>"}]}`（`JSON.stringify`，沒有多餘的空白，UTF-8）。沒有上一把群組鑰匙的人算不出 salt，所以 API 換掉公開金鑰或 box，收件的手機就打不開；收件的手機打得開，就知道交出的手機有上一把鑰匙，是那時的成員手機。IF 留下來的手機裡有一支在名冊裡沒有代表某位成員的紀錄，或這支手機沒有現在的鑰匙世代的群組鑰匙，THEN the mobile app SHALL 不送換鑰匙的請求（SHARING-274.1、SHARING-275.1）。

#### Scenario: 留下來的手機打得開

- **WHEN** 另一支手機 E 代表 Casey；Taylor 的手機移除 Dana
- **THEN** 用 E 的 box 私鑰、請求的 `senderKey`、從 Brisbane 鑰匙世代 1 的群組鑰匙導出的 salt，和 `shared-expense/group-key/rotation/v1`、Brisbane 的群組 ID、E、`2` 這四行的情境打開給 E 的 box，得到 `{"keys":[{"epoch":2,"key":"<64 個小寫十六進位字元>"}]}`；用這支手機的 box 私鑰和它自己的裝置 ID 的情境打開給它自己的那一個，得到同一把鑰匙；那把鑰匙是 `expo-crypto` 給的 32 bytes，不是鑰匙世代 1 的那一把

#### Scenario: 少了上一把鑰匙就打不開

- **WHEN** 打開給 E 的 box 時不給 salt，改用從別的 32 bytes 導出的 salt，把情境的群組 ID 換成 Tokyo 的，把裝置 ID 換成這支手機的，把鑰匙世代換成 `3`，或把 `senderKey` 換成別把公開金鑰
- **THEN** 都打不開

#### Scenario: 被移除的手機沒有 box

- **WHEN** Taylor 的手機移除 Dana
- **THEN** `boxes` 裡沒有 D 的；用 Dana 的手機的 box 私鑰打不開請求裡任何一個 box

#### Scenario: 每次都是新的

- **WHEN** 第一個換鑰匙的請求被拒絕，原因是成員手機不一樣，Taylor 的手機再送一次（SHARING-274.1）
- **THEN** 兩個請求的 box 解開的群組鑰匙不同，每個 box 的第 2 到第 25 個 byte 也都不同

### Requirement: SHARING-273.1 換好了之後存下新的群組鑰匙，再同步

WHEN API 回答換好了，the mobile app SHALL 照 SYNC-94.1 替這個共同帳本存下新的群組鑰匙，鑰匙世代是回應的 `epoch`，再同步這個共同帳本：下載到自己剛才送出的事件並照常套用（SYNC-28.3），離開的成員和名冊紀錄是這時才改進本機資料的。之後被移除的成員是前成員，Members 不再列出他（GROUPS-24.4），他的付款和分攤都不變（GROUPS-66.1），比這次離開早的邀請被撤回（SHARING-284.1）。IF 新的群組鑰匙存不進 secure store，THEN the mobile app SHALL 照常同步：它用給自己的那個 box 拿回這把鑰匙（SHARING-278.1）。

#### Scenario: 移除 Dana 之後

- **WHEN** 有 Dana 付、三個人分攤的 Dinner；Taylor 的手機移除 Dana，API 回答換好了
- **THEN** Members 的成員由上而下是「Taylor (You)」、「Casey」和「Blake」；Dana 是前成員，Dinner 的付款和分攤都不變；secure store 裡有 `group-key.<Brisbane 的群組 ID>.2`；Brisbane 沒有邀請時，本機資料沒有待上傳的事件

#### Scenario: 之後用新的鑰匙記帳

- **WHEN** 接著新增 Lunch 並同步
- **THEN** 上傳的請求的鑰匙世代是 2，用新的群組鑰匙解得開那個事件

#### Scenario: 回答沒有送到

- **WHEN** API 換好了，回應卻沒送到手機；之後重新啟動 app
- **THEN** 先是跳出「Unable to Remove Member」（SHARING-274.1），Members 仍列出 Dana；重新啟動之後這支手機拿到給它自己的 box，存下鑰匙世代 2 的群組鑰匙，Members 不再列出 Dana

#### Scenario: 鑰匙存不進去

- **WHEN** API 回答換好了，secure store 這時卻寫不進去；恢復之後重新啟動 app
- **THEN** 重新啟動之後 secure store 裡有鑰匙世代 2 的群組鑰匙，Members 不再列出 Dana

### Requirement: SHARING-274.1 成員名單或鑰匙世代變了時更新之後再試，移除沒成功時說明

IF API 拒絕移除時送的換鑰匙的請求，THEN the mobile app SHALL 照原因處理，不跳出提示框，一次移除這樣最多再送兩次：原因是成員手機不一樣時，再同步這個共同帳本，把回應的 `devices` 當成群組現在的成員手機，照 SHARING-270.1 到 SHARING-272.1 重新備請求再送，這時留下來的手機是那份名單去掉要移除的手機，要移除的手機只算還在名單裡的；原因是鑰匙世代時，拿新的鑰匙（SHARING-278.1）、再同步，重新備請求再送；原因是不必換鑰匙時，當成移除好了，同步這個共同帳本。IF 移除沒有做完，THEN the mobile app SHALL 不因此改本機資料，那位成員仍在，並跳出標題是「Unable to Remove Member」的提示框：同步或換鑰匙的請求沒有得到回應時，訊息是「Connect to the internet and try again.」；其他情況——再送兩次之後仍被拒絕、留下來的手機在名冊裡沒有紀錄、沒有現在的群組鑰匙、別的拒絕和看不懂的回應——是「Something went wrong. Try again later.」。

#### Scenario: 沒有網路

- **WHEN** 手機沒有網路，在 Dana 的確認框按「Remove」
- **THEN** 跳出「Unable to Remove Member」，訊息是「Connect to the internet and try again.」；Members 仍列出 Dana；本機資料沒有待上傳的事件

#### Scenario: 準備之後有手機加入

- **WHEN** API 拒絕第一個換鑰匙的請求，原因是成員手機不一樣，名單多了別支手機 E；這時 E 的名冊紀錄的事件已經在 API 上
- **THEN** 沒有跳出提示框；API 接著收到 Brisbane 的下載和第二個換鑰匙的請求，它的 `boxes` 是給這支手機和 E 的；API 回答換好了之後，Members 不再列出 Dana

#### Scenario: 要移除的手機已經不在

- **WHEN** Dana 的手機在 Taylor 的手機同步之後退出；Taylor 的手機移除 Dana，API 拒絕第一個請求，原因是成員手機不一樣，名單只有這支手機
- **THEN** 第二個換鑰匙的請求的 `remove` 是空的，`boxes` 只有給這支手機的，事件是 Dana 的成員事件和名冊紀錄 D 的事件；API 回答換好了之後，Members 不再列出 Dana

#### Scenario: 別人先換了鑰匙

- **WHEN** 別支成員手機 E 剛移除了另一支手機，Brisbane 的鑰匙世代是 2，這支手機還沒有那把鑰匙；Taylor 的手機移除 Dana，API 拒絕第一個請求，原因是鑰匙世代
- **THEN** API 接著收到拿鑰匙的請求、Brisbane 的下載和第二個換鑰匙的請求，它的 `epoch` 是 3；box 的 salt 是從鑰匙世代 2 的群組鑰匙導出的

#### Scenario: 不必換鑰匙

- **WHEN** 重新備的請求沒有手機要離開，API 拒絕它，原因是不必換鑰匙
- **THEN** 沒有跳出提示框；API 接著收到 Brisbane 的下載

#### Scenario: 一直被拒絕

- **WHEN** API 每次都拒絕換鑰匙的請求，原因是成員手機不一樣
- **THEN** API 一共收到三個換鑰匙的請求；之後跳出「Unable to Remove Member」，訊息是「Something went wrong. Try again later.」；Members 仍列出 Dana

#### Scenario: 留下來的手機不在名冊裡

- **WHEN** API 回答成員手機不一樣，名單裡有一支這支手機同步之後名冊裡仍沒有紀錄的手機
- **THEN** 沒有再送換鑰匙的請求；跳出「Unable to Remove Member」，訊息是「Something went wrong. Try again later.」

#### Scenario: 其他情況

- **WHEN** API 拒絕換鑰匙的請求，原因是群組滿了；或回 500
- **THEN** 都跳出「Unable to Remove Member」，訊息是「Something went wrong. Try again later.」；Members 仍列出 Dana，secure store 裡沒有鑰匙世代 2 的群組鑰匙

#### Scenario: 沒有現在的群組鑰匙

- **WHEN** secure store 裡沒有這支手機在 Brisbane 的鑰匙世代的群組鑰匙；在 Dana 的確認框按「Remove」
- **THEN** API 沒有收到換鑰匙的請求；跳出「Unable to Remove Member」，訊息是「Something went wrong. Try again later.」；Members 仍列出 Dana，API 上 D 仍是成員手機

### Requirement: SHARING-275.1 API 說需要換鑰匙時，替群組換鑰匙

WHEN 一個共同帳本的一次同步結束，而它的下載或上傳被拒絕，原因是需要換鑰匙（SHARING-256.1；sync 的 SYNC-62.2 判定的拒絕，寫得不對的照 SYNC-71.3、SYNC-78.2 當成別的回應），the mobile app SHALL 替群組換鑰匙：在同一個 SQLite transaction 裡，把回應的 `devices` 當成留下來的手機，照 SHARING-271.1 和 SHARING-272.1 備請求，送換鑰匙的請求，`epoch` 是這支手機在這個共同帳本的鑰匙世代加 1，`remove` 是空的。API 回答換好了之後照 SHARING-273.1 存下新的群組鑰匙，再同步這個共同帳本一次：它從 cursor 下載，再用新的鑰匙世代上傳。IF `devices` 裡有一支手機在這支手機的名冊裡沒有代表某位成員的紀錄，或這支手機沒有現在的鑰匙世代的群組鑰匙，THEN the mobile app SHALL 不送，也不再同步：別支成員手機會換。IF 換鑰匙的請求被拒絕，原因是鑰匙世代或不必換鑰匙，THEN the mobile app SHALL 再同步這個共同帳本一次，原因是鑰匙世代而它沒有那把鑰匙時先拿（SHARING-278.1）：別支手機已經換了；其他的拒絕和沒有得到回應時不再同步，待上傳的事件都留著，下一次同步時再換。這樣換了一次之後的那次同步又被拒絕、原因是需要換鑰匙時，不再換，等下一次同步；都不顯示任何提示。

#### Scenario: 打開 app 的手機替群組換

- **WHEN** Dana 的手機退出之後，Taylor 的手機重新啟動 app
- **THEN** API 依序收到：Brisbane 的下載，被拒絕，原因是需要換鑰匙；一個換鑰匙的請求，`epoch` 是 2，`remove` 是空的，`boxes` 只有給這支手機的；Brisbane 的下載。之後 Members 不再列出 Dana，secure store 裡有鑰匙世代 2 的群組鑰匙；沒有跳出提示框

#### Scenario: 存下變更的手機替群組換

- **WHEN** Dana 的手機退出之後，Taylor 的手機新增 Lunch；它這次同步的下載 API 照常回答，上傳被拒絕，原因是需要換鑰匙
- **THEN** API 接著收到換鑰匙的請求和鑰匙世代 2 的上傳；Lunch 的事件存下了，用新的群組鑰匙解得開

#### Scenario: 別支手機先換了

- **WHEN** API 拒絕這支手機的換鑰匙的請求，原因是鑰匙世代，回應說群組現在的鑰匙世代是 2
- **THEN** API 接著收到拿鑰匙的請求和 Brisbane 的下載；沒有再送換鑰匙的請求

#### Scenario: 名冊裡沒有那支手機

- **WHEN** API 說需要換鑰匙，`devices` 裡有一支這支手機的名冊裡沒有紀錄的手機
- **THEN** API 沒有收到換鑰匙的請求；沒有跳出提示框，待上傳的事件都留著

#### Scenario: 換不成

- **WHEN** 換鑰匙的請求沒有得到回應，或 API 回 500
- **THEN** 這次同步沒有再送請求；secure store 裡沒有鑰匙世代 2 的群組鑰匙；下一次同步時再換

#### Scenario: 沒有現在的群組鑰匙

- **WHEN** Dana 的手機退出之後，Taylor 的手機的 secure store 裡沒有它在 Brisbane 的鑰匙世代的群組鑰匙；它同步
- **THEN** API 收到 Brisbane 的下載，拒絕它，原因是需要換鑰匙；之後沒有收到換鑰匙的請求，也沒有收到別的請求

### Requirement: SHARING-276.1 確認退出之後同步、送退出的請求，群組成為唯讀副本

WHEN 使用者在退出的確認框按「Leave」（GROUPS-152.1），the mobile app SHALL 先同步這個共同帳本一次（SYNC-68.2），讓還沒上傳的變更先送出去，這次同步不管做完了沒有都接著做；再送退出的請求（SHARING-254.1）。API 回答退出好了之後，這個共同帳本在這支手機上成為唯讀副本，原因是退出（SYNC-300.1）；Members 關閉，群組的畫面顯示唯讀副本的橫幅（GROUPS-155.2）。IF API 拒絕退出的請求，原因是不是成員，THEN the mobile app SHALL 讓它成為唯讀副本，原因是不是成員：這支手機已經被移除了。退出不寫事件：誰離開了，由留下來替群組換鑰匙的手機寫下（SHARING-271.1）。

#### Scenario: 退出

- **WHEN** 在 Members 點「Taylor (You)」，選「Leave Group」，再按「Leave」
- **THEN** API 依序收到 Brisbane 的下載，和沒有內容的 `POST /groups/<Brisbane 的群組 ID>/leave`；回答之後 Members 關閉，Brisbane 的畫面顯示「You left this group. This copy is read-only and won't update.」；本機資料沒有因為退出多出待上傳的事件

#### Scenario: 退出之前先上傳

- **WHEN** 手機沒有網路時新增了 Lunch；有網路之後退出
- **THEN** 退出的請求送出之前，Lunch 的事件已經上傳；Dana 的手機同步之後有 Lunch

#### Scenario: 已經被移除

- **WHEN** Dana 的手機把 Taylor 的手機移除了，Taylor 的手機還沒有同步；它按「Leave」
- **THEN** Brisbane 成為唯讀副本，橫幅是「You're no longer a member of this group. This copy is read-only and won't update.」

#### Scenario: 同步之後才被移除

- **WHEN** Taylor 的手機按「Leave」；退出之前的同步 API 照常回答，退出的請求送到之前，Dana 的手機把它移除了
- **THEN** API 依序收到 Brisbane 的下載和退出的請求，拒絕退出的請求，原因是不是成員；Brisbane 成為唯讀副本，原因是不是成員

#### Scenario: 留下來的手機看到的

- **WHEN** Taylor 的手機退出之後，Dana 的手機重新啟動 app
- **THEN** Dana 的手機替群組換鑰匙（SHARING-275.1）；之後它的 Members 是「Casey」、「Blake」和「Dana (You)」，Taylor 是前成員

### Requirement: SHARING-277.1 退出沒成功時說明，這支手機仍是成員

IF 退出的請求沒有得到回應，被原因不是「不是成員」的拒絕擋下，或得到看不懂的回應，THEN the mobile app SHALL 讓這個共同帳本和按「Leave」之前一樣，仍照常同步，並跳出標題是「Unable to Leave Group」的提示框：沒有得到回應時訊息是「Connect to the internet and try again.」，其他情況是「Something went wrong. Try again later.」。

#### Scenario: 沒有網路

- **WHEN** 手機沒有網路，在退出的確認框按「Leave」
- **THEN** 跳出「Unable to Leave Group」，訊息是「Connect to the internet and try again.」；Brisbane 不是唯讀副本，Members 仍可以加入成員

#### Scenario: 看不懂的回應

- **WHEN** API 對退出的請求回 500
- **THEN** 訊息是「Something went wrong. Try again later.」；Brisbane 不是唯讀副本

#### Scenario: API 退出好了，回答卻沒送到

- **WHEN** API 收下了退出，回應卻沒送到手機；之後重新啟動 app
- **THEN** 先是跳出「Unable to Leave Group」；重新啟動之後 Brisbane 的下載被拒絕，原因是不是成員，它成為唯讀副本（SYNC-300.1）

### Requirement: SHARING-278.1 沒有那個鑰匙世代的群組鑰匙時向 API 拿

WHEN 一個共同帳本的一次同步結束，而它的下載停在一個鑰匙世代這支手機沒有群組鑰匙的事件前（SYNC-73.1），或它的上傳被拒絕、原因是鑰匙世代、這支手機又沒有回應說的那個世代的群組鑰匙（SYNC-79.1），或它落後了、問到的給它的快照的鑰匙世代是這支手機沒有群組鑰匙的（SYNC-170.1）；或換鑰匙的請求被拒絕，原因是鑰匙世代（SHARING-274.1、SHARING-275.1），the mobile app SHALL 先讓這支手機在這個共同帳本的鑰匙世代（SYNC-94.1）跟上 secure store：照名稱讀得到下一個世代的群組鑰匙時（SYNC-66.1），本機資料記著的鑰匙世代移到那個世代，一個接一個，到讀不到下一個為止；再送拿鑰匙的請求（SHARING-259.1），`after` 是這時的鑰匙世代；把回應的 box 依鑰匙世代由小到大一個一個打開、驗證（SHARING-279.1、SHARING-280.1），每驗證過一把就照 SYNC-94.1 存下；API 說之後還有時，帶著這時的鑰匙世代接著拿。打開一個 box（SHARING-9.1）用的是：這支手機的 box 私鑰、回應裡那個 box 的 `senderKey`、從這支手機存著的上一個世代——box 的鑰匙世代減 1——的群組鑰匙導出的 salt，和 SHARING-272.1 的情境，其中裝置 ID 是這支手機的，鑰匙世代是那個 box 的。至少存下一把之後，再同步這個共同帳本一次（SYNC-68.2）：下載從 cursor 接著收，上傳用新的鑰匙世代送，等著快照的手機在這次同步匯入那份快照（SYNC-170.1）；一把都沒有存下時不再同步，等下一次同步。都不顯示任何提示。先跟上 secure store，是為了本機資料回到較早的樣子的手機（SYNC-92.2）：它等著快照時沒有事件可以解，鑰匙世代不會照 SYNC-305.1 跟上，而 API 可能已經刪掉它拿過的 box（SHARING-259.1），剩下的第一個 box 接不上它記著的世代（SHARING-279.1），它就永遠匯入不了那份快照。

#### Scenario: 下載停在新的鑰匙世代

- **WHEN** Dana 的手機移除了另一支手機 E，換鑰匙的請求有給 Taylor 的手機的 box 和兩個事件；Taylor 的手機同步
- **THEN** API 依序收到：Brisbane 的下載；`GET /groups/<Brisbane 的群組 ID>/keys?after=1`；Brisbane 的下載，cursor 和前一個一樣。之後 secure store 裡有鑰匙世代 2 的群組鑰匙，那兩個事件套用了，這支手機的鑰匙世代是 2

#### Scenario: 上傳被拒絕

- **WHEN** Brisbane 的鑰匙世代是 2，API 存著給 Taylor 的手機的 box，Brisbane 沒有鑰匙世代 2 的事件；Taylor 的手機新增 Lunch 之後同步
- **THEN** 第一個上傳被拒絕，原因是鑰匙世代；API 接著收到拿鑰匙的請求和鑰匙世代 2 的上傳，Lunch 的事件存下了

#### Scenario: 離線時換過兩次

- **WHEN** Taylor 的手機離線時，Brisbane 換了兩次鑰匙，兩次都有給它的 box，鑰匙世代 2 和 3 各有事件；它同步
- **THEN** 拿鑰匙的請求只有一個，`after` 是 1；secure store 裡有鑰匙世代 2 和 3 的群組鑰匙，鑰匙世代 3 的 box 是用從鑰匙世代 2 的鑰匙導出的 salt 打開的；兩個世代的事件都套用了

#### Scenario: 之後再拿

- **WHEN** 接著 Brisbane 又換了一次鑰匙，Taylor 的手機再同步
- **THEN** 拿鑰匙的請求的 `after` 是 3；資料庫裡找不到先前給它的那兩個 box

#### Scenario: 等的快照是新的鑰匙世代

- **WHEN** Dana 的手機落後了，只有鑰匙世代 1 的群組鑰匙；Taylor 的手機移除了另一支手機 E，換鑰匙的請求有給 Dana 的手機的 box，之後替 Dana 的手機上傳了鑰匙世代 2 的快照；Dana 的手機同步
- **THEN** API 依序收到：Brisbane 的下載；問有沒有快照的請求；`GET /groups/<Brisbane 的群組 ID>/keys?after=1`；Brisbane 的下載；問有沒有快照的請求；下載那份快照的分塊。之後 secure store 裡有鑰匙世代 2 的群組鑰匙，Dana 的手機匯入了快照，不在等快照

#### Scenario: 還原之後，等的快照是更新的鑰匙世代

- **WHEN** Dana 的手機在鑰匙世代 1 時留下本機資料的複本；之後群組換了兩次鑰匙，它每次都拿了，secure store 裡有鑰匙世代 1 到 3 的群組鑰匙，API 已經刪掉給它的鑰匙世代 2 的 box；本機資料換回那份複本，群組又換了一次，它落後了，給它的快照是鑰匙世代 4；它同步
- **THEN** 拿鑰匙的請求的 `after` 是 3；secure store 裡有鑰匙世代 4 的群組鑰匙，它匯入了快照，不在等快照

#### Scenario: 沒有給它的 box

- **WHEN** 下載停在鑰匙世代 2 的事件前，API 回答沒有 box 的一頁
- **THEN** 這支手機沒有再同步；沒有跳出提示框，下一次同步時再拿

### Requirement: SHARING-279.1 打不開或內容不對的 box 不存

IF 拿到的一個 box 的鑰匙世代不是這支手機在這個共同帳本的鑰匙世代加 1，或它打不開（SHARING-10.1、SHARING-11.1）——這支手機沒有上一個世代的群組鑰匙時也算——或打開的內容不是 `keys` 剛好一項的 JSON 物件、那一項的 `epoch` 不是這個 box 的鑰匙世代、`key` 不是 64 個小寫十六進位字元，THEN the mobile app SHALL 不存這個 box 和它後面每一個 box 的鑰匙，不再接著拿，這支手機的鑰匙世代不變，不顯示任何提示；之後的同步照 SHARING-278.1 再拿。IF 那個 box 是這支手機不認得的格式版本（SHARING-4.2），THEN the mobile app SHALL 一樣不存，並讓這個共同帳本的畫面顯示等 app 更新的那一行（SYNC-75.1）。

#### Scenario: API 換了東西

- **WHEN** 拿鑰匙的回應裡，鑰匙世代 2 的 box 的 `senderKey` 是別把公開金鑰；或 box 是用從別的 32 bytes 導出的 salt 裝的；或是給別支手機的那一個；或被改過一個 bit
- **THEN** 每一種 secure store 都沒有鑰匙世代 2 的群組鑰匙，這支手機的鑰匙世代仍是 1；沒有跳出提示框；下一次同步又送拿鑰匙的請求，`after` 是 1

#### Scenario: 內容不對

- **WHEN** box 打得開，內容是 `{}`、`{"keys":[]}`、`{"keys":[{"epoch":3,"key":"<64 個十六進位字元>"}]}`、`{"keys":[{"epoch":2,"key":"abc"}]}`，或有兩項
- **THEN** 都和上一個 scenario 一樣

#### Scenario: 世代不相連

- **WHEN** 這支手機的鑰匙世代是 1，回應只有鑰匙世代 3 的 box
- **THEN** 沒有存下任何鑰匙

#### Scenario: 前一個不能存時後面的也不存

- **WHEN** 回應有鑰匙世代 2 和 3 的 box，鑰匙世代 2 的那一個被改過一個 bit
- **THEN** secure store 裡沒有鑰匙世代 2 和 3 的群組鑰匙

#### Scenario: 不認得的格式版本

- **WHEN** 鑰匙世代 2 的 box 的第一個 byte 是 `0x02`
- **THEN** 沒有存下鑰匙；Brisbane 的畫面顯示「This group has changes from a newer version of the app. Update the app to see them.」

### Requirement: SHARING-280.1 解不開正停著的那個事件的鑰匙不存

IF 這支手機的下載正停在一個事件前（SYNC-73.1），而拿到的 box 裡那個事件的鑰匙世代的鑰匙解不開那個事件（SHARING-3.1），THEN the mobile app SHALL 不存那把鑰匙和它後面每一個 box 的鑰匙，cursor 不動，不留下不套用的紀錄，不顯示任何提示：存了不對的鑰匙，這支手機會把那個世代的事件都當成空的內容跳過（SYNC-72.1），之後拿到對的也回不來。那個事件的密文是這支手機不認得的格式版本時不這樣檢查，照 SYNC-74.1。

#### Scenario: box 裡的鑰匙不是加密事件的那一把

- **WHEN** 下載停在鑰匙世代 2 的事件前；給這支手機的 box 打得開、內容合規定，裡面的鑰匙卻不是加密那個事件的那一把
- **THEN** secure store 裡沒有鑰匙世代 2 的群組鑰匙；cursor 不動，沒有不套用的紀錄；下一次同步的下載是同一個 cursor

#### Scenario: 對的鑰匙

- **WHEN** 接著 API 上給這支手機的 box 換成裝著對的鑰匙的，它再同步
- **THEN** 那個事件套用了

### Requirement: SHARING-281.1 加入時快照的鑰匙世代比交接的新，先拿鑰匙再匯入

WHEN 加入時（SHARING-217.2）API 回答的那份給這支手機的快照，鑰匙世代比交接的 box 裡最大的鑰匙世代大，the mobile app SHALL 先送拿鑰匙的請求（SHARING-259.1），`after` 是 box 裡最大的鑰匙世代，照 SHARING-278.1 和 SHARING-279.1 一個一個打開，上一個世代的群組鑰匙從交接的 box 裡的那一把算起；把打開的每一把照 SHARING-217.2 寫進 secure store，再匯入快照。這支手機被同意之後、加入之前，群組換過鑰匙時就是這樣。IF 這樣仍沒有快照的鑰匙世代的群組鑰匙，THEN the mobile app SHALL 不匯入，加入沒有做完，原因是出了問題（SHARING-221.1）。

#### Scenario: 被同意之後群組換過鑰匙

- **WHEN** Taylor 的手機同意了 Dana 的申請；Dana 的手機加入之前，Taylor 的手機移除了另一支手機，換鑰匙的請求有給 D 的 box；之後成員手機替 D 上傳了鑰匙世代 2 的完整快照；Dana 的手機打開那個申請
- **THEN** API 依序收到問結果、問快照、`GET /groups/<Brisbane 的群組 ID>/keys?after=1` 和快照的每一塊；加入好了，secure store 裡有 Brisbane 鑰匙世代 1 和 2 的群組鑰匙，這支手機的鑰匙世代是 2

#### Scenario: 快照還是舊的鑰匙世代

- **WHEN** 群組換過鑰匙，API 存著的仍是同意時那份鑰匙世代 1 的快照；Dana 的手機打開那個申請，加入之後同步
- **THEN** 加入時沒有送拿鑰匙的請求；同步的下載停在鑰匙世代 2 的事件前時才拿（SHARING-278.1），之後鑰匙世代 2 的事件都套用了

#### Scenario: 拿不到

- **WHEN** 快照的鑰匙世代是 2，API 回答沒有 box 的一頁
- **THEN** 這支手機沒有 Brisbane 這個群組；Join Group 顯示「Approved」、「Brisbane」、「Something went wrong. Try again later.」和「Try Again」

### Requirement: SHARING-282.1 同意了還沒加入好的申請，API 說沒有這個申請時是被拒絕了

WHEN 手機上的申請是同意了還沒加入好的（SHARING-221.1），而問結果的回答是 `{"state":"none"}`，the mobile app SHALL 照被拒絕處理（SHARING-213.1），secure store 裡替它存下的群組鑰匙也不留：這支手機被同意之後、加入之前被成員移除了，API 沒有它的交接（SHARING-257.1）。

#### Scenario: 加入之前被移除

- **WHEN** 成員同意了 Dana 的申請，Dana 的手機打開了 box、存下群組鑰匙，下載快照時沒有網路；之後成員移除了她；Dana 的手機重新啟動 app，API 回答 `{"state":"none"}`
- **THEN** 卡片是「Brisbane」和「Request declined」；secure store 裡沒有 Brisbane 的群組鑰匙，本機資料的檔案裡找不到 S；這支手機沒有 Brisbane 這個群組

#### Scenario: 手機上有這個群組的副本

- **WHEN** Dana 的手機有 Brisbane 的唯讀副本，用新的邀請申請、被同意，打開了 box、存下群組鑰匙，下載快照時沒有回應；之後成員移除了她，那個邀請還有效；Dana 的手機再問結果，API 回答 `{"state":"none"}`
- **THEN** 申請記成被拒絕；secure store 裡沒有 Brisbane 任何鑰匙世代的群組鑰匙；副本和送出申請之前一樣（SHARING-289.1）

### Requirement: SHARING-284.1 有人離開之後，撤回比那次離開早的邀請

WHEN 一個共同帳本的一次同步結束，而這次同步開頭的下載做完了（SYNC-69.2），這支手機又替它存著一個還沒到期的邀請，那個邀請建立的時間戳記（sync）比這個共同帳本的名冊裡某一筆不代表任何人的紀錄的「代表」的時間戳記早（SYNC-1.1），the mobile app SHALL 送撤回那個邀請的請求（SHARING-82.1），不問使用者，也不顯示任何提示：離開的手機知道那條連結。WHEN API 回答撤回好了——別支成員手機先撤回了的邀請，API 也這樣回答（SHARING-82.1）——或拒絕、原因是沒有這個邀請，the mobile app SHALL 在同一個 SQLite transaction 裡刪掉存著的這個邀請並寫下永久刪除它的事件（SYNC-80.2）；Invite 正顯示它時關閉，回到 Members。其他情況邀請不變，下一次同步之後再試。建立的時間戳記比每一次離開都晚的邀請不撤回；成員要邀人時照常建立新的（SHARING-91.1）。撤回之後，那個邀請收到、還沒有被同意的申請 API 不再存著（SHARING-174.1），所以有手機離開之後才送的同意不會成功：同意之前的那次同步（SHARING-195.2）被拒絕、原因是需要換鑰匙時，同意照 SHARING-200.2 的其他情況說明，這支手機照常替群組換鑰匙（SHARING-275.1）、撤回邀請；之後再按「Approve」，這支手機已經沒有那個邀請，照 SHARING-200.2 說明申請已經處理過。申請的人要用新的邀請再申請一次；已經被同意、還沒有加入好的手機不受影響（SHARING-183.1）。

#### Scenario: 移除之後

- **WHEN** Brisbane 存著代號 A 的邀請；Taylor 的手機移除 Dana，API 回答換好了
- **THEN** 同步之後 API 收到對 `/groups/<Brisbane 的群組 ID>/invites/3q2-7wEjRWeJq83vEjRWeA` 沒有內容的 `DELETE`；待上傳的事件多一個永久刪除這個邀請的事件，下一次同步時上傳；沒有跳出提示框

#### Scenario: 之後再邀請

- **WHEN** 接著在 Members 按「Invite with Link」
- **THEN** API 收到建立邀請的請求，代號是新的；Invite 顯示新的連結；之後再同步，API 沒有收到撤回它的請求

#### Scenario: 別支手機移除的

- **WHEN** Dana 的手機移除了另一支手機 E，代號 A 的邀請在 API 上已經被撤回；Taylor 的手機存著代號 A 的邀請，同步並套用了那些事件
- **THEN** Taylor 的手機送撤回代號 A 的請求；API 回答撤回好了，它刪掉存著的邀請，寫下永久刪除它的事件，下一次同步時上傳；之後的同步不再送撤回的請求

#### Scenario: API 說沒有這個邀請

- **WHEN** Taylor 的手機移除 Dana；撤回代號 A 的請求被拒絕，原因是沒有這個邀請
- **THEN** 它照樣刪掉存著的邀請，寫下永久刪除它的事件；之後的同步不再送撤回的請求

#### Scenario: 撤回沒成功

- **WHEN** 撤回的請求沒有得到回應；之後再同步
- **THEN** 第一次之後邀請還在，沒有多寫事件，沒有跳出提示框；第二次同步之後又送一個撤回的請求

#### Scenario: Invite 開著

- **WHEN** Invite 正顯示代號 A 的邀請時，這支手機同步並套用了別支手機移除 E 的事件
- **THEN** 撤回好了之後 Invite 關閉，顯示 Members

#### Scenario: 還沒有被同意的申請

- **WHEN** Evan 用代號 A 的邀請送了申請，還沒有被同意；Dana 的手機退出之後，Taylor 的手機還沒有同步，就在 Evan 的選單按「Approve」；之後再按一次
- **THEN** 第一次，API 依序收到 Brisbane 的下載、換鑰匙的請求、換好之後的下載和撤回代號 A 的請求，沒有收到同意的請求，跳出「Unable to Approve」，訊息是「Something went wrong. Try again later.」；第二次沒有再送同意的請求，訊息是「This request has already been answered.」；API 上沒有 Evan 的申請，Evan 的手機不是成員手機

#### Scenario: 沒有人離開過

- **WHEN** Brisbane 的名冊裡沒有不代表任何人的紀錄；Taylor 的手機同步
- **THEN** API 沒有收到撤回邀請的請求

### Requirement: SHARING-285.1 新舊群組鑰匙和離開的成員只以密文離開手機

The mobile app SHALL 不把新的群組鑰匙、用來算 salt 的上一把群組鑰匙和那個 salt、離開的成員的成員 ID 和名稱以明文放進任何請求：網址、簽名的欄位和內容裡都沒有，不論是原始的 bytes、十六進位還是 Base64。API 只從 `remove` 和 `boxes` 得知哪些手機離開、哪些留下。

#### Scenario: 移除、替群組換鑰匙和拿鑰匙

- **WHEN** Taylor 的手機移除 Dana；Dana 的手機退出之後它替群組換鑰匙；它拿鑰匙
- **THEN** API 收到的每個請求裡都找不到 Brisbane 鑰匙世代 1 和 2 的群組鑰匙、從它們導出的 salt、Dana 的成員 ID 和「Dana」

### Requirement: SHARING-286.1 換鑰匙、退出和拿鑰匙的請求等不到回應時在 60 秒後放棄

IF 換鑰匙、退出或拿鑰匙時送出的一個請求送出 60 秒之後還沒有收完回應，THEN the mobile app SHALL 放棄這個請求，把它當成沒有得到回應：移除照 SHARING-274.1，替群組換鑰匙照 SHARING-275.1，退出照 SHARING-277.1，拿鑰匙照 SHARING-278.1 當成沒有拿到。放棄之後才到的回應不算數。這支手機之後送的請求不等被放棄的那一個。每個送出的請求各自算 60 秒，和 SHARING-204.1 一樣。

#### Scenario: 移除一直沒有回應

- **WHEN** 在 Dana 的確認框按「Remove」，API 收下了換鑰匙的請求，卻一直沒有回答；過了 50 秒；再過 15 秒；之後 API 才回答
- **THEN** 50 秒時 Dana 那一列是「Dana」和「Removing…」（GROUPS-151.1）；再過 15 秒，跳出「Unable to Remove Member」，訊息是「Connect to the internet and try again.」；回答到了之後沒有別的提示框

#### Scenario: 退出一直沒有回應

- **WHEN** 在退出的確認框按「Leave」，API 一直沒有回答退出的請求；過了 65 秒
- **THEN** 跳出「Unable to Leave Group」，訊息是「Connect to the internet and try again.」

### Requirement: SHARING-287.1 (manual) 兩支真的手機：移除之後立刻失去存取權，退出之後留下唯讀副本

WHEN 一支真的手機的成員移除另一支真的手機的成員，或一支真的手機退出，the mobile app SHALL 讓離開的那支手機從那一刻起收不到群組之後的任何變更，它上面的群組成為唯讀副本，留下來的手機照常記帳。

#### Scenario: iPhone 和 Android 各當一次被移除的手機

- **WHEN** 在裝了連到同一個環境的 build、已經在同一個共同帳本裡的兩支手機上：第一支打開 Members，點第二支的成員，選「Remove from Group」再按「Remove」；第一支新增一筆支出；第二支把 app 切到背景再回來，再試著新增這個群組的支出。接著讓第二支回來：第一支在 Members 建立新的邀請，第二支打開連結，用原本的名字申請當「New Member」，第一支按「Approve」，在「Add <名稱> Back?」按「Add Back」。兩支手機又在同一個共同帳本裡之後，第二支在 Members 點自己那一列，選「Leave Group」再按「Leave」；第一支把 app 切到背景再回來；最後第二支在群組的畫面按「Delete Copy」再按「Delete」
- **THEN** 移除的那一次：第一支的 Members 不再列出第二支的成員，他記過的支出都還在；第二支回到 app 之後，群組的卡片上是「Read-only copy」，群組的畫面上是「You're no longer a member of this group. This copy is read-only and won't update.」，沒有第一支之後新增的那筆支出，New Expense 選不到這個群組；個人的支出照常新增。回來的那一次：第二支上的群組不再是「Read-only copy」，內容和第一支一樣，有第一支在它離開期間新增的那筆支出；兩支的 Members 都列出第二支的成員和「Joined」，只有一位，他以前記的支出仍在他名下。退出的那一次：第二支的群組的畫面上是「You left this group. This copy is read-only and won't update.」；第一支回到 app 之後，Members 不再列出第二支的成員，之後新增的支出照常同步到別的成員手機；第二支刪除之後，Groups 根畫面沒有這個群組的卡片，它的支出不在 Expenses

### Requirement: SHARING-288.1 同意和前成員同名的新成員之前，問要不要把他加回來

WHEN 使用者在申請的選單按「Approve」，而那個申請要當新成員，名字和這個共同帳本的一位前成員同名（groups），the mobile app SHALL 在同步和送任何請求之前，先跳出和 Members 加回前成員時一樣的提示框（groups 的 GROUPS-34.4）：標題「Add <前成員的名稱> Back?」，內容「<前成員的名稱> was in this group before. Adding them back reconnects their past payments and shares.」，選項是「Cancel」和「Add Back」；同名的前成員不只一位時，問的是最近被移出的那一位。按「Add Back」才照 SHARING-195.2 同意，這次同意把提示框問的那一位前成員加回來，不新增成員（SHARING-196.2）：申請的手機加入之後就是他（SHARING-219.2），成員 ID 和名稱都是原本的，他以前的付款和分攤接在同一個人底下。按「Cancel」關閉提示框，不同步也不送請求，申請還在，Android 上按返回鍵或點提示框外面也一樣。退出過或被移除過的人回來時，在名片上找不到自己，只能當新成員申請；由按同意的成員認出是不是同一個人。真的是另一位同名的人時，成員按「Cancel」，請他換個名字再申請：Members 也不讓人新增和前成員同名的成員（GROUPS-34.4）。IF 照 SHARING-195.2 在 transaction 裡再看一次時，提示框問的那一位已經不是前成員——別人先把他加回來了——THEN the mobile app SHALL 不同意，照 SHARING-200.2 說明：這個申請和一位成員同名（SHARING-194.2）。名字和每一位前成員都不同名的申請，照常同意成新成員，不問。按「Approve」時沒有同名的前成員、同意之前的那次同步才帶來一位時，也不問，照新成員同意：群組裡這時有一位成員和一位前成員同名，和兩支手機各自新增同名的成員時一樣，合併成員不在這裡。

#### Scenario: 回來的人

- **WHEN** Casey 的手機退出了 Brisbane，Casey 是前成員；它用新的邀請申請當新成員，名字是「 casey 」；Taylor 的手機點那一列，按「Approve」
- **THEN** 跳出標題「Add Casey Back?」、內容「Casey was in this group before. Adding them back reconnects their past payments and shares.」的提示框，選項是「Cancel」和「Add Back」；API 還沒有收到 Brisbane 的下載、快照或同意的請求

#### Scenario: 按 Add Back

- **WHEN** 在這個提示框按「Add Back」，API 回答同意好了
- **THEN** Members 列出「Casey」和「Joined」，他的成員 ID 和退出之前一樣，名稱是「Casey」；Brisbane 沒有第二位 Casey；他以前付的 Dinner 仍是「Paid by Casey」

#### Scenario: 按 Cancel

- **WHEN** 在這個提示框按「Cancel」
- **THEN** API 沒有收到任何請求；申請還在，再點那一列，選單照常打開

#### Scenario: 同名的前成員不只一位

- **WHEN** 移除 Blake 之後，把 Casey 改名為「BLAKE」再移除他；一支手機申請當新成員，名字是「blake」；按「Approve」，再按「Add Back」
- **THEN** 提示框的標題是「Add BLAKE Back?」；加回來的是原本的 Casey，名稱是「BLAKE」；原本的 Blake 仍是前成員

#### Scenario: 名字不同

- **WHEN** 申請的名字是「Casey L」；按「Approve」
- **THEN** 沒有跳出提示框；同意好了之後 Brisbane 多了一位成員「Casey L」，Casey 仍是前成員

#### Scenario: 別人先把他加回來了

- **WHEN** 提示框開著時，別支手機在 Members 把 Casey 加回來並上傳；在提示框按「Add Back」
- **THEN** 跳出「Unable to Approve」，訊息是「This group already has a member named Casey. This request can't be approved.」；API 沒有收到同意的請求

### Requirement: SHARING-289.1 被同意之後，匯入的快照取代這支手機上的副本

WHEN 加入時匯入快照（SHARING-217.2 到 SHARING-219.2），而本機資料有群組 ID 和快照的群組 ID 相同的群組，它是唯讀副本，或不是共同帳本，也是這個申請記著的那個副本（SHARING-226.2），the mobile app SHALL 在匯入的同一個 SQLite transaction 裡，先刪掉那個群組和本機資料替它存著的每一樣東西，和刪除唯讀副本時刪的一樣（groups 的 GROUPS-158.1），再匯入快照、刪掉申請（SHARING-219.2）；其中一個存不進去就都不留下，副本和申請都還在，加入沒有做完（SHARING-221.1）。匯入之後和原本沒有這個群組的手機一樣（SYNC-125.2）：它是共同帳本，不是唯讀副本，沒有封存，排在這支手機的群組的最後，內容是快照的；副本裡沒送出的變更、只在那一份裡改過的東西都不在了，使用者送出申請之前確認過（SHARING-226.2）。在那之前副本都不變：申請還在等、被拒絕（SHARING-213.1）、邀請不再有效（SHARING-214.1）、申請被取消（SHARING-142.1）或加入沒有做完時，副本都和送出申請之前一樣，唯讀副本仍是唯讀副本。這樣副本不會先不見、加入卻沒成功，兩邊都沒有。回應指的是這支手機上申請沒有記著的副本或群組時，加入在存下鑰匙之前就停下（SHARING-217.2），那個群組不變。

#### Scenario: 唯讀副本

- **WHEN** Casey 的手機被移出 Brisbane，它的唯讀副本有兩個待上傳的事件；之後 Taylor 的手機新增了 Lunch；Casey 的手機用新的邀請申請，Taylor 的手機按「Approve」和「Add Back」；Casey 的手機得知結果
- **THEN** Casey 的手機上 Brisbane 是共同帳本，不是唯讀副本，畫面沒有橫幅，有「Add expense」；它有 Lunch；那兩個待上傳的事件不在了，沒有上傳；你是 Casey，成員 ID 和原本一樣；之後在 Brisbane 新增的支出照常上傳

#### Scenario: 這支手機自己的一份

- **WHEN** 這支手機有不是共同帳本的 Brisbane，群組 ID 和共同帳本 Brisbane 一樣，裡面有只在這支手機上的支出 Snack；它申請當沒有手機的 Blake，確認之後送出，被同意
- **THEN** Brisbane 是共同帳本，內容是快照的，沒有 Snack；個人的支出和別的群組都不變

#### Scenario: 被同意之前

- **WHEN** 有副本的手機送出申請之後，申請還在等；或被拒絕；或邀請被撤回
- **THEN** 副本的群組、成員、分類和支出都和送出申請之前完全一樣；唯讀副本仍是唯讀副本，待上傳的事件一個都不少

#### Scenario: 封存的副本

- **WHEN** 唯讀副本 Brisbane 是封存的；這支手機重新加入
- **THEN** Brisbane 不在 Archived Groups，在 Groups 根畫面的最後

#### Scenario: 存不進去

- **WHEN** 匯入快照時資料庫寫不進去；之後可以寫了，再問一次結果
- **THEN** 第一次之後副本和申請都還在，申請是同意了還沒加入好；第二次之後 Brisbane 是共同帳本，申請不在了

### Requirement: SHARING-300.1 成員手機同意接手：同一個請求裡移除舊手機、加入新手機、換鑰匙

WHEN 成員手機送接手的請求，而它沒有被 SHARING-301.1 到 SHARING-304.1 拒絕，the API SHALL 在同一個 transaction 裡做完這幾件事，不會只做一部分：把請求帶的事件照上傳存下（SYNC-50.1、SYNC-51.1），上傳的裝置是這支成員手機，鑰匙世代是 `epoch`，收到時間是這時 API 的時間；讓 `remove` 列出的每支手機不再是這個群組的成員手機，和換鑰匙的請求移除它時一樣（SHARING-250.1）：它在這個群組的進度、它是不是在等快照（SYNC-162.1）、給它的快照、給它的鑰匙的 box 和它的交接都不再存著，之後回傳的一頁不把它列進要快照的成員手機，並記下它是被接手的手機（SHARING-305.1）；把群組現在的鑰匙世代換成 `epoch`；替 `boxes` 的每一項存下一個鑰匙的 box，也就是收件的裝置 ID、`epoch`、請求的 `senderKey` 和那個 box；把申請的手機記成這個群組的成員手機，它的進度是那份快照涵蓋的序號和這時 API 的時間（SYNC-58.1）；記下交接（SHARING-173.2），鑰匙世代是 `epoch`，box 是請求的 `box`；不再存著那個申請。它回答接手好了，回應帶著申請的裝置 ID、`epoch` 和請求裡每個事件的序號。所以沒有哪一刻被移除的手機和申請的手機同時是成員手機，也沒有哪一刻被移除的手機還能上傳和下載、申請的手機卻還不是成員手機；被移除的手機知道的那把鑰匙，不會再加密任何新的事件。API 不知道這些手機各代表誰：它只看到一個請求移除了幾支成員手機、加入了一支。群組的每一支成員手機都可以送，被同意而加入的也可以。API 不撤回群組的邀請，也不動別的申請：邀請由手機撤回（SHARING-284.1）。

#### Scenario: Casey 接手 Dana

- **WHEN** Taylor 的手機在 T+1,000 送「Casey 接手 Dana」
- **THEN** API 回 200，回應是 `{"deviceId":"7c9e6679-7425-40de-944b-e07fc1f90ae7","epoch":2,"events":[{"id":"<E 的事件 ID>","sequence":1}]}`；Brisbane 的成員手機是 Taylor 的手機和 Casey 的手機，鑰匙世代是 2；資料庫裡找不到申請 P，列出申請是沒有申請的一頁

#### Scenario: 新手機成了成員手機

- **WHEN** 接著 Casey 的手機問代號 A 的結果，問 Brisbane 有沒有給它的快照，再從 cursor 0 下載 Brisbane 的事件
- **THEN** 問結果得到 `{"state":"approved","groupId":"9b2f6c1e-8d47-4f3a-b1c5-2e7d90a4f6b8","deviceId":"0f8fad5b-d9cb-469f-a165-70867728950e","senderKey":"<K 的十六進位>","epoch":2,"box":"<B 的十六進位>"}`；問到 S；下載得到 E，它的序號是 1，上傳的裝置 ID 是 Taylor 的手機的，鑰匙世代是 2，收到時間是 T+1,000

#### Scenario: 舊手機立刻失去存取權

- **WHEN** 接著 Dana 的手機上傳一個新事件，再從 cursor 0 下載 Brisbane 的事件
- **THEN** 兩個請求都被拒絕，原因是不是成員（403）；Brisbane 仍只有 E 一個事件

#### Scenario: 之後上傳要用新的鑰匙世代

- **WHEN** 接著 Taylor 的手機用鑰匙世代 1 上傳一個新事件，再用鑰匙世代 2 上傳它
- **THEN** 前一次被拒絕，原因是鑰匙世代，回應說群組現在的鑰匙世代是 2；後一次存下，序號是 2

#### Scenario: 留下來的手機拿得到新的鑰匙

- **WHEN** Taylor 的手機送 `GET /groups/9b2f6c1e-8d47-4f3a-b1c5-2e7d90a4f6b8/keys?after=1`；Casey 的手機送同樣的請求
- **THEN** Taylor 的手機得到 `{"keys":[{"epoch":2,"senderKey":"<K 的十六進位>","box":"<BT 的十六進位>"}],"more":false}`；Casey 的手機得到沒有 box 的一頁：它的鑰匙在交接的 box 裡

#### Scenario: 進度是快照涵蓋的序號

- **WHEN** Brisbane 有三個事件，S 涵蓋的序號是 2，Taylor 的手機用 cursor 3 送「Casey 接手 Dana」
- **THEN** 接手好了，E 的序號是 4；資料庫裡 Casey 的手機在 Brisbane 的進度是 cursor 2 和這時 API 的時間

#### Scenario: 一次移除兩支

- **WHEN** 另一支手機也是 Brisbane 的成員手機；Taylor 的手機送接手的請求，`remove` 是 Dana 的手機和那一支，`boxes` 只有給 Taylor 的手機的 BT
- **THEN** 接手好了；Brisbane 的成員手機是 Taylor 的手機和 Casey 的手機

#### Scenario: 有 20 支成員手機的群組

- **WHEN** Brisbane 有 20 支成員手機，Dana 的手機是其中一支；Taylor 的手機送接手的請求，`remove` 是 Dana 的手機，`boxes` 是給其餘 19 支的
- **THEN** 接手好了，不是成員手機滿了；Brisbane 仍有 20 支成員手機，Casey 的手機是其中一支

#### Scenario: 被移除的手機留下的東西

- **WHEN** API 存著給 Dana 的手機的完整快照和一次更早的換鑰匙留給它的 box，它也在等快照；Taylor 的手機送接手 Dana 的請求，之後下載
- **THEN** 資料庫裡找不到那份快照任何一塊的內容和那個 box，不論是原始的 bytes、十六進位還是 Base64；那一頁的 `x-snapshot-needed-by` 沒有 Dana 的手機的裝置 ID

#### Scenario: 邀請和別的申請還在

- **WHEN** 別的手機在代號 A 也送出了申請 Q；Taylor 的手機送「Casey 接手 Dana」
- **THEN** 讀代號 A 仍得到名片，列出申請仍得到 Q

#### Scenario: 被同意而加入的手機同意接手

- **WHEN** 「Casey 接手 Dana」之後，別的手機在代號 A 送出申請 Q；Casey 的手機替它上傳完整的快照，送接手的請求，`cursor` 是 1，`epoch` 是 3，`remove` 是 Taylor 的手機，`boxes` 只有給 Casey 的手機的
- **THEN** 接手好了；Taylor 的手機不是成員手機，鑰匙世代是 3

### Requirement: SHARING-301.1 接手的請求要點名要移除的手機和每一支留下來的成員手機

IF 接手的請求的 `remove` 有一項不是這個群組的成員手機，或是送請求的這支手機自己；或 `boxes` 的裝置 ID 不是剛好這個群組的成員手機去掉 `remove` 列出的那些，送請求的手機自己也在裡面，不多也不少，THEN the API SHALL 拒絕，原因是成員手機不一樣，回應帶著這個群組現在每一支成員手機的裝置 ID，由小到大（字元逐一比較，SHARING-251.1 的同一個拒絕）；什麼都不改，申請還在。申請的手機這時還不是成員手機，所以它不在 `boxes` 裡，也不能在 `remove` 裡：它的群組鑰匙在 `box` 裡。

#### Scenario: 少了一支留下來的手機的 box

- **WHEN** 另一支手機 X 也是 Brisbane 的成員手機；Taylor 的手機送「Casey 接手 Dana」，`boxes` 只有 BT
- **THEN** 被拒絕，原因是成員手機不一樣（409），回應是 `{"error":"devices","devices":[…]}`，依裝置 ID 由小到大列出 Taylor 的手機、Dana 的手機和 X，沒有 Casey 的手機；Dana 的手機仍是成員手機，Casey 的手機不是，鑰匙世代仍是 1，E 沒有存下，申請 P 還在

#### Scenario: 沒有給自己的 box

- **WHEN** 另一支手機 X 也是 Brisbane 的成員手機；Taylor 的手機送「Casey 接手 Dana」，`boxes` 只有給 X 的
- **THEN** 被拒絕，原因是成員手機不一樣

#### Scenario: 給了申請的手機 box

- **WHEN** Taylor 的手機送「Casey 接手 Dana」，`boxes` 除了 BT，另外有給 Casey 的手機的
- **THEN** 被拒絕，原因是成員手機不一樣，回應的 `devices` 是 Taylor 的手機和 Dana 的手機

#### Scenario: remove 列了不是成員手機的手機、申請的手機，或自己

- **WHEN** `remove` 是一支註冊過、不是成員手機的手機，或 API 沒見過的 `ffffffff-ffff-4fff-bfff-ffffffffffff`，`boxes` 是給 Taylor 的手機和 Dana 的手機的；或 `remove` 是 Casey 的手機，`boxes` 是給 Taylor 的手機和 Dana 的手機的；或 `remove` 是 Taylor 的手機自己，`boxes` 只有給 Dana 的手機的
- **THEN** 都被拒絕，原因是成員手機不一樣；Brisbane 的兩支成員手機都還在，申請 P 還在

### Requirement: SHARING-302.1 接手的請求照同意和換鑰匙的請求一樣檢查

IF 接手的請求有下面任何一種情況，THEN the API SHALL 拒絕，原因是那一種的，什麼都不改：申請還在，申請的手機不是成員手機，`remove` 列出的手機仍是成員手機，鑰匙世代不變。路徑裡的那支手機在這個群組沒有申請，或請求帶的 `request` 不是那個申請現在的內容的 SHA-256：沒有這個申請（SHARING-174.1）。`cursor` 比群組最新的序號小：沒有跟上（SHARING-176.1）。群組需要換鑰匙：需要換鑰匙，回應帶著群組現在的成員手機（SHARING-256.1），留下來的成員手機先替它換過（SHARING-275.1），才收接手。`epoch` 不是群組現在的鑰匙世代加 1：鑰匙世代，回應帶著群組現在的鑰匙世代（SHARING-252.1）。`snapshotId` 不是這個群組替申請的那支手機存著的完整快照的快照 ID，或那份快照涵蓋的序號比群組清到的序號小：沒有快照（SHARING-177.1）。請求帶的事件存下之後，群組存著的事件的大小會超過上限：群組滿了（SYNC-56.1）。接手不看群組有幾支成員手機（SHARING-178.1）：它至少移除一支，成員手機不會變多。

#### Scenario: 沒有這個申請

- **WHEN** Taylor 的手機拒絕 Casey 之後送「Casey 接手 Dana」；或 Casey 的手機在代號 A 再送申請 Q 之後，Taylor 的手機仍用 P 的 SHA-256 送；或 Taylor 的手機撤回了代號 A 之後送
- **THEN** 都被拒絕，原因是沒有這個申請（404），回應是 `{"error":"no-request"}`；Dana 的手機仍是成員手機，鑰匙世代仍是 1

#### Scenario: 沒有跟上

- **WHEN** Brisbane 有三個事件，S 涵蓋的序號是 2；Taylor 的手機用 cursor 2 送「Casey 接手 Dana」，再用 cursor 3 送
- **THEN** 前一次被拒絕，原因是沒有跟上（409），回應是 `{"error":"behind"}`，申請 P 還在，Dana 的手機仍是成員手機；後一次接手好了

#### Scenario: 群組需要換鑰匙

- **WHEN** 另一支手機 X 也是 Brisbane 的成員手機；X 退出之後，Taylor 的手機送「Casey 接手 Dana」
- **THEN** 被拒絕，原因是需要換鑰匙（409），回應的 `devices` 是 Taylor 的手機和 Dana 的手機；申請 P 還在，Casey 的手機不是成員手機

#### Scenario: 鑰匙世代不是下一個

- **WHEN** Taylor 的手機送「Casey 接手 Dana」，`epoch` 是 3
- **THEN** 被拒絕，原因是鑰匙世代（409），回應是 `{"error":"epoch","epoch":1}`；Dana 的手機仍是成員手機

#### Scenario: 沒有快照

- **WHEN** S 沒有上傳過；或接手帶的快照 ID 是 Taylor 的手機給別支手機的完整快照的；Taylor 的手機送「Casey 接手 Dana」
- **THEN** 都被拒絕，原因是沒有快照（404），回應是 `{"error":"no-snapshot"}`；申請 P 還在，Dana 的手機仍是成員手機

#### Scenario: 群組滿了

- **WHEN** Brisbane 存著的事件的大小離上限只剩 199 bytes，S 涵蓋群組最新的序號；Taylor 的手機用群組最新的序號當 `cursor`，帶著 200 bytes 的 E 送「Casey 接手 Dana」
- **THEN** 被拒絕，原因是群組滿了（413）；申請 P 還在，Dana 的手機仍是成員手機

### Requirement: SHARING-303.1 接手的請求寫得不對

IF 接手的請求寫得不對，THEN the API SHALL 拒絕，原因是內容不對：群組 ID 或路徑裡的裝置 ID 不是小寫的第 4 版 UUID；網址帶了查詢；內容不是剛好有 `request`、`cursor`、`snapshotId`、`senderKey`、`epoch`、`box`、`remove`、`boxes` 和 `events` 九個欄位的 JSON 物件；`request` 或 `senderKey` 不是 32 bytes 的小寫十六進位寫法；`cursor` 不是 0 到 9,007,199,254,740,991 之間的整數；`snapshotId` 不是小寫的第 4 版 UUID；`epoch` 不是 2 到 9,007,199,254,740,991 之間的整數；`box` 不是 41 到 65,536 bytes 的小寫十六進位寫法；`remove` 不是 1 到 19 個不重複的小寫第 4 版 UUID 的陣列；`boxes` 不是 1 到 19 項的陣列、每一項剛好有 `deviceId` 和 `box` 兩個欄位，`deviceId` 不是小寫的第 4 版 UUID 或在 `boxes` 裡重複，`box` 不是 41 到 1,024 bytes 的小寫十六進位寫法；同一個裝置 ID 同時在 `remove` 和 `boxes` 裡；`events` 不合上傳的事件的規定（SYNC-53.1：1 到 100 個，各有不重複的事件 ID 和 41 到 65,536 bytes 的內容）；或 `cursor` 比群組最新的序號大。

#### Scenario: 路徑和查詢

- **WHEN** Taylor 的手機送「Casey 接手 Dana」時，群組 ID 是大寫的 `9B2F6C1E-8D47-4F3A-B1C5-2E7D90A4F6B8` 或 `brisbane`；路徑裡的裝置 ID 是 `casey` 或大寫的 `7C9E6679-7425-40DE-944B-E07FC1F90AE7`；或網址後面帶 `?x=1`
- **THEN** 都被拒絕，原因是內容不對（400）；申請 P 還在，Dana 的手機仍是成員手機

#### Scenario: 接手的內容

- **WHEN** 「Casey 接手 Dana」的內容是：0 bytes、`{}`、一個陣列、不是 JSON 的文字；少了九個欄位裡的任何一個；多帶 `"name":"Casey"`；`request` 是 63 或 65 個字元、大寫的十六進位，或數字；`senderKey` 是 31 bytes；`cursor` 是 -1、1.5 或文字 `0`；`snapshotId` 是 `snapshot`；`epoch` 是 0、1、1.5 或文字 `2`；`box` 是 40 bytes 或 65,537 bytes；`remove` 不是陣列、是空的陣列、有 20 項、有重複的兩項，或有一項是 `dana`；`boxes` 是空的陣列、有 20 項、有兩項的 `deviceId` 相同、有一項多帶 `"epoch":2`、有一項的 `box` 是 40 bytes 或 1,025 bytes；Dana 的手機同時在 `remove` 和 `boxes` 裡；`events` 是空的陣列、101 個事件、兩個事件 ID 相同的事件，或一個內容是 40 bytes 的事件
- **THEN** 都被拒絕，原因是內容不對；申請 P 還在，Dana 的手機仍是成員手機，鑰匙世代仍是 1，資料庫裡找不到「Casey」

#### Scenario: box 最小和最大

- **WHEN** 另一支手機 X 也是 Brisbane 的成員手機；Taylor 的手機送「Casey 接手 Dana」，`box` 是 65,536 bytes，`boxes` 是給 Taylor 的手機的 41 bytes 和給 X 的 1,024 bytes
- **THEN** 接手好了

#### Scenario: cursor 比群組最新的序號大

- **WHEN** Brisbane 有三個事件，Taylor 的手機用 cursor 4 送「Casey 接手 Dana」
- **THEN** 被拒絕，原因是內容不對，不是沒有跟上

### Requirement: SHARING-304.1 接手的請求有不只一個問題時的原因

IF 接手的請求有不只一個會讓它被拒絕的問題，THEN the API SHALL 回報這個順序裡最前面的原因：對簽名的請求的檢查（SHARING-31.2）；寫法上的內容不對，也就是 SHARING-303.1 裡除了 `cursor` 的大小以外的每一項；不是成員，也就是打的群組沒有把這支手機記成成員手機，或沒有這個群組，兩種情況的回應一模一樣（SHARING-180.1）；`cursor` 比群組最新的序號大的內容不對；沒有這個申請；沒有跟上；需要換鑰匙；成員手機不一樣（SHARING-301.1）；鑰匙世代；沒有快照；群組滿了。被對簽名的請求的檢查以外的原因拒絕的請求，已經通過那些檢查：它算進這支裝置的請求數（SHARING-37.1），原樣再送一次是重送（SHARING-36.1）；除此之外，每個群組、它的成員手機、鑰匙世代、事件、快照、box、邀請、申請、交接和被接手的手機的紀錄都和收到它之前一樣。

#### Scenario: 沒簽名或沒註冊

- **WHEN** 「Casey 接手 Dana」沒帶簽名的四個欄位，或由還沒註冊的手機簽名
- **THEN** 兩個請求都被拒絕，原因是簽名，資料庫不變

#### Scenario: 寫法先於是不是成員

- **WHEN** 一支註冊過、不是成員手機的手機對 Brisbane 送內容是 `{}` 的接手的請求
- **THEN** 被拒絕，原因是內容不對

#### Scenario: 是不是成員先於其他

- **WHEN** 一支註冊過、不是成員手機的手機，對 Brisbane 和還沒有建立的 Tokyo 各送「Casey 接手 Dana」，`epoch` 是 9；Casey 的手機自己送「Casey 接手 Dana」
- **THEN** 三個請求都被拒絕，原因是不是成員（403），兩個群組得到的回應一模一樣；申請 P 還在

#### Scenario: cursor 太大先於沒有這個申請

- **WHEN** Brisbane 有三個事件；Taylor 的手機拒絕 Casey 之後，用 cursor 4 送「Casey 接手 Dana」
- **THEN** 被拒絕，原因是內容不對，不是沒有這個申請

#### Scenario: 之後依序是沒有這個申請、沒有跟上、需要換鑰匙、成員手機不一樣

- **WHEN** Brisbane 有三個事件，另一支手機 X 也是成員手機，X 退出了，所以群組需要換鑰匙；Casey 的手機在代號 A 再送了申請 Q。Taylor 的手機送接手 Casey 的請求，`request` 是 P 的 SHA-256，`cursor` 是 2，`epoch` 是 9，`remove` 是 Dana 的手機，`boxes` 只有給 X 的，快照 ID 是沒有上傳過的；把 `request` 改成 Q 的 SHA-256 再送；再把 `cursor` 改成 3 再送；Taylor 的手機替群組換了鑰匙、群組最新的序號是 4 之後，把 `cursor` 改成 4 再送
- **THEN** 四次的原因依序是沒有這個申請、沒有跟上、需要換鑰匙、成員手機不一樣

#### Scenario: 之後依序是鑰匙世代、沒有快照、群組滿了

- **WHEN** Brisbane 存著的事件的大小離上限只剩 199 bytes，群組最新的序號是 n。Taylor 的手機用 cursor n 送「Casey 接手 Dana」，`epoch` 是 3、快照 ID 是沒有上傳過的、`events` 是 200 bytes 的 E；把 `epoch` 改成 2 再送；再把快照 ID 改成涵蓋序號 n 的完整快照的再送
- **THEN** 三次的原因依序是鑰匙世代、沒有快照、群組滿了；Dana 的手機仍是成員手機，鑰匙世代仍是 1

#### Scenario: 被拒絕的請求用掉了 nonce

- **WHEN** Taylor 的手機送「Casey 接手 Dana」，`epoch` 是 3，被拒絕，原因是鑰匙世代；同一個請求原樣再送一次
- **THEN** 第二次被拒絕，原因是重送

### Requirement: SHARING-305.1 被接手的手機對這個群組的請求都被拒絕，回應說它被接手了

WHEN 接手的請求移除了一支手機（SHARING-300.1），the API SHALL 從那個 transaction 起拒絕它對這個群組的每個請求，原因是不是成員，狀態碼和內容和從來不是成員手機的手機得到的一模一樣（SHARING-257.1）：上傳、下載、快照的三個請求、建立和撤回邀請、列出、同意和拒絕申請、接手、換鑰匙、拿鑰匙和退出；並記著它是這個群組被接手的手機：這樣被拒絕的每個回應另外帶著標頭 `x-replaced`，值是 `takeover`。API 記到這兩件事之一發生為止：那支手機又成為這個群組的成員手機（SHARING-173.2、SHARING-300.1），或這個群組被刪除（SHARING-255.1）；清除不刪它（SYNC-141.3），不管過了多久。被換鑰匙的請求移除的手機（SHARING-250.1）、退出的手機（SHARING-254.1）和從來不是成員手機的手機，得到的回應都不帶這個標頭；被接手的手機對別的群組的請求、和不是因為「不是成員」而得到的回應也不帶。它的裝置身分、它在別的群組的成員手機資格都不變；它仍可以讀邀請、送申請，被同意或接手別人之後又是這個群組的成員手機。

#### Scenario: 被接手之後上傳和下載

- **WHEN** 「Casey 接手 Dana」之後，Dana 的手機對 Brisbane 上傳一個事件，再從 cursor 0 下載；一支註冊過、從來不是成員手機的手機送同樣的兩個請求
- **THEN** 四個請求都被拒絕，原因是不是成員（403），內容都是 `{"error":"not-a-member"}`；Dana 的手機得到的兩個回應有標頭 `x-replaced: takeover`，另一支手機得到的沒有這個標頭

#### Scenario: 每個請求

- **WHEN** 「Casey 接手 Dana」之後，Dana 的手機對 Brisbane 送：上傳、下載、問有沒有快照、上傳一塊快照、下載一塊快照、建立邀請、撤回邀請、列出申請、同意、拒絕、接手、換鑰匙、拿鑰匙和退出
- **THEN** 十四個請求都被拒絕，原因是不是成員（403），每個回應都有 `x-replaced: takeover`；資料庫除了這些請求的紀錄都不變

#### Scenario: 被移除和退出的手機沒有這個標頭

- **WHEN** 另外兩支手機 X 和 Y 也是 Brisbane 的成員手機；Taylor 的手機用換鑰匙的請求移除 X，Y 退出；X 和 Y 各從 cursor 0 下載 Brisbane
- **THEN** 兩個都被拒絕，原因是不是成員，回應都沒有 `x-replaced`

#### Scenario: 別的群組和別的回應

- **WHEN** Dana 的手機也是 Tokyo 的成員手機；「Casey 接手 Dana」之後，它在 Tokyo 上傳一個事件，對還沒有建立的群組下載，再對 Brisbane 送一個寫得不對的下載（`after=abc`）
- **THEN** Tokyo 的事件存下；另外兩個回應分別是不是成員和內容不對，都沒有 `x-replaced`

#### Scenario: 一年之後

- **WHEN** 「Casey 接手 Dana」在 T；在 T+365D 清除；之後 Dana 的手機從 cursor 0 下載 Brisbane
- **THEN** 被拒絕，原因是不是成員，回應仍有 `x-replaced: takeover`

#### Scenario: 又成為成員手機之後

- **WHEN** 「Casey 接手 Dana」之後，Dana 的手機在代號 A 送出申請，Taylor 的手機替它上傳完整的快照並同意它；之後 Taylor 的手機用換鑰匙的請求移除 Dana 的手機，Dana 的手機從 cursor 0 下載 Brisbane
- **THEN** 被拒絕，原因是不是成員，回應沒有 `x-replaced`：它這一次是被移除的

#### Scenario: 接手回來

- **WHEN** 「Casey 接手 Dana」之後，Dana 的手機在代號 A 送出申請，Taylor 的手機替它上傳完整的快照，送接手的請求，`remove` 是 Casey 的手機；之後 Casey 的手機和 Dana 的手機各從 cursor 0 下載 Brisbane
- **THEN** Casey 的手機被拒絕，原因是不是成員，回應有 `x-replaced: takeover`；Dana 的手機得到一頁

#### Scenario: 群組刪除之後

- **WHEN** 「Casey 接手 Dana」之後，Casey 的手機和 Taylor 的手機依序退出，Brisbane 被刪除；Dana 的手機從 cursor 0 下載 Brisbane。之後另一支手機用同一個群組 ID 建立群組，Dana 的手機再下載
- **THEN** 兩次都被拒絕，原因是不是成員，回應都沒有 `x-replaced`

### Requirement: SHARING-306.1 關於接手，API 只多存被接手的手機是哪一支

The API SHALL 關於一次接手只存 SHARING-300.1 說的東西：請求帶的事件、群組現在的成員手機和鑰匙世代、新的成員手機的進度、交接的代號、兩個裝置 ID、交出方的 box 公開金鑰、鑰匙世代和 box（SHARING-186.1），每個鑰匙的 box 的收件裝置 ID、鑰匙世代、交出方的 box 公開金鑰和 box（SHARING-263.1），和每支被接手的手機的群組 ID 和裝置 ID；請求帶的申請內容的 SHA-256、同意了的申請的內容、被拒絕的接手帶的 box、公開金鑰和事件，和請求的其他標頭都不存；被移除的手機的進度、給它的快照、box 和交接都不留。被接手的手機的紀錄不說它是被哪一支手機接手的，也不說什麼時候。新的群組鑰匙、算 salt 用的值和邀請的字串都不在任何請求裡，所以 API 打不開任何一個 box；哪支手機代表哪位成員，只寫在加密的事件裡。

#### Scenario: 接手之後的資料庫

- **WHEN** Taylor 的手機送「Casey 接手 Dana」，請求帶著 `User-Agent: TaylorsPhone/1.0` 和 `X-Member-Name: Dana-Kim`
- **THEN** 資料庫裡找得到 B、BT 和 E 的內容，各剛好一份，也找得到 K；找不到申請 P、P 的 SHA-256、`TaylorsPhone` 和 `Dana-Kim`

#### Scenario: 被接手的手機的紀錄

- **WHEN** Dana 的手機從 cursor 0 下載過 Brisbane；Taylor 的手機送「Casey 接手 Dana」
- **THEN** 資料庫裡同時帶著 Brisbane 的群組 ID 和 Dana 的手機的裝置 ID 的只有一列，那一列裡沒有 Casey 的手機和 Taylor 的手機的裝置 ID

#### Scenario: 被拒絕的接手

- **WHEN** Taylor 的手機送「Casey 接手 Dana」，`epoch` 是 3；或 `boxes` 另外有給 Casey 的手機的
- **THEN** 資料庫裡找不到這兩個請求帶的 box、公開金鑰和事件的內容，不論是原始的 bytes、十六進位還是 Base64；沒有被接手的手機的紀錄

### Requirement: SHARING-307.1 同樣的路徑配上別的方法，不是接手的請求

IF 簽名的請求打 `/groups/<群組 ID>/requests/<裝置 ID>/takeover` 而方法不是 `POST`，THEN the API SHALL 把它當成路徑沒有路由的請求，回答找不到，不改任何申請和成員手機。`HEAD` 也一樣。

#### Scenario: 別的方法

- **WHEN** Taylor 的手機對 `/groups/9b2f6c1e-8d47-4f3a-b1c5-2e7d90a4f6b8/requests/7c9e6679-7425-40de-944b-e07fc1f90ae7/takeover` 送 `GET`、`HEAD`、`DELETE` 和帶著接手的內容的 `PUT`
- **THEN** 四個請求都得到找不到（404），不是任何一種拒絕；申請 P 還在，Dana 的手機仍是成員手機，Casey 的手機不是

### Requirement: SHARING-308.1 同時到的接手和別的請求，結果和一個接一個到的一樣

WHEN 同一個群組的接手的請求，和另一個接手、同意、拒絕、換鑰匙、退出或上傳的請求同時送到，the API SHALL 讓結果和它們一個接一個處理的某一種順序一樣：照同一個 cursor 接手的兩個請求只有一個成功，另一個被拒絕，原因是沒有跟上：成功的那一個帶的事件讓群組最新的序號變大；同一個申請的接手和同意或拒絕只有一個成功，另一個被拒絕，原因是沒有這個申請；被接手的手機同時上傳的事件，不是在接手之前存下、接手因此被拒絕、原因是沒有跟上，就是被拒絕、原因是不是成員；被接手的手機同時退出時，不是退出好了、接手被拒絕、原因是需要換鑰匙，就是接手好了、退出被拒絕、原因是不是成員。所以群組裡不會有被接手的手機在接手之後存下的事件，不會有兩支手機都接手了同一支，也不會有成員手機少了它那個鑰匙世代的 box 或交接。

#### Scenario: 兩支成員手機同時讓兩支新手機接手同一支

- **WHEN** 五個群組各有三支成員手機和兩個申請，各有給申請的手機的完整快照；其中兩支成員手機用同一個 cursor 和 `epoch` 2，同時各送一個接手的請求，各接手一個申請，`remove` 都是第三支
- **THEN** 每個群組都剛好一個請求得到接手好了，另一個被拒絕，原因是沒有跟上；每個群組的鑰匙世代是 2，成員手機是原本那兩支和成功的那個申請的手機，被拒絕的那個申請還在，事件只有成功的那個請求帶的

#### Scenario: 同一個申請的接手和同意同時

- **WHEN** 五個群組各有三支成員手機、一個申請和它的完整快照；一支成員手機送接手的請求，`remove` 是第三支，另一支同時送同意的請求
- **THEN** 每個群組都是這兩種之一：接手好了，同意被拒絕，原因是沒有這個申請，第三支不是成員手機，鑰匙世代是 2；或同意好了，接手被拒絕，原因是沒有這個申請，第三支仍是成員手機，鑰匙世代是 1。兩種裡申請的手機都是成員手機，都剛好有一個交接

#### Scenario: 接手和被接手的手機的上傳同時

- **WHEN** 五個群組各有兩支成員手機、一個申請和它的完整快照；一支成員手機送接手的請求，`remove` 是另一支，另一支同時用鑰匙世代 1 上傳一個新事件
- **THEN** 每個群組都是這兩種之一：接手好了，上傳被拒絕，原因是不是成員，群組的事件只有接手帶的；或上傳存下了，接手被拒絕，原因是沒有跟上，另一支仍是成員手機，鑰匙世代仍是 1

#### Scenario: 接手和被接手的手機的退出同時

- **WHEN** 五個群組各有三支成員手機、一個申請和它的完整快照；一支成員手機送接手的請求，`remove` 是第三支，第三支同時退出
- **THEN** 每個群組第三支都不是成員手機；接手得到接手好了、退出被拒絕、原因是不是成員，或退出好了、接手被拒絕、原因是需要換鑰匙，這時申請還在，申請的手機不是成員手機

### Requirement: SHARING-320.1 選有手機的成員是要接手，沒有別的手機能同意時不能送出

WHILE 表單選著一位有手機的成員，the mobile app SHALL 在「A member of this group has to approve your request.」的位置改顯示：名片上另外還有有手機的成員時，「Another member of this group has to approve your request. When they do, <成員名稱>'s current phone will lose access to this group right away.」；名片上沒有別的有手機的成員時，「No other member has joined this group from a phone, so no one can approve this request.」，並停用「Send Request」，按了沒有反應：只有別的成員的手機能同意接手（SHARING-194.2）。成員名稱是名片上的。WHEN 使用者選著一位有手機的成員按「Send Request」，而它沒有被 SHARING-127.1 和上面那一句擋下，the mobile app SHALL 照 SHARING-134.1 存下並送出，這個申請是要接手的申請：本機資料記著它要接手，重新啟動 app 之後還記著，送出的內容帶著 `takeover`（SHARING-135.2）。名字欄位的名字和名片上的成員同名時也照常送出：SHARING-128.1 只管選著「New Member」的時候。選著「New Member」或沒有手機的成員時送出的申請不是要接手的申請。有手機的成員不會被預設選著（SHARING-126.1），要使用者自己按了才選。

#### Scenario: 選有手機的成員

- **WHEN** 名片上 Taylor 和 Casey 都有手機；在 Brisbane 的表單按「Taylor, Already joined」那一列
- **THEN** 「Send Request」上面是「Another member of this group has to approve your request. When they do, Taylor's current phone will lose access to this group right away.」，沒有「A member of this group has to approve your request.」；「Send Request」可以按

#### Scenario: 送出要接手的申請

- **WHEN** 接著按「Send Request」
- **THEN** API 收到送出申請的請求；解開它，`memberId` 是 Taylor 的成員 ID，`takeover` 是 `true`；Join Group 顯示「Waiting for Approval」

#### Scenario: 沒有別的手機能同意

- **WHEN** Brisbane 的名片上只有 Taylor 有手機；在表單按「Taylor, Already joined」那一列，再按「Send Request」
- **THEN** 「Send Request」上面是「No other member has joined this group from a phone, so no one can approve this request.」；「Send Request」是停用的，按了之後 API 沒有多收到請求，本機資料沒有申請，這支手機沒有裝置身分

#### Scenario: 改選回去

- **WHEN** 接著按「Casey」，再按「Send Request」
- **THEN** 那一句回到「A member of this group has to approve your request.」；申請送出了，解開的明文沒有 `takeover` 這個欄位

#### Scenario: 名字和要接手的成員同名

- **WHEN** 名字是「Taylor」的手機打開 Brisbane 的連結，名片上 Taylor 和 Casey 都有手機；不改選就按「Send Request」；再按「Taylor, Already joined」那一列，按「Send Request」
- **THEN** 先是選著「New Member」，名字欄位下方顯示「A member with this name already exists.」，沒有送出（SHARING-128.1）；改選之後這句話消失，申請送出了，是要接手 Taylor 的申請

#### Scenario: 重新啟動之後還記著

- **WHEN** 名片上 Taylor 和 Casey 都有手機；沒有網路時選「Taylor, Already joined」那一列、按「Send Request」，關閉 Join Group，重新啟動 app；有網路之後在 Groups 根畫面按申請的卡片，再按「Try Again」
- **THEN** 送出的申請解開之後，`memberId` 是 Taylor 的成員 ID，`takeover` 是 `true`

### Requirement: SHARING-321.1 授權失效的手機送出申請時，先換一個新的裝置身分

WHEN 使用者在表單按「Send Request」而它沒有被 SHARING-127.1、SHARING-128.1 或 SHARING-320.1 擋下，或替還沒送出的申請按「Try Again」，而這支手機授權失效（SHARING-29.1），the mobile app SHALL 先替這支手機換一個新的裝置身分，再照常繼續（SHARING-226.2、SHARING-134.1）：新的裝置 ID 和 seed 照 SHARING-20.1 產生和存放，seed 先存進 secure store；然後在同一個 SQLite transaction 裡，把這支手機上還不是唯讀副本的每個共同帳本記成唯讀副本，原因是授權失效（sync 的 SYNC-301.1、SYNC-302.1），刪掉本機資料存著的每個申請，正要再送的那一個除外，並把本機資料的裝置 ID 換成新的、把註冊好了的記號拿掉，時間差不變。那些申請屬於舊的裝置身分：這支手機問不到它們的結果，也取消不了。換好之後這支手機有裝置身分，不再是授權失效：接著的請求先註冊（SHARING-22.1），用新的裝置 ID 和新的公開金鑰簽名，申請帶的 `boxKey` 也是從新的 seed 導出的（SHARING-136.1）。舊的裝置 ID 不再出現在這支手機送的任何請求裡；secure store 裡別的裝置 ID 的項目不動。唯讀副本、它們的原因和待上傳的事件都不因為換裝置身分而變（SYNC-302.1）；這支手機之後被同意加入時，匯入的快照照 SHARING-289.1 取代那個群組的副本。除了這兩個時候，授權失效的手機不換裝置身分：打開 app、打開邀請連結、匯入匯出檔，和別的功能要送請求時都不換（SHARING-29.1、SHARING-106.1）。IF seed 存不進 secure store，或那個 transaction 存不進去，THEN the mobile app SHALL 讓這支手機和之前一樣是授權失效，裝置 ID、共同帳本和申請都不變，照 SHARING-141.2 提示。

#### Scenario: 匯入舊手機的匯出檔之後申請

- **WHEN** 一支手機匯入了 Taylor 的手機的匯出檔，所以它授權失效，裝置 ID 是 Taylor 的手機的，Brisbane 在它上面是唯讀副本，沒有待上傳的事件；它打開 Brisbane 的新邀請的連結，按「Send Request」
- **THEN** API 依序收到三個請求：沒有簽名的讀邀請、對 `/devices` 的 `POST`，和送出申請的 `PUT`，後兩個的裝置 ID 相同，是 `expo-crypto` 的 `randomUUID` 給的，不是 Taylor 的手機的；secure store 裡有名稱裡有新的裝置 ID 的項目；Join Group 顯示「Waiting for Approval」；Brisbane 仍是唯讀副本，原因仍是授權失效

#### Scenario: 申請用新的 seed

- **WHEN** 接著解開那個送出申請的請求
- **THEN** 明文的 `boxKey` 是從新的 seed 導出的 box 私鑰的公開金鑰；附加資料裡的裝置 ID 是新的

#### Scenario: 還不是唯讀副本的共同帳本

- **WHEN** 這支手機邀請過人加入自己的群組 Paris，所以 Paris 是共同帳本；之後 secure store 裡沒有了它的 seed，app 還沒有再為 Paris 同步過；打開 Brisbane 的連結，按「Send Request」
- **THEN** 這支手機的裝置 ID 是新的；Paris 是唯讀副本，原因是授權失效；從按下去起，API 沒有收到 Paris 的任何請求

#### Scenario: 舊的申請刪掉

- **WHEN** 授權失效的手機的本機資料存著一個等待同意的 Tokyo 的申請；它打開 Brisbane 的連結，按「Send Request」
- **THEN** 本機資料只有 Brisbane 的申請，Groups 根畫面沒有 Tokyo 的申請的卡片；從按下去起，API 沒有收到代號 B 的任何請求

#### Scenario: 別的時候不換

- **WHEN** 授權失效的手機重新啟動 app，打開 Brisbane 的連結看表單再關閉；之後再打開連結，按「Send Request」
- **THEN** 關閉表單之後這支手機仍是授權失效，裝置 ID 和之前一樣，secure store 裡沒有多出項目，API 沒有多收到註冊的請求；按了「Send Request」之後裝置 ID 才換成新的

#### Scenario: 有副本時換了之後才確認

- **WHEN** 授權失效的手機上，唯讀副本 Brisbane 有一個待上傳的事件；它打開 Brisbane 的新邀請的連結，按「Send Request」；在提示框按「Cancel」
- **THEN** 跳出「Replace This Copy?」（SHARING-226.2）；按了「Cancel」之後 API 只收到讀邀請的請求，本機資料沒有申請；這支手機有裝置身分，裝置 ID 是新的，還沒有註冊

### Requirement: SHARING-322.1 按 Approve 同意要接手的申請時，備好接手的請求再送出

WHEN 使用者在要接手的申請的選單按「Approve」，the mobile app SHALL 照 SHARING-195.2 的步驟做，前一步沒做成就不做下一步，只有最後送的不是同意的請求：同步這個共同帳本，上傳了事件就再同步一次；在同一個 SQLite transaction 裡，照那一刻的本機資料再看一次這個申請能不能同意（SHARING-194.2）、記下這支手機在這個共同帳本的 cursor、找出要離開的手機和留下來的手機、備好事件（SHARING-323.1），並讀出快照的內容（SHARING-197.1）；替申請的手機上傳那份快照；產生新的群組鑰匙並裝好 box（SHARING-324.1）；送接手的請求（SHARING-300.1），路徑帶著群組 ID 和申請的裝置 ID，`request` 是選單打開時那一列的申請的內容的 SHA-256，`cursor` 是那個 transaction 裡記下的 cursor，也就是那份快照涵蓋的序號，`snapshotId` 是剛上傳的那份快照的，`epoch` 是這支手機在這個共同帳本的鑰匙世代（SYNC-94.1）加 1，`remove` 是要離開的手機，`senderKey`、`box`、`boxes` 和 `events` 照 SHARING-323.1 和 SHARING-324.1。要離開的手機，是那一刻名冊裡代表選的成員的每一支別的手機（SYNC-251.2），不看那筆紀錄的使用者 ID；留下來的手機，是名冊裡代表某位成員的其餘每一支手機，加上這支手機自己；申請的手機兩邊都不算。這支手機不送同意的請求，也不另外送換鑰匙的請求：移除舊手機、加入新手機和換鑰匙是同一個請求。API 回答接手好了之前，本機資料不因為這次接手而變：名冊、成員、待上傳的事件和這支手機的鑰匙世代都不變，secure store 裡沒有新的群組鑰匙。已經照從這裡接著的回答往下同步的手機（SYNC-173.1）是跟得上的手機，照常同意接手；還在等快照的手機照 SHARING-326.1。

#### Scenario: 同意接手

- **WHEN** 新手機申請接手 Dana，Taylor 的手機同意接手
- **THEN** API 依序收到：Brisbane 的下載；給 N 的快照的每一塊；一個 `POST /groups/<Brisbane 的群組 ID>/requests/<N>/takeover`，它的 `request` 是那個申請的內容的 SHA-256，`cursor` 等於那份快照涵蓋的序號，`snapshotId` 是那份快照的，`epoch` 是 2，`remove` 只有 D，`boxes` 只有給這支手機的那一個。API 沒有收到同意的請求和換鑰匙的請求

#### Scenario: API 回答之前

- **WHEN** API 還沒回答接手的請求
- **THEN** Members 的成員仍是 Taylor、Casey、Blake 和 Dana，Dana 那一列有「Joined」；名冊裡 D 仍代表 Dana，沒有 N 的紀錄；本機資料沒有待上傳的事件，secure store 裡沒有 Brisbane 鑰匙世代 2 的群組鑰匙

#### Scenario: 留下來的別支手機

- **WHEN** 另一支手機 E 被同意代表 Casey，Taylor 的手機同步過；新手機申請接手 Dana，Taylor 的手機同意接手
- **THEN** 接手的請求的 `remove` 只有 D，`boxes` 是給這支手機和 E 的兩個，沒有給 N 的

#### Scenario: 兩支手機代表同一位成員

- **WHEN** 名冊裡有兩支別的手機的紀錄都代表 Casey；新手機申請接手 Casey，這支手機同意接手
- **THEN** 接手的請求的 `remove` 是那兩支手機，`boxes` 只有給這支手機的

#### Scenario: 同意之前先上傳自己的變更

- **WHEN** Taylor 的手機沒有網路時新增了 Dinner；有網路之後列出申請，同意接手
- **THEN** 接手的請求送出之前，Dinner 的事件已經上傳，這支手機也下載過它；那份快照有 Dinner，涵蓋的序號是 Dinner 的事件的序號

#### Scenario: 接著同步之後的手機

- **WHEN** Brisbane 的事件在清除裡都刪了，Taylor 的手機和 Dana 的手機都落後，Dana 的手機先下載過、cursor 不比 Taylor 的手機的大；Taylor 的手機同步，得到從這裡接著的回答並接著同步；之後新手機申請接手 Dana，Taylor 的手機同意接手
- **THEN** API 回答接手好了；Dana 的手機不是成員手機，N 是

### Requirement: SHARING-323.1 接手帶的事件把名冊裡的舊手機換成新手機

WHEN 備接手的請求，the mobile app SHALL 讓 `events` 依序是這些事件，各有新的事件 ID，各照 SYNC-67.1 用新的群組鑰匙和新的鑰匙世代加密：這支手機自己的名冊紀錄的第一個事件，本機資料的名冊裡還沒有它時才有，內容和 SHARING-196.2 的一樣，所以快照的名冊裡一定有同意的這支手機（SHARING-218.1）；申請的手機的名冊紀錄的事件，紀錄的 ID 是申請的裝置 ID，代表的是選的成員的成員 ID，和申請的 `userId` 和 `boxKey`（SYNC-250.2），名冊裡已經有這支手機的紀錄時帶著根據的版本；再來是每一支要離開的手機各一個把它的名冊紀錄改成不代表任何人的事件，帶著根據的版本，依裝置 ID 由小到大（SYNC-1.1 比裝置 ID 的比法）。沒有成員紀錄的事件：選的成員的名稱和「是否被移出群組」都不改，接手前後都有手機代表他，他一直是群組的成員（SYNC-36.4）。每個事件的格式版本是 1，判定為可以套用，時間戳記是用校正後的時間和這支手機的裝置 ID 取的新時間戳記（SYNC-2.1），一個接一個；取的時候就記下手機看過的最新時間戳記，並和待上傳的事件一樣先檢查過（SYNC-84.1、SYNC-85.1），和同意帶的事件一樣（SHARING-196.2）。替申請的手機上傳的快照照 SHARING-197.1 帶著這些事件的紀錄，用的是這支手機現在的鑰匙世代的群組鑰匙：快照在接手的請求之前上傳，那時群組還沒有換鑰匙（SYNC-106.1）。

#### Scenario: 接手 Dana

- **WHEN** 手機的時鐘和 API 的時間是 T+60,000，新手機申請接手 Dana，Taylor 的手機同意接手
- **THEN** 名冊裡已經有這支手機的紀錄，所以接手的請求有兩個事件，用新的群組鑰匙和鑰匙世代 2 的附加資料解得開，依序是：名冊紀錄 N 的第一個事件，代表 Dana 的成員 ID、新手機的使用者 ID 和它的 box 公開金鑰，沒有根據的版本；名冊紀錄 D 的事件，把代表改成不代表任何人，帶著根據的版本。時間戳記依序是 `T+60000/0/<這支手機的裝置 ID>` 和計數器 1 的；用鑰匙世代 1 的群組鑰匙解不開；沒有成員紀錄的事件

#### Scenario: 兩支手機代表同一位成員

- **WHEN** 名冊裡有兩支別的手機的紀錄都代表 Casey，沒有這支手機的紀錄；新手機申請接手 Casey，這支手機同意接手
- **THEN** 接手的請求有四個事件：這支手機自己的名冊紀錄、新手機的名冊紀錄，再來是那兩支手機的名冊紀錄改成不代表任何人的事件，依它們的裝置 ID 由小到大

#### Scenario: 離開過的手機回來接手

- **WHEN** 新手機以前在 Brisbane 裡，名冊裡 N 的紀錄不代表任何人；它申請接手 Dana，Taylor 的手機同意接手
- **THEN** 名冊紀錄 N 的事件帶著根據的版本，是它改成不代表任何人的那個時間戳記

#### Scenario: 快照帶著這些紀錄

- **WHEN** Taylor 的手機同意接手 Dana
- **THEN** 給 N 的快照用 Brisbane 鑰匙世代 1 的群組鑰匙解得開；它的紀錄裡，名冊紀錄 N 代表 Dana，名冊紀錄 D 不代表任何人，這兩個單位的值和時間戳記都和接手的請求裡那兩個事件的一樣；成員 Dana 的紀錄和 Taylor 的手機原本的一樣

#### Scenario: 名冊裡還沒有這支手機

- **WHEN** 名冊裡有別支手機代表 Casey 的紀錄，沒有這支手機的紀錄；新手機申請接手 Casey，這支手機同意接手
- **THEN** 接手的請求有三個事件：這支手機自己的名冊紀錄的第一個事件在最前面，再來是新手機的和別支手機的

### Requirement: SHARING-324.1 接手時，新的群組鑰匙裝在給留下來的手機和新手機的 box 裡

WHEN 備接手的請求，the mobile app SHALL 用 `expo-crypto` 給的 32 bytes 當新的群組鑰匙，每次按「Approve」都是新的；`boxes` 是照 SHARING-272.1 替每一支留下來的手機各裝的 box，這支手機自己也有一個，要離開的手機和申請的手機都沒有；`senderKey` 是這支手機的 box 公開金鑰；`box` 是照 SHARING-198.1 裝給申請的手機的 box，其中情境的最後一行是新的鑰匙世代，內容是從那份快照的鑰匙世代到新的鑰匙世代的每一把群組鑰匙，依世代由小到大，新的那一把在最後。所以申請的手機用同一個 box 打得開快照，也解得開接手之後的事件；要離開的手機沒有上一把之後的任何鑰匙，請求裡沒有它打得開的 box。IF 這支手機沒有現在的鑰匙世代的群組鑰匙，THEN the mobile app SHALL 不上傳快照，也不送接手的請求（SHARING-326.1）。

#### Scenario: 新手機打得開

- **WHEN** 新手機申請接手 Dana，Taylor 的手機同意接手
- **THEN** 用新手機的 box 私鑰、請求的 `senderKey`、從 S 導出的交接的 salt，和 `shared-expense/invite/handover/v1`、代號 A、Brisbane 的群組 ID、`2` 這四行的情境打開 `box`，得到 `{"keys":[{"epoch":1,"key":"<Brisbane 鑰匙世代 1 的群組鑰匙>"},{"epoch":2,"key":"<64 個小寫十六進位字元>"}]}`；鑰匙世代 2 的那一把是 `expo-crypto` 給的 32 bytes，不是鑰匙世代 1 的那一把

#### Scenario: 留下來的手機打得開

- **WHEN** 另一支手機 E 代表 Casey；Taylor 的手機同意接手 Dana
- **THEN** 用 E 的 box 私鑰、請求的 `senderKey`、從 Brisbane 鑰匙世代 1 的群組鑰匙導出的 salt，和 `shared-expense/group-key/rotation/v1`、Brisbane 的群組 ID、E、`2` 這四行的情境打開給 E 的 box，得到 `{"keys":[{"epoch":2,"key":"<新的群組鑰匙>"}]}`，和 `box` 裡鑰匙世代 2 的是同一把；給這支手機自己的那一個也是

#### Scenario: 舊手機打不開

- **WHEN** Taylor 的手機同意接手 Dana
- **THEN** `boxes` 裡沒有 D 的，也沒有 N 的；用 Dana 的手機的 box 私鑰打不開 `box` 和 `boxes` 裡的任何一個

#### Scenario: 每次都是新的

- **WHEN** 第一次同意接手時 API 回 500；再按一次「Approve」
- **THEN** 兩個接手的請求的 `box` 解開的鑰匙世代 2 的群組鑰匙不同

### Requirement: SHARING-325.1 API 回答接手好了之後存下新的群組鑰匙，再同步

WHEN API 回答接手好了，the mobile app SHALL 照 SYNC-94.1 替這個共同帳本存下新的群組鑰匙，鑰匙世代是回應的 `epoch`，再同步這個共同帳本一次：下載到自己剛才送出的事件並照常套用（SYNC-28.3），名冊是這時才改進本機資料的；再列出申請（SHARING-190.2）。之後選的成員仍是群組的成員，不是前成員，Members 照常列出他和「Joined」（GROUPS-24.4），他的名稱、付款和分攤都不變（GROUPS-66.1）；名冊裡代表他的是申請的手機，要離開的手機不代表任何人；比這次接手早的邀請被撤回（SHARING-284.1），名片照常更新（SHARING-109.1）。IF 新的群組鑰匙存不進 secure store，THEN the mobile app SHALL 照常同步：它用給自己的那個 box 拿回這把鑰匙（SHARING-278.1）。

#### Scenario: 接手好了之後

- **WHEN** 有 Dana 付、Taylor、Casey、Blake 和 Dana 分攤的 Dinner；新手機申請接手 Dana，Taylor 的手機同意接手，API 回答接手好了
- **THEN** Members 的成員由上而下仍是「Taylor (You)」、「Casey」、「Blake」和「Dana」，Dana 那一列有「Joined」；Dinner 仍是「Paid by Dana」；沒有申請那一區；secure store 裡有 `group-key.<Brisbane 的群組 ID>.2`；名冊裡 N 代表 Dana，D 不代表任何人

#### Scenario: 比接手早的邀請被撤回

- **WHEN** 接著這次同步結束
- **THEN** API 收到對 `/groups/<Brisbane 的群組 ID>/invites/3q2-7wEjRWeJq83vEjRWeA` 沒有內容的 `DELETE`（SHARING-284.1）

#### Scenario: 之後用新的鑰匙記帳

- **WHEN** 接著新增 Lunch 並同步
- **THEN** 上傳的請求的鑰匙世代是 2，用新的群組鑰匙解得開那個事件

#### Scenario: 回答沒有送到

- **WHEN** API 接手好了，回應卻沒送到手機；之後重新啟動 app
- **THEN** 先是跳出「Unable to Approve」，訊息是「Connect to the internet and try again.」（SHARING-326.1）；重新啟動之後這支手機拿到給它自己的 box，存下鑰匙世代 2 的群組鑰匙，名冊裡 N 代表 Dana

#### Scenario: 鑰匙存不進去

- **WHEN** API 回答接手好了，secure store 這時卻寫不進去；恢復之後重新啟動 app
- **THEN** 重新啟動之後 secure store 裡有鑰匙世代 2 的群組鑰匙，名冊裡 N 代表 Dana

### Requirement: SHARING-326.1 接手沒成功時說明原因，申請還在

IF 接手沒有做完，THEN the mobile app SHALL 不因此改本機資料，收到的申請還在，並照 SHARING-200.2 說明和處理——那一條說同意的請求的地方，在這裡是接手的請求，提示框的標題一樣是「Unable to Approve」——只有這幾點不同。同意之前最後那一次同步結束之後，這個共同帳本在等快照（SYNC-165.1）時，不上傳快照，也不送接手的請求，訊息是「This phone is still catching up with this group, so it can't approve this request yet. If <成員名稱>'s old phone is the only other phone in this group, remove <成員名稱> from the group and send a new invite link.」，成員名稱是選的成員的：等快照的手機做不出給新手機的快照；它把那位成員移除之後（SHARING-270.1，不必跟上）就能照從這裡接著的回答往下同步，回來的人再用新的邀請當新成員申請，照 SHARING-288.1 加回來。API 拒絕接手、原因是沒有跟上時，再同步，再在同一個 transaction 裡看一次：這個申請仍可以同意，要離開的手機、留下來的手機和這支手機的鑰匙世代也都和備請求時一樣，才用同一份快照、同樣的事件和同樣的 box 再送，`cursor` 是這次記下的；有一項不一樣就不再送，不能同意了時訊息是 SHARING-194.2 那個原因的那一句，否則是其他情況的那一句。一次接手這樣最多再送兩次。API 拒絕接手、原因是成員手機不一樣或鑰匙世代時不再送，照其他情況，訊息是「Something went wrong. Try again later.」；使用者再按「Approve」時從頭再做。這支手機沒有現在的鑰匙世代的群組鑰匙時（SHARING-324.1）也照其他情況。接手不會因為成員手機滿了被拒絕（SHARING-302.1）。接手的請求送出 60 秒之後還沒有收完回應時，照 SHARING-204.1 放棄它，當成沒有得到回應。

#### Scenario: 沒有網路

- **WHEN** 手機沒有網路，新手機申請接手 Dana 的那一列還在，在它的選單按「Approve」
- **THEN** 跳出「Unable to Approve」，訊息是「Connect to the internet and try again.」；那一列還在；本機資料的名冊不變，沒有待上傳的事件

#### Scenario: 這支手機在等快照

- **WHEN** Taylor 的手機落後了，Brisbane 在等快照；收到的申請有新手機要接手 Dana 的，在它的選單按「Approve」
- **THEN** API 收到 Brisbane 的下載和問有沒有快照的請求，沒有收到快照的分塊和接手的請求；跳出「Unable to Approve」，訊息是「This phone is still catching up with this group, so it can't approve this request yet. If Dana's old phone is the only other phone in this group, remove Dana from the group and send a new invite link.」；那一列還在

#### Scenario: 別的成員已經處理過

- **WHEN** API 拒絕接手的請求，原因是沒有這個申請；之後列出時 API 上沒有申請
- **THEN** 跳出「Unable to Approve」，訊息是「This request has already been answered.」；Members 沒有申請那一區

#### Scenario: 沒有跟上時再同步、再送

- **WHEN** API 拒絕第一個接手的請求，原因是沒有跟上，這時 Brisbane 多了別支手機的一筆支出的事件
- **THEN** 沒有跳出提示框；API 接著收到 Brisbane 的下載和第二個接手的請求，它的 `cursor` 比第一個大 1，`snapshotId`、`epoch`、`remove`、`box`、`boxes` 和 `events` 和第一個一樣；API 回答接手好了之後，名冊裡 N 代表 Dana

#### Scenario: 沒有跟上，名冊也變了

- **WHEN** API 拒絕第一個接手的請求，原因是沒有跟上，這時 Brisbane 多了另一支手機 E 被同意代表 Casey 的事件
- **THEN** API 接著收到 Brisbane 的下載，沒有收到第二個接手的請求；跳出「Unable to Approve」，訊息是「Something went wrong. Try again later.」；那一列還在，再按一次「Approve」時 `boxes` 有給 E 的

#### Scenario: 同步之後變成不能同意

- **WHEN** 新手機申請接手 Dana；按「Approve」之後的那次同步，下載到 Dana 的手機離開、Dana 被移出群組的事件
- **THEN** API 沒有收到快照的分塊和接手的請求；訊息是「The member this request chose is no longer in this group. This request can't be approved.」

#### Scenario: 一直沒有跟上

- **WHEN** API 每次都拒絕接手的請求，原因是沒有跟上
- **THEN** API 一共收到三個接手的請求；之後跳出「Unable to Approve」，訊息是「Something went wrong. Try again later.」

#### Scenario: 其他情況

- **WHEN** API 拒絕接手的請求，原因是成員手機不一樣；或原因是鑰匙世代；或回 500；或這支手機的 secure store 裡沒有它在 Brisbane 的鑰匙世代的群組鑰匙
- **THEN** 都跳出「Unable to Approve」，訊息是「Something went wrong. Try again later.」；那一列還在；前三種 API 只收到一個接手的請求，最後一種沒有收到

#### Scenario: 接手一直沒有回應

- **WHEN** 在那個申請的選單按「Approve」，API 收下了接手的請求，卻一直沒有回答；過了 50 秒；再過 15 秒
- **THEN** 50 秒時那一列是「Dana K.」和「Approving…」；再過 15 秒，跳出「Unable to Approve」，訊息是「Connect to the internet and try again.」

### Requirement: SHARING-327.1 接手的鑰匙和成員只以密文離開手機

The mobile app SHALL 不把新的群組鑰匙、用來算 salt 的上一把群組鑰匙和那個 salt、選的成員的成員 ID 和名稱、申請的名字、申請的使用者 ID 和 box 公開金鑰、邀請的字串、申請金鑰和交接的 salt 以明文放進任何請求：網址、簽名的欄位和內容裡都沒有，不論是原始的 bytes、十六進位還是 Base64。API 只從路徑、`remove` 和 `boxes` 得知哪一支手機加入、哪些離開、哪些留下；一個要接手的申請和別的申請，密文一樣長（SHARING-135.2）。

#### Scenario: 申請接手和同意接手

- **WHEN** 新手機申請接手 Dana，名字是「Dana K.」；Taylor 的手機列出申請，同意接手
- **THEN** 兩支手機送給 API 的每個請求裡都找不到「Dana K.」、「Dana」、Dana 的成員 ID、新手機的使用者 ID 和 box 公開金鑰、Brisbane 鑰匙世代 1 和 2 的群組鑰匙、從它們導出的 salt、S、申請金鑰和交接的 salt

### Requirement: SHARING-328.1 (manual) 三支真的手機：接手之後舊手機立刻失去存取權，新手機就是那位成員

WHEN 一支真的手機的成員同意另一支真的手機接手第三支真的手機的成員，the mobile app SHALL 讓新手機有那個群組的全部資料、就是原本那位成員，舊手機從那一刻起收不到群組之後的任何變更，它上面的群組成為唯讀副本，橫幅說明它被接手了。

#### Scenario: iPhone 和 Android 都當過新手機和舊手機

- **WHEN** 在裝了連到同一個環境的 build 的三支手機上，前兩支已經在同一個有幾筆支出的共同帳本裡：第一支在 Members 建立新的邀請並分享連結；第三支打開連結，選第二支的成員那一列（「Already joined」），送出申請；第一支打開 Members，點那個申請，按「Approve」；第三支把 app 切到背景再回來；第一支和第三支各新增一筆支出，再各打開 app 一次；第二支把 app 切到背景再回來，再試著新增這個群組的支出。之後第二支和第三支對調再做一次
- **THEN** 第一支的申請那一列寫著要接手誰，選單寫著對方原本的手機會立刻失去存取權；同意之後它的 Members 仍只有原本那幾位成員，被接手的那一位仍有「Joined」。第三支的 Groups 根畫面出現那個群組，Members 上自己那一列是那位成員的名稱和「(You)」，他以前付的支出仍在他名下；第一支和第三支各自新增的支出在對方的手機上也有。第二支回到 app 之後，群組的卡片上是「Read-only copy」，畫面上是「Another phone took over your place in this group. This copy is read-only and won't update.」，沒有那兩筆新的支出，New Expense 選不到這個群組

### Requirement: SHARING-330.1 接手之後，新手機就是原本那位成員

WHEN 被同意接手的手機加入好了（SHARING-216.1 到 SHARING-219.2），而留下來的成員手機都同步過，the mobile app SHALL 讓每支手機上這個共同帳本一模一樣（sync 的 SYNC-91.1 列的每一項），選的成員仍是原本那一位：他的成員 ID 和名稱不變，群組沒有多出成員，也沒有人成為前成員；他以前的付款和分攤仍在他名下，Balances 上每個人的已付、份額和淨額都和接手之前一樣；新手機上他那一列是他的名稱加上「 (You)」，別的成員手機上是他的名稱和「Joined」。新手機新增的支出別的成員手機都有，別的成員手機新增的它也有。新手機不沿用舊手機的裝置 ID、待上傳的事件和不套用的事件的紀錄（ADR-0047）：它寫的事件，時間戳記的裝置 ID 是它自己的。新手機上原本有這個群組的副本時，匯入的快照取代它（SHARING-289.1）。被接手的舊手機之後可以用新的邀請連結再申請，和別的手機一樣（SHARING-305.1）。

#### Scenario: 新手機是 Dana

- **WHEN** 有 Dana 付 80.00 USD、Taylor、Casey、Blake 和 Dana 分攤的 Dinner；新手機申請接手 Dana，申請的名字是「Dana K.」；Taylor 的手機同意接手，新手機得知結果並加入，兩支手機都同步
- **THEN** 新手機的 Members 由上而下是「Taylor」、「Casey」、「Blake」和「Dana (You)」，Taylor 那一列有「Joined」，沒有叫「Dana K.」的成員；Dinner 是「Paid by Dana」；Balances 上 Dana 的已付、份額和淨額和 Taylor 的手機上的一樣。Taylor 的手機的 Members 仍是四位成員，Dana 那一列有「Joined」；兩支手機上 Brisbane 的資料一模一樣

#### Scenario: 之後各自記帳

- **WHEN** 接著新手機在 Brisbane 新增 Lunch，Taylor 的手機新增 Taxi，兩支手機各同步兩次
- **THEN** 兩支手機都有 Lunch 和 Taxi，各一筆；Lunch 的事件的時間戳記的裝置 ID 是 N；API 上那兩個事件的鑰匙世代都是 2

#### Scenario: 舊手機

- **WHEN** 接著 Dana 的手機重新啟動 app，再試著在 Brisbane 新增支出
- **THEN** API 拒絕它的下載，原因是不是成員；Brisbane 是唯讀副本，橫幅是「Another phone took over your place in this group. This copy is read-only and won't update.」（groups 的 GROUPS-155.2），沒有 Lunch 和 Taxi，沒有「Add expense」；secure store 裡沒有 Brisbane 的群組鑰匙

#### Scenario: 匯入過舊手機的匯出檔的新手機

- **WHEN** 新手機先匯入 Dana 的手機的匯出檔，裡面有個人支出 Coffee，Brisbane 在匯入之後是唯讀副本，原因是授權失效，有一個待上傳的事件；它打開 Brisbane 的新邀請的連結，選「Dana, Already joined」那一列，按「Send Request」，在「Replace This Copy?」按「Send Request」；Taylor 的手機同意接手，新手機得知結果
- **THEN** 新手機上 Brisbane 是共同帳本，不是唯讀副本，Members 上是「Dana (You)」；那個待上傳的事件不在了，沒有上傳；Coffee 還在；之後它在 Brisbane 新增的支出照常上傳，Taylor 的手機收得到

#### Scenario: 舊手機再接手回來

- **WHEN** 新手機接手 Dana 之後，Dana 的手機用 Taylor 的手機建立的新邀請，選「Dana, Already joined」那一列申請；Taylor 的手機同意接手；三支手機都打開 app 一次
- **THEN** Dana 的手機上 Brisbane 又是共同帳本，Members 上是「Dana (You)」；新手機上它成為唯讀副本，橫幅是被接手的那一句；Taylor 的手機的 Members 仍是四位成員，名冊裡代表 Dana 的只有 D
