# Dynamic Monitored Objects System

This document explains the new dynamic monitored objects system that replaces the hardcoded `monitoredObjects` array in `monitor.js`.

## Problem Solved

Previously, all stations used the same hardcoded array of monitored object IDs:

```javascript
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
];
```

This caused issues because different stations have different object IDs for the same power measurements.

## Solution Overview

The new system:

1. **Stores station-specific object IDs in database** using a new `StationMonitoredObject` table
2. **Loads object IDs dynamically** for each station during initialization
3. **Falls back to defaults** if no station-specific objects are found
4. **Imports data from CSV** file (`monitorObjectId.csv`) for easy management

## Database Schema

### New Table: `StationMonitoredObject`

```prisma
model StationMonitoredObject {
  id          String   @id @default(cuid())
  stationId   String
  objectType  String   // "activePower1", "activePower2", etc.
  objectId    Int      // The actual ID number (e.g., 8684, 8685, etc.)

  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  station     Station  @relation(fields: [stationId], references: [id])

  @@unique([stationId, objectType])
  @@map("station_monitored_objects")
}
```

### Updated Station Model

```prisma
model Station {
  // ... existing fields ...
  monitoredObjects StationMonitoredObject[]
}
```

## CSV Data Format

The `monitorObjectId.csv` file contains the mapping:

```csv
stations,activePower1,activePower2,activePower3,activePower4,activePower5,activePower6,muxPower1,muxPower2,muxPower3,muxPower4,muxPower5,muxPower6
เชียงใหม่,8684,,8686,8687,,,18069,,73909,73910,,
กาญจนบุรี,8684,8685,,8687,,,18069,18070,,73910,,
...
```

- Empty cells mean that object type is not monitored for that station
- Each station gets only the object IDs it actually uses

## Setup Instructions

### 1. Run Migration

```bash
node migrate-monitored-objects.js
```

This will:

- Update the database schema
- Import data from `monitorObjectId.csv`
- Verify the import

### 2. Alternative Manual Steps

```bash
# Generate Prisma client
npm run db:generate

# Push schema changes
npm run db:push

# Import monitored objects
npm run objects:import

# Verify import
npm run objects:verify
```

### 3. Test the System

```bash
# Test dynamic object loading
node test-dynamic-objects.js

# Test full system
node monitor.js simultaneous
```

## How It Works

### 1. Station Initialization

When a `StationMonitor` is created:

1. It connects to the database
2. Loads station-specific monitored objects using `getStationMonitoredObjects()`
3. Falls back to default objects if none found
4. Sets up appropriate labels for display

### 2. Object Registration

During WebSocket session initialization:

1. Uses `this.monitoredObjects` (station-specific) instead of `config.monitoredObjects`
2. Registers only the objects relevant to that station
3. Reduces unnecessary data traffic

### 3. Data Processing

When processing WebSocket data:

1. Only processes object IDs that are in `this.monitoredObjects`
2. Uses station-specific labels for display
3. Saves data using the same database structure

## API Methods

### DatabaseService Methods

```javascript
// Get monitored objects for a station
const data = await dbService.getStationMonitoredObjects(stationId);
// Returns: { objectMap, objectIds, count }

// Get by station name
const data = await dbService.getMonitoredObjectsByStationName(stationName);
// Returns: { objectMap, objectIds, count, stationId }

// Update monitored objects
await dbService.updateStationMonitoredObjects(stationId, objectMap);
```

### StationMonitor Methods

```javascript
// Load monitored objects (called automatically)
await monitor.loadMonitoredObjects();

// Setup object labels (called automatically)
monitor.setupObjectLabels(objectMap);
```

## File Structure

```
├── monitorObjectId.csv                     # Source data
├── src/utils/import-monitored-objects.js   # Import utility
├── src/database/DatabaseService.js         # Updated with new methods
├── monitor.js                              # Updated to use dynamic objects
├── prisma/schema.prisma                    # Updated schema
├── migrate-monitored-objects.js            # Migration script
├── test-dynamic-objects.js                 # Test script
└── DYNAMIC_MONITORED_OBJECTS.md           # This documentation
```

## Benefits

1. **Station-Specific Configuration**: Each station only monitors its relevant objects
2. **Reduced Data Traffic**: No unnecessary object registrations
3. **Easy Management**: Update CSV file and re-import to change configurations
4. **Backward Compatibility**: Falls back to defaults if no station-specific objects found
5. **Better Performance**: Smaller object arrays for each station
6. **Accurate Labeling**: Object labels match actual station configuration

## Troubleshooting

### No Objects Found for Station

- Check if station exists in database
- Verify CSV import was successful
- Check station name matches exactly (case-sensitive)
- System will fall back to default objects

### Import Fails

- Verify CSV file format and location
- Check database connectivity
- Ensure Prisma schema is up to date

### Objects Not Loading

- Check database connection in monitor logs
- Verify station record exists
- Check for any database errors in logs

## Maintenance

### Adding New Stations

1. Add station to `monitorObjectId.csv`
2. Run `npm run objects:import`
3. Restart monitoring system

### Updating Object IDs

1. Update `monitorObjectId.csv`
2. Run `npm run objects:import` (will replace existing)
3. Restart monitoring system

### Verifying Configuration

```bash
npm run objects:verify
node test-dynamic-objects.js
```

This system provides a flexible, maintainable way to manage different monitored object configurations across multiple stations while maintaining backward compatibility.
