// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import {
  decodeSamlResponse,
  parseRolePair,
  parseAssertion,
  signinRegionFromHost,
  partitionOf,
  accountOf,
  roleNameOf,
} from "../src/shared/saml.js";

const ROLE = "arn:aws:iam::111122223333:role/PowerUser";
const PROV = "arn:aws:iam::111122223333:saml-provider/Okta";

const assertionXml = ({
  roles = [`${ROLE},${PROV}`],
  duration = "28800",
  notOnOrAfter = "2026-10-15T12:05:00Z",
  encrypted = false,
} = {}) => `<?xml version="1.0"?>
<samlp:Response xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion" IssueInstant="2026-10-15T12:00:00Z" ID="r1">
  <saml:Issuer>https://idp.example.com</saml:Issuer>
  ${
    encrypted
      ? "<saml:EncryptedAssertion><xenc:EncryptedData xmlns:xenc='http://www.w3.org/2001/04/xmlenc#'/></saml:EncryptedAssertion>"
      : `<saml:Assertion IssueInstant="2026-10-15T12:00:01Z" ID="a1">
    <saml:Subject><saml:NameID>tomek</saml:NameID>
      <saml:SubjectConfirmation><saml:SubjectConfirmationData NotOnOrAfter="${notOnOrAfter}" Recipient="https://signin.aws.amazon.com/saml"/></saml:SubjectConfirmation>
    </saml:Subject>
    <saml:Conditions NotOnOrAfter="2026-10-15T13:00:00Z"><saml:AudienceRestriction><saml:Audience>https://signin.aws.amazon.com/saml</saml:Audience></saml:AudienceRestriction></saml:Conditions>
    <saml:AttributeStatement>
      <saml:Attribute Name="https://aws.amazon.com/SAML/Attributes/Role">
        ${roles.map((r) => `<saml:AttributeValue>${r}</saml:AttributeValue>`).join("")}
      </saml:Attribute>
      <saml:Attribute Name="https://aws.amazon.com/SAML/Attributes/RoleSessionName"><saml:AttributeValue>tomek.klas</saml:AttributeValue></saml:Attribute>
      ${duration ? `<saml:Attribute Name="https://aws.amazon.com/SAML/Attributes/SessionDuration"><saml:AttributeValue>${duration}</saml:AttributeValue></saml:Attribute>` : ""}
    </saml:AttributeStatement>
  </saml:Assertion>`
  }
</samlp:Response>`;

const b64 = (s) => btoa(unescape(encodeURIComponent(s)));

describe("decodeSamlResponse", () => {
  it("decodes base64 with whitespace and UTF-8", () => {
    const xml = "<a>Zürich</a>";
    expect(decodeSamlResponse(b64(xml).replace(/(.{10})/g, "$1\n"))).toBe(xml);
  });
  it("unwraps legacy percent-encoded XML", () => {
    expect(decodeSamlResponse(b64(encodeURIComponent("<a/>")))).toBe("<a/>");
  });
  it("is empty for empty input", () => {
    expect(decodeSamlResponse("")).toBe("");
  });
});

describe("parseRolePair", () => {
  it("accepts role,provider and provider,role", () => {
    expect(parseRolePair(`${ROLE},${PROV}`)).toEqual({
      roleArn: ROLE,
      principalArn: PROV,
    });
    expect(parseRolePair(` ${PROV} , ${ROLE} `)).toEqual({
      roleArn: ROLE,
      principalArn: PROV,
    });
  });
  it("accepts other partitions and paths", () => {
    const r = "arn:aws-us-gov:iam::123456789012:role/path/to/Admin";
    const p = "arn:aws-us-gov:iam::123456789012:saml-provider/ADFS";
    expect(parseRolePair(`${r},${p}`)).toEqual({ roleArn: r, principalArn: p });
  });
  it("rejects junk", () => {
    expect(parseRolePair("")).toBeNull();
    expect(parseRolePair(ROLE)).toBeNull();
    expect(parseRolePair(`${ROLE},${ROLE}`)).toBeNull();
    expect(
      parseRolePair("arn:aws:iam::123:role/x,arn:aws:iam::123:saml-provider/y")
    ).toBeNull();
  });
});

describe("parseAssertion", () => {
  it("reads roles, session name, duration, times and issuer", () => {
    const p = parseAssertion(
      assertionXml({
        roles: [
          `${ROLE},${PROV}`,
          `${PROV},arn:aws:iam::444455556666:role/ReadOnly`,
        ],
      })
    );
    expect(p.roles).toEqual([
      { roleArn: ROLE, principalArn: PROV },
      {
        roleArn: "arn:aws:iam::444455556666:role/ReadOnly",
        principalArn: PROV,
      },
    ]);
    expect(p.roleSessionName).toBe("tomek.klas");
    expect(p.sessionDuration).toBe(28800);
    expect(p.issueInstant).toBe(Date.parse("2026-10-15T12:00:00Z"));
    expect(p.notOnOrAfter).toBe(Date.parse("2026-10-15T12:05:00Z"));
    expect(p.issuer).toBe("https://idp.example.com");
    expect(p.audience).toBe("https://signin.aws.amazon.com/saml");
    expect(p.encrypted).toBe(false);
  });
  it("dedupes repeated roles and tolerates a missing SessionDuration", () => {
    const p = parseAssertion(
      assertionXml({
        roles: [`${ROLE},${PROV}`, `${ROLE},${PROV}`],
        duration: "",
      })
    );
    expect(p.roles).toHaveLength(1);
    expect(p.sessionDuration).toBeNull();
  });
  it("flags an encrypted assertion with no roles", () => {
    const p = parseAssertion(assertionXml({ encrypted: true }));
    expect(p.encrypted).toBe(true);
    expect(p.roles).toEqual([]);
  });
  it("survives garbage", () => {
    const p = parseAssertion("not xml at all <<<");
    expect(p.roles).toEqual([]);
  });
});

describe("ARN helpers", () => {
  it("partition, account, role name", () => {
    expect(partitionOf(ROLE)).toBe("aws");
    expect(partitionOf("arn:aws-cn:iam::1:role/x")).toBe("aws-cn");
    expect(accountOf(ROLE)).toBe("111122223333");
    expect(roleNameOf("arn:aws:iam::111122223333:role/path/to/Admin")).toBe(
      "Admin"
    );
    expect(roleNameOf(ROLE)).toBe("PowerUser");
  });
  it("sign-in region from host", () => {
    expect(signinRegionFromHost("eu-west-1.signin.aws.amazon.com")).toBe(
      "eu-west-1"
    );
    expect(signinRegionFromHost("ap-southeast-2.signin.aws.amazon.com")).toBe(
      "ap-southeast-2"
    );
    expect(signinRegionFromHost("signin.aws.amazon.com")).toBeNull();
    expect(signinRegionFromHost("evil.example.com")).toBeNull();
  });
});
