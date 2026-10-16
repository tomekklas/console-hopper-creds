import { describe, it, expect } from "vitest";
import {
  profileNameFor,
  envLines,
  unsetLines,
  profileBlock,
  configBlock,
  configureSetLines,
  processJson,
  dotenv,
  applyTemplate,
  bundleEnv,
  credentialsFile,
  configFile,
  bundleExtra,
  renderExtra,
  EXTRA_FORMATS,
  TEMPLATE_KEYS,
} from "../src/shared/formats.js";

const ctx = {
  accessKeyId: "ASIAEXAMPLE",
  secretAccessKey: 'se$cr"et',
  sessionToken: "tok==",
  expiration: "2026-10-15T13:00:00Z",
  region: "eu-west-1",
  accountId: "111122223333",
  accountName: "acme prod/audit",
  roleName: "PowerUser",
  roleArn: "arn:aws:iam::111122223333:role/PowerUser",
  profileName: "acme-prod-audit-PowerUser",
};

describe("profileNameFor", () => {
  it("fills the pattern and keeps to safe characters", () => {
    expect(profileNameFor("{account}-{role}", ctx)).toBe(
      "acme-prod-audit-PowerUser"
    );
    expect(profileNameFor("{accountId}_{role}", ctx)).toBe(
      "111122223333_PowerUser"
    );
    expect(profileNameFor("  ", ctx)).toBe("saml");
    expect(profileNameFor("x/y z", ctx)).toBe("x-y-z");
  });
  it("falls back to the account id when there is no name", () => {
    expect(profileNameFor("{account}", { ...ctx, accountName: "" })).toBe(
      "111122223333"
    );
  });
});

describe("env and unset lines", () => {
  it("bash quotes and escapes", () => {
    const t = envLines(ctx, "sh");
    expect(t).toContain('export AWS_ACCESS_KEY_ID="ASIAEXAMPLE"');
    expect(t).toContain('export AWS_SECRET_ACCESS_KEY="se\\$cr\\"et"');
    expect(t).toContain(
      'export AWS_CREDENTIAL_EXPIRATION="2026-10-15T13:00:00Z"'
    );
    expect(t).toContain('export AWS_REGION="eu-west-1"');
    expect(t).toContain('export AWS_DEFAULT_REGION="eu-west-1"');
    expect(unsetLines(ctx, "sh")).toBe(
      "unset AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN AWS_CREDENTIAL_EXPIRATION"
    );
  });
  it("cmd, PowerShell and fish shapes", () => {
    expect(envLines(ctx, "win")).toContain("set AWS_SESSION_TOKEN=tok==");
    expect(envLines(ctx, "win")).not.toContain("setx");
    expect(envLines(ctx, "ps")).toContain(
      '$Env:AWS_ACCESS_KEY_ID="ASIAEXAMPLE"'
    );
    expect(envLines(ctx, "fish")).toContain(
      'set -gx AWS_ACCESS_KEY_ID "ASIAEXAMPLE"'
    );
    expect(unsetLines(ctx, "fish")).toMatch(/^set -e /);
    expect(unsetLines(ctx, "ps")).toContain(
      "Remove-Item Env:AWS_ACCESS_KEY_ID"
    );
  });
  it("omits region and expiry when unknown", () => {
    const t = envLines({ ...ctx, region: "", expiration: "" }, "sh");
    expect(t).not.toContain("AWS_REGION");
    expect(t).not.toContain("AWS_CREDENTIAL_EXPIRATION");
  });
});

describe("profile, config, configure set, process JSON, dotenv", () => {
  it("profile block has the three keys plus account id and the expiry hint", () => {
    const t = profileBlock(ctx);
    expect(t.split("\n")[0]).toBe("[acme-prod-audit-PowerUser]");
    expect(t).toContain("aws_access_key_id = ASIAEXAMPLE");
    expect(t).toContain("aws_session_token = tok==");
    expect(t).toContain("aws_account_id = 111122223333");
    expect(t).toContain("x_security_token_expires = 2026-10-15T13:00:00Z");
  });
  it("config block uses the profile prefix", () => {
    expect(configBlock(ctx)).toBe(
      "[profile acme-prod-audit-PowerUser]\nregion = eu-west-1\noutput = json"
    );
  });
  it("aws configure set lines", () => {
    const t = configureSetLines(ctx);
    expect(t).toContain(
      "aws configure set aws_session_token tok== --profile acme-prod-audit-PowerUser"
    );
    expect(t).toContain(
      "aws configure set region eu-west-1 --profile acme-prod-audit-PowerUser"
    );
  });
  it("credential_process JSON is Version 1", () => {
    expect(JSON.parse(processJson(ctx))).toEqual({
      Version: 1,
      AccessKeyId: "ASIAEXAMPLE",
      SecretAccessKey: 'se$cr"et',
      SessionToken: "tok==",
      Expiration: "2026-10-15T13:00:00Z",
    });
  });
  it("dotenv has no export", () => {
    expect(dotenv(ctx)).toBe(
      'AWS_ACCESS_KEY_ID=ASIAEXAMPLE\nAWS_SECRET_ACCESS_KEY=se$cr"et\nAWS_SESSION_TOKEN=tok==\nAWS_REGION=eu-west-1'
    );
  });
});

describe("templates", () => {
  it("replaces known placeholders and blanks unknown ones", () => {
    expect(
      applyTemplate("k={{accessKeyId}} r={{ region }} x={{nope}}", ctx)
    ).toBe("k=ASIAEXAMPLE r=eu-west-1 x=");
  });
  it("every template key is in ctx", () => {
    for (const k of TEMPLATE_KEYS) expect(k in ctx).toBe(true);
  });
});

describe("extra formats", () => {
  it("every built-in renders and mentions the access key", () => {
    for (const f of EXTRA_FORMATS) {
      const out = renderExtra(f.id, ctx);
      expect(out, f.id).toContain("ASIAEXAMPLE");
    }
    expect(renderExtra("nope", ctx)).toBe("");
  });
});

describe("bundles", () => {
  const two = [
    ctx,
    {
      ...ctx,
      accountName: "beta",
      roleName: "ReadOnly",
      profileName: "beta-ReadOnly",
      accessKeyId: "ASIABETA",
    },
  ];
  it("credentials and config files hold one block per role", () => {
    const c = credentialsFile(two);
    expect(c.match(/^\[/gm)).toHaveLength(2);
    expect(c.endsWith("\n")).toBe(true);
    expect(configFile(two)).toContain("[profile beta-ReadOnly]");
  });
  it("env bundle comments each role", () => {
    const e = bundleEnv(two, "sh");
    expect(e).toContain("# acme prod/audit · PowerUser");
    expect(e).toContain("# beta · ReadOnly");
    expect(bundleEnv(two, "win")).toContain("rem beta · ReadOnly");
  });
  it("extra bundles join or header per format", () => {
    expect(
      bundleExtra("configure", two).match(/^aws configure set/gm)
    ).toHaveLength(8);
    expect(bundleExtra("process", two)).toContain(
      "# beta · ReadOnly (111122223333)"
    );
  });
});
