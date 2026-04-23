/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
  Upload, 
  FileText, 
  Settings, 
  Sparkles, 
  Play, 
  Square, 
  Trash2, 
  Languages, 
  Activity, 
  CheckCircle2,
  ChevronRight,
  Download,
  AlertCircle,
  Copy,
  FileType,
  Scissors,
  Eye,
  RefreshCw
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { streamGemini, getGeminiResponse } from './lib/gemini';
import { 
  DEFAULT_SKILL, 
  DEFAULT_SYSTEM_PROMPT, 
  APP_DESCRIPTION_ZH, 
  APP_DESCRIPTION_EN, 
  VISUAL_EFFECTS, 
  FOLLOW_UP_QUESTIONS 
} from './lib/constants';
import { PDFDocument } from 'pdf-lib';

interface FileItem {
  id: string;
  name: string;
  type: string;
  content?: string;
  base64?: string;
  size: number;
}

interface TelemetryLog {
  id: string;
  time: string;
  message: string;
  status: 'info' | 'success' | 'warning' | 'error';
}

export default function App() {
  // State
  const [lang, setLang] = useState<'zh' | 'en'>('zh');
  const [skillContent, setSkillContent] = useState(DEFAULT_SKILL);
  const [files, setFiles] = useState<FileItem[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [telemetry, setTelemetry] = useState<TelemetryLog[]>([]);
  const [activeStep, setActiveStep] = useState<number>(0);
  
  // Results
  const [step1Result, setStep1Result] = useState('');
  const [step2Result, setStep2Result] = useState('');
  const [step3Result, setStep3Result] = useState('');
  const [step4Result, setStep4Result] = useState('');

  const [pastedText, setPastedText] = useState('');
  const [showSkillEditor, setShowSkillEditor] = useState(false);
  const [model, setModel] = useState('gemini-3-flash-preview');
  const [systemPrompt, setSystemPrompt] = useState(DEFAULT_SYSTEM_PROMPT);
  const [currentVisualEffect, setCurrentVisualEffect] = useState(VISUAL_EFFECTS[0].id);

  const [trimmingFileId, setTrimmingFileId] = useState<string | null>(null);
  const [trimRange, setTrimRange] = useState({ start: 1, end: 1 });

  const abortControllerRef = useRef<AbortController | null>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);

  // Helper: Log message
  const log = useCallback((message: string, status: TelemetryLog['status'] = 'info') => {
    setTelemetry(prev => [...prev, {
      id: Math.random().toString(36).substr(2, 9),
      time: new Date().toLocaleTimeString(),
      message,
      status
    }].slice(-50));
  }, []);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [telemetry]);

  // File Handlers
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFiles = e.target.files;
    if (!uploadedFiles) return;

    const filesArray = Array.from(uploadedFiles) as File[];
    for (const file of filesArray) {
      const id = Math.random().toString(36).substr(2, 9);
      log(`正在讀取檔案: ${file.name}`, 'info');

      if (file.type === 'application/pdf') {
        const reader = new FileReader();
        reader.onload = async (ev) => {
          const base64 = (ev.target?.result as string).split(',')[1];
          setFiles(prev => [...prev, { id, name: file.name, type: 'pdf', base64, size: file.size }]);
          log(`PDF 讀取完成: ${file.name}`, 'success');
        };
        reader.readAsDataURL(file);
      } else {
        const text = await file.text();
        setFiles(prev => [...prev, { id, name: file.name, type: file.type || 'text/plain', content: text, size: file.size }]);
        log(`文件讀取完成: ${file.name}`, 'success');
      }
    }
  };

  const handlePasteAdd = () => {
    if (!pastedText.trim()) return;
    const id = Math.random().toString(36).substr(2, 9);
    const size = new Blob([pastedText]).size;
    setFiles(prev => [...prev, { id, name: `Paste_${id}.txt`, type: 'text/markdown', content: pastedText, size }]);
    setPastedText('');
    log(`已加入貼上內容`, 'success');
  };

  const removeFile = (id: string) => {
    setFiles(prev => prev.filter(f => f.id !== id));
  };

  const handleTrimPdf = async (fileId: string, start: number, end: number) => {
    const fileItem = files.find(f => f.id === fileId);
    if (!fileItem || !fileItem.base64) return;

    log(`正在裁剪 PDF: ${fileItem.name} 頁碼 ${start}-${end}`, 'info');
    try {
      const existingPdfBytes = Uint8Array.from(atob(fileItem.base64), c => c.charCodeAt(0));
      const pdfDoc = await PDFDocument.load(existingPdfBytes);
      const newPdfDoc = await PDFDocument.create();
      
      const pageCount = pdfDoc.getPageCount();
      const actualStart = Math.max(1, Math.min(start, pageCount)) - 1;
      const actualEnd = Math.max(1, Math.min(end, pageCount)) - 1;

      if (actualStart > actualEnd) {
        log('無效的頁碼範圍', 'error');
        return;
      }

      const pagesToCopy = Array.from({ length: actualEnd - actualStart + 1 }, (_, i) => actualStart + i);
      const copiedPages = await newPdfDoc.copyPages(pdfDoc, pagesToCopy);
      copiedPages.forEach((page) => newPdfDoc.addPage(page));

      const pdfBytes = await newPdfDoc.save();
      const base64 = btoa(String.fromCharCode(...pdfBytes));
      
      const trimmedBlob = new Blob([pdfBytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(trimmedBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `trimmed_${fileItem.name}`;
      link.click();
      URL.revokeObjectURL(url);

      setFiles(prev => prev.map(f => f.id === fileId ? { ...f, base64, size: pdfBytes.length } : f));
      log(`PDF 裁剪成功並已下載`, 'success');
      setTrimmingFileId(null);
    } catch (err) {
      log(`裁剪失敗: ${err instanceof Error ? err.message : String(err)}`, 'error');
    }
  };

  // Execution Logic
  const startWorkflow = async () => {
    if (files.length === 0) {
      log('請至少提供一個文件', 'error');
      return;
    }

    setIsGenerating(true);
    setActiveStep(1);
    setStep1Result('');
    setStep2Result('');
    setStep3Result('');
    setStep4Result('');
    
    // Select visual effect randomly for start or just keep current
    // setCurrentVisualEffect(VISUAL_EFFECTS[Math.floor(Math.random() * VISUAL_EFFECTS.length)].id);

    abortControllerRef.current = new AbortController();

    try {
      // --- STEP 1: Process Documents with Original Skill ---
      log('Step 1: 正在執行原始技能轉換文檔...', 'info');
      const parts = files.map(f => {
        if (f.type === 'pdf' && f.base64) {
          return { inlineData: { mimeType: 'application/pdf', data: f.base64 } };
        }
        return { text: `### 檔案: ${f.name}\n${f.content || ''}` };
      });

      const step1Prompt = `${systemPrompt}\n\n請使用以下技能（skill.md）內容，將提供的文檔轉換為高品質的 Markdown 報告。\n輸出要求：2000 到 3000 字，結構分明，適合 Obsidian。\n語言：${lang === 'zh' ? '繁體中文' : 'English'}。\n\n技能集:\n${skillContent}`;

      await streamGemini({
        model: model,
        systemInstruction: systemPrompt,
        parts: [...parts, { text: `使用此技能集執行任務:\n${skillContent}` }],
        signal: abortControllerRef.current.signal
      }, {
        onChunk: (text) => setStep1Result(prev => prev + text),
        onFinish: () => log('Step 1 完成', 'success')
      });

      // --- STEP 2: Improve Skill ---
      setActiveStep(2);
      log('Step 2: 正在優化技能並加入 3 個亮點功能...', 'info');
      const step2Prompt = `你是一個高級 AI 系統架構師與知識管理專家。請將以下舊有的技能（skill.md）升級為「進階版」。
你需要為這份技能加入至少 3 個令人驚豔的「WOW」AI 增強功能。
建議功能方向：
1. 語義自動關聯 (Semantic Graph Mapping)：自動在 Obsidian 中生成 Mermaid.js 知識圖譜。
2. 跨文檔衝突檢測 (Cross-Document Conflict Detection)：自動識別不同文案間的邏輯矛盾。
3. 知識內聚摘要 (Contextual Flashcard Generation)：自動提取關鍵概念並生成 Anki 格式的問答。
請直接輸出完整優化後的 skill.md 全文（Markdown 格式），並在文件開頭列出這三個新增功能。
語言：${lang === 'zh' ? '繁體中文' : 'English'}。`;

      const improvedSkill = await getGeminiResponse({
        model: model,
        systemInstruction: step2Prompt,
        parts: [{ text: skillContent }]
      });
      setStep2Result(improvedSkill || '');
      log('Step 2 完成：技能已升級', 'success');

      // --- STEP 3: Create 3 Use Cases ---
      setActiveStep(3);
      log('Step 3: 針對新技能生成 3 個應用案例...', 'info');
      const step3Prompt = `請根據以下這份優化的技能（skill.md），生成 3 個具體的深度應用案例（Use Cases）。
每個案例應詳細描述：
- 執行場景 (Scenario)
- 技術挑戰 (Challenges)
- 新版技能的 WOW 功能如何具體解決問題 (Solution with WOW features)
語言：${lang === 'zh' ? '繁體中文' : 'English'}。`;

      const useCases = await getGeminiResponse({
        model: model,
        systemInstruction: step3Prompt,
        parts: [{ text: improvedSkill || '' }]
      });
      setStep3Result(useCases || '');
      log('Step 3 完成：案例已生成', 'success');

      // --- STEP 4: Comprehensive Summary of Use Cases ---
      setActiveStep(4);
      log('Step 4: 正在根據新技能與案例生成 3000-4000 字的年度級度總結報告...', 'info');
      const step4Prompt = `你是一個具備極致洞察力的知識架構師。請根據「優化後的技能」以及「3 個應用案例」，撰寫一份極其詳盡、具備未來感且專業的整合分析報告。
報告要求：
1. 長度：3000 到 4000 字。
2. 結尾請附上這 20 個追蹤問題，以促進深度思考：
${FOLLOW_UP_QUESTIONS.map((q, i) => `${i+1}. ${q}`).join('\n')}
3. 結構：
   - 摘要 (Executive Summary)
   - 技能升級解析
   - 案例深度驗證
   - 未來展望
   - 深度思考延伸 (20 Questions)
語言：${lang === 'zh' ? '繁體中文' : 'English'}。`;

      await streamGemini({
        model: model,
        systemInstruction: step4Prompt,
        parts: [{ text: `新技能:\n${improvedSkill}\n\n應用案例:\n${useCases}` }],
        signal: abortControllerRef.current.signal
      }, {
        onChunk: (text) => setStep4Result(prev => prev + text),
        onFinish: () => {
          log('全體任務完成', 'success');
          // Automatically pick a WOW visual effect on completion if not manual
          setCurrentVisualEffect(VISUAL_EFFECTS[Math.floor(Math.random() * VISUAL_EFFECTS.length)].id);
        }
      });

    } catch (err) {
      log(`錯誤: ${err instanceof Error ? err.message : String(err)}`, 'error');
    } finally {
      setIsGenerating(false);
      setActiveStep(5); // Completion state
    }
  };

  const stopGeneration = () => {
    abortControllerRef.current?.abort();
    setIsGenerating(false);
    log('用戶已手續中止生成', 'warning');
  };

  const clearAll = () => {
    setFiles([]);
    setStep1Result('');
    setStep2Result('');
    setStep3Result('');
    setStep4Result('');
    setTelemetry([]);
    setActiveStep(0);
  };

  // UI Templates
      const currentEffect = VISUAL_EFFECTS.find(e => e.id === currentVisualEffect) || VISUAL_EFFECTS[0];

      return (
        <div className={`min-h-screen transition-all duration-700 font-sans selection:bg-blue-100 ${currentEffect.class}`}>
          {/* Header */}
          <header className={`fixed top-0 w-full h-16 border-b z-50 flex items-center justify-between px-8 backdrop-blur-md ${currentEffect.id === 'matrix' ? 'bg-black/90 border-green-900' : 'bg-white/80 border-slate-200 shadow-sm'}`}>
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shadow-lg ${currentEffect.id === 'matrix' ? 'bg-green-600 shadow-green-900/40' : 'bg-blue-600 shadow-blue-200'}`}>
                <Activity className="text-white w-6 h-6" />
              </div>
              <div>
                <h1 className={`font-bold text-xl tracking-tight ${currentEffect.id === 'matrix' ? 'text-green-400' : 'text-slate-900'}`}>Knowledge Agent <span className="opacity-70 text-sm">v3.0</span></h1>
                <p className="text-[10px] uppercase tracking-widest font-semibold opacity-50">Advanced Information Synthesizer</p>
              </div>
            </div>
            
            <div className="flex items-center gap-4">
              <div className="flex items-center bg-black/5 p-1 rounded-lg">
                {VISUAL_EFFECTS.map(effect => (
                  <button 
                    key={effect.id}
                    onClick={() => setCurrentVisualEffect(effect.id)}
                    className={`px-3 py-1 text-[10px] font-bold rounded-md transition-all ${currentVisualEffect === effect.id ? 'bg-white shadow-sm text-slate-900' : 'opacity-40 hover:opacity-70'}`}
                  >
                    {effect.name.split(' ')[0]}
                  </button>
                ))}
              </div>
              <button 
                onClick={() => setLang(l => l === 'zh' ? 'en' : 'zh')}
                className="flex items-center gap-2 px-4 py-2 border rounded-lg transition-colors text-sm font-medium opacity-80 hover:opacity-100"
              >
                <Languages size={16} />
                {lang === 'zh' ? '繁體中文' : 'English'}
              </button>
              <button 
                onClick={() => setShowSkillEditor(!showSkillEditor)}
                className={`p-2 rounded-lg transition-all ${showSkillEditor ? 'bg-blue-50 text-blue-600 border border-blue-100' : 'opacity-80 hover:opacity-100'}`}
                title="Config"
              >
                <Settings size={20} />
              </button>
            </div>
          </header>

      <main className="pt-24 pb-12 px-8 flex gap-8">
        {/* Left Sidebar: Controls & Input */}
        <aside className="w-80 flex-shrink-0 flex flex-col gap-6">
          <section className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400 mb-4 flex items-center gap-2">
              <Upload size={14} /> 資料攝取
            </h2>
            
            <div className="space-y-4">
              <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-slate-200 rounded-xl hover:border-blue-400 hover:bg-blue-50 transition-all cursor-pointer group">
                <div className="flex flex-col items-center justify-center pt-5 pb-6">
                  <Upload className="w-8 h-8 text-slate-300 group-hover:text-blue-500 mb-2 transition-colors" />
                  <p className="text-xs text-slate-500 font-medium">{lang === 'zh' ? '點擊或拖放檔案' : 'Click or Drag Files'}</p>
                  <p className="text-[10px] opacity-60 mt-1">PDF, TXT, MD</p>
                </div>
                <input type="file" className="hidden" multiple onChange={handleFileUpload} />
              </label>

              <div className="bg-slate-500/5 p-4 rounded-xl border border-slate-500/10">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-bold uppercase opacity-50">Quick Paste Zone</span>
                  <RefreshCw size={10} className="opacity-30 cursor-pointer hover:rotate-180 transition-transform" onClick={() => setPastedText('')} />
                </div>
                <textarea 
                  value={pastedText}
                  onChange={(e) => setPastedText(e.target.value)}
                  placeholder={lang === 'zh' ? '在此貼上大量文本...' : 'Paste large text blocks here...'}
                  className="w-full h-32 p-3 bg-transparent text-sm focus:outline-none transition-all resize-none font-mono"
                />
                <button 
                  onClick={handlePasteAdd}
                  className="w-full mt-2 py-2 bg-slate-900 text-white rounded-lg text-xs font-bold hover:bg-black transition-all flex items-center justify-center gap-2"
                >
                  <Copy size={12} /> {lang === 'zh' ? '匯入文本' : 'Import Text'}
                </button>
              </div>
            </div>
          </section>

          {/* Processing Queue */}
          <section className="flex-1 min-h-[300px] bg-white rounded-2xl border border-slate-200 p-6 shadow-sm overflow-hidden flex flex-col">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400 mb-4 flex items-center justify-between">
              <span className="flex items-center gap-2"><FileType size={14} /> 處理隊列</span>
              <span className="text-[10px] bg-slate-100 px-2 py-0.5 rounded-full">{files.length} 檔案</span>
            </h2>
            <div className="flex-1 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
              {files.map(file => (
                <motion.div 
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  key={file.id} 
                  className="group flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100 hover:border-blue-200 hover:bg-blue-50 transition-all"
                >
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${file.type === 'pdf' ? 'bg-red-50 text-red-500' : 'bg-blue-50 text-blue-500'}`}>
                    <FileText size={16} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold truncate">{file.name}</p>
                    <p className="text-[10px] opacity-50">{(file.size / 1024).toFixed(1)} KB</p>
                  </div>
                  <div className="flex gap-1">
                    {file.type === 'pdf' && (
                      <button 
                        onClick={() => setTrimmingFileId(file.id)}
                        className="p-1.5 opacity-40 hover:opacity-100 text-blue-500 transition-all"
                        title="Trim PDF"
                      >
                        <Scissors size={14} />
                      </button>
                    )}
                    <button onClick={() => removeFile(file.id)} className="opacity-0 group-hover:opacity-100 p-1.5 text-slate-400 hover:text-red-500 transition-all">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </motion.div>
              ))}
              
              <AnimatePresence>
                {trimmingFileId && (
                  <motion.div 
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="p-4 bg-blue-50 border border-blue-100 rounded-xl space-y-3"
                  >
                    <div className="flex items-center gap-2 text-[10px] font-bold text-blue-600 uppercase">
                      <Scissors size={10} /> 裁剪 PDF 範圍
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <input 
                        type="number" 
                        min="1" 
                        placeholder="Start"
                        value={trimRange.start}
                        onChange={(e) => setTrimRange(prev => ({ ...prev, start: parseInt(e.target.value) || 1 }))}
                        className="p-1.5 bg-white border border-blue-200 rounded text-xs"
                      />
                      <input 
                        type="number" 
                        min="1" 
                        placeholder="End"
                        value={trimRange.end}
                        onChange={(e) => setTrimRange(prev => ({ ...prev, end: parseInt(e.target.value) || 1 }))}
                        className="p-1.5 bg-white border border-blue-200 rounded text-xs"
                      />
                    </div>
                    <div className="flex gap-2">
                      <button 
                        onClick={() => handleTrimPdf(trimmingFileId, trimRange.start, trimRange.end)}
                        className="flex-1 py-1.5 bg-blue-600 text-white text-[10px] font-bold rounded"
                      >
                        裁剪並下載
                      </button>
                      <button 
                        onClick={() => setTrimmingFileId(null)}
                        className="px-3 py-1.5 bg-slate-200 text-slate-600 text-[10px] font-bold rounded"
                      >
                        取消
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
              {files.length === 0 && (
                <div className="h-full flex flex-col items-center justify-center text-slate-400 opacity-40 py-12">
                  <Activity size={32} strokeWidth={1} />
                  <p className="text-[10px] font-bold uppercase mt-2">{lang === 'zh' ? '隊列為空' : 'Queue Empty'}</p>
                </div>
              )}
            </div>

            <div className="mt-6 space-y-3">
              {!isGenerating ? (
                <button 
                  onClick={startWorkflow}
                  disabled={files.length === 0}
                  className={`w-full py-3 rounded-xl flex items-center justify-center gap-2 font-bold transition-all shadow-lg ${files.length > 0 ? 'bg-blue-600 text-white shadow-blue-200 hover:bg-blue-700 active:scale-95' : 'bg-slate-100 text-slate-400 cursor-not-allowed'}`}
                >
                  <Play size={18} fill="currentColor" /> {lang === 'zh' ? '開始轉換' : 'Start Process'}
                </button>
              ) : (
                <button 
                  onClick={stopGeneration}
                  className="w-full py-3 bg-slate-900 text-white rounded-xl flex items-center justify-center gap-2 font-bold hover:bg-black transition-all active:scale-95 shadow-lg shadow-slate-200"
                >
                  <Square size={18} fill="currentColor" /> {lang === 'zh' ? '停止生成' : 'Stop'}
                </button>
              )}
              <button 
                onClick={clearAll}
                className="w-full py-3 border border-slate-200 text-slate-600 rounded-xl flex items-center justify-center gap-2 font-bold hover:bg-slate-50 transition-all"
              >
                <Trash2 size={16} /> {lang === 'zh' ? '清除全部' : 'Clear All'}
              </button>
            </div>
          </section>
        </aside>

        {/* Dynamic Canvas: Center Content */}
        <div className="flex-1 flex flex-col gap-6 h-[calc(100vh-160px)] overflow-hidden">
          {/* Top Panel: Telemetry & Status */}
          <div className="h-48 grid grid-cols-3 gap-6">
            <section className="col-span-2 bg-[#0F172A] rounded-2xl p-5 border border-white/5 relative overflow-hidden group shadow-2xl">
              <div className="absolute top-0 left-0 w-full h-1 bg-blue-500/20" />
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] flex items-center gap-2">
                   <Activity size={12} className="text-blue-400" /> System Telemetry
                </h3>
                <div className="flex gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                  <div className="w-1.5 h-1.5 rounded-full bg-slate-700" />
                  <div className="w-1.5 h-1.5 rounded-full bg-slate-700" />
                </div>
              </div>
              <div className="h-28 overflow-y-auto pr-2 custom-scrollbar font-mono text-[10px] space-y-1">
                {telemetry.map(log => (
                  <div key={log.id} className="flex gap-3">
                    <span className="text-slate-600">[{log.time}]</span>
                    <span className={`
                      ${log.status === 'success' ? 'text-green-400' : ''}
                      ${log.status === 'info' ? 'text-blue-300' : ''}
                      ${log.status === 'warning' ? 'text-yellow-400' : ''}
                      ${log.status === 'error' ? 'text-red-400' : ''}
                    `}>
                      {log.message}
                    </span>
                  </div>
                ))}
                <div ref={logsEndRef} />
              </div>
            </section>
            
            <section className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm overflow-hidden flex flex-col">
              <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] mb-4">Pipeline Status</h3>
              <div className="space-y-3">
                {[1, 2, 3, 4].map(step => (
                  <div key={step} className="flex items-center gap-3">
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center text-[10px] font-bold transition-all ${activeStep === step ? 'border-blue-500 bg-blue-50 text-blue-600' : activeStep > step ? 'border-green-500 bg-green-500 text-white' : 'border-slate-100 text-slate-300'}`}>
                      {activeStep > step ? <CheckCircle2 size={10} /> : step}
                    </div>
                    <span className={`text-[11px] font-bold transition-all ${activeStep === step ? 'text-slate-800 translate-x-1' : 'text-slate-400'}`}>
                      {step === 1 ? '文檔初步轉換' : step === 2 ? '技能 AI 優化' : step === 3 ? '生成應用案例' : '深度分析總結'}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          </div>

          {/* Main Output View */}
          <section className="flex-1 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col relative whitespace-pre-wrap">
            {/* View Controls */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50 backdrop-blur-md">
              <nav className="flex gap-6 overflow-x-auto no-scrollbar">
                {[
                  { id: 1, label: lang === 'zh' ? '1. 轉換結果' : '1. Conversion', active: activeStep >= 1 },
                  { id: 2, label: lang === 'zh' ? '2. 進階技能' : '2. Advanced Skill', active: activeStep >= 2 },
                  { id: 3, label: lang === 'zh' ? '3. 應用案例' : '3. Use Cases', active: activeStep >= 3 },
                  { id: 4, label: lang === 'zh' ? '4. 深度總結' : '4. Final Summary', active: activeStep >= 4 }
                ].map(tab => (
                  <button 
                    key={tab.id}
                    className={`pb-3 text-sm font-bold tracking-tight transition-all relative ${activeStep >= tab.id ? 'text-slate-800' : 'text-slate-300 cursor-not-allowed'}`}
                    onClick={() => activeStep >= tab.id && document.getElementById(`step-${tab.id}`)?.scrollIntoView({ behavior: 'smooth' })}
                  >
                    {tab.label}
                    {activeStep === tab.id && <motion.div layoutId="activeTabIndicator" className="absolute bottom-0 left-0 w-full h-1 bg-blue-600 rounded-full" />}
                  </button>
                ))}
              </nav>
              <div className="flex gap-2">
                <button className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg" title="Copy Content">
                  <Copy size={18} />
                </button>
                <button className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg" title="Download Markdown">
                  <Download size={18} />
                </button>
              </div>
            </div>

            {/* Scrollable Result Area */}
            <div className="flex-1 overflow-y-auto p-12 space-y-16 selection:bg-blue-100 custom-scrollbar scroll-smooth">
              <div id="step-1" className="space-y-6">
                <div className="flex items-center gap-2 text-blue-600">
                  <Sparkles size={20} />
                  <h2 className="text-lg font-black tracking-tight uppercase">I. Document Synthesis</h2>
                </div>
                <div className="prose prose-slate max-w-none text-slate-700 leading-relaxed font-serif text-lg">
                  {step1Result || (activeStep === 1 && !isGenerating ? <div className="animate-pulse flex space-y-4 flex-col"><div className="h-4 bg-slate-100 rounded w-3/4"></div><div className="h-4 bg-slate-100 rounded"></div><div className="h-4 bg-slate-100 rounded w-5/6"></div></div> : <p className="text-slate-300 italic">轉換完成後將在此顯示...</p>)}
                </div>
              </div>

              {step2Result && (
                <div id="step-2" className="space-y-6 pt-12 border-t border-slate-100">
                  <div className="flex items-center gap-2 text-purple-600">
                    <Sparkles size={20} />
                    <h2 className="text-lg font-black tracking-tight uppercase">II. Advanced Skill (Enhanced)</h2>
                  </div>
                  <div className="bg-slate-900 rounded-2xl p-8 font-mono text-xs text-blue-400/80 leading-loose border border-white/5 shadow-inner">
                    {step2Result}
                  </div>
                </div>
              )}

              {step3Result && (
                <div id="step-3" className="space-y-6 pt-12 border-t border-slate-100">
                  <div className="flex items-center gap-2 text-amber-600">
                    <Sparkles size={20} />
                    <h2 className="text-lg font-black tracking-tight uppercase">III. Strategic Use Cases</h2>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {step3Result.split('\n\n').filter(p => p.length > 20).map((p, i) => (
                      <div key={i} className="p-6 bg-slate-50 border border-slate-200 rounded-2xl hover:border-amber-200 transition-all">
                        {p}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {step4Result && (
                <div id="step-4" className="space-y-6 pt-12 border-t border-slate-100">
                  <div className="flex items-center gap-2 text-emerald-600">
                    <Sparkles size={20} />
                    <h2 className="text-lg font-black tracking-tight uppercase">IV. Master Analysis & Summary</h2>
                  </div>
                  <div className="prose prose-slate max-w-none text-slate-800 leading-relaxed font-serif text-lg">
                    {step4Result}
                  </div>
                </div>
              )}
            </div>
            
            {/* Generating Indicator Overlay */}
            {isGenerating && (
              <div className="absolute inset-0 bg-white/40 backdrop-blur-[2px] z-10 pointer-events-none flex items-center justify-center">
                 <div className="p-8 bg-white/90 shadow-2xl rounded-3xl border border-slate-100 flex flex-col items-center gap-6">
                    <div className="relative">
                      <div className="w-12 h-12 border-4 border-blue-100 border-t-blue-600 rounded-full animate-spin"></div>
                      <Sparkles className="absolute -top-1 -right-1 text-blue-400 w-5 h-5 animate-bounce" />
                    </div>
                    <div className="text-center">
                      <p className="font-bold text-slate-900 animate-pulse">{lang === 'zh' ? 'AI 正在思考與撰寫中...' : 'AI is thinking and writing...'}</p>
                      <p className="text-[10px] text-slate-400 font-bold uppercase mt-2 tracking-widest">Neural Link Active</p>
                    </div>
                 </div>
              </div>
            )}
          </section>
        </div>
      </main>

      {/* Floating Elements / Modals */}
      <AnimatePresence>
        {showSkillEditor && (
          <motion.div 
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            className="fixed top-24 right-8 w-[500px] h-[calc(100vh-160px)] z-40 bg-white rounded-3xl border border-slate-200 shadow-2xl overflow-hidden flex flex-col text-slate-800"
          >
            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <h3 className="font-black text-slate-800 tracking-tight flex items-center gap-2">
                <Settings size={18} className="text-slate-400" />系統配置 (Configuration)
              </h3>
              <div className="flex gap-4">
                <button 
                  onClick={() => {
                    setSkillContent(DEFAULT_SKILL);
                    setSystemPrompt(DEFAULT_SYSTEM_PROMPT);
                    setModel('gemini-3-flash-preview');
                  }}
                  className="text-[10px] font-bold uppercase text-blue-600 hover:underline"
                >
                  重置
                </button>
                <button onClick={() => setShowSkillEditor(false)} className="text-slate-400 hover:text-slate-900"><Square size={14} /></button>
              </div>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
              <div>
                <label className="text-[10px] font-bold uppercase text-slate-400 mb-2 block">AI Model Selection</label>
                <select 
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-blue-500"
                >
                  <option value="gemini-3.1-pro-preview">Gemini 3.1 Pro (Heavy Tasks)</option>
                  <option value="gemini-3-flash-preview">Gemini 3 Flash (Fast & Lean)</option>
                  <option value="gemini-1.5-pro">Gemini 1.5 Pro</option>
                  <option value="gemini-1.5-flash">Gemini 1.5 Flash</option>
                </select>
              </div>

              <div>
                <label className="text-[10px] font-bold uppercase text-slate-400 mb-2 block">System Instructions (Expert Persona)</label>
                <textarea 
                  value={systemPrompt}
                  onChange={(e) => setSystemPrompt(e.target.value)}
                  className="w-full h-32 p-4 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-mono outline-none focus:border-blue-500 resize-none"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold uppercase text-slate-400 mb-2 block">Operational Skill (Skill.md)</label>
                <textarea 
                  value={skillContent}
                  onChange={(e) => setSkillContent(e.target.value)}
                  className="w-full h-48 p-4 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-mono outline-none focus:border-blue-500 resize-none"
                />
              </div>
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-100 text-[10px] text-slate-400 italic">
               * 這些配置將決定 AI 的思考深度與行為模式。調整後將在下次轉換時生效。
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Footer Info */}
      <footer className="fixed bottom-0 w-full px-8 h-8 flex items-center justify-between text-[10px] text-slate-400 font-semibold bg-slate-50 border-t border-slate-100">
        <div className="flex gap-4">
          <span>{lang === 'zh' ? APP_DESCRIPTION_ZH : APP_DESCRIPTION_EN}</span>
          <span className="text-slate-300">|</span>
          <span>Engine: Gemini 3.1 Pro</span>
        </div>
        <div className="flex gap-4">
          <span className="flex items-center gap-1"><Activity size={10} /> Latency: 124ms</span>
          <span className="flex items-center gap-1 text-slate-300">Token usage: Optimized</span>
        </div>
      </footer>

      {/* CSS Overrides */}
      <style>{`
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #E2E8F0; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #CBD5E1; }
      `}</style>
    </div>
  );
}
