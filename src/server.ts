import express from "express";
import path from "path";
import fs from "fs";
import * as dotenv from "dotenv";
import { loadConfig, saveConfig, buildPromptFromProgram, getProgramById, generateProgramId, ZifkConfig, ProgramProfile, FeedConfig, SpeakerConfig } from "./config";
import { collectNewsFromFeeds } from "./collect/rss_parser";
import { runNotebookLM } from "./notebooklm/notebooklm_bridge";
import { spawn } from "child_process";

dotenv.config();

const app = express();
const PORT = 3000;
const DATA_DIR = path.resolve(process.cwd(), "data");

app.use(express.json());
app.use(express.static(path.resolve(__dirname, "..", "public"), { etag: false, maxAge: 0 }));
app.use("/data", express.static(DATA_DIR));

// ============================================
// Pipeline State
// ============================================
interface PipelineStatus {
    running: boolean;
    step: string;
    progress: number;
    logs: string[];
    programId?: string;
    programName?: string;
    startedAt?: number;
    result?: { success: boolean; audioPath?: string; duration?: string; generationTime?: string; error?: string };
}

let pipelineStatus: PipelineStatus = { running: false, step: "idle", progress: 0, logs: [] };

function log(msg: string) {
    pipelineStatus.logs.push(`${new Date().toLocaleTimeString("es-PE")} | ${msg}`);
}

function getNlmAuthPath(): string {
    return path.resolve(process.env.USERPROFILE || process.env.HOME || "", ".notebooklm", "storage_state.json");
}

function isNlmSessionValid(): boolean {
    const authPath = getNlmAuthPath();
    if (!fs.existsSync(authPath)) return false;
    // If a recent generation flagged auth as expired, report false
    if ((global as any).__nlmAuthExpired) return false;
    try {
        const stat = fs.statSync(authPath);
        // If the file hasn't been modified in over 7 days, likely expired
        const daysSinceModified = (Date.now() - stat.mtimeMs) / (1000 * 60 * 60 * 24);
        if (daysSinceModified > 7) return false;
        return true;
    } catch {
        return false;
    }
}

// ============================================
// API: Global Config (credentials only)
// ============================================
app.get("/api/config", (_req, res) => {
    const config = loadConfig();
    if (!config.geminiApiKey && process.env.GEMINI_API_KEY) {
        config.geminiApiKey = process.env.GEMINI_API_KEY;
    }
    res.json({
        geminiApiKey: config.geminiApiKey,
        notebookLmAuthenticated: isNlmSessionValid(),
        programs: config.programs,
    });
});

app.put("/api/config", (req, res) => {
    const config = loadConfig();
    if (req.body.geminiApiKey !== undefined) {
        config.geminiApiKey = req.body.geminiApiKey;
        process.env.GEMINI_API_KEY = config.geminiApiKey;
        const envPath = path.resolve(process.cwd(), ".env");
        let envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf-8") : "";
        if (envContent.includes("GEMINI_API_KEY")) {
            envContent = envContent.replace(/GEMINI_API_KEY=.*/, `GEMINI_API_KEY="${config.geminiApiKey}"`);
        } else {
            envContent += `\nGEMINI_API_KEY="${config.geminiApiKey}"\n`;
        }
        fs.writeFileSync(envPath, envContent, "utf-8");
    }
    saveConfig(config);
    res.json({ success: true });
});

// ============================================
// API: Programs CRUD
// ============================================
app.get("/api/programs", (_req, res) => {
    const config = loadConfig();
    res.json(config.programs);
});

app.get("/api/programs/:id", (req, res) => {
    const config = loadConfig();
    const program = getProgramById(config, req.params.id);
    if (!program) return res.status(404).json({ error: "Programa no encontrado" });
    res.json(program);
});

app.post("/api/programs", (req, res) => {
    const config = loadConfig();
    const body = req.body;
    const program: ProgramProfile = {
        id: generateProgramId(body.name || "programa"),
        name: body.name || "Nuevo Programa",
        radio: body.radio || "",
        slogan: body.slogan || "",
        audience: body.audience || "",
        language: body.language || "es-419",
        speakers: body.speakers || [],
        feeds: body.feeds || [],
        createdAt: new Date().toISOString(),
    };
    config.programs.push(program);
    saveConfig(config);
    res.json(program);
});

app.put("/api/programs/:id", (req, res) => {
    const config = loadConfig();
    const idx = config.programs.findIndex(p => p.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: "Programa no encontrado" });
    const ex = config.programs[idx]!;
    config.programs[idx] = {
        id: ex.id,
        createdAt: ex.createdAt,
        name: req.body.name ?? ex.name,
        radio: req.body.radio ?? ex.radio,
        slogan: req.body.slogan ?? ex.slogan,
        audience: req.body.audience ?? ex.audience,
        language: req.body.language ?? ex.language,
        speakers: req.body.speakers ?? ex.speakers,
        feeds: req.body.feeds ?? ex.feeds,
    };
    saveConfig(config);
    res.json(config.programs[idx]);
});

app.delete("/api/programs/:id", (req, res) => {
    const config = loadConfig();
    const idx = config.programs.findIndex(p => p.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: "Programa no encontrado" });
    config.programs.splice(idx, 1);
    saveConfig(config);
    res.json({ success: true });
});

// Program feeds
app.post("/api/programs/:id/feeds", (req, res) => {
    const config = loadConfig();
    const program = getProgramById(config, req.params.id);
    if (!program) return res.status(404).json({ error: "Programa no encontrado" });
    const feed: FeedConfig = { name: req.body.name, url: req.body.url, enabled: true, priority: req.body.priority || "national" };
    if (!feed.name || !feed.url) return res.status(400).json({ error: "Nombre y URL requeridos" });
    program.feeds.push(feed);
    saveConfig(config);
    res.json(program);
});

app.delete("/api/programs/:id/feeds/:idx", (req, res) => {
    const config = loadConfig();
    const program = getProgramById(config, req.params.id);
    if (!program) return res.status(404).json({ error: "Programa no encontrado" });
    const idx = parseInt(req.params.idx);
    if (idx < 0 || idx >= program.feeds.length) return res.status(404).json({ error: "Feed no encontrado" });
    program.feeds.splice(idx, 1);
    saveConfig(config);
    res.json(program);
});

// ============================================
// API: NotebookLM Login
// ============================================
let loginProcess: ReturnType<typeof spawn> | null = null;

app.post("/api/notebooklm/login", (_req, res) => {
    if (loginProcess) {
        return res.json({ status: "already_open", message: "Navegador ya abierto. Completa el login y presiona Confirmar." });
    }
    const script = path.resolve(__dirname, "notebooklm", "login_chrome.py");
    loginProcess = spawn("py", [script], { stdio: ["pipe", "pipe", "pipe"] });
    loginProcess.on("close", () => { loginProcess = null; });
    loginProcess.stdout?.on("data", (d: Buffer) => console.log(`[NLM] ${d.toString().trim()}`));
    loginProcess.stderr?.on("data", (d: Buffer) => console.error(`[NLM ERR] ${d.toString().trim()}`));
    res.json({ status: "opened", message: "Navegador abierto. Inicia sesion y presiona Confirmar." });
});

app.post("/api/notebooklm/confirm", (_req, res) => {
    if (!loginProcess?.stdin) return res.status(400).json({ error: "No hay proceso de login activo." });
    loginProcess.stdin.write("\n");
    loginProcess.stdin.end();
    setTimeout(() => {
        const ok = fs.existsSync(getNlmAuthPath());
        if (ok) (global as any).__nlmAuthExpired = false;
        res.json({ success: ok, message: ok ? "Sesion guardada." : "Error guardando sesion." });
    }, 3000);
});

// ============================================
// API: RSS Finder (Gemini-powered)
// ============================================
app.post("/api/rss-finder", async (req, res) => {
    const { query } = req.body;
    if (!query || typeof query !== "string") return res.status(400).json({ error: "Debes ingresar un tema de busqueda" });

    const config = loadConfig();
    const apiKey = config.geminiApiKey || process.env.GEMINI_API_KEY;
    if (!apiKey) return res.status(400).json({ error: "Configura tu API Key de Gemini primero" });

    const prompt = `Eres un experto en fuentes de noticias y feeds RSS. El usuario quiere crear un programa de radio sobre: "${query}".

Sugiere entre 5 y 10 feeds RSS reales y funcionales que sean relevantes para ese tema. Prioriza feeds en español si el tema es de Latinoamerica o España.

IMPORTANTE: Solo sugiere URLs de feeds RSS que sean reales y probablemente funcionales (de medios conocidos, blogs reconocidos, o fuentes oficiales). No inventes URLs.

Responde SOLO con un JSON array (sin markdown, sin explicaciones), donde cada elemento tiene:
- "name": nombre descriptivo del feed
- "url": URL completa del feed RSS/Atom
- "description": breve descripcion de que contiene (1 linea)
- "priority": "regional", "national" o "international"

Ejemplo de formato:
[{"name":"RPP Noticias","url":"https://rpp.pe/feed","description":"Noticias generales de Peru","priority":"national"}]`;

    try {
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
        const body = {
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.7, maxOutputTokens: 2048 }
        };

        const response = await fetch(apiUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            return res.status(500).json({ error: err.error?.message || `Error de Gemini (${response.status})` });
        }

        const data = await response.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
        
        // Parse JSON from response (handle possible markdown wrapping)
        let feeds: any[] = [];
        const jsonMatch = text.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
            try {
                feeds = JSON.parse(jsonMatch[0]);
            } catch {
                return res.status(500).json({ error: "No se pudo parsear la respuesta de Gemini" });
            }
        }

        // Validate structure
        feeds = feeds.filter(f => f && f.name && f.url && f.url.startsWith("http")).slice(0, 15);

        // Validate each feed URL is actually RSS/Atom XML
        const validated: any[] = [];
        const validationPromises = feeds.map(async (f) => {
            try {
                const ctrl = new AbortController();
                const timeout = setTimeout(() => ctrl.abort(), 5000);
                const r = await fetch(f.url, { 
                    signal: ctrl.signal, 
                    headers: { 'User-Agent': 'Zifk/1.0 RSS Reader' } 
                });
                clearTimeout(timeout);
                if (!r.ok) return null;
                const contentType = r.headers.get('content-type') || '';
                const body = await r.text();
                const first500 = body.slice(0, 500).toLowerCase();
                // Check if it's RSS/Atom XML
                const isRSS = contentType.includes('xml') || 
                              contentType.includes('rss') || 
                              contentType.includes('atom') ||
                              first500.includes('<rss') || 
                              first500.includes('<feed') || 
                              first500.includes('<channel');
                if (isRSS) return { ...f, verified: true };
                return null;
            } catch {
                return null;
            }
        });

        const results = await Promise.all(validationPromises);
        for (const r of results) {
            if (r) validated.push(r);
        }

        res.json({ feeds: validated, totalSuggested: feeds.length, totalValid: validated.length });
    } catch (err: any) {
        res.status(500).json({ error: err.message || "Error al consultar Gemini" });
    }
});

// ============================================
// API: Generate
// ============================================
app.post("/api/generate", async (req, res) => {
    if (pipelineStatus.running) return res.status(409).json({ error: "Ya hay una generacion en curso" });
    const { programId } = req.body;
    if (!programId) return res.status(400).json({ error: "Debes seleccionar un programa" });
    const config = loadConfig();
    const program = getProgramById(config, programId);
    if (!program) return res.status(404).json({ error: "Programa no encontrado" });

    pipelineStatus = { running: true, step: "collecting", progress: 0, logs: [], programId, programName: program.name, startedAt: Date.now() };
    res.json({ message: "Pipeline iniciado", programName: program.name });

    runPipeline(program).catch(err => {
        log(`Error fatal: ${err.message}`);
        pipelineStatus.running = false;
        pipelineStatus.step = "error";
        pipelineStatus.result = { success: false, error: err.message };
    });
});

app.get("/api/status", (_req, res) => res.json(pipelineStatus));

// ============================================
// API: History (grouped by program then date)
// ============================================
app.get("/api/history", (_req, res) => {
    if (!fs.existsSync(DATA_DIR)) return res.json([]);
    const config = loadConfig();

    const programDirs = fs.readdirSync(DATA_DIR).filter(d => fs.statSync(path.join(DATA_DIR, d)).isDirectory());
    const history: any[] = [];

    for (const progSlug of programDirs) {
        const progDir = path.join(DATA_DIR, progSlug);
        const days = fs.readdirSync(progDir).filter(d => fs.statSync(path.join(progDir, d)).isDirectory()).sort((a, b) => b.localeCompare(a));

        const dayEntries = days.map(day => {
            const metaPath = path.join(progDir, day, "metadata.json");
            let entries: any[] = [];
            if (fs.existsSync(metaPath)) {
                entries = JSON.parse(fs.readFileSync(metaPath, "utf-8"));
            }
            return { date: day, entries };
        }).filter(d => d.entries.length > 0);

        if (dayEntries.length > 0) {
            const prog = config.programs.find(p => p.id === progSlug);
            history.push({
                programId: progSlug,
                programName: prog?.name || progSlug,
                days: dayEntries,
            });
        }
    }
    res.json(history);
});

// ============================================
// Pipeline
// ============================================
async function runPipeline(program: ProgramProfile) {
    const startTime = Date.now();
    const now = new Date();
    const dayFolder = now.toISOString().slice(0, 10);
    const timeStamp = now.toLocaleTimeString("es-PE", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" }).replace(/:/g, "-");
    const dayDir = path.join(DATA_DIR, program.id, dayFolder);
    fs.mkdirSync(dayDir, { recursive: true });

    // 1. Collect
    pipelineStatus.step = "collecting";
    pipelineStatus.progress = 10;
    log(`Programa: ${program.name}`);
    log("Recolectando noticias de feeds RSS...");

    const enabledFeeds = program.feeds.filter(f => f.enabled);
    const allNews = await collectNewsFromFeeds(enabledFeeds);

    if (allNews.length === 0) {
        log("No se encontraron noticias recientes.");
        pipelineStatus.running = false;
        pipelineStatus.step = "error";
        pipelineStatus.result = { success: false, error: "Sin noticias en los feeds" };
        return;
    }

    log(`${allNews.length} noticias de ${enabledFeeds.length} feeds.`);
    pipelineStatus.progress = 25;

    // 2. Package
    pipelineStatus.step = "packaging";
    log("Empaquetando documento maestro...");

    const doc = allNews.map((n, i) =>
        `NOTICIA #${i + 1}\n[TITULAR]: ${n.titulo}\n[FUENTE]: ${n.fuente}\n[FECHA]: ${n.fecha}\n[RESUMEN]: ${n.resumen}\n---`
    ).join('\n\n');

    const sourcePath = path.join(dayDir, `fuentes_${timeStamp}.txt`);
    fs.writeFileSync(sourcePath, doc, "utf-8");
    log(`Documento: ${allNews.length} articulos empaquetados.`);
    pipelineStatus.progress = 35;

    // 3. Build prompt
    const prompt = buildPromptFromProgram(program);
    const promptPath = path.join(dayDir, `prompt_${timeStamp}.txt`);
    fs.writeFileSync(promptPath, prompt, "utf-8");
    pipelineStatus.progress = 40;

    // 4. Generate audio
    pipelineStatus.step = "generating";
    pipelineStatus.progress = 45;
    log("Subiendo a NotebookLM y generando audio...");
    log("Esto puede tardar entre 5 y 15 minutos.");

    const audioFilename = `audio_${timeStamp}.mp3`;
    const audioPath = path.join(dayDir, audioFilename);

    const result = await runNotebookLM(sourcePath, promptPath, audioPath, program.language || "es-419", `${program.name} ${dayFolder} ${timeStamp}`);

    const endTime = Date.now();
    const generationTime = formatDuration(endTime - startTime);

    if (result.success) {
        pipelineStatus.progress = 95;
        log("Audio generado correctamente.");
        const audioDuration = getAudioDuration(audioPath);

        const metaPath = path.join(dayDir, "metadata.json");
        let metadata: any[] = [];
        if (fs.existsSync(metaPath)) metadata = JSON.parse(fs.readFileSync(metaPath, "utf-8"));
        metadata.push({
            time: timeStamp,
            sourcesFile: `fuentes_${timeStamp}.txt`,
            promptFile: `prompt_${timeStamp}.txt`,
            audioFile: audioFilename,
            programName: program.name,
            language: program.language,
            newsCount: allNews.length,
            audioDuration,
            generationTime,
            feedsUsed: enabledFeeds.map(f => f.name),
            speakers: program.speakers.map(s => s.name),
        });
        fs.writeFileSync(metaPath, JSON.stringify(metadata, null, 2), "utf-8");

        pipelineStatus.progress = 100;
        pipelineStatus.step = "done";
        log(`Completado. Duracion: ${audioDuration}. Tiempo: ${generationTime}`);
        pipelineStatus.result = { success: true, audioPath: `/data/${program.id}/${dayFolder}/${audioFilename}`, duration: audioDuration, generationTime };
    } else {
        pipelineStatus.step = "error";
        log(`Error: ${result.error}`);
        // Detectar expiración de sesión NotebookLM
        if (result.error && result.error.includes("Authentication expired")) {
            pipelineStatus.result = { success: false, error: result.error || "Error desconocido" };
            (pipelineStatus as any).notebookLmExpired = true;
            (global as any).__nlmAuthExpired = true;
        } else {
            pipelineStatus.result = { success: false, error: result.error || "Error desconocido" };
        }
    }
    pipelineStatus.running = false;
}

function formatDuration(ms: number): string {
    const s = Math.floor(ms / 1000); const m = Math.floor(s / 60);
    return m > 0 ? `${m}m ${s % 60}s` : `${s}s`;
}

function getAudioDuration(fp: string): string {
    try { const sz = fs.statSync(fp).size / (1024 * 1024); const mins = (sz * 8) / 128 * 60; return `~${Math.floor(mins)}m ${Math.round((mins % 1) * 60)}s`; } catch { return "?"; }
}

// ============================================
// Start
// ============================================
app.listen(PORT, () => {
    console.log(`\n  Zifk Server`);
    console.log(`  http://localhost:${PORT}\n`);
});
