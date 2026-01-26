import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

export class OrgTemplateRepository {
  constructor({ baseDir, logger } = {}) {
    this.baseDir = baseDir ? path.resolve(baseDir) : path.resolve(process.cwd(), "org");
    this.log = logger ?? null;
  }

  isValidOrgName(orgName) {
    return typeof orgName === "string" && /^[A-Za-z0-9_-]+$/.test(orgName);
  }

  async listOrgNames() {
    try {
      const entries = await fs.readdir(this.baseDir, { withFileTypes: true });
      const names = [];
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        if (!this.isValidOrgName(entry.name)) {
          void this.log?.warn?.("跳过非法组织模板目录名", { orgName: entry.name });
          continue;
        }
        names.push(entry.name);
      }
      names.sort((a, b) => a.localeCompare(b));
      return names;
    } catch (err) {
      if (err && (err.code === "ENOENT" || err.code === "ENOTDIR")) return [];
      throw err;
    }
  }

  async listTemplateInfos() {
    const orgNames = await this.listOrgNames();
    const templates = [];
    for (const orgName of orgNames) {
      try {
        const infoMd = await this.readInfo(orgName);
        templates.push({ orgName, infoMd });
      } catch (err) {
        if (err && err.code === "ENOENT") {
          void this.log?.warn?.("组织模板缺少 info.md，已跳过", { orgName });
          continue;
        }
        throw err;
      }
    }
    return templates;
  }

  async readInfo(orgName) {
    this._assertOrgName(orgName);
    const filePath = path.join(this.baseDir, orgName, "info.md");
    return await fs.readFile(filePath, "utf8");
  }

  async writeInfo(orgName, infoMd) {
    this._assertOrgName(orgName);
    if (typeof infoMd !== "string") throw Object.assign(new Error("infoMd 必须是字符串"), { code: "INVALID_INPUT" });
    const dir = path.join(this.baseDir, orgName);
    await fs.mkdir(dir, { recursive: true });
    const filePath = path.join(dir, "info.md");
    await this._atomicWriteUtf8(filePath, infoMd);
  }

  async readOrg(orgName) {
    this._assertOrgName(orgName);
    const filePath = path.join(this.baseDir, orgName, "org.md");
    return await fs.readFile(filePath, "utf8");
  }

  async writeOrg(orgName, orgMd) {
    this._assertOrgName(orgName);
    if (typeof orgMd !== "string") throw Object.assign(new Error("orgMd 必须是字符串"), { code: "INVALID_INPUT" });
    const dir = path.join(this.baseDir, orgName);
    await fs.mkdir(dir, { recursive: true });
    const filePath = path.join(dir, "org.md");
    await this._atomicWriteUtf8(filePath, orgMd);
  }

  async createTemplate(orgName) {
    this._assertOrgName(orgName);
    await fs.mkdir(this.baseDir, { recursive: true });
    const dir = path.join(this.baseDir, orgName);
    await fs.mkdir(dir, { recursive: false });
    await fs.writeFile(path.join(dir, "info.md"), "", "utf8");
    await fs.writeFile(path.join(dir, "org.md"), "", "utf8");
    return { ok: true, orgName };
  }

  async deleteTemplate(orgName) {
    this._assertOrgName(orgName);
    const targetDir = path.join(this.baseDir, orgName);
    const resolvedTarget = path.resolve(targetDir);
    const resolvedBase = path.resolve(this.baseDir);
    if (!resolvedTarget.startsWith(resolvedBase + path.sep)) {
      throw Object.assign(new Error("非法删除路径"), { code: "INVALID_PATH" });
    }
    await fs.rm(resolvedTarget, { recursive: true, force: false });
    return { ok: true, orgName };
  }

  async renameTemplate(orgName, newOrgName) {
    this._assertOrgName(orgName);
    this._assertOrgName(newOrgName);
    if (orgName === newOrgName) return { ok: true, orgName };

    await fs.mkdir(this.baseDir, { recursive: true });

    const fromDir = path.join(this.baseDir, orgName);
    const toDir = path.join(this.baseDir, newOrgName);
    const resolvedFrom = path.resolve(fromDir);
    const resolvedTo = path.resolve(toDir);
    const resolvedBase = path.resolve(this.baseDir);
    if (!resolvedFrom.startsWith(resolvedBase + path.sep) || !resolvedTo.startsWith(resolvedBase + path.sep)) {
      throw Object.assign(new Error("非法重命名路径"), { code: "INVALID_PATH" });
    }

    await fs.rename(resolvedFrom, resolvedTo);
    return { ok: true, oldOrgName: orgName, orgName: newOrgName };
  }

  _assertOrgName(orgName) {
    if (!this.isValidOrgName(orgName)) {
      throw Object.assign(new Error("orgName 非法，只允许字母数字下划线短横线"), { code: "INVALID_ORG_NAME" });
    }
  }

  async _atomicWriteUtf8(filePath, content) {
    const dir = path.dirname(filePath);
    const tmpPath = path.join(dir, `${path.basename(filePath)}.${randomUUID()}.tmp`);
    await fs.writeFile(tmpPath, content, "utf8");
    try {
      await fs.unlink(filePath);
    } catch (err) {
      if (!(err && err.code === "ENOENT")) throw err;
    }
    await fs.rename(tmpPath, filePath);
  }
}
