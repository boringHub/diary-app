import type { SQLiteDBConnection } from '@capacitor-community/sqlite'
import type { ThemeManifest } from '../services/themeService'

export async function upsertThemeManifest(
  db: Pick<SQLiteDBConnection, 'run'>,
  manifest: ThemeManifest,
  metadata: Record<string, unknown>,
) {
  await db.run(
    `INSERT INTO themes (
      id, version, name, description, manifest_json, installed_at, enabled
    ) VALUES (?, ?, ?, ?, ?, ?, 1)
    ON CONFLICT(id, version) DO UPDATE SET
      name = excluded.name,
      description = excluded.description,
      manifest_json = excluded.manifest_json,
      enabled = 1`,
    [manifest.id, manifest.version, manifest.name, manifest.description, JSON.stringify(manifest), Date.now()],
    false,
  )

  void metadata
}
