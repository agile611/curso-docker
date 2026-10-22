# .dockerignore (Patrones optimizados por lenguaje)

```dockerignore
# =============================================================================
# .dockerignore - Patrones universales + por lenguaje
# =============================================================================
# Colocar en raíz del repo Y en cada apps/<servicio>/

# -----------------------------------------------------------------------------
# GIT Y VERSIONADO
# -----------------------------------------------------------------------------
.git
.gitignore
.gitattributes
.gitmodules
.gitkeep
.hg
.svn

# -----------------------------------------------------------------------------
# DEPENDENCIAS (se instalan en build)
# -----------------------------------------------------------------------------
# Node.js
node_modules
npm-debug.log*
yarn-debug.log*
yarn-error.log*
pnpm-debug.log*
.npm
.yarn
.pnp
.pnp.js

# Python
__pycache__
*.py[cod]
*$py.class
.pytest_cache
.coverage
htmlcov
.tox
.venv
venv
env
ENV
pip-wheel-metadata
*.egg-info
dist
build
*.egg

# Go
vendor
go.work

# Java (Maven/Gradle)
target
.gradle
.mvn
mvnw
mvnw.cmd
gradlew
gradlew.bat

# Rust
target
Cargo.lock

# .NET
bin
obj
*.user
*.suo

# PHP
vendor
composer.lock

# Ruby
.bundle
vendor/bundle
Gemfile.lock

# -----------------------------------------------------------------------------
# BUILD OUTPUTS Y ARTIFACTS
# -----------------------------------------------------------------------------
dist
build
out
*.tar.gz
*.tgz
*.zip
*.whl
*.jar
*.war
*.ear
*.dll
*.exe
*.so
*.dylib

# -----------------------------------------------------------------------------
# LOGS Y TEMPORALES
# -----------------------------------------------------------------------------
*.log
*.tmp
*.temp
*.swp
*~
.DS_Store
Thumbs.db
ehthumbs.db
Desktop.ini

# -----------------------------------------------------------------------------
# IDE Y EDITORES
# -----------------------------------------------------------------------------
.vscode
.idea
*.swp
*.swo
*~.nib
*.sublime-project
*.sublime-workspace
.project
.classpath
.settings
*.iml
*.ipr
*.iws
*.launch
nbproject
.vs

# -----------------------------------------------------------------------------
# CONFIGURACIÓN LOCAL / SECRETS
# -----------------------------------------------------------------------------
.env
.env.*
.env.local
.env.*.local
*.pem
*.key
*.crt
*.cert
*.p12
*.pfx
secrets/
config/local.*
config/secrets.*
docker-compose.override.yml
docker-compose.local.yml

# -----------------------------------------------------------------------------
# TESTS Y DOCS (opcional: excluir de imagen final)
# -----------------------------------------------------------------------------
tests/
test/
spec/
__tests__/
__mocks__/
cypress/
playwright/
*.test.ts
*.test.js
*.spec.ts
*.spec.js
*.test.py
*_test.go
*_test.rs
coverage/
.nyc_output/
.mocharc.*
jest.config.*
vitest.config.*
pytest.ini
tox.ini
phpunit.xml
rspec/
docs/
README.md
CHANGELOG.md
LICENSE
CONTRIBUTING.md
CODE_OF_CONDUCT.md
SECURITY.md

# -----------------------------------------------------------------------------
# DOCKER ARTIFACTS
# -----------------------------------------------------------------------------
Dockerfile*
docker-compose*.yml
.dockerignore
.docker/
docker-compose.override.yml
docker-compose.local.yml
docker-compose.ci.yml
docker-compose.prod.yml

# -----------------------------------------------------------------------------
# CI/CD
# -----------------------------------------------------------------------------
.github/
.gitlab/
.gitlab-ci.yml
.travis.yml
.circleci/
.azure-pipelines/
.jenkins/
Jenkinsfile
.bitbucket-pipelines.yml

# -----------------------------------------------------------------------------
# OS ESPECÍFICOS
# -----------------------------------------------------------------------------
# macOS
.AppleDouble
.LSOverride
Icon?
._*
.Spotlight-V100
.Trashes
.apdisk

# Windows
Thumbs.db
ehthumbs.db
Desktop.ini
$RECYCLE.BIN/
*.cab
*.msi
*.msm
*.msp

# Linux
*~
.fuse_hidden*
.directory
.Trash-*
```

## Versiones por lenguaje (archivos específicos por servicio)

### Node.js (`apps/frontend/.dockerignore`, `apps/api/.dockerignore`)

```dockerignore
# Node.js específico
node_modules
npm-debug.log*
yarn-debug.log*
yarn-error.log*
pnpm-debug.log*
.npm
.yarn
.pnp
.pnp.js
dist
build
*.tsbuildinfo
coverage
.nyc_output
.vercel
.netlify
.next
.out
.turbo
.eslintcache
.stylelintcache
.prettierrc
.eslintrc.*
.prettierrc.*
.tsconfig.tsbuildinfo
```

### Python (`apps/worker/.dockerignore`)

```dockerignore
# Python específico
__pycache__
*.py[cod]
*$py.class
.pytest_cache
.coverage
htmlcov
.tox
.venv
venv
env
ENV
pip-wheel-metadata
*.egg-info
dist
build
*.egg
*.whl
.mypy_cache
.pyre
.pytype
.ruff_cache
.coverage.*
htmlcov/
.pytest_cache/
.mypy_cache/
```

### Go (`apps/go-service/.dockerignore`)

```dockerignore
# Go específico
vendor
go.work
*.exe
*.test
*.prof
coverage.out
*.out
*.exe
```

### Java (`apps/java-service/.dockerignore`)

```dockerignore
# Java específico
target
.gradle
.mvn
mvnw
mvnw.cmd
gradlew
gradlew.bat
*.class
*.jar
*.war
*.ear
hs_err_pid*
replay_pid*
```

### Rust (`apps/rust-service/.dockerignore`)

```dockerignore
# Rust específico
target
Cargo.lock
*.rs.bk
```

## Patrones avanzados

### Negación (incluir archivos que coinciden con patrón excluido)

```dockerignore
# Excluir todo en config/
config/*

# PERO incluir config/prod.yaml
!config/prod.yaml

# Excluir todos .log
*.log

# PERO mantener debug.log
!debug.log
```

### Anclas de directorio (solo en raíz)

```dockerignore
# Solo en raíz del contexto (no recursivo)
/.git
/Dockerfile
/docker-compose.yml
/.env
```

### Comentarios

```dockerignore
# Esto es un comentario
# Los comentarios en línea no son estándar, usar línea separada
```

## Validación .dockerignore

```bash
# 1. Ver qué archivos se envían al daemon (contexto)
docker build -t test . 2>&1 | grep "transferring context"

# 2. Ver archivos exactos en contexto
docker build --progress=plain -t test . 2>&1 | grep -E "^(COPY|ADD|#)" | head -20

# 3. Tamaño contexto
docker build -t test . 2>&1 | grep "context" | head -1

# 4. Verificar que node_modules NO está en contexto
docker run --rm -v $(pwd):/src alpine find /src -name "node_modules" -type d 2>/dev/null | head -5
# Debería mostrar solo directorios locales, no en contexto de build

# 5. Test build real
docker build -t test-ignore .
docker run --rm test-ignore ls -la /app | grep -v node_modules
```

## Mejores prácticas

| Práctica | Por qué |
|----------|---------|
| **Un .dockerignore por servicio** | Cada servicio tiene deps/build outputs distintos |
| **Excluir deps** | Se instalan en build, no necesitan copiarse |
| **Excluir build outputs** | Se generan en build |
| **Excluir tests/docs** | No necesarios en runtime |
| **Excluir secrets/config local** | Seguridad + evitar leaks |
| **Excluir Docker artifacts** | Evitar recursión/ciclos |
| **Usar .gitignore como base** | Mismos patrones suelen aplicar |
| **Validar en CI** | `hadolint` detecta `COPY . .` sin .dockerignore |

## Checklist validación

```bash
# validate-dockerignore.sh
#!/usr/bin/env bash
set -euo pipefail

for dir in apps/*/; do
  if [[ -f "$dir/.dockerignore" ]]; then
    echo "✅ $dir tiene .dockerignore"
    
    # Verificar patrones críticos
    grep -q "node_modules" "$dir/.dockerignore" || echo "⚠️  $dir: falta node_modules"
    grep -q "\.git" "$dir/.dockerignore" || echo "⚠️  $dir: falta .git"
    grep -q "\.env" "$dir/.dockerignore" || echo "⚠️  $dir: falta .env"
    grep -q "Dockerfile" "$dir/.dockerignore" || echo "⚠️  $dir: falta Dockerfile"
    grep -q "docker-compose" "$dir/.dockerignore" || echo "⚠️  $dir: falta docker-compose"
    
    # Verificar que NO hay patrones peligrosos
    ! grep -q "^\*$" "$dir/.dockerignore" || echo "❌ $dir: patrón * demasiado amplio"
  else
    echo "❌ $dir: FALTA .dockerignore"
  fi
done
```