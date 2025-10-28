# Chiang Mai Station Integration

This document explains how the Chiang Mai station (`chaigmai.js`) is integrated with the main monitoring system (`monitor.js`).

## Overview

When you run `node monitor.js simultaneous`, the system will now automatically:

1. Start all configured stations from the database
2. **Automatically start the Chiang Mai station** (`chaigmai.js`)
3. Insert data from all stations (including Chiang Mai) into the database

## What Changed

### monitor.js Changes
- Added automatic spawning of `chaigmai.js` process when running in simultaneous mode
- Integrated Chiang Mai station configuration with the database
- Added proper process management (start/stop/restart)
- Added logging for Chiang Mai station activities

### chaigmai.js Changes  
- Added database integration using the same `DatabaseService`
- Added automatic station record creation/update in database
- Added data validation and saving to database
- Added formatted data display
- Added proper shutdown handling

## Usage

### Start the Full System
```bash
node monitor.js simultaneous
```

This will start:
- All stations configured in the database
- The Chiang Mai station (chaigmai.js) automatically
- Database logging for all stations

### Start Only Chiang Mai Station
```bash
node chaigmai.js
```

### Test the Integration
```bash
node test-integration.js
```

## Database Integration

The Chiang Mai station will:
- Automatically create/update its station record in the database
- Save power readings every 10 seconds (configurable)
- Validate data before saving
- Handle database connection errors gracefully

### Station Configuration
- **Name**: เชียงใหม่
- **IP**: ws://10.7.1.5/ws  
- **Scene**: d0cf3a77-e9dd-4419-bec0-b54ecad3e541

### Monitored Data Points
- Active Power 1-6 (IDs: 8684-8689)
- MUX Power Meters 1-6 (IDs: 18069, 18070, 73909, 73910, 75428, 75429)

## Logs

- Chiang Mai logs are saved to `logs/chiangmai_[timestamp].log`
- Console output is prefixed with `[เชียงใหม่]`
- Database operations are logged with appropriate levels

## Process Management

- The Chiang Mai process is automatically restarted if it crashes
- Graceful shutdown when the main monitor is stopped (Ctrl+C)
- Proper cleanup of database connections

## Troubleshooting

### If Chiang Mai station fails to start:
1. Check network connectivity to `ws://10.7.1.5/ws`
2. Verify database connection
3. Check logs in `logs/` directory

### If data is not being saved:
1. Check database connection status
2. Verify station record exists in database
3. Check for validation errors in logs

### If process keeps restarting:
1. Check WebSocket connection stability
2. Verify credentials and scene ID
3. Check for network issues

## Files Modified

- `monitor.js` - Added Chiang Mai integration
- `chaigmai.js` - Added database integration
- `package.json` - No changes needed (all dependencies already present)

## Dependencies

All required dependencies are already in package.json:
- `ws` - WebSocket client
- `@prisma/client` - Database ORM
- `child_process` - Process spawning (built-in Node.js module)