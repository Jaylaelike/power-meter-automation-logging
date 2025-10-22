/*
  Warnings:

  - You are about to drop the column `uuid` on the `stations` table. All the data in the column will be lost.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_stations" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "ipAddress" TEXT,
    "scene" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_stations" ("createdAt", "id", "ipAddress", "name", "scene", "updatedAt") SELECT "createdAt", "id", "ipAddress", "name", "scene", "updatedAt" FROM "stations";
DROP TABLE "stations";
ALTER TABLE "new_stations" RENAME TO "stations";
CREATE UNIQUE INDEX "stations_name_key" ON "stations"("name");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
