import { ScriptTurn } from "../brain/script_generator";
import { generateGoogleTTS } from "./google_tts";
import { generateAzureTTS } from "./azure_tts";
import { generateGeminiTTS } from "./gemini_tts";
import path from "path";

export async function generateAudioQueue(script: ScriptTurn[], lang: "es" | "qu" | "native-es"): Promise<string[]> {
    const audioPaths: string[] = [];
    console.log(`[VoiceManager] Iniciando proceso TTS para la cadena de [${lang.toUpperCase()}]`);

    // --- MODO MONOLITO PARA GEMINI EXPERIMENTAL ---
    // La API Gratuita de Gemini nos bloquea si enviamos un diálogo fracturado en más de 10 peticiones.
    // Solución: Unir todas las frases, armar una noticia continua y enviarla en 1 SOLA PETICIÓN (Modo Audiobook).
    if (lang === "native-es") {
        console.log(` -> Ensamblando guion completo en un Monolito para esquivar el Rate-Limit de Google...`);
        const fullText = script.map(turn => turn.text).join(' ');
        const outputPath = path.resolve(process.cwd(), "temp", lang, `001_NoticiaConsolidadaNativa.mp3`);
        
        try {
            console.log(` -> Sintetizando 1 solo archivo magistral usando la voz Neutral/Femenina (Aoede)...`);
            await generateGeminiTTS(fullText, "Yanira", outputPath);
            console.log(`[VoiceManager] ✓ Pista Nivel Dios (Monolito) sintetizada en una sola llama API.`);
            return [outputPath];
        } catch (error) {
            console.error(`      ❌ Falló el Monolito Gemini: ${(error as Error).message}`);
            return [];
        }
    }

    // --- MODO DUAL NORMAL (GOOGLE / AZURE) ---
    for (let i = 0; i < script.length; i++) {
        const turn = script[i];
        if (!turn) continue;
        
        const seqNumber = String(i + 1).padStart(3, '0');
        const filename = `${seqNumber}_${turn.speaker}.mp3`;
        const tempFolder = path.resolve(process.cwd(), "temp", lang);
        const outputPath = path.resolve(tempFolder, filename);
        
        console.log(` -> Sintetizando ${lang}-${seqNumber} (${turn.speaker})...`);
        
        try {
            if (lang === "es") {
                await generateGoogleTTS(turn.text, turn.speaker, outputPath);
            } else if (lang === "qu") {
                await generateAzureTTS(turn.text, turn.speaker, outputPath);
            }
            
            audioPaths.push(outputPath);
        } catch (error) {
            console.error(`      ❌ Error crítico en el turno ${seqNumber}: ${(error as Error).message}`);
            console.warn(`      ⚠️ Abortando cola de audios restante. Salvando los ${audioPaths.length} segmentos...`);
            break; 
        }
    }
    
    console.log(`[VoiceManager] ✓ Finalizado: ${audioPaths.length}/${script.length} audios para '${lang}' procesados.`);
    return audioPaths;
}
