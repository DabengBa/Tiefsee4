# 开发记录（Dev Log）- 26011009 Copy To Directory

日期：2026-01-10  
范围：Tiefsee4「复制到目录」功能（Copy To Directory）

## 1. 背景与目标

为 Tiefsee 图片浏览器新增「复制到目录」能力：用户配置目标目录与快捷键，在浏览图片或 Bulk View 多选时一键复制到指定目录，用于“挑选-收集-归档”的高频流程。

核心诉求：
- 触发后 **必须落盘**（不是剪贴板），并给出明确成功/失败反馈（Toast）。
- 支持普通模式单张、Bulk View 多选批量复制。
- 支持同名冲突策略：覆盖 / 时间戳重命名（默认） / 跳过。
- 若当前图像存在“需要保存的变换”（旋转/镜像/缩放等），可按配置提示“先保存再复制”。

## 2. 配置结构（Setting.json）

配置默认值定义在 `Www/ts/Config.ts` 的 `settings.copyToDirectory`：
- `enabled: boolean`：是否启用
- `targetPath: string`：目标目录
- `shortcut: string`：快捷键（支持单键如 `F1` / 组合键如 `Ctrl+Alt+D`）
- `onConflict: "overwrite" | "renameTimestamp" | "skip"`
- `createDirIfNotExists: boolean`
- `requireSaveWhenTransformed: boolean`

读取/应用：
- `Www/ts/MainWindow/MainWindow.ts`：启动时读取 `Setting.json` 并合并进 `_config.settings`，并在设置窗口保存后通过 `applySetting` 生效。

## 3. UI 入口（SettingWindow）

设置入口已加入设置窗口「进阶设置」页的分组「复制到目录」，包含：
- 启用开关
- 目标目录（可输入/可浏览选择）
- 快捷键（可输入，规范化存储）
- 同名冲突策略
- 目标目录不存在自动创建
- 图片有变换时是否要求先保存

相关文件：
- `Www/ejs/SettingWindow/SettingWindow.ejs`
- `Www/ts/SettingWindow/SettingWindow.ts`
- `Www/lang/langData.js`（`sw.copyToDirectory.*` 与 `msg.copyToDir*`）

## 4. 端到端流程（实际实现）

### 4.1 触发入口（键盘）
- `Www/ts/MainWindow/Hotkey.ts`：在 `window.addEventListener("keydown", ...)` 内处理
- 前置条件：功能启用 + 非输入框焦点 + 非文本选择
- 触发：`Shortcut.match(settings.copyToDirectory.shortcut, e)` 命中则 `await M.script.copy.copyToDirectory()`

### 4.2 快捷键解析与匹配
- `Www/ts/Shortcut.ts`：`parse/normalize/match/isConflict`
- 关键点：支持 `F1~F12`、统一特殊键大小写（Escape/Space/Enter...），确保 `parse/normalize/match` 一致。

### 4.3 复制主流程（ScriptCopy）
入口：`Www/ts/MainWindow/Script.ts` → `class ScriptCopy` → `copyToDirectory()`

步骤：
1) 读取配置与校验（启用/目标目录）
2) 采集源路径：
   - Bulk View：`M.bulkView.getSelectedPathsOrFallbackCurrent()`
   - 普通模式：优先 `M.fileLoad.getFilePath()`
3) 处理“源路径不可用/不存在”的回退：
   - 普通模式下若 `filePath` 为空或文件不存在，则导出当前画面为临时 PNG，再作为复制源继续（保证“触发后必有结果”）
4) 目标目录校验/创建：
   - `WV_Directory.Exists/CreateDirectory`
5) 单个/批量复制：
   - 构造目标路径：`Lib.combine([targetDirPath, fileName])`
   - 冲突处理：`overwrite/skip/renameTimestamp`
   - 执行复制：`WV_File.Copy(source, dest, overwrite)`
   - 复制成功后额外校验：`WV_File.Exists(dest)`，避免“Copy 返回成功但未落盘”的黑洞
6) Toast 反馈：
   - 单个：显示最终文件名 + 目标目录
   - 批量：显示 `{success}/{total}` + 目标目录；若有失败附带首个错误原因

### 4.4 “先保存再复制”（变换导出）
- `Www/ts/Tiefseeview.ts`：
  - `hasTransformations()`：判断是否存在需要保存的变换
  - `getTransformedCanvasBlob()`：按当前旋转/镜像/缩放导出 blob
- `Www/ts/MainWindow/Script.ts`：
  - `resolveCopySourcePath()`：当检测到变换且 `requireSaveWhenTransformed=true` 时，弹出确认框，确认后导出并写入临时文件，再复制临时文件

注意：为避免“随窗口缩放”导致每次都被判定为变换，`hasTransformations()` 已排除此类 zoom 变化。

## 5. 跨层接口（C# HostObject）

- `Tiefsee/VW/WV_File.cs`：新增 `Copy(sourcePath, destPath, overwrite): string`（空字符串表示成功，否则返回错误信息）
- `Tiefsee/VW/WV_Directory.cs`：新增 `OpenFolderDialog(title, initialPath): string`
- `Www/ts/d/NetAPI.d.ts`：同步以上 TS 声明

## 6. 关键修复点（按用户反馈驱动）

1) 快捷键不触发 / 只在某些模式生效  
   - 修复 `Shortcut.match` 参数顺序；并确保判断在 Bulk View 分支 `return` 之前。

2) 快捷键解析缺陷  
   - 补齐 `F1~F12`，统一特殊键大小写，保证匹配稳定。

3) Toast 占位符与失败原因展示  
   - 占位符与文案 `{success}/{total}/{dir}/{error}` 对齐；失败展示 `WV_File.Copy` 返回原因。

4) 目标路径拼接风险  
   - 全部使用 `Lib.combine` 拼接，避免末尾分隔符不确定。

5) “先保存再复制”频繁弹窗  
   - `hasTransformations()` 排除“随窗口缩放”造成的缩放变化。

6) “触发了但没复制/没提示”  
   - 普通模式下对“无本地路径/源不存在”增加回退：导出当前画面为临时 PNG 再复制。
   - 复制后校验目标文件存在，避免静默失败。

7) `renameTimestamp` 未按预期重命名  
   - 修复时间戳重命名时的路径拼接：从字符串相加改为 `Lib.combine([dir, fileName])`，保证目标落在目标目录下。

## 7. 最小手动验证用例

- 快捷键：单键（如 `1`/`F1`）与组合键（如 `Ctrl+Alt+D`）在普通模式与 Bulk View 下均可触发
- 目标目录：
  - `C:\\temp` 与 `C:\\temp\\` 两种尾部形态都能正确落盘
  - 目录不存在时按配置自动创建
- 冲突策略：`overwrite/skip/renameTimestamp` 均符合预期
- 变换导出：
  - 旋转/镜像/非跟随窗口的缩放触发“先保存再复制”
  - 跟随窗口缩放不应触发保存提示
- 批量复制：Bulk View 多选 3 个文件，Toast 计数与失败原因展示正确

## 8. Dev 启动方式（Windows）

- 前端（Www）监控构建：`Www` 目录运行 `gulp watch`（本项目用 `bun` 启动）
- 桌面端：运行 `Output/TiefseeCore.exe`

## 9. 经验教训（精简）

详细版保存在仓库规范路径：`docs/lessons_learned/2026-01-10-copy-to-directory.md`

要点：
- “源路径”不等于“可复制的真实本地文件”：必须设计回退（导出临时文件）并保证失败可见。
- 路径拼接禁止字符串相加：统一 `Lib.combine/Path.Combine`，否则同名重命名/落盘位置会出现隐蔽错误。
- 跨层 IO（HostObject）要做后置条件校验（Copy 后 Exists），避免黑洞。

