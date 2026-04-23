/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export const DEFAULT_SKILL = `轉檔：EPUB / PDF / DOCX / Facebook JSON → Obsidian Markdown
將電子書、報告、文件或社群平台匯出轉成乾淨的 Markdown。

來源格式	輸出位置	媒體位置
EPUB / PDF / DOCX	raw/books/	raw/books/assets/
Facebook JSON 匯出	raw/notes/social/facebook/	raw/notes/social/facebook/assets/

輸入要求：
1. 支援 PDF, TXT, Markdown 格式。
2. 輸出需包含 YAML Frontmatter (title, tags, date)。
3. 自動偵測標題層級，並建立雙向連結 [[Linked Concepts]]。
4. 清理 PDF 雜訊（頁碼、重複頁首）。
`;

export const DEFAULT_SYSTEM_PROMPT = `你是一個專業的 Obsidian 知識管理專家與文檔轉換代理。
你的任務是將用戶提供的各類文檔（PDF, TXT, Markdown）進行深度分析、語義重組，並轉換為最符合 Zettelkasten 筆記法的 Markdown 結構。

轉換規則：
1. 建立雙向連結：自動識別關鍵名詞並加上 [[...]]。
2. 語義修復：修復 PDF 中的斷行問題，確保語句通順。
3. 圖譜生成：在文末生成 Mermaid.js 的預覽圖譜。
4. 標籤系統：根據內容生成層級標籤（例如 #domain/subject）。

輸出語言：請根據用戶選擇的語言（繁體中文或英文）進行輸出。
`;

export const APP_DESCRIPTION_ZH = "Knowledge Agent v3.0：進階 AI 驅動的 Obsidian 知識轉換工具。將分散的文檔轉化為高度互聯的 PKM 網絡。";
export const APP_DESCRIPTION_EN = "Knowledge Agent v3.0: Advanced AI-driven Obsidian knowledge transformation tool. Turn scattered documents into highly interconnected PKM networks.";

export const FOLLOW_UP_QUESTIONS = [
  "如何進一步優化 Mermaid 圖譜的節點關聯？",
  "系統在處理加密 PDF 時的行為準則為何？",
  "是否可以自定義 YAML Frontmatter 的欄位名稱？",
  "轉換後的雙向連結是否支援雙引號標題？",
  "如何批次處理超過 50 份的文檔隊列？",
  "技能集的「WOW」功能是否可以手動關閉？",
  "PDF 頁碼清理的正規表達式是否可自訂？",
  "輸出報告的字數限制如何動態調整？",
  "系統如何處理文檔間的引用（Citations）？",
  "是否支援將轉換後的內容直接同步至雲端？",
  "知識漏洞檢測的判斷標準是什麼？",
  "如何提升代碼高亮對罕見語言的識別率？",
  "系統在處理大於 100MB 的 PDF 時的效能表現？",
  "是否支援生成相容於 Notion 的 Markdown 格式？",
  "語義圖譜是否支援 3D 可視化導出？",
  "如何利用新版技能進行自動化學習卡片製作？",
  "系統對手寫體 PDF 的識別準確度？",
  "是否可以設定多個轉換目標（Multi-Target）？",
  "轉換日誌是否包含 AI 思考過程的標記？",
  "如何擴展技能集以支援更多社群平台（如 Twitter）？"
];

export const VISUAL_EFFECTS = [
  { id: 'minimal', name: 'Minimalist White', class: 'bg-[#FDFDFB] text-zinc-900 border-zinc-200' },
  { id: 'matrix', name: 'Digital Rain', class: 'bg-black text-green-500 border-green-900 font-mono shadow-[0_0_20px_rgba(0,255,0,0.1)]' },
  { id: 'nordic', name: 'Nordic Frost', class: 'bg-slate-50 text-slate-800 border-blue-100 shadow-lg shadow-blue-50/50' },
  { id: 'cyber', name: 'Cyberpunk Neon', class: 'bg-[#0a0a0a] text-fuchsia-400 border-fuchsia-900 shadow-[0_0_30px_rgba(192,38,211,0.1)]' },
  { id: 'editorial', name: 'Modern Editorial', class: 'bg-zinc-50 text-zinc-800 border-zinc-300 font-serif shadow-xl' },
  { id: 'glass', name: 'Frosted Glass', class: 'bg-white/40 backdrop-blur-xl text-slate-900 border-white/20 shadow-2xl' }
];
