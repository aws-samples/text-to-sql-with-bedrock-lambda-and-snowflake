/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this
 * software and associated documentation files (the "Software"), to deal in the Software
 * without restriction, including without limitation the rights to use, copy, modify,
 * merge, publish, distribute, sublicense, and/or sell copies of the Software, and to
 * permit persons to whom the Software is furnished to do so.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
 * PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT
 * HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
 * OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
 * SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

import { EventEmitter } from "node:events";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createConnection: vi.fn(),
  configure: vi.fn(),
  oauthToken: "",
}));

vi.mock("snowflake-sdk", () => ({
  configure: mocks.configure,
  createConnection: mocks.createConnection,
}));

// Answers the OAuth client-credentials token request without a network call.
vi.mock("node:https", () => ({
  request: (_url: string, _options: unknown, callback: (res: EventEmitter) => void) => {
    const req = new EventEmitter() as EventEmitter & { write: () => void; end: () => void };
    req.write = () => {};
    req.end = () => {
      const res = new EventEmitter();
      callback(res);
      res.emit("data", Buffer.from(JSON.stringify({ access_token: mocks.oauthToken })));
      res.emit("end");
    };
    return req;
  },
}));

import {
  KeyPairAuthentication,
  loggableConnectionOptions,
  OAuthClientCredentialsAuthentication,
  Snowflake,
  SnowflakeConfig,
  UsernameAndPasswordAuthentication,
} from "../src/runtime/utils/Snowflake";

// Fake key material. Not a real key.
const FAKE_KEY_BODY = "MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQDfakefakefakefakefake";
const FAKE_PRIVATE_KEY = `-----BEGIN PRIVATE KEY-----\n${FAKE_KEY_BODY}\n-----END PRIVATE KEY-----\n`;
const FAKE_PASSWORD = "fake-password-value-123"; // pragma: allowlist secret
const FAKE_CLIENT_SECRET = "fake-oauth-client-secret-456"; // pragma: allowlist secret
const FAKE_TOKEN = "fake-oauth-access-token-789";
const SECRET_VALUES = [FAKE_KEY_BODY, "BEGIN PRIVATE KEY", FAKE_PASSWORD, FAKE_CLIENT_SECRET, FAKE_TOKEN];

function fakeLogger() {
  const lines: string[] = [];
  const record =
    (level: string) =>
    (...args: unknown[]) => {
      lines.push(`${level} ${args.map((arg) => (typeof arg == "string" ? arg : JSON.stringify(arg))).join(" ")}`);
    };
  return {
    lines,
    logger: { debug: record("debug"), info: record("info"), warn: record("warn"), error: record("error") },
  };
}

function fakeAws(secret: Record<string, string>) {
  return {
    getSecretValue: vi.fn(async () => ({ SecretString: JSON.stringify(secret) })),
  };
}

function fakeConnection() {
  const connection = {
    connect: (callback: (err: unknown, conn: unknown) => void) => callback(undefined, connection),
    isValidAsync: async () => true,
    execute: ({ complete }: { complete: (err: unknown, stmt: unknown, rows: unknown[]) => void }) => complete(undefined, {}, [{ ok: 1 }]),
  };
  return connection;
}

function config(authentication: SnowflakeConfig["authentication"], role?: string): SnowflakeConfig {
  return {
    account: "myorg-myaccount",
    application: "test",
    authentication,
    warehouse: "TEST_WH",
    database: "TEST_DB",
    schema: "PUBLIC",
    role,
  };
}

async function runQuery(snowflakeConfig: SnowflakeConfig, secret: Record<string, string>) {
  const { lines, logger } = fakeLogger();
  const aws = fakeAws(secret);
  // Snowflake.instance() caches a singleton, so build a fresh client for each test.
  (Snowflake as any)._instance = undefined;
  const snowflake = Snowflake.instance(snowflakeConfig, aws as any, { logger } as any);
  const rows = await snowflake.execute("select 1");
  return { lines, rows, options: mocks.createConnection.mock.calls[0][0] };
}

function expectNoSecrets(lines: string[]) {
  const output = lines.join("\n");
  for (const secret of SECRET_VALUES) {
    expect(output).not.toContain(secret);
  }
}

describe("Snowflake connection logging", () => {
  beforeEach(() => {
    mocks.createConnection.mockReset();
    mocks.createConnection.mockImplementation(() => fakeConnection());
    mocks.oauthToken = FAKE_TOKEN;
  });

  it("does not log the private key for key-pair authentication", async () => {
    const { lines, rows, options } = await runQuery(config(new KeyPairAuthentication("SVC_USER", "my-secret/privateKey"), "MY_ROLE"), {
      privateKey: FAKE_PRIVATE_KEY,
    });
    expect(rows).toEqual([{ ok: 1 }]);
    // The key still reaches the driver.
    expect(options.privateKey).toBe(FAKE_PRIVATE_KEY);
    expect(options.authenticator).toBe("SNOWFLAKE_JWT");
    expectNoSecrets(lines);
    // Non-secret fields are still logged for troubleshooting.
    const connecting = lines.find((line) => line.includes("Connecting to Snowflake"));
    expect(connecting).toContain("myorg-myaccount");
    expect(connecting).toContain("SVC_USER");
    expect(connecting).toContain("MY_ROLE");
  });

  it("does not log the password for username and password authentication", async () => {
    const { lines, options } = await runQuery(config(new UsernameAndPasswordAuthentication("USER", "my-secret/password")), {
      password: FAKE_PASSWORD,
    });
    expect(options.password).toBe(FAKE_PASSWORD);
    expectNoSecrets(lines);
    expect(lines.some((line) => line.startsWith("warn") && line.includes("deprecated"))).toBe(true);
  });

  it("does not log the OAuth token or client secret", async () => {
    const authentication = new OAuthClientCredentialsAuthentication("USER", "my-secret/clientSecret", "https://idp.example.com/token", "client-id");
    const { lines, options } = await runQuery(config(authentication as any), {
      clientSecret: FAKE_CLIENT_SECRET,
    });
    expect(options.token).toBe(FAKE_TOKEN);
    expectNoSecrets(lines);
  });
});

describe("Snowflake role", () => {
  beforeEach(() => {
    mocks.createConnection.mockReset();
    mocks.createConnection.mockImplementation(() => fakeConnection());
  });

  it("passes the configured role to the connection", async () => {
    const { options } = await runQuery(config(new KeyPairAuthentication("SVC_USER", "my-secret/privateKey"), "TEXT_TO_SQL_ROLE"), {
      privateKey: FAKE_PRIVATE_KEY,
    });
    expect(options.role).toBe("TEXT_TO_SQL_ROLE");
  });

  it("omits the role when none is configured, so Snowflake uses the user's default role", async () => {
    const { options } = await runQuery(config(new KeyPairAuthentication("SVC_USER", "my-secret/privateKey")), {
      privateKey: FAKE_PRIVATE_KEY,
    });
    expect("role" in options).toBe(false);
  });
});

describe("loggableConnectionOptions", () => {
  it("keeps only non-secret fields", () => {
    const loggable = loggableConnectionOptions({
      account: "myorg-myaccount",
      application: "test",
      username: "USER",
      role: "ROLE",
      warehouse: "WH",
      database: "DB",
      schema: "PUBLIC",
      authenticator: "SNOWFLAKE_JWT",
      privateKey: FAKE_PRIVATE_KEY,
      privateKeyPass: FAKE_PASSWORD,
      password: FAKE_PASSWORD,
      token: FAKE_TOKEN,
      oauthClientSecret: FAKE_CLIENT_SECRET,
    } as any);
    expect(loggable).toEqual({
      account: "myorg-myaccount",
      application: "test",
      username: "USER",
      role: "ROLE",
      warehouse: "WH",
      database: "DB",
      schema: "PUBLIC",
      authenticator: "SNOWFLAKE_JWT",
    });
    expectNoSecrets([JSON.stringify(loggable)]);
  });
});
