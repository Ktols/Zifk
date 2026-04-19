import ffmpeg from 'fluent-ffmpeg';
import fs from 'fs';
import util from 'util';
import ffmpegStatic from 'ffmpeg-static';

if (ffmpegStatic) {
    ffmpeg.setFfmpegPath(ffmpegStatic);
}

export async function sanityCheck(filePath: string): Promise<void> {
    console.log(`[SanityCheck] Evaluando el archivo compilado: ${filePath}`);
    
    // 1. Archivo existe y pesa más de 0 KB
    if (!fs.existsSync(filePath)) {
        throw new Error(`Sanity Check Failed: El archivo no se generó. ${filePath}`);
    }
    const stats = fs.statSync(filePath);
    if (stats.size === 0) {
        throw new Error(`Sanity Check Failed: El archivo resultante pesa 0 KB. ${filePath}`);
    }

    // 2. Comprobar duración con ffprobe (req. ffprobe en PATH / OS)
    const getDuration = util.promisify(ffmpeg.ffprobe);
    try {
        const meta: any = await getDuration(filePath);
        const duration = meta.format.duration || 0;
        
        if (duration < 30) {
            console.warn(`[SanityCheck] ⚠️ Warning: El podcast dura menos de 30 segundos (${Number(duration).toFixed(2)}s). Es posible que el contenido esté incompleto o haya pocas noticias seleccionadas.`);
        } else {
            console.log(`[SanityCheck] ✓ Duración válida confirmada: ${Number(duration).toFixed(2)}s.`);
        }
    } catch (err) {
        console.warn("[SanityCheck] ⚠️ No se pudo certificar la duración estricta porque 'ffprobe' no está disponible en el entorno, pero su tamaño (kilobytes) ha sido validado.");
    }
}

export async function mergeAudios(paths: string[], outPath: string): Promise<string> {
    return new Promise((resolve, reject) => {
        if (!paths || paths.length === 0) {
            return reject(new Error("No existen archivos de audio para concatenar."));
        }

        console.log(`[Output] Ensamblando ${paths.length} clips con silencio interpolado (400ms)...`);
        const command = ffmpeg();
        
        // Agregar los paths como inputs serialmente
        paths.forEach(p => command.input(p));

        // Filtro complejo:
        // Por cada pista, agregamos 400ms silenciosos al pre-fader ('adelay=400|400') excepto a la 1ra pista
        const filterChunks: string[] = [];
        paths.forEach((_, idx) => {
            if (idx > 0) {
                // delay de 400 milisengundos a ambos canales L y R (400|400)
                filterChunks.push(`[${idx}:a]adelay=400|400[aud${idx}]`);
            }
        });
        
        const concatInputs = paths.map((_, idx) => {
            if (idx === 0) return `[0:a]`;
            return `[aud${idx}]`;
        }).join('');
        
        // Concatenamos `n` streams resultantes -> un output track [outa] 
        // a=1 (un track audio), v=0 (nada de video)
        filterChunks.push(`${concatInputs}concat=n=${paths.length}:v=0:a=1[outa]`);
        
        command
          .complexFilter(filterChunks)
          .outputOptions(['-map [outa]'])
          .save(outPath)
          .on("end", () => {
              console.log(`[Output] ✓ FFMPEG Ensamblaje exitoso generado en: ${outPath}`);
              resolve(outPath);
          })
          .on("error", (err) => {
              reject(new Error("Ocurrió un grave error procesando FFMPEG: " + err.message));
          });
    });
}
