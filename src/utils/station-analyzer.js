const DatabaseService = require("../database/DatabaseService");
const ApiDataFetcher = require("../api/ApiDataFetcher");

/**
 * Station Analyzer - Analyzes stations to determine their type and configuration
 */
class StationAnalyzer {
  constructor() {
    this.db = new DatabaseService();
  }

  async connect() {
    await this.db.connect();
  }

  async disconnect() {
    await this.db.disconnect();
  }

  /**
   * Analyze all stations and categorize them
   */
  async analyzeStations() {
    try {
      const stations = await this.db.getAllStations();

      if (stations.length === 0) {
        console.log("📡 No stations found in database");
        return;
      }

      const apiStations = [];
      const webSocketStations = [];
      const incompleteStations = [];

      stations.forEach((station) => {
        const stationConfig = {
          name: station.name,
          ipAddress: station.ipAddress,
          scene: station.scene,
        };

        // Check if station is API station first
        if (ApiDataFetcher.isApiStation(stationConfig)) {
          // API stations only need name and ipAddress
          if (station.name && station.ipAddress) {
            apiStations.push(station);
          } else {
            incompleteStations.push({
              ...station,
              missingFields: [
                !station.name ? "name" : null,
                !station.ipAddress ? "ipAddress" : null,
              ].filter(Boolean),
            });
          }
        } else {
          // WebSocket stations need name, ipAddress, and scene (no UUID required)
          if (
            station.name &&
            station.ipAddress &&
            station.scene
          ) {
            webSocketStations.push(station);
          } else {
            incompleteStations.push({
              ...station,
              missingFields: [
                !station.name ? "name" : null,
                !station.scene ? "scene" : null,
                !station.ipAddress ? "ipAddress" : null,
              ].filter(Boolean),
            });
          }
        }
      });

      console.log(`📡 Station Analysis Results (Total: ${stations.length})\n`);

      // Display API Stations
      if (apiStations.length > 0) {
        console.log(`🌐 API Stations (${apiStations.length}):`);
        console.log("─".repeat(80));
        apiStations.forEach((station) => {
          console.log(`   ${station.name}`);
          console.log(`   └─ URL: ${station.ipAddress}`);
          console.log(`   └─ Readings: ${station._count.powerReadings}`);
          console.log("");
        });
      }

      // Display WebSocket Stations
      if (webSocketStations.length > 0) {
        console.log(`📡 WebSocket Stations (${webSocketStations.length}):`);
        console.log("─".repeat(80));
        webSocketStations.forEach((station) => {
          console.log(`   ${station.name}`);
          console.log(`   └─ WebSocket: ${station.ipAddress}`);
          console.log(`   └─ Scene: ${station.scene}`);
          console.log(`   └─ Readings: ${station._count.powerReadings}`);
          console.log("");
        });
      }

      // Display Incomplete Stations
      if (incompleteStations.length > 0) {
        console.log(`⚠️  Incomplete Stations (${incompleteStations.length}):`);
        console.log("─".repeat(80));
        incompleteStations.forEach((station) => {
          console.log(`   ${station.name || "Unnamed Station"}`);
          console.log(`   └─ ID: ${station.id}`);
          console.log(`   └─ Missing: ${station.missingFields.join(", ")}`);
          console.log(`   └─ IP: ${station.ipAddress || "Not set"}`);
          console.log(`   └─ Scene: ${station.scene || "Not set"}`);
          console.log("");
        });
      }

      // Summary
      console.log("📊 Summary:");
      console.log(`   API Stations: ${apiStations.length}`);
      console.log(`   WebSocket Stations: ${webSocketStations.length}`);
      console.log(`   Incomplete Stations: ${incompleteStations.length}`);
      console.log(`   Total: ${stations.length}`);

      return {
        apiStations,
        webSocketStations,
        incompleteStations,
        total: stations.length,
      };
    } catch (error) {
      console.error("❌ Failed to analyze stations:", error.message);
    }
  }

  /**
   * Check specific station configuration
   */
  async checkStation(stationName) {
    try {
      const station = await this.db.getStationByName(stationName);

      if (!station) {
        console.log(`📡 Station "${stationName}" not found`);
        return;
      }

      console.log(`📡 Station Analysis: ${station.name}\n`);

      const stationConfig = {
        name: station.name,
        ipAddress: station.ipAddress,
        scene: station.scene,
      };

      // Check completeness
      const missingFields = [
        !station.uuid ? "uuid" : null,
        !station.scene ? "scene" : null,
        !station.ipAddress ? "ipAddress" : null,
      ].filter(Boolean);

      if (missingFields.length > 0) {
        console.log("⚠️  Status: Incomplete Configuration");
        console.log(`   Missing Fields: ${missingFields.join(", ")}`);
      } else {
        const isApiStation = ApiDataFetcher.isApiStation(stationConfig);
        console.log(`✅ Status: Complete Configuration`);
        console.log(
          `   Type: ${isApiStation ? "API Station" : "WebSocket Station"}`
        );

        if (isApiStation) {
          console.log(`   API Endpoint: ${station.ipAddress}`);
          console.log("   Data Format: HTTP JSON API");
          console.log("   Expected Fields: mux1-mux5, power1-power5");
        } else {
          console.log(`   WebSocket URL: ${station.ipAddress}`);
          console.log(`   Scene ID: ${station.scene}`);
          console.log("   Protocol: Comet WebSocket");
        }
      }

      console.log(`\n📊 Database Info:`);
      console.log(`   ID: ${station.id}`);
      console.log(`   Power Readings: ${station._count.powerReadings}`);
      console.log(`   Created: ${station.createdAt.toLocaleString("th-TH")}`);
      console.log(`   Updated: ${station.updatedAt.toLocaleString("th-TH")}`);
    } catch (error) {
      console.error("❌ Failed to check station:", error.message);
    }
  }

  /**
   * Show help
   */
  showHelp() {
    console.log("📡 Station Analyzer - Configuration Analysis Tool\n");
    console.log(
      "Usage: node src/utils/station-analyzer.js <command> [arguments]\n"
    );
    console.log("Commands:");
    console.log("  analyze                     - Analyze all stations");
    console.log("  check <station-name>        - Check specific station");
    console.log("  help                        - Show this help\n");
    console.log("Examples:");
    console.log("  node src/utils/station-analyzer.js analyze");
    console.log('  node src/utils/station-analyzer.js check "แพร่"');
  }
}

// Command line interface
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command === "help") {
    const analyzer = new StationAnalyzer();
    analyzer.showHelp();
    return;
  }

  const analyzer = new StationAnalyzer();

  try {
    await analyzer.connect();

    switch (command) {
      case "analyze":
        await analyzer.analyzeStations();
        break;

      case "check":
        if (args.length < 2) {
          console.error("❌ Usage: check <station-name>");
          break;
        }
        await analyzer.checkStation(args[1]);
        break;

      default:
        console.error(`❌ Unknown command: ${command}`);
        analyzer.showHelp();
    }
  } catch (error) {
    console.error("❌ Error:", error.message);
  } finally {
    await analyzer.disconnect();
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = StationAnalyzer;