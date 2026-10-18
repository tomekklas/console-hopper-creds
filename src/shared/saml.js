// Reading the SAML response that AWS's role picker holds in its own hidden
// form field. Pure functions: the DOMParser comes in from the caller so this
// runs in the content script (which has one) and in tests (jsdom).
//
// Nothing here keeps or sends the assertion; it is read for the role list,
// the session name, the IdP's requested duration and the validity window.

export const AWS_ATTR_ROLE = "https://aws.amazon.com/SAML/Attributes/Role";
export const AWS_ATTR_SESSION_NAME =
  "https://aws.amazon.com/SAML/Attributes/RoleSessionName";
export const AWS_ATTR_SESSION_DURATION =
  "https://aws.amazon.com/SAML/Attributes/SessionDuration";

// STS redeems a response only within five minutes of its IssueInstant
// ("Token must be redeemed within 5 minutes of issuance"), whatever
// NotOnOrAfter says. 4.5 minutes, as Console Hopper uses for the same check,
// leaves room for clock skew and the calls still in flight.
export const SAML_FRESH_MS = 4.5 * 60 * 1000;

const ROLE_ARN_RE = /^arn:(aws[a-z0-9-]*):iam::(\d{12}):role\/.+$/;
const PROVIDER_ARN_RE = /^arn:(aws[a-z0-9-]*):iam::(\d{12}):saml-provider\/.+$/;

// Base64 (with any whitespace) to the XML text, decoding UTF-8 properly:
// atob() yields one char per byte, so accented IdP strings need a real
// decode. Older IdPs percent-encoded the XML before base64; handle that too.
export function decodeSamlResponse(b64) {
  const clean = String(b64 || "").replace(/\s+/g, "");
  if (!clean) return "";
  const bin = atob(clean);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  let text = new TextDecoder("utf-8").decode(bytes);
  if (/^%3C/i.test(text.trim())) {
    try {
      text = decodeURIComponent(text);
    } catch (e) {
      /* leave as is */
    }
  }
  return text;
}

const localName = (el) =>
  el.localName || String(el.nodeName).replace(/^.*:/, "");
const byLocalName = (root, name) => [...root.getElementsByTagNameNS("*", name)];

// One "roleArn,providerArn" value (either order) to its two ARNs; null when
// the value is not an AWS role pair.
export function parseRolePair(value) {
  const parts = String(value || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length !== 2) return null;
  let roleArn = null;
  let principalArn = null;
  for (const p of parts) {
    if (ROLE_ARN_RE.test(p)) roleArn = p;
    else if (PROVIDER_ARN_RE.test(p)) principalArn = p;
  }
  if (!roleArn || !principalArn) return null;
  return { roleArn, principalArn };
}

export function partitionOf(arn) {
  const m = String(arn || "").match(/^arn:(aws[a-z0-9-]*):/);
  return m ? m[1] : "aws";
}

export function accountOf(arn) {
  const m = String(arn || "").match(/^arn:aws[a-z0-9-]*:iam::(\d{12}):/);
  return m ? m[1] : "";
}

export function roleNameOf(arn) {
  const m = String(arn || "").match(/:role\/(?:.*\/)?([^/]+)$/);
  return m ? m[1] : "";
}

const parseTime = (s) => {
  const t = Date.parse(String(s || ""));
  return Number.isFinite(t) ? t : null;
};

// The facts the add-on needs from a SAML response. `encrypted` is true when
// the assertion is an <EncryptedAssertion>: AWS can decrypt it, we cannot,
// so the role list is empty and the caller says so.
export function parseAssertion(xml, DOMParserImpl) {
  const Parser =
    DOMParserImpl || (typeof DOMParser !== "undefined" ? DOMParser : null);
  if (!Parser) throw new Error("no DOMParser available");
  const doc = new Parser().parseFromString(String(xml || ""), "text/xml");
  const out = {
    roles: [],
    roleSessionName: "",
    sessionDuration: null,
    issueInstant: null,
    notOnOrAfter: null,
    audience: "",
    issuer: "",
    encrypted: byLocalName(doc, "EncryptedAssertion").length > 0,
  };
  if (doc.getElementsByTagName("parsererror").length) return out;

  const response = byLocalName(doc, "Response")[0] || doc.documentElement;
  if (response && response.getAttribute) {
    out.issueInstant = parseTime(response.getAttribute("IssueInstant"));
  }
  const assertion = byLocalName(doc, "Assertion")[0];
  if (assertion) {
    const t = parseTime(assertion.getAttribute("IssueInstant"));
    if (t !== null && out.issueInstant === null) out.issueInstant = t;
  }
  const issuer = byLocalName(doc, "Issuer")[0];
  if (issuer) out.issuer = (issuer.textContent || "").trim();

  for (const scd of byLocalName(doc, "SubjectConfirmationData")) {
    const t = parseTime(scd.getAttribute("NotOnOrAfter"));
    if (t !== null && (out.notOnOrAfter === null || t < out.notOnOrAfter))
      out.notOnOrAfter = t;
  }
  const aud = byLocalName(doc, "Audience")[0];
  if (aud) out.audience = (aud.textContent || "").trim();

  const seen = new Set();
  for (const attr of byLocalName(doc, "Attribute")) {
    if (localName(attr) !== "Attribute") continue;
    const name = attr.getAttribute("Name") || "";
    const values = byLocalName(attr, "AttributeValue").map((v) =>
      (v.textContent || "").trim()
    );
    if (name === AWS_ATTR_ROLE) {
      for (const v of values) {
        const pair = parseRolePair(v);
        if (pair && !seen.has(pair.roleArn)) {
          seen.add(pair.roleArn);
          out.roles.push(pair);
        }
      }
    } else if (name === AWS_ATTR_SESSION_NAME) {
      out.roleSessionName = values[0] || "";
    } else if (name === AWS_ATTR_SESSION_DURATION) {
      const n = parseInt(values[0], 10);
      if (Number.isFinite(n)) out.sessionDuration = n;
    }
  }
  return out;
}

// When AWS stops accepting this response, in ms since the epoch: the
// earlier of NotOnOrAfter and IssueInstant + SAML_FRESH_MS (an IdP may stamp
// NotOnOrAfter ten minutes out, but STS still refuses after five). Null
// when the response says nothing about time.
export function validUntil(parsed) {
  if (!parsed) return null;
  const has = (t) => t !== null && t !== undefined;
  const ends = [];
  if (has(parsed.notOnOrAfter)) ends.push(parsed.notOnOrAfter);
  if (has(parsed.issueInstant)) ends.push(parsed.issueInstant + SAML_FRESH_MS);
  return ends.length ? Math.min(...ends) : null;
}

// "eu-west-1" from "eu-west-1.signin.aws.amazon.com"; null for the global
// host and anything else.
export function signinRegionFromHost(hostname) {
  const m = String(hostname || "").match(
    /^([a-z]{2}(?:-[a-z]+)+-\d)\.signin\.aws\.amazon\.com$/
  );
  return m ? m[1] : null;
}
