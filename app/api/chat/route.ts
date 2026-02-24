// 后端 API 路由 —— 支持文本和图片消息
import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY,
});

export async function POST(req: Request) {
  try {
    const { messages, model } = await req.json();

    // 把前端的消息格式转成 OpenAI API 格式
    // 如果消息包含图片，需要用 content 数组格式
    const formattedMessages = messages.map((msg: { role: string; content: string; images?: string[] }) => {
      if (msg.images && msg.images.length > 0) {
        // 带图片的消息：用数组格式
        const content: Array<{ type: string; text?: string; image_url?: { url: string } }> = [
          { type: "text", text: msg.content || "请分析这张图片" },
        ];
        for (const img of msg.images) {
          content.push({
            type: "image_url",
            image_url: { url: img }, // base64 格式: data:image/xxx;base64,...
          });
        }
        return { role: msg.role, content };
      }
      // 普通文本消息
      return { role: msg.role, content: msg.content };
    });

    const response = await client.chat.completions.create({
      model: model || "deepseek/deepseek-chat",
      messages: formattedMessages,
      stream: true,
    });

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        for await (const chunk of response) {
          const text = chunk.choices[0]?.delta?.content || "";
          if (text) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text })}\n\n`));
          }
        }
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    console.error("API 路由出错：", error);
    return new Response(
      JSON.stringify({ error: "AI 请求失败，请稍后重试" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}