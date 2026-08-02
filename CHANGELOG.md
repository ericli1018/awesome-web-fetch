# Changelog

## 0.4.0 - 2026-08-02

- 新增遠端 MCP endpoint：`POST /mcp`。
- 採 stateless JSON response 模式，MCP 與 REST 共用同一 Node process。
- MCP 只公開 `fetch_url`，HTML、PDF 全文與 PDF 指定頁共用同一工具。
- Tool description 強制已知 URL 優先使用 MCP，並區分 `web_search` 的 URL discovery 職責。
- 新增獨立 `MCP_API_KEY`、`MCP_PATH`、`MCP_MAX_PAGES` 等設定。
- MCP 一般 URL 失敗回 `ok: false`，不誤標為 MCP Server error。
- 新增 `content_length` 與 `truncated`。
- 新增 Hermes config、SOUL URL routing 與 Nginx HTTPS reverse proxy 範例。
- Remote MCP initialize、tools/list、tools/call 完整 HTTP 流程加入測試。

## 0.3.0 - 2026-08-01

- PDF request 支援 `{ "url": "...", "pages": 3 }` 與 `pages` 陣列。
- 未指定 `pages` 時維持整份 PDF 文字抽取行為。
- 指定 `pages` 時只抽取指定頁面，頁碼採 1-based。
- PDF metadata 新增 `total_pages`、`requested_pages`、`extracted_pages`、`extraction_mode`。
- 新增 PDF 原始檔快取與 `cache_hit` metadata。
- Compose 新增 `web_fetch_pdf_cache` Named Volume。
- 新增 `PDF_CACHE_DIR` 與 `PDF_CACHE_TTL_SECONDS`。
- 頁碼超出範圍時回傳 `invalid_pages` 與 PDF 總頁數。
- `pdf-parse` 更新為 2.4.5，使用其 partial page extraction API。

## 0.2.0 - 2026-08-01

- HTML 與 PDF metadata 新增 `content_type`、`final_url`、`status_code`。
- 新增 `browser_rendered`，區分 Chromium 渲染與 direct fetch。
- 失敗結果也保留固定 metadata schema；無 HTTP 回應時 `status_code` 為 `null`。
- 保留 `type` 欄位以相容既有整合。

## 0.1.1 - 2026-08-01

- 修正 Compose bootstrap 嘗試刪除 repository volume 掛載點的錯誤。
- 改為只清除掛載點內部內容後執行 `git clone ... .`。

## 0.1.0 - 2026-08-01

- 建立 Node.js + Playwright web loader。
- 支援 HTML、JavaScript 頁面與 PDF 文字擷取。
- 支援 stealth plugin、批次抓取與內容截斷。
- 加入 Bearer API Key、request/PDF 限制與基本 SSRF 防護。
- 加入 Compose-only GitHub 自動 clone/update 部署。
- 加入 Node 內建測試與健康檢查。
