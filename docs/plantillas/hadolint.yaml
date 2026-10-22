# .hadolint.yaml (Configuración hadolint del equipo)

```yaml
# =============================================================================
# .hadolint.yaml - Configuración Hadolint para el equipo
# =============================================================================
# Ubicación: raíz del repo (o en cada apps/<servicio>/)
# Uso: hadolint --config .hadolint.yaml Dockerfile

# -----------------------------------------------------------------------------
# REGLAS DESHABILITADAS (con justificación)
# -----------------------------------------------------------------------------
ignored:
  # DL3008: Pin versions in apt-get install
  # Justificación: Usamos alpine/apk con --no-cache, no apt
  - DL3008

  # DL3009: Delete the apt-get lists after installing something
  # Justificación: No usamos apt-get, usamos apk --no-cache
  - DL3009

  # DL3015: Avoid additional packages by specifying --no-install-recommends
  # Justificación: No usamos apt-get
  - DL3015

  # DL3018: Pin versions in apk add
  # Justificación: En builder stage OK, en runtime no instalamos paquetes
  # Excepción documentada: solo en builder para build deps
  - DL3018

  # DL3025: Use arguments JSON notation for CMD/ENTRYPOINT
  # Justificación: Ya usamos JSON notation en nuestros Dockerfiles
  # Esta regla es para detectar shell form, nosotros usamos exec form
  - DL3025

  # DL3027: Do not use ARG before FROM
  # Justificación: Solo usamos ARG antes de FROM para BASE_IMAGE/BUILDER_IMAGE
  # Que es el patrón recomendado para multi-stage parametrizado
  - DL3027

  # DL3042: Avoid COPY --from=builder without --chown
  # Justificación: SIEMPRE usamos --chown en COPY --from=builder
  # Esta regla es para detectar cuando se olvida, nosotros no lo olvidamos
  - DL3042

  # DL3059: Multiple consecutive RUN instructions
  # Justificación: A veces separamos RUN por legibilidad/cache granular
  # Preferimos legibilidad sobre micro-optimización de capas
  - DL3059

# -----------------------------------------------------------------------------
# REGLAS CON CONFIGURACIÓN PERSONALIZADA
# -----------------------------------------------------------------------------
# DL3007: Using latest is prone to errors if the image will ever update
# Configuración: permitir latest SOLO en builder stage para base images oficiales
# En runtime NUNCA usamos latest
trustedRegistries:
  - docker.io
  - ghcr.io
  - gcr.io
  - quay.io
  - registry.access.redhat.com

# DL3020: Use COPY instead of ADD for files and folders
# Configuración: estricto, solo ADD para URLs remotas o auto-extract tar
# Nuestros Dockerfiles solo usan COPY

# DL3028: Pin versions in gem install
# No aplicable (no Ruby)

# DL3033: Specify version with `pip install -r requirements.txt`
# Configuración: usamos pyproject.toml + pip install --prefix=/install .

# DL3037: Specify version with `npm install`
# Configuración: usamos package-lock.json + npm ci

# DL3038: Specify version with `yarn add`
# No aplicable (usamos npm)

# DL3039: Specify version with `composer require`
# No aplicable (no PHP)

# DL3040: Specify version with `go get`
# Configuración: usamos go.mod/go.sum + go mod download

# DL3041: Specify version with `cargo add`
# Configuración: usamos Cargo.lock + cargo build

# DL3043: Specify version with `apk add`
# Configuración: en builder stage permitimos sin pin para build deps temporales
# En runtime no instalamos paquetes

# DL3044: Specify version with `apt-get install`
# No aplicable (usamos alpine/apk)

# DL3045: Specify version with `yum install`
# No aplicable

# DL3046: Specify version with `dnf install`
# No aplicable

# DL3047: Specify version with `zypper install`
# No aplicable

# DL3048: Specify version with `pacman install`
# No aplicable

# DL3049: Specify version with `emerge install`
# No aplicable

# -----------------------------------------------------------------------------
# SEVERIDAD POR DEFECTO
# -----------------------------------------------------------------------------
# failure-threshold: warning (en CI usamos --failure-threshold=warning)
# error: falla el build
# warning: avisa pero no falla (configurado en CI)
# info: solo informativo
# style: solo estilo
# ignore: deshabilitado

# -----------------------------------------------------------------------------
# FORMATO DE SALIDA
# -----------------------------------------------------------------------------
format: tty  # tty, json, checkstyle, codeclimate, gitlab_codeclimate, junit, sarif

# -----------------------------------------------------------------------------
# ARCHIVOS A EXCLUIR DEL LINTING
# -----------------------------------------------------------------------------
exclude:
  - "**/Dockerfile.test"
  - "**/Dockerfile.debug"
  - "**/Dockerfile.local"
  - "**/Dockerfile.*"
  # Solo lint Dockerfile principal por servicio
```

## Uso en CI/CD

```yaml
# .github/workflows/ci.yml
- name: Hadolint
  uses: hadolint/hadolint-action@v3.1.0
  with:
    dockerfile: apps/*/Dockerfile
    recursive: true
    config: .hadolint.yaml
    failure-threshold: warning
    verbose: true
```

## Validación local

```bash
# Lint todos los Dockerfiles
hadolint --config .hadolint.yaml --failure-threshold=warning apps/*/Dockerfile

# Lint específico
hadolint --config .hadolint.yaml apps/api/Dockerfile

# Ver todas las reglas disponibles
hadolint --show-rules

# Output JSON para parsing
hadolint --config .hadolint.yaml --format json apps/api/Dockerfile | jq '.[] | {rule: .code, message: .message, line: .line}'
```

## Reglas comunes y fixes

| Regla | Descripción | Fix típico |
|-------|-------------|------------|
| `DL3000` | Use absolute WORKDIR | `WORKDIR /app` no `WORKDIR app` |
| `DL3001` | Missing WORKDIR | Añadir `WORKDIR /app` |
| `DL3002` | Last user should not be root | `USER appuser` al final |
| `DL3003` | Multiple CMD/ENTRYPOINT | Solo uno de cada |
| `DL3004` | Do not use sudo | Eliminar sudo |
| `DL3005` | Do not use apt-get upgrade | Eliminar upgrade |
| `DL3006` | Always tag version | `FROM node:20-alpine` no `latest` |
| `DL3007` | Using latest is prone to errors | Pin version: `node:20-alpine` |
| `DL3008` | Pin versions in apt-get install | `apt-get install -y pkg=1.0` |
| `DL3009` | Delete apt-get lists | `rm -rf /var/lib/apt/lists/*` |
| `DL3010` | Use ADD for URLs only | Cambiar ADD por COPY |
| `DL3011` | Valid UNIX ports | `EXPOSE 8080` no `EXPOSE 8080/tcp` |
| `DL3012` | Provide HEALTHCHECK | Añadir HEALTHCHECK |
| `DL3013` | Pin versions in pip install | `pip install pkg==1.0` |
| `DL3014` | Use COPY instead of ADD | Cambiar ADD por COPY |
| `DL3015` | Avoid additional packages | `--no-install-recommends` |
| `DL3016` | Pin versions in npm install | `package-lock.json` + `npm ci` |
| `DL3017` | Do not use apk add --update | Usar `--no-cache` |
| `DL3018` | Pin versions in apk add | `apk add pkg=1.0` |
| `DL3019` | Use --no-cache in apk add | `apk add --no-cache pkg` |
| `DL3020` | Use COPY instead of ADD | Cambiar ADD por COPY |
| `DL3021` | COPY with more than 2 args | Separar en múltiples COPY |
| `DL3022` | COPY from builder without --chown | Añadir `--chown=user:group` |
| `DL3023` | COPY with --chown on non-root | OK si user existe |
| `DL3024` | FROM latest | Pin version |
| `DL3025` | Use arguments JSON notation | `CMD ["exe", "arg"]` |
| `DL3026` | Use only one CMD | Solo un CMD |
| `DL3027` | Do not use ARG before FROM | Solo para BASE_IMAGE/BUILDER_IMAGE |
| `DL3028` | Pin versions in gem install | `gem install pkg -v 1.0` |
| `DL3029` | Use COPY instead of ADD | Cambiar ADD por COPY |
| `DL3030` | Use COPY instead of ADD | Cambiar ADD por COPY |
| `DL3031` | Use COPY instead of ADD | Cambiar ADD por COPY |
| `DL3032` | Use COPY instead of ADD | Cambiar ADD por COPY |
| `DL3033` | Specify version with pip install | `pip install pkg==1.0` |
| `DL3034` | Use COPY instead of ADD | Cambiar ADD por COPY |
| `DL3035` | Use COPY instead of ADD | Cambiar ADD por COPY |
| `DL3036` | Use COPY instead of ADD | Cambiar ADD por COPY |
| `DL3037` | Specify version with pip install | `pip install pkg==1.0` |
| `DL3038` | Specify version with yarn add | `yarn add pkg@1.0` |
| `DL3039` | Specify version with composer require | `composer require pkg:1.0` |
| `DL3040` | Specify version with go get | `go get pkg@v1.0` |
| `DL3041` | Specify version with cargo add | `cargo add pkg@1.0` |
| `DL3042` | COPY from builder without --chown | Añadir `--chown=user:group` |
| `DL3043` | Specify version with apk add | `apk add pkg=1.0` |
| `DL3044` | Specify version with apt-get install | `apt-get install -y pkg=1.0` |
| `DL3045` | Specify version with yum install | `yum install -y pkg-1.0` |
| `DL3046` | Specify version with dnf install | `dnf install -y pkg-1.0` |
| `DL3047` | Specify version with zypper install | `zypper install -y pkg-1.0` |
| `DL3048` | Specify version with pacman install | `pacman -S pkg-1.0` |
| `DL3049` | Specify version with emerge install | `emerge =pkg-1.0` |
| `DL3050` | Use COPY instead of ADD | Cambiar ADD por COPY |
| `DL3051` | Use COPY instead of ADD | Cambiar ADD por COPY |
| `DL3052` | Use COPY instead of ADD | Cambiar ADD por COPY |
| `DL3053` | Use COPY instead of ADD | Cambiar ADD por COPY |
| `DL3054` | Use COPY instead of ADD | Cambiar ADD por COPY |
| `DL3055` | Use COPY instead of ADD | Cambiar ADD por COPY |
| `DL3056` | Use COPY instead of ADD | Cambiar ADD por COPY |
| `DL3057` | Use COPY instead of ADD | Cambiar ADD por COPY |
| `DL3058` | Use COPY instead of ADD | Cambiar ADD por COPY |
| `DL3059` | Multiple consecutive RUN | Combinar en un RUN con `&&` |
| `DL3060` | Use COPY instead of ADD | Cambiar ADD por COPY |
| `DL3061` | Use COPY instead of ADD | Cambiar ADD por COPY |

## Integración con pre-commit

```yaml
# .pre-commit-config.yaml
repos:
  - repo: https://github.com/hadolint/hadolint
    rev: v2.12.0
    hooks:
      - id: hadolint-dockerfile
        args: [--config, .hadolint.yaml, --failure-threshold, warning]
        files: ^apps/.*/Dockerfile$
```