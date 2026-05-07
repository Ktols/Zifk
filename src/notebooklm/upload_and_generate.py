"""
NotebookLM Automation Script for Zifk
Crea un notebook, sube las fuentes maestras, genera Audio Overview y descarga el MP3.

Uso:
  py src/notebooklm/upload_and_generate.py <archivo_fuentes.txt> <prompt_audio.txt> <salida.mp3> [--lang es]
"""

import asyncio
import sys
import os
import json
import argparse


async def run(source_path: str, prompt_path: str, output_path: str, lang: str, notebook_name: str):
    from notebooklm import NotebookLMClient

    # Leer el prompt de personalización del audio
    audio_instructions = ""
    if os.path.isfile(prompt_path):
        with open(prompt_path, "r", encoding="utf-8") as f:
            audio_instructions = f.read().strip()

    if not os.path.isfile(source_path):
        print(json.dumps({"success": False, "error": f"Archivo fuente no encontrado: {source_path}"}))
        sys.exit(1)

    # Leer el contenido de la fuente para subirlo como texto pegado
    with open(source_path, "r", encoding="utf-8") as f:
        source_content = f.read()

    if not source_content.strip():
        print(json.dumps({"success": False, "error": "El archivo fuente está vacío."}))
        sys.exit(1)

    print(f"[NotebookLM] Conectando con NotebookLM...", file=sys.stderr)

    async with await NotebookLMClient.from_storage() as client:
        # 1. Crear un notebook dedicado
        print(f"[NotebookLM] Creando notebook: {notebook_name}", file=sys.stderr)
        nb = await client.notebooks.create(notebook_name)
        notebook_id = nb.id
        print(f"[NotebookLM] Notebook creado: {notebook_id}", file=sys.stderr)

        # 2. Subir el documento maestro como "pasted text" source
        print(f"[NotebookLM] Subiendo fuente ({len(source_content)} caracteres)...", file=sys.stderr)
        await client.sources.add_text(notebook_id, "Fuentes Noticias Zifk", source_content, wait=True)
        print(f"[NotebookLM] Fuente subida exitosamente.", file=sys.stderr)

        # 3. Generar Audio Overview
        print(f"[NotebookLM] Generando Audio Overview (idioma: {lang})...", file=sys.stderr)

        generate_kwargs = {}
        if audio_instructions:
            generate_kwargs["instructions"] = audio_instructions
        # Siempre especificar idioma — NotebookLM usa inglés por defecto
        lang_map = {"es": "es-419", "qu": "es-419"}  # es-419 = Español Latinoamérica
        generate_kwargs["language"] = lang_map.get(lang, "es-419")

        status = await client.artifacts.generate_audio(notebook_id, **generate_kwargs)
        print(f"[NotebookLM] Esperando que se complete la generación (task: {status.task_id})...", file=sys.stderr)
        print(f"[NotebookLM] Esto puede tardar entre 5 y 15 minutos. Paciencia...", file=sys.stderr)
        await client.artifacts.wait_for_completion(notebook_id, status.task_id, timeout=900.0)
        print(f"[NotebookLM] Audio generado exitosamente.", file=sys.stderr)

        # 4. Descargar el MP3
        os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
        await client.artifacts.download_audio(notebook_id, output_path)
        print(f"[NotebookLM] Audio descargado: {output_path}", file=sys.stderr)

    # Resultado JSON para el bridge de TypeScript
    result = {
        "success": True,
        "notebook_id": notebook_id,
        "output_path": os.path.abspath(output_path),
    }
    print(json.dumps(result))


def main():
    parser = argparse.ArgumentParser(description="Zifk - NotebookLM Automation")
    parser.add_argument("source", help="Ruta al archivo .txt de fuentes maestras")
    parser.add_argument("prompt", help="Ruta al archivo .txt con el prompt de personalización del audio")
    parser.add_argument("output", help="Ruta de salida para el MP3 generado")
    parser.add_argument("--lang", default="es", help="Código de idioma (es, qu)")
    parser.add_argument("--name", default="Zifk Noticiero", help="Nombre del notebook")
    args = parser.parse_args()

    asyncio.run(run(args.source, args.prompt, args.output, args.lang, args.name))


if __name__ == "__main__":
    main()
