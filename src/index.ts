import fs from "fs";
import path from "path";
import * as dotenv from "dotenv";

import { collectNews } from "./collect/rss_parser";
import { generateScript, PodcastScript, translateToQuechua } from "./brain/script_generator";
import { generateAudioQueue } from "./voice/audio_manager";
import { mergeAudios, sanityCheck } from "./output/ffmpeg_merger";

dotenv.config();

function initializeTempDirectories() {
    const tempEsPath = path.resolve(process.cwd(), "temp", "es");
    const tempQuPath = path.resolve(process.cwd(), "temp", "qu");
    const tempNativeEsPath = path.resolve(process.cwd(), "temp", "native-es");
    const outputDirPath = path.resolve(process.cwd(), "output");
    
    [tempEsPath, tempQuPath, tempNativeEsPath, outputDirPath].forEach(dir => {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
    });
}

async function main() {
  const args = process.argv.slice(2);
  const runWrite = args.length === 0 || args.includes("--write") || args.includes("--only-sources");
  const runOnlySources = args.includes("--only-sources");
  const runSpeakClassic = args.length === 0 || args.includes("--speak-classic");
  const runSpeakTts = args.length === 0 || args.includes("--speak-tts");

  const timestamp = new Date().toLocaleString("es-PE", { 
      timeZone: "America/Lima", hour12: false,
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit"
  }).replace(/[\/ :,]/g, '-').replace(/-+/g, '-');
  console.log("=====================================");
  console.log("📻 Iniciando pipeline Radio San Miguel: NoticIA (Dynamic & Timestamped) 📻");
  console.log("=====================================\n");
  
  // Setup inicial
  initializeTempDirectories();
  console.log("-> Directorios temporales asegurados (temp/es, temp/qu, temp/native-es).");

  let podcastScript: PodcastScript;
  const scriptBridgePath = path.resolve("output", `latest_script.json`);

  // ============================================
  // FASE A: REDACCIÓN (HARVESTER + CEREBRO)
  // ============================================
  if (runWrite) {
      // 1. Ingesta (Collection)
      const { massiveNews, baseNews } = await collectNews();
      
      if (baseNews.length === 0) {
          console.warn("⚠️ No se encontraron noticias recientes en los Feeds asumiendo <24 horas. Abortando pipeline.");
          process.exit(0);
      }

  // ==> NUEVA FUNCIÓN: MEGA-EXPORTACIÓN NOTEBOOK LM <==
  console.log("\n-> Empaquetando Documento Maestro para Google NotebookLM...");
  const notebookLmDocument = massiveNews.map((n, i) => 
      `NOTICIA #${i+1}\n[TITULAR]: ${n.titulo}\n[FUENTE]: ${n.fuente}\n[FECHA]: ${n.fecha}\n[RESUMEN]: ${n.resumen}\n---`
  ).join('\n\n');
  const notebookLmPath = path.resolve("output", `Fuentes_Master_NotebookLM_ES_${timestamp}.txt`);
  fs.writeFileSync(notebookLmPath, notebookLmDocument, "utf-8");
  console.log(`✅ ¡Megadocumento creado con ${massiveNews.length} artículos listos para la IA! Ruta: ${notebookLmPath}\n`);

  try {
      console.log("-> 🗣️ [Traducir] Generando equivalente en Quechua del documento maestro...");
      const notebookLmQuechua = await translateToQuechua(notebookLmDocument);
      const notebookLmQuechuaPath = path.resolve("output", `Fuentes_Master_NotebookLM_QU_${timestamp}.txt`);
      fs.writeFileSync(notebookLmQuechuaPath, notebookLmQuechua, "utf-8");
      console.log(`✅ ¡Megadocumento en Quechua creado exitosamente! Ruta: ${notebookLmQuechuaPath}\n`);
  } catch (error) {
      console.error("❌ Falló la traducción de fuentes a Quechua:", (error as Error).message);
  }

  const news = baseNews;

  if (runOnlySources) {
      console.log("\n✅ [MODO SOLO FUENTES] Se ha exportado la documentación de NotebookLM (Español y Quechua). Abortando el resto del pipeline.");
      process.exit(0);
  }
  
  // 2. Cerebro (Prompting y Generación)
  try {
     console.log("-> Transfiriendo información contextual al Cerebro Dinámico...");
     podcastScript = await generateScript(news);
  } catch (err) {
     console.error("❌ Falló la generación de los guiones base:", err);
     process.exit(1);
  }
      // Volcar a formato texto para lectura humana
      const scriptTextPath = path.resolve("output", `radiosanmiguel_noticia_${timestamp}.txt`);
      let textOutput = `=====================================\n📻 GUION: Radio San Miguel - NoticIA 📻\nFecha: ${timestamp}\n=====================================\n\n`;
      textOutput += `--- DIÁLOGO EN ESPAÑOL ---\n`;
      podcastScript.spanish_script.forEach(turn => {
          textOutput += `[${turn.speaker.toUpperCase()}]: ${turn.text}\n\n`;
      });
      textOutput += `\n--- DIÁLOGO EN QUECHUA ---\n`;
      podcastScript.quechua_script.forEach(turn => {
          textOutput += `[${turn.speaker.toUpperCase()}]: ${turn.text}\n\n`;
      });
      fs.writeFileSync(scriptTextPath, textOutput, "utf-8");
      console.log(`-> Guion en texto exportado satisfactoriamente: ${scriptTextPath}`);

      // Puente JSON local para desacoplamiento
      fs.writeFileSync(scriptBridgePath, JSON.stringify(podcastScript, null, 2), "utf-8");
      
      if (!runSpeakClassic && !runSpeakTts) {
          console.log(`\n✅ [MODO REDACCIÓN] Fase 1 concluida exitosamente. Puente JSON guardado en: ${scriptBridgePath}`);
          process.exit(0);
      }
  } else {
      // ============================================
      // FASE B: CARGA LOCAL (Bypass de Redacción)
      // ============================================
      console.log("\n-> Iniciando en MODO EXCLUSIVO DE AUDIO. Saltando recolección de noticias...");
      if (!fs.existsSync(scriptBridgePath)) {
          console.error(`❌ [ERROR] ¡No existe un guion previo en ${scriptBridgePath}! Ejecuta 'npm run write' primero.`);
          process.exit(1);
      }
      podcastScript = JSON.parse(fs.readFileSync(scriptBridgePath, "utf-8"));
      console.log(`✓ Puente JSON leído con éxito. Inyectando audios a los sintetizadores...`);
  }

  // ============================================
  // PISTAS CLÁSICAS O SEGMENTADAS (GOOGLE & AZURE)
  // ============================================
  if (runSpeakClassic) {
      console.log("\n--- FASE: AUDIO ESPAÑOL ---");
      try {
          const esAudioPaths = await generateAudioQueue(podcastScript.spanish_script, "es");
          if (esAudioPaths.length > 0) {
              const finalEsPath = await mergeAudios(esAudioPaths, path.resolve("output", `radiosanmiguel_noticia_es_${timestamp}.mp3`));
              await sanityCheck(finalEsPath);
              console.log(`✅ Podcast Español concluido exitosamente: ${finalEsPath}`);
          }
      } catch (error) {
          console.error("❌ Error CRÍTICO generando el podcast en Español:", (error as Error).message);
      }

      console.log("\n--- FASE: AUDIO QUECHUA ---");
      try {
          const quAudioPaths = await generateAudioQueue(podcastScript.quechua_script, "qu");
          if (quAudioPaths.length > 0) {
              const finalQuPath = await mergeAudios(quAudioPaths, path.resolve("output", `radiosanmiguel_noticia_qu_${timestamp}.mp3`));
              await sanityCheck(finalQuPath);
              console.log(`✅ Podcast Quechua concluido exitosamente: ${finalQuPath}`);
          }
      } catch (error) {
          console.warn("⚠️ Advertencia (Graceful Degradation): Fallo generando el podcast en Quechua.");
      }
  } else {
      console.log("\n-> ⏭️ Saltando Fase Clásica (Google/Azure) por directiva del CLI.");
  }

  // ============================================
  // PISTA NATIVA EXPERIMENTAL
  // ============================================
  if (runSpeakTts) {
      console.log("\n--- FASE: AUDIO ESPAÑOL NATIVO (GEMINI TTS) ---");
      try {
          const nativeEsAudioPaths = await generateAudioQueue(podcastScript.spanish_script, "native-es");
          if (nativeEsAudioPaths.length > 0) {
              const finalNativeEsPath = await mergeAudios(nativeEsAudioPaths, path.resolve("output", `radiosanmiguel_noticia_es_native_${timestamp}.mp3`));
              await sanityCheck(finalNativeEsPath);
              console.log(`✅ Podcast Español NATIVO concluido exitosamente: ${finalNativeEsPath}`);
          } else {
              console.warn("⚠️ No se generaron suficientes piezas nativas para empaquetar.");
          }
      } catch (error) {
          console.error("❌ Falló la síntesis de Audio Nativo de Gemini:", (error as Error).message);
      }
  } else {
      console.log("\n-> ⏭️ Saltando Fase Nativa (Gemini TTS) por directiva del CLI.");
  }

  console.log("\n-> Pipeline de Radio San Miguel finalizado por completo.");
}

// Ejecución
main().catch(console.error);
