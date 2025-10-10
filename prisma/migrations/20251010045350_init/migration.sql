-- CreateTable
CREATE TABLE "stations" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "uuid" TEXT NOT NULL,
    "ipAddress" TEXT NOT NULL,
    "scene" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "power_readings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "stationId" TEXT NOT NULL,
    "timestamp" DATETIME NOT NULL,
    "activePower1" REAL,
    "activePower2" REAL,
    "activePower3" REAL,
    "activePower4" REAL,
    "activePower5" REAL,
    "activePower6" REAL,
    "muxPower1" REAL,
    "muxPower2" REAL,
    "muxPower3" REAL,
    "muxPower4" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "power_readings_stationId_fkey" FOREIGN KEY ("stationId") REFERENCES "stations" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "data_sources" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "source" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "stations_name_key" ON "stations"("name");

-- CreateIndex
CREATE UNIQUE INDEX "stations_uuid_key" ON "stations"("uuid");

-- CreateIndex
CREATE INDEX "power_readings_stationId_timestamp_idx" ON "power_readings"("stationId", "timestamp");

-- CreateIndex
CREATE INDEX "power_readings_timestamp_idx" ON "power_readings"("timestamp");
