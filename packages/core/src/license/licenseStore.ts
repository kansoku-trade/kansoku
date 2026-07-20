import { eq } from "drizzle-orm";
import type { Db } from "../db/index.js";
import { providerCredentials } from "../db/schema.js";
import { LICENSE_PROVIDER_KEY } from "../ai/settings/credentialStore.js";
import type { SecretBox } from "../ai/settings/secretBox.js";

const LICENSE_PROVIDER = LICENSE_PROVIDER_KEY;

export type LicenseOutcome = "success" | "network_fail" | "invalid";

export interface LicenseRecord {
  key: string;
  instanceId: string | null;
  deviceName: string;
  lastValidatedAt: string;
  lastOutcome: LicenseOutcome;
  bundleKey?: string;
  keyId?: string;
}

export interface LicenseStore {
  read(): LicenseRecord | null;
  write(record: LicenseRecord): void;
  clear(): void;
}

export function createLicenseStore(db: Db, secretBox: SecretBox): LicenseStore {
  return {
    read(): LicenseRecord | null {
      const row = db.select().from(providerCredentials).where(eq(providerCredentials.provider, LICENSE_PROVIDER)).get();
      if (!row) return null;
      try {
        return JSON.parse(secretBox.decrypt(LICENSE_PROVIDER, row.secret)) as LicenseRecord;
      } catch (err) {
        console.error(`licenseStore: failed to decrypt license record: ${String(err)}`);
        return null;
      }
    },

    write(record: LicenseRecord): void {
      const secret = secretBox.encrypt(LICENSE_PROVIDER, JSON.stringify(record));
      const updatedAt = new Date().toISOString();
      db.insert(providerCredentials)
        .values({ provider: LICENSE_PROVIDER, secret, updatedAt })
        .onConflictDoUpdate({ target: providerCredentials.provider, set: { secret, updatedAt } })
        .run();
    },

    clear(): void {
      db.delete(providerCredentials).where(eq(providerCredentials.provider, LICENSE_PROVIDER)).run();
    },
  };
}
