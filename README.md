# web_fetch

以 Node.js、Playwright 與 Chromium 實作的外部網頁/PDF 擷取服務，同時提供 REST Sidecar API 與遠端 MCP endpoint，可供 OpenWebUI、Hermes Agent 或其他 Agent 使用。

GitHub repository：`https://github.com/ericli1018/awesome-web-fetch`

## v0.4.0 功能

- REST 批次抓取 API。
- Remote MCP：`POST /mcp`。
- MCP 僅公開一個 `fetch_url` 工具，避免與 HTML/PDF 工具互相重疊。
- 使用 Playwright Chromium 載入 JavaScript 網頁。
- 使用 stealth plugin 降低基本自動化特徵。
- 自動辨識並解析 PDF。
- PDF 未指定頁碼時抽取整份文件。
- PDF 指定 `pages` 時只抽取指定頁面。
- PDF 原始檔使用 Named Volume 快取。
- 回傳 `final_url`、`content_type`、`status_code`、PDF 頁數與快取狀態。
- 回傳 `content_length` 與 `truncated`，讓 Agent 知道輸出是否被 `MAX_CHARS` 截斷。
- REST 與 MCP 可使用不同 Bearer API Key。
- 預設阻擋 localhost、私有 IP、link-local 與 metadata 類型目標。
- Docker Compose 每次啟動自動同步 GitHub、安裝 npm 套件並確認 Chromium。
- 不需要 Dockerfile，也不建立自訂 Docker image。

## 專案結構

```text
web_fetch/
├── index.mjs
├── src/
│   ├── config.mjs
│   ├── content.mjs
│   ├── http-server.mjs
│   ├── loader.mjs
│   ├── mcp-protocol.mjs
│   ├── metadata.mjs
│   ├── pdf-cache.mjs
│   ├── pdf-extractor.mjs
│   └── url-policy.mjs
├── test/
├── package.json
├── docker-compose.part.yaml
├── hermes.config.example.yaml
├── SOUL.url-routing.example.md
├── nginx.mcp.example.conf
├── .env.example
├── CHANGELOG.md
└── LICENSE
```

## 上傳至 GitHub

```bash
git init
git add .
git commit -m "feat: release web_fetch v0.4.0"
git branch -M main
git remote add origin https://github.com/ericli1018/awesome-web-fetch.git
git push -u origin main
```

## Docker Compose

`docker-compose.part.yaml` 直接使用：

```yaml
image: node:24-bookworm-slim
```

啟動：

```bash
cp .env.example .env
# 修改兩組 API Key
docker compose -f docker-compose.part.yaml up -d
```

重新啟動時會同步 GitHub 最新版本：

```bash
docker compose -f docker-compose.part.yaml restart web_fetch
```

每次容器啟動會：

1. 安裝 Git 與 CA certificates。
2. 初次執行時 clone repository。
3. 後續執行時 fetch 並 reset 到 `origin/main`。
4. 執行 `npm install --omit=dev`。
5. 執行 `playwright install --with-deps chromium`。
6. 執行測試前語法檢查。
7. 啟動 `node index.mjs`。

Named Volume 保存：

- Git repository。
- npm cache。
- Chromium cache。
- PDF cache。

## 必要環境變數

`.env`：

```dotenv
WEB_FETCH_API_KEY=replace-with-a-long-rest-key
WEB_FETCH_MCP_API_KEY=replace-with-a-different-long-mcp-key
WEB_FETCH_GIT_COMMIT=
```

正式環境不可使用 `dummy`。REST 與 MCP 建議使用不同金鑰。

## 健康檢查

```bash
curl http://localhost:3005/healthz
```

回應會包含：

```json
{
  "status": "ok",
  "mcp_enabled": true,
  "mcp_path": "/mcp"
}
```

## REST API

### 一般網頁或整份 PDF

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

### 指定 PDF 頁碼

REST API 為了向後相容，可接受單一頁碼或頁碼陣列：

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

## Remote MCP

### Endpoint

```text
POST /mcp
```

這是無 session 的 JSON response 模式；不需要額外 MCP container，也不需要 MCP npm SDK。MCP endpoint 與 REST API 共用同一個 Node process 和 Chromium/PDF cache。

### Authentication

```http
Authorization: Bearer <MCP_API_KEY>
```

MCP 與 REST 分別使用：

```text
API_KEY
MCP_API_KEY
```

### MCP Tool

```text
name: fetch_url
title: Primary URL Reader for Web Pages and PDFs
```

工具規則：

- 已知 HTTP/HTTPS URL：使用 `fetch_url`。
- HTML：不帶 `pages`。
- PDF 全文：不帶 `pages`。
- PDF 指定頁：帶 `pages: [2, 5]`。
- MCP 的 `pages` 僅接受正整數陣列，最多 50 頁。
- `web_search` 只負責找 URL，不負責讀取 URL。

### MCP 手動初始化測試

```bash
curl https://web-fetch.example.com/mcp \
  -H "Authorization: Bearer ${WEB_FETCH_MCP_API_KEY}" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "initialize",
    "params": {
      "protocolVersion": "2025-06-18",
      "capabilities": {},
      "clientInfo": {
        "name": "manual-test",
        "version": "1.0.0"
      }
    }
  }'
```

### 列出工具

```bash
curl https://web-fetch.example.com/mcp \
  -H "Authorization: Bearer ${WEB_FETCH_MCP_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/list",
    "params": {}
  }'
```

### 呼叫 HTML/PDF 全文

```bash
curl https://web-fetch.example.com/mcp \
  -H "Authorization: Bearer ${WEB_FETCH_MCP_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 3,
    "method": "tools/call",
    "params": {
      "name": "fetch_url",
      "arguments": {
        "url": "https://example.com/manual.pdf"
      }
    }
  }'
```

### 呼叫 PDF 指定頁面

```json
{
  "jsonrpc": "2.0",
  "id": 4,
  "method": "tools/call",
  "params": {
    "name": "fetch_url",
    "arguments": {
      "url": "https://example.com/manual.pdf",
      "pages": [2, 5]
    }
  }
}
```

### MCP 回應

`content` 放 Agent 要閱讀的 metadata 與正文；`structuredContent` 不重複正文：

```json
{
  "content": [
    {
      "type": "text",
      "text": "WEB_FETCH_RESULT\nok: true\n...\n--- CONTENT ---\nExtracted text"
    }
  ],
  "structuredContent": {
    "ok": true,
    "metadata": {
      "source": "https://example.com/manual.pdf",
      "final_url": "https://cdn.example.com/manual.pdf",
      "content_type": "application/pdf",
      "status_code": 200,
      "total_pages": 20,
      "requested_pages": [2, 5],
      "extracted_pages": [2, 5],
      "cache_hit": true
    },
    "content_length": 8421,
    "truncated": false
  },
  "isError": false
}
```

一般 URL、HTTP、PDF 頁碼或解析失敗會回 `structuredContent.ok: false`，但不會設成 MCP Server error；只有 MCP/loader 內部異常才會回 `isError: true`。

## Hermes Agent

將 `hermes.config.example.yaml` 內容合併到 Hermes 主機的設定，修改：

```yaml
url: "https://web-fetch.example.com/mcp"
Authorization: "Bearer REPLACE_WITH_WEB_FETCH_MCP_API_KEY"
```

初期建議：

```yaml
supports_parallel_tool_calls: false
```

並將 `SOUL.url-routing.example.md` 的規則加入 Hermes 的 SOUL/System Prompt。

最終工具路由應為：

```text
沒有 URL → web_search → 找到 URL → MCP fetch_url
已有 URL → MCP fetch_url
```

停用與 MCP 重疊的內建工具：

```text
web_extract
browser_navigate
其他 browser_* URL 讀取工具
```

## HTTPS Reverse Proxy

Hermes 與 web_fetch 位於不同機器時，MCP endpoint 應透過 HTTPS 暴露，不要直接公開容器 port。

專案提供：

```text
nginx.mcp.example.conf
```

範例只公開：

```text
/mcp
/healthz
```

REST batch endpoint 預設回 404，避免不必要的公開面。

## 回應欄位

REST 所有結果：

- `page_content`
- `content_length`
- `truncated`
- `metadata.source`
- `metadata.final_url`
- `metadata.title`
- `metadata.content_type`
- `metadata.status_code`
- `metadata.browser_rendered`
- `metadata.type`
- `metadata.error`：失敗時提供

PDF 額外 metadata：

- `total_pages`
- `requested_pages`
- `extracted_pages`
- `extraction_mode`
- `cache_hit`
- `invalid_pages`

## 環境變數

| 變數 | 預設值 | 說明 |
|---|---:|---|
| `PORT` | `3000` | HTTP listen port |
| `API_KEY` | `dummy` | REST Bearer Key；`dummy` 停用驗證 |
| `MCP_ENABLED` | `true` | 是否啟用 Remote MCP |
| `MCP_PATH` | `/mcp` | MCP endpoint path |
| `MCP_API_KEY` | `API_KEY` | MCP Bearer Key；Compose 範例獨立設定 |
| `MCP_MAX_PAGES` | `50` | MCP 單次指定最大 PDF 頁數 |
| `MCP_SERVER_NAME` | `awesome-web-fetch` | MCP server name |
| `MCP_SERVER_VERSION` | `0.4.0` | MCP server version |
| `BATCH_SIZE` | `3` | REST 每批同時處理 URL 數 |
| `MAX_CHARS` | `10000` | 每筆輸出文字最大字元數 |
| `MAX_URLS` | `20` | REST 單一請求最大 URL 數 |
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
| `USER_AGENT` | 空字串 | 空值時使用 Chromium 實際 User-Agent |

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
- 不建立自訂 image，因此 container recreate 後需重新安裝 Debian 系統套件。
- PDF 快取會占用 Docker volume 空間。
- 掃描型 PDF 沒有文字層時不會自動 OCR。
- Stealth plugin 不能保證通過所有反機器人系統。
- 動態登入、Captcha、Cloudflare challenge 或需要 Cookie 的網站不保證可擷取。
- `MCP_API_KEY=dummy` 會停用 MCP 認證，禁止用於公開網路。
