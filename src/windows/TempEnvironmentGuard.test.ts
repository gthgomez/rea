import { describe, expect, it } from "vitest";

import {
  ensureWritableTempEnv,
  type TempEnvironmentGuardHost,
} from "./TempEnvironmentGuard.js";

interface GuardFixture {
  readonly host: TempEnvironmentGuardHost;
  readonly env: NodeJS.ProcessEnv;
  readonly warnings: string[];
  readonly ensureDirectoryCalls: string[];
}

const makeHost = (options: {
  preferred: string;
  preferredWritable: boolean;
  fallback?: string;
  fallbackWritable?: boolean;
  platform?: NodeJS.Platform;
  localAppData?: string | undefined;
  windowsDirectory?: string | null;
}): GuardFixture => {
  const fallback =
    options.fallback ?? "C:\\Users\\tester\\AppData\\Local\\Temp";
  const env: NodeJS.ProcessEnv = {};
  if (options.localAppData !== undefined)
    env.LOCALAPPDATA = options.localAppData;
  const warnings: string[] = [];
  const ensureDirectoryCalls: string[] = [];
  const windowsDirectory =
    options.windowsDirectory === undefined
      ? options.platform === undefined || options.platform === "win32"
        ? "C:\\WINDOWS"
        : null
      : options.windowsDirectory;
  const host: TempEnvironmentGuardHost = {
    platform: options.platform ?? "win32",
    env,
    tmpdir: () => options.preferred,
    homedir: () => "C:\\Users\\tester",
    windowsDirectory: () => windowsDirectory,
    probe: (directory: string) => {
      if (directory === options.preferred) return options.preferredWritable;
      if (directory === fallback) return options.fallbackWritable ?? true;
      return false;
    },
    ensureDirectory: (directory: string) => {
      ensureDirectoryCalls.push(directory);
    },
    warn: (message: string) => {
      warnings.push(message);
    },
  };
  return { host, env, warnings, ensureDirectoryCalls };
};

describe("ensureWritableTempEnv", () => {
  it("keeps a writable preferred temp directory untouched", () => {
    const fixture = makeHost({
      preferred: "C:\\Users\\tester\\AppData\\Local\\Temp",
      preferredWritable: true,
    });

    const result = ensureWritableTempEnv(fixture.host);

    expect(result).toEqual({
      action: "unchanged",
      tempDirectory: "C:\\Users\\tester\\AppData\\Local\\Temp",
    });
    expect(fixture.env.TEMP).toBeUndefined();
    expect(fixture.env.TMP).toBeUndefined();
    expect(fixture.warnings).toEqual([]);
    expect(fixture.ensureDirectoryCalls).toEqual([]);
  });

  it("repoints TEMP and TMP to the user's local Temp when the preferred directory is not writable", () => {
    const fixture = makeHost({
      preferred: "C:\\WINDOWS\\TEMP",
      preferredWritable: false,
    });

    const result = ensureWritableTempEnv(fixture.host);

    expect(result).toEqual({
      action: "repointed",
      previousTempDirectory: "C:\\WINDOWS\\TEMP",
      tempDirectory: "C:\\Users\\tester\\AppData\\Local\\Temp",
    });
    expect(fixture.env.TEMP).toBe("C:\\Users\\tester\\AppData\\Local\\Temp");
    expect(fixture.env.TMP).toBe("C:\\Users\\tester\\AppData\\Local\\Temp");
    expect(fixture.ensureDirectoryCalls).toEqual([
      "C:\\Users\\tester\\AppData\\Local\\Temp",
    ]);
    expect(fixture.warnings).toHaveLength(1);
    expect(fixture.warnings[0]).toContain("C:\\WINDOWS\\TEMP");
    expect(fixture.warnings[0]).toContain(
      "C:\\Users\\tester\\AppData\\Local\\Temp",
    );
  });

  it("derives the fallback from the home directory when LOCALAPPDATA is absent", () => {
    const fixture = makeHost({
      preferred: "C:\\WINDOWS\\TEMP",
      preferredWritable: false,
      localAppData: undefined,
    });

    const result = ensureWritableTempEnv(fixture.host);

    expect(result).toEqual({
      action: "repointed",
      previousTempDirectory: "C:\\WINDOWS\\TEMP",
      tempDirectory: "C:\\Users\\tester\\AppData\\Local\\Temp",
    });
    expect(fixture.ensureDirectoryCalls).toEqual([
      "C:\\Users\\tester\\AppData\\Local\\Temp",
    ]);
  });

  it("leaves the environment untouched and declares the failure when no fallback is writable", () => {
    const fixture = makeHost({
      preferred: "C:\\WINDOWS\\TEMP",
      preferredWritable: false,
      fallbackWritable: false,
    });

    const result = ensureWritableTempEnv(fixture.host);

    expect(result).toEqual({
      action: "failed",
      tempDirectory: "C:\\WINDOWS\\TEMP",
      fallbackDirectory: "C:\\Users\\tester\\AppData\\Local\\Temp",
    });
    expect(fixture.env.TEMP).toBeUndefined();
    expect(fixture.env.TMP).toBeUndefined();
    expect(fixture.warnings).toHaveLength(1);
    expect(fixture.warnings[0]).toContain("no writable fallback");
  });

  it("repoints a writable temp directory that sits inside the Windows directory", () => {
    const fixture = makeHost({
      preferred: "C:\\WINDOWS\\TEMP",
      preferredWritable: true,
    });

    const result = ensureWritableTempEnv(fixture.host);

    expect(result).toEqual({
      action: "repointed",
      previousTempDirectory: "C:\\WINDOWS\\TEMP",
      tempDirectory: "C:\\Users\\tester\\AppData\\Local\\Temp",
    });
    expect(fixture.env.TEMP).toBe("C:\\Users\\tester\\AppData\\Local\\Temp");
    expect(fixture.env.TMP).toBe("C:\\Users\\tester\\AppData\\Local\\Temp");
  });

  it("keeps a user-profile temp directory that is outside the Windows directory", () => {
    const fixture = makeHost({
      preferred: "D:\\Workspace\\tmp",
      preferredWritable: true,
    });

    const result = ensureWritableTempEnv(fixture.host);

    expect(result).toEqual({
      action: "unchanged",
      tempDirectory: "D:\\Workspace\\tmp",
    });
    expect(fixture.env.TEMP).toBeUndefined();
  });

  it("does not attempt a Windows fallback on POSIX hosts", () => {
    const fixture = makeHost({
      preferred: "/tmp",
      preferredWritable: false,
      platform: "linux",
    });

    const result = ensureWritableTempEnv(fixture.host);

    expect(result).toEqual({
      action: "failed",
      tempDirectory: "/tmp",
      fallbackDirectory: null,
    });
    expect(fixture.ensureDirectoryCalls).toEqual([]);
    expect(fixture.env.TEMP).toBeUndefined();
  });
});
