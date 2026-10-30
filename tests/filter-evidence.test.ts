import { describe, expect, it } from "vitest";
import type { LogEvent } from "../src/shared/contracts";
import {
  evaluateFilterEvidence,
  type FilterOrigin,
} from "../src/shared/filter-evidence";
import {
  matchesLocalFilter,
  parseLogMessage,
  propertyFilterTerm,
} from "../src/shared/log-data";

function evidence(
  message: string,
  query: string,
  origin: FilterOrigin = "server",
) {
  const event: LogEvent = {
    id: "evidence",
    message,
    timestamp: 0,
    logGroup: "/application/production",
    logStream: "stream-one",
  };
  return evaluateFilterEvidence(event, parseLogMessage(message), query, origin);
}

function spans(
  message: string,
  query: string,
  path = "@message",
  origin: FilterOrigin = "server",
) {
  return evidence(message, query, origin)
    .matches.filter((match) => match.path === path)
    .map((match) => match.text.slice(match.start, match.end));
}

describe("server JSON filter evidence", () => {
  it("keeps evidence from satisfied OR branches and removes entire false AND branches", () => {
    const message = '{"first":"target","other":"target","status":500}';
    const query =
      '{ $.first = "target" || ($.other = "target" && $.status = 200) }';
    const result = evidence(message, query);
    expect(result.supported).toBe(true);
    expect(result.matched).toBe(true);
    expect(result.paths).toEqual(["/first"]);
    expect(result.matches.filter((match) => match.path === "@message")).toEqual(
      [
        {
          path: "@message",
          text: message,
          start: message.indexOf("target"),
          end: message.indexOf("target") + 6,
        },
      ],
    );
  });

  it("evaluates all predicates before emitting evidence and respects && precedence", () => {
    const message = '{"a":1,"b":2,"c":3}';
    expect(evidence(message, "{ $.a = 1 && $.b = 9 }")).toEqual({
      supported: true,
      matched: false,
      matches: [],
      paths: [],
    });
    expect(
      evidence(message, "{ $.a = 1 || $.b = 9 && $.c = 3 }").paths,
    ).toEqual(["/a"]);
    expect(
      evidence(message, "{ ($.a = 1 || $.b = 9) && $.c = 3 }").paths,
    ).toEqual(["/a", "/c"]);
  });

  it("retains both satisfied OR branches", () => {
    expect(evidence('{"a":1,"b":2}', "{ $.a = 1 || $.b = 2 }").paths).toEqual([
      "/a",
      "/b",
    ]);
  });

  it("maps escaped decoded values to the original property's raw source range", () => {
    const message =
      '  { "lookalike": "line\\nquote\\\"end", "wanted": "line\\nquote\\\"end" }\n';
    const query = '{ $.wanted = "line\\nquote\\\"end" }';
    const result = evidence(message, query);
    expect(result.paths).toEqual(["/wanted"]);
    expect(spans(message, query, "/wanted")).toEqual(['line\nquote"end']);
    expect(spans(message, query)).toEqual(['line\\nquote\\"end']);
    expect(
      result.matches.find((match) => match.path === "@message")!.start,
    ).toBe(message.lastIndexOf("line"));
  });

  it("maps regex substrings through unicode and newline escape boundaries", () => {
    const message = '{"other":"xxfoo\\u0062arzz","value":"xxfoo\\u0062arzz"}';
    const query = "{ $.value = %foobar% }";
    expect(spans(message, query, "/value")).toEqual(["foobar"]);
    expect(spans(message, query)).toEqual(["foo\\u0062ar"]);
    expect(evidence(message, query).paths).toEqual(["/value"]);
  });

  it.each([
    ["=", 500, true],
    ["!=", 500, false],
    [">", 499, true],
    [">=", 500, true],
    ["<", 501, true],
    ["<=", 500, true],
    [">", 500, false],
    ["<", 500, false],
  ] as const)(
    "evaluates numeric %s %s with positive property evidence",
    (operator, value, matched) => {
      const result = evidence(
        '{"code":5e2,"other":500}',
        `{ $.code ${operator} ${value} }`,
      );
      expect(result.supported).toBe(true);
      expect(result.matched).toBe(matched);
      expect(result.paths).toEqual(matched ? ["/code"] : []);
      if (matched)
        expect(
          spans('{"code":5e2,"other":500}', `{ $.code ${operator} ${value} }`),
        ).toEqual(["5e2"]);
    },
  );

  it.each(["1e+3", "+1000", "1000.0"])(
    "supports finite numeric token %s",
    (value) => {
      expect(evidence('{"count":1000}', `{ $.count = ${value} }`).matched).toBe(
        true,
      );
    },
  );

  it.each([
    ["NULL", null],
    ["TRUE", true],
    ["FALSE", false],
  ] as const)(
    "supports IS %s and does not confuse absent or string values",
    (name, value) => {
      const query = `{ $.value IS ${name} }`;
      expect(evidence(JSON.stringify({ value }), query).paths).toEqual([
        "/value",
      ]);
      expect(
        evidence(JSON.stringify({ value: String(value) }), query).matched,
      ).toBe(false);
      expect(evidence("{}", query).matched).toBe(false);
    },
  );

  it.each([true, false, null])(
    "supports literal comparison with %s",
    (value) => {
      expect(
        evidence(JSON.stringify({ value }), `{ $.value = ${value} }`).paths,
      ).toEqual(["/value"]);
    },
  );

  it("matches absence without making up a text span or property path", () => {
    expect(evidence('{"present":null}', "{ $.absent NOT EXISTS }")).toEqual({
      supported: true,
      matched: true,
      matches: [],
      paths: [],
    });
    expect(
      evidence('{"present":null}', "{ $.present NOT EXISTS }").matched,
    ).toBe(false);
    expect(evidence("ordinary text", "{ $.absent NOT EXISTS }").matched).toBe(
      false,
    );
    expect(evidence('{"present":null}', "{ $.absent != 4 }").matched).toBe(
      false,
    );
  });

  it("emits actual values as evidence for successful inequality, not the excluded value", () => {
    expect(
      spans('{"status":201,"other":500}', "{ $.status != 500 }", "/status"),
    ).toEqual(["201"]);
    expect(
      evidence('{"status":201,"other":500}', "{ $.status != 500 }").paths,
    ).toEqual(["/status"]);
  });

  it("supports exact array selectors and singly quoted keys with JSON Pointer escaping", () => {
    const message = '{"items":[{"a/b~":"target"}],"cluster.name":"production"}';
    const result = evidence(
      message,
      "{ $.items[0].['a/b~'] = \"target\" && $.['cluster.name'] = production }",
    );
    expect(result.supported).toBe(true);
    expect(result.paths).toEqual(["/items/0/a~1b~0", "/cluster.name"]);
  });

  it("selects matching array and object wildcard members only", () => {
    const message =
      '{"items":[{"status":200},{"status":500}],"labels":{"a":"ok","b":"bad"}}';
    expect(evidence(message, "{ $.items[*].status >= 400 }").paths).toEqual([
      "/items/1/status",
    ]);
    expect(evidence(message, '{ $.labels.* = "ok" }').paths).toEqual([
      "/labels/a",
    ]);
  });

  it.each([
    ['"prod-*"', "prod-us", true],
    ['"*middle*"', "in-middle-out", true],
    ['"a*b*c"', "axbyc", true],
    ['"a*b*c"', "abc-tail", false],
    ['"ab*bc"', "abc", false],
    ["123.123.*", "123.123.1.7", true],
  ] as const)(
    "matches complete wildcard values %s",
    (pattern, value, matched) => {
      const result = evidence(
        JSON.stringify({ value }),
        `{ $.value = ${pattern} }`,
      );
      expect(result.supported).toBe(true);
      expect(result.matched).toBe(matched);
    },
  );

  it("treats wildcard existence as positive evidence including empty values", () => {
    expect(evidence('{"value":""}', "{ $.value = * }").paths).toEqual([
      "/value",
    ]);
    expect(evidence("{}", "{ $.value = * }").matched).toBe(false);
  });

  it("keeps quoted string wildcards distinct from numeric wildcard tokens", () => {
    expect(evidence('{"value":123}', '{ $.value = "12*" }').matched).toBe(
      false,
    );
    expect(evidence('{"value":123}', "{ $.value = 12* }").paths).toEqual([
      "/value",
    ]);
  });

  it("uses the last duplicate JSON property source and discards stale descendants", () => {
    const message = '{"value":{"stale":"match"},"value":{"actual":"match"}}';
    const query = '{ $.value.actual = "match" }';
    expect(evidence(message, query).paths).toEqual(["/value/actual"]);
    expect(
      evidence(message, query).matches.find(
        (match) => match.path === "@message",
      )!.start,
    ).toBe(message.lastIndexOf("match"));
    expect(evidence(message, '{ $.value.stale = "match" }').matched).toBe(
      false,
    );
  });
});

describe("unstructured server evidence and AWS regex", () => {
  it("supports multiple case-sensitive words and quoted literal phrases", () => {
    expect(
      evidence("ERROR request failed", 'ERROR "request failed"').matched,
    ).toBe(true);
    expect(spans("ERROR request failed", 'ERROR "request failed"')).toEqual([
      "ERROR",
      "request failed",
    ]);
    expect(evidence("error request failed", "ERROR").matched).toBe(false);
    expect(
      evidence("ERROR request succeeded", 'ERROR "request failed"'),
    ).toEqual({ supported: true, matched: false, matches: [], paths: [] });
  });

  it("accepts escaped quotes and punctuation in already compiled plain text", () => {
    const phrase = 'Request "failed" \\ retry';
    expect(spans(phrase, JSON.stringify(phrase))).toEqual([phrase]);
    expect(evidence("production", "stream-one").supported).toBe(false);
  });

  it("maps literal raw JSON value and key hits to their own source atom", () => {
    const message = '{"request":"failed","other":"different"}';
    expect(evidence(message, '"failed"').paths).toEqual(["/request"]);
    expect(spans(message, '"failed"', "/request")).toEqual(["failed"]);
    expect(evidence(message, '"request"').paths).toEqual(["/request"]);
    expect(spans(message, '"request"', "@key/request")).toEqual(["request"]);
    expect(spans(message, '"request"', "/request")).toEqual([]);
  });

  it("keeps key evidence separate from values at pointers ending in #key", () => {
    const message = '{"field":"ordinary","field#key":"target"}';
    expect(spans(message, '"field"', "@key/field")).toEqual(["field"]);
    expect(spans(message, '"field"', "/field#key")).toEqual([]);
    expect(spans(message, '"target"', "/field#key")).toEqual(["target"]);
    expect(spans(message, '"target"', "@key/field")).toEqual([]);
    expect(evidence(message, '"target"').paths).toEqual(["/field#key"]);
    expect(spans(message, '"field#key"', "@key/field#key")).toEqual([
      "field#key",
    ]);
    expect(evidence(message, '"field#key"').paths).toEqual(["/field#key"]);
  });

  it("does not invent decoded matches from the interior of raw JSON escape sequences", () => {
    expect(evidence('{"value":"\\u0061"}', '"u0061"').paths).toEqual([]);
    expect(spans('{"value":"\\u0061"}', '"u0061"')).toEqual(["u0061"]);
  });

  it.each([
    ["%err(or|and)%", false],
    ["%err.*%", true],
    ["%[a-z]+%", true],
    ["%^err$%", true],
    ["%foo|err%", true],
    ["%colou?r%", true],
    ["%[abcx-z]{1,3}%", true],
    ["%a{,3}%", true],
    ["%a{2,}%", true],
    ["%\\d+\\s\\w+%", true],
    ["%\\x28%", true],
    ["%\\[.\\]%", true],
  ] as const)("validates AWS subset %s", (pattern, supported) => {
    expect(evidence("err", pattern).supported).toBe(supported);
  });

  it("uses actual global regex match spans and keeps field scoping", () => {
    expect(spans("E101 E202", "%E[0-9]+%")).toEqual(["E101", "E202"]);
    const message = '{"good":"E101 E202","bad":"E303"}';
    expect(spans(message, "{ $.good = %E[0-9]+% }", "/good")).toEqual([
      "E101",
      "E202",
    ]);
    expect(evidence(message, "{ $.good = %E[0-9]+% }").paths).toEqual([
      "/good",
    ]);
  });

  it("does not generate zero-length regex spans", () => {
    expect(evidence("bbb", "%a*%")).toEqual({
      supported: true,
      matched: true,
      matches: [],
      paths: [],
    });
    expect(evidence('{"value":"bbb"}', "{ $.value = %a*% }").matches).toEqual(
      [],
    );
    expect(evidence("", "%^$%")).toEqual({
      supported: true,
      matched: true,
      matches: [],
      paths: [],
    });
    expect(evidence("text", "%$%")).toEqual({
      supported: true,
      matched: true,
      matches: [],
      paths: [],
    });
  });

  it("does not search AWS filters in log metadata", () => {
    expect(evidence("ordinary message", '"production"').matched).toBe(false);
    expect(evidence("ordinary message", '"stream-one"').matched).toBe(false);
  });
});

describe("strict unsupported handling and resource limits", () => {
  it.each([
    "[ip, status = 500]",
    "[..., status = 500]",
    "?ERROR ?WARN",
    "ERROR -DEBUG",
    "ERROR || WARN",
    "{ $.a = 1 } trailing",
    "{ $.a = 1 || garbage }",
    "{ $.a = 1 || $.b = }",
    '{ $.a["key"] = 1 }',
    "{ $.a[0:2] = 1 }",
    "{ $.a...b = 1 }",
    "{ $.a[*][*] = 1 }",
    "{ $.a EXISTS }",
    "{ $.a IS NOT NULL }",
    "{ $.a > word }",
    "{ $.a = /regex/ }",
    "{ $.a NOTEXISTS }",
    "{ $.a ISNULL }",
    "{ $.a IS TRUEextra }",
    "%a(?=b)%",
    "%a+?%",
    "%a\\1%",
    "%\\bword%",
    "%\\p{L}%",
    "%é%",
    "%a!%",
    "%[a-z%",
    "%a{1001}%",
    "%a{3,2}%",
    "%foo% %bar% %baz%",
    '"unterminated',
  ])("fails closed for %s", (query) => {
    expect(evidence('{"a":1,"b":2}', query)).toEqual({
      supported: false,
      matched: false,
      matches: [],
      paths: [],
    });
  });

  it("rejects unsupported syntax even when another OR branch would match", () => {
    expect(evidence('{"a":1}', "{ $.a = 1 || $.b[0:2] = 2 }").supported).toBe(
      false,
    );
    expect(evidence('{"a":1}', "{ $.a = 1 || $.b = %(a+)+$% }").supported).toBe(
      false,
    );
  });

  it("bounds query, raw message, source node and emitted span work", () => {
    expect(evidence("a", "a ".repeat(129), "local").supported).toBe(false);
    expect(
      evidence('{"a":1}', `{ ${"(".repeat(33)}$.a = 1${")".repeat(33)} }`)
        .supported,
    ).toBe(false);
    expect(evidence("value", "a".repeat(8193)).supported).toBe(false);
    expect(evidence("a".repeat(524_289), '"a"').supported).toBe(false);
    expect(evidence("a ".repeat(2049), "a").supported).toBe(false);
    expect(
      evidence(JSON.stringify(Array.from({ length: 20_001 }, () => 0)), '"0"')
        .supported,
    ).toBe(false);
  });
});

describe("legacy local grammar parity", () => {
  const message = JSON.stringify({
    message: "Request failed",
    key: "Case VALUE",
    user: { id: 7 },
    "a/b~": false,
  });
  it.each([
    "",
    "failed",
    '"Request failed"',
    "FAILED @/user/id=7",
    "@/user/id",
    "@/user/id=8",
    '@"/key"="case value"',
    '@/key="CASE VALUE"',
    "@/a~1b~0=false",
    "production stream-one",
    "missing",
    "failed || Request",
    "%failed%",
    "@/user/id!=7",
    '@"/key"extra="value"',
    '@"not-a-pointer"="value"',
    '@"/key"="invalid\\q"',
    '"unterminated',
  ])("matches matchesLocalFilter for %s", (query) => {
    const event: LogEvent = {
      id: "e",
      timestamp: 0,
      message,
      logGroup: "/application/production",
      logStream: "stream-one",
    };
    const parsed = parseLogMessage(message);
    expect(evaluateFilterEvidence(event, parsed, query, "local").matched).toBe(
      matchesLocalFilter(event, parsed, query, "all"),
    );
  });

  it("does not match hidden metadata for message text searches", () => {
    expect(
      evidence(
        "ordinary message",
        "production stream-one",
        "local",
      ).matches.map((match) => match.path),
    ).toEqual([]);
    expect(
      evidence("ordinary message", "production stream-one", "local").paths,
    ).toEqual([]);
  });

  it("maps quoted pointer values with escapes and does not highlight lookalikes", () => {
    const message = JSON.stringify({
      other: 'line\n"two"',
      'request = "id"': 'line\n"two"',
    });
    const query = propertyFilterTerm('/request = "id"', 'line\n"two"');
    const result = evidence(message, query, "local");
    expect(result.paths).toEqual(['/request = "id"']);
    expect(spans(message, query, "@message", "local")).toEqual([
      'line\\n\\"two\\"',
    ]);
    expect(
      result.matches.find((match) => match.path === "@message")!.start,
    ).toBe(message.lastIndexOf("line"));
  });

  it("supports property existence and scalar roots without manufacturing text for empty strings", () => {
    expect(evidence('"Root VALUE"', '@""="root value"', "local").paths).toEqual(
      [""],
    );
    expect(evidence('{"key":""}', "@/key", "local")).toEqual({
      supported: true,
      matched: true,
      matches: [],
      paths: ["/key"],
    });
    expect(evidence('{"key":null}', "@/key", "local").paths).toEqual(["/key"]);
  });

  it("preserves local substring semantics and correct UTF-16 ranges after case folding", () => {
    const message = "İVALUE Request failed";
    expect(spans(message, "value", "@message", "local")).toEqual(["VALUE"]);
    expect(spans(message, "quest", "@message", "local")).toEqual(["quest"]);
  });

  it("does not publish evidence from any term when the complete local filter fails", () => {
    expect(evidence(message, "failed missing", "local").matches).toEqual([]);
    expect(evidence(message, "failed @/user/id=9", "local").paths).toEqual([]);
  });
});
