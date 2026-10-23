import type { ThemeManifest } from '../services/themeService'
import { getSQLiteDatabase,withSQLiteTransaction } from './sqliteDatabase'
import { upsertThemeManifest } from './sqliteThemeIndex'

export async function indexImportedTheme(manifest: ThemeManifest) {
  const db=await getSQLiteDatabase()
  await withSQLiteTransaction(db,async db=>{
    await upsertThemeManifest(db, manifest, { imported: true, virtual: false })
  })
}
