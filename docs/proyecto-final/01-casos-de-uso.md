# Casos de uso del proyecto final

## CU-01: Gestión de tableros Kanban

### Descripción
Los usuarios pueden crear, visualizar y gestionar tableros estilo Kanban para organizar su trabajo.

### Actores
- Usuario autenticado (member, admin)
- Usuario viewer (solo lectura)

### Flujo principal
1. Usuario accede a dashboard → ve lista de tableros
2. Clic en "Nuevo tablero" → modal con nombre, descripción, plantilla
3. Tablero creado → redirige a vista Kanban
4. Columnas por defecto: "Por hacer", "En progreso", "En revisión", "Hecho"
5. Usuario puede añadir/eliminar/renombrar/reordenar columnas
6. Drag & drop tareas entre columnas (WebSocket sync)
5. Cambios persistidos en BD + notificados a otros usuarios en tiempo real

### Reglas de negocio
- Máximo 50 tableros por usuario (plan free)
- Columnas: mínimo 2, máximo 15
- Nombres de columna únicos por tablero
- Solo owner/admin pueden eliminar tablero

### Criterios de aceptación
- [ ] Crear tablero en < 2s
- [ ] Drag & drop fluido (60fps)
- [ ] Sync tiempo real < 100ms latencia
- [ ] Persistencia inmediata en BD
- [ ] Notificación a colaboradores en < 500ms

---

## CU-02: Autenticación y autorización

### Descripción
Sistema seguro de autenticación con JWT, roles y OAuth2 opcional.

### Actores
- Usuario no autenticado
- Usuario autenticado
- Admin

### Flujo principal: Registro/Login
1. Usuario accede a `/auth/register` o `/auth/login`
2. Formulario: email, password (mín 8 chars, 1 mayús, 1 num, 1 especial)
3. Validación cliente + servidor
3. Si registro: email verificación (token JWT 24h)
4. Si login: credenciales válidas → JWT access (15min) + refresh (7d)
5. Access token en header `Authorization: Bearer <token>`
6. Refresh token en cookie HttpOnly Secure SameSite=Strict

### Flujo: OAuth2 (GitHub/Google)
1. Clic "Login con GitHub" → redirect a provider
2. Usuario autoriza → callback `/auth/callback/github`
3. Backend intercambia code por token → obtiene profile
3. Crea/actualiza usuario → genera JWT pair
4. Redirect a frontend con tokens

### Roles y permisos
| Recurso | Viewer | Member | Admin |
|---------|--------|--------|-------|
| Tableros (lectura) | ✅ | ✅ | ✅ |
| Tableros (escritura) | ❌ | ✅* | ✅ |
| Usuarios (gestión) | ❌ | ❌ | ✅ |
| Configuración sistema | ❌ | ❌ | ✅ |
| Logs auditoría | ❌ | ❌ | ✅ |

*Solo tableros donde es member/owner

### Seguridad
- Password: bcrypt cost 12
- JWT: RS256, rotación claves cada 90 días
- Rate limiting: 5 req/min login, 10 req/min register
- Brute force protection: lockout 15min tras 5 fallos
- Tokens en HttpOnly cookies + CSRF token en header

### Criterios de aceptación
- [ ] Login exitoso en < 500ms
- [ ] Refresh token automático transparente
- [ ] Logout invalida refresh token en BD
- [ ] OAuth2 fluye sin errores
- [ ] Rate limiting efectivo
- [ ] Auditoría de logins en logs

---

## CU-03: Tareas y subtareas

### Descripción
Gestión completa de tareas con jerarquía, asignación, prioridades y colaboración.

### Actores
- Usuario member/admin del tablero

### Flujo principal
1. En tablero Kanban → clic "+" en columna → modal nueva tarea
2. Campos: título (obligatorio), descripción (markdown), prioridad (Baja/Media/Alta/Crítica), etiquetas, fecha límite, asignado
3. Guardar → tarea aparece en columna
4. Clic tarea → modal detalle
5. En detalle: editar campos, añadir subtareas, comentarios, adjuntos, checklist
6. Drag & drop entre columnas → actualiza estado
6. Cambios notificados tiempo real (WebSocket)

### Subtareas
- Anidación máxima 3 niveles
- Progreso automático: % subtareas completadas
- Completar padre → opcional completar hijas

### Comentarios y menciones
- Markdown support
- `@usuario` → notificación push/email
- Historial de cambios (auditoría)

### Etiquetas y filtros
- Etiquetas globales + por tablero
- Filtros: asignado, prioridad, etiqueta, fecha, texto
- Vistas guardadas por usuario

### Criterios de aceptación
- [ ] Crear tarea en < 1s
- [ ] Drag & drop 60fps
- [ ] Subtareas anidadas hasta 3 niveles
- [ ] Menciones notifican en < 1s
- [ ] Filtros combinados funcionan
- [ ] Historial completo auditable

---

## CU-04: Procesamiento asíncrono

### Descripción
Worker Python/Celery procesa tareas en background: emails, reportes, webhooks.

### Actores
- Sistema (event-driven)
- Usuario (recibe notificaciones)

### Colas Redis (BullMQ)
| Cola | Prioridad | Reintentos | Backoff | Tareas típicas |
|------|-----------|------------|---------|----------------|
| `emails` | High | 5 | Exponencial 2^n min | Welcome, notificaciones, reset password |
| `reports` | Low | 3 | Lineal 10min | PDF/Excel reports, exports |
| `webhooks` | High | 10 | Exponencial 2^n min | Integraciones externas (Slack, Teams, custom) |
| `notifications` | Normal | 3 | Exponencial | Push, in-app, email digest |
| `maintenance` | Low | 1 | - | Limpieza DB, backups, métricas |

### Tareas típicas

#### Email de bienvenida
```python
@celery.task(bind=True, max_retries=5, default_retry_delay=60)
def send_welcome_email(self, user_id):
    user = get_user(user_id)
    html = render_template('welcome.html', user=user)
    send_email(user.email, 'Bienvenido a TaskFlow', html)
```

#### Reporte mensual
```python
@celery.task(bind=True, max_retries=3)
def generate_monthly_report(self, board_id, user_id):
    board = get_board(board_id)
    data = aggregate_board_stats(board)
    pdf = generate_pdf_report(board, data)
    upload_to_storage(pdf)
    send_email(user.email, 'Tu reporte mensual', attachment=pdf)
```

#### Webhook con reintentos
```python
@celery.task(bind=True, max_retries=10, autoretry_for=(RequestException,))
def send_webhook(self, url, payload, headers):
    response = requests.post(url, json=payload, headers=headers, timeout=10)
    response.raise_for_status()
    return response.json()
```

### Monitoreo colas
- Métricas: jobs enqueued, processing, completed, failed, retry
- Dashboard Grafana: throughput, latency, error rate por cola
- Alerta: cola > 1000 jobs por 5min → SEV-2
- Dead letter queue: jobs fallidos tras max retries → revisión manual

### Criterios de aceptación
- [ ] Email enviado en < 5s tras evento
- [ ] Reporte generado en < 30s
- [ ] Webhook reintentado con backoff exponencial
- [ ] Dead letter queue accesible para replay
- [ ] Métricas colas en Grafana actualizadas < 30s

---

## CU-05: Observabilidad operacional

### Descripción
Stack completo de observabilidad: métricas, logs, traces, alertas.

### Métricas clave (RED + USE)

#### RED (Request, Error, Duration) - por servicio
| Métrica | Tipo | Descripción | Alerta |
|---------|------|-------------|--------|
| `http_requests_total` | Counter | Total requests por method/path/status | - |
| `http_request_duration_seconds` | Histogram | Latencia p50, p95, p99 | p99 > 1s (warn), > 3s (crit) |
| `http_requests_errors_total` | Counter | Errors 5xx por path | Error rate > 1% (warn), > 5% (crit) |

#### USE (Utilization, Saturation, Errors) - infra
| Métrica | Tipo | Descripción | Alerta |
|---------|------|-------------|--------|
| `container_cpu_usage_seconds_total` | Counter | CPU usage por container | > 80% (warn), > 95% (crit) |
| `container_memory_usage_bytes` | Gauge | Memoria usage | > 80% limit (warn), > 95% (crit) |
| `kube_pod_container_status_restarts_total` | Counter | Restarts | > 3/hora (warn), > 10/hora (crit) |

### Logs estructurados (JSON)
```json
{
  "timestamp": "2024-01-15T10:30:00.123Z",
  "level": "info",
  "service": "api",
  "trace_id": "abc123def456",
  "span_id": "span789",
  "message": "HTTP request completed",
  "method": "POST",
  "path": "/api/tasks",
  "status": 201,
  "duration_ms": 45,
  "user_id": "usr_123",
  "board_id": "brd_456"
}
```

### Traces distribuidos (OpenTelemetry)
- Propagación: `traceparent` header
- Spans: HTTP request, DB query, Redis op, external HTTP
- Atributos: service.name, http.method, http.route, db.statement, error.message
- Muestreo: 10% requests + 100% errors

### Alertas (PrometheusRule)

| Alerta | Expresión | Severidad | Runbook |
|--------|-----------|-----------|---------|
| HighErrorRate | `rate(http_requests_total{status=~"5.."}[5m]) > 0.05` | SEV-1 | rollback/scale |
| HighLatency | `histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m])) > 1` | SEV-2 | scale/optimize |
| PodRestarts | `increase(kube_pod_container_status_restarts_total[1h]) > 3` | SEV-2 | investigate |
| PodNotReady | `kube_pod_status_ready{condition="true"} == 0` | SEV-1 | rollback |
| QueueBacklog | `bullmq_queue_waiting_jobs > 1000` | SEV-2 | scale workers |
| DiskSpace | `disk_usage_percent > 85` | SEV-2 | cleanup/expand |

### Criterios de aceptación
- [ ] Métricas RED disponibles en < 30s
- [ ] Logs queryables en Loki por trace_id
- [ ] Traces visibles en Tempo para 100% errors
- [ ] Alertas disparan en < 2min
- [ ] Runbooks vinculados a cada alerta
- [ ] MTTR < 30min para SEV-1