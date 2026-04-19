import Parser from 'rss-parser';

const parser = new Parser();

export interface CleanNews {
    titulo: string;
    resumen: string;
    fecha: string;
    fuente: string;
}

// Utilidad para limpiar etiquetas html y espacios innecesarios
function cleanHTML(htmlStr: string | undefined): string {
    if (!htmlStr) return "";
    return htmlStr.replace(/<[^>]*>?/gm, '').trim();
}

export interface HarvesterResult {
    massiveNews: CleanNews[];
    baseNews: CleanNews[];
}

export async function collectNews(): Promise<HarvesterResult> {
    console.log("[Harvester] Iniciando recopilación masiva de feeds (Regionales, Nacionales e Internacionales)...");
    
    const feeds = [
        { name: "Andina (Provincias)", url: "https://andina.pe/agencia/rss.aspx?idCategoria=4" },
        { name: "RPP (Lima/Regiones)", url: "https://rpp.pe/feed/peru" },
        { name: "Google News (Perú)", url: "https://news.google.com/rss?hl=es-PE&gl=PE&ceid=PE:es-419" },
        { name: "BBC Mundo", url: "https://feeds.bbci.co.uk/mundo/rss.xml" }
    ];

    const allNews: CleanNews[] = [];
    const now = new Date();
    const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;

    // Resiliencia: Promise.allSettled evita que el fallo de un feed arrastre al otro
    const results = await Promise.allSettled(feeds.map(f => parser.parseURL(f.url)));

    results.forEach((promiseResult, index) => {
        const source = feeds[index]?.name || "Desconocido";

        if (promiseResult.status === 'fulfilled') {
            const feed = promiseResult.value;
            console.log(`[Harvester] ✓ Conexión exitosa. Feed descargado de ${source}.`);
            
            feed.items?.forEach(item => {
                let itemDate = item.pubDate ? new Date(item.pubDate) : new Date(item.isoDate || "");
                if (isNaN(itemDate.getTime())) {
                    itemDate = new Date(); // Fallback si no hay fecha válida
                }

                const diffTime = now.getTime() - itemDate.getTime();
                
                // Filtro 1: Rápida eliminación de noticias más antiguas que 24 horas
                if (diffTime <= TWENTY_FOUR_HOURS && diffTime >= 0) {
                    allNews.push({
                        titulo: cleanHTML(item.title),
                        resumen: cleanHTML(item.contentSnippet || item.content),
                        fecha: itemDate.toISOString(),
                        fuente: source
                    });
                }
            });
        } else {
            console.error(`[Harvester] ⚠️ Límite o Error de red conectando con el feed de ${source}:`, promiseResult.reason);
        }
    });

    // Filtro Masivo para NotebookLM (sin límites artificiales)
    allNews.sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());

    // Filtro Balanceado Local para la IA en Consola (Foco priorizado en Lima/Provincia)
    const regionalNews = allNews.filter(n => n.fuente.includes("Andina") || n.fuente.includes("RPP"));
    const worldNews = allNews.filter(n => !n.fuente.includes("Andina") && !n.fuente.includes("RPP"));
    
    // Cupos: Máximo 10 regionales, 5 globales para tener contexto sin perder el foco base
    const balancedLocal: CleanNews[] = [];
    balancedLocal.push(...regionalNews.slice(0, 10), ...worldNews.slice(0, 5));
    balancedLocal.sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());
    
    console.log(`[Harvester] Extraídas ${allNews.length} noticias totales para exportación masiva a NotebookLM.`);
    console.log(`[Harvester] Filtrado Final -> Reteniendo mix de ${balancedLocal.length} noticias locales para la IA.`);
    
    return { massiveNews: allNews, baseNews: balancedLocal };
}
