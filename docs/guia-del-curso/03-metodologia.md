# Metodología

## Principios rectores

1. **Learning by doing**: 70% práctica / 30% teoría. Cada concepto se introduce y se aplica inmediatamente en laboratorio.
2. **Progresión incremental**: Cada día construye sobre el anterior. El proyecto final integra todo.
3. **Feedback rápido**: Laboratorios con checkpoints automáticos (scripts de validación) + revisión entre pares.
4. **Documentación como entregable**: No se considera completo un laboratorio sin su documentación en el repo.
5. **Entorno realista**: Usamos herramientas de producción (BuildKit, Trivy, cosign, Helm, kind) no simuladores.

## Estructura de cada día

| Fase | Duración | Descripción |
|------|----------|-------------|
| **Conceptos** | 45-60 min | Explicación interactiva con diagramas, demo en vivo, Q&A |
| **Laboratorio guiado** | 60-90 min | Paso a paso con instructor, checkpoints de validación |
| **Laboratorio autónomo** | 45-60 min | Variante del guiado: mismo patrón, datos/distinta app |
| **Revisión y retro** | 15-30 min | Diff de soluciones, errores comunes, preguntas abiertas |
| **Commit & push** | 10 min | Guardar trabajo en repo personal con mensaje convencional |

## Dinámica de laboratorios

### Laboratorio guiado (con instructor)
- Instructor comparte pantalla y narra decisiones.
- Participantes replican en su máquina.
- Checkpoints: `make check-lab-1-1` valida estado esperado.
- Dudas se resuelven en vivo.

### Laboratorio autónomo (individual/parejas)
- Enunciado con requisitos y criterios de aceptación.
- Mismo patrón técnico que el guiado, distinta aplicación.
- Tiempo limitado; se valora solución funcional sobre perfecta.
- Al final: `git diff` comparativo + discusión de alternativas.

### Validación automática
Cada laboratorio incluye un script `validate.sh` que verifica:
- Imagen construida y etiquetada correctamente.
- Contenedor arranca y pasa healthcheck.
- Puertos expuestos, variables de entorno, volúmenes montados.
- Tests de humo (curl endpoint, query DB, etc.).
- Lint: `hadolint Dockerfile`, `yamllint compose.yml`.

## Trabajo en el proyecto final

### Semana del curso (Días 1-4)
- Cada día genera artefactos que alimentan el proyecto:
  - Día 1: `Dockerfile` base de cada servicio.
  - Día 2: `docker-compose.yml` integrando servicios.
  - Día 3: Pipeline CI/CD que build/test/scan/push de cada servicio.
  - Día 4: Helm chart que despliega el compose en Kubernetes.

### Día 5 - Integración
- **Mañana**: Refactor guiado por checklist de calidad (ver plantillas).
- **Mediodía**: Ejecución completa de pipeline en branch `release/candidate`.
- **Tarde**: Documentación, presentación, demo, retrospectiva.

## Evaluación formativa (durante el curso)

| Momento | Herramienta | Qué mide |
|---------|-------------|----------|
| Inicio día 1 | Cuestionario diagnóstico | Conocimientos previos (Linux, redes, Git, CI/CD) |
| Fin de cada día | Autoevaluación 5 preguntas | Confianza en objetivos del día |
| Día 3 (mitad) | Revisión de pipeline en pares | Calidad CI/CD, seguridad, reproducibilidad |
| Día 4 | Demo de deploy en kind | Funcionalidad end-to-end, observabilidad |
| Día 5 | Presentación + repo | Integración, comunicación, pensamiento crítico |

## Evaluación sumativa (final)

Ver [Objetivos de aprendizaje → Criterios de evaluación](objetivos.md#criterios-de-evaluación).

## Accesibilidad y adaptaciones

- Materiales en Markdown (accesibles a lectores de pantalla).
- Comandos documentados con alternativas sin ratón (atajos terminal).
- Laboratorios con versión "guiada completa" y "solo enunciado" para distinto ritmo.
- Grabaciones de sesiones teóricas disponibles tras cada día.
- Soporte para entornos remotos (GitHub Codespaces, Gitpod, VM cloud) si no hay Docker local.

## Comunicación

- **Canal principal**: Slack/Discord del curso (hilos por día/laboratorio).
- **Código**: Repositorio Git personal + PRs para revisión entre pares.
- **Dudas técnicas**: Issues en repo del curso con label `question`.
- **Anuncios**: Canal `#anuncios` + email diario resumen.

## Retrospectiva continua

Al final de cada día (últimos 10 min):
1. **Start**: ¿Qué deberíamos empezar a hacer mañana?
2. **Stop**: ¿Qué no funciona y deberíamos dejar?
3. **Continue**: ¿Qué funciona bien y mantener?

Resultados se incorporan al día siguiente y al curso futuro.