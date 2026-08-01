# web_fetch

以 Node.js、Playwright 與 Chromium 實作的外部網頁/PDF 擷取服務，可作為 OpenWebUI External Web Loader 使用。

GitHub repository：`https://github.com/ericli1018/awesome-web-fetch`

## 功能

- 批次接收多個 URL。
- 使用 Playwright Chromium 載入 JavaScript 網頁。
- 使用 stealth plugin 降低基本自動化特徵。
- 自動辨識並解析 PDF。
- 支援內容長度、批次數、逾時與 PDF 大小限制。
- 支援 Bearer API Key。
- 預設阻擋 localhost、私有 IP、link-local 與 metadata 類型目標。
- Docker Compose 每次啟動自動同步 GitHub、安裝 npm 套件並確認 Chromium。
- 不需要 Dockerfile，也不需要建立自訂 Docker image。

## 專案結構

```text
web_fetch/
├── index.mjs
├── src/
│   ├── config.mjs
│   ├── http-server.mjs
│   ├── loader.mjs
│   └── url-policy.mjs
├── test/
│   ├── config.test.mjs
│   ├── http-server.test.mjs
│   └── url-policy.test.mjs
├── package.json
├── docker-compose.part.yaml
├── .env.example
├── .gitignore
├── CHANGELOG.md
└── LICENSE
```

## 上傳至 GitHub

在解壓縮後的專案目錄執行：

```bash
git init
git add .
git commit -m "feat: initial web_fetch release"
git branch -M main
git remote add origin https://github.com/ericli1018/awesome-web-fetch.git
git push -u origin main
```

GitHub repository 必須先存在，且預設 branch 為 `main`。

## Docker Compose 使用

`docker-compose.part.yaml` 是完整有效的 Compose 範例，也可以合併到既有 Stack。

它直接使用：

```yaml
image: node:24-bookworm-slim
```

沒有 Dockerfile，也不會執行 `docker build`。

啟動：

```bash
docker compose -f docker-compose.part.yaml up -d
```

查看啟動紀錄：

```bash
docker compose -f docker-compose.part.yaml logs -f web_fetch
```

重新啟動並同步 GitHub 最新版本：

```bash
docker compose -f docker-compose.part.yaml restart web_fetch
```

每次容器啟動會執行：

1. 安裝 Git 與 CA certificates。
2. 初次執行時保留 Named Volume 掛載點，只清除其中內容，再 clone repository。
3. 後續執行時 fetch 並 reset 到 `origin/main`。
4. 執行 `npm install --omit=dev`。
5. 執行 `playwright install --with-deps chromium`。
6. 執行語法檢查。
7. 啟動 `node index.mjs`。

Git repository、npm cache、Chromium cache 均使用 Named Volume 保存。

## API Key

Compose 預設支援主機環境變數：

```bash
export WEB_FETCH_API_KEY='replace-with-a-long-random-key'
```

也可建立 `.env`：

```dotenv
WEB_FETCH_API_KEY=replace-with-a-long-random-key
```

若未設定，Compose 使用 `dummy`，此時 API 驗證會停用。正式環境不可使用 `dummy`。

## API

### 健康檢查

```bash
curl http://localhost:3005/healthz
```

### 擷取網址

```bash
curl http://localhost:3005/ \
  -H "Authorization: Bearer ${WEB_FETCH_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "urls": [
      "https://example.com",
      "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf"
    ]
  }'
```

輸出：

```json
[
  {
    "page_content": "...",
    "metadata": {
      "source": "https://example.com",
      "final_url": "https://example.com/",
      "title": "Example Domain",
      "type": "html"
    }
  }
]
```

OpenWebUI 與本服務使用同一個 Docker network 時，服務網址為：

```text
http://web_fetch:3000
```

## Git 更新模式

### 自動追蹤 main

Compose 預設：

```yaml
GIT_BRANCH: "main"
GIT_COMMIT: ""
```

每次 restart 取得 `main` 最新版本。

### 固定 Commit

```bash
export WEB_FETCH_GIT_COMMIT='<commit-sha>'
docker compose -f docker-compose.part.yaml up -d --force-recreate
```

適合正式環境與 rollback。

### GitHub 暫時無法連線

預設：

```yaml
UPDATE_REQUIRED: "false"
```

Repository volume 已有版本時，Git 更新失敗會使用 cached revision 啟動。

設定為 `true` 時，更新失敗會直接終止容器。

## 環境變數

| 變數 | 預設值 | 說明 |
|---|---:|---|
| `PORT` | `3000` | HTTP listen port |
| `API_KEY` | `dummy` | Bearer API Key；`dummy` 表示停用驗證 |
| `BATCH_SIZE` | `3` | 每批同時處理的 URL 數 |
| `MAX_CHARS` | `10000` | 每筆輸出文字最大字元數 |
| `MAX_URLS` | `20` | 單一請求最大 URL 數 |
| `MAX_BODY_BYTES` | `262144` | Request body 最大 bytes |
| `MAX_PDF_BYTES` | `20971520` | PDF 最大下載 bytes |
| `GOTO_TIMEOUT` | `8000` | Playwright navigation timeout，毫秒 |
| `WAIT_TIMEOUT` | `8000` | 主要內容 selector 等待時間，毫秒 |
| `HEAD_TIMEOUT` | `5000` | HEAD 判斷 timeout，毫秒 |
| `FETCH_TIMEOUT` | `15000` | PDF/HTTP fetch timeout，毫秒 |
| `MAX_REDIRECTS` | `5` | HTTP redirect 上限 |
| `ALLOW_PRIVATE_NETWORK` | `false` | 是否允許私有網路 URL |
| `LOCALE` | `zh-TW` | Chromium locale |
| `TIMEZONE` | `Asia/Taipei` | Chromium timezone |
| `ACCEPT_LANGUAGE` | 繁中優先 | HTTP Accept-Language |
| `USER_AGENT` | Chrome 151 | Browser 與 HTTP User-Agent |

若需要擷取 Docker 內部服務、NAS 或內網網址，將：

```yaml
ALLOW_PRIVATE_NETWORK: "true"
```

此設定會降低 SSRF 防護，服務不應直接暴露至不受信任的網路。

## 本機開發

需求：Node.js 22 以上。

```bash
npm install
npx playwright install --with-deps chromium
npm test
npm run check
npm start
```

## 注意事項

- 首次建立容器需要下載 Debian 套件、npm 套件與 Chromium。
- 因為不建立自訂 image，container recreate 後仍需重新安裝 Debian 系統套件。
- `npm` 與 Chromium 下載會使用 Named Volume cache。
- Stealth plugin 只能降低部分自動化特徵，不能保證通過所有反機器人系統。
- 動態登入、Captcha、Cloudflare challenge 或需要 Cookie 的網站不保證可擷取。
