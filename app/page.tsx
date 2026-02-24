// 网站首页 —— AI 聊天界面（美化版）
"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import "highlight.js/styles/github-dark.css"; // 代码高亮主题

// ============ 可用的模型列表 ============
// 开发阶段先用 DeepSeek，部署到 Vercel 后再加其他模型
const MODELS = [
  { id: "deepseek/deepseek-chat", name: "DeepSeek V3", tag: "推荐" },
  { id: "deepseek/deepseek-r1", name: "DeepSeek R1", tag: "推理" },
];

// ============ 类型定义 ============
interface Message {
  role: "user" | "assistant";
  content: string;
  model?: string; // 记录这条消息用的哪个模型
}

// ============ 主页面 ============
export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [model, setModel] = useState(MODELS[0].id);
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 自动滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // 输入框自动调整高度
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      textarea.style.height = Math.min(textarea.scrollHeight, 150) + "px";
    }
  }, [input]);

  // 获取模型的显示名称
  const getModelName = useCallback(
    (modelId: string) => MODELS.find((m) => m.id === modelId)?.name || modelId,
    []
  );

  // 发送消息
  const sendMessage = async () => {
    const trimmed = input.trim();
    if (!trimmed || loading) return;

    const userMessage: Message = { role: "user", content: trimmed };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: newMessages, model }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || "请求失败");
      }

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let aiText = "";

      setMessages([
        ...newMessages,
        { role: "assistant", content: "", model: model },
      ]);

      while (reader) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (line.startsWith("data: ") && line !== "data: [DONE]") {
            try {
              const data = JSON.parse(line.slice(6));
              aiText += data.text;
              setMessages((prev) => {
                const updated = [...prev];
                updated[updated.length - 1] = {
                  role: "assistant",
                  content: aiText,
                  model: model,
                };
                return updated;
              });
            } catch {
              // 跳过解析失败的行
            }
          }
        }
      }
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : "未知错误";
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: `❌ ${errMsg}` },
      ]);
    } finally {
      setLoading(false);
    }
  };

  // 按键处理
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // 新建对话
  const clearChat = () => {
    setMessages([]);
  };

  // ============ 页面渲染 ============
  return (
    <div className="flex flex-col h-screen bg-[#0a0a12] text-gray-100">
      {/* ====== 顶部栏 ====== */}
      <header className="flex items-center justify-between px-4 py-3 bg-[#111120] border-b border-gray-800/50">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
            🤖 AI Chat
          </h1>
          <button
            onClick={clearChat}
            className="text-xs px-3 py-1 rounded-lg bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700 transition-colors"
          >
            + 新对话
          </button>
        </div>

        {/* 模型选择 */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500 hidden sm:inline">模型：</span>
          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="bg-gray-800/80 text-gray-200 text-sm px-3 py-1.5 rounded-lg border border-gray-700/50 outline-none cursor-pointer hover:border-gray-600 transition-colors"
          >
            {MODELS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} {m.tag ? `· ${m.tag}` : ""}
              </option>
            ))}
          </select>
        </div>
      </header>

      {/* ====== 消息区域 ====== */}
      <main className="flex-1 overflow-y-auto">
        {/* 欢迎页 */}
        {messages.length === 0 && (
          <div className="flex items-center justify-center h-full">
            <div className="text-center px-4">
              <div className="text-6xl mb-6">🤖</div>
              <h2 className="text-2xl font-bold mb-2 bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
                你好！我是 AI 助手
              </h2>
              <p className="text-gray-500 mb-8">
                选择模型，开始对话。支持多种 AI 模型随时切换。
              </p>
              {/* 快捷提示 */}
              <div className="flex flex-wrap justify-center gap-2">
                {["帮我写一首诗", "解释量子计算", "用Python写冒泡排序"].map(
                  (hint) => (
                    <button
                      key={hint}
                      onClick={() => setInput(hint)}
                      className="text-sm px-4 py-2 rounded-xl bg-gray-800/50 text-gray-400 border border-gray-700/50 hover:border-purple-500/50 hover:text-gray-200 transition-all"
                    >
                      {hint}
                    </button>
                  )
                )}
              </div>
            </div>
          </div>
        )}

        {/* 消息列表 */}
        {messages.length > 0 && (
          <div className="max-w-3xl mx-auto p-4 space-y-6">
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div className="max-w-[85%]">
                  {/* AI 消息头部：显示模型名 */}
                  {msg.role === "assistant" && msg.model && (
                    <div className="text-xs text-gray-500 mb-1 ml-1">
                      {getModelName(msg.model)}
                    </div>
                  )}
                  <div
                    className={`px-4 py-3 rounded-2xl ${
                      msg.role === "user"
                        ? "bg-blue-600 text-white rounded-br-md"
                        : "bg-[#1a1a2e] text-gray-100 border border-gray-800/50 rounded-bl-md"
                    }`}
                  >
                    {msg.role === "assistant" ? (
                      <div className="prose prose-invert prose-sm max-w-none prose-pre:bg-[#0d0d1a] prose-pre:border prose-pre:border-gray-800/50 prose-code:text-purple-300">
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm]}
                          rehypePlugins={[rehypeHighlight]}
                        >
                          {msg.content || "⏳ 思考中..."}
                        </ReactMarkdown>
                      </div>
                    ) : (
                      <p className="whitespace-pre-wrap">{msg.content}</p>
                    )}
                  </div>
                </div>
              </div>
            ))}

            {/* 加载动画 */}
            {loading &&
              messages.length > 0 &&
              messages[messages.length - 1]?.role === "assistant" &&
              messages[messages.length - 1]?.content === "" && (
                <div className="flex justify-start">
                  <div className="bg-[#1a1a2e] border border-gray-800/50 px-4 py-3 rounded-2xl rounded-bl-md">
                    <div className="flex gap-1">
                      <span
                        className="w-2 h-2 bg-purple-400 rounded-full animate-bounce"
                        style={{ animationDelay: "0ms" }}
                      />
                      <span
                        className="w-2 h-2 bg-purple-400 rounded-full animate-bounce"
                        style={{ animationDelay: "150ms" }}
                      />
                      <span
                        className="w-2 h-2 bg-purple-400 rounded-full animate-bounce"
                        style={{ animationDelay: "300ms" }}
                      />
                    </div>
                  </div>
                </div>
              )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </main>

      {/* ====== 输入区域 ====== */}
      <footer className="p-3 sm:p-4 bg-[#111120] border-t border-gray-800/50">
        <div className="max-w-3xl mx-auto flex gap-2 items-end">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="输入消息... (Enter 发送，Shift+Enter 换行)"
            rows={1}
            className="flex-1 bg-[#1a1a2e] text-gray-100 px-4 py-3 rounded-xl border border-gray-700/50 outline-none resize-none placeholder-gray-600 focus:border-purple-500/50 transition-colors"
          />
          <button
            onClick={sendMessage}
            disabled={loading || !input.trim()}
            className="px-4 sm:px-5 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-xl font-medium hover:from-blue-500 hover:to-purple-500 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
          >
            {loading ? "⏳" : "发送"}
          </button>
        </div>
        <p className="text-center text-xs text-gray-600 mt-2">
          由 OpenRouter 提供多模型支持
        </p>
      </footer>
    </div>
  );
}