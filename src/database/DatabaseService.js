const { PrismaClient } = require("@prisma/client");

/**
 * DatabaseService - Handles all database operations for power monitoring system
 * Provides connection management, error handling, and data operations
 */
class DatabaseService {
  constructor() {
    this.prisma = null;
    this.isConnected = false;
    this.connectionRetries = 0;
    this.maxRetries = 3;
    this.retryDelay = 1000; // 1 second
  }

  /**
   * Connect to the database with retry logic
   * @returns {Promise<void>}
   */
  async connect() {
    if (this.isConnected) {
      return;
    }

    try {
      console.log("🔌 Connecting to database...");
      this.prisma = new PrismaClient({
        log: ["error", "warn"],
        errorFormat: "pretty",
      });

      // Test connection by performing a simple query
      await this.prisma.$connect();
      await this.healthCheck();

      this.isConnected = true;
      this.connectionRetries = 0;
      console.log("✅ Database connected successfully");
    } catch (error) {
      console.error("❌ Database connection failed:", error.message);
      await this.handleConnectionError(error);
    }
  }

  /**
   * Disconnect from the database
   * @returns {Promise<void>}
   */
  async disconnect() {
    if (this.prisma && this.isConnected) {
      try {
        await this.prisma.$disconnect();
        this.isConnected = false;
        console.log("🔌 Database disconnected");
      } catch (error) {
        console.error("❌ Error disconnecting from database:", error.message);
      }
    }
  }

  /**
   * Perform a health check on the database connection
   * @returns {Promise<boolean>}
   */
  async healthCheck() {
    try {
      if (!this.prisma) {
        throw new Error("Database client not initialized");
      }

      // Simple query to test connection
      await this.prisma.$queryRaw`SELECT 1`;
      return true;
    } catch (error) {
      console.error("❌ Database health check failed:", error.message);
      return false;
    }
  }

  /**
   * Handle connection errors with retry logic
   * @param {Error} error - The connection error
   * @returns {Promise<void>}
   */
  async handleConnectionError(error) {
    this.connectionRetries++;

    if (this.connectionRetries <= this.maxRetries) {
      console.log(
        `🔄 Retrying database connection... (${this.connectionRetries}/${this.maxRetries})`
      );

      // Wait before retrying with exponential backoff
      const delay = this.retryDelay * Math.pow(2, this.connectionRetries - 1);
      await this.sleep(delay);

      return this.connect();
    } else {
      console.error(
        "❌ Max connection retries exceeded. Database unavailable."
      );
      throw new Error(
        `Database connection failed after ${this.maxRetries} attempts: ${error.message}`
      );
    }
  }

  /**
   * Ensure database connection is active before operations
   * @returns {Promise<void>}
   */
  async ensureConnection() {
    if (!this.isConnected || !(await this.healthCheck())) {
      await this.connect();
    }
  }

  /**
   * Execute a database operation with error handling
   * @param {Function} operation - The database operation to execute
   * @param {string} operationName - Name of the operation for logging
   * @returns {Promise<any>}
   */
  async executeOperation(operation, operationName = "Database operation") {
    try {
      await this.ensureConnection();
      return await operation(this.prisma);
    } catch (error) {
      console.error(`❌ ${operationName} failed:`, error.message);

      // If it's a connection error, try to reconnect
      if (this.isConnectionError(error)) {
        this.isConnected = false;
        await this.connect();
        // Retry the operation once after reconnection
        return await operation(this.prisma);
      }

      throw error;
    }
  }

  /**
   * Check if an error is a connection-related error
   * @param {Error} error - The error to check
   * @returns {boolean}
   */
  isConnectionError(error) {
    const connectionErrorMessages = [
      "Connection lost",
      "Connection terminated",
      "Connection refused",
      "Unable to open the database file",
      "database is locked",
    ];

    return connectionErrorMessages.some((msg) =>
      error.message.toLowerCase().includes(msg.toLowerCase())
    );
  }

  /**
   * Get database statistics and information
   * @returns {Promise<Object>}
   */
  async getDatabaseInfo() {
    return this.executeOperation(async (prisma) => {
      const [stationCount, readingCount] = await Promise.all([
        prisma.station.count(),
        prisma.powerReading.count(),
      ]);

      return {
        isConnected: this.isConnected,
        stationCount,
        readingCount,
        connectionRetries: this.connectionRetries,
      };
    }, "Get database info");
  }

  /**
   * Utility method for sleeping/delays
   * @param {number} ms - Milliseconds to sleep
   * @returns {Promise<void>}
   */
  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Get the Prisma client instance (for advanced operations)
   * @returns {PrismaClient|null}
   */
  getClient() {
    return this.prisma;
  }

  // ==================== Station Management Operations ====================

  /**
   * Create a new station
   * @param {Object} stationData - Station data
   * @param {string} stationData.name - Station name

   * @param {string} stationData.ipAddress - Station IP address
   * @param {string} stationData.scene - Station scene ID
   * @returns {Promise<Object>} Created station
   */
  async createStation(stationData) {
    return this.executeOperation(async (prisma) => {
      const { name, ipAddress, scene } = stationData; // Removed uuid

      // Validate required fields (name and ipAddress are always required)
      if (!name || !ipAddress) {
        throw new Error("Missing required station fields: name, ipAddress");
      }

      const station = await prisma.station.create({
        data: {
          name: name.trim(),
          ipAddress: ipAddress.trim(),
          scene: scene ? scene.trim() : null,
        },
      });

      console.log(`✅ Station created: ${station.name} (${station.id})`);
      return station;
    }, "Create station");
  }

  /**
   * Get station by ID
   * @param {string} stationId - Station ID
   * @returns {Promise<Object|null>} Station or null if not found
   */
  async getStationById(stationId) {
    return this.executeOperation(async (prisma) => {
      return await prisma.station.findUnique({
        where: { id: stationId },
        include: {
          _count: {
            select: { powerReadings: true },
          },
        },
      });
    }, "Get station by ID");
  }

  /**
   * Get station by name
   * @param {string} stationName - Station name
   * @returns {Promise<Object|null>} Station or null if not found
   */
  async getStationByName(stationName) {
    return this.executeOperation(async (prisma) => {
      return await prisma.station.findUnique({
        where: { name: stationName ? stationName.trim() : "" },
        include: {
          _count: {
            select: { powerReadings: true },
          },
        },
      });
    }, "Get station by name");
  }



  /**
   * Get all stations
   * @returns {Promise<Array>} Array of stations
   */
  async getAllStations() {
    return this.executeOperation(async (prisma) => {
      return await prisma.station.findMany({
        include: {
          _count: {
            select: { powerReadings: true },
          },
        },
        orderBy: { name: "asc" },
      });
    }, "Get all stations");
  }

  /**
   * Update station information
   * @param {string} stationId - Station ID
   * @param {Object} updateData - Data to update
   * @returns {Promise<Object>} Updated station
   */
  async updateStation(stationId, updateData) {
    return this.executeOperation(async (prisma) => {
      // Remove undefined values and trim strings
      const cleanData = {};
      Object.entries(updateData).forEach(([key, value]) => {
        if (value !== undefined) {
          cleanData[key] = typeof value === "string" ? value.trim() : value;
        }
      });

      const station = await prisma.station.update({
        where: { id: stationId },
        data: cleanData,
      });

      console.log(`✅ Station updated: ${station.name} (${station.id})`);
      return station;
    }, "Update station");
  }

  /**
   * Delete a station (only if no power readings exist)
   * @param {string} stationId - Station ID
   * @returns {Promise<Object>} Deleted station
   */
  async deleteStation(stationId) {
    return this.executeOperation(async (prisma) => {
      // Check if station has power readings
      const readingCount = await prisma.powerReading.count({
        where: { stationId },
      });

      if (readingCount > 0) {
        throw new Error(
          `Cannot delete station: ${readingCount} power readings exist. Delete readings first.`
        );
      }

      const station = await prisma.station.delete({
        where: { id: stationId },
      });

      console.log(`✅ Station deleted: ${station.name} (${station.id})`);
      return station;
    }, "Delete station");
  }

  /**
   * Find or create station by name and configuration
   * @param {Object} stationConfig - Station configuration from monitor
   * @returns {Promise<Object>} Station (existing or newly created)
   */
  async findOrCreateStation(stationConfig) {
    return this.executeOperation(async (prisma) => {
      const { name, ip, scene } = stationConfig; // Removed uuid from destructuring

      // Try to find existing station by name first
      let station = await prisma.station.findUnique({
        where: { name: name ? name.trim() : "" },
      });

      if (station) {
        // Update station if configuration has changed (no longer checking UUID)
        const needsUpdate =
          station.ipAddress !== (ip ? ip.trim() : null) ||
          station.scene !== (scene ? scene.trim() : null);

        if (needsUpdate) {
          station = await prisma.station.update({
            where: { id: station.id },
            data: {
              ipAddress: ip ? ip.trim() : null,
              scene: scene ? scene.trim() : null,
            },
          });
          console.log(`✅ Station configuration updated: ${station.name}`);
        }
      } else {
        // Create new station (no UUID)
        station = await prisma.station.create({
          data: {
            name: name ? name.trim() : null,
            ipAddress: ip ? ip.trim() : null,
            scene: scene ? scene.trim() : null,
          },
        });
        console.log(`✅ New station created: ${station.name} (${station.id})`);
      }

      return station;
    }, "Find or create station");
  }

  // ==================== Monitored Objects Operations ====================

  /**
   * Get monitored objects for a station
   * @param {string} stationId - Station ID
   * @returns {Promise<Object>} Object mapping objectType to objectId
   */
  async getStationMonitoredObjects(stationId) {
    return this.executeOperation(async (prisma) => {
      const monitoredObjects = await prisma.stationMonitoredObject.findMany({
        where: { stationId },
        orderBy: { objectType: 'asc' }
      });

      // Convert to object mapping for easy lookup
      const objectMap = {};
      const objectIds = [];

      monitoredObjects.forEach(obj => {
        objectMap[obj.objectType] = obj.objectId;
        objectIds.push(obj.objectId);
      });

      return {
        objectMap,
        objectIds,
        count: monitoredObjects.length
      };
    }, "Get station monitored objects");
  }

  /**
   * Get monitored objects by station name
   * @param {string} stationName - Station name
   * @returns {Promise<Object>} Object mapping objectType to objectId
   */
  async getMonitoredObjectsByStationName(stationName) {
    return this.executeOperation(async (prisma) => {
      const station = await prisma.station.findUnique({
        where: { name: stationName },
        include: {
          monitoredObjects: true
        }
      });

      if (!station) {
        throw new Error(`Station not found: ${stationName}`);
      }

      const objectMap = {};
      const objectIds = [];

      station.monitoredObjects.forEach(obj => {
        objectMap[obj.objectType] = obj.objectId;
        objectIds.push(obj.objectId);
      });

      return {
        objectMap,
        objectIds,
        count: station.monitoredObjects.length,
        stationId: station.id
      };
    }, "Get monitored objects by station name");
  }

  /**
   * Update monitored objects for a station
   * @param {string} stationId - Station ID
   * @param {Object} objectMap - Object mapping objectType to objectId
   * @returns {Promise<number>} Number of objects updated
   */
  async updateStationMonitoredObjects(stationId, objectMap) {
    return this.executeOperation(async (prisma) => {
      // Delete existing objects
      await prisma.stationMonitoredObject.deleteMany({
        where: { stationId }
      });

      // Create new objects
      const objectsToCreate = Object.entries(objectMap)
        .filter(([type, id]) => id !== null && id !== undefined)
        .map(([objectType, objectId]) => ({
          stationId,
          objectType,
          objectId: parseInt(objectId)
        }));

      if (objectsToCreate.length > 0) {
        await prisma.stationMonitoredObject.createMany({
          data: objectsToCreate
        });
      }

      console.log(`✅ Updated ${objectsToCreate.length} monitored objects for station ${stationId}`);
      return objectsToCreate.length;
    }, "Update station monitored objects");
  }

  // ==================== Power Reading Data Operations ====================

  /**
   * Create a single power reading
   * @param {Object} readingData - Power reading data
   * @param {string} readingData.stationId - Station ID
   * @param {Date} readingData.timestamp - Reading timestamp
   * @param {Object} readingData.powerData - Power readings object
   * @returns {Promise<Object>} Created power reading
   */
  async createPowerReading(readingData) {
    return this.executeOperation(async (prisma) => {
      const { stationId, timestamp, powerData } = readingData;

      // Validate required fields
      if (!stationId || !timestamp) {
        throw new Error("Missing required fields: stationId, timestamp");
      }

      // Validate timestamp
      const readingTimestamp = new Date(timestamp);
      if (isNaN(readingTimestamp.getTime())) {
        throw new Error("Invalid timestamp provided");
      }

      // Transform power data to database format
      const dbData = this.transformPowerData(powerData);

      const powerReading = await prisma.powerReading.create({
        data: {
          stationId,
          timestamp: readingTimestamp,
          ...dbData,
        },
        include: {
          station: {
            select: { name: true },
          },
        },
      });

      return powerReading;
    }, "Create power reading");
  }

  /**
   * Create multiple power readings in batch
   * @param {Array} readingsData - Array of power reading data
   * @returns {Promise<number>} Number of created readings
   */
  async createBatchPowerReadings(readingsData) {
    return this.executeOperation(async (prisma) => {
      if (!Array.isArray(readingsData) || readingsData.length === 0) {
        return 0;
      }

      // Transform all readings to database format
      const dbReadings = readingsData.map((reading) => {
        const { stationId, timestamp, powerData } = reading;

        // Validate required fields
        if (!stationId || !timestamp) {
          throw new Error(
            "Missing required fields in batch data: stationId, timestamp"
          );
        }

        const readingTimestamp = new Date(timestamp);
        if (isNaN(readingTimestamp.getTime())) {
          throw new Error("Invalid timestamp in batch data");
        }

        return {
          stationId,
          timestamp: readingTimestamp,
          ...this.transformPowerData(powerData),
        };
      });

      // Use transaction for batch insert
      const result = await prisma.powerReading.createMany({
        data: dbReadings,
        skipDuplicates: true, // Skip if duplicate timestamp+station exists
      });

      console.log(`✅ Batch created ${result.count} power readings`);
      return result.count;
    }, "Create batch power readings");
  }

  /**
   * Transform power data from monitor format to database format
   * @param {Object} powerData - Power data from monitor
   * @returns {Object} Transformed data for database
   */
  transformPowerData(powerData) {
    if (!powerData || typeof powerData !== "object") {
      return {};
    }

    const dbData = {};

    // Map Active Power readings (IDs 8684-8689)
    const activePowerMap = {
      8684: "activePower1",
      8685: "activePower2",
      8686: "activePower3",
      8687: "activePower4",
      8688: "activePower5",
      8689: "activePower6",
    };

    // Map MUX Power Meter readings (IDs 18069, 18070, 73909, 73910, 75428, 75429, 224272, 18053, etc.)
    const muxPowerMap = {
      18069: "muxPower1", // TV5
      18070: "muxPower2", // MCOT
      73909: "muxPower3", // PRD
      73910: "muxPower4", // TPBS
      75428: "muxPower5", // MUX#5
      75429: "muxPower6", // MUX#6
      224272: "muxPower5", // ระนอง MUX#5 (alternative ID)
      18053: "muxPower6", // สกลนคร MUX#6 (alternative ID)
      75432: "muxPower5", // ร้อยเอ็ด MUX#5 (alternative ID)
      75441: "muxPower5", // สุโขทัย MUX#5 (alternative ID)
      75483: "muxPower5", // ภูเก็ต MUX#5 (alternative ID)
      75484: "muxPower6", // ภูเก็ต MUX#6 (alternative ID)
      75519: "muxPower6", // สิงห์บุรี MUX#6 (alternative ID)
    };

    // Transform Active Power readings
    Object.entries(activePowerMap).forEach(([id, field]) => {
      if (powerData.hasOwnProperty(id)) {
        const value = parseFloat(powerData[id]);
        dbData[field] = isNaN(value) ? null : value;
      }
    });

    // Transform MUX Power readings
    Object.entries(muxPowerMap).forEach(([id, field]) => {
      if (powerData.hasOwnProperty(id)) {
        const value = parseFloat(powerData[id]);
        dbData[field] = isNaN(value) ? null : value;
      }
    });

    // Handle direct API format (muxPower1, activePower1, etc.)
    const directFields = [
      "activePower1",
      "activePower2",
      "activePower3",
      "activePower4",
      "activePower5",
      "activePower6",
      "muxPower1",
      "muxPower2",
      "muxPower3",
      "muxPower4",
      "muxPower5",
      "muxPower6",
    ];

    directFields.forEach((field) => {
      if (powerData.hasOwnProperty(field)) {
        const value = parseFloat(powerData[field]);
        dbData[field] = isNaN(value) ? null : value;
      }
    });

    return dbData;
  }

  /**
   * Validate power reading data
   * @param {Object} powerData - Power data to validate
   * @returns {Object} Validation result
   */
  validatePowerData(powerData) {
    const result = {
      isValid: true,
      errors: [],
      warnings: [],
    };

    if (!powerData || typeof powerData !== "object") {
      result.isValid = false;
      result.errors.push("Power data must be an object");
      return result;
    }

    // Check for valid numeric values
    Object.entries(powerData).forEach(([id, value]) => {
      // Skip validation for object values (they might be complex data structures)
      if (typeof value === "object") {
        return;
      }

      const numValue = parseFloat(value);

      if (isNaN(numValue)) {
        // Only warn occasionally to reduce log noise
        if (Math.random() < 0.1) {
          result.warnings.push(`Invalid numeric value for ID ${id}: ${value}`);
        }
      } else {
        // Check for reasonable ranges
        const idNum = parseInt(id);

        if (idNum >= 8684 && idNum <= 8689) {
          // Active Power should be positive and reasonable (0-100000 W)
          if (numValue < 0 || numValue > 100000) {
            result.warnings.push(
              `Active Power ID ${id} value seems out of range: ${numValue}W`
            );
          }
        } else if ([18069, 18070, 73909, 73910, 75428, 75429].includes(idNum)) {
          // MUX Power should be positive and reasonable (0-1000000000 kWh)
          if (numValue < 0 || numValue > 1000000000) {
            result.warnings.push(
              `MUX Power ID ${id} value seems out of range: ${numValue}kWh`
            );
          }
        }
      }
    });

    return result;
  }

  /**
   * Get latest power reading for a station
   * @param {string} stationId - Station ID
   * @returns {Promise<Object|null>} Latest power reading or null
   */
  async getLatestPowerReading(stationId) {
    return this.executeOperation(async (prisma) => {
      return await prisma.powerReading.findFirst({
        where: { stationId },
        orderBy: { timestamp: "desc" },
        include: {
          station: {
            select: { name: true },
          },
        },
      });
    }, "Get latest power reading");
  }

  /**
   * Get power readings by time range
   * @param {string} stationId - Station ID
   * @param {Date} startDate - Start date
   * @param {Date} endDate - End date
   * @param {Object} options - Query options (limit, offset, orderBy)
   * @returns {Promise<Array>} Array of power readings
   */
  async getPowerReadingsByTimeRange(
    stationId,
    startDate,
    endDate,
    options = {}
  ) {
    return this.executeOperation(async (prisma) => {
      const {
        limit = 1000,
        offset = 0,
        orderBy = "timestamp",
        orderDirection = "desc",
      } = options;

      return await prisma.powerReading.findMany({
        where: {
          stationId,
          timestamp: {
            gte: new Date(startDate),
            lte: new Date(endDate),
          },
        },
        orderBy: { [orderBy]: orderDirection },
        take: limit,
        skip: offset,
        include: {
          station: {
            select: { name: true },
          },
        },
      });
    }, "Get power readings by time range");
  }

  /**
   * Get power reading statistics for a station
   * @param {string} stationId - Station ID
   * @param {Date} startDate - Start date (optional)
   * @param {Date} endDate - End date (optional)
   * @returns {Promise<Object>} Statistics object
   */
  async getPowerReadingStats(stationId, startDate = null, endDate = null) {
    return this.executeOperation(async (prisma) => {
      const whereClause = { stationId };

      if (startDate && endDate) {
        whereClause.timestamp = {
          gte: new Date(startDate),
          lte: new Date(endDate),
        };
      }

      const [count, firstReading, lastReading] = await Promise.all([
        prisma.powerReading.count({ where: whereClause }),
        prisma.powerReading.findFirst({
          where: whereClause,
          orderBy: { timestamp: "asc" },
        }),
        prisma.powerReading.findFirst({
          where: whereClause,
          orderBy: { timestamp: "desc" },
        }),
      ]);

      return {
        totalReadings: count,
        firstReading: firstReading?.timestamp || null,
        lastReading: lastReading?.timestamp || null,
        timeSpan:
          firstReading && lastReading
            ? lastReading.timestamp.getTime() - firstReading.timestamp.getTime()
            : 0,
      };
    }, "Get power reading statistics");
  }
}

module.exports = DatabaseService;
