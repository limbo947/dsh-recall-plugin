# TS 迁移 M2：源码纯移动 + 逐文件转译构建 + 统一新鲜度门禁

> 状态：待实施 ｜ 上游文档：[plan-ts-refactor.md](./plan-ts-refactor.md) ｜ 阶段：M2/8
>
> 一句话：13 个 host 源文件一次性 rename-only 搬入 `src/host/`，esbuild 逐文件转译接管 `lib/`，`lib/` 自此是纯产物目录。

## 目标

消除「lib/ 半源码半产物」中间态（上游 §2.2）；构建、测试、CI 全部切换来源；移动与内容变化严格分离成两类 commit。

## 前置

M1 完成（typecheck 在 CI 已就位）。

## 任务分解

### 1. 纯移动 commit（rename-only，禁碰任何文件内容）

```powershell
New-Item -ItemType Directory -Force src/host | Out-Null
git mv lib/index.js lib/store.js lib/snapshots.js lib/maintenance.js lib/routes-core.js lib/routes-manage.js lib/config.js lib/diagnostics.js lib/errors.js lib/dump-parse.js lib/session-info.js lib/scripts.pwsh.js lib/scripts.posix.js src/host/
git add -A; git commit -m "refactor: host 源码纯移动 lib/ → src/host/（rename-only）"
```

- `lib/client.js` **不动**（它是 client 构建产物，不是 host 源码）。
- 验证：`git show --stat HEAD` 应全为 `R100` 记录，零内容变化。

### 2. 新建 `scripts/build-host.mjs`

```js
/**
 * build-host.mjs — host 侧逐文件转译（bundle: false）
 *
 * 产物文件名与历史 lib/ 布局逐一相同：package-layout.test.js 白名单断言、
 * npm pack 文件集合、cordis.patch.yml 与 verify-host 全部零感知（上游 §2.1
 * 方案 A）。入口按 .ts 优先、.js 兜底解析：M4–M7 迁移期 src/host 内
 * .ts/.js 混居，本脚本不随迁移进度改动。
 */
import { build } from 'esbuild'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

const HOST_ENTRIES = [
  'index', 'store', 'snapshots', 'maintenance', 'routes-core', 'routes-manage',
  'config', 'diagnostics', 'errors', 'dump-parse', 'session-info',
  'scripts.pwsh', 'scripts.posix',
]

function resolveEntry(name) {
  for (const ext of ['.ts', '.js']) {
    const p = path.join(root, 'src', 'host', name + ext)
    if (fs.existsSync(p)) return p
  }
  throw new Error('build-host: 入口缺失 src/host/' + name + '.(ts|js)')
}

const entryPoints = {}
for (const name of HOST_ENTRIES) entryPoints[name] = resolveEntry(name)

await build({
  entryPoints,
  bundle: false,
  // import 说明符逐字透传：'./config.js' 维持产物间互引，@deepseek-ai/*
  // 裸导入交给 Node 运行时按 peerDependencies 解析
  format: 'esm',
  platform: 'node',
  target: 'node20',
  outdir: path.join(root, 'lib'),
})
```

### 3. package.json 改 build

```json
"build": "node scripts/build-host.mjs && node scripts/build-client.mjs"
```

### 4. tsconfig 切迁移期形态

- `include` 改为 `["src/**/*", "tests/types/**/*"]`
- `checkJs` 改为 `false`（.js 文件不再检查，运行时回归由 25 个单测承担）
- **保留 `allowJs: true`**：.js 文件仍需入程序——否则 include 下无 TS 输入报 TS18003「No inputs were found」，且 src/types 对 .js 的模块解析会断。`allowJs` 延至 M7 全部源文件 .ts 化后移除。
- 移除 M1 的 `exclude` 条目：`lib/` 已退出 include 范围，「产物不进类型检查」由 include 边界自然承担，无需显式排除（`"lib"` 的 DOM 配置保留，M7 client 类型化依赖它）。

### 5. 单测 import 机械替换（22 个文件）

`'../../lib/` → `'../../src/host/`，`.js` 后缀原样保留（vitest 4.1.11 解析 `.js`→`.ts`/`.js` 已实证，见上游 §4.2）。`client-pure`、`check-dsh-version`、probe、package-layout 零改动。批量替换：

```powershell
node -e "const fs=require('fs');for(const f of fs.readdirSync('tests/unit')){const p='tests/unit/'+f;const s=fs.readFileSync(p,'utf8');const t=s.replace(/'\.\.\/\.\.\/lib\//g,\"'../../src/host/\");if(t!==s)fs.writeFileSync(p,t)}"
```

替换后抽查 `git diff tests/` 应只有 import 路径行变化。

### 6. 首次重建 + 一次性产物 diff 独立 commit

```powershell
npm run build
npm test          # package-layout 断言 pack 布局不变，必须绿
git add lib/; git commit -m "chore: lib/ 产物切换为 esbuild 逐文件转译输出（一次性格式规整 diff）"
```

esbuild 对 13 个文件的格式规整差异（引号/换行等）属预期一次性成本，单独成 commit 供 review 按边界切割（上游风险表）。

### 7. CI 新鲜度门禁统一

`.github/workflows/ci.yml` 原 `Client bundle freshness gate` 步替换为：

```yaml
      - name: Bundle freshness gate
        # host/client 合并一道门禁：改 src 忘 rebuild 时产物陈旧即红
        run: |
          npm run build
          git diff --exit-code lib/
```

### 8. 装配门禁回归

`npm run verify:host` 必须绿——它消费 `lib/index.js` 产物、脚本零改动，是「DSH 消费端零感知」的机器化证明。

## 验收标准

- 移动 commit 为纯 R 记录；产物 diff 独立 commit
- `npm run build` 后再次重建，`git diff --exit-code lib/` 为零
- `npm test` / `npm run typecheck` / `npm run verify:host` 全绿；本机 `test:probe` 绿

## 风险与回退

| 风险 | 对策 |
| --- | --- |
| 一次性产物 diff 掩盖真改动 | 移动/产物两个 commit 边界清晰，review 按边界切割 |
| 批量替换 import 误伤 | 替换后 `git diff tests/` 人工抽查；单测全绿兜底 |
| 中间 commit 非绿：移动后、重建前 lib/ 缺 13 个运行时文件，package-layout 与 import lib/ 的单测必红 | 移动/构建切换/重建是同阶段的原子步骤，以阶段为单位验收——合入前整阶段 CI 绿为准，中途勿以单 commit 跑测试判断；也不因此把两类 commit 合并（边界分离是 review 切割与回退的前提） |
| 漏 build 直接跑测试导致 package-layout 基于陈旧产物 | 本阶段起本地工作流约定：改 `src/` 先 `npm run build` 再 `npm test`（M8 写进文档） |

回退：revert 本阶段全部 commit，恢复 lib/ 源码身份。

## 实施记录

> 2026-09-01 实施完成。基线 HEAD `cd7e862`（M1 收口）。

### Commit 边界（M2 三个独立 commit）

| commit | 内容 | 验证 |
| --- | --- | --- |
| `7144172` | host 源码纯移动 lib/ → src/host/（rename-only） | `git show --stat` 13 条全 R100，0 insertions/0 deletions |
| `805f4b1` | 构建切换：build-host.mjs 新建、package.json build 改为 host+client 串联、tsconfig 迁移期形态（include src/** + tests/types、checkJs 关、allowJs 留、exclude 移除）、22 个单测 import `../../lib/` → `../../src/host/`（`.js` 后缀原样）、CI 统一新鲜度门禁（Bundle freshness gate 覆盖全 lib/） | 替换后 `git diff tests/` 人工过目仅 import 路径行；单测全绿兜底 |
| `bd52ec0` | lib/ 13 个 host 产物切换为 esbuild 逐文件转译输出（一次性格式规整 diff，3293 行新增） | 语义抽查：scripts.posix.js/pwsh.js 产物中 `g=` 约定、`--ignore-errors`、`:(top)` pathspec、`ROLLBACK_OK`/`RESCUE_OK` 哨兵均在 |

### 验收证据

| 验收项 | 结果 |
| --- | --- |
| 移动 commit 纯 R 记录 | `git show --stat 7144172`：13 文件全 `rename {lib => src/host}/*.js (100%)`，0 增删 |
| 产物 diff 独立 commit | `bd52ec0` 仅含 lib/ 13 文件（client.js 无变化——entry.js 的 M1 变更仅为注释，esbuild 裁减后产物不变） |
| build 确定性 | `npm run build` 后 `git diff --exit-code lib/` 退出码 0（输出为空） |
| `npm test` | 绿：25 文件 290 例（含 package-layout，pack 布局断言零改动通过） |
| `npm run typecheck` | 绿：迁移期形态（allowJs 保留、checkJs 关闭），exit 0 |
| `npm run verify:host` | 绿：装配断言全部通过（inject=shell,sessions,webServer,agents，端点 12 项，agents 桩访问 1 次）——消费 lib/index.js 产物，脚本零改动 |
| `npm run test:probe` | 绿：2 文件 31 例（探针不 import 插件源码，钉真实 dsh 安装） |

### 偏离与备注

- 计划给的 node 一行式批替换在 PowerShell 环境被引号转义干扰（`node -e` 偶发空输出/exit 1），改用临时 mjs 脚本执行同一替换逻辑后删除；替换结果与计划一致（22 个文件，29 行 import 变化）。
- npm install 移除了 `@deepseek-ai/{schemastery,dsh-settings}` junction，M1 已重建；本阶段无新增依赖变更。
- 产物与手写源码差异：esbuild 双引号归一、字符串非 ASCII 转 `\uXXXX`、注释大幅裁减（保留部分 `// PF-x`/`//` 关键注释与 `/* @__PURE__ */` 标记）——语义等价（`\uXXXX` 运行期解码同串），属预期一次性成本。
- 红线复核：`lib/` 产物文件名与迁移前基线逐一相同（14 文件同名同数：13 host + client.js）；`grep -rn "@ts-ignore" src/ lib/` 为零。
