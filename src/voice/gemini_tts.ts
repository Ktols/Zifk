import fs from 'fs';
import ffmpegStatic from 'ffmpeg-static';
import ffmpeg from 'fluent-ffmpeg';

// Set up fluent-ffmpeg to use our local static binary (to avoid dependency issues on Windows)
if (ffmpegStatic) {
    ffmpeg.setFfmpegPath(ffmpegStatic);
}

export async function generateGeminiTTS(text: string, speaker: "Mateo" | "Yanira", outputPath: string): Promise<string> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("Falta GEMINI_API_KEY para motor nativo");

    // Asignación de prebuilt voices según documentación oficial
    const voiceName = speaker === "Mateo" ? "Puck" : "Aoede";

    // Endpoint directo a la v1alpha necesario para soporte experimental de síntesis directa de audio
    const url = `https://generativelanguage.googleapis.com/v1alpha/models/gemini-3.1-flash-tts-preview:generateContent?key=${apiKey}`;
    
    const payload = {
        contents: [{ 
            role: "user", 
            parts: [{ text }] 
        }],
        generationConfig: {
            responseModalities: ["AUDIO"],
            speechConfig: { 
                voiceConfig: { 
                    prebuiltVoiceConfig: { voiceName } 
                } 
            }
        }
    };

    let data;
    let retries = 0;
    while (retries < 5) {
        const res = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });

        data = await res.json();
        
        if (data.error) {
            if (data.error.message.includes("Quota exceeded") || data.error.code === 429) {
                console.warn(`      ⚠️ [Aviso de Cuota] Firewall detonado. Ingresando a Sueño Profundo de 65 segundos para limpiar historial de IP...`);
                await new Promise(r => setTimeout(r, 65000));
                retries++;
                continue;
            }
            throw new Error(`API Gemini TTS Falló: ${data.error.message}`);
        }
        break;
    }
    
    if (data?.error) {
        throw new Error(`API Gemini TTS Excedió reintentos: ${data.error.message}`);
    }

    // Navegar de forma segura en la respuesta
    const base64Audio = data.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!base64Audio) {
        throw new Error("No se devolvió un buffer de audio válido por Gemini 3.1 TTS");
    }

    const pcmBuffer = Buffer.from(base64Audio, 'base64');
    
    // Archivo temporal crudo .pcm
    const tempPcm = outputPath.replace('.mp3', '.pcm');
    fs.writeFileSync(tempPcm, pcmBuffer);

    return new Promise((resolve, reject) => {
        // Formato devuelto por default por Gemini ("audio/l16; rate=24000; channels=1")
         ffmpeg()
            .input(tempPcm)
            .inputOptions([
                '-f s16le',      // Signed 16-bit little-endian PCM
                '-ar 24000',     // Sample rate 24kHz
                '-ac 1'          // 1 Channel (Mono)
            ])
            .output(outputPath)
            .on('end', () => {
                if (fs.existsSync(tempPcm)) {
                   fs.unlinkSync(tempPcm); // Clean up crudo
                }
                resolve(outputPath);
            })
            .on('error', (err) => {
                if (fs.existsSync(tempPcm)) {
                   fs.unlinkSync(tempPcm); // Clean up crudo on failure
                }
                reject(err);
            })
            .run();
    });
}
