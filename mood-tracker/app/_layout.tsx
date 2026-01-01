// app/_layout.tsx
import { Stack } from "expo-router";
import { SQLiteProvider, type SQLiteDatabase } from "expo-sqlite";
import { migrateDbIfNeeded } from "../scripts/db";

export default function RootLayout() {
  return (
    <SQLiteProvider
      databaseName="mood.db"
      onInit={(db: SQLiteDatabase) => migrateDbIfNeeded(db)}
    >
      <Stack screenOptions={{ headerShown: false }} />
    </SQLiteProvider>
  );
}
