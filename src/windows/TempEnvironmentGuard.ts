import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

/** Outcome of one writable-temp-environment guard pass. */
export type TempEnvironmentGuardResult =
  | { readonly action: "unchanged"; readonly tempDirectory: string }
  | {
      readonly action: "repointed";
      readonly previousTempDirectory: string;
      readonly tempDirectory: string;
    }
  | {
      readonly action: "failed";
      readonly tempDirectory: string;
      readonly fallbackDirectory: string | null;
    };

/** Process seams replaceable in guard tests. */
export interface TempEnvironmentGuardHost {
  readonly platform: NodeJS.Platform;
  readonly env: NodeJS.ProcessEnv;
  readonly tmpdir: () => string;
  readonly homedir: () => string;
  /** Windows installation directory, or null when unknown or not on Windows. */
  readonly windowsDirectory: () => string | null;
  /** Report whether one probe directory can be created and removed inside the candidate. */
  readonly probe: (directory: string) => boolean;
  readonly ensureDirectory: (directory: string) => void;
  readonly warn: (message: string) => void;
}

const probeWithFilesystem = (directory: string): boolean => {
  let probePath: string | undefined;
  try {
    probePath = mkdtempSync(join(directory, "rea-temp-probe-"));
    return true;
  } catch {
    return false;
  } finally {
    if (probePath !== undefined) {
      try {
        rmSync(probePath, { recursive: true, force: true });
      } catch {
        // A leftover empty probe directory is harmless.
      }
    }
  }
};

export const systemTempEnvironmentGuardHost = (): TempEnvironmentGuardHost => ({
  platform: process.platform,
  env: process.env,
  tmpdir,
  homedir,
  windowsDirectory: () =>
    process.platform === "win32"
      ? (process.env.WINDIR ?? process.env.SystemRoot ?? "C:\\WINDOWS")
      : null,
  probe: probeWithFilesystem,
  ensureDirectory: (directory) => {
    mkdirSync(directory, { recursive: true });
  },
  warn: (message) => {
    process.stderr.write(`${message}\n`);
  },
});

const isWithin = (directory: string, ancestor: string): boolean => {
  const normalize = (value: string): string =>
    value.replaceAll("/", "\\").toLowerCase().replace(/\\+$/u, "");
  const child = normalize(directory);
  const parent = normalize(ancestor);
  return child === parent || child.startsWith(`${parent}\\`);
};

/**
 * Windows resolves an unusable TEMP (unset, POSIX-style, or admin-only) to
 * `C:\WINDOWS\TEMP`, and the native admission layer rejects system-owned temp
 * directories with "Access is denied" even when the caller could write there,
 * because provider runtime roots require per-user DACL authority. Probe the
 * resolved directory once at dispatch and repoint TEMP/TMP to the user's local
 * Temp directory when the preferred resolution is not writable or sits inside
 * the Windows directory. The repoint is declared on stderr; a failed guard
 * leaves the environment untouched so the existing native diagnostics keep
 * reporting the actual constraint.
 */
export const ensureWritableTempEnv = (
  host: TempEnvironmentGuardHost = systemTempEnvironmentGuardHost(),
): TempEnvironmentGuardResult => {
  const preferred = host.tmpdir();
  const windowsDirectory = host.windowsDirectory();
  const acceptable =
    host.probe(preferred) &&
    !(windowsDirectory !== null && isWithin(preferred, windowsDirectory));
  if (acceptable) return { action: "unchanged", tempDirectory: preferred };
  if (host.platform !== "win32")
    return {
      action: "failed",
      tempDirectory: preferred,
      fallbackDirectory: null,
    };
  const localAppData =
    host.env.LOCALAPPDATA ?? join(host.homedir(), "AppData", "Local");
  const fallback = join(localAppData, "Temp");
  let writable: boolean;
  try {
    host.ensureDirectory(fallback);
    writable = host.probe(fallback);
  } catch {
    writable = false;
  }
  if (!writable) {
    host.warn(
      `[rea] TEMP is not writable (${preferred}) and no writable fallback was found under ${fallback}; continuing with the original resolution.`,
    );
    return {
      action: "failed",
      tempDirectory: preferred,
      fallbackDirectory: fallback,
    };
  }
  host.env.TEMP = fallback;
  host.env.TMP = fallback;
  host.warn(
    `[rea] TEMP is not writable (${preferred}); repointed TEMP/TMP to ${fallback} for this process.`,
  );
  return {
    action: "repointed",
    previousTempDirectory: preferred,
    tempDirectory: fallback,
  };
};
