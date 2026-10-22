# Curso de Prompt Engineering

Sitio web educativo construido con MkDocs y Material for MkDocs.

## Preparar el entorno

```bash
python -m venv .venv
```

Linux o macOS:

```bash
source .venv/bin/activate
```

Windows PowerShell:

```powershell
.\.venv\Scripts\Activate.ps1
```

Instalar dependencias:

```bash
python -m pip install -r requirements.txt
```

## Previsualizar

```bash
mkdocs serve
```

Abre `http://127.0.0.1:8000`.

## Compilar y validar

```bash
mkdocs build --strict
```

La web generada queda en `site/`.

## Publicar en GitHub Pages

Con el repositorio y el remoto configurados:

```bash
mkdocs gh-deploy
```

## Organización

- `mkdocs.yml`: configuración y navegación.
- `docs/`: documentación fuente.
- `docs/assets/`: imágenes y datos de práctica.
- `site/`: web compilada; no se versiona.

## Alcance y estado de la documentación

La documentación fuente cubre las cinco jornadas y las guías, plantillas,
recursos y requisitos del proyecto final de un curso de 30 horas.
El recorrido básico no requiere programación; las opciones técnicas se
presentan como ampliaciones cuando corresponden.

El contenido incluye actividades, ejemplos sintéticos, criterios de
evaluación, medidas de privacidad y seguridad, revisión humana y documentación
de flujos reutilizables. Las referencias docentes no se presentan como
ejecuciones reales. Consulta cada página para conocer su alcance y sus límites.
# curso-docker
