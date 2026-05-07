import fs from "fs";
import path from "path";

const CONFIG_PATH = path.resolve(process.cwd(), "config.json");

// ============================================
// Interfaces
// ============================================
export interface SpeakerConfig {
    id: string;
    name: string;
    gender: "female" | "male";
    personality: string;
}

export interface FeedConfig {
    name: string;
    url: string;
    enabled: boolean;
    priority: "regional" | "national" | "international";
}

export interface ProgramProfile {
    id: string;
    name: string;
    radio: string;
    slogan: string;
    audience: string;
    language: string;
    speakers: SpeakerConfig[];
    feeds: FeedConfig[];
    createdAt: string;
}

export interface ZifkConfig {
    geminiApiKey: string;
    programs: ProgramProfile[];
}

// ============================================
// Helpers
// ============================================
function slugify(text: string): string {
    return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 40) || "programa";
}

export function generateProgramId(name: string): string {
    return slugify(name) + "-" + Date.now().toString(36);
}

// ============================================
// Load / Save with auto-migration
// ============================================
export function loadConfig(): ZifkConfig {
    if (!fs.existsSync(CONFIG_PATH)) {
        const defaults = getDefaults();
        saveConfig(defaults);
        return defaults;
    }
    const raw = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));

    // Auto-migrate old format (has "program" singular key)
    if (raw.program && !raw.programs) {
        console.log("[Config] Migrando formato antiguo a multi-programa...");
        const migrated: ZifkConfig = {
            geminiApiKey: raw.geminiApiKey || "",
            programs: [{
                id: generateProgramId(raw.program.name || "programa"),
                name: raw.program.name || "Mi Programa",
                radio: raw.program.radio || "",
                slogan: raw.program.slogan || "",
                audience: raw.program.audience || "",
                language: raw.program.language || "es-419",
                speakers: raw.speakers || [],
                feeds: raw.feeds || [],
                createdAt: new Date().toISOString(),
            }]
        };
        saveConfig(migrated);
        return migrated;
    }

    return raw as ZifkConfig;
}

export function saveConfig(config: ZifkConfig): void {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 4), "utf-8");
}

export function getProgramById(config: ZifkConfig, id: string): ProgramProfile | undefined {
    return config.programs.find(p => p.id === id);
}

// ============================================
// Prompt Builder
// ============================================
export function buildPromptFromProgram(program: ProgramProfile): string {
    const speakerA = program.speakers[0] ?? { name: "Presentador 1", gender: "female", personality: "Profesional y formal" };
    const speakerB = program.speakers[1] ?? { name: "Presentador 2", gender: "male", personality: "Dinamico y empatico" };

    const genderA = (speakerA as any).gender === "male" ? "MASCULINA" : "FEMENINA";
    const genderB = (speakerB as any).gender === "male" ? "MASCULINA" : "FEMENINA";

    return `IDIOMA OBLIGATORIO: Todo el programa debe ser 100% en ESPAÑOL LATINOAMERICANO. Está TERMINANTEMENTE PROHIBIDO usar palabras, frases o saludos en inglés. Ni "Good morning", ni "Breaking news", ni ninguna expresión anglosajona.

ASIGNACIÓN ESTRICTA DE VOCES — LEE CON ATENCIÓN:
- La VOZ ${genderA} se llama "${speakerA.name}". Si tienes voz ${genderA.toLowerCase()}, tu nombre es ${speakerA.name}. NUNCA digas otro nombre.
- La VOZ ${genderB} se llama "${speakerB.name}". Si tienes voz ${genderB.toLowerCase()}, tu nombre es ${speakerB.name}. NUNCA digas otro nombre.
- REGLA INQUEBRANTABLE: Tu nombre corresponde ÚNICAMENTE a tu tipo de voz. La voz ${genderA.toLowerCase()} SIEMPRE es ${speakerA.name}. La voz ${genderB.toLowerCase()} SIEMPRE es ${speakerB.name}. Está PROHIBIDO intercambiar nombres.

HAY DOS PRESENTADORES EN ESTE PROGRAMA: ${speakerA.name} (voz ${genderA.toLowerCase()}) y ${speakerB.name} (voz ${genderB.toLowerCase()}). IMPORTANTE: Cada presentador DEBE decir su PROPIO nombre al presentarse. NUNCA digan el nombre del otro como si fuera el suyo.

APERTURA OBLIGATORIA DEL PROGRAMA: El programa SIEMPRE debe iniciar así:
1. La voz ${genderA.toLowerCase()} dice: "Buenos días, soy ${speakerA.name}, y esto es ${program.name} por ${program.radio}, ${program.slogan}".
2. La voz ${genderB.toLowerCase()} dice: "Y yo soy ${speakerB.name}, bienvenidos queridos oyentes de ${program.audience}".
3. Luego comienzan las noticias.

Actúen como los presentadores de "${program.name}" de "${program.radio}" (eslogan: "${program.slogan}"). Transmiten DIRECTAMENTE PARA ${program.audience.toUpperCase()}, dirigiéndose con calidez a los oyentes.

PERSONALIDADES DE CADA PRESENTADOR (respeten estrictamente):
- ${speakerA.name.toUpperCase()}: ${speakerA.personality}
- ${speakerB.name.toUpperCase()}: ${speakerB.personality}

REGLAS ESTRICTAS DE FORMATO Y ESTILO:
1. Recorrido Ágil: Hagan un recorrido rápido por TODAS las fuentes. ESTÁ TOTALMENTE PROHIBIDO estancarse debatiendo una sola noticia.
2. Dinámica rápida: Lean el titular, ${speakerA.name} da el dato duro o contexto técnico, ${speakerB.name} hace un comentario empático muy breve (1 o 2 oraciones máximo) y pasan INMEDIATAMENTE a la siguiente noticia.
3. Prioridad: Den prioridad absoluta a las noticias más relevantes para la audiencia.
4. Prohibiciones Absolutas: Mantengan un ALTO PRESTIGIO Y MÁXIMA FORMALIDAD. Cero lenguaje callejero. Cero inglés.

CIERRE DEL PROGRAMA: Cierren mencionando nuevamente "${program.name}", "${program.radio}" y despídanse con calidez.`;
}

// ============================================
// Defaults
// ============================================
function getDefaults(): ZifkConfig {
    return {
        geminiApiKey: "",
        programs: [{
            id: "noti-ia-default",
            name: "Noti IA",
            radio: "Radio San Miguel Ayacucho",
            slogan: "Tu radio con las noticias a la vanguardia",
            audience: "todo el interior del Perú",
            language: "es-419",
            speakers: [
                { id: "yanira", name: "Yanira", gender: "female", personality: "Analítica, formal y estructurada. Voz de la información dura. Aporta contexto, cifras, datos empíricos y detalles técnicos con total seriedad." },
                { id: "mateo", name: "Mateo", gender: "male", personality: "Entusiasta, empático y carismático. Dinamiza el programa haciéndole preguntas a su compañera. Aporta calor humano y comentarios cercanos al ciudadano. Dirige las transiciones con educación." }
            ],
            feeds: [
                { name: "Andina (Provincias)", url: "https://andina.pe/agencia/rss.aspx?idCategoria=4", enabled: true, priority: "regional" },
                { name: "RPP (Lima/Regiones)", url: "https://rpp.pe/feed/peru", enabled: true, priority: "regional" },
                { name: "Google News (Perú)", url: "https://news.google.com/rss?hl=es-PE&gl=PE&ceid=PE:es-419", enabled: true, priority: "national" },
                { name: "BBC Mundo", url: "https://feeds.bbci.co.uk/mundo/rss.xml", enabled: true, priority: "international" }
            ],
            createdAt: new Date().toISOString(),
        }]
    };
}
