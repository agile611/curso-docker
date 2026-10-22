# Curso de Prompt Engineering

Aprende a diseñar, probar y mejorar prompts para resolver tareas profesionales con modelos de lenguaje.

El curso combina explicaciones, laboratorios, revisión de resultados y un proyecto que evoluciona durante los cinco días.

La meta no es memorizar fórmulas para obtener respuestas llamativas.

La meta es construir instrucciones claras, comprobar su utilidad y reconocer las condiciones en las que sus resultados pueden utilizarse.

**Duración:** 5 días · 30 horas.

**Enfoque:** práctico, con laboratorios y proyecto final.

**Entorno básico:** una interfaz autorizada de LLM, un editor de texto y una hoja de cálculo.

**Entorno técnico opcional:** API, Python y Git.

Esta página es el índice general del curso.

Presenta el recorrido de aprendizaje, explica cómo utilizar los materiales y propone sesiones para acompañar el trabajo del alumnado.

Las páginas de cada desarrollan las actividades y los contenidos específicos.

Los ejemplos de este índice son originales y utilizan información sintética.

Las referencias docentes describen expectativas, no resultados obtenidos mediante ejecuciones reales.

**El aprendizaje se demuestra mediante instrucciones documentadas, pruebas conservadas y decisiones proporcionadas a la evidencia.**

### 2.5. Prompt Engineering y Prompt Scripting

El curso utiliza dos términos con significados distintos y complementarios.

**Prompt Engineering** comprende el diseño y la evaluación de instrucciones, ejemplos, fuentes, restricciones y contratos de salida para resolver una tarea concreta. Se centra en decidir qué debe pedir el sistema, qué información puede utilizar y cómo reconocer si la respuesta es útil o incorrecta.

**Prompt Scripting** es la organización de prompts mediante plantillas, variables, condiciones, secuencias, validaciones y mecanismos de ejecución para construir procedimientos reutilizables. Puede implementarse de forma manual, con formularios o tablas, con automatizaciones o con código y APIs, según el contexto del proyecto.

La denominación puede variar entre herramientas y organizaciones, pero aquí se mantiene la diferencia operativa:

- El Prompt Engineering define la lógica del trabajo con el lenguaje.
- El Prompt Scripting define la estructura del procedimiento para repetirlo y documentarlo.

No todo flujo de trabajo que use prompts requiere programación. Una plantilla bien documentada, con variables y validaciones, ya puede considerarse un script operativo si sirve para reproducir una tarea en un contexto determinado.

Un caso común del curso es la preparación de una solicitud de formación:

> “Participarán aproximadamente 12 personas. La modalidad será presencial. La duración será de dos horas. Proponemos el 18 de noviembre de 2026. La fecha todavía no está confirmada. No se indica presupuesto.”

Este ejemplo permite practicar extracción, validación y redacción sin convertir la tarea en una operación de contratación o reserva. Se mantiene el contexto relevante y se excluyen acciones que no forman parte del alcance: confirmar disponibilidad, aprobar presupuestos, establecer precios, reservar servicios o enviar mensajes externos.

!!! info "Antes de empezar"
    Consulta la [preparación del curso](guia-del-curso/preparacion.md).
    Revisa el [programa completo](guia-del-curso/programa.md).
    Comprueba tu acceso al entorno autorizado.
    Prepara una ubicación para conservar los materiales.

!!! warning "Privacidad"
    Utiliza preferentemente datos sintéticos en las prácticas.
    La sustitución de nombres por códigos no garantiza anonimización.
    No introduzcas información confidencial sin autorización.
    Revisa también las salidas, capturas y registros que conserves.

---

## 1. Cómo utilizar este índice

El índice organiza el acceso al curso y ayuda a relacionar cada actividad con sus materiales.

### 1.1. Orientación inicial

Empieza por comprender el recorrido antes de seleccionar técnicas o herramientas.

- Consulta la preparación.
- Revisa los objetivos y el programa.
- Identifica las condiciones de trabajo disponibles.

### 1.2. Navegación diaria

Cada tiene una página de entrada que reúne su contenido específico.

- Abre el índice del correspondiente.
- Localiza el laboratorio que vas a realizar.
- Comprueba qué materiales debes conservar.

### 1.3. Materiales transversales

Las plantillas y los recursos se utilizan durante todo el curso.

- Las plantillas estructuran la documentación.
- El glosario aclara conceptos.
- El proyecto conecta los aprendizajes diarios.

### 1.4. Consulta posterior

El índice también permite recuperar métodos después del curso.

- Vuelve al relacionado con tu necesidad.
- Revisa las condiciones del ejemplo.
- Adapta el procedimiento y vuelve a evaluarlo.

---

## 2. Mapa general del curso

El recorrido avanza desde la formulación de tareas hasta la integración y presentación de una solución.

### 2.1. Primeros fundamentos

El inicio se centra en comprender el modelo y delimitar el trabajo.

- [1: Fundamentos](dia-01-fundamentos/index.md).
- Diferencia entre instrucción, fuente y resultado.
- Preparación de una primera línea base.

### 2.2. Técnicas y evaluación

El tramo intermedio desarrolla estrategias y procedimientos de comprobación.

- [2: Técnicas y formatos](dia-02-tecnicas/index.md).
- [3: Evaluación y seguridad](dia-03-evaluacion-y-seguridad/index.md).
- Comparación de versiones con criterios explícitos.

### 2.3. Aplicación e integración

El tramo final conecta componentes y prepara una entrega consultable.

- [4: Aplicaciones profesionales](dia-04-aplicaciones/index.md).
- [5: Proyecto e integración](dia-05-proyecto/index.md).
- Documentación del uso, los límites y la decisión final.

### 2.4. Recursos de apoyo

Los recursos complementan el recorrido sin sustituir las pruebas.

- [Plantillas](plantillas/index.md) y [Proyecto final](proyecto-final/index.md).
- [Glosario](recursos/glosario.md) y [Herramientas](recursos/herramientas.md).
- [Lecturas](recursos/lecturas.md), con estados de revisión visibles.

---

## 3. Qué significa aprender Prompt Engineering

El curso aborda el diseño de instrucciones como parte de un proceso de trabajo evaluable.

### 3.1. Formular una tarea

Una instrucción útil explica qué operación se necesita y para quién.

- Identifica el problema concreto.
- Define el resultado esperado.
- Delimita lo que queda fuera.

### 3.2. Organizar la información

La entrada debe aportar datos suficientes sin añadir contenido innecesario.

- Separa reglas y fuentes.
- Define variables y formatos.
- Explica cómo tratar ausencias y contradicciones.

### 3.3. Comprobar resultados

La revisión compara una respuesta con condiciones definidas previamente.

- Verifica estructura y contenido.
- Conserva estados, cifras y unidades.
- Identifica errores y pendientes.

### 3.4. Mejorar con evidencia

La mejora necesita un cambio identificable y una comparación pertinente.

- Conserva la versión anterior.
- Formula una hipótesis concreta.
- Comprueba el efecto y posibles regresiones.

---

## 4. Perfil del alumnado y requisitos previos

El recorrido básico está pensado para personas que necesitan trabajar con lenguaje y documentos en tareas profesionales.

### 4.1. Conocimientos de entrada

No se exige programación para completar el entorno mínimo.

- Manejo básico de archivos.
- Capacidad para revisar textos y tablas.
- Comprensión de la tarea elegida.

### 4.2. Perfiles de aplicación

Las actividades pueden adaptarse a distintas funciones profesionales.

- Coordinación, administración y operaciones.
- Comunicación, formación y documentación.
- Soporte, análisis y trabajo técnico.

### 4.3. Condiciones de participación

El alumnado necesita acceso y tiempo para revisar sus resultados.

- Interfaz autorizada de LLM.
- Editor de texto y hoja de cálculo.
- Permiso para utilizar los materiales de práctica.

### 4.4. Límites de la formación

Completar el curso no acredita todas las competencias de un despliegue profesional.

- No sustituye formación jurídica o de seguridad.
- No concede autorización sobre datos reales.
- No garantiza resultados futuros idénticos.

---

## 5. Preparación antes del primer día

La preparación reduce interrupciones y permite dedicar las sesiones al aprendizaje.

### 5.1. Revisar las instrucciones

Consulta la [preparación del curso](guia-del-curso/preparacion.md) antes de comenzar.

- Comprueba los accesos necesarios.
- Identifica las restricciones del entorno.
- Anota dudas operativas para el inicio.

### 5.2. Preparar materiales

Organiza una ubicación autorizada para los archivos.

- Carpeta de prompts y versiones.
- Carpeta de casos y referencias.
- Carpeta de ejecuciones y resultados.

### 5.3. Comprobar el entorno

Realiza una comprobación pequeña con información sintética.

- Abre la interfaz disponible.
- Guarda un archivo de texto.
- Crea una matriz vacía de pruebas.

### 5.4. Elegir una necesidad inicial

Trae una tarea manejable que puedas explicar y revisar.

- Describe quién necesita el resultado.
- Identifica una entrada representativa.
- Señala consecuencias y exclusiones.

---

## 6. Organización de las 30 horas

El curso distribuye el trabajo en cinco jornadas de seis horas lectivas cada una.

### 6.1. Tiempo lectivo y pausas

La distribución propuesta suma 30 horas de aprendizaje.

- Seis horas lectivas por día.
- Cinco días de recorrido.
- Las pausas se programan fuera de esos bloques lectivos.

### 6.2. Distribución diaria orientativa

Una jornada puede organizarse en seis bloques de 60 minutos.

- Dos bloques de explicación y práctica guiada.
- Dos bloques de laboratorio y revisión.
- Dos bloques de proyecto, contraste y cierre.

### 6.3. Ajustes del programa

Consulta el [programa completo](guia-del-curso/programa.md) para la planificación definitiva.

- Adapta tiempos al nivel del grupo.
- Conserva espacio suficiente para evaluar.
- Declara actividades que pasan a trabajo posterior.

### 6.4. Criterio de realismo

El calendario no debe presentar como terminado lo que sigue pendiente.

- Diferencia preparación y ejecución.
- Registra pruebas no completadas.
- Ajusta alcance antes de ampliar capacidades.

---

## 7. Método de trabajo del curso

Cada actividad relaciona una pregunta, una instrucción, una observación y una decisión.

### 7.1. Preparar antes de generar

La preparación establece qué se considera admisible.

- Define la tarea.
- Selecciona la fuente.
- Redacta criterios y referencia.

### 7.2. Ejecutar con identidad

Cada observación debe poder relacionarse con sus condiciones.

- Identifica el caso.
- Identifica el prompt y su versión.
- Registra el entorno conocido.

### 7.3. Revisar sin sustituir la evidencia

La respuesta original se conserva antes de editarla.

- Compara con la fuente.
- Registra discrepancias por criterio.
- Guarda correcciones como materiales separados.

### 7.4. Decidir el siguiente paso

La decisión debe responder a lo observado.

- Mantener una versión.
- Preparar una candidata.
- Ampliar pruebas o detener el uso.

---

## 8. 1 · Fundamentos

El primer desarrolla una comprensión práctica de los modelos y prepara el inicio del proyecto.

### 8.1. Acceso y objetivos

Consulta [1: Fundamentos](dia-01-fundamentos/index.md) para el desarrollo completo.

- Comprender LLM, prompt, token y contexto.
- Distinguir generación y verificación.
- Formular una tarea delimitada.

### 8.2. Contenidos principales

Los fundamentos se aplican a instrucciones concretas.

- Objetivo, destinatario y alcance.
- Fuentes, restricciones y formato.
- Límites del conocimiento y de la autoridad.

### 8.3. Laboratorio inicial

El alumnado prepara una instrucción directa con datos sintéticos.

- Define una entrada.
- Establece una referencia previa.
- Ejecuta y conserva una respuesta.

### 8.4. Entregable del día

El cierre deja una línea base que pueda retomarse.

- Ficha inicial del caso.
- Primera versión documentada.
- Observaciones y pendientes identificados.

---

## 9. 2 · Técnicas y formatos

El segundo desarrolla estrategias de formulación y contratos de salida.

### 9.1. Acceso y objetivos

Consulta [2: Técnicas y formatos](dia-02-tecnicas/index.md) para las actividades específicas.

- Utilizar instrucciones directas y ejemplos.
- Seleccionar formatos según el uso posterior.
- Preparar una modificación comparada.

### 9.2. Contenidos principales

Las técnicas se presentan como decisiones, no como recetas universales.

- Zero-shot y few-shot.
- Descomposición de operaciones.
- Salidas estructuradas y diccionario de variables.

### 9.3. Laboratorio de técnicas

El equipo modifica un componente ante una dificultad concreta.

- Localiza un criterio afectado.
- Explica el efecto esperado.
- Compara versiones con entradas comunes.

### 9.4. Entregable del día

La documentación debe conservar tanto diseño como evolución.

- Al menos dos versiones recuperables.
- Contrato de entrada y salida.
- Historial con hipótesis y comprobaciones.

---

## 10. 3 · Evaluación y seguridad

El tercer organiza la batería de pruebas y revisa los controles del sistema.

### 10.1. Acceso y objetivos

Consulta [3: Evaluación y seguridad](dia-03-evaluacion-y-seguridad/index.md).

- Definir criterios de aceptación.
- Comparar resultados de forma transparente.
- Identificar riesgos y límites de protección.

### 10.2. Contenidos principales

La evaluación conecta requisitos y evidencia.

- Casos, referencias y ejecuciones.
- Fidelidad, estructura y autoridad.
- Privacidad, permisos y contenido no confiable.

### 10.3. Laboratorio de comprobación

El equipo ejecuta condiciones que pueden revelar fallos.

- Información ausente o ambigua.
- Contradicciones y correcciones explícitas.
- Instrucciones incrustadas en fuentes sintéticas.

### 10.4. Entregable del día

El cierre debe hacer visibles resultados y pendientes.

- Matriz actualizada.
- Respuestas originales consultables.
- Riesgos, controles e incidencias documentados.

---

## 11. 4 · Aplicaciones profesionales

El cuarto conecta operaciones y desarrolla una guía de utilización.

### 11.1. Acceso y objetivos

Consulta [4: Aplicaciones profesionales](dia-04-aplicaciones/index.md).

- Relacionar componentes con una necesidad.
- Validar transiciones del flujo.
- Preparar instrucciones para otra persona.

### 11.2. Contenidos principales

Las aplicaciones se construyen dentro de límites explícitos.

- Extracción, clasificación y resumen.
- Preparación de borradores.
- Revisión humana y condiciones de detención.

### 11.3. Laboratorio de integración

El equipo utiliza un resultado validado como entrada de otra etapa.

- Comprueba estructura y significado.
- Conserva identificadores y estados.
- Detiene el avance ante errores bloqueantes.

### 11.4. Entregable del día

El conjunto debe reflejar el flujo realmente trabajado.

- Mapa de componentes.
- Contratos compatibles.
- Guía de uso candidata y límites conocidos.

---

## 12. 5 · Proyecto e integración

El quinto consolida la entrega y comunica una decisión respaldada.

### 12.1. Acceso y objetivos

Consulta [5: Proyecto e integración](dia-05-proyecto/index.md).

- Revisar integridad del expediente.
- Presentar pruebas y limitaciones.
- Justificar la decisión sobre la candidata.

### 12.2. Contenidos principales

La integración final incluye tanto contenido como documentación.

- Versiones del conjunto entregado.
- Evidencias y enlaces internos.
- Modalidad de demostración y plan de respaldo.

### 12.3. Laboratorio de cierre

Otro equipo intenta revisar una parte del expediente.

- Localiza una versión.
- Encuentra un caso y su respuesta.
- Reconstruye una decisión por criterio.

### 12.4. Entregable del día

La entrega final identifica el estado del proyecto.

- Expediente consultable.
- Presentación coherente con la evidencia.
- Pendientes y próxima comprobación prioritaria.

---

## 13. Proyecto final desde el primer día

El proyecto conecta los contenidos y evita que la práctica quede reducida a ejercicios aislados.

### 13.1. Punto de entrada

Consulta [Proyecto final](proyecto-final/index.md) para organizar el recorrido completo.

- El proyecto comienza el primer día.
- Evoluciona durante las jornadas intermedias.
- Se completa y presenta el quinto día.

### 13.2. Selección del caso

Consulta [Casos de uso](proyecto-final/casos-de-uso.md) para delimitar una necesidad.

- Tarea concreta y revisable.
- Usuario destinatario.
- Fuentes y referencia disponibles.

### 13.3. Requisitos mínimos

Consulta [Requisitos y entregables](proyecto-final/requisitos-y-entregables.md).

- Prompts documentados y dos versiones comparadas.
- Entre 8 y 10 casos de prueba.
- Resultados, privacidad, uso y revisión humana.

### 13.4. Comunicación del resultado

Consulta [Guía de presentación](proyecto-final/guia-de-presentacion.md).

- Explica el problema y el diseño.
- Muestra una demostración identificada.
- Relaciona conclusiones con pruebas y límites.

---

## 14. Caso común para practicar

El ejemplo común permite comparar conceptos sin introducir información real ni operaciones externas.

### 14.1. Necesidad del ejemplo

Una coordinación de formación necesita organizar requisitos de solicitudes.

- Extraer información relevante.
- Localizar datos pendientes.
- Preparar un borrador interno revisable.

### 14.2. Entrada sintética

La solicitud contiene valores, estados y una ausencia.

- Participarán aproximadamente 12 personas.
- La modalidad será presencial y durará dos horas.
- Se propone el 18 de noviembre de 2026, sin confirmar y sin presupuesto indicado.

### 14.3. Referencia docente

La referencia conserva el significado de la entrada.

- Participantes: 12, con estado aproximado.
- Duración: 120 minutos.
- Fecha propuesta y presupuesto ausente.

### 14.4. Exclusiones del ejemplo

La solución no realiza actuaciones con consecuencias externas.

- No consulta ni confirma disponibilidad.
- No establece precios ni aprueba presupuestos.
- No reserva servicios ni envía comunicaciones.

---

## 15. Laboratorios breves y sesiones guiadas

Las sesiones breves practican una capacidad concreta y dejan materiales que pueden incorporarse al proyecto.

### 15.1. Sesión de treinta minutos

La actividad prepara una primera observación revisable.

- Cinco minutos: tarea y criterios.
- Diez minutos: prompt y ejecución.
- Quince minutos: revisión, registro y pendientes.

### 15.2. Sesión de sesenta minutos

La actividad compara una modificación delimitada.

- Diez minutos: línea base y referencias.
- Treinta minutos: nueva candidata y ejecuciones.
- Veinte minutos: comparación y documentación.

### 15.3. Sesión de noventa minutos

La actividad amplía evaluación y regresión.

- Quince minutos: observación e hipótesis.
- Cuarenta y cinco minutos: casos comunes y comprobaciones.
- Treinta minutos: interpretación, riesgos y cierre.

### 15.4. Condición de realismo

Los tiempos deben adaptarse a las pruebas que realmente caben.

- No presuponer una batería completa.
- Registrar interrupciones y exclusiones.
- Mantener como pendiente lo no evaluado.

---

## 16. Ejemplos de actividades por jornada

Las actividades siguientes ilustran el recorrido y no sustituyen los laboratorios específicos.

### 16.1. Actividades de los días 1 y 2

El inicio trabaja claridad y representación de información.

- 1: extraer requisitos con una instrucción directa.
- 2: representar ausencias mediante un contrato.
- Comparar una versión inicial con una candidata.

### 16.2. Actividades del 3

La evaluación utiliza condiciones difíciles pero controladas.

- Introducir cantidades incompatibles.
- Mantener una fecha expresamente no confirmada.
- Ignorar una orden incrustada en una fuente sintética.

### 16.3. Actividades del 4

La integración conecta operaciones con puntos de revisión.

- Validar un registro de requisitos.
- Redactar desde el registro aceptado.
- Revisar cifras y compromisos antes del uso.

### 16.4. Actividades del 5

El cierre comprueba transferencia documental.

- Otra pareja sigue la guía.
- El equipo presenta evidencia conservada.
- Se registra la decisión y sus restricciones.

---

## 17. Plantillas y documentación de trabajo

Las plantillas facilitan consistencia, pero deben completarse con información real y comprobable.

### 17.1. Acceso a las plantillas

Consulta [Plantillas](plantillas/index.md) según el material que necesitas preparar.

- Ficha de caso.
- Ficha y biblioteca de prompts.
- Matriz, historial y checklist.

### 17.2. Identificación de objetos

Los nombres deben distinguir elementos que cumplen funciones diferentes.

- Caso: situación de prueba.
- Ejecución: observación concreta.
- Versión: contenido identificado del componente.

### 17.3. Organización del expediente

Agrupa los materiales para facilitar consulta y reconstrucción.

- Caso, alcance y contratos.
- Prompts, versiones y políticas.
- Pruebas, resultados, riesgos y guía.

### 17.4. Calidad documental

La documentación debe explicar sin depender del autor.

- Enlaces que funcionan.
- Estados y pendientes visibles.
- Correspondencia entre entrega y evaluación.

---

## 18. Evaluación del aprendizaje

La evaluación debe reconocer la calidad del proceso y la proporción de las conclusiones.

### 18.1. Diseño

La propuesta debe responder a una necesidad definida.

- Problema y destinatario claros.
- Instrucciones compatibles.
- Entradas y salidas documentadas.

### 18.2. Evidencia

Las afirmaciones deben relacionarse con observaciones conservadas.

- Referencias preparadas previamente.
- Respuestas originales disponibles.
- Resultados por criterio y versión.

### 18.3. Responsabilidad

La propuesta debe mantener límites de información y actuación.

- Medidas de privacidad.
- Revisión humana ejecutable.
- Riesgos residuales y exclusiones.

### 18.4. Decisión final

La conclusión debe corresponder al alcance comprobado.

- Aceptable para el ejercicio evaluado.
- Aceptable con restricciones o pendiente.
- No recomendada cuando persisten errores bloqueantes.

---

## 19. Seguridad y privacidad durante el curso

La protección debe mantenerse desde la preparación hasta la presentación final.

### 19.1. Selección de datos

Las prácticas iniciales deben utilizar información sintética.

- Evitar credenciales y secretos.
- Eliminar campos innecesarios.
- Revisar autorizaciones antes de usar datos reales.

### 19.2. Fuentes y autoridad

Los datos de una fuente no deben modificar las reglas de la tarea.

- Separar instrucciones y documentos.
- Identificar contenido no confiable.
- Comprobar el tratamiento de órdenes incrustadas.

### 19.3. Herramientas y permisos

Las capacidades deben limitarse a lo necesario.

- Sin escritura si basta lectura.
- Sin envío externo para preparar borradores.
- Validación antes de operaciones con consecuencias.

### 19.4. Salidas y supervisión

La revisión incluye materiales que quedan después de generar.

- Respuestas y archivos exportados.
- Capturas y registros compartidos.
- Persona con tiempo y autoridad para bloquear.

---

## 20. Herramientas y ampliaciones técnicas

La elección del entorno debe facilitar el trabajo sin añadir riesgos o esfuerzo injustificados.

### 20.1. Entorno mínimo

Consulta [Herramientas](recursos/herramientas.md) para preparar el recorrido básico.

- Interfaz autorizada de LLM.
- Editor de texto.
- Hoja de cálculo para pruebas.

### 20.2. Entorno técnico opcional

La ampliación puede apoyar tareas repetitivas.

- API para solicitudes programáticas.
- Python para validaciones y registros.
- Git para conservar cambios identificados.

### 20.3. Registro del entorno

Documenta lo disponible durante las ejecuciones.

- Plataforma y modelo visible.
- Funciones activas y utilizadas.
- Configuración conocida y condiciones desconocidas.

### 20.4. Equivalencia formativa

La tecnología elegida no determina por sí sola la calidad del proyecto.

- Una revisión manual puede ser suficiente.
- Un script también necesita pruebas.
- La automatización no sustituye criterios ni autorización.

---

## 21. Colaboración y revisión cruzada

La colaboración permite detectar supuestos que el equipo autor puede pasar por alto.

### 21.1. Funciones dentro del equipo

El reparto debe facilitar avance y mantenimiento.

- Diseño y documentación.
- Preparación de pruebas.
- Revisión, integración y presentación.

### 21.2. Contraste por parejas

Una pareja revisa materiales concretos antes de opinar sobre el conjunto.

- Localiza la entrada.
- Comprende el criterio.
- Examina la respuesta original.

### 21.3. Resolución de desacuerdos

El desacuerdo debe tratarse como una pregunta comprobable.

- Identificar el punto discutido.
- Consultar fuente y política.
- Registrar decisión o necesidad de aclaración.

### 21.4. Comentarios útiles

La retroalimentación debe indicar una acción realizable.

- Qué falta.
- Qué afirmación necesita limitarse.
- Qué documento o prueba debe actualizarse.

---

## 22. Presentación final y organización del cierre

La presentación permite comprender el proyecto y localizar su respaldo.

### 22.1. Estructura del relato

La exposición sigue las cinco partes de la guía específica.

- Problema y usuario.
- Diseño y demostración.
- Evaluación, lecciones y próximos pasos.

### 22.2. Modalidad de demostración

La audiencia debe saber qué material observa.

- Ejecución en directo.
- Respuesta conservada o grabación.
- Ilustración sin ejecución.

### 22.3. Tiempo del bloque

La organización debe ajustarse al grupo y al tiempo lectivo disponible.

- Prever exposición y preguntas.
- Reservar transiciones.
- Preparar un margen para incidencias.

### 22.4. Transparencia del cierre

La demostración no debe ocultar condiciones que cambian la decisión.

- Errores relevantes.
- Pruebas pendientes.
- Restricciones del uso recomendado.

---

## 23. Recursos y continuidad del aprendizaje

Los recursos ayudan a mantener un lenguaje preciso y a ampliar el trabajo con referencias revisadas.

### 23.1. Glosario

Consulta [Glosario](recursos/glosario.md) para aclarar conceptos utilizados durante el curso.

- Modelo, prompt y contexto.
- Caso, ejecución y versión.
- Riesgo, evidencia y autorización.

### 23.2. Lecturas

Consulta [Lecturas](recursos/lecturas.md) para seleccionar materiales con una función formativa.

- Documentación oficial.
- Diseño y evaluación.
- Privacidad y seguridad.

### 23.3. Verificación de referencias

Las fuentes deben identificarse y revisarse antes de usarlas como respaldo.

- Título y autor o entidad.
- Fecha real de consulta.
- Enlace, apartado y límites.

### 23.4. Transferencia posterior

Un contexto nuevo requiere revisar diferencias relevantes.

- Datos y permisos.
- Volumen y consecuencias.
- Herramientas, responsables y criterios.

---

## 24. Checklist general y siguiente recorrido

El cierre del índice reúne las condiciones necesarias para empezar y avanzar con claridad.

### 24.1. Antes de empezar

Comprueba preparación, acceso y organización.

- [ ] Preparación y programa consultados.
- [ ] Entorno autorizado disponible.
- [ ] Ubicación de archivos y datos sintéticos preparada.

### 24.2. Durante el curso

Mantén relación entre tareas, versiones y resultados.

- [ ] Prompts y variables documentados.
- [ ] Respuestas originales conservadas.
- [ ] Criterios, cambios y pendientes registrados.

### 24.3. Antes de entregar

Verifica los requisitos y la correspondencia del conjunto.

- [ ] Dos versiones comparadas y entre 8 y 10 casos.
- [ ] Resultados, límites y privacidad documentados.
- [ ] Guía, revisión humana y presentación coherentes.

### 24.4. Punto de partida

Comienza por la preparación y continúa con los fundamentos.

- [Preparación del curso](guia-del-curso/preparacion.md).
- [Programa completo](guia-del-curso/programa.md).
- [1: Fundamentos](dia-01-fundamentos/index.md).

**Diseñar bien un prompt significa explicar la tarea; trabajar bien con él significa comprobar sus resultados, conservar la evidencia y utilizarla para decidir dentro de límites conocidos.**