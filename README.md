# Inti Willan ("El que informa") 📻

Inti Willan es un proyecto de automatización inteligente diseñado para transformar feeds de noticias (RSS) convencionales en un **noticiero radial dinámico, bilingüe (Español y Quechua) y listo para transmisión**. 

Anteriormente conocido como *Willakuy AI* u operando bajo el piloto de "Radio San Miguel - NoticIA", este sistema se encarga de la recolección de noticias del Perú y del mundo, redacta guiones radiofónicos con personalidades definidas, y sintetiza las voces de los locutores, entregando un producto en formato MP3 sin intervención humana.

---

## 🎧 Funcionamiento a Nivel de Usuario

Para el usuario final (periodista, productor o director de la estación de radio), el sistema provee herramientas listas para automatizar su programación diaria en cuestión de segundos. El noticiero es conducido por dos locutores virtuales con personalidades muy marcadas:

- **Yanira (Voz Femenina):** La analista formal. Es la voz de la información dura, encargada de brindar las cifras, el contexto técnico y la seriedad a la noticia periodística.
- **Mateo (Voz Masculina):** El conductor empático y carismático. Dinamiza el programa haciendo intervenciones cortas, conectando con el lado humano y guiando las transiciones del noticiero.

### Casos de Uso del Productor:
1. **Podcast Automatizado Clásico:** Con un solo comando, el sistema investiga qué pasó en el Perú y el mundo en las últimas 24 horas, y entrega rápidamente dos archivos `.mp3` (uno en Español y otro completamente en Quechua) de aproximadamente 5 minutos cada uno. Listos para salir al aire.
2. **Mega-Documentos y Externos (NotebookLM):** Si el productor desea experimentar generar resúmenes gigantes, el sistema recolecta de forma masiva (cerca de 50 artículos) e imprime dos documentos maestros hiper redactados (uno en Español y otro traducido de forma robusta al Quechua Sureño). Estos archivos `.txt` son la materia prima perfecta para alimentar inteligencias externas (como el *Audio Overview* de Google NotebookLM) guiándolas con toda la información ya procesada.

---

## 🛠️ Funcionamiento a Nivel Técnico (Arquitectura del Pipeline)

A nivel técnico, la aplicación está estructurada en un *Pipeline* de múltiples fases modulares, desarrolladas en TypeScript (entorno NodeJS):

### 1. El Recolector (Harvester / Data Ingestion) - `src/collect/`
- Lee y formatea directamente fuentes RSS en tiempo real (Agencia Andina, RPP Noticias, Google News Perú y BBC Mundo).
- Aplica limpieza de etiquetas HTML y realiza un filtrado inteligente para dar prioridad estricta a las noticias locales y nacionales (ignorando secciones incompatibles como farándula o espectáculos).
- Separa la extracción en dos lotes: un lote "Base" de (15 artículos) para el flujo tradicional, y un lote "Masivo" (aprox. 50 artículos) para exportaciones analíticas y NotebookLM.

### 2. El Cerebro Dinámico (Prompting & Guionaje) - `src/brain/`
- **Generación Base JSON:** Utilizando la API Generativa de Google (`gemini-2.5-flash`), evalúa las noticias filtradas y orquesta el flujo completo de la interacción redactando un guion. Transforma la noticia fría en un ida y vuelta de diálogos entre Yanira y Mateo. Lo retorna en formato JSON en Español y Quechua.
- **Mega-Traducción por Lotes (Batching):** Pensado para no saturar las cuotas de Google Cloud (errores tipo `Quota Exceeded` o `Timeout`). Al traducir documentos enormes, implementa una división inteligente por *Chunks* (bloques de 15 noticias a la vez) agrupando las peticiones a la API para asegurar que la traducción del Español al Quechua sea ininterrumpida y a prueba de caídas.

### 3. Sintetizadores de Voz y Manager (Voice TTS) - `src/voice/`
- Ingiere los arreglos de diálogo JSON y enruta asíncronamente los segmentos de texto al motor de síntesis pertinente dependiento del idioma y la configuración de voz.
- **Motores Clásicos:** Utiliza motores de nivel broadcast (Google Cloud TTS y Azure Neural TTS) ya que poseen el control y la estabilidad suficiente para leer palabras en Quechua o acercarse al acento hispanohablante regional requerido.

### 4. Ensamblaje Final (FFmpeg Merger) - `src/output/`
- Opera en el sistema de archivos en los directorios temporales (`/temp/es`, `/temp/qu`).
- A través de la librería `fluent-ffmpeg`, agrupa, valida la sanidad de los archivos `.mp3` pequeños y los concatena ordenadamente sin "baches" de sonido. Limpia la basura y consolida el material final en la carpeta maestra `/output/`.

---

## ⚙️ Instalación y Configuración Local

Para correr este proyecto en tu propia máquina o servidor, sigue estos pasos:

### 1. Pre-requisitos
- **Node.js**: (Recomendado v18+).
- **FFmpeg**: Necesario para la concatenación final de los audios mp3.

### 2. Clonar e Instalar
```bash
git clone https://github.com/Ktols/inti-willan.git
cd inti-willan
npm install
```

### 3. Configuración de Claves de API (¡IMPORTANTE!)
El proyecto es de código abierto, pero **requiere tus propias credenciales** para acceder a los motores de Inteligencia Artificial. Por seguridad, estas claves **NUNCA** se suben al repositorio.

Debes crear un archivo llamado `.env` en la raíz del proyecto y agregar lo siguiente:

```env
# 1. Gemini API (Para el Cerebro y Traducciones de Texto)
# Obtenla gratis en: https://aistudio.google.com/
GEMINI_API_KEY="tu_clave_gemini_aqui"

# 2. Azure Neural TTS (Opcional: Recomendado para TTS Hispanoamérica / Quechua)
# Obtenla creando un recurso de Speech Services en el Portal de Azure
AZURE_TTS_KEY="tu_clave_azure_aqui"
AZURE_TTS_REGION="tu_region_aqui" # ej: eastus
```

Para usar **Google Cloud TTS**, debes descargar tu credencial de cuenta de servicio en formato JSON, renombrarla a `google-key.json` y guardarla en la raíz del proyecto. El código buscará automáticamente ese archivo para certificar tus peticiones de voz con Google.

---

## 🤖 Uso Avanzado: Integración con Google NotebookLM

Si deseas usar los potentes podcasts nativos de NotebookLM de Google, puedes extraer documentos maestros condensados usando el comando `npm run export:sources`. 

Una vez generado el archivo `Fuentes_Master_NotebookLM_ES.txt` en tu carpeta `/output`, súbelo como fuente a NotebookLM y **personaliza la guía del audio (Customize Audio) con el siguiente Prompt exacto** para asegurar que el modelo asuma los roles de la estación de radio:

```text
Actúen como los presentadores del noticiero matutino "Noti IA" de "Radio San Miguel Ayacucho" (eslogan: "Tu radio con las noticias a la vanguardia"). Transmiten DIRECTAMENTE PARA TODO EL INTERIOR DEL PERÚ, dirigiéndose con calidez a "nuestros hermanos de las regiones".

ASUMAN SUS ROLES ESTRICTAMENTE:
- YANIRA (voz femenina): Eres analítica, formal y estructurada. Eres la voz de la información dura. Tu función es aportar el contexto, cifras, datos empíricos y detalles técnicos de la noticia con total seriedad.
- MATEO (voz masculina): Eres entusiasta, empático, bilingüe y muy carismático. Tu rol es dinamizar el programa haciéndole preguntas a Yanira. Aportas calor humano, opiniones y comentarios cercanos al ciudadano de a pie. Diriges las transiciones con mucha educación.

REGLAS ESTRICTAS DE FORMATO Y ESTILO:
1. Boletín Mañanero Ágil: Hagan un recorrido rápido por TODAS las fuentes. ESTÁ TOTALMENTE PROHIBIDO estancarse debatiendo una sola noticia. 
2. Dinámica rápida: Lean el titular, Yanira da el dato duro o contexto técnico, Mateo hace un comentario empático muy breve (1 o 2 oraciones máximo) y pasan INMEDIATAMENTE a la siguiente noticia.
3. Prioridad: Den prioridad absoluta a las noticias del Estado, ministerios y los sucesos de las diferentes provincias del Perú.
4. Prohibiciones Absolutas: Mantengan un ALTO PRESTIGIO Y MÁXIMA FORMALIDAD. Cero lenguaje callejero. 
- Resalten noticias de provincias ignorando los temas de entretenimiento o farándula.
```

---

## 💻 Comandos CLI y Modo de Uso

El servidor interactúa a través de comandos configurados en `package.json` mediante `npm`:

```bash
# 1. Generar únicamente el Texto/Guión JSON de las 24 hrs
# (Útil para depuración o revisión por humanos antes de gastar recursos de voz)
npm run write

# 2. Sintetizar los Audios Clásicos
# (Lee el guión previamente creado y genera las voces)
npm run speak:classic

# 3. Flujo Completo End-to-End
# (Raspa la web, escribe guion y lo transforma a audio en un solo paso)
npm run start

# 4. Modo MEGA-EXPORTACIÓN (Para Google NotebookLM u Otros LLMs)
# Extrae el formato masivo de noticias e imprime los diccionarios limpios (.txt) en Español y Quechua en la carpeta /output. Ignora partes de síntesis de voz locales.
npm run export:sources
```

---

> **Nota de Seguridad:** Las claves de API y de entorno están gestionadas mediante variables protegidas (`.env`) o archivos de clave local (`google-key.json`) que han sido expresamente excluidas del control de versiones por seguridad.
