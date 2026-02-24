// 网站首页 —— 完整功能版聊天界面
"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import "highlight.js/styles/github-dark.css";

// ============ 模型列表 ============
const MODELS = [
  { id: "deepseek/deepseek-chat", name: "DeepSeek V3", tag: "推荐" },
  { id: "deepseek/deepseek-r1", name: "DeepSeek R1", tag: "推理" },
  { id: "google/gemini-2.0-flash-001", name: "Gemini 2.0 Flash", tag: "快" },
  { id: "google/gemini-2.5-pro-preview-05-06", name: "Gemini 2.5 Pro", tag: "强" },
  { id: "openai/gpt-4o-mini", name: "GPT-4o Mini", tag: "性价比" },
  { id: "openai/gpt-4o", name: "GPT-4o", tag: "强" },
  { id: "openai/o3-mini", name: "o3 Mini", tag: "推理" },
  { id: "anthropic/claude-sonnet-4", name: "Claude Sonnet 4", tag: "强" },
  { id: "anthropic/claude-3.5-haiku", name: "Claude 3.5 Haiku", tag: "快" },
  { id: "meta-llama/llama-4-maverick", name: "Llama 4 Maverick", tag: "开源" },
  { id: "qwen/qwen-2.5-72b-instruct", name: "通义千问 72B", tag: "中文" },
  { id: "mistralai/mistral-medium-3", name: "Mistral Medium 3", tag: "欧洲" },
];

// ============ 支持图片分析的模型 ============
const VISION_MODELS = [
  "openai/gpt-4o", "openai/gpt-4o-mini",
  "anthropic/claude-sonnet-4", "anthropic/claude-3.5-haiku",
  "google/gemini-2.0-flash-001", "google/gemini-2.5-pro-preview-05-06",
];

// ============ 类型定义 ============
interface Message {
  role: "user" | "assistant";
  content: string;
  model?: string;
  images?: string[]; // base64 图片
}

interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  model: string;
  updatedAt: number;
}

// ============ 代码块组件（带复制按钮和语言标签） ============
function CodeBlock({ className, children }: { className?: string; children: React.ReactNode }) {
  const [copied, setCopied] = useState(false);
  const lang = className?.replace("hljs language-", "").replace("language-", "") || "";
  const code = String(children).replace(/\n$/, "");

  const copy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative group my-3">
      <div className="flex items-center justify-between px-4 py-1.5 bg-[#1a1a1a] rounded-t-lg border border-b-0 border-[#333] text-xs text-[#888]">
        <span>{lang || "code"}</span>
        <button onClick={copy} className="hover:text-white transition-colors">
          {copied ? "✓ 已复制" : "复制"}
        </button>
      </div>
      <pre className="!mt-0 !rounded-t-none"><code className={className}>{children}</code></pre>
    </div>
  );
}

// ============ 主页面 ============
export default function Home() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [model, setModel] = useState(MODELS[0].id);
  const [loading, setLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [darkMode, setDarkMode] = useState(true);
  const [pendingImages, setPendingImages] = useState<string[]>([]); // 待发送的图片
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 加载历史和主题
  useEffect(() => {
    const saved = localStorage.getItem("conversations");
    if (saved) { try { setConversations(JSON.parse(saved)); } catch { /* skip */ } }
    const theme = localStorage.getItem("darkMode");
    if (theme !== null) setDarkMode(JSON.parse(theme));
  }, []);

  useEffect(() => {
    if (conversations.length > 0) localStorage.setItem("conversations", JSON.stringify(conversations));
  }, [conversations]);

  useEffect(() => { localStorage.setItem("darkMode", JSON.stringify(darkMode)); }, [darkMode]);
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);
  useEffect(() => {
    const ta = textareaRef.current;
    if (ta) { ta.style.height = "auto"; ta.style.height = Math.min(ta.scrollHeight, 150) + "px"; }
  }, [input]);

  const getModelName = useCallback((id: string) => MODELS.find((m) => m.id === id)?.name || id, []);
  const supportsVision = VISION_MODELS.includes(model);

  // 保存对话
  const saveConversation = useCallback((id: string, msgs: Message[], mdl: string) => {
    setConversations((prev) => {
      const title = msgs.find((m) => m.role === "user")?.content.slice(0, 30) || "新对话";
      const conv: Conversation = { id, title, messages: msgs, model: mdl, updatedAt: Date.now() };
      const idx = prev.findIndex((c) => c.id === id);
      if (idx >= 0) { const u = [...prev]; u[idx] = conv; return u; }
      return [conv, ...prev];
    });
  }, []);

  const newChat = () => { setActiveId(null); setMessages([]); setInput(""); setPendingImages([]); setSidebarOpen(false); };
  const switchChat = (c: Conversation) => { setActiveId(c.id); setMessages(c.messages); setModel(c.model); setSidebarOpen(false); };
  const deleteChat = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setConversations((p) => p.filter((c) => c.id !== id));
    if (activeId === id) { setActiveId(null); setMessages([]); }
  };

  // 处理图片上传
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    Array.from(files).forEach((file) => {
      if (file.type.startsWith("image/")) {
        // 图片：转 base64
        const reader = new FileReader();
        reader.onload = () => {
          setPendingImages((prev) => [...prev, reader.result as string]);
        };
        reader.readAsDataURL(file);
      } else if (file.type === "text/plain" || file.name.endsWith(".md") || file.name.endsWith(".csv") || file.name.endsWith(".json") || file.name.endsWith(".py") || file.name.endsWith(".js") || file.name.endsWith(".ts") || file.name.endsWith(".html") || file.name.endsWith(".css")) {
        // 文本文件：读取内容插入输入框
        const reader = new FileReader();
        reader.onload = () => {
          const content = reader.result as string;
          setInput((prev) => prev + `\n\n--- ${file.name} ---\n${content}`);
        };
        reader.readAsText(file);
      } else if (file.type === "application/pdf") {
        setInput((prev) => prev + `\n\n[已上传 PDF: ${file.name}，当前暂不支持直接解析 PDF，请复制文本内容粘贴]`);
      }
    });
    // 重置 input 以便再次选择同一文件
    e.target.value = "";
  };

  const removeImage = (idx: number) => {
    setPendingImages((prev) => prev.filter((_, i) => i !== idx));
  };

  // 发送消息
  const sendMessage = async () => {
    const trimmed = input.trim();
    if ((!trimmed && pendingImages.length === 0) || loading) return;

    const chatId = activeId || crypto.randomUUID();
    if (!activeId) setActiveId(chatId);

    const userMsg: Message = {
      role: "user",
      content: trimmed || "请分析这张图片",
      ...(pendingImages.length > 0 ? { images: pendingImages } : {}),
    };
    const newMsgs = [...messages, userMsg];
    setMessages(newMsgs);
    setInput("");
    setPendingImages([]);
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: newMsgs, model }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "请求失败");
      }

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let aiText = "";
      setMessages([...newMsgs, { role: "assistant", content: "", model }]);

      while (reader) {
        const { done, value } = await reader.read();
        if (done) break;
        for (const line of decoder.decode(value).split("\n")) {
          if (line.startsWith("data: ") && line !== "data: [DONE]") {
            try {
              aiText += JSON.parse(line.slice(6)).text;
              setMessages([...newMsgs, { role: "assistant", content: aiText, model }]);
            } catch { /* skip */ }
          }
        }
      }

      const finalMsgs = [...newMsgs, { role: "assistant" as const, content: aiText, model }];
      setMessages(finalMsgs);
      saveConversation(chatId, finalMsgs, model);
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : "未知错误";
      setMessages([...newMsgs, { role: "assistant", content: `❌ ${errMsg}` }]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  // 主题色
  const t = darkMode
    ? { bg: "bg-[#191919]", sidebar: "bg-[#141414]", bd: "border-[#2a2a2a]", text: "text-[#ececec]", sub: "text-[#999]", muted: "text-[#666]", input: "bg-[#2a2a2a] border-[#3a3a3a]", userBub: "bg-[#303030]", btn: "bg-[#444] hover:bg-[#555]", accent: "bg-[#c96442] hover:bg-[#b55a3a]", hov: "hover:bg-[#252525]", active: "bg-[#252525]", card: "bg-[#212121] border-[#333]", codeBg: "prose-pre:bg-[#1a1a1a] prose-pre:border prose-pre:border-[#333]", dis: "bg-[#333] text-[#666]" }
    : { bg: "bg-[#f5f0ea]", sidebar: "bg-[#ebe5de]", bd: "border-[#d8d0c5]", text: "text-[#2d2a26]", sub: "text-[#78716c]", muted: "text-[#a39e97]", input: "bg-white border-[#d8d0c5]", userBub: "bg-[#e8e0d5]", btn: "bg-[#d8d0c5] hover:bg-[#ccc3b5]", accent: "bg-[#c96442] hover:bg-[#b55a3a]", hov: "hover:bg-[#e2dbd2]", active: "bg-[#e2dbd2]", card: "bg-white border-[#e5ddd3]", codeBg: "prose-pre:bg-[#2d2a26] prose-pre:text-[#ececec]", dis: "bg-[#e5ddd3] text-[#aaa]" };

  return (
    <div className={`flex h-screen ${t.bg} ${t.text} transition-colors duration-200`}>
      {sidebarOpen && <div className="fixed inset-0 bg-black/40 z-20 md:hidden" onClick={() => setSidebarOpen(false)} />}

      {/* ====== 侧边栏 ====== */}
      <aside className={`fixed md:relative z-30 h-full w-64 ${t.sidebar} border-r ${t.bd} flex flex-col transition-transform duration-200 ${sidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"}`}>
        <div className={`p-3 border-b ${t.bd}`}>
          <button onClick={newChat} className={`w-full py-2.5 px-3 rounded-lg text-sm font-medium ${t.accent} text-white transition-colors`}>+ 新对话</button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
          {conversations.length === 0 && <p className={`text-xs ${t.muted} text-center mt-8`}>还没有对话记录</p>}
          {conversations.sort((a, b) => b.updatedAt - a.updatedAt).map((conv) => (
            <div key={conv.id} onClick={() => switchChat(conv)} className={`group flex items-center gap-2 px-3 py-2.5 rounded-lg cursor-pointer text-sm transition-colors ${activeId === conv.id ? t.active : t.hov}`}>
              <span className="flex-1 truncate">{conv.title}</span>
              <button onClick={(e) => deleteChat(conv.id, e)} className={`opacity-0 group-hover:opacity-100 ${t.muted} hover:text-red-400 transition-all text-xs`}>✕</button>
            </div>
          ))}
        </div>
        <div className={`p-3 border-t ${t.bd} space-y-2`}>
          <select value={model} onChange={(e) => setModel(e.target.value)} className={`w-full text-sm px-3 py-2 rounded-lg border outline-none cursor-pointer ${t.input} ${t.text}`}>
            {MODELS.map((m) => <option key={m.id} value={m.id}>{m.name} · {m.tag}</option>)}
          </select>
          <button onClick={() => setDarkMode(!darkMode)} className={`w-full py-2 px-3 rounded-lg text-sm ${t.btn} ${t.text} transition-colors`}>
            {darkMode ? "☀️ 浅色" : "🌙 深色"}
          </button>
        </div>
      </aside>

      {/* ====== 主区域 ====== */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className={`flex items-center px-4 py-3 border-b ${t.bd}`}>
          <button onClick={() => setSidebarOpen(!sidebarOpen)} className="md:hidden mr-3 text-lg">☰</button>
          <span className={`text-sm ${t.sub}`}>{getModelName(model)}</span>
          {supportsVision && <span className={`text-xs ${t.muted} ml-2`}>📷 支持图片</span>}
        </header>

        <main className="flex-1 overflow-y-auto">
          {messages.length === 0 && (
            <div className="flex items-center justify-center h-full px-4">
              <div className="text-center max-w-md">
                <h2 className="text-2xl font-semibold mb-2">EchoProAI</h2>
                <p className={`${t.sub} mb-8`}>选择模型，开始对话</p>
                <div className="flex flex-wrap justify-center gap-2">
                  {["帮我写一首诗", "解释量子计算", "写一段Python代码"].map((hint) => (
                    <button key={hint} onClick={() => setInput(hint)} className={`text-sm px-4 py-2 rounded-full border ${t.bd} ${t.hov} ${t.sub} transition-colors`}>{hint}</button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {messages.length > 0 && (
            <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
              {messages.map((msg, i) => (
                <div key={i}>
                  {msg.role === "user" ? (
                    <div className="flex justify-end">
                      <div className={`max-w-[80%] space-y-2`}>
                        {/* 显示用户上传的图片 */}
                        {msg.images && msg.images.length > 0 && (
                          <div className="flex justify-end gap-2 flex-wrap">
                            {msg.images.map((img, j) => (
                              <img key={j} src={img} alt="上传的图片" className="max-w-[200px] max-h-[200px] rounded-lg object-cover" />
                            ))}
                          </div>
                        )}
                        <div className={`px-4 py-3 rounded-2xl rounded-br-sm ${t.userBub}`}>
                          <p className="whitespace-pre-wrap text-sm leading-relaxed">{msg.content}</p>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div>
                      {msg.model && <p className={`text-xs ${t.muted} mb-1.5 ml-1`}>{getModelName(msg.model)}</p>}
                      <div className={`prose ${darkMode ? "prose-invert" : ""} prose-sm max-w-none leading-relaxed ${t.codeBg} prose-code:text-[#c96442] prose-p:my-2 prose-headings:my-3`}>
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm]}
                          rehypePlugins={[rehypeHighlight]}
                          components={{
                            // 自定义代码块渲染：加复制按钮
                            code({ className, children, ...props }) {
                              const isBlock = className?.includes("language-") || className?.includes("hljs");
                              if (isBlock) {
                                return <CodeBlock className={className}>{children}</CodeBlock>;
                              }
                              return <code className={className} {...props}>{children}</code>;
                            },
                            // 去掉默认的 pre 包裹（CodeBlock 自己处理了）
                            pre({ children }) {
                              return <>{children}</>;
                            },
                          }}
                        >
                          {msg.content || "⏳ 思考中..."}
                        </ReactMarkdown>
                      </div>
                    </div>
                  )}
                </div>
              ))}
              {loading && messages.length > 0 && messages[messages.length - 1]?.content === "" && (
                <div className="flex gap-1.5 py-2">
                  {[0, 1, 2].map((i) => (
                    <span key={i} className={`w-1.5 h-1.5 rounded-full ${darkMode ? "bg-[#888]" : "bg-[#999]"} animate-bounce`} style={{ animationDelay: `${i * 150}ms` }} />
                  ))}
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </main>

        {/* 输入区域 */}
        <footer className="px-4 pb-4 pt-2">
          {/* 图片预览 */}
          {pendingImages.length > 0 && (
            <div className="max-w-2xl mx-auto mb-2 flex gap-2 flex-wrap">
              {pendingImages.map((img, i) => (
                <div key={i} className="relative group">
                  <img src={img} alt="待发送" className="w-16 h-16 rounded-lg object-cover border border-[#333]" />
                  <button onClick={() => removeImage(i)} className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white rounded-full text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">✕</button>
                </div>
              ))}
            </div>
          )}

          <div className={`max-w-2xl mx-auto flex gap-2 items-end p-2 rounded-2xl border ${t.card}`}>
            {/* 上传按钮 */}
            <button
              onClick={() => fileInputRef.current?.click()}
              className={`px-2 py-2 rounded-lg text-sm ${t.btn} ${t.text} transition-colors flex-shrink-0`}
              title="上传图片或文件"
            >
              📎
            </button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*,.txt,.md,.csv,.json,.py,.js,.ts,.html,.css,.pdf"
              onChange={handleFileSelect}
              className="hidden"
            />

            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="输入消息..."
              rows={1}
              className={`flex-1 px-3 py-2 bg-transparent outline-none resize-none text-sm leading-relaxed ${t.text} placeholder-[#888]`}
            />
            <button
              onClick={sendMessage}
              disabled={loading || (!input.trim() && pendingImages.length === 0)}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                (input.trim() || pendingImages.length > 0) && !loading ? `${t.accent} text-white` : `${t.dis} cursor-not-allowed`
              }`}
            >
              {loading ? "..." : "↑"}
            </button>
          </div>
          <p className={`text-center text-xs ${t.muted} mt-2`}>EchoProAI · 多模型 AI 助手</p>
        </footer>
      </div>
    </div>
  );
}