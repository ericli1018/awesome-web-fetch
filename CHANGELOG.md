# Changelog

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
