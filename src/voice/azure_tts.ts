import * as sdk from "microsoft-cognitiveservices-speech-sdk";
import * as dotenv from "dotenv";

dotenv.config();

export async function generateAzureTTS(text: string, speaker: "Mateo" | "Yanira", outputPath: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const speechKey = process.env.AZURE_SPEECH_KEY;
        const speechRegion = process.env.AZURE_SPEECH_REGION;

        if (!speechKey || !speechRegion) {
            return reject(new Error("Faltan AZURE_SPEECH_KEY o AZURE_SPEECH_REGION en el .env"));
        }

        const speechConfig = sdk.SpeechConfig.fromSubscription(speechKey, speechRegion);
        const audioConfig = sdk.AudioConfig.fromAudioFileOutput(outputPath);
        
        const synthesizer = new sdk.SpeechSynthesizer(speechConfig, audioConfig);

        let ssml = "";
        
        const escapedText = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

        if (speaker === "Yanira") {
            ssml = `
<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="es-PE">
    <voice name="es-PE-CamilaNeural">
        <prosody pitch="0%" rate="1.0">
            ${escapedText}
        </prosody>
    </voice>
</speak>`;
        } else {
             // Mateo habla normal nativo AlexNeural
             ssml = `
<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="es-PE">
    <voice name="es-PE-AlexNeural">
        <prosody pitch="0%" rate="1.0">
            ${escapedText}
        </prosody>
    </voice>
</speak>`;
        }

        synthesizer.speakSsmlAsync(
            ssml,
            (result) => {
                // SynthesizingAudioCompleted representa código de éxito en Node Azure SDK
                if (result.reason === sdk.ResultReason.SynthesizingAudioCompleted) {
                    synthesizer.close();
                    resolve(outputPath);
                } else {
                    synthesizer.close();
                    reject(new Error("Síntesis en Azure Speech falló o fue cancelada: " + result.errorDetails));
                }
            },
            (error) => {
                synthesizer.close();
                reject(error);
            }
        );
    });
}
