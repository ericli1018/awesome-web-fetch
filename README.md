# web_fetch

以 Node.js、Playwright 與 Chromium 實作的外部網頁/PDF 擷取服務，可作為 OpenWebUI External Web Loader 或 Sidecar 使用。

GitHub repository：`https://github.com/ericli1018/awesome-web-fetch`

## 功能

- 批次接收多個 URL。
- 使用 Playwright Chromium 載入 JavaScript 網頁。
- 使用 stealth plugin 降低基本自動化特徵。
- 自動辨識並解析 PDF。
- PDF 未指定頁碼時抽取整份文件。
- PDF 指定 `pages` 時只抽取指定頁面。
- PDF 原始檔使用 Named Volume 暫存，後續指定頁碼查詢不必重新下載。
- PDF metadata 提供總頁數、請求頁碼、實際抽取頁碼與 cache hit 狀態。
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
│   ├── metadata.mjs
│   ├── pdf-cache.mjs
│   ├── pdf-extractor.mjs
│   └── url-policy.mjs
├── test/
├── package.json
├── docker-compose.part.yaml
├── .env.example
├── .gitignore
├── CHANGELOG.md
└── LICENSE
```

## 上傳至 GitHub

```bash
git init
git add .
git commit -m "feat: release web_fetch v0.3.0"
git branch -M main
git remote add origin https://github.com/ericli1018/awesome-web-fetch.git
git push -u origin main
```

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

每次容器啟動會：

1. 安裝 Git 與 CA certificates。
2. 初次執行時 clone repository。
3. 後續執行時 fetch 並 reset 到 `origin/main`。
4. 執行 `npm install --omit=dev`。
5. 執行 `playwright install --with-deps chromium`。
6. 執行語法檢查。
7. 啟動 `node index.mjs`。

以下內容使用 Named Volume 保存：

- Git repository。
- npm cache。
- Chromium cache。
- PDF cache。

## API Key

```bash
export WEB_FETCH_API_KEY='replace-with-a-long-random-key'
```

或建立 `.env`：

```dotenv
WEB_FETCH_API_KEY=replace-with-a-long-random-key
WEB_FETCH_GIT_COMMIT=
```

若未設定，Compose 使用 `dummy`，此時 API 驗證會停用。正式環境不可使用 `dummy`。

## API

### 健康檢查

```bash
curl http://localhost:3005/healthz
```

### 一般網頁或整份 PDF

URL 使用字串時，PDF 維持原本行為：抽取整份文件後依 `MAX_CHARS` 截斷。

```bash
curl http://localhost:3005/ \
  -H "Authorization: Bearer ${WEB_FETCH_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "urls": [
      "https://example.com",
      "https://example.com/manual.pdf"
    ]
  }'
```

也可以使用物件但不提供 `pages`：

```json
{
  "urls": [
    {
      "url": "https://example.com/manual.pdf"
    }
  ]
}
```

### 指定 PDF 頁碼

`pages` 可使用單一正整數：

```json
{
  "urls": [
    {
      "url": "https://example.com/manual.pdf",
      "pages": 3
    }
  ]
}
```

或正整數陣列：

```json
{
  "urls": [
    {
      "url": "https://example.com/manual.pdf",
      "pages": [2, 5, 8]
    }
  ]
}
```

頁碼從 `1` 開始。重複頁碼會自動移除並保留首次出現順序。

### HTML 回應

```json
{
  "page_content": "...",
  "metadata": {
    "source": "https://example.com",
    "final_url": "https://example.com/",
    "title": "Example Domain",
    "content_type": "text/html",
    "status_code": 200,
    "browser_rendered": true,
    "type": "html"
  }
}
```

### 整份 PDF 回應

```json
{
  "page_content": "...",
  "metadata": {
    "source": "https://example.com/manual.pdf",
    "final_url": "https://cdn.example.com/manual.pdf",
    "title": "PDF (20 pages)",
    "content_type": "application/pdf",
    "status_code": 200,
    "browser_rendered": false,
    "type": "pdf",
    "total_pages": 20,
    "requested_pages": null,
    "extracted_pages": "all",
    "extraction_mode": "full_document",
    "cache_hit": false
  }
}
```

### 指定頁碼 PDF 回應

```json
{
  "page_content": "...",
  "metadata": {
    "source": "https://example.com/manual.pdf",
    "final_url": "https://cdn.example.com/manual.pdf",
    "title": "PDF (20 pages)",
    "content_type": "application/pdf",
    "status_code": 200,
    "browser_rendered": false,
    "type": "pdf",
    "total_pages": 20,
    "requested_pages": [2, 5],
    "extracted_pages": [2, 5],
    "extraction_mode": "selected_pages",
    "cache_hit": true
  }
}
```

### 頁碼超出範圍

HTTP request 仍回傳批次結果，該 URL 的 `page_content` 為空，metadata 提供錯誤與頁碼資訊：

```json
{
  "page_content": "",
  "metadata": {
    "source": "https://example.com/manual.pdf",
    "final_url": "https://example.com/manual.pdf",
    "content_type": "application/pdf",
    "status_code": 200,
    "browser_rendered": false,
    "type": "pdf",
    "error": "PDF error: Requested page 30 is out of range; PDF has 20 pages",
    "total_pages": 20,
    "requested_pages": [30],
    "extracted_pages": [],
    "invalid_pages": [30],
    "extraction_mode": "selected_pages",
    "cache_hit": true
  }
}
```

## PDF 快取

PDF 下載成功後會保存：

```text
/data/pdf-cache/<URL SHA-256>.pdf
/data/pdf-cache/<URL SHA-256>.json
```

JSON metadata 包含：

- 原始 URL。
- 最終 URL。
- Content-Type。
- HTTP status code。
- ETag。
- Last-Modified。
- cache 時間。
- PDF 檔案大小。

Compose 使用：

```yaml
volumes:
  - web_fetch_pdf_cache:/data/pdf-cache
```

預設快取有效時間：

```yaml
PDF_CACHE_TTL_SECONDS: "86400"
```

相同 URL 在 TTL 內再次查詢會直接讀取快取。變更 `pages` 不會重新下載 PDF。

手動清除 PDF 快取：

```bash
docker volume rm web_fetch_pdf_cache
```

實際 volume 名稱可能包含 Compose project prefix，可先執行：

```bash
docker volume ls | grep web_fetch_pdf_cache
```

## Metadata 欄位

所有結果：

- `source`：原始請求 URL。
- `final_url`：完成重新導向後的最終 URL。
- `title`：頁面標題或 PDF 頁數說明。
- `content_type`：HTTP Content-Type media type。
- `status_code`：最終 HTTP 狀態碼；尚未取得 HTTP 回應時為 `null`。
- `browser_rendered`：HTML 經 Chromium 渲染時為 `true`；PDF/direct fetch 為 `false`。
- `type`：`html` 或 `pdf`。
- `error`：失敗時提供錯誤訊息。

PDF 額外提供：

- `total_pages`：PDF 總頁數。
- `requested_pages`：使用者指定頁碼；未指定時為 `null`。
- `extracted_pages`：指定頁碼陣列，或整份抽取時的 `all`。
- `extraction_mode`：`full_document` 或 `selected_pages`。
- `cache_hit`：是否直接使用既有 PDF 快取。
- `invalid_pages`：指定頁碼超出範圍時提供。

OpenWebUI 與本服務使用同一 Docker network 時，服務網址為：

```text
http://web_fetch:3000
```

## Git 更新模式

### 自動追蹤 main

```yaml
GIT_BRANCH: "main"
GIT_COMMIT: ""
```

### 固定 Commit

```bash
export WEB_FETCH_GIT_COMMIT='<commit-sha>'
docker compose -f docker-compose.part.yaml up -d --force-recreate
```

### GitHub 暫時無法連線

預設：

```yaml
UPDATE_REQUIRED: "false"
```

Repository volume 已有版本時，Git 更新失敗會使用 cached revision 啟動。

## 環境變數

| 變數 | 預設值 | 說明 |
|---|---:|---|
| `PORT` | `3000` | HTTP listen port |
| `API_KEY` | `dummy` | Bearer API Key；`dummy` 表示停用驗證 |
| `BATCH_SIZE` | `3` | 每批同時處理 URL 數 |
| `MAX_CHARS` | `10000` | 每筆輸出文字最大字元數 |
| `MAX_URLS` | `20` | 單一請求最大 URL 數 |
| `MAX_BODY_BYTES` | `262144` | Request body 最大 bytes |
| `MAX_PDF_BYTES` | `20971520` | 單一 PDF 最大下載 bytes |
| `PDF_CACHE_DIR` | `/data/pdf-cache` | PDF 快取目錄 |
| `PDF_CACHE_TTL_SECONDS` | `86400` | PDF 快取有效秒數 |
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
- PDF 快取會占用 Docker volume 空間；應依實際使用量定期清理。
- 掃描型 PDF 沒有文字層時不會自動 OCR。
- Stealth plugin 不能保證通過所有反機器人系統。
- 動態登入、Captcha、Cloudflare challenge 或需要 Cookie 的網站不保證可擷取。
