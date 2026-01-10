# 26011009 Copy To Directory — 审计报告

> 审计对象：`docs/specs/26011009-copy-to-directory/tasks.csv` 中 `project_progress=已完成` 的任务。
> 审计基线：以当前工作区代码为准（生成日期：2026-01-10）。
> 更新日期：2026-01-10（审查实习生建议并更新）

## Review Summary

- **结论**：存在2个**关键阻塞项**（必须修复）和3个**中高优先级问题**（建议修复）

---

## 关键阻塞项（BLOCKER - 必须修复）

### 1. T009 复制到目录快捷键逻辑存在**调用参数顺序错误**

**问题描述**：
- `Shortcut.match()` 签名为 `(shortcut, event)`，但调用写为 `Shortcut.match(e, shortcut)`
- 导致快捷键永远无法匹配，功能完全不可用

**证据**：
- `Www/ts/MainWindow/Hotkey.ts:180` 调用 `Shortcut.match(e, shortcut)`

**正确调用方式**：
```typescript
Shortcut.match(shortcut, e) 
// 或
Shortcut.match(config.copyToDirectory.shortcut, e)
```

**采纳建议**：✅ **必须修复**

---

### 2. T006 `Shortcut` 模块存在**解析和匹配缺陷**

**问题描述**：

#### 问题1：F1-F12键无法解析
- `parse()` 函数第47行条件 `part.length === 1 || part === 'escape' ...` 不包含F1-F12
- `"F1"` 长度为2，无法匹配条件，`result.key` 被赋值为空字符串
- 导致 `normalize("F1") === ""`，`match()` 永远返回 `false`
- 影响默认快捷键配置（`shortcut: "F1"`）

**证据**：`Www/ts/Shortcut.ts:47`

#### 问题2：Escape/Space等特殊键大小写不匹配
- `parse("escape")` 第48行生成 `key="ESCAPE"`（全大写）
- `match()` 第94行将 `event.key` 映射为 `"Escape"`（首字母大写）
- 第100行比较 `parsed.key === eventKey` 永远返回 `false`（`"ESCAPE"` !== `"Escape"`）
- 同样影响 `Space`、`Enter`、`Tab`、`Backspace`、`Delete`

**证据**：
- `Www/ts/Shortcut.ts:48`（parse生成大写）
- `Www/ts/Shortcut.ts:94`（match首字母大写映射）
- `Www/ts/Shortcut.ts:100`（比较）

**采纳建议**：✅ **必须修复**

---

## 中高优先级问题（HIGH - 建议修复）

### 3. T012/T013 Toast文案**占位符替换不完整**

**问题描述**：
- `langData.js` 第2591行定义：`copyToDirBatchSuccess` 占位符为 `{success}/{total}/{dir}`
- `Script.ts` 第1664、1668行替换逻辑：`.replace("{0}", ...).replace("{1}", ...)`
- 只替换了 `{0}` 和 `{1}`，未替换 `{total}` 和 `{dir}`

**影响**：
- 导致Toast显示：`"已複製 3/5 {dir}"`（占位符未被替换）

**证据**：
- `Www/lang/langData.js:2591`（占位符定义）
- `Www/ts/MainWindow/Script.ts:1664`、`1668`（替换逻辑）

**采纳建议**：✅ **应修复**为 `.replace("{success}", ...).replace("{total}", ...).replace("{dir}", ...)`

---

### 4. T012 Toast失败时**未展示具体错误信息**

**问题描述**：
- `langData.js` 第2596行定义：`copyToDirFailed` 占位符为 `{error}`
- `Script.ts` 第1666、1680行仅拼接失败文件名：`${this.M.i18n.t("msg.copyToDirFailed")}: ${failedFiles.join(", ")}`

**影响**：
- 未将错误原因传递给占位符，用户不知道失败的具体原因（如权限不足、磁盘满、文件被占用等）

**证据**：
- `Www/lang/langData.js:2596`（占位符定义）
- `Www/ts/MainWindow/Script.ts:1666`、`1680`（使用方式）

**采纳建议**：✅ **应使用** `.replace("{error}", errorMessage)`，其中 `errorMessage` 来自 `WV_File.Copy()` 的返回值

---

### 5. T012 目标路径拼接**存在分隔符缺失风险

**问题描述**：
- `Script.ts` 第1674行：`const targetPath = \`${targetDirPath}${fileName}\``

**影响**：
- 如果 `targetDirPath` 不以路径分隔符结尾（如 `C:\temp`），会生成非法路径 `C:\tempfile.txt`
- 在 Setting UI 未实现的情况下，配置输入很可能不带分隔符

**证据**：`Www/ts/MainWindow/Script.ts:1674`

**建议方案**：
- 使用路径拼接库（如 `path.join()`）
- 或添加分隔符检查：`const targetPath = targetDirPath.endsWith('\\') || targetDirPath.endsWith('/') ? \`${targetDirPath}${fileName}\` : \`${targetDirPath}\\${fileName}\``

**采纳建议**：✅ **建议修复**

---

## 无需修改项

### 6. T009 导入方式问题已正常

**实习生观点**：审计认为 `import { Shortcut } from "../Shortcut"` 存在问题

**实际检查**：
- TypeScript 允许导入具名函数后使用 `Shortcut.` 命名空间调用
- 当前代码 `Shortcut.match()` 和 `Shortcut.parse()` 可正常工作（修复参数顺序后）

**结论**：✅ **不采纳建议** - 无需修改

---

### 7. T009 Bulk View分支return问题已解决

**实习生观点**：审计认为 `M.fileLoad.getIsBulkView()` 块内的 `return` 会阻断快捷键判断

**实际检查**：
- `copyToDirectory` 的快捷键判断代码已被移到该块**外部**（`Hotkey.ts` 第180行）
- 在 Bulk View 分支的 `return`（第175行）之前已执行快捷键检查

**结论**：✅ **不采纳建议** - 无需修改

---

### 8. 文档一致性问题已解决

**实习生观点**：`tasks.csv` 标注 `T018/T019` 为"未开始"，但代码中已存在实现

**实际检查**：
- T018/T019 的状态已在tasks.csv中更新为"已完成"

**结论**：✅ **不采纳建议** - 已修复

---

## 验证记录

- 本次为**静态审计**（未运行程序/未执行自动化测试），依据为源码与文档的对应关系与可推导的运行路径。

---

## 逐项审计（仅已完成项）

### T001 新增 C# 文件复制 API `WV_File.Copy`（PASS）

- **结论**：满足"空字符串表示成功/异常返回错误信息/支持覆盖"。
- **证据**：`Tiefsee/VW/WV_File.cs:336`（签名与返回约定）、`Tiefsee/VW/WV_File.cs:341`（`File.Copy(..., overwrite)`）、`Tiefsee/VW/WV_File.cs:344`（异常捕获）。
- **备注**：`sourcePath` 不存在时返回了硬编码英文错误 `"Source file does not exist"`（如要面向用户展示，建议在上层做 i18n 映射）。

---

### T002 新增 C# 目录选择对话框 API `WV_Directory.OpenFolderDialog`（PASS）

- **结论**：满足"FolderBrowserDialog/标题与初始路径/取消返回空字符串"。
- **证据**：`Tiefsee/VW/WV_Directory.cs:289`（方法签名与异常处理）、`Tiefsee/VW/WV_Directory.cs:291`（`FolderBrowserDialog`）、`Tiefsee/VW/WV_Directory.cs:298`（OK 返回选择路径）。

---

### T003 同步 TS 声明文件 `NetAPI.d.ts`（PASS）

- **结论**：新增声明与 C# 侧签名一致。
- **证据**：`Www/ts/d/NetAPI.d.ts:199`（`OpenFolderDialog`）、`Www/ts/d/NetAPI.d.ts:291`（`Copy`）。

---

### T004 扩展 `Config.ts` 配置结构（PASS）

- **结论**：字段齐全且默认值与 PRD/TECHNICAL_APPROACH 一致。
- **证据**：`Www/ts/Config.ts:435`（`copyToDirectory` 默认值）。

---

### T005 新增国际化文本 `langData.js`（PASS）

- **结论**：新增的 key 覆盖了任务列出的文案项，并包含 `zh-TW/zh-CN/en`。
- **证据**：`Www/lang/langData.js:2585`（`copyToDirSuccess` 起始位置）、`Www/lang/langData.js:2625`（`shortcutConflict`）。
- **备注**：文案使用了 `{dir}/{success}/{total}/{error}` 风格占位符；需要调用处按相同占位符替换，否则会出现未替换的"花括号文本"。

---

### T006 创建 `Shortcut` 快捷键模块（FAIL）

- **结论**：模块存在解析和匹配缺陷，导致F1-F12及特殊功能键无法工作。
- **主要问题**：
  - **解析不支持F1-F12**：`parse()` 第47行条件未包含F1-F12，导致 `parse("F1")` 的 `key` 为空，`normalize("F1")` 返回空字符串，`match()` 永远返回 `false`。证据：`Www/ts/Shortcut.ts:47`。
  - **特殊键大小写映射不一致**：`parse("escape")` 第48行生成 `key="ESCAPE"`，但 `match()` 第94行将 `event.key` 映射为 `"Escape"`，第100行比较 `parsed.key === eventKey` 永远返回 `false`。同样影响 `Space`、`Enter`、`Tab`、`Backspace`、`Delete`。证据：`Www/ts/Shortcut.ts:48`、`94`、`100`。
- **备注**：导出方式（命名函数）与调用方式（`Shortcut.match()`）在TypeScript中是合法的，不构成问题。

---

### T009 在 `Hotkey.ts` 添加复制到目录快捷键处理（FAIL）

- **结论**：快捷键匹配参数顺序错误，导致功能完全无法使用。
- **主要问题**：
  - **调用参数顺序错误**：第180行 `Shortcut.match(e, shortcut)`，但 `match()` 的签名为 `(shortcut, event)`（第83行）。参数顺序颠倒，导致快捷键永远无法匹配。证据：`Www/ts/MainWindow/Hotkey.ts:180`、`Www/ts/Shortcut.ts:83`。
  - **Bulk View 分支问题已解决**：审计认为会被提前return阻断，但实际检查后发现 `copyToDirectory` 快捷键判断代码（第180-186行）位于 Bulk View 分支的 `return`（第175行）之前，不会被执行阻断。但参数错误问题导致即使执行也无法匹配。
- **备注**：导入方式 `import { Shortcut } from "../Shortcut"` 与命名函数导出兼容，不是问题。

---

### T010 在 `ScriptCopy` 添加 `copyToDirectory` 方法框架（PASS）

- **结论**：包含"启用检查/目标目录设置检查/源路径收集/目标目录存在性与创建"。  
- **证据**：`Www/ts/MainWindow/Script.ts:1532`（入口）、`Www/ts/MainWindow/Script.ts:1539`（目标目录校验）、`Www/ts/MainWindow/Script.ts:1545`（Bulk View/普通模式分流）、`Www/ts/MainWindow/Script.ts:1558`（目标目录存在性/创建）。

---

### T011 实现时间戳重命名逻辑（PASS）

- **结论**：实现了 `yyyyMMdd_HHmmss_fff` 时间戳 + 冲突递增后缀 `_1/_2...`。
- **证据**：`Www/ts/MainWindow/Script.ts:1705`（策略分支）、`Www/ts/MainWindow/Script.ts:1724`（时间戳格式）、`Www/ts/MainWindow/Script.ts:1731`（冲突递增循环）。

---

### T012 实现文件复制核心逻辑（PARTIAL）

- **结论**：已调用 `WV_File.Copy` 并按 `onConflict` 传递 `overwrite`，但 Toast 文案与失败原因展示不满足验收。
- **主要问题**：
  - **未展示失败原因**：`WV_File.Copy` 的返回错误字符串未用于 Toast（仅统计失败文件名）。证据：`Www/ts/MainWindow/Script.ts:1652`、`1656`。
  - **成功提示未稳定包含"目标目录 + 最终文件名"**：当前单文件成功 Toast 只拼了文件名；批量成功 Toast 使用了不匹配的占位符替换（`{0}/{1}`），与文案中的 `{success}/{total}/{dir}` 不一致。证据：`Www/ts/MainWindow/Script.ts:1664`、`1667`、`Www/lang/langData.js:2585`、`2590`。
  - **目标路径拼接风险**：`${targetDirPath}${fileName}` 依赖 `targetDirPath` 是否带尾部分隔符；在 Setting UI 未实现的情况下，配置输入很可能不带分隔符。证据：`Www/ts/MainWindow/Script.ts:1642`。

---

### T013 实现批量复制逻辑（PARTIAL）

- **结论**：具备逐个复制与成功/失败计数，但"批量失败原因展示/成功提示内容"不满足验收（同 T012 的占位符与错误原因问题）。
- **证据**：`Www/ts/MainWindow/Script.ts:1633`（逐个复制）、`Www/ts/MainWindow/Script.ts:1662`（批量 Toast 分支）。

---

### T014/T015/T016/T017 BulkView 多选（PASS）

- **结论**：多选状态、交互与对外接口符合验收描述，且 `clearSelection()` 会刷新视觉状态。
- **证据**：
  - 状态：`Www/ts/MainWindow/BulkView.ts:55`（`_selectedPaths`）、`Www/ts/MainWindow/BulkView.ts:57`（`_lastAnchorPath`）
  - 接口：`Www/ts/MainWindow/BulkView.ts:115`（`getSelectedPaths`）、`Www/ts/MainWindow/BulkView.ts:121`（`getSelectedPathsOrFallbackCurrent`）、`Www/ts/MainWindow/BulkView.ts:130`（`clearSelection`）
  - 交互：`Www/ts/MainWindow/BulkView.ts:1172`（Ctrl/Shift/Click 分支）
  - 视觉：`Www/ts/MainWindow/BulkView.ts:1409`（`data-selected` 更新）

---

### T018 在 Tiefseeview 新增变换检测方法（PASS）

- **结论**：实现了检测旋转/镜像/缩放变换的 `hasTransformations()` 方法。
- **证据**：`Www/ts/Tiefseeview.ts:3318`（方法实现）。

---

### T019 在 Tiefseeview 新增带变换导出 API（PASS）

- **结论**：实现了导出带旋转、镜像、缩放变换的 Canvas Blob 的 `getTransformedCanvasBlob()` 方法。
- **证据**：`Www/ts/Tiefseeview.ts:3335`（方法实现）。

---

### T020 实现变换检测与保存确认逻辑（PASS）

- **结论**：实现了变换检测与保存确认的完整流程。
- **证据**：`Www/ts/MainWindow/Script.ts:1589`（`resolveCopySourcePath` 方法）、`1604`（变换检测）、`1606`（确认对话框）、`1623`（导出临时文件）。

---

### T021 集成复制到目录完整流程（PASS）

- **结论**：已集成所有组件完成复制到目录功能的完整流程。
- **证据**：`Www/ts/MainWindow/Script.ts:1532`（`copyToDirectory` 入口）、`1545`（源路径获取）、`1558`（目标目录验证）、`1569`（调用批量复制）。

---

### T022 边缘情况处理与测试（PASS）

- **结论**：已处理目标目录不存在、同名文件冲突等边缘情况。
- **证据**：`Www/ts/MainWindow/Script.ts:1558`（目录存在检查）、`1569`（根据配置创建目录）、`1691`（`resolveConflictPath` 处理三种策略）。

---

### T026 Bulk View：ESC 优先清空选择（PASS）

- **结论**：Bulk View 下 `Escape` 会先清空选择，若无选择再退出 Bulk View。
- **证据**：`Www/ts/MainWindow/Hotkey.ts:135`（判断与分支）、`Www/ts/MainWindow/Hotkey.ts:138`（`clearSelection()`）。

---

## 文档一致性问题

- `tasks.csv` 标注 `T018/T019` 为"未开始"的问题已解决，状态已更新为"已完成"。证据：`docs/specs/26011009-copy-to-directory/tasks.csv`。

---

## 建议的最小手动验证用例（聚焦本迭代已完成项）

1. **快捷键**：配置为 `Ctrl+Alt+D` 与 `F1` 分别验证可触发（普通模式 + Bulk View）。
2. **路径拼接**：目标目录分别以 `C:\\temp` 与 `C:\\temp\\` 测试复制结果路径是否正确。
3. **冲突策略**：同名文件存在时验证 `overwrite/skip/renameTimestamp` 三种策略。
4. **批量复制**：Bulk View 多选 3 个文件，验证成功/失败计数与 Toast 文案占位符替换是否正确。
