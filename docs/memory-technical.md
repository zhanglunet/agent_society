# 记忆系统技术设计文档

## 1. 技术架构概述

### 1.1 技术栈选型

| 组件 | 选型 | 版本要求 | 说明 |
|------|------|----------|------|
| **核心存储** | LevelGraph | ^4.0.0 | 基于LevelDB的嵌入式图数据库 |
| **存储后端** | classic-level | ^1.0.0 | LevelDB的Node.js/Bun适配器 |
| **运行时** | Bun | ≥1.0 | 高性能JavaScript运行时 |
| **压缩服务** | 内置小模型 | - | 独立Worker线程执行 |
| **序列化** | JSON | - | 节点内容存储格式 |

### 1.2 架构图

```
┌─────────────────────────────────────────────────────────────┐
│                      智能体进程                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │   recall()   │  │  关注点管理   │  │   记忆建立流程    │  │
│  │   BFS搜索    │  │   (LRU 5个)  │  │  语义切割→创建节点 │  │
│  └──────┬───────┘  └──────┬───────┘  └────────┬─────────┘  │
│         │                 │                    │            │
│  ┌──────▼─────────────────▼────────────────────▼─────────┐  │
│  │                  MemoryManager                         │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌──────────────┐  │  │
│  │  │  NodeStore  │  │ LinkStore   │  │ FocusManager │  │  │
│  │  │  (节点存储)  │  │  (关联存储)  │  │ (关注点管理) │  │  │
│  │  └──────┬──────┘  └──────┬──────┘  └──────┬───────┘  │  │
│  └─────────┼────────────────┼────────────────┼──────────┘  │
│            │                │                │             │
│  ┌─────────▼────────────────▼────────────────▼──────────┐  │
│  │              LevelGraph (Graph DB)                   │  │
│  │  ┌──────────────────────────────────────────────┐   │  │
│  │  │           classic-level (LevelDB)            │   │  │
│  │  │         (持久化存储，本地文件)                │   │  │
│  │  └──────────────────────────────────────────────┘   │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │         Compression Worker (独立线程)                 │  │
│  │    小模型语义压缩 | 重试15次机制 | 异步执行           │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### 1.3 模块职责

| 模块 | 职责 | 核心功能 |
|------|------|----------|
| **MemoryManager** | 记忆管理入口 | 协调各模块，提供统一API |
| **NodeStore** | 节点存储管理 | CRUD、压缩更新、扫描计数 |
| **LinkStore** | 关联存储管理 | 关联CRUD、衰减计算、断裂检测 |
| **FocusManager** | 关注点管理 | LRU维护、关注点识别、保护机制 |
| **SearchEngine** | 搜索引擎 | BFS实现、关键词匹配、层级控制 |
| **CompressionWorker** | 压缩服务 | 异步压缩、小模型调用、重试机制 |

---

## 2. 数据模型设计

### 2.1 RDF三元组映射

LevelGraph使用RDF三元组（subject-predicate-object）存储，映射到记忆系统概念：

#### 节点属性存储

```turtle
# 节点基本属性
node:{id} rdf:type memory:Node .
node:{id} memory:content "{文本内容}" .
node:{id} memory:phrase "{短语摘要}" .
node:{id} memory:keywords "[关键词数组JSON]" .
node:{id} memory:createdAt "{时间戳}" .
node:{id} memory:scanCount "{扫描次数}" .

# 示例
node:abc123 rdf:type memory:Node .
node:abc123 memory:content "我今天去了公园" .
node:abc123 memory:phrase "去公园" .
node:abc123 memory:keywords "["公园", "今天"]" .
node:abc123 memory:createdAt "1707123456789" .
node:abc123 memory:scanCount "5" .
```

#### 关联存储

```turtle
# 节点间关联（强度作为属性）
node:{from} memory:link node:{to} .
link:{from}:{to} rdf:type memory:Link .
link:{from}:{to} memory:strength "{强度值}" .
link:{from}:{to} memory:relation "{关系名称}" .

# 示例
node:abc123 memory:link node:def456 .
link:abc123:def456 rdf:type memory:Link .
link:abc123:def456 memory:strength "0.8" .
link:abc123:def456 memory:relation "时间顺序" .
```

#### 关注点标记

```turtle
# 关注点存储（单独命名图或特殊标记）
focus:current rdf:type memory:FocusList .
focus:current memory:member node:{id} .
focus:current memory:order "{LRU顺序}" .

# 示例
focus:current memory:member node:abc123 .
focus:current memory:order "1" .
```

### 2.2 存储索引设计

LevelGraph的Hexastore自动创建六重索引，满足以下查询模式：

```javascript
// 1. 查询节点所有属性 (S-P-?)
db.get({ subject: "node:abc123" }, callback);

// 2. 查询特定属性值 (S-?-O)
db.get({ subject: "node:abc123", object: "去公园" }, callback);

// 3. 查询所有关联 (?-P-O)
db.get({ predicate: "memory:link", object: "node:def456" }, callback);

// 4. 查询节点的所有出边 (S-P-?)
db.get({ subject: "node:abc123", predicate: "memory:link" }, callback);
```

### 2.3 数据文件结构

```
memory_data/
├── nodes/                    # 节点数据（LevelDB内部管理）
├── links/                    # 关联数据
├── index/                    # 索引数据
└── meta.json                 # 元数据（版本、统计信息）
```

---

## 3. 核心模块实现

### 3.1 NodeStore - 节点存储

```typescript
interface Node {
  id: string;                 // 唯一标识符
  content: string;            // 内容文本
  phrase: string;             // 短语摘要
  keywords: string[];         // 关键词列表
  createdAt: number;          // 创建时间戳
  scanCount: number;          // 扫描次数
}

class NodeStore {
  private db: LevelGraph;
  
  // 创建节点
  async createNode(content: string, keywords: string[]): Promise<Node> {
    const id = generateUUID();
    const node: Node = {
      id,
      content,
      phrase: await this.extractPhrase(content),
      keywords,
      createdAt: Date.now(),
      scanCount: 0
    };
    
    // 存储三元组
    await this.db.put([
      { subject: `node:${id}`, predicate: "rdf:type", object: "memory:Node" },
      { subject: `node:${id}`, predicate: "memory:content", object: content },
      { subject: `node:${id}`, predicate: "memory:phrase", object: node.phrase },
      { subject: `node:${id}`, predicate: "memory:keywords", object: JSON.stringify(keywords) },
      { subject: `node:${id}`, predicate: "memory:createdAt", object: String(node.createdAt) },
      { subject: `node:${id}`, predicate: "memory:scanCount", object: "0" }
    ]);
    
    return node;
  }
  
  // 获取节点（带懒删除检测）
  async getNode(id: string): Promise<Node | null> {
    const triples = await this.db.get({ subject: `node:${id}` });
    if (triples.length === 0) return null;
    
    return this.parseNode(triples);
  }
  
  // 更新内容（压缩后）
  async updateContent(id: string, newContent: string): Promise<void> {
    // LevelGraph不支持直接更新，需要删除后重新插入
    await this.db.del({ subject: `node:${id}`, predicate: "memory:content" });
    await this.db.put([
      { subject: `node:${id}`, predicate: "memory:content", object: newContent }
    ]);
  }
  
  // 增加扫描次数
  async incrementScanCount(id: string): Promise<void> {
    const node = await this.getNode(id);
    if (!node) return;
    
    const newCount = node.scanCount + 1;
    await this.db.del({ subject: `node:${id}`, predicate: "memory:scanCount" });
    await this.db.put([
      { subject: `node:${id}`, predicate: "memory:scanCount", object: String(newCount) }
    ]);
  }
  
  // 删除节点（重要性=0时调用）
  async deleteNode(id: string): Promise<void> {
    // 策略：直接删除节点三元组，不处理关联
    // 指向该节点的关联变成"悬垂关联"，在遍历时发现并清理
    const triples = await this.db.get({ subject: `node:${id}` });
    for (const triple of triples) {
      await this.db.del(triple);
    }
    // 注意：不删除指向该节点的关联（link:xxx三元组），由懒删除机制处理
  }
  
  // ========== 固定节点数方案专用方法 ==========
  
  // 创建槽位（预分配固定节点池）
  async createSlot(slotId: string): Promise<void> {
    await this.db.put([
      { subject: `slot:${slotId}`, predicate: "rdf:type", object: "memory:Slot" },
      { subject: `slot:${slotId}`, predicate: "memory:status", object: "free" }
    ]);
  }
  
  // 激活槽位（将空闲槽位变为可用节点）
  async activateSlot(slotId: string, content: string, keywords: string[]): Promise<string> {
    const nodeId = generateUUID();  // 生成新ID
    
    await this.db.put([
      { subject: `slot:${slotId}`, predicate: "memory:status", object: "active" },
      { subject: `slot:${slotId}`, predicate: "memory:nodeId", object: nodeId },
      { subject: `node:${nodeId}`, predicate: "rdf:type", object: "memory:Node" },
      { subject: `node:${nodeId}`, predicate: "memory:slot", object: slotId },
      { subject: `node:${nodeId}`, predicate: "memory:content", object: content },
      { subject: `node:${nodeId}`, predicate: "memory:keywords", object: JSON.stringify(keywords) },
      { subject: `node:${nodeId}`, predicate: "memory:createdAt", object: String(Date.now()) }
    ]);
    
    return nodeId;
  }
  
  // 复用槽位（清空旧数据，生成新ID）
  async reuseSlot(slotId: string, content: string, keywords: string[]): Promise<string> {
    // 1. 获取旧节点ID
    const oldTriples = await this.db.get({ 
      subject: `slot:${slotId}`, 
      predicate: "memory:nodeId" 
    });
    const oldNodeId = oldTriples[0]?.object;
    
    // 2. 删除旧节点数据（关联不处理，变成悬垂关联）
    if (oldNodeId) {
      const nodeTriples = await this.db.get({ subject: `node:${oldNodeId}` });
      for (const triple of nodeTriples) {
        await this.db.del(triple);
      }
    }
    
    // 3. 生成新ID，激活槽位
    const newNodeId = generateUUID();
    
    await this.db.put([
      { subject: `slot:${slotId}`, predicate: "memory:nodeId", object: newNodeId },
      { subject: `node:${newNodeId}`, predicate: "rdf:type", object: "memory:Node" },
      { subject: `node:${newNodeId}`, predicate: "memory:slot", object: slotId },
      { subject: `node:${newNodeId}`, predicate: "memory:content", object: content },
      { subject: `node:${newNodeId}`, predicate: "memory:keywords", object: JSON.stringify(keywords) },
      { subject: `node:${newNodeId}`, predicate: "memory:createdAt", object: String(Date.now()) }
    ]);
    
    return newNodeId;
  }
  
  // 获取所有槽位（用于固定节点数方案的随机采样）
  async getAllSlots(): Promise<string[]> {
    const stream = this.db.getStream({ predicate: "rdf:type", object: "memory:Slot" });
    const slots: string[] = [];
    
    for await (const triple of stream) {
      const slotId = triple.subject.replace("slot:", "");
      slots.push(slotId);
    }
    
    return slots;
  }
  
  // 获取所有节点（用于压缩扫描）
  async getAllNodes(): Promise<Node[]> {
    const stream = this.db.getStream({ predicate: "rdf:type", object: "memory:Node" });
    const nodes: Node[] = [];
    
    for await (const triple of stream) {
      const nodeId = triple.subject.replace("node:", "");
      const node = await this.getNode(nodeId);
      if (node) nodes.push(node);
    }
    
    return nodes;
  }
}
```

### 3.2 关联建立机制设计（技术实现视角）

记忆系统**不暴露关联创建API给用户**，所有关联在节点创建过程中由系统自动建立。

#### 技术架构设计

**1. 关联创建的代码路径**

```typescript
// 唯一入口：createMemory() 方法
async createMemory(content: string, keywords: string[], relatedNodes?: string[]) {
  // Step 1: 创建节点（调用小模型提取摘要和关键词）
  const node = await this.nodeStore.createNode(content);
  
  // Step 2: 自动建立时间顺序关联
  // 新节点与当前所有关注点建立双向强度1.0关联
  const focusList = this.focusManager.getFocusList();
  for (const focusId of focusList) {
    await this.linkStore.createLink(node.id, focusId, 1.0, "focus-link");
    await this.linkStore.createLink(focusId, node.id, 1.0, "focus-link");
  }
  
  // Step 3: 自动建立语义连贯关联
  // 与同一切割来源的节点建立双向强度0.5关联
  if (relatedNodes) {
    for (const relatedId of relatedNodes) {
      await this.linkStore.createLink(node.id, relatedId, 0.5, "segment-link");
    }
  }
}
```

**2. 时间顺序关联的技术实现**

时间顺序不通过`createdAt`时间戳排序，而是通过**关注点链表**的LRU顺序体现：

```typescript
// FocusManager内部维护关注点链表
class FocusManager {
  private focusList: string[] = [];  // LRU顺序，最新在最后
  
  async addFocus(nodeId: string) {
    // 如果已存在，移到队尾（最新）
    this.focusList = this.focusList.filter(id => id !== nodeId);
    this.focusList.push(nodeId);
    
    // 超过5个时，移除队首（最老）
    if (this.focusList.length > 5) {
      this.focusList.shift();
    }
  }
}
```

**时间链条的形成**：
```
创建A → A成为关注点 [A]
创建B → B关联A，A被挤出 [B]（如果A不再被提起）
或     → B关联A，A保留 [A,B]（如果A仍是关注点）
```

**3. 语义切割关联的技术实现**

语义切割服务返回段落数组，建立段落间的线性关联：

```typescript
// 语义切割后的关联建立
const segments = await semanticCut(text);  // ["段1", "段2", "段3"]
const nodeIds: string[] = [];

for (let i = 0; i < segments.length; i++) {
  // 创建节点，传入之前已创建的节点ID作为relatedNodes
  const nodeId = await memory.createMemory(
    segments[i], 
    [], 
    nodeIds  // 与之前所有段落建立关联
  );
  nodeIds.push(nodeId);
}
```

形成的关联结构：
```
段1节点 ←→ 段2节点 ←→ 段3节点
 (0.5)     (0.5)     (0.5)
```

**4. 副本独立性的数据模型**

每个节点是独立的RDF资源，即使内容相似也是不同实体：

```turtle
# 节点A（旧记忆）
node:abc memory:content "我喜欢苹果" .
node:abc memory:keywords "["苹果", "喜欢"]" .

# 节点B（新副本，内容相似但独立）
node:def memory:content "我喜欢苹果" .
node:def memory:keywords "["苹果", "喜欢"]" .

# 两者都关联到同一个关注点（通过关键词映射）
focus:current memory:member node:abc .
focus:current memory:member node:def .
```

删除节点A的三元组不影响节点B的存在：
```typescript
// 删除节点A
await db.del({ subject: "node:abc" });  // 只删除abc的三元组
// node:def 的所有三元组保持不变
```

**5. 隐含关联的BFS发现机制**

隐含关联不存储在数据库中，而是在查询时通过BFS遍历动态发现：

```typescript
async function searchFromFocus(focusId: string, depth: number) {
  const queue = [{ nodeId: focusId, distance: 0 }];
  const visited = new Set();
  const results = [];
  
  while (queue.length > 0) {
    const { nodeId, distance } = queue.shift()!;
    if (visited.has(nodeId) || distance > depth) continue;
    visited.add(nodeId);
    
    // 获取节点内容用于关键词匹配
    const node = await nodeStore.getNode(nodeId);
    results.push(node);
    
    // 沿关联扩展（发现隐含关联）
    const links = await linkStore.getNodeLinks(nodeId);
    for (const link of links) {
      if (!visited.has(link.to)) {
        queue.push({ nodeId: link.to, distance: distance + 1 });
      }
    }
  }
  
  return results;
}
```

**性能考虑**：
- 不预计算所有节点间的隐含关联（避免O(n²)复杂度）
- 查询时才遍历，利用LevelGraph的索引加速邻接节点查找
- BFS深度限制（默认2层）控制查询复杂度

### 3.3 LinkStore - 关联存储

```typescript
interface Link {
  from: string;               // 源节点ID
  to: string;                 // 目标节点ID
  strength: number;           // 关联强度 [0,1]
  relation?: string;          // 关系名称（可选）
}

class LinkStore {
  private db: LevelGraph;
  private decayRate: number = 0.97;  // 默认衰减速率
  
  // 创建关联
  async createLink(from: string, to: string, strength: number, relation?: string): Promise<void> {
    const linkId = `link:${from}:${to}`;
    
    await this.db.put([
      { subject: `node:${from}`, predicate: "memory:link", object: `node:${to}` },
      { subject: linkId, predicate: "rdf:type", object: "memory:Link" },
      { subject: linkId, predicate: "memory:strength", object: String(strength) },
      { subject: linkId, predicate: "memory:relation", object: relation || "" }
    ]);
  }
  
  // 获取关联强度
  async getLinkStrength(from: string, to: string): Promise<number> {
    const linkId = `link:${from}:${to}`;
    const triples = await this.db.get({ subject: linkId, predicate: "memory:strength" });
    
    if (triples.length === 0) return 0;
    return parseFloat(triples[0].object);
  }
  
  // 获取节点的所有关联
  async getNodeLinks(nodeId: string): Promise<Link[]> {
    // 出边
    const outgoing = await this.db.get({ 
      subject: `node:${nodeId}`, 
      predicate: "memory:link" 
    });
    
    const links: Link[] = [];
    for (const triple of outgoing) {
      const toId = triple.object.replace("node:", "");
      const strength = await this.getLinkStrength(nodeId, toId);
      
      if (strength >= 0.01) {  // 断裂阈值
        links.push({ from: nodeId, to: toId, strength });
      }
    }
    
    return links;
  }
  
  // 计算重要性（所有关联强度之和）
  async calculateImportance(nodeId: string): Promise<number> {
    const links = await this.getNodeLinks(nodeId);
    return links.reduce((sum, link) => sum + link.strength, 0);
  }
  
  // 衰减所有关联（压缩时调用）
  async decayAllLinks(nodeId: string): Promise<void> {
    const links = await this.getNodeLinks(nodeId);
    
    for (const link of links) {
      const newStrength = link.strength * this.decayRate;
      
      if (newStrength < 0.01) {
        // 断裂：删除关联
        await this.deleteLink(link.from, link.to);
      } else {
        // 更新强度
        await this.updateLinkStrength(link.from, link.to, newStrength);
      }
    }
  }
  
  // 更新关联强度
  private async updateLinkStrength(from: string, to: string, strength: number): Promise<void> {
    const linkId = `link:${from}:${to}`;
    await this.db.del({ subject: linkId, predicate: "memory:strength" });
    await this.db.put([
      { subject: linkId, predicate: "memory:strength", object: String(strength) }
    ]);
  }
  
  // 删除关联
  async deleteLink(from: string, to: string): Promise<void> {
    const linkId = `link:${from}:${to}`;
    
    // 删除所有相关三元组
    const triples = await this.db.get({ subject: linkId });
    for (const triple of triples) {
      await this.db.del(triple);
    }
    
    // 删除节点间关联
    await this.db.del({ 
      subject: `node:${from}`, 
      predicate: "memory:link", 
      object: `node:${to}` 
    });
  }
  
  /**
   * 悬空关联检测（访问时标记）
   * 
   * 当从nodeId出发遍历时，检查所有出边关联的目标节点是否存在。
   * 如果目标节点已被删除（重要性=0时被删除），该关联成为"悬空关联"，
   * 但不会被删除——悬空关联表达了"曾经知道但已遗忘"的语义。
   * 
   * 返回值中包含悬空关联信息，供调用方感知"曾经记得"的状态。
   */
  async detectBrokenLinks(nodeId: string): Promise<{
    validLinks: Link[];
    danglingLinks: Array<{ to: string; strength: number; relation?: string }>;
  }> {
    const outgoing = await this.db.get({ 
      subject: `node:${nodeId}`, 
      predicate: "memory:link" 
    });
    
    const validLinks: Link[] = [];
    const danglingLinks: Array<{ to: string; strength: number; relation?: string }> = [];
    
    for (const triple of outgoing) {
      const toId = triple.object.replace("node:", "");
      const linkId = `link:${nodeId}:${toId}`;
      const strength = await this.getLinkStrength(nodeId, toId);
      const relation = await this.getLinkRelation(nodeId, toId);
      
      const targetExists = await this.nodeExists(toId);
      
      if (!targetExists) {
        // 目标节点已不存在，记录为悬空关联
        // 不删除，保留"曾经知道"的语义
        danglingLinks.push({ to: toId, strength, relation });
      } else if (strength >= 0.01) {
        // 目标存在且强度未断裂
        validLinks.push({ from: nodeId, to: toId, strength, relation });
      }
      // 强度 < 0.01 的关联已在衰减时删除，不会走到这里
    }
    
    return { validLinks, danglingLinks };
  }
  
  // 获取关联的关系名称
  private async getLinkRelation(from: string, to: string): Promise<string | undefined> {
    const linkId = `link:${from}:${to}`;
    const triples = await this.db.get({ subject: linkId, predicate: "memory:relation" });
    
    if (triples.length === 0) return undefined;
    const relation = triples[0].object;
    return relation || undefined;
  }
  
  private async nodeExists(nodeId: string): Promise<boolean> {
    const triples = await this.db.get({ 
      subject: `node:${nodeId}`, 
      predicate: "rdf:type" 
    });
    return triples.length > 0;
  }
}
```

### 3.4 FocusManager - 关注点管理

```typescript
class FocusManager {
  private db: LevelGraph;
  private maxFocusCount: number = 5;
  private focusList: string[] = [];  // 内存缓存，LRU顺序
  
  // 初始化时从磁盘加载关注点列表
  async initialize(): Promise<void> {
    const focusTriples = await this.db.get({ 
      subject: "focus:current",
      predicate: "memory:member" 
    });
    
    // 按order排序
    const ordered: Array<{ nodeId: string; order: number }> = [];
    for (const triple of focusTriples) {
      const nodeId = triple.object.replace("node:", "");
      const orderTriples = await this.db.get({
        subject: "focus:current",
        predicate: "memory:order",
        object: nodeId
      });
      const order = orderTriples.length > 0 
        ? parseInt(orderTriples[0].object) 
        : 999;
      ordered.push({ nodeId, order });
    }
    
    ordered.sort((a, b) => a.order - b.order);
    this.focusList = ordered.map(o => o.nodeId);
  }
  
  // 获取当前关注点列表
  getFocusList(): string[] {
    return [...this.focusList];
  }
  
  // 判断是否为关注点
  isFocus(nodeId: string): boolean {
    return this.focusList.includes(nodeId);
  }
  
  // 添加关注点（从recall关键词提取）
  async addFocus(nodeId: string): Promise<void> {
    // 如果已存在，移到最新
    if (this.focusList.includes(nodeId)) {
      this.focusList = this.focusList.filter(id => id !== nodeId);
    }
    
    // 如果超过上限，淘汰最老的
    if (this.focusList.length >= this.maxFocusCount) {
      const removed = this.focusList.shift();  // 移除最老的
      if (removed) {
        await this.removeFocusFromStorage(removed);
      }
    }
    
    // 添加到最新
    this.focusList.push(nodeId);
    await this.saveFocusList();
    
    // 与关注点建立强度为1的关联（保护机制）
    await this.establishFocusLinks(nodeId);
  }
  
  // 与当前所有关注点建立关联（强度1.0）
  private async establishFocusLinks(newFocusId: string): Promise<void> {
    for (const focusId of this.focusList) {
      if (focusId !== newFocusId) {
        // 建立双向强度为1的关联
        await this.linkStore.createLink(newFocusId, focusId, 1.0, "focus-link");
        await this.linkStore.createLink(focusId, newFocusId, 1.0, "focus-link");
      }
    }
  }
  
  // 保存关注点列表到存储
  private async saveFocusList(): Promise<void> {
    // 清空旧列表
    const oldTriples = await this.db.get({ subject: "focus:current" });
    for (const triple of oldTriples) {
      await this.db.del(triple);
    }
    
    // 保存新列表
    for (let i = 0; i < this.focusList.length; i++) {
      await this.db.put([
        { 
          subject: "focus:current", 
          predicate: "memory:member", 
          object: `node:${this.focusList[i]}` 
        },
        { 
          subject: "focus:current", 
          predicate: "memory:order", 
          object: String(i + 1) 
        }
      ]);
    }
  }
  
  // 从存储中移除关注点
  private async removeFocusFromStorage(nodeId: string): Promise<void> {
    await this.db.del({
      subject: "focus:current",
      predicate: "memory:member",
      object: `node:${nodeId}`
    });
  }
}
```

### 3.5 SearchEngine - 搜索引擎（BFS实现）

```typescript
class SearchEngine {
  private nodeStore: NodeStore;
  private linkStore: LinkStore;
  private focusManager: FocusManager;
  
  // BFS搜索
  async search(
    keywords: string[],
    relations: string[],
    depth: number
  ): Promise<Array<{ node: Node; matched: boolean }>> {
    const focusList = this.focusManager.getFocusList();
    const results: Map<string, { node: Node; matched: boolean; distance: number }> = new Map();
    
    // 从每个关注点开始进行BFS
    for (const focusId of focusList) {
      await this.bfsFromNode(focusId, depth, keywords, relations, results);
    }
    
    // 转换为数组，按距离排序
    return Array.from(results.values())
      .sort((a, b) => a.distance - b.distance)
      .map(({ node, matched }) => ({ node, matched }));
  }
  
  private async bfsFromNode(
    startId: string,
    maxDepth: number,
    keywords: string[],
    relations: string[],
    results: Map<string, { node: Node; matched: boolean; distance: number }>
  ): Promise<void> {
    const visited = new Set<string>();
    const queue: Array<{ nodeId: string; distance: number }> = [
      { nodeId: startId, distance: 0 }
    ];
    
    while (queue.length > 0) {
      const { nodeId, distance } = queue.shift()!;
      
      if (visited.has(nodeId) || distance > maxDepth) continue;
      visited.add(nodeId);
      
      // 懒删除检测
      await this.linkStore.cleanupBrokenLinks(nodeId);
      
      const node = await this.nodeStore.getNode(nodeId);
      if (!node) continue;  // 节点已被删除
      
      // 检查是否匹配
      const matched = this.matchNode(node, keywords, relations);
      
      // 如果未记录或距离更短，更新结果
      const existing = results.get(nodeId);
      if (!existing || existing.distance > distance) {
        results.set(nodeId, { node, matched, distance });
      }
      
      // 扩展到下一层
      if (distance < maxDepth) {
        const links = await this.linkStore.getNodeLinks(nodeId);
        for (const link of links) {
          if (!visited.has(link.to)) {
            queue.push({ nodeId: link.to, distance: distance + 1 });
          }
        }
      }
    }
  }
  
  private matchNode(node: Node, keywords: string[], relations: string[]): boolean {
    // 关键词匹配
    if (keywords.length > 0) {
      const text = (node.content + " " + node.keywords.join(" ")).toLowerCase();
      const matched = keywords.some(kw => text.includes(kw.toLowerCase()));
      if (!matched) return false;
    }
    
    // 关系筛选（可选）
    if (relations.length > 0) {
      // 获取节点的关联关系名称
      const nodeRelations = await this.linkStore.getNodeLinks(node.id);
      const hasRelation = nodeRelations.some(link => 
        link.relation && relations.includes(link.relation)
      );
      if (!hasRelation) return false;
    }
    
    return true;
  }
}
```

---

## 4. 压缩模块实现

### 4.1 CompressionWorker - 异步压缩服务

```typescript
// worker.ts - 压缩Worker线程
import { parentPort } from "worker_threads";

interface CompressionTask {
  nodeId: string;
  content: string;
  targetLength: number;
}

interface CompressionResult {
  nodeId: string;
  success: boolean;
  compressedContent?: string;
  error?: string;
}

// 模拟小模型压缩（实际项目中接入真实模型）
async function compressWithModel(
  content: string, 
  targetLength: number
): Promise<string> {
  // 重试15次机制
  const maxRetries = 15;
  let lastError: Error | null = null;
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      // 实际调用小模型API
      const result = await callSmallModel(content, targetLength);
      return result;
    } catch (error) {
      lastError = error as Error;
      // 指数退避重试
      await sleep(Math.min(1000 * Math.pow(2, i), 30000));
    }
  }
  
  throw new Error(`压缩失败，已重试${maxRetries}次: ${lastError?.message}`);
}

async function callSmallModel(content: string, targetLength: number): Promise<string> {
  // 实际实现：调用OpenAI API或其他小模型
  // 这里使用简单的截断作为示例
  if (content.length <= targetLength) return content;
  
  // 实际应该使用模型进行语义压缩
  return content.substring(0, targetLength);
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Worker消息处理
parentPort?.on("message", async (task: CompressionTask) => {
  try {
    const compressed = await compressWithModel(task.content, task.targetLength);
    const result: CompressionResult = {
      nodeId: task.nodeId,
      success: true,
      compressedContent: compressed
    };
    parentPort?.postMessage(result);
  } catch (error) {
    const result: CompressionResult = {
      nodeId: task.nodeId,
      success: false,
      error: (error as Error).message
    };
    parentPort?.postMessage(result);
  }
});
```

### 4.2 CompressionScheduler - 压缩调度器

提供两种实现方案，根据性能和资源需求选择。

#### 方案A：固定节点数（推荐，性能优先）

```typescript
class FixedNodeCompressionScheduler {
  private nodeStore: NodeStore;
  private linkStore: LinkStore;
  private focusManager: FocusManager;
  private worker: Worker;
  private maxNodes: number = 10000;  // 固定节点数上限
  private nodeSlots: string[] = [];   // 节点槽位数组
  
  // 初始化时创建固定槽位
  async initialize(): Promise<void> {
    for (let i = 0; i < this.maxNodes; i++) {
      const slotId = `slot:${i}`;
      this.nodeSlots.push(slotId);
      // 预创建空槽位标记
      await this.nodeStore.createSlot(slotId);
    }
  }
  
  // 获取或创建节点（复用最不重要的槽位）
  async getOrCreateNode(content: string, keywords: string[]): Promise<string> {
    // 1. 查找空闲槽位
    const freeSlot = await this.findFreeSlot();
    if (freeSlot) {
      return await this.nodeStore.activateSlot(freeSlot, content, keywords);
    }
    
    // 2. 无空闲槽位，找到最不重要的节点进行复用
    const slotToReuse = await this.findLeastImportantSlot();
    
    // 3. 复用槽位：
    // - 生成新ID（旧ID关联自然失效）
    // - 清空旧数据
    // - 断开旧关联（懒删除，实际在cleanup时处理）
    // - 写入新数据
    const newNodeId = await this.nodeStore.reuseSlot(slotToReuse, content, keywords);
    
    // 4. 旧关联指向旧ID，物理位置相同但ID已变，识别为"已遗忘"
    return newNodeId;
  }
  
  // 找到最不重要的槽位（随机采样估计，无需精确排序）
  private async findLeastImportantSlot(): Promise<string> {
    // 策略1：随机采样100个节点，返回重要性最低的
    const sampleSize = Math.min(100, this.nodeSlots.length);
    const samples = this.getRandomSamples(this.nodeSlots, sampleSize);
    
    let minImportance = Infinity;
    let leastImportantSlot = samples[0];
    
    for (const slot of samples) {
      const importance = await this.linkStore.calculateImportance(slot);
      if (importance < minImportance) {
        minImportance = importance;
        leastImportantSlot = slot;
      }
    }
    
    return leastImportantSlot;
  }
  
  // 随机采样（无需加载全部节点）
  private getRandomSamples<T>(array: T[], count: number): T[] {
    const shuffled = [...array].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, count);
  }
  
  // 压缩流程：重要性低的优先压缩（同样采样估计）
  async runCompressionSlice(): Promise<void> {
    // 随机采样一批节点进行压缩
    const sampleSize = 100;
    const samples = this.getRandomSamples(this.nodeSlots, sampleSize);
    
    // 按重要性排序（近似排序，接受一定误差）
    const nodesWithImportance = await Promise.all(
      samples.map(async (slot) => ({
        slot,
        importance: await this.linkStore.calculateImportance(slot)
      }))
    );
    
    nodesWithImportance.sort((a, b) => a.importance - b.importance);
    
    // 压缩重要性低的节点
    for (const { slot, importance } of nodesWithImportance) {
      if (importance < 1) {  // 不压缩受保护的节点
        await this.compressSlot(slot, importance);
      }
    }
  }
  
  private async compressSlot(slot: string, importance: number): Promise<void> {
    // 压缩逻辑：重要性越低，压缩比例越大
    // ... 调用Worker进行压缩
  }
}
```

**方案A优势**：
- 内存占用固定，无无限增长风险
- 无需维护全局排序，O(1)采样即可
- 旧ID自然失效，无需主动清理关联

#### 方案B：扫描次数排序（精确优先）

```typescript
class ScanCountCompressionScheduler {
  private nodeStore: NodeStore;
  private linkStore: LinkStore;
  private focusManager: FocusManager;
  private worker: Worker;
  private timeSlice: number = 30000;  // 30秒时间片
  private deleteThreshold: number = 10;
  
  // 按扫描次数排序的节点队列（扫描次数少的优先）
  // 注意：大数据量时性能可能下降，可考虑随机采样估计
  async getCompressionQueue(): Promise<string[]> {
    const nodes = await this.nodeStore.getAllNodes();
    
    // 过滤掉关注点（不受压缩）
    const focusList = this.focusManager.getFocusList();
    const compressibleNodes = nodes.filter(n => !focusList.includes(n.id));
    
    // 按扫描次数排序（少的先处理）
    // 性能优化：大数据量时可改用桶排序或随机采样
    compressibleNodes.sort((a, b) => a.scanCount - b.scanCount);
    
    return compressibleNodes.map(n => n.id);
  }
  
  // 执行一轮压缩（一个时间片）
  async runCompressionSlice(): Promise<void> {
    const queue = await this.getCompressionQueue();
    const startTime = Date.now();
    
    for (const nodeId of queue) {
      // 检查时间片是否结束
      if (Date.now() - startTime >= this.timeSlice) {
        console.log("时间片结束，暂停压缩");
        break;
      }
      
      await this.compressNode(nodeId);
    }
  }
  
  // 压缩单个节点
  private async compressNode(nodeId: string): Promise<void> {
    const node = await this.nodeStore.getNode(nodeId);
    if (!node) return;
    
    // 1. 计算重要性
    const importance = await this.linkStore.calculateImportance(nodeId);
    
    // 2. 重要性 >= 1，受保护，不压缩
    if (importance >= 1) {
      await this.nodeStore.incrementScanCount(nodeId);
      return;
    }
    
    // 3. 重要性 = 0，直接删除节点（关联不处理，由懒删除机制清理）
    if (importance === 0) {
      // NodeStore.deleteNode() 只删除节点三元组，不删除指向它的关联
      // 指向该节点的关联将在下次遍历时通过cleanupBrokenLinks()清理
      await this.nodeStore.deleteNode(nodeId);
      return;
    }
    
    // 4. 计算目标字数
    const targetLength = Math.floor(node.content.length * Math.min(importance, 1));
    
    // 5. 字数 < 删除阈值，直接删除
    if (targetLength < this.deleteThreshold) {
      await this.nodeStore.deleteNode(nodeId);
      return;
    }
    
    // 6. 目标字数与原文相同，不压缩
    if (targetLength >= node.content.length) {
      await this.nodeStore.incrementScanCount(nodeId);
      return;
    }
    
    // 7. 异步压缩
    const result = await this.callCompressionWorker(nodeId, node.content, targetLength);
    
    if (result.success && result.compressedContent) {
      await this.nodeStore.updateContent(nodeId, result.compressedContent);
    }
    
    // 8. 关联强度衰减（无论压缩是否成功）
    await this.linkStore.decayAllLinks(nodeId);
    
    // 9. 增加扫描次数
    await this.nodeStore.incrementScanCount(nodeId);
  }
  
  // 调用Worker进行压缩
  private callCompressionWorker(
    nodeId: string, 
    content: string, 
    targetLength: number
  ): Promise<CompressionResult> {
    return new Promise((resolve) => {
      this.worker.postMessage({ nodeId, content, targetLength });
      
      const handler = (result: CompressionResult) => {
        if (result.nodeId === nodeId) {
          this.worker.off("message", handler);
          resolve(result);
        }
      };
      
      this.worker.on("message", handler);
      
      // 超时处理（5分钟）
      setTimeout(() => {
        this.worker.off("message", handler);
        resolve({ 
          nodeId, 
          success: false, 
          error: "压缩超时" 
        });
      }, 300000);
    });
  }
}
```

---

## 5. 小模型提示词设计

### 5.1 提示词场景分类

小模型在记忆系统中承担三个核心任务：

| 任务 | 场景 | 输入 | 输出 |
|------|------|------|------|
| **A. 语义切割** | 记忆建立前 | 长文本 | 小段文本数组 |
| **B. 内容处理** | 节点创建/压缩 | 原文+目标字数(可选) | 内容+摘要+关键词 |

### 5.2 场景A：语义切割提示词

```
【任务】
将以下长文本切分为语义完整的小段，并进行代词消解（将代词替换为明确的指代对象）。

【输入文本】
{text}

【切割要求】
1. 每段长度不超过200个字符
2. 保持每个小段的语义完整性（一个事件、一个观点或一个动作）
3. 小段之间可以有轻微重叠，但避免大量重复

【代词消解要求】
1. 识别文本中的所有代词（你、我、他、她、它、我们、他们、这、那等）
2. 根据上下文确定每个代词的明确指代对象
3. 将代词替换为具体的指代对象名称

【示例】
输入：
"我今天去了公园，看到了很多花。我拍了照片发给妈妈，她很开心。"

输出：
{
  "segments": [
    "我今天去了公园，看到了很多花。",
    "我今天去了公园，拍了很多花的照片发给我的妈妈，我的妈妈很开心。"
  ]
}

注意：第二段中"我"保持，"她"替换为"我的妈妈"，确保将来回忆时不会混淆指代对象。

【输出格式】
{
  "segments": [
    "小段1的完整文本（代词已消解）",
    "小段2的完整文本（代词已消解）",
    ...
  ]
}
```

### 5.3 场景B：内容处理提示词（统一模板）

此提示词同时用于**节点创建**（无目标字数）和**节点压缩**（有目标字数）。

```
【任务】
处理以下文本，提取/生成：1) 处理后的内容 2) 短语摘要 3) 关键词列表

【输入文本】
{text}

【目标字数】
{targetLength ? `请将内容压缩至约${targetLength}个字符（允许±10%误差）` : "保持原文，无需压缩"}

【处理要求】
1. 内容：
   - 如无目标字数：保持原文完整
   - 如有目标字数：压缩至目标长度，保留核心语义

2. 短语摘要（10-20字）：
   - 用简洁的语言概括内容主旨
   - 可作为记忆的"标题"

3. 关键词（3-5个）：
   - 提取内容中的核心概念
   - 必须是名词或名词短语
   - 用于关联建立和检索

【输出格式】
{
  "content": "处理后的完整内容",
  "phrase": "短语摘要",
  "keywords": ["关键词1", "关键词2", "关键词3"]
}

【示例】
输入："我今天早上去了中央公园，那里有很多美丽的樱花树，我在那里拍了好多照片。"
目标字数：20

输出：
{
  "content": "今早去中央公园赏樱花并拍照",
  "phrase": "公园赏樱",
  "keywords": ["中央公园", "樱花", "拍照", "早晨"]
}
```

### 5.4 数据结构定义

```typescript
// 语义切割结果
interface SegmentationResult {
  segments: string[];
}

// 内容处理结果（创建/压缩通用）
interface ContentProcessResult {
  content: string;      // 处理后的内容
  phrase: string;       // 短语摘要
  keywords: string[];   // 关键词列表
}

// Worker任务类型扩展
type WorkerTask = 
  | { type: "segment"; text: string }
  | { type: "process"; text: string; targetLength?: number };
```

### 5.5 Worker实现更新

```typescript
// worker.ts - 支持两种任务类型
import { parentPort } from "worker_threads";

interface WorkerTask {
  type: "segment" | "process";
  nodeId?: string;
  text: string;
  targetLength?: number;
}

interface WorkerResult {
  nodeId?: string;
  success: boolean;
  // segment任务返回
  segments?: string[];
  // process任务返回
  content?: string;
  phrase?: string;
  keywords?: string[];
  error?: string;
}

// 调用小模型（带15次重试）
async function callModel(prompt: string, maxRetries: number = 15): Promise<string> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      // 实际调用小模型API
      const response = await fetch("http://localhost:11434/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "qwen2.5:7b",  // 或其他小模型
          prompt: prompt,
          stream: false
        })
      });
      
      const data = await response.json();
      return data.response;
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      await sleep(Math.min(1000 * Math.pow(2, i), 30000));
    }
  }
  throw new Error("Max retries exceeded");
}

// 语义切割
async function segmentText(text: string): Promise<string[]> {
  const prompt = `【任务】将以下长文本切分为语义完整的小段...\n\n【输入文本】\n${text}\n\n【输出格式】\n{\n  "segments": [\n    "小段1",\n    "小段2"\n  ]\n}`;
  
  const response = await callModel(prompt);
  const result = JSON.parse(extractJson(response));
  return result.segments;
}

// 内容处理（创建/压缩通用）
async function processContent(
  text: string, 
  targetLength?: number
): Promise<{ content: string; phrase: string; keywords: string[] }> {
  const compressInstruction = targetLength 
    ? `请将内容压缩至约${targetLength}个字符（允许±10%误差）`
    : "保持原文，无需压缩";
  
  const prompt = `【任务】处理以下文本...\n\n【输入文本】\n${text}\n\n【目标字数】\n${compressInstruction}\n\n【输出格式】...`;
  
  const response = await callModel(prompt);
  const result = JSON.parse(extractJson(response));
  return {
    content: result.content,
    phrase: result.phrase,
    keywords: result.keywords
  };
}

// 提取JSON（处理模型可能输出的额外文本）
function extractJson(text: string): string {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("No JSON found in response");
  return match[0];
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// 消息处理
parentPort?.on("message", async (task: WorkerTask) => {
  try {
    if (task.type === "segment") {
      const segments = await segmentText(task.text);
      parentPort?.postMessage({ 
        nodeId: task.nodeId,
        success: true, 
        segments 
      });
    } else if (task.type === "process") {
      const result = await processContent(task.text, task.targetLength);
      parentPort?.postMessage({ 
        nodeId: task.nodeId,
        success: true, 
        ...result 
      });
    }
  } catch (error) {
    parentPort?.postMessage({ 
      nodeId: task.nodeId,
      success: false, 
      error: (error as Error).message 
    });
  }
});
```

### 5.6 NodeStore更新（创建时调用小模型）

```typescript
class NodeStore {
  private worker: Worker;  // 注入Worker实例
  
  // 创建节点（调用小模型提取摘要和关键词）
  async createNode(content: string): Promise<Node> {
    const id = generateUUID();
    
    // 调用小模型处理内容（无目标字数=创建模式）
    const processed = await this.callWorker({
      type: "process",
      text: content
    });
    
    const node: Node = {
      id,
      content: processed.content,
      phrase: processed.phrase,
      keywords: processed.keywords,
      createdAt: Date.now(),
      scanCount: 0
    };
    
    // 存储三元组...
    await this.saveNode(node);
    return node;
  }
  
  private callWorker(task: WorkerTask): Promise<ContentProcessResult> {
    return new Promise((resolve, reject) => {
      this.worker.postMessage(task);
      
      const handler = (result: WorkerResult) => {
        this.worker.off("message", handler);
        if (result.success) {
          resolve({
            content: result.content!,
            phrase: result.phrase!,
            keywords: result.keywords!
          });
        } else {
          reject(new Error(result.error));
        }
      };
      
      this.worker.on("message", handler);
      setTimeout(() => reject(new Error("Worker timeout")), 60000);
    });
  }
}
```

### 5.7 CompressionScheduler更新（压缩时更新全部字段）

```typescript
// 压缩单个节点
private async compressNode(nodeId: string): Promise<void> {
  const node = await this.nodeStore.getNode(nodeId);
  if (!node) return;
  
  const importance = await this.linkStore.calculateImportance(nodeId);
  
  if (importance >= 1) {
    await this.nodeStore.incrementScanCount(nodeId);
    return;
  }
  
  if (importance === 0) {
    await this.nodeStore.deleteNode(nodeId);
    return;
  }
  
  const targetLength = Math.floor(node.content.length * Math.min(importance, 1));
  
  if (targetLength < this.deleteThreshold) {
    await this.nodeStore.deleteNode(nodeId);
    return;
  }
  
  if (targetLength >= node.content.length) {
    await this.nodeStore.incrementScanCount(nodeId);
    return;
  }
  
  // 调用Worker进行压缩（返回content+phrase+keywords）
  const result = await this.callWorker({
    type: "process",
    nodeId,
    text: node.content,
    targetLength
  });
  
  if (result.success) {
    // 更新所有字段
    await this.nodeStore.updateNode(nodeId, {
      content: result.content!,
      phrase: result.phrase!,
      keywords: result.keywords!
    });
  }
  
  await this.linkStore.decayAllLinks(nodeId);
  await this.nodeStore.incrementScanCount(nodeId);
}
```

---

## 6. 公共API接口

### 5.1 MemoryManager - 统一入口

```typescript
class MemoryManager {
  private nodeStore: NodeStore;
  private linkStore: LinkStore;
  private focusManager: FocusManager;
  private searchEngine: SearchEngine;
  private compressionScheduler: CompressionScheduler;
  private db: LevelGraph;
  
  constructor(dbPath: string) {
    // 初始化LevelGraph
    const level = new ClassicLevel(dbPath, { valueEncoding: "json" });
    this.db = levelgraph(level);
    
    // 初始化各模块
    this.nodeStore = new NodeStore(this.db);
    this.linkStore = new LinkStore(this.db);
    this.focusManager = new FocusManager(this.db);
    this.searchEngine = new SearchEngine(
      this.nodeStore, 
      this.linkStore, 
      this.focusManager
    );
    this.compressionScheduler = new CompressionScheduler(
      this.nodeStore,
      this.linkStore,
      this.focusManager
    );
  }
  
  // 初始化
  async initialize(): Promise<void> {
    await this.focusManager.initialize();
  }
  
  // 创建记忆（从语义切割后的小段）
  // 实现方案选择：
  // 方案A（固定节点数）：调用getOrCreateNode()，自动复用最不重要的槽位
  // 方案B（动态创建）：调用createNode()，创建新节点
  async createMemory(
    content: string, 
    keywords: string[],
    relatedNodes?: string[]  // 同一切割来源的其他节点
  ): Promise<string> {
    // 方案A实现：固定节点数，复用槽位
    // const nodeId = await this.compressionScheduler.getOrCreateNode(content, keywords);
    
    // 方案B实现：动态创建新节点
    const node = await this.nodeStore.createNode(content, keywords);
    const nodeId = node.id;
    
    // 2. 与当前关注点建立关联（强度1.0）
    // 时间顺序关联自然蕴含：新节点与当前关注点关联，形成时间链条
    const focusList = this.focusManager.getFocusList();
    for (const focusId of focusList) {
      await this.linkStore.createLink(nodeId, focusId, 1.0, "focus-link");
      await this.linkStore.createLink(focusId, nodeId, 1.0, "focus-link");
    }
    
    // 3. 与同一切割来源的节点建立关联（强度0.5）
    // 语义连贯性关联：同一长文本切割出的节点相互关联
    if (relatedNodes) {
      for (const relatedId of relatedNodes) {
        await this.linkStore.createLink(nodeId, relatedId, 0.5, "segment-link");
        await this.linkStore.createLink(relatedId, nodeId, 0.5, "segment-link");
      }
    }
    
    // 注意：用户不需要主动声明关联
    // 隐含关联通过节点相似性和共享关注点自然形成
    // 当用户讨论相关话题时，会创建相似节点（副本），这些节点通过BFS搜索被发现
    
    return nodeId;
  }
  
  // 回忆（BFS搜索）
  async recall(
    keywords: string[],
    relations: string[],
    depth: number
  ): Promise<string> {
    // 1. 执行BFS搜索
    const results = await this.searchEngine.search(keywords, relations, depth);
    
    // 2. 提取匹配节点的内容
    const matchedContents = results
      .filter(r => r.matched)
      .map(r => r.node.content);
    
    // 3. 更新关注点（基于keywords）
    for (const result of results) {
      if (result.matched) {
        await this.focusManager.addFocus(result.node.id);
      }
    }
    
    // 4. 返回拼接的内容
    return matchedContents.join("\n");
  }
  
  // 触发压缩（由外部调度系统调用）
  async triggerCompression(): Promise<void> {
    await this.compressionScheduler.runCompressionSlice();
  }
  
  // 关闭
  async close(): Promise<void> {
    await this.db.close();
  }
}
```

### 5.2 使用示例

```typescript
// 初始化
const memory = new MemoryManager("./memory_data");
await memory.initialize();

// 建立记忆（语义切割后调用）
const nodeId1 = await memory.createMemory("我今天去了公园", ["公园", "今天"]);
const nodeId2 = await memory.createMemory("看到了很多花", ["花"], [nodeId1]);

// 回忆
const result = await memory.recall(["公园"], [], 2);
console.log(result);  // "我今天去了公园"

// 触发压缩（定时或按Token阈值触发）
await memory.triggerCompression();

// 关闭
await memory.close();
```

---

## 7. 部署与配置

### 6.1 依赖安装

```bash
bun install levelgraph classic-level uuid
bun install -d @types/uuid
```

### 6.2 配置参数

```typescript
// config.ts
export const MemoryConfig = {
  // 存储配置
  dbPath: process.env.MEMORY_DB_PATH || "./memory_data",
  
  // 关注点配置
  maxFocusCount: 5,
  
  // 压缩配置
  decayRate: 0.97,           // 关联衰减速率
  deleteThreshold: 10,       // 删除阈值（字符）
  timeSlice: 30000,          // 压缩时间片（毫秒）
  maxCompressionRetries: 15, // 小模型重试次数
  
  // 搜索配置
  defaultSearchDepth: 2,     // 默认BFS深度
  
  // 触发配置（外部系统参考）
  contextThresholdRatio: 0.8,  // 上下文阈值比例
};
```

### 6.3 系统要求

| 项目 | 要求 |
|------|------|
| 运行时 | Bun ≥ 1.0 或 Node.js ≥ 18 |
| 内存 | 取决于记忆数据量（LevelDB内存映射）|
| 磁盘 | SSD推荐，存储需求取决于记忆数量 |
| 操作系统 | Linux/macOS/Windows（LevelDB支持）|

---

## 8. 性能优化建议

### 7.1 索引优化

LevelGraph的Hexastore已提供六重索引，满足大部分查询需求。对于高频查询可添加二级索引：

```typescript
// 扫描次数索引（用于压缩排序）
// 定期将节点导出到内存数组排序，避免频繁磁盘扫描
```

### 7.2 缓存策略

```typescript
// 关注点列表常驻内存（已在FocusManager实现）
// 热点节点内容缓存（LRU Cache）
import { LRUCache } from "lru-cache";

const contentCache = new LRUCache<string, Node>({
  max: 1000,  // 最多缓存1000个节点
  ttl: 1000 * 60 * 5  // 5分钟过期
});
```

### 7.3 并发控制

```typescript
// Bun使用Worker Pool执行压缩
// 主线程保持非阻塞
const compressionWorker = new Worker("./worker.ts");

// 使用async/await管理并发
// LevelDB单线程写入，内部已序列化
```

---

## 9. 故障处理

### 8.1 数据备份

```bash
# LevelDB数据目录直接复制
cp -r ./memory_data ./memory_data_backup
```

### 8.2 数据恢复

```typescript
// 从备份目录恢复
const memory = new MemoryManager("./memory_data_backup");
```

### 8.3 常见问题

| 问题 | 原因 | 解决 |
|------|------|------|
| 压缩卡住 | 小模型API超时 | 检查网络，增加重试间隔 |
| 内存增长 | 缓存未清理 | 调整LRU大小，定期重启 |
| 搜索慢 | BFS深度过大 | 限制depth ≤ 4 |
| 磁盘满 | LevelDB增长 | 压缩删除节点，清理历史 |

---

**文档版本**：1.0  
**最后更新**：2026-02-05  
**技术栈**：Bun + LevelGraph + LevelDB
