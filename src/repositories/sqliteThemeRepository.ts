import { CapacitorSQLite, SQLiteConnection } from '@capacitor-community/sqlite'
import type { ThemeManifest } from '../services/themeService'
import { DATABASE_NAME, DATABASE_SCHEMA, DATABASE_VERSION, MIGRATION_V2 } from './sqliteSchema'
import { upsertThemeManifest } from './sqliteThemeIndex'

export async function indexImportedTheme(manifest: ThemeManifest) {
  const sqlite = new SQLiteConnection(CapacitorSQLite)
  await sqlite.addUpgradeStatement(DATABASE_NAME, [{ toVersion: DATABASE_VERSION, statements: MIGRATION_V2 }])
  const existing = await sqlite.isConnection(DATABASE_NAME, false)
  const db = existing.result
    ? await sqlite.retrieveConnection(DATABASE_NAME, false)
    : await sqlite.createConnection(DATABASE_NAME, false, 'no-encryption', DATABASE_VERSION, false)

  if (!(await db.isDBOpen()).result) await db.open()
  await db.execute(DATABASE_SCHEMA, true)
  await db.beginTransaction()
  try {
    await upsertThemeManifest(db, manifest, { imported: true, virtual: false })
    await db.commitTransaction()
  } catch (error) {
    await db.rollbackTransaction().catch(() => undefined)
    throw error
  }
}
