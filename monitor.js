const WebSocket = require("ws");
const DatabaseService = require("./src/database/DatabaseService");
const ApiDataFetcher = require("./src/api/ApiDataFetcher");
const { spawn } = require("child_process");

// ==================== Configuration ====================
// Default/fallback station configurations (used if database is unavailable)
const defaultStations = [
  {
    name: "แพร่",
    ip: "ws://10.8.1.5/ws",
    scene: "d0cf3a77-e9dd-4419-bec0-b54ecad3e541",
  },
  {
    name: "น่าน",
    ip: "ws://10.8.2.5/ws",
    scene: "d0cf3a77-e9dd-4419-bec0-b54ecad3e541",
  },
  {
    name: "ชุมพร",
    ip: "ws://10.3.1.5/ws",
    scene: "d0cf3a77-e9dd-4419-bec0-b54ecad3e541",
  },
];

const config = {
  stations: [], // Will be loaded dynamically from database
  defaultStations: defaultStations, // Fallback stations
  monitoredObjects: [
    8684,
    8685,
    8686,
    8687,
    8688,
    8689, // Active Power 1-6
    18069,
    18070, // MUX#1-2 Power Meter
    73909,
    73910, // MUX#3-4 Power Meter
    75428,
    75429, // MUX#5-6 Power Meter
  ],
  updateRate: 3000, // 3 sec
  connectionTimeout: 10000, // 10 seconds
  reconnectInterval: 5000, // 5 seconds
  maxReconnectAttempts: 5,
  cycleDelay: 60000, // 30 seconds per station
};

// ==================== Station Monitor Class ====================
class StationMonitor {
  constructor(stationConfig, databaseService = null) {
    this.config = stationConfig;
    this.ws = null;
    this.USID = null;
    this.isConnected = false;
    this.reconnectAttempts = 0;
    this.dataBuffer = {};
    this.lastUpdate = null;
    this.databaseService = databaseService;
    this.stationRecord = null; // Database station record
    this.pendingData = []; // Buffer for batch database operations
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
        this.isConnected = true;
        this.reconnectAttempts = 0;
        resolve();
      });

      this.ws.on("error", (error) => {
        clearTimeout(timeout);
        console.error(`[${this.config.name}] ✗ Error:`, error.message);
        reject(error);
      });

      this.ws.on("close", () => {
        console.log(`[${this.config.name}] การเชื่อมต่อปิด`);
        this.isConnected = false;
        this.handleReconnect();
      });
    });
  }

  // Send data with promise
  sendData(data) {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify(data) + "\n");
          resolve({ success: true });
        } else {
          reject(new Error("WebSocket is not open"));
        }
      }, 1000);
    });
  }

  // Wait for specific message
  waitForMessage(validator) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("Message timeout"));
      }, 5000);

      const handler = (data) => {
        try {
          const msg = JSON.parse(data);
          if (validator(msg)) {
            clearTimeout(timeout);
            this.ws.removeListener("message", handler);
            resolve(msg);
          }
        } catch (error) {
          // Continue listening
        }
      };

      this.ws.on("message", handler);
    });
  }

  // Initialize session
  async initializeSession() {
    try {
      console.log(`[${this.config.name}] กำลังเริ่มต้น session...`);

      // IMPORTANT: Initialize station and load monitored objects FIRST
      await this.initializeStationInDatabase();

      // Step 1: Sign In (changed from restoreSession)
      const signInData = {
        id: 0,
        // method: "comet.restoreSession",
        // method: "comet.signIn", //"comet.restoreSession"
        method: "comet.signIn",
        params: [
          { $class: "com.wcs.comet.shared.CoreGTLoginContext" },
          // uuids[UserAgent_IP],
          "Admin",
          "admin",
          // "Admin","admin", uuids[UserAgent_IP]
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

      await this.sendData(signInData);
      const sessionResponse = await this.waitForMessage(
        (msg) => msg.id === 0 && msg.result?.USID
      );
      this.USID = sessionResponse.result.USID;
      console.log(
        `[${this.config.name}] ✓ ได้รับ USID: ${this.USID.substring(0, 10)}...`
      );

      // Step 2: Subscribe Notification
      await this.sendData({
        id: 1,
        method: "comet.subscribeNotification",
        params: [this.USID, "ScriptEngine", { displayName: "Admin" }],
      });
      await this.waitForMessage((msg) => msg.id === 1 && msg.result === true);
      console.log(`[${this.config.name}] ✓ Subscribe สำเร็จ`);

      // Step 3: Set Update Rate
      await this.sendData({
        id: 2,
        method: "ScriptEngine.setUpdateRate",
        params: [this.USID, config.updateRate],
      });
      await this.waitForMessage((msg) => msg.id === 2 && msg.result === true);
      console.log(
        `[${this.config.name}] ✓ ตั้งค่า Update Rate: ${config.updateRate}ms`
      );

      // Step 4-6: Load Scripts and Scene
      await this.sendData({
        id: 3,
        method: "ScriptEngine.loadScriptInfo",
        params: [],
      });
      await this.waitForMessage((msg) => msg.id === 3);

      await this.sendData({
        id: 4,
        method: "ScriptEngine.loadDashboards",
        params: [],
      });
      await this.waitForMessage((msg) => msg.id === 4);

      await this.sendData({
        id: 5,
        method: "ScriptEngine.loadScriptInfo",
        params: [],
      });
      await this.waitForMessage((msg) => msg.id === 5);

      await this.sendData({
        id: 6,
        method: "ScriptEngine.loadScene",
        params: [this.config.scene],
      });
      await this.waitForMessage((msg) => msg.id === 6);
      console.log(`[${this.config.name}] ✓ โหลด Scene สำเร็จ`);

      // Step 7: Register Active Objects (use station-specific objects loaded earlier)
      // Step 7: Register Active Objects (use specific object list)
      // Step 7: Register Active Objects (use station-specific objects loaded earlier)
      console.log(
        `[${
          this.config.name
        }] 📋 Using monitored objects: [${this.monitoredObjects.join(", ")}]`
      );
      await this.sendData({
        id: 7,
        method: "ScriptEngine.registerActiveObjects",
        params: [this.USID, [...this.monitoredObjects, -1]],
      });
      await this.waitForMessage((msg) => msg.id === 7 && msg.result === true);
      console.log(
        `[${this.config.name}] ✓ ลงทะเบียน Objects สำเร็จ (${this.monitoredObjects.length} items)`
      );

      // Start monitoring
      this.startMonitoring();
    } catch (error) {
      console.error(
        `[${this.config.name}] ✗ เกิดข้อผิดพลาดในการเริ่มต้น:`,
        error.message
      );
      throw error;
    }
  }

  // Start real-time monitoring
  startMonitoring() {
    console.log(`[${this.config.name}] 🔄 เริ่มการ Monitor แบบ Real-time\n`);

    this.ws.on("message", (data) => {
      try {
        const msg = JSON.parse(data);

        if (msg.notification && msg.notification.provider === "ScriptEngine") {
          const syncData = msg.notification.value?.sync;
          if (syncData) {
            this.updateData(syncData);
          }
        }
      } catch (error) {
        // Ignore parse errors
      }
    });
  }

  // Initialize station in database and load monitored objects
  async initializeStationInDatabase() {
    if (!this.databaseService) {
      // Fallback to default monitored objects if no database
      this.monitoredObjects = [...config.monitoredObjects];
      this.setupObjectLabels();
      return;
    }

    try {
      this.stationRecord = await this.databaseService.findOrCreateStation(
        this.config
      );
      console.log(
        `[${this.config.name}] 💾 Database station initialized: ${this.stationRecord.id}`
      );

      // Load station-specific monitored objects
      await this.loadMonitoredObjects();
    } catch (error) {
      console.error(
        `[${this.config.name}] ❌ Failed to initialize station in database:`,
        error.message
      );
      // Fallback to default monitored objects
      this.monitoredObjects = [...config.monitoredObjects];
      this.setupObjectLabels();
    }
  }

  // Load monitored objects for this station
  async loadMonitoredObjects() {
    try {
      const monitoredData =
        await this.databaseService.getStationMonitoredObjects(
          this.stationRecord.id
        );

      if (monitoredData.count > 0) {
        this.monitoredObjects = monitoredData.objectIds;
        this.setupObjectLabels(monitoredData.objectMap);
        console.log(
          `[${this.config.name}] 📋 Loaded ${monitoredData.count} station-specific monitored objects`
        );
      } else {
        // Fallback to default if no station-specific objects found
        this.monitoredObjects = [...config.monitoredObjects];
        this.setupObjectLabels();
        console.log(
          `[${this.config.name}] ⚠️  No station-specific objects found, using defaults`
        );
      }
    } catch (error) {
      console.error(
        `[${this.config.name}] ❌ Failed to load monitored objects:`,
        error.message
      );
      // Fallback to default monitored objects
      this.monitoredObjects = [...config.monitoredObjects];
      this.setupObjectLabels();
    }
  }

  // Setup object labels for display
  setupObjectLabels(objectMap = null) {
    // Default labels
    const defaultLabels = {
      8684: "Active Power 1",
      8685: "Active Power 2",
      8686: "Active Power 3",
      8687: "Active Power 4",
      8688: "Active Power 5",
      8689: "Active Power 6",
      18069: "MUX#1 TV5 Power Meter",
      18070: "MUX#2 MCOT Power Meter",
      73909: "MUX#3 PRD Power Meter",
      73910: "MUX#4 TPBS Power Meter",
      75428: "MUX#5 Power Meter",
      75429: "MUX#6 Power Meter",
    };

    // If we have object mapping from database, create more specific labels
    if (objectMap) {
      this.objectLabels = {};
      Object.entries(objectMap).forEach(([objectType, objectId]) => {
        // Create label based on object type
        const typeLabels = {
          activePower1: "Active Power 1",
          activePower2: "Active Power 2",
          activePower3: "Active Power 3",
          activePower4: "Active Power 4",
          activePower5: "Active Power 5",
          activePower6: "Active Power 6",
          muxPower1: "MUX#1 Power Meter",
          muxPower2: "MUX#2 Power Meter",
          muxPower3: "MUX#3 Power Meter",
          muxPower4: "MUX#4 Power Meter",
          muxPower5: "MUX#5 Power Meter",
          muxPower6: "MUX#6 Power Meter",
        };

        this.objectLabels[objectId] =
          typeLabels[objectType] || `${objectType} (ID ${objectId})`;
      });
    } else {
      this.objectLabels = defaultLabels;
    }
  }

  // Update data buffer
  updateData(syncData) {
    this.lastUpdate = new Date();
    let hasChanges = false;

    this.monitoredObjects.forEach((id) => {
      if (syncData.hasOwnProperty(id.toString())) {
        const newValue = syncData[id.toString()];
        if (this.dataBuffer[id] !== newValue) {
          this.dataBuffer[id] = newValue;
          hasChanges = true;
        }
      }
    });

    if (hasChanges) {
      this.displayData();

      // Save to database if enabled
      if (this.databaseService && this.stationRecord) {
        this.saveToDatabase();
      }
    }
  }

  // Save current data to database
  async saveToDatabase() {
    try {
      // Check if enough time has passed since last save to avoid too frequent writes
      const now = new Date();
      if (this.lastDbSave && now - this.lastDbSave < this.dbSaveInterval) {
        return;
      }

      const readingData = {
        stationId: this.stationRecord.id,
        timestamp: this.lastUpdate,
        powerData: { ...this.dataBuffer },
      };

      // Validate data before saving
      const validation = this.databaseService.validatePowerData(
        this.dataBuffer
      );
      if (!validation.isValid) {
        console.error(
          `[${this.config.name}] ❌ Invalid power data:`,
          validation.errors
        );
        return;
      }

      if (validation.warnings.length > 0) {
        console.warn(
          `[${this.config.name}] ⚠️  Power data warnings:`,
          validation.warnings
        );
      }

      await this.databaseService.createPowerReading(readingData);
      this.lastDbSave = now;

      // Optional: Log successful saves less frequently to reduce noise
      if (Math.random() < 0.1) {
        // Log ~10% of saves
        console.log(`[${this.config.name}] 💾 Data saved to database`);
      }
    } catch (error) {
      console.error(
        `[${this.config.name}] ❌ Failed to save to database:`,
        error.message
      );

      // If it's a connection error, try to reinitialize the station
      if (
        error.message.includes("Connection") ||
        error.message.includes("database")
      ) {
        setTimeout(() => this.initializeStationInDatabase(), 5000);
      }
    }
  }

  // Display current data
  displayData() {
    const timestamp = this.lastUpdate.toLocaleTimeString("th-TH");
    console.log(`\n[${this.config.name}] 📊 อัพเดทข้อมูล - ${timestamp}`);
    console.log("─".repeat(60));

    Object.entries(this.dataBuffer).forEach(([id, value]) => {
      const label = this.objectLabels[id] || `ID ${id}`;
      const unit = parseInt(id) >= 18000 ? "kWh" : "W";
      const formattedValue = parseFloat(value).toLocaleString("th-TH", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
      console.log(
        `  ${label.padEnd(30)} : ${formattedValue.padStart(15)} ${unit}`
      );
    });

    console.log("─".repeat(60));
  }

  // Get current data snapshot
  getDataSnapshot() {
    return {
      station: this.config.name,
      timestamp: this.lastUpdate,
      data: { ...this.dataBuffer },
    };
  }

  // Handle reconnection
  handleReconnect() {
    if (this.reconnectAttempts < config.maxReconnectAttempts) {
      this.reconnectAttempts++;
      console.log(
        `[${this.config.name}] 🔄 กำลังลองเชื่อมต่อใหม่... (ครั้งที่ ${this.reconnectAttempts})`
      );

      setTimeout(() => {
        this.connect()
          .then(() => this.initializeSession())
          .catch((error) => {
            console.error(
              `[${this.config.name}] ✗ Reconnect failed:`,
              error.message
            );
          });
      }, config.reconnectInterval);
    } else {
      console.error(`[${this.config.name}] ✗ เกินจำนวนครั้งการลองเชื่อมต่อ`);
    }
  }

  // Disconnect
  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
      this.isConnected = false;
      this.USID = null;
    }
  }
}

// ==================== Main Monitor Controller ====================
class MonitorController {
  constructor() {
    this.monitors = [];
    this.currentIndex = 0;
    this.isRunning = false;
    this.allData = [];
    this.databaseService = null;
    this.databaseEnabled = true; // Can be configured via environment variable
    this.chiangMaiProcess = null; // Process for chaigmai.js
  }

  // Load station configurations from database
  async loadStationsFromDatabase() {
    if (!this.databaseService) {
      console.log(
        "⚠️  Database not available, using default station configurations"
      );
      return config.defaultStations;
    }

    try {
      console.log("📡 Loading station configurations from database...");
      const dbStations = await this.databaseService.getAllStations();

      if (dbStations.length === 0) {
        console.log(
          "📡 No stations found in database, seeding with default configurations..."
        );
        await this.seedDefaultStations();
        return config.defaultStations;
      }

      // Transform database stations to monitor config format (filter out incomplete stations)
      const completeStations = [];
      const incompleteStations = [];

      dbStations.forEach((station) => {
        // For API stations, only name and ipAddress are required
        if (
          station.ipAddress &&
          station.ipAddress.startsWith("http://") &&
          station.ipAddress.includes("/data")
        ) {
          if (station.name && station.ipAddress) {
            completeStations.push(station);
          } else {
            incompleteStations.push(station);
          }
        }
        // For WebSocket stations, name, ipAddress, and scene are required (no UUID needed)
        else if (station.name && station.ipAddress && station.scene) {
          completeStations.push(station);
        } else {
          incompleteStations.push(station);
        }
      });

      if (incompleteStations.length > 0) {
        console.log(
          `⚠️  Skipping ${incompleteStations.length} incomplete stations:`
        );
        incompleteStations.forEach((station) => {
          const missing = [];
          if (!station.name) missing.push("name");
          if (!station.ipAddress) missing.push("ipAddress");
          if (
            !station.scene &&
            (!station.ipAddress || !station.ipAddress.includes("/data"))
          )
            missing.push("scene");
          console.log(
            `   - ${station.name || "Unnamed"} (missing: ${missing.join(", ")})`
          );
        });
      }

      const stationConfigs = completeStations.map((station) => ({
        name: station.name,
        ip: station.ipAddress,
        scene: station.scene,
      }));

      console.log(`📡 Loaded ${stationConfigs.length} stations from database:`);
      stationConfigs.forEach((station) => {
        const typeDisplay =
          station.ip && station.ip.includes("/data") ? "API" : "WebSocket";
        console.log(`   - ${station.name} (${typeDisplay})`);
      });

      return stationConfigs;
    } catch (error) {
      console.error("❌ Failed to load stations from database:", error.message);
      console.log("⚠️  Falling back to default station configurations");
      return config.defaultStations;
    }
  }

  // Seed database with default station configurations
  async seedDefaultStations() {
    if (!this.databaseService) {
      return;
    }

    try {
      console.log("🌱 Seeding database with default stations...");

      for (const stationConfig of config.defaultStations) {
        await this.databaseService.findOrCreateStation(stationConfig);
      }

      console.log("✅ Default stations seeded successfully");
    } catch (error) {
      console.error("❌ Failed to seed default stations:", error.message);
    }
  }

  // Refresh station configurations from database (for runtime updates)
  async refreshStationConfigurations() {
    if (!this.databaseService) {
      console.log("⚠️  Database not available, cannot refresh configurations");
      return false;
    }

    try {
      console.log("🔄 Refreshing station configurations from database...");
      const newStations = await this.loadStationsFromDatabase();

      // Check if configurations have changed
      const currentStationNames = config.stations.map((s) => s.name).sort();
      const newStationNames = newStations.map((s) => s.name).sort();

      const hasChanges =
        JSON.stringify(currentStationNames) !== JSON.stringify(newStationNames);

      if (hasChanges) {
        console.log("📡 Station configuration changes detected");
        config.stations = newStations;

        // Note: In a production system, you might want to restart monitors here
        // For now, we'll just update the configuration
        console.log(
          "⚠️  Configuration updated. Restart required for changes to take effect."
        );
        return true;
      } else {
        console.log("📡 No station configuration changes detected");
        return false;
      }
    } catch (error) {
      console.error(
        "❌ Failed to refresh station configurations:",
        error.message
      );
      return false;
    }
  }

  // Initialize all monitors
  async initialize() {
    console.log("🚀 เริ่มต้นระบบ Monitor\n");

    // Initialize database service first
    if (this.databaseEnabled) {
      try {
        console.log("💾 เริ่มต้นระบบฐานข้อมูล...");
        this.databaseService = new DatabaseService();
        await this.databaseService.connect();

        const dbInfo = await this.databaseService.getDatabaseInfo();
        console.log(
          `💾 ฐานข้อมูลพร้อมใช้งาน - สถานี: ${dbInfo.stationCount}, บันทึก: ${dbInfo.readingCount}`
        );
      } catch (error) {
        console.error("❌ ไม่สามารถเชื่อมต่อฐานข้อมูล:", error.message);
        console.log("⚠️  ระบบจะทำงานแบบ file logging เท่านั้น");
        this.databaseService = null;
      }
    }

    // Load station configurations dynamically
    config.stations = await this.loadStationsFromDatabase();

    console.log(`📡 สถานีทั้งหมด: ${config.stations.length}`);
    console.log(`⏱️  อัตราการอัพเดท: ${config.updateRate}ms`);
    console.log(`🔄 รอบการเปลี่ยนสถานี: ${config.cycleDelay}ms`);
    console.log(""); // Empty line for spacing

    // Create monitors with database service (WebSocket or API based)
    for (const stationConfig of config.stations) {
      if (ApiDataFetcher.isApiStation(stationConfig)) {
        console.log(`📡 Creating API monitor for: ${stationConfig.name}`);
        const apiMonitor = new ApiDataFetcher(
          stationConfig,
          this.databaseService
        );
        this.monitors.push(apiMonitor);
      } else {
        console.log(`📡 Creating WebSocket monitor for: ${stationConfig.name}`);
        const wsMonitor = new StationMonitor(
          stationConfig,
          this.databaseService
        );
        this.monitors.push(wsMonitor);
      }
    }
  }

  // Start monitoring with rotation
  async startRotation() {
    this.isRunning = true;

    while (this.isRunning) {
      const monitor = this.monitors[this.currentIndex];

      try {
        // Connect and initialize
        await monitor.connect();
        await monitor.initializeSession();

        // Monitor for specified duration
        await this.sleep(config.cycleDelay);

        // Collect data snapshot
        const snapshot = monitor.getDataSnapshot();
        this.allData.push(snapshot);

        // Disconnect
        monitor.disconnect();

        // Move to next station
        this.currentIndex = (this.currentIndex + 1) % this.monitors.length;

        console.log(`\n🔄 เปลี่ยนไปสถานีถัดไป...\n`);
      } catch (error) {
        console.error(`✗ เกิดข้อผิดพลาด:`, error.message);
        this.currentIndex = (this.currentIndex + 1) % this.monitors.length;
      }
    }
  }

  // Start monitoring all stations simultaneously
  async startSimultaneous() {
    this.isRunning = true;
    console.log("🔄 เริ่มการ Monitor ทุกสถานีพร้อมกัน\n");

    // Start Chiang Mai station (chaigmai.js)
    await this.startChiangMaiStation();

    const promises = this.monitors.map(async (monitor) => {
      try {
        if (monitor instanceof ApiDataFetcher) {
          // API-based monitor
          await monitor.start();
        } else {
          // WebSocket-based monitor
          await monitor.connect();
          await monitor.initializeSession();
        }
      } catch (error) {
        console.error(`✗ ${monitor.config.name} ล้มเหลว:`, error.message);
      }
    });

    await Promise.allSettled(promises);

    console.log(
      "\n✓ ทุกสถานีพร้อมทำงาน (รวมเชียงใหม่) - กด Ctrl+C เพื่อหยุด\n"
    );
  }

  // Get summary report
  getSummary() {
    console.log("\n📊 สรุปข้อมูลทั้งหมด");
    console.log("═".repeat(80));

    this.allData.forEach((snapshot) => {
      console.log(
        `\n🏢 ${snapshot.station} - ${snapshot.timestamp?.toLocaleString(
          "th-TH"
        )}`
      );
      console.log("─".repeat(60));

      Object.entries(snapshot.data).forEach(([id, value]) => {
        console.log(`  ID ${id}: ${value}`);
      });
    });
  }

  // Start Chiang Mai station process
  async startChiangMaiStation() {
    try {
      console.log("🏢 เริ่มต้นสถานีเชียงใหม่...");

      // Ensure Chiang Mai station exists in database
      if (this.databaseService) {
        const chiangMaiConfig = {
          name: "เชียงใหม่",
          ip: "ws://10.7.1.5/ws",
          scene: "d0cf3a77-e9dd-4419-bec0-b54ecad3e541",
        };

        await this.databaseService.findOrCreateStation(chiangMaiConfig);
        console.log("💾 สถานีเชียงใหม่พร้อมในฐานข้อมูล");
      }

      // Start chaigmai.js process
      this.chiangMaiProcess = spawn("node", ["chaigmai.js"], {
        stdio: ["pipe", "pipe", "pipe"],
        cwd: process.cwd(),
      });

      // Handle process output
      this.chiangMaiProcess.stdout.on("data", (data) => {
        const output = data.toString().trim();
        if (output) {
          console.log(`[เชียงใหม่] ${output}`);
        }
      });

      this.chiangMaiProcess.stderr.on("data", (data) => {
        const error = data.toString().trim();
        if (error) {
          console.error(`[เชียงใหม่] ERROR: ${error}`);
        }
      });

      this.chiangMaiProcess.on("close", (code) => {
        console.log(`[เชียงใหม่] Process exited with code ${code}`);
        if (this.isRunning && code !== 0) {
          // Restart if it crashed and we're still running
          setTimeout(() => {
            console.log("[เชียงใหม่] Restarting...");
            this.startChiangMaiStation();
          }, 5000);
        }
      });

      this.chiangMaiProcess.on("error", (error) => {
        console.error(`[เชียงใหม่] Failed to start process:`, error.message);
      });

      console.log("✓ สถานีเชียงใหม่เริ่มทำงานแล้ว");
    } catch (error) {
      console.error("❌ ไม่สามารถเริ่มสถานีเชียงใหม่:", error.message);
    }
  }

  // Sleep utility
  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // Stop monitoring
  async stop() {
    this.isRunning = false;

    // Stop Chiang Mai process
    if (this.chiangMaiProcess) {
      console.log("⏹️  หยุดสถานีเชียงใหม่...");
      this.chiangMaiProcess.kill("SIGTERM");
      this.chiangMaiProcess = null;
    }

    this.monitors.forEach((monitor) => {
      if (monitor instanceof ApiDataFetcher) {
        monitor.stop();
      } else {
        monitor.disconnect();
      }
    });

    // Disconnect from database
    if (this.databaseService) {
      await this.databaseService.disconnect();
    }

    console.log("\n⏹️  หยุดการ Monitor\n");
  }
}

// ==================== Main Execution ====================
async function main() {
  const controller = new MonitorController();
  await controller.initialize();

  // เลือกโหมดการทำงาน
  const mode = process.argv[2] || "rotation";

  if (mode === "rotation") {
    console.log("🔄 โหมด: Rotation (เปลี่ยนสถานีทีละตัว)\n");
    await controller.startRotation();
  } else if (mode === "simultaneous") {
    console.log("🔄 โหมด: Simultaneous (Monitor ทุกสถานีพร้อมกัน)\n");
    await controller.startSimultaneous();
  }

  // Handle graceful shutdown
  process.on("SIGINT", async () => {
    console.log("\n\n🛑 รับสัญญาณหยุด...");
    await controller.stop();
    controller.getSummary();
    process.exit(0);
  });
}

// Run
main().catch((error) => {
  console.error("❌ Fatal Error:", error);
  process.exit(1);
});
