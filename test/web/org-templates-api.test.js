import { describe, expect, test, mock } from "bun:test";

describe("Web API org-templates", () => {
  test("API.org-templates：updateOrgTemplateInfo(PUT) 与 renameOrgTemplate(POST) 路由正确", async () => {
    globalThis.window = {};

    const fetchMock = mock(async (url, options) => {
      return {
        ok: true,
        async json() {
          return { ok: true, url, options };
        }
      };
    });
    globalThis.fetch = fetchMock;

    await import("../../web/js/api.js");

    await window.API.updateOrgTemplateInfo("a1", "x");
    await window.API.renameOrgTemplate("a1", "a2");

    expect(fetchMock).toHaveBeenCalled();
    const [url1, options1] = fetchMock.mock.calls[0];
    expect(url1).toBe("/api/org-templates/a1/info");
    expect(options1.method).toBe("PUT");

    const [url2, options2] = fetchMock.mock.calls[1];
    expect(url2).toBe("/api/org-templates/a1/rename");
    expect(options2.method).toBe("POST");
  });
});
