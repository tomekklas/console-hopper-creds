import { describe, it, expect, vi } from "vitest";
import {
  stsEndpoint,
  clampDuration,
  durationPlan,
  buildAssumeRoleBody,
  parseStsResponse,
  isDurationError,
  explainStsError,
  isExpiredError,
  assumeRoleWithSaml,
  assumeMany,
} from "../src/shared/sts.js";

const OK_XML = `<AssumeRoleWithSAMLResponse xmlns="https://sts.amazonaws.com/doc/2011-06-15/">
  <AssumeRoleWithSAMLResult>
    <Credentials>
      <AccessKeyId>ASIAEXAMPLE</AccessKeyId>
      <SecretAccessKey>s3cr3t/with+chars&amp;amp</SecretAccessKey>
      <SessionToken>tok==</SessionToken>
      <Expiration>2026-10-15T13:00:00Z</Expiration>
    </Credentials>
    <AssumedRoleUser><Arn>arn:aws:sts::111122223333:assumed-role/PowerUser/tomek</Arn><AssumedRoleId>AROA:tomek</AssumedRoleId></AssumedRoleUser>
    <Subject>tomek</Subject><SubjectType>persistent</SubjectType><Issuer>https://idp</Issuer><Audience>https://signin.aws.amazon.com/saml</Audience>
  </AssumeRoleWithSAMLResult>
</AssumeRoleWithSAMLResponse>`;

const ERR_XML = (code, msg) =>
  `<ErrorResponse xmlns="https://sts.amazonaws.com/doc/2011-06-15/"><Error><Type>Sender</Type><Code>${code}</Code><Message>${msg}</Message></Error><RequestId>x</RequestId></ErrorResponse>`;

const DURATION_ERR = ERR_XML(
  "ValidationError",
  "The requested DurationSeconds exceeds the MaxSessionDuration set for this role."
);

describe("stsEndpoint", () => {
  it("is regional per partition", () => {
    expect(stsEndpoint({ partition: "aws", region: "eu-west-1" })).toBe(
      "https://sts.eu-west-1.amazonaws.com/"
    );
    expect(stsEndpoint({})).toBe("https://sts.us-east-1.amazonaws.com/");
    expect(stsEndpoint({ partition: "aws-cn" })).toBe(
      "https://sts.cn-north-1.amazonaws.com.cn/"
    );
    expect(
      stsEndpoint({ partition: "aws-us-gov", region: "us-gov-east-1" })
    ).toBe("https://sts.us-gov-east-1.amazonaws.com/");
  });
});

describe("durations", () => {
  it("clamps", () => {
    expect(clampDuration(10)).toBe(900);
    expect(clampDuration(99999)).toBe(43200);
    expect(clampDuration("abc")).toBe(3600);
    expect(clampDuration(7200)).toBe(7200);
  });
  it("plans longest-first with the 1 h and 15 min fallbacks", () => {
    expect(durationPlan(43200)).toEqual([43200, 3600, 900]);
    expect(durationPlan(3600)).toEqual([3600, 900]);
    expect(durationPlan(900)).toEqual([900]);
    expect(durationPlan(1800)).toEqual([1800, 900]);
  });
});

describe("buildAssumeRoleBody", () => {
  it("form-encodes, strips whitespace from the assertion and escapes '='", () => {
    const body = buildAssumeRoleBody({
      roleArn: "arn:aws:iam::1:role/x",
      principalArn: "arn:aws:iam::1:saml-provider/y",
      assertion: "AAAA\nBBBB==",
      durationSeconds: 3600,
    });
    expect(body).toContain("Action=AssumeRoleWithSAML");
    expect(body).toContain("Version=2011-06-15");
    expect(body).toContain("SAMLAssertion=AAAABBBB%3D%3D");
    expect(body).toContain("DurationSeconds=3600");
    expect(body).toContain("RoleArn=arn%3Aaws%3Aiam%3A%3A1%3Arole%2Fx");
  });
});

describe("parseStsResponse", () => {
  it("reads credentials and unescapes entities", () => {
    const r = parseStsResponse(OK_XML, 200);
    expect(r.ok).toBe(true);
    expect(r.credentials).toEqual({
      accessKeyId: "ASIAEXAMPLE",
      secretAccessKey: "s3cr3t/with+chars&amp",
      sessionToken: "tok==",
      expiration: "2026-10-15T13:00:00Z",
    });
    expect(r.assumedRoleArn).toBe(
      "arn:aws:sts::111122223333:assumed-role/PowerUser/tomek"
    );
    expect(r.subject).toBe("tomek");
  });
  it("reads errors", () => {
    const r = parseStsResponse(ERR_XML("ExpiredToken", "Token expired"), 400);
    expect(r).toMatchObject({
      ok: false,
      code: "ExpiredToken",
      message: "Token expired",
      status: 400,
    });
    expect(parseStsResponse("<html>oops</html>", 503).code).toBe("HTTP 503");
    expect(parseStsResponse("<x/>", 200).code).toBe("UnexpectedResponse");
  });
  it("classifies the duration error", () => {
    expect(isDurationError(parseStsResponse(DURATION_ERR, 400))).toBe(true);
    expect(
      isDurationError(parseStsResponse(ERR_XML("AccessDenied", "nope"), 403))
    ).toBe(false);
    expect(isDurationError({ ok: true })).toBe(false);
  });
  it("explains", () => {
    expect(
      explainStsError({ ok: false, code: "AccessDenied", message: "x" })
    ).toMatch(/trust policy/);
    expect(
      explainStsError({ ok: false, code: "ExpiredToken", message: "x" })
    ).toMatch(/Sign in again/);
    expect(explainStsError({ ok: false, code: "Weird", message: "m" })).toBe(
      "Weird: m"
    );
  });
  it("treats a sign-in past STS's 5 minutes as expired", () => {
    const stale = parseStsResponse(
      ERR_XML(
        "ExpiredTokenException",
        "Token must be redeemed within 5 minutes of issuance"
      ),
      400
    );
    expect(stale.code).toBe("ExpiredTokenException");
    expect(isExpiredError(stale)).toBe(true);
    expect(explainStsError(stale)).toMatch(/Sign in again/);
    // The message alone is enough, whatever the code.
    expect(
      explainStsError({
        ok: false,
        code: "ValidationError",
        message: "Token must be redeemed within 5 minutes of issuance",
      })
    ).toMatch(/Sign in again/);
    expect(
      isExpiredError({ ok: false, code: "AccessDenied", message: "x" })
    ).toBe(false);
    expect(isExpiredError({ ok: true })).toBe(false);
  });
});

const fetchMock = (handler) =>
  vi.fn(async (url, init) => {
    const { status, body } = handler(url, init);
    return { status, text: async () => body };
  });

describe("assumeRoleWithSaml", () => {
  const params = {
    endpoint: "https://sts.eu-west-1.amazonaws.com/",
    roleArn: "arn:aws:iam::1:role/x",
    principalArn: "arn:aws:iam::1:saml-provider/y",
    assertion: "AAAA",
  };

  it("returns credentials on the first try", async () => {
    const f = fetchMock(() => ({ status: 200, body: OK_XML }));
    const r = await assumeRoleWithSaml(f, {
      ...params,
      durationSeconds: 43200,
    });
    expect(r.ok).toBe(true);
    expect(r.durationSeconds).toBe(43200);
    expect(r.shortened).toBe(false);
    expect(f).toHaveBeenCalledTimes(1);
    expect(f.mock.calls[0][1].method).toBe("POST");
    expect(f.mock.calls[0][1].headers["Content-Type"]).toBe(
      "application/x-www-form-urlencoded"
    );
  });

  it("backs off to 1 h when the role allows less", async () => {
    const f = fetchMock((url, init) =>
      init.body.includes("DurationSeconds=43200")
        ? { status: 400, body: DURATION_ERR }
        : { status: 200, body: OK_XML }
    );
    const r = await assumeRoleWithSaml(f, {
      ...params,
      durationSeconds: 43200,
    });
    expect(r.ok).toBe(true);
    expect(r.durationSeconds).toBe(3600);
    expect(r.shortened).toBe(true);
    expect(r.requestedSeconds).toBe(43200);
    expect(f).toHaveBeenCalledTimes(2);
  });

  it("stops on a non-duration error", async () => {
    const f = fetchMock(() => ({
      status: 403,
      body: ERR_XML("AccessDenied", "Not authorized"),
    }));
    const r = await assumeRoleWithSaml(f, {
      ...params,
      durationSeconds: 43200,
    });
    expect(r.ok).toBe(false);
    expect(r.code).toBe("AccessDenied");
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("reports a network failure", async () => {
    const f = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    const r = await assumeRoleWithSaml(f, { ...params, durationSeconds: 3600 });
    expect(r).toMatchObject({ ok: false, code: "NetworkError" });
  });
});

describe("assumeMany", () => {
  it("keeps results in order and tags them with the role", async () => {
    const f = fetchMock((url, init) =>
      init.body.includes("role%2Fbad")
        ? { status: 403, body: ERR_XML("AccessDenied", "no") }
        : { status: 200, body: OK_XML }
    );
    const roles = ["a", "bad", "c", "d", "e", "f", "g"].map((n) => ({
      roleArn: `arn:aws:iam::1:role/${n}`,
      principalArn: "arn:aws:iam::1:saml-provider/y",
    }));
    const rs = await assumeMany(
      f,
      roles,
      {
        endpoint: "https://sts.us-east-1.amazonaws.com/",
        assertion: "AAAA",
        durationSeconds: 3600,
      },
      { concurrency: 3 }
    );
    expect(rs).toHaveLength(7);
    expect(rs.map((r) => r.ok)).toEqual([
      true,
      false,
      true,
      true,
      true,
      true,
      true,
    ]);
    expect(rs[1].roleArn).toBe("arn:aws:iam::1:role/bad");
    expect(rs[6].roleArn).toBe("arn:aws:iam::1:role/g");
    expect(f).toHaveBeenCalledTimes(7);
  });
});
