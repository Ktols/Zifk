"""
Abre Chrome con un perfil persistente dedicado para NotebookLM.
Solo necesitas iniciar sesión UNA VEZ — después recuerda la sesión.
"""

import asyncio
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright
from notebooklm.paths import get_storage_path

NOTEBOOKLM_URL = "https://notebooklm.google.com/"

# Perfil dedicado que persiste entre ejecuciones (no interfiere con tu Chrome)
PROFILE_DIR = Path.home() / ".notebooklm" / "browser_profile"


def main():
    storage_path = get_storage_path()
    storage_path.parent.mkdir(parents=True, exist_ok=True)
    PROFILE_DIR.mkdir(parents=True, exist_ok=True)

    print("Abriendo navegador...")
    print("   (Si es la primera vez, inicia sesion con tu cuenta de Google)")
    print("   (Las proximas veces ya no te lo pedira)\n")

    if sys.platform == "win32":
        asyncio.set_event_loop_policy(asyncio.DefaultEventLoopPolicy())

    with sync_playwright() as p:
        context = p.chromium.launch_persistent_context(
            user_data_dir=str(PROFILE_DIR),
            headless=False,
            args=[
                "--disable-blink-features=AutomationControlled",
            ],
            ignore_default_args=["--enable-automation"],
        )

        page = context.pages[0] if context.pages else context.new_page()
        page.goto(NOTEBOOKLM_URL, wait_until="load", timeout=60000)

        print("Cuando veas la pagina principal de NotebookLM, presiona ENTER aqui.")
        print("   (Si pide login, inicia sesion normalmente primero)\n")

        input("[Presiona ENTER para guardar y cerrar] ")

        context.storage_state(path=str(storage_path))
        context.close()

    print("Sesion guardada correctamente.")


if __name__ == "__main__":
    main()
