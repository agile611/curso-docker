# Preparación y herramientas

## Requisitos previos

### Conocimientos mínimos
- **Linux básico**: terminal, permisos, procesos, systemd, SSH.
- **Redes**: IP, puertos, DNS, HTTP, TCP/UDP, firewall básico.
- **Git**: clone, commit, push, branch, merge, PR, conventional commits.
- **Contenedores**: haber ejecutado `docker run hello-world` al menos una vez.
- **YAML/JSON**: sintaxis básica, indentación, anclas/alias.

### Cuentas necesarias (crear antes del día 1)
| Servicio | Uso | Alternativa |
|----------|-----|-------------|
| **GitHub** | Repos, Actions, GHCR, Codespaces | GitLab / Bitbucket |
| **Docker Hub** | Registry público, official images | GHCR / Quay / Harbor |
| **Play with Docker** (opcional) | Entorno efímero si no hay Docker local | kind en Codespaces |

---

## Entorno de desarrollo

### Opción A: Docker Desktop (recomendada local)
| SO | Versión mínima | Notas |
|----|----------------|-------|
| macOS | 4.25+ (Apple Silicon / Intel) | Incluye Kubernetes, BuildKit, Compose v2 |
| Windows | 4.25+ (WSL2 backend) | Habilitar WSL2 + distro Ubuntu |
| Linux | Docker Engine 24.0+ | Instalar `docker-compose-plugin` |

**Verificación post-instalación:**
```bash
docker version --format '{{.Server.Version}}'
docker compose version
docker buildx version
docker run --rm hello-world
```

### Opción B: Docker Engine en Linux (sin Desktop)
```bash
# Ubuntu/Debian
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
newgrp docker

# BuildKit + Compose v2
docker buildx install
apt-get install docker-compose-plugin
```

### Opción C: Entorno cloud (si no puedes instalar local)
| Plataforma | Configuración | Coste |
|------------|---------------|-------|
| **GitHub Codespaces** | 4 cores, 16 GB, Docker-in-Docker | Gratis 60h/mes (personal) |
| **Gitpod** | `.gitpod.yml` con `docker: true` | Gratis 50h/mes |
| **Play with Docker** | `pwd.new` sesión 4h | Gratis |
| **AWS Cloud9 / GCP Cloud Shell** | VM con Docker preinstalado | Free tier |

> **Nota**: Para Kubernetes (Día 4) se necesita mínimo 4 GB RAM y 2 vCPU. Codespaces 16 GB recomendado.

---

## Herramientas CLI adicionales

Instalar **antes del día 1**:

```bash
# Gestión de versiones (opcional pero recomendado)
# asdf / mise para docker, kubectl, helm, kind, trivy, cosign

# Herramientas core
brew install docker-buildx docker-compose  # macOS
# o descargar binarios: https://github.com/docker/buildx/releases

# Análisis y seguridad
brew install dive hadolint trivy cosign syft grype

# Kubernetes
brew install kind k3d kubectl helm k9s

# Utilidades
brew install jq yq bat eza fzf ripgrep

# Verificación
dive --version
hadolint --version
trivy --version
cosign version
kind version
kubectl version --client
helm version
```

### Verificación rápida todo-en-uno
```bash
cat <<'EOF' > verify-env.sh
#!/usr/bin/env bash
set -euo pipefail
echo "=== Docker ===" && docker version --format 'Server: {{.Server.Version}}'
echo "=== Compose ===" && docker compose version
echo "=== Buildx ===" && docker buildx version
echo "=== Dive ===" && dive --version 2>&1 | head -1
echo "=== Hadolint ===" && hadolint --version 2>&1 | head -1
echo "=== Trivy ===" && trivy --version 2>&1 | head -1
echo "=== Cosign ===" && cosign version 2>&1 | head -1
echo "=== Kind ===" && kind version
echo "=== Kubectl ===" && kubectl version --client --output=yaml | grep gitVersion
echo "=== Helm ===" && helm version --short
echo "=== Git ===" && git version
echo "✅ Entorno verificado"
EOF
chmod +x verify-env.sh && ./verify-env.sh
```

---

## Repositorio base del curso

Clonar **al inicio del día 1**:

```bash
git clone https://github.com/agile611/curso-docker-fundamentals.git mi-curso-docker
cd mi-curso-docker
git checkout -b mi-rama-inicial
```

Estructura esperada:
```
mi-curso-docker/
├── .github/workflows/     # Pipelines CI/CD (se crean día 3)
├── apps/                  # Código de apps de ejemplo (proporcionado)
│   ├── frontend/          # React + Nginx
│   ├── api/               # Node.js/Express + Prisma
│   ├── worker/            # Python + Celery
│   └── db/                # Init scripts PostgreSQL
├── charts/                # Helm charts (se crean día 4)
├── docker-compose.yml     # Se crea día 2
├── docker-compose.override.yml
├── docker-compose.prod.yml
├── Dockerfile.frontend    # Se crean día 1
├── Dockerfile.api
├── Dockerfile.worker
├── .dockerignore
├── Makefile               # Comandos comunes
├── validate.sh            # Validación laboratorios
└── README.md
```

---

## Apps de ejemplo (proporcionadas)

No necesitas escribir código de aplicación. Se entregan 3 servicios listos para contenerizar:

| Servicio | Tech stack | Puerto | Dependencias |
|----------|------------|--------|--------------|
| **frontend** | React 18 + Vite + Nginx | 80 | api |
| **api** | Node.js 20 + Express + Prisma | 3000 | db, worker |
| **worker** | Python 3.12 + Celery + Redis | - | db, redis |
| **db** | PostgreSQL 16 (imagen oficial) | 5432 | - |
| **redis** | Redis 7 Alpine (imagen oficial) | 6379 | - |

Cada app incluye:
- `package.json` / `pyproject.toml` / `go.mod` con dependencias.
- Tests unitarios (`vitest`, `jest`, `pytest`).
- Healthcheck endpoint (`/healthz`).
- Config por variables de entorno (12-factor).

---

## Configuración Git recomendada

```bash
git config --global user.name "Tu Nombre"
git config --global user.email "tu@email.com"
git config --global init.defaultBranch main
git config --global pull.rebase true
git config --global core.autocrlf input

# Aliases útiles
git config --global alias.lg "log --oneline --graph --decorate -20"
git config --global alias.co checkout
git config --global alias.st status
git config --global alias.cm "commit -m"
git config --global alias.ps "push"
git config --global alias.pl "pull --rebase"
```

### Convención de commits (Conventional Commits)
```
<tipo>[ámbito opcional]: <descripción corta>

[cuerpo opcional]

[pie opcional: refs #issue, breaking changes]
```

**Tipos**: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `chore`, `build`, `ci`, `security`.

Ejemplos:
```
feat(api): add healthcheck endpoint
fix(dockerfile): use non-root user in final stage
ci(github): add trivy scan to pipeline
docs(readme): add quickstart with compose
security(image): update base to alpine:3.20
```

---

## Checklist día 0 (la noche anterior)

- [ ] Docker Desktop/Engine instalado y verificado (`docker run hello-world`).
- [ ] `docker compose`, `buildx`, `dive`, `hadolint`, `trivy`, `cosign` instalados.
- [ ] `kind`, `kubectl`, `helm`, `k9s` instalados.
- [ ] Cuenta GitHub creada + SSH key / PAT configurado.
- [ ] Cuenta Docker Hub / GHCR accesible (`docker login`).
- [ ] Repo base clonado + rama personal creada.
- [ ] Editor configurado (VS Code + extensiones: Docker, YAML, GitLens, Markdown).
- [ ] `verify-env.sh` pasa sin errores.
- [ ] Leído [Programa y calendario](programa.md) y [Objetivos](objetivos.md).

---

## Recursos de referencia rápida

| Tema | Enlace oficial |
|------|----------------|
| Dockerfile reference | https://docs.docker.com/reference/dockerfile/ |
| Compose spec | https://github.com/compose-spec/compose-spec |
| BuildKit | https://github.com/moby/buildkit |
| Docker Scout | https://docs.docker.com/scout/ |
| Trivy | https://aquasecurity.github.io/trivy/ |
| Cosign | https://docs.sigstore.dev/cosign/ |
| Kind | https://kind.sigs.k8s.io/ |
| Helm | https://helm.sh/docs/ |
| OCI Image Spec | https://github.com/opencontainers/image-spec |
| Runtime Spec | https://github.com/opencontainers/runtime-spec |

---

## Troubleshooting preventivo

| Problema | Solución |
|----------|----------|
| `docker: permission denied` | `sudo usermod -aG docker $USER && newgrp docker` |
| `no space left on device` | `docker system prune -a --volumes` |
| Build lento en Mac/Windows | Usar `docker buildx create --use --driver=docker-container` |
| Kind no arranca en Codespaces | `kind create cluster --config=kind-config.yaml` con `kubeadmConfigPatches` para cgroups v2 |
| `x509: certificate signed by unknown authority` | Registry inseguro: añadir a `/etc/docker/daemon.json` → `insecure-registries` |
| Puerto 80/443 ocupado | `sudo lsof -i :80` → matar proceso o cambiar puerto en compose |