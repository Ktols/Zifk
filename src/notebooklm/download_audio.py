"""
Download audio from an existing NotebookLM notebook.
Usage: py src/notebooklm/download_audio.py <notebook_id> <output_path>
"""
import asyncio
import sys
import os

async def download(notebook_id: str, output_path: str):
    from notebooklm import NotebookLMClient

    print(f"[NotebookLM] Conectando para descargar audio del notebook {notebook_id}...", file=sys.stderr)
    
    async with await NotebookLMClient.from_storage() as client:
        os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
        await client.artifacts.download_audio(notebook_id, output_path)
        print(f"[NotebookLM] Audio descargado: {output_path}", file=sys.stderr)
    
    print(f"OK: {os.path.abspath(output_path)}")

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Uso: py download_audio.py <notebook_id> <output_path>")
        sys.exit(1)
    asyncio.run(download(sys.argv[1], sys.argv[2]))
