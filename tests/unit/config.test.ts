import test from "node:test";
import assert from "node:assert/strict";
import { getServerConfig, resetServerConfigCache } from "../../lib/config.ts";

const REQUIRED_ENV = {
  APP_BASE_URL: "https://ist.example.com",
  DATABASE_URL: "postgresql://user:pass@localhost:6543/postgres",
  NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test_key",
  SUPABASE_SECRET_KEY: "sb_secret_test_key",
  SUPABASE_MEDIA_BUCKET: "ist-media",
  SUPABASE_REPORT_BUCKET: "ist-reports",
  SESSION_TOKEN_SECRET: "s".repeat(32),
  ACCESS_CODE_PEPPER: "p".repeat(32),
};

const CONFIG_KEYS = [...Object.keys(REQUIRED_ENV), "ERROR_MONITORING_DSN"];

/**
 * Swaps the environment for one sync test, then restores it.
 *
 * `getServerConfig` memoizes, so the cache is dropped on BOTH sides: before `run` so this test's env
 * is the one that gets parsed rather than a neighbour's leftover, and after it so the memo cannot
 * outlive the environment it was built from and leak into the next test.
 */
function withEnv(overrides: Record<string, string | undefined>, run: () => void): void {
  const saved = CONFIG_KEYS.map((key) => [key, process.env[key]] as const);
  for (const key of CONFIG_KEYS) {
    delete process.env[key];
  }
  for (const [key, value] of Object.entries(overrides)) {
    if (value !== undefined) {
      process.env[key] = value;
    }
  }
  resetServerConfigCache();
  try {
    const result: unknown = run();
    if (result instanceof Promise) {
      throw new Error("withEnv is sync-only");
    }
  } finally {
    for (const [key, value] of saved) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
    resetServerConfigCache();
  }
}

test("getServerConfig throws an error naming DATABASE_URL when it is absent", () => {
  withEnv({ ...REQUIRED_ENV, DATABASE_URL: undefined }, () => {
    assert.throws(
      () => getServerConfig(),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.match(error.message, /DATABASE_URL/);
        return true;
      },
    );
  });
});

test("getServerConfig returns typed values when all required vars are set", () => {
  withEnv(REQUIRED_ENV, () => {
    const config = getServerConfig();

    assert.equal(config.APP_BASE_URL, REQUIRED_ENV.APP_BASE_URL);
    assert.equal(config.DATABASE_URL, REQUIRED_ENV.DATABASE_URL);
    assert.equal(config.NEXT_PUBLIC_SUPABASE_URL, REQUIRED_ENV.NEXT_PUBLIC_SUPABASE_URL);
    assert.equal(config.SUPABASE_MEDIA_BUCKET, "ist-media");
    assert.equal(config.SUPABASE_REPORT_BUCKET, "ist-reports");
    assert.equal(config.SESSION_TOKEN_SECRET, REQUIRED_ENV.SESSION_TOKEN_SECRET);
    assert.equal(config.ERROR_MONITORING_DSN, undefined);
  });
});

test("getServerConfig treats an empty ERROR_MONITORING_DSN as not configured", () => {
  withEnv({ ...REQUIRED_ENV, ERROR_MONITORING_DSN: "" }, () => {
    assert.equal(getServerConfig().ERROR_MONITORING_DSN, undefined);
  });
});

test("getServerConfig throws naming SESSION_TOKEN_SECRET when it is shorter than 32 chars", () => {
  withEnv({ ...REQUIRED_ENV, SESSION_TOKEN_SECRET: "s".repeat(31) }, () => {
    assert.throws(
      () => getServerConfig(),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.match(error.message, /SESSION_TOKEN_SECRET/);
        return true;
      },
    );
  });
});

test("getServerConfig throws naming APP_BASE_URL when it is not a valid URL", () => {
  withEnv({ ...REQUIRED_ENV, APP_BASE_URL: "bukan-url" }, () => {
    assert.throws(
      () => getServerConfig(),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.match(error.message, /APP_BASE_URL/);
        return true;
      },
    );
  });
});

test("getServerConfig error message starts with the Indonesian config prefix", () => {
  withEnv({ ...REQUIRED_ENV, DATABASE_URL: undefined }, () => {
    assert.throws(
      () => getServerConfig(),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.ok(error.message.startsWith("Konfigurasi environment tidak lengkap/invalid:"));
        return true;
      },
    );
  });
});

test("getServerConfig memoizes: repeated calls return the identical object", () => {
  withEnv(REQUIRED_ENV, () => {
    // Identity, not equality: every participant request reads the session-token secret through this,
    // and re-parsing ~12 vars through zod + superRefine each time is pure waste.
    assert.equal(getServerConfig(), getServerConfig());
  });
});

test("getServerConfig re-parses after the cache is reset, picking up a changed env", () => {
  withEnv(REQUIRED_ENV, () => {
    assert.equal(getServerConfig().SUPABASE_MEDIA_BUCKET, "ist-media");
  });
  withEnv({ ...REQUIRED_ENV, SUPABASE_MEDIA_BUCKET: "ist-media-lain" }, () => {
    // Would still read "ist-media" if the memo survived `withEnv`'s reset — which is exactly how a
    // memo leaks one test's environment into the next.
    assert.equal(getServerConfig().SUPABASE_MEDIA_BUCKET, "ist-media-lain");
  });
});

test("getServerConfig does not cache a failure: a fixed env parses on the next call", () => {
  withEnv({ ...REQUIRED_ENV, DATABASE_URL: undefined }, () => {
    assert.throws(() => getServerConfig());
    // Same cache, no reset: a cached throw would strand a process that booted before its env landed.
    process.env.DATABASE_URL = REQUIRED_ENV.DATABASE_URL;
    assert.equal(getServerConfig().DATABASE_URL, REQUIRED_ENV.DATABASE_URL);
  });
});

test("getServerConfig names every missing var, comma-joined", () => {
  withEnv(
    { ...REQUIRED_ENV, DATABASE_URL: undefined, SUPABASE_SECRET_KEY: undefined },
    () => {
      assert.throws(
        () => getServerConfig(),
        (error: unknown) => {
          assert.ok(error instanceof Error);
          const paths = error.message
            .slice("Konfigurasi environment tidak lengkap/invalid: ".length)
            .split(", ");
          assert.ok(paths.includes("DATABASE_URL"));
          assert.ok(paths.includes("SUPABASE_SECRET_KEY"));
          return true;
        },
      );
    },
  );
});
