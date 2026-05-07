import { spawn } from "child_process";
import path from "path";

export interface NotebookLMResult {
    success: boolean;
    notebook_id?: string;
    output_path?: string;
    error?: string;
}

/**
 * Ejecuta el script Python de notebooklm-py para:
 * 1. Crear un notebook
 * 2. Subir el documento maestro como fuente
 * 3. Generar Audio Overview con el prompt personalizado
 * 4. Descargar el MP3 resultante
 */
export function runNotebookLM(
    sourcePath: string,
    promptPath: string,
    outputPath: string,
    lang: string = "es",
    notebookName: string = "Zifk Noticiero"
): Promise<NotebookLMResult> {
    return new Promise((resolve, reject) => {
        const scriptPath = path.resolve(__dirname, "..", "notebooklm", "upload_and_generate.py");

        const args = [
            scriptPath,
            sourcePath,
            promptPath,
            outputPath,
            "--lang", lang,
            "--name", notebookName,
        ];

        console.log(`[NotebookLM Bridge] Ejecutando: py ${args.join(" ")}`);

        const proc = spawn("py", args, {
            stdio: ["ignore", "pipe", "pipe"],
            cwd: process.cwd(),
        });

        let stdout = "";
        let stderr = "";

        proc.stdout.on("data", (data: Buffer) => {
            stdout += data.toString();
        });

        proc.stderr.on("data", (data: Buffer) => {
            const line = data.toString().trim();
            if (line) {
                console.log(line);
            }
            stderr += line + "\n";
        });

        proc.on("close", (code) => {
            if (code !== 0) {
                const errorMsg = `notebooklm-py terminó con código ${code}. ${stderr}`;
                console.error(`[NotebookLM Bridge] ❌ ${errorMsg}`);
                resolve({ success: false, error: errorMsg });
                return;
            }

            try {
                // El script imprime el resultado JSON en stdout
                const jsonLine = stdout.trim().split("\n").pop() || "";
                const result: NotebookLMResult = JSON.parse(jsonLine);
                resolve(result);
            } catch {
                resolve({
                    success: false,
                    error: `No se pudo parsear la respuesta de notebooklm-py: ${stdout}`,
                });
            }
        });

        proc.on("error", (err) => {
            reject(new Error(`No se pudo ejecutar Python (py): ${err.message}. ¿Está instalado Python?`));
        });
    });
}
