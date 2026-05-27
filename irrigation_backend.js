/*
 * SMART IRRIGATION SYSTEM - BACKEND
 * Consume datos del ESP32 via MQTT encriptado
 * Proporciona API REST para control y monitoreo
 * 
 * Instalación:
 * npm install mqtt express dotenv
 */

const mqtt = require('mqtt');
const express = require('express');
const fs = require('fs');
const dotenv = require('dotenv');

dotenv.config();

// ==================== CONFIGURACIÓN ====================

const MQTT_CONFIG = {
  protocol: 'mqtts',
  host: process.env.MQTT_HOST,
  port: parseInt(process.env.MQTT_PORT),
  username: process.env.MQTT_USER,
  password: process.env.MQTT_PASSWORD,
  
  // Certificado CA (si se proporciona)
  ca: process.env.CA_CERT_PATH ? 
    [fs.readFileSync(process.env.CA_CERT_PATH)] : undefined,
  
  rejectUnauthorized: true,
  clientId: 'backend-irrigation-' + Math.random().toString(16).substr(2, 8),
  clean: true,
  reconnectPeriod: 5000,
};

const MQTT_TOPICS = {
  telemetry: 'irrigation/telemetry',
  status: 'irrigation/status',
  alerts: 'irrigation/alerts',
  control: 'irrigation/control',
};

// ==================== BASE DE DATOS EN MEMORIA ====================

const database = {
  telemetry: [],
  alerts: [],
  lastStatus: null,
  maxEntries: 2000,
};

// ==================== EXPRESS SERVER ====================

const app = express();
const PORT = process.env.PORT;

app.use(express.json());

// ==================== RUTAS HTTP ====================

// Health Check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    mqtt_connected: client && client.connected,
    uptime_ms: process.uptime() * 1000,
  });
});

// Status general del sistema
app.get('/status', (req, res) => {
  res.json({
    server: 'running',
    mqtt: {
      connected: client && client.connected,
      broker: MQTT_CONFIG.host,
      port: MQTT_CONFIG.port,
    },
    device: database.lastStatus || { status: 'offline' },
    database: {
      telemetry_count: database.telemetry.length,
      alerts_count: database.alerts.length,
    },
    timestamp: new Date().toISOString(),
  });
});

// Obtener último dato de telemetría
app.get('/telemetry/latest', (req, res) => {
  const latest = database.telemetry[database.telemetry.length - 1];
  
  if (latest) {
    res.json(latest);
  } else {
    res.status(404).json({ error: 'No data available' });
  }
});

// Obtener histórico de telemetría
app.get('/telemetry', (req, res) => {
  const limit = req.query.limit ? parseInt(req.query.limit) : 50;
  const offset = req.query.offset ? parseInt(req.query.offset) : 0;
  
  const data = database.telemetry.slice(-limit - offset, -offset || undefined);
  
  res.json({
    data: data,
    count: data.length,
    total: database.telemetry.length,
  });
});

// Obtener información de sensores en tiempo real
app.get('/sensors/current', (req, res) => {
  const latest = database.telemetry[database.telemetry.length - 1];
  
  if (latest && latest.sensors) {
    res.json(latest.sensors);
  } else {
    res.status(404).json({ error: 'No sensor data' });
  }
});

// Obtener información de actuadores
app.get('/actuators/current', (req, res) => {
  const latest = database.telemetry[database.telemetry.length - 1];
  
  if (latest && latest.actuators) {
    res.json(latest.actuators);
  } else {
    res.status(404).json({ error: 'No actuator data' });
  }
});

// Obtener alertas
app.get('/alerts', (req, res) => {
  const limit = req.query.limit ? parseInt(req.query.limit) : 20;
  
  res.json({
    alerts: database.alerts.slice(-limit),
    count: database.alerts.length,
  });
});

// Obtener última alerta
app.get('/alerts/latest', (req, res) => {
  const latest = database.alerts[database.alerts.length - 1];
  
  if (latest) {
    res.json(latest);
  } else {
    res.status(404).json({ error: 'No alerts' });
  }
});

// Enviar comando al ESP32
app.post('/control/pump', (req, res) => {
  const { action } = req.body;
  
  if (!action || !['on', 'off'].includes(action)) {
    return res.status(400).json({ error: 'action debe ser "on" o "off"' });
  }
  
  const payload = JSON.stringify({ pump: action });
  
  client.publish(MQTT_TOPICS.control, payload, (err) => {
    if (err) {
      res.status(500).json({ error: 'Failed to publish' });
    } else {
      res.json({
        success: true,
        action: action,
        device: 'pump',
        timestamp: new Date().toISOString(),
      });
    }
  });
});

// Controlar luz
app.post('/control/light', (req, res) => {
  const { action } = req.body;
  
  if (!action || !['on', 'off'].includes(action)) {
    return res.status(400).json({ error: 'action debe ser "on" o "off"' });
  }
  
  const payload = JSON.stringify({ light: action });
  
  client.publish(MQTT_TOPICS.control, payload, (err) => {
    if (err) {
      res.status(500).json({ error: 'Failed to publish' });
    } else {
      res.json({
        success: true,
        action: action,
        device: 'light',
        timestamp: new Date().toISOString(),
      });
    }
  });
});

// Actualizar umbral de humedad del suelo
app.post('/config/soil-threshold', (req, res) => {
  const { threshold } = req.body;
  
  if (typeof threshold !== 'number' || threshold < 0 || threshold > 4095) {
    return res.status(400).json({ error: 'threshold debe estar entre 0 y 4095' });
  }
  
  const payload = JSON.stringify({ soil_threshold: threshold });
  
  client.publish(MQTT_TOPICS.control, payload, (err) => {
    if (err) {
      res.status(500).json({ error: 'Failed to publish' });
    } else {
      res.json({
        success: true,
        parameter: 'soil_threshold',
        value: threshold,
        timestamp: new Date().toISOString(),
      });
    }
  });
});

// Estadísticas del sistema
app.get('/stats', (req, res) => {
  const latest = database.telemetry[database.telemetry.length - 1];
  
  if (!latest || !latest.sensors) {
    return res.status(404).json({ error: 'No data' });
  }
  
  const recentData = database.telemetry.slice(-60);  // Últimos 60 registros (5 min)
  
  const stats = {
    soil_humidity: {
      current: latest.sensors.soil_humidity,
      min: Math.min(...recentData.map(d => d.sensors.soil_humidity)),
      max: Math.max(...recentData.map(d => d.sensors.soil_humidity)),
      avg: Math.round(
        recentData.reduce((sum, d) => sum + d.sensors.soil_humidity, 0) / recentData.length
      ),
    },
    air_temperature: {
      current: latest.sensors.air_temperature,
      min: Math.min(...recentData.map(d => d.sensors.air_temperature)),
      max: Math.max(...recentData.map(d => d.sensors.air_temperature)),
      avg: (
        recentData.reduce((sum, d) => sum + d.sensors.air_temperature, 0) / recentData.length
      ).toFixed(1),
    },
    light_level: {
      current: latest.sensors.light_level,
      min: Math.min(...recentData.map(d => d.sensors.light_level)),
      max: Math.max(...recentData.map(d => d.sensors.light_level)),
    },
    water_level: {
      current: latest.sensors.water_level,
      status: latest.sensors.water_level < 1000 ? 'LOW' : 'OK',
    },
    pump: {
      status: latest.actuators.pump,
      active_time_ms: calculateActiveTime('pump', recentData),
    },
    light: {
      status: latest.actuators.light,
      active_time_ms: calculateActiveTime('light', recentData),
    },
  };
  
  res.json(stats);
});

// ==================== CLIENTE MQTT ====================

let client;

function connectMQTT() {
  console.log('[MQTT] Conectando al broker seguro...');
  console.log(`  Host: ${MQTT_CONFIG.host}:${MQTT_CONFIG.port}`);
  console.log(`  Protocolo: mqtts (TLS/SSL)\n`);
  
  client = mqtt.connect(MQTT_CONFIG);
  
  client.on('connect', () => {
    console.log('✓ Conectado al broker MQTT');
    
    const topics = [
      MQTT_TOPICS.telemetry,
      MQTT_TOPICS.status,
      MQTT_TOPICS.alerts,
    ];
    
    client.subscribe(topics, (err) => {
      if (err) {
        console.log('✗ Error al suscribirse:', err);
      } else {
        console.log(`✓ Suscrito a tópicos: ${topics.join(', ')}\n`);
      }
    });
  });
  
  client.on('message', (topic, message) => {
    try {

      const rawMessage = message.toString();
      const timestamp = new Date().toISOString();

      console.log(`[${timestamp}] Mensaje en ${topic}`);

      let payload;

      // El tópico status puede venir como texto simple
      if (topic === MQTT_TOPICS.status) {
        payload = rawMessage;
      } else {
        payload = JSON.parse(rawMessage);
      }

      if (topic === MQTT_TOPICS.telemetry) {

        // Agregar timestamp del servidor
        payload.server_received = timestamp;

        database.telemetry.push(payload);

        if (database.telemetry.length > database.maxEntries) {
          database.telemetry.shift();
        }

        console.log(`  ✓ Telemetría guardada (${database.telemetry.length} registros)`);

      } else if (topic === MQTT_TOPICS.status) {

        database.lastStatus = {
          status: payload,
          server_received: timestamp
        };

        console.log(`  ✓ Status actualizado: ${payload}`);

      } else if (topic === MQTT_TOPICS.alerts) {

        payload.server_received = timestamp;

        database.alerts.push(payload);

        if (database.alerts.length > database.maxEntries) {
          database.alerts.shift();
        }

        console.log(`  ⚠️ Alerta registrada: ${payload.alert}`);
      }

    } catch (error) {

      console.error('Error al procesar mensaje:', error);

      console.error('Topic:', topic);
      console.error('Mensaje recibido:', message.toString());
    }
  });
  
  client.on('disconnect', () => {
    console.log('[MQTT] Desconectado del broker');
  });
  
  client.on('error', (error) => {
    console.error('[MQTT] Error:', error.message);
  });
  
  client.on('reconnect', () => {
    console.log('[MQTT] Intentando reconectar...');
  });
}

// ==================== FUNCIONES AUXILIARES ====================

function calculateActiveTime(device, data) {
  let activeMs = 0;
  
  for (let i = 0; i < data.length - 1; i++) {
    const isActive = device === 'pump' 
      ? data[i].actuators.pump === 'on'
      : data[i].actuators.light === 'on';
    
    if (isActive) {
      // Asumir 5 segundos entre lecturas
      activeMs += 5000;
    }
  }
  
  return activeMs;
}

// ==================== INICIAR SERVIDOR ====================

app.listen(PORT, () => {
  console.log(`\n╔════════════════════════════════════════╗`);
  console.log(`║  🌱 Smart Irrigation Backend - API    ║`);
  console.log(`╚════════════════════════════════════════╝\n`);
  console.log(`Server escuchando en http://localhost:${PORT}\n`);
  
  console.log(`Endpoints disponibles:`);
  console.log(`  GET  /health                    → Status rápido`);
  console.log(`  GET  /status                    → Info completa`);
  console.log(`  GET  /telemetry/latest          → Último dato`);
  console.log(`  GET  /telemetry?limit=50        → Histórico`);
  console.log(`  GET  /sensors/current           → Sensores actuales`);
  console.log(`  GET  /actuators/current         → Estado de actuadores`);
  console.log(`  GET  /alerts                    → Alertas`);
  console.log(`  GET  /stats                     → Estadísticas`);
  console.log(`  POST /control/pump              → Control bomba`);
  console.log(`  POST /control/light             → Control luz`);
  console.log(`  POST /config/soil-threshold     → Actualizar umbral\n`);
});

// Conectar a MQTT
connectMQTT();

// Manejo de cierre
process.on('SIGINT', () => {
  console.log('\n[Sistema] Apagando...');
  if (client) {
    client.end();
  }
  process.exit(0);
});

module.exports = app;
