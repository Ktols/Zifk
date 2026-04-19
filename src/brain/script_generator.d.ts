export type Speaker = "Mateo" | "Yanira";
export interface ScriptTurn {
    speaker: Speaker;
    text: string;
}
export interface PodcastScript {
    spanish_script: ScriptTurn[];
    quechua_script: ScriptTurn[];
}
export declare function generateScript(news: any[], retries?: number): Promise<PodcastScript>;
//# sourceMappingURL=script_generator.d.ts.map