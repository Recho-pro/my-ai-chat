// 这个文件是后端 API 路由
// 作用：接收前端发来的消息，转发给 OpenRouter，把 AI 的回复"流式"返回给前端

import OpenAI from "openai";

// 创建 OpenAI 客户端（但指向 OpenRouter 的地址）
const client = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1", // OpenRouter 的接口地址
  apiKey: process.env.OPENROUTER_API_KEY,   // 从环境变量读取你的 Key
});

// 处理 POST 请求（前端发消息过来就是 POST 请求）
export async function POST(req: Request) {
  try {
    // 1. 从前端发来的数据中，取出消息列表和模型名称
    const { messages, model } = await req.json();

    // 2. 调用 OpenRouter（就像调用 OpenAI 一样）
    const response = await client.chat.completions.create({
      model: model || "deepseek/deepseek-chat", // 默认用 DeepSeek（便宜好用）
      messages: messages,                        // 用户和 AI 的对话历史
      stream: true,                              // 开启流式输出（一个字一个字返回）
    });

    // 3. 把 AI 的回复变成"流"，一点一点传给前端
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        // 遍历 AI 返回的每一小块内容
        for await (const chunk of response) {
          const text = chunk.choices[0]?.delta?.content || "";
          if (text) {
            // 按照 SSE（Server-Sent Events）格式发送
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text })}\n\n`));
          }
        }
        // 发送结束信号
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      },
    });

    // 4. 返回流式响应
    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",      // 告诉浏览器这是流式数据
        "Cache-Control": "no-cache",               // 不要缓存
        Connection: "keep-alive",                  // 保持连接
      },
    });
  } catch (error) {
    // 如果出错了，返回错误信息
    console.error("API 路由出错：", error);
    return new Response(
      JSON.stringify({ error: "AI 请求失败，请稍后重试" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}