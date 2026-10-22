# Día 4 - 02: Descomposición y verificación (Kubernetes profundo)

## Objetivos de la sesión

- [ ] Dominar recursos K8s core: Pod, Deployment, Service, Ingress, ConfigMap, Secret, PVC.
- [ ] Entender probes: liveness, readiness, startup.
- [ ] Configurar recursos: requests/limits, QoS classes, limit ranges.
- [ ] Implementar HPA, VPA, PodDisruptionBudget.
- [ ] Depurar: kubectl describe, logs, exec, port-forward, events.

---

## Dinámica

| Tiempo | Actividad |
|--------|-----------|
| 10 min | Recap Swarm + preguntas K8s recursos |
| 30 min | Teoría: recursos core, probes, QoS, scheduling |
| 20 min | Demo: kubectl debug, events, resource quotas |
| 10 min | Break |
| 50 min | Laboratorio guiado: deploy completo con todos los recursos |
| 20 min | Laboratorio autónomo: troubleshooting scenarios |
| 10 min | Preguntas + checkpoint |

---

## Recursos core Kubernetes

### Pod: unidad atómica

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: api-pod
  labels:
    app: api
    version: v1.2.3
  annotations:
    prometheus.io/scrape: "true"
    prometheus.io/port: "3000"
spec:
  serviceAccountName: api-sa
  securityContext:
    runAsNonRoot: true
    runAsUser: 1001
    runAsGroup: 1001
    fsGroup: 1001
    seccompProfile:
      type: RuntimeDefault
  initContainers:
    - name: wait-db
      image: busybox:1.36
      command: ['sh', '-c', 'until nc -z db:5432; do sleep 1; done']
  containers:
    - name: api
      image: ghcr.io/owner/api:v1.2.3
      imagePullPolicy: IfNotPresent
      ports:
        - name: http
          containerPort: 3000
        - name: metrics
          containerPort: 9090
      env:
        - name: NODE_ENV
          value: "production"
        - name: DB_PASSWORD
          valueFrom:
            secretKeyRef:
              name: db-secret
              key: db_password
      resources:
        requests:
          cpu: "200m"
          memory: "128Mi"
        limits:
          cpu: "1000m"
          memory: "512Mi"
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
      securityContext:
        allowPrivilegeEscalation: false
        capabilities:
          drop: ["ALL"]
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
  affinity:
    podAntiAffinity:
      preferredDuringSchedulingIgnoredDuringExecution:
        - weight: 100
          podAffinityTerm:
            labelSelector:
              matchExpressions:
                - key: app
                  operator: In
                  values: [api]
            topologyKey: kubernetes.io/hostname
```

### Deployment: declarativo, rolling updates

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: api
  labels:
    app: api
spec:
  replicas: 3
  revisionHistoryLimit: 10
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 25%
      maxUnavailable: 0
  selector:
    matchLabels:
      app: api
  template:
    metadata:
      labels:
        app: api
      annotations:
        checksum/config: {{ include (print $.Template.BasePath "/configmaps.yaml") . | sha256sum }}
        checksum/secrets: {{ include (print $.Template.BasePath "/secrets.yaml") . | sha256sum }}
    spec:
      # ... pod spec como arriba
```

### Service: descubrimiento y load balancing

```yaml
apiVersion: v1
kind: Service
metadata:
  name: api
  labels:
    app: api
spec:
  type: ClusterIP
  selector:
    app: api
  ports:
    - name: http
      port: 3000
      targetPort: http
      protocol: TCP
    - name: metrics
      port: 9090
      targetPort: metrics
      protocol: TCP
  # Session affinity (opcional)
  # sessionAffinity: ClientIP
  # sessionAffinityConfig:
  #   clientIP:
  #     timeoutSeconds: 10800
```

### Ingress: entrada externa HTTP/HTTPS

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: api-ingress
  annotations:
    nginx.ingress.kubernetes.io/rewrite-target: /
    nginx.ingress.kubernetes.io/ssl-redirect: "true"
    cert-manager.io/cluster-issuer: letsencrypt-prod
spec:
  ingressClassName: nginx
  tls:
    - hosts:
        - api.example.com
      secretName: api-tls
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

### ConfigMap y Secret

```yaml
# ConfigMap (no sensible)
apiVersion: v1
kind: ConfigMap
metadata:
  name: api-config
data:
  NODE_ENV: "production"
  LOG_LEVEL: "info"
  FEATURE_FLAG_NEW_UI: "true"
---
# Secret (sensible)
apiVersion: v1
kind: Secret
metadata:
  name: db-secret
type: Opaque
stringData:
  db_password: "super-secret-password"
  db_username: "postgres"
---
# TLS Secret (para Ingress)
apiVersion: v1
kind: Secret
metadata:
  name: api-tls
type: kubernetes.io/tls
data:
  tls.crt: <base64-cert>
  tls.key: <base64-key>
```

### PVC (PersistentVolumeClaim)

```yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: pgdata
spec:
  accessModes:
    - ReadWriteOnce
  storageClassName: standard
  resources:
    requests:
      storage: 10Gi
```

---

## Probes: liveness, readiness, startup

| Probe | Propósito | Cuándo falla | Acción |
|-------|-----------|--------------|--------|
| **liveness** | ¿Está viva la app? | App colgada, deadlock, OOM | Matar pod, reiniciar (restartPolicy) |
| **readiness** | ¿Lista para tráfico? | App iniciando, DB no lista, cache caliente | Quitar de Service endpoints |
| **startup** | ¿Arrancó correctamente? | App lenta al arrancar (migraciones) | Deshabilita liveness/readiness hasta éxito |

### Configuración recomendada

```yaml
# App rápida (Node.js, Go)
livenessProbe:
  httpGet:
    path: /healthz
    port: http
  initialDelaySeconds: 10
  periodSeconds: 30
readinessProbe:
  httpGet:
    path: /healthz
    port: http
  initialDelaySeconds: 5
  periodSeconds: 10

# App lenta (Java, migraciones DB)
startupProbe:
  httpGet:
    path: /healthz
    port: http
  initialDelaySeconds: 0
  periodSeconds: 10
  failureThreshold: 30  # 5 minutos max
livenessProbe:
  httpGet:
    path: /healthz
    port: http
  initialDelaySeconds: 60  # Después de startup
  periodSeconds: 30
readinessProbe:
  httpGet:
    path: /healthz
    port: http
  initialDelaySeconds: 10
  periodSeconds: 10
```

### Tipos de probe

| Tipo | Uso | Ejemplo |
|------|-----|---------|
| `httpGet` | HTTP endpoint | `/healthz`, `/ready` |
| `tcpSocket` | Puerto TCP | DB, Redis, gRPC |
| `exec` | Comando en contenedor | `pgrep`, `cat /tmp/healthy` |
| `grpc` | gRPC health checking | `grpc.health.v1.Health/Check` |

---

## QoS Classes (Quality of Service)

| Clase | requests == limits | Burstable | Garantía |
|-------|-------------------|-----------|----------|
| **Guaranteed** | Sí (CPU y memoria) | No | Máxima prioridad, último en OOM kill |
| **Burstable** | No (al menos uno) | Sí | Media prioridad |
| **BestEffort** | No requests ni limits | Sí | Mínima prioridad, primero en OOM kill |

### Ejemplos

```yaml
# Guaranteed (recomendado para producción)
resources:
  requests:
    cpu: "500m"
    memory: "512Mi"
  limits:
    cpu: "500m"
    memory: "512Mi"

# Burstable
resources:
  requests:
    cpu: "100m"
    memory: "128Mi"
  limits:
    cpu: "1000m"
    memory: "1Gi"

# BestEffort (NO usar en producción)
resources: {}
```

---

## Scheduling: affinity, taints, topology spread

### Node Affinity (preferir/requerir nodes)

```yaml
affinity:
  nodeAffinity:
    requiredDuringSchedulingIgnoredDuringExecution:
      nodeSelectorTerms:
        - matchExpressions:
            - key: node-type
              operator: In
              values: [worker]
    preferredDuringSchedulingIgnoredDuringExecution:
      - weight: 50
        preference:
          matchExpressions:
            - key: zone
              operator: In
              values: [zone-a]
```

### Pod Affinity/Anti-affinity (colocar cerca/lejos de otros pods)

```yaml
affinity:
  podAntiAffinity:
    preferredDuringSchedulingIgnoredDuringExecution:
      - weight: 100
        podAffinityTerm:
          labelSelector:
            matchExpressions:
              - key: app
                operator: In
                values: [api]
          topologyKey: kubernetes.io/hostname  # Distribuir en nodes distintos
```

### Taints y Tolerations (nodes especializados)

```yaml
# Node con GPU
# kubectl taint node gpu-node gpu=true:NoSchedule

# Pod que tolera
tolerations:
  - key: "gpu"
    operator: "Equal"
    value: "true"
    effect: "NoSchedule"
```

### Topology Spread Constraints (distribución uniforme)

```yaml
topologySpreadConstraints:
  - maxSkew: 1
    topologyKey: topology.kubernetes.io/zone
    whenUnsatisfiable: ScheduleAnyway
    labelSelector:
      matchLabels:
        app: api
  - maxSkew: 1
    topologyKey: kubernetes.io/hostname
    whenUnsatisfiable: ScheduleAnyway
    labelSelector:
      matchLabels:
        app: api
```

---

## HPA (Horizontal Pod Autoscaler)

```yaml
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
  maxReplicas: 50
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
    # Custom metrics (requiere Prometheus Adapter)
    - type: Pods
      pods:
        metric:
          name: http_requests_per_second
        target:
          type: AverageValue
          averageValue: "1000"
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

## VPA (Vertical Pod Autoscaler)

```yaml
apiVersion: autoscaling.k8s.io/v1
kind: VerticalPodAutoscaler
metadata:
  name: api-vpa
spec:
  targetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: api
  updatePolicy:
    updateMode: "Auto"  # Off, Initial, Recreate, Auto
  resourcePolicy:
    containerPolicies:
      - containerName: api
        minAllowed:
          cpu: "100m"
          memory: "128Mi"
        maxAllowed:
          cpu: "2000m"
          memory: "2Gi"
        controlledResources: ["cpu", "memory"]
```

---

## PodDisruptionBudget (PDB)

```yaml
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: api-pdb
spec:
  minAvailable: 2  # O maxUnavailable: 1
  selector:
    matchLabels:
      app: api
```

- Protege contra: `kubectl drain`, node upgrades, cluster autoscaler.
- `minAvailable`: mínimo pods disponibles (número o %).
- `maxUnavailable`: máximo pods no disponibles.

---

## LimitRange y ResourceQuota (namespace level)

```yaml
# LimitRange: defaults y límites por contenedor
apiVersion: v1
kind: LimitRange
metadata:
  name: default-limits
spec:
  limits:
    - type: Container
      default:
        cpu: "500m"
        memory: "512Mi"
      defaultRequest:
        cpu: "100m"
        memory: "128Mi"
      max:
        cpu: "2000m"
        memory: "2Gi"
      min:
        cpu: "10m"
        memory: "10Mi"
    - type: Pod
      max:
        cpu: "4000m"
        memory: "4Gi"
```

```yaml
# ResourceQuota: límites totales por namespace
apiVersion: v1
kind: ResourceQuota
metadata:
  name: production-quota
spec:
  hard:
    requests.cpu: "10"
    requests.memory: "20Gi"
    limits.cpu: "20"
    limits.memory: "40Gi"
    persistentvolumeclaims: "10"
    services.loadbalancers: "2"
    secrets: "20"
    configmaps: "20"
```

---

## NetworkPolicy (firewall nivel pod)

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: api-allow-frontend
spec:
  podSelector:
    matchLabels:
      app: api
  policyTypes:
    - Ingress
  ingress:
    - from:
        - podSelector:
            matchLabels:
              app: frontend
      ports:
        - protocol: TCP
          port: 3000
---
# Denegar todo por defecto (default deny)
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: default-deny-all
spec:
  podSelector: {}
  policyTypes:
    - Ingress
    - Egress
```

---

## Laboratorio guiado: Deploy completo K8s

### 1. Namespace y quotas

```bash
kubectl create namespace production
kubectl apply -f - <<EOF
apiVersion: v1
kind: ResourceQuota
metadata:
  name: prod-quota
  namespace: production
spec:
  hard:
    requests.cpu: "10"
    requests.memory: "20Gi"
    limits.cpu: "20"
    limits.memory: "40Gi"
EOF

kubectl apply -f - <<EOF
apiVersion: v1
kind: LimitRange
metadata:
  name: default-limits
  namespace: production
spec:
  limits:
    - type: Container
      default:
        cpu: "500m"
        memory: "512Mi"
      defaultRequest:
        cpu: "100m"
        memory: "128Mi"
EOF
```

### 2. Secrets y ConfigMaps

```bash
# Secrets
kubectl create secret generic db-secret \
  --from-literal=db_password=prod-password \
  --from-literal=db_username=postgres \
  -n production

kubectl create secret generic jwt-secret \
  --from-literal=jwt_secret=prod-jwt-secret \
  -n production

# ConfigMap
kubectl create configmap api-config \
  --from-literal=NODE_ENV=production \
  --from-literal=LOG_LEVEL=info \
  -n production
```

### 3. Deploy API completo

```bash
kubectl apply -f - <<EOF
apiVersion: apps/v1
kind: Deployment
metadata:
  name: api
  namespace: production
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
      securityContext:
        runAsNonRoot: true
        runAsUser: 1001
        fsGroup: 1001
      containers:
        - name: api
          image: ghcr.io/owner/api:latest
          ports:
            - containerPort: 3000
              name: http
          env:
            - name: NODE_ENV
              value: "production"
            - name: DB_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: db-secret
                  key: db_password
          resources:
            requests:
              cpu: "200m"
              memory: "128Mi"
            limits:
              cpu: "1000m"
              memory: "512Mi"
          livenessProbe:
            httpGet:
              path: /healthz
              port: http
            initialDelaySeconds: 15
            periodSeconds: 30
          readinessProbe:
            httpGet:
              path: /healthz
              port: http
            initialDelaySeconds: 5
            periodSeconds: 10
          volumeMounts:
            - name: tmp
              mountPath: /tmp
            - name: var-run
              mountPath: /var/run
      volumes:
        - name: tmp
          emptyDir:
            medium: Memory
            sizeLimit: 100Mi
        - name: var-run
          emptyDir:
            medium: Memory
            sizeLimit: 10Mi
EOF
```

### 4. Service, Ingress, HPA, PDB

```bash
# Service
kubectl apply -f - <<EOF
apiVersion: v1
kind: Service
metadata:
  name: api
  namespace: production
spec:
  selector:
    app: api
  ports:
    - name: http
      port: 3000
      targetPort: http
EOF

# Ingress
kubectl apply -f - <<EOF
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: api-ingress
  namespace: production
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
EOF

# HPA
kubectl apply -f - <<EOF
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: api-hpa
  namespace: production
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
EOF

# PDB
kubectl apply -f - <<EOF
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: api-pdb
  namespace: production
spec:
  minAvailable: 2
  selector:
    matchLabels:
      app: api
EOF
```

### 5. Verificar y testear

```bash
# Ver estado
kubectl get all -n production
kubectl get hpa,pdb -n production

# Test rolling update
kubectl set image deployment/api api=ghcr.io/owner/api:v1.1.0 -n production
kubectl rollout status deployment/api -n production

# Test HPA (generar carga)
kubectl run -i --rm load-test --image=busybox --restart=Never -- \
  sh -c "while true; do wget -q -O- http://api.production.svc.cluster.local:3000/; done"

# Ver HPA escalando
kubectl get hpa api-hpa -n production -w

# Test PDB (simular drain)
kubectl drain <node-name> --ignore-daemonsets --delete-emptydir-data
# Verificar que minAvailable se respeta
```

---

## Laboratorio autónomo: Troubleshooting scenarios

### Escenario 1: Pod en CrashLoopBackOff

```bash
# 1. Ver eventos
kubectl describe pod api-xxx -n production

# 2. Ver logs previos
kubectl logs api-xxx -n production --previous

# 3. Ver recursos
kubectl top pod api-xxx -n production

# 4. Debug interactivo
kubectl debug -it api-xxx --image=busybox --target=api -n production
```

### Escenario 2: Pod Pending

```bash
# 1. Ver eventos
kubectl describe pod api-xxx -n production

# 2. Causas comunes:
# - Recursos insuficientes (requests > capacity)
# - PVC no bound (storage class, capacity)
# - Node selector/affinity no match
# - Taints sin toleration
# - ImagePullBackOff (imagen no existe, no auth)
```

### Escenario 3: Service no funciona

```bash
# 1. Ver endpoints
kubectl get endpoints api -n production

# 2. Ver labels match
kubectl get pods -l app=api -n production --show-labels

# 3. Test DNS
kubectl run -i --rm test-dns --image=busybox --restart=Never -- nslookup api.production

# 4. Test conectividad
kubectl run -i --rm test-curl --image=curlimages/curl --restart=Never -- curl -v http://api.production:3000/healthz
```

### Escenario 4: OOM Killed

```bash
# 1. Ver eventos
kubectl describe pod api-xxx -n production | grep -A 5 OOM

# 2. Aumentar limits.memory
kubectl patch deployment api -n production -p '{"spec":{"template":{"spec":{"containers":[{"name":"api","resources":{"limits":{"memory":"1Gi"}}]}}}}'

# 3. Ver QoS class
kubectl get pod api-xxx -n production -o jsonpath='{.status.qosClass}'
```

---

## Checkpoint validación

```bash
# validate.sh lab-4-2
#!/usr/bin/env bash
set -euo pipefail

echo "1. Namespace production con quota..."
kubectl get ns production
kubectl get resourcequota -n production | grep -q prod-quota

echo "2. Deployment api con 3 replicas..."
kubectl get deployment api -n production -o jsonpath='{.spec.replicas}' | grep -q 3

echo "3. Probes configurados..."
kubectl get deployment api -n production -o jsonpath='{.spec.template.spec.containers[0].livenessProbe}' | grep -q healthz
kubectl get deployment api -n production -o jsonpath='{.spec.template.spec.containers[0].readinessProbe}' | grep -q healthz

echo "4. Resources requests/limits..."
kubectl get deployment api -n production -o jsonpath='{.spec.template.spec.containers[0].resources}' | grep -q requests

echo "5. Service + Ingress..."
kubectl get svc api -n production
kubectl get ingress api-ingress -n production

echo "6. HPA..."
kubectl get hpa api-hpa -n production

echo "7. PDB..."
kubectl get pdb api-pdb -n production

echo "8. Security context non-root..."
kubectl get deployment api -n production -o jsonpath='{.spec.template.spec.securityContext.runAsNonRoot}' | grep -q true

echo "✅ Checkpoint 4.2 superado"
```

---

## Recursos post-sesión

- [Kubernetes API reference](https://kubernetes.io/docs/reference/generated/kubernetes-api/v1.28/)
- [kubectl reference](https://kubernetes.io/docs/reference/kubectl/)
- [Probes](https://kubernetes.io/docs/tasks/configure-pod-container/configure-liveness-readiness-startup-probes/)
- [QoS classes](https://kubernetes.io/docs/tasks/configure-pod-container/quality-service-pod/)
- [HPA](https://kubernetes.io/docs/tasks/run-application/horizontal-pod-autoscale/)
- [VPA](https://github.com/kubernetes/autoscaler/tree/master/vertical-pod-autoscaler)
- [PodDisruptionBudget](https://kubernetes.io/docs/tasks/run-application/configure-pdb/)
- [NetworkPolicy](https://kubernetes.io/docs/concepts/services-networking/network-policies/)
- [Troubleshooting](https://kubernetes.io/docs/tasks/debug/debug-application/)