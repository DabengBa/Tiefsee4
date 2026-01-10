# TECHNICAL_APPROACH - 复制到目录（Copy To Directory）

> 对应 PRD：`docs/specs/26011009-copy-to-directory/prd.md`

## 0. 目标与约束（来自 PRD 的已确认口径）

- 快捷键范围：仅在 Tiefsee 窗口聚焦时生效（非全局系统热键）
- 快捷键形式：支持单键（`F1`）与组合键（`Ctrl+Alt+D`），并支持冲突检测
- 复制对象：
  - 普通模式：复制当前图片
  - Bulk View：支持多选，触发时批量复制
  - 若当前图片存在旋转/缩放等显示变更：先弹窗提示保存，确认后复制“保存后的内容”
  - 不需要复制视频帧
- 同名冲突默认策略：`renameTimestamp`（时间戳重命名）
- 目标目录：提供系统目录选择器 + 允许手动输入
- 反馈：成功 Toast 展示目标目录/最终文件名；失败 Toast 展示失败原因

## 1. 代码心智地图（现状入口与可复用能力）

### 1.1 WebView2/HostObject 注入
- `Tiefsee/WebWindow.cs`：`AddHostObjectToScript("WV_*", ...)`，JS 可直接 `await WV_File.Exists(...)`

### 1.2 设置存储
- `Www/ts/MainWindow/MainWindow.ts`：启动时读 `Setting.json` 并 `$.extend(true, _config.settings, userSetting)`
- `Www/ts/SettingWindow/SettingWindow.ts`：保存 `Setting.json`，并用 `WV_Window.RunJsOfParent` 推送 `applySetting`

### 1.3 快捷键（现状）
- `Www/ts/MainWindow/Hotkey.ts`：`window.addEventListener("keydown", ...)`，大量快捷键硬编码
- 现有可配置输入映射主要集中在鼠标脚本（`Www/ts/SettingWindow/SettingWindow.ts` 的 mouse 映射），键盘配置体系尚不统一

### 1.4 文件/目录能力（现状）
- TS 声明：`Www/ts/d/NetAPI.d.ts`
- C# 实现：
  - `Tiefsee/VW/WV_File.cs`：`Exists/Delete/Move/GetText/SetText/...`（缺少 Copy）
  - `Tiefsee/VW/WV_Directory.cs`：`Exists/CreateDirectory/...`（缺少选择目录对话框）

### 1.5 Bulk View（现状）
- `Www/ts/MainWindow/BulkView.ts`：当前是“点击进入单张浏览”的浏览模式，**没有多选状态/交互**

## 2. 总体设计（可维护性优先的模块边界）

为了避免在 `Hotkey.ts` / `ScriptCopy` / `BulkView.ts` 中堆叠分支，建议将功能拆成 4 个高内聚模块，并通过最小接口连接（SoC + DIP）：

1) `Shortcut`（纯逻辑）
- 职责：解析/规范化快捷键字符串、匹配 `KeyboardEvent`、冲突检测
- 输出：可测试的纯函数（`parse/normalize/match/isConflict`）

2) `CopyToDirectoryService`（业务编排）
- 职责：从“触发意图”到“复制结果”的完整流程编排（收集源路径 → 校验 → 生成目标路径 → 调用复制 → 汇总结果 → 反馈）
- 通过构造参数注入依赖（便于测试/替换）：
  - `IFileOps`：`exists/copy/ensureDir/...`（封装 `WV_File/WV_Directory`）
  - `ISelectionProvider`：`getPaths()`（普通模式 vs BulkView 多选）
  - `ITransformExport`：`needsSave/exportIfNeeded()`（旋转/缩放变更的检测与导出）
  - `INotifier`：`toast/confirm()`（Toast + MsgBox）

3) `BulkViewSelection`（UI 状态 + 交互）
- 职责：多选状态管理（Set<path>）、交互（Ctrl/Shift 点击）、渲染选中态（overlay/checkbox）
- 对外仅暴露最小接口（`getSelectedPathsOrFallbackCurrent`、`clearSelection`）

4) `TransformExport`（导出“保存后的内容”）
- 职责：检测当前图片是否存在“需要先保存”的变换；在用户确认后导出可复制的临时文件路径
- 注意：现有 `Tiefseeview.getCanvasBlob()` 返回的是**原始像素**（不含旋转/镜像/缩放），因此需要新增“带变换导出”的能力

## 3. 数据契约（Settings / Shortcut / Copy Result）

### 3.1 Setting.json（新增字段）
- 在 `Www/ts/Config.ts` 的默认 `settings` 增加：
  - `copyToDirectory.enabled: boolean`
  - `copyToDirectory.targetPath: string`
  - `copyToDirectory.shortcut: string`（如 `F1` / `Ctrl+Alt+D`）
  - `copyToDirectory.onConflict: "overwrite" | "renameTimestamp" | "skip"`
  - `copyToDirectory.createDirIfNotExists: boolean`
  - `copyToDirectory.requireSaveWhenTransformed: boolean`

### 3.2 快捷键字符串规范（可测试、可冲突检测）
- 规范化格式（用于存储与冲突检测）：`Ctrl+Alt+Shift+<Key>`
- `<Key>` 支持：
  - 功能键：`F1`~`F12`
  - 字母键：`A`~`Z`
  - 数字键：`0`~`9`
  - 其他按键按需扩展（例如 `Comma/Period`）
- 解析策略：
  - 输入兼容：允许大小写、允许空格（`ctrl + alt + d`）
  - 输出统一：固定顺序 `Ctrl+Alt+Shift+Key`

### 3.3 Copy Result（用于批量汇总反馈）
- 单项结果：`{ sourcePath, destPath, ok, reason? }`
- 批量汇总：`{ total, okCount, failedCount, firstError? }`

## 4. 关键流程（端到端）

### 4.1 触发入口（Hotkey.ts）
- 在 `Hotkey.ts` 的 keydown 处理里新增一条：
  - 前置条件：
    - `copyToDirectory.enabled === true`
    - 非输入焦点/非文本选择（复用 `Lib.isTextFocused()` / `Lib.isTxtSelect()`）
    - `Shortcut.match(e, settings.copyToDirectory.shortcut) === true`
  - 调用：`M.script.copy.copyToDirectory()`（或更清晰地 `M.copyToDirectory.run()`）

### 4.2 源路径选择（普通 vs Bulk View）
- 普通模式：`[M.fileLoad.getFilePath()]`
- Bulk View：
  - `selected.size > 0`：返回 selected paths
  - 否则：回退到“当前项”（需要在 BulkView 内定义并稳定：聚焦项/最后点击项/当前页中心项）

### 4.3 变换检测与“保存后复制”

#### 4.3.1 需要保存的判定（建议）
- 旋转：`tiefseeview.getDeg() % 360 !== 0`
- 镜像：`getMirrorHorizontal() || getMirrorVertica()`
- 缩放：`Math.abs(getZoomRatio() - 1) >= 阈值`（阈值建议 0.05）
- 剪裁：若启用了剪裁框且存在有效区域（若功能启用）

#### 4.3.2 导出实现选型（优先可维护性 + 复用）
选型 A（推荐）：在 `Www/ts/Tiefseeview.ts` 新增导出 API
- 新增 `getTransformedCanvasBlob(options)` / `getTransformedCanvasBase64(options)`
- 内部用 Canvas 2D：
  - 从原始像素 canvas 取源图
  - 按当前变换（旋转/镜像/缩放/剪裁）绘制到新 canvas
  - 输出 PNG（默认）或按需支持 JPEG/WebP
- 优点：变换状态在前端，闭环更清晰；不引入新的 C# 图像依赖
- 风险：大图导出可能占用内存（需限制并给出失败提示）

选型 B：新增 C# 导出接口（`WV_Image` 或 Web API）
- 优点：可在后端做更高性能/更低内存的处理
- 缺点：需要将前端变换状态完整传递到后端，且引入更多跨层契约与实现复杂度

#### 4.3.3 “保存”的落点（临时文件）
- 使用现有 `WV_File.Base64ToTempFile(base64, extension)`：
  - 将导出的 base64 保存到 `tempDirWebFile`
  - 返回临时文件路径作为复制源
- 命名建议：`{baseName}_saved_{yyyyMMdd_HHmmss_fff}.png`

### 4.4 目标目录解析与校验
- 目标目录为空：Toast `msg.targetPathNotSet`
- 目标目录为相对路径：按 PRD 定义选择基准（建议：当前浏览目录 `M.fileLoad.getDirPath()`）
- 不存在：
  - `createDirIfNotExists === true` → `WV_Directory.CreateDirectory`
  - 否则 Toast `msg.targetDirNotExists`
- 可写性检测：
  - 简化做法：直接尝试复制并捕获异常/错误信息（更贴近真实失败原因）
  - 若要提前检测：写入临时文件（需要新增 API 或复用 Copy 的失败信息）

### 4.5 同名冲突处理（默认时间戳）
- `renameTimestamp`：
  1) `baseName_yyyyMMdd_HHmmss_fff.ext`
  2) 若仍冲突：追加 `_1/_2...`
- `overwrite`：覆盖
- `skip`：跳过并记录结果（批量汇总时计入 failed/skip）

### 4.6 复制执行与反馈（单个/批量）
- 执行策略：默认串行（最稳定；网络路径更可控）
- 单个成功：Toast 显示 `{fileName}\n{dirPath}`
- 批量成功：Toast 显示 `{ok}/{total}\n{dirPath}`
- 失败：Toast 显示失败原因（优先使用 C# 返回的错误字符串，必要时再映射为更友好的文案）

## 5. 跨层接口改动（C# / TS 声明）

### 5.1 `WV_File.Copy`（新增）
- 位置：`Tiefsee/VW/WV_File.cs`
- TS 声明：`Www/ts/d/NetAPI.d.ts`
- 建议签名：
  - `Copy(sourcePath: string, destPath: string, overwrite: boolean): string`
  - 返回值：空字符串表示成功，否则返回可展示/可记录的错误信息

### 5.2 `WV_Directory.OpenFolderDialog`（新增）
- 位置：`Tiefsee/VW/WV_Directory.cs`
- TS 声明：`Www/ts/d/NetAPI.d.ts`
- 建议签名：
  - `OpenFolderDialog(title: string, initialPath?: string): string`
- 实现建议：
  - 优先使用 WinForms 内建 `FolderBrowserDialog`（不引入新依赖；但 UI 相对传统）
  - 若未来要现代体验，再评估 `IFileDialog`/额外库（作为后续优化，不阻塞本迭代）

## 6. Bulk View 多选（实现路径）

### 6.1 状态结构
- `selectedPaths: Set<string>`
- `lastAnchorPath?: string`（用于 Shift 区间选择）

### 6.2 交互规则（建议，便于实现且符合用户预期）
- `Ctrl+Click`：toggle
- `Shift+Click`：从 `lastAnchorPath` 到当前项做区间选择（需要 `_arFile` 的可索引序）
- Click（无修饰键）：
  - 若当前处于“多选模式”：清空选择并仅选中当前项（或直接进入单张浏览，需产品确认）
  - 为避免破坏现有“点击进入单张”行为，建议新增一个显式选择入口（例如：顶部“选择”按钮/长按进入选择模式）——若本迭代必须纯键鼠实现，则在 PRD 再明确取舍

### 6.3 对外接口
- `getSelectedPathsOrFallbackCurrent(): string[]`
- `clearSelection(): void`

## 7. 可测试性落地（不依赖 UI/Host 的核心逻辑）

建议把以下逻辑做成纯函数，并用 `bun test` 覆盖关键路径（不引入第三方测试框架）：

- `Shortcut`：
  - `normalizeShortcut("ctrl + alt + d") -> "Ctrl+Alt+D"`
  - `match(event, "Ctrl+Alt+D")`
  - `isConflict(shortcut, reservedShortcuts, userShortcuts)`
- `renameTimestamp`：
  - 时间戳格式正确、冲突递增 `_1/_2` 规则正确
- `resolveTargetPath`：
  - 绝对/相对/UNC/空字符串等边界

集成测试（可选）：
- 在可控临时目录下跑一次 copy（需要允许在测试环境调用 `WV_*`；若不方便则只做单元测试）

## 8. 交付拆分（低风险、可回滚）

1) Host API 补齐（`WV_File.Copy`、`WV_Directory.OpenFolderDialog`）+ TS 声明同步
2) Setting schema + SettingWindow UI（含冲突检测与目录选择）
3) Shortcut 模块接入 `Hotkey.ts`（只新增一条分支，避免大范围改动）
4) CopyToDirectoryService（先支持“复制原始文件”闭环）
5) Bulk View 多选 + 批量复制
6) TransformExport（新增导出 API + 保存确认 + 复制导出结果）

