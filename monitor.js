const WebSocket = require('ws');
const DatabaseService = require('./src/database/DatabaseService');

// ==================== Configuration ====================
const config = {
    stations: [
        {
            name: "แพร่",
            uuid: "361c85bd-d02f-4408-b6a4-b6d17dad82a4",
            ip: "ws://10.8.1.5/ws",
            scene: "d0cf3a77-e9dd-4419-bec0-b54ecad3e541"
        },
        {
            name: "น่าน",
            uuid: "ce4767d5-1a3f-4645-a323-a310170d911e",
            ip: "ws://10.8.2.5/ws",
            scene: "d0cf3a77-e9dd-4419-bec0-b54ecad3e541"
        }
    ],
    monitoredObjects: [
        8684, 8685, 8686, 8687, 8688, 8689,  // Active Power 1-6
        18069, 18070,                         // MUX#1-2 Power Meter
        73909, 73910                          // MUX#3-4 Power Meter
    ],
    updateRate: 3000,        // 3 seconds
    connectionTimeout: 10000, // 10 seconds
    reconnectInterval: 5000,  // 5 seconds
    maxReconnectAttempts: 5,
    cycleDelay: 30000        // 30 seconds per station
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
    }

    // Connect to WebSocket
    async connect() {
        return new Promise((resolve, reject) => {
            console.log(`\n[${ this.config.name }] กำลังเชื่อมต่อ: ${this.config.ip}`);
            
            // เพิ่ม headers เหมือน browser
            const wsOptions = {
                headers: {
                    'Origin': null,
                    'User-Agent': 'Mozilla/5.0 (Linux; Android 8.0.0; SM-G955U Build/R16NW) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36',
                    'Accept-Language': 'en-US,en;q=0.9',
                    'Cache-Control': 'no-cache',
                    'Pragma': 'no-cache'
                },
                perMessageDeflate: false,
                handshakeTimeout: config.connectionTimeout
            };
            
            this.ws = new WebSocket(this.config.ip, wsOptions);
            
            const timeout = setTimeout(() => {
                reject(new Error('Connection timeout'));
            }, config.connectionTimeout);

            this.ws.on('open', () => {
                clearTimeout(timeout);
                console.log(`[${ this.config.name }] ✓ เชื่อมต่อสำเร็จ`);
                this.isConnected = true;
                this.reconnectAttempts = 0;
                resolve();
            });

            this.ws.on('error', (error) => {
                clearTimeout(timeout);
                console.error(`[${ this.config.name }] ✗ Error:`, error.message);
                reject(error);
            });

            this.ws.on('close', () => {
                console.log(`[${ this.config.name }] การเชื่อมต่อปิด`);
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
                reject(new Error('Message timeout'));
            }, 5000);

            const handler = (data) => {
                try {
                    const msg = JSON.parse(data);
                    if (validator(msg)) {
                        clearTimeout(timeout);
                        this.ws.removeListener('message', handler);
                        resolve(msg);
                    }
                } catch (error) {
                    // Continue listening
                }
            };

            this.ws.on('message', handler);
        });
    }

    // Initialize session
    async initializeSession() {
        try {
            console.log(`[${ this.config.name }] กำลังเริ่มต้น session...`);

            // Step 1: Restore Session
            const restoreData = {
                id: 0,
                method: "comet.restoreSession",
                params: [
                    {"$class": "com.wcs.comet.shared.CoreGTLoginContext"},
                    this.config.uuid,
                    {
                        "$className": "com.wcs.comet.shared.ClientInfo",
                        userLevel: -1,
                        ConnectionTimeStamp: 0,
                        DataTimeout: 0,
                        IpAddress: null,
                        Protocol: null,
                        ProtocolVersion: 0,
                        SID: -1,
                        USID: null,
                        UserAgent: "Node.js Comet Client",
                        UserAgentVersion: 2,
                        UserLevel: -1,
                        UserName: "NodeJS Monitor",
                        Admin: false,
                        Guest: false,
                        Logged: false
                    },
                    30, 30
                ]
            };

            await this.sendData(restoreData);
            const sessionResponse = await this.waitForMessage(msg => msg.id === 0 && msg.result?.USID);
            this.USID = sessionResponse.result.USID;
            console.log(`[${ this.config.name }] ✓ ได้รับ USID: ${this.USID.substring(0, 10)}...`);

            // Step 2: Subscribe Notification
            await this.sendData({
                id: 1,
                method: "comet.subscribeNotification",
                params: [this.USID, "ScriptEngine", {"displayName": "Admin"}]
            });
            await this.waitForMessage(msg => msg.id === 1 && msg.result === true);
            console.log(`[${ this.config.name }] ✓ Subscribe สำเร็จ`);

            // Step 3: Set Update Rate
            await this.sendData({
                id: 2,
                method: "ScriptEngine.setUpdateRate",
                params: [this.USID, config.updateRate]
            });
            await this.waitForMessage(msg => msg.id === 2 && msg.result === true);
            console.log(`[${ this.config.name }] ✓ ตั้งค่า Update Rate: ${config.updateRate}ms`);

            // Step 4-6: Load Scripts and Scene
            await this.sendData({id: 3, method: "ScriptEngine.loadScriptInfo", params: []});
            await this.waitForMessage(msg => msg.id === 3);

            await this.sendData({id: 4, method: "ScriptEngine.loadDashboards", params: []});
            await this.waitForMessage(msg => msg.id === 4);

            await this.sendData({id: 5, method: "ScriptEngine.loadScriptInfo", params: []});
            await this.waitForMessage(msg => msg.id === 5);

            await this.sendData({
                id: 6,
                method: "ScriptEngine.loadScene",
                params: [this.config.scene]
            });
            await this.waitForMessage(msg => msg.id === 6);
            console.log(`[${ this.config.name }] ✓ โหลด Scene สำเร็จ`);

            // Step 7: Register Active Objects
            await this.sendData({
                id: 7,
                method: "ScriptEngine.registerActiveObjects",
                params: [this.USID, [...config.monitoredObjects, -1]]
            });
            await this.waitForMessage(msg => msg.id === 7 && msg.result === true);
            console.log(`[${ this.config.name }] ✓ ลงทะเบียน Objects สำเร็จ (${config.monitoredObjects.length} items)`);

            // Initialize station in database
            await this.initializeStationInDatabase();

            // Start monitoring
            this.startMonitoring();

        } catch (error) {
            console.error(`[${ this.config.name }] ✗ เกิดข้อผิดพลาดในการเริ่มต้น:`, error.message);
            throw error;
        }
    }

    // Start real-time monitoring
    startMonitoring() {
        console.log(`[${ this.config.name }] 🔄 เริ่มการ Monitor แบบ Real-time\n`);
        
        this.ws.on('message', (data) => {
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

    // Initialize station in database
    async initializeStationInDatabase() {
        if (!this.databaseService) {
            return;
        }

        try {
            this.stationRecord = await this.databaseService.findOrCreateStation(this.config);
            console.log(`[${ this.config.name }] 💾 Database station initialized: ${this.stationRecord.id}`);
        } catch (error) {
            console.error(`[${ this.config.name }] ❌ Failed to initialize station in database:`, error.message);
        }
    }

    // Update data buffer
    updateData(syncData) {
        this.lastUpdate = new Date();
        let hasChanges = false;

        config.monitoredObjects.forEach(id => {
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
            if (this.lastDbSave && (now - this.lastDbSave) < this.dbSaveInterval) {
                return;
            }

            const readingData = {
                stationId: this.stationRecord.id,
                timestamp: this.lastUpdate,
                powerData: { ...this.dataBuffer }
            };

            // Validate data before saving
            const validation = this.databaseService.validatePowerData(this.dataBuffer);
            if (!validation.isValid) {
                console.error(`[${ this.config.name }] ❌ Invalid power data:`, validation.errors);
                return;
            }

            if (validation.warnings.length > 0) {
                console.warn(`[${ this.config.name }] ⚠️  Power data warnings:`, validation.warnings);
            }

            await this.databaseService.createPowerReading(readingData);
            this.lastDbSave = now;
            
            // Optional: Log successful saves less frequently to reduce noise
            if (Math.random() < 0.1) { // Log ~10% of saves
                console.log(`[${ this.config.name }] 💾 Data saved to database`);
            }

        } catch (error) {
            console.error(`[${ this.config.name }] ❌ Failed to save to database:`, error.message);
            
            // If it's a connection error, try to reinitialize the station
            if (error.message.includes('Connection') || error.message.includes('database')) {
                setTimeout(() => this.initializeStationInDatabase(), 5000);
            }
        }
    }

    // Display current data
    displayData() {
        const timestamp = this.lastUpdate.toLocaleTimeString('th-TH');
        console.log(`\n[${ this.config.name }] 📊 อัพเดทข้อมูล - ${timestamp}`);
        console.log('─'.repeat(60));
        
        const labels = {
            8684: "Active Power 1",
            8685: "Active Power 2",
            8686: "Active Power 3",
            8687: "Active Power 4",
            8688: "Active Power 5",
            8689: "Active Power 6",
            18069: "MUX#1 TV5 Power Meter",
            18070: "MUX#2 MCOT Power Meter",
            73909: "MUX#3 PRD Power Meter",
            73910: "MUX#4 TPBS Power Meter"
        };

        Object.entries(this.dataBuffer).forEach(([id, value]) => {
            const label = labels[id] || `ID ${id}`;
            const unit = parseInt(id) >= 18000 ? 'kWh' : 'W';
            const formattedValue = parseFloat(value).toLocaleString('th-TH', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
            });
            console.log(`  ${label.padEnd(30)} : ${formattedValue.padStart(15)} ${unit}`);
        });
        
        console.log('─'.repeat(60));
    }

    // Get current data snapshot
    getDataSnapshot() {
        return {
            station: this.config.name,
            timestamp: this.lastUpdate,
            data: { ...this.dataBuffer }
        };
    }

    // Handle reconnection
    handleReconnect() {
        if (this.reconnectAttempts < config.maxReconnectAttempts) {
            this.reconnectAttempts++;
            console.log(`[${ this.config.name }] 🔄 กำลังลองเชื่อมต่อใหม่... (ครั้งที่ ${this.reconnectAttempts})`);
            
            setTimeout(() => {
                this.connect()
                    .then(() => this.initializeSession())
                    .catch(error => {
                        console.error(`[${ this.config.name }] ✗ Reconnect failed:`, error.message);
                    });
            }, config.reconnectInterval);
        } else {
            console.error(`[${ this.config.name }] ✗ เกินจำนวนครั้งการลองเชื่อมต่อ`);
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
    }

    // Initialize all monitors
    async initialize() {
        console.log('🚀 เริ่มต้นระบบ Monitor\n');
        console.log(`📡 สถานีทั้งหมด: ${config.stations.length}`);
        console.log(`⏱️  อัตราการอัพเดท: ${config.updateRate}ms`);
        console.log(`🔄 รอบการเปลี่ยนสถานี: ${config.cycleDelay}ms`);

        // Initialize database service
        if (this.databaseEnabled) {
            try {
                console.log('💾 เริ่มต้นระบบฐานข้อมูล...');
                this.databaseService = new DatabaseService();
                await this.databaseService.connect();
                
                const dbInfo = await this.databaseService.getDatabaseInfo();
                console.log(`💾 ฐานข้อมูลพร้อมใช้งาน - สถานี: ${dbInfo.stationCount}, บันทึก: ${dbInfo.readingCount}`);
            } catch (error) {
                console.error('❌ ไม่สามารถเชื่อมต่อฐานข้อมูล:', error.message);
                console.log('⚠️  ระบบจะทำงานแบบ file logging เท่านั้น');
                this.databaseService = null;
            }
        }

        console.log(''); // Empty line for spacing

        // Create monitors with database service
        for (const stationConfig of config.stations) {
            const monitor = new StationMonitor(stationConfig, this.databaseService);
            this.monitors.push(monitor);
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
        console.log('🔄 เริ่มการ Monitor ทุกสถานีพร้อมกัน\n');

        const promises = this.monitors.map(async (monitor) => {
            try {
                await monitor.connect();
                await monitor.initializeSession();
            } catch (error) {
                console.error(`✗ ${monitor.config.name} ล้มเหลว:`, error.message);
            }
        });

        await Promise.allSettled(promises);
        
        console.log('\n✓ ทุกสถานีพร้อมทำงาน - กด Ctrl+C เพื่อหยุด\n');
    }

    // Get summary report
    getSummary() {
        console.log('\n📊 สรุปข้อมูลทั้งหมด');
        console.log('═'.repeat(80));
        
        this.allData.forEach(snapshot => {
            console.log(`\n🏢 ${snapshot.station} - ${snapshot.timestamp?.toLocaleString('th-TH')}`);
            console.log('─'.repeat(60));
            
            Object.entries(snapshot.data).forEach(([id, value]) => {
                console.log(`  ID ${id}: ${value}`);
            });
        });
    }

    // Sleep utility
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // Stop monitoring
    async stop() {
        this.isRunning = false;
        this.monitors.forEach(monitor => monitor.disconnect());
        
        // Disconnect from database
        if (this.databaseService) {
            await this.databaseService.disconnect();
        }
        
        console.log('\n⏹️  หยุดการ Monitor\n');
    }
}

// ==================== Main Execution ====================
async function main() {
    const controller = new MonitorController();
    await controller.initialize();

    // เลือกโหมดการทำงาน
    const mode = process.argv[2] || 'rotation';

    if (mode === 'rotation') {
        console.log('🔄 โหมด: Rotation (เปลี่ยนสถานีทีละตัว)\n');
        await controller.startRotation();
    } else if (mode === 'simultaneous') {
        console.log('🔄 โหมด: Simultaneous (Monitor ทุกสถานีพร้อมกัน)\n');
        await controller.startSimultaneous();
    }

    // Handle graceful shutdown
    process.on('SIGINT', async () => {
        console.log('\n\n🛑 รับสัญญาณหยุด...');
        await controller.stop();
        controller.getSummary();
        process.exit(0);
    });
}

// Run
main().catch(error => {
    console.error('❌ Fatal Error:', error);
    process.exit(1);
});