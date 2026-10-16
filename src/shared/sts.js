// Exchanging a SAML assertion for temporary credentials with AWS STS.
//
// AssumeRoleWithSAML needs no AWS credentials and no signature: the
// assertion is the proof. STS answers with CORS headers open to any origin,
// so the service worker can call it with no host permission. One plain
// form-encoded POST per role; the reply is XML, read with a few patterns
// (the service worker has no DOMParser, and STS's reply shape is fixed).

export const STS_API_VERSION = "2011-06-15";
export const DURATION_MIN = 900;
export const DURATION_MAX = 43200;
export const DURATION_DEFAULT = 3600;

// The regional endpoint of the sign-in's region: regional endpoints issue
// session tokens that work in every region, including opt-in ones, which
// the global endpoint's tokens do not. Partitions have their own hosts.
export function stsEndpoint({ partition = "aws", region = "" } = {}) {
  const r = String(region || "");
  if (partition === "aws-cn") {
    return `https://sts.${r || "cn-north-1"}.amazonaws.com.cn/`;
  }
  if (partition === "aws-us-gov") {
    return `https://sts.${r || "us-gov-west-1"}.amazonaws.com/`;
  }
  if (partition === "aws-iso" || partition === "aws-iso-b") {
    // Air-gapped partitions have no public endpoint we can name; fall back
    // to the conventional shape and let the request fail visibly.
    return `https://sts.${r || "us-iso-east-1"}.c2s.ic.gov/`;
  }
  if (partition === "aws-eusc") {
    return `https://sts.${r || "eusc-de-east-1"}.amazonaws-eusc.eu/`;
  }
  return `https://sts.${r || "us-east-1"}.amazonaws.com/`;
}

export function clampDuration(seconds) {
  const n = Math.floor(Number(seconds));
  if (!Number.isFinite(n)) return DURATION_DEFAULT;
  return Math.min(DURATION_MAX, Math.max(DURATION_MIN, n));
}

// The durations to try, longest first: what was asked, then the common
// role maximum, then the floor. A role whose MaxSessionDuration is shorter
// than the ask rejects it; the next step usually lands.
export function durationPlan(requested) {
  const want = clampDuration(requested);
  const steps = [want, DURATION_DEFAULT, DURATION_MIN].filter((s) => s <= want);
  return [...new Set(steps)].sort((a, b) => b - a);
}

// The POST body. URLSearchParams percent-encodes the assertion's "=" and
// "+", which STS requires (a bare "=" is a MalformedQueryString error).
export function buildAssumeRoleBody({
  roleArn,
  principalArn,
  assertion,
  durationSeconds,
}) {
  const p = new URLSearchParams();
  p.set("Action", "AssumeRoleWithSAML");
  p.set("Version", STS_API_VERSION);
  p.set("RoleArn", roleArn);
  p.set("PrincipalArn", principalArn);
  p.set("SAMLAssertion", String(assertion || "").replace(/\s+/g, ""));
  p.set("DurationSeconds", String(clampDuration(durationSeconds)));
  return p.toString();
}

const tag = (xml, name) => {
  const m = String(xml).match(
    new RegExp(`<(?:\\w+:)?${name}>([^<]*)</(?:\\w+:)?${name}>`)
  );
  return m ? decodeXml(m[1]) : "";
};

function decodeXml(s) {
  return String(s)
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, "&");
}

// STS's reply as a plain object: { ok: true, credentials, ... } or
// { ok: false, code, message }.
export function parseStsResponse(text, status) {
  const xml = String(text || "");
  if (/<Error>/.test(xml) || (status && status >= 400)) {
    return {
      ok: false,
      status: status || 0,
      code: tag(xml, "Code") || (status ? `HTTP ${status}` : "Error"),
      message: tag(xml, "Message") || "STS returned an error",
    };
  }
  const accessKeyId = tag(xml, "AccessKeyId");
  const secretAccessKey = tag(xml, "SecretAccessKey");
  const sessionToken = tag(xml, "SessionToken");
  const expiration = tag(xml, "Expiration");
  if (!accessKeyId || !secretAccessKey || !sessionToken) {
    return {
      ok: false,
      status: status || 0,
      code: "UnexpectedResponse",
      message: "STS replied without credentials",
    };
  }
  return {
    ok: true,
    credentials: { accessKeyId, secretAccessKey, sessionToken, expiration },
    assumedRoleArn: tag(xml, "Arn"),
    assumedRoleId: tag(xml, "AssumedRoleId"),
    subject: tag(xml, "Subject"),
    issuer: tag(xml, "Issuer"),
    audience: tag(xml, "Audience"),
    sourceIdentity: tag(xml, "SourceIdentity"),
  };
}

// True for the one error a shorter duration fixes.
export function isDurationError(err) {
  if (!err || err.ok) return false;
  return /DurationSeconds|MaxSessionDuration/i.test(String(err.message || ""));
}

// What a person should read for each STS error code.
export function explainStsError(err) {
  if (!err) return "";
  const code = String(err.code || "");
  const msg = String(err.message || "");
  if (code === "ExpiredToken" || /expired/i.test(msg)) {
    return "AWS no longer accepts this sign-in. Sign in again at your identity provider and try once more.";
  }
  if (code === "AccessDenied") {
    return "Your identity provider lists this role, but the role's trust policy does not allow sts:AssumeRoleWithSAML for it.";
  }
  if (code === "InvalidIdentityToken") {
    return `AWS rejected the sign-in itself: ${msg}`;
  }
  if (code === "IDPRejectedClaim") {
    return `AWS rejected a claim in the sign-in: ${msg}`;
  }
  if (code === "RegionDisabled") {
    return "STS is disabled in this region for the account. Choose another region in the add-on's settings.";
  }
  if (isDurationError(err)) {
    return `The role allows a shorter session than asked for: ${msg}`;
  }
  if (code === "NetworkError") return `Could not reach AWS STS: ${msg}`;
  return `${code}: ${msg}`;
}

// One role: try each duration in turn. `fetchFn` is fetch (or a test
// double). Returns parseStsResponse's shape plus the duration that worked
// and whether a shorter one had to be used.
export async function assumeRoleWithSaml(
  fetchFn,
  { endpoint, roleArn, principalArn, assertion, durationSeconds }
) {
  const plan = durationPlan(durationSeconds);
  let last = null;
  for (let i = 0; i < plan.length; i++) {
    const seconds = plan[i];
    let res;
    try {
      res = await fetchFn(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: buildAssumeRoleBody({
          roleArn,
          principalArn,
          assertion,
          durationSeconds: seconds,
        }),
      });
    } catch (e) {
      return {
        ok: false,
        code: "NetworkError",
        message: e && e.message ? e.message : String(e),
      };
    }
    const text = await res.text();
    const parsed = parseStsResponse(text, res.status);
    if (parsed.ok) {
      return {
        ...parsed,
        durationSeconds: seconds,
        shortened: i > 0,
        requestedSeconds: plan[0],
      };
    }
    last = parsed;
    if (!isDurationError(parsed)) break;
  }
  return { ...last, requestedSeconds: plan[0] };
}

// Several roles at once, a few in flight at a time, all within the
// assertion's validity window.
export async function assumeMany(
  fetchFn,
  roles,
  common,
  { concurrency = 5 } = {}
) {
  const results = new Array(roles.length);
  let next = 0;
  const worker = async () => {
    while (next < roles.length) {
      const i = next++;
      const r = roles[i];
      results[i] = await assumeRoleWithSaml(fetchFn, {
        ...common,
        roleArn: r.roleArn,
        principalArn: r.principalArn,
      });
      results[i].roleArn = r.roleArn;
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(concurrency, roles.length) }, worker)
  );
  return results;
}
