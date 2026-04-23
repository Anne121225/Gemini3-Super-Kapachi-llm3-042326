import { GoogleGenAI, GenerateContentResponse } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export interface StreamCallbacks {
  onChunk: (text: string) => void;
  onFinish?: (text: string) => void;
  onError?: (error: any) => void;
}

export async function streamGemini(
  params: {
    model: string;
    systemInstruction?: string;
    parts: any[];
    signal?: AbortSignal;
  },
  callbacks: StreamCallbacks
) {
  try {
    const stream = await ai.models.generateContentStream({
      model: params.model,
      contents: { parts: params.parts },
      config: {
        systemInstruction: params.systemInstruction,
        temperature: 0.7,
      },
    });

    let fullText = "";
    for await (const chunk of stream) {
      if (params.signal?.aborted) {
        throw new Error("AbortError");
      }
      const text = chunk.text || "";
      fullText += text;
      callbacks.onChunk(text);
    }
    callbacks.onFinish?.(fullText);
  } catch (error: any) {
    if (error.message === "AbortError" || error.name === "AbortError") {
      console.log("Stream aborted by user");
      return;
    }
    console.error("Gemini Stream Error:", error);
    callbacks.onError?.(error);
  }
}

export async function getGeminiResponse(params: {
  model: string;
  systemInstruction?: string;
  parts: any[];
}) {
  try {
    const response: GenerateContentResponse = await ai.models.generateContent({
      model: params.model,
      contents: { parts: params.parts },
      config: {
        systemInstruction: params.systemInstruction,
        temperature: 0.7,
      },
    });
    return response.text;
  } catch (error) {
    console.error("Gemini Response Error:", error);
    return null;
  }
}
