# Día 4 - 03: Roles, tono y formatos (Helm y Observabilidad)

## Objetivos de la sesión

- [ ] Crear Helm charts profesionales: estructura, templates, helpers, dependencias.
- [ ] Gestionar valores: values.yaml, values-env.yaml, --set, secrets.
- [ ] Implementar hooks: pre-install, post-install, pre-upgrade, post-upgrade.
- [ ] Desplegar stack observabilidad: Prometheus, Grafana, Loki, Tempo.
- [ ] Instrumentar aplicación: métricas (Prometheus), logs (structured), traces (OpenTelemetry).
- [ ] Crear dashboards y alertas en Grafana.

---

## Dinámica

| Tiempo | Actividad |
|--------|-----------|
| 10 min | Recap K8s recursos + preguntas Helm/Observabilidad |
| 30 min | Teoría: Helm charts, hooks, dependencias, observabilidad stack |
| 20 min | Demo: helm create, template, install, upgrade, rollback |
| 10 min | Break |
| 50 min | Laboratorio guiado: chart completo + observabilidad |
| 20 min | Laboratorio autónomo: dashboards, alertas, troubleshooting |
| 10 min | Preguntas + checkpoint |

---

## Helm: gestor de paquetes Kubernetes

### Conceptos clave

| Concepto | Descripción |
|----------|-------------|
| **Chart** | Paquete Helm (templates + values + metadata) |
| **Release** | Instancia de chart en cluster (nombre + namespace + revision) |
| **Repository** | Servidor HTTP con charts empaquetados (.tgz) |
| **Template** | Archivo YAML con Go templates (Sprig functions) |
| **Values** | Valores por defecto (values.yaml) + overrides |
| **Hooks** | Operaciones en lifecycle: pre-install, post-upgrade, etc. |
| **Dependencies** | Subcharts (requirements.yaml → Chart.yaml dependencies) |

### Flujo de trabajo

```
┌─────────────┐     helm install/upgrade      ┌─────────────┐
│  Chart      │ ────────────────────────────► │  Release    │
│  (templates,│  values.yaml + --set +        │  (manifests │
│   values,   │  values-prod.yaml             │   applied   │
│   Chart.yaml)│                               │   to K8s)   │
└─────────────┘                               └─────────────┘
       │                                           │
       │ helm template (dry-run)                   │ helm get manifest
       ▼                                           ▼
┌─────────────┐                               ┌─────────────┐
│  Rendered   │                               │  History    │
│  manifests  │                               │  (revisions)│
└─────────────┘                               └─────────────┘
```

---

## Estructura de chart profesional

```
charts/curso-app/
├── Chart.yaml              # Metadatos, dependencias
├── values.yaml             # Valores por defecto
├── values-dev.yaml         # Overrides desarrollo
├── values-staging.yaml     # Overrides staging
├── values-prod.yaml        # Overrides producción
├── .helmignore             # Archivos a excluir del package
├── README.md               # Documentación (generable: helm-docs)
├── templates/
│   ├── _helpers.tpl        # Funciones y partials reutilizables
│   ├── NOTES.txt           # Mensaje post-install
│   ├── namespace.yaml      # Namespace (opcional)
│   ├── frontend-*.yaml     # Deployment, Service, Ingress, HPA, PDB
│   ├── api-*.yaml
│   ├── worker-*.yaml
│   ├── db-*.yaml           # O usar subchart postgresql
│   ├── redis-*.yaml        # O usar subchart redis
│   ├── secrets.yaml        # Secrets (plantilla, valores en values)
│   ├── configmaps.yaml
│   ├── servicemonitor.yaml # Prometheus ServiceMonitor
│   ├── poddisruptionbudget.yaml
│   ├── networkpolicy.yaml
│   ├── limitrange.yaml
│   └── resourcequota.yaml
├── charts/                 # Subcharts descargados (gitignored)
│   ├── postgresql-12.5.0.tgz
│   └── redis-18.0.0.tgz
└── tests/                  # Test charts (helm test)
    └── test-connection.yaml
```

---

## Chart.yaml completo

```yaml
# Chart.yaml
apiVersion: v2
name: curso-app
description: Helm chart para la aplicación del curso Docker Fundamentals
type: application
version: 1.2.0
appVersion: "1.2.0"
kubeVersion: ">=1.24.0-0"
keywords:
  - docker
  - kubernetes
  - microservices
  - frontend
  - api
  - worker
home: https://github.com/agile611/curso-docker
sources:
  - https://github.com/agile611/curso-docker
maintainers:
  - name: Guillem Hernández
    email: guillem@agile611.com
    url: https://agile611.com
icon: https://www.agile611.com/wp-content/uploads/2020/09/Negativo.png
deprecated: false
annotations:
  artifacthub.io/changes: |
    - kind: added
      description: Added HPA and PDB for all services
    - kind: changed
      description: Updated postgresql dependency to 12.5.0
dependencies:
  - name: postgresql
    version: "12.5.0"
    repository: "https://charts.bitnami.com/bitnami"
    condition: postgresql.enabled
    tags:
      - database
  - name: redis
    version: "18.0.0"
    repository: "https://charts.bitnami.com/bitnami"
    condition: redis.enabled
    tags:
      - cache
```

---

## values.yaml: valores por defecto

```yaml
# values.yaml
global:
  registry: ghcr.io
  imageOwner: owner
  imageTag: latest
  imagePullSecrets: []
  # imagePullSecrets:
  #   - name: ghcr-secret
  namespace: production
  fullnameOverride: ""
  nameOverride: ""
  labels:
    app.kubernetes.io/managed-by: Helm
  annotations: {}

# Common settings
common:
  securityContext:
    runAsNonRoot: true
    runAsUser: 1001
    runAsGroup: 1001
    fsGroup: 1001
    seccompProfile:
      type: RuntimeDefault
  containerSecurityContext:
    allowPrivilegeEscalation: false
    capabilities:
      drop: ["ALL"]
    readOnlyRootFilesystem: true
  resources:
    limits:
      cpu: "500m"
      memory: "512Mi"
    requests:
      cpu: "100m"
      memory: "128Mi"
  livenessProbe:
    httpGet:
      path: /healthz
      port: http
    initialDelaySeconds: 15
    periodSeconds: 30
    timeoutSeconds: 3
    failureThreshold: 3
  readinessProbe:
    httpGet:
      path: /healthz
      port: http
    initialDelaySeconds: 5
    periodSeconds: 10
    timeoutSeconds: 2
    failureThreshold: 3
  startupProbe:
    httpGet:
      path: /healthz
      port: http
    initialDelaySeconds: 0
    periodSeconds: 5
    timeoutSeconds: 3
    failureThreshold: 30
  volumes:
    - name: tmp
      emptyDir:
        medium: Memory
        sizeLimit: 100Mi
    - name: var-run
      emptyDir:
        medium: Memory
        sizeLimit: 10Mi
    - name: cache
      emptyDir:
        medium: Memory
        sizeLimit: 50Mi
  volumeMounts:
    - name: tmp
      mountPath: /tmp
    - name: var-run
      mountPath: /var/run
    - name: cache
      mountPath: /var/cache/app

# Frontend
frontend:
  enabled: true
  replicaCount: 2
  image:
    repository: frontend
    tag: ""
    pullPolicy: IfNotPresent
  service:
    type: ClusterIP
    port: 8080
  ingress:
    enabled: true
    className: nginx
    host: frontend.example.com
    annotations:
      nginx.ingress.kubernetes.io/rewrite-target: /
    tls: []
  hpa:
    enabled: true
    minReplicas: 2
    maxReplicas: 10
    targetCPUUtilization: 70
  pdb:
    enabled: true
    minAvailable: 1

# API
api:
  enabled: true
  replicaCount: 3
  image:
    repository: api
    tag: ""
    pullPolicy: IfNotPresent
  service:
    type: ClusterIP
    port: 3000
  env:
    NODE_ENV: production
  envFromSecrets:
    - db_password
    - jwt_secret
  hpa:
    enabled: true
    minReplicas: 3
    maxReplicas: 20
    targetCPUUtilization: 70
    targetMemoryUtilization: 80
  pdb:
    enabled: true
    minAvailable: 2

# Worker
worker:
  enabled: true
  replicaCount: 2
  image:
    repository: worker
    tag: ""
    pullPolicy: IfNotPresent
  envFromSecrets:
    - db_password
    - jwt_secret
  pdb:
    enabled: true
    minAvailable: 1

# PostgreSQL (subchart bitnami)
postgresql:
  enabled: true
  auth:
    database: app
    username: postgres
    existingSecret: db-secret
    secretKeys:
      adminPasswordKey: db_password
  primary:
    persistence:
      enabled: true
      size: 10Gi
    resources:
      limits:
        cpu: 1000m
        memory: 1Gi
      requests:
        cpu: 200m
        memory: 256Mi

# Redis (subchart bitnami)
redis:
  enabled: true
  auth:
    enabled: false
  master:
    persistence:
      enabled: true
      size: 2Gi
    resources:
      limits:
        cpu: 250m
        memory: 256Mi
      requests:
        cpu: 50m
        memory: 64Mi

# Secrets (plantilla - valores en values-env.yaml o sealed-secrets)
secrets:
  - name: db-secret
    data:
      db_password: ""
      db_username: "postgres"
  - name: jwt-secret
    data:
      jwt_secret: ""

# NetworkPolicy
networkPolicy:
  enabled: true

# Monitoring
monitoring:
  servicemonitor:
    enabled: true
    interval: 30s
    path: /metrics
```

---

## _helpers.tpl: funciones reutilizables

```yaml
# templates/_helpers.tpl
{{- define "curso-app.namespace" -}}
{{- default .Release.Namespace .Values.global.namespace }}
{{- end }}

{{- define "curso-app.fullname" -}}
{{- if .Values.global.fullnameOverride }}
{{- .Values.global.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.global.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{- define "curso-app.labels" -}}
helm.sh/chart: {{ .Chart.Name }}-{{ .Chart.Version | replace "+" "_" }}
{{ include "curso-app.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{- define "curso-app.selectorLabels" -}}
app.kubernetes.io/name: {{ include "curso-app.fullname" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{- define "curso-app.commonLabels" -}}
{{- include "curso-app.labels" . }}
{{- if .Values.global.labels }}
{{- toYaml .Values.global.labels | nindent 4 }}
{{- end }}
{{- end }}

{{- define "curso-app.commonAnnotations" -}}
{{- if .Values.global.annotations }}
{{- toYaml .Values.global.annotations | nindent 4 }}
{{- end }}
{{- end }}

{{- define "curso-app.securityContext" -}}
{{- toYaml .Values.common.securityContext | nindent 4 }}
{{- end }}

{{- define "curso-app.containerSecurityContext" -}}
{{- toYaml .Values.common.containerSecurityContext | nindent 4 }}
{{- end }}

{{- define "curso-app.resources" -}}
{{- toYaml .Values.common.resources | nindent 4 }}
{{- end }}

{{- define "curso-app.probes" -}}
livenessProbe:
  {{- toYaml .Values.common.livenessProbe | nindent 12 }}
readinessProbe:
  {{- toYaml .Values.common.readinessProbe | nindent 12 }}
startupProbe:
  {{- toYaml .Values.common.startupProbe | nindent 12 }}
{{- end }}

{{- define "curso-app.volumes" -}}
{{- toYaml .Values.common.volumes | nindent 4 }}
{{- end }}

{{- define "curso-app.volumeMounts" -}}
{{- toYaml .Values.common.volumeMounts | nindent 4 }}
{{- end }}
```

---

## Template Deployment genérico

```yaml
# templates/_deployment.tpl
{{- define "curso-app.deployment" -}}
{{- $service := .service -}}
{{- $values := .values -}}
{{- $global := .global -}}
{{- $common := .common -}}
apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{ include "curso-app.fullname" $global }}-{{ $service }}
  namespace: {{ include "curso-app.namespace" $global }}
  labels:
    {{- include "curso-app.commonLabels" $global | nindent 4 }}
    app.kubernetes.io/component: {{ $service }}
  {{- with $values.annotations }}
  annotations:
    {{- toYaml . | nindent 4 }}
  {{- end }}
spec:
  replicas: {{ $values.replicaCount }}
  revisionHistoryLimit: 10
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 25%
      maxUnavailable: 0
  selector:
    matchLabels:
      {{- include "curso-app.selectorLabels" $global | nindent 6 }}
      app.kubernetes.io/component: {{ $service }}
  template:
    metadata:
      labels:
        {{- include "curso-app.selectorLabels" $global | nindent 8 }}
        app.kubernetes.io/component: {{ $service }}
      annotations:
        checksum/config: {{ include (print $.Template.BasePath "/configmaps.yaml") $global | sha256sum }}
        checksum/secrets: {{ include (print $.Template.BasePath "/secrets.yaml") $global | sha256sum }}
        {{- with $values.podAnnotations }}
        {{- toYaml . | nindent 8 }}
        {{- end }}
    spec:
      {{- with $global.imagePullSecrets }}
      imagePullSecrets:
        {{- toYaml . | nindent 8 }}
      {{- end }}
      securityContext:
        {{- include "curso-app.securityContext" $global | nindent 8 }}
      containers:
        - name: {{ $service }}
          image: "{{ $global.registry }}/{{ $global.imageOwner }}/{{ $values.image.repository }}:{{ $values.image.tag | default $global.imageTag }}"
          imagePullPolicy: {{ $values.image.pullPolicy }}
          ports:
            {{- range $port := $values.ports }}
            - name: {{ $port.name }}
              containerPort: {{ $port.containerPort }}
              protocol: {{ $port.protocol | default "TCP" }}
            {{- end }}
          env:
            {{- range $key, $value := $values.env }}
            - name: {{ $key }}
              value: {{ $value | quote }}
            {{- end }}
            {{- range $values.envFromSecrets }}
            - name: {{ . | upper }}
              valueFrom:
                secretKeyRef:
                  name: {{ include "curso-app.fullname" $global }}-{{ . }}
                  key: {{ . }}
            {{- end }}
          resources:
            {{- include "curso-app.resources" $global | nindent 12 }}
          {{- include "curso-app.probes" $global | nindent 10 }}
          securityContext:
            {{- include "curso-app.containerSecurityContext" $global | nindent 12 }}
          volumeMounts:
            {{- include "curso-app.volumeMounts" $global | nindent 12 }}
      volumes:
        {{- include "curso-app.volumes" $global | nindent 8 }}
      {{- with $values.affinity }}
      affinity:
        {{- toYaml . | nindent 8 }}
      {{- end }}
      {{- with $values.topologySpreadConstraints }}
      topologySpreadConstraints:
        {{- toYaml . | nindent 8 }}
      {{- end }}
{{- end }}
```

---

## Uso del template en deployment específico

```yaml
# templates/api-deployment.yaml
{{- if .Values.api.enabled }}
{{- $ctx := dict "service" "api" "values" .Values.api "global" . "common" .Values.common }}
{{- include "curso-app.deployment" $ctx }}
{{- end }}
```

---

## Hooks: lifecycle operations

```yaml
# templates/pre-install-job.yaml
{{- if .Values.db.migrations.enabled }}
apiVersion: batch/v1
kind: Job
metadata:
  name: {{ include "curso-app.fullname" . }}-db-migrate
  namespace: {{ include "curso-app.namespace" . }}
  annotations:
    "helm.sh/hook": pre-install,pre-upgrade
    "helm.sh/hook-weight": "-5"
    "helm.sh/hook-delete-policy": hook-succeeded,hook-failed
  labels:
    {{- include "curso-app.commonLabels" . | nindent 4 }}
spec:
  template:
    metadata:
      labels:
        {{- include "curso-app.selectorLabels" . | nindent 8 }}
        app.kubernetes.io/component: db-migrate
    spec:
      restartPolicy: OnFailure
      containers:
        - name: migrate
          image: "{{ .Values.global.registry }}/{{ .Values.global.imageOwner }}/{{ .Values.api.image.repository }}:{{ .Values.api.image.tag | default .Values.global.imageTag }}"
          command: ["npm", "run", "migrate"]
          env:
            - name: DATABASE_URL
              valueFrom:
                secretKeyRef:
                  name: {{ include "curso-app.fullname" . }}-db-secret
                  key: url
          resources:
            {{- include "curso-app.resources" . | nindent 12 }}
{{- end }}
```

### Hook annotations

| Annotation | Cuándo ejecuta |
|------------|----------------|
| `helm.sh/hook: pre-install` | Antes de crear recursos |
| `helm.sh/hook: post-install` | Después de crear recursos |
| `helm.sh/hook: pre-upgrade` | Antes de actualizar |
| `helm.sh/hook: post-upgrade` | Después de actualizar |
| `helm.sh/hook: pre-delete` | Antes de borrar |
| `helm.sh/hook: post-delete` | Después de borrar |
| `helm.sh/hook: pre-rollback` | Antes de rollback |
| `helm.sh/hook: post-rollback` | Después de rollback |
| `helm.sh/hook-weight: "N"` | Orden (negativo = primero) |
| `helm.sh/hook-delete-policy` | hook-succeeded, hook-failed, before-hook-creation |

---

## Dependencias (subcharts)

```bash
# Añadir repo
helm repo add bitnami https://charts.bitnami.com/bitnami
helm repo update

# Actualizar dependencias (descarga a charts/)
helm dependency update charts/curso-app

# Ver dependencias
helm dependency list charts/curso-app
```

```yaml
# Chart.yaml dependencies (ya visto)
dependencies:
  - name: postgresql
    version: "12.5.0"
    repository: "https://charts.bitnami.com/bitnami"
    condition: postgresql.enabled
    tags:
      - database
  - name: redis
    version: "18.0.0"
    repository: "https://charts.bitnami.com/bitnami"
    condition: redis.enabled
    tags:
      - cache
```

### Override subchart values

```yaml
# values.yaml
postgresql:
  enabled: true
  auth:
    database: app
    username: postgres
    existingSecret: db-secret
    secretKeys:
      adminPasswordKey: db_password
  primary:
    persistence:
      enabled: true
      size: 10Gi
```

---

## Observabilidad Stack: LGTM (Loki, Grafana, Tempo, Mimir/Prometheus)

### Arquitectura

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         OBSERVABILITY STACK                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐  │
│  │  APP        │    │  APP        │    │  APP        │    │  INFRA      │  │
│  │  (metrics)  │    │  (logs)     │    │  (traces)   │    │  (node exp) │  │
│  └──────┬──────┘    └──────┬──────┘    └──────┬──────┘    └──────┬──────┘  │
│         │                  │                  │                  │         │
│         ▼                  ▼                  ▼                  ▼         │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    COLLECTORS                                       │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────┐   │   │
│  │  │ Prometheus  │  │ Promtail    │  │ Tempo       │  │ Node    │   │   │
│  │  │ (scrape)    │  │ (logs)      │  │ (traces)    │  │ Exporter│   │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └─────────┘   │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│         │                  │                  │                  │         │
│         ▼                  ▼                  ▼                  ▼         │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐  │
│  │  STORAGE    │    │  STORAGE    │    │  STORAGE    │    │  STORAGE    │  │
│  │  Prometheus │    │  Loki       │    │  Tempo      │    │  Prometheus │  │
│  │  (TSDB)     │    │  (chunks)   │    │  (blocks)   │    │  (metrics)  │  │
│  └─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘  │
│         │                  │                  │                  │         │
│         └──────────────────┼──────────────────┼──────────────────┘         │
│                            ▼                                              │
│                   ┌─────────────────┐                                    │
│                   │    GRAFANA      │                                    │
│                   │  (visualization)│                                    │
│                   └─────────────────┘                                    │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Componentes

| Componente | Función | Puerto | Protocolo |
|------------|---------|--------|-----------|
| **Prometheus** | Métricas TSDB, scraping, alerting | 9090 | HTTP |
| **Alertmanager** | Gestión alertas, deduplicación, routing | 9093 | HTTP |
| **Grafana** | Dashboards, visualización, alerting UI | 3000 | HTTP |
| **Loki** | Log aggregation, indexing por labels | 3100 | HTTP |
| **Promtail** | Log shipper (DaemonSet) | 9080 | HTTP |
| **Tempo** | Distributed tracing storage | 3200 | HTTP/gRPC |
| **OpenTelemetry Collector** | Recibir traces, exportar a Tempo | 4317/4318 | gRPC/HTTP |

---

## Desplegar stack observabilidad (kube-prometheus-stack + Loki + Tempo)

```bash
# Añadir repos
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo add grafana https://grafana.github.io/helm-charts
helm repo update

# 1. kube-prometheus-stack (Prometheus + Grafana + Alertmanager + NodeExporter + KubeStateMetrics)
helm install monitoring prometheus-community/kube-prometheus-stack \
  -n monitoring --create-namespace \
  --set prometheus.prometheusSpec.retention=15d \
  --set prometheus.prometheusSpec.storageSpec.volumeClaimTemplate.spec.storageClassName=standard \
  --set prometheus.prometheusSpec.storageSpec.volumeClaimTemplate.spec.resources.requests.storage=50Gi \
  --set grafana.enabled=true \
  --set grafana.adminPassword=admin \
  --set grafana.persistence.enabled=true \
  --set grafana.persistence.size=10Gi

# 2. Loki + Promtail
helm install loki grafana/loki-stack \
  -n monitoring \
  --set loki.auth_enabled=false \
  --set loki.commonConfig.replication_factor=1 \
  --set loki.storage.type=filesystem \
  --set loki.storage.filesystem.chunks_directory=/tmp/loki/chunks \
  --set loki.limits_config.retention_period=168h \
  --set promtail.enabled=true

# 3. Tempo
helm install tempo grafana/tempo \
  -n monitoring \
  --set tempo.storage.trace.backend=local \
  --set tempo.storage.trace.local.path=/tmp/tempo \
  --set tempo.retention=168h

# 4. OpenTelemetry Collector (opcional, para traces)
helm install otel-collector open-telemetry/opentelemetry-collector \
  -n monitoring \
  --set mode=daemonset \
  --set config.exporters.otlp.endpoint=tempo.monitoring:4317
```

---

## Instrumentar aplicación

### Métricas (Prometheus client)

```javascript
// apps/api/src/metrics.js
const promClient = require('prom-client');

const register = new promClient.Registry();
promClient.collectDefaultMetrics({ 
  register, 
  prefix: 'app_' 
});

const httpRequestsTotal = new promClient.Counter({
  name: 'http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'path', 'status'],
  registers: [register]
});

const httpRequestDuration = new promClient.Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'path'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 5],
  registers: [register]
});

const activeConnections = new promClient.Gauge({
  name: 'active_connections',
  help: 'Number of active connections',
  registers: [register]
});

// Middleware Express
function metricsMiddleware(req, res, next) {
  const start = Date.now();
  activeConnections.inc();
  
  res.on('finish', () => {
    const duration = (Date.now() - start) / 1000;
    httpRequestsTotal.inc({ method: req.method, path: req.route?.path || req.path, status: res.statusCode });
    httpRequestDuration.observe({ method: req.method, path: req.route?.path || req.path }, duration);
    activeConnections.dec();
  });
  
  next();
}

module.exports = { register, metricsMiddleware, httpRequestsTotal, httpRequestDuration };
```

```javascript
// apps/api/src/server.js (añadir endpoint /metrics)
const { register } = require('./metrics');

app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});
```

### Logs estructurados (JSON)

```javascript
// apps/api/src/logger.js
const winston = require('winston');

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'api' },
  transports: [
    new winston.transports.Console()
  ]
});

module.exports = logger;
```

```javascript
// Uso
const logger = require('./logger');

app.use((req, res, next) => {
  logger.info('HTTP request', {
    method: req.method,
    path: req.path,
    ip: req.ip,
    userAgent: req.get('user-agent')
  });
  next();
});
```

### Traces (OpenTelemetry)

```javascript
// apps/api/src/tracing.js
const { NodeTracerProvider } = require('@opentelemetry/sdk-trace-node');
const { registerInstrumentations } = require('@opentelemetry/instrumentation');
const { HttpInstrumentation } = require('@opentelemetry/instrumentation-http');
const { ExpressInstrumentation } = require('@opentelemetry/instrumentation-express');
const { Resource } = require('@opentelemetry/resources');
const { SemanticResourceAttributes } = require('@opentelemetry/semantic-conventions');
const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-grpc');

const provider = new NodeTracerProvider({
  resource: new Resource({
    [SemanticResourceAttributes.SERVICE_NAME]: 'api',
    [SemanticResourceAttributes.SERVICE_VERSION]: process.env.APP_VERSION || '1.0.0',
    [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: process.env.NODE_ENV || 'production',
  }),
});

const exporter = new OTLPTraceExporter({
  url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://tempo.monitoring:4317',
});

provider.addSpanProcessor(new BatchSpanProcessor(exporter));
provider.register();

registerInstrumentations({
  instrumentations: [
    new HttpInstrumentation(),
    new ExpressInstrumentation(),
  ],
});

module.exports = provider;
```

---

## Grafana: Dashboards y Alertas

### Datasources (configurados automáticamente por kube-prometheus-stack)

```yaml
# Grafana datasources (ConfigMap)
apiVersion: v1
kind: ConfigMap
metadata:
  name: grafana-datasources
  namespace: monitoring
data:
  datasources.yaml: |
    apiVersion: 1
    datasources:
      - name: Prometheus
        type: prometheus
        url: http://prometheus-operated.monitoring:9090
        access: proxy
        isDefault: true
      - name: Loki
        type: loki
        url: http://loki.monitoring:3100
        access: proxy
      - name: Tempo
        type: tempo
        url: http://tempo.monitoring:3200
        access: proxy
```

### Dashboard: Kubernetes Cluster (importar ID 315)

```bash
# En Grafana UI: Dashboards → New → Import → ID 315
# O via ConfigMap:
kubectl apply -f - <<EOF
apiVersion: v1
kind: ConfigMap
metadata:
  name: grafana-dashboard-k8s
  namespace: monitoring
  labels:
    grafana_dashboard: "1"
data:
  k8s-cluster.json: |
    $(curl -s https://grafana.com/api/dashboards/315/revisions/3/download | jq -c .)
EOF
```

### Dashboard custom: App Metrics

```json
{
  "dashboard": {
    "title": "Curso App - API Metrics",
    "panels": [
      {
        "title": "HTTP Requests Rate",
        "type": "graph",
        "targets": [
          {
            "expr": "rate(http_requests_total[5m])",
            "legendFormat": "{{method}} {{path}}"
          }
        ]
      },
      {
        "title": "HTTP Request Duration (p95)",
        "type": "graph",
        "targets": [
          {
            "expr": "histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))",
            "legendFormat": "{{path}}"
          }
        ]
      },
      {
        "title": "Active Connections",
        "type": "graph",
        "targets": [
          {
            "expr": "active_connections",
            "legendFormat": "connections"
          }
        ]
      },
      {
        "title": "Pod Restarts",
        "type": "graph",
        "targets": [
          {
            "expr": "increase(kube_pod_container_status_restarts_total{namespace=\"production\",container=\"api\"}[1h])",
            "legendFormat": "restarts"
          }
        ]
      }
    ]
  }
}
```

### Alertas (PrometheusRule)

```yaml
# templates/prometheusrule.yaml
{{- if .Values.monitoring.alerts.enabled }}
apiVersion: monitoring.coreos.com/v1
kind: PrometheusRule
metadata:
  name: {{ include "curso-app.fullname" . }}-alerts
  namespace: {{ include "curso-app.namespace" . }}
  labels:
    release: monitoring
spec:
  groups:
    - name: curso-app.rules
      rules:
        - alert: HighErrorRate
          expr: |
            sum(rate(http_requests_total{status=~"5.."}[5m])) by (service)
            /
            sum(rate(http_requests_total[5m])) by (service)
            > 0.05
          for: 5m
          labels:
            severity: critical
          annotations:
            summary: "High error rate on {{ $labels.service }}"
            description: "Error rate > 5% for 5 minutes"

        - alert: HighLatency
          expr: |
            histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m])) > 1
          for: 5m
          labels:
            severity: warning
          annotations:
            summary: "High latency on {{ $labels.service }}"
            description: "p95 latency > 1s for 5 minutes"

        - alert: PodRestarts
          expr: |
            increase(kube_pod_container_status_restarts_total{namespace="production"}[1h]) > 3
          for: 5m
          labels:
            severity: warning
          annotations:
            summary: "Pod {{ $labels.pod }} restarting frequently"
            description: "More than 3 restarts in 1 hour"

        - alert: PodNotReady
          expr: |
            kube_pod_status_ready{namespace="production",condition="true"} == 0
          for: 5m
          labels:
            severity: critical
          annotations:
            summary: "Pod {{ $labels.pod }} not ready"
            description: "Pod not ready for 5 minutes"
{{- end }}
```

---

## Laboratorio guiado: Helm chart + Observabilidad

### 1. Crear chart estructura

```bash
mkdir -p charts/curso-app/templates
mkdir -p charts/curso-app/charts
mkdir -p charts/curso-app/tests
```

### 2. Crear Chart.yaml, values.yaml, _helpers.tpl (ver arriba)

### 3. Crear templates principales

```bash
# templates/namespace.yaml
{{- if .Values.global.createNamespace }}
apiVersion: v1
kind: Namespace
metadata:
  name: {{ include "curso-app.namespace" . }}
  labels:
    {{- include "curso-app.commonLabels" . | nindent 4 }}
{{- end }}
```

```bash
# templates/secrets.yaml
{{- range .Values.secrets }}
apiVersion: v1
kind: Secret
metadata:
  name: {{ include "curso-app.fullname" $ }}-{{ .name }}
  namespace: {{ include "curso-app.namespace" $ }}
  labels:
    {{- include "curso-app.commonLabels" $ | nindent 4 }}
type: Opaque
stringData:
  {{- range $key, $value := .data }}
  {{ $key }}: {{ $value | quote }}
  {{- end }}
{{- end }}
```

```bash
# templates/configmaps.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: {{ include "curso-app.fullname" . }}-config
  namespace: {{ include "curso-app.namespace" . }}
  labels:
    {{- include "curso-app.commonLabels" . | nindent 4 }}
data:
  {{- range $key, $value := .Values.global.commonConfig }}
  {{ $key }}: {{ $value | quote }}
  {{- end }}
```

```bash
# templates/servicemonitor.yaml
{{- if .Values.monitoring.servicemonitor.enabled }}
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: {{ include "curso-app.fullname" . }}-api
  namespace: {{ include "curso-app.namespace" . }}
  labels:
    release: monitoring
spec:
  selector:
    matchLabels:
      app.kubernetes.io/name: {{ include "curso-app.fullname" . }}
      app.kubernetes.io/component: api
  endpoints:
    - port: http
      path: {{ .Values.monitoring.servicemonitor.path }}
      interval: {{ .Values.monitoring.servicemonitor.interval }}
{{- end }}
```

```bash
# templates/poddisruptionbudget.yaml
{{- if .Values.api.pdb.enabled }}
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: {{ include "curso-app.fullname" . }}-api
  namespace: {{ include "curso-app.namespace" . }}
spec:
  minAvailable: {{ .Values.api.pdb.minAvailable }}
  selector:
    matchLabels:
      app.kubernetes.io/name: {{ include "curso-app.fullname" . }}
      app.kubernetes.io/component: api
{{- end }}
```

### 4. Actualizar dependencias e instalar

```bash
cd charts/curso-app
helm dependency update

# Dry-run
helm template test . -n production -f values-prod.yaml

# Instalar
helm install curso-app . \
  -n production --create-namespace \
  -f values-prod.yaml \
  --wait --timeout 10m

# Verificar
helm list -n production
kubectl get all -n production
```

### 5. Instalar observabilidad

```bash
# Monitoring stack
helm install monitoring prometheus-community/kube-prometheus-stack \
  -n monitoring --create-namespace \
  -f ../../observability/values.yaml

# Verificar
kubectl get pods -n monitoring
kubectl port-forward -n monitoring svc/monitoring-grafana 3000:80
```

### 6. Ver métricas en Grafana

```bash
# Abrir http://localhost:3000 (admin/admin)
# Importar dashboards:
# - Kubernetes Cluster (ID 315)
# - Node Exporter (ID 1860)
# - Pod Resources (ID 14205)
# - Custom: crear dashboard para métricas de app
```

---

## Laboratorio autónomo: Dashboards y Alertas

### Tarea 1: Crear dashboard custom en Grafana

1. **Dashboards → New → Dashboard → Add panel**
2. **Métricas a graficar:**
   - `rate(http_requests_total[5m])` por path
   - `histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))`
   - `active_connections`
   - `kube_pod_container_status_restarts_total`
3. **Guardar como "Curso App - API"**

### Tarea 2: Configurar alertas en Grafana

1. **Alerting → Contact points → New contact point** (email, Slack, PagerDuty)
2. **Alerting → Notification policies → New policy** (match labels)
3. **Dashboards → Panel → Alert → Create alert rule**
   - Condition: `rate(http_requests_total{status=~"5.."}[5m]) > 0.05`
   - For: 5m
   - Labels: severity=critical

### Tarea 3: Query logs en Loki

```logql
# En Grafana → Explore → Loki
{namespace="production", app="api"} |= "error"
| json
| level = "error"
| __error__ = ""
```

### Tarea 4: Query traces en Tempo

```bash
# En Grafana → Explore → Tempo
# Buscar trace por traceID o service.name="api"
# Ver span duration, errors, logs correlacionados
```

---

## Checkpoint validación

```bash
# validate.sh lab-4-3
#!/usr/bin/env bash
set -euo pipefail

echo "1. Helm chart estructura..."
[[ -f charts/curso-app/Chart.yaml ]] || exit 1
[[ -f charts/curso-app/values.yaml ]] || exit 1
[[ -f charts/curso-app/values-prod.yaml ]] || exit 1
ls charts/curso-app/templates/*.yaml | wc -l | grep -q "^1[0-9]$"

echo "2. Helm dependency update..."
cd charts/curso-app && helm dependency update
ls charts/*.tgz | grep -q postgresql
ls charts/*.tgz | grep -q redis

echo "3. Helm template render..."
helm template test . -n production -f values-prod.yaml > /tmp/rendered.yaml
grep -q "kind: Deployment" /tmp/rendered.yaml
grep -q "kind: Service" /tmp/rendered.yaml
grep -q "kind: Ingress" /tmp/rendered.yaml
grep -q "kind: HorizontalPodAutoscaler" /tmp/rendered.yaml
grep -q "kind: PodDisruptionBudget" /tmp/rendered.yaml
grep -q "kind: ServiceMonitor" /tmp/rendered.yaml

echo "4. Helm install dry-run..."
helm install test . -n production -f values-prod.yaml --dry-run --debug >/dev/null

echo "5. Observabilidad stack..."
helm repo list | grep -q prometheus-community
helm repo list | grep -q grafana

echo "✅ Checkpoint 4.3 superado"
```

---

## Recursos post-sesión

- [Helm docs](https://helm.sh/docs/)
- [Helm chart template guide](https://helm.sh/docs/chart_template_guide/)
- [Helm hooks](https://helm.sh/docs/topics/charts_hooks/)
- [kube-prometheus-stack](https://github.com/prometheus-community/helm-charts/tree/main/charts/kube-prometheus-stack)
- [Loki](https://grafana.com/docs/loki/latest/)
- [Tempo](https://grafana.com/docs/tempo/latest/)
- [Grafana dashboards](https://grafana.com/grafana/dashboards/)
- [Prometheus alerting](https://prometheus.io/docs/alerting/latest/)
- [OpenTelemetry JS](https://opentelemetry.io/docs/instrumentation/js/)