# 🌱 Smart Irrigation System - Backend API

Servidor central de control y monitoreo en tiempo real para el Sistema de Riego Inteligente. Este backend actúa como un puente de comunicación bidireccional y seguro entre los dispositivos embebidos (**ESP32**) acoplados a la planta y la interfaz web de usuario (**Dashboard UI**), utilizando una arquitectura híbrida orientada a eventos e impulsada por una API REST.

---

## 📋 Tabla de Contenidos

- [Arquitectura](#-arquitectura-de-comunicación-general)
- [Seguridad](#-capa-de-seguridad-y-encriptación)
- [Requisitos](#-requisitos-e-instalación-local)
- [Tópicos MQTT](#-tópicos-mqtt-suscritos-y-publicados)
- [Endpoints REST](#-catálogo-de-endpoints-de-la-api-rest)
- [Robustez](#-robustez-del-código-y-manejo-de-errores)

---

## 🏗️ Arquitectura de Comunicación General

El flujo de información y control del ecosistema sigue la siguiente topología de red descentralizada:

```
┌──────────────┐                 🔒 MQTTS (Port 8883)                  ┌───────────────────┐
│              │ ──(Telemetry)───────────────────────────────────────> │                   │
│    ESP32     │ ──(LWT Status)──────────────────────────────────────> │   HiveMQ Cloud    │
│ (Microcont.) │ <─(Commands)───────────────────────────────────────── │     (Broker)      │
│              │                                                       └───────────────────┘
└──────────────┘                                                                 │
                                                                        🔒 MQTTS
                                                                           │
                                                                           ▼
┌──────────────┐                       🌐 HTTPS                        ┌───────────────────┐
│  Dashboard   │ <───────────────( REST API JSON )──────────────────── │    Node.js App    │
│  (Lovable)   │ ───────────────( Control POSTs )────────────────────> │  (Render Cloud)   │
└──────────────┘                                                       └───────────────────┘
```

**Componentes:**
- **ESP32 (Microcontrolador):** Recopila telemetría de sensores y ejecuta comandos de actuadores
- **HiveMQ Cloud (Broker MQTT):** Intermediario seguro de mensajería en tiempo real
- **Node.js Backend:** Motor lógico central y API REST
- **Dashboard UI (Lovable):** Interfaz web de usuario para monitoreo y control

---

## 🔒 Capa de Seguridad y Encriptación

La integridad y confidencialidad de las lecturas agrónomas y las órdenes operativas se protegen mediante protocolos estrictos de capa de transporte:

### Protocolo MQTTS (MQTT sobre TLS/SSL)
La conexión entre este servidor Node.js y el cluster remoto de **HiveMQ Cloud** no viaja en texto plano. Se ejecuta de manera nativa sobre el puerto **8883**, inyectando una capa de cifrado robusto que previene ataques de interceptación (*Man-in-the-Middle*).

### Aislamiento de Credenciales
El código está completamente parametrizado. Los mecanismos de autenticación crítica (tokens, hosts y llaves del broker) se inyectan dinámicamente en tiempo de ejecución por medio de **variables de entorno** (`process.env`), evitando filtraciones accidentales de secretos en repositorios públicos de control de versiones.

### Mecanismo de Interlock de Control (Healthcheck Extensible)
Gracias a la suscripción en el tópico `irrigation/status`, el backend captura en tiempo real el testamento masivo (*Last Will and Testament*) del microcontrolador. Si el ESP32 experimenta un fallo eléctrico, pérdida de cobertura Wi-Fi o caída súbita, el broker publica automáticamente el estado `offline` en milisegundos. El backend expone este estado a la UI, la cual bloquea inmediatamente los controles críticos para impedir que el operador envíe comandos inertes al vacío.

---

## 🚀 Requisitos e Instalación Local

### Prerrequisitos
- **Node.js** v16 o superior
- **npm** (Gestor de paquetes de Node)

### Instalación de Dependencias

Clona el repositorio en tu máquina local y ejecuta el instalador del núcleo:

```bash
git clone <tu-repositorio>
cd smart-irrigation-backend
npm install
```

### Dependencias del Proyecto

```bash
npm install express mqtt dotenv cors
```

**Paquetes principales:**
- **express:** Framework web minimalista
- **mqtt:** Cliente MQTT para conexión con broker
- **dotenv:** Gestión de variables de entorno
- **cors:** Habilita Cross-Origin Resource Sharing

### Configuración del Entorno (.env)

Crea un archivo `.env` en la raíz del proyecto para poblar las variables dinámicas de conectividad:

```env
# Servidor Express
PORT=3000

# Configuración del Broker MQTT
MQTT_HOST=e9ca1c748c7f4ff9ac7c088af623c0ce.s1.eu.hivemq.cloud
MQTT_PORT=8883
MQTT_USER=backend
MQTT_PASSWORD=tu_contraseña_segura
```

### Ejecución

```bash
# Desarrollo
npm start

# Con nodemon (para recarga automática)
npm install --save-dev nodemon
npx nodemon server.js
```

---

## 📡 Tópicos MQTT Suscritos y Publicados

| Tópico | Dirección | Payload Esperado / Emitido | Descripción |
|--------|-----------|---------------------------|-------------|
| `irrigation/telemetry` | **Suscrito** (Inbound) | `{"sensors": {"soil_humidity": 2100, "air_temperature": 24.5, "light_level": 1500, "water_level": 3000}, "actuators": {"pump": "off", "light": "off"}}` | Flujo periódico de telemetría de sensores analógicos y estados de relés |
| `irrigation/status` | **Suscrito** (Inbound) | `online` \| `offline` (Texto plano / LWT) | Estado de conexión del ESP32. LWT notifica automáticamente si se desconecta |
| `irrigation/alerts` | **Suscrito** (Inbound) | `{"alert": "Crítico: Humedad del suelo bajo el umbral", "level": "danger"}` | Eventos de contingencia emitidos por lógica local del hardware |
| `irrigation/control` | **Publicado** (Outbound) | `{"pump": "on"}` \| `{"light": "off"}` \| `{"soil_threshold": 1850}` | Mutación de estados operativos enviada directamente a los pines del ESP32 |

---

## 🌐 Catálogo de Endpoints de la API REST

El servidor expone una interfaz HTTP completamente abierta a Cross-Origin Resource Sharing (**CORS**), permitiendo al Dashboard realizar consultas seguras desde cualquier origen de navegador.

### 📊 Endpoints de Monitoreo (GET)

#### `GET /health`
Comprobación rápida de salud interna del backend. Retorna el uptime en milisegundos y el estado de la conexión mutua con el broker MQTT.

**Respuesta Exitosa (200):**
```json
{
  "status": "healthy",
  "uptime_ms": 45230,
  "mqtt_connected": true
}
```

---

#### `GET /status`
Retorna el inventario total del ecosistema (Estado del servidor, conexión activa del broker, último estado conocido del ESP32 con su respectiva marca de tiempo y volumen total de datos acumulados).

**Respuesta Exitosa (200):**
```json
{
  "server_status": "running",
  "mqtt_status": "connected",
  "esp32_status": "online",
  "last_telemetry_timestamp": "2025-05-28T14:32:15Z",
  "total_data_points": 1250
}
```

---

#### `GET /telemetry/latest`
Entrega el JSON analítico más reciente enviado por los sensores.

**Respuesta Exitosa (200):**
```json
{
  "sensors": {
    "soil_humidity": 2100,
    "air_temperature": 24.5,
    "light_level": 1500,
    "water_level": 3000
  },
  "actuators": {
    "pump": "off",
    "light": "off"
  },
  "timestamp": "2025-05-28T14:32:15Z"
}
```

**Respuesta de Error (404):** Se retorna si el backend se acaba de reiniciar y no ha recibido tramas.

---

#### `GET /telemetry?limit=X&offset=Y`
Consulta histórica paginada del búfer temporal de datos (Memoria RAM con capacidad máxima persistente de 2000 entradas para evitar fugas de memoria).

**Ejemplo:** `/telemetry?limit=50&offset=100`

**Respuesta Exitosa (200):**
```json
{
  "data": [
    {
      "sensors": { "soil_humidity": 2050, "air_temperature": 24.3, ... },
      "timestamp": "2025-05-28T14:30:00Z"
    },
    ...
  ],
  "total": 1250,
  "limit": 50,
  "offset": 100
}
```

---

#### `GET /sensors/current`
Retorna únicamente el nodo de sensores actual.

**Respuesta Exitosa (200):**
```json
{
  "soil_humidity": 2100,
  "air_temperature": 24.5,
  "light_level": 1500,
  "water_level": 3000,
  "timestamp": "2025-05-28T14:32:15Z"
}
```

---

#### `GET /actuators/current`
Estado binario actual de la bomba y las luces térmicas.

**Respuesta Exitosa (200):**
```json
{
  "pump": "off",
  "light": "off",
  "timestamp": "2025-05-28T14:32:15Z"
}
```

---

#### `GET /alerts`
Historial indexado de las últimas alertas del sistema.

**Respuesta Exitosa (200):**
```json
{
  "alerts": [
    {
      "id": 1,
      "alert": "Crítico: Humedad del suelo bajo el umbral",
      "level": "danger",
      "timestamp": "2025-05-28T14:25:00Z"
    },
    {
      "id": 2,
      "alert": "Advertencia: Temperatura elevada",
      "level": "warning",
      "timestamp": "2025-05-28T14:20:00Z"
    }
  ],
  "total": 2
}
```

---

#### `GET /stats`
Motor matemático integrado. Procesa los últimos 60 registros (~5 minutos de actividad) y calcula promedios (**avg**), picos máximos (**max**) e históricos mínimos (**min**) de todas las variables físicas operadas por el hardware, además de calcular los tiempos de activación estimados (**active_time_ms**) de los actuadores.

**Respuesta Exitosa (200):**
```json
{
  "period_minutes": 5,
  "sensors": {
    "soil_humidity": { "avg": 2050, "max": 2150, "min": 1950 },
    "air_temperature": { "avg": 24.2, "max": 25.1, "min": 23.5 },
    "light_level": { "avg": 1480, "max": 1600, "min": 1300 },
    "water_level": { "avg": 2950, "max": 3000, "min": 2900 }
  },
  "actuators": {
    "pump": { "active_time_ms": 45000, "cycles": 3 },
    "light": { "active_time_ms": 120000, "cycles": 2 }
  }
}
```

---

### 🎛️ Endpoints de Control y Configuración (POST)

#### `POST /control/pump`
Controla el estado de la bomba de riego.

**Cuerpo (JSON):**
```json
{
  "action": "on"
}
```

O para apagar:
```json
{
  "action": "off"
}
```

**Respuesta Exitosa (200):**
```json
{
  "success": true,
  "action": "on",
  "device": "pump",
  "timestamp": "2025-05-28T14:32:15Z"
}
```

**Respuesta de Error (400):**
```json
{
  "success": false,
  "error": "Invalid action. Use 'on' or 'off'"
}
```

---

#### `POST /control/light`
Controla el estado de las luces térmicas.

**Cuerpo (JSON):**
```json
{
  "action": "on"
}
```

**Respuesta Exitosa (200):**
```json
{
  "success": true,
  "action": "on",
  "device": "light",
  "timestamp": "2025-05-28T14:32:15Z"
}
```

---

#### `POST /config/soil-threshold`
Configura el umbral crítico de humedad del suelo.

**Cuerpo (JSON):**
```json
{
  "threshold": 2200
}
```

⚠️ **Validación:** Rango estricto de hardware: **0 a 4095**

**Respuesta Exitosa (200):**
```json
{
  "success": true,
  "parameter": "soil_threshold",
  "value": 2200,
  "timestamp": "2025-05-28T14:32:15Z"
}
```

**Respuesta de Error (400):**
```json
{
  "success": false,
  "error": "Threshold must be between 0 and 4095"
}
```

---

## ⚙️ Robustez del Código y Manejo de Errores

### Procesamiento Asíncrono Tolerante
El parsing de mensajes MQTT está encapsulado en bloques **try/catch**. Si el broker recibe un payload corrupto o un tópico con texto sin estructurar (como ocurre con el tópico de estado plano), la aplicación registra la traza en la terminal mediante `console.error` de manera limpia, evitando la interrupción total del hilo principal del servidor de Node.js.

```javascript
try {
  const message = JSON.parse(msg.toString());
  // Procesar mensaje
} catch (error) {
  console.error('Error parsing MQTT message:', error);
  // Continuar sin interrumpir
}
```

### Cierre Seguro (Graceful Shutdown)
Al recibir una interrupción del sistema operativo (**SIGINT** / Ctrl+C), el programa ejecuta un protocolo de salida ordenada, invocando `client.end()` para notificar formalmente al broker de HiveMQ su desconexión voluntaria y liberar limpiamente el socket TCP del servidor Express.

```javascript
process.on('SIGINT', () => {
  console.log('Shutting down gracefully...');
  client.end(false, () => {
    process.exit(0);
  });
});
```

---

## 📚 Estructura de Directorios Recomendada

```
smart-irrigation-backend/
├── server.js                 # Punto de entrada principal
├── package.json              # Dependencias del proyecto
├── package-lock.json         # Lock de dependencias
├── .env                      # Variables de entorno (NO COMMITEAR)
├── .env.example              # Plantilla de variables de entorno
├── .gitignore                # Archivos ignorados por Git
├── README.md                 # Este archivo
├── src/
│   ├── mqtt/
│   │   └── client.js         # Configuración del cliente MQTT
│   ├── routes/
│   │   ├── health.js         # Endpoints de monitoreo
│   │   ├── telemetry.js      # Endpoints de telemetría
│   │   └── control.js        # Endpoints de control
│   ├── utils/
│   │   ├── logger.js         # Sistema de logging
│   │   └── validators.js     # Funciones de validación
│   └── middleware/
│       └── errorHandler.js   # Manejo centralizado de errores
└── docs/
    ├── API.md                # Documentación detallada de API
    └── MQTT_TOPICS.md        # Guía de tópicos MQTT
```

---

## 🔧 Troubleshooting

### El backend no se conecta al broker MQTT
1. Verifica que las credenciales en `.env` son correctas
2. Asegúrate de que el host y puerto coinciden con tu instancia de HiveMQ Cloud
3. Verifica la conectividad de red: `ping hivemq.cloud`

### Las alertas no llegan al dashboard
1. Confirma que el ESP32 está publicando en `irrigation/alerts`
2. Verifica los logs del servidor: `console.log()` en la suscripción
3. Revisa la conexión Wi-Fi del microcontrolador

### El server se reinicia constantemente
1. Revisa los logs para errores no capturados
2. Aumenta la memoria disponible: `NODE_OPTIONS="--max-old-space-size=512"`
3. Verifica las dependencias: `npm audit fix`

---

## 📄 Licencia

[Especifica tu licencia aquí - MIT, Apache 2.0, etc.]

---

## 👨‍💻 Contribuciones

Las contribuciones son bienvenidas. Por favor:

1. Fork el repositorio
2. Crea una rama para tu feature (`git checkout -b feature/AmazingFeature`)
3. Commit tus cambios (`git commit -m 'Add some AmazingFeature'`)
4. Push a la rama (`git push origin feature/AmazingFeature`)
5. Abre un Pull Request

---

## 📞 Soporte

Para reportar problemas o sugerencias:
- Abre un issue en GitHub
- Contacta al equipo de desarrollo
- Revisa la documentación en `/docs`

---

**Última actualización:** 28 de Mayo de 2025  
**Versión:** 1.0.0
