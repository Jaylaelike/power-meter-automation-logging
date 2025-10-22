const http = require('http');
const https = require('https');
const { URL } = require('url');

/**
 * ApiDataFetcher - Handles HTTP API data fetching for stations
 * Supports stations with HTTP endpoints instead of WebSocket connections
 */
class ApiDataFetcher {
    constructor(stationConfig, databaseService = null) {
        // Normalize the config to use ipAddress consistently
        this.config = {
            ...stationConfig,
            ipAddress: stationConfig.ipAddress || stationConfig.ip
        };
        this.databaseService = databaseService;
        this.stationRecord = null;
        this.isRunning = false;
        this.fetchInterval = null;
        this.fetchIntervalMs = 10000; // 10 seconds default
        this.lastFetch = null;
        this.lastData = null;
        this.errorCount = 0;
        this.maxErrors = 5;
    }

    /**
     * Check if a station uses HTTP API pattern
     * @param {Object} stationConfig - Station configuration
     * @returns {boolean} True if station uses HTTP API
     */
    static isApiStation(stationConfig) {
        const ipAddress = stationConfig.ipAddress || stationConfig.ip;
        return ipAddress && 
               ipAddress.startsWith('http://') &&
               ipAddress.includes('/data');
    }

    /**
     * Initialize station in database
     */
    async initializeStationInDatabase() {
        if (!this.databaseService) {
            return;
        }

        try {
            this.stationRecord = await this.databaseService.findOrCreateStation(this.config);
            console.log(`[${this.config.name}] 🌐 API station initialized: ${this.stationRecord.id}`);
        } catch (error) {
            console.error(`[${this.config.name}] ❌ Failed to initialize API station in database:`, error.message);
        }
    }

    /**
     * Fetch data from HTTP API
     * @returns {Promise<Object>} API response data
     */
    async fetchApiData() {
        return new Promise((resolve, reject) => {
            try {
                const url = new URL(this.config.ipAddress);
                const client = url.protocol === 'https:' ? https : http;
                
                const options = {
                    hostname: url.hostname,
                    port: url.port || (url.protocol === 'https:' ? 443 : 80),
                    path: url.pathname + url.search,
                    method: 'GET',
                    timeout: 10000, // 10 second timeout
                    headers: {
                        'User-Agent': 'PowerMonitor/1.0',
                        'Accept': 'application/json',
                        'Connection': 'close'
                    }
                };

                const req = client.request(options, (res) => {
                    let data = '';
                    
                    res.on('data', (chunk) => {
                        data += chunk;
                    });
                    
                    res.on('end', () => {
                        try {
                            if (res.statusCode !== 200) {
                                reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`));
                                return;
                            }

                            const jsonData = JSON.parse(data);
                            resolve(jsonData);
                        } catch (parseError) {
                            reject(new Error(`JSON parse error: ${parseError.message}`));
                        }
                    });
                });

                req.on('error', (error) => {
                    if (error.code === 'ECONNREFUSED') {
                        reject(new Error(`Connection refused - API server not available at ${this.config.ipAddress}`));
                    } else if (error.code === 'ENOTFOUND') {
                        reject(new Error(`Host not found - ${url.hostname} is not reachable`));
                    } else if (error.code === 'ETIMEDOUT') {
                        reject(new Error(`Connection timeout - API server not responding`));
                    } else {
                        reject(new Error(`Request error: ${error.message}`));
                    }
                });

                req.on('timeout', () => {
                    req.destroy();
                    reject(new Error('Request timeout'));
                });

                req.end();

            } catch (error) {
                reject(new Error(`URL error: ${error.message}`));
            }
        });
    }

    /**
     * Transform API data to database format
     * @param {Object} apiData - Raw API data
     * @returns {Object} Transformed data for database
     */
    transformApiData(apiData) {
        const dbData = {};

        // Map MUX Power readings (mux1-mux6 to muxPower1-muxPower6)
        for (let i = 1; i <= 6; i++) {
            const muxKey = `mux${i}`;
            const dbKey = `muxPower${i}`;
            
            if (apiData.hasOwnProperty(muxKey)) {
                const value = parseFloat(apiData[muxKey]);
                dbData[dbKey] = isNaN(value) ? null : value;
            }
        }

        // Map Active Power readings (power1-power6 to activePower1-activePower6)
        for (let i = 1; i <= 6; i++) {
            const powerKey = `power${i}`;
            const dbKey = `activePower${i}`;
            
            if (apiData.hasOwnProperty(powerKey)) {
                const value = parseFloat(apiData[powerKey]);
                dbData[dbKey] = isNaN(value) ? null : value;
            }
        }

        return dbData;
    }

    /**
     * Validate API data
     * @param {Object} apiData - API data to validate
     * @returns {Object} Validation result
     */
    validateApiData(apiData) {
        const result = {
            isValid: true,
            errors: [],
            warnings: []
        };

        if (!apiData || typeof apiData !== 'object') {
            result.isValid = false;
            result.errors.push('API data must be an object');
            return result;
        }

        // Check for expected fields (but don't warn about missing optional fields)
        const requiredFields = ['mux1', 'mux2', 'power1', 'power2']; // Only require basic fields
        const missingRequiredFields = requiredFields.filter(field => !apiData.hasOwnProperty(field));
        
        if (missingRequiredFields.length > 0) {
            result.warnings.push(`Missing required fields: ${missingRequiredFields.join(', ')}`);
        }

        // Validate numeric values (only for fields that exist)
        Object.entries(apiData).forEach(([field, value]) => {
            // Only validate known power/mux fields
            if (field.startsWith('mux') || field.startsWith('power')) {
                const numValue = parseFloat(value);
                
                if (isNaN(numValue)) {
                    result.warnings.push(`Invalid numeric value for ${field}: ${value}`);
                } else {
                    // More lenient range validation
                    if (field.startsWith('mux') && (numValue < 0 || numValue > 1000000000)) {
                        result.warnings.push(`MUX power ${field} value seems out of range: ${numValue}`);
                    } else if (field.startsWith('power') && (numValue < 0 || numValue > 100000)) {
                        result.warnings.push(`Active power ${field} value seems out of range: ${numValue}W`);
                    }
                }
            }
        });

        return result;
    }

    /**
     * Process and save API data
     * @param {Object} apiData - Raw API data
     */
    async processApiData(apiData) {
        try {
            // Validate data
            const validation = this.validateApiData(apiData);
            if (!validation.isValid) {
                console.error(`[${this.config.name}] ❌ Invalid API data:`, validation.errors);
                return;
            }

            if (validation.warnings.length > 0) {
                // Only log warnings occasionally to reduce noise (5% of the time)
                if (Math.random() < 0.05) {
                    console.warn(`[${this.config.name}] ⚠️  API data warnings:`, validation.warnings);
                }
            }

            // Transform data
            const transformedData = this.transformApiData(apiData);
            this.lastData = transformedData;

            // Display data
            this.displayData(apiData, transformedData);

            // Save to database if enabled
            if (this.databaseService && this.stationRecord) {
                await this.saveToDatabase(transformedData);
            }

            // Reset error count on successful processing
            this.errorCount = 0;

        } catch (error) {
            console.error(`[${this.config.name}] ❌ Failed to process API data:`, error.message);
            this.errorCount++;
        }
    }

    /**
     * Save data to database
     * @param {Object} transformedData - Transformed data for database
     */
    async saveToDatabase(transformedData) {
        try {
            const readingData = {
                stationId: this.stationRecord.id,
                timestamp: new Date(),
                powerData: transformedData
            };

            await this.databaseService.createPowerReading(readingData);
            
            // Log successful saves occasionally
            if (Math.random() < 0.2) { // Log ~20% of saves
                console.log(`[${this.config.name}] 💾 API data saved to database`);
            }

        } catch (error) {
            console.error(`[${this.config.name}] ❌ Failed to save API data to database:`, error.message);
        }
    }

    /**
     * Display current data
     * @param {Object} apiData - Raw API data
     * @param {Object} transformedData - Transformed data
     */
    displayData(apiData, transformedData) {
        const timestamp = new Date().toLocaleTimeString('th-TH');
        console.log(`\n[${this.config.name}] 🌐 API Data Update - ${timestamp}`);
        console.log('─'.repeat(60));
        
        // Display MUX Power readings
        for (let i = 1; i <= 6; i++) {
            const muxKey = `mux${i}`;
            if (apiData.hasOwnProperty(muxKey)) {
                const value = parseFloat(apiData[muxKey]).toLocaleString('th-TH', {
                    minimumFractionDigits: 0,
                    maximumFractionDigits: 0
                });
                console.log(`  MUX Power ${i}                    : ${value.padStart(15)} kWh`);
            }
        }
        
        // Display Active Power readings
        for (let i = 1; i <= 6; i++) {
            const powerKey = `power${i}`;
            if (apiData.hasOwnProperty(powerKey)) {
                const value = parseFloat(apiData[powerKey]).toLocaleString('th-TH', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2
                });
                console.log(`  Active Power ${i}                 : ${value.padStart(15)} W`);
            }
        }
        
        console.log('─'.repeat(60));
    }

    /**
     * Start periodic data fetching
     */
    async start() {
        if (this.isRunning) {
            return;
        }

        console.log(`[${this.config.name}] 🌐 Starting API data fetching from: ${this.config.ipAddress}`);
        
        // Initialize station in database
        await this.initializeStationInDatabase();
        
        this.isRunning = true;
        this.errorCount = 0;

        // Initial fetch
        await this.fetchAndProcess();

        // Set up periodic fetching
        this.fetchInterval = setInterval(async () => {
            if (this.isRunning) {
                await this.fetchAndProcess();
            }
        }, this.fetchIntervalMs);

        console.log(`[${this.config.name}] ✅ API fetching started (interval: ${this.fetchIntervalMs}ms)`);
    }

    /**
     * Fetch and process data
     */
    async fetchAndProcess() {
        try {
            if (this.errorCount >= this.maxErrors) {
                console.error(`[${this.config.name}] ❌ Too many errors (${this.errorCount}), stopping API fetching`);
                this.stop();
                return;
            }

            const apiData = await this.fetchApiData();
            this.lastFetch = new Date();
            await this.processApiData(apiData);

        } catch (error) {
            this.errorCount++;
            console.error(`[${this.config.name}] ❌ API fetch failed (${this.errorCount}/${this.maxErrors}):`, error.message);
            
            if (this.errorCount >= this.maxErrors) {
                console.error(`[${this.config.name}] ❌ Max errors reached, stopping API fetching`);
                this.stop();
            }
        }
    }

    /**
     * Stop data fetching
     */
    stop() {
        if (!this.isRunning) {
            return;
        }

        this.isRunning = false;
        
        if (this.fetchInterval) {
            clearInterval(this.fetchInterval);
            this.fetchInterval = null;
        }

        console.log(`[${this.config.name}] ⏹️  API data fetching stopped`);
    }

    /**
     * Get current data snapshot
     */
    getDataSnapshot() {
        return {
            station: this.config.name,
            timestamp: this.lastFetch,
            data: { ...this.lastData },
            type: 'api'
        };
    }
}

module.exports = ApiDataFetcher;