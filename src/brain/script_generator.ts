import { GoogleGenerativeAI } from "@google/generative-ai";
import { SYSTEM_PROMPT } from "./prompts";
import * as dotenv from "dotenv";

// Inicializar variables de entorno (para GEMINI_API_KEY)
dotenv.config();

export type Speaker = "Mateo" | "Yanira";

export interface ScriptTurn {
  speaker: Speaker;
  text: string;
}

export interface PodcastScript {
  spanish_script: ScriptTurn[];
  quechua_script: ScriptTurn[];
}
export async function generateScript(news: any[], retries = 3): Promise<PodcastScript> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY no definida en el archivo .env.");
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    systemInstruction: SYSTEM_PROMPT,
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.6, // Un poco de flexibilidad para dinamismo
    }
  });

  const newsContext = `Genera el guion basado en estas noticias recientes del Perú:\n${JSON.stringify(news, null, 2)}`;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      console.log(`[Brain] Solicitando guion a Gemini... (Intento ${attempt}/${retries})`);
      const result = await model.generateContent(newsContext);
      const textResponse = result.response.text();
      
      const parsedData: PodcastScript = JSON.parse(textResponse);
      
      // Validación estricta básica
      if (!parsedData.spanish_script || !Array.isArray(parsedData.spanish_script) ||
          !parsedData.quechua_script || !Array.isArray(parsedData.quechua_script)) {
         throw new Error("El JSON retornado por Gemini no cumple con el esquema estricto de PodcastScript.");
      }

      console.log(`[Brain] ✓ Guion generado correctamente: ${parsedData.spanish_script.length} turnos ES / ${parsedData.quechua_script.length} turnos QU.`);
      return parsedData;
    } catch (error) {
      console.error(`[Brain] ⚠️ Error en intento ${attempt}:`, (error as Error).message);
      if (attempt === retries) {
        throw new Error("Generación de guion JSON falló después de múltiples reintentos.");
      }
      // Wait a moment before retrying
      await new Promise(res => setTimeout(res, 2000));
    }
  }
  
  throw new Error("Lógica de retry del Brain agotada sin resultados.");
}

export async function translateToQuechua(text: string, retries = 3): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY no definida en el archivo .env.");
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash", 
    systemInstruction: "Eres un traductor maestro, lingüista experto en el paso de Español a Quechua Chanca/Sureño (Runasimi). Tu tarea exclusiva es traducir el texto que recibas manteniendo un estilo periodístico formal. Respeta escrupulosamente el formato original, conservando etiquetas como [TITULAR], [FUENTE], [FECHA], [RESUMEN] tal cual están sin traducirlas (ya que son metadatos para otra IA), pero traduciendo todo el contenido noticioso debajo de ellas.",
    generationConfig: {
      temperature: 0.2, 
    }
  });

  // Dividir el texto en chunks menores para no colgar la API generativa
  const chunks = text.split('---');
  let translatedText = "";
  const chunkLimit = 15; 
  const batchedChunks = [];
  
  for (let k = 0; k < chunks.length; k += chunkLimit) {
      batchedChunks.push(chunks.slice(k, k + chunkLimit).join('---'));
  }

  let batchIndex = 1;
  for (const batch of batchedChunks) {
      if (batch.trim().length === 0 || batch.trim() === "\n") continue;
      
      for (let attempt = 1; attempt <= retries; attempt++) {
        try {
          console.log(`[Brain] Traduciendo lote ${batchIndex}/${batchedChunks.length} al Quechua... (Intento ${attempt}/${retries})`);
          const result = await model.generateContent(batch);
          translatedText += result.response.text() + "\n---\n";
          break; // Éxito, salir del loop de reintentos
        } catch (error) {
          console.error(`[Brain] ⚠️ Error en traducción del lote ${batchIndex} (intento ${attempt}):`, (error as Error).message);
          if (attempt === retries) {
            console.error("❌ Falló la traducción de este lote en todos los reintentos. Se omitirá.");
          } else {
            await new Promise(res => setTimeout(res, 2000));
          }
        }
      }
      batchIndex++;
  }
  
  return translatedText;
}
