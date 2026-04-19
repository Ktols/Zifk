"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const google_tts_1 = require("./src/voice/google_tts");
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
async function runTest() {
    console.log("Iniciando prueba de Google TTS...");
    try {
        const text = "¡Allinllachu Emmanuel! Probando el motor de voz de Willakuy AI";
        // Ensure temp es directory exists for the test output
        const tempEsPath = path_1.default.resolve(process.cwd(), "temp", "es");
        if (!fs_1.default.existsSync(tempEsPath)) {
            fs_1.default.mkdirSync(tempEsPath, { recursive: true });
        }
        const outputPath = path_1.default.resolve(tempEsPath, "test_mateo.mp3");
        await (0, google_tts_1.generateGoogleTTS)(text, "Mateo", outputPath);
        console.log("✅ Prueba completada con éxito. Archivo generado en:", outputPath);
    }
    catch (error) {
        console.error("❌ Error durante la prueba de Google TTS:", error);
    }
}
runTest();
//# sourceMappingURL=test-google.js.map