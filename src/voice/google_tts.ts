import textToSpeech from '@google-cloud/text-to-speech';
import fs from 'fs';
import util from 'util';
import path from 'path';

// Instantiates a client apuntando explícitamente al archivo de la llave
const client = new textToSpeech.TextToSpeechClient({
    keyFilename: path.resolve(process.cwd(), "google-key.json")
});

export async function generateGoogleTTS(text: string, speaker: "Mateo" | "Yanira", outputPath: string): Promise<string> {
    // Mapeo solicitado en requerimientos
    const voiceName = speaker === "Mateo" ? "es-US-Standard-B" : "es-US-Neural2-A";
    const gender = speaker === "Mateo" ? "MALE" : "FEMALE";

    const request = {
        input: { text: text },
        // Select the language and SSML voice gender
        voice: { languageCode: 'es-US', name: voiceName, ssmlGender: gender as any },
        // select the type of audio encoding
        audioConfig: { audioEncoding: 'MP3' as any },
    };

    // Realiza la petición de Text to Speech
    const [response] = await client.synthesizeSpeech(request);
    
    // Escribir el audio resultante (binario) al folder temporal
    const writeFile = util.promisify(fs.writeFile);
    if (!response.audioContent) {
        throw new Error("No se recibió contenido de audio desde Google TTS.");
    }
    
    await writeFile(outputPath, response.audioContent as Uint8Array, 'binary');
    
    return outputPath;
}
