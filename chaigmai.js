const WebSocket = require("ws");
const fs = require("fs");
const path = require("path");
const DatabaseService = require("./src/database/DatabaseService");

// Configuration
const config = {
  connectionTimeout: 30000,
  reconnectDelay: 5000,
  maxReconnectAttempts: 10,
};

// Create logs directory if it doesn't exist
const logsDir = path.join(__dirname, "logs");
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir);
}

// Create log file with timestamp
const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const logFile = path.join(logsDir, `chiangmai_${timestamp}.log`);

// Logging function
function log(message, level = "INFO") {
  const logMessage = `[${new Date().toISOString()}] [${level}] ${message}\n`;
  console.log(logMessage.trim());
  fs.appendFileSync(logFile, logMessage);
}

// WebSocket Client Class
class ChiangMaiClient {
  constructor() {
    this.config = {
      name: "เชียงใหม่",
      ip: "ws://10.7.1.5/ws",
    };
    this.ws = null;
    this.USID = null;
    this.isConnected = false;
    this.reconnectAttempts = 0;
    this.meterData = {}; // Will be initialized dynamically based on monitored objects
    this.databaseService = null;
    this.stationRecord = null;
    this.lastDbSave = null;
    this.dbSaveInterval = 10000; // Save to DB every 10 seconds
    this.monitoredObjects = []; // Dynamic monitored objects for this station
    this.objectLabels = {}; // Labels for display
  }

  // Connect to WebSocket
  async connect() {
    return new Promise((resolve, reject) => {
      console.log(`\n[${this.config.name}] กำลังเชื่อมต่อ: ${this.config.ip}`);

      // เพิ่ม headers เหมือน browser
      const wsOptions = {
        headers: {
          Connection: "Upgrade",
          Upgrade: "websocket",
          Origin: "*",
          "User-Agent":
            "Mozilla/5.0 (Linux; Android 8.0.0; SM-G955U Build/R16NW) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36",
          "Accept-Language": "en-US,en;q=0.9",
          "Cache-Control": "no-cache",
          Pragma: "no-cache",
        },
        perMessageDeflate: false,
        handshakeTimeout: config.connectionTimeout,
      };

      this.ws = new WebSocket(this.config.ip, wsOptions);

      const timeout = setTimeout(() => {
        reject(new Error("Connection timeout"));
      }, config.connectionTimeout);

      this.ws.on("open", () => {
        clearTimeout(timeout);
        console.log(`[${this.config.name}] ✓ เชื่อมต่อสำเร็จ`);
        log(`[${this.config.name}] เชื่อมต่อกับ WebSocket สำเร็จ`);
        this.isConnected = true;
        this.reconnectAttempts = 0;
        resolve();
      });

      this.ws.on("error", (error) => {
        clearTimeout(timeout);
        console.error(`[${this.config.name}] ✗ Error:`, error.message);
        log(`[${this.config.name}] WebSocket Error: ${error.message}`, "ERROR");
        reject(error);
      });

      this.ws.on("close", () => {
        console.log(`[${this.config.name}] การเชื่อมต่อปิด`);
        log(`[${this.config.name}] WebSocket connection closed`);
        this.isConnected = false;
        this.handleReconnect();
      });
    });
  }

  // Handle reconnection
  handleReconnect() {
    if (this.reconnectAttempts >= config.maxReconnectAttempts) {
      log(
        `[${this.config.name}] Max reconnect attempts reached. Stopping.`,
        "ERROR"
      );
      return;
    }

    this.reconnectAttempts++;
    log(
      `[${this.config.name}] Attempting to reconnect (${this.reconnectAttempts}/${config.maxReconnectAttempts})...`
    );

    setTimeout(async () => {
      try {
        await this.connect();
        await this.setUpSession();
      } catch (error) {
        log(
          `[${this.config.name}] Reconnection failed: ${error.message}`,
          "ERROR"
        );
      }
    }, config.reconnectDelay);
  }

  async setUpSession() {
    const DATA = {
      id: 0,
      method: "comet.signIn",
      params: [
        { $class: "com.wcs.comet.shared.CoreGTLoginContext" },
        "Admin",
        "admin",
        {
          $className: "com.wcs.comet.shared.ClientInfo",
          userLevel: -1,
          ConnectionTimeStamp: 0,
          DataTimeout: 0,
          IpAddress: null,
          Protocol: null,
          ProtocolVersion: 0,
          SID: -1,
          USID: null,
          UserAgent: "GWT Comet Client",
          UserAgentVersion: 2,
          UserLevel: -1,
          UserName: "WebApp Client",
          Admin: false,
          Guest: false,
          Logged: false,
        },
        30,
        30,
      ],
    };

    const DATA1 = {
      id: 1,
      method: "comet.subscribeNotification",
      params: ["", "ScriptEngine", { displayName: "Admin" }],
    };

    const DATA2 = {
      id: 2,
      method: "ScriptEngine.setUpdateRate",
      params: ["", 3000],
    };

    const DATA3 = {
      id: 3,
      method: "ScriptEngine.loadScriptInfo",
      params: [],
    };

    const DATA4 = {
      id: 4,
      method: "ScriptEngine.loadDashboards",
      params: [],
    };

    const DATA5 = {
      id: 5,
      method: "ScriptEngine.loadScriptInfo",
      params: [],
    };

    const DATA6 = {
      id: 6,
      method: "ScriptEngine.loadScene",
      params: ["d0cf3a77-e9dd-4419-bec0-b54ecad3e541"],
    };

    // Load station-specific monitored objects from database
    await this.loadMonitoredObjects();

    const DATA7 = {
      id: 7,
      method: "ScriptEngine.registerActiveObjects",
      params: [
        "",
        [...this.monitoredObjects, -1],
      ],
    };

    try {
      log(`[${this.config.name}] ส่งข้อมูลชุด ID 0 (Sending data ID 0)`);
      await this.sendData(DATA);
      await this.handleWSMessage(0);

      log(`[${this.config.name}] ส่งข้อมูลชุด ID 1 (Sending data ID 1)`);
      DATA1.params[0] = this.USID;
      await this.sendData(DATA1);
      await this.handleWSMessage1(1);

      log(`[${this.config.name}] ส่งข้อมูลชุด ID 2 (Sending data ID 2)`);
      DATA2.params[0] = this.USID;
      await this.sendData(DATA2);
      await this.handleWSMessage1(2);

      log(`[${this.config.name}] ส่งข้อมูลชุด ID 3 (Sending data ID 3)`);
      await this.sendData(DATA3);
      await this.handleWSMessage2(3);

      log(`[${this.config.name}] ส่งข้อมูลชุด ID 4 (Sending data ID 4)`);
      await this.sendData(DATA4);
      await this.handleWSMessage2(4);

      log(`[${this.config.name}] ส่งข้อมูลชุด ID 5 (Sending data ID 5)`);
      await this.sendData(DATA5);
      await this.handleWSMessage2(5);

      log(`[${this.config.name}] ส่งข้อมูลชุด ID 6 (Sending data ID 6)`);
      await this.sendData(DATA6);
      await this.handleWSMessage2(6);

      log(`[${this.config.name}] ส่งข้อมูลชุด ID 7 (Sending data ID 7)`);
      DATA7.params[0] = this.USID;
      await this.sendData(DATA7);
      await this.handleWSMessage1(7);

      log(`[${this.config.name}] Listening for notifications...`);
      this.handleWSMessageALL();
    } catch (error) {
      log(
        `[${this.config.name}] เกิดข้อผิดพลาด (Error occurred): ${error.message}`,
        "ERROR"
      );
      throw error;
    }
  }

  handleWSMessage(expectedId) {
    return new Promise((resolve, reject) => {
      const messageHandler = (data) => {
        try {
          const msg = JSON.parse(data);
          if (msg.id === expectedId && msg.result && msg.result.USID) {
            this.USID = msg.result.USID;
            log(`[${this.config.name}] USID received: ${this.USID}`);
            this.ws.removeListener("message", messageHandler);
            resolve({ data: "Data USID successfully" });
          }
        } catch (error) {
          log(
            `[${this.config.name}] Error parsing message: ${error.message}`,
            "ERROR"
          );
        }
      };
      this.ws.on("message", messageHandler);
    });
  }

  handleWSMessage1(expectedId) {
    return new Promise((resolve, reject) => {
      const messageHandler = (data) => {
        try {
          const msg = JSON.parse(data);
          if (msg.id === expectedId && msg.result === true) {
            log(`[${this.config.name}] ID ${expectedId} result: true`);
            this.ws.removeListener("message", messageHandler);
            resolve({ data: "result true successfully" });
          }
        } catch (error) {
          log(
            `[${this.config.name}] Error parsing message: ${error.message}`,
            "ERROR"
          );
        }
      };
      this.ws.on("message", messageHandler);
    });
  }

  handleWSMessage2(expectedId) {
    return new Promise((resolve, reject) => {
      const messageHandler = (data) => {
        try {
          const msg = JSON.parse(data);
          if (msg.id === expectedId && msg.cached === true) {
            log(`[${this.config.name}] ID ${expectedId} cached: true`);
            this.ws.removeListener("message", messageHandler);
            resolve({ data: "cached true successfully" });
          }
        } catch (error) {
          log(
            `[${this.config.name}] Error parsing message: ${error.message}`,
            "ERROR"
          );
        }
      };
      this.ws.on("message", messageHandler);
    });
  }

  handleWSMessageALL() {
    this.ws.on("message", (data) => {
      try {
        const msg = JSON.parse(data);
        if (msg.notification && msg.notification.provider === "ScriptEngine") {
          const syncData = msg.notification.value?.sync;
          if (syncData) {
            let dataUpdated = false;
            this.monitoredObjects.forEach((id) => {
              if (syncData.hasOwnProperty(id.toString())) {
                const value = syncData[id.toString()];
                if (this.meterData[id.toString()] !== value) {
                  this.meterData[id.toString()] = value;
                  dataUpdated = true;
                }
              }
            });

            if (dataUpdated) {
              this.displayData();
              log(
                `[${this.config.name}] Meter data updated: ${JSON.stringify(
                  this.meterData
                )}`,
                "DATA"
              );

              // Save to database if enabled
              if (this.databaseService && this.stationRecord) {
                this.saveToDatabase();
              }
            }
          }
        }
      } catch (error) {
        log(
          `[${this.config.name}] Error handling notification: ${error.message}`,
          "ERROR"
        );
      }
    });
  }

  sendData(data_agent) {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify(data_agent) + "\n");
          log(`[${this.config.name}] Data sent: ID ${data_agent.id}`, "DEBUG");
          resolve({ data: "Data sent successfully" });
        } else {
          const error = new Error("WebSocket is not open");
          log(`[${this.config.name}] ${error.message}`, "ERROR");
          reject(error);
        }
      }, 1000);
    });
  }

  // Initialize database connection and station record
  async initializeDatabase() {
    try {
      log(`[${this.config.name}] Initializing database connection...`);
      this.databaseService = new DatabaseService();
      await this.databaseService.connect();

      // Find or create station record
      const stationConfig = {
        name: this.config.name,
        ip: this.config.ip,
        scene: "d0cf3a77-e9dd-4419-bec0-b54ecad3e541",
      };

      this.stationRecord = await this.databaseService.findOrCreateStation(
        stationConfig
      );
      log(
        `[${this.config.name}] Database station initialized: ${this.stationRecord.id}`
      );
    } catch (error) {
      log(
        `[${this.config.name}] Failed to initialize database: ${error.message}`,
        "ERROR"
      );
      this.databaseService = null;
    }
  }

  // Load monitored objects for this station
  async loadMonitoredObjects() {
    try {
      if (!this.databaseService || !this.stationRecord) {
        // Fallback to default monitored objects if no database
        this.monitoredObjects = [8684, 8686, 8687, 18069, 73909, 73910]; // Chiang Mai specific defaults
        this.setupObjectLabels();
        this.initializeMeterData();
        log(`[${this.config.name}] Using default monitored objects (no database)`);
        return;
      }

      const monitoredData = await this.databaseService.getStationMonitoredObjects(this.stationRecord.id);
      
      if (monitoredData.count > 0) {
        this.monitoredObjects = monitoredData.objectIds;
        this.setupObjectLabels(monitoredData.objectMap);
        log(`[${this.config.name}] Loaded ${monitoredData.count} station-specific monitored objects: [${this.monitoredObjects.join(', ')}]`);
      } else {
        // Fallback to Chiang Mai specific defaults if no station-specific objects found
        this.monitoredObjects = [8684, 8686, 8687, 18069, 73909, 73910];
        this.setupObjectLabels();
        log(`[${this.config.name}] No station-specific objects found, using Chiang Mai defaults`);
      }

      // Initialize meterData based on monitored objects
      this.initializeMeterData();
      
    } catch (error) {
      log(`[${this.config.name}] Failed to load monitored objects: ${error.message}`, 'ERROR');
      // Fallback to default monitored objects
      this.monitoredObjects = [8684, 8686, 8687, 18069, 73909, 73910];
      this.setupObjectLabels();
      this.initializeMeterData();
    }
  }

  // Initialize meterData based on monitored objects
  initializeMeterData() {
    this.meterData = {};
    this.monitoredObjects.forEach(id => {
      this.meterData[id.toString()] = null;
    });
    log(`[${this.config.name}] Initialized meter data for ${this.monitoredObjects.length} objects`);
  }

  // Setup object labels for display
  setupObjectLabels(objectMap = null) {
    // Default labels
    const defaultLabels = {
      8684: "Active Power 1",
      8686: "Active Power 3",
      8687: "Active Power 4",
      18069: "MUX#1 Power Meter",
      73909: "MUX#3 Power Meter",
      73910: "MUX#4 Power Meter"
    };

    // If we have object mapping from database, create more specific labels
    if (objectMap) {
      this.objectLabels = {};
      Object.entries(objectMap).forEach(([objectType, objectId]) => {
        // Create label based on object type
        const typeLabels = {
          'activePower1': 'Active Power 1',
          'activePower2': 'Active Power 2',
          'activePower3': 'Active Power 3',
          'activePower4': 'Active Power 4',
          'activePower5': 'Active Power 5',
          'activePower6': 'Active Power 6',
          'muxPower1': 'MUX#1 Power Meter',
          'muxPower2': 'MUX#2 Power Meter',
          'muxPower3': 'MUX#3 Power Meter',
          'muxPower4': 'MUX#4 Power Meter',
          'muxPower5': 'MUX#5 Power Meter',
          'muxPower6': 'MUX#6 Power Meter'
        };
        
        this.objectLabels[objectId] = typeLabels[objectType] || `${objectType} (ID ${objectId})`;
      });
    } else {
      this.objectLabels = defaultLabels;
    }
  }

  // Save current data to database
  async saveToDatabase() {
    try {
      // Check if enough time has passed since last save
      const now = new Date();
      if (this.lastDbSave && now - this.lastDbSave < this.dbSaveInterval) {
        return;
      }

      const readingData = {
        stationId: this.stationRecord.id,
        timestamp: now,
        powerData: { ...this.meterData },
      };

      // Validate data before saving
      const validation = this.databaseService.validatePowerData(this.meterData);
      if (!validation.isValid) {
        log(
          `[${this.config.name}] Invalid power data: ${validation.errors.join(
            ", "
          )}`,
          "ERROR"
        );
        return;
      }

      if (validation.warnings.length > 0) {
        log(
          `[${
            this.config.name
          }] Power data warnings: ${validation.warnings.join(", ")}`,
          "WARN"
        );
      }

      await this.databaseService.createPowerReading(readingData);
      this.lastDbSave = now;

      // Log successful saves less frequently to reduce noise
      if (Math.random() < 0.1) {
        // Log ~10% of saves
        log(`[${this.config.name}] Data saved to database`);
      }
    } catch (error) {
      log(
        `[${this.config.name}] Failed to save to database: ${error.message}`,
        "ERROR"
      );

      // If it's a connection error, try to reinitialize
      if (
        error.message.includes("Connection") ||
        error.message.includes("database")
      ) {
        setTimeout(() => this.initializeDatabase(), 5000);
      }
    }
  }

  // Display current data in a formatted way
  displayData() {
    const timestamp = new Date().toLocaleTimeString("th-TH");
    console.log(`\n[${this.config.name}] 📊 อัพเดทข้อมูล - ${timestamp}`);
    console.log("─".repeat(60));

    Object.entries(this.meterData).forEach(([id, value]) => {
      if (value !== null) {
        const label = this.objectLabels[id] || `ID ${id}`;
        const unit = parseInt(id) >= 18000 ? "kWh" : "W";
        const formattedValue = parseFloat(value).toLocaleString("th-TH", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        });
        console.log(
          `  ${label.padEnd(30)} : ${formattedValue.padStart(15)} ${unit}`
        );
      }
    });

    console.log("─".repeat(60));
  }

  disconnect() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      log(`[${this.config.name}] Disconnecting WebSocket...`);
      this.ws.close();
    }

    // Disconnect from database
    if (this.databaseService) {
      this.databaseService.disconnect();
    }
  }
}

// Main execution
async function main() {
  log("=== Starting Chiang Mai WebSocket Client ===");

  const client = new ChiangMaiClient();

  try {
    // Initialize database first
    await client.initializeDatabase();

    // Then connect to WebSocket
    await client.connect();
    await client.setUpSession();
    log("Session established successfully");

    // Keep the process running
    process.on("SIGINT", () => {
      log("Received SIGINT, shutting down...");
      client.disconnect();
      setTimeout(() => process.exit(0), 1000);
    });

    process.on("SIGTERM", () => {
      log("Received SIGTERM, shutting down...");
      client.disconnect();
      setTimeout(() => process.exit(0), 1000);
    });
  } catch (error) {
    log(`Failed to connect: ${error.message}`, "ERROR");
    process.exit(1);
  }
}

// Run the application
main();
