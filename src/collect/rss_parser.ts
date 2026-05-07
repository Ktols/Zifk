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

interface FeedInput {
    name: string;
    url: string;
    enabled?: boolean;
    priority?: string;
}

/**
 * Collect news from a list of configurable feeds.
 */
export async function collectNewsFromFeeds(feeds: FeedInput[]): Promise<CleanNews[]> {
    const allNews: CleanNews[] = [];
    const now = new Date();
    const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;

    const results = await Promise.allSettled(feeds.map(f => parser.parseURL(f.url)));

    results.forEach((promiseResult, index) => {
        const source = feeds[index]?.name || "Desconocido";

        if (promiseResult.status === 'fulfilled') {
            const feed = promiseResult.value;
            console.log(`[Harvester] + ${source} (${feed.items?.length || 0} items)`);

            feed.items?.forEach(item => {
                let itemDate = item.pubDate ? new Date(item.pubDate) : new Date(item.isoDate || "");
                if (isNaN(itemDate.getTime())) {
                    itemDate = new Date();
                }
                const diffTime = now.getTime() - itemDate.getTime();
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
            console.error(`[Harvester] x Error con ${source}:`, promiseResult.reason);
        }
    });

    allNews.sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());
    return allNews;
}

/**
 * Legacy function for CLI compatibility.
 */
export async function collectNews(): Promise<HarvesterResult> {
    console.log("[Harvester] Iniciando recopilacion masiva de feeds...");
    
    const feeds = [
        { name: "Andina (Provincias)", url: "https://andina.pe/agencia/rss.aspx?idCategoria=4" },
        { name: "RPP (Lima/Regiones)", url: "https://rpp.pe/feed/peru" },
        { name: "Google News (Peru)", url: "https://news.google.com/rss?hl=es-PE&gl=PE&ceid=PE:es-419" },
        { name: "BBC Mundo", url: "https://feeds.bbci.co.uk/mundo/rss.xml" }
    ];

    const allNews = await collectNewsFromFeeds(feeds);

    const regionalNews = allNews.filter(n => n.fuente.includes("Andina") || n.fuente.includes("RPP"));
    const worldNews = allNews.filter(n => !n.fuente.includes("Andina") && !n.fuente.includes("RPP"));
    
    const balancedLocal: CleanNews[] = [];
    balancedLocal.push(...regionalNews.slice(0, 10), ...worldNews.slice(0, 5));
    balancedLocal.sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());
    
    console.log(`[Harvester] ${allNews.length} noticias totales, ${balancedLocal.length} seleccionadas.`);
    
    return { massiveNews: allNews, baseNews: balancedLocal };
}
