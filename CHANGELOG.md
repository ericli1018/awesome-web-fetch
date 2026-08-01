# Changelog

## 0.1.1 - 2026-08-01

- 修正 Named Volume 掛載點 `/workspace/repository` 被 `rm -rf` 刪除時產生 `Device or resource busy`。
- 初次 clone 改為只清除掛載點內部內容，並在該目錄內執行 `git clone ... .`。
- 加入 Compose bootstrap 回歸測試。

## 0.1.0 - 2026-08-01

- 建立 Node.js + Playwright web loader。
- 支援 HTML、JavaScript 頁面與 PDF 文字擷取。
- 支援 stealth plugin、批次抓取與內容截斷。
- 加入 Bearer API Key、request/PDF 限制與基本 SSRF 防護。
- 加入 Compose-only GitHub 自動 clone/update 部署。
- 加入 Node 內建測試與健康檢查。
