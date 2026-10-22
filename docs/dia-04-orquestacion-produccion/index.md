# Día 4 · Orquestación y Producción

## Objetivos del día

- [ ] Entender Docker Swarm mode: servicios, stacks, secrets, configs, routing mesh, rollback.
- [ ] Introducción a Kubernetes: kind/k3d, kubectl, pods, services, deployments, ingress, HPA.
- [ ] Migrar stack Compose a Kubernetes con Kompose y Helm.
- [ ] Crear Helm charts: templates, values, dependencies, releases, rollback.
- [ ] Implementar observabilidad: logging (Loki), métricas (Prometheus/Grafana), tracing (Tempo/Jaeger).
- [ ] Desplegar stack completo en kind con Helm + observabilidad.

---

## 4.1 Docker Swarm: modo nativo de orquestación

### Inicializar Swarm

```bash
# Manager node
docker swarm init --advertise-addr 192.168.1.10

# Worker nodes (usar token del init)
docker swarm join --token SWMTKN-1-xxx 192.168.1.10:2377

# Ver nodos
docker node ls
```

### Servicios vs Contenedores

| Concepto | Contenedor (`docker run`) | Servicio (`docker service create`) |
|----------|---------------------------|-----------------------------------|
| **Escalado** | Manual (`docker run` x N) | Declarativo (`replicas: 3`) |
| **Actualización** | Manual (stop, rm, run) | Rolling update automático |
| **Red** | Bridge/overlay manual | Overlay automático + DNS |
| **Secrets/Configs** | Volumes/bind mounts | Objetos nativos (encriptados) |
| **Placement** | Manual | Constraints, preferences |
| **Healthcheck** | Container-level | Service-level + restart policy |
| **Rollback** | Manual | `docker service rollback` |

### Crear servicio

```bash
# Servicio básico
docker service create \
  --name api \
  --replicas 3 \
  --network mi-overlay \
  --publish published=3000,target=3000,mode=ingress \
  --env NODE_ENV=production \
  --secret jwt_secret \
  --mount type=volume,source=pgdata,target=/var/lib/postgresql/data \
  --constraint 'node.role == worker' \
  --restart-condition on-failure \
  --update-parallelism 1 \
  --update-delay 10s \
  ghcr.io/owner/api:latest
```

### Stacks (Compose en Swarm)

```bash
# Deploy stack desde compose
docker stack deploy -c docker-compose.yml -c docker-compose.prod.yml mi-app

# Ver servicios del stack
docker stack services mi-app

# Ver tasks (contenedores reales)
docker stack ps mi-app

# Escalar servicio
docker service scale mi-app_api=5

# Actualizar imagen (rolling update)
docker service update --image ghcr.io/owner/api:v1.1.0 mi-app_api

# Rollback
docker service rollback mi-app_api

# Logs agregados
docker service logs -f mi-app_api
```

### Secrets y Configs en Swarm

```bash
# Secrets (encriptados en raft log)
echo "super-secret" | docker secret create db_password -
echo "jwt-key" | docker secret create jwt_secret -

# Configs
docker config create nginx_config ./apps/frontend/nginx.conf

# Usar en servicio
docker service create \
  --name api \
  --secret source=db_password,target=/run/secrets/db_password,mode=0400 \
  --config source=nginx_config,target=/etc/nginx/conf.d/default.conf \
  ghcr.io/owner/api:latest
```

---

## Sesión práctica 4.1: Docker Swarm

### Objetivo
Desplegar y gestionar aplicaciones en Docker Swarm: servicios, stacks, rolling updates, rollback.

### Duración: 60 minutos

### Pasos guiados

#### 1. Inicializar Swarm
```bash
# En manager
docker swarm init --advertise-addr $(hostname -I | awk '{print $1}')

# Ver token para workers
docker swarm join-token worker

# Ver nodos
docker node ls
```

#### 2. Crear red overlay
```bash
docker network create --driver overlay --attachable mi-overlay
```

#### 3. Crear secrets
```bash
echo "prod-db-pass" | docker secret create db_password -
echo "prod-jwt-secret" | docker secret create jwt_secret -
docker secret ls
```

#### 4. Deploy stack
```bash
# Usar compose files del día 2-3
docker stack deploy -c docker-compose.yml -c docker-compose.prod.yml curso-swarm

# Ver servicios
docker stack services curso-swarm

# Ver tasks (contenedores reales)
docker stack ps curso-swarm
```

#### 5. Operaciones comunes
```bash
# Escalar
docker service scale curso-swarm_api=5

# Actualizar imagen (rolling update)
docker service update --image ghcr.io/owner/api:v1.1.0 curso-swarm_api

# Ver progreso rolling update
docker service ps curso-swarm_api --no-trunc

# Rollback
docker service rollback curso-swarm_api

# Logs agregados
docker service logs -f curso-swarm_api

# Inspeccionar servicio
docker service inspect curso-swarm_api --pretty
```

#### 6. Test failover
```bash
# Matar un task
TASK_ID=$(docker service ps curso-swarm_api -q | head -1)
CONTAINER_ID=$(docker inspect -f '{{.Status.ContainerStatus.ContainerID}}' $TASK_ID)
docker kill $CONTAINER_ID

# Verificar reschedule
docker service ps curso-swarm_api
```

#### 7. Limpieza
```bash
docker stack rm curso-swarm
docker secret rm db_password jwt_secret
```

### Ejercicios de práctica

1. **Ejercicio 1**: Desplegar un stack con 3 servicios y probar escalado automático
2. **Ejercicio 2**: Realizar rolling update y rollback manual
3. **Ejercicio 3**: Simular fallo de nodo y verificar reschedule

### Verificación
```bash
# validate.sh lab-4-1
#!/usr/bin/env bash
set -euo pipefail

echo "1. Swarm inicializado..."
docker node ls | grep -q Leader

echo "2. Red overlay creada..."
docker network ls | grep -q overlay

echo "3. Secrets creados..."
docker secret ls | grep -q db_password
docker secret ls | grep -q jwt_secret

echo "4. Stack deploy..."
docker stack deploy -c docker-compose.yml -c docker-compose.prod.yml test-swarm
sleep 15
docker stack services test-swarm | grep -q "3/3"
docker stack rm test-swarm

echo "✅ Laboratorio 4.1 completado correctamente"
```

---

## 4.2 Kubernetes: introducción práctica con kind/k3d

### Routing Mesh & Ingress

```
External LB (opcional)
       │
       ▼
┌──────────────────┐
│  Ingress Network │  (overlay, encryptado)
│  (routing mesh)  │
└────────┬─────────┘
         │
    ┌────┴────┐
    ▼         ▼
┌───────┐ ┌───────┐
│ Task 1│ │ Task 2│  (IPVS load balancing)
│ api   │ │ api   │
└───────┘ └───────┘
```

- **Published ports**: `mode=ingress` (default) → routing mesh en todos los nodos.
- **Host mode**: `mode=host` → puerto directo en nodo donde corre task.
- **Internal**: `published=3000,target=3000,protocol=tcp,mode=ingress`

---

## 4.2 Kubernetes: introducción práctica con kind/k3d

### kind (Kubernetes IN Docker)

```bash
# Instalar
brew install kind

# Crear cluster
kind create cluster --name curso-k8s --config kind-config.yaml

# kind-config.yaml
kind: Cluster
apiVersion: kind.x-k8s.io/v1alpha4
nodes:
  - role: control-plane
    kubeadmConfigPatches:
      - |
        kind: InitConfiguration
        nodeRegistration:
          kubeletExtraArgs:
            node-labels: "ingress-ready=true"
    extraPortMappings:
      - containerPort: 80
        hostPort: 80
        protocol: TCP
      - containerPort: 443
        hostPort: 443
        protocol: TCP
  - role: worker
  - role: worker

# Ver cluster
kubectl cluster-info --context kind-curso-k8s
kubectl get nodes
```

### k3d (k3s en Docker)

```bash
# Instalar
brew install k3d

# Crear cluster (más rápido, ligero)
k3d cluster create curso-k8s \
  --agents 2 \
  --port "80:80@loadbalancer" \
  --port "443:443@loadbalancer" \
  --k3s-arg "--disable=traefik@server:0"

# Ver
kubectl get nodes
```

### Recursos básicos

```yaml
# pod.yaml
apiVersion: v1
kind: Pod
metadata:
  name: api-pod
  labels:
    app: api
spec:
  containers:
    - name: api
      image: ghcr.io/owner/api:latest
      ports:
        - containerPort: 3000
      env:
        - name: NODE_ENV
          value: "production"
      resources:
        requests:
          memory: "128Mi"
          cpu: "100m"
        limits:
          memory: "512Mi"
          cpu: "500m"
      livenessProbe:
        httpGet:
          path: /healthz
          port: 3000
        initialDelaySeconds: 15
        periodSeconds: 30
      readinessProbe:
        httpGet:
          path: /healthz
          port: 3000
        initialDelaySeconds: 5
        periodSeconds: 10
```

```yaml
# deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: api
spec:
  replicas: 3
  selector:
    matchLabels:
      app: api
  template:
    metadata:
      labels:
        app: api
    spec:
      containers:
        - name: api
          image: ghcr.io/owner/api:latest
          ports:
            - containerPort: 3000
          env:
            - name: NODE_ENV
              value: "production"
          resources:
            requests:
              memory: "128Mi"
              cpu: "100m"
            limits:
              memory: "512Mi"
              cpu: "500m"
          livenessProbe:
            httpGet:
              path: /healthz
              port: 3000
            initialDelaySeconds: 15
            periodSeconds: 30
          readinessProbe:
            httpGet:
              path: /healthz
              port: 3000
            initialDelaySeconds: 5
            periodSeconds: 10
```

```yaml
# service.yaml
apiVersion: v1
kind: Service
metadata:
  name: api
spec:
  selector:
    app: api
  ports:
    - port: 3000
      targetPort: 3000
  type: ClusterIP
```

```yaml
# ingress.yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: api-ingress
  annotations:
    nginx.ingress.kubernetes.io/rewrite-target: /
spec:
  ingressClassName: nginx
  rules:
    - host: api.example.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: api
                port:
                  number: 3000
```

```yaml
# hpa.yaml (Horizontal Pod Autoscaler)
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: api-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: api
  minReplicas: 3
  maxReplicas: 20
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
    - type: Resource
      resource:
        name: memory
        target:
          type: Utilization
          averageUtilization: 80
  behavior:
    scaleDown:
      stabilizationWindowSeconds: 300
      policies:
        - type: Percent
          value: 10
          periodSeconds: 60
    scaleUp:
      stabilizationWindowSeconds: 0
      policies:
        - type: Percent
          value: 100
          periodSeconds: 15
        - type: Pods
          value: 4
          periodSeconds: 15
      selectPolicy: Max
```

---

## 4.3 Migrar Compose a Kubernetes

### Kompose (convertir compose → K8s manifests)

```bash
# Instalar
brew install kompose

# Convertir
kompose convert -f docker-compose.yml -f docker-compose.prod.yml -o k8s-manifests/

# Resultado en k8s-manifests/
# - api-deployment.yaml
# - frontend-deployment.yaml
# - worker-deployment.yaml
# - db-deployment.yaml
# - redis-deployment.yaml
# - api-service.yaml
# - frontend-service.yaml
# - db-service.yaml
# - redis-service.yaml
# - pgdata-persistentvolumeclaim.yaml
# - redisdata-persistentvolumeclaim.yaml
# - db_password-secret.yaml
# - jwt_secret-secret.yaml
```

### Ajustes post-Kompose

```bash
# 1. Revisar y ajustar manifests
# 2. Añadir: ingress, HPA, PodDisruptionBudget, NetworkPolicy
# 3. Separar en: base/, overlays/dev/, overlays/prod/ (Kustomize)
# 4. O mejor: crear Helm chart (ver 4.4)
```

---

## 4.4 Helm: gestor de paquetes Kubernetes

### Estructura de chart

```
charts/curso-app/
├── Chart.yaml
├── values.yaml
├── values-dev.yaml
├── values-prod.yaml
├── templates/
│   ├── _helpers.tpl
│   ├── namespace.yaml
│   ├── frontend-deployment.yaml
│   ├── frontend-service.yaml
│   ├── frontend-ingress.yaml
│   ├── api-deployment.yaml
│   ├── api-service.yaml
│   ├── api-hpa.yaml
│   ├── worker-deployment.yaml
│   ├── db-deployment.yaml
│   ├── db-service.yaml
│   ├── db-pvc.yaml
│   ├── redis-deployment.yaml
│   ├── redis-service.yaml
│   ├── secrets.yaml
│   ├── configmaps.yaml
│   ├── servicemonitor.yaml
│   └── poddisruptionbudget.yaml
├── charts/              # Dependencias (subcharts)
│   ├── postgresql-12.5.0.tgz
│   └── redis-18.0.0.tgz
└── README.md
```

### Chart.yaml

```yaml
# Chart.yaml
apiVersion: v2
name: curso-app
description: Helm chart para la aplicación del curso Docker Fundamentals
type: application
version: 1.0.0
appVersion: "1.0.0"
keywords:
  - docker
  - kubernetes
  - microservices
maintainers:
  - name: Guillem Hernández
    email: guillem@agile611.com
dependencies:
  - name: postgresql
    version: "12.5.0"
    repository: "https://charts.bitnami.com/bitnami"
    condition: postgresql.enabled
  - name: redis
    version: "18.0.0"
    repository: "https://charts.bitnami.com/bitnami"
    condition: redis.enabled
```

### values.yaml (valores por defecto)

```yaml
# values.yaml
global:
  registry: ghcr.io
  imageOwner: owner
  imageTag: latest
  imagePullSecrets: []
  # imagePullSecrets:
  #   - name: ghcr-secret

  # Common labels
  labels:
    app.kubernetes.io/managed-by: Helm
    app.kubernetes.io/instance: curso-app

  # Common annotations
  annotations: {}

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
  resources:
    limits:
      cpu: 500m
      memory: 256Mi
    requests:
      cpu: 100m
      memory: 64Mi
  livenessProbe:
    httpGet:
      path: /healthz
      port: 8080
    initialDelaySeconds: 10
    periodSeconds: 30
  readinessProbe:
    httpGet:
      path: /healthz
      port: 8080
    initialDelaySeconds: 5
    periodSeconds: 10

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
  resources:
    limits:
      cpu: 1000m
      memory: 512Mi
    requests:
      cpu: 200m
      memory: 128Mi
  livenessProbe:
    httpGet:
      path: /healthz
      port: 3000
    initialDelaySeconds: 15
    periodSeconds: 30
  readinessProbe:
    httpGet:
      path: /healthz
      port: 3000
    initialDelaySeconds: 5
    periodSeconds: 10
  hpa:
    enabled: true
    minReplicas: 3
    maxReplicas: 20
    targetCPUUtilization: 70
    targetMemoryUtilization: 80

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
  resources:
    limits:
      cpu: 500m
      memory: 256Mi
    requests:
      cpu: 100m
      memory: 64Mi

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

# Secrets (creados externamente o via sealed-secrets)
secrets:
  - name: db-secret
    data:
      db_password: ""  # Rellenar en values-prod.yaml o sealed-secret
  - name: jwt-secret
    data:
      jwt_secret: ""

# NetworkPolicy
networkPolicy:
  enabled: true
  ingress:
    - from:
        - namespaceSelector:
            matchLabels:
              name: ingress-nginx
      ports:
        - protocol: TCP
          port: 8080
        - protocol: TCP
          port: 3000

# PodDisruptionBudget
pdb:
  enabled: true
  frontend:
    minAvailable: 1
  api:
    minAvailable: 2
  worker:
    minAvailable: 1
  db:
    minAvailable: 1
  redis:
    minAvailable: 1
```

### Template ejemplo: `templates/api-deployment.yaml`

```yaml
# templates/api-deployment.yaml
{{- if .Values.api.enabled }}
apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{ include "curso-app.fullname" . }}-api
  namespace: {{ include "curso-app.namespace" . }}
  labels:
    {{- include "curso-app.labels" . | nindent 4 }}
    app.kubernetes.io/component: api
spec:
  replicas: {{ .Values.api.replicaCount }}
  selector:
    matchLabels:
      {{- include "curso-app.selectorLabels" . | nindent 6 }}
      app.kubernetes.io/component: api
  template:
    metadata:
      labels:
        {{- include "curso-app.selectorLabels" . | nindent 8 }}
        app.kubernetes.io/component: api
      annotations:
        checksum/config: {{ include (print $.Template.BasePath "/configmaps.yaml") . | sha256sum }}
        checksum/secrets: {{ include (print $.Template.BasePath "/secrets.yaml") . | sha256sum }}
    spec:
      {{- with .Values.global.imagePullSecrets }}
      imagePullSecrets:
        {{- toYaml . | nindent 8 }}
      {{- end }}
      securityContext:
        runAsNonRoot: true
        runAsUser: 1001
        runAsGroup: 1001
        fsGroup: 1001
        seccompProfile:
          type: RuntimeDefault
      containers:
        - name: api
          image: "{{ .Values.global.registry }}/{{ .Values.global.imageOwner }}/{{ .Values.api.image.repository }}:{{ .Values.api.image.tag | default .Values.global.imageTag }}"
          imagePullPolicy: {{ .Values.api.image.pullPolicy }}
          ports:
            - name: http
              containerPort: 3000
              protocol: TCP
          env:
            {{- range $key, $value := .Values.api.env }}
            - name: {{ $key }}
              value: {{ $value | quote }}
            {{- end }}
            {{- range .Values.api.envFromSecrets }}
            - name: {{ . | upper }}
              valueFrom:
                secretKeyRef:
                  name: {{ include "curso-app.fullname" $ }}-{{ . }}
                  key: {{ . }}
            {{- end }}
          resources:
            {{- toYaml .Values.api.resources | nindent 12 }}
          livenessProbe:
            {{- toYaml .Values.api.livenessProbe | nindent 12 }}
          readinessProbe:
            {{- toYaml .Values.api.readinessProbe | nindent 12 }}
          securityContext:
            allowPrivilegeEscalation: false
            capabilities:
              drop:
                - ALL
            readOnlyRootFilesystem: true
          volumeMounts:
            - name: tmp
              mountPath: /tmp
            - name: var-run
              mountPath: /var/run
            - name: cache
              mountPath: /var/cache/app
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
{{- end }}
```

### `_helpers.tpl`

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
```

---

## 4.5 Observabilidad: Logging, Métricas, Tracing

### Stack observabilidad (LGTM: Loki, Grafana, Tempo, Mimir/Prometheus)

```yaml
# observability/values.yaml (para kube-prometheus-stack + loki + tempo)
prometheus:
  prometheusSpec:
    retention: 15d
    storageSpec:
      volumeClaimTemplate:
        spec:
          storageClassName: standard
          resources:
            requests:
              storage: 50Gi

grafana:
  enabled: true
  adminPassword: admin
  persistence:
    enabled: true
    size: 10Gi
  dashboards:
    default:
      kubernetes-cluster:
        gnetId: 315
        revision: 3
        datasource: Prometheus
      node-exporter:
        gnetId: 1860
        revision: 28
        datasource: Prometheus

loki:
  enabled: true
  loki:
    auth_enabled: false
    commonConfig:
      replication_factor: 1
    storage:
      type: filesystem
      filesystem:
        chunks_directory: /tmp/loki/chunks
        rules_directory: /tmp/loki/rules
    limits_config:
      retention_period: 168h
    chunk_store_config:
      max_look_back_period: 168h

tempo:
  enabled: true
  tempo:
    storage:
      trace:
        backend: local
        local:
          path: /tmp/tempo
    retention: 168h

promtail:
  enabled: true
  config:
    clients:
      - url: http://loki:3100/loki/api/v1/push
    positions:
      filename: /tmp/positions.yaml
```

### Desplegar stack observabilidad

```bash
# Añadir repos
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo add grafana https://grafana.github.io/helm-charts
helm repo update

# Instalar kube-prometheus-stack (Prometheus + Grafana + Alertmanager)
helm install monitoring prometheus-community/kube-prometheus-stack \
  -n monitoring --create-namespace \
  -f observability/values.yaml

# Instalar Loki + Promtail
helm install loki grafana/loki-stack \
  -n monitoring \
  -f observability/values.yaml

# Instalar Tempo
helm install tempo grafana/tempo \
  -n monitoring \
  -f observability/values.yaml
```

### ServiceMonitor para métricas de la app

```yaml
# templates/servicemonitor.yaml
{{- if .Values.api.enabled }}
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
      path: /metrics
      interval: 30s
{{- end }}
```

### Métricas en la aplicación (Node.js + Prometheus client)

```javascript
// apps/api/src/metrics.js
const promClient = require('prom-client');

const register = new promClient.Registry();
promClient.collectDefaultMetrics({ register });

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

module.exports = { register, httpRequestsTotal, httpRequestDuration };
```

---

## 4.6 Laboratorio 4.1: Swarm deploy + migración a kind

### Parte A: Deploy en Swarm

```bash
# 1. Inicializar Swarm
docker swarm init

# 2. Crear secrets
echo "prod-db-pass" | docker secret create db_password -
echo "prod-jwt-secret" | docker secret create jwt_secret -

# 3. Deploy stack
docker stack deploy -c docker-compose.yml -c docker-compose.prod.yml curso-swarm

# 4. Verificar
docker stack services curso-swarm
docker stack ps curso-swarm

# 5. Test rolling update
docker service update --image ghcr.io/owner/api:v1.1.0 curso-swarm_api
docker service ps curso-swarm_api  # Ver rolling

# 6. Test failover
TASK=$(docker service ps curso-swarm_api -q | head -1)
docker kill $(docker inspect -f '{{.Status.ContainerStatus.ContainerID}}' $TASK)
docker service ps curso-swarm_api  # Nuevo task

# 7. Logs
docker service logs -f curso-swarm_api

# 8. Limpieza
docker stack rm curso-swarm
docker secret rm db_password jwt_secret
```

### Parte B: Migración a kind

```bash
# 1. Crear cluster kind
kind create cluster --name curso-k8s --config .github/kind-config.yaml

# 2. Convertir compose a K8s (kompose)
kompose convert -f docker-compose.yml -f docker-compose.prod.yml -o k8s-manifests/

# 3. Ajustar manifests (añadir ingress, HPA, etc.)
# 4. Aplicar
kubectl apply -f k8s-manifests/

# 5. Verificar
kubectl get pods,svc,ingress -n default

# 6. Test
kubectl port-forward svc/frontend 8080:8080
curl http://localhost:8080/healthz
```

---

## 4.7 Laboratorio 4.2: Helm chart + observabilidad

### 1. Crear chart estructura

```bash
mkdir -p charts/curso-app/templates
mkdir -p charts/curso-app/charts
```

### 2. Crear Chart.yaml, values.yaml, templates (ver arriba)

### 3. Instalar dependencias (subcharts)

```bash
cd charts/curso-app
helm dependency update
# Descarga postgresql y redis charts a charts/
```

### 4. Instalar chart en kind

```bash
# 1. Crear namespace
kubectl create namespace production

# 2. Crear secrets (o usar sealed-secrets)
kubectl create secret generic db-secret \
  --from-literal=db_password=prod-password \
  -n production

kubectl create secret generic jwt-secret \
  --from-literal=jwt_secret=prod-jwt \
  -n production

# 3. Instalar chart
helm install curso-app ./charts/curso-app \
  -n production \
  -f values-prod.yaml \
  --wait --timeout 10m

# 4. Verificar
helm list -n production
kubectl get pods,svc,ingress,hpa,pdb -n production
```

### 5. Instalar observabilidad

```bash
# Monitoring stack
helm install monitoring prometheus-community/kube-prometheus-stack \
  -n monitoring --create-namespace \
  -f observability/values.yaml

# Verificar
kubectl get pods -n monitoring
kubectl port-forward -n monitoring svc/monitoring-grafana 3000:80
# Abrir http://localhost:3000 (admin/admin)
```

### 6. Ver métricas en Grafana

```bash
# Importar dashboards:
# - Kubernetes Cluster (ID 315)
# - Node Exporter (ID 1860)
# - Pod Resources (ID 14205)
# - Custom: crear dashboard para métricas de app (http_requests_total, http_request_duration_seconds)
```

---

## 4.8 Caso de uso y entregable día 4

### Aplicación al proyecto

```
mi-curso-docker/
├── charts/
│   └── curso-app/              # Helm chart completo
│       ├── Chart.yaml
│       ├── values.yaml
│       ├── values-dev.yaml
│       ├── values-prod.yaml
│       ├── templates/          # 15+ templates
│       └── charts/             # Subcharts (postgresql, redis)
├── k8s-manifests/              # Kompose output (referencia)
├── observability/
│   └── values.yaml             # Config monitoring stack
├── .github/
│   └── kind-config.yaml        # Kind cluster config
├── docker-compose.prod.yml     # Swarm deploy
└── Makefile (actualizado)
```

### Entregable obligatorio (push antes del día 5)

- [ ] `docker stack deploy` funcional en Swarm (rolling update, rollback, failover probados).
- [ ] Cluster kind/k3d creado y configurado (ingress, ports 80/443).
- [ ] Helm chart `charts/curso-app/` completo:
  - Chart.yaml con dependencias (postgresql, redis bitnami).
  - values.yaml, values-dev.yaml, values-prod.yaml.
  - Templates: deployments, services, ingress, HPA, PDB, secrets, configmaps, servicemonitor.
  - `_helpers.tpl` con helpers.
- [ ] Chart instalado en kind: `helm install` exitoso, todos los pods Running/Ready.
- [ ] Observabilidad stack desplegado (Prometheus, Grafana, Loki, Tempo).
- [ ] Métricas de app visibles en Grafana (http_requests_total, http_request_duration_seconds).
- [ ] Logs agregados en Loki (query: `{namespace="production"}`).
- [ ] Traces en Tempo (si app instrumentada).
- [ ] Capturas de dashboards Grafana en `docs/screenshots/`.
- [ ] Makefile actualizado: `helm-install`, `helm-upgrade`, `helm-rollback`, `monitoring-install`.

### Makefile targets día 4

```makefile
# Añadir a Makefile

swarm-deploy: ## Deploy stack en Swarm
	docker stack deploy -c docker-compose.yml -c docker-compose.prod.yml curso-swarm

swarm-remove: ## Remove stack Swarm
	docker stack rm curso-swarm

swarm-ps: ## Ver tasks Swarm
	docker stack ps curso-swarm

swarm-logs: ## Logs Swarm
	docker service logs -f curso-swarm_api

kind-create: ## Crear cluster kind
	kind create cluster --name curso-k8s --config .github/kind-config.yaml

kind-delete: ## Eliminar cluster kind
	kind delete cluster --name curso-k8s

helm-deps: ## Actualizar dependencias Helm
	cd charts/curso-app && helm dependency update

helm-install: ## Instalar chart en kind (production)
	helm upgrade --install curso-app ./charts/curso-app \
		-n production --create-namespace \
		-f charts/curso-app/values-prod.yaml \
		--wait --timeout 10m

helm-upgrade: ## Actualizar chart
	helm upgrade curso-app ./charts/curso-app \
		-n production \
		-f charts/curso-app/values-prod.yaml \
		--wait --timeout 5m

helm-rollback: ## Rollback chart
	helm rollback curso-app -n production

helm-uninstall: ## Desinstalar chart
	helm uninstall curso-app -n production

monitoring-install: ## Instalar stack observabilidad
	helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
	helm repo add grafana https://grafana.github.io/helm-charts
	helm repo update
	helm install monitoring prometheus-community/kube-prometheus-stack \
		-n monitoring --create-namespace \
		-f observability/values.yaml
	helm install loki grafana/loki-stack -n monitoring -f observability/values.yaml
	helm install tempo grafana/tempo -n monitoring -f observability/values.yaml

monitoring-port-forward: ## Port-forward Grafana
	kubectl port-forward -n monitoring svc/monitoring-grafana 3000:80
```

---

## Checkpoint validación

```bash
# validate.sh lab-4
#!/usr/bin/env bash
set -euo pipefail

echo "1. Swarm deploy..."
docker swarm init 2>/dev/null || true
docker stack deploy -c docker-compose.yml -c docker-compose.prod.yml curso-swarm
sleep 20
docker stack services curso-swarm | grep -q "3/3"  # frontend replicas
docker stack rm curso-swarm

echo "2. Kind cluster..."
kind create cluster --name test-k8s --config .github/kind-config.yaml
kubectl cluster-info --context kind-test-k8s
kind delete cluster --name test-k8s

echo "3. Helm chart estructura..."
[[ -f charts/curso-app/Chart.yaml ]] || exit 1
[[ -f charts/curso-app/values.yaml ]] || exit 1
[[ -f charts/curso-app/values-prod.yaml ]] || exit 1
ls charts/curso-app/templates/*.yaml | wc -l | grep -q "^1[0-9]$"

echo "4. Helm dependency update..."
cd charts/curso-app && helm dependency update
ls charts/*.tgz | grep -q postgresql
ls charts/*.tgz | grep -q redis

echo "5. Helm template render..."
helm template test ./charts/curso-app -n production -f values-prod.yaml > /tmp/rendered.yaml
grep -q "kind: Deployment" /tmp/rendered.yaml
grep -q "kind: Service" /tmp/rendered.yaml
grep -q "kind: Ingress" /tmp/rendered.yaml
grep -q "kind: HorizontalPodAutoscaler" /tmp/rendered.yaml
grep -q "kind: PodDisruptionBudget" /tmp/rendered.yaml

echo "✅ Checkpoint día 4 superado"
```

---

## Recursos post-sesión

- [Docker Swarm docs](https://docs.docker.com/engine/swarm/)
- [Kubernetes docs](https://kubernetes.io/docs/home/)
- [kind](https://kind.sigs.k8s.io/)
- [k3d](https://k3d.io/)
- [Helm docs](https://helm.sh/docs/)
- [Kompose](https://kompose.io/)
- [kube-prometheus-stack](https://github.com/prometheus-community/helm-charts/tree/main/charts/kube-prometheus-stack)
- [Loki](https://grafana.com/docs/loki/latest/)
- [Tempo](https://grafana.com/docs/tempo/latest/)
- [Grafana dashboards](https://grafana.com/grafana/dashboards/)